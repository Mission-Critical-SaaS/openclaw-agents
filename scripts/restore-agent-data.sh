#!/bin/bash
# Restore agent memories and workspaces from S3 backup.
#
# Usage:
#   scripts/restore-agent-data.sh                              # restore from latest sync
#   scripts/restore-agent-data.sh --snapshot 2026-03-14-120000 # restore specific snapshot
#   scripts/restore-agent-data.sh --list                       # list available snapshots
#   scripts/restore-agent-data.sh --dry-run                    # show what would be restored
#
# This script is designed for two scenarios:
#   1. Instance recreation: new EC2, empty /opt/openclaw-persist
#   2. Data corruption recovery: restore from a known-good snapshot
#
# The script STOPS the container before restoring to prevent SQLite
# corruption, then restarts it after.

set -euo pipefail

PERSIST_DIR="/opt/openclaw-persist"
BUCKET="openclaw-agent-backups"
REGION="us-east-1"
# 2-container tier isolation: must stop/start both containers
ADMIN_CONTAINER="openclaw-agents-admin"
STANDARD_CONTAINER="openclaw-agents-standard"
SNAPSHOT=""
DRY_RUN=false
LIST_ONLY=false

for arg in "$@"; do
  case $arg in
    --snapshot) shift; SNAPSHOT="${1:-}" ;;
    --list) LIST_ONLY=true ;;
    --dry-run) DRY_RUN=true ;;
    --snapshot=*) SNAPSHOT="${arg#*=}" ;;
    -*) echo "Unknown option: $arg"; exit 1 ;;
    *) [ -z "$SNAPSHOT" ] && SNAPSHOT="$arg" ;;
  esac
  shift 2>/dev/null || true
done

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"; }
error() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] ERROR: $*" >&2; }

# ============================================================
# List mode
# ============================================================
if [ "$LIST_ONLY" = true ]; then
  echo "Available snapshots:"
  echo ""
  echo "=== Hourly snapshots ==="
  aws s3 ls "s3://$BUCKET/snapshots/" --region "$REGION" 2>/dev/null | \
    awk '{printf "  %s %s  %s\n", $1, $2, $4}' | tail -20
  echo ""
  echo "=== Pre-deploy snapshots ==="
  aws s3 ls "s3://$BUCKET/pre-deploy/" --region "$REGION" 2>/dev/null | \
    awk '{printf "  %s %s  %s\n", $1, $2, $4}' | tail -10
  echo ""
  echo "=== Latest sync ==="
  aws s3 ls "s3://$BUCKET/latest/" --region "$REGION" --recursive 2>/dev/null | wc -l | \
    xargs -I{} echo "  {} files in latest/"
  exit 0
fi

# ============================================================
# Determine restore source
# ============================================================
if [ -n "$SNAPSHOT" ]; then
  # Try snapshots/ first, then pre-deploy/
  SNAPSHOT_KEY="snapshots/${SNAPSHOT}.tar.gz"
  if ! aws s3 ls "s3://$BUCKET/$SNAPSHOT_KEY" --region "$REGION" &>/dev/null; then
    SNAPSHOT_KEY="pre-deploy/${SNAPSHOT}.tar.gz"
    if ! aws s3 ls "s3://$BUCKET/$SNAPSHOT_KEY" --region "$REGION" &>/dev/null; then
      error "Snapshot not found: $SNAPSHOT (checked snapshots/ and pre-deploy/)"
      echo "Run with --list to see available snapshots."
      exit 1
    fi
  fi
  RESTORE_MODE="snapshot"
  log "Restore source: s3://$BUCKET/$SNAPSHOT_KEY"
else
  RESTORE_MODE="latest"
  log "Restore source: s3://$BUCKET/latest/"
fi

# ============================================================
# Dry run
# ============================================================
if [ "$DRY_RUN" = true ]; then
  log "DRY RUN — would restore to $PERSIST_DIR"
  if [ "$RESTORE_MODE" = "snapshot" ]; then
    log "Would download and extract: s3://$BUCKET/$SNAPSHOT_KEY"
  else
    log "Would sync from: s3://$BUCKET/latest/"
  fi
  log "Would stop containers: $ADMIN_CONTAINER, $STANDARD_CONTAINER"
  log "Would restart container after restore"
  exit 0
fi

# ============================================================
# Safety: create a local backup before overwriting
# ============================================================
if [ -d "$PERSIST_DIR" ] && [ "$(ls -A "$PERSIST_DIR" 2>/dev/null)" ]; then
  SAFETY_BACKUP="/tmp/openclaw-pre-restore-$(date -u +%Y%m%d-%H%M%S).tar.gz"
  log "Creating safety backup: $SAFETY_BACKUP"
  tar -czf "$SAFETY_BACKUP" -C "$PERSIST_DIR" . 2>/dev/null || true
  log "Safety backup created ($(du -sh "$SAFETY_BACKUP" | cut -f1))"
fi

# ============================================================
# Stop container to prevent SQLite corruption
# ============================================================
log "Stopping containers..."
docker stop "$ADMIN_CONTAINER" "$STANDARD_CONTAINER" 2>/dev/null || true
sleep 3

# ============================================================
# Restore
# ============================================================
mkdir -p "$PERSIST_DIR"

if [ "$RESTORE_MODE" = "snapshot" ]; then
  TARBALL="/tmp/openclaw-restore-$(date -u +%s).tar.gz"
  log "Downloading snapshot..."
  aws s3 cp "s3://$BUCKET/$SNAPSHOT_KEY" "$TARBALL" --region "$REGION" --quiet

  log "Extracting to $PERSIST_DIR..."
  tar -xzf "$TARBALL" -C "$PERSIST_DIR"
  rm -f "$TARBALL"
else
  log "Syncing from s3://$BUCKET/latest/..."
  aws s3 sync "s3://$BUCKET/latest/" "$PERSIST_DIR/" \
    --region "$REGION" \
    --delete \
    --quiet
fi

# ============================================================
# Fix permissions
# ============================================================
chown -R root:root "$PERSIST_DIR"
chmod -R 755 "$PERSIST_DIR"

# ============================================================
# Restart container
# ============================================================
log "Starting containers..."
docker start "$ADMIN_CONTAINER" "$STANDARD_CONTAINER" 2>/dev/null || {
  error "Containers failed to start. Check: docker logs $ADMIN_CONTAINER / $STANDARD_CONTAINER"
  exit 1
}

sleep 5
if docker ps --format '{{.Names}}' | grep -q "$ADMIN_CONTAINER" && docker ps --format '{{.Names}}' | grep -q "$STANDARD_CONTAINER"; then
  log "Both containers are running."
else
  error "One or both containers are not running after restore."
  exit 1
fi

log "Restore complete."
log "  Source: ${RESTORE_MODE} ${SNAPSHOT:-}"
log "  Target: $PERSIST_DIR"
log "  Contents:"
du -sh "$PERSIST_DIR"/* 2>/dev/null | sed 's/^/    /'
