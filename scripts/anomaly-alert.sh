#!/bin/bash
# anomaly-alert.sh — Detect anomalous agent action patterns and alert via Slack
#
# Usage:
#   ./scripts/anomaly-alert.sh [OPTIONS]
#
# Options:
#   --webhook <url>       Slack webhook URL for alerts (or set SLACK_WEBHOOK_ALERTS)
#   --threshold <n>       Max actions per user per hour before alerting (default: 20)
#   --check-hours <n>     How many hours back to check (default: 1)
#   --dry-run             Print alerts to stdout instead of posting to Slack
#   --help                Show this help
#
# Designed to run as a cron job:
#   */15 * * * * /path/to/scripts/anomaly-alert.sh --webhook $SLACK_WEBHOOK_ALERTS
#
# Checks for:
#   1. High action volume from a single user (> threshold per hour)
#   2. Bulk operations (3+ items in one action)
#   3. Delete operations
#   4. Actions from unknown user IDs (not in user-tiers.json)
#   5. Actions outside business hours (before 7am or after 9pm local)
#
# Requires: SLACK_BOT_TOKEN environment variable (with search:read scope)

set -euo pipefail

# Defaults
WEBHOOK="${SLACK_WEBHOOK_ALERTS:-}"
THRESHOLD=20
CHECK_HOURS=1
DRY_RUN=false

# Parse arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --webhook) WEBHOOK="$2"; shift 2 ;;
    --threshold) THRESHOLD="$2"; shift 2 ;;
    --check-hours) CHECK_HOURS="$2"; shift 2 ;;
    --dry-run) DRY_RUN=true; shift ;;
    --help)
      head -28 "$0" | tail -26
      exit 0
      ;;
    *) echo "Unknown option: $1"; exit 1 ;;
  esac
done

# Validate
if [ -z "${SLACK_BOT_TOKEN:-}" ]; then
  echo "ERROR: SLACK_BOT_TOKEN environment variable is required"
  exit 1
fi

if [ "$DRY_RUN" = false ] && [ -z "$WEBHOOK" ]; then
  echo "ERROR: --webhook URL or SLACK_WEBHOOK_ALERTS env var required (or use --dry-run)"
  exit 1
fi

# Load known users from user-tiers.json
TIERS_FILE="${TIERS_FILE:-/tmp/openclaw-agents/config/user-tiers.json}"
KNOWN_USERS=""
if [ -f "$TIERS_FILE" ]; then
  KNOWN_USERS=$(python3 -c "import json; d=json.load(open('$TIERS_FILE')); print(' '.join(d.get('tier_lookup',{}).keys()))")
fi

# Calculate time window
SINCE_TS=$(python3 -c "
from datetime import datetime, timedelta, timezone
since = datetime.now(timezone.utc) - timedelta(hours=$CHECK_HOURS)
print(since.strftime('%Y-%m-%d'))
")

# Search Slack for audit entries
echo "Checking for anomalies in the last $CHECK_HOURS hour(s)..."

RESPONSE=$(curl -s -H "Authorization: Bearer $SLACK_BOT_TOKEN" \
  "https://slack.com/api/search.messages?query=AUDIT%20after:$SINCE_TS&count=200&sort=timestamp&sort_dir=desc")

# Parse and detect anomalies
export _ANOMALY_RESPONSE="$RESPONSE"
export _ANOMALY_THRESHOLD="$THRESHOLD"
export _ANOMALY_KNOWN_USERS="$KNOWN_USERS"
export _ANOMALY_CHECK_HOURS="$CHECK_HOURS"

ALERTS=$(python3 << 'DETECT_EOF'
import json, os, re
from datetime import datetime, timedelta, timezone
from collections import Counter

response = json.loads(os.environ.get('_ANOMALY_RESPONSE', '{}'))
threshold = int(os.environ.get('_ANOMALY_THRESHOLD', '20'))
known_users = set(os.environ.get('_ANOMALY_KNOWN_USERS', '').split())
check_hours = int(os.environ.get('_ANOMALY_CHECK_HOURS', '1'))

messages = response.get('messages', {}).get('matches', [])

if not messages:
    exit(0)

# Parse audit entries
audit_pattern = re.compile(
    r'AUDIT \| ([^|]+)\| user:([^\s|]+)\s*\| tier:([^\s|]+)\s*\| agent:([^\s|]+)\s*\| action:([^\s|]+)\s*\| target:([^|]+)\| result:(\w+)'
)

entries = []
for msg in messages:
    text = msg.get('text', '')
    for match in audit_pattern.finditer(text):
        entries.append({
            'timestamp': match.group(1).strip(),
            'user': match.group(2).strip(),
            'tier': match.group(3).strip(),
            'agent': match.group(4).strip(),
            'action': match.group(5).strip(),
            'target': match.group(6).strip(),
            'result': match.group(7).strip()
        })

if not entries:
    exit(0)

alerts = []

# Check 1: High action volume per user
user_counts = Counter(e['user'] for e in entries)
for user_id, count in user_counts.items():
    if count > threshold:
        alerts.append(f"⚠️ *High volume*: User `{user_id}` performed {count} actions in the last {check_hours}h (threshold: {threshold})")

# Check 2: Bulk operations
bulk_actions = [e for e in entries if 'bulk' in e['action'].lower()]
for e in bulk_actions:
    alerts.append(f"⚠️ *Bulk operation*: `{e['action']}` by `{e['user']}` (tier: {e['tier']}) on `{e['target']}`")

# Check 3: Delete operations
delete_actions = [e for e in entries if 'delete' in e['action'].lower()]
for e in delete_actions:
    alerts.append(f"🚨 *Delete operation*: `{e['action']}` by `{e['user']}` (tier: {e['tier']}) on `{e['target']}`")

# Check 4: Unknown users
if known_users:
    unknown_users = set(e['user'] for e in entries) - known_users
    for uid in unknown_users:
        count = sum(1 for e in entries if e['user'] == uid)
        alerts.append(f"🚨 *Unknown user*: `{uid}` performed {count} action(s) but is not in user-tiers.json")

# Check 5: Actions outside business hours (7am-9pm)
try:
    for e in entries:
        ts = e['timestamp']
        # Try to parse ISO timestamp
        try:
            dt = datetime.fromisoformat(ts.replace('Z', '+00:00'))
            hour = dt.hour
            if hour < 7 or hour >= 21:
                alerts.append(f"⚠️ *Off-hours*: `{e['action']}` by `{e['user']}` at {ts} (outside 7am-9pm)")
        except (ValueError, AttributeError):
            pass
except Exception:
    pass

# Check 6: Failed actions (might indicate unauthorized attempts)
failed = [e for e in entries if e['result'] == 'failure']
user_failures = Counter(e['user'] for e in failed)
for user_id, count in user_failures.items():
    if count >= 3:
        alerts.append(f"⚠️ *Repeated failures*: User `{user_id}` had {count} failed action(s) — possible unauthorized access attempt")

# Output alerts
for alert in alerts:
    print(alert)
DETECT_EOF
)

if [ -z "$ALERTS" ]; then
  echo "No anomalies detected."
  exit 0
fi

echo "Anomalies detected:"
echo "$ALERTS"

# Post to Slack
if [ "$DRY_RUN" = true ]; then
  echo ""
  echo "(Dry run — alerts not posted to Slack)"
  exit 0
fi

# Build Slack message
ALERT_TEXT="🚨 *Agent Security Alert*\n\nThe following anomalies were detected in the last ${CHECK_HOURS}h:\n\n${ALERTS}"

curl -s -X POST "$WEBHOOK" \
  -H "Content-Type: application/json" \
  -d "{\"text\": \"$(echo "$ALERT_TEXT" | sed 's/"/\\"/g' | sed ':a;N;$!ba;s/\n/\\n/g')\"}"

echo ""
echo "Alerts posted to Slack."
