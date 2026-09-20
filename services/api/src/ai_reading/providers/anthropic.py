"""The only Anthropic Messages API implementation in services/api.

Moved verbatim from services/api/src/main.py (AI consolidation, Phase 1). The
request shape, timeouts, retry policy and user-facing failure sentences are
unchanged.

The retry policy is the load-bearing part: it re-attempts only faults where no
response was ever received, so a paid, possibly in-flight generation is never
re-issued. scripts/ai-boundary-guard.py fails CI if another module in this
service starts calling the provider directly.
"""
from __future__ import annotations

import asyncio
import base64
import contextvars
import json
import logging
import os
import ssl

import httpx

from ..config import IMPORT_MODEL, MODEL_TIMEOUT_SECONDS
from ..usage import cacheable_system, log_usage

_log = logging.getLogger("pattadar")

def extract_json(text: str) -> dict:
    """Pull the JSON object out of the model output (tolerate code fences / prose)."""
    t = (text or "").strip()
    a, b = t.find("{"), t.rfind("}")
    if a >= 0 and b > a:
        t = t[a:b + 1]
    try:
        return json.loads(t)
    except Exception:
        return {}

# These AI-import routes call the Anthropic Messages API directly over httpx
# (no anthropic SDK dependency). Each call already opens its own private
# httpx.AsyncClient for a single request and tears it down immediately after —
# there is no module-level/shared client or connection pool reused across
# requests. `SSLV3_ALERT_BAD_RECORD_MAC` here is therefore not a concurrent-
# use-of-one-connection bug; it's an intermittent TLS/transport fault on an
# otherwise-private connection (large multi-MB base64 image/PDF bodies over a
# long egress path are more exposed to this than small requests). httpx
# surfaces it as an exception raised OUT OF client.post() — meaning no
# httpx.Response was ever returned/parsed, so the model never completed a
# round trip for that attempt. That makes a retry of the whole call safe: we
# are not re-running a request that already reached the model and is still
# in flight, we're re-attempting one that never got a response at all.
# Retry ONLY on faults where no usable response was received. A fresh TCP+TLS
# connection is built per attempt (see post_with_retry). Deliberately EXCLUDES
# httpx.ReadTimeout / httpx.PoolTimeout: a read timeout can mean the model is
# still generating an expensive, non-idempotent response, and re-running it would
# double-charge and re-issue an in-flight call — the same reason the istio route
# for these paths sets retries=0. ssl.SSLError (e.g. SSLV3_ALERT_BAD_RECORD_MAC)
# is kept explicitly as defense-in-depth in case it surfaces unwrapped.
TRANSIENT_CONNECTION_ERRORS = (
    ssl.SSLError,
    httpx.ConnectError,
    httpx.ConnectTimeout,
    httpx.WriteError,
    httpx.ReadError,
    httpx.RemoteProtocolError,
)



def failure_message(exc: Exception, size_bytes: int) -> str:
    """A sentence the user can act on.

    `f"AI call failed: {e}"` produced literally "AI call failed: " for an
    httpx.ReadError, whose str() is empty — a red error naming nothing. Network
    faults on this path are almost always payload size: a 13 MB scan becomes an
    18 MB base64 upload, and the connection dies partway through.
    """
    mb = size_bytes / (1024 * 1024)
    kind = type(exc).__name__
    transport = isinstance(exc, TRANSIENT_CONNECTION_ERRORS)
    if transport and mb >= 6:
        return (f"The connection dropped while sending this {mb:.0f} MB file "
                f"({kind}). Large scans often fail — photograph the pages that "
                f"carry the details, or use a smaller PDF.")
    if transport:
        return f"The connection to the AI service dropped ({kind}). Try again."
    detail = str(exc).strip()
    return f"AI call failed ({kind}){f': {detail}' if detail else ''}"


# Only this adapter can tell a caller whether a reading that was interrupted
# could already have been charged: everything up to the POST is free to repeat,
# everything from it onwards may be a generation that is being billed right now.
# The state is a mutable dict rather than the contextvar's own value so that a
# call made in a child task (asyncio.wait_for wraps the handler in one, copying
# the context) is still visible to the caller that started watching.
_dispatch: contextvars.ContextVar[dict | None] = contextvars.ContextVar("ai_reading_dispatch", default=None)


def watch_dispatch() -> dict:
    """Start recording whether a paid call leaves this task; read it after."""
    state = {"dispatched": False}
    _dispatch.set(state)
    return state


def note_dispatch() -> None:
    state = _dispatch.get()
    if state is not None:
        state["dispatched"] = True


async def post_with_retry(url: str, *, headers: dict, json_body: dict, timeout: float,
                            max_attempts: int = 4) -> httpx.Response:
    """POST with retry on transient connection/TLS faults (SSLV3_ALERT_BAD_RECORD_MAC,
    reset connections, etc). Builds a FRESH httpx.AsyncClient — a fresh TCP+TLS
    connection — on every attempt instead of retrying over the same connection, so a
    corrupted/half-broken connection is never reused for the retry."""
    note_dispatch()
    for attempt in range(1, max_attempts + 1):
        try:
            async with httpx.AsyncClient(timeout=timeout) as client:
                return await client.post(url, headers=headers, json=json_body)
        except TRANSIENT_CONNECTION_ERRORS:
            if attempt == max_attempts:
                raise
            # Backs off further each time: a 13 MB upload that dropped needs
            # more than a moment before the next attempt is worth making.
            await asyncio.sleep(1.5 * attempt)  # 1.5s, 3s, 4.5s
    raise AssertionError("unreachable")  # loop always returns or re-raises


# The one place the provider endpoint and its headers are written down. Six
# copies of this URL and header dict used to sit in the reading code; a version
# bump or a header fix had to find all six, and the AI boundary guard now fails
# CI if a seventh appears outside this adapter.
ANTHROPIC_MESSAGES_URL = "https://api.anthropic.com/v1/messages"
ANTHROPIC_VERSION = "2023-06-01"
PROVIDER_KEY_ENV = "ANTHROPIC_API_KEY"


def provider_api_key() -> str:
    """The provider credential, or "" when the service is not configured for AI.

    Read here rather than in the reading operations so the environment variable
    name exists once: callers decide what an empty key means for their response,
    but they do not get to invent a second place it comes from.
    """
    return os.getenv(PROVIDER_KEY_ENV, "").strip()


async def send_messages(payload: dict, *, api_key: str, timeout: float) -> httpx.Response:
    """One Messages request, carrying this service's retry policy.

    `timeout` stays a caller decision because the readings genuinely differ: a
    multi-page deed is given longer than an Aadhaar card. What callers do NOT
    get to vary is the retry rule — see post_with_retry above.
    """
    return await post_with_retry(
        ANTHROPIC_MESSAGES_URL,
        headers={"x-api-key": api_key, "anthropic-version": ANTHROPIC_VERSION,
                 "content-type": "application/json"},
        json_body=payload,
        timeout=timeout,
    )

def sniff_image_mime(data: bytes) -> str:
    """Real media type from magic bytes; '' when it is not a known image."""
    if data[:8] == b"\x89PNG\r\n\x1a\n":
        return "image/png"
    if data[:3] == b"\xff\xd8\xff":
        return "image/jpeg"
    if data[:6] in (b"GIF87a", b"GIF89a"):
        return "image/gif"
    if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "image/webp"
    # HEIC/HEIF carry an ISO-BMFF brand; the vision API cannot read them, so
    # naming them here lets the caller fail with a sentence instead of a 400.
    if data[4:8] == b"ftyp" and data[8:12] in (b"heic", b"heix", b"hevc", b"mif1", b"msf1"):
        return "image/heic"
    return ""

async def vision_extract(data: bytes, mime: str, name: str, system: str, user_text: str, max_mb: int = 8, max_tokens: int = 1024, effort: str = "medium", endpoint: str = "anthropic-extract") -> dict:
    """Shared vision-extraction call: base64 → Claude → parsed JSON. Returns
    {"fields", "raw"} or {"_error": (status, message)}. `max_mb`/`max_tokens` let a
    caller with larger scans (e.g. multi-page property docs) raise the defaults."""
    api_key = provider_api_key()
    if not api_key:
        return {"_error": (503, "AI extraction is not configured")}
    if len(data) > max_mb * 1024 * 1024:
        return {"_error": (413, f"File too large (max {max_mb} MB)")}
    b64 = base64.standard_b64encode(data).decode()
    mime = (mime or "").lower(); name = (name or "").lower()
    # Trust the BYTES, not the client's label. Pickers and share sheets happily
    # hand over a PNG named .jpg, or a generic octet-stream, and forwarding that
    # verbatim earns a flat 400 from the vision API ("appears to be a image/png
    # image") that surfaces to the user as an unexplained failure.
    sniffed = sniff_image_mime(data)
    if sniffed:
        mime = sniffed
    if mime == "application/pdf" or name.endswith(".pdf"):
        block = {"type": "document", "source": {"type": "base64", "media_type": "application/pdf", "data": b64}}
    elif mime.startswith("image/"):
        block = {"type": "image", "source": {"type": "base64", "media_type": mime, "data": b64}}
    else:
        return {"_error": (400, "Upload a PDF, JPG or PNG")}
    payload = {
        "model": IMPORT_MODEL, "max_tokens": max_tokens, "system": cacheable_system(system),
        "output_config": {"effort": effort},
        "messages": [{"role": "user", "content": [block, {"type": "text", "text": user_text}]}],
    }
    try:
        r = await send_messages(payload, api_key=api_key, timeout=MODEL_TIMEOUT_SECONDS)
    except httpx.TimeoutException:
        _log.warning("AI extract timed out (file=%s, model=%s)", name, IMPORT_MODEL)
        return {"_error": (504, "AI took too long to read this document (timed out). It may be large or multi-page — try again, or use 'enter details manually'.")}
    except Exception as e:
        _log.warning("AI extract failed (file=%s, bytes=%d): %r", name, len(data), e)
        return {"_error": (502, failure_message(e, len(data)))}
    if r.status_code != 200:
        _log.warning("AI extract non-200 (file=%s, status=%s): %s", name, r.status_code, (r.text or '')[:300])
        return {"_error": (502, "AI call failed")}
    body = r.json()
    log_usage(body, endpoint=endpoint, name=name, attempt="first")
    text = "".join(b.get("text", "") for b in body.get("content", []) if b.get("type") == "text").strip()
    fields = extract_json(text)
    # Running out of room is a budget problem, not a bad document — so try once
    # more with the model reasoning less, which leaves far more of the ceiling
    # for the answer. Only worth doing when that is demonstrably what happened.
    if (not fields) and body.get("stop_reason") == "max_tokens":
        _log.info("AI extract hit the ceiling (file=%s) — retrying with lower effort", name)
        retry = dict(payload)
        retry["output_config"] = {"effort": "low"}
        try:
            r2 = await send_messages(retry, api_key=api_key, timeout=MODEL_TIMEOUT_SECONDS)
            if r2.status_code == 200:
                body = r2.json()
                log_usage(body, endpoint=endpoint, name=name, attempt="low-effort-retry")
                text = "".join(b.get("text", "") for b in body.get("content", []) if b.get("type") == "text").strip()
                fields = extract_json(text)
        except Exception as e:
            _log.warning("AI extract low-effort retry failed (file=%s): %r", name, e)
    if not text or not fields:
        # An empty or unparseable reply used to be returned as a 200 with
        # {"fields": {}} — the app then prefilled nothing and the form sat there
        # looking untouched, which reads as "the button did nothing". A document
        # we could not read is a failure and must say so.
        _log.warning(
            "AI extract produced nothing (file=%s, bytes=%d, stop_reason=%s, text_len=%d)",
            name, len(data), body.get("stop_reason"), len(text),
        )
        if body.get("stop_reason") == "max_tokens":
            return {"_error": (502, "This document is long enough that the reading ran out of room. "
                                    "Photograph just the pages with the details, or enter them by hand.")}
        return {"_error": (502, "Nothing could be read from this document. It may be a scan of "
                                "photographs rather than text — try a clearer copy, or enter the "
                                "details by hand.")}
    return {"fields": fields, "raw": text}
