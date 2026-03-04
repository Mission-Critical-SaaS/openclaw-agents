{
  "version": 2,
  "gateway": {
    "logLevel": "info",
    "logDir": "/data/logs"
  },
  "models": {
    "default": {
      "provider": "anthropic",
      "model": "claude-sonnet-4-5-20250929",
      "authProfile": "anthropic:default"
    }
  },
  "auth": {
    "profiles": {
      "anthropic:default": {
        "provider": "anthropic",
        "mode": "token"
      }
    }
  },
  "channels": {
    "slack:scout": {
      "enabled": true,
      "type": "slack",
      "botToken": "${SLACK_BOT_TOKEN_SCOUT}",
      "appToken": "${SLACK_APP_TOKEN_SCOUT}",
      "dmPolicy": "open",
      "groupPolicy": "mention",
      "requireMention": true,
      "systemPrompt": "You are Scout, the customer support specialist for the LMNTL team. Be warm, helpful, and thorough."
    },
    "slack:trak": {
      "enabled": true,
      "type": "slack",
      "botToken": "${SLACK_BOT_TOKEN_TRAK}",
      "appToken": "${SLACK_APP_TOKEN_TRAK}",
      "dmPolicy": "open",
      "groupPolicy": "mention",
      "requireMention": true,
      "systemPrompt": "You are Trak, the project management and Jira specialist. Be concise and action-oriented."
    },
    "slack:kit": {
      "enabled": true,
      "type": "slack",
      "botToken": "${SLACK_BOT_TOKEN_KIT}",
      "appToken": "${SLACK_APP_TOKEN_KIT}",
      "dmPolicy": "open",
      "groupPolicy": "mention",
      "requireMention": true,
      "systemPrompt": "You are Kit, the engineering assistant. Be technical, precise, and helpful with code."
    }
  },
  "agents": {
    "list": {
      "scout": {
        "name": "Scout",
        "model": "claude-sonnet-4-5-20250929",
        "agentDir": "agents/scout",
        "workspace": "agents/scout/workspace",
        "description": "Customer support agent with access to Stripe, docs, and customer data"
      },
      "trak": {
        "name": "Trak",
        "model": "claude-sonnet-4-5-20250929",
        "agentDir": "agents/trak",
        "workspace": "agents/trak/workspace",
        "description": "Project management agent with Jira integration"
      },
      "kit": {
        "name": "Kit",
        "model": "claude-sonnet-4-5-20250929",
        "agentDir": "agents/kit",
        "workspace": "agents/kit/workspace",
        "description": "Engineering assistant with GitHub integration"
      }
    },
    "bindings": [
      {
        "agent": "scout",
        "channel": "slack:scout",
        "accountId": "default"
      },
      {
        "agent": "trak",
        "channel": "slack:trak",
        "accountId": "default"
      },
      {
        "agent": "kit",
        "channel": "slack:kit",
        "accountId": "default"
      }
    ]
  },
  "mcpServers": {
    "github": {
      "command": "npx",
      "args": ["-y", "@anthropic/mcp-server-github"],
      "env": {
        "GITHUB_TOKEN": "${GITHUB_TOKEN:-}"
      }
    },
    "jira": {
      "command": "npx",
      "args": ["-y", "@anthropic/mcp-server-jira"],
      "env": {
        "JIRA_API_TOKEN": "${JIRA_API_TOKEN:-}",
        "JIRA_BASE_URL": "${JIRA_BASE_URL:-}",
        "JIRA_USER_EMAIL": "${JIRA_USER_EMAIL:-}"
      }
    },
    "stripe": {
      "command": "npx",
      "args": ["-y", "@anthropic/mcp-server-stripe"],
      "env": {
        "STRIPE_API_KEY": "${STRIPE_API_KEY:-}"
      }
    }
  }
}
