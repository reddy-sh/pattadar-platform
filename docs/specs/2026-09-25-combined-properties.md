# Combined properties — several records held as one piece of ground

Status: **implemented** (web 360 only). Approved 25/09/2026.

## The problem

An owner buys sixty acres as two registrations and holds it behind one fence.
The register has two records, correctly: two survey numbers, two deeds, two
title chains. But when a fence goes round the whole of it, or a well is sunk for
both halves, there is nowhere honest to put the cost. Filing it against one
survey makes that survey's per-acre figure wrong, and splitting it invents a
division nobody agreed.

The same owner also has no way to see the two halves together. Each record draws
its own boundary on its own screen, so the one thing they want to look at — the
whole holding, as it sits on the ground — is the one view the app does not have.

## What this is, and is not

A combined property is an **aggregate over records**. It owns three things: a
name, a membership list, and the costs that are genuinely about the whole
holding. Nothing else.

It is **not**:

- a third kind of record. It is deliberately absent from `_cards`, so it carries
  no boundary, no deed, no khata, no owner chain and no status;
- a legal or database merge. Every member keeps its own row, survey number,
  papers, boundary, photographs, people, title chain and its own ledger;
- a portfolio entry. `portfolio` reads the records themselves, so an acre inside
  a combined property is counted exactly once — on the record that holds it. The
  browser gate asserts this by reading the Properties total before and after
  combining and requiring it to be byte-identical;
- a mutation, a consolidation, or a merged FMB. No office has been told anything.

It is also not a family group and not a tag. A group decides WHO holds land —
for a parcel it moves the whole khata, and its members are people with legal
standing — while a tag has no identity, no totals, and nothing to hang a cost on.
Tags remain the way to put one record into several overlapping collections.

## Rules, as approved

1. At least two records. One record held as a combined property is the record.
2. A record belongs to **at most one** combined property. Two holdings each
   counting the same thirty acres is the one thing this must never allow;
   overlapping groupings are what tags are for.
3. ~~Only records the account holds **in its own name** (`stake = 'owned'`) may
   join.~~ **Superseded 04/10/2026 — see "Amendment: one stake per holding"
   below.** Every member shares one stake, all `owned` or all `managed`; never
   `watch`; never mixed. The dialog says which records it left out and why
   rather than silently filtering them.
4. Costs can be recorded at the holding's scope. They are **not** divided
   between the members, and the Expenses tab reports the holding's own costs
   beside its members' with a `scope` on every row.
5. Papers, boundaries, FMB sheets and service orders stay on the member they
   belong to. The combined tabs gather them and name the originating survey on
   every row. The one paper filed FROM the holding is a joint FMB (below), and
   it too lands on the members: a flagged copy on every survey it covers.
6. Deleting a combined property deletes the grouping and the costs recorded
   against the whole holding — which have nowhere else to live — and nothing
   else. Every record returns to standing on its own in Properties.
7. When a member record is deleted from Properties, its membership goes with it
   (database cascade) and the holding stays, marked `isComplete = false`. The
   alternative — deleting the holding automatically — would silently destroy
   combined costs the owner recorded.

## Amendment: one stake per holding (04/10/2026)

Founder override of rule 3. Owners who look after a family member's land asked
to group it the same way they group their own, so a holding may now be made of
land the account **manages**, as long as it is made of nothing else.

- **Rule.** All members share ONE stake, either all `owned` (Mine) or all
  `managed` (I manage it). `watch` never joins. Mixed is refused. The point of
  rule 3 survives: a holding's totals are either your own money or the money of
  the land you look after, never the two added together.
- **Refusals are sentences.** `createCombinedProperty` and `setCombinedMembers`
  raise a GraphQL error (ValueError, passed through `MaskUnexpectedErrors`)
  whose `message` is the sentence to show, instead of answering `""` / `false`:
  - `A holding needs at least two records.` / `A holding can have at most 50 records.`
  - `Give the holding a name.` / `A holding's name can be at most 120 characters.`
  - `One of these records is no longer in your properties. Reload the list and try again.`
    (also what another owner's id gets — it reads like a missing one)
  - `“Sy 94” is land you are watching, and watched land cannot be part of a holding.`
  - `Every record in a holding must have the same stake — all Mine or all I manage it. “Sy 77” is Mine and “Sy 92” is I manage it.`
  - `“Sy 78” is already part of the holding “First”. Take it out of that one first.`
  - `One of these records was just added to another holding. …` (the unique-index race)

  `setCombinedMembers` still answers `false` for a holding id that is not this
  owner's. An error also releases an `x-idempotency-key` claim (only clean
  answers are memoized), so a corrected retry runs rather than replaying a refusal.
- **Idempotent by membership.** `createCombinedProperty` with exactly the
  records of an existing holding of this owner (order and repeats ignored)
  returns that holding's id and writes nothing — no second holding and no
  rename. A superset or overlap is still refused as "already part of". Two
  presses racing for the same set (the card's holding step and a Combine in
  another tab) both get the one holding: the loser's unique-index violation
  looks the exact set up again and returns the winner's id.
- **A member's stake cannot change on its own while it would leave the
  holding mixed.** Chosen over silently removing it: removal would shrink the
  holding (possibly below two records) and take the owner's filed costs out of
  view without them noticing. `saveRecord` (with `id` and a different `stake`)
  and root `setStake` raise `This record is part of the holding “…”, and every
  record in a holding has the same stake. To change it, change the stake of the
  whole holding (Edit the holding), or take this record out of it first.` A
  change that leaves every member on one stake (owned or managed) is allowed.
  The check (`web360._guard_holding_stake`) takes the record's row lock in the
  same transaction as the write, and the combine check takes `FOR SHARE` on the
  same rows before reading stakes, so a stake change and a combine cannot
  interleave into a mixed holding. The legacy web /parcels stake dialog shows
  that sentence instead of "Couldn't update — try again".
- **The whole holding changes stake in one act.** `setCombinedStake(id, stake)`
  (`owned` | `managed`; `watch` refused) sets every member's stake in one
  transaction, so land you managed and now own changes without ungrouping —
  `deleteCombinedProperty` would also delete the holding's combined costs.
  The holding's Edit dialog offers it ("Every record in it is: Mine / I manage
  it").
- **Holdings made before this amendment may be mixed.** Before 04/10/2026 the
  stake rule was checked only at combine time, and root `setStake` / `saveRecord`
  had no holding guard, so a member could be changed to managed or watched after
  combining. No migration rewrites them (which stake is right is the owner's
  call, not the server's). They repair without data loss: the Edit dialog
  detects a mixed holding, says so, and `setCombinedStake` puts every member on
  the stake the owner picks; a single member's change that makes the holding
  uniform is allowed; and a holding of three or more can drop the odd member
  through `setCombinedMembers`. To find them:
  `SELECT combined_property_id FROM combined_property_members m LEFT JOIN parcels p
  ON p.id = m.parcel_id LEFT JOIN properties r ON r.id = m.property_id GROUP BY 1
  HAVING count(DISTINCT COALESCE(p.stake, r.stake, 'owned')) > 1
  OR bool_or(COALESCE(p.stake, r.stake) = 'watch')`.
- **Web.** `canCombine` becomes "stake is owned or managed, and the same as the
  rest of the selection" (`w360/pages/holdingStake.ts`, unit-tested); the
  Combine dialog names each record it left out under its own reason (watched,
  or a different stake than the rest), and `tests/e2e-web360/specs/holdings.spec.ts`
  asserts each line and a two-managed holding.
- **Evidence.** `services/api/tests/test_combined_property.py`:
  `test_a_holding_is_one_stake_mine_or_managed_never_watching`,
  `test_creating_the_same_holding_twice_returns_the_first`,
  `test_a_whole_holding_changes_stake_in_one_act_and_keeps_its_costs`,
  `test_a_legacy_mixed_holding_can_be_put_right_one_record_at_a_time`,
  `test_two_presses_racing_for_the_same_records_both_get_the_one_holding`,
  `test_a_member_stake_cannot_change_while_it_is_in_a_holding`.

## Model

Three additive owner-scoped tables, created by `web360.ensure_schema` like every
other W360 table:

| Table | Holds |
|---|---|
| `combined_properties` | id, owner, name, note, timestamps |
| `combined_property_members` | `parcel_id` XOR `property_id`, parent, sort |
| `combined_property_expenses` | the holding's own ledger rows |

Two things are load-bearing in the DDL:

- **`parcel_id` XOR `property_id`**, each a real foreign key with
  `ON DELETE CASCADE`, rather than a polymorphic `(kind, id)` pair. That is what
  makes rule 7 the database's job instead of a sweep somebody has to remember —
  a membership row can never point at a record that opens nothing.
- **Two partial unique indexes** on `(owner_user_id, parcel_id)` and
  `(owner_user_id, property_id)`. They are rule 2, enforced where a race cannot
  get past it; the resolver checks first so the owner gets a sentence rather
  than an error, and the index arbitrates two tabs pressing Combine at once.

The expenses table is separate from `land_expenses` on purpose. Root
`Query.landExpenses` returns every row an owner has without restricting
`entity_type`, and native iOS reads that contract — so a combined cost written
there would be read by an older build as an ordinary record expense and counted
twice.

## API — `Query.web` / `Mutation.web`

Reads: `combinedProperties`, `combinedProperty(id)`, `combinedPapers(id)`,
`combinedFmb(id)`, `combinedExpenses(id, year)`. The existing `orders` read
gained an optional `combinedId` filter rather than growing a second kind of
order: a patta copy is issued for a survey number, not for whatever the owner
calls the group.

Writes: `createCombinedProperty(name, recordIds, note)`,
`updateCombinedProperty(id, name, note)`, `setCombinedMembers(id, recordIds)`,
`deleteCombinedProperty(id)`, `saveCombinedExpense(...)`,
`deleteCombinedExpense(expenseId)`.

Membership is replaced **whole**, not added and removed row by row: the owner is
looking at a list of ticked records and pressing Save once, and validating the
whole desired set means a refusal leaves the holding exactly as it was instead of
half-changed. Every operation derives the owner from the gateway-injected
identity, resolves the parent by `(id, owner_user_id)`, and intersects membership
with `_cards` — so an id belonging to somebody else is answered exactly like one
that does not exist.

Every change is audited against the aggregate with `resource_type =
'combined_property'`. The envelope carries the holding's name and a member
COUNT, never which records are in it.

## The combined map

`combinedFmb` draws each member's saved outline **as its own record filed it**.
Nothing is unioned. The boundary between two adjoining members stays on the map,
because it is a real boundary between two real survey numbers; one continuous
shape around the pair would be a fourth boundary nobody surveyed, and the moment
it is drawn somebody will print it and take it to an office.

How the outlines lie against each other is **measured**, in
`services/api/src/combined_geometry.py` — a pure module with no database and no
clock, so the arithmetic can be pinned in a test:

- corners are compared in a **local metre plane** centred on the group, not in
  degrees: a degree of longitude is not a degree of latitude, and these outlines
  come from different sources at different accuracies;
- a ring is accepted **whole or not at all**, on the same grounds as
  `fmb_geometry.to_geojson_ring` — nine good corners and one in the Gulf of
  Guinea draws convincingly and is wrong;
- `adjoining` needs the outlines within 3 m of each other with at least 6 m of
  parallel run. The 3 m is deliberately looser than the 0.2 m the single-village
  cadastral mesh uses in `villageGeom.ts`: two boundaries traced by different
  people on different days disagree by a metre or two on the same wall;
- `corner` is contact without that run, because a corner is not a shared
  boundary — otherwise every parcel at a four-way junction would adjoin every
  other;
- `overlapping` needs one outline to reach 1.5 m inside the other. Below that it
  is two tracings of the same edge. An overlap is reported and never resolved:
  the sources disagree and a person has to look;
- `apart` reports the gap in metres.

Connected pieces are computed over the whole set, not consecutive list entries:
A–B and B–C is one piece of ground, and a fourth parcel on its own is a second.

Every sentence on that screen is a statement about the coordinates on file, and
the caption says so — including the words "Not a merged or official FMB", which
must stay on the screen somebody might screenshot. A member whose sheet is a
photograph or a PDF with no corner table has no coordinates to place; it is named
with its sheet to open rather than left as a silent gap in the picture.

### Joint FMB (added 28/09/2026 at the owner's request)

A survey office often issues one sketch covering several adjoining survey
numbers. **Add joint FMB**, in the Combined map section header, uploads that
sheet once (`uploadToDrive`) and calls `addJointFmb(combinedId, fileRef, name,
mimeType, sizeBytes, recordIds)`. The server:

- refuses unless the holding is the caller's, every `recordIds` entry is a
  current member, and at least two are chosen (default: all members);
- writes one `documents` row **per covered member** — shelf `map`, the same
  `file_ref`, subtitle "Joint FMB · also covers …" — all sharing a new
  `documents.joint_fmb_id` (`''` means an ordinary paper). The file is stored
  once; each copy is an ordinary paper on its own record, so `_fmb_sheet`,
  Documents and share links work unchanged;
- does **not** run the paid FMB reader: one corner table read off a joint
  sheet belongs to no single survey;
- audits `add_paper` on each member and `add_joint_fmb` on the holding.

`combinedFmb` returns `jointSheets` (one entry per `joint_fmb_id`, listing only
current members' copies) and `sheetJoint` on each shape. `deleteJointFmb(jointId)`
unfiles every copy and its share links and leaves the stored bytes, like
`deletePaper`; one copy can still be removed from a single record. A member taken
out of the holding keeps its copy.

**Georeferenced sheets.** A GeoPDF (QGIS/ArcGIS export) has no corner table:
its survey lines are vector paths and the page is tied to the ground by an ISO
32000 viewport (`/VP` → `/Measure /Subtype /GEO`, `GPTS`/`LPTS`).
`@pattadar/core` `readGeoPdf` reads it **in the browser** — no upload to the
reader, no cost — by fitting the viewport's page→lat/lon transform, collecting
stroked straight segments per line style, closing them into faces, and dropping
page furniture (level-and-plumb rectangles, faces outside the viewport). It
supports classic objects with Flate or unfiltered page streams; object streams,
form XObjects and curved lines yield no outlines rather than a guess. The labels
on such sheets are drawn glyphs, so the program cannot tell which face is which
survey: `JointOutlinesDialog` shows the numbered outlines with their measured
acres, pre-fills a survey only when its recorded acreage is within 10 %, and
saves only the outlines the owner assigns, each through the ordinary
`setBoundary` (replacing an existing one is flagged). It runs after **Add joint
FMB** and from **Place outlines** on a filed joint sheet. The map's "Not a merged or official FMB"
caption is about the drawn outlines and is unchanged: the joint sheet is the
office's document, shown as a paper, never drawn as a unioned outline.

Only pairs that MEET earn a panel. A shared edge, a corner or an overlap is a
fact about where the land touches, and an overlap is something somebody has to
act on. A measured gap is not: it goes in the caption, which for two outlines
names the distance exactly. A panel whose single row read "About 9.5 km apart ·
Apart" was a heading and a capsule repeating what the caption already said.

**One map, with the selected measurements beside it.** The holding is one
picture, so every selected survey is drawn in one frame even when the land is
miles apart. Each outline uses the record Location map's surveyed treatment —
the orange boundary, corner letters and side-length labels — rather than the
portfolio map's green status polygon. Which panel sits beside it depends on how
many surveys are shown; there is no second map, bottom measurements block, or
stack of survey cards. On desktop the map and its scrollable measurement rail
fill the page's remaining height together; they do not stop at a fixed minimum
and leave an empty band below. Narrow screens keep a usable viewport-height map
and stack the rail underneath.

Which surveys are on the map is chosen from a **multi-select dropdown** in the
section header's actions — where a record's own screen puts "Order a service" —
not from checkboxes in the rail, which would compete with the measurements
beside the map. Every survey is ticked to start with, so the map opens showing
the whole holding; the dropdown stays open as you tick and has an "All N" row.

The rail then depends on the selection:

- **One survey** — the same shared Measurements card used by Record Location:
  its card shell and title, Metres / Feet control, Sides / Around / Area / On
  record `KV`, canonical area formatting and comparison band, and the full Side
  / Length / Direction table. The record screen's generic "Approximate
  measurements from the saved outline" sentence alone is hidden here, as
  explicitly requested; no second version of the panel is maintained.
- **More than one** — a single AGGREGATE panel: Surveys / Sides / Around, each
  summed / Measured / On record, then the surveys as a list to zoom to. A stack
  of full side tables is a wall nobody reads. There is no summed area band —
  each survey can be a fraction of a per cent out while the sum lands on the
  register, so a combined percentage would hide which survey is wrong; that is
  what a survey's own panel is for. "On record" is summed only when every
  selected survey is measured in acres.

In aggregate mode, clicking a survey row zooms the shared map to it. The three
comparison bands in single-survey mode are the record boundary screen's own: within 5% is as
close as tracing gets, up to 25% is worth a look, and beyond that the outline is
too far off to be tracing error. `comparable` is false — and the recorded figure
shown as the raw extent label instead — when a member is not measured in acres,
because a flat's built-up square feet are not land area.

The rail scrolls rather than cutting off a long side table. There is no
invented outer holding perimeter: adding two perimeters counts a shared wall
twice, so aggregate mode labels that value "Around, each summed". Its measured
and on-record areas are sums of the selected surveys, with On record shown only
when every selected extent is comparable.

## Screens

> Renamed in code 03/10/2026 (Reddy): `pages/Combined.tsx` → `Holdings.tsx`, `CombinedProperty.tsx` → `Holding.tsx`, `Combined{Actions,Ledger,Fmb}.tsx` → `Holding*`, `combinedList.ts` → `holdingList.ts`; routes `/app/holdings[/:id]`, old `/app/combined…` links redirect (`w360/holdingPath.ts`); e2e specs `27-holding-map`, `28-holding-overview`, `29-holdings-list`, e2e-web360 `holdings.spec.ts`, `ux-record-holding.spec.ts`. GraphQL/API/tables keep `combined`. The paths below are as written on 25/09/2026.

`/app/combined` lists the holdings with the same page chrome as Properties,
composed from the same `apps/web/src/w360/ui.tsx` components:

- `PageHead` with the eyebrow "Several properties held as one", the title
  **Holdings**, an ⓘ saying where holdings are made, and a summary line over
  the rows shown ("2 holdings · 62.86 ac · 400 Sq.yd · ₹… valued"). Acres, Sq.yd and Sq.ft are separate
  figures, never one sum.
- Head actions: **Export** (CSV of the shown rows through `downloadCsv`) and
  **New holding**, a link to `/app/properties?combine=1`. There Properties
  shows a dismissable hint ("Select two or more properties, then choose
  Combine to make a holding.") and raises the card checkboxes; dismissing it
  removes only `combine` from the URL. There is still no second
  creation path: a holding is made OF records, so it is made where the records
  are, and **Combine…** on the Properties selection bar is the one place a set
  of records is already chosen.
- `FacetFilter` with three groups built from the list — Records (all present /
  missing a record), Boundaries (all / some missing / none on map) and Land
  (farmland / plots / built area) — written to `?complete=`, `?ground=` and
  `?land=`, the "N of M shown" tally, and the shared `SortCycle` chip: Newest
  first (the server order), Name A–Z, Largest extent, Most records, Recently
  updated. The rules live in `apps/web/src/w360/combinedList.ts`.
- On an account with none, only the Empty state and its "Go to Properties"
  (the same `?combine=1` hand-off). Filtered to nothing, the `emptypanel`
  says "No holdings match these filters", a note that the list is only
  narrowed ("All 3 holdings are hidden by the filters above."), and
  **Clear filters**, the same structure as Properties.

Still absent: a Grid/List/Map toggle (the list query carries no geometry — it
is per view in `combinedFmb` — and there is no combined card for a grid) and a
district/mandal facet (`placeLine` is a compressed display string; a Place facet
needs structured places on `Combined`, a backend contract change).

The visible noun lives in `HOLDING_WORD` (`ui.tsx`), which also names the CSV
(`holdings-YYYY-MM-DD.csv`). A rename also has to touch the prose in
`pages/CombinedActions.tsx`, the error copy in `w360/api.ts`, design.md § App
vocabulary, `scripts/vocab-tests.ts` and the e2e strings.
Renamed 03/10/2026 (Reddy): the visible noun is Holding/Holdings, superseding
"Combined view". Routes, GraphQL fields and identifiers keep `combined`.

Superseded 03/10/2026 after the owner reported the list did not follow the
list-page standard; it was previously deliberately thin (no faceted rail, no
sort chip, no create button).

`/app/combined/:id` is a frame with its own head and six tabs: Overview,
Surveys, Papers, Combined FMB, Expenses, Services. It is a separate route family
from `records/:id` on purpose. The record shell offers Share, Order a service,
Archive and Delete, and every one of those acts on a parcel or property row; a
holding has none of them, and its Delete means "stop holding these together".
Bolting a mode onto that shell would make both of them about "a record or maybe
not a record".

Everything about a member is edited on the member. Each tab links to the record
rather than growing a second way to change a survey.

## Revision, 28/09/2026

Made within current authority after a heuristic UX audit of the Combined map
tab (evidence: `.local/ux-audits/2026-09-28-w360-combined-map/`). The text above
predates design.md § App vocabulary (26/09/2026) where it calls members
"surveys"; the frame's tabs are now Overview, Records, Documents, Combined map,
Costs and Services.

- **Words.** The map tab and the joint FMB dialogs call members **records** and
  what the map draws **boundaries**: "Which boundaries to show", "All 2
  boundaries", "2 boundaries shown", "Add to records". The caption says "saved
  boundaries", not "surveyed outlines"; "Not a merged or official FMB" is
  unchanged.
- **Full screen.** The map stage has a "View full screen" chip: the browser's
  own full screen, through the same `useFullscreen` hook (`ui.tsx`) as the photo
  stage. Esc exits, the view is framed again, and the chip is not drawn where
  the browser cannot offer it.
- **Clicks.** A second click on an outline zooms to it, like a rail row. "Its
  boundary" in the pick panel is the way to the record's own map.
- **Figures.** The pick panel labels its figure "On record" and each rail row
  "Measured".
- **Map text.** Where two outlines share a corner, each corner letter steps into
  its own outline so both can be read, and names step around letters and
  lengths.
- **Stacking.** A live map is its own stacking context, so a scrolled map no
  longer paints over the sticky top bar.
- **Narrow screens.** At 1200px and below the rail grows with the page instead
  of scrolling inside itself, and picking a record in it brings the map into
  view. On desktop the rail still scrolls beside the map.
- **Joint FMB row.** Open sheet (outlined), Place outlines (text), and Remove
  behind the row's ⋮ in the danger tone; Remove still asks first.
- **Frame.** On a phone the head's ⋮ stays on the title row, menus open inside
  the window, and the current tab is scrolled into view.

Open for Reddy: telling each count once on this tab (the tab, the caption, the
dropdown and the rail heading all count the boundaries), and a way to edit a
filed joint FMB's records and name, which needs a new mutation.

## Evidence

- `services/api/tests/test_combined_geometry.py` — the relation arithmetic,
  including two thirty-acre squares sharing an edge, a metre of digitising slop,
  a real gap, corner-only contact, a material overlap, one long wall facing two
  shorter ones, whole-or-nothing rings, and connected pieces.
- `services/api/tests/test_combined_property.py` — real PostgreSQL: the
  membership rules, cross-owner isolation, the one-holding-per-record indexes,
  whole-list replacement, deletion keeping every record, a deleted member leaving
  the holding incomplete rather than silent, expense scope, the gathered papers,
  the measured map, joint FMB copies (refusals, one flagged copy per covered
  survey, owner-only removal of every copy), and the audit trail.
- `tests/e2e-web360/specs/combined.spec.ts` — the browser: create from a
  selection, the totals, the refusals, a cost recorded/read back/removed,
  gathered papers and services, two outlines drawn as two, membership changed,
  and ungrouping with both records intact.

## Not done, on purpose

- Papers and services are read-only gatherings. Filing a paper needs an
  unambiguous member, which is the record's own screen — except a joint FMB,
  whose members are ticked explicitly and each receive their own copy.
- No native iOS or Expo surface. This is `Query.web`, so parity is NOTE.
- A combined property cannot be shared as a unit; sharing is per paper, on the
  record.
