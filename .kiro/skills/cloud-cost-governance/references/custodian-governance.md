# Custodian Governance Reference

Verified on 2026-09-16 from `.github/workflows/governance.yml`, policy YAML,
`summarize.py`, and the read-only OIDC role attachment.

## Cadence and safety

- Daily `03:30 UTC` / `09:00 IST` plus manual dispatch.
- Workflow runs `ap-south-1`; CloudFront/WAF/ACM edge resources in `us-east-1`
  are not covered by that regional invocation.
- OIDC role has `ReadOnlyAccess`; policies have no actions; workflow uses
  `--dryrun`. Dry-run still contacts AWS.
- Security findings fail; cost/tagging remain report-only; hygiene and 90-day
  artifact upload run even after security failure.

## Policies

Cost: unattached EBS, unassociated EIP, manual RDS snapshots older than 180
days. Tagging: S3 missing both App and Project, RDS missing App, EC2 missing App.
The documented App+Environment discipline is not enforced; ECS/ELB/CloudFront/
WAF/log/ECR coverage is absent.

Security: world-open sensitive SG ports, public/unencrypted RDS, S3 public block,
stale IAM keys, and CloudTrail not logging. The SG exclusion regex visibly
contains escaped apostrophes; treat matching semantics as unverified until a
focused local policy test proves them.

## Summary behavior

`summarize.py` counts each `**/resources.json` by policy directory. Fail mode
exits 1 only for nonzero totals; absent resource files look like zero findings,
so artifact existence/completeness must be checked separately. Resource details
remain in the private artifact.
