#!/bin/bash
set -euo pipefail
OPENCLAW_HOME="${OPENCLAW_HOME:-/root/.openclaw}"
echo "OpenClaw Multi-Agent Gateway starting..."

echo "Configuring from template..."
envsubst < ${OPENCLAW_HOME}/openclaw.json.tpl > ${OPENCLAW_HOME}/openclaw.json

# Set up mcporter config using Python (avoids sed escaping issues with JSON)
mkdir -p /root/.mcporter
python3 -c "
import json, os
config = {
    'mcpServers': {
        'jira': {
            'command': 'npx',
            'args': ['-y', '@aashari/mcp-server-atlassian-jira'],
            'description': 'Jira MCP Server',
            'env': {
                'ATLASSIAN_SITE_NAME': os.environ.get('ATLASSIAN_SITE_NAME', ''),
                'ATLASSIAN_USER_EMAIL': os.environ.get('ATLASSIAN_USER_EMAIL', ''),
                'ATLASSIAN_API_TOKEN': os.environ.get('ATLASSIAN_API_TOKEN', '')
            }
        },
        'zendesk': {
            'command': 'npx',
            'args': ['-y', 'zd-mcp-server'],
            'description': 'Zendesk Support MCP',
            'env': {
                'ZENDESK_SUBDOMAIN': os.environ.get('ZENDESK_SUBDOMAIN', ''),
                'ZENDESK_EMAIL': os.environ.get('ZENDESK_EMAIL', ''),
                'ZENDESK_TOKEN': os.environ.get('ZENDESK_TOKEN', '')
            }
        },
        'notion': {
            'command': 'npx',
            'args': ['-y', '@notionhq/notion-mcp-server'],
            'description': 'Notion MCP Server',
            'env': {
                'OPENAPI_MCP_HEADERS': json.dumps({
                    'Authorization': 'Bearer ' + os.environ.get('NOTION_API_TOKEN', ''),
                    'Notion-Version': '2022-06-28'
                })
            }
        },
        'zoho': {
            'command': 'node',
            'args': ['/usr/lib/node_modules/@macnishio/zoho-mcp-server/dist/server.js'],
            'description': 'Zoho CRM MCP Server',
            'env': {
                'ZOHO_CLIENT_ID': os.environ.get('ZOHO_CLIENT_ID', ''),
                'ZOHO_CLIENT_SECRET': os.environ.get('ZOHO_CLIENT_SECRET', ''),
                'ZOHO_REFRESH_TOKEN': os.environ.get('ZOHO_REFRESH_TOKEN', ''),
                'ZOHO_API_DOMAIN': os.environ.get('ZOHO_API_DOMAIN', 'https://www.zohoapis.com')
            }
        }
    }
}
with open('/root/.mcporter/mcporter.json', 'w') as f:
    json.dump(config, f, indent=2)
print('mcporter config written OK')
"

# Create Zoho config file required by @macnishio/zoho-mcp-server
# The package reads OAuth client config from this Claude Desktop config path
mkdir -p /root/AppData/Roaming/Claude
python3 << 'ZOHO_CONFIG_EOF'
import json, os
zoho_config = {
    "zohoConfig": {
        "crm": {
            "clientId": os.environ.get("ZOHO_CLIENT_ID", ""),
            "clientSecret": os.environ.get("ZOHO_CLIENT_SECRET", ""),
            "redirectUri": "http://localhost:3003/oauth/callback",
            "scope": "ZohoCRM.modules.ALL,ZohoCRM.settings.ALL,ZohoCRM.users.ALL",
            "authDomain": "https://accounts.zoho.com",
            "apiBaseUrl": os.environ.get("ZOHO_API_DOMAIN", "https://www.zohoapis.com")
        },
        "desk": {
            "clientId": os.environ.get("ZOHO_CLIENT_ID", ""),
            "clientSecret": os.environ.get("ZOHO_CLIENT_SECRET", ""),
            "redirectUri": "http://localhost:3003/oauth/callback",
            "scope": "Desk.tickets.ALL,Desk.basic.READ",
            "authDomain": "https://accounts.zoho.com",
            "apiBaseUrl": "https://desk.zoho.com"
        },
        "books": {
            "clientId": os.environ.get("ZOHO_CLIENT_ID", ""),
            "clientSecret": os.environ.get("ZOHO_CLIENT_SECRET", ""),
            "redirectUri": "http://localhost:3003/oauth/callback",
            "scope": "ZohoBooks.fullaccess.all",
            "authDomain": "https://accounts.zoho.com",
            "apiBaseUrl": "https://books.zoho.com"
        }
    }
}
with open("/root/AppData/Roaming/Claude/claude_desktop_config.json", "w") as f:
    json.dump(zoho_config, f, indent=2)
print("Zoho desktop config written OK")
ZOHO_CONFIG_EOF

# Set up agent auth profiles
for agent in scout trak kit; do
  AGENT_DIR="${OPENCLAW_HOME}/agents/${agent}/agent"
  mkdir -p "${AGENT_DIR}"
  cat > "${AGENT_DIR}/auth-profiles.json" << AUTHEOF
{
  "version": 1,
  "profiles": {
    "anthropic:default": {
      "type": "token",
      "provider": "anthropic",
      "token": "${ANTHROPIC_API_KEY}"
    }
  }
}
AUTHEOF
done

# NOTE: Agent workspace file injection (IDENTITY.md, KNOWLEDGE.md) is handled
# by the outer entrypoint (/app/entrypoint.sh) AFTER the gateway creates the
# runtime workspaces at /root/.openclaw/.openclaw/workspace-{agent}/.
# The inner entrypoint runs before those directories exist.

# NOTE: API key auth is handled via auth-profiles.json written above.
# Do NOT use the interactive "paste-token" CLI auth method — it blocks
# the entrypoint and leaks the key character-by-character into docker logs.

# Install mcporter globally
if ! command -v mcporter &> /dev/null; then
  npm install -g mcporter 2>/dev/null
  echo "mcporter installed"
fi

# Install gh CLI if missing
if ! command -v gh &> /dev/null; then
  echo "Installing gh CLI..."
  curl -sSL https://cli.github.com/packages/githubcli-archive-keyring.gpg | gpg --dearmor -o /usr/share/keyrings/githubcli.gpg 2>/dev/null
  echo "deb [arch=amd64 signed-by=/usr/share/keyrings/githubcli.gpg] https://cli.github.com/packages stable main" > /etc/apt/sources.list.d/github-cli.list
  apt-get update -qq && apt-get install -y -qq gh 2>/dev/null
  echo "gh CLI installed"
fi

# Auth gh with token
if command -v gh &> /dev/null && [ -n "${GITHUB_TOKEN:-}" ]; then
  echo "${GITHUB_TOKEN}" | gh auth login --with-token 2>/dev/null || true
  echo "gh authenticated"
fi

# NOTE: MCP warmup moved to outer entrypoint (/app/entrypoint.sh)
# so it runs AFTER the gateway is live and MCP servers are reachable.

echo "Starting OpenClaw gateway..."
exec openclaw gateway run --allow-unconfigured 2>&1 | tee /data/logs/openclaw.log
