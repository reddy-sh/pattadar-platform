---
name: reference-data-ingestion
description: Use this skill when importing, refreshing, validating, or reviewing Pattadar AP-IGRS reference data, districts/mandals/villages/SRO/deed types/fees, village-map KMZ/KML, boundaries, FMB geometry, public-record corpus, or other geospatial/reference datasets.
compatibility: Requires repository import scripts/data/tests. Default is source/provenance and dry-run planning; database/S3/live source writes require explicit approval.
metadata:
  project: pattadar-platform
  standard: agentskills.io
  verified: "2026-09-16"
---

# Reference Data Ingestion

Treat source provenance, units, identity, geometry validity, and reconciliation
as product correctness. A script exit code does not prove the imported dataset.

## Workflow

1. Read `references/ingestion-gates.md`; identify authoritative source/license,
   retrieval date, coverage, schema/version, units/CRS, stable keys, and target.
2. Profile/validate input before mutation: malformed/missing/duplicate rows,
   encoding, coordinate ranges/rings, subdivision/survey identifiers, extent
   units, and source-specific semantics.
3. Design idempotent staging/upsert with reject/quarantine output and a rollback
   or previous-version path. Do not silently coerce damaged geometry/data.
4. Define reconciliation: input/accepted/rejected counts, key uniqueness,
   spatial/area sanity, checksums/bytes, sample round-trips, and consumer tests.
5. Present exact dry-run/write plan and require explicit approval for database,
   S3, network, or live corpus actions. Preserve receipts and provenance.
6. Hand schema/service changes to `backend-contract-change`, live movement to
   `safe-data-migration`, and focused checks to `verify-change`.

Never expose private land/document/party data, infer legal ownership, or convert
source extent units without an explicit domain rule.
