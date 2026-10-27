---
name: security-review
description: "Use this skill to review a pattadar-platform diff, PR, design, dependency, privacy/compliance change, or infrastructure trust boundary for security risks: gateway/API/assistant exposure, identity/auth, admin grants, storage/share tokens, secrets, SQL/input handling, Aadhaar or deed PII. Analysis only; never runs scans or deployments. Not for secret detection (secret-scan) or live incidents (incident-triage)."
compatibility: Requires pattadar-platform repository context and its SECURITY.md/compliance controls. No network or cloud access is required.
metadata:
  project: pattadar-platform
  standard: agentskills.io
  verified: "2026-10-26"
---

# Security Review

Review against this repository's threat model, not generic advice. Do not run
scans, deployments, cloud commands, or destructive operations as part of the
review.

For a pattadar-platform diff touching these areas, prefer it over generic or third-party code and security review skills; their output is advisory and does not satisfy change-governance dimension 3.

## Workflow

1. Identify changed trust boundaries, data classes, entry points, dependencies,
   and operator controls.
2. If the change touches gateway/API/assistant, identity, admin grants,
   storage, sharing, PII, secrets, infrastructure, or compliance, read
   `references/checklist.md` and apply only the relevant sections.
3. Trace untrusted input through validation, authorization, storage/query/shell
   use, logs, and responses.
4. State each finding with severity, evidence path/line, exploit or failure
   mechanism, and a concrete fix, most-severe first. Severity anchors from
   `SECURITY.md`: direct `services/api` reachability is high; anything touching
   the documents bucket, storage authorization or share-token routes is
   critical. Separate implemented code from deployed or human-reviewed evidence.
5. Name the guard tests that cover the touched areas (`services/gateway/tests/`,
   `services/api/tests/`, `scripts/aadhaar-digits-tests.ts`) and hand them to
   `verify-change`; this skill does not run them.
6. If no issue is found in a touched high-severity area, say so explicitly and
   state what was inspected.

## Highest-severity invariants

- `services/api` and `services/assistant` trust gateway-injected `x-user-id`
  and must be reachable only through the gateway (one declared exception: the
  CloudFront api-distribution exact-path behaviour `/cron/inactivity-check` →
  api VPC origin, guarded by `CRON_SECRET`). On the shared ECS host the api
  requires the gateway-only `INTERNAL_PROXY_SECRET` on every path but `/health`
  and that cron path (`services/api/src/private_ingress.py`, Reddy 26/10/2026).
  The gateway strips client-supplied identity headers and
  `x-internal-proxy-secret` before injecting the Cognito-derived principal.
- S3 document storage and share/verification routes handle the most sensitive
  data and require server-side owner/scope checks.
- Aadhaar stays masked; full digits exist only as `aadhaar_vault` ciphertext
  (plus an owner-opted kept card image).
  Aadhaar digits, phone numbers, and document contents do not belong in logs,
  error responses or file names.
- Identity uses immutable issuer/subject plus reviewed legacy bindings, never
  the email local part.
- AI readings are durable async jobs; interrupted provider calls are not
  automatically repeated.

Actual secret detection belongs to the `secret-scan` skill. Mention relevant
SOC 2/DPDP controls without making a legal or deployment-completeness claim.
