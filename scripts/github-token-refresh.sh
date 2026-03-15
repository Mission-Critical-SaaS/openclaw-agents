#!/bin/bash
# Background token refresh loop for GitHub App installation tokens.
# Tokens expire after 1 hour; this refreshes every 50 minutes.
# Also runs a health check every 5 minutes to detect early expiration.
# Usage: scripts/github-token-refresh.sh &
#
# IMPORTANT: The token script is run in a subshell (bash, not source)
# so that its `set -e` / `exit 1` cannot kill this refresh loop.
# We capture GITHUB_TOKEN from the subshell's environment via a
# temporary env-dump file.
#
# TOKEN FLOW:
#   1. github-app-token.sh generates a 1-hour installation token
#   2. Token is written to hosts.yml (read by gh CLI) and /tmp/.github-token
#   3. Gateway env does NOT have GITHUB_TOKEN set (unset before gateway start)
#   4. gh CLI reads from hosts.yml → always gets the latest token
#   5. This loop refreshes every 50 min (before the 1-hour expiry)
#   6. Health watchdog validates every 5 min and force-refreshes if stale

set -uo pipefail

REFRESH_INTERVAL=3000   # 50 minutes — refresh before 1-hour expiry
HEALTH_CHECK_INTERVAL=300  # 5 minutes — validate token is still working
LAST_REFRESH=0

# ── Token refresh function ────────────────────────────────────
refresh_token() {
  echo "Refreshing GitHub App token..."

  # Run token generation in a subshell so exit/set -e can't kill us.
  TOKEN_FILE=$(mktemp /tmp/.gh-refresh-XXXXXX)
  if bash -c "source /app/scripts/github-app-token.sh && echo \"\$GITHUB_TOKEN\" > $TOKEN_FILE" 2>&1; then
    NEW_TOKEN=$(cat "$TOKEN_FILE" 2>/dev/null)
    rm -f "$TOKEN_FILE"

    if [ -n "$NEW_TOKEN" ]; then
      export GITHUB_TOKEN="$NEW_TOKEN"

      # Re-auth gh CLI with new token
      if command -v gh &> /dev/null; then
        echo "$GITHUB_TOKEN" | gh auth login --with-token 2>/dev/null || true
        echo "gh CLI re-authenticated with refreshed token"
      fi

      # Persist gh config so ALL processes can authenticate.
      # Write to both user homes (root and openclaw) for coverage.
      for GH_DIR in /home/openclaw/.config/gh /root/.config/gh; do
        mkdir -p "$GH_DIR"
        cat > "$GH_DIR/hosts.yml" <<GHEOF
github.com:
    oauth_token: ${GITHUB_TOKEN}
    user: lmntl-agents[bot]
    git_protocol: https
GHEOF
      done

      # Write token to shared file for the gh wrapper.
      # rm -f first to handle stale files from previous container lifecycle.
      rm -f /tmp/.github-token /tmp/.github-token-expires 2>/dev/null || true
      (umask 077 && echo "$GITHUB_TOKEN" > /tmp/.github-token) || true
      echo $(( $(date +%s) + 3600 )) > /tmp/.github-token-expires 2>/dev/null || true

      LAST_REFRESH=$(date +%s)
      echo "Token refreshed OK at $(date -Iseconds)"
      return 0
    else
      echo "WARNING: Token refresh produced empty token"
      return 1
    fi
  else
    rm -f "$TOKEN_FILE"
    echo "WARNING: Token refresh failed (github-app-token.sh returned non-zero)"
    return 1
  fi
}

# ── Health check function ─────────────────────────────────────
check_token_health() {
  # Quick validation: can gh authenticate with the current token?
  if command -v gh &> /dev/null; then
    if gh auth status 2>&1 | grep -q "Logged in"; then
      return 0  # healthy
    else
      echo "WARNING: gh auth status check failed — token may be expired"
      return 1  # unhealthy
    fi
  fi

  # Fallback: check the expiry timestamp file
  if [ -f /tmp/.github-token-expires ]; then
    EXPIRES=$(cat /tmp/.github-token-expires 2>/dev/null || echo 0)
    NOW=$(date +%s)
    REMAINING=$((EXPIRES - NOW))
    if [ $REMAINING -le 300 ]; then
      echo "WARNING: Token expires in ${REMAINING}s — force refreshing"
      return 1  # about to expire
    fi
  fi

  return 0  # assume healthy if we can't check
}

echo "GitHub token refresh loop started"
echo "  Refresh interval: ${REFRESH_INTERVAL}s (50 min)"
echo "  Health check interval: ${HEALTH_CHECK_INTERVAL}s (5 min)"
echo "  Token auth: via hosts.yml (GITHUB_TOKEN env var is NOT set in gateway)"

# Main loop: health check every 5 min, refresh every 50 min
SECONDS_SINCE_REFRESH=0
while true; do
  sleep $HEALTH_CHECK_INTERVAL
  SECONDS_SINCE_REFRESH=$((SECONDS_SINCE_REFRESH + HEALTH_CHECK_INTERVAL))

  # Check if token is healthy
  if ! check_token_health; then
    echo "Token health check FAILED — force refreshing immediately"
    if refresh_token; then
      SECONDS_SINCE_REFRESH=0
      echo "Emergency refresh succeeded"
    else
      echo "ERROR: Emergency refresh also failed — will retry in ${HEALTH_CHECK_INTERVAL}s"
      # Try with exponential backoff on consecutive failures
      sleep 30
      refresh_token || echo "ERROR: Second retry also failed"
      SECONDS_SINCE_REFRESH=0
    fi
    continue
  fi

  # Scheduled refresh every 50 minutes
  if [ $SECONDS_SINCE_REFRESH -ge $REFRESH_INTERVAL ]; then
    if refresh_token; then
      SECONDS_SINCE_REFRESH=0
    else
      echo "WARNING: Scheduled refresh failed, will retry at next health check"
      # Don't reset counter — we'll try again at the next health check
    fi
  fi
done
