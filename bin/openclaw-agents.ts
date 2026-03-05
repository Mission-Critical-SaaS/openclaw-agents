#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { OpenclawAgentsStack } from '../lib/openclaw-agents-stack';

const app = new cdk.App();

new OpenclawAgentsStack(app, 'OpenclawAgentsStack', {
  env: {
    account: '669308278244', // LMNTL AI Agents sub-account
    region: 'us-east-1',
  },
  instanceType: 't3.small',
  alertEmail: 'david@lmntl.ai',
});
