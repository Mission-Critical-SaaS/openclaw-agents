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
The agents only respond in channels listed in allowChannels in the config. Currently: C089JBLCFLL (#leads).

### Check user restrictions
Only users in the allowFrom list can interact:
- U082DEF37PC (David Allison)
- U081YTU8JCX (Michael Wong)
- U0ADABVCVH8 (Debbie Sabin)

To add a user, update the SLACK_ALLOW_FROM secret and restart.

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
