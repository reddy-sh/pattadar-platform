# Pattadar API (`services/api`)

FastAPI + Strawberry GraphQL product service with the legacy/root schema in
`src/main.py`, W360 schema in `src/web360.py`, notifications, reference data,
account/consent/erasure, imports, payments, geometry, photos, services, and
audit. It is behind `services/gateway` except for the secret-guarded cron path.

## Operational contract

### 1. Auth — trusts the gateway, validates no bearer token

The service trusts only the `x-user-id` header injected by `services/gateway`
after Cognito validation. Never expose this service directly: a caller that can
reach it could otherwise impersonate an owner by setting that header.

The API does **not** derive identity from email. New principals use immutable
Cognito issuer/subject identity. Existing database/S3 owner keys are reachable
only through explicit, reviewed `IDENTITY_LEGACY_BINDINGS` applied by the
gateway. See `docs/runbooks/identity-migration.md`.

### 2. Database — additive startup bootstrap

Startup DDL runs under a PostgreSQL advisory lock and uses additive/idempotent
`CREATE TABLE IF NOT EXISTS` / compatible `ALTER` patterns. Old and new task
revisions may coexist during rollout; destructive schema/data changes require a
separately reviewed migration plan.

### 3. AI readings

The active web uses durable import/read jobs with authenticated polling.
Interrupted provider work is persisted and is never automatically replayed.
Legacy direct extraction endpoints remain for older clients and can run up to
180 seconds; every proxy/load balancer path requires at least 200 seconds and
no retry for those non-idempotent calls.

### 4. Cron

`POST /cron/inactivity-check` runs daily through the one direct ALB-to-API rule.
It is guarded by `x-cron-secret`; `CRON_SECRET` must always be set except in
explicit insecure local development.

### 5. Public verification

Beneficiary/member invite links use `{APP_PUBLIC_URL}/verify/{token}` and work
without login through the gateway's narrowly parsed public operation. Other API
operations require validated gateway identity.

### 6. Notifications

`notify.py` provides email/SMS/WhatsApp seams. Stub providers are the default;
real providers are credential/config gated. Provider activation requires its
security/vendor/rollback checklist rather than an environment variable alone.

## Main endpoints

- `POST /graphql` — product API (gateway proxied)
- `GET /health`
- legacy import/extract POST routes — compatibility only, long timeout/no retry
- `POST /cron/inactivity-check` — exact direct route, `CRON_SECRET` guarded

See `.env.example`, service tests, and the backend-contract skill for change
tracing. Implemented code is not evidence that provider/migration/deployment
steps have been completed.
