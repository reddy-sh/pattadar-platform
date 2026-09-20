"""Real PostgreSQL rollback/isolation tests in a disposable, isolated schema.

Set TEST_PG_DSN to the CI database. No existing application tables are read or
written; every connection's search_path is limited to this test's schema.
"""
import asyncio
import json
import os
import secrets
import sys
from contextlib import asynccontextmanager
from datetime import date, timedelta
from pathlib import Path

import psycopg
import pytest
from fastapi import HTTPException
from psycopg import sql
from psycopg.rows import dict_row
from psycopg_pool import AsyncConnectionPool

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from src import capabilities as c, ticketing as t, web360 as w


BASE = [
    "CREATE TABLE land_features (id TEXT PRIMARY KEY)",
    "CREATE TABLE passbooks (id TEXT PRIMARY KEY,owner_user_id TEXT,pattadar_no TEXT,village TEXT,mandal TEXT,district TEXT,owner_name TEXT,state TEXT,group_id TEXT DEFAULT '')",
    "CREATE TABLE parcels (id TEXT PRIMARY KEY,passbook_id TEXT,survey_no TEXT,boundary TEXT DEFAULT '',created_at TEXT DEFAULT '')",
    "CREATE TABLE properties (id TEXT PRIMARY KEY,owner_user_id TEXT,label TEXT,boundary TEXT DEFAULT '',created_at TEXT DEFAULT '',group_id TEXT DEFAULT '')",
    "CREATE TABLE documents (id TEXT PRIMARY KEY,owner_user_id TEXT,name TEXT DEFAULT '',record_id TEXT DEFAULT '',parcel_id TEXT DEFAULT '',property_id TEXT DEFAULT '',file_ref TEXT DEFAULT '',subtitle TEXT DEFAULT '',shelf TEXT DEFAULT '',doc_type TEXT DEFAULT '',page_count INT DEFAULT 0,size_bytes BIGINT DEFAULT 0,mime_type TEXT DEFAULT '',source TEXT DEFAULT '',order_ref TEXT DEFAULT '',created_at TEXT DEFAULT '',sort INT DEFAULT 0)",
    "CREATE TABLE parcel_photos (id TEXT PRIMARY KEY,owner_user_id TEXT,parcel_id TEXT,file_ref TEXT,caption TEXT,file_name TEXT)",
    "CREATE TABLE property_photos (id TEXT PRIMARY KEY,owner_user_id TEXT,property_id TEXT,file_ref TEXT,caption TEXT,file_name TEXT)",
    "CREATE TABLE work_requests (id TEXT PRIMARY KEY,owner_user_id TEXT,kind TEXT DEFAULT 'ec',title TEXT DEFAULT 'EC',entity_type TEXT DEFAULT 'record',entity_id TEXT DEFAULT 'record-a',assignee TEXT DEFAULT '',cost DOUBLE PRECISION DEFAULT 1000,stage INT DEFAULT 0,needs_you BOOLEAN DEFAULT false,note TEXT DEFAULT '',due_date TEXT DEFAULT '',closed BOOLEAN DEFAULT false,created_at TEXT DEFAULT '',params TEXT DEFAULT '{}',area_key TEXT DEFAULT '',area_label TEXT DEFAULT '',status TEXT DEFAULT '',status_at TEXT DEFAULT '',quoted DOUBLE PRECISION DEFAULT 0,payee_share DOUBLE PRECISION DEFAULT 0,assignee_ref TEXT DEFAULT '')",
]


@asynccontextmanager
async def database():
    dsn = os.getenv("TEST_PG_DSN", "host=localhost port=5432 dbname=postgres user=rhub password=rhub-dev-pwd")
    name = "test_cap_" + secrets.token_hex(8)
    try:
        admin = await psycopg.AsyncConnection.connect(dsn, autocommit=True)
    except psycopg.OperationalError:
        if os.getenv("TEST_PG_DSN"):
            raise
        pytest.skip("Local test PostgreSQL unavailable; set TEST_PG_DSN in CI")
    await admin.execute(sql.SQL("CREATE SCHEMA {}").format(sql.Identifier(name)))

    async def configure(conn):
        await conn.execute(sql.SQL("SET search_path TO {}").format(sql.Identifier(name)))

    pool = AsyncConnectionPool(dsn, min_size=1, max_size=4, open=False,
        configure=configure, kwargs={"autocommit": True, "row_factory": dict_row})
    old_pool, old_uid = w._pool, w._uid_of
    try:
        await pool.open(); await pool.wait()
        w.bind(pool, lambda info: info)
        async with pool.connection() as conn:
            for stmt in BASE:
                await conn.execute(stmt)
            for stmt in w._DDL:
                if any(word in stmt for word in ("share_links", "service_order_intents", "record_people")):
                    await conn.execute(stmt)
            for stmt in t.DDL:
                await conn.execute(stmt)
            await conn.execute("INSERT INTO properties (id,owner_user_id,label,boundary) VALUES ('record-a','owner-a','Parcel A','17,82;17.01,82;17.01,82.01'),('record-b','owner-b','Parcel B','')")
            await conn.execute("INSERT INTO documents (id,owner_user_id,record_id,file_ref,name) VALUES ('doc-a','owner-a','record-a','file-a','Deed'),('doc-b','owner-b','record-b','file-b','Private deed')")
        yield pool
    finally:
        w.bind(old_pool, old_uid)
        await pool.close()
        await admin.execute(sql.SQL("DROP SCHEMA {} CASCADE").format(sql.Identifier(name)))
        await admin.close()


def test_capability_scope_expiry_revocation_and_frozen_boundary():
    async def run():
        async with database() as pool:
            mutation = w.WebMutation()
            assert not await mutation.create_share_link('owner-a', 'record-b', 'Recipient')
            assert not await mutation.create_share_link('owner-a', 'record-a', 'Recipient', document_ids=['doc-b'])
            link = await mutation.create_share_link('owner-a', 'record-a', 'Recipient', document_ids=['doc-a'], include_boundary=True)
            token = link.rsplit('/', 1)[1]
            assert len(token) == 43
            body = json.loads((await c.recipient_view('shares', token)).body)
            assert [item['id'] for item in body['items']] == ['doc-a']
            assert 'owner-a' not in json.dumps(body) and 'file-a' not in json.dumps(body)
            initial_boundary = body['boundary']
            async with pool.connection() as conn:
                await conn.execute("UPDATE properties SET boundary='18,83;18.01,83;18.01,83.01' WHERE id='record-a'")
            assert json.loads((await c.recipient_view('shares', token)).body)['boundary'] == initial_boundary
            assert json.loads((await c.file_grant('shares', token, 'doc-a')).body)['fileRef'] == 'file-a'
            with pytest.raises(HTTPException) as denied:
                await c.file_grant('shares', token, 'doc-b')
            assert denied.value.status_code == 404
            async with pool.connection() as conn:
                row = await (await conn.execute("SELECT * FROM share_links")).fetchone()
                assert token not in row['token_hash']
                await conn.execute("UPDATE share_links SET expires_on=%s", ((date.today()-timedelta(days=1)).strftime('%d/%m/%Y'),))
            with pytest.raises(HTTPException) as expired:
                await c.recipient_view('shares', token)
            assert expired.value.status_code == 410
            assert await mutation.extend_share_link('owner-a', row['id'], 7)
            await c.recipient_view('shares', token)
            assert await mutation.revoke_share_link('owner-a', row['id'])
            with pytest.raises(HTTPException):
                await c.file_grant('shares', token, 'doc-a')
            assert not await mutation.extend_share_link('owner-a', row['id'], 7)
    asyncio.run(run())


async def funded_ticket(pool, status='submitted'):
    async with pool.connection() as conn:
        await conn.execute("INSERT INTO work_requests (id,owner_user_id,status,stage,quoted,payee_share) VALUES ('ticket-a','owner-a',%s,3,1000,0.9)", (status,))
        await conn.execute("INSERT INTO ticket_deliverables (id,owner_user_id,ticket_id,record_id,kind,label,file_ref,review) VALUES ('dv-a','owner-a','ticket-a','record-a','paper','Completed survey','survey-file','accepted')")
    assert await w.WebMutation().fund_ticket('owner-a', 'ticket-a')


def test_accept_failure_rolls_back_filing_ledger_audit_and_status_then_retry(monkeypatch):
    async def run():
        async with database() as pool:
            await funded_ticket(pool)
            original = w._event
            async def fail_after_first_settlement_write(*args, **kwargs):
                if kwargs.get('kind') == 'payment':
                    raise RuntimeError('injected event failure after payout INSERT')
                return await original(*args, **kwargs)
            monkeypatch.setattr(w, '_event', fail_after_first_settlement_write)
            with pytest.raises(RuntimeError):
                await w.WebMutation().accept_ticket('owner-a', 'ticket-a')
            async with pool.connection() as conn:
                rows = await w._ledger_of(conn, 'owner-a', 'ticket-a')
                assert t.held_for(rows) == 1000
                assert len(rows) == 1
                assert (await w._ticket_row(conn, 'owner-a', 'ticket-a'))['status'] == 'submitted'
                assert not (await (await conn.execute("SELECT filed_id FROM ticket_deliverables WHERE id='dv-a'")).fetchone())['filed_id']
                assert (await (await conn.execute("SELECT count(*) AS n FROM documents")).fetchone())['n'] == 2
            monkeypatch.setattr(w, '_event', original)
            assert await w.WebMutation().accept_ticket('owner-a', 'ticket-a') == 1
            assert await w.WebMutation().accept_ticket('owner-a', 'ticket-a') == 0
            async with pool.connection() as conn:
                rows = await w._ledger_of(conn, 'owner-a', 'ticket-a')
                assert t.held_for(rows) == 0
                assert sum(r['amount'] for r in rows if r['entry']=='release') == 900
                assert sum(r['amount'] for r in rows if r['entry']=='fee') == 100
                assert (await w._ticket_row(conn, 'owner-a', 'ticket-a'))['status'] == 'accepted'
    asyncio.run(run())


def test_cancel_failure_rolls_back_state_and_retry_and_concurrent_settlement(monkeypatch):
    async def run():
        async with database() as pool:
            await funded_ticket(pool)
            original = w._write_ledger
            async def fail(*args, **kwargs):
                await original(*args, **kwargs)
                raise RuntimeError('failure after cancellation ledger')
            monkeypatch.setattr(w, '_write_ledger', fail)
            with pytest.raises(RuntimeError):
                await w.WebMutation().cancel_ticket('owner-a', 'ticket-a', pay_anyway=500)
            async with pool.connection() as conn:
                assert (await w._ticket_row(conn, 'owner-a', 'ticket-a'))['status'] == 'submitted'
                assert t.held_for(await w._ledger_of(conn, 'owner-a', 'ticket-a')) == 1000
            monkeypatch.setattr(w, '_write_ledger', original)
            accepted, cancelled = await asyncio.gather(w.WebMutation().accept_ticket('owner-a', 'ticket-a'),
                w.WebMutation().cancel_ticket('owner-a', 'ticket-a', pay_anyway=500))
            assert bool(accepted) != bool(cancelled)
            async with pool.connection() as conn:
                rows = await w._ledger_of(conn, 'owner-a', 'ticket-a')
                assert t.held_for(rows) == 0
                assert sum(r['amount'] for r in rows if r['from_bucket']=='held') == 1000
    asyncio.run(run())


def test_order_manifest_idempotency_and_worker_scope(monkeypatch):
    async def run():
        async with database() as pool:
            mutation = w.WebMutation()
            manifest = json.dumps({'documentIds':['doc-a'], 'includeBoundary':True})
            args = dict(record_ids=['record-a'], kind='ec', attachment_manifest=manifest, idempotency_key='intent-a')
            assert await mutation.order_service('owner-a', **args) == 1
            assert await mutation.order_service('owner-a', **args) == 1
            assert await mutation.order_service('owner-a', **{**args, 'record_ids':['record-b']}) == 0
            async with pool.connection() as conn:
                rows = await (await conn.execute('SELECT * FROM work_requests')).fetchall()
                assert len(rows) == 1
                ticket = rows[0]
                frozen = json.loads(ticket['params'])['attachment_manifest']
                assert frozen['items'][0]['id'] == 'doc-a'
            async def stub_send(*args, **kwargs):
                return {'provider':'stub','status':'logged','error':''}
            monkeypatch.setattr(w, '_send', stub_send)
            dispatch_id = await mutation.dispatch_ticket('owner-a', ticket['id'], 'worker@example.com', person_name='Surveyor', channel='email')
            async with pool.connection() as conn:
                dispatch = await (await conn.execute('SELECT * FROM ticket_dispatches WHERE id=%s', (dispatch_id,))).fetchone()
            import re
            token = re.search(r'/work/([A-Za-z0-9_-]{43})', dispatch['body'])[1]
            view = json.loads((await c.recipient_view('work', token)).body)
            assert view['items'][0]['id'] == 'doc-a'
            with pytest.raises(HTTPException):
                await c.worker_action(token, {'action':'cancel'})
            await c.worker_action(token, {'action':'assign'})
            await c.worker_action(token, {'action':'start'})
            await c.worker_deliverable(token, {'label':'Survey completed','fileRef':'worker-file','fileName':'survey.pdf'})
            async with pool.connection() as conn:
                assert (await w._ticket_row(conn, 'owner-a', ticket['id']))['status'] == 'submitted'
                dv = await (await conn.execute('SELECT * FROM ticket_deliverables')).fetchone()
                assert dv['submitted_via'] == 'worker' and dv['submitted_by'] == 'Surveyor'
                assert (await (await conn.execute('SELECT count(*) AS n FROM documents')).fetchone())['n'] == 2
            assert await mutation.revoke_dispatch('owner-a', dispatch_id)
            with pytest.raises(HTTPException):
                await c.worker_deliverable(token, {'label':'Late submission','fileRef':'late-file'})
    asyncio.run(run())


def test_provider_credentials_cannot_falsely_mark_local_ledger_live(monkeypatch):
    monkeypatch.setenv('PAYMENTS_PROVIDER', 'razorpay')
    monkeypatch.setenv('RAZORPAY_KEY_SECRET', 'configured-but-no-provider-operation')
    assert w._payments_provider() == 'stub'


def test_malformed_and_expired_dates_deny_access():
    assert not c.unexpired('') and not c.unexpired('tomorrow')
    assert not c.unexpired('11/09/2026', date(2026,9,12))
    assert c.unexpired('2026-09-12', date(2026,9,12))


def test_withdrawn_notification_consent_records_failure_without_sending(monkeypatch):
    from src import account
    monkeypatch.setenv('NOTIFY_EMAIL_PROVIDER', 'resend')
    monkeypatch.setenv('RESEND_API_KEY', 'test-configured')
    async def withdrawn(uid, purpose):
        assert uid == 'owner-a' and purpose == 'service_notifications'
        raise HTTPException(403, 'Service notifications were withdrawn')
    async def no_send(*args):
        raise AssertionError('No provider may be called without consent')
    monkeypatch.setattr(account, 'require_purpose', withdrawn)
    monkeypatch.setattr(w.notify, 'send_email', no_send)
    result = asyncio.run(w._send(None, 'owner-a', 'email', 'worker@example.com', {'body':'A job'}))
    assert result['status'] == 'failed' and 'withdrawn' in result['error']


def test_unfileable_kept_work_never_releases_held_money():
    async def run():
        async with database() as pool:
            await funded_ticket(pool)
            async with pool.connection() as conn:
                await conn.execute("UPDATE ticket_deliverables SET file_ref='' WHERE id='dv-a'")
            assert await w.WebMutation().accept_ticket('owner-a', 'ticket-a') == 0
            async with pool.connection() as conn:
                assert t.held_for(await w._ledger_of(conn, 'owner-a', 'ticket-a')) == 1000
                assert (await w._ticket_row(conn, 'owner-a', 'ticket-a'))['status'] == 'submitted'
    asyncio.run(run())
