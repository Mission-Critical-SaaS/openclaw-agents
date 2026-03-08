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
                'JIRA_BASE_URL': os.environ.get('JIRA_BASE_URL', ''),
                'JIRA_USER_EMAIL': os.environ.get('JIRA_USER_EMAIL', ''),
                'JIRA_API_TOKEN': os.environ.get('JIRA_API_TOKEN', '')
            }
        },
        'zendesk': {
            'command': 'npx',
            'args': ['-y', 'zd-mcp-server'],
            'description': 'Zendesk Support MCP',
            'env': {
                'ZENDESK_SUBDOMAIN': os.environ.get('ZENDESK_SUBDOMAIN', ''),
                'ZENDESK_EMAIL': os.environ.get('ZENDESK_EMAIL', ''),
                'ZENDESK_API_TOKEN': os.environ.get('ZENDESK_API_TOKEN', '')
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

# Copy agent workspace files
for agent in scout trak kit; do
  if [ -d "/tmp/agents/${agent}/workspace" ]; then
    cp -r /tmp/agents/${agent}/workspace/* "${OPENCLAW_HOME}/agents/${agent}/workspace/" 2>/dev/null || true
  fi
done

# Register API key
if command -v openclaw &> /dev/null && [ -n "${ANTHROPIC_API_KEY:-}" ]; then
  echo "Registering API key..."
  echo "${ANTHROPIC_API_KEY}" | openclaw models auth paste-token \
    --provider anthropic --profile-id anthropic:default 2>/dev/null || true
fi

# SKIP openclaw channels add - channels are managed by outer entrypoint injection

echo "Starting OpenClaw gateway..."
exec openclaw gateway run --allow-unconfigured 2>&1 | tee /data/logs/openclaw.log
