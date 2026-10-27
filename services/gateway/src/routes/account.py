"""Account routes: JWT-derived identity, fresh-auth deletion, complete exports,
the backup archive and restoring from one."""
import asyncio
from datetime import datetime, timezone
import hashlib
import json
import os
import re
import time
import uuid

import httpx
from fastapi import APIRouter, HTTPException, Request
from fastapi.encoders import jsonable_encoder
from fastapi.responses import JSONResponse, Response, StreamingResponse
from pydantic import BaseModel, Field

from .. import auth, backup_archive, database as db
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
    target = "assistant" if base == _assistant_base_url() else "api"
    async def send(client):
        response = await client.request(method, base + path,
                                        headers={"x-user-id": owner, **internal_headers(target)}, json=body,
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


def storage_snapshot(owner):
    """Every stored node and version of the owner, object keys included. The
    keys stay on this side: backup_archive strips them from what it writes."""
    with db._get_conn() as conn:
        conn.execute("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY")
        nodes = conn.execute("SELECT * FROM storage_nodes WHERE owner_id=%s ORDER BY created_at,id", (owner,)).fetchall()
        versions = conn.execute("SELECT v.* FROM storage_versions v JOIN storage_nodes n ON n.id=v.node_id WHERE v.owner_id=%s AND n.owner_id=%s ORDER BY v.created_at,v.id", (owner,owner)).fetchall()
        tags = conn.execute("SELECT * FROM storage_tags WHERE owner_id=%s", (owner,)).fetchall()
        node_tags = conn.execute("SELECT * FROM storage_node_tags WHERE owner_id=%s", (owner,)).fetchall()
        shares = conn.execute("SELECT id,node_id,grantee_id,permission,expires_at,created_at FROM storage_shares WHERE owner_id=%s", (owner,)).fetchall()
    return {"nodes": nodes, "versions": versions, "tags": tags, "nodeTags": node_tags, "shares": shares}


def _attachment_reader(owner):
    """Assistant attachment bytes, read through the assistant's own
    owner-checked download route rather than its storage directly."""
    base = _assistant_base_url()

    def open_attachment(attachment_id):
        if not base:
            raise RuntimeError("assistant unavailable")
        client = httpx.Client(timeout=httpx.Timeout(120, connect=10))
        try:
            response = client.send(client.build_request(
                "GET", f"{base}/api/attachments/{attachment_id}",
                headers={"x-user-id": owner, **internal_headers("assistant")}), stream=True)
        except Exception:
            client.close()
            raise
        if response.status_code != 200:
            response.close()
            client.close()
            raise RuntimeError(f"attachment {response.status_code}")

        class Chunks:
            def __iter__(self):
                return response.iter_bytes(1 << 20)

            def close(self):
                response.close()
                client.close()
        return Chunks()
    return open_attachment


@router.get("/backup")
async def backup(request: Request):
    """The whole account as one ZIP: records and the original files."""
    await auth.validate_bearer(request)
    uid = auth.extract_user_id(request)
    api, assistant, snapshot = await asyncio.gather(
        upstream(_api_base_url(), "/internal/account/export", uid),
        upstream(_assistant_base_url(), "/internal/account/export", uid),
        asyncio.to_thread(storage_snapshot, uid))
    from .storage import get_storage
    svc = get_storage()
    made = datetime.now(timezone.utc)
    plan = backup_archive.plan_archive(api.get("data") or {}, snapshot, assistant, made, str(uuid.uuid4()))
    reader = _attachment_reader(uid)

    def build(sink):
        backup_archive.write_archive(sink, plan, account=api, assistant=assistant, storage=snapshot,
                                     open_object=svc.open_object, open_attachment=reader)

    filename = f"pattadar-backup-{made.astimezone(backup_archive.IST):%d-%m-%Y}.zip"
    return StreamingResponse(backup_archive.stream_archive(build), media_type="application/zip", headers={
        "Content-Disposition": f'attachment; filename="{filename}"',
        "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff"})


# ── Restore ───────────────────────────────────────────────────────────────
# The browser uploads each file through the ordinary storage routes; these
# routes only start a restore, record which new node each archived node became
# (after checking every one is the caller's), and hand the records to the API.

_UUID = re.compile(r"^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$")
#: The records half of a backup. Files travel separately, so this is JSON only.
MAX_RECORDS_BYTES = int(os.getenv("ACCOUNT_RESTORE_MAX_RECORDS_BYTES", str(64 * 1024 * 1024)))
_RESTORE_TIMEOUT = httpx.Timeout(300, connect=10)


class ImportStart(BaseModel):
    archiveId: str = Field(pattern=r"^[0-9a-fA-F-]{36}$")
    formatVersion: int


class ImportMapping(BaseModel):
    old: str = Field(min_length=1, max_length=64)
    new: str = Field(pattern=r"^[0-9a-fA-F-]{36}$")
    oldVersion: str = Field(default="", max_length=64)
    newVersion: str = Field(default="", max_length=64)


class ImportMappings(BaseModel):
    mappings: list[ImportMapping] = Field(default_factory=list, max_length=500)


def _job_path(job_id: str, tail: str = "") -> str:
    if not _UUID.match(job_id or ""):
        raise HTTPException(404, "This restore was not found.")
    return f"/internal/account/import/{job_id}{tail}"


def _owned_nodes(owner, node_ids, version_ids):
    nodes = db.query_native("storage_nodes",
        "SELECT id::text AS id FROM storage_nodes WHERE owner_id=%s AND id = ANY(%s::uuid[])",
        [owner, node_ids], camel_case=False) if node_ids else []
    versions = db.query_native("storage_versions",
        "SELECT id::text AS id, node_id::text AS node_id FROM storage_versions WHERE owner_id=%s AND id = ANY(%s::uuid[])",
        [owner, version_ids], camel_case=False) if version_ids else []
    return {r["id"] for r in nodes}, {r["id"]: r["node_id"] for r in versions}


@router.post("/import")
async def start_import(request: Request, body: ImportStart):
    await auth.validate_bearer(request)
    uid = auth.extract_user_id(request)
    if body.formatVersion != backup_archive.FORMAT_VERSION:
        raise HTTPException(400, "This backup was made by a different version of Pattadar and cannot be restored here.")
    rows = await asyncio.to_thread(db.query_native, "storage_nodes",
        "SELECT count(*) AS n FROM storage_nodes WHERE owner_id=%s AND kind='file' AND trashed_at IS NULL",
        [uid], camel_case=False)
    storage_empty = not (rows and int(rows[0]["n"]))
    return await upstream(_api_base_url(), "/internal/account/import", uid, "POST",
                          {"archive_id": body.archiveId, "format_version": body.formatVersion,
                           "storage_empty": storage_empty})


@router.get("/import")
async def get_import(request: Request):
    await auth.validate_bearer(request)
    return JSONResponse(await upstream(_api_base_url(), "/internal/account/import", auth.extract_user_id(request)),
                        headers={"Cache-Control": "no-store"})


@router.post("/import/{job_id}/nodes")
async def map_import_nodes(request: Request, job_id: str, body: ImportMappings):
    await auth.validate_bearer(request)
    uid = auth.extract_user_id(request)
    path = _job_path(job_id, "/nodes")
    nodes = sorted({m.new for m in body.mappings})
    versions = sorted({m.newVersion for m in body.mappings if m.newVersion})
    if any(not _UUID.match(v) for v in versions):
        raise HTTPException(400, "A restored file was not recognised.")
    owned, version_nodes = await asyncio.to_thread(_owned_nodes, uid, nodes, versions)
    for m in body.mappings:
        if m.new not in owned or (m.newVersion and version_nodes.get(m.newVersion) != m.new):
            raise HTTPException(403, "A restored file does not belong to this account.")
    payload = {"mappings": [{"old": m.old, "new": m.new, "old_version": m.oldVersion, "new_version": m.newVersion}
                            for m in body.mappings]}
    return await upstream(_api_base_url(), path, uid, "POST", payload)


@router.post("/import/{job_id}/records")
async def restore_import_records(request: Request, job_id: str):
    await auth.validate_bearer(request)
    uid = auth.extract_user_id(request)
    path = _job_path(job_id, "/records")
    declared = int(request.headers.get("content-length") or 0)
    if declared > MAX_RECORDS_BYTES:
        raise HTTPException(413, "This backup's records are larger than a restore takes at once.")
    raw = await request.body()
    if len(raw) > MAX_RECORDS_BYTES:
        raise HTTPException(413, "This backup's records are larger than a restore takes at once.")
    try:
        body = json.loads(raw)
    except ValueError:
        raise HTTPException(400, "This backup's records could not be read.")
    if not isinstance(body, dict) or not isinstance(body.get("data"), dict):
        raise HTTPException(400, "This backup's records are not in the expected shape.")
    return await upstream(_api_base_url(), path, uid, "POST", {"data": body["data"]}, timeout=_RESTORE_TIMEOUT)


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
