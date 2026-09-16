---
name: security-review
description: Use this skill to review a pattadar-platform diff, PR, design, dependency, privacy/compliance change, or infrastructure trust boundary for security risks—especially gateway/API exposure, identity/auth, storage/share tokens, secrets, SQL/input handling, and Aadhaar or deed PII. This is analysis only, not a scan or deployment.
compatibility: Requires pattadar-platform repository context and its SECURITY.md/compliance controls. No network or cloud access is required.
metadata:
  project: pattadar-platform
  standard: agentskills.io
  verified: "2026-09-16"
---

# Security Review

Review against this repository's threat model, not generic advice. Do not run
scans, deployments, cloud commands, or destructive operations as part of the
review.

## Workflow

1. Identify changed trust boundaries, data classes, entry points, dependencies,
   and operator controls.
2. If the change touches gateway/API, identity, storage, sharing, PII, secrets,
   infrastructure, or compliance, read `references/checklist.md` and apply only
   the relevant sections.
3. Trace untrusted input through validation, authorization, storage/query/shell
   use, logs, and responses.
4. State each finding with severity, evidence path/line, exploit or failure
   mechanism, and a concrete fix. Separate implemented code from deployed or
   human-reviewed evidence.
5. If no issue is found in a touched high-severity area, say so explicitly and
   state what was inspected.

## Highest-severity invariants

- `services/api` trusts `x-user-id` and must be reachable only through the
  gateway; the gateway strips client-supplied identity before injecting the
  Cognito-derived principal.
- S3 document storage and share/verification routes handle the most sensitive
  data and require server-side owner/scope checks.
- Aadhaar stays masked; Aadhaar digits, phone numbers, and document contents do
  not belong in logs or error responses.
- Identity uses immutable issuer/subject plus reviewed legacy bindings, never
  the email local part.
- AI readings are durable async jobs; interrupted provider calls are not
  automatically repeated.

Actual secret detection belongs to the `secret-scan` skill. Mention relevant
SOC 2/DPDP controls without making a legal or deployment-completeness claim.
