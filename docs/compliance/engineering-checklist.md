# Privacy & Security Engineering Checklist

Concrete work items tied to this codebase. Phase tags are historical planning labels. A checked implementation item is not evidence of production deployment or a legal compliance determination. Updated 12 September 2026.

## Done (in the ported code)

- [x] Aadhaar masking — `_mask_aadhaar` in services/api; full number never returned to the UI
- [x] Token-based beneficiary/member verification — invite tokens, `verify/:token` landing, no manual status flips
- [x] `CRON_SECRET` guard on `/cron/inactivity-check` (secret from AWS Secrets Manager, not k8s secret)
- [x] Notification provider seam with stub default — email/WhatsApp/SMS env-gated, records to `notification_log`; no real sends without credentials

## Gateway / trust boundary

- [x] [phase-1] **Strip inbound `x-user-id` at the gateway.** The api trusts this header unconditionally — the gateway must delete any client-supplied value before injecting the Cognito-derived one, and the api must never be exposed directly (security-group: ALB→gateway only, gateway→api only)
- [x] [phase-1] Cognito access-token validation contract: issuer check, `token_use == "access"`, `client_id` allowlist (NOT `aud`), `email` claim required (added by the pre-token-generation trigger)
- [x] New owners and admin grants use immutable issuer/subject identities; legacy accounts require an explicit reviewed alias mapping, with inventory/collision checks. [Migration runbook](../runbooks/identity-migration.md).
- [ ] Apply and verify the approved production identity mapping before release.
- [x] [phase-1] Fail-closed super-admin checks on AI/model admin routes — deny on missing/unknown role, never default-allow
- [ ] [phase-2] Rate limiting at the gateway (per-user + per-IP), tightest on auth-adjacent and extraction endpoints
- [x] [phase-2] Review share-token routes (`verify/:token` and any document-share links) — unauthenticated **by design**; confirm tokens are single-purpose, unguessable, expiring, and leak nothing beyond their purpose

## Data protection

- [ ] [phase-1] KMS CMK for RDS and the S3 documents bucket (SSE-KMS, key rotation on) — Terraform
- [ ] [phase-1] TLS-only everywhere: S3 bucket policy denies non-TLS, ALB HTTPS-only listener, CloudFront minimum TLS 1.2
- [ ] [phase-2] GuardDuty Malware Protection for S3 on the documents bucket, and **gate document availability on scan verdict** — uploaded objects are not servable/extractable until scanned clean
- [ ] [phase-2] Per-user storage quotas in the gateway document-storage API
- [ ] [phase-2] Log PII scrubbing — no Aadhaar digits, phone numbers, or document contents in application logs

## Audit & data-subject rights

- [x] [phase-1] Port the predecessor's audit-trail writer into services/api (`audit_events` table; who/what/when on data mutations)
- [x] Account-wide authenticated JSON export, including owner-scoped rows, file manifest and assistant data; fails if a component cannot be exported.
- [x] Durable erasure receipt and operator executor cover API rows, storage metadata, all S3 versions/delete markers, assistant data and linked Cognito identities. Unresolved payments block erasure before any deletion. [Runbook](../runbooks/account-data.md). Production execution and retention approvals remain operational work.
- [x] Email signup directs users to itemised account choices with version/time history. Explicit withdrawals block affected uploads, readings and live service messages; queued readings recheck before provider calls. Existing clients without recorded choices remain compatible, and that grace is closable: `CONSENT_STRICT=1` turns a missing row into a refusal once the backfill in the [runbook](../runbooks/account-data.md) is done.
- [ ] Complete native/social first-use consent presentation and obtain the required policy review; account settings are available on web.
- [ ] [phase-2] DPDP consent capture — explicit consent at ID-document upload, and **verifiable parental consent** recorded when a guardian adds a minor member
- [x] `/privacy` and `/terms` contain product notices in English and Telugu; operator identity, contact ownership and legal review remain pre-launch work.

## Operations

- [ ] [phase-2] Backup-restore test — restore RDS snapshot to a scratch instance, verify row counts + a document round-trip; record evidence, repeat quarterly
