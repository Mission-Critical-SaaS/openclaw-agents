import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as cloudwatch_actions from 'aws-cdk-lib/aws-cloudwatch-actions';
import { Construct } from 'constructs';
import * as fs from 'fs';
import * as path from 'path';

export interface OpenClawAgentsStackProps extends cdk.StackProps {
  /** EC2 instance type */
  instanceType?: string;
  /** Alert email for CloudWatch alarms */
  alertEmail?: string;
}

export class OpenclawAgentsStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: OpenClawAgentsStackProps) {
    super(scope, id, props);

    const instanceType = props?.instanceType ?? 't3.small';
    const alertEmail = props?.alertEmail ?? 'david@lmntl.ai';

    // ──────────────────────────────────────────────
    // VPC — single public subnet to keep costs down
    // ──────────────────────────────────────────────
    const vpc = new ec2.Vpc(this, 'OpenClawVpc', {
      maxAzs: 2,
      natGateways: 0,
      subnetConfiguration: [
        {
          name: 'Public',
          subnetType: ec2.SubnetType.PUBLIC,
          cidrMask: 24,
        },
      ],
    });

    // ──────────────────────────────────────────────
    // Security Group — outbound only
    // Slack Socket Mode + Anthropic API = outbound WebSocket/HTTPS
    // No inbound ports needed at all
    // ──────────────────────────────────────────────
    const sg = new ec2.SecurityGroup(this, 'OpenClawSG', {
      vpc,
      description: 'OpenClaw agents - outbound only for Slack Socket Mode and Anthropic API',
      allowAllOutbound: true,
    });

    // ──────────────────────────────────────────────
    // IAM Role
    // ──────────────────────────────────────────────
    const role = new iam.Role(this, 'OpenClawRole', {
      assumedBy: new iam.ServicePrincipal('ec2.amazonaws.com'),
      description: 'OpenClaw agent host - LMNTL AI Agents account',
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonSSMManagedInstanceCore'),
        iam.ManagedPolicy.fromAwsManagedPolicyName('CloudWatchAgentServerPolicy'),
      ],
    });

    // ──────────────────────────────────────────────
    // Secrets Manager — single JSON secret for all credentials
    // Populated out-of-band via CLI before first deploy
    // ──────────────────────────────────────────────
    const secret = secretsmanager.Secret.fromSecretNameV2(
      this, 'OpenClawSecret', 'openclaw/agents'
    );

    // Grant EC2 read access to the secret
    role.addToPolicy(new iam.PolicyStatement({
      actions: ['secretsmanager:GetSecretValue'],
      resources: [
        `arn:aws:secretsmanager:${this.region}:${this.account}:secret:openclaw/agents-*`,
      ],
    }));

    // ──────────────────────────────────────────────
    // CloudWatch Logs
    // ──────────────────────────────────────────────
    const logGroup = new logs.LogGroup(this, 'OpenClawLogs', {
      logGroupName: '/openclaw/agents',
      retention: logs.RetentionDays.TWO_WEEKS,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // ──────────────────────────────────────────────
    // User Data — reads scripts/bootstrap.sh
    // ──────────────────────────────────────────────
    const userData = ec2.UserData.forLinux();
    const bootstrapScript = fs.readFileSync(
      path.join(__dirname, '..', 'scripts', 'bootstrap.sh'),
      'utf-8'
    );
    userData.addCommands(bootstrapScript);

    // ──────────────────────────────────────────────
    // EC2 Instance
    // ──────────────────────────────────────────────
    const instance = new ec2.Instance(this, 'OpenClawHost', {
      vpc,
      instanceType: new ec2.InstanceType(instanceType),
      machineImage: ec2.MachineImage.latestAmazonLinux2023(),
      securityGroup: sg,
      role,
      userData,
      vpcSubnets: { subnetType: ec2.SubnetType.PUBLIC },
      blockDevices: [
        {
          deviceName: '/dev/xvda',
          volume: ec2.BlockDeviceVolume.ebs(30, {
            volumeType: ec2.EbsDeviceVolumeType.GP3,
            encrypted: true,
          }),
        },
      ],
    });

    cdk.Tags.of(instance).add('Name', 'openclaw-agents');
    cdk.Tags.of(instance).add('Project', 'openclaw');
    cdk.Tags.of(instance).add('Environment', 'production');
    cdk.Tags.of(instance).add('Account', 'lmntl-ai-agents');

    // ──────────────────────────────────────────────
    // Monitoring & Alerts
    // ──────────────────────────────────────────────
    const alarmTopic = new sns.Topic(this, 'OpenClawAlarms', {
      displayName: 'OpenClaw Agent Alerts',
    });

    new sns.Subscription(this, 'AlarmEmail', {
      topic: alarmTopic,
      protocol: sns.SubscriptionProtocol.EMAIL,
      endpoint: alertEmail,
    });

    // High CPU
    new cloudwatch.Alarm(this, 'HighCpuAlarm', {
      metric: new cloudwatch.Metric({
        namespace: 'AWS/EC2',
        metricName: 'CPUUtilization',
        dimensionsMap: { InstanceId: instance.instanceId },
        statistic: 'Average',
        period: cdk.Duration.minutes(5),
      }),
      threshold: 80,
      evaluationPeriods: 3,
      alarmDescription: 'OpenClaw host CPU > 80% for 15 min',
    }).addAlarmAction(new cloudwatch_actions.SnsAction(alarmTopic));

    // Instance health
    new cloudwatch.Alarm(this, 'StatusCheckAlarm', {
      metric: new cloudwatch.Metric({
        namespace: 'AWS/EC2',
        metricName: 'StatusCheckFailed',
        dimensionsMap: { InstanceId: instance.instanceId },
        statistic: 'Maximum',
        period: cdk.Duration.minutes(1),
      }),
      threshold: 1,
      evaluationPeriods: 2,
      alarmDescription: 'OpenClaw host failed status check',
    }).addAlarmAction(new cloudwatch_actions.SnsAction(alarmTopic));

    // ──────────────────────────────────────────────
    // GitHub Actions OIDC — keyless deploys
    // ──────────────────────────────────────────────
    const ghOidcProvider = new iam.OpenIdConnectProvider(this, 'GitHubOIDC', {
      url: 'https://token.actions.githubusercontent.com',
      clientIds: ['sts.amazonaws.com'],
      thumbprints: ['ffffffffffffffffffffffffffffffffffffffff'], // GitHub rotates; AWS ignores for known providers
    });

    const ghDeployRole = new iam.Role(this, 'GitHubActionsDeployRole', {
      roleName: 'openclaw-github-actions-deploy',
      assumedBy: new iam.FederatedPrincipal(
        ghOidcProvider.openIdConnectProviderArn,
        {
          StringEquals: {
            'token.actions.githubusercontent.com:aud': 'sts.amazonaws.com',
          },
          StringLike: {
            'token.actions.githubusercontent.com:sub':
              'repo:Mission-Critical-SaaS/openclaw-agents:*',
          },
        },
        'sts:AssumeRoleWithWebIdentity'
      ),
      description: 'GitHub Actions OIDC role for deploying OpenClaw agents',
      maxSessionDuration: cdk.Duration.hours(1),
    });

    // SSM permissions for deploy commands
    ghDeployRole.addToPolicy(new iam.PolicyStatement({
      sid: 'SSMRunCommand',
      actions: [
        'ssm:SendCommand',
        'ssm:GetCommandInvocation',
      ],
      resources: [
        `arn:aws:ssm:${this.region}:${this.account}:document/AWS-RunShellScript`,
        `arn:aws:ec2:${this.region}:${this.account}:instance/${instance.instanceId}`,
      ],
    }));

    // SSM waiter needs DescribeInstanceInformation
    ghDeployRole.addToPolicy(new iam.PolicyStatement({
      sid: 'SSMDescribe',
      actions: [
        'ssm:DescribeInstanceInformation',
        'ssm:ListCommandInvocations',
      ],
      resources: ['*'],
    }));

    // EC2 describe for health checks
    ghDeployRole.addToPolicy(new iam.PolicyStatement({
      sid: 'EC2Describe',
      actions: [
        'ec2:DescribeInstances',
        'ec2:DescribeInstanceStatus',
      ],
      resources: ['*'],
    }));

    // ──────────────────────────────────────────────
    // Outputs
    // ──────────────────────────────────────────────
    new cdk.CfnOutput(this, 'InstanceId', {
      value: instance.instanceId,
      description: 'EC2 Instance ID',
    });

    new cdk.CfnOutput(this, 'PublicIp', {
      value: instance.instancePublicIp,
      description: 'Public IP (no inbound ports open)',
    });

    new cdk.CfnOutput(this, 'LogGroup', {
      value: logGroup.logGroupName,
    });

    new cdk.CfnOutput(this, 'SSMConnect', {
      value: `aws ssm start-session --target ${instance.instanceId}`,
      description: 'Connect via SSM Session Manager',
    });

    new cdk.CfnOutput(this, 'GitHubActionsRoleArn', {
      value: ghDeployRole.roleArn,
      description: 'Set this as AWS_DEPLOY_ROLE_ARN in GitHub repo variables',
    });
  }
}
