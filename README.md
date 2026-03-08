# OpenClaw Agents - LMNTL Multi-Agent Platform

Production deployment of three AI agents (Scout, Trak, Kit) on AWS, connected to Slack via OpenClaw gateway with MCP tool integrations (Jira, Zendesk, Notion).

## Architecture

EC2 t3.medium instance (i-0c6a99a3e95cd52d6) in AWS account 122015479852 running Docker container with OpenClaw gateway. Three agents connected via Slack Socket Mode to the #leads channel.

### Dual Entrypoint Chain

The container uses a two-stage entrypoint:

1. **Outer entrypoint** (`entrypoint.sh` → mounted as `/app/entrypoint.sh`): Fetches secrets from AWS Secrets Manager (`openclaw/agents`), exports env vars, starts the gateway, waits for config, injects Slack channels, then restarts.

2. **Inner entrypoint** (`docker/entrypoint-fixed.sh` → mounted as `/entrypoint-fixed.sh`): Configures mcporter MCP servers (Jira, Zendesk, Notion), sets up agent auth profiles, registers API key, and starts the gateway.

### MCP Integrations (via mcporter)

| Server | Package | Tools | Status |
|--------|---------|-------|--------|
| Jira | @aashari/mcp-server-atlassian-jira | 5 | Healthy |
| Zendesk | zd-mcp-server | 8 | Healthy |
| Notion | @notionhq/notion-mcp-server | 22 | Healthy |

## Agents

| Agent | Role | Slack App ID | Bot User ID |
|-------|------|-------------|-------------|
| Scout | Sales and lead qualification | A0AJ5DNRR6K | U0AJLT30KMG |
| Trak | Project management and tracking | A0AJLU847U2 | U0AJEGUSELB |
| Kit | Operations and internal tooling | A0AKF8212BA | U0AKF614URE |

All agents are restricted to the #leads channel (C089JBLCFLL) and only respond to:
- David Allison (U082DEF37PC)
- Michael Wong (U081YTU8JCX)
- Debbie Sabin (U0ADABVCVH8)

## Deployment

### Quick Deploy

```bash
# SSH to EC2 or use SSM, then:
cd /opt/openclaw
./deploy.sh              # Deploy latest from main
./deploy.sh v1.2.0       # Deploy specific tag
./deploy.sh production   # Deploy production branch
```

### Manual Deploy

```bash
cd /opt/openclaw
git fetch origin && git pull origin main
docker-compose down && docker-compose up -d
# Wait ~60s for startup, then verify:
docker exec openclaw-agents bash -c '
  while IFS= read -r -d "" line; do export "$line"; done < /proc/1/environ
  mcporter list
'
```

### Prerequisites
- AWS CLI configured with access to account 122015479852
- Docker and Docker Compose (v1)
- Node.js 18+

## Secrets

All secrets stored in AWS Secrets Manager under key `openclaw/agents` in us-east-1.

| Secret | Purpose |
|--------|---------|
| ANTHROPIC_API_KEY | Claude API access |
| SLACK_BOT_TOKEN_{SCOUT,TRAK,KIT} | Slack bot tokens per agent |
| SLACK_APP_TOKEN_{SCOUT,TRAK,KIT} | Slack app tokens per agent |
| ATLASSIAN_SITE_NAME | Jira site (lmntl) |
| ATLASSIAN_USER_EMAIL | Jira user email |
| ATLASSIAN_API_TOKEN | Jira/Atlassian API token |
| ZENDESK_SUBDOMAIN | Zendesk subdomain (minute7) |
| ZENDESK_EMAIL | Zendesk user email |
| ZENDESK_API_TOKEN | Zendesk API token |
| NOTION_API_TOKEN | Notion integration token |
| GITHUB_TOKEN | GitHub access token |
| SLACK_ALLOW_FROM | Allowed Slack user IDs (JSON array) |

**Note:** The outer entrypoint derives additional env vars:
- `JIRA_BASE_URL` from `ATLASSIAN_SITE_NAME`
- `JIRA_USER_EMAIL` from `ATLASSIAN_USER_EMAIL`
- `JIRA_API_TOKEN` from `ATLASSIAN_API_TOKEN`
- `ZENDESK_TOKEN` from `ZENDESK_API_TOKEN`

## Project Structure

```
entrypoint.sh              Outer entrypoint (secrets + channel injection)
deploy.sh                  Repeatable deployment script
docker-compose.yml         Docker Compose configuration
docker/
  Dockerfile               Container image definition
  entrypoint-fixed.sh      Inner entrypoint (mcporter + gateway)
config/                    OpenClaw gateway config (generated)
config-src/                Source config templates
agents/                    Agent workspace files
  scout/workspace/
  trak/workspace/
  kit/workspace/
docs/
  playbooks/
    deploy.md              Deployment playbook
README.md                  This file
```

## AWS Resources

All resources in LMNTL Agent Automation (122015479852), us-east-1:

| Resource | ID |
|----------|-----|
| EC2 Instance | i-0c6a99a3e95cd52d6 |
| Secrets Manager | openclaw/agents |
| IAM Role | OrganizationAccountAccessRole |

## Troubleshooting

### Container not starting
```bash
docker-compose logs --tail 50
docker exec openclaw-agents cat /data/logs/openclaw.log
```

### MCP servers offline
```bash
# Check env vars are set
docker exec openclaw-agents bash -c 'cat /proc/1/environ | tr "\0" "\n" | grep -E "JIRA_|ZENDESK_|NOTION_"'
# Check mcporter config
docker exec openclaw-agents cat /root/.mcporter/mcporter.json | python3 -m json.tool
# Restart container
cd /opt/openclaw && docker-compose down && docker-compose up -d
```

### Slack agents not connecting
Check that all 6 Slack tokens (BOT + APP for each agent) are present in secrets.
