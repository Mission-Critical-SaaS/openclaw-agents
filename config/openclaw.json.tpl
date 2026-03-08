{
  "meta": {
    "lastTouchedVersion": "2026.3.2"
  },
  "auth": {
    "profiles": {
      "anthropic:default": {
        "provider": "anthropic",
        "mode": "token"
      }
    }
  },
  "agents": {
    "defaults": {
      "model": {
        "primary": "anthropic/claude-opus-4-6"
      },
      "models": {
        "anthropic/claude-opus-4-6": {}
      },
      "compaction": {
        "mode": "safeguard"
      },
      "maxConcurrent": 4,
      "subagents": {
        "maxConcurrent": 8
      }
    },
    "list": [
      {
        "id": "scout",
        "workspace": "/root/.openclaw/agents/scout/workspace",
        "agentDir": "/root/.openclaw/agents/scout/agent"
      },
      {
        "id": "trak",
        "workspace": "/root/.openclaw/agents/trak/workspace",
        "agentDir": "/root/.openclaw/agents/trak/agent"
      },
      {
        "id": "kit",
        "workspace": "/root/.openclaw/agents/kit/workspace",
        "agentDir": "/root/.openclaw/agents/kit/agent"
      }
    ]
  },
  "tools": {
    "profile": "full"
  },
  "bindings": [
    {
      "agentId": "scout",
      "match": {
        "channel": "slack",
        "accountId": "scout"
      }
    },
    {
      "agentId": "trak",
      "match": {
        "channel": "slack",
        "accountId": "trak"
      }
    },
    {
      "agentId": "kit",
      "match": {
        "channel": "slack",
        "accountId": "kit"
      }
    }
  ],
  "channels": {
    "slack": {
      "enabled": true,
      "accounts": {
        "scout": {
          "mode": "socket",
          "enabled": true,
          "botToken": "${SLACK_BOT_TOKEN_SCOUT}",
          "appToken": "${SLACK_APP_TOKEN_SCOUT}",
          "streaming": "partial",
          "nativeStreaming": true,
          "dmPolicy": "allowlist",
          "groupPolicy": "allowlist",
          "requireMention": true,
          "allowFrom": ${SLACK_ALLOW_FROM}
        },
        "trak": {
          "mode": "socket",
          "enabled": true,
          "botToken": "${SLACK_BOT_TOKEN_TRAK}",
          "appToken": "${SLACK_APP_TOKEN_TRAK}",
          "streaming": "partial",
          "nativeStreaming": true,
          "dmPolicy": "allowlist",
          "groupPolicy": "allowlist",
          "requireMention": true,
          "allowFrom": ${SLACK_ALLOW_FROM}
        },
        "kit": {
          "mode": "socket",
          "enabled": true,
          "botToken": "${SLACK_BOT_TOKEN_KIT}",
          "appToken": "${SLACK_APP_TOKEN_KIT}",
          "streaming": "partial",
          "nativeStreaming": true,
          "dmPolicy": "allowlist",
          "groupPolicy": "allowlist",
          "requireMention": true,
          "allowFrom": ${SLACK_ALLOW_FROM}
        }
      }
    }
  },
  "plugins": {
    "entries": {
      "slack": {
        "enabled": true
      }
    }
  }
,
  "mcpServers": {
    "notion": {
      "command": "npx",
      "args": ["-y", "@notionhq/notion-mcp-server"],
      "env": {
        "OPENAPI_MCP_HEADERS": "{\\"Authorization\\": \\"Bearer ${NOTION_API_TOKEN}\\", \\"Notion-Version\\": \\"2022-06-28\\"}"
      }
    }
  }
}
