"""Local contract tests for Aadhaar records and the encrypted vault.

No AWS or provider call is made: a deterministic in-memory KMS and an
in-memory record/vault store exercise the same encryption-context, one-use and
durability paths as production. The SQL-heavy release and sweep behaviour is
proven against real PostgreSQL in test_aadhaar_vault_db.py.

Synthetic Aadhaar only: 123412341234.
"""
from __future__ import annotations

import asyncio
import json
import logging
import re
from datetime import datetime, timedelta, timezone
from pathlib import Path

import psycopg
import pytest
from cryptography.fernet import Fernet

from src import aadhaar

SYNTHETIC = "123412341234"
_UUIDS = re.compile(r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|\b[0-9a-f]{32}\b")


def twelve_digit_runs(text: str) -> list[str]:
    """Every 12-digit run outside a UUID (a UUID's last group may be all digits)."""
    return re.findall(r"\d{12}", _UUIDS.sub("", text))


class FakeKms:
    def __init__(self, fail=False):
        self.values = {}
        self.contexts = []
        self.fail = fail

    def encrypt(self, *, KeyId, Plaintext, EncryptionContext):
        if self.fail:
            raise RuntimeError("KMS said no for arn:aws:kms:ap-south-1:000000000000:key/test")
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


class Transaction:
    async def __aenter__(self):
        return self

    async def __aexit__(self, *_exc):
        return False


class FakeConnection:
    """The record and vault statements of aadhaar.py, held in dicts."""

    def __init__(self):
        self.vault = {}
        self.records = {}
        self.statements = []
        self.fail_with = None

    def transaction(self):
        return Transaction()

    async def execute(self, sql, params=()):
        self.statements.append((sql, tuple(params)))
        if self.fail_with:
            raise self.fail_with
        now = datetime.now(timezone.utc)
        if sql.startswith("INSERT INTO aadhaar_vault"):
            token, owner, ciphertext = params
            self.vault[token] = {"token": token, "owner_user_id": owner, "ciphertext": ciphertext}
            return FakeCursor(rowcount=1)
        if sql.startswith("SELECT ciphertext FROM aadhaar_vault"):
            token, owner = params
            row = self.vault.get(token)
            return FakeCursor(dict(row) if row and row["owner_user_id"] == owner else None)
        if sql.startswith("INSERT INTO aadhaar_candidates"):
            (record_id, owner, masked, last4, token, origin, job_id,
             name, dob, gender, address, confidence, *rest) = params
            typed = bool(rest)
            assert ("%s::timestamptz" in sql) == typed
            self.records[record_id] = {
                "id": record_id, "owner_user_id": owner, "masked": masked, "last4": last4,
                "vault_token": token, "origin": origin, "job_id": job_id, "name": name, "dob": dob,
                "gender": gender, "address": address, "confidence": confidence,
                "expires_at": rest[0] if typed else now + timedelta(minutes=30),
                "consumed_at": now if typed else None, "updated_at": now,
            }
            return FakeCursor(rowcount=1)
        if sql.startswith("SELECT id, masked FROM aadhaar_candidates"):
            assert "consumed_at IS NULL" in sql and "vault_token IS NOT NULL" in sql and "FOR UPDATE" in sql
            record_id, owner = params
            row = self.records.get(record_id)
            live = (row and row["owner_user_id"] == owner and row["consumed_at"] is None
                    and isinstance(row["expires_at"], datetime) and row["expires_at"] > now
                    and row["vault_token"] is not None)
            return FakeCursor({"id": row["id"], "masked": row["masked"]} if live else None)
        if sql.startswith("UPDATE aadhaar_candidates SET consumed_at=now()"):
            expires, record_id, owner = params
            row = self.records[record_id]
            assert row["owner_user_id"] == owner
            row.update(consumed_at=now, expires_at=expires, updated_at=now)
            return FakeCursor(rowcount=1)
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


async def _vault_plain(conn, owner, token):
    """Test-only decrypt. No runtime path does this: nothing reads the digits back."""
    row = await (await conn.execute(
        "SELECT ciphertext FROM aadhaar_vault WHERE token=%s AND owner_user_id=%s", (token, owner))).fetchone()
    if not row:
        return None
    return (await aadhaar._decrypt_bytes(row["ciphertext"], owner, aadhaar.VAULT_PURPOSE, token)).decode()


@pytest.fixture(autouse=True)
def no_digits_in_logs(caplog):
    caplog.set_level(logging.DEBUG)
    yield
    for record in caplog.records:
        assert not twelve_digit_runs(record.getMessage())


@pytest.fixture
def secured(monkeypatch):
    kms = FakeKms()
    pool = FakePool()
    monkeypatch.setenv("AADHAAR_KMS_KEY_ARN", "arn:aws:kms:ap-south-1:000000000000:key/test")
    monkeypatch.setenv("APP_ENV", "test")
    monkeypatch.delenv("ALLOW_INSECURE_LOCAL", raising=False)
    monkeypatch.delenv("AADHAAR_ENC_KEY", raising=False)
    monkeypatch.setattr(aadhaar, "_kms", kms)
    monkeypatch.setattr(aadhaar, "_pool", pool)
    return kms, pool


def _local_fernet(monkeypatch, key=None):
    monkeypatch.setenv("APP_ENV", "local")
    monkeypatch.setenv("ALLOW_INSECURE_LOCAL", "1")
    monkeypatch.delenv("AADHAAR_KMS_KEY_ARN", raising=False)
    monkeypatch.delenv("AADHAAR_LEGACY_WRITE_BRIDGE", raising=False)
    monkeypatch.setenv("AADHAAR_ENC_KEY", key or Fernet.generate_key().decode())


def _local_without_a_key(monkeypatch):
    monkeypatch.setenv("APP_ENV", "local")
    monkeypatch.setenv("ALLOW_INSECURE_LOCAL", "1")
    monkeypatch.delenv("AADHAAR_ENC_KEY", raising=False)
    monkeypatch.delenv("AADHAAR_KMS_KEY_ARN", raising=False)
    monkeypatch.delenv("AADHAAR_LEGACY_WRITE_BRIDGE", raising=False)


def test_mask_is_strict_and_never_returns_full_digits():
    assert aadhaar.mask("1234 1234 1234") == "XXXX-XXXX-1234"
    assert aadhaar.mask("123") == ""
    assert aadhaar.digits("1234-1234-1234") == SYNTHETIC


# ── vault and record writes ───────────────────────────────────────────

def test_create_record_writes_one_kms_vault_row_and_a_masked_record(secured):
    kms, pool = secured
    owner = "issuer.example|subject-123"
    record = asyncio.run(aadhaar.create_record(
        pool.conn, owner, digits12=SYNTHETIC, origin="scan", job_id="job-1"))
    assert record["masked"] == "XXXX-XXXX-1234"
    assert len(pool.conn.vault) == 1 and len(pool.conn.records) == 1
    stored = pool.conn.records[record["id"]]
    token = stored["vault_token"]
    assert stored["masked"] == "XXXX-XXXX-1234" and stored["last4"] == "1234"
    assert stored["origin"] == "scan" and stored["job_id"] == "job-1"
    assert stored["consumed_at"] is None
    assert pool.conn.vault[token]["ciphertext"].startswith(aadhaar.KMS_PREFIX)
    context = kms.contexts[-1]
    assert context["purpose"] == "aadhaar-vault" and context["schema"] == "v1"
    assert context["record"] == token
    context_json = json.dumps(context, sort_keys=True)
    assert SYNTHETIC not in context_json and owner not in context_json
    # Nothing but the vault row carries ciphertext; the record holds no digits.
    assert not twelve_digit_runs(json.dumps(stored, default=str))
    assert asyncio.run(_vault_plain(pool.conn, owner, token)) == SYNTHETIC
    assert asyncio.run(_vault_plain(pool.conn, "someone-else", token)) is None


def test_fernet_mode_writes_the_same_vault_table(monkeypatch):
    _local_fernet(monkeypatch)
    conn = FakeConnection()
    record = asyncio.run(aadhaar.create_record(conn, "owner", digits12=SYNTHETIC, origin="typed"))
    token = conn.records[record["id"]]["vault_token"]
    assert conn.vault[token]["ciphertext"].startswith(aadhaar.FERNET_PREFIX)
    assert asyncio.run(_vault_plain(conn, "owner", token)) == SYNTHETIC
    assert asyncio.run(_vault_plain(conn, "intruder", token)) is None


def test_a_typed_record_is_consumed_and_durable_from_the_start(secured):
    _kms, pool = secured
    record = asyncio.run(aadhaar.create_record(pool.conn, "owner", digits12=SYNTHETIC, origin="typed"))
    stored = pool.conn.records[record["id"]]
    assert stored["consumed_at"] is not None
    assert stored["expires_at"] == aadhaar.DURABLE_EXPIRES_AT
    insert = next(s for s, _p in pool.conn.statements if s.startswith("INSERT INTO aadhaar_candidates"))
    assert "%s::timestamptz" in insert


def test_no_runtime_path_decrypts_the_vault():
    src = Path(__file__).resolve().parents[1] / "src"
    for path in src.rglob("*.py"):
        text = path.read_text()
        if path.name == "aadhaar.py":
            # Defined once; never called from its own runtime paths either.
            assert text.count("_decrypt_bytes(") == 1
            continue
        assert "_decrypt_bytes" not in text, path.name
    main = (src / "main.py").read_text()
    code = "\n".join(line.split("#", 1)[0] for line in main.splitlines())
    assert not re.search(r"decrypt\w*\(|import[^\n]*decrypt", code)


def test_removed_functions_are_gone():
    for name in ("encrypt_number", "decrypt_number", "consume_candidate", "resolve_for_storage"):
        assert not hasattr(aadhaar, name), name


# ── secure_extraction_result ──────────────────────────────────────────

def test_extraction_stores_exactly_what_it_returns_and_never_the_digits(secured):
    _kms, pool = secured
    result = asyncio.run(aadhaar.secure_extraction_result("owner-a", {
        "fields": {
            "name": "Example Person 1234 1234 1234",
            "dob": "2000-01-01",
            "gender": "Female",
            "aadhaar": SYNTHETIC,
            "address": "Example address",
            "confidence": "HIGH",
            "unexpected": "must not escape",
        },
        "raw": f"provider text with {SYNTHETIC}",
    }, job_id="job-7"))
    fields = result["fields"]
    assert set(fields) == {"name", "dob", "gender", "address", "confidence",
                           "aadhaarMasked", "aadhaarCandidateId"}
    assert fields["aadhaarMasked"] == "XXXX-XXXX-1234"
    serialized = json.dumps(result)
    assert not twelve_digit_runs(serialized)
    assert "raw" not in serialized and "unexpected" not in serialized
    stored = pool.conn.records[fields["aadhaarCandidateId"]]
    for key in ("name", "dob", "gender", "address", "confidence"):
        assert stored[key] == fields[key], key
    assert fields["gender"] == "female" and fields["confidence"] == "high"
    assert stored["job_id"] == "job-7" and stored["origin"] == "scan"


def test_extraction_normalizes_bad_values_once(secured):
    _kms, pool = secured
    result = asyncio.run(aadhaar.secure_extraction_result("owner-a", {"fields": {
        "name": "N" * 300, "address": "A" * 700, "dob": "2000-02-30",
        "gender": "unknown", "confidence": "certain", "aadhaar": SYNTHETIC,
    }}))
    fields = result["fields"]
    assert len(fields["name"]) == 200 and len(fields["address"]) == 500
    assert fields["dob"] == "" and fields["gender"] == "" and fields["confidence"] == ""
    stored = pool.conn.records[fields["aadhaarCandidateId"]]
    assert (stored["name"], stored["address"], stored["dob"]) == (fields["name"], fields["address"], "")
    for bad in ("01/01/2000", "2000-1-1", "not a date"):
        out = asyncio.run(aadhaar.secure_extraction_result("owner-a", {"fields": {"dob": bad}}))
        assert out["fields"]["dob"] == ""


def test_a_reading_without_twelve_digits_stores_no_record(secured):
    _kms, pool = secured
    result = asyncio.run(aadhaar.secure_extraction_result("owner-a", {"fields": {
        "name": "Example", "aadhaar": "1234"}}))
    assert result["fields"]["aadhaarCandidateId"] == "" and result["fields"]["aadhaarMasked"] == ""
    assert pool.conn.records == {} and pool.conn.vault == {}


def test_a_store_error_is_protection_unavailable_not_a_generic_failure(secured, caplog):
    _kms, pool = secured
    pool.conn.fail_with = psycopg.OperationalError("connection to server at 10.0.0.1 failed")
    with pytest.raises(aadhaar.ProtectionUnavailable) as refused:
        asyncio.run(aadhaar.secure_extraction_result("owner-a", {"fields": {"aadhaar": SYNTHETIC}}))
    assert str(refused.value) == aadhaar.PROTECTION_FAILED_MESSAGE
    assert "aadhaar.record_store_failed type=OperationalError" in caplog.text
    assert "10.0.0.1" not in caplog.text


def test_an_unbound_store_is_protection_unavailable(secured, monkeypatch):
    monkeypatch.setattr(aadhaar, "_pool", None)
    with pytest.raises(aadhaar.ProtectionUnavailable) as refused:
        asyncio.run(aadhaar.secure_extraction_result("owner-a", {"fields": {"aadhaar": SYNTHETIC}}))
    assert str(refused.value) == aadhaar.PROTECTION_FAILED_MESSAGE


# ── one-use consumption ───────────────────────────────────────────────

def _scan(pool, owner="owner-a"):
    return asyncio.run(aadhaar.secure_extraction_result(
        owner, {"fields": {"aadhaar": SYNTHETIC}}))["fields"]["aadhaarCandidateId"]


def test_a_reading_is_consumed_once_by_its_owner_and_becomes_durable(secured):
    _kms, pool = secured
    candidate = _scan(pool)
    expired_or_used = "expired or was already used"
    with pytest.raises(ValueError, match=expired_or_used):
        asyncio.run(aadhaar.resolve_record(pool.conn, "owner-b", "", candidate))
    record_id, masked = asyncio.run(aadhaar.resolve_record(pool.conn, "owner-a", "", candidate))
    assert (record_id, masked) == (candidate, "XXXX-XXXX-1234")
    stored = pool.conn.records[candidate]
    assert stored["consumed_at"] is not None and stored["expires_at"] == aadhaar.DURABLE_EXPIRES_AT
    sql, params = pool.conn.statements[-1]
    assert sql.startswith("UPDATE aadhaar_candidates SET consumed_at=now(), expires_at=%s::timestamptz, "
                          "updated_at=now()")
    assert params == (aadhaar.DURABLE_EXPIRES_AT, candidate, "owner-a")
    with pytest.raises(ValueError, match=expired_or_used):
        asyncio.run(aadhaar.resolve_record(pool.conn, "owner-a", "", candidate))


def test_an_expired_or_legacy_reading_is_refused(secured):
    _kms, pool = secured
    expired = _scan(pool)
    pool.conn.records[expired]["expires_at"] = datetime.now(timezone.utc) - timedelta(seconds=1)
    legacy = _scan(pool)
    pool.conn.records[legacy]["vault_token"] = None
    for candidate in (expired, legacy):
        with pytest.raises(ValueError, match="expired or was already used"):
            asyncio.run(aadhaar.resolve_record(pool.conn, "owner-a", "", candidate))


def test_resolve_record_input_rules(secured):
    _kms, pool = secured
    assert asyncio.run(aadhaar.resolve_record(pool.conn, "owner", "  ", "")) == ("", "")
    assert pool.conn.statements == []
    with pytest.raises(ValueError, match="not both"):
        asyncio.run(aadhaar.resolve_record(pool.conn, "owner", SYNTHETIC, "candidate"))
    with pytest.raises(ValueError, match="exactly 12 digits"):
        asyncio.run(aadhaar.resolve_record(pool.conn, "owner", "12345", ""))
    record_id, masked = asyncio.run(aadhaar.resolve_record(pool.conn, "owner", "1234 1234 1234", ""))
    assert masked == "XXXX-XXXX-1234"
    assert pool.conn.records[record_id]["origin"] == "typed"


def test_releasing_an_empty_id_costs_no_query():
    conn = FakeConnection()
    assert asyncio.run(aadhaar.release_if_unreferenced(conn, "owner", "")) == 0
    assert conn.statements == []


# ── protection failures ───────────────────────────────────────────────

def test_missing_production_key_fails_closed(monkeypatch, caplog):
    monkeypatch.delenv("AADHAAR_KMS_KEY_ARN", raising=False)
    monkeypatch.delenv("AADHAAR_ENC_KEY", raising=False)
    monkeypatch.delenv("ALLOW_INSECURE_LOCAL", raising=False)
    monkeypatch.setenv("APP_ENV", "prod")
    with pytest.raises(RuntimeError, match="AADHAAR_KMS_KEY_ARN is required"):
        aadhaar.validate_configuration()
    with pytest.raises(aadhaar.ProtectionUnavailable) as refused:
        asyncio.run(aadhaar.vault_put(FakeConnection(), "owner", SYNTHETIC))
    assert str(refused.value) == aadhaar.PROTECTION_FAILED_MESSAGE
    assert "cause=NoWritePath" in caplog.text


def test_local_without_a_key_has_no_write_path_and_names_it(monkeypatch, caplog):
    _local_without_a_key(monkeypatch)
    assert not aadhaar.write_path_available()
    conn = FakeConnection()
    with pytest.raises(aadhaar.ProtectionUnavailable) as refused:
        asyncio.run(aadhaar.vault_put(conn, "owner", SYNTHETIC))
    assert str(refused.value) == aadhaar.PROTECTION_FAILED_MESSAGE
    assert isinstance(refused.value, RuntimeError)
    assert "aadhaar.encrypt failed" in caplog.text and "cause=NoWritePath" in caplog.text
    assert conn.vault == {}

    monkeypatch.setenv("AADHAAR_ENC_KEY", Fernet.generate_key().decode())
    assert aadhaar.write_path_available()
    token = asyncio.run(aadhaar.vault_put(conn, "owner", SYNTHETIC))
    assert conn.vault[token]["ciphertext"].startswith(aadhaar.FERNET_PREFIX)

    monkeypatch.setenv("AADHAAR_ENC_KEY", "not-a-key")
    assert not aadhaar.write_path_available()


def test_an_invalid_fernet_key_is_a_protection_failure_without_key_material(monkeypatch, caplog):
    _local_fernet(monkeypatch, key="not-a-valid-fernet-key-value")
    conn = FakeConnection()
    with pytest.raises(aadhaar.ProtectionUnavailable) as refused:
        asyncio.run(aadhaar.vault_put(conn, "owner", SYNTHETIC))
    assert str(refused.value) == aadhaar.PROTECTION_FAILED_MESSAGE
    assert "cause=RuntimeError" in caplog.text
    assert "not-a-valid-fernet-key-value" not in caplog.text
    assert conn.vault == {}


def test_a_kms_failure_is_the_one_fixed_sentence(secured, monkeypatch, caplog):
    _kms, pool = secured
    monkeypatch.setattr(aadhaar, "_kms", FakeKms(fail=True))
    with pytest.raises(aadhaar.ProtectionUnavailable) as refused:
        asyncio.run(aadhaar.secure_extraction_result("owner-a", {"fields": {"aadhaar": SYNTHETIC}}))
    assert str(refused.value) == aadhaar.PROTECTION_FAILED_MESSAGE
    assert "000000000000" not in caplog.text
    assert pool.conn.records == {}


def test_local_validation_warns_instead_of_failing(monkeypatch, caplog):
    _local_without_a_key(monkeypatch)
    with caplog.at_level("WARNING", logger="pattadar.aadhaar"):
        aadhaar.validate_configuration()
    assert "aadhaar.write_path_missing" in caplog.text


def test_production_kms_writes_require_explicit_rollout_gate(monkeypatch):
    kms = FakeKms()
    monkeypatch.setattr(aadhaar, "_kms", kms)
    monkeypatch.setenv("APP_ENV", "prod")
    monkeypatch.setenv("AADHAAR_KMS_KEY_ARN", "arn:aws:kms:ap-south-1:000000000000:key/test")
    monkeypatch.delenv("AADHAAR_KMS_WRITES_ENABLED", raising=False)
    monkeypatch.delenv("AADHAAR_LEGACY_WRITE_BRIDGE", raising=False)
    conn = FakeConnection()
    with pytest.raises(aadhaar.ProtectionUnavailable) as refused:
        asyncio.run(aadhaar.vault_put(conn, "owner", SYNTHETIC))
    assert str(refused.value) == aadhaar.PROTECTION_FAILED_MESSAGE

    monkeypatch.setenv("AADHAAR_KMS_WRITES_ENABLED", "1")
    token = asyncio.run(aadhaar.vault_put(conn, "owner", SYNTHETIC))
    assert conn.vault[token]["ciphertext"].startswith(aadhaar.KMS_PREFIX)


def test_legacy_unprefixed_fernet_ciphertext_remains_readable_to_the_test_helper(monkeypatch):
    key = Fernet.generate_key()
    token = Fernet(key).encrypt(SYNTHETIC.encode()).decode()
    monkeypatch.setenv("AADHAAR_ENC_KEY", key.decode())
    monkeypatch.delenv("AADHAAR_KMS_KEY_ARN", raising=False)
    assert asyncio.run(aadhaar._decrypt_bytes(token, "legacy-owner", "aadhaar-vault", "t")) == SYNTHETIC.encode()


# ── redaction (unchanged contract) ────────────────────────────────────

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
            "document_no": 432143214321,
        },
        "raw": '{"aadhaar":"567856785678"}',
    })
    serialized = json.dumps(safe)
    assert "raw" not in safe
    assert "1234/5678/9012" not in serialized
    assert "1111.2222.3333" not in serialized
    assert "432143214321" not in serialized
    assert "567856785678" not in serialized
