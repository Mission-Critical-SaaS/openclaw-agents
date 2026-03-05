# Troubleshooting Guide

## Agent Not Responding in Slack

### Check container is running
```bash
ssh ec2-user@3.237.5.79
docker ps
```

### Check container logs
```bash
docker logs --tail 100 openclaw-gateway
```

**Common log errors:**

| Error | Cause | Fix |
|-------|-------|-----|
| invalid_auth | Slack bot token expired/revoked | Rotate token in Secrets Manager, restart |
| not_authed | Slack app token invalid | Rotate app-level token, restart |
| connection_refused | Network issue | Check security group outbound rules |
| rate_limited | Too many API calls | Wait and retry; consider adding delays |
| ANTHROPIC_API_KEY invalid | API key expired | Rotate key in Secrets Manager, restart |

### Check if agent is connected to Slack
```bash
docker logs openclaw-gateway 2>&1 | grep -i connected
```

### Check if secrets are loaded
```bash
docker exec openclaw-gateway env | grep -c SLACK
```

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
docker exec openclaw-gateway openclaw --version
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
aws ec2 describe-instance-status --instance-ids i-0c6a99a3e95cd52d6
aws ec2 start-instances --instance-ids i-0c6a99a3e95cd52d6
```

### SSH access denied
The key pair openclaw-key is stored in AWS. If you have lost the private key:
1. Use EC2 Instance Connect from the AWS Console
2. Or use SSM Session Manager if the agent is installed

## Common Operations

### Add a new allowed user
```bash
aws secretsmanager get-secret-value --secret-id openclaw/agents --query SecretString --output text
```

### Change allowed channels
Edit config/openclaw.json.tpl, update the allowChannels array, commit, push, and restart on EC2.

### View real-time logs
```bash
ssh ec2-user@3.237.5.79
docker logs -f --tail 50 openclaw-gateway
```
