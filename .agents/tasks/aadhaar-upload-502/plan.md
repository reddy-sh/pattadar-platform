# Aadhaar upload 502: investigation and implementation plan

Workspace: `/Users/reddy.sh/reddy.sh/projects/pattadar-platform` (use absolute paths).
The working tree already has unrelated uncommitted edits (for example
`services/api/src/main.py`, several `apps/web/src/w360/*` files). Do not touch,
revert or stage them. Do not commit anything.

## (a) Root cause, with evidence

The 502 does not come from the gateway proxy. The API's durable worker crashes
*after* the paid provider call succeeds. It stores the job as `failed` with
status 502. `GET /import-status/{job}` then replays that stored status as the
HTTP status, and the gateway passes it through unchanged.

Redacted local evidence (`.local/api.log`, 02/10/2026 18:52; there were two
jobs because the user clicked twice, which is why the toast appeared twice):

```
POST /extract-aadhaar-async 200
GET /import-status/40870d48… 200   (running)
GET /import-status/40870d48… 200   (running)
INFO httpx POST https://api.anthropic.com/v1/messages "HTTP/1.1 200 OK"
INFO pattadar ai.usage endpoint=extract-aadhaar attempt=first … usd=0.0046
ERROR pattadar.import_jobs Document reading failed (job=40870d48…)
  File "services/api/src/ai_reading/jobs.py", line 166, in run_one
    result = await aadhaar.secure_extraction_result(row["owner_user_id"], result)
  File "services/api/src/aadhaar.py", line 273, in secure_extraction_result
    ciphertext = await _encrypt_bytes(payload, owner, "aadhaar-candidate", candidate_id)
  File "services/api/src/aadhaar.py", line 172, in _encrypt_bytes
    raise RuntimeError("Aadhaar protected writes are not enabled")
RuntimeError: Aadhaar protected writes are not enabled
GET /import-status/40870d48… 502 Bad Gateway
```

`.local/gateway.log` shows the upstream `GET http://localhost:8080/import-status/… "HTTP/1.1 502 Bad Gateway"` forwarded as is. `.local/assistant.log` has nothing relevant.

Code path:
1. `apps/web/src/pages/families/PersonDialog.tsx` `handleAadhaar` →
   `apiFetch('/api/gateway/pattadar/extract-aadhaar', POST)`.
2. `apps/web/src/api/client.ts` `apiFetch` → `readAsync` (`ASYNC_READS`). This
   POSTs `-async`, then polls `import-status/{job}` every 1.5 s, and returns
   the non-ok response as is (client.ts:105 is the `fetch` the DevTools
   initiator names).
3. `services/api/src/ai_reading/jobs.py` `run_one` → handler
   `operations.extract_aadhaar` (the provider call succeeds and is charged) →
   `aadhaar.secure_extraction_result` → `aadhaar._encrypt_bytes`. That raises
   `RuntimeError`, the generic `except Exception` turns it into
   `code=502, {"error": "The document could not be read. You can try again."}`,
   and `jobs.status` returns `status_code=row["status"]` (502).
4. `PersonDialog` sees `!res.ok` and shows the fixed toast "Could not read the
   Aadhaar". The server's reason is thrown away.

Why `_encrypt_bytes` refuses: local dev runs with `APP_ENV` unset (= `local`),
no `AADHAAR_KMS_KEY_ARN`, and `ALLOW_INSECURE_LOCAL=1`. The only local write
path is Fernet, and it needs `AADHAAR_ENC_KEY`. I checked the running API's
env var names (names only): only `ALLOW_INSECURE_LOCAL` and
`ANTHROPIC_API_KEY` are set. `AADHAAR_ENC_KEY` is absent.
`scripts/start-local.sh` (API launch block, about lines 255–266) never passes
`AADHAAR_ENC_KEY`. The gitignored file `.local/aadhaar-key.env` contains exactly
one key, `AADHAAR_ENC_KEY` (I did not read the value), but no script sources
it.

I reproduced this in-process with synthetic bytes. With `ALLOW_INSECURE_LOCAL=1`
and no key, `_encrypt_bytes` raises `RuntimeError: Aadhaar protected writes are
not enabled`. With a throwaway generated Fernet key, it returns a `fernet:v0:`
token.

Regressing commit: `14b82467e0d3c3052e54662744f7ff68ef9f5ff8` (19/09/2026,
"feat(api): hash-chained audit ledger, KMS Aadhaar fields and the AI reading
pipeline"). Before it, `main.py extract_aadhaar` returned the provider fields
directly, and encryption (`encrypt_aadhaar`, which needs `AADHAAR_ENC_KEY`)
happened only when a member was saved. So scanning worked without a key. That
commit added `aadhaar.secure_extraction_result`, which encrypts a one-use
candidate during the reading. Every Aadhaar scan therefore now needs a write
path, but `start-local.sh` was never updated to supply one.
`aadhaar.validate_configuration()` skips local/test entirely, so nothing warns
at startup. Two consequences of the design gap: the provider is charged before
the refusal, and the owner is told "try again", which will fail and charge
again.

Not the cause: the gateway proxy or its timeouts, `services/assistant`, the
client's polling (it stops at the first non-ok status and never re-submits),
and the Anthropic key (the provider returned 200).

## (b) Fix

Root-cause fix for the reported local breakage: a configuration decision. See
(f). It cannot be fixed in code without changing how a credential is wired.

Code fix (in scope, no credential change): make a missing Aadhaar write path
fail closed before the paid provider call. Report it with a named reason and
status 503 instead of a generic 502 "try again". Surface the server's reason in
the dialog. Decisions:

- Keep `aadhaar.py` framework-free and expose `write_path_available()`. The
  write-mode decision moves into one helper that both `_encrypt_bytes` and the
  preflight use, so they cannot drift.
- Put the preflight in `operations.extract_aadhaar`, after the consent check and
  before `file.read()`/`vision_extract`. That one point covers both the sync
  route and the durable job (`JOB_HANDLERS["extract-aadhaar"]` is this
  function). It also leaves `test_ai_reading_dedupe.py` unchanged, because
  that test uses a fake handler.
- Map `aadhaar.ProtectionUnavailable` in `jobs.run_one` to 503 with its PII-free
  message, for the case where protection fails after the call (for example a
  KMS outage). Never retry. The existing no-retry invariant is unchanged.
- Only the client toast text changes. Polling and retry behavior stay as they
  are.

## (c) Files that change

- `services/api/src/aadhaar.py`
- `services/api/src/ai_reading/operations.py`
- `services/api/src/ai_reading/jobs.py`
- `services/api/tests/test_aadhaar_security.py`, `services/api/tests/test_ai_reading.py`, `services/api/tests/test_import_jobs.py`
- `apps/web/src/pages/families/PersonDialog.tsx`
- `apps/web/src/api/client.test.ts`
- `tests/e2e-app/specs/07-record-people.spec.ts`
- `docs/runbooks/aadhaar-kms-rollout.md`

The gateway, assistant, packages/core, iOS and Expo do not change. Expo
`apps/mobile/src/app/add-member.tsx` already shows `e.message`.

# Implementation Plan

- [ ] 1. Add a single write-path decision and a named exception to `aadhaar.py`.
      - Add `class ProtectionUnavailable(RuntimeError)` and
        `UNAVAILABLE_MESSAGE = "Aadhaar reading is not available on this server: Aadhaar protection is not configured. Nothing was sent for reading."`
        (PII-free, no key values).
      - Add `_write_mode() -> str` that returns `"kms"`, `"fernet"` or `""`,
        using exactly the conditions now inlined in `_encrypt_bytes`:
        - `"kms"` when `AADHAAR_KMS_KEY_ARN` is set and (local/test or
          `AADHAAR_KMS_WRITES_ENABLED=1`).
        - `"fernet"` when (`AADHAAR_LEGACY_WRITE_BRIDGE=1` or (local/test and
          `ALLOW_INSECURE_LOCAL=1`)) and `AADHAAR_ENC_KEY` is non-empty after
          strip.
      - Rewrite `_encrypt_bytes` to branch on `_write_mode()`. Keep `_fernet()`
        raising `RuntimeError("AADHAAR_ENC_KEY is invalid")` for a malformed
        key, as today. The final raise becomes
        `ProtectionUnavailable("Aadhaar protected writes are not enabled")`
        (same text, so existing `match="not enabled"` tests keep passing).
      - Change `_unavailable(...)` to return
        `ProtectionUnavailable("Aadhaar protection is temporarily unavailable")`.
        It is still a `RuntimeError`, so no caller changes.
      - Add `write_path_available() -> bool`: `mode = _write_mode()`. For
        `"fernet"`, wrap `_fernet()` in `try/except RuntimeError: return False`.
        Return `bool(mode)`.
      - In `validate_configuration()`, for local/test log once:
        `_log.warning("aadhaar.write_path_missing: Aadhaar scans and saves will be refused; set AADHAAR_ENC_KEY with ALLOW_INSECURE_LOCAL=1 for local development")`
        when `not write_path_available()`. Do not raise, because CI and test
        environments run without a key.
      Files: `services/api/src/aadhaar.py`
      Verify: `cd /Users/reddy.sh/reddy.sh/projects/pattadar-platform/services/api && ALLOW_INSECURE_LOCAL=1 ../../.local/api-venv/bin/pytest -q tests/test_aadhaar_security.py`. All existing tests pass (baseline: 56 passed across the 5 files listed in item 5).

- [ ] 2. Refuse the Aadhaar reading before the paid call when there is no write path, and give post-call protection failures a named 503.
      - In `services/api/src/ai_reading/operations.py` `extract_aadhaar`,
        directly after `await require_read_consent(request)`, add:
        `if not aadhaar.write_path_available(): return JSONResponse(status_code=503, content={"error": aadhaar.UNAVAILABLE_MESSAGE})`
        with a one-line comment saying the refusal comes before the provider is
        charged.
      - In `services/api/src/ai_reading/jobs.py` `run_one`, add
        `except aadhaar.ProtectionUnavailable as exc:` before the generic
        `except Exception`. Log with `log.warning("Aadhaar protection unavailable (job=%s)", row["id"])`
        (no PII, no traceback payload) and set
        `code, result = 503, {"error": str(exc) + ". Nothing was saved."}`.
        Leave the `CancelledError`/no-retry branches untouched.
      Files: `services/api/src/ai_reading/operations.py`, `services/api/src/ai_reading/jobs.py`
      Verify: `ALLOW_INSECURE_LOCAL=1 ../../.local/api-venv/bin/pytest -q tests/test_ai_reading.py tests/test_import_jobs.py tests/test_ai_reading_dedupe.py tests/test_inbox.py` (from `services/api`). Existing tests pass. In particular, the consent-refusal test at `test_ai_reading.py:~245` still raises `PermissionError` first.

- [ ] 3. Add the API regression tests. Use only synthetic data, such as the existing `"123456789012"` fixture value and `b'card'` bytes. Never use real PII.
      - `tests/test_aadhaar_security.py`:
        - `test_local_without_a_key_has_no_write_path_and_names_it(monkeypatch)`:
          `APP_ENV=local`, `ALLOW_INSECURE_LOCAL=1`, delete `AADHAAR_ENC_KEY`
          and `AADHAAR_KMS_KEY_ARN` → `write_path_available()` is False, and
          `encrypt_number` raises `ProtectionUnavailable` (also an instance of
          `RuntimeError`). With `AADHAAR_ENC_KEY=Fernet.generate_key()` → True
          and the token starts with `fernet:v0:`. With `AADHAAR_ENC_KEY="not-a-key"`
          → False.
        - `test_local_validation_warns_instead_of_failing(monkeypatch, caplog)`:
          the same no-key env → `validate_configuration()` does not raise, and
          `aadhaar.write_path_missing` appears in caplog.
      - `tests/test_ai_reading.py`:
        `test_aadhaar_reading_without_a_write_path_is_refused_before_the_provider`.
        No-key env, monkeypatch `operations.vision_extract` to raise
        `AssertionError`, call `await operations.extract_aadhaar(file=upload(), request=None)`,
        and assert a `JSONResponse` with status 503 whose `error` is
        `aadhaar.UNAVAILABLE_MESSAGE`. Reuse that file's existing upload helper
        or pattern.
      - `tests/test_import_jobs.py`, using the existing `database()`/`request()`/`upload()` helpers:
        - `test_aadhaar_job_without_a_write_path_fails_named_and_never_reaches_the_provider(monkeypatch)`:
          no-key env, `jobs.handlers={'extract-aadhaar': operations.extract_aadhaar}`,
          and `operations.vision_extract` monkeypatched to record calls. Then
          `submit` → `run_one`, and `status` returns 503 with
          `state == 'failed'` and `error == aadhaar.UNAVAILABLE_MESSAGE`. Also
          check that calls == [], `source IS NULL`, and a second `run_one()` is
          False (no automatic retry).
        - `test_aadhaar_protection_failure_after_the_read_is_503_not_502(monkeypatch)`:
          no-key env, a fake handler returning `{'fields': {'aadhaar': '123456789012'}}`
          (this is the path from the log). `status` returns 503, the body
          `error` contains "not enabled", the body has no `aadhaar`/digits
          anywhere (`'123456789012' not in result.body.decode()`), and a second
          `run_one()` is False.
      Files: the three test files above.
      Verify: `cd services/api && ALLOW_INSECURE_LOCAL=1 ../../.local/api-venv/bin/pytest -q tests/test_aadhaar_security.py tests/test_ai_reading.py tests/test_import_jobs.py`. The new tests pass. Also confirm that the two job tests FAIL on the pre-change code (temporarily `git stash` only the files from items 1–2, or check by reasoning and state which). The DB tests need local PostgreSQL. They skip only when `TEST_PG_DSN` is unset and the connection fails, so report a skip as "not run", never as a pass.

- [ ] 4. Show the server's reason in the dialog, and pin it in tests.
      - `apps/web/src/pages/families/PersonDialog.tsx`: import `apiErrorMessage`
        alongside `apiFetch` from `../../api/client`, and replace
        `notify('Could not read the Aadhaar', 'error')` with
        `notify(await apiErrorMessage(res, 'Could not read the Aadhaar'), 'error')`.
        This follows the `DeedImportDialog.tsx:117` / `upload.ts:181` pattern;
        proxy HTML still falls back to the old sentence.
      - `apps/web/src/api/client.test.ts`: add
        `test('an Aadhaar reading that fails on the server returns its reason once, without re-submitting', …)`.
        The fake fetch returns `{job:'receipt'}` for `-async`, `{state:'running'}`
        once, then `Response.json({state:'failed', error:'Aadhaar protection is not configured'}, {status:503})`.
        Assert `result.status === 503`, that `apiErrorMessage(result, 'x')`
        returns the server error, that submits === 1, and that polling stopped
        after the 503 (exactly 2 status calls). Follow the style of the existing
        "failed readings preserve the server error" test.
      - `tests/e2e-app/specs/07-record-people.spec.ts` (test at about line 1779,
        "an Aadhaar that cannot be read says so…"): the seed answers
        `{state:'failed', error:'Nothing could be read from that file.'}`
        (`fixtures/seed.ts` about line 1293), so change the expectation from
        `'Could not read the Aadhaar'` to `'Nothing could be read from that file.'`.
        Update the comment that references `seed.ts:896` to the correct line.
      Files: `apps/web/src/pages/families/PersonDialog.tsx`, `apps/web/src/api/client.test.ts`, `tests/e2e-app/specs/07-record-people.spec.ts`
      Verify (from the repo root):
      - `bun run --cwd apps/web typecheck` passes.
      - `bun test apps/web/src/api/client.test.ts` passes, including the new test.
      - `for s in scripts/*-tests.ts; do bun run "$s" || exit 1; done && bun run scripts/icon-guard.ts && bun run scripts/ux-guards.ts` passes (UI file touched).
      - `cd tests/e2e-app && bunx playwright test specs/07-record-people.spec.ts --project=app -g "Aadhaar"`. If its web server cannot start locally, report it as not run. Do not claim a pass.

- [ ] 5. Document the local requirement and run the final checks.
      - In `docs/runbooks/aadhaar-kms-rollout.md`, next to the existing
        `ALLOW_INSECURE_LOCAL=1` sentence (about line 26), add that local
        Aadhaar scans and saves also need `AADHAAR_ENC_KEY`. Without a write
        path, the reading is refused with 503 before the provider is called,
        and local startup logs `aadhaar.write_path_missing`. Name keys only,
        never values.
      - Final: `cd services/api && ALLOW_INSECURE_LOCAL=1 ../../.local/api-venv/bin/pytest -q tests/test_aadhaar_security.py tests/test_import_jobs.py tests/test_ai_reading_dedupe.py tests/test_ai_reading.py tests/test_inbox.py`. Then run the full suite once: `ALLOW_INSECURE_LOCAL=1 ../../.local/api-venv/bin/pytest -q`.
      - Remove any scratch files. Restart no services. Stop no processes you did
        not start (the user's API on :8080 is user-owned).
      Files: `docs/runbooks/aadhaar-kms-rollout.md`
      Verify: the pytest runs above pass, and `git -C /Users/reddy.sh/reddy.sh/projects/pattadar-platform diff --stat` shows only the files in (c) plus the pre-existing unrelated edits.

## (d) Regression tests (summary)

API: the two job tests in `services/api/tests/test_import_jobs.py` reproduce
the exact log path. They assert 503 with a named reason, no provider call when
there is no write path, no digits in the result, and no automatic retry.
`test_ai_reading.py` covers the sync and handler preflight;
`test_aadhaar_security.py` covers the write-mode helper and the local warning.
Web: `apps/web/src/api/client.test.ts` (reason preserved, single submit,
polling stops); e2e-app spec 07 (toast shows the server reason).

## (e) Verification commands

See the Verify lines for each item. The Python suites run under
`/Users/reddy.sh/reddy.sh/projects/pattadar-platform/.local/api-venv` from
`services/api` with `ALLOW_INSECURE_LOCAL=1` (CI sets the same). TS checks:
`bun run --cwd apps/web typecheck` and `bun test apps/web/src/api/client.test.ts`,
plus every `scripts/*-tests.ts`, `scripts/icon-guard.ts` and
`scripts/ux-guards.ts`. Baseline before any change:
`pytest tests/test_aadhaar_security.py tests/test_import_jobs.py tests/test_ai_reading_dedupe.py tests/test_ai_reading.py tests/test_inbox.py`
→ 56 passed.

Not verifiable by the implementer, so it stays unverified: an end-to-end scan in
the browser with a working key. That needs the user's decision in (f), an API
restart, and a synthetic card image, never a real Aadhaar.

## (f) Needs a user decision (Reddy)

The local regression itself is a configuration gap. The API is launched without
`AADHAAR_ENC_KEY`, and that key is required for any local Aadhaar write path
since `14b8246`. The implementer must NOT change credentials or wire secrets.
Options:

1. Recommended: `scripts/start-local.sh` sources the gitignored
   `.local/aadhaar-key.env` when present, as it already does for
   `.local/cognito-local.env`. It then passes `AADHAAR_ENC_KEY` to the API
   launch block, and only there. This is reversible (delete the lines). The key
   stays out of git. Risk: the same key also decrypts any locally stored
   Fernet Aadhaar rows, which is the intended local behavior.
2. Export `AADHAAR_ENC_KEY` from `.local/aadhaar-key.env` in your own shell
   before running `scripts/start-local.sh`, with no repo change. Note that
   `start-local.sh` does not currently forward an inherited `AADHAAR_ENC_KEY`
   explicitly. Because the variable is inherited, it does reach the subshell,
   but confirm this in context.
3. Use a fake-KMS or `AADHAAR_KMS_KEY_ARN` locally. Not recommended: it needs
   AWS credentials and violates local-only.

Either 1 or 2 needs an API restart, which belongs to the user's
`start-local.sh` session. After that, verify with a synthetic image only. Until
then, the code fix means the dialog says plainly that Aadhaar protection is not
configured, and no provider spend is wasted.
