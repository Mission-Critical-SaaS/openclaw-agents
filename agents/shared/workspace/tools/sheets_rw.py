#!/usr/bin/env python3
"""Google Sheets read/append/update for shared agent tools.

Usage:
  python3 tools/sheets_rw.py read --sheet-id "SHEET_ID" --tab "TabName" [--range "A1:Z100"]
  python3 tools/sheets_rw.py append --sheet-id "SHEET_ID" --tab "TabName" --row '{"col1":"val1","col2":"val2"}'
  python3 tools/sheets_rw.py update --sheet-id "SHEET_ID" --tab "TabName" --row-index N --data '{"col1":"val1"}'

Auth: GOOGLE_SHEETS_SA_KEY env var (JSON service account key string)
Uses Google Sheets API v4 with service account JWT auth via urllib.request.

Outputs JSON to stdout.
"""
import os, sys, json, time, urllib.request, urllib.error, urllib.parse
import base64, hashlib, hmac
from datetime import datetime, timezone


def b64url(data):
    """Base64url encode bytes."""
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


def create_jwt(sa_key, scopes):
    """Create a signed JWT for Google service account auth."""
    now = int(time.time())
    header = {"alg": "RS256", "typ": "JWT"}
    payload = {
        "iss": sa_key["client_email"],
        "scope": scopes,
        "aud": "https://oauth2.googleapis.com/token",
        "iat": now,
        "exp": now + 3600,
    }

    segments = b64url(json.dumps(header).encode()) + "." + b64url(json.dumps(payload).encode())

    # Sign with RSA-SHA256 using the private key
    try:
        # Try using cryptography library first (installed with google-auth)
        from cryptography.hazmat.primitives import hashes, serialization
        from cryptography.hazmat.primitives.asymmetric import padding

        private_key = serialization.load_pem_private_key(
            sa_key["private_key"].encode(), password=None
        )
        signature = private_key.sign(
            segments.encode(), padding.PKCS1v15(), hashes.SHA256()
        )
    except ImportError:
        # Fallback: use subprocess to call openssl
        import subprocess, tempfile

        with tempfile.NamedTemporaryFile(mode="w", suffix=".pem", delete=False) as f:
            f.write(sa_key["private_key"])
            key_file = f.name

        try:
            proc = subprocess.run(
                ["openssl", "dgst", "-sha256", "-sign", key_file],
                input=segments.encode(),
                capture_output=True,
            )
            signature = proc.stdout
        finally:
            os.unlink(key_file)

    return segments + "." + b64url(signature)


def get_access_token(sa_key, scopes="https://www.googleapis.com/auth/spreadsheets"):
    """Exchange JWT for access token."""
    jwt = create_jwt(sa_key, scopes)

    data = urllib.parse.urlencode({
        "grant_type": "urn:ietf:params:oauth:grant-type:jwt-bearer",
        "assertion": jwt,
    }).encode()

    req = urllib.request.Request("https://oauth2.googleapis.com/token", data=data, method="POST")
    req.add_header("Content-Type", "application/x-www-form-urlencoded")
    req.add_header("User-Agent", "OpenClaw-Agent/1.0")

    for attempt in range(3):
        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                result = json.loads(resp.read().decode())
                return result.get("access_token")
        except Exception as e:
            if attempt < 2:
                time.sleep(2 ** attempt)
                continue
            return None
    return None


def get_sa_key():
    """Parse service account key from environment."""
    raw = os.environ.get("GOOGLE_SHEETS_SA_KEY", "")
    if not raw or raw == "null":
        return None
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        return None


def sheets_request(access_token, method, path, body=None):
    """Make authenticated request to Google Sheets API with retry."""
    url = f"https://sheets.googleapis.com/v4/spreadsheets/{path}"

    if body is not None:
        data = json.dumps(body).encode("utf-8")
    else:
        data = None

    req = urllib.request.Request(url, data=data, method=method)
    req.add_header("Authorization", f"Bearer {access_token}")
    req.add_header("Accept", "application/json")
    req.add_header("User-Agent", "OpenClaw-Agent/1.0")
    if data:
        req.add_header("Content-Type", "application/json")

    for attempt in range(3):
        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                return json.loads(resp.read().decode())
        except urllib.error.HTTPError as e:
            body_text = e.read().decode() if hasattr(e, "read") else str(e)
            if e.code == 429:
                retry_after = int(e.headers.get("Retry-After", 2 ** attempt))
                time.sleep(retry_after)
                continue
            if attempt < 2 and e.code >= 500:
                time.sleep(2 ** attempt)
                continue
            return {"error": f"Sheets API HTTP {e.code}", "body": body_text[:500]}
        except Exception as e:
            if attempt < 2:
                time.sleep(1)
                continue
            return {"error": str(e)}
    return {"error": "Max retries exceeded"}


def cmd_read(args):
    """Read data from a Google Sheet tab."""
    sa_key = get_sa_key()
    if not sa_key:
        json.dump({"error": "GOOGLE_SHEETS_SA_KEY not set or invalid"}, sys.stdout, indent=2)
        return

    sheet_id = args.get("sheet-id", "")
    tab = args.get("tab", "")
    cell_range = args.get("range", "")

    if not sheet_id or not tab:
        json.dump({"error": "--sheet-id and --tab are required"}, sys.stdout, indent=2)
        return

    access_token = get_access_token(sa_key)
    if not access_token:
        json.dump({"error": "Failed to obtain access token"}, sys.stdout, indent=2)
        return

    range_str = f"{tab}!{cell_range}" if cell_range else tab
    encoded_range = urllib.parse.quote(range_str)
    path = f"{sheet_id}/values/{encoded_range}"

    data = sheets_request(access_token, "GET", path)
    if "error" in data:
        json.dump(data, sys.stdout, indent=2)
        return

    values = data.get("values", [])
    if not values:
        json.dump({"rows": [], "headers": []}, sys.stdout, indent=2)
        return

    headers = values[0]
    rows = []
    for row in values[1:]:
        row_dict = {}
        for idx, header in enumerate(headers):
            row_dict[header] = row[idx] if idx < len(row) else ""
        rows.append(row_dict)

    json.dump({"headers": headers, "row_count": len(rows), "rows": rows}, sys.stdout, indent=2)


def cmd_append(args):
    """Append a row to a Google Sheet tab."""
    sa_key = get_sa_key()
    if not sa_key:
        json.dump({"error": "GOOGLE_SHEETS_SA_KEY not set or invalid"}, sys.stdout, indent=2)
        return

    sheet_id = args.get("sheet-id", "")
    tab = args.get("tab", "")
    row_json = args.get("row", "")

    if not sheet_id or not tab or not row_json:
        json.dump({"error": "--sheet-id, --tab, and --row are required"}, sys.stdout, indent=2)
        return

    try:
        row_data = json.loads(row_json)
    except json.JSONDecodeError:
        json.dump({"error": "Invalid JSON in --row"}, sys.stdout, indent=2)
        return

    access_token = get_access_token(sa_key)
    if not access_token:
        json.dump({"error": "Failed to obtain access token"}, sys.stdout, indent=2)
        return

    # First read headers to align columns
    encoded_tab = urllib.parse.quote(tab)
    header_path = f"{sheet_id}/values/{encoded_tab}!1:1"
    header_data = sheets_request(access_token, "GET", header_path)

    if "error" in header_data:
        json.dump(header_data, sys.stdout, indent=2)
        return

    headers = header_data.get("values", [[]])[0]
    if not headers:
        json.dump({"error": "Sheet has no headers in row 1"}, sys.stdout, indent=2)
        return

    # Build row values aligned to headers
    row_values = [row_data.get(h, "") for h in headers]

    range_str = urllib.parse.quote(tab)
    path = f"{sheet_id}/values/{range_str}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS"

    body = {"values": [row_values]}
    data = sheets_request(access_token, "POST", path, body)

    if "error" in data:
        json.dump(data, sys.stdout, indent=2)
        return

    json.dump({
        "status": "appended",
        "updated_range": data.get("updates", {}).get("updatedRange", ""),
        "updated_rows": data.get("updates", {}).get("updatedRows", 0),
    }, sys.stdout, indent=2)


def cmd_update(args):
    """Update a specific row in a Google Sheet tab."""
    sa_key = get_sa_key()
    if not sa_key:
        json.dump({"error": "GOOGLE_SHEETS_SA_KEY not set or invalid"}, sys.stdout, indent=2)
        return

    sheet_id = args.get("sheet-id", "")
    tab = args.get("tab", "")
    row_index = args.get("row-index", "")
    data_json = args.get("data", "")

    if not sheet_id or not tab or not row_index or not data_json:
        json.dump({"error": "--sheet-id, --tab, --row-index, and --data are required"}, sys.stdout, indent=2)
        return

    try:
        row_index = int(row_index)
    except ValueError:
        json.dump({"error": "--row-index must be an integer"}, sys.stdout, indent=2)
        return

    try:
        update_data = json.loads(data_json)
    except json.JSONDecodeError:
        json.dump({"error": "Invalid JSON in --data"}, sys.stdout, indent=2)
        return

    access_token = get_access_token(sa_key)
    if not access_token:
        json.dump({"error": "Failed to obtain access token"}, sys.stdout, indent=2)
        return

    # Read headers
    encoded_tab = urllib.parse.quote(tab)
    header_path = f"{sheet_id}/values/{encoded_tab}!1:1"
    header_data = sheets_request(access_token, "GET", header_path)

    if "error" in header_data:
        json.dump(header_data, sys.stdout, indent=2)
        return

    headers = header_data.get("values", [[]])[0]
    if not headers:
        json.dump({"error": "Sheet has no headers in row 1"}, sys.stdout, indent=2)
        return

    # Row index is 0-based for data rows; sheet row = row_index + 2 (1-based, skip header)
    sheet_row = row_index + 2

    # Read existing row
    row_range = f"{tab}!A{sheet_row}:{chr(64 + len(headers))}{sheet_row}"
    encoded_range = urllib.parse.quote(row_range)
    existing = sheets_request(access_token, "GET", f"{sheet_id}/values/{encoded_range}")

    existing_values = existing.get("values", [[]])[0] if "values" in existing else [""] * len(headers)

    # Merge updates
    row_values = []
    for idx, header in enumerate(headers):
        if header in update_data:
            row_values.append(update_data[header])
        elif idx < len(existing_values):
            row_values.append(existing_values[idx])
        else:
            row_values.append("")

    path = f"{sheet_id}/values/{encoded_range}?valueInputOption=USER_ENTERED"
    body = {"values": [row_values]}
    result = sheets_request(access_token, "PUT", path, body)

    if "error" in result:
        json.dump(result, sys.stdout, indent=2)
        return

    json.dump({
        "status": "updated",
        "updated_range": result.get("updatedRange", ""),
        "updated_cells": result.get("updatedCells", 0),
    }, sys.stdout, indent=2)


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: sheets_rw.py <read|append|update> [--sheet-id ID] [--tab TAB] [--range R] [--row JSON] [--row-index N] [--data JSON]", file=sys.stderr)
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
        "read": cmd_read,
        "append": cmd_append,
        "update": cmd_update,
    }
    if command not in cmds:
        print(f"Unknown command: {command}. Available: {', '.join(cmds.keys())}", file=sys.stderr)
        sys.exit(1)
    cmds[command](args)
