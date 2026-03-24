#!/usr/bin/env python3
"""RSS/Atom feed polling and article parsing for Harvest agent.

Usage:
  python3 tools/rss_poll.py poll --feed-url "https://..." [--max-articles 50] [--max-age-days 30]
  python3 tools/rss_poll.py parse --url "https://article-url"

No auth needed -- RSS feeds are public.

Outputs JSON to stdout. Read-only -- no mutations.
"""
import os, sys, json, time, urllib.request, urllib.error, re
from datetime import datetime, timedelta, timezone
from email.utils import parsedate_to_datetime
import xml.etree.ElementTree as ET


def fetch_url(url, timeout=30):
    """Fetch a URL with retry logic."""
    req = urllib.request.Request(url, method="GET")
    req.add_header("User-Agent", "openclaw-harvest/1.0")
    req.add_header("Accept", "*/*")

    for attempt in range(3):
        try:
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                return resp.read().decode("utf-8", errors="replace")
        except urllib.error.HTTPError as e:
            if e.code == 429:
                retry_after = int(e.headers.get("Retry-After", 2 ** attempt))
                time.sleep(retry_after)
                continue
            if attempt < 2 and e.code >= 500:
                time.sleep(2 ** attempt)
                continue
            return None
        except Exception:
            if attempt < 2:
                time.sleep(1)
                continue
            return None
    return None


def parse_date(date_str):
    """Parse various date formats from RSS/Atom feeds."""
    if not date_str:
        return None

    # Try RFC 2822 (RSS standard)
    try:
        return parsedate_to_datetime(date_str)
    except Exception:
        pass

    # Try ISO 8601 (Atom standard)
    for fmt in (
        "%Y-%m-%dT%H:%M:%S%z",
        "%Y-%m-%dT%H:%M:%SZ",
        "%Y-%m-%dT%H:%M:%S.%f%z",
        "%Y-%m-%dT%H:%M:%S.%fZ",
        "%Y-%m-%d %H:%M:%S",
        "%Y-%m-%d",
    ):
        try:
            dt = datetime.strptime(date_str.strip(), fmt)
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=timezone.utc)
            return dt
        except ValueError:
            continue
    return None


def parse_feed_xml(xml_text):
    """Parse RSS or Atom feed XML into a list of articles."""
    root = ET.fromstring(xml_text)
    articles = []

    # Detect Atom namespace
    ns = {"atom": "http://www.w3.org/2005/Atom"}

    # Try RSS 2.0 first
    for item in root.iter("item"):
        title = item.findtext("title", "").strip()
        link = item.findtext("link", "").strip()
        pub_date = item.findtext("pubDate", "").strip()
        description = item.findtext("description", "").strip()
        # Strip HTML from description
        summary = re.sub(r"<[^>]+>", "", description)[:500]
        articles.append({
            "title": title,
            "link": link,
            "published": pub_date,
            "summary": summary,
        })

    # Try Atom if no RSS items found
    if not articles:
        for entry in root.iter("{http://www.w3.org/2005/Atom}entry"):
            title = entry.findtext("{http://www.w3.org/2005/Atom}title", "").strip()
            link_el = entry.find("{http://www.w3.org/2005/Atom}link")
            link = link_el.get("href", "") if link_el is not None else ""
            published = entry.findtext("{http://www.w3.org/2005/Atom}published", "").strip()
            if not published:
                published = entry.findtext("{http://www.w3.org/2005/Atom}updated", "").strip()
            summary_raw = entry.findtext("{http://www.w3.org/2005/Atom}summary", "").strip()
            if not summary_raw:
                summary_raw = entry.findtext("{http://www.w3.org/2005/Atom}content", "").strip()
            summary = re.sub(r"<[^>]+>", "", summary_raw)[:500]
            articles.append({
                "title": title,
                "link": link,
                "published": published,
                "summary": summary,
            })

    return articles


def strip_html(html):
    """Basic HTML-to-text extraction without external libraries."""
    # Remove script and style blocks
    text = re.sub(r"<(script|style)[^>]*>.*?</\1>", "", html, flags=re.DOTALL | re.IGNORECASE)
    # Remove HTML tags
    text = re.sub(r"<[^>]+>", " ", text)
    # Decode common entities
    text = text.replace("&amp;", "&").replace("&lt;", "<").replace("&gt;", ">")
    text = text.replace("&quot;", '"').replace("&#39;", "'").replace("&nbsp;", " ")
    # Collapse whitespace
    text = re.sub(r"\s+", " ", text).strip()
    return text


def cmd_poll(args):
    """Poll an RSS/Atom feed and return recent articles."""
    feed_url = args.get("feed-url", "")
    max_articles = int(args.get("max-articles", "50"))
    max_age_days = int(args.get("max-age-days", "30"))

    if not feed_url:
        json.dump({"error": "--feed-url is required"}, sys.stdout, indent=2)
        return

    xml_text = fetch_url(feed_url)
    if xml_text is None:
        json.dump({"error": f"Failed to fetch feed: {feed_url}"}, sys.stdout, indent=2)
        return

    try:
        articles = parse_feed_xml(xml_text)
    except ET.ParseError as e:
        json.dump({"error": f"XML parse error: {str(e)}"}, sys.stdout, indent=2)
        return

    # Filter by age
    cutoff = datetime.now(timezone.utc) - timedelta(days=max_age_days)
    filtered = []
    for article in articles:
        pub_dt = parse_date(article["published"])
        if pub_dt and pub_dt < cutoff:
            continue
        filtered.append(article)
        if len(filtered) >= max_articles:
            break

    json.dump(filtered, sys.stdout, indent=2)


def cmd_parse(args):
    """Fetch an article URL and extract text content."""
    url = args.get("url", "")
    if not url:
        json.dump({"error": "--url is required"}, sys.stdout, indent=2)
        return

    html = fetch_url(url)
    if html is None:
        json.dump({"error": f"Failed to fetch article: {url}"}, sys.stdout, indent=2)
        return

    # Extract title from <title> tag
    title_match = re.search(r"<title[^>]*>(.*?)</title>", html, re.DOTALL | re.IGNORECASE)
    title = strip_html(title_match.group(1)) if title_match else ""

    # Try to extract article body from common containers
    body_text = ""
    for tag in ("article", "main", r'div[^>]*class="[^"]*content[^"]*"'):
        match = re.search(rf"<{tag}[^>]*>(.*?)</{tag.split('[')[0]}>", html, re.DOTALL | re.IGNORECASE)
        if match:
            body_text = strip_html(match.group(1))
            break

    # Fallback: extract from <body>
    if not body_text:
        body_match = re.search(r"<body[^>]*>(.*?)</body>", html, re.DOTALL | re.IGNORECASE)
        if body_match:
            body_text = strip_html(body_match.group(1))

    # Truncate to reasonable size
    body_text = body_text[:10000]

    result = {
        "title": title,
        "text": body_text,
        "url": url,
    }
    json.dump(result, sys.stdout, indent=2)


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: rss_poll.py <poll|parse> [--feed-url URL] [--max-articles N] [--max-age-days N] [--url URL]", file=sys.stderr)
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
        "poll": cmd_poll,
        "parse": cmd_parse,
    }
    if command not in cmds:
        print(f"Unknown command: {command}. Available: {', '.join(cmds.keys())}", file=sys.stderr)
        sys.exit(1)
    cmds[command](args)
