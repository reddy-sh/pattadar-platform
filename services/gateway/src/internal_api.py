"""The calls this gateway makes into the private api service.

Two things the private services cannot work out for themselves: that a
request really arrived through the gateway (``x-internal-proxy-secret``), and
that a document's bytes were handed to somebody — which happens here, in the
storage and capability routes, and is invisible to the api that owns the
ledger.
"""
from __future__ import annotations

import logging
import os
from typing import Any, Optional

import httpx

from . import auth
from .request_context import REQUEST_ID_HEADER, current_request_id

_log = logging.getLogger("pattadar.gateway.internal")

INTERNAL_PROXY_SECRET_HEADER = "x-internal-proxy-secret"

AUDIT_INGEST_PATH = "/internal/audit/ingest"

#: Audit ingest follows a read that has already been authorized and served.
#: It must never cost the reader more than a moment, so it fails fast where
#: the account calls would wait.
_AUDIT_TIMEOUT = httpx.Timeout(5.0, connect=2.0)


def internal_headers() -> dict:
    """Headers for a gateway-minted call to a private service.

    Fails OPEN when INTERNAL_PROXY_SECRET is unset or empty — the local stack
    and a half-rolled-out deployment have to keep working. Once the variable
    is set on both sides it is the upstream check that fails closed.
    """
    headers: dict = {}
    request_id = current_request_id()
    if request_id:
        headers[REQUEST_ID_HEADER] = request_id
    secret = os.getenv("INTERNAL_PROXY_SECRET", "").strip()
    if secret:
        headers[INTERNAL_PROXY_SECRET_HEADER] = secret
    return headers


async def record_audit(
    action: str,
    *,
    actor_id: str,
    actor_kind: str,
    resource_type: str,
    resource_id: str,
    affected_owner: str,
    metadata: Optional[dict] = None,
) -> None:
    """Enqueue one audit envelope into the api's outbox.

    Never raises. The bytes are already on their way to the reader by the time
    this runs, and a ledger that is slow, rejecting or absent must not turn a
    download into a failure — it turns into a warning here instead.
    """
    from .routes.proxy import _api_base_url

    base = _api_base_url()
    if not base:
        return
    payload: dict[str, Any] = {
        "action": action,
        "actor_id": actor_id,
        "actor_kind": actor_kind,
        "resource_type": resource_type,
        "resource_id": resource_id,
        "affected_owner": affected_owner,
        "metadata": metadata or {},
    }
    try:
        client = auth.proxy_client
        if client is not None:
            response = await client.post(
                base + AUDIT_INGEST_PATH,
                json=payload,
                headers=internal_headers(),
                timeout=_AUDIT_TIMEOUT,
            )
        else:
            async with httpx.AsyncClient(timeout=_AUDIT_TIMEOUT) as fresh:
                response = await fresh.post(
                    base + AUDIT_INGEST_PATH, json=payload, headers=internal_headers()
                )
        if response.status_code >= 400:
            _log.warning(
                "audit.ingest_rejected action=%s status=%s", action, response.status_code
            )
    except Exception as exc:  # noqa: BLE001 — advisory write, never fatal
        _log.warning("audit.ingest_failed action=%s error=%s", action, exc)
