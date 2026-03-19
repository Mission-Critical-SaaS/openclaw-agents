# Multi-Product AI Support Agent Architecture Specification

**Issue #101** | Last updated: 2026-03-19

Architecture specification for generalizing the HourTimesheet ElevenLabs voice agent across multiple LMNTL products (HourTimesheet, Minute7, GoodHelp), enabling cost-efficient scaling to additional products.

---

## 1. ARCHITECTURE OVERVIEW

### Goal

Build a single, generalized ElevenLabs agent infrastructure that can serve multiple products by:
- Abstracting product-specific knowledge into swappable knowledge bases
- Sharing core infrastructure (phone, SIP, voice, Zendesk integration)
- Supporting per-product configuration (voice personality, API endpoints, knowledge base)
- Enabling rapid deployment to new products
- Maintaining consistent customer experience across all products

### Current State (HourTimesheet Only)

```
ElevenLabs Agent (HourTimesheet-specific)
    ├─ Knowledge base (HourTimesheet)
    ├─ API endpoints (HourTimesheet)
    ├─ Zendesk instance (minute7.zendesk.com)
    └─ Phone number (1-888-780-9961)
```

### Target State (Multi-Product)

```
ElevenLabs Account (LMNTL)
    ├─ Agent 1: HourTimesheet
    │   ├─ Knowledge base: HourTimesheet-specific
    │   ├─ Configuration: HTS config
    │   ├─ Phone: 1-888-780-9961
    │   └─ Zendesk: minute7.zendesk.com
    │
    ├─ Agent 2: Minute7
    │   ├─ Knowledge base: Minute7-specific
    │   ├─ Configuration: Minute7 config
    │   ├─ Phone: [Minute7 support number]
    │   └─ Zendesk: [Minute7 instance]
    │
    └─ Agent 3: GoodHelp
        ├─ Knowledge base: GoodHelp-specific
        ├─ Configuration: GoodHelp config
        ├─ Phone: [GoodHelp support number]
        └─ Zendesk: [GoodHelp instance]

Shared Infrastructure:
    ├─ Twilio SIP trunks (all numbers)
    ├─ ElevenLabs platform
    ├─ Shared support dashboard
    ├─ Common monitoring
    └─ Unified troubleshooting framework
```

---

## 2. ABSTRACTION LAYER: KNOWLEDGE BASES

### Knowledge Base Structure

Each product has a **dedicated, swappable knowledge base** that contains:
- Product overview and positioning
- Feature descriptions and workflows
- Integration guides (API, third-party systems)
- Compliance and policy information
- Troubleshooting procedures
- Support contact information
- Role-based access rules
- Common error scenarios

### Knowledge Base Format

**File:** `{product}-knowledge-base.md`
**Location:** `/agents/{product}/knowledge-base.md`
**Size:** 300-500 lines (optimized for AI consumption)
**Format:** Structured Q&A, topic blocks, troubleshooting flows
**Update Frequency:** Quarterly, or as features change

### Knowledge Base Contents (Template)

```markdown
# {Product} AI Agent Knowledge Base

## 1. Product Overview
- What is {product}?
- Who uses it?
- Key differentiators
- Pricing model

## 2. Core Features
- Feature 1 (overview, how to use)
- Feature 2 (overview, how to use)
- ... (all major features)

## 3. Integration Guides
- Third-party integrations
- API documentation
- Sync procedures
- Troubleshooting

## 4. Compliance & Policies
- Regulatory requirements
- Data retention
- Security controls
- Support policies

## 5. User Roles
- Role definitions
- Permissions per role
- Common workflows

## 6. Troubleshooting Flows
- Common issues
- Step-by-step resolution
- Escalation paths
- Support contact info

## 7. Quick Reference
- Feature availability matrix
- Integration status indicators
- Error codes
- Support contact information
```

### Example Products' Knowledge Bases

**HourTimesheet Knowledge Base:**
- Focus: DCAA compliance, government contractors, time tracking
- Integrations: QuickBooks, ADP, Paychex, Gusto
- Key features: Timesheet approval, charge codes, overtime tracking
- Support: 1-888-780-9961, support@hourtimesheet.com

**Minute7 Knowledge Base:**
- Focus: Simplified time tracking, small business, mobile-first
- Integrations: Stripe, Wave, Shopify
- Key features: Time tracking, project management, invoicing
- Support: [Minute7 support number], support@minute7.com

**GoodHelp Knowledge Base:**
- Focus: In-home care, caregiver management, compliance
- Integrations: Healthcare systems, payroll processors
- Key features: Caregiver scheduling, care plans, compliance
- Support: [GoodHelp support number], support@goodhelp.com

### Knowledge Base Version Control

**Versioning:**
```
{product}-knowledge-base-v1.0.md (current)
{product}-knowledge-base-v0.9.md (previous)
{product}-knowledge-base-archive/
```

**Updates:**
- Create new version for each major change
- Keep previous version for rollback
- Test with agent in sandbox before deploying
- Document changes in version notes

---

## 3. SHARED INFRASTRUCTURE COMPONENTS

### ElevenLabs Platform

**Single Account:**
- One LMNTL ElevenLabs account (enterprise tier)
- Multiple agents (one per product)
- Shared API credentials and settings
- Unified billing and usage tracking

**Advantages:**
- Volume discounts (single account)
- Shared infrastructure costs
- Centralized management
- Consistent feature set

**Cost Estimate:**
- Base: ~$500-1000/month (per agent, depends on usage)
- 3 agents: ~$1500-3000/month total
- Savings: ~30% vs. separate accounts

### Twilio Phone Integration

**Single Twilio Account:**
- All product phone numbers under one account
- Multiple SIP trunks (one per product)
- Shared recording and transcription setup
- Unified billing and analytics

**Phone Numbers:**
```
HourTimesheet:  1-888-780-9961  → SIP trunk to ELL agent 1
Minute7:        1-XXX-XXX-XXXX  → SIP trunk to ELL agent 2
GoodHelp:       1-XXX-XXX-XXXX  → SIP trunk to ELL agent 3
```

**SIP Configuration:**
```
Primary SIP Endpoint:  sip.elevenlabs.com
Product Routing:       By phone number → SIP trunk → Agent
Failover:              Telnyx (if Twilio down)
Recording:             Shared storage, product-tagged
```

**Cost:**
- Phone numbers: ~$1/month each (3 × $1 = $3)
- Inbound calls: ~$0.0085/min (shared across products)
- Recording: ~$0.0075/min
- Estimated: $200-400/month (depending on call volume)

### Zendesk Multi-Instance Integration

**LMNTL Account:**
- Single Zendesk organization (minute7.zendesk.com)
- Separate ticket spaces per product
  - Space: HourTimesheet
  - Space: Minute7
  - Space: GoodHelp
- Shared support team (trained on all products)
- Unified analytics and reporting

**Alternative: Separate Instances**
- If products have separate support teams
- HourTimesheet: minute7.zendesk.com
- Minute7: minute7-m7.zendesk.com
- GoodHelp: goodhelp.zendesk.com
- Each agent routes to correct instance

**Recommended:** Shared instance (minute7.zendesk.com) with spaces

**Cost:**
- Base plan: Shared across products
- Agents: ~$25/agent/month × 5 = $125/month
- Voice add-on: ~$50/agent/month × 3 = $150/month
- Estimated: $275-400/month

### Shared Support Dashboard

**Features:**
- Real-time view of all agent status
- Call queue across all products
- Escalation routing
- Agent workload distribution
- Performance metrics (all products)
- Customer satisfaction trends

**Technology:**
- Dashboards in Zendesk, Datadog, or custom
- Real-time updates via WebSocket
- Mobile-friendly interface
- Customizable views per team

### Shared Monitoring & Alerting

**Metrics Tracked:**
- SIP trunk availability (all products)
- ElevenLabs agent availability
- Call success rate per product
- Average handle time
- Escalation rate
- System errors

**Alerting:**
- Pagerduty or Datadog for critical alerts
- Slack notifications for warnings
- Daily report email to management
- Weekly performance review

---

## 4. PER-PRODUCT CONFIGURATION SYSTEM

### Configuration Schema

Each product has a **configuration file** specifying its unique settings.

**File:** `{product}-config.yaml`
**Location:** `/agents/{product}/config.yaml`

**Schema:**

```yaml
# Product Configuration File
product:
  name: "HourTimesheet"
  id: "hts"
  display_name: "HourTimesheet"
  description: "DCAA-compliant timekeeping for government contractors"

voice:
  agent_name: "HourTimesheet Support"
  greeting: "Hello, thanks for calling HourTimesheet support. How can I help?"
  voice_profile: "professional-neutral"
  accent: "american-neutral"
  speed: 1.0
  pronunciation_guide:
    - word: "DCAA"
      pronunciation: "D-C-A-A"
    - word: "QuickBooks"
      pronunciation: "Quick-Books"

personality:
  tone: "professional-helpful"
  language_style: "formal"
  technical_level: "intermediate"
  examples:
    greeting: "Thanks for calling HourTimesheet support."
    technical_issue: "Let me troubleshoot this step by step."
    escalation: "I'll connect you with a specialist."

knowledge_base:
  file: "hts-knowledge-base.md"
  version: "1.0"
  last_updated: "2026-03-19"
  size_lines: 450

api:
  base_url: "https://api.hourtimesheet.com/v1"
  endpoints:
    account_status: "/accounts/{id}"
    subscription: "/accounts/{id}/subscription"
    integrations: "/accounts/{id}/integrations"
    charge_codes: "/accounts/{id}/charge-codes"
    timesheet_periods: "/accounts/{id}/timesheet-periods"
    password_reset: "/accounts/{id}/password-reset-request"
  auth_type: "bearer_token"
  rate_limit: 100  # requests per minute

zendesk:
  instance: "minute7.zendesk.com"
  space: "hourtimesheet"
  group_id: 789012
  tags:
    - "hts"
    - "ai-handled"
    - "phone"
  routing_tags:
    escalated: "ai-escalated-hts"
    handled: "ai-handled-hts"

phone:
  number: "1-888-780-9961"
  sip_trunk: "hts-elevenlabs"
  recording: true
  transcription: true
  after_hours_voicemail: true
  hold_music: "professional-generic"

integrations:
  quickbooks:
    description: "QuickBooks Online & Desktop"
    status: "supported"
  adp:
    description: "ADP Workforce Now, Run, TotalSource"
    status: "supported"
  paychex:
    description: "Paychex Flex"
    status: "supported"
  gusto:
    description: "Gusto Payroll"
    status: "supported"
  insperity:
    description: "Insperity Workforce"
    status: "supported"

compliance:
  framework: "DCAA"
  soc2: true
  gdpr: false
  hipaa: false
  data_retention_years: 5

support:
  phone: "1-888-780-9961"
  email: "support@hourtimesheet.com"
  business_hours: "Mon-Fri 8am-6pm EST"
  response_time_hours: 4

troubleshooting:
  common_issues:
    - issue: "Cannot sync to QuickBooks"
      resolution_steps: 3
      escalation_likelihood: 0.3
    - issue: "Mobile app sync not working"
      resolution_steps: 4
      escalation_likelihood: 0.4
    - issue: "Charge code showing inactive"
      resolution_steps: 2
      escalation_likelihood: 0.1
```

### Configuration for Another Product (Minute7)

```yaml
product:
  name: "Minute7"
  id: "m7"
  display_name: "Minute7"
  description: "Simple time tracking for small teams"

voice:
  agent_name: "Minute7 Support"
  greeting: "Hey! Thanks for reaching Minute7 support. What can we help with?"
  voice_profile: "friendly-casual"  # Different from HTS
  accent: "american-casual"
  speed: 1.1

personality:
  tone: "friendly-approachable"
  language_style: "conversational"
  technical_level: "beginner"

knowledge_base:
  file: "minute7-knowledge-base.md"
  version: "1.0"

api:
  base_url: "https://api.minute7.com/v1"
  # Different endpoints
  rate_limit: 150

zendesk:
  instance: "minute7.zendesk.com"  # Same instance
  space: "minute7"  # Different space
  group_id: 789013

phone:
  number: "1-XXX-XXX-XXXX"  # Different number
  sip_trunk: "m7-elevenlabs"

# ... rest of configuration
```

### Configuration Management

**Deployment Process:**
1. Developer updates config file
2. Changes reviewed in pull request
3. Merged to main branch
4. Auto-deployed to ElevenLabs agent (via CI/CD)
5. Changes take effect within 5 minutes
6. Rollback available if issues found

**Tools:**
- Git for version control
- CI/CD pipeline (GitHub Actions, CircleCI)
- Configuration validation schema
- Automated testing before deploy

---

## 5. SHARED VS. PRODUCT-SPECIFIC COMPONENTS MATRIX

| Component | Shared | HTS-Specific | M7-Specific | GH-Specific | Notes |
|-----------|--------|-------------|------------|------------|-------|
| ElevenLabs Platform | ✓ | — | — | — | Single account, multiple agents |
| SIP Trunks | ✓ | — | — | — | Twilio shared, product-routed |
| Voice Agent Engine | ✓ | — | — | — | ElevenLabs core platform |
| Knowledge Base | — | ✓ | ✓ | ✓ | Separate file per product |
| Greeting Audio | — | ✓ | ✓ | ✓ | Different personality per product |
| API Integration | — | ✓ | ✓ | ✓ | Different endpoints per product |
| Zendesk Instance | ✓* | ✓ | ✓ | ✓ | Single instance, separate spaces |
| Phone Number | — | ✓ | ✓ | ✓ | Unique number per product |
| Recording/Transcription | ✓ | ✓ | ✓ | ✓ | Shared service, product-tagged |
| Monitoring Dashboard | ✓ | — | — | — | Unified across all products |
| Support Team | ✓* | ✓ | ✓ | ✓ | Shared team, product-trained |
| Escalation Workflow | ✓ | ✓ | ✓ | ✓ | Shared process, product-specific routing |
| Troubleshooting Framework | ✓ | ✓ | ✓ | ✓ | Shared logic, product-specific flows |

**Note:** ✓* = Shared infrastructure with product-specific configuration

---

## 6. MULTI-PRODUCT DEPLOYMENT MODEL

### Agent Deployment Architecture

```
ElevenLabs Account (LMNTL)
    │
    ├─ Agent ID: hts-voice-agent
    │   ├─ Knowledge Base: hts-knowledge-base.md
    │   ├─ Config: hts-config.yaml
    │   ├─ Webhook Tools: HTS API endpoints
    │   ├─ SIP Endpoint: sip.elevenlabs.com
    │   ├─ Phone: 1-888-780-9961
    │   └─ Zendesk: minute7.zendesk.com/hts
    │
    ├─ Agent ID: m7-voice-agent
    │   ├─ Knowledge Base: m7-knowledge-base.md
    │   ├─ Config: m7-config.yaml
    │   ├─ Webhook Tools: M7 API endpoints
    │   ├─ SIP Endpoint: sip.elevenlabs.com
    │   ├─ Phone: 1-XXX-XXX-XXXX
    │   └─ Zendesk: minute7.zendesk.com/m7
    │
    └─ Agent ID: gh-voice-agent
        ├─ Knowledge Base: gh-knowledge-base.md
        ├─ Config: gh-config.yaml
        ├─ Webhook Tools: GH API endpoints
        ├─ SIP Endpoint: sip.elevenlabs.com
        ├─ Phone: 1-XXX-XXX-XXXX
        └─ Zendesk: goodhelp.zendesk.com/gh
```

### Agent Configuration in ElevenLabs

**Agent Setup Process:**
1. Create new agent in ElevenLabs
2. Name: `{product}-voice-agent`
3. Upload knowledge base: `{product}-knowledge-base.md`
4. Configure voice: From config file (voice profile, personality)
5. Add webhook tools: Product-specific API endpoints
6. Set system prompt: Generic but contextual to product
7. Configure SIP: Route to correct phone number via Twilio
8. Deploy and test

**System Prompt (Template):**
```
You are a helpful, professional support agent for {product}.
You have access to the {product} knowledge base and can help customers with:
- Product features and usage
- Integration setup and troubleshooting
- Common issues and solutions
- Account information (with verification)

Guidelines:
1. Always be professional and courteous
2. Use the knowledge base for accurate information
3. Verify customer identity before accessing sensitive data
4. Escalate complex issues to the support team
5. Record all interactions for compliance

Product-specific knowledge is in the attached knowledge base.
Use it liberally to provide accurate, helpful responses.
```

---

## 7. CONFIGURATION SCHEMA DEEP DIVE

### Voice Configuration

**Voice Profile Options:**
- `professional-neutral`: Formal, measured, government/enterprise focus
- `friendly-casual`: Conversational, approachable, small business focus
- `technical-expert`: Fast-paced, technical jargon, IT focus
- `warm-empathetic`: Caring, patient, healthcare focus

**Accent Options:**
- `american-neutral`: Standard US English
- `american-southern`: Southern US English
- `american-casual`: Casual American English
- `british`: British English
- `australian`: Australian English

**Speed:**
- `0.8`: Slow (for clarity)
- `1.0`: Normal (default)
- `1.2`: Fast (for efficiency)

**Pronunciation Guide:**
Map words to pronunciations for consistent delivery:
```yaml
pronunciation_guide:
  - word: "DCAA"
    pronunciation: "D-C-A-A"
  - word: "QuickBooks"
    pronunciation: "Quick-Books"
  - word: "Paychex"
    pronunciation: "Pay-Chex"
```

### API Configuration

**Endpoints Required:**
```yaml
endpoints:
  account_status:        # Get account info
  subscription:          # Get subscription details
  integrations:          # Get integration status
  charge_codes:          # For products with charge codes
  timesheet_periods:     # For time tracking products
  password_reset:        # Universal
  [product-specific]:    # Any custom endpoints
```

**Rate Limiting:**
- Standard: 100 req/min (per API key)
- High-volume: 200 req/min (if needed)
- Enterprise: Custom limits

**Authentication:**
- Type: `bearer_token` (standard) or `api_key`
- Token lifetime: 24 hours
- Refresh: Automatic
- Rotation: Every 90 days

### Zendesk Integration

**Ticket Routing:**
- All tickets initially created in shared Zendesk instance
- Tags indicate product: `hts`, `m7`, `gh`
- Spaces organize by product
- Support team trained on all products
- Advanced option: Separate instances per product

**Tags Hierarchy:**
```
Product-specific:
  - hts / m7 / gh

Handling status:
  - ai-handled (resolved by agent)
  - ai-escalated (needs human)

Channel:
  - phone
  - chat

Category:
  - integration
  - login
  - billing
  - feature-request

Feature:
  - quickbooks
  - adr
  - mobile-app
  - charge-codes
```

**Routing Rules:**
```yaml
routing_rules:
  - tag: "ai-escalated"
    priority: high
    group: support-team
    auto_assign: round_robin

  - tag: "billing"
    priority: normal
    group: billing-team
    auto_assign: true

  - tag: "quickbooks"
    priority: normal
    group: integration-team
    auto_assign: true
```

---

## 8. FEATURE PARITY & CUSTOMIZATION GUIDELINES

### Core Features (All Products Must Have)

**Must Support:**
- Customer verification (by email)
- Account status lookup
- Integration status check
- Basic troubleshooting
- Escalation to human
- Call recording and transcription
- Phone support hours (8am-6pm EST, Mon-Fri)
- Voicemail after hours
- Zendesk ticket creation

**Must Have API Endpoints:**
- Account status
- Subscription/pricing info
- Integrations status
- Password reset trigger
- Product-specific core endpoint

### Product Customization Options

**Allowed Customizations:**
- Voice personality (friendly vs. formal)
- Greeting and closing messages
- Feature-specific troubleshooting
- Product-specific integrations
- Custom API endpoints
- Different support hours
- Product-specific escalation rules

**Not Allowed (Would Break Generalization):**
- Completely different SIP routing
- Non-Zendesk support system
- Non-Twilio phone provider
- Custom ElevenLabs platform
- Non-standard authentication

### Branching Strategy for Customization

**Shared Code:**
- ElevenLabs agent base configuration
- Twilio SIP integration
- Zendesk ticket creation logic
- Call recording setup
- Escalation framework

**Product-Specific:**
- Knowledge base (separate file per product)
- Voice personality (config)
- API integrations (config)
- Troubleshooting flows (in knowledge base)

**Decision Tree:**
```
Question: Is this a core support function?
├─ Yes: Put in shared code/config
│   └─ Make it configurable
│
└─ No: Put in product-specific knowledge base
    └─ Or add to product config
```

---

## 9. SCALING TO NEW PRODUCTS

### Onboarding Checklist (for New Product)

**Week 1: Planning & Preparation**
- [ ] Define product overview (name, description, target users)
- [ ] List key features (10-15 core features)
- [ ] Identify integrations (2-5 typical integrations)
- [ ] Determine support hours (business hours)
- [ ] Assign support contact info (phone, email)
- [ ] Identify existing phone number or assign new one

**Week 2: Knowledge Base Development**
- [ ] Write product overview section
- [ ] Document all core features
- [ ] Create integration guides
- [ ] Write troubleshooting flows for top 10 issues
- [ ] Add compliance/policy information
- [ ] Add support contact info
- [ ] Test knowledge base (300-500 lines)

**Week 3: Configuration & APIs**
- [ ] Define voice personality & audio
- [ ] Create product configuration file
- [ ] List API endpoints (minimum 6)
- [ ] Test API connectivity
- [ ] Set up API authentication
- [ ] Configure rate limiting
- [ ] Document any custom endpoints

**Week 4: Integration & Testing**
- [ ] Set up Zendesk space (or instance)
- [ ] Configure ticket routing rules
- [ ] Port phone number (or order new one)
- [ ] Configure SIP trunk in Twilio
- [ ] Create ElevenLabs agent
- [ ] Integrate knowledge base
- [ ] Set up webhook tools for APIs
- [ ] Test end-to-end call flow

**Week 5: Pilot & Launch**
- [ ] Run internal testing (engineering team)
- [ ] Pilot with 10% of calls (first week)
- [ ] Monitor quality metrics
- [ ] Gather feedback from support team
- [ ] Refine knowledge base based on learnings
- [ ] Full launch (100% of calls)
- [ ] Monitor for 2 weeks post-launch

**Total Timeline:** 5 weeks from concept to full launch

### Cost of Adding New Product

**One-Time Costs:**
- Phone number porting: $50-100
- API development: Included (use existing patterns)
- Knowledge base creation: 40 hours × $100/hr = $4,000
- Testing & QA: 20 hours × $100/hr = $2,000
- **Total One-Time:** ~$6,000-7,000

**Ongoing Monthly Costs:**
- ElevenLabs agent: $400-800/month (depends on call volume)
- Twilio calls: $0.01-0.03/minute × expected minutes/month
- Zendesk agents: Shared cost (amortized across products)
- Support training: Amortized (2-4 hours/product)
- **Total Monthly:** $500-1,000/month (incremental)

**ROI:**
- Product needs 100+ support calls/month to justify
- Breaks even in 6-12 months for new product
- Shared infrastructure saves 40-50% vs. separate solution

---

## 10. COST MODEL & SCALING ECONOMICS

### Cost Breakdown (Per Product, Per Month)

**For HourTimesheet (500 calls/month, 10 min avg):**

| Component | Volume | Unit Cost | Monthly |
|-----------|--------|-----------|---------|
| ElevenLabs Agent | 1 | $400-600 | $500 |
| Twilio Calls | 5,000 min | $0.0085 | $42.50 |
| Twilio Recording | 5,000 min | $0.0075 | $37.50 |
| Zendesk (shared) | — | — | $92 |
| Phone Number | 1 | $1 | $1 |
| Monitoring | — | — | $25 |
| **Total** | — | — | **$698** |

**Annualized:** ~$8,376/product

### Cost per Call Handled

**HourTimesheet (500 calls/month):**
- Total cost: $698/month
- Cost per call: $1.40
- If 60% handled by AI: $2.33 per AI-handled call
- If escalation: $2.33 × 100 / 60 = $3.88 per escalated call

**With Volume (1000 calls/month):**
- Cost stays roughly same: $698/month
- Cost per call: $0.70
- Cost per AI-handled: $1.17

**Scaling Economics (3 Products):**

| Metric | Total | Per Product | Savings |
|--------|-------|-------------|---------|
| ElevenLabs (3 agents) | $1,500 | $500 | +30% per product |
| Twilio (shared) | $150 | $50 | +45% per product |
| Zendesk (shared) | $275 | $92 | +67% per product |
| Total Monthly | $2,000 | $667 | +40% vs. separate |

**Add 2nd Product (Minute7):**
- Incremental cost: +$500-600/month
- Reduces per-product cost by 25%
- ROI: 10 months

**Add 3rd Product (GoodHelp):**
- Incremental cost: +$500-600/month
- Reduces per-product cost by 35%
- ROI: 8 months

---

## 11. DEPLOYMENT ARCHITECTURE

### Infrastructure Diagram

```
┌─────────────────────────────────────────────────────┐
│                  LMNTL Infrastructure                │
├─────────────────────────────────────────────────────┤
│                                                      │
│  ┌──────────────────────────────────────────────┐   │
│  │      ElevenLabs Enterprise Account           │   │
│  │                                              │   │
│  │  ┌─────────────────────────────────────────┐ │   │
│  │  │ Agent: HourTimesheet Support            │ │   │
│  │  │ • Knowledge Base: hts-kb.md             │ │   │
│  │  │ • Config: hts-config.yaml               │ │   │
│  │  │ • APIs: HourTimesheet API               │ │   │
│  │  └─────────────────────────────────────────┘ │   │
│  │                                              │   │
│  │  ┌─────────────────────────────────────────┐ │   │
│  │  │ Agent: Minute7 Support                  │ │   │
│  │  │ • Knowledge Base: m7-kb.md              │ │   │
│  │  │ • Config: m7-config.yaml                │ │   │
│  │  │ • APIs: Minute7 API                     │ │   │
│  │  └─────────────────────────────────────────┘ │   │
│  │                                              │   │
│  │  ┌─────────────────────────────────────────┐ │   │
│  │  │ Agent: GoodHelp Support                 │ │   │
│  │  │ • Knowledge Base: gh-kb.md              │ │   │
│  │  │ • Config: gh-config.yaml                │ │   │
│  │  │ • APIs: GoodHelp API                    │ │   │
│  │  └─────────────────────────────────────────┘ │   │
│  │                                              │   │
│  └──────────────────────────────────────────────┘   │
│                      ↓                               │
│  ┌──────────────────────────────────────────────┐   │
│  │  Twilio (Phone Integration)                  │   │
│  │  • Phone: 1-888-780-9961 → HTS Agent       │   │
│  │  • Phone: 1-XXX-XXX-XXXX → M7 Agent       │   │
│  │  • Phone: 1-XXX-XXX-XXXX → GH Agent       │   │
│  │  • SIP Trunks: 3 trunks (all agents)      │   │
│  │  • Recording: Shared, product-tagged      │   │
│  └──────────────────────────────────────────────┘   │
│                      ↓                               │
│  ┌──────────────────────────────────────────────┐   │
│  │  Zendesk (Support Ticketing)                 │   │
│  │  • Instance: minute7.zendesk.com            │   │
│  │  • Spaces: HTS / M7 / GH                    │   │
│  │  • Agents: Shared support team              │   │
│  │  • Routing: By product tag                  │   │
│  └──────────────────────────────────────────────┘   │
│                                                      │
│  ┌──────────────────────────────────────────────┐   │
│  │  Shared Infrastructure                       │   │
│  │  • Monitoring (Datadog)                      │   │
│  │  • Dashboards (Zendesk + custom)             │   │
│  │  • Logging (CloudWatch + Zendesk)            │   │
│  │  • Alerts (PagerDuty)                        │   │
│  └──────────────────────────────────────────────┘   │
│                                                      │
└─────────────────────────────────────────────────────┘

External Systems:
   └─ Product APIs (HourTimesheet, Minute7, GoodHelp)
   └─ Customer Phone Lines
   └─ Email Systems
```

### Data Flow (Multi-Product Call)

```
Customer calls 1-888-780-9961 (HTS number)
    ↓
Twilio SIP receives call
    ↓
Route to ElevenLabs HTS agent (by phone number)
    ↓
ElevenLabs agent loads:
    • hts-knowledge-base.md
    • hts-config.yaml
    • HTS API webhook tools
    ↓
Agent greets: "Thanks for calling HourTimesheet support..."
    ↓
Customer describes issue
    ↓
[If simple]
    ↓
Agent uses knowledge base + API to resolve
    ├─ Call GET /accounts/{id} for account info
    ├─ Call GET /accounts/{id}/integrations for status
    ├─ Suggest solution based on KB
    ↓
Agent: "Try [solution]. Let me know if that works."
    ↓
[If resolved]
    ↓
Agent: "Great! Anything else I can help with?"
    ↓
Call ends
    ↓
ElevenLabs transcription
    ↓
Zendesk ticket created (if escalated) with tag "hts"
    ↓
Zendesk alert to HTS support space
```

---

## 12. GOVERNANCE & OPERATIONAL PROCEDURES

### Product Onboarding Committee

**Team:**
- Product Manager (for new product)
- Support Lead
- Engineering Lead
- AI/ElevenLabs Lead

**Approval Criteria for New Product:**
1. Product is LMNTL owned or partner product
2. Product has existing customer base (50+ accounts)
3. Support volume justifies (100+ calls/month expected)
4. Product has documented knowledge/features
5. Product has existing APIs or is willing to build them
6. Product supports Zendesk or willing to migrate

**Approval Process:**
1. Submit product onboarding request
2. Committee reviews fit against criteria
3. Vote (unanimous required)
4. If approved: Schedule 5-week onboarding
5. If rejected: Document reasons, revisit later

### Knowledge Base Management

**Ownership:**
- Each product's support lead owns KB
- Must update quarterly or when features change
- Tested before deployment

**Review Cycle:**
- Quarterly: Support lead reviews and updates
- Monthly: AI engineers test KB accuracy
- Annually: Full audit and refresh

**Testing KB with Agent:**
1. Create test conversation
2. Agent references specific KB sections
3. Verify accuracy and relevance
4. Check for outdated information
5. Update before deploying to production

### Configuration Change Management

**Process for Config Changes:**
1. Support lead proposes change (new endpoint, voice profile, etc.)
2. Create pull request with config change
3. Code review by AI engineering lead
4. Test in sandbox environment
5. Merge to main branch
6. Auto-deploy to ElevenLabs agent
7. Monitor metrics for 24 hours

**Rollback:**
- If issues detected: Auto-rollback to previous version
- Timeline: 5 minutes to detect, 2 minutes to rollback
- Alert: Notify team of rollback

---

## 13. MONITORING & OPTIMIZATION

### Key Metrics Per Product

| Metric | Target | Warning | Critical |
|--------|--------|---------|----------|
| Call success rate | 95%+ | < 95% | < 90% |
| Avg handle time | < 10 min | > 12 min | > 15 min |
| Escalation rate | 30-40% | > 50% | > 60% |
| First call resolution | 60%+ | < 50% | < 40% |
| Agent availability | 99%+ | < 99% | < 95% |
| SIP connectivity | 99.9%+ | 99% | < 99% |
| Customer satisfaction | 4.5+/5 | < 4.2 | < 4.0 |

### Dashboard

**Real-Time View:**
- Active calls per product
- Queue depth
- Average wait time
- Agent availability
- System health

**Historical View:**
- Calls per day/week/month
- Trend lines (escalation rate, handle time)
- Comparison across products
- Quality metrics

### Optimization Process

**Monthly:**
1. Review metrics for each product
2. Identify top 3 issues
3. Update KB with solutions
4. Refine troubleshooting flows
5. Adjust voice personality if needed

**Quarterly:**
1. Major KB refresh
2. API performance review
3. Cost optimization review
4. Feature parity audit
5. Support team feedback session

---

## 14. SECURITY & COMPLIANCE

### Multi-Product Security

**Isolation:**
- Each agent isolated in ElevenLabs
- Separate API keys per product
- Separate Zendesk spaces
- Product data never crosses boundaries

**Authentication:**
- API keys per product (not shared)
- Token refresh every 24 hours
- Credential rotation every 90 days
- Customer verification always required

**Audit Logging:**
- All API calls logged (product, endpoint, result)
- Zendesk audit trail (all ticket changes)
- Call recordings retained 5 years (DCAA min)
- Access logs reviewed quarterly

**Compliance:**
- Each product maintains its own compliance posture
- HTS: DCAA compliance mandatory
- Others: As required by product/industry
- No cross-product compliance issues

---

## 15. DEPLOYMENT CHECKLIST FOR MULTI-PRODUCT

**Phase 1: HourTimesheet (Already Done)**
- [x] ElevenLabs agent deployed
- [x] Knowledge base written
- [x] APIs integrated
- [x] Zendesk integration
- [x] Phone integration
- [x] Monitoring & alerting

**Phase 2: Minute7 (Ready to Onboard)**
- [ ] Minute7 KB written
- [ ] M7 config created
- [ ] M7 APIs documented
- [ ] Zendesk space created
- [ ] Phone number ported
- [ ] SIP trunk configured
- [ ] ElevenLabs agent created
- [ ] End-to-end testing
- [ ] Support team trained
- [ ] Pilot launch

**Phase 3: GoodHelp (Future)**
- [ ] GoodHelp KB written
- [ ] GH config created
- [ ] GH APIs documented
- [ ] Zendesk space created
- [ ] Phone number provisioned
- [ ] SIP trunk configured
- [ ] ElevenLabs agent created
- [ ] End-to-end testing
- [ ] Support team trained
- [ ] Pilot launch

**Shared Infrastructure (One-Time)**
- [x] ElevenLabs enterprise account
- [x] Twilio account setup
- [x] Zendesk primary instance
- [x] Monitoring & dashboards
- [x] SIP routing logic
- [x] Call recording storage
- [x] Transcription service
- [x] Escalation workflows

---

## 16. REFERENCES & DOCUMENTATION

**Related Issues:**
- Issue #92: Knowledge Base (HourTimesheet)
- Issue #95: Zendesk Integration
- Issue #96: Phone/SIP Integration
- Issue #98: API Integration Plan
- Issue #101: Architecture Generalization (this document)

**External References:**
- ElevenLabs Documentation: https://docs.elevenlabs.io
- Twilio Voice Documentation: https://www.twilio.com/docs/voice
- Zendesk Documentation: https://support.zendesk.com
- SIP RFC 3261: https://tools.ietf.org/html/rfc3261

**Internal Resources:**
- Product Knowledge Bases (per product)
- Configuration Files (per product)
- Troubleshooting Runbooks (per product)
- Deployment Procedures (shared)
- Monitoring Dashboards (shared)

---

## 17. FUTURE ENHANCEMENTS

**Phase 2 (Q2 2026):**
- Implement Minute7 support agent
- Add real-time sentiment analysis
- Enhance knowledge base with video tutorials
- Deploy A/B testing framework

**Phase 3 (Q3 2026):**
- Implement GoodHelp support agent
- Add proactive outreach (email follow-ups)
- Implement advanced routing (skill-based)
- Add multilingual support

**Phase 4 (Q4 2026+):**
- Extend to additional LMNTL products
- Implement AI-powered knowledge base updates
- Add predictive issue detection
- Develop customer self-service portal integration

---

## 18. CONCLUSION

This architecture provides a scalable, cost-effective framework for deploying AI support agents across multiple LMNTL products. By abstracting product-specific knowledge into swappable components while leveraging shared infrastructure, we can:

1. **Reduce costs** by 40-50% per product (shared platform)
2. **Accelerate deployment** (5 weeks vs. 12 weeks for standalone)
3. **Ensure consistency** across products (shared best practices)
4. **Enable optimization** (shared monitoring and learning)
5. **Support growth** (easy to add new products)

The generalized architecture is ready for implementation starting with Minute7 in Phase 2, with GoodHelp following in Phase 3.

