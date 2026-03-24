/**
 * OpenClaw Agents — Token Budget Enforcer Validation Tests
 *
 * These tests verify that the token budget enforcer script and its config
 * contain the correct structural patterns for budget enforcement, alerting,
 * and pause-flag creation. They do NOT execute the scripts; instead they
 * parse the source to confirm critical sections are present.
 */
import { readFileSync, existsSync, readdirSync } from 'fs';
import { join } from 'path';

const ROOT = join(__dirname, '..');

function readScript(path: string): string {
  return readFileSync(join(ROOT, path), 'utf-8');
}

// ---------------------------------------------------------------------------
// Token Budget Enforcer (scripts/token-budget-enforcer.sh)
// ---------------------------------------------------------------------------
describe('Token Budget Enforcer (token-budget-enforcer.sh)', () => {
  let script: string;

  beforeAll(() => {
    script = readScript('scripts/token-budget-enforcer.sh');
  });

  test('script exists and is executable (has bash shebang)', () => {
    expect(script).toMatch(/^#!\/usr\/bin\/env bash|^#!\/bin\/bash/);
  });

  test('contains token-caps.json reading', () => {
    expect(script).toContain('token-caps.json');
    expect(script).toContain('CAPS_FILE');
  });

  test('contains 80% threshold warning logic', () => {
    expect(script).toContain('alert_threshold_pct');
    expect(script).toContain('alert_pct');
    expect(script).toContain('budget_warning');
  });

  test('contains 100% threshold pause flag creation (/tmp/openclaw-token-pause-)', () => {
    expect(script).toContain('/tmp/openclaw-token-pause-');
    expect(script).toContain('pause_flag');
    expect(script).toContain('budget_pause');
  });

  test('contains cooldown logic (do not re-alert)', () => {
    expect(script).toContain('is_in_cooldown');
    expect(script).toContain('set_cooldown');
    expect(script).toContain('COOLDOWN_SECONDS');
  });

  test('posts warnings to correct channel (C0AL58T8QMN = #openclaw-watchdog)', () => {
    expect(script).toContain('C0AL58T8QMN');
  });
});

// ---------------------------------------------------------------------------
// Token Caps Config (config/proactive/token-caps.json)
// ---------------------------------------------------------------------------
describe('Token Caps Config (token-caps.json)', () => {
  let raw: string;
  let config: any;

  beforeAll(() => {
    raw = readScript('config/proactive/token-caps.json');
    config = JSON.parse(raw);
  });

  test('token-caps.json exists and is valid JSON', () => {
    expect(existsSync(join(ROOT, 'config/proactive/token-caps.json'))).toBe(true);
    expect(() => JSON.parse(raw)).not.toThrow();
  });

  test('has defaults section with daily_input_tokens and daily_output_tokens', () => {
    expect(config.defaults).toBeDefined();
    expect(config.defaults.daily_input_tokens).toBeGreaterThan(0);
    expect(config.defaults.daily_output_tokens).toBeGreaterThan(0);
  });

  test('has platform.daily_usd_cap', () => {
    expect(config.platform).toBeDefined();
    expect(config.platform.daily_usd_cap).toBeGreaterThan(0);
  });

  test('has overrides for at least kit, scout, chief, ledger', () => {
    expect(config.overrides).toBeDefined();
    for (const agent of ['kit', 'scout', 'chief', 'ledger']) {
      expect(config.overrides[agent]).toBeDefined();
    }
  });
});

// ---------------------------------------------------------------------------
// Proactive Scheduler checks token pause flag
// ---------------------------------------------------------------------------
describe('Proactive Scheduler pause-flag integration', () => {
  let scheduler: string;

  beforeAll(() => {
    scheduler = readScript('scripts/proactive-scheduler.sh');
  });

  test('proactive-scheduler.sh checks token pause flag', () => {
    expect(scheduler).toContain('openclaw-token-pause');
  });
});

// ---------------------------------------------------------------------------
// Docker Compose integration
// ---------------------------------------------------------------------------
describe('Docker Compose token-proxy integration', () => {
  let compose: string;

  beforeAll(() => {
    compose = readScript('docker-compose.yml');
  });

  test('docker-compose.yml has ANTHROPIC_BASE_URL pointing to token-proxy', () => {
    expect(compose).toContain('ANTHROPIC_BASE_URL=http://token-proxy:8090');
  });

  test('docker-compose.yml has token-proxy service definition', () => {
    expect(compose).toContain('token-proxy:');
  });
});

// ---------------------------------------------------------------------------
// Healthcheck checks proxy health (port 8090)
// ---------------------------------------------------------------------------
describe('Healthcheck proxy integration', () => {
  let healthcheck: string;

  beforeAll(() => {
    healthcheck = readScript('scripts/healthcheck.sh');
  });

  test('healthcheck.sh checks proxy health on port 8090', () => {
    expect(healthcheck).toContain('8090');
    expect(healthcheck).toContain('token-proxy');
  });
});

// ---------------------------------------------------------------------------
// Cross-cutting tests
// ---------------------------------------------------------------------------
describe('Cross-cutting: Cost Awareness in agent IDENTITY.md files', () => {
  const agentDirs = [
    'kit', 'scout', 'chief', 'ledger', 'beacon', 'cadence',
    'harvest', 'outreach', 'probe', 'prospector', 'scribe', 'trak',
  ];

  test('all 12 agent IDENTITY.md files contain "Cost Awareness" section', () => {
    for (const agent of agentDirs) {
      const identityPath = join(ROOT, 'agents', agent, 'workspace', 'IDENTITY.md');
      expect(existsSync(identityPath)).toBe(true);
      const content = readFileSync(identityPath, 'utf-8');
      expect(content).toContain('Cost Awareness');
    }
  });
});

describe('Cross-cutting: Cost visibility docs and config references', () => {
  test('docs/cost-visibility.md exists', () => {
    expect(existsSync(join(ROOT, 'docs/cost-visibility.md'))).toBe(true);
  });

  test('budget-caps.json references token-caps.json', () => {
    const budgetCaps = readScript('config/proactive/budget-caps.json');
    expect(budgetCaps).toContain('token-caps.json');
  });

  test('setup-proactive-cron.sh has daily-cost-report and token-budget-enforcer entries', () => {
    const cronSetup = readScript('scripts/setup-proactive-cron.sh');
    expect(cronSetup).toContain('daily-cost-report');
    expect(cronSetup).toContain('token-budget-enforcer');
  });

  test('entrypoint.sh injects token-caps.json into agent workspaces', () => {
    const entrypoint = readScript('entrypoint.sh');
    expect(entrypoint).toContain('token-caps.json');
  });
});
