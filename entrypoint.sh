#!/bin/bash
export PATH="$PATH:/home/openclaw/.openclaw/bin:/home/openclaw/.local/bin:/usr/bin"
set -euo pipefail

# ── Retry helper ──────────────────────────────────────────────
aws_retry() {
  local max_attempts=3
  local delay=5
  local attempt=1
  local output
  while [ $attempt -le $max_attempts ]; do
    if output=$(eval "$@" 2>&1); then
      echo "$output"
      return 0
    fi
    echo "WARN: AWS call failed (attempt $attempt/$max_attempts): $output" >&2
    sleep $delay
    delay=$((delay * 2))
    attempt=$((attempt + 1))
  done
  echo "FATAL: AWS call failed after $max_attempts attempts" >&2
  return 1
}

# ── Validate a Slack token format ──────────────────────────────
validate_token() {
  local name="$1" value="$2" prefix="$3"
  if [ -z "$value" ] || [ "$value" = "null" ]; then
    echo "FATAL: $name is empty or null" >&2
    return 1
  fi
  if [[ ! "$value" =~ ^${prefix}- ]]; then
    echo "FATAL: $name does not start with expected prefix '${prefix}-'" >&2
    return 1
  fi
  return 0
}

# Fetch secrets from AWS Secrets Manager
SECRET=$(aws_retry 'aws secretsmanager get-secret-value --secret-id openclaw/agents --region us-east-1 --query SecretString --output text')
if ! echo "$SECRET" | jq empty 2>/dev/null; then
  echo "FATAL: Secret value is not valid JSON" >&2
  exit 1
fi
echo "Secrets fetched and validated as JSON."
export SLACK_BOT_TOKEN_SCOUT=$(echo "$SECRET" | jq -r .SLACK_BOT_TOKEN_SCOUT)
export SLACK_APP_TOKEN_SCOUT=$(echo "$SECRET" | jq -r .SLACK_APP_TOKEN_SCOUT)
export SLACK_BOT_TOKEN_TRAK=$(echo "$SECRET" | jq -r .SLACK_BOT_TOKEN_TRAK)
export SLACK_APP_TOKEN_TRAK=$(echo "$SECRET" | jq -r .SLACK_APP_TOKEN_TRAK)
export SLACK_BOT_TOKEN_KIT=$(echo "$SECRET" | jq -r .SLACK_BOT_TOKEN_KIT)
export SLACK_APP_TOKEN_KIT=$(echo "$SECRET" | jq -r .SLACK_APP_TOKEN_KIT)

export SLACK_BOT_TOKEN_SCRIBE=$(echo "$SECRET" | jq -r '.SLACK_BOT_TOKEN_SCRIBE // empty')
export SLACK_APP_TOKEN_SCRIBE=$(echo "$SECRET" | jq -r '.SLACK_APP_TOKEN_SCRIBE // empty')
export SLACK_BOT_TOKEN_PROBE=$(echo "$SECRET" | jq -r '.SLACK_BOT_TOKEN_PROBE // empty')
export SLACK_APP_TOKEN_PROBE=$(echo "$SECRET" | jq -r '.SLACK_APP_TOKEN_PROBE // empty')

# ── Validate critical Slack tokens ────────────────────────────
echo "Validating Slack tokens..."
for agent in SCOUT TRAK KIT; do
  bot_var="SLACK_BOT_TOKEN_${agent}"
  app_var="SLACK_APP_TOKEN_${agent}"
  validate_token "$bot_var" "${!bot_var}" "xoxb" || exit 1
  validate_token "$app_var" "${!app_var}" "xapp" || exit 1
done
# Scribe and Probe are newer — warn but don't block startup
for agent in SCRIBE PROBE; do
  bot_var="SLACK_BOT_TOKEN_${agent}"
  app_var="SLACK_APP_TOKEN_${agent}"
  if [ -n "${!bot_var}" ] && [ "${!bot_var}" != "null" ]; then
    validate_token "$bot_var" "${!bot_var}" "xoxb" || echo "WARN: $bot_var has invalid format (non-fatal)"
    validate_token "$app_var" "${!app_var}" "xapp" || echo "WARN: $app_var has invalid format (non-fatal)"
  else
    echo "INFO: $agent tokens not configured (optional)"
  fi
done
echo "Token validation complete."

export ATLASSIAN_SITE_NAME=$(echo "$SECRET" | jq -r .ATLASSIAN_SITE_NAME)
export ATLASSIAN_USER_EMAIL=$(echo "$SECRET" | jq -r .ATLASSIAN_USER_EMAIL)
export ATLASSIAN_API_TOKEN=$(echo "$SECRET" | jq -r .ATLASSIAN_API_TOKEN)

# Derived Jira env vars (backward compat only)
export JIRA_BASE_URL="https://${ATLASSIAN_SITE_NAME}.atlassian.net"
export JIRA_USER_EMAIL="${ATLASSIAN_USER_EMAIL}"
export JIRA_API_TOKEN="${ATLASSIAN_API_TOKEN}"
# GitHub App token (replaces static PAT)
export GH_APP_ID=$(aws_retry 'aws ssm get-parameter --name /openclaw/github-app/app-id --region us-east-1 --query Parameter.Value --output text')
export GH_APP_INSTALLATION_ID=$(aws_retry 'aws ssm get-parameter --name /openclaw/github-app/installation-id --region us-east-1 --query Parameter.Value --output text')
GH_APP_PRIVATE_KEY=$(aws_retry 'aws ssm get-parameter --name /openclaw/github-app/private-key --region us-east-1 --with-decryption --query Parameter.Value --output text')
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
if [ -z "$ANTHROPIC_API_KEY" ] || [ "$ANTHROPIC_API_KEY" = "null" ]; then
  echo "FATAL: ANTHROPIC_API_KEY not found in Secrets Manager secret" >&2
  exit 1
fi

# Generate HMAC signing key for cross-agent handoff authentication
# Derived from API key hash so it's deterministic across restarts without needing another secret
export HANDOFF_HMAC_KEY=$(echo -n "openclaw-handoff-${ANTHROPIC_API_KEY}" | sha256sum | cut -d' ' -f1)
if [ -z "$HANDOFF_HMAC_KEY" ] || [ ${#HANDOFF_HMAC_KEY} -ne 64 ]; then
  echo "FATAL: HANDOFF_HMAC_KEY derivation failed (expected 64-char SHA256)" >&2
  exit 1
fi
echo "Handoff HMAC key derived and validated."

# Start inner entrypoint (which starts the gateway) in background
"$@" &
GATEWAY_PID=$!

# Wait for gateway to create its config file
# Inner entrypoint installs mcporter + gh CLI which does Zoho setup, zd-mcp-server patching, MCP config etc.
# which can take 90-120s before the gateway starts and writes its config.
CONF="/home/openclaw/.openclaw/.openclaw/openclaw.json"
echo "Waiting for gateway config..."
for i in $(seq 1 180); do
  [ -f "$CONF" ] && break
  sleep 1
done

if [ -f "$CONF" ]; then
  echo "Gateway config found, injecting Slack channels..."
  python3 << 'INJECT_PYEOF'
import json, os

conf_path = '/home/openclaw/.openclaw/.openclaw/openclaw.json'
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
    ('scribe', 'SLACK_BOT_TOKEN_SCRIBE', 'SLACK_APP_TOKEN_SCRIBE'),
    ('probe', 'SLACK_BOT_TOKEN_PROBE', 'SLACK_APP_TOKEN_PROBE'),
]:
    bot = os.environ.get(bk, '')
    app = os.environ.get(ak, '')
    if bot and app and bot != 'null' and app != 'null':
        accounts[name] = {
            'mode': 'socket',
            'enabled': True,
            'botToken': bot,
            'appToken': app,
            'streaming': 'off',
            'nativeStreaming': False,
            'dmPolicy': 'allowlist',
            'groupPolicy': 'open',
            'requireMention': True,
            'allowBots': True,
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
  # LOGROTATE CRON SETUP
  # Ensure logrotate runs daily inside the container for /data/logs
  # and on the host for /opt/openclaw/logs (via healthcheck/setup script)
  # ============================================================
  echo "Setting up logrotate cron for log file rotation..."
  # Use || true to handle fresh containers with no existing crontab
  # (crontab -l exits 1 when no crontab exists, which kills the script under set -euo pipefail)
  EXISTING_CRON=$(crontab -l 2>/dev/null | grep -v logrotate || true)
  echo "${EXISTING_CRON}
0 0 * * * /usr/sbin/logrotate /etc/logrotate.conf --state /tmp/logrotate.state" | sort -u | crontab -
  echo "Logrotate cron installed."

  # ============================================================
  # GATEWAY RESTART
  # Kill the initial gateway and restart with injected config.
  # IMPORTANT: Only restart the gateway process â do NOT re-run
  # the full inner entrypoint (/entrypoint.sh). All one-time
  # setup (mcporter config, auth-profiles, gh CLI auth, workspace
  # files) was completed during the first run.
  # ============================================================
  echo "Restarting gateway to apply injected Slack channel config..."
  echo "  (This is expected: initial gateway generated config, now restarting with channels injected)"
  kill -- -$GATEWAY_PID 2>/dev/null || kill $GATEWAY_PID 2>/dev/null || true
  sleep 3

  # Normalize config after channel injection (fixes schema drift
  # like "Moved channels.slack single-account top-level values")
  echo "Running openclaw doctor --fix to normalize config..."
  openclaw doctor --fix 2>/dev/null || true

  # Fix config ownership: outer entrypoint runs as root, but OpenClaw
  # expects its config to be owned by UID 1000 (openclaw). Without this,
  # the restarted gateway gets EACCES reading its own config file.
  chown -R openclaw:openclaw /home/openclaw/.openclaw 2>/dev/null || true

  # Authenticate gh CLI with the GitHub App installation token
  if command -v gh &> /dev/null && [ -n "${GITHUB_TOKEN:-}" ]; then
    echo "${GITHUB_TOKEN}" | gh auth login --with-token 2>/dev/null || true

    # Write hosts.yml to BOTH user homes (gateway may run as root or openclaw)
    for GH_DIR in /home/openclaw/.config/gh /root/.config/gh; do
      mkdir -p "$GH_DIR"
      cat > "$GH_DIR/hosts.yml" <<GHEOF
github.com:
    oauth_token: ${GITHUB_TOKEN}
    user: lmntl-agents[bot]
    git_protocol: https
GHEOF
    done

    # Write token to shared file for the gh wrapper.
    # rm -f first: on container restart the writable layer persists and
    # the old file (mode 600, different owner) blocks the redirect.
    rm -f /tmp/.github-token /tmp/.github-token-expires 2>/dev/null || true
    (umask 077 && echo "$GITHUB_TOKEN" > /tmp/.github-token) || true
    echo $(( $(date +%s) + 3600 )) > /tmp/.github-token-expires 2>/dev/null || true
    chown openclaw:openclaw /tmp/.github-token /tmp/.github-token-expires 2>/dev/null || true

    echo "gh CLI authenticated with GitHub App token"
  fi

  # ============================================================
  # GH WRAPPER: Ensure agents always get a fresh token
  # Agent processes run in sandboxed environments where HOME may
  # differ from /root or /home/openclaw, so hosts.yml isn't found.
  # The wrapper reads the latest token from /tmp/.github-token
  # (updated every 50 min by the refresh loop) and sets GH_TOKEN
  # before calling the real gh binary.
  #
  # GH_TOKEN is checked FIRST by gh CLI (before GITHUB_TOKEN and
  # hosts.yml), so the wrapper always wins.
  # ============================================================
  GH_REAL=$(command -v gh 2>/dev/null || echo "")
  if [ -n "$GH_REAL" ]; then
    # If gh is already at /usr/local/bin, move it so wrapper can take its place
    if [ "$GH_REAL" = "/usr/local/bin/gh" ]; then
      mv /usr/local/bin/gh /usr/local/bin/gh.real
      GH_REAL="/usr/local/bin/gh.real"
    fi
    mkdir -p /usr/local/bin
    cat > /usr/local/bin/gh <<WRAPPER_EOF
#!/bin/bash
# gh wrapper: reads latest GitHub App token from the refresh loop's
# shared file so agents in sandboxed environments always authenticate.
# Fallback: if token file doesn't exist yet (during startup), wait
# briefly for the refresh loop to populate it, then fall through to
# hosts.yml which is set during bootstrap.
if [ -f /tmp/.github-token ] && [ -s /tmp/.github-token ]; then
  export GH_TOKEN=\$(cat /tmp/.github-token)
else
  for _w in 1 2 3 4 5; do
    [ -f /tmp/.github-token ] && [ -s /tmp/.github-token ] && break
    sleep 1
  done
  if [ -f /tmp/.github-token ] && [ -s /tmp/.github-token ]; then
    export GH_TOKEN=\$(cat /tmp/.github-token)
  fi
  # If still missing, gh falls back to ~/.config/gh/hosts.yml
fi
exec ${GH_REAL} "\$@"
WRAPPER_EOF
    chmod +x /usr/local/bin/gh
    echo "gh wrapper installed at /usr/local/bin/gh (delegates to ${GH_REAL})"
  fi

  # ============================================================
  # WORKSPACE FILE INJECTION (must happen BEFORE gateway restart)
  # OpenClaw's virtual FS snapshots workspace contents at gateway
  # startup. Files placed after the gateway starts may not appear
  # in the agent's virtual workspace view.
  #
  # Two workspace paths per agent:
  #   CFG  = /home/openclaw/.openclaw/agents/{agent}/workspace  (configured â agent reads/writes here)
  #   PERSIST = /home/openclaw/.openclaw/.openclaw/workspace-{agent}  (bind-mounted â survives restarts)
  # Strategy:
  #   IDENTITY.md  â always copy from git to CFG (deploy may update instructions)
  #   KNOWLEDGE.md â seed PERSIST from git if missing, then copy PERSIST â CFG
  # Note: symlinks don't work â OpenClaw virtual FS doesn't resolve them.
  # ============================================================
  echo "Injecting workspace files into agent workspaces..."
  for agent in scout trak kit scribe probe; do
    SRC="/tmp/agents/${agent}/workspace"
    CFG="/home/openclaw/.openclaw/agents/${agent}/workspace"
    PERSIST="/home/openclaw/.openclaw/.openclaw/workspace-${agent}"

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
  # SECURITY CONFIG INJECTION
  # Copy user-tiers and dangerous-actions configs into each
  # agent's workspace so they can enforce RBAC and action guards.
  # Dot-prefixed to avoid cluttering the agent's visible workspace.
  # ============================================================
  echo "Injecting security configs into agent workspaces..."
  for agent in scout trak kit scribe probe; do
    CFG="/home/openclaw/.openclaw/agents/${agent}/workspace"
    PERSIST="/home/openclaw/.openclaw/.openclaw/workspace-${agent}"
    for target_dir in "$CFG" "$PERSIST"; do
      if [ -d "$target_dir" ]; then
        cp /app/config/user-tiers.json "$target_dir/.user-tiers.json" 2>/dev/null || true
        cp /app/config/dangerous-actions.json "$target_dir/.dangerous-actions.json" 2>/dev/null || true
      fi
    done
    echo "  ${agent}: security configs injected"
  done

  # ============================================================
  # PROACTIVE CAPABILITIES CONFIG INJECTION
  # Copy budget caps and handoff protocol configs into each
  # agent workspace for proactive capability governance.
  # ============================================================
  echo "Injecting proactive capability configs into agent workspaces..."
  for agent in scout trak kit scribe probe; do
    CFG="/home/openclaw/.openclaw/agents/${agent}/workspace"
    PERSIST="/home/openclaw/.openclaw/.openclaw/workspace-${agent}"
    for target_dir in "$CFG" "$PERSIST"; do
      if [ -d "$target_dir" ]; then
        cp /app/config/proactive/budget-caps.json "$target_dir/.budget-caps.json" 2>/dev/null || true
        cp /app/config/proactive/handoff-protocol.json "$target_dir/.handoff-protocol.json" 2>/dev/null || true
      fi
    done
    echo "  ${agent}: proactive configs injected"
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
  MAIN_WS="/home/openclaw/.openclaw/.openclaw/workspace"
  mkdir -p "$MAIN_WS/memory"
  for agent in scout trak kit scribe probe; do
    PERSIST="/home/openclaw/.openclaw/.openclaw/workspace-${agent}"
    if [ -f "$PERSIST/KNOWLEDGE.md" ]; then
      cp "$PERSIST/KNOWLEDGE.md" "$MAIN_WS/memory/KNOWLEDGE-${agent}.md"
      echo "  ${agent}: KNOWLEDGE.md copied to main workspace/memory/"
    fi
  done

  # Rebuild memory index so FTS can search agent knowledge
  echo "Rebuilding memory index..."
  openclaw memory index --force 2>/dev/null || true
  echo "Memory index updated."

  # ============================================================
  # GITHUB TOKEN: UNSET ENV VAR BEFORE GATEWAY START
  # GitHub App installation tokens expire after 1 hour. The
  # background token refresh loop generates new tokens every
  # 50 min and writes them to ~/.config/gh/hosts.yml.
  #
  # CRITICAL: gh CLI checks GITHUB_TOKEN env var BEFORE hosts.yml.
  # If the gateway process has GITHUB_TOKEN in its env, agents
  # inherit the original (now-expired) token via subprocess env,
  # and gh ignores the fresh token in hosts.yml.
  #
  # Fix: unset GITHUB_TOKEN so gh always reads from hosts.yml,
  # which the refresh loop keeps current. Token can never expire.
  # ============================================================
  echo "Unsetting GITHUB_TOKEN env var (gh will read from hosts.yml, kept fresh by refresh loop)..."
  unset GITHUB_TOKEN

  # Start gateway DIRECTLY â one-time setup is already done
  # Workspace files are in place so the gateway discovers them on scan
  echo "Starting gateway with injected channel config..."
  openclaw gateway run --allow-unconfigured >> /data/logs/openclaw.log 2>&1 &
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
  BOOTSTRAP_RESP=""
  for BOOT_ATTEMPT in 1 2; do
    echo "  Bootstrap attempt ${BOOT_ATTEMPT}/2..."
    BOOTSTRAP_RESP=$(openclaw agent --agent main \
      --message "Bootstrap health check. List every MCP tool name you have access to, one per line. Then say BOOTSTRAP_OK." \
      --timeout 120 2>&1) || true

    if echo "$BOOTSTRAP_RESP" | grep -q "BOOTSTRAP_OK"; then
      break
    elif [ "$BOOT_ATTEMPT" -eq 1 ]; then
      echo "  First attempt did not confirm, retrying in 10s..."
      sleep 10
    fi
  done

  if echo "$BOOTSTRAP_RESP" | grep -q "BOOTSTRAP_OK"; then
    echo "Agent bootstrap succeeded â MCP tools confirmed warm."
  else
    # Non-fatal: agents will still work, just with cold-start on first message
    echo "WARNING: Agent bootstrap did not confirm after 2 attempts."
    echo "  Tools will load on first user message (this is OK but adds latency)."
    echo "  Last 200 chars of response: $(echo "$BOOTSTRAP_RESP" | tail -c 200)"
  fi

  echo "OpenClaw gateway is live."
  wait $GATEWAY_PID
else
  echo "WARNING: Gateway config not found after 180s"
  wait $GATEWAY_PID
fi
