# MCP Server Troubleshooting Runbook

## Quick Health Check

```bash
docker exec openclaw-agents bash -c '
    while IFS= read -r -d "" line; do export "$line"; done < /proc/1/environ
    openclaw status
'
```

Expected: 3 servers — jira (5 tools), zendesk (8 tools), notion (22 tools)

## Server Shows OFFLINE

### Check env vars are set
```bash
docker exec openclaw-agents bash -c '
    while IFS= read -r -d "" line; do export "$line"; done < /proc/1/environ
    echo "JIRA_BASE_URL=$JIRA_BASE_URL"
    echo "JIRA_USER_EMAIL=$JIRA_USER_EMAIL"
    echo "JIRA_API_TOKEN len=${#JIRA_API_TOKEN}"
    echo "ZENDESK_SUBDOMAIN=$ZENDESK_SUBDOMAIN"
    echo "ZENDESK_EMAIL=$ZENDESK_EMAIL"
    echo "ZENDESK_TOKEN len=${#ZENDESK_TOKEN}"
    echo "NOTION_API_TOKEN len=${#NOTION_API_TOKEN}"
'
```

### Common fixes

| Server | Symptom | Cause | Fix |
|--------|---------|-------|-----|
| Jira | Empty JIRA_BASE_URL | ATLASSIAN_SITE_NAME missing in secrets | Add to AWS Secrets Manager |
| Jira | Auth error | Bad API token | Regenerate at id.atlassian.com |
| Zendesk | Missing ZENDESK_TOKEN | Wrong env var name | Server expects ZENDESK_TOKEN not ZENDESK_API_TOKEN; check entrypoint.sh mapping |
| Zendesk | Wrong subdomain | Typo in secrets | Fix ZENDESK_SUBDOMAIN in AWS Secrets Manager |
| Zendesk | `Cannot find module 'ajv'` / `MCP error -32000` | Corrupted npx cache | `docker exec openclaw-agents rm -rf /root/.npm/_npx/*` then `docker restart openclaw-agents` |
| Notion | 401 | Bad token or no access | Verify token starts with ntn_ and integration has page access |

## "No MCP servers configured"

mcporter config file is missing or has wrong key.

```bash
# Check config exists and has correct structure
docker exec openclaw-agents cat /root/.mcporter/mcporter.json | python3 -m json.tool
```

The top-level key MUST be `mcpServers` (not `servers`). This is a mcporter 0.7.3 requirement. If wrong, fix in `docker/entrypoint.sh` and redeploy.

## Env Vars Not Available via docker exec

Docker exec does NOT inherit PID 1 environment. Always prefix commands with:

```bash
while IFS= read -r -d "" line; do export "$line"; done < /proc/1/environ
```

Do NOT use the `tr/xargs` pattern — it breaks on values with special characters.

## npx Cache Corruption

When MCP servers fail with `Cannot find module 'ajv'` (or other missing module errors), the failure appears in mcporter logs as `MCP error -32000: Connection closed`. The underlying stack trace shows broken file paths like `/root/.npm/_npx/764ca7ecbcc84da3/node_modules/ajv-formats/dist/limit.js`.

This occurs when the npx package cache at `/root/.npm/_npx/` becomes corrupted. The npx tool caches downloaded packages to speed up subsequent runs, but if this cache is corrupted, npx cannot load the MCP server code.

**Fix:** Delete the corrupted cache directory and restart:

```bash
docker exec openclaw-agents rm -rf /root/.npm/_npx/*
docker restart openclaw-agents
```

npx will automatically re-download the packages on the next run. Alternatively, a full container restart (`docker restart openclaw-agents`) also clears this ephemeral cache, but clearing the specific cache directory is faster if you're still in a live session.

## Agent Session Caching

When the OpenClaw gateway container starts, each agent session discovers available tools from mcporter during initialization. The agent caches this tool list for the lifetime of the session.

If an MCP server is offline when the container starts but is later fixed (for example, by clearing a corrupted npx cache), agents will NOT automatically detect the newly available tools. The session continues to use its original cached tool list, even though `mcporter list` now shows the server as healthy.

**Diagnosis:**

```bash
# Check if mcporter sees the server as healthy
docker exec openclaw-agents bash -c "HOME=/root mcporter list --json"
```

If mcporter shows all servers OK but agents still report tools as unavailable, the agent sessions have stale cached tool information.

**Fix:** Restart the container so agent sessions start fresh:

```bash
docker restart openclaw-agents
```

## Agent Says No MCP Server But mcporter Shows Healthy

This is the agent session caching issue. When you fix an MCP server (e.g., by clearing the npx cache) but agents still report the tools as unavailable, the agent's session cached the original tool list before the fix.

**Diagnosis:**

```bash
# Verify mcporter is reporting the server as healthy
docker exec openclaw-agents bash -c "HOME=/root mcporter list --json"
```

If mcporter output shows all servers and tools correctly, but agents cannot access those tools, the agent session cached stale tool information at startup.

**Fix:**

```bash
docker restart openclaw-agents
```

The container restart forces all agent sessions to reinitialize and rediscover tools from mcporter.

## mcporter Config Location and Structure

The mcporter configuration file is located at `/root/.mcporter/mcporter.json` inside the container. This config is generated by the inner entrypoint (`docker/entrypoint.sh`) on each container start and is ephemeral (lost when the container stops).

The config must use the top-level key `mcpServers` (not `servers`). This is a mcporter 0.7.3 requirement.

To inspect the current mcporter config:

```bash
docker exec openclaw-agents cat /root/.mcporter/mcporter.json | python3 -m json.tool
```

To verify the config has the correct structure:

```bash
docker exec openclaw-agents bash -c "cat /root/.mcporter/mcporter.json | jq '.mcpServers | keys'"
```

## Credential Mapping Reference

The outer entrypoint (`entrypoint.sh`) derives env vars from AWS Secrets Manager:

| Secret Key | Derived Env Var | Consumer |
|------------|-----------------|----------|
| ATLASSIAN_SITE_NAME | JIRA_BASE_URL (https://{site}.atlassian.net) | Jira MCP |
| ATLASSIAN_USER_EMAIL | JIRA_USER_EMAIL | Jira MCP |
| ATLASSIAN_API_TOKEN | JIRA_API_TOKEN | Jira MCP |
| ZENDESK_API_TOKEN | ZENDESK_TOKEN | Zendesk MCP |

The inner entrypoint (`docker/entrypoint.sh`) reads these derived vars and writes them into `/root/.mcporter/mcporter.json`.

## Full Credential Verification
```bash
# 1. Secrets Manager keys
aws secretsmanager get-secret-value --secret-id openclaw/agents --query SecretString --output text | jq 'keys'

# 2. Container env vars
docker exec openclaw-agents bash -c '
    while IFS= read -r -d "" line; do export "$line"; done < /proc/1/environ
    for v in JIRA_BASE_URL JIRA_USER_EMAIL JIRA_API_TOKEN ZENDESK_SUBDOMAIN ZENDESK_EMAIL ZENDESK_TOKEN NOTION_API_TOKEN; do
        val="${!v}"; echo "$v: ${val:0:10}... (len=${#val})"
    done
'

# 3. mcporter config
docker exec openclaw-agents bash -c "cat /root/.mcporter/mcporter.json | jq '.mcpServers | keys'"
```

## Recovery

### Full restart (fixes most issues)
```bash
cd /opt/openclaw
docker-compose down && docker-compose up -d
sleep 90
# Then run health check above
```

### Nuclear rebuild
```bash
cd /opt/openclaw
docker-compose down
docker rmi openclaw:latest
docker-compose build --no-cache
docker-compose up -d
```
