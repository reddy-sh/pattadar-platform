# Pattadar Design Quality Gates

Adapted from accessibility-first UI review patterns; project authorities win.

| Concern | Pattadar rule |
|---|---|
| Authority | root `design.md` for web and University; `apps/ios/design.md` for SwiftUI; `apps/mobile/src/theme/paper.ts` plus the `tokens` Expo screens import from `@pattadar/tokens` for the Expo compatibility client |
| Accessibility | body text >=4.5:1, >=7:1 on High Contrast (AAA, `textLevel` in `registry.ts`); meaningful non-text UI >=3:1; visible focus; semantic controls/names; color not sole signal |
| Targets | web/iOS >=44px/pt; Android >=48dp; preserve spacing between adjacent targets |
| Motion | purposeful, finite, reduced-motion resolved before animation; no readability gate or decorative loop |
| Theme | every scheme registered in `packages/tokens/src/palette/registry.ts` (today Light, Dark, Pattadar Gold, High Contrast) complete, all six semantic slots on each; the palette pack is the only source of scheme colours — `w360.css` and University's `tokens.css` alias MUI variables instead of redeclaring a scheme, and `tokens.css` declares no colour; no ad-hoc app hex except documented media/PDF/map exceptions |
| Typography | web: ONE face, Atkinson Hyperlegible 400/700 + 400 italic, self-hosted; one token `--font-sans` named only by the roots; no per-role face (mono labels/figures, serif accent, display headings); digits align with `tabular-nums`; weights are 400 or 700. iOS system/New York roles until `docs/specs/TODO-one-platform.md` is decided. Dynamic type/zoom and readable measure everywhere |
| Components | a screen composes `w360/` (`ui.tsx`, `Dialog`, `Drawer`, `Toast`, `skeletons`, `PropertyTable`, `ServiceList`) or `components/` (previous app); a page-local copy or a same-named shadow of a shared component is a defect; a concern's second copy is lifted into `ui.tsx`; unit words, plurals, dates and money come from `packages/core` |
| Layout | 4-point rhythm; `minmax(0, …)` grids; no horizontal overflow; safe-area/fixed-bar clearance |
| Icons | consistent vector family/style; decorative hidden; controls named; no emoji structural icons |
| Feedback | labels persist, errors near fields, disabled semantics, no layout-shifting press effect |
| Copy | design.md § App vocabulary and § Naming standard words (`scripts/vocab-tests.ts`), sentence case, active verbs, byte-frozen visible text unless approved |

## Client boundaries

- Web marketing may use the two approved domain-specific scenes; app pages have
  no enrichment, but may take the grammar of the land record they show
  (register rows with entry numbers, paper spines, dashed slots for unfiled
  papers) when it carries real data (design.md § Macrostructure family,
  27/09/2026); legal/auth is typography-led.
- iOS receives amber, derived warm paper, and record-serif register—not web
  layout/CSS/type scale.
- Expo generated `ios/`/`android/` directories are never hand-edited.
- Confirm whether Expo actually imports `packages/tokens` before claiming token
  parity; manifest dependency alone is not runtime evidence.

## Enforcement

| Rule | Check | Proves |
|---|---|---|
| One face (source) | `bun run scripts/typography-tests.ts` | packages, token copies, `font-family`/`fontFamily`, weights, spelled stacks, roots and entry imports in `apps/web` and `apps/university` |
| One face (browser) | `cd tests/e2e-app && bun run test specs/26-one-font.spec.ts` against the running server (`APP_WEB_URL`, default :5180; never start one; needs Playwright Chromium and WebKit) | the computed face of every visible text box and pseudo-element on every signed-in, previous-app and public route, including user-agent and Leaflet defaults the source scan cannot see |
| One component per concern | `bun run scripts/shared-components-tests.ts` | no W360 file hand-builds more cards, key/value cells, empty states, tab lists, segmented controls or ui.tsx shadows than its budget, and every /app page follows § Page head |
| Schemes | `bun run scripts/palette-tests.ts`; `bun test packages/tokens` | every registered scheme has every role and clears its contrast floors (AAA where `textLevel` says so); each app's `theme-init.js` matches `bun run scripts/emit-theme-init.ts` (re-run it after a pack change) |
| Web a11y and tokens | `bun run scripts/a11y-web-tests.ts` | A11Y-1/2 accessible names; M3-1/2 slots and schemes; M3-3/4/5 colour-literal ratchets; M3-6/7 every `var()` and alias resolves, University declares no colour |
| Expo | `bun run scripts/contrast-tests.ts`; `bun run scripts/icon-guard.ts` | `paper.ts` text contrast; every icon name exists in the glyph map |
| Web ↔ iOS tokens | `bun run scripts/parity-check.ts` (seam 5) | contractual palette roles agree with the iOS palette |
| Vocabulary | `bun run scripts/vocab-tests.ts` | design.md § App vocabulary and § Naming standard |

The scripts run in CI (`scripts/*-tests.ts` loop, `icon-guard.ts`,
`bun test packages/tokens`, `parity-check.ts`); the browser spec is not a merge
gate — the sealed suite runs one shard of eight per night. A passing check
proves only its own rule; it is not a design review.

## Review evidence

Prefer screenshots at representative widths plus DOM/semantic assertions where
available. A screenshot proves appearance, not keyboard/screen-reader behavior;
tests and source semantics remain separate evidence. A screenshot also cannot
prove which font drew a glyph — read the computed style, or on Chromium
`CSS.getPlatformFontsForNode`.
