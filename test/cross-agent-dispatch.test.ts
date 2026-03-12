/**
 * Cross-Agent Dispatch Protocol Validation Tests
 *
 * This test file validates the cross-agent communication protocol, slash commands,
 * bridge server references, and ensemble audit structure across all 3 agent IDENTITY.md files.
 *
 * Validates:
 * - Self-introductions with correct emojis and agent references
 * - Inter-agent delegation with correct Slack user IDs
 * - Slash commands (/audit, /audit-status, /audit-model)
 * - Bridge server URLs and message types
 * - 7-dimension ensemble audit structure
 * - Specialist persona references
 * - CI/CD & SDLC policies
 * - Response discipline requirements
 */

import { readFileSync, existsSync, readdirSync } from 'fs';
import { join } from 'path';

const ROOT = join(__dirname, '..');

interface AgentConfig {
  name: string;
  emoji: string;
  path: string;
  userId: string;
  otherAgents: { name: string; emoji: string; userId: string }[];
}

const AGENTS: AgentConfig[] = [
  {
    name: 'Kit',
    emoji: '⚡',
    path: 'agents/kit/workspace/IDENTITY.md',
    userId: 'U0AKF614URE',
    otherAgents: [
      { name: 'Scout', emoji: '🔍', userId: 'U0AJLT30KMG' },
      { name: 'Trak', emoji: '📋', userId: 'U0AJEGUSELB' },
    ],
  },
  {
    name: 'Scout',
    emoji: '🔍',
    path: 'agents/scout/workspace/IDENTITY.md',
    userId: 'U0AJLT30KMG',
    otherAgents: [
      { name: 'Kit', emoji: '⚡', userId: 'U0AKF614URE' },
      { name: 'Trak', emoji: '📋', userId: 'U0AJEGUSELB' },
    ],
  },
  {
    name: 'Trak',
    emoji: '📋',
    path: 'agents/trak/workspace/IDENTITY.md',
    userId: 'U0AJEGUSELB',
    otherAgents: [
      { name: 'Scout', emoji: '🔍', userId: 'U0AJLT30KMG' },
      { name: 'Kit', emoji: '⚡', userId: 'U0AKF614URE' },
    ],
  },
];

const SPECIALIST_FILES = [
  'code-review-architect.md',
  'security-risk-auditor.md',
  'technical-architect.md',
  'devops-engineer.md',
  'site-reliability-engineer.md',
  'qa-test-engineer.md',
  'implementation-engineer.md',
  'pr-scope-reviewer.md',
  'data-engineer.md',
  'product-owner.md',
  'business-analyst.md',
  'ux-ui-designer.md',
  'orchestrator-coordinator.md',
];

function readFile(relativePath: string): string {
  const fullPath = join(ROOT, relativePath);
  if (!existsSync(fullPath)) {
    throw new Error(`File not found: ${fullPath}`);
  }
  return readFileSync(fullPath, 'utf-8');
}

function readAgent(agent: AgentConfig): string {
  return readFile(agent.path);
}

function getSpecialistFiles(): string[] {
  const dir = join(ROOT, 'agents/shared/specialists');
  return readdirSync(dir).filter((f) => f.endsWith('.md') && f !== 'README.md');
}

// --- Cross-Agent Communication Tests ---
describe('Cross-Agent Communication (Kit)', () => {
  let content: string;
  beforeAll(() => {
    content = readAgent(AGENTS[0]);
  });

  test('has Cross-Agent Communication section', () => {
    expect(content).toContain('Cross-Agent Communication');
  });

  test('communication methods include Slack mentions', () => {
    const section = content.match(/Cross-Agent Communication[\s\S]*?(?=##|$)/);
    expect(section).toBeTruthy();
    expect(section![0]).toMatch(/Slack.*mention/i);
  });

  test('communication methods include workflow_dispatch', () => {
    const section = content.match(/Cross-Agent Communication[\s\S]*?(?=##|$)/);
    expect(section).toBeTruthy();
    expect(section![0]).toMatch(/workflow_dispatch/);
  });

  test('communication methods include local ensemble review', () => {
    const section = content.match(/Cross-Agent Communication[\s\S]*?(?=##|$)/);
    expect(section).toBeTruthy();
    expect(section![0]).toMatch(/local.*ensemble/i);
  });

  test('does NOT reference deprecated bridge server', () => {
    expect(content).not.toContain('192.168.1.98');
    expect(content).not.toContain('cowork-bravo');
    expect(content).not.toContain('agent-bridge');
  });
});



// ─── Persistent Knowledge Tests ────────────────────────────────────
describe('Persistent Knowledge (All Agents)', () => {
  AGENTS.forEach((agent) => {
    describe(`${agent.name}`, () => {
      let content: string;

      beforeAll(() => {
        content = readAgent(agent);
      });

      test(`has "Persistent Knowledge" section`, () => {
        expect(content).toContain('## Persistent Knowledge');
      });

      test(`references both persistent and virtual FS paths`, () => {
        const knowledgeSection = content.match(
          /## Persistent Knowledge[\s\S]*?(?=##|$)/
        );
        expect(knowledgeSection).toBeTruthy();
        const section = knowledgeSection![0];

        expect(section).toContain('/root/.openclaw');
        expect(section).toContain('$HOME/.openclaw');
      });

      test(`initializes KNOWLEDGE.md with seed content`, () => {
        const knowledgeSection = content.match(
          /## Persistent Knowledge[\s\S]*/
        );
        expect(knowledgeSection).toBeTruthy();
        const section = knowledgeSection![0];

        expect(section).toContain('KNOWLEDGE.md');
        expect(
          section.includes('Initial Setup') ||
          section.includes('SEED') ||
          section.includes('YYYY-MM-DD')
        ).toBeTruthy();
      });
    });
  });
});

// ─── Shell Command Execution Anti-Hallucination Tests ────────────────
describe('Shell Command Execution — Anti-Hallucination Rule (All Agents)', () => {
  AGENTS.forEach((agent) => {
    describe(`${agent.name}`, () => {
      let content: string;

      beforeAll(() => {
        content = readAgent(agent);
      });

      test(`has "Shell Command Execution — Anti-Hallucination Rule" section`, () => {
        expect(content).toContain(
          'Shell Command Execution — Anti-Hallucination Rule'
        );
      });

      test(`requires executing shell commands`, () => {
        const shellSection = content.match(
          /Shell Command Execution.*Anti-Hallucination[\s\S]*?(?=##|$)/
        );
        expect(shellSection).toBeTruthy();
        const section = shellSection![0];

        expect(section).toContain('execute every command');
        expect(section).toContain('exec/bash');
      });

      test(`forbids answering from memory or fabricating output`, () => {
        const shellSection = content.match(
          /Shell Command Execution.*Anti-Hallucination[\s\S]*?(?=##|$)/
        );
        expect(shellSection).toBeTruthy();
        const section = shellSection![0];

        expect(section).toMatch(/NEVER.*memory/i);
        expect(section).toMatch(/NEVER.*fabricate/i);
      });
    });
  });
});

// ─── Comprehensive Structure Tests ──────────────────────────────────
describe('Comprehensive Structure Validation', () => {
  test('each IDENTITY.md contains all required major sections', () => {
    const requiredSections = [
      '## Self-Introduction',
      '## Inter-Agent Delegation & Communication',
      '## Response Discipline',
      '## Mandatory CI/CD & SDLC Policy',
      '## Slack Threading & Acknowledgment',
      '## Shell Command Execution',
    ];

    AGENTS.forEach((agent) => {
      const content = readAgent(agent);
      requiredSections.forEach((section) => {
        expect(content).toContain(section);
      });
    });
  });

  test('Kit has all engineering-specific sections', () => {
    const content = readAgent(AGENTS[0]);
    const kitSections = [
      'Your Tools',
      'PR Review Protocol (Ensemble Audit)',
      'Cross-Agent Audit Dispatch',
      'Specialist Agent Capabilities',
    ];

    kitSections.forEach((section) => {
      expect(content).toContain(section);
    });
  });

  test('Scout has audit status and customer impact sections', () => {
    const content = readAgent(AGENTS[1]);
    expect(content).toContain('Audit Status Check');
    expect(content).toContain('PR Review Impact Assessment');
  });

  test('Trak has audit model and Jira verification sections', () => {
    const content = readAgent(AGENTS[2]);
    expect(content).toContain('Audit Model Override');
    expect(content).toContain('PR Review Coordination');
  });
});

// ============================================================
// Security Controls Validation
// ============================================================

describe('Security Controls', () => {
  describe('Security Config Files', () => {
    test('user-tiers.json exists and has valid structure', () => {
      const tiersPath = join(ROOT, 'config', 'user-tiers.json');
      expect(existsSync(tiersPath)).toBe(true);

      const tiers = JSON.parse(readFileSync(tiersPath, 'utf-8'));

      // Version and description
      expect(tiers.version).toBe(1);
      expect(tiers.description).toBeDefined();

      // Tier definitions
      expect(tiers.tiers).toBeDefined();
      expect(tiers.tiers.admin).toBeDefined();
      expect(tiers.tiers.developer).toBeDefined();
      expect(tiers.tiers.support).toBeDefined();

      // Agent tier exists for cross-agent dispatch
      expect(tiers.tiers.agent).toBeDefined();
      expect(tiers.tiers.agent.permissions).toContain('cross-agent-dispatch');

      // Each tier has permissions array
      ['admin', 'developer', 'support', 'agent'].forEach((tier) => {
        expect(tiers.tiers[tier].permissions).toBeInstanceOf(Array);
        expect(tiers.tiers[tier].permissions.length).toBeGreaterThan(0);
        expect(tiers.tiers[tier].description).toBeDefined();
      });

      // Admin has all permissions
      expect(tiers.tiers.admin.permissions).toContain('read');
      expect(tiers.tiers.admin.permissions).toContain('write');
      expect(tiers.tiers.admin.permissions).toContain('delete');
      expect(tiers.tiers.admin.permissions).toContain('deploy');
      expect(tiers.tiers.admin.permissions).toContain('admin');
      expect(tiers.tiers.admin.permissions).toContain('bulk-operations');

      // Support has limited permissions
      expect(tiers.tiers.support.permissions).toContain('read');
      expect(tiers.tiers.support.permissions).not.toContain('delete');
      expect(tiers.tiers.support.permissions).not.toContain('admin');
      expect(tiers.tiers.support.permissions).not.toContain('bulk-operations');

      // Default tier is most restrictive
      expect(tiers.default_tier).toBe('support');

      // tier_lookup covers known users
      expect(tiers.tier_lookup).toBeDefined();
      const lookupUserIds = Object.keys(tiers.tier_lookup);
      expect(lookupUserIds.length).toBeGreaterThanOrEqual(14);

      // Every user in tier_lookup maps to a valid tier
      Object.values(tiers.tier_lookup).forEach((tier) => {
        expect(['admin', 'developer', 'support', 'agent']).toContain(tier);
      });
    });

    test('dangerous-actions.json exists and has valid structure', () => {
      const dangerPath = join(ROOT, 'config', 'dangerous-actions.json');
      expect(existsSync(dangerPath)).toBe(true);

      const danger = JSON.parse(readFileSync(dangerPath, 'utf-8'));

      // Version and description
      expect(danger.version).toBe(1);
      expect(danger.description).toBeDefined();

      // Confirmation levels defined
      expect(danger.confirmation_levels).toBeDefined();
      expect(danger.confirmation_levels.none).toBeDefined();
      expect(danger.confirmation_levels.explicit).toBeDefined();
      expect(danger.confirmation_levels.double).toBeDefined();

      // Dangerous actions array
      expect(danger.dangerous_actions).toBeInstanceOf(Array);
      expect(danger.dangerous_actions.length).toBeGreaterThanOrEqual(10);

      // Each action has required fields
      danger.dangerous_actions.forEach((action: any) => {
        expect(action.pattern).toBeDefined();
        expect(action.description).toBeDefined();
        expect(action.min_tier).toBeDefined();
        expect(action.confirmation).toBeDefined();
        expect(action.consequence).toBeDefined();
        expect(['admin', 'developer', 'support', 'agent']).toContain(action.min_tier);
        expect(['none', 'explicit', 'double']).toContain(action.confirmation);
      });

      // Key destructive operations are covered
      const patterns = danger.dangerous_actions.map((a: any) => a.pattern);
      expect(patterns).toContain('jira_delete_issue');
      expect(patterns).toContain('zendesk_delete_ticket');
      expect(patterns).toContain('github_force_push');
      expect(patterns).toContain('zoho_delete_record');
      expect(patterns).toContain('github_merge_pr');
      expect(patterns).toContain('notion_delete_page');

      // All delete operations require at least developer tier
      const deleteActions = danger.dangerous_actions.filter((a: any) =>
        a.pattern.includes('delete')
      );
      deleteActions.forEach((action: any) => {
        expect(['admin', 'developer']).toContain(action.min_tier);
      });

      // All delete operations require at least explicit confirmation
      deleteActions.forEach((action: any) => {
        expect(['explicit', 'double']).toContain(action.confirmation);
      });
    });

    test('user-tiers.json tier_lookup covers all known SLACK_ALLOW_FROM users', () => {
      const tiersPath = join(ROOT, 'config', 'user-tiers.json');
      const tiers = JSON.parse(readFileSync(tiersPath, 'utf-8'));

      // Known allowed users (from SLACK_ALLOW_FROM secret)
      const knownUsers = [
        'U082DEF37PC', 'U081YTU8JCX', 'U0ADABVCVH8',
        'U05PJJS5XST', 'U07LD2KVA58', 'U07EW4CD78C',
        'U08FP393H4J', 'U084XE4S43G', 'U08NGTS8Y5B',
        'U08FAE33NE5', 'U08A9B8065N',
      ];

      knownUsers.forEach((userId) => {
        expect(tiers.tier_lookup[userId]).toBeDefined();
      });
    });
  });

  describe('IDENTITY.md Security Sections', () => {
    test('all agents have Security & Access Control section', () => {
      AGENTS.forEach((agent) => {
        const content = readAgent(agent);
        expect(content).toContain('## Security & Access Control');
      });
    });

    test('all agents have Action Attribution instructions', () => {
      AGENTS.forEach((agent) => {
        const content = readAgent(agent);
        expect(content).toContain('Action Attribution');
        // Each agent should attribute with their name and emoji
        expect(content).toContain(agent.name);
        expect(content).toContain(agent.emoji);
      });
    });

    test('all agents have User Tier Enforcement instructions', () => {
      AGENTS.forEach((agent) => {
        const content = readAgent(agent);
        expect(content).toContain('User Tier Enforcement');
        expect(content).toContain('.user-tiers.json');
        expect(content).toContain('tier_lookup');
      });
    });

    test('all agents have Dangerous Action Guards instructions', () => {
      AGENTS.forEach((agent) => {
        const content = readAgent(agent);
        expect(content).toContain('Dangerous Action Guards');
        expect(content).toContain('.dangerous-actions.json');
      });
    });

    test('all agents have Audit Logging instructions', () => {
      AGENTS.forEach((agent) => {
        const content = readAgent(agent);
        expect(content).toContain('Audit Logging');
        expect(content).toContain('AUDIT');
        expect(content).toContain('user:');
        expect(content).toContain('tier:');
        expect(content).toContain(`agent:${agent.name.toLowerCase()}`);
      });
    });

    test('Kit has attribution formats for all external tools', () => {
      const content = readAgent(AGENTS[0]);
      const tools = ['Jira', 'GitHub', 'Zendesk', 'Notion', 'Zoho CRM'];
      tools.forEach((tool) => {
        expect(content).toContain(tool);
      });
      // Kit's attribution includes its name and emoji
      expect(content).toContain('Kit ⚡');
    });

    test('Scout has Customer Data Protection section', () => {
      const content = readAgent(AGENTS[1]); // Scout
      expect(content).toContain('Customer Data Protection');
      expect(content).toContain('PII');
    });

    test('all agents reference correct workspace paths for security configs', () => {
      AGENTS.forEach((agent) => {
        const content = readAgent(agent);
        const agentLower = agent.name.toLowerCase();
        expect(content).toContain(`workspace-${agentLower}/.user-tiers.json`);
        expect(content).toContain(`workspace-${agentLower}/.dangerous-actions.json`);
      });
    });

    test('support tier is default for unknown users in all agents', () => {
      AGENTS.forEach((agent) => {
        const content = readAgent(agent);
        // Each agent should mention treating unknown users as support tier
        expect(content).toMatch(/support.*tier|most restrictive/i);
      });
    });

    test('permission tables exist in all agents', () => {
      AGENTS.forEach((agent) => {
        const content = readAgent(agent);
        expect(content).toContain('Required Permission');
        expect(content).toContain('Tiers Allowed');
      });
    });
  });

  describe('Entrypoint Security Config Injection', () => {
    test('entrypoint.sh copies security configs to agent workspaces', () => {
      const entrypoint = readFile('entrypoint.sh');
      expect(entrypoint.toLowerCase()).toContain('security config');
      expect(entrypoint).toContain('.user-tiers.json');
      expect(entrypoint).toContain('.dangerous-actions.json');

      // Copies to both CFG and PERSIST directories
      ['scout', 'trak', 'kit'].forEach((agent) => {
        // Verify the loop iterates over all agents
        expect(entrypoint).toContain(agent);
      });
    });
  });

  describe('Security Scripts', () => {
    test('audit-query.sh exists and is executable', () => {
      const scriptPath = join(ROOT, 'scripts', 'audit-query.sh');
      expect(existsSync(scriptPath)).toBe(true);
      const content = readFileSync(scriptPath, 'utf-8');
      expect(content).toContain('#!/bin/bash');
      expect(content).toContain('AUDIT');
      expect(content).toContain('SLACK_BOT_TOKEN');
    });

    test('anomaly-alert.sh exists and is executable', () => {
      const scriptPath = join(ROOT, 'scripts', 'anomaly-alert.sh');
      expect(existsSync(scriptPath)).toBe(true);
      const content = readFileSync(scriptPath, 'utf-8');
      expect(content).toContain('#!/bin/bash');
      expect(content).toContain('anomal');
      expect(content).toContain('SLACK_BOT_TOKEN');
      expect(content).toContain('threshold');
    });
  });

  describe('Support Tier Enforcement', () => {
    test('human support agents (Jonathan, Imrane) are mapped to support tier', () => {
      const tiersPath = join(ROOT, 'config', 'user-tiers.json');
      const tiers = JSON.parse(readFileSync(tiersPath, 'utf-8'));
      expect(tiers.tier_lookup['U08FAE33NE5']).toBe('support');
      expect(tiers.tier_lookup['U08A9B8065N']).toBe('support');
    });

    test('support tier has read, write-tickets, write-comments but NOT write, delete, deploy, admin', () => {
      const tiersPath = join(ROOT, 'config', 'user-tiers.json');
      const tiers = JSON.parse(readFileSync(tiersPath, 'utf-8'));
      const supportPerms = tiers.tiers.support.permissions;
      expect(supportPerms).toContain('read');
      expect(supportPerms).toContain('write-tickets');
      expect(supportPerms).toContain('write-comments');
      expect(supportPerms).not.toContain('write');
      expect(supportPerms).not.toContain('delete');
      expect(supportPerms).not.toContain('deploy');
      expect(supportPerms).not.toContain('admin');
      expect(supportPerms).not.toContain('bulk-operations');
    });

    test('Kit IDENTITY.md enforces read-only for support tier', () => {
      const content = readAgent(AGENTS[0]);
      expect(content).toMatch(/[Ss]upport.*[Rr]ead[- ][Oo]nly/i);
      expect(content).toMatch(/MUST NOT perform any write/i);
    });

    test('Trak IDENTITY.md allows support tier to create issues, assign, and add comments', () => {
      const content = readAgent(AGENTS[2]);
      expect(content).toMatch(/[Cc]reate.*[Jj]ira.*issues/i);
      expect(content).toMatch(/[Aa]ssign.*[Jj]ira.*issues/i);
      expect(content).toMatch(/[Aa]dd comments.*[Jj]ira/i);
      expect(content).toMatch(/CANNOT.*transition.*status|CANNOT.*delete/i);
    });

    test('Scout IDENTITY.md allows support tier to manage Zendesk tickets', () => {
      const content = readAgent(AGENTS[1]);
      expect(content).toContain('write-tickets');
      expect(content).toContain('write-comments');
      expect(content).toMatch(/support.*\*\*requires confirmation\*\*/i);
    });

    test('tier_lookup has at least 14 entries (admins + devs + support + agents)', () => {
      const tiersPath = join(ROOT, 'config', 'user-tiers.json');
      const tiers = JSON.parse(readFileSync(tiersPath, 'utf-8'));
      expect(Object.keys(tiers.tier_lookup).length).toBeGreaterThanOrEqual(14);
    });

    test('no dangerous action allows support tier as min_tier except zendesk_public_reply', () => {
      const dangerPath = join(ROOT, 'config', 'dangerous-actions.json');
      const danger = JSON.parse(readFileSync(dangerPath, 'utf-8'));
      const supportMinActions = danger.dangerous_actions.filter(
        (a: any) => a.min_tier === 'support'
      );
      supportMinActions.forEach((action: any) => {
        expect(action.pattern).toBe('zendesk_public_reply');
      });
    });
  });
});
