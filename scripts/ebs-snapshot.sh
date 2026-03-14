#!/bin/bash
# Create an EBS snapshot of the instance's root volume and prune old snapshots.
#
# Usage:
#   scripts/ebs-snapshot.sh           # create snapshot + prune
#   scripts/ebs-snapshot.sh --list    # list existing snapshots
#
# Retention: keeps the last 7 daily snapshots.
# Designed to run via cron on the EC2 instance.

set -euo pipefail

REGION="us-east-1"
RETENTION_DAYS=7
LIST_ONLY=false

for arg in "$@"; do
  case $arg in
    --list) LIST_ONLY=true ;;
  esac
done

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"; }

# Get instance metadata
INSTANCE_ID=$(curl -s http://169.254.169.254/latest/meta-data/instance-id)
VOLUME_ID=$(aws ec2 describe-instances \
  --instance-ids "$INSTANCE_ID" \
  --region "$REGION" \
  --query 'Reservations[0].Instances[0].BlockDeviceMappings[0].Ebs.VolumeId' \
  --output text)

if [ "$LIST_ONLY" = true ]; then
  echo "EBS snapshots for volume $VOLUME_ID:"
  aws ec2 describe-snapshots \
    --filters "Name=volume-id,Values=$VOLUME_ID" "Name=tag:ManagedBy,Values=openclaw-backup" \
    --region "$REGION" \
    --query 'Snapshots[].[SnapshotId,StartTime,State,Description]' \
    --output table
  exit 0
fi

# ============================================================
# Create snapshot
# ============================================================
DESCRIPTION="openclaw-daily-$(date -u +%Y-%m-%d) vol=$VOLUME_ID"
log "Creating EBS snapshot of $VOLUME_ID..."

SNAPSHOT_ID=$(aws ec2 create-snapshot \
  --volume-id "$VOLUME_ID" \
  --description "$DESCRIPTION" \
  --region "$REGION" \
  --tag-specifications "ResourceType=snapshot,Tags=[{Key=Name,Value=openclaw-daily-$(date -u +%Y-%m-%d)},{Key=Project,Value=openclaw},{Key=ManagedBy,Value=openclaw-backup}]" \
  --query 'SnapshotId' \
  --output text)

log "Snapshot created: $SNAPSHOT_ID"

# ============================================================
# Prune old snapshots (keep last $RETENTION_DAYS)
# ============================================================
log "Pruning snapshots older than $RETENTION_DAYS days..."

CUTOFF_DATE=$(date -u -d "$RETENTION_DAYS days ago" +%Y-%m-%dT%H:%M:%S 2>/dev/null || \
  date -u -v-${RETENTION_DAYS}d +%Y-%m-%dT%H:%M:%S 2>/dev/null)

if [ -n "$CUTOFF_DATE" ]; then
  OLD_SNAPSHOTS=$(aws ec2 describe-snapshots \
    --filters "Name=volume-id,Values=$VOLUME_ID" "Name=tag:ManagedBy,Values=openclaw-backup" \
    --region "$REGION" \
    --query "Snapshots[?StartTime<='$CUTOFF_DATE'].SnapshotId" \
    --output text)

  for snap_id in $OLD_SNAPSHOTS; do
    log "  Deleting old snapshot: $snap_id"
    aws ec2 delete-snapshot --snapshot-id "$snap_id" --region "$REGION" 2>/dev/null || true
  done
fi

log "EBS snapshot complete."
