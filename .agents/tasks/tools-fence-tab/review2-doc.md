# Tools follow-up A–D: drop the eyebrow, sort SRO codes as numbers, fix the SRO search, retire the Fencing sub-tab

The change applies the four approved Tools audit fixes on top of the kept Part 1 fence tab. Tools loses its "Account" eyebrow. The `sroOffices` resolver orders digit codes as numbers, with a Python test against a temporary Postgres. The SRO search becomes `type="search"` and is pinned to the card's start edge inline, so the shared `.search` rule is untouched. The Area calculator's feet-based Fencing sub-tab is deleted, and both "Use in Fencing →" buttons now pass their sides, in metres, into `?tab=fence`. Core `fenceEstimate` stays because `ParcelDetailPage.tsx:310` still uses it.

Watch for: no `?tab=area` redirect was added. The brief asks for one, but the repository shows that address never existed (confirmed, non-blocking; Reddy decides whether to add it). Fence edits made after a hand-off are replaced by the seed when the user switches tabs and comes back (confirmed, minor, non-blocking).

**Verdict**: APPROVED

## High-level view

A. `Tools.tsx` now renders `<PageHead title="Tools">`. That matches the PageHead contract (ui.tsx L399-L404: top-level pages carry no eyebrow) and Tools' rail position under Help & resources (Shell.tsx L419-L425). The tools test now asserts `main .pagehead .eyebrow` has count 0. No earlier test pinned the eyebrow.

B. The resolver now runs `ORDER BY CASE WHEN code ~ '^[0-9]{1,18}$' THEN code::bigint END NULLS LAST, code, id` (main.py L2051-L2053). The SQL is a static string with no input. The 18-digit bound keeps the cast inside bigint. Non-digit codes go last in text order, and `id` breaks ties such as "0102" against "102". The new test covers the cases that matter: 99, 101, 0102, 513, 1009, 1010, then AB1, plus an empty table. The evidence shows it ran with "2 passed", not skipped. The web client only filters, so there is no client sort to fix.

C. The search change is two inline edits in SroTool (Tools.tsx L189-L192). `type="search"` drops the `.w360 input[type='text']` frame, as Properties.tsx already does, and `justifySelf: 'start'` affects only that one div. `w360.css` is not touched, so the centred top-bar jump box and the other `.search` users cannot regress. A new e2e test measures the alignment at runtime (search x equals table x within 1 px) and checks the single frame (inner `borderTopWidth` is 0px). The one test that used the textbox role was moved to `searchbox`.

D. `FencingTab`, the `'fence'` sub-tab and the `fenceEstimate` import are removed. `UsePerimeter` keeps its label and its ft note, but now hands over `sidesM`. For a rectangle that is [L, W, L, W]. A triangle gives 3 sides, a quadrilateral 4 (the diagonal is excluded), and a ring goes through `ringSides`. Plot sides are converted with the existing `toFeet(v, lu) / LENGTH_FT.m`. `Tools()` stores a keyed `fenceSeed`, `FenceTool` starts from it, and blank or zero sides become blank boxes. E2e tests cover every shape, the length-only case and the GeoJSON ring (871.2 m). They also cover the failure path: a handed-over side changed to −5 is aria-invalid, shows the alert and disables Print. The design doc and the landcalc comment are updated, and design.md is not edited.

<details>
<summary>Issues (3)</summary>

1. **No `?tab=area` alias (non-blocking, confirmed)**: the brief expects an old `?tab=area` fencing link to redirect to `?tab=fence`. `git log -S"tab=area"`, `git grep` and routes.tsx L307-L312 show that address never existed, and the sub-tab lived only in component state. Today `?tab=area` falls back to SRO, like any unknown tab. Reddy should decide whether he wants the alias. Adding it now would be invented behaviour.
2. **Hand-off seed comes back on tab revisit (non-blocking, confirmed)**: `FenceTool` unmounts when another tab is chosen. When the user returns, it remounts with the same `key` and `initial`, so edits made after the hand-off are replaced by the handed-over sides, not by blanks. If that is unwanted, clear `fenceSeed` after the first mount or keep the edited sides in `Tools()`. Build and rates persist in localStorage, so only the sides are affected.
3. **Full pytest has one failure (non-blocking, likely pre-existing)**: `test_audit.py::test_enqueue_then_worker_drains_to_read_model` failed in the full run and passed alone. It does not read `sro_offices`. Not re-run here, per the brief.

</details>

<details>
<summary>Details</summary>

### Old deep links into the retired sub-tab

The real compatibility surface is `?tab=calculator` and `/legacy/calculator` → `/legacy/tools?tab=calculator` (routes.tsx L307-L312). Both still open the Area calculator. The existing tests at about L1606 and L1625, and the L421 redirect row, were kept, and the evidence records 21-routing:694, which includes `/legacy/calculator`, passing alone. The sub-tab's old in-state id was `'fence'`, which is now the top-level id, so a hand-typed `?tab=fence` reaches the new tab. `git grep` finds no in-app link into the Fencing sub-tab. The only `/app/tools?tab=` links are `sro` and `stamp-duty` (DashboardPage.tsx L284-L285, Shared.tsx L296). Nothing that used to work breaks. The missing `?tab=area` alias is a gap only against the brief's assumption, and the coder recorded it for Reddy instead of inventing it.

### Hand-off state model

```
PlotAreaTab / MapAreaTab ─ sidesM (m) ─▶ handOffSides (Tools)
     setFenceSeed({ n+1, sides: v>0 ? String(round2(v)) : '' })
     choose('fence')  ──▶ <FenceTool key={n} initial={sides}/>
```

The incrementing key gives a fresh mount for each hand-off, including a repeat of the same sides. The cost is Issue 2: the seed is kept for the life of the page, so leaving the Fence tab and returning restores the seed rather than the user's edits. Before this change, a revisit reset to four blank sides, so this differs from the old behaviour, though not in a harmful way. Clear still resets to `FOUR_SIDES`. The ring path uses `ringSides(ring).map(s => s.metres)` in a memo, and the tests prove the closing vertex is not counted (no `Side E–A`).

### Conventions

The diff adds no `font-family` and no 500, 600 or 800 weight. Totals use `num()` and `.num` for tabular figures. The fence sheet date is pinned to DD/MM/YYYY in the e2e test. FenceTool composes `Card`, `Empty`, `plural`, `num`, the page's existing `NumField` and the shared FenceParts components, and the shared-components guard passes with the Tools budget unchanged. The only new copy is the calculator note, made shorter by deleting words. The "· Fencing" lede and the fence-tab copy come from the kept Part 1 work.

### Evidence review

followup.md records typecheck and build PASS, and every `scripts/*-tests.ts` passing except typography. TY-5 (`apps/university/src/styles.css` 800 weights) is recorded as pre-existing, and that file is not in the working-tree diff, so it was not silently fixed. icon-guard and ux-guards PASS. The new pytest shows "2 passed". The 19-sections tools suite shows 43 passed, with the one known market-value copy failure. The phone run passes, 17-villages fence passes 9, and 26-one-font passes 52. The 01/21 failures are attributed to environment and foreign-tree causes, and none of their titles name tools, SRO, fence or calculator. The visual check at 1512 and 390 is recorded textually: no eyebrow, x 305/305 and 41/41, one frame, three sub-tabs, the 30.48/15.24 hand-off, and −5 refused. No spot-check was needed. Not covered: e2e-web360, and a live API order check against the user's DB, which needs approval.

</details>

<details>
<summary>File map</summary>

- `apps/web/src/w360/pages/Tools.tsx`: eyebrow removed; SRO search type/alignment; FencingTab and its sub-tab removed; metre side hand-off into the Part 1 FenceTool via `fenceSeed`.
- `services/api/src/main.py`: numeric `ORDER BY` in `sro_offices`.
- `services/api/tests/test_sro_offices_order.py` (new): isolated-Postgres order and empty tests.
- `packages/core/src/land/landcalc.ts`: comment only ("one older screen").
- `docs/specs/2026-08-15-web-360-design.md`: retired sub-tab and metre hand-off recorded.
- `tests/e2e-app/specs/19-sections-legacy.spec.ts`: eyebrow, searchbox, alignment/frame, three sub-tabs, shape hand-offs, failure path.
- Kept or foreign, not reviewed: FenceStudio.tsx, FenceParts.tsx, fenceBill.ts, fence-tests.ts, w360.css, VillageMaps/Dashboard/CombinedProperty/Properties/Vault, 17-villages.

Full diff: `git diff -- apps/web/src/w360/pages/Tools.tsx services/api packages/core/src/land/landcalc.ts docs/specs/2026-08-15-web-360-design.md tests/e2e-app/specs/19-sections-legacy.spec.ts`

</details>
