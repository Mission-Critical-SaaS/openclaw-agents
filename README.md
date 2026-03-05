# OpenClaw Agents - LMNTL Multi-Agent Platform

Production deployment of three AI agents (Scout, Trak, Kit) on AWS, connected to Slack via OpenClaw gateway.

## Architecture

EC2 t3.medium instance (i-0c6a99a3e95cd52d6) in AWS account 122015479852 running Docker container with OpenClaw gateway. Three agents connected via Slack Socket Mode to the #leads channel.

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

## Quick Start

### Prerequisites
- AWS CLI configured with access to account 122015479852
- Docker and Docker Compose
- Node.js 18+

### Local Development
```
cp .env.example .env
docker-compose up
```

### Production Deployment
See docs/playbooks/deploy.md for full deployment instructions.

## Project Structure

docs/                       Documentation
  playbooks/              Operational playbooks
    deploy.md            Deployment and updates
    troubleshoot.md      Troubleshooting guide
    add-agent.md         Adding a new agent
    aws-access.md        AWS account access
  runbooks/               Emergency procedures
    restart.md           Service restart

config/                  OpenClaw gateway config
docker/                  Docker build files
agents/                  Agent workspace files
scripts/                 Automation scripts
test/                    Tests

## AWS Resources

All resources in LMNTL Agent Automation (122015479852), us-east-1:

| Resource | ID |
|----------|-----|
| EC2 Instance | i-0c6a99a3e95cd52d6 |
| Security Group | sg-0660a2727735097e6 |
| Key Pair | openclaw-key |
| Secret | openclaw/agents |
| IAM Role | openclaw-ec2-role |

## Related Documentation

- Deployment Playbook: docs/playbooks/deploy.md
- Troubleshooting Guide: docs/playbooks/troubleshoot.md
- AWS Access Guide: docs/playbooks/aws-access.md
- Adding a New Agent: docs/playbooks/add-agent.md
- Restart Procedures: docs/runbooks/restart.md
