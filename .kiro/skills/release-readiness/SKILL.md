---
name: release-readiness
description: Use this skill when preparing, reviewing, or deciding whether a Pattadar revision is ready to release, deploy, promote, or cut over; when checking preflight/migration/rollback evidence; or when producing a production go/no-go assessment for an exact SHA.
compatibility: Requires pattadar-platform release workflows and runbooks. Live GitHub/AWS checks or deployment require separate explicit approval.
metadata:
  project: pattadar-platform
  standard: agentskills.io
  verified: "2026-09-16"
---

# Release Readiness

Assess gaps before a final SHA exists, or decide readiness for one exact revision.
A GO/NO-GO verdict requires the full 40-character SHA; exploratory preparation
may produce a gap plan without pretending a revision was assessed. Local success
alone is never production readiness; external migration, IAM, provider, restore,
and rollback evidence must be distinguished from code that merely exists.

## Workflow

1. If producing a GO/NO-GO verdict, identify the full 40-character SHA,
   environment, intended web origin, and release window; reject an obsolete main
   revision. For early preparation, state that the result is a gap analysis and
   list the SHA-dependent evidence still unavailable.
2. Read `references/evidence-matrix.md` and gather evidence for that exact SHA
   when one exists.
3. Require relevant outputs from `verify-change`, `security-review`, and
   `secret-scan`; do not duplicate their procedures.
4. Confirm migration/preflight artifacts are complete, private, fresh, and
   SHA-matched without printing owner inventories or PII.
5. Explain rollback boundaries: service/web rollback does not reverse schema or
   data migrations; `rollback-incomplete` is an incident.
6. Produce a go/no-go table with blocker, evidence, owner, and next action.

## Safety

Read repository evidence only by default. Before any GitHub/AWS call, artifact
download, image build/push, workflow dispatch, or `deploy-release.py --execute`,
show the exact SHA/environment/command/effects and wait for explicit approval.
Production mutation requires a separate confirmation immediately before action.
Never print private preflight contents.
