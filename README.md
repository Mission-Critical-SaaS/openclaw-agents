# OpenClaw Agents — LMNTL Multi-Agent Platform

Production deployment of three AI agents (Scout, Trak, Kit) on AWS, connected to Slack via the OpenClaw gateway with native MCP tool integrations (Jira, Zendesk, Notion, GitHub).

## Architecture

EC2 t3.xlarge instance in AWS account 122015479852 (us-east-1) running a Docker container with the OpenClaw gateway. Three agents connect via Slack Socket Mode. All deployments go through GitHub Actions CI/CD.

```
┌─────────────────────────────────────────────────────────┐
│  EC2 Instance (i-0acd7169101e93388, t3.xlarge)          │
│                                                         │
│  ┌─────────────────────────────────────────────────┐    │
│  │  Docker: openclaw-agents                        │    │
│  │  ┌─────────┐  ┌─────────┐  ┌─────────┐        │    │
│  │  │  Scout  │  │  Trak   │  │   Kit   │        │    │
│  │  │ (sales) │  │ (PM)    │  │  (ops)  │        │    │
│  │  └────┬────┘  └────┬────┘  └────┬────┘        │    │
│  │       └──────┬──────┴──────┬─────┘             │    │
│  │         OpenClaw Gateway (Socket Mode)          │    │
│  │         MCP: Jira · Zendesk · Notion · GitHub   │    │
│  └─────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────┘
         ▲                                   ▲
         │ SSM SendCommand                   │ Slack Socket Mode
    GitHub Actions CI/CD              lmntlai.slack.com
```

For the full system design, see [docs/architecture.md](docs/architecture.md).

### Dual Entrypoint Chain

The container uses a two-stage entrypoint:

1. **Outer entrypoint** (`entrypoint.sh` → mounted as `/app/entrypoint.sh`): Fetches secrets from AWS Secrets Manager, exports env vars, starts the gateway, waits for config, injects Slack channels, restarts the gateway, then bootstraps agents to warm MCP tools.

2. **Inner entrypoint** (`docker/entrypoint.sh` → mounted as `/entrypoint.sh`): Configures MCP servers (Jira, Zendesk, Notion), sets up agent auth profiles, and starts the gateway.

### Agent Bootstrap

After the gateway starts, the outer entrypoint sends a lightweight agent turn (`openclaw agent --agent main`) to force-load all MCP servers. This eliminates cold-start latency — by the time a user sends their first message, all tools are already warm.

### MCP Integrations

| Server | Package | Purpose |
|--------|---------|---------|
| Jira | @aashari/mcp-server-atlassian-jira | Issue tracking, project boards |
| Zendesk | zd-mcp-server | Ticket management, customer support |
| Notion | @notionhq/notion-mcp-server | Knowledge base, documentation |
| GitHub | @anthropic/mcp-server-github | Repository access, PRs, issues |

MCP tools are loaded by the OpenClaw gateway on demand. Agents access them natively through the gateway's MCP bridge — not via CLI.

## Agents

| Agent | Role | Slack App ID | Bot User ID |
|-------|------|-------------|-------------|
| Scout | Sales and lead qualification | A0AJ5DNRR6K | U0AJLT30KMG |
| Trak | Project management and tracking | A0AJLU847U2 | U0AJEGUSELB |
| Kit | Operations and internal tooling | A0AKF8212BA | U0AKF614URE |

Allowed users: David Allison (U082DEF37PC), Michael Wong (U081YTU8JCX), Debbie Sabin (U0ADABVCVH8).

## Deployment (CI/CD Only)

All deployments go through GitHub Actions. No manual deploys to EC2.

```
git tag v1.x.x && git push origin v1.x.x
```

The pipeline:
1. **Tests** — `npx jest` must pass before deploy proceeds
2. **Deploy via SSM** — sends `deploy.sh <tag>` to the instance
3. **Verify** — checks docker logs for bootstrap success and Slack connections
4. **Notify** — posts to Slack #leads on failure

See [docs/playbooks/deploy.md](docs/playbooks/deploy.md) and [docs/playbooks/sdlc.md](docs/playbooks/sdlc.md).

### Infrastructure as Code (CDK)

The full AWS infrastructure is defined in CDK (`lib/openclaw-agents-stack.ts`): VPC, security group, EC2 instance, IAM roles (instance + GitHub OIDC deploy), CloudWatch alarms, and SNS alerting. See `bin/openclaw-agents.ts` for stack configuration.

## Secrets

All secrets stored in AWS Secrets Manager under key `openclaw/agents` in us-east-1. See [docs/secrets.md](docs/secrets.md).

| Secret | Purpose |
|--------|---------|
| ANTHROPIC_API_KEY | Claude API access |
| SLACK_BOT_TOKEN_{SCOUT,TRAK,KIT} | Slack bot tokens per agent |
| SLACK_APP_TOKEN_{SCOUT,TRAK,KIT} | Slack app tokens per agent |
| ATLASSIAN_SITE_NAME / USER_EMAIL / API_TOKEN | Jira authentication |
| ZENDESK_SUBDOMAIN / EMAIL / API_TOKEN | Zendesk authentication |
| NOTION_API_TOKEN | Notion integration token |
| GITHUB_TOKEN | GitHub access token |
| SLACK_ALLOW_FROM | Allowed Slack user IDs (JSON array) |

## Project Structure

```
openclaw-agents/
├── .github/workflows/deploy.yml    # CI/CD pipeline (tag → test → deploy → verify)
├── deploy.sh                       # On-instance deployment script (called by SSM)
├── entrypoint.sh                   # Outer entrypoint (secrets, channel injection, bootstrap)
├── docker-compose.yml              # Docker Compose configuration
├── docker/
│   ├── Dockerfile                  # Container image definition
│   ├── entrypoint.sh              # Inner entrypoint (MCP config, auth, gateway start)
│   └── configure_channels.py      # Slack channel injection helper
├── agents/
│   ├── scout/workspace/           # Scout IDENTITY.md + KNOWLEDGE.md
│   ├── trak/workspace/            # Trak IDENTITY.md + KNOWLEDGE.md
│   └── kit/workspace/             # Kit IDENTITY.md + KNOWLEDGE.md
├── config/openclaw.json.tpl       # Gateway config template (envsubst at runtime)
├── bin/openclaw-agents.ts         # CDK app entry point
├── lib/openclaw-agents-stack.ts   # CDK infrastructure stack
├── scripts/
│   ├── bootstrap.sh               # Initial EC2 setup (Ubuntu 22.04)
│   ├── healthcheck.sh             # Basic health check
│   ├── rollback.sh                # Rollback helper
│   ├── setup-secrets.sh           # Secrets provisioning
│   └── create-slack-apps.sh       # Slack app creation guide
├── test/
│   ├── entrypoint.test.ts         # Entrypoint unit tests (52 assertions)
│   ├── openclaw-agents.test.ts    # CDK infrastructure tests (22 assertions)
│   └── e2e/e2e.test.ts           # End-to-end integration tests
├── docs/                          # Architecture, playbooks, runbooks
└── package.json                   # Dependencies (aws-cdk, jest, ts-jest)
```

## AWS Resources

All resources in LMNTL Agent Automation (122015479852), us-east-1:

| Resource | ID / Name |
|----------|-----------|
| EC2 Instance | i-0acd7169101e93388 (t3.xlarge, 50GB gp3) |
| Secrets Manager | openclaw/agents |
| IAM Instance Role | openclaw-ec2-profile |
| IAM Deploy Role | openclaw-github-deploy (GitHub OIDC) |
| Security Group | sg-0660a2727735097e6 |

## Documentation Index

| Document | Purpose |
|----------|---------|
| [architecture.md](docs/architecture.md) | System design, container lifecycle, MCP tools |
| [secrets.md](docs/secrets.md) | All secrets, rotation procedures |
| [sdlc.md](docs/playbooks/sdlc.md) | Full development lifecycle for all changes |
| [deploy.md](docs/playbooks/deploy.md) | Deployment procedures and CI/CD pipeline |
| [aws-access.md](docs/playbooks/aws-access.md) | AWS account structure and CLI access |
| [troubleshoot.md](docs/playbooks/troubleshoot.md) | General troubleshooting |
| [mcp-troubleshooting.md](docs/playbooks/mcp-troubleshooting.md) | MCP server issues |
| [add-agent.md](docs/playbooks/add-agent.md) | Adding a new agent to the platform |
| [restart.md](docs/runbooks/restart.md) | Restart procedures |

## Quick Troubleshooting

### Container not starting
```bash
docker-compose logs --tail 50
docker exec openclaw-agents cat /data/logs/openclaw.log
```

### MCP servers offline
```bash
docker exec openclaw-agents openclaw status
```
See [MCP Troubleshooting](docs/playbooks/mcp-troubleshooting.md) for full diagnostics.

### Slack agents not connecting
```bash
docker logs --since 10m openclaw-agents 2>&1 | grep "socket mode"
```

For more, see the [Troubleshooting Guide](docs/playbooks/troubleshoot.md).
