---
name: safe-data-migration
description: Use this skill to plan, review, or explicitly execute a Pattadar data, schema, storage, identity, consent, attachment, account-erasure, MinIO-to-S3, or owner-key migration/backfill with backup, writer control, reconciliation, rollback, and evidence gates. For RDS restore mechanics compose with platform-lifecycle; this skill owns restored data correctness.
compatibility: Requires pattadar-platform migration runbooks. Default mode is planning/read-only; database, filesystem, Cognito, AWS, and writer-control operations require explicit approval.
metadata:
  project: pattadar-platform
  standard: agentskills.io
  verified: "2026-09-16"
---

# Safe Data Migration

Default to a reviewed plan. Never infer that a migration is complete from a
successful command; completeness comes from reconciliation against a declared
source inventory.

## Workflow

1. Read `references/evidence-gates.md` and the authoritative runbook for the
   migration type.
2. Define source/destination, data classes, owner keys, expected counts/bytes,
   active writers, rollback compatibility, and irreversible steps.
3. Require backup/inventory and a read-only preview before writes.
4. Sequence prerequisites before data movement (for example malware protection
   before S3 PUTs, durable bucket/IAM before attachment copy).
5. Present the exact execution plan and wait for environment-specific approval.
6. Freeze/drain writers only when required, run idempotently, reconcile every
   row/object, preserve receipts, and retain old data through the rollback
   window.
7. Stop on unknown, missing, foreign-owner, or mismatched data; do not label a
   partial result migrated.

## Safety

Never print PII, secrets, owner inventories, or document contents. Never dump,
restore, copy, re-PUT, alter, erase, freeze writers, query live user data, call
AWS/Cognito, or pass `--execute` without explicit approval naming environment,
backup, rollback, and reconciliation criteria.
