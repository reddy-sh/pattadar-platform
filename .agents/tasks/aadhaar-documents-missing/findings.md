# Aadhaar card missing from Documents: findings

Static investigation only. I read code, docs and the sealed task folders. I touched no live data, DB rows, S3/MinIO objects or servers. Line numbers are from the working tree on 03/10/2026. Some files have uncommitted edits, so numbers can drift by a few lines.

## Short answer

The card is never filed as a Documents entry. When "keep the card" is ticked, the bytes go to the gateway's Drive store and a pointer goes on the Aadhaar record. No `documents` row is written, and W360 Documents lists only `documents` rows. The UI then says "card saved to My Drive", but W360 has no My Drive screen. To the owner, the file is effectively lost. Deleting the member orphans the card bytes. Re-adding the member works, but it repeats the same invisible result.

Reddy's direction (03/10/2026, recorded as invariant 8 in `.kiro/steering/pattadar-standards.md:50`) approves filing every upload, Aadhaar included, under person → feature → … in Documents. That makes this **CASE A**.

## Q1. Where the file is stored, and whether a Documents entry is created

- `apps/web/src/pages/families/PersonDialog.tsx:219` `handleAadhaar`:
  1. `POST /api/gateway/pattadar/extract-aadhaar` reads the card. The number comes back masked, plus `aadhaarCandidateId`.
  2. Only if `retainAadhaarCard` is ticked **and** a candidate exists, it uploads `Aadhaar card.<ext>` to `POST /api/gateway/storage/files?appId=pattadar&onConflict=duplicate`.
  3. It then calls `LINK_AADHAAR_CARD_MUTATION` with `candidateId`, `nodeId` and `versionId`.
- Storage: gateway `StorageService.create_file` writes `storage_nodes`/`storage_versions`, key `{node}/{version}`, SSE-KMS on the documents CMK (`services/gateway/tests/test_aadhaar_card_storage.py:1-104`, "stored like every other Drive file"). The full number lives separately, as ciphertext in `aadhaar_vault`. The card bytes are not in the vault.
- Link: `services/api/src/main.py:3557-3578` `link_aadhaar_card` only runs `UPDATE aadhaar_candidates SET card_node_id, card_version_id` (columns at `services/api/src/aadhaar.py:83-85`). It writes no `documents` row.
- The member points at the record through `family_members.aadhaar_record_id` (`aadhaar.py:96`), set in the member upsert (`main.py:~2523-2560`).
- Design source: `.agents/tasks/aadhaar-vault-s3/design.md` §D4/D5 (lines ~104-124). It describes the card as a My Drive file plus a pointer. It never mentions Documents, so leaving it out of Documents was an omission, not a privacy rule.

**Answer:** The bytes are a Drive storage node/version, and the number is in the separate vault. **No Documents entry is created.**

## Q2. Does Documents list Aadhaar files, and is leaving them out deliberate?

- W360 Documents is `/app/papers` → `apps/web/src/w360/pages/Vault.tsx`. The legacy `/app/documents` redirects there (`apps/web/src/routes.tsx:450`).
- It reads `useVaultPapers('all')` and `useVaultFolders()` (`Vault.tsx:644-645`). Both are served from the API's `documents` and `vault_folders` tables (`services/api/src/web360.py:6661-6727`, `:6730-6750`). Drive `storage_nodes` are never listed, so a card kept only in Drive cannot appear.
- An "Identity" type already exists: `Vault.tsx:42-47` and `Shelf.tsx:29` (`identity: 'Masked until you unlock'`). So identity papers in Documents were already part of the design vocabulary.
- I found no spec or comment saying Aadhaar must be kept out of Documents. The privacy rules that do exist cover other things:
  - **Sharing:** `governance.py:396` lists Aadhaar as "neverByDefault" for shares.
  - **Masked numbers:** `security-review` SKILL.
  - **Export:** `account.py:149-155` omits ciphertext and vault tokens.

  None of these forbids an owner-only listing.

**Answer:** No, Documents does not list them, and that is a gap, not a deliberate rule. Reddy's direction now explicitly requires the listing.

## Q3. Member delete and re-add

- `main.py:4681-4705` `remove_member` deletes the `family_members` row, then calls `aadhaar_security.release_unreferenced`.
- `aadhaar.py:368-377` `_release` deletes the now-unreferenced consumed `aadhaar_candidates` row and its `aadhaar_vault` row.
- **The card's Drive node is not touched.** After the candidate row is deleted, nothing points at the card bytes. They are orphaned in the documents bucket (owner-scoped, still encrypted, invisible in W360, and never trashed).
- Re-add with a new scan:
  - A fresh candidate is created. Candidates are one-use (`test_ai_reading_dedupe.py:187`).
  - The upload uses `onConflict=duplicate`, which names the file `Aadhaar card (2).pdf` (`test_aadhaar_card_storage.py:96-104`).
  - No uniqueness constraint or stale vault reference blocks the re-add.

  So the re-add works mechanically, but the result is just as invisible, and every delete/re-add leaves one more orphaned card.
- Folders: there are no per-person folders today. `vault_folders` are owner-made only (`web360.py:556-574`), so a member delete has no folder to clean up.

## Q4. Silent failure and the 502

1. **Checkbox read at scan time, placed after the button.** The opt-in checkbox (`PersonDialog.tsx:428`) sits below "Upload & extract Aadhaar" (`:408`) and defaults to off (`:136`). `handleAadhaar` reads `retainAadhaarCard` when the scan starts. If you upload first and tick second, the card is not kept, and the only sign is the success toast "…the card was not retained". **This is the most likely reason Reddy's file "is missing": either it was never kept, or it is in Drive with no Documents row.**
2. **The success message promises a place you cannot open.** On success the toast says "card saved to My Drive" (`PersonDialog.tsx:~280`). W360 has no My Drive view, so this reads as success while the file is unreachable.
3. **A failed link is reported, but the bytes stay.** If the link fails, a warning appears ("saved to My Drive but could not be linked"), but the stored node is not cleaned up.
4. **The 502 has not come back in code.** `.agents/tasks/aadhaar-upload-502/plan.md` found the cause: no `AADHAAR_ENC_KEY` locally. `aadhaar-vault-s3` then made protection fail as a named 503 before the paid call, and the gateway passes that 503 through (`services/gateway/tests/test_extract_aadhaar_passthrough.py:15-49`). I did not check this against the live environment.

## Upload-path inventory (invariant 8)

The gateway's `POST /storage/files` (`services/gateway/src/routes/storage.py:698`) and `upload-intent`/`upload-complete` (`:743`, `:770`) are the only byte writes. The API's `extract-*`/`import-*` endpoints only read. The gateway's `POST /folders` (`:668`) makes Drive folders, which Documents does not show. Documents folders are the API's `vault_folders`.

| # | Path (file:line) | Documents row today? | Where it lands today |
|---|---|---|---|
| 1 | Member Aadhaar card, `pages/families/PersonDialog.tsx:~255-271` | **No** (Drive node + candidate pointer) | Invisible |
| 2 | Documents upload, `pages/documents/upload.ts:65-71` → `storage.ts:249` `createDocumentRow` | Yes (`createDocument`) | Top level, or the target record |
| 3 | Record papers, `w360/pages/RecordPapers.tsx:164,198` → `addPaper` | Yes (accepts `folderId`) | Current folder or top level, linked to the record |
| 4 | Deed/passbook scan, `w360/pages/PropertyActions.tsx:577,599,689` → `addPaper` | Yes | Top level, linked to the record |
| 5 | Request work, `w360/pages/RequestWork.tsx:171-178` → `addPaper` (shelf unsorted) | Yes | Top level, linked to the record |
| 6 | FMB sheet, `w360/fmbUpload.ts:126,141` → `onPaper` (best effort; a failure is swallowed at `:142`) | Usually | Top level; if filing fails, the bytes stay with no row |
| 7 | Joint FMB, `w360/pages/HoldingActions.tsx:522-536` | Yes | Top level, linked to several records |
| 8 | Record photos/video, `w360/filePhotos.ts:128,140` → `addPhoto` | **No** (photo tables; Documents shows only unfiled photo files, `web360.py:6693-6700`) | Record gallery only |
| 9 | Ticket deliverable, `w360/pages/Ticket.tsx:1033-1045` → `addDeliverable` | **No** (filed only if reviewed with `fileAs`) | Ticket only |
| 10 | Owner photo, `w360/pages/RecordPeople.tsx:117-119` | **No** (node id on the owner record) | Invisible |
| 11 | Feature cost receipt, `w360/pages/RecordFeatures.tsx:301,319` | **No** (`receiptFileRef` on the feature) | Feature only |
| 12 | Legacy deed import, `pages/documents/DeedImportDialog.tsx:108,166` (fire-and-forget mirror; `createRegisteredDocument(fileRef:'')`) | **No** | Orphaned bytes |
| 13 | Legacy mirror, `data/pattadarActions.ts:27-41` `mirrorToDrive` (passbook create) | **No** | Orphaned/Drive only |
| — | Member avatar, `cropSquareDataUrl` → `family_members.photo` data URL | n/a (no storage write) | — |

**Choice:** This run fixes path 1 fully. It also adds the one shared server helper `ensure_person_feature_folder` that later paths will reuse. Paths 6 and 8-13 are an ordered follow-up (below), not part of this run. Each needs its own person/feature attribution and its own backfill, and some (ticket deliverables, receipts, owner photos) change what appears in Documents for content that today is scoped to a ticket or feature. Paths 2-5 and 7 already create rows; only their folder placement is a follow-up.

## Standard per-person tree (built from names already in the code)

```
My files                      ← existing root crumb label (Vault.tsx:1065)
└─ <Person name>              ← one per person: the account owner and each family member
   └─ Aadhaar                 ← identity/KYC location; "Aadhaar card" name from PersonDialog.cardName, Type = Identity shelf
   (follow-up, same for every person:)
   ├─ Passbooks › <passbook>            ← AppShell nav label
   ├─ Land & Properties › <record title> ← AppShell nav label; record title from web360 _cards
   └─ Families & Groups                 ← AppShell nav label (member-scoped uploads)
```

Type stays the shelf (Title, Revenue record, Map, Photos & video, Identity, Search & tax, Old record, Unsorted). Folders are the place; the shelf is the kind. This matches the comment at `web360.py:556-561`. Folders are created lazily, the first time a file is filed. That keeps every person's tree identical without seeding empty folders for everyone. Nothing outside these names is invented. The follow-up feature folders still need Reddy to confirm the names before they are built.

## Exposure check (Reddy's gate)

- **Share links:** `create_share_link` (`web360.py:10134`) snapshots documents by `record_id`, `parcel_id` or `property_id` (`capabilities.py:65-87`). An Aadhaar row has no record, so it cannot enter a share today. It could only get in if `linkPapers` (`web360.py:9942`) attached it to a property. The plan blocks that server-side (it refuses Aadhaar rows in `link_papers` and in the snapshot). That is a restriction only.
- **Search/filters:** Documents search and facets are client-side over the owner's own list. Only the owner sees the row; the subtitle carries only the mask.
- **Assistant:** I found no read of `documents` rows into model context. `services/assistant/src/domain/tool_policy.py:68` only routes to `/app/documents`. I could not fully confirm this, so the plan has a mandatory check, and a warning stop if any path is found.
- **Export:** `account.py` exports `documents` rows in the manifest. The card was already in the storage file manifest, so this adds no exposure.
- **Conclusion:** No sharing, share-link, search or assistant path newly exposes the card under the plan's guards. No warning is needed for the placement itself.

## Existing data (backfill)

Cards already kept have `aadhaar_candidates.card_node_id<>''` and no `documents` row. Filing them is a data migration, so it falls under `safe-data-migration`. The plan adds a dry-run-by-default script that is tested only on throwaway schemas. **It must not be run against Reddy's data without his separate approval.** Approval needed: "Approve running `backfill_aadhaar_documents.py --execute` on <env>, with backup ref X". Cards orphaned by earlier member deletes have no pointer left anywhere in the API. Finding them would mean reading hub `storage_nodes` by name ("Aadhaar card*"), which is a separate, explicitly gated operator decision for Reddy. It is not planned.

## Delete/re-add after the fix

- Removing a member removes their Aadhaar `documents` row whenever `_release` deletes the record. A record shared with another subject is kept.
- The client moves the card bytes to Drive Trash using the existing `trashDocuments` (`data/pattadarActions.ts:56`), so they can be recovered and are never hard-deleted.
- The member's person folder is deleted. Any other file inside is lifted to the parent, using the existing `delete_vault_folder` semantics (`web360.py:10796`).
- Re-adding creates a new person folder and a new `Aadhaar` folder, and files the new card there. There is no uniqueness clash, because person folders are keyed by `person_id` and a duplicate folder name gets a free name (`_free_folder_name`, `web360.py:8659`).

## Separate bug: ISO date in the Documents subtitle

`apps/web/src/w360/paperFiling.ts:60` writes `Registered ${registration_date}` with the raw ISO date into the stored subtitle. Fix: format it with `parseISOToDisplay` from `@pattadar/core` (`packages/core/src/format/date.ts`). Rows already stored also need a display-time normaliser in the Documents list.

## Classification

CASE A. Under Reddy's approved direction, the card should appear in Documents under its owner's folder. Today it is never filed, it can be silently not kept (checkbox order), and delete orphans its bytes. The placement needs no new exposure; the guards in the plan are restrictions only. The backfill is planned and gated, not run.

DECISION: CASE_A

## Ordered follow-ups (not in this run)

1. FMB filing failure (path 6): surface it instead of swallowing it, and place the row under person › Land & Properties › record.
2. Place the existing rows from paths 2-5 and 7 under person › Land & Properties › record (or Passbooks) at filing time, using `ensure_person_feature_folder`.
3. Legacy `DeedImportDialog` / `mirrorToDrive` (paths 12-13): stop orphaning bytes and file a row. Or retire them if the legacy MUI pages are no longer reachable.
4. Photos (8), ticket deliverables (9), owner photo (10), receipts (11): needs Reddy's decision. Filing them in Documents changes what appears there.
5. Backfill of existing documents into the tree, gated under `safe-data-migration`.
6. A `vault_folders.person_id` rename sync for record titles (property folders).
