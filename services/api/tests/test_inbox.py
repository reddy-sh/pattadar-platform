"""Reading-complete notices: the inbox row, owner scoping, and push safety.

The PostgreSQL tests run in a disposable schema, like test_import_jobs.py, and
skip without a database. The push tests need none.
"""
import asyncio
import base64
import io
import json
import os
import secrets
from contextlib import asynccontextmanager
from types import SimpleNamespace

import psycopg
import pytest
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.hazmat.primitives.asymmetric.utils import encode_dss_signature
from fastapi import HTTPException, UploadFile
from psycopg import sql
from psycopg.rows import dict_row
from psycopg_pool import AsyncConnectionPool
from starlette.datastructures import Headers

from src import aadhaar, account, inbox
from src.ai_reading import jobs


@asynccontextmanager
async def database():
    dsn = os.getenv('TEST_PG_DSN', 'host=localhost port=5432 dbname=postgres user=rhub password=rhub-dev-pwd')
    schema = 'test_inbox_' + secrets.token_hex(8)
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
    old = (jobs.pool, jobs.handlers, account._pool, inbox.pool)
    try:
        await pool.open()
        await pool.wait()
        jobs.pool = pool
        account.bind(pool)
        inbox.bind(pool)
        async with pool.connection() as conn:
            await conn.execute(jobs.DDL)
            await account.ensure_schema(conn)
            await inbox.ensure_schema(conn)
            await aadhaar.ensure_schema(conn)   # the sweep also clears expired candidates
        yield pool
    finally:
        jobs.pool, jobs.handlers, account._pool, inbox.pool = old
        await pool.close()
        await admin.execute(sql.SQL('DROP SCHEMA {} CASCADE').format(sql.Identifier(schema)))
        await admin.close()


def request(owner='alice', key='request-1', purpose='add-property'):
    headers = {'x-user-id': owner, 'idempotency-key': key}
    if purpose:
        headers['x-reading-purpose'] = purpose
    return SimpleNamespace(headers=headers)


def upload(body=b'deed bytes'):
    return UploadFile(file=io.BytesIO(body), filename='deed.pdf',
                      headers=Headers({'content-type': 'application/pdf'}))


def test_a_finished_add_property_reading_lands_in_the_owners_inbox_only():
    async def run():
        async with database():
            async def read(file):
                return {'fields': {'document_no': '42'}}
            jobs.handlers = {'import-registered-document': read}
            receipt = await jobs.submit(request(), upload(), 'import-registered-document')
            listed = await inbox.list_inbox(request())
            assert listed['running'] == 1 and listed['unread'] == 0
            assert await jobs.run_one()
            listed = await inbox.list_inbox(request())
            assert listed['running'] == 0 and listed['unread'] == 1
            item = listed['items'][0]
            assert item['jobId'] == receipt['job'] and item['ok'] and item['title'] == 'Document read'
            assert item['body'] == 'deed.pdf'
            # Another owner sees none of it and cannot mark it read.
            assert (await inbox.list_inbox(request('bob')))['items'] == []
            marked = await inbox.mark_read(inbox.MarkRead(jobId=receipt['job']), request('bob'))
            assert marked['marked'] == 0
            marked = await inbox.mark_read(inbox.MarkRead(jobId=receipt['job']), request())
            assert marked['marked'] == 1
            assert (await inbox.list_inbox(request()))['unread'] == 0
    asyncio.run(run())


def test_a_failed_reading_is_announced_as_failed():
    async def run():
        async with database():
            async def read(file):
                raise HTTPException(422, 'Unreadable')
            jobs.handlers = {'import-registered-document': read}
            await jobs.submit(request(), upload(), 'import-registered-document')
            assert await jobs.run_one()
            item = (await inbox.list_inbox(request()))['items'][0]
            assert not item['ok'] and item['title'] == "Document couldn't be read"
    asyncio.run(run())


def test_readings_without_the_purpose_and_aadhaar_are_never_announced():
    async def run():
        async with database():
            async def read(file):
                return {'fields': {}}
            jobs.handlers = {'import-registered-document': read}
            await jobs.submit(request(purpose=''), upload(), 'import-registered-document')
            await jobs.submit(request(key='r2', purpose='something-else'), upload(b'other'),
                              'import-registered-document')
            assert await jobs.run_one() and await jobs.run_one()
            assert (await inbox.list_inbox(request()))['items'] == []
            # An Aadhaar submission cannot carry the purpose at all.
            await jobs.submit(request(key='r3'), upload(b'card'), 'extract-aadhaar')
            async with jobs.pool.connection() as conn:
                row = await (await conn.execute(
                    "SELECT purpose FROM document_read_jobs WHERE operation='extract-aadhaar'")).fetchone()
            assert row['purpose'] == ''
    asyncio.run(run())


def test_an_interrupted_reading_is_announced_once_by_the_sweep():
    async def run():
        async with database() as pool:
            await jobs.submit(request(), upload(), 'import-registered-document')
            async with pool.connection() as conn:
                await conn.execute("UPDATE document_read_jobs SET state='running',"
                                   " updated_at=now()-interval '20 minutes'")
                await jobs.sweep(conn)
                await jobs.sweep(conn)
            items = (await inbox.list_inbox(request()))['items']
            assert len(items) == 1 and not items[0]['ok']
    asyncio.run(run())


def test_mark_read_needs_a_target():
    async def run():
        async with database():
            with pytest.raises(HTTPException) as bad:
                await inbox.mark_read(inbox.MarkRead(), request())
            assert bad.value.status_code == 400
    asyncio.run(run())


# ── Push, no database ────────────────────────────────────────────────────

def _keys(monkeypatch):
    key = ec.generate_private_key(ec.SECP256R1())
    pub = key.public_key().public_bytes(serialization.Encoding.X962,
                                         serialization.PublicFormat.UncompressedPoint)
    b64 = lambda raw: base64.urlsafe_b64encode(raw).rstrip(b'=').decode()  # noqa: E731
    monkeypatch.setenv('VAPID_PUBLIC_KEY', b64(pub))
    monkeypatch.setenv('VAPID_PRIVATE_KEY', b64(key.private_numbers().private_value.to_bytes(32, 'big')))
    monkeypatch.setenv('VAPID_SUBJECT', 'mailto:ops@example.com')
    return key


def _b64d(s):
    return base64.urlsafe_b64decode(s + '=' * (-len(s) % 4))


def test_push_is_off_without_complete_keys(monkeypatch):
    for name in ('VAPID_PUBLIC_KEY', 'VAPID_PRIVATE_KEY', 'VAPID_SUBJECT'):
        monkeypatch.delenv(name, raising=False)
    assert inbox.vapid_keys() is None
    _keys(monkeypatch)
    monkeypatch.setenv('VAPID_SUBJECT', 'ops@example.com')  # not mailto:/https:
    assert inbox.vapid_keys() is None


def test_vapid_header_is_a_valid_es256_token_for_the_push_origin(monkeypatch):
    key = _keys(monkeypatch)
    endpoint = 'https://fcm.googleapis.com/fcm/send/abc'
    header = inbox.vapid_header(endpoint, inbox.vapid_keys(), now=1_000)
    assert header.startswith('vapid t=')
    token = header.split('t=')[1].split(',')[0]
    head, claims, sig = token.split('.')
    body = json.loads(_b64d(claims))
    assert body == {'aud': 'https://fcm.googleapis.com', 'exp': 1_000 + 12 * 3600,
                    'sub': 'mailto:ops@example.com'}
    raw = _b64d(sig)
    der = encode_dss_signature(int.from_bytes(raw[:32], 'big'), int.from_bytes(raw[32:], 'big'))
    key.public_key().verify(der, f'{head}.{claims}'.encode(), ec.ECDSA(hashes.SHA256()))


def test_only_browser_push_services_are_accepted_as_endpoints():
    ok = ['https://fcm.googleapis.com/fcm/send/x', 'https://updates.push.services.mozilla.com/wpush/v2/x',
          'https://wns2-par02p.notify.windows.com/w/?token=x', 'https://web.push.apple.com/x']
    bad = ['http://fcm.googleapis.com/x', 'https://evil.example/x', 'https://fcm.googleapis.com.evil.example/x',
           'https://user:pw@fcm.googleapis.com/x', 'https://fcm.googleapis.com:8443/x',
           'https://169.254.169.254/latest', '', 'https://fcm.googleapis.com/' + 'x' * 1100]
    assert all(inbox.allowed_endpoint(u) for u in ok)
    assert not any(inbox.allowed_endpoint(u) for u in bad)


def test_subscribing_is_refused_while_push_is_off_or_for_foreign_endpoints(monkeypatch):
    async def run():
        for name in ('VAPID_PUBLIC_KEY', 'VAPID_PRIVATE_KEY', 'VAPID_SUBJECT'):
            monkeypatch.delenv(name, raising=False)
        with pytest.raises(HTTPException) as off:
            await inbox.subscribe(inbox.Subscription(endpoint='https://fcm.googleapis.com/x'), request())
        assert off.value.status_code == 503
        _keys(monkeypatch)
        with pytest.raises(HTTPException) as foreign:
            await inbox.subscribe(inbox.Subscription(endpoint='https://evil.example/x'), request())
        assert foreign.value.status_code == 400
    asyncio.run(run())


def test_every_route_needs_the_gateway_identity():
    async def run():
        anon = SimpleNamespace(headers={})
        for call in (inbox.list_inbox(anon), inbox.push_key(anon),
                     inbox.mark_read(inbox.MarkRead(all=True), anon)):
            with pytest.raises(HTTPException) as denied:
                await call
            assert denied.value.status_code == 401
    asyncio.run(run())
