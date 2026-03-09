#!/bin/bash
###############################################################################
# OpenClaw Watchdog — Runs OUTSIDE the container as a systemd service
# Monitors all three agents (Scout, Trak, Kit) and auto-repairs failures
# Repair tiers: soft restart → hard restart → full rebuild
###############################################################################
set -uo pipefail

CONTAINER="openclaw-agents"
COMPOSE_DIR="/opt/openclaw"
LOG="/opt/openclaw/logs/watchdog.log"
STATE_FILE="/tmp/watchdog_state.json"
POLL_INTERVAL=30
MAX_SOFT_RETRIES=2
ESCALATION_WINDOW=600  # 10 minutes
SNS_TOPIC="arn:aws:sns:us-east-1:122015479852:openclaw-alerts"
STARTUP_GRACE=120  # seconds to wait after a repair before re-checking
EXPECTED_AGENTS=("scout" "trak" "kit")

mkdir -p /opt/openclaw/logs

# ─── Logging ───
log()  { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" | tee -a "$LOG" >&2; }
logw() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] WARN  $*" | tee -a "$LOG" >&2; }
loge() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] ERROR $*" | tee -a "$LOG" >&2; }
logi() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] INFO  $*" | tee -a "$LOG" >&2; }

# ─── State management ───
init_state() {
    if [ ! -f "$STATE_FILE" ]; then
        cat > "$STATE_FILE" << 'SJSON'
{"soft_restarts":0,"hard_restarts":0,"rebuilds":0,"last_repair_ts":0,"last_repair_tier":"none","consecutive_failures":0,"last_healthy_ts":0}
SJSON
    fi
}

get_state() { python3 -c "import json; d=json.load(open('$STATE_FILE')); print(d.get('$1',0))"; }

set_state() {
    python3 -c "
import json
d=json.load(open('$STATE_FILE'))
d['$1']=$2
json.dump(d,open('$STATE_FILE','w'))
"
}

increment_state() {
    python3 -c "
import json
d=json.load(open('$STATE_FILE'))
d['$1']=d.get('$1',0)+1
json.dump(d,open('$STATE_FILE','w'))
"
}

# ─── Alerting ───
get_slack_token() {
    docker exec "$CONTAINER" bash -c '
        while IFS= read -r -d "" line; do export "$line"; done < /proc/1/environ 2>/dev/null
        echo "$SLACK_BOT_TOKEN_SCOUT"
    ' 2>/dev/null
}

send_alert() {
    local severity="$1" msg="$2"
    local icon=":rotating_light:"
    [ "$severity" = "recovery" ] && icon=":white_check_mark:"
    [ "$severity" = "repair" ] && icon=":wrench:"

    local full_msg="${icon} *OpenClaw Watchdog [${severity^^}]*\nHost: $(hostname)\nTime: $(date -Iseconds)\n\n${msg}"

    # Try Slack
    local token=$(get_slack_token 2>/dev/null)
    if [ -n "$token" ]; then
        curl -s -X POST https://slack.com/api/chat.postMessage \
            -H "Authorization: Bearer $token" \
            -H "Content-Type: application/json" \
            -d "{\"channel\":\"leads\",\"text\":\"${full_msg}\"}" > /dev/null 2>&1
        logi "Slack alert sent: $severity"
    fi

    # SNS
    aws sns publish --topic-arn "$SNS_TOPIC" --subject "OpenClaw Watchdog [$severity]" \
        --message "$(echo -e "$full_msg")" --region us-east-1 > /dev/null 2>&1 || true
    logi "SNS alert sent: $severity"
}

# ─── Health Probes ───

# Probe 1: Is the container running?
probe_container_running() {
    local status=$(docker inspect -f '{{.State.Status}}' "$CONTAINER" 2>/dev/null || echo "not_found")
    if [ "$status" = "running" ]; then
        return 0
    fi
    loge "Probe FAIL: container status=$status"
    return 1
}

# Probe 2: Does `openclaw status` show Slack ON/OK?
probe_openclaw_status() {
    local out=$(docker exec "$CONTAINER" openclaw status 2>/dev/null || echo "EXEC_FAILED")
    if echo "$out" | grep -q "OK"; then
        return 0
    fi
    loge "Probe FAIL: openclaw status has no OK line"
    return 1
}

# Probe 3: Are all 3 Slack socket connections present?
probe_slack_connections() {
    local count=$((docker logs --since 10m "$CONTAINER" 2>&1 || true) | grep -c "socket mode connected" || true)
    # Also check the full log if recent logs don't show it (agents might have connected >10m ago)
    if [ "$count" -lt 3 ]; then
        count=$((docker logs "$CONTAINER" 2>&1 || true) | grep -c "socket mode connected" || true)
    fi
    if [ "$count" -ge 3 ]; then
        return 0
    fi
    logw "Probe WARN: only $count/3 socket connections found"
    return 1
}

# Probe 4: Is the container crash-looping?
probe_no_crash_loop() {
    local restart_count=$(docker inspect -f '{{.RestartCount}}' "$CONTAINER" 2>/dev/null || echo "0")
    if [ "$restart_count" -gt 5 ]; then
        loge "Probe FAIL: container has restarted $restart_count times (crash loop)"
        return 1
    fi
    return 0
}

# Probe 5: Are individual agents responsive? (Check all 3 Slack providers started)
probe_agent_providers() {
    local missing=""
    for agent in "${EXPECTED_AGENTS[@]}"; do
        if ! (docker logs "$CONTAINER" 2>&1 || true) | grep -q "\[${agent}\] starting provider"; then
            missing="${missing} ${agent}"
        fi
    done
    if [ -n "$missing" ]; then
        loge "Probe FAIL: agents missing from provider startup:${missing}"
        return 1
    fi
    return 0
}

# ─── Run all probes, return bitmask of failures ───
run_health_checks() {
    local failures=0

    probe_container_running || failures=$((failures | 1))
    # Only run further probes if container is running
    if [ $((failures & 1)) -eq 0 ]; then
        probe_openclaw_status    || failures=$((failures | 2))
        probe_slack_connections  || failures=$((failures | 4))
        probe_no_crash_loop      || failures=$((failures | 8))
        probe_agent_providers    || failures=$((failures | 16))
    fi

    echo $failures
}

# ─── Repair Actions ───

repair_soft_restart() {
    log "REPAIR [Tier 1]: Soft restart — docker restart $CONTAINER"
    send_alert "repair" "Tier 1: Soft-restarting container due to health check failures."
    docker restart "$CONTAINER" 2>&1 | tee -a "$LOG" >&2
    increment_state "soft_restarts"
    set_state "last_repair_ts" "$(date +%s)"
    set_state "last_repair_tier" '"soft"'
    sleep "$STARTUP_GRACE"
}

repair_hard_restart() {
    log "REPAIR [Tier 2]: Hard restart — docker-compose down/up"
    send_alert "repair" "Tier 2: Hard-restarting (compose down/up) due to persistent failures."
    cd "$COMPOSE_DIR"
    docker-compose down 2>&1 | tee -a "$LOG" >&2
    docker-compose up -d 2>&1 | tee -a "$LOG" >&2
    increment_state "hard_restarts"
    set_state "last_repair_ts" "$(date +%s)"
    set_state "last_repair_tier" '"hard"'
    sleep "$STARTUP_GRACE"
}

repair_full_rebuild() {
    log "REPAIR [Tier 3]: Full rebuild — docker-compose build --no-cache && up"
    send_alert "repair" "Tier 3: Full rebuild triggered. This will take several minutes."
    cd "$COMPOSE_DIR"
    docker-compose down 2>&1 | tee -a "$LOG" >&2
    docker system prune -f 2>&1 | tee -a "$LOG" >&2
    docker-compose build --no-cache 2>&1 | tee -a "$LOG" >&2
    local build_rc=$?
    if [ $build_rc -ne 0 ]; then
        loge "REBUILD FAILED with exit code $build_rc"
        send_alert "error" "Tier 3 rebuild FAILED. Human intervention required.\nExit code: $build_rc"
        return 1
    fi
    docker-compose up -d 2>&1 | tee -a "$LOG" >&2
    increment_state "rebuilds"
    set_state "last_repair_ts" "$(date +%s)"
    set_state "last_repair_tier" '"rebuild"'
    sleep "$STARTUP_GRACE"
}

# ─── Repair Escalation Logic ───
attempt_repair() {
    local failures=$1
    local consec=$(get_state "consecutive_failures")
    local last_tier=$(get_state "last_repair_tier")
    local last_ts=$(get_state "last_repair_ts")
    local now=$(date +%s)
    local time_since_repair=$((now - last_ts))

    log "Deciding repair: consecutive_failures=$consec, last_tier=$last_tier, time_since=$time_since_repair"

    # Container not running at all → go straight to hard restart
    if [ $((failures & 1)) -ne 0 ]; then
        repair_hard_restart
        return
    fi

    # Crash loop detected → go straight to hard restart
    if [ $((failures & 8)) -ne 0 ]; then
        repair_hard_restart
        return
    fi

    # Tier 1: Soft restart (first attempt)
    if [ "$consec" -lt "$MAX_SOFT_RETRIES" ]; then
        repair_soft_restart
        return
    fi

    # Tier 2: Hard restart (soft retries exhausted within escalation window)
    if [ "$time_since_repair" -lt "$ESCALATION_WINDOW" ] && [ "$last_tier" != '"rebuild"' ]; then
        repair_hard_restart
        return
    fi

    # Tier 3: Full rebuild (hard restart didn't fix it)
    if [ "$last_tier" = '"hard"' ] && [ "$time_since_repair" -lt "$ESCALATION_WINDOW" ]; then
        repair_full_rebuild
        return
    fi

    # If we're past the escalation window, reset and try soft again
    if [ "$time_since_repair" -ge "$ESCALATION_WINDOW" ]; then
        set_state "consecutive_failures" 0
        repair_soft_restart
        return
    fi

    # All tiers exhausted
    loge "ALL REPAIR TIERS EXHAUSTED. Human intervention required."
    send_alert "error" "All repair tiers exhausted. Gateway is DOWN.\nFailure bitmask: $failures\nConsecutive failures: $consec\nLast repair: $last_tier ($time_since_repair seconds ago)\n\nManual steps:\n1. SSH: aws ssm start-session --target i-0c6a99a3e95cd52d6\n2. Check: docker logs openclaw-agents --tail 100\n3. Rebuild: cd /opt/openclaw && docker-compose build --no-cache && docker-compose up -d"
}

# ─── Main Loop ───
main() {
    log "=========================================="
    log "OpenClaw Watchdog starting (PID $$)"
    log "Poll interval: ${POLL_INTERVAL}s"
    log "Expected agents: ${EXPECTED_AGENTS[*]}"
    log "=========================================="

    init_state

    # Initial grace period on startup
    log "Waiting ${STARTUP_GRACE}s for container startup grace..."
    sleep "$STARTUP_GRACE"

    while true; do
        failures=$(run_health_checks)

        if [ "$failures" -eq 0 ]; then
            local consec=$(get_state "consecutive_failures")
            if [ "$consec" -gt 0 ]; then
                log "RECOVERED after $consec consecutive failures"
                send_alert "recovery" "All agents healthy after $consec consecutive failures.\nScout: OK\nTrak: OK\nKit: OK\nSlack: 3/3 connected"
                set_state "consecutive_failures" 0
            fi
            set_state "last_healthy_ts" "$(date +%s)"
            logi "All probes passed (failures=0)"
        else
            increment_state "consecutive_failures"
            local consec=$(get_state "consecutive_failures")
            loge "Health check failed (bitmask=$failures, consecutive=$consec)"

            # Don't repair on first failure — wait for confirmation
            if [ "$consec" -ge 2 ]; then
                attempt_repair "$failures"
            else
                logw "First failure detected, waiting for confirmation on next check..."
            fi
        fi

        sleep "$POLL_INTERVAL"
    done
}

# Allow running specific functions for testing
if [ "${1:-}" = "--test-probes" ]; then
    init_state
    echo "Running all health probes..."
    probe_container_running && echo "  [PASS] container running" || echo "  [FAIL] container running"
    probe_openclaw_status   && echo "  [PASS] openclaw status OK" || echo "  [FAIL] openclaw status"
    probe_slack_connections && echo "  [PASS] slack connections 3/3" || echo "  [FAIL] slack connections"
    probe_no_crash_loop     && echo "  [PASS] no crash loop" || echo "  [FAIL] crash loop detected"
    probe_agent_providers   && echo "  [PASS] all agent providers" || echo "  [FAIL] missing agent providers"
    echo "Overall failure bitmask: $(run_health_checks)"
    exit 0
fi

if [ "${1:-}" = "--status" ]; then
    init_state
    echo "Watchdog State:"
    cat "$STATE_FILE" | python3 -m json.tool
    echo ""
    echo "Recent log:"
    tail -20 "$LOG" 2>/dev/null || echo "(no log yet)"
    exit 0
fi

main
