# Design — Pattadar

A locked design system for this app. Every page redesign reads this file before
emitting code. Do not regenerate per page — extend or amend this file when the
system needs to grow.

Authority: Pattadar applies Google Material 3 principles for accessible hierarchy, adaptive layout, expressive shape, purposeful motion, and clear interaction states while retaining its original Bloom identity.

## Genre

atmospheric (dark warm paper, ambient blooms, typography-only enrichment)

## Provenance

- Pattadar's Bloom identity is project-owned: warm dark paper, amber action colour,
  expressive typography, and original land-record illustrations.
- Interaction, accessibility, adaptive-layout, shape, and motion decisions follow
  Google Material 3 and Google Design guidance, adapted to Pattadar rather than
  copying Google's brand identity.
- Official principle references:
  [Material Design](https://design.google/tags/material-design),
  [expressive Material research](https://design.google/library/expressive-material-design-google-research),
  [making motion meaningful](https://design.google/library/making-motion-meaningful/), and
  [Gemini visual design](https://design.google/library/gemini-ai-visual-design).
  These references inform interaction principles only; Pattadar owns its palette,
  artwork, product metaphors, and implementation.

## Macrostructure family

- **Marketing pages** (`/` landing, `/pricing`): Marquee Hero — centered display hero
  (heavy sans line + one italic serif accent line), mono data strip, mono
  eyebrows over left-aligned section heads, hairline-ruled timetable rows,
  programme-card grid (dashed `--tba` variant for roadmap items), FAQ as
  native `<details>` hairline rows, Ft5 statement close. Nav: **N10
  scroll-morph** (full-width hairline bar at rest → floating pill when
  scrolled; deliberate variation from the source's N5 — Pattadar's landing nav
  carries 7 section links + one route-level Pricing link + brand + CTA).
- **App pages** (`/app/*`): functional shell, tokens-only restyle. No
  enrichment ever — function carries the page. Light, Dark, and High Contrast
  remain complete, user-switchable schemes.
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

### High Contrast scheme (app only — low-vision reading mode)

High Contrast is deliberately light-based: it is not a more saturated brand
skin. Reading surfaces are white, primary text is black (21:1), secondary text
is `#1f1f1f` (16.48:1), rules are solid black, and focus indicators grow from
2px to 3px. Filled actions use dark blue `#003b73` (11.21:1 on white) with
white text. Selected states retain shape, weight, border, or checkmark cues so
colour is never their only signal.

### Semantic slots — define ALL SIX on ALL THREE schemes

MUI does not disable an undefined palette slot; it substitutes its factory
default. `warning`, `info` and `secondary` were once undefined while being
used 22 times, so unrelated default blue and purple reached the amber system.
Ratios below are measured against that scheme's background.

| slot | dark | light | High Contrast |
| --- | --- | --- | --- |
| primary | `#fe860f` amber (8.29:1) | `#aa5910` (5.07:1) | `#003b73` dark blue (11.21:1) |
| secondary | `#ff4a63` coral (6.16:1) | `#b23645` (5.56:1) | `#5a1a78` plum (11.33:1) |
| error | `#ff5453` | `#be222a` | `#a40000` (8.14:1) |
| success | `#61c568` | `#27762f` | `#006b3c` (6.63:1) |
| warning | `#f5ae39` gold (10.57:1) | `#905d00` (5.20:1) | `#6b4f00` (7.65:1) |
| info | `#82bad5` slate (9.55:1) | `#3d6a7f` (5.47:1) | `#004f6b` (9.01:1) |

`warning` stays distinct from the primary action colour so "needs attention"
never reads as "do this". `info` remains the system's one cool semantic seam.

### Theme choice and persistence

Authenticated app headers expose exactly **Light**, **Dark**, and **High
Contrast** in an accessible menu; the Next settings drawer exposes the same
three choices as one preference. The selected choice is visibly marked,
announced to assistive technology, and restored after reload. Web360 persists
under `w360.scheme`; the legacy MUI renderer persists mode and named scheme;
the Next renderer migrates its previous `themeMode`/`themeContrast` settings
into one `themeChoice`. A former `bold` preference becomes High Contrast.
Marketing remains intentionally dark, independent of the signed-in app choice.

### Default scheme

**Dark** in `apps/web`. The landing page remains
permanently dark, while every signed-in renderer provides all three choices.

## Typography

- Display: **Inter Tight**, weights 600/700/800, style normal, tracking −0.02em,
  display leading 0.92
- Body: **Atkinson Hyperlegible**, weights 400/700. Chosen as the all-ages
  reading face because its deliberately differentiated letter and number forms
  improve recognition for low-vision readers without making the interface feel
  specialized or clinical.
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
- Motion must explain hierarchy, continuity, or system response. Content is visible
  by default; `reveal-in` is a progressive CSS view-timeline enhancement and
  never a JavaScript gate on readability.
- **Animation engine: Motion** (`motion`, motion.dev, MIT), pinned exactly and
  Import through `LazyMotion` with the `m`
  component and asynchronously loaded `domAnimation` features, in `strict` mode,
  so a marketing page never pays for the full bundle. Motion+ and its private
  registry are out of scope: no paid token belongs in this repo. Hand-rolled
  keyframe systems are not to be reintroduced where Motion expresses the intent.
- Motion earns its place by teaching or confirming something. Exactly two scenes
  on the landing page qualify, and they must not share a visual grammar:
  - `HeroStory` states the promise. Five kinds of real Andhra Pradesh record —
    pattadar passbook, registered deed, FMB survey sketch, village map, adangal
    rows — drift in from the edges, each collapsing into the row it becomes
    inside ONE record card, which is then stamped verified and locked while the
    family gathers beneath it. It **converges**, because the headline is "in one
    secure place". Papers aim at their own row, never a shared point, so cause
    and effect stay legible instead of piling into a blob.
  - `PlatformJourney` explains the mechanics: three acts matching the three
    frozen steps — a document photographed and its details filling themselves
    in, verification links reaching family and coming back confirmed, then
    everything settling into one organised, locked set. It **advances one act at
    a time in place**, beside the step it illustrates, because it is a sequence
    of steps and a visitor can only read one of them at a time. All three acts
    at once in one very wide panel is how this section looked before: the whole
    mechanism on screen, every part of it small, none of it connected to the
    words. That is a diagram, not a story.
- One grammar each, and no reuse: the hero converges, the journey advances a step
  at a time. Three left-to-right arrow chains is how this page looked before, and
  it read as filler.
- A left-to-right chain of abstract icons is not a story. If a scene could be
  swapped for any other product's diagram, it is not carrying its weight.
- **Pattadar AI is deliberately NOT a Motion scene.** It used to be one: a panel
  of abstract placeholder bars, plus a separate chat card beneath it. The bars
  explained nothing and the two panels competed. The sample conversation is the
  picture now — real words, arriving beat by beat, with the record visibly opening
  when the last answer says it is opening. Because that panel holds real copy it
  must never wait on a lazily loaded chunk, so its beats are a CSS timeline
  (`AssistantConversation`): every message is in the DOM and visible by default,
  and the staging is added only once the panel is seen. A dead script leaves a
  complete, readable conversation.
- **Play once, then rest.** The hero story runs on mount; the journey and the
  conversation start when they scroll into view. All stop on the finished picture.
  Nothing on this page loops indefinitely, which is why no pause control is owed
  under WCAG 2.2.2. The journey is re-tellable by choosing any step — by pointer
  or by keyboard — and choosing one ends the autoplay, so it never moves on under
  someone mid-read.
- **Reduced motion must be resolved before the scene mounts.** Motion animates
  through the Web Animations API, so the `prefers-reduced-motion` block in
  site.css cannot rein it in. Read the preference synchronously in the first
  render and pass it down, so the scene mounts at its finished state with no
  movement at all. An effect is too late: the animation has already started.
- **A decorative scene may never break the page.** Both scenes are lazily loaded
  behind an error boundary and a space-reserving fallback. A dropped chunk on a
  poor connection must leave the copy — the part that matters — fully intact.
- **Animation delays are not covered by the reduced-motion guard.** The global
  block under `.site` collapses `animation-duration`, not `animation-delay`, so a
  CSS beat sheet would keep its last beat invisible for seconds. Any staged
  timeline must remove its own animation outright under
  `prefers-reduced-motion: reduce`.
- Elements animate by drawing (`pathLength`), arriving (`scale`), filling
  (`scaleX` from the leading edge) or settling (`y`). No decorative shimmer,
  border-spin, aurora drift, constant floating, or unrelated tilt.
- `rise` provides the short hero-load sequence and `pulse` indicates live status.
  Supporting illustrations stay still so they never compete with the explainer.
- No motion is required to understand content or operate a control. The step list
  beside the journey is the source of truth: all three steps render complete and
  unanimated, whichever act is on the stage, and the state of the story is carried
  by a leading rule and a filled numeral as well as by colour. Under
  `prefers-reduced-motion: reduce` the journey mounts on its first step with that
  act already complete and never advances on its own; steps remain choosable and
  change with no movement at all.

## Microinteractions stance

- Silent success; no celebratory toasts.
- Hover: −1px translate + border-strong on cards; never scale, never glow.
- Focus: `--color-focus` ring, 2px normally and 3px in High Contrast,
  visible instantly (never animated).
- Hover tooltips delay 800ms; focus tooltips 0ms.

## CTA voice

- Primary: amber pill (`--color-accent` fill, `--color-accent-ink` text,
  radius-pill, weight 600, sentence case).
- Secondary/ghost: hairline pill (`--color-rule-strong` border, ink text).
- The hero and final statement own the amber; nav CTA stays ghost. Accent
  footprint ≤ 5% per viewport.

## Design authority

The rules in this document are quality defaults, not a ceiling. Explicit founder direction may override aesthetic constraints when the result improves clarity, trust, emotional resonance, or product understanding. Accessibility, truthful content, privacy, licensing, responsive usability, and performance remain outcome requirements. When an aesthetic rule is overridden, document the decision here and keep the implementation coherent rather than accumulating exceptions.

## Per-page allowances

- Marketing pages remain typography-led. Ambient blooms and grain are allowed.
  The approved **Living Land Record** system is the only illustration exception.
  It is original, domain-specific work using Pattadar's Bloom palette and land,
  document, verification, and family metaphors. It stays decorative beside
  complete text and never reproduces third-party artwork, product icons, branded
  shapes, or distinctive brand colour systems. No CSS-art heroes, fake chrome,
  stock art, or additional invented imagery.
- There are exactly two scenes — `HeroStory` and `PlatformJourney` — and no
  static illustration files. Each is authored as inline SVG inside its component
  so Motion can animate individual parts, which a bundled `.svg` cannot do.
  Because they are inline they must resolve colour through `var(--color-*)`
  tokens rather than hex literals. Both are decorative and `aria-hidden`; the
  hero copy and the step list hold the meaning. Pattadar AI has no scene at all:
  its panel is the sample conversation itself, in real words, and the only
  decorative part of it is the typing pause and the opening record beneath the
  last answer. See § Motion for the play-once-then-rest, reduced-motion and
  failure rules.
- Provenance for both: original Pattadar artwork built from domain metaphors —
  parcel boundaries, passbooks, registered deeds, FMB sketches, village maps,
  adangal rows, verification and family. They embed no third-party image, icon or
  font file, load nothing from a third-party URL, and reproduce no Gemini
  artwork, Google product icon, the Google four-colour system, sparkle branding,
  or any other third-party visual identity. Google Design informed interaction
  principles only.
- App pages: no enrichment. Legal/auth pages: typography only.

## What pages MUST share

- The wordmark voice: "Pattadar" in Inter Tight 700 (landing keeps its literal
  `.` in amber).
- The amber accent and its placement discipline (≤5% per viewport).
- Inter Tight display + Atkinson Hyperlegible body + JetBrains Mono labels.
- The CTA voice (pill shape, weight 600, sentence case).
- Hairline rule language (`--rule-hair` solid `--color-rule`).

## What pages MAY differ on

- Macrostructure within the page-type family.
- Hero archetype (marketing only).
- App pages keep MUI component conventions (cards radius 12, buttons pill).

## Copy freeze (project rule)

User-visible landing text remains **byte-frozen** in
`apps/web/src/pages/landing/landingContent.ts`. The explicitly requested
19/09/2026 pricing preview is additive: its route copy lives in
`apps/web/src/pages/pricing/pricingContent.ts`, and its single `Pricing` header
link is shared by Landing and Pricing through `MarketingNav`. Existing landing
strings may not be added, removed or altered; future price changes require a
versioned pricing/product decision rather than an incidental redesign.
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
  Four exceptions, each commented at the call site: scrims and controls that
  sit over **arbitrary user media** (neutral black/white, never a palette
  tint), the **PDF iframe** backdrop (a PDF page is white), **FmbMapViewer**
  sketch strokes (SVG over imagery — literals, but Bloom values), and
  **VillageCanvas** plot/edge/selection colours (Leaflet paints onto a canvas
  over map imagery and cannot resolve a CSS var — literals, but Bloom values:
  the blue magnitude ramp, `--color-accent` selection, `--color-focus` hover,
  and Bloom paper/ink edges). The `ErrorBoundary` fallback is a fifth, separate
  case: it uses inline literals deliberately because it must render when the
  theme provider or stylesheet is itself the thing that failed.
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
- **A filter is one component, not a page treatment.** List pages use the
  shared Web360 `FacetFilter`: one `+ Filter` trigger, checkbox facet groups,
  counted options, removable active chips, `Clear all`, and an adjacent result
  tally. Pages supply domain groups and values; they do not introduce their own
  select bars, filter drawers, search-as-filter layouts, or dismissal behavior.

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
The Web360 surface (`apps/web/src/w360/w360.css`) does NOT consume `theme.ts`;
it redeclares the light and High Contrast schemes as its own `--w-*` custom
properties. Those values mirror the canonical tokens by hand, so a token change
here must be reflected in `w360.css` too — `scripts/parity-check.ts` classifies
the `w360/` tree as NOTE, not `adapt`, and does not enforce the mirror.
Cross-app values (chart series, status hues): `packages/tokens/src/index.ts` —
consumed by `apps/web`, NOT by mobile/iOS.
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
