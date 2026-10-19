# Design: Aadhaar vault, card storage on S3, and last-4-only display

Status: revision 4. It addresses the third `design-review.md` (0 HIGH, 2 MEDIUM, 6 NIT). The revision-3 responses to the second review (0 HIGH, 6 MEDIUM, 6 NIT) and the revision-2 responses to the first review (1 HIGH, 7 MEDIUM, 9 NIT) are kept. All three response tables are at the end; the revision-4 table is the last section of the document. This is local-only design work: no AWS, Terraform, commits or production data were touched.

## Overview

Upload-Aadhaar failed because local startup gave the API no Aadhaar write path. `AADHAAR_ENC_KEY` was never passed, so every scan was refused. The prior uncommitted fix is kept. It refuses with a named 503 (`aadhaar.ProtectionUnavailable` / `UNAVAILABLE_MESSAGE`) before the paid provider is called, and `PersonDialog` shows the server's reason. This design builds on that fix to rework storage:

1. The card file is stored by the existing gateway storage API (`POST /api/gateway/storage/files`), under the key `{node}/{version}`, with SSE-KMS exactly as for other documents. It is stored only when the owner ticks the existing opt-in (D4, a decision for Reddy).
2. Every reading or typed number becomes a durable row in the existing Aadhaar table, `aadhaar_candidates`. That table is extended to hold the extracted fields, the last 4 digits, the extraction job id, timestamps and the card's node/version link.
3. The full 12 digits live only in a new, separate `aadhaar_vault` table, as ciphertext plus an opaque reference token. In production the key provider is direct AWS KMS on the existing Aadhaar CMK. Locally it is Fernet with `AADHAAR_ENC_KEY`. The schema and flow are the same everywhere.
4. No client response ever carries the full number. The reveal mutations are retired on the server, and the Expo reveal/copy UI is removed in the same change set. The UI renders `XXXX XXXX 1234`, with DD/MM/YYYY dates.
5. `scripts/start-local.sh` loads `.local/aadhaar-key.env` into the API process only.
6. A reviewed, idempotent `clear_aadhaar.py` script clears existing Aadhaar data. It may run against local dev now; production needs a separate approval (§8).

Stack (locked): Python 3.13, FastAPI + Strawberry GraphQL + psycopg 3 (async in the app, sync in scripts), PostgreSQL 17, boto3 KMS/S3 and `cryptography.fernet`. Web uses React 19.2 + MUI 9.2 + TanStack Query + `@pattadar/core`; Expo uses React Native Paper (removal only). Tooling is Bun 1.3.14. No new dependencies. No Terraform change is required (§9).

## 1. What exists today (evidence)

- `services/api/src/aadhaar.py` has two write modes.
  - `kms`: needs `AADHAAR_KMS_KEY_ARN` and either a local/test environment or `AADHAAR_KMS_WRITES_ENABLED=1`. It is required outside local/test.
  - `fernet`: needs `AADHAAR_ENC_KEY` and either `AADHAAR_LEGACY_WRITE_BRIDGE=1`, or local/test with `ALLOW_INSECURE_LOCAL=1`.
  - The KMS encryption context is `{app, environment, purpose, owner_ref, record, schema:"v1"}`. The runtime IAM policy (`infra/terraform/modules/runtime/ecs.tf`, `AadhaarFieldEncryption`) allows `kms:Encrypt`/`kms:Decrypt` only for `schema=v1` and `purpose` StringLike `aadhaar-*`.
- The only Aadhaar-named table is `aadhaar_candidates (id, owner_user_id, ciphertext, masked, expires_at, consumed_at, created_at)`. Rows are one-use and live 30 minutes. `cleanup_expired` runs `DELETE FROM aadhaar_candidates WHERE expires_at<now() OR consumed_at<now()-interval '1 day'`: every row whose `expires_at` has passed, consumed or not, plus rows consumed more than a day ago. It runs from `jobs.sweep` in the 60-second `maintenance` loop.
- Deploys: the API ECS service sets only `desired_count` (no deployment configuration in `ecs.tf`), so ECS uses its default rolling update (minimum healthy 100%, maximum 200%). Old and new API tasks run side by side for the length of a deployment, and each runs its own `maintenance()` sweep against the same database.
- Full-number ciphertext also lives on subject rows: `users.kyc_ref_enc` (beside `kyc_ref_masked`) and `family_members.aadhaar_enc` (beside `aadhaar_masked`). `beneficiaries.aadhaar_masked` holds the mask only.
- Writers:
  - `_write_person` (via `resolve_for_storage`) serves `addMember` and `updateMember`.
  - `apply_my_kyc` (main.py ~3418, which calls `consume_candidate` directly) writes the account and every `is_self` member.
  - `clear_my_kyc`.
  - `update_profile(kyc_ref)`, which encrypts outside its transaction.
  - `add_beneficiary`, which stores the mask only.
  - `main.py` wrappers `encrypt_aadhaar`/`decrypt_aadhaar` (~1310–1318).
- Readers of the full number: `reveal_my_aadhaar` and `reveal_member_aadhaar`. Only Expo calls them: `apps/mobile/src/data/hooks.ts` (`revealAadhaar`, `useMyAadhaar().reveal`), `account.tsx` ~229–240 and `add-member.tsx` ~453–490. Their helper `apps/mobile/src/lib/secureReveal.ts` has no other users. Web and iOS never call them.
- iOS also reveals the full number **on the device**, from the user's local scan. `DocSpine.firstIdentityNumber(in:)` is used by `AllDetailsScreen.swift:108`, and `DocumentViewer.swift` (~331–345) toggles reveal of sensitive identity values.
- Extraction:
  - Web `apiFetch` routes `/extract-aadhaar` through `readAsync`: a durable `-async` job polled with `import-status`.
  - The worker (`jobs.run_one`) calls the handler with `request=None`, then `aadhaar.secure_extraction_result(owner, result)`.
  - Interrupted provider calls are marked failed and never re-dispatched. `DEDUPE_EXCLUDED` contains `extract-aadhaar`.
  - The sync route `POST /extract-aadhaar` (`operations.extract_aadhaar`) is the **current native-iOS path**: `PattadarAPI.extract` posts to `endpoint.path`, `.aadhaar` is `"extract-aadhaar"`, and `BackgroundRead.swift:172` adds `-async` only for `.registeredDocument`. Web and Expo use `-async`. Today the sync route calls `aadhaar.secure_extraction_result(owner, out)` with no `try`, so a protection failure after the provider call escapes as a FastAPI 500.
- Card retention today: when "Also keep the original card in my encrypted Drive" is ticked, `PersonDialog` uploads the file under its original name to `/api/gateway/storage/files?appId=pattadar&onConflict=duplicate`. Nothing links the upload to the reading.
- Storage:
  - `StorageService._put_args` sends `ServerSideEncryption=aws:kms`, `SSEKMSKeyId` (the documents CMK) and `BucketKeyEnabled`. Local MinIO under `ALLOW_INSECURE_LOCAL=1` is the exception.
  - Keys are `{node}/{version}`, and reads use `storage_versions.object_key`. S3 metadata is `ContentType` only.
  - Databases differ by environment. **Locally** the gateway uses `pattadar_hub` and the API uses `pattadar` (`start-local.sh`). **In AWS** the gateway, API and assistant tasks all connect to the one database `hub` as role `pattadar_app` (`ecs.tf` `PG_DATABASE = "hub"` at lines 227, 308, 481). Only `api_task` holds the Aadhaar CMK grant (`AadhaarFieldEncryption`); the gateway task holds the documents CMK and documents-bucket `GetObject`/`PutObject`/`DeleteObject`/`ListBucket`.
  - The documents bucket is versioned, with `noncurrent_version_expiration` (`var.noncurrent_version_expiration_days`, default 180). The gateway's `hard_delete` deletes the owner-scoped node row, then `delete_object` per `object_key` (a delete marker; noncurrent bytes expire by lifecycle).
- GraphQL errors: `MaskUnexpectedErrors._unexpected` (main.py ~7305) passes only `NotAuthorized` and `ValueError` to clients. Everything else becomes a generic message plus a reference.
- Migration convention: there is no migration tool. Idempotent DDL runs in `init_db()` under `pg_advisory_lock(918273645)`, and `aadhaar.ensure_schema` runs first.
- Operator-script convention (`services/api/scripts/erase_account.py`):
  - sync psycopg with `dict_row`;
  - **explicit** `os.environ["API_DSN"]` ("Explicit DSNs prevent accidentally operating against the developer defaults");
  - read-only unless `--execute`, and `--execute` requires `--writers-drained`;
  - counts-only output.
- Real-Postgres test convention: `test_vault_folders.py` and similar tests create a throwaway schema on `TEST_PG_DSN` (local default rhub). They skip locally when Postgres is absent and fail in CI.
- Export and erasure (`account.py`) are schema-derived on `owner_user_id`. `OMIT_COLUMNS` already contains `token`, `source` and `ciphertext`, and `*_enc` columns are dropped.

## 2. Key decisions

**D1. The "Aadhaar table" is the existing `aadhaar_candidates`, extended rather than replaced.** Each row becomes the durable record of one Aadhaar instance: a scan or a typed number. The one-use, 30-minute rule still governs *applying* a scanned number, through `expires_at` and `consumed_at`. A consumed row persists until nothing references it. `expires_at` keeps its meaning for **unconsumed** readings only. Every durable (consumed or typed) record carries the far-future sentinel `expires_at = DURABLE_EXPIRES_AT` (§4.1), so the old code's sweep, which deletes any row with `expires_at<now()`, never matches it during a deploy overlap or rollback (§13). A `COMMENT ON TABLE` documents the widened meaning. The rejected alternative was a new `aadhaar_records` table: it contradicts "extend existing" and forces a rename step.

**D2. Separate vault, one encryption per Aadhaar instance, records shared by reference.**

- `aadhaar_vault` holds only `token`, `owner_user_id`, `ciphertext` and `created_at`. `owner_user_id` is there for SQL authorization, export and erasure.
- A record row points to its vault row through `vault_token`.
- Subject rows point to a record: `family_members.aadhaar_record_id` and `users.kyc_aadhaar_record_id`.
- `apply_my_kyc` points the account and every self member at the *same* record. The number is encrypted exactly once, at read or type time.
- **No runtime code path decrypts it.** The reveals are retired, and nothing else needs the digits.
- A record and its vault row are released only when no subject references the record. One helper owns that rule (§4.4).

**D3. The encryption context binds to the vault token.**

- The context is `{app:"pattadar", environment, purpose:"aadhaar-vault", owner_ref, record:<vault token>, schema:"v1"}`. This satisfies the existing IAM conditions.
- The brief says "KMS envelope". The existing production path is direct KMS `Encrypt` of the small payload, with no data key. This design keeps that path and does not add envelope encryption. This is flagged so the wording is not read as a change.
- Local Fernet has no context. Owner binding there is SQL-only, which is accepted for local/test.

**D3a. Vault isolation boundary (what "encrypted vault" means here).**

What the separation provides:

- No full-number ciphertext sits on any subject row.
- There is exactly one ciphertext per Aadhaar instance.
- Every vault query is owner-scoped in SQL.
- Vault rows are omitted from exports and covered by erasure.
- No API, GraphQL or job response can carry the digits, because nothing decrypts them at runtime.

What it does **not** provide: the vault is a table in the same database, accessed by the same DB role, encrypted under the same CMK, and governed by the same task-role IAM grant (`kms:Decrypt` on `aadhaar-*`). Everything a decrypt needs is in that database. The token is the `record` context, and `owner_ref` derives from `owner_user_id`. A compromised API process, or SQL-level read access combined with the task role, could therefore decrypt.

In AWS the gateway and assistant processes share the database `hub` and the role `pattadar_app` with the API (§1). They can therefore `SELECT` the vault ciphertext and the plaintext record fields (`name`, `dob`, `gender`, `address`, `last4`) of `aadhaar_candidates`. They cannot decrypt the ciphertext, because only the API task role has the Aadhaar CMK grant. Locally the gateway uses a separate database, so this exposure exists only in AWS.

This is logical separation, not UIDAI-grade ADV isolation. Hardening options for **Reddy to decide later** (not designed or implemented here; each needs its own approval):

- (i) Add an IAM `Deny kms:Decrypt` on `kms:EncryptionContext:purpose = aadhaar-vault` to the API task role. This is safe because nothing decrypts at runtime, and it is a Terraform change.
- (ii) A dedicated API-only DB role or schema for `aadhaar_vault` and `aadhaar_candidates`, with `REVOKE` from `pattadar_app` and `SECURITY DEFINER` insert/delete functions. This is needed because `pattadar_app` is shared by three services.
- (iii) Use a dedicated CMK for the vault.

No `vault_digits` or any other decrypt helper is added to `src/`. Tests decrypt with a test-local helper (§12).

**D4. Card storage keeps opt-in semantics. RECOMMENDATION; decision point for Reddy.** The UX copy promises the card is kept only if the user chooses it.

- Recommended (implemented): store the card only when "Also keep the original card in my encrypted Drive" is ticked. The box defaults to unticked; without the tick, no card is stored anywhere.
- Alternative (not implemented): always store the card. That would need changed UX copy and a consent/notice review, because it silently widens retention of an identity document.

When ticked, the existing gateway upload is used unchanged:

- The key is `{node}/{version}`, with SSE-KMS on the documents CMK in AWS. Local MinIO is unencrypted under `ALLOW_INSECURE_LOCAL`, like every document.
- Metadata goes to `storage_nodes`/`storage_versions`.
- The client uploads under the fixed safe name `Aadhaar card.<ext>`, with `ext` from the MIME type: `application/pdf`→`pdf`, `image/jpeg`→`jpg`, `image/png`→`png`, `image/heic`→`heic`, `image/heif`→`heif`, `image/webp`→`webp`, and `bin` only as the last fallback (§5.1). Keeping the real extension matters because gateway helpers such as `_is_heic(mime, name)` and `_is_imageish(mime, name)` look at the name as well as the MIME type. It never uses the original filename, which may contain the 12 digits, and S3 metadata stays `ContentType` only.
- With `onConflict=duplicate`, a second card becomes `Aadhaar card (2).pdf`.

**The kept card is the user-requested exception to "full number never stored".** When the box is ticked, the stored file contains the full 12 digits as printed on the card. It is protected like any Drive file:

- SSE-KMS on the documents CMK in AWS;
- owner-authorized in SQL;
- decryptable by the gateway for downloads and thumbnails;
- shareable through Drive share links if the owner shares it.

The "never in plaintext" invariant covers the DB, logs, job results, API/GraphQL responses and S3 metadata. It does not cover the bytes of a card the owner chose to keep.

**D5. Linking card to reading is a new additive mutation, `linkAadhaarCard`.** The flow is read, then upload, then link. No existing mutation signature changes, so iOS and Expo query strings stay valid.

- The API stores `card_node_id`/`card_version_id` as pointers only and does not verify node ownership. The API does not query hub (`storage_*`) tables, so local and AWS behave the same: locally they are a separate database, while in AWS they share `hub`.
- A pointer grants nothing: every byte read goes through gateway `content_identity`, which authorizes by owner in SQL, so a forged pointer returns 404 on use.
- Because the pointer is forgeable, **no destructive operation may trust it without an owner check** (§8 stage 2).

**D6. The reveal mutations are retired on the server; Expo's reveal UI is removed in this change set.**

- `revealMyAadhaar`/`revealMemberAadhaar` stay in the GraphQL schema, so older Expo builds and `packages/core` exports still validate.
- Both always raise `ValueError("Full Aadhaar numbers are not shown. Only the last 4 digits are kept for display.")` and write no audit row.
- The `REVEAL_*` constants in `packages/core/src/api/operations.ts` get `@deprecated` JSDoc and are no longer imported by any client.

**D7. The masked wire format is unchanged (`XXXX-XXXX-1234`).** Clients normalize it for display with the existing `formatAadhaarMask` (`packages/core/src/format/docName.ts`), which yields `XXXX XXXX 1234`. This avoids a cross-client contract or vector change.

**D8. Migration is additive boot DDL plus a boot-time reconcile; destruction is a separate script.**

- Deploying creates the vault table and the new columns, and makes `aadhaar_candidates.ciphertext` nullable. Nothing is dropped.
- Legacy `aadhaar_enc`/`kyc_ref_enc` are no longer written or read, and writers blank them.
- Legacy pending candidates (`vault_token IS NULL`) are refused with the existing "read the card again" message.
- The clear is `clear_aadhaar.py` (§8). Rollback is schema-safe but lossy (§13).

**D9. Fail fast before the paid call at submit time too.** For `operation == "extract-aadhaar"`, `jobs.submit` checks `aadhaar.write_path_available()` after the consent checks and before `file.read()`. When no write path exists it returns `JSONResponse(status_code=503, content={"error": aadhaar.UNAVAILABLE_MESSAGE})`, so no job row and no source bytes are stored. The worker-side check from the prior fix stays as defence in depth.

**D10. Normalization is applied once and used for both storage and response.** `secure_extraction_result` builds one `safe` dict, which is inserted into the record and returned as `fields`, so the form and the record always agree (§4.2).

**D11. A read with no valid 12-digit number stores no record.** This is a deliberate reading of "store all the data": a row with no number has nothing to protect or apply, and the extracted fields still prefill the form. **Reddy may overrule.** The alternative is to store a record with `last4=''` and no vault row.

## 3. Schema and migration (owned by `aadhaar.ensure_schema`, called first in `init_db`)

`aadhaar.DDL` becomes the following. All of it is idempotent and runs under the existing advisory lock.

```sql
CREATE TABLE IF NOT EXISTS aadhaar_vault (
  token          TEXT PRIMARY KEY,            -- uuid4; never derived from the number
  owner_user_id  TEXT NOT NULL,
  ciphertext     TEXT NOT NULL,               -- 'kms-direct:v1:…' or 'fernet:v0:…'
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_aadhaar_vault_owner ON aadhaar_vault(owner_user_id);

CREATE TABLE IF NOT EXISTS aadhaar_candidates (
  id TEXT PRIMARY KEY, owner_user_id TEXT NOT NULL, ciphertext TEXT,
  masked TEXT NOT NULL, expires_at TIMESTAMPTZ NOT NULL, consumed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE aadhaar_candidates ALTER COLUMN ciphertext DROP NOT NULL;   -- legacy; never written again
ALTER TABLE aadhaar_candidates ADD COLUMN IF NOT EXISTS origin TEXT NOT NULL DEFAULT 'scan';  -- 'scan' | 'typed'
ALTER TABLE aadhaar_candidates ADD COLUMN IF NOT EXISTS job_id TEXT NOT NULL DEFAULT '';
ALTER TABLE aadhaar_candidates ADD COLUMN IF NOT EXISTS name TEXT NOT NULL DEFAULT '';
ALTER TABLE aadhaar_candidates ADD COLUMN IF NOT EXISTS dob TEXT NOT NULL DEFAULT '';        -- ISO YYYY-MM-DD or ''
ALTER TABLE aadhaar_candidates ADD COLUMN IF NOT EXISTS gender TEXT NOT NULL DEFAULT '';
ALTER TABLE aadhaar_candidates ADD COLUMN IF NOT EXISTS address TEXT NOT NULL DEFAULT '';
ALTER TABLE aadhaar_candidates ADD COLUMN IF NOT EXISTS confidence TEXT NOT NULL DEFAULT '';
ALTER TABLE aadhaar_candidates ADD COLUMN IF NOT EXISTS last4 TEXT NOT NULL DEFAULT '';
ALTER TABLE aadhaar_candidates ADD COLUMN IF NOT EXISTS vault_token TEXT
  REFERENCES aadhaar_vault(token) ON DELETE SET NULL;
ALTER TABLE aadhaar_candidates ADD COLUMN IF NOT EXISTS card_node_id TEXT NOT NULL DEFAULT '';
ALTER TABLE aadhaar_candidates ADD COLUMN IF NOT EXISTS card_version_id TEXT NOT NULL DEFAULT '';
ALTER TABLE aadhaar_candidates ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();
CREATE INDEX IF NOT EXISTS idx_aadhaar_candidates_owner ON aadhaar_candidates(owner_user_id, expires_at);
CREATE INDEX IF NOT EXISTS idx_aadhaar_candidates_vault ON aadhaar_candidates(vault_token);
COMMENT ON TABLE aadhaar_candidates IS
  'Aadhaar records: one row per read or typed Aadhaar. Full digits live only in aadhaar_vault.';
```

In `init_db` (main.py), next to the existing `aadhaar_enc`/`kyc_ref_enc` ALTERs and after `users` and `family_members` exist:

```sql
ALTER TABLE family_members ADD COLUMN IF NOT EXISTS aadhaar_record_id TEXT NOT NULL DEFAULT '';
ALTER TABLE users ADD COLUMN IF NOT EXISTS kyc_aadhaar_record_id TEXT NOT NULL DEFAULT '';
CREATE INDEX IF NOT EXISTS idx_family_aadhaar_record ON family_members(aadhaar_record_id) WHERE aadhaar_record_id <> '';
CREATE INDEX IF NOT EXISTS idx_users_aadhaar_record ON users(kyc_aadhaar_record_id) WHERE kyc_aadhaar_record_id <> '';
-- Reconcile (rollback safety, §13): blank pointers to records that no longer exist.
UPDATE family_members m SET aadhaar_record_id='' WHERE aadhaar_record_id<>'' AND NOT EXISTS
  (SELECT 1 FROM aadhaar_candidates r WHERE r.id=m.aadhaar_record_id AND r.owner_user_id=m.owner_user_id);
UPDATE users u SET kyc_aadhaar_record_id='' WHERE kyc_aadhaar_record_id<>'' AND NOT EXISTS
  (SELECT 1 FROM aadhaar_candidates r WHERE r.id=u.kyc_aadhaar_record_id AND r.owner_user_id=u.id);
```

The reconcile uses the two partial indexes, so it is cheap and a no-op on a consistent database. Orphaned vault rows left by a rollback window are removed by the sweep backstop (§4.4).

Notes:

- `ON DELETE SET NULL` on `vault_token` keeps `erase_account.py` (FK-topological, `foreign_children` check) order-independent. Subject pointers are plain TEXT with no FK, which is the prevailing style; the helper, reconcile and sweep enforce them.
- Re-running `ADD COLUMN IF NOT EXISTS … REFERENCES …` must not add a duplicate FK. This is believed true on Postgres 17, but a boot-twice real-DB test proves it (§12.3).
- The column is named `origin`, not `source`, because `account.OMIT_COLUMNS` already drops `source` (and `token`) from exports. `origin` is exported. `vault_token` is added to `OMIT_COLUMNS`. `aadhaar_vault.token` and `ciphertext` are already omitted. The owner's export therefore includes the record's fields and last 4, but never ciphertext or the vault pointer.
- `account.export_data` is schema-derived on `owner_user_id`, so `aadhaar_vault` rows export as `{owner_user_id, created_at}` (both `token` and `ciphertext` are omitted). **This is intended**: under DPDP access rights it shows that a protected number exists and when it was stored, without disclosing it. No exclusion is added to `account.py`, and §12.6 tests the exported shape.
- Name, DOB, gender and address are plaintext columns on RDS, which is encrypted at rest. Field-level protection is deferred, per Reddy ("data security later").

## 4. API changes (`services/api/src/aadhaar.py`, `main.py`, `ai_reading/*`)

### 4.1 Vault primitives (aadhaar.py; all take an open `conn` so callers keep one transaction)

`async def vault_put(conn, owner, digits12) -> str`:

- It generates `token = str(uuid4())`, encrypts with `_encrypt_bytes(digits12.encode(), owner, "aadhaar-vault", token)`, runs `INSERT INTO aadhaar_vault`, and returns the token.
- KMS or Fernet failure, or no write path, raises `ProtectionUnavailable` through the existing `_unavailable`. That logs only the exception type, purpose, record and owner_ref.

`async def create_record(conn, owner, *, digits12, origin, job_id="", fields=None) -> dict`:

- It calls `vault_put`, then inserts the record with `masked=mask(d)`, `last4=d[-4:]`, `vault_token`, the `safe` fields, `job_id` and `origin`.
- Scan records get `expires_at=now()+30 min` and `consumed_at=NULL`. Typed records get `expires_at=DURABLE_EXPIRES_AT` and `consumed_at=now()`, with `updated_at=now()`.
- It returns `{id, masked}`.

**Durable sentinel (deploy-overlap and rollback safety).** `aadhaar.py` defines `DURABLE_EXPIRES_AT = "9999-01-01 00:00:00+00"`, always bound as a query parameter and cast `%s::timestamptz`. Every durable record (typed at create, or scanned and then consumed in `resolve_record`) carries it. The old code's sweep predicate is `expires_at<now() OR consumed_at<now()-interval '1 day'`, so a durable record never matches its first clause, and matches the second only one day after consumption.

- Why not `'infinity'::timestamptz`: psycopg 3 cannot load `infinity` into a Python `datetime` and raises `DataError` on any `SELECT` that returns it. `account.export_data` selects every non-omitted column, including `expires_at`, so `infinity` would break the owner's data export. The repo registers no custom timestamp loader, and adding one would change behaviour for every table. `9999-01-01 00:00:00+00` stays a valid aware `datetime` in any session time zone between UTC−12 and UTC+14.
- Only unconsumed readings use `expires_at` as a real deadline. New code never compares a consumed record's `expires_at`: `resolve_record` filters `consumed_at IS NULL AND expires_at>now()`, `linkAadhaarCard` filters `consumed_at IS NOT NULL OR expires_at>now()`, and sweep step 1 filters `consumed_at IS NULL AND expires_at<now()`.
- A `psycopg.Error` on either insert propagates to the caller. Each caller's handling is in §4.6.

**Removed, with no remaining callers** (checked by grep in verification):

- In `aadhaar.py`: `encrypt_number`, `decrypt_number`, `consume_candidate`, `resolve_for_storage`.
- In `main.py`: `encrypt_aadhaar` and `decrypt_aadhaar` (~1310–1318).
- Their tests in `test_aadhaar_security.py` (~122–274) are rewritten against the new functions.

`_decrypt_bytes`, `_write_mode` and `write_path_available` are kept unchanged. `_decrypt_bytes` remains only for the test helper; it is not called from any runtime path.

`_encrypt_bytes` changes in one place: its final no-write-mode raise, today `raise ProtectionUnavailable("Aadhaar protected writes are not enabled")`, becomes `raise _unavailable("encrypt", owner, purpose, record, NoWritePath())`. `NoWritePath` is a new private `Exception` subclass in `aadhaar.py` with no message, so the existing `_unavailable` WARNING logs `cause=NoWritePath` (type only, as for every other cause). Every protection failure, whether misconfiguration, KMS/Fernet error or DB error, now surfaces with the one fixed sentence `PROTECTION_FAILED_MESSAGE = "Aadhaar protection is temporarily unavailable"` (a new module constant that `_unavailable` and §4.2 also use). The separate pre-provider `UNAVAILABLE_MESSAGE` ("…not configured. Nothing was sent for reading.") is unchanged. The tests that match `"not enabled"` (`test_aadhaar_security.py` ~192, ~208, ~270 and `test_import_jobs.py` ~140) are rewritten to assert `PROTECTION_FAILED_MESSAGE` (§12.1, §12.2).

### 4.2 Extraction result (no full number)

`secure_extraction_result(owner, result, job_id="")`:

1. It builds one `safe` dict from the allowlisted fields. Each value is passed through `_redact_aadhaar_like`, then normalized:
   - `name`: truncated to 200 characters.
   - `address`: truncated to 500 characters.
   - `dob`: kept only if it matches `^\d{4}-\d{2}-\d{2}$` and is a valid date (`date.fromisoformat`); otherwise `''`.
   - `gender`: lowercased, then kept only if it is in `{male, female, other}`; otherwise `''`.
   - `confidence`: kept only if it is in `{high, medium, low}`; otherwise `''`.
2. When `digits(result.fields.aadhaar)` gives 12 digits:
   - If the module `_pool` (bound by `aadhaar.bind`) is `None`, it raises `ProtectionUnavailable(PROTECTION_FAILED_MESSAGE)`, so the worker reports "Nothing was saved." rather than the 502 "try again".
   - Otherwise it runs `async with _pool.connection() as conn, conn.transaction(): rec = await create_record(conn, owner, digits12=d, origin="scan", job_id=job_id, fields=safe)`.
   - Any `psycopg.Error` raised inside is caught. It logs `log.warning("aadhaar.record_store_failed type=%s", type(exc).__name__)` and re-raises as `ProtectionUnavailable(PROTECTION_FAILED_MESSAGE)`.
   - A missing write mode inside `vault_put` also arrives as `ProtectionUnavailable(PROTECTION_FAILED_MESSAGE)` (§4.1), so there is exactly one post-provider failure text.
3. With no valid number, no record is created (D11).
4. It returns `{"fields": {**safe, "aadhaarMasked": rec.masked or "", "aadhaarCandidateId": rec.id or ""}}`. The key set is unchanged, and the **values the client receives are exactly the values stored**. `jobs.run_one` stores exactly this dict in `document_read_jobs.result`: no raw text and no digits.

`jobs.run_one` passes `job_id=row["id"]`, and the sync route passes `""`. `jobs.submit` gets the D9 pre-check.

**Sync route (`operations.extract_aadhaar`, native iOS today).** The final call is wrapped so that a protection or DB failure after the provider call returns the same JSON shape as the worker, never a 500:

```python
try:
    return await aadhaar.secure_extraction_result(owner, out)
except aadhaar.ProtectionUnavailable as exc:
    return JSONResponse(status_code=503, content={"error": str(exc) + ". Nothing was saved."})
```

Because every `ProtectionUnavailable` raised after the provider call carries `PROTECTION_FAILED_MESSAGE` (§4.1), this wrapper can only ever return `"Aadhaar protection is temporarily unavailable. Nothing was saved."`, including when the configuration changes between the pre-check and the write. The existing pre-provider `write_path_available()` 503 on this route stays. The route is not idempotent, and neither the server nor this design retries it. iOS shows `json["error"]` as it already does for 502 bodies.

### 4.3 Writers

`resolve_record(conn, owner, raw, candidate_id) -> (record_id, masked)` replaces `resolve_for_storage`:

- With neither `raw` nor `candidate_id` (both empty after `strip()`), it returns `("", "")` and writes nothing. Callers treat that as "no Aadhaar input" and leave the subject's Aadhaar columns untouched.
- `raw` and `candidate_id` together raise `ValueError("Use either typed Aadhaar or a card reading, not both")`.
- With a candidate it runs `SELECT id, masked FROM aadhaar_candidates WHERE id=%s AND owner_user_id=%s AND consumed_at IS NULL AND expires_at>now() AND vault_token IS NOT NULL FOR UPDATE`.
  - No row raises `ValueError("The Aadhaar reading expired or was already used; read the card again")`.
  - Otherwise it runs `UPDATE aadhaar_candidates SET consumed_at=now(), expires_at=%s::timestamptz, updated_at=now() WHERE id=%s AND owner_user_id=%s` with `DURABLE_EXPIRES_AT`, so the consumed record leaves the old sweep's first clause at the moment it becomes durable (§4.1).
- With `raw`, `digits(raw)` must give 12 digits; anything else raises `ValueError("Aadhaar must be exactly 12 digits")`. It then calls `create_record(origin="typed")`.

How each writer uses it (all inside their existing transactions):

- `_write_person` (`addMember`/`updateMember`) writes `aadhaar_masked`, `aadhaar_record_id` and `aadhaar_enc=''`, then calls `release_if_unreferenced(prev_record_id)`. With no Aadhaar input on update, these columns are untouched. `set_member_share` passes `aadhaar=""` and so is unaffected.
- `apply_my_kyc` resolves once. It sets `users.kyc_ref_masked`, `kyc_aadhaar_record_id` and `kyc_ref_enc=''`, and for every `is_self` member `aadhaar_masked`, `aadhaar_record_id` (the same record) and `aadhaar_enc=''`. It then releases the previous ids. Name, address, DOB and gender behaviour is unchanged.
- `clear_my_kyc` also blanks the two `*_record_id` columns, then releases.
- `update_profile(kyc_ref)` now runs `create_record(origin="typed")` *inside* the transaction, sets the three user columns, and releases the prior record. An empty `kyc_ref` leaves everything untouched.
- `remove_member`, the group delete (~4475) and the other member delete (~4386) call `release_unreferenced(conn, owner)` after the delete, in the same transaction.
- `add_beneficiary` is unchanged: it masks a typed Aadhaar and discards the digits, with no record and no vault row. No client calls `addBeneficiary` (§11).

### 4.4 Release rule (single owner of the invariant)

```python
async def release_if_unreferenced(conn, owner, record_id) -> int   # record rows deleted (0 or 1)
async def release_unreferenced(conn, owner) -> int                 # record rows deleted for this owner
```

Both return **the number of record rows deleted**. Vault rows are deleted with them and are not counted. `release_if_unreferenced(conn, owner, "")` returns 0 without querying, because writers pass the previous id, which is often empty. One statement, race-safe inside the caller's transaction:

```sql
WITH gone AS (
  DELETE FROM aadhaar_candidates r
   WHERE r.owner_user_id=%s [AND r.id=%s] AND r.consumed_at IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM family_members m WHERE m.owner_user_id=r.owner_user_id AND m.aadhaar_record_id=r.id)
     AND NOT EXISTS (SELECT 1 FROM users u WHERE u.id=r.owner_user_id AND u.kyc_aadhaar_record_id=r.id)
  RETURNING r.vault_token),
v AS (DELETE FROM aadhaar_vault USING gone WHERE aadhaar_vault.token=gone.vault_token
        AND aadhaar_vault.owner_user_id=%s RETURNING 1)
SELECT count(*) AS n FROM gone;
```

This CTE behaviour is proven against real Postgres (§12.3), not only against the fake pool.

`cleanup_expired(conn)` keeps its name and its 60-second schedule. It runs:

1. Delete unconsumed records with `consumed_at IS NULL AND expires_at < now()`, and their vault rows (same CTE pattern).
2. A global backstop, with explicit clocks:
   - records: `consumed_at IS NOT NULL AND r.updated_at < now() - interval '5 minutes'` and no subject reference (the same two `NOT EXISTS` clauses as the release CTE). `updated_at` is the clock because it is set at create, on consume and on link, so a record that was just consumed or linked is never swept before its subject write commits;
   - orphan vault rows: `aadhaar_vault.created_at < now() - interval '5 minutes' AND NOT EXISTS (SELECT 1 FROM aadhaar_candidates r WHERE r.vault_token=aadhaar_vault.token)`. `created_at` is the clock because vault rows are never updated, and the 5-minute floor covers the gap between `vault_put` and the record insert of a transaction still in flight.
3. Log counts only, at INFO: `aadhaar.sweep expired=%d orphaned=%d`.
4. It **no longer** deletes consumed rows after one day, because those are now the durable records.

Drive behaviour:

- A released record's Drive card is **not** deleted. It is a user-visible Drive file, removed through Drive, and the API cannot reach the hub DB.
- Expected behaviour testers should not report as a leak: if a user ticks "keep card" but never saves the person, the unconsumed record and its vault row are swept after 30 minutes and the Drive file remains, unlinked.

### 4.5 GraphQL contract

| Operation | Change |
|---|---|
| `linkAadhaarCard(candidateId: String!, nodeId: String!, versionId: String!): Boolean!` | **New.** It runs `UPDATE aadhaar_candidates SET card_node_id=%s, card_version_id=%s, updated_at=now() WHERE id=%s AND owner_user_id=%s AND (consumed_at IS NOT NULL OR expires_at>now())`. Audit: `_spec("link_aadhaar_card", CLASS_SECURITY, "person", "security", security=True)`. It has the same class and flags as `apply_my_kyc`, but the resource is `"person"` (as for `reveal_aadhaar`), because the record is a person's card. It is **not** in `CRITICAL_ACTIONS`. The `log_audit` detail is `"Kept an Aadhaar card"`, with no name, mask or ids. |
| `revealMyAadhaar`, `revealMemberAadhaar` | Kept in the schema; they always raise (D6). They stay matched by `_IDEM_NEVER_RE`. |
| `addMember`, `updateMember`, `applyMyKyc`, `updateProfile`, `clearMyKyc` | Signatures unchanged; internals per §4.3. |
| `PersonType.aadhaarMasked`, `UserType.kycRefMasked` | Unchanged: `XXXX-XXXX-1234` or `''`. Never the full number. |

`linkAadhaarCard` input validation:

- All three arguments are required. Each must be at most 64 characters and a canonical UUID (`str(uuid.UUID(s)) == s.lower()`).
- A bad format raises `ValueError("Invalid Aadhaar card link")`.
- Zero rows updated (wrong owner, unknown id, or an expired unconsumed reading) raises `ValueError("The Aadhaar reading is no longer available")`.
- Neither error is logged beyond the default request log.

`MaskUnexpectedErrors._unexpected` adds `aadhaar_security.ProtectionUnavailable` to its pass-through tuple: `isinstance(original, (NotAuthorized, ValueError, aadhaar_security.ProtectionUnavailable))`. Its messages are fixed, PII-free strings built in `_unavailable`. A schema-level test proves the text reaches the client (§12.2).

### 4.6 Error handling summary

| Operation | Failure | Recoverable? | Caller receives | Logged |
|---|---|---|---|---|
| `jobs.submit` for `extract-aadhaar` | no write path | fatal until configured | HTTP 503 `{"error": UNAVAILABLE_MESSAGE}`; no job row, no bytes stored, no provider call | WARNING once at startup (`aadhaar.write_path_missing`) |
| worker `extract_aadhaar` | no write path (config changed after submit), detected by the handler's pre-provider check | same | job `failed`, 503, `UNAVAILABLE_MESSAGE` | WARNING (existing) |
| worker `secure_extraction_result` | no write path detected only at `vault_put` (config changed after the provider call) | same | job `failed`, 503 `"Aadhaar protection is temporarily unavailable. Nothing was saved."` (the old "protected writes are not enabled" text no longer exists, §4.1) | WARNING `aadhaar.encrypt failed … cause=NoWritePath` |
| worker `secure_extraction_result` | KMS/Fernet failure | operator-recoverable; never auto-retried | job `failed`, 503 `"Aadhaar protection is temporarily unavailable. Nothing was saved."` | WARNING with type, purpose and owner_ref (existing) |
| worker `secure_extraction_result` | DB error in `create_record` | operator-recoverable; never auto-retried | the same 503 "Nothing was saved." (re-raised as `ProtectionUnavailable`), **not** the 502 "try again" | WARNING `aadhaar.record_store_failed type=…` |
| worker | provider or other error | user may resend | 502 (existing) | `log.exception` (existing; no digits reach messages) |
| sync `POST /extract-aadhaar` (iOS) | no write path | fatal until configured | HTTP 503 `{"error": UNAVAILABLE_MESSAGE}` before the provider call (existing) | no |
| sync `POST /extract-aadhaar` (iOS) | KMS/Fernet failure, no write mode at `vault_put`, DB error in `create_record`, or `_pool` unbound | operator-recoverable; **never auto-retried** | HTTP 503 `{"error": "Aadhaar protection is temporarily unavailable. Nothing was saved."}`, the only possible post-provider text | WARNING (`_unavailable` or `aadhaar.record_store_failed`) |
| `resolve_record` | expired, used, foreign or legacy candidate | user re-reads | GraphQL error (existing text) | no |
| `resolve_record` | typed value not 12 digits | user fixes | GraphQL error | no |
| `create_record`/`vault_put` in a resolver | protection failure | operator | GraphQL error "Aadhaar protection is temporarily unavailable" (now passed through); the transaction rolls back, so no partial member or vault row | WARNING (existing `_unavailable`) |
| `create_record` in a resolver | DB error | transient | generic masked GraphQL error plus reference (existing behaviour); rollback | `log.exception` (existing mapper) |
| `linkAadhaarCard` | invalid ids or not found | user | GraphQL error | no |
| reveal mutations | always | n/a | GraphQL error "Full Aadhaar numbers are not shown…" | no |
| sweep / reconcile | DB error | sweep retries next interval; reconcile failure fails boot like any `init_db` DDL | n/a | `log.exception` / boot error (existing) |

## 5. Client changes

### 5.1 Web (apps/web)

`apps/web/src/pages/families/PersonDialog.tsx`:

1. When the box is ticked, upload the card only after a read that returned `aadhaarCandidateId`.
   - Upload `new File([file], cardName(file.type), {type: file.type})` to the existing `/api/gateway/storage/files?appId=pattadar&onConflict=duplicate`. `cardName` is a small pure function in `PersonDialog.tsx` that lowercases the MIME type and maps it through a fixed table: `application/pdf`→`pdf`, `image/jpeg` and `image/jpg`→`jpg`, `image/png`→`png`, `image/heic`→`heic`, `image/heif`→`heif`, `image/webp`→`webp`. Anything else, including an empty type, gives `bin`. The result is `Aadhaar card.<ext>`; the original filename is never used.
   - From the response node (`id`, `currentVersionId`), call `gql(LINK_AADHAAR_CARD_MUTATION, {candidateId, nodeId, versionId})`.
   - Failures:
     - Upload fails: show the existing warning.
     - Link fails: "The card was saved to My Drive but could not be linked to this reading".
     - Read had no candidate: never upload, and say "No Aadhaar number was read, so the card was not kept".
2. Every masked display (success Alert, helper text) uses `formatAadhaarMask(aadhaarMasked)` from `@pattadar/core`, inside `<Box component="span" sx={{ fontVariantNumeric: 'tabular-nums' }}>`.
3. A read-only "Read from the card" summary shows Name, Date of birth via `ddmmyyyy()` from `apps/web/src/w360/ui.tsx`, Gender, and Aadhaar as `XXXX XXXX 1234`. It uses the MUI `Typography`/`Box` already in the file, so there is no new font, weight or page-local component.
4. The manual Aadhaar field is unchanged: typed digits are sent once on save and never displayed back.

Other web files:

- `apps/web/src/w360/pages/Groups.tsx` (~832) and `apps/web/src/pages/families/GroupDetail.tsx` (~527) render `formatAadhaarMask(m.aadhaarMasked) || '—'`. Both already use tabular-nums, and DOB is already DD/MM/YYYY. `Profile.tsx` already uses `formatAadhaarMask`.
- `packages/core/src/api/operations.ts`:
  - Adds ``LINK_AADHAAR_CARD_MUTATION = `mutation($candidateId:String!,$nodeId:String!,$versionId:String!){ linkAadhaarCard(candidateId:$candidateId,nodeId:$nodeId,versionId:$versionId) }` ``, exported from `packages/core/src/index.ts`.
  - Adds `@deprecated` on both `REVEAL_*`.
- `packages/core/src/format/audit.ts` adds the label `link_aadhaar_card: 'Kept an Aadhaar card'`, and `isSecurityAction` includes it.

### 5.2 Expo (apps/mobile): reveal/copy removal ships in this change set (via `mobile-feature-delivery`)

- `apps/mobile/src/data/hooks.ts`:
  - Remove `revealAadhaar` from `useMemberActions` and `reveal` from `useMyAadhaar`.
  - Remove the `REVEAL_AADHAAR_MUTATION`/`REVEAL_MY_AADHAAR_MUTATION` imports.
- `apps/mobile/src/app/account.tsx`: remove the copy `IconButton` (~229–240) and the `secureReveal` import. The mask continues to render through `formatAadhaarMask`.
- `apps/mobile/src/app/add-member.tsx`:
  - Remove the copy button (~477–490).
  - The stored-row `Pressable` (~453–468) no longer reveals. On press it only sets `setReplacingAadhaar(true)` with an empty field. Its label becomes "Replace the Aadhaar number", and the caption becomes "Aadhaar on record · tap to replace".
  - Remove the `secureReveal` import.
  - The mask render at ~524 is normalized with `formatAadhaarMask`.
- Delete `apps/mobile/src/lib/secureReveal.ts`, which has no remaining importers (verified by grep). No Maestro flow references reveal or copy (verified).
- Checks: `bun run --filter @pattadar/mobile typecheck`, plus the mobile unit tests if any cover these screens.

### 5.3 Native iOS (apps/ios): test-data fix only; no behaviour change (§10)

`apps/ios/PattadarKit/Tests/PattadarKitTests/DocSpineTests.swift` (~lines 192–260) commits full Aadhaar-shaped numbers. One is under the comment "The founder's own e-Aadhaar text layer", and it sits next to an enrolment number, phone, PIN, name and DOB that look real. Whether the values are real is not verified, so they are treated as real. This change set replaces them with synthetic values. Only the test data changes; every assertion keeps its intent, and no iOS source changes.

| Fixture value | Replacement |
|---|---|
| each distinct 12-digit Aadhaar run (spaced or unbroken) | a distinct synthetic number of the `(\d{4})\1\1` form: `1234 1234 1234`, `5678 5678 5678`, `4321 4321 4321`. Mask expectations update to the matching last 4, e.g. `"×××× ×××× 1234"` and `"××××××××1234"`. The `contains("…")` negative check uses the new last 4. |
| the enrolment number | `1111/22222/33333` |
| the phone and PIN in the negative test | `9000000000` and `500001` |
| date `02/04/1981`, `"dob": "1981-04-02"`, `"DOB 2 April 1981"` | `01/01/1990`, `"1990-01-01"`, `"DOB 1 January 1990"` |
| the holder name | `"Test Person"` |
| the masked `"XXXX XXXX 8203"` documentNo | `"XXXX XXXX 1234"` |
| comments that say "founder's own" | "A synthetic e-Aadhaar text layer" / "A synthetic Aadhaar upload" |

**Approved deviation (Reddy, implementation review finding 1, option a):** `parity-check.ts` check 1 fails any change to `packages/core/src/api/operations.ts` that leaves its `Queries.swift` twin alone, and it has no exemption. This design did not account for that. Reddy approved one iOS source edit: an inert `Queries.linkAadhaarCard` constant whose text is exactly `LINK_AADHAAR_CARD_MUTATION`, with no caller and no behaviour change. The other iOS edits are the `DocSpineTests.swift` fixture and the example digits in the `DocSpine.swift` doc comment, which the digit guard required. Nothing else in `apps/ios` changes.

`DocSpine` has no checksum (Verhoeff) validation: `isSensitiveIdentityValue` and `firstIdentityNumber` are regex-only. So the synthetic numbers exercise the same paths.

Checks: `swift test --filter DocSpineTests` in `apps/ios/PattadarKit`, plus `secret-scan`.

**For Reddy, not to be done by agents:** whether to purge the old values from git history (`git log -S` finds them in 2 commits). A history rewrite is destructive and irreversible. It needs a coordinated force-push, and existing forks and clones keep the old commits regardless.

## 6. Local startup (`scripts/start-local.sh`)

**Placement:** at top level and unconditionally, **after the `fi` that closes the `if [ -f "$COGNITO_LOCAL_ENV" ]; then … fi` block** (currently lines 113–116), and before the `[ -n "$IDENTITY_LEGACY_BINDINGS" ] || …` line.

- It must not sit inside that `if`. The script runs `set -euo pipefail` (line 50), so without `.local/cognito-local.env` the capture variable would be unset and the API subshell would abort with "unbound variable". That is the same class of failure as the original report.
- Because it runs after the cognito file is sourced, a key exported by that file is also captured and scrubbed before any service starts. The gateway, assistant, web and university therefore never inherit it.

```bash
AADHAAR_KEY_ENV="$PLATFORM_DIR/.local/aadhaar-key.env"
INHERITED_AADHAAR_ENC_KEY="${AADHAAR_ENC_KEY:-}"; unset AADHAAR_ENC_KEY
if [ -f "$AADHAAR_KEY_ENV" ]; then echo "» Aadhaar local key: .local/aadhaar-key.env (api only)"
else echo "» no .local/aadhaar-key.env — Aadhaar scans and saves will be refused (see docs/qa/tester-onboarding.md)"; fi
```

Only inside the API subshell `( cd "$RHUB_API_DIR"; … ) &`:

```bash
AADHAAR_ENC_KEY=""
# shellcheck disable=SC1090
[ -f "$AADHAAR_KEY_ENV" ] && . "$AADHAAR_KEY_ENV"
AADHAAR_ENC_KEY="${AADHAAR_ENC_KEY:-${INHERITED_AADHAAR_ENC_KEY:-}}" \
APP_PG_DSN=… ALLOW_INSECURE_LOCAL=1 "$VENV/bin/uvicorn" …
```

- Precedence: **the file wins** over an inherited shell value. The inherited value is used only when the file is absent or does not set the key.
- The file defines `AADHAAR_ENC_KEY` without `export`, so the prefix-assignment delivers it to uvicorn only.
- The value is never echoed. Both expansions use `:-` defaults (including the nested `${INHERITED_AADHAAR_ENC_KEY:-}`), so `set -u` holds whether or not either `.local` file exists. `ALLOW_INSECURE_LOCAL=1` is already passed, so `_write_mode()` returns `fernet`.
- The header comment documents the file by key name only.
- Not changed: `tests/e2e-web360/playwright.config.ts`/`maps.config.ts` start the API without a key, and no current e2e-web360 spec scans an Aadhaar. A future spec that does must set a per-run generated Fernet key in that config's env, never `.local`.

## 7. Documentation updates

- `docs/qa/tester-onboarding.md` (local stack):
  - `.local/aadhaar-key.env` is gitignored and defines `AADHAAR_ENC_KEY` (name only).
  - To generate a key: `python -c 'from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())'`.
  - `start-local.sh` passes the key to the API only, and the file wins over the shell.
  - Without it, scans return the named 503.
- `docs/runbooks/aadhaar-kms-rollout.md`:
  - Rewrite "Implemented contract" for the vault model: the vault table, `purpose=aadhaar-vault`, the record/vault/subject references, the sweep and reconcile, the opt-in card with its safe filename and `linkAadhaarCard`, and the D3a isolation boundary with its hardening options as open decisions.
  - Replace the reveal text with "Reveal is retired; no API returns the full number".
  - Mark "Approval gate 2 — legacy migration" **superseded** by the clear decision. Keep it as historical text.
  - Add the §8 procedure and the §13 rollback statement.
- `services/api/README.md`: one line naming `scripts/clear_aadhaar.py` (dry run by default; `--environment` required).
- Compliance and architecture documents that the change makes false. Each edit below is marked in the text **"retention change pending Reddy's compliance review"**: the widened retention is a reserved compliance decision, consistent with "data security later", and is not recorded as accepted. Where a file holds dated evidence, the superseded sentence is kept and marked historical rather than silently rewritten.

| File / location | Current claim | New wording |
|---|---|---|
| `docs/compliance/gdpr-dpdp.md` line 13 (inventory row) | "masked-only Aadhaar result and 30-minute candidate" in `aadhaar_candidates` | "masked-only Aadhaar result; `aadhaar_candidates` holds Aadhaar records (name, DOB, gender, address, last 4, job id, card link); `aadhaar_vault` holds the full number as ciphertext only" |
| same file, line 46 (retention) | "30 minutes for use; consumed rows are cleanup-eligible after 1 day" | "until the last subject reference is removed; unconsumed readings 30 minutes; orphan backstop 5 minutes" |
| same file, ~line 85 | "Full reveal remains an explicit owner-only, audited action" | "Reveal is retired; no API returns the full number. The ciphertext is kept, so masked display is still not irreversible truncation." The opt-in kept card holds the full printed number (D4). |
| `docs/compliance/engineering-checklist.md` line 7 | "owner-scoped one-use candidates, audited reveal" | "owner-scoped records with a separate ciphertext-only vault, one-use readings, reveal retired" |
| `docs/architecture/ai-system.md` line 35 (diagram) | `aadhaar_candidates<br/>KMS ciphertext, 30 min` | `aadhaar_candidates<br/>records, last 4` and a new `aadhaar_vault<br/>KMS ciphertext only` node |
| same file, lines 158–160 | one-use candidate; "persisted final digits are versioned direct-KMS ciphertext" | the candidate id resolves to a record; the digits are ciphertext only in `aadhaar_vault`; the sync route is used by native iOS |
| `docs/architecture/ai-inventory.yaml` lines 148–154 (`privacy.aadhaar`, `candidate_store`) | "30-minute one-use candidate id; candidate/final values are direct-KMS ciphertext" | records in `aadhaar_candidates`, ciphertext in `aadhaar_vault` (`purpose=aadhaar-vault`), reveal retired; `candidate_store` → `aadhaar_candidates + aadhaar_vault`; the `apps/ios` consumer note records "Aadhaar via the synchronous route (deviation, §10)" |

- `architecture-trace` checks the updated diagram against the code during implementation.
- `apps/mobile` README or screen docs, if they mention tap-to-reveal: remove the claim.

## 8. Clearing existing Aadhaar data: `services/api/scripts/clear_aadhaar.py`

It follows the `erase_account.py` conventions: sync psycopg with `dict_row`, read-only unless `--execute`, and output of counts only (no names, numbers, ciphertext or ids).

### 8.1 Target guard (decided by the target, never by host string)

- `--environment {local,dev,prod}` is **required**, with no default.
- **`local`:**
  - Only an explicit `os.environ["API_DSN"]` is accepted. Missing → exit 2 with "set API_DSN". There is never a fallback to `APP_PG_DSN`, `PG_*` or the hard-coded dev DSN.
  - It refuses if `os.getenv("APP_ENV")` is set and is not `local`.
  - After connecting, and **regardless of host** (an SSM port-forward to RDS looks like localhost), it refuses if the server looks like RDS: `SELECT 1 FROM pg_roles WHERE rolname='rdsadmin'` returns a row, or `current_setting('rds.extensions', true) IS NOT NULL`.
- **`dev`/`prod`:**
  - It requires `os.environ["APP_ENV"] == args.environment`. `APP_ENV` is set from `var.environment` in `ecs.tf`.
  - **All five** of `PG_HOST`, `PG_PORT`, `PG_USER`, `PG_PASSWORD` and `PG_DATABASE` must be set and non-empty; otherwise it exits 2 and names only the missing variable *names*. The ECS task has no `API_DSN`. The script builds the conninfo with `psycopg.conninfo.make_conninfo(host=…, port=…, dbname=…, user=…, password=…)`. It **never** calls `main._dsn_from_env`, which defaults `dbname` to `hub`.
  - It **refuses** if `API_DSN` or `HUB_DSN` is set in the environment. Remote DSNs are never accepted, so no password can arrive through RunTask `containerOverrides`.
  - The one connection serves both stages, because in AWS the API and hub tables share the database `hub` (§1). The script checks that `storage_nodes` and `documents` exist in that database before any card work; otherwise it refuses.
  - The server **must** be RDS (the `rdsadmin` role exists).
  - `--allow-remote` and `--approval-ref <text>` are required. `--execute` additionally requires `--writers-drained`.
- It refuses with "deploy the vault-schema API first" if the §3 schema is absent: no `aadhaar_vault` table in `information_schema`, or no `aadhaar_candidates.vault_token` column.
- Every refusal exits non-zero before any write, and the message never contains the DSN or password.

### 8.2 Stage 1: API DB (one transaction)

0. Handle linked cards first. Before any delete, in both the dry run and `--execute`, it runs `SELECT owner_user_id, card_node_id FROM aadhaar_candidates WHERE card_node_id<>''` and prints only the count (`linked=N`). The pairs are never printed. If `N > 0`, `--execute` refuses unless one of these is given:
   - **`--cards-linked-first`** (any environment): in the same process, before the stage-1 transaction, it runs the §8.3 verify-and-delete for each linked pair straight from the query result. The pairs never leave the process, so no file transfer is needed. Missing and refused nodes do not block (§8.3 outcomes); stage 1 then runs and drops every link. Only an S3 or hub **delete error** exits non-zero **before** stage 1, so the links survive for a re-run, and that re-run completes (already-deleted nodes now count as `missing`).
   - **`--candidates-out PATH`** (**local only**; refused for dev/prod): it writes `linked\t<owner>\t<node>` lines to `PATH`, created with `os.open(…, O_CREAT|O_EXCL|O_WRONLY, 0o600)`, so the pairs survive the deletes for a later reviewed stage-2 run.

   - **`--abandon-linked-cards`** (any environment; in dev/prod only with Reddy's approval): stage 1 deletes the records, and with them the links. The Drive files stay for their owners, and the count is printed as `abandoned_linked=N`.

   `--cards-linked-first` and `--abandon-linked-cards` together are refused.

   Linking is new in this release, so a prod clear run during the writer-control window right after the deploy is expected to report `linked=0`. If it does not, the operator stops and returns to Reddy (§8.5).
1. `DELETE FROM document_read_jobs WHERE operation='extract-aadhaar'`
2. `UPDATE family_members SET aadhaar_masked='', aadhaar_enc='', aadhaar_record_id='' WHERE aadhaar_masked<>'' OR aadhaar_enc<>'' OR aadhaar_record_id<>''`
3. `UPDATE users SET kyc_ref_masked='', kyc_ref_enc='', kyc_aadhaar_record_id='' WHERE kyc_ref_masked<>'' OR kyc_ref_enc<>'' OR kyc_aadhaar_record_id<>''`
4. `UPDATE beneficiaries SET aadhaar_masked='' WHERE aadhaar_masked<>''` (skipped if the table or column is absent)
5. `DELETE FROM aadhaar_candidates`
6. `DELETE FROM aadhaar_vault`

What is not cleared: names, addresses, DOB and gender on users and members. They are not Aadhaar identifiers, and the user may have typed them.

Output: the dry run prints `SELECT count(*)` per statement, and `--execute` prints affected counts. A re-run reports zeros, which is the idempotence evidence.

### 8.3 Stage 2: card objects (linked cards via `--cards-linked-first`; unlinked heuristic cards in a separate reviewed run)

- Connections:
  - **local:** `API_DSN` plus an explicit `HUB_DSN` (the hub is a separate database locally). The §8.1 local guard (non-RDS) applies to both, and `HUB_DSN` has no default.
  - **dev/prod:** the single `PG_*` connection (§8.1). `HUB_DSN` is refused.
- Storage: `STORAGE_BUCKET` is required for any card deletion. It is a non-secret name, so passing it as a RunTask environment override is acceptable. Locally `STORAGE_S3_ENDPOINT` and the MinIO credentials are also required. In AWS, S3 credentials come only from the task role, never from overrides.
- **Heuristic dry run with `--candidates-out PATH`** (local only, 0600, `O_EXCL`):
  - It appends heuristic candidates as `heuristic\t<owner_id>\t<node_id>` lines. These are hub `storage_nodes` with `kind='file'` and `name ILIKE ANY('{%aadhaar%,%aadhar%}')`; legacy uploads were never marked, so only a heuristic can find them.
  - It prints counts per origin. A human reviews and prunes the file.
- **Heuristic deletion requires `--card-nodes PATH` (the reviewed file) plus `--execute`.** It is **local only for now**. In dev/prod, `--candidates-out` and `--card-nodes` are refused, because a one-off Fargate task has no retrievable filesystem. The heuristic stage there needs an approved transfer location (for example a dedicated, encrypted operator S3 prefix), which is an open decision for Reddy. Until that decision, **the prod heuristic stage is not available**.
- **Schema precondition** (unchanged): `storage_nodes` must exist on the hub connection and `documents` on the API connection; otherwise card work is refused before any delete.
- **Reference set, derived from the catalog once per run.** On every distinct connection the run holds (locally `API_DSN` and `HUB_DSN`; in dev/prod the single `PG_*` connection), the script runs:

  ```sql
  SELECT c.table_name, c.column_name
    FROM information_schema.columns c
    JOIN information_schema.tables t
      ON t.table_schema=c.table_schema AND t.table_name=c.table_name AND t.table_type='BASE TABLE'
   WHERE c.table_schema='public'
     AND (c.column_name='file_ref' OR c.column_name LIKE '%\_file\_ref' ESCAPE '\')
   ORDER BY 1, 2
  ```

  Today this finds `documents.file_ref` (main.py ~6214), `associate_credentials.file_ref` (`associates.py` ~191), `property_photos.file_ref` (~5677), `parcel_photos.file_ref` (~5970), `registered_documents.file_ref` (~6146), `ticket_deliverables.file_ref` (`ticketing.py` ~138) and `land_expenses.receipt_file_ref` (`web360.py` ~463/~725). New columns that follow the naming convention are covered without a script change. Only the count of `(table, column)` pairs is printed (`reference_columns=N`); if it is 0 on the API connection the run refuses, because `documents.file_ref` must always be found. Each lookup is built with `psycopg.sql`, never string formatting:

  ```python
  sql.SQL("SELECT 1 FROM {}.{} WHERE {} = ANY(%s) LIMIT 1").format(
      sql.Identifier("public"), sql.Identifier(table), sql.Identifier(column))
  ```

  The parameter is `[node_id, *version_ids]`, so a column that happens to store a version id instead of a node id is also caught. Any hit makes the node `refused_referenced`.
- **Per-node verification and outcomes** (used by both `--cards-linked-first` and `--card-nodes`). Each node gets exactly one outcome, checked in this order:

  | Outcome | Condition | Action | Blocks stage 1? |
  |---|---|---|---|
  | `missing` | no hub `storage_nodes` row with that id | nothing; treated as already deleted (for example by an earlier partial run) | no |
  | `refused_foreign_owner` | the node exists but `owner_id` differs from the recorded owner (a forged link), or `kind<>'file'` | node, versions and bytes untouched | no; stage 1 drops the link, and the file stays in its owner's Drive |
  | `refused_referenced` | any reference-set column holds the node id or one of its version ids | node, versions and bytes untouched | no; stage 1 drops the link, and the file stays in the owner's Drive, exactly as with `--abandon-linked-cards` |
  | `deleted` | verified | S3 versions purged, then the hub node row deleted | no |
  | delete error | an S3 call or the hub `DELETE` raises | stop processing further nodes | **yes**: exit non-zero before stage 1 |

- For each verified node, in this order (S3 first, so a failure never leaves bytes without a hub row that a re-run could find):
  1. Read `object_key` from every `storage_versions` row of the node.
  2. Delete every S3 version and delete marker of exactly that key (`list_object_versions(Prefix=key)` filtered to `Key==key`, then `delete_object(VersionId=…)`, the `erase_account.delete_prefix` pattern narrowed to one key).
  3. Run `DELETE FROM storage_nodes WHERE id=%s AND owner_id=%s` in its own committed transaction, which cascades to versions and stream sessions.
- **Re-run after a partial failure.** Example: node A was deleted, then node B's S3 delete failed, so the run exited before stage 1 and both links remain. The re-run finds A `missing` (not a blocker) and B either still present (re-verified and deleted) or with S3 already purged but its hub row present (an empty version list, then the hub delete). Stage 1 then runs, and the exit code is 0. A further re-run reports zeros.
- Version purge versus delete marker: the version purge is chosen so the bytes are actually gone. It needs `s3:ListBucketVersions` and `s3:DeleteObjectVersion`, which neither the API nor the gateway task role has (§1). The alternative is the gateway `hard_delete` semantics: a plain `delete_object`, with the bytes expiring by lifecycle after `noncurrent_version_expiration_days` (default 180). That needs only `s3:DeleteObject`, but leaves the bytes recoverable for months. In AWS, which role runs card deletion is Reddy's IAM decision (§8.5, §9).
- Output: counts only, as `reference_columns=N verified=N deleted=N missing=N refused_foreign_owner=N refused_referenced=N delete_errors=N`. Table and column names are not secret but are not printed either; node ids, owner ids and keys never are.

### 8.4 Local run (allowed now)

1. Boot the new API once so the schema exists, then **stop the local stack** (Ctrl-C on `start-local.sh`) so no queued or running local `extract-aadhaar` job can create a record mid-clear.
2. Run:

```sh
cd services/api
export API_DSN="host=localhost port=5432 dbname=pattadar user=rhub" PGPASSWORD=<local>
export HUB_DSN="host=localhost port=5432 dbname=pattadar_hub user=rhub" STORAGE_BUCKET=pattadar-local-documents
export STORAGE_S3_ENDPOINT=http://127.0.0.1:9000 AWS_ACCESS_KEY_ID=<local minio> AWS_SECRET_ACCESS_KEY=<local minio>
PY=../../.local/api-venv/bin/python
# 1. dry run: counts only (linked=N included); also lists unlinked heuristic card candidates for review
$PY scripts/clear_aadhaar.py --environment local --candidates-out /tmp/aadhaar-candidates.tsv
# 2. execute: linked cards first (verified, in-process), then stage 1
$PY scripts/clear_aadhaar.py --environment local --execute --cards-linked-first
# 3. optional: unlinked legacy cards, from the reviewed and pruned candidates file
$PY scripts/clear_aadhaar.py --environment local --card-nodes /tmp/aadhaar-candidates.tsv --execute
# 4. re-run: expect all zeros
$PY scripts/clear_aadhaar.py --environment local
```

The zero-count re-run is the evidence. The candidates files are scratch artifacts and are deleted after review.

### 8.5 Production procedure: AWAITING REDDY'S APPROVAL; NOT TO BE RUN BY AGENTS

**Scope:**

- Prod API DB: all rows in `aadhaar_candidates`, `aadhaar_vault` and `document_read_jobs` with `operation='extract-aadhaar'`, plus blanking of the Aadhaar columns on `users`, `family_members` and `beneficiaries`, for all owners.
- Optionally, a reviewed stage-2 list in the prod hub DB and the documents bucket.

**Preconditions:**

- The vault-schema release is deployed via tested-release and is healthy.
- A fresh RDS snapshot is taken and its id recorded.
- The documents-bucket versioning state is noted.
- A writer-control window is open (API, gateway and workers drained, or maintenance held, per `account-data.md` step 4).

**Command:** an ECS one-off task on the current API task definition, in the API service's subnets and security group. The image contains `scripts/`. The environment has the `PG_*` parts (with `PG_PASSWORD` from Secrets Manager) and `APP_ENV=prod`.

**Never pass a password, DSN or credential in `containerOverrides`.** Overrides are visible in the RunTask request, CloudTrail and `describe-tasks`. Only the `command` and, for card work, the non-secret `STORAGE_BUCKET` may be overridden.

```sh
aws ecs run-task --cluster <prod-cluster> --task-definition <prod-api-taskdef:rev> --launch-type FARGATE \
  --network-configuration '<api service awsvpc config>' \
  --overrides '{"containerOverrides":[{"name":"api","command":["python","scripts/clear_aadhaar.py",
    "--environment","prod","--allow-remote","--approval-ref","<ticket>"]}]}'
```

1. Run the dry run first (as above) and review the counts, including `linked=N`.
2. **If `linked=0`** (expected, because linking ships in this same release and writers are drained): run the same command with `--execute --writers-drained`. This is stage 1 only.
3. **If `linked>0`: stop.** The script refuses `--execute` here anyway. Return to Reddy with the count. The options are:
   - approve `--cards-linked-first`, together with an S3 permission route for the one-off task (§8.3; open IAM decision, §9);
   - or accept leaving those Drive files for owners to delete, and run with `--cards-linked-first` withheld. In that case the script needs Reddy's explicit `--abandon-linked-cards` acknowledgement flag, which drops the links (counted) and leaves the files in Drive.
4. Run the zero-count re-run.
5. The heuristic stage for legacy unlinked cards is **not available in prod** until Reddy approves a transfer location for the reviewed list and the S3 permission route (§8.3). `--candidates-out` and `--card-nodes` are refused for dev/prod.

**Side effects:**

- Every stored Aadhaar mask and ciphertext is gone. Users see no Aadhaar on file and must re-enter or re-scan.
- Pending readings fail with "read the card again".
- Audit history is untouched.

**Data exposure:** the output is counts only. No candidate file is written in dev/prod. Linked pairs stay inside the task process, and the RunTask request carries no secret.

**Reversibility: irreversible** in the live DB, and in S3 once versions are deleted.

- Recovery is only by RDS snapshot restore, under `safe-data-migration` and `rds-restore-drill.md`.
- The data persists in automated backups until their retention expires, so it is not claimed as erased from backups.

**Evidence:** dry-run counts, execute counts, zero re-run counts, the snapshot id, the task ARN suffix and the SHA, all redacted.

**Required approval:** Reddy approves the exact SHA, the environment (prod), the snapshot id and the writer-control window. He also approves stage 1 alone, or, if `linked>0`, either `--cards-linked-first` with its S3 role route or `--abandon-linked-cards`. Heuristic card cleanup in prod is a later, separate approval. **A fresh confirmation is required immediately before `--execute`.** Dev, if running, gets the same procedure with its own approval.

## 9. Infrastructure

- No Terraform change. The vault uses the existing Aadhaar CMK and task-role grant (`purpose` `aadhaar-vault` matches `aadhaar-*`). Documents-bucket SSE-KMS (`modules/persistent/s3.tf`, gateway `_put_args`, `enforce_documents_sse_kms_headers`) already covers card uploads.
- FLAGGED for Reddy, not designed here:
  - (a) The D3a hardening options; option (i), the IAM Deny, is a Terraform change.
  - (b) The S3 permission route for card deletion in AWS, needed only if prod reports `linked>0` or heuristic cleanup is later approved. Neither the API nor the gateway task role has `s3:ListBucketVersions`/`s3:DeleteObjectVersion`, and the API task role has no documents-bucket access at all. The options are:
    - a dedicated operator role (Terraform);
    - a RunTask `taskRoleArn` override (needs `iam:PassRole`);
    - delete-marker-only semantics under the gateway role, with lifecycle expiry after 180 days (§8.3).
  - (c) A transfer location for a reviewed heuristic card list in dev/prod.
  - (d) The optional dedicated API-only DB role/schema (D3a option ii).

## 10. Native iOS and Expo parity

**Expo (`apps/mobile`):**

- The reveal/copy removal is **in this change set** (§5.2), so no dead button ships.
- Follow-up (optional, `mobile-feature-delivery`): a card opt-in with `linkAadhaarCard` and the safe filename.

**iOS (`apps/ios`):**

- **In this change set (test data only):** the `DocSpineTests.swift` fixture is replaced with synthetic values (§5.3). There is no iOS behaviour change. The only iOS source edits are the `DocSpine.swift` doc-comment digits and the inert `Queries.linkAadhaarCard` twin that Reddy approved (§5.3, approved deviation).
- **Pre-existing invariant deviation, recorded here:** iOS Aadhaar reads are **synchronous** (`POST /extract-aadhaar`), not durable async jobs with authenticated status polls. The server-side wrapper (§4.2) makes that route's failure shape safe ("Nothing was saved." 503), but it does not make the read durable. Moving iOS to `extract-aadhaar-async` plus `import-status` is a `sync-ios` follow-up and **a decision for Reddy**. It is not changed here.
- No build or vector break. iOS uses `extract-aadhaar` (mask + candidate), `addMember(…aadhaarCandidateId…)` and `updateProfileAadhaar`, all unchanged. It never calls the server reveals. `parity-check.ts` check 3 passes, because no schema field is removed.
- **Known divergence, decision for Reddy:** iOS has a local tap-to-reveal of the *full* Aadhaar, read from the user's on-device scan (`PattadarKit/Format/DocSpine.swift` `firstIdentityNumber`, used by `AllDetailsScreen.swift:108`; `DocumentViewer.swift` reveal toggle ~331–345). This conflicts with the "show only the last 4 digits" rule. The two options are:
  - retire it, which removes the reveal and `firstIdentityNumber` plus its `DocSpineTests`;
  - accept it as on-device-only, since the full number never comes from the server.

  It is **not changed in this design**. It is tracked as a `sync-ios` follow-up and recorded as a known divergence in the parity notes.
- Other follow-ups (`sync-ios`):
  - (a) An optional card opt-in with `linkAadhaarCard`.
  - (b) A `link_aadhaar_card` label in `Display.swift`'s audit map.

## 11. Out of scope

- Field-level encryption of name, DOB and address (Reddy: later).
- D3a vault hardening (decision pending).
- A beneficiaries vault. `addBeneficiary` has no client caller (`grep addBeneficiary` across `apps/` and `packages/` is empty). Its typed Aadhaar is masked and discarded, not vaulted and not recorded in `aadhaar_candidates`, so it is outside "store all the data in the Aadhaar table" until a client uses it. Wiring it to `resolve_record` is a follow-up if a client ever adds the flow.
- Surfacing the linked card on the person page.
- Moving queued source bytes out of `document_read_jobs.source` (a known exposure in the runbook).
- GuardDuty gating of retained cards.
- Changing iOS behaviour, including moving it to the async route (§10). The test-fixture replacement (§5.3) is in scope.
- A git-history purge of the old fixture values (Reddy's decision; destructive).
- Prod heuristic card cleanup and the AWS S3 permission route (§8.3, §9).
- Dropping the legacy columns (`aadhaar_enc`, `kyc_ref_enc`, `aadhaar_candidates.ciphertext`). That is a later cleanup, after the prod clear is evidenced and no rollback window remains.

## 12. Test plan

All examples use the synthetic number `123412341234`. The unit tests use the existing fake pool/KMS style. The new real-DB tests follow the `test_vault_folders.py` pattern: a throwaway schema on `TEST_PG_DSN`, skipped locally without Postgres, failing in CI.

### 1. `test_aadhaar_security.py` (rewritten)

Vault and record writes:

- `create_record` writes one vault row (`kms-direct:v1:`) and one record. The record has `masked='XXXX-XXXX-1234'`, `last4='1234'`, `origin='scan'` and the job id.
- The KMS context has `purpose=aadhaar-vault`, `schema=v1` and `record=<token>`, and contains neither the digits nor the raw owner.
- Fernet mode produces `fernet:v0:` rows in the same table.
- A test-local helper `_vault_plain(conn, owner, token)` (in the test module, using `aadhaar._decrypt_bytes`) round-trips the value, and a foreign owner gets no row.
- Grep check: `src/` contains no runtime call to `_decrypt_bytes` outside `aadhaar.py`'s own definition, and `main.py` imports no decrypt function.

`secure_extraction_result`:

- It returns the unchanged key set, and **response `fields` equal the stored record** for `name`, `dob`, `gender`, `address` and `confidence`.
- Normalization: an invalid `dob` or `gender` becomes `''`, and a long name or address is truncated.
- `json.dumps(result)` contains no 12-digit run.
- With no digits, no record is created.
- A DB error in `create_record` raises `ProtectionUnavailable`.

Consumption, release and sweep:

- One-use consumption raises the existing message for a second consume, a foreign owner, an expired reading, or a legacy row with `vault_token IS NULL`.
- A typed record is created with `expires_at=DURABLE_EXPIRES_AT` and `consumed_at` set; consuming a scan record sets `consumed_at`, `updated_at` and `expires_at=DURABLE_EXPIRES_AT` (statement and parameters asserted on the fake pool).
- With no write mode, `vault_put` raises `ProtectionUnavailable` whose message equals `PROTECTION_FAILED_MESSAGE`; the captured WARNING has `cause=NoWritePath` and no digits. The old "not enabled" assertions (~192, ~208, ~270) are rewritten to this.
- The removed functions are gone (`hasattr` checks).
- Every log record captured by `caplog` contains no 12-digit run.

### 2. `test_ai_reading.py` / `test_import_jobs.py`

- `submit` for `extract-aadhaar` with no write path returns 503 `{"error": UNAVAILABLE_MESSAGE}`, inserts no job row, and does not read the file.
- The worker passes the job id into the record.
- A worker DB error in `create_record` gives job status 503 with "Nothing was saved.", not 502.
- `document_read_jobs.result` has no 12-digit run.
- The existing no-auto-retry and `ProtectionUnavailable` tests stay green.
- `secure_extraction_result` with `_pool` unbound raises `ProtectionUnavailable`, and the worker reports 503 "Nothing was saved.".
- `test_aadhaar_protection_failure_after_the_read_is_503_not_502` (~126) is rewritten for D9: `write_path_available` is monkeypatched to `True` for `submit` only, so the job is queued, then the real `_write_mode` finds no key at `vault_put`. The job status body's `error` equals exactly `"Aadhaar protection is temporarily unavailable. Nothing was saved."` (no longer `'not enabled' in …`).
- Sync route `operations.extract_aadhaar` with a fake request carrying `x-user-id`, and the provider stubbed to return 12 digits:
  - a `create_record` DB error returns `JSONResponse` 503 with body `{"error": "Aadhaar protection is temporarily unavailable. Nothing was saved."}`;
  - a KMS error gives the same;
  - no write mode at `vault_put` (pre-check monkeypatched to pass, key removed) gives the same exact body; the assertion is string equality against that one sentence, so any other text fails the test;
  - the provider stub was called exactly once (no retry);
  - the body has no 12-digit run.

### 3. New `test_aadhaar_vault_db.py` (real Postgres)

- Running `aadhaar.DDL` plus the `init_db` Aadhaar ALTERs **twice** gives exactly one FK on `aadhaar_candidates.vault_token` (checked in `pg_constraint`).
- The release CTE:
  - A record shared by the account and a self member survives while either reference remains.
  - It is deleted, with its vault row, once both references are gone.
  - The function returns 1, then 0.
- The sweep deletes expired unconsumed rows and orphans older than 5 minutes, and keeps consumed referenced rows. Clocks: an unreferenced consumed record with `updated_at` 4 minutes old survives and one 6 minutes old is deleted; an orphan vault row with `created_at` 4 minutes old survives and one 6 minutes old is deleted (timestamps set directly in SQL).
- **Old-sweep compatibility (deploy overlap and rollback).** Create a typed record through `create_record(origin="typed")` and a scan record consumed through `resolve_record`, both with `consumed_at` less than a day old. Then execute the **old** statement verbatim, kept in the test as a literal string `OLD_CLEANUP = "DELETE FROM aadhaar_candidates WHERE expires_at<now() OR consumed_at<now()-interval '1 day'"`. Assert both records and their vault rows survive. As a control, an unconsumed scan record whose `expires_at` has passed is deleted by the same statement.
- Export with the sentinel: `account.export_data` for an owner with a typed record returns normally (no psycopg `DataError`), and the exported `expires_at` is the `9999-01-01` sentinel.
- The reconcile blanks a dangling `aadhaar_record_id` or `kyc_aadhaar_record_id`, and one pointing at another owner's record, and leaves valid pointers alone.
- Erasure order: deleting the vault row first nulls `vault_token`.

### 4. New `test_aadhaar_vault_contract.py` (`schema.execute`, fake context)

- The reveals return the retirement error.
- `linkAadhaarCard` validates UUIDs and owner scope, and writes the audit spec with `security=True` and a name-free detail.
- `updateProfile(kycRef)` and typed `addMember`:
  - create a record;
  - set `*_record_id`;
  - blank `*_enc`;
  - release the prior record on replacement.
- A resolver hitting `ProtectionUnavailable` returns **its own message** to the client, not the masked generic.

### 5. New `test_clear_aadhaar.py`

Guards:

- `--environment` missing → refuse.
- `local` with no `API_DSN` → refuse, and never use a default.
- `local` with `APP_ENV=prod` → refuse.
- `local` on a loopback DSN whose server has `rdsadmin` → refuse.
- `prod` without `--allow-remote`/`--approval-ref`, or with `APP_ENV` ≠ `prod`, or on a non-RDS server → refuse.
- `--execute` without `--writers-drained` on dev/prod → refuse.
- Missing schema → refuse.
- `prod` (or `dev`) with `HUB_DSN` or `API_DSN` set → refuse.
- Each of the five `PG_*` parts missing or empty → exit 2. The message names the variable and never contains a value. `main._dsn_from_env` is never called (monkeypatched to raise).
- `prod` with `--candidates-out` or `--card-nodes` → refuse.
- `prod` with `storage_nodes` absent from the connected DB → refuse card work.
- `--cards-linked-first` together with `--abandon-linked-cards` → refuse.

Statement plan and order:

- Local `--candidates-out`: pairs are written before the deletes, and the file is mode 0600 with `O_EXCL`.
- `--execute` with linked pairs and none of `--cards-linked-first`, `--candidates-out` (local) or `--abandon-linked-cards` → refuse.
- `--cards-linked-first` (fake S3 + hub):
  - verified linked nodes are deleted before the stage-1 statements;
  - an S3 failure exits non-zero with stage 1 not run and the links intact.
- `--abandon-linked-cards` deletes the records, touches no S3 or hub object, and prints `abandoned_linked=N`.
- Captured stdout/stderr contain no owner id, node id, DSN or password.
- Idempotence: the second run's counts are zero.

Stage 2 (real Postgres for the catalog query, fake S3):

- A foreign-owner linked id is `refused_foreign_owner`, is not deleted, and stage 1 still runs and drops its link.
- A `documents.file_ref`-referenced id is `refused_referenced`.
- A node referenced from `parcel_photos.file_ref` is `refused_referenced`: its hub row, versions and fake-S3 objects remain, and stage 1 runs (exit 0).
- A node referenced from `land_expenses.receipt_file_ref` is `refused_referenced` and kept, with the same assertions.
- A throwaway table with a new `*_file_ref` column holding the node id is also refused, proving the catalog derivation rather than a fixed list. A table name that needs quoting (for example one containing a capital letter) works, proving `sql.Identifier`.
- Partial-failure re-run: nodes A and B are linked, and the fake S3 raises on B. Run 1 deletes A, exits non-zero, and stage 1 has not run (links intact). Run 2, with S3 healthy, reports `missing=1 deleted=1`, runs stage 1, exits 0. Run 3 reports zeros.
- A missing node alone gives `missing=1` and does not block stage 1.
- Only exact keys are deleted, S3 is purged before the hub `DELETE`, and the delete SQL includes `owner_id`.

### 6. `account` tests

- `export_columns` omits `vault_token` and `ciphertext` and includes `origin`.
- `export_columns` for `aadhaar_vault` returns exactly `["created_at", "owner_user_id"]` (the intended existence-only export, §3).

### 7. Web and core

- `bun run --filter @pattadar/web typecheck` and the existing unit tests.
- `packages/core`: an `audit.ts` label test. `formatAadhaarMask` is already covered.
- Sealed `tests/e2e-app/specs/07-record-people.spec.ts`:
  - Unticked: no `storage/files` call.
  - Ticked: upload named `Aadhaar card.<ext>`, then `linkAadhaarCard`.
  - The success text shows `XXXX XXXX 1234`, and the DOB summary is DD/MM/YYYY.
  - The page has no 12-digit run.
- Specs 19 and 01 are adjusted only if their mask assertions change.

### 8. Expo

- `bun run --filter @pattadar/mobile typecheck`.
- `grep -rn "reveal\(My\|Member\)Aadhaar\|secureReveal" apps/mobile/src` is empty.

### 9. Guards (UI change)

- Every `scripts/*-tests.ts`, including `typography-tests.ts` and `shared-components-tests.ts`.
- `ux-guards.ts`, `icon-guard.ts`, and `bun run scripts/parity-check.ts`.
- **New `scripts/aadhaar-digits-tests.ts`** (auto-discovered by the CI `for script in scripts/*-tests.ts` loop):
  - It scans `git ls-files` text files for Aadhaar-shaped runs: `(?<![\d.])\d{4}[ -]?\d{4}[ -]?\d{4}(?![\d.])`.
  - **Allowed:**
    - (a) values whose first digit is 0 or 1, which UIDAI never issues;
    - (b) the synthetic `(\d{4})\1\1` form, e.g. `1234 1234 1234` or `5678 5678 5678`;
    - (c) a reviewed `PATH_ALLOW` list, each entry with a one-line reason. Examples: Terraform `backend.tf`/`s3.tf` AWS account ids, media-streaming byte ranges, ticket ids. The implementer builds this list from the first scan, and every entry is reviewed. Two rules make the Aadhaar-context exclusion precise, with `AADHAAR_CONTEXT = /aadha?ar|ఆధార్/i`:
      - **Entry rule:** at load time the guard fails if any `PATH_ALLOW` path matches `AADHAAR_CONTEXT`. Such a file can never be path-allowed.
      - **Line rule:** a hit whose own line matches `AADHAAR_CONTEXT` is never allowed by `PATH_ALLOW`, even in an allowed file. It passes only through rule (a) or (b).
      - Both rules have self-test cases: an allow entry named like `aadhaar-fixture.ts` fails the guard, and a non-synthetic hit on a line mentioning Aadhaar inside an allowed path is reported.
  - **Output:** `path:line` only, never the value. It fails on any unallowed hit.
  - **Self-test:** a synthetic in-memory positive (a run starting 2–9 that is not of the repeated form, built at runtime from parts so that the guard file itself contains no literal run) and negatives for each allow rule.
  - A first scan (file names and counts only) found 39 tracked files with such runs, mostly tests and Terraform. The implementer must replace every non-synthetic Aadhaar-context value, starting with `DocSpineTests.swift`, `test_aadhaar_security.py`, `apps/mobile/tests/aadhaar.test.ts` and the e2e-app specs 07 and 19, wherever they are not already of a synthetic form.

### 10. Shell and functional acceptance (`functional-acceptance`)

Shell checks:

- `bash -n scripts/start-local.sh`.
- Start once with `.local/cognito-local.env` temporarily moved aside (and restored afterwards). The API must start (its health check passes) with no "unbound variable" error, and a scan must still work when `.local/aadhaar-key.env` is present.
- Start once with `.local/aadhaar-key.env` moved aside (restored afterwards). The API starts, the banner names the missing file, and a scan returns the named 503.
- Key isolation, count-only. The check never targets the API process and never prints an environment:

  ```sh
  for p in "$GW_PID" "$ASSISTANT_PID" "$WEB_PID"; do ps eww -p "$p" | grep -c 'AADHAAR_ENC_KEY='; done
  ```

  Each line must print `0`. The PIDs are taken from `start-local.sh`'s own process list (the gateway, assistant and web children), never from a broad `pgrep` that could match uvicorn for the API.
- The API's key is proven by behaviour only: with `.local/aadhaar-key.env` present, a synthetic scan succeeds and the API startup log has no `aadhaar.write_path_missing` line. The API process environment is never inspected.

End-to-end on the local stack, in this order:

- read;
- save member;
- list shows `XXXX XXXX 1234`;
- edit without Aadhaar keeps it;
- replace with a typed number (the old record goes);
- apply-my-KYC shares one record;
- remove member (the record and vault row go);
- ticked card appears in My Drive as `Aadhaar card.pdf`, linked;
- failure path: temporarily rename the key file, and expect the named 503 with no provider call;
- iOS path through the gateway: `POST /api/extract-aadhaar` (sync) with a local token and a synthetic card returns `{aadhaarMasked, aadhaarCandidateId}`. With protection broken after the pre-check (a test-only fault in a unit test, not live), the gateway passes the upstream 503 JSON body through unchanged. This closes the review's untraced gateway pass-through assumption.

iOS: `swift test --filter DocSpineTests` passes with the synthetic fixture.

### 11. Local clear

With the stack stopped: a dry run, then execute, then a zero-count re-run, against the local dev DB only. Keep the counts as evidence.

## 13. Rollout and rollback

1. Implement and verify locally (§12). Run `secret-scan` before any commit. Commits happen only when Reddy asks.
2. Release through `tested-release`/`release-readiness`, with Reddy approving the SHA. This one release includes the API, web, core and the Expo reveal removal. **Release is NO-GO if the Expo removal is not in the same SHA.** The Expo store build follows the normal store process; older installed Expo builds show the server retirement error on reveal, which is acceptable because no full number is returned.
3. Run the production clear per §8.5, under separate approval.
4. Later cleanup release: drop the legacy columns, after the clear has evidence.

**Deploy overlap.** The API service uses the ECS default rolling update (§1), so old tasks keep running their 60-second `cleanup_expired` (`expires_at<now() OR consumed_at<now()-interval '1 day'`) beside new tasks for the length of every deployment, and again after any rollback. Because every durable record carries `expires_at = DURABLE_EXPIRES_AT` from the moment it becomes durable (§4.1), the old sweep deletes unconsumed readings 30 minutes after the read (the same as the new sweep) and consumed records only one day after consumption. **During a deploy overlap, which lasts minutes, no durable record is lost.** §12.3 proves this by running the old statement verbatim against real Postgres.

**Rollback statement.** Rolling back to the previous revision is **schema-safe but lossy for vault records if the window exceeds a day**. The old code ignores the new table and columns, but in a rollback window:

- the old `cleanup_expired` deletes unconsumed readings 30 minutes after the read, and consumed records one day after consumption, including referenced ones. A rollback window longer than a day therefore loses every record consumed before it, which leaves dangling subject pointers and orphaned vault rows;
- the old `consume_candidate` fails (masked 500) on new readings, whose `ciphertext` is NULL;
- the old writers set `aadhaar_masked`/`aadhaar_enc` without clearing `*_record_id`.

On roll-forward:

- the boot reconcile (§3) blanks dangling pointers;
- the sweep backstop removes orphaned vault rows;
- writers blank legacy `*_enc` on the next write.

Any rollback window **requires re-running the §8 clear**, with its approval, before the legacy columns are dropped. That clears the legacy ciphertext the old code wrote and restores a model-conformant dataset.

## Responses to review findings (revision 3: second review, 0 HIGH / 6 MEDIUM / 6 NIT)

| # | Sev | Response |
|---|---|---|
| 1 | MEDIUM | **Addressed** (§1, §4.2, §4.6, §10, §12.2, §12.10). §1 now states that the sync route is the current native-iOS path. `operations.extract_aadhaar` wraps `secure_extraction_result` and maps `ProtectionUnavailable` to 503 `{error: "… Nothing was saved."}`, with §4.6 rows and sync-route tests (DB and KMS errors; provider called once). The synchronous iOS read is recorded as a pre-existing deviation from the durable-job invariant, and moving iOS to `-async` is a `sync-ios` follow-up and a decision for Reddy. iOS is not changed. |
| 2 | MEDIUM | **Addressed** (§6, §12.10). The capture is at top level and unconditional, after the `fi` that closes the cognito block. The subshell uses `${AADHAAR_ENC_KEY:-${INHERITED_AADHAAR_ENC_KEY:-}}`. New checks start the stack without `cognito-local.env` and without `aadhaar-key.env`. |
| 3 | MEDIUM | **Addressed** (§8.1, §8.2 step 0, §8.3, §8.5, §9, §12.5). In dev/prod one connection is built from the five `PG_*` parts (shared `hub`), and `HUB_DSN`/`API_DSN` are refused. The new `--cards-linked-first` verifies and deletes linked cards in-process before stage 1, so no file transfer is needed. `--abandon-linked-cards` is an explicit alternative. `--candidates-out`/`--card-nodes` are local-only, so the prod heuristic stage is unavailable until Reddy approves a transfer location and an S3 permission route. The ban on secrets in `containerOverrides` is stated. Linked count is expected to be 0 in prod, because linking ships in this release; `linked>0` stops for Reddy. Tests are added. |
| 4 | MEDIUM | **Addressed** (§1, D3a, D5). The local-vs-AWS database facts are corrected. D3a states that the gateway and assistant can read the vault ciphertext and the plaintext record fields but cannot decrypt. Option (ii) is reworded as a dedicated API-only role/schema. D5's reason is now environment-neutral. |
| 5 | MEDIUM | **Addressed** (§7). The exact rows in `gdpr-dpdp.md` (13, 46, ~85), `engineering-checklist.md` (7), `ai-system.md` (35, 158–160) and `ai-inventory.yaml` (148–154) are listed with the new wording. The retention change is marked pending Reddy's compliance review, and evidence text is kept as historical. |
| 6 | MEDIUM | **Addressed** (§5.3, §10, §11, §12.9). The `DocSpineTests.swift` fixture is replaced with synthetic values in this change set (Aadhaar, enrolment, phone, PIN, name, DOB). It is test-only, and `DocSpine` has no checksum to break. The git-history purge is flagged as Reddy's decision. A new `scripts/aadhaar-digits-tests.ts` guard reports `path:line` only, with UIDAI-first-digit, synthetic-form and reviewed-path allow rules. |
| 7 | NIT | **Addressed** (§4.3, §4.4). `resolve_record` with neither input returns `("", "")`. `release_if_unreferenced` with an empty id returns 0 without querying. |
| 8 | NIT | **Addressed** (D4). The kept card is stated as the user-requested exception: SSE-KMS, owner-authorized, gateway-decryptable, shareable. |
| 9 | NIT | **Addressed** (§8.1, §12.5). All five `PG_*` parts must be non-empty, otherwise exit 2. `main._dsn_from_env` is never called (tested). |
| 10 | NIT | **Addressed** (§4.2). The snippet uses `_pool.connection()`, and `_pool is None` raises `ProtectionUnavailable` (tested). |
| 11 | NIT | **Addressed** (§4.5). The resource is `"person"`, and the wording is now "same class and flags as `apply_my_kyc`". |
| 12 | NIT | **Addressed** (§3 notes, §12.6). The existence-only export of `aadhaar_vault` (`owner_user_id`, `created_at`) is stated as intended and tested. |

The review's "unverified" gateway 503 pass-through to iOS is now covered by a §12.10 functional check. The FK-rerun and release-CTE items stay covered by §12.3.

## Responses to the first review (revision 2, kept for history)

| # | Sev | Response |
|---|---|---|
| 1 | HIGH | **Addressed** (§8.1, §12.5). `--environment` is required. `local` takes only an explicit `API_DSN`, with no fallback to the dev default, and refuses `APP_ENV`≠local and any RDS server regardless of host. `dev`/`prod` require `APP_ENV` to match, an RDS server, `--allow-remote --approval-ref`, and `--writers-drained` with `--execute`. Guard tests added. |
| 2 | MEDIUM | **Addressed** (§8.2 step 0, §8.3, §12.5). Linked (owner, node) pairs are persisted to a 0600 `O_EXCL` file before the deletes, and `--execute` requires the file when pairs exist. Stage 2 verifies `kind='file'`, owner match and no `documents.file_ref`, and deletes `WHERE id AND owner_id`. Heuristic candidates also record the owner. Tests cover the foreign-owner and file_ref cases. |
| 3 | MEDIUM | **Addressed** (§3 reconcile, §13). The rollback statement says "schema-safe but lossy". The boot reconcile UPDATEs blank dangling pointers, including cross-owner ones, and the clear must be re-run after any rollback window. |
| 4 | MEDIUM | **Addressed** (§4.2, §4.5, §4.6, §12.2, §12.4). `ProtectionUnavailable` is added to the `_unexpected` pass-through, with a schema-level test. A worker DB error in `create_record` is re-raised as `ProtectionUnavailable` (type-only log), so the result is 503 "Nothing was saved.", not 502. |
| 5 | MEDIUM | **Addressed** (D2, D3a, §4.1, §9, §12.1). A vault isolation boundary paragraph is added. There is no runtime decrypt path at all: `vault_digits` is dropped, and tests use a test-local helper plus a grep check. Hardening options (i) to (iii) are listed as decisions for Reddy. |
| 6 | MEDIUM | **Addressed** (§1, §10). The iOS on-device full reveal is flagged as a known divergence and a decision for Reddy (retire, or accept as on-device-only), tracked as a `sync-ios` follow-up and not changed here. Expo was searched: the only reveal surfaces are `hooks.ts`, `account.tsx`, `add-member.tsx` and `secureReveal.ts`, all removed (§5.2). |
| 7 | MEDIUM | **Addressed** (§5.2, §13 step 2). The Expo removal is in this change set, and the release is NO-GO without it in the same SHA. The old step 5 is dropped. |
| 8 | MEDIUM | **Addressed** (D10, §4.2, §12.1). One normalized `safe` dict feeds both the record and the response, and a test asserts equality for the five fields. |
| 9 | NIT | **Addressed.** The column is renamed `origin`, so it is exported. `token` is already omitted. |
| 10 | NIT | **Addressed** (§6). The capture and unset come right after the `cognito-local.env` line, and the file wins over the inherited value. |
| 11 | NIT | **Addressed** (§4.5). `_spec(..., security=True)`, not in `CRITICAL_ACTIONS`, and a name-free detail. |
| 12 | NIT | **Addressed** (§4.1). The removed functions, the main.py wrappers and the test lines are named, with a grep and `hasattr` check. |
| 13 | NIT | **Addressed** (D9). `JSONResponse(503, {"error": …})` after the consent checks, before `file.read`, only for `extract-aadhaar`. |
| 14 | NIT | **Addressed** (§4.4). The functions return the number of record rows deleted; vault rows are not counted. |
| 15 | NIT | **Addressed** (§8.4). Stop the local stack before `--execute`, with the zero-count re-run as evidence. |
| 16 | NIT | **Addressed** (§4.4). The unlinked Drive file after an abandoned reading is documented as expected. |
| 17 | NIT | **Addressed** (D11). Documented as a deliberate interpretation that Reddy may overrule, with the alternative stated. |

The review's unverified items are covered by real-Postgres tests in §12.3: the FK re-run idempotence and the release CTE. The Expo mask render at `add-member.tsx:524` is now normalized with `formatAadhaarMask` (§5.2).

## Responses to review findings (revision 4: third review, 0 HIGH / 2 MEDIUM / 6 NIT)

| # | Sev | Finding | Resolution | Sections changed |
|---|---|---|---|---|
| 1 | MEDIUM | The old `cleanup_expired` deletes new durable records during rolling deploys and rollbacks; §13 understated it | **Addressed.** Durable records never match the old predicate's first clause. Typed records are created with `consumed_at=now()` and `expires_at=DURABLE_EXPIRES_AT`. `resolve_record`'s consume step runs `SET consumed_at=now(), expires_at=DURABLE_EXPIRES_AT, updated_at=now()`. `expires_at` keeps its meaning for unconsumed readings only, and the new code's predicates are unaffected. The sentinel is the finite `9999-01-01 00:00:00+00`, not `'infinity'`: psycopg 3 raises `DataError` loading `infinity`, which would break `account.export_data`, and the repo has no custom loader (an export test is added). §1 now quotes the real old predicate and the ECS default rolling update. §13 has a new deploy-overlap paragraph ("no durable record is lost") and the corrected rollback bullet ("unconsumed readings 30 minutes after the read, consumed records one day after consumption; a window over a day loses every record consumed before it"). A real-DB test runs the old statement verbatim and asserts that a typed record and a consumed scan record, both under a day old, survive, with an expired unconsumed control that is deleted. | §1, D1, §4.1, §4.3, §12.1, §12.3, §13 |
| 2 | MEDIUM | Stage-2 card delete checked only `documents.file_ref`; refused/missing outcomes and re-runs were unspecified | **Addressed.** The reference set is derived per run from `information_schema` (public base tables, columns named `file_ref` or ending `_file_ref`) on every connection the run holds. Each lookup uses `psycopg.sql.Identifier` and matches the node id or any of its version ids. Today's seven columns are listed by table. An outcome table defines `missing` (treated as deleted, not blocking), `refused_foreign_owner` and `refused_referenced` (node and bytes untouched, counted; stage 1 still drops the links, so the file stays in the owner's Drive), `deleted`, and delete error (the only outcome that exits non-zero before stage 1). S3 is purged before the hub `DELETE`, so a re-run after a partial failure completes. New tests cover `parcel_photos.file_ref`, `land_expenses.receipt_file_ref`, a new `*_file_ref` column, a table name that needs quoting, a missing node, and the A-deleted/B-failed re-run (run 2 exits 0, run 3 reports zeros). | §8.2 step 0, §8.3, §12.5 |
| 3 | NIT | Sweep backstop age column unspecified | **Addressed.** Records use `r.updated_at < now() - interval '5 minutes'` (set at create, consume and link). Orphan vault rows use `aadhaar_vault.created_at < now() - interval '5 minutes'`. Boundary tests at 4 and 6 minutes. | §4.4, §12.3 |
| 4 | NIT | `ps eww` evidence could print the key | **Addressed.** A count-only `grep -c 'AADHAAR_ENC_KEY='` loop runs over the gateway, assistant and web PIDs taken from `start-local.sh`'s children, expecting `0` each. The API process environment is never inspected. The API key is proven by behaviour: a synthetic scan succeeds and the startup log has no `aadhaar.write_path_missing`. | §12.10 |
| 5 | NIT | `cardName` mapped HEIC/HEIF/WebP to `.bin` | **Addressed.** A fixed table maps `application/pdf`→`pdf`, `image/jpeg`/`image/jpg`→`jpg`, `image/png`→`png`, `image/heic`→`heic`, `image/heif`→`heif` and `image/webp`→`webp`. `bin` is only the last fallback. The reason (gateway `_is_heic`/`_is_imageish` look at the name) is stated. | D4, §5.1 |
| 6 | NIT | `PATH_ALLOW` Aadhaar-context exclusion was ambiguous | **Addressed.** `AADHAAR_CONTEXT = /aadha?ar\|ఆధార్/i`. Entry rule: the guard fails at load if any `PATH_ALLOW` path matches it. Line rule: a hit whose own line matches it is never path-allowed and passes only by rule (a) or (b). Both rules have self-tests. | §12.9 |
| 7 | NIT | `add_beneficiary` accepts a full Aadhaar and discards it | **Addressed.** §11 states that `addBeneficiary` has no client caller and that its typed Aadhaar is masked and discarded, not vaulted or recorded. Wiring it to `resolve_record` is a follow-up if a client adds the flow. §4.3 cross-references this. | §4.3, §11 |
| 8 | NIT | Sync-route 503 text could also be "protected writes are not enabled" | **Addressed by routing through the one sentence.** `_encrypt_bytes`'s no-write-mode raise becomes `_unavailable("encrypt", …, NoWritePath())`, so it logs `cause=NoWritePath` and raises `PROTECTION_FAILED_MESSAGE` ("Aadhaar protection is temporarily unavailable"). That is now the only post-provider text, so the sync route can only return "…temporarily unavailable. Nothing was saved.". §4.6 gets a row for no write mode detected at `vault_put`. §12.2 asserts exact string equality, including a no-write-mode-at-`vault_put` case. The existing `"not enabled"` assertions in `test_aadhaar_security.py` and `test_import_jobs.py` are rewritten, and the D9-affected import-jobs test is restructured. | §4.1, §4.2, §4.6, §12.1, §12.2 |

All revision-3 and revision-2 resolutions still hold. In particular, the sync-route wrapper, the `start-local.sh` placement, the single-connection dev/prod clear, the opt-in card, the retired reveals, the gated prod procedure and the iOS deviation records are unchanged. The review's remaining unverified items (FK re-run idempotence and the release CTE) stay covered by §12.3. The "39 tracked files" count and the compliance-doc line numbers in §7 are still to be re-confirmed by the implementer at edit time.
