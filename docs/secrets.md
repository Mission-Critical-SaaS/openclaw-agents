# Secrets Management

## Overview

All secrets are stored in **AWS Secrets Manager** under the key `openclaw/agents` in account 122015479852 (us-east-1). The Docker entrypoint script fetches these at startup.

## Secret Structure

The secret is a JSON object with these keys:

| Key | Description | Source |
|-----|-------------|--------|
| `ANTHROPIC_API_KEY` | Anthropic Claude API key | [console.anthropic.com](https://console.anthropic.com) |
| `SLACK_BOT_TOKEN_SCOUT` | Scout bot OAuth token (xoxb-...) | Slack App: A0AJ5DNRR6K |
| `SLACK_APP_TOKEN_SCOUT` | Scout app-level token (xapp-...) | Slack App: A0AJ5DNRR6K |
| `SLACK_BOT_TOKEN_TRAK` | Trak bot OAuth token (xoxb-...) | Slack App: A0AJLU847U2 |
| `SLACK_APP_TOKEN_TRAK` | Trak app-level token (xapp-...) | Slack App: A0AJLU847U2 |
| `SLACK_BOT_TOKEN_KIT` | Kit bot OAuth token (xoxb-...) | Slack App: A0AKF8212BA |
| `SLACK_APP_TOKEN_KIT` | Kit app-level token (xapp-...) | Slack App: A0AKF8212BA |
| `SLACK_BOT_TOKEN_BEACON` | Beacon bot OAuth token (xoxb-...) | Slack App: A0AMPHEPRPG |
| `SLACK_APP_TOKEN_BEACON` | Beacon app-level token (xapp-...) | Slack App: A0AMPHEPRPG |
| `SLACK_ALLOW_FROM` | JSON array of allowed Slack user IDs | Slack workspace |
| `ATLASSIAN_SITE_NAME` | Jira/Confluence site (e.g., `lmntl`) | Atlassian admin |
| `ATLASSIAN_USER_EMAIL` | Atlassian service account email | Atlassian admin |
| `ATLASSIAN_API_TOKEN` | Atlassian API token | [id.atlassian.com](https://id.atlassian.com/manage-profile/security/api-tokens) |
| `GITHUB_TOKEN` | GitHub personal access token | [github.com/settings/tokens](https://github.com/settings/tokens) |
| `NOTION_API_TOKEN` | Notion integration API token | [notion.so/my-integrations](https://www.notion.so/my-integrations) |
| `ZENDESK_SUBDOMAIN` | Zendesk subdomain (e.g., `minute7`) | Zendesk admin |
| `ZENDESK_EMAIL` | Zendesk agent email | Zendesk admin |
| `ZENDESK_API_TOKEN` | Zendesk API token | [Zendesk Admin Center](https://minute7.zendesk.com/admin/apps-integrations/apis/api-tokens) |

## Viewing Secrets

```bash
# Via AWS CLI (requires account access)
aws secretsmanager get-secret-value \
  --secret-id openclaw/agents \
  --query SecretString \
  --output text | python3 -m json.tool
```

## Updating Secrets

```bash
# Update a single key
aws secretsmanager put-secret-value \
  --secret-id openclaw/agents \
  --secret-string "$(
    aws secretsmanager get-secret-value \
      --secret-id openclaw/agents \
      --query SecretString \
      --output text | \
    python3 -c "
import json, sys
d = json.load(sys.stdin)
d['ANTHROPIC_API_KEY'] = 'sk-ant-new-key-here'
print(json.dumps(d))
")"
```

After updating secrets, restart the container to pick up changes. Use CI/CD (push a new tag) or via SSM:

```bash
aws ssm send-command \
  --instance-ids i-0acd7169101e93388 \
  --document-name AWS-RunShellScript \
  --parameters 'commands=["cd /opt/openclaw && docker-compose restart"]' \
  --output json
```

## Rotating Slack Tokens

1. Go to [api.slack.com/apps](https://api.slack.com/apps)
2. Select the app (Scout/Trak/Kit)
3. Regenerate the bot token under **OAuth & Permissions**
4. Regenerate the app token under **Basic Information > App-Level Tokens**
5. Update both tokens in Secrets Manager
6. Restart the container

## Rotating the Zendesk API Token

1. Go to [minute7.zendesk.com/admin](https://minute7.zendesk.com/admin/apps-integrations/apis/api-tokens)
2. Create a new API token with description "OpenClaw Scout Agent"
3. Copy the token immediately (it won’t be shown again)
4. Update `ZENDESK_API_TOKEN` in Secrets Manager
5. Restart the container
6. Delete the old token in Zendesk Admin Center

## Rotating the Notion API Token

1. Go to [notion.so/my-integrations](https://www.notion.so/my-integrations)
2. Select the OpenClaw integration
3. Under "Internal Integration Secret", click "Show" then "Regenerate"
4. Copy the new token (starts with `ntn_`)
5. Update `NOTION_API_TOKEN` in Secrets Manager
6. Restart the container

## Rotating the Anthropic API Key

1. Go to [console.anthropic.com](https://console.anthropic.com)
2. Create a new API key
3. Update `ANTHROPIC_API_KEY` in Secrets Manager
4. Restart the container
5. Verify agents respond, then revoke the old key
