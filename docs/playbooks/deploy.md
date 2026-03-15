# Deployment Playbook

## Current Production Environment

| Item | Value |
|------|-------|
| AWS Account | LMNTL Agent Automation (122015479852) |
| Region | us-east-1 |
| EC2 Instance | i-0acd7169101e93388 |
| Instance Type | t3.xlarge |
| Disk | 50GB gp3 |
| OS | Ubuntu 22.04 LTS |
| Docker Path | /opt/openclaw |
| Container Name | openclaw-agents |
| CI/CD | GitHub Actions (`.github/workflows/deploy.yml`) |
| IAM Deploy Role | openclaw-github-deploy (GitHub OIDC) |

## Standard Deploy (CI/CD)

All deployments go through GitHub Actions. Tag a release and push:

```bash
git tag -a v1.x.x -m "description"
git push origin v1.x.x
```

The pipeline:
1. **Test** — runs `npx jest` (unit + CDK tests must pass)
2. **Deploy via SSM** — sends `deploy.sh <tag>` to the EC2 instance
3. **Verify** — checks docker logs for BOOTSTRAP_OK, gateway is live, socket mode connected
4. **Notify** — posts to Slack #leads on failure only

Deploy logs on the instance: `/opt/openclaw/logs/deploy-YYYYMMDD-HHMMSS.log`

### What deploy.sh does on the instance

1. Fetches from origin, checks out the tag
2. Builds Docker image (cached layers make this fast)
3. Stops and removes the old container
4. Starts the new container via docker-compose
5. Waits for health check (gateway liveness)
6. Prints health report with status, Slack connections, and deploy info

## Manual Deployment

Manual deploys should only be used in emergencies when CI/CD is unavailable.

### 1. Connect to EC2
```bash
aws ssm start-session --target i-0acd7169101e93388 --profile openclaw
```

### 2. Pull and Rebuild
```bash
cd /opt/openclaw
git fetch origin --tags
git checkout v1.x.x
docker-compose build --no-cache
docker-compose down && docker-compose up -d
```

### 3. Verify
```bash
# Wait ~180s for startup + bootstrap, then:
docker exec openclaw-agents openclaw status
docker logs openclaw-agents 2>&1 | grep -i "socket mode" | tail -10
docker logs openclaw-agents 2>&1 | grep "BOOTSTRAP_OK"
```

## Deployment Decision Tree

| Change type | Action |
|-------------|--------|
| Docs only | No deploy needed |
| Agent IDENTITY/KNOWLEDGE | Tag + push (container restarts with new files) |
| Entrypoint or Dockerfile | Tag + push |
| Config template | Tag + push |
| Secrets (AWS) | Update in Secrets Manager, then tag + push |

## Config Changes

Config files are in the repo. Edit, commit, push, then tag:
```bash
git add -A && git commit -m "config: description"
git tag v1.x.x && git push origin main v1.x.x
```

Key files: `entrypoint.sh` (secrets/env), `docker/entrypoint.sh` (MCP config/auth/gateway), `docker-compose.yml`

## Secret Changes

Secrets live in AWS Secrets Manager (`openclaw/agents`). Update via AWS CLI or Console, then redeploy:
```bash
git tag v1.x.x -m "secret rotation" && git push origin v1.x.x
```

See [secrets.md](../secrets.md) for the full list.

## Rollback

### Via CI/CD (preferred)
```bash
git checkout v1.x.x      # known good tag
git tag v1.x.y -m "rollback to v1.x.x"
git push origin v1.x.y
```

### Manual (emergency)
```bash
# On EC2 via SSM:
cd /opt/openclaw
git fetch origin --tags
git checkout v1.x.x
docker-compose build --no-cache && docker-compose down && docker-compose up -d
```

## Fresh Deployment (New EC2)

For a completely new instance, use the CDK stack or the bootstrap script:

### Option A: CDK (recommended)
```bash
npx cdk deploy
```
This creates the full infrastructure: VPC, SG, EC2, IAM roles, CloudWatch, SNS.

### Option B: Manual Bootstrap
See `scripts/bootstrap.sh` for the Ubuntu 22.04 setup steps:
1. Install Docker + Docker Compose
2. Clone the repo to /opt/openclaw
3. Build and start the container

## Troubleshooting

See [Troubleshooting Guide](troubleshoot.md) for general issues and [MCP Troubleshooting](mcp-troubleshooting.md) for MCP server issues.

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
