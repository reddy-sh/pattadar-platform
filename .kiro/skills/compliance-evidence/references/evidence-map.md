# Compliance Evidence Map

Sources marked "operator" are live reads the agent names but never runs
without approval. Receipts that hold ARNs or account IDs stay in `.local/`.

| Area | Example evidence | Source |
|---|---|---|
| Access/identity | Cognito/admin/IAM/GitHub access review receipt; immutable-binding review | review record: none in repo, user-supplied; binding: `services/gateway/scripts/identity_preflight.py --output` receipt — operator (inputs hold a Cognito export and owner inventory); code: `services/gateway/tests/test_identity_preflight.py` |
| Change management | protected branch/CI exact-SHA record, reviewed plan/apply logs, release receipt | `ci.yml` run for the SHA; `deploy.yml` artifact `release-<sha>` (`release-receipt.json` from `scripts/deploy-release.py`, holds ARNs) — operator: `gh run download <run-id> -n release-<sha>` |
| Secrets | gitleaks result, OIDC configuration, rotation receipt (never secret value) | `ci.yml` job "Secret scan (gitleaks)"; `infra/terraform/modules/persistent/github_oidc.tf` (declared only) |
| Encryption/data | applied KMS/S3/RDS settings, TLS policy, malware gate test | `infra/terraform/modules/persistent/` `kms.tf`, `s3.tf`, `guardduty.tf` (declared only); applied settings — operator read |
| Logging/monitoring | CloudTrail/Config status, log retention, alarm delivery exercise | `infra/terraform/modules/persistent/cloudtrail.tf` (declared only); alarm delivery — operator: `scripts/recovery-drill.py --send-test-alert` receipt |
| Backup/recovery | dated scratch restore, row counts, document round-trip, cleanup receipt | `docs/runbooks/rds-restore-drill.md`; operator: `scripts/recovery-drill.py --receipt <file>` (JSON, holds the restore ARN) |
| Privacy/consent | policy version, consent/withdrawal tests, DSR export/erasure receipt | `docs/compliance/gdpr-dpdp.md`; `services/api/tests/test_account_data.py`; erasure receipt from `services/api/scripts/erase_account.py` — operator |
| Incident | timeline, containment, notification decision, post-mortem/actions | `docs/runbooks/incident-response.md` live log (holds affected users) |
| Vendor | DPA/terms review, provider scope, retention, owner, renewal date | none in repo, user-supplied |
| Governance | Custodian summary/artifact and reviewed remediation record | `governance.yml` artifact `custodian-findings` (`out/`, 90-day retention) — operator: `gh run download <run-id> -n custodian-findings` |

Statuses: implemented (code), applied (environment), operated (real exercise),
reviewed (human/legal), or `unknown` when no artifact proves the layer. State
each independently. The repo legend in `docs/compliance/soc2-controls.md` is a
plan, not evidence: `[template]` is at most implemented, `[phase-N]` is not
implemented, `[organizational]` needs a reviewed human record. Never raise a
status from the legend alone; reviewed requires Reddy's acceptance.
