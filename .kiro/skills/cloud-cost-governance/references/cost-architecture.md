# Static Cost Architecture Reference

Verified from repository configuration on 09/10/2026, and the runtime on
26/10/2026 (Design A, code only); values are directional, not live billing.

## Root classes

- `envs/<env>/persistent` survives parking; `envs/<env>/runtime` is created and
  destroyed by `scripts/platform-up.sh` / `scripts/platform-down.sh`.
- `envs/prod/university` (no dev twin) is a standalone, always-on stack: its own
  S3 bucket, CloudFront, optional WAF (us-east-1, `enable_waf`, off since
  25/10/2026), ACM and Cognito client, reading prod
  persistent outputs; `deploy-university.yml` publishes its site (no Terraform).
  Up/down never touch it, so it is a separate cost line that keeps billing while
  prod is parked.

## Runtime

- RDS PostgreSQL 17 defaults to `db.t4g.micro`, 20 GiB gp3, single-AZ, 7-day
  backups; down cycles create final manual snapshots.
- Gateway, api and assistant run as ECS tasks on **one EC2 host**
  (`instance_type` default `t4g.medium`, ECS-optimized AL2023 arm64, unlimited
  CPU credits), each held to 512 CPU / 1024 MiB. The host has a public IPv4
  for egress instead of NAT. There is no ALB and no Fargate.
- CloudFront VPC origins put the host behind two distributions: the SPA
  distribution (prod; dev tfvars disable it) and the api distribution, which
  exists in every env. WAF is off until launch (since 25/10/2026).
- The `web` ECS service, task, target group and log group were removed on
  26/10/2026. The persistent `web` ECR repository remains, and `web_origin`
  must stay `spa`.
- Estimate (`docs/specs/2026-10-26-one-server-runtime.md`): about
  $48.59/month on demand, including RDS. That is about $50.19 until the 4
  unused Secrets Manager containers are deleted, about $44 with a 1-yr Compute
  Savings Plan on the instance (rate unverified), and about $70 at 1k users
  with the launch WAF. The 1-yr RDS RI ($0.0165/h) saves about $3.28.
  Unlimited credits can add up to $46.72 if both vCPUs stay pinned
  (`host-cpu-surplus-charged` alarm; Standard mode is the hard-cap fallback).
  The 11 alarms are one over the free 10.
- Service log retention is 30 days in both env roots (they override the
  module's 365 default; prod says revisit at launch).
  The RDS `postgresql` log export creates a log group Terraform does not manage
  (no retention in code, survives runtime destroy); include it in idle review.
- ECS services and task definitions are tagged, but no service sets
  `propagate_tags`, so tasks are untagged. Compute spend is the one tagged
  instance, not per service.
- Repository comments estimate the host's public IPv4 at around $3.6/month,
  avoided NAT at around $35/gateway/month, and disabled Container Insights at
  around $18/month across environments. Revalidate before decisions.

## Persistent/parked

KMS, documents/log/CloudTrail S3, ECR, Secrets Manager, Cognito, DNS/SES,
CloudTrail/Config/GuardDuty, and OIDC survive runtime down, and so do the
out-of-band SSM SecureStrings (standard tier, no charge). Six persistent
Secrets Manager secrets cost about $2.40/month, four of them unused since
26/10/2026; deleting those is a separate approved change. Documents move to
STANDARD_IA after 90 days; noncurrent versions expire after 180 by default;
parking defaults to Deep Archive (dev overrides Glacier IR). ECR keeps 10 images
and access/audit logs expire after 400 days. Historical parked estimate
(`docs/runbooks/up-down.md`) is about $5–6/month in ap-south-1 (about $4 after
the Secrets Manager cleanup), excluding University; minimum-storage/restore/scan
effects matter.

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

Traffic, WAF/S3 requests, logs, malware scans, Config, CPU surplus credits and
Anthropic calls need usage data. Controls include one shared host, no NAT,
ARM64, disabled Container Insights, storage lifecycles, bucket keys, ECR
retention, and singleton ownership. A $50 budget and an anomaly monitor exist
in persistent code (`modules/persistent/budgets.tf`) but are not applied.
Savings Plan and RI purchases are irreversible 1-year commitments for Reddy,
made only after the dev proof and a stable prod stretch.

## Down/up guidance

Authoritative: `scripts/platform-down.sh` (full apply, no `-target`),
`scripts/platform-up.sh` and `docs/runbooks/up-down.md`. Stale, do not follow:
the "targeted apply" comments on `deletion_protection` in
`modules/runtime/rds.tf` and `modules/runtime/variables.tf`.
