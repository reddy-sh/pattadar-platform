"""Document Storage API — per-user folder explorer.

Ported from the predecessor's api/gateway/routes_storage.py. All routes under
``/api/gateway/storage``. Authenticated with the platform bearer; the owner
is derived from validated JWT claims via ``extract_user_id`` (never client
headers). Metadata in PostgreSQL, bytes in AWS S3. Every operation is scoped
to the acting user.

Uploads go two ways. ``POST /files`` proxies the bytes through this process
and stays the path native clients use. ``POST /files/upload-intent`` +
``/files/upload-complete`` hand the browser a presigned POST so the bytes go
straight to S3; the gateway still chooses the key, bounds the size in the
policy, and reads the object back with HeadObject before it writes a row.

DOWNLOADS ARE STILL PROXIED, deliberately. This module's download route is
where the nosniff/sandbox headers are set, where HEIC conversion and
thumbnailing happen, where share revocation is re-evaluated per read, and
where the download audit event is written. A presigned GET would skip all
five.

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
from typing import Iterator, Optional
from urllib.parse import quote

from fastapi import APIRouter, Body, Depends, File, HTTPException, Query, Request, UploadFile
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import JSONResponse, Response, StreamingResponse
from starlette.background import BackgroundTask

from .. import auth, stream_sessions
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
    StorageTooLarge,
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
    # Before StorageConflict: too-large is a subclass of StorageError, and the
    # proxied upload path answers 413, so the direct path must agree.
    if isinstance(exc, StorageTooLarge):
        return JSONResponse(status_code=413, content={"error": "File too large"})
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


_MEDIA_EXTENSIONS = {
    "video": (".mp4", ".mov", ".m4v", ".webm", ".3gp"),
    "audio": (".mp3", ".m4a", ".aac", ".wav", ".ogg", ".oga", ".opus", ".webm"),
}


def _media_kind(mime: str, name: str) -> Optional[str]:
    """audio/video only, by declared MIME or established extension.

    This selects delivery behavior, never active-content privilege: the
    response remains sandboxed and nosniff, and content_identity still owns
    access. Extension fallback keeps phone-transferred MP4/M4A files usable
    when the browser uploaded an empty/generic MIME.
    """
    base = (mime or "").split(";", 1)[0].strip().lower()
    lower = (name or "").lower()
    if base.startswith("video/") or lower.endswith(_MEDIA_EXTENSIONS["video"]):
        return "video"
    if base.startswith("audio/") or lower.endswith(_MEDIA_EXTENSIONS["audio"]):
        return "audio"
    return None


def _playable_media_mime(mime: str, name: str, kind: str) -> str:
    """Conservative browser MIME for phone-transferred media.

    ``nosniff`` is retained, so a generic or conflicting stored MIME makes a
    correctly classified .mp4/.m4a unplayable. A declared MIME already matching
    the established media kind wins; otherwise only known extensions for that
    same kind may correct it.
    """
    base = (mime or "").split(";", 1)[0].strip().lower()
    if base.startswith(f"{kind}/"):
        return base
    lower = (name or "").lower()
    mappings = {
        "video": {
            ".mp4": "video/mp4", ".m4v": "video/mp4",
            ".mov": "video/quicktime", ".3gp": "video/3gpp",
            ".webm": "video/webm",
        },
        "audio": {
            ".mp3": "audio/mpeg", ".m4a": "audio/mp4",
            ".aac": "audio/aac", ".wav": "audio/wav",
            ".ogg": "audio/ogg", ".oga": "audio/ogg",
            ".opus": "audio/ogg", ".webm": "audio/webm",
        },
    }
    corrected = next(
        (value for ext, value in mappings.get(kind, {}).items() if lower.endswith(ext)),
        "",
    )
    return corrected or base or mime


def _trusted_stream_claims(row: dict) -> dict:
    issuer = str(row.get("issuer") or "")
    trusted = {cfg.issuer for cfg in (auth.jwt_config, auth.pool_jwt_config) if cfg and cfg.issuer}
    if issuer not in trusted:
        raise HTTPException(401, "Stream session is no longer trusted")
    return {"iss": issuer, "sub": str(row.get("subject") or "")}


async def _content_auth(request: Request, node_id: str, version: Optional[str]) -> tuple[str, Optional[str]]:
    """Bearer first; exact-file HttpOnly stream cookie only when absent.

    Any presented Authorization header is validated strictly. Wrong schemes,
    empty Bearer values and invalid JWTs never downgrade to cookie auth.
    Cookie identity is immutable issuer+subject, account freeze is rechecked,
    and version is mandatory/pinned.
    """
    if "authorization" in request.headers:
        claims = await auth.validate_bearer(request, strict=True)
        return auth.user_id_from_claims(claims), None
    raw = request.cookies.get(stream_sessions.COOKIE_NAME, "")
    if not raw or not version:
        raise HTTPException(401, "Authentication required")
    row = await run_in_threadpool(stream_sessions.lookup, raw, node_id, version)
    if not row:
        raise HTTPException(401, "Stream session expired or invalid")
    claims = _trusted_stream_claims(row)
    if auth.account_access_check is not None:
        await auth.account_access_check(request, claims)
    request.state.token_claims = claims
    return auth.user_id_from_claims(claims), raw


def _parse_range(value: str, total: int) -> Optional[tuple[int, int, str]]:
    """One RFC 9110 byte range; multiple/malformed/unsatisfiable => None."""
    if not value:
        return None
    if not value.startswith("bytes=") or "," in value or total <= 0:
        raise ValueError("invalid range")
    spec = value[6:].strip()
    start_text, sep, end_text = spec.partition("-")
    if not sep:
        raise ValueError("invalid range")
    if not start_text:  # suffix
        suffix = int(end_text)
        if suffix <= 0:
            raise ValueError("invalid range")
        start, end = max(0, total - suffix), total - 1
    else:
        start = int(start_text)
        end = int(end_text) if end_text else total - 1
        if start < 0 or start >= total or end < start:
            raise ValueError("invalid range")
        end = min(end, total - 1)
    return start, end, f"bytes={start}-{end}"


def _stream_body(body, chunk_size: int = 512 * 1024) -> Iterator[bytes]:
    try:
        while True:
            chunk = body.read(chunk_size)
            if not chunk:
                break
            yield chunk
    finally:
        body.close()


class _ClosingStreamingResponse(StreamingResponse):
    """Own an S3 StreamingBody across the entire ASGI response lifecycle.

    Starlette may stop consuming a synchronous iterator when the client
    disconnects without finalizing it. The outer ``finally`` therefore closes
    the botocore body even on cancellation/send failure; the iterator's close
    remains the normal-completion fast path. Closing twice is safe.
    """
    def __init__(self, body, *args, **kwargs):
        self._owned_body = body
        super().__init__(_stream_body(body), *args, **kwargs)

    async def __call__(self, scope, receive, send):
        try:
            await super().__call__(scope, receive, send)
        finally:
            await run_in_threadpool(self._owned_body.close)


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


@router.delete("/stream-sessions", status_code=204)
async def revoke_stream_sessions(claims: dict = Depends(require_auth)):
    """Sign-out hook: invalidate every outstanding media cookie server-side.

    Exact-path HttpOnly cookies may remain in the browser until Max-Age, but
    their hashes no longer resolve, so they authorize nothing.
    """
    await run_in_threadpool(stream_sessions.revoke_subject, claims)
    return Response(status_code=204, headers={"Cache-Control": "no-store"})


@router.post("/files/{node_id}/stream-session")
async def create_stream_session(
    request: Request,
    node_id: str,
    version: Optional[str] = Query(None),
    claims: dict = Depends(require_auth),
):
    """Authorize one immutable audio/video version for native media playback.

    The raw opaque secret exists only in an HttpOnly exact-path cookie. The DB
    stores its hash. This endpoint is Bearer-only; the cookie cannot mint or
    renew itself.
    """
    owner = extract_user_id(request)
    svc = get_storage()
    try:
        version_id, _key, mime, name, _file_owner = await run_in_threadpool(
            svc.content_identity, owner, node_id, version)
        if not _media_kind(mime, name):
            raise HTTPException(400, "Only audio and video can be streamed")
        raw = await run_in_threadpool(stream_sessions.create, claims, node_id, version_id)
    except HTTPException:
        raise
    except Exception as exc:  # noqa: BLE001
        return _err(exc)
    path = f"/api/gateway/storage/files/{node_id}/content"
    response = JSONResponse(
        {"url": f"{path}?version={quote(version_id, safe='')}",
         "expiresIn": stream_sessions.TTL_SECONDS},
        headers={"Cache-Control": "no-store", "Referrer-Policy": "no-referrer"},
    )
    environment = os.getenv("APP_ENV", "local").strip().casefold()
    response.set_cookie(
        stream_sessions.COOKIE_NAME, raw,
        max_age=stream_sessions.TTL_SECONDS,
        httponly=True,
        secure=environment not in {"local", "test"},
        samesite="strict",
        path=path,
    )
    return response


@router.api_route("/files/{node_id}/content", methods=["GET", "HEAD"])
async def file_content(
    request: Request,
    node_id: str,
    version: Optional[str] = Query(None),
    fmt: Optional[str] = Query(None, alias="format"),
    thumb: Optional[int] = Query(None),
):
    owner, stream_raw = await _content_auth(request, node_id, version)
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

    media_kind = _media_kind(mime, name)
    stream_mime = _playable_media_mime(mime, name, media_kind) if media_kind else mime
    if stream_raw and not media_kind:
        raise HTTPException(401, "Stream session does not authorize this file type")

    # Raw audio/video is streamed even without Range; native players then issue
    # their own metadata/seek ranges. A Bearer-authenticated explicit Range on
    # another raw file supports client-side EXIF/PDF metadata reads without
    # changing ordinary image/thumb/HEIC behavior.
    range_header = request.headers.get("range", "")
    raw_stream = not fmt and not thumb and (bool(media_kind) or bool(range_header))
    if request.method == "HEAD" and not fmt and not thumb:
        raw_stream = True
    if raw_stream:
        try:
            stat = await run_in_threadpool(svc.stat_object, key)
            total = int(stat.get("ContentLength") or 0)
            selected = _parse_range(range_header, total) if range_header else None
        except ValueError:
            return Response(status_code=416, headers={
                **_SANDBOX, "Content-Range": f"bytes */{total if 'total' in locals() else 0}",
                "Accept-Ranges": "bytes", "Cache-Control": "no-store",
            })
        except Exception as exc:  # noqa: BLE001
            return _err(exc)

        status = 206 if selected else 200
        start, end, s3_range = selected if selected else (0, max(0, total - 1), None)
        headers = {
            **_SANDBOX,
            "Content-Disposition": _cd(name, "inline" if media_kind else _disposition(mime)),
            "ETag": etag,
            "Cache-Control": "private, no-store" if stream_raw else cache,
            "Accept-Ranges": "bytes",
            "Content-Length": str(end - start + 1 if total else 0),
        }
        if selected:
            headers["Content-Range"] = f"bytes {start}-{end}/{total}"
        if request.method == "HEAD":
            return Response(status_code=status, media_type=stream_mime, headers=headers)

        try:
            opened = await run_in_threadpool(svc.open_object, key, s3_range)
            body = opened["Body"]
        except Exception as exc:  # noqa: BLE001
            return _err(exc)

        # Cookie playback claims once and writes the audit BEFORE bytes are
        # offered, so a disconnect cannot consume the claim and suppress all
        # evidence. Bearer range reads retain the existing background audit.
        background = None
        try:
            if stream_raw:
                first = await run_in_threadpool(
                    stream_sessions.claim_first_use, stream_raw, node_id, version_id)
                if first:
                    accepted = await record_audit(
                        "download_document", actor_id=owner, actor_kind="owner",
                        resource_type="document", resource_id=node_id,
                        affected_owner=file_owner,
                        metadata={"doc_kind": media_kind or doc_kind, "delivery": "range"},
                    )
                    await run_in_threadpool(
                        stream_sessions.finish_audit, stream_raw, node_id, version_id, bool(accepted))
            else:
                background = BackgroundTask(
                    record_audit,
                    "download_document",
                    actor_id=owner,
                    actor_kind="owner",
                    resource_type="document",
                    resource_id=node_id,
                    affected_owner=file_owner,
                    metadata={"doc_kind": media_kind or doc_kind, "delivery": "range"},
                )
        except Exception as exc:  # claim/setup failure must release S3 socket
            await run_in_threadpool(body.close)
            return _err(exc)
        return _ClosingStreamingResponse(
            body, status_code=status, media_type=stream_mime,
            headers=headers, background=background,
        )

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


@router.post("/files/upload-intent")
async def upload_intent(
    request: Request,
    body: dict = Body(default={}),
    _claims: dict = Depends(require_auth),
):
    """Hand back a form the client POSTs straight to S3.

    The bytes never touch this process. What the client gets is a capability
    to write ONE server-chosen key, bounded by ``content-length-range`` and
    expiring in minutes. It is not a capability to read anything, and it
    cannot be pointed at another object.
    """
    owner = extract_user_id(request)
    mime = str(body.get("mimeType") or "application/octet-stream")
    try:
        svc = get_storage()
        intent = await run_in_threadpool(
            functools.partial(
                svc.presign_upload, owner, mime=mime, max_bytes=MAX_UPLOAD_BYTES
            )
        )
    except Exception as exc:  # noqa: BLE001
        return _err(exc)
    return intent


@router.post("/files/upload-complete")
async def upload_complete(
    request: Request,
    body: dict = Body(...),
    _claims: dict = Depends(require_auth),
):
    """Turn a finished direct upload into a file node.

    Size and content type are read back from S3, never taken from this body —
    the client is the one party that was not watched during the upload.
    """
    owner = extract_user_id(request)
    upload_id = str(body.get("uploadId") or "")
    if not upload_id:
        return JSONResponse(status_code=400, content={"error": "uploadId is required"})
    on_conflict = str(body.get("onConflict") or "version")
    if on_conflict not in {"version", "duplicate"}:
        return JSONResponse(status_code=400, content={"error": "invalid onConflict"})
    parent_id = body.get("parentId") or None
    try:
        svc = get_storage()
        org_id, workspace_id = _scope(svc)
        node = await run_in_threadpool(
            functools.partial(
                svc.create_file_from_pending,
                owner,
                upload_id,
                parent_id,
                str(body.get("name") or "document"),
                owner,
                max_bytes=MAX_UPLOAD_BYTES,
                org_id=org_id,
                workspace_id=workspace_id,
                app_id=body.get("appId") or None,
                on_conflict=on_conflict,
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
