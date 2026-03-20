#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { OpenclawAgentsStack } from '../lib/openclaw-agents-stack';
import { BeaconVoiceToolsStack } from '../lib/beacon-voice-tools-stack';

const app = new cdk.App();

const env = {
  account: process.env.AWS_ACCOUNT_ID || '122015479852',
  region: process.env.AWS_REGION || 'us-east-1',
};

// Main OpenClaw Agents stack (always deployed)
new OpenclawAgentsStack(app, 'OpenclawAgentsStack', {
  env,
  instanceType: 't3.xlarge',
  diskSizeGb: 50,
  alertEmail: 'david@lmntl.ai',
  githubOrg: 'LMNTL-AI',
  githubRepo: 'openclaw-agents',
});

// Beacon Voice Tools stack (conditional, controlled by CDK context flag)
// Deploy with: cdk deploy -c deployVoiceTools=true
if (app.node.tryGetContext('deployVoiceTools')) {
  new BeaconVoiceToolsStack(app, 'BeaconVoiceToolsStack', {
    env,
  });
}
