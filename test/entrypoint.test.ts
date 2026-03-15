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

  test('exports all required Slack bot tokens (all 5 agents)', () => {
    for (const agent of ['SCOUT', 'TRAK', 'KIT', 'SCRIBE', 'PROBE']) {
      expect(script).toContain(`SLACK_BOT_TOKEN_${agent}`);
      expect(script).toContain(`SLACK_APP_TOKEN_${agent}`);
    }
  });

  test('quotes $SECRET in all jq extractions to prevent word splitting', () => {
    // Every echo $SECRET must be echo "$SECRET" to prevent word splitting
    // if a secret value ever contains spaces or shell metacharacters
    const unquoted = (script.match(/echo \$SECRET/g) || []).length;
    expect(unquoted).toBe(0);
    // Verify quoted form is used
    expect(script).toContain('echo "$SECRET"');
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

  test('generates GitHub App token from SSM parameters', () => {
    expect(script).toContain('GH_APP_ID');
    expect(script).toContain('GH_APP_INSTALLATION_ID');
    expect(script).toContain('GH_APP_PRIVATE_KEY_FILE');
    expect(script).toContain('github-app-token.sh');
    // GITHUB_TOKEN is exported inside the sourced github-app-token.sh script
  });

  test('starts background token refresh loop', () => {
    expect(script).toContain('github-token-refresh.sh');
  });

  // --- Security Hardening (Audit Fixes) ---
  test('uses set -euo pipefail for strict error handling', () => {
    expect(script).toContain('set -euo pipefail');
  });

  test('has AWS retry helper with exponential backoff', () => {
    expect(script).toContain('aws_retry');
    expect(script).toContain('max_attempts=3');
    expect(script).toContain('delay=$((delay * 2))');
  });

  test('validates Secrets Manager response is valid JSON', () => {
    expect(script).toContain('jq empty');
    expect(script).toContain('not valid JSON');
  });

  test('validates Slack token format (xoxb-/xapp- prefix)', () => {
    expect(script).toContain('validate_token');
    expect(script).toContain('"xoxb"');
    expect(script).toContain('"xapp"');
  });

  test('uses aws_retry for SSM parameter retrieval', () => {
    const ssmCalls = script.match(/aws_retry.*ssm get-parameter/g) || [];
    expect(ssmCalls.length).toBe(3); // app-id, installation-id, private-key
  });

  test('gateway logs redirect to file only (no stdout via tee)', () => {
    const gatewayLine = script.split('\n').find(l =>
      l.includes('openclaw gateway run') && !l.trim().startsWith('#')
    );
    expect(gatewayLine).toBeDefined();
    expect(gatewayLine).not.toContain('tee');
  });

  // --- Config wait ---
  test('waits up to 180 seconds for gateway config', () => {
    expect(script).toMatch(/seq 1 180/);
  });

  // --- Slack injection ---
  test('injects all five Slack accounts (scout, trak, kit, scribe, probe)', () => {
    for (const name of ['scout', 'trak', 'kit', 'scribe', 'probe']) {
      expect(script).toContain(`'${name}'`);
    }
  });

  test('sets groupPolicy to open', () => {
    expect(script).toContain("'groupPolicy': 'open'");
  });

  test('sets requireMention to True', () => {
    expect(script).toContain("'requireMention': True");
  });

  // --- Gateway restart messaging ---
  test('gateway restart message explains this is expected behavior', () => {
    expect(script).toContain('This is expected');
    expect(script).toContain('initial gateway generated config');
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
    const restartIdx = script.indexOf('Restarting gateway to apply injected Slack channel config');
    expect(restartIdx).toBeGreaterThan(-1);
    // The restart section should contain a direct gateway run command
    const afterRestart = script.substring(restartIdx);
    expect(afterRestart).toContain('openclaw gateway run');
    // "$@" should only appear for the initial gateway start (not in restart section).
    // Note: aws_retry uses eval "$@" which is a different usage — we check that
    // the restart section itself does NOT re-invoke "$@".
    expect(afterRestart).not.toMatch(/"\$@"\s*&/);
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

  test('bootstrap retries once if first attempt does not confirm', () => {
    expect(script).toContain('BOOT_ATTEMPT in 1 2');
    expect(script).toContain('First attempt did not confirm');
  });

  test('bootstrap timeout is at least 120 seconds', () => {
    const match = script.match(/--timeout\s+(\d+)/);
    expect(match).toBeTruthy();
    const timeout = parseInt(match![1], 10);
    expect(timeout).toBeGreaterThanOrEqual(120);
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
    expect(script).toContain('/home/openclaw/.openclaw/agents/${agent}/workspace');
    // PERSIST = .openclaw/workspace-{agent} (bind-mounted, survives restarts)
    expect(script).toContain('/home/openclaw/.openclaw/.openclaw/workspace-${agent}');
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


  test('Scribe Slack tokens are extracted from secrets', () => {
    expect(script).toContain('SLACK_BOT_TOKEN_SCRIBE');
    expect(script).toContain('SLACK_APP_TOKEN_SCRIBE');
  });

  test('proactive configs are injected into agent workspaces', () => {
    expect(script).toContain('budget-caps.json');
    expect(script).toContain('handoff-protocol.json');
    expect(script).toContain('proactive configs injected');
  });

  test('Scribe is included in workspace injection loops', () => {
    const scribeLoops = (script.match(/for agent in.*scribe/g) || []);
    expect(scribeLoops.length).toBeGreaterThanOrEqual(3);
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

  test('references gh CLI (installed in Dockerfile, fallback warning in entrypoint)', () => {
    expect(script).toContain('gh');
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

  test('sets up auth profiles for all five agents', () => {
    expect(script).toMatch(/for agent in scout trak kit scribe probe/);
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

  test('does not use legacy version field (Compose v2 ignores it)', () => {
    expect(compose).not.toMatch(/^version:/m);
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
    // /home/openclaw/.openclaw/.openclaw/workspace-{agent}
    for (const agent of ['scout', 'trak', 'kit']) {
      expect(compose).toContain(
        `/opt/openclaw-persist/workspace-${agent}:/home/openclaw/.openclaw/.openclaw/workspace-${agent}`
      );
    }
  });

  test('has memory database bind mount for virtual FS persistence', () => {
    // Without this mount, agent file edits (KNOWLEDGE.md updates) are lost
    // on container restart because the virtual FS stores modifications in
    // SQLite, not on the real filesystem.
    expect(compose).toContain(
      '/opt/openclaw-persist/memory:/home/openclaw/.openclaw/.openclaw/memory'
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
  // Original 3 agents have full CI/CD mandate and self-seeding KNOWLEDGE.md
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

      test('has self-seeding KNOWLEDGE.md bootstrap with 2-path support', () => {
        // Must have persistent path (bind-mounted, survives restarts in Docker)
        expect(identity).toContain('/home/openclaw/.openclaw/.openclaw/workspace-' + agent + '/KNOWLEDGE.md');
        // Must have virtual FS fallback path
        expect(identity).toContain('$HOME/.openclaw/agents/' + agent + '/workspace/KNOWLEDGE.md');
        // Should NOT contain Darwin/macOS references (agents run in Docker only)
        expect(identity).not.toContain('Darwin');
        expect(identity).not.toContain('.openclaw-persist');
        // Must create the file if it doesn't exist (self-seeding)
        expect(identity).toContain('if [ ! -f "$KF" ]');
        expect(identity).toContain('cat > "$KF"');
        // Must read the file after ensuring it exists
        expect(identity).toContain('cat "$KF"');
      });
    });
  }

  // Phase 3 agents (scribe, probe) have different IDENTITY structure
  for (const agent of ['scribe', 'probe']) {
    describe(`${agent} IDENTITY.md`, () => {
      let identity: string;

      beforeAll(() => {
        identity = readScript(`agents/${agent}/workspace/IDENTITY.md`);
      });

      test('exists and is non-trivial (>500 chars)', () => {
        expect(identity.length).toBeGreaterThan(500);
      });

      test('has "Who You Are" section', () => {
        expect(identity).toContain('## Who You Are');
      });

      test('has core behaviors section', () => {
        expect(identity).toContain('Core Behaviors');
      });

      test('has budget awareness section', () => {
        expect(identity).toContain('Budget Awareness');
        expect(identity).toContain('.budget-caps.json');
      });

      test('has security & access control section', () => {
        expect(identity).toContain('Security & Access Control');
      });

      test('has KNOWLEDGE.md section', () => {
        expect(identity).toContain('KNOWLEDGE.md');
      });

      test('has handoff protocol section', () => {
        expect(identity).toContain('Handoff Protocol');
        expect(identity).toContain('.handoff-protocol.json');
      });
    });
  }
});

// ---------------------------------------------------------------------------
// Agent KNOWLEDGE.md files
// ---------------------------------------------------------------------------
describe('Agent KNOWLEDGE.md files', () => {
  for (const agent of ['scout', 'trak', 'kit', 'scribe', 'probe']) {
    test(`${agent} KNOWLEDGE.md exists and is non-empty`, () => {
      const knowledge = readScript(`agents/${agent}/workspace/KNOWLEDGE.md`);
      expect(knowledge.length).toBeGreaterThan(50);
    });
  }
});


// ---------------------------------------------------------------------------
// .env.example — allow list
// ---------------------------------------------------------------------------

describe('.env.example', () => {
  let envExample: string;

  beforeAll(() => {
    envExample = readScript('.env.example');
  });

  test('SLACK_ALLOW_FROM contains 12 IDs (3 LMNTL + 6 Spartan + 3 agents)', () => {
    const match = envExample.match(/SLACK_ALLOW_FROM=\[([^\]]+)\]/);
    expect(match).toBeTruthy();
    const ids = match![1].split(',').map(s => s.trim().replace(/"/g, ''));
    expect(ids.length).toBe(12);
    // Verify all IDs look like Slack user IDs
    for (const id of ids) {
      expect(id).toMatch(/^U[A-Z0-9]+$/);
    }
  });

  test('SLACK_ALLOW_FROM includes all three LMNTL leads', () => {
    expect(envExample).toContain('U082DEF37PC'); // David Allison
    expect(envExample).toContain('U081YTU8JCX'); // Michael Wong
    expect(envExample).toContain('U0ADABVCVH8'); // Debbie Sabin
  });

  test('SLACK_ALLOW_FROM includes all six Spartan engineers', () => {
    expect(envExample).toContain('U05PJJS5XST'); // Hao Bui
    expect(envExample).toContain('U07LD2KVA58'); // Luc Tan Le
    expect(envExample).toContain('U07EW4CD78C'); // Trinh Tran
    expect(envExample).toContain('U08FP393H4J'); // Nghia Le
    expect(envExample).toContain('U084XE4S43G'); // Dai Kong Nguyen
    expect(envExample).toContain('U08NGTS8Y5B'); // Duc Hoang
  });

  test('SLACK_ALLOW_FROM includes all three agent bot IDs for cross-agent dispatch', () => {
    expect(envExample).toContain('U0AKF614URE'); // Kit bot
    expect(envExample).toContain('U0AJLT30KMG'); // Scout bot
    expect(envExample).toContain('U0AJEGUSELB'); // Trak bot
  });
});

// ---------------------------------------------------------------------------

// Slack streaming disabled (prevents leaked channel messages)
// ---------------------------------------------------------------------------
describe('Slack streaming config', () => {
  let script: string;
  beforeAll(() => { script = readScript('entrypoint.sh'); });

  test('streaming is set to off (not partial) to prevent channel message leaks', () => {
    expect(script).toContain("'streaming': 'off'");
    expect(script).not.toContain("'streaming': 'partial'");
  });

  test('nativeStreaming is disabled', () => {
    expect(script).toContain("'nativeStreaming': False");
  });
});

// ---------------------------------------------------------------------------

// GitHub App token scripts
// ---------------------------------------------------------------------------
describe('GitHub App token scripts', () => {
  let tokenScript: string;
  let refreshScript: string;

  beforeAll(() => {
    tokenScript = readScript('scripts/github-app-token.sh');
    refreshScript = readScript('scripts/github-token-refresh.sh');
  });

  test('token script generates JWT and exchanges for installation token', () => {
    expect(tokenScript).toContain('RS256');
    expect(tokenScript).toContain('openssl dgst -sha256 -sign');
    expect(tokenScript).toContain('api.github.com/app/installations');
    expect(tokenScript).toContain('export GITHUB_TOKEN');
  });

  test('token script validates required env vars', () => {
    expect(tokenScript).toContain('GH_APP_ID');
    expect(tokenScript).toContain('GH_APP_INSTALLATION_ID');
    expect(tokenScript).toContain('GH_APP_PRIVATE_KEY_FILE');
  });

  test('token script validates private key file exists', () => {
    expect(tokenScript).toContain('! -f "$GH_APP_PRIVATE_KEY_FILE"');
    expect(tokenScript).toContain('Private key file not found');
  });

  test('token script uses base64url encoding for JWT', () => {
    // JWT requires base64url, not standard base64
    expect(tokenScript).toContain("tr '+/' '-_'");
    expect(tokenScript).toContain("tr -d '='");
  });

  test('token script sets JWT expiry to 10 minutes', () => {
    // GitHub requires exp <= 10 minutes from iat
    expect(tokenScript).toContain('600');
  });

  test('token script handles API failure gracefully', () => {
    expect(tokenScript).toContain('Failed to get installation token');
    expect(tokenScript).toContain('exit 1');
  });

  test('token script uses GitHub API versioning header', () => {
    expect(tokenScript).toContain('X-GitHub-Api-Version');
  });

  test('refresh script runs every 50 minutes', () => {
    expect(refreshScript).toContain('3000');
    expect(refreshScript).toContain('github-app-token.sh');
    expect(refreshScript).toContain('gh auth login');
  });

  test('refresh script writes token to temp file with restrictive permissions', () => {
    expect(refreshScript).toContain('/tmp/.github-token');
    // Must use umask 077 to prevent other processes from reading the token
    expect(refreshScript).toContain('umask 077');
  });

  test('refresh script handles refresh failure without crashing', () => {
    // Must use set -uo pipefail (not -e) so loop continues on failure
    expect(refreshScript).toContain('set -uo pipefail');
    expect(refreshScript).not.toMatch(/^set -euo pipefail/m);
    expect(refreshScript).toContain('WARNING: Token refresh failed');
  });

  test('refresh script runs token generation in subshell to survive exit/set-e', () => {
    // The token script uses set -e and exit 1 on failure.
    // If sourced directly, those kill the refresh loop.
    // Must use bash -c (subshell) instead of source.
    expect(refreshScript).toContain('bash -c');
    expect(refreshScript).not.toMatch(/^\s+if source .*github-app-token/m);
  });
});

// ---------------------------------------------------------------------------
// GitHub App auth lifecycle (end-to-end ordering in outer entrypoint)
// ---------------------------------------------------------------------------
describe('GitHub App auth lifecycle', () => {
  let script: string;

  beforeAll(() => {
    script = readScript('entrypoint.sh');
  });

  test('does NOT use a static PAT from Secrets Manager', () => {
    // The old GITHUB_TOKEN line from Secrets Manager must be gone
    expect(script).not.toMatch(/GITHUB_TOKEN=\$\(echo \$SECRET.*jq.*GITHUB_TOKEN/);
  });

  test('fetches GitHub App credentials from SSM Parameter Store (not Secrets Manager)', () => {
    expect(script).toMatch(/aws ssm get-parameter.*github-app\/app-id/);
    expect(script).toMatch(/aws ssm get-parameter.*github-app\/installation-id/);
    expect(script).toMatch(/aws ssm get-parameter.*github-app\/private-key.*--with-decryption/);
  });

  test('writes private key to temp file with secure permissions', () => {
    expect(script).toContain('GH_APP_PRIVATE_KEY_FILE=/tmp/.github-app-key.pem');
    // Uses umask 077 to create file with 0600 from the start (no race window)
    expect(script).toContain('umask 077');
  });

  test('sources token script to export GITHUB_TOKEN into current shell', () => {
    // Must use "source" not just "bash" so GITHUB_TOKEN is available
    expect(script).toMatch(/source.*github-app-token\.sh/);
  });

  test('authenticates gh CLI after gateway restart (not just in inner entrypoint)', () => {
    const doctorIdx = script.indexOf('openclaw doctor --fix');
    const ghAuthIdx = script.indexOf('gh auth login --with-token');
    expect(ghAuthIdx).toBeGreaterThan(doctorIdx);
  });

  test('persists gh token to hosts.yml in both root and openclaw homes', () => {
    // hosts.yml written to both user homes so gh works regardless of
    // which user the gateway process or agent sandbox runs as.
    expect(script).toContain('/home/openclaw/.config/gh');
    expect(script).toContain('/root/.config/gh');
    expect(script).toContain('oauth_token');
    // Refresh script must also write to both locations
    const refresh = readScript('scripts/github-token-refresh.sh');
    expect(refresh).toContain('/home/openclaw/.config/gh');
    expect(refresh).toContain('/root/.config/gh');
  });

  test('creates gh wrapper at /usr/local/bin/gh that reads from /tmp/.github-token', () => {
    // Agent processes run in sandboxed environments where HOME may differ,
    // so hosts.yml isn't found. The wrapper reads the latest token from
    // /tmp/.github-token (updated by the refresh loop) and sets GH_TOKEN.
    expect(script).toContain('/usr/local/bin/gh');
    expect(script).toContain('/tmp/.github-token');
    expect(script).toContain('GH_TOKEN');
    // Wrapper must call the real gh binary
    expect(script).toContain('GH_REAL');
    expect(script).toContain('exec ${GH_REAL}');
  });

  test('writes initial token to /tmp/.github-token before gateway start', () => {
    const tokenFileIdx = script.indexOf('> /tmp/.github-token');
    const gatewayStartIdx = script.indexOf('openclaw gateway run --allow-unconfigured >> /data/logs');
    expect(tokenFileIdx).toBeGreaterThan(-1);
    expect(gatewayStartIdx).toBeGreaterThan(-1);
    expect(tokenFileIdx).toBeLessThan(gatewayStartIdx);
  });

  test('gh auth login runs BEFORE gateway restart', () => {
    const ghAuthIdx = script.indexOf('gh auth login --with-token');
    const firstGatewayRun = script.indexOf('openclaw gateway run');
    expect(ghAuthIdx).toBeGreaterThan(-1);
    expect(ghAuthIdx).toBeLessThan(firstGatewayRun);
  });

  test('gh auth login is conditional on gh being available', () => {
    const doctorIdx = script.indexOf('openclaw doctor --fix');
    const blockStart = script.indexOf('command -v gh', doctorIdx);
    expect(blockStart).toBeGreaterThan(doctorIdx);
    expect(blockStart).toBeLessThan(script.indexOf('gh auth login --with-token'));
  });

  test('token generation happens before inner entrypoint starts', () => {
    const tokenGenIdx = script.indexOf('github-app-token.sh');
    // Find the "$@" & that starts the inner entrypoint (not eval "$@" in aws_retry)
    const innerStartIdx = script.indexOf('"$@" &');
    expect(tokenGenIdx).toBeGreaterThan(-1);
    expect(innerStartIdx).toBeGreaterThan(-1);
    expect(tokenGenIdx).toBeLessThan(innerStartIdx);
  });

  test('token refresh loop starts after gateway is confirmed alive', () => {
    const livenessIdx = script.indexOf('kill -0 $GATEWAY_PID');
    const refreshIdx = script.indexOf('github-token-refresh.sh');
    expect(refreshIdx).toBeGreaterThan(livenessIdx);
  });

  test('GITHUB_TOKEN env var is unset before gateway start so gh reads from hosts.yml', () => {
    const unsetIdx = script.indexOf('unset GITHUB_TOKEN');
    const gatewayStartIdx = script.indexOf('openclaw gateway run --allow-unconfigured >> /data/logs');
    expect(unsetIdx).toBeGreaterThan(-1);
    expect(gatewayStartIdx).toBeGreaterThan(-1);
    expect(unsetIdx).toBeLessThan(gatewayStartIdx);
  });

  test('token refresh script includes health check watchdog', () => {
    const refreshScript = readScript('scripts/github-token-refresh.sh');
    expect(refreshScript).toContain('check_token_health');
    expect(refreshScript).toContain('gh auth status');
    expect(refreshScript).toContain('force refreshing');
    expect(refreshScript).toContain('HEALTH_CHECK_INTERVAL');
  });

  test('scripts volume is mounted in docker-compose', () => {
    const compose = readScript('docker-compose.yml');
    expect(compose).toContain('/opt/openclaw/scripts:/app/scripts');
  });

  test('deploy.sh makes scripts executable', () => {
    const deploy = readScript('deploy.sh');
    expect(deploy).toMatch(/chmod.*scripts/);
  });
});

// ---------------------------------------------------------------------------
// Zoho MCP server configuration (inner entrypoint)
// ---------------------------------------------------------------------------
describe('Zoho MCP server configuration', () => {
  let script: string;

  beforeAll(() => {
    script = readScript('docker/entrypoint.sh');
  });

  test('configures zoho in mcporter config', () => {
    expect(script).toContain("'zoho'");
  });

  test('uses node with direct path to zoho-mcp-server (not npx)', () => {
    // npx causes permission issues with this package's bin file
    // Must use node + direct path to dist/server.js
    expect(script).toContain("'command': 'node'");
    expect(script).toContain('/usr/lib/node_modules/@macnishio/zoho-mcp-server/dist/server.js');
    // Must NOT use npx for zoho (other servers can use npx)
    expect(script).not.toContain("@macnishio/zoho-mcp-server']");
  });

  test('passes Zoho OAuth env vars to mcporter config', () => {
    expect(script).toContain('ZOHO_CLIENT_ID');
    expect(script).toContain('ZOHO_CLIENT_SECRET');
    expect(script).toContain('ZOHO_REFRESH_TOKEN');
    expect(script).toContain('ZOHO_API_DOMAIN');
  });

  test('creates Claude Desktop config file for Zoho MCP server', () => {
    // @macnishio/zoho-mcp-server reads config from this Claude Desktop path
    expect(script).toContain('/home/openclaw/AppData/Roaming/Claude');
    expect(script).toContain('claude_desktop_config.json');
  });

  test('Zoho desktop config includes all three required services (crm, desk, books)', () => {
    // The server crashes with "Unknown service: desk" if desk/books are missing
    expect(script).toContain('"crm"');
    expect(script).toContain('"desk"');
    expect(script).toContain('"books"');
  });

  test('Zoho desktop config is created BEFORE gateway starts', () => {
    const zohoConfigIdx = script.indexOf('Zoho desktop config written OK');
    const gatewayIdx = script.indexOf('exec openclaw gateway run');
    expect(zohoConfigIdx).toBeGreaterThan(-1);
    expect(gatewayIdx).toBeGreaterThan(zohoConfigIdx);
  });

  test('does NOT use the broken zoho-mcp-server1 package (with 1 suffix)', () => {
    // @macnishio/zoho-mcp-server1 has multiple critical bugs:
    // - bin/cli.mjs not executable
    // - startServer not exported
    // - MCP SDK version mismatch
    expect(script).not.toContain('zoho-mcp-server1');
  });
});

// ---------------------------------------------------------------------------
// Dockerfile — Zoho package
// ---------------------------------------------------------------------------
describe('Dockerfile', () => {
  let dockerfile: string;

  beforeAll(() => {
    dockerfile = readScript('docker/Dockerfile');
  });

  test('installs @macnishio/zoho-mcp-server (without 1 suffix)', () => {
    expect(dockerfile).toContain('@macnishio/zoho-mcp-server');
    expect(dockerfile).not.toContain('zoho-mcp-server1');
  });

  test('pins OpenClaw version via ARG (not @latest)', () => {
    // Using @latest causes unpredictable builds; pin to a known version
    expect(dockerfile).not.toContain('openclaw@latest');
    expect(dockerfile).toMatch(/OPENCLAW_VERSION=\d+\.\d+/);
    expect(dockerfile).toContain('openclaw@${OPENCLAW_VERSION}');
  });

  test('installs logrotate for log management', () => {
    expect(dockerfile).toContain('logrotate');
    expect(dockerfile).toContain('/etc/logrotate.d/openclaw');
  });
});

// ---------------------------------------------------------------------------
// Zoho OAuth token seeding
// ---------------------------------------------------------------------------
describe('Zoho OAuth token seeding', () => {
  let script: string;
  beforeAll(() => {
    script = readScript('docker/entrypoint.sh');
  });

  test('seeds zoho-tokens.json from env vars at startup', () => {
    expect(script).toContain('zoho-tokens.json');
    expect(script).toContain('ZOHO_TOKENS_DIR');
  });

  test('exchanges refresh token for access token via Zoho OAuth endpoint', () => {
    expect(script).toContain('accounts.zoho.com/oauth/v2/token');
    expect(script).toContain('grant_type');
    expect(script).toContain('refresh_token');
  });

  test('seeds both access_token and refresh_token into token file', () => {
    expect(script).toContain("'access_token': access_token");
    expect(script).toContain("'refresh_token': refresh_token");
  });

  test('token seeding only runs when zoho package is installed', () => {
    expect(script).toContain('if [ -d "/usr/lib/node_modules/@macnishio/zoho-mcp-server"');
  });

  test('token seeding only runs when ZOHO_REFRESH_TOKEN is set', () => {
    expect(script).toContain('ZOHO_REFRESH_TOKEN:-');
  });

  test('token seeding runs BEFORE gateway starts', () => {
    const tokenIdx = script.indexOf('Zoho tokens seeded OK');
    const gatewayIdx = script.indexOf('exec openclaw gateway run');
    expect(tokenIdx).toBeGreaterThan(-1);
    expect(gatewayIdx).toBeGreaterThan(tokenIdx);
  });

  test('handles OAuth refresh failure gracefully', () => {
    expect(script).toContain('except Exception as e');
    expect(script).toContain('Zoho OAuth refresh error');
  });
});


describe('Zendesk MCP server patch', () => {
  let script: string;

  beforeAll(() => {
    script = readScript('docker/entrypoint.sh');
  });

  test('patch block exists in entrypoint', () => {
    expect(script).toContain('Patching zd-mcp-server');
  });

  test('triggers npx install of zd-mcp-server before patching', () => {
    expect(script).toContain('npx -y zd-mcp-server --help');
  });

  test('locates tools file via find command', () => {
    expect(script).toContain('zd-mcp-server/dist/tools');
  });

  test('uses PATCHED_DIRECT_HTTP marker for idempotency', () => {
    expect(script).toContain('PATCHED_DIRECT_HTTP');
    const matches = script.match(/PATCHED_DIRECT_HTTP/g);
    expect(matches!.length).toBeGreaterThanOrEqual(2);
  });

  test('checks if already patched before applying', () => {
    expect(script).toContain('zd-mcp-server already patched');
  });

  test('defines old_get_ticket pattern for replacement', () => {
    expect(script).toContain('old_get_ticket');
  });

  test('defines new_get_ticket replacement with direct HTTPS', () => {
    expect(script).toContain('new_get_ticket');
    // The new implementation uses node:https directly
    expect(script).toContain("node:https");
  });

  test('replaces getTicketDetails as well', () => {
    expect(script).toContain('old_get_details');
    expect(script).toContain('new_get_details');
  });

  test('new implementation validates ticket ID with isNaN', () => {
    expect(script).toContain('isNaN(id)');
  });

  test('new implementation uses correct Zendesk API path', () => {
    expect(script).toContain('/api/v2/tickets/');
  });

  test('new implementation uses Zendesk environment variables for auth', () => {
    expect(script).toContain('ZENDESK_SUBDOMAIN');
    expect(script).toContain('ZENDESK_EMAIL');
    expect(script).toContain('ZENDESK_TOKEN');
  });

  test('new implementation constructs Basic auth header', () => {
    expect(script).toContain("Buffer.from(email + '/token:' + token)");
  });

  test('new implementation fetches ticket comments endpoint', () => {
    expect(script).toContain('/comments.json');
  });

  test('patch runs BEFORE gateway starts', () => {
    const patchIdx = script.indexOf('Patching zd-mcp-server');
    const gatewayIdx = script.indexOf('exec openclaw gateway run');
    expect(patchIdx).toBeGreaterThan(-1);
    expect(gatewayIdx).toBeGreaterThan(patchIdx);
  });

  test('handles missing zd-mcp-server gracefully', () => {
    expect(script).toContain('zd-mcp-server not found in npx cache, skipping patch');
  });

  test('reports patch results with function-level detail', () => {
    expect(script).toContain('zd-mcp-server patched OK');
    expect(script).toContain('getTicket=');
    expect(script).toContain('getTicketDetails=');
  });

  test('warns when expected function signatures are not found', () => {
    expect(script).toContain('Could not find expected function signatures to patch');
  });

  test('uses python heredoc for safe multi-line patching', () => {
    expect(script).toContain('ZD_PATCH_EOF');
  });
});

// ---------------------------------------------------------------------------
// Specialist Agent Definitions
// ---------------------------------------------------------------------------
describe('Specialist Agent Definitions', () => {
  const SPECIALISTS_DIR = join(ROOT, 'agents', 'shared', 'specialists');

  const EXPECTED_SPECIALISTS = [
    'business-analyst',
    'code-review-architect',
    'data-engineer',
    'devops-engineer',
    'implementation-engineer',
    'orchestrator-coordinator',
    'pr-scope-reviewer',
    'product-owner',
    'qa-test-engineer',
    'security-risk-auditor',
    'site-reliability-engineer',
    'technical-architect',
    'ux-ui-designer',
  ];

  test('specialists directory exists', () => {
    const { existsSync } = require('fs');
    expect(existsSync(SPECIALISTS_DIR)).toBe(true);
  });

  test('contains all 13 expected specialist files', () => {
    const { readdirSync } = require('fs');
    const files = readdirSync(SPECIALISTS_DIR).filter((f: string) => f !== 'README.md');
    expect(files.sort()).toEqual(EXPECTED_SPECIALISTS.map(s => `${s}.md`).sort());
  });

  test('README.md exists in specialists directory', () => {
    const readme = readScript('agents/shared/specialists/README.md');
    expect(readme.length).toBeGreaterThan(100);
    expect(readme).toContain('Specialist Agent');
    expect(readme).toContain('Human-Facing Agent');
  });

  for (const specialist of EXPECTED_SPECIALISTS) {
    describe(`${specialist}.md`, () => {
      let content: string;

      beforeAll(() => {
        content = readScript(`agents/shared/specialists/${specialist}.md`);
      });

      test('is non-empty', () => {
        expect(content.length).toBeGreaterThan(200);
      });

      test('has YAML frontmatter with name field', () => {
        expect(content).toMatch(/^---\n/);
        expect(content).toContain(`name: ${specialist}`);
      });

      test('has YAML frontmatter with description field', () => {
        expect(content).toMatch(/description:/);
      });

      test('defines a clear role or methodology', () => {
        // Every specialist should have some kind of methodology, review approach, or workflow
        expect(content).toMatch(/[Mm]ethodology|[Rr]eview|[Ww]orkflow|[Pp]rocess|[Rr]esponsib/);
      });
    });
  }

  // Stricter checks for the core audit specialists that MUST have full guardrails
  const AUDIT_SPECIALISTS_WITH_FULL_GUARDRAILS = [
    'code-review-architect',
    'security-risk-auditor',
    'qa-test-engineer',
  ];

  for (const specialist of AUDIT_SPECIALISTS_WITH_FULL_GUARDRAILS) {
    describe(`${specialist}.md — audit guardrails`, () => {
      let content: string;
      beforeAll(() => {
        content = readScript(`agents/shared/specialists/${specialist}.md`);
      });

      test('contains evidence protocol section', () => {
        expect(content).toMatch(/[Ee]vidence [Pp]rotocol/);
      });

      test('contains anti-hallucination guardrails', () => {
        expect(content).toMatch(/[Aa]nti-[Hh]allucination/);
      });

      test('contains scope awareness section', () => {
        expect(content).toMatch(/[Ss]cope [Aa]wareness/);
      });

      test('requires VERIFIED/UNVERIFIED labeling', () => {
        expect(content).toContain('VERIFIED');
        expect(content).toContain('UNVERIFIED');
      });
    });
  }

  // Validate specialist-to-dimension mapping is complete
  describe('Dimension Coverage', () => {
    test('code-review-architect covers Correctness dimension', () => {
      const content = readScript('agents/shared/specialists/code-review-architect.md');
      expect(content).toMatch(/[Cc]ode [Rr]eview|[Cc]ode quality|[Aa]rchitectural compliance/);
    });

    test('security-risk-auditor covers Security dimension', () => {
      const content = readScript('agents/shared/specialists/security-risk-auditor.md');
      expect(content).toMatch(/OWASP|[Vv]ulnerab/);
    });

    test('ux-ui-designer covers UX/Accessibility dimension', () => {
      const content = readScript('agents/shared/specialists/ux-ui-designer.md');
      expect(content).toMatch(/WCAG|[Aa]ccessibility/);
    });

    test('product-owner covers Product-Market Fit dimension', () => {
      const content = readScript('agents/shared/specialists/product-owner.md');
      expect(content).toMatch(/[Pp]roduct|[Pp]rioritiz|[Uu]ser stor/);
    });

    test('devops-engineer covers Operations dimension', () => {
      const content = readScript('agents/shared/specialists/devops-engineer.md');
      expect(content).toMatch(/CI\/CD|[Dd]eployment|[Mm]onitoring/);
    });

    test('site-reliability-engineer covers Operations dimension', () => {
      const content = readScript('agents/shared/specialists/site-reliability-engineer.md');
      expect(content).toMatch(/SLI|SLO|[Ii]ncident/);
    });

    test('technical-architect covers Architecture dimension', () => {
      const content = readScript('agents/shared/specialists/technical-architect.md');
      expect(content).toMatch(/[Ss]ystem [Dd]esign|[Aa]rchitect/);
    });

    test('qa-test-engineer covers Test Coverage dimension', () => {
      const content = readScript('agents/shared/specialists/qa-test-engineer.md');
      expect(content).toMatch(/[Tt]est|[Cc]overage/);
    });

    test('orchestrator-coordinator maps all 12 other specialists', () => {
      const content = readScript('agents/shared/specialists/orchestrator-coordinator.md');
      // Must list at least the core specialists
      expect(content).toContain('code-review-architect');
      expect(content).toContain('security-risk-auditor');
      expect(content).toContain('qa-test-engineer');
      expect(content).toContain('technical-architect');
    });
  });
});

// ---------------------------------------------------------------------------
// Specialist Integration in Agent IDENTITY.md files
// ---------------------------------------------------------------------------
describe('Specialist Integration in Agent Identities', () => {

  describe('Kit — Specialist Integration', () => {
    let identity: string;

    beforeAll(() => {
      identity = readScript('agents/kit/workspace/IDENTITY.md');
    });

    test('has Specialist Agent Capabilities section', () => {
      expect(identity).toContain('Specialist Agent Capabilities');
    });

    test('references agents/shared/specialists/ directory', () => {
      expect(identity).toContain('agents/shared/specialists/');
    });

    test('lists all primary engineering specialists', () => {
      expect(identity).toContain('code-review-architect');
      expect(identity).toContain('security-risk-auditor');
      expect(identity).toContain('technical-architect');
      expect(identity).toContain('devops-engineer');
      expect(identity).toContain('site-reliability-engineer');
      expect(identity).toContain('qa-test-engineer');
      expect(identity).toContain('implementation-engineer');
      expect(identity).toContain('pr-scope-reviewer');
      expect(identity).toContain('data-engineer');
    });

    test('lists cross-domain specialists', () => {
      expect(identity).toContain('product-owner');
      expect(identity).toContain('business-analyst');
      expect(identity).toContain('ux-ui-designer');
      expect(identity).toContain('orchestrator-coordinator');
    });

    test('documents all 7 audit dimensions', () => {
      expect(identity).toContain('Correctness');
      expect(identity).toContain('Security');
      expect(identity).toContain('Architecture');
      expect(identity).toContain('Operations');
      expect(identity).toContain('Test Coverage');
      expect(identity).toContain('Product-Market Fit');
    });

    test('includes evidence protocol requirements', () => {
      expect(identity).toContain('VERIFIED');
      expect(identity).toContain('UNVERIFIED');
      expect(identity).toContain('File path and line number');
    });

    test('mentions false positive rate awareness', () => {
      expect(identity).toMatch(/false positive rate.*40.*50/i);
    });

    test('uses 7-dimension ensemble result format', () => {
      expect(identity).toContain('7-Dimension Audit');
      expect(identity).toContain('Dimensions Passing');
    });

    test('PR review protocol references specialist analysis', () => {
      expect(identity).toContain('Apply specialist analysis');
    });

    test('requests product-market fit from Trak', () => {
      expect(identity).toContain('product-market fit');
    });

    test('requests accessibility from Scout', () => {
      expect(identity).toContain('accessibility');
    });
  });

  describe('Trak — Specialist Integration', () => {
    let identity: string;

    beforeAll(() => {
      identity = readScript('agents/trak/workspace/IDENTITY.md');
    });

    test('has Specialist Agent Capabilities section', () => {
      expect(identity).toContain('Specialist Agent Capabilities');
    });

    test('references agents/shared/specialists/ directory', () => {
      expect(identity).toContain('agents/shared/specialists/');
    });

    test('lists product-owner as primary specialist', () => {
      expect(identity).toContain('product-owner');
      expect(identity).toContain('Product Owner');
    });

    test('lists business-analyst as primary specialist', () => {
      expect(identity).toContain('business-analyst');
      expect(identity).toContain('Business Analyst');
    });

    test('lists orchestrator-coordinator as primary specialist', () => {
      expect(identity).toContain('orchestrator-coordinator');
      expect(identity).toContain('Orchestrator Coordinator');
    });

    test('contributes Product-Market Fit dimension (#4)', () => {
      expect(identity).toContain('Product-Market Fit');
      expect(identity).toContain('dimension #4');
    });

    test('includes product-market fit assessment in PR review', () => {
      expect(identity).toContain('Product-Market Fit Assessment');
      expect(identity).toContain('Strategic alignment');
      expect(identity).toContain('Scope creep');
    });

    test('uses DATA-BACKED vs HYPOTHESIS evidence labels', () => {
      expect(identity).toContain('DATA-BACKED');
      expect(identity).toContain('HYPOTHESIS');
    });

    test('combines Jira verification with product-market fit in PR review', () => {
      expect(identity).toContain('Jira Verification');
      expect(identity).toContain('Product fit');
    });
  });

  describe('Scout — Specialist Integration', () => {
    let identity: string;

    beforeAll(() => {
      identity = readScript('agents/scout/workspace/IDENTITY.md');
    });

    test('has Specialist Agent Capabilities section', () => {
      expect(identity).toContain('Specialist Agent Capabilities');
    });

    test('references agents/shared/specialists/ directory', () => {
      expect(identity).toContain('agents/shared/specialists/');
    });

    test('lists ux-ui-designer as primary specialist', () => {
      expect(identity).toContain('ux-ui-designer');
      expect(identity).toContain('UX/UI Designer');
    });

    test('contributes UX/Accessibility dimension (#3)', () => {
      expect(identity).toContain('UX/Accessibility');
      expect(identity).toContain('dimension (#3)');
    });

    test('includes WCAG 2.1 AA compliance methodology', () => {
      expect(identity).toContain('WCAG 2.1 AA');
    });

    test('includes accessibility evidence protocol', () => {
      expect(identity).toContain('VERIFIED');
      expect(identity).toContain('PROPOSED');
    });

    test('combines customer impact with accessibility in PR review', () => {
      expect(identity).toContain('Customer Impact Assessment');
      expect(identity).toContain('UX/Accessibility Assessment');
    });

    test('references specific WCAG criteria in examples', () => {
      expect(identity).toMatch(/WCAG \d+\.\d+\.\d+/);
    });
  });
});

// ---------------------------------------------------------------------------
// Ensemble Audit Playbook — 7-Dimension Model
// ---------------------------------------------------------------------------
describe('Ensemble Audit Playbook — Specialist Integration', () => {
  let playbook: string;

  beforeAll(() => {
    playbook = readScript('docs/playbooks/ensemble-audit.md');
  });

  test('has Specialist Agent Integration section', () => {
    expect(playbook).toContain('Specialist Agent Integration');
  });

  test('references agents/shared/specialists/ directory', () => {
    expect(playbook).toContain('agents/shared/specialists/');
  });

  test('documents all 7 audit dimensions', () => {
    expect(playbook).toContain('Correctness');
    expect(playbook).toContain('Security');
    expect(playbook).toContain('UX/Accessibility');
    expect(playbook).toContain('Product-Market Fit');
    expect(playbook).toContain('Operations');
    expect(playbook).toContain('Architecture');
    expect(playbook).toContain('Test Coverage');
  });

  test('maps each dimension to a primary agent', () => {
    // Dimensions 1,2,5,6,7 → Kit; 3 → Scout; 4 → Trak
    expect(playbook).toMatch(/Correctness.*Kit/);
    expect(playbook).toMatch(/Security.*Kit/);
    expect(playbook).toMatch(/UX\/Accessibility.*Scout/);
    expect(playbook).toMatch(/Product-Market Fit.*Trak/);
    expect(playbook).toMatch(/Operations.*Kit/);
    expect(playbook).toMatch(/Architecture.*Kit/);
    expect(playbook).toMatch(/Test Coverage.*Kit/);
  });

  test('maps each dimension to specialist persona(s)', () => {
    expect(playbook).toContain('code-review-architect');
    expect(playbook).toContain('security-risk-auditor');
    expect(playbook).toContain('ux-ui-designer');
    expect(playbook).toContain('product-owner');
    expect(playbook).toContain('devops-engineer');
    expect(playbook).toContain('site-reliability-engineer');
    expect(playbook).toContain('technical-architect');
    expect(playbook).toContain('qa-test-engineer');
  });

  test('lists supporting specialists', () => {
    expect(playbook).toContain('data-engineer');
    expect(playbook).toContain('implementation-engineer');
    expect(playbook).toContain('pr-scope-reviewer');
    expect(playbook).toContain('business-analyst');
    expect(playbook).toContain('orchestrator-coordinator');
  });

  test('includes evidence protocol section', () => {
    expect(playbook).toContain('Evidence Protocol');
    expect(playbook).toContain('VERIFIED');
    expect(playbook).toContain('UNVERIFIED');
  });

  test('mentions false positive rate', () => {
    expect(playbook).toMatch(/false positive.*40.*50/i);
  });

  test('specifies maximum 3 audit rounds before escalation', () => {
    expect(playbook).toMatch(/[Mm]aximum 3 audit rounds/);
  });

  test('Kit applies specialist analysis across 5 dimensions', () => {
    expect(playbook).toContain('Correctness');
    expect(playbook).toContain('Security');
    expect(playbook).toContain('Operations');
    expect(playbook).toContain('Architecture');
    expect(playbook).toContain('Test Coverage');
  });

  test('Trak applies product-owner specialist for dimension 4', () => {
    expect(playbook).toContain('product-owner specialist');
  });

  test('Scout applies ux-ui-designer specialist for dimension 3', () => {
    expect(playbook).toContain('ux-ui-designer specialist');
  });

  test('standardized result format shows all 7 dimensions', () => {
    expect(playbook).toContain('7-Dimension Audit');
    expect(playbook).toContain('Dimensions Passing');
  });

  test('consensus rules reference dimension pass/fail', () => {
    expect(playbook).toContain('APPROVED (7/7)');
    expect(playbook).toContain('NEEDS WORK');
    expect(playbook).toContain('BLOCKED');
  });
});

// ---------------------------------------------------------------------------
// Agent Capability Matrix — Specialist Integration
// ---------------------------------------------------------------------------
describe('Agent Capability Matrix — Specialist Integration', () => {
  let matrix: string;

  beforeAll(() => {
    matrix = readScript('docs/agent-capability-matrix.md');
  });

  test('has Specialist Agent Integration section', () => {
    expect(matrix).toContain('Specialist Agent Integration');
  });

  test('documents specialist-to-dimension mapping', () => {
    expect(matrix).toContain('Specialist-to-Dimension Mapping');
  });

  test('documents supporting specialists', () => {
    expect(matrix).toContain('Supporting Specialists');
  });

  test('explains how specialists work (not separate processes)', () => {
    expect(matrix).toContain('NOT separate processes');
    expect(matrix).toContain('expertise profiles');
  });

  test('Kit specialization includes 5 dimensions', () => {
    expect(matrix).toContain('correctness, security, operations, architecture, test coverage');
  });

  test('Trak specialization includes product-market fit', () => {
    expect(matrix).toContain('product-market fit');
    expect(matrix).toContain('product-owner specialist');
  });

  test('Scout specialization includes UX/accessibility', () => {
    expect(matrix).toContain('UX/accessibility');
    expect(matrix).toContain('ux-ui-designer specialist');
  });
});

// ---------------------------------------------------------------------------
// Issue #44: Non-root Docker user
// ---------------------------------------------------------------------------
describe('Non-root Docker user (#44)', () => {
  let dockerfile: string;
  let compose: string;
  let outerEntrypoint: string;
  let innerEntrypoint: string;
  let healthcheck: string;
  let tokenRefresh: string;

  beforeAll(() => {
    dockerfile = readScript('docker/Dockerfile');
    compose = readScript('docker-compose.yml');
    outerEntrypoint = readScript('entrypoint.sh');
    innerEntrypoint = readScript('docker/entrypoint.sh');
    healthcheck = readScript('scripts/healthcheck.sh');
    tokenRefresh = readScript('scripts/github-token-refresh.sh');
  });

  test('Dockerfile creates non-root openclaw user', () => {
    expect(dockerfile).toContain('useradd');
    expect(dockerfile).toContain('openclaw');
    expect(dockerfile).toContain('1000');
  });

  test('Dockerfile sets OPENCLAW_HOME to /home/openclaw', () => {
    expect(dockerfile).toContain('OPENCLAW_HOME=/home/openclaw/.openclaw');
    expect(dockerfile).not.toContain('OPENCLAW_HOME=/root');
  });

  test('inner entrypoint drops to openclaw user via gosu', () => {
    expect(innerEntrypoint).toContain('gosu openclaw');
    expect(innerEntrypoint).toContain('chown -R openclaw:openclaw /home/openclaw');
  });

  test('Dockerfile sets ownership of home directory and installs gosu', () => {
    expect(dockerfile).toContain('chown -R openclaw:openclaw /home/openclaw');
    expect(dockerfile).toContain('gosu');
  });

  test('Dockerfile installs mcporter and gh CLI at build time (requires root)', () => {
    expect(dockerfile).toMatch(/npm install -g mcporter/);
    expect(dockerfile).toMatch(/apt-get.*install.*gh/);
  });

  test('docker-compose.yml uses /home/openclaw paths for container mounts', () => {
    expect(compose).toContain('/home/openclaw/.openclaw/.openclaw/workspace-scout');
    expect(compose).not.toContain('/root/.openclaw/.openclaw/workspace');
  });

  test('outer entrypoint uses /home/openclaw paths', () => {
    expect(outerEntrypoint).toContain('/home/openclaw/.openclaw');
    expect(outerEntrypoint).not.toContain('/root/.openclaw');
  });

  test('inner entrypoint uses /home/openclaw paths', () => {
    expect(innerEntrypoint).toContain('/home/openclaw');
    expect(innerEntrypoint).not.toContain('/root/.mcporter');
  });

  test('healthcheck uses /home/openclaw path for config grep', () => {
    expect(healthcheck).toContain('/home/openclaw/.openclaw');
    expect(healthcheck).not.toContain('/root/.openclaw');
  });

  test('github-token-refresh uses /home/openclaw path', () => {
    expect(tokenRefresh).toContain('/home/openclaw/.config/gh');
    // Also writes to /root/.config/gh for coverage (gateway runs as root)
    expect(tokenRefresh).toContain('/root/.config/gh');
  });

  test('github-token-refresh validates token file after write', () => {
    // Must check the file is readable after writing
    expect(tokenRefresh).toContain('-r /tmp/.github-token');
    // Must log errors on write failure
    expect(tokenRefresh).toContain('ERROR: Failed to write token');
  });

  test('no /root/ references in any shell script or config (except gh config)', () => {
    const files = [outerEntrypoint, innerEntrypoint, healthcheck, tokenRefresh, compose];
    for (const content of files) {
      // Allow /root only in comments AND in gh config paths (writing to both user homes is intentional)
      const lines = content.split('\n').filter(l => !l.trim().startsWith('#') && !l.trim().startsWith('//'));
      const rootRefs = lines.filter(l => l.includes('/root/') && !l.includes('/root/.npm') && !l.includes('/root/.config/gh'));
      expect(rootRefs).toEqual([]);
    }
  });
});

// ---------------------------------------------------------------------------
// Issue #54: Parameterized IDs
// ---------------------------------------------------------------------------
describe('Parameterized IDs (#54)', () => {
  let healthcheck: string;
  let compose: string;

  beforeAll(() => {
    healthcheck = readScript('scripts/healthcheck.sh');
    compose = readScript('docker-compose.yml');
  });

  test('healthcheck SNS topic uses env var with default', () => {
    expect(healthcheck).toContain('OPENCLAW_SNS_TOPIC:-');
    expect(healthcheck).toContain('arn:aws:sns');
  });

  test('healthcheck Slack channel uses env var with default', () => {
    expect(healthcheck).toContain('OPENCLAW_ALERT_CHANNEL:-');
  });

  test('docker-compose passes OPENCLAW_SNS_TOPIC', () => {
    expect(compose).toContain('OPENCLAW_SNS_TOPIC');
  });

  test('docker-compose passes OPENCLAW_ALERT_CHANNEL', () => {
    expect(compose).toContain('OPENCLAW_ALERT_CHANNEL');
  });
});

// ---------------------------------------------------------------------------
// Issue #55: Log rotation and structured logging
// ---------------------------------------------------------------------------
describe('Log rotation and monitoring (#55)', () => {
  let dockerfile: string;
  let healthcheck: string;
  let scheduler: string;
  let outerEntrypoint: string;

  beforeAll(() => {
    dockerfile = readScript('docker/Dockerfile');
    healthcheck = readScript('scripts/healthcheck.sh');
    scheduler = readScript('scripts/proactive-scheduler.sh');
    outerEntrypoint = readScript('entrypoint.sh');
  });

  test('Dockerfile logrotate covers all log files with wildcard', () => {
    expect(dockerfile).toContain('/data/logs/*.log');
  });

  test('Dockerfile logrotate includes maxage for log expiry', () => {
    expect(dockerfile).toContain('maxage');
  });

  test('healthcheck has structured JSON logging function', () => {
    expect(healthcheck).toContain('log_json');
    expect(healthcheck).toContain('.jsonl');
  });

  test('proactive scheduler has structured JSON logging', () => {
    expect(scheduler).toContain('log_json');
    expect(scheduler).toContain('.jsonl');
  });

  test('outer entrypoint sets up logrotate cron', () => {
    expect(outerEntrypoint).toContain('logrotate');
    expect(outerEntrypoint).toContain('crontab');
  });
});

// ---------------------------------------------------------------------------
// Issue #53: Handoff HMAC authentication
// ---------------------------------------------------------------------------
describe('Handoff HMAC authentication (#53)', () => {
  let handoffProtocol: string;
  let outerEntrypoint: string;
  let scheduler: string;
  let compose: string;

  beforeAll(() => {
    handoffProtocol = readScript('config/proactive/handoff-protocol.json');
    outerEntrypoint = readScript('entrypoint.sh');
    scheduler = readScript('scripts/proactive-scheduler.sh');
    compose = readScript('docker-compose.yml');
  });

  test('handoff protocol defines HMAC authentication', () => {
    const parsed = JSON.parse(handoffProtocol);
    expect(parsed.protocol.authentication).toBeDefined();
    expect(parsed.protocol.authentication.method).toBe('hmac-sha256');
    expect(parsed.protocol.authentication.key_env).toBe('HANDOFF_HMAC_KEY');
  });

  test('outer entrypoint generates HMAC key from API key', () => {
    expect(outerEntrypoint).toContain('HANDOFF_HMAC_KEY');
    expect(outerEntrypoint).toContain('sha256sum');
    expect(outerEntrypoint).toContain('openclaw-handoff-');
  });

  test('proactive scheduler signs handoff messages with HMAC', () => {
    expect(scheduler).toContain('openssl dgst -sha256 -hmac');
    expect(scheduler).toContain('[HMAC:');
    expect(scheduler).toContain('HANDOFF_HMAC_KEY');
  });

  test('docker-compose passes HANDOFF_HMAC_KEY', () => {
    expect(compose).toContain('HANDOFF_HMAC_KEY');
  });

  test('HMAC key derivation validates key length (64-char SHA256)', () => {
    expect(outerEntrypoint).toContain('${#HANDOFF_HMAC_KEY} -ne 64');
  });

  test('ANTHROPIC_API_KEY is validated before HMAC derivation', () => {
    const apiKeyIdx = outerEntrypoint.indexOf('ANTHROPIC_API_KEY not found');
    const hmacIdx = outerEntrypoint.indexOf('HANDOFF_HMAC_KEY=$(');
    expect(apiKeyIdx).toBeGreaterThan(-1);
    expect(hmacIdx).toBeGreaterThan(apiKeyIdx);
  });
});

// ---------------------------------------------------------------------------
// Issue #56: Dangerous action enforcement
// ---------------------------------------------------------------------------
describe('Dangerous action enforcement (#56)', () => {
  let auditScript: string;
  let scheduler: string;
  let dockerfile: string;

  beforeAll(() => {
    auditScript = readScript('scripts/dangerous-action-audit.sh');
    scheduler = readScript('scripts/proactive-scheduler.sh');
    dockerfile = readScript('docker/Dockerfile');
  });

  test('dangerous-action-audit.sh exists and has tier validation', () => {
    expect(auditScript).toContain('tier_level');
    expect(auditScript).toContain('admin');
    expect(auditScript).toContain('developer');
    expect(auditScript).toContain('support');
  });

  test('audit script writes to append-only JSONL log', () => {
    expect(auditScript).toContain('dangerous-actions-audit.jsonl');
    expect(auditScript).toContain('>> "$AUDIT_LOG"');
  });

  test('audit script blocks actions when tier is insufficient', () => {
    expect(auditScript).toContain('insufficient_tier');
    expect(auditScript).toContain('exit 1');
  });

  test('audit script enforces confirmation requirements', () => {
    expect(auditScript).toContain('missing_confirmation');
    expect(auditScript).toContain('missing_double_confirmation');
  });

  test('audit script uses jq --arg to prevent injection', () => {
    expect(auditScript).toContain('--arg pat');
    expect(auditScript).toContain('$pat');
    // Must NOT use string interpolation in jq filter
    expect(auditScript).not.toContain('select(.pattern == \\"$action\\")');
  });

  test('proactive scheduler injects safety constraints for dangerous actions', () => {
    expect(scheduler).toContain('PROACTIVE SAFETY CONSTRAINT');
    expect(scheduler).toContain('dangerous-actions.json');
  });

  test('Dockerfile copies scripts including audit script', () => {
    expect(dockerfile).toContain('COPY scripts/ /app/scripts/');
    expect(dockerfile).toContain('chmod +x');
  });
});

// ---------------------------------------------------------------------------
// Documentation: Startup runbook exists
// ---------------------------------------------------------------------------
describe('Startup runbook', () => {
  let runbook: string;

  beforeAll(() => {
    runbook = readScript('docs/runbooks/startup.md');
  });

  test('documents the two-stage startup sequence', () => {
    expect(runbook).toContain('Two-Stage Startup');
    expect(runbook).toContain('Inner Entrypoint');
    expect(runbook).toContain('Outer Entrypoint');
  });

  test('explains the "already listening" message is expected', () => {
    expect(runbook).toContain('already listening');
    expect(runbook).toContain('Normal: brief overlap');
  });

  test('documents expected log messages', () => {
    expect(runbook).toContain('Expected Log Messages');
    expect(runbook).toContain('Restarting gateway');
  });

  test('includes verification steps', () => {
    expect(runbook).toContain('Verification After Startup');
    expect(runbook).toContain('docker ps');
  });

  test('includes timing table', () => {
    expect(runbook).toContain('Timing');
    expect(runbook).toContain('Agent bootstrap');
  });
});

// ---------------------------------------------------------------------------
// Cross-agent handoff configuration
// ---------------------------------------------------------------------------
describe('Cross-agent handoff configuration', () => {
  let outerEntrypoint: string;
  let handoffProtocol: string;

  beforeAll(() => {
    outerEntrypoint = readScript('entrypoint.sh');
    handoffProtocol = readScript('config/proactive/handoff-protocol.json');
  });

  test('entrypoint enables tools.sessions.visibility=all for cross-agent messaging', () => {
    expect(outerEntrypoint).toContain("sessions");
    expect(outerEntrypoint).toContain("visibility");
    expect(outerEntrypoint).toContain("all");
    // Must be in the Python injection block
    expect(outerEntrypoint).toContain("cross-agent handoffs");
  });

  test('handoff protocol specifies sessions_send as primary delivery', () => {
    const parsed = JSON.parse(handoffProtocol);
    expect(parsed.protocol.delivery_methods).toBeDefined();
    expect(parsed.protocol.delivery_methods.primary.method).toBe('sessions_send');
    expect(parsed.protocol.delivery_methods.fallback.method).toBe('channel_mention');
    expect(parsed.protocol.delivery_methods.blocked.method).toBe('slack_dm');
  });

  test('handoff protocol marks bot-to-bot DMs as blocked', () => {
    const parsed = JSON.parse(handoffProtocol);
    expect(parsed.protocol.delivery_methods.blocked.status).toBe('blocked_by_slack_api');
    expect(parsed.protocol.delivery_methods.blocked.description).toContain('cannot_dm_bot');
  });

  test('handoff protocol includes fallback channel ID for #dev', () => {
    const parsed = JSON.parse(handoffProtocol);
    expect(parsed.protocol.delivery_methods.fallback.channel_id).toBe('C086N5031LZ');
  });

  test('handoff protocol retains HMAC authentication', () => {
    const parsed = JSON.parse(handoffProtocol);
    expect(parsed.protocol.authentication.method).toBe('hmac-sha256');
    expect(parsed.protocol.authentication.key_env).toBe('HANDOFF_HMAC_KEY');
  });

  test('all agent IDENTITY.md files have cross-agent handoff protocol', () => {
    for (const agent of ['scout', 'trak', 'kit', 'scribe', 'probe']) {
      const identity = readScript(`agents/${agent}/workspace/IDENTITY.md`);
      expect(identity).toContain('Cross-Agent Handoff Protocol');
      expect(identity).toContain('sessions_send');
      expect(identity).toContain('cannot_dm_bot');
      expect(identity).toContain('agent:kit:main');
      expect(identity).toContain('HMAC');
    }
  });

  test('handoff protocol includes agent_slack_ids map with all 5 agents', () => {
    const parsed = JSON.parse(handoffProtocol);
    expect(parsed.agent_slack_ids).toBeDefined();
    const agents = Object.keys(parsed.agent_slack_ids);
    expect(agents).toContain('scout');
    expect(agents).toContain('trak');
    expect(agents).toContain('kit');
    expect(agents).toContain('scribe');
    expect(agents).toContain('probe');
    // Each agent has user_id and session_target
    for (const agent of agents) {
      expect(parsed.agent_slack_ids[agent].user_id).toMatch(/^U0/);
      expect(parsed.agent_slack_ids[agent].session_target).toMatch(/^agent:[a-z]+:main$/);
    }
  });

  test('all IDENTITY.md files have fallback @mention lookup with Slack user IDs', () => {
    const agentIds = {
      scout: 'U0AJLT30KMG',
      trak: 'U0AJEGUSELB',
      kit: 'U0AKF614URE',
      scribe: 'U0AM170694Z',
      probe: 'U0ALRTLF752',
    };
    for (const agent of ['scout', 'trak', 'kit', 'scribe', 'probe']) {
      const identity = readScript(`agents/${agent}/workspace/IDENTITY.md`);
      expect(identity).toContain('Fallback @mention lookup');
      // Should contain user IDs for all OTHER agents (not self)
      for (const [other, uid] of Object.entries(agentIds)) {
        if (other !== agent) {
          expect(identity).toContain(`<@${uid}>`);
        }
      }
    }
  });

  test('all IDENTITY.md files have Inter-Agent Delegation section with 4 siblings', () => {
    for (const agent of ['scout', 'trak', 'kit', 'scribe', 'probe']) {
      const identity = readScript(`agents/${agent}/workspace/IDENTITY.md`);
      expect(identity).toContain('Inter-Agent Delegation & Communication');
      expect(identity).toContain('four other agents');
    }
  });

  test('no IDENTITY.md files reference bot-to-bot Slack DMs as a delivery method', () => {
    for (const agent of ['scout', 'trak', 'kit', 'scribe', 'probe']) {
      const identity = readScript(`agents/${agent}/workspace/IDENTITY.md`);
      // The old Scribe instruction
      expect(identity).not.toContain('Confirm completion back to the requesting agent via Slack DM');
      // The old Probe instruction
      expect(identity).not.toContain('DM the target agent in Slack with the handoff ID');
    }
  });

});
