# Terraform — Pattadar AWS Platform

Infrastructure for the Pattadar platform on AWS `ap-south-1`. The reusable
`modules/app-stack` module is the per-app template: `envs/prod` and `envs/dev`
instantiate it for Pattadar; future apps instantiate it again with a different
`app_name`.

## Layout

```
infra/terraform/
  modules/app-stack/   # reusable per-app baseline (KMS, S3, ECR, RDS, secrets, observability, scheduler)
  envs/prod/           # pattadar prod instantiation
  envs/dev/            # thin dev variant (smaller retention; Aurora Serverless v2 min-0 is a TODO option)
```

## Bootstrap (one time)

1. Create the state bucket (see `envs/prod/backend.tf` for exact commands):
   S3 bucket `pattadar-terraform-state-<ACCOUNT_ID>`, versioning on, public
   access blocked. Terraform >= 1.10 uses native S3 lockfile locking
   (`use_lockfile = true`) — no DynamoDB table.
2. Uncomment the backend block in `envs/<env>/backend.tf`, fill the bucket name.
3. `cd envs/prod && terraform init`.

## Apply order

1. `terraform apply` in `envs/prod` (or `envs/dev`) — creates KMS, S3, ECR,
   RDS, secrets, log groups, SNS, scheduler.
2. Fill the placeholder secrets (values are never in Terraform):
   ```
   aws secretsmanager put-secret-value --secret-id pattadar/prod/anthropic-api-key --secret-string '...'
   aws secretsmanager put-secret-value --secret-id pattadar/prod/cron-secret      --secret-string '...'
   aws secretsmanager put-secret-value --secret-id pattadar/prod/auth0-config     --secret-string '{...}'
   aws secretsmanager put-secret-value --secret-id pattadar/prod/notify-providers --secret-string '{...}'
   ```
3. Re-apply with the cron secret wired into the EventBridge connection:
   ```
   export TF_VAR_cron_secret_header_value="$(aws secretsmanager get-secret-value \
     --secret-id pattadar/prod/cron-secret --query SecretString --output text)"
   terraform apply
   ```
4. Push images to the ECR repositories (`pattadar/api`, `pattadar/gateway`,
   `pattadar/assistant`).
5. TODO(Phase 1): enable the stubbed VPC / ALB+ECS / CloudFront+WAF /
   GuardDuty / Route53+ACM blocks (see `modules/app-stack/stubs.tf`), then set
   `api_base_url` to the real hostname and re-apply.

## Key variables (module `app-stack`)

| Variable | Default | Purpose |
| --- | --- | --- |
| `app_name` | — | Resource prefix; one instantiation per app |
| `environment` | — | `dev` / `prod` |
| `db_instance_class` | `db.t4g.micro` | RDS size |
| `db_allocated_storage` | `20` | RDS gp3 storage (GiB) |
| `db_engine_version` | `17` | PostgreSQL major version (minor auto-upgraded) |
| `noncurrent_version_expiration_days` | `180` | Documents-bucket old-version expiry |
| `log_retention_days` | `365` | CloudWatch retention (1-year SOC 2 / DPDP baseline) |
| `api_base_url` | placeholder | Target of the daily cron schedule |
| `cron_secret_header_value` | placeholder, sensitive | `x-cron-secret` header; supply at apply time from Secrets Manager |
| `ecr_keep_last_images` | `10` | ECR lifecycle policy |

## Real vs stubbed

Real (syntactically complete, ready to apply once CI validates):

- KMS CMK (rotation on) + alias; key policy admits CloudWatch Logs
- S3 documents bucket — SSE-KMS (CMK), versioned, all public access blocked,
  TLS-only policy, lifecycle (current → STANDARD_IA at 90d, noncurrent expire),
  access logging to a separate SSE-S3 logs bucket (400-day expiry)
- ECR repos for api/gateway/assistant — scan on push, keep last 10 images
- RDS PostgreSQL 17 — CMK-encrypted gp3, 7-day backups, deletion protection,
  final snapshot, not public, `postgresql` log export, RDS-managed master password
- Secrets Manager placeholder secrets (anthropic-api-key, cron-secret,
  auth0-config, notify-providers)
- CloudWatch log groups (365d), SNS alarms topic, RDS CPU alarm
- EventBridge Scheduler daily 06:00 UTC → API destination → `/cron/inactivity-check`
  with `x-cron-secret`

Stubbed in `modules/app-stack/stubs.tf` (commented sketches with rationale —
they depend on decisions or resources not yet made, and half-working compute
blocks would be worse than none):

- VPC (`terraform-aws-modules/vpc`, no-NAT cost pattern)
- ALB + ECS Fargate (ALB idle timeout must be >= 200s — AI extraction runs up
  to 180s and must not be retried)
- CloudFront (SPA from S3+OAC, `/api/*` → ALB) + WAF managed rules
- GuardDuty Malware Protection for the documents bucket
- Route53 + ACM (CloudFront cert must be issued in us-east-1)

Until the VPC exists, RDS lands in the default VPC (`db_subnet_group_name = null`);
it remains non-public.

## Rough monthly cost (small scale, ap-south-1)

| Item | ~USD/mo |
| --- | --- |
| ECS Fargate (2–3 small tasks) | 25–30 |
| ALB | 20 |
| RDS db.t4g.micro + storage | 15–18 |
| WAF | 12–15 |
| CloudWatch (logs/alarms) | 5 |
| S3 + KMS + GuardDuty | 3–8 |
| Route53 | 1 |
| CloudFront | ~0 (free tier) |
| **Total** | **~80–100** |

No NAT gateways by design (~$35/mo each avoided).

## Validation

Terraform is not installed on the authoring machine; files were written
conservatively against AWS provider 6.x. CI must run
`terraform init -backend=false && terraform validate && terraform fmt -check`
in each env before the first apply. TODO(Phase 1): add that CI job.
