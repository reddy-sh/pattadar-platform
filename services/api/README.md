# Pattadar API (services/api)

The existing Pattadar backend, ported **unchanged** from the predecessor platform
(`api/services/apps/pattadar`): FastAPI + Strawberry GraphQL, ~4200-line `src/main.py`,
`src/notify.py`, `data/*.csv` reference data, and the service `Dockerfile`.

Ported 25/07/2026 from the predecessor's `api/services/apps/pattadar` (source unchanged except the
two review fixes below: verify-link path + required-env fail-fast at startup).

## Operational contract

### 1. Auth — trusts the gateway, validates nothing

The service does **no** token validation. It trusts the `x-user-id` header injected by
`services/gateway` after Cognito JWT validation.

- **Never expose this service directly** — anyone who can reach it can impersonate any user
  by setting `x-user-id`.
- User id format: email local-part, lowercased (from the Cognito `email` claim — e.g.
  `sankara.telukutla`). This format is load-bearing — it is the owner key across all rows in
  the database.

### 2. Database — self-bootstrapping schema

`init_db()` runs on startup under `pg_advisory_lock(918273645)` (safe with multiple
workers/replicas): `CREATE TABLE IF NOT EXISTS` plus additive `ALTER`s, ~28 tables. There is
no separate migration tool.

Migration from the predecessor platform: `pg_dump` the `pattadar` database → restore into RDS → start the
service. `init_db()` reconciles anything additive.

### 3. AI extraction — direct Anthropic calls

Four endpoints call `api.anthropic.com` directly:

- `POST /import-passbook`
- `POST /extract-aadhaar`
- `POST /import-registered-document`
- `POST /extract-property`

Model is `claude-sonnet-5`, hardcoded — TODO: thread through the gateway's model catalog.
httpx timeouts run up to 180s. Any load balancer in front must allow **>= 200s** response
time and must **never retry** these POSTs (retries duplicate expensive extractions).

### 4. Cron — inactivity check

`POST /cron/inactivity-check` runs daily (EventBridge on AWS), guarded by the
`x-cron-secret` header. **`CRON_SECRET` must always be set** — the endpoint is open without
it.

### 5. Verification links

Beneficiary/member invite links are built as `{APP_PUBLIC_URL}/verify/{token}` with
`APP_PUBLIC_URL=https://pattadar.com` — note the path fix vs the predecessor's
`/app/pattadar/verify/...`. The `/verify/:token` route works **without login**.

`APP_PUBLIC_URL` and `CRON_SECRET` are **required at startup** — the service raises
`RuntimeError` if either is unset, unless `ALLOW_INSECURE_LOCAL=1` (local dev only).

### 6. Notifications

`notify.py` is the email/SMS/WhatsApp provider seam. Stub providers by default (records to
`notification_log` only); real providers are env-gated: Resend (email), MSG91 (SMS),
Meta (WhatsApp). See `.env.example`.

## Endpoints

- `POST /graphql` — the application API
- `GET /health`
- `POST /import-passbook`, `POST /extract-aadhaar`, `POST /import-registered-document`,
  `POST /extract-property` — AI extraction (see above)
- `POST /cron/inactivity-check` — cron only, `x-cron-secret` guarded

## Configuration

See `.env.example` for the full variable list.
