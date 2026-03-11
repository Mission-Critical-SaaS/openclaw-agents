# Software Development Lifecycle (SDLC) Playbook

## Purpose

Standard process for all changes to the OpenClaw agent platform — code, config, infrastructure, and documentation. Every change follows this lifecycle regardless of size.

## Overview

```
Plan → Develop → Test → Deploy (CI/CD) → Verify → Document
```

## 1. Plan

### For bug fixes
- Reproduce the issue (check docker logs, Slack behavior)
- Identify root cause and affected files
- Determine blast radius: does the fix touch agents, entrypoints, config, or infrastructure?

### For features/enhancements
- Define the change scope and success criteria
- Identify which components are affected (see Component Map below)
- Check for downstream impacts on tests and docs

### Component Map

| Component | Files | Restart Required |
|-----------|-------|-----------------|
| Agent identity | `agents/*/workspace/IDENTITY.md` | Yes (container) |
| Agent config | `config/openclaw.json.tpl` | Yes (container) |
| Secrets/env | AWS Secrets Manager, `entrypoint.sh` | Yes (container) |
| MCP servers | `docker/entrypoint.sh` | Yes (container) |
| Docker image | `docker/Dockerfile` | Yes (rebuild + container) |
| CI/CD pipeline | `.github/workflows/deploy.yml` | No (runs on push) |
| CDK infrastructure | `lib/openclaw-agents-stack.ts` | CDK deploy required |
| Deploy tooling | `deploy.sh`, `scripts/` | No |
| Docs/playbooks | `docs/**` | No |
| MCP server config | `/root/.mcporter/mcporter.json` (generated) | Ephemeral — regenerated on restart |
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
| 1 — Unit | Code logic in isolation | Per commit | `npx jest test/entrypoint.test.ts test/openclaw-agents.test.ts` |
| 2 — Docker build | Image builds without errors | Before deploy | `docker build docker/` |
| 3 — Container startup | Entrypoint runs, services ready | After image rebuild | `docker-compose up`, check logs |
| 4 — Agent DM test | DM each agent and verify tool access | After MCP or container restart | Send specific tool-testing messages via Slack DM |
| 5 — Channel threading | @mention in channel → ack + answer in-thread, no leaked messages | After streaming/config change | @mention agent in channel, verify thread behavior |

### What to test per change type

| Change Type | Test Tiers | Notes |
|-------------|-----------|-------|
| Agent code | 1, 2, 3, 4, 5 | Rebuild image, restart container, test via Slack DMs |
| Config change | 2, 3, 4 | No rebuild needed, just restart container |
| MCP server fix (runtime) | 2, 4, 5 | Rebuild image, restart container, verify in DMs |
| CDK infrastructure | 1 | `npx jest test/openclaw-agents.test.ts` |
| Deploy tooling | 1, 2 | No runtime test needed |


### PR CI Gate (Automated)

Every pull request and push to `main` triggers the CI workflow (`.github/workflows/ci.yml`) which runs all unit tests. PRs cannot merge with failing tests. This is separate from the deploy pipeline which only triggers on version tags.

### CI/CD Test Gate

The GitHub Actions pipeline runs unit tests (Tier 1) before every deploy. If tests fail, the deploy is blocked — no broken code reaches production.

## 4. Deploy

### All deployments go through CI/CD

```bash
# Tag and push — the pipeline handles the rest
git tag v1.x.x && git push origin v1.x.x
```

The GitHub Actions pipeline:
1. Runs tests (must pass before deploy proceeds)
2. Deploys via SSM to the EC2 instance
3. Verifies container health and Slack connections
4. Notifies on failure

See [deploy.md](deploy.md) for full deployment details.

### Deployment Decision Tree

1. **Does the change touch Docker image?**
   - YES → Rebuild happens automatically during deploy (docker-compose build --no-cache)
   - NO → Skip rebuild

2. **Does the change touch agent code, config, or entrypoint?**
   - YES → Container restart happens during deploy
   - NO → Skip restart

3. **Is this a CDK infrastructure change?**
   - YES → Run `npx cdk deploy` separately (see deploy.md)
   - NO → Standard CI/CD deploy

## 5. Verify

### Post-Deployment Checklist

- [ ] Container running: `docker ps | grep openclaw-agents`
- [ ] Entrypoint clean: `docker logs openclaw-agents 2>&1 | grep -i error` (should be empty)
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

- Architecture: `docs/architecture.md`
- Procedures: `docs/playbooks/`
- Troubleshooting: `docs/playbooks/troubleshoot.md`, `docs/playbooks/mcp-troubleshooting.md`
- Runbooks: `docs/runbooks/`
- This playbook: `docs/playbooks/sdlc.md`

## 7. Lessons Learned

### groupPolicy Misconfiguration (Session 1)
- **Symptom**: All three agents responded in DMs but completely ignored @mentions in channels. No errors in logs.
- **Root cause**: `groupPolicy` was set to `"allowlist"` with an empty `allowChannels` list in the outer entrypoint. This silently drops all channel messages.
- **Fix**: Changed `groupPolicy` to `"open"` in `/opt/openclaw/entrypoint.sh` (host file, persists across restarts).
- **Prevention**: Always verify groupPolicy setting after deployment. Use `openclaw config get` to check, or inspect the generated config at `/root/.openclaw/openclaw.json`.

### npx Cache Corruption (Session 2)
- **Symptom**: Zendesk MCP server showing `MCP error -32000: Connection closed`. `openclaw status` shows zendesk as "offline".
- **Root cause**: Corrupted npx cache at `/root/.npm/_npx/`. Running `npx -y zd-mcp-server --help` directly revealed `Cannot find module 'ajv'` error.
- **Fix**: Deleted corrupted cache directory: `rm -rf /root/.npm/_npx/<hash>`. Then restarted container so agents pick up the now-working server.
- **Prevention**: When an MCP server goes offline, always check the npx cache first by running the npx command directly with `--help`.

### Agent Session Tool Caching (Session 2)
- **Symptom**: `openclaw status` shows all 3 servers healthy, but Scout reports "No Zendesk MCP server is configured" and only sees 1 server (jira).
- **Root cause**: Agent sessions discover and cache available tools at startup. Fixing an MCP server mid-session doesn't update the agent's tool list.
- **Fix**: `docker restart openclaw-agents` — forces fresh agent sessions that re-discover all tools.
- **Prevention**: After ANY MCP server fix, always restart the container. Don't assume agents will pick up changes dynamically.

### docker exec vs Agent Environment (Session 2)
- **Symptom**: `docker exec` diagnostic commands show 3 servers, but the agent process only sees 1.
- **Root cause**: docker exec creates a new shell with different environment from the agent's running process. The agent may have started before all MCP servers were ready.
- **Prevention**: Don't trust docker exec results as proof of what the agent can see. Always test via DM to the actual agent.

### SSM GetCommandInvocation IAM Permissions (Session 4)
- **Symptom**: GitHub Actions deploy timed out polling for SSM command completion. The SSM command itself had completed successfully.
- **Root cause**: `ssm:GetCommandInvocation` does NOT support resource-level permissions — it requires `Resource: "*"`. When scoped to instance/document ARNs, it returns AccessDenied silently, and the poll loop's error handling caught this as "Pending".
- **Fix**: Split the IAM policy into two statements — SendCommand (scoped to instance) and GetCommandInvocation (wildcard). Updated both the live IAM policy and the CDK stack.
- **Prevention**: Always check AWS documentation for API actions that don't support resource-level permissions before scoping IAM policies.


### Streaming Value Rejection (Session 7)
- **Symptom**: Agents posted intermediate streaming updates as top-level channel messages instead of in-thread. After setting `streaming: 'none'`, container logs showed `Normalized channels.slack.accounts.scout.streaming (none) → (partial)` for all 3 agents.
- **Root cause**: `'none'` is not a valid OpenClaw streaming value. Valid values are: `true`, `false`, `"off"`, `"partial"`, `"block"`, `"progress"`. OpenClaw silently rejects invalid values and normalizes them to `"partial"`.
- **Fix**: Changed `'streaming': 'none'` to `'streaming': 'off'` in the outer entrypoint.
- **Prevention**: After any streaming config change, check container logs for "Normalized" warnings: `docker logs openclaw-agents 2>&1 | grep Normalized`. Zero matches = config accepted.

## Emergency Procedures

### Agent not responding
1. Check logs: `docker logs openclaw-agents 2>&1 | tail -50`
2. If error found, fix and redeploy via CI/CD
3. For urgent recovery: use SSM to restart the container directly
4. Wait 90 seconds, test again via DM

### MCP server offline
1. Check server health via SSM: `docker exec openclaw-agents openclaw status`
2. If offline, check npx cache: `rm -rf /root/.npm/_npx/*`
3. Restart container: `docker restart openclaw-agents`
4. Verify via DM: Send tool test message

## Access Reference

| Resource | Location | Accessed Via |
|----------|----------|--------------|
| Container logs | Docker daemon | `docker logs openclaw-agents` |
| Agent config | Container at `/root/.openclaw/openclaw.json` | `docker exec openclaw-agents cat /root/.openclaw/openclaw.json` |
| MCP server status | Container | `docker exec openclaw-agents openclaw status` |
| Source code | Host at `/opt/openclaw/` | GitHub: LMNTL-AI/openclaw-agents |
| EC2 instance | i-0acd7169101e93388 | AWS SSM Session Manager |

## Known Failure Modes Quick Reference

| Symptom | Likely Cause | Quick Fix | See |
|---------|-------------|-----------|-----|
| Agent ignores @mentions in channels but works in DMs | groupPolicy = "allowlist" with empty list | Set groupPolicy to "open" in outer entrypoint | Lessons Learned §1 |
| MCP server offline, `Connection closed` | Corrupted npx cache | `rm -rf /root/.npm/_npx/*` + restart | mcp-troubleshooting.md |
| `openclaw status` healthy but agent can't see tools | Agent session cached stale tool list | `docker restart openclaw-agents` | Lessons Learned §3 |
| Agent responds with wrong/outdated identity | Container using cached IDENTITY.md | Full restart: `docker-compose down && up -d` | restart.md |
| Agent posts streaming updates as top-level messages | `streaming` config rejected (using invalid value) | Use `'off'` not `'none'` + check for "Normalized" in logs | Lessons Learned §6 |
| GHA deploy times out polling SSM | GetCommandInvocation IAM scoped to resource | Set `Resource: "*"` for GetCommandInvocation | Lessons Learned §5 |
