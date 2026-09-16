"""Mock Razorpay only, with a disposable PostgreSQL cluster and no app data."""
import asyncio
from contextlib import asynccontextmanager
import hashlib
import hmac
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile

import httpx
from fastapi import FastAPI
import psycopg
from psycopg.rows import dict_row
import pytest

from src import payments, ticketing
from src.payments_provider import Config, Razorpay, PaymentError, paise, verify_hmac


def test_amounts_and_signatures_fail_closed():
    assert paise('12.345') == 1235
    for value in ['NaN', 'Infinity', '-1', 'wrong']:
        with pytest.raises(PaymentError):
            paise(value)
    digest = hmac.new(b'secret', b'exact body', hashlib.sha256).hexdigest()
    assert verify_hmac('secret', b'exact body', digest)
    assert not verify_hmac('secret', b'exact body ', digest)
    assert not verify_hmac('', b'exact body', digest)


def test_live_mode_needs_explicit_matching_credentials(monkeypatch):
    monkeypatch.setenv('PAYMENTS_MODE', 'live')
    monkeypatch.setenv('RAZORPAY_KEY_ID', 'rzp_test_example')
    monkeypatch.setenv('RAZORPAY_KEY_SECRET', 'secret')
    monkeypatch.setenv('RAZORPAY_WEBHOOK_SECRET', 'hook')
    with pytest.raises(PaymentError):
        Config.from_env()
    monkeypatch.setenv('RAZORPAY_KEY_ID', 'rzp_live_example')
    monkeypatch.delenv('RAZORPAY_LIVE_CONFIRMED', raising=False)
    with pytest.raises(PaymentError):
        Config.from_env()


@pytest.fixture(scope='module')
def postgres():
    initdb, pg_ctl = shutil.which('initdb'), shutil.which('pg_ctl')
    if not initdb or not pg_ctl or os.geteuid() == 0:
        pytest.skip('Isolated postgres requires initdb/pg_ctl and a non-root user')
    with tempfile.TemporaryDirectory(prefix='pattadar-payments-') as directory:
        root = Path(directory)
        subprocess.run([initdb, '-D', str(root/'data'), '-A', 'trust', '--no-locale', '--encoding=UTF8'], check=True, capture_output=True)
        subprocess.run([pg_ctl, '-D', str(root/'data'), '-l', str(root/'postgres.log'), '-o',
                        f"-k {root} -h '' -p 55483", '-w', 'start'], check=True, capture_output=True)
        try:
            yield f'host={root} port=55483 dbname=postgres'
        finally:
            subprocess.run([pg_ctl, '-D', str(root/'data'), '-m', 'immediate', '-w', 'stop'], check=True, capture_output=True)


class FakeRazorpay:
    def __init__(self):
        self.orders = {}
        self.paid = {}
        self.operations = {}
        self.calls = []
        self.lose_order_reply = False
        self.lose_transfer_reply = False
        self.refund_pending = False
        self.mismatch_amount = False

    def handler(self, request):
        self.calls.append((request.method, request.url.path, dict(request.headers)))
        path = request.url.path.removeprefix('/v1/')
        body = json.loads(request.content) if request.content else {}
        if path == 'orders' and request.method == 'POST':
            order = {'id': f'order_{len(self.orders)+1}', **body, 'status': 'created'}
            self.orders[order['id']] = order
            if self.lose_order_reply:
                self.lose_order_reply = False
                raise httpx.ReadTimeout('reply lost', request=request)
            return httpx.Response(200, json=order)
        if path == 'orders':
            return httpx.Response(200, json={'items': list(self.orders.values())})
        if path.startswith('orders/') and path.endswith('/payments'):
            order = path.split('/')[1]
            return httpx.Response(200, json={'items': [p for p in self.paid.values() if p['order_id'] == order]})
        if path.startswith('payments/') and path.endswith('/capture'):
            payment = self.paid[path.split('/')[1]]
            payment.update(status='captured', captured=True)
            return httpx.Response(200, json=payment)
        if path.startswith('payments/') and path.endswith('/refund'):
            key = request.headers['X-Refund-Idempotency']
            result = self.operations.setdefault(key, {'id': f'rfnd_{len(self.operations)+1}',
                'payment_id': path.split('/')[1], 'amount': body['amount'], 'currency': 'INR',
                'status': 'pending' if self.refund_pending else 'processed'})
            if result['status'] == 'processed':
                self.paid[result['payment_id']]['amount_refunded'] = result['amount']
            return httpx.Response(200, json=result)
        if path.startswith('payments/'):
            payment = dict(self.paid[path.split('/')[1]])
            if self.mismatch_amount:
                payment['amount'] -= 1
            return httpx.Response(200, json=payment)
        if path == 'transfers':
            key = request.headers['X-Transfer-Idempotency']
            result = self.operations.setdefault(key, {'id': f'trf_{len(self.operations)+1}',
                'recipient': body['account'], 'amount': body['amount'], 'currency': 'INR', 'status': 'processed'})
            if self.lose_transfer_reply:
                self.lose_transfer_reply = False
                raise httpx.ReadTimeout('reply lost', request=request)
            return httpx.Response(200, json=result)
        if path.startswith(('transfers/', 'refunds/')):
            result = next(v for v in self.operations.values() if v['id'] == path.split('/')[1])
            if path.startswith('refunds/') and result['status'] == 'processed':
                self.paid[result['payment_id']]['amount_refunded'] = result['amount']
            return httpx.Response(200, json=result)
        raise AssertionError(f'Unexpected provider call {request.method} {path}')

    def authorize(self, order, amount=100000):
        identifier = f'pay_{len(self.paid)+1}'
        self.paid[identifier] = {'id': identifier, 'order_id': order, 'amount': amount,
            'currency': 'INR', 'status': 'authorized', 'captured': False, 'amount_refunded': 0}
        return {'razorpay_order_id': order, 'razorpay_payment_id': identifier,
                'razorpay_signature': hmac.new(b'secret', f'{order}|{identifier}'.encode(), hashlib.sha256).hexdigest()}


@pytest.fixture
def db(postgres, monkeypatch):
    with psycopg.connect(postgres, autocommit=True) as conn:
        conn.execute('DROP SCHEMA public CASCADE; CREATE SCHEMA public')
        conn.execute("CREATE TABLE work_requests(id text primary key,owner_user_id text,title text,quoted float,cost float,status text,closed boolean default false)")
        conn.execute(next(sql for sql in ticketing.DDL if 'CREATE TABLE IF NOT EXISTS service_payments (' in sql))
        conn.execute(next(sql for sql in ticketing.DDL if 'CREATE UNIQUE INDEX IF NOT EXISTS uq_service_payments_idem' in sql))
        conn.execute("INSERT INTO work_requests VALUES('ticket-1','alice','Survey',1000,1000,'submitted',false)")
    class Pool:
        @asynccontextmanager
        async def connection(self):
            async with await psycopg.AsyncConnection.connect(postgres, autocommit=True, row_factory=dict_row) as conn:
                yield conn
    for key in ('_pool', '_config', '_provider'):
        monkeypatch.setattr(payments, key, getattr(payments, key))
    return Pool(), postgres


async def setup(db):
    pool, dsn = db
    fake = FakeRazorpay()
    config = Config('test', 'rzp_test_example', 'secret', 'webhook', {'alice': {'Surveyor': 'acc_verified'}})
    provider = Razorpay(config, httpx.AsyncClient(base_url='https://api.razorpay.com/v1/', transport=httpx.MockTransport(fake.handler)))
    await payments.initialize(pool, config, provider)
    app = FastAPI()
    app.include_router(payments.router)
    client = httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url='http://test', headers={'x-user-id': 'alice'})
    return client, fake, provider


async def fund(client, fake):
    order = await client.post('/payments/tickets/ticket-1/checkout')
    assert order.status_code == 200, order.text
    data = order.json()
    receipt = fake.authorize(data['orderId'])
    verified = await client.post('/payments/tickets/ticket-1/verify', json=receipt)
    assert verified.status_code == 200, verified.text
    assert verified.json()['status'] == 'captured', verified.text
    return receipt


async def rows(db):
    async with db[0].connection() as conn:
        return await (await conn.execute('SELECT * FROM service_payments ORDER BY entry')).fetchall()


async def due(db):
    async with db[0].connection() as conn:
        await conn.execute("UPDATE payment_operations SET next_at=now(),lease_until=now()-interval '1 second'")


def test_checkout_capture_scope_signature_and_duplicate(db):
    async def run():
        client, fake, provider = await setup(db)
        try:
            assert (await client.get('/payments/tickets/ticket-1', headers={'x-user-id': 'bob'})).status_code == 404
            assert (await client.get('/payments/tickets/ticket-1', headers={'x-user-id': ''})).status_code == 401
            receipt = await fund(client, fake)
            assert len(await rows(db)) == 1
            assert (await rows(db))[0]['provider'] == 'razorpay_test'
            assert (await client.post('/payments/tickets/ticket-1/verify', json=receipt)).status_code == 200
            assert len(await rows(db)) == 1
            bad = {**receipt, 'razorpay_signature': '0'*64}
            assert (await client.post('/payments/tickets/ticket-1/verify', json=bad)).status_code == 400
            assert len(await rows(db)) == 1
        finally:
            await client.aclose(); await provider.close()
    asyncio.run(run())


def test_capture_rejects_mismatched_provider_amount(db):
    async def run():
        client, fake, provider = await setup(db)
        try:
            order = (await client.post('/payments/tickets/ticket-1/checkout')).json()
            receipt = fake.authorize(order['orderId'])
            fake.mismatch_amount = True
            response = await client.post('/payments/tickets/ticket-1/verify', json=receipt)
            assert not response.json()['captured']
            assert await rows(db) == []
        finally:
            await client.aclose(); await provider.close()
    asyncio.run(run())


def test_lost_order_response_reconciles_same_receipt(db):
    async def run():
        client, fake, provider = await setup(db)
        try:
            fake.lose_order_reply = True
            first = (await client.post('/payments/tickets/ticket-1/checkout')).json()
            assert first['orderId'] is None
            await due(db)
            second = (await client.post('/payments/tickets/ticket-1/checkout')).json()
            assert second['orderId'] == 'order_1'
            assert len(fake.orders) == 1
            assert await rows(db) == []
        finally:
            await client.aclose(); await provider.close()
    asyncio.run(run())


def test_settlement_retry_is_idempotent_and_keeps_held_until_confirmed(db):
    async def run():
        client, fake, provider = await setup(db)
        try:
            await fund(client, fake)
            plan = ticketing.accept_plan(1000, .9, 'Surveyor', 'ticket-1')
            async with db[0].connection() as conn:
                async with conn.transaction():
                    assert await payments.route_ledger_plan(conn, 'alice', 'ticket-1', plan) == 2
            assert len(await rows(db)) == 1
            fake.lose_transfer_reply = True
            await payments.process_one(kinds=['transfer'])
            assert len(await rows(db)) == 1
            await due(db)
            await payments.process_one(kinds=['transfer'])
            assert len(fake.operations) == 1
            ledger = await rows(db)
            assert ticketing.held_for(ledger) == 0
            assert sorted((r['entry'], r['amount']) for r in ledger) == [('fee', 100), ('hold', 1000), ('release', 900)]
        finally:
            await client.aclose(); await provider.close()
    asyncio.run(run())


def test_refund_waits_for_processed_status_and_uses_payer_rail(db):
    async def run():
        client, fake, provider = await setup(db)
        try:
            await fund(client, fake)
            async with db[0].connection() as conn:
                async with conn.transaction():
                    await payments.route_ledger_plan(conn, 'alice', 'ticket-1', ticketing.cancel_plan(1000, ticket_id='ticket-1'))
            fake.refund_pending = True
            await payments.process_one(kinds=['refund'])
            assert len(await rows(db)) == 1
            for op in fake.operations.values(): op['status'] = 'processed'
            await due(db)
            await payments.process_one(kinds=['refund'])
            ledger = await rows(db)
            assert ticketing.held_for(ledger) == 0
            refund = next(r for r in ledger if r['entry'] == 'return')
            assert refund['to_bucket'] == 'outside'
            assert len(fake.operations) == 1
        finally:
            await client.aclose(); await provider.close()
    asyncio.run(run())


def test_webhook_exact_raw_signature_and_event_dedup(db):
    async def run():
        client, fake, provider = await setup(db)
        try:
            order = (await client.post('/payments/tickets/ticket-1/checkout')).json()
            receipt = fake.authorize(order['orderId'])
            event = {'event': 'payment.authorized', 'payload': {'payment': {'entity': fake.paid[receipt['razorpay_payment_id']]}}}
            raw = json.dumps(event).encode()
            headers = {'x-razorpay-event-id': 'event-1', 'x-razorpay-signature': hmac.new(b'webhook', raw, hashlib.sha256).hexdigest()}
            assert (await client.post('/payments/webhook', content=raw+b' ', headers=headers)).status_code == 400
            assert (await client.post('/payments/webhook', content=raw, headers=headers)).status_code == 200
            duplicate = await client.post('/payments/webhook', content=raw, headers=headers)
            assert duplicate.json()['duplicate'] is True
            assert await rows(db) == []
            await payments.process_one(kinds=['capture'])
            assert len(await rows(db)) == 1
        finally:
            await client.aclose(); await provider.close()
    asyncio.run(run())


def test_unknown_worker_account_and_transaction_failure_do_not_settle(db):
    async def run():
        client, fake, provider = await setup(db)
        try:
            await fund(client, fake)
            async with db[0].connection() as conn:
                with pytest.raises(PaymentError):
                    async with conn.transaction():
                        await payments.route_ledger_plan(conn, 'alice', 'ticket-1', ticketing.accept_plan(1000, .9, 'Unknown', 'ticket-1'))
                with pytest.raises(RuntimeError):
                    async with conn.transaction():
                        await payments.route_ledger_plan(conn, 'alice', 'ticket-1', ticketing.accept_plan(1000, .9, 'Surveyor', 'ticket-1'))
                        raise RuntimeError('crash before commit')
                assert not await (await conn.execute("SELECT id FROM payment_operations WHERE kind='transfer'")).fetchone()
            assert len(await rows(db)) == 1
            assert not fake.operations
        finally:
            await client.aclose(); await provider.close()
    asyncio.run(run())


def test_partial_cancellation_refunds_before_worker_transfer(db):
    async def run():
        client, fake, provider = await setup(db)
        try:
            await fund(client, fake)
            async with db[0].connection() as conn:
                async with conn.transaction():
                    await payments.route_ledger_plan(conn, 'alice', 'ticket-1', ticketing.cancel_plan(1000, 700, .9, 'Surveyor', 'ticket-1'))
            await payments.process_one(kinds=['transfer'])
            assert not fake.operations
            await payments.process_one(kinds=['refund'])
            await due(db)
            await payments.process_one(kinds=['transfer'])
            ledger = await rows(db)
            assert ticketing.held_for(ledger) == 0
            assert sorted((r['entry'], r['amount']) for r in ledger) == [('fee', 70), ('hold', 1000), ('release', 630), ('return', 300)]
        finally:
            await client.aclose(); await provider.close()
    asyncio.run(run())


def test_external_refund_prevents_unbacked_direct_transfer(db):
    async def run():
        client, fake, provider = await setup(db)
        try:
            receipt = await fund(client, fake)
            async with db[0].connection() as conn:
                async with conn.transaction():
                    await payments.route_ledger_plan(conn, 'alice', 'ticket-1', ticketing.accept_plan(1000, .9, 'Surveyor', 'ticket-1'))
            fake.paid[receipt['razorpay_payment_id']]['amount_refunded'] = 100000
            await payments.process_one(kinds=['transfer'])
            assert not fake.operations
            assert len(await rows(db)) == 1
            response = (await client.get('/payments/tickets/ticket-1')).json()
            assert any(op['status'] == 'attention' for op in response['operations'])
        finally:
            await client.aclose(); await provider.close()
    asyncio.run(run())


def test_late_capture_on_closed_ticket_is_refunded(db):
    async def run():
        client, fake, provider = await setup(db)
        try:
            order = (await client.post('/payments/tickets/ticket-1/checkout')).json()
            receipt = fake.authorize(order['orderId'])
            async with db[0].connection() as conn:
                await conn.execute("UPDATE work_requests SET closed=true,status='cancelled' WHERE id='ticket-1'")
            verified = await client.post('/payments/tickets/ticket-1/verify', json=receipt)
            assert verified.json()['status'] == 'settlement_pending'
            await payments.process_one(kinds=['refund'])
            assert ticketing.held_for(await rows(db)) == 0
        finally:
            await client.aclose(); await provider.close()
    asyncio.run(run())


def test_reconciliation_recovers_missing_checkout_callback(db):
    async def run():
        client, fake, provider = await setup(db)
        try:
            order = (await client.post('/payments/tickets/ticket-1/checkout')).json()
            fake.authorize(order['orderId'])
            async with db[0].connection() as conn:
                await conn.execute("UPDATE payment_intents SET updated_at=now()-interval '60 seconds'")
            await payments.reconcile_checkouts()
            await payments.process_one(kinds=['capture'])
            assert len(await rows(db)) == 1
        finally:
            await client.aclose(); await provider.close()
    asyncio.run(run())
