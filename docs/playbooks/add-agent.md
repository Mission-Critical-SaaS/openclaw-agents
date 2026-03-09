# Adding a New Agent

## Overview

To add a new agent to the OpenClaw gateway, you need to:
1. Create a Slack app for the agent
2. Add the agent configuration to the gateway config
3. Create the agent workspace (identity + skills)
4. Store the tokens in Secrets Manager
5. Update the watchdog to expect the new agent
6. Deploy and verify

## Step-by-Step

### 1. Create a Slack App

1. Go to api.slack.com/apps
2. Click Create New App
3. Name it and select the LMNTL workspace
4. Under Socket Mode, enable it and create an app-level token
5. Under OAuth & Permissions, add bot token scopes:
   - app_mentions:read
   - chat:write
   - channels:history
   - groups:history
   - im:history
   - mpim:history
   - users:read
6. Install the app to the workspace
7. Copy the Bot User OAuth Token and App-Level Token
8. Invite the bot to #leads

### 2. Update Gateway Config

Edit config/openclaw.json.tpl and add the new agent configuration, following the same pattern as Scout/Trak/Kit.

### 3. Create Agent Workspace

```bash
mkdir -p agents/newagent/workspace
```

Create `agents/newagent/workspace/IDENTITY.md` with the agent's role, personality, and MCP tool access.

### 4. Store Tokens in Secrets Manager

Update AWS Secrets Manager (`openclaw/agents`) with:
- `SLACK_BOT_TOKEN_NEWAGENT` — the bot OAuth token (xoxb-...)
- `SLACK_APP_TOKEN_NEWAGENT` — the app-level token (xapp-...)

```bash
# See docs/secrets.md for the update procedure
```

### 5. Update Entrypoint

If the outer entrypoint (`entrypoint.sh`) explicitly lists environment variables for each agent, add the new agent's tokens.

### 6. Update the Watchdog

The watchdog has an `EXPECTED_AGENTS` array that defines which agents must have started their providers. Add the new agent:

Edit `scripts/watchdog.sh` and find:
```bash
EXPECTED_AGENTS=("scout" "trak" "kit")
```

Change to:
```bash
EXPECTED_AGENTS=("scout" "trak" "kit" "newagent")
```

Also update the Slack connection count check in `probe_slack_connections` — it currently expects 3 connections. Change `3` to `4` (or however many agents you now have).

After editing, restart the watchdog:
```bash
sudo systemctl restart openclaw-watchdog
```

### 7. Update Documentation

Following the [SDLC playbook](sdlc.md#6-document):
- **README.md** — Add the new agent to the Agents table
- **architecture.md** — Update the Watchdog health probes section (agent count)
- **secrets.md** — Add the new token entries

### 8. Deploy

```bash
git add -A && git commit -m "feat: add newagent to platform"
git push origin main
```

On EC2:
```bash
cd /opt/openclaw
git pull
docker-compose build --no-cache
docker-compose down && docker-compose up -d
```

### 9. Verify

```bash
# Wait ~90s for startup, then:
docker exec openclaw-agents openclaw status
# Expected: All agents connected, new agent shows up

/opt/openclaw/scripts/watchdog.sh --test-probes
# Expected: All 5 PASS (including the new agent in probe 5)

# In Slack #leads, @mention the new agent and verify it responds
```
