#!/bin/bash
set -euo pipefail

# OpenClaw Integration Test Suite
# Run after any deploy to verify all MCP servers and agent connectivity

PASS=0
FAIL=0
SKIP=0

green() { echo -e "\033[32m$1\033[0m"; }
red() { echo -e "\033[31m$1\033[0m"; }
yellow() { echo -e "\033[33m$1\033[0m"; }

run_test() {
  local name="$1"
  local cmd="$2"
  local expect_pattern="${3:-}"

  echo -n "  Testing: $name ... "
  OUTPUT=$(eval "$cmd" 2>&1) || true

  if [ -n "$expect_pattern" ]; then
    if echo "$OUTPUT" | grep -qi "$expect_pattern"; then
      green "PASS"
      PASS=$((PASS + 1))
      return 0
    else
      red "FAIL"
      echo "    Expected pattern: $expect_pattern"
      echo "    Got: $(echo "$OUTPUT" | head -3)"
      FAIL=$((FAIL + 1))
      return 1
    fi
  else
    if [ $? -eq 0 ] && [ -n "$OUTPUT" ]; then
      green "PASS"
      PASS=$((PASS + 1))
      return 0
    else
      red "FAIL"
      echo "    Output: $(echo "$OUTPUT" | head -3)"
      FAIL=$((FAIL + 1))
      return 1
    fi
  fi
}

echo "========================================"
echo " OpenClaw Integration Test Suite"
echo " $(date -u '+%Y-%m-%d %H:%M:%S UTC')"
echo "========================================"
echo ""

# 1. Gateway health
echo "[1/6] Gateway Process"
run_test "openclaw process running" "pgrep -f 'openclaw gateway' | head -1" "[0-9]"
echo ""

# 2. Slack connectivity
echo "[2/6] Slack Socket Mode"
SLACK_LOG=$(grep -c "socket_mode" /data/logs/openclaw.log 2>/dev/null || echo "0")
if [ "$SLACK_LOG" -gt 0 ]; then
  green "  Slack socket mode entries found in logs"
  PASS=$((PASS + 1))
else
  yellow "  SKIP - Cannot verify Slack from logs alone"
  SKIP=$((SKIP + 1))
fi
echo ""

# 3. MCP Servers via mcporter
echo "[3/6] MCP Server Availability (mcporter)"
run_test "mcporter list servers" "mcporter list 2>&1" "jira\|zendesk\|notion"
echo ""

# 4. Jira integration
echo "[4/6] Jira (Atlassian) Integration"
run_test "Jira - list projects" \
  "mcporter call jira.jira_get path=/rest/api/3/project 2>&1" \
  "key\|name\|id"
run_test "Jira - search with JQL" \
  "mcporter call jira.jira_get path=/rest/api/3/search/jql jql='project=OC ORDER BY created DESC' maxResults=1 2>&1" \
  "issues\|total"
echo ""

# 5. Zendesk integration
echo "[5/6] Zendesk Integration"
run_test "Zendesk - search tickets" \
  "mcporter call zendesk.zendesk_search query='status:open' 2>&1" \
  "results\|count\|ticket"
echo ""

# 6. Notion integration
echo "[6/6] Notion Integration"
run_test "Notion - search" \
  "mcporter call notion.notion_search query='test' 2>&1" \
  "results\|object\|page"
echo ""

# Summary
echo "========================================"
echo " Results: $(green "$PASS passed"), $(red "$FAIL failed"), $(yellow "$SKIP skipped")"
echo "========================================"

if [ "$FAIL" -gt 0 ]; then
  exit 1
fi
exit 0
