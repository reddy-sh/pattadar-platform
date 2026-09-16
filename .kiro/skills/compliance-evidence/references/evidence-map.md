# Compliance Evidence Map

| Area | Example evidence |
|---|---|
| Access/identity | Cognito/admin/IAM/GitHub access review receipt; immutable-binding review |
| Change management | protected branch/CI exact-SHA record, reviewed plan/apply logs, release receipt |
| Secrets | gitleaks result, OIDC configuration, rotation receipt (never secret value) |
| Encryption/data | applied KMS/S3/RDS settings, TLS policy, malware gate test |
| Logging/monitoring | CloudTrail/Config status, log retention, alarm delivery exercise |
| Backup/recovery | dated scratch restore, row counts, document round-trip, cleanup receipt |
| Privacy/consent | policy version, consent/withdrawal tests, DSR export/erasure receipt |
| Incident | timeline, containment, notification decision, post-mortem/actions |
| Vendor | DPA/terms review, provider scope, retention, owner, renewal date |
| Governance | Custodian summary/artifact and reviewed remediation record |

Statuses: implemented (code), applied (environment), operated (real exercise),
reviewed (human/legal). State each independently.
