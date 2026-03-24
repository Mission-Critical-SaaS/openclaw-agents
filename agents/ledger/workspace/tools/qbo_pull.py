#!/usr/bin/env python3
"""QuickBooks Online read-only data pull for Ledger agent.

Usage:
  python3 tools/qbo_pull.py pnl --start 2026-01-01 --end 2026-03-31
  python3 tools/qbo_pull.py pnl_monthly --year 2026
  python3 tools/qbo_pull.py balance_sheet
  python3 tools/qbo_pull.py company_info
  python3 tools/qbo_pull.py refresh_token_info

Handles OAuth token refresh automatically. Outputs JSON to stdout.
Read-only — no mutations to QBO.
"""
import os, sys, json, time, urllib.request, urllib.parse, urllib.error, base64
from datetime import datetime, timedelta

# Ledger uses its own QBO creds (falls back to Chief's)
CLIENT_ID = os.environ.get("QBO_CLIENT_ID_LEDGER", os.environ.get("QBO_CLIENT_ID_CHIEF", ""))
CLIENT_SECRET = os.environ.get("QBO_CLIENT_SECRET_LEDGER", os.environ.get("QBO_CLIENT_SECRET_CHIEF", ""))
REFRESH_TOKEN = os.environ.get("QBO_REFRESH_TOKEN_LEDGER", os.environ.get("QBO_REFRESH_TOKEN_CHIEF", ""))
REALM_ID = os.environ.get("QBO_REALM_ID_LEDGER", os.environ.get("QBO_REALM_ID_CHIEF", ""))

_access_token = None
_token_obtained_at = None


def get_access_token():
    """Refresh and return a QBO access token."""
    global _access_token, _token_obtained_at

    if _access_token and _token_obtained_at:
        age = (datetime.utcnow() - _token_obtained_at).total_seconds()
        if age < 3300:  # tokens last ~3600s, refresh at 55min
            return _access_token

    if not CLIENT_ID or not CLIENT_SECRET or not REFRESH_TOKEN:
        print(json.dumps({"error": "QBO OAuth credentials not configured. "
                          "Need QBO_CLIENT_ID_LEDGER, QBO_CLIENT_SECRET_LEDGER, "
                          "QBO_REFRESH_TOKEN_LEDGER (or CHIEF variants)."}))
        sys.exit(1)

    auth = base64.b64encode(f"{CLIENT_ID}:{CLIENT_SECRET}".encode()).decode()
    data = urllib.parse.urlencode({
        "grant_type": "refresh_token",
        "refresh_token": REFRESH_TOKEN,
    }).encode()

    req = urllib.request.Request(
        "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer",
        data=data, method="POST",
    )
    req.add_header("Authorization", f"Basic {auth}")
    req.add_header("Content-Type", "application/x-www-form-urlencoded")
    req.add_header("Accept", "application/json")
    req.add_header("User-Agent", "OpenClaw-Agent/1.0")
    req.add_header("User-Agent", "OpenClaw-Agent/1.0")

    for attempt in range(3):
        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                result = json.loads(resp.read().decode())
                _access_token = result["access_token"]
                _token_obtained_at = datetime.utcnow()
                return _access_token
        except urllib.error.HTTPError as e:
            if attempt < 2:
                time.sleep(2)
                continue
            body = e.read().decode() if hasattr(e, "read") else str(e)
            print(json.dumps({"error": f"Token refresh failed: HTTP {e.code}", "body": body[:500]}))
            sys.exit(1)
        except Exception:
            if attempt < 2:
                time.sleep(1)
                continue
            raise


def qbo_get(path, params=None):
    """Make authenticated GET request to QBO API."""
    token = get_access_token()
    base_url = f"https://quickbooks.api.intuit.com/v3/company/{REALM_ID}"
    url = f"{base_url}/{path}"
    if params:
        url += "?" + urllib.parse.urlencode(params)

    req = urllib.request.Request(url, method="GET")
    req.add_header("Authorization", f"Bearer {token}")
    req.add_header("Accept", "application/json")
    req.add_header("User-Agent", "OpenClaw-Agent/1.0")
    req.add_header("User-Agent", "OpenClaw-Agent/1.0")

    for attempt in range(3):
        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                return json.loads(resp.read().decode())
        except urllib.error.HTTPError as e:
            body = e.read().decode() if hasattr(e, "read") else str(e)
            if e.code == 401 and attempt == 0:
                global _access_token
                _access_token = None
                continue
            if e.code == 429:
                time.sleep(2 ** attempt)
                continue
            return {"error": f"QBO API HTTP {e.code}", "body": body[:500]}
        except Exception as e:
            if attempt < 2:
                time.sleep(1)
                continue
            return {"error": str(e)}
    return {"error": "Max retries exceeded"}


def cmd_pnl(args):
    """Pull Profit & Loss report for a date range."""
    start = args.get("start", datetime.utcnow().strftime("%Y-01-01"))
    end = args.get("end", datetime.utcnow().strftime("%Y-%m-%d"))

    data = qbo_get("reports/ProfitAndLoss", {
        "start_date": start,
        "end_date": end,
        "minorversion": "75",
    })
    json.dump(data, sys.stdout, indent=2)


def cmd_pnl_monthly(args):
    """Pull Profit & Loss report broken down by month."""
    year = args.get("year", str(datetime.utcnow().year))
    start = f"{year}-01-01"
    end = f"{year}-12-31"

    data = qbo_get("reports/ProfitAndLoss", {
        "start_date": start,
        "end_date": end,
        "summarize_column_by": "Month",
        "minorversion": "75",
    })
    json.dump(data, sys.stdout, indent=2)


def cmd_balance_sheet(args):
    """Pull current balance sheet."""
    as_of = args.get("date", datetime.utcnow().strftime("%Y-%m-%d"))

    data = qbo_get("reports/BalanceSheet", {
        "date_macro": "",
        "start_date": "",
        "end_date": as_of,
        "minorversion": "75",
    })
    json.dump(data, sys.stdout, indent=2)


def cmd_company_info(args):
    """Pull company metadata."""
    data = qbo_get(f"companyinfo/{REALM_ID}", {"minorversion": "75"})
    if "error" in data:
        json.dump(data, sys.stdout, indent=2)
        return

    info = data.get("CompanyInfo", data)
    result = {
        "company_name": info.get("CompanyName", ""),
        "legal_name": info.get("LegalName", ""),
        "country": info.get("Country", ""),
        "fiscal_year_start": info.get("FiscalYearStartMonth", ""),
        "company_start_date": info.get("CompanyStartDate", ""),
        "industry_type": info.get("NameValue", []),
    }
    json.dump(result, sys.stdout, indent=2)


def cmd_refresh_token_info(args):
    """Report OAuth token health and configuration status."""
    has_client_id = bool(CLIENT_ID)
    has_client_secret = bool(CLIENT_SECRET)
    has_refresh_token = bool(REFRESH_TOKEN)
    has_realm_id = bool(REALM_ID)

    # Check which env vars are being used (Ledger-specific or Chief fallback)
    using_ledger_creds = bool(os.environ.get("QBO_CLIENT_ID_LEDGER"))
    cred_source = "ledger" if using_ledger_creds else "chief_fallback"

    result = {
        "configured": all([has_client_id, has_client_secret, has_refresh_token, has_realm_id]),
        "credential_source": cred_source,
        "realm_id": REALM_ID[:8] + "..." if REALM_ID else "missing",
        "has_client_id": has_client_id,
        "has_client_secret": has_client_secret,
        "has_refresh_token": has_refresh_token,
        "has_realm_id": has_realm_id,
    }

    # Try a token refresh to verify credentials work
    if result["configured"]:
        try:
            token = get_access_token()
            result["token_refresh"] = "success"
            result["access_token_preview"] = token[:10] + "..." if token else "failed"
        except Exception as e:
            result["token_refresh"] = "failed"
            result["token_error"] = str(e)[:200]

    json.dump(result, sys.stdout, indent=2)


if __name__ == "__main__":
    if len(sys.argv) < 2:
        cmds_list = "pnl|pnl_monthly|balance_sheet|company_info|refresh_token_info"
        print(f"Usage: qbo_pull.py <{cmds_list}> [--start DATE] [--end DATE] [--year YYYY]", file=sys.stderr)
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
        "pnl": cmd_pnl,
        "pnl_monthly": cmd_pnl_monthly,
        "balance_sheet": cmd_balance_sheet,
        "company_info": cmd_company_info,
        "refresh_token_info": cmd_refresh_token_info,
    }
    if command not in cmds:
        print(f"Unknown command: {command}. Available: {', '.join(cmds.keys())}", file=sys.stderr)
        sys.exit(1)
    cmds[command](args)
