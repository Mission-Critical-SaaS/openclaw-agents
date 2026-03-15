#!/bin/bash
# OpenClaw Health Check Script
# Runs via cron, posts alerts to Slack #leads and SNS email on failure
set -uo pipefail

CONTAINER="openclaw-agents"
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

# Get Slack token from container env (only reads the specific var, not all of /proc/1/environ)
get_slack_token() {
    docker exec "$CONTAINER" printenv SLACK_BOT_TOKEN_SCOUT 2>/dev/null
}

# Slack #leads channel ID (use ID not name — survives channel renames)
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

ERRORS=""

# Check 1: Container running
CS=$(docker inspect -f '{{.State.Status}}' "$CONTAINER" 2>/dev/null || echo "not_found")
if [ "$CS" != "running" ]; then
    ERRORS="${ERRORS}Container not running (status: $CS)\n"
    log "FAIL: Container status=$CS"
fi

# Check 2: MCP servers (only if container is running)
if [ "$CS" = "running" ]; then
    MCP_OUT=$(docker exec "$CONTAINER" openclaw status 2>/dev/null || echo "status_failed")

    HEALTHY_COUNT=$(echo "$MCP_OUT" | grep -c "OK" || true)
    if [ "$HEALTHY_COUNT" -lt 1 ]; then
        ERRORS="${ERRORS}OpenClaw status check failed\n"
        log "FAIL: openclaw status returned no OK"
    fi

    # Check 3: Slack connections (all 5 agents: scout, trak, kit, scribe, probe)
    SLACK_CONNS=$(docker logs "$CONTAINER" 2>&1 | grep -c "socket mode connected" || true)
    if [ "$SLACK_CONNS" -lt 5 ]; then
        RECENT_SLACK=$(docker logs --since 5m "$CONTAINER" 2>&1 | grep -c "socket mode connected" || true)
        if [ "$RECENT_SLACK" -lt 1 ] && [ "$SLACK_CONNS" -lt 5 ]; then
            ERRORS="${ERRORS}Slack: fewer than 5 socket connections detected (${SLACK_CONNS} found, need 5 for all agents)\n"
            log "WARN: Slack connections low (${SLACK_CONNS}/5)"
        fi
    fi

    # Check 4: Per-agent connectivity (verify each agent is configured)
    for agent in scout trak kit scribe probe; do
        AGENT_CONFIGURED=$(docker exec "$CONTAINER" grep -c "\"${agent}\"" /home/openclaw/.openclaw/.openclaw/openclaw.json 2>/dev/null || echo "0")
        if [ "$AGENT_CONFIGURED" -lt 1 ]; then
            ERRORS="${ERRORS}Agent '${agent}' not found in gateway config\n"
            log "WARN: Agent ${agent} missing from gateway config"
        fi
    done
fi

# Report
if [ -n "$ERRORS" ]; then
    ALERT_MSG=":rotating_light: *OpenClaw Health Alert*\nHost: $(hostname)\nTime: $(date -Iseconds)\n\nIssues:\n${ERRORS}\nRun \`docker logs openclaw-agents --tail 50\` for details."
    log "ALERT: $ERRORS"
    log_json "error" "healthcheck_failed" "\"errors\":\"$(echo -n "$ERRORS" | tr '\n' ' ')\""
    send_alert "$ALERT_MSG"
    exit 1
else
    log "OK: container=$CS, mcp=$HEALTHY_COUNT, slack=$SLACK_CONNS"
    log_json "info" "healthcheck_ok" "\"container\":\"$CS\",\"mcp\":$HEALTHY_COUNT,\"slack\":$SLACK_CONNS"
    send_recovery ":white_check_mark: *OpenClaw Recovered*\nAll systems healthy: container running, MCP servers OK, 5/5 agents connected.\nTime: $(date -Iseconds)"
    exit 0
fi
