"""Durable document reads, isolated in a temporary PostgreSQL schema."""
import asyncio
import io
import json
import os
import re
import secrets
from contextlib import asynccontextmanager
from types import SimpleNamespace

import psycopg
import pytest
from cryptography.fernet import Fernet
from fastapi import HTTPException, UploadFile
from psycopg import sql
from psycopg.rows import dict_row
from psycopg_pool import AsyncConnectionPool
from starlette.datastructures import Headers

from src import aadhaar, account
from src.ai_reading import jobs, operations
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
            await conn.execute(jobs.DDL); await account.ensure_schema(conn); await aadhaar.ensure_schema(conn)
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


def _local_without_an_aadhaar_key(monkeypatch):
    monkeypatch.setenv('APP_ENV','local')
    monkeypatch.setenv('ALLOW_INSECURE_LOCAL','1')
    for name in ('AADHAAR_ENC_KEY','AADHAAR_KMS_KEY_ARN','AADHAAR_LEGACY_WRITE_BRIDGE'):
        monkeypatch.delenv(name,raising=False)


SYNTHETIC='123412341234'
NOTHING_SAVED='Aadhaar protection is temporarily unavailable. Nothing was saved.'
_UUIDS=re.compile(r'[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|\b[0-9a-f]{32}\b')


def twelve_digit_runs(text):
    return re.findall(r'\d{12}',_UUIDS.sub('',text))


class CountingUpload(UploadFile):
    reads=0
    async def read(self,*a,**k):
        type(self).reads+=1
        return await super().read(*a,**k)


def _local_with_an_aadhaar_key(monkeypatch):
    _local_without_an_aadhaar_key(monkeypatch)
    monkeypatch.setenv('AADHAAR_ENC_KEY',Fernet.generate_key().decode())


async def _job_rows(pool):
    async with pool.connection() as conn:
        return await (await conn.execute('SELECT id,state,status,result FROM document_read_jobs')).fetchall()


def test_aadhaar_submit_without_a_write_path_is_503_and_stores_nothing(monkeypatch):
    _local_without_an_aadhaar_key(monkeypatch)
    calls=[]
    async def vision(*a,**k): calls.append('sent'); return {'fields':{}}
    monkeypatch.setattr(operations,'vision_extract',vision)
    async def run():
        async with database() as pool:
            jobs.handlers={'extract-aadhaar':operations.extract_aadhaar}
            CountingUpload.reads=0
            card=CountingUpload(file=io.BytesIO(b'card bytes'),filename='card.pdf',headers=Headers({'content-type':'application/pdf'}))
            refused=await jobs.submit(request(),card,'extract-aadhaar')
            assert refused.status_code==503
            assert json.loads(refused.body)=={'error':aadhaar.UNAVAILABLE_MESSAGE}
            assert CountingUpload.reads==0
            assert await _job_rows(pool)==[]
            assert not await jobs.run_one()
            assert calls==[]
    asyncio.run(run())


def test_aadhaar_job_whose_write_path_disappears_before_the_read_fails_named(monkeypatch):
    # Submitted while protection worked; the key went away before the worker
    # ran. The handler's own check refuses before the provider is charged.
    _local_without_an_aadhaar_key(monkeypatch)
    calls=[]
    async def vision(*a,**k): calls.append('sent'); return {'fields':{}}
    monkeypatch.setattr(operations,'vision_extract',vision)
    async def run():
        async with database() as pool:
            jobs.handlers={'extract-aadhaar':operations.extract_aadhaar}
            with monkeypatch.context() as mp:
                mp.setattr(aadhaar,'write_path_available',lambda: True)
                receipt=await jobs.submit(request(),upload(),'extract-aadhaar')
            assert await jobs.run_one()
            result=await jobs.status(receipt['job'],request())
            assert result.status_code==503
            assert json.loads(result.body)=={'error':aadhaar.UNAVAILABLE_MESSAGE,'state':'failed'}
            assert calls==[]
            async with pool.connection() as conn:
                row=await (await conn.execute('SELECT source FROM document_read_jobs')).fetchone()
                assert row['source'] is None
            assert not await jobs.run_one()
    asyncio.run(run())


def test_aadhaar_protection_failure_after_the_read_is_503_not_502(monkeypatch):
    # The path from the reported log: the paid read succeeded, then the
    # number could not be protected. Submit sees a write path (patched for
    # submit only); the real _write_mode then finds no key at vault_put.
    _local_without_an_aadhaar_key(monkeypatch)
    calls=[]
    async def read(file): calls.append('sent'); return {'fields':{'aadhaar':SYNTHETIC}}
    async def run():
        async with database() as pool:
            monkeypatch.setattr(aadhaar,'_pool',pool)
            jobs.handlers={'extract-aadhaar':read}
            with monkeypatch.context() as mp:
                mp.setattr(aadhaar,'write_path_available',lambda: True)
                receipt=await jobs.submit(request(),upload(),'extract-aadhaar')
            assert await jobs.run_one()
            result=await jobs.status(receipt['job'],request())
            assert result.status_code==503
            assert json.loads(result.body)['error']==NOTHING_SAVED
            assert not twelve_digit_runs(result.body.decode())
            assert not await jobs.run_one()
            assert calls==['sent']
            async with pool.connection() as conn:
                assert (await (await conn.execute('SELECT count(*) AS n FROM aadhaar_vault')).fetchone())['n']==0
    asyncio.run(run())


def test_aadhaar_job_id_reaches_the_record_and_the_result_holds_no_digits(monkeypatch):
    _local_with_an_aadhaar_key(monkeypatch)
    async def read(file): return {'fields':{'aadhaar':SYNTHETIC,'name':'Test Person','dob':'1990-01-01'}}
    async def run():
        async with database() as pool:
            monkeypatch.setattr(aadhaar,'_pool',pool)
            jobs.handlers={'extract-aadhaar':read}
            receipt=await jobs.submit(request(),upload(),'extract-aadhaar')
            assert await jobs.run_one()
            result=await jobs.status(receipt['job'],request())
            assert result.status_code==200
            fields=json.loads(result.body)['fields']
            assert fields['aadhaarMasked']=='XXXX-XXXX-1234'
            async with pool.connection() as conn:
                record=await (await conn.execute(
                    'SELECT r.job_id,r.origin,r.name,r.dob,r.last4,v.ciphertext FROM aadhaar_candidates r '
                    'JOIN aadhaar_vault v ON v.token=r.vault_token WHERE r.id=%s',(fields['aadhaarCandidateId'],))).fetchone()
                stored=await (await conn.execute('SELECT result FROM document_read_jobs')).fetchone()
            assert record['job_id']==receipt['job'] and record['origin']=='scan'
            assert (record['name'],record['dob'],record['last4'])==('Test Person','1990-01-01','1234')
            assert record['ciphertext'].startswith(aadhaar.FERNET_PREFIX)
            assert stored['result']['fields']==fields
            assert not twelve_digit_runs(json.dumps(stored['result']))
    asyncio.run(run())


def test_aadhaar_record_store_error_in_the_worker_is_503_not_502(monkeypatch):
    _local_with_an_aadhaar_key(monkeypatch)
    async def read(file): return {'fields':{'aadhaar':SYNTHETIC}}
    async def broken(*a,**k): raise psycopg.OperationalError('server at 10.0.0.1 closed the connection')
    async def run():
        async with database() as pool:
            monkeypatch.setattr(aadhaar,'_pool',pool)
            monkeypatch.setattr(aadhaar,'create_record',broken)
            jobs.handlers={'extract-aadhaar':read}
            receipt=await jobs.submit(request(),upload(),'extract-aadhaar')
            assert await jobs.run_one()
            result=await jobs.status(receipt['job'],request())
            assert result.status_code==503
            assert json.loads(result.body)=={'error':NOTHING_SAVED,'state':'failed'}
            assert not await jobs.run_one()
    asyncio.run(run())


def test_aadhaar_store_unbound_in_the_worker_is_503(monkeypatch):
    _local_with_an_aadhaar_key(monkeypatch)
    async def read(file): return {'fields':{'aadhaar':SYNTHETIC}}
    async def run():
        async with database():
            monkeypatch.setattr(aadhaar,'_pool',None)
            jobs.handlers={'extract-aadhaar':read}
            receipt=await jobs.submit(request(),upload(),'extract-aadhaar')
            assert await jobs.run_one()
            result=await jobs.status(receipt['job'],request())
            assert result.status_code==503
            assert json.loads(result.body)['error']==NOTHING_SAVED
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
