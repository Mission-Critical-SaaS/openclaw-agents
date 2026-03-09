#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { OpenclawAgentsStack } from '../lib/openclaw-agents-stack';

const app = new cdk.App();

new OpenclawAgentsStack(app, 'OpenclawAgentsStack', {
  env: {
    account: '122015479852',
    region: 'us-east-1',
  },
  instanceType: 't3.xlarge',
  diskSizeGb: 50,
  alertEmail: 'david@lmntl.ai',
  githubOrg: 'LMNTL-AI',
  githubRepo: 'openclaw-agents',
});
