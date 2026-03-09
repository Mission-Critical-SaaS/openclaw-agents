/**
 * OpenClaw Agents — CDK Stack Tests
 *
 * Validates the CloudFormation template synthesized by the CDK stack
 * to ensure all infrastructure components are correctly defined.
 */
import * as cdk from 'aws-cdk-lib';
import { Template, Match } from 'aws-cdk-lib/assertions';
import { OpenclawAgentsStack } from '../lib/openclaw-agents-stack';

let template: Template;

beforeAll(() => {
  const app = new cdk.App();
  const stack = new OpenclawAgentsStack(app, 'TestStack', {
    env: { account: '122015479852', region: 'us-east-1' },
    instanceType: 't3.xlarge',
    diskSizeGb: 50,
    alertEmail: 'test@example.com',
    githubOrg: 'LMNTL-AI',
    githubRepo: 'openclaw-agents',
  });
  template = Template.fromStack(stack);
});

// ─── VPC ───────────────────────────────────────────────
describe('VPC', () => {
  test('creates a VPC', () => {
    template.resourceCountIs('AWS::EC2::VPC', 1);
  });

  test('has public subnets only (no NAT gateway)', () => {
    template.resourceCountIs('AWS::EC2::NatGateway', 0);
  });
});

// ─── Security Group ────────────────────────────────────
describe('Security Group', () => {
  test('creates a security group with outbound-only description', () => {
    template.hasResourceProperties('AWS::EC2::SecurityGroup', {
      GroupDescription: Match.stringLikeRegexp('outbound only'),
    });
  });

  test('has no inbound rules (ingress)', () => {
    // The SG should not have any SecurityGroupIngress resources
    template.resourceCountIs('AWS::EC2::SecurityGroupIngress', 0);
  });
});

// ─── EC2 Instance ──────────────────────────────────────
describe('EC2 Instance', () => {
  test('creates exactly one EC2 instance', () => {
    template.resourceCountIs('AWS::EC2::Instance', 1);
  });

  test('uses the specified instance type (t3.xlarge)', () => {
    template.hasResourceProperties('AWS::EC2::Instance', {
      InstanceType: 't3.xlarge',
    });
  });

  test('has a 50GB gp3 root volume', () => {
    template.hasResourceProperties('AWS::EC2::Instance', {
      BlockDeviceMappings: Match.arrayWith([
        Match.objectLike({
          DeviceName: '/dev/sda1',
          Ebs: Match.objectLike({
            VolumeSize: 50,
            VolumeType: 'gp3',
            Encrypted: true,
          }),
        }),
      ]),
    });
  });

  test('has Name tag', () => {
    template.hasResourceProperties('AWS::EC2::Instance', {
      Tags: Match.arrayWith([
        Match.objectLike({ Key: 'Name', Value: 'openclaw-agents' }),
      ]),
    });
  });
});

// ─── IAM ───────────────────────────────────────────────
describe('IAM', () => {
  test('creates an instance role with SSM managed policy', () => {
    template.hasResourceProperties('AWS::IAM::Role', {
      ManagedPolicyArns: Match.arrayWith([
        Match.objectLike({
          'Fn::Join': Match.arrayWith([
            Match.arrayWith([
              Match.stringLikeRegexp('AmazonSSMManagedInstanceCore'),
            ]),
          ]),
        }),
      ]),
    });
  });

  test('grants secretsmanager:GetSecretValue to instance role', () => {
    template.hasResourceProperties('AWS::IAM::Policy', {
      PolicyDocument: Match.objectLike({
        Statement: Match.arrayWith([
          Match.objectLike({
            Action: 'secretsmanager:GetSecretValue',
            Effect: 'Allow',
          }),
        ]),
      }),
    });
  });
});

// ─── GitHub OIDC Deploy Role ───────────────────────────
describe('GitHub OIDC Deploy', () => {
  test('creates a GitHub OIDC provider', () => {
    template.resourceCountIs('Custom::AWSCDKOpenIdConnectProvider', 1);
  });

  test('creates a deploy role named openclaw-github-deploy', () => {
    template.hasResourceProperties('AWS::IAM::Role', {
      RoleName: 'openclaw-github-deploy',
    });
  });

  test('deploy role has SSM SendCommand scoped to instance', () => {
    template.hasResourceProperties('AWS::IAM::Policy', {
      PolicyDocument: Match.objectLike({
        Statement: Match.arrayWith([
          Match.objectLike({
            Action: 'ssm:SendCommand',
            Effect: 'Allow',
          }),
        ]),
      }),
    });
  });

  test('deploy role has SSM GetCommandInvocation on wildcard resource', () => {
    template.hasResourceProperties('AWS::IAM::Policy', {
      PolicyDocument: Match.objectLike({
        Statement: Match.arrayWith([
          Match.objectLike({
            Action: 'ssm:GetCommandInvocation',
            Effect: 'Allow',
            Resource: '*',
          }),
        ]),
      }),
    });
  });
});

// ─── CloudWatch ────────────────────────────────────────
describe('CloudWatch', () => {
  test('creates a log group', () => {
    template.hasResourceProperties('AWS::Logs::LogGroup', {
      LogGroupName: '/openclaw/agents',
      RetentionInDays: 14,
    });
  });

  test('creates CPU utilization alarm', () => {
    template.hasResourceProperties('AWS::CloudWatch::Alarm', {
      MetricName: 'CPUUtilization',
      Threshold: 80,
      EvaluationPeriods: 3,
    });
  });

  test('creates status check alarm', () => {
    template.hasResourceProperties('AWS::CloudWatch::Alarm', {
      MetricName: 'StatusCheckFailed',
      Threshold: 1,
    });
  });
});

// ─── SNS Alerts ────────────────────────────────────────
describe('SNS Alerts', () => {
  test('creates an SNS topic for alerts', () => {
    template.resourceCountIs('AWS::SNS::Topic', 1);
  });

  test('subscribes the alert email', () => {
    template.hasResourceProperties('AWS::SNS::Subscription', {
      Protocol: 'email',
      Endpoint: 'test@example.com',
    });
  });
});

// ─── Outputs ───────────────────────────────────────────
describe('Stack Outputs', () => {
  test('outputs InstanceId', () => {
    template.hasOutput('InstanceId', {});
  });

  test('outputs DeployRoleArn', () => {
    template.hasOutput('DeployRoleArn', {});
  });

  test('outputs SSMConnect', () => {
    template.hasOutput('SSMConnect', {});
  });
});
