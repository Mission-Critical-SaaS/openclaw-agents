# HourTimesheet Phone/SIP Integration Specification

**Issue #96** | Last updated: 2026-03-19

Technical specification for phone and SIP integration enabling the HourTimesheet support number (1-888-780-9961) to route to ElevenLabs AI agent with proper escalation and compliance.

---

## 1. INTEGRATION OVERVIEW

### Business Requirements
- Route existing HourTimesheet support line (1-888-780-9961) to ElevenLabs AI agent
- Offer automated support 24/7 (no weekday-only limitation)
- Enable seamless escalation to human support
- Record all calls for compliance and training
- Collect customer consent for recording
- Manage voicemail for after-hours calls

### Architecture
```
Incoming Call
    ↓
Phone Provider (Twilio/Telnyx)
    ↓
SIP Trunk to ElevenLabs
    ↓
ElevenLabs Voice Agent
    ├─ [Call Handled]
    │   ↓
    │   Call Recording
    │   Call Transcription
    │   Zendesk Ticket (if escalated)
    │
    └─ [Press 0 for Human]
        ↓
        Escalation Queue
        ↓
        Transfer to Human Support (via Zendesk/Twilio)
```

### Key Numbers
- **Support Line:** 1-888-780-9961 (existing)
- **Monthly Volume:** ~500-800 calls/month (estimated)
- **AI Handling Rate:** 60-70% expected (after optimization)
- **Peak Hours:** 9 AM - 5 PM EST, Mon-Fri

---

## 2. PRIMARY PROVIDER: TWILIO

### Overview

Twilio is the recommended provider because:
- Native integration with ElevenLabs voice agents
- Full SIP trunk support
- Excellent call recording and transcription
- Flexible IVR/call handling
- Strong reliability (99.95% uptime SLA)
- Mature API for integration

### Twilio Setup

#### 2.1 Create Twilio Account

**Steps:**
1. Go to twilio.com
2. Sign up for new account (Business verified account recommended)
3. Verify email and phone number
4. Choose product: "Voice"
5. Get first Twilio phone number (temporary, will replace with existing 888 number)

**Account Requirements:**
- Business verification (name, address, tax ID)
- Phone number verification (account owner's phone)
- Payment method on file
- Legal agreement acceptance

**Initial Phone Number:**
- Assigned automatically (e.g., +1-xxx-xxx-xxxx)
- Used for testing during setup
- Can be released after porting existing number

#### 2.2 Port Existing Number

**Goal:** Replace Twilio's temp number with existing 1-888-780-9961

**Porting Process:**
1. In Twilio Console: Phone Numbers → Manage Numbers → Port Numbers
2. Click "Port a Number to Twilio"
3. Select carrier of origin (contact current provider)
4. Provide LOA (Letter of Authorization)
5. Port typically takes 5-10 business days
6. During port: continue using old number until port complete
7. After port complete: update all references to Twilio number

**Current Provider Info:**
- Contact: [whoever manages 1-888-780-9961]
- Account number: [from current provider]
- PIN/verification code: [may be needed]

**During Port Window:**
- Old carrier: still handling calls
- New carrier (Twilio): gets copy of calls via call forwarding (if configured)
- Post-port: Twilio owns and routes the number

**Cost:**
- Port fee: ~$50-100 one-time
- Monthly: See pricing section below

#### 2.3 Create SIP Trunk

**SIP Trunk Setup:**
1. Twilio Console: Voice → SIP Trunks
2. Click "Create a new SIP Trunk"
3. Name: "HourTimesheet-ElevenLabs"
4. Copy SIP connection URI
5. Create SIP credential (username/password)
   - These credentials enable external SIP connection

**SIP Trunk Details:**
```
URI: sip.us1.twilio.com
Username: [auto-generated]
Password: [auto-generated - save securely]
Connection Type: Inbound SIP calls
Authentication: Yes
```

#### 2.4 Configure Routing Rules

**Inbound Rule:**
1. Voice → SIP Trunks → [Your trunk]
2. Click "Origination URL"
3. Set: sip.elevenlabs.com:[port] (ElevenLabs provides exact endpoint)
4. Authentication: Use SIP credentials from step 3 above
5. Test connection: Twilio → ElevenLabs

**Outbound Rule (for escalation):**
1. Voice → SIP Trunks → [Your trunk]
2. Click "Termination URL"
3. Set: [ElevenLabs endpoint or direct human queue]
4. When ElevenLabs agent presses "transfer", route to this

**Failover:**
1. If ElevenLabs connection fails, route to voicemail/IVR
2. Primary: ElevenLabs endpoint
3. Fallback: Twilio IVR or voicemail

#### 2.5 Create Incoming Phone Number Routing

**Route 1-888-780-9961 to SIP Trunk:**
1. Voice → Manage Numbers → Active Numbers
2. Select or search for 1-888-780-9961
3. Incoming Voice Calls: Select "SIP Trunk"
4. SIP Trunk: [select HourTimesheet-ElevenLabs from step 3]
5. Save

**Test:**
1. Call 1-888-780-9961 from any phone
2. Should connect to ElevenLabs system
3. Verify call appears in both Twilio and ElevenLabs logs

---

## 3. CALL FLOW: GREETING → AI HANDLING → ESCALATION

### Complete Call Flow

```
Customer calls 1-888-780-9961
    ↓
Twilio receives call (< 1 second)
    ↓
Route via SIP trunk to ElevenLabs
    ↓
ElevenLabs agent answers
    ↓
"Hello, thanks for calling HourTimesheet support.
 This call may be recorded for quality and training.
 Do you consent? Press 1 for yes, 2 for no."
    ↓
[Consent Collection]
    ├─ Press 1 (yes)
    │   ↓
    │   Enable recording
    │   Proceed with call
    │   ("How can I help you today?")
    │
    └─ Press 2 (no)
        ↓
        "We cannot assist without recording.
         Please call back to continue.
         Goodbye." [hangup]
    ↓
Customer describes issue
    ↓
ElevenLabs AI troubleshoots
    ↓
[Resolved?]
├─ Yes
│   ↓
│   Summarize solution
│   Offer to email summary
│   "Thank you for calling. Goodbye."
│   [hangup, end recording]
│
└─ No / Escalation Requested
    ↓
    "I'll connect you with a member of our team.
     Please hold while I find someone available."
    ↓
    [AI Presses "0" or similar]
    ↓
    Create Zendesk ticket with call transcript
    ↓
    Queue to human support (Zendesk routing)
    ↓
    [Hold music plays]
    ↓
    Human agent available
    ↓
    Transfer call to human
    ↓
    Human completes support
    ↓
    [hangup, end recording]
```

### Greeting Audio

**Record Professional Greeting:**

Script:
```
"Hello, and thank you for calling HourTimesheet support.
This call may be recorded for quality assurance and training purposes.
Do you consent to recording? Press 1 for yes, or 2 for no."
```

**Specs:**
- Format: MP3, WAV, or Mu-law
- Bitrate: 64 kbps minimum
- Duration: ~8 seconds
- Professional voice (male or female, neutral tone)
- Background noise: minimal
- Pronunciation: clear, moderate pace

**Recording Options:**
- Use professional voice actor ($200-500)
- Use HourTimesheet employee (free)
- Use text-to-speech synthesis (AWS Polly, Google TTS)
- ElevenLabs has built-in TTS if using their agent

### Consent Collection (IVR)

**Implementation:**
1. Play consent message
2. Listen for DTMF (dual-tone multi-frequency) input
3. Accept: 1 (yes), 2 (no)
4. Timeout: 10 seconds → default to "no" (conservative)

**DTMF Configuration:**
- Twilio: Automatically detects DTMF from caller
- ElevenLabs: Receives DTMF events via SIP
- Store consent response: Log with call metadata

**Consent Logging:**
- Record: Yes/No
- Timestamp: when consent given
- Call ID: unique call identifier
- Used for compliance audits

### Escalation Triggers

Escalate to human when:
1. Customer presses "0" during call
2. AI determines issue requires human expertise
3. AI unable to resolve after troubleshooting
4. Customer requests human agent explicitly
5. Call duration > 15 minutes (safety valve)
6. AI confidence level too low (< 60%)

### Escalation Process

**Step 1: Announce Escalation**
```
"I understand. Let me connect you with one of our
support specialists. This may take a moment."
```

**Step 2: Create Support Ticket**
- Call AI function: zendesk_create_ticket()
- Include call transcript up to escalation point
- Set priority based on issue severity
- Assign to support team
- Tag: "phone-escalation", "live-agent"

**Step 3: Queue to Support**
- Option A: Twilio to Zendesk integration (if configured)
- Option B: ElevenLabs transfer endpoint → support queue
- Hold time: 30 seconds to 2 minutes typical
- Max queue depth: 5 callers (queue others → voicemail)

**Step 4: Transfer to Human**
- ElevenLabs transfers call to human agent
- Call remains recorded
- Zendesk ticket displayed to human
- Previous conversation context available

**Step 5: Complete Interaction**
- Human agent handles issue
- Adds notes to Zendesk ticket
- Closes ticket or schedules follow-up
- Call ends naturally or customer disconnects

---

## 4. CALL RECORDING & TRANSCRIPTION

### Recording Setup

**Twilio Recording (Recommended):**

**Enable Recording:**
1. Voice → Call Recording
2. Choose: "Record all inbound calls"
3. Recording Direction: "Both parties"
4. Storage: Twilio Cloud Storage
5. Retention: 30 days (then auto-delete)

**Twilio Recording Configuration:**
```
Recording Parameters:
- Format: MP3 (compressed) or WAV (full quality)
- Sample Rate: 8 kHz (telephony) or 16 kHz (higher quality)
- Bitrate: 32-64 kbps (MP3)
- Mono: Yes (saves storage)
```

**Storage Options:**
1. **Twilio Cloud:** Built-in, ~$0.0075 per minute
   - Auto-delete after 30 days
   - Access via Twilio API
   - Most convenient

2. **AWS S3:** External storage, cheaper long-term
   - Manual setup required
   - Twilio writes directly to S3 bucket
   - ~$0.023 per GB/month (S3 pricing)
   - 365-day retention possible

3. **Zendesk:** Store in Zendesk attachment
   - Manual upload required
   - Integrated with ticket
   - Limited by storage quota

**Recommended:** Twilio Cloud for first 30 days, then archive to S3 for compliance

### Transcription Service

**ElevenLabs Built-in Transcription:**
- Transcribe call audio automatically
- Return transcript to ElevenLabs agent
- Store transcript in conversation context
- Availability: Post-call (not real-time)
- Accuracy: ~95% for clear audio

**Twilio Transcription:**
- Use Twilio + AWS Transcribe integration
- Automatic transcription of recorded calls
- $0.0001 per second of audio
- Accuracy: ~90%
- Return time: 5-10 minutes post-call

**Google Cloud Speech-to-Text:**
- Via Twilio integration
- Accuracy: ~95%
- Cost: $0.006 per 15 seconds
- Real-time or post-processing available

**Recommended Flow:**
1. Twilio records call (MP3)
2. ElevenLabs agent gets transcript immediately (built-in TTS)
3. Use Twilio transcript for compliance archival (cheaper)
4. Store both in Zendesk ticket if escalated
5. Retain transcripts 5 years for DCAA

### Compliance & Data Retention

**Consent Requirement:**
- All calls must have recorded consent
- Consent logged with call metadata
- Calls without consent: mark "not recorded"
- Non-consent calls: don't process as recorded calls

**Retention Policy:**
- Calls recorded with consent: 5 years (DCAA requirement)
- Transcripts: 5 years
- Metadata (call ID, duration, timestamp): 7 years
- Consent responses: 7 years (legal hold)

**Access Controls:**
- Only support staff can access recordings
- Compliance team can audit access logs
- No public sharing of recordings
- No sharing with third parties without explicit consent

**Data Security:**
- Encryption in transit (HTTPS/TLS)
- Encryption at rest (AES-256 if using S3)
- Audit logging of access
- Backup and disaster recovery
- GDPR compliance (if EU customers)

---

## 5. AFTER-HOURS VOICEMAIL CONFIGURATION

### Business Hours

**Definition:**
- Monday-Friday: 8 AM - 6 PM EST (when human support available)
- Saturday-Sunday: Closed
- Holidays: Closed (see holiday list)

**Timezone Handling:**
- All times are EST
- Daylight Saving Time: Automatic (US rules)
- Customers in other zones: Inform about EST

### After-Hours Menu

**IVR When Closed:**
```
"Thank you for calling HourTimesheet support.
Our office is currently closed.
Our support hours are Monday through Friday,
8 AM to 6 PM Eastern Time.

To leave a voicemail, press 1.
To hear our hours and contact info, press 2.
To reach us by email, press 3."
```

**DTMF Options:**
- 1: Record voicemail
- 2: Repeat hours and contact info
- 3: Play email address (support@hourtimesheet.com)

### Voicemail Recording

**Configuration:**
1. Twilio: Create IVR with voicemail
2. Prompt: "Please leave a message after the tone. Hang up when done, or press # to finish."
3. Max length: 3 minutes
4. Greeting: Custom (recorded above)
5. Store voicemail: Twilio cloud or S3

**Voicemail Processing:**
- Voicemail transcribed automatically
- Transcription emailed to support team
- Email subject: "Voicemail from [caller phone]"
- Email body: Transcription + audio attachment
- Support team: Listens and responds next business day

**Voicemail Email Setup:**
1. Twilio console: Phone Numbers → [Your number]
2. Voicemail: Enable voicemail-to-email
3. Email address: support@hourtimesheet.com
4. Transcription: Enable
5. Include recording: Yes

### Holiday Schedule

**Closed Dates (2026):**
- January 1: New Year's Day
- January 19: MLK Jr. Day
- February 16: Presidents Day
- March 29: Easter Sunday
- May 25: Memorial Day
- June 19: Juneteenth
- July 4: Independence Day
- September 7: Labor Day
- November 26-27: Thanksgiving
- December 25: Christmas

**Configuration:**
- Pre-record holiday message: "We're closed for [holiday]. We'll respond first business day."
- Set active voicemail route on holidays
- Resume normal routing next business day

### Call Queuing (During Hours)

**Queue Configuration:**
If human support queue is full during business hours:
```
1. Check available agents
2. If < 2 agents available: Queue caller
3. Queue depth: Max 5 callers
4. If queue full: Route to voicemail instead
5. Voicemail: Support responds next business day
```

**Queue Management:**
- Max hold time: 5 minutes
- Hold music: Professional or branded
- Position announcements: Every 30 seconds
- Periodic "thanks for holding" messages

---

## 6. ALTERNATIVE PROVIDER: TELNYX

### Overview

Telnyx provides an alternative if Twilio unavailable or for redundancy:
- Competitive pricing
- Full SIP support
- Direct routing to ElevenLabs
- Global infrastructure

### Telnyx Setup

#### 6.1 Telnyx Account Creation

**Steps:**
1. Go to telnyx.com
2. Sign up for account
3. Complete business verification
4. Add payment method
5. Create first project

**Telnyx Project:**
- Name: "HourTimesheet-Voice"
- Type: "Voice API"
- Region: US East (for lowest latency)

#### 6.2 SIP Trunk Configuration

**Create SIP Connection:**
1. Telnyx Console: Voice → SIP Connections
2. Click "Create New Connection"
3. Name: "HourTimesheet-ElevenLabs"
4. Inbound: Enable
5. Outbound: Enable

**Connection Parameters:**
```
Protocol: SIP (TLS for security)
Inbound Address: sip.telnyx.com
Inbound Port: 5061 (TLS) or 5060 (non-TLS)
Outbound Address: [ElevenLabs SIP endpoint]
Outbound Port: [ElevenLabs port, typically 5060]
Authentication: Username + Password
```

**Credentials:**
- SIP Username: [auto-generated or custom]
- SIP Password: [strong, 16+ characters]
- Store securely in ElevenLabs config

#### 6.3 Phone Number Configuration

**Option 1: Bring Your Own Number (BYOC)**
- Port 1-888-780-9961 to Telnyx
- Similar process to Twilio
- Port fee: ~$50
- Timeline: 5-10 business days

**Option 2: Use Telnyx Virtual Number**
- Order new Telnyx number in same area code
- Use as backup to Twilio
- Update callers if Twilio fails

**Recommended:** Keep Twilio as primary, Telnyx as failover

#### 6.4 Routing Configuration

**Inbound Route:**
1. Routing → Inbound Routes
2. Create new route for 1-888-780-9961 (or Telnyx-assigned number)
3. Route type: "SIP Connection"
4. Connection: [HourTimesheet-ElevenLabs]
5. SIP Address: sip.elevenlabs.com:[port]
6. Authentication: Use SIP credentials

**Failover Setup:**
1. Primary: Twilio
2. Fallback: Telnyx (if Twilio unavailable)
3. Implementation: ElevenLabs detects provider failure, switches endpoint

### Telnyx Call Recording

**Recording Configuration:**
1. Telnyx Console: Calls → Call Recording
2. Enable: "Record all inbound calls"
3. Recording format: MP3 or WAV
4. Storage: Telnyx cloud (~$0.003 per minute)
5. Retention: 30 days

**Webhook for Recording Completion:**
```
When call recording finishes, Telnyx sends webhook:
POST https://[your-webhook-url]
{
  "data": {
    "record_type": "recording_saved",
    "record": {
      "recording_id": "rec_123456",
      "call_id": "call_987654",
      "duration": 342,
      "recording_url": "https://s3.telnyx.com/...",
      "audio_url": "https://telnyx.com/media/..."
    }
  }
}
```

**Process:**
1. Receive webhook with recording_url
2. Download and transcribe
3. Store in Zendesk ticket
4. Delete from Telnyx after 30 days

### Telnyx Failover Strategy

**Monitoring:**
- Check both Twilio and Telnyx availability hourly
- Alert if either goes down
- Automatic failover if Twilio SIP connection fails

**Manual Failover:**
1. If Twilio down: Update ElevenLabs SIP endpoint to Telnyx
2. Update DNS/SIP routing rules
3. Notify support team
4. Test incoming call
5. Monitor Twilio restoration

**Cost Comparison:**

| Provider | Setup | Monthly | Per-Min Calls | Recording | Recording Storage |
|----------|-------|---------|---------------|-----------|------------------|
| **Twilio** | $50-100 | $1 | $0.0085 | $0.0075 | Included 30d |
| **Telnyx** | $50-100 | $0 | $0.0040 | $0.003 | $0.012/GB/mo |

**Estimated Monthly Cost (500 calls, 10 min avg):**
- Twilio: $1 + (500 × 10 × $0.0085) = ~$43
- Telnyx: $0 + (500 × 10 × $0.0040) = ~$20

---

## 7. ESCALATION: TRANSFER TO HUMAN SUPPORT

### Escalation Queue Architecture

**Call Flow:**
```
ElevenLabs Agent
    ↓
[Escalation triggered]
    ↓
Create Zendesk Ticket
    ↓
Push Notification to Support Team
    ↓
ElevenLabs: "Transferring to next available agent..."
    ↓
[Hold queue]
    ↓
Human Agent Available
    ↓
Answer Call (already connected)
    ↓
Zendesk Ticket displayed on agent's screen
    ↓
Conversation history in ticket
    ↓
Agent handles issue
```

### Escalation Via Zendesk

**Configuration:**
1. Zendesk Voice: Enable phone integration
2. Create call queue: "HourTimesheet-Phone-Queue"
3. Queue settings:
   - Max wait time: 5 minutes
   - Fallback: Voicemail
   - Queue depth: 5 active, unlimited queued
   - Priority: By issue severity (use Zendesk priority field)

**Agent Setup:**
- Designate 3-5 agents for phone support
- Assign to "HourTimesheet-Phone-Queue"
- Soft phone: Zendesk Voice or Twilio VoIP SDK
- Desktop client: Show pending Zendesk ticket

**Ticket Routing:**
1. AI creates ticket: `tags=["phone-escalation"]`
2. Zendesk filters: Route to HourTimesheet-Phone-Queue
3. Queue rules: First available agent
4. Agent alerts: Bell icon + notification sound
5. Agent accepts: Call transfers automatically

### Escalation Via Direct SIP Transfer

**Alternative Method:**
If Zendesk integration unavailable:

**Configuration:**
1. ElevenLabs: Transfer capability via REFER (SIP REFER method)
2. Transfer target: sip.supportqueue@company.com (your SIP server)
3. Your SIP server: Routes to available human

**Pros:**
- Simpler integration
- Faster transfer (<2 seconds)
- Direct SIP-to-SIP handoff

**Cons:**
- Requires SIP server management
- More technical setup
- Harder to scale

**Recommended:** Use Zendesk queue (more features)

### Hold Music & Announcements

**Hold Music:**
- Duration: Full call, or until agent answers
- Music: Royalty-free or licensed
- Volume: ~-18 dB (doesn't startle)
- Format: MP3, WAV
- Filename: hold-music.mp3

**Recording Hold Music:**
```
Options:
1. Free: Creative Commons music (YouTube Audio Library)
2. Licensed: Epidemic Sound, Artlist (~$15/month)
3. Branded: Custom recording with company voice
4. Professional: Hire composer (expensive but high quality)
```

**Announcements:**
Every 30 seconds of hold:
```
"Thank you for your patience. An agent will be with you shortly."
```

**Technical Setup:**
1. Upload hold music to Twilio Media Storage
2. Configure: Voice → Hold Music
3. Loop: Yes (repeat until answered)
4. Announcement: Every 30 seconds

---

## 8. COST ESTIMATES

### Twilio Costs (Monthly, 500 calls)

**Assumptions:**
- 500 inbound calls/month
- Average duration: 10 minutes per call
- 60% handled by AI, 40% escalated to human
- Recording all calls
- No international calls

**Breakdown:**

| Item | Qty | Rate | Cost |
|------|-----|------|------|
| Phone number (1-888) | 1 | $1.00 | $1.00 |
| Inbound calls | 500 | $0.0085 | $4.25 |
| Call minutes | 5,000 | $0.0085 | $42.50 |
| Call recording | 5,000 min | $0.0075 | $37.50 |
| Transcription (opt) | 5,000 min | $0.00375 | $18.75 |
| SIP trunk | 1 | $25.00 | $25.00 |
| Storage (S3, optional) | 1 GB | $0.023 | $0.02 |
| **Total** | | | **~$129** |

**Annual Cost:** ~$1,550

### Zendesk Voice Add-on

If integrating Zendesk Voice (optional):
- Zendesk phone add-on: $50/agent/month
- Recommended: 3-5 agents for phone support
- Cost: $150-250/month additional

### ElevenLabs Costs

Covered under ElevenLabs agent pricing (separate contract)

### Total Estimated Monthly Cost

- **Twilio + recording + transcription:** $129
- **Zendesk Voice (3 agents):** $150
- **ElevenLabs agent:** [Per your contract]
- **Total:** $279 + ElevenLabs agent cost

---

## 9. TESTING PLAN

### Test 1: Basic Call Routing

**Objective:** Verify call reaches ElevenLabs agent

**Setup:**
- Twilio SIP trunk configured
- ElevenLabs agent active
- Test phone ready

**Steps:**
1. Call 1-888-780-9961 from test phone
2. Call should ring through to ElevenLabs
3. Verify call appears in Twilio logs
4. Verify call appears in ElevenLabs logs
5. Verify agent greeting plays

**Expected Result:**
- Call connects within 3 seconds
- Professional greeting plays
- Audio quality acceptable (clear, no lag)

### Test 2: Consent Collection

**Objective:** Verify consent collection works

**Setup:**
- Call routed to IVR/agent
- Consent prompt configured

**Steps:**
1. Call 1-888-780-9961
2. Listen for consent prompt
3. Press 1 for yes (consent given)
4. Verify consent recorded in logs
5. Call second time and press 2 (no consent)
6. Verify hangup message plays
7. Check logs show consent rejection

**Expected Result:**
- DTMF input detected correctly
- Consent logged with timestamp
- System behavior matches consent (record if yes, don't if no)

### Test 3: AI Call Handling

**Objective:** Verify AI can troubleshoot and resolve

**Setup:**
- AI agent operational
- Sample issue: Mobile app sync problem

**Steps:**
1. Call 1-888-780-9961
2. When prompted, say "I can't sync my mobile app"
3. AI should:
   - Repeat back the problem
   - Ask clarifying questions
   - Provide troubleshooting steps
   - Confirm resolution
4. Call should end naturally

**Expected Result:**
- AI understands the issue
- AI provides relevant troubleshooting
- Audio quality throughout call is clear
- Call duration 3-5 minutes typical

### Test 4: Escalation to Human

**Objective:** Verify escalation workflow

**Setup:**
- Zendesk ticket system ready
- Support agent available
- Escalation triggers configured

**Steps:**
1. Call 1-888-780-9961
2. When prompted, say "I want to talk to a human"
3. Verify AI says "Transferring to next available agent..."
4. Verify:
   - Zendesk ticket created
   - Ticket contains call transcript
   - Agent receives alert
5. Support agent answers
6. Verify call transfers successfully
7. Agent can see Zendesk ticket with context
8. Agent completes support interaction

**Expected Result:**
- Escalation completes in < 30 seconds
- Ticket created with relevant details
- Agent has conversation context
- Call transfer seamless (no dead air)

### Test 5: Call Recording & Transcription

**Objective:** Verify recording and transcription

**Setup:**
- Recording enabled
- Transcription service active

**Steps:**
1. Call 1-888-780-9961
2. Have ~2 minute conversation
3. Hang up
4. Wait 5-10 minutes for transcription
5. Check Twilio dashboard for recording
6. Check ElevenLabs for transcript
7. Verify:
   - Recording audio quality clear
   - Transcription ~95% accurate
   - Both stored securely

**Expected Result:**
- Recording file created (MP3, ~100KB)
- Transcript available within 10 minutes
- Transcription contains conversation details
- Both securely stored

### Test 6: After-Hours Voicemail

**Objective:** Verify after-hours voicemail flow

**Setup:**
- After-hours time window (or manually set system to after-hours)
- Voicemail-to-email configured

**Steps:**
1. Call 1-888-780-9961 during after-hours
2. Verify after-hours greeting plays
3. Press 1 to leave voicemail
4. Record test message: "This is a test voicemail"
5. Hang up
6. Wait 5 minutes
7. Check support@hourtimesheet.com for email
8. Verify:
   - Voicemail transcription accurate
   - Audio attachment present
   - Email formatted clearly

**Expected Result:**
- After-hours greeting clear
- Voicemail accepted and processed
- Email with transcription received
- Support team can listen and respond

### Test 7: Load Testing

**Objective:** Verify system handles multiple concurrent calls

**Setup:**
- Simulate 5 concurrent calls
- Load testing tools: Call generator or test team

**Steps:**
1. Simulate 5 calls to 1-888-780-9961 simultaneously
2. Monitor:
   - Call success rate (target: 100%)
   - Call routing latency (target: <3 sec)
   - ElevenLabs agent concurrency
   - Zendesk queue depth
   - System errors (target: 0)
3. Escalate 3 of 5 calls
4. Verify human queue handles escalations
5. Monitor hold times (target: <2 min)

**Expected Result:**
- All calls connect successfully
- No dropped calls
- Escalation queue handles load
- Audio quality maintained
- No system errors

---

## 10. MONITORING & ALERTING

### Key Metrics

**Call Metrics:**
- Inbound calls per day
- Average call duration
- Call success rate (connected vs. failed)
- Escalation rate (AI→human)
- Average hold time in queue

**Quality Metrics:**
- Audio quality (clarity, latency)
- Transcription accuracy (target: 95%+)
- Agent response time (target: <5 min during hours)
- Customer satisfaction (post-call survey)

**System Metrics:**
- SIP trunk availability (target: 99.9%)
- Recording success rate (target: 100%)
- Zendesk ticket creation success (target: 100%)
- Error rates by type

### Alerting Thresholds

| Metric | Threshold | Action |
|--------|-----------|--------|
| Call success rate | < 95% | Page on-call engineer |
| SIP trunk down | Any downtime | Critical alert |
| Recording failures | > 5% | Alert support lead |
| Agent response time | > 10 min | Check queue depth |
| Escalation rate | > 60% | Review AI performance |
| Transcription accuracy | < 90% | Check audio quality |

### Dashboard (Recommended: Datadog or New Relic)

**Display:**
- Calls today (total, AI-handled, escalated)
- Current queue depth
- Average handle time
- Agent availability
- System health indicators
- Errors in last 24 hours

---

## 11. DISASTER RECOVERY & FAILOVER

### Failure Scenarios

**Scenario 1: Twilio Down**
- Impact: No calls route to ElevenLabs
- Detection: Inbound calls fail to connect
- Recovery: Switch to Telnyx (manual or automatic)
- Time: 5-10 minutes (manual), <1 minute (automatic)
- Fallback: Automatic voicemail if failover not configured

**Scenario 2: ElevenLabs Agent Down**
- Impact: AI cannot respond to calls
- Detection: Agent unavailable in ElevenLabs dashboard
- Recovery: Route to IVR → voicemail
- Time: <1 minute (automatic)
- Escalation: Support team responds to voicemail

**Scenario 3: Internet/Network Outage at HourTimesheet**
- Impact: Cannot reach Zendesk, may not receive escalation calls
- Detection: Monitoring system offline
- Recovery: Restore network connectivity
- Fallback: Phone system operates independently during outage

**Scenario 4: SIP Connection Failure**
- Impact: Calls may not route correctly
- Detection: Calls fail or route to wrong endpoint
- Recovery: Restart SIP trunk, check credentials
- Fallback: Manual call forwarding to Zendesk queue

### Failover Configuration

**Active-Active (Recommended):**
```
Inbound Call
    ↓
[Try Twilio SIP → ElevenLabs]
    ├─ Success → Proceed
    │
    └─ Timeout (3 sec)
        ↓
        [Try Telnyx SIP → ElevenLabs]
            ├─ Success → Proceed
            │
            └─ Timeout (3 sec)
                ↓
                [Route to Voicemail IVR]
```

**Implementation:**
- Twilio: Primary SIP trunk
- Telnyx: Failover SIP trunk (standby)
- ElevenLabs: Monitor both trunks
- Automatic failover: ~3 second delay

**Manual Override:**
- Admin dashboard to manually select provider
- For planned maintenance or emergency

---

## 12. DEPLOYMENT CHECKLIST

**Pre-Launch:**
- [ ] Twilio account created and verified
- [ ] 1-888-780-9961 ported to Twilio (or using Twilio number)
- [ ] SIP trunk configured and tested
- [ ] ElevenLabs agent deployed and operational
- [ ] Call recording enabled and tested
- [ ] Transcription service configured
- [ ] After-hours voicemail setup complete
- [ ] Hold music uploaded
- [ ] Zendesk phone queue configured
- [ ] Support agents trained on phone workflow
- [ ] Load testing completed
- [ ] Disaster recovery tested
- [ ] Monitoring and alerting configured
- [ ] Documentation reviewed with team
- [ ] Legal review of consent recording
- [ ] IT sign-off for network changes

**Launch:**
- [ ] Enable recording consent IVR
- [ ] Route number to Twilio
- [ ] Monitor calls for 24 hours
- [ ] Support team on standby
- [ ] Alert on-call engineer

**Post-Launch:**
- [ ] Monitor SLA metrics
- [ ] Gather customer feedback
- [ ] Optimize call routing rules
- [ ] Tune AI agent based on actual calls
- [ ] Review recordings for quality
- [ ] Update documentation based on learnings

---

## 13. CONFIGURATION SUMMARY

### Twilio Settings
- **Phone Number:** 1-888-780-9961 (after porting)
- **SIP Trunk:** HourTimesheet-ElevenLabs
- **Inbound Route:** SIP trunk → ElevenLabs endpoint
- **Recording:** Enabled, MP3, 30-day retention
- **Transcription:** Enabled (Twilio transcribe)
- **Failover:** Telnyx (manual switch)
- **Region:** US East (lowest latency)

### ElevenLabs Configuration
- **SIP Endpoint:** sip.elevenlabs.com:[port]
- **Auth:** Use Twilio SIP credentials
- **Recording:** Collect via ElevenLabs
- **Transcription:** Built-in, automatic
- **Escalation:** Via Zendesk ticket
- **Consent:** DTMF-based IVR

### Zendesk Configuration
- **Phone Queue:** HourTimesheet-Phone-Queue
- **Agents:** 3-5 dedicated
- **Tags:** phone-escalation, live-agent
- **Routing:** By availability, then skill-based
- **SLA:** 5 min first response (during hours)

---

## 14. REFERENCES

- **Twilio Docs:** https://www.twilio.com/docs/voice
- **ElevenLabs Docs:** https://docs.elevenlabs.io
- **Zendesk Voice:** https://support.zendesk.com/hc/en-us/articles/4415301389210
- **Telnyx Docs:** https://developers.telnyx.com/docs
- **SIP RFC 3261:** https://tools.ietf.org/html/rfc3261
- **Issue #96:** Phone/SIP Integration Specification
- **Related Issues:** #92 (Knowledge Base), #95 (Zendesk), #98 (API Plan)

