#!/bin/bash
# ============================================================
# OpenClaw Agents — Comprehensive Test Runner
# ============================================================
#
# Usage:
#   scripts/run-tests.sh              # Run all tests (unit + E2E)
#   scripts/run-tests.sh --unit       # Unit tests only (no AWS/Slack needed)
#   scripts/run-tests.sh --e2e        # E2E tests only (requires AWS + optional Slack)
#   scripts/run-tests.sh --phase3     # Phase 3 validation only (requires AWS)
#   scripts/run-tests.sh --quick      # Quick smoke test (unit + basic E2E)
#
# Environment variables:
#   AWS_PROFILE=openclaw    (required for E2E tests)
#   SLACK_TEST_TOKEN=xoxp-  (optional, enables Slack connectivity tests)
#
# Exit codes:
#   0 — All tests passed
#   1 — One or more tests failed
#   2 — Configuration error (missing dependencies)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$ROOT_DIR"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Counters
TOTAL_SUITES=0
PASSED_SUITES=0
FAILED_SUITES=0
SKIPPED_SUITES=0

log_header() {
  echo ""
  echo -e "${BLUE}════════════════════════════════════════════════════════════${NC}"
  echo -e "${BLUE}  $1${NC}"
  echo -e "${BLUE}════════════════════════════════════════════════════════════${NC}"
}

log_pass() {
  echo -e "  ${GREEN}✓${NC} $1"
  ((PASSED_SUITES++))
  ((TOTAL_SUITES++))
}

log_fail() {
  echo -e "  ${RED}✗${NC} $1"
  ((FAILED_SUITES++))
  ((TOTAL_SUITES++))
}

log_skip() {
  echo -e "  ${YELLOW}⊘${NC} $1 (skipped)"
  ((SKIPPED_SUITES++))
  ((TOTAL_SUITES++))
}

run_jest_suite() {
  local name="$1"
  local pattern="$2"
  local required="${3:-true}"

  if npx jest "$pattern" --verbose --forceExit 2>&1 | tee /tmp/jest-output-$$.log; then
    log_pass "$name"
  else
    if [ "$required" = "true" ]; then
      log_fail "$name"
    else
      log_skip "$name (optional — see output above)"
    fi
  fi
}

# ── Preflight Checks ────────────────────────────────────────

check_dependencies() {
  log_header "Preflight Checks"

  if ! command -v npx &>/dev/null; then
    echo -e "${RED}ERROR: npx not found. Install Node.js first.${NC}"
    exit 2
  fi
  echo -e "  ${GREEN}✓${NC} npx available"

  if ! [ -f "$ROOT_DIR/node_modules/.package-lock.json" ] && ! [ -d "$ROOT_DIR/node_modules" ]; then
    echo -e "${YELLOW}  Installing dependencies...${NC}"
    npm install --silent
  fi
  echo -e "  ${GREEN}✓${NC} node_modules present"

  if command -v aws &>/dev/null; then
    echo -e "  ${GREEN}✓${NC} AWS CLI available"
    HAS_AWS=true
  else
    echo -e "  ${YELLOW}⊘${NC} AWS CLI not found (E2E tests will be skipped)"
    HAS_AWS=false
  fi

  if [ -n "${SLACK_TEST_TOKEN:-}" ]; then
    echo -e "  ${GREEN}✓${NC} SLACK_TEST_TOKEN set"
    HAS_SLACK=true
  else
    echo -e "  ${YELLOW}⊘${NC} SLACK_TEST_TOKEN not set (Slack connectivity tests will be skipped)"
    HAS_SLACK=false
  fi
}

# ── Test Suites ──────────────────────────────────────────────

run_unit_tests() {
  log_header "Unit Tests (Static Validation)"

  echo "  Running entrypoint validation tests..."
  run_jest_suite "Entrypoint Validation (134+ tests)" "test/entrypoint.test.ts"

  echo "  Running CDK infrastructure tests..."
  run_jest_suite "CDK Infrastructure (22 tests)" "test/openclaw-agents.test.ts"

  echo "  Running cross-agent dispatch tests..."
  run_jest_suite "Cross-Agent Dispatch (100+ tests)" "test/cross-agent-dispatch.test.ts"
}

run_e2e_tests() {
  if [ "$HAS_AWS" = "false" ]; then
    log_header "E2E Tests (SKIPPED — no AWS CLI)"
    log_skip "E2E tests require AWS CLI with 'openclaw' profile"
    return
  fi

  log_header "E2E Tests (Live Infrastructure)"

  echo "  Running core E2E tests..."
  run_jest_suite "Core E2E (infrastructure, container, Slack)" "test/e2e/e2e.test.ts"
}

run_phase3_tests() {
  if [ "$HAS_AWS" = "false" ]; then
    log_header "Phase 3 Validation (SKIPPED — no AWS CLI)"
    log_skip "Phase 3 tests require AWS CLI with 'openclaw' profile"
    return
  fi

  log_header "Phase 3 Validation Tests"

  echo "  Running Phase 3 comprehensive validation..."
  run_jest_suite "Phase 3 Validation (connectivity, channels, handoffs, proactive, configs)" \
    "test/e2e/phase3-validation.test.ts"
}

# ── Report ───────────────────────────────────────────────────

print_report() {
  log_header "Test Results Summary"

  echo ""
  echo -e "  Total suites:   ${TOTAL_SUITES}"
  echo -e "  ${GREEN}Passed:${NC}         ${PASSED_SUITES}"
  if [ "$FAILED_SUITES" -gt 0 ]; then
    echo -e "  ${RED}Failed:${NC}         ${FAILED_SUITES}"
  else
    echo -e "  Failed:         0"
  fi
  if [ "$SKIPPED_SUITES" -gt 0 ]; then
    echo -e "  ${YELLOW}Skipped:${NC}        ${SKIPPED_SUITES}"
  fi
  echo ""

  if [ "$FAILED_SUITES" -gt 0 ]; then
    echo -e "${RED}  ✗ SOME TESTS FAILED${NC}"
    echo ""
    return 1
  else
    echo -e "${GREEN}  ✓ ALL TESTS PASSED${NC}"
    echo ""
    return 0
  fi
}

# ── Main ─────────────────────────────────────────────────────

MODE="${1:-all}"

check_dependencies

case "$MODE" in
  --unit)
    run_unit_tests
    ;;
  --e2e)
    run_e2e_tests
    ;;
  --phase3)
    run_phase3_tests
    ;;
  --quick)
    run_unit_tests
    if [ "$HAS_AWS" = "true" ]; then
      run_e2e_tests
    fi
    ;;
  all|"")
    run_unit_tests
    run_e2e_tests
    run_phase3_tests
    ;;
  *)
    echo "Usage: $0 [--unit|--e2e|--phase3|--quick|all]"
    exit 2
    ;;
esac

print_report
