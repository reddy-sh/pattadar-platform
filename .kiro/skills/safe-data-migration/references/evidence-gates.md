# Migration Evidence Gates

## Plan fields

| Field | Required content |
|---|---|
| Scope | environment, source, destination, data classes |
| Code | exact SHA and the exact command |
| Identity | authoritative owner key and alias/binding rules |
| Inventory | expected rows, objects, bytes, owners; generation time |
| Writers | processes to drain/freeze and the writer-control window |
| Backup | snapshot id or location, timestamp, restore method, owner |
| Effects | side effects, data exposure, reversibility |
| Reconciliation | exact count/hash/readback/foreign-owner checks |
| Rollback | old data/task retention and compatibility window |
| Approval | Reddy's approval reference (`--approval-ref` where the script takes one), irreversible boundary, operator for dev/prod |
| Receipt | output path, schema, redaction/retention |

## Repository-specific reconciliation

- MinIO → SSE-KMS S3: compare object count and total bytes, not ETags.
- Attachment migration: SHA-256/readback plus complete receipt.
- Identity: complete owner/admin inventory and reviewed collisions; never email
  local-part inference.
- Account erasure: API rows, storage metadata, all S3 versions/delete markers,
  assistant data, Cognito identities, and payment blockers.
- Aadhaar clear/backfill (`services/api/scripts/clear_aadhaar.py`,
  `backfill_aadhaar_documents.py`): `--environment` is required, the default is
  a dry run, output is counts only, and dev/prod need `--allow-remote` and
  `--approval-ref` (plus `--writers-drained` to execute); a backfill `--execute`
  needs `--approval-ref` even locally. A clear's evidence is the
  zero-count re-run; a backfill re-run files nothing more. The Fernet → KMS
  re-encryption is superseded and must not be executed.
- Consent: never write `account_consents` rows for a user; closing the
  pre-consent grace (`CONSENT_STRICT=1`) follows account-data.md and is
  Reddy's decision.
- Schema: additive/idempotent rollout behavior while old and new tasks coexist.
- Restore: per-table minimum row counts (`scripts/recovery-drill.py
  --verification-counts`, read-only on the scratch copy), not a public-table
  total; plus one `storage_versions` round-trip using the row's stored
  `object_key` and `size_bytes`, never a key rebuilt from ids.

## Authoritative runbooks

- `docs/runbooks/migration.md`
- `docs/runbooks/identity-migration.md`
- `docs/runbooks/assistant-attachment-migration.md`
- `docs/runbooks/account-data.md`
- `docs/runbooks/rds-restore-drill.md`
- `docs/runbooks/aadhaar-kms-rollout.md`

Commands in runbooks are documentation, not pre-approved execution. Known drift
on 09/10/2026: migration.md applies `services/gateway/sql/schema.sql` (the file
is `init.sql`); rds-restore-drill.md sums `size` (the column is `size_bytes`)
and rebuilds a `{owner}/{node}/{version}` key.
