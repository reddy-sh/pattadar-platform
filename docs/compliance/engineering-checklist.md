# Privacy & Security Engineering Checklist

Concrete work items tied to this codebase. Phase tags match the platform build plan.

## Done (in the ported code)

- [x] Aadhaar masking — `_mask_aadhaar` in services/api; full number never returned to the UI
- [x] Token-based beneficiary/member verification — invite tokens, `verify/:token` landing, no manual status flips
- [x] `CRON_SECRET` guard on `/cron/inactivity-check` (secret from AWS Secrets Manager, not k8s secret)
- [x] Notification provider seam with stub default — email/WhatsApp/SMS env-gated, records to `notification_log`; no real sends without credentials

## Gateway / trust boundary

- [ ] [phase-1] **Strip inbound `x-user-id` at the gateway.** The api trusts this header unconditionally — the gateway must delete any client-supplied value before injecting the Cognito-derived one, and the api must never be exposed directly (security-group: ALB→gateway only, gateway→api only)
- [ ] [phase-1] Cognito access-token validation contract: issuer check, `token_use == "access"`, `client_id` allowlist (NOT `aud`), `email` claim required (added by the pre-token-generation trigger)
- [ ] [pre-pilot] Pre-signup **email local-part collision guard** — reject/flag a signup whose local-part already maps to an existing user id; NEW users move to sub-based ids via a mapping table
- [ ] [phase-1] Fail-closed super-admin checks on AI/model admin routes — deny on missing/unknown role, never default-allow
- [ ] [phase-2] Rate limiting at the gateway (per-user + per-IP), tightest on auth-adjacent and extraction endpoints
- [ ] [phase-2] Review share-token routes (`verify/:token` and any document-share links) — unauthenticated **by design**; confirm tokens are single-purpose, unguessable, expiring, and leak nothing beyond their purpose

## Data protection

- [ ] [phase-1] KMS CMK for RDS and the S3 documents bucket (SSE-KMS, key rotation on) — Terraform
- [ ] [phase-1] TLS-only everywhere: S3 bucket policy denies non-TLS, ALB HTTPS-only listener, CloudFront minimum TLS 1.2
- [ ] [phase-2] GuardDuty Malware Protection for S3 on the documents bucket, and **gate document availability on scan verdict** — uploaded objects are not servable/extractable until scanned clean
- [ ] [phase-2] Per-user storage quotas in the gateway document-storage API
- [ ] [phase-2] Log PII scrubbing — no Aadhaar digits, phone numbers, or document contents in application logs

## Audit & data-subject rights

- [ ] [phase-1] Port the rhub audit-trail writer into services/api (`audit_events` table; who/what/when on data mutations)
- [ ] [phase-2] DSR export endpoint — me-scoped GraphQL export of all user rows + S3 document manifest
- [ ] [phase-2] Erasure cascade — pattadar DB rows + storage metadata + S3 objects **including all versions and delete markers** + Cognito user deletion (`AdminDeleteUser`); retention carve-outs for audit_events (see gdpr-dpdp.md)
- [ ] [pre-pilot] Consent capture at signup — itemised DPDP notice + recorded consent
- [ ] [phase-2] DPDP consent capture — explicit consent at ID-document upload, and **verifiable parental consent** recorded when a guardian adds a minor member
- [ ] Landing `/privacy` and `/terms` pages exist as stubs [done once the web agent lands]

## Operations

- [ ] [phase-2] Backup-restore test — restore RDS snapshot to a scratch instance, verify row counts + a document round-trip; record evidence, repeat quarterly
