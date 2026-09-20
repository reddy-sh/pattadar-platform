"""Account routes: JWT-derived identity, fresh-auth deletion, complete exports."""
import asyncio
import hashlib
import json
import os
import time

import httpx
from fastapi import APIRouter, HTTPException, Request
from fastapi.encoders import jsonable_encoder
from fastapi.responses import JSONResponse, Response
from pydantic import BaseModel

from .. import auth, database as db
from ..internal_api import internal_headers
from .proxy import _api_base_url, _assistant_base_url

router = APIRouter(prefix="/api/gateway/account", tags=["account"])

#: Both verdicts below sit in front of EVERY authenticated request, and the
#: erasure-freeze table is empty for all but a handful of accounts ever. A
#: short TTL keeps that off the hot path; a freeze and a consent change both
#: tolerate seconds of propagation, and the routes that cause either one drop
#: the entry themselves so the person who acted sees it at once.
_CACHE_TTL_SECONDS = float(os.getenv("ACCOUNT_CACHE_TTL_SECONDS", "30"))
_CACHE_MAX_ENTRIES = 4096

_access_cache: dict = {}
_consent_cache: dict = {}

#: An upload waits on this, so a struggling api costs the uploader seconds,
#: not the two minutes an export is allowed.
_CONSENT_TIMEOUT = httpx.Timeout(5, connect=2)
_DEFAULT_TIMEOUT = httpx.Timeout(120, connect=10)


def _cached(cache, key):
    entry = cache.get(key)
    if entry is None or entry[0] < time.monotonic():
        return None
    return entry


def _remember(cache, key, value):
    if len(cache) >= _CACHE_MAX_ENTRIES:
        cache.clear()
    entry = (time.monotonic() + _CACHE_TTL_SECONDS, value)
    cache[key] = entry
    return entry


async def check_account_access(request, claims):
    principal = auth.principal_id_from_claims(claims)
    user_id = auth.user_id_from_claims(claims)
    owner = "owner_" + hashlib.sha256(user_id.encode()).hexdigest()
    blocked = _cached(_access_cache, principal)
    if blocked is None:
        rows = await asyncio.to_thread(db.query_native, "account_access_blocks",
            "SELECT 1 FROM account_access_blocks WHERE principal_id=%s OR owner_id=%s LIMIT 1", [principal, owner])
        blocked = _remember(_access_cache, principal, bool(rows))
    if blocked[1] and not (request.method == "GET" and request.url.path == "/api/gateway/account/erasure"):
        raise HTTPException(403, detail={"error": "ACCOUNT_ERASURE_IN_PROGRESS"})
    if request.method in {"POST", "PUT"} and (
        request.url.path.startswith("/api/gateway/storage/files")
        or request.url.path == "/api/gateway/assistant/api/attachments"
    ):
        consent = _cached(_consent_cache, user_id)
        if consent is None:
            consent = _remember(_consent_cache, user_id, await upstream(
                _api_base_url(), "/internal/account/consent", user_id, timeout=_CONSENT_TIMEOUT))
        if consent[1].get("acceptedAt") and "document_processing" not in consent[1]["purposes"]:
            raise HTTPException(403, detail={"error": "CONSENT_REQUIRED", "purpose": "document_processing"})


async def upstream(base, path, owner, method="GET", body=None, timeout=_DEFAULT_TIMEOUT):
    if not base:
        raise HTTPException(503, "Account service unavailable")
    async def send(client):
        response = await client.request(method, base + path,
                                        headers={"x-user-id": owner, **internal_headers()}, json=body,
                                        timeout=timeout)
        if response.status_code >= 400:
            # API validation messages are safe; private upstream response bodies
            # from infrastructure failures must not leak service details.
            if response.status_code < 500:
                raise HTTPException(response.status_code, response.json().get("detail", "Request rejected"))
            raise HTTPException(503, "Account service unavailable; please retry")
        return response.json()
    try:
        if auth.proxy_client is not None:
            return await send(auth.proxy_client)
        async with httpx.AsyncClient() as client:
            return await send(client)
    except httpx.HTTPError as exc:
        raise HTTPException(503, "Account service unavailable; please retry") from exc


def file_manifest(owner):
    with db._get_conn() as conn:
        # A repeatable snapshot keeps versions and parent nodes consistent.
        conn.execute("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY")
        nodes = conn.execute("SELECT * FROM storage_nodes WHERE owner_id=%s ORDER BY created_at,id", (owner,)).fetchall()
        versions = conn.execute("SELECT v.* FROM storage_versions v JOIN storage_nodes n ON n.id=v.node_id WHERE v.owner_id=%s AND n.owner_id=%s ORDER BY v.created_at,v.id", (owner,owner)).fetchall()
        tags = conn.execute("SELECT * FROM storage_tags WHERE owner_id=%s", (owner,)).fetchall()
        node_tags = conn.execute("SELECT * FROM storage_node_tags WHERE owner_id=%s", (owner,)).fetchall()
        shares = conn.execute("SELECT id,node_id,grantee_id,permission,expires_at,created_at FROM storage_shares WHERE owner_id=%s", (owner,)).fetchall()
    return {"nodes": nodes, "versions": [{**v, "downloadUrl": f"/api/gateway/storage/files/{v['node_id']}/content?version={v['id']}"} for v in versions], "tags": tags, "nodeTags": node_tags, "shares": shares}


@router.get("/export")
async def export(request: Request):
    await auth.validate_bearer(request)
    uid = auth.extract_user_id(request)
    api, assistant, files = await asyncio.gather(
        upstream(_api_base_url(), "/internal/account/export", uid),
        upstream(_assistant_base_url(), "/internal/account/export", uid),
        asyncio.to_thread(file_manifest, uid))
    result = {**api, "files": files, "assistant": assistant}
    return Response(json.dumps(jsonable_encoder(result), ensure_ascii=False, indent=2),
                    media_type="application/json", headers={"Content-Disposition": 'attachment; filename="pattadar-account-export.json"', "Cache-Control": "no-store"})


@router.get("/consent")
async def get_consent(request: Request):
    await auth.validate_bearer(request)
    return JSONResponse(await upstream(_api_base_url(), "/internal/account/consent", auth.extract_user_id(request)), headers={"Cache-Control": "no-store"})


class Consent(BaseModel):
    version: str
    purposes: list[str]


@router.post("/consent")
async def set_consent(request: Request, body: Consent):
    await auth.validate_bearer(request)
    uid = auth.extract_user_id(request)
    _consent_cache.pop(uid, None)
    saved = await upstream(_api_base_url(), "/internal/account/consent", uid, "POST", body.model_dump())
    _consent_cache.pop(uid, None)
    return saved


class ErasureConfirmation(BaseModel):
    confirmation: str


def require_fresh_auth(claims):
    from ..local_issuer import ISSUER, LocalTrust
    timestamp = claims.get("auth_time")
    if claims.get("iss") == ISSUER and isinstance(auth.jwks_cache, LocalTrust):
        timestamp = claims.get("iat")
    # A refreshed access token's iat does not prove a recent sign-in.
    if not isinstance(timestamp, (int,float)) or isinstance(timestamp, bool) or not 0 <= time.time() - timestamp <= 300:
        raise HTTPException(401, detail={"error": "REAUTH_REQUIRED", "message": "Sign in again before requesting account deletion."})


@router.post("/erasure", status_code=202)
async def request_erasure(request: Request, body: ErasureConfirmation):
    claims = await auth.validate_bearer(request)
    require_fresh_auth(claims)
    payload = {"confirmation": body.confirmation, "principal_id": auth.principal_id_from_claims(claims),
               "issuer": claims["iss"], "subject": claims["sub"]}
    return await upstream(_api_base_url(), "/internal/account/erasure", auth.extract_user_id(request), "POST", payload)


@router.get("/erasure")
async def get_erasure(request: Request):
    claims = await auth.validate_bearer(request)
    path = "/internal/account/erasure?principal_id=" + auth.principal_id_from_claims(claims)
    return JSONResponse(await upstream(_api_base_url(), path, auth.extract_user_id(request)), headers={"Cache-Control": "no-store"})
