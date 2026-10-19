# Verification — follow-up (whole-parcel → Google Maps, "You are here" label, sealed test)

Iteration 1 (no followup-review.json existed). Run 03–04/10/2026 from the repo root,
on top of the user's uncommitted tree. Nothing committed or pushed.

## Static checks

| Command | Result |
|---|---|
| `cd packages/core && bun run typecheck` | exit 0 |
| `cd apps/web && bun run typecheck` | exit 0 (rerun after the final MapCanvas edit) |
| `bun test packages/core/src/land` | 19 pass, 0 fail |
| `bun test packages/core packages/tokens apps/web/src apps/mobile/tests apps/university/src` (CI line) | 812 pass, 0 fail, 51 files |
| `bun test apps/web/src` (rerun after the final edit) | 363 pass, 0 fail |
| `for s in scripts/*-tests.ts` | all 20 exit 0 (a11y-web, aadhaar-digits, area, cache-eviction, contrast-helper, contrast, fence, geo, hooks, lifecycle, network-interest, palette, plural, provenance, screening, shared-components, typography, url-scheme, village, vocab). typography, shared-components, contrast, palette, a11y-web and geo were rerun after the final edit and passed. |
| `bun run scripts/icon-guard.ts` | ICON GUARD PASSES |
| `bun run scripts/ux-guards.ts` | UX GUARDS PASS |
| `bun run scripts/emit-vectors.ts --check` | VECTORS CURRENT (no vector diff) |
| `cd apps/web && bun run build` | ✓ built |
| `bun build --no-bundle` on `09-record-boundary.spec.ts` and `e2e-web360/specs/screens.spec.ts` | both parse |
| grep `mapsLink\|mapsAppFor\|mapsAppName\|safeMapLabel\|MapsLinkOptions\|MapsApp\b` (excluding .worktrees, .agents, node_modules, dist) | only the two docs sentences that say it was removed |

## E2E (tests/e2e-app, sealed)

I started an agent-owned dev server: `cd apps/web && WEB_PORT=5193 VM_DIR=off bunx vite --strictPort`.
I did not touch :5180 or :5181. Then I ran
`APP_WEB_URL=http://localhost:5193 bunx playwright test specs/09-record-boundary.spec.ts --project=app --project=phone --reporter=line --output=/tmp/pp-e2e-out`.
The `--output` and line-reporter flags left the gitignored results.json, playwright-report and test-results alone.

Result: 86 passed, 19 failed. Every test this task touches passed:

- the phone standing on the land can set the pin itself (now routes `**/vm/index.json` to `[]`)
- an empty record offers the phone, finds its survey, and writes nothing until asked (now asserts one `.leaflet-tooltip.w-here-tip` reading "You are here", visible, and gone after Save pin)
- a phone outside every plot…
- with no village map the survey is not guessed
- the whole-parcel hand-off is Google Maps directions to the middle of the land (`menuitem` "Navigate in Google Maps", an `<a>`, href exactly `https://www.google.com/maps/dir/?api=1&destination=15.7406,79.269902`, no `q=`, no Apple/OSM/"Open in" item)
- GeoJSON is offered for export only where there is a boundary to export (no "Open in" and no "Google Maps" item on the no-ring, no-pin record)
- the corner and side Navigate href tests

The 19 failures are pre-existing. They come from the user's uncommitted copy and behaviour changes, not from this task. None of them touches the hand-off, the tooltip or the location flow. Each one is copy drift or a missing element:

- "…saved to this record." is now "…to this property."
- "No surveyed boundary on this record." is now "No boundary saved on this property."
- "1 of these 3 stones" is now "1 of 3 stones"
- the `main > p.eyebrow` and "Map & boundary" heading are missing
- the "Import KML / GeoJSON" button is missing
- the extent-warning copy changed
- the move-mark hint copy changed

Failing tests by line: 194, 438, 591, 599, 915, 950, 1045, 1057, 1066, 1451, 1566, 1703, 1737, 1762, 1781, 1808, 1878, 1930, 1937. None of these lines was edited here.

There was one real bug in the first run. Two `.w-here-tip` labels existed at once, because when the plot is found the layer is redrawn, and Leaflet fades the old label out over 200 ms (`_fadeAnimated`). The label is now a standalone `L.tooltip` inside the "here" layer group, so `clearLayers()` owns it. The test waits for `toHaveCount(1)` before it reads the text. After that change it passed on both app and phone.

VM flip check: I skipped it, because it proves nothing here. `.local/vm-build/index.json` and `apps/web/public/vm/index.json` have 0 Katragunta hits. The test is now sealed by its own route either way.

## Visual check of the tooltip

I temporarily added a `.plot` screenshot after the tooltip assertion and a temporary `@phone` tag, and ran it on app (1512×950) and phone (iPhone 14). I looked at both images. On both:

- "You are here" sits directly above the blue dot. Its pointer touches the dot, and it clears the draft pin and the plot outline.
- It reads ink-on-surface in bold Atkinson Hyperlegible, with an info-blue hairline and pointer, and stays legible on the basemap.
- It does not cover the `.mapsays` hint, the zoom control or the chips.

On both viewports, the "Showing Katragunta, from the village map…" note overlaps the Use-location/Save-pin bar. That is the user's existing overlay layout, not this label, and I left it unchanged. I removed the screenshot line and the tag (grep for PPTEMP returns 0) and deleted the images.

## Not run / not verified

- `tests/e2e-web360` (needs its own API/DB stack). The two rewritten screens.spec tests were parse-checked only.
- The FMB viewer's "Navigate in Google Maps" button has no e2e coverage. It is covered by typecheck and code review only.
- A real device opening the Google Maps app.
- iOS and Expo were not changed. The follow-ups are recorded in `docs/specs/2026-08-22-web-ios-parity-contract.md` §3.

## Cleanup

- I stopped the agent-started Vite (:5193). An earlier attempt was suspended by job control (state `T`, it never served); I killed that one too.
- No playwright process remains.
- All `/tmp/pp-*` scratch files are deleted.
