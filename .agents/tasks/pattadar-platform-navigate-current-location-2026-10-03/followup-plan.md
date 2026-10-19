# Follow-up Implementation Plan — whole-parcel hand-off to Google Maps, live "You are here" label, sealed location test

Reddy approved on 03/10/2026, as a follow-up to the Navigate / "Use my current location" change described in
`plan.md`, `review.md` and `verification.md` in this folder:

1. The whole-parcel hand-off goes to Google Maps too (plan decision A1 = yes).
2. Fix the "You are here" tooltip, which never opens.
3. Make the existing "the phone standing on the land can set the pin itself" e2e test sealed against `/vm/`.

## Ground rules for the implementer

- Work directly in `/Users/reddy.sh/reddy.sh/projects/pattadar-platform` (main checkout, NO worktree). Use
  absolute paths always. Do NOT commit or push.
- The tree holds a lot of the user's uncommitted work, including in files this task touches:
  `RecordBoundary.tsx`, `MapCanvas.tsx`, `w360.css`, `geo.ts`, `index.ts`, `emit-vectors.ts`, both docs/specs files,
  and both e2e specs. Edit on top of it. Never revert, stash, reset or reformat unrelated hunks. `FmbMapViewer.tsx`
  and `scripts/geo-tests.ts` currently have no uncommitted changes.
- Do not touch `.worktrees/**` (another task's worktree; it holds stale copies of the same files).
- URLs carry coordinates only. No label, survey number, village, owner or title goes into any hand-off URL.
  Never log coordinates.
- Standards: shared components only (`Menu` from `apps/web/src/w360/ui.tsx` is already used); type through
  `--font-sans` only (Leaflet inherits it via `.w360 .leaflet-container { font-family: inherit }`, w360.css ~l.3433);
  weights 400/700 only; `tabular-nums` for digits; no new icon names (reuse `OpenInNewOutlined` and `MapIcon`, both
  already imported); tokens only, no colour literals.
- STOP-AND-REPORT: nothing here needs `services/api`, GraphQL, the gateway, Terraform or vectors. If you find you
  need any of them, stop and report. Do not design the change.

## Current state, verified by reading code on 03/10/2026

All three items are still open. Each one is still listed below as "verify at runtime" during implementation.

- Item 1: `RecordBoundary.tsx` `away` (l.~703-722) still builds `mapsLink(at, { label, userAgent })`, which
  sniffs the device and sends the label `"<title>, <village>"` in `q=`. The menu item (l.~1063-1070) reads
  `Open in ${mapsAppName(away.app)}`. `FmbMapViewer.tsx:176-182` does the same with `label: village`, and l.316-321
  renders a button reading `{mapsAppName(away.app)}`.
- Item 2: `MapCanvas.tsx:761-764` does `L.circleMarker(at, { className: 'w-here', radius: 7, interactive: false })`
  and then `dot.bindTooltip(label, { direction: 'top', offset: [0, -8] })`. That is a hover tooltip on a
  non-interactive path. Leaflet 1.9.4 gives such a path `pointer-events: none`, so the tooltip never opens.
- Item 3: `tests/e2e-app/specs/09-record-boundary.spec.ts:1196-1217` asserts the "There is no village map for
  Katragunta…" sentence but routes no `/vm/`. It passes today only because neither `apps/web/public/vm/index.json`
  nor `.local/vm-build/index.json` mentions Katragunta (both checked: 0 hits). `vite dev` serves `.local/vm-build`
  whenever it exists (`apps/web/vite.config.ts` l.9-20), so the test depends on the laptop.

## Every hand-off caller found (grep of apps/web, apps/mobile, apps/ios, packages/core, scripts, tests, docs, .kiro, READMEs, design.md)

| # | Location | What it is | Change |
|---|---|---|---|
| 1 | `apps/web/src/w360/pages/RecordBoundary.tsx:25-26` | imports `mapsAppFor`, `mapsAppName`, `mapsLink` | Remove these three from the import. Keep `navigateLink` and the rest. |
| 2 | `RecordBoundary.tsx:~703-722` `away` memo | whole-parcel hand-off at the ring centroid, or at the filed pin | → `navigateLink(at)`, coordinates only. Drop the UA sniff and the label. |
| 3 | `RecordBoundary.tsx:~1063-1070` ⋯ menu item `Open in ${mapsAppName(away.app)}` | user-facing label | → `Navigate in Google Maps`, still an `href` menu item with `OpenInNewOutlined` |
| 4 | `RecordBoundary.tsx:611,613,670` side/corner tips | already `navigateLink` | No change. Verify the href at runtime. |
| 5 | `RecordBoundary.tsx:617-618` stray comment between memos | cosmetic (review note) | Move it into the `away` comment (one Navigate story) |
| 6 | `apps/web/src/components/FmbMapViewer.tsx:41` | import `mapsAppFor, mapsAppName, mapsLink` | → `navigateLink, ringCentroid` |
| 7 | `FmbMapViewer.tsx:176-182` `away` memo | FMB dialog hand-off at the centroid, label = village | → `navigateLink(centre)`, coordinates only |
| 8 | `FmbMapViewer.tsx:316-321` button text `{mapsAppName(away.app)}` | user-facing label | → `Navigate in Google Maps` |
| 9 | `packages/core/src/land/geo.ts:145-273` | `MapsApp`, `mapsAppFor`, `MapsLinkOptions`, `safeMapLabel`, `mapsLink`, `mapsAppName`, and the block comment | REMOVE all except `coord` and `navigateLink`. Rewrite the block comment (see D2). |
| 10 | `packages/core/src/index.ts:147-151,159-160` | exports `mapsAppFor`, `mapsAppName`, `mapsLink`, `safeMapLabel`, `type MapsApp`, `type MapsLinkOptions` | Remove them. Keep `navigateLink`. |
| 11 | `packages/core/src/land/geo.test.ts` | `navigateLink` and `pointInRing` tests | Keep. Optionally add a "centroid hand-off" case (step 1). |
| 12 | `scripts/geo-tests.ts:4-5` import, `:53-95` "Handing a parcel to the device's own map" (UA constants, mapsAppFor/mapsLink/mapsAppName checks), `:255-279` safeMapLabel + labelled mapsLink checks | guard script | Delete those checks. Replace them with `navigateLink` checks. KEEP `FIELD_01` (l.70; also used at l.126-129). |
| 13 | `scripts/emit-vectors.ts:101-114` "why `mapsLink` is NOT vectored" | comment only | Reword it for `navigateLink`. No code or vector change. |
| 14 | `docs/specs/2026-08-15-web-360-design.md:126-136` "Handing off." | spec | Rewrite: every hand-off is Google Maps via `navigateLink` |
| 15 | `docs/specs/2026-08-22-web-ios-parity-contract.md:153-163` bucket 3 | spec | Rewrite the example. Record the iOS/Expo follow-ups. |
| 16 | `tests/e2e-app/specs/09-record-boundary.spec.ts:1973-1992` "the hand-off is named for the map app that will actually open" | e2e | Rewrite (step 3) |
| 17 | `09-record-boundary.spec.ts:2003-2007` `/^Open in /` count 0 on the no-ring, no-pin record; comment cites `RecordBoundary.tsx:547-563` | e2e | Name → `/Google Maps/` (also keep `/^Open in /` count 0). Fix the comment to name the `away` memo, not line numbers. |
| 18 | `09-record-boundary.spec.ts:483-487` corner Navigate href | already Google | No change. Must pass at runtime. |
| 19 | `tests/e2e-web360/specs/screens.spec.ts:863-882` "the hand-off goes to the device's own map, named honestly" | e2e | Rewrite (step 3) |
| 20 | `screens.spec.ts:1209-1230` "the address is on the screen, and rides along to Apple Maps" | e2e, asserts the label `q=Sy%20214%2F2%2C%20Kothapalli` in the href | Rewrite: the address is on screen and stays OUT of the URL (step 3) |
| 21 | `screens.spec.ts:~1688-1689` side-tip Navigate regex | already Google | No change |
| 22 | `apps/mobile/src/app/property/[id].tsx:295` share text, `:350` "View full map", `:551-555` "Open in Maps" (all `maps.apple.com`, `q=<title>` at 350/551) | Expo | NOT changed: out of scope and a different client. Record as a follow-up (Google Maps, and the title must come out of the URL). |
| 23 | `apps/mobile/src/app/(tabs)/passbooks.tsx:145` `http://maps.apple.com/?q=<village, mandal…>` | Expo address search | NOT changed. Follow-up. |
| 24 | `apps/ios/Pattadar/Sources/FMBMapSection.swift:447-459,604` `openInMaps` (`maps://?ll=…&q=Corner N`), "Open in Maps" / "Maps" | native iOS | NOT changed. Follow-up for `sync-ios`. |
| 25 | `apps/ios/PattadarKit/Sources/PattadarKit/Format/HoldingShare.swift:45` + `HoldingShareTests.swift:20,44-45` | iOS share text with `maps.apple.com/?ll=…&q=` | NOT changed. Follow-up. |
| 26 | `apps/ios/Pattadar/Sources/FMBMapSection.swift:25,155` "Apple Maps snapshot / Imagery © Apple Maps" | attribution for an imagery source, not a hand-off | No change ever |
| — | `tile.openstreetmap.org`, `nominatim.openstreetmap.org`, and "OpenStreetMap" captions and attribution across specs and harnesses | basemap tiles and geocoder, not a hand-off | No change |

There are no other `mapsLink` / `mapsAppFor` / `mapsAppName` / `safeMapLabel` users: none in apps/mobile, apps/ios,
apps/university, `scripts/parity-check.ts` or `scripts/parity-map.json`, `.kiro`, READMEs or `design.md`.

## Decisions (with rationale)

D1. The whole-parcel hand-off becomes Navigate. Its label is "Navigate in Google Maps" and its URL is
`navigateLink(centre)`, i.e. Google Maps directions to the ring centroid (or the filed pin). The user's own word
was "navigate". Reddy's brief prefers directions for a navigate action, and one URL family for every hand-off
means one helper and one test set. A separate "view" link (`/maps/search/?api=1&query=`) would be a second Google
URL that does almost the same job. The label says what happens: "Open in Google Maps" over a directions URL would
under-promise. The ⋯ menu item keeps `OpenInNewOutlined` (it leaves the app). The FMB dialog button keeps `MapIcon`.
Neither needs a new icon name.

D2. `mapsLink` is REMOVED, along with `mapsAppFor`, `mapsAppName`, `MapsApp`, `MapsLinkOptions` and `safeMapLabel`.
After D1 nothing calls them:

- No caller remains in any client.
- They are not vectored (`emit-vectors.ts`).
- No Swift twin, parity map or Expo import references them.

Keeping them would leave a ready-made device-sniffing Apple Maps/OSM builder with a label-into-URL path. That is
exactly what Reddy just ruled out, and someone would wire it back in. Repointing `mapsLink` at Google instead would
leave `label`/`app`/`userAgent`/`zoom` options that mean nothing, beside a `navigateLink` that already does the job.
`safeMapLabel` existed only to make captions URL-safe, and no caption is sent now. Its traps (Android parentheses,
Apple `q` as a search field) stay recorded in git history and in the rewritten block comment's one-line note. The
removal is a reversible, in-repo refactor of a workspace-internal package (`@pattadar/core` is `workspace:*`, not
published).

Rewrite the geo.ts block comment "Handing a parcel to another map" to say:

- Pattadar draws its own maps.
- Every hand-off out of it goes to Google Maps directions through `navigateLink` (Reddy, 03/10/2026: first Navigate
  on corners and sides, then the whole parcel).
- The https URL opens the Google Maps app on Android and iOS when it is installed, and the web otherwise.
- The URL carries the coordinate only: `destination` is a search field, and record text must not leave the app in a
  URL.
- No consumer maps app takes a boundary, so the whole-parcel pin is `ringCentroid`.
- Earlier the view hand-off sniffed the device (Apple Maps / `geo:` / OSM); that was removed with this change.

Keep `coord()` (used by `navigateLink`) and keep its doc comment.

D3. Vectors and parity: `navigateLink` stays out of the vectors (bucket 3). `bun run scripts/emit-vectors.ts --check`
must report no change. Reword only the emit-vectors comment: "`navigateLink` builds a Google Maps URL because a
browser has no other way to hand a point to a maps app; a phone can open one natively…; `ringCentroid` is the part
that genuinely crosses." The iOS and Expo hand-offs (rows 22-25) stay Apple Maps and are recorded as follow-ups in
the parity contract. The web change does not force them, and changing them is a separate client decision.

D4. Tooltip: make it a permanent, non-interactive label. Do not drop it. In `MapCanvas.tsx:761-764` bind it as
`dot.bindTooltip(label, { permanent: true, direction: 'top', offset: [0, -10], className: 'w-here-tip', opacity: 1 })`
before `.addTo(group)`:

- Leaflet 1.9.4 opens a permanent tooltip on the layer's `add` event. `.leaflet-tooltip` is already
  `pointer-events: none`, so the label never steals the click that moves the draft pin.
- `opacity: 1` overrides Leaflet's default 0.9, so contrast holds on imagery.
- `offset -10` clears the dot (radius 7 plus 2 px stroke) and the draft-pin ring (radius 8) drawn at the same point.

Add CSS next to the `path.w-here*` rules (w360.css ~l.3497-3509). It inherits the existing `.w360 .leaflet-tooltip`
surface, ink, hairline and radius (l.3595-3602):

```css
/* "You are here" names itself — permanent, because the dot is not interactive
   and a hover tooltip on it never opened. Ink on surface for contrast; the
   info hue only on the hairline and the pointer, matching the dot. */
.w360 .leaflet-tooltip.w-here-tip {
  font-size: 0.6875rem;
  font-weight: 700;
  line-height: 1.2;
  padding: 0.125rem 0.375rem;
  white-space: nowrap;
  border-color: var(--w-info);
}
.w360 .leaflet-tooltip-top.w-here-tip::before { border-top-color: var(--w-info); }
```

This adds no font family, no weight other than 700, and no colour literal. If the visual check (step 4) shows the
label colliding badly with the `.hint` overlay, the plot outline or the zoom control, adjust `direction`/`offset` only.
If it still cannot be made clean, fall back to removing the tooltip (the `role="status"` sentence already says "You're
in Sy N…") and say so in the findings. Keep the `textContent` assignment (never innerHTML).

D5. The brittle test gets one line, as its first statement:
`await page.route('**/vm/index.json', (route) => route.fulfill({ json: [] }));`
This is the same stub the "with no village map the survey is not guessed" test uses at l.1298. Its comment ("the
sealed world has no village map for Katragunta") becomes true by construction. Add `/vm/ is routed, not trusted to
the dev server's build` to that comment.

## Steps

- [ ] 1. Core: remove the device-sniffed hand-off and keep `navigateLink` as the one hand-off.
      In `packages/core/src/land/geo.ts`, delete `MapsApp`, `mapsAppFor`, `MapsLinkOptions`, `safeMapLabel`,
      `mapsLink` and `mapsAppName` (with their doc comments). Keep `coord` and `navigateLink`. Rewrite the
      "Handing a parcel to another map" block comment per D2 and update `navigateLink`'s own doc line to
      "Every hand-off out of Pattadar's maps…".
      In `packages/core/src/index.ts`, remove the matching exports (`mapsAppFor`, `mapsAppName`, `mapsLink`,
      `safeMapLabel`, `type MapsApp`, `type MapsLinkOptions`). Leave every other line, and the user's other hunks, alone.
      In `scripts/geo-tests.ts`:
      - Drop those names from the import (l.4-5).
      - Replace the "Handing a parcel to the device's own map" section (l.53-95, the UA constants plus the mapsAppFor,
        mapsLink and mapsAppName checks) with a "Handing a parcel to Google Maps" section, keeping `const FIELD_01`.
        Its checks: `navigateLink(FIELD_01) === 'https://www.google.com/maps/dir/?api=1&destination=15.662204,79.321775'`;
        a labelled record cannot leak (the URL has no `q=` and no letters after `destination=`);
        `navigateLink({latitude:15.66026, longitude:79.31919})` contains `destination=15.66026,79.31919`;
        `navigateLink(ringCentroid(...))` of a simple square equals its centre.
      - Delete the safeMapLabel and labelled-mapsLink checks (l.255-279) and add the `navigateLink` import.
      Then grep the repo (excluding `.worktrees`, `node_modules`, `dist`) for
      `mapsLink|mapsAppFor|mapsAppName|safeMapLabel|MapsLinkOptions|MapsApp\b`. The only hits left must be
      apps/web (fixed in step 2) and the emit-vectors comment (step 5).
      Files: packages/core/src/land/geo.ts, packages/core/src/index.ts, scripts/geo-tests.ts
      Verify: `cd packages/core && bun run typecheck` exits 0 (apps/web will not typecheck until step 2, and that is
      expected); `bun test packages/core/src/land` passes; `bun run scripts/geo-tests.ts` exits 0.

- [ ] 2. Web: both whole-parcel hand-offs go to Google Maps (depends on 1).
      a. `apps/web/src/w360/pages/RecordBoundary.tsx`: remove `mapsAppFor`, `mapsAppName` and `mapsLink` from the
         `@pattadar/core` import (l.25-26), keeping the other names. Rewrite the `away` memo (l.~703-722):
         ```ts
         // Where the hand-off drops its pin: the centre of the land if we know the
         // shape, the filed pin if we only know that. No maps app takes a boundary.
         // Navigate goes to Google Maps directions (navigateLink, Reddy 03/10/2026),
         // with the coordinate only: the record's title and village never leave in a URL.
         const away = useMemo(() => {
           const centre = surveyed
             ? ringCentroid(ring.map(([latitude, longitude]) => ({ latitude, longitude })))
             : null;
           const href = navigateLink(centre ?? { latitude: data?.lat ?? 0, longitude: data?.lon ?? 0 });
           return href || null; // '' for the unset 0,0: no hand-off into the Gulf of Guinea
         }, [surveyed, ring, data?.lat, data?.lon]);
         ```
         Delete the now-redundant stray comment at l.617-618. Menu item (l.~1063-1070): `label: 'Navigate in Google Maps'`,
         `href: away`, keep `icon: <OpenInNewOutlined …/>` and `onClick: () => undefined`. Replace the "Named for the app
         that will actually open…" comment with one saying it is a real link (so it can be copied or opened in a new tab
         from the menu) and that it is the same Google Maps directions as the corner tips. `Menu` in
         `apps/web/src/w360/ui.tsx:1174-1182` already renders href items as `<a role="menuitem" target="_blank"
         rel="noreferrer">`, so ui.tsx needs no change.
      b. `apps/web/src/components/FmbMapViewer.tsx`: import `navigateLink, ringCentroid` from `@pattadar/core` in
         place of `mapsAppFor, mapsAppName, mapsLink, ringCentroid`. In the `away` memo (l.176-182), keep the
         `located` and centroid guards and `return navigateLink(centre) || null;` with deps `[located, ringLonLat]`
         (village is no longer in the URL). Change the comment to "No maps app takes a boundary, so the hand-off is
         Google Maps directions to the centre of the land, coordinates only." Button (l.316-321): `href={away}`, text
         `Navigate in Google Maps`, keep `startIcon={<MapIcon />}`, `target="_blank" rel="noreferrer"`, `size="small"`.
         Leave the hex literals alone (a11y-web-tests counts 3).
      Files: apps/web/src/w360/pages/RecordBoundary.tsx, apps/web/src/components/FmbMapViewer.tsx
      Verify: `cd apps/web && bun run typecheck` exits 0; `bun test apps/web/src` passes; `bun run scripts/icon-guard.ts`,
      `bun run scripts/a11y-web-tests.ts` and `bun run scripts/shared-components-tests.ts` pass.

- [ ] 3. E2E assertions for the hand-off and the sealed location test (depends on 2).
      `tests/e2e-app/specs/09-record-boundary.spec.ts`:
      - l.1973-1992: rename the test to `'the whole-parcel hand-off is Google Maps directions to the middle of the land'`.
        Body: open the ⋯ menu.
        `const away = page.getByRole('menuitem', { name: 'Navigate in Google Maps' }); await expect(away).toBeVisible();`
        Expect `getByRole('menuitem', { name: /Apple Maps|OpenStreetMap|^Open in / })` to have count 0, and
        `away` to have JS property `tagName` = `'A'`. Expect the href to equal
        `/^https:\/\/www\.google\.com\/maps\/dir\/\?api=1&destination=15\.7406,79\.2699$/`. This is the `RING` centroid
        (15.7402–15.7410 × 79.2694–79.2704). Confirm the exact string first with
        `bun -e "import {navigateLink,ringCentroid} from './packages/core/src/index'; console.log(navigateLink(ringCentroid([[15.741,79.2694],[15.741,79.2704],[15.7402,79.2704],[15.7402,79.2694]].map(([latitude,longitude])=>({latitude,longitude})))!))"`
        and hard-code whatever it prints. Assert it has no `q=` (record text never rides along). Rewrite the comment:
        it is the same link on every device; the old UA-sniffed Apple Maps/OSM item is gone (Reddy 03/10/2026).
      - l.2003-2007: keep `/^Open in /` count 0, and add `getByRole('menuitem', { name: /Google Maps/ })` count 0. In
        the comment, replace `(RecordBoundary.tsx:547-563)` with `(the away memo in RecordBoundary.tsx)`.
      - l.1196 "the phone standing on the land can set the pin itself": insert the D5 route as its first line and
        extend the comment. Do not change its assertions.
      `tests/e2e-web360/specs/screens.spec.ts`:
      - l.863-882: rename to `'the whole-parcel hand-off is Google Maps directions, the same on every device'`. Assert
        `menuitem` named `'Navigate in Google Maps'`, `tagName` `A`, and the href matching
        `/^https:\/\/www\.google\.com\/maps\/dir\/\?api=1&destination=17\.078\d*,82\.139\d*$/`. Assert there is no
        `t=k` and no `q=` (replacing the Apple asserts), and count 0 for `/Apple Maps|^Open in /`. Drop the
        "Chromium reports a Mac UA" comment.
      - l.1209-1230: rename to `'the address is on the screen, and stays out of the hand-off URL'`. Keep the two
        on-screen assertions (place line and Khata). Get the href of
        `getByRole('menuitem', { name: 'Navigate in Google Maps' })`. Expect `new URL(href).searchParams.get('destination')`
        to match `/^17\.\d+,82\.\d+$/`, and expect the href not to contain `Sy`, `214`, `Kothapalli` or `q=`. Rewrite
        the comment: the village is printed on the screen; a third-party URL carries only the coordinate (Reddy,
        03/10/2026).
      Grep both spec directories again for `Open in|Apple Maps|maps\.apple|openstreetmap\.org/\?` and confirm the only
      remaining hits are the count-0 negatives above (and the tile/geocoder hosts, which are unrelated).
      Files: tests/e2e-app/specs/09-record-boundary.spec.ts, tests/e2e-web360/specs/screens.spec.ts
      Verify: `bun build --no-bundle tests/e2e-app/specs/09-record-boundary.spec.ts --outdir /tmp/pp-parse-a` and the
      same for `tests/e2e-web360/specs/screens.spec.ts` (`--outdir /tmp/pp-parse-b`) both parse. Delete
      `/tmp/pp-parse-*` afterwards. They are executed in step 4.

- [ ] 4. Tooltip fix and runtime/visual verification of all three items (depends on 2 and 3).
      a. `apps/web/src/w360/MapCanvas.tsx:761-764`: apply D4 (`permanent: true, direction: 'top', offset: [0, -10],
         className: 'w-here-tip', opacity: 1`). Update the "You are here" comment to say why it is permanent. Add the D4
         CSS in `apps/web/src/w360/w360.css` right after the `path.w-here-plot` rule (~l.3509).
      b. In the `'an empty record offers the phone, finds its survey, and writes nothing until asked'` test
         (09-record-boundary.spec.ts ~l.1248), after `path.w-here` count 1, add
         `await expect(page.locator('.leaflet-tooltip.w-here-tip')).toHaveText('You are here');` and `toBeVisible()`.
         After "Save pin" add an assertion that the tooltip is gone (count 0), because `located` clears when pin mode ends.
      c. Runtime run. The founder's server on :5180 is down, and :5181 is held by a user process: do not touch either.
         Start an agent-owned dev server on a free port. Confirm the port is free first:
         `lsof -nP -iTCP:5193 -sTCP:LISTEN` should print nothing. Then run, in the background,
         `cd /Users/reddy.sh/reddy.sh/projects/pattadar-platform/apps/web && WEB_PORT=5193 VM_DIR=off bunx vite --strictPort`.
         The e2e-app suite is sealed: every `/api` request is answered in the browser from `fixtures/world.ts`, so
         nothing reaches a backend. Then run
         `cd /Users/reddy.sh/reddy.sh/projects/pattadar-platform/tests/e2e-app && APP_WEB_URL=http://localhost:5193 bunx playwright test specs/09-record-boundary.spec.ts --project=app --project=phone --reporter=list --output=/tmp/pp-e2e-out`.
         `--reporter=list` and `--output` keep the user's existing gitignored `results.json`, `playwright-report/` and
         `test-results/` untouched. Every test must pass, including:
         - the three location tests;
         - the "phone standing on the land" test;
         - the corner Navigate href (l.483-487);
         - the rewritten hand-off tests (l.1973 and l.2003).
         Then flip item 3's protection on purpose: rerun only the brittle test with
         `--grep "phone standing on the land"` and `VM_DIR=` unset. Only do this if `.local/vm-build/catalog.json`
         exists, and only by restarting your own server without `VM_DIR=off`. It must still pass. If the local build
         has no Katragunta, the flip proves nothing, so just note that.
      d. Visual check of the tooltip. Temporarily add
         `await page.locator('.plot').screenshot({ path: '/tmp/pp-here.png' });` after the new tooltip assertion. Run that
         one test (`--grep "an empty record offers the phone"`, `--project=app`, then once with `--project=phone` with the
         `@phone` tag temporarily added, or by setting the viewport in the test). Open `/tmp/pp-here.png` with the
         image-reading tool and confirm all of the following:
         - the label sits above the blue dot;
         - it is legible on the street basemap;
         - it does not cover the draft pin, the `.mapsays` hint or the zoom control;
         - it is in Atkinson Hyperlegible at 700.
         Tune `offset`/`direction` if needed (D4 fallback rule). Then REMOVE the screenshot line and any temporary tag,
         and delete `/tmp/pp-here.png`.
      e. Optional, only if cheap: in the same session, open the FMB viewer path. No e2e covers `FmbMapViewer`'s button.
         Note in the findings that it is covered by typecheck and code review only.
      f. Stop the agent-started Vite process (its background-process handle; nothing else) and delete `/tmp/pp-e2e-out`.
      Files: apps/web/src/w360/MapCanvas.tsx, apps/web/src/w360/w360.css, tests/e2e-app/specs/09-record-boundary.spec.ts
      Verify: `cd apps/web && bun run typecheck` exits 0; the Playwright command in (c) is all green; the screenshot
      check in (d) is recorded in the verification notes; `bun run scripts/typography-tests.ts`,
      `bun run scripts/contrast-tests.ts` and `bun run scripts/palette-tests.ts` pass.

- [ ] 5. Docs and the vectors comment (depends on 1-2).
      - `scripts/emit-vectors.ts:101-114`: retitle to "why the maps hand-off (`navigateLink`) is NOT vectored". Say that
        a browser can only hand a point to a maps app by URL, so web builds a Google Maps directions URL. A phone can
        open one natively, and porting the URL builder to Swift would import a web workaround as if it were a rule.
        Keep the bucket-3 sentence and the `ringCentroid` sentence. Comment only.
      - `docs/specs/2026-08-15-web-360-design.md:126-136` ("Handing off."): replace the `mapsLink()` description. Every
        hand-off from W04 and the FMB viewer goes to Google Maps directions via `navigateLink()` in
        `packages/core/src/land/geo.ts`. That covers:
        - `Navigate ↗` on a corner;
        - `Navigate to A ↗` / `Navigate to B ↗` on a side;
        - "Navigate in Google Maps" in the ⋯ menu, at `ringCentroid()` (area-weighted, why) or the filed pin;
        - "Navigate in Google Maps" in the FMB viewer, at the centroid.

        Each link carries coordinates only (no caption: `destination` is a search field and record text must not leave
        in a URL). There is no link for an unset 0,0. Record the decision trail (Reddy, 03/10/2026: Navigate first, then
        the whole-parcel hand-off) and that the device-sniffed Apple Maps / `geo:` / OSM link (`mapsLink`) was removed.
        Leave the "Use my current location" paragraph as it is. Then, in its tooltip sentence, if any, state that the
        dot carries a permanent "You are here" label.
      - `docs/specs/2026-08-22-web-ios-parity-contract.md:153-163`: rewrite the bucket-3 example. Web's `navigateLink()`
        returns a Google Maps https URL because a browser has nothing better, and iOS would open a map item or Google
        Maps natively: same capability, different mechanism, not vectored. Then list the open follow-ups, not built:
        - iOS `FMBMapSection.swift` `openInMaps` (`maps://…&q=Corner N`) and `HoldingShare.swift` share text
          (`maps.apple.com…&q=`) still go to Apple Maps;
        - Expo `apps/mobile/src/app/property/[id].tsx` ("View full map", "Open in Maps", share text, all with the
          title in `q=`) and `apps/mobile/src/app/(tabs)/passbooks.tsx` (address search on `maps.apple.com`) do the
          same;
        - neither phone finds the survey under the device's position.

        Owners: `sync-ios` / `mobile-feature-delivery`. Reddy's no-record-text-in-URLs rule applies to them when built.
      - `apps/web/README.md` and `design.md` were checked and have no hand-off text: no change.
      Files: scripts/emit-vectors.ts, docs/specs/2026-08-15-web-360-design.md, docs/specs/2026-08-22-web-ios-parity-contract.md
      Verify: `bun run scripts/emit-vectors.ts --check` prints VECTORS CURRENT. Re-read both doc sections against the
      code. Every path they name exists, and no doc outside `.worktrees` still says `mapsLink` except as "removed"
      (grep `mapsLink|maps\.apple|Open in Apple` in `docs/`).

- [ ] 6. Full verification and cleanup.
      From the repo root (pre-existing failures from the user's uncommitted work are reported, not "fixed"):
      - `cd packages/core && bun run typecheck`; `cd apps/web && bun run typecheck`
      - `bun test packages/core packages/tokens apps/web/src apps/mobile/tests apps/university/src` (CI unit line)
      - `for script in scripts/*-tests.ts; do bun run "$script" || echo "FAILED: $script"; done` (all 20, including
        geo, typography, shared-components, a11y-web, contrast, palette, village)
      - `bun run scripts/icon-guard.ts`; `bun run scripts/ux-guards.ts`
      - `bun run scripts/emit-vectors.ts --check` (no vector diff)
      - `bun run scripts/parity-check.ts` (if it runs without network or devices; it should be unaffected)
      - `cd apps/web && bun run build`
      - the step 4c Playwright result (or rerun it, starting and stopping your own server again)
      - `tests/e2e-web360` is NOT run (it needs its own API/DB stack); report that the two rewritten screens.spec tests
        were parse-checked only.

      Record the commands and results in
      `/Users/reddy.sh/reddy.sh/projects/pattadar-platform/.agents/tasks/pattadar-platform-navigate-current-location-2026-10-03/followup-verification.md`.
      Confirm that no agent-started process is still running and that the `/tmp/pp-*` scratch files are gone.
      Verify: every command exits 0, or the failure is shown to be pre-existing on the untouched baseline.

## Change-governance notes for the final report

- Documentation: step 5 (two specs plus the emit-vectors comment).
- Architecture: no new entrypoint, dependency or trust boundary. The third-party destination for hand-offs narrows
  from Apple/OSM/`geo:` to google.com only, as a user-clicked href.
- Security/privacy: this removes record text (survey number, village) from the whole-parcel and FMB hand-off URLs, so
  less data leaves the app. Coordinates still go to Google only on the user's click. Nothing is logged.
- Testing: steps 1-4 and 6. Functional surface: link and label only. The pin and boundary writes are re-exercised by
  the e2e run in step 4c. That run is the functional-acceptance proof the previous round lacked.
- Not verified: e2e-web360, a real device opening the Google Maps app, and the FMB viewer button at runtime. iOS and
  Expo are not changed (follow-ups recorded).
- Public API change inside the monorepo: removed `@pattadar/core` exports, with no remaining importer (grep-verified).
