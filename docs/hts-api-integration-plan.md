# HourTimesheet API Integration Plan

**Issue #98** | Last updated: 2026-03-19

Technical plan for integrating HourTimesheet APIs with the ElevenLabs voice agent to provide context, verify customer accounts, and enable enhanced support capabilities.

---

## 1. INTEGRATION OVERVIEW

### Purpose

The ElevenLabs AI agent needs limited read-only access to HourTimesheet data to:
- Verify customer identity and account status
- Retrieve subscription and billing information
- Check timesheet configuration (periods, charge codes)
- Verify QuickBooks/payroll integration status
- Troubleshoot sync issues with external systems
- Provide real-time account context during support conversations

### Architecture

```
ElevenLabs Agent
    ↓
HTTPS API Calls
    ↓
HourTimesheet API Gateway
    ↓
HourTimesheet Application
    ↓
Database Queries (read-only)
```

### Design Principles

1. **Read-Only Operations:** No data modification via API
2. **No Financial Transactions:** Cannot process payments or transfers
3. **Customer Verification:** Require additional verification for sensitive data
4. **Audit Trail:** Log all API access for compliance
5. **Rate Limiting:** Prevent abuse and ensure system stability
6. **Security:** TLS encryption, authentication, IP whitelisting

---

## 2. API ENDPOINTS SPECIFICATION

### Base Configuration

**API Base URL:**
```
https://api.hourtimesheet.com/v1
```

**Authentication:**
```
Authorization: Bearer {API_TOKEN}
X-API-Key: {API_KEY}
```

**TLS Version:** 1.2+
**Content-Type:** application/json

### Endpoint 1: Get Account Status

**Purpose:** Verify customer account exists and retrieve basic account info

**Request:**
```
GET /accounts/{account_id}
Authorization: Bearer {API_TOKEN}
X-API-Key: {API_KEY}
```

**Path Parameters:**
```json
{
  "account_id": {
    "type": "string",
    "description": "Account ID from customer email verification"
  }
}
```

**Response (200 OK):**
```json
{
  "id": "acct_123456",
  "name": "ABC Government Contractors",
  "email": "admin@abccontractors.com",
  "status": "active",
  "subscription_status": "active",
  "created_at": "2021-03-15T10:30:00Z",
  "updated_at": "2026-03-19T14:00:00Z",
  "trial_status": "completed",
  "trial_end_date": null,
  "payment_method": "credit_card",
  "payment_status": "current",
  "user_count": 24,
  "active_users": 22,
  "features": {
    "dcaa_compliance": true,
    "mobile_app": true,
    "api_access": false,
    "advanced_reporting": true,
    "custom_integrations": true
  },
  "integrations": {
    "quickbooks_online": {
      "status": "connected",
      "last_sync": "2026-03-19T14:00:00Z"
    },
    "adp_workforce_now": {
      "status": "connected",
      "last_sync": "2026-03-19T13:45:00Z"
    },
    "paychex_flex": {
      "status": "not_connected"
    }
  }
}
```

**Response (401 Unauthorized):**
```json
{
  "error": "invalid_credentials",
  "message": "API token expired or invalid"
}
```

**Response (403 Forbidden):**
```json
{
  "error": "insufficient_permission",
  "message": "API token does not have permission to access this account"
}
```

**Response (404 Not Found):**
```json
{
  "error": "account_not_found",
  "message": "Account does not exist"
}
```

**Usage Example:**
```
Agent: "Let me look up your account status."
Call: GET /accounts/acct_123456
Response: Account active, subscription current, QBO sync working

Agent: "I see your account is in good standing, with 22 active users.
Your QuickBooks Online integration synced just 19 minutes ago."
```

### Endpoint 2: Get Subscription Info

**Purpose:** Retrieve subscription plan, billing details, and renewal information

**Request:**
```
GET /accounts/{account_id}/subscription
Authorization: Bearer {API_TOKEN}
X-API-Key: {API_KEY}
```

**Response (200 OK):**
```json
{
  "subscription_id": "sub_789012",
  "account_id": "acct_123456",
  "plan": "professional",
  "plan_name": "Professional Plan",
  "billing_cycle": "annual",
  "users_included": 20,
  "price_per_user": 8.00,
  "total_annual_cost": 160.00,
  "total_monthly_cost": 13.33,
  "current_period_start": "2025-03-19",
  "current_period_end": "2026-03-19",
  "renewal_date": "2026-03-19",
  "auto_renewal": true,
  "status": "active",
  "created_at": "2025-03-19T00:00:00Z",
  "payment_method": {
    "type": "credit_card",
    "last_four": "4242",
    "expiration_month": 12,
    "expiration_year": 2027,
    "cardholder_name": "John Smith"
  },
  "invoices": [
    {
      "id": "inv_345678",
      "date": "2025-03-19",
      "amount": 160.00,
      "status": "paid",
      "due_date": "2025-04-19",
      "paid_date": "2025-03-21"
    },
    {
      "id": "inv_345679",
      "date": "2026-03-19",
      "amount": 160.00,
      "status": "pending",
      "due_date": "2026-04-19",
      "paid_date": null
    }
  ],
  "discount": {
    "code": "GOV20",
    "description": "Government contractor discount",
    "discount_percentage": 10,
    "discount_amount": 16.00,
    "expiration_date": "2026-06-30"
  },
  "overage": {
    "current_overage_users": 2,
    "overage_rate_per_user": 8.00,
    "current_overage_cost": 16.00
  }
}
```

**Usage Example:**
```
Customer: "I'm having billing issues."
Agent: Calls GET /accounts/{id}/subscription
Response: Current subscription active, latest invoice (March 19) pending payment

Agent: "I see your subscription is due to renew on March 19. Your latest
invoice for $160 is currently pending. Would you like me to check your payment method?"
```

### Endpoint 3: Get Timesheet Period Config

**Purpose:** Retrieve current and upcoming timesheet periods, approval workflow, and configuration

**Request:**
```
GET /accounts/{account_id}/timesheet-periods
Authorization: Bearer {API_TOKEN}
X-API-Key: {API_KEY}

Query Parameters:
- include_past: boolean (default: false)
- limit: integer (default: 5, max: 50)
```

**Response (200 OK):**
```json
{
  "account_id": "acct_123456",
  "periods": [
    {
      "id": "period_2026_001",
      "period_number": 1,
      "year": 2026,
      "name": "Period 1 (Jan 1-14, 2026)",
      "start_date": "2026-01-01",
      "end_date": "2026-01-14",
      "status": "closed",
      "approval_status": "all_approved",
      "approval_deadline": "2026-01-20",
      "timesheet_count": 22,
      "approved_count": 22,
      "pending_count": 0,
      "rejected_count": 0,
      "total_hours": 1584.5,
      "total_overtime_hours": 42.0
    },
    {
      "id": "period_2026_006",
      "period_number": 6,
      "year": 2026,
      "name": "Period 6 (Mar 8-21, 2026)",
      "start_date": "2026-03-08",
      "end_date": "2026-03-21",
      "status": "active",
      "approval_status": "in_progress",
      "approval_deadline": "2026-03-27",
      "timesheet_count": 22,
      "approved_count": 18,
      "pending_count": 4,
      "rejected_count": 0,
      "total_hours": 1520.0,
      "total_overtime_hours": 18.5,
      "payroll_status": "not_processed",
      "payroll_deadline": "2026-03-30"
    }
  ],
  "approval_workflow": {
    "levels": [
      {
        "level": 1,
        "name": "Supervisor",
        "required": true,
        "allowed_roles": ["supervisor", "manager", "admin"]
      },
      {
        "level": 2,
        "name": "Manager",
        "required": false,
        "allowed_roles": ["manager", "admin"]
      },
      {
        "level": 3,
        "name": "Accountant Review",
        "required": false,
        "allowed_roles": ["accountant", "admin"]
      }
    ],
    "rejection_allowed": true,
    "comments_required_on_rejection": true
  },
  "configuration": {
    "period_type": "biweekly",
    "period_length_days": 14,
    "approval_required": true,
    "approval_deadline_days_after_period_end": 6,
    "lock_entries_days_after_period_end": 30,
    "allow_backdated_entries": false,
    "require_daily_entry": true,
    "daily_entry_reminder": true,
    "overtime_threshold_daily": 8,
    "overtime_threshold_weekly": 40,
    "overtime_threshold_biweekly": 80
  }
}
```

**Usage Example:**
```
Customer: "How many timesheets are pending approval?"
Agent: Calls GET /accounts/{id}/timesheet-periods
Response: Current period (Mar 8-21) has 4 pending timesheets, 18 approved

Agent: "For the current period ending March 21, I see 4 timesheets still
pending supervisor approval out of 22 total. The approval deadline is March 27."
```

### Endpoint 4: Get Charge Code Setup

**Purpose:** Retrieve charge code hierarchy, configuration, and status

**Request:**
```
GET /accounts/{account_id}/charge-codes
Authorization: Bearer {API_TOKEN}
X-API-Key: {API_KEY}

Query Parameters:
- include_inactive: boolean (default: false)
- department_id: string (optional, filter by department)
- limit: integer (default: 25, max: 100)
```

**Response (200 OK):**
```json
{
  "account_id": "acct_123456",
  "charge_codes": [
    {
      "id": "code_001",
      "code": "GOVT-2024-001",
      "name": "DoD Contract - Main Project",
      "description": "Primary government contract with Department of Defense",
      "type": "direct",
      "status": "active",
      "department": "Engineering",
      "parent_code": null,
      "children_count": 3,
      "created_at": "2024-01-15T08:00:00Z",
      "start_date": "2024-01-01",
      "end_date": null,
      "budget": {
        "total_hours": 10000,
        "used_hours": 6432.5,
        "remaining_hours": 3567.5,
        "budget_status": "on_track",
        "monthly_burn_rate": 520
      },
      "access": {
        "restricted": true,
        "allowed_employees": 8,
        "allowed_departments": ["Engineering"],
        "allow_supervisors_only": false
      },
      "restrictions": {
        "age_days": 90,
        "require_approval": false,
        "requires_specific_role": false,
        "internal_controls": "DCAA compliant"
      }
    },
    {
      "id": "code_002",
      "code": "IND-ADMIN",
      "name": "Indirect - Administrative",
      "description": "General administrative overhead",
      "type": "indirect",
      "status": "active",
      "department": null,
      "parent_code": "IND-ROOT",
      "children_count": 0,
      "created_at": "2024-01-01T00:00:00Z",
      "start_date": "2024-01-01",
      "end_date": null,
      "budget": null,
      "access": {
        "restricted": false,
        "allowed_employees": null,
        "allowed_departments": null
      }
    },
    {
      "id": "code_003",
      "code": "GOVT-2024-001-TASK-A",
      "name": "Project Phase 1 - Design",
      "description": "Design phase of DoD contract",
      "type": "direct",
      "status": "inactive",
      "department": "Engineering",
      "parent_code": "GOVT-2024-001",
      "children_count": 0,
      "created_at": "2024-01-15T08:00:00Z",
      "start_date": "2024-01-01",
      "end_date": "2025-06-30",
      "budget": {
        "total_hours": 1200,
        "used_hours": 1200,
        "remaining_hours": 0,
        "budget_status": "depleted"
      },
      "status_reason": "Phase complete"
    }
  ],
  "summary": {
    "total_codes": 45,
    "active_codes": 38,
    "inactive_codes": 7,
    "direct_labor_codes": 28,
    "indirect_labor_codes": 17,
    "direct_hours_used": 18934.25,
    "direct_hours_available": 31065.75,
    "indirect_hours_used": 8043.5
  }
}
```

**Usage Example:**
```
Customer: "I'm getting an error saying my charge code is inactive."
Agent: Calls GET /accounts/{id}/charge-codes
Response: Code TASK-A is marked inactive, ended June 30, 2025

Agent: "I found the issue. The charge code you're trying to use (GOVT-2024-001-TASK-A)
was deactivated on June 30, 2025 when that project phase was completed.
Please ask your supervisor to assign you an active charge code for the current work."
```

### Endpoint 5: Get Integration Sync Status

**Purpose:** Retrieve status of payroll and accounting system integrations

**Request:**
```
GET /accounts/{account_id}/integrations
Authorization: Bearer {API_TOKEN}
X-API-Key: {API_KEY}
```

**Response (200 OK):**
```json
{
  "account_id": "acct_123456",
  "integrations": [
    {
      "id": "int_qbo_001",
      "type": "quickbooks_online",
      "name": "QuickBooks Online",
      "status": "connected",
      "authenticated": true,
      "last_sync_time": "2026-03-19T14:00:15Z",
      "last_sync_status": "success",
      "sync_frequency": "hourly",
      "next_sync_time": "2026-03-19T15:00:00Z",
      "connection_date": "2024-11-15T10:30:00Z",
      "last_error": null,
      "error_count": 0,
      "warning_count": 0,
      "last_error_time": null,
      "sync_statistics": {
        "total_syncs": 12543,
        "successful_syncs": 12532,
        "failed_syncs": 11,
        "success_rate": 99.91
      },
      "configuration": {
        "auto_sync_enabled": true,
        "sync_direction": "bidirectional",
        "sync_type": "timesheet_to_invoice",
        "entity_mapping": {
          "customers_mapped": 15,
          "jobs_mapped": 28,
          "items_mapped": 12
        }
      },
      "recent_issues": [
        {
          "date": "2026-03-18T09:30:00Z",
          "type": "warning",
          "message": "3 timesheets could not be mapped to QBO jobs",
          "resolution": "Missing job in QBO"
        }
      ]
    },
    {
      "id": "int_adp_001",
      "type": "adp_workforce_now",
      "name": "ADP Workforce Now",
      "status": "connected",
      "authenticated": true,
      "last_sync_time": "2026-03-19T13:45:22Z",
      "last_sync_status": "success",
      "sync_frequency": "daily",
      "next_sync_time": "2026-03-19T23:00:00Z",
      "connection_date": "2024-06-01T14:20:00Z",
      "last_error": null,
      "error_count": 0,
      "warning_count": 0,
      "sync_statistics": {
        "total_syncs": 628,
        "successful_syncs": 628,
        "failed_syncs": 0,
        "success_rate": 100.0
      },
      "configuration": {
        "auto_sync_enabled": true,
        "sync_direction": "one_way",
        "sync_type": "timesheet_to_payroll",
        "payroll_cycle": "biweekly",
        "sync_deadline": "11:59 PM EST"
      },
      "recent_issues": []
    },
    {
      "id": "int_paychex_001",
      "type": "paychex_flex",
      "name": "Paychex Flex",
      "status": "not_connected",
      "authenticated": false,
      "last_sync_time": null,
      "connection_date": null,
      "setup_link": "https://api.hourtimesheet.com/integrations/setup/paychex",
      "documentation_link": "https://hourtimesheet.com/help/paychex"
    }
  ],
  "sync_health": {
    "overall_status": "healthy",
    "alert_count": 0,
    "warning_count": 1,
    "last_sync_overall": "2026-03-19T14:00:15Z",
    "next_scheduled_sync": "2026-03-19T15:00:00Z",
    "all_systems_synced": true,
    "critical_issues": []
  }
}
```

**Usage Example:**
```
Customer: "My timesheet isn't showing up in ADP."
Agent: Calls GET /accounts/{id}/integrations
Response: ADP Workforce Now connected, last sync 6 hours ago, status: success

Agent: "Your ADP integration is connected and working properly. The last sync
was 6 hours ago and successful. Let's check if your timesheet is pending approval
first - once approved, it should sync to ADP within the next payroll cycle."
```

### Endpoint 6: Trigger Password Reset

**Purpose:** Initiate password reset email (no database write, just sends email)

**Request:**
```
POST /accounts/{account_id}/password-reset-request
Authorization: Bearer {API_TOKEN}
X-API-Key: {API_KEY}
Content-Type: application/json

{
  "user_email": "john.smith@company.com",
  "requester_type": "support_agent"
}
```

**Response (200 OK - Email Sent):**
```json
{
  "success": true,
  "message": "Password reset email sent",
  "email_sent_to": "john.smith@company.com",
  "reset_link_expires_in": 3600,
  "timestamp": "2026-03-19T14:15:00Z"
}
```

**Response (400 Bad Request):**
```json
{
  "error": "user_not_found",
  "message": "User with email john.smith@company.com not found in this account"
}
```

**Response (409 Conflict):**
```json
{
  "error": "reset_in_progress",
  "message": "Password reset already requested in last 15 minutes",
  "retry_after_seconds": 600
}
```

**Usage Example:**
```
Customer: "I forgot my password."
Agent: Says "I'll send you a password reset email right away."
Calls: POST /accounts/{id}/password-reset-request
Response: Email sent successfully

Agent: "Check your email for a password reset link. It will expire in 1 hour.
If you don't see it, check your spam folder or let me know."
```

---

## 3. AUTHENTICATION MECHANISM

### API Key & Token System

**Two-Factor Authentication:**
- API Key: Long-lived credential, identifies the agent
- Bearer Token: Short-lived, session-based, for additional security

**Generation:**
1. Admin creates API credentials in HourTimesheet dashboard
2. API Key: 64-character random string (e.g., `hts_sk_live_...`)
3. Bearer Token: JWT or OAuth token, 24-hour lifetime
4. Both stored securely in ElevenLabs secrets

**Usage:**
```
GET /accounts/acct_123456
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
X-API-Key: hts_sk_live_1a2b3c4d5e6f7g8h9i0j1k2l3m4n5o6p
```

**Token Refresh:**
- Tokens auto-refresh after 12 hours (no agent action needed)
- Refresh token stored securely
- Invalid token → agent re-authenticates

**API Key Rotation:**
- Rotate every 90 days (manual, admin action)
- Old key deactivated, new key provided
- 30-day grace period for old key

### Customer Verification

**Before accessing sensitive data:**

Customer must verify they are account owner/admin:
1. Agent asks: "For security, I need to verify you're authorized for this account. What is the email address registered to your account?"
2. Customer provides email
3. Agent verifies email matches account owner/admin email from API
4. If match: Can access account data
5. If no match: "I'm unable to access that information. Please contact the account administrator at [email]."

**Fields Available Without Verification:**
- Integration status (connected/disconnected)
- Last sync time
- General health status

**Fields Requiring Verification:**
- Subscription billing details
- Payment method info
- User count and active users
- Detailed charge code budget info

---

## 4. SECURITY CONSTRAINTS

### Read-Only Enforcement

**Allowed Operations:**
- GET endpoints: Read data
- List endpoints: Browse without modification
- Status queries: Check integration health

**Prohibited Operations:**
- POST to modify data
- PUT/PATCH to update records
- DELETE to remove data
- PATCH /accounts to change settings
- API calls to financials system

**Implementation:**
- API keys scoped to read-only permissions
- Database queries restricted to SELECT only
- No write permissions in token scope
- Audit logs of all API calls

### No Financial Transactions

**Prohibited:**
- Cannot process payments
- Cannot update billing info
- Cannot change subscription level
- Cannot issue refunds
- Cannot modify payment method

**If Customer Asks About:**
- Billing: "For security, you'll need to update billing directly in your account settings or contact our billing department."
- Payment: "I'm unable to process payments. Please go to Settings > Billing or call us at 1-888-780-9961."
- Refunds: "Refund requests must be made through our billing team."

### Data Access Limits

**Endpoints Allowed:**
- Account status (general info)
- Subscription info (plan, user count, renewal date)
- Timesheet periods (approval status, deadline)
- Charge codes (active, budget)
- Integration status (connected/not connected)

**Endpoints NOT Allowed:**
- /payroll (never)
- /payments (never)
- /financial-reports (never)
- /tax-data (never)
- /employee-salary (never)
- /customers-pii (personal info restricted)

**Field Redaction:**
- Payment method: Only last 4 digits
- Social security numbers: Fully masked
- Credit card numbers: Never exposed
- Tax IDs: Partially masked

### Rate Limiting

**Limits per API Key:**
- 100 requests per minute
- 10,000 requests per hour
- 100,000 requests per day

**Per Account (customer):**
- 10 API calls per voice call
- 5 API calls per chat session
- Prevents excessive querying

**Handling Rate Limits:**
```
HTTP 429 Too Many Requests
Retry-After: 60

Response:
{
  "error": "rate_limit_exceeded",
  "message": "Too many requests. Try again in 60 seconds.",
  "reset_at": "2026-03-19T14:15:00Z"
}
```

**Agent Behavior:**
- Cache results: Don't re-query same data within 5 minutes
- Use conditional requests: Only fetch if needed
- If rate-limited: "Let me check our system. This might take a moment..."

---

## 5. CUSTOMER VERIFICATION FLOW

### Verification Process

**Step 1: Initial Identity Check**
```
Agent: "To help with your account, I need to verify some information.
Can you provide the email address registered to your HourTimesheet account?"

Customer: "sarah@company.com"

Agent: [Internally calls API to get account email]
[Compares customer-provided email to account email]

Result: Verified OR Not Verified
```

**Step 2: For Supervisors/Accountants**
```
If email does not match primary account admin:

Agent: "I see your email isn't the primary account administrator.
Are you a supervisor or accountant with access to account data?"

Customer: "I'm the supervisor."

Agent: [Checks if supervisor role exists in account]
[Determines what data supervisor can access]
```

**Step 3: Access Authorization**
```
Based on role verified:
- Account owner/admin: Full access to all endpoints
- Supervisor: Limited to timesheet and charge code info
- Accountant: Limited to integration and compliance data
- Employee: Only own timesheet and account status
```

**Step 4: Permission Check**
```
Agent: "I can help with [list of things based on role].
What would you like assistance with?"
```

### Verification Failure Flow

**Scenario: Customer Email Doesn't Match**
```
Agent: "I'm unable to find an account with that email.
Could you double-check the email you use to log in?"

[Retry verification]

If still not found:
Agent: "It appears you might not be an admin for this account.
Please contact the account administrator to help, or you can email
support@hourtimesheet.com for assistance."
```

**Scenario: Suspicious Activity**
```
If same account queried multiple times in short period:
[System flags as potential abuse]
[Log incident with timestamp]
[After 3 failed attempts in 15 min: Escalate to human]

Agent: "For security, I need to connect you with our support team.
One moment..."
```

---

## 6. ERROR HANDLING & FALLBACKS

### API Error Responses

**400 Bad Request**
- Cause: Invalid input, malformed request
- Agent response: "Let me try that again..."
- Fallback: Ask for clarification, retry

**401 Unauthorized**
- Cause: API credentials expired
- Agent response: "I'm having trouble accessing our system. Let me try again..."
- Fallback: Re-authenticate, retry

**403 Forbidden**
- Cause: Insufficient permissions for endpoint
- Agent response: "I'm unable to access that information."
- Fallback: Escalate to human support

**404 Not Found**
- Cause: Account or resource doesn't exist
- Agent response: "I'm unable to find that account."
- Fallback: Ask customer to verify account info

**429 Too Many Requests**
- Cause: Rate limit exceeded
- Agent response: "Let me check... this might take a moment."
- Fallback: Wait 60 seconds, retry

**500 Internal Server Error**
- Cause: HourTimesheet API issue
- Agent response: "We're experiencing a temporary issue. Please try again in a moment."
- Fallback: Escalate if persists

### Fallback Strategies

**If API Unavailable:**
1. Acknowledge: "Let me access your account information..."
2. Attempt: Call API endpoint
3. If fails: "Our system is experiencing a brief issue. Can I help with something else, or would you like to call our support team at 1-888-780-9961?"
4. Escalate: Offer phone number and email

**If Verification Fails:**
1. Attempt verification 1-2 times
2. If fails: "I'm unable to verify your account. For security, please contact our support team to verify. You can reach us at 1-888-780-9961 or email support@hourtimesheet.com."
3. Escalate to human

**If Data Inaccessible:**
1. Attempt to retrieve data
2. If unavailable: "I don't have access to that information at the moment."
3. Offer alternatives: "Can I help with something else?"
4. Escalate if needed

---

## 7. AUDIT LOGGING & COMPLIANCE

### What Gets Logged

**For Every API Call:**
```json
{
  "timestamp": "2026-03-19T14:15:22Z",
  "api_key_id": "key_abc123",
  "agent_id": "elevenlabs_agent_1",
  "endpoint": "GET /accounts/acct_123456",
  "account_id": "acct_123456",
  "customer_email": "sarah@company.com",
  "verification_status": "verified",
  "http_status": 200,
  "response_time_ms": 145,
  "fields_accessed": ["status", "subscription_status", "integrations"],
  "error": null
}
```

**Logged Fields:**
- Timestamp (UTC, precise to millisecond)
- API key used
- Agent identifier
- Endpoint and method
- Account accessed
- Customer verification status
- HTTP status code
- Response time
- Fields returned
- Any errors

**Retention:**
- Minimum 5 years for DCAA compliance
- Encrypted storage (AES-256)
- Immutable logs (append-only)
- Regular backups

### Access Control Audit

**What Triggers Investigation:**
- Unusual API call patterns
- Accessing multiple accounts in short time
- High rate of failed verifications
- Access to same account by multiple API keys
- Calls at unusual hours
- Failed authentication attempts

**Admin Dashboard:**
- View API call logs by date range
- Filter by account, endpoint, status
- Export logs for compliance audit
- Real-time alerts for suspicious activity

---

## 8. IMPLEMENTATION TIMELINE (PHASE 4)

### Phase 4: API Integration

**Week 1-2: Preparation**
- [ ] Develop API endpoints (HourTimesheet backend team)
- [ ] Create API documentation
- [ ] Set up test environment
- [ ] Generate test API credentials
- [ ] Create audit logging system

**Week 3: ElevenLabs Integration**
- [ ] Configure API endpoints in ElevenLabs agent
- [ ] Implement authentication (API key + token)
- [ ] Add error handling and fallbacks
- [ ] Implement customer verification flow
- [ ] Test each endpoint individually

**Week 4: Testing & Validation**
- [ ] Integration testing (all endpoints)
- [ ] Error scenario testing
- [ ] Load testing (concurrent requests)
- [ ] Security testing (invalid credentials, rate limiting)
- [ ] Compliance validation (audit logs)

**Week 5: Pilot & Monitoring**
- [ ] Pilot with 10% of calls
- [ ] Monitor API performance
- [ ] Collect agent feedback
- [ ] Verify accuracy of data returned
- [ ] Check audit logs for issues

**Week 6-8: Production Rollout**
- [ ] Gradual rollout to 100% of calls
- [ ] Monitor metrics and alerts
- [ ] Tune rate limits based on actual usage
- [ ] Optimize cache strategy
- [ ] Document learnings

---

## 9. INTEGRATION WITH VOICE AGENT

### Typical Call Flow with API

```
Customer calls 1-888-780-9961
    ↓
Agent: "Thank you for calling. What can I help with?"
    ↓
Customer: "I'm having trouble with my account."
    ↓
Agent: "I'd like to look up your account. What email did you register with?"
    ↓
Customer: "sarah@company.com"
    ↓
[Agent internally calls: GET /accounts/{id} to verify email]
    ↓
Agent: "Perfect, I found your account. I see you're currently on our
Professional plan with 22 active users. Your QuickBooks integration
synced successfully just 20 minutes ago.

What issue are you experiencing?"
    ↓
Customer: "One of my charge codes is showing as inactive."
    ↓
[Agent calls: GET /accounts/{id}/charge-codes]
    ↓
[Agent retrieves list, finds the code, explains the situation]
    ↓
Agent: "I found the issue. The code 'TASK-A' was deactivated on June 30
after that project phase completed. I'd recommend asking your supervisor
to assign you one of the active codes instead.

Is there anything else I can help with?"
```

### API Caching Strategy

**Cache Response Data:**
- Account status: 30 minutes
- Subscription info: 1 hour
- Charge code list: 2 hours
- Integration status: 30 minutes

**Cache Invalidation:**
- On-demand refresh if customer requests
- Automatic refresh on account changes
- Time-based expiration
- Clear cache on escalation to human

**Cache Implementation:**
- In-memory cache in ElevenLabs agent
- TTL-based auto-expiration
- Key: account_id + endpoint
- Value: API response + timestamp

---

## 10. MONITORING & METRICS

### Key Metrics to Track

| Metric | Target | Alert |
|--------|--------|-------|
| API response time | < 500ms | > 1000ms |
| Success rate | > 99.5% | < 99% |
| Verification success rate | > 98% | < 95% |
| Rate limit violations | 0 | Any occurrence |
| Cache hit rate | > 70% | < 50% |
| API uptime | > 99.9% | Any downtime |

### Dashboard

Monitor:
- API calls per day
- Average response time
- Error rate by endpoint
- Cache hit/miss rate
- Customer verification success rate
- Rate limit hits

### Alerting

**Critical Alerts (Page On-Call):**
- API unavailable (5+ minute outage)
- Success rate drops below 95%
- Audit logging failures

**Warnings (Email Alert):**
- Response time > 1 second
- Rate limit hits > 5 per hour
- Unusual API call pattern detected

---

## 11. DEPLOYMENT CHECKLIST

- [ ] API endpoints developed and tested
- [ ] API documentation complete
- [ ] API credentials generated and stored securely
- [ ] Authentication configured in ElevenLabs
- [ ] Error handling implemented
- [ ] Customer verification flow coded
- [ ] Audit logging system active
- [ ] Rate limiting configured
- [ ] Caching strategy implemented
- [ ] Integration testing complete
- [ ] Security testing complete
- [ ] Load testing complete
- [ ] Pilot phase monitoring plan ready
- [ ] Production rollout plan documented
- [ ] Support team trained
- [ ] Monitoring and alerting configured
- [ ] Runbook created for common issues
- [ ] Legal/compliance review complete

---

## 12. NOTES ON PHASE 4 VS. CODEBASE EXPLORATION (ISSUE #94)

**This Document (Issue #98):**
- Integration plan for how agent USES HTS API
- Endpoints needed, security model, verification flow
- Implementation timeline for Phase 4

**Issue #94 (Separate - Not Covered Here):**
- Exploration of HourTimesheet Java/Spring codebase
- Understanding existing architecture
- Identifying where to add API endpoints
- Implementation details of API development
- Database schema and entity relationships

**Timeline:**
- Issue #94: Happens during weeks 1-2 (exploration phase)
- Issue #98 (this doc): Guides development of new API for ElevenLabs use
- Both completed: Enables voice agent to access customer data safely

---

## 13. REFERENCES

- **Issue #98:** HourTimesheet API Integration Plan
- **Issue #94:** HourTimesheet Codebase Exploration (separate)
- **Related Issues:** #92 (Knowledge Base), #95 (Zendesk), #96 (Phone), #101 (Architecture)
- **API Security:** OWASP API Security Top 10
- **DCAA Compliance:** DAR 252.242-7004

