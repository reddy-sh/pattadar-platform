# Infrastructure Change Gates

| Gate | Questions |
|---|---|
| Layer | persistent, runtime, or the standalone always-on `envs/prod/university` root (no dev twin, outside platform-up/down, reads prod persistent remote state); what must survive down? |
| Environments | dev/prod persistent/runtime parity and intentional overrides? |
| State | address/output/remote-state compatibility; moved/import need? |
| Trust | internet path, identity injection, SG source/destination, secret owner? |
| Data | encryption/versioning/retention/backup/malware gates preserved? |
| Rollout | old/new tasks coexist; additive schema/config; rollback possible? |
| Cost/availability | NAT/public IP, task count, RDS class/AZ, logs, WAF/CloudFront? |
| Regions | ap-south-1 plus us-east-1 ACM/WAF edge resources? |
| Evidence | examples, runbooks, alarms, CI validation, migration receipt updated? |

Current traffic invariant: CloudFront `/api/*` → ALB → gateway; ALB direct API
is only `/cron/inactivity-check`, protected by `CRON_SECRET`; the api container
(`services/api/src/private_ingress.py`) refuses any other path without the
gateway's `INTERNAL_PROXY_SECRET`; the SPA default
content comes from S3/CloudFront. University has its own S3 + CloudFront + ACM
edge (optional WAF, off pre-launch) and Cognito client, not the platform edge.
CloudFront `/vm/*` (village maps, public reference data) reads the persistent
village-maps bucket via OAC; its bucket policy is runtime-owned.

App secrets are out-of-band SSM SecureStrings whose ARNs are built as strings.
Never add an `aws_ssm_parameter` resource or a value-reading data source for
them; the scheduler's `cron-secret` data source is the one existing exception.

`web_origin` must stay `spa` (`deploy.yml` passes `--web-origin spa`): `ecs`
points CloudFront's default behaviour at the ALB, whose default action forwards
to the empty `web` target group. That target group, the `web` ECS service and
task, and the persistent `web` ECR repo are dormant leftovers of the removed
Next.js client; removing them changes CloudFront/ALB routing, so stop and ask
Reddy before a removal change.
