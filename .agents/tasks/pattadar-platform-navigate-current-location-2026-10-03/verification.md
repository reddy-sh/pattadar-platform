# Verification — Navigate → Google Maps, "Use my current location" finds the survey

Iteration 1 (no review.json existed). Run from the repo root on 03/10/2026, on top
of the user's uncommitted working tree. Nothing committed.

## Commands and results

| Command | Result |
|---|---|
| `cd packages/core && bun run typecheck` | exit 0 |
| `cd apps/web && bun run typecheck` | exit 0 |
| `bun test packages/core/src/land` | 19 pass, 0 fail (incl. new `geo.test.ts`: navigateLink URL, float trim, no label/q/origin/travelmode, '' for NaN/Infinity/0,0; pointInRing in/out) |
| `bun test apps/web/src/w360/villageGeom.test.ts` | 5 pass, 0 fail (plotAt: adjacent squares, outside/empty/NaN → null, overlap → smaller, closed ring, <3 corners) |
| `bun test packages/core packages/tokens apps/web/src apps/mobile/tests apps/university/src` (CI line) | 812 pass, 0 fail, 51 files |
| `for script in scripts/*-tests.ts; do bun run "$script"; done` | all 20 exit 0: a11y-web, aadhaar-digits, area, cache-eviction, contrast-helper, contrast, fence, geo, hooks, lifecycle, network-interest, palette, plural, provenance, screening, shared-components, typography, url-scheme, village, vocab |
| `bun run scripts/icon-guard.ts` | ICON GUARD PASSES |
| `bun run scripts/ux-guards.ts` | UX GUARDS PASS |
| `bun run scripts/emit-vectors.ts --check` | VECTORS CURRENT (no vector change; `navigateLink` deliberately not vectored, bucket 3) |
| `cd apps/web && bun run build` | ✓ built (writes the gitignored `apps/web/dist`, which already existed) |
| `bun build --no-bundle` on `tests/e2e-app/specs/09-record-boundary.spec.ts` and `tests/e2e-web360/specs/screens.spec.ts` | both parse (syntax check only) |

## Not run

- `tests/e2e-app` Playwright (`09-record-boundary.spec.ts`): the founder's dev server on :5180
  was down (`curl -sf http://localhost:5180` failed); per the plan it was not started. The
  updated/new scenarios are therefore unexecuted: Navigate href assertion, the updated
  "phone standing on the land" hint, and three new tests (empty record → survey found →
  setPin only on Save pin → setBoundary only on "This is my land"; outside every plot;
  no village map).
- `tests/e2e-app` type-check: its `tsconfig.json` does not type-check with the repo's
  TypeScript 7 (`moduleResolution=node10` removed, missing `@types/node`) — pre-existing,
  unrelated; only the syntax parse above was done.
- `tests/e2e-web360` (needs its own API/DB stack). Two href regexes updated to Google Maps.
- Real-device GPS, iOS and Expo (no change made there).

## Follow-ups recorded (not built)

- iOS: `FMBMapSection.swift` `openInMaps` / `SetLocationScreen.swift` — no Google Maps
  navigate, no survey lookup under the device position (noted in the parity contract §3).
- Expo: `apps/mobile/src/app/property/[id].tsx`, `(tabs)/passbooks.tsx` still hand off to
  `maps.apple.com` (view/search links, not Navigate).
- "Open in Apple Maps / Maps / OpenStreetMap" (view hand-off, `mapsLink`) unchanged — A1.
