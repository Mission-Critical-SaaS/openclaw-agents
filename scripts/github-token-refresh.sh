#!/bin/bash
# Background token refresh loop for GitHub App installation tokens.
# Tokens expire after 1 hour; this refreshes every 50 minutes.
# Usage: scripts/github-token-refresh.sh &

set -uo pipefail

REFRESH_INTERVAL=3000  # 50 minutes

echo "GitHub token refresh loop started (interval: ${REFRESH_INTERVAL}s)"

while true; do
  sleep $REFRESH_INTERVAL

  echo "Refreshing GitHub App token..."
  if source /app/scripts/github-app-token.sh 2>&1; then
    # Re-auth gh CLI with new token
    if command -v gh &> /dev/null; then
      echo "$GITHUB_TOKEN" | gh auth login --with-token 2>/dev/null || true
      echo "gh CLI re-authenticated with refreshed token"
    fi
    # Write token to shared file so agents can read it
    echo "$GITHUB_TOKEN" > /tmp/.github-token
  else
    echo "WARNING: Token refresh failed, will retry in ${REFRESH_INTERVAL}s"
  fi
done
