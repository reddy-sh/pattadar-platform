# Verification — Aadhaar vault change

## Fix log — convergence iteration 1 (cross-FEAT integration, 03/10/2026)

No `impl-review.md` yet, so this pass was integration verification across FEAT-001..005. No source edits were needed. No commit, no push, LOCAL ONLY.

| Command | Result |
|---|---|
| `bun run typecheck` | exit 0 (tokens, core, university, web, mobile) |
| `bun test packages/core apps/web/src apps/mobile/tests apps/university/src` | 321 pass, 0 fail (34 files) |
| `for s in scripts/*-tests.ts; do bun run "$s"; done` (18 guards) | all exit 0 except `typography-tests.ts` TY-5 at `apps/university/src/styles.css:1488/1520/1538` (font-weight 800), the pre-existing baseline |
| `bun run scripts/icon-guard.ts` / `bun run scripts/ux-guards.ts` | exit 0 / exit 0 |
| `bun run scripts/parity-check.ts` | exit 1, 2 `[twins]` errors, unchanged since FEAT-003: `landcalc.ts` (another session's dirty file) and `operations.ts` without `Queries.swift` (recorded `sync-ios` follow-up; iOS source change is a Reddy decision per design §5.3/§10) |
| `cd services/api && ../../.local/api-venv/bin/python -m pytest -q -rs` | 624 passed, 0 skipped |
| `.local/gateway-venv/bin/python -m pytest services/gateway/tests -q` | 182 passed |
| `.local/api-venv/bin/python scripts/ai-boundary-guard.py --selftest` and run | selftest passed; 716 product files, OK |
| `bun run scripts/aadhaar-digits-tests.ts` | AADHAAR DIGITS TESTS PASS, exit 0 |
| `bash -n scripts/start-local.sh` | exit 0 |
| Ad hoc digit scan of the 17 untracked non-`.agents/` files (same rules as the guard, UUIDs stripped, path:line only) | 0 hits |

Seam checks (static):

- `LINK_AADHAAR_CARD_MUTATION` (core) matches the `link_aadhaar_card(candidate_id, node_id, version_id) -> bool` resolver, the API contract test, spec 07 and the runbook. The audit label and `isSecurityAction` in core match the `audit._SPECS` entry (`security=True`, not critical).
- Web `PersonDialog` reads `aadhaarMasked`/`aadhaarCandidateId`/`name`/`dob`/`gender`/`address` from the async job result. `apiFetch` routes `extract-aadhaar` to `-async` and polls. These are the fields `secure_extraction_result` returns. The gateway storage response maps `current_version_id` to `currentVersionId`, which the link call needs.
- The runbook's local clear procedure uses only flags that `clear_aadhaar.py` defines. "The script refuses `--execute` when `linked>0`" matches the script's guard.

Not run in this pass: Playwright spec 07, `swift test`, and the live stack/clear. FEAT-003 and FEAT-005 ran them and recorded the results, and no code changed since.

Cleanup: no processes started and no listeners on 8080/8081/8082/5173/5180/5181. The `/tmp/aadhaar-fix-*` logs were removed. A leftover Postgres schema `test_cap_*` (from `test_capabilities_settlement.py`, not an Aadhaar test) exists on the local `postgres` DB. Its ownership is uncertain, so I left it.

## Fix log: convergence iteration 2 (impl-review findings, 03/10/2026)

This pass fixes both `impl-review.md` findings. No commit, no push. LOCAL ONLY.

- **Finding 1 (MEDIUM, parity twin).** Reddy picked option (a), which approves one iOS source edit. `Queries.swift` gets an inert `public static let linkAadhaarCard` (doc comment plus a triple-quoted literal, after `updateProfileAadhaar`). Its text matches `LINK_AADHAAR_CARD_MUTATION` byte for byte (checked with `diff`), and nothing calls it. No other `apps/ios` change. design.md §5.3 records the approved deviation, and the §10 "In this change set" line is updated to match. The parity contract now records Reddy's approval, and its `sync-ios` follow-up points at the existing constant.
- **Finding 2 (NIT).** The parity contract now says no iOS *behaviour* changed. It names the `DocSpine.swift` doc-comment digits, the `DocSpineTests.swift` fixture, and the approved `Queries.swift` twin.

| Command | Result |
|---|---|
| `bun run scripts/parity-check.ts` | exit 1, **1** error left: `[twins] landcalc.ts` (another session's dirty file). The `operations.ts` twin error is gone. Check 3 (queries vocabulary) reports nothing, so `linkAadhaarCard` resolves against the schema. |
| `bun run scripts/emit-vectors.ts --check` | VECTORS CURRENT, exit 0 |
| `cd apps/ios/PattadarKit && swift test --filter 'DocSpineTests\|VectorTests'` | exit 0, 37 tests passed. The PattadarKit module, including `Queries.swift`, builds. Swift 6.4. |
| `bun run typecheck` | exit 0 |
| `bun test packages/core` | 188 pass, 0 fail |
| `bun run scripts/aadhaar-digits-tests.ts` | AADHAAR DIGITS TESTS PASS |
| `for s in scripts/*-tests.ts; do bun run "$s"; done` | all exit 0 except `typography-tests.ts` TY-5 at `apps/university/src/styles.css:1488/1520/1538` (pre-existing baseline) |

Not rerun: the API and gateway pytest suites, Playwright spec 07 and the live stack. No Python, web or e2e source changed in this pass. Their iteration-1 results stand.

Cleanup: this pass started no long-running processes, and nothing is listening on 8080/8081/8082/5173/5180/5181. The `/tmp/aadhaar-fix-swift.log` file was removed. The SwiftPM `.build` cache under `apps/ios/PattadarKit` already existed and is gitignored, so it was left in place.

## Final verification (finalize step, 03/10/2026)

`impl-review.json` verdict is APPROVED with 0 findings, and all five FEATs are `completed`. This step made no source edits. The work stays uncommitted (no commit, no push), LOCAL ONLY. Local Postgres was up on :5432, and no listener was on 8080/8081/8082/5173/5180/5181 before or after.

| Command | Result |
|---|---|
| `cd services/api && ../../.local/api-venv/bin/python -m pytest -q -rs` (run 5 times) | 2 runs 624 passed. 3 runs 623 passed with 1 failure, always `tests/test_audit.py::test_enqueue_then_worker_drains_to_read_model`. This is the known shared-DB flake from impl-review: it passes in isolation and in 4 of 5 `test_audit.py` file runs, two foreign clients were on the `pattadar` DB, and the change only adds one `_spec` line to `audit.py` and does not touch `test_audit.py`. |
| API Aadhaar-related suites (10 files incl. `test_clear_aadhaar.py`, `test_profile_update.py`) | 170 passed, 0 skipped |
| `.local/gateway-venv/bin/python -m pytest services/gateway/tests -q` | 182 passed |
| `bun run typecheck` | 5 of 5 workspaces exit 0 |
| `bun test packages/core apps/web/src apps/mobile/tests` | 293 pass, 0 fail (33 files) |
| `for s in scripts/*-tests.ts` (18 guards incl. `aadhaar-digits-tests.ts`, `shared-components-tests.ts`) | 17 exit 0. `typography-tests.ts` fails only on TY-5 at `apps/university/src/styles.css:1488/1520/1538` (font-weight 800), which is the pre-existing baseline. |
| `bun run scripts/icon-guard.ts` / `bun run scripts/ux-guards.ts` | ICON GUARD PASSES / UX GUARDS PASS |
| `bun run scripts/parity-check.ts` | exit 1, 1 error: `[twins] packages/core/src/land/landcalc.ts`. That file is another session's dirty edit, not part of this change. |
| `bun run scripts/emit-vectors.ts --check` | VECTORS CURRENT |
| `scripts/ai-boundary-guard.py --selftest` and the run | passed / OK |
| `bash -n scripts/start-local.sh` | exit 0 |
| `grep -rn _decrypt_bytes services/api/src` (source only) | no caller outside its definition |
| Secret scan, gitleaks 8.30.0: `git diff --binary \| gitleaks stdin --redact` (unstaged), `gitleaks dir --redact <file>` for each of the 72 untracked files, plus a filename check for `.env*`/`.local/`/`*.pem`/`*-key.env`/`*.tfvars` | no leaks found, no sensitive filenames, nothing staged (0 files) |

Checked existence only, without reading: `.local/cognito-local.env` and `.local/aadhaar-key.env` both exist, and `.local/aadhaar-key.env` is gitignored.

Not rerun in this step: `swift test` (iteration 2 ran it, and no Swift changed since), Playwright spec 07 (FEAT-003 and FEAT-005 ran it, and no web/e2e source changed since), and the live local stack/clear (FEAT-005). Git history was not scanned. No CI, AWS, dev or prod check was run.

Cleanup: the `/tmp/aadhaar-final-*` logs from this step were removed, and no task-started process is running. Left in place because ownership is uncertain or they existed before the task: the Postgres schema `test_cap_*`, the gitignored `__pycache__` folders, and the other sessions' files under `.local/impl-scratch`.
