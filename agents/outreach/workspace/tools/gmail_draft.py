#!/usr/bin/env python3
"""Gmail draft creation and listing for Outreach agent.

Usage:
  python3 tools/gmail_draft.py create --to "email" --subject "..." --body "..." --impersonate "david@lmntl.ai"
  python3 tools/gmail_draft.py list --impersonate "david@lmntl.ai" [--max-results 10]

Auth: GOOGLE_SHEETS_SA_KEY env var (service account with domain-wide delegation)
Uses Gmail API v1 with service account impersonation via urllib.request.

Outputs JSON to stdout.
"""
import os, sys, json, time, urllib.request, urllib.error, urllib.parse
import base64


def b64url(data):
    """Base64url encode bytes."""
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


def create_jwt(sa_key, scopes, subject=None):
    """Create a signed JWT for Google service account auth with optional impersonation."""
    now = int(time.time())
    header = {"alg": "RS256", "typ": "JWT"}
    payload = {
        "iss": sa_key["client_email"],
        "scope": scopes,
        "aud": "https://oauth2.googleapis.com/token",
        "iat": now,
        "exp": now + 3600,
    }
    if subject:
        payload["sub"] = subject

    segments = b64url(json.dumps(header).encode()) + "." + b64url(json.dumps(payload).encode())

    # Sign with RSA-SHA256 using the private key
    try:
        from cryptography.hazmat.primitives import hashes, serialization
        from cryptography.hazmat.primitives.asymmetric import padding

        private_key = serialization.load_pem_private_key(
            sa_key["private_key"].encode(), password=None
        )
        signature = private_key.sign(
            segments.encode(), padding.PKCS1v15(), hashes.SHA256()
        )
    except ImportError:
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


def get_access_token(sa_key, scopes, subject=None):
    """Exchange JWT for access token."""
    jwt = create_jwt(sa_key, scopes, subject)

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


def gmail_request(access_token, method, path, body=None):
    """Make authenticated request to Gmail API with retry."""
    url = f"https://gmail.googleapis.com/gmail/v1/users/me/{path}"

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
            return {"error": f"Gmail API HTTP {e.code}", "body": body_text[:500]}
        except Exception as e:
            if attempt < 2:
                time.sleep(1)
                continue
            return {"error": str(e)}
    return {"error": "Max retries exceeded"}


def build_mime_message(to, subject, body_text, from_addr=None):
    """Build a simple MIME email message and return base64url-encoded string."""
    lines = []
    if from_addr:
        lines.append(f"From: {from_addr}")
    lines.append(f"To: {to}")
    lines.append(f"Subject: {subject}")
    lines.append("MIME-Version: 1.0")
    lines.append("Content-Type: text/plain; charset=utf-8")
    lines.append("")
    lines.append(body_text)

    raw = "\r\n".join(lines)
    return base64.urlsafe_b64encode(raw.encode("utf-8")).decode("ascii")


def cmd_create(args):
    """Create a Gmail draft."""
    sa_key = get_sa_key()
    if not sa_key:
        json.dump({"error": "GOOGLE_SHEETS_SA_KEY not set or invalid"}, sys.stdout, indent=2)
        return

    to = args.get("to", "")
    subject = args.get("subject", "")
    body_text = args.get("body", "")
    impersonate = args.get("impersonate", "")

    if not to or not subject or not body_text:
        json.dump({"error": "--to, --subject, and --body are required"}, sys.stdout, indent=2)
        return

    if not impersonate:
        json.dump({"error": "--impersonate is required (email of user to send as)"}, sys.stdout, indent=2)
        return

    access_token = get_access_token(
        sa_key,
        "https://www.googleapis.com/auth/gmail.compose",
        subject=impersonate,
    )
    if not access_token:
        json.dump({"error": "Failed to obtain access token"}, sys.stdout, indent=2)
        return

    raw_message = build_mime_message(to, subject, body_text, from_addr=impersonate)

    draft_body = {
        "message": {
            "raw": raw_message,
        }
    }

    data = gmail_request(access_token, "POST", "drafts", draft_body)
    if "error" in data:
        json.dump(data, sys.stdout, indent=2)
        return

    json.dump({
        "status": "draft_created",
        "draft_id": data.get("id", ""),
        "message_id": data.get("message", {}).get("id", ""),
        "thread_id": data.get("message", {}).get("threadId", ""),
    }, sys.stdout, indent=2)


def cmd_list(args):
    """List Gmail drafts."""
    sa_key = get_sa_key()
    if not sa_key:
        json.dump({"error": "GOOGLE_SHEETS_SA_KEY not set or invalid"}, sys.stdout, indent=2)
        return

    impersonate = args.get("impersonate", "")
    max_results = int(args.get("max-results", "10"))

    if not impersonate:
        json.dump({"error": "--impersonate is required (email of user to list drafts for)"}, sys.stdout, indent=2)
        return

    access_token = get_access_token(
        sa_key,
        "https://www.googleapis.com/auth/gmail.compose",
        subject=impersonate,
    )
    if not access_token:
        json.dump({"error": "Failed to obtain access token"}, sys.stdout, indent=2)
        return

    path = f"drafts?maxResults={max_results}"
    data = gmail_request(access_token, "GET", path)
    if "error" in data:
        json.dump(data, sys.stdout, indent=2)
        return

    drafts = []
    for draft in data.get("drafts", []):
        draft_id = draft.get("id", "")
        # Fetch each draft's details to get subject/to
        detail = gmail_request(access_token, "GET", f"drafts/{draft_id}?format=metadata&metadataHeaders=Subject&metadataHeaders=To")
        if "error" in detail:
            drafts.append({"draft_id": draft_id, "error": detail["error"]})
            continue

        headers = detail.get("message", {}).get("payload", {}).get("headers", [])
        header_map = {h["name"]: h["value"] for h in headers}

        drafts.append({
            "draft_id": draft_id,
            "message_id": detail.get("message", {}).get("id", ""),
            "subject": header_map.get("Subject", ""),
            "to": header_map.get("To", ""),
            "snippet": detail.get("message", {}).get("snippet", "")[:200],
        })

    json.dump({
        "impersonate": impersonate,
        "draft_count": len(drafts),
        "drafts": drafts,
    }, sys.stdout, indent=2)


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: gmail_draft.py <create|list> [--to EMAIL] [--subject S] [--body B] [--impersonate EMAIL] [--max-results N]", file=sys.stderr)
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
        "create": cmd_create,
        "list": cmd_list,
    }
    if command not in cmds:
        print(f"Unknown command: {command}. Available: {', '.join(cmds.keys())}", file=sys.stderr)
        sys.exit(1)
    cmds[command](args)
