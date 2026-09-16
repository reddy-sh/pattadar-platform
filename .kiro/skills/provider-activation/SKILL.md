---
name: provider-activation
description: Use this skill when preparing, reviewing, enabling, rotating, or disabling Pattadar external providers and credentials—Cognito/social IdP, SES/email, SMS/WhatsApp, Razorpay/webhooks, Anthropic/model catalog, maps/public-record connections, push notifications, or mobile/store credentials.
compatibility: Requires provider configs/runbooks and security/compliance review. Default is static checklist; secret changes, network calls, sandbox/live activation, DNS/webhooks, or production enablement require explicit approval.
metadata:
  project: pattadar-platform
  standard: agentskills.io
  verified: "2026-09-16"
---

# Provider Activation

Treat activation as a reversible, evidence-backed rollout—not an environment
variable flip. Code readiness, credentials, legal/vendor review, sandbox proof,
and production enablement are separate states.

## Workflow

1. Read `references/provider-matrix.md`; identify environment, provider owner,
   data/PII sent, credentials/secrets, endpoints/webhooks/DNS, quotas/cost,
   retry/idempotency, monitoring, and rollback/disable switch.
2. Confirm code defaults fail closed/stub/off and that missing credentials do
   not silently enable partial behavior.
3. Require sandbox/test evidence, signature/token verification, rate limits,
   secret storage/rotation, DPA/legal review where applicable, health/alert
   visibility, and user-facing fallback.
4. Present exact activation steps and verification/rollback; wait for explicit
   environment-specific approval before live calls or secret/config mutation.
5. Feed applied evidence to `release-readiness` and security-sensitive changes
   to `security-review`/`secret-scan`.

Never print secrets, switch test to live silently, replay non-idempotent provider
calls, or claim organizational/legal review from code alone.
