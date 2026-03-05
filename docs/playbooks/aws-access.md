# AWS Account Access Guide

## Account Structure

| Account | ID | Role | Notes |
|---------|-----|------|-------|
| LMNTL LLC | 517311508324 | Management account | AWS Organizations root |
| LMNTL Agent Automation | 122015479852 | Production | OpenClaw lives here |
| MCS-Dev | 241016605528 | Development | Other projects |
| MCS-Prod | 524215332404 | Production | Other projects |
| MCS-SSO Management | 750552037543 | SSO | Identity management |

Organization ID: o-11op6kv9u4

## Accessing the Production Account (122015479852)

### Via AWS Console

1. Sign in to the management account:
   - URL: https://517311508324.signin.aws.amazon.com/console
   - Username: david-admin
   - (Password stored securely - contact David Allison)

2. Switch role to the production account:
   - Click your username in the top-right
   - Click Switch role
   - Account: 122015479852
   - Role: OrganizationAccountAccessRole
   - Display Name: LMNTL Agent Automation

### Via AWS CLI

The CLI profiles are configured in ~/.aws/config and ~/.aws/credentials on the admin workstation.

```bash
# To use the production account, you need a profile that can assume
# OrganizationAccountAccessRole in 122015479852 from the management account.

# Example profile setup:
# [profile lmntl-prod]
# role_arn = arn:aws:iam::122015479852:role/OrganizationAccountAccessRole
# source_profile = management-account
# region = us-east-1

aws ec2 describe-instances --profile lmntl-prod
```

### Via CloudShell

After switching role to 122015479852 in the console, open CloudShell. It automatically uses the assumed role credentials.

## Important Notes

- Root users cannot switch roles. You must sign in as an IAM user (e.g., david-admin) in the management account.
- CloudShell sessions inherit the current console role.
- EC2 Instance Connect requires the security group to allow SSH from AWS Instance Connect IP ranges.
- The EC2 instance IAM role (openclaw-ec2-role) has permissions for Secrets Manager access only.
