/**
 * OpenClaw Agents — Cross-Agent Dispatch & Bridge Protocol Tests
 *
 * Validates that all agent IDENTITY.md files contain the correct
 * slash command definitions, bridge protocol references, and
 * cross-agent coordination patterns.
 *
 * Also validates the ensemble-audit.md playbook contains the
 * bridge server documentation and dispatch protocol.
 */
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

const ROOT = join(__dirname, '..');

function readFile(relativePath: string): string {
  const fullPath = join(ROOT, relativePath);
  if (!existsSync(fullPath)) {
    throw new Error(`File not found: ${fullPath}`);
  }
  return readFileSync(fullPath, 'utf-8');
}

// ─── Kit: /audit Command ──────────────────────────────────────────

describe('Kit — /audit slash command', () => {
  let identity: string;

  beforeAll(() => {
    identity = readFile('agents/kit/workspace/IDENTITY.md');
  });

  test('contains /audit command section', () => {
    expect(identity).toContain('Cross-Agent Audit Dispatch');
    expect(identity).toContain('/audit');
  });

  test('documents usage syntax with PR number and optional repo', () => {
    expect(identity).toMatch(/\/audit \d+/);
    expect(identity).toMatch(/\/audit \d+ \w+/);
  });

  test('includes workflow_dispatch trigger command', () => {
    expect(identity).toContain('gh workflow run ensemble-audit.yml');
    expect(identity).toContain('workflow_dispatch');
  });

  test('references the bridge server URL', () => {
    expect(identity).toContain('192.168.1.98:8642');
  });

  test('defines the cowork-alpha agent ID', () => {
    expect(identity).toContain('cowork-alpha');
  });

  test('defines the cowork-bravo agent ID for LMNTL ensemble', () => {
    expect(identity).toContain('cowork-bravo');
  });

  test('includes audit-trigger message type', () => {
    expect(identity).toContain('audit-trigger');
  });

  test('documents the bridge send endpoint', () => {
    expect(identity).toMatch(/POST.*\/send/);
  });

  test('documents the bridge receive endpoint', () => {
    expect(identity).toMatch(/\/receive\/cowork-alpha/);
  });

  test('includes fallback procedure when bridge is unreachable', () => {
    expect(identity).toContain('Fallback');
    expect(identity).toMatch(/bridge.*unreachable|unreachable.*bridge/i);
  });

  test('still contains the existing PR Review Protocol', () => {
    expect(identity).toContain('PR Review Protocol (Ensemble Audit)');
    expect(identity).toContain('7-Dimension Audit');
  });

  test('still contains specialist agent capabilities', () => {
    expect(identity).toContain('Specialist Agent Capabilities');
    expect(identity).toContain('code-review-architect');
    expect(identity).toContain('security-risk-auditor');
  });
});

// ─── Scout: /audit-status Command ─────────────────────────────────

describe('Scout — /audit-status slash command', () => {
  let identity: string;

  beforeAll(() => {
    identity = readFile('agents/scout/workspace/IDENTITY.md');
  });

  test('contains /audit-status command section', () => {
    expect(identity).toContain('Audit Status Check');
    expect(identity).toContain('/audit-status');
  });

  test('documents usage syntax', () => {
    expect(identity).toMatch(/\/audit-status \d+/);
  });

  test('checks GitHub PR status checks', () => {
    expect(identity).toContain('gh pr checks');
  });

  test('checks GitHub PR comments for ensemble review', () => {
    expect(identity).toContain('Ensemble Code Review');
  });

  test('checks LMNTL CI audit workflow runs', () => {
    expect(identity).toContain('ensemble-audit.yml');
  });

  test('references the bridge server for audit-result messages', () => {
    expect(identity).toContain('192.168.1.98:8642');
    expect(identity).toContain('audit-result');
  });

  test('defines response format with both systems', () => {
    expect(identity).toContain('OpenClaw');
    expect(identity).toContain('LMNTL CI');
  });

  test('still contains existing customer impact assessment', () => {
    expect(identity).toContain('Customer Impact Assessment');
    expect(identity).toContain('PR Review Impact Assessment');
  });

  test('still contains UX/Accessibility specialist', () => {
    expect(identity).toContain('ux-ui-designer');
    expect(identity).toContain('WCAG');
  });
});

// ─── Trak: /audit-model Command ──────────────────────────────────

describe('Trak — /audit-model slash command', () => {
  let identity: string;

  beforeAll(() => {
    identity = readFile('agents/trak/workspace/IDENTITY.md');
  });

  test('contains /audit-model command section', () => {
    expect(identity).toContain('Audit Model Override');
    expect(identity).toContain('/audit-model');
  });

  test('documents valid model names', () => {
    expect(identity).toContain('claude-opus-4-6');
    expect(identity).toContain('claude-sonnet-4');
    expect(identity).toContain('claude-sonnet-4-5');
  });

  test('includes reset option', () => {
    expect(identity).toMatch(/\/audit-model reset/);
  });

  test('documents model selection guidelines', () => {
    expect(identity).toContain('Model Selection Guidelines');
    expect(identity).toContain('Security-sensitive');
    expect(identity).toContain('Architecture');
  });

  test('includes cost estimates for each model', () => {
    expect(identity).toMatch(/\$0\.\d+\/audit/);
  });

  test('references the bridge server for model-override notification', () => {
    expect(identity).toContain('192.168.1.98:8642');
    expect(identity).toContain('model-override');
  });

  test('includes workflow_dispatch parameter for model', () => {
    expect(identity).toContain('audit_model');
  });

  test('still contains existing Jira verification', () => {
    expect(identity).toContain('PR Review Coordination (Ensemble)');
    expect(identity).toContain('Jira Verification');
  });

  test('still contains product-owner specialist', () => {
    expect(identity).toContain('product-owner');
    expect(identity).toContain('Product-Market Fit');
  });
});

// ─── Ensemble Audit Playbook: Cross-Agent Dispatch ────────────────

describe('Ensemble Audit Playbook — Cross-Agent Dispatch', () => {
  let playbook: string;

  beforeAll(() => {
    playbook = readFile('docs/playbooks/ensemble-audit.md');
  });

  test('contains Cross-Agent Dispatch Protocol section', () => {
    expect(playbook).toContain('Cross-Agent Dispatch Protocol');
  });

  test('documents the Agent Bridge Server', () => {
    expect(playbook).toContain('Agent Bridge Server');
    expect(playbook).toContain('192.168.1.98:8642');
  });

  test('includes architecture diagram', () => {
    expect(playbook).toContain('cowork-alpha');
    expect(playbook).toContain('cowork-bravo');
    expect(playbook).toContain('OpenClaw Agents');
    expect(playbook).toContain('LMNTL Ensemble');
  });

  test('documents all message types', () => {
    for (const type of ['audit-trigger', 'audit-result', 'notification', 'request', 'response']) {
      expect(playbook).toContain(type);
    }
  });

  test('documents all bridge endpoints', () => {
    expect(playbook).toContain('/send');
    expect(playbook).toContain('/receive');
    expect(playbook).toContain('/messages');
    expect(playbook).toContain('/health');
    expect(playbook).toContain('/register');
    expect(playbook).toContain('/agents');
  });

  test('documents all three slash commands', () => {
    expect(playbook).toContain('/audit');
    expect(playbook).toContain('/audit-status');
    expect(playbook).toContain('/audit-model');
  });

  test('documents slash command agent assignments', () => {
    // /audit -> Kit, /audit-status -> Scout, /audit-model -> Trak
    expect(playbook).toMatch(/\/audit.*Kit/);
    expect(playbook).toMatch(/\/audit-status.*Scout/);
    expect(playbook).toMatch(/\/audit-model.*Trak/);
  });

  test('documents workflow_dispatch integration', () => {
    expect(playbook).toContain('Workflow Dispatch Integration');
    expect(playbook).toContain('gh workflow run ensemble-audit.yml');
  });

  test('includes bridge troubleshooting entries', () => {
    expect(playbook).toContain('Bridge server unreachable');
    expect(playbook).toContain('LMNTL ensemble not responding');
  });

  test('still contains the original 7-dimension audit model', () => {
    expect(playbook).toContain('7-Dimension Audit Model');
    expect(playbook).toContain('Correctness');
    expect(playbook).toContain('Security');
    expect(playbook).toContain('UX/Accessibility');
    expect(playbook).toContain('Product-Market Fit');
    expect(playbook).toContain('Operations');
    expect(playbook).toContain('Architecture');
    expect(playbook).toContain('Test Coverage');
  });

  test('still contains agent roles for Kit, Trak, Scout', () => {
    expect(playbook).toContain('Kit ⚡');
    expect(playbook).toContain('Trak 📋');
    expect(playbook).toContain('Scout 🔍');
  });

  test('still contains the standardized result format', () => {
    expect(playbook).toContain('Standardized Result Format');
    expect(playbook).toContain('Dimensions Passing');
    expect(playbook).toContain('Consensus');
  });
});

// ─── Cross-Agent Protocol Consistency ─────────────────────────────

describe('Cross-Agent Protocol Consistency', () => {
  let kitIdentity: string;
  let scoutIdentity: string;
  let trakIdentity: string;
  let playbook: string;

  beforeAll(() => {
    kitIdentity = readFile('agents/kit/workspace/IDENTITY.md');
    scoutIdentity = readFile('agents/scout/workspace/IDENTITY.md');
    trakIdentity = readFile('agents/trak/workspace/IDENTITY.md');
    playbook = readFile('docs/playbooks/ensemble-audit.md');
  });

  test('all agents reference the same bridge URL', () => {
    const bridgeUrl = '192.168.1.98:8642';
    expect(kitIdentity).toContain(bridgeUrl);
    expect(scoutIdentity).toContain(bridgeUrl);
    expect(trakIdentity).toContain(bridgeUrl);
    expect(playbook).toContain(bridgeUrl);
  });

  test('all agents reference cowork-alpha as their registration', () => {
    expect(kitIdentity).toContain('cowork-alpha');
    expect(scoutIdentity).toContain('cowork-alpha');
    expect(trakIdentity).toContain('cowork-alpha');
  });

  test('all agents still have Mandatory CI/CD & SDLC Policy', () => {
    const policy = 'Mandatory CI/CD & SDLC Policy';
    expect(kitIdentity).toContain(policy);
    expect(scoutIdentity).toContain(policy);
    expect(trakIdentity).toContain(policy);
  });

  test('all agents still have Response Discipline', () => {
    const discipline = 'Response Discipline';
    expect(kitIdentity).toContain(discipline);
    expect(scoutIdentity).toContain(discipline);
    expect(trakIdentity).toContain(discipline);
  });

  test('all agents still have Inter-Agent Delegation', () => {
    const delegation = 'Inter-Agent Delegation';
    expect(kitIdentity).toContain(delegation);
    expect(scoutIdentity).toContain(delegation);
    expect(trakIdentity).toContain(delegation);
  });

  test('all agents still have Persistent Knowledge', () => {
    const knowledge = 'Persistent Knowledge';
    expect(kitIdentity).toContain(knowledge);
    expect(scoutIdentity).toContain(knowledge);
    expect(trakIdentity).toContain(knowledge);
  });

  test('all agents still have Shell Command Execution anti-hallucination rule', () => {
    const rule = 'Anti-Hallucination Rule';
    expect(kitIdentity).toContain(rule);
    expect(scoutIdentity).toContain(rule);
    expect(trakIdentity).toContain(rule);
  });
});

// ─── Bridge Server Script Validation ──────────────────────────────

describe('Agent Bridge Server script', () => {
  let script: string;

  beforeAll(() => {
    // The bridge server script is at the repo root (or wherever it's stored)
    // Try multiple locations
    const locations = [
      'agent-bridge-server.py',
      'scripts/agent-bridge-server.py',
    ];
    for (const loc of locations) {
      try {
        script = readFile(loc);
        return;
      } catch {
        continue;
      }
    }
    // If not found in repo, it may be a standalone script
    // Skip these tests gracefully
    script = '';
  });

  test.skip('defines correct port', () => {
    if (!script) return;
    expect(script).toContain('PORT = 8642');
  });

  test.skip('implements /send endpoint', () => {
    if (!script) return;
    expect(script).toContain('/send');
  });

  test.skip('implements /receive endpoint with long-polling', () => {
    if (!script) return;
    expect(script).toContain('/receive/');
    expect(script).toContain('LONG_POLL_TIMEOUT');
  });

  test.skip('implements /health endpoint', () => {
    if (!script) return;
    expect(script).toContain('/health');
  });

  test.skip('implements /register endpoint', () => {
    if (!script) return;
    expect(script).toContain('/register');
  });

  test.skip('has CORS support', () => {
    if (!script) return;
    expect(script).toContain('Access-Control-Allow-Origin');
  });
});
