# Restart Procedures

## Quick Restart (Config/Secret Changes Only)

Via SSM (preferred — no SSH needed):

```bash
aws ssm send-command \
  --instance-ids i-0acd7169101e93388 \
  --document-name AWS-RunShellScript \
  --parameters 'commands=["cd /opt/openclaw && docker-compose restart"]' \
  --output json
```

Or via SSH:

```bash
ssh ubuntu@<instance-ip>
cd /opt/openclaw
docker-compose restart
```

This re-runs the entrypoint, which re-fetches secrets and regenerates the config.

## Full Restart (Code Changes)

Use CI/CD for code changes — tag and push:

```bash
git tag v1.x.x && git push origin v1.x.x
```

For emergency manual restart on the instance:

```bash
cd /opt/openclaw
git pull
docker-compose build --no-cache
docker-compose down && docker-compose up -d
```

## Emergency: Container Crashed

```bash
docker logs --tail 50 openclaw-agents

cd /opt/openclaw
docker-compose down
docker-compose up -d
```

## Emergency: EC2 Instance Down

```bash
aws ec2 describe-instance-status --instance-ids i-0acd7169101e93388

aws ec2 start-instances --instance-ids i-0acd7169101e93388

aws ec2 wait instance-running --instance-ids i-0acd7169101e93388

aws ec2 describe-instances --instance-ids i-0acd7169101e93388
```

## Emergency: Complete Redeployment

If the instance is unrecoverable, use CDK to provision a new one. See [deploy.md](../playbooks/deploy.md) for fresh deployment procedures.

## Verification After Any Restart

1. Check container is running: `docker ps`
2. Check logs for connection messages: `docker logs openclaw-agents`
3. Check MCP server health: `docker exec openclaw-agents openclaw status`
4. Test each agent via DM in Slack
5. Confirm response time is under 10 seconds
