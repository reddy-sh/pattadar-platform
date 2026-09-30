"""updateProfile writes what it is sent and leaves what it is not.

Against an isolated temporary PostgreSQL; no application database is
contacted, and the test skips when postgres binaries are absent.
"""
import asyncio
from contextlib import asynccontextmanager
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

OWNER = "owner"

SCHEMA = """
DROP SCHEMA public CASCADE; CREATE SCHEMA public;
CREATE TABLE users (
  id TEXT PRIMARY KEY, mobile TEXT NOT NULL DEFAULT '', email TEXT NOT NULL DEFAULT '',
  name TEXT NOT NULL DEFAULT '', language TEXT NOT NULL DEFAULT 'en',
  kyc_ref_masked TEXT NOT NULL DEFAULT '', kyc_ref_enc TEXT NOT NULL DEFAULT '',
  roles TEXT NOT NULL DEFAULT 'owner', notification_prefs TEXT NOT NULL DEFAULT 'email,sms',
  districts_of_interest TEXT NOT NULL DEFAULT '', mfa_enabled BOOLEAN NOT NULL DEFAULT false,
  address TEXT NOT NULL DEFAULT '', last_active_at TEXT NOT NULL DEFAULT '',
  inactivity_email_enabled BOOLEAN NOT NULL DEFAULT true
);
"""


def ctx(owner=OWNER):
    return {"request": types.SimpleNamespace(headers={"x-user-id": owner})}


@pytest.fixture(scope="module")
def isolated_postgres():
    initdb, pg_ctl = shutil.which("initdb"), shutil.which("pg_ctl")
    if not initdb or not pg_ctl or os.geteuid() == 0:
        pytest.skip("Temporary postgres requires initdb/pg_ctl and a non-root user")
    with tempfile.TemporaryDirectory(prefix="pattadar-profile-") as directory:
        root = Path(directory)
        data = root / "data"
        subprocess.run([initdb, "-D", str(data), "-A", "trust", "--no-locale", "--encoding=UTF8"],
                       check=True, capture_output=True)
        subprocess.run([pg_ctl, "-D", str(data), "-l", str(root / "postgres.log"), "-o",
                        f"-k {root} -h '' -p 55481", "-w", "start"], check=True, capture_output=True)
        try:
            yield f"host={root} port=55481 dbname=postgres"
        finally:
            subprocess.run([pg_ctl, "-D", str(data), "-m", "immediate", "-w", "stop"],
                           check=True, capture_output=True)


@pytest.fixture
def db(isolated_postgres, monkeypatch):
    with psycopg.connect(isolated_postgres, autocommit=True) as conn:
        conn.execute(SCHEMA)
        conn.execute(
            "INSERT INTO users (id, name, language, districts_of_interest, notification_prefs, "
            "mfa_enabled, address, kyc_ref_masked, kyc_ref_enc) "
            "VALUES (%s, 'Shankar Reddy', 'te', 'd1,d2', 'email', true, 'Tarlupadu', "
            "'XXXX XXXX 9012', 'ciphertext')", (OWNER,))

    class Pool:
        @asynccontextmanager
        async def connection(self):
            async with await psycopg.AsyncConnection.connect(
                    isolated_postgres, autocommit=True, row_factory=dict_row) as conn:
                yield conn

    async def no_audit(*_a, **_k):
        return None

    monkeypatch.setattr(main, "pool", Pool())
    monkeypatch.setattr(main, "log_audit", no_audit)
    return isolated_postgres


def stored(db):
    with psycopg.connect(db, row_factory=dict_row) as conn:
        return conn.execute(
            "SELECT language, districts_of_interest, notification_prefs, mfa_enabled, address, "
            "kyc_ref_masked, kyc_ref_enc FROM users WHERE id=%s", (OWNER,)).fetchone()


def run(query, variables=None):
    return asyncio.run(main.schema.execute(query, variable_values=variables, context_value=ctx()))


def test_an_argument_not_sent_leaves_its_column_alone(db):
    before = stored(db)
    result = run('mutation { updateProfile(address: "Ongole") { address } }')
    assert result.errors is None
    after = stored(db)
    assert after["address"] == "Ongole"
    assert {k: v for k, v in after.items() if k != "address"} == \
        {k: v for k, v in before.items() if k != "address"}


def test_the_full_web_save_writes_every_field_and_can_clear_them(db):
    result = run(
        "mutation($l:String!,$d:String!,$n:String!,$k:String!,$m:Boolean!,$a:String){ "
        "updateProfile(language:$l, districtsOfInterest:$d, notificationPrefs:$n, kycRef:$k, "
        "mfaEnabled:$m, address:$a){ kycRefMasked } }",
        {"l": "en", "d": "", "n": "", "k": "", "m": False, "a": ""},
    )
    assert result.errors is None
    after = stored(db)
    assert after["language"] == "en"
    assert after["districts_of_interest"] == ""
    assert after["notification_prefs"] == ""
    assert after["mfa_enabled"] is False
    assert after["address"] == ""
    # No Aadhaar sent: the stored one stays, mask and ciphertext together.
    assert after["kyc_ref_masked"] == "XXXX XXXX 9012"
    assert after["kyc_ref_enc"] == "ciphertext"
    assert result.data["updateProfile"]["kycRefMasked"] == "XXXX XXXX 9012"


def test_a_malformed_aadhaar_is_refused_and_writes_nothing(db):
    before = stored(db)
    result = run('mutation { updateProfile(kycRef: "12345", address: "Elsewhere") { id } }')
    assert result.errors
    assert stored(db) == before


def test_another_account_cannot_reach_this_row(db):
    before = stored(db)
    result = asyncio.run(main.schema.execute(
        'mutation { updateProfile(address: "Stranger") { address } }', context_value=ctx("other")))
    assert result.errors is None
    assert result.data["updateProfile"]["address"] == "Stranger"
    assert stored(db) == before
