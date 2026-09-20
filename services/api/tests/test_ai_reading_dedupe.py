"""Regression tests for the reading gate, content dedupe and interrupted work.

Three things this file holds in place, each of which used to cost something
real: a photo reaching the provider after consent was withdrawn, an identical
document being paid for twice, and a rolling deploy turning queued readings
into failures the owner has to notice and send again.

Nothing here calls a provider. The database tests use the same temporary-schema
pattern as test_import_jobs.py and skip when no PostgreSQL is reachable.
"""
from __future__ import annotations

import asyncio
import io
import json
import os
import secrets
from contextlib import asynccontextmanager
from types import SimpleNamespace

import psycopg
import pytest
from fastapi import UploadFile
from psycopg import sql
from psycopg.rows import dict_row
from psycopg_pool import AsyncConnectionPool
from starlette.datastructures import Headers

from src import aadhaar, account
from src.ai_reading import config, jobs, operations
from src.ai_reading.providers import anthropic as provider


@asynccontextmanager
async def database():
    dsn = os.getenv('TEST_PG_DSN', 'host=localhost port=5432 dbname=postgres user=rhub password=rhub-dev-pwd')
    schema = 'test_dedupe_' + secrets.token_hex(8)
    try:
        admin = await psycopg.AsyncConnection.connect(dsn, autocommit=True)
    except psycopg.OperationalError:
        if os.getenv('TEST_PG_DSN'):
            raise
        pytest.skip('Set TEST_PG_DSN to run PostgreSQL integration tests')
    await admin.execute(sql.SQL('CREATE SCHEMA {}').format(sql.Identifier(schema)))

    async def configure(conn):
        await conn.execute(sql.SQL('SET search_path TO {}').format(sql.Identifier(schema)))

    pool = AsyncConnectionPool(dsn, min_size=1, max_size=4, open=False, configure=configure,
                               kwargs={'autocommit': True, 'row_factory': dict_row})
    old = (jobs.pool, jobs.handlers, account._pool)
    try:
        await pool.open()
        await pool.wait()
        jobs.pool = pool
        account.bind(pool)
        async with pool.connection() as conn:
            await conn.execute(jobs.DDL)
            await account.ensure_schema(conn)
            await aadhaar.ensure_schema(conn)
        yield pool
    finally:
        jobs.pool, jobs.handlers, account._pool = old
        await pool.close()
        await admin.execute(sql.SQL('DROP SCHEMA {} CASCADE').format(sql.Identifier(schema)))
        await admin.close()


def request(owner='alice', key='request-1'):
    return SimpleNamespace(headers={'x-user-id': owner, 'idempotency-key': key})


def upload(data=b'deed bytes'):
    return UploadFile(file=io.BytesIO(data), filename='deed.pdf',
                      headers=Headers({'content-type': 'application/pdf'}))


# ── the classifier is a provider call like any other ──────────────────

def test_parcel_photo_classification_stops_at_a_withdrawn_consent():
    """The picture is stored nowhere, but it is still sent abroad to be read."""
    checked, sent = [], []

    async def refuse(_request=None):
        checked.append('checked')
        raise PermissionError('consent withdrawn')

    async def explode(*a, **k):
        sent.append('sent')
        raise AssertionError('photo reached the provider despite refusal')

    async def run():
        with pytest.MonkeyPatch.context() as mp:
            mp.setattr(operations, 'require_read_consent', refuse)
            mp.setattr(operations, 'vision_extract', explode)
            with pytest.raises(PermissionError):
                await operations.classify_parcel_photo(file=upload(), request=object())
    asyncio.run(run())
    assert checked == ['checked']
    assert sent == []


def test_parcel_photo_classification_still_answers_once_consent_is_given():
    async def allow(_request=None):
        return None

    async def classify(*a, **k):
        return {'fields': {'kind': 'id_document', 'category': 'identity',
                           'confidence': 'high', 'reason': 'an Aadhaar card'}}

    async def run():
        with pytest.MonkeyPatch.context() as mp:
            mp.setattr(operations, 'require_read_consent', allow)
            mp.setattr(operations, 'vision_extract', classify)
            return await operations.classify_parcel_photo(file=upload(), request=object())
    out = asyncio.run(run())
    assert out['kind'] == 'id_document'


# ── the same document is not paid for twice ───────────────────────────

def test_identical_document_is_answered_from_the_stored_reading():
    async def run():
        async with database():
            calls = []

            async def read(file):
                calls.append(await file.read())
                return {'fields': {'document_no': '123'}}

            jobs.handlers = {'import-registered-document': read}
            first = await jobs.submit(request(), upload(), 'import-registered-document')
            assert await jobs.run_one()
            again = await jobs.submit(request(key='second'), upload(), 'import-registered-document')
            assert again['job'] != first['job']
            # No second queue entry: the reading is already complete.
            assert not await jobs.run_one()
            assert len(calls) == 1
            result = await jobs.status(again['job'], request())
            assert result.status_code == 200
            assert json.loads(result.body)['fields']['document_no'] == '123'
    asyncio.run(run())


def test_a_different_document_or_a_different_operation_is_still_read():
    async def run():
        async with database():
            calls = []

            async def read(file):
                calls.append(await file.read())
                return {'fields': {}}

            jobs.handlers = {'import-registered-document': read, 'import-passbook': read}
            await jobs.submit(request(key='a'), upload(), 'import-registered-document')
            assert await jobs.run_one()
            await jobs.submit(request(key='b'), upload(b'other bytes'), 'import-registered-document')
            assert await jobs.run_one()
            await jobs.submit(request(key='c'), upload(), 'import-passbook')
            assert await jobs.run_one()
            assert len(calls) == 3
    asyncio.run(run())


def test_dedupe_is_owner_scoped_and_never_replays_an_aadhaar_reading():
    async def run():
        async with database():
            calls = []

            async def read(file):
                calls.append(await file.read())
                return {'fields': {}}

            jobs.handlers = {'import-registered-document': read, 'extract-aadhaar': read}
            await jobs.submit(request(), upload(), 'import-registered-document')
            assert await jobs.run_one()
            # Another owner's identical upload is a reading of its own: results
            # are never shared across owners.
            await jobs.submit(request('bob'), upload(), 'import-registered-document')
            assert await jobs.run_one()
            # An Aadhaar result is a one-use candidate, so it is never reused.
            await jobs.submit(request(key='card'), upload(), 'extract-aadhaar')
            assert await jobs.run_one()
            await jobs.submit(request(key='card-again'), upload(), 'extract-aadhaar')
            assert await jobs.run_one()
            assert len(calls) == 4
    asyncio.run(run())


def test_a_failed_reading_is_never_served_as_a_stored_result():
    async def run():
        async with database():
            attempts = []

            async def read(file):
                attempts.append(1)
                raise RuntimeError('provider said no')

            jobs.handlers = {'import-passbook': read}
            await jobs.submit(request(key='one'), upload(), 'import-passbook')
            assert await jobs.run_one()
            await jobs.submit(request(key='two'), upload(), 'import-passbook')
            assert await jobs.run_one()
            assert len(attempts) == 2
    asyncio.run(run())


# ── a stop before the paid call is not the owner's problem ────────────

def test_a_stop_before_the_provider_call_requeues_instead_of_failing():
    async def run():
        async with database() as pool:
            attempts = []

            async def read(file):
                attempts.append(1)
                if len(attempts) == 1:
                    raise asyncio.CancelledError()
                return {'fields': {'document_no': '77'}}

            jobs.handlers = {'import-passbook': read}
            receipt = await jobs.submit(request(), upload(), 'import-passbook')
            with pytest.raises(asyncio.CancelledError):
                await jobs.run_one()
            async with pool.connection() as conn:
                row = await (await conn.execute('SELECT state,source FROM document_read_jobs')).fetchone()
            assert row['state'] == 'queued'
            assert row['source'] is not None, 'the document must survive for the retry'
            assert await jobs.run_one()
            result = await jobs.status(receipt['job'], request())
            assert result.status_code == 200
            assert json.loads(result.body)['fields']['document_no'] == '77'
    asyncio.run(run())


# ── budgets and redaction ─────────────────────────────────────────────

def test_the_model_budget_leaves_room_inside_the_gateway_and_alb_timeouts():
    """Equal budgets mean paid work is discarded at the edge as it completes."""
    assert config.MODEL_TIMEOUT_SECONDS < 200


def test_an_underscore_separated_number_is_redacted_like_any_other():
    safe = aadhaar.sanitize_document_result({
        'fields': {'address': 'Card 1234_5678_9012'},
        'raw': 'text 1234_5678_9012',
    })
    assert '1234_5678_9012' not in json.dumps(safe)
    assert safe['fields']['address'].endswith('9012')


def test_the_provider_adapter_reports_whether_a_paid_call_was_sent():
    async def run():
        state = provider.watch_dispatch()
        assert state == {'dispatched': False}
        # wait_for runs the call in a child task, which copies this context.
        await asyncio.wait_for(asyncio.to_thread(provider.note_dispatch), timeout=5)
        return state
    assert asyncio.run(run())['dispatched'] is True
