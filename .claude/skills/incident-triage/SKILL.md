---
name: incident-triage
description: "Use this skill to diagnose a Pattadar prod, dev or local incident and pick the safest next check: 'production is down', /api 502/504 or 4xx/5xx, an error after deploy, a stuck extraction or release, an unreadable upload, personal-data exposure or cross-account access, an unhealthy service or University site, a provider/payment failure. Diagnosis only. Not for release GO/NO-GO (release-readiness) or running up/down/restore (platform-lifecycle)."
compatibility: Requires pattadar-platform runbooks and logs. Repository analysis is default; live AWS/GitHub/provider/log/data queries, containment and remediation require Reddy's explicit approval.
metadata:
  project: pattadar-platform
  standard: agentskills.io
  verified: "2026-10-26"
---

# Incident Triage

Work outside-in and read-only first. Correlate one request, release, account-safe
identifier, or time window rather than issuing speculative retries.

Also covers 'we have an incident', failed extractions, rolled-back releases, auth/account isolation and restore/alert problems, ahead of engineering:incident-response and engineering:debug. Not this skill: row/object backfills (safe-data-migration) or errors met while building a feature (delivery skills).

## Workflow

1. Establish environment (prod, dev, or local), start time, affected flow,
   blast radius, release SHA, and whether logs/evidence may contain PII.
2. If personal data may be exposed, altered or lost, including a user seeing
   another account's record, follow `docs/runbooks/incident-response.md` first:
   treat it as confirmed until disproven, start the `incidents/` log, propose
   containment (credential revoke, `account_access_blocks` freeze, Cognito
   global sign-out) as approval-gated steps before diagnosis, and tell Reddy
   the DPDP/GDPR notification clock is already running.
3. Check whether the runtime is up or parked. `scripts/platform-down.sh`
   destroys the whole runtime layer (`infra/terraform/modules/runtime`: ALB,
   ECS, RDS, alarms, log groups, SPA CloudFront), so a fully parked env gives
   no answer; the SPA still served with `/api/*` 502 means the runtime is only
   partly present (`docs/architecture/2026-09-21-dynamodb-migration-review.md`
   records prod in that state). Neither is a new outage; report a partial
   state to Reddy. Use repo evidence first; `terraform output` or an ECS
   describe needs approval. Bring-up goes to `platform-lifecycle` plus
   `cloud-cost-governance` under Reddy's approval.
   University (`infra/terraform/envs/prod/university`) is a separate always-on
   stack that parking does not touch.
4. Read `references/symptom-routing.md` and the matching runbook.
5. Build a timeline and trace the affected path: platform edge → ALB → gateway
   → API/assistant → provider → storage/database; University is CloudFront →
   S3 only; local is the `scripts/start-local.sh` processes. Separate
   observations from hypotheses.
6. Propose the smallest discriminating check. Before any live AWS, GitHub,
   provider, log or data query, show scope, environment, exact command, side
   effects, data exposed, reversibility and expected evidence; wait for Reddy's
   approval.
7. Produce findings, ranked hypotheses, next check, safe mitigation options,
   containment status, notification decision (needed, not needed, or Reddy to
   decide), escalation owner, and evidence to preserve.

## Non-negotiable incident rules

Never retry a non-idempotent AI or payment operation (an extraction POST is
one), expose PII in logs/output, delete stuck Terraform/cloud resources
manually, manipulate state, or call a `deploying` or `rollback-incomplete`
release successful. Containment, deployment, rollback, restart, failover, thaw,
restore, and deletion are separate remediation steps: each needs its own
approval packet and a fresh confirmation from Reddy immediately before it runs;
an earlier approval does not carry over. Suspected vulnerabilities escalate to
`pattadar-security-review` and the private reporting route in `SECURITY.md`.
