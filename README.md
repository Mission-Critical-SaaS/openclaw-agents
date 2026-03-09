# OpenClaw Agents — LMNTL Multi-Agent Platform

Production deployment of three AI agents (Scout, Trak, Kit) on AWS, connected to Slack via the OpenClaw gateway with MCP tool integrations (Jira, Zendesk, Notion). Includes an independent watchdog service for automated health monitoring and self-healing.

## Architecture

EC2 t3.medium instance in AWS account 122015479852 (us-east-1) running a Docker container with the OpenClaw gateway. Three agents connect via Slack Socket Mode to the #leads channel. A separate systemd watchdog service monitors the container and auto-repairs failures.

```
┌─────────────────────────────────────────────────────────┐
│  EC2 Instance (i-0c6a99a3e95cd52d6)                     │
│                                                         │
│  ┌─────────────────────────────────────────────────┐    │
│  │  Docker: openclaw-agents                        │    │
│  │  ┌─────────┐  ┌─────────┐  ┌─────────┐        │    │
│  │  │  Scout  │  │  Trak   │  │   Kit   │        │    │
│  │  │ (sales) │  │ (PM)    │  │  (ops)  │        │    │
│  │  └────┬────┘  └────┬────┘  └────┬────┘        │    │
│  │       └──────┬──────┴──────┬─────┘             │    │
│  │         OpenClaw Gateway (Socket Mode)          │    │
│  │         MCP: Jira · Zendesk · Notion            │    │
│  └─────────────────────────────────────────────────┘    │
│                                                         │
│  systemd: openclaw-watchdog.service                     │
│  → 5 health probes every 30s                            │
│  → 3-tier auto-repair (soft → hard → rebuild)           │
│  → Alerts via Slack + SNS                               │
└─────────────────────────────────────────────────────────┘
```

For the full system design, see [docs/architecture.md](docs/architecture.md).

### Dual Entrypoint Chain

The container uses a two-stage entrypoint:

1. **Outer entrypoint** (`entrypoint.sh` → mounted as `/app/entrypoint.sh`): Fetches secrets from AWS Secrets Manager (`openclaw/agents`), exports env vars, starts the gateway, waits for config, injects Slack channels, then restarts.

2. **Inner entrypoint** (`docker/entrypoint.sh` → mounted as `/entrypoint.sh`): Configures mcporter MCP servers (Jira, Zendesk, Notion), sets up agent auth profiles, registers API key, and starts the gateway.

### MCP Integrations (via mcporter)

| Server | Package | Tools | Purpose |
|--------|---------|-------|---------|
| Jira | @aashari/mcp-server-atlassian-jira | 5 | Issue tracking, project boards |
| Zendesk | zd-mcp-server | 8 | Ticket management, customer support |
| Notion | @notionhq/notion-mcp-server | 22 | Knowledge base, documentation |

## Agents

| Agent | Role | Slack App ID | Bot User ID |
|-------|------|-------------|-------------|
| Scout | Sales and lead qualification | A0AJ5DNRR6K | U0AJLT30KMG |
| Trak | Project management and tracking | A0AJLU847U2 | U0AJEGUSELB |
| Kit | Operations and internal tooling | A0AKF8212BA | U0AKF614URE |

All agents are restricted to the **#leads** channel (C089JBLCFLL) and only respond to:
- David Allison (U082DEF37PC)
- Michael Wong (U081YTU8JCX)
- Debbie Sabin (U0ADABVCVH8)

## Watchdog

An independent systemd service that runs **outside** the Docker container, monitoring the health of the OpenClaw gateway and auto-repairing failures without human intervention.

**Health probes** (every 30 seconds):

| Probe | What it checks |
|-------|---------------|
| Container running | `docker inspect` reports a running state |
| OpenClaw status | `openclaw status` returns OK |
| Slack connections | 3 of 3 socket mode connections active in recent logs |
| No crash loop | Container restart count < 5 |
| Agent providers | All 3 agents (Scout, Trak, Kit) started their providers |

**Auto-repair** escalates through three tiers:

| Tier | Action | Trigger |
|------|--------|---------|
| 1 — Soft | `docker restart` | 2 consecutive probe failures |
| 2 — Hard | `docker-compose down && up -d` | Soft restart failed, or container stopped |
| 3 — Rebuild | `docker-compose build --no-cache && up -d` | Hard restart failed within 10 minutes |

Tiers reset after 10 minutes of stability. Two consecutive failures are required before any repair action (prevents false positives). Alerts go to Slack (#leads) and AWS SNS on every repair, recovery, and exhaustion event.

```bash
# Check probe status
/opt/openclaw/scripts/watchdog.sh --test-probes

# View state + recent activity
/opt/openclaw/scripts/watchdog.sh --status

# Service control
systemctl status openclaw-watchdog
journalctl -u openclaw-watchdog --since "1 hour ago"
```

For details, see the [Watchdog section in architecture.md](docs/architecture.md#watchdog).

## Deployment

### Quick Deploy

```bash
# On EC2 (via SSM or SSH):
cd /opt/openclaw
./deploy.sh              # Deploy latest from main
./deploy.sh v1.2.0       # Deploy specific tag
./deploy.sh --rollback   # Rollback to previous
./deploy.sh --dry-run    # Preview changes
```

### Manual Deploy

```bash
cd /opt/openclaw
git fetch origin && git pull origin main
docker-compose down && docker-compose up -d
# Wait ~60-90s for startup, then verify:
docker exec openclaw-agents openclaw status
/opt/openclaw/scripts/watchdog.sh --test-probes
```

### Post-Deployment Verification

```bash
docker ps                                          # Container up
docker exec openclaw-agents openclaw status        # Gateway healthy
/opt/openclaw/scripts/watchdog.sh --test-probes    # All 5 probes pass
systemctl is-active openclaw-watchdog              # Watchdog running
```

For the full deployment playbook, see [docs/playbooks/deploy.md](docs/playbooks/deploy.md).

### Prerequisites

- AWS CLI configured with access to account 122015479852
- Docker and Docker Compose (v1)
- Node.js 18+

## Secrets

All secrets stored in AWS Secrets Manager under key `openclaw/agents` in us-east-1. See [docs/secrets.md](docs/secrets.md) for the full list, rotation procedures, and credential mapping.

| Secret | Purpose |
|--------|---------|
| ANTHROPIC_API_KEY | Claude API access |
| SLACK_BOT_TOKEN_{SCOUT,TRAK,KIT} | Slack bot tokens per agent |
| SLACK_APP_TOKEN_{SCOUT,TRAK,KIT} | Slack app tokens per agent |
| ATLASSIAN_SITE_NAME | Jira site (lmntl) |
| ATLASSIAN_USER_EMAIL / API_TOKEN | Jira authentication |
| ZENDESK_SUBDOMAIN / EMAIL / API_TOKEN | Zendesk authentication |
| NOTION_API_TOKEN | Notion integration token |
| GITHUB_TOKEN | GitHub access token |
| SLACK_ALLOW_FROM | Allowed Slack user IDs (JSON array) |

## Project Structure

```
openclaw-agents/
├── README.md                        # This file
├── docker-compose.yml               # Docker Compose configuration
├── deploy.sh                        # Repeatable deployment script
├── entrypoint.sh                    # Outer entrypoint (secrets + channel injection)
├── .gitignore
│
├── docker/
│   ├── Dockerfile                   # Container image definition
│   └── entrypoint.sh               # Inner entrypoint (mcporter + gateway)
│
├── agents/                          # Agent workspace files
│   ├── scout/workspace/IDENTITY.md
│   ├── trak/workspace/IDENTITY.md
│   └── kit/workspace/IDENTITY.md
│
├── config/                          # OpenClaw gateway config (generated at runtime)
├── config-src/                      # Source config templates
│
├── scripts/
│   ├── watchdog.sh                  # Watchdog daemon (runs via systemd)
│   ├── test-watchdog-e2e.sh         # Watchdog E2E test suite (21 assertions)
│   ├── deploy.sh                    # Alternate deploy script
│   ├── rollback.sh                  # Rollback helper
│   ├── healthcheck.sh               # Basic health check
│   ├── bootstrap.sh                 # Initial EC2 setup
│   ├── setup-secrets.sh             # Secrets provisioning
│   ├── create-slack-apps.sh         # Slack app creation
│   └── test-integrations.sh         # Integration test suite
│
├── docs/
│   ├── architecture.md              # System design, container lifecycle, watchdog
│   ├── secrets.md                   # Secret rotation and management
│   ├── playbooks/
│   │   ├── sdlc.md                  # Full SDLC process for all changes
│   │   ├── deploy.md                # Deployment procedures
│   │   ├── aws-access.md            # AWS account structure and access
│   │   ├── troubleshoot.md          # General troubleshooting guide
│   │   ├── add-agent.md             # Adding a new agent
│   │   └── mcp-troubleshooting.md   # MCP server issues
│   └── runbooks/
│       └── restart.md               # Restart procedures + watchdog guidance
│
├── logs/                            # Runtime logs (gitignored)
└── .github/
    └── workflows/
        └── deploy.yml               # CI/CD pipeline
```

## AWS Resources

All resources in LMNTL Agent Automation (122015479852), us-east-1:

| Resource | ID / Name |
|----------|-----------|
| EC2 Instance | i-0c6a99a3e95cd52d6 (t3.medium) |
| Secrets Manager | openclaw/agents |
| IAM Role (cross-account) | OrganizationAccountAccessRole |
| SNS Topic (alerts) | openclaw-alerts |
| Management Account | 517311508324 (LMNTL LLC) |

For account access details, see [docs/playbooks/aws-access.md](docs/playbooks/aws-access.md).

## Documentation Index

| Document | Purpose |
|----------|---------|
| [architecture.md](docs/architecture.md) | System design, container lifecycle, network, watchdog |
| [secrets.md](docs/secrets.md) | All secrets, rotation procedures |
| [sdlc.md](docs/playbooks/sdlc.md) | Full development lifecycle for all changes |
| [deploy.md](docs/playbooks/deploy.md) | Deployment procedures and fresh setup |
| [aws-access.md](docs/playbooks/aws-access.md) | AWS account structure and CLI access |
| [troubleshoot.md](docs/playbooks/troubleshoot.md) | General troubleshooting |
| [mcp-troubleshooting.md](docs/playbooks/mcp-troubleshooting.md) | MCP server issues |
| [add-agent.md](docs/playbooks/add-agent.md) | Adding a new agent to the platform |
| [restart.md](docs/runbooks/restart.md) | Restart procedures and watchdog guidance |

## Quick Troubleshooting

### Container not starting
```bash
docker-compose logs --tail 50
docker exec openclaw-agents cat /data/logs/openclaw.log
```

### MCP servers offline
```bash
docker exec openclaw-agents bash -c '
    while IFS= read -r -d "" line; do export "$line"; done < /proc/1/environ
    openclaw status
'
```
See [MCP Troubleshooting](docs/playbooks/mcp-troubleshooting.md) for full diagnostics.

### Slack agents not connecting
```bash
docker logs --since 10m openclaw-agents 2>&1 | grep "socket mode"
```

### Watchdog issues
```bash
systemctl status openclaw-watchdog
/opt/openclaw/scripts/watchdog.sh --status
journalctl -u openclaw-watchdog --since "1 hour ago"
```

For more, see the [Troubleshooting Guide](docs/playbooks/troubleshoot.md).
