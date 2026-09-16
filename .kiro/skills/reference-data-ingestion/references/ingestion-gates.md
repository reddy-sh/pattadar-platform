# Reference/Geospatial Ingestion Gates

| Gate | Evidence |
|---|---|
| Provenance | source URL/file, license/authority, retrieval date, checksum |
| Contract | columns/types/nulls/enums/stable key/version |
| Geography | CRS, lat/lon order/ranges, ring closure/validity, area/unit semantics |
| Quality | missing/duplicate/malformed counts and explicit rejection reasons |
| Idempotency | staging/upsert key, rerun behavior, previous-version rollback |
| Reconciliation | input=accepted+rejected, unique keys, counts/bytes/checksums, sample queries/maps |
| Consumers | API/core/web/iOS/mobile expectations and focused tests |
| Receipt | source version, command/mode, counts, rejects, operator, timestamp |

Relevant sources include `services/api/data/*.csv`, `scripts/village-map-import.py`,
`data/vm`, generated `apps/web/public/vm`, FMB/geometry modules/tests, and the
assistant public-record read-only corpus. Inventory actual paths before use.
