# Pattadar UX Redesign — Material Design 3 on Emerald & Gold

**Status:** Active spec for the M3 redesign loop · **Rule zero:** functionality parity is gated by the `tests/e2e-ux` Playwright suite — no restyle merges while it's red.

## Principles (Google-standard, applied to this product)

1. **One decision per screen region.** Exactly one filled (primary) button per view region; everything else is tonal/outlined/text. Today's screens have competing filled buttons — that ends.
2. **Hierarchy through type and space, not boxes.** Fewer bordered cards; more whitespace rhythm. Cards only where content is a true unit (a khata, a holding).
3. **The 4px grid is law.** Spacing steps 4/8/12/16/24/32/48. Page gutters 24 (16 mobile). Card padding 20. Section gaps 32.
4. **States are designed, not defaulted.** Every async view ships skeleton loading (no lone spinners), designed empty states (icon + one sentence + one action), and inline error recovery. Every interactive element has visible hover/focus/pressed states.
5. **Plain language everywhere** (existing invariant) — labels a farming family understands, DD/MM/YYYY, ₹ en-IN.

## Color (M3 roles derived from brand tokens)

- **Primary** emerald `#146C43` family → containers `primaryContainer` (light emerald wash) for selected states, tonal buttons, active nav pill. On-colors AA-checked.
- **Secondary** gold `#C9A227` family → *reserved*: wallet, premium moments, hero glass, focus rings, small accents. Gold is seasoning, never structure.
- **Tertiary** teal (charts/info accents). **Error** unchanged; **warning = orange** stays reserved (tax/EC attention).
- Surfaces: light = green-tinted ivory stack (`#F4F8F4` bg → white cards); dark = emerald-charcoal stack (`#0F2318` → `#153024` → `#1B3D2D`). Surface *tint*, not shadow, signals elevation on cards.
- State layers: hover 8%, focus 12%, pressed 12% of the role color.

## Type scale (MUI variants ↔ M3)

| Variant | Use | Spec |
|---|---|---|
| h1 (Display) | Landing hero only | 44–57px, 700, -0.5 tracking |
| h2 (Headline) | Page titles | 28px, 700 |
| h3/h4 (Title) | Card/section titles | 20/17px, 600 |
| body1/body2 | Content | 16/14px, 1.55 line-height |
| overline (Label) | Eyebrows, table headers | 12px, 600, +1 tracking |
| Stat figures | Tabular numerals (`font-feature-settings: "tnum"`) |

## Shape & elevation

- Radius: 12 default · 16 cards · 20 dialogs/hero · full (999) chips, pills, nav indicator.
- Elevation: borders + surface tint for resting cards; shadows ONLY for overlays (menus, dialogs, viewer). Gold-glass treatment unchanged where it lives (hero, wallet) — it is the brand's one deliberate flourish.

## Components (redesign checklist)

- **Nav drawer**: M3 style — 12px inset active pill (primaryContainer + primary text), 48px item height, section spacing, icons 24px optical.
- **Top bar**: quiet; page title lives in content, not the bar.
- **Buttons**: hierarchy per principle 1; 40px height (48 touch), icon+label spacing 8.
- **Stat cards**: label (overline) + figure (tnum) + optional delta chip; no borders in a stat row — use a single soft container.
- **Tables/lists**: 52px rows, hover wash, sticky headers, right-aligned numerals; row actions appear on hover/focus (always visible on touch).
- **Forms/dialogs**: 560px standard width, sections with overline headers, inline validation on blur, primary action right, destructive = text-button red with confirm.
- **Chips**: status chips = tonal (container colors); metadata chips = outlined; 24/32px heights.
- **Snackbars**: bottom-center, one at a time, action optional; errors persist until dismissed.
- **Skeletons**: shaped like the content they replace (cards, table rows, hero).
- **Motion**: 200ms standard / 250ms emphasized, `cubic-bezier(0.2, 0, 0, 1)`; respect `prefers-reduced-motion`.

## Accessibility gates (enforced by the suite)

AA contrast on all text; 44×44 minimum touch targets; visible focus (2px gold ring, 2px offset); every icon-button has an accessible name; no console errors; no horizontal overflow; no new tabs (founder rule); Esc closes every overlay.

## Out of scope (unchanged)

Information architecture (nav order, view contents — parity is frozen), the landing page (already approved), auth pages (light polish only), all backend behavior.
