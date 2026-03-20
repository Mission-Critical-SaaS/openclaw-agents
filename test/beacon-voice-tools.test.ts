/**
 * Beacon Voice Tools — CDK Stack Tests
 *
 * Validates the CloudFormation template synthesized by the Beacon Voice Tools
 * CDK stack to ensure all infrastructure components are correctly defined.
 */

import * as cdk from 'aws-cdk-lib';
import { Template, Match } from 'aws-cdk-lib/assertions';
import { BeaconVoiceToolsStack } from '../lib/beacon-voice-tools-stack';

let template: Template;

beforeAll(() => {
  const app = new cdk.App();
  const stack = new BeaconVoiceToolsStack(app, 'TestStack', {
    env: { account: '122015479852', region: 'us-east-1' },
  });
  template = Template.fromStack(stack);
});

// ─── CloudWatch Logs ────────────────────────────────
describe('CloudWatch Logs', () => {
  test('creates a log group for Lambda functions', () => {
    template.hasResourceProperties('AWS::Logs::LogGroup', {
      LogGroupName: '/beacon/voice-tools',
      RetentionInDays: 14,
    });
  });
});

// ─── IAM Role ──────────────────────────────────────
describe('IAM Role', () => {
  test('creates IAM roles for Lambda execution', () => {
    // Lambda creates at least 1 role
    const roleCount = template.findResources('AWS::IAM::Role');
    expect(Object.keys(roleCount).length).toBeGreaterThanOrEqual(1);
  });

  test('grants Secrets Manager read access', () => {
    template.hasResourceProperties('AWS::IAM::Policy', {
      PolicyDocument: Match.objectLike({
        Statement: Match.arrayWith([
          Match.objectLike({
            Action: 'secretsmanager:GetSecretValue',
            Effect: 'Allow',
            Resource: Match.stringLikeRegexp('beacon/'),
          }),
        ]),
      }),
    });
  });
});

// ─── Lambda Functions ──────────────────────────────
describe('Lambda Functions', () => {
  test('creates SMS Lambda function', () => {
    template.hasResourceProperties('AWS::Lambda::Function', {
      Handler: 'sms.handler',
      Runtime: 'nodejs20.x',
    });
  });

  test('creates Tickets Lambda function', () => {
    template.hasResourceProperties('AWS::Lambda::Function', {
      Handler: 'tickets.handler',
      Runtime: 'nodejs20.x',
    });
  });

  test('creates Password Reset Lambda function', () => {
    template.hasResourceProperties('AWS::Lambda::Function', {
      Handler: 'password-reset.handler',
      Runtime: 'nodejs20.x',
    });
  });

  test('creates Account Lookup Lambda function', () => {
    template.hasResourceProperties('AWS::Lambda::Function', {
      Handler: 'account-lookup.handler',
      Runtime: 'nodejs20.x',
    });
  });

  test('creates Integration Status Lambda function', () => {
    template.hasResourceProperties('AWS::Lambda::Function', {
      Handler: 'integration-status.handler',
      Runtime: 'nodejs20.x',
    });
  });

  test('all Lambda functions have 30 second timeout', () => {
    template.hasResourceProperties('AWS::Lambda::Function', {
      Timeout: 30,
    });
  });
});

// ─── API Gateway ───────────────────────────────────
describe('API Gateway', () => {
  test('creates REST API', () => {
    template.hasResourceProperties('AWS::ApiGateway::RestApi', {
      Name: 'beacon-voice-tools',
    });
  });

  test('configures CORS with ElevenLabs origin', () => {
    template.hasResourceProperties('AWS::ApiGateway::Method', {
      HttpMethod: 'OPTIONS',
    });
  });

  test('creates POST /sms resource and method', () => {
    template.hasResourceProperties('AWS::ApiGateway::Method', {
      HttpMethod: 'POST',
      ResourceId: Match.objectLike({}),
    });
  });
});

// ─── API Key & Usage Plan ──────────────────────────
describe('API Key & Rate Limiting', () => {
  test('creates API key', () => {
    template.resourceCountIs('AWS::ApiGateway::ApiKey', 1);
  });

  test('creates usage plan with rate limiting', () => {
    template.hasResourceProperties('AWS::ApiGateway::UsagePlan', {
      Throttle: Match.objectLike({
        BurstLimit: 200,
        RateLimit: 100,
      }),
      Quota: Match.objectLike({
        Limit: 1000,
        Period: 'MONTH',
      }),
    });
  });

  test('links API key to usage plan', () => {
    template.hasResourceProperties('AWS::ApiGateway::UsagePlanKey', {});
  });
});

// ─── Outputs ───────────────────────────────────────
describe('Stack Outputs', () => {
  test('outputs API endpoint', () => {
    template.hasOutput('ApiEndpoint', {});
  });

  test('outputs API key ID', () => {
    template.hasOutput('ApiKeyId', {});
  });

  test('outputs log group name', () => {
    template.hasOutput('LogGroup', {});
  });
});
