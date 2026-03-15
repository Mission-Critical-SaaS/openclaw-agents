/**
 * OpenClaw Agents - End-to-End Tests
 *
 * These tests verify the full deployment is working correctly.
 * Requires AWS CLI access (openclaw profile) and optionally SLACK_TEST_TOKEN.
 *
 * Run manually: npx jest test/e2e/e2e.test.ts --verbose
 * NOT run in CI — these require live AWS/Slack access.
 */

import { execSync } from 'child_process';

const EC2_INSTANCE_ID = 'i-0acd7169101e93388';
const EXPECTED_AGENTS = ['scout', 'trak', 'kit', 'scribe', 'probe'];
const AGENT_BOT_IDS: Record<string, string> = {
  scout: 'U0AJLT30KMG',
  trak: 'U0AJEGUSELB',
  kit: 'U0AKF614URE',
  // Scribe and Probe bot user IDs — populated after first Slack API call
  // (we verify them via app presence rather than hardcoded IDs)
};

function awsCli(cmd: string): string {
  return execSync('aws ' + cmd, { encoding: 'utf-8', timeout: 30000 }).trim();
}

function ssmExec(command: string, timeoutSec = 30): string {
  const cmdId = awsCli(
    `ssm send-command --instance-ids ${EC2_INSTANCE_ID} ` +
    `--document-name AWS-RunShellScript ` +
    `--parameters 'commands=["${command.replace(/"/g, '\\"')}"]' ` +
    `--timeout-seconds ${timeoutSec} ` +
    `--query Command.CommandId --output text`
  );

  // Poll for completion
  for (let i = 0; i < timeoutSec * 2; i++) {
    try {
      const status = awsCli(
        `ssm get-command-invocation --command-id ${cmdId} ` +
        `--instance-id ${EC2_INSTANCE_ID} --query Status --output text`
      );
      if (status === 'Success') {
        return awsCli(
          `ssm get-command-invocation --command-id ${cmdId} ` +
          `--instance-id ${EC2_INSTANCE_ID} --query StandardOutputContent --output text`
        );
      }
      if (status === 'Failed' || status === 'TimedOut') {
        const err = awsCli(
          `ssm get-command-invocation --command-id ${cmdId} ` +
          `--instance-id ${EC2_INSTANCE_ID} --query StandardErrorContent --output text`
        );
        throw new Error(`SSM command failed (${status}): ${err}`);
      }
    } catch (e: any) {
      if (!e.message?.includes('InvocationDoesNotExist')) throw e;
    }
    execSync('sleep 1');
  }
  throw new Error('SSM command timed out');
}

function slackApi(method: string, params: Record<string, string>): any {
  const token = process.env.SLACK_TEST_TOKEN;
  if (!token) throw new Error('SLACK_TEST_TOKEN not set');

  const qs = Object.entries(params)
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
    .join('&');
  const url = `https://slack.com/api/${method}?${qs}`;

  const result = execSync(
    `curl -s -H "Authorization: Bearer ${token}" "${url}"`,
    { encoding: 'utf-8', timeout: 15000 }
  );
  return JSON.parse(result);
}

// ── AWS Infrastructure ─────────────────────────────────────────────

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

// ── Container Health (via SSM) ─────────────────────────────────────

describe('Container Health', () => {
  test('Docker container is running', () => {
    const output = ssmExec('docker ps --filter name=openclaw-agents --format {{.Names}}');
    expect(output).toContain('openclaw-agents');
  });

  test('Bootstrap completed successfully', () => {
    const output = ssmExec('docker logs openclaw-agents 2>&1 | grep BOOTSTRAP_OK | tail -1');
    expect(output).toContain('BOOTSTRAP_OK');
  });

  test('All 5 Slack socket mode connections established (5 agents)', () => {
    const output = ssmExec(
      'docker logs openclaw-agents 2>&1 | grep -c "socket mode connected" || echo 0'
    );
    const count = parseInt(output.trim(), 10);
    expect(count).toBeGreaterThanOrEqual(5);
  });

  test('No streaming normalization warnings', () => {
    const output = ssmExec(
      'docker logs openclaw-agents 2>&1 | grep -c "Normalized.*streaming" || echo 0'
    );
    const count = parseInt(output.trim(), 10);
    expect(count).toBe(0);
  });

  test('Gateway process is alive', () => {
    const output = ssmExec('docker exec openclaw-agents pgrep -f openclaw.gateway | head -1');
    expect(output.trim()).toMatch(/^\d+$/);
  });
});

// ── Slack Agent Connectivity ───────────────────────────────────────

describe('Slack Agent Connectivity', () => {
  const hasToken = !!process.env.SLACK_TEST_TOKEN;

  // Original 3 agents with known bot user IDs
  for (const [name, userId] of Object.entries(AGENT_BOT_IDS)) {
    (hasToken ? test : test.skip)(`${name} bot is active in Slack`, () => {
      const result = slackApi('users.info', { user: userId });
      expect(result.ok).toBe(true);
      expect(result.user?.deleted).toBe(false);
    });
  }

  // Scribe and Probe — verify via gateway config that their accounts are configured
  for (const agent of ['scribe', 'probe']) {
    test(`${agent} is configured in gateway Slack accounts`, () => {
      const output = ssmExec(
        `docker exec openclaw-agents grep -c ${agent} /root/.openclaw/.openclaw/openclaw.json || echo 0`
      );
      expect(parseInt(output.trim(), 10)).toBeGreaterThan(0);
    });
  }
});
