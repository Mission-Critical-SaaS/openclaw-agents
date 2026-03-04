#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { OpenclawAgentsStack } from '../lib/openclaw-agents-stack';

const app = new cdk.App();

new OpenclawAgentsStack(app, 'OpenclawAgentsStack', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION ?? 'us-west-2',
  },
  instanceType: 't3.small',
  alertEmail: 'claude-agent-1@missioncritical.llc',
});
