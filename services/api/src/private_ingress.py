"""The api as its container serves it: ``src.main:app`` behind the gateway's
proof of origin.

The api trusts ``x-user-id`` blindly, and on a shared host any co-resident
container can reach its port. So every request must carry the gateway's
``x-internal-proxy-secret``, except the two paths that are reached without the
gateway by design: the health probe, and the daily cron, which carries its own
``CRON_SECRET`` and reads no ``x-user-id``.

Unlike ``main._internal_proxy_ok`` this fails CLOSED: the module refuses to
load without the secret unless ``ALLOW_INSECURE_LOCAL=1`` says this is a
laptop. The local stack serves ``src.main:app`` directly and never loads it.
"""
from __future__ import annotations

import hmac
import logging
import os

from starlette.responses import JSONResponse

INTERNAL_PROXY_SECRET_HEADER = b"x-internal-proxy-secret"
# Exact strings: a variant (trailing slash, case, encoding) is not exempt.
_EXEMPT_PATHS = frozenset({"/health", "/cron/inactivity-check"})

_log = logging.getLogger("pattadar.private_ingress")


class PrivateIngress:
    """Pure ASGI, outermost, so a refusal costs no routing, middleware or DB
    work. An empty ``secret`` lets everything through and is only constructed
    under ALLOW_INSECURE_LOCAL=1."""

    def __init__(self, app, secret: str):
        self.app = app
        self.secret = secret.encode()

    def _allowed(self, scope) -> bool:
        if not self.secret:
            return True
        # Uvicorn here never sets a root_path; one that is set would make the
        # routed path differ from scope["path"], so it voids the exemption.
        if not scope.get("root_path") and scope.get("path") in _EXEMPT_PATHS:
            return True
        supplied = next(
            (v for k, v in scope.get("headers") or () if k == INTERNAL_PROXY_SECRET_HEADER), b"")
        return hmac.compare_digest(supplied, self.secret)

    async def __call__(self, scope, receive, send):
        if scope["type"] == "lifespan" or self._allowed(scope):
            await self.app(scope, receive, send)
            return
        # First segment only: a capability path carries its token.
        _log.warning("private_ingress.rejected type=%s prefix=/%s",
                     scope["type"], str(scope.get("path", "")).lstrip("/").split("/")[0])
        if scope["type"] == "http":
            await JSONResponse(status_code=403, content={"error": "Forbidden"})(scope, receive, send)
        elif scope["type"] == "websocket":
            await send({"type": "websocket.close", "code": 1008})
        # Any other scope type is dropped unanswered.


def _from_env():
    secret = os.getenv("INTERNAL_PROXY_SECRET", "").strip()
    if not secret and os.getenv("ALLOW_INSECURE_LOCAL", "") != "1":
        raise RuntimeError(
            "Refusing to start: INTERNAL_PROXY_SECRET is not set. Without it any caller "
            "that reaches this container can claim any x-user-id. "
            "Set ALLOW_INSECURE_LOCAL=1 to bypass for local development only.")
    from .main import app as api
    return PrivateIngress(api, secret)


app = _from_env()
