# Implementation Plan: Tools UX-audit follow-up (A eyebrow, B SRO order, C search, D retire Fencing sub-tab)

Request (verbatim): "please work on the tools http://localhost:5173/app/tools?tab=sro … do the
/heuristic-ux-audit review please and also move the fence calculator to here as well please."
Then: "yes and retire old". Reddy approved exactly four changes, A to D. Nothing else from
`audit-summary.md` is implemented. Findings 2, 3/4, 6, 8-open-questions and 10 stay with Reddy.

Root: `/Users/reddy.sh/reddy.sh/projects/pattadar-platform` (written `$R` below; always use the
absolute path). This is the main checkout, so there is no worktree. Do not commit and do not push.
Do not start or stop the user's dev server on :5173. The sealed e2e harness drives the server
that is already running there.

## Working-tree constraint

The following carry FOREIGN uncommitted hunks from the `combined-overview-ux-fix` task:
`$R/apps/web/src/w360/w360.css`, `pages/VillageMaps.tsx`, `pages/Dashboard.tsx`,
`pages/CombinedProperty.tsx`, `pages/Properties.tsx`, `pages/Vault.tsx` and
`$R/tests/e2e-app/specs/17-villages.spec.ts`. Never revert or reformat them. This plan does not
edit any of them, including `w360.css`; the CSS fix in C is done in Tools.tsx (see C).

The uncommitted Part 1 work stays as it is and this plan builds on it: the `?tab=fence` tab in
Tools.tsx, `fenceBill.ts`, `FenceParts.tsx`, FenceStudio.tsx, `scripts/fence-tests.ts`,
`19-sections-legacy.spec.ts` and the web-360 design doc.

## Facts checked at plan time (do not re-derive)

- `Tools.tsx` (856 lines in the working tree): the PageHead with `eyebrow="Account"` is at L835.
  SroTool's search is at L186-L192 (`<div className="search">`, `<input type="text">`).
  `UsePerimeter` is at L510-L519. `PlotAreaTab` is at L544-L600 and works in a `LengthUnit` `lu`
  through core `toFeet`. `FencingTab` is at L602-L634 (core `fenceEstimate`, feet).
  `MapAreaTab` is at L636-L664 (ring `[lat,lng][]` from `parsePolygonRing`). `CALC_TABS`/
  `CalcTab` are at L666-L672. `CalculatorTool` is at L674-L701, with `usePerimeter` →
  `setTab('fence')` and the note "Unit conversion, plot measurement, fencing estimates and boundary
  area." `FenceTool` is at L712-L808 (`useState<string[]>(FOUR_SIDES)`). `Tools()` is at L826-L856.
- The Fencing sub-tab was never addressable by URL. `CalculatorTool` keeps it in `useState`.
  `routes.tsx` (L307-L312, L478-L488) only maps `/legacy/{tools,sro,stamp-duty,market-value,
  calculator}` to `?tab=…`. The pre-W360 `ToolsPage.tsx` (commit 2042be36) read only `?tab=` with
  four values. `git log -S"tab=fencing"` and `-S"?tab=area"` return nothing. So the only old deep
  link into this area is `?tab=calculator` (plus `/legacy/calculator`), and it must keep opening
  the Area calculator. The sub-tab's own id was `'fence'`, which is now the top-level id, so a
  hand-typed `?tab=fence` already lands on the new tab. Decision: no alias or redirect code. There
  is nothing to redirect, and mapping the never-valid `?tab=area` to fencing would be invented
  behaviour. Step 5 pins `?tab=calculator` and `/legacy/calculator` with tests.
- Core `fenceEstimate` (`$R/packages/core/src/land/landcalc.ts` L261-L274) is still used by
  `$R/apps/web/src/pages/detail/ParcelDetailPage.tsx:310`. It is not in `scripts/parity-map.json`,
  `apps/ios` or `apps/mobile`. Decision: keep it in core and only stop importing it in Tools. Its
  doc comment (landcalc.ts L179-L180, "two screens still call it") becomes "one older screen".
- Unit helpers exist in core: `toFeet(value, unit)` and `LENGTH_FT` (`{ ft: 1, m: 3.280839895,
  yd: 3, link: 0.66 }`), both exported from `@pattadar/core` (index.ts L95, L108), along with
  `round2` and `ringSides(ring) → { metres }[]`. Haversine sides are what FenceStudio already uses.
  Metres from a plot field = `toFeet(v, lu) / LENGTH_FT.m`. No new conversion.
- The SRO client does not re-sort (`useSroOffices`, `$R/apps/web/src/data/hooks.ts` L363-L370;
  SroTool only filters). No other client reads `sroOffices` (apps/ios, apps/mobile: none).
- `$R/services/api/data/sro_offices.csv` has 297 codes, all digits (0 non-digit rows), with no
  leading zeros seen. Resolver: `$R/services/api/src/main.py` L2048-L2052. Column: TEXT
  (L6536-L6543). Postgres is available locally (`/opt/homebrew/bin/initdb`, postgresql@17), as is
  `$R/.local/api-venv`. The test pattern is an isolated temp Postgres; see
  `$R/services/api/tests/test_profile_update.py` L30-L93. Ports in use: 55479, 55481, 55483, 55487.
- `.search` is shared by Shell.tsx:460 (top-bar jump), Properties.tsx:1161, RecordHead.tsx:441,
  RecordPapers.tsx:620/804, RequestWork.tsx:270, Shelf.tsx:93, Vault.tsx:224/287/571 and
  Tools.tsx:186. The jump box depends on centring (`.jump { justify-self: center }`). So the shared
  rule is NOT changed. Tools overrides its own instance.
- `.w360 input[type='text']` (w360.css L2724-L2728) does not match `type="search"`. No
  `input[type='search']` rule exists, so with `type="search"` the `.search input { border: 0 }`
  rule wins, as on Properties.tsx:1163.
- Only one test reaches the SRO search by role: `19-sections-legacy.spec.ts:1658`
  `getByRole('textbox', { name: 'Search SRO offices' })`. `type="search"` changes the role to
  `searchbox`. No test pins the Tools eyebrow (grep of tests/ and scripts/).
- `scripts/shared-components-tests.ts:141` budgets Tools at `{ card: 2, cell: 4, tabs: 1 }`
  (`role="tablist"` literal count, L78). Removing a sub-tab entry changes none of these, and the
  Area calculator keeps its TabStrip with three sub-tabs, as instructed.
- design.md does not describe the Fencing sub-tab (no "Fenc" match), so there is nothing to report
  there. Drift that stays with Reddy: design.md L371-L375 against the `.search` centring and the
  type=text frame (w360.css L202-L203, L2724).

## Decisions

- A: remove the prop only. PageHead already renders no eyebrow when the prop is absent
  (ui.tsx L399-L416).
- B: use `ORDER BY CASE WHEN code ~ '^[0-9]{1,18}$' THEN code::bigint END NULLS LAST, code, id`.
  It is numeric for digit codes, tolerant of future non-digit codes (they go last, in text order,
  and Postgres evaluates the cast only on the matching branch), and bounded so bigint cannot
  overflow. The query is a static string with no parameters, so there is nothing to inject.
  `length(code), code` was rejected because a leading-zero code ("0101") would sort after "999".
- C: in Tools.tsx only, use `type="search"` on the input (single frame) and `justifySelf: 'start'`
  on that one `.search` div (inline, next to the existing inline `marginBottom`). `w360.css` is not
  touched, so no other `.search` user can regress and no foreign hunk is at risk. Left edge: the
  `.search` and the `.scroll-x` table wrapper are siblings in the same card, so `start` puts both
  at the card's content edge. This needs verification during implementation: a measurement in
  step 5.
- D: the hand-off carries SIDES in metres, not a perimeter. `Tools()` owns a
  `fenceSeed: { n: number; sides: string[] } | null` state. `CalculatorTool` receives
  `onUseSides(m: number[])`, which sets the seed (n+1, sides `m > 0 ? String(round2(m)) : ''`) and
  calls `choose('fence')`. `<FenceTool key={fenceSeed?.n ?? 0} initial={fenceSeed?.sides} />`
  starts from `initial ?? FOUR_SIDES` with `closed` true. Clear still resets to `FOUR_SIDES`. A
  blank or zero side goes in as a blank box ("not entered"), so a rectangle with only a length
  hands over two sides rather than a fake 0 m. That is the same rule FenceTool already applies.
  The button keeps its existing label "Use in Fencing →", and the "Perimeter ≈ … ft" note is
  unchanged, so there is no new copy. The calculator note drops two words to "Unit conversion,
  plot measurement and boundary area." (a deletion, not new wording). Finding 9 (the 0 placeholder)
  goes away with FencingTab.

## Steps

- [ ] 1. B: numeric SRO code order at the API, with a Python test.
      Edit `$R/services/api/src/main.py` L2051. The SQL becomes
      `"SELECT * FROM sro_offices ORDER BY CASE WHEN code ~ '^[0-9]{1,18}$' THEN code::bigint END NULLS LAST, code, id"`,
      with a one-line comment above it: codes are TEXT, and "101" must not fall between "1009"
      and "1010". Change nothing else in the resolver.
      Create `$R/services/api/tests/test_sro_offices_order.py`, copying the isolated-Postgres
      fixture pattern from `test_profile_update.py` L1-L93 (module docstring, `isolated_postgres`
      on port 55491, a `db` fixture that monkeypatches `main.pool`, and
      `run(query) = asyncio.run(main.schema.execute(query, context_value=ctx()))`). The schema is
      the `sro_offices` CREATE TABLE copied from main.py L6536-L6543. Insert ids s1..s7 with codes
      `'1010','101','1009','513','99','0102','AB1'` in that order. Tests:
      - `{ sroOffices { code } }` returns `['99','101','0102','513','1009','1010','AB1']`, with no
        errors.
      - An empty table returns `[]`.
      Files: `$R/services/api/src/main.py`, `$R/services/api/tests/test_sro_offices_order.py` (new)
      Verify: from `$R`, run `.local/api-venv/bin/python -m pytest services/api/tests/test_sro_offices_order.py -q`.
      Expect "2 passed" and not "skipped". If it skips, report that rather than calling it
      verified. Then run `.local/api-venv/bin/python -m pytest services/api/tests -q` and expect no
      new failures. Only tests that read `sro_offices` can be affected by this change. Report any
      other failure as pre-existing, naming the test, and do not stash or revert foreign files to
      prove it.

- [ ] 2. A and C: drop the eyebrow and fix the SRO search, in Tools.tsx only.
      In `$R/apps/web/src/w360/pages/Tools.tsx`:
      - L835: `<PageHead eyebrow="Account" title="Tools">` → `<PageHead title="Tools">`.
      - L186: `style={{ marginBottom: 'var(--space-md)' }}` →
        `style={{ marginBottom: 'var(--space-md)', justifySelf: 'start' }}`.
      - L189: `type="text"` → `type="search"`. Keep the `aria-label`, placeholder and handlers
        exactly as they are.
      Do not edit `w360.css`.
      Files: `$R/apps/web/src/w360/pages/Tools.tsx`
      Verify: `cd $R/apps/web && bun run typecheck` exits 0.

- [ ] 3. D: retire the Fencing sub-tab and re-point both hand-offs at `?tab=fence` with sides in
      metres. Depends on step 2 (same file).
      In `$R/apps/web/src/w360/pages/Tools.tsx`:
      - Imports (L39-L60): remove `fenceEstimate`. Add `LENGTH_FT` and `ringSides`; `round2` and
        `toFeet` stay.
      - `UsePerimeter` (L510-L519): change the props to
        `{ perimFt: number; sidesM: number[]; onUse: (m: number[]) => void; extra?: string }` and
        the click to `onUse(sidesM)`. The note text and the "Use in Fencing →" label stay the same.
      - `PlotAreaTab` (L544-L600): the prop becomes `onUseSides: (m: number[]) => void`. Add
        `const m = (k: string) => ft(k) / LENGTH_FT.m;` and
        `sidesM = rect ? [m('len'), m('wid'), m('len'), m('wid')] : tri ? [m('a'), m('b'), m('c')] : [m('s1'), m('s2'), m('s3'), m('s4')]`
        (the diagonal is not a side). Pass `sidesM` to `UsePerimeter`.
      - `MapAreaTab` (L636-L664): the prop becomes `onUseSides`, with
        `sidesM = ringSides(ring).map((s) => s.metres)`, passed to `UsePerimeter`. The `extra`
        metres note stays.
      - Delete `FencingTab` (L602-L634) completely.
      - `CALC_TABS`/`CalcTab` (L666-L672): remove the `'fence'` entry so three remain (Unit
        converter, Plot area, Map area).
      - `CalculatorTool` (L674-L701): take the prop `{ onUseSides: (m: number[]) => void }`.
        Remove the `perimeterFt` state and `usePerimeter`. Pass `onUseSides` to PlotAreaTab and
        MapAreaTab, remove the `tab === 'fence'` branch, and set the note to "Unit conversion, plot
        measurement and boundary area."
      - `FenceTool` (L712): give it the signature `function FenceTool({ initial }: { initial?: string[] })`
        and `useState<string[]>(initial ?? FOUR_SIDES)`. Leave the rest unchanged (Clear still sets
        `FOUR_SIDES`).
      - `Tools()` (L826-L856): add `const [fenceSeed, setFenceSeed] = useState<{ n: number; sides: string[] } | null>(null);`
        and
        `const handOffSides = (m: number[]) => { setFenceSeed((s) => ({ n: (s?.n ?? 0) + 1, sides: m.map((v) => (v > 0 ? String(round2(v)) : '')) })); choose('fence'); };`.
        Do not give it a `use…` name, because it is not a hook. Render
        `<FenceTool key={fenceSeed?.n ?? 0} initial={fenceSeed?.sides} />` and
        `<CalculatorTool onUseSides={handOffSides} />`.
      - Header comment L15-L16: "Area — … converter, plot area, and area from a pasted GeoJSON
        ring; Plot area and Map area hand their sides, in metres, to the Fence tab." The old
        feet/`fenceEstimate` sub-tab is retired.
      In `$R/packages/core/src/land/landcalc.ts` L179-L180, change the comment only: "two screens
      still call it" → "one older screen (ParcelDetailPage) still calls it". No code change in core.
      Files: `$R/apps/web/src/w360/pages/Tools.tsx`, `$R/packages/core/src/land/landcalc.ts` (comment)
      Verify: `cd $R/apps/web && bun run typecheck` exits 0. From `$R`, run
      `bun run scripts/shared-components-tests.ts` (passes with the Tools budget unchanged),
      `bun run scripts/hooks-tests.ts`, `bun run scripts/provenance-tests.ts`,
      `bun run scripts/fence-tests.ts` and `bun run scripts/area-tests.ts`; all pass.

- [ ] 4. Docs.
      In `$R/docs/specs/2026-08-15-web-360-design.md`:
      - In the paragraph "The same calculator is also a Tools tab, `/app/tools?tab=fence` …" (~L582-L589),
        append that the Area calculator's own Fencing sub-tab (feet, `fenceEstimate`) is retired,
        and that Plot area and Map area hand their sides to this tab in metres (a rectangle as
        L, W, L, W; a ring through `ringSides`), so there is one fence calculator in Tools.
      - ~L620-L621: "`fenceEstimate` in core (two older screens still call it)" → "(one older
        screen, the legacy parcel detail, still calls it)".
      Do not edit design.md. It does not describe the sub-tab. Report the `.search` drift
      (design.md vs w360.css L202/L2724) to Reddy in the evidence section instead.
      Files: `$R/docs/specs/2026-08-15-web-360-design.md`
      Verify: re-read the edited paragraphs. Confirm that `git diff` on that file shows only your
      lines on top of the Part 1 hunk.

- [ ] 5. Sealed e2e: update and add tests. Depends on steps 2 and 3.
      In `$R/tests/e2e-app/specs/19-sections-legacy.spec.ts` (describe `'the tools, drawn in this app'`):
      - "all five tools…" test (~L1590): add `await expect(page.locator('main .pagehead .eyebrow')).toHaveCount(0);`
        (A).
      - L1658: `getByRole('textbox', …)` → `getByRole('searchbox', { name: 'Search SRO offices' })`.
      - New SRO test (C), with `legacyApi(page, { sroOffices: SRO_OFFICES })` on `?tab=sro`.
        Assert that `search = page.locator('main .search').first()` and
        `table = page.locator('main .scroll-x').first()` have bounding-box `x` within 1 px, and
        that `getComputedStyle(searchbox).borderTopWidth` is `'0px'` (one frame: only the `.search`
        pill draws). This is the runtime proof that the plan could not check statically. If the x
        values differ, find the cause at runtime (for example a parent grid or flex) and fix it in
        Tools.tsx only.
      - The area-calculator test (~L1854): the note regex becomes
        `/Unit conversion, plot measurement and boundary area\./` (this also fixes the stale
        "Convert between…" pin that Part 1 recorded as already failing). The tab list becomes
        `['Unit converter', 'Plot area', 'Map area']`. Add
        `await expect(page.getByRole('tab', { name: 'Fencing', exact: true })).toHaveCount(0);`
        and `await expect(page.getByLabel('Perimeter (ft)')).toHaveCount(0);`.
      - Replace "the perimeter I measured carries into the fencing estimate…" (~L1925-L1936) with:
        a 100 × 50 ft rectangle, then "Use in Fencing →". Expect `toHaveURL(/\/app\/tools\?tab=fence$/)`,
        the tab 'Fence calculator' with `aria-selected=true`, `Side A–B (m)` = `30.48`,
        `Side B–C (m)` = `15.24`, `Side C–D (m)` = `30.48`, `Side D–A (m)` = `15.24`, and
        `.fs-tool` containing "4 sides" and "91.4 m".
      - New: a 100/100/100 m triangle hands over 3 sides (`Side A–B (m)`, `Side B–C (m)`,
        `Side C–A (m)` = `100`, and `Side D–A (m)` has count 0).
      - New: a quadrilateral in metres (40/30/40/30, diagonal 50) hands over 4 sides, and the
        diagonal is not one of them (`.fs-tool` has "4 sides" and "140.0 m").
      - New: the existing L1957 GeoJSON square, then "Use in Fencing →", gives 4 side boxes, each
        non-empty, and `.fs-tool` containing "4 sides" plus a total near 871.2 m. Needs
        verification during implementation: read the exact figure at runtime (each side is
        `round2`ed before summing) and pin the rendered string.
      - New: a rectangle with only Length 100 ft hands over two filled sides and two blank ones
        ("2 sides"), not 0 m sides.
      - Delete "a fence with no prices quoted keeps quiet about the cost" (~L1938-L1946). Its
        subject, FencingTab, is retired, and the fence tab's own empty-state tests from Part 1
        cover "no rates".
      - Keep the `?tab=calculator` and `/legacy/tools?tab=calculator` tests (~L1606, ~L1625) and
        the L421 `/legacy/calculator` redirect row unchanged. They are the only old deep links
        (see Facts) and must still pass.
      Files: `$R/tests/e2e-app/specs/19-sections-legacy.spec.ts`
      Verify: `cd $R/tests/e2e-app && APP_WEB_URL=http://localhost:5173 bunx playwright test specs/19-sections-legacy.spec.ts --project=app -g "tools, drawn"`.
      Every new or updated test passes. The only allowed failure is the already-known "These are
      reference guideline values…" market-value copy test that Part 1 recorded. Then run
      `-g "phone|SRO" --project=phone` and expect a pass.

- [ ] 6. Full verification, visual check, evidence and cleanup.
      Run from `$R`, and paste each exit status or pass/fail line into an "Evidence (plan2)" section
      appended to this file:
      - `cd apps/web && bun run typecheck` and `cd apps/web && bun run build`.
      - `for f in scripts/*-tests.ts; do echo "== $f"; bun run "$f" || echo "FAILED $f"; done`.
        The typography TY-5 failure on the unmodified `apps/university/src/styles.css` is already
        known; anything else must be fixed.
      - `bun run scripts/icon-guard.ts` and `bun run scripts/ux-guards.ts`.
      - `.local/api-venv/bin/python -m pytest services/api/tests -q`.
      - Sealed e2e: the step 5 commands, plus
        `bunx playwright test specs/17-villages.spec.ts --project=app -g "fence|Fence"` (FenceStudio
        unaffected), `specs/26-one-font.spec.ts --project=app` (visits `?tab=calculator`), and
        `specs/01-shell.spec.ts specs/21-routing.spec.ts --project=app`. Part 1 recorded many
        environment failures in 01/21 that were already there. Report only the Tools-related
        results and confirm none of the failures are new by comparing failure titles with Part 1's
        evidence.
      - Visual (needs verification during implementation): add a throwaway sealed spec
        `$R/tests/e2e-app/specs/zz-tmp-tools2.spec.ts` that screenshots `?tab=sro` (seeded with
        `SRO_OFFICES`) at 1512 (app) and 390 (phone), plus the Area calculator after a hand-off.
        Inspect the PNGs and check: no eyebrow above "Tools"; the search's left edge on the
        table's; one frame round the search; three Area sub-tabs. Delete the spec, the PNGs and its
        output afterwards.
      - Not run, with the reason: e2e-web360 (it needs its own API, DB and build); a live API
        check of SRO order against the user's DB (that needs approval, because it touches
        live/founder data).
      Change-governance notes to record:
      - Docs: step 4.
      - Architecture: no new route, trust boundary or data flow. The hand-off is React state
        within one page.
      - Security/privacy: one static SQL ORDER BY with no input, the same read on reference data,
        and no PII.
      - Testing: as above.
      - Cleanup: no processes are left running apart from the user's :5173; temp spec and PNGs
        removed; the gitignored `test-results/`, `playwright-report/` and `apps/web/dist/` are left
        alone, as in Part 1.
      - For Reddy, not done: the `.search` CSS drift (shared centring and the `type='text'` frame
        rule); findings 2, 3/4, 6 and 10.
      Files: `$R/.agents/tasks/tools-fence-tab/plan2.md` (evidence section)
      Verify: every command above has its result recorded. Each failure is either fixed or shown to
      be pre-existing.
