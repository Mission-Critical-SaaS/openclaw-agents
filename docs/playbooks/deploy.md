# Deployment Playbook

## Current Production Environment

| Item | Value |
|------|-------|
| AWS Account | LMNTL Agent Automation (669308278244) |
| Region | us-east-1 |
| EC2 Instance | (from CDK output `InstanceId`) |
| Instance Type | t3.small |
| OS | Amazon Linux 2023 |
| Docker Path | /opt/openclaw |

## Automated Deployment (GitHub Actions)

The preferred way to deploy. Triggered automatically on version tags or manually.

### How It Works

1. **Tag a release** → GitHub Actions runs tests → deploys via SSM → health checks → auto-rollback on failure
2. **Flow**: `git tag → CI tests → AWS OIDC auth → SSM RunCommand → docker-compose build/restart → health check`
3. **Rollback**: If health check fails, automatically rolls back to the previous commit

### Deploy a New Version

```bash
# Tag and push
git tag v1.2.0
git push origin v1.2.0
```

The deploy workflow will:
1. Run the test suite
2. Authenticate to AWS via OIDC (no stored credentials)
3. `git pull` on EC2 via SSM
4. `docker-compose build --no-cache && docker-compose up -d`
5. Health check: verify container is running, OpenClaw process exists, no fatal errors in logs
6. If anything fails → automatic rollback to the previous commit

### Manual Deploy (any ref)

Go to **Actions > Deploy > Run workflow** and optionally specify a git ref (branch, tag, or SHA).

### Monitor a Deploy

- **GitHub**: Actions tab → Deploy workflow
- **Logs**: `aws logs tail /openclaw/agents --follow`
- **SSM**: `aws ssm start-session --target <instance-id>`

## Manual Rollback

### Via Script

```bash
# Rollback to previous commit
./scripts/rollback.sh <instance-id>

# Rollback to a specific tag
./scripts/rollback.sh <instance-id> v1.1.0

# Rollback to a specific SHA
./scripts/rollback.sh <instance-id> abc1234
```

### Via SSH/SSM (emergency)

```bash
aws ssm start-session --target <instance-id>

cd /opt/openclaw
git log --oneline -5           # find the commit to roll back to
git checkout <ref>
docker-compose build --no-cache
docker-compose down && docker-compose up -d
docker logs -f openclaw-agents
```

## Setup (One-Time)

### 1. Deploy CDK Stack

The CDK stack creates the OIDC provider and IAM role for GitHub Actions:

```bash
npx cdk deploy
```

### 2. Configure GitHub Repository

After CDK deploy, set these in **Settings > Variables** (not secrets):

| Variable | Value | Source |
|----------|-------|--------|
| `EC2_INSTANCE_ID` | `i-0...` | CDK output `InstanceId` |
| `AWS_DEPLOY_ROLE_ARN` | `arn:aws:iam::role/openclaw-github-actions-deploy` | CDK output `GitHubActionsRoleArn` |

### 3. Create GitHub Environment

Create a `production` environment in **Settings > Environments** with:
- **Required reviewers** (optional but recommended)
- **Deployment branches**: tags only (`v*`)

### 4. Verify

```bash
git tag v0.0.1-test
git push origin v0.0.1-test
# Watch the Actions tab
```

## Config-Only Changes

For changes to `config/openclaw.json.tpl` or `agents/*/workspace/IDENTITY.md`, the same deploy pipeline applies. The Docker image rebuild picks up all file changes.

Alternatively, agents can apply config changes live via `config.patch` (as Kit did for the threading change), but these won't persist across container restarts unless the repo is also updated.

## Secret Changes

See [../secrets.md](../secrets.md). After updating secrets in AWS Secrets Manager:

```bash
# Restart picks up new secrets via entrypoint.sh
aws ssm send-command \
  --instance-ids <instance-id> \
  --document-name "AWS-RunShellScript" \
  --parameters "commands=[\"cd /opt/openclaw && docker-compose restart\"]"
```
