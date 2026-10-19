# Aadhaar vault, opt-in card on S3, last-4-only display (implementation review, pass 2)

This change fixes the broken Aadhaar upload. The local API never received `AADHAAR_ENC_KEY`, so every paid read failed after the provider call with a 502. Now a scan with no write path gets a named 503 before any job row exists or the provider is called. Every read or typed Aadhaar becomes a record in `aadhaar_candidates` holding the extracted fields and last 4 digits. The full 12 digits exist only as `aadhaar_vault` ciphertext (KMS in prod, Fernet locally, one `vault_put` flow), and nothing decrypts them at runtime. An opt-in card goes to Drive through the gateway under a `{node}/{version}` SSE-KMS key. A reviewed, idempotent `clear_aadhaar.py` cleared the local data, and the prod procedure waits on Reddy. This pass checks the two pass-1 findings. Both are fixed, and the edits since pass 1 add no new concern.

Watch for: nothing blocking. The parity gate's last error belongs to another session's `landcalc.ts`, and CI will stay red until that session lands its Swift twin or this change is committed without it.

**Verdict**: APPROVED

## High-level view

Pass 1's MEDIUM was the CI parity gate. `operations.ts` gained `LINK_AADHAAR_CARD_MUTATION` while its Swift twin stayed unchanged. The parent workflow relayed Reddy's choice of option (a), which is in this workflow's session log, not only in the fixer's notes. Under that choice `Queries.swift` gets an inert `Mutations.linkAadhaarCard` whose text matches the core constant exactly, with no caller. design.md §5.3/§10 record the approved deviation. `parity-check.ts` now reports a single `[twins]` error, `packages/core/src/land/landcalc.ts` → `Boundary.swift`. That file is another session's dirty edit and not part of this change.

Pass 1's NIT was the parity contract's "No iOS source changed". The contract now says no iOS *behaviour* changed, and it names the `DocSpine.swift` doc-comment digits, the `DocSpineTests.swift` fixture and the approved `Queries.swift` twin.

Since pass 1, only `Queries.swift`, the parity contract and design.md changed, so pass 1's findings on the API, gateway, web, Expo, the clear script and the docs still stand. All the regression tests named in the brief exist and were rerun in this pass.

<details>
<summary>Issues (0)</summary>

No open issues. Both pass-1 findings are resolved.

</details>

<details>
<summary>Details</summary>

### Regression evidence rerun in this pass

None of these runs skipped a test, local Postgres was up, and no source was edited.

```
API Aadhaar-related suites (10 files)        170 passed
API full suite                               624 passed (see audit flake note)
gateway full suite                           182 passed
swift test --filter 'DocSpineTests|VectorTests'   37 passed (PattadarKit incl. Queries.swift builds)
scripts/aadhaar-digits-tests.ts              PASS
scripts/emit-vectors.ts --check              VECTORS CURRENT
scripts/parity-check.ts                      1 error: [twins] landcalc.ts (other session)
```

Each named regression maps to a test, all passing:

- no-key 503 not 502 before provider/job row: `test_import_jobs.py:133 test_aadhaar_submit_without_a_write_path_is_503_and_stores_nothing` and `test_ai_reading::…without_a_write_path_is_refused_before_the_provider`.
- vault round trip: `test_aadhaar_security.py` KMS `create_record` and `:224 test_fernet_mode_writes_the_same_vault_table`.
- masked-only responses: `:265 test_extraction_stores_exactly_what_it_returns_and_never_the_digits` and the import-job result test.
- no runtime decrypt: `:244 test_no_runtime_path_decrypts_the_vault`. `grep` finds no caller of `_decrypt_bytes` in `src/`.
- card under `{node}/{version}` with SSE: `services/gateway/tests/test_aadhaar_card_storage.py`.
- clear idempotency: `test_clear_aadhaar.py:497` dry-run → execute → zero re-run, plus the partial-failure re-run.
- reference-safe deletion: `:656 test_referenced_cards_are_refused_and_kept`, parametrised over every `file_ref`/`*_file_ref`/`photo_ref` shape including `record_people.photo_ref` and a quoted new table.
- old-sweep safety: `test_aadhaar_vault_db.py:211 test_the_previous_releases_sweep_spares_durable_records`.

### Audit worker flake on the shared DB

`tests/test_audit.py::test_enqueue_then_worker_drains_to_read_model` failed in 4 straight full-suite runs early in this pass. A fifth full run passed with 624/624, and both the isolated test and the whole file passed repeatedly (**confirmed**). The test uses the shared `main.DSN` database. While it failed, `pg_stat_activity` showed two other clients on that DB. One's last query was a `pg_advisory_unlock`, which suggests an `init_db` boot from a process outside this review. Its `run_one` drains the oldest pending outbox row, so a concurrent worker or leftover rows can take the test's event. This change's only edit to `audit.py` is one `_spec` line, and `test_audit.py` is unmodified. This is a pre-existing test-isolation weakness, not a finding against this change. CI uses a fresh database, so it should not be affected there, but that was not observed in this pass.

</details>

<details>
<summary>File map (pass-2 delta)</summary>

- `apps/ios/PattadarKit/Sources/PattadarKit/Networking/Queries.swift`: inert `Mutations.linkAadhaarCard` twin, no caller (Reddy-approved deviation).
- `docs/specs/2026-08-22-web-ios-parity-contract.md`: Aadhaar vault entry reworded to "no iOS behaviour changed" and now records the approved twin plus `sync-ios` follow-ups.
- `.agents/tasks/aadhaar-vault-s3/design.md`: §5.3 approved-deviation note, §10 "In this change set" line.

The pass-1 file map still covers the full change set. Full diff: `git diff` plus the untracked files in the brief, excluding the other-session files listed in `context.json`.

</details>
