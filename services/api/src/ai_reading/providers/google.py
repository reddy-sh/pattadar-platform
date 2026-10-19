"""Google Document AI OCR followed by Gemini structured extraction.

No automatic paid-call retry. Credentials arrive from ai_reading/settings.py
(the Intelligence page's encrypted rows, else env); this module reads no env.
"""
from __future__ import annotations

import base64
import json
import logging
import re
import time

import httpx

from .anthropic import extract_json, note_dispatch, sniff_image_mime
from ..config import MODEL_TIMEOUT_SECONDS
from ..usage import safe_file_label

log = logging.getLogger("pattadar")
_MIMES = {"application/pdf", "image/png", "image/jpeg", "image/webp", "image/tiff"}
MODEL_ID = re.compile(r"gemini-[a-z0-9.-]{1,100}")
PROCESSOR = re.compile(
    r"projects/[a-zA-Z0-9_-]+/locations/(us|eu|asia-south1)/processors/[a-zA-Z0-9_-]+\Z"
)


# Fixed, never read from the key file: a saved key's own token_uri would let a
# settings row point the api at any host (SSRF).
TOKEN_URL = "https://oauth2.googleapis.com/token"
SCOPE = "https://www.googleapis.com/auth/cloud-platform"


def signed_assertion(service_account_json: str) -> bytes:
    """A service-account JWT (RFC 7523), signed locally. Raises on a key that
    does not parse, so a save can reject it before any reading depends on it."""
    from google.auth import crypt, jwt

    info = json.loads(service_account_json)
    now = int(time.time())
    return jwt.encode(crypt.RSASigner.from_service_account_info(info), {
        "iss": info["client_email"], "scope": SCOPE, "aud": TOKEN_URL,
        "iat": now, "exp": now + 600})


async def _access_token(service_account_json: str) -> str:
    async with httpx.AsyncClient(timeout=15.0) as client:
        response = await client.post(TOKEN_URL, data={
            "grant_type": "urn:ietf:params:oauth:grant-type:jwt-bearer",
            "assertion": signed_assertion(service_account_json)})
    response.raise_for_status()
    return response.json()["access_token"]


async def _ocr(data: bytes, mime: str, processor: str, service_account_json: str) -> tuple[str, int]:
    # shortcut: online :process takes ~15 pages per call; a longer deed fails
    # here (502, no fallback). Upgrade to batchProcess if long deeds go to Gemini.
    match = PROCESSOR.fullmatch(processor)
    if not match:
        raise ValueError("Invalid Document AI processor")
    token = await _access_token(service_account_json)
    region = match.group(1)
    url = f"https://{region}-documentai.googleapis.com/v1/{processor}:process"
    note_dispatch()
    async with httpx.AsyncClient(timeout=MODEL_TIMEOUT_SECONDS) as client:
        response = await client.post(
            url, headers={"Authorization": f"Bearer {token}"},
            json={"rawDocument": {"content": base64.b64encode(data).decode(), "mimeType": mime},
                  "fieldMask": "text,pages.pageNumber,pages.layout.textAnchor"},
        )
    response.raise_for_status()
    document = response.json().get("document") or {}
    full = document.get("text") or ""
    if not full.strip():
        raise ValueError("Document AI returned no text")
    pages = []
    for page in document.get("pages") or []:
        chunks = []
        for segment in (page.get("layout") or {}).get("textAnchor", {}).get("textSegments", []):
            start, end = int(segment.get("startIndex") or 0), int(segment.get("endIndex") or 0)
            if 0 <= start < end <= len(full):
                chunks.append(full[start:end])
        if chunks:
            pages.append(f"Page {page.get('pageNumber') or len(pages) + 1}:\n{''.join(chunks)}")
    return ("\n\n".join(pages) if pages else full, len(document.get("pages") or []))


async def extract(
    data: bytes, mime: str, name: str, system: str, user_text: str,
    *, model: str, api_key: str, ocr_enabled: bool, processor: str,
    service_account_json: str, endpoint: str,
) -> dict:
    """Return the existing {fields, raw, usage} contract or {_error}.

    The filename is never sent to Google or logged; the two calls share one
    bounded timeout each and the durable worker owns the no-retry policy.
    """
    if mime not in _MIMES:
        # A mislabelled upload (octet-stream) is read by its bytes, as the Claude path does.
        mime = "application/pdf" if data[:5] == b"%PDF-" else sniff_image_mime(data)
    if mime not in _MIMES:
        return {"_error": (400, "Upload a PDF, JPG, PNG, WebP or TIFF")}
    if len(data) > 25 * 1024 * 1024:
        return {"_error": (413, "File too large (max 25 MB)")}
    if not api_key or not MODEL_ID.fullmatch(model) or (
            ocr_enabled and not (processor and service_account_json)):
        return {"_error": (503, "Gemini document reading is not configured")}
    try:
        ocr_pages = 0
        if ocr_enabled:
            content, ocr_pages = await _ocr(data, mime, processor, service_account_json)
            if len(content) > 250_000:
                return {"_error": (413, "OCR text is too long for one reading")}
            parts = [{"text": user_text + "\n\nOCR transcript with page numbers:\n" + content}]
        else:
            parts = [{"inlineData": {"mimeType": mime,
                                      "data": base64.b64encode(data).decode()}},
                     {"text": user_text}]
        note_dispatch()
        async with httpx.AsyncClient(timeout=MODEL_TIMEOUT_SECONDS) as client:
            response = await client.post(
                f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent",
                headers={"x-goog-api-key": api_key},
                json={"systemInstruction": {"parts": [{"text": system}]},
                      "contents": [{"role": "user", "parts": parts}],
                      "generationConfig": {"responseMimeType": "application/json", "maxOutputTokens": 16000}},
            )
        response.raise_for_status()
        body = response.json()
        text = "".join(part.get("text", "") for item in body.get("candidates", [])
                       for part in (item.get("content") or {}).get("parts", [])).strip()
        fields = extract_json(text)
        if not fields:
            return {"_error": (502, "The AI service did not return readable fields")}
        tokens = body.get("usageMetadata") or {}
        prompt = int(tokens.get("promptTokenCount") or 0)
        output = max(0, int(tokens.get("totalTokenCount") or 0) - prompt)
        if not output:
            output = int(tokens.get("candidatesTokenCount") or 0)
        # Unknown model prices intentionally report 0, rather than a false bill.
        model_usd = (prompt * .30 + output * 2.50) / 1_000_000 if model == "gemini-3.5-flash-lite" else 0
        ocr_usd = ocr_pages * .0015  # Enterprise OCR list price, before monthly free tier.
        usd = model_usd + ocr_usd if model == "gemini-3.5-flash-lite" else 0
        log.info("ai.usage endpoint=%s model=%s file=%s input=%d output=%d usd=%.4f",
                 endpoint, model, safe_file_label(name), prompt, output, usd)
        return {"fields": fields, "raw": text,
                "usage": {"model": model, "input_tokens": prompt, "output_tokens": output,
                          "cache_write_tokens": 0, "cache_read_tokens": 0,
                          "ocr_pages": ocr_pages, "ocr_list_usd": round(ocr_usd, 4),
                          "usd": round(usd, 4)}}
    except httpx.TimeoutException:
        return {"_error": (504, "AI took too long to read this document. Try again or enter details manually.")}
    except Exception as exc:
        log.warning("Google document reading failed (endpoint=%s, kind=%s)", endpoint, type(exc).__name__)
        return {"_error": (502, "Google document reading failed. Check provider configuration or try again.")}


async def list_models(api_key: str) -> list[dict]:
    """Gemini models that can generate content: the Intelligence page's model
    list and its connection check. Free; no document leaves the service."""
    found: list[dict] = []
    token = ""
    async with httpx.AsyncClient(timeout=15.0) as client:
        while True:
            params = {"pageSize": 1000, **({"pageToken": token} if token else {})}
            response = await client.get(
                "https://generativelanguage.googleapis.com/v1beta/models",
                params=params, headers={"x-goog-api-key": api_key})
            response.raise_for_status()
            body = response.json()
            for item in body.get("models", []):
                model_id = str(item.get("name", "")).removeprefix("models/")
                if MODEL_ID.fullmatch(model_id) and "generateContent" in item.get(
                        "supportedGenerationMethods", []):
                    found.append({"id": model_id, "name": item.get("displayName") or model_id})
            next_token = body.get("nextPageToken") or ""
            if not next_token or next_token == token:
                return found
            token = next_token
