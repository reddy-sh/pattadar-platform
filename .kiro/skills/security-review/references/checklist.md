# Security review checklist (pattadar-platform)

Grounded in `SECURITY.md`, `docs/compliance/engineering-checklist.md`, and the
key invariants in `.kiro/steering/pattadar-standards.md`. Review the items a
diff actually touches.

## Trust boundary (gateway ↔ api/assistant)

- [ ] `services/api` and `services/assistant` are reachable only through
      `services/gateway`. Declared ingress (`infra/terraform/modules/runtime/`
      `api_edge.tf`, `cloudfront.tf`, `ec2.tf`): CloudFront `/api/*` → gateway
      VPC origin (host :8080); api only through the api distribution's
      exact-path `/cron/inactivity-check` behaviour → api_cron VPC origin
      (host :8081; POST only; forwards only `x-cron-secret` and
      `content-type`; guarded by `CRON_SECRET`; reads no `x-user-id`);
      default behaviour 404; host SG admits only
      `CloudFront-VPCOrigins-Service-SG` on 8080-8081; gateway→api and
      gateway→assistant over `172.17.0.1`. Flag any new behaviour, VPC origin,
      hostname, wider path pattern, SG rule or port (8082, 22, a cidr) and
      any task with host network, privileged mode or `docker.sock`
      (`scripts/tests/test_edge_routes.py` guards these).
- [ ] The gateway strips every client-supplied identity header and
      `x-internal-proxy-secret` (`_IDENTITY_HEADERS` in
      `services/gateway/src/main.py`) before injecting the Cognito-derived
      value; a new identity header is added there.
- [ ] Proxy secrets on the shared host: the api container
      (`services/api/src/private_ingress.py`) fails closed and refuses to
      start without `INTERNAL_PROXY_SECRET`. The assistant check still fails
      open when unset. The gateway must send the api only
      `INTERNAL_PROXY_SECRET_API` and the assistant only
      `INTERNAL_PROXY_SECRET_ASSISTANT` (no assistant fallback to the legacy
      variable). `ecs.tf` injects them from SSM, and `deploy-release.py`
      refuses a release without them. Flag any path that disables these,
      merges the two values, or adds an exempt path.
- [ ] Local-only switches (`ALLOW_INSECURE_LOCAL`, `LOCAL_AUTH_KEY_FILE`) never
      reach image builds or task definitions.
- [ ] Cognito access-token validation is intact: issuer check,
      `token_use == "access"`, `client_id` allowlist (not `aud`), required
      `email` claim.
- [ ] Admin gates are fail-closed allowlists, not roles: gateway
      `ADMIN_SUBJECT_IDS` (`auth.py`); API `PLATFORM_ADMIN_UIDS` and
      `SUPER_ADMIN_UIDS` unioned with `platform_settings` (`web360.py`);
      assistant `PLATFORM_ADMIN_UIDS` plus `admin.uids` (`main.py`). Empty or
      unknown denies, nothing is cached, and grant mutations
      (`set_platform_admin`, `set_super_admin`) stay admin-gated, record who
      granted, allow no self-escalation, and cannot remove env bootstrap admins.

## Public and capability entry points

- [ ] Anonymous GraphQL roots are listed twice and must agree: gateway
      `services/gateway/src/public_graphql.py` and the API's
      `public_queries`/`public_mutations` in `services/api/src/main.py`. A new
      anonymous root goes in both; flag any difference (the API list also
      admits `trainingCertificate`, the gateway's does not).
- [ ] Capability tokens (`services/gateway/src/routes/capabilities.py`,
      `services/api/src/capabilities.py`) stay scope-limited and revocable, and
      deny on missing or malformed expiry.
- [ ] The unauthenticated `payments/webhook` stays POST-only and is
      HMAC-verified in `services/api/src/payments.py` before parsing.
- [ ] Direct uploads use presigned POST with a gateway-chosen key, size range
      and SSE in the policy, confirmed by HeadObject (`presign_upload` in
      `services/gateway/src/storage.py`); never a caller-chosen key or PUT.
- [ ] The gateway proxy refuses any path with an `internal` segment
      (`_private_path` in `services/gateway/src/routes/proxy.py`).

## Identity

- [ ] New owners and admin grants use immutable issuer/subject identities.
- [ ] Legacy accounts resolve only through the reviewed
      `IDENTITY_LEGACY_BINDINGS` alias mapping, never the email local part.

## Storage, documents, and share tokens

- [ ] S3 documents bucket keeps SSE-KMS, versioning, and TLS-only access.
- [ ] New object keys are `{node}/{version}` with no owner (`_key` in
      `services/gateway/src/storage.py`); authorization is decided in SQL
      (`_access`), never by key prefix; reads use the version row's
      `object_key`, so legacy `{owner}/{node}/{version}` objects and their
      metadata rows are never rewritten.
- [ ] The only malware gate is the documents-bucket policy
      (`DenyReadOfInfectedDocuments` in
      `infra/terraform/modules/persistent/s3.tf`): it denies reads of
      `THREATS_FOUND` objects, unscanned objects are served, there is no
      gateway gate yet, and local MinIO has none. New key prefixes stay inside
      that bucket policy.
- [ ] Share/verify tokens are single-purpose, unguessable, expiring, and leak
      nothing beyond their purpose.
- [ ] Storage authorization is enforced server-side, not just in the UI.

## PII and logging

- [ ] Aadhaar full digits exist only as `aadhaar_vault` ciphertext
      (`services/api/src/aadhaar.py`) and in an owner-opted kept card image
      (`docs/runbooks/aadhaar-kms-rollout.md`); no API returns more than the
      last 4, and no new column, response, log, fixture or file name holds
      full digits (`scripts/aadhaar-digits-tests.ts` guards tracked files).
- [ ] Every upload is filed under Documents (invariant 8); a file name says
      whose it is, never the Aadhaar number.
- [ ] No Aadhaar digits, phone numbers, or document contents in application
      logs or error responses.
- [ ] Consent/withdrawal rules are respected for uploads, readings, and
      messages; `CONSENT_STRICT` behavior is not weakened.

## Input handling

- [ ] SQL uses parameterized queries; no string-built queries from user input.
- [ ] User/external content is validated before it reaches logs, shell, SQL, or
      responses.
- [ ] File uploads respect size caps and MIME/type expectations.

## Secrets and config

- [ ] `CRON_SECRET` guards `/cron/inactivity-check`; the endpoint is not open
      without it.
- [ ] No secrets, keys, or `.env`/`.local` material added to tracked files.
- [ ] New dependencies are pinned and from known, maintained sources.

## Needs human sign-off (flag, do not mark done)

- [ ] Production identity mapping applied and verified.
- [ ] DPDP consent capture and any parental-consent requirements.
- [ ] Backup/restore drill evidence recorded.
- [ ] Aadhaar vault retention change (pending Reddy's compliance review,
      `docs/compliance/gdpr-dpdp.md`).
- [ ] Aadhaar KMS rollout approval gates, production legacy-ciphertext clear
      and vault isolation options (`docs/runbooks/aadhaar-kms-rollout.md`).
