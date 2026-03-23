import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as cloudwatch_actions from 'aws-cdk-lib/aws-cloudwatch-actions';
import { Construct } from 'constructs';
import * as fs from 'fs';
import * as path from 'path';

export interface OpenClawAgentsStackProps extends cdk.StackProps {
  /** EC2 instance type (default: t3.xlarge) */
  instanceType?: string;
  /** Root EBS volume size in GB (default: 50) */
  diskSizeGb?: number;
  /** Alert email for CloudWatch alarms */
  alertEmail?: string;
  /** GitHub organization for OIDC deploy role */
  githubOrg?: string;
  /** GitHub repository name for OIDC deploy role */
  githubRepo?: string;
}

export class OpenclawAgentsStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: OpenClawAgentsStackProps) {
    super(scope, id, props);

    const instanceType = props?.instanceType ?? 't3.xlarge';
    const diskSizeGb = props?.diskSizeGb ?? 50;
    const alertEmail = props?.alertEmail ?? 'david@lmntl.ai';
    const githubOrg = props?.githubOrg ?? 'LMNTL-AI';
    const githubRepo = props?.githubRepo ?? 'openclaw-agents';

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
    // IAM Role — EC2 instance profile
    // ──────────────────────────────────────────────
    const role = new iam.Role(this, 'OpenClawRole', {
      assumedBy: new iam.ServicePrincipal('ec2.amazonaws.com'),
      description: 'OpenClaw agent host',
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonSSMManagedInstanceCore'),
        iam.ManagedPolicy.fromAwsManagedPolicyName('CloudWatchAgentServerPolicy'),
      ],
    });

    // Grant EC2 read access to the secret
    role.addToPolicy(new iam.PolicyStatement({
      sid: 'SecretsRead',
      actions: ['secretsmanager:GetSecretValue'],
      resources: [
        `arn:aws:secretsmanager:${this.region}:${this.account}:secret:openclaw/agents-*`,
      ],
    }));

    // ──────────────────────────────────────────────
    // CloudWatch Logs (Tier-Specific)
    // ──────────────────────────────────────────────
    // Admin tier log group
    const adminLogGroup = new logs.LogGroup(this, 'OpenClawAdminLogs', {
      logGroupName: '/openclaw/agents/admin',
      retention: logs.RetentionDays.TWO_WEEKS,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // Standard tier log group
    const standardLogGroup = new logs.LogGroup(this, 'OpenClawStandardLogs', {
      logGroupName: '/openclaw/agents/standard',
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
    // EC2 Instance — Ubuntu 22.04 LTS
    // ──────────────────────────────────────────────
    const instance = new ec2.Instance(this, 'OpenClawHost', {
      vpc,
      instanceType: new ec2.InstanceType(instanceType),
      machineImage: ec2.MachineImage.fromSsmParameter(
        '/aws/service/canonical/ubuntu/server/22.04/stable/current/amd64/hvm/ebs-gp2/ami-id',
        { os: ec2.OperatingSystemType.LINUX }
      ),
      securityGroup: sg,
      role,
      userData,
      vpcSubnets: { subnetType: ec2.SubnetType.PUBLIC },
      blockDevices: [
        {
          deviceName: '/dev/sda1',
          volume: ec2.BlockDeviceVolume.ebs(diskSizeGb, {
            volumeType: ec2.EbsDeviceVolumeType.GP3,
            encrypted: true,
          }),
        },
      ],
    });

    cdk.Tags.of(instance).add('Name', 'openclaw-agents');
    cdk.Tags.of(instance).add('Project', 'openclaw');
    cdk.Tags.of(instance).add('Environment', 'production');

    // ──────────────────────────────────────────────
    // GitHub OIDC Provider + Deploy Role
    // Allows GitHub Actions to deploy via SSM
    // ──────────────────────────────────────────────
    const oidcProvider = new iam.OpenIdConnectProvider(this, 'GitHubOidc', {
      url: 'https://token.actions.githubusercontent.com',
      clientIds: ['sts.amazonaws.com'],
    });

    const deployRole = new iam.Role(this, 'GitHubDeployRole', {
      roleName: 'openclaw-github-deploy',
      assumedBy: new iam.WebIdentityPrincipal(
        oidcProvider.openIdConnectProviderArn,
        {
          StringEquals: {
            'token.actions.githubusercontent.com:aud': 'sts.amazonaws.com',
          },
          StringLike: {
            'token.actions.githubusercontent.com:sub': `repo:${githubOrg}/${githubRepo}:*`,
          },
        }
      ),
      description: 'GitHub Actions deploy role for OpenClaw agents',
      maxSessionDuration: cdk.Duration.hours(1),
    });

    // SSM SendCommand — scoped to this instance + RunShellScript doc
    deployRole.addToPolicy(new iam.PolicyStatement({
      sid: 'SSMSendCommand',
      actions: ['ssm:SendCommand'],
      resources: [
        `arn:aws:ssm:${this.region}::document/AWS-RunShellScript`,
        `arn:aws:ec2:${this.region}:${this.account}:instance/${instance.instanceId}`,
      ],
    }));

    // SSM GetCommandInvocation — does NOT support resource-level permissions
    deployRole.addToPolicy(new iam.PolicyStatement({
      sid: 'SSMGetInvocation',
      actions: ['ssm:GetCommandInvocation'],
      resources: ['*'],
    }));

    // Secrets read — for Slack failure notifications in deploy pipeline
    deployRole.addToPolicy(new iam.PolicyStatement({
      sid: 'SecretsRead',
      actions: ['secretsmanager:GetSecretValue'],
      resources: [
        `arn:aws:secretsmanager:${this.region}:${this.account}:secret:openclaw/agents-*`,
      ],
    }));

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
    // Outputs
    // ──────────────────────────────────────────────
    new cdk.CfnOutput(this, 'InstanceId', {
      value: instance.instanceId,
      description: 'EC2 Instance ID — update .github/workflows/deploy.yml and test/e2e/e2e.test.ts',
    });

    new cdk.CfnOutput(this, 'SecurityGroupId', {
      value: sg.securityGroupId,
    });

    new cdk.CfnOutput(this, 'AdminLogGroup', {
      value: adminLogGroup.logGroupName,
    });

    new cdk.CfnOutput(this, 'StandardLogGroup', {
      value: standardLogGroup.logGroupName,
    });

    new cdk.CfnOutput(this, 'DeployRoleArn', {
      value: deployRole.roleArn,
      description: 'Set as AWS_DEPLOY_ROLE_ARN secret in GitHub repo settings',
    });

    new cdk.CfnOutput(this, 'SSMConnect', {
      value: `aws ssm start-session --target ${instance.instanceId}`,
      description: 'Connect via SSM Session Manager',
    });
  }
}
