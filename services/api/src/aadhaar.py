"""Aadhaar field protection and short-lived extraction candidates.

Production uses direct AWS KMS encryption for this tiny sensitive field. The
application never receives KMS key material. Legacy Fernet ciphertext remains
readable during a bounded migration window; Fernet writes are local-development
only and require ALLOW_INSECURE_LOCAL=1.
"""
from __future__ import annotations

import asyncio
import base64
import hashlib
import json
import logging
import os
import re
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any

from cryptography.fernet import Fernet, InvalidToken

_log = logging.getLogger("pattadar.aadhaar")
_pool = None
_kms = None
KMS_PREFIX = "kms-direct:v1:"
FERNET_PREFIX = "fernet:v0:"
CANDIDATE_TTL_MINUTES = 30

DDL = """
CREATE TABLE IF NOT EXISTS aadhaar_candidates (
 id TEXT PRIMARY KEY,
 owner_user_id TEXT NOT NULL,
 ciphertext TEXT NOT NULL,
 masked TEXT NOT NULL,
 expires_at TIMESTAMPTZ NOT NULL,
 consumed_at TIMESTAMPTZ,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_aadhaar_candidates_owner
 ON aadhaar_candidates(owner_user_id, expires_at);
"""


def bind(pool) -> None:
    global _pool
    _pool = pool


def validate_configuration() -> None:
    """Fail startup outside local/test when Aadhaar cannot be written.

    The key on its own is not enough. With neither AADHAAR_KMS_WRITES_ENABLED
    nor AADHAAR_LEGACY_WRITE_BRIDGE set, _encrypt_bytes raises and every KYC
    save, member save and Aadhaar extraction fails — after the extraction has
    already been paid for. That is a deployment mistake, so it belongs at
    startup rather than one 500 per request.
    """
    environment = os.getenv("APP_ENV", "local").strip().casefold()
    if environment in {"local", "test"}:
        return
    if not os.getenv("AADHAAR_KMS_KEY_ARN", "").strip():
        raise RuntimeError("AADHAAR_KMS_KEY_ARN is required outside local/test")
    if os.getenv("AADHAAR_KMS_WRITES_ENABLED", "") != "1" and \
            os.getenv("AADHAAR_LEGACY_WRITE_BRIDGE", "") != "1":
        raise RuntimeError(
            "no Aadhaar write path is enabled: set AADHAAR_KMS_WRITES_ENABLED=1 "
            "(or AADHAAR_LEGACY_WRITE_BRIDGE=1 for the legacy bridge)"
        )


async def ensure_schema(conn) -> None:
    await conn.execute(DDL)


def digits(raw: str) -> str:
    # Aadhaar is represented using the ASCII decimal alphabet. Reject rather
    # than normalize lookalike Unicode numerals into a stored identity value.
    value = "".join(ch for ch in str(raw or "") if "0" <= ch <= "9")
    return value if len(value) == 12 else ""


def mask(raw: str) -> str:
    value = digits(raw)
    return f"XXXX-XXXX-{value[-4:]}" if value else ""


def _owner_ref(owner: str) -> str:
    return hashlib.sha256(owner.encode()).hexdigest()[:32]


def _context(owner: str, purpose: str, record: str) -> dict[str, str]:
    # Encryption context is plaintext in CloudTrail: only non-PII identifiers.
    return {
        "app": "pattadar",
        "environment": os.getenv("APP_ENV", "local"),
        "purpose": purpose,
        "owner_ref": _owner_ref(owner),
        "record": record,
        "schema": "v1",
    }


def _fernet() -> Fernet | None:
    key = os.getenv("AADHAAR_ENC_KEY", "").strip()
    if not key:
        return None
    try:
        return Fernet(key.encode())
    except Exception as exc:
        raise RuntimeError("AADHAAR_ENC_KEY is invalid") from exc


def _kms_client():
    global _kms
    if _kms is None:
        import boto3
        _kms = boto3.client("kms", region_name=os.getenv("AWS_REGION", "ap-south-1"))
    return _kms


def _kms_encrypt_sync(plaintext: bytes, context: dict[str, str]) -> str:
    key = os.getenv("AADHAAR_KMS_KEY_ARN", "").strip()
    if not key:
        raise RuntimeError("Aadhaar KMS encryption is not configured")
    response = _kms_client().encrypt(KeyId=key, Plaintext=plaintext, EncryptionContext=context)
    return KMS_PREFIX + base64.b64encode(response["CiphertextBlob"]).decode()


def _kms_decrypt_sync(token: str, context: dict[str, str]) -> bytes:
    key = os.getenv("AADHAAR_KMS_KEY_ARN", "").strip()
    if not key:
        raise RuntimeError("Aadhaar KMS decryption is not configured")
    blob = base64.b64decode(token.removeprefix(KMS_PREFIX), validate=True)
    response = _kms_client().decrypt(
        KeyId=key,
        CiphertextBlob=blob,
        EncryptionContext=context,
    )
    return bytes(response["Plaintext"])


def _unavailable(operation: str, owner: str, purpose: str, record: str, exc: Exception) -> RuntimeError:
    """One stable sentence for every protection failure.

    A KMS, base64 or cipher error carries key identifiers and sometimes the
    material itself, so the cause is recorded as a type against non-identifying
    references and never reaches the caller.
    """
    _log.warning("aadhaar.%s failed (purpose=%s, record=%s, owner_ref=%s, cause=%s)",
                 operation, purpose, record, _owner_ref(owner), type(exc).__name__)
    return RuntimeError("Aadhaar protection is temporarily unavailable")


async def _encrypt_bytes(plaintext: bytes, owner: str, purpose: str, record: str) -> str:
    environment = os.getenv("APP_ENV", "local").strip().casefold()
    local_or_test = environment in {"local", "test"}
    kms_writes = local_or_test or os.getenv("AADHAAR_KMS_WRITES_ENABLED", "") == "1"
    if os.getenv("AADHAAR_KMS_KEY_ARN", "").strip() and kms_writes:
        try:
            return await asyncio.to_thread(_kms_encrypt_sync, plaintext, _context(owner, purpose, record))
        except Exception as exc:
            raise _unavailable("encrypt", owner, purpose, record, exc) from exc
    legacy_bridge = os.getenv("AADHAAR_LEGACY_WRITE_BRIDGE", "") == "1"
    if legacy_bridge or (local_or_test and os.getenv("ALLOW_INSECURE_LOCAL", "") == "1"):
        cipher = _fernet()
        if cipher:
            try:
                return FERNET_PREFIX + cipher.encrypt(plaintext).decode()
            except Exception as exc:
                raise _unavailable("encrypt", owner, purpose, record, exc) from exc
    raise RuntimeError("Aadhaar protected writes are not enabled")


async def _decrypt_bytes(token: str, owner: str, purpose: str, record: str) -> bytes:
    if token.startswith(KMS_PREFIX):
        try:
            return await asyncio.to_thread(_kms_decrypt_sync, token, _context(owner, purpose, record))
        except Exception as exc:
            raise _unavailable("decrypt", owner, purpose, record, exc) from exc
    cipher = _fernet()
    if not cipher:
        raise RuntimeError("Legacy Aadhaar decryption is not configured")
    raw = token.removeprefix(FERNET_PREFIX)
    try:
        return cipher.decrypt(raw.encode())
    except InvalidToken as exc:
        raise ValueError("Stored Aadhaar could not be decrypted") from exc
    except Exception as exc:
        raise _unavailable("decrypt", owner, purpose, record, exc) from exc


async def encrypt_number(raw: str, owner: str, subject_kind: str, subject_id: str) -> tuple[str, str]:
    value = digits(raw)
    if not value:
        return "", ""
    token = await _encrypt_bytes(value.encode(), owner, f"aadhaar-{subject_kind}", subject_id)
    return mask(value), token


async def decrypt_number(token: str, owner: str, subject_kind: str, subject_id: str) -> str:
    if not (token or "").strip():
        return ""
    plaintext = await _decrypt_bytes(token, owner, f"aadhaar-{subject_kind}", subject_id)
    value = digits(plaintext.decode())
    if not value:
        raise ValueError("Stored Aadhaar is invalid")
    return value


# Anything that is not a digit or a letter separates the groups — punctuation,
# any dash, any space, and underscore, which is a word character and so would
# otherwise slip through.
_AADHAAR_LIKE = re.compile(r"(?<!\d)(?:\d[\W_]*){11}\d(?!\d)")


def _redact_aadhaar_like(value: Any) -> str:
    """Mask every 12-digit run regardless of separators or numeral script."""
    text = str(value or "")

    def replacement(match: re.Match[str]) -> str:
        numerals = "".join(ch for ch in match.group(0) if ch.isdigit())
        return f"XXXX-XXXX-{numerals[-4:]}"

    return _AADHAAR_LIKE.sub(replacement, text)


def _redact_structure(value: Any) -> Any:
    if isinstance(value, dict):
        return {str(key): _redact_structure(item) for key, item in value.items()}
    if isinstance(value, list):
        return [_redact_structure(item) for item in value]
    if isinstance(value, str):
        return _redact_aadhaar_like(value)
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        text = str(value)
        redacted = _redact_aadhaar_like(text)
        return redacted if redacted != text else value
    return value


def sanitize_document_result(result: dict[str, Any]) -> dict[str, Any]:
    """Defence-in-depth for Aadhaar numbers seen by generic document reads."""
    fields = _redact_structure(dict(result.get("fields") or {}))
    raw = _redact_aadhaar_like(result.get("raw", ""))
    doc_type = str(fields.get("doc_type") or "").strip().casefold()
    # Raw model JSON adds no value for identity cards and carries the greatest
    # risk of repeating identifiers outside the documented field names.
    return {"fields": fields} if doc_type in {"aadhaar", "pan"} else {"fields": fields, "raw": raw}


async def secure_extraction_result(owner: str, result: dict[str, Any]) -> dict[str, Any]:
    """Replace full extracted digits/raw provider JSON with an opaque candidate."""
    fields = dict(result.get("fields") or {})
    value = digits(str(fields.pop("aadhaar", "")))
    # Strictly allow only the documented UI fields. Provider raw text and any
    # unexpected model keys never cross the API boundary or enter job results.
    safe = {
        key: _redact_aadhaar_like(fields.get(key, ""))
        for key in ("name", "dob", "gender", "address", "confidence")
    }
    safe["aadhaarMasked"] = mask(value)
    safe["aadhaarCandidateId"] = ""
    if value:
        if _pool is None:
            raise RuntimeError("Aadhaar candidate store is unavailable")
        candidate_id = str(uuid.uuid4())
        payload = json.dumps({
            "digits": value,
            "owner_ref": _owner_ref(owner),
            "issued_at": datetime.now(timezone.utc).isoformat(),
        }, separators=(",", ":")).encode()
        ciphertext = await _encrypt_bytes(payload, owner, "aadhaar-candidate", candidate_id)
        expires = datetime.now(timezone.utc) + timedelta(minutes=CANDIDATE_TTL_MINUTES)
        async with _pool.connection() as conn:
            await conn.execute(
                "INSERT INTO aadhaar_candidates(id,owner_user_id,ciphertext,masked,expires_at) "
                "VALUES (%s,%s,%s,%s,%s)",
                (candidate_id, owner, ciphertext, mask(value), expires))
        safe["aadhaarCandidateId"] = candidate_id
    return {"fields": safe}


async def consume_candidate(conn, owner: str, candidate_id: str) -> str:
    if not candidate_id:
        return ""
    row = await (await conn.execute(
        "SELECT * FROM aadhaar_candidates WHERE id=%s AND owner_user_id=%s "
        "AND consumed_at IS NULL AND expires_at>now() FOR UPDATE",
        (candidate_id, owner))).fetchone()
    if not row:
        raise ValueError("The Aadhaar reading expired or was already used; read the card again")
    plaintext = await _decrypt_bytes(row["ciphertext"], owner, "aadhaar-candidate", candidate_id)
    try:
        payload = json.loads(plaintext)
    except (TypeError, ValueError) as exc:
        raise ValueError("The Aadhaar reading is invalid") from exc
    value = digits(str(payload.get("digits") or ""))
    if not value or payload.get("owner_ref") != _owner_ref(owner) or mask(value) != row["masked"]:
        raise ValueError("The Aadhaar reading is invalid")
    changed = await conn.execute(
        "UPDATE aadhaar_candidates SET consumed_at=now() WHERE id=%s AND owner_user_id=%s "
        "AND consumed_at IS NULL", (candidate_id, owner))
    if changed.rowcount != 1:
        raise ValueError("The Aadhaar reading was already used")
    return value


async def resolve_for_storage(
    conn, *, owner: str, raw: str, candidate_id: str,
    subject_kind: str, subject_id: str,
) -> tuple[str, str]:
    if raw and candidate_id:
        raise ValueError("Use either typed Aadhaar or a card reading, not both")
    value = await consume_candidate(conn, owner, candidate_id) if candidate_id else digits(raw)
    if (raw or candidate_id) and not value:
        raise ValueError("Aadhaar must be exactly 12 digits")
    return await encrypt_number(value, owner, subject_kind, subject_id) if value else ("", "")


async def cleanup_expired(conn) -> None:
    await conn.execute("DELETE FROM aadhaar_candidates WHERE expires_at<now() OR consumed_at<now()-interval '1 day'")
