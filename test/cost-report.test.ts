/**
 * OpenClaw Agents — Daily Cost Report Validation Tests
 *
 * These tests verify that the daily cost report script (scripts/daily-cost-report.sh)
 * contains the correct structural patterns for Anthropic Admin API usage,
 * Slack posting, and report generation.
 */
import { readFileSync } from 'fs';
import { join } from 'path';

const ROOT = join(__dirname, '..');

function readScript(path: string): string {
  return readFileSync(join(ROOT, path), 'utf-8');
}

describe('Daily Cost Report (daily-cost-report.sh)', () => {
  let script: string;

  beforeAll(() => {
    script = readScript('scripts/daily-cost-report.sh');
  });

  test('script exists and has bash shebang', () => {
    expect(script).toMatch(/^#!\/usr\/bin\/env bash|^#!\/bin\/bash/);
  });

  test('reads admin key from AWS', () => {
    expect(script).toContain('anthropic-admin-key');
    expect(script).toContain('aws');
  });

  test('calls Anthropic Usage API', () => {
    expect(script).toContain('usage_report');
    expect(script).toContain('api.anthropic.com');
  });

  test('posts to Slack #agent-ops channel (C0AMHF5J9Q9)', () => {
    expect(script).toContain('chat.postMessage');
    expect(script).toContain('C0AMHF5J9Q9');
  });

  test('writes daily JSON to cost-reports directory', () => {
    expect(script).toContain('cost-reports');
  });

  test('contains cost calculation with Anthropic pricing', () => {
    // Should reference token pricing constants
    expect(script).toContain('output_tokens');
    expect(script).toContain('cache_read');
  });

  test('includes proactive task activity from scheduler logs', () => {
    expect(script).toContain('proactive');
  });
});
