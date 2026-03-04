# OpenClaw Agents

Multi-agent [OpenClaw](https://openclaw.ai) deployment for Slack, powered by AWS CDK.

Three AI agents, each with a distinct personality and toolset, deployed as Slack bots in the LMNTL workspace:

| Agent | Role | Tools | Slack Channels |
|-------|------|-------|----------------|
| **Scout** 🔍 | Customer Support | Stripe, GitHub, Knowledge Base | #support, DMs |
| **Trak** 📋 | Project Management | Jira, GitHub | #engineering, #jira, DMs |
| **Kit** ⚡ | Engineering | GitHub, Jira | #dev, #code-review, DMs |

## Architecture

```
Slack (Socket Mode WebSocket)
  ├── Scout bot app  ──→  OpenClaw Agent: scout  ──→  Claude + Stripe/GitHub MCP
  ├── Trak bot app   ──→  OpenClaw Agent: trak   ──→  Claude + Jira/GitHub MCP
  └── Kit bot app    ──→  OpenClaw Agent: kit    ──→  Claude + GitHub/Jira MCP
```

Runs on a single EC2 instance (t3.small). No inbound ports — Slack Socket Mode is outbound-only. Managed via SSM Session Manager.

## Quick Start

### 1. Create the Slack Apps

```bash
bash scripts/create-slack-apps.sh
```

Follow the guide to create 3 Slack apps from manifests, then collect the bot and app tokens.

### 2. Configure Secrets

```bash
cp .env.example .env
# Edit .env with your tokens
```

### 3. Store Secrets in AWS

```bash
bash scripts/setup-secrets.sh
```

### 4. Deploy Infrastructure

```bash
npm install
npx cdk bootstrap   # first time only
npx cdk deploy
```

### 5. Deploy Agent Config

```bash
bash scripts/deploy.sh <instance-id>
```

## Local Development

Run locally with Docker Compose:

```bash
cp .env.example .env
# Fill in tokens
docker-compose up
```

## Monitoring

CloudWatch alarms are configured for CPU and instance health. Logs stream to `/openclaw/agents`.

```bash
# View logs
aws logs tail /openclaw/agents --follow

# Connect to instance
aws ssm start-session --target <instance-id>
```

## Project Structure

```
├── lib/                    # CDK stack definition
├── bin/                    # CDK app entry point
├── docker/                 # Dockerfile + entrypoint
├── config/                 # OpenClaw config template
├── agents/                 # Per-agent workspace files
│   ├── scout/workspace/    # Scout identity + skills
│   ├── trak/workspace/     # Trak identity + skills
│   └── kit/workspace/      # Kit identity + skills
├── scripts/                # Deploy, setup, and helper scripts
├── docker-compose.yml      # Local dev / production compose
└── .env.example            # Token template
```
