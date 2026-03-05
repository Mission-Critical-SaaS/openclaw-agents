# Architecture

## Overview

OpenClaw Agents runs as a single Docker container on an EC2 instance. The container runs the `openclaw` npm package in gateway mode, which manages three Slack bot agents (Scout, Trak, Kit) through a unified configuration.

## How OpenClaw Works

OpenClaw is a multi-channel AI agent gateway. It:

1. Reads a JSON config that defines agents, channels, and routing rules
2. Connects to each configured channel (Slack via Socket Mode)
3. Routes incoming messages to the appropriate agent based on matching rules
4. Each agent has its own Anthropic API key, Slack bot token, and workspace (identity + skills)

### Key Configuration Concepts

- **Gateway mode**: `local` — runs everything in a single process
- **Socket Mode**: All Slack connections are outbound WebSocket connections (no inbound ports needed)
- **Agent routing**: Messages are matched to agents by channel account ID
- **allowChannels**: Restricts which Slack channels the bots respond in
- **allowFrom**: Restricts which Slack user IDs can interact with the bots
- **requireMention**: Bots only respond when @mentioned

## Container Lifecycle

```
EC2 boot
  └─> systemd starts docker-compose
       └─> Docker builds image (if needed)
            └─> entrypoint.sh runs:
                 1. Fetches secrets from AWS Secrets Manager
                 2. Exports environment variables
                 3. Substitutes env vars into openclaw.json.tpl → openclaw.json
                 4. Runs: openclaw gateway run --allow-unconfigured
                 5. OpenClaw connects all three agents to Slack via Socket Mode
```

## Network Architecture

The EC2 instance lives in the default VPC with a public IP. Security group `openclaw-sg` controls access:

- **Inbound**: SSH (port 22) for management
- **Outbound**: All traffic allowed (needed for Slack Socket Mode, Anthropic API, etc.)

No load balancer is needed because Socket Mode uses outbound WebSocket connections only.

## Secrets Management

All secrets are stored in AWS Secrets Manager under the key `openclaw/agents`. The entrypoint script fetches them at container startup and exports them as environment variables.

See [secrets.md](secrets.md) for the full list of secrets and how to rotate them.

## Data Flow

```
User @mentions Scout in #leads
  → Slack sends event via Socket Mode WebSocket
    → OpenClaw gateway receives event
      → Routes to Scout agent (matched by channel account)
        → Scout processes with Anthropic Claude API
          → Response sent back via Slack API
            → Appears in #leads channel
```

## Monitoring

- **Docker logs**: `docker logs openclaw-gateway` on the EC2 instance
- **System journal**: `journalctl -u openclaw` for systemd service logs
- **Health check**: Message any agent in #leads and verify response
