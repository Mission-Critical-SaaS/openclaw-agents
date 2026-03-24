#!/usr/bin/env bash
# token-budget-enforcer.sh — Check token usage against budget caps, alert/pause when thresholds hit
set -euo pipefail

TODAY=$(date +%Y-%m-%d)
LOG_DIR="/opt/openclaw/logs/token-usage"
CAPS_FILE="/opt/openclaw/config/proactive/token-caps.json"
BUDGET_LOG="/opt/openclaw/logs/token-budget.jsonl"
COOLDOWN_DIR="/tmp/openclaw-budget-cooldown"
SLACK_CHANNEL="C0AL58T8QMN"  # #openclaw-watchdog

mkdir -p "$COOLDOWN_DIR"
mkdir -p "$(dirname "$BUDGET_LOG")"

# Retrieve Slack token from running containers
SLACK_TOKEN=$(docker exec openclaw-agents-standard printenv SLACK_BOT_TOKEN_SCOUT 2>/dev/null \
    || docker exec openclaw-agents-admin printenv SLACK_BOT_TOKEN_CHIEF 2>/dev/null)

if [ -z "$SLACK_TOKEN" ]; then
    echo "ERROR: Could not retrieve Slack token from any container" >&2
    exit 1
fi

if [ ! -f "$CAPS_FILE" ]; then
    echo "ERROR: Token caps config not found at $CAPS_FILE" >&2
    exit 1
fi

# Run enforcement logic in Python
python3 << 'PYEOF'
import json, glob, sys, os, time, subprocess
from datetime import datetime
from collections import defaultdict

TODAY = datetime.now().strftime("%Y-%m-%d")
NOW_ISO = datetime.now().isoformat()
LOG_DIR = "/opt/openclaw/logs/token-usage"
CAPS_FILE = "/opt/openclaw/config/proactive/token-caps.json"
BUDGET_LOG = "/opt/openclaw/logs/token-budget.jsonl"
COOLDOWN_DIR = "/tmp/openclaw-budget-cooldown"
SLACK_CHANNEL = "C0AL58T8QMN"
COOLDOWN_SECONDS = 2 * 3600  # 2 hours

SLACK_TOKEN = os.environ.get("SLACK_TOKEN", "")

# Load caps
with open(CAPS_FILE, "r") as f:
    caps = json.load(f)

defaults = caps.get("defaults", {})
overrides = caps.get("overrides", {})
platform = caps.get("platform", {})
daily_usd_cap = platform.get("daily_usd_cap", 75.0)
alert_pct = platform.get("alert_threshold_pct", 80)
pause_pct = platform.get("pause_threshold_pct", 100)

# Parse all today's records
files = glob.glob(os.path.join(LOG_DIR, "*.jsonl"))
today_records = []
for fpath in files:
    with open(fpath, "r") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                rec = json.loads(line)
                if rec.get("ts", "").startswith(TODAY):
                    today_records.append(rec)
            except json.JSONDecodeError:
                continue

# Aggregate per agent
agent_usage = defaultdict(lambda: {
    "input_tokens": 0,
    "output_tokens": 0,
    "cost_usd": 0.0,
})

for r in today_records:
    agent = r.get("agent", "unknown")
    a = agent_usage[agent]
    a["input_tokens"] += r.get("input_tokens", 0)
    a["output_tokens"] += r.get("output_tokens", 0)
    a["cost_usd"] += r.get("cost_usd", 0.0)

total_daily_cost = sum(a["cost_usd"] for a in agent_usage.values())


def get_cap(agent, field):
    """Get the cap for an agent, falling back to defaults."""
    if agent in overrides and field in overrides[agent]:
        return overrides[agent][field]
    return defaults.get(field, 0)


def is_in_cooldown(agent, level):
    """Check if we already alerted for this agent+level within cooldown period."""
    cooldown_file = os.path.join(COOLDOWN_DIR, f"{agent}-{level}")
    if os.path.exists(cooldown_file):
        mtime = os.path.getmtime(cooldown_file)
        if time.time() - mtime < COOLDOWN_SECONDS:
            return True
    return False


def set_cooldown(agent, level):
    """Mark that we alerted for this agent+level."""
    cooldown_file = os.path.join(COOLDOWN_DIR, f"{agent}-{level}")
    with open(cooldown_file, "w") as f:
        f.write(datetime.now().isoformat())


def post_slack(message):
    """Post a message to Slack."""
    payload = json.dumps({"channel": SLACK_CHANNEL, "text": message})
    try:
        result = subprocess.run(
            [
                "curl", "-s", "-X", "POST",
                "https://slack.com/api/chat.postMessage",
                "-H", f"Authorization: Bearer {SLACK_TOKEN}",
                "-H", "Content-Type: application/json",
                "-d", payload,
            ],
            capture_output=True, text=True, timeout=30,
        )
        return result.stdout
    except Exception as e:
        print(f"ERROR posting to Slack: {e}", file=sys.stderr)
        return ""


def log_event(event):
    """Append structured log entry."""
    event["ts"] = NOW_ISO
    with open(BUDGET_LOG, "a") as f:
        f.write(json.dumps(event) + "\n")


def fmt_tokens(n):
    if n >= 1_000_000:
        return f"{n / 1_000_000:.1f}M"
    elif n >= 1_000:
        return f"{n / 1_000:.0f}K"
    return str(n)


# Check each agent
all_agents = set(agent_usage.keys()) | set(overrides.keys())
for agent in sorted(all_agents):
    usage = agent_usage.get(agent, {"input_tokens": 0, "output_tokens": 0, "cost_usd": 0.0})
    input_cap = get_cap(agent, "daily_input_tokens")
    output_cap = get_cap(agent, "daily_output_tokens")

    input_pct = (usage["input_tokens"] / input_cap * 100) if input_cap > 0 else 0
    output_pct = (usage["output_tokens"] / output_cap * 100) if output_cap > 0 else 0

    max_pct = max(input_pct, output_pct)
    pause_flag = f"/tmp/openclaw-token-pause-{agent}"

    if max_pct >= pause_pct:
        # At or over cap — create pause flag
        if not os.path.exists(pause_flag):
            with open(pause_flag, "w") as f:
                f.write(NOW_ISO)

        if not is_in_cooldown(agent, "pause"):
            msg = (
                f":rotating_light: *Token Budget EXCEEDED — {agent}*\n"
                f"Daily input: {fmt_tokens(usage['input_tokens'])} / {fmt_tokens(input_cap)} ({input_pct:.0f}%)\n"
                f"Daily output: {fmt_tokens(usage['output_tokens'])} / {fmt_tokens(output_cap)} ({output_pct:.0f}%)\n"
                f"Est. cost today: ${usage['cost_usd']:.2f}\n"
                f"Status: *PAUSED* (proactive tasks halted)"
            )
            post_slack(msg)
            set_cooldown(agent, "pause")
            log_event({
                "event": "budget_pause",
                "agent": agent,
                "input_tokens": usage["input_tokens"],
                "output_tokens": usage["output_tokens"],
                "input_pct": round(input_pct, 1),
                "output_pct": round(output_pct, 1),
                "cost_usd": round(usage["cost_usd"], 2),
            })
            print(f"PAUSE: {agent} at {max_pct:.0f}% of cap")

    elif max_pct >= alert_pct:
        # Warning threshold
        if not is_in_cooldown(agent, "warning"):
            msg = (
                f":warning: *Token Budget Alert — {agent}*\n"
                f"Daily input: {fmt_tokens(usage['input_tokens'])} / {fmt_tokens(input_cap)} ({input_pct:.0f}%)\n"
                f"Daily output: {fmt_tokens(usage['output_tokens'])} / {fmt_tokens(output_cap)} ({output_pct:.0f}%)\n"
                f"Est. cost today: ${usage['cost_usd']:.2f}\n"
                f"Status: Warning (proactive tasks will pause at 100%)"
            )
            post_slack(msg)
            set_cooldown(agent, "warning")
            log_event({
                "event": "budget_warning",
                "agent": agent,
                "input_tokens": usage["input_tokens"],
                "output_tokens": usage["output_tokens"],
                "input_pct": round(input_pct, 1),
                "output_pct": round(output_pct, 1),
                "cost_usd": round(usage["cost_usd"], 2),
            })
            print(f"WARNING: {agent} at {max_pct:.0f}% of cap")

    else:
        # Under threshold — remove pause flag if it exists (agent recovered)
        if os.path.exists(pause_flag):
            os.remove(pause_flag)
            log_event({
                "event": "budget_resumed",
                "agent": agent,
                "input_tokens": usage["input_tokens"],
                "output_tokens": usage["output_tokens"],
                "input_pct": round(input_pct, 1),
                "output_pct": round(output_pct, 1),
                "cost_usd": round(usage["cost_usd"], 2),
            })
            print(f"RESUMED: {agent} now at {max_pct:.0f}% (pause flag removed)")

# Check platform-wide daily USD cap
usd_pct = (total_daily_cost / daily_usd_cap * 100) if daily_usd_cap > 0 else 0

if usd_pct >= pause_pct:
    if not is_in_cooldown("platform", "pause"):
        msg = (
            f":rotating_light: *Platform Daily USD Cap EXCEEDED*\n"
            f"Total spend today: ${total_daily_cost:.2f} / ${daily_usd_cap:.2f} ({usd_pct:.0f}%)\n"
            f"Status: *All proactive tasks should be paused*"
        )
        post_slack(msg)
        set_cooldown("platform", "pause")
        log_event({
            "event": "platform_usd_pause",
            "total_cost_usd": round(total_daily_cost, 2),
            "cap_usd": daily_usd_cap,
            "pct": round(usd_pct, 1),
        })
        # Create platform-wide pause flag
        with open("/tmp/openclaw-token-pause-platform", "w") as f:
            f.write(NOW_ISO)
        print(f"PLATFORM PAUSE: ${total_daily_cost:.2f} / ${daily_usd_cap:.2f}")

elif usd_pct >= alert_pct:
    if not is_in_cooldown("platform", "warning"):
        msg = (
            f":warning: *Platform Daily USD Cap Warning*\n"
            f"Total spend today: ${total_daily_cost:.2f} / ${daily_usd_cap:.2f} ({usd_pct:.0f}%)\n"
            f"Status: Warning (all proactive tasks will pause at 100%)"
        )
        post_slack(msg)
        set_cooldown("platform", "warning")
        log_event({
            "event": "platform_usd_warning",
            "total_cost_usd": round(total_daily_cost, 2),
            "cap_usd": daily_usd_cap,
            "pct": round(usd_pct, 1),
        })
        print(f"PLATFORM WARNING: ${total_daily_cost:.2f} / ${daily_usd_cap:.2f}")

else:
    # Remove platform pause flag if recovered
    platform_flag = "/tmp/openclaw-token-pause-platform"
    if os.path.exists(platform_flag):
        os.remove(platform_flag)
        log_event({
            "event": "platform_usd_resumed",
            "total_cost_usd": round(total_daily_cost, 2),
            "cap_usd": daily_usd_cap,
            "pct": round(usd_pct, 1),
        })
        print(f"PLATFORM RESUMED: ${total_daily_cost:.2f} / ${daily_usd_cap:.2f}")

print(f"Budget enforcement complete. Total daily cost: ${total_daily_cost:.2f}")
PYEOF
