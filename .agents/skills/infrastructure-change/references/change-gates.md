# Infrastructure Change Gates

| Gate | Questions |
|---|---|
| Layer | persistent, runtime, or the standalone always-on `envs/prod/university` root (no dev twin, outside platform-up/down, reads prod persistent remote state); what must survive down? |
| Environments | dev/prod persistent/runtime parity and intentional overrides? |
| State | address/output/remote-state compatibility; moved/import need? |
| Trust | internet path, identity injection, SG source/destination, secret owner? |
| Data | encryption/versioning/retention/backup/malware gates preserved? |
| Rollout | old/new tasks coexist; additive schema/config; rollback possible? |
| Cost/availability | NAT/public IP, host size/credits, task memory fit on the one host, RDS class/AZ, logs, WAF/CloudFront? |
| Regions | ap-south-1 plus us-east-1 ACM/WAF edge resources? |
| Evidence | examples, runbooks, alarms, CI validation, migration receipt updated? |

Current traffic invariant (Design A, Reddy 26/10/2026, code only until
applied; `docs/specs/2026-10-26-one-server-runtime.md`): there is no ALB.
- `/api/*` on both CloudFront distributions (SPA `pattadar.com` and
  `api.pattadar.com`) goes to the gateway VPC origin, host :8080.
- The only direct API path is the api distribution's exact-path
  `/cron/inactivity-check` behaviour → api_cron VPC origin, host :8081. It is
  POST only, forwards only `x-cron-secret` and `content-type`, and is
  protected by `CRON_SECRET`.
- Everything else on `api.pattadar.com` is a 404 from a CloudFront Function.
- The one ECS host's SG admits only `CloudFront-VPCOrigins-Service-SG` on
  8080-8081 (never 8082, port 22 or a cidr).
- The api container (`services/api/src/private_ingress.py`) refuses any other
  path without the gateway's `INTERNAL_PROXY_SECRET`.
- `scripts/tests/test_edge_routes.py` fails CI when the routes or the host
  ingress drift.
- The SPA default content comes from S3/CloudFront.
- University has its own S3 + CloudFront + ACM edge (optional WAF, off
  pre-launch) and Cognito client, not the platform edge.
- CloudFront `/vm/*` (village maps, public reference data) reads the
  persistent village-maps bucket via OAC; its bucket policy is runtime-owned.

The shared kernel is accepted for pre-launch only, and the CloudFront → VPC
origin hop is HTTP (Reddy's recorded exceptions). App secrets are out-of-band
SSM SecureStrings whose ARNs are built as strings. Never add an
`aws_ssm_parameter` resource or a value-reading data source for them; the
scheduler's `cron-secret` data source is the one existing exception.

`web_origin` must stay `spa` (`deploy.yml` passes `--web-origin spa`). The
`web` ECS service, task and target group were removed on 26/10/2026 (Reddy).
`aws_iam_role.web_task` and the persistent `web` ECR repo remain, because the
persistent PassRole names the role. `web_desired_count`, `web_image_tag` and
`web_origin = "ecs"` are dead; removing them, or the role, is a reviewed change
for Reddy.
