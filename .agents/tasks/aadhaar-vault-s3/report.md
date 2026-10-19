# Report: Aadhaar upload fix and Aadhaar vault (local, uncommitted)

Sources: `.agents/tasks/aadhaar-vault-s3/` (design.md rev 4, plan.md, verification.md, impl-review.md APPROVED pass 2, design-review.md, features/FEAT-001..005.json), `.agents/tasks/aadhaar-upload-502/plan.md`, `git status`, `git diff --stat`. Nothing is committed or pushed. No AWS, Terraform, CI, dev or prod action was taken.

## 1. Root cause of the 502 and the fix

- The 502 came from the API worker, not the gateway. The paid provider read succeeded (and was charged). Then `aadhaar.secure_extraction_result` → `_encrypt_bytes` raised `RuntimeError("Aadhaar protected writes are not enabled")`. The job was stored as failed with 502, `import-status` replayed it, and `PersonDialog` showed "Could not read the Aadhaar".
- Why: locally the only write path is Fernet, which needs `AADHAAR_ENC_KEY`. `scripts/start-local.sh` never passed it to the API, although the gitignored `.local/aadhaar-key.env` defines it.
- Regression: commit `14b8246` ("hash-chained audit ledger, KMS Aadhaar fields and the AI reading pipeline", 19/09/2026). From then on, every scan encrypted at read time, so every scan needed a key. Before it, encryption happened only when a member was saved. `validate_configuration()` skips local/test, so nothing warned at startup.
- Fix:
  - `start-local.sh` loads `.local/aadhaar-key.env` into the API process only. The file wins over the shell.
  - With no write path, a scan gets a named 503 (`UNAVAILABLE_MESSAGE`). It is refused at submit time, before any job row, file read or provider call. The worker and the sync route also map protection failures to 503 "Nothing was saved."
  - `PersonDialog` now shows the server's reason.

## 2. What changed

- **Schema (boot DDL, additive):**
  - `aadhaar_candidates` is the Aadhaar record table, one row per read or typed number. New columns: `origin`, `job_id`, `name`, `dob`, `gender`, `address`, `confidence`, `last4`, `vault_token` (FK `ON DELETE SET NULL`), `card_node_id`, `card_version_id`, `updated_at`. `ciphertext` is now nullable (legacy).
  - New `aadhaar_vault (token, owner_user_id, ciphertext, created_at)` holds the only full-number ciphertext: KMS `purpose=aadhaar-vault` in prod, Fernet locally, same flow. Nothing decrypts it at runtime.
  - Durable records carry `expires_at = DURABLE_EXPIRES_AT` (`9999-01-01`), so the old sweep spares them during a deploy overlap.
  - New pointer columns `family_members.aadhaar_record_id` and `users.kyc_aadhaar_record_id`, plus a boot reconcile. One release helper deletes a record only when nothing references it.
- **Card storage:** opt-in only (box unticked by default). It goes through the existing gateway `POST /storage/files`, under key `{node}/{version}`, with SSE-KMS in AWS and metadata in `storage_nodes`/`storage_versions`. The fixed name is `Aadhaar card.<ext>`; the original filename is never sent.
- **Masked last 4:** API, job results and GraphQL return only `XXXX-XXXX-1234`, and the UI renders `XXXX XXXX 1234` with tabular figures and DD/MM/YYYY dates. Web (PersonDialog, Groups, GroupDetail) and Expo use `formatAadhaarMask`.
- **GraphQL:**
  - New `linkAadhaarCard(candidateId, nodeId, versionId)`: owner-scoped, UUID-validated, audited as security action `link_aadhaar_card`.
  - `revealMyAadhaar`/`revealMemberAadhaar` stay in the schema but always return a retirement error. The Expo reveal/copy UI and `secureReveal.ts` are removed.
- **Local clear:** `services/api/scripts/clear_aadhaar.py` is a dry run by default and needs `--environment`. It is guarded by target, prints counts only and is idempotent. Stage 2 deletes a card only after owner and reference checks across every `file_ref`/`*_file_ref`/`photo_ref` column.
- **Guard:** `scripts/aadhaar-digits-tests.ts` fails on non-synthetic 12-digit runs in tracked files. Fixtures were made synthetic.
- **Docs:** the runbook, tester onboarding, compliance, architecture and the parity contract were updated. Every compliance edit is tagged "retention change pending Reddy's compliance review".
- **iOS:** test fixture and doc-comment digits only, plus an inert `Mutations.linkAadhaarCard` in `Queries.swift` (byte-identical to core, no caller). Reddy approved this as option (a). No iOS behaviour changed.

## 3. Files changed (this change only)

- API source: `services/api/src/aadhaar.py`, `services/api/src/main.py`, `services/api/src/ai_reading/jobs.py`, `services/api/src/ai_reading/operations.py`, `services/api/src/ai_reading/prompts.py` (comment), `services/api/src/audit.py`, `services/api/src/account.py`, `services/api/README.md`.
  - `main.py` also carries another session's `sro_offices` ORDER BY edit.
- API scripts/tests:
  - new: `services/api/scripts/clear_aadhaar.py`, `services/api/tests/test_aadhaar_vault_contract.py`, `services/api/tests/test_aadhaar_vault_db.py`, `services/api/tests/test_clear_aadhaar.py`;
  - modified: `services/api/tests/test_aadhaar_security.py`, `test_import_jobs.py`, `test_ai_reading.py`, `test_ai_reading_dedupe.py`, `test_inbox.py`, `test_profile_update.py`, `test_account_data.py`.
- Gateway tests (no source change): new `services/gateway/tests/test_aadhaar_card_storage.py` and `services/gateway/tests/test_extract_aadhaar_passthrough.py`.
- Core: `packages/core/src/api/operations.ts`, `packages/core/src/index.ts`, `packages/core/src/format/audit.ts`, `packages/core/src/format/audit.test.ts`.
- Web: `apps/web/src/pages/families/PersonDialog.tsx`, `apps/web/src/w360/pages/Groups.tsx`, `apps/web/src/pages/families/GroupDetail.tsx`, `apps/web/src/api/client.test.ts`, new `apps/web/src/pages/families/cardName.test.ts`, and `tests/e2e-app/specs/07-record-people.spec.ts`.
- Expo: `apps/mobile/src/data/hooks.ts`, `apps/mobile/src/app/account.tsx`, `apps/mobile/src/app/add-member.tsx`. Deleted: `apps/mobile/src/lib/secureReveal.ts`.
- iOS: `apps/ios/PattadarKit/Sources/PattadarKit/Networking/Queries.swift`, `apps/ios/PattadarKit/Sources/PattadarKit/Format/DocSpine.swift` (comment), `apps/ios/PattadarKit/Tests/PattadarKitTests/DocSpineTests.swift`.
- Scripts: `scripts/start-local.sh`, new `scripts/aadhaar-digits-tests.ts`.
- Docs: `docs/runbooks/aadhaar-kms-rollout.md`, `docs/qa/tester-onboarding.md`, `docs/compliance/gdpr-dpdp.md`, `docs/compliance/engineering-checklist.md`, `docs/architecture.md`, `docs/architecture/ai-system.md`, `docs/architecture/ai-inventory.yaml`, `docs/specs/2026-08-22-web-ios-parity-contract.md`.
- Task artifacts: `.agents/tasks/aadhaar-vault-s3/` and `.agents/tasks/aadhaar-upload-502/`.
- Excluded: other sessions' dirty files, including `packages/core/src/land/landcalc.ts`, `.local/impl-scratch`, the heuristic-ux-audit skill, the Fence/Dashboard/Tools/VillageMaps/CombinedProperty/Vault/w360.css work, specs 02/17/19/28, `test_sro_offices_order.py`, the DynamoDB docs and `semantic-review/`.

## 4. Checks and results (final verification, 03/10/2026)

- `bun run typecheck`: 5 of 5 workspaces exit 0.
- `bun test packages/core apps/web/src apps/mobile/tests`: 293 pass. With `apps/university/src` added (iteration 1): 321 pass.
- API pytest, full suite run 5 times: 2 runs passed 624/624. 3 runs passed 623, each with one failure in `test_audit.py::test_enqueue_then_worker_drains_to_read_model`.
  - This is a known shared-DB flake. The test passes in isolation, and other clients were on the `pattadar` DB.
  - The change adds only one `_spec` line to `audit.py` and does not touch `test_audit.py`.
- API Aadhaar suites (10 files): 170 passed, 0 skipped.
- Gateway pytest: 182 passed.
- `scripts/*-tests.ts` (18 guards, including `aadhaar-digits-tests.ts`): 17 exit 0. `typography-tests.ts` fails only on TY-5 at `apps/university/src/styles.css` (font-weight 800), which was already failing before this change.
- `icon-guard`, `ux-guards`, `emit-vectors --check` and the ai-boundary guard (self-test and run) all pass.
- `parity-check.ts`: exit 1 with one error, `[twins] landcalc.ts`. That file is another session's edit, so CI stays red until that session lands its Swift twin.
- `swift test --filter 'DocSpineTests|VectorTests'`: 37 passed. Playwright spec 07 (Aadhaar): 7 passed.
- `bash -n scripts/start-local.sh`: exit 0. shellcheck is not installed, so it was not run.
- Live local stack (FEAT-005), all against synthetic data with 3 paid reads and no retries:
  - With no key file, scans get the named 503, not 502, and the provider is never called.
  - The key reached the API only. Every other process showed a count of 0.
  - The full CRUD flow and its failure paths work. The ticked card was saved as `Aadhaar card.pdf` and linked.
  - No 12-digit run appeared in logs, DB text columns or responses.
- Local clear: run with `--cards-linked-first --execute`. The final dry run and an idempotent second `--execute` both reported all zeros.
- Secret scan (gitleaks 8.30.0, redacted) over unstaged and untracked changes: no leaks, and nothing is staged.

## 5. Not verified

- Real AWS KMS or S3 SSE-KMS behaviour (only fake KMS/S3 and local MinIO were exercised); CI; dev and prod; a secret scan of git history; Maestro and device runs.
- The PersonDialog browser click-through on the live stack. The same calls were made directly, and sealed spec 07 covers the UI.

## 6. Reddy decisions recorded

- Store the card in S3 like other files (SSE, metadata in Postgres); show only the last 4 digits; store all extracted data in the Aadhaar table; data security later.
- (A) full number in an encrypted vault; (B) same model in production; (C) clear existing data, since the product is still incubating.
- He stopped his own local stack for the live run ("done, i killed all"), and chose option (a), the inert `Queries.swift` twin.
- Still open: D4 card opt-in default (opt-in implemented); D11 (a read with no 12 digits stores no record); D3a vault hardening (IAM Deny, dedicated DB role, or dedicated CMK); the S3 permission route for card deletion (§9); a git-history purge of old fixture values; erasing the 5 synthetic local accounts `feat005-a..e`; removing the now-unused `expo-local-authentication`.

## 7. AWAITING REDDY APPROVAL: production rollout and clear (design §13, §8.5; not to be run by agents)

**Rollout order:** (1) `secret-scan`, commit only when Reddy asks. (2) One SHA through `tested-release`/`release-readiness`, Reddy approving it; it must carry API, web, core and the Expo reveal removal together (NO-GO without Expo). (3) Production clear below, under its own approval. (4) A later release drops the legacy columns (`aadhaar_enc`, `kyc_ref_enc`, `aadhaar_candidates.ciphertext`) once the clear has evidence.

**Migration and rollback:** additive boot DDL under the advisory lock; an ECS rolling-deploy overlap loses no durable record. Rollback is schema-safe but loses data if the window exceeds a day (the old sweep deletes consumed records after one day). Roll-forward reconciles dangling pointers; any rollback window requires re-running the clear before the legacy columns are dropped.

**Prod clear:**

- **Scope:** the prod API DB, for all owners: every `aadhaar_candidates` and `aadhaar_vault` row, every `document_read_jobs` row with `operation='extract-aadhaar'`, and blanking of the Aadhaar columns on `users`, `family_members` and `beneficiaries`. Card cleanup (stage 2) is a separate, optional step.
- **Preconditions:** the vault-schema release is deployed and healthy; a fresh RDS snapshot is taken and its id recorded; the bucket versioning state is noted; a writer-control window is open (API, gateway and workers drained).
- **Command:** an ECS one-off task on the current API task definition, in the API subnets and security group, with `PG_*` from Secrets Manager and `APP_ENV=prod`. Override only `command` (and the non-secret `STORAGE_BUCKET`). Never put credentials in overrides.
  ```sh
  aws ecs run-task --cluster <prod-cluster> --task-definition <prod-api-taskdef:rev> --launch-type FARGATE \
    --network-configuration '<api service awsvpc config>' \
    --overrides '{"containerOverrides":[{"name":"api","command":["python","scripts/clear_aadhaar.py",
      "--environment","prod","--allow-remote","--approval-ref","<ticket>"]}]}'
  ```
  Steps: (1) dry run, review counts. (2) If `linked=0`, re-run with `--execute --writers-drained` (stage 1 only). (3) If `linked>0`, stop and return to Reddy: `--cards-linked-first` plus an S3 permission route, or `--abandon-linked-cards`. (4) Re-run, expect all zeros. Heuristic card cleanup is not available in prod.
- **Side effects:** every stored mask and ciphertext is gone, so users must re-enter or re-scan. Pending readings fail with "read the card again". Audit history is untouched.
- **Irreversible** in the live DB, and in S3 once versions are deleted. Rollback is RDS snapshot restore only (`safe-data-migration`, `rds-restore-drill.md`). The data stays in automated backups until their retention expires.
- **Evidence:** dry-run, execute and zero re-run counts, the snapshot id, the task ARN suffix and the SHA, all redacted.
- **Approval needed:** the SHA, the environment, the snapshot id, the writer window, and stage 1 alone or the `linked>0` option. A fresh confirmation is required immediately before `--execute`. Dev gets the same procedure with its own approval.

## Left for Reddy to review

- **4 local Drive files:** 4 pre-existing files in local My Drive matched the clear's name heuristic ("aadhaar"-like names). They are not linked to any record. One is still referenced by another row, and the verification-only dry run refused it. They were not deleted and are left in place for a human look. Ids and names are deliberately not listed here. To delete them after review: run `clear_aadhaar.py --environment local --card-nodes <reviewed file> --execute`.
- **iOS follow-ups (`sync-ios`, Reddy decisions):** move iOS from the synchronous `extract-aadhaar` route to `-async` with status polls (a pre-existing invariant deviation); retire or accept the on-device full reveal (`DocSpine.firstIdentityNumber`, `AllDetailsScreen`, `DocumentViewer`); optional card opt-in using `linkAadhaarCard`; a `link_aadhaar_card` label in `Display.swift`.
- **Expo follow-ups:** optional card opt-in with `linkAadhaarCard` and the safe filename; removing the unused `expo-local-authentication` (`dependency-change`).
