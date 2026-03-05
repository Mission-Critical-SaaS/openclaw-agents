#!/bin/bash
# ──────────────────────────────────────────────────────────
# OpenClaw entrypoint — configures agents and starts gateway
# ──────────────────────────────────────────────────────────
set -euo pipefail

OPENCLAW_HOME="${OPENCLAW_HOME:-/root/.openclaw}"

echo "🐾 OpenClaw Multi-Agent Gateway starting..."

# ─── Build openclaw.json from template + env vars ───
echo "▶ Configuring from template..."
envsubst < ${OPENCLAW_HOME}/openclaw.json.tpl > ${OPENCLAW_HOME}/openclaw.json

# ─── Set up agent auth profiles (Anthropic API key) ───
echo "▶ Writing auth profiles..."
for agent in scout trak kit; do
  AGENT_DIR="${OPENCLAW_HOME}/agents/${agent}/agent"
  mkdir -p "${AGENT_DIR}"
  cat > "${AGENT_DIR}/auth-profiles.json" <<EOF
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
EOF
done

# ─── Copy agent workspace files (IDENTITY.md) ───
echo "▶ Deploying agent identities..."
for agent in scout trak kit; do
  if [ -d "/tmp/agents/${agent}/workspace" ]; then
    cp -r /tmp/agents/${agent}/workspace/* "${OPENCLAW_HOME}/agents/${agent}/workspace/" 2>/dev/null || true
    echo "  ✓ ${agent}"
  fi
done

# ─── Configure mcporter for Jira MCP ───
echo "▶ Configuring mcporter (Jira MCP)..."
mkdir -p /root/.mcporter
cat > /root/.mcporter/mcporter.json <<EOF
{
  "mcpServers": {
    "jira": {
      "command": "npx",
      "args": ["-y", "@aashari/mcp-server-atlassian-jira"],
      "description": "Jira Cloud MCP for LMNTL",
      "env": {
        "ATLASSIAN_SITE_NAME": "${ATLASSIAN_SITE_NAME}",
        "ATLASSIAN_USER_EMAIL": "${ATLASSIAN_USER_EMAIL}",
        "ATLASSIAN_API_TOKEN": "${ATLASSIAN_API_TOKEN}"
      }
    }
  },
  "imports": []
}
EOF

# ─── Configure GitHub CLI ───
echo "▶ Configuring GitHub CLI..."
if [ -n "${GITHUB_TOKEN:-}" ]; then
  echo "${GITHUB_TOKEN}" | gh auth login --with-token 2>/dev/null || true
  echo "  ✓ gh authenticated"
fi

# ─── Register Anthropic API key ───
if command -v openclaw &> /dev/null && [ -n "${ANTHROPIC_API_KEY:-}" ]; then
  echo "▶ Registering API key..."
  echo "${ANTHROPIC_API_KEY}" | openclaw models auth paste-token \
    --provider anthropic --profile-id anthropic:default 2>/dev/null || true
fi

echo "▶ Starting OpenClaw daemon..."
exec openclaw daemon start --foreground 2>&1 | tee /data/logs/openclaw.log
