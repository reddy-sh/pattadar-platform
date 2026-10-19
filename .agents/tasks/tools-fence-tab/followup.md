# Tools UX follow-up (plan2 A–D): evidence

Iteration 1 (there was no review2.json). Main checkout, nothing committed. Foreign hunks were not touched: no edits to w360.css, VillageMaps, Dashboard, CombinedProperty, Properties, Vault or 17-villages.

## What changed

- A: `apps/web/src/w360/pages/Tools.tsx`: `<PageHead title="Tools">`, with no `eyebrow="Account"`.
- B: `services/api/src/main.py` `sro_offices` resolver now uses
  `ORDER BY CASE WHEN code ~ '^[0-9]{1,18}$' THEN code::bigint END NULLS LAST, code, id`. This is a static SQL string with no input. New test: `services/api/tests/test_sro_offices_order.py` (isolated temp Postgres on :55491). The web client does not re-sort (`useSroOffices` / SroTool only filter).
- C: in Tools.tsx only, the SRO search input is `type="search"` (one frame: `.w360 input[type='text']` no longer matches) and that one `.search` div has inline `justifySelf: 'start'`. The shared `.search` rule in w360.css is unchanged, so the top-bar jump box and the other 9 `.search` users keep their look.
- D: `FencingTab`, the `'fence'` sub-tab, the `perimeterFt` state and the `fenceEstimate` import were removed from Tools. `UsePerimeter` keeps the same label and note. It now hands over sides in metres (`toFeet(v, lu) / LENGTH_FT.m`): a rectangle as [L, W, L, W], a triangle as 3 sides, a quadrilateral as 4 (the diagonal is excluded), and a ring through `ringSides`. `Tools()` holds `fenceSeed`, and `<FenceTool key initial>` starts from those sides on `?tab=fence`. A blank or zero side arrives as a blank box. The calculator note is now "Unit conversion, plot measurement and boundary area." (a deletion only). Core `fenceEstimate` is kept because `ParcelDetailPage.tsx:310` still uses it. Only its comment changed (landcalc.ts L179). It is not in the parity map, iOS or mobile.
- Deep links: the Fencing sub-tab never had a URL (plan2 Facts). `?tab=fence` was its id and now opens the Fence tab. `?tab=calculator` and `/legacy/calculator` still open the Area calculator (tests pinned). No `?tab=area` alias was added: it never existed and still falls back to SRO like any unknown tab. That would be invented behaviour, so it is left for Reddy if wanted.
- Docs: `docs/specs/2026-08-15-web-360-design.md` records the retired sub-tab, the metre hand-off, and "one older screen" for `fenceEstimate`. design.md was not edited.
- Tests: `tests/e2e-app/specs/19-sections-legacy.spec.ts` asserts no eyebrow, uses the `searchbox` role, and has a new SRO alignment and one-frame test. The area-calculator test now expects 3 sub-tabs, no Fencing and no "Perimeter (ft)". The old feet hand-off and the "no prices" FencingTab test are replaced by hand-off tests for the rectangle (30.48/15.24, "4 sides", "91.4 m"), triangle (3 sides), quad (4 sides, "140.0 m"), a length-only rectangle (2 blank sides, "2 sides"), a GeoJSON ring (4 sides, "871.2 m") and a failure path (a handed-over side set to −5 is refused, aria-invalid, Print disabled).

## Commands and results

| Command | Result |
|---|---|
| `cd apps/web && bun run typecheck` | PASS (exit 0) |
| `cd apps/web && bun run build` | PASS (exit 0, built) |
| `bun run scripts/<each>-tests.ts` (a11y-web, area, cache-eviction, contrast-helper, contrast, fence, geo, hooks, lifecycle, plural, provenance, screening, shared-components, typography, url-scheme, village, vocab) | All PASS except typography: known pre-existing TY-5 (`apps/university/src/styles.css:1488/1520/1538 font-weight: 800`), not fixed |
| `bun run scripts/icon-guard.ts`, `bun run scripts/ux-guards.ts` | PASS, PASS |
| `.local/api-venv/bin/python -m pytest services/api/tests/test_sro_offices_order.py -q` | 2 passed (not skipped) |
| `.local/api-venv/bin/python -m pytest services/api/tests -q` | 522 passed, 1 failed: `test_audit.py::test_enqueue_then_worker_drains_to_read_model`. It passes alone (`pytest services/api/tests/test_audit.py` → 26 passed), so it is order-dependent and does not read `sro_offices`. Not caused by this change |
| `cd tests/e2e-app && APP_WEB_URL=http://localhost:5173 bunx playwright test specs/19-sections-legacy.spec.ts --project=app -g "tools, drawn"` | 43 passed, 1 failed: the known pre-existing market-value copy test ("These are reference guideline values…", L1798) |
| same spec `--project=phone -g "phone\|SRO"` | 1 passed |
| `specs/17-villages.spec.ts --project=app -g "fence\|Fence"` | 9 passed |
| `specs/26-one-font.spec.ts --project=app` | 52 passed |
| `specs/01-shell.spec.ts specs/21-routing.spec.ts --project=app` | 72 passed, 84 failed. No failing title mentions tools/SRO/fence/calculator. The failures are in jump box, rail, assistant, dialog, toasts, top bar and phone. 21-routing:361 fails on route-table drift (`/app/combined`, `/app/surveys`, … missing from fixtures/ids.ts). 21-routing:488 fails on a `DeskAssociate.tsx` `.trim` render error. 21-routing:694 (old addresses incl. `/legacy/calculator`) passes alone. Part 1 had 76 failures from the same environment and foreign-tree causes; none of these are in files this task touched |

Visual check: a throwaway sealed spec at 1512 (app) and 390 (phone). The spec and its PNGs were deleted.
- No eyebrow on either viewport.
- Search left edge = table left edge (x 305/305 at 1512, 41/41 at 390), with a single rounded frame.
- Codes render 99, 101, 1001, 1009, 1010. The fixture fed the API's new order; the client shows order as received, and the order itself is proven by the Python test.
- The Area calculator shows Unit converter, Plot area and Map area only.
- 100×50 ft → "Use in Fencing →" → `?tab=fence` with 30.48/15.24/30.48/15.24 and "4 sides · 91.4 m".
- Failure path: −5 shows aria-invalid and the side is dropped ("3 sides · 61.0 m").

Not run: e2e-web360 (needs its own API/DB/build), and a live SRO order check against the user's DB (needs approval; live data).

## Change governance

- Docs: web-360 design doc updated. Drift for Reddy, not changed: design.md L371-375 against the shared `.search` centring and the `input[type='text']` frame (w360.css L202-203, L2724).
- Architecture: no new route, boundary or data flow. The hand-off is React state within one page.
- Security/privacy: one static ORDER BY on reference data, no input, no PII.
- Cleanup: temp spec, PNGs, /tmp logs and `tests/e2e-app/test-results/` removed. No process started by this task is still running. The user's :5173 server was not touched.
- Still with Reddy: audit findings 2, 3/4, 6, 10, and whether a `?tab=area` alias is wanted.
