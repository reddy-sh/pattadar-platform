# Terraform — Pattadar AWS Platform

Infrastructure for the Pattadar platform on AWS `ap-south-1`, split into two
layers per environment:

- **persistent** — survives a decommission. Data, identity, audit and
  supply-chain: KMS, S3 (documents/logs/CloudTrail), CloudTrail (trail off in
  prod via `enable_cloudtrail = false`; bucket kept) + AWS Config,
  ECR, Secrets Manager, Cognito (users!), Route53 zone, SES identity,
  GuardDuty, GitHub OIDC deploy role. `scripts/platform-down.sh` never touches
  this layer (it only parks documents into `parking_storage_class`).
- **runtime** — destroyable/recreatable on demand: VPC, the one ECS host
  (EC2) and its ECS services, CloudFront (SPA and api distributions, VPC
  origins), WAF (prod: off until launch), RDS (snapshotted on down), EventBridge scheduler, observability, DNS
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
2. Create the five app SSM SecureStrings out of band (values never touch
   Terraform or tfvars): `/pattadar/<env>/{db-app-password, cron-secret,
   anthropic-api-key, internal-proxy-secret-api, internal-proxy-secret-assistant}`
   under the persistent CMK `alias/pattadar-<env>`. The commands are in
   [account-bootstrap.md](../../docs/runbooks/account-bootstrap.md) §
   "App SSM SecureStrings". `cron-secret` is a HARD prerequisite for the runtime
   apply: the scheduler reads its value through a data source to build the
   EventBridge connection. `scripts/platform-up.sh` refuses to apply while any
   of the five is missing, and it checks names only, never values. The Secrets
   Manager containers `anthropic-api-key`, `cron-secret`, `cognito-config` and
   `notify-providers` are no longer read by the runtime. They are kept until
   their values are copied, then deleted as a separate approved change
   (docs/specs/2026-10-26-one-server-runtime.md).
3. Push images to ECR (`pattadar/api`, `pattadar/gateway`, `pattadar/assistant`)
   — normally done by `.github/workflows/deploy.yml` via the
   `pattadar-github-deploy` OIDC role.
4. `cd envs/prod/runtime && terraform apply` (or `scripts/platform-up.sh prod`).
5. Confirm the SNS alarm-email subscription (AWS mails a confirmation link to
   `alert_email` after the runtime apply; alarms are silent until clicked).
6. Sync the built SPA to `terraform output spa_bucket_name` and invalidate
   `cloudfront_distribution_id` (deploy.yml does both).

## Runtime layer

`modules/runtime/` is the destroyable half (Design A, Reddy 26/10/2026; see
[the decision record](../../docs/specs/2026-10-26-one-server-runtime.md)):

- VPC with 2 public subnets and NO NAT. The one host has a public IPv4 for
  egress only.
- One ECS-optimized AL2023 arm64 EC2 host (`ec2.tf`, `instance_type` default
  `t4g.medium`). It is a standalone instance with simplified auto-recovery, has
  no key pair or SSH (access is SSM Session Manager), requires IMDSv2 and blocks
  IMDS from containers.
- Three ECS services on that host (gateway, api, assistant), EC2 launch type,
  bridge mode, static host ports 8080/8081/8082. Every container listens on
  8080, and each task keeps a 512 CPU / 1024 MiB limit. The gateway reaches the
  api and the assistant on `172.17.0.1:8081` and `:8082`.
- `api_edge.tf`: the `api.<domain>` CloudFront distribution with two VPC
  origins on the host, gateway :8080 and api_cron :8081. `/api/*` goes to the
  gateway, the exact path `/cron/inactivity-check` (POST only) goes to the
  api, and everything else is a 404 from a CloudFront Function. The SPA
  distribution's `/api/*` also goes to the gateway VPC origin.
  `scripts/tests/test_edge_routes.py` fails CI if this routing drifts.
- RDS PG17, EventBridge Scheduler cron (through the api distribution), the SPA
  bucket, alarms and DNS.

There is no ALB, Fargate, Service Connect or `web` ECS service or task any
more. `aws_iam_role.web_task` is kept because the persistent deploy role's
PassRole names it.
`web_desired_count`, `web_image_tag` and `web_origin = "ecs"` are unused, and
`web_origin` must stay `spa`.

### Down (`scripts/platform-down.sh`)

Use the reviewed lifecycle script or its manual workflow, not an ad-hoc targeted
apply. The script performs a **full runtime apply** with deletion protection
disabled, destroys runtime under a unique final-snapshot identifier, and then
parks documents according to the configured class. VPC-origin deletion adds
about 15-30 minutes to the destroy. A targeted `-target` apply
can desynchronize dependencies/state and is explicitly not the current flow.
Production retains the typed `decommission-prod` confirmation.

The persistent layer (documents, users, images, secrets, zone) is untouched;
see `docs/runbooks/up-down.md` for prerequisites, evidence, rerun behavior, and
recovery from interruption.

### Up again (restore from snapshot)

Run `scripts/platform-up.sh <env>`, not a raw apply. It finds the latest
`pattadar-<env>-pg-final-*` snapshot and passes it as
`TF_VAR_restore_snapshot_identifier`. With no snapshot it creates a fresh,
empty database. It first checks the five SSM SecureStrings. Each run is a
high-risk operation that needs Reddy's approval (`docs/runbooks/up-down.md`).

### Runtime caveats (by design, documented not hidden)

- **App database password**: every service logs in as `pattadar_app` with the
  SSM SecureString `/pattadar/<env>/db-app-password` (`modules/runtime/rds.tf`).
  It outlives platform-down. Losing it means generating a new one and running
  a master-user `ALTER ROLE` (reserved for Reddy).
- **CloudFront origin timeout**: `cloudfront_origin_read_timeout` (default
  120 s) bounds every request through the VPC origins, and with the ALB gone
  (it had 200 s) that includes iOS and Expo traffic on `api.pattadar.com`. Web
  document reading is a durable job whose every HTTP hop is short, but the
  older synchronous readings (iOS passbook, Expo passbook and deed) wait on the
  model for up to 170 s (`services/api/src/ai_reading/config.py`). Request the
  CloudFront "Response timeout per origin" quota increase and set 180 once it
  lands. Before cutover, move the iOS passbook read to `/import-passbook-async`,
  or have Reddy accept 180 s with a 10 s margin. A large upload is bound the
  same way: the gateway accepts up to `STORAGE_MAX_UPLOAD_BYTES` (100 MB) and
  CloudFront cuts it at the timeout, so a big scan on a slow link can still
  fail at the edge.
- **Edge access logs**: the ALB access logs are gone. Both CloudFront
  distributions deliver standard logs (v2, configured in us-east-1) to the
  persistent access-logs bucket under `cloudfront/<api|web>/`, the only record
  of viewer IP and path now that the gateway and api see CloudFront's ENI as
  the client. The persistent bucket policy swaps `ALBAccessLogsDelivery` for
  `CloudFrontAccessLogsDelivery`, so the persistent apply must land before the
  runtime one (`platform-up.sh` order). Code only, not applied.
- **Host recovery**: hardware or system failure is handled by EC2 simplified
  auto-recovery (same instance id, so the VPC origins stay valid), and an OS
  hang by the `host-instance-status` alarm's reboot action. Replacing the
  instance (`-replace` on `module.runtime.aws_instance.host`, reserved) is
  create-before-destroy, because the VPC origins force it on everything they
  depend on. The sequence: the new instance boots and registers; new VPC
  origins are created (up to 15 minutes); both distributions repoint to the
  new host while the tasks are still on the old one, so the **outage starts
  at the repoint**; the old origins are deleted (up to another 15 minutes);
  only then does the old instance terminate and ECS move the tasks. Expect
  about 20-40 minutes in all, most of it with the API down. Never run it at
  05:30-06:30 UTC, and time it in the dev proof. Draining the old host first
  (desired count 0) is optional and makes the outage explicit, not shorter.
  The SG and instance profile take a `name_prefix` and the cluster must never
  be renamed, or the replacement collides on a fixed name. An edit to a VPC
  origin's endpoint config (port, protocol) must also be applied with
  `-replace` on that origin: AWS refuses an in-place update while it is in
  use. `ignore_changes = [ami]` means the host stays on its boot AMI until a
  deliberate, scheduled replacement; weekly Patch Manager (Sunday 21:30 UTC)
  patches it in place.
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
  internet-reachable; the single exception is the api distribution's exact-path
  `/cron/inactivity-check` behaviour to the api VPC origin, guarded by
  `CRON_SECRET`. On the shared host the api container refuses any other path
  without the gateway's `INTERNAL_PROXY_SECRET`
  (`services/api/src/private_ingress.py`). New identities use immutable Cognito issuer/subject.
  Existing owner keys resolve only through reviewed `IDENTITY_LEGACY_BINDINGS`;
  neither API nor gateway derives authority from the email local part.
- Extraction routes get NO retries anywhere: the scheduler sets
  `maximum_retry_attempts = 0`, both VPC origins use `connection_attempts = 1`,
  and the gateway never retries. Synchronous extraction is bounded by the
  CloudFront origin timeout (caveat above).
- `CRON_SECRET` is always set. Its value lives in the out-of-band SSM
  SecureString `/pattadar/<env>/cron-secret`, and enters state only through
  the scheduler's connection data source.

## Validation

CI already runs `terraform fmt -check -recursive` and
`terraform init -backend=false && terraform validate` across all five roots
(`dev/prod` × `persistent/runtime`, plus `envs/prod/university`), and
`pytest scripts/tests` runs `test_edge_routes.py`, the static guard on the api
distribution's routes and the host's ingress. Local `init` downloads
providers and writes `.terraform`; mention that side effect before running it.
A successful static validation is not a reviewed plan or applied-state proof.
