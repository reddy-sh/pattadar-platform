# Design review: Aadhaar vault, card storage on S3, last-4-only display

Reviewed: `.agents/tasks/aadhaar-vault-s3/design.md` (revision 4).
Method: static reads of the current working tree, including the uncommitted early-503 fix (`aadhaar.py`, `ai_reading/jobs.py`, `ai_reading/operations.py`, `account.py`, `start-local.sh`, the `file_ref`-bearing modules, `infra/terraform`). No builds, tests, AWS, Terraform or data operations were run. No `.local/*.env` file was read. No Aadhaar digits are reproduced here.

Verdict: **APPROVED**. 0 HIGH, 0 MEDIUM, 3 NIT.

Revision 4 resolves both MEDIUMs and all six NITs from the third review, and no earlier resolution regressed. The three new NITs are precision gaps in the stage-2 reference set, the §12.10 key-isolation check and one `_encrypt_bytes` branch. None blocks implementation.

## Resolution of the third review

| # | Sev | Status | Evidence |
|---|---|---|---|
| 1 | MEDIUM | **Resolved** | Durable records carry `expires_at = DURABLE_EXPIRES_AT` (`9999-01-01 00:00:00+00`, bound `%s::timestamptz`): typed records at create (§4.1), scan records at consume in `resolve_record` (§4.3). The old predicate (`aadhaar.py:358`, quoted correctly in §1) cannot match the first clause, so it matches only one day after consumption. The choice of a finite sentinel over `'infinity'` holds up. psycopg 3 cannot load `infinity` into `datetime`. `account.export_data` selects every non-omitted column, `expires_at` included (`account.py:159–170`), and no custom loader is registered anywhere in `services/`. New predicates never compare a consumed record's `expires_at`. §13 now separates deploy overlap ("no durable record is lost") from a rollback longer than a day ("loses every record consumed before it"). ECS has no deployment configuration (no `deployment_*` in `infra/terraform`), so the rolling-overlap premise is right. §12.3 runs the old statement verbatim against real Postgres, with a typed record and a consumed scan record that must survive and an expired unconsumed control that must be deleted. There is also a sentinel export test. |
| 2 | MEDIUM | **Resolved** (one NIT below) | The reference set is derived per run from `information_schema` (public base tables, `file_ref` or `%\_file\_ref`), on every connection the run holds. Lookups use `psycopg.sql.Identifier` and match the node id or any of its version ids. Outcomes are precise: `missing` is treated as deleted and does not block; `refused_foreign_owner` and `refused_referenced` leave the node untouched and stage 1 drops the link; only a delete error exits non-zero before stage 1. S3 is purged before the hub `DELETE`, so the A-deleted/B-failed re-run finishes with exit 0 and then zeros. `card_node_id` does not match the pattern, so a link never refuses its own card. Tests cover `parcel_photos`, `land_expenses`, a new `*_file_ref` column, a quoted table name, a missing node and the partial re-run. |
| 3 | NIT | Resolved | §4.4 uses `r.updated_at` for records and `aadhaar_vault.created_at` for orphans, with 4- and 6-minute boundary tests in §12.3. |
| 4 | NIT | Resolved in intent | The check is count-only, never targets the API and proves the API key by behaviour. The loop as written is not runnable (new NIT 2). |
| 5 | NIT | Resolved | D4 and §5.1 map pdf, jpg/jpeg, png, heic, heif and webp, with `bin` only as the last fallback. |
| 6 | NIT | Resolved | `AADHAAR_CONTEXT` has an entry rule (load-time failure) and a line rule (never path-allowed), each with self-tests. |
| 7 | NIT | Resolved | §11 states that `addBeneficiary` has no client caller and that its digits are masked and discarded. §4.3 cross-references this. |
| 8 | NIT | Resolved | The final raise in `_encrypt_bytes` (`aadhaar.py:208`) becomes `_unavailable(..., NoWritePath())`. `_unavailable` already returns `ProtectionUnavailable("Aadhaar protection is temporarily unavailable")` (`aadhaar.py:157–166`), and `jobs.run_one` appends ". Nothing was saved." (`jobs.py:183–187`). The four "not enabled" assertions named in §4.1 exist at exactly the cited lines (`test_aadhaar_security.py:192/208/270`, `test_import_jobs.py:140`), and no client matches on that text. |

## Findings

### 1. NIT: the reference set misses node-id columns that do not end in `file_ref` (§8.3)

`web360.py:596–603` adds `record_people.photo_ref` and `record_owners.photo_ref`. The comment says they are "Stored INLINE as the storage node id", and `web360.py:10192` and `:10283` repeat it. `associates.py:257` `evidence_ref` and the `set_associate_certification` `evidence_ref` argument (`web360.py:11958`) are free-text fields that can hold a Drive reference. None of these matches `file_ref`/`%_file_ref`.

The design's list of today's columns also has a slip: `web360.py:725` is `combined_property_expenses.receipt_file_ref`, not a second `land_expenses` line. The catalog query covers it anyway.

Practical reach is low. `PhotoField` in `RecordPeople.tsx` uploads a fresh file, and no Drive picker exists in `apps/web` (searched), so a kept card's existing node id cannot be chosen as a photo through the UI today. The safety rule should still not depend on that.

Fix: widen the catalog predicate. Over-matching only refuses a delete, which is the safe direction.

```sql
AND c.data_type = 'text'
AND (c.column_name IN ('file_ref','photo_ref','evidence_ref')
     OR c.column_name LIKE '%\_file\_ref' ESCAPE '\'
     OR c.column_name LIKE '%\_photo\_ref' ESCAPE '\')
```

`card_node_id` is still excluded. Write the Python literal as a raw string (`r"…"`) so `\_` does not raise a SyntaxWarning on 3.13. In §12.5, add a `record_people.photo_ref` case that must be refused and kept, and correct the `~725` attribution to `combined_property_expenses`.

### 2. NIT: the §12.10 key-isolation loop cannot run as written, and its PIDs would check the wrong process (§12.10)

- `$WEB_PID` does not exist. The web dev server runs in the foreground of `start-local.sh` (lines 442–480).
- `UNIVERSITY_PID` is omitted.
- `GW_PID`, `ASSISTANT_PID` and `UNIVERSITY_PID` are local variables of the script, so a tester's shell cannot see them.
- Each is `$!` of a `( … ) &` subshell (lines 360, 412, 440). A forked subshell keeps the exec-time environment of `start-local.sh`. So `ps eww` would report a key the developer exported in their own shell, even though the design's `unset` keeps it out of uvicorn. That gives a false failure, and the real uvicorn and Vite processes are never checked.

Fix: select the processes by listening port. Never include 8080 (the API).

```sh
for port in 8082 8081 5173 "<university port printed by start-local.sh>"; do
  for p in $(lsof -tiTCP:"$port" -sTCP:LISTEN); do
    printf '%s ' "$port"; ps eww -p "$p" | grep -c 'AADHAAR_ENC_KEY='
  done
done
```

Each line must end in `0`. Run it once with `AADHAAR_ENC_KEY` exported in the launching shell to prove the scrub works.

### 3. NIT: an invalid local Fernet key still escapes as a plain `RuntimeError` (§4.1)

In `_encrypt_bytes`, the fernet branch calls `cipher = _fernet()` outside its `try` (`aadhaar.py:202–203`). `_fernet()` raises `RuntimeError("AADHAAR_ENC_KEY is invalid")`. The extraction paths are safe, because `write_path_available()` returns False for an invalid key before the provider is called and the environment is static per process. The resolver paths that create typed records (`updateProfile(kycRef)`, typed `addMember`/`updateMember`) are not pre-checked, though. They would return the masked generic GraphQL error, which contradicts §4.1's "every protection failure … surfaces with the one fixed sentence".

Fix:

```python
if mode == "fernet":
    try:
        cipher = _fernet()
        if cipher:
            return FERNET_PREFIX + cipher.encrypt(plaintext).decode()
    except Exception as exc:
        raise _unavailable("encrypt", owner, purpose, record, exc) from exc
```

Add a §12.1 case: an invalid key gives `ProtectionUnavailable` with `PROTECTION_FAILED_MESSAGE` and a WARNING whose cause is `RuntimeError`, with no key material.

## Regression check (earlier resolutions)

All revision-2 and revision-3 resolutions still hold in the text:

- the sync iOS wrapper;
- the `start-local.sh` top-level placement after the cognito `fi` (lines 113–117 in the current file) with `${…:-}` defaults;
- the single-connection dev/prod clear with five non-empty `PG_*` parts and `API_DSN`/`HUB_DSN` refused;
- `--cards-linked-first` and `--abandon-linked-cards`, with the prod heuristic stage unavailable;
- the ban on secrets in `containerOverrides`;
- the opt-in card (D4) and the kept-card exception;
- the retired reveals plus the Expo removal in the same SHA (NO-GO otherwise);
- the D3a boundary, including shared `hub` and `pattadar_app`;
- the synthetic iOS fixture and the git-history purge left to Reddy;
- the digit guard;
- the `ProtectionUnavailable` GraphQL pass-through;
- the one normalized `safe` dict;
- the D9 submit pre-check;
- the boot reconcile;
- the gated prod procedure, marked not for agents.

## Invariants

- **API only via the gateway / `x-user-id`:** respected. `linkAadhaarCard` is a GraphQL mutation behind the gateway, and the iOS sync path is exercised through `/api/extract-aadhaar`.
- **Immutable issuer+subject:** unchanged. Owner scope uses `owner_user_id` from the gateway identity.
- **Durable, non-repeating AI jobs:** web and Expo use `-async` jobs with no resubmission. Every failure maps to "Nothing was saved." with no retry. The iOS sync read is recorded as a pre-existing deviation and a decision for Reddy.
- **`{node}/{version}` keys, SQL authorization:** the card uses the unchanged gateway upload, and the link pointer grants nothing.
- **Same flow in prod:** prod writes through direct KMS on the existing CMK (`purpose=aadhaar-vault` matches `aadhaar-*`), with the same schema and code path as local Fernet. No Terraform change.
- **Last 4 only:** the wire mask is `XXXX-XXXX-1234`, rendered `XXXX XXXX 1234` with tabular-nums. Reveals are retired, and Expo reveal/copy is removed.
- **No plaintext full number:** digits exist only as vault ciphertext, and nothing in `src/` decrypts at runtime. The kept card's bytes are the user-requested exception, documented in D4.

## Verified assumptions

- `aadhaar.py`:
  - `UNAVAILABLE_MESSAGE` (lines 29–32), `ProtectionUnavailable(RuntimeError)` (35) and `_unavailable` returning `ProtectionUnavailable("Aadhaar protection is temporarily unavailable")` with a type-only log (157–166).
  - The final raise of `_encrypt_bytes` is "protected writes are not enabled" (208).
  - `cleanup_expired` is `DELETE … WHERE expires_at<now() OR consumed_at<now()-interval '1 day'` (358).
  - `secure_extraction_result(owner, result)` currently raises `RuntimeError` when `_pool is None`, and has no `job_id`.
  - `consume_candidate` decrypts `row["ciphertext"]`, so a NULL ciphertext on rollback fails, as §13 states.
- `jobs.py:161–187`:
  - The handler runs with no request. Then `secure_extraction_result` runs.
  - `ProtectionUnavailable` gives 503 with `str(exc) + ". Nothing was saved."`. Other errors give 502.
  - The handler's pre-provider 503 passes through as a non-200 result with `UNAVAILABLE_MESSAGE`, matching the §4.6 worker row.
- `operations.py:182–199`: the sync route has the pre-provider 503, then returns `secure_extraction_result` with no `try`. `JSONResponse` is already imported.
- `account.py`:
  - `OMIT_COLUMNS` contains `token`, `source` and `ciphertext`, and `_enc` columns are dropped.
  - `export_data` selects every remaining column through psycopg, so a loader-unsafe value would break export.
  - No custom timestamp loader exists in `services/`.
- Every listed `file_ref` column exists in the named table: `associate_credentials`, `ticket_deliverables`, `property_photos`, `parcel_photos`, `registered_documents`, `documents` and `land_expenses.receipt_file_ref`. All are `TEXT`, so `= ANY(text[])` is type-safe.
- No `deployment_*` setting exists in `infra/terraform`. The ECS default rolling update applies.
- `start-local.sh`:
  - `set -euo pipefail` is at line 50, and the cognito block and `IDENTITY_LEGACY_BINDINGS` line are at 112–117.
  - The API, gateway, assistant and university run in `( … ) &` subshells (`API_PID`, `GW_PID`, `ASSISTANT_PID`, `UNIVERSITY_PID`).
  - Web runs in the foreground.

## Unverified or wrong assumptions

- **Wrong (minor):** `web360.py:725` is `combined_property_expenses.receipt_file_ref`, not `land_expenses` (finding 1). It is covered by the catalog query regardless.
- **Incomplete:** "today this finds" the full node-reference set. `photo_ref` columns store node ids under a different name (finding 1).
- **Wrong (minor):** a `$WEB_PID` exists, and the script's PIDs are usable from a tester's shell (finding 2).
- **Overstated:** "every protection failure surfaces with the one fixed sentence". An invalid Fernet key on resolver paths does not (finding 3).
- **Unverified (covered by planned real-DB tests, not executed):**
  - re-running `ADD COLUMN IF NOT EXISTS … REFERENCES` adds no duplicate FK on Postgres 17;
  - the release CTE plus `ON DELETE SET NULL` behave as specified;
  - psycopg's `list[str]` → `text[]` adaptation in the `= ANY(%s)` lookup.
- **Unverified:** the "39 tracked files" count and the §7 compliance-doc line numbers. The design defers both to the implementer at edit time.
- **Unverified:** whether the `DocSpineTests.swift` fixture values are real. They are still treated as real, which is correct.
