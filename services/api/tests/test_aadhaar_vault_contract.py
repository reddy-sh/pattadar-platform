"""The Aadhaar vault model through the GraphQL schema.

Resolvers run through `main.schema.execute` against a throwaway PostgreSQL
schema (the test_import_jobs.py pattern: skipped locally without PostgreSQL,
failing in CI when TEST_PG_DSN is set). Audit writes are captured, not stored.
Synthetic Aadhaar only.
"""
from __future__ import annotations

import asyncio
import os
import re
import secrets
import types
import uuid
from contextlib import asynccontextmanager

import psycopg
import pytest
from cryptography.fernet import Fernet
from psycopg import sql
from psycopg.rows import dict_row

from src import aadhaar, audit, main

OWNER = "owner-a"
FIRST, SECOND = "123412341234", "567856785678"
RETIRED = "Full Aadhaar numbers are not shown. Only the last 4 digits are kept for display."
_UUIDS = re.compile(r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}")

SCHEMA = """
CREATE TABLE users (
  id TEXT PRIMARY KEY, mobile TEXT NOT NULL DEFAULT '', email TEXT NOT NULL DEFAULT '',
  name TEXT NOT NULL DEFAULT '', language TEXT NOT NULL DEFAULT 'en',
  kyc_ref_masked TEXT NOT NULL DEFAULT '', kyc_ref_enc TEXT NOT NULL DEFAULT '',
  roles TEXT NOT NULL DEFAULT 'owner', notification_prefs TEXT NOT NULL DEFAULT 'email',
  districts_of_interest TEXT NOT NULL DEFAULT '', mfa_enabled BOOLEAN NOT NULL DEFAULT false,
  address TEXT NOT NULL DEFAULT '', last_active_at TEXT NOT NULL DEFAULT '',
  inactivity_email_enabled BOOLEAN NOT NULL DEFAULT true
);
CREATE TABLE groups (id TEXT PRIMARY KEY, owner_user_id TEXT NOT NULL, type TEXT NOT NULL DEFAULT 'family');
CREATE TABLE family_members (
  id TEXT PRIMARY KEY, owner_user_id TEXT NOT NULL, group_id TEXT NOT NULL DEFAULT '',
  role TEXT NOT NULL DEFAULT '', name TEXT NOT NULL DEFAULT '', relation TEXT NOT NULL DEFAULT 'other',
  gender TEXT NOT NULL DEFAULT '', dob TEXT NOT NULL DEFAULT '', phone TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '', bio TEXT NOT NULL DEFAULT '', photo TEXT NOT NULL DEFAULT '',
  is_self BOOLEAN NOT NULL DEFAULT false, father_id TEXT NOT NULL DEFAULT '',
  mother_id TEXT NOT NULL DEFAULT '', spouse_id TEXT NOT NULL DEFAULT '',
  is_beneficiary BOOLEAN NOT NULL DEFAULT false, share_pct REAL NOT NULL DEFAULT 0,
  kind TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT '', invite_status TEXT NOT NULL DEFAULT '',
  invite_token TEXT NOT NULL DEFAULT '', invite_channel TEXT NOT NULL DEFAULT '',
  phone_verified BOOLEAN NOT NULL DEFAULT false, email_verified BOOLEAN NOT NULL DEFAULT false,
  inactivity_email_consent BOOLEAN NOT NULL DEFAULT false,
  inactivity_email_consent_at TEXT NOT NULL DEFAULT '', parcel_id TEXT NOT NULL DEFAULT '',
  present_address TEXT NOT NULL DEFAULT '', aadhaar_masked TEXT NOT NULL DEFAULT '',
  aadhaar_enc TEXT NOT NULL DEFAULT '', is_minor BOOLEAN NOT NULL DEFAULT false,
  guardian_name TEXT NOT NULL DEFAULT '', guardian_contact TEXT NOT NULL DEFAULT '',
  marital_status TEXT NOT NULL DEFAULT '', spouse_name TEXT NOT NULL DEFAULT '',
  spouse_contact TEXT NOT NULL DEFAULT '', spouse_status TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT '', heir_confirmed TEXT NOT NULL DEFAULT '',
  heir_note TEXT NOT NULL DEFAULT ''
);
CREATE TABLE family_notifiers (member_id TEXT, owner_user_id TEXT, group_id TEXT);
CREATE TABLE inactivity_capabilities (recipient_ref TEXT, owner_user_id TEXT, group_id TEXT, consumed_at TEXT);
"""


@pytest.fixture
def db(monkeypatch):
    dsn = os.getenv("TEST_PG_DSN", "host=localhost port=5432 dbname=postgres user=rhub password=rhub-dev-pwd")
    schema = "test_vault_contract_" + secrets.token_hex(8)
    try:
        admin = psycopg.connect(dsn, autocommit=True)
    except psycopg.OperationalError:
        if os.getenv("TEST_PG_DSN"):
            raise
        pytest.skip("Set TEST_PG_DSN to run PostgreSQL integration tests")
    admin.execute(sql.SQL("CREATE SCHEMA {}").format(sql.Identifier(schema)))
    path = sql.SQL("SET search_path TO {}").format(sql.Identifier(schema))
    with psycopg.connect(dsn, autocommit=True) as conn:
        conn.execute(path)
        conn.execute(SCHEMA)
        conn.execute(aadhaar.DDL)
        for statement in aadhaar.SUBJECT_DDL:
            conn.execute(statement)
        conn.execute("INSERT INTO users (id, name, kyc_ref_enc) VALUES (%s, 'Owner', 'legacy-cipher')", (OWNER,))
        conn.execute("INSERT INTO groups (id, owner_user_id) VALUES ('g1', %s)", (OWNER,))
        conn.execute("INSERT INTO family_members (id, owner_user_id, group_id, name, is_self, aadhaar_enc) "
                     "VALUES ('self-1', %s, 'g1', 'Owner', true, 'legacy-cipher')", (OWNER,))

    class Pool:
        @asynccontextmanager
        async def connection(self):
            async with await psycopg.AsyncConnection.connect(dsn, autocommit=True, row_factory=dict_row) as conn:
                await conn.execute(path)
                yield conn

    audits = []

    async def capture(conn, actor, action, target, details="", **_kwargs):
        audits.append((actor, action, target, details))

    monkeypatch.setattr(main, "pool", Pool())
    monkeypatch.setattr(main, "log_audit", capture)
    monkeypatch.setenv("APP_ENV", "local")
    monkeypatch.setenv("ALLOW_INSECURE_LOCAL", "1")
    monkeypatch.delenv("AADHAAR_KMS_KEY_ARN", raising=False)
    monkeypatch.delenv("AADHAAR_LEGACY_WRITE_BRIDGE", raising=False)
    monkeypatch.setenv("AADHAAR_ENC_KEY", Fernet.generate_key().decode())

    def query(statement, params=()):
        with psycopg.connect(dsn, autocommit=True, row_factory=dict_row) as conn:
            conn.execute(path)
            return conn.execute(statement, params).fetchall()

    try:
        yield types.SimpleNamespace(query=query, audits=audits, pool=Pool())
    finally:
        admin.execute(sql.SQL("DROP SCHEMA {} CASCADE").format(sql.Identifier(schema)))
        admin.close()


def run(statement, variables=None, owner=OWNER):
    ctx = {"request": types.SimpleNamespace(headers={"x-user-id": owner})}
    return asyncio.run(main.schema.execute(statement, variable_values=variables, context_value=ctx))


def no_digits(result):
    text = _UUIDS.sub("", repr(result.data) + repr([e.message for e in result.errors or []]))
    assert not re.search(r"\d{12}", text)


def counts(db):
    row = db.query("SELECT (SELECT count(*) FROM aadhaar_candidates) AS records, "
                   "(SELECT count(*) FROM aadhaar_vault) AS vault")[0]
    return row["records"], row["vault"]


def scan_record(db, owner=OWNER):
    async def make():
        async with db.pool.connection() as conn:
            return (await aadhaar.create_record(conn, owner, digits12=FIRST, origin="scan"))["id"]
    return asyncio.run(make())


# ── retired reveals ───────────────────────────────────────────────────

def test_reveals_are_retired_and_write_no_audit(db):
    for statement in ("mutation { revealMyAadhaar }", 'mutation { revealMemberAadhaar(id: "self-1") }'):
        result = run(statement)
        assert [e.message for e in result.errors] == [RETIRED]
    assert db.audits == []


# ── linkAadhaarCard ───────────────────────────────────────────────────

LINK = ("mutation($c:String!,$n:String!,$v:String!){ "
        "linkAadhaarCard(candidateId:$c,nodeId:$n,versionId:$v) }")


def test_link_aadhaar_card_validates_ids(db):
    good = str(uuid.uuid4())
    for bad in ("not-a-uuid", "", good.replace("-", ""), good + "x" * 60, "{" + good + "}"):
        for variables in ({"c": bad, "n": good, "v": good}, {"c": good, "n": bad, "v": good},
                          {"c": good, "n": good, "v": bad}):
            result = run(LINK, variables)
            assert [e.message for e in result.errors] == ["Invalid Aadhaar card link"]
    assert db.audits == []


def test_link_aadhaar_card_is_owner_scoped_and_audited_without_names(db):
    record = scan_record(db)
    node, version = str(uuid.uuid4()), str(uuid.uuid4())
    stranger = run(LINK, {"c": record, "n": node, "v": version}, owner="owner-b")
    assert [e.message for e in stranger.errors] == ["The Aadhaar reading is no longer available"]
    unknown = run(LINK, {"c": str(uuid.uuid4()), "n": node, "v": version})
    assert [e.message for e in unknown.errors] == ["The Aadhaar reading is no longer available"]
    result = run(LINK, {"c": record, "n": node, "v": version})
    assert result.errors is None and result.data == {"linkAadhaarCard": True}
    row = db.query("SELECT card_node_id, card_version_id FROM aadhaar_candidates WHERE id=%s", (record,))[0]
    assert (row["card_node_id"], row["card_version_id"]) == (node, version)
    assert db.audits == [(OWNER, "link_aadhaar_card", record, "Kept an Aadhaar card")]
    spec = audit._SPECS["link_aadhaar_card"]
    assert spec.security is True and spec.data_class == audit.CLASS_SECURITY and spec.resource == "person"
    assert "link_aadhaar_card" not in audit.CRITICAL_ACTIONS


def test_an_expired_unconsumed_reading_cannot_be_linked(db):
    record = scan_record(db)
    db.query("UPDATE aadhaar_candidates SET expires_at=now()-interval '1 minute' WHERE id=%s RETURNING id", (record,))
    result = run(LINK, {"c": record, "n": str(uuid.uuid4()), "v": str(uuid.uuid4())})
    assert [e.message for e in result.errors] == ["The Aadhaar reading is no longer available"]


# ── typed writers ─────────────────────────────────────────────────────

PROFILE = "mutation($k:String!){ updateProfile(kycRef:$k){ kycRefMasked } }"


def test_update_profile_creates_a_typed_record_and_releases_the_prior_one(db):
    first = run(PROFILE, {"k": FIRST})
    assert first.errors is None and first.data["updateProfile"]["kycRefMasked"] == "XXXX-XXXX-1234"
    no_digits(first)
    user = db.query("SELECT kyc_aadhaar_record_id, kyc_ref_enc FROM users WHERE id=%s", (OWNER,))[0]
    assert user["kyc_ref_enc"] == ""
    record = db.query("SELECT origin, last4, consumed_at, vault_token FROM aadhaar_candidates WHERE id=%s",
                      (user["kyc_aadhaar_record_id"],))[0]
    assert record["origin"] == "typed" and record["last4"] == "1234" and record["consumed_at"] is not None
    assert counts(db) == (1, 1)

    second = run(PROFILE, {"k": SECOND})
    assert second.errors is None and second.data["updateProfile"]["kycRefMasked"] == "XXXX-XXXX-5678"
    assert counts(db) == (1, 1)
    replaced = db.query("SELECT kyc_aadhaar_record_id FROM users WHERE id=%s", (OWNER,))[0]
    assert replaced["kyc_aadhaar_record_id"] != user["kyc_aadhaar_record_id"]

    # No Aadhaar sent: everything stays.
    assert run("mutation { updateProfile(address: \"Ongole\") { kycRefMasked } }").errors is None
    assert db.query("SELECT kyc_aadhaar_record_id FROM users WHERE id=%s", (OWNER,))[0] == replaced
    assert counts(db) == (1, 1)


ADD = ('mutation($a:String!){ addMember(groupId:"g1", name:"Test Person", relation:"son", aadhaar:$a)'
       '{ id aadhaarMasked } }')
UPDATE = 'mutation($id:String!,$a:String){ updateMember(id:$id, aadhaar:$a, name:"Test Person"){ aadhaarMasked } }'


def test_typed_member_aadhaar_creates_replaces_and_releases_a_record(db):
    added = run(ADD, {"a": FIRST})
    assert added.errors is None and added.data["addMember"]["aadhaarMasked"] == "XXXX-XXXX-1234"
    no_digits(added)
    member_id = added.data["addMember"]["id"]
    member = db.query("SELECT aadhaar_record_id, aadhaar_enc FROM family_members WHERE id=%s", (member_id,))[0]
    assert member["aadhaar_enc"] == "" and member["aadhaar_record_id"]
    assert counts(db) == (1, 1)

    kept = run(UPDATE, {"id": member_id, "a": None})
    assert kept.errors is None and kept.data["updateMember"]["aadhaarMasked"] == "XXXX-XXXX-1234"
    assert db.query("SELECT aadhaar_record_id FROM family_members WHERE id=%s", (member_id,))[0][
        "aadhaar_record_id"] == member["aadhaar_record_id"]

    replaced = run(UPDATE, {"id": member_id, "a": SECOND})
    assert replaced.errors is None and replaced.data["updateMember"]["aadhaarMasked"] == "XXXX-XXXX-5678"
    assert counts(db) == (1, 1)
    assert not db.query("SELECT 1 FROM aadhaar_candidates WHERE id=%s", (member["aadhaar_record_id"],))

    removed = run('mutation($id:String!){ removeMember(id:$id) }', {"id": member_id})
    assert removed.errors is None and removed.data == {"removeMember": True}
    assert counts(db) == (0, 0)


def test_a_card_reading_is_applied_once_to_the_account_and_every_self_member(db):
    record = scan_record(db)
    apply = "mutation($c:String!){ applyMyKyc(aadhaarCandidateId:$c){ kycRefMasked } }"
    result = run(apply, {"c": record})
    assert result.errors is None and result.data["applyMyKyc"]["kycRefMasked"] == "XXXX-XXXX-1234"
    user = db.query("SELECT kyc_aadhaar_record_id, kyc_ref_enc FROM users WHERE id=%s", (OWNER,))[0]
    me = db.query("SELECT aadhaar_record_id, aadhaar_enc, aadhaar_masked FROM family_members WHERE id='self-1'")[0]
    assert user["kyc_aadhaar_record_id"] == me["aadhaar_record_id"] == record
    assert user["kyc_ref_enc"] == me["aadhaar_enc"] == ""
    assert me["aadhaar_masked"] == "XXXX-XXXX-1234"
    again = run(apply, {"c": record})
    assert [e.message for e in again.errors] == [
        "The Aadhaar reading expired or was already used; read the card again"]

    typed = run('mutation($a:String!){ applyMyKyc(aadhaar:$a){ kycRefMasked } }', {"a": SECOND})
    assert typed.errors is None
    assert counts(db) == (1, 1)
    assert not db.query("SELECT 1 FROM aadhaar_candidates WHERE id=%s", (record,))

    cleared = run("mutation { clearMyKyc { kycRefMasked } }")
    assert cleared.errors is None and cleared.data["clearMyKyc"]["kycRefMasked"] == ""
    assert counts(db) == (0, 0)
    assert db.query("SELECT kyc_aadhaar_record_id FROM users")[0]["kyc_aadhaar_record_id"] == ""


# ── protection failures reach the person, unmasked ────────────────────

def test_a_protection_failure_returns_its_own_message_and_saves_nothing(db, monkeypatch):
    monkeypatch.delenv("AADHAAR_ENC_KEY", raising=False)
    result = run(PROFILE, {"k": FIRST})
    assert [e.message for e in result.errors] == [aadhaar.PROTECTION_FAILED_MESSAGE]
    added = run(ADD, {"a": FIRST})
    assert [e.message for e in added.errors] == [aadhaar.PROTECTION_FAILED_MESSAGE]
    assert counts(db) == (0, 0)
    assert db.query("SELECT count(*) AS n FROM family_members")[0]["n"] == 1
    assert db.query("SELECT kyc_aadhaar_record_id, kyc_ref_masked FROM users")[0] == {
        "kyc_aadhaar_record_id": "", "kyc_ref_masked": ""}
