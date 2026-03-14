#!/bin/bash
# Backup agent memories, workspaces, and SQLite databases to S3.
#
# Usage:
#   scripts/backup-agent-data.sh              # standard backup
#   scripts/backup-agent-data.sh --pre-deploy # pre-deploy snapshot (tagged)
#   scripts/backup-agent-data.sh --cron       # cron mode (quiet unless error)
#
# Backs up:
#   /opt/openclaw-persist/memory/       → SQLite memory databases
#   /opt/openclaw-persist/workspace-*/  → agent runtime workspaces (KNOWLEDGE.md, etc.)
#
# S3 layout:
#   s3://openclaw-agent-backups/latest/          ← always-current sync
#   s3://openclaw-agent-backups/snapshots/YYYY-MM-DD-HHMMSS.tar.gz  ← timestamped archives
#   s3://openclaw-agent-backups/pre-deploy/YYYY-MM-DD-HHMMSS.tar.gz ← pre-deploy safety snapshots
#
# The bucket has versioning enabled, so even "latest/" overwrites are recoverable.
# Lifecycle policy expires non-current versions after 30 days.

set -euo pipefail

PERSIST_DIR="/opt/openclaw-persist"
BUCKET="openclaw-agent-backups"
REGION="us-east-1"
TIMESTAMP=$(date -u +%Y-%m-%d-%H%M%S)
CRON_MODE=false
PRE_DEPLOY=false

for arg in "$@"; do
  case $arg in
    --cron) CRON_MODE=true ;;
    --pre-deploy) PRE_DEPLOY=true ;;
    *) echo "Unknown option: $arg"; exit 1 ;;
  esac
done

log() {
  if [ "$CRON_MODE" = false ]; then
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"
  fi
}

error() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] ERROR: $*" >&2
}

if [ ! -d "$PERSIST_DIR" ]; then
  error "Persist directory not found: $PERSIST_DIR"
  exit 1
fi

# ============================================================
# Step 1: Sync current state to s3://bucket/latest/
# Uses aws s3 sync for efficiency (only uploads changed files).
# ============================================================
log "Syncing $PERSIST_DIR to s3://$BUCKET/latest/ ..."

# Temporarily copy SQLite databases with WAL checkpoint to ensure consistency.
# SQLite in WAL mode may have uncommitted data in the -wal file.
STAGING=$(mktemp -d /tmp/openclaw-backup-XXXXXX)
trap "rm -rf $STAGING" EXIT

# Copy everything to staging
cp -a "$PERSIST_DIR"/* "$STAGING/" 2>/dev/null || true

# If sqlite3 is available, checkpoint WAL files for consistency
if command -v sqlite3 &>/dev/null; then
  for db in "$STAGING"/memory/*.sqlite; do
    if [ -f "$db" ]; then
      sqlite3 "$db" "PRAGMA wal_checkpoint(TRUNCATE);" 2>/dev/null || true
      log "  WAL checkpoint: $(basename "$db")"
    fi
  done
fi

aws s3 sync "$STAGING/" "s3://$BUCKET/latest/" \
  --region "$REGION" \
  --delete \
  --quiet 2>&1 || {
    error "S3 sync failed"
    exit 1
  }

log "Sync complete."

# ============================================================
# Step 2: Create a timestamped tarball snapshot
# ============================================================
if [ "$PRE_DEPLOY" = true ]; then
  SNAPSHOT_PREFIX="pre-deploy"
else
  SNAPSHOT_PREFIX="snapshots"
fi

TARBALL="/tmp/openclaw-backup-${TIMESTAMP}.tar.gz"
tar -czf "$TARBALL" -C "$STAGING" . 2>/dev/null

TARBALL_SIZE=$(du -sh "$TARBALL" | cut -f1)
log "Created tarball: $TARBALL ($TARBALL_SIZE)"

aws s3 cp "$TARBALL" "s3://$BUCKET/$SNAPSHOT_PREFIX/${TIMESTAMP}.tar.gz" \
  --region "$REGION" \
  --quiet 2>&1 || {
    error "Snapshot upload failed"
    rm -f "$TARBALL"
    exit 1
  }

rm -f "$TARBALL"
log "Snapshot uploaded: s3://$BUCKET/$SNAPSHOT_PREFIX/${TIMESTAMP}.tar.gz"

# ============================================================
# Step 3: Prune old snapshots (keep last 48 hourly + 30 daily)
# Daily snapshots are kept via S3 versioning + lifecycle policy.
# We only prune the snapshots/ prefix to avoid unbounded growth.
# ============================================================
if [ "$PRE_DEPLOY" = false ]; then
  SNAPSHOT_COUNT=$(aws s3 ls "s3://$BUCKET/snapshots/" --region "$REGION" 2>/dev/null | wc -l)
  if [ "$SNAPSHOT_COUNT" -gt 72 ]; then
    # Delete oldest snapshots beyond the retention window
    EXCESS=$((SNAPSHOT_COUNT - 72))
    log "Pruning $EXCESS old snapshots (keeping 72)..."
    aws s3 ls "s3://$BUCKET/snapshots/" --region "$REGION" | \
      sort | head -n "$EXCESS" | \
      awk '{print $4}' | \
      while read -r key; do
        aws s3 rm "s3://$BUCKET/snapshots/$key" --region "$REGION" --quiet 2>/dev/null || true
      done
    log "Pruning complete."
  fi
fi

log "Backup complete: $(du -sh "$PERSIST_DIR" | cut -f1) backed up to s3://$BUCKET/"
