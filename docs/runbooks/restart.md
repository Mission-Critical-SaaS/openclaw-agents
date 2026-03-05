# Restart Procedures

## Quick Restart (Config/Secret Changes Only)

```bash
ssh ec2-user@3.237.5.79
cd /opt/openclaw
docker-compose restart
```

This re-runs the entrypoint, which re-fetches secrets and regenerates the config.

## Full Restart (Code Changes)

```bash
ssh ec2-user@3.237.5.79
cd /opt/openclaw
git pull
docker-compose build --no-cache
docker-compose down && docker-compose up -d
```

## Emergency: Container Crashed

```bash
ssh ec2-user@3.237.5.79

docker logs --tail 50 openclaw-gateway

sudo systemctl restart openclaw

cd /opt/openclaw
docker-compose down
docker-compose up -d
```

## Emergency: EC2 Instance Down

```bash
aws ec2 describe-instance-status --instance-ids i-0c6a99a3e95cd52d6

aws ec2 start-instances --instance-ids i-0c6a99a3e95cd52d6

aws ec2 wait instance-running --instance-ids i-0c6a99a3e95cd52d6

aws ec2 describe-instances --instance-ids i-0c6a99a3e95cd52d6
```

## Emergency: Complete Redeployment

If the instance is unrecoverable, follow the Fresh Deployment procedure.

## Verification After Any Restart

1. Check container is running: docker ps
2. Check logs for connection messages: docker logs openclaw-gateway
3. Test each agent in Slack #leads
4. Confirm response time is under 10 seconds
