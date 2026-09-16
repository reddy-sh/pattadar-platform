# Migration Evidence Gates

## Plan fields

| Field | Required content |
|---|---|
| Scope | environment, source, destination, data classes |
| Identity | authoritative owner key and alias/binding rules |
| Inventory | expected rows, objects, bytes, owners; generation time |
| Writers | processes to drain/freeze and duration |
| Backup | location, timestamp, restore method, owner |
| Reconciliation | exact count/hash/readback/foreign-owner checks |
| Rollback | old data/task retention and compatibility window |
| Approval | named human and irreversible boundary |
| Receipt | output path, schema, redaction/retention |

## Repository-specific reconciliation

- MinIO → SSE-KMS S3: compare object count and total bytes, not ETags.
- Attachment migration: SHA-256/readback plus complete receipt.
- Identity: complete owner/admin inventory and reviewed collisions; never email
  local-part inference.
- Account erasure: API rows, storage metadata, all S3 versions/delete markers,
  assistant data, Cognito identities, and payment blockers.
- Schema: additive/idempotent rollout behavior while old and new tasks coexist.

## Authoritative runbooks

- `docs/runbooks/migration.md`
- `docs/runbooks/identity-migration.md`
- `docs/runbooks/assistant-attachment-migration.md`
- `docs/runbooks/account-data.md`
- `docs/runbooks/rds-restore-drill.md`

Commands in runbooks are documentation, not pre-approved execution.
