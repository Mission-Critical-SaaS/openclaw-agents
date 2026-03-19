# Ledger Knowledge Base

## Chart of Accounts Mapping
_Run `python3 tools/qbo_write.py query_accounts` to populate on first boot._

| Category | QBO Account ID | Account Name | Type |
|----------|---------------|--------------|------|
| TBD | TBD | TBD | TBD |

## Revenue Accounts by Vertical
| Vertical | QBO Account ID | Account Name |
|----------|---------------|--------------|
| Minute7 | TBD | TBD |
| GoodHelp | TBD | TBD |
| HTS | TBD | TBD |
| LMNTL | TBD | TBD |

## Bank Accounts
| Bank | QBO Account ID | Account Name | Mercury ID |
|------|---------------|--------------|------------|
| Main Checking (••8775) | TBD | TBD | TBD |

## Last Reconciliation
| Check | Last Run | Status | Notes |
|-------|----------|--------|-------|
| Stripe → Mercury | Never | Pending | |
| Mercury → QBO | Never | Pending | |
| Unbooked Revenue | Never | Pending | |
| Expense Categorization | Never | Pending | |

## Known Expense Patterns
| Counterparty | Category | Typical Amount | Frequency |
|-------------|----------|---------------|-----------|
| c0x12c Inc | Engineering Services | $42,000 | Monthly |
| Stripe transfers | Revenue (pass-through) | Varies | Weekly |

## Approval Queue History
_No entries yet._

## API Call Budget (Daily)
| API | Limit | Used Today |
|-----|-------|-----------|
| Stripe | 50 | 0 |
| Mercury | 30 | 0 |
| QBO Read | 50 | 0 |
| QBO Write | 20 | 0 |
| Slack | 25 | 0 |

## Anomalies & Open Items
- QBO books are ~2.5 months behind (last revenue booked: December 2025)
- January 2026: $0 revenue booked despite ~$90K in Stripe charges
- February 2026: No data in QBO
- March 2026: No data in QBO
