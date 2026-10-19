---
name: safe-data-migration
description: "Use this skill to plan or review a Pattadar data, schema, storage, identity, consent, attachment, account-erasure, Aadhaar clear/backfill, MinIO-to-S3 or owner-key migration or backfill, including init_db boot-time backfills, and to verify restored data. Agents run an approved migration only on local or disposable data. Not for RDS restore mechanics (platform-lifecycle) or additive DDL with no data movement (backend-contract-change)."
compatibility: Requires pattadar-platform migration runbooks. Default mode is planning/read-only; database, filesystem, Cognito, AWS, and writer-control operations require explicit approval.
metadata:
  project: pattadar-platform
  standard: agentskills.io
  verified: "2026-10-09"
---

# Safe Data Migration

Default to a reviewed plan. Never infer that a migration is complete from a
successful command; completeness comes from reconciliation against a declared
source inventory.

Compose with `pattadar-security-review` for identity, Aadhaar, consent or
erasure data, `platform-lifecycle` for restore mechanics, `runbook-consistency`
for runbook drift, and `release-readiness`, which needs this skill's receipts
for the exact SHA.

Not this skill: reference or geospatial dataset imports (`reference-data-ingestion`),
test fixtures or disposable-DB harnesses (`test-governance`), or diagnosing a
live incident (`incident-triage`).

## Workflow

1. Read `references/evidence-gates.md` and the authoritative runbook for the
   migration type. Before quoting a runbook command, check every path, table,
   column, key format and count against current code and DDL; report drift and
   hand it to `runbook-consistency`.
2. Define source/destination, data classes, owner keys, expected counts/bytes,
   active writers, rollback compatibility, and irreversible steps.
3. Require backup/inventory and a read-only preview before writes.
4. Sequence prerequisites before data movement (for example malware protection
   before S3 PUTs, durable bucket/IAM before attachment copy).
5. Present the exact execution plan (every plan field in evidence-gates.md) and
   wait for environment-specific approval.
6. Freeze/drain writers only when required, run idempotently, reconcile every
   row/object, preserve receipts, and retain old data through the rollback
   window.
7. Stop on unknown, missing, foreign-owner, or mismatched data; do not label a
   partial result migrated.

## Boot-time backfills

`init_db` runs on every API start (the `lifespan` in
`services/api/src/main.py`), so adding or changing a backfill or cleanup there
executes it on the next local restart and in every environment at the next
deploy, with no `--execute`. Plan and get approval for it like any migration.
Require: idempotency; a `platform_settings` marker row written in the same
transaction for one-time or destructive steps; abort without
writing or marking on unknown or non-empty data; logs that carry counts, never
owner ids, names or numbers; and a test that boots it twice on a populated
temporary Postgres.

## Safety

Never print PII, secrets, owner inventories, or document contents. Never dump,
restore, copy, re-PUT, alter, erase, freeze writers, query live user data, call
AWS/Cognito, or pass `--execute` without explicit approval naming every plan
field, and a fresh confirmation immediately before execution. With that
approval an agent runs only against local or disposable data. Dev and prod runs
are an operator's, from the agent's plan; agents never run them.
