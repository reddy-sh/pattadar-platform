"""Proof that a request reached this private service through the gateway.

The assistant has no auth of its own: it trusts the ``x-user-id`` the gateway
injects after validating a Cognito token. This shared secret is what stops a
caller that reaches the container directly from claiming to be the gateway.

It fails OPEN while ``INTERNAL_PROXY_SECRET`` is unset, so local stacks and a
partial rollout (gateway not yet sending it) keep working, and CLOSED as soon
as the variable is configured.
"""
from __future__ import annotations

import hmac
import logging
import os

from starlette.responses import JSONResponse

INTERNAL_PROXY_SECRET_HEADER = "x-internal-proxy-secret"
# Reached without the gateway by design: the load balancer's health probe and
# an in-task metrics scraper. Neither is proxied to a user.
_UNGUARDED_PATHS = frozenset({"/health", "/internal/metrics"})

_log = logging.getLogger("pattadar.assistant.internal_auth")


def internal_proxy_secret_ok(supplied: str | None) -> bool:
    secret = os.getenv("INTERNAL_PROXY_SECRET", "").strip()
    if not secret:
        return True
    return hmac.compare_digest(supplied or "", secret)


class InternalProxyAuthMiddleware:
    """Pure-ASGI so the rejection happens before any route work or DB call."""

    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http" or scope.get("path", "") in _UNGUARDED_PATHS:
            await self.app(scope, receive, send)
            return
        supplied = None
        for name, value in scope.get("headers") or ():
            if name == INTERNAL_PROXY_SECRET_HEADER.encode():
                supplied = value.decode("latin-1")
                break
        if not internal_proxy_secret_ok(supplied):
            _log.warning("internal_proxy.rejected path=%s", scope.get("path", ""))
            response = JSONResponse(status_code=403, content={"error": "Forbidden"})
            await response(scope, receive, send)
            return
        await self.app(scope, receive, send)
