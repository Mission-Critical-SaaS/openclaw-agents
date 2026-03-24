#!/usr/bin/env bash
# daily-cost-report.sh — Generate daily API cost report and post to Slack #agentic-dev
set -euo pipefail

TODAY=$(date +%Y-%m-%d)
LOG_DIR="/opt/openclaw/logs/token-usage"
REPORT_DIR="/opt/openclaw/logs/cost-reports"
SLACK_CHANNEL="C086N5031LZ"

mkdir -p "$REPORT_DIR"

# Retrieve Slack token from running containers
SLACK_TOKEN=$(docker exec openclaw-agents-standard printenv SLACK_BOT_TOKEN_SCOUT 2>/dev/null \
    || docker exec openclaw-agents-admin printenv SLACK_BOT_TOKEN_CHIEF 2>/dev/null)

if [ -z "$SLACK_TOKEN" ]; then
    echo "ERROR: Could not retrieve Slack token from any container" >&2
    exit 1
fi

# Aggregate token usage with Python (bash can't do float math)
REPORT=$(python3 << 'PYEOF'
import json, glob, sys, os
from datetime import datetime, timedelta
from collections import defaultdict

TODAY = datetime.now().strftime("%Y-%m-%d")
MONTH_START = datetime.now().strftime("%Y-%m-01")
LOG_DIR = "/opt/openclaw/logs/token-usage"
REPORT_DIR = "/opt/openclaw/logs/cost-reports"

files = glob.glob(os.path.join(LOG_DIR, "*.jsonl"))
if not files:
    print(json.dumps({"error": "no log files found"}))
    sys.exit(0)

# Parse all records
all_records = []
for fpath in files:
    with open(fpath, "r") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                rec = json.loads(line)
                all_records.append(rec)
            except json.JSONDecodeError:
                continue

# Filter today's records
today_records = [r for r in all_records if r.get("ts", "").startswith(TODAY)]

# Aggregate per agent — today
agent_today = defaultdict(lambda: {
    "input_tokens": 0,
    "output_tokens": 0,
    "cache_read_input_tokens": 0,
    "cache_creation_input_tokens": 0,
    "cost_usd": 0.0,
})

for r in today_records:
    agent = r.get("agent", "unknown")
    a = agent_today[agent]
    a["input_tokens"] += r.get("input_tokens", 0)
    a["output_tokens"] += r.get("output_tokens", 0)
    a["cache_read_input_tokens"] += r.get("cache_read_input_tokens", 0)
    a["cache_creation_input_tokens"] += r.get("cache_creation_input_tokens", 0)
    a["cost_usd"] += r.get("cost_usd", 0.0)

# MTD cost
mtd_records = [r for r in all_records if r.get("ts", "") >= MONTH_START]
mtd_cost = sum(r.get("cost_usd", 0.0) for r in mtd_records)

# 30-day average
thirty_days_ago = (datetime.now() - timedelta(days=30)).strftime("%Y-%m-%d")
last30_records = [r for r in all_records if r.get("ts", "") >= thirty_days_ago]
last30_cost = sum(r.get("cost_usd", 0.0) for r in last30_records)
# Count distinct days with records in last 30 days
last30_days = len(set(r.get("ts", "")[:10] for r in last30_records))
avg_daily = last30_cost / last30_days if last30_days > 0 else 0.0

# Cache savings estimate: cost of cache_read tokens if they had been billed as input tokens
# Approximation: cache reads are ~90% cheaper than fresh input, so savings ~ cache_read * cost_per_input * 0.9
# We'll compute from the ratio of cache_read to total input
total_cache_read = sum(a["cache_read_input_tokens"] for a in agent_today.values())
total_input = sum(a["input_tokens"] for a in agent_today.values())
total_cost = sum(a["cost_usd"] for a in agent_today.values())

# Estimate: if cache hits had been full-price input, cost would be higher
# effective_input_cost_rate = total_cost / (total_input + total_cache_read * 0.1) if denominator > 0
# savings = total_cache_read * effective_input_cost_rate * 0.9
if (total_input + total_cache_read) > 0:
    # Assume cached tokens cost 10% of regular input price
    # So savings = cache_read_tokens * (regular_rate * 0.9)
    # Estimate regular rate from total cost / total effective tokens
    effective_tokens = total_input + total_cache_read * 0.1
    if effective_tokens > 0:
        rate_per_token = total_cost / effective_tokens
        cache_savings = total_cache_read * rate_per_token * 0.9
        uncached_cost = total_cost + cache_savings
        savings_pct = (cache_savings / uncached_cost * 100) if uncached_cost > 0 else 0
    else:
        cache_savings = 0.0
        savings_pct = 0.0
else:
    cache_savings = 0.0
    savings_pct = 0.0


def fmt_tokens(n):
    """Format token count as human-readable (K or M)."""
    if n >= 1_000_000:
        return f"{n / 1_000_000:.1f}M"
    elif n >= 1_000:
        return f"{n / 1_000:.0f}K"
    return str(n)


# Build Slack message
lines = []
lines.append(f":bar_chart: *Daily API Cost Report — {TODAY}*")
lines.append("")
lines.append("| Agent | In Tok | Out Tok | Cache% | Cost |")
lines.append("|-------|--------|---------|--------|------|")

total_in = 0
total_out = 0
total_cache_read_all = 0
total_input_all = 0
total_cost_all = 0.0

for agent in sorted(agent_today.keys()):
    a = agent_today[agent]
    in_tok = a["input_tokens"]
    out_tok = a["output_tokens"]
    cr = a["cache_read_input_tokens"]
    cost = a["cost_usd"]
    cache_pct = (cr / (cr + in_tok) * 100) if (cr + in_tok) > 0 else 0

    total_in += in_tok
    total_out += out_tok
    total_cache_read_all += cr
    total_input_all += in_tok
    total_cost_all += cost

    lines.append(
        f"| {agent} | {fmt_tokens(in_tok)} | {fmt_tokens(out_tok)} | {cache_pct:.0f}% | ${cost:.2f} |"
    )

total_cache_pct = (
    (total_cache_read_all / (total_cache_read_all + total_input_all) * 100)
    if (total_cache_read_all + total_input_all) > 0
    else 0
)
lines.append(
    f"| *TOTAL* | {fmt_tokens(total_in)} | {fmt_tokens(total_out)} | {total_cache_pct:.0f}% | ${total_cost_all:.2f} |"
)
lines.append("")
lines.append(f"MTD: ${mtd_cost:.2f} | 30d avg: ${avg_daily:.2f}/day")
lines.append(
    f"Cache savings: ${cache_savings:.2f} ({savings_pct:.0f}% reduction vs uncached)"
)

slack_msg = "\n".join(lines)

# Write daily JSON report
report_data = {
    "date": TODAY,
    "agents": {agent: dict(data) for agent, data in agent_today.items()},
    "totals": {
        "input_tokens": total_in,
        "output_tokens": total_out,
        "cache_read_input_tokens": total_cache_read_all,
        "cost_usd": total_cost_all,
        "cache_hit_pct": round(total_cache_pct, 1),
    },
    "mtd_cost_usd": round(mtd_cost, 2),
    "avg_daily_30d_usd": round(avg_daily, 2),
    "cache_savings_usd": round(cache_savings, 2),
    "cache_savings_pct": round(savings_pct, 1),
}

report_path = os.path.join(REPORT_DIR, f"{TODAY}.json")
with open(report_path, "w") as f:
    json.dump(report_data, f, indent=2)

# Output the Slack message for the shell to post
print(slack_msg)
PYEOF
)

if [ $? -ne 0 ]; then
    echo "ERROR: Python aggregation failed" >&2
    exit 1
fi

# Check for error from Python
if echo "$REPORT" | grep -q '"error"'; then
    echo "WARNING: $REPORT" >&2
    exit 0
fi

# Escape the message for JSON payload
MSG=$(echo "$REPORT" | python3 -c 'import sys,json; print(json.dumps(sys.stdin.read()))')

# Post to Slack
RESPONSE=$(curl -s -X POST https://slack.com/api/chat.postMessage \
    -H "Authorization: Bearer $SLACK_TOKEN" \
    -H "Content-Type: application/json" \
    -d "{\"channel\":\"$SLACK_CHANNEL\",\"text\":$MSG}")

if echo "$RESPONSE" | python3 -c 'import sys,json; r=json.load(sys.stdin); sys.exit(0 if r.get("ok") else 1)' 2>/dev/null; then
    echo "Daily cost report posted to #agentic-dev"
else
    echo "ERROR: Failed to post to Slack: $RESPONSE" >&2
    exit 1
fi

echo "Report written to /opt/openclaw/logs/cost-reports/$TODAY.json"
