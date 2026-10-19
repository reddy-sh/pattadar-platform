# Follow-up brief: Documents Trash, Undo and share links (approved by Reddy, 03/10/2026)

Reddy said "yes please" to these recommendations from the Documents audit:
/Users/reddy.sh/reddy.sh/projects/pattadar-platform/.local/ux-audits/2026-10-03-documents-drive/board.html
and acceptance.md in the same folder.

Start only after the build run `aadhaar-missing-from-documents` (wf_b487714e4812da95) has finished. It edits Vault.tsx, w360.css and services/api in the same tree. Read its final report and review first, and build on its result.

## Approved
1. **Trash and Undo for documents rows.**
   - Today `deletePaper` hard-deletes the documents row, its links and its shares (services/api web360.py about 11284-11346).
   - Make delete a soft delete into a Documents Trash, with a restore mutation and permanent delete from Trash.
   - Show an Undo toast right after a delete (single or bulk), and add a Trash view reachable from My files, e.g. a "Trash" crumb or folder entry.
   - Restore puts the file back in its folder, or in the feature folder if that folder is gone.
   - Decide and state what happens to links and shares on delete: shares must stop working while the file is in Trash. The live share-token routes must not serve trashed files.
   - Reuse the gateway's existing node trash and restore (services/gateway/src/storage.py about 840-860, routes/storage.py about 836-860) for the bytes.
2. **Delete moves the stored bytes to Trash too.**
   - Verify the current behaviour, which looks like the row is removed while the object stays.
   - Make document delete trash the storage node through the gateway, so nothing is orphaned, especially an Aadhaar card image.
   - Permanent delete from Trash removes the bytes through the existing gateway path.
   - State the retention rule (auto-purge after N days only if a mechanism already exists; otherwise report it as a decision rather than inventing one).
   - Reconcile with FM-010 in docs/specs/2026-09-19-family-household-management-functional-design.md.
3. **One count:** already approved in the filter decisions. Confirm it shipped.
4. **Share links move to Share activity.**
   - Remove the "Active share links · N" block from the Documents list (it sits below the list on every level).
   - Make sure the existing Share activity page lists active links with revoke.
   - Keep a link from Documents to Share activity (the existing "Share activity ›" link).
5. **PDF first-page thumbnails are deferred** (Reddy accepted "leave it for later"). Do not build them; list them as a follow-up.

## Governance
- The schema change (soft-delete column or table) and the GraphQL contract change go through backend-contract-change and security-review.
- Write the migration in the repo's normal migration mechanism and test it on disposable or sealed databases only.
- Applying it to any shared, staging or production database is a separate Reddy approval under safe-data-migration and release-readiness. Never apply it to a real environment here.
- Invariants: keys stay `{node}/{version}`, authorization stays in SQL (trashed rows are excluded from every list, search, assistant context and share route), Aadhaar stays masked, and identity is issuer and subject.
- Never touch real data. Do not commit or push.

## Verification
- typecheck, every scripts/*-tests.ts guard, and the services/api and services/gateway pytest suites (the .local venvs)
- the relevant sealed tests/e2e-app specs
- functional-acceptance end to end:
  - delete a single file, then Undo
  - bulk delete, then Undo
  - delete, open Trash, restore
  - permanent delete from Trash
  - delete an Aadhaar card: the member link is cleared and the bytes are trashed
  - a share link to a trashed file is refused
  - failure paths for delete, restore and purge
  - Share activity lists and revokes links
- sealed BEFORE | AFTER captures at 1512 and 390, saved to `.local/ux-audits/2026-10-03-documents-drive/after/`
- a semantic review step last in the implement/review loop
