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
      },
      {
        "id": "scribe",
        "workspace": "/root/.openclaw/agents/scribe/workspace",
        "agentDir": "/root/.openclaw/agents/scribe/agent"
      },
      {
        "id": "probe",
        "workspace": "/root/.openclaw/agents/probe/workspace",
        "agentDir": "/root/.openclaw/agents/probe/agent"
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
    },
    {
      "agentId": "scribe",
      "match": {
        "channel": "slack",
        "accountId": "scribe"
      }
    },
    {
      "agentId": "probe",
      "match": {
        "channel": "slack",
        "accountId": "probe"
      }
    }
  ],
  "gateway": {
    "mode": "local",
    "port": 18789
  },
  "channels": {
    "slack": {
      "replyToMode": "all"
    }
  }
}