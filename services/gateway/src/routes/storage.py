"""Document Storage API — per-user folder explorer.

Ported from the predecessor's api/gateway/routes_storage.py. All routes under
``/api/gateway/storage``. Authenticated with the platform bearer; the owner
is derived from validated JWT claims via ``extract_user_id`` (never client
headers). Metadata in PostgreSQL, bytes in AWS S3 (proxied streaming — no
presigned URLs). Every operation is scoped to the acting user.

Deltas vs the predecessor (v1):
- Share and tag mutation routes (and the unauthenticated link-token routes)
  are not ported. nodes/files/folders/versions/trash/star — everything the
  app uses — keeps the exact predecessor route surface and behavior.
- org/workspace scoping hardcoded to 'pattadar'.
"""
from __future__ import annotations

import functools
import hashlib
import io
import logging
import os
from typing import Optional
from urllib.parse import quote

from fastapi import APIRouter, Body, Depends, File, Query, Request, UploadFile
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import JSONResponse, Response
from starlette.background import BackgroundTask

from ..auth import extract_user_id, require_auth
from ..internal_api import record_audit
from ..storage import (
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


def _allow_unencrypted_local(endpoint: str) -> bool:
    if not endpoint:
        return False
    environment = os.getenv("APP_ENV", "local").strip().casefold()
    if (
        environment not in {"local", "test"}
        or os.getenv("ALLOW_INSECURE_LOCAL", "") != "1"
    ):
        raise RuntimeError(
            "STORAGE_S3_ENDPOINT requires APP_ENV=local/test and ALLOW_INSECURE_LOCAL=1"
        )
    return True


def get_storage() -> StorageService:
    """Lazily build the S3-backed service singleton from env.

    boto3 resolves credentials via the default chain — on ECS/EKS that is
    the task-role. NO static keys are read here, by design.

    STORAGE_S3_ENDPOINT is a LOCAL-DEV-ONLY override (scripts/start-local.sh
    points it at a MinIO container so uploads/preview work off-cloud on the
    same boto3 code path). It is never set in any deployed environment."""
    global _service
    if _service is None:
        import boto3

        endpoint = os.getenv("STORAGE_S3_ENDPOINT", "").strip()
        local_endpoint = _allow_unencrypted_local(endpoint)
        if endpoint:
            from botocore.config import Config

            client = boto3.client(
                "s3",
                region_name=os.getenv("AWS_REGION", "ap-south-1"),
                endpoint_url=endpoint,
                config=Config(s3={"addressing_style": "path"}),
            )
        else:
            client = boto3.client("s3", region_name=os.getenv("AWS_REGION", "ap-south-1"))
        _service = StorageService(
            client,
            os.getenv("STORAGE_BUCKET", "pattadar-user-documents"),
            os.getenv("STORAGE_KMS_KEY_ARN", ""),
            allow_unencrypted_local=local_endpoint,
        )
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


def _cd(name: str, disposition: str = "inline") -> str:
    """Content-Disposition for a stored file.

    HTTP headers are latin-1, and real filenames are not. A macOS screenshot
    carries U+202F (narrow no-break space) before the AM/PM, and a Telugu
    document carries far more; putting either straight into `filename=` makes
    Starlette raise UnicodeEncodeError, which 500s the whole read before a
    single byte of the image is sent.

    RFC 6266: an ASCII-safe `filename=` every client can parse, plus a
    percent-encoded `filename*=` that carries the true name to anything
    current. Control characters go too — they would let a name inject a
    header break.
    """
    raw = (name or "download").replace('"', "").replace("\n", " ").replace("\r", " ")
    fallback = "".join(c if 32 <= ord(c) < 127 else "_" for c in raw) or "download"
    return f"{disposition}; filename=\"{fallback}\"; filename*=UTF-8\'\'{quote(raw, safe='')}"


#: A stored file's type is whatever the uploader claimed — and an anonymous
#: work-token holder can put a file in an owner's drive. So the bytes are served
#: unable to act: never sniffed into a richer type than the one declared, and
#: never granted anything by the origin they came from.
_SANDBOX = {
    "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": "sandbox; default-src 'none'",
}

#: The types a viewer may render in place. Anything else is handed over as a
#: download rather than opened on this origin.
_INLINE_TYPES = frozenset({
    "image/jpeg",
    "image/png",
    "image/gif",
    "image/webp",
    "image/bmp",
    "image/heic",
    "image/heif",
    "application/pdf",
})


def _disposition(mime: str) -> str:
    return "inline" if (mime or "").split(";", 1)[0].strip().lower() in _INLINE_TYPES else "attachment"


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
    org/workspace 'pattadar' (single-tenant platform; columns kept)."""
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
        elif parent and view == "files" and not q and await run_in_threadpool(
            svc._access, owner, parent
        ) not in (None, "owner"):
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


#: Short and revalidated rather than long and immutable. A node's content CAN
#: be replaced in place when no version is pinned, so a grid of thumbnails has
#: to be able to notice. 60s covers a scroll and a click back; after that the
#: browser asks, and the answer is a 304 costing one read and no decode.
_CACHE = "private, max-age=60, must-revalidate"

#: An explicitly asked-for version is a different entity from "whatever this
#: node holds now", and that entity never changes, so it needs no revalidating.
_CACHE_PINNED = "private, max-age=86400, immutable"


def _content_etag(source: bytes, fmt: Optional[str], thumb: Optional[int]) -> str:
    """An ETag over the identity of the SOURCE and the transform asked for.

    Both halves matter. The source, so replacing a file changes the tag; and the
    transform, so a thumbnail and its original are different entities and can
    never answer each other's request — a 512 px card thumbnail served in place
    of a full-size download would be a silent corruption, not a cache hit.

    The identity is the version id, which is immutable and known from the
    metadata alone, and that is what makes it worth having: there is no stored
    derivative, so `?thumb=` decodes the whole image with Pillow and re-encodes
    it on EVERY request, and a property grid asks for one per card. Deciding the
    304 from the version id answers it above BOTH the S3 download and the
    decode; hashing the bytes to decide would have paid for the download first.
    """
    stamp = f"|{fmt or ''}|{thumb or ''}".encode()
    return '"' + hashlib.sha1(source + stamp).hexdigest()[:24] + '"'


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
        version_id, key, mime, name, file_owner = await run_in_threadpool(
            svc.content_identity, owner, node_id, version
        )
    except Exception as exc:  # noqa: BLE001
        return _err(exc)

    etag = _content_etag(version_id.encode(), fmt, thumb)
    cache = _CACHE_PINNED if version else _CACHE
    doc_kind = "photo" if _is_imageish(mime, name) else "paper"
    if request.headers.get("if-none-match") == etag:
        return Response(status_code=304, headers={"ETag": etag, "Cache-Control": cache})

    try:
        data = await run_in_threadpool(svc.read_object, key)
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
    return Response(
        content=data,
        media_type=mime,
        headers={
            **_SANDBOX,
            "Content-Disposition": _cd(name, _disposition(mime)),
            "ETag": etag,
            "Cache-Control": cache,
        },
        # After the bytes are on the wire: the ledger records that a copy of the
        # paper left, and must never be what decides whether it can.
        background=BackgroundTask(
            record_audit,
            "download_document",
            actor_id=owner,
            actor_kind="owner",
            resource_type="document",
            resource_id=node_id,
            affected_owner=file_owner,
            metadata={"doc_kind": doc_kind},
        ),
    )


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
    onConflict: str = Query("version", pattern="^(version|duplicate)$"),
    _claims: dict = Depends(require_auth),
):
    """Upload a file.

    `onConflict=version` (default) folds a same-named upload into the existing
    file as a new version. `onConflict=duplicate` keeps both, suffixing the
    newcomer — what a document vault wants, where two originals of one deed is
    an ordinary thing to hold.
    """
    owner = extract_user_id(request)
    try:
        svc = get_storage()
        data = await file.read()
        if len(data) > MAX_UPLOAD_BYTES:
            return JSONResponse(status_code=413, content={"error": "File too large"})
        mime = file.content_type or "application/octet-stream"
        name = file.filename or "document"
        org_id, workspace_id = _scope(svc)
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
                on_conflict=onConflict,
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
