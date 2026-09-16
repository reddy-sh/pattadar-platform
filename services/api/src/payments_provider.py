"""Razorpay HTTP contract. No I/O happens at import or when mode is off.

All amounts are integer paise. Checkout signatures use our stored order ID;
webhooks use their exact raw bytes. See docs/runbooks/razorpay-payments.md.
"""
from __future__ import annotations

import hashlib
import hmac
import json
import os
import re
from dataclasses import dataclass
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP

import httpx


class PaymentError(ValueError):
    pass


class ProviderRetry(PaymentError):
    pass


def paise(value) -> int:
    try:
        amount = Decimal(str(value))
        if not amount.is_finite() or amount < 0:
            raise PaymentError('Payment amount must be finite and nonnegative')
        return int((amount * 100).quantize(Decimal('1'), rounding=ROUND_HALF_UP))
    except (InvalidOperation, TypeError) as exc:
        raise PaymentError('Invalid payment amount') from exc


def verify_hmac(secret: str, message: bytes, signature: str) -> bool:
    return bool(secret and re.fullmatch(r'[a-fA-F0-9]{64}', signature or '')
                and hmac.compare_digest(hmac.new(secret.encode(), message, hashlib.sha256).hexdigest(), signature.lower()))


@dataclass(frozen=True)
class Config:
    mode: str = 'off'
    key_id: str = ''
    key_secret: str = ''
    webhook_secret: str = ''
    linked_accounts: dict | None = None

    @classmethod
    def from_env(cls):
        mode = os.getenv('PAYMENTS_MODE', 'off').strip().lower()
        if mode not in {'off', 'test', 'live'}:
            raise PaymentError('PAYMENTS_MODE must be off, test or live')
        if mode == 'off':
            return cls()
        key = os.getenv('RAZORPAY_KEY_ID', '').strip()
        secret = os.getenv('RAZORPAY_KEY_SECRET', '').strip()
        webhook = os.getenv('RAZORPAY_WEBHOOK_SECRET', '').strip()
        if not key.startswith(f'rzp_{mode}_') or not secret or not webhook:
            raise PaymentError('Razorpay keys and webhook secret must match the selected payment mode')
        if mode == 'live' and os.getenv('RAZORPAY_LIVE_CONFIRMED') != '1':
            raise PaymentError('Live payments require RAZORPAY_LIVE_CONFIRMED=1')
        try:
            accounts = json.loads(os.getenv('RAZORPAY_LINKED_ACCOUNTS_JSON', '{}'))
        except ValueError as exc:
            raise PaymentError('Invalid linked-account configuration') from exc
        if not isinstance(accounts, dict) or any(not isinstance(value, dict) for value in accounts.values()):
            raise PaymentError('Linked-account configuration must map owners to worker accounts')
        if any(not isinstance(account, str) or not re.fullmatch(r'acc_[A-Za-z0-9]+', account)
               for workers in accounts.values() for account in workers.values()):
            raise PaymentError('Linked workers must have approved Razorpay account IDs')
        return cls(mode, key, secret, webhook, accounts)

    def payee_account(self, owner: str, assignee: str) -> str:
        account = (self.linked_accounts or {}).get(owner, {}).get(assignee, '')
        if not isinstance(account, str) or not re.fullmatch(r'acc_[A-Za-z0-9]+', account):
            raise PaymentError('This worker needs an approved linked payment account before settlement')
        return account


class Razorpay:
    def __init__(self, config: Config, client: httpx.AsyncClient | None = None):
        self.config = config
        self.client = client or httpx.AsyncClient(base_url='https://api.razorpay.com/v1/',
            auth=(config.key_id, config.key_secret), timeout=20, follow_redirects=False)

    async def close(self):
        await self.client.aclose()

    async def request(self, method: str, path: str, **kwargs) -> dict:
        try:
            response = await self.client.request(method, path, **kwargs)
        except httpx.HTTPError as exc:
            raise ProviderRetry('The payment provider has not confirmed the request; reconciliation will retry') from exc
        if response.status_code in {408, 409, 429} or response.status_code >= 500:
            raise ProviderRetry('Payment provider temporarily unavailable; reconciliation will retry')
        if not response.is_success:
            # Do not leak provider payloads, keys, contacts or bank metadata.
            raise PaymentError(f'Payment provider refused the operation (HTTP {response.status_code})')
        try:
            result = response.json()
        except ValueError as exc:
            raise ProviderRetry('Payment provider returned an unreadable response') from exc
        if not isinstance(result, dict):
            raise ProviderRetry('Payment provider returned an unexpected response')
        return result

    async def create_order(self, intent: dict) -> dict:
        # On retry, find an order created just before a lost response. Receipt
        # is unique and never changes; no new checkout is shown while unknown.
        if intent.get('retrying'):
            for skip in range(0, 2000, 100):
                page = await self.request('GET', 'orders', params={
                    'from': int(intent['created_at'].timestamp()) - 60, 'count': 100, 'skip': skip})
                items = page.get('items', [])
                found = next((o for o in items if o.get('receipt') == intent['id']), None)
                if found:
                    self.validate_order(found, intent)
                    return found
                if len(items) < 100:
                    break
            else:
                raise PaymentError('Order recovery needs operator reconciliation before retry')
        result = await self.request('POST', 'orders', json={
            'amount': intent['amount'], 'currency': 'INR', 'receipt': intent['id'],
            'partial_payment': False, 'notes': {'payment_intent': intent['id']},
        })
        self.validate_order(result, intent)
        return result

    @staticmethod
    def validate_order(order: dict, intent: dict):
        if (not re.fullmatch(r'order_[A-Za-z0-9]+', order.get('id', ''))
                or order.get('amount') != intent['amount'] or order.get('currency') != 'INR'
                or order.get('receipt') != intent['id']):
            raise PaymentError('The provider order did not match this job')

    async def payment(self, payment_id: str) -> dict:
        if not re.fullmatch(r'pay_[A-Za-z0-9]+', payment_id):
            raise PaymentError('Invalid provider payment reference')
        result = await self.request('GET', f'payments/{payment_id}')
        if result.get('id') != payment_id:
            raise PaymentError('Provider returned a different payment reference')
        return result

    async def verify_capture(self, intent: dict, payment_id: str) -> dict:
        payment = await self.payment(payment_id)
        self.validate_payment(payment, intent)
        if payment.get('status') == 'authorized':
            # Capture is safe to reconcile by fetching the same payment first.
            await self.request('POST', f'payments/{payment_id}/capture',
                               json={'amount': intent['amount'], 'currency': 'INR'})
            payment = await self.payment(payment_id)
            self.validate_payment(payment, intent)
        if payment.get('status') != 'captured' or payment.get('captured') is not True:
            raise ProviderRetry('Payment is awaiting capture confirmation')
        if int(payment.get('amount_refunded') or 0):
            raise PaymentError('This payment has already been refunded; operator reconciliation is required')
        return payment

    @staticmethod
    def validate_payment(payment: dict, intent: dict):
        if (payment.get('order_id') != intent['order_id'] or payment.get('amount') != intent['amount']
                or payment.get('currency') != 'INR'):
            raise PaymentError('Payment amount, currency or order does not match this job')

    async def order_payments(self, order_id: str) -> list:
        return (await self.request('GET', f'orders/{order_id}/payments')).get('items', [])

    async def operation(self, operation: dict, intent: dict) -> dict:
        payload, kind = operation['payload'], operation['kind']
        reference = operation.get('provider_ref')
        if kind == 'refund':
            result = await self.request('GET', f'refunds/{reference}') if reference else await self.request(
                'POST', f"payments/{intent['payment_id']}/refund",
                headers={'X-Refund-Idempotency': operation['id']},
                json={'amount': payload['amount'], 'speed': 'normal', 'receipt': operation['id']})
            if (result.get('payment_id') != intent['payment_id'] or result.get('amount') != payload['amount']
                    or result.get('currency') != 'INR'):
                raise PaymentError('Provider refund does not match the reserved refund')
        elif kind == 'transfer':
            result = await self.request('GET', f'transfers/{reference}') if reference else await self.request(
                'POST', 'transfers', headers={'X-Transfer-Idempotency': operation['id']}, json={
                    'account': payload['account'], 'amount': payload['amount'], 'currency': 'INR',
                    'notes': {'payment_intent': intent['id'], 'payment_id': intent['payment_id']},
                })
            if (result.get('recipient') != payload['account'] or result.get('amount') != payload['amount']
                    or result.get('currency') != 'INR'):
                raise PaymentError('Provider transfer does not match the reserved worker payment')
        else:
            raise PaymentError('Unsupported provider operation')
        if not result.get('id'):
            raise ProviderRetry('Provider operation has no receipt yet')
        return result
