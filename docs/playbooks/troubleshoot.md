# Troubleshooting Guide

## First Steps

Check the container status and recent logs:

```bash
# Is the container running?
docker ps | grep openclaw-agents

# Recent logs
docker logs --tail 50 openclaw-agents

# MCP server health
docker exec openclaw-agents openclaw status
```

For remote diagnostics via SSM:

```bash
aws ssm send-command \
  --instance-ids i-0acd7169101e93388 \
  --document-name AWS-RunShellScript \
  --parameters 'commands=["docker ps","docker logs --tail 30 openclaw-agents"]' \
  --output json
```

## Agent Not Responding in Slack

### Check container is running
```bash
docker ps
# If not listed:
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
| MCP error -32000 | MCP server connection failed | Check via `docker exec openclaw-agents openclaw status` |

### Check if agent is connected to Slack
```bash
docker logs openclaw-agents 2>&1 | grep -i connected
```

### Check if secrets are loaded
```bash
docker exec openclaw-agents env | grep -c SLACK
```


## Gateway "Already Listening" During Startup

If you see this in the container logs:

```
Gateway failed to start: another gateway instance is already listening on ws://127.0.0.1:18789
```

**This is normal and expected.** During startup, the outer entrypoint kills the first gateway instance and restarts it with injected Slack channel config. There's a brief window (1–3 seconds) where the old process hasn't released the port yet. The entrypoint retries automatically.

You do NOT need to do anything. See [Startup Sequence](../runbooks/startup.md) for the full boot flow.

## GitHub Token Issues (gh CLI)

### "gh auth login needed" or exit code 4

The gh wrapper at `/usr/local/bin/gh` reads tokens from `/tmp/.github-token`, which is refreshed every 50 minutes by the background token refresh loop. If an agent reports `gh auth login` is needed:

1. **Check the token file exists:** `docker exec openclaw-agents cat /tmp/.github-token | head -c 20`
2. **Check the refresh loop is running:** `docker exec openclaw-agents ps aux | grep token-refresh`
3. **Check the expiry:** `docker exec openclaw-agents cat /tmp/.github-token-expires` (Unix timestamp)

If the token file is missing or the refresh loop died, restart the container:
```bash
docker restart openclaw-agents
```

### Config file permission denied (EACCES)

If logs show `EACCES: permission denied, open .../openclaw.json`:

The outer entrypoint runs as root but OpenClaw expects config owned by UID 1000 (openclaw user). The `chown -R openclaw:openclaw /home/openclaw/.openclaw` line in the entrypoint fixes this. If you see this error, the chown likely failed — check disk space and filesystem health.


## Cross-Agent Handoffs Not Working

If agents can't deliver handoff messages to other agents:

### Bot-to-bot DMs blocked
Slack's API blocks bot-to-bot DMs (`cannot_dm_bot`). This is a platform limitation, not a bug. Agents must use `sessions_send` (OpenClaw's internal session messaging) instead.

### sessions_send returns "forbidden"
Check that `tools.sessions.visibility` is set to `"all"` in the gateway config:
```bash
docker exec openclaw-agents openclaw config get tools.sessions.visibility
```
If it returns "tree" or is not set, the entrypoint's config injection didn't run correctly. Check `docker logs openclaw-agents` for the line:
```
Set tools.sessions.visibility = all (cross-agent handoffs)
```

### Target agent has no active session
If `sessions_send` fails because the target agent has no session, the sending agent should fall back to posting in #dev (`C086N5031LZ`) with an @mention of the target agent.

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

### Step 1: Check MCP server health
```bash
docker exec openclaw-agents openclaw status
```

If the server shows "offline": see [MCP Troubleshooting](mcp-troubleshooting.md).

If all servers show OK but the agent can't see them: this is the **agent session caching** issue. The agent cached its tool list at startup when the server was offline.

### Fix: Restart the container
```bash
docker restart openclaw-agents
```

Wait 60-90 seconds, then DM the agent to verify it can now access the tools.

**Important**: Don't trust `docker exec` diagnostic results as proof of what the agent can see. The agent's runtime environment differs from docker exec. Always verify by DMing the agent directly.

## Container Won't Start

### Check Docker service
```bash
sudo systemctl status docker
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
Agents use `groupPolicy: "open"` with `requireMention: true`, so they respond in **any** channel when @mentioned. There is no channel allowlist restriction.

### Check user restrictions
Only users in the `SLACK_ALLOW_FROM` secret can interact. See the README for the current allow list (9 users as of v1.3.37).

To add a user, update the `SLACK_ALLOW_FROM` JSON array in AWS Secrets Manager and redeploy.

## EC2 Instance Issues

### Instance unreachable
```bash
aws ec2 describe-instance-status --instance-ids i-0acd7169101e93388 --profile openclaw
aws ec2 start-instances --instance-ids i-0acd7169101e93388 --profile openclaw
```

### SSH access denied
The key pair openclaw-key is stored in AWS. If you have lost the private key:
1. Use EC2 Instance Connect from the AWS Console
2. Or use SSM Session Manager (preferred): `aws ssm start-session --target i-0acd7169101e93388 --profile openclaw`

## Common Operations

### Add a new allowed user
```bash
aws secretsmanager get-secret-value --secret-id openclaw/agents --query SecretString --output text
# Edit the SLACK_ALLOW_FROM array, update secret, restart container
```

### Change allowed channels
Edit config/openclaw.json.tpl, update the allowChannels array, commit, push, and deploy via CI/CD.

### View real-time logs
```bash
# Container logs (via SSM or SSH)
docker logs -f --tail 50 openclaw-agents
```

## See Also

- [Agent Capability Matrix](../agent-capability-matrix.md) — Which tools each agent has, testing procedures
- [MCP Troubleshooting](mcp-troubleshooting.md) — Jira, Zendesk, Notion MCP server issues
- [Restart Procedures](../runbooks/restart.md) — Safe restart procedures
- [Deployment Playbook](deploy.md) — Full deploy, rollback, and fresh setup
- [SDLC Playbook](sdlc.md) — End-to-end development lifecycle
