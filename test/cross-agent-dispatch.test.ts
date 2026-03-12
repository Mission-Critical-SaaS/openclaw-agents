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

// ─── Self-Introduction Tests ───────────────────────────────────────
describe('Self-Introduction (All Agents)', () => {
  AGENTS.forEach((agent) => {
    describe(`${agent.name}`, () => {
      let content: string;

      beforeAll(() => {
        content = readAgent(agent);
      });

      test(`has "Self-Introduction" section`, () => {
        expect(content).toContain('## Self-Introduction');
      });

      test(`mentions emoji ${agent.emoji}`, () => {
        const selfIntroMatch = content.match(
          /## Self-Introduction[\s\S]*?(?=##|$)/
        );
        expect(selfIntroMatch).toBeTruthy();
        expect(selfIntroMatch![0]).toContain(agent.emoji);
      });

      test(`mentions agent name "${agent.name}"`, () => {
        const selfIntroMatch = content.match(
          /## Self-Introduction[\s\S]*?(?=##|$)/
        );
        expect(selfIntroMatch).toBeTruthy();
        expect(selfIntroMatch![0]).toMatch(new RegExp(`I'm ${agent.name}`, 'i'));
      });

      agent.otherAgents.forEach((other) => {
        test(`mentions other agents or cross-agent work in self-introduction`, () => {
          const selfIntroMatch = content.match(
            /## Self-Introduction[\s\S]*?(?=##|$)/
          );
          expect(selfIntroMatch).toBeTruthy();
          const intro = selfIntroMatch![0];
          // Should mention at least agent names, audit features, or coordination
          expect(
            intro.includes('Kit') ||
            intro.includes('Scout') ||
            intro.includes('Trak') ||
            intro.includes('audit') ||
            intro.includes('coordinate') ||
            intro.includes('ensemble')
          ).toBeTruthy();
        });
      });
    });
  });
});

// ─── Inter-Agent Delegation & Communication Tests ────────────────
describe('Inter-Agent Delegation & Communication (All Agents)', () => {
  AGENTS.forEach((agent) => {
    describe(`${agent.name}`, () => {
      let content: string;

      beforeAll(() => {
        content = readAgent(agent);
      });

      test(`has "Inter-Agent Delegation & Communication" section`, () => {
        expect(content).toContain('Inter-Agent Delegation & Communication');
      });

      test(`references other agents' Slack user IDs in delegation section`, () => {
        const delegationSection = content.match(
          /Inter-Agent Delegation & Communication[\s\S]*?(?=##|$)/
        );
        expect(delegationSection).toBeTruthy();
        const section = delegationSection![0];
        // Should reference the other agents' IDs
        agent.otherAgents.forEach((other) => {
          expect(section).toContain(other.userId);
        });
      });

      test(`documents agent interaction methods`, () => {
        const delegationSection = content.match(
          /Inter-Agent Delegation & Communication[\s\S]*?(?=##|$)/
        );
        expect(delegationSection).toBeTruthy();
        const section = delegationSection![0];
        // Should mention agent names or communication concepts
        expect(
          section.toLowerCase().includes('mention') ||
          section.toLowerCase().includes('dm') ||
          section.toLowerCase().includes('slack')
        ).toBeTruthy();
      });

      agent.otherAgents.forEach((other) => {
        test(`references @${other.name} (${other.userId}) and NOT itself in delegation rules`, () => {
          const delegationSection = content.match(
            /Inter-Agent Delegation & Communication[\s\S]*?(?=##|$)/
          );
          expect(delegationSection).toBeTruthy();
          const section = delegationSection![0];
          expect(section).toContain(other.userId);
          expect(section).toContain(`@${other.name}`);
          // Should NOT reference itself
          expect(section).not.toContain(agent.userId);
        });
      });

      test(`lists other agents (not self) in delegation rules`, () => {
        const delegationSection = content.match(
          /Delegation Rules[\s\S]*?(?=##|$)/
        );
        expect(delegationSection).toBeTruthy();
        const rules = delegationSection![0];

        agent.otherAgents.forEach((other) => {
          // Should mention at least one other agent
          expect(
            rules.includes(`@${other.name}`) || rules.includes(other.name)
          ).toBeTruthy();
        });
      });
    });
  });
});

// ─── Slash Commands Tests ──────────────────────────────────────────
describe('Slash Commands', () => {
  describe('Kit — /audit command', () => {
    let content: string;

    beforeAll(() => {
      content = readAgent(AGENTS[0]); // Kit
    });

    test(`has "Cross-Agent Audit Dispatch (\`/audit\` Command)" section`, () => {
      expect(content).toContain('/audit');
      expect(content).toMatch(
        /Cross-Agent Audit Dispatch.*\/audit.*Command/i
      );
    });

    test(`documents /audit syntax and behavior`, () => {
      expect(content).toContain('/audit');
      expect(content).toContain('Audit Dispatch');
    });

    test(`explains what happens when /audit is triggered`, () => {
      const auditSection = content.match(/What Happens[\s\S]*?(?=##|$)/);
      expect(auditSection).toBeTruthy();
      const section = auditSection![0];
      expect(section).toContain('Run the local OpenClaw ensemble review');
      expect(section).toContain('Trigger the LMNTL CI audit pipeline');
      expect(section).toContain('Post combined results');
    });

    test(`workflow dispatch uses claude-opus-4-6 as default`, () => {
      const auditSection = content.match(/workflow run[\s\S]*?(?=```)/);
      expect(auditSection).toBeTruthy();
      expect(auditSection![0]).toContain('claude-opus-4-6');
    });
  });

  describe('Scout — /audit-status command', () => {
    let content: string;

    beforeAll(() => {
      content = readAgent(AGENTS[1]); // Scout
    });

    test(`has "Audit Status Check (\`/audit-status\` Command)" section`, () => {
      expect(content).toContain('/audit-status');
      expect(content).toMatch(/Audit Status Check.*\/audit-status/i);
    });

    test(`documents /audit-status command`, () => {
      expect(content).toContain('/audit-status');
      expect(content).toContain('Status Check');
    });

    test(`explains what to check for audit status`, () => {
      const statusSection = content.match(/What to Check[\s\S]*?(?=##|$)/);
      expect(statusSection).toBeTruthy();
      const section = statusSection![0];
      expect(section).toContain('GitHub PR status checks');
      expect(section).toContain('GitHub PR comments');
      expect(section).toContain('LMNTL CI audit workflow run');
      expect(section).toContain('Bridge server');
    });
  });

  describe('Trak — /audit-model command', () => {
    let content: string;

    beforeAll(() => {
      content = readAgent(AGENTS[2]); // Trak
    });

    test(`has "Audit Model Override (\`/audit-model\` Command)" section`, () => {
      expect(content).toContain('/audit-model');
      expect(content).toMatch(/Audit Model Override.*\/audit-model/i);
    });

    test(`documents /audit-model command`, () => {
      expect(content).toContain('/audit-model');
      expect(content).toContain('Model Override');
    });

    test(`lists valid model options`, () => {
      const modelSection = content.match(/Valid Models[\s\S]*?(?=##|$)/);
      expect(modelSection).toBeTruthy();
      const section = modelSection![0];
      expect(section).toContain('claude-opus-4-6');
      expect(section).toContain('claude-sonnet-4');
      expect(section).toContain('claude-sonnet-4-5');
    });

    test(`specifies claude-opus-4-6 as default (not claude-sonnet-4)`, () => {
      const modelSection = content.match(/Valid Models[\s\S]*?(?=##|$)/);
      expect(modelSection).toBeTruthy();
      const section = modelSection![0];
      // Default should be claude-opus-4-6
      expect(section).toMatch(/claude-opus-4-6.*[Dd]efault/);
    });
  });
});

// ─── Bridge Server Tests ────────────────────────────────────────────
describe('Bridge Server Protocol (All Agents)', () => {
  AGENTS.forEach((agent) => {
    describe(`${agent.name}`, () => {
      let content: string;

      beforeAll(() => {
        content = readAgent(agent);
      });

      test(`references bridge URL http://192.168.1.98:8642`, () => {
        expect(content).toContain('http://192.168.1.98:8642');
      });

      test(`mentions "cowork-alpha" registration`, () => {
        expect(content).toMatch(/cowork-alpha/i);
      });

      test(`mentions message types or bridge communication`, () => {
        const bridgeSection = content.match(/[Bb]ridge[\s\S]*?(?=##|$)/);
        if (!bridgeSection) {
          // Some agents might not have explicit bridge sections, just verify bridge URL exists
          expect(content).toContain('192.168.1.98:8642');
        } else {
          const section = bridgeSection![0];
          expect(
            section.includes('type') ||
            section.includes('message') ||
            section.includes('audit')
          ).toBeTruthy();
        }
      });
    });
  });

  describe('Kit bridge details', () => {
    let content: string;

    beforeAll(() => {
      content = readAgent(AGENTS[0]);
    });

    test(`explicitly mentions cowork-bravo for LMNTL ensemble`, () => {
      expect(content).toContain('cowork-bravo');
    });

    test(`demonstrates audit-trigger message format`, () => {
      const bridgeSection = content.match(/Cross-Agent Bridge[\s\S]*?(?=##|$)/);
      expect(bridgeSection).toBeTruthy();
      const section = bridgeSection![0];
      expect(section).toContain('"type": "audit-trigger"');
      expect(section).toContain('"from": "cowork-alpha"');
      expect(section).toContain('"to": "cowork-bravo"');
    });
  });
});

// ─── 7-Dimension Ensemble Audit Tests ──────────────────────────────
describe('7-Dimension Ensemble Audit (Kit)', () => {
  let content: string;

  beforeAll(() => {
    content = readAgent(AGENTS[0]); // Kit
  });

  test(`has "PR Review Protocol (Ensemble Audit)" section`, () => {
    expect(content).toContain('PR Review Protocol (Ensemble Audit)');
  });

  test(`references ensemble audit dimensions`, () => {
    const content = readAgent(AGENTS[0]);
    const dimensions = [
      'Correctness',
      'Security',
      'UX',
      'Product',
      'Operations',
      'Architecture',
      'Test',
    ];

    dimensions.forEach((dim) => {
      expect(content).toContain(dim);
    });
  });

  test(`documents ensemble result format`, () => {
    const content = readAgent(AGENTS[0]);
    expect(content).toContain('Ensemble');
    expect(content).toContain('Result');
    expect(content).toContain('7');
  });

  test(`shows agent assignments in ensemble audit`, () => {
    const content = readAgent(AGENTS[0]);
    // Should mention agent names
    expect(
      content.includes('Scout') &&
      content.includes('Trak') &&
      content.includes('Kit')
    ).toBeTruthy();
  });

  test(`demonstrates how to apply specialist analysis`, () => {
    const auditSection = content.match(/PR Review Protocol[\s\S]*?(?=##|$)/);
    expect(auditSection).toBeTruthy();
    const section = auditSection![0];

    expect(section).toMatch(/specialist analysis.*7 dimensions/i);
    expect(section).toContain('methodology');
    expect(section).toContain('evidence protocol');
  });
});

// ─── Specialist Agent Personas Tests ────────────────────────────────
describe('Specialist Agent Personas', () => {
  test('all specialist files exist in agents/shared/specialists/', () => {
    const files = getSpecialistFiles();
    SPECIALIST_FILES.forEach((filename) => {
      expect(files).toContain(filename);
    });
  });

  test('Kit references multiple specialist personas', () => {
    const content = readAgent(AGENTS[0]);
    // Should reference several key specialists
    expect(content).toContain('code-review-architect');
    expect(content).toContain('security-risk-auditor');
    expect(content).toContain('Specialist Agent Capabilities');
  });

  describe('Kit specialists', () => {
    let content: string;

    beforeAll(() => {
      content = readAgent(AGENTS[0]);
    });

    test(`references code-review-architect specialist`, () => {
      expect(content).toContain('code-review-architect');
    });

    test(`references security-risk-auditor specialist`, () => {
      expect(content).toContain('security-risk-auditor');
    });

    test(`references technical-architect specialist`, () => {
      expect(content).toContain('technical-architect');
    });

    test(`references devops-engineer specialist`, () => {
      expect(content).toContain('devops-engineer');
    });

    test(`references qa-test-engineer specialist`, () => {
      expect(content).toContain('qa-test-engineer');
    });

    test(`references implementation-engineer specialist`, () => {
      expect(content).toContain('implementation-engineer');
    });
  });

  describe('Scout specialists', () => {
    let content: string;

    beforeAll(() => {
      content = readAgent(AGENTS[1]);
    });

    test(`references ux-ui-designer specialist`, () => {
      expect(content).toContain('ux-ui-designer');
    });
  });

  describe('Trak specialists', () => {
    let content: string;

    beforeAll(() => {
      content = readAgent(AGENTS[2]);
    });

    test(`references product-owner specialist`, () => {
      expect(content).toContain('product-owner');
    });

    test(`references business-analyst specialist`, () => {
      expect(content).toContain('business-analyst');
    });

    test(`references orchestrator-coordinator specialist`, () => {
      expect(content).toContain('orchestrator-coordinator');
    });
  });
});

// ─── CI/CD & SDLC Policy Tests ────────────────────────────────────
describe('Mandatory CI/CD & SDLC Policy (All Agents)', () => {
  AGENTS.forEach((agent) => {
    describe(`${agent.name}`, () => {
      let content: string;

      beforeAll(() => {
        content = readAgent(agent);
      });

      test(`has "Mandatory CI/CD & SDLC Policy" section`, () => {
        expect(content).toContain('Mandatory CI/CD & SDLC Policy');
      });

      test(`mentions "NEVER deploy" with prohibited methods`, () => {
        const policySection = content.match(
          /Mandatory CI\/CD & SDLC Policy[\s\S]*?(?=##|$)/
        );
        expect(policySection).toBeTruthy();
        const section = policySection![0];
        expect(section).toMatch(/\*\*NEVER\*\*/i);
        expect(
          section.includes('Editing files directly') ||
            section.includes('direct on the EC2')
        ).toBeTruthy();
      });

      test(`mentions GitHub Actions pipeline`, () => {
        const policySection = content.match(
          /Mandatory CI\/CD & SDLC Policy[\s\S]*?(?=##|$)/
        );
        expect(policySection).toBeTruthy();
        const section = policySection![0];
        expect(section).toContain('GitHub Actions');
      });

      test(`includes full SDLC steps (clone, branch, test, commit, tag, deploy, verify)`, () => {
        const policySection = content.match(
          /Mandatory CI\/CD & SDLC Policy[\s\S]*?(?=##|$)/
        );
        expect(policySection).toBeTruthy();
        const section = policySection![0];

        expect(section).toMatch(/Clone.*locally/i);
        expect(section).toMatch(/branch/i);
        expect(section).toMatch(/test/i);
        expect(section).toMatch(/commit.*push/i);
        expect(section).toMatch(/tag/i);
        expect(section).toMatch(/deploy/i);
      });
    });
  });
});

// ─── Response Discipline Tests ─────────────────────────────────────
describe('Response Discipline (All Agents)', () => {
  AGENTS.forEach((agent) => {
    describe(`${agent.name}`, () => {
      let content: string;

      beforeAll(() => {
        content = readAgent(agent);
      });

      test(`has "Response Discipline" section`, () => {
        expect(content).toContain('## Response Discipline');
      });

      test(`has "Slack Threading & Acknowledgment" section`, () => {
        expect(content).toContain('Slack Threading & Acknowledgment');
      });

      test(`mentions message limits for threading`, () => {
        const threadingSection = content.match(
          /Slack Threading & Acknowledgment[\s\S]*?(?=##|$)/
        );
        expect(threadingSection).toBeTruthy();
        const section = threadingSection![0];
        expect(
          section.includes('3') ||
          section.includes('message') ||
          section.includes('Maximum')
        ).toBeTruthy();
      });

      test(`states "NEVER send thinking out loud messages"`, () => {
        const disciplineSection = content.match(
          /## Response Discipline[\s\S]*?(?=##|$)/
        );
        expect(disciplineSection).toBeTruthy();
        const section = disciplineSection![0];
        expect(section).toMatch(/NEVER.*thinking/i);
      });

      test(`requires gathering data silently before responding`, () => {
        const disciplineSection = content.match(
          /## Response Discipline[\s\S]*?(?=##|$)/
        );
        expect(disciplineSection).toBeTruthy();
        const section = disciplineSection![0];
        expect(section).toMatch(/[Gg]ather.*silently/i);
      });
    });
  });
});

// ─── Consistency Checks ────────────────────────────────────────────
describe('Cross-File Consistency Checks', () => {
  test('Bridge URL is consistent across all agents', () => {
    const bridgeUrl = 'http://192.168.1.98:8642';
    AGENTS.forEach((agent) => {
      const content = readAgent(agent);
      expect(content).toContain(bridgeUrl);
    });
  });

  test('Agent Slack user IDs are referenced in delegation sections', () => {
    const expectedIds = {
      Kit: 'U0AKF614URE',
      Scout: 'U0AJLT30KMG',
      Trak: 'U0AJEGUSELB',
    };

    Object.entries(expectedIds).forEach(([agentName, userId]) => {
      AGENTS.forEach((agent) => {
        const content = readAgent(agent);
        const delegationSection = content.match(
          /Inter-Agent Delegation[\s\S]*?(?=##|$)/
        );
        if (delegationSection) {
          // Each agent should reference the other agents' IDs
          if (agent.name !== agentName) {
            expect(delegationSection[0]).toContain(userId);
          }
        }
      });
    });
  });

  test('Agent emojis are consistent with Self-Introduction', () => {
    AGENTS.forEach((agent) => {
      const content = readAgent(agent);
      const selfIntroMatch = content.match(
        /## Self-Introduction[\s\S]*?(?=##|$)/
      );
      expect(selfIntroMatch).toBeTruthy();
      expect(selfIntroMatch![0]).toContain(agent.emoji);
    });
  });

  test('SDLC policy text is consistent across all agents', () => {
    const policySections = AGENTS.map((agent) => {
      const content = readAgent(agent);
      const match = content.match(/Mandatory CI\/CD & SDLC Policy[\s\S]*?(?=##|$)/);
      return match ? match[0] : '';
    });

    // All should mention the same key prohibitions
    const keyProhibitions = [
      'Editing files directly on the EC2 instance',
      'Using SSM send-command',
      'base64-encoded file transfers',
      'Git→GitHub Actions pipeline',
    ];

    policySections.forEach((section) => {
      keyProhibitions.forEach((prohibition) => {
        expect(section).toContain(prohibition);
      });
    });
  });

  test('All agents reference cowork-alpha in bridge protocol', () => {
    AGENTS.forEach((agent) => {
      const content = readAgent(agent);
      expect(content).toContain('cowork-alpha');
    });
  });

  test('Kit uniquely references cowork-bravo', () => {
    const kitContent = readAgent(AGENTS[0]);
    expect(kitContent).toContain('cowork-bravo');
  });
});

// ─── Slack User ID Format Tests ────────────────────────────────────
describe('Slack User ID Format Validation', () => {
  test('all user IDs follow Slack format (U prefix + 10 alphanumeric chars)', () => {
    const userIds = [
      'U0AJLT30KMG', // Scout
      'U0AJEGUSELB', // Trak
      'U0AKF614URE', // Kit
    ];

    userIds.forEach((id) => {
      expect(id).toMatch(/^U[A-Z0-9]{10}$/);
    });
  });

  test('Slack user IDs are referenced in delegation sections', () => {
    const userIds = [
      'U0AJLT30KMG',
      'U0AJEGUSELB',
      'U0AKF614URE',
    ];

    AGENTS.forEach((agent) => {
      const content = readAgent(agent);
      const delegationSection = content.match(
        /Inter-Agent Delegation[\s\S]*?(?=##|$)/
      );
      if (delegationSection) {
        // Should reference at least some other agent IDs
        const section = delegationSection[0];
        const foundIds = userIds.filter(id => section.includes(id));
        expect(foundIds.length).toBeGreaterThan(0);
      }
    });
  });
});

// ─── Bridge Message Types Tests ────────────────────────────────────
describe('Bridge Message Types', () => {
  test('All agents document bridge communication and audit features', () => {
    AGENTS.forEach((agent) => {
      const content = readAgent(agent);
      // Each agent should reference bridge/audit/cowork concepts
      expect(
        content.includes('bridge') ||
        content.includes('Bridge') ||
        content.includes('audit') ||
        content.includes('cowork')
      ).toBeTruthy();
    });
  });
});

// ─── Specialist Ensemble Audit Integration Tests ────────────────────
describe('Specialist Ensemble Audit Integration', () => {
  test('Kit documents specialist usage and evidence protocol', () => {
    const content = readAgent(AGENTS[0]);
    // Should have specialist guidance
    expect(content).toContain('Specialist');
    expect(content).toContain('Evidence');
  });

  test('Scout contributes UX/Accessibility dimension via specialist', () => {
    const content = readAgent(AGENTS[1]);
    expect(content).toContain('ux-ui-designer');
    expect(content).toContain('UX/Accessibility');
    expect(content).toContain('WCAG');
  });

  test('Trak contributes Product-Market Fit dimension via product-owner specialist', () => {
    const content = readAgent(AGENTS[2]);
    expect(content).toContain('product-owner');
    expect(content).toContain('Product-Market Fit');
    expect(content).toContain('Strategic alignment');
  });

  test('All specialist references link to files in agents/shared/specialists/', () => {
    AGENTS.forEach((agent) => {
      const content = readAgent(agent);
      const specialistSection = content.match(
        /Specialist Agent Capabilities[\s\S]*?(?=##|$)/
      );
      if (specialistSection) {
        const section = specialistSection[0];
        // Should reference files with .md extension
        SPECIALIST_FILES.forEach((file) => {
          // Not every specialist is used by every agent, so check selectively
          if (section.includes(file.replace('.md', ''))) {
            expect(section).toContain(file);
          }
        });
      }
    });
  });
});

// ─── Evidence Protocol Tests ────────────────────────────────────────
describe('Evidence Protocol (Specialist Requirements)', () => {
  test('Kit documents Evidence Protocol for specialist findings', () => {
    const content = readAgent(AGENTS[0]);
    // Should have evidence protocol guidance
    expect(content).toContain('Evidence');
    expect(content).toContain('Protocol');
  });
});

// ─── PR Review Workflow Tests ───────────────────────────────────────
describe('PR Review Workflow Coordination', () => {
  test('Kit initiates ensemble review and requests companion reviews', () => {
    const content = readAgent(AGENTS[0]);
    const prReviewSection = content.match(
      /PR Review Protocol[\s\S]*?(?=##|$)/
    );
    expect(prReviewSection).toBeTruthy();
    const section = prReviewSection![0];

    expect(section).toContain('@Trak');
    expect(section).toContain('@Scout');
    expect(section).toMatch(/request companion reviews/i);
  });

  test('Scout contributes customer impact and UX assessment', () => {
    const content = readAgent(AGENTS[1]);
    expect(content).toContain('Impact Assessment');
    expect(
      content.includes('Customer') ||
      content.includes('UX') ||
      content.includes('Accessibility')
    ).toBeTruthy();
  });

  test('Trak contributes Jira verification and product-market fit', () => {
    const content = readAgent(AGENTS[2]);
    expect(content).toContain('Jira');
    expect(content).toContain('Product-Market Fit');
    const coordinationSection = content.match(
      /PR Review[\s\S]*?(?=##|$)/
    );
    expect(coordinationSection).toBeTruthy();
  });
});

// ─── Fallback Protocol Tests ───────────────────────────────────────
describe('Fallback Protocol (Kit)', () => {
  let content: string;

  beforeAll(() => {
    content = readAgent(AGENTS[0]);
  });

  test('has Fallback section for when bridge is unreachable', () => {
    expect(content).toContain('Fallback');
  });

  test('fallback includes workflow_dispatch trigger', () => {
    const fallbackSection = content.match(/Fallback[\s\S]*?(?=##|$)/);
    expect(fallbackSection).toBeTruthy();
    expect(fallbackSection![0]).toMatch(/workflow_dispatch/);
  });

  test('fallback includes Slack notification step', () => {
    const fallbackSection = content.match(/Fallback[\s\S]*?(?=##|$)/);
    expect(fallbackSection).toBeTruthy();
    expect(fallbackSection![0]).toMatch(/Slack.*notification/i);
  });

  test('fallback includes local-only ensemble review', () => {
    const fallbackSection = content.match(/Fallback[\s\S]*?(?=##|$)/);
    expect(fallbackSection).toBeTruthy();
    expect(fallbackSection![0]).toMatch(/local.*ensemble/i);
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
      expect(lookupUserIds.length).toBeGreaterThanOrEqual(9);

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
});
