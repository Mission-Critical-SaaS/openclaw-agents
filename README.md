# OpenClaw Agents — LMNTL Multi-Agent Platform

Production deployment of six AI agents (Scout, Trak, Kit, Scribe, Probe, Beacon) on AWS, connected to Slack via the OpenClaw gateway with native MCP tool integrations (Jira, Zendesk, Notion, Zoho, GitHub).

## Architecture

EC2 t3.xlarge instance in AWS account 122015479852 (us-east-1) running a Docker container with the OpenClaw gateway. Six agents connect via Slack Socket Mode. All deployments go through GitHub Actions CI/CD.

```
┌───────────────────────────────────────────────────────────────────┐
│  EC2 Instance (i-0acd7169101e93388, t3.xlarge)                    │
│                                                                   │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │  Docker: openclaw-agents                                      │    │
│  │  ┌─────────┐ ┌─────────┐ ┌────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐  │    │
│  │  │  Scout  │ │  Trak   │ │  Kit  │ │ Scribe  │ │  Probe  │ │ Beacon  │  │    │
│  │  │ (sales) │ │ (PM)    │ │ (ops) │ │ (docs)  │ │ (QA)    │ │(hourly) │  │    │
│  │  └────┬────┘ └────┬────┘ └───┬────┘ └────┬────┘ └────┬────┘ └────┬────┘  │    │
│  │       └─────┬─────┴────┬─────┴─────┬─────┴────┘              │    │
│  │              OpenClaw Gateway (Socket Mode)                    │    │
│  │         MCP: Jira · Zendesk · Notion · Zoho · GitHub          │    │
│  └─────────────────────────────────────────────────────────────┘    │
└───────────────────────────────────────────────────────────────────┘
         ▲                                              ▲
         │ SSM SendCommand                              │ Slack Socket Mode
    GitHub Actions CI/CD                         lmntlai.slack.com
```

For the full system design, see [docs/architecture.md](docs/architecture.md).

### Dual Entrypoint Chain

The container uses a two-stage entrypoint:

1. **Outer entrypoint** (`entrypoint.sh` → mounted as `/app/entrypoint.sh`): Fetches secrets from AWS Secrets Manager, exports env vars, starts the gateway, waits for config, injects Slack channels, restarts the gateway, then bootstraps agents to warm MCP tools.

2. **Inner entrypoint** (`docker/entrypoint.sh` → mounted as `/entrypoint.sh`): Configures MCP servers (Jira, Zendesk, Notion), sets up agent auth profiles, and starts the gateway.

### Agent Bootstrap

After the gateway starts, the outer entrypoint sends a lightweight agent turn (`openclaw agent --agent main`) to force-load all MCP servers. This eliminates cold-start latency — by the time a user sends their first message, all tools are already warm.

### Slack Streaming

Streaming is **disabled** (`streaming: 'off'`, `nativeStreaming: false`). This is intentional — OpenClaw's partial streaming mode posts intermediate updates as top-level channel messages rather than in-thread, which causes leaked messages in channels. The value must be `'off'` (not `'none'` — OpenClaw rejects `'none'` and silently normalizes it back to `'partial'`). Agents instead follow a structured threading pattern: ack → (optional progress) → final answer, all in-thread.

### MCP Integrations

| Server | Package | Purpose |
|--------|---------|---------|
| Jira | @aashari/mcp-server-atlassian-jira | Issue tracking, project boards |
| Zendesk | zd-mcp-server | Ticket management, customer support |
| Notion | @notionhq/notion-mcp-server | Knowledge base, documentation |
| GitHub | @anthropic/mcp-server-github | Repository access, PRs, issues |
| Zoho CRM | zoho-crm-mcp-server | CRM contacts, leads, deals |

MCP tools are loaded by the OpenClaw gateway on demand. Agents access them natively through the gateway's MCP bridge — not via CLI.

## Agents

| Agent | Role | Slack App ID | Bot User ID |
|-------|------|-------------|-------------|
| Scout | Customer support and lead qualification | A0AJ5DNRR6K | U0AJLT30KMG |
| Trak | Project management and tracking | A0AJLU847U2 | U0AJEGUSELB |
| Kit | Engineering operations and internal tooling | A0AKF8212BA | U0AKF614URE |
| Scribe | Knowledge management and documentation | A0ALRDJ9Y2K | U0AM170694Z |
| Probe | Quality assurance and testing | A0ALLS1ER8F | U0ALRTLF752 |
| Beacon | HourTimesheet internal support | PENDING | U0AMPKFH5D4 |

See [docs/agent-capability-matrix.md](docs/agent-capability-matrix.md) for detailed tool access per agent.

### Allowed Users

Access is controlled via the `SLACK_ALLOW_FROM` secret (JSON array of Slack user IDs). Current allow list:

| User | Slack ID |
|------|----------|
| David Allison | U082DEF37PC |
| Michael Wong | U081YTU8JCX |
| Debbie Sabin | U0ADABVCVH8 |
| Hao | U05PJJS5XST |
| Luc | U07LD2KVA58 |
| Trinh | U07EW4CD78C |
| Nghia | U08FP393H4J |
| Dai Kong | U084XE4S43G |
| Duc | U08NGTS8Y5B |
| Jonathan De Luca | U08FAE33NE5 |
| Imrane Hajoui | U08A9B8065N |

To update: modify `SLACK_ALLOW_FROM` in AWS Secrets Manager and redeploy.

### Slack Channels

| Channel | ID | Purpose |
|---------|----|---------|
| #leads | C089JBLCFLL | Customer-facing, all agents active |
| #dev | C086N5031LZ | Development discussion |
| #agentic-dev | C0AKWU052CW | Private — agent platform development |

Agents use `groupPolicy: "open"` and `requireMention: true`, meaning they respond in **any** channel when @mentioned (not restricted to specific channels).

## Getting Started

### Prerequisites

- Node.js 22+
- npm
- AWS CLI (for e2e tests and CDK deploys)

### Install and Build

```bash
git clone https://github.com/LMNTL-AI/openclaw-agents.git
cd openclaw-agents
npm ci
npm run build
```

### Environment Setup

Copy the example env file and fill in your values:

```bash
cp .env.example .env
# Edit .env with your actual secrets
```

See [docs/secrets.md](docs/secrets.md) for where to obtain each token.

## Testing

### Running Tests Locally

```bash
# Unit + CDK infrastructure tests (331+ tests, ~4s)
npx jest test/entrypoint.test.ts test/openclaw-agents.test.ts

# End-to-end tests (requires AWS CLI + live credentials)
npx jest test/e2e/e2e.test.ts
```

### Test Suites

| Suite | File | Tests | What It Covers |
|-------|------|-------|----------------|
| Entrypoint | `test/entrypoint.test.ts` | 331 | Outer entrypoint: secret extraction, env var derivation, Slack config, MCP setup, streaming config, channel injection, bootstrap logic, .env.example completeness |
| CDK Infrastructure | `test/openclaw-agents.test.ts` | 22 | AWS resources: VPC, EC2, IAM roles, security groups, CloudWatch alarms, SSM permissions, OIDC federation |
| E2E Integration | `test/e2e/e2e.test.ts` | 6 | Live deployment: secrets reachable, container running, agents responsive via Slack DM (requires AWS credentials) |

### Test Tiers

The SDLC defines five test tiers — see [docs/playbooks/sdlc.md](docs/playbooks/sdlc.md) for the full breakdown. The CI/CD pipeline gates on Tier 1 (unit tests) before every deploy.

## Deployment (CI/CD Only)

All deployments go through GitHub Actions. No manual deploys to EC2.

```bash
git tag v1.x.x && git push origin main --tags
```

The pipeline (`.github/workflows/deploy.yml`):
1. **Tests** — unit + CDK tests must pass before deploy proceeds
2. **Deploy via SSM** — sends `deploy.sh <tag>` to the EC2 instance
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
| SLACK_BOT_TOKEN_{SCOUT,TRAK,KIT,SCRIBE,PROBE,BEACON} | Slack bot tokens per agent |
| SLACK_APP_TOKEN_{SCOUT,TRAK,KIT,SCRIBE,PROBE,BEACON} | Slack app tokens per agent |
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
│   ├── kit/workspace/             # Kit IDENTITY.md + KNOWLEDGE.md
│   ├── scribe/workspace/          # Scribe IDENTITY.md + KNOWLEDGE.md
│   ├── probe/workspace/           # Probe IDENTITY.md + KNOWLEDGE.md
│   └── beacon/workspace/          # Beacon IDENTITY.md + KNOWLEDGE.md
├── config/openclaw.json.tpl       # Gateway config template (envsubst at runtime)
├── bin/openclaw-agents.ts         # CDK app entry point
├── lib/openclaw-agents-stack.ts   # CDK infrastructure stack
├── scripts/
│   ├── bootstrap.sh               # Initial EC2 setup (Ubuntu 22.04)
│   ├── healthcheck.sh             # Basic health check
│   ├── rollback.sh                # Rollback helper
│   ├── setup-secrets.sh           # Secrets provisioning
│   ├── create-slack-apps.sh       # Slack app creation guide
│   ├── github-app-token.sh        # GitHub App installation token generator
│   └── github-token-refresh.sh    # Background GitHub token refresh loop
├── test/
│   ├── entrypoint.test.ts         # Entrypoint unit tests (134 tests)
│   ├── openclaw-agents.test.ts    # CDK infrastructure tests (22 tests)
│   └── e2e/e2e.test.ts           # End-to-end integration tests (6 tests)
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
| [agent-capability-matrix.md](docs/agent-capability-matrix.md) | Agent roles, tool access, testing procedures |
| [secrets.md](docs/secrets.md) | All secrets, rotation procedures |
| [sdlc.md](docs/playbooks/sdlc.md) | Full development lifecycle for all changes |
| [deploy.md](docs/playbooks/deploy.md) | Deployment procedures and CI/CD pipeline |
| [aws-access.md](docs/playbooks/aws-access.md) | AWS account structure and CLI access |
| [troubleshoot.md](docs/playbooks/troubleshoot.md) | General troubleshooting |
| [mcp-troubleshooting.md](docs/playbooks/mcp-troubleshooting.md) | MCP server issues |
| [add-agent.md](docs/playbooks/add-agent.md) | Adding a new agent to the platform |
| [restart.md](docs/runbooks/restart.md) | Restart procedures |
| [startup.md](docs/runbooks/startup.md) | Container startup sequence and expected log messages |

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
