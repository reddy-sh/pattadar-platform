# Whole-parcel hand-off moves to Google Maps, "You are here" label made permanent, location test sealed

This follow-up finishes the Navigate work Reddy approved on 03/10/2026. The W04 ⋯ menu item and the FMB viewer button stop sniffing the user agent (Apple Maps / `geo:` / OpenStreetMap, with title and village in `q=`). Both now use `navigateLink()`, the same coordinate-only Google Maps directions URL the corner and side tips already used. The device-sniffing helpers (`mapsAppFor`, `mapsAppName`, `mapsLink`, `safeMapLabel` and their types) are deleted from `@pattadar/core`, and the guard script and docs follow. The "You are here" label is now a standalone permanent `L.tooltip` in the here-layer group, which replaces the hover tooltip that never opened. The brittle pin test now routes `**/vm/index.json` to `[]`.

Watch for: the e2e-web360 rewrites were only parse-checked, and one of them has a substring assertion (`'214'` on the whole href) that could collide with the centroid's digits (possible). The FMB viewer button has no runtime coverage.

**Verdict**: APPROVED

## High-level view

The switch is complete across apps/web. A grep of `apps/web/src`, `apps/university/src` and `packages/core/src` finds no remaining `maps.apple`, `geo:`, OpenStreetMap hand-off, `userAgent` or `mapsLink*` reference. The only `openstreetmap.org` URLs left are Nominatim geocoding and tiles, which are not hand-offs. Every user-facing hand-off is now the single `navigateLink(LatLng)` form, which returns `''` for non-finite input or 0,0. Both callers turn that into "no item" or "no button", so the no-ring, no-pin record still offers no hand-off.

No record text reaches a URL any more. `navigateLink` has no label parameter at all, so a caption cannot be added later by accident. The core unit tests and `scripts/geo-tests.ts` both assert the exact URL, the absence of `q=`, centroid placement and the 0,0 refusal. The `FIELD_01` constant the later ring tests use was kept.

`@pattadar/core` dropped six exports. The coder's grep shows no other importer, and typecheck passes for core and web. The emit-vectors note was reworded to name `navigateLink`, still bucket 3, still unvectored, and `emit-vectors --check` reports VECTORS CURRENT. The web-360 design spec and the parity contract both describe the new rule. The parity contract lists the open iOS (`FMBMapSection.openInMaps`, `HoldingShare`) and Expo (`property/[id].tsx`, `passbooks.tsx`) follow-ups and states the coordinates-only rule.

The tooltip fix avoids a subtle duplicate: redrawing the layer used to leave a fading second label. The standalone tooltip is owned by the group's `clearLayers()`. The e2e waits for `toHaveCount(1)` before reading the text and checks it disappears after Save pin. The coder screenshotted both app and phone viewports and recorded what they saw. Only the screenshots and the temporary edits were removed.

<details>
<summary>Issues (3)</summary>

1. **Substring check can collide with coordinates** (possible): in `screens.spec.ts` "the address is on the screen, and stays out of the hand-off URL", `expect(href).not.toContain('214')` runs on the whole href, centroid decimals included. A centroid like `17.078214` would fail it. The `destination` regex `^17\.\d+,82\.\d+$` on the line above already proves no text rides along, so drop `'214'` or run the substring checks against the URL minus `destination`. Not blocking.
2. **e2e-web360 rewrites not executed**: both rewritten `screens.spec.ts` tests were parse-checked only. Run them the next time the e2e-web360 stack is up.
3. **FMB viewer button has no runtime coverage**: "Navigate in Google Maps" in `FmbMapViewer.tsx` is covered by typecheck and review only. Consider an e2e-app assertion on its href when the FMB dialog spec is next touched.

</details>

<details>
<summary>Details</summary>

### One hand-off form for the whole web client

```
corner tip ─┐
side tip   ─┼─▶ navigateLink(LatLng) ─▶ https://www.google.com/maps/dir/?api=1&destination=LAT,LON
W04 ⋯ menu ─┤        ('' for NaN / 0,0 → caller hides the link)
FMB viewer ─┘
```

In `RecordBoundary.tsx` the `away` memo now picks the ring centroid when the record is surveyed and otherwise falls back to the filed pin. It returns `href || null`, so the menu spread `...(away ? [...] : [])` still drops the item for an unlocated record. The 0,0 fallback depends on `navigateLink` refusing 0,0, and that refusal is tested. The menu item keeps `OpenInNewOutlined` and the shared `Menu` href rendering (`<a role="menuitem" target="_blank" rel="noreferrer">`), so ui.tsx needed no change. `FmbMapViewer.tsx` drops `village` from the memo deps along with the label and renders the plain string href on the existing MUI `Button`. Neither file logs coordinates.

### The "You are here" label

`MapCanvas.tsx` builds a `span` with `textContent` (no HTML injection) and adds it as `L.tooltip({ permanent: true, direction: 'top', offset: [0, -10], className: 'w-here-tip' })` to the here group. The CSS sets only size, weight 700, padding and the info-blue border and pointer. It inherits `--font-sans` through the existing `.w360 .leaflet-container { font-family: inherit }`, and its selector specificity beats the generic `.w360 .leaflet-tooltip` rule regardless of order. The `role="status"` sentence in `.mapsays` is still the accessible announcement. The tooltip is visual only and Leaflet sets `pointer-events: none`, so clicks still reach the map to move the draft pin.

### Sealed pin test

"the phone standing on the land can set the pin itself" now routes `**/vm/index.json` to `[]` before `openMap`, so the "There is no village map for Katragunta" hint no longer depends on the laptop's `.local/vm-build`. It passed on both app and phone projects. The 19 failures in the same spec run fall on lines this task did not touch. They come from copy drift in the user's uncommitted tree ("this record" → "this property", "1 of 3 stones", missing eyebrow/heading/Import button).

</details>

<details>
<summary>File map</summary>

Task-scoped hunks only; the working tree also holds a large set of unrelated user changes, which were not modified.

- `packages/core/src/land/geo.ts`: device-sniffing helpers removed, block comment rewritten around `navigateLink`.
- `packages/core/src/index.ts`: six exports removed.
- `scripts/geo-tests.ts`: UA/label checks replaced with `navigateLink` URL, no-caption, centroid and 0,0 checks.
- `scripts/emit-vectors.ts`: bucket-3 note reworded for `navigateLink`.
- `apps/web/src/w360/pages/RecordBoundary.tsx`: `away` memo and ⋯ item now Google Maps.
- `apps/web/src/components/FmbMapViewer.tsx`: hand-off button now Google Maps, label removed from URL.
- `apps/web/src/w360/MapCanvas.tsx`, `w360.css`: permanent "You are here" tooltip and its style.
- `tests/e2e-app/specs/09-record-boundary.spec.ts`: index.json route, tooltip assertions, hand-off tests rewritten.
- `tests/e2e-web360/specs/screens.spec.ts`: two hand-off tests rewritten.
- `docs/specs/2026-08-15-web-360-design.md`, `docs/specs/2026-08-22-web-ios-parity-contract.md`: hand-off rule and iOS/Expo follow-ups.

Full diff: `git diff` in the repo root.

</details>
