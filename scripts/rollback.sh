#!/bin/bash
# rollback.sh - Rollback OpenClaw agents on EC2 via SSM
# Usage: ./scripts/rollback.sh <instance-id> [git-ref]
set -euo pipefail
INSTANCE_ID="${1:-}"
GIT_REF="${2:-HEAD~1}"
DEPLOY_DIR="/opt/openclaw"
if [ -z "$INSTANCE_ID" ]; then
  echo "Usage: $0 <instance-id> [git-ref]"
  echo "Examples:"
  echo "  $0 i-0c6a99a3e95cd52d6           # previous commit"
  echo "  $0 i-0c6a99a3e95cd52d6 v1.0.0    # specific tag"
  echo "  $0 i-0c6a99a3e95cd52d6 abc1234   # specific SHA"
  exit 1
fi
echo "Rolling back to ${GIT_REF} on ${INSTANCE_ID}..."
RESULT=$(aws ssm send-command \
  --instance-ids "$INSTANCE_ID" \
  --document-name "AWS-RunShellScript" \
  --timeout-seconds 300 \
  --parameters "commands=[\"set -euo pipefail\",\"cd ${DEPLOY_DIR}\",\"CURRENT=\\$(git rev-parse --short HEAD)\",\"echo Current: \\$CURRENT\",\"git fetch origin\",\"git checkout ${GIT_REF}\",\"NEW=\\$(git rev-parse --short HEAD)\",\"echo Rolling back to: \\$NEW\",\"docker-compose build --no-cache\",\"docker-compose down\",\"docker-compose up -d\",\"sleep 15\",\"docker-compose ps\",\"echo Rollback complete: \\$CURRENT to \\$NEW\"]" \
  --output json)
CMD_ID=$(echo "$RESULT" | jq -r '.Command.CommandId')
echo "SSM Command ID: ${CMD_ID}"
echo "Waiting for rollback..."
aws ssm wait command-executed --command-id "$CMD_ID" --instance-id "$INSTANCE_ID" 2>/dev/null || true
STATUS=$(aws ssm get-command-invocation --command-id "$CMD_ID" --instance-id "$INSTANCE_ID" --query 'Status' --output text)
OUTPUT=$(aws ssm get-command-invocation --command-id "$CMD_ID" --instance-id "$INSTANCE_ID" --query 'StandardOutputContent' --output text)
echo "$OUTPUT"
if [ "$STATUS" != "Success" ]; then
  ERROR=$(aws ssm get-command-invocation --command-id "$CMD_ID" --instance-id "$INSTANCE_ID" --query 'StandardErrorContent' --output text)
  echo "STDERR: $ERROR"
  echo "Rollback FAILED: $STATUS"
  exit 1
fi
echo "Rollback completed successfully!"
