# Cost Visibility & Token Metering

## Architecture

```
Slack → OpenClaw Gateway → Token Proxy (port 8090) → Anthropic API
                               ↓
                    /data/logs/token-usage.jsonl
                               ↓
              ┌────────────────┴────────────────┐
              │                                 │
    daily-cost-report.sh            token-budget-enforcer.sh
    (posts to #agentic-dev)         (pauses agents at cap)
```

All Anthropic API requests are routed through the **token metering proxy** (`docker/token-proxy/proxy.py`), a lightweight `aiohttp` reverse proxy running as a Docker sidecar. The proxy:

1. Forwards all requests transparently to `api.anthropic.com`
2. Injects `cache_control: {"type": "ephemeral"}` on system prompts for Anthropic prompt caching
3. Extracts `usage` data from API responses (input/output tokens, cache hits)
4. Logs structured JSON per request to `/data/logs/token-usage.jsonl`

Agents are unaware of the proxy — it's configured via `ANTHROPIC_BASE_URL=http://token-proxy:8090` in `docker-compose.yml`.

## Daily Cost Report

**Schedule**: Daily at 10:55 PM ET (cron in `scripts/setup-proactive-cron.sh`)
**Channel**: `#agentic-dev` (C086N5031LZ)
**Script**: `scripts/daily-cost-report.sh`

The report posts a per-agent cost breakdown table showing input/output tokens, cache hit rate, and estimated USD cost. It also includes MTD totals and cache savings.

## Token Budget Caps

**Config**: `config/proactive/token-caps.json`
**Enforcer**: `scripts/token-budget-enforcer.sh` (runs every 15 min)

| Threshold | Action |
|-----------|--------|
| 80% of daily cap | Warning posted to `#openclaw-watchdog` |
| 100% of daily cap | Proactive tasks paused (flag file `/tmp/openclaw-token-pause-{agent}`) |
| Daily reset | Pause flags cleared automatically at midnight |

Token caps complement action-based caps in `budget-caps.json`. Action caps limit integration calls (Jira, Slack). Token caps limit LLM inference cost. Both are enforced independently.

## Prompt Caching

The proxy automatically injects `cache_control: {"type": "ephemeral"}` on the last system message block. This enables Anthropic's server-side prompt caching (5-minute TTL). Cached system prompts cost 90% less on subsequent requests.

**Pricing** (Claude Opus 4-6):
- Input: $15 / 1M tokens
- Output: $75 / 1M tokens
- Cache write: $18.75 / 1M tokens (first request, 25% premium)
- Cache read: $1.50 / 1M tokens (subsequent requests, 90% savings)

## Adjusting Caps

Edit `config/proactive/token-caps.json`:

```json
{
  "defaults": { "daily_input_tokens": 500000, "daily_output_tokens": 50000 },
  "overrides": {
    "kit": { "daily_input_tokens": 800000 }
  },
  "platform": { "daily_usd_cap": 75.00 }
}
```

Deploy after changes: `git push && git tag v1.x.x && git push origin v1.x.x`

## Troubleshooting

| Issue | Check |
|-------|-------|
| No token logs | `docker logs openclaw-token-proxy` — proxy running? |
| Cache miss rate high | Same agent must be called within 5 min for cache hit |
| Agent paused unexpectedly | Check `/tmp/openclaw-token-pause-{agent}` — remove to unpause |
| Cost report missing | Check `/opt/openclaw/logs/cost-report.log` for errors |
| Proxy adds latency | Should be <10ms — check `docker stats openclaw-token-proxy` |

## Rollback

Remove `ANTHROPIC_BASE_URL` from `docker-compose.yml`, redeploy. Agents fall back to direct Anthropic API calls. Token logging stops but agents continue working.
