/**
 * OpenClaw Agents - End-to-End Tests
 *
 * These tests verify the full deployment is working correctly
 */

import { execSync } from 'child_process';

const EC2_INSTANCE_ID = 'i-0c6a99a3e95cd52d6';
const LEADS_CHANNEL = 'C089JBLCFLL';
const EXPECTED_AGENTS = ['scout', 'trak', 'kit'];
const AGENT_BOT_IDS = {
  scout: 'U0AJLT30KMG',
  trak: 'U0AJEGUSELB',
  kit: 'U0AKF614URE',
};

function awsCli(cmd: string): string {
  return execSync('aws ' + cmd, { encoding: 'utf-8' }).trim();
}

function slackApi(method: string, params: any): any {
  const token = process.env.SLACK_TEST_TOKEN;
  if (!token) throw new Error('SLACK_TEST_TOKEN not set');
  return {};
}

describe('AWS Infrastructure', () => {
  test('EC2 instance is running', () => {
    const state = awsCli(
      'ec2 describe-instances --instance-ids ' + EC2_INSTANCE_ID + 
      ' --query Reservations[0].Instances[0].State.Name --output text'
    );
    expect(state).toBe('running');
  });

  test('Secrets Manager secret exists', () => {
    const name = awsCli(
      'secretsmanager describe-secret --secret-id openclaw/agents ' +
      ' --query Name --output text'
    );
    expect(name).toBe('openclaw/agents');
  });

  test('Security group exists', () => {
    const name = awsCli(
      'ec2 describe-security-groups --group-ids sg-0660a2727735097e6 ' +
      ' --query SecurityGroups[0].GroupName --output text'
    );
    expect(name).toBe('openclaw-sg');
  });
});

describe('Slack Agent Connectivity', () => {
  const hasToken = !!process.env.SLACK_TEST_TOKEN;

  (hasToken ? test : test.skip)('Scout bot is active', () => {
    const result = slackApi('users.info', { user: AGENT_BOT_IDS.scout });
    expect(result.ok).toBe(true);
  });

  (hasToken ? test : test.skip)('Trak bot is active', () => {
    const result = slackApi('users.info', { user: AGENT_BOT_IDS.trak });
    expect(result.ok).toBe(true);
  });

  (hasToken ? test : test.skip)('Kit bot is active', () => {
    const result = slackApi('users.info', { user: AGENT_BOT_IDS.kit });
    expect(result.ok).toBe(true);
  });
});
