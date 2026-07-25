"""Document Storage API — per-user folder explorer.

Ported from rhub api/gateway/routes_storage.py. All routes under
``/api/gateway/storage``. Authenticated with the platform bearer; the owner
is derived from validated JWT claims via ``extract_user_id`` (never client
headers). Metadata in PostgreSQL, bytes in AWS S3 (proxied streaming — no
presigned URLs). Every operation is scoped to the acting user.

Deltas vs rhub (v1):
- Share and tag mutation routes (and the unauthenticated link-token routes)
  are not ported. nodes/files/folders/versions/trash/star — everything the
  app uses — keeps the exact rhub route surface and behavior.
- org/workspace scoping hardcoded to 'rfactory'.
"""
from __future__ import annotations

import functools
import io
import logging
import os
from typing import Optional

from fastapi import APIRouter, Body, Depends, File, Query, Request, UploadFile
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import JSONResponse, Response

from .auth import extract_user_id, require_auth
from .storage_service import (
    ORG_ID,
    WORKSPACE_ID,
    StorageConflict,
    StorageExpired,
    StorageForbidden,
    StorageNotFound,
    StorageService,
)

_log = logging.getLogger("pattadar.gateway.storage")

router = APIRouter(prefix="/api/gateway/storage", tags=["storage"])

MAX_UPLOAD_BYTES = int(os.getenv("STORAGE_MAX_UPLOAD_BYTES", str(100 * 1024 * 1024)))  # 100 MB

_service: Optional[StorageService] = None


def get_storage() -> StorageService:
    """Lazily build the S3-backed service singleton from env.

    boto3 resolves credentials via the default chain — on ECS/EKS that is
    the task-role. NO static keys are read here, by design."""
    global _service
    if _service is None:
        import boto3

        client = boto3.client("s3", region_name=os.getenv("AWS_REGION", "ap-south-1"))
        _service = StorageService(client, os.getenv("STORAGE_BUCKET", "pattadar-user-documents"))
    return _service


def _err(exc: Exception) -> JSONResponse:
    if isinstance(exc, StorageNotFound):
        return JSONResponse(status_code=404, content={"error": "Not found"})
    if isinstance(exc, StorageConflict):
        return JSONResponse(status_code=409, content={"error": str(exc)})
    if isinstance(exc, StorageForbidden):
        return JSONResponse(status_code=403, content={"error": "Forbidden"})
    if isinstance(exc, StorageExpired):
        return JSONResponse(status_code=410, content={"error": "Share link expired"})
    _log.exception("storage.error")
    return JSONResponse(status_code=500, content={"error": "Storage error"})


def _cd(name: str) -> str:
    safe = (name or "download").replace('"', "").replace("\n", " ").replace("\r", " ")
    return f'inline; filename="{safe}"'


def _is_heic(mime: str, name: str) -> bool:
    return (mime or "").lower() in ("image/heic", "image/heif") or name.lower().endswith(
        (".heic", ".heif")
    )


def _heic_to_jpeg(data: bytes) -> bytes:
    """Transcode HEIC/HEIF bytes to JPEG (libheif via pillow-heif — full HEVC
    support, unlike browser/WASM decoders). Lazy-imported so a missing wheel
    doesn't break gateway startup."""
    from PIL import Image
    import pillow_heif

    pillow_heif.register_heif_opener()  # idempotent
    img = Image.open(io.BytesIO(data)).convert("RGB")
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=90)
    return buf.getvalue()


def _is_imageish(mime: str, name: str) -> bool:
    return (mime or "").lower().startswith("image/") or _is_heic(mime, name) or name.lower().endswith(
        (".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp")
    )


def _image_thumb(data: bytes, max_px: int) -> bytes:
    """Downscale any image (incl. HEIC) to a <= max_px JPEG thumbnail."""
    from PIL import Image
    import pillow_heif

    pillow_heif.register_heif_opener()
    img = Image.open(io.BytesIO(data)).convert("RGB")
    img.thumbnail((max_px, max_px))
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=82)
    return buf.getvalue()


def _scope(svc: StorageService) -> tuple[str, str]:
    """(org_id, workspace_id) to stamp on a new node — hardcoded to the base
    org/workspace 'rfactory' (single-tenant platform; columns kept)."""
    return ORG_ID, WORKSPACE_ID


# ---------------------------------------------------------------------------
# Reads
# ---------------------------------------------------------------------------

@router.get("/nodes")
async def list_nodes(
    request: Request,
    parent: Optional[str] = Query(None),
    view: str = Query("files"),
    q: Optional[str] = Query(None),
    tag: Optional[str] = Query(None),
    org: Optional[str] = Query(None),
    _claims: dict = Depends(require_auth),
):
    owner = extract_user_id(request)
    svc = get_storage()
    try:
        if tag:
            items = await run_in_threadpool(svc.list_children, owner, None, view, None, tag, org)
        # Browsing INTO a folder the caller doesn't own but has a share on:
        # fall back to share-aware listing of that folder's children.
        elif parent and view == "files" and not q and svc._access(owner, parent) not in (None, "owner"):
            items = await run_in_threadpool(svc.list_shared_children, owner, parent)
        else:
            items = await run_in_threadpool(svc.list_children, owner, parent, view, q, None, org)
    except Exception as exc:  # noqa: BLE001
        return _err(exc)
    return {"items": items}


@router.get("/orgs")
async def list_orgs(request: Request, _claims: dict = Depends(require_auth)):
    """Orgs the caller has files in — powers the My Drive org filter."""
    caller = extract_user_id(request)
    svc = get_storage()
    try:
        orgs = await run_in_threadpool(svc.list_orgs, caller)
    except Exception as exc:  # noqa: BLE001
        return _err(exc)
    return {"orgs": orgs}


@router.get("/nodes/{node_id}")
async def get_node(request: Request, node_id: str, _claims: dict = Depends(require_auth)):
    owner = extract_user_id(request)
    svc = get_storage()
    try:
        access = await run_in_threadpool(svc._access, owner, node_id)
        if access == "owner":
            node = await run_in_threadpool(svc.get_node, owner, node_id)
            crumbs = await run_in_threadpool(svc.breadcrumb, owner, node_id)
        elif access is not None:
            # Shared node: expose it but not the owner's ancestors above it.
            node = await run_in_threadpool(svc.get_node_any, node_id)
            crumbs = [node]
        else:
            raise StorageNotFound(node_id)
    except Exception as exc:  # noqa: BLE001
        return _err(exc)
    return {"node": node, "breadcrumb": crumbs}


@router.get("/files/{node_id}/content")
async def file_content(
    request: Request,
    node_id: str,
    version: Optional[str] = Query(None),
    fmt: Optional[str] = Query(None, alias="format"),
    thumb: Optional[int] = Query(None),
    _claims: dict = Depends(require_auth),
):
    owner = extract_user_id(request)
    svc = get_storage()
    try:
        data, mime, name = await run_in_threadpool(svc.read_content, owner, node_id, version)
    except Exception as exc:  # noqa: BLE001
        return _err(exc)
    # thumb=<px>: downscale image (incl. HEIC) to a JPEG thumbnail for grid tiles.
    if thumb and _is_imageish(mime, name):
        try:
            data = await run_in_threadpool(_image_thumb, data, min(int(thumb), 1024))
            mime = "image/jpeg"
            name = os.path.splitext(name)[0] + ".jpg"
        except Exception as exc:  # noqa: BLE001
            _log.warning("storage.thumb_failed: %s", exc)
            return JSONResponse(status_code=502, content={"error": "Could not make thumbnail"})
    # format=web: transcode formats browsers can't render (HEIC/HEIF) to JPEG.
    elif fmt == "web" and _is_heic(mime, name):
        try:
            data = await run_in_threadpool(_heic_to_jpeg, data)
            mime = "image/jpeg"
            name = os.path.splitext(name)[0] + ".jpg"
        except Exception as exc:  # noqa: BLE001
            _log.warning("storage.heic_convert_failed: %s", exc)
            return JSONResponse(status_code=502, content={"error": "Could not convert image"})
    return Response(content=data, media_type=mime, headers={"Content-Disposition": _cd(name)})


# ---------------------------------------------------------------------------
# Writes
# ---------------------------------------------------------------------------

@router.post("/folders")
async def create_folder(
    request: Request,
    body: dict = Body(...),
    _claims: dict = Depends(require_auth),
):
    owner = extract_user_id(request)
    svc = get_storage()
    org_id, workspace_id = _scope(svc)
    # Apps stamp their slug (appId) so the folder is an app document; personal
    # My Drive uploads omit it (app_id stays NULL).
    app_id = body.get("appId")
    try:
        node = await run_in_threadpool(
            functools.partial(
                svc.create_folder,
                owner,
                body.get("parentId"),
                body.get("name", ""),
                owner,
                org_id=org_id,
                workspace_id=workspace_id,
                app_id=app_id,
            )
        )
    except Exception as exc:  # noqa: BLE001
        return _err(exc)
    return node


@router.post("/files")
async def upload_file(
    request: Request,
    file: UploadFile = File(...),
    parentId: Optional[str] = Query(None),
    appId: Optional[str] = Query(None),
    _claims: dict = Depends(require_auth),
):
    owner = extract_user_id(request)
    svc = get_storage()
    data = await file.read()
    if len(data) > MAX_UPLOAD_BYTES:
        return JSONResponse(status_code=413, content={"error": "File too large"})
    mime = file.content_type or "application/octet-stream"
    name = file.filename or "document"
    org_id, workspace_id = _scope(svc)
    try:
        node = await run_in_threadpool(
            functools.partial(
                svc.create_file,
                owner,
                parentId,
                name,
                data,
                mime,
                owner,
                org_id=org_id,
                workspace_id=workspace_id,
                app_id=appId,
            )
        )
    except Exception as exc:  # noqa: BLE001
        return _err(exc)
    return node


@router.patch("/nodes/{node_id}")
async def patch_node(
    request: Request,
    node_id: str,
    body: dict = Body(...),
    _claims: dict = Depends(require_auth),
):
    owner = extract_user_id(request)
    svc = get_storage()
    try:
        if "name" in body:
            await run_in_threadpool(svc.rename, owner, node_id, body["name"], owner)
        if "parentId" in body:
            await run_in_threadpool(svc.move, owner, node_id, body["parentId"], owner)
        if "starred" in body:
            await run_in_threadpool(svc.set_star, owner, node_id, bool(body["starred"]))
        node = await run_in_threadpool(svc.get_node, owner, node_id)
    except Exception as exc:  # noqa: BLE001
        return _err(exc)
    return node


@router.delete("/nodes/{node_id}")
async def delete_node(
    request: Request,
    node_id: str,
    hard: bool = Query(False),  # default: soft-delete to Trash; ?hard=true purges.
    _claims: dict = Depends(require_auth),
):
    owner = extract_user_id(request)
    svc = get_storage()
    try:
        if hard:
            await run_in_threadpool(svc.hard_delete, owner, node_id)
        else:
            await run_in_threadpool(svc.trash, owner, node_id, owner)
    except Exception as exc:  # noqa: BLE001
        return _err(exc)
    return {"ok": True}


@router.post("/nodes/{node_id}/restore")
async def restore_node(request: Request, node_id: str, _claims: dict = Depends(require_auth)):
    owner = extract_user_id(request)
    svc = get_storage()
    try:
        await run_in_threadpool(svc.restore, owner, node_id, owner)
    except Exception as exc:  # noqa: BLE001
        return _err(exc)
    return {"ok": True}


# ---------------------------------------------------------------------------
# Versions (Phase 3)
# ---------------------------------------------------------------------------

@router.get("/files/{node_id}/versions")
async def list_versions(request: Request, node_id: str, _claims: dict = Depends(require_auth)):
    owner = extract_user_id(request)
    svc = get_storage()
    try:
        items = await run_in_threadpool(svc.versions, owner, node_id)
    except Exception as exc:  # noqa: BLE001
        return _err(exc)
    return {"items": items}


@router.post("/files/{node_id}/versions/{version_id}/restore")
async def restore_version(
    request: Request, node_id: str, version_id: str, _claims: dict = Depends(require_auth)
):
    owner = extract_user_id(request)
    svc = get_storage()
    try:
        await run_in_threadpool(svc.restore_version, owner, node_id, version_id, owner)
    except Exception as exc:  # noqa: BLE001
        return _err(exc)
    return {"ok": True}


# ---------------------------------------------------------------------------
# Copy
# ---------------------------------------------------------------------------

@router.post("/nodes/{node_id}/copy")
async def copy_node(request: Request, node_id: str, _claims: dict = Depends(require_auth)):
    owner = extract_user_id(request)
    svc = get_storage()
    try:
        node = await run_in_threadpool(svc.copy_node, owner, node_id, owner)
    except Exception as exc:  # noqa: BLE001
        return _err(exc)
    return node
