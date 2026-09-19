"""Local contract tests for Aadhaar field protection.

No AWS or provider call is made: a deterministic in-memory KMS and candidate
store exercise the same encryption-context and one-use paths as production.
"""
from __future__ import annotations

import asyncio
import json
from datetime import datetime, timedelta, timezone

import pytest
from cryptography.fernet import Fernet

from src import aadhaar


class FakeKms:
    def __init__(self):
        self.values = {}
        self.contexts = []

    def encrypt(self, *, KeyId, Plaintext, EncryptionContext):
        blob = f"cipher-{len(self.values)}".encode()
        self.values[blob] = (bytes(Plaintext), dict(EncryptionContext), KeyId)
        self.contexts.append(dict(EncryptionContext))
        return {"CiphertextBlob": blob}

    def decrypt(self, *, KeyId, CiphertextBlob, EncryptionContext):
        plaintext, context, key_id = self.values[bytes(CiphertextBlob)]
        assert KeyId == key_id
        assert EncryptionContext == context
        return {"Plaintext": plaintext}


class FakeCursor:
    def __init__(self, row=None, rowcount=0):
        self._row = row
        self.rowcount = rowcount

    async def fetchone(self):
        return self._row


class FakeConnection:
    def __init__(self):
        self.rows = {}

    async def execute(self, sql, params=()):
        if sql.startswith("INSERT INTO aadhaar_candidates"):
            candidate_id, owner, ciphertext, masked, expires = params
            self.rows[candidate_id] = {
                "id": candidate_id,
                "owner_user_id": owner,
                "ciphertext": ciphertext,
                "masked": masked,
                "expires_at": expires,
                "consumed_at": None,
            }
            return FakeCursor(rowcount=1)
        if sql.startswith("SELECT * FROM aadhaar_candidates"):
            candidate_id, owner = params
            row = self.rows.get(candidate_id)
            valid = (
                row
                and row["owner_user_id"] == owner
                and row["consumed_at"] is None
                and row["expires_at"] > datetime.now(timezone.utc)
            )
            return FakeCursor(dict(row) if valid else None)
        if sql.startswith("UPDATE aadhaar_candidates SET consumed_at"):
            candidate_id, owner = params
            row = self.rows.get(candidate_id)
            if row and row["owner_user_id"] == owner and row["consumed_at"] is None:
                row["consumed_at"] = datetime.now(timezone.utc)
                return FakeCursor(rowcount=1)
            return FakeCursor(rowcount=0)
        if sql.startswith("DELETE FROM aadhaar_candidates"):
            return FakeCursor()
        raise AssertionError(f"unexpected SQL: {sql}")


class ConnectionContext:
    def __init__(self, conn):
        self.conn = conn

    async def __aenter__(self):
        return self.conn

    async def __aexit__(self, *_exc):
        return False


class FakePool:
    def __init__(self):
        self.conn = FakeConnection()

    def connection(self):
        return ConnectionContext(self.conn)


@pytest.fixture
def secured(monkeypatch):
    kms = FakeKms()
    pool = FakePool()
    monkeypatch.setenv("AADHAAR_KMS_KEY_ARN", "arn:aws:kms:ap-south-1:000000000000:key/test")
    monkeypatch.setenv("APP_ENV", "test")
    monkeypatch.delenv("ALLOW_INSECURE_LOCAL", raising=False)
    monkeypatch.setattr(aadhaar, "_kms", kms)
    monkeypatch.setattr(aadhaar, "_pool", pool)
    return kms, pool


def test_mask_is_strict_and_never_returns_full_digits():
    assert aadhaar.mask("1234 5678 9012") == "XXXX-XXXX-9012"
    assert aadhaar.mask("123") == ""
    assert aadhaar.digits("1234-5678-9012") == "123456789012"


def test_kms_ciphertext_is_versioned_and_context_contains_no_pii(secured):
    kms, _pool = secured
    masked, token = asyncio.run(aadhaar.encrypt_number(
        "123456789012", "issuer.example|subject-123", "member", "member-1"))
    assert masked == "XXXX-XXXX-9012"
    assert token.startswith(aadhaar.KMS_PREFIX)
    context_json = json.dumps(kms.contexts[-1], sort_keys=True)
    assert "123456789012" not in context_json
    assert "issuer.example|subject-123" not in context_json
    assert kms.contexts[-1]["purpose"] == "aadhaar-member"
    assert asyncio.run(aadhaar.decrypt_number(
        token, "issuer.example|subject-123", "member", "member-1")) == "123456789012"


def test_extraction_is_allowlisted_masked_and_candidate_is_owner_scoped_one_use(secured):
    _kms, pool = secured
    result = asyncio.run(aadhaar.secure_extraction_result("owner-a", {
        "fields": {
            "name": "Example Person 1234 5678 9012",
            "dob": "2000-01-01",
            "gender": "female",
            "aadhaar": "123456789012",
            "address": "Example address",
            "confidence": "high",
            "unexpected": "must not escape",
        },
        "raw": "provider text with 123456789012",
    }))
    fields = result["fields"]
    candidate_id = fields["aadhaarCandidateId"]
    serialized = json.dumps(result)
    assert fields["aadhaarMasked"] == "XXXX-XXXX-9012"
    assert "123456789012" not in serialized
    assert "raw" not in serialized
    assert "unexpected" not in serialized
    assert candidate_id

    with pytest.raises(ValueError, match="expired or was already used"):
        asyncio.run(aadhaar.consume_candidate(pool.conn, "owner-b", candidate_id))
    assert asyncio.run(aadhaar.consume_candidate(
        pool.conn, "owner-a", candidate_id)) == "123456789012"
    with pytest.raises(ValueError, match="expired or was already used"):
        asyncio.run(aadhaar.consume_candidate(pool.conn, "owner-a", candidate_id))


def test_expired_candidate_is_rejected(secured):
    _kms, pool = secured
    result = asyncio.run(aadhaar.secure_extraction_result("owner-a", {
        "fields": {"aadhaar": "123456789012"},
    }))
    candidate_id = result["fields"]["aadhaarCandidateId"]
    pool.conn.rows[candidate_id]["expires_at"] = datetime.now(timezone.utc) - timedelta(seconds=1)
    with pytest.raises(ValueError, match="expired or was already used"):
        asyncio.run(aadhaar.consume_candidate(pool.conn, "owner-a", candidate_id))


def test_legacy_unprefixed_fernet_ciphertext_remains_readable(monkeypatch):
    key = Fernet.generate_key()
    token = Fernet(key).encrypt(b"123456789012").decode()
    monkeypatch.setenv("AADHAAR_ENC_KEY", key.decode())
    monkeypatch.delenv("AADHAAR_KMS_KEY_ARN", raising=False)
    assert asyncio.run(aadhaar.decrypt_number(
        token, "legacy-owner", "account", "legacy-owner")) == "123456789012"


def test_missing_production_key_fails_closed(monkeypatch):
    monkeypatch.delenv("AADHAAR_KMS_KEY_ARN", raising=False)
    monkeypatch.delenv("AADHAAR_ENC_KEY", raising=False)
    monkeypatch.delenv("ALLOW_INSECURE_LOCAL", raising=False)
    monkeypatch.setenv("APP_ENV", "prod")
    with pytest.raises(RuntimeError, match="AADHAAR_KMS_KEY_ARN is required"):
        aadhaar.validate_configuration()
    with pytest.raises(RuntimeError, match="not enabled"):
        asyncio.run(aadhaar.encrypt_number(
            "123456789012", "owner", "account", "owner"))


def test_redaction_catches_missing_primary_multiple_separators_and_unicode(secured):
    result = asyncio.run(aadhaar.secure_extraction_result("owner-a", {
        "fields": {
            "name": "Example 1234.5678/9012",
            "address": "Other 1111—2222—3333 and १२३४ ५६७८ ९०१२",
            "aadhaar": "",
        },
    }))
    serialized = json.dumps(result, ensure_ascii=False)
    assert "1234.5678/9012" not in serialized
    assert "1111—2222—3333" not in serialized
    assert "१२३४ ५६७८ ९०१२" not in serialized
    assert result["fields"]["aadhaarCandidateId"] == ""
    assert aadhaar.digits("१२३४५६७८९०१२") == ""


def test_generic_identity_document_drops_raw_and_masks_nested_numbers():
    safe = aadhaar.sanitize_document_result({
        "fields": {
            "doc_type": "Aadhaar",
            "address": "Example 1234/5678/9012",
            "parties": [{"name": "Person 1111.2222.3333"}],
            "document_no": 222233334444,
        },
        "raw": '{"aadhaar":"9999-8888-7777"}',
    })
    serialized = json.dumps(safe)
    assert "raw" not in safe
    assert "1234/5678/9012" not in serialized
    assert "1111.2222.3333" not in serialized
    assert "222233334444" not in serialized
    assert "9999-8888-7777" not in serialized


def test_production_kms_writes_require_explicit_rollout_gate(monkeypatch):
    kms = FakeKms()
    monkeypatch.setattr(aadhaar, "_kms", kms)
    monkeypatch.setenv("APP_ENV", "prod")
    monkeypatch.setenv("AADHAAR_KMS_KEY_ARN", "arn:aws:kms:ap-south-1:000000000000:key/test")
    monkeypatch.delenv("AADHAAR_KMS_WRITES_ENABLED", raising=False)
    monkeypatch.delenv("AADHAAR_LEGACY_WRITE_BRIDGE", raising=False)
    with pytest.raises(RuntimeError, match="not enabled"):
        asyncio.run(aadhaar.encrypt_number("123456789012", "owner", "account", "owner"))

    monkeypatch.setenv("AADHAAR_KMS_WRITES_ENABLED", "1")
    _masked, token = asyncio.run(aadhaar.encrypt_number(
        "123456789012", "owner", "account", "owner"))
    assert token.startswith(aadhaar.KMS_PREFIX)
