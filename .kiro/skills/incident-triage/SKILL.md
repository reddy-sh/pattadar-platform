---
name: incident-triage
description: Use this skill to diagnose a Pattadar production, staging, or local incident—outage, 4xx/5xx/504, failed extraction, unreadable upload, auth/account isolation issue, stuck release, unhealthy service, payment/provider failure, or restore/alert problem—and identify the safest next check. Do not use it for planned release review, lifecycle execution, or migration execution.
compatibility: Requires pattadar-platform runbooks and logs. Repository analysis is default; live AWS/GitHub/provider/log queries and remediation require explicit approval.
metadata:
  project: pattadar-platform
  standard: agentskills.io
  verified: "2026-09-16"
---

# Incident Triage

Work outside-in and read-only first. Correlate one request, release, account-safe
identifier, or time window rather than issuing speculative retries.

## Workflow

1. Establish environment, start time, affected flow, blast radius, release SHA,
   and whether logs/evidence may contain PII.
2. Read `references/symptom-routing.md` and the matching runbook.
3. Build a timeline and trace edge → ALB → gateway → API/assistant → provider →
   storage/database. Separate observations from hypotheses.
4. Propose the smallest discriminating check. Before any live query, show exact
   command, region/environment, data exposed, and expected result; wait for
   approval.
5. Produce findings, ranked hypotheses, next check, safe mitigation options,
   escalation owner, and evidence to preserve.

## Non-negotiable incident rules

Never retry a non-idempotent extraction POST, expose PII in logs/output, delete
stuck Terraform/cloud resources manually, manipulate state, or call a pending/
`rollback-incomplete` release successful. Deployment, rollback, restart,
failover, thaw, restore, and deletion are separate approved remediation steps.
Suspected vulnerabilities escalate to `security-review`/private reporting.
