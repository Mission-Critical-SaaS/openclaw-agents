{
  "channels": {
    "slack": {
      "mode": "socket",
      "enabled": true,
      "groupPolicy": "allowlist",
      "allowChannels": ["C089JBLCFLL"],
      "accounts": {
        "scout": {
          "mode": "socket",
          "enabled": true,
          "botToken": "${SLACK_BOT_TOKEN_SCOUT}",
          "appToken": "${SLACK_APP_TOKEN_SCOUT}",
          "requireMention": true,
          "groupPolicy": "allowlist",
          "allowChannels": ["C089JBLCFLL"],
          "dmPolicy": "allowlist",
          "allowFrom": ${SLACK_ALLOW_FROM}
        },
        "trak": {
          "mode": "socket",
          "enabled": true,
          "botToken": "${SLACK_BOT_TOKEN_TRAK}",
          "appToken": "${SLACK_APP_TOKEN_TRAK}",
          "requireMention": true,
          "groupPolicy": "allowlist",
          "allowChannels": ["C089JBLCFLL"],
          "dmPolicy": "allowlist",
          "allowFrom": ${SLACK_ALLOW_FROM}
        },
        "kit": {
          "mode": "socket",
          "enabled": true,
          "botToken": "${SLACK_BOT_TOKEN_KIT}",
          "appToken": "${SLACK_APP_TOKEN_KIT}",
          "requireMention": true,
          "groupPolicy": "allowlist",
          "allowChannels": ["C089JBLCFLL"],
          "dmPolicy": "allowlist",
          "allowFrom": ${SLACK_ALLOW_FROM}
        }
      }
    }
  },
  "integrations": {
    "jira": {
      "siteName": "${ATLASSIAN_SITE_NAME}",
      "userEmail": "${ATLASSIAN_USER_EMAIL}",
      "apiToken": "${ATLASSIAN_API_TOKEN}"
    },
    "github": {
      "token": "${GITHUB_TOKEN}"
    }
  },
  "bindings": [
    {"agentId": "scout", "match": {"channel": "slack", "accountId": "scout"}},
    {"agentId": "trak", "match": {"channel": "slack", "accountId": "trak"}},
    {"agentId": "kit", "match": {"channel": "slack", "accountId": "kit"}}
  ]
}
