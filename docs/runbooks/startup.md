# Startup Sequence

How the OpenClaw agents container starts, what each log message means, and how to verify a healthy boot.

## Two-Stage Startup

The container has a **two-stage startup** orchestrated by a chain of two entrypoints:

### Stage 1: Inner Entrypoint (runs as root, drops to openclaw)

The inner entrypoint (`docker/entrypoint.sh`) handles one-time setup:

1. Drops privileges to the `openclaw` user (UID 1000) via `gosu`
2. Installs/updates mcporter MCP config
3. Configures gh CLI authentication
4. Starts the OpenClaw gateway process
5. Gateway writes its default config to `~/.openclaw/.openclaw/openclaw.json`

This takes 60–120 seconds depending on MCP server initialization.

### Stage 2: Outer Entrypoint (runs as root)

The outer entrypoint (`entrypoint.sh`) orchestrates the full boot:

1. **Fetches secrets** from AWS Secrets Manager and SSM Parameter Store
2. **Generates GitHub App token** from private key (1-hour expiry)
3. **Starts inner entrypoint** in background, waits up to 180s for config file
4. **Injects Slack channels** into the gateway config (5 agents: scout, trak, kit, scribe, probe)
5. **Runs `openclaw doctor --fix`** to normalize config schema
    - Also sets `tools.sessions.visibility = "all"` for cross-agent handoffs via `sessions_send`
6. **Fixes config ownership** (`chown openclaw:openclaw`) since outer entrypoint runs as root
7. **Installs gh wrapper** at `/usr/local/bin/gh` that reads token from `/tmp/.github-token`
8. **Injects workspace files** (IDENTITY.md, KNOWLEDGE.md, security configs, proactive configs)
9. **Kills first gateway** and restarts with injected config
10. **Starts token refresh loop** in background (refreshes every 50 min)
11. **Bootstraps agents** by sending a test message that forces MCP tool enumeration

## Expected Log Messages

These messages appear during **every normal startup** and are NOT errors:

| Log Message | Meaning |
|------------|---------|
| `Restarting gateway to apply injected Slack channel config...` | Normal: first gateway generated config, now restarting with channels injected |
| `(This is expected: initial gateway generated config, now restarting with channels injected)` | Confirmation that the restart is intentional |
| `Gateway failed to start: another gateway instance is already listening` | Normal: brief overlap while the old gateway shuts down. The entrypoint retries automatically. Appears in ~60% of startups. |
| `First attempt did not confirm, retrying in 10s...` | Bootstrap is retrying — MCP servers were slow to respond. Will try once more. |
| `WARNING: Agent bootstrap did not confirm after 2 attempts.` | Non-fatal: tools will load on first user message instead of being pre-warmed. Adds ~30s latency to first interaction only. |

## Verification After Startup

Once the container is running, verify with:

```bash
# 1. Container is healthy
docker ps | grep openclaw-agents
# Should show "Up Xm (healthy)"

# 2. Bootstrap succeeded
docker logs openclaw-agents 2>&1 | grep "bootstrap succeeded"

# 3. MCP servers are loaded (from inside the container)
docker exec openclaw-agents openclaw status

# 4. DM each agent in Slack to confirm responsiveness
```

## Timing

| Phase | Duration |
|-------|----------|
| Secret fetch + token generation | 5–10s |
| Inner entrypoint + gateway config | 60–120s |
| Channel injection + doctor fix | 5s |
| Workspace file injection | 2s |
| Gateway restart | 3–5s |
| Slack socket-mode connection | 10s |
| Agent bootstrap (2 attempts max) | 30–120s per attempt |
| **Total** | **~2–5 minutes** |





## Clean Startup Expectations (v1.3.77+)

A healthy startup should produce **zero ERRORs and zero WARNINGs** in `docker logs`. The expected output is:

```
Secrets fetched and validated as JSON.
Validating Slack tokens...
Token validation complete.
GitHub App token generated (expires: ...)
Handoff HMAC key derived and validated.
Waiting for gateway config...
Gateway config found, injecting Slack channels...
  Added Slack account: scout
  Added Slack account: trak
  Added Slack account: kit
  Added Slack account: scribe
  Added Slack account: probe
  Set tools.sessions.visibility = all (cross-agent handoffs)
Injected 5 Slack accounts + bindings
Setting up logrotate cron for log file rotation...
Logrotate cron installed.
Restarting gateway to apply injected Slack channel config...
Normalizing gateway config...
  Config normalized OK.
gh CLI authenticated with GitHub App token
gh wrapper installed at /usr/local/bin/gh (delegates to /usr/bin/gh.real)
Injecting workspace files into agent workspaces...
  [5 agents]: IDENTITY.md updated, KNOWLEDGE.md copied
Injecting security configs into agent workspaces...
  [5 agents]: security configs injected
Injecting proactive capability configs into agent workspaces...
  [5 agents]: proactive configs injected
Populating main workspace for memory indexing...
Memory index updated.
Starting gateway with injected channel config...
Gateway is running (PID ...).
GitHub token refresh loop started in background.
Bootstrapping agents (warming MCP tools)...
  Bootstrap attempt 1/2...
Agent bootstrap succeeded — MCP tools confirmed warm.
OpenClaw gateway is live. Config: sessions.visibility=all, gateway.mode=local
```

**If you see any ERROR or WARNING lines**, something is wrong — check the troubleshooting guide.

### Pre-doctor config fixes (applied automatically)

These prevent known doctor warnings from appearing:

| Fix | What it prevents |
|-----|-----------------|
| `mkdir -p agents/main/sessions` | "CRITICAL: Session store dir missing" |
| `gateway.mode local` | "gateway.mode is unset" + bootstrap duplicate gateway error |
| `memorySearch.enabled false` | "Memory search enabled but no embedding provider" |
| Channels injected without top-level `enabled` key | "Moved channels.slack single-account top-level values" |
| Doctor output redirected to `/tmp/doctor-output.log` | Noisy box-drawing output in container logs |

## Workspace File Copy

During startup, the entrypoint copies agent workspace files from bind mounts to persistent volumes:

| File | Copy Behavior | Why |
|------|---------------|-----|
| `IDENTITY.md` | Always overwritten | Deploy may update instructions, handoff routing, sibling lists |
| `KNOWLEDGE.md` | Seeded only if missing | Preserves agent memory across restarts |
| `BOOTSTRAP.md` | Seeded only if missing | Preserves bootstrap state |

**Source:** `/tmp/agents/{name}/workspace/` (bind-mounted from `/opt/openclaw/agents/{name}/workspace/` on host)

**Destination:** `/home/openclaw/.openclaw/.openclaw/workspace-{name}/` (persistent volume from `/opt/openclaw-persist/workspace-{name}/`)

If IDENTITY.md changes from a deploy aren't taking effect:
1. Verify the host file is updated: `cat /opt/openclaw/agents/{agent}/workspace/IDENTITY.md | head -5`
2. Restart the container: `docker restart openclaw-agents`
3. Verify the persistent copy: `docker exec openclaw-agents head -5 /home/openclaw/.openclaw/.openclaw/workspace-{agent}/IDENTITY.md`

## Troubleshooting

If the container is not healthy after 5 minutes:

1. Check `docker logs openclaw-agents --tail 100` for FATAL errors
2. Common issues: expired AWS credentials, revoked Slack tokens, disk full
3. See [Troubleshooting Guide](../playbooks/troubleshoot.md) for detailed diagnostics

## See Also

- [Restart Procedures](restart.md) — How to restart safely
- [Troubleshooting Guide](../playbooks/troubleshoot.md) — Diagnostic procedures
- [Architecture](../architecture.md) — System design overview
