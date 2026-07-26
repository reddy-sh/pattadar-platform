# SOC 2 Control Matrix

Trust Services Criteria in scope: **Security (common criteria), Availability, Confidentiality**.

Status legend: `[template]` = in the Terraform/CI scaffold now · `[phase-N]` = planned work item · `[organizational]` = policy/process work outside code.

## Logical access (CC6)

| Criteria area | Mechanism in this stack | Status |
|---|---|---|
| User authentication | Amazon Cognito (ap-south-1); gateway validates the access token and injects `x-user-id`; api is never internet-reachable | [template] |
| MFA | Cognito TOTP MFA: optional at launch, enforced for super-admin pre-pilot, enforced for all users post-pilot | [phase-2] + [organizational] |
| Super-admin functions | Fail-closed super-admin checks in gateway (AI/model admin routes) | [phase-1] |
| AWS access | IAM least-privilege roles per ECS service; no shared accounts | [template] |
| No long-lived credentials | GitHub Actions → AWS via OIDC federation; no static access keys in CI or repo | [template] |
| Human AWS access | SSO/short-lived sessions only; break-glass documented | [organizational] |
| Access reviews | Quarterly review of Cognito super-admins, AWS IAM, GitHub collaborators | [organizational] |

## Change management (CC8)

| Criteria area | Mechanism in this stack | Status |
|---|---|---|
| Protected mainline | GitHub main-branch protection; force-push disabled | [template] |
| CI gate | Required CI checks (typecheck, tests, lint, `terraform plan`) before merge | [template] |
| Secret hygiene | GitHub secret scanning + push protection; `.env.example` only, never real secrets | [template] |
| Solo-founder compensating control | Two-person review is impossible with one engineer. Compensating controls: every change lands via a reviewed CI run with full check history; infrastructure changes only via Terraform plan/apply logs; application audit trail records data changes. Documented for the auditor as a compensating control, not hidden. | [template] + [organizational] |
| Infra change trail | All infrastructure in Terraform; CloudTrail records out-of-band console changes | [template] |

## Encryption (CC6.1, Confidentiality)

| Criteria area | Mechanism in this stack | Status |
|---|---|---|
| At rest | Customer-managed KMS CMK for RDS PostgreSQL and the S3 documents bucket (SSE-KMS); key rotation enabled | [template] |
| In transit | TLS 1.2+ everywhere: CloudFront (viewer + origin), CloudFront→ALB HTTPS, ALB→ECS in-VPC | [template] |
| Secrets | AWS Secrets Manager for DB/Anthropic/notification credentials; injected into ECS task definitions, never baked into images | [template] |

## Logging & monitoring (CC7)

| Criteria area | Mechanism in this stack | Status |
|---|---|---|
| API/audit evidence | CloudTrail (all regions, management events) → S3, immutable — `aws_cloudtrail` in the Terraform persistent layer | [template] |
| Config drift | AWS Config recording resource configuration changes — `aws_config` in the Terraform persistent layer | [template] |
| Application logs | ECS → CloudWatch Logs, 365-day retention | [template] |
| Access logs | ALB access logs + S3 server access logs to a logging bucket | [template] |
| Application audit trail | Port the predecessor's audit-trail writer into services/api (`audit_events`) | [phase-1] |
| Alerting | CloudWatch alarms (5xx rate, RDS storage/CPU, ECS task health) → SNS → founder email/SMS | [template], tuning [phase-2] |
| Log PII scrubbing | Strip PII (Aadhaar, phone) from application log lines | [phase-2] |

## Backup & recovery (Availability)

| Criteria area | Mechanism in this stack | Status |
|---|---|---|
| Database | RDS automated backups, 7-day PITR | [template] |
| Cross-region resilience | TODO: cross-region snapshot copy | [phase-5] |
| Documents | S3 versioning on the documents bucket; deletes recoverable | [template] |
| Restore verification | Documented restore test, run on a cadence (quarterly), evidence retained | [phase-2] + [organizational] |

## Vendor management (CC9)

| Vendor | Purpose | Action |
|---|---|---|
| AWS | Infrastructure | DPA via AWS Service Terms; SOC reports via AWS Artifact | [organizational] |
| AWS (Amazon Cognito) | Authentication | Covered by the AWS DPA/Service Terms and AWS Artifact SOC reports above | [organizational] |
| Anthropic | Document extraction (Claude API) | DPA; zero-retention/commercial terms review | [organizational] |
| Resend / MSG91 / Meta WhatsApp | Notifications (Phase 2, env-gated) | DPA before enabling with real user data | [organizational] |

## Incident response (CC7.3–7.5)

| Criteria area | Mechanism in this stack | Status |
|---|---|---|
| Runbook | Incident runbook: detect → contain → assess → notify → post-mortem | [phase-2] + [organizational] |
| Breach notification duties | DPDP Board + affected users; GDPR 72h — see [gdpr-dpdp.md](gdpr-dpdp.md) | [organizational] |

## Availability

| Criteria area | Mechanism in this stack | Status |
|---|---|---|
| Starting posture | Single-AZ RDS, single ECS service per component (cost-appropriate for launch) | [template] |
| Upgrade path | Multi-AZ RDS + ≥2 ECS tasks across AZs; documented in infra README, flag-flip in Terraform | [phase-5] |
| Health checks | ALB target-group health checks; ECS replaces unhealthy tasks | [template] |
