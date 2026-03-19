#!/bin/bash
set -euo pipefail
DEPLOY_DIR="/opt/openclaw"
CONTAINER_NAME="openclaw-agents"
LOG_DIR="/opt/openclaw/logs"
BACKUP_FILE="/opt/openclaw/.last_deploy"
HEALTH_TIMEOUT=300
DRY_RUN=false
ROLLBACK=false
NO_BACKUP=false
FORCE=false
VERSION=""
for arg in "$@"; do
    case $arg in
        --dry-run) DRY_RUN=true ;; --rollback) ROLLBACK=true ;;
        --no-backup) NO_BACKUP=true ;; --force) FORCE=true ;;
        -*) echo "Unknown option: $arg"; exit 1 ;; *) VERSION="$arg" ;;
    esac
done
# Ensure timezone is Eastern Time for cron scheduling
if command -v timedatectl &>/dev/null; then
    timedatectl set-timezone America/New_York 2>/dev/null || true
fi
mkdir -p "$LOG_DIR"
DEPLOY_LOG="$LOG_DIR/deploy-$(date +%Y%m%d-%H%M%S).log"
# NOTE: Do NOT use `exec > >(tee ...)` here. The process substitution
# creates a child process that SSM waits on, causing the SSM command to
# hang even after the script exits. Instead, log explicitly.
log() {
    local msg="[$(date '+%Y-%m-%d %H:%M:%S')] $*"
    echo "$msg"
    echo "$msg" >> "$DEPLOY_LOG"
}
log "OpenClaw Deployment Script v2.0"
cd "$DEPLOY_DIR"
if ! command -v docker &>/dev/null; then log "ERROR: Docker not found"; exit 1; fi
if ! command -v docker-compose &>/dev/null; then log "ERROR: docker-compose not found"; exit 1; fi
CURRENT_COMMIT=$(git rev-parse HEAD)
CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "detached")
log "Current: commit=$CURRENT_COMMIT branch=$CURRENT_BRANCH"
if $ROLLBACK; then
    if [ ! -f "$BACKUP_FILE" ]; then log "ERROR: No backup found"; exit 1; fi
    PREV_COMMIT=$(head -1 "$BACKUP_FILE")
    if [[ ! "$PREV_COMMIT" =~ ^[0-9a-f]{7,40}$ ]]; then
        log "ERROR: Invalid commit hash in backup file: '$PREV_COMMIT'"
        exit 1
    fi
    log "Rolling back to $PREV_COMMIT"
    if ! $FORCE; then read -p "Proceed? [y/N] " c; [[ "$c" != "y" && "$c" != "Y" ]] && exit 0; fi
    VERSION="$PREV_COMMIT"
fi
# Validate VERSION format to prevent injection
[ -z "$VERSION" ] && VERSION="main"
if [[ ! "$VERSION" =~ ^[a-zA-Z0-9._/-]+$ ]]; then
    log "ERROR: Invalid version format: '$VERSION' (allowed: alphanumeric, dots, slashes, hyphens)"
    exit 1
fi
if $DRY_RUN; then
    log "=== DRY RUN ==="
    log "Would deploy: $VERSION (current: $CURRENT_COMMIT)"
    git fetch origin --tags 2>/dev/null
    if git rev-parse "$VERSION" &>/dev/null; then
        TC=$(git rev-parse "$VERSION")
        log "Target commit: $TC"
        [ "$CURRENT_COMMIT" = "$TC" ] && log "Already at target." || git log --oneline "$CURRENT_COMMIT..$TC" 2>/dev/null || git log --oneline -5 "$TC"
    else log "Version '$VERSION' not found locally"; fi
    log "=== DRY RUN COMPLETE ==="; exit 0
fi
if ! $NO_BACKUP; then
    echo "$CURRENT_COMMIT" > "$BACKUP_FILE"
    echo "$(date -Iseconds)" >> "$BACKUP_FILE"
    log "Backup saved: $CURRENT_COMMIT"
fi

# Back up agent data to S3 before deploy (safety net)
if [ -x "$DEPLOY_DIR/scripts/backup-agent-data.sh" ]; then
    log "Backing up agent data to S3 (pre-deploy)..."
    bash "$DEPLOY_DIR/scripts/backup-agent-data.sh" --pre-deploy || log "WARNING: Pre-deploy backup failed (non-fatal)"
fi

# Safety: discard local changes to tracked files before checkout.
# deploy.sh writes .last_deploy (above) which may still be tracked in older
# commits, causing git checkout to fail with "local changes would be overwritten".
# This targeted cleanup prevents that without touching unrelated files.
git checkout -- .last_deploy 2>/dev/null || true
log "Fetching from origin..."
git fetch origin --tags
if git tag -l | grep -q "^${VERSION}$"; then
    log "Deploying tag: $VERSION"; git checkout "$VERSION"
elif git rev-parse "origin/$VERSION" &>/dev/null; then
    log "Deploying branch: $VERSION"
    git checkout "$VERSION" 2>/dev/null || git checkout -b "$VERSION" "origin/$VERSION"
    git pull origin "$VERSION"
elif git rev-parse "$VERSION" &>/dev/null; then
    log "Deploying commit: $VERSION"; git checkout "$VERSION"
else log "ERROR: Version '$VERSION' not found"; exit 1; fi
NEW_COMMIT=$(git rev-parse HEAD)
log "Now at: $NEW_COMMIT"
# Ensure persistent runtime workspace dirs exist (outside git repo, survives checkouts).
# Path matches OpenClaw's runtime workspace: /home/openclaw/.openclaw/.openclaw/workspace-{agent}
for agent in scout trak kit scribe probe chief beacon; do
  mkdir -p "/opt/openclaw-persist/workspace-${agent}"
done
mkdir -p "/opt/openclaw-persist/memory"

# Ensure scripts are executable
chmod +x /opt/openclaw/scripts/*.sh 2>/dev/null || true
if $FORCE; then
    log "Force rebuild (no cache)..."
    docker-compose build --no-cache
else
    log "Building Docker image (cached)..."
    docker-compose build
fi
# Clean up dangling images to prevent disk fill
docker image prune -f 2>/dev/null || true
log "Restarting container..."
docker-compose down && docker-compose up -d
log "Waiting for health (${HEALTH_TIMEOUT}s)..."
ELAPSED=0
while [ $ELAPSED -lt $HEALTH_TIMEOUT ]; do
    sleep 5; ELAPSED=$((ELAPSED + 5))
    CS=$(docker inspect -f '{{.State.Status}}' "$CONTAINER_NAME" 2>/dev/null || echo "not_found")
    if [ "$CS" = "running" ]; then
        MC=$(docker exec "$CONTAINER_NAME" openclaw status 2>/dev/null || echo "not_ready")
        if echo "$MC" | grep -q "tools"; then log "Healthy after ${ELAPSED}s"; break; fi
    fi
    [ $((ELAPSED % 15)) -eq 0 ] && log "Waiting... (${ELAPSED}s, status=$CS)"
done
if [ $ELAPSED -ge $HEALTH_TIMEOUT ]; then
    log "ERROR: Health check timed out"
    [ -f "$BACKUP_FILE" ] && ! $ROLLBACK && log "To rollback: ./deploy.sh --rollback"
    exit 1
fi
log "=== HEALTH REPORT ==="
log "Container: $(docker inspect -f '{{.State.Status}}' $CONTAINER_NAME)"
log "Status:"
timeout 15 docker exec "$CONTAINER_NAME" openclaw status 2>/dev/null | head -20 | while IFS= read -r l; do log "  $l"; done || log "  (status check timed out)"
log "Slack:"
docker logs "$CONTAINER_NAME" 2>&1 | grep -i "socket mode" | tail -6 | while IFS= read -r l; do log "  $l"; done || log "  (no socket mode messages yet)"
log "Previous: $CURRENT_COMMIT | Deployed: $NEW_COMMIT"
log "Log: $DEPLOY_LOG"
log "SUCCESS: Deployment complete!"

# ============================================================
# Post-deploy proactive triggers (non-blocking, fire-and-forget)
# These run in background so the SSM command can return immediately.
# ============================================================
if [ -x "$DEPLOY_DIR/scripts/proactive-scheduler.sh" ] && [ ! -f "$DEPLOY_DIR/.proactive-pause" ]; then
    log "Triggering post-deploy proactive tasks..."
    nohup bash "$DEPLOY_DIR/scripts/proactive-scheduler.sh" scribe-changelog >> "$LOG_DIR/proactive.log" 2>&1 &
    nohup bash "$DEPLOY_DIR/scripts/proactive-scheduler.sh" trak-deploy-tracker >> "$LOG_DIR/proactive.log" 2>&1 &
    nohup bash "$DEPLOY_DIR/scripts/proactive-scheduler.sh" probe-smoke-test >> "$LOG_DIR/proactive.log" 2>&1 &
    log "Post-deploy tasks triggered (running in background)."
fi
