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

  // --- Gateway restart method (critical fix: must NOT re-run inner entrypoint) ---
  test('restart starts gateway directly, not via "$@" re-execution', () => {
    // After the initial "$@" & to start the inner entrypoint, the restart
    // section must use "openclaw gateway run" directly — NOT "$@" which
    // would re-run the full inner entrypoint (re-installing mcporter, gh, etc.)
    const restartIdx = script.indexOf('Restarting gateway to apply channel config');
    expect(restartIdx).toBeGreaterThan(-1);
    // The restart section should contain a direct gateway run command
    const afterRestart = script.substring(restartIdx);
    expect(afterRestart).toContain('openclaw gateway run');
    // There should be exactly ONE "$@" in the entire script (the initial start)
    const dollarAtMatches = script.match(/"\$@"/g) || [];
    expect(dollarAtMatches.length).toBe(1);
  });

  // --- Config normalization (fixes schema drift after channel injection) ---
  test('runs openclaw doctor --fix after channel injection', () => {
    const injectIdx = script.indexOf('injecting Slack channels');
    const doctorIdx = script.indexOf('openclaw doctor --fix');
    expect(doctorIdx).toBeGreaterThan(-1);
    expect(doctorIdx).toBeGreaterThan(injectIdx);
  });

  // --- Liveness check (verify gateway actually started) ---
  test('verifies gateway process is alive after restart', () => {
    expect(script).toContain('kill -0 $GATEWAY_PID');
    // Must exit 1 if gateway dies
    const livenessIdx = script.indexOf('kill -0 $GATEWAY_PID');
    const afterLiveness = script.substring(livenessIdx);
    expect(afterLiveness).toContain('exit 1');
  });

  // --- MCP tools: on-demand loading (no warmup loop) ---
  test('does NOT contain broken mcporter warmup loop', () => {
    expect(script).not.toContain('Pre-warming MCP servers');
    expect(script).not.toContain('mcporter list --json');
    expect(script).not.toMatch(/seq 1 12/);
  });

  test('documents that MCP tools load on-demand', () => {
    expect(script).toContain('ON-DEMAND');
    expect(script).toContain('No warmup loop needed');
  });

  // --- Startup ordering (the full critical path) ---
  test('correct overall startup order: secrets → config wait → inject → doctor → restart → verify', () => {
    const secretsIdx = script.indexOf('aws secretsmanager');
    const configWaitIdx = script.indexOf('Waiting for gateway config');
    const injectIdx = script.indexOf('injecting Slack channels');
    const doctorIdx = script.indexOf('openclaw doctor --fix');
    const restartIdx = script.indexOf('openclaw gateway run');
    const verifyIdx = script.indexOf('kill -0 $GATEWAY_PID');

    expect(secretsIdx).toBeGreaterThan(-1);
    expect(configWaitIdx).toBeGreaterThan(secretsIdx);
    expect(injectIdx).toBeGreaterThan(configWaitIdx);
    expect(doctorIdx).toBeGreaterThan(injectIdx);
    expect(restartIdx).toBeGreaterThan(doctorIdx);
    expect(verifyIdx).toBeGreaterThan(restartIdx);
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

  test('contains a comment noting warmup was moved to outer entrypoint', () => {
    expect(script).toContain('MCP warmup moved to outer entrypoint');
  });

  test('does NOT use interactive paste-token command (blocks entrypoint, leaks key)', () => {
    // The command "openclaw models auth paste-token" must not appear as executable code
    // (comments warning against it are fine)
    expect(script).not.toMatch(/openclaw models auth paste-token/);
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
