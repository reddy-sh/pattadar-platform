# Security review checklist (pattadar-platform)

Grounded in `SECURITY.md`, `docs/compliance/engineering-checklist.md`, and the
six key invariants in `.kiro/steering/pattadar-standards.md`. Review the items a
diff actually touches.

## Trust boundary (gateway ↔ api)

- [ ] `services/api` is never made reachable except through `services/gateway`
      (security groups: ALB→gateway only, gateway→api only).
- [ ] The gateway strips any client-supplied `x-user-id` before injecting the
      Cognito-derived value.
- [ ] Cognito access-token validation is intact: issuer check,
      `token_use == "access"`, `client_id` allowlist (not `aud`), required
      `email` claim.
- [ ] Super-admin / AI-model-admin routes fail closed: deny on missing or
      unknown role, never default-allow.

## Identity

- [ ] New owners and admin grants use immutable issuer/subject identities.
- [ ] Legacy accounts resolve only through the reviewed
      `IDENTITY_LEGACY_BINDINGS` alias mapping, never the email local part.

## Storage, documents, and share tokens

- [ ] S3 documents bucket keeps SSE-KMS, versioning, and TLS-only access.
- [ ] Object keys `{owner}/{node}/{version}` are used verbatim; metadata rows
      are not rewritten.
- [ ] Document availability stays gated on a clean malware-scan verdict where
      that gate exists.
- [ ] Share/verify tokens are single-purpose, unguessable, expiring, and leak
      nothing beyond their purpose.
- [ ] Storage authorization is enforced server-side, not just in the UI.

## PII and logging

- [ ] Aadhaar stays masked; full numbers never reach the UI.
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
