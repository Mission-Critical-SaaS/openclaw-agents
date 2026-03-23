#!/usr/bin/env python3
"""Mercury Banking read-only data pull for Ledger agent.

Usage:
  python3 tools/mercury_pull.py accounts
  python3 tools/mercury_pull.py transactions --days 30

Outputs JSON to stdout. Read-only — no mutations.
"""
import os, sys, json, time, urllib.request, urllib.parse, urllib.error
from datetime import datetime, timedelta

MERCURY_API_TOKEN = os.environ.get("MERCURY_API_TOKEN", "")
BASE_URL = "https://backend.mercury.com/api/v1"


def mercury_request(path, params=None):
    """Make authenticated GET request to Mercury API with retry."""
    if not MERCURY_API_TOKEN or MERCURY_API_TOKEN == "null":
        return {"error": "MERCURY_API_TOKEN not configured"}

    url = f"{BASE_URL}/{path}"
    if params:
        url += "?" + urllib.parse.urlencode(params)

    req = urllib.request.Request(url, method="GET")
    req.add_header("Authorization", f"Bearer {MERCURY_API_TOKEN}")
    req.add_header("Accept", "application/json")

    for attempt in range(3):
        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                return json.loads(resp.read().decode())
        except urllib.error.HTTPError as e:
            body = e.read().decode() if hasattr(e, "read") else str(e)
            if e.code == 429:
                time.sleep(2 ** attempt)
                continue
            if attempt < 2 and e.code >= 500:
                time.sleep(2 ** attempt)
                continue
            return {"error": f"Mercury API HTTP {e.code}", "body": body[:500]}
        except Exception as e:
            if attempt < 2:
                time.sleep(1)
                continue
            return {"error": str(e)}
    return {"error": "Max retries exceeded"}


def cmd_accounts(args):
    """List all Mercury accounts with balances."""
    data = mercury_request("accounts")
    if "error" in data:
        json.dump(data, sys.stdout, indent=2)
        return

    accounts = data.get("accounts", [])
    result = []
    for acct in accounts:
        result.append({
            "id": acct.get("id", ""),
            "name": acct.get("name", ""),
            "type": acct.get("type", ""),
            "status": acct.get("status", ""),
            "current_balance": acct.get("currentBalance", 0),
            "available_balance": acct.get("availableBalance", 0),
            "account_number_last4": acct.get("accountNumber", "")[-4:] if acct.get("accountNumber") else "",
            "routing_number": acct.get("routingNumber", ""),
        })

    total_balance = sum(a["current_balance"] for a in result)
    json.dump({
        "account_count": len(result),
        "total_balance": round(total_balance, 2),
        "accounts": result,
    }, sys.stdout, indent=2)


def cmd_transactions(args):
    """Get transaction history across all accounts."""
    days = int(args.get("days", "30"))
    start = (datetime.utcnow() - timedelta(days=days)).strftime("%Y-%m-%dT00:00:00Z")
    end = datetime.utcnow().strftime("%Y-%m-%dT23:59:59Z")

    # First get all accounts
    acct_data = mercury_request("accounts")
    if "error" in acct_data:
        json.dump(acct_data, sys.stdout, indent=2)
        return

    accounts = acct_data.get("accounts", [])
    results = {}

    for acct in accounts:
        acct_id = acct.get("id", "")
        acct_name = acct.get("name", "")
        if not acct_id:
            continue

        params = {"start": start, "end": end, "limit": "500"}
        data = mercury_request(f"account/{acct_id}/transactions", params)
        if "error" in data:
            results[acct_id] = {"name": acct_name, "error": data["error"]}
            continue

        transactions = data.get("transactions", [])
        txns = []
        for t in transactions:
            txns.append({
                "id": t.get("id", ""),
                "amount": t.get("amount", 0),
                "status": t.get("status", ""),
                "counterpartyName": t.get("counterpartyName", ""),
                "note": (t.get("note") or "")[:100],
                "kind": t.get("kind", ""),
                "postedAt": t.get("postedAt", ""),
                "createdAt": t.get("createdAt", ""),
            })

        inflows = sum(t["amount"] for t in txns if t["amount"] > 0)
        outflows = sum(t["amount"] for t in txns if t["amount"] < 0)

        results[acct_id] = {
            "name": acct_name,
            "transaction_count": len(txns),
            "total_inflows": round(inflows, 2),
            "total_outflows": round(outflows, 2),
            "net_flow": round(inflows + outflows, 2),
            "transactions": txns,
        }

    json.dump(results, sys.stdout, indent=2)


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: mercury_pull.py <accounts|transactions> [--days N]", file=sys.stderr)
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
        "accounts": cmd_accounts,
        "transactions": cmd_transactions,
    }
    if command not in cmds:
        print(f"Unknown command: {command}. Available: {', '.join(cmds.keys())}", file=sys.stderr)
        sys.exit(1)
    cmds[command](args)
