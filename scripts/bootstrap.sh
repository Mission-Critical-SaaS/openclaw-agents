#!/bin/bash
# ──────────────────────────────────────────────────────────
# OpenClaw Agents — EC2 bootstrap script
# Runs once on first boot via CDK UserData
# ──────────────────────────────────────────────────────────
set -euo pipefail

REGION=$(curl -s http://169.254.169.254/latest/meta-data/placement/region)
OPENCLAW_HOME="/opt/openclaw"
OPENCLAW_VERSION="latest"

echo "▶ Installing Docker..."
dnf install -y docker jq
systemctl enable docker
systemctl start docker

echo "▶ Installing Docker Compose..."
DOCKER_COMPOSE_VERSION="v2.27.0"
curl -fsSL "https://github.com/docker/compose/releases/download/${DOCKER_COMPOSE_VERSION}/docker-compose-linux-$(uname -m)" \
  -o /usr/local/bin/docker-compose
chmod +x /usr/local/bin/docker-compose

echo "▶ Creating OpenClaw directories..."
mkdir -p ${OPENCLAW_HOME}/{config,agents/{scout,trak,kit}/{workspace,skills},data,logs}

echo "▶ Fetching secrets from SSM Parameter Store..."
fetch_param() {
  aws ssm get-parameter --name "$1" --with-decryption --region "$REGION" --query 'Parameter.Value' --output text 2>/dev/null || echo ""
}

ANTHROPIC_API_KEY=$(fetch_param /openclaw/anthropic-api-key)
SLACK_BOT_TOKEN_SCOUT=$(fetch_param /openclaw/slack-bot-token-scout)
SLACK_APP_TOKEN_SCOUT=$(fetch_param /openclaw/slack-app-token-scout)
SLACK_BOT_TOKEN_TRAK=$(fetch_param /openclaw/slack-bot-token-trak)
SLACK_APP_TOKEN_TRAK=$(fetch_param /openclaw/slack-app-token-trak)
SLACK_BOT_TOKEN_KIT=$(fetch_param /openclaw/slack-bot-token-kit)
SLACK_APP_TOKEN_KIT=$(fetch_param /openclaw/slack-app-token-kit)

echo "▶ Writing environment file..."
cat > ${OPENCLAW_HOME}/.env <<EOF
ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY}
SLACK_BOT_TOKEN_SCOUT=${SLACK_BOT_TOKEN_SCOUT}
SLACK_APP_TOKEN_SCOUT=${SLACK_APP_TOKEN_SCOUT}
SLACK_BOT_TOKEN_TRAK=${SLACK_BOT_TOKEN_TRAK}
SLACK_APP_TOKEN_TRAK=${SLACK_APP_TOKEN_TRAK}
SLACK_BOT_TOKEN_KIT=${SLACK_BOT_TOKEN_KIT}
SLACK_APP_TOKEN_KIT=${SLACK_APP_TOKEN_KIT}
EOF
chmod 600 ${OPENCLAW_HOME}/.env

echo "▶ Copying config files..."
# These are baked into the AMI or pulled from S3/GitHub at deploy time
# For now, we use the ones from the repo (copied by deploy script)

echo "▶ Installing CloudWatch agent..."
dnf install -y amazon-cloudwatch-agent
cat > /opt/aws/amazon-cloudwatch-agent/etc/amazon-cloudwatch-agent.json <<'CWEOF'
{
  "logs": {
    "logs_collected": {
      "files": {
        "collect_list": [
          {
            "file_path": "/opt/openclaw/logs/*.log",
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
      "disk": {
        "resources": ["/"],
        "measurement": ["used_percent"]
      },
      "mem": {
        "measurement": ["mem_used_percent"]
      }
    }
  }
}
CWEOF
/opt/aws/amazon-cloudwatch-agent/bin/amazon-cloudwatch-agent-ctl \
  -a fetch-config -m ec2 \
  -c file:/opt/aws/amazon-cloudwatch-agent/etc/amazon-cloudwatch-agent.json -s

echo "▶ Setting up systemd service for OpenClaw..."
cat > /etc/systemd/system/openclaw.service <<'SVCEOF'
[Unit]
Description=OpenClaw Multi-Agent Gateway
After=docker.service
Requires=docker.service

[Service]
Type=simple
WorkingDirectory=/opt/openclaw
ExecStart=/usr/local/bin/docker-compose up --remove-orphans
ExecStop=/usr/local/bin/docker-compose down
Restart=always
RestartSec=10
EnvironmentFile=/opt/openclaw/.env

[Install]
WantedBy=multi-user.target
SVCEOF

systemctl daemon-reload
systemctl enable openclaw

echo "▶ Starting OpenClaw..."
cd ${OPENCLAW_HOME}
# docker-compose will start via systemd once compose file is in place
# The deploy script copies docker-compose.yml and agent configs, then starts

echo "✅ Bootstrap complete"
