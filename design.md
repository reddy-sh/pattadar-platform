# Design — Pattadar

A locked design system for this app. Every page redesign reads this file before
emitting code. Do not regenerate per page — extend or amend this file when the
system needs to grow.

Stamp: `Hallmark · genre: atmospheric · macrostructure: Marquee Hero (marketing family) · theme: studied-DNA (source: https://www.usehallmark.com/examples/hyperlane/ · Bloom) · studied: yes · DNA-source: url · designed-as-app`

## Genre

atmospheric (dark warm paper, ambient blooms, typography-only enrichment)

## Provenance

- Extracted from `https://www.usehallmark.com/examples/hyperlane/` (Hallmark's own
  public example gallery) as a **public reference for the user's brand** on
  2026-08-14. Attestation: (b) public reference.
- Tokens are exact (extracted from the source's `tokens.css`). Fonts are exact
  (extracted from the source's Google Fonts declaration, re-shipped self-hosted
  via @fontsource per the founder rule). Rhythm was verified with a screenshot
  pass (generous, left-biased sections under a centered hero).
- The DNA is structural: macrostructure + archetypes + colour anchor +
  type roles. Pattadar's copy, IA, routes and behaviour are untouched.

## Macrostructure family

- **Marketing pages** (`/` landing): Marquee Hero — centered display hero
  (heavy sans line + one italic serif accent line), mono data strip, mono
  eyebrows over left-aligned section heads, hairline-ruled timetable rows,
  programme-card grid (dashed `--tba` variant for roadmap items), FAQ as
  native `<details>` hairline rows, Ft5 statement close. Nav: **N10
  scroll-morph** (full-width hairline bar at rest → floating pill when
  scrolled; deliberate variation from the source's N5 — Pattadar's nav
  carries 7 links + brand + CTA).
- **App pages** (`/app/*`): existing MUI shell, tokens-only restyle. No
  enrichment ever — function carries the page. Both light and dark MUI
  colorSchemes stay functional.
- **Content/legal pages** (`/privacy`, `/terms`, auth frames): Long Document
  voice — wordmark hairline bar, measure-limited column, statement-free
  bottom row.

## Theme (dark · canonical — see apps/web/src/styles/tokens.css)

- `--color-paper`   oklch(13% 0.018 35)   ≈ #0d0504
- `--color-paper-2` oklch(17% 0.020 35)   ≈ #170c09
- `--color-paper-3` oklch(22% 0.022 35)   ≈ #241714
- `--color-paper-4` oklch(28% 0.020 35)   ≈ #322522
- `--color-ink`     oklch(95% 0.010 70)   ≈ #f3ede7
- `--color-ink-2`   oklch(78% 0.015 60)   ≈ #bfb5ae
- `--color-ink-3`   oklch(58% 0.015 50)   ≈ #827873  (small mono labels on base paper only — 4.47:1 on paper-2, keep off paper-2 body text)
- `--color-rule`    oklch(28% 0.018 40)   ≈ #312622
- `--color-rule-strong` oklch(40% 0.025 40) ≈ #54433e
- `--color-accent`  oklch(74% 0.180 55)   ≈ #fe860f  (amber · 8.29:1 on paper)
- `--color-accent-2` oklch(68% 0.220 18)  ≈ #ff4a63  (coral · sparingly)
- `--color-accent-ink` oklch(15% 0.040 50) ≈ #180600 (text on amber · 8.11:1)
- `--color-focus`   oklch(82% 0.180 55)   ≈ #ffa03c
- `--color-error`   oklch(70% 0.220 25)   ≈ #ff5453
- `--color-success` oklch(74% 0.160 145)  ≈ #61c568

### Light scheme (app only — derived, warm-tinted; lives in apps/web/src/theme.ts)

- background.default `#f9f6f2` (oklch 97.5% 0.006 70) · background.paper `#fdfcf9`
- text.primary `#261d1a` (15.31:1) · text.secondary `#615956` (6.35:1) · divider `#e3ddd8`
- primary.main `#aa5910` (oklch 55% 0.13 55 — white contrastText 5.07:1)
- error `#be222a` (6.08:1 w/ white) · success `#27762f` (5.65:1 w/ white)

### Semantic slots — define ALL SIX on BOTH schemes (added 2026-08-14)

MUI does not disable an undefined palette slot; it substitutes its factory
default. `warning`, `info` and `secondary` were undefined while being used 22
times, so #ed6c02 orange, #0288d1 blue and #9c27b0 purple shipped inside an
amber system. Ratios measured against that scheme's `background.default`.

| slot | dark | light |
| --- | --- | --- |
| secondary | `#ff4a63` coral (6.16:1) — this is `--color-accent-2` | `#b23645` (5.56:1) |
| warning | `#f5ae39` gold @75° (10.57:1) | `#905d00` (5.20:1) |
| info | `#82bad5` muted slate @230° (9.55:1) | `#3d6a7f` (5.47:1) |

`warning` is held off primary's 55° so "needs attention" never reads as "do
this". `info` is the system's ONE cool seam and is deliberately low-chroma.

### Default scheme

**Dark.** `apps/web/src/main.tsx` boots `defaultMode="dark"`. The landing page
is permanently dark, so booting the app in light broke the brand at the exact
moment of sign-in. Light stays fully supported via the header toggle.

## Typography

- Display: **Inter Tight**, weights 600/700/800, style normal, tracking −0.02em,
  display leading 0.92
- Body: **Inter**, weights 400/500/600
- Mono: **JetBrains Mono**, weights 400/500 (labels, data strips, numerals, `tnum`)
- Accent face: **Instrument Serif** *italic* — ONLY for the hero's second line,
  the FlipWord rotator, and the Ft5 statement's emphasis phrase. Never on
  headings wholesale (italic headers are banned; the italic accent phrase inside
  a roman display heading is the studied DNA's one sanctioned exception).
- All fonts self-hosted via @fontsource (founder rule: nothing loads from
  third-party URLs).
- Type scale anchor: `--text-display: clamp(3rem, 11vw + 0.25rem, 9.5rem)`

## Spacing

4-point named scale (`--space-2xs` … `--space-4xl`, canonical values in
tokens.css). Pages must use named tokens, never raw values.

## Motion

- Easings: `--ease-out: cubic-bezier(0.20, 0.80, 0.20, 1.00)` (+ `--ease-in`,
  `--ease-in-out` in tokens.css); durations 120/220/400ms.
- Keyframes: `rise` (fade-up) and `pulse` only. No shimmer, no border-spin,
  no float, no aurora drift.
- Reveal pattern: rise on scroll-enter (IntersectionObserver), staggered rise
  on hero load.
- Reduced-motion fallback: opacity-only, ≤150ms (scoped block in site.css plus
  the global guard in theme.ts).

## Microinteractions stance

- Silent success; no celebratory toasts.
- Hover: −1px translate + border-strong on cards; never scale, never glow.
- Focus: `--color-focus` ring, 2px, visible instantly (never animated).
- Hover tooltips delay 800ms; focus tooltips 0ms.

## CTA voice

- Primary: amber pill (`--color-accent` fill, `--color-accent-ink` text,
  radius-pill, weight 600, sentence case).
- Secondary/ghost: hairline pill (`--color-rule-strong` border, ink text).
- The hero and final statement own the amber; nav CTA stays ghost. Accent
  footprint ≤ 5% per viewport.

## Per-page allowances

- Marketing pages: typography-only enrichment (ambient blooms + grain allowed);
  no CSS-art heroes, no fake chrome, no invented imagery.
- App pages: no enrichment. Legal/auth pages: typography only.

## What pages MUST share

- The wordmark voice: "Pattadar" in Inter Tight 700 (landing keeps its literal
  `.` in amber).
- The amber accent and its placement discipline (≤5% per viewport).
- Inter Tight display + Inter body + JetBrains Mono labels.
- The CTA voice (pill shape, weight 600, sentence case).
- Hairline rule language (`--rule-hair` solid `--color-rule`).

## What pages MAY differ on

- Macrostructure within the page-type family.
- Hero archetype (marketing only).
- App pages keep MUI component conventions (cards radius 12, buttons pill).

## Copy freeze (project rule)

User-visible text is **byte-frozen**. Landing copy lives in
`apps/web/src/pages/landing/landingContent.ts` — redesigns may not add, remove
or alter strings (CSS case transforms are presentation, not copy). The e2e
suite asserts on visible text; never change visible headings/labels/roles.
No invented metrics, testimonials or logos — ever (also a founder rule).

## App-surface rules (added 2026-08-14, after the first app-side audit)

The marketing pages honoured this file from day one; the app pages did not.
These are the seams that drifted, and the rules that keep them from drifting
again.

- **No colour literals in app code.** Every colour resolves through
  `palette.*`, a `--mui-palette-*` var, or `color-mix()` over one of those.
  The audit found 86 hex/rgba literals across 12 files — an Ant Design status
  ramp, two blue gradients (`#14202f → #1b3252`, `#144E8C → #4D9BE0`) and a
  14-colour avatar rainbow, all surviving from superseded systems.
  Three exceptions, each commented at the call site: scrims and controls that
  sit over **arbitrary user media** (neutral black/white, never a palette
  tint), the **PDF iframe** backdrop (a PDF page is white), and **FmbMapViewer**
  sketch strokes (SVG over imagery — literals, but Bloom values).
- **Hairline, not shadow.** `MuiCard` defaults to `variant="outlined"`.
  Surfaces separate with a 1px `divider` rule; pass `elevation` explicitly only
  for things that genuinely float (menus, dialogs). Card hover is
  `translateY(-2px)` + border-strong, mirroring site.css `.card:hover`.
- **Mono eyebrows.** `theme.typography.overline` carries JetBrains Mono, so
  every `PageHeader` eyebrow and `<Typography variant="overline">` is the app's
  half of "JetBrains Mono labels".
- **Fill means act.** Filled chips are reserved for state that demands
  attention. Counts and classifications are `variant="outlined"`.
- **Grid tracks are `minmax(0, Nfr)`, never bare `Nfr`.** A bare `fr` floors at
  min-content, so one non-shrinking child scrolls the whole page sideways —
  which is what it did at 375px until 2026-08-14.
- **Progress tracks are neutral.** MUI derives a track from its bar's colour
  (`darken(primary, 0.5)` = a solid `#7f4307`), so an empty bar read as a
  finished amber line. `MuiLinearProgress` pins the track to `action.selected`.
- **Content is measure-capped.** `AppShell` caps the routed area at `80rem`
  (`--max-width`) and centres it, so the app and marketing pages agree.

## Notes — anti-patterns NOT to carry over / reintroduce

- From the old landing (removed 2026-08-14): moving-border conic CTA, gradient
  shimmer text, floating/tilting product frame, glow-on-hover cards, aurora
  blobs, dot-grid + spotlight hero, blue-gradient step circles.
- Never: transition-all, hover-scale, bouncy easings, italic full headers,
  numbered eyebrows beyond copy that genuinely contains numerals, fake browser
  chrome, invented stats.
- **Never leave a superseded system described in a comment.** The audit found
  header comments still naming the "stock theme", the "emerald gradient" (over
  code that was blue) and the "gold-glass surface" (over a plain Paper). A
  stale comment is how the next redesign inherits a dead system.

## Exports

Canonical: `apps/web/src/styles/tokens.css` (imported globally by
`apps/web/src/main.tsx`). MUI mappings: `apps/web/src/theme.ts`.
Cross-app values (chart series, status hues): `packages/tokens/src/index.ts` —
consumed by `apps/web` and `apps/web-next`, NOT by mobile/iOS.
No Tailwind/shadcn consumers exist in this repo; generate those formats from
tokens.css on demand if ever needed.

### Chart series (re-derived 2026-08-14)

Slot order `amber(brand) · teal · coral · green · plum · slate`. The previous
ramp led with `#1976D2` and was validated against a neutral `#121212`; Bloom's
dark paper is warm `#0d0504`, so both the hues and the validation surface were
wrong. Every slot clears 3:1 on its own surface. Slots 1 and 3 are the two warm
hues and so the colour-blindness risk — they are separated by **lightness**
(1.78:1 normal, 1.69:1 simulated deuteranopia), not hue alone.

Outstanding: the full six-checks adjacent-ΔE sweep across all 15 pairs has NOT
been re-run. Do that before this palette carries a dense multi-series view.
