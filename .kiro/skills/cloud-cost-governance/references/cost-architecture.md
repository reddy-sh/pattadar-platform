# Static Cost Architecture Reference

Verified from repository configuration on 2026-09-16; values are directional,
not live billing.

## Runtime

- RDS PostgreSQL 17 defaults to `db.t4g.micro`, 20 GiB gp3, single-AZ, 7-day
  backups; down cycles create final manual snapshots.
- Prod config runs gateway/API/assistant Fargate tasks (ARM64, default 0.5 vCPU /
  1 GiB) with public IPv4 instead of NAT. A separate web service is declared but
  `web_desired_count` is zero until cutover.
- ALB bills while runtime exists even with zero tasks. Prod enables CloudFront/
  WAF; dev disables them. Log retention is 365 days prod / 30 days dev.
- Repository comments estimate public IPv4 around $3.60/task/month, avoided NAT
  around $35/gateway/month, and disabled Container Insights around $18/month
  across environments. Revalidate before decisions.

## Persistent/parked

KMS, documents/log/CloudTrail S3, ECR, Secrets Manager, Cognito, DNS/SES,
CloudTrail/Config/GuardDuty, and OIDC survive runtime down. Documents move to
STANDARD_IA after 90 days; noncurrent versions expire after 180 by default;
parking defaults to Deep Archive (dev overrides Glacier IR). ECR keeps 10 images
and access/audit logs expire after 400 days. Historical parked estimate is
$3–4/month in ap-south-1; minimum-storage/restore/scan effects matter.

## Usage-variable and controls

Traffic, WAF/S3 requests, logs, malware scans, Config, and Anthropic calls need
usage data. Controls include no NAT, ARM64, disabled Container Insights, storage
lifecycles, bucket keys, ECR retention, and singleton ownership.

Prefer `docs/runbooks/up-down.md`; never use stale targeted-apply down guidance.
