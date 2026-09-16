# Terraform — Pattadar AWS Platform

Infrastructure for the Pattadar platform on AWS `ap-south-1`, split into two
layers per environment:

- **persistent** — survives a decommission. Data, identity, audit and
  supply-chain: KMS, S3 (documents/logs/CloudTrail), CloudTrail + AWS Config,
  ECR, Secrets Manager, Cognito (users!), Route53 zone, SES identity,
  GuardDuty, GitHub OIDC deploy role. `scripts/platform-down.sh` never touches
  this layer (it only parks documents into `parking_storage_class`).
- **runtime** — destroyable/recreatable on demand: VPC, ALB, ECS, CloudFront,
  WAF, RDS (snapshotted on down), EventBridge scheduler, observability, DNS
  records. `scripts/platform-up.sh <env>` / `platform-down.sh <env>` apply and
  destroy it. Runtime reads persistent outputs via `terraform_remote_state`.

## Layout

```
infra/terraform/
  modules/persistent/          # complete — see file list in main.tf
  modules/persistent/lambda/   # Cognito pre-token-generation source (python3.12)
  modules/runtime/             # complete — see file list in main.tf
  envs/prod/persistent/        # backend key prod/persistent.tfstate
  envs/prod/runtime/           # backend key prod/runtime.tfstate
  envs/dev/persistent/         # backend key dev/persistent.tfstate (thin variant)
  envs/dev/runtime/            # backend key dev/runtime.tfstate (same root as prod, dev tfvars)
```

## Bootstrap (one time)

1. Create the state bucket (exact commands in `envs/prod/persistent/backend.tf`):
   `pattadar-terraform-state-<ACCOUNT_ID>`, versioning on, public access
   blocked. TF >= 1.10 uses native S3 lockfile locking (`use_lockfile = true`)
   — no DynamoDB.
2. Uncomment the backend block in each root you use, fill `<ACCOUNT_ID>`.
3. `cd envs/prod/persistent && terraform init`.

## Apply order

Always **persistent -> runtime** (runtime's `terraform_remote_state` needs the
persistent state to exist):

1. `cd envs/prod/persistent && terraform apply`
2. Fill the placeholder secrets (values never touch Terraform):
   ```
   aws secretsmanager put-secret-value --secret-id pattadar/prod/anthropic-api-key --secret-string '...'
   aws secretsmanager put-secret-value --secret-id pattadar/prod/cron-secret       --secret-string '...'
   aws secretsmanager put-secret-value --secret-id pattadar/prod/cognito-config    --secret-string '{...}'
   aws secretsmanager put-secret-value --secret-id pattadar/prod/notify-providers  --secret-string '{...}'
   ```
   `cron-secret` is a HARD prerequisite for the runtime apply: the scheduler
   reads its value via a data source to build the EventBridge connection, and
   plan fails on an empty secret.
3. Push images to ECR (`pattadar/api`, `pattadar/gateway`, `pattadar/assistant`)
   — normally done by `.github/workflows/deploy.yml` via the
   `pattadar-github-deploy` OIDC role.
4. `cd envs/prod/runtime && terraform apply` (or `scripts/platform-up.sh prod`).
5. Confirm the SNS alarm-email subscription (AWS mails a confirmation link to
   `alert_email` after the runtime apply; alarms are silent until clicked).
6. Sync the built SPA to `terraform output spa_bucket_name` and invalidate
   `cloudfront_distribution_id` (deploy.yml does both).

## Runtime layer

`modules/runtime/` is the destroyable half: VPC (2 public subnets, NO NAT —
tasks get public IPs, with documented per-address cost), ALB (`idle_timeout =
200`; extraction runs to 180s, never retried), three ARM64 Fargate services
(gateway/API/assistant) plus an optional staged web service, RDS PG17,
EventBridge Scheduler cron, CloudFront + WAF and the SPA bucket, alarms, and DNS.
The ALB forwards only `/cron/inactivity-check` directly to API; `/api/*` goes to
the gateway. Active SPA default content comes from CloudFront/S3; the ALB web
target is for an explicit future web-next cutover.

### Down (`scripts/platform-down.sh`)

Use the reviewed lifecycle script or its manual workflow, not an ad-hoc targeted
apply. The script performs a **full runtime apply** with deletion protection
disabled, creates a unique final-snapshot identifier, parks documents according
to the configured class, and then destroys runtime. A targeted `-target` apply
can desynchronize dependencies/state and is explicitly not the current flow.
Production retains the typed `decommission-prod` confirmation.

The persistent layer (documents, users, images, secrets, zone) is untouched;
see `docs/runbooks/up-down.md` for prerequisites, evidence, rerun behavior, and
recovery from interruption.

### Up again (restore from snapshot)

Find the latest final snapshot and pass it in:
`terraform apply -var restore_snapshot_identifier=pattadar-<env>-pg-final-<suffix>`
— empty (the default) creates a fresh, empty database.

### Runtime caveats (by design, documented not hidden)

- **db-dsn rotation**: `pattadar/<env>/db-dsn` (APP_PG_DSN) is composed by
  Terraform from the RDS endpoint + the RDS-managed master secret. RDS
  auto-rotates that master password (~7 days); after a rotation re-run
  `terraform apply` and `aws ecs update-service --force-new-deployment` for
  both services. TODO(Phase 2): dedicated app DB user or IAM DB auth.
- **CloudFront origin timeout**: default service quota caps
  `origin_read_timeout` at 60s. This is no longer an extraction ceiling —
  document reading runs as a durable server job (`services/api/src/import_jobs.py`)
  whose every HTTP hop is short, and the browser only ever calls relative
  `/api` paths (see the docblock in `apps/web/src/api/client.ts`), so nothing
  talks to `https://api.pattadar.com` directly any more. What the 60s cap still
  binds is a **large upload**: the gateway accepts up to
  `STORAGE_MAX_UPLOAD_BYTES` (100 MB) and CloudFront will cut the connection at
  60s regardless, so a big scan on a slow rural link fails at the edge. Until
  either the "Response timeout per origin" quota increase lands (then set
  `cloudfront_origin_read_timeout = 180`) or uploads move to a presigned S3 PUT
  that bypasses CloudFront, treat 100 MB as advertised-but-not-deliverable over
  a slow connection.
- **ALB access logs** land in the persistent logs bucket under `alb/` — the
  bucket policy statement `ALBAccessLogsDelivery` (persistent/s3.tf) is what
  authorises the regional ELB account; removing it breaks the runtime apply.
- **Shared-account dev**: dev persistent runs `manage_dns = false`, so the dev
  runtime root must set `route53_zone_id` to prod's zone id and use dev
  hostnames (`api-dev.pattadar.com`) — see `dev.auto.tfvars.example`.

## DNS / email cutover (Track B — existing site stays up until then)

`pattadar.com` is currently live on Azure DNS. Persistent creates the Route53
zone plus the SES/DKIM/DMARC records inside it; nothing resolves until the
registrar NS switch:

1. `terraform output route53_name_servers` — the 4 NS values.
2. Switch the registrar to those NS (runbook step, founder action).
3. SES identity + DKIM then verify automatically; request SES production
   access (sandbox exit) via console/CLI; flip Cognito email to `DEVELOPER`
   (commented block in `modules/persistent/cognito.tf`).
4. Later: custom Cognito domain `auth.pattadar.com` (pilot uses the
   `pattadar-auth-<env>` prefix domain).

## Web auth wiring (SPA)

| Vite var | Terraform output |
| --- | --- |
| `VITE_COGNITO_AUTHORITY` | `cognito_issuer` |
| `VITE_COGNITO_CLIENT_ID` | `cognito_spa_client_id` |
| `VITE_COGNITO_DOMAIN` | `cognito_hosted_ui_domain` |
| `VITE_COGNITO_REDIRECT_URI` | `https://pattadar.com/auth/callback` (dev: localhost) |

## Single-account note

Several persistent resources are account/domain singletons: the Route53 zone +
SES identity, the GitHub OIDC provider + `pattadar-github-deploy` role,
CloudTrail/Config/GuardDuty, and the un-namespaced ECR repos
(`pattadar/api|gateway|assistant`). If dev and prod share one AWS account,
prod owns them: set `manage_dns/manage_github_oidc/manage_org_security = false`
in `envs/dev/persistent` (see `dev.auto.tfvars.example`) and have dev reuse
prod's ECR repositories. Separate accounts need none of this.

## Key module variables (persistent)

| Variable | Default | Purpose |
| --- | --- | --- |
| `app_name` / `environment` | — | Resource prefix `pattadar-<env>` |
| `noncurrent_version_expiration_days` | `180` (dev 30) | Documents-bucket old-version expiry |
| `parking_storage_class` | `DEEP_ARCHIVE` | Class `platform-down.sh` parks documents in (script-consumed, not Terraform) |
| `ecr_keep_last_images` | `10` | ECR lifecycle policy |
| `domain_name` | `pattadar.com` | Zone + SES identity |
| `spa_callback_urls` / `spa_logout_urls` | prod + localhost | Cognito SPA client redirects |
| `github_repository` | `reddy-sh/pattadar-platform` | OIDC trust pin |
| `manage_dns` / `manage_github_oidc` / `manage_org_security` | `true` | Account-singleton toggles |

## Invariants baked into this layout

- API trusts gateway-injected `x-user-id` and is never generally
  internet-reachable; the single `/cron/inactivity-check` exception is guarded
  by `CRON_SECRET`. New identities use immutable Cognito issuer/subject.
  Existing owner keys resolve only through reviewed `IDENTITY_LEGACY_BINDINGS`;
  neither API nor gateway derives authority from the email local part.
- Extraction routes need >= 200s timeouts and NO retries — ALB
  `idle_timeout = 200` and zero-retry semantics everywhere (scheduler
  `maximum_retry_attempts = 0`; CloudFront quota caveat above).
- `CRON_SECRET` always set; value lives only in Secrets Manager
  (`pattadar/<env>/cron-secret`).

## Validation

CI already runs `terraform fmt -check -recursive` and
`terraform init -backend=false && terraform validate` across all four
environment roots (`dev/prod` × `persistent/runtime`). Local `init` downloads
providers and writes `.terraform`; mention that side effect before running it.
A successful static validation is not a reviewed plan or applied-state proof.
