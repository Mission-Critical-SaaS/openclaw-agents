# Cost Visibility & Token Metering

## Architecture

```
OpenClaw Gateway → Anthropic API (direct)
                        ↓
              Anthropic Admin Usage API
              (polled by daily-cost-report.sh)
                        ↓
              ┌─────────┴──────────┐
              │                    │
    Slack #dev report    JSON cost-reports/
```

Cost tracking uses the **Anthropic Admin Usage API** to pull per-key, per-model token usage and cost data. No proxy or middleware is needed — the API provides hourly granularity with breakdowns by API key, model, and workspace.

## Daily Cost Report

**Schedule**: Daily at 10:55 PM ET (cron in `scripts/setup-proactive-cron.sh`)
**Channel**: `#dev` (C086N5031LZ)
**Script**: `scripts/daily-cost-report.sh`

The report:
1. Reads the Anthropic Admin API key from SSM (`/openclaw/anthropic-admin-key`)
2. Calls the Usage API (`/v1/organizations/usage_report/messages`) for yesterday's data grouped by API key
3. Calls the Cost API (`/v1/organizations/cost_report`) for dollar amounts
4. Reads proactive scheduler logs to count scheduled task executions
5. Posts a per-key cost breakdown + task activity summary to Slack

## Token Budget Caps

**Config**: `config/proactive/token-caps.json`
**Enforcer**: `scripts/token-budget-enforcer.sh` (runs every 15 min)

| Threshold | Action |
|-----------|--------|
| 80% of daily cap | Warning posted to `#openclaw-watchdog` |
| 100% of daily cap | Proactive tasks paused (flag file `/tmp/openclaw-token-pause-{agent}`) |
| Daily reset | Pause flags cleared automatically at midnight |

## Prompt Caching

OpenClaw 2026.3.23 enables Anthropic prompt caching natively. System prompts (IDENTITY.md, tool schemas) are cached server-side with 5-minute TTL. The Usage API reports cache hits vs misses:

- `cache_creation.ephemeral_5m_input_tokens`: tokens written to cache
- `cache_read_input_tokens`: tokens read from cache (90% cheaper)

Typical cache hit rate: ~82% (measured Mar 23-24, 2026).

**Pricing** (Claude Opus 4-6):
- Uncached input: $15 / 1M tokens
- Cache write (5m): $18.75 / 1M tokens
- Cache read: $1.50 / 1M tokens
- Output: $75 / 1M tokens

## Admin API Setup

The Anthropic Admin API key (`sk-ant-admin...`) is stored in AWS SSM Parameter Store:
- Path: `/openclaw/anthropic-admin-key`
- Type: SecureString
- Region: us-east-1

To rotate: create a new admin key in the [Anthropic Console](https://platform.claude.com/settings/admin-keys), then update SSM:
```bash
aws ssm put-parameter --name /openclaw/anthropic-admin-key --value 'sk-ant-admin...' --type SecureString --overwrite --region us-east-1
```

## Troubleshooting

| Issue | Check |
|-------|-------|
| Cost report empty | Verify admin key in SSM: `aws ssm get-parameter --name /openclaw/anthropic-admin-key --with-decryption` |
| Usage API returns zeros | Data may take 5 min to appear after API calls |
| Agent paused unexpectedly | Check `/tmp/openclaw-token-pause-{agent}` — remove to unpause |
| Cost report not posting | Check `/opt/openclaw/logs/cost-report.log` for errors |
