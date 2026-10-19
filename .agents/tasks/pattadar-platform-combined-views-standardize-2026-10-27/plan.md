# Implementation Plan: bring Combined views up to the Properties page standard

Date: 27/10/2026. Repo: `/Users/reddy.sh/reddy.sh/projects/pattadar-platform`, working on `main` (HEAD `0ace64b`; the tree already has unrelated uncommitted changes under `.github/` and `.kiro/`, so leave them alone and never stage them).

The user's report is a real gap. `Combined.tsx` renders only `PageHead eyebrow + title` and then a bare row list. It has no summary line, no global actions, no filter row, no count and no sort. The file header (lines 1–14) and the spec (`docs/specs/2026-09-25-combined-properties.md` § Screens, lines 254–258) describe this thinness as deliberate. The owner has now reported it as non-standard, so this plan supersedes that decision and records the supersession in both places (item 7).

## Evidence map (absolute paths and lines)

1. **Shared page header:** `PageHead` in `/Users/reddy.sh/reddy.sh/projects/pattadar-platform/apps/web/src/w360/ui.tsx:407-428`. Props: `eyebrow`, `title` (an `<h1>`), `info` (an ⓘ `InfoTip`, ui.tsx:436), `children` (the subtitle slot under the title) and `actions` (the right-aligned `.actions`). Properties uses it at `apps/web/src/w360/pages/Properties.tsx:964-1012`. `/Users/reddy.sh/reddy.sh/projects/pattadar-platform/apps/web/src/components/PageHeader.tsx` is the older MUI header for non-W360 pages. Properties does not use it and this work must not use it either.
2. **Page components:**
   - Properties: `/Users/reddy.sh/reddy.sh/projects/pattadar-platform/apps/web/src/w360/pages/Properties.tsx`. The header is at 964–1012 (segmented Grid/List/Map at 977, Export at 988, primary Add at 997, subtitle `portfolioLine` at 1008). The filter row is at 1019–1047. The empty states are at 1065–1100. The filtered-to-nothing panel is at 1106.
   - Combined views: `/Users/reddy.sh/reddy.sh/projects/pattadar-platform/apps/web/src/w360/pages/Combined.tsx` (whole file, 89 lines). It reaches the rail through `apps/web/src/w360/Shell.tsx:351`.
3. **Shared toolbar, filter, sort and count:**
   - `FacetFilter` at `ui.tsx:483-634`. It renders `+ Filter`, the removable chips, `Clear all`, the right-hand `tally` (the "N of M shown" count) and a `trailing` slot. It hides any group that has no options.
   - Sort is not a shared component today. Properties (`Properties.tsx:1034-1044`) and Vault (`pages/Vault.tsx:1122-1130`) each hand-build `<button className="sortcycle">Sort: X ⌄</button>`. Only the CSS is shared (`w360.css:2027`). Combined would be the third copy, so item 2 lifts the button into `ui.tsx` as `SortCycle`. All three screens then compose that one component, which satisfies the invariant against page-local copies.
   - The CSV writer is `downloadCsv(name, rows)` at `ui.tsx:726` (with `csvCell` at 708).
   - Other shared pieces: `Empty` at ui.tsx:1234, `Failed` at 1271, `Pill` at 741, `num` at 143, `plural` at 149, `inr` at 84, `inrOr` at 106.
4. **Data:** `useCombinedProperties()` at `/Users/reddy.sh/reddy.sh/projects/pattadar-platform/apps/web/src/w360/api.ts:2961` uses `Q_COMBINED_LIST` (2931) and returns `Combined[]`. The interface is at api.ts:2758–2786. The fields that matter here are `id name note memberCount parcelCount propertyCount farmExtent(ac) plotExtent(Sq.yd) builtExtent(Sq.ft) extentLine marketValue surveyedCount placeLine isComplete createdAt updatedAt members[]`.
   - The server resolver `combined_properties` is at `services/api/src/web360.py:7294`. It orders by `created_at DESC` (newest first).
   - `place_line` is compressed for display by `_combined_place_line` (web360.py:3123). For example it can say "3 villages · Prakasam". Neither `Combined` nor `CombinedMember` carries a structured district or mandal.
5. **Create flow:** creation lives on Properties.
   - When two or more records are selected, the selection bar shows `Combine…` (`Properties.tsx:1365`). That button opens `CombineDialog` (`/Users/reddy.sh/reddy.sh/projects/pattadar-platform/apps/web/src/w360/pages/CombinedActions.tsx:47`, through `useCreateCombined`), mounted at Properties.tsx:1417.
   - The Combined list page has no create flow, and Properties has no URL parameter that pre-arms combining.
   - The e2e suite already drives creation through Properties (`tests/e2e-web360/specs/combined.spec.ts:150-240`).
6. **Area formatting:** Properties does not use `packages/core` `formatArea`/`formatExtent` (`packages/core/src/land/units.ts:63,136`). Its subtitle is `` `${num(totals.ac, 2)} ac` `` with `num` from ui.tsx:143 (Properties.tsx:629-636). Combined's `ExtentLine` (Combined.tsx:24-32) already uses the same `num(x, 2) ac` / `num(x) Sq.yd` / `num(x) Sq.ft built` forms. The subtitle uses those forms too, so "60.00 ac" reads identically on both screens.
7. **Labels:** they are hard-coded today in the following places, and no shared constant exists:
   - Shell.tsx:351 (rail)
   - Combined.tsx:39, 42, 46 (eyebrow, title, failed and empty copy)
   - CombinedProperty.tsx:69, 171, 183, 191 (crumbs)
   - RecordHead.tsx:165, 167 (crumbs)
   - Vault.tsx:295–296 (section heading)

   The precedent for a shared vocabulary map is `SHELF_WORD` in ui.tsx:695.

## Decisions

- **Summary subtitle: include.** It reads "N combined views · 60.00 ac · 400 Sq.yd · ₹X valued" through `PageHead` `children`, with the same `<p className="note num" style={{ marginTop: '0.375rem' }}>` that Properties.tsx:1008 uses. The figures are summed over the *shown* rows, as on Properties. Acres, Sq.yd and Sq.ft are never added together, which keeps the stance in Combined.tsx:21-23 and in vocab-tests CL-612: each part is printed only when it is above zero. Worth comes from `inr(sum)` and is printed only when above zero. A one-line skeleton (`Sk w="18rem" h="1rem"`) shows on first load. **Runtime check:** confirm in the browser that the subtitle total for a seeded holding matches the row's `ExtentLine` exactly (for example 34.53 ac).
- **Primary action "+ New combined view": include, as a link to where creation lives.** This invents no second picker.
  - The control is `<Link className="btn primary" to="/app/properties">` with an `AddOutlined` icon and the label `New ${COMBINED_WORD.one.toLowerCase()}`.
  - A `PageHead info` tip says: "Made on Properties: select 2 or more records and choose Combine. Official records stay separate."
  - Hide it when the list is empty (`virgin`). The Empty state's own "Go to Properties" CTA already covers that case, and Properties hides head actions on an empty account for the same reason (Properties.tsx:968-972).
  - Not doing: adding a `?combine=1` hand-off to Properties. That would change Properties' behaviour, so it is listed as a follow-up only.
- **Export: include.** It reuses `downloadCsv` from ui.tsx:726 with the same outlined `btn`, `FileDownloadOutlined` icon and label "Export" as Properties.tsx:988. It is disabled when nothing is shown and exports the shown rows.
  - Columns: Name, Records, Place, Farmland (ac), Plots (Sq.yd), Built (Sq.ft), With boundaries, Complete, Worth (₹), Note.
  - Filename: `combined-views-YYYY-MM-DD.csv`. This matches the ISO filename convention at Properties.tsx:925. It is a filename, not a rendered date.
  - Wrap the call in try/catch, because `downloadCsv` throws when the browser refuses. Report failures through the existing `useToast()` (`apps/web/src/w360/Toast.tsx:64`, pattern in Groups.tsx:572).
- **Grid/List/Map view toggle: omit.**
  - Map needs per-record geometry. `PortfolioCanvas` takes `PortfolioPin {ring, lat, lon}` (Properties.tsx:676-684). The list query carries only `members[].ground` words, and geometry lives in the per-holding `combinedFmb(id)` query, so a list map would need N extra round trips.
  - Grid has no combined card component. The record `Card` is Properties' own (shadow budget in `scripts/shared-components-tests.ts`). A one-option toggle would be furniture. Record this in the file header.
- **Filters: include, with the same `FacetFilter`.** Groups are built client-side from the loaded list, and only options with a count above zero are offered:
  - `complete`, labelled "Records": `complete` → "All records present", `missing` → "Missing a record" (from `isComplete`).
  - `ground`, labelled "Boundaries": `all` → "All on map" (`surveyedCount === memberCount && memberCount > 0`), `some` → "Some missing", `none` → "None on map" (`surveyedCount === 0`).
  - `land`, labelled "Land": `farm`, `plot`, `built`. A holding can sit in several of these (`farmExtent`, `plotExtent`, `builtExtent` > 0).

  Filters work as AND across groups and OR within a group, the same semantics as Properties. Like Properties, the selection lives in the URL (`?complete=`, `?ground=`, `?land=`) so a filtered list can be shared.

  District and mandal are **omitted** because the data has no structured place. `placeLine` is a compressed display string ("3 villages · Prakasam"), and parsing it would misfile holdings. Supporting a district facet would be an additive GraphQL change (`districts`/`mandals` on `Combined`), which belongs to `backend-contract-change` as a follow-up.
- **"N of M shown" and Sort: include.**
  - The count is `tally={`${shown} of ${total} shown`}` on `FacetFilter`, as at Properties.tsx:1027.
  - Sort uses the new shared `SortCycle` in `trailing`. The presets are:
    - "Newest first", the default. It is the server order (`created_at DESC`) and replaces Properties' "As filed", because here the server order really is newest first.
    - "Name A–Z", using `localeCompare(…, 'en-IN')`.
    - "Largest extent": farm acres descending, then plot Sq.yd, then built Sq.ft. It does not convert across units.
    - "Most records": `memberCount` descending.
    - "Recently updated": `Date.parse(updatedAt)` descending, with invalid or empty dates last.

    **Runtime check:** in the browser, confirm that "Recently updated" moves a holding to the top after it is renamed. The server sets `updated_at` on rename and on member edits (web360.py:12661, 12701).
  - Sort state is page `useState`, as on Properties (Properties.tsx:479).
- **Rows: keep unchanged.** That means the name link, the meta line, the note, the `Missing a record` `Pill kind="disputed"`, `ExtentLine`, worth and the `Open` button. The row markup is not restyled.
- **Empty and failed states:**
  - When the list is empty, the head shows title and info only (no actions, no subtitle), there is no filter row, and the existing `Empty` with "Go to Properties" stays.
  - When the list is filtered to nothing, use the same `<div className="emptypanel">` heading/note/`Clear filters` pattern as Properties.tsx:1106-1132, with "No combined views match these filters". The panel's buttons stay `btn`.
  - The failed state keeps the existing `Failed`.
- **Single source of truth for the noun:** add `COMBINED_WORD` to ui.tsx next to `SHELF_WORD`, as `{ one: 'Combined view', many: 'Combined views', eyebrow: 'Viewed together' }` with a comment pointing to `design.md` § App vocabulary and to naming-research.md. The visible label stays "Combined views". A future rename (the research recommends "Holdings", which is Reddy's decision) then becomes one edit plus design.md and the test strings. Use the constant in:
  - Shell.tsx:351
  - Combined.tsx (all labels, the CSV filename stem and the count noun)
  - CombinedProperty.tsx crumbs at 69, 171, 183
  - RecordHead.tsx:165 (and the `'Combined view'` fallback at 167)
  - Vault.tsx:295-296

  Long prose sentences elsewhere (CombinedActions dialogs, api.ts error copy) stay as they are and are listed as a follow-up in the spec note. The name `COMBINED_WORD` contains an underscore, so the shadow counter in `scripts/shared-components-tests.ts:63-67` does not treat it as a component.
- **Typography:** no new font family, no 500/600/800 weights, and `num`-class digits for figures (tabular-nums through `.num`). Rows keep `fontWeight: 700`. No dates are rendered.

## Steps

- [ ] 1. Add pure list helpers and their unit tests.
      Create `apps/web/src/w360/combinedList.ts` with these exports:
      - `combinedFacets(list: Combined[]): FacetFilterGroup[]`, which returns the three groups with zero-count options dropped.
      - `matchesCombined(c, selected: Record<string, readonly string[]>)`, with AND across groups and OR within a group.
      - `COMBINED_SORTS: { key: 'newest'|'name'|'extent'|'records'|'updated'; label: string }[]`.
      - `sortCombined(list, key)`, which is stable and never mutates its input.
      - `combinedSummary(list): string`, which builds "N combined views · X.XX ac · N Sq.yd · N Sq.ft built · ₹… valued" from `plural`, `num` and `inr` and drops zero parts.
      - `combinedCsvRows(list): unknown[][]` (header row plus one row per holding).

      Import `num`, `plural`, `inr` and `COMBINED_WORD` from `./ui`, and `Combined` from `./api` (types only). Add `COMBINED_WORD` to ui.tsx next to `SHELF_WORD` (line 695) in this step, because the helpers need it.

      Write `apps/web/src/w360/combinedList.test.ts` in the `bun:test` style of `apps/web/src/w360/homeGaps.test.ts`. Cover:
      - facet counts and dropped empty options
      - a missing-record holding is matched by `complete=missing`
      - AND/OR semantics
      - each sort order, including invalid `updatedAt` sorting last and "newest" preserving input order
      - the summary never adds ac to Sq.yd, and prints "1 combined view" in the singular
      - CSV rows are emitted through `downloadCsv`/`csvCell`, so a leading `=` in a name ends up quoted

      Files: `apps/web/src/w360/combinedList.ts`, `apps/web/src/w360/combinedList.test.ts`, `apps/web/src/w360/ui.tsx`.
      Verify: run `bun test apps/web/src/w360/combinedList.test.ts` and confirm it passes. Then run `bun run --filter @pattadar/web typecheck` and confirm it is clean.

- [ ] 2. Lift the sort chip into ui.tsx as `SortCycle` and adopt it on Properties and Vault without changing their behaviour.
      The API is `SortCycle({ label, onNext, ariaLabel? })`. It renders `<button type="button" className="sortcycle" aria-label={ariaLabel} onClick={onNext}>Sort: {label} ⌄</button>`. Place it after `FacetFilter` (ui.tsx:634) with a doc comment.
      - Properties.tsx:1034-1044: replace the hand-built button with `<SortCycle label={sortLabel(sort)} onNext={…same cycling logic…} />`. Pass **no** `ariaLabel`, so the accessible name stays "Sort: As filed ⌄" for `tests/e2e-app/specs/03-properties.spec.ts:806,846`.
      - Vault.tsx:1122-1130: replace the button, keeping its existing `aria-label` text and the `setPage(1)` call.

      Files: `apps/web/src/w360/ui.tsx`, `apps/web/src/w360/pages/Properties.tsx`, `apps/web/src/w360/pages/Vault.tsx`.
      Verify:
      - Run `bun run --filter @pattadar/web typecheck` and confirm it is clean.
      - Run `bun run scripts/shared-components-tests.ts` and confirm it passes.
      - With the dev server on :5180, run `cd tests/e2e-app && bun run test:app -- specs/03-properties.spec.ts specs/11c-documents-files.spec.ts` and confirm both pass.

- [ ] 3. Rebuild the Combined page head and toolbar in `apps/web/src/w360/pages/Combined.tsx` (depends on steps 1 and 2).
      - Add `useSearchParams`, and read the selected facets from `?complete=`, `?ground=` and `?land=`. Toggle them with `setParams(next, { replace: true })`, copying the toggle shape at Properties.tsx:542-550. `clearAll` deletes those three keys.
      - Derive `shown = sortCombined(data.filter(c => matchesCombined(c, selected)), sortKey)`.
      - Define `virgin = !!data && data.length === 0`.
      - Use `PageHead eyebrow={COMBINED_WORD.eyebrow} title={COMBINED_WORD.many} info={…made on Properties…}`. Its `actions` (hidden when `virgin`) are:
        - Export: a `btn` with `FileDownloadOutlined`, disabled when `shown.length === 0`, calling `downloadCsv(\`combined-views-${iso}.csv\`, combinedCsvRows(shown))` inside try/catch with a toast on failure.
        - `<Link className="btn primary" to="/app/properties">` with `<AddOutlined sx={{ fontSize: 17 }} /> New combined view`.
      - `children`: `combinedSummary(shown)` in `<p className="note num" style={{ marginTop: '0.375rem' }}>` when `data && !virgin`. Show `Sk w="18rem" h="1rem"` while loading.
      - When `data && !virgin`, render `<FacetFilter groups={combinedFacets(data)} selected={…} onToggle onClear tally={\`${shown.length} of ${data.length} shown\`} ariaLabel="Narrow your combined views" trailing={<SortCycle label=… onNext=…/>} />`.
      - Keep the loading `Sk`, `Failed` and virgin `Empty` (text from `COMBINED_WORD`).
      - Add the filtered-to-nothing `emptypanel` with a "Clear filters" button that calls `clearAll`.
      - Keep the row markup exactly as it is now, rendering `shown` in place of `data`.
      - Rewrite the file header comment (lines 1–14) so it states the new standard. It should say why there is still no Grid/List/Map toggle and no district facet, and that New links to Properties because that is where the records are chosen.

      Files: `apps/web/src/w360/pages/Combined.tsx`.
      Verify: run `bun run --filter @pattadar/web typecheck`, `bun run scripts/shared-components-tests.ts`, `bun run scripts/typography-tests.ts` and `bun run scripts/ux-guards.ts`, and confirm all pass.

- [ ] 4. Route the remaining visible labels through `COMBINED_WORD`, with no change to what is displayed.
      - Shell.tsx:351: `label: COMBINED_WORD.many`.
      - CombinedProperty.tsx:69, 171, 183: crumb `label: COMBINED_WORD.many`.
      - RecordHead.tsx:165: `COMBINED_WORD.many`. Line 167's fallback becomes `COMBINED_WORD.one`.
      - Vault.tsx:295-296: `aria-label` and `<h3>` become `COMBINED_WORD.many`.

      Files: `apps/web/src/w360/Shell.tsx`, `apps/web/src/w360/pages/CombinedProperty.tsx`, `apps/web/src/w360/pages/RecordHead.tsx`, `apps/web/src/w360/pages/Vault.tsx`.
      Verify:
      - Run `bun run --filter @pattadar/web typecheck` and confirm it is clean.
      - Run `cd tests/e2e-app && bun run test:app -- specs/04-record-shell.spec.ts specs/24-responsive.spec.ts specs/11c-documents-files.spec.ts`. The "Combined views" text assertions at 04:538, 556 and 24:100 still pass.

- [ ] 5. Add a sealed e2e-app spec for the list screen: `tests/e2e-app/specs/29-combined-list.spec.ts`.
      Follow the fixture pattern of `tests/e2e-app/specs/28-combined-overview.spec.ts` (`test, expect` from `../fixtures/harness`, and `world.set('combinedProperties', [...])`). The seed key is at `tests/e2e-app/fixtures/seed.ts:1092`. Seed three holdings:
      - "Markapur Land": 3 records, 2 surveyed, 60 ac, `isComplete: false`.
      - a complete farm.
      - a holding with a plot that has `plotExtent` only.

      Assert:
      - the `<h1>` reads "Combined views" and the eyebrow reads "Viewed together"
      - the subtitle contains "3 combined views", the acre sum formatted `X.XX ac` and the Sq.yd part, and never an ac+Sq.yd sum
      - the head has an `Export` button and a "New combined view" link with href `/app/properties`
      - `+ Filter` opens, ticking "Missing a record" leaves 1 row, the tally reads "1 of 3 shown", the chip removes the filter, and the URL carries `complete=missing`
      - `Sort: Newest first ⌄` cycles to "Name A–Z" and the row order changes
      - "Missing a record" still shows on Markapur Land, and Open navigates to `/app/combined/<id>`
      - filtering to nothing shows "No combined views match these filters" with a working Clear filters
      - an empty list (`[]`) shows "No combined views yet" with no Export, no New and no `+ Filter`
      - Export triggers a download whose suggested filename starts with `combined-views-` (use `page.waitForEvent('download')`)

      Tag one assertion `@phone` to cover the 390px head wrap, and assert no horizontal overflow (pattern in combined.spec.ts:185-188).
      Files: `tests/e2e-app/specs/29-combined-list.spec.ts`.
      Verify: with `./scripts/start-local.sh` (or the web dev server on :5180) up, run `cd tests/e2e-app && bun run test:app -- specs/29-combined-list.spec.ts specs/27-combined-map.spec.ts` and `bun run test:phone -- specs/29-combined-list.spec.ts`, and confirm all pass. The existing "No combined views yet" assertion at 27:386 must still pass.

- [ ] 6. Check the screen in the browser against Properties. This is required, because layout and spacing cannot be proven by code reading.
      Open `/app/properties` and `/app/combined` side by side at 1440px and at 390px. Use seeded or mocked data with at least two holdings, one of them missing a record. Confirm:
      - the eyebrow, H1 and subtitle sit on the same baseline rhythm
      - Export and the primary action align right in the head exactly as on Properties
      - the filter row's top spacing under the head matches. Properties is wrapped in `<div className="onecol">` and Combined is a bare `<main>`, so if the gap differs, wrap Combined the same way rather than adding page CSS
      - the filter popover opens over the list without clipping
      - all text renders in Atkinson Hyperlegible, with tabular digits in the subtitle
      - "Recently updated" reorders after renaming a holding (local stack only; this needs the real API)

      Record what you observed in the review notes. Do not commit screenshots. Delete any you take.
      Files: none (or `Combined.tsx` if the `onecol` wrapper is needed).
      Verify: the browser observations are recorded, and step 5's spec still passes after any adjustment.

- [ ] 7. Update the documentation (change-governance: Documentation and Architecture).
      - `docs/specs/2026-09-25-combined-properties.md` § Screens (lines 254–258): replace "deliberately thin — no faceted rail, no map view, no sort chip … no create button" with the new standard. That means the PageHead summary, Export, New (a link to Properties), the FacetFilter groups (Records, Boundaries, Land), the N of M tally and SortCycle presets. Also record why the Map/Grid toggle and the district facet are absent, and add the line "Superseded 27/10/2026 after the owner reported the list did not follow the list-page standard".
      - `design.md` § App vocabulary (row near line 379): add a note that the visible noun lives in `COMBINED_WORD` (`apps/web/src/w360/ui.tsx`). Do not change the approved term. Naming is Reddy's decision (see naming-research.md).
      - Leave CombinedActions and api.ts prose as they are, and list them in the spec as the remaining strings a rename must touch.

      Files: `docs/specs/2026-09-25-combined-properties.md`, `design.md`.
      Verify: run `bun run scripts/ux-guards.ts` and `bun run scripts/vocab-tests.ts` and confirm both pass. Confirm the doc links and paths resolve, for example `ls apps/web/src/w360/combinedList.ts`.

- [ ] 8. Run the full gate for a UI change (pattadar-standards).
      - From the repo root, run `bun test packages/core packages/tokens apps/web/src apps/mobile/tests apps/university/src`, then `for s in scripts/*-tests.ts; do bun run "$s" || exit 1; done`, then `bun run scripts/icon-guard.ts`, `bun run scripts/ux-guards.ts`, `bun run typecheck` and `bun run build`.
      - Then run the e2e-app specs touched above: 03, 04, 11c, 24, 26, 27, 28 and 29.
      - Stop any dev server you started. Delete the generated `tests/e2e-app/test-results`, `playwright-report` and `results.json` changes. Keep only the source changes from steps 1–7.

      Verify: every command exits 0. `git status` shows only the intended files (plus the user's pre-existing unrelated changes, which stay unstaged).

## Not verified by this plan, and follow-ups

- Live and integration evidence: `tests/e2e-web360/specs/combined.spec.ts` needs the disposable DB stack. Run it only if that stack is available. It is the wiring proof for "Open" and for creation through Properties, which this change does not alter.
- Follow-ups, not in scope:
  - structured `districts`/`mandals` on `Combined`, for a Place facet (backend contract change)
  - a `?combine=1` hand-off that opens Properties ready to combine
  - moving the remaining prose strings to `COMBINED_WORD`
  - the rename itself, which is Reddy's decision
- Security and privacy: no change to auth, storage, sharing or the API. The CSV contains only the owner's own holding summary, built client-side, and every cell goes through `csvCell` (formula-injection guard).
