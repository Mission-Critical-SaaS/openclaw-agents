#!/bin/bash
# ──────────────────────────────────────────────────────────
# OpenClaw Health Check Script (Tier-Aware)
# Runs via cron, posts alerts to Slack #leads and SNS email on failure
# Checks both admin and standard tier containers
# ──────────────────────────────────────────────────────────
set -uo pipefail

# Configuration
ADMIN_CONTAINER="openclaw-agents-admin"
STANDARD_CONTAINER="openclaw-agents-standard"
ADMIN_EXPECTED_AGENTS=1    # Chief
STANDARD_EXPECTED_AGENTS=5 # Scout, Trak, Kit, Scribe, Probe

SNS_TOPIC="${OPENCLAW_SNS_TOPIC:-arn:aws:sns:us-east-1:122015479852:openclaw-alerts}"
LOG="/opt/openclaw/logs/healthcheck.log"
ALERT_COOLDOWN_FILE="/tmp/openclaw_alert_cooldown"
COOLDOWN_SECONDS=900  # 15 min between alerts

mkdir -p /opt/openclaw/logs

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" >> "$LOG"; }

log_json() {
  local level="$1" event="$2"
  shift 2
  local extra="$*"
  local ts=$(date -Iseconds)
  echo "{\"ts\":\"$ts\",\"level\":\"$level\",\"event\":\"$event\",\"host\":\"$(hostname)\"${extra:+,$extra}}" >> "${LOG%.log}.jsonl"
}

# Get Slack token from standard container (Scout is always available)
get_slack_token() {
    docker exec "$STANDARD_CONTAINER" printenv SLACK_BOT_TOKEN_SCOUT 2>/dev/null
}

# Slack #leads channel ID (use ID not name - survives channel renames)
SLACK_ALERT_CHANNEL="${OPENCLAW_ALERT_CHANNEL:-C089JBLCFLL}"

send_slack_alert() {
    local msg="$1"
    local token=$(get_slack_token)
    if [ -z "$token" ]; then
        log "WARN: No Slack token available, skipping Slack alert"
        return
    fi
    curl -s -X POST https://slack.com/api/chat.postMessage \
        -H "Authorization: Bearer $token" \
        -H "Content-Type: application/json" \
        -d "{\"channel\":\"${SLACK_ALERT_CHANNEL}\",\"text\":\"$msg\"}" > /dev/null 2>&1
    log "Slack alert sent"
}

send_sns_alert() {
    local msg="$1"
    aws sns publish --topic-arn "$SNS_TOPIC" --subject "OpenClaw Alert" --message "$msg" --region us-east-1 > /dev/null 2>&1
    log "SNS alert sent"
}

send_alert() {
    local msg="$1"
    # Check cooldown
    if [ -f "$ALERT_COOLDOWN_FILE" ]; then
        local last=$(cat "$ALERT_COOLDOWN_FILE")
        local now=$(date +%s)
        if [ $((now - last)) -lt $COOLDOWN_SECONDS ]; then
            log "Alert suppressed (cooldown)"
            return
        fi
    fi
    date +%s > "$ALERT_COOLDOWN_FILE"
    send_slack_alert "$msg"
    send_sns_alert "$msg"
}

send_recovery() {
    local msg="$1"
    # Only send if we previously alerted
    if [ -f "$ALERT_COOLDOWN_FILE" ]; then
        rm -f "$ALERT_COOLDOWN_FILE"
        send_slack_alert "$msg"
        send_sns_alert "$msg"
    fi
}

# Check a single container
check_container() {
    local container=$1
    local expected_agents=$2
    local tier=$3
    local errors=""

    # Check container exists and is running
    local status=$(docker inspect -f '{{.State.Status}}' "$container" 2>/dev/null || echo "not_found")
    if [ "$status" != "running" ]; then
        errors="${errors}${tier} tier container ($container) not running: $status\n"
        log "FAIL: $tier container status=$status"
        echo "$errors"
        return 1
    fi

    # Check gateway process
    if ! docker exec "$container" pgrep -f "openclaw.gateway" > /dev/null 2>&1; then
        errors="${errors}${tier} tier gateway process not found in $container\n"
        log "FAIL: $tier gateway process not found"
        echo "$errors"
        return 1
    fi

    # Check Slack connections via docker logs (more reliable than openclaw status)
    local slack_conns=$(docker logs "$container" 2>&1 | grep -c "socket mode connected" || echo "0")
    if [ "$slack_conns" -lt "$expected_agents" ]; then
        errors="${errors}${tier} tier has only $slack_conns Slack connections (expected $expected_agents)\n"
        log "WARN: $tier Slack connections low (${slack_conns}/${expected_agents})"
        echo "$errors"
        return 1
    fi

    log "OK: $tier tier ($container): healthy ($slack_conns Slack connections)"
    return 0
}

# Main health check
main() {
    local all_errors=""
    local admin_result=""
    local standard_result=""

    admin_result=$(check_container "$ADMIN_CONTAINER" "$ADMIN_EXPECTED_AGENTS" "Admin")
    admin_ok=$?

    standard_result=$(check_container "$STANDARD_CONTAINER" "$STANDARD_EXPECTED_AGENTS" "Standard")
    standard_ok=$?

    if [ $admin_ok -ne 0 ]; then
        all_errors="${all_errors}${admin_result}"
    fi
    if [ $standard_ok -ne 0 ]; then
        all_errors="${all_errors}${standard_result}"
    fi

    if [ -n "$all_errors" ]; then
        ALERT_MSG=":rotating_light: *OpenClaw Health Alert*\nHost: $(hostname)\nTime: $(date -Iseconds)\n\nIssues:\n${all_errors}\nRun \`docker logs openclaw-agents-admin --tail 50\` or \`docker logs openclaw-agents-standard --tail 50\` for details."
        log "ALERT: $all_errors"
        log_json "error" "healthcheck_failed" "\"errors\":\"$(echo -n "$all_errors" | tr '\n' ' ')\""
        send_alert "$ALERT_MSG"
        exit 1
    else
        log "OK: All containers healthy"
        log_json "info" "healthcheck_ok" "\"admin\":\"healthy\",\"standard\":\"healthy\""
        send_recovery ":white_check_mark: *OpenClaw Recovered*\nAll systems healthy: both tier containers running, gateways OK, all agents connected.\nTime: $(date -Iseconds)"
        exit 0
    fi
}

main "$@"
