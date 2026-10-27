# Platform Lifecycle Safety Matrix

| Operation | Default posture | Required evidence/approval |
|---|---|---|
| Inspect scripts/Terraform/runbooks | proceed read-only | environment/scope stated |
| `terraform fmt -check` | local validation | no live state |
| `terraform init -backend=false` | ask first | provider download + `.terraform` writes |
| Terraform plan (both roots) | ask first; required before up/down | account/profile, env, region, live-state read, the script's `TF_VAR_*` |
| Platform up | high risk | reviewed plans, the five `/pattadar/<env>/*` SSM SecureStrings present (out of band), snapshot choice, health/rollback plan, release re-pin hand-off |
| Platform down | high risk | reviewed plans, final snapshot, parking class, prod SPA bucket state, Reddy types the guard |
| S3 thaw/restore | high risk | object scope, class, time/cost, scan implications (`s3-thaw.md`) |
| RDS restore / drill | high risk | snapshot, scratch target, reconciliation, rollback (`rds-restore-drill.md`); `recovery-drill.py` default = AWS reads (ask first), `--execute` modes = fresh confirmation; evidence packaging via compliance-evidence |
| State surgery/manual delete | prohibited | escalate to Reddy; drill scratch instance only via Reddy or `recovery-drill.py --execute --cleanup` |

## Guards per path

| Path | Guard | Bypass the agent never uses |
|---|---|---|
| `Platform down` workflow, prod | `confirm` input `decommission-prod` (`platform-down.yml:14-35`) | passing that string itself |
| `scripts/platform-down.sh` locally | type the env name at the prompt (`:81-87`); no `decommission-prod` check | `PLATFORM_DOWN_CONFIRM=yes` |
| `scripts/platform-up.sh` | exits 1 on pending SNS confirmations (`:184-195`) | `ALLOW_PENDING_ALARMS=1` |

## Authority order

1. `scripts/platform-{up,down}.sh` and the `platform-{up,down}.yml` workflow
   inputs/guards.
2. `docs/runbooks/up-down.md`, `s3-thaw.md`, `rds-restore-drill.md` and
   `scripts/recovery-drill.py`. `up-down.md` was realigned with the scripts on
   26/10/2026 (SSM check, `force_destroy` caveat, SNS exit) except its smoke
   step, which still says `http://`; report drift through runbook-consistency.
3. Terraform modules/env roots.
4. `infra/terraform/README.md` only when consistent.

Stale text, do not follow: `modules/runtime/rds.tf:44-45` and
`modules/runtime/variables.tf:129` say down runs a targeted apply.
Authoritative: `platform-down.sh:89-119` (full apply, no `-target`) and
`up-down.md` § "The deletion-protection flip, explained".
