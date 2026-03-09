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
        }
    }
}
with open('/root/.mcporter/mcporter.json', 'w') as f:
    json.dump(config, f, indent=2)
print('mcporter config written OK')
"

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

# Copy agent workspace files (IDENTITY.md, KNOWLEDGE.md, etc.)
for agent in scout trak kit; do
  if [ -d "/tmp/agents/${agent}/workspace" ]; then
    cp -r /tmp/agents/${agent}/workspace/* "${OPENCLAW_HOME}/agents/${agent}/workspace/" 2>/dev/null || true
  fi
done

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
