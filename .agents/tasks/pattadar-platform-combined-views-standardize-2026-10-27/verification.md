# Verification: Combined views brought up to the Properties page standard

Iteration 1. There was no `review.json`. Nothing was committed (as instructed).

## What changed

- `apps/web/src/w360/ui.tsx`
  - Adds `COMBINED_WORD` (`one` / `many` / `eyebrow`), next to `SHELF_WORD`.
  - Adds the shared `SortCycle` chip, next to `FacetFilter`.
- `apps/web/src/w360/combinedList.ts` (new): pure helpers.
  - `combinedFacets`, `matchesCombined`, `COMBINED_SORTS`, `sortCombined`, `combinedSummary`, `combinedCsvRows`, `COMBINED_PARAM`.
- `apps/web/src/w360/combinedList.test.ts` (new): 6 bun tests.
- `apps/web/src/w360/pages/Combined.tsx`: rebuilt head and toolbar.
  - Composes the shared components `PageHead`, `FacetFilter`, `SortCycle`, `Empty`, `Failed`, `Pill`, `Icon` and `downloadCsv`, plus the shared `onecol`, `emptypanel` and `btn` classes.
  - The row markup is unchanged.
- `apps/web/src/w360/pages/Properties.tsx` and `Vault.tsx`: their hand-built sort buttons are replaced by `SortCycle`.
  - The behaviour and the accessible names are unchanged. Vault keeps its own `aria-label`.
- Labels now come from `COMBINED_WORD`, so the visible text is unchanged:
  - `Shell.tsx` (rail)
  - `CombinedProperty.tsx` (crumbs)
  - `RecordHead.tsx` (crumbs)
  - `Vault.tsx` (picker section)
- `tests/e2e-app/specs/29-combined-list.spec.ts` (new): a sealed spec with 7 tests, 2 of them tagged `@phone`.
- Docs:
  - `docs/specs/2026-09-25-combined-properties.md` § Screens: the new standard, recorded as superseding the "deliberately thin" text (27/10/2026).
  - `design.md` § App vocabulary: notes the `COMBINED_WORD` constant. The approved term is unchanged.

## Decisions

- **Subtitle:** `combinedSummary(shown)`, for example "2 combined views · 62.86 ac · ₹1.40 Cr valued".
  - Acres use `num(x, 2)`, the same form as Properties.
  - Sq.yd and Sq.ft are separate parts, printed only when they are above zero, and never added to acres.
- **"+ New combined view":** a `Link` to `/app/properties`.
  - Views are created there: select 2 or more records, then choose Combine…. The ⓘ next to the title says so.
  - No second picker was invented.
  - It is hidden on an empty account, where the Empty state's "Go to Properties" covers that case.
- **Export: included.** It reuses the shared `downloadCsv`, which escapes every cell (formula-injection guard).
  - It exports the rows shown, to `combined-views-YYYY-MM-DD.csv`.
  - It is disabled when nothing is shown. A failure is reported with `toast.bad`.
- **Grid/List/Map toggle: omitted.**
  - The list query carries no geometry. Geometry comes from the per-view `combinedFmb` query, which would mean N extra round trips.
  - There is no combined card component for a grid.
- **Filters** (shared `FacetFilter`, kept in the URL as `?complete=`, `?ground=`, `?land=`):
  - Records: all present / Missing a record
  - Boundaries: all on map / some missing / none on map
  - Land: farmland / plots / built area
- **District/mandal filter: omitted.** `placeLine` is a compressed display string, so a place facet needs structured fields from the backend. That is a follow-up.
- **Sort** (`SortCycle`): Newest first (the server order), Name A–Z, Largest extent, Most records, Recently updated.

## Commands run and results

| Check | Command | Result |
|---|---|---|
| Typecheck | `cd apps/web && bun run typecheck` | rc=0 (run after the final restore) |
| New unit tests | `bun test apps/web/src/w360/combinedList.test.ts` | 6 pass, 0 fail |
| Web unit tests | `bun test apps/web/src` | 340 pass, 0 fail, 21 files |
| Guards | `for s in scripts/*-tests.ts; do bun run "$s"; done` | all 19 PASS, including `typography-tests.ts`, `shared-components-tests.ts` and `vocab-tests.ts` |
| Icon guard | `bun run scripts/icon-guard.ts` | ICON GUARD PASSES |
| UX guards | `bun run scripts/ux-guards.ts` | UX GUARDS PASS |
| New list spec | `APP_WEB_URL=http://localhost:5191 playwright test specs/29-combined-list.spec.ts --project=app --project=phone` | 9/9 passed |
| Related specs (final) | specs 29, 11c, 26, 27, 28, app and phone | 169/169 passed |
| Properties/record/responsive | specs 03, 04, 24, app and phone | 137 failed / 434 passed across 03, 04, 11c, 24, 26, 27, 28; see the baseline below |

### Baseline for the 03/04/24 failures

- To isolate my change, I temporarily put the original hand-built sort buttons back in `Properties.tsx` and `Vault.tsx`, then re-ran specs 03, 04 and 24.
  - Result: 138 failed.
  - The failure set **with** my change (137) is a strict subset of the baseline (138). The one extra baseline failure, 04:1283 (modal focus trap), is unrelated.
  - **No new failures come from this change.**
- I then restored my versions from backup and re-ran the typecheck and guards (both green, above).
- The failures are copy and layout drift that already exists in the working tree:
  - The specs expect "4 records selected", but the app says "4 properties selected".
  - The specs expect CSV headings "Papers" and "Features", but `HEAD`'s Properties already writes "Documents" and "Site features".
  - The map "nogeo" text is hidden.
  - Many phone drawer tests fail in 24-responsive.
- The Properties sort-chip tests (03:801 and 03:840) pass. So do the "Combined views" text assertions in 04 and 24.

### Browser check

- **Setup:** a sealed e2e-app harness against my own Vite dev server on :5191 (`WEB_PORT=5191`). The founder's :5180 stack was not touched. Viewports: 1512px desktop and iPhone 14 (390px).
- **Screenshots:** `shot-properties-desktop.png`, `shot-combined-desktop.png`, `shot-properties-mobile.png`, `shot-combined-mobile.png`, `shot-combined-filter-open-desktop.png`, `shot-combined-filter-open-mobile.png`, `shot-combined-filtered-desktop.png`, `shot-combined-filtered-mobile.png`.
- **Header:** the eyebrow, H1 and subtitle sit in the same positions as on Properties (eyebrow y≈97, H1 y≈130, subtitle y≈158 at desktop). Export and the primary action are right-aligned in the head the same way.
- **Filter row:** same separators and spacing. "+ Filter" is on the left. "N of M shown | Sort: … ⌄" is on the right.
- **Mobile:** the head actions wrap under the title, as they do on Properties. There is no horizontal overflow (asserted in spec 29 `@phone`).
- **Filter popover:** opens over the list without clipping. It shows the three groups, with options that have no count dropped.
- **Exercised flows:**
  - Ticking "Missing a record" leaves 1 row and the tally reads "1 of 2 shown". The chip and "Clear all" appear, and the URL carries `complete=missing`.
  - Sorting cycles Newest → Name A–Z → Largest extent.
  - Open goes to `/app/combined/<id>`.
  - Export downloads `combined-views-*.csv`.
  - Filtering to nothing shows "No combined views match these filters" with a working "Clear filters".
  - The empty list shows only "No combined views yet" and "Go to Properties".
- **Computed styles** (Combined head, desktop and mobile):
  - Every element: font `Atkinson Hyperlegible`.
  - H1: weight 700.
  - Subtitle and tally: weight 400, `font-variant-numeric: tabular-nums`.
  - Sort chip: weight 400.
  - No 500/600/800 weights. No dates are rendered.

## Not verified

- **"Recently updated" after a real rename:** this needs the live API. Only the sort itself is unit-tested, including an unreadable date sorting last.
- **`tests/e2e-web360`:** the disposable-DB integration run was not done. Create and Open wiring are unchanged.
- **The root `bun run build`:** not run.

## Cleanup

- **Stopped:** the Vite dev server I started on :5191. The port is confirmed free.
- **Untouched:** the other listeners (:5173, :5175, :5181), which were already running.
- **Deleted:**
  - the temporary screenshot spec `tests/e2e-app/specs/zz-cv-shots.spec.ts`
  - every `/tmp` log and Playwright output directory I created
- Playwright output went to `/tmp`. `tests/e2e-app/results.json`, `playwright-report` and `test-results` were not written by these runs.
- **Kept on purpose:** the 8 `shot-*.png` files in this folder. They are the requested visual evidence.
- **Pre-existing changes:** the many uncommitted changes from other work (Dashboard, Fence*, Tools, w360.css and others) are left as they were.
