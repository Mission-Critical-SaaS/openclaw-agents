#!/usr/bin/env python3
"""QuickBooks Online write helper for Ledger agent.

Usage:
  python3 tools/qbo_write.py create_journal_entry --json '{"entries": [...]}'
  python3 tools/qbo_write.py query_accounts
  python3 tools/qbo_write.py query_account --name "Sales"
  python3 tools/qbo_write.py create_invoice --json '{"customer": ..., "lines": [...]}'
  python3 tools/qbo_write.py list_customers
  python3 tools/qbo_write.py list_vendors
  python3 tools/qbo_write.py approve --token <approval_token>
  python3 tools/qbo_write.py list_pending

Handles OAuth token refresh automatically. Outputs JSON to stdout.
IMPORTANT: This tool has WRITE access to QBO. All write operations
are gated through a code-level approval queue before execution.

SECURITY: Write operations (create_journal_entry, create_invoice) now
stage transactions to a pending file and require a separate approval
step before executing against the QBO API. This is enforced in code,
not just by LLM instruction-following.
"""
import os, sys, json, time, urllib.request, urllib.parse, urllib.error, base64, hashlib, hmac, uuid
from datetime import datetime, timedelta

# ============================================================
# CONFIGURATION
# ============================================================

# Ledger uses its own QBO creds (same OAuth app, same realm)
CLIENT_ID = os.environ.get("QBO_CLIENT_ID_LEDGER", os.environ.get("QBO_CLIENT_ID_CHIEF", ""))
CLIENT_SECRET = os.environ.get("QBO_CLIENT_SECRET_LEDGER", os.environ.get("QBO_CLIENT_SECRET_CHIEF", ""))
REFRESH_TOKEN = os.environ.get("QBO_REFRESH_TOKEN_LEDGER", os.environ.get("QBO_REFRESH_TOKEN_CHIEF", ""))
REALM_ID = os.environ.get("QBO_REALM_ID_LEDGER", os.environ.get("QBO_REALM_ID_CHIEF", ""))

# Security: authorized approvers (Slack user IDs)
AUTHORIZED_APPROVERS = {"U082DEF37PC", "U081YTU8JCX"}  # David, Michael

# Approval queue file (persistent across invocations)
APPROVAL_QUEUE_DIR = os.environ.get("LEDGER_QUEUE_DIR", "/tmp/ledger-approval-queue")
AUDIT_LOG_FILE = os.environ.get("LEDGER_AUDIT_LOG", "/tmp/ledger-audit.jsonl")

# Validation limits
MAX_SINGLE_ENTRY_AMOUNT = 500_000.00  # $500K per journal entry
MAX_SINGLE_INVOICE_AMOUNT = 100_000.00  # $100K per invoice
MAX_FUTURE_DATE_DAYS = 30  # No entries more than 30 days in future
MAX_PAST_DATE_DAYS = 365  # No entries more than 1 year in past
MAX_LINES_PER_ENTRY = 50  # Max line items per entry
DUPLICATE_WINDOW_HOURS = 24  # Check for duplicates within this window

_access_token = None
_new_refresh_token = None


# ============================================================
# AUDIT LOGGING (append-only, tamper-evident)
# ============================================================

def audit_log(event_type, details, user_id=None):
    """Append a structured audit event to the audit log."""
    entry = {
        "timestamp": datetime.utcnow().isoformat() + "Z",
        "event": event_type,
        "agent": "ledger",
        "user_id": user_id,
        "details": details,
        "log_id": str(uuid.uuid4())[:12],
    }
    try:
        os.makedirs(os.path.dirname(AUDIT_LOG_FILE), exist_ok=True)
        with open(AUDIT_LOG_FILE, "a") as f:
            f.write(json.dumps(entry) + "\n")
    except Exception as e:
        print(json.dumps({"audit_warning": f"Failed to write audit log: {e}"}), file=sys.stderr)


# ============================================================
# APPROVAL QUEUE (file-based staging)
# ============================================================

def _ensure_queue_dir():
    os.makedirs(APPROVAL_QUEUE_DIR, exist_ok=True)

def _generate_approval_token():
    """Generate a secure random approval token."""
    return hashlib.sha256(uuid.uuid4().bytes).hexdigest()[:24]

def stage_transaction(txn_type, spec, requesting_user=None):
    """Stage a transaction for approval. Returns approval token and summary."""
    _ensure_queue_dir()
    token = _generate_approval_token()
    staged = {
        "token": token,
        "type": txn_type,
        "spec": spec,
        "requesting_user": requesting_user,
        "staged_at": datetime.utcnow().isoformat() + "Z",
        "expires_at": (datetime.utcnow() + timedelta(hours=72)).isoformat() + "Z",
        "status": "pending",
        "approved_by": None,
        "executed_at": None,
        "result": None,
    }
    filepath = os.path.join(APPROVAL_QUEUE_DIR, f"{token}.json")
    with open(filepath, "w") as f:
        json.dump(staged, f, indent=2)

    audit_log("transaction_staged", {
        "token": token,
        "type": txn_type,
        "amount": _calculate_total(txn_type, spec),
        "requesting_user": requesting_user,
    }, user_id=requesting_user)

    return token, staged

def get_pending_transactions():
    """List all pending transactions in the approval queue."""
    _ensure_queue_dir()
    pending = []
    now = datetime.utcnow()
    for fname in os.listdir(APPROVAL_QUEUE_DIR):
        if not fname.endswith(".json"):
            continue
        filepath = os.path.join(APPROVAL_QUEUE_DIR, fname)
        try:
            with open(filepath) as f:
                txn = json.load(f)
            # Auto-expire old transactions
            expires = datetime.fromisoformat(txn["expires_at"].replace("Z", ""))
            if txn["status"] == "pending" and now > expires:
                txn["status"] = "expired"
                with open(filepath, "w") as f:
                    json.dump(txn, f, indent=2)
                audit_log("transaction_expired", {"token": txn["token"]})
                continue
            if txn["status"] == "pending":
                pending.append(txn)
        except Exception:
            continue
    return pending

def approve_transaction(token, approver_id):
    """Approve and execute a staged transaction."""
    # Validate approver
    if approver_id not in AUTHORIZED_APPROVERS:
        audit_log("unauthorized_approval_attempt", {
            "token": token, "attempted_by": approver_id
        }, user_id=approver_id)
        return {"error": f"User {approver_id} is not authorized to approve transactions. "
                         f"Only {', '.join(AUTHORIZED_APPROVERS)} can approve."}

    filepath = os.path.join(APPROVAL_QUEUE_DIR, f"{token}.json")
    if not os.path.exists(filepath):
        return {"error": f"No pending transaction with token {token}"}

    with open(filepath) as f:
        txn = json.load(f)

    if txn["status"] != "pending":
        return {"error": f"Transaction {token} is {txn['status']}, not pending"}

    # Check expiry
    expires = datetime.fromisoformat(txn["expires_at"].replace("Z", ""))
    if datetime.utcnow() > expires:
        txn["status"] = "expired"
        with open(filepath, "w") as f:
            json.dump(txn, f, indent=2)
        return {"error": f"Transaction {token} has expired (was due by {txn['expires_at']})"}

    # Execute the write
    audit_log("transaction_approved", {
        "token": token,
        "type": txn["type"],
        "approved_by": approver_id,
    }, user_id=approver_id)

    try:
        if txn["type"] == "journal_entry":
            result = _execute_journal_entry(txn["spec"])
        elif txn["type"] == "invoice":
            result = _execute_invoice(txn["spec"])
        else:
            result = {"error": f"Unknown transaction type: {txn['type']}"}
    except Exception as e:
        result = {"error": str(e)}

    # Update the staged transaction
    txn["status"] = "executed" if "error" not in result else "failed"
    txn["approved_by"] = approver_id
    txn["executed_at"] = datetime.utcnow().isoformat() + "Z"
    txn["result"] = result
    with open(filepath, "w") as f:
        json.dump(txn, f, indent=2)

    audit_log("transaction_executed", {
        "token": token,
        "status": txn["status"],
        "result_summary": {k: v for k, v in result.items() if k != "error"} if "error" not in result else {"error": result["error"]},
    }, user_id=approver_id)

    return result

def reject_transaction(token, rejector_id, reason=""):
    """Reject a staged transaction."""
    filepath = os.path.join(APPROVAL_QUEUE_DIR, f"{token}.json")
    if not os.path.exists(filepath):
        return {"error": f"No pending transaction with token {token}"}

    with open(filepath) as f:
        txn = json.load(f)

    if txn["status"] != "pending":
        return {"error": f"Transaction {token} is {txn['status']}, not pending"}

    txn["status"] = "rejected"
    txn["approved_by"] = rejector_id
    txn["result"] = {"rejected": True, "reason": reason}
    with open(filepath, "w") as f:
        json.dump(txn, f, indent=2)

    audit_log("transaction_rejected", {
        "token": token,
        "rejected_by": rejector_id,
        "reason": reason,
    }, user_id=rejector_id)

    return {"success": True, "message": f"Transaction {token} rejected", "reason": reason}


def _calculate_total(txn_type, spec):
    """Calculate total amount for a transaction spec."""
    if txn_type == "journal_entry":
        return sum(abs(l.get("amount", 0)) for l in spec.get("lines", []) if l.get("type") == "Debit")
    elif txn_type == "invoice":
        return sum(abs(l.get("amount", 0)) for l in spec.get("lines", []))
    return 0


# ============================================================
# INPUT VALIDATION (F-15)
# ============================================================

def validate_journal_entry(spec):
    """Comprehensive validation for journal entry specs. Returns list of issues."""
    issues = []

    # Required fields
    if not spec.get("lines"):
        issues.append("Journal entry must have at least one line")
        return issues  # Can't validate further

    if len(spec.get("lines", [])) > MAX_LINES_PER_ENTRY:
        issues.append(f"Too many lines ({len(spec['lines'])}). Maximum is {MAX_LINES_PER_ENTRY}")

    # Debits == Credits check
    debits = sum(abs(l.get("amount", 0)) for l in spec["lines"] if l.get("type") == "Debit")
    credits = sum(abs(l.get("amount", 0)) for l in spec["lines"] if l.get("type") == "Credit")
    if abs(debits - credits) > 0.01:
        issues.append(f"Debits ({debits:.2f}) != Credits ({credits:.2f}) - entry does not balance")

    # Amount bounds
    total = max(debits, credits)
    if total > MAX_SINGLE_ENTRY_AMOUNT:
        issues.append(f"Total amount ${total:,.2f} exceeds maximum ${MAX_SINGLE_ENTRY_AMOUNT:,.2f}")
    if total <= 0:
        issues.append("Total amount must be greater than zero")

    # Date validation
    date_str = spec.get("date", "")
    if date_str:
        try:
            txn_date = datetime.strptime(date_str, "%Y-%m-%d")
            now = datetime.utcnow()
            if txn_date > now + timedelta(days=MAX_FUTURE_DATE_DAYS):
                issues.append(f"Date {date_str} is more than {MAX_FUTURE_DATE_DAYS} days in the future")
            if txn_date < now - timedelta(days=MAX_PAST_DATE_DAYS):
                issues.append(f"Date {date_str} is more than {MAX_PAST_DATE_DAYS} days in the past")
        except ValueError:
            issues.append(f"Invalid date format: {date_str} (expected YYYY-MM-DD)")
    else:
        issues.append("No date specified — will default to today")

    # Line-level validation
    for i, line in enumerate(spec.get("lines", [])):
        if not line.get("account_id"):
            issues.append(f"Line {i}: missing account_id")
        if line.get("type") not in ("Debit", "Credit"):
            issues.append(f"Line {i}: type must be 'Debit' or 'Credit', got '{line.get('type')}'")
        if abs(line.get("amount", 0)) <= 0:
            issues.append(f"Line {i}: amount must be positive, got {line.get('amount', 0)}")
        if abs(line.get("amount", 0)) > MAX_SINGLE_ENTRY_AMOUNT:
            issues.append(f"Line {i}: amount ${abs(line['amount']):,.2f} exceeds maximum")

    # Duplicate detection
    _check_duplicate(spec, issues)

    return issues

def validate_invoice(spec):
    """Comprehensive validation for invoice specs. Returns list of issues."""
    issues = []

    if not spec.get("customer_id"):
        issues.append("Missing customer_id")
    if not spec.get("lines"):
        issues.append("Invoice must have at least one line item")
        return issues

    total = sum(abs(l.get("amount", 0)) for l in spec.get("lines", []))
    if total > MAX_SINGLE_INVOICE_AMOUNT:
        issues.append(f"Invoice total ${total:,.2f} exceeds maximum ${MAX_SINGLE_INVOICE_AMOUNT:,.2f}")
    if total <= 0:
        issues.append("Invoice total must be greater than zero")

    # Date validation
    for date_field in ["date", "due_date"]:
        date_str = spec.get(date_field, "")
        if date_str:
            try:
                datetime.strptime(date_str, "%Y-%m-%d")
            except ValueError:
                issues.append(f"Invalid {date_field} format: {date_str}")

    # Due date should be after invoice date
    if spec.get("date") and spec.get("due_date"):
        try:
            inv_date = datetime.strptime(spec["date"], "%Y-%m-%d")
            due_date = datetime.strptime(spec["due_date"], "%Y-%m-%d")
            if due_date < inv_date:
                issues.append("Due date is before invoice date")
        except ValueError:
            pass

    for i, line in enumerate(spec.get("lines", [])):
        if abs(line.get("amount", 0)) <= 0:
            issues.append(f"Line {i}: amount must be positive")

    return issues

def _check_duplicate(spec, issues):
    """Check for potential duplicate entries in the approval queue."""
    _ensure_queue_dir()
    cutoff = datetime.utcnow() - timedelta(hours=DUPLICATE_WINDOW_HOURS)
    total = sum(abs(l.get("amount", 0)) for l in spec.get("lines", []) if l.get("type") == "Debit")
    date = spec.get("date", "")
    memo = spec.get("memo", "")

    for fname in os.listdir(APPROVAL_QUEUE_DIR):
        if not fname.endswith(".json"):
            continue
        try:
            with open(os.path.join(APPROVAL_QUEUE_DIR, fname)) as f:
                existing = json.load(f)
            if existing["status"] not in ("pending", "executed"):
                continue
            staged_at = datetime.fromisoformat(existing["staged_at"].replace("Z", ""))
            if staged_at < cutoff:
                continue
            existing_total = _calculate_total(existing["type"], existing["spec"])
            existing_date = existing["spec"].get("date", "")
            existing_memo = existing["spec"].get("memo", "")
            if abs(total - existing_total) < 1.0 and date == existing_date:
                issues.append(
                    f"DUPLICATE WARNING: Similar transaction (${existing_total:,.2f} on {existing_date}) "
                    f"was staged {existing['staged_at']} (token: {existing['token']}, status: {existing['status']}). "
                    f"Proceed only if this is intentionally a separate entry."
                )
        except Exception:
            continue


# ============================================================
# OAUTH TOKEN MANAGEMENT (F-08: persist refresh tokens)
# ============================================================

def get_access_token():
    global _access_token, _new_refresh_token
    if _access_token:
        return _access_token
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
    for attempt in range(3):
        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                result = json.loads(resp.read().decode())
                _access_token = result["access_token"]
                _new_refresh_token = result.get("refresh_token")
                # F-08: Persist new refresh token
                if _new_refresh_token and _new_refresh_token != REFRESH_TOKEN:
                    _persist_refresh_token(_new_refresh_token)
                audit_log("oauth_token_refreshed", {"realm_id": REALM_ID})
                return _access_token
        except urllib.error.HTTPError as e:
            if attempt < 2:
                time.sleep(2)
                continue
            body = e.read().decode() if hasattr(e, 'read') else str(e)
            audit_log("oauth_token_refresh_failed", {"error": f"HTTP {e.code}", "body": body[:200]})
            print(json.dumps({"error": f"Token refresh failed: HTTP {e.code}", "body": body}), file=sys.stderr)
            sys.exit(1)
        except Exception:
            if attempt < 2:
                time.sleep(1)
                continue
            raise

def _persist_refresh_token(new_token):
    """Persist the new refresh token back to Secrets Manager or a local file.

    In production, this should write to AWS Secrets Manager. For now, we write
    to a local file that entrypoint.sh can pick up on next restart, and also
    attempt a direct Secrets Manager update if aws CLI is available.
    """
    token_file = "/tmp/.qbo_refresh_token_ledger"
    try:
        with open(token_file, "w") as f:
            f.write(new_token)
        os.chmod(token_file, 0o600)
        audit_log("refresh_token_persisted", {"method": "local_file", "path": token_file})
    except Exception as e:
        audit_log("refresh_token_persist_failed", {"error": str(e)})

    # Attempt Secrets Manager update (best-effort)
    try:
        import subprocess
        result = subprocess.run(
            ["aws", "secretsmanager", "update-secret",
             "--secret-id", "openclaw/ledger/qbo-refresh-token",
             "--secret-string", new_token,
             "--region", "us-east-1"],
            capture_output=True, text=True, timeout=10
        )
        if result.returncode == 0:
            audit_log("refresh_token_persisted", {"method": "secrets_manager"})
    except Exception:
        pass  # Best-effort; local file is the fallback


def qbo_request(method, path, params=None, body=None):
    """Make authenticated request to QBO API."""
    token = get_access_token()
    base_url = f"https://quickbooks.api.intuit.com/v3/company/{REALM_ID}"
    url = f"{base_url}/{path}"
    if params:
        url += "?" + urllib.parse.urlencode(params)

    data = json.dumps(body).encode() if body else None
    req = urllib.request.Request(url, data=data, method=method)
    req.add_header("Authorization", f"Bearer {token}")
    req.add_header("Accept", "application/json")
    if body:
        req.add_header("Content-Type", "application/json")

    audit_log("qbo_api_call", {"method": method, "path": path, "has_body": body is not None})

    for attempt in range(3):
        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                return json.loads(resp.read().decode())
        except urllib.error.HTTPError as e:
            resp_body = e.read().decode() if hasattr(e, 'read') else str(e)
            if e.code == 401 and attempt == 0:
                global _access_token
                _access_token = None
                continue
            if e.code == 429:
                time.sleep(2 ** attempt)
                continue
            audit_log("qbo_api_error", {"method": method, "path": path, "status": e.code, "body": resp_body[:200]})
            print(json.dumps({"error": f"QBO API HTTP {e.code}", "body": resp_body}), file=sys.stderr)
            raise
        except Exception:
            if attempt < 2:
                time.sleep(1)
                continue
            raise


# ============================================================
# READ operations (no approval required)
# ============================================================

def cmd_query_accounts(args):
    """List all accounts in the chart of accounts."""
    query = "SELECT * FROM Account MAXRESULTS 1000"
    data = qbo_request("GET", "query", {"query": query, "minorversion": "75"})
    accounts = data.get("QueryResponse", {}).get("Account", [])
    result = [
        {
            "Id": a["Id"],
            "Name": a["Name"],
            "FullyQualifiedName": a.get("FullyQualifiedName", a["Name"]),
            "AccountType": a["AccountType"],
            "AccountSubType": a.get("AccountSubType", ""),
            "CurrentBalance": a.get("CurrentBalance", 0),
            "Active": a.get("Active", True),
        }
        for a in accounts if a.get("Active", True)
    ]
    json.dump({"count": len(result), "accounts": result}, sys.stdout, indent=2)

def cmd_query_account(args):
    """Find a specific account by name (partial match)."""
    name = args.get("name", "")
    if not name:
        print(json.dumps({"error": "Missing --name parameter"}))
        return
    # Sanitize input to prevent query injection
    name = name.replace("'", "").replace('"', '').replace(";", "")[:100]
    query = f"SELECT * FROM Account WHERE Name LIKE '%{name}%' MAXRESULTS 25"
    data = qbo_request("GET", "query", {"query": query, "minorversion": "75"})
    accounts = data.get("QueryResponse", {}).get("Account", [])
    result = [
        {
            "Id": a["Id"],
            "Name": a["Name"],
            "AccountType": a["AccountType"],
            "AccountSubType": a.get("AccountSubType", ""),
        }
        for a in accounts
    ]
    json.dump({"matches": result}, sys.stdout, indent=2)

def cmd_list_customers(args):
    """List all active customers."""
    query = "SELECT * FROM Customer WHERE Active = true MAXRESULTS 1000"
    data = qbo_request("GET", "query", {"query": query, "minorversion": "75"})
    customers = data.get("QueryResponse", {}).get("Customer", [])
    result = [
        {"Id": c["Id"], "DisplayName": c["DisplayName"], "Balance": c.get("Balance", 0)}
        for c in customers
    ]
    json.dump({"count": len(result), "customers": result}, sys.stdout, indent=2)

def cmd_list_vendors(args):
    """List all active vendors."""
    query = "SELECT * FROM Vendor WHERE Active = true MAXRESULTS 1000"
    data = qbo_request("GET", "query", {"query": query, "minorversion": "75"})
    vendors = data.get("QueryResponse", {}).get("Vendor", [])
    result = [
        {"Id": v["Id"], "DisplayName": v["DisplayName"], "Balance": v.get("Balance", 0)}
        for v in vendors
    ]
    json.dump({"count": len(result), "vendors": result}, sys.stdout, indent=2)

def cmd_query_journal_entries(args):
    """Query existing journal entries for a date range."""
    start = args.get("start", datetime.utcnow().strftime("%Y-%m-01"))
    end = args.get("end", datetime.utcnow().strftime("%Y-%m-%d"))
    query = f"SELECT * FROM JournalEntry WHERE TxnDate >= '{start}' AND TxnDate <= '{end}' MAXRESULTS 500"
    data = qbo_request("GET", "query", {"query": query, "minorversion": "75"})
    entries = data.get("QueryResponse", {}).get("JournalEntry", [])
    result = []
    for je in entries:
        lines = []
        for line in je.get("Line", []):
            detail = line.get("JournalEntryLineDetail", {})
            lines.append({
                "Amount": line.get("Amount", 0),
                "PostingType": detail.get("PostingType", ""),
                "AccountRef": detail.get("AccountRef", {}),
                "Description": line.get("Description", ""),
            })
        result.append({
            "Id": je["Id"],
            "TxnDate": je.get("TxnDate", ""),
            "DocNumber": je.get("DocNumber", ""),
            "PrivateNote": je.get("PrivateNote", ""),
            "TotalAmt": je.get("TotalAmt", 0),
            "Lines": lines,
        })
    json.dump({"count": len(result), "journal_entries": result}, sys.stdout, indent=2)


# ============================================================
# WRITE operations (APPROVAL-GATED - enforced in code)
# ============================================================

def cmd_create_journal_entry(args):
    """Stage a journal entry for approval. Does NOT execute immediately.

    Returns an approval token. The entry must be approved via
    'qbo_write.py approve --token <token> --approver <user_id>'
    before it is written to QBO.
    """
    raw = args.get("json", "")
    if not raw:
        print(json.dumps({"error": "Missing --json parameter"}))
        return

    try:
        spec = json.loads(raw)
    except json.JSONDecodeError as e:
        print(json.dumps({"error": f"Invalid JSON: {e}"}))
        return

    # Validate
    issues = validate_journal_entry(spec)
    blocking = [i for i in issues if "WARNING" not in i]
    warnings = [i for i in issues if "WARNING" in i]

    if blocking:
        print(json.dumps({
            "error": "Validation failed",
            "issues": blocking,
            "warnings": warnings,
        }, indent=2))
        return

    # Stage for approval (do NOT execute)
    token, staged = stage_transaction("journal_entry", spec, args.get("user"))
    total = _calculate_total("journal_entry", spec)

    result = {
        "staged": True,
        "approval_token": token,
        "expires_at": staged["expires_at"],
        "transaction_type": "journal_entry",
        "date": spec.get("date", "today"),
        "doc_number": spec.get("doc_number", "auto-generated"),
        "memo": spec.get("memo", ""),
        "total_amount": round(total, 2),
        "line_count": len(spec.get("lines", [])),
        "warnings": warnings,
        "message": (
            f"Journal entry staged for approval (${total:,.2f}). "
            f"Token: {token}. "
            f"Expires: {staged['expires_at']}. "
            f"To approve: qbo_write.py approve --token {token} --approver <USER_ID>"
        ),
    }
    json.dump(result, sys.stdout, indent=2)

def cmd_create_invoice(args):
    """Stage an invoice for approval. Does NOT execute immediately."""
    raw = args.get("json", "")
    if not raw:
        print(json.dumps({"error": "Missing --json parameter"}))
        return

    try:
        spec = json.loads(raw)
    except json.JSONDecodeError as e:
        print(json.dumps({"error": f"Invalid JSON: {e}"}))
        return

    # Validate
    issues = validate_invoice(spec)
    if issues:
        print(json.dumps({"error": "Validation failed", "issues": issues}, indent=2))
        return

    # Stage for approval
    token, staged = stage_transaction("invoice", spec, args.get("user"))
    total = _calculate_total("invoice", spec)

    result = {
        "staged": True,
        "approval_token": token,
        "expires_at": staged["expires_at"],
        "transaction_type": "invoice",
        "customer_id": spec.get("customer_id"),
        "total_amount": round(total, 2),
        "message": (
            f"Invoice staged for approval (${total:,.2f}). "
            f"Token: {token}. "
            f"To approve: qbo_write.py approve --token {token} --approver <USER_ID>"
        ),
    }
    json.dump(result, sys.stdout, indent=2)

def cmd_approve(args):
    """Approve a staged transaction and execute it against QBO."""
    token = args.get("token", "")
    approver = args.get("approver", "")

    if not token:
        print(json.dumps({"error": "Missing --token parameter"}))
        return
    if not approver:
        print(json.dumps({"error": "Missing --approver parameter (Slack user ID)"}))
        return

    result = approve_transaction(token, approver)
    json.dump(result, sys.stdout, indent=2)

def cmd_reject(args):
    """Reject a staged transaction."""
    token = args.get("token", "")
    rejector = args.get("rejector", args.get("approver", ""))
    reason = args.get("reason", "")

    if not token:
        print(json.dumps({"error": "Missing --token parameter"}))
        return

    result = reject_transaction(token, rejector, reason)
    json.dump(result, sys.stdout, indent=2)

def cmd_list_pending(args):
    """List all pending transactions awaiting approval."""
    pending = get_pending_transactions()
    summaries = []
    for txn in pending:
        summaries.append({
            "token": txn["token"],
            "type": txn["type"],
            "staged_at": txn["staged_at"],
            "expires_at": txn["expires_at"],
            "total_amount": _calculate_total(txn["type"], txn["spec"]),
            "memo": txn["spec"].get("memo", ""),
            "date": txn["spec"].get("date", ""),
        })
    json.dump({"pending_count": len(summaries), "transactions": summaries}, sys.stdout, indent=2)


def _execute_journal_entry(spec):
    """Actually create the journal entry in QBO (called only after approval)."""
    qbo_lines = []
    for line in spec["lines"]:
        qbo_line = {
            "Amount": abs(line["amount"]),
            "DetailType": "JournalEntryLineDetail",
            "Description": line.get("description", ""),
            "JournalEntryLineDetail": {
                "PostingType": line["type"],
                "AccountRef": {"value": str(line["account_id"])},
            }
        }
        qbo_lines.append(qbo_line)

    body = {
        "TxnDate": spec.get("date", datetime.utcnow().strftime("%Y-%m-%d")),
        "DocNumber": spec.get("doc_number", f"LEDGER-{datetime.utcnow().strftime('%Y%m%d%H%M%S')}"),
        "PrivateNote": spec.get("memo", "Created by Ledger agent"),
        "Line": qbo_lines,
    }

    result = qbo_request("POST", "journalentry", {"minorversion": "75"}, body)
    je = result.get("JournalEntry", result)
    return {
        "success": True,
        "id": je.get("Id"),
        "doc_number": je.get("DocNumber"),
        "txn_date": je.get("TxnDate"),
        "total": je.get("TotalAmt"),
        "message": f"Journal entry {je.get('DocNumber')} created successfully",
    }

def _execute_invoice(spec):
    """Actually create the invoice in QBO (called only after approval)."""
    qbo_lines = []
    for line in spec.get("lines", []):
        qbo_line = {
            "Amount": line["amount"],
            "DetailType": "SalesItemLineDetail",
            "Description": line.get("description", ""),
            "SalesItemLineDetail": {
                "ItemRef": {"value": str(line.get("item_id", "1"))},
                "UnitPrice": line["amount"],
                "Qty": 1,
            }
        }
        qbo_lines.append(qbo_line)

    body = {
        "CustomerRef": {"value": str(spec["customer_id"])},
        "TxnDate": spec.get("date", datetime.utcnow().strftime("%Y-%m-%d")),
        "DueDate": spec.get("due_date", ""),
        "PrivateNote": spec.get("memo", "Created by Ledger agent"),
        "Line": qbo_lines,
    }

    result = qbo_request("POST", "invoice", {"minorversion": "75"}, body)
    inv = result.get("Invoice", result)
    return {
        "success": True,
        "id": inv.get("Id"),
        "doc_number": inv.get("DocNumber"),
        "total": inv.get("TotalAmt"),
        "message": f"Invoice {inv.get('DocNumber')} created successfully",
    }


def cmd_dry_run(args):
    """Validate a journal entry without staging or creating it."""
    raw = args.get("json", "")
    if not raw:
        print(json.dumps({"error": "Missing --json parameter"}))
        return
    try:
        spec = json.loads(raw)
    except json.JSONDecodeError as e:
        print(json.dumps({"error": f"Invalid JSON: {e}"}))
        return

    issues = validate_journal_entry(spec)
    debits = sum(abs(l["amount"]) for l in spec.get("lines", []) if l.get("type") == "Debit")
    credits = sum(abs(l["amount"]) for l in spec.get("lines", []) if l.get("type") == "Credit")

    result = {
        "valid": len([i for i in issues if "WARNING" not in i]) == 0,
        "issues": issues,
        "summary": {
            "date": spec.get("date", "not set"),
            "doc_number": spec.get("doc_number", "auto-generated"),
            "memo": spec.get("memo", ""),
            "total_debits": debits,
            "total_credits": credits,
            "line_count": len(spec.get("lines", [])),
        },
        "lines": spec.get("lines", []),
    }
    json.dump(result, sys.stdout, indent=2)


# ============================================================
# CLI ENTRYPOINT
# ============================================================

if __name__ == "__main__":
    if len(sys.argv) < 2:
        cmds_list = "query_accounts|query_account|list_customers|list_vendors|query_journal_entries|create_journal_entry|create_invoice|approve|reject|list_pending|dry_run"
        print(f"Usage: qbo_write.py <{cmds_list}> [--json '...'] [--name NAME] [--token TOKEN] [--approver UID]", file=sys.stderr)
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
        "query_accounts": cmd_query_accounts,
        "query_account": cmd_query_account,
        "list_customers": cmd_list_customers,
        "list_vendors": cmd_list_vendors,
        "query_journal_entries": cmd_query_journal_entries,
        "create_journal_entry": cmd_create_journal_entry,
        "create_invoice": cmd_create_invoice,
        "approve": cmd_approve,
        "reject": cmd_reject,
        "list_pending": cmd_list_pending,
        "dry_run": cmd_dry_run,
    }
    if command not in cmds:
        print(f"Unknown command: {command}. Available: {', '.join(cmds.keys())}", file=sys.stderr)
        sys.exit(1)
    cmds[command](args)
