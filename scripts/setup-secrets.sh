#!/bin/bash
# ──────────────────────────────────────────────────────────
# setup-secrets.sh — Store secrets in AWS SSM Parameter Store
# ──────────────────────────────────────────────────────────
# Usage:
#   ./scripts/setup-secrets.sh
#
# Reads from .env file and stores each value as a SecureString
# in SSM Parameter Store under /openclaw/*
# ──────────────────────────────────────────────────────────
set -euo pipefail

ENV_FILE="${1:-.env}"

if [ ! -f "$ENV_FILE" ]; then
  echo "Error: $ENV_FILE not found. Copy .env.example to .env and fill in values."
  exit 1
fi

echo "▶ Storing secrets from ${ENV_FILE} in SSM Parameter Store..."

store_param() {
  local name="$1"
  local value="$2"

  if [ -z "$value" ] || [[ "$value" == *"YOUR_"* ]] || [[ "$value" == *"your-"* ]]; then
    echo "  ⏭  Skipping ${name} (not configured)"
    return
  fi

  aws ssm put-parameter \
    --name "/openclaw/${name}" \
    --type SecureString \
    --value "$value" \
    --overwrite \
    --description "OpenClaw agent secret: ${name}" \
    > /dev/null

  echo "  ✅ /openclaw/${name}"
}

# Read .env and store each key
while IFS='=' read -r key value; do
  # Skip comments and empty lines
  [[ -z "$key" || "$key" =~ ^# ]] && continue
  # Convert KEY_NAME to key-name for SSM
  ssm_name=$(echo "$key" | tr '[:upper:]_' '[:lower:]-')
  store_param "$ssm_name" "$value"
done < "$ENV_FILE"

echo ""
echo "✅ Secrets stored! Verify with:"
echo "  aws ssm get-parameters-by-path --path /openclaw/ --query 'Parameters[].Name'"
