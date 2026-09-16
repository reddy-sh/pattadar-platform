# Infrastructure Change Gates

| Gate | Questions |
|---|---|
| Layer | persistent or runtime; what must survive down? |
| Environments | dev/prod persistent/runtime parity and intentional overrides? |
| State | address/output/remote-state compatibility; moved/import need? |
| Trust | internet path, identity injection, SG source/destination, secret owner? |
| Data | encryption/versioning/retention/backup/malware gates preserved? |
| Rollout | old/new tasks coexist; additive schema/config; rollback possible? |
| Cost/availability | NAT/public IP, task count, RDS class/AZ, logs, WAF/CloudFront? |
| Regions | ap-south-1 plus us-east-1 ACM/WAF edge resources? |
| Evidence | examples, runbooks, alarms, CI validation, migration receipt updated? |

Current traffic invariant: CloudFront `/api/*` → ALB → gateway; ALB direct API
is only `/cron/inactivity-check`, protected by `CRON_SECRET`; default ALB web
target is staged and active SPA default content comes from S3/CloudFront.
