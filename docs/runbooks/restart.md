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

docker logs --tail 50 openclaw-agents

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
2. Check logs for connection messages: docker logs openclaw-agents
3. Test each agent in Slack #leads
4. Confirm response time is under 10 seconds


## Watchdog Automatic Recovery

The watchdog service (`openclaw-watchdog.service`) automatically detects and repairs most failures. Before manually restarting, check if the watchdog is already handling it:

```bash
# Check watchdog status
systemctl status openclaw-watchdog
/opt/openclaw/scripts/watchdog.sh --status

# Check watchdog log for recent repair activity
tail -30 /opt/openclaw/logs/watchdog.log
```

If the watchdog is active and attempting repairs, wait for it to complete (up to 5 minutes per tier). Only intervene manually if:
- The watchdog service itself is down
- All repair tiers have been exhausted (check log for "ALL REPAIR TIERS EXHAUSTED")
- The issue requires a code change, not just a restart

## Restarting the Watchdog

```bash
# Restart watchdog service (after editing watchdog.sh)
sudo systemctl restart openclaw-watchdog

# Check it's running
systemctl is-active openclaw-watchdog
```
