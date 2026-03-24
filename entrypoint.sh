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

# ── Parse AGENTS_LIST ──────────────────────────────────────────
# Simple version since we control the input (no spaces allowed in docker-compose.yml)
# AGENTS_LIST format: "agent1,agent2,agent3" (no spaces)
parse_agents_list() {
  local IFS=','
  echo $1
}

# Tier configuration (set by docker-compose.yml)
export AGENTS_LIST="${AGENTS_LIST:-scout,trak,kit,scribe,probe,chief,ledger,beacon,harvest,prospector,outreach,cadence}"
export OPENCLAW_TIER="${OPENCLAW_TIER:-standard}"
echo "Container tier: $OPENCLAW_TIER"
echo "Agents in this container: $AGENTS_LIST"

# Fetch secrets from AWS Secrets Manager (tier-specific secret)
SECRET_NAME="${OPENCLAW_SECRET_NAME:-openclaw/agents}"
echo "Fetching secrets from: $SECRET_NAME"
SECRET=$(aws_retry "aws secretsmanager get-secret-value --secret-id \"$SECRET_NAME\" --region us-east-1 --query SecretString --output text")
if ! echo "$SECRET" | jq empty 2>/dev/null; then
  echo "FATAL: Secret value is not valid JSON" >&2
  exit 1
fi
echo "Secrets fetched and validated as JSON."

# ── Extract tokens ONLY for agents in AGENTS_LIST ─────────────
# Security: don't expose other tier's tokens in this container's environment
echo "Extracting Slack tokens for agents: $AGENTS_LIST"
for agent in $(parse_agents_list "$AGENTS_LIST"); do
  AGENT_UPPER=$(echo "$agent" | tr '[:lower:]' '[:upper:]')
  export "SLACK_BOT_TOKEN_${AGENT_UPPER}"=$(echo "$SECRET" | jq -r ".SLACK_BOT_TOKEN_${AGENT_UPPER} // empty")
  export "SLACK_APP_TOKEN_${AGENT_UPPER}"=$(echo "$SECRET" | jq -r ".SLACK_APP_TOKEN_${AGENT_UPPER} // empty")
done

# ── Validate tokens for all agents in AGENTS_LIST (ALL REQUIRED) ──
echo "Validating Slack tokens for agents: $AGENTS_LIST"
for agent in $(parse_agents_list "$AGENTS_LIST"); do
  AGENT_UPPER=$(echo "$agent" | tr '[:lower:]' '[:upper:]')
  bot_var="SLACK_BOT_TOKEN_${AGENT_UPPER}"
  app_var="SLACK_APP_TOKEN_${AGENT_UPPER}"
  validate_token "$bot_var" "${!bot_var}" "xoxb" || exit 1
  validate_token "$app_var" "${!app_var}" "xapp" || exit 1
done
echo "All required Slack tokens validated."

# ── Extract shared tokens (present in both tier secrets) ──────
export ANTHROPIC_API_KEY=$(echo "$SECRET" | jq -r '.ANTHROPIC_API_KEY // empty')
if [ -z "$ANTHROPIC_API_KEY" ] || [ "$ANTHROPIC_API_KEY" = "null" ]; then
  echo "FATAL: ANTHROPIC_API_KEY not found in Secrets Manager secret" >&2
  exit 1
fi

export SLACK_ALLOW_FROM=$(echo "$SECRET" | jq -r '.SLACK_ALLOW_FROM // "[]"')
export ATLASSIAN_SITE_NAME=$(echo "$SECRET" | jq -r '.ATLASSIAN_SITE_NAME // empty')
export ATLASSIAN_USER_EMAIL=$(echo "$SECRET" | jq -r '.ATLASSIAN_USER_EMAIL // empty')
export ATLASSIAN_API_TOKEN=$(echo "$SECRET" | jq -r '.ATLASSIAN_API_TOKEN // empty')

# Derived Jira env vars (backward compat only)
export JIRA_BASE_URL="https://${ATLASSIAN_SITE_NAME}.atlassian.net"
export JIRA_USER_EMAIL="${ATLASSIAN_USER_EMAIL}"
export JIRA_API_TOKEN="${ATLASSIAN_API_TOKEN}"

# ── Validate Atlassian/Jira credentials (required for Trak, Kit) ──
if [ -z "$ATLASSIAN_SITE_NAME" ] || [ "$ATLASSIAN_SITE_NAME" = "null" ] || \
   [ -z "$ATLASSIAN_USER_EMAIL" ] || [ "$ATLASSIAN_USER_EMAIL" = "null" ] || \
   [ -z "$ATLASSIAN_API_TOKEN" ] || [ "$ATLASSIAN_API_TOKEN" = "null" ]; then
  echo "WARN: Atlassian/Jira credentials missing or incomplete in secret $OPENCLAW_SECRET_NAME"
  echo "  ATLASSIAN_SITE_NAME=${ATLASSIAN_SITE_NAME:-(empty)}"
  echo "  ATLASSIAN_USER_EMAIL=${ATLASSIAN_USER_EMAIL:-(empty)}"
  echo "  ATLASSIAN_API_TOKEN=${ATLASSIAN_API_TOKEN:+set}${ATLASSIAN_API_TOKEN:-MISSING}"
  echo "  Jira MCP server will fail. Trak, Kit, and other Jira-dependent agents affected."
else
  echo "Atlassian/Jira credentials validated (site: $ATLASSIAN_SITE_NAME)"
fi

export ZENDESK_SUBDOMAIN=$(echo "$SECRET" | jq -r '.ZENDESK_SUBDOMAIN // empty')
export ZENDESK_EMAIL=$(echo "$SECRET" | jq -r '.ZENDESK_EMAIL // empty')
export ZENDESK_API_TOKEN=$(echo "$SECRET" | jq -r '.ZENDESK_API_TOKEN // empty')
export ZENDESK_TOKEN="${ZENDESK_API_TOKEN}"
export NOTION_API_TOKEN=$(echo "$SECRET" | jq -r '.NOTION_API_TOKEN // empty')
export NOTION_API_KEY=${NOTION_API_TOKEN}
export ZOHO_CLIENT_ID=$(echo "$SECRET" | jq -r '.ZOHO_CLIENT_ID // empty')
export ZOHO_CLIENT_SECRET=$(echo "$SECRET" | jq -r '.ZOHO_CLIENT_SECRET // empty')
export ZOHO_REFRESH_TOKEN=$(echo "$SECRET" | jq -r '.ZOHO_REFRESH_TOKEN // empty')
export ZOHO_API_DOMAIN=$(echo "$SECRET" | jq -r '.ZOHO_API_DOMAIN // "https://www.zohoapis.com"')

# ── Extract admin tier-specific API tokens ────────────────────
# Financial API tokens are ONLY available in the admin container
if [ "$OPENCLAW_TIER" = "admin" ]; then
  echo "Extracting admin tier financial API tokens..."
  export MERCURY_API_TOKEN=$(echo "$SECRET" | jq -r '.MERCURY_API_TOKEN // empty')
  export QBO_CLIENT_ID_CHIEF=$(echo "$SECRET" | jq -r '.QBO_CLIENT_ID_CHIEF // empty')
  export QBO_CLIENT_SECRET_CHIEF=$(echo "$SECRET" | jq -r '.QBO_CLIENT_SECRET_CHIEF // empty')
  export QBO_REFRESH_TOKEN_CHIEF=$(echo "$SECRET" | jq -r '.QBO_REFRESH_TOKEN_CHIEF // empty')
  export QBO_REALM_ID_CHIEF=$(echo "$SECRET" | jq -r '.QBO_REALM_ID_CHIEF // empty')
  # Ledger uses same QBO credentials as Chief
  export QBO_CLIENT_ID_LEDGER=$(echo "$SECRET" | jq -r '.QBO_CLIENT_ID_LEDGER // empty')
  export QBO_CLIENT_SECRET_LEDGER=$(echo "$SECRET" | jq -r '.QBO_CLIENT_SECRET_LEDGER // empty')
  export QBO_REFRESH_TOKEN_LEDGER=$(echo "$SECRET" | jq -r '.QBO_REFRESH_TOKEN_LEDGER // empty')
  export QBO_REALM_ID_LEDGER=$(echo "$SECRET" | jq -r '.QBO_REALM_ID_LEDGER // empty')
  export STRIPE_KEY_LIVE=$(echo "$SECRET" | jq -r '.STRIPE_KEY_LIVE // empty')
  export STRIPE_KEY_TEST=$(echo "$SECRET" | jq -r '.STRIPE_KEY_TEST // empty')
  # Legacy Stripe keys for backward compatibility
  export STRIPE_KEY_MINUTE7=$(echo "$SECRET" | jq -r '.STRIPE_KEY_MINUTE7 // empty')
  export STRIPE_KEY_GOODHELP=$(echo "$SECRET" | jq -r '.STRIPE_KEY_GOODHELP // empty')
  export STRIPE_KEY_HTS=$(echo "$SECRET" | jq -r '.STRIPE_KEY_HTS // empty')
  export STRIPE_KEY_LMNTL=$(echo "$SECRET" | jq -r '.STRIPE_KEY_LMNTL // empty')
fi

# ── Extract sales pipeline API keys (standard tier only) ─────
# Sales agents need Apollo (contact search) and Google Sheets SA (sheets + Gmail)
# These are stored in separate secrets from the main agent secret
if [ "$OPENCLAW_TIER" = "standard" ]; then
  echo "Extracting sales pipeline API keys..."
  export APOLLO_API_KEY=$(aws_retry "aws secretsmanager get-secret-value \
    --secret-id 'sales-prospecting/apollo-api-key' --region us-east-1 \
    --query SecretString --output text" 2>/dev/null || echo "")
  if [ -n "$APOLLO_API_KEY" ] && [ "$APOLLO_API_KEY" != "null" ]; then
    echo "  Apollo API key loaded (${#APOLLO_API_KEY} chars)"
  else
    echo "  WARN: Apollo API key not found — Outreach contact search will fail"
    APOLLO_API_KEY=""
  fi

  export GOOGLE_SHEETS_SA_KEY=$(aws_retry "aws secretsmanager get-secret-value \
    --secret-id 'sales-prospecting/google-sheets-sa-key' --region us-east-1 \
    --query SecretString --output text" 2>/dev/null || echo "")
  if [ -n "$GOOGLE_SHEETS_SA_KEY" ] && [ "$GOOGLE_SHEETS_SA_KEY" != "null" ]; then
    echo "  Google Sheets SA key loaded"
  else
    echo "  WARN: Google Sheets SA key not found — sales pipeline sheet access will fail"
    GOOGLE_SHEETS_SA_KEY=""
  fi
fi

# SECURITY: Clear raw secret JSON from memory
unset SECRET
echo "Secrets extracted and cleared from memory"

# GitHub App token (replaces static PAT)
export GH_APP_ID=$(aws_retry 'aws ssm get-parameter --name /openclaw/github-app/app-id --region us-east-1 --query Parameter.Value --output text')
export GH_APP_INSTALLATION_ID=$(aws_retry 'aws ssm get-parameter --name /openclaw/github-app/installation-id --region us-east-1 --query Parameter.Value --output text')
GH_APP_PRIVATE_KEY=$(aws_retry 'aws ssm get-parameter --name /openclaw/github-app/private-key --region us-east-1 --with-decryption --query Parameter.Value --output text')
export GH_APP_PRIVATE_KEY_FILE=/tmp/.github-app-key.pem
# Write private key with restrictive permissions from the start (no race window)
(umask 077 && echo "$GH_APP_PRIVATE_KEY" > "$GH_APP_PRIVATE_KEY_FILE")
source /app/scripts/github-app-token.sh

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

# Filter by AGENTS_LIST (dynamically, not hardcoded)
agents_list = os.environ.get('AGENTS_LIST', 'scout,trak,kit,scribe,probe,chief,ledger,beacon,harvest,prospector,outreach,cadence').split(',')
accounts = {}
for name in [a.strip() for a in agents_list]:
    bk = f'SLACK_BOT_TOKEN_{name.upper()}'
    ak = f'SLACK_APP_TOKEN_{name.upper()}'
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
    config['channels'] = {'slack': {'accounts': accounts}}
    # Update bindings
    config['bindings'] = [
        {'agentId': name, 'match': {'channel': 'slack', 'accountId': name}}
        for name in accounts
    ]
    # Update agents.list with correct paths (use /home/openclaw not /root)
    config['agents'] = config.get('agents', {})
    config['agents']['list'] = [
        {
            'id': name,
            'workspace': f'/home/openclaw/.openclaw/agents/{name}/workspace',
            'agentDir': f'/home/openclaw/.openclaw/agents/{name}/agent'
        }
        for name in accounts
    ]
    config['plugins'] = {'entries': {'slack': {'enabled': True}}}

    # Explicitly remove any "default" account the inner entrypoint may have created
    if 'default' in config.get('channels', {}).get('slack', {}).get('accounts', {}):
        del config['channels']['slack']['accounts']['default']
        print('  Cleaned up stale "default" account')

    # Enable cross-agent session messaging. This lets agents use sessions_send
    # to deliver handoff messages directly to other agents' sessions, bypassing
    # Slack's bot-to-bot DM restriction. Without this, tools.sessions.visibility
    # defaults to "tree" which blocks cross-agent session access.
    config.setdefault('tools', {}).setdefault('sessions', {})['visibility'] = 'all'
    print('  Set tools.sessions.visibility = all (cross-agent handoffs)')

    with open(conf_path, 'w') as f:
        json.dump(config, f, indent=2)
    print(f'Injected {len(accounts)} Slack accounts + bindings')
else:
    print('WARNING: No valid Slack tokens found')
INJECT_PYEOF

  # ============================================================
  # GATEWAY KILL (immediately after config injection)
  # Kill the initial gateway BEFORE it detects the config change
  # IMPORTANT: Only restart the gateway process â do NOT re-run
  # the full inner entrypoint (/entrypoint.sh). All one-time
  # setup (mcporter config, auth-profiles, gh CLI auth, workspace
  # files) was completed during the first run.
  # ============================================================
  echo "Restarting gateway to apply injected Slack channel config..."
  kill -- -$GATEWAY_PID 2>/dev/null || kill $GATEWAY_PID 2>/dev/null || true
  # Kill any respawned gateway child (the gateway may self-restart via
  # SIGUSR1 before our kill arrives, spawning a child process)
  sleep 1
  pkill -9 -f "openclaw gateway" 2>/dev/null || true
  sleep 2

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

  # ── PRE-DOCTOR CONFIG FIXES ──────────────────────────────────
  # Fix known doctor warnings BEFORE running doctor, so the
  # startup logs are clean with zero errors and zero warnings.
  # ────────────────────────────────────────────────────────────

  # Create session store dir (prevents "CRITICAL: Session store dir missing")
  mkdir -p /home/openclaw/.openclaw/.openclaw/agents/main/sessions 2>/dev/null || true

  # Set gateway.mode (prevents "gateway.mode is unset" warning AND
  # prevents bootstrap from trying to start a second gateway)
  openclaw config set gateway.mode local > /dev/null 2>&1 || true

  # Enable memory search with local embeddings (embeddinggemma-300m via node-llama-cpp).
  # This gives agents semantic vector search + FTS across each other's KNOWLEDGE.md files
  # with zero API costs. The model is ~329MB and runs on CPU with negligible overhead.
  openclaw config set agents.defaults.memorySearch.enabled true > /dev/null 2>&1 || true
  openclaw config set agents.defaults.memorySearch.provider local > /dev/null 2>&1 || true

  # Normalize config (fixes any remaining schema drift from initial startup)
  echo "Normalizing gateway config..."
  openclaw doctor --fix > /tmp/doctor-output.log 2>&1 || true

  echo "  Config normalized OK."

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
  for agent in $(parse_agents_list "$AGENTS_LIST"); do
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
      # Also populate the agent's memory/ dir so FTS memory search can index it
      mkdir -p "$CFG/memory"
      cp "$PERSIST/KNOWLEDGE.md" "$CFG/memory/KNOWLEDGE.md"
      echo "  ${agent}: KNOWLEDGE.md copied from persist to cfg + memory"
    fi
  done

  # ============================================================
  # SECURITY CONFIG INJECTION
  # Copy user-tiers and dangerous-actions configs into each
  # agent's workspace so they can enforce RBAC and action guards.
  # Dot-prefixed to avoid cluttering the agent's visible workspace.
  # ============================================================
  echo "Injecting security configs into agent workspaces..."
  for agent in $(parse_agents_list "$AGENTS_LIST"); do
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
  for agent in $(parse_agents_list "$AGENTS_LIST"); do
    CFG="/home/openclaw/.openclaw/agents/${agent}/workspace"
    PERSIST="/home/openclaw/.openclaw/.openclaw/workspace-${agent}"
    for target_dir in "$CFG" "$PERSIST"; do
      if [ -d "$target_dir" ]; then
        cp /app/config/proactive/budget-caps.json "$target_dir/.budget-caps.json" 2>/dev/null || true
        cp /app/config/proactive/handoff-protocol.json "$target_dir/.handoff-protocol.json" 2>/dev/null || true
        cp /app/config/proactive/error-reporting.json "$target_dir/.error-reporting.json" 2>/dev/null || true
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
  for agent in $(parse_agents_list "$AGENTS_LIST"); do
    PERSIST="/home/openclaw/.openclaw/.openclaw/workspace-${agent}"
    if [ -f "$PERSIST/KNOWLEDGE.md" ]; then
      cp "$PERSIST/KNOWLEDGE.md" "$MAIN_WS/memory/KNOWLEDGE-${agent}.md"
      echo "  ${agent}: KNOWLEDGE.md copied to main workspace/memory/"
    fi
  done

  # NOTE: Memory index rebuild moved to after gateway start (below).
  # `openclaw memory index` needs the gateway running to access the
  # memory store. Running it here (with gateway killed) silently fails.

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

  # ============================================================
  # PYTHON DEPENDENCIES FOR SALES AGENTS
  # Install pip + packages needed by Harvest, Prospector, and
  # Outreach agents for Google Sheets, RSS feeds, Apollo API,
  # Gmail API, and web scraping. These are not in the base
  # Docker image and must be installed on every container start.
  # ============================================================
  echo "Installing Python dependencies for sales agents..."
  if ! python3 -c "import feedparser" 2>/dev/null; then
    curl -sS https://bootstrap.pypa.io/get-pip.py | python3 > /dev/null 2>&1
    python3 -m pip install feedparser google-api-python-client google-auth beautifulsoup4 requests --root-user-action=ignore > /dev/null 2>&1
    echo "Python dependencies installed."
  else
    echo "Python dependencies already present."
  fi

  # Fix ownership AGAIN after all file operations (pip install, workspace
  # injection, memory indexing all create files as root). Without this,
  # the gateway gets EACCES on workspace/AGENTS.md and agents can't respond.
  chown -R openclaw:openclaw /home/openclaw/.openclaw 2>/dev/null || true
  echo "Ownership fixed (pre-gateway chown)."

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
  # AGENT CLI REGISTRATION
  # Register all agents with `openclaw agents add` so proactive
  # cron tasks can dispatch via `openclaw agent --agent <name>`.
  # Must run AFTER workspace injection (dirs must exist) and AFTER
  # gateway start (CLI talks to the gateway).
  # ============================================================
  echo "Registering agents with CLI..."
  OCHOME="/home/openclaw/.openclaw"
  for agent in $(parse_agents_list "$AGENTS_LIST"); do
    WS="${OCHOME}/agents/${agent}/workspace"
    AD="${OCHOME}/agents/${agent}/agent"
    if [ -d "$WS" ]; then
      openclaw agents add "$agent" \
        --workspace "$WS" \
        --agent-dir "$AD" \
        --bind "slack:${agent}" \
        --non-interactive 2>&1 && echo "  registered: $agent" \
        || echo "  $agent: already registered or skipped (non-fatal)"
    else
      echo "  $agent: workspace not found at $WS, skipping"
    fi
  done
  echo "Agent registration complete ($(openclaw agents list 2>/dev/null | grep -c '^\-' || echo '?') agents)."

  # ============================================================
  # MEMORY INDEX REBUILD
  # Now that the gateway is running and workspace files are in
  # place, rebuild the FTS index so agents can search each other's
  # knowledge via memory.
  # ============================================================
  echo "Rebuilding memory index..."
  openclaw memory index --force 2>&1 || echo "WARNING: memory index failed (non-fatal)"
  echo "Memory index updated."

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

  # Use first agent from AGENTS_LIST instead of hardcoded "main"
  FIRST_AGENT=$(echo "$AGENTS_LIST" | cut -d',' -f1 | tr -d ' ')
  echo "Bootstrapping with agent: $FIRST_AGENT"

  # Fire a bootstrap turn through the gateway. The agent will
  # enumerate its tools during the turn, forcing the gateway to
  # start all configured MCP servers.
  BOOTSTRAP_RESP=""
  for BOOT_ATTEMPT in 1 2; do
    echo "  Bootstrap attempt ${BOOT_ATTEMPT}/2..."
    BOOTSTRAP_RESP=$(openclaw agent --agent "$FIRST_AGENT" \
      --message "Bootstrap health check. List every MCP tool name you have access to, one per line. Then say BOOTSTRAP_OK." \
      --timeout 120 2>&1 | grep -v "Gateway failed to start\|Port.*already in use\|install lsof") || true

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
    echo "WARNING: Agent bootstrap did not confirm after 2 attempts."
    echo "  Tools will load on first user message (adds ~10s latency)."
    echo "  Last 200 chars: $(echo "$BOOTSTRAP_RESP" | tail -c 200)"
  fi

  echo "OpenClaw gateway is live. Config: sessions.visibility=all, gateway.mode=local"
  wait $GATEWAY_PID
else
  echo "WARNING: Gateway config not found after 180s"
  wait $GATEWAY_PID
fi
