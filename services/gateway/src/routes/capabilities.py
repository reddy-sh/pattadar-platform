"""Public recipient routes: a revocable capability is the credential.

Every storage operation first asks the private API to resolve the exact
capability scope. Owner and file IDs never come from caller headers or body.
"""
from __future__ import annotations

import functools
import hashlib
import re

import httpx
from fastapi import APIRouter, Body, File, Form, HTTPException, UploadFile
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import Response
from starlette.background import BackgroundTask

from .. import auth
from ..internal_api import record_audit
from .proxy import _api_base_url
from .storage import MAX_UPLOAD_BYTES, _cd, _err, _scope, get_storage

router = APIRouter(prefix="/api/gateway/capabilities", tags=["recipient access"])
_TOKEN = re.compile(r"^[A-Za-z0-9_-]{43}$")
_ID = re.compile(r"^[A-Za-z0-9_-]{1,128}$")
_HEADERS = {"Cache-Control": "no-store", "Referrer-Policy": "no-referrer", "X-Content-Type-Options": "nosniff"}


def _capability_actor(scope: str, token: str) -> str:
    """A stable name for the link that acted, which is not the link itself.

    The token IS the credential: two downloads through one link must be
    recognisable as the same actor in the ledger without the ledger becoming a
    place to steal working links from."""
    return "capability_" + hashlib.sha256(f"{scope}|{token}".encode()).hexdigest()[:32]


def _check(scope: str, token: str):
    if scope not in ("shares", "work") or not _TOKEN.fullmatch(token):
        raise HTTPException(404, "This link is unavailable")


async def _api(method: str, path: str, body: dict | None = None) -> httpx.Response:
    base = _api_base_url()
    if not base:
        raise HTTPException(503, "Recipient access is temporarily unavailable")
    # No inbound headers, query arguments or absolute URLs cross this boundary.
    try:
        if auth.proxy_client:
            return await auth.proxy_client.request(method, base + path, json=body, timeout=30)
        async with httpx.AsyncClient(timeout=30) as client:
            return await client.request(method, base + path, json=body)
    except httpx.RequestError:
        raise HTTPException(502, "Recipient access could not be reached") from None


def _forward(res: httpx.Response) -> Response:
    return Response(res.content, status_code=res.status_code, media_type="application/json", headers=_HEADERS)


async def _grant(path: str) -> dict:
    res = await _api("GET", path)
    if res.status_code != 200:
        raise HTTPException(res.status_code if res.status_code in (404, 409, 410) else 502,
                            "This link or file is no longer available")
    body = res.json()
    if not body.get("owner"):
        raise HTTPException(502, "Recipient access is unavailable")
    return body


@router.get("/{scope}/{token}")
async def recipient_view(scope: str, token: str):
    _check(scope, token)
    return _forward(await _api("GET", f"/public/{scope}/{token}"))


@router.get("/{scope}/{token}/files/{item_id}")
async def recipient_file(scope: str, token: str, item_id: str):
    _check(scope, token)
    if not _ID.fullmatch(item_id):
        raise HTTPException(404, "This file is unavailable")
    grant = await _grant(f"/internal/capabilities/{scope}/{token}/files/{item_id}")
    try:
        svc = get_storage()
        data, mime, name = await run_in_threadpool(svc.read_content, grant["owner"], grant["fileRef"], None)
    except Exception as exc:
        return _err(exc)
    # Download arbitrary originals, so user-uploaded HTML/SVG cannot execute on
    # the application origin or read another capability from the current page.
    return Response(data, media_type=mime, headers={**_HEADERS,
        "Content-Disposition": _cd(name, "attachment"),
        "Content-Security-Policy": "sandbox; default-src 'none'"},
        # The actor is outside the household: the owner's ledger has to be able
        # to show that a link, not a person of theirs, took this paper.
        background=BackgroundTask(record_audit, "recipient.download",
            actor_id=_capability_actor(scope, token), actor_kind="recipient",
            resource_type="document", resource_id=item_id,
            affected_owner=grant["owner"],
            metadata={"doc_kind": "photo" if (mime or "").startswith("image/") else "paper"}))


@router.post("/work/{token}/actions")
async def worker_action(token: str, body: dict = Body(...)):
    _check("work", token)
    return _forward(await _api("POST", f"/public/work/{token}/actions", {"action": body.get("action")}))


@router.post("/work/{token}/deliverables")
async def worker_deliverable(token: str, label: str = Form(...), note: str = Form(""), file: UploadFile | None = File(None)):
    _check("work", token)
    if not label.strip() or len(label) > 240 or len(note) > 10000:
        raise HTTPException(400, "Add a short title and a note under 10,000 characters")
    grant = await _grant(f"/internal/capabilities/work/{token}/upload")
    payload = {"label": label, "note": note}
    node = None
    svc = None
    if file:
        data = await file.read(MAX_UPLOAD_BYTES + 1)
        if len(data) > MAX_UPLOAD_BYTES:
            raise HTTPException(413, "File exceeds the upload limit")
        try:
            svc = get_storage()
            org_id, workspace_id = _scope(svc)
            node = await run_in_threadpool(functools.partial(svc.create_file,
                grant["owner"], None, file.filename or "Work submission", data,
                file.content_type or "application/octet-stream", "worker submission",
                org_id=org_id, workspace_id=workspace_id, app_id="pattadar", on_conflict="duplicate"))
        except Exception as exc:
            return _err(exc)
        payload.update({"fileRef": node["id"], "fileName": node["name"],
                        "mimeType": node.get("mimeType", ""), "sizeBytes": len(data),
                        "kind": "photo" if (file.content_type or "").startswith("image/") else "paper"})
    res = await _api("POST", f"/internal/capabilities/work/{token}/deliverables", payload)
    return _forward(res)
