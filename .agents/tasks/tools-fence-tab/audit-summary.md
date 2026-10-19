# Tools (/app/tools) heuristic UX audit, 01/10/2026

Board: `.local/ux-audits/2026-10-01-tools/board.html` and `board.png` (evidence in `evidence/`).
Revision 8c6a2d4 + working tree (w360.css has unrelated uncommitted edits). Standard: design.md.

Evidence method: temporary sealed capture through `tests/e2e-app` (projects `app` 1512×950 and
`phone` 390) against the user's dev server on :5173. SRO rows were seeded in the importer's shape
(public codes from `services/api/data/sro_offices.csv`, generic names, three empty columns) in the
resolver's order. The spec and its pw-output were deleted; the `tests/` git-status hash matched
before and after. The user's screenshot (revision unknown) was used for the observations only.

## Findings

1. Eyebrow "Account" on a page whose rail group is Help & resources; PageHead says a top-level page
   has no eyebrow. Tools.tsx:714, Shell.tsx:422-425, design.md:371-375, ui.tsx:403-407.
2. Sub line "SRO finder · Stamp duty · Guideline values · Area" repeats 4 of 4 tab labels.
   Tools.tsx:715-717 vs 698-703.
3. DR zone, District and Mandal are blank in all 297 rows (891 empty cells). The importer writes ""
   (services/api/src/main.py:5617-5624) and the CSV has only SRO_CODE, SRO_NAME. Rendering:
   Tools.tsx:198-210. Rule: design.md § Property tabs "missing reads as missing" (design.md:403).
4. The search placeholder ("office, district, mandal") and the no-match hint ("Try a district or
   mandal name — Guntur, Gannavaram, Kurnool") promise matches that cannot happen while those
   columns are empty. Tools.tsx:159, 180, 187-189.
5. Codes sort as text: 208 three-digit and 89 four-digit codes, so 101 falls between 1009 and 1010.
   `ORDER BY code` on a TEXT column, main.py:2051 and 6539. The client does not re-sort.
6. 297 rows, no paging. Page height is 13,782 px at 1512 (14.5 viewports) and 25,172 px at 390
   (38 viewports). 293 of 297 names are in capitals, set bold (Tools.tsx:206).
7. The search is centred (x 588, 576 px wide) while the table starts at x 305
   (w360.css:202-205 `justify-self: center`). It also draws two frames: `.w360 input[type='text']`
   (w360.css:2724-2727) ties on specificity with `.search input { border: 0 }` (w360.css:215) and
   wins because it comes later. Properties avoids this with type="search" (Properties.tsx:1163).
8. Fencing sits 2 tab levels deep (Tools › Area calculator › Fencing, Tools.tsx:592-623 and 678).
   The app has two fence calculators. Tools works in ft with 8 ft spacing, 3 strands and the blunt
   `fenceEstimate`. FenceStudio on Cadastral maps works in m with 3 m spacing, 4 strands,
   `fencePlan`, gates, a print and a service-order hand-off (FenceStudio.tsx:145-183).
   landcalc.ts:179-185 says `fenceEstimate` undercounts corner posts.
9. With an empty perimeter the strip shows Posts 0 and Wire length 0 next to Est. cost "—".
   Tools.tsx:615-619; design.md:403-405; ux-guards CL-563.
10. Market value filters with 3 native selects (Tools.tsx:411-421), but list pages are meant to use
    FacetFilter (design.md:527-531).

Beyond the board's 10 findings:

- At 390 the SRO table (345 px) overflows its 308 px card content, so Mandal is clipped. The
  `.scroll-x` has no `edgefade` (Tools.tsx:191), and office names wrap to 3 lines.
- The Area calculator card has a second page-local tab bar. shared-components-tests.ts:141 allows
  Tools `tabs: 1`, so a further tablist must come from a TabStrip lifted into ui.tsx.

## Drift (reported separately)

- design.md:371-375 puts Tools in Help & resources and lists Account as Profile, Privacy & your
  data, Activity. Tools.tsx:714 uses the eyebrow "Account".
- w360.css:215 intends a frameless `.search input`. w360.css:2724 restores the border for every
  type="text" search.
- landcalc.ts:179-185 calls `fenceEstimate` the older, blunter formula. Tools.tsx:598 (and
  ParcelDetailPage.tsx:310) still use it.

## Classification

Within current authority: 1 (drop the eyebrow), 5 (numeric code order), 7 (left-align the search
with one frame), 9 ("—" until there is a perimeter).

Reddy's decision:
- 2: the sub-line copy.
- 3 and 4: hide the empty SRO columns and narrow the placeholder and hint, or load the
  SRO-to-district/mandal data through reference-data-ingestion.
- 6: paging or a cap, and the case of the names.
- 8: Fencing as a top-level Tools tab, which the user asked for. Open questions: which calculator
  survives (fencePlan vs fenceEstimate), which unit (m or ft) and defaults, whether FenceStudio's
  ring/map, gates, print and service-order hand-off come along, and what happens to the Area
  calculator's Fencing sub-tab and its "Use in Fencing →" perimeter hand-off (Tools.tsx:500-510,
  669-672).
- 10: FacetFilter, or a recorded exception in design.md § App-surface rules.

## Screenshot observations

1. Empty DR zone, District and Mandal: confirmed (source and capture).
2. Lexical sort (1009, 101, 1010): confirmed.
3. Search centred rather than aligned with the table: confirmed (geometry probe). Also found: a
   double frame.
4. Long unpaginated list (~297 rows) with uppercase names: confirmed (297 rows, 293 of them in
   capitals in the CSV).
5. Stray small empty box near row "1017 PUTTUR": not reproduced in the sealed capture. Source shows
   no element there. It may come from live data or the browser; not verified.
6. Header subtitle duplicates the tab labels: confirmed.
7. Eyebrow "ACCOUNT" while Tools is under Help & resources: confirmed.

## Not verified

Light and High Contrast schemes, loading and failed renders, the stamp-duty result state,
keyboard and screen-reader behaviour, contrast and target sizes (design-system-governance), and
live data beyond the reference CSV.
