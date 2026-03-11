#!/bin/bash
export PATH="$PATH:/root/.openclaw/bin:/root/.local/bin:/usr/bin"

# Fetch secrets from AWS Secrets Manager
SECRET=$(aws secretsmanager get-secret-value --secret-id openclaw/agents --region us-east-1 --query SecretString --output text)
export SLACK_BOT_TOKEN_SCOUT=$(echo "$SECRET" | jq -r .SLACK_BOT_TOKEN_SCOUT)
export SLACK_APP_TOKEN_SCOUT=$(echo "$SECRET" | jq -r .SLACK_APP_TOKEN_SCOUT)
export SLACK_BOT_TOKEN_TRAK=$(echo "$SECRET" | jq -r .SLACK_BOT_TOKEN_TRAK)
export SLACK_APP_TOKEN_TRAK=$(echo "$SECRET" | jq -r .SLACK_APP_TOKEN_TRAK)
export SLACK_BOT_TOKEN_KIT=$(echo "$SECRET" | jq -r .SLACK_BOT_TOKEN_KIT)
export SLACK_APP_TOKEN_KIT=$(echo "$SECRET" | jq -r .SLACK_APP_TOKEN_KIT)
export ATLASSIAN_SITE_NAME=$(echo "$SECRET" | jq -r .ATLASSIAN_SITE_NAME)
export ATLASSIAN_USER_EMAIL=$(echo "$SECRET" | jq -r .ATLASSIAN_USER_EMAIL)
export ATLASSIAN_API_TOKEN=$(echo "$SECRET" | jq -r .ATLASSIAN_API_TOKEN)

# Derived Jira env vars (backward compat only)
export JIRA_BASE_URL="https://${ATLASSIAN_SITE_NAME}.atlassian.net"
export JIRA_USER_EMAIL="${ATLASSIAN_USER_EMAIL}"
export JIRA_API_TOKEN="${ATLASSIAN_API_TOKEN}"
# GitHub App token (replaces static PAT)
export GH_APP_ID=$(aws ssm get-parameter --name /openclaw/github-app/app-id --region us-east-1 --query Parameter.Value --output text)
export GH_APP_INSTALLATION_ID=$(aws ssm get-parameter --name /openclaw/github-app/installation-id --region us-east-1 --query Parameter.Value --output text)
GH_APP_PRIVATE_KEY=$(aws ssm get-parameter --name /openclaw/github-app/private-key --region us-east-1 --with-decryption --query Parameter.Value --output text)
export GH_APP_PRIVATE_KEY_FILE=/tmp/.github-app-key.pem
# Write private key with restrictive permissions from the start (no race window)
(umask 077 && echo "$GH_APP_PRIVATE_KEY" > "$GH_APP_PRIVATE_KEY_FILE")
source /app/scripts/github-app-token.sh
export ZENDESK_SUBDOMAIN=$(echo "$SECRET" | jq -r .ZENDESK_SUBDOMAIN)
export ZENDESK_EMAIL=$(echo "$SECRET" | jq -r .ZENDESK_EMAIL)
export ZENDESK_API_TOKEN=$(echo "$SECRET" | jq -r .ZENDESK_API_TOKEN)
export ZENDESK_TOKEN="${ZENDESK_API_TOKEN}"
export NOTION_API_TOKEN=$(echo "$SECRET" | jq -r .NOTION_API_TOKEN)
export NOTION_API_KEY=${NOTION_API_TOKEN}
export ZOHO_CLIENT_ID=$(echo "$SECRET" | jq -r '.ZOHO_CLIENT_ID // empty')
export ZOHO_CLIENT_SECRET=$(echo "$SECRET" | jq -r '.ZOHO_CLIENT_SECRET // empty')
export ZOHO_REFRESH_TOKEN=$(echo "$SECRET" | jq -r '.ZOHO_REFRESH_TOKEN // empty')
export ZOHO_API_DOMAIN=$(echo "$SECRET" | jq -r '.ZOHO_API_DOMAIN // "https://www.zohoapis.com"')
export SLACK_ALLOW_FROM=$(echo "$SECRET" | jq -r .SLACK_ALLOW_FROM)
export ANTHROPIC_API_KEY=$(echo "$SECRET" | jq -r .ANTHROPIC_API_KEY)

# Start inner entrypoint (which starts the gateway) in background
"$@" &
GATEWAY_PID=$!

# Wait for gateway to create its config file
# Inner entrypoint installs mcporter + gh CLI which can take ~30-60s
CONF="/root/.openclaw/.openclaw/openclaw.json"
echo "Waiting for gateway config..."
for i in $(seq 1 90); do
  [ -f "$CONF" ] && break
  sleep 1
done

if [ -f "$CONF" ]; then
  echo "Gateway config found, injecting Slack channels..."
  python3 << 'INJECT_PYEOF'
import json, os

conf_path = '/root/.openclaw/.openclaw/openclaw.json'
try:
    with open(conf_path) as f:
        config = json.load(f)
except Exception as e:
    print(f'Error reading config: {e}')
    config = {}

allow_from_str = os.environ.get('SLACK_ALLOW_FROM', '[]')
try:
    allow_from = json.loads(allow_from_str)
except:
    allow_from = []

accounts = {}
for name, bk, ak in [
    ('scout', 'SLACK_BOT_TOKEN_SCOUT', 'SLACK_APP_TOKEN_SCOUT'),
    ('trak', 'SLACK_BOT_TOKEN_TRAK', 'SLACK_APP_TOKEN_TRAK'),
    ('kit', 'SLACK_BOT_TOKEN_KIT', 'SLACK_APP_TOKEN_KIT'),
]:
    bot = os.environ.get(bk, '')
    app = os.environ.get(ak, '')
    if bot and app and bot != 'null' and app != 'null':
        accounts[name] = {
            'mode': 'socket',
            'enabled': True,
            'botToken': bot,
            'appToken': app,
            'streaming': 'none',
            'nativeStreaming': False,
            'dmPolicy': 'allowlist',
            'groupPolicy': 'open',
            'requireMention': True,
            'allowFrom': allow_from
        }
        print(f'  Added Slack account: {name}')

if accounts:
    config['channels'] = {'slack': {'enabled': True, 'accounts': accounts}}
    config['bindings'] = [
        {'agentId': name, 'match': {'channel': 'slack', 'accountId': name}}
        for name in accounts
    ]
    config['plugins'] = {'entries': {'slack': {'enabled': True}}}

    # Explicitly remove any "default" account the inner entrypoint may have created
    if 'default' in config.get('channels', {}).get('slack', {}).get('accounts', {}):
        del config['channels']['slack']['accounts']['default']
        print('  Cleaned up stale "default" account')

    with open(conf_path, 'w') as f:
        json.dump(config, f, indent=2)
    print(f'Injected {len(accounts)} Slack accounts + bindings')
else:
    print('WARNING: No valid Slack tokens found')
INJECT_PYEOF

  # ============================================================
  # GATEWAY RESTART
  # Kill the initial gateway and restart with injected config.
  # IMPORTANT: Only restart the gateway process â do NOT re-run
  # the full inner entrypoint (/entrypoint.sh). All one-time
  # setup (mcporter config, auth-profiles, gh CLI auth, workspace
  # files) was completed during the first run.
  # ============================================================
  echo "Restarting gateway to apply channel config..."
  kill -- -$GATEWAY_PID 2>/dev/null || kill $GATEWAY_PID 2>/dev/null || true
  sleep 3

  # Normalize config after channel injection (fixes schema drift
  # like "Moved channels.slack single-account top-level values")
  echo "Running openclaw doctor --fix to normalize config..."
  openclaw doctor --fix 2>/dev/null || true

  # Authenticate gh CLI with the GitHub App installation token
  if command -v gh &> /dev/null && [ -n "${GITHUB_TOKEN:-}" ]; then
    echo "${GITHUB_TOKEN}" | gh auth login --with-token 2>/dev/null || true
    # Persist to hosts.yml so ALL processes can authenticate with gh,
    # not just those inheriting PID 1's GITHUB_TOKEN env var.
    mkdir -p /root/.config/gh
    cat > /root/.config/gh/hosts.yml <<GHEOF
github.com:
    oauth_token: ${GITHUB_TOKEN}
    user: lmntl-agents[bot]
    git_protocol: https
GHEOF
    echo "gh CLI authenticated with GitHub App token"
  fi

  # ============================================================
  # WORKSPACE FILE INJECTION (must happen BEFORE gateway restart)
  # OpenClaw's virtual FS snapshots workspace contents at gateway
  # startup. Files placed after the gateway starts may not appear
  # in the agent's virtual workspace view.
  #
  # Two workspace paths per agent:
  #   CFG  = /root/.openclaw/agents/{agent}/workspace  (configured â agent reads/writes here)
  #   PERSIST = /root/.openclaw/.openclaw/workspace-{agent}  (bind-mounted â survives restarts)
  # Strategy:
  #   IDENTITY.md  â always copy from git to CFG (deploy may update instructions)
  #   KNOWLEDGE.md â seed PERSIST from git if missing, then copy PERSIST â CFG
  # Note: symlinks don't work â OpenClaw virtual FS doesn't resolve them.
  # ============================================================
  echo "Injecting workspace files into agent workspaces..."
  for agent in scout trak kit; do
    SRC="/tmp/agents/${agent}/workspace"
    CFG="/root/.openclaw/agents/${agent}/workspace"
    PERSIST="/root/.openclaw/.openclaw/workspace-${agent}"

    mkdir -p "$CFG" "$PERSIST"

    # IDENTITY.md: always overwrite from git (instructions may change per deploy)
    # Must copy to BOTH paths â OpenClaw reads from PERSIST (runtime workspace),
    # not CFG (configured workspace). CFG copy is kept for consistency.
    if [ -f "$SRC/IDENTITY.md" ]; then
      cp "$SRC/IDENTITY.md" "$CFG/IDENTITY.md"
      cp "$SRC/IDENTITY.md" "$PERSIST/IDENTITY.md"
      echo "  ${agent}: IDENTITY.md updated (cfg + persist)"
    fi

    # KNOWLEDGE.md: seed persist dir from git if it doesn't exist yet
    if [ ! -f "$PERSIST/KNOWLEDGE.md" ] && [ -f "$SRC/KNOWLEDGE.md" ]; then
      cp "$SRC/KNOWLEDGE.md" "$PERSIST/KNOWLEDGE.md"
      echo "  ${agent}: KNOWLEDGE.md seeded to persist"
    fi

    # Copy KNOWLEDGE.md from persist dir to configured workspace
    # (symlinks don't work â OpenClaw virtual FS doesn't resolve them)
    if [ -f "$PERSIST/KNOWLEDGE.md" ]; then
      cp "$PERSIST/KNOWLEDGE.md" "$CFG/KNOWLEDGE.md"
      echo "  ${agent}: KNOWLEDGE.md copied from persist to cfg"
    fi
  done

  # ============================================================
  # MEMORY INDEXING
  # The memory system indexes $OPENCLAW_HOME/.openclaw/workspace/
  # (the main workspace) by default. Agent KNOWLEDGE.md files live
  # in per-agent workspace dirs (workspace-{agent}/) so we copy
  # them into the main workspace with agent-prefixed names so the
  # FTS index can find them.
  # ============================================================
  echo "Populating main workspace for memory indexing..."
  MAIN_WS="/root/.openclaw/.openclaw/workspace"
  mkdir -p "$MAIN_WS/memory"
  for agent in scout trak kit; do
    PERSIST="/root/.openclaw/.openclaw/workspace-${agent}"
    if [ -f "$PERSIST/KNOWLEDGE.md" ]; then
      cp "$PERSIST/KNOWLEDGE.md" "$MAIN_WS/memory/KNOWLEDGE-${agent}.md"
      echo "  ${agent}: KNOWLEDGE.md copied to main workspace/memory/"
    fi
  done

  # Rebuild memory index so FTS can search agent knowledge
  echo "Rebuilding memory index..."
  openclaw memory index --force 2>/dev/null || true
  echo "Memory index updated."

  # Start gateway DIRECTLY â one-time setup is already done
  # Workspace files are in place so the gateway discovers them on scan
  echo "Starting gateway with injected channel config..."
  openclaw gateway run --allow-unconfigured 2>&1 | tee -a /data/logs/openclaw.log &
  GATEWAY_PID=$!

  # Verify gateway started (lightweight liveness check)
  sleep 5
  if kill -0 $GATEWAY_PID 2>/dev/null; then
    echo "Gateway is running (PID $GATEWAY_PID)."

    # Start background GitHub App token refresh (tokens expire after 1hr)
    /app/scripts/github-token-refresh.sh &
    echo "GitHub token refresh loop started in background."
  else
    echo "ERROR: Gateway process died. Check /data/logs/openclaw.log"
    exit 1
  fi

  # ============================================================
  # AGENT BOOTSTRAP
  # MCP tools load on-demand when an agent first requests them.
  # We trigger a lightweight agent turn so that tools (Jira,
  # Zendesk, Notion, GitHub) are warmed up BEFORE any real user
  # message arrives. This eliminates cold-start latency for the
  # first human interaction.
  # ============================================================
  echo "Bootstrapping agents (warming MCP tools)..."

  # Give Slack socket-mode connections time to establish
  sleep 10

  # Fire a bootstrap turn through the gateway. The agent will
  # enumerate its tools during the turn, forcing the gateway to
  # start all configured MCP servers.
  BOOTSTRAP_RESP=$(openclaw agent --agent main \
    --message "Bootstrap health check. List every MCP tool name you have access to, one per line. Then say BOOTSTRAP_OK." \
    --timeout 90 2>&1) || true

  if echo "$BOOTSTRAP_RESP" | grep -q "BOOTSTRAP_OK"; then
    echo "Agent bootstrap succeeded â MCP tools are warm."
    # Count tools mentioned in response (rough heuristic)
    TOOL_COUNT=$(echo "$BOOTSTRAP_RESP" | grep -c "name" 2>/dev/null || echo "?")
    echo "  Tools loaded: ~${TOOL_COUNT}"
  else
    # Non-fatal: agents will still work, just with cold-start on first message
    echo "WARNING: Agent bootstrap did not confirm. Tools may load on first user message."
    echo "  Response (last 200 chars): $(echo "$BOOTSTRAP_RESP" | tail -c 200)"
  fi

  echo "OpenClaw gateway is live."
  wait $GATEWAY_PID
else
  echo "WARNING: Gateway config not found after 90s"
  wait $GATEWAY_PID
fi
