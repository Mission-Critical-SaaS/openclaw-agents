# Troubleshooting Guide

## First Steps: Check the Watchdog

Before diving into manual troubleshooting, check if the watchdog is already handling the issue:

```bash
# Is the watchdog running?
systemctl status openclaw-watchdog

# What does it see?
/opt/openclaw/scripts/watchdog.sh --status

# Recent activity
tail -30 /opt/openclaw/logs/watchdog.log
```

If the watchdog shows active repair attempts, wait for it to complete (up to 5 minutes per tier). Only intervene manually if the watchdog service itself is down, all repair tiers have been exhausted, or the issue requires a code change.

## Agent Not Responding in Slack

### Check container is running
```bash
docker ps
# If not listed, the watchdog should auto-restart it.
# If watchdog is also down:
cd /opt/openclaw && docker-compose up -d
```

### Check container logs
```bash
docker logs --tail 100 openclaw-agents
```

**Common log errors:**

| Error | Cause | Fix |
|-------|-------|-----|
| invalid_auth | Slack bot token expired/revoked | Rotate token in Secrets Manager, restart |
| not_authed | Slack app token invalid | Rotate app-level token, restart |
| connection_refused | Network issue | Check security group outbound rules |
| rate_limited | Too many API calls | Wait and retry; consider adding delays |
| ANTHROPIC_API_KEY invalid | API key expired | Rotate key in Secrets Manager, restart |
| Cannot find module 'ajv' | Corrupted npx cache | See [MCP Troubleshooting](mcp-troubleshooting.md) |
| MCP error -32000 | MCP server connection failed | Check mcporter: `docker exec openclaw-agents bash -c "HOME=/root mcporter list"` |

### Check if agent is connected to Slack
```bash
docker logs openclaw-agents 2>&1 | grep -i connected
```

### Check if secrets are loaded
```bash
docker exec openclaw-agents env | grep -c SLACK
```

## Agent Responds in DMs But Ignores Channel @mentions

This is a different issue from the agent not responding at all. If agents work fine in DMs but completely ignore @mentions in channels (with no error in logs):

### Check groupPolicy setting
```bash
docker exec openclaw-agents bash -c '
    while IFS= read -r -d "" line; do export "$line"; done < /proc/1/environ
    openclaw config get
' | grep -A5 groupPolicy
```

If groupPolicy is `"allowlist"` with an empty or missing `allowChannels`, ALL channel messages are silently dropped.

**Fix:** Change groupPolicy to `"open"` in the outer entrypoint (`/opt/openclaw/entrypoint.sh` on the host):

1. Find the line that sets groupPolicy
2. Change `'allowlist'` to `'open'`
3. Restart the container: `docker restart openclaw-agents`

If groupPolicy is `"allowlist"` with channels listed, verify the channel IDs are correct (channel IDs change if channels are recreated).

## Agent Can't Find MCP Tools

If an agent says "No Zendesk MCP server is configured" (or similar) but you know the server should be available:

### Step 1: Check mcporter health
```bash
docker exec openclaw-agents bash -c "HOME=/root mcporter list --json"
```

If the server shows "offline": see [MCP Troubleshooting](mcp-troubleshooting.md).

If all servers show "ok" but the agent can't see them: this is the **agent session caching** issue. The agent cached its tool list at startup when the server was offline.

### Fix: Restart the container
```bash
docker restart openclaw-agents
```

Wait 60-90 seconds, then DM the agent to verify it can now access the tools.

**Important**: Don't trust `docker exec` + `mcporter list` as proof of what the agent can see. The agent's runtime environment differs from docker exec. Always verify by DMing the agent directly.

## Container Won't Start

### Check Docker service
```bash
sudo systemctl status docker
sudo systemctl status openclaw
```

### Check disk space
```bash
df -h
```

### Check Docker build
```bash
cd /opt/openclaw
docker-compose build --no-cache 2>&1 | tail -20
```

### Check openclaw package
```bash
docker exec openclaw-agents openclaw --version
```

## Agent Responds But Gives Errors

### Check Anthropic API
```bash
curl -s https://api.anthropic.com/v1/messages
```

### Check channel restrictions
The agents only respond in channels listed in allowChannels in the config. Currently: C089JBLCFLL (#leads).

### Check user restrictions
Only users in the allowFrom list can interact:
- U082DEF37PC (David Allison)
- U081YTU8JCX (Michael Wong)
- U0ADABVCVH8 (Debbie Sabin)

To add a user, update the SLACK_ALLOW_FROM secret and restart.

## Watchdog Issues

### Watchdog service not running
```bash
sudo systemctl start openclaw-watchdog
sudo systemctl enable openclaw-watchdog
systemctl status openclaw-watchdog
```

### Watchdog running but not repairing
```bash
# Check probe results
/opt/openclaw/scripts/watchdog.sh --test-probes

# Check state file
cat /tmp/watchdog_state.json | python3 -m json.tool

# Check recent log
tail -50 /opt/openclaw/logs/watchdog.log
```

Common causes:
- Watchdog requires 2 consecutive failures before acting (by design, prevents false positives)
- If `consecutive_failures` is 1, it's waiting for confirmation on the next cycle
- If all tiers exhausted, the log shows "ALL REPAIR TIERS EXHAUSTED" and sends alerts

### Watchdog log lines appear doubled
This is a known cosmetic issue. Both systemd's `StandardOutput=append:` and the script's `tee -a` write to the same log file. It does not affect functionality.

### After editing watchdog.sh
```bash
sudo systemctl restart openclaw-watchdog
systemctl is-active openclaw-watchdog
```

## EC2 Instance Issues

### Instance unreachable
```bash
aws ec2 describe-instance-status --instance-ids i-0c6a99a3e95cd52d6 --profile openclaw
aws ec2 start-instances --instance-ids i-0c6a99a3e95cd52d6 --profile openclaw
```

### SSH access denied
The key pair openclaw-key is stored in AWS. If you have lost the private key:
1. Use EC2 Instance Connect from the AWS Console
2. Or use SSM Session Manager (preferred): `aws ssm start-session --target i-0c6a99a3e95cd52d6 --profile openclaw`

## Common Operations

### Add a new allowed user
```bash
aws secretsmanager get-secret-value --secret-id openclaw/agents --query SecretString --output text
# Edit the SLACK_ALLOW_FROM array, update secret, restart container
```

### Change allowed channels
Edit config/openclaw.json.tpl, update the allowChannels array, commit, push, and restart on EC2.

### View real-time logs
```bash
# Container logs
docker logs -f --tail 50 openclaw-agents

# Watchdog logs
tail -f /opt/openclaw/logs/watchdog.log
```

### Run full health assessment
```bash
# All probes at once
/opt/openclaw/scripts/watchdog.sh --test-probes

# Full watchdog E2E test (takes ~3 minutes, will restart the container)
bash /opt/openclaw/scripts/test-watchdog-e2e.sh
```

## See Also

- [Agent Capability Matrix](agent-capability-matrix.md) — Which tools each agent has, testing procedures
- [MCP Troubleshooting](mcp-troubleshooting.md) — Jira, Zendesk, Notion MCP server issues
- [Restart Procedures](../runbooks/restart.md) — Safe restart including watchdog guidance
- [Deployment Playbook](deploy.md) — Full deploy, rollback, and fresh setup
- [SDLC Playbook](sdlc.md) — End-to-end development lifecycle
