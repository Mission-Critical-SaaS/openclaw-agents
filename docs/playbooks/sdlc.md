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
`

### Push to production branch

After verifying on main:
```bash
git push origin main:production
```

### Deployment decision tree

```
Change type?
├─ Docs only → commit, push, done
├─ Scripts (non-watchdog) → commit, push, done
├─ Watchdog script → commit, push, systemctl restart openclaw-watchdog
├─ Agent config → commit, push, docker-compose restart
├─ Entrypoint/Dockerfile → commit, push, docker-compose build && down && up -d
└─ Secrets → update in AWS Secrets Manager, then docker-compose down && up -d
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
| New agent added | README.md, architecture.md, add-agent.md |
| New MCP server | README.md, architecture.md, mcp-troubleshooting.md |
| Config format change | Relevant playbooks, secrets.md |
| New watchdog probe | architecture.md (Watchdog section) |
| New infra (EC2, security group, etc.) | aws-access.md, architecture.md |
| New script | README.md (if user-facing) |

### Documentation lives in

```
docs/
├── architecture.md          # System design and component overview
├── secrets.md               # Secret rotation and management
├── playbooks/
│   ├── add-agent.md         # How to add a new agent
│   ├── aws-access.md        # AWS account structure and access
│   ├── deploy.md            # Deployment procedures
│   ├── mcp-troubleshooting.md  # MCP server issues
│   ├── sdlc.md              # ← THIS FILE
│   └── troubleshoot.md      # General troubleshooting
└── runbooks/
    └── restart.md           # Restart procedures
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
