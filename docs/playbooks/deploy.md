# Deployment Playbook

## Current Production Environment

| Item | Value |
|------|-------|
| AWS Account | LMNTL Agent Automation (122015479852) |
| Region | us-east-1 |
| EC2 Instance | i-0c6a99a3e95cd52d6 |
| Public IP | 3.237.5.79 |
| Instance Type | t3.medium |
| OS | Amazon Linux 2023 |
| Docker Path | /opt/openclaw |
| Container Name | openclaw-agents |

## Quick Deploy (Recommended)

Use `deploy.sh` for all deployments. It handles git operations, Docker rebuild, health checks, and rollback support.

```bash
cd /opt/openclaw
./deploy.sh main          # Deploy latest main
./deploy.sh v1.2.0        # Deploy a tag
./deploy.sh --dry-run v1.3.0  # Preview changes
./deploy.sh --rollback    # Roll back to previous
```

### Options
- `--dry-run` — Show what would change, no action taken
- `--rollback` — Restore previous deployment (commit saved in `.last_deploy`)
- `--no-backup` — Skip saving rollback point (not recommended)
- `--force` — Skip confirmation prompts

Deploy logs: `/opt/openclaw/logs/deploy-YYYYMMDD-HHMMSS.log`

## Manual Deployment

If deploy.sh is unavailable:

### 1. Connect to EC2
```bash
# SSM (preferred)
aws ssm start-session --target i-0c6a99a3e95cd52d6
# SSH
ssh -i ~/.ssh/openclaw-key.pem ec2-user@3.237.5.79
```

### 2. Pull and Rebuild
```bash
cd /opt/openclaw
git fetch origin --tags
git checkout main && git pull origin main
docker-compose build --no-cache
docker-compose down && docker-compose up -d
```

### 3. Verify
```bash
# Wait ~60-90s, then:
docker exec openclaw-agents bash -c '
    while IFS= read -r -d "" line; do export "$line"; done < /proc/1/environ
    mcporter list 2>&1
'
# Expected: jira (5 tools), zendesk (8 tools), notion (22 tools)
docker logs openclaw-agents 2>&1 | grep -i "socket mode" | tail -6
# Expected: 3 agents connected
```

## Config Changes

Config files are in the repo. Edit, commit, push, then deploy:
```bash
git add -A && git commit -m "config: description"
git push origin main
./deploy.sh main
```

Key files: `entrypoint.sh` (secrets/env), `docker/entrypoint-fixed.sh` (mcporter/agents), `docker-compose.yml`

## Secret Changes

Secrets live in AWS Secrets Manager (`openclaw/agents`). Update via AWS CLI or Console, then restart:
```bash
docker-compose down && docker-compose up -d
```

The outer entrypoint derives these env vars from secrets:
- `JIRA_BASE_URL` ← `https://${ATLASSIAN_SITE_NAME}.atlassian.net`
- `JIRA_USER_EMAIL` ← `ATLASSIAN_USER_EMAIL`
- `JIRA_API_TOKEN` ← `ATLASSIAN_API_TOKEN`
- `ZENDESK_TOKEN` ← `ZENDESK_API_TOKEN`

## Rollback

### Automated
```bash
./deploy.sh --rollback        # Uses saved commit from .last_deploy
./deploy.sh --rollback --force  # Skip confirmation
```

### Manual
```bash
git log --oneline -10         # Find good commit
git checkout <commit>
docker-compose build --no-cache && docker-compose down && docker-compose up -d
```

### Emergency: Known Good Tag
```bash
git fetch origin --tags
git checkout v1.2.0
docker-compose build --no-cache && docker-compose down && docker-compose up -d
```

## Fresh Deployment (New EC2)

### 1. Launch Instance
- AMI: Amazon Linux 2023, Type: t3.medium, 30GB gp3
- IAM role with `secretsmanager:GetSecretValue` and SSM access
- Security group: outbound all, inbound SSH optional

### 2. Install Docker
```bash
sudo yum update -y && sudo yum install -y docker git jq
sudo systemctl enable docker && sudo systemctl start docker
sudo usermod -aG docker ec2-user
sudo curl -L "https://github.com/docker/compose/releases/download/1.29.2/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose
```

### 3. Clone and Build
```bash
cd /opt && sudo git clone https://github.com/LMNTL-AI/openclaw-agents.git openclaw
cd openclaw && sudo chown -R ec2-user:ec2-user .
chmod +x deploy.sh entrypoint.sh docker/entrypoint-fixed.sh
docker-compose build --no-cache
```

### 4. Systemd Service
```bash
sudo tee /etc/systemd/system/openclaw.service << 'EOF'
[Unit]
Description=OpenClaw Agent Gateway
After=docker.service
Requires=docker.service
[Service]
Type=simple
WorkingDirectory=/opt/openclaw
ExecStart=/usr/local/bin/docker-compose up
ExecStop=/usr/local/bin/docker-compose down
Restart=always
RestartSec=10
User=ec2-user
[Install]
WantedBy=multi-user.target
EOF
sudo systemctl daemon-reload && sudo systemctl enable openclaw && sudo systemctl start openclaw
```

### 5. Verify
Wait ~90s, then run health checks from Manual Deployment > Verify above.

## Troubleshooting

See [MCP Troubleshooting Runbook](mcp-troubleshooting.md) for MCP server issues.

### Container Won't Start
```bash
docker logs openclaw-agents --tail 100
```

### Agents Not in Slack
```bash
docker logs openclaw-agents 2>&1 | grep -i "socket\|slack\|error" | tail -20
```

### Env Var Issues
Always source PID 1 env vars in docker exec:
```bash
docker exec openclaw-agents bash -c '
    while IFS= read -r -d "" line; do export "$line"; done < /proc/1/environ
    env | grep -E "JIRA|ZENDESK|NOTION|SLACK|ANTHROPIC" | sort
'
```
