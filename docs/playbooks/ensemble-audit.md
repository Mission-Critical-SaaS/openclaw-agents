# Ensemble Audit Protocol

## Purpose

Every pull request to `main` on any LMNTL-AI repository gets a structured review from the agent ensemble before it can merge. This document defines the ensemble audit protocol — who does what, when, and how.

## How It Works

```
PR opened → GitHub Actions → Slack #sdlc-reviews → Kit leads review
                                                  → Kit @mentions Trak + Scout
                                                  → All 3 respond in thread
                                                  → Kit compiles result → PR comment + status check
```

### Why Slack?

OpenClaw agents run on Slack Socket Mode — there are no webhooks or HTTP endpoints. Slack IS the agent interface. GitHub Actions posts a structured notification to #sdlc-reviews via an Incoming Webhook, and Kit picks it up from there.

## Specialist Agent Integration

All five agents have access to **13 specialist agent personas** stored in `agents/shared/specialists/`. These specialists originate from the LMNTL ensemble audit system and provide deep domain expertise across 7 audit dimensions.

### 7-Dimension Audit Model

| # | Dimension | Primary Agent | Specialist Persona(s) |
|---|-----------|---------------|----------------------|
| 1 | Correctness | Kit | code-review-architect |
| 2 | Security | Kit | security-risk-auditor |
| 3 | UX/Accessibility | Scout | ux-ui-designer |
| 4 | Product-Market Fit | Trak | product-owner |
| 5 | Operations | Kit | devops-engineer + site-reliability-engineer |
| 6 | Architecture | Kit | technical-architect |
| 7 | Test Coverage | Kit | qa-test-engineer |

**Supporting specialists** (cross-cutting, used as needed): data-engineer, implementation-engineer, pr-scope-reviewer, business-analyst, orchestrator-coordinator.

### How It Works

Each human-facing agent "adopts" specialist personas during reviews:

- **Kit** applies 6 specialist methodologies across dimensions 1, 2, 5, 6, 7 (plus pr-scope-reviewer as a pre-check)
- **Trak** applies the product-owner methodology for dimension 4 alongside Jira verification
- **Scout** applies the ux-ui-designer methodology for dimension 3 alongside customer impact assessment

The specialist definitions include systematic checklists, evidence protocols, and anti-hallucination guardrails that each agent follows.

### Evidence Protocol (All Dimensions)

Every finding MUST include:
- **File path and line number(s)**: `src/routes/auth.ts:42-58`
- **Actual code quote**: Show the relevant snippet
- **Verification label**: `VERIFIED` (read actual code) or `UNVERIFIED` (inferred)
- **Severity**: Critical / High / Medium / Low / Informational
- **Scope**: `NEW` (in this PR) or `PRE-EXISTING` (existed before)

Historical false positive rate is ~40-50%. Always verify findings against actual code before flagging.

## Cross-Agent Communication Model

All five agents run as separate Slack bots connected via Socket Mode. Communication constraints:

**Channels** (e.g., #sdlc-reviews, #dev): All agents are present. @mentions using real Slack user IDs are delivered via Socket Mode. Ensemble reviews happen here in threads.

**DMs**: Each DM is a 1:1 conversation between one user and one agent. Agents CANNOT reach each other from DMs — there is no inter-agent message bus. If a user asks an agent about another agent's domain in a DM, the agent should direct them to DM the other agent directly.

**Agent Slack User IDs** (for @mentions in channels):
- Kit ⚡: `U0AKF614URE`
- Scout 🔍: `U0AJLT30KMG`
- Trak 📋: `U0AJEGUSELB`
- Scribe ✍️: `U0AM170694Z`
- Probe 🔬: `U0ALRTLF752`

This is why ensemble reviews MUST happen in a shared channel (#sdlc-reviews), not in DMs.

## Agent Roles

### Kit ⚡ — Code Review Lead (Dimensions 1, 2, 5, 6, 7)

Kit is the ensemble lead. When a PR review notification arrives in #sdlc-reviews:

1. Acknowledges in-thread
2. Fetches PR details, diff, and CI status via `gh` CLI
3. **Applies specialist analysis across 5 dimensions**:
   - **Correctness** (code-review-architect): Logic errors, edge cases, patterns, maintainability
   - **Security** (security-risk-auditor): OWASP Top 10, auth, secrets, tenant isolation
   - **Operations** (devops-engineer + SRE): Deployability, monitoring, performance
   - **Architecture** (technical-architect): Pattern compliance, system design fit
   - **Test Coverage** (qa-test-engineer): Test pyramid, coverage thresholds, regression risk
   - Plus **PR Scope** (pr-scope-reviewer): Is the PR atomic and focused?
4. @mentions Trak and Scout in-thread requesting their dimension checks
5. Waits briefly (~5 min) for responses
6. Compiles the 7-dimension ensemble result and posts as a GitHub PR comment
7. Posts verdict comment with ENSEMBLE_VERDICT markers (the `ensemble-verdict.yml` workflow sets the status check)
8. Transitions the linked Jira issue to "In Review" if approved

### Trak 📋 — Jira Verification + Product-Market Fit (Dimension 4)

When @mentioned by Kit in a review thread:

1. Looks up the Jira issue linked to the PR
2. Verifies: issue exists, in current/next sprint, no blockers, can transition
3. **Applies product-owner specialist**: Assesses strategic alignment, value, scope creep
4. Replies in-thread with combined Jira verification + product-market fit assessment

### Scout 🔍 — Customer Impact + UX/Accessibility (Dimension 3)

When @mentioned by Kit in a review thread:

1. Reads the PR description and diff summary (provided by Kit in thread)
2. Assesses: customer-facing changes, breaking changes, documentation updates
3. **Applies ux-ui-designer specialist**: WCAG 2.1 AA, usability, responsive design (if UI changes)
4. Replies in-thread with combined impact rating + accessibility assessment

## Standardized Result Format

Kit posts this as a GitHub PR comment:

```markdown
## 🔍 Ensemble Code Review (7-Dimension Audit)

| # | Dimension | Status | Agent | Summary |
|---|-----------|--------|-------|---------|
| 1 | Correctness | ✅ | Kit | Tests pass, no logic errors |
| 2 | Security | ✅ | Kit | No OWASP issues, auth correct |
| 3 | UX/Accessibility | ✅ | Scout | No UI changes / WCAG compliant |
| 4 | Product-Market Fit | ✅ | Trak | Aligns with sprint goal, no scope creep |
| 5 | Operations | ✅ | Kit | Deployable, monitoring adequate |
| 6 | Architecture | ✅ | Kit | Follows established patterns |
| 7 | Test Coverage | ✅ | Kit | Coverage meets thresholds |

**Dimensions Passing: 7/7**
**Consensus: APPROVED** ✅
**Jira**: LMNTL-123 → transitioned to "In Review"

<details><summary>Detailed Findings</summary>
[Per-dimension breakdown with evidence citations]
</details>
```

### Status Values

| Dimension | Statuses |
|-----------|----------|
| Correctness, Security, Operations, Architecture, Test Coverage (Kit) | ✅ Pass, ❌ Fail Critical, ⚠️ Pass with Notes |
| UX/Accessibility (Scout) | ✅ Pass, ⚠️ Pass with Notes, ❌ Fail Critical |
| Product-Market Fit (Trak) | ✅ Aligned, ⚠️ Questions, ❌ Misaligned |

### Consensus Rules

- **APPROVED (7/7)**: All dimensions pass (✅ or ⚠️ with non-blocking notes)
- **NEEDS WORK**: Any dimension has a ❌ Fail Critical
- **BLOCKED**: Trak finds Jira blockers or Scout finds critical accessibility violations

Maximum 3 audit rounds before escalation to human leads.

If Trak or Scout don't respond within ~5 minutes, Kit marks them as "Pending" and proceeds. They can update later, and Kit will amend the PR comment.

## GitHub Status Check

The `ensemble-audit.yml` workflow sets a `pending` status check called `ensemble-review` when a PR is opened. Kit updates it to `success` or `failure` after completing the review.

When branch protection requires the `ensemble-review` status check, PRs cannot merge until Kit approves.

Kit posts a verdict comment on the PR with machine-readable markers:

```html
<!-- ENSEMBLE_VERDICT: approved -->
<!-- ENSEMBLE_DIMENSIONS: 7/7 -->
<!-- ENSEMBLE_REVIEWER: kit -->
```

The `ensemble-verdict.yml` workflow detects the comment, validates the author, and sets the `ensemble-review` status check automatically. Kit does NOT call `gh api` directly.

## PR Convention

For the Jira extraction to work, include the Jira issue key in either:
- **PR title**: `LMNTL-123 Add user authentication` (preferred)
- **Branch name**: `feature/LMNTL-123-add-auth`

## Trigger Configuration

The `ensemble-audit.yml` GitHub Actions workflow fires on:
- `opened` — new PR
- `synchronize` — new commits pushed to existing PR
- `ready_for_review` — draft PR marked as ready

It does NOT fire on draft PRs (skipped via `if: github.event.pull_request.draft == false`).

## Setup Checklist

For each repo in the LMNTL-AI org:

- [ ] Copy `.github/workflows/ensemble-audit.yml` and `.github/workflows/ensemble-verdict.yml` to the repo
- [ ] Add `SLACK_BOT_TOKEN_REVIEW` as org or repo secret
- [ ] Configure branch protection on `main`:
  - Require PR before merging
  - Required status checks: `Unit Tests`, `ensemble-review`
  - Require branches up to date
- [ ] Invite agent bots to #sdlc-reviews channel (one-time)

## Cross-Agent Dispatch Protocol

### Agent Bridge Server

A real-time HTTP bridge server enables direct, bidirectional communication between the OpenClaw agents (running on EC2 via Slack Socket Mode) and the LMNTL Agent Ensemble (running as a Cowork session on the LAN).

**Bridge Server**: `http://192.168.1.98:8642` (runs on the host Mac, LAN-accessible)

#### Architecture

```
┌─────────────────┐         ┌──────────────────┐         ┌─────────────────────┐
│  OpenClaw Agents │  curl   │  Agent Bridge    │  curl   │  LMNTL Ensemble     │
│  (EC2 / Slack)   │ ──────> │  Server          │ <────── │  (Cowork Session)   │
│                  │         │  :8642 on Mac    │         │                     │
│  Kit ⚡ Trak 📋  │ <────── │  Long-poll +     │ ──────> │  14 specialists     │
│  Scout 🔍        │  poll   │  Message Queue   │  send   │  7-dimension audit  │
└─────────────────┘         └──────────────────┘         └─────────────────────┘
                                     │
                              cowork-alpha ←→ cowork-bravo
```

#### Protocol

Messages are JSON with structure:
```json
{
  "id": "<uuid>",
  "from": "cowork-alpha",
  "to": "cowork-bravo",
  "type": "audit-trigger",
  "payload": {
    "action": "audit",
    "pr_number": 42,
    "repo": "LMNTL-AI/openclaw-agents"
  },
  "timestamp": "<iso8601>"
}
```

**Message Types**:

| Type | Direction | Purpose |
|------|-----------|---------|
| `audit-trigger` | Alpha → Bravo | Request an audit from the LMNTL ensemble |
| `audit-result` | Bravo → Alpha | Return audit findings (7-dimension scores) |
| `notification` | Either → Either | Status updates, model changes, announcements |
| `request` | Either → Either | General requests (e.g., "what model are you using?") |
| `response` | Either → Either | Replies to requests |

**Agent IDs**:
- `cowork-alpha` — OpenClaw agents (Kit, Trak, Scout)
- `cowork-bravo` — LMNTL Agent Ensemble (14 specialists)

#### Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| `POST` | `/send` | Send a message `{from, to, type, payload}` |
| `GET` | `/receive/<id>` | Long-poll for messages (30s timeout) |
| `GET` | `/messages` | List recent messages (`?since=<timestamp>`) |
| `GET` | `/health` | Health check |
| `POST` | `/register` | Register an agent `{id, name, capabilities}` |
| `GET` | `/agents` | List registered agents |

### Slash Commands

Three slash commands enable human-initiated cross-agent audit operations:

| Command | Agent | Purpose |
|---------|-------|---------|
| `/audit <PR#> [repo]` | Kit | Trigger both OpenClaw ensemble + LMNTL CI audit |
| `/audit-status <PR#> [repo]` | Scout | Check current audit status from both systems |
| `/audit-model <model>` | Trak | Override the Claude model for LMNTL CI audits |

#### `/audit` Flow (Kit)
1. User says `/audit 42` in Slack
2. Kit runs the local OpenClaw 7-dimension review
3. Kit triggers LMNTL's `ensemble-audit.yml` via `workflow_dispatch`
4. Kit sends `audit-trigger` message via the bridge server
5. Both results are compiled and posted as a PR comment

#### `/audit-status` Flow (Scout)
1. User says `/audit-status 42` in Slack
2. Scout checks GitHub PR status checks and comments
3. Scout queries the bridge for `audit-result` messages
4. Scout replies with combined status from both systems

#### `/audit-model` Flow (Trak)
1. User says `/audit-model claude-opus-4-6` in Slack
2. Trak validates the model name
3. Trak sends a `notification` via the bridge with `model-override` payload
4. Next `/audit` will use the specified model

### Workflow Dispatch Integration

The LMNTL CI audit pipeline (`ensemble-audit.yml`) supports `workflow_dispatch`, allowing Kit to trigger audits programmatically:

```bash
gh workflow run ensemble-audit.yml \
  --repo LMNTL-AI/lmntl \
  -f pr_number=42 \
  -f target_repo=LMNTL-AI/openclaw-agents \
  -f audit_model=claude-opus-4-6
```

**Requirements**:
- GitHub token with `workflow` scope for the LMNTL-AI org
- `ANTHROPIC_API_KEY` secret configured in the target repo
- `ensemble-audit.yml` workflow present in the target repo

## Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| No Slack notification on PR | `SLACK_BOT_TOKEN_REVIEW` secret missing | Add the secret to the repo or org |
| Kit doesn't respond | Kit not in #sdlc-reviews channel | Invite Kit bot to the channel |
| Status check stays "pending" | Kit's verdict comment missing or malformed | Check ensemble-verdict.yml workflow runs in Actions tab. Verify comment contains `<!-- ENSEMBLE_VERDICT:` marker exactly. |
| Trak/Scout don't respond | Not in channel or thread was missed | Check channel membership; Kit marks them as "Pending" and proceeds |
| PR can't merge despite approval | Branch protection requires additional checks | Verify required status check names match exactly |
| Bridge server unreachable | Server not running or network issue | Check `curl http://192.168.1.98:8642/health`; restart with `python3 agent-bridge-server.py` |
| LMNTL ensemble not responding | `cowork-bravo` not registered | Check `curl http://192.168.1.98:8642/agents`; LMNTL session needs to register |
| `/audit` workflow_dispatch fails | Missing permissions or workflow | Ensure gh token has `workflow` scope; verify `ensemble-audit.yml` exists in target repo |
| `/audit-model` not taking effect | Model override is per-session | Re-run `/audit-model <model>` after agent restart; model preference doesn't persist |
