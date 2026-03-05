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
| `SLACK_ALLOW_FROM` | JSON array of allowed Slack user IDs | Slack workspace |
| `ATLASSIAN_SITE_NAME` | Jira/Confluence site (e.g., `lmntl`) | Atlassian admin |
| `ATLASSIAN_USER_EMAIL` | Atlassian service account email | Atlassian admin |
| `ATLASSIAN_API_TOKEN` | Atlassian API token | [id.atlassian.com](https://id.atlassian.com/manage-profile/security/api-tokens) |
| `GITHUB_TOKEN` | GitHub personal access token | [github.com/settings/tokens](https://github.com/settings/tokens) |

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

After updating secrets, restart the container to pick up changes:
```bash
ssh ec2-user@3.237.5.79
cd /opt/openclaw
docker-compose restart
```

## Rotating Slack Tokens

1. Go to [api.slack.com/apps](https://api.slack.com/apps)
2. Select the app (Scout/Trak/Kit)
3. Regenerate the bot token under **OAuth & Permissions**
4. Regenerate the app token under **Basic Information > App-Level Tokens**
5. Update both tokens in Secrets Manager
6. Restart the container

## Rotating the Anthropic API Key

1. Go to [console.anthropic.com](https://console.anthropic.com)
2. Create a new API key
3. Update `ANTHROPIC_API_KEY` in Secrets Manager
4. Restart the container
5. Verify agents respond, then revoke the old key
