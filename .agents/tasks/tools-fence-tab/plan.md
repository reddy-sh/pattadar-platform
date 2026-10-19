# Implementation Plan — Fence calculator tab on W360 Tools (Part 2)

Request (verbatim): "please work on the tools http://localhost:5173/app/tools?tab=sro
do the /heuristic-ux-audit review please and also move the fence calculator to here as well please."
This plan covers only the fence-calculator part. The UX audit runs in parallel
(`.agents/tasks/tools-fence-tab/audit-summary.md`); none of its proposals are
implemented here except as stated under "Audit items" below.

## Decisions (made here, with rationale)

D1. Interpretation of "move": ADD, not move. A new top-level Tools tab
`?tab=fence`, label "Fence calculator", that works standalone from typed side
lengths. The village-map entry point (`VillageMaps.tsx` → `FenceStudio`) stays
exactly as it is: it prices a traced shape, draws it, and can raise a fencing
work request against a record, and none of that exists without a shape and a
record. Deleting it would lose the map view, side-skipping on the map and the
request flow. Tradeoff: there are now two ways in to the same arithmetic. That
is acceptable because both run the same code (D2).

D2. One pricing implementation. FenceStudio's arithmetic (core `fencePlan`
plus the web-side gate/roll/rate sums at FenceStudio.tsx ~L170-L190), the
remembered build/rates (`localStorage` key `w360.fence`), the Step 2 inputs,
the Step 3 bill and the print sheet move into one shared module. FenceStudio
and the new tab both compose it. No figures, defaults (3 m, 4 strands, 1 gate,
3.6 m, 500 m roll), placeholders (250 / 12 / 6000) or copy are changed. The
two entry points share the `w360.fence` key, so rates typed in one show up in
the other. That is the intent of the existing comment ("retyping four figures
every time … stops a tool being used").

D3. The standalone tab is metres only, like FenceStudio's labels ("Post
spacing (m)", "₹ per m of wire"). The shared Step 2/3 fields are in metres, so
a feet/metres switch on the sides alone would mix units. Feet entry is a
follow-up for Reddy.

D4. Standalone Step 1 is a list of side lengths in metres. It starts with four
empty sides lettered A–B, B–C, C–D, D–A via core `cornerLabel`, with "Add a
side" and a per-row remove button (minimum one row). A checkbox "The fence
goes all the way round" is ticked by default and maps to `fencePlan`'s
`closed` option. Unticked, the sides are an open run: one more corner than
sides. That matches the studio's rule that dropping a side opens the run. There
is no per-side skip toggle, because a side you do not fence is simply not
entered.

D5. There is no parcel picker in this change. A shape source does exist
(`useBoundary(recordId)` in `apps/web/src/w360/api.ts`, used by
RecordBoundary/RequestWork). A picker would add authenticated per-record reads
to a screen that today reads only reference data, and it would duplicate what
the map entry already does with the shape in view. It is listed as a follow-up
for Reddy.

D6. The standalone tab never raises a work request (there is no `recordId`).
It reuses FenceStudio's existing no-record branch, which shows Print and the
existing note "File this plot as a property to raise it as work." It adds a
"Clear" action that empties the sides and leaves the remembered rates alone.

D7. The print sheet's date becomes DD/MM/YYYY via core `formatDate` (invariant
6). Today it is `toLocaleDateString('en-IN', { month: 'short' })`, which gives
"05 Oct 2026". This also changes the village-map sheet, which is the point:
both now obey the invariant. No test asserts the old format (checked:
17-villages.spec.ts, crud-360.spec.ts).

D8. The page lede gains one item: "SRO finder · Stamp duty · Guideline values ·
Area · Fencing". The test in 19-sections-legacy.spec.ts that pins the lede and
the tab list is updated with it.

D9. No commit. The working tree already has someone else's uncommitted edits
to `VillageMaps.tsx`, `w360.css`, `17-villages.spec.ts`, `Dashboard.tsx`,
`CombinedProperty.tsx`, `Properties.tsx` and `Vault.tsx` (another task,
`combined-overview-ux-fix`). Committing `w360.css` would sweep them in. The
implementer leaves its changes in the working tree, never reverts or reformats
those foreign hunks, does not edit `VillageMaps.tsx` at all (FenceStudio's
props do not change), and records its evidence in the "Evidence" section at
the end of this file.

## For Reddy to decide (not decided by this plan)

R1. The Area calculator's own "Fencing" sub-tab (`Tools.tsx` `FencingTab`,
using core `fenceEstimate`, feet, posts = ceil(perimeter/spacing)) stays
untouched here. Core's own comment (landcalc.ts ~L179) calls that formula the
"older, blunter version". For 100/80/100/80 m at 3 m it under-orders posts by
2 compared with the new tab. Recommendation: retire that sub-tab and point
"Use in Fencing →" (Plot area / Map area) at the new tab with the sides
pre-filled. Rect gives [L, W, L, W], triangle gives 3 sides, quad gives 4, and
a ring gives `ringSides`. The tradeoff is dropping content and changing tests
(19-sections-legacy L1850-L1950). It is reversible with git. This plan does
not do it.

R2. The new copy is provisional vocabulary: tab label "Fence calculator"
(already used on the map button), "Add a side", "Remove side A–B", "Clear",
"The fence goes all the way round", the validation sentence in item 3 and the
empty-state sentence.

R3. Follow-ups: a parcel picker (D5), feet entry (D3), a deep link from the
village-map calculator into `?tab=fence`, and native iOS parity for a
standalone fence tool (use `sync-ios`; nothing here touches the root schema or
vectors).

## Audit items (Part 1 findings that touch this screen)

- SRO code lexical sort ("1001" listed before "201"). The root cause is the API
  resolver `SELECT * FROM sro_offices ORDER BY code` over a TEXT column
  (`services/api/src/main.py:2051`). The reference CSV has 208 three-digit and
  89 four-digit codes. The root cause is not in web code, so it is not fixed
  here. Report it to Reddy.
- Empty DR ZONE / DISTRICT / MANDAL columns. The root cause is the importer
  inserting `""` for those three columns
  (`services/api/src/main.py:5624`). That is reference data, not web code, so
  it is not fixed here. Report it to Reddy.
- Needs verification during implementation: with five tabs, the Tools tab
  strip may overflow at 390 px. At runtime (step 6) check
  `document.documentElement.scrollWidth <= innerWidth` on `/app/tools?tab=fence`
  at 390. If the page scrolls sideways because of `.tabs`, fix it in
  `w360.css` by letting `.tabs` scroll inside itself, scoped so that only
  Tools changes if the rule is shared. Record the result either way. Do not
  claim it is fine without measuring.
- Do NOT touch `tests/e2e-app/specs/zz-ux-audit-tools.spec.ts`. It is the
  audit step's temporary capture file and that step deletes it.

## Standards that apply

- Compose `apps/web/src/w360/ui.tsx` (`Card`, `Empty`, `num`, `inrFull`,
  `plural`). Do not hand-build `className="card…"`, `.k` cells or `.blank`
  states. `scripts/shared-components-tests.ts` budgets `Tools.tsx` at
  `{ card: 2, cell: 4, tabs: 1 }`, and any new file has a budget of zero.
  Reuse Tools' existing `TabStrip`. Do not add a second `role="tablist"`.
- One font: no `font-family`, and no 500/600/800 weights. Digits use the
  existing `.num` class or `font-variant-numeric: tabular-nums`. Dates are
  DD/MM/YYYY. No new dependencies. Icons come from `@mui/icons-material`
  `*Outlined`, as FenceStudio already uses.

## Steps

- [ ] 1. Extract the shared fence arithmetic into a pure module, and test it.
      Create `apps/web/src/w360/fenceBill.ts` (no React, no ui.tsx import)
      exporting:
      - `type FenceBuild = { spacing; strands; gates; gateWidth; roll; postRate; wireRate; gateRate }`, all strings, as typed in the boxes.
      - `FENCE_DEFAULTS`, the current defaults copied verbatim from FenceStudio (spacing '3', strands '4', gates '1', gateWidth '3.6', roll '500', rates '').
      - `GATE_POSTS = 2`.
      - `fenceBill(keptSideMetres: number[], closed: boolean, b: FenceBuild)`, which returns `{ plan, gateCount, openings, strandCount, rollLength, wireRun, wire, gatePosts, posts, rolls, postCost, wireCost, gateCost, total }`. The formulas are moved byte-for-byte from FenceStudio.tsx (`Math.max(0, Math.round(Number(gates)||0))`, `wireRun = max(0, perimeter - openings)`, `rolls = ceil(wire/roll)`, and so on) and call core `fencePlan`.
      Append checks to `scripts/fence-tests.ts` by importing
      `../apps/web/src/w360/fenceBill`. Cover: 100/80/100/80 with gates 0 gives
      posts 122 and wire 1440. One gate of 3.6 m gives wire (360−3.6)×4 =
      1425.6, posts 124 and rolls ceil(1425.6/500) = 3. Rates 250/12/6000 give
      total = 124×250 + 1425.6×12 + 6000. Non-numeric build fields give 0 and
      do not throw.
      Files: apps/web/src/w360/fenceBill.ts, scripts/fence-tests.ts
      Verify: `bun run scripts/fence-tests.ts` prints `FENCE TESTS PASS`.

- [ ] 2. Lift the build state, the Step 2/3 UI and the print sheet out of
      FenceStudio into a shared component file, then make FenceStudio compose
      it with no change in behaviour.
      Create `apps/web/src/w360/FenceBill.tsx` exporting:
      - `useFenceBuild()`, which holds the `remembered()` / `KEPT='w360.fence'` load and save effect moved from FenceStudio and returns `[build, set(field, value)]`.
      - `FenceBuildFields({ build, set })`, which is Step 2 "What you are fencing it with" plus "Your rates" with the same labels and placeholders. Input ids come from `useId()` rather than the fixed `fs-*` ids. Labels stay identical, because tests use `getByLabel('₹ per post')` and similar.
      - `FenceBillTable({ bill, build })`, which is Step 3's `.fs-bill` table, `.fs-total`, "Enter your rates to price it." and "Materials only, excluding labour.".
      - `FenceSheet({ title, subtitle, sides, dropped, ring?, bill, build })`, which is the `.fs-sheet`, with the `FencePlan` SVG drawn only when `ring` has ≥3 points. Its stamp uses `formatDate(new Date())` from `@pattadar/core` (D7), computed once with `useState`.
      Move `FencePlan`, `sideMetres` and the local `plural` with it, or use
      ui.tsx `plural`, which has the same output for these words. Rewrite
      `FenceStudio.tsx` to use these. It keeps the map, Step 1 side toggles,
      `raise()` and the request buttons, its own Print, and the bar. Its props
      and its DOM classes (`.fs`, `.fs-bar`, `.fs-body`, `.fs-panel`,
      `.fs-side`, `.fs-bill`, `.fs-sheet`, `svg.fs-plan`) are unchanged. Do not
      edit `VillageMaps.tsx`.
      Files: apps/web/src/w360/FenceBill.tsx (new), apps/web/src/w360/FenceStudio.tsx
      Verify: `cd apps/web && bun run typecheck` exits 0. With the sealed
      harness up (step 6 setup), `cd tests/e2e-app && APP_WEB_URL=http://localhost:5173 bunx playwright test specs/17-villages.spec.ts --project=app -g "fence"`
      passes. That covers the opening, the bill, rates, print and Escape focus
      return.

- [ ] 3. Add the standalone "Fence calculator" tab to Tools.
      In `apps/web/src/w360/pages/Tools.tsx`:
      - Extend `ToolTab` / `TOOL_TABS` with `{ id: 'fence', label: 'Fence calculator' }`, last in the list.
      - Render `<FenceTool />` for `tab === 'fence'`.
      - Update the lede (D8) and the file header comment to list five tools.
      `FenceTool` is a function in Tools.tsx, matching how the other four tools
      are written. It renders `div.fs-tool`, which contains a `div.two` with:
      - Left: `<Card title="Fence calculator">`. Step 1 eyebrow "Step 1 · What you are fencing", the side rows (D4) using Tools' `NumField` per side with label "Side A–B (m)", and a remove button carrying `aria-label="Remove side A–B"` and `CloseOutlined`. Then "Add a side", the closed checkbox, the note "{n} sides · **X m** to fence" (same wording pattern as the studio), and `<FenceBuildFields>`.
      - Right: `<Card title="What it comes to">` with `<FenceBillTable>` and a row of buttons: "Print for the supplier" (`window.print()`, with `PrintOutlined`) and "Clear".
      - `<FenceSheet title="Fence estimate" …>`, a sibling of `.two`, with no ring.
      Validation and failure path: a side box that is non-empty but not a
      number > 0 gets `aria-invalid` and is excluded. While any side is
      invalid, one `<p className="note" role="alert" style={{ color: 'var(--w-danger)' }}>`
      reads "Enter each side as a length in metres, more than 0." (the same
      alert pattern as StampDutyTool). When no valid side remains, the right
      card shows `<Empty title="Enter the length of each side to price a fence" />`
      in place of the bill, and Print is disabled.
      Files: apps/web/src/w360/pages/Tools.tsx
      Verify: `cd apps/web && bun run typecheck` exits 0.
      `bun run scripts/shared-components-tests.ts` passes with the `Tools.tsx`
      budget unchanged (Cards come from ui.tsx, and no `.k` cells or tablist
      are added).

- [ ] 4. Add styles and print rules for the standalone tab.
      In `apps/web/src/w360/w360.css`, add the following to the "Fence
      calculator" section (~L4430-L4505). Edit only your own lines and leave
      the existing uncommitted hunks near L1056 and L4247 alone.
      - `.w360 .fs-tool .fs-siderow`: a grid with the input taking the width and the remove button `auto`.
      - The `.fs-in` two-across grid is reused as-is for Step 2.
      - In the existing `@media print` block: `.w360 .fs-tool > :not(.fs-sheet) { display: none !important; }` and `.w360 main:has(.fs-tool) > .tabs, .w360 main:has(.fs-tool) .pagehead .lede { display: none !important; }`. The sheet is already `display: block` in print.
      Use tokens only (`var(--space-*)`, `var(--w-*)`). No font-family and no
      new weights.
      Files: apps/web/src/w360/w360.css
      Verify: `bun run scripts/typography-tests.ts`, `bun run scripts/a11y-web-tests.ts` and `bun run scripts/contrast-tests.ts` pass.

- [ ] 5. Add sealed e2e scenarios for the tab and update the pinned Tools
      tests.
      In `tests/e2e-app/specs/19-sections-legacy.spec.ts`, inside
      `test.describe('the tools, drawn in this app')`:
      - Update the "all four tools" test. Rename it to five tools, add 'Fence calculator' to the tab list and assert the new lede.
      - New: `?tab=fence` selects the tab and shows h2 "Fence calculator", and `world.escapes()` is `[]` (no API reads).
      - New end to end: fill sides 100/80/100/80 and Gates 0, then assert in `.fs-bill` Corner posts 4, Line posts 118, Posts 122 and Wire 1,440 m. Fill ₹ per post 250 and ₹ per m of wire 12, then assert Materials ₹47,780.
      - New, invalid input: fill a side with `-5` and assert that the alert text shows, that the box has `aria-invalid="true"`, and, with every side cleared, that the Empty text shows and Print is disabled.
      - New, print and clear: use the `addInitScript` print stub pattern from `17-villages.spec.ts` L177-L193 (`__printed`). Click "Print for the supplier" and assert it was counted once. Assert `.fs-sheet` contains "Fence estimate", "A–B" and a `\d{2}/\d{2}/\d{4}` date, and that `svg.fs-plan` has count 0. Click Clear and assert the sides are empty and the Empty state is back.
      - New, tagged `@phone` or placed where the phone project runs it (match how existing 390 scenarios are tagged in this suite): on `?tab=fence`, `scrollWidth <= innerWidth`.
      Files: tests/e2e-app/specs/19-sections-legacy.spec.ts
      Verify: `cd tests/e2e-app && APP_WEB_URL=http://localhost:5173 bunx playwright test specs/19-sections-legacy.spec.ts -g "tools|fence|Fence" --project=app --project=phone`
      passes. Note: the existing test asserting "Convert between Indian land
      units, measure a plot, estimate fencing" may already fail, because the
      code's note says "Unit conversion, plot measurement, fencing estimates
      and boundary area.". If it does, record it as pre-existing and do not
      change that copy here.

- [ ] 6. Full verification, visual checks and evidence.
      Setup: the sealed suite drives an already-running dev server and answers
      every `/api` call from fixtures, so no real data is read and you do not
      sign in to a real account. If `:5173` is not serving, start
      `cd apps/web && bun run dev` in the background, note that you started
      it, and stop it at the end. Run all of the following and record the
      results in the Evidence section:
      - `cd apps/web && bun run typecheck` and `cd apps/web && bun run build`
      - `for f in scripts/*-tests.ts; do echo "== $f"; bun run "$f" || echo "FAILED $f"; done` (includes typography-tests, shared-components-tests, fence-tests, a11y-web-tests, contrast-tests)
      - `bun run scripts/icon-guard.ts` and `bun run scripts/ux-guards.ts`
      - The sealed e2e for the Tools describe block (step 5 command) and the village-map fence tests (step 2 command), plus `bunx playwright test specs/01-shell.spec.ts specs/21-routing.spec.ts` (both pin `/app/tools`).
      - Visual: run a throwaway sealed capture (a temp spec copied from the `zz-ux-audit-tools.spec.ts` pattern but under a new name) that screenshots `/app/tools?tab=fence` at 1512 (project app) and 390 (project phone): empty, filled 100/80/100/80 with rates, and invalid. Inspect the PNGs. Check that every digit column is aligned, nothing clips or scrolls sideways, the two cards stack at 390, and the tab strip result is recorded as described under "Audit items". Also screenshot the village-map calculator from the 17-villages `openFence` flow to confirm that it still opens and that its sheet date is DD/MM/YYYY. Delete the temp spec, the PNGs and any `test-results/` output it produced when done.
      - e2e-web360 (`crud-360.spec.ts` fence tests and `map-village.spec.ts`) needs its own API, a database and a build. Run it only if that environment is already available locally. Otherwise write "not run" with the reason.
      Change-governance notes to record:
      - Docs: update the Tools tool list in the `Tools.tsx` header comment. Add one line to `docs/specs/2026-08-15-web-360-design.md` next to "Fencing is a tool, not a card" (~L564) saying the same studio arithmetic is also reachable standalone at `/app/tools?tab=fence`, and why (D1/D2).
      - Architecture: no new route, data flow or trust boundary. The tab is pure client arithmetic plus `localStorage`.
      - Security/privacy: no new reads or writes and no PII.
      - Cleanup: background processes and temp files.
      Files: this plan's Evidence section, docs/specs/2026-08-15-web-360-design.md
      Verify: every command above has its exit status or pass/fail line pasted below. Any failure is either fixed or shown, by a baseline run on the unchanged files, to be pre-existing.

## Evidence (implementer fills in; reviewer reads this rather than re-running)

Deviation from the plan: the shared component file is `FenceParts.tsx`, not
`FenceBill.tsx`. macOS is case-insensitive, and `FenceBill.tsx` beside
`fenceBill.ts` made tsc fail with TS1149 (both resolve as `./fenceBill`).
`FenceBuildFields` keeps the studio's fixed ids (`fs-post-rate`, …) through an
`idBase` prop that defaults to `fs`, because `e2e-web360/crud-360.spec.ts`
selects them by id. The Tools tab passes `idBase="fence-tool"`.

| Check | Command | Result |
|---|---|---|
| Web typecheck | `cd apps/web && bun run typecheck` | exit 0 (re-run after the final edit) |
| Web build | `cd apps/web && bun run build` | exit 0. Built in 1.95 s; `FenceParts` and `Tools` chunks emitted |
| Guard loop | `scripts/*-tests.ts` | PASS: a11y-web, area, cache-eviction, contrast-helper, contrast, fence, geo, hooks, lifecycle, plural, provenance, screening, shared-components (Tools budget unchanged), url-scheme, village, vocab. FAIL: typography TY-5 on `apps/university/src/styles.css:1488/1520/1538` (`font-weight: 800`). That file is unmodified at HEAD 8c6a2d4, so the failure was already there; this change did not touch it |
| Icon guard | `bun run scripts/icon-guard.ts` | ICON GUARD PASSES |
| UX guards | `bun run scripts/ux-guards.ts` | UX GUARDS PASS |
| Fence unit tests | `bun run scripts/fence-tests.ts` | FENCE TESTS PASS (fenceBill: 122/1440 with no gate; 1425.6 m, 124 posts, 3 rolls with one gate; total 124×250+1425.6×12+6000; junk build gives 0 and does not throw) |
| Sealed Tools e2e (app) | `bunx playwright test specs/19-sections-legacy.spec.ts --project=app -g "tools, drawn"` | 36 passed, 2 failed. Both failures are copy that was already wrong and that this change does not touch: "These are reference guideline values…" (the code says "Guideline values from AP Registration & Stamps…") and "Convert between Indian land units…" (the code says "Unit conversion, plot measurement…"); both strings are unchanged at HEAD. All 6 new or updated fence/lede tests pass |
| Sealed Tools e2e (phone) | `--project=phone --project=app -g "fits the width of a phone"` | 2 passed |
| Sealed village-map fence e2e | `bunx playwright test specs/17-villages.spec.ts --project=app -g "fence\|Fence"` | 9 passed (opening, bill, rates, print, request paths, Escape focus, @phone layout) |
| Shell/routing e2e | 01-shell + 21-routing, project app | 80 passed, 76 failed. None of the failures is a Tools test. They come from console 400/503 errors and missing Dashboard rail links. A baseline with `Tools.tsx` and `FenceStudio.tsx` reverted to HEAD fails the same way (01-shell:119, same 400 error), so the failures were already there and come from the environment or the foreign working-tree edits |
| e2e-web360 fence | crud-360 / map-village | Not run: needs its own API, DB and build, which are not available locally. The ids it selects (`#fs-post-rate`, `#fs-spacing`, …) are kept |
| Visual 1512 / 390 | temp sealed capture, project app and phone | Five tabs, "Fence calculator" selected. At 1512 the two cards sit side by side; at 390 they stack. Digits are tabular. 100/80/100/80 with rates 250/12/6000 gives 124 posts, 1,425.6 m, 3 rolls, ₹54,107. Invalid −5: alert shown, side left out ("3 sides · 260.0 m"). Print media: only the sheet, the h1 and the eyebrow remain; the form, tabs and lede are hidden; dated 02/10/2026; no plan SVG |
| Tab strip overflow at 390 | measured | `documentElement.scrollWidth` 390 = `innerWidth` 390 (no sideways page scroll). `.tabs` is 564 px of content in a 358 px box and already scrolls inside itself (`overflow-x: auto`, w360.css:879), so no CSS change. Note: at 390 the selected last tab starts off-screen inside the strip (it needs a scroll-into-view; not fixed here, for Reddy) |
| Village-map calculator still opens; sheet date DD/MM/YYYY | temp copy of 17-villages + `openFence('215')` | Opens; sheet line "Plot 215 · KATRAGUNTA · 02/10/2026"; `svg.fs-plan` present |
| Processes started / stopped; temp files removed | | No dev server started (used the user's :5173). The Playwright runs ran to completion. Deleted: `specs/zz-tmp-fence-capture.spec.ts`, `specs/zz-tmp-vm-fence.spec.ts`, /tmp PNGs and logs. Left in place because ownership is shared or uncertain: gitignored `tests/e2e-app/test-results/`, `playwright-report/`, `results.json` (rewritten by these runs) and `apps/web/dist/` (rewritten by the build) |

### Iteration 2: review.json findings

| Finding | Fix |
|---|---|
| print-sheet-relettered (blocking) | `FenceSheet` takes an optional `names?: string[]`. The Tools tab passes each kept side's on-screen name (`keptNames`), so with A–B=100, B–C blank, C–D=100 and D–A=80 the sheet prints A–B/C–D/D–A. The studio passes no names and letters as before. New e2e: "a side left blank keeps the other sides under the letters they have on screen" |
| print-while-invalid (blocking) | Print is `disabled={kept.length === 0 \|\| invalid}`, where `invalid = bad.some(Boolean)`. The invalid-input e2e now asserts Print is disabled while −5 is showing and enabled again once the side is corrected |
| sheet-title-duplicated | `FenceSheet.title` is optional and the header line is `[title, subtitle, stamp].filter(Boolean).join(' · ')`. The Tools tab passes no title, so the line is the date alone. The print e2e asserts `^dd/mm/yyyy$`. The studio line is unchanged ("Plot 215 · KATRAGUNTA · date"). No new copy |
| two-fencing-tools | Left for Reddy as instructed (plan R1, and the 390 px tab-strip scroll note) |

| Check (iteration 2) | Result |
|---|---|
| `cd apps/web && bun run typecheck` | exit 0 |
| `cd apps/web && bun run build` | exit 0 |
| `scripts/*-tests.ts` loop | All PASS (incl. shared-components, fence, a11y-web, contrast) except typography TY-5 on unmodified `apps/university/src/styles.css` (pre-existing, same as iteration 1) |
| icon-guard / ux-guards | ICON GUARD PASSES / UX GUARDS PASS |
| 19-sections-legacy, app, the seven fence/lede tests | 7 passed (the new blank-row sheet test included) |
| 19-sections-legacy, `-g "fence\|Fence\|five tools"`, app + phone | 6 passed (incl. @phone width on both projects) |
| 17-villages, app, `-g "fence\|Fence"` | 9 passed (the village-map calculator still opens, and the bill, print, request paths and Escape all work) |
| Cleanup | No processes started apart from Playwright runs that ran to completion; /tmp logs deleted. No temp specs were created in this iteration. Visual capture was not repeated: the only change on screen is the Print button's disabled state, which the e2e asserts |

Audit items: the SRO lexical sort and the empty DR zone/district/mandal columns
were NOT fixed. Their root causes are in `services/api` (ORDER BY on a TEXT
column; the importer writing ""), not in web code.
