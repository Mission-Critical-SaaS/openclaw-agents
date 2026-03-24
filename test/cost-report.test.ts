/**
 * OpenClaw Agents — Daily Cost Report Validation Tests
 *
 * These tests verify that the daily cost report script (scripts/daily-cost-report.sh)
 * contains the correct structural patterns for cost aggregation, Slack posting, and
 * report generation. They do NOT execute the script; instead they parse the source
 * to confirm critical sections are present.
 */
import { readFileSync } from 'fs';
import { join } from 'path';

const ROOT = join(__dirname, '..');

function readScript(path: string): string {
  return readFileSync(join(ROOT, path), 'utf-8');
}

// ---------------------------------------------------------------------------
// Daily Cost Report (scripts/daily-cost-report.sh)
// ---------------------------------------------------------------------------
describe('Daily Cost Report (daily-cost-report.sh)', () => {
  let script: string;

  beforeAll(() => {
    script = readScript('scripts/daily-cost-report.sh');
  });

  test('script exists and is executable (has bash shebang)', () => {
    expect(script).toMatch(/^#!\/usr\/bin\/env bash|^#!\/bin\/bash/);
  });

  test('contains Slack posting pattern (chat.postMessage)', () => {
    expect(script).toContain('chat.postMessage');
  });

  test('posts to correct channel (C086N5031LZ)', () => {
    expect(script).toContain('C086N5031LZ');
  });

  test('contains token-usage.jsonl reading', () => {
    expect(script).toContain('.jsonl');
    expect(script).toContain('token-usage');
  });

  test('contains per-agent aggregation logic', () => {
    expect(script).toContain('agent_today');
    expect(script).toContain('agent');
    // Iterates over agents to build the report table
    expect(script).toContain('for agent in sorted(agent_today.keys())');
  });

  test('contains cost calculation', () => {
    expect(script).toContain('cost_usd');
    expect(script).toContain('total_cost');
  });

  test('writes daily JSON to cost-reports directory', () => {
    expect(script).toContain('cost-reports');
    expect(script).toContain('json.dump');
    expect(script).toContain('report_path');
  });

  test('contains cache hit percentage calculation', () => {
    expect(script).toContain('cache_pct');
    expect(script).toContain('cache_read_input_tokens');
    expect(script).toContain('savings_pct');
  });

  test('contains MTD (month-to-date) calculation', () => {
    expect(script).toContain('mtd_cost');
    expect(script).toContain('mtd_records');
    expect(script).toContain('MONTH_START');
  });
});
