#!/bin/bash
# ──────────────────────────────────────────────────────────
# OpenClaw entrypoint — configures agents and starts gateway
# ──────────────────────────────────────────────────────────
set -euo pipefail

OPENCLAW_HOME="${OPENCLAW_HOME:-/root/.openclaw}"

echo "🐾 OpenClaw Multi-Agent Gateway starting..."

# ─── Write tokens from environment into config ───
echo "▶ Configuring Slack tokens..."

# Build openclaw.json from template + env vars
envsubst < ${OPENCLAW_HOME}/openclaw.json.tpl > ${OPENCLAW_HOME}/openclaw.json

# ─── Set up agent auth profiles ───
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

# ─── Copy agent workspace files ───
for agent in scout trak kit; do
  if [ -d "/tmp/agents/${agent}/workspace" ]; then
    cp -r /tmp/agents/${agent}/workspace/* "${OPENCLAW_HOME}/agents/${agent}/workspace/" 2>/dev/null || true
  fi
done

# ─── Set API key via CLI if available ───
if command -v openclaw &> /dev/null && [ -n "${ANTHROPIC_API_KEY:-}" ]; then
  echo "▶ Registering API key..."
  echo "${ANTHROPIC_API_KEY}" | openclaw models auth paste-token \
    --provider anthropic --profile-id anthropic:default 2>/dev/null || true
fi

echo "▶ Starting OpenClaw daemon..."
exec openclaw daemon start --foreground 2>&1 | tee /data/logs/openclaw.log
