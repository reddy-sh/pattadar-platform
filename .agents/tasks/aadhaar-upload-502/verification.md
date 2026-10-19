# Verification: Aadhaar upload 502 (iteration 1)

Date: 02/10/2026. Local only. No services were started, restarted or stopped.
No secrets were read: `.local/*.env` values were not opened, and only synthetic data was used (`123456789012`, `b'card'`, `b'pdf bytes'`).

## Python (services/api, `.local/api-venv`, `ALLOW_INSECURE_LOCAL=1`)

| Command | Result |
|---|---|
| Baseline, before changes: `pytest -q -rs tests/test_aadhaar_security.py tests/test_import_jobs.py tests/test_ai_reading_dedupe.py tests/test_ai_reading.py tests/test_inbox.py` | 56 passed, 0 skipped |
| The same five files, after changes | 61 passed (5 new), 0 skipped. The PostgreSQL job tests really ran. |
| Fails without the fix: HEAD versions of `aadhaar.py`, `operations.py`, `jobs.py` swapped in temporarily, then `pytest -k "write_path or 503_not_502" tests/test_import_jobs.py` | 2 failed as expected. `..._never_reaches_the_provider`: 200 ≠ 503. `..._503_not_502`: 502 ≠ 503, the reported status. The files were then restored. |
| Full suite: `pytest -q -rs` | 528 passed, 0 skipped |

New tests:
- `test_aadhaar_security.py::test_local_without_a_key_has_no_write_path_and_names_it`
- `test_aadhaar_security.py::test_local_validation_warns_instead_of_failing`
- `test_ai_reading.py::test_aadhaar_reading_without_a_write_path_is_refused_before_the_provider`
- `test_import_jobs.py::test_aadhaar_job_without_a_write_path_fails_named_and_never_reaches_the_provider`: 503, named reason, provider never called, source cleared, no automatic retry
- `test_import_jobs.py::test_aadhaar_protection_failure_after_the_read_is_503_not_502`: the exact log path; 503, no digits in the body, no automatic retry

## TypeScript / web

| Command | Result |
|---|---|
| `bun run --cwd apps/web typecheck` | exit 0 |
| `bun test apps/web/src/api/client.test.ts` | 8 pass, 0 fail (includes the new Aadhaar 503 test: 1 submit, 2 polls, reason preserved) |
| `for s in scripts/*-tests.ts` (17 guards) | 16 pass. `typography-tests.ts` fails TY-5 only at `apps/university/src/styles.css:1488/1520/1538` (`font-weight: 800`). That committed file is unrelated and was not touched, so the failure was already there. |
| `bun run scripts/icon-guard.ts` | exit 0 |
| `bun run scripts/ux-guards.ts` | exit 0 |
| `bunx playwright test specs/07-record-people.spec.ts --project=app -g "Aadhaar"` | NOT RUN. Global setup refuses because nothing serves the web dev server, and the suite never starts one itself. The spec expectation was updated but not executed. |

## Not verified

- An end-to-end browser scan with a working key. This needs Reddy's config decision (plan §f), an API restart and a synthetic card image.
- e2e-app spec 07 (see above).

## Working-tree notes

- `.kiro/skill-evals/portfolio.json` and `.kiro/skills/README.md` were modified during this run by another session (heuristic-ux-audit wording). They are not from this task and were left untouched.
- Scratch copies in `/tmp/aadhaar502` were removed.
