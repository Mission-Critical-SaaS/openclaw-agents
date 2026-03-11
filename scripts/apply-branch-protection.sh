#!/bin/bash
# Apply standardized branch protection rules to LMNTL-AI repos.
#
# Usage:
#   ./scripts/apply-branch-protection.sh                    # Apply to all known repos
#   ./scripts/apply-branch-protection.sh openclaw-agents    # Apply to one repo
#
# Prerequisites:
#   - gh CLI authenticated with admin access to the LMNTL-AI org
#   - SLACK_WEBHOOK_SDLC_REVIEWS org secret already configured
#
# What this does:
#   1. Enables branch protection on 'main'
#   2. Requires PR before merging
#   3. Requires status checks: 'Unit Tests' and 'ensemble-review'
#   4. Requires branches to be up-to-date
#   5. Does NOT enforce on admins (allows emergency force-merge)

set -euo pipefail

ORG="LMNTL-AI"
BRANCH="main"

# Repos to protect (add new repos here)
ALL_REPOS=(
  openclaw-agents
  lmntl
  service-platform
  web-platform
  mobile-platform
  web-admin-dashboard
  marketing-site
  brand-system
  tools
  e2e-test
  infra-jenkins
  infra-argocd
  infra-terraform
)

# If a specific repo is passed, use only that
if [ $# -gt 0 ]; then
  REPOS=("$1")
else
  REPOS=("${ALL_REPOS[@]}")
fi

for REPO in "${REPOS[@]}"; do
  echo "🔧 Applying branch protection to $ORG/$REPO ($BRANCH)..."

  # Check if repo exists and we have access
  if ! gh repo view "$ORG/$REPO" --json name > /dev/null 2>&1; then
    echo "  ⚠️  Skipping $REPO — repo not found or no access"
    continue
  fi

  # Check if main branch exists
  if ! gh api "repos/$ORG/$REPO/branches/$BRANCH" --jq '.name' > /dev/null 2>&1; then
    echo "  ⚠️  Skipping $REPO — branch '$BRANCH' not found"
    continue
  fi

  # Apply branch protection
  gh api "repos/$ORG/$REPO/branches/$BRANCH/protection" \
    --method PUT \
    --input - << 'EOF' 2>&1 || echo "  ❌ Failed to apply protection to $REPO"
{
  "required_status_checks": {
    "strict": true,
    "contexts": ["Unit Tests", "ensemble-review"]
  },
  "enforce_admins": false,
  "required_pull_request_reviews": {
    "required_approving_review_count": 0
  },
  "restrictions": null
}
EOF

  echo "  ✅ Branch protection applied to $ORG/$REPO"
done

echo ""
echo "Done. Verify at: https://github.com/LMNTL-AI/<repo>/settings/branches"
