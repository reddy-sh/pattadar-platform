"""Account routes: JWT-derived identity, fresh-auth deletion, complete exports."""
import asyncio
import hashlib
import json
import time

import httpx
from fastapi import APIRouter, HTTPException, Request
from fastapi.encoders import jsonable_encoder
from fastapi.responses import JSONResponse, Response
from pydantic import BaseModel

from .. import auth, database as db
from .proxy import _api_base_url, _assistant_base_url

router = APIRouter(prefix="/api/gateway/account", tags=["account"])


async def check_account_access(request, claims):
    principal = auth.principal_id_from_claims(claims)
    owner = "owner_" + hashlib.sha256(auth.user_id_from_claims(claims).encode()).hexdigest()
    rows = await asyncio.to_thread(db.query_native, "account_access_blocks",
        "SELECT 1 FROM account_access_blocks WHERE principal_id=%s OR owner_id=%s LIMIT 1", [principal, owner])
    if rows and not (request.method == "GET" and request.url.path == "/api/gateway/account/erasure"):
        raise HTTPException(403, detail={"error": "ACCOUNT_ERASURE_IN_PROGRESS"})
    if request.method in {"POST", "PUT"} and (
        request.url.path.startswith("/api/gateway/storage/files")
        or request.url.path == "/api/gateway/assistant/api/attachments"
    ):
        consent = await upstream(_api_base_url(), "/internal/account/consent", auth.user_id_from_claims(claims))
        if consent.get("acceptedAt") and "document_processing" not in consent["purposes"]:
            raise HTTPException(403, detail={"error": "CONSENT_REQUIRED", "purpose": "document_processing"})


async def upstream(base, path, owner, method="GET", body=None):
    if not base:
        raise HTTPException(503, "Account service unavailable")
    async def send(client):
        response = await client.request(method, base + path, headers={"x-user-id": owner}, json=body,
                                        timeout=httpx.Timeout(120, connect=10))
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
    return await upstream(_api_base_url(), "/internal/account/consent", auth.extract_user_id(request), "POST", body.model_dump())


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
