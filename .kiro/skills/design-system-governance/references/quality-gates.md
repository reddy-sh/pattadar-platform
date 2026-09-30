# Pattadar Design Quality Gates

Adapted from accessibility-first UI review patterns; project authorities win.

| Concern | Pattadar rule |
|---|---|
| Authority | root `design.md` for web; `apps/ios/design.md` for SwiftUI; current Expo theme/source for compatibility client |
| Accessibility | body text >=4.5:1; meaningful non-text UI >=3:1; visible focus; semantic controls/names; color not sole signal |
| Targets | web/iOS >=44px/pt; Android >=48dp; preserve spacing between adjacent targets |
| Motion | purposeful, finite, reduced-motion resolved before animation; no readability gate or decorative loop |
| Theme | complete light/dark/high-contrast web states; token-driven; no ad-hoc app hex except documented media/PDF/map exceptions |
| Typography | web: ONE face, Atkinson Hyperlegible 400/700 + 400 italic, self-hosted; one token `--font-sans` named only by the roots; no per-role face (mono labels/figures, serif accent, display headings); digits align with `tabular-nums`; weights are 400 or 700. iOS system/New York roles until `docs/specs/TODO-one-platform.md` is decided. Dynamic type/zoom and readable measure everywhere |
| Components | a screen composes `w360/ui.tsx` (W360) or `components/` (previous app); a page-local copy or a same-named shadow of a shared component is a defect; a concern's second copy is lifted into the shared module; unit words, plurals, dates and money come from `packages/core` |
| Layout | 4-point rhythm; `minmax(0, …)` grids; no horizontal overflow; safe-area/fixed-bar clearance |
| Icons | consistent vector family/style; decorative hidden; controls named; no emoji structural icons |
| Feedback | labels persist, errors near fields, disabled semantics, no layout-shifting press effect |
| Copy | user vocabulary, sentence case, active verbs, byte-frozen visible text unless approved |

## Client boundaries

- Web marketing may use the two approved domain-specific scenes; app pages have
  no enrichment; legal/auth is typography-led.
- iOS receives amber, derived warm paper, and record-serif register—not web
  layout/CSS/type scale.
- Expo generated `ios/`/`android/` directories are never hand-edited.
- Confirm whether Expo actually imports `packages/tokens` before claiming token
  parity; manifest dependency alone is not runtime evidence.

## Enforcement

| Rule | Check | Proves |
|---|---|---|
| One face (source) | `bun run scripts/typography-tests.ts` | packages, token copies, `font-family`/`fontFamily`, weights, spelled stacks, roots and entry imports in `apps/web` and `apps/university` |
| One face (browser) | `tests/e2e-app/specs/26-one-font.spec.ts`, both projects | the computed face of every visible text box and pseudo-element on every signed-in, previous-app and public route, including user-agent and Leaflet defaults the source scan cannot see |
| One component per concern | `bun run scripts/shared-components-tests.ts` | no W360 file hand-builds more cards, key/value cells, empty states, tab lists or ui.tsx shadows than its budget |
| Colour literals | `bun run scripts/a11y-web-tests.ts` | the colour-literal and `var()` ratchets |

The three scripts run in CI through the `scripts/*-tests.ts` loop; the browser
spec runs in the nightly sealed shards and locally against a served bundle. A
passing check proves only its own rule; it is not a design review.

## Review evidence

Prefer screenshots at representative widths plus DOM/semantic assertions where
available. A screenshot proves appearance, not keyboard/screen-reader behavior;
tests and source semantics remain separate evidence. A screenshot also cannot
prove which font drew a glyph — read the computed style, or on Chromium
`CSS.getPlatformFontsForNode`.
