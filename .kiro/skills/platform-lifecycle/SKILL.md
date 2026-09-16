---
name: platform-lifecycle
description: Use this skill for operating Pattadar's existing Terraform/platform lifecycle: platform up/down, parking/thaw, runtime recreation, RDS snapshot restore mechanics, or recovery from an interrupted lifecycle operation. Use infrastructure-change for Terraform design/code changes, cloud-cost-governance for spend, and safe-data-migration for row/object reconciliation.
compatibility: Requires pattadar-platform Terraform/scripts/runbooks. Static analysis is default; init/plan, AWS, workflow dispatch, apply/destroy, parking, thaw, and restore require explicit approval.
metadata:
  project: pattadar-platform
  standard: agentskills.io
  verified: "2026-09-16"
---

# Platform Lifecycle

Use repository scripts/runbooks, not ad-hoc Terraform/AWS commands. Identify dev
or prod and persistent versus runtime scope before proposing anything.

## Workflow

1. Read `references/safety-matrix.md` and `docs/runbooks/up-down.md`.
2. Explain effects: persistent resources survive; runtime is recreated/destroyed;
   down takes a final RDS snapshot; documents may move to cold storage.
3. Validate prerequisites and ordering (persistent before runtime, secrets,
   snapshot selection, cold-object state, post-up health/alerts).
4. For interrupted operations, prefer rerunning the same idempotent script over
   manual deletion/state surgery.
5. Show exact command/environment/effects/rollback and wait for approval at each
   live or mutating boundary.

## Hard boundaries

Never use targeted apply for the down flow, manually delete cloud resources,
edit Terraform state, auto-thaw objects, or bypass the production
`decommission-prod` confirmation. `init`/`plan` can contact networks/live state
and require approval; apply/destroy/workflow dispatch/parking/thaw/restore are
high-risk and require a fresh explicit confirmation.

Use `cloud-cost-governance` for report-only spend analysis and `verify-change`
for Terraform format/validate after source edits.
