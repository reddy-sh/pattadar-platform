# Static Cost Architecture Reference

Verified from repository configuration on 09/10/2026; values are directional,
not live billing.

## Root classes

- `envs/<env>/persistent` survives parking; `envs/<env>/runtime` is created and
  destroyed by `scripts/platform-up.sh` / `scripts/platform-down.sh`.
- `envs/prod/university` (no dev twin) is a standalone, always-on stack: its own
  S3 bucket, CloudFront, WAF (us-east-1), ACM and Cognito client, reading prod
  persistent outputs; `deploy-university.yml` publishes its site (no Terraform).
  Up/down never touch it, so it is a separate cost line that keeps billing while
  prod is parked.

## Runtime

- RDS PostgreSQL 17 defaults to `db.t4g.micro`, 20 GiB gp3, single-AZ, 7-day
  backups; down cycles create final manual snapshots.
- Prod config runs gateway/API/assistant Fargate tasks (ARM64, default 0.5 vCPU /
  1 GiB) with public IPv4 instead of NAT. The `web` ECS service, ALB target
  group, ECR repository and log group are dormant leftovers of the removed
  Next.js client (`web_desired_count` 0, no image); removing them is a reviewed
  infrastructure-change because it touches CloudFront/ALB routing. `web_origin`
  must stay `spa` (`deploy.yml` passes `--web-origin spa`): `ecs` sends
  CloudFront's default behaviour to the ALB, whose default action is the empty
  web target group.
- ALB bills while runtime exists even with zero tasks. Prod enables CloudFront/
  WAF; dev tfvars disable them. Service log retention is 30 days in both env
  roots (they override the module's 365 default; prod says revisit at launch).
  The RDS `postgresql` log export creates a log group Terraform does not manage
  (no retention in code, survives runtime destroy); include it in idle review.
- ECS services and task definitions are tagged, but no service sets
  `propagate_tags`, so tasks are untagged: do not assume Fargate spend
  allocates by tag.
- Repository comments estimate public IPv4 around $3.60/task/month, avoided NAT
  around $35/gateway/month, and disabled Container Insights around $18/month
  across environments. Revalidate before decisions.

## Persistent/parked

KMS, documents/log/CloudTrail S3, ECR, Secrets Manager, Cognito, DNS/SES,
CloudTrail/Config/GuardDuty, and OIDC survive runtime down. Documents move to
STANDARD_IA after 90 days; noncurrent versions expire after 180 by default;
parking defaults to Deep Archive (dev overrides Glacier IR). ECR keeps 10 images
and access/audit logs expire after 400 days. Historical parked estimate
(`docs/runbooks/up-down.md`) is $3–4/month in ap-south-1, excluding University;
minimum-storage/restore/scan effects matter.

Parking is not only a cost lever. Prod down takes pattadar.com, www and the API
offline (runtime owns the SPA bucket, CloudFront and those DNS records), stops
the daily inactivity check that drives family dead-man's-switch escalation
(`modules/runtime/scheduler.tf`), and leaves documents in DEEP_ARCHIVE
unreadable until thawed (~12 h Standard, ~48 h Bulk; `docs/runbooks/s3-thaw.md`)
with a 180-day minimum charge. Dev parks to GLACIER_IR (instant reads) and has
no CDN. State these effects with any parking option.

## Recorded state (dated; not live)

- 21/09/2026 (`docs/architecture/2026-09-21-dynamodb-migration-findings.md`):
  prod ECS/ALB destroyed while the runtime-owned SPA CloudFront still serves.
  Prod is neither running nor cleanly parked; neither estimate applies without
  approved live inventory.
- 27/09/2026 (`docs/specs/TODO-prod-persistent-pending.md`): 24 prod persistent
  changes unapplied, including documents lifecycle rules, ECR lifecycle
  policies, CloudTrail selectors and the governance role attachment.

## Usage-variable and controls

Traffic, WAF/S3 requests, logs, malware scans, Config, and Anthropic calls need
usage data. Controls include no NAT, ARM64, disabled Container Insights, storage
lifecycles, bucket keys, ECR retention, and singleton ownership.

## Down/up guidance

Authoritative: `scripts/platform-down.sh` (full apply, no `-target`),
`scripts/platform-up.sh` and `docs/runbooks/up-down.md`. Stale, do not follow:
the "targeted apply" comments on `deletion_protection` in
`modules/runtime/rds.tf` and `modules/runtime/variables.tf`, and
`infra/terraform/README.md`'s Down park order (the script destroys, then parks)
and raw restore `terraform apply`.
