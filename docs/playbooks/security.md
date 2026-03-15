# Security Operations Playbook

## Overview

The OpenClaw agent ensemble (Scout, Trak, Kit, Scribe, Probe) implements a 5-layer security model to protect against unauthorized actions, accidents, and abuse. This playbook covers day-to-day security operations.

## Security Architecture

```
Layer 1: allowFrom List ─────── Infrastructure ─── Hard block on unauthorized Slack users
Layer 2: User Tiers (RBAC) ──── Advisory + Config ─ Permission checks before actions
Layer 3: Dangerous Action Guards  Advisory + Config ─ Confirmation protocols for destructive ops
Layer 4: Action Attribution ───── Advisory ────────── Audit trail in Slack message history
Layer 5: Anomaly Detection ───── Infrastructure ──── External cron scanning for unusual patterns
```

**Advisory controls** rely on Claude following IDENTITY.md instructions. This is very reliable in practice — Claude treats system prompt instructions as near-mandatory. But it's not cryptographic enforcement. The infrastructure controls (Layers 1 and 5) provide a backstop.

## User Tier Management

### Tier Definitions

| Tier | Description | Key Permissions |
|------|-------------|----------------|
| `admin` | Org owners, lead devs | Full access including delete, bulk ops, admin |
| `developer` | Standard dev access | Read, write, deploy — no delete or bulk |
| `support` | Support team | Read, write-tickets, write-comments only |

### Adding a New User

1. Get the user's Slack user ID (from their Slack profile → "Copy member ID")
2. Add them to `SLACK_ALLOW_FROM` in AWS Secrets Manager (gives them gateway access)
3. Add their Slack user ID to `config/user-tiers.json`:
   - Add to the appropriate tier's `users` array
   - Add to the `tier_lookup` map with their tier name
4. Follow the SDLC pipeline: branch → commit → test → PR → merge → tag → deploy

### Changing a User's Tier

1. Update `tier_lookup` in `config/user-tiers.json`
2. Move their ID between tier `users` arrays
3. Deploy via standard SDLC pipeline

### Removing a User

1. Remove from `SLACK_ALLOW_FROM` in AWS Secrets Manager (blocks gateway access immediately)
2. Remove from `config/user-tiers.json` (cleanup)
3. Deploy via standard SDLC pipeline

**Important**: Removing from `SLACK_ALLOW_FROM` takes immediate effect on next gateway restart. Removing from `user-tiers.json` is for consistency — the gateway blocks them before tier checks happen.

### Unknown Users

Users not in `tier_lookup` are automatically treated as `support` tier (most restrictive). Combined with `allowFrom` list enforcement at the gateway level, this means:
- If they're in `allowFrom` but not in `tier_lookup` → they get support-tier access
- If they're not in `allowFrom` → they can't reach the agents at all

## Dangerous Action Review

### Confirmation Levels

| Level | What Happens |
|-------|-------------|
| `none` | No confirmation needed |
| `explicit` | Agent asks "Are you sure?" and waits for yes/confirm |
| `double` | Agent states consequences, asks for confirmation phrase, asks once more |

### Adding a New Dangerous Action

1. Edit `config/dangerous-actions.json`
2. Add an entry to the `dangerous_actions` array:
   ```json
   {
     "pattern": "service_name_action_type",
     "description": "Human-readable description",
     "min_tier": "admin|developer|support",
     "confirmation": "none|explicit|double",
     "consequence": "What happens if this action is executed"
   }
   ```
3. Deploy via standard SDLC pipeline

### Naming Conventions for Patterns

Format: `{service}_{action}` — examples:
- `jira_delete_issue`, `jira_bulk_transition`
- `zendesk_delete_ticket`, `zendesk_public_reply`
- `github_force_push`, `github_merge_pr`
- `notion_delete_page`, `notion_bulk_edit`
- `zoho_delete_record`, `zoho_bulk_update`

## Audit Trail

### How It Works

Every external tool call emits a structured audit line in the Slack conversation:
```
📝 AUDIT | 2026-03-12T14:30:00Z | user:U082DEF37PC | tier:admin | agent:kit | action:github_merge_pr | target:LMNTL-AI/openclaw-agents#42 | result:success
```

These lines are searchable via Slack's search API, creating a distributed audit log across all agent conversations.

### Querying the Audit Trail

Use `scripts/audit-query.sh`:

```bash
# All actions by a specific user
./scripts/audit-query.sh --user U082DEF37PC

# All Kit actions in the last week
./scripts/audit-query.sh --agent kit --since 2026-03-05

# All delete operations
./scripts/audit-query.sh --action "delete"

# Export as CSV
./scripts/audit-query.sh --since 2026-03-01 --format csv > audit-march.csv

# Export as JSON
./scripts/audit-query.sh --user U08FP393H4J --format json
```

**Requirements**: `SLACK_BOT_TOKEN` environment variable with `search:read` scope.

## Anomaly Detection

### Setup

Run `scripts/anomaly-alert.sh` as a cron job:

```bash
# Check every 15 minutes
*/15 * * * * SLACK_BOT_TOKEN=xoxb-... SLACK_WEBHOOK_ALERTS=https://hooks.slack.com/... /path/to/scripts/anomaly-alert.sh
```

### What It Detects

| Check | Threshold | Alert Level |
|-------|-----------|-------------|
| High action volume per user | > 20 actions/hour | ⚠️ Warning |
| Bulk operations | Any | ⚠️ Warning |
| Delete operations | Any | 🚨 Critical |
| Unknown user IDs | Any action | 🚨 Critical |
| Off-hours actions | Before 7am or after 9pm | ⚠️ Warning |
| Repeated failures | 3+ failures per user | ⚠️ Warning |

### Testing

```bash
# Dry run — prints alerts to stdout
./scripts/anomaly-alert.sh --dry-run

# Custom threshold
./scripts/anomaly-alert.sh --threshold 10 --dry-run

# Check last 4 hours
./scripts/anomaly-alert.sh --check-hours 4 --dry-run
```

## Incident Response

### Suspicious Activity Detected

1. **Check the anomaly alert** — what pattern was flagged?
2. **Query the audit trail** for the flagged user:
   ```bash
   ./scripts/audit-query.sh --user <USER_ID> --since <DATE>
   ```
3. **Assess severity**:
   - Delete operations on production data → **Critical** — consider removing from allowFrom immediately
   - Unusual volume → **Warning** — may be legitimate bulk work, verify with the user
   - Off-hours → **Low** — may just be different timezone
4. **If confirmed malicious**: Remove the user's Slack ID from `SLACK_ALLOW_FROM` in AWS Secrets Manager, then restart the gateway

### Emergency User Lockout

To immediately block a user:

1. Remove their Slack user ID from `SLACK_ALLOW_FROM` in AWS Secrets Manager
2. Restart the OpenClaw gateway on EC2:
   ```bash
   # Via SSM (emergency only — normally use SDLC pipeline)
   aws ssm send-command --instance-ids i-0acd7169101e93388 \
     --document-name "AWS-RunShellScript" \
     --parameters 'commands=["cd /data && docker-compose restart"]'
   ```
3. Follow up with proper `user-tiers.json` update via SDLC pipeline

**Note**: This SSM command is an emergency exception to the "never use SSM for changes" SDLC policy. Document the emergency and the follow-up SDLC change in the incident thread.

## Onboarding New Support Team Members

1. **Create their Slack account** (if they don't have one)
2. **Add to `SLACK_ALLOW_FROM`** in AWS Secrets Manager
3. **Add to `config/user-tiers.json`** as `support` tier
4. **Brief them on agent capabilities**:
   - They can ask agents to read data from any system (Jira, Zendesk, Notion, etc.)
   - They can ask agents to create/update Zendesk tickets and add comments
   - They CANNOT ask agents to delete anything, perform bulk operations, or deploy
   - All their actions are attributed and logged
5. **Point them to the right agents**:
   - @Scout for Zendesk tickets and customer issues
   - @Trak for Jira status and project updates
   - @Kit for engineering questions (read-only for support tier)

## Files Reference

| File | Purpose | Deployed To |
|------|---------|-------------|
| `config/user-tiers.json` | RBAC tier definitions | Each agent's workspace as `.user-tiers.json` |
| `config/dangerous-actions.json` | Destructive action registry | Each agent's workspace as `.dangerous-actions.json` |
| `agents/*/workspace/IDENTITY.md` | Security instructions per agent | Agent system prompt |
| `scripts/audit-query.sh` | Audit trail query tool | Run manually or in CI |
| `scripts/anomaly-alert.sh` | Anomaly detection cron | Run as cron job on monitoring server |
| `entrypoint.sh` | Injects security configs at deploy | EC2 instance |
