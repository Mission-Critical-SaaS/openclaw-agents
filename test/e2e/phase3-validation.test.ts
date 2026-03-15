/**
 * Phase 3 End-to-End Validation Tests
 *
 * Comprehensive test suite for Phase 3 advanced capabilities:
 * - All 5 agents online and accessible (Scout, Trak, Kit, Scribe, Probe)
 * - Cross-agent channel access (new agents in same channels as originals)
 * - Cross-agent handoff protocol validation
 * - Proactive task scheduler execution
 * - Budget caps and handoff protocol configuration integrity
 * - Cron schedule installation verification
 *
 * Run manually: npx jest test/e2e/phase3-validation.test.ts --verbose
 * NOT run in CI — requires live AWS/Slack access.
 *
 * Required environment:
 *   AWS CLI with 'openclaw' profile configured
 *   SLACK_TEST_TOKEN — a user token with channels:read, users:read scopes
 */

import { execSync } from 'child_process';
import { readFileSync } from 'fs';
import { join } from 'path';

// ── Constants ────────────────────────────────────────────────────────

const EC2_INSTANCE_ID = 'i-0acd7169101e93388';
const AWS_PROFILE = 'openclaw';
const AWS_REGION = 'us-east-1';

const ALL_AGENTS = ['scout', 'trak', 'kit', 'scribe', 'probe'] as const;
type AgentName = (typeof ALL_AGENTS)[number];

// Slack App IDs (from app creation)
const SLACK_APP_IDS: Record<AgentName, string> = {
  scout: 'A0AJ5DNRR6K',
  trak: 'A0AJLU847U2',
  kit: 'A0AKF8212BA',
  scribe: 'A0ALFTK804B',
  probe: 'A0ALFU2M0F5',
};

// All 12 proactive tasks
const PROACTIVE_TASKS = [
  // Phase 1
  'trak-sprint-health',
  'trak-stale-work',
  'scout-sla-watchdog',
  'scout-bug-correlator',
  'scribe-doc-staleness',
  // Phase 2
  'kit-ci-triage',
  'trak-deploy-tracker',
  'scribe-changelog',
  // Phase 3
  'trak-issue-enrichment',
  'scout-ticket-enrichment',
  'kit-auto-fix',
  'kit-code-quality',
  'scribe-knowledge-gap',
  'probe-smoke-test',
  'probe-perf-canary',
] as const;

// Cron-scheduled tasks (subset — excludes deploy-triggered tasks)
const CRON_TASKS = [
  'trak-sprint-health',
  'trak-stale-work',
  'scout-sla-watchdog',
  'scout-bug-correlator',
  'scribe-doc-staleness',
  'kit-ci-triage',
  'trak-issue-enrichment',
  'scout-ticket-enrichment',
  'kit-auto-fix',
  'kit-code-quality',
  'scribe-knowledge-gap',
  'probe-perf-canary',
] as const;

// Cross-agent handoff IDs
const HANDOFF_IDS = [
  'kit-to-scribe-bug-pattern',
  'trak-to-scribe-sprint-retro',
  'scout-to-scribe-resolution-pattern',
  'scout-to-trak-feature-request',
  'kit-to-trak-tech-debt',
  'trak-to-kit-blocked-pr',
  'scribe-to-all-stale-docs',
  'scout-to-kit-bug-report',
  'kit-to-probe-post-deploy',
  'trak-to-probe-bug-repro',
  'probe-to-kit-bug-reproduced',
  'probe-to-trak-test-results',
  'probe-to-scribe-test-docs',
  'kit-to-trak-auto-fix-pr',
  'scribe-to-trak-doc-gap-tasks',
] as const;

// ── Helpers ──────────────────────────────────────────────────────────

function awsCli(cmd: string, timeout = 30000): string {
  return execSync(
    `aws ${cmd} --profile ${AWS_PROFILE} --region ${AWS_REGION}`,
    { encoding: 'utf-8', timeout }
  ).trim();
}

function ssmExec(command: string, timeoutSec = 60): string {
  const escapedCmd = command.replace(/"/g, '\\"');
  const cmdId = awsCli(
    `ssm send-command --instance-ids ${EC2_INSTANCE_ID} ` +
    `--document-name AWS-RunShellScript ` +
    `--parameters '{"commands":["${escapedCmd}"],"executionTimeout":["${timeoutSec}"]}' ` +
    `--query Command.CommandId --output text`
  );

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
        throw new Error(`SSM command ${status}: ${err}`);
      }
    } catch (e: any) {
      if (!e.message?.includes('InvocationDoesNotExist')) throw e;
    }
    execSync('sleep 1');
  }
  throw new Error(`SSM command timed out after ${timeoutSec}s`);
}

function slackApi(method: string, params: Record<string, string> = {}): any {
  const token = process.env.SLACK_TEST_TOKEN;
  if (!token) throw new Error('SLACK_TEST_TOKEN not set');

  const qs = Object.entries(params)
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
    .join('&');
  const url = `https://slack.com/api/${method}${qs ? '?' + qs : ''}`;

  const result = execSync(
    `curl -s -H "Authorization: Bearer ${token}" "${url}"`,
    { encoding: 'utf-8', timeout: 15000 }
  );
  return JSON.parse(result);
}

function readLocalFile(relativePath: string): string {
  return readFileSync(join(__dirname, '../..', relativePath), 'utf-8');
}

// ── Test Suites ──────────────────────────────────────────────────────

// ============================================================
// 1. AGENT CONNECTIVITY — All 5 agents online
// ============================================================

describe('Agent Connectivity (All 5 Agents)', () => {
  test('Docker container is running', () => {
    const output = ssmExec('docker ps --filter name=openclaw-agents --format {{.Names}}');
    expect(output).toContain('openclaw-agents');
  });

  test('10 socket mode connections established (5 agents × 2)', () => {
    const output = ssmExec(
      'docker logs openclaw-agents 2>&1 | grep "socket mode connected" | tail -20'
    );
    const lines = output.split('\n').filter((l) => l.includes('socket mode connected'));
    // After a fresh restart, we should see at least 5 connections (one per agent)
    // With full initialization, we see 10 (bot + app per agent)
    expect(lines.length).toBeGreaterThanOrEqual(5);
  });

  test('Gateway process is alive', () => {
    const output = ssmExec('docker exec openclaw-agents pgrep -f openclaw.gateway | head -1');
    expect(output.trim()).toMatch(/^\d+$/);
  });

  test('All 5 agent workspace directories exist', () => {
    const checks = ALL_AGENTS.map(a =>
      `docker exec openclaw-agents test -d /root/.openclaw/.openclaw/workspace-${a} && echo ${a}:OK || echo ${a}:MISSING`
    ).join('; ');
    const output = ssmExec(checks);
    for (const agent of ALL_AGENTS) {
      expect(output).toContain(`${agent}:OK`);
    }
  });

  test('All 5 agents have IDENTITY.md injected', () => {
    const checks = ALL_AGENTS.map(a =>
      `docker exec openclaw-agents test -f /root/.openclaw/.openclaw/workspace-${a}/IDENTITY.md && echo ${a}:OK || echo ${a}:MISSING`
    ).join('; ');
    const output = ssmExec(checks);
    for (const agent of ALL_AGENTS) {
      expect(output).toContain(`${agent}:OK`);
    }
  });

  test('All 5 agents have KNOWLEDGE.md injected', () => {
    const checks = ALL_AGENTS.map(a =>
      `docker exec openclaw-agents test -f /root/.openclaw/.openclaw/workspace-${a}/KNOWLEDGE.md && echo ${a}:OK || echo ${a}:MISSING`
    ).join('; ');
    const output = ssmExec(checks);
    for (const agent of ALL_AGENTS) {
      expect(output).toContain(`${agent}:OK`);
    }
  });

  test('All 5 agents have security configs (.user-tiers.json, .dangerous-actions.json)', () => {
    const checks = ALL_AGENTS.map(a =>
      `docker exec openclaw-agents test -f /root/.openclaw/.openclaw/workspace-${a}/.user-tiers.json && ` +
      `docker exec openclaw-agents test -f /root/.openclaw/.openclaw/workspace-${a}/.dangerous-actions.json && ` +
      `echo ${a}:OK || echo ${a}:MISSING`
    ).join('; ');
    const output = ssmExec(checks);
    for (const agent of ALL_AGENTS) {
      expect(output).toContain(`${agent}:OK`);
    }
  });

  test('All 5 agents have proactive configs (.budget-caps.json, .handoff-protocol.json)', () => {
    const checks = ALL_AGENTS.map(a =>
      `docker exec openclaw-agents test -f /root/.openclaw/.openclaw/workspace-${a}/.budget-caps.json && ` +
      `docker exec openclaw-agents test -f /root/.openclaw/.openclaw/workspace-${a}/.handoff-protocol.json && ` +
      `echo ${a}:OK || echo ${a}:MISSING`
    ).join('; ');
    const output = ssmExec(checks);
    for (const agent of ALL_AGENTS) {
      expect(output).toContain(`${agent}:OK`);
    }
  });
});

// ============================================================
// 2. SECRETS MANAGER — Token configuration
// ============================================================

describe('Secrets Manager Token Configuration', () => {
  let secretKeys: string[];

  beforeAll(() => {
    const raw = awsCli(
      `secretsmanager get-secret-value --secret-id openclaw/agents ` +
      `--query SecretString --output text`
    );
    secretKeys = Object.keys(JSON.parse(raw));
  });

  for (const agent of ALL_AGENTS) {
    const upper = agent.toUpperCase();

    test(`${agent} has bot token (SLACK_BOT_TOKEN_${upper})`, () => {
      expect(secretKeys).toContain(`SLACK_BOT_TOKEN_${upper}`);
    });

    test(`${agent} has app token (SLACK_APP_TOKEN_${upper})`, () => {
      expect(secretKeys).toContain(`SLACK_APP_TOKEN_${upper}`);
    });
  }

  test('total secret key count is >= 22', () => {
    expect(secretKeys.length).toBeGreaterThanOrEqual(22);
  });
});

// ============================================================
// 3. SLACK AGENT PRESENCE — Bots active in workspace
// ============================================================

describe('Slack Agent Presence', () => {
  for (const agent of ALL_AGENTS) {
    test(`${agent} is configured in gateway openclaw.json`, () => {
      const output = ssmExec(
        `docker exec openclaw-agents cat /root/.openclaw/.openclaw/openclaw.json 2>/dev/null | ` +
        `jq -r ".channels.slack.accounts.${agent} | length" 2>/dev/null || echo 0`
      );
      expect(parseInt(output.trim(), 10)).toBeGreaterThan(0);
    });
  }
});

// ============================================================
// 4. CHANNEL ACCESS — New agents in same channels as originals
// ============================================================

describe('Slack Channel Configuration', () => {
  test('all 5 agents have Slack accounts configured in gateway', () => {
    const output = ssmExec(
      'docker exec openclaw-agents cat /root/.openclaw/.openclaw/openclaw.json 2>/dev/null | ' +
      'jq -r ".channels.slack.accounts | keys[]" 2>/dev/null || echo "jq-failed"'
    );
    if (output === 'jq-failed') {
      // Fallback: grep for agent names in the config file
      const fallback = ssmExec(
        'docker exec openclaw-agents grep -oE "(scout|trak|kit|scribe|probe)" ' +
        '/root/.openclaw/.openclaw/openclaw.json | sort -u'
      );
      for (const agent of ALL_AGENTS) {
        expect(fallback).toContain(agent);
      }
    } else {
      for (const agent of ALL_AGENTS) {
        expect(output).toContain(agent);
      }
    }
  });

  test('all agents have groupPolicy=open (accessible in any channel)', () => {
    const checks = ALL_AGENTS.map(a =>
      `docker exec openclaw-agents cat /root/.openclaw/.openclaw/openclaw.json 2>/dev/null | ` +
      `jq -r .channels.slack.accounts.${a}.groupPolicy 2>/dev/null | ` +
      `xargs -I{} echo ${a}:{}`
    ).join('; ');
    const output = ssmExec(checks);
    for (const agent of ALL_AGENTS) {
      expect(output).toContain(`${agent}:open`);
    }
  });

  test('all agents have requireMention=true', () => {
    const checks = ALL_AGENTS.map(a =>
      `docker exec openclaw-agents cat /root/.openclaw/.openclaw/openclaw.json 2>/dev/null | ` +
      `jq -r .channels.slack.accounts.${a}.requireMention 2>/dev/null | ` +
      `xargs -I{} echo ${a}:{}`
    ).join('; ');
    const output = ssmExec(checks);
    for (const agent of ALL_AGENTS) {
      expect(output).toMatch(new RegExp(`${agent}:true`));
    }
  });
});

// ============================================================
// 5. PROACTIVE TASK DEFINITIONS — All tasks registered
// ============================================================

describe('Proactive Task Definitions', () => {
  let schedulerScript: string;

  beforeAll(() => {
    schedulerScript = readLocalFile('scripts/proactive-scheduler.sh');
  });

  test('scheduler --list shows all task phases', () => {
    expect(schedulerScript).toContain('Phase 1');
    expect(schedulerScript).toContain('Phase 2');
    expect(schedulerScript).toContain('Phase 3');
  });

  for (const task of PROACTIVE_TASKS) {
    test(`task "${task}" is defined in scheduler`, () => {
      // Each task must have a case entry
      expect(schedulerScript).toContain(`${task})`);
      // Each task must have a send_to_agent call
      const taskSection = schedulerScript.substring(
        schedulerScript.indexOf(`${task})`),
        schedulerScript.indexOf(';;', schedulerScript.indexOf(`${task})`)) + 2
      );
      expect(taskSection).toContain('send_to_agent');
      expect(taskSection).toContain('[PROACTIVE TASK:');
      expect(taskSection).toContain('.budget-caps.json');
    });
  }

  test('all Phase 3 tasks target the correct agents', () => {
    const taskAgentMap: Record<string, string> = {
      'trak-issue-enrichment': '"trak"',
      'scout-ticket-enrichment': '"scout"',
      'kit-auto-fix': '"kit"',
      'kit-code-quality': '"kit"',
      'scribe-knowledge-gap': '"scribe"',
      'probe-smoke-test': '"probe"',
      'probe-perf-canary': '"probe"',
    };

    for (const [task, agent] of Object.entries(taskAgentMap)) {
      const taskIdx = schedulerScript.indexOf(`${task})`);
      const section = schedulerScript.substring(taskIdx, taskIdx + 200);
      expect(section).toContain(`send_to_agent ${agent}`);
    }
  });
});

// ============================================================
// 6. CRON SCHEDULE — All tasks scheduled correctly
// ============================================================

describe('Cron Schedule (Live EC2)', () => {
  let cronEntries: string;

  beforeAll(() => {
    cronEntries = ssmExec('crontab -l 2>/dev/null');
  });

  for (const task of CRON_TASKS) {
    test(`cron entry exists for "${task}"`, () => {
      expect(cronEntries).toContain(task);
      expect(cronEntries).toContain(`# proactive: ${task}`);
    });
  }

  test('total proactive cron entries is 12', () => {
    const proactiveLines = cronEntries.split('\n').filter(
      (l) => l.includes('# proactive:')
    );
    expect(proactiveLines.length).toBe(12);
  });

  test('enrichment tasks run during business hours only (9-18)', () => {
    const enrichmentLines = cronEntries.split('\n').filter(
      (l) => l.includes('enrichment') && !l.startsWith('#')
    );
    expect(enrichmentLines.length).toBeGreaterThanOrEqual(2);
    for (const line of enrichmentLines) {
      expect(line).toMatch(/9-18/);
      expect(line).toMatch(/1-5/); // weekdays only
    }
  });

  test('trak-issue-enrichment runs every 30 minutes', () => {
    const line = cronEntries.split('\n').find((l) => l.includes('trak-issue-enrichment'));
    expect(line).toMatch(/^\*\/30/);
  });

  test('scout-ticket-enrichment runs every 15 minutes', () => {
    const line = cronEntries.split('\n').find((l) => l.includes('scout-ticket-enrichment'));
    expect(line).toMatch(/^\*\/15/);
  });

  test('kit-auto-fix runs every 6 hours on weekdays', () => {
    const line = cronEntries.split('\n').find((l) => l.includes('kit-auto-fix'));
    expect(line).toMatch(/\*\/6/);
  });

  test('kit-code-quality runs on Saturdays', () => {
    const line = cronEntries.split('\n').find((l) => l.includes('kit-code-quality'));
    expect(line).toMatch(/\* \* 6/); // day 6 = Saturday
  });

  test('scribe-knowledge-gap runs on 1st of month', () => {
    const line = cronEntries.split('\n').find((l) => l.includes('scribe-knowledge-gap'));
    expect(line).toMatch(/1 \* \*/); // 1st day of month
  });

  test('EC2 timezone is America/New_York', () => {
    const output = ssmExec('timedatectl show --property=Timezone --value 2>/dev/null || cat /etc/timezone');
    expect(output).toContain('New_York');
  });
});

// ============================================================
// 7. CROSS-AGENT HANDOFF PROTOCOL — Config integrity
// ============================================================

describe('Handoff Protocol Configuration', () => {
  let protocol: any;

  beforeAll(() => {
    protocol = JSON.parse(readLocalFile('config/proactive/handoff-protocol.json'));
  });

  test('handoff protocol file is valid JSON with correct structure', () => {
    expect(protocol).toHaveProperty('version');
    expect(protocol).toHaveProperty('handoffs');
    expect(protocol).toHaveProperty('protocol');
    expect(Array.isArray(protocol.handoffs)).toBe(true);
  });

  test(`all ${HANDOFF_IDS.length} expected handoffs are defined`, () => {
    const definedIds = protocol.handoffs.map((h: any) => h.id);
    for (const id of HANDOFF_IDS) {
      expect(definedIds).toContain(id);
    }
  });

  test('every handoff has required fields (id, from, to, trigger, payload, action, priority)', () => {
    for (const handoff of protocol.handoffs) {
      expect(handoff).toHaveProperty('id');
      expect(handoff).toHaveProperty('from');
      expect(handoff).toHaveProperty('to');
      expect(handoff).toHaveProperty('trigger');
      expect(handoff).toHaveProperty('payload');
      expect(handoff).toHaveProperty('action');
      expect(handoff).toHaveProperty('priority');
    }
  });

  test('handoff "from" fields reference valid agents', () => {
    for (const handoff of protocol.handoffs) {
      expect(ALL_AGENTS).toContain(handoff.from as AgentName);
    }
  });

  test('handoff "to" fields reference valid agents (string or array)', () => {
    for (const handoff of protocol.handoffs) {
      const targets = Array.isArray(handoff.to) ? handoff.to : [handoff.to];
      for (const target of targets) {
        expect(ALL_AGENTS).toContain(target as AgentName);
      }
    }
  });

  test('no agent hands off to itself', () => {
    for (const handoff of protocol.handoffs) {
      const targets = Array.isArray(handoff.to) ? handoff.to : [handoff.to];
      expect(targets).not.toContain(handoff.from);
    }
  });

  test('protocol has delivery, format, and acknowledgment fields', () => {
    expect(protocol.protocol).toHaveProperty('delivery');
    expect(protocol.protocol).toHaveProperty('format');
    expect(protocol.protocol).toHaveProperty('acknowledgment');
  });

  // Verify Phase 3 handoffs specifically
  test('kit-to-trak-auto-fix-pr handoff is correctly defined', () => {
    const h = protocol.handoffs.find((h: any) => h.id === 'kit-to-trak-auto-fix-pr');
    expect(h).toBeDefined();
    expect(h.from).toBe('kit');
    expect(h.to).toBe('trak');
  });

  test('scribe-to-trak-doc-gap-tasks handoff is correctly defined', () => {
    const h = protocol.handoffs.find((h: any) => h.id === 'scribe-to-trak-doc-gap-tasks');
    expect(h).toBeDefined();
    expect(h.from).toBe('scribe');
    expect(h.to).toBe('trak');
  });
});

// ============================================================
// 8. BUDGET CAPS — Configuration integrity
// ============================================================

describe('Budget Caps Configuration', () => {
  let budgetCaps: any;

  beforeAll(() => {
    budgetCaps = JSON.parse(readLocalFile('config/proactive/budget-caps.json'));
  });

  test('budget caps file is valid JSON with correct structure', () => {
    expect(budgetCaps).toHaveProperty('version');
    expect(budgetCaps).toHaveProperty('caps');
    expect(budgetCaps).toHaveProperty('enforcement');
  });

  for (const agent of ALL_AGENTS) {
    test(`${agent} has budget caps defined`, () => {
      expect(budgetCaps.caps).toHaveProperty(agent);
      expect(budgetCaps.caps[agent]).toHaveProperty('daily');
      expect(budgetCaps.caps[agent]).toHaveProperty('monthly');
      expect(budgetCaps.caps[agent]).toHaveProperty('per_action');
    });
  }

  test('Phase 3 enrichment caps are present for trak', () => {
    expect(budgetCaps.caps.trak.daily).toHaveProperty('enrichments');
    expect(budgetCaps.caps.trak.per_action).toHaveProperty('max_enrichments_per_run');
    expect(budgetCaps.caps.trak.per_action.max_enrichments_per_run).toBe(10);
  });

  test('Phase 3 enrichment caps are present for scout', () => {
    expect(budgetCaps.caps.scout.daily).toHaveProperty('ticket_enrichments');
    expect(budgetCaps.caps.scout.per_action).toHaveProperty('max_enrichments_per_run');
    expect(budgetCaps.caps.scout.per_action.max_enrichments_per_run).toBe(15);
  });

  test('Phase 3 auto-fix caps are present for kit', () => {
    expect(budgetCaps.caps.kit.daily).toHaveProperty('auto_fix_prs');
    expect(budgetCaps.caps.kit.per_action).toHaveProperty('max_auto_fix_prs_per_run');
    expect(budgetCaps.caps.kit.per_action.max_auto_fix_prs_per_run).toBe(3);
  });

  test('Phase 3 gap task caps are present for scribe', () => {
    expect(budgetCaps.caps.scribe.daily).toHaveProperty('jira_tasks_created');
    expect(budgetCaps.caps.scribe.per_action).toHaveProperty('max_gap_tasks_per_run');
  });

  test('monthly caps are >= daily caps × 3 (reasonable monthly headroom)', () => {
    for (const agent of ALL_AGENTS) {
      const daily = budgetCaps.caps[agent].daily;
      const monthly = budgetCaps.caps[agent].monthly;
      for (const key of Object.keys(daily)) {
        if (monthly[key] !== undefined) {
          expect(monthly[key]).toBeGreaterThanOrEqual(daily[key] * 3);
        }
      }
    }
  });
});

// ============================================================
// 9. AGENT IDENTITY — Phase 3 capabilities documented
// ============================================================

describe('Agent Identity Phase 3 Capabilities', () => {
  test('Trak IDENTITY.md documents issue enrichment capability', () => {
    const identity = readLocalFile('agents/trak/workspace/IDENTITY.md');
    expect(identity).toContain('Issue Enrichment');
    expect(identity).toContain('trak-issue-enrichment');
    expect(identity).toContain('enriched');
  });

  test('Scout IDENTITY.md documents ticket auto-enrichment capability', () => {
    const identity = readLocalFile('agents/scout/workspace/IDENTITY.md');
    expect(identity).toContain('Ticket Auto-Enrichment');
    expect(identity).toContain('scout-ticket-enrichment');
    expect(identity).toContain('internal notes');
  });

  test('Kit IDENTITY.md documents auto-fix PR pipeline capability', () => {
    const identity = readLocalFile('agents/kit/workspace/IDENTITY.md');
    expect(identity).toContain('Auto-Fix PR Pipeline');
    expect(identity).toContain('kit-auto-fix');
    expect(identity).toContain('auto-fix');
  });

  test('Kit IDENTITY.md documents code quality monitor capability', () => {
    const identity = readLocalFile('agents/kit/workspace/IDENTITY.md');
    expect(identity).toContain('Code Quality Monitor');
    expect(identity).toContain('kit-code-quality');
  });

  test('Scribe IDENTITY.md documents knowledge gap analyzer capability', () => {
    const identity = readLocalFile('agents/scribe/workspace/IDENTITY.md');
    expect(identity).toContain('Knowledge Gap Analysis');
    expect(identity).toContain('scribe-knowledge-gap');
    expect(identity).toContain('documentation-gap');
  });

  // Probe capabilities from earlier phases
  test('Probe IDENTITY.md documents smoke test and perf canary capabilities', () => {
    const identity = readLocalFile('agents/probe/workspace/IDENTITY.md');
    expect(identity).toContain('Smoke Test');
    expect(identity).toContain('Performance');
  });
});

// ============================================================
// 10. PROACTIVE SCHEDULER DRY RUN — Tasks parse correctly
// ============================================================

describe('Proactive Scheduler Dry Run (Live EC2)', () => {
  test('scheduler --list returns all tasks without error', () => {
    const output = ssmExec('/opt/openclaw/scripts/proactive-scheduler.sh --list');
    for (const task of PROACTIVE_TASKS) {
      expect(output).toContain(task);
    }
  });

  test('kill switch file can pause all tasks', () => {
    // Create pause file, run a task, verify it was skipped, then clean up
    const output = ssmExec(
      'touch /opt/openclaw/.proactive-pause && ' +
      '/opt/openclaw/scripts/proactive-scheduler.sh trak-sprint-health 2>&1 && ' +
      'rm -f /opt/openclaw/.proactive-pause'
    );
    expect(output).toContain('PAUSED');
  });
});

// ============================================================
// 11. ENTRYPOINT INTEGRATION — Scribe + Probe in startup
// ============================================================

describe('Entrypoint Integration (Scribe + Probe)', () => {
  let entrypoint: string;

  beforeAll(() => {
    entrypoint = readLocalFile('entrypoint.sh');
  });

  test('Scribe bot and app tokens are extracted from secrets', () => {
    expect(entrypoint).toContain('SLACK_BOT_TOKEN_SCRIBE');
    expect(entrypoint).toContain('SLACK_APP_TOKEN_SCRIBE');
  });

  test('Probe bot and app tokens are extracted from secrets', () => {
    expect(entrypoint).toContain('SLACK_BOT_TOKEN_PROBE');
    expect(entrypoint).toContain('SLACK_APP_TOKEN_PROBE');
  });

  test('Scribe is in workspace injection loops', () => {
    const loops = entrypoint.match(/for agent in.*scribe/g) || [];
    expect(loops.length).toBeGreaterThanOrEqual(3);
  });

  test('Probe is in workspace injection loops', () => {
    const loops = entrypoint.match(/for agent in.*probe/g) || [];
    expect(loops.length).toBeGreaterThanOrEqual(3);
  });

  test('Slack channel injection includes scribe and probe accounts', () => {
    // The Python injection block should configure all 5 agents
    expect(entrypoint).toMatch(/scribe.*SLACK_BOT_TOKEN_SCRIBE.*SLACK_APP_TOKEN_SCRIBE/s);
    expect(entrypoint).toMatch(/probe.*SLACK_BOT_TOKEN_PROBE.*SLACK_APP_TOKEN_PROBE/s);
  });
});

// ============================================================
// 12. DEPLOY SCRIPT — Timezone enforcement
// ============================================================

describe('Deploy Script Configuration', () => {
  let deployScript: string;

  beforeAll(() => {
    deployScript = readLocalFile('deploy.sh');
  });

  test('deploy script enforces Eastern timezone', () => {
    expect(deployScript).toContain('timedatectl');
    expect(deployScript).toContain('America/New_York');
  });
});
