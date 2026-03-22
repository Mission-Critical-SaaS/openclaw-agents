#!/bin/bash
# Set up cron jobs for proactive agent tasks.
#
# Usage:
#   scripts/setup-proactive-cron.sh          # install cron entries
#   scripts/setup-proactive-cron.sh --remove # remove proactive cron entries
#   scripts/setup-proactive-cron.sh --status # show current proactive cron entries
#
# This script APPENDS to the existing crontab (preserving backup/snapshot crons).
# Each proactive entry is tagged with "# proactive:" for easy identification.
#
# IMPORTANT: All times are Eastern Time (America/New_York). The EC2 instance
# timezone MUST be set to America/New_York for correct scheduling.
#
# Kill switch: touch /opt/openclaw/.proactive-pause to pause ALL proactive tasks.
# Per-agent pause: export PROACTIVE_PAUSE_TRAK=true (etc.) in the environment.

set -euo pipefail

SCHEDULER="/opt/openclaw/scripts/proactive-scheduler.sh"
LOG_DIR="/opt/openclaw/logs"

ACTION="${1:-install}"

case "$ACTION" in
  --remove)
    echo "Removing proactive cron entries..."
    crontab -l 2>/dev/null | grep -v "# proactive:" | crontab -
    echo "Proactive cron entries removed."
    crontab -l 2>/dev/null
    exit 0
    ;;

  --status)
    echo "Current proactive cron entries:"
    crontab -l 2>/dev/null | grep "# proactive:" || echo "  (none)"
    echo ""
    if [ -f /opt/openclaw/.proactive-pause ]; then
      echo "STATUS: PAUSED (global pause file exists)"
    else
      echo "STATUS: ACTIVE"
    fi
    exit 0
    ;;

  install)
    ;;

  *)
    echo "Usage: $0 [--remove|--status]"
    exit 1
    ;;
esac

echo "Installing proactive cron entries..."

# Get existing crontab (without proactive or logrotate entries, to avoid duplicates)
EXISTING=$(crontab -l 2>/dev/null | grep -v "# proactive:" | grep -v "# logrotate:" | grep -v "# ====" || true)

# Build new crontab
cat <<CRON_EOF | crontab -
${EXISTING}

# ============================================================
# Log Rotation (host-side logs in /opt/openclaw/logs)
# ============================================================
0 0 * * * /usr/sbin/logrotate /etc/logrotate.conf --state /tmp/logrotate.state >> $LOG_DIR/logrotate.log 2>&1 # logrotate: host-side log rotation (daily at midnight)

# ============================================================
# Proactive Agent Tasks
# Kill switch: touch /opt/openclaw/.proactive-pause
# ============================================================

# Phase 1: Daily tasks (flock -n prevents concurrent runs of the same task)
0 9 * * 1-5 flock -n /tmp/openclaw-trak-sprint-health.lock $SCHEDULER trak-sprint-health >> $LOG_DIR/proactive.log 2>&1 # proactive: trak-sprint-health (weekdays 9am ET)
30 10 * * 1-5 flock -n /tmp/openclaw-scout-sla-watchdog.lock $SCHEDULER scout-sla-watchdog >> $LOG_DIR/proactive.log 2>&1 # proactive: scout-sla-watchdog (weekdays 10:30am ET)
0 11 * * 1-5 flock -n /tmp/openclaw-scout-bug-correlator.lock $SCHEDULER scout-bug-correlator >> $LOG_DIR/proactive.log 2>&1 # proactive: scout-bug-correlator (weekdays 11am ET)

# Phase 1: Weekly tasks
0 9 * * 1 flock -n /tmp/openclaw-trak-stale-work.lock $SCHEDULER trak-stale-work >> $LOG_DIR/proactive.log 2>&1 # proactive: trak-stale-work (Mondays 9am ET)
0 10 * * 1 flock -n /tmp/openclaw-scribe-doc-staleness.lock $SCHEDULER scribe-doc-staleness >> $LOG_DIR/proactive.log 2>&1 # proactive: scribe-doc-staleness (Mondays 10am ET)

# Phase 2: On-demand (triggered by deploy hook in deploy.sh, not cron)
# kit-ci-triage: runs when CI fails (checked daily as fallback)
0 8 * * 1-5 flock -n /tmp/openclaw-kit-ci-triage.lock $SCHEDULER kit-ci-triage >> $LOG_DIR/proactive.log 2>&1 # proactive: kit-ci-triage (weekdays 8am ET)

# Phase 3: High-frequency enrichment (flock critical here — prevents overlap on slow runs)
*/30 9-18 * * 1-5 flock -n /tmp/openclaw-trak-issue-enrichment.lock $SCHEDULER trak-issue-enrichment >> $LOG_DIR/proactive.log 2>&1 # proactive: trak-issue-enrichment (every 30min, business hours ET)
*/15 9-18 * * 1-5 flock -n /tmp/openclaw-scout-ticket-enrichment.lock $SCHEDULER scout-ticket-enrichment >> $LOG_DIR/proactive.log 2>&1 # proactive: scout-ticket-enrichment (every 15min, business hours ET)

# Phase 3: Periodic automation
0 */6 * * 1-5 flock -n /tmp/openclaw-kit-auto-fix.lock $SCHEDULER kit-auto-fix >> $LOG_DIR/proactive.log 2>&1 # proactive: kit-auto-fix (every 6 hours weekdays ET)
0 7 * * 6 flock -n /tmp/openclaw-kit-code-quality.lock $SCHEDULER kit-code-quality >> $LOG_DIR/proactive.log 2>&1 # proactive: kit-code-quality (Saturdays 7am ET)
0 8 1 * * flock -n /tmp/openclaw-scribe-knowledge-gap.lock $SCHEDULER scribe-knowledge-gap >> $LOG_DIR/proactive.log 2>&1 # proactive: scribe-knowledge-gap (1st of month 8am ET)

# Phase 3: Weekly performance
0 6 * * 0 flock -n /tmp/openclaw-probe-perf-canary.lock $SCHEDULER probe-perf-canary >> $LOG_DIR/proactive.log 2>&1 # proactive: probe-perf-canary (Sundays 6am ET)

# ============================================================
# Sales Pipeline Agent Tasks
# Pipeline: Harvest (RSS) → Prospector (enrich) → Outreach (contacts) → Cadence (follow-up)
# ============================================================

# Harvest: Poll RSS feeds every 2 hours during business hours (8am-6pm ET, 7 days/week)
# Budget: 24 polls/day cap, ~5 polls/day at this frequency leaves room for manual triggers
# Runs daily (not just weekdays) — government contract postings can appear any day
0 8-18/2 * * * flock -n /tmp/openclaw-harvest-rss-poll.lock $SCHEDULER harvest-rss-poll >> $LOG_DIR/proactive.log 2>&1 # proactive: harvest-rss-poll (every 2h, business hours ET, daily)

# Prospector: Enrich new leads every 3 hours during business hours (9am-6pm ET, 7 days/week)
# Staggered 30min after Harvest to allow new leads to land first
# Runs daily to keep enrichment queue clear — no point letting leads sit over weekends
30 9-18/3 * * * flock -n /tmp/openclaw-prospector-enrichment.lock $SCHEDULER prospector-enrichment >> $LOG_DIR/proactive.log 2>&1 # proactive: prospector-enrichment (every 3h, business hours ET, daily)

# Outreach: Find contacts and draft emails once daily (weekdays 10am ET)
# Runs after Prospector has had time to enrich morning leads
0 10 * * 1-5 flock -n /tmp/openclaw-outreach-contact-finding.lock $SCHEDULER outreach-contact-finding >> $LOG_DIR/proactive.log 2>&1 # proactive: outreach-contact-finding (weekdays 10am ET)

# Cadence: Check follow-up sequences every 6 hours (weekdays 8am, 2pm ET)
# Two checks per day ensures timely follow-ups without excessive API usage
0 8,14 * * 1-5 flock -n /tmp/openclaw-cadence-follow-up.lock $SCHEDULER cadence-follow-up >> $LOG_DIR/proactive.log 2>&1 # proactive: cadence-follow-up (weekdays 8am, 2pm ET)

# Cadence: Weekly pipeline report (Mondays 4pm ET)
# End of first business day gives a full week's data and time for team to review
0 16 * * 1 flock -n /tmp/openclaw-cadence-pipeline-report.lock $SCHEDULER cadence-pipeline-report >> $LOG_DIR/proactive.log 2>&1 # proactive: cadence-pipeline-report (Mondays 4pm ET)
CRON_EOF

echo "Proactive cron entries installed."
echo ""
echo "Schedule:"
crontab -l 2>/dev/null | grep "# proactive:" | while IFS= read -r line; do
  echo "  $line"
done
echo ""
echo "To pause all: touch /opt/openclaw/.proactive-pause"
echo "To resume:    rm /opt/openclaw/.proactive-pause"
