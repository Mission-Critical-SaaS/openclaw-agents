# Adding a New Agent

## Overview

To add a new agent to the OpenClaw gateway, you need to:
1. Create a Slack app for the agent
2. Add the agent configuration to the gateway config
3. Create the agent workspace (identity + skills)
4. Store the tokens in Secrets Manager
5. Update documentation
6. Deploy and verify via CI/CD

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

### 6. Update Documentation

Following the [SDLC playbook](sdlc.md#6-document):
- **README.md** — Add the new agent to the Agents table
- **architecture.md** — Update the MCP Tool Access section (agent count)
- **secrets.md** — Add the new token entries
- **agent-capability-matrix.md** — Add the new agent's tool access

### 7. Deploy

Commit all changes, push, tag, and let CI/CD handle it:

```bash
git add -A && git commit -m "feat: add newagent to platform"
git push origin main
git tag v1.x.x && git push origin v1.x.x
```

The GitHub Actions pipeline will run tests, deploy to EC2, and verify.

### 8. Verify

After the CI/CD pipeline completes:

1. Check the GHA run passed: `gh run list -L 1`
2. DM the new agent in Slack and verify it responds
3. Test each MCP tool the agent should have access to
4. Verify existing agents still work (no regressions)
