# Verification: "Combined views" renamed to "Holdings", plus two UX follow-ups (web)

This is iteration 1: `review.json` did not exist. Nothing was staged or committed (`git diff --cached --quiet` → rc 0).

## What changed

### Rename (visible copy only)
- **`apps/web/src/w360/ui.tsx`:** `COMBINED_WORD` is now `HOLDING_WORD = { one: 'Holding', many: 'Holdings', eyebrow: 'Several properties held as one' }`. Its doc comment records Reddy's approval (03/10/2026) and the CSV stem.
- **Importers moved to `HOLDING_WORD`:**
  - `Shell.tsx` (rail)
  - `combinedList.ts` (summary line)
  - `RecordHead.tsx` (crumbs)
  - `Combined.tsx`
  - `CombinedProperty.tsx`
  - `Vault.tsx`
- **Hard-coded copy swept:**
  - `CombinedProperty.tsx`: eyebrow `HOLDING`, "Remove this holding", "This holding is down to…", the tabs nav "This holding", `Failed what="This holding"`, "This holding isn't in your account", "Records in this holding".
  - `CombinedActions.tsx`: "Combine into one holding", "…part of another holding…", "A holding needs at least two records…", "…in another holding…", "…or remove the holding instead.", "That holding could not be removed…", "Remove the holding {name}?", "…left this holding — reload…".
  - `CombinedLedger.tsx`: "All documents in this holding", "N documents in this holding", "…linked to this holding…", "Costs for this holding", "…in this holding" (×2).
  - `CombinedFmb.tsx`: "…in this holding has a saved boundary", the map region "Map of this holding", "Frame the whole holding again".
  - `api.ts` error labels: "That holding" (create) and "Removing that holding" (delete).
  - `Vault.tsx`: the facet label "Holding", the link-picker prose, placeholder and aria-label, the "Holding" chip, "Open holding", the empty and failed copy (`Failed what="The holdings list"`).
  - `Combined.tsx`:
    - `Failed what="The holdings list"`
    - `ariaLabel="Narrow the holdings list"`, so it never says "your holdings"
    - Empty body: "…choose Combine to make a holding."
    - The ⓘ copy
  - Comment-only touch-ups in `ui.tsx` and `w360.css`.
- **Derived from the constant:**
  - The summary line ("2 holdings · 62.86 ac · ₹1.40 Cr valued")
  - "No holdings yet" and "No holdings match these filters"
  - "+ New holding"
  - The Export filename `holdings-YYYY-MM-DD.csv`
- **Unchanged on purpose:**
  - Routes `/app/combined/...`, GraphQL fields and operations, query keys, file and component names, facet URL keys, Vault's internal facet key `combined`
  - The "Combined map" tab (it describes the map)
  - The verb "Combine…" / "Select 2 or more to combine" on Properties

### UX follow-ups
- **a) Combine hand-off.**
  - "+ New holding" and the empty state's "Go to Properties" link to `/app/properties?combine=1`.
  - **The hint.** While `combine=1` is set (with data loaded and the account not empty), Properties shows a dismissable hint: "Select two or more properties, then choose Combine to make a holding."
    - It composes the shared `.callout` notice, an `iconbtn` and `CloseOutlined`. There is no new CSS and no new component.
    - It renders under the filter row with `role="status"`.
  - The grid gets the existing `selecting` class, so card checkboxes show at full strength. That is the "selection mode"; the list view always shows checkboxes.
  - Dismissing deletes only `combine` with `replace: true`. `view`, `q` and the facets survive. `combine` is not a facet, so Clear filters leaves it alone.
- **b) Filtered-empty note.** The Holdings `emptypanel` is now heading → `p.note` → Clear filters, the same structure as Properties. The note comes from the new pure helper `filteredEmptyNote(total)`:
  - "The one holding is hidden by the filters above."
  - "All N holdings are hidden by the filters above."

### Guard, docs and tests
- **`scripts/vocab-tests.ts`:** adds VOC-0..5. The existing CL-610..612 block is untouched.
  - VOC-0: a scanner self-test (a comment is not flagged, a literal is).
  - VOC-1: the `HOLDING_WORD` values are set and `COMBINED_WORD` is gone.
  - VOC-2: no "combined view(s)" or "viewed together" outside comments anywhere in `apps/web/src`.
  - VOC-3: no "your holdings" in `apps/web/src/w360` or `components` (see Follow-ups for why legacy is excluded).
  - VOC-4: the Properties rail label and the PageHead title are "Properties", and Properties prints no "Holdings".
  - VOC-5: New links to `?combine=1`.
- **`design.md` § App vocabulary:**
  - The row is now "Several properties held as one → **Holding** (list: **Holdings**)", with the singular-inside-an-object rule, the never-"your holdings" rule and `HOLDING_WORD`. Its Not column reads "combined view, combined property, estate, portfolio", so "holding" is removed from it.
  - The Properties row adds "**Holdings** must never be used for the Properties list". Its Not column still lists "holdings".
  - An approval line: Reddy, 03/10/2026, superseding the 26/09/2026 entry.
  - "members of a holding".
- **`docs/specs/2026-09-25-combined-properties.md` § Screens:**
  - Updates the eyebrow, title, summary, the New-holding hand-off and hint, the filtered-empty note and `HOLDING_WORD`/CSV.
  - Adds the "Renamed 03/10/2026 (Reddy)" supersession note. The historical 27/10/2026 note is kept.
- **e2e specs:**
  - `29-combined-list` gets new strings, the note assertion, the `?combine=1` hrefs and a new `@phone` test: New holding → hint → List (keeps `combine=1` and `view=list`) → tick Sy 214/2 and Sy 88 → Combine… → "Combine into one holding" → Cancel → dismiss (the `combine` param is gone and `view=list` is kept).
  - `27-combined-map`, `28-combined-overview` (titles only), `11c` (:298 and its title), `04` (:538, :556), `24` (:100).
  - `tests/e2e-web360/specs/combined.spec.ts` and `ux-record-combined.spec.ts` were edited but not run.

## Commands and results

| Check | Command | Result |
|---|---|---|
| Typecheck | `cd apps/web && bun run typecheck` | rc 0 (final run). An earlier run failed only in `pages/Groups.tsx`, which another task was editing at the same moment (mtime 12:01). It was clean on re-run. |
| Unit tests | `bun test apps/web/src/w360/combinedList.test.ts` | 7 pass, 0 fail (1 new) |
| Web unit tests | `bun test apps/web/src` | 348 pass, 0 fail, 22 files |
| Guards | `for s in scripts/*-tests.ts; do bun run "$s"; done` | all 19 PASS, including `vocab-tests.ts`, `typography-tests.ts` and `shared-components-tests.ts` |
| Icon guard | `bun run scripts/icon-guard.ts` | ICON GUARD PASSES |
| UX guards | `bun run scripts/ux-guards.ts` | UX GUARDS PASS |
| VOC-2 mutation | inserted `const __probe = 'Combined view';` into `Combined.tsx`, ran vocab-tests, restored the file | FAIL at `Combined.tsx:56` as intended, then PASS after the restore |
| Parity | `bun run scripts/parity-check.ts` | rc 1, with **1 pre-existing error not caused by this change**: `[twins] packages/core/src/land/landcalc.ts changed; its twin did not` (I did not touch `landcalc.ts`). The changed holdings files are listed as "note" only, with no copy-related failure. |
| New and related e2e | `APP_WEB_URL=http://localhost:5193 bunx playwright test specs/28-combined-overview.spec.ts specs/29-combined-list.spec.ts specs/11c-documents-files.spec.ts specs/26-*.spec.ts specs/27-combined-map.spec.ts --project=app --project=phone --reporter=line --output=<tmp>` | **171 passed**, 0 failed. The prior run had 169; this adds 2 (app and phone) for the new hand-off test. |
| 03/04/24 with this change | same harness, `specs/03 specs/04 specs/24 --project=app --project=phone --reporter=json` | 136 failed / 275 passed |
| 03/04/24 baseline | the same run after temporarily restoring the old constant values, removing the Properties hint and putting back the old 04/24 spec strings (all from a `/tmp` backup, restored afterwards) | 139 failed / 272 passed |

`shared-components-tests.ts` printed one NOTE: "counts went down … `RecordNotes.tsx: card 1 < 2`". That file is not mine (it is other work), so the budget was left alone.

### Baseline compare (03/04/24)
- **New failures** (with the change minus the baseline): **none**.
- **Passed with the change but failed in the baseline:**
  - 04:1283 (drawer modal focus trap). This is the same flaky test the prior run saw.
  - 04:1473.
  - phone 24:1147.

  These are unrelated and flaky.
- **The assertions this task touches all pass:** 04:523 (crumbs link "Holdings"), 04:548 (no "Holdings" in crumbs), and the 24 rail list.
- **Pre-existing failure causes, unchanged:**
  - "N records selected" versus "N properties selected" (03:980, 03:997)
  - "The screen logged errors": 48 tests with HTTP 400s from the sealed harness, plus React key warnings from Dashboard work
  - The 24 rail list expects "Dashboard" where the rail now says "Home", so the phone drawer tests fail
  - nogeo and CSV-heading drift

### Browser check
- **Setup:** my own Vite server on :5193 (`WEB_PORT=5193 bun run dev < /dev/null`), through the sealed e2e-app harness. Viewports: 1512×950 and iPhone 14. The existing :5173/:5175/:5180/:5181 listeners were not touched.
  - The first attempt without `< /dev/null` was job-control stopped (state T) when Vite read the TTY. It was killed (my PIDs only) and restarted.
- **Screenshots** (in this folder):
  - `shot-holdings-desktop.png` / `shot-holdings-mobile.png`
  - `shot-holdings-filtered-empty-desktop.png` / `shot-holdings-filtered-empty-mobile.png`
  - `shot-properties-combine-hint-desktop.png` / `shot-properties-combine-hint-mobile.png`
- **Exercised:**
  - New holding → `/app/properties?combine=1` → the hint is visible and the grid is `selecting`.
  - List → select two → Combine… → dialog "Combine into one holding" → Cancel. This is the spec 29 test, on desktop and phone.
  - `/app/properties?combine=1&view=list&q=sy` → dismiss → `?view=list&q=sy`.
  - Filter to nothing → "No holdings match these filters" with its note → Clear filters → both rows back.
  - Export → `holdings-2026-10-03.csv`.
- **Computed styles** (desktop and phone):
  - Every probed element is Atkinson Hyperlegible.
  - H1 and the emptypanel h3 are weight 700. The summary, tally, hint and empty note are weight 400.
  - The summary and tally use `tabular-nums`. The empty note uses the same plain `note` class as Properties' panel.
  - No dates are rendered on these screens.
- **Observation (pre-existing, not changed):** on a phone, the Properties selection bar that the first tick raises sits over the next list row. The new spec ticks by keyboard for that reason.

## Parity follow-ups for Reddy (not edited; iOS and Expo are out of scope)
- **iOS:**
  - `apps/ios/Pattadar/Sources/HoldingsScreen.swift` is the *Properties* screen (navigationTitle "Properties"). Its type and file name say "Holdings", and :485 "This holding is no longer on file." refers to a single property, which now conflicts with the new meaning.
  - `AddDocumentSheet.swift:218` says "…a paper, not a holding…".
- **Expo:**
  - The `apps/mobile/src/app/(tabs)/holdings.tsx` route and `apps/mobile/src/app/holding/[id].tsx:402` `<Section title="Holding">` both mean a single property.
  - `scripts/ux-guards.ts` CL-610 forbids "holding" in Expo copy. It would need narrowing if Expo gains this feature.
- **Maestro:** `tests/e2e-mobile/02_tabs_navigation.yaml` taps a "Holdings" tab, but the Expo tab is titled "Properties". This drift predates this change.
- **Neither native client has the holdings (combined) feature.** `parity-check.ts` reported no copy failure.
- **Legacy web:** `/legacy/parcels` (`apps/web/src/pages/LandPropertiesPage.tsx:431,444`) still has the eyebrow "Your holdings" and "Add a holding", meaning properties. It predates the term. VOC-3 is scoped to W360 and components so that this legacy copy is reported here rather than rewritten.

## Notes
- **Date chronology:** the approval is recorded as 03/10/2026, as instructed, while the earlier list-standard note is dated 27/10/2026. Both dates are kept as written.
- **Not verified:**
  - the `tests/e2e-web360` disposable-DB run (specs edited, not run)
  - the live API
  - the root `bun run build`
  - CI

## Cleanup
- **Server stopped:** the :5193 Vite (bun 21750 / node 21755). `lsof -iTCP:5193 -sTCP:LISTEN` returns nothing.
- **Deleted:**
  - the temporary `tests/e2e-app/specs/zz-hold-shots.spec.ts`
  - all `/tmp/hold-*` logs, JSON reports, backups and Playwright output
- **Kept and not mine:** `tests/e2e-app/results.json`, `playwright-report/` and `test-results/` predate this task (02/10 18:49 and 03/10 11:04). My runs wrote only to `/tmp`.
- **Kept in this folder:** `plan.md`, `verification.md` and the six screenshots.
- **Unrelated uncommitted work:** left as it was.
