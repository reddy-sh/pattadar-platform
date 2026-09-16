# Razorpay ticket payments

This integration funds a specific service ticket. It does not implement a stored-value wallet, withdrawals, account onboarding or a substitute for merchant/worker verification. The existing simulated ledger remains available with `PAYMENTS_MODE=off`, which is the default.

## Enable a test environment

Set these on the API task; no provider secrets belong in the browser bundle:

| Variable | Meaning |
|---|---|
| `PAYMENTS_MODE` | `off`, `test` or `live`; defaults to `off` |
| `RAZORPAY_KEY_ID` | Public key ID beginning `rzp_test_` for test mode or `rzp_live_` for live mode |
| `RAZORPAY_KEY_SECRET` | Matching merchant API secret |
| `RAZORPAY_WEBHOOK_SECRET` | Separately configured webhook signing secret |
| `RAZORPAY_LINKED_ACCOUNTS_JSON` | Explicit owner → worker/assignee → approved Route linked-account mapping, e.g. `{"owner-id":{"Surveyor name":"acc_example"}}` |
| `RAZORPAY_LIVE_CONFIRMED` | Must be exactly `1` in live mode; otherwise startup refuses |

The API validates mode/key prefixes and mapping shape before starting its payment worker. Empty mapping permits checkout but prevents worker settlement until an approved account is configured. Use new tickets when switching test/live modes: an existing ticket retains its original mode and funding identity. Do not mix simulated ledger entries and provider funds on the same ticket.

Razorpay merchant activation, identity/KYC review, payment-method configuration, Route/direct-transfer enablement, approved linked workers, adequate merchant balance, production credentials and payment/webhook verification remain operator work. The code does not create accounts or activate live payments. Provider processing fees, tax and bank settlement reconciliation remain merchant accounting responsibilities; the ticket ledger records the gross agreed charge, worker amount and gross Pattadar share.

Create a webhook for the environment at:

`https://<app-host>/api/gateway/pattadar/payments/webhook`

Subscribe to payment authorization/capture and order payment events, plus relevant refund/transfer lifecycle events. The gateway exception is limited to **POST on this exact path**. The API independently verifies HMAC-SHA256 against the exact raw request bytes, checks `x-razorpay-event-id`, and persists event deduplication before acknowledging delivery. The event body is never treated as proof of the amount or recipient: a provider GET checks those facts. Razorpay documents duplicate delivery and signature validation in its [webhook validation guide](https://razorpay.com/docs/webhooks/validate-test/).

## Funding and confirmation

The owner opens `/app/services/<id>/pay` from the service. The old `/app/tickets/<id>/pay` redirects there permanently, because a shipped iOS build hard-codes it; the same id resolves either way, so that older shape in a log is not a fault. Native production order details also link to this web checkout, where the same account may need to sign in. The API derives the quote, currency and owner from the locked ticket; a browser cannot submit its own charge amount or another owner's ticket.

`POST /payments/tickets/<id>/checkout` saves an intent and durable order operation before contacting Razorpay. One ticket has one intent. Order creation uses a stable unique receipt. If the response is lost, reconciliation scans provider orders from the original creation time for that receipt before considering a retry. An unresolved provider result never creates a second checkout promise.

The browser opens Razorpay's hosted checkout. Its callback is verified using the **server's stored order ID**, payment ID and key secret. The API then fetches the payment, verifies order/amount/INR currency, captures an authorized payment, and fetches again. Only `captured=true` plus `status=captured` creates the ticket's held ledger amount. A valid browser signature alone does not fund the ticket. These checks follow the [Standard Checkout integration contract](https://razorpay.com/docs/payments/payment-gateway/web-integration/standard/integration-steps/) and [payment retrieval contract](https://razorpay.com/docs/api/payments/fetch-with-id/).

Webhooks queue the same verification. A background sweep also fetches payments belonging to unconfirmed orders, so closing checkout or losing both the callback and webhook does not permanently lose a capture. A payment arriving after its ticket closed is reserved and scheduled for a full refund to the original payer.

## Acceptance, cancellation and retries

Owner acceptance/cancellation and reservation of the immutable settlement plan share the ticket transaction. No transfer/refund is performed inside it. The job may be closed while its financial settlement remains pending; the payment page shows each operation's status and the ledger remains held until provider confirmation.

- Worker payment uses an explicitly configured Route linked account and the direct transfer API. `X-Transfer-Idempotency` is the durable operation UUID. Request body, recipient and amount stay frozen on retry. Razorpay supports idempotency specifically for [direct transfers](https://razorpay.com/docs/api/payments/route/direct-transfers-idempotent-request/); the payment-transfer API is not silently assumed to offer the same guarantee.
- Refunds use the original captured payment, integer paise, a stable receipt and `X-Refund-Idempotency`. Responses in a pending state are polled by their provider ID; only processed refunds reduce the hold. This follows [Razorpay's refund idempotency contract](https://razorpay.com/docs/api/refunds/normal-refunds-idempotent/).
- On partial cancellation the reserved refund completes before a worker transfer. Before any direct transfer, the API checks for unexpected provider-side refunds; an external refund pauses settlement for reconciliation instead of paying the worker with unbacked funds.
- Refunds go from the ticket's held bucket back outside to the original payer. They do not manufacture a reusable wallet balance. Test receipts are labelled `razorpay_test` and remain visibly simulated.

A worker claims one operation under a database lock and a 90-second lease. Retryable network/database errors use widening delays; provider-pending operations retain their receipt and are polled. Lease recovery and provider idempotency cover a process crash after an external operation but before the local commit. The unique ledger key prevents a second balance change after reconciliation.

## Monitor and reconcile

`GET /payments/tickets/<id>` is owner-scoped and reports intent status, amount, mode, capture reference and operation state. It exposes no secret, worker bank credentials or provider contact/card payload. Stored provider results are reduced to the receipt fields needed for reconciliation.

Inspect `payment_intents` with nonempty errors, and `payment_operations` in `attention`, `retry`, `submitted` or with an expired processing lease. Monitor age as well as count; successful HTTP responses alone do not prove settlement. `attention` means the provider refused a request or facts no longer agree. Verify the stored amount, provider order/payment/operation references, worker mapping and provider dashboard before re-queuing the **same** operation. Preserve its UUID, payload and idempotency key. Never fix a mismatch by directly inventing ledger entries.

An unpaid order is **not automatically voided** on a local timeout. Razorpay's [order state contract](https://razorpay.com/docs/api/orders/entity/) does not establish a generic cancellation API; created/attempted orders can still receive payment, while paid orders reject further payment even after refunds. Keep account erasure pending while any payment intent needs reconciliation. Operator/provider evidence must establish safe closure of an unpaid order; expiry of a browser session is insufficient. Keep the original mode's credentials and webhook endpoint operating until its unresolved intents settle.

## Local validation

Run `.local/api-venv/bin/python -m pytest services/api/tests/test_payments.py -q`.

The suite creates its own temporary PostgreSQL cluster and uses `httpx.MockTransport`; it does not call Razorpay, read the application's database, spend money or send messages. It covers owner isolation, signatures and event deduplication, amount mismatch, lost order responses, callback recovery, captured-only ledger entries, settlement rollback, idempotent lost-response retries, pending refunds, partial cancellation, external-refund detection and late capture after cancellation. An actual merchant sandbox checkout, webhook delivery, linked-account transfer and refund drill still need to be performed with operator-provided test credentials before live activation.
