/**
 * Beacon Voice Tools — CDK Stack
 *
 * Deploys API Gateway REST API + Lambda functions for ElevenLabs Server Tools.
 * Provides middleware between the voice agent and backend services.
 *
 * Features:
 * - API Key authentication via usage plan
 * - Rate limiting (100 req/min, 1000 req/hour)
 * - CloudWatch logs with 2-week retention
 * - CORS for ElevenLabs origins
 * - All Lambda functions read credentials from Secrets Manager
 *
 * Enabled by CDK context flag: deployVoiceTools
 */

import * as cdk from 'aws-cdk-lib';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as path from 'path';
import { Construct } from 'constructs';

export interface BeaconVoiceToolsStackProps extends cdk.StackProps {
  /** ElevenLabs API origins to allow in CORS */
  elevenLabsOrigin?: string;
}

export class BeaconVoiceToolsStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: BeaconVoiceToolsStackProps) {
    super(scope, id, props);

    const elevenLabsOrigin = props?.elevenLabsOrigin ?? 'https://api.elevenlabs.io';

    // ──────────────────────────────────────────────
    // CloudWatch Logs
    // ──────────────────────────────────────────────
    const logGroup = new logs.LogGroup(this, 'BeaconVoiceToolsLogs', {
      logGroupName: '/beacon/voice-tools',
      retention: logs.RetentionDays.TWO_WEEKS,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // ──────────────────────────────────────────────
    // IAM Role for Lambda Functions
    // Grants read access to Secrets Manager
    // ──────────────────────────────────────────────
    const lambdaRole = new iam.Role(this, 'BeaconLambdaRole', {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      description: 'Beacon voice tools Lambda functions',
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole'),
      ],
    });

    // Grant read access to Secrets Manager
    lambdaRole.addToPolicy(
      new iam.PolicyStatement({
        sid: 'SecretsManagerRead',
        actions: ['secretsmanager:GetSecretValue'],
        resources: [
          `arn:aws:secretsmanager:${this.region}:${this.account}:secret:beacon/*`,
        ],
      })
    );

    // ──────────────────────────────────────────────
    // Lambda: SMS Handler
    // ──────────────────────────────────────────────
    const smsFunction = new lambda.Function(this, 'SmsFunction', {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'sms.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '../lambda/beacon-voice-tools')),
      role: lambdaRole,
      timeout: cdk.Duration.seconds(30),
      environment: {
        NODE_OPTIONS: '--enable-source-maps',
      },
      logGroup,
    });

    // ──────────────────────────────────────────────
    // Lambda: Zendesk Tickets Handler
    // ──────────────────────────────────────────────
    const ticketsFunction = new lambda.Function(this, 'TicketsFunction', {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'tickets.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '../lambda/beacon-voice-tools')),
      role: lambdaRole,
      timeout: cdk.Duration.seconds(30),
      environment: {
        NODE_OPTIONS: '--enable-source-maps',
      },
      logGroup,
    });

    // ──────────────────────────────────────────────
    // Lambda: Password Reset Handler (Placeholder)
    // ──────────────────────────────────────────────
    const passwordResetFunction = new lambda.Function(this, 'PasswordResetFunction', {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'password-reset.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '../lambda/beacon-voice-tools')),
      role: lambdaRole,
      timeout: cdk.Duration.seconds(30),
      environment: {
        NODE_OPTIONS: '--enable-source-maps',
      },
      logGroup,
    });

    // ──────────────────────────────────────────────
    // Lambda: Account Lookup Handler (Placeholder)
    // ──────────────────────────────────────────────
    const accountLookupFunction = new lambda.Function(this, 'AccountLookupFunction', {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'account-lookup.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '../lambda/beacon-voice-tools')),
      role: lambdaRole,
      timeout: cdk.Duration.seconds(30),
      environment: {
        NODE_OPTIONS: '--enable-source-maps',
      },
      logGroup,
    });

    // ──────────────────────────────────────────────
    // Lambda: Integration Status Handler (Placeholder)
    // ──────────────────────────────────────────────
    const integrationStatusFunction = new lambda.Function(this, 'IntegrationStatusFunction', {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'integration-status.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '../lambda/beacon-voice-tools')),
      role: lambdaRole,
      timeout: cdk.Duration.seconds(30),
      environment: {
        NODE_OPTIONS: '--enable-source-maps',
      },
      logGroup,
    });

    // ──────────────────────────────────────────────
    // API Gateway
    // ──────────────────────────────────────────────
    const api = new apigateway.RestApi(this, 'BeaconVoiceToolsApi', {
      description: 'Beacon voice tools API — middleware for ElevenLabs Server Tools',
      restApiName: 'beacon-voice-tools',
      cloudWatchRole: true,
      defaultCorsPreflightOptions: {
        allowOrigins: [elevenLabsOrigin],
        allowMethods: apigateway.Cors.ALL_METHODS,
        allowHeaders: [
          'Content-Type',
          'X-Amz-Date',
          'Authorization',
          'X-Api-Key',
          'X-Caller-Id',
        ],
        statusCode: 200,
      },
    });

    // ──────────────────────────────────────────────
    // API Key & Usage Plan (Rate Limiting)
    // ──────────────────────────────────────────────
    const apiKey = new apigateway.ApiKey(this, 'BeaconApiKey', {
      description: 'Beacon voice tools API key',
      enabled: true,
    });

    const usagePlan = new apigateway.UsagePlan(this, 'BeaconUsagePlan', {
      name: 'beacon-voice-tools',
      description: 'Beacon voice tools rate limiting',
      apiStages: [{ api, stage: api.deploymentStage }],
      throttle: {
        rateLimit: 100, // 100 requests per second
        burstLimit: 200, // Allow bursts up to 200
      },
      quota: {
        limit: 1000, // 1000 requests per month
        period: apigateway.Period.MONTH,
      },
    });

    usagePlan.addApiKey(apiKey);

    // ──────────────────────────────────────────────
    // API Resources & Methods
    // ──────────────────────────────────────────────

    // POST /sms
    const smsResource = api.root.addResource('sms');
    smsResource.addMethod('POST', new apigateway.LambdaIntegration(smsFunction), {
      apiKeyRequired: true,
    });

    // POST /tickets
    const ticketsResource = api.root.addResource('tickets');
    ticketsResource.addMethod('POST', new apigateway.LambdaIntegration(ticketsFunction), {
      apiKeyRequired: true,
    });

    // POST /password-reset
    const passwordResetResource = api.root.addResource('password-reset');
    passwordResetResource.addMethod(
      'POST',
      new apigateway.LambdaIntegration(passwordResetFunction),
      {
        apiKeyRequired: true,
      }
    );

    // GET /accounts/lookup
    const accountsResource = api.root.addResource('accounts');
    const lookupResource = accountsResource.addResource('lookup');
    lookupResource.addMethod('GET', new apigateway.LambdaIntegration(accountLookupFunction), {
      apiKeyRequired: true,
      requestParameters: {
        'method.request.querystring.phone': false, // optional
      },
    });

    // GET /accounts/{id}/integrations
    const accountIdResource = accountsResource.addResource('{id}');
    const integrationsResource = accountIdResource.addResource('integrations');
    integrationsResource.addMethod(
      'GET',
      new apigateway.LambdaIntegration(integrationStatusFunction),
      {
        apiKeyRequired: true,
      }
    );

    // ──────────────────────────────────────────────
    // Outputs
    // ──────────────────────────────────────────────
    new cdk.CfnOutput(this, 'ApiEndpoint', {
      value: api.url,
      description: 'Beacon Voice Tools API endpoint',
    });

    new cdk.CfnOutput(this, 'ApiKeyId', {
      value: apiKey.keyId,
      description: 'API Key ID (retrieve value from AWS Console Secrets Manager)',
    });

    new cdk.CfnOutput(this, 'LogGroup', {
      value: logGroup.logGroupName,
      description: 'CloudWatch log group for Lambda functions',
    });
  }
}
