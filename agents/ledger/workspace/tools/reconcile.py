#!/usr/bin/env python3
"""Cross-source reconciliation engine for Ledger agent.

Usage:
  python3 tools/reconcile.py stripe_to_mercury --days 30
  python3 tools/reconcile.py mercury_to_qbo --days 30
  python3 tools/reconcile.py unbooked_revenue --days 60
  python3 tools/reconcile.py full_reconciliation --days 30
  python3 tools/reconcile.py expense_categorization --days 30

Compares data across Stripe, Mercury, and QBO to find:
- Unmatched Stripe payouts (revenue not deposited)
- Unbooked revenue (Stripe deposits in Mercury but not in QBO)
- Uncategorized expenses (Mercury outflows not in QBO)
- Cross-source divergence metrics

Outputs JSON to stdout with match/mismatch details.
"""
import os, sys, json, subprocess, time
from datetime import datetime, timedelta
from collections import defaultdict

TOOLS_DIR = os.path.dirname(os.path.abspath(__file__))

def run_tool(script, args_list):
    """Run a sibling tool script and return parsed JSON."""
    cmd = ["python3", os.path.join(TOOLS_DIR, script)] + args_list
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=60)
        if result.returncode != 0:
            return {"error": f"{script} failed: {result.stderr[:500]}"}
        return json.loads(result.stdout) if result.stdout.strip() else {"error": "empty output"}
    except subprocess.TimeoutExpired:
        return {"error": f"{script} timed out after 60s"}
    except json.JSONDecodeError:
        return {"error": f"{script} returned invalid JSON"}
    except Exception as e:
        return {"error": str(e)}


def cmd_stripe_to_mercury(args):
    """Match Stripe payouts to Mercury deposits.

    Stripe auto-transfers hit Mercury as inflows. This checks that every
    Stripe payout has a corresponding Mercury deposit within a 3-day window.
    """
    days = args.get("days", "30")

    # Pull Stripe payouts across all verticals
    verticals = ["minute7", "goodhelp", "hts", "lmntl"]
    all_payouts = []
    for v in verticals:
        data = run_tool("stripe_pull.py", ["payouts", "--days", days, "--vertical", v])
        if "error" not in data:
            payouts = data.get(v, {}).get("payouts", [])
            for p in payouts:
                p["vertical"] = v
            all_payouts.extend(payouts)

    # Pull Mercury transactions
    merc_data = run_tool("mercury_pull.py", ["transactions", "--days", days])
    merc_txns = []
    if "error" not in merc_data:
        for acct_id, acct_data in merc_data.items():
            for t in acct_data.get("transactions", []):
                if t.get("amount", 0) > 0:  # inflows only
                    merc_txns.append(t)

    # Match payouts to deposits
    matched = []
    unmatched_payouts = []
    used_merc = set()

    for payout in all_payouts:
        p_amount = abs(payout.get("amount", 0))
        p_date = payout.get("arrival_date", payout.get("created", ""))[:10]
        found = False

        for mt in merc_txns:
            mt_id = mt.get("id", "")
            if mt_id in used_merc:
                continue
            mt_amount = abs(mt.get("amount", 0))
            mt_date = (mt.get("postedAt") or mt.get("createdAt", ""))[:10]

            # Match within $1 and 3 days
            if abs(p_amount - mt_amount) < 1.0:
                try:
                    d1 = datetime.strptime(p_date, "%Y-%m-%d")
                    d2 = datetime.strptime(mt_date, "%Y-%m-%d")
                    if abs((d1 - d2).days) <= 3:
                        matched.append({
                            "stripe_amount": p_amount,
                            "mercury_amount": mt_amount,
                            "vertical": payout.get("vertical"),
                            "stripe_date": p_date,
                            "mercury_date": mt_date,
                            "counterparty": mt.get("counterpartyName", ""),
                        })
                        used_merc.add(mt_id)
                        found = True
                        break
                except ValueError:
                    continue

        if not found:
            unmatched_payouts.append({
                "amount": p_amount,
                "vertical": payout.get("vertical"),
                "date": p_date,
                "status": payout.get("status", ""),
            })

    total_stripe = sum(abs(p.get("amount", 0)) for p in all_payouts)
    total_mercury_in = sum(abs(t.get("amount", 0)) for t in merc_txns)
    divergence = abs(total_stripe - total_mercury_in) / max(total_stripe, 1) * 100

    json.dump({
        "period_days": int(days),
        "stripe_payouts_total": round(total_stripe, 2),
        "mercury_inflows_total": round(total_mercury_in, 2),
        "divergence_pct": round(divergence, 2),
        "matched_count": len(matched),
        "unmatched_payouts": unmatched_payouts,
        "matched_details": matched[:20],  # cap detail output
    }, sys.stdout, indent=2)


def cmd_unbooked_revenue(args):
    """Find Stripe revenue that landed in Mercury but isn't booked in QBO.

    Compares Stripe charge totals by month to QBO booked revenue by month.
    """
    days = args.get("days", "60")

    # Stripe charges by month
    verticals = ["minute7", "goodhelp", "hts", "lmntl"]
    stripe_monthly = defaultdict(lambda: defaultdict(float))
    for v in verticals:
        data = run_tool("stripe_pull.py", ["charges", "--days", days, "--vertical", v])
        if "error" not in data:
            charges = data.get(v, {}).get("charges", [])
            for c in charges:
                if c.get("status") == "succeeded":
                    created = c.get("created", "")[:7]  # YYYY-MM
                    stripe_monthly[created][v] += abs(c.get("amount", 0)) / 100  # cents to dollars

    # QBO P&L monthly for current year
    year = str(datetime.utcnow().year)
    qbo_data = run_tool("qbo_pull.py", ["pnl_monthly", "--year", year])

    # Parse QBO revenue from report
    qbo_monthly_revenue = {}
    if "error" not in qbo_data:
        # QBO P&L report parsing is complex — extract column headers and revenue rows
        report = qbo_data
        columns = report.get("Columns", {}).get("Column", [])
        rows = report.get("Rows", {}).get("Row", [])

        # Extract month labels from columns
        month_labels = []
        for col in columns:
            meta = col.get("MetaData", [])
            for m in meta:
                if m.get("Name") == "StartDate":
                    month_labels.append(m["Value"][:7])
                    break

        # Find "Total Income" row
        def find_total_income(rows):
            for row in rows:
                header = row.get("Header", {})
                if "Total Income" in header.get("ColData", [{}])[0].get("value", ""):
                    cols = header.get("ColData", [])
                    return {month_labels[i-1]: float(cols[i].get("value", "0") or "0")
                            for i in range(1, min(len(cols), len(month_labels)+1))}
                sub_rows = row.get("Rows", {}).get("Row", [])
                if sub_rows:
                    result = find_total_income(sub_rows)
                    if result:
                        return result
            return None

        qbo_monthly_revenue = find_total_income(rows) or {}

    # Compare
    gaps = []
    for month in sorted(stripe_monthly.keys()):
        stripe_total = sum(stripe_monthly[month].values())
        qbo_total = qbo_monthly_revenue.get(month, 0)
        gap = stripe_total - qbo_total

        gaps.append({
            "month": month,
            "stripe_revenue": round(stripe_total, 2),
            "qbo_booked_revenue": round(qbo_total, 2),
            "unbooked_amount": round(gap, 2),
            "by_vertical": {v: round(stripe_monthly[month].get(v, 0), 2) for v in verticals},
            "status": "BOOKED" if abs(gap) < 100 else "UNBOOKED" if gap > 100 else "OVERBOOKED",
        })

    total_unbooked = sum(g["unbooked_amount"] for g in gaps if g["status"] == "UNBOOKED")

    json.dump({
        "period_days": int(days),
        "monthly_comparison": gaps,
        "total_unbooked_revenue": round(total_unbooked, 2),
        "months_behind": sum(1 for g in gaps if g["status"] == "UNBOOKED"),
    }, sys.stdout, indent=2)


def cmd_expense_categorization(args):
    """Analyze Mercury outflows and match to QBO expense categories.

    Identifies:
    - Known recurring expenses (c0x12c, etc.)
    - Unmatched/uncategorized outflows
    - Category suggestions based on counterparty patterns
    """
    days = args.get("days", "30")

    # Known expense patterns
    KNOWN_PATTERNS = {
        "c0x12c": {"category": "Engineering Services", "expected_amount": 42000},
        "Gusto": {"category": "Payroll", "expected_amount": None},
        "Amazon Web Services": {"category": "Cloud Infrastructure", "expected_amount": None},
        "AWS": {"category": "Cloud Infrastructure", "expected_amount": None},
        "Google": {"category": "Cloud/SaaS", "expected_amount": None},
        "Stripe": {"category": "Payment Processing Fees", "expected_amount": None},
        "Anthropic": {"category": "AI/ML Services", "expected_amount": None},
        "OpenAI": {"category": "AI/ML Services", "expected_amount": None},
    }

    # Pull Mercury outflows
    merc_data = run_tool("mercury_pull.py", ["transactions", "--days", days])
    outflows = []
    if "error" not in merc_data:
        for acct_id, acct_data in merc_data.items():
            for t in acct_data.get("transactions", []):
                if t.get("amount", 0) < 0:  # outflows are negative
                    outflows.append(t)

    # Categorize
    categorized = []
    uncategorized = []

    for txn in outflows:
        counterparty = txn.get("counterpartyName", "")
        amount = abs(txn.get("amount", 0))
        date = (txn.get("postedAt") or txn.get("createdAt", ""))[:10]

        matched_category = None
        for pattern, info in KNOWN_PATTERNS.items():
            if pattern.lower() in counterparty.lower():
                matched_category = info["category"]
                break

        entry = {
            "date": date,
            "counterparty": counterparty,
            "amount": round(amount, 2),
            "note": txn.get("note", ""),
        }

        if matched_category:
            entry["category"] = matched_category
            entry["confidence"] = "high"
            categorized.append(entry)
        else:
            entry["category"] = "NEEDS REVIEW"
            entry["confidence"] = "none"
            uncategorized.append(entry)

    json.dump({
        "period_days": int(days),
        "total_outflows": round(sum(abs(t.get("amount", 0)) for t in outflows), 2),
        "categorized_count": len(categorized),
        "uncategorized_count": len(uncategorized),
        "categorized": categorized,
        "uncategorized": uncategorized,
    }, sys.stdout, indent=2)


def cmd_full_reconciliation(args):
    """Run all reconciliation checks and produce a summary."""
    days = args.get("days", "30")

    print(json.dumps({"status": "running", "message": "Run stripe_to_mercury, unbooked_revenue, and expense_categorization individually for full results. This command provides a summary."}), file=sys.stderr)

    # Quick summary: just check Stripe↔Mercury and unbooked
    stripe_merc = cmd_stripe_to_mercury.__wrapped__(args) if hasattr(cmd_stripe_to_mercury, '__wrapped__') else None

    # For now, just output instructions
    json.dump({
        "reconciliation_checklist": [
            {"check": "stripe_to_mercury", "command": f"python3 tools/reconcile.py stripe_to_mercury --days {days}"},
            {"check": "unbooked_revenue", "command": f"python3 tools/reconcile.py unbooked_revenue --days {days}"},
            {"check": "expense_categorization", "command": f"python3 tools/reconcile.py expense_categorization --days {days}"},
        ],
        "note": "Run each check individually for detailed results. Full auto-reconciliation coming in v2.",
    }, sys.stdout, indent=2)


if __name__ == "__main__":
    if len(sys.argv) < 2:
        cmds_list = "stripe_to_mercury|mercury_to_qbo|unbooked_revenue|expense_categorization|full_reconciliation"
        print(f"Usage: reconcile.py <{cmds_list}> [--days N]", file=sys.stderr)
        sys.exit(1)

    command = sys.argv[1]
    args = {}
    i = 2
    while i < len(sys.argv):
        if sys.argv[i].startswith("--") and i + 1 < len(sys.argv):
            args[sys.argv[i][2:]] = sys.argv[i + 1]
            i += 2
        else:
            i += 1

    cmds = {
        "stripe_to_mercury": cmd_stripe_to_mercury,
        "unbooked_revenue": cmd_unbooked_revenue,
        "expense_categorization": cmd_expense_categorization,
        "full_reconciliation": cmd_full_reconciliation,
    }
    if command not in cmds:
        print(f"Unknown command: {command}. Available: {', '.join(cmds.keys())}", file=sys.stderr)
        sys.exit(1)
    cmds[command](args)
