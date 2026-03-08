#!/usr/bin/env python3
# Configure Slack channels in OpenClaw config from environment variables
import json, os, sys

CONF_FILE = os.path.expanduser("~/.openclaw/.openclaw/openclaw.json")
os.makedirs(os.path.dirname(CONF_FILE), exist_ok=True)

try:
    with open(CONF_FILE) as f:
        config = json.load(f)
except (FileNotFoundError, json.JSONDecodeError):
    config = {}

accounts = {}
for name, bot_key, app_key in [
    ("scout", "SLACK_BOT_TOKEN_SCOUT", "SLACK_APP_TOKEN_SCOUT"),
    ("trak", "SLACK_BOT_TOKEN_TRAK", "SLACK_APP_TOKEN_TRAK"),
    ("kit", "SLACK_BOT_TOKEN_KIT", "SLACK_APP_TOKEN_KIT"),
]:
    bot = os.environ.get(bot_key, "")
    app = os.environ.get(app_key, "")
    if bot and app and bot != "null" and app != "null":
        accounts[name] = {"botToken": bot, "appToken": app}
        print(f"  Added Slack account: {name}")
    else:
        print(f"  Skipped {name}: bot={bool(bot)} app={bool(app)}")

if accounts:
    config["channels"] = {"slack": {"enabled": True, "accounts": accounts}}
    print(f"Configured {len(accounts)} Slack account(s)")
else:
    print("WARNING: No valid Slack tokens found!")

with open(CONF_FILE, "w") as f:
    json.dump(config, f, indent=2)
print(f"Config written to {CONF_FILE}")
