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
- **groupPolicy**: Controls how agents respond in channels
  - `"open"` = agents respond in any channel when @mentioned
  - `"allowlist"` = agents only respond in explicitly listed channels in `allowChannels`
  - **CRITICAL GOTCHA**: Setting `groupPolicy: "allowlist"` with an empty `allowChannels` list silently drops ALL channel messages. Agents will still respond in DMs but will completely ignore channel @mentions with no error in logs.
  - Current setting: `"open"` (set in outer entrypoint)

## Container Lifecycle

```
EC2 boot
  └─> systemd starts docker-compose
       └─> Docker builds image (if needed)
            └─> Outer entrypoint (entrypoint.sh → /app/entrypoint.sh):
                 1. Fetches secrets from AWS Secrets Manager
                 2. Exports env vars (ANTHROPIC_API_KEY, SLACK_*, ATLASSIAN_*, etc.)
                 3. Derives backward-compat vars (JIRA_BASE_URL, JIRA_API_TOKEN, etc.)
                 4. Starts inner entrypoint in background
                 5. Waits for gateway config to appear
                 6. Injects Slack channel IDs via configure_channels.py
                 7. Restarts gateway to pick up channel config
                 └─> Inner entrypoint (docker/entrypoint.sh → /entrypoint.sh):
                      1. Generates mcporter config (Jira, Zendesk, Notion servers)
                      2. Creates agent auth profiles (scout, trak, kit)
                      3. Registers Anthropic API key
                      4. Runs: openclaw gateway run --allow-unconfigured
                      5. OpenClaw connects all three agents to Slack via Socket Mode
```

### Two-Layer Entrypoint Architecture

OpenClaw uses a nested entrypoint pattern to separate host-level concerns from container initialization.

#### Outer Entrypoint (`/opt/openclaw/entrypoint.sh` on host → `/app/entrypoint.sh` in container)

The outer entrypoint runs as soon as the container starts. Its responsibilities:

1. **AWS Secrets Manager**: Fetches the `openclaw/agents` secret bundle and unpacks it
2. **Environment variable export**: Exports all secrets as env vars (ANTHROPIC_API_KEY, SLACK_SCOUT_BOT_TOKEN, SLACK_SCOUT_SIGNING_SECRET, ATLASSIAN_EMAIL, etc.)
3. **Backward-compatibility derivation**: Creates derived vars like JIRA_BASE_URL and JIRA_API_TOKEN from the unpacked secrets
4. **groupPolicy injection**: Injects the channel routing configuration (including `groupPolicy: "open"` and `allowChannels`) into the Slack channel config
5. **Background startup**: Spawns the inner entrypoint in the background and immediately returns control
6. **Channel ID injection**: Waits for the gateway config to be generated, then calls `configure_channels.py` to inject Slack channel IDs
7. **Gateway restart**: Restarts the OpenClaw gateway to pick up the updated channel config

This layer is a host bind mount at `/opt/openclaw/entrypoint.sh`, so changes persist across container restarts.

#### Inner Entrypoint (`/opt/openclaw/docker/entrypoint.sh` on host → `/entrypoint.sh` in container)

The inner entrypoint runs asynchronously while the outer entrypoint is working. Its responsibilities:

1. **mcporter config generation**: Generates `/root/.mcporter/mcporter.json` with Jira, Zendesk, and Notion server endpoints from env vars
2. **Agent auth profiles**: Creates agent-specific auth profiles for Scout, Trak, and Kit (stored in `/root/.mcporter/`)
3. **GitHub CLI auth**: Configures GitHub CLI authentication for agents that need it
4. **Gateway startup**: Runs `openclaw gateway run --allow-unconfigured` to start the gateway process
5. **Socket Mode connection**: OpenClaw automatically connects all three agents to Slack via Socket Mode

This layer is also a host bind mount at `/opt/openclaw/docker/entrypoint.sh`, so edits persist across container restarts.

### Config Persistence Rules

Understanding what persists and what is ephemeral is critical for troubleshooting and making lasting changes.

#### Host Bind Mounts (Persist Across Restarts)

These files and directories are mounted from the host and survive container restarts:

- `/opt/openclaw/entrypoint.sh` — Outer entrypoint script (host source)
- `/opt/openclaw/docker/entrypoint.sh` — Inner entrypoint script (host source)
- `/opt/openclaw/docs/` — Documentation and architecture files
- Agent IDENTITY.md files — Instructions and tool declarations for each agent

Changes to these files take effect on the next container restart.

#### Container-Internal Ephemeral Data (Regenerated on Restart)

These are created and managed inside the container and are LOST when the container restarts:

- `/root/.mcporter/mcporter.json` — mcporter server configuration (regenerated by inner entrypoint)
- `/root/.openclaw/openclaw.json` — OpenClaw gateway configuration (regenerated by gateway process)
- `/root/.npm/_npx/` — npx package cache (rebuilt from scratch on each startup)
- `/root/.openclaw/agents/*/` — Agent session data and runtime state

#### Key Implication: Configuration Persistence

**Changes made via `openclaw config set` are LOST on container restart.** The `openclaw config set` command modifies `/root/.openclaw/openclaw.json`, which is regenerated from scratch on the next restart.

To make persistent changes to gateway or agent configuration:

1. Identify the configuration value in the entrypoint scripts (usually outer or inner)
2. Edit the script on the host (`/opt/openclaw/entrypoint.sh` or `/opt/openclaw/docker/entrypoint.sh`)
3. Restart the container for changes to take effect

This design ensures that the source of truth is always the host entrypoint scripts, not ephemeral container state.

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

## Agent Capability Matrix

Each agent has a different set of tools and primary responsibilities. Tool access is declared in each agent's IDENTITY.md file; the gateway makes all mcporter tools available, and agents self-select based on their identity instructions.

| Agent | Jira (mcporter) | Zendesk (mcporter) | Notion (mcporter) | GitHub (gh CLI) | Primary Role |
|-------|----------------|-------------------|-------------------|-----------------|-------------|
| Scout 🔍 | ✅ Full | ✅ Full | ❌ | ⚠️ Limited (issue search) | Customer Support |
| Trak 📋 | ✅ Full (primary) | ❌ | ❌ | ✅ Full | Project Management |
| Kit ⚡ | ⚠️ Limited | ❌ | ❌ | ✅ Full (primary) | Engineering/Dev |

**Notes:**
- Tool access is defined in each agent's IDENTITY.md, not in gateway config
- The gateway makes all mcporter tools available; agents self-select based on their identity instructions
- Scout and Trak can both access Jira, but Trak treats it as its primary tool for project tracking
- Kit focuses on GitHub but can access Jira for cross-team visibility

## Monitoring

- **Docker logs**: `docker logs openclaw-agents` on the EC2 instance
- **System journal**: `journalctl -u openclaw` for systemd service logs
- **Health check**: Message any agent in #leads and verify response

## Watchdog

A separate systemd service (`openclaw-watchdog.service`) runs outside the Docker container and continuously monitors all three agents. It operates independently so it can detect and repair container-level failures.

### Health Probes (every 30s)

| # | Probe | What it checks |
|---|-------|---------------|
| 1 | Container running | `docker inspect` state |
| 2 | OpenClaw status | `openclaw status` shows OK |
| 3 | Slack connections | 3/3 socket mode connections in logs |
| 4 | No crash loop | Restart count < 5 |
| 5 | Agent providers | All 3 agents (Scout, Trak, Kit) started |

### Repair Tiers

| Tier | Action | When |
|------|--------|------|
| 1 (Soft) | `docker restart` | First 2 failures |
| 2 (Hard) | `docker-compose down/up` | Soft retries exhausted, or container stopped |
| 3 (Rebuild) | `docker-compose build --no-cache && up` | Hard restart failed within 10min |

After the escalation window (10min), the tier resets to soft.

### Alerting

Alerts go to Slack (#leads) and AWS SNS on repair, recovery, and exhaustion events.

### Management Commands

```bash
# Check all probes
/opt/openclaw/scripts/watchdog.sh --test-probes

# View state and recent log
/opt/openclaw/scripts/watchdog.sh --status

# Service control
systemctl status openclaw-watchdog
systemctl restart openclaw-watchdog
journalctl -u openclaw-watchdog --since "1 hour ago"
```

### E2E Test Suite

```bash
bash /opt/openclaw/scripts/test-watchdog-e2e.sh
```

7 tests, 21 assertions covering probe validation, failure detection, auto-recovery, escalation logic, state management, and full recovery cycles.

## Known Issues and Gotchas

### npx Cache Corruption

The npx cache at `/root/.npm/_npx/` can become corrupted, especially after abrupt container shutdowns. Corruption causes MCP servers to go offline mid-session without error messages in the gateway logs. If agents suddenly lose tool access:

1. Check `/root/.npm/_npx/` for stale or incomplete package installations
2. The cache is ephemeral and will be rebuilt on the next container restart
3. See mcp-troubleshooting.md for detailed diagnosis and recovery steps

### Agent Session Tool List Caching

Each agent caches the list of available tools when it starts up. If you fix an MCP server (e.g., restart mcporter), the agent will not see the restored tools until the container restarts. Changes to tool availability require a full container restart, not just a gateway config reload.

### SIGHUP Causes Process Exit, Not Graceful Reload

Sending SIGHUP to the gateway PID (the main OpenClaw process) causes the entire process to exit with code 129, triggering a full container restart via watchdog. This is not a graceful config reload—it's a complete process restart. To apply config changes without SIGHUP:

1. Edit the entrypoint script (outer or inner) on the host
2. Run `docker restart openclaw-agents` to restart the container
3. The watchdog will not interfere with manual restarts

### docker exec Shell Environment Differs From Agent Environment

When you run `docker exec openclaw-agents bash` and test commands like `mcporter list`, you may get different results than what agents see. This is because `docker exec` uses a different shell environment than the agent processes spawned by the entrypoint. Agent processes inherit the full env vars and auth profiles from the entrypoints; interactive shells do not.

To match the agent environment:

```bash
# Source the same env as agents
docker exec openclaw-agents bash -c 'source /app/entrypoint.sh && mcporter list'
```
