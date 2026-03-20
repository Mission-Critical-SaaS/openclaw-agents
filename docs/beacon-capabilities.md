# Beacon Capabilities Reference

**Version**: 1.0
**Last Updated**: 2026-03-19
**Agent**: Beacon 💡 — HourTimesheet Internal Support Agent
**Status**: Active
**Slack Bot ID**: U0AMPKFH5D4
**App ID**: A0AMPHEPRPG

---

## 1. Overview

**Beacon** is LMNTL's internal support specialist for HourTimesheet (HTS), a DCAA-compliant timekeeping software designed for government contractors. Beacon operates exclusively within the internal OpenClaw multi-agent system, providing HourTimesheet product expertise, support ticket management, and cross-agent coordination.

Beacon is **NOT customer-facing**. The agent supports internal teams—support representatives, account managers, and engineers—who help HourTimesheet customers. All interactions are internal to LMNTL's Slack workspace (#leads, #dev, #agent-ops).

### Role in the OpenClaw System

The OpenClaw gateway runs six specialized agents:
- **Scout** — General customer support (Minute7 and platform)
- **Trak** — Project management and sprint tracking
- **Kit** — Engineering and code review
- **Beacon** — HourTimesheet product expertise (internal support)
- **Scribe** — Documentation and knowledge management
- **Probe** — QA, testing, and bug reproduction
- **Chief** — Financial analysis and operational efficiency

Beacon fills a **vertical specialist** role: deep HourTimesheet knowledge for internal support operations. The agent coordinates with other agents via structured handoff protocols when tasks span multiple domains (e.g., bug escalation to Kit, feature requests to Trak).

---

## 2. Current Capabilities (What Beacon CAN Do)

### 2.1 Slack-Based Internal Support

**Channels**: #leads (C089JBLCFLL), #dev (C086N5031LZ), #agent-ops (C0AMHF5J9Q9)

Beacon monitors these channels and responds when:
- Directly mentioned: `@Beacon what's wrong with HourTimesheet's DCAA audit log?`
- Questions are about HourTimesheet features, integrations, pricing, or compliance

**Response discipline**:
- Gather data silently (no "checking now..." messages)
- Post a single, polished response in a thread
- Use Slack formatting (bold, bullets, emoji) for clarity
- Never spam the channel with half-baked updates

### 2.2 Zendesk Ticket Management

**Site**: minute7.zendesk.com (shared instance with Minute7)

**Read operations**:
- Search for HourTimesheet tickets by keyword, status, or priority
- Retrieve full ticket details, comments, and history
- View customer information and support history
- Cross-reference related tickets

**Write operations**:
- Create new HTS support tickets
- Add **internal notes** (not visible to customers)
- Update ticket status, priority, and assignment
- Tag tickets for categorization

**Explicitly cannot do**:
- Send public replies to customers (requires escalation to human support)
- Delete or merge tickets (admin-only)
- Access billing or payment information
- Modify ticket custom fields without authorization

**Attribution**: Every Zendesk action includes the requesting user's Slack ID and name for audit purposes.

### 2.3 Jira Issue Management

**Primary project**: HK (Hour Timesheet)
**Secondary projects**: MCSP (Customer Support), LMNTL (Platform)

**Capabilities**:
- Search and retrieve HTS issues with JQL queries
- Read issue details: description, status, assignee, priority, comments
- Create new issues with full context (summary, description, issue type)
- Add comments to track progress and decisions
- Update issue fields: status, priority, assignee, labels
- Link issues to track dependencies

**Use cases**:
- Escalate recurring customer issues to engineering (Kit)
- Create feature request issues based on customer feedback
- Organize support patterns into traceable tasks
- Coordinate with project management (Trak) on HTS roadmap

**Attribution**: Every Jira comment includes the requesting user's identity per security policy.

### 2.4 Cross-Agent Handoffs

Beacon can initiate structured handoffs to other agents when work spans domains:

| **Handoff ID** | **Target Agent** | **Trigger** | **Payload** |
|---|---|---|---|
| `beacon-to-scribe-resolution-pattern` | Scribe | Beacon resolves a recurring HTS issue | Issue description, resolution steps, frequency data → Scribe creates/updates FAQ |
| `beacon-to-kit-bug-report` | Kit | Multiple customers report same HTS bug | Bug description, affected count, reproduction steps → Kit investigates and creates GitHub issue |
| `beacon-to-trak-feature-request` | Trak | Repeated HTS feature requests from customers | Feature description, customer count, impact estimate → Trak creates Jira task |
| `beacon-to-chief-support-costs` | Chief | Surge in HTS support ticket volume/costs | Ticket trends, resolution times, cost breakdown → Chief correlates with financial data |
| `scout-to-beacon-hts-escalation` | Beacon | Scout receives HTS-specific question | Ticket link, issue description, customer context → Beacon provides HTS expertise |
| `chief-to-beacon-customer-cost` | Beacon | Chief identifies high-cost HTS patterns | Cost breakdown, support volume, segment → Beacon reviews patterns and suggests improvements |

**Delivery**: Handoffs post to #dev (C086N5031LZ) or #agent-ops (C0AMHF5J9Q9) with @mention of target agent. All handoffs are HMAC-SHA256 signed per protocol.

### 2.5 HourTimesheet Product Knowledge

Beacon has embedded expertise on:

#### **Product Overview**
- DCAA-compliant timekeeping software for government contractors
- Pricing: $8/user/month (all features included, no hidden fees)
- Target: 500+ government contractors (DoD, fixed-price, cost-reimbursement, T&M, IDIQ contracts)
- Support: Phone (888) 780-9961, email support@hourtimesheet.com

#### **Core Features**
- Time entry (clock-in/out, multi-job tracking, leave, notes)
- Mobile app (iOS/Android, GPS, offline-capable)
- Job costing (charge codes, bill/pay rates, profitability, direct vs. indirect)
- Overtime (configurable rules, state-specific regulations)
- Leave management (custom types, accrual, balances, approval workflows)
- Approval workflows (multi-tiered supervisor approval, electronic signatures)
- Payroll integrations (QuickBooks Online/Desktop, ADP Run/TotalSource/Workforce Now, Paychex, Insperity, Gusto)

#### **DCAA Compliance**
- Daily time recording (entries as work performed, no backdating)
- Electronic dual signatures (employee + supervisor, timestamped)
- Complete audit trail (every change logged: timestamp, user ID, reason)
- Charge codes (direct vs. indirect labor separation per contract)
- Role-based access control (Employee, Supervisor, Accountant, Admin)
- SOC 2 compliant data storage with automatic backups and disaster recovery
- Comprehensive reporting (labor distribution, audit trail exports)

#### **Integration Details**
- **QuickBooks Online**: One-click bi-directional sync (employees, job codes, service items, payroll)
- **QuickBooks Desktop**: Web Connector integration
- **ADP**: Run, TotalSource, Workforce Now — automatic data meshing with hour/overtime sync
- **Paychex/Insperity/Gusto**: Timesheet export and payroll sync

#### **Common Support Topics**
1. Setup & Configuration (account setup, users, job codes, leave policies, overtime rules, integrations)
2. Employee issues (time entry, clock-in/out, mobile app, leave requests, signatures)
3. Supervisor issues (approval workflows, editing, team reports, notifications)
4. Accounting/Finance (QuickBooks sync, ADP sync, job costing, labor distribution, billable vs. non-billable)
5. Compliance (DCAA audit prep, audit trails, charge code management, data retention)
6. Integrations (sync troubleshooting, data mapping, chart of accounts, payroll item config)

### 2.6 Notion Knowledge Base Access

**Access level**: Read-only

- Search Notion for HourTimesheet documentation and knowledge articles
- Retrieve page content to inform answers and escalations
- Reference shared knowledge base when explaining features

### 2.7 GitHub Issue Search

**Access level**: Limited (read-only, issues only)

- Search GitHub for known HTS bugs to see if a customer-reported issue is already tracked
- Cross-reference bug reports across hourtimesheet (product repo) and LMNTL-AI (platform) orgs
- Provide links to existing issues when relevant

**Cannot do**: Code reviews, PR reviews, CI checks, or engineering work (Kit's domain)

### 2.8 Proactive Behaviors

Beacon monitors support patterns and automatically triggers handoffs when thresholds are crossed:

- **Resolution pattern documentation**: After resolving recurring issues, handoff to Scribe with pattern details
- **Bug escalation**: When multiple customers report the same bug, handoff to Kit with reproduction steps
- **Feature request tracking**: When customers repeatedly request the same feature, handoff to Trak with impact estimate
- **Support cost alerting**: When ticket volume surges, handoff to Chief with trend analysis

---

## 3. Planned but Not Yet Implemented

### 3.1 ElevenLabs Voice AI Integration

**Issue**: #91
**Status**: NOT YET SET UP
**Timeline**: Spec complete, awaiting infrastructure setup

**What it will do**:
- Accept inbound calls from HourTimesheet customers
- Provide initial support tier through voice AI
- Transfer calls to human agents when needed (DTMF: press 0)
- Record call metadata with consent

**Current blocker**: Server Tools (send_sms, create_ticket) pending Lambda deployment

### 3.2 Phone/SIP Integration

**Issue**: #96
**Status**: LIVE — Voice calls active, SMS verification pending
**Timeline**: Voice calls operational since 2026-03-19; SMS pending toll-free verification (3-5 business days)

**What it does**:
- Inbound PSTN support calls via ElevenLabs Conversational AI
- AI voice agent (Casey) handles first-tier support with DCAA expertise
- End conversation system tool enabled for graceful call termination
- Caller ID detection via `system__caller_id` dynamic variable

**Infrastructure**:
- **Twilio number**: +1 (888) 887-8179 (toll-free, voice+SMS+MMS)
- **Twilio SID**: PNe5397e839258386e94e51969332ac897
- **ElevenLabs Agent ID**: agent_0301km38sbgffdsrpvr9m2w8x2qr
- **Voice model**: Brad - Welcoming & Casual (V3 Conversational Alpha)
- **LLM**: Claude Sonnet 4.6
- **TTS**: V3 Conversational with Expressive mode

**Security model — Act, Don't Reveal**:
- Agent CAN trigger actions (password resets, SMS links, ticket creation)
- Agent NEVER discloses account information to callers
- Phone spoofing rendered harmless by this model

**SMS status**: Toll-free verification submitted 2026-03-19; awaiting approval (3-5 business days)
**Next step**: Deploy Lambda proxy for Server Tools, configure ElevenLabs webhook tools

### 3.3 Web Chat Widget

**Issue**: #97
**Status**: SPEC EXISTS, NOT BUILT
**Timeline**: Specification complete, awaiting development

**What it will do**:
- Deploy a chat widget on hourtimesheet.com
- Allow customers to chat with HTS support directly
- Provide initial responses via Beacon AI, escalate to humans as needed
- Track chat transcripts in Zendesk

**Current blocker**: Widget code not written; backend chat endpoint not implemented

### 3.4 HourTimesheet API Direct Integration

**Issue**: #98
**Status**: SPEC COMPLETE, NOT IMPLEMENTED
**Timeline**: Requirements defined, awaiting development

**What it will do**:
- Direct read-only access to HourTimesheet API for real-time account data
- Retrieve customer timesheets, audit logs, and compliance status
- Verify account ownership before returning data
- Support troubleshooting by querying live account state

**Current blocker**: API authentication and rate-limiting policy not finalized

### 3.5 Customer-Facing Interactions

**Current state**: Beacon is **internal-only**. No customer-facing channels are active.

**When available**:
- Customers will interact via phone (ElevenLabs), web chat, or email
- Beacon will handle initial tier, escalate to humans for complex issues
- All customer interactions will be logged and attributed

---

## 4. Security Constraints (What Beacon CANNOT Do)

### 4.1 Data Access Restrictions

| **Resource** | **Status** | **Reason** |
|---|---|---|
| HourTimesheet customer databases | ❌ No direct access | All data fetched through API with customer verification |
| Zendesk customer PII (email, phone, address) | ⚠️ Read-only, restricted sharing | Only in DMs with authorized users; never in public channels |
| Financial/billing data | ❌ No access | Chief's domain; PCI-DSS compliance required |
| Customer API keys and credentials | ❌ Never stored | Stored only in customer's HTS account; rotated per policy |
| Production database backups | ❌ No access | Infrastructure access restricted to operations team |

### 4.2 Action Restrictions

| **Action** | **Status** | **Justification** |
|---|---|---|
| Delete Zendesk tickets | ❌ No | Admin-only; requires audit trail |
| Merge customer accounts | ❌ No | Financial impact; manual review required |
| Modify customer subscription | ❌ No | Billing operations; Chief's domain |
| Send customer-visible email replies | ❌ No | Humans send all public communications |
| Perform bulk operations (3+ tickets) | ⚠️ Restricted to admin tier | Escalation required for mass changes |
| Access other customers' accounts | ❌ Never | API enforces cross-account isolation |
| Export customer data | ❌ No | GDPR/CCPA compliance; requires admin approval |

### 4.3 Rate Limits & Budget Caps

Beacon respects daily/monthly API quotas:

- Zendesk API: ~1,000 calls/day (shared with Scout and other agents)
- Jira API: ~2,000 calls/day (shared with Trak and Kit)
- GitHub API: ~500 calls/day (shared with Kit and Trak)
- Notion API: ~500 calls/day (read-only; shared access)

Budget tracking: Beacon logs action counts in KNOWLEDGE.md and self-limits when approaching caps.

### 4.4 Public Channel Restrictions

Beacon **cannot post to public channels** without explicit approval:

- Can respond in threads when mentioned
- Cannot initiate new top-level messages in #leads, #general, or other public channels
- Handoffs use #dev (C086N5031LZ) or #agent-ops (C0AMHF5J9Q9) per protocol

### 4.5 User Tier Enforcement

Beacon enforces role-based access control (RBAC) per user tier:

| **Tier** | **Read** | **Create Tickets** | **Internal Notes** | **Bulk Operations** | **Delete** |
|---|---|---|---|---|---|
| **Admin** | ✅ Yes | ✅ Yes | ✅ Yes | ✅ Yes | ✅ Yes |
| **Developer** | ✅ Yes | ✅ Yes | ✅ Yes | ❌ No | ❌ No |
| **Support** | ✅ Yes | ✅ Yes | ✅ Yes | ❌ No | ❌ No |
| **(Unknown user)** | ✅ Yes | ✅ Yes | ✅ Yes | ❌ No | ❌ No |

Users not in the tier config default to **support** tier (most restrictive).

---

## 5. Architecture

### 5.1 How Beacon Connects to Slack

**Connection type**: Socket Mode (persistent WebSocket)
**Authentication**: OAuth 2.0 (refresh tokens)
**Group policy**: Open (responds in any channel when @mentioned)
**Mention requirement**: True (must be explicitly mentioned to respond)
**Streaming**: Off (prevents leaked channel messages; security default)

Beacon's Socket Mode connection is established at container startup and maintains a persistent connection to the Slack gateway. All inbound Slack events (mentions, DMs, reactions) are routed through the Socket Mode connection.

### 5.2 Tool Access via MCP

**MCP Servers** (Model Context Protocol) provide API access:

| **Tool** | **Server** | **Protocol** | **Access** |
|---|---|---|---|
| Zendesk | `zendesk.mcporter` | HTTPS + OAuth | 8 tools (search, get, create, update, comments) |
| Jira | `jira.mcporter` | HTTPS + OAuth | 5 tools (get, post, put, patch, delete) |
| Notion | `notion.mcporter` | HTTPS + OAuth | 22 tools (search, pages, blocks, users) |
| GitHub | `gh` CLI | HTTPS (GitHub CLI) | 10+ subcommands (limited to issue search) |

Each tool call includes the requesting user's Slack ID for audit attribution.

### 5.3 Handoff Protocol

Beacon uses a **two-tier handoff system** for cross-agent communication:

**Primary method** (session-to-session): Disabled for security (visibility=tree)
**Fallback method** (channel @mention): Post to #dev or #agent-ops with target agent's @mention

**Format**:
```
CROSS-AGENT HANDOFF | beacon → {target_agent}
Handoff ID: {id_from_protocol}
Priority: {high|medium|low}

Trigger: {what triggered this handoff}

Payload:
• {structured data}

[HMAC:{sha256_signature}]
```

**Authentication**: HMAC-SHA256 using HANDOFF_HMAC_KEY environment variable. Receiving agent verifies signature before processing.

### 5.4 Agent Identities

Beacon's identity is defined in:
```
/root/.openclaw/agents/beacon/workspace/IDENTITY.md
```

This file contains:
- Tool availability declarations
- Personality and communication style
- HourTimesheet product knowledge
- Security constraints and user tier rules
- Proactive behavior triggers
- Cross-agent delegation rules

Changes to IDENTITY.md require container restart to take effect.

---

## 6. Configuration Reference

### 6.1 Slack Configuration

| **Setting** | **Value** |
|---|---|
| **Workspace** | lmntlai.slack.com |
| **Bot User ID** | U0AMPKFH5D4 |
| **Bot Display Name** | Beacon 💡 |
| **App ID** | A0AMPHEPRPG |
| **Connection Type** | Socket Mode (WebSocket) |
| **Mention Required** | true |
| **Group Policy** | open |
| **Streaming** | off |

### 6.2 Channel Configuration

| **Channel** | **ID** | **Purpose** | **Beacon Access** |
|---|---|---|---|
| **#leads** | C089JBLCFLL | Sales and customer success | Read-only, responds when mentioned |
| **#dev** | C086N5031LZ | Operations coordination | Handoff channel (primary) |
| **#agent-ops** | C0AMHF5J9Q9 | Sensitive operations | Handoff channel (financial/sensitive) |
| **#agentic-dev** | C0AKWU052CW | Agent development | Read-only, responder status |

### 6.3 Integration Sites

| **Integration** | **Site** | **Purpose** |
|---|---|---|
| **Zendesk** | minute7.zendesk.com | Support ticket management (shared with Minute7) |
| **Jira** | LMNTL Jira | Issue tracking (HK project primary) |
| **Notion** | LMNTL Workspace | Knowledge base and documentation |
| **GitHub** | github.com/hourtimesheet | HTS product repository |

### 6.4 User IDs (Cross-Agent Reference)

| **Agent** | **User ID** | **Session Target** |
|---|---|---|
| Beacon | U0AMPKFH5D4 | agent:beacon:main |
| Scout | U0AJLT30KMG | agent:scout:main |
| Trak | U0AJEGUSELB | agent:trak:main |
| Kit | U0AKF614URE | agent:kit:main |
| Scribe | U0AM170694Z | agent:scribe:main |
| Probe | U0ALRTLF752 | agent:probe:main |
| Chief | U0ALERF7F9V | agent:chief:main |

### 6.5 Credential Management

All credentials are stored in environment variables at container startup:

- `SLACK_BOT_TOKEN` — OAuth token for Slack API
- `SLACK_APP_TOKEN` — App-level token for Socket Mode
- `ZENDESK_TOKEN` — API token for minute7.zendesk.com
- `JIRA_TOKEN` — OAuth token for LMNTL Jira
- `NOTION_TOKEN` — OAuth token for LMNTL Notion
- `GITHUB_TOKEN` — GitHub Personal Access Token (gh CLI)
- `HANDOFF_HMAC_KEY` — HMAC-SHA256 key for signing handoffs

**Security**: Tokens are never logged, shared, or stored in code. Rotation policies are enforced by the infrastructure team.

---

## 7. Persistent Knowledge & Learning

### 7.1 KNOWLEDGE.md File

Beacon maintains a persistent knowledge file that survives across container restarts:

```
/home/openclaw/.openclaw/.openclaw/workspace-beacon/KNOWLEDGE.md
```

This file contains:
- Product learnings (features, integrations, limitations)
- Customer profiles and recurring issues
- Resolution playbooks
- Performance metrics and trends

After resolving significant or novel issues, Beacon appends learnings:

```markdown
## 2026-03-19 — Topic
What was learned here. Problem, solution, outcome, frequency data.
```

### 7.2 Budget Tracking

Beacon logs daily action counts in KNOWLEDGE.md:

```
Action counts for 2026-03-19:
- Zendesk: 42 API calls (1000 daily cap, 95.8% remaining)
- Jira: 18 API calls (2000 daily cap, 99.1% remaining)
- GitHub: 3 API calls (500 daily cap, 99.4% remaining)
```

When approaching caps (>85% usage), Beacon throttles proactive operations and alerts the team.

---

## 8. Summary: Capabilities Matrix

### What Beacon DOES (Enabled)

✅ **Slack**: Respond in #leads, #dev, #agent-ops when mentioned
✅ **Zendesk**: Search, create, read, update tickets; add internal notes
✅ **Jira**: Search, create, read HK project issues
✅ **Notion**: Read knowledge base articles
✅ **GitHub**: Search HTS issues (read-only)
✅ **Cross-agent handoffs**: Initiate via #dev or #agent-ops with HMAC signature
✅ **HourTimesheet expertise**: Deep product knowledge (DCAA, features, integrations, troubleshooting)
✅ **Proactive operations**: Auto-trigger handoffs when patterns detected
✅ **Audit logging**: Track all actions with user attribution

### What Beacon DOES NOT (Disabled)

❌ **Customer-facing channels**: No email, phone, or web chat (not yet implemented)
❌ **Zendesk**: Cannot send customer-visible replies, delete tickets, or merge accounts
❌ **Database writes**: No direct database access; all operations via API
❌ **Billing access**: No financial data or payment information
❌ **PII export**: Cannot bulk-export customer data
❌ **Public posting**: Cannot post to #general or other public channels unsolicited
❌ **Customer API keys**: Never stored or transmitted
❌ **Bot-to-bot DMs**: Slack API blocks this; use channel handoffs instead

### What Beacon WILL HAVE (In Development)

🚀 **Voice AI** (Issue #91): Inbound call support via ElevenLabs
🚀 **Phone integration** (Issue #96): SIP gateway for PSTN calls
🚀 **Web chat** (Issue #97): Chat widget on hourtimesheet.com
🚀 **HourTimesheet API** (Issue #98): Direct real-time account data access

---

## 9. Getting Help

### When to Ask Beacon

- "What does HourTimesheet's DCAA audit trail cover?"
- "How do we integrate QuickBooks Online with HTS?"
- "Can you search Zendesk for tickets about timesheet approval?"
- "Has this HTS bug been reported before?"
- "What's the most common HTS setup issue?"

### When to Ask Other Agents

- **General support, Minute7 questions** → Ask Scout
- **Engineering, code, CI/CD** → Ask Kit
- **Project management, sprint planning** → Ask Trak
- **Documentation, knowledge base** → Ask Scribe
- **QA, testing, reproduction** → Ask Probe
- **Financial analysis, operational metrics** → Ask Chief

### Escalation Path

If you need Beacon to do something not listed above:

1. **Check the planned features** (Section 3) — may be in development
2. **Create a Jira task** in the HK project with the request
3. **Mention @Beacon in #dev** with context for async feedback
4. **DM the infrastructure team** for infrastructure-level changes (credentials, channels, API access)

---

## 10. Document History

| **Date** | **Version** | **Changes** |
|---|---|---|
| 2026-03-19 | 1.0 | Initial release: Current capabilities, constraints, planned features, configuration |

---

**Last updated**: 2026-03-19
**Maintained by**: OpenClaw Infrastructure Team
**Questions?** Ask @Beacon in #dev or create a task in the HK Jira project.
