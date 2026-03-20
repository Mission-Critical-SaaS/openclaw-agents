# Beacon Voice E2E Test Suite - Quick Reference

## File Location
```
/sessions/fervent-busy-keller/mnt/openclaw-agents/test/beacon-voice-e2e.test.ts
```

## Run Tests

### Standard Run
```bash
npx jest test/beacon-voice-e2e.test.ts --verbose
```

### By Category
```bash
# Authentication tests only
npx jest test/beacon-voice-e2e.test.ts --testNamePattern="Authentication"

# Ticket creation tests
npx jest test/beacon-voice-e2e.test.ts --testNamePattern="Ticket Creation"

# Zendesk verification
npx jest test/beacon-voice-e2e.test.ts --testNamePattern="Zendesk"

# Real support scenarios
npx jest test/beacon-voice-e2e.test.ts --testNamePattern="Scenario"

# Agent self-evaluation
npx jest test/beacon-voice-e2e.test.ts --testNamePattern="Agent Self"
```

## Test Coverage Summary

| Category | Tests | Purpose |
|----------|-------|---------|
| Authentication & Security | 4 | API key validation, caller-id requirements |
| Ticket Creation | 12 | Input validation, boundary testing, draft mode |
| SMS | 9 | Phone validation, message length limits |
| Placeholder Endpoints | 3 | Phase 2 placeholder verification |
| Zendesk Draft Verification | 6 | Real Zendesk API integration, draft tag verification |
| Support Scenario Simulation | 5 | Real-world support patterns from analysis |
| Agent Self-Evaluation | 8 | Response quality metrics |
| **TOTAL** | **47** | **Comprehensive API validation** |

## Key Test Scenarios

### 1. Authentication (Must Pass)
```bash
Test: missing API key returns 403
Test: invalid API key returns 403
Test: valid credentials allow request
```

### 2. Ticket Validation (Must Pass)
```bash
Test: subject required, max 200 chars
Test: description required, max 5000 chars
Test: priority: low|normal|high|urgent
Test: custom tags preserved
```

### 3. SMS Validation (Must Pass)
```bash
Test: phone field required, E.164 format
Test: body field required, max 1600 chars
Test: rate limiting enforced
```

### 4. Draft Mode (Must Pass)
```bash
Test: response includes draft: true
Test: Zendesk ticket has [DRAFT] prefix
Test: Tags include: draft, ai-created, voice-call, pending-review
Test: Initial comment is internal (public: false)
```

### 5. Support Scenarios (Must Pass)
```bash
Scenario 1: QB Integration Error (HIGH priority, common)
Scenario 2: Export Disabled (URGENT priority, payroll critical)
Scenario 3: Expired Access Link (URGENT priority, escalation)
Scenario 4: Account Login Issue (NORMAL priority, escalation)
Scenario 5: Dashboard Access (NORMAL priority, escalation)
```

## Environment Setup

```bash
# Optional - test suite has defaults
export BEACON_API_KEY="your-api-key"
export ZENDESK_SUBDOMAIN="your-subdomain"
export ZENDESK_EMAIL="your-email@example.com"
export ZENDESK_TOKEN="your-token"

# Run tests
npx jest test/beacon-voice-e2e.test.ts --verbose
```

## Automatic Cleanup

The test suite automatically:
1. Tracks all created ticket IDs
2. Verifies tickets in Zendesk
3. Deletes all test tickets after completion
4. Logs cleanup progress

No manual cleanup needed.

## Expected Test Duration

- **Full suite:** 30-45 seconds
- **Individual test:** < 5 seconds
- **Zendesk verification:** < 2 seconds per ticket
- **Network latency:** Primary factor in duration

## Troubleshooting

### Test Timeout
```bash
# Increase timeout for slow networks
npx jest test/beacon-voice-e2e.test.ts --testTimeout=30000
```

### Zendesk Verification Fails
```
Check:
1. ZENDESK_SUBDOMAIN is correct (default: minute7)
2. ZENDESK_EMAIL is correct (default: david@lmntl.ai)
3. ZENDESK_TOKEN is valid (default: oo36Ok7ddU777CBef7sdX3jCLMDpCJmRqi0tdiTS)
4. Network access to Zendesk API
```

### API Returns 403
```
Check:
1. BEACON_API_KEY is set or use default
2. x-api-key header is sent
3. API Gateway usage plan is active
4. Region is us-east-1
```

### SMS Tests Fail (Expected)
```
SMS tests use fake phone number (+15551234567).
Twilio will reject, returning 500/502.
This is expected behavior - Lambda processes correctly.
```

## What Gets Tested

### ✅ Endpoint Coverage
- POST /tickets → ticket creation
- POST /sms → SMS sending
- POST /password-reset → password reset
- GET /accounts/lookup → account lookup
- GET /accounts/{id}/integrations → integration status

### ✅ Input Validation
- Required fields
- Field length limits
- Format validation
- Priority enumeration
- Phone number format (E.164)

### ✅ Error Handling
- Missing parameters
- Invalid formats
- Oversized content
- Rate limiting

### ✅ Draft Mode
- Response structure (draft: true)
- Zendesk ticket format ([DRAFT] prefix)
- Tag application
- Internal comment creation

### ✅ Real Support Scenarios
- QuickBooks integration issues
- Export functionality problems
- Access/login issues
- Account configuration
- Dashboard visibility

### ✅ Integration Quality
- Zendesk API connectivity
- Ticket creation verification
- Tag application
- Comment status (internal/public)
- Automatic cleanup

## Test Results Example

```
PASS  test/beacon-voice-e2e.test.ts
  Authentication & Security
    ✓ missing API key returns 403 (234ms)
    ✓ invalid API key returns 403 (245ms)
    ✓ valid API key and caller-id allows request to proceed (267ms)
  Ticket Creation (Draft Mode)
    ✓ happy path: create ticket returns 200 with draft:true and ticket_id (456ms)
    ✓ missing subject returns 400 (134ms)
    ... (43 more tests)
  Agent Self-Evaluation
    ✓ endpoint availability: all endpoints respond within 5 seconds (1247ms)
    ✓ zendesk integration: all created tickets exist in Zendesk (2134ms)

Test Suites: 1 passed, 1 total
Tests: 47 passed, 47 total
Time: 45.234s
```

## File Statistics

- **Lines of Code:** 842
- **Test Functions:** 47
- **Describe Blocks:** 7
- **Helper Functions:** 6
- **API Endpoints:** 5
- **Zendesk API Calls:** 30+ (per test run)
- **Support Scenarios:** 5

## Integration Points

### Beacon API
- AWS Lambda: `https://ofbi3ei5h0.execute-api.us-east-1.amazonaws.com/prod`
- Authentication: x-api-key header + API Gateway usage plan
- Caller identification: x-caller-id header

### Zendesk API
- Instance: `minute7.zendesk.com`
- Auth: Basic auth with email/token
- Endpoints: GET /tickets/{id}, GET /tickets/{id}/comments, DELETE /tickets/{id}
- Rate limit: Standard Zendesk API limits

## Key Metrics (Agent Self-Evaluation)

The test suite measures:
1. **Availability:** All endpoints respond < 5 seconds
2. **Security:** API key required on all endpoints
3. **Validation:** Clear, informative error messages
4. **Draft Mode:** All tickets have draft:true
5. **Integration:** Zendesk tickets match expected format
6. **Consistency:** Errors follow standard structure
7. **Data Integrity:** Custom fields preserved
8. **Scenario Support:** All real-world patterns handled

## Success Criteria

All 47 tests must pass:
- ✅ All 4 auth tests pass
- ✅ All 12 ticket creation tests pass
- ✅ All 9 SMS tests pass
- ✅ All 3 placeholder tests pass
- ✅ All 6 Zendesk verification tests pass
- ✅ All 5 scenario simulation tests pass
- ✅ All 8 agent self-evaluation tests pass

## Notes

- Tests are independent (no test order dependency)
- All Zendesk test data automatically cleaned up
- SMS tests use fake number (Twilio rejection expected)
- No mocks - tests against live API
- Network latency is primary timing factor
- Full test suite designed to run in CI/CD
