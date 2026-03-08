#!/bin/bash
set -euo pipefail
OPENCLAW_HOME="${OPENCLAW_HOME:-/root/.openclaw}"
echo "OpenClaw Multi-Agent Gateway starting..."

echo "Configuring from template..."
envsubst < ${OPENCLAW_HOME}/openclaw.json.tpl > ${OPENCLAW_HOME}/openclaw.json

mkdir -p /root/.mcporter
cat > /tmp/mcporter_raw.json << 'MPEOF'
{
  "servers": {
    "jira": {
      "command": "npx", "args": ["-y", "@aashari/mcp-server-atlassian-jira"],
      "env": {"JIRA_BASE_URL": "JBU_PH", "JIRA_USER_EMAIL": "JUE_PH", "JIRA_API_TOKEN": "JAT_PH"}
    },
    "zendesk": {
      "command": "npx", "args": ["-y", "zd-mcp-server"],
      "env": {"ZENDESK_SUBDOMAIN": "ZS_PH", "ZENDESK_EMAIL": "ZE_PH", "ZENDESK_API_TOKEN": "ZAT_PH"}
    },
    "notion": {
      "command": "npx", "args": ["-y", "@notionhq/notion-mcp-server"],
      "env": {"OPENAPI_MCP_HEADERS": "NH_PH"}
    }
  }
}
MPEOF

sed -i "s|JBU_PH|${JIRA_BASE_URL:-}|g" /tmp/mcporter_raw.json
sed -i "s|JUE_PH|${JIRA_USER_EMAIL:-}|g" /tmp/mcporter_raw.json
sed -i "s|JAT_PH|${JIRA_API_TOKEN:-}|g" /tmp/mcporter_raw.json
sed -i "s|ZS_PH|${ZENDESK_SUBDOMAIN:-}|g" /tmp/mcporter_raw.json
sed -i "s|ZE_PH|${ZENDESK_EMAIL:-}|g" /tmp/mcporter_raw.json
sed -i "s|ZAT_PH|${ZENDESK_API_TOKEN:-}|g" /tmp/mcporter_raw.json
NH="{\"Authorization\": \"Bearer ${NOTION_API_TOKEN:-}\", \"Notion-Version\": \"2022-06-28\"}"
sed -i "s|NH_PH|${NH}|g" /tmp/mcporter_raw.json
cp /tmp/mcporter_raw.json /root/.mcporter/mcporter.json

for agent in scout trak kit; do
  AGENT_DIR="${OPENCLAW_HOME}/agents/${agent}/agent"
  mkdir -p "${AGENT_DIR}"
  cat > "${AGENT_DIR}/auth-profiles.json" << AUTHEOF
{"version":1,"profiles":{"anthropic:default":{"type":"token","provider":"anthropic","token":"${ANTHROPIC_API_KEY}"}}}
AUTHEOF
done

for agent in scout trak kit; do
  [ -d "/tmp/agents/${agent}/workspace" ] && cp -r /tmp/agents/${agent}/workspace/* "${OPENCLAW_HOME}/agents/${agent}/workspace/" 2>/dev/null || true
done

if command -v openclaw &> /dev/null && [ -n "${ANTHROPIC_API_KEY:-}" ]; then
  echo "Registering API key..."
  echo "${ANTHROPIC_API_KEY}" | openclaw models auth paste-token --provider anthropic --profile-id anthropic:default 2>/dev/null || true
fi

echo "Configuring Slack channels..."
python3 /configure_channels.py 2>&1

echo "Running doctor fix..."
openclaw doctor --fix 2>&1 || true

echo "Starting OpenClaw gateway..."
exec openclaw gateway run --allow-unconfigured 2>&1 | tee /data/logs/openclaw.log
