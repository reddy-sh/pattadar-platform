"""The Aadhaar record/vault schema, release rule and sweep on real PostgreSQL.

Each test gets a throwaway schema on TEST_PG_DSN (the test_import_jobs.py
pattern): skipped locally when PostgreSQL is absent, failing in CI when
TEST_PG_DSN is set. Synthetic Aadhaar only.
"""
from __future__ import annotations

import asyncio
import logging
import os
import secrets
from contextlib import asynccontextmanager
from datetime import datetime, timezone

import psycopg
import pytest
from cryptography.fernet import Fernet
from psycopg import sql
from psycopg.rows import dict_row
from psycopg_pool import AsyncConnectionPool

from src import aadhaar, account

OWNER, OTHER = "owner-a", "owner-b"
FIRST, SECOND, THIRD = "123412341234", "567856785678", "432143214321"
# The previous release's sweep, verbatim. During a deploy overlap or after a
# rollback it runs against records this release made durable.
OLD_CLEANUP = "DELETE FROM aadhaar_candidates WHERE expires_at<now() OR consumed_at<now()-interval '1 day'"
LEGACY_DDL = """
CREATE TABLE aadhaar_candidates (
 id TEXT PRIMARY KEY, owner_user_id TEXT NOT NULL, ciphertext TEXT NOT NULL, masked TEXT NOT NULL,
 expires_at TIMESTAMPTZ NOT NULL, consumed_at TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
"""
SUBJECTS = """
CREATE TABLE users (id TEXT PRIMARY KEY, name TEXT NOT NULL DEFAULT '');
CREATE TABLE family_members (id TEXT PRIMARY KEY, owner_user_id TEXT NOT NULL, is_self BOOLEAN NOT NULL DEFAULT false);
"""


@pytest.fixture(autouse=True)
def fernet(monkeypatch):
    monkeypatch.setenv("APP_ENV", "local")
    monkeypatch.setenv("ALLOW_INSECURE_LOCAL", "1")
    monkeypatch.delenv("AADHAAR_KMS_KEY_ARN", raising=False)
    monkeypatch.delenv("AADHAAR_LEGACY_WRITE_BRIDGE", raising=False)
    monkeypatch.setenv("AADHAAR_ENC_KEY", Fernet.generate_key().decode())


@asynccontextmanager
async def database(legacy=False):
    dsn = os.getenv("TEST_PG_DSN", "host=localhost port=5432 dbname=postgres user=rhub password=rhub-dev-pwd")
    schema = "test_aadhaar_vault_" + secrets.token_hex(8)
    try:
        admin = await psycopg.AsyncConnection.connect(dsn, autocommit=True)
    except psycopg.OperationalError:
        if os.getenv("TEST_PG_DSN"):
            raise
        pytest.skip("Set TEST_PG_DSN to run PostgreSQL integration tests")
    await admin.execute(sql.SQL("CREATE SCHEMA {}").format(sql.Identifier(schema)))

    async def configure(conn):
        await conn.execute(sql.SQL("SET search_path TO {}").format(sql.Identifier(schema)))
    pool = AsyncConnectionPool(dsn, min_size=1, max_size=2, open=False, configure=configure,
                               kwargs={"autocommit": True, "row_factory": dict_row})
    try:
        await pool.open()
        await pool.wait()
        async with pool.connection() as conn:
            await conn.execute(SUBJECTS)
            if legacy:
                await conn.execute(LEGACY_DDL)
            await boot(conn)
            await conn.execute("INSERT INTO users (id) VALUES (%s), (%s)", (OWNER, OTHER))
            await conn.execute("INSERT INTO family_members (id, owner_user_id, is_self) VALUES "
                               "('self-a', %s, true), ('kid-a', %s, false), ('self-b', %s, true)",
                               (OWNER, OWNER, OTHER))
        yield pool
    finally:
        await pool.close()
        await admin.execute(sql.SQL("DROP SCHEMA {} CASCADE").format(sql.Identifier(schema)))
        await admin.close()


async def boot(conn):
    """What init_db runs for Aadhaar: ensure_schema first, then the subject DDL."""
    await aadhaar.ensure_schema(conn)
    for statement in aadhaar.SUBJECT_DDL:
        await conn.execute(statement)


async def one(conn, statement, params=()):
    return await (await conn.execute(statement, params)).fetchone()


async def count(conn, table):
    return (await one(conn, sql.SQL("SELECT count(*) AS n FROM {}").format(sql.Identifier(table))))["n"]


async def typed(conn, owner=OWNER, number=FIRST):
    return (await aadhaar.create_record(conn, owner, digits12=number, origin="typed"))["id"]


async def scanned(conn, owner=OWNER, number=FIRST):
    return (await aadhaar.create_record(conn, owner, digits12=number, origin="scan"))["id"]


async def vault_token(conn, record_id):
    return (await one(conn, "SELECT vault_token FROM aadhaar_candidates WHERE id=%s", (record_id,)))["vault_token"]


async def exists(conn, table, column, value):
    return bool(await one(conn, sql.SQL("SELECT 1 AS x FROM {} WHERE {}=%s").format(
        sql.Identifier(table), sql.Identifier(column)), (value,)))


def test_boot_ddl_twice_upgrades_the_legacy_table_with_exactly_one_vault_fk():
    async def run():
        async with database(legacy=True) as pool:
            async with pool.connection() as conn:
                await boot(conn)
                fks = await one(conn, "SELECT count(*) AS n FROM pg_constraint "
                                      "WHERE conrelid='aadhaar_candidates'::regclass AND contype='f'")
                assert fks["n"] == 1
                nullable = await one(conn, "SELECT is_nullable FROM information_schema.columns "
                                           "WHERE table_schema=current_schema() AND table_name='aadhaar_candidates' "
                                           "AND column_name='ciphertext'")
                assert nullable["is_nullable"] == "YES"
                for column in ("aadhaar_record_id",):
                    assert await one(conn, "SELECT 1 AS x FROM information_schema.columns WHERE "
                                           "table_schema=current_schema() AND table_name='family_members' "
                                           "AND column_name=%s", (column,))
    asyncio.run(run())


def test_a_shared_record_lives_while_either_subject_points_at_it():
    async def run():
        async with database() as pool:
            async with pool.connection() as conn:
                record = await typed(conn)
                token = await vault_token(conn, record)
                await conn.execute("UPDATE users SET kyc_aadhaar_record_id=%s WHERE id=%s", (record, OWNER))
                await conn.execute("UPDATE family_members SET aadhaar_record_id=%s WHERE id='self-a'", (record,))
                assert await aadhaar.release_if_unreferenced(conn, OWNER, record) == 0
                await conn.execute("UPDATE users SET kyc_aadhaar_record_id='' WHERE id=%s", (OWNER,))
                assert await aadhaar.release_if_unreferenced(conn, OWNER, record) == 0
                assert await exists(conn, "aadhaar_vault", "token", token)
                await conn.execute("UPDATE family_members SET aadhaar_record_id='' WHERE id='self-a'")
                # Another owner cannot release it.
                assert await aadhaar.release_if_unreferenced(conn, OTHER, record) == 0
                assert await aadhaar.release_if_unreferenced(conn, OWNER, record) == 1
                assert await aadhaar.release_if_unreferenced(conn, OWNER, record) == 0
                assert not await exists(conn, "aadhaar_candidates", "id", record)
                assert not await exists(conn, "aadhaar_vault", "token", token)
    asyncio.run(run())


def test_release_unreferenced_is_owner_scoped_and_spares_live_readings():
    async def run():
        async with database() as pool:
            async with pool.connection() as conn:
                mine = await typed(conn)
                kept = await typed(conn, number=SECOND)
                await conn.execute("UPDATE family_members SET aadhaar_record_id=%s WHERE id='kid-a'", (kept,))
                pending = await scanned(conn, number=THIRD)
                theirs = await typed(conn, owner=OTHER)
                assert await aadhaar.release_unreferenced(conn, OWNER) == 1
                assert not await exists(conn, "aadhaar_candidates", "id", mine)
                for record in (kept, pending, theirs):
                    assert await exists(conn, "aadhaar_candidates", "id", record)
                assert await count(conn, "aadhaar_vault") == 3
    asyncio.run(run())


def test_the_sweep_clocks_and_what_it_keeps(caplog):
    async def run():
        async with database() as pool:
            async with pool.connection() as conn:
                young, old = await typed(conn), await typed(conn, number=SECOND)
                await conn.execute("UPDATE aadhaar_candidates SET updated_at=now()-interval '4 minutes' WHERE id=%s", (young,))
                await conn.execute("UPDATE aadhaar_candidates SET updated_at=now()-interval '6 minutes' WHERE id=%s", (old,))
                referenced = await typed(conn, number=THIRD)
                await conn.execute("UPDATE aadhaar_candidates SET updated_at=now()-interval '1 hour' WHERE id=%s", (referenced,))
                await conn.execute("UPDATE family_members SET aadhaar_record_id=%s WHERE id='kid-a'", (referenced,))
                expired, live = await scanned(conn), await scanned(conn, number=SECOND)
                await conn.execute("UPDATE aadhaar_candidates SET expires_at=now()-interval '1 second' WHERE id=%s", (expired,))
                expired_token = await vault_token(conn, expired)
                old_token = await vault_token(conn, old)
                for token, age in (("orphan-young", "4 minutes"), ("orphan-old", "6 minutes")):
                    await conn.execute(
                        "INSERT INTO aadhaar_vault (token, owner_user_id, ciphertext, created_at) "
                        f"VALUES (%s, %s, 'fernet:v0:x', now()-interval '{age}')", (token, OWNER))
                with caplog.at_level(logging.INFO, logger="pattadar.aadhaar"):
                    await aadhaar.cleanup_expired(conn)
                for record in (young, referenced, live):
                    assert await exists(conn, "aadhaar_candidates", "id", record)
                for record in (old, expired):
                    assert not await exists(conn, "aadhaar_candidates", "id", record)
                for token in (expired_token, old_token, "orphan-old"):
                    assert not await exists(conn, "aadhaar_vault", "token", token)
                assert await exists(conn, "aadhaar_vault", "token", "orphan-young")
                assert "aadhaar.sweep expired=1 orphaned=2" in caplog.text
                # A second pass finds nothing.
                caplog.clear()
                await aadhaar.cleanup_expired(conn)
                assert "aadhaar.sweep" not in caplog.text
    asyncio.run(run())


def test_the_previous_releases_sweep_spares_durable_records():
    async def run():
        async with database() as pool:
            async with pool.connection() as conn:
                kept_typed = await typed(conn)
                kept_scan = await scanned(conn, number=SECOND)
                async with conn.transaction():
                    assert (await aadhaar.resolve_record(conn, OWNER, "", kept_scan))[0] == kept_scan
                control = await scanned(conn, number=THIRD)
                await conn.execute("UPDATE aadhaar_candidates SET expires_at=now()-interval '1 second' WHERE id=%s", (control,))
                tokens = [await vault_token(conn, r) for r in (kept_typed, kept_scan)]
                await conn.execute(OLD_CLEANUP)
                for record in (kept_typed, kept_scan):
                    assert await exists(conn, "aadhaar_candidates", "id", record)
                for token in tokens:
                    assert await exists(conn, "aadhaar_vault", "token", token)
                assert not await exists(conn, "aadhaar_candidates", "id", control)
    asyncio.run(run())


def test_the_owner_export_loads_the_durable_sentinel(monkeypatch):
    async def catalog_here(conn):
        rows = await (await conn.execute(
            "SELECT table_name,column_name FROM information_schema.columns WHERE table_schema=current_schema()")).fetchall()
        catalog = {}
        for row in rows:
            catalog.setdefault(row["table_name"], set()).add(row["column_name"])
        return catalog
    monkeypatch.setattr(account, "catalog_for", catalog_here)

    async def run():
        async with database() as pool:
            async with pool.connection() as conn:
                await typed(conn)
                data = await account.export_data(conn, OWNER)
                [record] = data["aadhaar_candidates"]
                # Loads in any session time zone (this one may not be UTC).
                assert record["expires_at"].astimezone(timezone.utc) == datetime(9999, 1, 1, tzinfo=timezone.utc)
                assert record["origin"] == "typed" and record["last4"] == "1234"
                assert "vault_token" not in record and "ciphertext" not in record
                [vault] = data["aadhaar_vault"]
                assert set(vault) == {"created_at", "owner_user_id"}
    asyncio.run(run())


def test_boot_reconcile_blanks_dangling_and_foreign_pointers_only():
    async def run():
        async with database() as pool:
            async with pool.connection() as conn:
                mine, theirs = await typed(conn), await typed(conn, owner=OTHER)
                await conn.execute("UPDATE family_members SET aadhaar_record_id=%s WHERE id='self-a'", (mine,))
                await conn.execute("UPDATE family_members SET aadhaar_record_id=%s WHERE id='kid-a'", (theirs,))
                await conn.execute("UPDATE family_members SET aadhaar_record_id='gone' WHERE id='self-b'")
                await conn.execute("UPDATE users SET kyc_aadhaar_record_id=%s WHERE id=%s", (mine, OWNER))
                await conn.execute("UPDATE users SET kyc_aadhaar_record_id=%s WHERE id=%s", (mine, OTHER))
                await boot(conn)
                members = {r["id"]: r["aadhaar_record_id"] for r in await (await conn.execute(
                    "SELECT id, aadhaar_record_id FROM family_members")).fetchall()}
                assert members == {"self-a": mine, "kid-a": "", "self-b": ""}
                users = {r["id"]: r["kyc_aadhaar_record_id"] for r in await (await conn.execute(
                    "SELECT id, kyc_aadhaar_record_id FROM users")).fetchall()}
                assert users == {OWNER: mine, OTHER: ""}
    asyncio.run(run())


def test_deleting_a_vault_row_first_nulls_the_record_pointer():
    async def run():
        async with database() as pool:
            async with pool.connection() as conn:
                record = await typed(conn)
                await conn.execute("DELETE FROM aadhaar_vault WHERE owner_user_id=%s", (OWNER,))
                assert await vault_token(conn, record) is None
    asyncio.run(run())
