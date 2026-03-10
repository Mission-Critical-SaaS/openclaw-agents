#!/bin/bash
# Generate a GitHub App installation access token from a private key.
# Usage: source scripts/github-app-token.sh
# Requires: openssl, curl, jq
# Reads from env: GH_APP_ID, GH_APP_INSTALLATION_ID, GH_APP_PRIVATE_KEY_FILE
# Sets: GITHUB_TOKEN (exported)

set -euo pipefail

GH_APP_ID="${GH_APP_ID:?GH_APP_ID must be set}"
GH_APP_INSTALLATION_ID="${GH_APP_INSTALLATION_ID:?GH_APP_INSTALLATION_ID must be set}"
GH_APP_PRIVATE_KEY_FILE="${GH_APP_PRIVATE_KEY_FILE:?GH_APP_PRIVATE_KEY_FILE must be set}"

if [ ! -f "$GH_APP_PRIVATE_KEY_FILE" ]; then
  echo "ERROR: Private key file not found: $GH_APP_PRIVATE_KEY_FILE" >&2
  exit 1
fi

# Base64url encode (no padding, URL-safe)
b64url() {
  openssl base64 -e -A | tr '+/' '-_' | tr -d '='
}

# Build JWT
NOW=$(date +%s)
IAT=$((NOW - 60))
EXP=$((NOW + 600))

HEADER=$(printf '{"alg":"RS256","typ":"JWT"}' | b64url)
PAYLOAD=$(printf '{"iss":"%s","iat":%d,"exp":%d}' "$GH_APP_ID" "$IAT" "$EXP" | b64url)

SIGNATURE=$(printf '%s.%s' "$HEADER" "$PAYLOAD" | \
  openssl dgst -sha256 -sign "$GH_APP_PRIVATE_KEY_FILE" -binary | b64url)

JWT="${HEADER}.${PAYLOAD}.${SIGNATURE}"

# Exchange JWT for installation access token
RESPONSE=$(curl -s -X POST \
  -H "Authorization: Bearer ${JWT}" \
  -H "Accept: application/vnd.github+json" \
  -H "X-GitHub-Api-Version: 2022-11-28" \
  "https://api.github.com/app/installations/${GH_APP_INSTALLATION_ID}/access_tokens")

TOKEN=$(echo "$RESPONSE" | jq -r '.token // empty')
EXPIRES=$(echo "$RESPONSE" | jq -r '.expires_at // empty')

if [ -z "$TOKEN" ]; then
  echo "ERROR: Failed to get installation token" >&2
  echo "Response: $RESPONSE" >&2
  exit 1
fi

export GITHUB_TOKEN="$TOKEN"
echo "GitHub App token generated (expires: ${EXPIRES})"
