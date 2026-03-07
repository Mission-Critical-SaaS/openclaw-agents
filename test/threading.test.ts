/**
 * Threading Configuration Tests
 *
 * Validates that all agents are configured to reply in threads
 * when the channel supports it (Slack).
 */

import { readFileSync } from 'fs';
import { resolve } from 'path';

const CONFIG_PATH = resolve(__dirname, '..', 'config', 'openclaw.json.tpl');
const AGENTS = ['scout', 'trak', 'kit'];

function loadConfig(): any {
  // Read template, replace env var patterns so JSON parses
  let raw = readFileSync(CONFIG_PATH, 'utf-8');
  // Handle quoted env vars: "${VAR}" → "__PLACEHOLDER__"
  raw = raw.replace(/"\$\{[^}]+\}"/g, '"__PLACEHOLDER__"');
  // Handle unquoted env vars (e.g. arrays): ${VAR} → ["__PLACEHOLDER__"]
  raw = raw.replace(/\$\{[^}]+\}/g, '["__PLACEHOLDER__"]');
  return JSON.parse(raw);
}

function loadIdentity(agent: string): string {
  const identityPath = resolve(
    __dirname,
    '..',
    'agents',
    agent,
    'workspace',
    'IDENTITY.md'
  );
  return readFileSync(identityPath, 'utf-8');
}

describe('Slack Threading Configuration', () => {
  const config = loadConfig();

  test('replyToMode is set to "all" at the Slack channel level', () => {
    expect(config.channels.slack.replyToMode).toBe('all');
  });

  test('replyToMode is not set to "off" at any account level', () => {
    const accounts = config.channels.slack.accounts;
    for (const [name, account] of Object.entries(accounts) as [string, any][]) {
      if (account.replyToMode !== undefined) {
        expect(account.replyToMode).not.toBe('off');
      }
    }
  });
});

describe('Agent Threading Instructions', () => {
  for (const agent of AGENTS) {
    test(`${agent} IDENTITY.md includes threading instruction`, () => {
      const identity = loadIdentity(agent);
      expect(identity).toContain('reply_to_current');
      expect(identity).toContain('Always reply in-thread');
    });
  }
});
