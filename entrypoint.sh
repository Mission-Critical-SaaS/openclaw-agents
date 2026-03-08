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

# Derived Jira env vars (mcporter expects these names)
export JIRA_BASE_URL="https://${ATLASSIAN_SITE_NAME}.atlassian.net"
export JIRA_USER_EMAIL="${ATLASSIAN_USER_EMAIL}"
export JIRA_API_TOKEN="${ATLASSIAN_API_TOKEN}"
export GITHUB_TOKEN=$(echo $SECRET | jq -r .GITHUB_TOKEN)
export ZENDESK_SUBDOMAIN=$(echo $SECRET | jq -r .ZENDESK_SUBDOMAIN)
export ZENDESK_EMAIL=$(echo $SECRET | jq -r .ZENDESK_EMAIL)
export ZENDESK_API_TOKEN=$(echo $SECRET | jq -r .ZENDESK_API_TOKEN)
export NOTION_API_TOKEN=$(echo $SECRET | jq -r .NOTION_API_TOKEN)
export SLACK_ALLOW_FROM=$(echo $SECRET | jq -r .SLACK_ALLOW_FROM)
export ANTHROPIC_API_KEY=$(echo $SECRET | jq -r .ANTHROPIC_API_KEY)

# Start inner entrypoint (which starts the gateway) in background
"$@" &
GATEWAY_PID=$!

# Wait for gateway to create its config file
CONF="/root/.openclaw/.openclaw/openclaw.json"
echo "Waiting for gateway config..."
for i in $(seq 1 30); do
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
            'groupPolicy': 'allowlist',
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
  kill $GATEWAY_PID 2>/dev/null
  sleep 2
  exec "$@"
else
  echo "WARNING: Gateway config not found after 30s"
  wait $GATEWAY_PID
fi
