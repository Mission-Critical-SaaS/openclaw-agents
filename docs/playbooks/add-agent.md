# Adding a New Agent

## Overview

To add a new agent to the OpenClaw gateway, you need to:
1. Create a Slack app for the agent
2. Add the agent configuration to the gateway config
3. Create the agent workspace (identity + skills)
4. Store the tokens in Secrets Manager
5. Deploy

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

Edit config/openclaw.json.tpl and add the new agent configuration.

### 3. Create Agent Workspace

Create agents/newagent/workspace directory with identity files.

### 4. Store Tokens in Secrets Manager

Update AWS Secrets Manager with new bot and app tokens for the new agent.

### 5. Update .env.example

Add the new token placeholders to .env.example.

### 6. Update Entrypoint

If the entrypoint script explicitly lists environment variables, add the new ones.

### 7. Deploy

git add and commit the changes, push to repository, then on EC2:
cd /opt/openclaw
git pull
docker-compose build --no-cache
docker-compose down && docker-compose up -d

### 8. Verify

In Slack #leads, mention the new agent and test health check.
