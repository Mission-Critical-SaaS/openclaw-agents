# Ensemble Audit Protocol

## Purpose

Every pull request to `main` on any LMNTL-AI repository gets a structured review from all three agents before it can merge. This document defines the ensemble audit protocol — who does what, when, and how.

## How It Works

```
PR opened → GitHub Actions → Slack #sdlc-reviews → Kit leads review
                                                  → Kit @mentions Trak + Scout
                                                  → All 3 respond in thread
                                                  → Kit compiles result → PR comment + status check
```

### Why Slack?

OpenClaw agents run on Slack Socket Mode — there are no webhooks or HTTP endpoints. Slack IS the agent interface. GitHub Actions posts a structured notification to #sdlc-reviews via an Incoming Webhook, and Kit picks it up from there.

## Agent Roles

### Kit ⚡ — Code Review (Lead)

Kit is the ensemble lead. When a PR review notification arrives in #sdlc-reviews:

1. Acknowledges in-thread
2. Fetches PR details, diff, and CI status via `gh` CLI
3. Analyzes: code quality, test coverage, security, pattern compliance, breaking changes
4. @mentions Trak and Scout in-thread requesting their checks
5. Waits briefly (~5 min) for responses
6. Compiles the ensemble result and posts as a GitHub PR comment
7. Updates the `ensemble-review` GitHub status check (success/failure)
8. Transitions the linked Jira issue to "In Review" if approved

### Trak 📋 — Jira Verification

When @mentioned by Kit in a review thread:

1. Looks up the Jira issue linked to the PR
2. Verifies: issue exists, in current/next sprint, no blockers, can transition
3. Replies in-thread with verification status

### Scout 🔍 — Customer Impact Assessment

When @mentioned by Kit in a review thread:

1. Reads the PR description and diff summary (provided by Kit in thread)
2. Assesses: customer-facing changes, breaking changes, documentation updates
3. Replies in-thread with impact rating (None / Low / Medium / High)

## Standardized Result Format

Kit posts this as a GitHub PR comment:

```markdown
## 🔍 Ensemble Code Review

| Agent | Status | Summary |
|-------|--------|---------|
| ⚡ Kit (Code) | ✅ Approved | Tests pass, no security issues, follows patterns |
| 📋 Trak (Jira) | ✅ Verified | LMNTL-123 linked, in Sprint 3, can transition |
| 🔍 Scout (Impact) | ✅ Low Impact | Internal refactor, no customer-facing changes |

**Consensus: APPROVED** ✅
**Jira**: LMNTL-123 → transitioned to "In Review"
```

### Status Values

| Agent | Statuses |
|-------|----------|
| Kit | ✅ Approved, ❌ Needs Work, ⚠️ Approved with Comments |
| Trak | ✅ Verified, ⚠️ Issue (e.g., not in sprint), ❌ Blocked |
| Scout | ✅ None/Low Impact, ⚠️ Medium Impact, ❌ High Impact |

### Consensus Rules

- **APPROVED**: All three agents green (✅)
- **APPROVED WITH COMMENTS**: Kit approves, minor issues from Trak/Scout (⚠️)
- **NEEDS WORK**: Kit finds code issues (❌)
- **BLOCKED**: Trak finds Jira blockers (❌) or Scout finds high impact without mitigation (❌)

If Trak or Scout don't respond within ~5 minutes, Kit marks them as "Pending" and proceeds. They can update later, and Kit will amend the PR comment.

## GitHub Status Check

The `pr-review-trigger.yml` workflow sets a `pending` status check called `ensemble-review` when a PR is opened. Kit updates it to `success` or `failure` after completing the review.

When branch protection requires the `ensemble-review` status check, PRs cannot merge until Kit approves.

```bash
# Kit sets success
gh api repos/LMNTL-AI/<repo>/statuses/<sha> \
  -f state=success -f description="Ensemble review: APPROVED" -f context="ensemble-review"

# Kit sets failure
gh api repos/LMNTL-AI/<repo>/statuses/<sha> \
  -f state=failure -f description="Ensemble review: NEEDS WORK" -f context="ensemble-review"
```

## PR Convention

For the Jira extraction to work, include the Jira issue key in either:
- **PR title**: `LMNTL-123 Add user authentication` (preferred)
- **Branch name**: `feature/LMNTL-123-add-auth`

## Trigger Configuration

The `pr-review-trigger.yml` GitHub Actions workflow fires on:
- `opened` — new PR
- `synchronize` — new commits pushed to existing PR
- `ready_for_review` — draft PR marked as ready

It does NOT fire on draft PRs (skipped via `if: github.event.pull_request.draft == false`).

## Setup Checklist

For each repo in the LMNTL-AI org:

- [ ] Copy `.github/workflows/pr-review-trigger.yml` to the repo
- [ ] Add `SLACK_WEBHOOK_SDLC_REVIEWS` as org or repo secret
- [ ] Configure branch protection on `main`:
  - Require PR before merging
  - Required status checks: `Unit Tests`, `ensemble-review`
  - Require branches up to date
- [ ] Invite agent bots to #sdlc-reviews channel (one-time)

## Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| No Slack notification on PR | `SLACK_WEBHOOK_SDLC_REVIEWS` secret missing | Add the secret to the repo or org |
| Kit doesn't respond | Kit not in #sdlc-reviews channel | Invite Kit bot to the channel |
| Status check stays "pending" | Kit review didn't complete | Check #sdlc-reviews for errors; manually set status via `gh api` |
| Trak/Scout don't respond | Not in channel or thread was missed | Check channel membership; Kit marks them as "Pending" and proceeds |
| PR can't merge despite approval | Branch protection requires additional checks | Verify required status check names match exactly |
