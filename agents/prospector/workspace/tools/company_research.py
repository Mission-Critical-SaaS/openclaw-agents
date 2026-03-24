#!/usr/bin/env python3
"""Company research via USASpending and web scraping for Prospector agent.

Usage:
  python3 tools/company_research.py usaspending --keyword "company name" [--limit 5]
  python3 tools/company_research.py website --domain "example.com"

No auth needed -- USASpending API and web are public.

Outputs JSON to stdout. Read-only -- no mutations.
"""
import os, sys, json, time, urllib.request, urllib.error, urllib.parse, re


def http_request(url, method="GET", body=None, headers=None):
    """Make an HTTP request with retry logic."""
    if body is not None:
        data = json.dumps(body).encode("utf-8") if isinstance(body, dict) else body
    else:
        data = None

    req = urllib.request.Request(url, data=data, method=method)
    req.add_header("User-Agent", "openclaw-prospector/1.0")
    req.add_header("Accept", "application/json")
    if data and isinstance(body, dict):
        req.add_header("Content-Type", "application/json")
    if headers:
        for k, v in headers.items():
            req.add_header(k, v)

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
            return {"error": f"HTTP {e.code}", "body": body_text[:500]}
        except Exception as e:
            if attempt < 2:
                time.sleep(1)
                continue
            return {"error": str(e)}
    return {"error": "Max retries exceeded"}


def fetch_html(url, timeout=30):
    """Fetch raw HTML from a URL with retry logic."""
    req = urllib.request.Request(url, method="GET")
    req.add_header("User-Agent", "openclaw-prospector/1.0")
    req.add_header("Accept", "text/html,application/xhtml+xml,*/*")

    for attempt in range(3):
        try:
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                return {
                    "html": resp.read().decode("utf-8", errors="replace"),
                    "status": resp.status,
                    "url": resp.url,
                }
        except urllib.error.HTTPError as e:
            if attempt < 2 and e.code >= 500:
                time.sleep(2 ** attempt)
                continue
            return {"error": f"HTTP {e.code}", "status": e.code}
        except Exception as e:
            if attempt < 2:
                time.sleep(1)
                continue
            return {"error": str(e)}
    return {"error": "Max retries exceeded"}


def cmd_usaspending(args):
    """Search USASpending.gov for contract awards."""
    keyword = args.get("keyword", "")
    limit = int(args.get("limit", "5"))

    if not keyword:
        json.dump({"error": "--keyword is required"}, sys.stdout, indent=2)
        return

    body = {
        "filters": {
            "keywords": [keyword],
        },
        "fields": [
            "Award ID",
            "Recipient Name",
            "Total Obligation",
            "Description",
            "Awarding Agency",
            "Start Date",
            "End Date",
        ],
        "limit": limit,
        "page": 1,
        "sort": "Total Obligation",
        "order": "desc",
    }

    data = http_request(
        "https://api.usaspending.gov/api/v2/search/spending_by_award/",
        method="POST",
        body=body,
    )

    if "error" in data:
        json.dump(data, sys.stdout, indent=2)
        return

    results = []
    for award in data.get("results", []):
        results.append({
            "award_id": award.get("Award ID", ""),
            "recipient_name": award.get("Recipient Name", ""),
            "total_obligation": award.get("Total Obligation", ""),
            "description": (award.get("Description") or "")[:300],
            "agency": award.get("Awarding Agency", ""),
            "start_date": award.get("Start Date", ""),
            "end_date": award.get("End Date", ""),
        })

    json.dump({
        "keyword": keyword,
        "result_count": len(results),
        "results": results,
    }, sys.stdout, indent=2)


def cmd_website(args):
    """Fetch a company homepage and extract basic info."""
    domain = args.get("domain", "")
    if not domain:
        json.dump({"error": "--domain is required"}, sys.stdout, indent=2)
        return

    # Ensure domain has protocol
    url = f"https://{domain}" if not domain.startswith("http") else domain

    resp = fetch_html(url)
    if "error" in resp:
        json.dump({
            "domain": domain,
            "error": resp["error"],
            "status": resp.get("status", 0),
        }, sys.stdout, indent=2)
        return

    html = resp["html"]

    # Extract title
    title_match = re.search(r"<title[^>]*>(.*?)</title>", html, re.DOTALL | re.IGNORECASE)
    title = re.sub(r"\s+", " ", title_match.group(1)).strip() if title_match else ""

    # Extract meta description
    desc_match = re.search(
        r'<meta[^>]*name=["\']description["\'][^>]*content=["\'](.*?)["\']',
        html, re.DOTALL | re.IGNORECASE,
    )
    if not desc_match:
        desc_match = re.search(
            r'<meta[^>]*content=["\'](.*?)["\'][^>]*name=["\']description["\']',
            html, re.DOTALL | re.IGNORECASE,
        )
    description = re.sub(r"\s+", " ", desc_match.group(1)).strip() if desc_match else ""

    result = {
        "domain": domain,
        "title": title[:200],
        "description": description[:500],
        "status": resp["status"],
    }
    json.dump(result, sys.stdout, indent=2)


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: company_research.py <usaspending|website> [--keyword K] [--limit N] [--domain D]", file=sys.stderr)
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
        "usaspending": cmd_usaspending,
        "website": cmd_website,
    }
    if command not in cmds:
        print(f"Unknown command: {command}. Available: {', '.join(cmds.keys())}", file=sys.stderr)
        sys.exit(1)
    cmds[command](args)
