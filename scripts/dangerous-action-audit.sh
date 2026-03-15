#!/bin/bash
# Dangerous Action Audit Logger
# Called by agents (via MCP tool wrapper) before executing dangerous actions.
# Logs all attempts to an append-only audit file for compliance.
#
# Usage: dangerous-action-audit.sh <agent> <action_pattern> <user> <tier> <confirmation_status>
#
# Exit codes:
#   0 = Action allowed (logged)
#   1 = Action BLOCKED (tier too low or missing confirmation)

set -euo pipefail

AUDIT_LOG="/opt/openclaw/logs/dangerous-actions-audit.jsonl"
CONFIG_FILE="/opt/openclaw/config/dangerous-actions.json"

agent="${1:-unknown}"
action="${2:-unknown}"
user="${3:-unknown}"
tier="${4:-unknown}"
confirmed="${5:-false}"

mkdir -p "$(dirname "$AUDIT_LOG")"

# Tier hierarchy for comparison
tier_level() {
  case "$1" in
    admin) echo 4 ;;
    developer) echo 3 ;;
    support) echo 2 ;;
    viewer) echo 1 ;;
    *) echo 0 ;;
  esac
}

# Look up action in config (uses jq --arg to prevent injection)
if [ -f "$CONFIG_FILE" ]; then
  min_tier=$(jq -r --arg pat "$action" '.dangerous_actions[] | select(.pattern == $pat) | .min_tier // "admin"' "$CONFIG_FILE" 2>/dev/null || echo "admin")
  confirmation=$(jq -r --arg pat "$action" '.dangerous_actions[] | select(.pattern == $pat) | .confirmation // "explicit"' "$CONFIG_FILE" 2>/dev/null || echo "explicit")
else
  min_tier="admin"
  confirmation="double"
fi

user_level=$(tier_level "$tier")
required_level=$(tier_level "$min_tier")

# Determine if action is allowed
blocked="false"
reason=""
if [ "$user_level" -lt "$required_level" ]; then
  blocked="true"
  reason="insufficient_tier:requires_${min_tier}_has_${tier}"
elif [ "$confirmation" = "double" ] && [ "$confirmed" != "double_confirmed" ]; then
  blocked="true"
  reason="missing_double_confirmation"
elif [ "$confirmation" = "explicit" ] && [ "$confirmed" != "confirmed" ] && [ "$confirmed" != "double_confirmed" ]; then
  blocked="true"
  reason="missing_confirmation"
fi

# Write audit log entry (append-only)
ts=$(date -Iseconds)
echo "{\"ts\":\"$ts\",\"agent\":\"$agent\",\"action\":\"$action\",\"user\":\"$user\",\"tier\":\"$tier\",\"min_tier\":\"$min_tier\",\"confirmation_required\":\"$confirmation\",\"confirmed\":\"$confirmed\",\"blocked\":$blocked,\"reason\":\"$reason\"}" >> "$AUDIT_LOG"

if [ "$blocked" = "true" ]; then
  echo "BLOCKED: $action by $user (tier=$tier, required=$min_tier, confirmation=$confirmation, reason=$reason)" >&2
  exit 1
else
  echo "ALLOWED: $action by $user (tier=$tier)"
  exit 0
fi
