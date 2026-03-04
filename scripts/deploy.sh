#!/bin/bash
# ──────────────────────────────────────────────────────────
# deploy.sh — Deploy OpenClaw agents to EC2 via SSM
# ──────────────────────────────────────────────────────────
# Usage:
#   ./scripts/deploy.sh [instance-id]
#
# Prerequisites:
#   - AWS CLI configured with appropriate credentials
#   - SSM Session Manager plugin installed
#   - .env file with all tokens populated
# ──────────────────────────────────────────────────────────
set -euo pipefail

INSTANCE_ID="${1:-}"
OPENCLAW_REMOTE="/opt/openclaw"

if [ -z "$INSTANCE_ID" ]; then
  echo "Usage: $0 <instance-id>"
  echo ""
  echo "Get the instance ID from CDK output:"
  echo "  npx cdk deploy && cat cdk-outputs.json | jq -r '.OpenclawAgentsStack.InstanceId'"
  exit 1
fi

echo "▶ Deploying OpenClaw agents to ${INSTANCE_ID}..."

# Upload config files via SSM Run Command
echo "▶ Syncing configuration files..."

# Package config + agents into a tarball
TMPDIR=$(mktemp -d)
tar -czf "${TMPDIR}/openclaw-config.tar.gz" \
  -C "$(dirname "$0")/.." \
  config/ agents/ docker/ docker-compose.yml .env

# Upload via S3 (SSM has size limits for direct commands)
BUCKET="openclaw-deploy-$(aws sts get-caller-identity --query Account --output text)"
aws s3 mb "s3://${BUCKET}" 2>/dev/null || true
aws s3 cp "${TMPDIR}/openclaw-config.tar.gz" "s3://${BUCKET}/openclaw-config.tar.gz"

# Run deployment commands on the instance
aws ssm send-command \
  --instance-ids "${INSTANCE_ID}" \
  --document-name "AWS-RunShellScript" \
  --parameters "commands=[
    'aws s3 cp s3://${BUCKET}/openclaw-config.tar.gz /tmp/openclaw-config.tar.gz',
    'cd ${OPENCLAW_REMOTE} && tar -xzf /tmp/openclaw-config.tar.gz',
    'cd ${OPENCLAW_REMOTE} && docker-compose pull || true',
    'cd ${OPENCLAW_REMOTE} && docker-compose build',
    'systemctl restart openclaw',
    'sleep 5',
    'docker-compose -f ${OPENCLAW_REMOTE}/docker-compose.yml ps'
  ]" \
  --output text

echo "▶ Cleaning up..."
rm -rf "${TMPDIR}"

echo "✅ Deployment complete!"
echo ""
echo "Monitor logs:"
echo "  aws logs tail /openclaw/agents --follow"
echo ""
echo "Connect to instance:"
echo "  aws ssm start-session --target ${INSTANCE_ID}"
