#!/bin/bash
# ──────────────────────────────────────────────────────────
# Apollo API Diagnostic Script
# Runs 5 checks to diagnose Apollo API connectivity issues.
# Usage: scripts/diagnose-apollo-api.sh
# ──────────────────────────────────────────────────────────
set -uo pipefail

PASS=0
FAIL=0
SECRET_ID="sales-prospecting/apollo-api-key"
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
  # Apollo API keys are typically longer alphanumeric strings
  local len=${#key}
  if [ "$len" -lt 20 ]; then
    echo "  Key is suspiciously short ($len chars) — Apollo keys are typically longer alphanumeric strings"
    return 1
  fi
  if ! echo "$key" | grep -qE '^[A-Za-z0-9_-]+$'; then
    echo "  Key contains unexpected characters — Apollo keys are typically alphanumeric"
    return 1
  fi
  echo "  Key length: $len chars (looks reasonable for Apollo)"
  return 0
}

# ── Test 4: Network connectivity to api.apollo.io ──────
test_network() {
  curl -sf --max-time 10 -o /dev/null -w "HTTP %{http_code} in %{time_total}s" \
    https://api.apollo.io > /dev/null 2>&1
  # Even a 401/403 means network works; only connection failures matter
  curl -sf --max-time 10 -o /dev/null https://api.apollo.io 2>/dev/null
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
    -X POST \
    -H "x-api-key: $key" \
    -H "Content-Type: application/json" \
    -d '{"person_titles":["CEO"],"q_organization_domains":"apollo.io","per_page":1}' \
    https://api.apollo.io/api/v1/mixed_people/search)
  echo "  HTTP status: $http_code"
  if [ "$http_code" -ge 200 ] && [ "$http_code" -lt 400 ]; then
    return 0
  else
    echo "  Expected 2xx/3xx, got $http_code"
    return 1
  fi
}

echo "Apollo API Diagnostic — $(date -Iseconds)"
echo "============================================"

check "AWS access (sts get-caller-identity)" test_aws_access
check "Secret exists ($SECRET_ID)" test_secret_exists
check "Key format (non-empty, alphanumeric, reasonable length)" test_key_format
check "Network connectivity to api.apollo.io" test_network
check "Authenticated API call (mixed_people/search)" test_authenticated_call

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
