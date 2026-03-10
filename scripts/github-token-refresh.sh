#!/bin/bash
# Background token refresh loop for GitHub App installation tokens.
# Tokens expire after 1 hour; this refreshes every 50 minutes.
# Usage: scripts/github-token-refresh.sh &
#
# IMPORTANT: The token script is run in a subshell (bash, not source)
# so that its `set -e` / `exit 1` cannot kill this refresh loop.
# We capture GITHUB_TOKEN from the subshell's environment via a
# temporary env-dump file.

set -uo pipefail

REFRESH_INTERVAL=3000  # 50 minutes

echo "GitHub token refresh loop started (interval: ${REFRESH_INTERVAL}s)"

while true; do
  sleep $REFRESH_INTERVAL

  echo "Refreshing GitHub App token..."

  # Run token generation in a subshell so exit/set -e can't kill us.
  # The subshell inherits our env (GH_APP_ID, etc.) and writes the
  # new token to a temp file we can read back.
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

      # Persist gh config so ALL processes (not just PID 1's children)
      # can authenticate.  gh prioritises GITHUB_TOKEN env var when set,
      # but child processes spawned after gateway start won't inherit
      # the updated env var.  Writing hosts.yml ensures gh reads the
      # latest token regardless of how the calling process was spawned.
      mkdir -p /root/.config/gh
      cat > /root/.config/gh/hosts.yml <<GHEOF
github.com:
    oauth_token: ${GITHUB_TOKEN}
    user: lmntl-agents[bot]
    git_protocol: https
GHEOF

      # Write token to shared file so agents can read it
      echo "$GITHUB_TOKEN" > /tmp/.github-token
    else
      echo "WARNING: Token refresh produced empty token, will retry in ${REFRESH_INTERVAL}s"
    fi
  else
    rm -f "$TOKEN_FILE"
    echo "WARNING: Token refresh failed, will retry in ${REFRESH_INTERVAL}s"
  fi
done
