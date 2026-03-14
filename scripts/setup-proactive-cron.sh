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

# Get existing crontab (without proactive entries, to avoid duplicates)
EXISTING=$(crontab -l 2>/dev/null | grep -v "# proactive:" || true)

# Build new crontab
cat <<CRON_EOF | crontab -
${EXISTING}

# ============================================================
# Proactive Agent Tasks
# Kill switch: touch /opt/openclaw/.proactive-pause
# ============================================================

# Phase 1: Daily tasks
0 9 * * 1-5 $SCHEDULER trak-sprint-health >> $LOG_DIR/proactive.log 2>&1 # proactive: trak-sprint-health (weekdays 9am UTC)
30 10 * * 1-5 $SCHEDULER scout-sla-watchdog >> $LOG_DIR/proactive.log 2>&1 # proactive: scout-sla-watchdog (weekdays 10:30am UTC)
0 11 * * 1-5 $SCHEDULER scout-bug-correlator >> $LOG_DIR/proactive.log 2>&1 # proactive: scout-bug-correlator (weekdays 11am UTC)

# Phase 1: Weekly tasks
0 9 * * 1 $SCHEDULER trak-stale-work >> $LOG_DIR/proactive.log 2>&1 # proactive: trak-stale-work (Mondays 9am UTC)
0 10 * * 1 $SCHEDULER scribe-doc-staleness >> $LOG_DIR/proactive.log 2>&1 # proactive: scribe-doc-staleness (Mondays 10am UTC)

# Phase 2: On-demand (triggered by deploy hook in deploy.sh, not cron)
# kit-ci-triage: runs when CI fails (checked daily as fallback)
0 8 * * 1-5 $SCHEDULER kit-ci-triage >> $LOG_DIR/proactive.log 2>&1 # proactive: kit-ci-triage (weekdays 8am UTC)

# Phase 3: Weekly performance
0 6 * * 0 $SCHEDULER probe-perf-canary >> $LOG_DIR/proactive.log 2>&1 # proactive: probe-perf-canary (Sundays 6am UTC)
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
