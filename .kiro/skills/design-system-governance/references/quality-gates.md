# Pattadar Design Quality Gates

Adapted from accessibility-first UI review patterns; project authorities win.

| Concern | Pattadar rule |
|---|---|
| Authority | root `design.md` for web; `apps/ios/design.md` for SwiftUI; current Expo theme/source for compatibility client |
| Accessibility | body text >=4.5:1; meaningful non-text UI >=3:1; visible focus; semantic controls/names; color not sole signal |
| Targets | web/iOS >=44px/pt; Android >=48dp; preserve spacing between adjacent targets |
| Motion | purposeful, finite, reduced-motion resolved before animation; no readability gate or decorative loop |
| Theme | complete light/dark/high-contrast web states; token-driven; no ad-hoc app hex except documented media/PDF/map exceptions |
| Typography | self-hosted web fonts; iOS system/New York roles; dynamic type/zoom and readable measure |
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

## Review evidence

Prefer screenshots at representative widths plus DOM/semantic assertions where
available. A screenshot proves appearance, not keyboard/screen-reader behavior;
tests and source semantics remain separate evidence.
