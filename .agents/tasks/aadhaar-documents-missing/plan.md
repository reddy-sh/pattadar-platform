# Implementation Plan: file Aadhaar cards in Documents under person › Aadhaar, Folder column, DD/MM/YYYY subtitle

Read `findings.md` (same folder) first. Workspace: `/Users/reddy.sh/reddy.sh/projects/pattadar-platform` (use absolute paths). The tree has unrelated uncommitted user work: never revert or stage it. Do not commit unless the workflow step says so. Never run anything against real data, AWS, or live servers.

Invariants that every item must keep:
- Keys stay `{node}/{version}`. Placement is a `documents.folder_id` pointer only.
- Every query is scoped by `owner_user_id` from the gateway identity.
- The API never reads hub `storage_*` tables.
- Aadhaar digits never appear in logs, errors, names or subtitles. Only the server mask is shown.
- No new dependency.
- One font and shared components (`apps/web/src/w360/ui.tsx`, `apps/web/src/components/`).
- Dates are DD/MM/YYYY.

Decisions:
- **D1. A person folder is a `vault_folders` row with system linkage.** Add `person_id TEXT NOT NULL DEFAULT ''` and `feature_key TEXT NOT NULL DEFAULT ''`, plus a unique partial index `(owner_user_id, person_id, feature_key) WHERE person_id<>''`. Person root has `feature_key=''`; the Aadhaar child has `feature_key='aadhaar'`. This reuses the existing New-folder, rename, move and delete machinery and needs no new tree. For the account owner, `person_id` is the user id; for a member, it is `family_members.id`.
- **D2. The card is filed server-side when it becomes a person's card.** This happens in the member upsert and `apply_my_kyc` once `aadhaar_record_id` is set, and in `link_aadhaar_card` if the record is already referenced. One idempotent helper is used, so a client cannot misfile it and it is atomic with the member write.
- **D3. `link_aadhaar_card` takes optional `mime_type`/`size_bytes`, stored on the candidate.** The preview needs a MIME type (`PaperPreview.tsx:147`). The core `LINK_AADHAAR_CARD_MUTATION` and its inert Swift twin stay byte-identical. The web sends the new optional variables through a web-local mutation string, which matches the w360 pattern of local query strings. Old callers keep working.
- **D4. `documents.aadhaar_record_id`** ties a row to its record, so `_release` removes the row exactly when the record goes. A record shared by two subjects is kept.
- **D5. Folder column label.** It shows the folder's name if that name is unique among the owner's folders (case-insensitive), otherwise `Parent › Name` (for example `Ravi › Aadhaar`). This is the shortest unambiguous label.
  - No folder, but linked to properties: show the property title(s) linking to the record. This keeps today's information until property folders exist (a follow-up).
  - Neither: show `My files`, the existing root label, which navigates to the root.
  - The column shows in flat views (top level, search, filters). Inside a folder it is hidden, because the breadcrumb already gives the location.

---

- [ ] 1. API schema and folder helper.
      - Add idempotent DDL to the `web360.py` schema list (next to `vault_folders`, `web360.py:556-574`):
        - `ALTER TABLE vault_folders ADD COLUMN IF NOT EXISTS person_id TEXT NOT NULL DEFAULT ''`
        - same for `feature_key`
        - `CREATE UNIQUE INDEX IF NOT EXISTS uq_vault_folders_person ON vault_folders (owner_user_id, person_id, feature_key) WHERE person_id<>''`
        - `ALTER TABLE documents ADD COLUMN IF NOT EXISTS aadhaar_record_id TEXT NOT NULL DEFAULT ''` plus a partial index on it
      - In `aadhaar.py` `ensure_schema`, add `card_mime TEXT NOT NULL DEFAULT ''` and `card_size BIGINT NOT NULL DEFAULT 0` to `aadhaar_candidates`.
      - Add `async def ensure_person_folder(conn, uid, person_id, person_name, feature_key='')` in `web360.py`, beside `_free_folder_name` (`:8659`):
        - Find-or-create the root (`parent_id=''`, `feature_key=''`), named the person's name with fallback `You`, made unique with `_free_folder_name`.
        - Then, for `feature_key='aadhaar'`, find-or-create the child named `Aadhaar`.
        - Use `INSERT … ON CONFLICT DO NOTHING` and re-select, so it is race-safe.
        - Return the folder id.
      - Expose `person_id` as `personId` on the `VaultFolder` GraphQL type and in the `vault_folders` resolver (additive).
      Files: services/api/src/web360.py, services/api/src/aadhaar.py
      Verify: `cd services/api && python -m pytest tests/test_vault_folders.py tests/test_aadhaar_vault_db.py -q` passes. Add tests in `tests/test_vault_folders.py`:
      - the helper is idempotent (two calls give one root and one Aadhaar child)
      - it is owner-scoped
      - two people with the same name get `Ravi` and `Ravi (2)`
      - the boot DDL runs twice cleanly

      DB tests skip without `TEST_PG_DSN`. Run them with a throwaway local Postgres if one is available, and say so if not.

- [ ] 2. File the card as a Documents row (depends on 1).
      - Add `async def file_aadhaar_card(conn, uid, record_id, person_id, person_name)` to `web360.py` and import it in `main.py`. It does the following:
        - Read the candidate `card_node_id`, `card_version_id`, `card_mime`, `card_size` and `last4`, scoped by `owner_user_id`.
        - Return early if `card_node_id=''`.
        - Return early if a `documents` row with `owner_user_id=uid AND aadhaar_record_id=record_id` exists. In that case, only make sure its `folder_id` is this person's Aadhaar folder.
        - Otherwise insert, using the column set from `add_paper` (`web360.py:9923-9931`):
          - `name='Aadhaar card'`, `subtitle=aadhaar_security.mask(last4)` (server mask only)
          - `shelf='identity'`, `doc_type='identity'`, `source='aadhaar-card'`
          - `file_ref=card_node_id`, `mime_type=card_mime`, `size_bytes=card_size`
          - `record_id=''`, `folder_id=<Aadhaar folder>`, `aadhaar_record_id=record_id`
        - Write no audit text containing digits.
      - Call it in these places:
        - `_upsert_member` (`main.py:~2602`), after the row write, when `cols` carries `aadhaar_record_id`. Use person = the member id and name.
        - `apply_my_kyc` (`main.py:3449-3500`), after the record is set. Use person = uid and the user's name.
        - `link_aadhaar_card` (`main.py:3557`), after the update. Look up `family_members`/`users` where `aadhaar_record_id`/`kyc_aadhaar_record_id = candidate_id` (owner-scoped) and file for each subject.
      - `link_aadhaar_card` gains optional `mime_type: str = ""` and `size_bytes: int = 0` (validated: MIME at most 100 chars matching `^[\w.+-]+/[\w.+-]+$`, size clamped to ≥0), stored in `card_mime`/`card_size`.
      Files: services/api/src/main.py, services/api/src/web360.py
      Verify: `python -m pytest tests/test_aadhaar_vault_db.py tests/test_aadhaar_vault_contract.py tests/test_vault_folders.py -q` passes. Add DB tests:
      - scan → link → addMember gives one identity row in `<member> › Aadhaar`, with the mask-only subtitle
      - link after addMember also files it
      - a second save does not duplicate it
      - another owner cannot see or file into it
      - an old caller without `mimeType` still succeeds

- [ ] 3. Delete and replace semantics, plus exposure guards (depends on 2).
      - In `aadhaar.py` `_release` (`:368-377`), extend the CTE to delete `documents` rows `WHERE owner_user_id=%s AND aadhaar_record_id IN (gone.id)`. This covers member delete, Aadhaar replace and clear-KYC.
      - In `remove_member` (`main.py:4681`), after release, delete the member's person folders (`person_id=id`), Aadhaar child first, then root. Reuse the lift-children logic of `delete_vault_folder` (`web360.py:10796-10825`), factored into a shared helper, so no other file is lost.
      - Guards (restriction only):
        - `link_papers` (`web360.py:9942`) returns False if any selected row has `aadhaar_record_id<>''`.
        - `capabilities.snapshot` (`capabilities.py:80-87`) adds `AND aadhaar_record_id=''` for `documents`.
      - Grep `services/assistant/src` and `services/api/src` for any read of `documents` rows into assistant or model context. If one exists, exclude `aadhaar_record_id<>''`. If an exposure cannot be excluded simply, stop and send a warning.
      Files: services/api/src/aadhaar.py, services/api/src/main.py, services/api/src/web360.py, services/api/src/capabilities.py
      Verify: the pytest set above, plus `tests/test_aadhaar_security.py` and any capabilities/share-link tests (`ls services/api/tests | grep -i share`), pass. New tests:
      - remove_member removes the row and the folders, and keeps a record shared with self
      - re-add files into a fresh folder
      - link_papers refuses an Aadhaar row
      - a share snapshot never includes it

- [ ] 4. Web: card upload fixes in PersonDialog (depends on 2).
      - In `apps/web/src/pages/families/PersonDialog.tsx`:
        - Move the "Also keep the original card…" checkbox (`:428`) above the "Upload & extract Aadhaar" button (`:408`), so the choice is made before the scan.
        - Send `mimeType: file.type` and `sizeBytes: file.size` through a web-local mutation string (with optional `$mimeType:String,$sizeBytes:Int`) instead of the core constant.
        - Change the success and warning copy from "My Drive" to "Documents › <name> › Aadhaar" ("saved to Documents" for the add flow, where the name may not be final).
        - If the link fails after a successful upload, trash the stored node with the existing `trashDocuments` (`apps/web/src/data/pattadarActions.ts:56`), so no unpointed card stays.
      - Leave `packages/core` `LINK_AADHAAR_CARD_MUTATION` and `Queries.swift` unchanged.
      Files: apps/web/src/pages/families/PersonDialog.tsx, apps/web/src/pages/families/cardName.test.ts (extend if a pure helper is added)
      Verify: `cd apps/web && bun test src/pages/families && bun run typecheck` passes.

- [ ] 5. Web: trash card bytes on member delete (depends on 1 and 3).
      - In the Groups remove flow (`apps/web/src/w360/pages/Groups.tsx:577` `useRemoveMember`, `apps/web/src/w360/groupsData.ts:319`):
        - Before calling `removeMember`, collect the member's Aadhaar papers. These are papers from `useVaultPapers('identity')` whose `folderId` is in the folders with `personId===m.id`, using `useVaultFolders` and `personId` from item 1.
        - After `removeMember` succeeds, call `trashDocuments(papers, { keepRows: true })`. The API already removed the rows; trash goes to Drive Trash and is recoverable.
        - Invalidate the vault queries.
      - Add `personId` to `VaultFolder` and `Q_VAULT_FOLDERS` in `apps/web/src/w360/api.ts:124,1032`.
      Files: apps/web/src/w360/pages/Groups.tsx, apps/web/src/w360/groupsData.ts, apps/web/src/w360/api.ts
      Verify: `cd apps/web && bun test src/w360 && bun run typecheck` passes. Add a pure helper `aadhaarPapersOf(memberId, folders, papers)` in `groupsData.ts`, with tests in `src/w360/groupsView.test.ts` or a new `groupsData.test.ts`.

- [ ] 6. Web: replace the "Linked to" column with a Folder column, and audit the folder browser (independent of 2-5, needs `personId` from 5 only for labels).
      - In `apps/web/src/w360/pages/Vault.tsx`:
        - Replace the `Linked to` header (`:1197`), the cells (`:1240-1244`) and the grid tile links (`:1292`) with `folderCellOf(paper)`, following D5. Clicking navigates through `folderHref` (`:703`) for folder and root labels, or the existing record link for property titles.
        - Hide the column inside a folder unless search or filters are active.
        - Keep the `Linked to a property` / `Not linked` facet (`:787`) and the search over `linkedPropertiesFor` (`:804`).
        - Keep the `Linked to …` dialog (`:370`) where it is reached from the row menu.
      - Put the pure label logic `folderLabel(paper, folderById, linked)` in `apps/web/src/w360/pages/VaultFolders.tsx`, with tests.
      - Audit the folder browser against Reddy's checklist and fix only gaps the existing backend supports:
        - folders before files at every level, in List and Grid
        - click selects; double-click or Enter opens
        - `Crumbs` (`:1064`) as a nav landmark with every segment linked
        - `?folder=` deep links
        - the empty state (`:1168`) carries the upload action
        - phone widths work
      - Folder create, rename, move, delete and move-papers already exist (`web360.py:10721-10840`). List anything missing as a follow-up in findings.md; add no new contract.
      Files: apps/web/src/w360/pages/Vault.tsx, apps/web/src/w360/pages/VaultFolders.tsx, related CSS if present, a new `apps/web/src/w360/pages/vaultFolderLabel.test.ts`
      Verify: `cd apps/web && bun test src/w360 && bun run typecheck`, then every `scripts/*-tests.ts` guard (`for f in scripts/*-tests.ts; do bun "$f" || exit 1; done`) plus `bun scripts/ux-guards.ts` and `bun scripts/icon-guard.ts`. All pass.

- [ ] 7. DD/MM/YYYY in the deed subtitle.
      - In `apps/web/src/w360/paperFiling.ts:60`, format the date with `parseISOToDisplay` from `@pattadar/core`.
      - Add an exported `displayDetail(detail)` that rewrites a leading or embedded `Registered YYYY-MM-DD` to DD/MM/YYYY for rows already stored. Use it where `Vault.tsx` renders `paper.detail` (`:415`, `:610`, and the search haystack `:804` stays raw) and anywhere else a paper's `detail` is shown (grep `\.detail` in `apps/web/src/w360`).
      Files: apps/web/src/w360/paperFiling.ts, apps/web/src/w360/pages/Vault.tsx, a new apps/web/src/w360/paperFiling.test.ts
      Verify: `cd apps/web && bun test src/w360/paperFiling.test.ts` passes. Cover ISO → DD/MM/YYYY, already-DD/MM passes through, and no date leaves it unchanged. Then `bun run typecheck`.

- [ ] 8. Gated backfill script (write and test only; NEVER run on real data).
      - Write `services/api/scripts/backfill_aadhaar_documents.py`. It is dry-run by default and prints counts only, never ids or digits. `--execute` requires `--approval-ref` and the same environment refusals as `scripts/clear_aadhaar.py` (read its argument and DSN handling and mirror it).
      - For each candidate with `card_node_id<>''` that a member or user references, call `file_aadhaar_card`.
      - Test it on a throwaway schema in `services/api/tests/test_backfill_aadhaar_documents.py`.
      - Add a runbook line to `services/api/README.md` beside `clear_aadhaar.py`, marked "requires Reddy's approval under safe-data-migration".
      Files: services/api/scripts/backfill_aadhaar_documents.py, services/api/tests/test_backfill_aadhaar_documents.py, services/api/README.md
      Verify: `python -m pytest tests/test_backfill_aadhaar_documents.py -q` passes (it skips without `TEST_PG_DSN`; report that if so).

- [ ] 9. Docs and governance.
      - Update the parts of `design.md` that describe the Documents list ("Linked to") so they describe the Folder column and the per-person tree.
      - Update the family-household functional spec under `docs/specs/` (grep `Aadhaar card`, `My Drive`) so a kept card is filed under person › Aadhaar.
      - In `.agents/tasks/aadhaar-vault-s3/design.md`, leave historical text and add no rewrite.
      - Update `docs/specs/2026-08-22-web-ios-parity-contract.md` with a "web-only; iOS follow-up via sync-ios" note.
      - Run the `secret-scan` skill over the diff, and a `security-review` pass over items 1-5.
      Files: design.md, docs/specs/* (family-household spec, parity contract)
      Verify: `bun run typecheck` at the root and the full `scripts/*-tests.ts` guard loop pass. Any `docs` link checker under `scripts/` (grep `docs-links` or `runbook`) passes.
