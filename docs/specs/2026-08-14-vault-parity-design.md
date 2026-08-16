# The Vault, made one — web and iOS parity

Date: 2026-08-14
Scope: `services/api`, `services/gateway`, `apps/web`, `apps/ios`, `packages/core`

## Why

Today the two apps show two different tables and call both of them documents.

| Surface | Table | What a row is |
|---|---|---|
| Web → "All documents" | `documents` | a **file**: `file_ref` → storage node, type, links. No name, no size — the name is fetched live from My Drive per row |
| Web → "Registered deeds" | `registered_documents` | an **AI reading**: parties, survey, extent, the `reading` JSON |
| iOS → "Vault" | `registered_documents` **only** | — |

Consequences, all of them user-visible:

1. **A file uploaded on web never reaches the iOS Vault.** Web's upload writes a
   `documents` row; iOS lists `registered_documents`. There is no iOS path that
   files a paper *without* an AI read — every add goes through `ScanFirstCard`.
2. **Every web upload spends credits.** `DocumentsTab.uploadOne` fires
   `/import-registered-document` in the background for every non-video file,
   whether or not anyone wanted a reading.
3. **Uploading the same file twice destroys the first one.**
   `StorageService.create_file` adds a *new version* when a live file of the
   same name exists in the same folder. The second upload also writes a second
   `documents` row pointing at the same node — so the list shows two rows and
   one of them opens the other's bytes. This is why the current vault contains
   `…Nagaiah.pdf`, `…Nagaiah2.pdf`, `…Nagaiah3.pdf`: the names were changed by
   hand to defeat the versioning.
4. **The two apps shelve papers differently.** Web filters by
   `Deeds · EC · Records · Survey · Legal · Photos · Other`; iOS by
   `Title · Revenue record · Map · Identity · Search & tax · Old record · Unsorted`.
5. **A document cannot cite another document.** A chain of title — A→B, then
   B→C — is two registered deeds with no edge between them. The reader already
   *emits* the citation (`reading.links[]`, with a `referenced_missing` role)
   and iOS already *draws* it as a dashed "Cited, not filed" card, but nothing
   can ever turn that card into a link.
6. No rename, no multi-select share, no zip, and the web page is titled
   "Documents" while the iOS screen is titled "Vault".

## The shape: one Vault, two layers

**Layer 1 — the file.** `documents`, extended. Every file from either app lands
here, always, with no AI involved. It carries its own name, size and mime type
instead of borrowing them from the storage node at render time.

**Layer 2 — the reading.** `registered_documents`, unchanged in shape, attached
to a document *only when someone asks for a reading*.

Both apps list layer 1. A row that has a reading renders the rich spine iOS
already draws (`docSpine`, tiles, review card, FMB map). A row that does not
renders name · size · kind and says "Not read yet" — quietly, in secondary
text, never as an alarm.

This makes web's two tabs one list with a "Read" filter, and makes the iOS
Vault the same vault.

### Data model

```
documents                          -- layer 1, the file
  id, owner_user_id
  name          TEXT  NEW  -- editable display name; the rename target
  size_bytes    BIGINT NEW  -- stamped at upload from the storage node
  mime_type     TEXT  NEW
  reading_id    TEXT  NEW  -- → registered_documents.id, '' when unread
  file_ref, doc_type, parcel_id, passbook_id, property_id,
  doc_no, sro_code, reg_year, version, source, tags, created_at

document_links                     -- NEW: the paper trail
  id, owner_user_id
  from_document_id   -- the citing document (the B→C deed)
  to_document_id     -- the cited document (the A→B deed)
  relation           -- prior_title | gpa | amendment | correction | ec_for
  note
  created_at
  UNIQUE (from_document_id, to_document_id, relation)
```

`registered_documents` gains nothing. `reading_id` points *from* the file *to*
its reading, so deleting a reading never orphans a file, and a file can be
re-read (a better scan) without the row identity changing.

Backfill: every existing `registered_documents` row without a matching
`documents` row gets one minted from it (`name` from `shareFileName`-equivalent
server-side, `reading_id` set, `file_ref` copied). Existing `documents` rows get
`name` backfilled from the storage node name, `size_bytes`/`mime_type` from
`storage_nodes`. Idempotent, run in the same `ALTER TABLE IF NOT EXISTS` block
as every other migration in `main.py`.

### One taxonomy

Canonical families live in `packages/core` and are mirrored by
`DocSpine.swift`, the way `Queries.swift` mirrors `operations.ts`. We adopt the
**iOS families** — they are derived from what the reader actually emits, they
already drive tints, identity masking and FMB handling, and they classify
*unread* files by name too — plus the `photo` family the web set has and iOS
lacks:

| key | label |
|---|---|
| `title` | Title |
| `revenue` | Revenue record |
| `map` | Map |
| `identity` | Identity |
| `search` | Search & tax |
| `old_record` | Old record |
| `photo` | Photos |
| `unsorted` | Unsorted |

Web's `DOC_CATEGORIES` keys stay (they are the `doc_type` values in the
database); only the *family* grouping above them is replaced, so no data
migration is needed for the taxonomy change. `familyOfType` in
`apps/web/src/pages/documents/docTypes.ts` is rewritten to return these keys,
and `documentFamily()` in `DocSpine.swift` gains the `photo` branch.

## The five requirements

### 1. Size shown · duplicates allowed · no credits on upload

- **Size.** `documents.size_bytes` stamped from the upload response. Web shows
  a Size column (`1.4 MB`); iOS shows it in the row's secondary line and the
  detail `metaLine` (which already formats bytes with `ByteCountFormatter`).
- **No AI on upload.** Delete the background `import-registered-document` block
  from `DocumentsTab.uploadOne`. Upload writes a row and stops. The
  `classifying` spinner state goes with it.
- **Reading on request.** New action, per-row and bulk: **"Read this document"**.
  It runs the classifier, then opens a **confirm sheet** showing what was found
  — type, number, year, place, parties — with *Accept* / *Discard*. Nothing is
  written until Accept. This reuses the shape iOS's `FileToVaultScreen` already
  has, so both platforms confirm a reading the same way.
- **Duplicates.** Gateway gains `?onConflict=` on `POST /storage/files`:
  - `version` — today's behaviour, kept for the explicit "Upload new version"
    row action;
  - `duplicate` — mint a **new node** with a suffixed name (`Nagaiah (2).pdf`).

  **`duplicate` is the default for Pattadar uploads.** A land vault genuinely
  holds two originals of the same paper, and silently overwriting the first is
  the bug being fixed. Versioning stays reachable, but only when asked for.
- **iOS gains a plain upload path.** `AddDocumentSheet` grows a second choice
  beside "Scan and read": **"Just add the file"**, which enqueues a filing with
  `fieldsJSON: ""` — exactly the shape `enqueuePhoto` already uses — and the
  `SyncEngine` drain calls `createDocument` instead of `createRegisteredDocument`
  for those entries. First time an iOS user can file a paper without spending
  credits.

### 2. Lineage — a document that follows another document

`document_links` (above), owner-scoped, with GraphQL:

```graphql
documentLinks(documentId: String!): [DocumentLinkType!]!   # both directions
linkDocuments(fromId: String!, toId: String!, relation: String!, note: String!): DocumentLinkType!
unlinkDocuments(id: String!): Boolean!
```

The founder's case — bought from A→B, then B→C — is one `prior_title` edge from
the B→C deed to the A→B deed. Chains are walked by following `prior_title`
recursively; a cycle guard caps the walk at 20 hops.

**The reader already does the hard part.** `reading.links[]` carries
`cited_as` + `role`, and a `referenced_missing` role when the cited paper is not
on file. So:

- an unresolved citation renders as it does today — a dashed "Cited, not filed"
  card ([`DocumentsScreen.swift:1072`](../../apps/ios/Pattadar/Sources/DocumentsScreen.swift));
- tapping it opens **"Which document is this?"**, a picker over the vault
  filtered to plausible matches (same survey / village / a document number that
  contains the cited string);
- choosing one writes a real `document_links` row, and the card becomes solid
  and tappable — it navigates to the cited document.

Web renders the same trail in a document drawer: a vertical chain, newest at the
top, each hop labelled by its relation, each row a link.

Also in scope: attaching a document to a property already works
(`documents.property_id`, `linkDocumentProperty`); the web row menu gains
**"Link to property…"** to match "Link to parcel…" / "Link to khata…", which it
is missing today.

### 3. Rename · multi-select download & share

- **Rename** writes both: `PATCH /storage/nodes/{id}` with `{name}` (exists
  already, `StorageService.rename`) **and** `documents.name` via a new
  `renameDocument(id, name)` mutation. The mirror is what makes the new name
  visible offline on iOS and in one query on web instead of N node lookups.
  A storage-side name clash returns 409; the client appends ` (2)` and retries
  once, then reports plainly.
- **Multi-select download** → one zip (see 5).
- **Share.** iOS: the existing `ShareLink` on the detail screen extends to a
  multi-select share of the zip. Web: the zip download is the share.

**Deferred, deliberately: the temporary link for known users.** The gateway has
share *grants* (`_attach_shares`, `list_shared_children`) but no expiring signed
link and no per-recipient token. That is its own piece of work — auth surface,
expiry policy, revocation, audit — and it is not built here. It is written up as
`docs/specs/TODO-shared-links.md` with the requirements as understood: link
expires, recipient must be a known Pattadar user, access is logged, the owner
can revoke. **Nothing in this spec ships a public URL to a private document.**

### 4. Folders by type

The taxonomy above is the folder set — one shelf per family, and the two apps
name the shelves identically. That agreement *is* the consistency; the UI for it
differs because the devices differ.

- **Web** gets a folder grid: eight cards with counts and family tints, click
  into one for a breadcrumb + the table filtered to that family. A
  `folders | list` toggle sits in the toolbar and the choice is remembered in
  `localStorage`. The existing type chips stay inside the list view.
- **iOS** already has this: `VaultGrouping.type` groups the list by family with
  counted section headers. It needs only the shared labels. **No folder UI is
  added to the phone** — a grid of eight cards on a 390 pt screen is a worse
  version of a list, and the platform's own idiom for "shelves" is a sectioned
  `List`, which is what is there.

### 5. Zip on multi-download

- **Web**: add `fflate` (~8 KB, tree-shakeable). Store-only, level 0 — PDFs and
  JPEGs are already compressed, so deflate costs CPU and saves nothing. Names
  inside the archive are deduplicated (` (2)`) because two vault rows may share
  a display name. One file selected still downloads as that file, not a zip.
  Progress reports per file, and a failed member is reported by name rather
  than silently omitted.
- **iOS**: `NSFileCoordinator(.forUploading)` over a staging directory — the
  platform's own zip, no dependency.
- Archive name: `pattadar-vault-YYYY-MM-DD.zip`.

### 6. "Documents" → "Vault"

`apps/web/src/layout/AppShell.tsx` nav label, `DocumentsPage` header title and
`<title>`. Route stays `/app/documents` — changing it would break saved links
for no gain; `/app/vault` is added as an alias that renders the same page.

## Error handling

- Storage gateway unreachable stays one message, not N —
  `STORAGE_OFFLINE_MSG` is already the pattern and it is kept for uploads,
  rename, zip and read-on-request.
- A failed reading leaves the document exactly as it was, typed `unsorted`. The
  file is never at risk from a classifier failure, which is the whole point of
  the two layers.
- Bulk operations report honestly: `"7 downloaded, 1 failed — Nagaiah.pdf"`,
  never a bare success.
- `renameDocument` and `linkDocuments` are idempotent under retry
  (`x-idempotency-key`), so the iOS write queue can replay them.

## Testing

- **API**: migration is idempotent across two runs; backfill mints exactly one
  `documents` row per orphan reading; `document_links` rejects cross-owner
  edges; the chain walk terminates on a cycle.
- **Gateway**: `onConflict=duplicate` produces a second node and leaves the
  first one's bytes intact; `onConflict=version` still versions.
- **Web**: upload makes **no** call to `/import-registered-document`
  (asserted — this is the credit regression guard); zip of 3 files contains 3
  entries with unique names; rename round-trips.
- **iOS** (`PattadarKitTests`): `documentFamily` returns `photo` for image
  types; the shared family labels match the web table byte for byte; a filing
  with empty `fieldsJSON` drains to `createDocument`.
- **E2E** (`tests/e2e-ux/specs/documents.spec.ts`): the existing spec is updated
  for the Vault title and the folder toggle.

## Sequencing — all four delivered

| # | Commit | Contents | Status |
|---|---|---|---|
| a | schema + honest upload | `documents` columns, `document_links` table, backfill, `?onConflict=`, strip the AI call, size column, read-on-request, iOS plain-upload path | **done** |
| b | one taxonomy | shared families in `packages/core` + `DocSpine.swift`, web folder grid, iOS labels, "Vault" rename | **done** |
| c | rename · zip · share | `renameDocument`, a dependency-free ZIP writer, `NSFileCoordinator` zip, iOS multi-select + share, `TODO-shared-links.md` | **done** |
| d | lineage | `documentLinks` API, `linkDocuments` / `unlinkDocuments`, the web paper-trail dialog | **done** |

Two deviations from the plan above, both deliberate:

* **No `fflate`.** A stored-only ZIP writer is ~120 lines and PDFs/JPEGs do not
  compress, so the dependency bought nothing. `apps/web/src/lib/zip.ts`, with an
  independent reader in its tests.
* **The reader-citation picker ("Which document is this?") is not built.** The
  paper trail is asserted by hand from the row menu, which covers the founder's
  A→B→C case. Turning a `reading.links[]` citation into a real edge in one tap
  is a follow-up; the edge table and the API it would call are already there.

## Risks

- **Two sessions, one repo.** A parallel session owns `apps/web` per the working
  split. This session was told to fix both halves; if the other session is live
  on `apps/web`, commits (b) and (c) will collide.
- **The backfill touches live data.** It only ever *inserts* `documents` rows and
  fills empty columns; it never updates a non-empty field and never deletes.
  Run against a local snapshot first.
- **`onConflict=duplicate` as the default** changes upload semantics for any
  other caller of `POST /storage/files`. The flag is opt-in per request and the
  gateway default stays `version`; only the Pattadar clients pass `duplicate`.
