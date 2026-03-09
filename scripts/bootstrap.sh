#!/bin/bash
# ──────────────────────────────────────────────────────────
# OpenClaw Agents — EC2 bootstrap script (Ubuntu 22.04)
# Runs once on first boot via CDK UserData.
# After boot, deploy.sh handles code updates via GHA + SSM.
# ──────────────────────────────────────────────────────────
set -euo pipefail
exec > >(tee /var/log/user-data.log) 2>&1
echo "=== OpenClaw Instance Bootstrap ==="
date

OPENCLAW_HOME="/opt/openclaw"

echo "▶ Installing system packages..."
apt-get update -qq
apt-get install -y -qq docker.io docker-compose jq git awscli unzip

echo "▶ Starting Docker..."
systemctl enable docker
systemctl start docker

echo "▶ Creating OpenClaw directories..."
mkdir -p ${OPENCLAW_HOME} /data/logs

echo "▶ Cloning repo..."
cd ${OPENCLAW_HOME}
git clone https://github.com/LMNTL-AI/openclaw-agents.git .

# Check out the latest release tag
LATEST_TAG=$(git tag -l 'v*' --sort=-v:refname | head -1)
if [ -n "$LATEST_TAG" ]; then
  echo "▶ Checking out latest tag: $LATEST_TAG"
  git checkout "$LATEST_TAG"
else
  echo "▶ No release tags found, staying on main"
fi

echo "▶ Making scripts executable..."
chmod +x deploy.sh entrypoint.sh

echo "▶ Building Docker image..."
docker-compose build

echo "▶ Starting container..."
docker-compose up -d

echo "▶ Installing CloudWatch agent..."
if apt-get install -y -qq amazon-cloudwatch-agent 2>/dev/null; then
  cat > /opt/aws/amazon-cloudwatch-agent/etc/amazon-cloudwatch-agent.json <<'CWEOF'
{
  "logs": {
    "logs_collected": {
      "files": {
        "collect_list": [
          {
            "file_path": "/data/logs/*.log",
            "log_group_name": "/openclaw/agents",
            "log_stream_name": "{instance_id}/openclaw",
            "retention_in_days": 14
          }
        ]
      }
    }
  },
  "metrics": {
    "namespace": "OpenClaw",
    "metrics_collected": {
      "disk": { "resources": ["/"], "measurement": ["used_percent"] },
      "mem": { "measurement": ["mem_used_percent"] }
    }
  }
}
CWEOF

  /opt/aws/amazon-cloudwatch-agent/bin/amazon-cloudwatch-agent-ctl \
    -a fetch-config -m ec2 \
    -c file:/opt/aws/amazon-cloudwatch-agent/etc/amazon-cloudwatch-agent.json -s
  echo "▶ CloudWatch agent configured"
else
  echo "▶ CloudWatch agent not available on Ubuntu, skipping"
fi

echo "=== Bootstrap complete ==="
date
