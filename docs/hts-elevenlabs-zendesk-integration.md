# HourTimesheet ElevenLabs to Zendesk Integration Specification

**Issue #95** | Last updated: 2026-03-19

Technical specification for integrating the HourTimesheet ElevenLabs voice/chat agent with Zendesk ticketing system (minute7.zendesk.com).

---

## 1. INTEGRATION OVERVIEW

### Purpose
Enable the HourTimesheet ElevenLabs support agent to:
- Automatically create support tickets from voice/chat conversations
- Look up existing customer tickets by email
- Update ticket status during conversations
- Add internal notes for agent context and observations
- Add public replies to communicate with customers
- Escalate complex issues with appropriate tags
- Maintain conversation history and context

### Zendesk Instance
- **URL:** minute7.zendesk.com
- **API Endpoint:** https://minute7.zendesk.com/api/v2
- **Authentication:** API Token (bearer token in Authorization header)
- **Rate Limit:** 200 requests per 1 minute (sliding window)

### Integration Architecture
```
ElevenLabs Agent
    ↓
HTTP/REST Webhooks
    ↓
Zendesk API v2
    ↓
minute7.zendesk.com
```

---

## 2. ZENDESK API TOOLS (WEBHOOK FUNCTIONS)

The ElevenLabs agent accesses Zendesk through HTTP webhook tools. Each tool represents an API operation.

### Tool 1: get_ticket

**Purpose:** Retrieve a single ticket by ID

**Configuration:**
```
Tool Name: zendesk_get_ticket
Type: HTTP Request
Method: GET
URL Template: https://minute7.zendesk.com/api/v2/tickets/{ticket_id}.json
Headers: Authorization: Bearer {API_TOKEN}
```

**Input Parameters:**
```json
{
  "ticket_id": {
    "type": "integer",
    "description": "Zendesk ticket ID (numeric)"
  }
}
```

**Success Response (200 OK):**
```json
{
  "ticket": {
    "id": 12345,
    "url": "https://minute7.zendesk.com/api/v2/tickets/12345.json",
    "external_id": null,
    "via": {
      "channel": "voice",
      "source": {
        "from": {},
        "to": {},
        "rel": null
      }
    },
    "created_at": "2026-03-19T14:30:00Z",
    "updated_at": "2026-03-19T15:45:00Z",
    "type": "problem",
    "subject": "Cannot sync to QuickBooks",
    "raw_subject": "Cannot sync to QuickBooks",
    "description": "Customer reports timesheet sync failing to QuickBooks Online for 3 days.",
    "priority": "high",
    "status": "open",
    "recipient": "customer@example.com",
    "requester": {
      "id": 99887766,
      "name": "John Customer",
      "email": "customer@example.com"
    },
    "submitter": {
      "id": 99887766,
      "name": "John Customer"
    },
    "assignee": {
      "id": 12345678,
      "name": "Sarah Support",
      "email": "sarah@hourtimesheet.com"
    },
    "organization_id": 123456,
    "group_id": 789012,
    "collaborators": [],
    "followers": [],
    "email_cc_ids": [],
    "forum_topic_id": null,
    "problem_id": null,
    "has_incidents": false,
    "is_public": true,
    "due_at": null,
    "custom_fields": [
      {
        "id": 360087654321,
        "value": "sync_issue"
      }
    ],
    "tags": ["ai-handled", "quickbooks", "integration"],
    "satisfaction": null,
    "sharing_agreement_ids": [],
    "fields": []
  }
}
```

**Error Response (404 Not Found):**
```json
{
  "error": "RecordNotFound",
  "description": "Ticket not found"
}
```

**Usage Example:**
When customer provides ticket number, agent calls:
```
zendesk_get_ticket(ticket_id=12345)
```

### Tool 2: search_tickets

**Purpose:** Search tickets by email, subject, status, or tags

**Configuration:**
```
Tool Name: zendesk_search_tickets
Type: HTTP Request
Method: GET
URL Template: https://minute7.zendesk.com/api/v2/search.json?query={query}
Headers: Authorization: Bearer {API_TOKEN}
```

**Input Parameters:**
```json
{
  "query": {
    "type": "string",
    "description": "Zendesk JQL query string",
    "examples": [
      "type:ticket status:open requester:customer@example.com",
      "type:ticket tags:quickbooks",
      "type:ticket subject:sync",
      "type:ticket created>2026-03-15"
    ]
  }
}
```

**Query Syntax Examples:**
```
# Find by email (most common)
type:ticket requester:customer@example.com

# Find by email AND status
type:ticket requester:customer@example.com status:open

# Find by tag
type:ticket tags:ai-escalated status:open

# Find by subject keyword
type:ticket subject:"QuickBooks sync"

# Find by multiple conditions
type:ticket status:open requester:customer@example.com tags:integration

# Find recent tickets
type:ticket created>=2026-03-19 requester:customer@example.com
```

**Success Response (200 OK):**
```json
{
  "results": [
    {
      "id": 12345,
      "url": "https://minute7.zendesk.com/api/v2/tickets/12345.json",
      "external_id": null,
      "subject": "Cannot sync to QuickBooks",
      "description": "Timesheet sync failing...",
      "status": "open",
      "priority": "high",
      "created_at": "2026-03-19T14:30:00Z",
      "updated_at": "2026-03-19T15:45:00Z",
      "requester": {
        "name": "John Customer",
        "email": "customer@example.com"
      },
      "tags": ["ai-handled", "quickbooks"]
    },
    {
      "id": 12344,
      "subject": "ADP payroll not updating",
      "status": "solved",
      "priority": "normal",
      "created_at": "2026-03-15T10:00:00Z",
      "requester": {
        "name": "John Customer",
        "email": "customer@example.com"
      },
      "tags": ["ai-handled", "adp"]
    }
  ],
  "count": 2,
  "next_page": null
}
```

**Usage Examples:**
```
# Look up customer by email
zendesk_search_tickets(query="type:ticket requester:customer@example.com status:open")

# Find unresolved tickets
zendesk_search_tickets(query="type:ticket requester:customer@example.com status:open OR status:pending")

# Search by tag
zendesk_search_tickets(query="type:ticket tags:sync_issue status:open")
```

### Tool 3: create_ticket

**Purpose:** Create a new support ticket (auto-creation from voice/chat)

**Configuration:**
```
Tool Name: zendesk_create_ticket
Type: HTTP Request
Method: POST
URL: https://minute7.zendesk.com/api/v2/tickets.json
Headers:
  Authorization: Bearer {API_TOKEN}
  Content-Type: application/json
```

**Input Parameters:**
```json
{
  "ticket": {
    "type": "object",
    "properties": {
      "subject": {
        "type": "string",
        "description": "Ticket subject line (required)",
        "example": "Cannot access mobile app after login"
      },
      "description": {
        "type": "string",
        "description": "Detailed ticket description (required)",
        "example": "Customer reports being unable to log into mobile app after resetting password..."
      },
      "requester": {
        "type": "object",
        "description": "Customer/requester info (required)",
        "properties": {
          "email": {
            "type": "string",
            "description": "Customer email address"
          },
          "name": {
            "type": "string",
            "description": "Customer name"
          }
        },
        "required": ["email"]
      },
      "priority": {
        "type": "string",
        "enum": ["low", "normal", "high", "urgent"],
        "description": "Ticket priority (optional, default: normal)",
        "example": "high"
      },
      "status": {
        "type": "string",
        "enum": ["new", "open", "pending", "hold", "solved", "closed"],
        "description": "Ticket status (optional, default: new)",
        "example": "open"
      },
      "type": {
        "type": "string",
        "enum": ["problem", "incident", "question", "task"],
        "description": "Ticket type (optional, default: problem)",
        "example": "problem"
      },
      "tags": {
        "type": "array",
        "items": {
          "type": "string"
        },
        "description": "Tags for categorization",
        "example": ["ai-handled", "mobile-app", "login"]
      },
      "custom_fields": {
        "type": "array",
        "items": {
          "type": "object",
          "properties": {
            "id": {
              "type": "integer",
              "description": "Custom field ID from Zendesk"
            },
            "value": {
              "type": "string"
            }
          }
        },
        "description": "Custom field values (optional)"
      },
      "group_id": {
        "type": "integer",
        "description": "Zendesk group ID for routing (optional)",
        "example": 789012
      }
    },
    "required": ["subject", "description", "requester"]
  }
}
```

**Request Body Example:**
```json
{
  "ticket": {
    "subject": "Mobile app sync not working",
    "description": "Customer Sarah Johnson reports that mobile app hasn't synced changes for 2 hours. Last successful sync was at 2:00 PM EST. Device is iPhone 13, app version 3.2.1. Network is working (tried WiFi and cellular).",
    "requester": {
      "email": "sarah@customercompany.com",
      "name": "Sarah Johnson"
    },
    "priority": "high",
    "status": "open",
    "type": "problem",
    "tags": [
      "ai-handled",
      "mobile-app",
      "sync-issue"
    ],
    "group_id": 789012
  }
}
```

**Success Response (201 Created):**
```json
{
  "ticket": {
    "id": 12346,
    "url": "https://minute7.zendesk.com/api/v2/tickets/12346.json",
    "external_id": null,
    "via": {
      "channel": "voice",
      "source": {
        "from": {},
        "to": {},
        "rel": null
      }
    },
    "created_at": "2026-03-19T16:00:00Z",
    "updated_at": "2026-03-19T16:00:00Z",
    "type": "problem",
    "subject": "Mobile app sync not working",
    "raw_subject": "Mobile app sync not working",
    "description": "Customer Sarah Johnson reports...",
    "priority": "high",
    "status": "open",
    "recipient": "sarah@customercompany.com",
    "requester": {
      "id": 99887767,
      "name": "Sarah Johnson",
      "email": "sarah@customercompany.com"
    },
    "submitter": {
      "id": 99887767,
      "name": "Sarah Johnson"
    },
    "assignee": null,
    "organization_id": null,
    "group_id": 789012,
    "collaborators": [],
    "followers": [],
    "email_cc_ids": [],
    "forum_topic_id": null,
    "problem_id": null,
    "has_incidents": false,
    "is_public": true,
    "due_at": null,
    "custom_fields": [],
    "tags": ["ai-handled", "mobile-app", "sync-issue"],
    "satisfaction": null
  }
}
```

**Error Response (422 Unprocessable Entity):**
```json
{
  "error": "InvalidRequest",
  "description": "Invalid field value",
  "details": {
    "requester": ["Email address is required"]
  }
}
```

**Usage Example:**
```
zendesk_create_ticket(ticket={
  "subject": "Cannot approve timesheet",
  "description": "Supervisor unable to approve pending timesheets. Gets error: 'Approval workflow locked'. Team has 15 pending timesheets.",
  "requester": {
    "email": "supervisor@company.com",
    "name": "Michael Torres"
  },
  "priority": "high",
  "status": "open",
  "type": "problem",
  "tags": ["ai-handled", "approval-workflow"]
})
```

### Tool 4: update_ticket

**Purpose:** Update ticket status, priority, tags, or custom fields

**Configuration:**
```
Tool Name: zendesk_update_ticket
Type: HTTP Request
Method: PUT
URL Template: https://minute7.zendesk.com/api/v2/tickets/{ticket_id}.json
Headers:
  Authorization: Bearer {API_TOKEN}
  Content-Type: application/json
```

**Input Parameters:**
```json
{
  "ticket_id": {
    "type": "integer",
    "description": "Ticket ID to update (required)"
  },
  "ticket": {
    "type": "object",
    "description": "Fields to update",
    "properties": {
      "status": {
        "type": "string",
        "enum": ["new", "open", "pending", "hold", "solved", "closed"],
        "description": "New ticket status"
      },
      "priority": {
        "type": "string",
        "enum": ["low", "normal", "high", "urgent"],
        "description": "New priority"
      },
      "tags": {
        "type": "array",
        "items": {
          "type": "string"
        },
        "description": "Tags to set (replaces existing tags)"
      },
      "assignee_id": {
        "type": "integer",
        "description": "Zendesk user ID to assign ticket to"
      },
      "group_id": {
        "type": "integer",
        "description": "Zendesk group ID to reassign ticket"
      },
      "custom_fields": {
        "type": "array",
        "description": "Custom field updates"
      }
    }
  }
}
```

**Request Body Example - Status Update:**
```json
{
  "ticket": {
    "status": "pending",
    "tags": ["ai-handled", "quickbooks", "awaiting-customer"]
  }
}
```

**Request Body Example - Priority Update:**
```json
{
  "ticket": {
    "priority": "urgent",
    "tags": ["ai-escalated", "integration", "critical"]
  }
}
```

**Success Response (200 OK):**
```json
{
  "ticket": {
    "id": 12345,
    "status": "pending",
    "priority": "urgent",
    "tags": ["ai-escalated", "integration", "critical"],
    "updated_at": "2026-03-19T16:15:00Z"
  }
}
```

**Usage Examples:**
```
# Mark as pending
zendesk_update_ticket(
  ticket_id=12345,
  ticket={"status": "pending", "tags": ["ai-handled", "awaiting-customer"]}
)

# Escalate to human
zendesk_update_ticket(
  ticket_id=12345,
  ticket={"priority": "urgent", "tags": ["ai-escalated", "needs-human"]}
)

# Add escalation tag
zendesk_update_ticket(
  ticket_id=12345,
  ticket={"tags": ["ai-escalated", "complex-issue"]}
)
```

### Tool 5: add_internal_note

**Purpose:** Add internal note visible only to support team (AI observations, troubleshooting steps)

**Configuration:**
```
Tool Name: zendesk_add_internal_note
Type: HTTP Request
Method: POST
URL Template: https://minute7.zendesk.com/api/v2/tickets/{ticket_id}/comments.json
Headers:
  Authorization: Bearer {API_TOKEN}
  Content-Type: application/json
```

**Input Parameters:**
```json
{
  "ticket_id": {
    "type": "integer",
    "description": "Ticket ID (required)"
  },
  "comment": {
    "type": "object",
    "properties": {
      "body": {
        "type": "string",
        "description": "Comment text (required)"
      },
      "public": {
        "type": "boolean",
        "description": "false = internal only, true = visible to customer (default: false)",
        "enum": [false]
      },
      "author_id": {
        "type": "integer",
        "description": "Optional: Zendesk user ID (defaults to API token user)"
      }
    },
    "required": ["body"]
  }
}
```

**Request Body Example:**
```json
{
  "comment": {
    "body": "AI troubleshooting summary:\n- Confirmed mobile app sync failing for 2+ hours\n- Device: iPhone 13, app v3.2.1\n- Network confirmed working (WiFi + cellular tested)\n- Last successful sync: 2:00 PM EST\n- Checked QuickBooks integration status: Connected\n- Likely mobile app cache issue or backend sync queue backlog\n- Recommended next step: Force clear app cache or wait for backend processing\n- If persists after 30 min: escalate to mobile engineering",
    "public": false
  }
}
```

**Success Response (201 Created):**
```json
{
  "comment": {
    "id": 123456789,
    "type": "Comment",
    "body": "AI troubleshooting summary:\n- Confirmed mobile app sync failing...",
    "html_body": "<p>AI troubleshooting summary:</p>...",
    "plain_body": "AI troubleshooting summary...",
    "public": false,
    "author_id": 12345678,
    "created_at": "2026-03-19T16:10:00Z",
    "updated_at": "2026-03-19T16:10:00Z",
    "attachments": [],
    "audit_id": 987654321
  }
}
```

**Usage Example:**
```
zendesk_add_internal_note(
  ticket_id=12345,
  comment={
    "body": "Tried troubleshooting steps:\n1. Customer verified internet working\n2. Mobile app version confirmed current (3.2.1)\n3. Suggested force clear cache\n4. Provided escalation path if issue persists\n5. Noted: Similar issue reported 2 days ago but resolved via backend sync\n\nAI verdict: High probability cache/sync issue. Escalate to mobile eng if not resolved in 30 min.",
    "public": false
  }
)
```

### Tool 6: add_public_reply

**Purpose:** Add public reply visible to customer (solution, next steps, follow-up)

**Configuration:**
```
Tool Name: zendesk_add_public_reply
Type: HTTP Request
Method: POST
URL Template: https://minute7.zendesk.com/api/v2/tickets/{ticket_id}/comments.json
Headers:
  Authorization: Bearer {API_TOKEN}
  Content-Type: application/json
```

**Input Parameters:**
```json
{
  "ticket_id": {
    "type": "integer",
    "description": "Ticket ID (required)"
  },
  "comment": {
    "type": "object",
    "properties": {
      "body": {
        "type": "string",
        "description": "Reply text (required)"
      },
      "public": {
        "type": "boolean",
        "description": "true = visible to customer",
        "enum": [true]
      }
    },
    "required": ["body"]
  }
}
```

**Request Body Example:**
```json
{
  "comment": {
    "body": "Hi Sarah,\n\nThank you for contacting HourTimesheet support. I've reviewed your mobile app sync issue.\n\nHere are the troubleshooting steps I recommend:\n\n1. **Force Clear Cache**: On iPhone, go to Settings > HourTimesheet > Offload App, then reinstall from App Store\n\n2. **Check Internet**: Verify connection on both WiFi and cellular\n\n3. **Verify App Version**: Ensure you're running version 3.2.1 or later (Settings > About)\n\nMost sync issues are resolved by clearing the app cache. Please try these steps and let me know if the sync starts working.\n\nIf the issue persists after 30 minutes, I'll escalate to our mobile engineering team for further investigation.\n\nBest regards,\nHourTimesheet AI Support",
    "public": true
  }
}
```

**Success Response (201 Created):**
```json
{
  "comment": {
    "id": 123456790,
    "type": "Comment",
    "body": "Hi Sarah,\n\nThank you for contacting...",
    "html_body": "<p>Hi Sarah,</p>\n<p>Thank you for contacting...</p>",
    "public": true,
    "author_id": 12345678,
    "created_at": "2026-03-19T16:12:00Z"
  }
}
```

**Usage Example:**
```
zendesk_add_public_reply(
  ticket_id=12345,
  comment={
    "body": "Hi John,\n\nThank you for your detailed explanation. I've identified the issue:\n\nYour charge codes appear to be showing as 'inactive' in the system. This typically happens when:\n\n1. A charge code is archived after project completion\n2. Your supervisor restricted access to certain codes\n3. A code's validity period has expired\n\nPlease check with your supervisor, Sarah Martinez, to:\n- Verify the charge codes are active\n- Confirm you have access to the codes you need\n- Request activation if codes were recently archived\n\nIf you provide me with the specific charge code name, I can also help verify its status.\n\nLet me know how I can help further!\n\nBest regards,\nHourTimesheet Support",
    "public": true
  }
)
```

---

## 3. AUTHENTICATION & SECURITY

### API Token Setup

**Obtaining API Token:**
1. Log into minute7.zendesk.com as Admin
2. Navigate to Admin > Apps and integrations > Integrations
3. Click Zendesk API
4. Go to Settings tab
5. Enable "Token access"
6. Click "+" to add new token
7. Name: "HourTimesheet AI Agent"
8. Copy token (save securely)

**Token Storage in ElevenLabs:**
1. In ElevenLabs console
2. Navigate to Agent > Settings > Secrets
3. Create new secret:
   - Name: `ZENDESK_API_TOKEN`
   - Value: [paste token from step 8 above]
   - Scope: This agent only

**Token Format:**
```
Authorization: Bearer {ZENDESK_API_TOKEN}
```

### Rate Limiting Handling

Zendesk API allows 200 requests per minute (sliding window).

**Agent Implementation:**
- Cache frequently accessed data (ticket lookup, customer info)
- Use pagination for list requests (limit results to 25 per page)
- Implement exponential backoff for 429 (rate limit) responses
- Monitor X-Rate-Limit headers in responses

**Rate Limit Headers:**
```
X-Rate-Limit: 200
X-Rate-Limit-Remaining: 187
X-Rate-Limit-Reset: 1679234567
```

### Security Best Practices

1. **Token Rotation:** Rotate API tokens every 90 days
2. **Audit Logging:** All API calls logged in Zendesk audit trail
3. **Minimal Permissions:** API token has agent permissions only
4. **HTTPS Only:** All API calls over HTTPS (never HTTP)
5. **No Sensitive Data:** Don't include passwords/credit cards in comments
6. **IP Whitelisting:** Consider whitelisting ElevenLabs IP ranges (if available)

---

## 4. TICKET AUTO-CREATION WORKFLOW

### Trigger Conditions

Auto-create a Zendesk ticket when:
1. **Unresolved Issue:** AI cannot resolve customer problem after troubleshooting
2. **Escalation Requested:** Customer explicitly asks to speak with human
3. **Complex Problem:** Issue requires product team/engineering investigation
4. **Account Issues:** Login, billing, access control problems
5. **Bug Report:** Customer reports suspected product bug or unexpected behavior

### Ticket Creation Flow

```
Customer Voice/Chat
    ↓
AI Troubleshooting Attempt
    ↓
[Issue Resolved?]
├─ Yes → Document solution
│         Send public reply
│         Mark as solved
│
└─ No → Create ticket
        ├─ Extract: subject, description, priority
        ├─ Call: zendesk_create_ticket()
        ├─ Receive: ticket_id
        ├─ Add internal note: AI troubleshooting summary
        ├─ Send public reply: escalation notice
        └─ End conversation
```

### Subject Line Guidelines

Good subject lines are:
- Specific (not "Help needed")
- Single issue (not comma-separated problems)
- Actionable (reflects the problem, not the feeling)
- EXAMPLE: "Cannot sync to QuickBooks Online"
- BAD: "Help", "System broken", "Urgent issue"

### Description Template

Include in ticket description:
```
**Customer Information:**
- Name: [from voice auth or chat]
- Email: [from voice auth or chat]
- Organization: [if available]

**Problem Summary:**
[2-3 sentence description of the issue]

**Steps Attempted:**
1. [troubleshooting step 1]
2. [troubleshooting step 2]
3. [troubleshooting step 3]

**Environment:**
- Device/Browser: [if applicable]
- App Version: [if applicable]
- OS: [if applicable]

**Current Status:**
[What exactly is happening right now]

**AI Assessment:**
[Why this needs human attention]
```

### Priority Assignment Rules

| Condition | Priority |
|-----------|----------|
| System down, 5+ users affected | urgent |
| Cannot access any features | high |
| Payroll integration failing | high |
| Mobile app completely broken | high |
| Workaround available, not critical | normal |
| Minor UI issue, feature still works | low |

### Tag Assignment

**Always include:**
- `ai-handled` - indicates AI already attempted resolution
- Feature tag: `mobile-app`, `login`, `integration`, `approval-workflow`, etc.
- Category tag: `sync-issue`, `authentication`, `payment`, `billing`, etc.

**Conditionally include:**
- `ai-escalated` - if escalated due to complexity
- `urgent` - if high priority
- `bug-report` - if customer suspects product defect
- `awaiting-customer` - if waiting for additional info

---

## 5. TICKET LOOKUP & CUSTOMER CONTEXT

### Lookup by Email

When customer provides email during voice call:
```
Call: zendesk_search_tickets(
  query="type:ticket requester:customer@example.com status:open OR status:pending"
)
```

**Response Processing:**
- If 0 results: First contact with this customer
- If 1-2 results: Review recent tickets for context
- If 3+ results: Ask customer which issue they're calling about

### Context Use Cases

**Use Case 1: Repeat Issue**
```
Search: same customer
Found: 3 open tickets, all "QuickBooks sync"
Action: Check if same underlying cause or different manifestation
        Share solution from earlier attempts
        Consolidate into single ticket if same issue
```

**Use Case 2: Resolved Issue Recurring**
```
Search: customer name + keyword
Found: Solved ticket from 2 weeks ago with similar problem
Action: Review the solution from that ticket
        Check if customer followed the steps correctly
        Determine if regression or user error
```

**Use Case 3: Known Issues**
```
Search: by tag + status
Found: 5 other open tickets with "sync-issue" tag this week
Action: Indicates possible platform issue
        Escalate with higher priority
        Add note: "Part of broader sync issue affecting 5+ customers"
```

---

## 6. ESCALATION ROUTING

### AI-Handled Tickets (Resolved by Agent)

**Characteristics:**
- Problem successfully diagnosed and fixed
- Customer confirmed solution works
- No further action needed
- Ticket marked as "solved"

**Workflow:**
1. Add internal note: summary of troubleshooting and resolution
2. Add public reply: confirmation and next steps
3. Update ticket: status="solved", tags=["ai-handled", ...]
4. No escalation needed

### AI-Escalated Tickets (Needs Human Review)

**Characteristics:**
- Cannot resolve through troubleshooting
- Requires product team investigation
- Possible product bug or edge case
- Customer demands human contact

**Workflow:**
1. Create ticket (or update existing)
2. Add internal note: detailed troubleshooting summary and why escalation needed
3. Add public reply: explain escalation, set expectations
4. Update ticket: status="pending", priority="high", tags=["ai-escalated", ...]
5. Assign to engineering or support team

### Assignment Rules

**Default Assignment:**
- Route to support group: "Technical Support"
- Let Zendesk round-robin assign

**Smart Assignment:**
- `integration` issue → "Integration Team"
- `mobile-app` issue → "Mobile Engineering"
- `login` issue → "Security Team"
- `billing` issue → "Billing Department"

---

## 7. STATUS & NOTE WORKFLOW

### Status Transitions

```
new
 ↓
open (AI actively investigating)
 ↓
[resolved?]
├─ Yes → solved (mark as such)
│
└─ No → pending (awaiting customer info or escalation)
         ↓
         hold (waiting for team response)
         ↓
         open (resume investigation)
```

### Timing for Status Updates

| Event | Action | Status |
|-------|--------|--------|
| New ticket created | None (defaults to new) | new |
| AI starts investigating | Update to open | open |
| Waiting for customer info | Update | pending |
| Escalated to team | Update | pending → hold |
| Solution provided | Update + note | solved |
| Reopened by customer | Update | open |

### Internal Note Format

Always include:
```
**AI Investigation Summary**
[bullet points of what was checked]

**Troubleshooting Steps Taken**
[numbered list]

**Findings**
[what was discovered]

**Conclusion**
[resolved/escalation reason]

**Next Steps**
[what human should do]
```

---

## 8. ERROR HANDLING & FALLBACK

### API Errors

**401 Unauthorized:**
- Cause: API token expired or invalid
- Action: Validate token in ElevenLabs secrets
- Fallback: Cannot create ticket, offer phone number
- Response: "I'm having trouble accessing our support system. Please call 1-888-780-9961 directly."

**403 Forbidden:**
- Cause: Token doesn't have required permission
- Action: Check token permissions in Zendesk admin
- Fallback: Cannot create ticket, offer email
- Response: "Let me connect you with our support team..."

**404 Not Found:**
- Cause: Ticket ID doesn't exist (customer gave wrong number)
- Action: Confirm with customer, search by email instead
- Fallback: Ask for email address to search
- Response: "I couldn't find that ticket. Can you provide the email you used to contact us?"

**429 Rate Limited:**
- Cause: Too many API requests in 1 minute
- Action: Implement exponential backoff, wait before retry
- Fallback: Handle gracefully, don't hammer API
- Response: "Give me a moment to look that up..." (wait 2 seconds, retry)

**500 Internal Server Error:**
- Cause: Zendesk API temporary issue
- Action: Retry after 5 seconds, max 2 retries
- Fallback: Offer phone number
- Response: "Our system is temporarily busy. Please try again in a moment, or call support."

### Fallback Behaviors

**If Ticket Lookup Fails:**
```
Try to search by email
  ↓
If search fails → Can't access Zendesk
  ↓
Fallback: "I'm unable to check our support system. Please call 1-888-780-9961"
```

**If Ticket Creation Fails:**
```
Try to create ticket
  ↓
If creation fails → Can't create in Zendesk
  ↓
Fallback: Collect issue details manually
        Offer phone/email as backup
        "I'm having trouble creating a ticket. Please call us at 1-888-780-9961"
```

**If Update Fails:**
```
Try to update ticket status/tags
  ↓
If update fails → Continue anyway, note internally
  ↓
Fallback: Add internal note with attempted action
        Ticket still in system, can be completed manually
```

---

## 9. INTEGRATION TESTING PLAN

### Test Scenario 1: Create Ticket

**Setup:**
- Test customer email: test.customer@example.com
- ElevenLabs agent in test mode
- Zendesk test environment preferred

**Steps:**
1. Trigger ticket creation via agent
2. Verify ticket appears in minute7.zendesk.com
3. Verify requester email is test.customer@example.com
4. Verify subject/description populated
5. Verify tags applied correctly
6. Verify priority set appropriately

**Expected Result:**
- Ticket created within 2 seconds
- All fields populated correctly
- Tags applied (ai-handled, feature, category)

### Test Scenario 2: Search Tickets

**Setup:**
- Create 3 test tickets under test.customer@example.com
- One open, one pending, one solved

**Steps:**
1. Call search_tickets with customer email
2. Verify returns all 3 tickets
3. Call search_tickets with status:open filter
4. Verify returns only 1 ticket
5. Call search_tickets with tag filter
6. Verify returns correct subset

**Expected Result:**
- Search returns 2-3 seconds response time
- Filters work correctly
- Results include all needed fields

### Test Scenario 3: Update Ticket

**Setup:**
- Create test ticket
- Note the ticket ID

**Steps:**
1. Update status from open to pending
2. Verify status change in Zendesk UI
3. Add tags
4. Verify tags appear in Zendesk
5. Update priority
6. Verify priority change

**Expected Result:**
- All updates applied within 2 seconds
- Changes visible in Zendesk UI immediately
- No errors in response

### Test Scenario 4: Add Notes

**Setup:**
- Create test ticket
- Note the ticket ID

**Steps:**
1. Add internal note
2. Verify appears only in Zendesk admin view (not visible to customer)
3. Add public reply
4. Verify appears in ticket timeline
5. Verify customer can see public reply

**Expected Result:**
- Internal notes marked as private
- Public replies visible to customer
- Formatting preserved
- Notes appear within 2 seconds

### Test Scenario 5: Full Voice Flow

**Setup:**
- Call ElevenLabs agent number with test phone
- Be prepared to describe a support issue

**Steps:**
1. Navigate voice menu
2. Describe an issue (e.g., "I can't sync to QuickBooks")
3. Agent attempts troubleshooting
4. Request escalation ("I want to talk to a human")
5. Verify ticket created in Zendesk
6. Check ticket contains conversation summary
7. Verify notification to support team

**Expected Result:**
- Agent creates ticket during call
- Ticket contains issue summary
- Status set to pending
- Priority appropriate
- Tags applied
- Team notified within 2 minutes

---

## 10. DEPLOYMENT CHECKLIST

- [ ] Zendesk API token generated and stored in ElevenLabs secrets
- [ ] Webhook URL endpoints configured in ElevenLabs agent
- [ ] All 6 tools tested individually
- [ ] Integration testing completed (all 5 scenarios)
- [ ] Error handling tested (all error codes)
- [ ] Rate limiting verified
- [ ] Ticket auto-creation tested end-to-end
- [ ] Internal notes format validated
- [ ] Public reply templates reviewed
- [ ] Escalation routing tested
- [ ] Support team trained on new ticket source
- [ ] Monitoring and alerting configured
- [ ] Runbook created for common issues
- [ ] Rollback plan documented

---

## 11. MAINTENANCE & MONITORING

### Monitoring Metrics

- API response time (should be <2 seconds)
- Webhook success rate (target: 99%)
- Failed ticket creation attempts
- Rate limit hits (target: 0 in production)
- Average time from voice call to Zendesk ticket

### Alerting Thresholds

| Metric | Threshold | Action |
|--------|-----------|--------|
| API response time | > 5 seconds | Alert on-call engineer |
| Success rate | < 95% | Review logs, check API status |
| Rate limit hits | Any | Check for API call loops |
| Failed creations | > 5 in 1 hour | Page on-call, check error logs |

### Regular Maintenance

- **Weekly:** Monitor error logs, check metrics
- **Monthly:** Review ticket routing accuracy, check SLA compliance
- **Quarterly:** Audit API permissions, rotate token
- **Annually:** Refresh integration documentation

---

## 12. CONFIGURATION SUMMARY

### Zendesk Configuration
- Instance: minute7.zendesk.com
- API Version: v2
- Auth Method: Bearer token
- Rate Limit: 200 req/min
- Timeout: 30 seconds

### ElevenLabs Configuration
- Tool Count: 6 webhooks
- Token Storage: Agent secrets
- Fallback Strategy: Provide phone/email
- Testing: Use sandbox if available

### Support Handoff
- Default group: "Technical Support"
- Smart routing: By feature tag
- Escalation tag: "ai-escalated"
- SLA: 1 hour first response (suggested)

---

## 13. REFERENCES

- **Zendesk API Docs:** https://developer.zendesk.com/api-reference/rest_api/
- **ElevenLabs Webhook Docs:** [ElevenLabs documentation]
- **Issue #95:** ElevenLabs-Zendesk Integration Specification
- **Related Issues:** #92 (Knowledge Base), #96 (Phone), #98 (API Plan)

