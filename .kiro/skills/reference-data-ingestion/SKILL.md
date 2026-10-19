---
name: reference-data-ingestion
description: "Use this skill when importing, refreshing, validating, or reviewing Pattadar shared reference data: LGD geography (services/api/scripts/sync_geography.py), AP-IGRS registration CSVs (SRO offices, deed types, fees), village-map KMZ/KML archives and their /vm publish or upload, or the read-only public-record corpus. Not for per-record FMB reading or an owner's boundary file (web-feature-delivery) or user-data backfills (safe-data-migration)."
compatibility: Requires repository import scripts/data/tests. Default is source/provenance and dry-run planning; database/S3/live source writes require Reddy's explicit approval.
metadata:
  project: pattadar-platform
  standard: agentskills.io
  verified: "2026-10-09"
---

# Reference Data Ingestion

Treat source provenance, units, identity, geometry validity, and reconciliation
as product correctness. A script exit code does not prove the imported dataset.

Scope: LGD geography covers states, districts, mandals and villages; the AP-IGRS registration CSVs are bundled in the repo. Not this skill: per-record FMB reading, record boundary drawing or an owner's own boundary file (web-feature-delivery or backend-contract-change, with functional-acceptance).

## Workflow

1. Read `references/ingestion-gates.md`; identify authoritative source/license,
   retrieval date, coverage, schema/version, units/CRS, stable keys, and target.
2. Profile/validate input before mutation: malformed/missing/duplicate rows,
   encoding, coordinate ranges/rings, subdivision/survey identifiers, extent
   units, and source-specific semantics.
3. Use the dataset's existing loader and its write behaviour (gates file, "How
   each dataset loads"); design new staging/upsert, with reject/quarantine
   output and a previous-version path, only for a dataset that has none. Do not
   silently coerce damaged geometry/data.
4. Define reconciliation: input/accepted/rejected counts, key uniqueness,
   spatial/area sanity, checksums/bytes, sample round-trips, and consumer tests.
5. Before any database, S3, network or live-corpus action (non-dry-run
   `sync_geography.py`, a remote-URL input, `vm-publish.py --execute`, a corpus
   query), show Reddy the scope, environment, exact command, side effects, data
   exposure, reversibility and expected evidence, and wait for his explicit
   approval. Get a fresh confirmation immediately before a write that retires
   rows or deletes keys. Preserve receipts and provenance.
6. Hand schema/service changes to `backend-contract-change`, the village-maps
   bucket/CloudFront apply to `infrastructure-change`, live movement to
   `safe-data-migration`, and focused checks to `verify-change`. The repo only
   reads the public-record corpus; a corpus refresh is out of repo: stop and
   ask Reddy, with `security-review`, `compliance-evidence` and
   `assistant-quality`.

Never expose private land/document/party data, infer legal ownership, or convert
source extent units without an explicit domain rule.
