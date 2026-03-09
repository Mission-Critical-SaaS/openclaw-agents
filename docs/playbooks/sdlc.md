# Software Development Lifecycle (SDLC) Playbook

## Purpose

Standard process for all changes to the OpenClaw agent platform — code, config, infrastructure, and documentation. Every change follows this lifecycle regardless of size.

## Overview

```
Plan → Develop → Test → Deploy → Verify → Document
```

## 1. Plan

### For bug fixes
- Reproduce the issue (check docker logs, watchdog logs, Slack behavior)
- Identify root cause and affected files
- Determine blast radius: does the fix touch agents, entrypoints, config, or infrastructure?

### For features/enhancements
- Define the change scope and success criteria
- Identify which components are affected (see Component Map below)
- Check for downstream impacts on watchdog probes, E2E tests, and docs

### Component Map

| Component | Files | Restart Required |
|-----------|-------|-----------------|
| Agent identity | `agents/*/workspace/IDENTITY.md` | Yes (container) |
| Agent config | `config/openclaw.json.tpl`, `config-src/` | Yes (container) |
| Secrets/env | AWS Secrets Manager, `entrypoint.sh` | Yes (container) |
| MCP servers | `docker/entrypoint.sh` | Yes (container) |
| Docker image | `docker/Dockerfile` | Yes (rebuild + container) |
| Deploy tooling | `deploy.sh`, `scripts/` | No |
| Watchdog | `scripts/watchdog.sh` | Yes (watchdog service) |
| Watchdog tests | `scripts/test-watchdog-e2e.sh` | No |
| Docs/playbooks | `docs/**` | No |
| mcporter config | `/root/.mcporter/mcporter.json` (generated) | Ephemeral — regenerated on restart |
| npx package cache | `/root/.npm/_npx/` | Ephemeral — can be manually cleared |

## 2. Develop

### Branch Strategy
- Work on feature/bugfix branches
- Commit to main only after review and passing all test tiers
- Branch naming: `feature/description` or `bugfix/description`

### Commit Conventions
- Keep commits small and atomic
- Use descriptive messages: `[TYPE] Description (ticket-id)`
- Types: FEAT, FIX, REFACTOR, DOCS, TEST

### Code Standards
- Follow existing patterns in agents/, scripts/, and config/
- Test locally in docker before pushing
- Update docs/ if behavior changes

## 3. Test

### Test Tiers

| Tier | What | When | How |
|------|------|------|-----|
| 1 — Unit | Code logic in isolation | Per commit | Jest, pytest, or equivalent |
| 2 — Docker build | Image builds without errors | Before deploy | `docker build docker/` |
| 3 — Container startup | Entrypoint runs, services ready | After image rebuild | `docker-compose up`, check logs |
| 4 — Watchdog E2E | Watchdog detects failures and recovers | Daily or per infra change | `./scripts/test-watchdog-e2e.sh` |
| 5 — Agent functionality | Agents respond to commands/workflows | After config or agent code change | Manual: send commands via Slack |
| 6 — Agent DM test | DM each agent and verify tool access | After MCP or container restart | Send specific tool-testing messages via Slack DM |

### What to test per change type

| Change Type | Test Tiers | Notes |
|-------------|-----------|-------|
| Agent code | 1, 2, 3, 5 | Rebuild image, restart container, test via Slack |
| Config change | 2, 3, 5 | No rebuild needed, just restart container |
| MCP server fix (runtime) | 2, 5, 6 | Rebuild image, restart container, verify in DMs |
| Watchdog script | 1, 4 | Run E2E test, verify recovery behavior |
| Deploy tooling | 1, 2 | No runtime test needed |

## 4. Deploy

### Deployment Decision Tree

1. **Does the change touch Docker image?**
   - YES → Rebuild: `docker build -t openclaw:latest docker/`, then restart container
   - NO → Skip rebuild, go to step 2

2. **Does the change touch agent code, config, or entrypoint?**
   - YES → Restart container: `docker-compose down && docker-compose up -d`
   - NO → Skip restart, go to step 3

3. **Does the change touch watchdog or scripts/?**
   - YES → Reload watchdog: `systemctl restart openclaw-watchdog`
   - NO → Verify (step 5)

### Standard Deployment

```bash
# 1. Build if needed
docker build -t openclaw:latest docker/

# 2. Restart container
docker-compose down
docker-compose up -d

# 3. Restart watchdog if needed
systemctl restart openclaw-watchdog

# 4. Verify (see section 5)
```

## 5. Verify

### Post-Deployment Checklist

- [ ] Container running: `docker ps | grep openclaw-agents`
- [ ] Entrypoint clean: `docker logs openclaw-agents 2>&1 | grep -i error` (should be empty)
- [ ] Watchdog running: `systemctl status openclaw-watchdog`
- [ ] Agent responds to DM: Send test message to agent, confirm response
- [ ] All expected tools available: Test each MCP server tool in a DM
- [ ] No regressions: Test workflows that were working before
- [ ] Logs clean: `docker logs openclaw-agents 2>&1 | tail -20` (no ERROR or WARN spam)

## 6. Document

### When to update docs

- Any change to agent behavior, config, or deployment steps
- New playbooks or troubleshooting guides
- Changes to restart procedures or monitoring

### Where

- Agent docs: `docs/agents/`
- Procedures: `docs/procedures/`
- Troubleshooting: `docs/troubleshooting/`
- This playbook: `docs/sdlc.md`

## 7. Lessons Learned

### groupPolicy Misconfiguration (Session 1)
- **Symptom**: All three agents responded in DMs but completely ignored @mentions in channels. No errors in logs.
- **Root cause**: `groupPolicy` was set to `"allowlist"` with an empty `allowChannels` list in the outer entrypoint. This silently drops all channel messages.
- **Fix**: Changed `groupPolicy` to `"open"` in `/opt/openclaw/entrypoint.sh` (host file, persists across restarts).
- **Prevention**: Always verify groupPolicy setting after deployment. Use `openclaw config get` to check, or inspect the generated config at `/root/.openclaw/openclaw.json`.

### npx Cache Corruption (Session 2)
- **Symptom**: Zendesk MCP server showing `MCP error -32000: Connection closed`. mcporter list shows zendesk as "offline".
- **Root cause**: Corrupted npx cache at `/root/.npm/_npx/`. Running `npx -y zd-mcp-server --help` directly revealed `Cannot find module 'ajv'` error.
- **Fix**: Deleted corrupted cache directory: `rm -rf /root/.npm/_npx/<hash>`. Then restarted container so agents pick up the now-working server.
- **Prevention**: When an MCP server goes offline, always check the npx cache first by running the npx command directly with `--help`.

### Agent Session Tool Caching (Session 2)
- **Symptom**: mcporter shows all 3 servers healthy, but Scout reports "No Zendesk MCP server is configured" and only sees 1 server (jira).
- **Root cause**: Agent sessions discover and cache available tools at startup. Fixing an MCP server mid-session doesn't update the agent's tool list.
- **Fix**: `docker restart openclaw-agents` — forces fresh agent sessions that re-discover all tools.
- **Prevention**: After ANY MCP server fix, always restart the container. Don't assume agents will pick up changes dynamically.

### docker exec vs Agent Environment (Session 2)
- **Symptom**: `docker exec openclaw-agents bash -c "HOME=/root mcporter list"` shows 3 servers, but the agent process only sees 1.
- **Root cause**: docker exec creates a new shell with different environment from the agent's running process. The agent may have started before all MCP servers were ready.
- **Prevention**: Don't trust docker exec results as proof of what the agent can see. Always test via DM to the actual agent.

## Emergency Procedures

### Agent not responding
1. Check logs: `docker logs openclaw-agents 2>&1 | tail -50`
2. If error found, fix and restart: `docker-compose down && docker-compose up -d`
3. If no error, restart watchdog: `systemctl restart openclaw-watchdog`
4. Wait 30 seconds, test again

### MCP server offline
1. Check server health: `docker exec openclaw-agents mcporter list`
2. If offline, check npx cache: `rm -rf /root/.npm/_npx/*`
3. Restart container: `docker restart openclaw-agents`
4. Verify via DM: Send tool test message

### Watchdog not recovering agents
1. Check watchdog status: `systemctl status openclaw-watchdog`
2. Check watchdog logs: `journalctl -u openclaw-watchdog -n 50`
3. If stuck, restart: `systemctl restart openclaw-watchdog`

## Access Reference

| Resource | Location | Accessed Via |
|----------|----------|--------------|
| Container logs | Docker daemon | `docker logs openclaw-agents` |
| Agent config | Container at `/root/.openclaw/openclaw.json` | `docker exec openclaw-agents cat /root/.openclaw/openclaw.json` |
| Watchdog logs | Systemd journal | `journalctl -u openclaw-watchdog` |
| MCP servers | Available in container | `docker exec openclaw-agents mcporter list` |
| Source code | Host at `/opt/openclaw/` | Direct file access |

## Known Failure Modes Quick Reference

| Symptom | Likely Cause | Quick Fix | See |
|---------|-------------|-----------|-----|
| Agent ignores @mentions in channels but works in DMs | groupPolicy = "allowlist" with empty list | Set groupPolicy to "open" in outer entrypoint | Lessons Learned §1 |
| MCP server offline, `Connection closed` | Corrupted npx cache | `rm -rf /root/.npm/_npx/*` + restart | mcp-troubleshooting.md |
| mcporter healthy but agent can't see tools | Agent session cached stale tool list | `docker restart openclaw-agents` | Lessons Learned §3 |
| Agent responds with wrong/outdated identity | Container using cached IDENTITY.md | Full restart: `docker-compose down && up -d` | restart.md |
| All agents down, watchdog not recovering | Watchdog service stopped or exhausted | Check `systemctl status openclaw-watchdog` | troubleshoot.md |
