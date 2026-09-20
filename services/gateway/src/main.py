"""pattadar gateway — the only internet-facing service.

Slim FastAPI gateway assembled from predecessor-platform modules (Phase 1):
auth (Cognito), storage (PG + S3), model-catalog admin, and reverse
proxies to the api + assistant services. See services/gateway/README.md.

There is deliberately NO auth-disable knob anywhere in this service. The
local trust root (LOCAL_AUTH_KEY_FILE, local_issuer.py) is not one: the full
validation pipeline still runs on every request — it swaps which key is
trusted, for the offline laptop loop, and cannot activate without a key file
that only scripts/start-local.sh writes.
"""
from __future__ import annotations

import asyncio
import json
import logging
import os
from contextlib import asynccontextmanager

import httpx
from fastapi import FastAPI

from . import auth, database, local_issuer, request_context
from .cognito_jwt import CognitoJWTConfig, JWKSCache
from .internal_api import INTERNAL_PROXY_SECRET_HEADER
from .routes.proxy import router as proxy_router
from .ai_catalog import router as admin_models_router
from .routes.storage import MAX_UPLOAD_BYTES, router as storage_router
from .routes.account import router as account_router, check_account_access
from .routes.capabilities import router as capabilities_router

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s [%(request_id)s] %(message)s",
)
request_context.install_log_filter()
_log = logging.getLogger("pattadar.gateway")

# Headers a client must never be able to set: identity comes only from
# validated Cognito claims, and the internal-proxy secret only from this
# gateway's own env. Removed from EVERY request before any handler runs.
_IDENTITY_HEADERS = (
    b"x-user-id",
    b"x-ea-user-id",
    b"x-user-name",
    b"x-ea-user-name",
    INTERNAL_PROXY_SECRET_HEADER.encode(),
)

#: The largest request the gateway accepts at all. One upload is the biggest
#: legitimate thing it ever sees, so the ceiling follows the upload limit
#: rather than drifting apart from it; the headroom is multipart framing.
MAX_REQUEST_BYTES = int(
    os.getenv("GATEWAY_MAX_REQUEST_BYTES", str(MAX_UPLOAD_BYTES + 8 * 1024 * 1024))
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    auth.jwt_config = CognitoJWTConfig.from_env()
    local_key_file = os.getenv("LOCAL_AUTH_KEY_FILE", "").strip()
    if local_key_file:
        # Local trust root. A set-but-unreadable path is a hard startup
        # failure — falling back to the real pool here would silently turn
        # an offline session into one that needs the internet again.
        auth.jwks_cache = local_issuer.LocalTrust(local_key_file)
        auth.jwt_config.issuer_override = local_issuer.ISSUER
        # Second trust root, local mode only: a phone signed in through the
        # REAL hosted UI walks in with a pool token. Accept it when the
        # pool's coordinates are configured — validating it needs the
        # network for the JWKS fetch, exactly as the sign-in itself did.
        # The laptop key stays primary, so the offline dev door depends on
        # neither the pool nor the network.
        pool_cfg = CognitoJWTConfig.from_env()
        if pool_cfg.is_configured:
            auth.pool_jwt_config = pool_cfg
            auth.pool_jwks_cache = JWKSCache(pool_cfg.jwks_url, ttl=pool_cfg.jwks_cache_ttl)
        _log.warning(
            "gateway.local-auth ENABLED — trust root is the laptop keypair at %s; "
            "real-pool tokens are %s",
            local_key_file,
            "ALSO accepted (JWKS fetched over the network on first use)"
            if pool_cfg.is_configured
            else "NOT accepted (pool coordinates not configured)",
        )
    else:
        auth.jwks_cache = JWKSCache(
            auth.jwt_config.jwks_url, ttl=auth.jwt_config.jwks_cache_ttl
        )
        auth.pool_jwt_config = None
        auth.pool_jwks_cache = None
    auth.validate_identity_configuration()
    auth.proxy_client = httpx.AsyncClient(timeout=httpx.Timeout(30.0, connect=10.0))
    if not auth.jwt_config.is_configured:
        _log.error(
            "auth.misconfigured — COGNITO_USER_POOL_ID / COGNITO_CLIENT_ID missing; "
            "all authenticated requests will be rejected"
        )
    # Schema bootstrap (IF NOT EXISTS under advisory lock) — fail fast if the
    # hub DB is unreachable; the gateway is useless without it.
    await asyncio.to_thread(database.ensure_schema)
    auth.account_access_check = check_account_access
    _log.info("gateway.started issuer=%s", auth.jwt_config.issuer or "<unset>")
    yield
    await auth.proxy_client.aclose()
    auth.proxy_client = None
    auth.account_access_check = None
    database.close()


app = FastAPI(title="pattadar-gateway", lifespan=lifespan)
app.include_router(capabilities_router)


class StripIdentityHeadersMiddleware:
    """Remove client-supplied identity headers from the raw ASGI scope so no
    handler (or proxied upstream) can ever observe a spoofed x-user-id. The
    validated identity is re-injected only by the proxy layer."""

    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] == "http":
            scope = dict(scope)
            scope["headers"] = [
                (k, v)
                for (k, v) in scope["headers"]
                if k.lower() not in _IDENTITY_HEADERS
            ]
        await self.app(scope, receive, send)


class _BodyTooLarge(Exception):
    """A chunked body passed the ceiling mid-stream."""


async def _send_json(send, status: int, payload: dict) -> None:
    body = json.dumps(payload).encode()
    await send({
        "type": "http.response.start",
        "status": status,
        "headers": [
            (b"content-type", b"application/json"),
            (b"content-length", str(len(body)).encode()),
        ],
    })
    await send({"type": "http.response.body", "body": body})


class LimitRequestBodyMiddleware:
    """Refuse an oversized request body before anything reads it.

    Routes buffer bodies in memory — the api proxy does so BEFORE it
    authenticates — so without a ceiling here an anonymous caller can spend
    the whole task's memory on one request. A declared Content-Length is
    refused without reading a byte; a chunked body is counted as it arrives
    and cut off at the same ceiling.
    """

    def __init__(self, app, max_bytes: int):
        self.app = app
        self.max_bytes = max_bytes

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        declared = next(
            (v for (k, v) in scope["headers"] if k.lower() == b"content-length"), b""
        ).decode("latin-1", "ignore")
        if declared.isdigit() and int(declared) > self.max_bytes:
            await _send_json(send, 413, {"error": "Request body too large"})
            return

        received = 0
        started = False

        async def counted_receive():
            nonlocal received
            message = await receive()
            if message["type"] == "http.request":
                received += len(message.get("body", b""))
                if received > self.max_bytes:
                    raise _BodyTooLarge()
            return message

        async def tracking_send(message):
            nonlocal started
            if message["type"] == "http.response.start":
                started = True
            await send(message)

        try:
            await self.app(scope, counted_receive, tracking_send)
        except _BodyTooLarge:
            if not started:
                await _send_json(send, 413, {"error": "Request body too large"})


# Added last, so it wraps outermost: the id exists before anything can log,
# and a body refused for its size is still a correlated request.
app.add_middleware(StripIdentityHeadersMiddleware)
app.add_middleware(LimitRequestBodyMiddleware, max_bytes=MAX_REQUEST_BYTES)
app.add_middleware(request_context.RequestIdMiddleware)


@app.get("/health")
async def health():
    """Unauthenticated liveness probe (ALB target-group health check)."""
    return {"status": "ok", "service": "pattadar-gateway"}


app.include_router(storage_router)
app.include_router(account_router)
app.include_router(admin_models_router)
# Mounted always, answers 404 unless the local trust root is active — an
# in-handler guard on runtime state, so tests and prod need no special wiring.
app.include_router(local_issuer.router)
app.include_router(proxy_router)
