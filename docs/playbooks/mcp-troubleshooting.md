# MCP Server Troubleshooting Runbook

## Quick Health Check

```bash
docker exec openclaw-agents bash -c '
    while IFS= read -r -d "" line; do export "$line"; done < /proc/1/environ
    mcporter list 2>&1
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
| Notion | 401 | Bad token or no access | Verify token starts with ntn_ and integration has page access |

## "No MCP servers configured"

mcporter config file is missing or has wrong key.

```bash
# Check config exists and has correct structure
docker exec openclaw-agents cat /root/.mcporter/mcporter.json | python3 -m json.tool
```

The top-level key MUST be `mcpServers` (not `servers`). This is a mcporter 0.7.3 requirement. If wrong, fix in `docker/entrypoint-fixed.sh` and redeploy.

## Env Vars Not Available via docker exec

Docker exec does NOT inherit PID 1 environment. Always prefix commands with:

```bash
while IFS= read -r -d "" line; do export "$line"; done < /proc/1/environ
```

Do NOT use the `tr/xargs` pattern — it breaks on values with special characters.

## Credential Mapping Reference

The outer entrypoint (`entrypoint.sh`) derives env vars from AWS Secrets Manager:

| Secret Key | Derived Env Var | Consumer |
|------------|-----------------|----------|
| ATLASSIAN_SITE_NAME | JIRA_BASE_URL (https://{site}.atlassian.net) | Jira MCP |
| ATLASSIAN_USER_EMAIL | JIRA_USER_EMAIL | Jira MCP |
| ATLASSIAN_API_TOKEN | JIRA_API_TOKEN | Jira MCP |
| ZENDESK_API_TOKEN | ZENDESK_TOKEN | Zendesk MCP |

The inner entrypoint (`docker/entrypoint-fixed.sh`) reads these derived vars and writes them into `/root/.mcporter/mcporter.json`.

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
docker exec openclaw-agents cat /root/.mcporter/mcporter.json | jq '.mcpServers | keys'
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
