#!/bin/bash
# ──────────────────────────────────────────────────────────
# OpenClaw Agents — EC2 bootstrap script
# Runs once on first boot via CDK UserData
# ──────────────────────────────────────────────────────────
set -euo pipefail

# IMDSv2 requires a token on Amazon Linux 2023
IMDS_TOKEN=$(curl -s -X PUT "http://169.254.169.254/latest/api/token" -H "X-aws-ec2-metadata-token-ttl-seconds: 300")
REGION=$(curl -s -H "X-aws-ec2-metadata-token: $IMDS_TOKEN" http://169.254.169.254/latest/meta-data/placement/region)
OPENCLAW_HOME="/opt/openclaw"

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
mkdir -p ${OPENCLAW_HOME}/{config,agents/{scout,trak,kit}/{workspace,agent},data,logs}

echo "▶ Fetching secrets from AWS Secrets Manager..."
SECRET_JSON=$(aws secretsmanager get-secret-value \
  --secret-id openclaw/agents \
  --region "$REGION" \
  --query 'SecretString' \
  --output text)

# Parse individual values from the JSON secret
extract() { echo "$SECRET_JSON" | jq -r ".$1 // empty"; }

ANTHROPIC_API_KEY=$(extract ANTHROPIC_API_KEY)
SLACK_BOT_TOKEN_SCOUT=$(extract SLACK_BOT_TOKEN_SCOUT)
SLACK_APP_TOKEN_SCOUT=$(extract SLACK_APP_TOKEN_SCOUT)
SLACK_BOT_TOKEN_TRAK=$(extract SLACK_BOT_TOKEN_TRAK)
SLACK_APP_TOKEN_TRAK=$(extract SLACK_APP_TOKEN_TRAK)
SLACK_BOT_TOKEN_KIT=$(extract SLACK_BOT_TOKEN_KIT)
SLACK_APP_TOKEN_KIT=$(extract SLACK_APP_TOKEN_KIT)
ATLASSIAN_SITE_NAME=$(extract ATLASSIAN_SITE_NAME)
ATLASSIAN_USER_EMAIL=$(extract ATLASSIAN_USER_EMAIL)
ATLASSIAN_API_TOKEN=$(extract ATLASSIAN_API_TOKEN)
GITHUB_TOKEN=$(extract GITHUB_TOKEN)
SLACK_ALLOW_FROM=$(extract SLACK_ALLOW_FROM)

echo "▶ Writing environment file..."
cat > ${OPENCLAW_HOME}/.env <<EOF
ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY}
SLACK_BOT_TOKEN_SCOUT=${SLACK_BOT_TOKEN_SCOUT}
SLACK_APP_TOKEN_SCOUT=${SLACK_APP_TOKEN_SCOUT}
SLACK_BOT_TOKEN_TRAK=${SLACK_BOT_TOKEN_TRAK}
SLACK_APP_TOKEN_TRAK=${SLACK_APP_TOKEN_TRAK}
SLACK_BOT_TOKEN_KIT=${SLACK_BOT_TOKEN_KIT}
SLACK_APP_TOKEN_KIT=${SLACK_APP_TOKEN_KIT}
ATLASSIAN_SITE_NAME=${ATLASSIAN_SITE_NAME}
ATLASSIAN_USER_EMAIL=${ATLASSIAN_USER_EMAIL}
ATLASSIAN_API_TOKEN=${ATLASSIAN_API_TOKEN}
GITHUB_TOKEN=${GITHUB_TOKEN}
SLACK_ALLOW_FROM=${SLACK_ALLOW_FROM}
EOF
chmod 600 ${OPENCLAW_HOME}/.env

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

echo "✅ Bootstrap complete — waiting for deploy script to push compose file and start service"
