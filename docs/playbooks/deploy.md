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

## Deploying Code Updates

### 1. Connect to the EC2 Instance

```bash
# Option A: EC2 Instance Connect (via AWS Console)
# Go to EC2 > Instances > i-0c6a99a3e95cd52d6 > Connect
# Use EC2 Instance Connect with username: ec2-user
# NOTE: Security group must allow SSH from EC2 Instance Connect IPs

# Option B: SSH with key pair
ssh -i ~/.ssh/openclaw-key.pem ec2-user@3.237.5.79

# Option C: SSM Session Manager (if SSM agent is installed)
aws ssm start-session --target i-0c6a99a3e95cd52d6
```

### 2. Pull Latest Code

```bash
cd /opt/openclaw
git pull origin main
```

### 3. Rebuild and Restart

```bash
# Rebuild the Docker image (picks up new openclaw version, config changes, etc.)
docker-compose build --no-cache

# Restart with the new image
docker-compose down && docker-compose up -d

# Verify agents come online
docker logs -f openclaw-gateway
# Look for "Connected to Slack" messages for all three agents
```

### 4. Verify in Slack

Go to **#leads** and @mention each agent to verify they respond:
- `@Scout health check`
- `@Trak health check`
- `@Kit health check`

## Deploying Config Changes

If you only changed `config/openclaw.json.tpl` or agent workspace files:

```bash
cd /opt/openclaw
git pull origin main
docker-compose restart    # No rebuild needed for config-only changes
```

## Deploying Secret Changes

See [../secrets.md](../secrets.md) for how to update secrets. After updating:

```bash
docker-compose restart    # Entrypoint re-fetches secrets on start
```

## Fresh Deployment (New EC2)

### 1. Launch EC2 Instance

```bash
# Using AWS CLI
aws ec2 run-instances \
  --image-id ami-0c02fb55956c7d316 \
  --instance-type t3.medium \
  --key-name openclaw-key \
  --security-group-ids sg-0660a2727735097e6 \
  --iam-instance-profile Name=openclaw-ec2-profile \
  --tag-specifications 'ResourceType=instance,Tags=[{Key=Name,Value=openclaw-agents}]' \
  --block-device-mappings '[{"DeviceName":"/dev/xvda","Ebs":{"VolumeSize":8,"VolumeType":"gp3"}}]'
```

### 2. Install Docker

```bash
sudo yum update -y
sudo yum install -y docker git
sudo systemctl enable docker && sudo systemctl start docker
sudo usermod -aG docker ec2-user

# Install Docker Compose
sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose
```

### 3. Clone and Configure

```bash
sudo mkdir -p /opt/openclaw
sudo chown ec2-user:ec2-user /opt/openclaw
cd /opt/openclaw
git clone https://github.com/Mission-Critical-SaaS/openclaw-agents.git .

# Create .env from secrets (entrypoint handles this, but for reference)
cp .env.example .env
```

### 4. Set Up Systemd Service

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

sudo systemctl daemon-reload
sudo systemctl enable openclaw
sudo systemctl start openclaw
```

### 5. Verify

```bash
# Check container is running
docker ps

# Check logs
docker logs -f openclaw-gateway

# Test in Slack
# @Scout health check in #leads
```
