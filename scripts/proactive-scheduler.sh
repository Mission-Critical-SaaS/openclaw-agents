#!/bin/bash
# Proactive Agent Task Scheduler
#
# Triggers scheduled proactive agent tasks by sending messages through the
# OpenClaw gateway. Each task sends a specific prompt to the appropriate agent,
# triggering their proactive behavior as defined in their IDENTITY.md.
#
# Usage:
#   scripts/proactive-scheduler.sh <task-name>
#   scripts/proactive-scheduler.sh --list
#
# Tasks are triggered by cron entries (see scripts/setup-proactive-cron.sh).
# Each task has a kill switch: set PROACTIVE_PAUSE=true to pause all tasks,
# or PROACTIVE_PAUSE_{AGENT}=true to pause a specific agent.
#
# The scheduler logs all invocations and respects budget caps by letting
# agents self-limit based on .budget-caps.json in their workspace.

set -euo pipefail

LOG_DIR="/opt/openclaw/logs"
LOG_FILE="$LOG_DIR/proactive.log"
PAUSE_FILE="/opt/openclaw/.proactive-pause"

mkdir -p "$LOG_DIR"

log() {
  local msg="[$(date '+%Y-%m-%d %H:%M:%S')] [proactive] $*"
  echo "$msg" >> "$LOG_FILE"
  echo "$msg"
}

# ============================================================
# Kill Switch Checks
# ============================================================
if [ -f "$PAUSE_FILE" ]; then
  log "PAUSED: Global pause file exists ($PAUSE_FILE). Skipping all tasks."
  exit 0
fi

if [ "${PROACTIVE_PAUSE:-false}" = "true" ]; then
  log "PAUSED: PROACTIVE_PAUSE=true. Skipping all tasks."
  exit 0
fi

# ============================================================
# Send a prompt to an agent via the gateway
# ============================================================
send_to_agent() {
  local agent="$1"
  local task_name="$2"
  local prompt="$3"
  local timeout="${4:-120}"

  # Per-agent pause check
  local pause_var="PROACTIVE_PAUSE_$(echo "$agent" | tr '[:lower:]' '[:upper:]')"
  if [ "${!pause_var:-false}" = "true" ]; then
    log "PAUSED: ${pause_var}=true. Skipping ${task_name}."
    return 0
  fi

  log "START: ${task_name} (agent=${agent}, timeout=${timeout}s)"

  local response
  response=$(timeout "$timeout" docker exec openclaw-agents \
    openclaw agent --agent "$agent" \
    --message "$prompt" \
    --timeout "$timeout" 2>&1) || {
    local exit_code=$?
    if [ $exit_code -eq 124 ]; then
      log "TIMEOUT: ${task_name} exceeded ${timeout}s"
    else
      log "ERROR: ${task_name} failed (exit=$exit_code)"
    fi
    return 0  # Non-fatal; don't crash the scheduler
  }

  # Log a summary (first 200 chars of response)
  local summary
  summary=$(echo "$response" | tail -c 200 | tr '\n' ' ')
  log "DONE: ${task_name} — ${summary}"
}

# ============================================================
# Task Definitions
# ============================================================
TASK="${1:-}"

if [ "$TASK" = "--list" ]; then
  cat <<'EOF'
Available proactive tasks:

Phase 1 — Monitoring & Enrichment:
  trak-sprint-health      Daily sprint health check (Trak)
  trak-stale-work         Weekly stale work detection (Trak)
  scout-sla-watchdog      SLA breach monitoring (Scout)
  scout-bug-correlator    Customer bug pattern detection (Scout)
  scribe-doc-staleness    Weekly doc staleness scan (Scribe)

Phase 2 — Code Automation:
  kit-ci-triage           CI failure analysis (Kit)
  trak-deploy-tracker     Post-deploy release summary (Trak)
  scribe-changelog        Post-deploy changelog generation (Scribe)

Phase 3 — Advanced Capabilities:
  trak-issue-enrichment   Jira issue auto-enrichment (Trak)
  scout-ticket-enrichment Zendesk ticket auto-enrichment (Scout)
  kit-auto-fix            Auto-fix PR pipeline (Kit)
  kit-code-quality        Weekly code quality monitor (Kit)
  scribe-knowledge-gap    Monthly knowledge gap analysis (Scribe)
  probe-smoke-test        Post-deploy smoke tests (Probe)
  probe-perf-canary       Weekly performance benchmarks (Probe)
EOF
  exit 0
fi

case "$TASK" in

  # ── Phase 1: Trak ──────────────────────────────────────
  trak-sprint-health)
    send_to_agent "trak" "$TASK" \
      "[PROACTIVE TASK: Sprint Health Monitor]
You are running your daily sprint health check. Do the following:
1. Query Jira for all active sprints across your tracked projects
2. For each active sprint, check: burndown progress, blocked tickets (status=Blocked or has blocker link), tickets added mid-sprint (created after sprint start), unassigned high-priority issues
3. Post a structured morning digest to #dev with: sprint name, days remaining, velocity vs plan, blocked items with owners, scope creep warnings
4. If any ticket has been 'In Progress' for >3 days without a linked PR, flag it
5. Update your KNOWLEDGE.md with today's sprint metrics for trend tracking
Budget: Check .budget-caps.json before making API calls." \
      180
    ;;

  trak-stale-work)
    send_to_agent "trak" "$TASK" \
      "[PROACTIVE TASK: Stale Work Detector]
You are running your weekly stale work detection scan. Do the following:
1. Search GitHub for PRs with no activity in >3 days (no comments, no commits, no reviews)
2. Search Jira for tickets in 'In Progress' for >5 days without linked commits or PRs
3. Search Jira for unassigned issues with priority >= High
4. For each stale item, determine the likely owner and reason for stalling
5. Post an actionable summary to #dev with: item link, owner, days stale, suggested action
6. For blocked PRs (>48h idle), trigger handoff to Kit (handoff: trak-to-kit-blocked-pr)
Budget: Check .budget-caps.json before making API calls." \
      180
    ;;

  # ── Phase 1: Scout ─────────────────────────────────────
  scout-sla-watchdog)
    send_to_agent "scout" "$TASK" \
      "[PROACTIVE TASK: SLA Watchdog]
You are running your SLA breach monitoring check. Do the following:
1. Query Zendesk for all open tickets sorted by age
2. Check each ticket's age against SLA targets: Critical <4h, High <8h, Normal <24h, Low <72h
3. Identify tickets approaching SLA breach (within 25% of deadline)
4. For approaching breaches: post to #support with ticket summary, current age, SLA deadline, and suggested priority bump
5. For already-breached tickets: escalate with urgency indicator
6. Update your KNOWLEDGE.md with SLA compliance metrics
Budget: Check .budget-caps.json before making API calls." \
      120
    ;;

  scout-bug-correlator)
    send_to_agent "scout" "$TASK" \
      "[PROACTIVE TASK: Customer Bug Correlator]
You are running your daily customer bug pattern detection. Do the following:
1. Query Zendesk for tickets created in the last 48 hours
2. Analyze ticket subjects and descriptions for common symptom patterns
3. If 3+ tickets report similar symptoms: create a Jira bug in the MCSP project linking all tickets, then @mention Trak for prioritization (handoff: scout-to-trak-feature-request if it's a feature gap, or scout-to-kit-bug-report if it's a bug)
4. Add internal notes to correlated tickets linking them together
5. Post a summary to #support if patterns were found
Budget: Check .budget-caps.json before making API calls." \
      150
    ;;

  # ── Phase 1: Scribe ────────────────────────────────────
  scribe-doc-staleness)
    send_to_agent "scribe" "$TASK" \
      "[PROACTIVE TASK: Doc Staleness Detector]
You are running your weekly documentation staleness scan. Do the following:
1. Query Notion for all pages in the engineering workspace
2. Identify pages not updated in 90+ days that reference active systems, tools, or processes
3. Check for broken links and references to deprecated features
4. For each stale page: determine the domain owner (Kit for code docs, Trak for process docs, Scout for support docs)
5. Post a staleness report to #dev with: page title, link, last updated date, days stale, suggested owner
6. For stale docs, trigger the scribe-to-all-stale-docs handoff with the relevant agent
7. Update your KNOWLEDGE.md with documentation health metrics
Budget: Check .budget-caps.json before making API calls." \
      180
    ;;

  scribe-changelog)
    send_to_agent "scribe" "$TASK" \
      "[PROACTIVE TASK: Changelog Generator]
You are running the post-deploy changelog generation task. Do the following:
1. Check GitHub for the most recent deployment tag and the previous tag
2. List all PRs merged between those two tags
3. For each PR: extract title, author, and any linked Jira issues
4. Generate a structured changelog entry with: version, date, sections (Features, Fixes, Improvements, Internal)
5. Post the draft changelog to #dev for human review before publishing to Notion
6. Update your KNOWLEDGE.md with the changelog entry
Budget: Check .budget-caps.json before making API calls." \
      120
    ;;

  # ── Phase 2: Kit ───────────────────────────────────────
  kit-ci-triage)
    send_to_agent "kit" "$TASK" \
      "[PROACTIVE TASK: CI Failure Triage]
You are running CI failure analysis. Do the following:
1. Check GitHub Actions for any failed runs on the main branch in the last 24 hours
2. For each failure: analyze the failure logs to identify root cause
3. Categorize the failure: test flake, dependency issue, code regression, infra problem
4. Post a structured summary to #dev with: workflow name, failure type, likely cause, suggested fix
5. If the fix is straightforward (e.g., dependency bump, test fix), offer to create a PR
Budget: Check .budget-caps.json before making API calls." \
      150
    ;;

  # ── Phase 2: Trak ──────────────────────────────────────
  trak-deploy-tracker)
    send_to_agent "trak" "$TASK" \
      "[PROACTIVE TASK: Deployment Tracker]
A deployment just completed. Do the following:
1. Check GitHub for the latest deployment tag and compare with the previous tag
2. List all Jira issues referenced in the merged PRs (from commit messages and PR descriptions)
3. For each Jira issue: update its status or add a comment noting it was deployed
4. Post a release summary to #dev linking: deploy tag, PRs included, Jira issues resolved
5. Update your KNOWLEDGE.md with the deployment record
Budget: Check .budget-caps.json before making API calls." \
      150
    ;;

  # ── Phase 3: Trak ──────────────────────────────────────
  trak-issue-enrichment)
    send_to_agent "trak" "$TASK" \
      "[PROACTIVE TASK: Jira Issue Enrichment]
You are running your issue enrichment scan. Do the following:
1. Query Jira for issues created or updated in the last 30 minutes that do NOT have the 'enriched' label
2. For each unenriched issue (max 10 per run):
   a. Search Notion for related specs/documentation by matching keywords from the issue summary and description
   b. Search Jira for similar past issues using JQL (same component, similar labels, related text)
   c. Search GitHub for recent PRs touching related code paths (use component name or module keywords)
   d. If the issue appears customer-reported, search Zendesk for related tickets
3. Post a structured enrichment comment on each Jira issue containing:
   - Related documentation links (Notion pages with relevance)
   - Similar past issues and their resolutions
   - Suggested acceptance criteria (if the issue has none)
   - Affected components/services based on code analysis
4. Add the 'enriched' label to each processed issue to prevent re-processing
5. Post a brief summary to #dev listing how many issues were enriched
6. Update your KNOWLEDGE.md with enrichment metrics (issues processed, patterns found)
Budget: Check .budget-caps.json before making API calls. Max 10 issues per run." \
      180
    ;;

  # ── Phase 3: Scout ─────────────────────────────────────
  scout-ticket-enrichment)
    send_to_agent "scout" "$TASK" \
      "[PROACTIVE TASK: Zendesk Ticket Auto-Enrichment]
You are running your ticket auto-enrichment scan. Do the following:
1. Query Zendesk for tickets created in the last 15 minutes that do NOT have the 'enriched' tag
2. For each new ticket (max 15 per run):
   a. Search Jira for matching bug reports by keyword match on the ticket subject and description
   b. Check recent deployments (last 24h) from GitHub tags for related changes
   c. Search Zendesk for similar past tickets and their resolutions
3. Add an INTERNAL NOTE (never customer-facing) to each ticket containing:
   - Related Jira issues with status and direct links
   - Recent deploys that might be related (tag, date, relevant PRs)
   - Similar past tickets and how they were resolved
4. Add the 'enriched' tag to each processed ticket to prevent re-processing
5. If a pattern of 3+ similar tickets is detected, trigger handoff to Kit (scout-to-kit-bug-report)
6. Update your KNOWLEDGE.md with enrichment metrics
CRITICAL: Only add internal notes. Never post anything visible to customers.
Budget: Check .budget-caps.json before making API calls." \
      150
    ;;

  # ── Phase 3: Kit ──────────────────────────────────────
  kit-auto-fix)
    send_to_agent "kit" "$TASK" \
      "[PROACTIVE TASK: Auto-Fix PR Pipeline]
You are running the auto-fix PR pipeline. Do the following:
1. Check the openclaw-agents repository for fixable issues:
   a. Run linting checks and identify auto-fixable violations (eslint --fix, formatting)
   b. Check for outdated dependencies with available patch or minor updates (npm outdated)
   c. Check GitHub Security Advisories (Dependabot alerts) for available fixes
2. For each fixable issue (max 3 PRs per run):
   a. Create a feature branch named auto-fix/<description>
   b. Apply the fix (run the auto-formatter, bump the dependency, apply security patch)
   c. Run the test suite to verify the fix doesn't break anything
   d. Create a PR with a clear description: what was fixed, why, risk assessment
   e. Label the PR with 'auto-fix' for easy identification
3. Post a summary to #dev listing PRs created with links and descriptions
4. Update your KNOWLEDGE.md with auto-fix metrics (fixes attempted, PRs created, test results)
SAFETY RULES:
- Only patch/minor dependency updates — NEVER major version bumps
- All PRs require human review before merge
- If tests fail after applying a fix, abandon that fix and note the failure
- Max 3 auto-fix PRs per cron run
Budget: Check .budget-caps.json before making API calls." \
      300
    ;;

  kit-code-quality)
    send_to_agent "kit" "$TASK" \
      "[PROACTIVE TASK: Code Quality Monitor]
You are running the weekly code quality scan. Do the following:
1. Scan the openclaw-agents repository for quality issues:
   a. Identify code complexity hotspots (large functions, deep nesting, high cyclomatic complexity)
   b. Search for dead/unreachable code patterns (unused exports, unreachable branches)
   c. Check test coverage: identify critical paths without test coverage
   d. Find stale TODO/FIXME/HACK comments older than 30 days (check git blame for age)
2. Compile a quality digest with:
   - Top 5 complexity hotspots (file, function, complexity score)
   - Untested critical paths (files with no corresponding test files)
   - Stale TODOs with age and original author
   - Overall health score compared to last week (from KNOWLEDGE.md)
3. Post the quality digest to #dev
4. For simple issues (e.g., removing dead code, fixing TODOs), optionally create auto-fix PRs (label: auto-fix)
5. Update your KNOWLEDGE.md with quality metrics for trend tracking
Budget: Check .budget-caps.json before making API calls." \
      240
    ;;

  # ── Phase 3: Scribe ────────────────────────────────────
  scribe-knowledge-gap)
    send_to_agent "scribe" "$TASK" \
      "[PROACTIVE TASK: Knowledge Gap Analyzer]
You are running the monthly knowledge gap analysis. Do the following:
1. Inventory all Jira projects, components, and recent epics (last 6 months)
2. For each project/component, search Notion for corresponding documentation:
   - Architecture docs, API docs, runbooks, onboarding guides
   - Check for stub pages (created but mostly empty)
3. Identify gaps — features/modules with:
   - No documentation at all ('undocumented')
   - Only stubs or outlines ('stub')
   - Documentation older than 6 months with active recent development ('stale')
4. Create Jira tasks for each significant gap:
   - Clear title: 'Document: [feature/module name]'
   - Description with scope, suggested outline, and related code/PRs
   - Assign to the project that owns the feature
   - Label with 'documentation-gap'
5. Post a knowledge gap report to #dev with:
   - Total documented vs undocumented features
   - Highest-priority gaps (actively developed but undocumented)
   - Stale docs that need refresh
6. Update your KNOWLEDGE.md with gap analysis metrics and trends
Budget: Check .budget-caps.json before making API calls." \
      300
    ;;

  # ── Phase 3: Probe ───────────────────────────────────
  probe-smoke-test)
    send_to_agent "probe" "$TASK" \
      "[PROACTIVE TASK: Post-Deploy Smoke Tests]
A deployment just completed. Run post-deploy smoke tests:
1. Identify the critical user flows from your test knowledge base
2. For each flow: navigate the application via browser, verify expected behavior
3. Capture screenshots at key checkpoints and log any console errors
4. Generate a structured pass/fail report with evidence
5. Post results to #dev: environment, version, each flow pass/fail, screenshots
6. If any flow fails, @mention Kit with failure details (handoff: probe-to-kit-bug-reproduced)
7. Send test results to Trak (handoff: probe-to-trak-test-results)
Budget: Check .budget-caps.json before making API calls." \
      300
    ;;

  probe-perf-canary)
    send_to_agent "probe" "$TASK" \
      "[PROACTIVE TASK: Performance Canary]
Run your weekly performance benchmark:
1. Navigate to each key application page via browser
2. Measure: page load time, network request count, console error count
3. Compare against baselines in your KNOWLEDGE.md
4. If any metric regresses >20%, alert #dev with before/after comparison
5. Update your KNOWLEDGE.md with this week's measurements
Budget: Check .budget-caps.json before making API calls." \
      240
    ;;

  "")
    echo "Usage: $0 <task-name>"
    echo "Run '$0 --list' to see available tasks."
    exit 1
    ;;

  *)
    log "ERROR: Unknown task '$TASK'. Run '$0 --list' to see available tasks."
    exit 1
    ;;
esac
