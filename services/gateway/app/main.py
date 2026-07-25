"""pattadar gateway — the only internet-facing service.

Slim FastAPI gateway assembled from rhub modules (Phase 1):
auth (Cognito), storage (PG + S3), model-catalog admin, and reverse
proxies to the api + assistant services. See services/gateway/README.md.

There is deliberately NO auth-disable knob anywhere in this service.
"""
from __future__ import annotations

import asyncio
import logging
from contextlib import asynccontextmanager

import httpx
from fastapi import FastAPI

from . import auth, db
from .cognito_jwt import CognitoJWTConfig, JWKSCache
from .proxy import router as proxy_router
from .routes_admin_models import router as admin_models_router
from .routes_storage import router as storage_router

logging.basicConfig(level=logging.INFO)
_log = logging.getLogger("pattadar.gateway")

# Client-supplied identity headers are removed from EVERY request before any
# handler runs — identity only ever comes from validated Cognito claims.
_IDENTITY_HEADERS = (b"x-user-id", b"x-ea-user-id", b"x-user-name", b"x-ea-user-name")


@asynccontextmanager
async def lifespan(app: FastAPI):
    auth.jwt_config = CognitoJWTConfig.from_env()
    auth.jwks_cache = JWKSCache(
        auth.jwt_config.jwks_url, ttl=auth.jwt_config.jwks_cache_ttl
    )
    auth.proxy_client = httpx.AsyncClient(timeout=httpx.Timeout(30.0, connect=10.0))
    if not auth.jwt_config.is_configured:
        _log.error(
            "auth.misconfigured — COGNITO_USER_POOL_ID / COGNITO_CLIENT_ID missing; "
            "all authenticated requests will be rejected"
        )
    # Schema bootstrap (IF NOT EXISTS under advisory lock) — fail fast if the
    # hub DB is unreachable; the gateway is useless without it.
    await asyncio.to_thread(db.ensure_schema)
    _log.info("gateway.started issuer=%s", auth.jwt_config.issuer or "<unset>")
    yield
    await auth.proxy_client.aclose()
    auth.proxy_client = None
    db.close()


app = FastAPI(title="pattadar-gateway", lifespan=lifespan)


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


app.add_middleware(StripIdentityHeadersMiddleware)


@app.get("/health")
async def health():
    """Unauthenticated liveness probe (ALB target-group health check)."""
    return {"status": "ok", "service": "pattadar-gateway"}


app.include_router(storage_router)
app.include_router(admin_models_router)
app.include_router(proxy_router)
