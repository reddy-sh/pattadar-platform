# Governance — Cloud Custodian

Report-only policy-as-code sweeps over the AWS account, run daily (09:00 IST)
by [.github/workflows/governance.yml](../../.github/workflows/governance.yml)
via the read-only OIDC role `pattadar-github-governance` (AWS-managed
`ReadOnlyAccess` — no write permissions exist in this path).

## Posture

**Report-only.** Policies carry **no actions** — findings appear in the
workflow step summary and as a downloadable artifact; security findings fail
the job so they're impossible to miss. Remediation is a human decision.
Auto-remediation (Custodian actions / Lambda mode) is a deliberate later step,
after the report cadence has earned trust.

## Policy files

| File | What it catches | On findings |
|---|---|---|
| `policies/security.yml` | SGs open to world on 22/3389/5432/8080, public/unencrypted RDS, buckets without public-access block, stale IAM access keys (>90d), CloudTrail stopped | **job fails** |
| `policies/cost.yml` | Unattached EBS, unassociated EIPs, manual RDS snapshots >180d | report |
| `policies/tagging.yml` | Resources missing `App` tag (Resource Groups / cost allocation depend on it) | report |

## Local run

```sh
pip install c7n
custodian validate governance/custodian/policies/*.yml
custodian run -s out --region ap-south-1 --dryrun governance/custodian/policies/*.yml
python3 governance/custodian/summarize.py out
```

## Baseline (first sweep, 25/07/2026)

Pattadar resources: **clean**. Pre-existing account findings, for cleanup:
11 old `launch-wizard-*` security groups in `vpc-05a8764ebbcdabfb6` with SSH
open to the world (prior EC2 experiments), 1 stale IAM access key
(`reddy.sh-aws-cli` — rotate or move to SSO), 1 legacy bucket without its own
public-access block (account-level block covers it), 5 untagged pre-pattadar
buckets. Account-hygiene noise from non-pattadar resources is expected in a
shared account; scope filters can be added if it gets loud.
