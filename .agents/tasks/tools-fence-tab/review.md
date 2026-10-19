# Standalone Fence calculator tab on W360 Tools, sharing the village-map studio's bill (pass 2)

The change adds a fifth Tools tab, `?tab=fence`, which prices a fence from side lengths typed in metres with no map shape. FenceStudio's arithmetic now lives in `fenceBill.ts`. Its Step 2 fields, Step 3 bill, print sheet and remembered `w360.fence` build live in `FenceParts.tsx`, and both the studio and the new tab compose them. The village-map entry point is unchanged and still opens. The SRO audit findings are correctly left unfixed because their root causes are in `services/api`. This pass checks the iteration-2 fixes for the two blocking pass-1 findings and the duplicated-title nit. All three are fixed and pinned by e2e.

Watch for: when a middle row is blank and "goes all the way round" is ticked, the bill prices a closed loop of the remaining sides. The sheet, however, now names those sides as a run with a gap (A–B, C–D, D–A), so the corner-post count is one lower than those names imply (confirmed, non-blocking).

**Verdict**: APPROVED

## High-level view

The pricing is reused, not duplicated. `fenceBill` keeps FenceStudio's formulas, defaults (3 / 4 / 1 / 3.6 / 500), placeholders (250 / 12 / 6000) and copy, and `fence-tests.ts` pins them. FenceStudio keeps its props, DOM classes and `fs-*` ids. The coder's 17-villages run (9 passed) shows the map calculator still opens, prints, raises work and returns focus, and its sheet date is now DD/MM/YYYY via `formatDate`. No dependencies were added. The tab composes `Card`, `Empty`, `num` and `plural` from `ui.tsx` and Tools' own `NumField`/`TabStrip`, and the Tools component budget is unchanged. The CSS adds no font family or weight. Digits sit in `.num` cells.

The pass-1 print defects are fixed. `FenceSheet` takes an optional `names` list, and the tab passes the on-screen name of each kept side, so the sheet's letters match the rows. Print is disabled while any side is invalid as well as when none is valid, so a refused side can no longer go missing from the supplier sheet without notice. The sheet title is optional and the tab passes none, so the header line is the date alone. Each fix has an e2e assertion.

One edge stays open. A blank row is treated as "not entered yet", and the closed flag is passed through unchanged. Three filled sides out of four with a blank B–C are therefore priced as a closed triangle (3 corner posts). The sheet now labels those sides A–B, C–D, D–A, which describes four corners with B–C left open. In the studio, skipping a side opens the run (`closed && dropped.size === 0`). This deserves a product decision (Reddy, alongside R1/R2) but does not block: the on-screen note ("3 sides · 280 m") is accurate, and a user fencing three sides of four is told to untick the loop box.

<details>
<summary>Issues (3)</summary>

1. **Blank middle row priced as a closed loop** (non-blocking, confirmed). `FenceTool` passes `closed` to `fenceBill` even when a row inside the loop is blank, so A–B / blank / C–D / D–A gives 3 corner posts while the sheet's names describe 4 corners. Reddy should decide whether a blank row means "skipped side", which would open the run as the studio does (`closed && kept.length === sides.length`), or "not entered yet", in which case a hint should ask the user to remove the row or untick the box. Either way, add an e2e for the corner count.
2. **Two fencing tools on one page** (non-blocking, for Reddy, confirmed). The Area calculator's older "Fencing" sub-tab still uses `fenceEstimate`, which gives 2 fewer posts than the new tab on 100/80/100/80 (plan R1).
3. **Selected tab off-screen at 390 px** (non-blocking, for Reddy, confirmed by the coder's measurement). The page does not scroll sideways, but inside the scrolling strip the selected "Fence calculator" tab starts out of view. It needs a scroll-into-view on load.

</details>

<details>
<summary>Details</summary>

### Iteration-2 fixes

`keptNames` is built from the same `metres`/`bad` filter as `kept`, so the two arrays line up index for index. `FenceSheet` falls back to `sideName(i, sides.length, closed)` when `names` is absent, so the studio sheet is unchanged ("Plot 215 · KATRAGUNTA · date"). The new e2e "a side left blank keeps the other sides under the letters they have on screen" asserts `['A–B', 'C–D', 'D–A']`. The invalid-input e2e now checks that Print is disabled while −5 is showing and enabled again after the side is corrected. The print e2e asserts the header is exactly `dd/mm/yyyy`.

### Blank rows versus the closed flag

```
rows      A–B=100   B–C=""   C–D=100   D–A=80     closed ✓
bill      fencePlan([100,100,80], closed) → corners 3, perimeter 280
sheet     A–B 100 · C–D 100 · D–A 80              ← names imply corners A,B,C,D
studio    same skip on the map → closed && dropped.size===0 → open run, corners 4
```

`fencePlan` sets `corners = closed ? sides : sides + 1` (landcalc.ts). With the loop box ticked, the tab therefore prices the three kept sides as a triangle. Before the `names` fix the sheet hid this by relettering. Now that the sheet tells the truth about which side is missing, the bill and the sheet disagree by one corner post, and the two entry points disagree on the same physical fence. The ambiguity is real, though. With the four default rows, a user pricing a triangle leaves D–A blank and wants 3 corners. Opening the run on any blank row would break that case. That is why this needs a product decision and not a quick code change.

### Invalid input and NumField

`NumField` is `type="number"`, so non-numeric text reads as empty and counts as "not entered". Only zero and negative values reach the `aria-invalid`/alert path. This comes from reusing Tools' existing field, as the plan asked.

### SRO tab

No SRO code changed. The lexical code sort (`ORDER BY code` on a TEXT column) and the empty DR zone/district/mandal columns (the importer writing `""`) are `services/api` and reference-data root causes. Leaving them for Reddy is correct.

### Test coverage and evidence

Iteration-2 evidence: typecheck and build exit 0. Every guard passes except typography TY-5 on unmodified `apps/university/src/styles.css`, which was already failing at HEAD. icon-guard and ux-guards pass. All 7 fence/lede tests in 19-sections-legacy pass on app, plus @phone width on both projects. The 17-villages fence tests (9) pass. The two pre-existing Tools copy failures and the 01-shell/21-routing failures were baselined against HEAD in iteration 1.

Not tested: the corner count with a blank middle row, and e2e-web360 `crud-360`/`map-village` (no local API/DB; the `fs-*` ids are preserved).

### Bundled working-tree changes

`VillageMaps.tsx`, `Dashboard.tsx`, `CombinedProperty.tsx`, `Properties.tsx`, `Vault.tsx`, the `.sec-first`/`.vm-place` CSS hunks and `17-villages.spec.ts` belong to `combined-overview-ux-fix` (plan D9). Nothing is committed, and whoever commits must split them out.

</details>

<details>
<summary>File map</summary>

- `apps/web/src/w360/fenceBill.ts` (new): pure fence sums, defaults, `GATE_POSTS`.
- `apps/web/src/w360/FenceParts.tsx` (new): `useFenceBuild`, `FenceBuildFields`, `FenceBillTable`, `FenceSheet` (now with optional `title`/`names`), `FencePlan`, `sideName`.
- `apps/web/src/w360/FenceStudio.tsx`: composes the shared parts; keeps the map, side toggles and request.
- `apps/web/src/w360/pages/Tools.tsx`: `FenceTool`, the fifth tab, the lede, the `NumField` `invalid` prop.
- `apps/web/src/w360/w360.css`: `.fs-tool` layout and print rules (plus foreign hunks).
- `scripts/fence-tests.ts`: `fenceBill` checks.
- `tests/e2e-app/specs/19-sections-legacy.spec.ts`: the five-tab test and the fence scenarios, including the blank-row sheet test.
- `docs/specs/2026-08-15-web-360-design.md`: a note on the standalone tab.

Full diff: `git diff` in the working tree, plus the untracked `fenceBill.ts` and `FenceParts.tsx`.

</details>
