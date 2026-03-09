/**
 * OpenClaw Agents — Entrypoint Script Validation Tests
 *
 * These tests verify that the entrypoint scripts contain the correct
 * structural patterns required for reliable startup. They do NOT execute
 * the scripts; instead they parse the source to confirm critical sections
 * are present and correctly ordered.
 */
import { readFileSync } from 'fs';
import { join } from 'path';

const ROOT = join(__dirname, '..');

function readScript(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), 'utf-8');
}

// ---------------------------------------------------------------------------
// Outer entrypoint  (/app/entrypoint.sh in the container)
// ---------------------------------------------------------------------------
describe('Outer entrypoint (entrypoint.sh)', () => {
  let script: string;

  beforeAll(() => {
    script = readScript('entrypoint.sh');
  });

  // --- AWS Secrets ---
  test('fetches secrets from AWS Secrets Manager', () => {
    expect(script).toMatch(/aws secretsmanager get-secret-value.*--secret-id openclaw\/agents/);
  });

  test('exports all required Slack bot tokens', () => {
    for (const agent of ['SCOUT', 'TRAK', 'KIT']) {
      expect(script).toContain(`SLACK_BOT_TOKEN_${agent}`);
      expect(script).toContain(`SLACK_APP_TOKEN_${agent}`);
    }
  });

  test('exports Atlassian credentials', () => {
    expect(script).toContain('ATLASSIAN_SITE_NAME');
    expect(script).toContain('ATLASSIAN_USER_EMAIL');
    expect(script).toContain('ATLASSIAN_API_TOKEN');
  });

  test('exports Zendesk credentials', () => {
    expect(script).toContain('ZENDESK_SUBDOMAIN');
    expect(script).toContain('ZENDESK_EMAIL');
    expect(script).toContain('ZENDESK_API_TOKEN');
  });

  test('exports Notion API token and alias', () => {
    expect(script).toContain('NOTION_API_TOKEN');
    expect(script).toContain('NOTION_API_KEY');
  });

  test('exports GitHub token', () => {
    expect(script).toContain('GITHUB_TOKEN');
  });

  // --- Config wait ---
  test('waits up to 90 seconds for gateway config', () => {
    expect(script).toMatch(/seq 1 90/);
  });

  // --- Slack injection ---
  test('injects all three Slack accounts (scout, trak, kit)', () => {
    for (const name of ['scout', 'trak', 'kit']) {
      expect(script).toContain(`'${name}'`);
    }
  });

  test('sets groupPolicy to open', () => {
    expect(script).toContain("'groupPolicy': 'open'");
  });

  test('sets requireMention to True', () => {
    expect(script).toContain("'requireMention': True");
  });

  // --- Gateway restart (critical fix) ---
  test('kills gateway process group for clean restart (not openclaw gateway stop)', () => {
    // Must NOT use "openclaw gateway stop" as an actual command — it disables the service manager
    // (comments mentioning it are fine)
    expect(script).not.toMatch(/^\s+openclaw gateway stop/m);
    expect(script).toMatch(/kill.*GATEWAY_PID/);
  });

  // --- MCP warm-up (critical fix: must come AFTER gateway restart) ---
  test('MCP warmup runs AFTER gateway restart, not before', () => {
    const restartIdx = script.indexOf('Restarting gateway to apply channel config');
    const warmupIdx = script.indexOf('Pre-warming MCP servers');
    expect(restartIdx).toBeGreaterThan(-1);
    expect(warmupIdx).toBeGreaterThan(-1);
    expect(warmupIdx).toBeGreaterThan(restartIdx);
  });

  test('MCP warmup checks jira, zendesk, and notion tools', () => {
    expect(script).toContain("d.get('jira'");
    expect(script).toContain("d.get('zendesk'");
    expect(script).toContain("d.get('notion'");
  });

  test('MCP warmup retries up to 12 times with 5s sleep', () => {
    expect(script).toMatch(/seq 1 12/);
    expect(script).toMatch(/sleep 5/);
  });

  test('waits 10s for gateway to initialize before warmup', () => {
    const warmupStartIdx = script.indexOf('Waiting 10s for gateway to initialize');
    const sleep10Idx = script.indexOf('sleep 10', warmupStartIdx);
    expect(warmupStartIdx).toBeGreaterThan(-1);
    expect(sleep10Idx).toBeGreaterThan(-1);
  });

  // --- Startup ordering (the full critical path) ---
  test('correct overall startup order: secrets → config wait → inject → restart → warmup', () => {
    const secretsIdx = script.indexOf('aws secretsmanager');
    const configWaitIdx = script.indexOf('Waiting for gateway config');
    const injectIdx = script.indexOf('injecting Slack channels');
    const restartIdx = script.indexOf('Restarting gateway to apply channel config');
    const warmupIdx = script.indexOf('Pre-warming MCP servers');

    expect(secretsIdx).toBeGreaterThan(-1);
    expect(configWaitIdx).toBeGreaterThan(secretsIdx);
    expect(injectIdx).toBeGreaterThan(configWaitIdx);
    expect(restartIdx).toBeGreaterThan(injectIdx);
    expect(warmupIdx).toBeGreaterThan(restartIdx);
  });
});

// ---------------------------------------------------------------------------
// Inner entrypoint  (/entrypoint.sh in the container)
// ---------------------------------------------------------------------------
describe('Inner entrypoint (docker/entrypoint.sh)', () => {
  let script: string;

  beforeAll(() => {
    script = readScript('docker/entrypoint.sh');
  });

  test('starts with strict mode (set -euo pipefail)', () => {
    expect(script).toMatch(/set -euo pipefail/);
  });

  test('configures mcporter with jira, zendesk, and notion', () => {
    expect(script).toContain("'jira'");
    expect(script).toContain("'zendesk'");
    expect(script).toContain("'notion'");
  });

  test('installs mcporter globally', () => {
    expect(script).toMatch(/npm install -g mcporter/);
  });

  test('installs gh CLI', () => {
    expect(script).toContain('gh');
    expect(script).toMatch(/apt-get.*install.*gh/);
  });

  test('authenticates gh with GITHUB_TOKEN', () => {
    expect(script).toMatch(/gh auth login --with-token/);
  });

  test('copies agent workspace files from bind mounts', () => {
    expect(script).toMatch(/cp -r \/tmp\/agents/);
  });

  test('does NOT contain MCP warmup (moved to outer entrypoint)', () => {
    expect(script).not.toContain('Pre-warming MCP servers');
    expect(script).not.toContain('mcporter list --json');
  });

  test('contains a comment noting warmup was moved', () => {
    expect(script).toContain('MCP warmup moved to outer entrypoint');
  });

  test('starts gateway with exec and tee to log file', () => {
    expect(script).toMatch(/exec openclaw gateway run.*tee.*openclaw\.log/);
  });

  test('sets up auth profiles for all three agents', () => {
    expect(script).toMatch(/for agent in scout trak kit/);
    expect(script).toContain('auth-profiles.json');
  });
});

// ---------------------------------------------------------------------------
// docker-compose.yml
// ---------------------------------------------------------------------------
describe('docker-compose.yml', () => {
  let compose: string;

  beforeAll(() => {
    compose = readScript('docker-compose.yml');
  });

  test('mounts outer entrypoint as /app/entrypoint.sh', () => {
    expect(compose).toContain('/opt/openclaw/entrypoint.sh:/app/entrypoint.sh');
  });

  test('mounts inner entrypoint as /entrypoint.sh', () => {
    expect(compose).toContain('/opt/openclaw/docker/entrypoint.sh:/entrypoint.sh');
  });

  test('has agent workspace bind mounts for all three agents', () => {
    for (const agent of ['scout', 'trak', 'kit']) {
      expect(compose).toContain(`/opt/openclaw/agents/${agent}/workspace:/tmp/agents/${agent}/workspace`);
    }
  });

  test('uses /app/entrypoint.sh as the container entrypoint', () => {
    expect(compose).toContain('/app/entrypoint.sh');
  });

  test('uses /entrypoint.sh as the command', () => {
    expect(compose).toContain('/entrypoint.sh');
  });
});

// ---------------------------------------------------------------------------
// Agent IDENTITY.md files
// ---------------------------------------------------------------------------
describe('Agent IDENTITY.md files', () => {
  for (const agent of ['scout', 'trak', 'kit']) {
    describe(`${agent} IDENTITY.md`, () => {
      let identity: string;

      beforeAll(() => {
        identity = readScript(`agents/${agent}/workspace/IDENTITY.md`);
      });

      test('contains CI/CD mandate section', () => {
        expect(identity).toContain('Mandatory CI/CD & SDLC Policy');
      });

      test('prohibits direct EC2 editing', () => {
        expect(identity).toContain('Editing files directly on the EC2 instance');
      });

      test('requires GitHub Actions deployment', () => {
        expect(identity).toContain('GitHub Actions');
      });

      test('requires tagging a release', () => {
        expect(identity).toMatch(/[Tt]ag/);
      });
    });
  }
});

// ---------------------------------------------------------------------------
// Agent KNOWLEDGE.md files
// ---------------------------------------------------------------------------
describe('Agent KNOWLEDGE.md files', () => {
  for (const agent of ['scout', 'trak', 'kit']) {
    test(`${agent} KNOWLEDGE.md exists and is non-empty`, () => {
      const knowledge = readScript(`agents/${agent}/workspace/KNOWLEDGE.md`);
      expect(knowledge.length).toBeGreaterThan(50);
    });
  }
});
