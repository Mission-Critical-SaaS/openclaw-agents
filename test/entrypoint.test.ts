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

  // --- MCP tools: no broken mcporter warmup ---
  test('does NOT contain broken mcporter warmup loop', () => {
    expect(script).not.toContain('Pre-warming MCP servers');
    expect(script).not.toContain('mcporter list --json');
    expect(script).not.toMatch(/seq 1 12/);
  });

  // --- Agent bootstrap (warms MCP tools automatically) ---
  test('bootstraps agent to warm MCP tools after gateway starts', () => {
    expect(script).toContain('Bootstrapping agents');
    expect(script).toContain('openclaw agent --agent main');
    expect(script).toContain('BOOTSTRAP_OK');
  });

  test('bootstrap runs AFTER gateway liveness check', () => {
    const livenessIdx = script.indexOf('kill -0 $GATEWAY_PID');
    const bootstrapIdx = script.indexOf('openclaw agent --agent main');
    expect(bootstrapIdx).toBeGreaterThan(livenessIdx);
  });

  test('bootstrap is non-fatal (does not exit 1 on failure)', () => {
    // The bootstrap command block must have || true so a failed bootstrap
    // doesn't kill the container. The command spans multiple lines via \
    const bootstrapIdx = script.indexOf('openclaw agent --agent main');
    expect(bootstrapIdx).toBeGreaterThan(-1);
    // Get a window around the bootstrap command (covers continuation lines)
    const bootstrapBlock = script.substring(bootstrapIdx, bootstrapIdx + 300);
    expect(bootstrapBlock).toContain('|| true');
  });

  test('bootstrap has a reasonable timeout', () => {
    expect(script).toMatch(/--timeout\s+\d+/);
    const match = script.match(/--timeout\s+(\d+)/);
    expect(match).toBeTruthy();
    const timeout = parseInt(match![1], 10);
    expect(timeout).toBeGreaterThanOrEqual(30);
    expect(timeout).toBeLessThanOrEqual(120);
  });

  test('documents that MCP tools load on-demand via bootstrap', () => {
    expect(script).toContain('on-demand');
    expect(script).toContain('cold-start');
  });

  // --- Workspace file injection (after gateway creates workspaces) ---
  test('injects IDENTITY.md into BOTH cfg and persist workspaces after gateway is up', () => {
    expect(script).toContain('Injecting workspace files');
    // Must copy to CFG (configured workspace) AND PERSIST (runtime workspace)
    // OpenClaw reads from PERSIST, so both must be updated
    expect(script).toContain('cp "$SRC/IDENTITY.md" "$CFG/IDENTITY.md"');
    expect(script).toContain('cp "$SRC/IDENTITY.md" "$PERSIST/IDENTITY.md"');
  });

  test('uses both configured and persist workspace paths', () => {
    // CFG = agents/{agent}/workspace (where agent reads/writes)
    expect(script).toContain('/root/.openclaw/agents/${agent}/workspace');
    // PERSIST = .openclaw/workspace-{agent} (bind-mounted, survives restarts)
    expect(script).toContain('/root/.openclaw/.openclaw/workspace-${agent}');
  });

  test('seeds KNOWLEDGE.md to persist dir only if it does not already exist', () => {
    expect(script).toMatch(/! -f.*PERSIST.*KNOWLEDGE\.md/);
    expect(script).toContain('KNOWLEDGE.md seeded');
  });

  test('copies KNOWLEDGE.md from persist dir to configured workspace (not symlink)', () => {
    // Symlinks don't work — OpenClaw virtual FS doesn't resolve them.
    // Must be a real copy so the agent can read it.
    expect(script).not.toContain('ln -sf');
    expect(script).toMatch(/cp.*PERSIST.*KNOWLEDGE\.md.*CFG.*KNOWLEDGE\.md/);
    expect(script).toContain('KNOWLEDGE.md copied from persist to cfg');
  });

  test('workspace injection runs BEFORE gateway restart and BEFORE bootstrap', () => {
    // OpenClaw virtual FS snapshots workspace at gateway startup, so files
    // must be in place BEFORE the gateway restarts.
    const doctorIdx = script.indexOf('openclaw doctor --fix');
    const injectionIdx = script.indexOf('Injecting workspace files');
    const restartIdx = script.indexOf('openclaw gateway run');
    const bootstrapIdx = script.indexOf('openclaw agent --agent main');
    expect(injectionIdx).toBeGreaterThan(doctorIdx);
    expect(injectionIdx).toBeLessThan(restartIdx);
    expect(injectionIdx).toBeLessThan(bootstrapIdx);
  });

  // --- Startup ordering (the full critical path) ---
  test('correct overall startup order: secrets → config wait → inject → doctor → workspace inject → restart → verify → bootstrap', () => {
    const secretsIdx = script.indexOf('aws secretsmanager');
    const configWaitIdx = script.indexOf('Waiting for gateway config');
    const injectIdx = script.indexOf('injecting Slack channels');
    const doctorIdx = script.indexOf('openclaw doctor --fix');
    const wsInjectIdx = script.indexOf('Injecting workspace files');
    const restartIdx = script.indexOf('openclaw gateway run');
    const verifyIdx = script.indexOf('kill -0 $GATEWAY_PID');
    const bootstrapIdx = script.indexOf('openclaw agent --agent main');

    expect(secretsIdx).toBeGreaterThan(-1);
    expect(configWaitIdx).toBeGreaterThan(secretsIdx);
    expect(injectIdx).toBeGreaterThan(configWaitIdx);
    expect(doctorIdx).toBeGreaterThan(injectIdx);
    expect(wsInjectIdx).toBeGreaterThan(doctorIdx);
    expect(restartIdx).toBeGreaterThan(wsInjectIdx);
    expect(verifyIdx).toBeGreaterThan(restartIdx);
    expect(bootstrapIdx).toBeGreaterThan(verifyIdx);
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

  test('does NOT do workspace file injection (moved to outer entrypoint)', () => {
    // Workspace file injection must happen in the outer entrypoint AFTER
    // the gateway creates runtime workspaces. The inner entrypoint runs
    // before those directories exist.
    expect(script).not.toMatch(/cp.*IDENTITY\.md.*IDENTITY\.md/);
    expect(script).toContain('outer entrypoint');
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

  test('has git-managed workspace bind mounts for all three agents', () => {
    for (const agent of ['scout', 'trak', 'kit']) {
      expect(compose).toContain(`/opt/openclaw/agents/${agent}/workspace:/tmp/agents/${agent}/workspace`);
    }
  });

  test('has persistent runtime workspace bind mounts for all three agents', () => {
    // Must target OpenClaw's actual runtime workspace path:
    // /root/.openclaw/.openclaw/workspace-{agent}
    for (const agent of ['scout', 'trak', 'kit']) {
      expect(compose).toContain(
        `/opt/openclaw-persist/workspace-${agent}:/root/.openclaw/.openclaw/workspace-${agent}`
      );
    }
  });

  test('has memory database bind mount for virtual FS persistence', () => {
    // Without this mount, agent file edits (KNOWLEDGE.md updates) are lost
    // on container restart because the virtual FS stores modifications in
    // SQLite, not on the real filesystem.
    expect(compose).toContain(
      '/opt/openclaw-persist/memory:/root/.openclaw/.openclaw/memory'
    );
  });

  test('uses /app/entrypoint.sh as the container entrypoint', () => {
    expect(compose).toContain('/app/entrypoint.sh');
  });

  test('uses /entrypoint.sh as the command', () => {
    expect(compose).toContain('/entrypoint.sh');
  });
});

// ---------------------------------------------------------------------------
// deploy.sh
// ---------------------------------------------------------------------------
describe('deploy.sh', () => {
  let script: string;

  beforeAll(() => {
    script = readScript('deploy.sh');
  });

  test('creates persistent workspace dirs outside git repo', () => {
    expect(script).toContain('/opt/openclaw-persist/workspace-');
    expect(script).toMatch(/mkdir -p.*openclaw-persist/);
  });

  test('creates persist dirs for all three agents', () => {
    expect(script).toMatch(/for agent in scout trak kit/);
    expect(script).toContain('openclaw-persist/workspace-${agent}');
  });

  test('creates persistent memory directory', () => {
    expect(script).toContain('openclaw-persist/memory');
  });

  test('discards .last_deploy changes before git checkout (prevents tracked-file conflict)', () => {
    const backupIdx = script.indexOf('Backup saved');
    const checkoutCleanIdx = script.indexOf('git checkout -- .last_deploy');
    // Safety cleanup must exist and come after the backup write
    expect(checkoutCleanIdx).toBeGreaterThan(-1);
    expect(checkoutCleanIdx).toBeGreaterThan(backupIdx);
    // Must come before the actual "Fetching from origin" log line (not the dry-run fetch)
    const fetchLogIdx = script.indexOf('Fetching from origin');
    expect(checkoutCleanIdx).toBeLessThan(fetchLogIdx);
  });
});

// ---------------------------------------------------------------------------
// deploy.yml (GHA workflow)
// ---------------------------------------------------------------------------
describe('deploy.yml', () => {
  let workflow: string;

  beforeAll(() => {
    workflow = readScript('.github/workflows/deploy.yml');
  });

  test('extracts deploy.sh from the tag before running it (avoids chicken-and-egg)', () => {
    // The SSM command must fetch the tag's deploy.sh to /tmp and run that,
    // not the on-disk copy which may be an older version
    expect(workflow).toContain('git show $TAG:deploy.sh');
    expect(workflow).toContain('/tmp/deploy-$TAG.sh');
  });

  test('fetches tags before extracting deploy.sh', () => {
    const fetchIdx = workflow.indexOf('git fetch origin --tags');
    const showIdx = workflow.indexOf('git show $TAG:deploy.sh');
    expect(fetchIdx).toBeGreaterThan(-1);
    expect(showIdx).toBeGreaterThan(fetchIdx);
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

      test('has self-seeding KNOWLEDGE.md bootstrap using $HOME path', () => {
        // Must use $HOME (not /root/) so it works in both Linux containers and macOS
        expect(identity).toContain('$HOME/.openclaw/agents/' + agent + '/workspace/KNOWLEDGE.md');
        // Must create the file if it doesn't exist (self-seeding)
        expect(identity).toContain('if [ ! -f "$KF" ]');
        expect(identity).toContain('cat > "$KF"');
        // Must read the file after ensuring it exists
        expect(identity).toContain('cat "$KF"');
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
