# Gateway (services/gateway)

New slim FastAPI gateway — the only service exposed to the internet (behind
CloudFront + WAF → ALB). Assembled in Phase 1 from existing rhub modules; no new
functionality is invented here.

TODO(Phase 1): port the modules below from rhub
(`/Users/reddy.sh/reddy.sh/projects/rhub/`).

## Source modules (rhub paths)

| Concern | rhub source | Notes |
| --- | --- | --- |
| Auth | `api/gateway/auth.py`, `api/common/auth0_jwt.py` | Auth0 JWKS JWT validation + opaque-token fallback. `extract_user_id` normalization (email local-part, lowercased) MUST stay byte-identical — it is the owner key for every row in every database. |
| Document storage | `api/gateway/routes_storage.py`, `api/gateway/storage_service.py` | PG tables `storage_nodes` / `storage_versions` / `storage_shares` / tags + object bytes in S3. Object keys are `{owner_id}/{node_id}/{version_id}` — migrate MinIO objects verbatim so metadata rows need zero changes. minio-py IS S3-compatible: endpoint swap + `MINIO_SECURE=true` + static keys works day one; rewriting the ~6 call sites to boto3 is a later cleanup. Keep the proxied-streaming model — no presigned URLs exist. |
| Model admin | `api/gateway/routes_admin_models.py`, `api/gateway/model_providers/{base,anthropic}.py` | Super-admin model catalog. Gate is the `platform.manage` permission and MUST fail closed. |
| RBAC | minimal port | `platform_admin` as the super-admin role; block deactivated users. |

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

## Storage risks carried over from rhub

- Uploads are **full-buffered** in memory (100MB cap via `STORAGE_MAX_UPLOAD_BYTES`) — size
  the task's memory headroom accordingly.
- Share-token routes are **unauthenticated by design** — review before enabling sharing.
- The S3 bucket must **block all public access**; every byte is served through the gateway.

## Configuration

See `.env.example`.
