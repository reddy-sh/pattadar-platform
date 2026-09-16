"""Reverse proxies: pattadar api service + assistant.

- /api/gateway/pattadar/{path}   → API_BASE_URL       (buffered, NEVER retried)
- /api/gateway/assistant/{path}  → ASSISTANT_BASE_URL (streaming, for SSE chat)

The security boundary lives here: client-supplied identity headers are
stripped (also globally by middleware in main.py) and the x-user-id derived
from the VALIDATED Cognito token is injected. The downstream services trust
that header blindly.
"""
from __future__ import annotations

import json
import logging
import os
from typing import Optional
from urllib.parse import unquote

import httpx
from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse, Response, StreamingResponse
from starlette.background import BackgroundTask

from . import auth
from .public_graphql import is_public_verification

_log = logging.getLogger("pattadar.gateway.proxy")

router = APIRouter(tags=["proxy"])

_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"]

# Hop-by-hop headers (RFC 9110 §7.6.1) + headers the gateway must own.
# authorization is dropped: downstream trusts x-user-id, never the bearer.
_DROP_REQUEST_HEADERS = {
    "host",
    "content-length",
    "connection",
    "keep-alive",
    "proxy-authenticate",
    "proxy-authorization",
    "te",
    "trailers",
    "transfer-encoding",
    "upgrade",
    "authorization",
    # identity headers — stripped again here even though middleware already
    # removed them (defense in depth; injection below is the only source).
    "x-user-id",
    "x-ea-user-id",
    "x-user-name",
    "x-ea-user-name",
}

_DROP_RESPONSE_HEADERS = {"content-length", "transfer-encoding", "connection"}


def _api_base_url() -> str:
    return str(os.getenv("API_BASE_URL", "")).strip().rstrip("/")


def _assistant_base_url() -> str:
    return str(os.getenv("ASSISTANT_BASE_URL", "")).strip().rstrip("/")


def outbound_headers(inbound: dict, user_id: Optional[str]) -> dict:
    """Forwardable headers: inbound minus hop-by-hop/auth/identity, plus the
    validated x-user-id (the ONLY way that header ever reaches upstream)."""
    headers = {k: v for k, v in inbound.items() if k.lower() not in _DROP_REQUEST_HEADERS}
    if user_id:
        headers["x-user-id"] = user_id
    return headers


def _response_headers(upstream: httpx.Response) -> dict:
    return {
        k: v for k, v in upstream.headers.items() if k.lower() not in _DROP_RESPONSE_HEADERS
    }


def is_public_verify(path: str, method: str, body: bytes) -> bool:
    """Only the parsed beneficiary verification mutation is anonymous."""
    return (method.upper() == "POST" and path.strip("/") == "graphql"
            and is_public_verification(body))


def _private_path(path):
    # Normalize encoded segments too: a double-encoded internal path must not
    # become reachable when the upstream server decodes the proxy URL again.
    normalized = path
    for _ in range(4):
        decoded = unquote(normalized)
        if decoded == normalized:
            break
        normalized = decoded
    segments = normalized.replace("\\", "/").strip("/").split("/")
    return "internal" in segments or ".." in segments or "%" in normalized


@router.api_route("/api/gateway/pattadar/{path:path}", methods=_METHODS)
async def proxy_pattadar(request: Request, path: str):
    if _private_path(path):
        return JSONResponse(status_code=403, content={"error": "Forbidden"})
    base = _api_base_url()
    if not base:
        return JSONResponse(status_code=503, content={"error": "API_BASE_URL not configured"})

    body = await request.body()

    # strict=False → None only when NO token was presented; a presented-but-
    # invalid token still raises 401 inside validate_bearer.
    claims = await auth.validate_bearer(request, strict=False)
    public_webhook = path == "payments/webhook" and request.method.upper() == "POST"
    if claims is None and not (is_public_verify(path, request.method, body) or public_webhook):
        await auth.validate_bearer(request, strict=True)  # raises the 401
    user_id = auth.extract_user_id(request) if claims is not None else None

    headers = outbound_headers(dict(request.headers), user_id)

    # AI vision extraction (multi-page deeds, Aadhaar/passbook import) can run
    # for minutes — give import-*/extract-* paths 200s. NEVER retry: the
    # extraction is non-idempotent in cost.
    slow_ai = path.startswith(("import-", "extract-"))
    timeout = httpx.Timeout(200.0, connect=10.0) if slow_ai else httpx.Timeout(30.0, connect=10.0)

    url = f"{base}/{path}"
    client = auth.proxy_client
    try:
        if client is not None:
            upstream = await client.request(
                request.method,
                url,
                headers=headers,
                content=body if body else None,
                params=request.query_params.multi_items(),
                timeout=timeout,
            )
        else:
            async with httpx.AsyncClient(timeout=timeout) as c:
                upstream = await c.request(
                    request.method,
                    url,
                    headers=headers,
                    content=body if body else None,
                    params=request.query_params.multi_items(),
                )
    except httpx.RequestError as e:
        _log.error("proxy.pattadar_upstream_failed url=%s error=%s", url, e)
        return JSONResponse(status_code=502, content={"error": "Upstream request failed"})

    return Response(
        content=upstream.content,
        status_code=upstream.status_code,
        headers=_response_headers(upstream),
    )


@router.api_route("/api/gateway/assistant/{path:path}", methods=_METHODS)
async def proxy_assistant(request: Request, path: str):
    """Streaming passthrough so SSE chat works. Auth always required."""
    if _private_path(path):
        return JSONResponse(status_code=403, content={"error": "Forbidden"})
    base = _assistant_base_url()
    if not base:
        return JSONResponse(status_code=503, content={"error": "ASSISTANT_BASE_URL not configured"})

    await auth.validate_bearer(request, strict=True)
    user_id = auth.extract_user_id(request)

    body = await request.body()
    headers = outbound_headers(dict(request.headers), user_id)
    url = f"{base}/{path}"

    client = auth.proxy_client or httpx.AsyncClient()
    req = client.build_request(
        request.method,
        url,
        headers=headers,
        content=body if body else None,
        params=request.query_params.multi_items(),
        timeout=httpx.Timeout(200.0, connect=10.0),
    )
    try:
        upstream = await client.send(req, stream=True)
    except httpx.RequestError as e:
        _log.error("proxy.assistant_upstream_failed url=%s error=%s", url, e)
        return JSONResponse(status_code=502, content={"error": "Upstream request failed"})

    return StreamingResponse(
        upstream.aiter_raw(),
        status_code=upstream.status_code,
        headers=_response_headers(upstream),
        background=BackgroundTask(upstream.aclose),
    )
