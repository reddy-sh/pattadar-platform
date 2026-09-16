# Scoped recipient links and service fulfillment

Implemented 12 September 2026. This supersedes the "no worker portal" and
"no URL" implementation notes in the original service-ticket design.

Owners can create links from a record, Vault or a single paper. A paper shares
only itself. A record/Vault link freezes the documents currently selected at
creation. Every link expires, can be revoked in Vault, and exposes only its
manifest. Changing a source file reference or removing the source denies further file
downloads. Revocation cannot retract a copy a recipient has already downloaded.

Service requests and catalogue orders persist document/photo IDs and an optional
snapshot of the saved boundary. Dispatch freezes that manifest again and includes
a `/work/<token>` URL. Workers can accept the job, mark it started, send text
updates and upload files. Files remain ticket deliverables until the owner
reviews and accepts them through the existing Ticket page.

## Delivery configuration

- Set `APP_PUBLIC_URL` to the real browser origin before enabling notifications.
- Email and SMS use the existing notification providers. No replies by email or
  SMS are promised: updates are submitted through the work page.
- WhatsApp requires the approved `pattadar_service_access_v1` template. Its seven
  parameters are recipient name, service, place, fee, due date, ticket reference,
  and the full work URL. A missing/unapproved template must surface as a failed
  dispatch, not be reported as sent.
- Without a configured provider, dispatch is explicitly "Recorded, not sent".
  The owner can open "See what was sent" and copy/send the worker link manually.

## Access boundary

Browser endpoints are under `/api/gateway/capabilities/`. The gateway calls fixed
API routes to validate the token, expiry, revocation and selected item. Private
file grants contain an owner/storage ID; the gateway never exposes those grants
or accepts those IDs from a recipient. The generic API proxy rejects the entire
`internal` namespace, including encoded paths. Application responses use
`no-store` and `no-referrer`; arbitrary uploaded files download with a sandbox
policy. PDF/raster previews are browser-local blobs.

The new API schema additions are bootstrapped idempotently: `share_links`
token/scope/manifest fields, `ticket_dispatches.manifest`, and
`service_order_intents` for owner-scoped order retries. Historical log-only shares
have no token and cannot grant access. Create a fresh share for those records.

## Verification

Run `pytest services/api/tests/test_capabilities_settlement.py`. `TEST_PG_DSN`
selects a test database; tests create and remove a random isolated schema and
never access existing application records. Cases cover real PostgreSQL rollback,
concurrent settlement, ownership, scope, expiry/revocation and worker submissions.

Run `pytest services/gateway/tests/test_capability_routes.py` for the storage
adapter, and `bun run --cwd tests/e2e-web360 test:capabilities` for the public
browser flows. The latter starts an isolated Vite server and uses response
fixtures; it does not seed or mutate any database.

Settlement currently uses simulated ledger entries only. Provider credentials
alone never mark this local accounting path as a real payment. State, filing,
ledger and audit now commit together under the ticket row lock. Real payment
execution requires its own verified provider lifecycle and reconciliation.
