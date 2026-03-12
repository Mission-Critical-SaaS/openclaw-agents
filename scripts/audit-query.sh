#!/bin/bash
# audit-query.sh — Query agent audit trails from Slack message history
#
# Usage:
#   ./scripts/audit-query.sh [OPTIONS]
#
# Options:
#   --user <slack_id>     Filter by requesting user's Slack ID
#   --agent <name>        Filter by agent (kit, trak, scout)
#   --action <pattern>    Filter by action type (e.g., github_merge_pr, jira_*)
#   --since <date>        Only show entries after this date (YYYY-MM-DD)
#   --channel <id>        Search in a specific Slack channel
#   --limit <n>           Max results (default: 50)
#   --format <fmt>        Output format: table (default), json, csv
#   --help                Show this help
#
# Examples:
#   ./scripts/audit-query.sh --user U082DEF37PC --since 2026-03-01
#   ./scripts/audit-query.sh --agent kit --action "github_*"
#   ./scripts/audit-query.sh --action "delete" --format json
#
# Requires: SLACK_BOT_TOKEN environment variable (with search:read scope)

set -euo pipefail

# Defaults
USER_FILTER=""
AGENT_FILTER=""
ACTION_FILTER=""
SINCE_DATE=""
CHANNEL_FILTER=""
LIMIT=50
FORMAT="table"

# Parse arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --user) USER_FILTER="$2"; shift 2 ;;
    --agent) AGENT_FILTER="$2"; shift 2 ;;
    --action) ACTION_FILTER="$2"; shift 2 ;;
    --since) SINCE_DATE="$2"; shift 2 ;;
    --channel) CHANNEL_FILTER="$2"; shift 2 ;;
    --limit) LIMIT="$2"; shift 2 ;;
    --format) FORMAT="$2"; shift 2 ;;
    --help)
      head -25 "$0" | tail -23
      exit 0
      ;;
    *) echo "Unknown option: $1"; exit 1 ;;
  esac
done

# Validate
if [ -z "${SLACK_BOT_TOKEN:-}" ]; then
  echo "ERROR: SLACK_BOT_TOKEN environment variable is required"
  echo "The token needs 'search:read' scope to search Slack messages."
  exit 1
fi

# Build search query
QUERY="AUDIT"
[ -n "$USER_FILTER" ] && QUERY="$QUERY user:$USER_FILTER"
[ -n "$AGENT_FILTER" ] && QUERY="$QUERY agent:$AGENT_FILTER"
[ -n "$ACTION_FILTER" ] && QUERY="$QUERY action:$ACTION_FILTER"
[ -n "$SINCE_DATE" ] && QUERY="$QUERY after:$SINCE_DATE"
[ -n "$CHANNEL_FILTER" ] && QUERY="$QUERY in:<#$CHANNEL_FILTER>"

echo "Searching Slack for audit entries..."
echo "Query: $QUERY"
echo ""

# Search Slack
RESPONSE=$(curl -s -H "Authorization: Bearer $SLACK_BOT_TOKEN" \
  "https://slack.com/api/search.messages?query=$(python3 -c "import urllib.parse; print(urllib.parse.quote('$QUERY'))")&count=$LIMIT&sort=timestamp&sort_dir=desc")

# Check for errors
OK=$(echo "$RESPONSE" | python3 -c "import sys,json; print(json.load(sys.stdin).get('ok', False))")
if [ "$OK" != "True" ]; then
  ERROR=$(echo "$RESPONSE" | python3 -c "import sys,json; print(json.load(sys.stdin).get('error', 'unknown'))")
  echo "ERROR: Slack API returned: $ERROR"
  exit 1
fi

# Parse and display results
python3 << 'PARSE_EOF'
import json, sys, re

response = json.loads('''RESPONSE_PLACEHOLDER'''.replace("'", "\\'"))

# Actually read from the environment
import os
response_str = os.environ.get('_AUDIT_RESPONSE', '{}')
response = json.loads(response_str)

messages = response.get('messages', {}).get('matches', [])
total = response.get('messages', {}).get('total', 0)
format_type = os.environ.get('_AUDIT_FORMAT', 'table')

if total == 0:
    print("No audit entries found.")
    sys.exit(0)

print(f"Found {total} audit entries (showing {len(messages)}):\n")

# Parse audit lines from messages
entries = []
audit_pattern = re.compile(
    r'📝 AUDIT \| ([^|]+)\| user:([^\s|]+)\s*\| tier:([^\s|]+)\s*\| agent:([^\s|]+)\s*\| action:([^\s|]+)\s*\| target:([^|]+)\| result:(\w+)'
)

for msg in messages:
    text = msg.get('text', '')
    channel = msg.get('channel', {}).get('name', 'unknown')
    ts = msg.get('ts', '')

    for match in audit_pattern.finditer(text):
        entries.append({
            'timestamp': match.group(1).strip(),
            'user': match.group(2).strip(),
            'tier': match.group(3).strip(),
            'agent': match.group(4).strip(),
            'action': match.group(5).strip(),
            'target': match.group(6).strip(),
            'result': match.group(7).strip(),
            'channel': channel
        })

if not entries:
    # Fall back to showing raw messages containing AUDIT
    print("(Could not parse structured audit lines — showing raw matches)\n")
    for msg in messages[:20]:
        text = msg.get('text', '')
        channel = msg.get('channel', {}).get('name', 'DM')
        user = msg.get('username', 'unknown')
        ts = msg.get('ts', '')
        # Extract just the AUDIT line
        for line in text.split('\n'):
            if 'AUDIT' in line:
                print(f"  [{channel}] {line.strip()}")
    sys.exit(0)

if format_type == 'json':
    print(json.dumps(entries, indent=2))
elif format_type == 'csv':
    print("timestamp,user,tier,agent,action,target,result,channel")
    for e in entries:
        print(f"{e['timestamp']},{e['user']},{e['tier']},{e['agent']},{e['action']},{e['target']},{e['result']},{e['channel']}")
else:  # table
    # Header
    print(f"{'Timestamp':<22} {'User':<14} {'Tier':<10} {'Agent':<7} {'Action':<25} {'Target':<35} {'Result':<8}")
    print("-" * 125)
    for e in entries:
        print(f"{e['timestamp']:<22} {e['user']:<14} {e['tier']:<10} {e['agent']:<7} {e['action']:<25} {e['target']:<35} {e['result']:<8}")

PARSE_EOF

# Note: The Python script above uses a placeholder approach.
# In production, pass the response via environment variable.
export _AUDIT_RESPONSE="$RESPONSE"
export _AUDIT_FORMAT="$FORMAT"

python3 << 'DISPLAY_EOF'
import json, sys, re, os

response = json.loads(os.environ.get('_AUDIT_RESPONSE', '{}'))
format_type = os.environ.get('_AUDIT_FORMAT', 'table')

messages = response.get('messages', {}).get('matches', [])
total = response.get('messages', {}).get('total', 0)

if total == 0:
    print("No audit entries found.")
    sys.exit(0)

print(f"Found {total} audit entries (showing {len(messages)}):\n")

audit_pattern = re.compile(
    r'AUDIT \| ([^|]+)\| user:([^\s|]+)\s*\| tier:([^\s|]+)\s*\| agent:([^\s|]+)\s*\| action:([^\s|]+)\s*\| target:([^|]+)\| result:(\w+)'
)

entries = []
for msg in messages:
    text = msg.get('text', '')
    channel_info = msg.get('channel', {})
    channel = channel_info.get('name', 'DM') if isinstance(channel_info, dict) else str(channel_info)

    for match in audit_pattern.finditer(text):
        entries.append({
            'timestamp': match.group(1).strip(),
            'user': match.group(2).strip(),
            'tier': match.group(3).strip(),
            'agent': match.group(4).strip(),
            'action': match.group(5).strip(),
            'target': match.group(6).strip(),
            'result': match.group(7).strip(),
            'channel': channel
        })

if not entries:
    print("(No structured audit lines found — showing raw AUDIT matches)\n")
    for msg in messages[:20]:
        text = msg.get('text', '')
        for line in text.split('\n'):
            if 'AUDIT' in line:
                print(f"  {line.strip()}")
    sys.exit(0)

if format_type == 'json':
    print(json.dumps(entries, indent=2))
elif format_type == 'csv':
    print("timestamp,user,tier,agent,action,target,result,channel")
    for e in entries:
        print(f"{e['timestamp']},{e['user']},{e['tier']},{e['agent']},{e['action']},{e['target']},{e['result']},{e['channel']}")
else:
    print(f"{'Timestamp':<22} {'User':<14} {'Tier':<10} {'Agent':<7} {'Action':<25} {'Target':<35} {'Result':<8}")
    print("-" * 125)
    for e in entries:
        print(f"{e['timestamp']:<22} {e['user']:<14} {e['tier']:<10} {e['agent']:<7} {e['action']:<25} {e['target']:<35} {e['result']:<8}")
DISPLAY_EOF
