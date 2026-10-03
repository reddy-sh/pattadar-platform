"""Pattadar Network register-interest on real PostgreSQL: insert-once,
cool-down, no revival, the ceiling before the lookup, parameterization and
masked database errors (design AC 10, 11a/b/c, 14, 15, 15b, 18, 18b).

Each test gets a throwaway schema on TEST_PG_DSN (the test_aadhaar_vault_db.py
pattern): skipped locally when PostgreSQL is absent, failing in CI when
TEST_PG_DSN is set. Synthetic contacts only.
"""
from __future__ import annotations

import asyncio
import logging
import os
import secrets
import types
from contextlib import asynccontextmanager

import psycopg
import pytest
from psycopg import sql
from psycopg.rows import dict_row
from psycopg_pool import AsyncConnectionPool, PoolTimeout

from src import main, network

NAME, PHONE, EMAIL = "Ravi Kumar", "+91 98480 12345", "ravi@example.com"
COLUMNS = ("id", "interest", "name", "phone", "email", "contact_key", "district", "mandal", "note",
           "source", "consent_purpose", "consent_version", "consented_at", "withdrawn_at",
           "created_at", "updated_at")


@asynccontextmanager
async def database(monkeypatch):
    dsn = os.getenv("TEST_PG_DSN", "host=localhost port=5432 dbname=postgres user=rhub password=rhub-dev-pwd")
    schema = "test_network_interest_" + secrets.token_hex(8)
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
            await network.ensure_schema(conn)
            await network.ensure_schema(conn)  # idempotent boot DDL
        monkeypatch.setattr(network, "_pool", lambda: pool)
        monkeypatch.setattr(network, "HOURLY_CAP", 200)
        yield pool
    finally:
        await pool.close()
        await admin.execute(sql.SQL("DROP SCHEMA {} CASCADE").format(sql.Identifier(schema)))
        await admin.close()


def submission(**overrides):
    base = dict(interest="sell", name=NAME, phone=PHONE, email="", district="", mandal="", note="",
                consent=True, consent_version=network.CONSENT_VERSION, website="")
    base.update(overrides)
    return types.SimpleNamespace(**base)


async def submit(**overrides):
    result = await network.register(None, submission(**overrides))
    return result.status


async def rows(pool):
    async with pool.connection() as conn:
        return await (await conn.execute(
            "SELECT * FROM network_interest ORDER BY created_at, id")).fetchall()


async def execute(pool, query, params=()):
    async with pool.connection() as conn:
        await conn.execute(query, params)


def run(monkeypatch, body):
    async def go():
        async with database(monkeypatch) as pool:
            await body(pool)
    asyncio.run(go())


def test_a_valid_submission_is_stored_once_with_its_consent(monkeypatch, caplog):
    """AC 10, AC 18: one row with the consent version; logs carry the
    interest key and outcome only."""
    caplog.set_level(logging.DEBUG)

    async def body(pool):
        assert await submit(email="Ravi@Example.com", district="Prakasam", mandal="Ongole",
                            note="Two acres") == "received"
        [row] = await rows(pool)
        assert set(row) == set(COLUMNS)
        assert row["phone"] == "+919848012345" and row["contact_key"] == "9848012345"
        assert row["email"] == EMAIL
        assert row["consent_version"] == network.CONSENT_VERSION
        assert row["consented_at"] is not None and row["withdrawn_at"] is None
        assert row["source"] == "landing" and row["consent_purpose"] == "network_contact"
        assert await submit() == "received"
        assert len(await rows(pool)) == 1
    run(monkeypatch, body)
    messages = [r.getMessage() for r in caplog.records if r.name == "pattadar.network"]
    assert messages == ["network.interest_received interest=sell"] * 2
    for value in (NAME, "98480", "9848012345", EMAIL, "Ravi@Example.com", "Prakasam", "Ongole", "Two acres"):
        assert value not in caplog.text


def test_resubmitting_within_the_cool_down_changes_nothing(monkeypatch):
    """AC 11a."""
    async def body(pool):
        await submit()
        [before] = await rows(pool)
        assert await submit(name="Someone Else") == "received"
        assert await rows(pool) == [before]
    run(monkeypatch, body)


def test_after_the_cool_down_only_updated_at_moves(monkeypatch):
    """AC 11b: no anonymous overwrite, even with different values."""
    async def body(pool):
        await submit(email=EMAIL, district="Prakasam", note="First")
        await execute(pool, "UPDATE network_interest SET updated_at = updated_at - interval '61 seconds'")
        [before] = await rows(pool)
        assert await submit(name="Stranger Name", email="other@example.com", district="Guntur",
                            mandal="Tenali", note="Overwrite attempt") == "received"
        [after] = await rows(pool)
        assert after["updated_at"] > before["updated_at"]
        for column in COLUMNS:
            if column != "updated_at":
                assert after[column] == before[column], column
    run(monkeypatch, body)


def test_a_withdrawn_row_is_never_revived(monkeypatch):
    """AC 11c: byte-for-byte unchanged, including withdrawn_at and updated_at."""
    async def body(pool):
        await submit()
        await execute(pool, "UPDATE network_interest SET withdrawn_at = now() - interval '2 minutes', "
                            "updated_at = updated_at - interval '2 minutes'")
        [before] = await rows(pool)
        assert await submit(name="Revival Attempt") == "received"
        assert await rows(pool) == [before]
    run(monkeypatch, body)


def test_a_filled_honeypot_writes_nothing(monkeypatch):
    """AC 14."""
    async def body(pool):
        assert await submit(website="http://spam.example") == "received"
        assert await submit(name="", phone="", consent=False, website="x") == "received"
        assert await rows(pool) == []
    run(monkeypatch, body)


def test_validation_failures_write_nothing(monkeypatch):
    """AC 12/13 at the storage layer."""
    async def body(pool):
        for bad in (dict(name=""), dict(phone="12345"), dict(phone="+91 5123456789"),
                    dict(phone="", email="nope"), dict(phone="", email=""), dict(consent=False),
                    dict(interest="landlord"), dict(note="x" * 501), dict(name="1234 5678 9012"),
                    dict(district="123456789012"), dict(mandal="1234-5678-9012"),
                    dict(note="Aadhaar 1234 5678 9012")):
            assert await submit(**bad) in ("invalid", "consent_required")
        assert await rows(pool) == []
    run(monkeypatch, body)


def test_the_ceiling_refuses_a_new_contact(monkeypatch):
    """AC 15."""
    async def body(pool):
        await submit()
        monkeypatch.setattr(network, "HOURLY_CAP", 1)
        assert await submit(phone="9000000001") == "rate_limited"
        assert len(await rows(pool)) == 1
    run(monkeypatch, body)


def test_at_the_ceiling_existing_contacts_get_the_same_answer(monkeypatch):
    """AC 15b: active, cooled-down and withdrawn contacts all get
    rate_limited and their rows do not change (no registration oracle)."""
    async def body(pool):
        await submit(phone="9000000001")
        await submit(phone="9000000002")
        await submit(phone="9000000003")
        await execute(pool, "UPDATE network_interest SET updated_at = updated_at - interval '5 minutes' "
                            "WHERE phone IN ('+919000000002', '+919000000003')")
        await execute(pool, "UPDATE network_interest SET withdrawn_at = now() WHERE phone = '+919000000003'")
        before = await rows(pool)
        monkeypatch.setattr(network, "HOURLY_CAP", len(before))
        for phone in ("9000000001", "9000000002", "9000000003", "9000000004"):
            assert await submit(phone=phone) == "rate_limited", phone
        assert await rows(pool) == before
    run(monkeypatch, body)


def test_touches_do_not_consume_the_ceiling(monkeypatch):
    async def body(pool):
        await submit()
        monkeypatch.setattr(network, "HOURLY_CAP", 2)
        await execute(pool, "UPDATE network_interest SET updated_at = updated_at - interval '61 seconds'")
        assert await submit() == "received"  # a touch, not a new row
        assert await submit(phone="9000000001") == "received"
        assert await submit(phone="9000000002") == "rate_limited"
    run(monkeypatch, body)


def test_phone_and_email_then_email_only_is_two_rows(monkeypatch):
    """Dedup rule: the key is the phone when given, else the email."""
    async def body(pool):
        await submit(email=EMAIL)
        await submit(phone="", email=EMAIL)
        keys = sorted(r["contact_key"] for r in await rows(pool))
        assert keys == ["9848012345", EMAIL]
    run(monkeypatch, body)


def test_the_same_number_in_another_script_is_refused_not_duplicated(monkeypatch):
    """Design-review round 3 MEDIUM 1."""
    async def body(pool):
        await submit(phone="9848012345")
        assert await submit(phone="9८४८०१२३४५") == "invalid"
        assert await submit(phone="９８４８０１２３４５") == "invalid"
        [row] = await rows(pool)
        assert row["phone"] == "+919848012345"
    run(monkeypatch, body)


def test_values_are_parameterized(monkeypatch):
    async def body(pool):
        name = "Ravi'); DROP TABLE network_interest; --"
        assert await submit(name=name, note="O'Brien \\ %s %(x)s") == "received"
        [row] = await rows(pool)
        assert row["name"] == name and row["note"] == "O'Brien \\ %s %(x)s"
    run(monkeypatch, body)


class _FailingPool:
    def __init__(self, exc):
        self.exc = exc

    def connection(self):
        return self

    async def __aenter__(self):
        raise self.exc

    async def __aexit__(self, *exc):
        return False


NETWORK_MUTATION = ("mutation RegisterNetworkInterest($input: NetworkInterestInput!) "
                    "{ registerNetworkInterest(input: $input) { status field } }")


@pytest.mark.parametrize("exc", [
    psycopg.errors.StringDataRightTruncation(f"value too long for type: {NAME}"),
    PoolTimeout(f"couldn't get a connection after 30 sec ({NAME})"),
])
def test_database_errors_are_masked_and_pii_free(monkeypatch, caplog, exc):
    """AC 18b; PoolTimeout is a psycopg.Error, so the one except covers it."""
    assert isinstance(exc, psycopg.Error)
    monkeypatch.setattr(network, "_pool", lambda: _FailingPool(exc))
    monkeypatch.setattr(network, "HOURLY_CAP", 200)
    caplog.set_level(logging.DEBUG)
    variables = {"input": {"interest": "sell", "name": NAME, "phone": PHONE, "consent": True,
                           "consentVersion": network.CONSENT_VERSION}}

    async def go():
        return await main.schema.execute(NETWORK_MUTATION, variable_values=variables,
                                         context_value={"request": types.SimpleNamespace(headers={})})
    result = asyncio.run(go())
    assert result.errors
    assert result.errors[0].message.startswith("Something went wrong at our end (ref ")
    assert NAME not in result.errors[0].message
    messages = [r.getMessage() for r in caplog.records]
    assert f"network.interest_save_failed error={type(exc).__name__}" in messages
    unexpected = [m for m in messages if m.startswith("graphql.unexpected_error")]
    assert unexpected and "NetworkSaveFailed('network interest save failed')" in unexpected[0]
    for text in (NAME, "value too long", "couldn't get a connection", "98480"):
        assert text not in caplog.text
