#!/usr/bin/env python3
"""
openclaw-token-proxy: Async HTTP reverse proxy for Anthropic API with
token metering, prompt caching injection, and structured JSONL logging.
"""

import asyncio
import json
import logging
import os
import re
import time
from datetime import datetime, timezone

from aiohttp import web, ClientSession, ClientTimeout

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
PROXY_PORT = int(os.environ.get("PROXY_PORT", "8090"))
UPSTREAM = os.environ.get("ANTHROPIC_UPSTREAM", "https://api.anthropic.com").rstrip("/")
LOG_FILE = os.environ.get("LOG_FILE", "/data/logs/token-usage.jsonl")
USER_AGENT = "openclaw-token-proxy/1.0"

# Opus 4-6 pricing (USD per token)
PRICE_INPUT = 15.0 / 1_000_000
PRICE_OUTPUT = 75.0 / 1_000_000
PRICE_CACHE_WRITE = 18.75 / 1_000_000
PRICE_CACHE_READ = 1.50 / 1_000_000

# ---------------------------------------------------------------------------
# Globals
# ---------------------------------------------------------------------------
logger = logging.getLogger("token-proxy")
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
)

_start_time: float = time.monotonic()
_requests_logged: int = 0
_log_lock: asyncio.Lock | None = None  # initialized in on_startup
_session: ClientSession | None = None


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def _extract_agent_name(body: dict) -> str:
    """Extract agent name from system prompt via regex."""
    system = body.get("system")
    if system is None:
        return "unknown"

    text = ""
    if isinstance(system, str):
        text = system
    elif isinstance(system, list):
        for block in system:
            if isinstance(block, dict) and block.get("type") == "text":
                text = block.get("text", "")
                break
            elif isinstance(block, str):
                text = block
                break

    match = re.search(r"You are \*\*(\w+)\*\*", text)
    return match.group(1) if match else "unknown"


def _inject_cache_control(body: dict) -> dict:
    """Add cache_control to the last element of the system array."""
    system = body.get("system")
    if system is None:
        return body

    if isinstance(system, str):
        body["system"] = [
            {
                "type": "text",
                "text": system,
                "cache_control": {"type": "ephemeral"},
            }
        ]
    elif isinstance(system, list) and len(system) > 0:
        last = system[-1]
        if isinstance(last, dict):
            last["cache_control"] = {"type": "ephemeral"}
        elif isinstance(last, str):
            system[-1] = {
                "type": "text",
                "text": last,
                "cache_control": {"type": "ephemeral"},
            }
    return body


def _compute_cost(usage: dict) -> float:
    inp = usage.get("input_tokens", 0)
    out = usage.get("output_tokens", 0)
    cw = usage.get("cache_creation_input_tokens", 0)
    cr = usage.get("cache_read_input_tokens", 0)
    return round(
        inp * PRICE_INPUT
        + out * PRICE_OUTPUT
        + cw * PRICE_CACHE_WRITE
        + cr * PRICE_CACHE_READ,
        6,
    )


async def _write_log(record: dict) -> None:
    global _requests_logged
    assert _log_lock is not None
    line = json.dumps(record, separators=(",", ":")) + "\n"
    async with _log_lock:
        try:
            os.makedirs(os.path.dirname(LOG_FILE), exist_ok=True)
            with open(LOG_FILE, "a") as f:
                f.write(line)
            _requests_logged += 1
        except Exception:
            logger.exception("Failed to write log line")


def _build_log_record(
    agent: str, model: str, usage: dict, latency_ms: int
) -> dict:
    return {
        "ts": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "agent": agent,
        "model": model,
        "input_tokens": usage.get("input_tokens", 0),
        "output_tokens": usage.get("output_tokens", 0),
        "cache_creation_input_tokens": usage.get("cache_creation_input_tokens", 0),
        "cache_read_input_tokens": usage.get("cache_read_input_tokens", 0),
        "cost_usd": _compute_cost(usage),
        "latency_ms": latency_ms,
    }


def _forward_headers(request: web.Request) -> dict:
    """Copy incoming headers, replacing Host and User-Agent."""
    headers = {}
    for key, value in request.headers.items():
        lk = key.lower()
        if lk in ("host", "user-agent", "transfer-encoding"):
            continue
        headers[key] = value
    headers["User-Agent"] = USER_AGENT
    return headers


# ---------------------------------------------------------------------------
# SSE streaming helper
# ---------------------------------------------------------------------------
def _parse_sse_usage(chunk: bytes, accumulated: dict) -> dict:
    """Parse SSE data lines looking for usage information."""
    for raw_line in chunk.split(b"\n"):
        line = raw_line.strip()
        if not line.startswith(b"data: "):
            continue
        data_str = line[6:].decode("utf-8", errors="replace").strip()
        if data_str == "[DONE]":
            continue
        try:
            event = json.loads(data_str)
        except (json.JSONDecodeError, ValueError):
            continue

        # message_start contains the initial usage
        if event.get("type") == "message_start":
            msg = event.get("message", {})
            if "usage" in msg:
                accumulated.update(msg["usage"])
            if "model" in msg:
                accumulated["_model"] = msg["model"]

        # message_delta contains final output token count
        if event.get("type") == "message_delta":
            usage = event.get("usage", {})
            if usage:
                accumulated.update(usage)

    return accumulated


# ---------------------------------------------------------------------------
# Request handlers
# ---------------------------------------------------------------------------
async def handle_health(request: web.Request) -> web.Response:
    uptime = int(time.monotonic() - _start_time)
    return web.json_response(
        {"status": "ok", "requests_logged": _requests_logged, "uptime_seconds": uptime}
    )


async def handle_proxy(request: web.Request) -> web.StreamResponse:
    assert _session is not None

    path = request.path_qs  # preserves query string
    url = f"{UPSTREAM}{path}"
    method = request.method

    is_messages_post = method == "POST" and request.path.rstrip("/") == "/v1/messages"

    # Read raw body
    try:
        raw_body = await request.read()
    except Exception:
        raw_body = b""

    agent = "unknown"
    model = "unknown"
    body_dict: dict | None = None

    # For POST /v1/messages, parse and modify the body
    if is_messages_post and raw_body:
        try:
            body_dict = json.loads(raw_body)
            agent = _extract_agent_name(body_dict)
            model = body_dict.get("model", "unknown")
            body_dict = _inject_cache_control(body_dict)
            raw_body = json.dumps(body_dict).encode("utf-8")
        except (json.JSONDecodeError, ValueError):
            logger.warning("Could not parse messages body; forwarding as-is")
            body_dict = None

    headers = _forward_headers(request)
    # Update content-length if body was modified
    if raw_body:
        headers["Content-Length"] = str(len(raw_body))

    is_streaming = False
    if body_dict is not None:
        is_streaming = body_dict.get("stream", False)

    t0 = time.monotonic()

    try:
        upstream_resp = await _session.request(
            method,
            url,
            headers=headers,
            data=raw_body if raw_body else None,
            timeout=ClientTimeout(total=600),
        )
    except Exception as exc:
        logger.error("Upstream unreachable: %s", exc)
        return web.json_response(
            {"error": "upstream_unreachable", "detail": str(exc)},
            status=502,
        )

    # Build response headers to forward back
    resp_headers = {}
    for key, value in upstream_resp.headers.items():
        lk = key.lower()
        if lk in ("transfer-encoding", "content-encoding", "content-length"):
            continue
        resp_headers[key] = value

    # ----- Streaming response -----
    if is_streaming and is_messages_post:
        response = web.StreamResponse(
            status=upstream_resp.status,
            headers=resp_headers,
        )
        response.content_type = upstream_resp.content_type or "text/event-stream"
        await response.prepare(request)

        accumulated_usage: dict = {}
        try:
            async for chunk, _ in upstream_resp.content.iter_chunks():
                _parse_sse_usage(chunk, accumulated_usage)
                await response.write(chunk)
        except Exception:
            logger.exception("Error streaming response")
        finally:
            await response.write_eof()

        latency_ms = int((time.monotonic() - t0) * 1000)
        final_model = accumulated_usage.pop("_model", model)
        if accumulated_usage:
            record = _build_log_record(agent, final_model, accumulated_usage, latency_ms)
            await _write_log(record)

        return response

    # ----- Non-streaming response -----
    resp_body = await upstream_resp.read()
    latency_ms = int((time.monotonic() - t0) * 1000)

    if is_messages_post and resp_body:
        try:
            resp_json = json.loads(resp_body)
            usage = resp_json.get("usage", {})
            resp_model = resp_json.get("model", model)
            if usage:
                record = _build_log_record(agent, resp_model, usage, latency_ms)
                await _write_log(record)
        except (json.JSONDecodeError, ValueError):
            logger.warning("Could not parse upstream response for usage logging")

    return web.Response(
        status=upstream_resp.status,
        headers=resp_headers,
        body=resp_body,
    )


# ---------------------------------------------------------------------------
# App lifecycle
# ---------------------------------------------------------------------------
async def on_startup(app: web.Application) -> None:
    global _session, _log_lock, _start_time
    _session = ClientSession()
    _log_lock = asyncio.Lock()
    _start_time = time.monotonic()
    logger.info(
        "Token proxy started — port=%s upstream=%s log=%s",
        PROXY_PORT,
        UPSTREAM,
        LOG_FILE,
    )


async def on_cleanup(app: web.Application) -> None:
    global _session
    if _session:
        await _session.close()
        _session = None


def create_app() -> web.Application:
    app = web.Application()
    app.on_startup.append(on_startup)
    app.on_cleanup.append(on_cleanup)
    app.router.add_get("/health", handle_health)
    # Catch-all for every other route
    app.router.add_route("*", "/{path_info:.*}", handle_proxy)
    return app


if __name__ == "__main__":
    web.run_app(create_app(), port=PROXY_PORT, print=logger.info)
