#!/usr/bin/env python3
"""Apollo.io people search and enrichment for Outreach agent.

Usage:
  python3 tools/apollo_search.py search --titles "CEO,CFO" --domain "example.com" [--per-page 5]
  python3 tools/apollo_search.py enrich --first-name "John" --last-name "Doe" --domain "example.com" [--org "Company"]

Auth: APOLLO_API_KEY env var

Outputs JSON to stdout. Read-only -- no mutations.
"""
import os, sys, json, time, urllib.request, urllib.error


def get_api_key():
    """Get Apollo API key from environment."""
    key = os.environ.get("APOLLO_API_KEY", "")
    if not key or key == "null":
        return None
    return key


def apollo_request(api_key, path, body):
    """Make authenticated POST request to Apollo API with retry."""
    url = f"https://api.apollo.io/api/v1/{path}"
    data = json.dumps(body).encode("utf-8")

    req = urllib.request.Request(url, data=data, method="POST")
    req.add_header("x-api-key", api_key)
    req.add_header("Content-Type", "application/json")
    req.add_header("Accept", "application/json")
    req.add_header("User-Agent", "OpenClaw-Outreach/1.0")

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
            return {"error": f"Apollo API HTTP {e.code}", "body": body_text[:500]}
        except Exception as e:
            if attempt < 2:
                time.sleep(1)
                continue
            return {"error": str(e)}
    return {"error": "Max retries exceeded"}


def cmd_search(args):
    """Search for people by title and domain."""
    api_key = get_api_key()
    if not api_key:
        json.dump({"error": "APOLLO_API_KEY not set"}, sys.stdout, indent=2)
        return

    titles = args.get("titles", "")
    domain = args.get("domain", "")
    per_page = int(args.get("per-page", "5"))

    if not titles or not domain:
        json.dump({"error": "Both --titles and --domain are required"}, sys.stdout, indent=2)
        return

    person_titles = [t.strip() for t in titles.split(",")]

    body = {
        "person_titles": person_titles,
        "q_organization_domains": domain,
        "per_page": per_page,
    }

    data = apollo_request(api_key, "mixed_people/api_search", body)
    if "error" in data:
        json.dump(data, sys.stdout, indent=2)
        return

    people = []
    for person in data.get("people", []):
        people.append({
            "name": person.get("name", ""),
            "title": person.get("title", ""),
            "email": person.get("email", ""),
            "linkedin_url": person.get("linkedin_url", ""),
            "organization_name": person.get("organization", {}).get("name", "") if person.get("organization") else "",
            "city": person.get("city", ""),
            "state": person.get("state", ""),
        })

    json.dump(people, sys.stdout, indent=2)


def cmd_enrich(args):
    """Enrich a specific person's contact details."""
    api_key = get_api_key()
    if not api_key:
        json.dump({"error": "APOLLO_API_KEY not set"}, sys.stdout, indent=2)
        return

    first_name = args.get("first-name", "")
    last_name = args.get("last-name", "")
    domain = args.get("domain", "")

    if not first_name or not last_name or not domain:
        json.dump({"error": "--first-name, --last-name, and --domain are required"}, sys.stdout, indent=2)
        return

    body = {
        "first_name": first_name,
        "last_name": last_name,
        "domain": domain,
        "reveal_personal_emails": True,
        # Note: reveal_phone_number requires webhook_url, omitted for now
    }

    org = args.get("org", "")
    if org:
        body["organization_name"] = org

    data = apollo_request(api_key, "people/match", body)
    if "error" in data:
        json.dump(data, sys.stdout, indent=2)
        return

    person = data.get("person", data)
    result = {
        "name": person.get("name", ""),
        "title": person.get("title", ""),
        "email": person.get("email", ""),
        "personal_emails": person.get("personal_emails", []),
        "phone_numbers": [p.get("sanitized_number", "") for p in person.get("phone_numbers", [])],
        "linkedin_url": person.get("linkedin_url", ""),
        "organization_name": person.get("organization", {}).get("name", "") if person.get("organization") else "",
        "city": person.get("city", ""),
        "state": person.get("state", ""),
        "country": person.get("country", ""),
        "headline": person.get("headline", ""),
    }

    json.dump(result, sys.stdout, indent=2)


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: apollo_search.py <search|enrich> [--titles T] [--domain D] [--per-page N]", file=sys.stderr)
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
        "search": cmd_search,
        "enrich": cmd_enrich,
    }
    if command not in cmds:
        print(f"Unknown command: {command}. Available: {', '.join(cmds.keys())}", file=sys.stderr)
        sys.exit(1)
    cmds[command](args)
