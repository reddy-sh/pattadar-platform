# Platform Lifecycle Safety Matrix

| Operation | Default posture | Required evidence/approval |
|---|---|---|
| Inspect Terraform/runbooks | proceed read-only | environment/scope stated |
| `terraform fmt -check` | local validation | no live state |
| `terraform init -backend=false` | ask first | provider download + `.terraform` writes |
| Terraform plan | ask first | account/profile, env, region, live-state read |
| Platform up | high risk | exact env, outputs/secrets, smoke/rollback plan |
| Platform down | high risk | final snapshot, parking class, prod typed guard |
| S3 thaw/restore | high risk | object scope, class, time/cost, scan implications |
| RDS restore | high risk | snapshot, scratch target, reconciliation, rollback |
| State surgery/manual delete | prohibited | use runbook/idempotent script/escalation |

## Authority order

1. `docs/runbooks/up-down.md` and current scripts.
2. `scripts/platform-{up,down}.sh` and workflow inputs/guards.
3. Terraform modules/env roots.
4. `infra/terraform/README.md` only when consistent; its old `-target` down
   snippet is stale and must not be used.
