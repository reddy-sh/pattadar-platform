# Custodian Governance Reference

Verified on 09/10/2026 from `.github/workflows/governance.yml`, policy YAML,
`summarize.py`, and the governance OIDC role attachment in
`modules/persistent/github_oidc.tf`.

## Cadence and safety

- Daily `03:30 UTC` / `09:00 IST` plus manual dispatch.
- Workflow runs `ap-south-1`; CloudFront/WAF/ACM edge resources in `us-east-1`
  are not covered by that regional invocation.
- Code attaches `SecurityAudit`, not `ReadOnlyAccess` (which can read
  Terraform-state objects and ALB logs). The swap is pending in prod
  (`docs/specs/TODO-prod-persistent-pending.md`), so the live role may still
  hold `ReadOnlyAccess`. Policies have no actions; workflow uses `--dryrun`.
  Dry-run still contacts AWS.
- The workflow installs exact `c7n==0.9.52` and validates policies before
  assuming the role; an approved local run must do the same.
- Security findings fail the job and go to pattadar-security-review;
  cost/tagging remain report-only; hygiene and 90-day artifact upload run even
  after security failure.

## Policies

Cost: unattached EBS, unassociated EIP, manual RDS snapshots older than 180
days. That set includes `pattadar-<env>-pg-final-*` final snapshots, and the
newest per environment is the one platform-up restores: never a cleanup
candidate. Tagging: S3 missing both App and Project, RDS missing App, EC2
missing App. The documented App+Environment discipline is not enforced;
ECS/ELB/CloudFront/WAF/log/ECR coverage is absent.

Security: world-open sensitive SG ports, public/unencrypted RDS, S3 public block,
stale IAM keys, and CloudTrail not logging. The SG exclusion regex visibly
contains escaped apostrophes; treat matching semantics as unverified until a
focused local policy test proves them.

## Summary behavior

`summarize.py` counts each `**/resources.json` by policy directory. Fail mode
exits 1 only for nonzero totals; absent resource files look like zero findings,
so artifact existence/completeness must be checked separately. Resource details
remain in the private artifact.
