import asyncio
from contextlib import asynccontextmanager
import importlib.util
from pathlib import Path
import types

from fastapi import HTTPException
import psycopg
from psycopg.rows import dict_row
import pytest

from src import account
from test_invitation_security import isolated_postgres

spec = importlib.util.spec_from_file_location("erase_account", Path(__file__).parents[1] / "scripts/erase_account.py")
erase = importlib.util.module_from_spec(spec)
spec.loader.exec_module(erase)


@pytest.fixture
def account_db(isolated_postgres, monkeypatch):
    with psycopg.connect(isolated_postgres,autocommit=True) as conn:
        conn.execute("DROP SCHEMA public CASCADE; CREATE SCHEMA public")
        conn.execute(account.DDL)
        conn.execute("""
            CREATE TABLE users(id text primary key,name text,email text);
            CREATE TABLE passbooks(id text primary key,owner_user_id text);
            CREATE TABLE parcels(id text primary key,passbook_id text);
            CREATE TABLE documents(id text primary key,owner_user_id text,parcel_id text,token text,kyc_enc text);
            CREATE TABLE audit_events(id text primary key,actor text,action text,target text,details text,timestamp text);
            INSERT INTO users VALUES ('a','Alice','alice@example.com'),('b','Bob','bob@example.com');
            INSERT INTO passbooks VALUES ('pa','a'),('pb','b');
            INSERT INTO parcels VALUES ('ra','pa'),('rb','pb');
            INSERT INTO documents VALUES ('da','a','ra','secret','ciphertext'),('db','b','rb','',''),('foreign','b','ra','',''),('legacy','','ra','','');
            INSERT INTO audit_events VALUES ('aa','a','upload','da','Personal data','2026-09-12'),('ab','b','upload','db','Private Bob','2026-09-12');
        """)
    class Pool:
        @asynccontextmanager
        async def connection(self):
            async with await psycopg.AsyncConnection.connect(isolated_postgres,autocommit=True,row_factory=dict_row) as conn:
                yield conn
    monkeypatch.setattr(account, "_pool", Pool())
    return isolated_postgres


def request(uid="a"):
    return types.SimpleNamespace(headers={"x-user-id":uid})


def test_export_scopes_every_owner_and_child_without_foreign_rows(account_db):
    exported = asyncio.run(account.export(request()))["data"]
    assert [r["id"] for r in exported["users"]] == ["a"]
    assert {r["id"] for r in exported["parcels"]} == {"ra"}
    assert {r["id"] for r in exported["documents"]} == {"da","legacy"}
    assert all("token" not in r and "kyc_enc" not in r for r in exported["documents"])
    assert [r["id"] for r in exported["audit_events"]] == ["aa"]


def test_consent_withdrawal_is_honored_without_breaking_old_clients(account_db):
    async def run():
        await account.require_purpose("a","ai_extraction")
        await account.set_consent(request(), account.ConsentInput(version=account.VERSION,purposes=["document_processing"]))
        assert (await account.get_consent(request()))["purposes"] == ["document_processing"]
        with pytest.raises(HTTPException) as error:
            await account.require_purpose("a","ai_extraction")
        assert error.value.status_code == 403
        await account.require_purpose("b","ai_extraction")
        await account.set_consent(request(), account.ConsentInput(version=account.VERSION,purposes=["ai_extraction"]))
        await account.require_purpose("a","ai_extraction")
    asyncio.run(run())
    with psycopg.connect(account_db) as conn:
        assert conn.execute("SELECT count(*) FROM account_consents").fetchone()[0] == 2


def test_consent_grace_for_old_accounts_can_be_closed(account_db, monkeypatch):
    """The pre-consent grace is deliberate, but CONSENT_STRICT must end it."""
    async def run():
        # Default: an account that never saved choices is still served.
        await account.require_purpose("a", "ai_extraction")

        monkeypatch.setenv("CONSENT_STRICT", "1")
        with pytest.raises(HTTPException) as error:
            await account.require_purpose("a", "ai_extraction")
        assert error.value.status_code == 403
        assert error.value.detail["error"] == "CONSENT_REQUIRED"

        # Strict mode refuses only the unasked. A saved choice still governs.
        await account.set_consent(request(), account.ConsentInput(
            version=account.VERSION, purposes=["ai_extraction"]))
        await account.require_purpose("a", "ai_extraction")
        with pytest.raises(HTTPException):
            await account.require_purpose("a", "document_processing")
    asyncio.run(run())


def test_erasure_request_is_idempotent_and_owner_scoped(account_db):
    body = account.ErasureInput(confirmation="DELETE MY ACCOUNT",principal_id="subject_x",issuer="pool",subject="a")
    async def run():
        first = await account.request_erasure(request(),body)
        retry = await account.request_erasure(request(),body)
        assert retry["id"] == first["id"]
        assert first["status"] == "requested" and first["needsOperator"]
        assert (await account.get_erasure(request("b")))["request"] is None
        body.confirmation = "wrong"
        with pytest.raises(HTTPException):
            await account.request_erasure(request(),body)
    asyncio.run(run())


def test_purge_api_removes_owned_children_retains_other_accounts_and_anonymized_audit(account_db):
    with psycopg.connect(account_db,autocommit=True,row_factory=dict_row) as conn:
        erase.purge_api(conn,"a","request-a",365)
        assert [r["id"] for r in conn.execute("SELECT id FROM users")] == ["b"]
        assert {r["id"] for r in conn.execute("SELECT id FROM documents")} == {"db","foreign"}
        assert {r["id"] for r in conn.execute("SELECT id FROM parcels")} == {"rb"}
        audit = conn.execute("SELECT * FROM account_retained_audits").fetchone()
        assert audit["id"] == "aa" and audit["request_id"] == "request-a"
        assert "details" not in audit and "actor" not in audit
        assert all(v == 0 for v in erase.snapshot(conn,"a")[2].values())


def test_foreign_fk_dependents_fail_before_purge(account_db):
    with psycopg.connect(account_db,autocommit=True,row_factory=dict_row) as conn:
        conn.execute("CREATE TABLE linked_private(id text,owner_user_id text,parent text REFERENCES passbooks(id) ON DELETE CASCADE)")
        conn.execute("INSERT INTO linked_private VALUES ('cross','b','pa')")
        with pytest.raises(RuntimeError,match="Foreign-owned"):
            erase.purge_api(conn,"a","request-a",365)
        assert conn.execute("SELECT 1 FROM users WHERE id='a'").fetchone()


def test_payment_children_are_exported_and_erased_only_after_settlement(account_db):
    from src import payments
    with psycopg.connect(account_db, autocommit=True, row_factory=dict_row) as conn:
        for ddl in payments.DDL:
            conn.execute(ddl)
        conn.execute("INSERT INTO payment_intents(id,owner_user_id,ticket_id,mode,amount,status) VALUES ('ia','a','ta','test',100,'captured'),('ib','b','tb','test',100,'captured')")
        conn.execute("INSERT INTO payment_operations(id,intent_id,kind) VALUES ('oa','ia','capture'),('ob','ib','capture')")
        conn.execute("INSERT INTO payment_webhook_events(id,digest,intent_id,event) VALUES ('ea','hash-a','ia','payment.captured'),('eb','hash-b','ib','payment.captured')")
        with pytest.raises(RuntimeError, match="reconciliation"):
            erase.purge_api(conn, "a", "request-a", 365)
        assert conn.execute("SELECT 1 FROM users WHERE id='a'").fetchone()
    exported = asyncio.run(account.export(request()))["data"]
    assert {r['id'] for r in exported['payment_operations']} == {'oa'}
    assert {r['id'] for r in exported['payment_webhook_events']} == {'ea'}
    with psycopg.connect(account_db, autocommit=True, row_factory=dict_row) as conn:
        conn.execute("UPDATE payment_intents SET status='settled' WHERE id='ia'")
        erase.purge_api(conn, "a", "request-a", 365)
        assert {r['id'] for r in conn.execute('SELECT id FROM payment_intents')} == {'ib'}
        assert {r['id'] for r in conn.execute('SELECT id FROM payment_operations')} == {'ob'}
        assert {r['id'] for r in conn.execute('SELECT id FROM payment_webhook_events')} == {'eb'}


def test_all_s3_versions_and_delete_markers_are_removed():
    class S3:
        calls = []
        first = True
        def get_paginator(self,name):
            parent = self
            class Pager:
                def paginate(self,**kwargs):
                    assert kwargs["Prefix"] == "owner/"
                    if name == "list_object_versions" and parent.first:
                        parent.first = False
                        return [{"Versions":[{"Key":"owner/file","VersionId":"v1"},{"Key":"owner/file","VersionId":"v2"}], "DeleteMarkers":[{"Key":"owner/file","VersionId":"d1"}]}]
                    return [{}]
            return Pager()
        def delete_objects(self,**kwargs):
            self.calls.append(kwargs["Delete"]["Objects"])
            return {}
    s3 = S3()
    erase.delete_prefix(s3,"bucket","owner/")
    assert {item["VersionId"] for item in s3.calls[0]} == {"v1","v2","d1"}


def test_s3_partial_failure_cannot_be_reported_complete():
    class S3:
        def get_paginator(self,name):
            return self
        def paginate(self,**kwargs):
            return [{"Versions":[{"Key":"owner/file","VersionId":"v1"}]}]
        def delete_objects(self,**kwargs):
            return {"Errors":[{"Code":"AccessDenied"}]}
    with pytest.raises(RuntimeError,match="incomplete"):
        erase.delete_prefix(S3(),"bucket","owner/")
