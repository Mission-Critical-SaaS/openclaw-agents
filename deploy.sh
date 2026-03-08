#!/bin/bash
set -euo pipefail

# OpenClaw Agents - Deployment Script
# Usage: ./deploy.sh [tag|branch]
# Examples:
#   ./deploy.sh              # Deploy latest from main
#   ./deploy.sh v1.2.0       # Deploy specific tag
#   ./deploy.sh production   # Deploy production branch

DEPLOY_DIR="/opt/openclaw"
LOG_FILE="/opt/openclaw/deploy.log"
COMPOSE_FILE="docker-compose.yml"

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" | tee -a "$LOG_FILE"; }

cd "$DEPLOY_DIR"

REF="${1:-main}"
log "=== Starting deployment: ref=$REF ==="

# 1. Pre-flight checks
log "Pre-flight: checking Docker..."
docker info > /dev/null 2>&1 || { log "ERROR: Docker not running"; exit 1; }
docker-compose version > /dev/null 2>&1 || { log "ERROR: docker-compose not found"; exit 1; }

# 2. Fetch latest from remote
log "Fetching latest from origin..."
git fetch origin --tags 2>&1 | tee -a "$LOG_FILE"

# 3. Checkout the target ref
log "Checking out $REF..."
if git rev-parse "refs/tags/$REF" >/dev/null 2>&1; then
    git checkout "tags/$REF" 2>&1 | tee -a "$LOG_FILE"
    log "Checked out tag: $REF"
elif git rev-parse "origin/$REF" >/dev/null 2>&1; then
    git checkout "$REF" 2>&1 | tee -a "$LOG_FILE"
    git pull origin "$REF" 2>&1 | tee -a "$LOG_FILE"
    log "Checked out branch: $REF"
else
    log "ERROR: ref '$REF' not found as tag or branch"
    exit 1
fi

COMMIT=$(git rev-parse --short HEAD)
log "At commit: $COMMIT ($(git log -1 --format='%s'))"

# 4. Stop existing container
log "Stopping existing container..."
docker-compose -f "$COMPOSE_FILE" down 2>&1 | tee -a "$LOG_FILE" || true

# 5. Build if Dockerfile changed
log "Building image..."
docker-compose -f "$COMPOSE_FILE" build 2>&1 | tee -a "$LOG_FILE"

# 6. Start container
log "Starting container..."
docker-compose -f "$COMPOSE_FILE" up -d 2>&1 | tee -a "$LOG_FILE"

# 7. Wait for startup
log "Waiting 60s for gateway startup..."
sleep 60

# 8. Health check
log "Running health checks..."
CONTAINER_STATUS=$(docker ps --filter name=openclaw-agents --format "{{.Status}}" 2>/dev/null)
if [ -z "$CONTAINER_STATUS" ]; then
    log "ERROR: Container not running!"
    docker-compose -f "$COMPOSE_FILE" logs --tail 50 2>&1 | tee -a "$LOG_FILE"
    exit 1
fi
log "Container status: $CONTAINER_STATUS"

# Check mcporter
MCPORTER_OUT=$(docker exec openclaw-agents bash -c '
  while IFS= read -r -d "" line; do export "$line"; done < /proc/1/environ
  mcporter list 2>&1
' 2>&1) || true
log "mcporter: $MCPORTER_OUT"

# Check Slack connections
SLACK_CONNS=$(docker exec openclaw-agents tail -50 /data/logs/openclaw.log 2>/dev/null | grep -c "socket mode connected" || echo 0)
log "Slack connections: $SLACK_CONNS/3"

if echo "$MCPORTER_OUT" | grep -q "3 healthy"; then
    log "=== DEPLOYMENT SUCCESS: All MCP servers healthy ==="
elif echo "$MCPORTER_OUT" | grep -q "healthy"; then
    log "=== DEPLOYMENT PARTIAL: Some MCP servers healthy ==="
else
    log "=== DEPLOYMENT WARNING: MCP servers may need attention ==="
fi

log "Deploy complete. Commit: $COMMIT, Ref: $REF"
log "Logs: $LOG_FILE"
