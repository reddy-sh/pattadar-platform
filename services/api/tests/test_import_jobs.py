"""Durable document reads, isolated in a temporary PostgreSQL schema."""
import asyncio
import io
import json
import os
import secrets
from contextlib import asynccontextmanager
from types import SimpleNamespace

import psycopg
import pytest
from fastapi import HTTPException, UploadFile
from psycopg import sql
from psycopg.rows import dict_row
from psycopg_pool import AsyncConnectionPool
from starlette.datastructures import Headers

from src import account
from src.ai_reading import jobs
from src.ai_reading.providers import anthropic as provider


@asynccontextmanager
async def database():
    dsn=os.getenv('TEST_PG_DSN','host=localhost port=5432 dbname=postgres user=rhub password=rhub-dev-pwd')
    schema='test_reads_'+secrets.token_hex(8)
    try: admin=await psycopg.AsyncConnection.connect(dsn,autocommit=True)
    except psycopg.OperationalError:
        if os.getenv('TEST_PG_DSN'): raise
        pytest.skip('Set TEST_PG_DSN to run PostgreSQL integration tests')
    await admin.execute(sql.SQL('CREATE SCHEMA {}').format(sql.Identifier(schema)))
    async def configure(conn): await conn.execute(sql.SQL('SET search_path TO {}').format(sql.Identifier(schema)))
    pool=AsyncConnectionPool(dsn,min_size=1,max_size=4,open=False,configure=configure,kwargs={'autocommit':True,'row_factory':dict_row})
    old=(jobs.pool,jobs.handlers,account._pool)
    try:
        await pool.open(); await pool.wait()
        jobs.pool=pool; account.bind(pool)
        async with pool.connection() as conn:
            await conn.execute(jobs.DDL); await account.ensure_schema(conn)
        yield pool
    finally:
        jobs.pool,jobs.handlers,account._pool=old
        await pool.close()
        await admin.execute(sql.SQL('DROP SCHEMA {} CASCADE').format(sql.Identifier(schema)))
        await admin.close()


def request(owner='alice',key='request-1'):
    return SimpleNamespace(headers={'x-user-id':owner,'idempotency-key':key})


def upload(): return UploadFile(file=io.BytesIO(b'pdf bytes'),filename='deed.pdf',headers=Headers({'content-type':'application/pdf'}))


def test_receipts_are_owner_scoped_and_results_survive_worker_state_reset():
    async def run():
        async with database() as pool:
            calls=[]
            async def read(file): calls.append(await file.read()); return {'fields':{'document_no':'123'}}
            jobs.handlers={'import-registered-document':read}
            receipt=await jobs.submit(request(),upload(),'import-registered-document')
            retry=await jobs.submit(request(),upload(),'import-registered-document')
            assert retry==receipt
            with pytest.raises(HTTPException) as denied: await jobs.status(receipt['job'],request('bob'))
            assert denied.value.status_code==404
            assert await jobs.run_one()
            # Retention starts from completion, so a long queue does not make
            # an otherwise successful paid reading disappear immediately.
            async with pool.connection() as conn:
                await conn.execute("UPDATE document_read_jobs SET created_at=now()-interval '2 days'")
            jobs.handlers={}
            result=await jobs.status(receipt['job'],request())
            assert json.loads(result.body)['fields']['document_no']=='123'
            assert not await jobs.run_one()
            assert calls==[b'pdf bytes']
            async with pool.connection() as conn:
                row=await (await conn.execute('SELECT source FROM document_read_jobs')).fetchone()
                assert row['source'] is None
    asyncio.run(run())


def test_interrupted_paid_read_is_failed_and_never_automatically_reissued():
    async def run():
        async with database():
            async def read(file):
                provider.note_dispatch()  # the document has reached the provider
                raise asyncio.CancelledError()
            jobs.handlers={'import-passbook':read}
            receipt=await jobs.submit(request(),upload(),'import-passbook')
            with pytest.raises(asyncio.CancelledError): await jobs.run_one()
            result=await jobs.status(receipt['job'],request())
            assert result.status_code==503
            assert json.loads(result.body)['state']=='failed'
            assert not await jobs.run_one()
    asyncio.run(run())


def test_queue_limits_are_per_user_and_withdrawal_blocks_new_readings():
    async def run():
        async with database() as pool:
            for n in range(3): await jobs.submit(request(key=str(n)),upload(),'import-passbook')
            with pytest.raises(HTTPException) as limited: await jobs.submit(request(key='fourth'),upload(),'import-passbook')
            assert limited.value.status_code==429
            assert 'job' in await jobs.submit(request('bob'),upload(),'import-passbook')
            async with pool.connection() as conn:
                await conn.execute("INSERT INTO account_consents (id,owner_user_id,version,purposes) VALUES ('c','carol','2026-09-12','[]')")
            with pytest.raises(HTTPException) as denied: await jobs.submit(request('carol'),upload(),'import-passbook')
            assert denied.value.status_code==403
    asyncio.run(run())


def test_withdrawal_while_queued_does_not_send_document_to_provider():
    async def run():
        async with database() as pool:
            calls = []
            async def read(file):
                calls.append(await file.read())
                return {'fields': {}}
            jobs.handlers = {'import-passbook': read}
            receipt = await jobs.submit(request(), upload(), 'import-passbook')
            async with pool.connection() as conn:
                await conn.execute("INSERT INTO account_consents (id,owner_user_id,version,purposes) VALUES ('withdrawn','alice','2026-09-12','[]')")
            assert await jobs.run_one()
            result = await jobs.status(receipt['job'], request())
            assert result.status_code == 403
            assert calls == []
            async with pool.connection() as conn:
                row = await (await conn.execute('SELECT source,state FROM document_read_jobs')).fetchone()
                assert row == {'source': None, 'state': 'failed'}
    asyncio.run(run())
