"""Ticket-bound checkout and a durable provider outbox. Off by default.

Only server-verified capture/refund/transfer receipts change ledger balances.
Ticket acceptance/cancellation merely reserves immutable provider operations
in the same transaction; network retries happen after that commit.
"""
from __future__ import annotations

import asyncio
import hashlib
import json
import logging
import os
import uuid
from contextlib import asynccontextmanager
from datetime import datetime, timezone

from fastapi import APIRouter, Body, HTTPException, Request
from psycopg.types.json import Jsonb

try:
    from .payments_provider import Config, Razorpay, PaymentError, ProviderRetry, paise, verify_hmac
except ImportError:
    from payments_provider import Config, Razorpay, PaymentError, ProviderRetry, paise, verify_hmac

router = APIRouter(prefix='/payments', tags=['ticket payments'])
_log = logging.getLogger('pattadar.payments')
_pool = None
_provider: Razorpay | None = None
_config = Config()

# An operation retrying past this many attempts is already hours old; the delay
# ladder caps at an hour, so it would otherwise retry forever in silence.
ALERT_AFTER_ATTEMPTS = 6

DDL = [
    """CREATE TABLE IF NOT EXISTS payment_intents (
        id TEXT PRIMARY KEY, owner_user_id TEXT NOT NULL, ticket_id TEXT NOT NULL,
        mode TEXT NOT NULL CHECK(mode IN ('test','live')), amount BIGINT NOT NULL CHECK(amount>0),
        currency TEXT NOT NULL DEFAULT 'INR' CHECK(currency='INR'),
        order_id TEXT UNIQUE, payment_id TEXT UNIQUE, status TEXT NOT NULL DEFAULT 'creating',
        settlement_plan JSONB, error TEXT NOT NULL DEFAULT '',
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        UNIQUE(owner_user_id,ticket_id))""",
    """CREATE TABLE IF NOT EXISTS payment_operations (
        id TEXT PRIMARY KEY, intent_id TEXT NOT NULL REFERENCES payment_intents(id),
        kind TEXT NOT NULL, payload JSONB NOT NULL DEFAULT '{}',
        status TEXT NOT NULL DEFAULT 'pending', attempts INTEGER NOT NULL DEFAULT 0,
        provider_ref TEXT NOT NULL DEFAULT '', result JSONB NOT NULL DEFAULT '{}',
        error TEXT NOT NULL DEFAULT '', next_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        lease_until TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(), UNIQUE(intent_id,kind))""",
    """CREATE TABLE IF NOT EXISTS payment_webhook_events (
        id TEXT PRIMARY KEY, digest TEXT NOT NULL, intent_id TEXT REFERENCES payment_intents(id),
        event TEXT NOT NULL, received_at TIMESTAMPTZ NOT NULL DEFAULT now())""",
    'CREATE INDEX IF NOT EXISTS idx_payment_operations_due ON payment_operations(status,next_at)',
]


def enabled() -> bool:
    return os.getenv('PAYMENTS_MODE', 'off').strip().lower() in {'test', 'live'}


def settings() -> Config:
    return _config


async def initialize(pool, config: Config | None = None, provider: Razorpay | None = None):
    global _pool, _config, _provider
    _pool, _config = pool, config or Config.from_env()
    _provider = provider or (Razorpay(_config) if _config.mode != 'off' else None)
    async with pool.connection() as conn:
        for sql in DDL:
            await conn.execute(sql)


@asynccontextmanager
async def lifecycle(pool):
    await initialize(pool)
    task = asyncio.create_task(worker()) if _provider else None
    try:
        yield
    finally:
        if task:
            task.cancel()
            try:
                await task
            except asyncio.CancelledError:
                pass
        if _provider:
            await _provider.close()


def _owner(request: Request) -> str:
    # The gateway strips client trust headers and sets this from verified JWT.
    uid = request.headers.get('x-user-id', '').strip()
    if not uid or uid == 'system':
        raise HTTPException(401, 'Sign in to manage service payments')
    return uid


def _ready():
    if _config.mode == 'off' or _provider is None:
        raise HTTPException(503, 'Online payments are not configured; no payment was taken')


async def _row(conn, sql: str, args=()):
    return await (await conn.execute(sql, args)).fetchone()


async def _intent(conn, owner: str, ticket: str, *, lock=False):
    return await _row(conn, 'SELECT * FROM payment_intents WHERE owner_user_id=%s AND ticket_id=%s'
                      + (' FOR UPDATE' if lock else ''), (owner, ticket))


async def _enqueue(conn, intent_id: str, kind: str, payload: dict):
    identifier = str(uuid.uuid5(uuid.NAMESPACE_URL, f'pattadar:{intent_id}:{kind}'))
    await conn.execute('INSERT INTO payment_operations(id,intent_id,kind,payload) VALUES(%s,%s,%s,%s)'
                       ' ON CONFLICT(intent_id,kind) DO NOTHING', (identifier, intent_id, kind, Jsonb(payload)))
    return identifier


@router.get('/config')
async def payment_config():
    return {'enabled': _config.mode != 'off', 'mode': _config.mode, 'live': _config.mode == 'live',
            'provider': 'razorpay' if _config.mode != 'off' else 'stub'}


@router.post('/tickets/{ticket_id}/checkout')
async def checkout(ticket_id: str, request: Request):
    _ready()
    uid = _owner(request)
    async with _pool.connection() as conn:
        async with conn.transaction():
            ticket = await _row(conn, 'SELECT * FROM work_requests WHERE id=%s AND owner_user_id=%s FOR UPDATE',
                                (ticket_id, uid))
            if not ticket:
                raise HTTPException(404, 'Service not found')
            if ticket.get('closed'):
                raise HTTPException(409, 'This job is closed')
            current = await _intent(conn, uid, ticket_id, lock=True)
            if current and current['mode'] != _config.mode:
                raise HTTPException(409, 'This job belongs to a different payment mode; order the service again')
            if not current:
                previous = await _row(conn, 'SELECT id FROM service_payments WHERE owner_user_id=%s AND ticket_id=%s LIMIT 1',
                                      (uid, ticket_id))
                if previous:
                    raise HTTPException(409, 'This job already has accounting entries; reconcile them before checkout')
                amount = paise(ticket.get('quoted') or ticket.get('cost') or 0)
                if amount <= 0:
                    raise HTTPException(409, 'Agree a price before funding this job')
                intent_id = 'pi_' + uuid.uuid4().hex
                await conn.execute('INSERT INTO payment_intents(id,owner_user_id,ticket_id,mode,amount) VALUES(%s,%s,%s,%s,%s)',
                                   (intent_id, uid, ticket_id, _config.mode, amount))
                await _enqueue(conn, intent_id, 'order', {})
            else:
                intent_id = current['id']
    await process_one(intent_id=intent_id, kinds=['order'])
    return await _view(uid, ticket_id)


async def _view(uid: str, ticket_id: str) -> dict:
    async with _pool.connection() as conn:
        intent = await _intent(conn, uid, ticket_id)
        if not intent:
            ticket = await _row(conn, 'SELECT id,title,quoted,cost,closed FROM work_requests WHERE id=%s AND owner_user_id=%s',
                                (ticket_id, uid))
            if not ticket:
                raise HTTPException(404, 'Service not found')
            return {'status': 'not_started', 'title': ticket['title'], 'amount': paise(ticket.get('quoted') or ticket.get('cost') or 0),
                    'currency': 'INR', 'mode': _config.mode, 'enabled': _config.mode != 'off', 'operations': []}
        operations = await (await conn.execute('SELECT kind,status,error FROM payment_operations WHERE intent_id=%s ORDER BY created_at',
                                               (intent['id'],))).fetchall()
        ticket = await _row(conn, 'SELECT title FROM work_requests WHERE id=%s AND owner_user_id=%s', (ticket_id, uid))
        return {'intentId': intent['id'], 'status': intent['status'], 'title': (ticket or {}).get('title', 'Service'),
                'amount': intent['amount'], 'currency': intent['currency'], 'mode': intent['mode'],
                'enabled': _config.mode == intent['mode'], 'keyId': _config.key_id if _config.mode == intent['mode'] else '',
                'orderId': intent['order_id'], 'paymentId': intent['payment_id'], 'error': intent['error'],
                'operations': [dict(row) for row in operations],
                'live': intent['mode'] == 'live', 'captured': bool(intent['payment_id'])}


@router.get('/tickets/{ticket_id}')
async def payment_status(ticket_id: str, request: Request):
    return await _view(_owner(request), ticket_id)


@router.post('/tickets/{ticket_id}/verify')
async def verify_checkout(ticket_id: str, request: Request, body: dict = Body(...)):
    _ready()
    uid = _owner(request)
    async with _pool.connection() as conn:
        async with conn.transaction():
            intent = await _intent(conn, uid, ticket_id, lock=True)
            if not intent or intent['mode'] != _config.mode or not intent['order_id']:
                raise HTTPException(404, 'Payment order not found')
            payment_id = str(body.get('razorpay_payment_id') or '')
            message = f"{intent['order_id']}|{payment_id}".encode()
            if (body.get('razorpay_order_id') != intent['order_id']
                    or not verify_hmac(_config.key_secret, message, str(body.get('razorpay_signature') or ''))):
                raise HTTPException(400, 'Payment verification failed')
            await _request_verification(conn, intent, payment_id)
    await process_one(intent_id=intent['id'], kinds=['capture'])
    return await _view(uid, ticket_id)


async def _request_verification(conn, intent: dict, payment_id: str):
    if intent['payment_id']:
        if intent['payment_id'] != payment_id:
            raise HTTPException(409, 'A different payment already funded this job')
        return
    await _enqueue(conn, intent['id'], 'capture', {'payment_id': payment_id})
    current = await _row(conn, 'SELECT * FROM payment_operations WHERE intent_id=%s AND kind=%s FOR UPDATE', (intent['id'], 'capture'))
    if current['payload'].get('payment_id') != payment_id:
        # A failed/abandoned checkout attempt may be followed by a successful
        # one. Only replace when no capture has ever been confirmed or started.
        if current['status'] not in {'attention', 'done'}:
            raise HTTPException(409, 'Another payment is being verified; wait for reconciliation')
        await conn.execute("UPDATE payment_operations SET payload=%s,status='pending',error='',next_at=now() WHERE id=%s",
                           (Jsonb({'payment_id': payment_id}), current['id']))


@router.post('/webhook')
async def webhook(request: Request):
    _ready()
    body = await request.body()
    if len(body) > 256_000:
        raise HTTPException(413, 'Webhook too large')
    if not verify_hmac(_config.webhook_secret, body, request.headers.get('x-razorpay-signature', '')):
        raise HTTPException(400, 'Invalid payment webhook signature')
    try:
        payload = json.loads(body)
        event = str(payload.get('event') or '')
        entity = payload.get('payload', {}).get('payment', {}).get('entity', {})
        order_id, payment_id = entity.get('order_id'), entity.get('id')
    except (ValueError, TypeError, AttributeError):
        raise HTTPException(400, 'Invalid payment webhook')
    event_id = request.headers.get('x-razorpay-event-id', '').strip()
    if not event_id or len(event_id) > 200:
        raise HTTPException(400, 'Missing payment webhook event ID')
    digest = hashlib.sha256(body).hexdigest()
    async with _pool.connection() as conn:
        async with conn.transaction():
            intent = await _row(conn, 'SELECT * FROM payment_intents WHERE order_id=%s FOR UPDATE', (order_id,)) if order_id else None
            if intent and intent['mode'] != _config.mode:
                raise HTTPException(400, 'Webhook payment mode mismatch')
            stored = await _row(conn, 'INSERT INTO payment_webhook_events(id,digest,intent_id,event) VALUES(%s,%s,%s,%s)'
                                ' ON CONFLICT(id) DO NOTHING RETURNING id',
                                (event_id, digest, intent['id'] if intent else None, event))
            if not stored:
                original = await _row(conn, 'SELECT digest FROM payment_webhook_events WHERE id=%s', (event_id,))
                if original['digest'] != digest:
                    raise HTTPException(400, 'Webhook event ID reused with different content')
                return {'received': True, 'duplicate': True}
            if intent and payment_id and event in {'payment.authorized', 'payment.captured', 'order.paid'}:
                await _request_verification(conn, intent, payment_id)
            # Refund/transfer events wake the durable operation; its own GET
            # verifies amount/recipient/status, independent of delivery order.
            for kind in ('refund', 'transfer'):
                reference = payload.get('payload', {}).get(kind, {}).get('entity', {}).get('id')
                if reference:
                    await conn.execute("UPDATE payment_operations SET next_at=now() WHERE provider_ref=%s AND status='submitted'",
                                       (reference,))
    return {'received': True}


async def route_ledger_plan(conn, uid, ticket_id, plan):
    """Called with ticket row locked inside the acceptance/cancel transaction.

    None keeps legacy simulation intact. A captured provider intent reserves a
    settlement exactly once and leaves its held balance until confirmation.
    """
    if _pool is None:
        return None
    intent = await _intent(conn, uid, ticket_id, lock=True)
    if not intent:
        return None
    if intent['mode'] != _config.mode or _provider is None:
        raise PaymentError('This payment needs its original provider mode to settle')
    if not plan:
        return 0
    if not intent['payment_id'] or intent['status'] not in {'captured', 'settlement_pending', 'settled'}:
        raise PaymentError('Wait for the payment to be captured before settling this job')
    if any(row.get('entry') not in {'release', 'fee', 'return'} for row in plan):
        raise PaymentError('Fund this job through checkout')
    if intent['settlement_plan'] is not None:
        if intent['settlement_plan'] != plan:
            raise PaymentError('A different settlement is already reserved for this job')
        return len(plan)
    prior = await _row(conn, "SELECT id FROM service_payments WHERE owner_user_id=%s AND ticket_id=%s AND provider='stub' LIMIT 1",
                       (uid, ticket_id))
    if prior:
        raise PaymentError('Simulated and provider funds cannot be settled together')
    total = sum(paise(row['amount']) for row in plan)
    if total != intent['amount']:
        raise PaymentError('Settlement does not match the captured amount')
    release = next((r for r in plan if r['entry'] == 'release'), None)
    fee = next((r for r in plan if r['entry'] == 'fee'), None)
    refund = next((r for r in plan if r['entry'] == 'return'), None)
    if release:
        account = _config.payee_account(uid, release.get('payee') or '')
        await _enqueue(conn, intent['id'], 'transfer', {'account': account, 'amount': paise(release['amount']),
                       'ledger': [release] + ([fee] if fee else [])})
    elif fee:
        await _enqueue(conn, intent['id'], 'fee', {'ledger': [fee]})
    if refund:
        await _enqueue(conn, intent['id'], 'refund', {'amount': paise(refund['amount']), 'ledger': [refund]})
    await conn.execute("UPDATE payment_intents SET settlement_plan=%s,status='settlement_pending',updated_at=now() WHERE id=%s",
                       (Jsonb(plan), intent['id']))
    return len(plan)


async def _ledger(conn, intent: dict, rows: list, reference: str, operation_id: str):
    provider = 'razorpay' if intent['mode'] == 'live' else 'razorpay_test'
    for row in rows:
        entry = row['entry']
        source, destination = row.get('from_bucket', 'held'), row.get('to_bucket', '')
        # Ticket-specific card/UPI charges/refunds never create fictitious
        # stored-wallet credit or authorize arbitrary wallet withdrawals.
        if entry == 'hold':
            source, destination = 'outside', 'held'
        elif entry == 'return':
            source, destination = 'held', 'outside'
        await conn.execute(
            'INSERT INTO service_payments(id,owner_user_id,ticket_id,entry,from_bucket,to_bucket,amount,payee,provider,'
            'provider_ref,status,note,idempotency_key,actor,created_at) VALUES(%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)'
            " ON CONFLICT(idempotency_key) WHERE idempotency_key<>'' DO NOTHING",
            ('sp-' + uuid.uuid4().hex, intent['owner_user_id'], intent['ticket_id'], entry, source, destination,
             float(paise(row['amount']) / 100), row.get('payee', ''), provider, reference,
             'settled' if intent['mode'] == 'live' else 'recorded',
             ('Razorpay test mode: no real money moved. ' if intent['mode'] == 'test' else '') + row.get('note', ''),
             f'provider:{operation_id}:{entry}', intent['owner_user_id'], datetime.now(timezone.utc).isoformat()))


def _at_stake(operation: dict, intent: dict) -> str:
    """What this one operation moves — the refund or the payout, not the whole
    checkout — since that is the sum the operator has to account for."""
    return f"₹{(operation['payload'].get('amount') or intent['amount']) // 100:,}"


async def _desk_task(kind: str, headline: str, detail: str, operation: dict, intent: dict):
    """Put a stuck operation on the desk's own inbox (associates.py DDL).

    The log line is an alarm; this is the place an operator actually looks.
    It runs on its own connection after the operation was parked, and only
    warns if it cannot be written: a desk that is unreachable must never cost
    the parked row its record of what happened.
    """
    try:
        async with _pool.connection() as conn:
            await conn.execute(
                'INSERT INTO desk_tasks(id,kind,ticket_id,owner_user_id,headline,detail,dedupe_key,created_at)'
                ' VALUES(%s,%s,%s,%s,%s,%s,%s,%s)'
                " ON CONFLICT(dedupe_key) WHERE dedupe_key<>'' DO NOTHING",
                ('dt-' + uuid.uuid4().hex[:12], kind, intent['ticket_id'], intent['owner_user_id'],
                 headline, detail, f'{kind}:{operation["id"]}', datetime.now(timezone.utc).isoformat()))
    except Exception as exc:
        _log.warning('[payments:desk-task-unwritten] operation=%s kind=%s error=%s',
                     operation['id'], kind, type(exc).__name__)


async def process_one(*, intent_id=None, kinds=None) -> bool:
    if _provider is None:
        return False
    async with _pool.connection() as conn:
        async with conn.transaction():
            operation = await _row(conn, "SELECT o.* FROM payment_operations o JOIN payment_intents i ON i.id=o.intent_id "
                "WHERE i.mode=%s AND ((o.status IN ('pending','retry','submitted') AND o.next_at<=now()) "
                "OR (o.status='processing' AND o.lease_until<now())) "
                "AND (%s::text IS NULL OR o.intent_id=%s) AND (%s::text[] IS NULL OR o.kind=ANY(%s)) "
                "ORDER BY o.next_at FOR UPDATE OF o SKIP LOCKED LIMIT 1",
                (_config.mode, intent_id, intent_id, kinds, kinds))
            if not operation:
                return False
            await conn.execute("UPDATE payment_operations SET status='processing',attempts=attempts+1,lease_until=now()+interval '90 seconds' WHERE id=%s",
                               (operation['id'],))
            intent = await _row(conn, 'SELECT * FROM payment_intents WHERE id=%s', (operation['intent_id'],))
    try:
        kind = operation['kind']
        result = {}
        if kind == 'order':
            result = await _provider.create_order({**intent, 'retrying': operation['attempts'] > 0})
        elif kind == 'capture':
            result = await _provider.verify_capture(intent, operation['payload']['payment_id'])
        elif kind in {'refund', 'transfer'}:
            if kind == 'transfer':
                async with _pool.connection() as conn:
                    outstanding = await _row(conn, "SELECT id FROM payment_operations WHERE intent_id=%s AND kind='refund' AND status<>'done'", (intent['id'],))
                    returns = await (await conn.execute("SELECT amount FROM service_payments WHERE owner_user_id=%s AND ticket_id=%s AND entry='return' AND provider IN ('razorpay','razorpay_test')", (intent['owner_user_id'], intent['ticket_id']))).fetchall()
                if outstanding:
                    raise ProviderRetry('Waiting for the reserved refund to be confirmed before paying the worker')
                observed = await _provider.payment(intent['payment_id'])
                _provider.validate_payment(observed, intent)
                expected_refunded = sum(paise(row['amount']) for row in returns)
                if observed.get('captured') is not True or int(observed.get('amount_refunded') or 0) != expected_refunded:
                    raise PaymentError('The provider payment changed outside this job; reconcile it before paying the worker')
            result = await _provider.operation(operation, intent)
            if result.get('status') == 'failed':
                raise PaymentError('Provider operation failed; operator reconciliation is required')
        elif kind == 'fee':
            if not intent['payment_id']:
                raise PaymentError('A fee cannot be recorded before capture')
            result = {'id': intent['payment_id'], 'status': 'processed'}
        else:
            raise PaymentError('Unknown payment operation')
        # Persist only the receipt fields needed for reconciliation; provider
        # payment responses can otherwise include contact/card metadata.
        result = {key: value for key, value in result.items() if key in {
            'id', 'entity', 'amount', 'currency', 'status', 'order_id', 'payment_id',
            'recipient', 'captured', 'amount_refunded',
        }}
        async with _pool.connection() as conn:
            async with conn.transaction():
                # Every ledger writer takes the same ticket lock before the
                # intent lock, including concurrent owner acceptance/cancel.
                await _row(conn, 'SELECT id FROM work_requests WHERE id=%s AND owner_user_id=%s FOR UPDATE',
                           (intent['ticket_id'], intent['owner_user_id']))
                current = await _row(conn, 'SELECT * FROM payment_intents WHERE id=%s FOR UPDATE', (intent['id'],))
                locked = await _row(conn, 'SELECT * FROM payment_operations WHERE id=%s FOR UPDATE', (operation['id'],))
                if locked['status'] == 'done':
                    return True
                if kind == 'order':
                    await conn.execute("UPDATE payment_intents SET order_id=%s,status='awaiting_payment',error='',updated_at=now() WHERE id=%s AND order_id IS NULL",
                                       (result['id'], intent['id']))
                elif kind == 'capture':
                    if current['payment_id'] and current['payment_id'] != result['id']:
                        raise PaymentError('A different capture already funded this job')
                    if not current['payment_id']:
                        # Both this note and the refund note below are stored
                        # text: the Wallet screen prints whatever the row was
                        # written with. Rows written before the vocabulary
                        # settled on service/job still read "ticket" and are
                        # deliberately left that way; backfilling them would
                        # rewrite what the owner was told when the money moved.
                        await _ledger(conn, intent, [{'entry': 'hold', 'amount': intent['amount'] / 100,
                                      'note': 'Captured payment reserved for this job'}], result['id'], operation['id'])
                        await conn.execute("UPDATE payment_intents SET payment_id=%s,status='captured',error='',updated_at=now() WHERE id=%s",
                                           (result['id'], intent['id']))
                        ticket = await _row(conn, 'SELECT status,closed FROM work_requests WHERE id=%s', (intent['ticket_id'],))
                        if ticket and ticket['closed']:
                            # Late bank capture after cancellation must return
                            # to its payer; it cannot silently fund a closed job.
                            refund = {'entry': 'return', 'amount': intent['amount'] / 100,
                                      'note': 'Refund of a payment captured after the job closed'}
                            await _enqueue(conn, intent['id'], 'refund', {'amount': intent['amount'], 'ledger': [refund]})
                            await conn.execute("UPDATE payment_intents SET status='settlement_pending',settlement_plan=%s WHERE id=%s",
                                               (Jsonb([refund]), intent['id']))
                elif result.get('status') == 'processed':
                    await _ledger(conn, intent, operation['payload']['ledger'], result['id'], operation['id'])
                else:
                    await conn.execute("UPDATE payment_operations SET status='submitted',provider_ref=%s,result=%s,next_at=now()+interval '30 seconds',updated_at=now() WHERE id=%s",
                                       (result['id'], Jsonb(result), operation['id']))
                    return True
                await conn.execute("UPDATE payment_operations SET status='done',provider_ref=%s,result=%s,error='',updated_at=now() WHERE id=%s",
                                   (result.get('id', ''), Jsonb(result), operation['id']))
                if kind in {'refund', 'transfer', 'fee'}:
                    unfinished = await _row(conn, "SELECT id FROM payment_operations WHERE intent_id=%s AND kind IN ('refund','transfer','fee') AND status<>'done' LIMIT 1", (intent['id'],))
                    if not unfinished:
                        await conn.execute("UPDATE payment_intents SET status='settled',error='',updated_at=now() WHERE id=%s", (intent['id'],))
    except Exception as exc:
        # Unknown exceptions also stay retryable: a local DB failure after a
        # successful request must reconcile the same provider operation.
        retry = isinstance(exc, (ProviderRetry, asyncio.TimeoutError)) or not isinstance(exc, PaymentError)
        message = str(exc) if isinstance(exc, PaymentError) else 'Payment reconciliation will retry after a local failure'
        delay = min(3600, 5 * 2 ** min(operation['attempts'], 9))
        async with _pool.connection() as conn:
            await conn.execute("UPDATE payment_operations SET status=%s,error=%s,next_at=now()+%s*interval '1 second',updated_at=now() WHERE id=%s AND status<>'done'",
                               ('retry' if retry else 'attention', message, delay, operation['id']))
            await conn.execute('UPDATE payment_intents SET error=%s,updated_at=now() WHERE id=%s', (message, intent['id']))
        if not retry:
            # Nothing picks an 'attention' row up again: captured money stays
            # held until a human reconciles it, so this line is the alert.
            _log.error('[payments:attention] operation=%s kind=%s intent=%s ticket=%s amount=%s attempts=%s error=%s'
                       ' — operator reconciliation is required',
                       operation['id'], operation['kind'], intent['id'], intent['ticket_id'],
                       intent['amount'], operation['attempts'], message)
            await _desk_task('payment_attention',
                             f"The {operation['kind']} of {_at_stake(operation, intent)} needs reconciliation",
                             message, operation, intent)
        elif operation['attempts'] >= ALERT_AFTER_ATTEMPTS:
            _log.warning('[payments:stalled] operation=%s kind=%s intent=%s attempts=%s error=%s',
                         operation['id'], operation['kind'], intent['id'], operation['attempts'], message)
            await _desk_task('payment_stalled',
                             f"The {operation['kind']} of {_at_stake(operation, intent)} has retried"
                             f" {operation['attempts']} times",
                             message, operation, intent)
    return True


async def reconcile_checkouts():
    """Recover a captured payment even when checkout and webhook were missed."""
    if not _provider:
        return
    async with _pool.connection() as conn:
        intents = await (await conn.execute("SELECT * FROM payment_intents WHERE mode=%s AND status='awaiting_payment' AND updated_at<now()-interval '30 seconds' ORDER BY updated_at LIMIT 10", (_config.mode,))).fetchall()
    for intent in intents:
        try:
            payments = await _provider.order_payments(intent['order_id'])
            candidate = next((p for p in payments if p.get('status') in {'authorized', 'captured'}), None)
            async with _pool.connection() as conn:
                async with conn.transaction():
                    current = await _row(conn, 'SELECT * FROM payment_intents WHERE id=%s FOR UPDATE', (intent['id'],))
                    if candidate:
                        await _request_verification(conn, current, candidate['id'])
                    await conn.execute('UPDATE payment_intents SET updated_at=now() WHERE id=%s', (intent['id'],))
        except Exception as exc:
            # No speculative ledger update is a substitute for a provider
            # receipt; name the unresolved row instead.
            _log.warning('[payments:unreconciled] intent=%s order=%s ticket=%s error=%s',
                         intent['id'], intent['order_id'], intent['ticket_id'], type(exc).__name__)
            continue


async def worker():
    while True:
        try:
            progressed = await process_one()
            if not progressed:
                await reconcile_checkouts()
                await asyncio.sleep(5)
        except asyncio.CancelledError:
            raise
        except Exception:
            await asyncio.sleep(5)
