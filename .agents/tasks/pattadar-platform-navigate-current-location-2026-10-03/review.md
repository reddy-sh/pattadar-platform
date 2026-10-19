# Navigate opens Google Maps; "Use my current location" finds the survey on the village map

Two changes to W04 (RecordBoundary), driven by Reddy's request of 03/10/2026. First, every Navigate link on the boundary tips now goes to Google Maps directions. That link is built by a new core `navigateLink()`, which carries only the coordinate. The "Open in …" view hand-off stays on `mapsLink`. Second, "Use my current location" is now offered under the map when a record has no pin and no boundary, and it stays in the "Move the pin" edit bar. One `locateMe()` handler reads the device once, drops a draft pin, draws a "you are here" dot with its accuracy circle, and looks the point up on the record's own village map with core `pointInRing`. The write paths are the ones that already existed: "Save pin" (`setPin`), then the plot card ("This is my land", or "Replace the boundary with this plot" behind the existing confirm dialog). There is no new backend contract, no vector change and no new data egress apart from a user-clicked google.com href.

Watch for: none of the new e2e scenarios has been run (the :5180 dev server was down), so the end-to-end create path is still unproven (confirmed). The "You are here" tooltip is bound to a non-interactive marker, so it never opens (confirmed). "Navigate" means only the per-corner links. The whole-parcel "Open in Apple Maps" still device-sniffs, and that is a scope decision for Reddy (likely).

**Verdict**: APPROVED

## High-level view

`navigateLink(to)` in `packages/core/src/land/geo.ts` returns `https://www.google.com/maps/dir/?api=1&destination=LAT,LON`. It trims coordinates with the existing `coord()` and returns `''` for a non-finite point or the unset 0,0. The block comment above it now explains the split between viewing and navigating, and the reasons: Google Maps is what people in AP use, the https link opens the app, and no caption goes out because `destination` is a search field. The new `geo.test.ts` pins the URL and checks that it holds no label or travel mode. It is correctly left out of the vectors (bucket 3, like `mapsLink`), and the emit-vectors comment and the parity contract record the iOS and Expo follow-ups. All three Navigate links in RecordBoundary are switched. On the side tip, "Corner A ↗" is renamed "Navigate to A ↗". Both e2e suites' href assertions are updated.

The survey lookup runs entirely on the client. It uses `loadVillage(village, placeWithin)` with a `placeWithin` that is now memoised and shared with `MapCanvas`, so it searches exactly the plots the "Village map" chip draws. `plotAt` in `villageGeom.ts` does a bbox pre-filter, then core `pointInRing`, and picks the smallest plot when plots overlap. The handler covers insecure context, a missing API, denied, unavailable and timed-out reads (with `enableHighAccuracy`, a 12 s timeout and `maximumAge: 0`). It also covers a missing village map and a point outside every plot (adding the CL-565 distance sentence when the device is far away). A request-id guard drops stale replies.

Confirmation is explicit. The draft pin is written only by "Save pin". `savePinAt` hands the found plot to the plot card only if the saved pin is still inside it, which stops a "you're in Sy N" claim from outliving a manual move. A boundary is written only from that card. `MapCanvas` gets a `located` prop drawn in its own layer group and framed once per fix and plot. The CSS uses `--w-info` tokens and keeps the `fill-opacity` that Leaflet would otherwise default.

Standards hold. The diff adds no font names or 500/600 weights. Digits sit in `.num`, icons are `aria-hidden` next to text labels, the result sentence is `role="status"`, and the already-imported `MyLocationOutlined` is reused. Nothing logs a coordinate.

<details>
<summary>Issues (4)</summary>

1. **New e2e scenarios unexecuted** — the three "Use my current location" tests, the updated "phone standing on the land" hint and the Navigate href assertion have never run. Run `bunx playwright test specs/09-record-boundary.spec.ts --project=app` in `tests/e2e-app` once the dev server on :5180 is up, before calling this done (functional-acceptance: setPin and setBoundary create paths). Non-blocking for the gate, because the coder cannot start that server.
2. **"You are here" tooltip never opens** — `bindTooltip` is on an `interactive: false` circleMarker, and Leaflet's CSS gives non-interactive SVG paths `pointer-events: none`, so the label is dead code. Either make it `permanent: true` (non-interactive) or drop the tooltip and rely on the `role="status"` sentence.
3. **Whole-parcel hand-off still device-sniffed** — only the corner and side "Navigate" links use Google Maps. The ⋯ menu's "Open in Apple Maps / Maps / OpenStreetMap" (and FmbMapViewer) is the only way to send the whole parcel to a maps app, so a Mac or iPhone user who wants to "navigate to my land" still lands in Apple Maps. Raise plan decision A1 with Reddy explicitly.
4. **Existing location test leans on unrouted `/vm/`** — "the phone standing on the land can set the pin itself" now asserts the no-map sentence but does not route `**/vm/index.json`. It passes only while `apps/web/public/vm` and `.local/vm-build` lack Katragunta. Route `index.json` to `[]` there, as the new no-map test does.

</details>

<details>
<summary>Details</summary>

### Navigate links and the core helper

`navigateLink` uses `to ?? ({} as LatLng)`, so an undefined argument returns `''` instead of throwing. The callers render the anchor unconditionally, though, so a `''` href would become a same-page link. In practice the tips only exist for ring corners, which are always finite, so this cannot happen today. The side-tip rename to "Navigate to A ↗" / "Navigate to B ↗" keeps each corner's accessible name unique inside the tip. It also changes the `/Corner B/` link name that `screens.spec.ts` used, and that spec was updated. The new code comment after the `sideTip` memo (`// Navigate goes to Google Maps directions…`) sits between two declarations and doesn't belong to either one. It is cosmetic.

On scope: the request says "navigate should go to google maps". In the UI, "Navigate" appears only on the corner tip. The parcel-level hand-off is labelled "Open in Apple Maps" on macOS and iOS. The plan deliberately keeps that on `mapsLink` and flags it as A1 for Reddy, and the docs say so. If Reddy meant "the button that takes me to my land", that is still Apple Maps (likely).

### Survey lookup and the confirm chain

```
Use my current location ─► getCurrentPosition (high accuracy, 12 s, maxAge 0)
        │                         │ ok
        │ (idle → mode 'pin')     ├─► here + pinDraft (draft only)
        │                         └─► loadVillage(village, placeWithin) ─► plotAt ─► found
        ▼
  Save pin ─► setPin (existing) ─► if pin still inside found plot:
                                     villageOn + plot card ─► "This is my land" ─► setBoundary
                                                           └─► over a boundary: ConfirmDialog
```

The `atHere` gate hides the "You're in Sy N" sentence once the draft is moved by a click. The dot and plot outline stay drawn until editing stops, because `located` keys on `mode` and `here`, not on the draft. That is defensible as "where you are" rather than "where the pin is". Entry B can run on a surveyed record, and in that case the plot card offers "Replace the boundary with this plot". The existing `ConfirmDialog` gates that, so no silent overwrite is possible.

Accuracy is rounded and shown with `en-IN` grouping. Above 50 m the sentence adds a caution, but the plot is still offered. Desktop Wi-Fi/IP fixes are often hundreds of metres to kilometres off, so a desktop user can be shown a confident "You're in Sy N" for the wrong plot, softened only by the caution sentence. The two-step confirm still prevents a silent write.

The "you are here" layer frames once for the fix (accuracy-circle bounds) and again when the plot arrives (plot bounds plus the fix), keyed on `lat,lon,plot length`, with `maxZoom: 18`. `Circle.getBounds()` needs `_map`, and it has one because the circle is added to the group that is already on the map. The tooltip problem in issue 2 comes from Leaflet 1.9.4's `.leaflet-pane > svg path { pointer-events: none }` for paths without `leaflet-interactive`.

### Test coverage

Unit coverage is good. `geo.test.ts` covers the exact URL, float trimming, no label/origin/travelmode, and `''` for NaN, Infinity and 0,0, plus `pointInRing` inside and outside. `villageGeom.test.ts` covers adjacent squares, outside, empty, NaN, overlap resolving to the smaller plot, closed vs open rings, and rings with fewer than three corners. The coder reports that the CI unit line (812 pass), all 20 `scripts/*-tests.ts` guards, the icon and UX guards, `emit-vectors --check` and the Vite build pass.

The three new e2e tests are well shaped. They assert `setPin` = 0 until "Save pin", then the device lat/lon, then `setBoundary` = 0 until "This is my land". They stub `/vm/` and assert the `.w-here` and `.w-here-plot` paths. The stub's coordinates check out against `plotAt`, and the Navigate href (`15.741,79.2694`) matches the corner the tip prints.

Not tested: none of the e2e has executed; there are no denied, unavailable, timeout or insecure-context e2e paths for Entry A; there is no Entry B test on a surveyed record (the replace-confirm path); and `tests/e2e-web360` was not run.

### Unrelated hunks in the same tree

The working tree carries a large body of the user's earlier uncommitted work in the same files. In this task's files that includes the `cssVar` extraction and theme re-render in `MapCanvas`, `--w-focus` and `--w-accent-wash-ink` in RecordBoundary, the light-scheme and corner-disc assertions in `09-record-boundary.spec.ts`, and the `html[data-scheme]` change in `screens.spec.ts`. They are out of scope for this review and were not judged. Any commit should stage this task's hunks on their own.

</details>

<details>
<summary>File map</summary>

- `packages/core/src/land/geo.ts`: `navigateLink()` and the rewritten hand-off block comment.
- `packages/core/src/index.ts`: export `navigateLink`.
- `packages/core/src/land/geo.test.ts` (new): navigateLink and pointInRing tests.
- `scripts/emit-vectors.ts`: one-line note that navigateLink is not vectored.
- `apps/web/src/w360/villageGeom.ts`: `plotAt()` survey lookup.
- `apps/web/src/w360/villageGeom.test.ts` (new): plotAt tests.
- `apps/web/src/w360/MapCanvas.tsx`: `located` prop and the "you are here" layer and framing (plus unrelated earlier theme hunks).
- `apps/web/src/w360/w360.css`: `w-here`, `w-here-acc`, `w-here-plot`, and `.locate` pointer-events.
- `apps/web/src/w360/pages/RecordBoundary.tsx`: Navigate links, `locateMe()`, Entry A button, result sentence, plot hand-off in `savePinAt`, memoised `placeWithin`.
- `tests/e2e-app/specs/09-record-boundary.spec.ts`: Navigate href assertion, updated hint, three new location tests.
- `tests/e2e-web360/specs/screens.spec.ts`: two href regexes moved to Google Maps.
- `docs/specs/2026-08-15-web-360-design.md`, `docs/specs/2026-08-22-web-ios-parity-contract.md`: hand-off split, location flow, iOS/Expo follow-ups.

Full diff: `git diff -- packages/core apps/web/src/w360 scripts/emit-vectors.ts tests/e2e-app/specs/09-record-boundary.spec.ts tests/e2e-web360/specs/screens.spec.ts docs/specs`

</details>
