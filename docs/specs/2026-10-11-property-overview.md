# Property master record and the Overview tab

Status: design, 11/10/2026. Backend (services/api, services/assistant) built
and web Overview tab built locally 11/10/2026, uncommitted. Local only;
nothing here is applied to production. Deviation from §4: no boot-time legacy
claims — a value with no claim reads as "entered before sources were kept",
and record_master files it as a `legacy` claim the first time another source
outranks it, so no backfill runs on API boot.
Asked by: Reddy, 11/10/2026: "Prepare the strong meta model of a property, like LP
or survey number… Master record has to be very strong", and "show what is the
document number, type of ownership… from whom… if inherited then from who".
Owners: `backend-contract-change` (model, GraphQL, save paths) and
`web-feature-delivery` (Overview tab).

## What is wrong today

The trigger was "Plot (), KATRAGUNTA", which was saved from public record via
the assistant. The page cannot say how the land was acquired, from whom, or
under which document.

- **Facts sit in five places, and none records its source.** The property
  row, `record_owners`, `record_transfers` with its parties, `purchase_lots`,
  and the legacy `registered_documents` all hold acquisition facts. Each
  property-level value is stored once, with nothing recording where it came
  from. `parcel_fields` does keep a source per field, but it covers parcels
  only and the W360 pages do not read it.
- **The assistant save is lossy:**
  - It drops the deed's transaction type, so every transfer is saved as
    `'sale'` with "Sale deed …".
  - It writes no document and no purchase lot.
  - It leaves `acquisition_mode` at its column default.
  - It stores the registry's government value as the owner's market value.
  - It turns a junk `plot_no` of `()` into the title "Plot ()". The same junk
    value also stops the agricultural check from firing, so a 13-acre holding
    became an open plot.
- **The deed upload is lossy too.** The reading has the document number, the
  dates, the parties, the consideration, the fees and the prior deed. The
  property keeps only the price paid. The document row keeps only a name, and
  its transfer is not linked to the paper. The full reading is deleted after
  7 days.
- **Some facts have no field at all:** LP number, ULPIN, old survey number,
  plot number, door number, execution date, whether the land is registered,
  and inheritance (who died, the relationship, the certificate).

## 0. The master record

There is one logical master record per property, whether it is stored as a
`parcels` row or a `properties` row. Every source fills it as far as it can.
For each field we keep **every source's claim**. The visible value is chosen
by a fixed precedence rule. A disagreement is shown to the owner, never
overwritten silently.

### 0.1 Fields

Field keys are the contract. The value stays in the column the app already
reads; a column is added only where none exists. Parcel location, khata and
pattadar live on the parcel's passbook (`passbooks`), as they do today. A
parcel write to those fields therefore updates that passbook.

Source codes in the table:

| Code | Source |
|---|---|
| D | Deed upload (the `DEED_SYSTEM` reading) |
| PR | Public record via the assistant (`land.real_estate_records`) |
| PB | Passbook or 1-B reading (`PASSBOOK_SYSTEM`) |
| M | The owner types it |

**Identity**

| key | Label | parcels column | properties column | Sources |
|---|---|---|---|---|
| `state` | State | passbooks.state | **state** (new) | PB, M |
| `district` | District | passbooks.district | district | D, PB, M (PR: none) |
| `mandal` | Mandal | passbooks.mandal | city (already used as mandal) | D, PB, M |
| `village` | Village | passbooks.village | locality | D, PR, PB, M |
| `survey_no` | Survey number | survey_no | survey_no | D, PR, PB, M |
| `subdivision` | Subdivision | subdivision | **subdivision** (new) | PB, M (D/PR give it inside survey_no; split by `_survey_parts`) |
| `lp_no` | LP number (resurvey) | **lp_no** (new) | **lp_no** (new) | M today; Adangal reading later |
| `ulpin` | ULPIN | **ulpin** (new) | **ulpin** (new) | M; Adangal later |
| `old_survey_no` | Old survey number | **old_survey_no** (new) | **old_survey_no** (new) | M; Adangal later |
| `khata_no` | Khata / patta number | passbooks.pattadar_no | khata_no | PB, D (pattadar_no), M |
| `passbook_no` | Passbook number | passbooks.**passbook_no** (new) | — | PB, M |
| `plot_no` | Plot number | — | **plot_no** (new) | D, PR (cleaned), M |
| `door_no` | Door / house number | — | **door_no** (new) | PR (cleaned), M |
| `assessment_no` | Property tax assessment (PTIN) | — | ghmc_assessment_no | M |

No official codes are stored as fields in v1. LGD codes come from no source.
The public record's `dist_cd` and `sro_cd` are kept in the claim's
`source_ref`.

**Physical**

| key | Label | parcels | properties | Sources |
|---|---|---|---|---|
| `extent` | Extent | extent (ac) | land_area / builtup_area (+unit) | D, PR, PB, M |
| `classification` | Kind of land | classification | type | D, PR (land_class/property_type), PB, M |
| `land_class` | Wet / dry (metta, magani…) | **land_class** (new) | **land_class** (new) | D (classification text), PR land_class, PB, M |
| `boundary_north/south/east/west` | Boundaries | boundary_* | boundary_* | D, PR, M |
| `geo` | Pin and outline | geo_point, ring | geo_point, boundary | M (Location tab) |

The extent's long form (for example "2.80 ac = 1.133 ha" or "418.5 sq.yd =
349.92 sq.m") is derived on read and never stored.

**Title (title)**

| key | Label | parcels | properties | Sources |
|---|---|---|---|---|
| `acquisition_mode` | How acquired | acquisition_source | acquisition_mode | D doc_type, PR txn_class, PB acquisition_source, M |
| `registered` | Registered | **registered** (new, `yes`/`no`/'') | **registered** (new) | D, PR (always yes), M |
| `doc_no` | Document number | reg_doc_no ("no/year") | reg_doc_no | D, PR, M |
| `reg_date` | Registered on | reg_date | reg_date | D, PR, M |
| `exec_date` | Executed on | **exec_date** (new) | **exec_date** (new) | D, PR, M |
| `sro` | Registration office | sro | sro | D, PR, M |
| `consideration` | Consideration | purchase_price | purchase_price | D, PR, M |
| `govt_value` | Government value | guideline_value | guideline_value | PR market_value, D (Rule 3 / chargeable), M |
| `stamp_duty` | Stamp duty | stamp_duty | **stamp_duty** (new) | D, M |
| `from_parties` | From whom | the acquiring transfer's `from` parties | same | D, PR, M |
| `holders` | Held by, and share | record_owners (is_current), plus the acquiring transfer's `to` parties and their shares | same | D, PR, PB owner, M |
| `stake` | Your stake | stake | stake | M |

`acquisition_mode` takes one of these values: `sale`, `gift`, `inheritance`,
`partition`, `settlement`, `will`, `govt_grant`, `agreement`,
`unregistered_sale`, `other`, or '' (not set). The legacy properties default
`'purchase'` is read as `sale`. Old values are not rewritten.

**Status**

`ec_status`, `ec_date`, `encumbrance_status` (parcels), `mutation_status`,
`litigation` and `litigation_note` keep their existing columns. They take M
only in v1.

### 0.2 The chain

The chain reuses `record_transfers` with `record_transfer_parties`. It already
models one event with many sellers and many buyers, shares, GPA, and a
`prior_transfer_id` link down the chain. A new `property_acquisitions` table
would be a third copy of doc number, SRO and date, so it is not added.
Instead:

- The record gets an **`acquired_by_transfer_id`** column. It points to the
  transfer that gave the current holder title. The Overview's "How you hold
  it" is that transfer plus the record's title fields.
- `record_transfers` adds:
  - `registered`
  - `exec_date`
  - `consideration`
  - `govt_value`
  - `source_ref` (`pr:<rid>:<s_no>`, or the reading job id)
  - `proof_no`: the legal-heir or succession certificate number, or the
    mutation proceeding number, for an inheritance with no deed
- `record_transfer_parties` adds:
  - `role`: seller, buyer, donor, donee, deceased, heir, or executant /
    claimant as printed
  - `relationship`: for example "father" or "late husband"

  An inheritance is a transfer with `kind='inheritance'`, the deceased on the
  `from` side with a relationship, the heirs on the `to` side with shares, and
  `proof_no`.
- `deed_document_id` is filled with the filed paper's `documents.id`. The DDL
  comment that names `registered_documents` is corrected.
- A deed reading's `prior_document_details` becomes one earlier transfer.
  That transfer is unverified, carries the prior deed's number, date and
  office, and is linked by `prior_transfer_id`.

The record's flat title fields (doc_no, reg_date, sro, consideration…) are
what the record holds. The acquiring transfer is the same event in the chain.
Both are written together, in one transaction, by the one function below. No
other code writes either of them.

### 0.3 Provenance: one claims table

```sql
CREATE TABLE IF NOT EXISTS record_field_claims (
    id TEXT PRIMARY KEY,                 -- uuid7
    owner_user_id TEXT NOT NULL,
    record_id TEXT NOT NULL,             -- parcels.id or properties.id
    field TEXT NOT NULL,                 -- a key from 0.1
    source TEXT NOT NULL,                -- deed_reading|public_record|passbook_reading|manual|legacy
    source_ref TEXT NOT NULL DEFAULT '', -- documents.id / 'pr:<rid>:<s_no>' / reading job id / ''
    label TEXT NOT NULL DEFAULT '',      -- owner words: 'Deed 1576/1989', 'Public record', 'You entered'
    value TEXT NOT NULL DEFAULT '',      -- normalised text form of the claim
    confidence TEXT NOT NULL DEFAULT '', -- high|medium|low from the reading's field_confidence; '' otherwise
    wins BOOLEAN NOT NULL DEFAULT false, -- this claim is the value now in the column
    set_by TEXT NOT NULL DEFAULT '',     -- uid of the person whose action wrote it
    set_at TEXT NOT NULL DEFAULT ''      -- ISO timestamp
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_record_field_claims
    ON record_field_claims (record_id, field, source, source_ref);
CREATE INDEX IF NOT EXISTS idx_record_field_claims_owner ON record_field_claims (owner_user_id, record_id);
```

Why this table:

- **One row per source.** That is the only shape that can hold two sources
  that disagree and still show both. A jsonb column per record would need the
  same logic twice, once for each table, and could not be queried for "every
  conflict on my properties".
- **Why not `parcel_fields`.** It holds one row per field, so it cannot keep
  two claims. It covers parcels only, and its `state`/`expires_at` semantics
  belong to CL-289's government pulls. It stays as it is. Folding it into this
  table is a later follow-up.
- **The value stays in the existing columns.** Every current reader, the
  cards, Properties and iOS, keeps working unchanged.

### 0.4 Precedence

1. **The owner's own entry (`manual`) wins** over any machine source. The
   owner's choice is the record.
2. Otherwise the order depends on the field group:
   - **Conveyance facts** (title fields, boundaries and extent as conveyed):
     `deed_reading` > `public_record` > `passbook_reading` > `legacy`.
   - **Revenue identity** (khata, passbook number, LP, ULPIN, old survey
     number, land class, classification, current pattadar): `passbook_reading`
     > `deed_reading` > `public_record` > `legacy`. The 1-B is the revenue
     department's current word, and a deed's patta number goes stale.
   - **Location names** (state, district, mandal, village):
     `passbook_reading` > `deed_reading` > `public_record` > `legacy`.
     Districts were reorganised (for example Prakasam to Markapuram), so the
     current revenue record wins. The deed's older name stays as its claim.
3. Two claims of the same source kind: the newer `set_at` wins.
4. **A conflict** is a claim whose normalised value differs from the winning
   claim and whose `set_at` is later than the winning claim's. For example, a
   deed uploaded after the owner typed the extent. The Overview shows it next
   to the field, with "Use this" and "Keep mine". Either choice writes a
   `manual` claim and so clears the conflict. Earlier losing claims are kept
   as history and are not shown as conflicts.
   A machine claim on a parcel's passbook field (district, mandal, village,
   khata…) never splits a passbook that sibling parcels share: a blank cell
   is filled for the khata, a value they hold stays and the claim waits as a
   conflict. Only the owner's "Use this" splits the passbook off.
5. When a higher source replaces a non-empty lower value, the old claim is
   kept. An Activity row is written ("Village changed from X to Y, from deed
   1576/1989"), so nothing is overwritten silently.
6. An empty value is never a claim. A source that does not know a fact cannot
   blank it.

Normalising before comparison:

- Text: trim, collapse whitespace, compare case-insensitively.
- Survey numbers: `-` and `/` are treated as the same separator.
- Dates: compared as ISO dates.
- Amounts: compared to the rupee.
- Extents: compared in one unit, within 0.5%.

### 0.5 One write path

New module `services/api/src/record_master.py`:

```python
FIELDS: dict[str, Field]   # key -> group, label, parcel column/table, property column/table,
                           # validator, normaliser, important(kind), how_to_fill text
async def apply_claims(conn, uid: str, record_id: str, kind: str, *,
                       source: str, source_ref: str, label: str,
                       values: dict[str, str], confidence: dict[str, str] | None = None
                       ) -> list[str]:   # returns the keys left in conflict
async def set_acquisition(conn, uid, record_id, kind, *, source, source_ref, label,
                          acq: dict, from_parties: list[dict], to_parties: list[dict],
                          deed_document_id: str = "", prior: dict | None = None) -> str  # transfer id
```

`apply_claims` validates each value against `FIELDS`. It then upserts that
source's claim, recomputes the winner under §0.4, writes the column or passbook
cell only when the winner changes, and writes Activity rows. All of this
happens in the caller's transaction. `set_acquisition` writes the title fields
through `apply_claims` and creates or updates the acquiring transfer and its
parties. It then sets `acquired_by_transfer_id` and writes `record_owners` as
`_chain_from_deed` does today. `_chain_from_deed` becomes a thin call to
`set_acquisition`.

Every source goes through these functions:

| Path | Today | Change |
|---|---|---|
| Assistant public-record save (`saveRecord`, origin `assistant`, `source_ref pr:…`) | `_insert_record` plus `_chain_from_deed` hard-coded sale | `_insert_record` then `set_acquisition(source='public_record', label='Public record')`, with mode from `txn_class` |
| Manual add / Edit details (`saveRecord`, `updateRecord`/`_deed_sets`) | direct column writes | `apply_claims(source='manual', label='You entered')` |
| Deed upload (W360 add drawer → `attachPaper`) | paper with name only, unlinked transfer | new `fileDeedReading` mutation. The server loads the owner's own read job, fills the document's deed columns, and calls `set_acquisition(source='deed_reading', source_ref=<documents.id>, label='Deed <no/year>', deed_document_id=<paper>)` plus `apply_claims` for identity and physical fields, using `field_confidence`. One reading is one event: the transfer is keyed by the reading job (`source_ref=<job id>`), whether the record was created from the reading (`saveRecord` with `readingJobId`) or the paper is filed later, and it is unconfirmed (the reader's direction is not settled). Filing re-keys the create's claims to the paper; parties the owner reviewed on the create form stay. A reading is bound to the first paper it is filed with and refused for any other (known limit: the paper's bytes are not compared with the job's `content_hash`, since storage versions keep no sha256) |
| Passbook / 1-B reading (drawer batch) | `saveRecord` per row | `saveRecord` with `readingJobId`. The server labels the source `passbook_reading` ("Passbook <khata>") after checking that the job is the caller's |
| Overview edits | — | `setRecordFields` / `setAcquisition` → `manual` |

**Source trust.** The server sets the source kind. It is never taken from the
client:

- `public_record` needs a `pr:<rid>:<s_no>` `source_ref` that names a real
  row of `land.real_estate_records` (re-read read-only on save). Only the
  values that match that row carry its name; the rest of the save is the
  owner's. A ref naming no row (or a corpus the API cannot read) vouches for
  nothing: its values are filed unsourced (`legacy`, "entered before
  sources were kept"), never "you entered", so a real source can still win;
  the API logs one warning. The kind of land is the row's when its land
  class or property type states it (claimed, and it replaces whatever the
  card sent); otherwise the server's default is not claimed at all.
- With a `readingJobId`, only the values that match the job's stored result
  carry the reading's name; a value the owner corrected on the form is
  theirs, and the reading's own value is kept as history (no conflict).
- `deed_reading` and `passbook_reading` need a `document_read_jobs` row owned
  by the caller.
- Anything else is `manual`.

A forged label could only mislead the owner about their own record, but it is
still refused.

**Public record transaction type** (local `txn_class` values, counted
read-only):

| txn_class | Mode |
|---|---|
| SALE | `sale` |
| GIFT | `gift` |
| PARTITION | `partition` |
| AGREEMENT_OF_SALE / AGREEMENT | `agreement` |

MORTGAGE, RECEIPT, DEPOSIT_TITLE_DEEDS, LEASE, CANCELLATION and RECTIFICATION
transfer no title. For these the property is saved with mode '' (not set). The
transfer is kept with `kind='other'` and a note carrying the printed
transaction type, and the Overview asks "How did you get this land?".

**Deed reading `doc_type`** uses the existing `transferKindOf` mapping, moved
to the server: Gift → gift, Partition → partition, Settlement → settlement,
Legal Heir Certificate → inheritance, Will → will, everything else → sale.

### 0.6 Assistant draft fixes (`services/assistant/src/domain/record_drafts.py`)

- `_clean_no(v)`: a `plot_no`, `house_no` or `apartment_name` containing no
  letter or digit is treated as empty. This fixes both the "Plot ()" title and
  the `is_agricultural` miss.
- `_title` becomes "Sy 70/3 · Katraguntla": village in title case, joined with
  `·`, never `,`. Plot and door titles become "Plot 70A · Nallapadu" and
  "H.No 10-104 · …".
- `draft_item` also carries:
  - `transaction_type` (printed) and `txn_class`
  - `exec_date`
  - `plot_no` / `house_no` (cleaned)
  - `land_class`
  - `govt_value` (the registry's `market_value`)

  `market_value` is no longer sent as the owner's market estimate.
- `apps/web/src/assistant/proposals.ts` passes `acquisitionMode`,
  `execDate`, `govtValue`, `plotNo`, `doorNo` and `landClass` through.

## 1. The Overview tab

- Overview becomes the **first tab and the index route** of
  `/properties/:id`. Documents moves to `/properties/:id/documents`. The
  precedent is the Holding page, whose index tab is "Overview"
  (`Holding.tsx:51`). The heading names the tab: "Overview".
- **Decided (Reddy, 11/10/2026, in chat):** he asked for a basic-info tab
  first, so Overview is the index and Documents is `/properties/:id/documents`.
  design.md § Addresses and § Property tabs are amended to match.
- There are no redirects or aliases for the old Documents address (V5).

Consequences, all in the same change:

- `RecordHead.tsx`: in `TABS`, add `{to:'', label:'Overview', count:null}` and
  change Documents to `to:'documents'`. Update `tabTail`/`tabFor` and the
  Documents tab's `end` flag.
- `routes.tsx`: index → `RecordOverview`; `documents` → `W360Papers`.
- `Record.tsx`: `tabFor('')` → `'overview'` with the `document` layout.
- `skeletons.tsx`: `hangerOf` maps '' → `overview` (new `SkOverview`: a
  strip and two cards) and `documents` → `papers`.
- Links whose intent is Documents move to `/documents`:
  - `PaperPreview.tsx:255` (`recordHref`)
  - `Reader.tsx:149` (`papersHome`)
  - `homeGaps.ts:34` ("No documents")
  - `RecordPeople.tsx:58` (lease agreement)
  - `RecordFeatures.tsx:131` (check its intent)
  - `Ticket.tsx:364` (check its intent)

  "Open property" links stay on the index, which is now Overview.
- Guards and tests:
  - `scripts/ux-guards.ts` (Record TABS count 9 → 10, and the `Record.tsx`
    layout text)
  - `scripts/shared-components-tests.ts` SC-H10 still finds `''`
  - `tests/e2e-app/specs/04-record-shell.spec.ts` (HANGERS, `toHaveCount(10)`,
    Documents href)
  - `05-record-papers.spec.ts`: 56 `goto`s change to `/documents`
  - the bare visits in 00, 01, 20, 21, 23, 24, 31 and `zz-toast-probe`
  - `fixtures/seed.ts`: add a `recordOverview` fixture
- `design.md` § Property tabs and § Addresses.

## 2. What the Overview shows

Redesigned 12/10/2026 on Reddy's "change the UX for this tab, show the cards
by category" (the first build stacked full-width label-left/value-right rows,
each with a "from public record" line under it, and listed gaps as plain
"Missing: …" text). The page uses only shared parts: `SectionHead`, `Card`,
`KV as="dl"` (with the `facts` layout), the `Cell` strip, `Pill`,
`Failed`, and `RecordDrawer`-style drawers. Dates are DD/MM/YYYY and figures
are `tabular-nums`. Values not set inside a drawn group read "Not set". There
are no raw ids in the copy; document numbers and the RID are owner facts and
may be shown.

Layout: a grid of category cards. "Title" (≈2fr) beside "Compliance
check" (≈1fr) once the tab is 48rem wide (container query), then
Identity · Physical · Status in an auto-fit row (one to three columns). On a
phone everything is one column. Cards in a row share a height, except a
one-line card (the bare hold prompt, a bare group), which keeps its own.

1. **Summary strip** (`.strip.overview-strip` of compact `Cell`s, each
   linking to its tab; nine cells as one row when the tab is 76.5rem wide,
   3×3 otherwise, so no row is left short; on a phone, tighter padding and
   labels that may wrap to two lines): Documents (count, newest
   name), Site features (count, how many need attention), Owners, Location
   ("Pinned" / "Outlined" / "Not set", "Outline drawn"), Media, Notes (newest
   date), Services (open, "n done"), Paid (and worth), Activity (newest date
   and line). A zero is a short dimmed "None". A note is one line cut with an
   ellipsis; its whole text is the title.
2. **Title** (Card, the first thing an owner wants). The hero: mode
   and Registered/Not registered as Pills, then the parties as labelled
   fields, the current side first — "Buyer" / "Seller", "Donee" / "Donor",
   "Legal heir" / "Deceased" (with the relationship) and so on by mode, and
   by the earlier side's role when no mode is set ("Earlier owner" /
   "Owner" when neither says); never the sentence "From <name> · seller /
   Held by <name>" (Reddy, 12/10/2026). Then the known title facts as a
   label-above-value grid (Document number, Registered on, Executed on,
   Registration office, Consideration, Government value, Stamp duty). The
   foot: the source line (the link to the deed file when the source is a
   deed; "From public record · RID … · schedule n" otherwise), "Open the
   deed" when another source filled it and a deed is filed, and "Earlier
   owners (n)" → People when the chain is longer than 1. Edit (in the card
   head) opens the acquisition drawer (`setAcquisition`). When nothing is
   known, the card is one line, "How did you get this land? Add the deed, or
   tell us", with **Upload the deed** and **Enter it**.
3. **Compliance check** (Card, icon checklist; Reddy, 12/10/2026: "run the
   compliance, show tick marks otherwise"; replaced "Complete this
   property" and its facts-known count). Run by the server on every read
   (`services/api/src/compliance.py`, `RecordOverview.compliance`), from
   facts already on file only — no AI, no external call. Head: "n of m
   checks passed" with a bar toned by the result (all passed green, any
   fail red, else amber) and "Checked DD/MM/YYYY HH:MM" (India time). Every
   check is listed, fails first, then warnings, then the ones the data
   cannot tell, passed last. A pass is a green tick on one line with what
   proved it; a warn an amber mark and a fail a red cross, each with its
   one-line detail and its way in — **Add** opens the drawer its field is
   in on that field (Title's drawer for a title fact or the earlier owner),
   **Upload** the add-document drawer (the deed flow for a title check),
   **Order** the one order flow (`orderHref`) on that service (EC,
   mutation, FMB copy); an unknown is a neutral dash with the reason.
   Compact by default: the first four fails and warnings, then unknowns
   with a way in (the cap counts them), then one line — "n passed · n more
   to fix · n need your answer · n cannot tell yet", a tick only when one
   passed. A check passes only when the data proves it; doubtful is a
   warn, unknowable an unknown (12/10/2026).
   The standard set: registered title deed on file (the transfer's deed
   must still be a paper on this property; an inheritance needs the filed
   legal-heir or succession paper, a typed number alone is a warn); title chain recorded;
   khata / passbook (a property: khata or tax assessment); mutation in
   your name (the owner's note, else the passbook holder against the
   buyers — the same words, or two or more with every full word and
   initial fitting; one shared surname is "Passbook name differs", a
   warn); survey number (a property: plot or door)
   and extent; deed extent against the passbook's (farmland; a mismatch is
   a warn); LP number / ULPIN (farmland; unknown unless the village is
   known to be resurveyed); boundaries ('—', '-', '()', '/', 'N/A', 'NA',
   'nil' are not recorded, and no check passes on one); encumbrance
   certificate (a pass needs the EC paper filed and a date within 12 months;
   a warn past 12 months, with no date, dated in the future, dated before the
   deed, or a typed date with no paper); no court case (a pass needs the
   owner's own "no"); land or property tax receipt (a receipt, not a demand
   notice or income tax, from this or the last financial year when its
   date is known; else a warn; a tax expense in Money with a receipt
   follows the same year rule). The property's
   governance policy (most specific published one for its
   state/district/mandal/village) adds the checklist items the standard
   set does not cover: a map item passes on a filed FMB or survey sketch
   (Map shelf or typed so); an outline drawn by the owner alone is a warn;
   any other is unknown with the policy's reason.
4. **Identity**, **Physical** and **Status** (one Card each, always drawn
   when the kind has the group, since its Edit is the only way into its
   drawer; a group with nothing set is a one-line card, "Status · nothing
   recorded yet" with **Add**, never a card of blanks): known fields as a label-above-value grid,
   two or more columns when the card is wide. Each value carries a small
   source tag — Deed, Public, Passbook, You, Earlier — a focusable button
   (`InfoTip` with `tag`) whose tip shows the full source on hover, focus and
   tap ("From deed 1576/1989", "From public record · RID … · schedule 3",
   "You entered", "Entered before sources were kept"); the full source is
   also its accessible name. A field in conflict spans the card, highlighted,
   with a Pill "Deed 4412/1998 says 4.12 ac" and **Use this** / **Keep
   mine**, named for a screen reader "Use this: extent from the deed" /
   "Keep mine: your extent". Physical shows the extent's long form (`extentDetail`) under it
   and, once any boundary is known, the four boundaries as a 2×2 grid. Each
   card has one "Edit" opening its group's drawer (`setRecordFields`).

   The important set depends on kind:
   - parcel: survey_no, khata_no, extent, classification, acquisition_mode,
     doc_no when `registered=yes`, and lp_no and ulpin labelled "if your
     village is resurveyed"
   - property: plot_no or door_no, extent, acquisition_mode, doc_no,
     assessment_no when built

Zero state: the first read is `SkOverview`, in the grid's own shape. A failed
read shows the shared `Failed` once for the page, not per card. A brand-new
property with only a title shows the strip, the "How did you get this land?"
line, the Compliance check and one-line group cards, never three empty cards.

## 3. Contract

### DDL (idempotent boot DDL, `web360.py` statement list)

```sql
-- master fields (both tables unless noted)
ALTER TABLE properties ADD COLUMN IF NOT EXISTS state TEXT NOT NULL DEFAULT '';
ALTER TABLE properties ADD COLUMN IF NOT EXISTS subdivision TEXT NOT NULL DEFAULT '';
ALTER TABLE properties ADD COLUMN IF NOT EXISTS plot_no TEXT NOT NULL DEFAULT '';
ALTER TABLE properties ADD COLUMN IF NOT EXISTS door_no TEXT NOT NULL DEFAULT '';
ALTER TABLE properties ADD COLUMN IF NOT EXISTS stamp_duty DOUBLE PRECISION NOT NULL DEFAULT 0;
-- for t in (parcels, properties):
ALTER TABLE {t} ADD COLUMN IF NOT EXISTS lp_no TEXT NOT NULL DEFAULT '';
ALTER TABLE {t} ADD COLUMN IF NOT EXISTS ulpin TEXT NOT NULL DEFAULT '';
ALTER TABLE {t} ADD COLUMN IF NOT EXISTS old_survey_no TEXT NOT NULL DEFAULT '';
ALTER TABLE {t} ADD COLUMN IF NOT EXISTS land_class TEXT NOT NULL DEFAULT '';
ALTER TABLE {t} ADD COLUMN IF NOT EXISTS registered TEXT NOT NULL DEFAULT '';
ALTER TABLE {t} ADD COLUMN IF NOT EXISTS exec_date TEXT NOT NULL DEFAULT '';
ALTER TABLE {t} ADD COLUMN IF NOT EXISTS acquired_by_transfer_id TEXT NOT NULL DEFAULT '';
ALTER TABLE passbooks ADD COLUMN IF NOT EXISTS passbook_no TEXT NOT NULL DEFAULT '';
-- chain
ALTER TABLE record_transfers ADD COLUMN IF NOT EXISTS registered TEXT NOT NULL DEFAULT '';
ALTER TABLE record_transfers ADD COLUMN IF NOT EXISTS exec_date TEXT NOT NULL DEFAULT '';
ALTER TABLE record_transfers ADD COLUMN IF NOT EXISTS consideration DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE record_transfers ADD COLUMN IF NOT EXISTS govt_value DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE record_transfers ADD COLUMN IF NOT EXISTS source_ref TEXT NOT NULL DEFAULT '';
ALTER TABLE record_transfers ADD COLUMN IF NOT EXISTS proof_no TEXT NOT NULL DEFAULT '';
ALTER TABLE record_transfer_parties ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT '';
ALTER TABLE record_transfer_parties ADD COLUMN IF NOT EXISTS relationship TEXT NOT NULL DEFAULT '';
-- provenance: record_field_claims (§0.3)
```

All of this is additive: nothing is dropped, renamed or rewritten. Dates are
stored ISO `YYYY-MM-DD` and shown as DD/MM/YYYY.

### GraphQL (`Query.web` / `Mutation.web`, owner-scoped through the existing record access check)

```graphql
type RecordFieldSource { source: String!  label: String!  sourceRef: String!
                         documentId: String!  setAt: String!  confidence: String! }
type RecordFieldClaim  { id: String!  value: String!  display: String!  source: RecordFieldSource! }
type RecordField { key: String!  group: String!   # identity|physical|title|status
                   label: String!  value: String!  display: String!
                   important: Boolean!  howToFill: String!
                   source: RecordFieldSource      # null = not set
                   conflicts: [RecordFieldClaim!]! }
type AcquisitionParty { name: String!  parentage: String!  role: String!
                        relationship: String!  shareNum: Int!  shareDen: Int!  isGpa: Boolean! }
type RecordAcquisition { mode: String!  modeLabel: String!  registered: String!
                         docNo: String!  regDate: String!  execDate: String!  sro: String!
                         consideration: Float!  govtValue: Float!  stampDuty: Float!
                         proofNo: String!  transferId: String!  deedDocumentId: String!
                         fromParties: [AcquisitionParty!]!  toParties: [AcquisitionParty!]!
                         chainLength: Int!  source: RecordFieldSource }
type RecordSummary { paperCount: Int!  newestPaper: String!  newestPaperAt: String!
                     featureCount: Int!  featureAttention: Int!  ownerCount: Int!
                     hasPin: Boolean!  hasOutline: Boolean!  photoCount: Int!
                     noteCount: Int!  newestNoteAt: String!
                     servicesOpen: Int!  servicesDone: Int!
                     paidTotal: Float!  marketTotal: Float!
                     newestActivity: String!  newestActivityAt: String! }
type RecordOverview { id: String!  fields: [RecordField!]!  acquisition: RecordAcquisition
                      summary: RecordSummary!  conflictCount: Int!  missing: [RecordField!]!
                      compliance: RecordCompliance }
type RecordCompliance { checkedAt: String!  passed: Int!  total: Int!  checks: [ComplianceCheck!]! }
# status: pass | warn | fail | unknown · action: add | upload | order | none
type ComplianceCheck { key: String!  label: String!  status: String!  detail: String!
                       action: String!  fieldKey: String!  serviceKind: String! }

# Query.web
recordOverview(id: String!): RecordOverview

# Mutation.web — each returns the fresh RecordOverview
input FieldValueInput { key: String!  value: String! }
setRecordFields(recordId: String!, fields: [FieldValueInput!]!): RecordOverview!
input AcquisitionPartyInput { name: String!  parentage: String = ""  relationship: String = ""
                              role: String = ""  shareNum: Int = 0  shareDen: Int = 0 }
input AcquisitionInput { mode: String!  registered: String = ""  docNo: String = ""
                         regDate: String = ""  execDate: String = ""  sro: String = ""
                         consideration: Float = 0  govtValue: Float = 0  stampDuty: Float = 0
                         proofNo: String = ""  fromParties: [AcquisitionPartyInput!] = [] }
setAcquisition(recordId: String!, input: AcquisitionInput!): RecordOverview!
chooseFieldClaim(recordId: String!, key: String!, claimId: String!): RecordOverview!
#   claimId: a conflicting claim's id ("Use this"), or the literal 'keep'
#   ("Keep mine": the value the record holds now). Either is filed as the
#   owner's own entry, newer than every claim, so the conflict clears.
fileDeedReading(recordId: String!, paperId: String!, jobId: String!): RecordOverview!

# RecordInput (saveRecord) gains, all optional:
#   acquisitionMode, execDate, govtValue, plotNo, doorNo, landClass, lpNo, readingJobId
```

**Validation**, at the trust boundary:

- `key` must be in `FIELDS`. Unknown keys are refused, not ignored.
- Text is at most 200 characters (boundaries at most 500).
- `mode` and `registered` must be in their enums.
- Dates must be valid ISO dates, not in the future, and not before 1800.
- Amounts must be from 0 to 1e12.
- A share must be 0/0 or 0 < num ≤ den ≤ 10000.
- There are at most 20 parties.
- A party name is required.
- `fileDeedReading` refuses a job that does not belong to the caller, is not
  done, or is not a deed reading, and a paper that is not on this record.
- No Aadhaar or PAN is ever copied into claims or parties. The reading's
  parties are allow-listed to name, parentage, address, role, extent and
  share.
- `saveRecord` with an id checks every value first and writes the columns,
  the trail and the claims in one transaction: nothing is half-applied.

**setAcquisition semantics.** It edits the acquiring transfer in place,
whatever source filed it (its source, ref and deed link stay), so the
chain never gains a second copy of one event. A blank box or a 0 amount is
"not stated" and keeps what the record and the transfer hold; clearing a
value is `setRecordFields`' (a title key sent as '' clears the record and
the acquiring transfer). `registered: "no"` clears the document number,
date and office. The held-by side is kept, and a party keeps the address,
extent and GPA flag the input does not state. `chainLength` counts distinct
events (rows naming one document number are one event).

**Watched records** (stake `watch`) keep the land's facts only: no deed
reading, public-record save or owner account puts party names on the
transfer, the People chain or the paper (spec 2026-10-04 §5 q6).

**Legacy editors.** The root `updateProperty`, `updateParcel` and
`updatePassbook` (iOS, Expo) keep their contract; what they change is filed
as the owner's own claim in the same transaction, so a later source cannot
settle it back.

`RecordDetail` is unchanged, apart from the web query also selecting
`sourceRef`. The Overview has its own query, so other tabs do not pay for it.

## 4. Backfill (local only, `safe-data-migration`)

- **Boot, idempotent.** For every record, insert a `legacy` claim
  ("entered before sources were kept", `wins=true`) for each non-empty master
  column, with `ON CONFLICT DO NOTHING`. Mode `'purchase'` is read as `sale`
  and is not rewritten.
- **One-off script** `services/api/scripts/backfill_record_master.py`
  (`--dry-run` by default):
  1. For records whose `source_ref` starts with `pr:`, read
     `land.real_estate_records` read-only by rid and s_no. Write the
     `public_record` claims (mode from `txn_class`, exec_date, govt_value,
     plot_no and door_no cleaned) through `apply_claims`, and fix that
     record's transfer kind.
  2. Clean the "Plot ()" style titles and report them; the owner's label is
     never changed silently.
  A record saved before transfers carried parties gets its from/to
  parties from its People rows (`record_owners`, else `property_owners`).
  A manual kind-of-land claim equal to the card default (parcel `agri`,
  property `open_plot`) is dropped, and the row's land class replaces it.
  3. Link `record_transfers` that have an empty `acquired_by_transfer_id` and
     exactly one transfer on the record.

  It runs only against the local DB. Production is out of scope.

The Katragunta sale-deed reading found in `document_read_jobs` (09/10/2026)
drops out of the 7-day window around 16/10/2026. Its document number does not
match the saved property, so it may be the earlier deed in the chain. Filing
it is the owner's call, through the normal upload, and is not done by the
backfill.

## 5. Files

Backend:

- `services/api/src/record_master.py` (new)
- `services/api/src/web360.py`: DDL, types, `recordOverview`, four
  mutations, `RecordInput`, and routing `_insert_record`, `_chain_from_deed`
  and `_deed_sets` through `record_master`
- `services/api/tests/test_record_master.py` (new): precedence, conflict,
  no-blank, source trust, validation
- `services/api/tests/test_save_record_deed.py`: mode from the transaction
  type, acquiring transfer, claims
- `services/api/scripts/backfill_record_master.py` (new)
- §7: `web360._convert_record_kind` + `convertRecordKind`, `_creation_trace`,
  `HistoryEvent.source`; `audit.py` specs; `scripts/convert_record_kind.py`;
  `tests/test_convert_record_kind.py`
- `services/assistant/src/domain/record_drafts.py`
- `services/assistant/tests/test_record_drafts.py`

Web:

- `apps/web/src/w360/pages/RecordOverview.tsx` (new)
- §7: `ConvertKindDialog.tsx`, the farmland prompt, the ⋮ entry in
  `RecordHead.tsx`, the Activity source line (`Orders.tsx`), core
  `actionLabel`, and `tests/e2e-app/specs/45-record-overview.spec.ts`
- `RecordHead.tsx`, `Record.tsx`, `routes.tsx`, `skeletons.tsx`
- `api.ts`: types, `Q_RECORD_OVERVIEW`, `useRecordOverview`, the four mutations
- `PropertyActions.tsx`: `applyReading` fills docNo, sro, regDate and the
  boundaries; filing calls `fileDeedReading` instead of the client-side
  `fileReadingTransfer`
- `apps/web/src/assistant/proposals.ts`
- The Documents-intent links in §1
- `scripts/ux-guards.ts`
- `tests/e2e-app` specs and `fixtures/seed.ts`
- `design.md`

## 6. Out of scope and follow-ups

- **iOS and Expo parity.** `sync-ios` NOTE: iOS reads `parcels`/`properties`
  columns, which are unchanged, so nothing breaks. Showing the Overview and
  the claims on iOS is a separate parity item.
- An Adangal / 1-B reading prompt that extracts the LP number, ULPIN, old
  survey number and land class. Until then these are entered by hand.
- Multi-item schedules (one deed, ten survey items), the e-stamp, CS
  number, book/volume/pages, fees breakdown, witnesses, and encumbrance (EC)
  rows as data.
- Folding `parcel_fields` and `purchase_lots.deed_no/sro` into the claims
  model.
- Production apply, which needs Reddy's approval per `pattadar-safety`.

## 7. Changing a record's kind, and the creating-source trace

Decided by Reddy, 11–12/10/2026 (D1–D3 under Decisions). Built locally
12/10/2026, uncommitted; nothing applied to any database.

### 7.1 Kind conversion (D1)

`Mutation.web.convertRecordKind(recordId: String!, to: String!,
passbookId: String, classification: String): RecordOverview!` — owner-scoped
through `_record_kind`, one transaction, the fresh Overview back. The server
function is `web360._convert_record_kind`; the local script calls the same one.

- **property → parcel.** The same id moves from `properties` to `parcels`:
  - Columns with the same name and type copy as they are (deed facts,
    boundaries, pin and outline, stake, values, master columns,
    `created_at`). The extent is `land_area` in acres from the property's own
    `land_unit` (sq.yd ÷4840, sq.ft ÷43560, sq.m ÷4046.8564224, acres, guntas
    ÷40, cents ÷100, hectares ×2.4710538, ankanam ÷605; iOS/Expo labels such as
    'Sq. feet' normalised; blank = sq.yd); an unknown unit is refused with
    nothing moved. The column keeps the exact acres (the claim text rounds to 4
    places for display). `current_value` becomes `market_value` when that is 0
    (`market_value_from` on the audit line). The kind of land
    is `classification` (default `agri`); `holding_status` → `status`;
    `acquisition_mode` → `acquisition_source` ('purchase' read as `sale`).
    The survey number is kept as the property held it (`70/3`, not split),
    so the claims already filed for it still agree.
  - The khata: `passbookId` when given (must be the caller's); else the
    owner's passbook with the property's khata number in the same village
    (case-insensitive); else a new minimal passbook carrying the property's
    khata (blank when none), state, district, mandal, village, owner name
    and holder (`group_id`). `parcels.passbook_id` is NOT NULL and
    `_record_kind` reaches a parcel only through its passbook's owner.
  - Rows keyed by kind move: `documents.property_id` → `parcel_id`,
    `registered_documents` (also `passbook_id`), `property_photos` →
    `parcel_photos` (same ids, the cover kept), `property_owners` →
    `parcel_owners` (every shared column: name, current, date, and the
    `share_pct`, `user_id`, `group_id`, `role` main.py's boot DDL adds to
    `parcel_owners` for this),
    `combined_property_members` (`parcel_id` set, `property_id` NULL, so its
    FKs and one-record CHECK hold), and a `'property'` kind tag on
    `favourites`, `notes`, `land_features`, `land_expenses`,
    `work_requests`, `record_tags` becomes `'parcel'`. The legacy
    `properties.notes` text becomes a note. Rows keyed by `record_id` /
    `entity_id` stay (same id): claims, transfers, owners, papers' links,
    features, money, services, the trail.
  - Kind of land and extent are filed as the owner's own claim (their
    decision), newer than every source; earlier sources' values (for
    example the public record's `63162 sq.yd`) stay as history and raise no
    conflict. A value with no claim yet is kept as a `legacy` claim first.
  - Audit `record.kind_changed` with `from_kind`, `to_kind`, `from_extent`
    (in the property's unit), `to_extent`, `market_value_from` (kinds,
    extents and a column name only). Run by the local script, the envelope's
    actor is `operator:convert_record_kind` (actor kind `admin`, affected
    owner the owner) with `applied_by`/`approval_ref`; the claims stay the
    owner's.
  - A property already moved between the kind check and the row lock is
    refused: "This property was already changed".
  - `RecordOverview.convertTarget { reuse khataNo village fromArea fromUnit
    acres }` previews the move with the same code (`_convert_plan`), so the
    confirmation says the real extent and exactly which khata: "your khata N
    in V", "a new khata N in V", or "a new khata you can fill in later".
  - Refused, in words, with nothing moved: a built-up area or a built type,
    a door number, a real plot number ("clear it first if this is really
    farmland"), a building project, a property-tax assessment number,
    building attributes, or a status with no farmland equivalent. A second
    call is refused as "already agricultural land".
- **parcel → property** is refused. Shortcut, accepted for now: it needs a
  unit choice (sq.yd or built sq.ft) and detaching the parcel from its
  khata's siblings; build it when an owner asks to move land the other way.
- **The flag.** `RecordOverview.suggestKind` is `parcel` (with
  `suggestReason`) when a property without a building, door or plot number
  reads as farmland: its public record measures it in acres and names no
  plot or house (`record_master.pr_reads_as_farmland`, the backfill's
  "reads as farmland saved as plot" count), its kind of land is `agri`, or
  its land class is dry/wet. The Overview asks once, quietly: "This reads as
  farmland — keep it as agricultural land in acres?" with Convert and Not
  now (this browser's own answer, kept in local storage). The property's ⋮
  menu offers "Change to agricultural land" on land in sq.yd. Both open one
  confirmation that says what changes (acres, under a khata, same address).
  `/properties/:id` does not change.
- **Local script** `services/api/scripts/convert_record_kind.py`: local
  only (refuses RDS and a non-local `APP_ENV`), dry run by default (the same
  work, rolled back), `--apply` needs `--approval-ref`, counts only, one
  transaction for every id named, and a `pg_dump` reminder. `--flagged`
  lists the ids the Overview would flag and converts nothing. The main
  session applies it to Katragunta; this change did not.

### 7.2 The creating-source trace (D2)

Every create through `saveRecord` writes its `create_parcel` /
`create_property` audit event (legacy `audit_events` and the chained
`audit_events_v2` through `log_audit`) with metadata, allow-listed in
`audit._CREATED_FROM`:

| Path | `source_kind` | Also |
|---|---|---|
| Assistant public-record save (`pr:` ref) | `public_record` | `rid`, `s_no`, `source_ref` |
| A `pr:` ref that does not resolve | `unverified_public_record` | `source_ref` only (no `rid`) |
| Deed-reading add (`readingJobId`) | `deed_reading` | `reading_job_id`, `file_name`, `content_hash` |
| Passbook batch (`readingJobId`) | `passbook_reading` | same |
| Manual | `manual` | — |

`file_name` and `content_hash` come from the caller's own
`document_read_jobs` row (an empty hash is left out). Nothing else from the
file — no party, no number — is copied. When `fileDeedReading` first binds
a reading to its paper (B7) it writes `record.source_bound` with
`source_kind`, `file_name` (the paper's name), `document_id`,
`reading_job_id` and `content_hash`; filing the same paper again writes
nothing. The reading itself is purged after 7 days; these events are not.

`recordHistory` gains `source`: "Created from <file name>", "Created from
public record · RID … · schedule …", or "Deed <file> filed as the source of
Title", built from the chained envelope. Activity shows it under
the event. On the Overview, Title's source line is the link to
the deed it came from, when there is one.

The root API (iOS/Expo) traces too: `createPropertyFromDocument` and
`createParcelFromDocument` (`parcel_from_document`) write `source_kind`
`registered_document` and `document_id`; `createParcel` writes `passbook`
with `source_ref` only when its `source` is `passbook:<the passbook just
checked as the caller's>`, else `manual` with the client's `origin`;
`createProperty` writes `manual`. The registered document has no file name
or content hash to copy.

An Overview source from a deed reading names `documentId` only once
`fileDeedReading` bound it to a paper; before that the ref is the reading's
job id, returned as `readingJobId`, and the web links nothing.

## Decisions

Answered by Reddy, 11/10/2026, in chat:

1. **Overview is the index route, Documents moves to `/documents`.** Yes —
   "a basic-info tab first". design.md § Addresses and § Property tabs are
   amended.
2. **Local data.** The product is still in incubation; local data may be
   changed and remodelled freely ("not worried about data, you have control
   to make good data modelling"). This covers the local backfill (§4) and the
   repair of junk titles. Production apply is still out of scope.

Answered by Reddy, 11–12/10/2026, in chat:

- **D1 — "yes it should be agri land in acres".** The Katragunta property
  (saved from public record as an open plot, 63,162 sq.yd = 13.05 ac) becomes
  an agricultural parcel in acres, through §7.1.
- **D2 — "yes, but keep it traced and update the audit with the given file as
  source that the property started creating with".** Accepted: a deed
  reading is bound to the first paper it is filed with (B7; storage versions
  keep no sha256 to compare with the job's `content_hash`). Upgrade path:
  compare hashes once storage versions record a sha256. Every create carries
  its source trace (§7.2).
- **D3 — "yes".** Accepted for now: a passbook reading vouches for every
  passbook key the form sends, a corrected one included (`_claim_source`
  shortcut). Upgrade path: a passbook→field map like `deed_claims`, so a
  corrected value is filed as the owner's, when a correction is seen filed
  as the reading's.

Still open for Reddy:

3. The precedence order in §0.4. In particular: the owner's entry beats a
   deed, and the 1-B beats the deed for revenue identity and location names.
4. A non-conveyance public record (mortgage, receipt, lease and so on) is
   saved with "How acquired" not set, rather than refused.
