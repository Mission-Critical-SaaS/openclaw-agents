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

## 2. Develop

### Branch strategy

All work happens on `main`. The `production` branch tracks what is deployed on EC2. After verifying a change on `main`, push to `production`:

```bash
git push origin main:production
```

For larger features, use a feature branch and merge to `main` before deploying.

### Commit conventions

Follow conventional commit format:

```
feat: add new MCP server integration
fix: correct SIGPIPE in watchdog probe
docs: update architecture with watchdog section
chore: update .gitignore for logs directory
refactor: simplify entrypoint secret loading
test: add E2E test for crash loop detection
```

Prefix map:
| Prefix | Use for |
|--------|---------|
| `feat` | New functionality |
| `fix` | Bug fixes |
| `docs` | Documentation only |
| `chore` | Build, config, tooling |
| `refactor` | Code restructuring (no behavior change) |
| `test` | Adding or updating tests |

### Code standards

- **Bash scripts**: Use `set -euo pipefail`. Log functions must write to stderr (`>&2`) when their output could be captured by `$()`. Use `(cmd || true) | grep` to prevent SIGPIPE failures under pipefail.
- **Entrypoints**: Keep idempotent — safe to re-run on restart without side effects.
- **Watchdog probes**: Must return 0 for pass, non-zero for fail. Never write to stdout inside `run_health_checks` (captured as bitmask).

## 3. Test

### Test tiers

| Tier | What | When | How |
|------|------|------|-----|
| 1 — Local review | Read the diff, check for obvious issues | Every change | `git diff` |
| 2 — Watchdog probes | Run all 5 health probes | After container restarts | `/opt/openclaw/scripts/watchdog.sh --test-probes` |
| 3 — Watchdog E2E | Full 21-assertion test suite | After watchdog changes | `bash /opt/openclaw/scripts/test-watchdog-e2e.sh` |
| 4 — Slack smoke test | @mention each agent in #leads | After agent/config changes | Manual |
| 5 — MCP integration | Verify Jira/Zendesk/Notion tool calls | After MCP or entrypoint changes | `bash /opt/openclaw/scripts/test-integrations.sh` |

### Running the E2E test suite

```bash
# On EC2:
bash /opt/openclaw/scripts/test-watchdog-e2e.sh
```

This runs 7 tests with 21 assertions covering probe validation, failure detection, auto-recovery, escalation logic, state management, and full recovery cycles. All 21 must pass before merging watchdog changes.

### What to test per change type

| Change | Required tests |
|--------|---------------|
| Agent identity/config | Tiers 1, 2, 4 |
| Entrypoint or Dockerfile | Tiers 1, 2, 4, 5 |
| Watchdog script | Tiers 1, 2, 3 |
| MCP servers | Tiers 1, 2, 5 |
| Docs only | Tier 1 (review for accuracy) |
| Secrets rotation | Tiers 2, 4, 5 |

## 4. Deploy

### Deployment decision tree

```
Change type?
├─ Docs only → commit, push, done (no restart needed)
├─ Scripts (non-watchdog) → commit, push, done
├─ Watchdog script → commit, push, systemctl restart openclaw-watchdog
├─ Agent config/identity → commit, push, docker-compose restart
├─ Entrypoint or Dockerfile → commit, push, docker-compose build && down && up -d
└─ Secrets → update in AWS Secrets Manager, then docker-compose down && up -d
```

### Standard deployment

```bash
cd /opt/openclaw

# 1. Pull changes
git fetch origin && git pull origin main

# 2. Rebuild if needed (Dockerfile or entrypoint changes)
docker-compose build --no-cache

# 3. Restart
docker-compose down && docker-compose up -d

# 4. Wait for startup
sleep 90

# 5. Verify (see next section)
```

### Push to production branch

After verifying on main:
```bash
git push origin main:production
```

### Watchdog-specific deployment

After changing `scripts/watchdog.sh`:
```bash
cd /opt/openclaw
git pull origin main
sudo systemctl restart openclaw-watchdog
systemctl is-active openclaw-watchdog
```

## 5. Verify

### Post-deployment verification checklist

```bash
# 1. Container health
docker ps  # Status: Up, not restarting

# 2. OpenClaw status
docker exec openclaw-agents openclaw status
# Expected: Slack ON/OK, accounts 3/3

# 3. Watchdog probes
/opt/openclaw/scripts/watchdog.sh --test-probes
# Expected: All 5 PASS, bitmask 0

# 4. Slack connectivity
docker logs --since 10m openclaw-agents 2>&1 | grep "socket mode connected"
# Expected: 3 connections (scout, trak, kit)

# 5. Watchdog service
systemctl is-active openclaw-watchdog  # active
```

### For agent/config changes, also test:
```bash
# @mention each agent in #leads and verify response
# Check MCP tools are available if relevant
```

## 6. Document

### When to update docs

| Change | Docs to update |
|--------|---------------|
| New agent added | README.md, architecture.md, add-agent.md, watchdog `EXPECTED_AGENTS` |
| New MCP server | README.md, architecture.md, mcp-troubleshooting.md |
| Config format change | Relevant playbooks, secrets.md |
| New watchdog probe | architecture.md (Watchdog section), test-watchdog-e2e.sh |
| New infra (EC2, security group, etc.) | aws-access.md, architecture.md, README.md |
| New script | README.md (Project Structure), relevant playbooks |

### Documentation lives in

```
docs/
├── architecture.md              # System design and component overview
├── secrets.md                   # Secret rotation and management
├── playbooks/
│   ├── add-agent.md             # How to add a new agent
│   ├── aws-access.md            # AWS account structure and access
│   ├── deploy.md                # Deployment procedures
│   ├── mcp-troubleshooting.md   # MCP server issues
│   ├── sdlc.md                  # ← THIS FILE
│   └── troubleshoot.md          # General troubleshooting
└── runbooks/
    └── restart.md               # Restart procedures
```

## Emergency Procedures

### Agent completely down, watchdog not recovering

```bash
# 1. Check watchdog status
systemctl status openclaw-watchdog
/opt/openclaw/scripts/watchdog.sh --status

# 2. If watchdog is running but stuck, manual nuclear option:
cd /opt/openclaw
docker-compose down
docker system prune -f
docker-compose build --no-cache
docker-compose up -d

# 3. Wait 90s, verify
docker exec openclaw-agents openclaw status
/opt/openclaw/scripts/watchdog.sh --test-probes
```

### EC2 instance unreachable

```bash
# From admin workstation with AWS CLI:
aws ec2 describe-instance-status --instance-ids i-0c6a99a3e95cd52d6 --profile openclaw
aws ec2 start-instances --instance-ids i-0c6a99a3e95cd52d6 --profile openclaw
aws ec2 wait instance-running --instance-ids i-0c6a99a3e95cd52d6 --profile openclaw

# Once running, watchdog and container auto-start via systemd
```

### Rollback

```bash
./deploy.sh --rollback         # Automated rollback
# Or manual:
git log --oneline -10           # Find good commit
git checkout <commit-hash>
docker-compose build --no-cache && docker-compose down && docker-compose up -d
```

## Access Reference

| What | How |
|------|-----|
| EC2 via SSM | `aws ssm start-session --target i-0c6a99a3e95cd52d6 --profile openclaw` |
| EC2 via SSH | `ssh ec2-user@3.237.5.79` |
| AWS Console | Sign in as david-admin to 517311508324, switch role to 122015479852 |
| Container logs | `docker logs openclaw-agents --tail 100` |
| Watchdog logs | `tail -50 /opt/openclaw/logs/watchdog.log` |
| Secrets | `aws secretsmanager get-secret-value --secret-id openclaw/agents --profile openclaw` |
| GitHub | `https://github.com/LMNTL-AI/openclaw-agents` |
