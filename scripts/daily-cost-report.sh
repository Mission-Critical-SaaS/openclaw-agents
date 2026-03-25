#!/bin/bash
# daily-cost-report.sh — Daily API cost report via Anthropic Admin Usage API
# Posts formatted report to Slack #dev and writes JSON to disk.
set -euo pipefail

# ─── dates ───────────────────────────────────────────────────────────────────
TODAY=$(date -u +%Y-%m-%d)
YESTERDAY=$(date -u -d "yesterday" +%Y-%m-%d 2>/dev/null || date -u -v-1d +%Y-%m-%d)
MONTH_START=$(date -u +%Y-%m-01)

REPORT_DIR="/opt/openclaw/logs/cost-reports"
PROACTIVE_LOG="/opt/openclaw/logs/proactive.jsonl"
SLACK_CHANNEL="C086N5031LZ"

mkdir -p "$REPORT_DIR"

# ─── admin API key from AWS Secrets Manager ──────────────────────────────────
ADMIN_KEY=$(aws secretsmanager get-secret-value \
    --secret-id openclaw/anthropic-admin-key \
    --region us-east-1 \
    --query SecretString \
    --output text 2>/dev/null) || true

if [ -z "${ADMIN_KEY:-}" ]; then
    echo "WARNING: Could not retrieve Anthropic admin key from Secrets Manager" >&2
    exit 0
fi

# ─── Anthropic Usage API (token counts by api_key_id) ────────────────────────
USAGE_JSON=$(curl -sf \
    "https://api.anthropic.com/v1/organizations/usage_report/messages?starting_at=${YESTERDAY}T00:00:00Z&ending_at=${TODAY}T00:00:00Z&group_by[]=api_key_id&bucket_width=1d" \
    -H "anthropic-version: 2023-06-01" \
    -H "x-api-key: $ADMIN_KEY" 2>/dev/null) || true

if [ -z "${USAGE_JSON:-}" ]; then
    echo "WARNING: Anthropic Usage API returned no data or failed" >&2
    exit 0
fi

# ─── Anthropic Cost API (dollar amounts by description) ──────────────────────
COST_JSON=$(curl -sf \
    "https://api.anthropic.com/v1/organizations/cost_report?starting_at=${YESTERDAY}T00:00:00Z&ending_at=${TODAY}T00:00:00Z&group_by[]=description&bucket_width=1d" \
    -H "anthropic-version: 2023-06-01" \
    -H "x-api-key: $ADMIN_KEY" 2>/dev/null) || true

# ─── MTD cost data ───────────────────────────────────────────────────────────
MTD_COST_JSON=$(curl -sf \
    "https://api.anthropic.com/v1/organizations/cost_report?starting_at=${MONTH_START}T00:00:00Z&ending_at=${TODAY}T00:00:00Z&group_by[]=description&bucket_width=1d" \
    -H "anthropic-version: 2023-06-01" \
    -H "x-api-key: $ADMIN_KEY" 2>/dev/null) || true

# ─── 30-day average cost data ────────────────────────────────────────────────
THIRTY_DAYS_AGO=$(date -u -d "30 days ago" +%Y-%m-%d 2>/dev/null || date -u -v-30d +%Y-%m-%d)
AVG_COST_JSON=$(curl -sf \
    "https://api.anthropic.com/v1/organizations/cost_report?starting_at=${THIRTY_DAYS_AGO}T00:00:00Z&ending_at=${TODAY}T00:00:00Z&group_by[]=description&bucket_width=1d" \
    -H "anthropic-version: 2023-06-01" \
    -H "x-api-key: $ADMIN_KEY" 2>/dev/null) || true

# ─── proactive scheduler log ─────────────────────────────────────────────────
PROACTIVE_DATA=""
if [ -f "$PROACTIVE_LOG" ]; then
    PROACTIVE_DATA=$(grep "\"${YESTERDAY}" "$PROACTIVE_LOG" 2>/dev/null || true)
elif [ -f "/opt/openclaw/logs/proactive.log" ]; then
    PROACTIVE_DATA=$(grep "\"${YESTERDAY}" "/opt/openclaw/logs/proactive.log" 2>/dev/null || true)
fi

# ─── Slack token ─────────────────────────────────────────────────────────────
SLACK_TOKEN=$(docker exec openclaw-agents-standard printenv SLACK_BOT_TOKEN_SCOUT 2>/dev/null \
    || docker exec openclaw-agents-admin printenv SLACK_BOT_TOKEN_CHIEF 2>/dev/null || true)

if [ -z "${SLACK_TOKEN:-}" ]; then
    echo "WARNING: Could not retrieve Slack token from any container" >&2
fi

# ─── aggregate & format with Python ─────────────────────────────────────────
REPORT=$(python3 << PYEOF
import json, sys, os
from collections import defaultdict

YESTERDAY = "$YESTERDAY"
TODAY = "$TODAY"
REPORT_DIR = "$REPORT_DIR"

# ── pricing (Opus 4-6) per token ──
PRICE_UNCACHED_INPUT = 15.00 / 1_000_000    # \$15 / 1M
PRICE_CACHE_WRITE    = 18.75 / 1_000_000    # \$18.75 / 1M
PRICE_CACHE_READ     = 1.50 / 1_000_000     # \$1.50 / 1M
PRICE_OUTPUT         = 75.00 / 1_000_000    # \$75 / 1M

# ── helpers ──
def fmt_tokens(n):
    if n >= 1_000_000:
        return f"{n / 1_000_000:.1f}M"
    elif n >= 1_000:
        return f"{n / 1_000:.1f}K"
    return str(int(n))

def fmt_cost(v):
    if v >= 1000:
        return f"\${v:,.2f}"
    return f"\${v:.2f}"

# ── parse usage API response ──
try:
    usage = json.loads('''$USAGE_JSON''')
except (json.JSONDecodeError, ValueError):
    usage = {}

# ── parse cost API response ──
try:
    cost_data = json.loads('''$COST_JSON''')
except (json.JSONDecodeError, ValueError):
    cost_data = {}

# ── parse MTD cost ──
try:
    mtd_data = json.loads('''$MTD_COST_JSON''')
except (json.JSONDecodeError, ValueError):
    mtd_data = {}

# ── parse 30-day cost ──
try:
    avg_data = json.loads('''$AVG_COST_JSON''')
except (json.JSONDecodeError, ValueError):
    avg_data = {}

# ── parse proactive scheduler data ──
proactive_lines_raw = '''$PROACTIVE_DATA'''
proactive_tasks = defaultdict(lambda: {"runs": 0, "agent": "unknown"})
for line in proactive_lines_raw.strip().split("\n"):
    line = line.strip()
    if not line:
        continue
    try:
        rec = json.loads(line)
        task = rec.get("task", rec.get("task_id", "unknown"))
        agent = rec.get("agent", "unknown")
        proactive_tasks[task]["runs"] += 1
        proactive_tasks[task]["agent"] = agent
    except (json.JSONDecodeError, ValueError):
        continue

# ── aggregate usage by API key ──
keys = {}
buckets = usage.get("data", [])
for bucket in buckets:
    key_id = bucket.get("api_key_id", "unknown")
    key_name = bucket.get("api_key_name", key_id)
    if key_name not in keys:
        keys[key_name] = {
            "uncached_input": 0,
            "cache_write": 0,
            "cache_read": 0,
            "output": 0,
        }
    k = keys[key_name]
    k["uncached_input"] += bucket.get("input_tokens", 0) - bucket.get("cache_read_input_tokens", 0) - bucket.get("cache_creation_input_tokens", 0)
    k["cache_write"]    += bucket.get("cache_creation_input_tokens", 0)
    k["cache_read"]     += bucket.get("cache_read_input_tokens", 0)
    k["output"]         += bucket.get("output_tokens", 0)

# ── compute estimated cost per key ──
total_uncached = 0
total_cache_write = 0
total_cache_read = 0
total_output = 0
total_est_cost = 0.0

for name in keys:
    k = keys[name]
    est = (
        k["uncached_input"] * PRICE_UNCACHED_INPUT
        + k["cache_write"] * PRICE_CACHE_WRITE
        + k["cache_read"] * PRICE_CACHE_READ
        + k["output"] * PRICE_OUTPUT
    )
    k["est_cost"] = est
    total_uncached    += k["uncached_input"]
    total_cache_write += k["cache_write"]
    total_cache_read  += k["cache_read"]
    total_output      += k["output"]
    total_est_cost    += est

# ── cache efficiency ──
total_cache_eligible = total_cache_write + total_cache_read
cache_hit_rate = (total_cache_read / total_cache_eligible * 100) if total_cache_eligible > 0 else 0.0

# cache savings: what it would have cost if all cached tokens were uncached input
uncached_hypothetical = (
    (total_uncached + total_cache_write + total_cache_read) * PRICE_UNCACHED_INPUT
    + total_output * PRICE_OUTPUT
)
cache_savings = uncached_hypothetical - total_est_cost

# ── MTD and 30-day average from cost API ──
mtd_cost = 0.0
for bucket in mtd_data.get("data", []):
    mtd_cost += bucket.get("cost_in_cents", 0) / 100.0

avg30_cost = 0.0
avg30_days = set()
for bucket in avg_data.get("data", []):
    avg30_cost += bucket.get("cost_in_cents", 0) / 100.0
    ts = bucket.get("started_at", "")[:10]
    if ts:
        avg30_days.add(ts)
avg_daily = avg30_cost / len(avg30_days) if avg30_days else 0.0

# ── build Slack message ──
lines = []
lines.append(f":bar_chart: *Daily API Cost Report — {YESTERDAY}*")
lines.append("")
lines.append("*By API Key:*")
lines.append("| Key Name | Uncached In | Cache Write | Cache Read | Output | Est. Cost |")
lines.append("|----------|-------------|-------------|------------|--------|-----------|")

for name in sorted(keys.keys()):
    k = keys[name]
    lines.append(
        f"| {name} | {fmt_tokens(k['uncached_input'])} | {fmt_tokens(k['cache_write'])} "
        f"| {fmt_tokens(k['cache_read'])} | {fmt_tokens(k['output'])} | {fmt_cost(k['est_cost'])} |"
    )

lines.append(
    f"| *TOTAL* | {fmt_tokens(total_uncached)} | {fmt_tokens(total_cache_write)} "
    f"| {fmt_tokens(total_cache_read)} | {fmt_tokens(total_output)} | {fmt_cost(total_est_cost)} |"
)

lines.append("")
lines.append(
    f"*Cache Efficiency:* {cache_hit_rate:.0f}% hit rate "
    f"({fmt_tokens(total_cache_read)} reads / {fmt_tokens(total_cache_eligible)} total)"
)
lines.append(
    f"*Cache Savings:* ~{fmt_cost(cache_savings)} saved vs uncached "
    f"({fmt_cost(total_est_cost)} actual vs ~{fmt_cost(uncached_hypothetical)} without caching)"
)

# ── proactive task activity ──
if proactive_tasks:
    lines.append("")
    lines.append("*Proactive Task Activity:*")
    lines.append("| Task | Runs | Agent |")
    lines.append("|------|------|-------|")
    for task in sorted(proactive_tasks.keys(), key=lambda t: proactive_tasks[t]["runs"], reverse=True):
        t = proactive_tasks[task]
        lines.append(f"| {task} | {t['runs']} | {t['agent']} |")

lines.append("")
lines.append(f"MTD: {fmt_cost(mtd_cost)} | 30d avg: {fmt_cost(avg_daily)}/day")

slack_msg = "\n".join(lines)

# ── write daily JSON report ──
report_data = {
    "date": YESTERDAY,
    "source": "anthropic-admin-api",
    "by_key": {name: {
        "uncached_input_tokens": k["uncached_input"],
        "cache_write_tokens": k["cache_write"],
        "cache_read_tokens": k["cache_read"],
        "output_tokens": k["output"],
        "est_cost_usd": round(k["est_cost"], 2),
    } for name, k in keys.items()},
    "totals": {
        "uncached_input_tokens": total_uncached,
        "cache_write_tokens": total_cache_write,
        "cache_read_tokens": total_cache_read,
        "output_tokens": total_output,
        "est_cost_usd": round(total_est_cost, 2),
        "cache_hit_pct": round(cache_hit_rate, 1),
        "cache_savings_usd": round(cache_savings, 2),
    },
    "proactive_tasks": {task: dict(info) for task, info in proactive_tasks.items()},
    "mtd_cost_usd": round(mtd_cost, 2),
    "avg_daily_30d_usd": round(avg_daily, 2),
}

report_path = os.path.join(REPORT_DIR, f"{YESTERDAY}.json")
os.makedirs(REPORT_DIR, exist_ok=True)
with open(report_path, "w") as f:
    json.dump(report_data, f, indent=2)

print(slack_msg)
PYEOF
)

if [ -z "${REPORT:-}" ]; then
    echo "WARNING: Python aggregation produced no output" >&2
    exit 0
fi

# ─── post to Slack ───────────────────────────────────────────────────────────
if [ -z "${SLACK_TOKEN:-}" ]; then
    echo "WARNING: No Slack token — report written to disk only" >&2
    echo "Report written to ${REPORT_DIR}/${YESTERDAY}.json"
    exit 0
fi

MSG=$(echo "$REPORT" | python3 -c 'import sys,json; print(json.dumps(sys.stdin.read()))')

RESPONSE=$(curl -s -X POST https://slack.com/api/chat.postMessage \
    -H "Authorization: Bearer $SLACK_TOKEN" \
    -H "Content-Type: application/json" \
    -d "{\"channel\":\"$SLACK_CHANNEL\",\"text\":$MSG}")

if echo "$RESPONSE" | python3 -c 'import sys,json; r=json.load(sys.stdin); sys.exit(0 if r.get("ok") else 1)' 2>/dev/null; then
    echo "Daily cost report posted to #dev"
else
    echo "ERROR: Failed to post to Slack: $RESPONSE" >&2
    exit 1
fi

echo "Report written to ${REPORT_DIR}/${YESTERDAY}.json"
