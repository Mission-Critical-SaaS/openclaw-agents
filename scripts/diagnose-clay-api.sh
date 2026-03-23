#!/bin/bash
# ──────────────────────────────────────────────────────────
# Clay API Diagnostic Script
# Runs 5 checks to diagnose Clay API connectivity issues.
# Usage: scripts/diagnose-clay-api.sh
# ──────────────────────────────────────────────────────────
set -uo pipefail

PASS=0
FAIL=0
SECRET_ID="sales-prospecting/clay-api-key"
REGION="us-east-1"

check() {
  local name="$1"
  shift
  echo ""
  echo "── Test: $name ──"
  if "$@"; then
    echo "✅ PASS: $name"
    PASS=$((PASS + 1))
  else
    echo "❌ FAIL: $name"
    FAIL=$((FAIL + 1))
  fi
}

# ── Test 1: AWS access ──────────────────────────────────
test_aws_access() {
  aws sts get-caller-identity --region "$REGION" > /dev/null 2>&1
}

# ── Test 2: Secret exists ───────────────────────────────
test_secret_exists() {
  aws secretsmanager describe-secret \
    --secret-id "$SECRET_ID" \
    --region "$REGION" > /dev/null 2>&1
}

# ── Test 3: Key format ──────────────────────────────────
test_key_format() {
  local key
  key=$(aws secretsmanager get-secret-value \
    --secret-id "$SECRET_ID" \
    --region "$REGION" \
    --query 'SecretString' --output text 2>/dev/null)
  if [ -z "$key" ]; then
    echo "  Key is empty"
    return 1
  fi
  # Clay API keys are non-empty strings; basic sanity check
  local len=${#key}
  if [ "$len" -lt 10 ]; then
    echo "  Key is suspiciously short ($len chars)"
    return 1
  fi
  echo "  Key length: $len chars (looks reasonable)"
  return 0
}

# ── Test 4: Network connectivity to api.clay.com ────────
test_network() {
  curl -sf --max-time 10 -o /dev/null -w "HTTP %{http_code} in %{time_total}s" \
    https://api.clay.com > /dev/null 2>&1
  # Even a 401/403 means network works; only connection failures matter
  curl -sf --max-time 10 -o /dev/null https://api.clay.com 2>/dev/null
  local rc=$?
  # curl exit code 0=ok, 22=HTTP error (still network ok), 6=resolve fail, 7=connect fail, 28=timeout
  if [ "$rc" -eq 0 ] || [ "$rc" -eq 22 ]; then
    echo "  Network reachable (curl exit $rc)"
    return 0
  else
    echo "  Network unreachable (curl exit $rc)"
    return 1
  fi
}

# ── Test 5: Authenticated API call ──────────────────────
test_authenticated_call() {
  local key
  key=$(aws secretsmanager get-secret-value \
    --secret-id "$SECRET_ID" \
    --region "$REGION" \
    --query 'SecretString' --output text 2>/dev/null)
  if [ -z "$key" ]; then
    echo "  Cannot test — no key retrieved"
    return 1
  fi
  local http_code
  http_code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 15 \
    -H "Authorization: Bearer $key" \
    -H "Content-Type: application/json" \
    https://api.clay.com/v3/sources)
  echo "  HTTP status: $http_code"
  if [ "$http_code" -ge 200 ] && [ "$http_code" -lt 400 ]; then
    return 0
  else
    echo "  Expected 2xx/3xx, got $http_code"
    return 1
  fi
}

echo "Clay API Diagnostic — $(date -Iseconds)"
echo "============================================"

check "AWS access (sts get-caller-identity)" test_aws_access
check "Secret exists ($SECRET_ID)" test_secret_exists
check "Key format (non-empty, reasonable length)" test_key_format
check "Network connectivity to api.clay.com" test_network
check "Authenticated API call" test_authenticated_call

echo ""
echo "============================================"
echo "Results: $PASS passed, $FAIL failed (out of 5)"
if [ "$FAIL" -gt 0 ]; then
  echo "⚠️  Some checks failed — review output above."
  exit 1
else
  echo "All checks passed."
  exit 0
fi
