"""Owner isolation and credential lifecycle against an isolated temporary PostgreSQL.

No application database is contacted. The integration fixture starts its own
cluster under a temporary directory, and skips if postgres binaries are absent.
"""
import asyncio
from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import types

import psycopg
from psycopg.rows import dict_row
import pytest

from src import main


def info(owner=None):
    return types.SimpleNamespace(context={"request": types.SimpleNamespace(headers={"x-user-id": owner} if owner else {})})


def test_anonymous_root_queries_and_mutations_deny_without_database():
    async def run():
        for query in ["query verifyBeneficiary { pendingInvitations { token } }", "{ invitations { token } }", '{ users { id } }']:
            result = await main.schema.execute(query, context_value=info().context)
            assert result.errors
    asyncio.run(run())


def test_missing_context_does_not_become_system_owner():
    with pytest.raises(main.NotAuthorized, match="Authentication"):
        main._uid_from_info(info())


@pytest.mark.parametrize("expiry,created,status,expected", [
    ("2999-01-01", "", "pending", True),
    ("2001-01-01", "", "pending", False),
    ("not-a-date", "", "pending", False),
    ("", "", "pending", False),
    ("2999-01-01", "", "revoked", False),
    ("2999-01-01", "", "accepted", False),
])
def test_expiry_is_fail_closed(expiry, created, status, expected):
    assert main._invitation_is_current({"expiry": expiry, "created_at": created, "status": status}) is expected


@pytest.fixture(scope="module")
def isolated_postgres():
    initdb, pg_ctl = shutil.which("initdb"), shutil.which("pg_ctl")
    if not initdb or not pg_ctl or os.geteuid() == 0:
        pytest.skip("Temporary postgres requires initdb/pg_ctl and a non-root user")
    with tempfile.TemporaryDirectory(prefix="pattadar-security-") as directory:
        root = Path(directory)
        data = root / "data"
        subprocess.run([initdb, "-D", str(data), "-A", "trust", "--no-locale", "--encoding=UTF8"], check=True, capture_output=True)
        subprocess.run([pg_ctl, "-D", str(data), "-l", str(root / "postgres.log"), "-o",
                        f"-k {root} -h '' -p 55479", "-w", "start"], check=True, capture_output=True)
        try:
            yield f"host={root} port=55479 dbname=postgres"
        finally:
            subprocess.run([pg_ctl, "-D", str(data), "-m", "immediate", "-w", "stop"], check=True, capture_output=True)


SCHEMA = """
DROP SCHEMA public CASCADE; CREATE SCHEMA public;
CREATE TABLE invitations (id text primary key,scope_type text,scope_id text,role text default 'view',invitee_contact text default '',token text,expiry text,status text,created_at text default '');
CREATE TABLE family_members (id text primary key,owner_user_id text,legacy_beneficiary_id text default '',status text,invite_token text,invite_channel text default 'email',email_verified boolean default false,phone_verified boolean default false,inactivity_email_consent boolean default false,inactivity_email_consent_at text default '',name text default 'Person',phone text default '',email text default '',guardian_contact text default '',is_minor boolean default false,relation text default '',parcel_id text default '',share_pct float default 0,kind text default 'nominee');
CREATE TABLE beneficiaries (id text primary key,owner_user_id text,parcel_id text default '',status text,invite_token text,person_name text default 'Person',person_contact text default '',relationship text default '',share_pct float default 0,kind text default 'nominee');
CREATE TABLE passbooks (id text primary key,owner_user_id text);
CREATE TABLE parcels (id text primary key,passbook_id text);
CREATE TABLE documents (id text primary key,owner_user_id text);
CREATE TABLE audit_events (id text,actor text,action text,target text,details text,timestamp text);
"""


@pytest.fixture
def db(isolated_postgres, monkeypatch):
    with psycopg.connect(isolated_postgres, autocommit=True) as conn:
        conn.execute(SCHEMA)
    class Pool:
        @asynccontextmanager
        async def connection(self):
            async with await psycopg.AsyncConnection.connect(isolated_postgres, autocommit=True, row_factory=dict_row) as conn:
                yield conn
    monkeypatch.setattr(main, "pool", Pool())
    return isolated_postgres


# Every column holding a verification credential holds its hash; "secret" is
# what the invitee's link carries, and only that raw value is ever accepted.
SECRET_HASH = main._capability_hash("secret")


def seed(db, *, expiry="2999-01-01", member_status="pending", invitation_status="pending"):
    with psycopg.connect(db, autocommit=True) as conn:
        conn.execute("INSERT INTO family_members (id,owner_user_id,status,invite_token,email) VALUES ('member','owner',%s,%s,'member@example.com')", (member_status, SECRET_HASH))
        conn.execute("INSERT INTO invitations (id,scope_type,scope_id,invitee_contact,token,expiry,status) VALUES ('invite','family','member','member@example.com',%s,%s,%s)", (SECRET_HASH, expiry, invitation_status))


def state(db):
    with psycopg.connect(db, row_factory=dict_row) as conn:
        return conn.execute("SELECT status,invite_token FROM family_members WHERE id='member'").fetchone()


def test_pending_tokens_are_owner_scoped(db):
    seed(db)
    async def run():
        query = "{ pendingInvitations { id token } invitations { id token } }"
        own = await main.schema.execute(query, context_value=info("owner").context)
        stranger = await main.schema.execute(query, context_value=info("other").context)
        assert own.errors is None
        # The owner sees that an invitation is outstanding, never its token:
        # a readable token lets the owner accept on the member's behalf and
        # manufacture that member's consent record.
        assert own.data["pendingInvitations"] == [{"id": "invite", "token": ""}]
        assert stranger.data == {"pendingInvitations": [], "invitations": []}
    asyncio.run(run())


def test_valid_public_acceptance_consumes_credential_and_replay_fails(db):
    seed(db)
    async def run():
        query = 'mutation { verifyBeneficiary(token:"secret", inactivityEmailConsent:true) { id status inviteToken } }'
        result = await main.schema.execute(query, context_value=info().context)
        assert result.errors is None
        assert result.data["verifyBeneficiary"] == {"id": "member", "status": "verified", "inviteToken": ""}
        replay = await main.schema.execute(query, context_value=info().context)
        assert replay.errors
    asyncio.run(run())
    assert state(db) == {"status": "verified", "invite_token": ""}
    with psycopg.connect(db) as conn:
        assert conn.execute(
            "SELECT email_verified,inactivity_email_consent FROM family_members WHERE id='member'"
        ).fetchone() == (True, True)


@pytest.mark.parametrize("expiry,member_status,invitation_status", [
    ("2001-01-01", "pending", "pending"), ("2999-01-01", "revoked", "pending"),
    ("2999-01-01", "pending", "revoked"), ("2999-01-01", "pending", "accepted"),
])
def test_expired_or_revoked_links_cannot_verify(db, expiry, member_status, invitation_status):
    seed(db, expiry=expiry, member_status=member_status, invitation_status=invitation_status)
    with pytest.raises(ValueError):
        asyncio.run(main._verify_by_token(None, "secret"))
    assert state(db)["status"] == member_status


def test_deleting_invitation_invalidates_link(db):
    seed(db)
    assert asyncio.run(main.Mutation().delete_invitation(info("owner"), "invite"))
    with pytest.raises(ValueError):
        asyncio.run(main._verify_by_token(None, "secret"))
    assert state(db)["invite_token"] == ""


def test_revoking_member_and_resetting_pending_never_restores_old_link(db):
    seed(db)
    asyncio.run(main._do_update_member_status(info("owner"), "member", "revoked"))
    asyncio.run(main._do_update_member_status(info("owner"), "member", "pending"))
    with pytest.raises(ValueError):
        asyncio.run(main._verify_by_token(None, "secret"))


def test_fault_during_audit_rolls_back_acceptance_and_token_consumption(db, monkeypatch):
    seed(db)
    async def fail(*args, **kwargs):
        raise RuntimeError("injected audit failure")
    monkeypatch.setattr(main, "log_audit", fail)
    with pytest.raises(RuntimeError, match="injected"):
        asyncio.run(main._verify_by_token(None, "secret"))
    assert state(db) == {"status": "pending", "invite_token": SECRET_HASH}
    with psycopg.connect(db) as conn:
        assert conn.execute("SELECT status,token FROM invitations").fetchone() == ("pending", SECRET_HASH)


def test_concurrent_acceptance_succeeds_once(db):
    seed(db)
    async def run():
        results = await asyncio.gather(main._verify_by_token(None, "secret"), main._verify_by_token(None, "secret"), return_exceptions=True)
        assert sum(not isinstance(r, Exception) for r in results) == 1
    asyncio.run(run())
