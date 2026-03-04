#!/bin/bash
# ──────────────────────────────────────────────────────────
# create-slack-apps.sh — Guide for creating the 3 Slack bot apps
# ──────────────────────────────────────────────────────────
# Each OpenClaw agent needs its own Slack app so it appears
# as a distinct bot user in channels. This script outputs the
# manifest JSON for each app, ready to paste into Slack's
# app creation flow.
# ──────────────────────────────────────────────────────────

cat <<'GUIDE'
╔══════════════════════════════════════════════════════════╗
║   OpenClaw Multi-Agent Slack App Setup Guide             ║
╠══════════════════════════════════════════════════════════╣
║                                                          ║
║  You need 3 Slack apps — one per agent:                  ║
║                                                          ║
║  1. Scout  — Customer Support    (#support channels)     ║
║  2. Trak   — Project Management  (#engineering, #jira)   ║
║  3. Kit    — Engineering         (#dev, #code-review)    ║
║                                                          ║
║  For each app:                                           ║
║  1. Go to https://api.slack.com/apps                     ║
║  2. Click "Create New App" → "From a manifest"           ║
║  3. Select the LMNTL workspace                           ║
║  4. Paste the manifest JSON below                        ║
║  5. Click Create → Install to Workspace → Allow          ║
║  6. Copy the Bot Token (xoxb-...) and App Token          ║
║     (Settings → Basic Info → App-Level Tokens)           ║
║  7. Add tokens to your .env file                         ║
║                                                          ║
╚══════════════════════════════════════════════════════════╝

GUIDE

# ─── Scout Manifest ───
echo "═══ SCOUT — Customer Support Agent ═══"
cat <<'EOF'
{
  "display_information": {
    "name": "Scout",
    "description": "Customer support assistant — helps resolve customer issues with access to billing, code, and docs.",
    "background_color": "#2E7D32"
  },
  "features": {
    "app_home": { "home_tab_enabled": false, "messages_tab_enabled": true, "messages_tab_read_only_enabled": false },
    "bot_user": { "display_name": "Scout", "always_online": true }
  },
  "oauth_config": {
    "scopes": {
      "bot": [
        "app_mentions:read", "channels:history", "channels:read",
        "chat:write", "groups:history", "groups:read",
        "im:history", "im:read", "im:write",
        "mpim:history", "mpim:read",
        "reactions:read", "reactions:write",
        "files:read", "files:write",
        "users:read", "users:read.email"
      ]
    }
  },
  "settings": {
    "event_subscriptions": {
      "bot_events": [
        "app_mention", "message.channels", "message.groups",
        "message.im", "message.mpim", "reaction_added"
      ]
    },
    "interactivity": { "is_enabled": false },
    "org_deploy_enabled": false,
    "socket_mode_enabled": true,
    "token_rotation_enabled": false
  }
}
EOF

echo ""
echo ""

# ─── Trak Manifest ───
echo "═══ TRAK — Project Management Agent ═══"
cat <<'EOF'
{
  "display_information": {
    "name": "Trak",
    "description": "Project management assistant — creates, updates, and tracks Jira issues via chat.",
    "background_color": "#1565C0"
  },
  "features": {
    "app_home": { "home_tab_enabled": false, "messages_tab_enabled": true, "messages_tab_read_only_enabled": false },
    "bot_user": { "display_name": "Trak", "always_online": true }
  },
  "oauth_config": {
    "scopes": {
      "bot": [
        "app_mentions:read", "channels:history", "channels:read",
        "chat:write", "groups:history", "groups:read",
        "im:history", "im:read", "im:write",
        "mpim:history", "mpim:read",
        "reactions:read", "reactions:write",
        "files:read", "files:write",
        "users:read", "users:read.email"
      ]
    }
  },
  "settings": {
    "event_subscriptions": {
      "bot_events": [
        "app_mention", "message.channels", "message.groups",
        "message.im", "message.mpim", "reaction_added"
      ]
    },
    "interactivity": { "is_enabled": false },
    "org_deploy_enabled": false,
    "socket_mode_enabled": true,
    "token_rotation_enabled": false
  }
}
EOF

echo ""
echo ""

# ─── Kit Manifest ───
echo "═══ KIT — Engineering Assistant ═══"
cat <<'EOF'
{
  "display_information": {
    "name": "Kit",
    "description": "Engineering assistant — helps with code reviews, GitHub, debugging, and technical questions.",
    "background_color": "#E65100"
  },
  "features": {
    "app_home": { "home_tab_enabled": false, "messages_tab_enabled": true, "messages_tab_read_only_enabled": false },
    "bot_user": { "display_name": "Kit", "always_online": true }
  },
  "oauth_config": {
    "scopes": {
      "bot": [
        "app_mentions:read", "channels:history", "channels:read",
        "chat:write", "groups:history", "groups:read",
        "im:history", "im:read", "im:write",
        "mpim:history", "mpim:read",
        "reactions:read", "reactions:write",
        "files:read", "files:write",
        "users:read", "users:read.email"
      ]
    }
  },
  "settings": {
    "event_subscriptions": {
      "bot_events": [
        "app_mention", "message.channels", "message.groups",
        "message.im", "message.mpim", "reaction_added"
      ]
    },
    "interactivity": { "is_enabled": false },
    "org_deploy_enabled": false,
    "socket_mode_enabled": true,
    "token_rotation_enabled": false
  }
}
EOF

echo ""
echo "After creating all 3 apps, update your .env file with the tokens."
echo "Then run: ./scripts/setup-secrets.sh"
