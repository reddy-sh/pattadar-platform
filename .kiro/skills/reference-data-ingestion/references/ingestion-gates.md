# Reference/Geospatial Ingestion Gates

| Gate | Evidence |
|---|---|
| Provenance | source URL/file, license/authority, retrieval date, checksum |
| Contract | columns/types/nulls/enums/stable key/version |
| Geography | CRS, lat/lon order/ranges, ring closure/validity, area/unit semantics |
| Quality | missing/duplicate/malformed counts and explicit rejection reasons |
| Idempotency | staging/upsert key, rerun behavior, previous-version rollback |
| Snapshot scope | an LGD `--mode snapshot` file is the complete national table for that entity; anything partial (one state, one district) uses `--mode delta` |
| Reconciliation | input=accepted+rejected, unique keys, counts/bytes/checksums, sample queries/maps |
| Consumers | API/core/web/iOS/mobile expectations and focused tests |
| Receipt | source version, command/mode, counts, rejects, timestamp; no tool records who ran it, so name the operator in the approval record |

## How each dataset loads

| Dataset | Loader | Write behaviour |
|---|---|---|
| LGD states, districts, mandals (sub-districts), villages | `services/api/scripts/sync_geography.py` with `services/api/src/geography.py`, `services/api/tests/test_geography.py`, `services/api/README.md` §7 | `--dry-run` validates and counts accepted/rejected without PostgreSQL; it does not count retirements. A snapshot retires every active LGD row of that entity the file lacks or rejects, across all states; absence from a delta retires nothing. Remote inputs: HTTPS `gov.in` hosts only. Ledger: `reference_data_sources`, `reference_data_sync_runs`, `reference_data_changes`. |
| `services/api/data/states.csv`, `districts.csv`, `mandals.csv` | `_load_reference_data` in `services/api/src/main.py`, on every API start | Cold-start bridge, `ON CONFLICT (id) DO NOTHING`: an edit never reaches an existing database. Change geography through LGD. `mandals.csv` is also the village-map importer's placement table. |
| `services/api/data/sro_offices.csv`, `document_types.csv`, `fee_schedule.csv` | same, on every API start | DELETE and re-insert in every environment, with no dry run or receipt. Deed-type and fee ids are positional (`dt{i:03d}`, `fs{i:03d}`), and the W360 Tools page sends the fee id to `calculateStampDuty`. Treat a CSV commit as a deploy-time write: diff the counts, append rather than reorder, and call out any id shift. |
| Village-map archives `data/vm` (+ `placement.json`, `sources/*.json` manifests) | `scripts/village-map-import.py --out .local/vm-build` builds it (default `--out` is the committed fixture `apps/web/public/vm`); `scripts/vm-publish.py` publishes it (`docs/runbooks/village-maps-publish.md`) | Both write receipts to `.local/vm-receipts/`. Publish is a dry run unless `--execute`, which deletes keys no longer in the build (bucket versioned, 90 days) and invalidates `/vm/*`. Runbook §2 needs a Terraform apply first. |
| In-app village maps, `POST /village-maps` and `DELETE /village-maps/{key}` | `services/api/src/main.py` | User-driven writes to the shared `village_maps` table. Overwrite or delete only by the uploader or a platform admin; the audit log records the uid. |
| Public-record corpus (`land` schema) | none in this repo | `services/assistant/src/public_records/database.py` reads it in READ ONLY transactions. A refresh happens outside the repo. |

Inventory actual paths before use.
