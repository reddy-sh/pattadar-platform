"""The Intelligence page's rules on real PostgreSQL: write-only credentials,
encrypted at rest, and a Gemini choice refused unless it can run.

Throwaway schema on TEST_PG_DSN (the test_aadhaar_vault_db.py pattern); skipped
locally when PostgreSQL is absent. Synthetic credentials only.
"""
from __future__ import annotations

import asyncio
import json
import os
import secrets
from contextlib import asynccontextmanager

import psycopg
import pytest
from cryptography.fernet import Fernet
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from psycopg import sql
from psycopg.rows import dict_row
from psycopg_pool import AsyncConnectionPool

from src import main
from src.ai_reading import admin, settings

KEY = "AIzaSy" + "x" * 30
# A throwaway key: the save signs with it to prove it is a real private key.
_PEM = rsa.generate_private_key(public_exponent=65537, key_size=2048).private_bytes(
    serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8, serialization.NoEncryption()).decode()
ACCOUNT = json.dumps({"type": "service_account", "client_email": "reader@p.iam.gserviceaccount.com",
                      "private_key": _PEM, "token_uri": "http://10.0.0.1/steal"})
PROCESSOR = "projects/p/locations/asia-south1/processors/o"
@pytest.fixture(autouse=True)
def fernet(monkeypatch):
    monkeypatch.setenv("PLATFORM_SECRETS_KEY", Fernet.generate_key().decode())
    for env in settings.SECRET_ENV.values():
        monkeypatch.delenv(env, raising=False)
    audits = []

    async def log_audit(conn, actor, action, target, details="", **kw):
        audits.append((action, kw.get("metadata")))
    monkeypatch.setattr(main, "log_audit", log_audit)
    return audits


@asynccontextmanager
async def database():
    dsn = os.getenv("TEST_PG_DSN", "host=localhost port=5432 dbname=postgres user=rhub password=rhub-dev-pwd")
    schema = "test_intelligence_" + secrets.token_hex(8)
    try:
        root = await psycopg.AsyncConnection.connect(dsn, autocommit=True)
    except psycopg.OperationalError:
        if os.getenv("TEST_PG_DSN"):
            raise
        pytest.skip("Set TEST_PG_DSN to run PostgreSQL integration tests")
    await root.execute(sql.SQL("CREATE SCHEMA {}").format(sql.Identifier(schema)))

    async def configure(conn):
        await conn.execute(sql.SQL("SET search_path TO {}").format(sql.Identifier(schema)))
    pool = AsyncConnectionPool(dsn, min_size=1, max_size=2, open=False, configure=configure,
                               kwargs={"autocommit": True, "row_factory": dict_row})
    try:
        await pool.open()
        await pool.wait()
        async with pool.connection() as conn:
            await conn.execute("CREATE TABLE platform_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL DEFAULT '',"
                               " updated_by TEXT NOT NULL DEFAULT '', updated_at TEXT NOT NULL DEFAULT '')")
        yield pool
    finally:
        await pool.close()
        await root.execute(sql.SQL("DROP SCHEMA {} CASCADE").format(sql.Identifier(schema)))
        await root.close()


async def write(pool, fn, *args, **kw) -> bool:
    async with pool.connection() as conn:
        async with conn.transaction():
            return await fn(conn, "admin-1", *args, **kw)


def provider(pool, pid, model=None, **kw):
    model = model or {"anthropic": "claude-sonnet-5", "gemini": "gemini-3.5-flash-lite"}[pid]
    return write(pool, admin.save_provider, pid, model=model, **kw)


def ocr(pool, enabled=True, processor="", **kw):
    return write(pool, admin.save_ocr, enabled=enabled, processor=processor, **kw)


def reader(pool, pid):
    return write(pool, admin.set_reader, pid)


async def snap(pool) -> dict:
    async with pool.connection() as conn:
        return await admin.snapshot(conn)


def by_id(s, pid):
    return next(p for p in s["providers"] if p["id"] == pid)


def test_claude_is_the_default_and_gemini_is_refused_until_it_can_run():
    async def run():
        async with database() as pool:
            s = await snap(pool)
            assert (s["reader"], s["active_reader"]) == ("anthropic", "anthropic")
            assert [p["id"] for p in s["providers"]] == ["anthropic", "gemini"]
            assert by_id(s, "gemini")["needs"] == "Needs a Gemini API key."
            assert not await reader(pool, "gemini")
            assert await provider(pool, "gemini", api_key=KEY)
            assert by_id(await snap(pool), "gemini")["needs"].startswith("Document AI OCR is on")
            assert not await reader(pool, "gemini")
            assert await ocr(pool, processor=PROCESSOR, service_account=ACCOUNT)
            assert by_id(await snap(pool), "gemini")["needs"] == ""
            assert await reader(pool, "gemini")
            assert (await snap(pool))["active_reader"] == "gemini"
            # While Gemini reads: its key cannot be removed, nor OCR left half set up.
            assert not await provider(pool, "gemini", forget_key=True)
            assert not await ocr(pool, processor="")
            assert not await ocr(pool, processor=PROCESSOR, forget_service_account=True)
            assert await ocr(pool, enabled=False)  # OCR off needs neither
            assert await reader(pool, "anthropic")
            assert await provider(pool, "gemini", forget_key=True)
    asyncio.run(run())


def test_credentials_are_encrypted_never_returned_and_audited_by_name(fernet):
    async def run():
        async with database() as pool:
            assert await provider(pool, "gemini", api_key=KEY)
            assert await ocr(pool, processor=PROCESSOR, service_account=ACCOUNT)
            async with pool.connection() as conn:
                stored = await settings.rows(conn)
            assert KEY not in json.dumps(stored) and "PRIVATE KEY" not in json.dumps(stored)
            assert await settings.reveal(stored, "gemini_api_key") == KEY
            s = await snap(pool)
            assert KEY not in json.dumps(s) and "PRIVATE KEY" not in json.dumps(s)
            assert by_id(s, "gemini")["key"]["source"] == "form"
            assert s["ocr"]["account"]["source"] == "form"
            assert fernet[-2] == ("intelligence_settings.update", {
                "change": "provider", "provider": "gemini", "model": "gemini-3.5-flash-lite",
                "credentials": "gemini_api_key"})
            assert fernet[-1] == ("intelligence_settings.update", {
                "change": "ocr", "ocr_enabled": "1", "credentials": "google_service_account"})
            # A blank key keeps the saved one.
            assert await provider(pool, "gemini", model="gemini-2.5-pro")
            s = await snap(pool)
            assert by_id(s, "gemini")["key"]["source"] == "form"
            assert by_id(s, "gemini")["model"] == "gemini-2.5-pro"
    asyncio.run(run())


def test_bad_input_is_refused_before_anything_is_written():
    async def run():
        async with database() as pool:
            for bad in (provider(pool, "openai", model="gpt-5"),
                        provider(pool, "anthropic", model="gpt-5"),
                        provider(pool, "gemini", model="../x"),
                        provider(pool, "gemini", api_key="short"),
                        provider(pool, "gemini", api_key="has spaces " * 4),
                        ocr(pool, processor="projects/p/locations/us/processors/x/../../internal"),
                        ocr(pool, service_account='{"type":"authorized_user"}'),
                        ocr(pool, service_account="not json"),
                        ocr(pool, service_account=json.dumps({"type": "service_account",
                            "client_email": "x@y", "private_key": "not a pem"})),
                        reader(pool, "openai")):
                assert not await bad
            async with pool.connection() as conn:
                assert await settings.rows(conn) == {}
    asyncio.run(run())


def test_env_credentials_are_reported_as_server_held(monkeypatch):
    async def run():
        async with database() as pool:
            monkeypatch.setenv("GEMINI_API_KEY", KEY)
            s = await snap(pool)
            assert by_id(s, "gemini")["key"] == {"source": "server", "updated_at": ""}
            async with pool.connection() as conn:
                assert await settings.reveal(await settings.rows(conn), "gemini_api_key") == KEY
    asyncio.run(run())


def test_unreadable_saved_credential_is_reported_and_not_ready(monkeypatch):
    async def run():
        async with database() as pool:
            assert await provider(pool, "gemini", api_key=KEY)
            assert await ocr(pool, enabled=False)
            assert await reader(pool, "gemini")
            # The encryption key rotates: the saved row no longer decrypts.
            monkeypatch.setenv("PLATFORM_SECRETS_KEY", Fernet.generate_key().decode())
            s = await snap(pool)
            assert by_id(s, "gemini")["key"]["source"] == "unreadable"
            assert (s["reader"], s["active_reader"]) == ("gemini", "anthropic")
            assert not await reader(pool, "gemini")
    asyncio.run(run())


def test_claude_key_saved_on_the_page_wins_over_the_env(monkeypatch):
    async def run():
        async with database() as pool:
            monkeypatch.setenv("ANTHROPIC_API_KEY", "sk-ant-from-env-0000000000")
            assert by_id(await snap(pool), "anthropic")["key"]["source"] == "server"
            assert await provider(pool, "anthropic", api_key="sk-ant-from-form-000000000000")
            async with pool.connection() as conn:
                assert await settings.reveal(await settings.rows(conn), "anthropic_api_key") == "sk-ant-from-form-000000000000"
            assert by_id(await snap(pool), "anthropic")["key"]["source"] == "form"
    asyncio.run(run())


def test_without_a_secrets_key_credentials_are_refused_and_env_still_works(monkeypatch):
    async def run():
        async with database() as pool:
            monkeypatch.delenv("PLATFORM_SECRETS_KEY")
            assert (await snap(pool))["can_store_credentials"] is False
            with pytest.raises(RuntimeError):
                await provider(pool, "gemini", api_key=KEY)
            async with pool.connection() as conn:
                assert await settings.rows(conn) == {}  # rolled back
            monkeypatch.setenv("GEMINI_API_KEY", KEY)
            async with pool.connection() as conn:
                assert await settings.reveal(await settings.rows(conn), "gemini_api_key") == KEY
    asyncio.run(run())


def test_token_exchange_ignores_the_key_files_token_uri(monkeypatch):
    from src.ai_reading.providers import google
    posted = []

    class Response:
        def raise_for_status(self): pass
        def json(self): return {"access_token": "tok"}

    class Client:
        def __init__(self, **kw): pass
        async def __aenter__(self): return self
        async def __aexit__(self, *a): pass
        async def post(self, url, **kw):
            posted.append(url)
            return Response()
    monkeypatch.setattr(google.httpx, "AsyncClient", Client)
    assert asyncio.run(google._access_token(ACCOUNT)) == "tok"
    assert posted == ["https://oauth2.googleapis.com/token"]
