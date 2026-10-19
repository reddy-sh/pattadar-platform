---
name: provider-activation
description: "Use this skill when preparing, reviewing, enabling, rotating, or disabling Pattadar external providers and credentials: Cognito/social IdP, Resend or Cognito/SES email, SMS/WhatsApp, Razorpay/webhooks, Anthropic or another model provider, maps/geocoding and public-record connections, browser push (VAPID), or mobile/store credentials. Not for writing provider or webhook code (backend-contract-change) or Terraform edits (infrastructure-change)."
compatibility: Requires provider configs/runbooks and security/compliance review. Default is static checklist; secret changes, network calls, sandbox/live activation, DNS/webhooks, or production enablement require explicit approval.
metadata:
  project: pattadar-platform
  standard: agentskills.io
  verified: "2026-10-09"
---

# Provider Activation

Treat activation as a reversible, evidence-backed rollout—not an environment
variable flip. Code readiness, credentials, legal/vendor review, sandbox proof,
and production enablement are separate states.

Not this skill: Terraform IdP resources or secret wiring (infrastructure-change), SDK or version bumps (dependency-change), secret scanning (secret-scan), or a security-only review (pattadar-security-review).

## Workflow

1. Read `references/provider-matrix.md` (it names where each provider lives);
   identify environment, provider owner, data/PII sent, credentials/secrets,
   endpoints/webhooks/DNS, quotas/cost, retry/idempotency, monitoring, and
   rollback/disable switch. When a provider has no runbook, draft one through
   `runbook-consistency` before enablement.
2. Confirm code defaults fail closed or off (stubs succeed only in local/test)
   and that missing credentials do not silently enable partial behavior.
3. Require sandbox/test evidence, signature/token verification, rate limits,
   secret storage/rotation, DPA/legal review where applicable, health/alert
   visibility, and user-facing fallback.
4. Default to a static checklist. Before any secret change, network or sandbox
   call, live activation, DNS/webhook change or production enablement, present
   scope, environment, exact command, side effects, data exposure,
   reversibility, expected evidence, and verification/rollback; then wait for
   Reddy's explicit, environment-specific approval. Get a fresh confirmation
   immediately before each high-risk mutation, such as live payments,
   production enablement or key rotation.
5. Feed applied evidence to `release-readiness`, security-sensitive changes to
   `pattadar-security-review`/`secret-scan`, DPA and vendor evidence to
   `compliance-evidence`, and processor-register updates
   (`docs/compliance/gdpr-dpdp.md`, `soc2-controls.md`) to
   `runbook-consistency`.

Never print secrets, switch test to live silently, replay non-idempotent provider
calls, or claim organizational/legal review from code alone.
