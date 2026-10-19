# Implementation Plan — Navigate → Google Maps, and "Use my current location" finds the survey

Request (Reddy, 03/10/2026): "navigate should go to google maps. Also when the location is empty or
update my location then allow user to use the current location so that it can find the current
survey in the cadastral map".

## Ground rules for the implementer

- Work directly in `/Users/reddy.sh/reddy.sh/projects/pattadar-platform` (main checkout, no worktree).
  Always use absolute paths.
- The working tree already holds a large set of the user's UNCOMMITTED changes, including
  `apps/web/src/w360/pages/RecordBoundary.tsx`, `apps/web/src/w360/MapCanvas.tsx` and
  `apps/web/src/w360/w360.css`. Edit on top of them. Never revert, stash, reset or reformat
  unrelated hunks. Do NOT commit or push (not requested; the tree mixes unrelated work).
- No new backend contract is needed: the pin is saved through the existing `useSetPin`
  (`mutation SP … web { setPin(recordId, lat, lon) }`, `apps/web/src/w360/api.ts:1684`) and a
  boundary through the existing `useSetBoundary`/`saveDraft` path. `services/api` is not touched.
  Device accuracy is NOT persisted (setPin takes no accuracy argument) — shown on screen only.
- Location is private: never `console.log` coordinates, never send them anywhere new. The survey
  lookup is client-side against village-map data the page already fetches (`/vm/…` static files and
  the existing `/api/gateway/pattadar/village-maps` uploads), so no new network destination.
  The Google Maps URL is only an `<a href>` the user clicks (same exposure as today's Apple/OSM links).
- Styling: existing w360 CSS classes (`btn sm`, `btn primary sm`, `note`, `hint`, `num`,
  `nogeo low`, `plotpick`), `--font-sans` only, weights 400/700 only, digits via `.num` /
  `tabular-nums`. Icons: reuse the already-imported `MyLocationOutlined` (MUI) — no new icon names.

## Decisions (with rationale)

D1. New core helper, `mapsLink` unchanged. Add to `packages/core/src/land/geo.ts`:

```ts
/** Turn-by-turn to one point, in Google Maps (Reddy, 03/10/2026). */
export function navigateLink(to: LatLng): string
// → `https://www.google.com/maps/dir/?api=1&destination=${lat},${lon}`
//   lat/lon via the existing `coord()` (6 decimals, no float noise)
```

  Coordinates only: no label, no `travelmode`, no origin. Google's `destination` is a text/search
  field, so a caption would turn a coordinate into a search (wrong place) and would leak record text
  (title/village/owner) into a third-party URL. Returns `''` for a non-finite point or the unset
  `0,0` so callers can hide the link. `mapsLink` keeps serving "Open in <app>" (a *view* hand-off,
  not navigation) — rationale: the request is about Navigate; changing "Open in Apple Maps" for
  iPhone users is a separate decision (see A1).

D2. Callers found (grep of packages/core, apps/web, apps/mobile, apps/ios, tests, docs) and treatment:

| # | Caller | What it is | Change |
|---|---|---|---|
| 1 | `apps/web/src/w360/pages/RecordBoundary.tsx` `cornerTip` (~l.653) "Navigate ↗" | Navigate | → `navigateLink(c)` |
| 2 | same file `sideTip` (~l.596/598) "Corner A ↗" / "Corner B ↗" | per-corner go-to links in the same popup family | → `navigateLink(a)` / `navigateLink(b)`; rename link text to `Navigate to ${nameA} ↗` / `Navigate to ${nameB} ↗` so every navigation link says so (accessible name stays unique per corner) |
| 3 | same file `away` (~l.691) menu "Open in ${mapsAppName}" | view hand-off | unchanged (`mapsLink`) |
| 4 | `apps/web/src/components/FmbMapViewer.tsx:181` "Open in …" | view hand-off | unchanged |
| 5 | `apps/mobile/src/app/property/[id].tsx` 295/350/551 hard-coded `maps.apple.com` ("View full map", "Open in Maps", share text) | Expo view/share, not Navigate | unchanged — Expo follow-up note only |
| 6 | `apps/mobile/src/app/(tabs)/passbooks.tsx:145` `maps.apple.com/?q=` | Expo search | unchanged — follow-up note |
| 7 | `apps/ios/Pattadar/Sources/FMBMapSection.swift:456` `openInMaps` (`maps://`) "Open in Maps"/"Maps"; `PattadarKit/Format/HoldingShare.swift:45` share text | native, bucket 3 | unchanged — iOS follow-up note only |

D3. Parity/vectors: `mapsLink` is deliberately NOT vectored (`scripts/emit-vectors.ts:101-112`,
parity contract bucket 3 "mirror the capability, natively"). `navigateLink` follows the same rule:
not vectored, no `packages/core/vectors` change, no Swift port. Add one sentence to that
emit-vectors comment so the omission is explicit. `bun run scripts/emit-vectors.ts --check` must
still pass unchanged.

D4. Survey lookup: data source = the record's own village map, loaded with the existing
`loadVillage(village, placeWithin)` from `apps/web/src/w360/villageIndex.ts:294` (shipped `/vm/`
GeoJSON + uploaded KMZ maps, cached per tab, rings in `[lat, lon]`, labels already sanitised by
`plotNumber`). `village` = first part of `rec.placeLine` and `placeWithin` =
`rec.placeLine.split(',').slice(1).map(trim)` — exactly what RecordBoundary already passes to
`MapCanvas`, so the same plots are found that the "Village map" chip draws. Point-in-polygon =
core `pointInRing(pt: LatLng, ring: LatLng[])` (`packages/core/src/land/geo.ts`, even-odd ray cast,
already exported from `@pattadar/core`). Scope is the record's village only (see A2).

D5. New pure helper in `apps/web/src/w360/villageGeom.ts` (the module that already holds pure
functions over `VillagePlot[]`):

```ts
/** The plot a point falls in, or null. Bounding-box prefilter, then core pointInRing.
 *  Overlapping plots (bad digitisation) resolve to the smallest by ringAreaSqM. */
export function plotAt(plots: VillagePlot[], at: { lat: number; lon: number }): VillagePlot | null
```

D6. One flow, two entry points, one handler `locateMe()` in RecordBoundary:
  - Entry A ("location is empty"): when `mode === 'idle' && !pinned && !surveyed && !naming`, the
    `.mapsays` area shows a note "No location on this {noun} yet." + `btn sm` button
    "Use my current location" (MyLocationOutlined). It is in `.mapsays` (not the foldable tools
    panel) so it is visible on a phone without opening "Changes the record".
  - Entry B ("update my location" = "Move the pin"): the existing edit-bar button
    "Use my current location" (~l.1084-1117) now calls the same `locateMe()`.
  - `locateMe()` arms `mode = 'pin'` if idle (so the existing Save pin / Cancel edit bar is the
    confirmation — nothing is ever saved without the explicit "Save pin" click).

D7. MapCanvas gets one new optional prop instead of a new imperative method:
`located?: { lat: number; lon: number; accuracyM: number; plot?: Array<[number, number]> } | null`.
Drawn in its own layer group (so the parcel layer effect is not redrawn): accuracy `L.circle`
(radius = accuracyM, class `w-here-acc`, non-interactive), a "you are here" `L.circleMarker`
(class `w-here`, radius 7, non-interactive, tooltip text "You are here"), and, when given, the found
plot outline as a non-interactive `L.polygon` (class `w-here-plot`). It frames ONCE per new fix
(keyed by `lat,lon`): `fitBounds` over the plot ring (or the accuracy circle's bounds when there is
no plot) with the existing `fitOptions(map, still)`. Rationale: the page must not jump on later
re-renders, the same rule the draftPin and parcel framing keep.

## Ambiguities / STOP-AND-REPORT

- STOP-AND-REPORT: none found. Everything is satisfied by existing contracts. If the implementer
  finds a strict need for a `services/api` change (e.g. persisting accuracy or "set by device"),
  STOP and report — do not design it.
- A1 (decision for Reddy, implemented conservatively): only Navigate links switch to Google Maps.
  "Open in Apple Maps / Maps / OpenStreetMap" (menu, FMB viewer) stays device-sniffed. If Reddy
  wants every hand-off on Google Maps, that is a follow-up changing `mapsLink`, its geo-tests and
  two e2e assertions (`09-record-boundary.spec.ts:1886`, `screens.spec.ts:876`).
- A2: the survey is searched only in the record's own village map. A device standing in a
  neighbouring village gets "not inside any plot on the {village} village map". Cross-village
  search (via `loadMandalOverview` outlines) is a possible follow-up, not built here.
- A3: Accuracy is shown, not stored (no backend change). When accuracy > 50 m the found-survey line
  adds "Location is only accurate to ±N m — check the plot before taking it."
- A4: iOS (`SetLocationScreen.swift` already has a `Locator`) and Expo have no equivalent survey
  lookup / Google navigate. Record as follow-ups for `sync-ios` / `mobile-feature-delivery`;
  no vector forces them.

## Steps

- [ ] 1. Core: add `navigateLink` and its tests; update the hand-off doc comment.
      In `packages/core/src/land/geo.ts`: add `navigateLink(to: LatLng): string` (D1) next to
      `mapsLink`, reusing `coord()`; return `''` when either coordinate is non-finite or the point is
      exactly `0,0`. Rewrite the "Handing a parcel to the device's own map" block comment
      (~l.145-155) to say: viewing still goes to the device's own map (`mapsLink`), but *Navigate*
      goes to Google Maps directions — Reddy's decision, 03/10/2026 — because turn-by-turn to a
      field is what people in AP use Google Maps for, the https URL opens the Google Maps app on
      Android and iOS when installed and the web otherwise, and the link carries coordinates only
      (no caption: `destination` is a search field and record text must not leave in a URL).
      Export it from `packages/core/src/index.ts` beside `mapsLink`.
      Create `packages/core/src/land/geo.test.ts` (bun:test, style of `geoPdf.test.ts`):
      exact URL for FIELD_01 `{15.662204, 79.321775}` →
      `https://www.google.com/maps/dir/?api=1&destination=15.662204,79.321775`; float noise trimmed
      (`15.66026000000001` → `15.66026`); no `q=`/label/`travelmode` in the output; non-finite and
      `0,0` → `''`; plus two `pointInRing` cases (inside/outside a square) since step 3 relies on it.
      Add one sentence to the `mapsLink`-not-vectored comment in `scripts/emit-vectors.ts:101-112`
      saying `navigateLink` is not vectored for the same reason.
      Files: packages/core/src/land/geo.ts, packages/core/src/index.ts,
      packages/core/src/land/geo.test.ts (new), scripts/emit-vectors.ts (comment only)
      Verify: `cd packages/core && bun run typecheck` passes; `bun test packages/core/src/land`
      passes; `bun run scripts/geo-tests.ts` still passes (mapsLink untouched);
      `bun run scripts/emit-vectors.ts --check` passes with no vector diff.

- [ ] 2. Web: switch the boundary popup's navigation links to Google Maps.
      In `apps/web/src/w360/pages/RecordBoundary.tsx`: import `navigateLink` from `@pattadar/core`;
      `cornerTip` "Navigate ↗" href → `navigateLink({ latitude: c[0], longitude: c[1] })`;
      `sideTip` corner links → `navigateLink(a)` / `navigateLink(b)` with text
      `Navigate to ${nameA} ↗` / `Navigate to ${nameB} ↗`. Keep `target="_blank" rel="noreferrer"`
      and the `esc()` escaping. Leave `away`/"Open in …" on `mapsLink`. Remove `mapsLink` from the
      import only if no longer used in the file (it still is, by `away`).
      Update e2e assertions: `tests/e2e-app/specs/09-record-boundary.spec.ts:483` — also assert
      `toHaveAttribute('href', /^https:\/\/www\.google\.com\/maps\/dir\/\?api=1&destination=15\.741,79\.2694$/)`
      (the corner printed as `15.741000, 79.269400`; `coord()` trims trailing zeros — confirm the
      exact value against the fixture RING before hard-coding); `tests/e2e-web360/specs/screens.spec.ts:1688-1689`
      regex → `/^https:\/\/www\.google\.com\/maps\/dir\/\?api=1&destination=/`. Grep both specs for
      `name: /Corner [A-Z] ↗/` or similar side-tip link names and update to the new text.
      Files: apps/web/src/w360/pages/RecordBoundary.tsx, tests/e2e-app/specs/09-record-boundary.spec.ts,
      tests/e2e-web360/specs/screens.spec.ts
      Verify: `cd apps/web && bun run typecheck` passes.

- [ ] 3. Web: `plotAt` survey lookup helper with unit tests.
      Add `plotAt(plots, at)` (D5) to `apps/web/src/w360/villageGeom.ts`, importing `pointInRing`
      and `ringAreaSqM` from `@pattadar/core`; convert `[lat, lon]` tuples to `LatLng` for
      `pointInRing`; skip plots with < 3 corners; bbox prefilter before the ray cast.
      Create `apps/web/src/w360/villageGeom.test.ts` (bun:test, style of `villageMeasure.test.ts`):
      point inside one of two adjacent squares returns that plot's `lp`; point outside all → null;
      empty list → null; overlapping plots → the smaller; closed vs open ring both work.
      Files: apps/web/src/w360/villageGeom.ts, apps/web/src/w360/villageGeom.test.ts (new)
      Verify: `bun test apps/web/src/w360/villageGeom.test.ts` passes; `cd apps/web && bun run typecheck`.

- [ ] 4. MapCanvas: draw "you are here" with accuracy and the found plot (D7).
      In `apps/web/src/w360/MapCanvas.tsx`: add the `located` prop to `MapCanvasProps` with a doc
      comment; create `hereRef = L.layerGroup()` in the mount effect (after `shapeRef`, so it draws
      above the parcel) and null it in cleanup; add an effect on
      `[located?.lat, located?.lon, located?.accuracyM, plotKey]` that clears and redraws the group
      and frames once per new `lat,lon` (ref `hereFramedRef`), using `fitOptions(map, still)`.
      Tooltip text set via `textContent` (never innerHTML). `MapCanvasLazy.tsx` needs no change
      (it re-exports `MapCanvasProps`).
      Add CSS in `apps/web/src/w360/w360.css` next to `path.w-mark.draft` (~l.3491), scoped like it
      (`.w360 .leaflet-pane > svg path.…`): `w-here` (fill `var(--w-info)`, stroke `var(--w-bg)`,
      `fill-opacity: 1` — Leaflet's 0.2 default trap noted at l.3480), `w-here-acc`
      (stroke `var(--w-info)`, `fill: var(--w-info)`, `fill-opacity: 0.12`, stroke-width 1),
      `w-here-plot` (no fill, stroke `var(--w-info)`, stroke-width 2.5). Tokens only; no new font,
      weight or colour literal.
      Files: apps/web/src/w360/MapCanvas.tsx, apps/web/src/w360/w360.css
      Verify: `cd apps/web && bun run typecheck` passes; `bun run scripts/typography-tests.ts`,
      `bun run scripts/contrast-tests.ts` and `bun run scripts/palette-tests.ts` pass.

- [ ] 5. RecordBoundary: the "Use my current location" flow (depends on 3 and 4).
      In `apps/web/src/w360/pages/RecordBoundary.tsx`:
      a. State: `here: { lat; lon; accuracyM } | null`, and
         `found: { state: 'looking' } | { state: 'plot'; plot: VillagePlot } | { state: 'none'; why: 'outside' | 'nomap'; far: string } | null`.
         Clear both in `stopEditing()` and in the `[rec.id]` reset effect.
      b. `locateMe()` (replaces the inline handler at ~l.1084-1117, same `pendingRead` request-id
         guard so a stale reply after Cancel/record change is ignored):
         - `setPinErr('')`; if `window.isSecureContext === false` →
           "Location needs a secure (https) page. Click the map instead." and return;
           if `!navigator.geolocation` → keep the exact string "This browser will not share a location."
         - if `mode === 'idle'`: `setDraft([]); setPlot(null); setPinDraft(null); setMode('pin')`.
         - `setBusy('Reading your location…')`; `getCurrentPosition(ok, fail,
           { enableHighAccuracy: true, timeout: 12_000, maximumAge: 0 })`.
         - fail: PERMISSION_DENIED → keep exact "Location permission was refused, so the pin was not
           moved."; POSITION_UNAVAILABLE → "Your location is not available right now. Click the map
           instead."; TIMEOUT → "Reading your location took too long. Try again, or click the map."
           Stay armed in pin mode (existing e2e asserts `.map.picking` stays visible).
         - ok: `setBusy('')`; `setHere({ lat, lon, accuracyM: Math.round(pos.coords.accuracy) })`;
           `setPinDraft([lat, lon])`; then `setFound({ state: 'looking' })` and
           `loadVillage(village, placeWithin)` (import from `../villageIndex`; compute
           `placeWithin` once with `useMemo` from `rec.placeLine` and pass the same value to
           `MapCanvas` instead of its inline expression). Guard the reply with the request id.
           `plots` null/empty → `{ state: 'none', why: 'nomap' }`; else `plotAt(plots, here)` →
           `{ state: 'plot', plot }` or `{ state: 'none', why: 'outside', far }` where `far` is
           `checkLocation(here, centreOfAllPlotsBbox, village).message` (CL-565 rule: phones report
           where you stand). No logging of the position anywhere.
      c. Copy in `.mapsays` while `mode === 'pin' && here` (replaces the generic hint, uses
         `role="status"`, digits in `.num`):
         - looking: "Finding your survey on the {village} village map…"
         - plot: "You're in Sy {lp}, {village} (±{accuracyM} m)." + if `surveyNo` and the plot's
           leading number ≠ `surveyNo`: "This {noun} is filed as {rec.title}." + if accuracy > 50 m
           the A3 sentence. Then "Save the pin here, or click the map to move it."
         - none/outside: "Your location is not inside any plot on the {village} village map." +
           `far` if set + "You can still save the pin where you are."
         - none/nomap: "There is no village map for {village}, so the survey could not be found.
           You can still save the pin where you are."
      d. Pass `located={mode === 'pin' && here ? { ...here, plot: found?.state === 'plot' ? found.plot.ring : undefined } : null}`
         to `MapCanvas`.
      e. Confirm/save: the existing "Save pin" (`savePinAt`, `useSetPin`) stays the only write for
         the pin. In `savePinAt` capture `const next = found?.state === 'plot' ? found.plot : null`
         before `stopEditing()`; on success, if `next`: `setVillageOn(true); setPlotQuery(''); setPlot(next)`.
         That hands over to the existing `.plotpick` card ("From the village map · Plot N" with
         "This is my land" when no boundary — saves via `saveDraft(plot.ring, …)` — or
         "Replace the boundary with this plot", which opens the existing `ConfirmDialog`
         `asking.kind === 'replace'`) and "Not this one". No new save path, no silent write.
      f. Entry A (D6): in `.mapsays`, when `mode === 'idle' && !pinned && !surveyed && !naming && !busy`,
         render `<p className="note">No location on this {noun} yet.</p>` and
         `<button type="button" className="btn sm" onClick={locateMe} disabled={saving}>`
         `<MyLocationOutlined sx={{ fontSize: 15 }} aria-hidden /> Use my current location</button>`.
         The edit-bar button in pin mode keeps the same label and calls `locateMe`.
         Check that `.mapsays` children with buttons are not under a `pointer-events: none` rule
         (`.nogeo` is) — use `note`/`row tight` wrappers, not `nogeo`.
      Files: apps/web/src/w360/pages/RecordBoundary.tsx
      Verify: `cd apps/web && bun run typecheck` passes; `bun test apps/web/src` passes.

- [ ] 6. E2E scenarios for the location flow (sealed e2e-app suite).
      In `tests/e2e-app/specs/09-record-boundary.spec.ts` next to the existing geolocation tests
      (~l.1162-1210): keep the three existing tests green (strings unchanged). Add:
      (1) a record with no pin and no ring shows "Use my current location" without pressing
      "Move the pin"; with geolocation granted and a stubbed village map (route `/vm/index.json`
      and its plot GeoJSON, or the uploaded-maps route pattern in `tests/e2e-app/fixtures/seed.ts:1260`)
      containing the device point, the hint reads "You're in Sy {lp}, Katragunta…",
      `world.calls('setPin')` stays 0 until "Save pin", then 1 with the device lat/lon, and the
      `.plotpick` card appears with "This is my land"; `setBoundary` is called only after that click.
      (2) device point outside every plot → "not inside any plot" message, Save pin still works.
      (3) no village map → "There is no village map for Katragunta…".
      Files: tests/e2e-app/specs/09-record-boundary.spec.ts
      Verify: only if the founder's dev server is already up on :5180 (`curl -sf http://localhost:5180 >/dev/null`):
      `cd tests/e2e-app && bunx playwright test specs/09-record-boundary.spec.ts --project=app`.
      Never start or stop that server; if it is down, report the suite as not run.

- [ ] 7. Docs.
      `docs/specs/2026-08-15-web-360-design.md` "Handing off" (~l.126-131): add that Navigate links
      open Google Maps directions via `navigateLink()` (coordinates only; Reddy 03/10/2026) while
      "Open in …" keeps `mapsLink()`; add one paragraph on "Use my current location" (entry points,
      record-village survey lookup via `loadVillage` + `pointInRing`, confirm via Save pin then the
      plot card, accuracy shown not stored). `docs/specs/2026-08-22-web-ios-parity-contract.md`
      (~l.153-156): note `navigateLink()` is bucket 3 like `mapsLink()`, and list the iOS/Expo
      follow-ups (A4). Check `apps/web/README.md` for any Navigate/hand-off description and update
      if present.
      Files: docs/specs/2026-08-15-web-360-design.md, docs/specs/2026-08-22-web-ios-parity-contract.md,
      (apps/web/README.md only if it describes this)
      Verify: re-read the edited sections against the code; `grep -n "navigateLink" docs/specs/*.md`
      shows both mentions and every referenced path exists.

- [ ] 8. Full verification and cleanup.
      Run from the repo root and fix anything this change broke (pre-existing failures from the
      user's uncommitted work must be reported, not "fixed" by touching their hunks):
      - `cd packages/core && bun run typecheck` and `cd apps/web && bun run typecheck`
      - `bun test packages/core packages/tokens apps/web/src apps/mobile/tests apps/university/src` (CI line)
      - `for script in scripts/*-tests.ts; do bun run "$script" || echo "FAILED: $script"; done`
        (includes geo-tests, typography-tests, shared-components-tests, a11y-web-tests, contrast,
        palette, url-scheme, village-tests)
      - `bun run scripts/icon-guard.ts` and `bun run scripts/ux-guards.ts`
      - `bun run scripts/emit-vectors.ts --check` (no vector diff expected)
      - `cd apps/web && bun run build` (Vite build succeeds)
      - e2e: step 6 condition; `tests/e2e-web360` (needs its own API/DB stack) is NOT run — report it.
      Remove any scratch output created (playwright-report/test-results changes made by your run,
      temp files). Stop any process you started.
      Verify: every command above exits 0 (or the failure is shown to be pre-existing on the
      untouched baseline).

## Change-governance notes for the final report

- Documentation: step 7. Architecture: no new entrypoint/trust boundary; one new third-party link
  destination (google.com, user-clicked href, coordinates only). Security/privacy: device location
  stays in the browser except via the existing setPin write the user confirms; no logging.
  Testing: steps 1, 3, 6, 8. Not verified without approval/infra: e2e-web360, real-device GPS,
  iOS/Expo (no change made there).
