#!/usr/bin/env python3
"""Stripe read-only data pull for Ledger agent.

Usage:
  python3 tools/stripe_pull.py balance
  python3 tools/stripe_pull.py charges --days 30 --vertical minute7
  python3 tools/stripe_pull.py payouts --days 30 --vertical minute7

Verticals: minute7, goodhelp, hts, lmntl

Outputs JSON to stdout. Read-only — no mutations.
"""
import os, sys, json, time, urllib.request, urllib.parse, urllib.error
from datetime import datetime, timedelta

# Vertical → env var mapping
VERTICAL_KEYS = {
    "minute7": "STRIPE_KEY_MINUTE7",
    "goodhelp": "STRIPE_KEY_GOODHELP",
    "hts": "STRIPE_KEY_HTS",
    "lmntl": "STRIPE_KEY_LMNTL",
}

ALL_VERTICALS = list(VERTICAL_KEYS.keys())


def get_stripe_key(vertical):
    """Get the Stripe API key for a vertical."""
    env_var = VERTICAL_KEYS.get(vertical)
    if not env_var:
        return None
    key = os.environ.get(env_var, "")
    if not key or key == "null":
        return None
    return key


def stripe_request(api_key, path, params=None):
    """Make authenticated GET request to Stripe API with retry."""
    url = f"https://api.stripe.com/v1/{path}"
    if params:
        url += "?" + urllib.parse.urlencode(params)

    req = urllib.request.Request(url, method="GET")
    req.add_header("Authorization", f"Bearer {api_key}")
    req.add_header("Accept", "application/json")
    req.add_header("User-Agent", "OpenClaw-Agent/1.0")

    for attempt in range(3):
        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                return json.loads(resp.read().decode())
        except urllib.error.HTTPError as e:
            body = e.read().decode() if hasattr(e, "read") else str(e)
            if e.code == 429:
                retry_after = int(e.headers.get("Retry-After", 2 ** attempt))
                time.sleep(retry_after)
                continue
            if attempt < 2 and e.code >= 500:
                time.sleep(2 ** attempt)
                continue
            return {"error": f"Stripe API HTTP {e.code}", "body": body[:500]}
        except Exception as e:
            if attempt < 2:
                time.sleep(1)
                continue
            return {"error": str(e)}
    return {"error": "Max retries exceeded"}


def paginate(api_key, path, params, key="data", max_pages=10):
    """Auto-paginate a Stripe list endpoint."""
    all_items = []
    page = 0
    while page < max_pages:
        data = stripe_request(api_key, path, params)
        if "error" in data:
            return data
        items = data.get(key, [])
        all_items.extend(items)
        if not data.get("has_more", False):
            break
        if items:
            params["starting_after"] = items[-1]["id"]
        page += 1
    return all_items


def cmd_balance(args):
    """Get current Stripe balance for all verticals."""
    results = {}
    for vertical in ALL_VERTICALS:
        key = get_stripe_key(vertical)
        if not key:
            results[vertical] = {"status": "no_api_key", "available": [], "pending": []}
            continue
        data = stripe_request(key, "balance")
        if "error" in data:
            results[vertical] = data
            continue
        results[vertical] = {
            "available": [
                {"amount": b["amount"] / 100, "currency": b["currency"]}
                for b in data.get("available", [])
            ],
            "pending": [
                {"amount": b["amount"] / 100, "currency": b["currency"]}
                for b in data.get("pending", [])
            ],
        }
    json.dump(results, sys.stdout, indent=2)


def cmd_charges(args):
    """Get charge history for a vertical."""
    days = int(args.get("days", "30"))
    vertical = args.get("vertical", "")

    verticals = [vertical] if vertical else ALL_VERTICALS
    cutoff = int((datetime.utcnow() - timedelta(days=days)).timestamp())

    results = {}
    for v in verticals:
        key = get_stripe_key(v)
        if not key:
            results[v] = {"status": "no_api_key", "charges": []}
            continue

        params = {"created[gte]": str(cutoff), "limit": "100"}
        items = paginate(key, "charges", params)
        if isinstance(items, dict) and "error" in items:
            results[v] = items
            continue

        charges = []
        for c in items:
            charges.append({
                "id": c["id"],
                "amount": c["amount"] / 100,
                "currency": c.get("currency", "usd"),
                "status": c.get("status", ""),
                "created": datetime.utcfromtimestamp(c["created"]).strftime("%Y-%m-%d"),
                "description": (c.get("description") or "")[:100],
                "customer": c.get("customer", ""),
            })

        total = sum(ch["amount"] for ch in charges if ch["status"] == "succeeded")
        results[v] = {
            "charge_count": len(charges),
            "total_succeeded": round(total, 2),
            "charges": charges,
        }

    json.dump(results, sys.stdout, indent=2)


def cmd_payouts(args):
    """Get payout history for a vertical."""
    days = int(args.get("days", "30"))
    vertical = args.get("vertical", "")

    verticals = [vertical] if vertical else ALL_VERTICALS
    cutoff = int((datetime.utcnow() - timedelta(days=days)).timestamp())

    results = {}
    for v in verticals:
        key = get_stripe_key(v)
        if not key:
            results[v] = {"status": "no_api_key", "payouts": []}
            continue

        params = {"created[gte]": str(cutoff), "limit": "100"}
        items = paginate(key, "payouts", params)
        if isinstance(items, dict) and "error" in items:
            results[v] = items
            continue

        payouts = []
        for p in items:
            arrival = p.get("arrival_date")
            payouts.append({
                "id": p["id"],
                "amount": p["amount"] / 100,
                "currency": p.get("currency", "usd"),
                "status": p.get("status", ""),
                "created": datetime.utcfromtimestamp(p["created"]).strftime("%Y-%m-%d"),
                "arrival_date": datetime.utcfromtimestamp(arrival).strftime("%Y-%m-%d") if arrival else "",
                "method": p.get("method", ""),
            })

        total = sum(po["amount"] for po in payouts if po["status"] == "paid")
        results[v] = {
            "payout_count": len(payouts),
            "total_paid": round(total, 2),
            "payouts": payouts,
        }

    json.dump(results, sys.stdout, indent=2)


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: stripe_pull.py <balance|charges|payouts> [--days N] [--vertical V]", file=sys.stderr)
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
        "balance": cmd_balance,
        "charges": cmd_charges,
        "payouts": cmd_payouts,
    }
    if command not in cmds:
        print(f"Unknown command: {command}. Available: {', '.join(cmds.keys())}", file=sys.stderr)
        sys.exit(1)
    cmds[command](args)
