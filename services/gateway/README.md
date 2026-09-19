# Gateway (services/gateway)

New slim FastAPI gateway — the only service exposed to the internet (behind
CloudFront + WAF → ALB). Assembled in Phase 1 from existing predecessor-platform
modules; no new functionality is invented here.

TODO(Phase 1): port the modules below from the predecessor platform.

## Source modules (predecessor paths)

| Concern | predecessor source | Notes |
| --- | --- | --- |
| Auth | `api/gateway/auth.py`, `api/common/auth0_jwt.py` | Port the JWKS-validation skeleton, rewired to **Amazon Cognito** (see claims contract below). Cognito issues only JWTs — DELETE the predecessor's opaque-token `/userinfo` fallback, do not port it. `extract_user_id` derives an immutable issuer/subject principal; reviewed legacy bindings retain existing DB and storage owner keys. See the identity migration runbook before rollout. |
| Document storage | `api/gateway/routes_storage.py`, `api/gateway/storage_service.py` | PG tables `storage_nodes` / `storage_versions` / `storage_shares` / tags + object bytes in S3. Object keys are `{owner_id}/{node_id}/{version_id}` — migrate MinIO objects verbatim so metadata rows need zero changes. minio-py IS S3-compatible: endpoint swap + `MINIO_SECURE=true` + static keys works day one; rewriting the ~6 call sites to boto3 is a later cleanup. Keep the proxied-streaming model — no presigned URLs exist. |
| Model admin | `api/gateway/routes_admin_models.py`, `api/gateway/model_providers/{base,anthropic}.py` | Super-admin model catalog. Gate is the `platform.manage` permission and MUST fail closed. Now lives in `app/ai_catalog/` — see below. |
| RBAC | minimal port | `platform_admin` as the super-admin role; block deactivated users. |

The table above maps **predecessor** paths. In this repository the model catalog
is `src/ai_catalog/routes.py` (admin HTTP surface, fail closed) and
`src/ai_catalog/providers/` (one adapter per provider). The `platform_models`
table is authoritative for every consumer, including `services/assistant`, which
only reads it. Platform-wide AI context is in
[`docs/architecture/ai-system.md`](../../docs/architecture/ai-system.md).

Note: `providers/` is the Python adapter package; `model_providers` in SQL is a
different thing — the table of configured provider rows.

## Cognito claims contract

The gateway validates the Cognito **access** token:

- Issuer: `https://cognito-idp.ap-south-1.amazonaws.com/<user-pool-id>` (JWKS at
  `<issuer>/.well-known/jwks.json`).
- Check `token_use == "access"` and that `client_id` is in the allowlist — Cognito access
  tokens have **no `aud` claim**; do NOT validate `aud`.
- The `email` claim must be present — it is added to the access token by a
  **pre-token-generation Lambda trigger** (access tokens lack it by default). Reject tokens
  without it.
- `extract_user_id` derives an immutable issuer/subject principal. Explicit
  `IDENTITY_LEGACY_BINDINGS` retain existing owner keys; email never grants access.
  Production startup requires migration configuration. Follow
  [the identity migration runbook](../../docs/runbooks/identity-migration.md).
- `ADMIN_SUBJECT_IDS` is an explicit principal allowlist with no default admin.
  Legacy email-local-part `ADMIN_USER_IDS` settings grant no access.

## Behaviors

- **Header injection**: strip any inbound `x-user-id` and inject the validated one. The
  downstream api service trusts this header blindly — this strip/inject is the entire
  security boundary.
- **Reverse proxy**: route `/api/gateway/pattadar/*` → the api service with a **>= 200s**
  timeout and **no retries** on `import-*` / `extract-*` paths (AI extraction is slow and
  non-idempotent in cost).
- **Storage**: serve `/api/gateway/storage/*` (proxied streaming to/from S3).
- **Path stability**: keep all paths gateway-relative so the web and mobile clients never
  change when infrastructure moves.

## Storage risks carried over from the predecessor platform

- Uploads are **full-buffered** in memory (100MB cap via `STORAGE_MAX_UPLOAD_BYTES`) — size
  the task's memory headroom accordingly.
- Share-token routes are **unauthenticated by design** — review before enabling sharing.
- The S3 bucket must **block all public access**; every byte is served through the gateway.

## Configuration

See `.env.example`.
