---
name: platform-lifecycle
description: "Use this skill to operate Pattadar's existing Terraform platform lifecycle: platform up/down (scripts/platform-{up,down}.sh, docs/runbooks/up-down.md), parking and S3 thaw, runtime recreation, RDS snapshot restore and the restore drill, or recovering from an interrupted up/down. Not for Terraform design/code changes (infrastructure-change) or diagnosing an outage or failed run before anything is re-executed (incident-triage)."
compatibility: Requires pattadar-platform Terraform/scripts/runbooks. Static analysis is default; init/plan, AWS, workflow dispatch, apply/destroy, parking, thaw, and restore require explicit approval.
metadata:
  project: pattadar-platform
  standard: agentskills.io
  verified: "2026-10-09"
---

# Platform Lifecycle

Use repository scripts/runbooks, not ad-hoc Terraform/AWS commands. Identify dev
or prod and persistent versus runtime scope before proposing anything.
`infra/terraform/envs/prod/university` is a separate always-on root (own S3,
CloudFront, WAF, ACM, Cognito client; reads prod persistent outputs; site ships
via `deploy-university.yml`): up/down never touch it and it stays up while parked.

Not this skill: row/object reconciliation after a restore (safe-data-migration).

## Workflow

1. Read `references/safety-matrix.md`, `scripts/platform-{up,down}.sh` and
   `docs/runbooks/up-down.md`; for thaw or restore also `docs/runbooks/s3-thaw.md`,
   `docs/runbooks/rds-restore-drill.md` and `scripts/recovery-drill.py`.
2. Explain effects per environment. Persistent resources survive; the runtime is
   destroyed/recreated and down takes a final RDS snapshot. Prod down also takes
   pattadar.com and the API offline (runtime owns the SPA bucket, CloudFront and
   apex/www/api records), pauses the daily inactivity-check escalation
   (`modules/runtime/scheduler.tf`), and parks documents in DEEP_ARCHIVE (thaw
   ~12 h Standard / ~48 h Bulk, 180-day minimum charge). Dev parks in GLACIER_IR
   (no thaw) and runs without CDN (`dev.auto.tfvars`).
3. STOP and escalate to Reddy (no rerun, no hand fix) when:
   - `pattadar/<env>/db-app-password` is missing, empty or scheduled for
     deletion. It is a runtime secret (`modules/runtime/rds.tf:74`), so a down
     schedules it for deletion and up exits at step 3b on every rerun; never apply the remedy
     the script prints without approval.
   - prod down while the SPA bucket holds objects: no `force_destroy`
     (`modules/runtime/cloudfront.tf:12`), so destroy fails, parking never runs
     and every rerun fails the same way.
   - the approved `terraform plan` of both roots, run with the `TF_VAR_*` the
     script sets (restore snapshot for up, `deletion_protection=false` for
     down), shows any persistent change or an unexpected runtime
     create/replace. The scripts `-auto-approve`, so this plan is the only
     preview; route changes to infrastructure-change.
4. Smoke checks fail as written: `/health` reaches the ALB default action (the
   dormant web target group) and an anonymous `/api/gateway/pattadar/health` is
   rejected 401 by the gateway proxy. Judge health by the gateway and api
   target-group health and check pending SNS confirmations separately (approved
   AWS reads); never rerun on a smoke `FAIL` alone.
5. After an up, services run the mutable `*_image_tag` images, not the last
   release (`modules/runtime/ecs.tf:342-349`), and the prod SPA bucket is
   empty. Hand off to release-readiness to re-pin the last released SHA
   (separately approved) before calling the environment restored.
6. Outside the STOP cases, recover an interrupted run by rerunning the same
   script, never by manual deletion or state surgery.
7. Show exact command/environment/effects/rollback. One approval covers the
   whole script run; get it fresh immediately before execution.

## Running from Claude Code

`platform-down.sh` prompts with `read` under `set -e` and aborts without a TTY:
Reddy runs down himself (terminal or `Platform down` workflow) and types the
guard. If Reddy approves Claude running `platform-up.sh`, use
`run_in_background` and follow its output; a foreground Bash call times out
(2 minutes by default, 10 at most), stopping it
mid-apply. Never pipe or preset answers, set `PLATFORM_DOWN_CONFIRM` or
`ALLOW_PENDING_ALARMS`, or pass `decommission-prod` yourself.

## Hard boundaries

Never use targeted apply, manually delete cloud resources, edit Terraform
state, auto-thaw objects, or bypass the guard on any path (matrix). The drill's
scratch instance (`pattadar-restore-drill*`, outside Terraform) is deleted by
Reddy himself or by
`recovery-drill.py --execute --cleanup` (tag/ARN-checked) after a fresh
confirmation; never by a raw `aws rds delete-db-instance` from the agent.
`init`/`plan` and `recovery-drill.py`'s default mode read live state and need
approval; apply/destroy/workflow dispatch/parking/thaw/restore and the drill's
`--execute` modes are high-risk and need a fresh explicit confirmation.

Use `cloud-cost-governance` for report-only spend analysis and `verify-change`
for Terraform format/validate after source edits.
