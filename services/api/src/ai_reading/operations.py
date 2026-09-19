"""The AI document reading operations.

Moved verbatim from services/api/src/main.py (AI consolidation, Phase 1).
Every HTTP status code, response body and log line is unchanged; routes.py
registers these under exactly the same paths as before.

These are deterministic workflows, not an agent: one bounded document plus one
versioned prompt in, typed fields out. The conversational agent lives in
services/assistant and shares no code with this path on purpose — the two have
different retry and durability semantics.
"""
from __future__ import annotations

import base64
import logging

import httpx
from fastapi import File, Request, UploadFile
from fastapi.responses import JSONResponse

from .. import aadhaar, fmb_geometry
from .providers.anthropic import (
    extract_json,
    failure_message,
    provider_api_key,
    send_messages,
    vision_extract,
)
from .config import IMPORT_MODEL
from .consent import require_read_consent
from .prompts import (
    AADHAAR_SYSTEM,
    DEED_SYSTEM,
    PARCEL_PHOTO_SYSTEM,
    PASSBOOK_SYSTEM,
    PROPERTY_SYSTEM,
)
from .usage import cacheable_system, log_usage

_log = logging.getLogger("pattadar")

# ── AI Passbook Importer ──────────────────────────────────────────────
# The "Passbook Importer" AI task (prompts/ai-tasks/passbook-importer.yaml):
# the user uploads a passbook document / screenshot / PDF and a vision LLM
# extracts the location + pattadar fields to prefill the Create Passbook form.


async def import_passbook(file: UploadFile = File(...), request: Request = None):
    await require_read_consent(request)
    api_key = provider_api_key()
    if not api_key:
        return JSONResponse(status_code=503, content={"error": "AI import is not configured"})
    data = await file.read()
    if len(data) > 8 * 1024 * 1024:
        return JSONResponse(status_code=413, content={"error": "File too large (max 8 MB)"})
    mime = (file.content_type or "").lower()
    name = (file.filename or "").lower()
    b64 = base64.standard_b64encode(data).decode()
    if mime == "application/pdf" or name.endswith(".pdf"):
        block = {"type": "document", "source": {"type": "base64", "media_type": "application/pdf", "data": b64}}
    elif mime.startswith("image/"):
        block = {"type": "image", "source": {"type": "base64", "media_type": mime, "data": b64}}
    else:
        return JSONResponse(status_code=400, content={"error": "Upload a PDF, JPG or PNG"})
    payload = {
        "model": IMPORT_MODEL,
        # Output is pure JSON and you only pay for what is produced, so the
        # ceiling is set by the longest document, not the typical one. At 3000
        # a 14 MB multi-page deed stopped mid-object (stop_reason=max_tokens)
        # and the app prefilled nothing.
        # The model reasons before answering, and that reasoning is billed against
        # max_tokens. On a 14 MB deed it spent 8228 tokens thinking — more than the
        # entire 8000 ceiling — so the JSON was cut off mid-object and the app was
        # told the document "ran out of room". The ceiling now comfortably exceeds
        # thinking + answer, and effort=medium cuts the thinking (and the wait, 132s
        # to 53s) without changing a single extracted value.
        "max_tokens": 16000,
        "output_config": {"effort": "medium"},
        "system": cacheable_system(PASSBOOK_SYSTEM),
        "messages": [{"role": "user", "content": [
            block,
            {"type": "text", "text": "Extract the passbook fields and return ONLY the JSON object."},
        ]}],
    }
    try:
        r = await send_messages(payload, api_key=api_key, timeout=200)
    except httpx.TimeoutException:
        _log.warning("AI extract timed out (file=%s, model=%s)", file.filename or "", IMPORT_MODEL)
        return JSONResponse(status_code=504, content={"error": "AI took too long to read this document (timed out). Try again or enter details manually."})
    except Exception as e:
        _log.warning("AI extract failed (file=%s, bytes=%d): %r", file.filename or "", len(data), e)
        return JSONResponse(status_code=502, content={"error": failure_message(e, len(data))})
    if r.status_code != 200:
        _log.warning("AI extract non-200 (file=%s, status=%s): %s", file.filename or "", r.status_code, (r.text or '')[:300])
        return JSONResponse(status_code=502, content={"error": f"The AI service refused this file (HTTP {r.status_code}). {(r.text or '')[:160]}"})
    body = r.json()
    log_usage(body, endpoint="import-passbook", name=file.filename or "", attempt="first")
    text = "".join(b.get("text", "") for b in body.get("content", []) if b.get("type") == "text").strip()
    fields = extract_json(text)
    # Running out of room is a budget problem, not a bad document — so try once
    # more with the model reasoning less, which leaves far more of the ceiling
    # for the answer. Only worth doing when that is demonstrably what happened.
    if (not fields) and body.get("stop_reason") == "max_tokens":
        _log.info("AI extract hit the ceiling (file=%s) — retrying with lower effort", file.filename or "")
        retry = dict(payload)
        retry["output_config"] = {"effort": "low"}
        try:
            r2 = await send_messages(retry, api_key=api_key, timeout=200)
            if r2.status_code == 200:
                body = r2.json()
                log_usage(body, endpoint="import-passbook", name=file.filename or "", attempt="low-effort-retry")
                text = "".join(b.get("text", "") for b in body.get("content", []) if b.get("type") == "text").strip()
                fields = extract_json(text)
        except Exception as e:
            _log.warning("AI extract low-effort retry failed (file=%s): %r", file.filename or "", e)
    if not text or not fields:
        # An empty or unparseable reply used to be returned as a 200 with
        # {"fields": {}} — the app then prefilled nothing and the form sat there
        # looking untouched, which reads as "the button did nothing". A document
        # we could not read is a failure and must say so.
        _log.warning(
            "AI extract produced nothing (file=%s, bytes=%d, stop_reason=%s, text_len=%d)",
            file.filename or "", len(data), body.get("stop_reason"), len(text),
        )
        msg = ("This passbook is long enough that the reading ran out of room. Photograph just the "
               "pages with the details, or enter them by hand."
               if body.get("stop_reason") == "max_tokens" else
               "Nothing could be read from this passbook. It may be a scan of photographs rather "
               "than text — try a clearer copy, or enter the details by hand.")
        return JSONResponse(status_code=502, content={"error": msg})
    return {"fields": fields, "raw": text}


async def classify_parcel_photo(file: UploadFile = File(...)):
    """Classify an image BEFORE it is stored (CL-600..604).

    The bytes are held in memory for the length of this call and written
    nowhere — no disk, no S3, no database. That matters most for the case this
    exists to catch: an Aadhaar card must not be persisted anywhere in order to
    discover that it should not be persisted.
    """
    data = await file.read()
    out = await vision_extract(
        data, file.content_type or "", file.filename or "",
        PARCEL_PHOTO_SYSTEM, "Classify this picture and return ONLY the JSON object.",
        endpoint="classify-parcel-photo")
    if "_error" in out:
        # An image we cannot READ is not an image we can vouch for. Returning an
        # error would make the client fail open and accept it silently, which is
        # exactly wrong for the case this endpoint exists to catch. HEIC (which
        # the vision API cannot decode) and oversized files land here.
        _log.info("classify: unreadable (%s) — returning unknown", out["_error"][1])
        return {"kind": "", "category": "general", "confidence": "low",
                "reason": "could not read this image"}
    fields = out.get("fields") or {}
    kind = str(fields.get("kind", "")).strip().lower()
    # An unrecognised answer must not read as "land" — unknown means unknown,
    # and the client treats unknown as a soft warning rather than approval.
    if kind not in {"land", "document", "id_document", "person", "screenshot", "other"}:
        kind = ""
    return {
        "kind": kind,
        "category": str(fields.get("category", "general")).strip().lower() or "general",
        "confidence": str(fields.get("confidence", "low")).strip().lower() or "low",
        "reason": str(fields.get("reason", "")).strip()[:120],
    }


async def extract_aadhaar(file: UploadFile = File(...), request: Request = None):
    await require_read_consent(request)
    data = await file.read()
    safe_name = "aadhaar.pdf" if (file.content_type or "").casefold() == "application/pdf" else "aadhaar-image"
    out = await vision_extract(data, file.content_type or "", safe_name,
                                   AADHAAR_SYSTEM, "Extract the Aadhaar KYC fields and return ONLY the JSON object.",
                                   endpoint="extract-aadhaar")
    if "_error" in out:
        code, msg = out["_error"]
        return JSONResponse(status_code=code, content={"error": msg})
    # Internal durable jobs know the owner from their claimed row and sanitize
    # immediately before persistence. The synchronous route sanitizes here.
    if request is None:
        return out
    owner = (request.headers.get("x-user-id") or "").strip()
    if not owner:
        return JSONResponse(status_code=401, content={"error": "Sign in to read an Aadhaar"})
    return await aadhaar.secure_extraction_result(owner, out)


async def import_registered_document(file: UploadFile = File(...), request: Request = None):
    await require_read_consent(request)
    api_key = provider_api_key()
    if not api_key:
        return JSONResponse(status_code=503, content={"error": "AI import is not configured"})
    data = await file.read()
    if len(data) > 25 * 1024 * 1024:
        return JSONResponse(status_code=413, content={"error": "File too large (max 25 MB)"})
    mime = (file.content_type or "").lower()
    name = (file.filename or "").lower()
    b64 = base64.standard_b64encode(data).decode()
    if mime == "application/pdf" or name.endswith(".pdf"):
        block = {"type": "document", "source": {"type": "base64", "media_type": "application/pdf", "data": b64}}
    elif mime.startswith("image/"):
        block = {"type": "image", "source": {"type": "base64", "media_type": mime, "data": b64}}
    else:
        return JSONResponse(status_code=400, content={"error": "Upload a PDF, JPG or PNG"})
    payload = {
        "model": IMPORT_MODEL,
        # Output is pure JSON and you only pay for what is produced, so the
        # ceiling is set by the longest document, not the typical one. At 3000
        # a 14 MB multi-page deed stopped mid-object (stop_reason=max_tokens)
        # and the app prefilled nothing.
        # The model reasons before answering, and that reasoning is billed against
        # max_tokens. On a 14 MB deed it spent 8228 tokens thinking — more than the
        # entire 8000 ceiling — so the JSON was cut off mid-object and the app was
        # told the document "ran out of room". The ceiling now comfortably exceeds
        # thinking + answer, and effort=medium cuts the thinking (and the wait, 132s
        # to 53s) without changing a single extracted value.
        "max_tokens": 16000,
        "output_config": {"effort": "medium"},
        "system": cacheable_system(DEED_SYSTEM),
        "messages": [{"role": "user", "content": [
            block,
            {"type": "text", "text": "Extract the registered-document fields and return ONLY the JSON object."},
        ]}],
    }
    status, result = await extract_registered_fields(
        api_key=api_key, payload=payload, data_len=len(data), name=file.filename or "")
    if status == 200:
        return result
    return JSONResponse(status_code=status, content=result)


async def extract_registered_fields(
    *, api_key: str, payload: dict, data_len: int, name: str
) -> tuple[int, dict]:
    """The read itself, callable from the sync endpoint AND the async job.

    Returns (200, {"fields", "raw"}) or (status, {"error"}) — exactly the
    bodies the sync endpoint has always sent."""
    try:
        r = await send_messages(payload, api_key=api_key, timeout=180)
    except httpx.TimeoutException:
        _log.warning("AI extract timed out (file=%s, model=%s)", name, IMPORT_MODEL)
        return 504, {"error": "AI took too long to read this document (timed out). Try again or enter details manually."}
    except Exception as e:
        _log.warning("AI extract failed (file=%s, bytes=%d): %r", name, data_len, e)
        return 502, {"error": failure_message(e, data_len)}
    if r.status_code != 200:
        _log.warning("AI extract non-200 (file=%s, status=%s): %s", name, r.status_code, (r.text or '')[:300])
        return 502, {"error": f"The AI service refused this file (HTTP {r.status_code}). {(r.text or '')[:160]}"}
    body = r.json()
    log_usage(body, endpoint="import-registered-document", name=name, attempt="first")
    text = "".join(b.get("text", "") for b in body.get("content", []) if b.get("type") == "text").strip()
    fields = extract_json(text)
    # Running out of room is a budget problem, not a bad document — so try once
    # more with the model reasoning less, which leaves far more of the ceiling
    # for the answer. Only worth doing when that is demonstrably what happened.
    if (not fields) and body.get("stop_reason") == "max_tokens":
        _log.info("AI extract hit the ceiling (file=%s) — retrying with lower effort", name)
        retry = dict(payload)
        retry["output_config"] = {"effort": "low"}
        try:
            r2 = await send_messages(retry, api_key=api_key, timeout=200)
            if r2.status_code == 200:
                body = r2.json()
                log_usage(body, endpoint="import-registered-document", name=name, attempt="low-effort-retry")
                text = "".join(b.get("text", "") for b in body.get("content", []) if b.get("type") == "text").strip()
                fields = extract_json(text)
        except Exception as e:
            _log.warning("AI extract low-effort retry failed (file=%s): %r", name, e)
    if not text or not fields:
        # An empty or unparseable reply used to be returned as a 200 with
        # {"fields": {}} — the app then prefilled nothing and the form sat there
        # looking untouched, which reads as "the button did nothing". A document
        # we could not read is a failure and must say so.
        _log.warning(
            "AI extract produced nothing (file=%s, bytes=%d, stop_reason=%s, text_len=%d)",
            name, data_len, body.get("stop_reason"), len(text),
        )
        msg = ("This document is long enough that the reading ran out of room. Photograph just the "
               "pages with the details, or enter them by hand."
               if body.get("stop_reason") == "max_tokens" else
               "Nothing could be read from this document. It may be a scan of photographs rather "
               "than text — try a clearer copy, or enter the details by hand.")
        return 502, {"error": msg}
    # A vector FMB's corner table becomes the §13 stored shape here — ring,
    # sides, bearings, area, cross-checks — so every screen downstream
    # computes nothing but unit conversion.
    try:
        fmb_geometry.attach_geometry(fields)
    except Exception as e:
        _log.warning("FMB geometry derivation failed (file=%s): %r", name, e)
    return 200, aadhaar.sanitize_document_result({"fields": fields, "raw": text})


async def extract_property(file: UploadFile = File(...), request: Request = None):
    await require_read_consent(request)
    data = await file.read()
    out = await vision_extract(
        data, file.content_type or "", file.filename or "",
        PROPERTY_SYSTEM,
        "Classify kind and extract the property (or agricultural parcel) fields. Return ONLY the JSON object.",
        max_mb=25, max_tokens=16000, endpoint="extract-property",
    )
    if "_error" in out:
        status, msg = out["_error"]
        return JSONResponse(status_code=status, content={"error": msg})
    return {"fields": out.get("fields") or {}}
