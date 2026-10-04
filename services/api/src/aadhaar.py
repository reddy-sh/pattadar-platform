"""Aadhaar records and the encrypted vault that holds the full number.

Every reading or typed Aadhaar is one row in `aadhaar_candidates` (the record:
extracted fields, last 4, job id, card link). The full 12 digits live only in
`aadhaar_vault`, as ciphertext under an opaque token, and nothing at runtime
decrypts them. Production encrypts with direct AWS KMS; Fernet writes are
local-development only and require ALLOW_INSECURE_LOCAL=1 (or the legacy
bridge).
"""
from __future__ import annotations

import asyncio
import base64
import hashlib
import logging
import os
import re
import uuid
from datetime import date
from typing import Any

import psycopg
from cryptography.fernet import Fernet, InvalidToken

_log = logging.getLogger("pattadar.aadhaar")
_pool = None
_kms = None
KMS_PREFIX = "kms-direct:v1:"
FERNET_PREFIX = "fernet:v0:"
CANDIDATE_TTL_MINUTES = 30
UNAVAILABLE_MESSAGE = (
    "Aadhaar reading is not available on this server: Aadhaar protection is "
    "not configured. Nothing was sent for reading."
)
# The one sentence for every protection failure after a read: misconfiguration,
# KMS/Fernet error or a failed record store. Fixed and PII-free.
PROTECTION_FAILED_MESSAGE = "Aadhaar protection is temporarily unavailable"
# Consumed and typed records are durable. A far-future expiry keeps them out of
# the previous release's sweep (`expires_at<now()`) during a deploy overlap or
# rollback. Not 'infinity': psycopg cannot load it into a datetime, which would
# break the owner's data export. Always bound as %s::timestamptz.
DURABLE_EXPIRES_AT = "9999-01-01 00:00:00+00"
VAULT_PURPOSE = "aadhaar-vault"


class ProtectionUnavailable(RuntimeError):
    """No Aadhaar write path, or the configured one failed. PII-free message."""


class NoWritePath(Exception):
    """Cause recorded (as a type only) when no write mode is configured."""


DDL = """
CREATE TABLE IF NOT EXISTS aadhaar_vault (
 token TEXT PRIMARY KEY,
 owner_user_id TEXT NOT NULL,
 ciphertext TEXT NOT NULL,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_aadhaar_vault_owner ON aadhaar_vault(owner_user_id);

CREATE TABLE IF NOT EXISTS aadhaar_candidates (
 id TEXT PRIMARY KEY,
 owner_user_id TEXT NOT NULL,
 ciphertext TEXT,
 masked TEXT NOT NULL,
 expires_at TIMESTAMPTZ NOT NULL,
 consumed_at TIMESTAMPTZ,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE aadhaar_candidates ALTER COLUMN ciphertext DROP NOT NULL;
ALTER TABLE aadhaar_candidates ADD COLUMN IF NOT EXISTS origin TEXT NOT NULL DEFAULT 'scan';
ALTER TABLE aadhaar_candidates ADD COLUMN IF NOT EXISTS job_id TEXT NOT NULL DEFAULT '';
ALTER TABLE aadhaar_candidates ADD COLUMN IF NOT EXISTS name TEXT NOT NULL DEFAULT '';
ALTER TABLE aadhaar_candidates ADD COLUMN IF NOT EXISTS dob TEXT NOT NULL DEFAULT '';
ALTER TABLE aadhaar_candidates ADD COLUMN IF NOT EXISTS gender TEXT NOT NULL DEFAULT '';
ALTER TABLE aadhaar_candidates ADD COLUMN IF NOT EXISTS address TEXT NOT NULL DEFAULT '';
ALTER TABLE aadhaar_candidates ADD COLUMN IF NOT EXISTS confidence TEXT NOT NULL DEFAULT '';
ALTER TABLE aadhaar_candidates ADD COLUMN IF NOT EXISTS last4 TEXT NOT NULL DEFAULT '';
ALTER TABLE aadhaar_candidates ADD COLUMN IF NOT EXISTS vault_token TEXT
 REFERENCES aadhaar_vault(token) ON DELETE SET NULL;
ALTER TABLE aadhaar_candidates ADD COLUMN IF NOT EXISTS card_node_id TEXT NOT NULL DEFAULT '';
ALTER TABLE aadhaar_candidates ADD COLUMN IF NOT EXISTS card_version_id TEXT NOT NULL DEFAULT '';
ALTER TABLE aadhaar_candidates ADD COLUMN IF NOT EXISTS card_mime TEXT NOT NULL DEFAULT '';
ALTER TABLE aadhaar_candidates ADD COLUMN IF NOT EXISTS card_size BIGINT NOT NULL DEFAULT 0;
ALTER TABLE aadhaar_candidates ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();
CREATE INDEX IF NOT EXISTS idx_aadhaar_candidates_owner
 ON aadhaar_candidates(owner_user_id, expires_at);
CREATE INDEX IF NOT EXISTS idx_aadhaar_candidates_vault ON aadhaar_candidates(vault_token);
COMMENT ON TABLE aadhaar_candidates IS
 'Aadhaar records: one row per read or typed Aadhaar. Full digits live only in aadhaar_vault.';
"""

# Boot DDL in main.init_db, after users and family_members exist. Kept here so
# the vault DB test runs exactly what boot runs.
SUBJECT_DDL = (
    "ALTER TABLE family_members ADD COLUMN IF NOT EXISTS aadhaar_record_id TEXT NOT NULL DEFAULT ''",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS kyc_aadhaar_record_id TEXT NOT NULL DEFAULT ''",
    "CREATE INDEX IF NOT EXISTS idx_family_aadhaar_record ON family_members(aadhaar_record_id) "
    "WHERE aadhaar_record_id <> ''",
    "CREATE INDEX IF NOT EXISTS idx_users_aadhaar_record ON users(kyc_aadhaar_record_id) "
    "WHERE kyc_aadhaar_record_id <> ''",
    # Reconcile (rollback safety): blank pointers to records that no longer exist.
    "UPDATE family_members m SET aadhaar_record_id='' WHERE aadhaar_record_id<>'' AND NOT EXISTS "
    "(SELECT 1 FROM aadhaar_candidates r WHERE r.id=m.aadhaar_record_id AND r.owner_user_id=m.owner_user_id)",
    "UPDATE users u SET kyc_aadhaar_record_id='' WHERE kyc_aadhaar_record_id<>'' AND NOT EXISTS "
    "(SELECT 1 FROM aadhaar_candidates r WHERE r.id=u.kyc_aadhaar_record_id AND r.owner_user_id=u.id)",
)


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
        # CI and tests run without a key, so local only warns: every scan and
        # save would otherwise fail silently at the first request.
        if not write_path_available():
            _log.warning("aadhaar.write_path_missing: Aadhaar scans and saves will be refused; "
                         "set AADHAAR_ENC_KEY with ALLOW_INSECURE_LOCAL=1 for local development")
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
    return ProtectionUnavailable(PROTECTION_FAILED_MESSAGE)


def _write_mode() -> str:
    """The one write-path decision: "kms", "fernet" or "" (none)."""
    environment = os.getenv("APP_ENV", "local").strip().casefold()
    local_or_test = environment in {"local", "test"}
    kms_writes = local_or_test or os.getenv("AADHAAR_KMS_WRITES_ENABLED", "") == "1"
    if os.getenv("AADHAAR_KMS_KEY_ARN", "").strip() and kms_writes:
        return "kms"
    legacy_bridge = os.getenv("AADHAAR_LEGACY_WRITE_BRIDGE", "") == "1"
    if legacy_bridge or (local_or_test and os.getenv("ALLOW_INSECURE_LOCAL", "") == "1"):
        if os.getenv("AADHAAR_ENC_KEY", "").strip():
            return "fernet"
    return ""


def write_path_available() -> bool:
    """Whether an Aadhaar can be protected now, checked before any paid read."""
    mode = _write_mode()
    if mode == "fernet":
        try:
            _fernet()
        except RuntimeError:
            return False
    return bool(mode)


async def _encrypt_bytes(plaintext: bytes, owner: str, purpose: str, record: str) -> str:
    mode = _write_mode()
    if mode == "kms":
        try:
            return await asyncio.to_thread(_kms_encrypt_sync, plaintext, _context(owner, purpose, record))
        except Exception as exc:
            raise _unavailable("encrypt", owner, purpose, record, exc) from exc
    if mode == "fernet":
        # An invalid key is a protection failure like any other: through
        # _unavailable, recorded as a type, never echoing the key.
        try:
            cipher = _fernet()
            if cipher:
                return FERNET_PREFIX + cipher.encrypt(plaintext).decode()
        except Exception as exc:
            raise _unavailable("encrypt", owner, purpose, record, exc) from exc
    raise _unavailable("encrypt", owner, purpose, record, NoWritePath())


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


async def vault_put(conn, owner: str, digits12: str) -> str:
    """Encrypt the full number once and store it under a fresh opaque token.

    The token is the KMS `record` context, so it is never derived from the
    number. Any protection failure raises ProtectionUnavailable."""
    token = str(uuid.uuid4())
    ciphertext = await _encrypt_bytes(digits12.encode(), owner, VAULT_PURPOSE, token)
    await conn.execute(
        "INSERT INTO aadhaar_vault (token, owner_user_id, ciphertext) VALUES (%s,%s,%s)",
        (token, owner, ciphertext))
    return token


_RECORD_FIELDS = ("name", "dob", "gender", "address", "confidence")


async def create_record(conn, owner: str, *, digits12: str, origin: str, job_id: str = "",
                        fields: dict[str, str] | None = None) -> dict[str, str]:
    """One record for one Aadhaar instance; its full number goes to the vault.

    A scan is a one-use reading for thirty minutes until a subject consumes it;
    a typed number is consumed and durable from the start."""
    value = digits(digits12)
    if not value:
        raise ValueError("Aadhaar must be exactly 12 digits")
    token = await vault_put(conn, owner, value)
    record_id = str(uuid.uuid4())
    safe = {key: str((fields or {}).get(key) or "") for key in _RECORD_FIELDS}
    if origin == "typed":
        expiry_sql, consumed_sql, params = "%s::timestamptz", "now()", (DURABLE_EXPIRES_AT,)
    else:
        expiry_sql, consumed_sql, params = f"now()+interval '{CANDIDATE_TTL_MINUTES} minutes'", "NULL", ()
    await conn.execute(
        "INSERT INTO aadhaar_candidates (id, owner_user_id, masked, last4, vault_token, origin, job_id, "
        "name, dob, gender, address, confidence, expires_at, consumed_at, updated_at) "
        f"VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,{expiry_sql},{consumed_sql},now())",
        (record_id, owner, mask(value), value[-4:], token, origin, job_id,
         safe["name"], safe["dob"], safe["gender"], safe["address"], safe["confidence"], *params))
    return {"id": record_id, "masked": mask(value)}


async def resolve_record(conn, owner: str, raw: str, candidate_id: str) -> tuple[str, str]:
    """The record a subject should point at, and its mask.

    ("", "") means no Aadhaar input: the caller leaves the subject's Aadhaar
    columns untouched. A card reading is consumed once and becomes durable; a
    typed number becomes a new typed record."""
    raw = (raw or "").strip()
    candidate_id = (candidate_id or "").strip()
    if not raw and not candidate_id:
        return "", ""
    if raw and candidate_id:
        raise ValueError("Use either typed Aadhaar or a card reading, not both")
    if candidate_id:
        row = await (await conn.execute(
            "SELECT id, masked FROM aadhaar_candidates WHERE id=%s AND owner_user_id=%s "
            "AND consumed_at IS NULL AND expires_at>now() AND vault_token IS NOT NULL FOR UPDATE",
            (candidate_id, owner))).fetchone()
        if not row:
            raise ValueError("The Aadhaar reading expired or was already used; read the card again")
        await conn.execute(
            "UPDATE aadhaar_candidates SET consumed_at=now(), expires_at=%s::timestamptz, updated_at=now() "
            "WHERE id=%s AND owner_user_id=%s",
            (DURABLE_EXPIRES_AT, candidate_id, owner))
        return row["id"], row["masked"]
    value = digits(raw)
    if not value:
        raise ValueError("Aadhaar must be exactly 12 digits")
    record = await create_record(conn, owner, digits12=value, origin="typed")
    return record["id"], record["masked"]


# A consumed record lives while any subject points at it. These two clauses are
# the one definition of "referenced", shared by release and the sweep backstop.
_UNREFERENCED = (
    "NOT EXISTS (SELECT 1 FROM family_members m WHERE m.owner_user_id=r.owner_user_id "
    "AND m.aadhaar_record_id=r.id) "
    "AND NOT EXISTS (SELECT 1 FROM users u WHERE u.id=r.owner_user_id AND u.kyc_aadhaar_record_id=r.id)"
)


async def _release(conn, owner: str, record_id: str | None) -> int:
    only_one = " AND r.id=%s" if record_id is not None else ""
    params = (owner, record_id, owner) if record_id is not None else (owner, owner)
    row = await (await conn.execute(
        "WITH gone AS (DELETE FROM aadhaar_candidates r WHERE r.owner_user_id=%s"
        f"{only_one} AND r.consumed_at IS NOT NULL AND {_UNREFERENCED} RETURNING r.vault_token), "
        "v AS (DELETE FROM aadhaar_vault USING gone WHERE aadhaar_vault.token=gone.vault_token "
        "AND aadhaar_vault.owner_user_id=%s RETURNING 1) "
        "SELECT count(*) AS n FROM gone", params)).fetchone()
    return int(row["n"]) if row else 0


async def release_if_unreferenced(conn, owner: str, record_id: str) -> int:
    """Delete one consumed record and its vault row once nothing points at it.

    Returns the record rows deleted (0 or 1). An empty id is the common case
    of "there was no previous Aadhaar" and costs no query."""
    if not (record_id or "").strip():
        return 0
    return await _release(conn, owner, record_id)


async def release_unreferenced(conn, owner: str) -> int:
    """After a subject delete: every unreferenced consumed record of this owner."""
    return await _release(conn, owner, None)


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


_ISO_DATE = re.compile(r"^\d{4}-\d{2}-\d{2}$")


def _normalized_fields(fields: dict[str, Any]) -> dict[str, str]:
    """The allowlisted fields, redacted and normalized once.

    The same dict is stored on the record and returned to the client, so the
    form and the record always agree."""
    safe = {key: _redact_aadhaar_like(fields.get(key, "")) for key in _RECORD_FIELDS}
    safe["name"] = safe["name"][:200]
    safe["address"] = safe["address"][:500]
    dob = safe["dob"].strip()
    try:
        safe["dob"] = dob if _ISO_DATE.match(dob) and date.fromisoformat(dob) else ""
    except ValueError:
        safe["dob"] = ""
    gender = safe["gender"].strip().casefold()
    safe["gender"] = gender if gender in {"male", "female", "other"} else ""
    confidence = safe["confidence"].strip().casefold()
    safe["confidence"] = confidence if confidence in {"high", "medium", "low"} else ""
    return safe


async def secure_extraction_result(owner: str, result: dict[str, Any], job_id: str = "") -> dict[str, Any]:
    """Store a reading as a record (full digits only in the vault) and return
    the masked, allowlisted fields with the record id as the candidate."""
    fields = dict(result.get("fields") or {})
    value = digits(str(fields.pop("aadhaar", "")))
    # Strictly allow only the documented UI fields. Provider raw text and any
    # unexpected model keys never cross the API boundary or enter job results.
    safe = _normalized_fields(fields)
    record = {"id": "", "masked": ""}
    if value:
        if _pool is None:
            raise ProtectionUnavailable(PROTECTION_FAILED_MESSAGE)
        try:
            async with _pool.connection() as conn, conn.transaction():
                record = await create_record(conn, owner, digits12=value, origin="scan",
                                             job_id=job_id, fields=safe)
        except psycopg.Error as exc:
            _log.warning("aadhaar.record_store_failed type=%s", type(exc).__name__)
            raise ProtectionUnavailable(PROTECTION_FAILED_MESSAGE) from exc
    return {"fields": {**safe, "aadhaarMasked": record["masked"], "aadhaarCandidateId": record["id"]}}


async def _count(conn, sql: str) -> int:
    row = await (await conn.execute(sql)).fetchone()
    return int(row["n"]) if row else 0


async def cleanup_expired(conn) -> None:
    """Sweep readings nobody applied, and anything a crash or rollback left.

    Consumed records are durable while referenced; release_* removes them when
    the last subject lets go. The five-minute backstop covers a release that
    never ran, measured from the last touch so an in-flight write is spared."""
    expired = await _count(
        conn,
        "WITH gone AS (DELETE FROM aadhaar_candidates WHERE consumed_at IS NULL AND expires_at<now() "
        "RETURNING vault_token, owner_user_id), "
        "v AS (DELETE FROM aadhaar_vault USING gone WHERE aadhaar_vault.token=gone.vault_token "
        "AND aadhaar_vault.owner_user_id=gone.owner_user_id RETURNING 1) "
        "SELECT count(*) AS n FROM gone")
    orphaned = await _count(
        conn,
        "WITH gone AS (DELETE FROM aadhaar_candidates r WHERE r.consumed_at IS NOT NULL "
        f"AND r.updated_at < now()-interval '5 minutes' AND {_UNREFERENCED} "
        "RETURNING r.vault_token, r.owner_user_id), "
        "v AS (DELETE FROM aadhaar_vault USING gone WHERE aadhaar_vault.token=gone.vault_token "
        "AND aadhaar_vault.owner_user_id=gone.owner_user_id RETURNING 1) "
        "SELECT count(*) AS n FROM gone")
    orphaned += await _count(
        conn,
        "WITH gone AS (DELETE FROM aadhaar_vault WHERE created_at < now()-interval '5 minutes' "
        "AND NOT EXISTS (SELECT 1 FROM aadhaar_candidates r WHERE r.vault_token=aadhaar_vault.token) "
        "RETURNING 1) SELECT count(*) AS n FROM gone")
    if expired or orphaned:
        _log.info("aadhaar.sweep expired=%d orphaned=%d", expired, orphaned)
