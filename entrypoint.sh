#!/bin/bash
export PATH="$PATH:/root/.openclaw/bin:/root/.local/bin:/usr/bin"

# Fetch secrets from AWS Secrets Manager
SECRET=$(aws secretsmanager get-secret-value --secret-id openclaw/agents --region us-east-1 --query SecretString --output text)
export SLACK_BOT_TOKEN_SCOUT=$(echo $SECRET | jq -r .SLACK_BOT_TOKEN_SCOUT)
export SLACK_APP_TOKEN_SCOUT=$(echo $SECRET | jq -r .SLACK_APP_TOKEN_SCOUT)
export SLACK_BOT_TOKEN_TRAK=$(echo $SECRET | jq -r .SLACK_BOT_TOKEN_TRAK)
export SLACK_APP_TOKEN_TRAK=$(echo $SECRET | jq -r .SLACK_APP_TOKEN_TRAK)
export SLACK_BOT_TOKEN_KIT=$(echo $SECRET | jq -r .SLACK_BOT_TOKEN_KIT)
export SLACK_APP_TOKEN_KIT=$(echo $SECRET | jq -r .SLACK_APP_TOKEN_KIT)
export ATLASSIAN_SITE_NAME=$(echo $SECRET | jq -r .ATLASSIAN_SITE_NAME)
export ATLASSIAN_USER_EMAIL=$(echo $SECRET | jq -r .ATLASSIAN_USER_EMAIL)
export ATLASSIAN_API_TOKEN=$(echo $SECRET | jq -r .ATLASSIAN_API_TOKEN)

# Derived Jira env vars (backward compat only)
export JIRA_BASE_URL="https://${ATLASSIAN_SITE_NAME}.atlassian.net"
export JIRA_USER_EMAIL="${ATLASSIAN_USER_EMAIL}"
export JIRA_API_TOKEN="${ATLASSIAN_API_TOKEN}"
export GITHUB_TOKEN=$(echo $SECRET | jq -r .GITHUB_TOKEN)
export ZENDESK_SUBDOMAIN=$(echo $SECRET | jq -r .ZENDESK_SUBDOMAIN)
export ZENDESK_EMAIL=$(echo $SECRET | jq -r .ZENDESK_EMAIL)
export ZENDESK_API_TOKEN=$(echo $SECRET | jq -r .ZENDESK_API_TOKEN)
export ZENDESK_TOKEN="${ZENDESK_API_TOKEN}"
export NOTION_API_TOKEN=$(echo $SECRET | jq -r .NOTION_API_TOKEN)
export NOTION_API_KEY=${NOTION_API_TOKEN}
export SLACK_ALLOW_FROM=$(echo $SECRET | jq -r .SLACK_ALLOW_FROM)
export ANTHROPIC_API_KEY=$(echo $SECRET | jq -r .ANTHROPIC_API_KEY)

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
            'streaming': 'partial',
            'nativeStreaming': True,
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

  # Restart gateway to pick up new config
  echo "Restarting gateway to apply channel config..."
  openclaw gateway stop 2>/dev/null || true
  kill $GATEWAY_PID 2>/dev/null || true
  sleep 3
  "$@" &
  GATEWAY_PID=$!

  # ============================================================
  # MCP WARM-UP: Now that the gateway is running with full Slack
  # config, pre-warm MCP servers so agents don't cache empty tool
  # lists on their first request. Give the gateway 10s to settle
  # before starting checks.
  # ============================================================
  echo "Waiting 10s for gateway to initialize..."
  sleep 10
  echo "Pre-warming MCP servers via mcporter..."
  MCP_READY=0
  for attempt in $(seq 1 12); do
    TOOLS_JSON=$(mcporter list --json 2>/dev/null || echo "{}")
    JIRA_TOOLS=$(echo "$TOOLS_JSON" | python3 -c "import sys,json; d=json.load(sys.stdin); print(len(d.get('jira',{}).get('tools',[])))" 2>/dev/null || echo "0")
    ZD_TOOLS=$(echo "$TOOLS_JSON" | python3 -c "import sys,json; d=json.load(sys.stdin); print(len(d.get('zendesk',{}).get('tools',[])))" 2>/dev/null || echo "0")
    NOTION_TOOLS=$(echo "$TOOLS_JSON" | python3 -c "import sys,json; d=json.load(sys.stdin); print(len(d.get('notion',{}).get('tools',[])))" 2>/dev/null || echo "0")
    echo "  Attempt ${attempt}/12: jira=${JIRA_TOOLS} zendesk=${ZD_TOOLS} notion=${NOTION_TOOLS} tools"
    if [ "$JIRA_TOOLS" -gt 0 ] && [ "$ZD_TOOLS" -gt 0 ] && [ "$NOTION_TOOLS" -gt 0 ]; then
      MCP_READY=1
      echo "All MCP servers warm and ready! (jira=${JIRA_TOOLS}, zendesk=${ZD_TOOLS}, notion=${NOTION_TOOLS})"
      break
    fi
    sleep 5
  done

  if [ "$MCP_READY" -eq 0 ]; then
    echo "WARNING: Not all MCP servers ready after 60s — agents may have incomplete tool lists."
    echo "This is non-fatal; agents will attempt to load tools on first use."
  fi

  echo "OpenClaw gateway is live."
  wait $GATEWAY_PID
else
  echo "WARNING: Gateway config not found after 90s"
  wait $GATEWAY_PID
fi
