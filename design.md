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
  (heavy line + one italic accent line, both in the one face), one filled
  primary CTA beside one text-button secondary, trust points as outlined assist
  chips under the CTAs, uppercase eyebrows over left-aligned section heads,
  hairline-ruled timetable rows, even programme-card grids (no wide/bento
  spans; dashed `--tba` variant for roadmap items), numerals only where order
  matters, the before/during/after stages as M3 primary tabs, FAQ as
  native `<details>` hairline rows, Ft5 statement close. Landing "Get started"
  CTAs open `/signup`; "Sign in" opens `/login`. Nav: **N10
  scroll-morph** (full-width hairline bar at rest → floating pill when
  scrolled; deliberate variation from the source's N5 — Pattadar's landing nav
  carries 9 section links + one route-level Pricing link + brand + CTA).
- **App pages** (signed-in, top-level: `/home`, `/properties`, …): functional shell, tokens-only restyle. No
  decoration ever — function carries the page. Light, Dark, and High Contrast
  remain complete, user-switchable schemes. **Domain structure is allowed**
  (founder decision, 27/09/2026): an app surface may take the grammar of the
  land record it shows — register rows with entry numbers, paper spines with
  their record code and year, dashed slots for what is not filed yet — when
  that grammar carries real data. It stays token-only colour, hairline rules
  and type: no illustration, scene, texture or ornament, and nothing drawn
  that the record does not say. First applied on Documents (`/papers`).
- **Content/legal pages** (`/privacy`, `/terms`, auth frames): Long Document
  voice — wordmark hairline bar, measure-limited column, statement-free
  bottom row.

## Theme (dark · canonical — packages/tokens/src/palette/bloom.ts)

Every scheme lives in the palette pack (§ Exports). The names below are the
marketing surface's: `apps/web/src/styles/site.css` declares them on `.site`
as aliases of MUI's `--mui-palette-*` variables, so they hold no values of
their own. Each value is the pack's sRGB hex, converted from the oklch shown,
which is how Bloom was first written; on a wide-gamut screen the coral, the
focus amber, the error red and the first bloom are slightly less saturated
than their oklch, since 03/10/2026. `--color-accent-2` documents Dark's
secondary; no marketing rule reads it, so it is not aliased.

- `--color-paper`   oklch(13% 0.018 35)   ≈ #0d0504
- `--color-paper-2` oklch(17% 0.020 35)   ≈ #170c09
- `--color-paper-3` oklch(22% 0.022 35)   ≈ #241714
- `--color-ink`     oklch(95% 0.010 70)   ≈ #f3ede7
- `--color-ink-2`   oklch(78% 0.015 60)   ≈ #bfb5ae
- `--color-ink-3`   oklch(61% 0.015 50)   ≈ #8b817b  (muted text: labels, eyebrows, units — 5.31:1 on paper, 5.05:1 on paper-2, 4.57:1 on paper-3; nudged from 58% on 03/10/2026, when it was 4.46:1 on cards, and from 58.5% on 04/10/2026, when it was 4.11:1 on paper-3)
- `--color-rule`    oklch(28% 0.018 40)   ≈ #312622
- `--color-rule-strong` oklch(40% 0.025 40) ≈ #54433e
- `--color-accent`  oklch(74% 0.180 55)   ≈ #fe860f  (amber · 8.29:1 on paper)
- `--color-accent-2` oklch(80% 0.110 35)  ≈ #fca48d  (coral · sparingly; lightened on 04/10/2026 from oklch(68% 0.220 18), which sat on the error red)
- `--color-accent-ink` oklch(15% 0.040 50) ≈ #180600 (text on amber · 8.11:1)
- `--color-focus`   oklch(82% 0.180 55)   ≈ #ffa03c
- `--color-error`   oklch(70% 0.220 25)   ≈ #ff5453
- `--color-success` oklch(74% 0.160 145)  ≈ #61c568

### Light scheme (app only — derived, warm-tinted; lives in packages/tokens/src/palette/bloom.ts)

- background.default `#f9f6f2` (oklch 97.5% 0.006 70) · background.paper `#fdfcf9`
- text.primary `#261d1a` (15.31:1) · text.secondary `#615956` (6.35:1) · text.muted `#736964` (oklch 52.9% 0.015 48 — 4.96:1, 5.20:1 on paper, 4.55:1 on raised) · divider `#e3ddd8`
- primary.main `#aa5910` (oklch 55% 0.13 55 — white contrastText 5.07:1)
- error `#be222a` (6.08:1 w/ white) · success `#27762f` (5.65:1 w/ white)
- secondary `#751e2d` (oklch 38% 0.12 15 — the coral deepened, 1.74:1 apart from error) · warning `#72480b` (oklch 44% 0.09 70 — bronze, 1.57:1 apart from primary)

### High Contrast scheme (app only — low-vision reading mode)

High Contrast is deliberately light-based: it is not a more saturated brand
skin. Reading surfaces are white, primary text is black (21:1), secondary text
is `#1f1f1f` (16.48:1), rules are solid black, and focus indicators grow from
2px to 3px. Filled actions use dark blue `#003b73` (11.21:1 on white) with
white text. Selected states retain shape, weight, border, or checkmark cues so
colour is never their only signal.

### Pattadar Gold scheme (app only — the signature light scheme; lives in packages/tokens/src/palette/pattadarGold.ts)

Ivory cards (`#fffefa`) on a cool grey-green page (`#eceeeb`), charcoal-green
ink (`#222923`, 12.77:1; muted `#536058`, 5.66:1), one bronze-gold action
colour (`#75510b`, 6.12:1, white text 7.15:1) and a gold selected wash
(`#f8edcf`, its ink `#5d4009` 8.17:1). The header is the one place it departs
from the page: charcoal (`#202521`) with ivory ink, a gold wordmark dot
(`#d9bf72`) and a 2px gold rule (`#d4b663`) under it — the scheme's `chrome`
roles, which W360's top bar and the previous app's AppBar both read. Warning
is rust (`#9a4d00`, oklch hue 55), held off the gold (77) so "needs attention"
never reads as "do this". Charts use Light's validated series. The anchors are
the Pattadar Gold sample of the 2026 appearance study, which `/theme-samples`
showed until this scheme replaced it on 03/10/2026; it is offered in the menu
and is no app's default.

### Semantic slots — define ALL SIX on ALL FOUR schemes

MUI does not disable an undefined palette slot; it substitutes its factory
default. `warning`, `info` and `secondary` were once undefined while being
used 22 times, so unrelated default blue and purple reached the amber system.
Ratios below are measured against that scheme's background.

| slot | dark | light | Pattadar Gold | High Contrast |
| --- | --- | --- | --- | --- |
| primary | `#fe860f` amber (8.29:1) | `#aa5910` (5.07:1) | `#75510b` bronze gold (6.12:1) | `#003b73` dark blue (11.21:1) |
| secondary | `#fca48d` coral (10.41:1) | `#751e2d` (9.84:1) | `#2e5e4e` deep green (6.37:1) | `#5a1a78` plum (11.33:1) |
| error | `#ff5453` | `#be222a` | `#b3261e` (5.60:1) | `#a40000` (8.14:1) |
| success | `#61c568` | `#27762f` | `#22693a` (5.71:1) | `#006b3c` (6.63:1) |
| warning | `#f5ae39` gold (10.57:1) | `#72480b` bronze (7.36:1) | `#9a4d00` rust (5.24:1) | `#6b4f00` (7.65:1) |
| info | `#82bad5` slate (9.55:1) | `#3d6a7f` (5.47:1) | `#2f6474` (5.63:1) | `#004f6b` (9.01:1) |

`warning` stays distinct from the primary action colour so "needs attention"
never reads as "do this". `info` remains the system's one cool semantic seam.

### Theme choice and persistence

One choice for the whole web app. W360's header and the previous app's shell
both offer the registry's menu — **Light**, **Dark**, **Pattadar Gold** and
**High Contrast**, in that order — through `useThemeChoice` (`apps/web/src/components/useThemeChoice.ts`),
so a scheme chosen in one is the scheme the other shows. The selected choice is
visibly marked, announced to assistive technology (`menuitemradio` with
`aria-checked`), and restored after a reload and in other tabs.

MUI keeps it: `pattadar-mode-v2` holds the mode, and
`pattadar-color-scheme-v1-light` / `-dark` the scheme each mode shows
(`THEME_STORAGE` in `packages/tokens`). The provider writes the active scheme
to `<html data-scheme>`, so every MUI surface wears it, the menus, drawers and
popovers portalled to `<body>` included.

`apps/web/public/theme-init.js` applies the saved choice before anything
renders. It is generated from the registry by `scripts/emit-theme-init.ts` and
loaded from `index.html` ahead of the bundle; it sets `data-scheme` and paints
that scheme's ground, so no frame flashes the wrong colour. The first time it
runs it carries the old `w360.scheme` key into MUI's keys (W360's choice wins
over anything the previous app had saved) and leaves the old key in place for
one release, so a rolled-back bundle still finds it. Defaults come from the
registry. `scripts/palette-tests.ts` fails when the committed script has
drifted from the pack.

`?scheme=<id>` on any address opens that scheme as if it had been chosen from
the menu: it is saved, so MUI agrees when it mounts, and then taken off the
address, so a reload or a later choice is never overruled by it. Only a
registered id is honoured; anything else is ignored and the address is left
alone. This is how a scheme is shown for review — `/home?scheme=pattadar`
replaced the retired `/theme-samples` page.

Marketing remains intentionally dark, independent of the signed-in app choice.

Pattadar University (`apps/university`) keeps its choice the same way, on its
own origin: the same four schemes, the same MUI keys, its own generated
`public/theme-init.js`, and its older `pattadar.university.theme` key (whose
`contrast` is High Contrast) carried over once. Its switcher keeps the words it
always had, "High contrast".

### Default scheme

**Dark** in `apps/web`, **Light** in `apps/university` (both from the
registry's `defaults`). The landing page remains permanently dark, while every
signed-in renderer provides all four choices.

## Typography

**One face, every surface** (founder decision, 27/09/2026 — § Design
authority). Every word `apps/web` and `apps/university` render is set in
**Atkinson Hyperlegible**: the wordmark, headings, body, eyebrows and labels,
figures and tables, map labels, form fields, code-like text (JSON, GeoJSON,
references) and the landing hero's accent. There are no exceptions and no
per-role faces.

- Face: **Atkinson Hyperlegible**, weights **400 and 700**, plus 400 italic.
  Chosen as the all-ages reading face because its deliberately differentiated
  letter and number forms improve recognition for low-vision readers without
  making the interface feel specialized or clinical.
- One token: `--font-sans` in `apps/web/src/styles/tokens.css`, repeated
  verbatim in `apps/university/tokens.css` and in `packages/tokens` as
  `FONT_SANS`, which `apps/web/src/theme.ts` imports. A root names it once
  (`.w360`, `.site`, the certificate page, University `body`) and everything
  else inherits. A component never names a font family.
- Roles differ by size, weight, case, tracking and colour — never by face.
  Headings are 700; eyebrows and overlines are small uppercase 400 with
  positive tracking; body is 400. The face is not tracked negatively.
- The face has no 500, 600 or 800. A browser silently draws 500 as 400 and
  600/800 as 700, so code writes the weight that renders: 400 or 700.
- Numerals line up through the face's own tabular figures,
  `font-variant-numeric: tabular-nums` (`.num`, `.mono`, `.tnum`, figure
  columns, counters, stat strips, map labels). A monospace face is never the
  way to align digits.
- The accent treatment — 400 italic in the accent colour — is ONLY for the
  hero's second line and the Ft5 statement's emphasis phrase. Never on headings
  wholesale (italic headers are banned; the italic accent phrase inside a roman
  display heading is the one sanctioned exception). The hero lead stays static
  while the illustration tells its story.
- Glyphs the face does not carry (₹, some arrows) come from the system fallback
  in the `--font-sans` stack, one glyph at a time.
- All fonts self-hosted via @fontsource (founder rule: nothing loads from
  third-party URLs). `@fontsource/atkinson-hyperlegible` is the only font
  package.
- Enforced by `scripts/typography-tests.ts` (source) and
  `tests/e2e-app/specs/26-one-font.spec.ts` (what the browser computes on every
  signed-in and public route).
- Not yet covered: native iOS (SF and New York), Expo (system and Menlo) and the
  jsPDF exports (Helvetica). Tracked in `docs/specs/TODO-one-platform.md`.
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
  - `HeroStory` is an editorial record trail, not a product preview. Four
    selectable chapters explain revenue entries, survey maps, registration
    documents, and the limited role Pattadar plays in organising family copies.
    Motion settles each record line and crossfades the narration. The landscape
    photograph eases into place once; autoplay ends on Pattadar and stops at
    once when someone selects a chapter. The image and record trail are marked
    illustrative, and the copy never implies Pattadar issues or corrects an
    official record. At phone widths the full trail yields to readable chapter
    text and controls rather than a miniature diagram.
  - `PlatformJourney` shows the actual shapes of the add-property drawer,
    property-scoped invitation form, and record Documents view. Each step
    replaces the previous view by a directional reveal. Both reveal masks read
    one Motion value, so a two-step jump still passes through the middle view
    and an interrupted transition resumes from its current position. The
    adjacent text remains the complete accessible explanation.
- The lifecycle tabs use a short Motion settle when the answer changes. The
  tabpanel and its text remain present throughout; reduced motion changes the
  answer immediately. Native nav, FAQ and content reveals do not need another
  animation engine or a decorative WebGPU layer.
- The journey is an illustrative product preview. It uses example names only,
  no account data, invented portfolio figures, or implied completed upload or
  share. The hero instead shows the land-record problem before the product.
- **Pattadar AI is deliberately NOT a Motion scene.** It used to be one: a panel
  of abstract placeholder bars, plus a separate chat card beneath it. The bars
  explained nothing and the two panels competed. The sample conversation is the
  picture now — real words, arriving beat by beat, with the record visibly opening
  when the last answer says it is opening. Because that panel holds real copy it
  must never wait on a lazily loaded chunk, so its beats are a CSS timeline
  (`AssistantConversation`): every message is in the DOM and visible by default,
  and the staging is added only once the panel is seen. A dead script leaves a
  complete, readable conversation.
- **Play once, then rest.** The hero story runs when its scene is ready; the journey and the
  conversation start when they scroll into view. All stop on the finished picture.
  Nothing on this page loops indefinitely, which is why no pause control is owed
  under WCAG 2.2.2. The hero and journey are re-tellable by choosing any step —
  by pointer or by keyboard — and choosing one ends that scene's autoplay, so it
  never moves on under someone mid-read.
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
- Product surfaces may reveal, drawers may slide, and a saved row may settle
  after filing. No decorative shimmer, border-spin, aurora drift, constant
  floating, unrelated tilt, or hover-triggered replay.
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
- Hover: −2px translate + border-strong on cards (site.css `.card:hover`, MuiCard); never scale, never glow.
- Focus: `--color-focus` ring, 2px normally and 3px in High Contrast,
  visible instantly (never animated).
- Hover tooltips delay 800ms; focus tooltips 0ms.

## CTA voice

- Primary: amber pill (`--color-accent` fill, `--color-accent-ink` text,
  radius-pill, weight 700, sentence case — the face has no 600).
- Secondary/ghost: hairline pill (`--color-rule-strong` border, ink text).
- The hero and final statement own the amber; nav CTA stays ghost. Accent
  footprint ≤ 5% per viewport.

## Design authority

The rules in this document are quality defaults, not a ceiling. Explicit founder direction may override aesthetic constraints when the result improves clarity, trust, emotional resonance, or product understanding. Accessibility, truthful content, privacy, licensing, responsive usability, and performance remain outcome requirements. When an aesthetic rule is overridden, document the decision here and keep the implementation coherent rather than accumulating exceptions.

- **One font, one component (founder decision, 27/09/2026).** "One font one
  platform; one component one platform." The four-face system — Inter Tight
  display, Atkinson Hyperlegible body, JetBrains Mono labels and numerals,
  Instrument Serif accent — is retired. Atkinson Hyperlegible is the only face
  in `apps/web` and `apps/university`, with no exceptions: the wordmark,
  eyebrows, figures, code-like text and the hero accent included (§ Typography).
  Every screen composes the shared components instead of building its own
  (§ App-surface rules, "One component per concern"). Native iOS, Expo and the
  PDF exports are outside this decision for now and are listed in
  `docs/specs/TODO-one-platform.md`.
- **Colours told apart by lightness (requested by Reddy, 04/10/2026).**
  Colours that must never be mistaken for each other differ in lightness, not
  hue alone. Bloom's coral was the error red's twin (1.04:1 Dark, 1.02:1
  Light): it is lightened to `#fca48d` in Dark and deepened to `#751e2d` in
  Light, keeping the coral family. Light's warning was 1.11:1 against the
  action amber: it is bronze `#72480b` now. Light chart slot 4 moved off the
  status green (§ Chart series). Muted ink (`ink3`) now clears 4.5:1 on raised
  as well as on paper, and Dark's danger fill carries dark text (6.24:1, was
  white at 3.16:1). `packages/tokens/src/palette/palette.test.ts` and
  `gate.ts` hold each of these.

## Per-page allowances

- Marketing pages remain typography-led. The landing hero uses an illustrative
  generated photograph of South Indian farmland, stored locally at
  `apps/web/public/brand/land-records-hero.jpg`, with legible editorial labels.
  It depicts no real identified parcel. The journey uses original, simplified
  views of Pattadar's own workflows, with example content only. No fake browser
  chrome or invented portfolio figures.
- There are exactly two scenes — `HeroStory` and `PlatformJourney`. The hero is
  HTML text over a bitmap photograph; the journey is authored as inline SVG so
  Motion can animate individual parts. The record trail's chapter narration is
  accessible text; its repeated visual labels are `aria-hidden`. Pattadar AI
  has no scene at all:
  its panel is the sample conversation itself, in real words, and the only
  decorative part of it is the typing pause and the opening record beneath the
  last answer. See § Motion for the play-once-then-rest, reduced-motion and
  failure rules.
- Provenance: the hero photograph was generated for Pattadar and is labelled
  illustrative; the journey artwork is original and modelled on Pattadar's own
  record and invitation surfaces. Neither loads a third-party asset at runtime
  or reproduces another product's visual identity.
- App pages: no decoration; domain structure only, as § Macrostructure family
  (app) defines it. Legal/auth pages: typography only.

## What pages MUST share

- The wordmark voice: "Pattadar" in Atkinson Hyperlegible 700 (landing keeps
  its literal `.` in amber).
- The amber accent and its placement discipline (≤5% per viewport).
- One face: Atkinson Hyperlegible for every word (§ Typography).
- The shared components (§ App-surface rules, "One component per concern").
- The CTA voice (pill shape, weight 700, sentence case).
- Hairline rule language (`--rule-hair` solid `--color-rule`).

## What pages MAY differ on

- Macrostructure within the page-type family.
- Hero archetype (marketing only).
- App pages keep MUI component conventions (cards radius 12, buttons pill).

## Copy freeze (project rule)

User-visible landing text remains centralised in
`apps/web/src/pages/landing/landingContent.ts`. The explicitly requested
19/09/2026 pricing preview is additive: its route copy lives in
`apps/web/src/pages/pricing/pricingContent.ts`, and its single `Pricing` header
link is shared by Landing and Pricing through `MarketingNav`. Existing landing
strings change only by an explicit product or founder request; future price
changes require a versioned pricing/product decision rather than an incidental
redesign.
No invented metrics, testimonials or logos — ever (also a founder rule).

**Revision, 28/09/2026:** the founder explicitly requested a realism review of
the landing content. `landingContent.ts` now uses narrower claims for AI reading,
saved copies, sharing, map boundaries and roadmap services. The hero lead is
static so it can be read while the illustration plays. Further copy changes
should still be deliberate product decisions, not incidental visual edits.

**Revision, 03/10/2026:** by founder request, a Pattadar Network section
(`NETWORK`, `#network`, nav entry `Network`) was added after Pattadar
University: eight offerings, every one badged `Coming soon`, and the sentence
that no listings or professionals are on Pattadar today. `Legal connect` and
`Trusted document writers` moved from Services into it with their wording
unchanged. Its register-interest form (`NETWORK_INTEREST`) carries DRAFT
consent wording that needs Reddy's approval before production
(`docs/specs/TODO-pattadar-network.md`, D4). The form's submit is the ghost
CTA voice. `scripts/network-interest-tests.ts` guards the claims and the
consent text/version parity with the API.
**Revision, follow-up 2:** by Reddy's decision the card list is sell, buy,
rent or lease, lawyers and legal connect (one card, not two), licensed
surveyors, document writers, land developers and property valuers; the guard
pins the list and the form's interest choices against `network.INTERESTS`.

The landing page's scripted assistant exchange remains a sample; its
`· sample conversation` label is what makes invented survey
numbers on a public page honest, and `scripts/provenance-tests.ts` fails the
build if the label comes off.

**Exception, 27/09/2026:** the illustrative "Land portfolio · sample" card
(`PRODUCT_FRAME`: an invented ₹ acquisition total, counts and four parcel
rows) was removed from `landingContent.ts` and the page by explicit request.
It is not to be restored incidentally; `scripts/provenance-tests.ts` fails if
an invented rupee total returns to the landing copy without a sample label.

## App vocabulary (founder decision, 26/09/2026)

The signed-in W360 app uses one noun per concept, and a page's
title always matches its rail label. Decided by the founder as "Option C":
short, stable rail nouns; noun-phrase section headings; factual
dot-separated subheaders ("Village recorded · Boundary saved · Pin not set");
verb + object actions. `/legacy/*` keeps its own older copy until retired.

| Concept | Say | Not |
|---|---|---|
| Everything the owner holds | **Properties** (a parcel, plot, flat or house when known). **Holdings** must never be used for the Properties list | holdings, records, land, portfolio items |
| Stored papers | **Documents** (item: document; bytes: file), on web **and iOS** — the iOS tab is "Documents" (decided 06/10/2026, D5) | Papers, paper, Vault, My files, My Drive |
| Several properties that make one piece of ground | **Holding** (list: **Holdings**) — official records stay separate. Its members are **properties**, like everywhere else (D1, 06/10/2026). Inside one, use the singular ("This holding"). Never write "your holdings" to mean all of an owner's land. Web: one constant, `HOLDING_WORD` in `apps/web/src/w360/ui.tsx`. Holdings is a top-level page, so it has **no eyebrow** (V2; founder, 09/10/2026 — the former eyebrow "Several properties, one piece of ground" is retired); what a holding is lives behind its ⓘ | combined view, combined property, view, estate, portfolio, records (for its members), "held" (a holding is never held) |
| WHO holds land vs WHICH land is one farm | A **family or group** holds land: **"holds"** and **"Held by"** belong to groups only; land held personally is **"In your own name"**. A **holding** is **"part of {name}"** and **"one piece of ground"**. Properties filters: **Holder** and **Holding**; selection actions: **Set holder** and **Combine into a holding**. Group tile: "{n} properties · {x} ac →". Group disclaimer: "Your own record of who shares this land. It does not change the khata." Mixed holders in Combine: "These properties have {n} holders. That is fine for one farm; who holds each one does not change." (holdings-vs-groups memo §4.6, approved 06/10/2026, with "properties" for "records") | a holding that "holds", a group "held as one", "holding" for a group's land |
| Group types | Family · HUF (Hindu Undivided Family) · Company or LLP · Partnership · Trust or society. The **Portfolio / Wallet** type is removed (06/10/2026): keeping properties together is what a holding does | Portfolio, Wallet (as a group type) |
| Village / cadastral maps | **Cadastral maps** | Village maps, Maps |
| One property's pin and boundary | **Location & boundary** — "Boundary saved", never "surveyed" | Where this land is |
| Things physically on the land | **Site features** | Features, assets |
| Owner's paid work | **Service order** (the desk's operational unit stays a **job**) | ticket, request, job (on owner screens) |
| Owner-facing trail | **Activity** (Audit log is reserved for a compliance surface) | Audit Log, History, Timeline |
| Pattadar's people | **Provider** on owner screens ("Pattadar provider"); **member** means a member of a family or group only; **Company members** only on the admin rail (D3, 06/10/2026) | member (for Pattadar's people), associate, worker, somebody, someone, whoever |
| AI cost (tokens, $, model, credit balance, per-reply cost, ScanFirst reading cost) | **Admin-only**, behind the existing `admin.uids` gate (`isPlatformAdmin` / `useIsPlatformAdmin` / `<AdminOnly>` in `apps/web/src/w360/adminOnly.tsx`). Owners see none of it; any future owner-facing cost is in ₹, in Pattadar's own pricing words (D2, 06/10/2026) | Anthropic, API credits, tokens, US dollars on an owner screen |
| A family's inactivity safeguard (Families & groups) | Tab **Safeguard**, heading **Inactivity safeguard**; tab status drawn as a glyph only (! or ✓); its word **needs action** or **set** is the glyph's tooltip and part of the tab's accessible name ("Safeguard, needs action"), never visible text | a safeguard box above every tab, a colour-only status, the status word printed in the tab |
Holding approved by Reddy on 03/10/2026, superseding the 26/09/2026 "Combined view" entry (research: `.agents/tasks/pattadar-platform-combined-views-standardize-2026-10-27/naming-research.md`). Web files, identifiers and routes say holding (`/holdings`; the old `/app/combined…` redirect was removed on 07/10/2026 under naming rule V5 — no redirects); GraphQL fields, operations, query keys and the `combined_*` tables keep `combined` (server contract). `scripts/vocab-tests.ts` (VOC-1..7, and VOC-R0..X1 for the naming standard) holds the web to it, and holds iOS (which has no Holdings feature) to "property" for one property.
Safeguard tab approved by Reddy on 03/10/2026 (audit `.local/ux-audits/2026-10-03-families-inactivity-safeguard/board.html`).
Its notifier editor ("Inactivity notifications", from **Configure notifiers**) opens in the shared right-side Drawer with Save first; the contact gap is one warn StatusChip with one sentence, from the server's `inactiveContactGaps`, on the tab and in the editor (`contactGapSentence`). Approved by Reddy on 03/10/2026 (audit `.local/ux-audits/2026-10-03-inactivity-notifications-dialog/board.html`).

Rail groups: **Your portfolio · Shared** (ends with Invite & earn) **· Money · Account** (Profile, Privacy &
your data, Activity), then **Operations** (platform admin: Pattadar desk) and
**Administration** (super-admin), and **Help & resources** (Tools, Pattadar
University — external, new tab — and Help & support) pinned to the foot of the
rail under a hairline. Money
copy never says "paid" or "charged" while the provider is a stub — the wallet
uses Held, Released, Refunded (`services/api/tests/test_ticketing.py` guards
this). One flow appears on a screen once: no empty-state button that repeats
the section-head action.

Explanatory lines follow the same rule as subheaders: one short, factual
sentence or a dot-separated status line, never a paragraph. "You pay only
after you accept the work", not "Nothing is taken when you order. Money is
owed only once you accept the work." Owners count **properties**, including
inside a holding (D1, 06/10/2026); "record" is never a noun for a property.

### Property tabs (founder decision, 28/09/2026)

Taken from the ten heuristic audits of the property page
(then `/app/records/:id/*`, now `/properties/:id/*`), as recommended. Evidence:
`.local/ux-audits/2026-09-27-w360-record-*/board.html`.

- **Overview is the first tab** (Reddy, 11/10/2026: a basic-info tab first):
  the property's master record — how it is held, from whom, under which
  document, each value's source, disagreements and what is missing
  (`docs/specs/2026-10-11-property-overview.md`). Documents is the second tab.
- **Headings name the tab:** Overview, Documents, Site features, People (sides
  **Owners** · **Caretakers & staff**), Location & boundary, Media, Notes,
  Service orders, Money, Activity — the tab's own noun, or for Location and
  Services the noun the table above gives them. Money's ledger, **Expenses**,
  opens inside the property frame with Money still the current tab.
- **One word per kind:** photo, video, **recording** (not audio). Site feature
  conditions are **Working · Watch it · Broken · Not checked**; "check" means
  only somebody looking at a feature on the ground, and the paid visit is a
  **site visit**. A requested document's action is **Cancel request**; ordering
  several documents places **service orders**.
- **Missing reads as missing, in the same words:** "not set" for a value the
  record does not hold, "Not checked" for a check that has not run, "—" for an
  unknown figure. "N/A" only where a check cannot apply.
- **"Paid"** is allowed for the owner's own purchase and expenses (money that
  moved outside Pattadar). It never describes money through Pattadar while the
  payments provider is a stub (the People rail says "Your Pattadar wallet").
- **Tell a fact once** on a tab: counts in the sub line or the rail, not both;
  the extent in Measurements; the duty in Other costs.
- **A section's band** (Reddy, 13/10/2026, from
  `.local/ux-audits/2026-10-13-tab-action-bars/board.html`): a tab that
  filters a collection draws one band directly under its `SectionHead`, with
  the shared parts only — `FacetFilter` (kinds, shelves, categories, scope as
  filter groups) or `ToolbarBand`, with `BandSearch`, `SortCycle` and
  `ViewToggle`. The head holds commands (`HeadActions`, outlined secondaries,
  the one filled add, the ⋮ last); the band holds + Filter and its chips on
  the left, then tally, search, sort and view on the right. The tally is
  always passed and says "N of M shown"; the head's line keeps the tab's
  totals ("5 documents"), never "showing N". 24px from head to band and from
  band to content. On a phone the band is one row with search as an icon.
  No band over nothing: a tab with no items draws neither filter nor search.
  A selection uses the shared floating `SelectionBar` ("N things selected",
  its actions, Clear) — Media's Download as .zip and Delete selected included.
- **Fill means act:** pressed filters and view toggles take the wash state;
  the property header's "Share securely" is outlined, so each tab's own add is
  its one filled button.
- **Removing or replacing** something saved asks in the shared confirmation
  (`ConfirmDialog`), naming it and saying what happens; the dialog holds until
  the server answers.
- **Motion:** the Location outline draws on once, on the first visit; the
  per-visit stars and glow are gone.
- **Notes** are written and edited in place, newest first (13/10/2026): "Add
  a note" opens a blank note card at the top of the list and a note's Edit
  turns its own card into the editor. The body is rich text (Markdown subset,
  `RichText.tsx`), its box grows with its text, and adding, editing or
  deleting a note is recorded in Activity.
  **Activity** names who acted in words ("You", "Pattadar desk"), never an
  identity key.
- **Kept on purpose:** the share panel's "Valid for 30 days · Anyone with the
  link can download…" line stays visible rather than behind an ⓘ, because it
  is the consent notice for a public link.

### Addresses and ids (founder decision, 11/10/2026)

There is no "record": a property is a Pattadar property. Reddy, 11/10/2026:

- **No `/app` prefix.** Signed-in pages sit at the top level of the host,
  named for the feature: `/home`, `/properties`, `/properties/<id>`, `/papers`,
  `/services`, `/order`, `/admin/…` (`apps/web/src/routes.tsx`, the pathless
  `app` layout route). Public pages keep their own (`/`, `/login`, `/share/…`).
- **Property tabs are named for the tab:** `/properties/<id>` (Overview, the
  index; Reddy, 11/10/2026, amending the Documents index of the same day),
  `/documents`, `/site-features`, `/people`, `/location`, `/media`, `/notes`, `/services`,
  `/money` (and `/expenses`), `/activity`, plus `/request`.
- **No redirects or aliases** for the old `/app/…` addresses or old tab names
  (V5); `/legacy/*` stays until retired.
- **Property ids are UUIDv7** (RFC 9562) strings; existing ids are rewritten
  by script, seed-fixture ids (`w360-`, `demo-`, `sf-`) excepted, and the
  append-only audit trail is read through an old-to-new alias table rather
  than rewritten.
- **The browser tab names the land:** LP and extent (§ Page head, Browser tab).
- In-app return paths are checked against the known top-level sections, never
  a bare leading `/`.

## Naming standard (founder decision, 06/10/2026)

The house rules for every word an owner reads, on the signed-in web app, iOS and in the
strings the server sends to either. Approved by Reddy on 06/10/2026 from the
naming review (sections 2–4 and 6), with these exceptions: route renames are
not part of the standard's first pass, and decisions D6–D17 of that review are
not adopted except where the App vocabulary table above says so (Documents on
iOS, Provider, AI cost admin-only, Portfolio / Wallet removed). The App
vocabulary table is the noun list; this section is the grammar around it.
`scripts/vocab-tests.ts` (VOC-R0..X1) enforces it; an exception is an entry in
that script's allow-list with its reason, never a silent skip.

### Voice and casing
| # | Rule | Right / wrong |
|---|---|---|
| N1 | Use sentence case for every label, heading, button, chip and menu item. Capitalise only proper nouns, product names and acronyms. | "High contrast" / "High Contrast"; "Encumbrance certificate" / "Encumbrance Certificate" |
| N2 | Address the owner as **you/your**. Use "my" only in consent sentences the owner signs ("I agree…"). | "Your address", "Your stake" / "My address", "My stake" |
| N3 | Write negatives in full in system, error and empty copy. Friendly one-offs can keep a contraction ("You're all caught up"). | "could not", "is not" / "couldn't", "isn't" |
| N4 | Don't write "please" in errors or system messages. | "Try again." |
| N5 | Use Indian/British spelling. | organise, authorised, catalogue, enrolment, synchronisation |
| N6 | Use device-neutral verbs. | "Choose", "select" / "click", "tap" |
| N7 | Use no idioms or British-only usage. | "Rented out", "Rental agent" / "Let to a tenant", "Letting agent", "shoots it" |
| N8 | Use "&" only in fixed names (rail labels). Use "and" in sentences and actions. | "Edit name and properties" / "Edit name & records" |
| N9 | Titles, headings and empty-state titles take no full stop. Confirm titles end in "?". | "Nothing is stuck" |

### Actions
| # | Rule |
|---|---|
| A1 | An action is a verb plus an object. Openers use "a": **Add a property**, **Add a document**, **Add a member**. Confirm buttons use "the": **Add the property**. Plurals are only for genuine multi-item actions (**Add documents**). |
| A2 | One verb per act: **Add** creates an item; **New** is only for containers you then fill (New holding, New folder, New family or group); don't use **Create** in owner copy; **Record** is not a verb ("Add an expense", "Add rent", "Add a purchase"). The desk's "Record submitted work" stays. |
| A3 | **Delete** means the object stops existing. **Remove** means taking an item out of a container while it still exists (from a group or holding, a provider, a link, a filter). |
| A4 | The safe button in a destructive or irreversible confirmation is **Cancel**; the destructive button is named by its outcome ("Delete holding"). Exceptions: **Keep editing** in the discard guard, and **Keep order** / **Cancel order**, so "Cancel" never appears on both buttons. |
| A5 | "…" means only that work is in progress ("Saving…"). A label that opens a dialog gets no "…". A busy label names the action ("Cancelling…", not "Working…"). |
| A6 | A toggle uses opposite words: Show/Hide, Expand/Collapse. |
| A7 | Back links and breadcrumbs repeat the destination's exact title. Every crumb is a separate page. A rail group is never a crumb. |

### One concept, one name
Banned on owner screens (signed-in web, iOS, and server strings owners see).
Identifiers, routes and GraphQL names are exempt. Where this table and the App
vocabulary table differ, the App vocabulary table wins (it carries the
founder's amendments).

| Concept | Canonical | Item / unit | Never |
|---|---|---|---|
| Everything owned | **Properties** | property; parcel, plot, flat, house or shop when known | records, land records, land (as a count noun), Land parcel |
| Several properties that make one piece of ground | **Holding** | its members are **properties** | combined view, combined property, view, estate, portfolio, ungrouped |
| Stored papers | **Documents** | document; the bytes are a **file** | Papers, paper, vault, My files, My Drive |
| Owner's paid work | **Service order** ("order") | — | request, job, ticket (the desk and the provider's dispatch keep "job") |
| Pattadar's people | **Provider** | — | worker, somebody, someone, whoever |
| Payment gateway | **the payment company** | — | provider, capture, settlement |
| Money spent on land | **Expenses** | kinds **Improvement · Upkeep · Money in** | Costs, Spend, capital, running, One-off |
| Wallet movement | **Added · Held · Released · Refunded**; **Pattadar fee** | — | Settled, escrow, Service fee, Worker payment. No "paid" or "charged" while payments are a stub; the denial "Not charged" stays |
| Government rate | **Government value** (gloss: "also called market or guideline value") | — | bare "Market value", "Registration value rates" |
| Owner's own figure | **Market estimate** | — | Worth, Worth today, Estimated value, valued |
| Stake | **Your stake: Owned · Managed · Watching** | — | Mine, I manage it, Watch, My stake, "held in your own name" |
| Owner's trail | **Activity** | — | Audit log, Activity log, History, trail, share log |
| Things on the land | **Site features** | **Working · Watch it · Broken · Not checked** | On the land, Working well, Needs attention, Not working |
| Media | **Media** | **photo · video · recording** | photograph, clip, audio |
| Village survey sheets | **Cadastral maps** | each shape is a **parcel** | Village map, plot (for a survey shape), Plot size |
| Survey number | **Survey number** (inline "Sy {n}") | — | Sy., survey no, a bare number |
| Group members | **Members** | — | "person" inside Groups |
| Heir flag | **heir**; kinds **Co-owner · Legal heir · Nominee**; column **Listed as** | — | beneficiary (except in a trust), co-heir, co-ownership, Held as, Legal Heir |
| Heir verification | **verification link** | — | invite, invitation (these mean co-manage access only) |
| Access ending | **Revoked / Expired** | — | withdrawn, lapsed |
| Families | **Families & groups** | — | household, Family as a page title |
| Deed amount | **Amount in the deed**; on iOS, purchase price is **Price paid** | — | Consideration |
| Assistant | **Pattadar Assistant**; the topbar icon reads "Assistant"; a thread is a **conversation** | — | New chat, Pattadar assistant |
| Privacy and account scope | **your data** | — | your records |

Not adopted yet (decisions still open): the Khata number label (D7), area in
the record's own unit on Groups (D8), the Cadastral maps gloss (D10) and the
iOS tab moves (D12–D15). Until Reddy decides them, nothing enforces them.

### Numbers, units, dates
| # | Rule |
|---|---|
| U1 | After a number, write units in lower case: **ac, sq.yd, sq.ft, sq.m, cents, guntas** ("1,450 sq.ft built"). Picker labels may be spelled out. Stored unit codes don't change. |
| U3 | Field labels are spelled out (Survey number, Deed number). Only inline values are abbreviated (Sy 214/2). |
| U4 | Absolute dates are **DD/MM/YYYY** on every surface. Relative times are spelled out ("3 hours ago", not "3h"). |
| U5 | Counts agree with their noun. Don't put "×N" in a button or leave an abbreviation unexplained ("pp" becomes "pages"). |
| U6 | Owners see money only in ₹, never in US dollars. |

### Navigation
| # | Rule |
|---|---|
| V1 | Page title = rail label = browser tab "{title} · Pattadar". The only exception is Home, whose title is a greeting; its tab still reads "Home · Pattadar". |
| V2 | Top-level pages (every page a rail label opens, Home included) have no eyebrow — not their own name, not their rail group ("Account", "Operations", "Administration"). A nested screen with no crumbs may carry an eyebrow that names its parent; a screen with crumbs never also has an eyebrow (one wayfinding device). Re-affirmed by the founder on 09/10/2026; § Page head enforces it. |
| V3 | Headings repeat the tab name. A property's Services tab is headed "Service orders". |
| V4 | An entry label (link, More row, menu item) is the destination's title. This applies on iOS too. |
| V5 | Nothing is deployed: when a noun is renamed, rename its route outright. No redirects, aliases or back-compat for old routes, links or params. |

### Errors, empty and status
| # | Rule |
|---|---|
| E1 | An error says what happened and what to do: "{Thing} could not be {done}. {Next step}." |
| E2 | Owners never see vendors, keys, consoles, region codes, hostnames, HTTP bodies, enums, or GIS and EXIF terms. These go to logs and admin views. A boundary file is "a map file", with "(KML or GeoJSON)" only as a parenthetical. |
| E3 | A server refusal shown in the UI is an owner sentence: "You do not have access to this property", not "Not authorized for this property". |
| E4 | Every enum shown to owners goes through a word table (STATUS_WORD, SHELF_WORD, the condition STATES, ENTRY_LABEL), and every surface's copy of a table holds the same words. The humanised fallback is only a safety net. |
| E5 | Copy never claims a legal status the app can't know. Don't write "Can't be sold", and don't call a nominee a co-owner. |

### Telugu readiness
| # | Rule |
|---|---|
| T1 | One English word per concept gives one Telugu source word. |
| T2 | Keep the real land terms (khata, pahani, adangal, 1-B, FMB, EC, kist, mutation). Gloss unfamiliar ones on first use: "Mutation (name transfer)", "HUF (Hindu Undivided Family)", "Karta (head of the family)". |
| T3 | Write whole sentences with placeholders. Don't stitch fragments together or build plurals as "{noun}s". |
| T4 | Don't use idioms, contractions, or metaphors like "filed against". |

### Guardrails (`scripts/vocab-tests.ts`)
VOC-R1/R2 record(s) and land records · VOC-D1 papers, vault, My files ·
VOC-H1 combined view/property, estate, ungrouped · VOC-S1 job, service request
· VOC-S2 somebody, someone, whoever, worker payment · VOC-M1 bare Market value
or Worth · VOC-M2 escrow, Settled, Service fee, capture · VOC-K1 Mine, I manage
it, My stake, a bare Watch · VOC-A1 Audit log, Activity log, History · VOC-E1
Spend, Record a cost/purchase/rent · VOC-P1 plot for a survey shape · VOC-V1
vendor and engineering jargon · VOC-G1..G7 contractions, please, click/tap,
"…" on openers, Keep-it cancel buttons, Title Case, American spelling · VOC-U1
units, Sy., ×N, pp · VOC-N1 page title = rail label and the browser tab ·
VOC-N2 iOS entry label = destination title · VOC-X1 the word tables agree
across ui.tsx, web360.py, ticketing.py, Shelf.tsx, iOS and packages/core.
Scope: `apps/web/src/w360`, `apps/web/src/assistant`, the live routes
PaymentsCheckout, AccountDataPage, InvitePage and PersonDialog; Swift in
`apps/ios/Pattadar*` and `apps/ios/Shared` (outside `#if DEBUG`);
`services/api/src/{web360,main,growth,ticketing,governance,inbox}.py` and
`services/assistant/src/domain`. The desk and admin screens are exempt from the
owner-noun rules but not from grammar. Every rename updates its e2e locators
and fixtures in the same change; consent wording changes only with a notice
version bump.

## Page head (founder decision, 09/10/2026)

Every signed-in page opens with the same head, drawn by one component,
`PageHead` in `apps/web/src/w360/ui.tsx`. No page builds its own. Approved by
Reddy as "all recommended" on 09/10/2026 from the content-header audit
(`.local/ux-audits/2026-10-09-content-header/findings.md` §5). It is the
dominant admin-app header (Polaris, Atlassian, Carbon, Ant, Primer, SLDS) in
Bloom; it adds no copy and no features. `scripts/shared-components-tests.ts`
(SC-H*; SC-H10 reads `routes.tsx`, so a screen with no head at all fails, not
only a hand-built one) and `scripts/vocab-tests.ts` (VOC-N1, VOC-1) enforce
it, and `tests/e2e-app/specs/31-page-head.spec.ts` sweeps what the browser
draws.

**Locked (Reddy, 09/10/2026).** The head is not redesigned per feature. A new
signed-in screen or rail entry adopts it as it lands — title, ⓘ, `HeadActions`,
summary, band, tabs — and gets no variant of its own. Changing a slot, its
order or its rule is Reddy's decision, recorded in this section first and in
the guards second. CI runs `scripts/shared-components-tests.ts` on every push,
so a new route without `PageHead` (SC-H10), or a top-level rail page
without a `summary` (SC-H11; Help & support is its one named exception),
fails the build; the `web-feature-delivery` skill and invariant 9
of the project standards (`.kiro/steering/pattadar-standards.md`) tell agents
the same before they write markup.

### One frame
- `.w360 main` is padded 24 / 40 / 96px (16px under 900px) on every route,
  Privacy & your data and Checkout included.
- One 80rem measure (`--max-width`), centred, shared by head, band and
  content, so all three share one left edge (x 280 at 1512, 16 at 390).
  Page-local caps are only for a form's own field measure, never for cards.
- The viewer may lift the cap (Reddy, 10/10/2026): the theme menu's
  Centred page / Full-width page pair sets `data-width` on `.w360`, per
  device (`w360.width`). Centred stays the default; full width drops the
  80rem cap, never the padding or the shared left edge.
- Two h1 positions, by page type: top-level (no crumbs) and detail (crumbs
  above). The title row is a button's height whether or not it has actions,
  so the h1 never moves with them.
- h1 is 28/700 at 1512 and 22/700 at 390 everywhere.

### Slots, top to bottom
| # | Slot | `PageHead` prop | Rule |
|---|---|---|---|
| 0 | Wayfinding | `crumbs` | Detail pages only. Ends at the current page (not a link, `aria-current`). Never with an eyebrow, never a rail group as a crumb. Under 600px only the parent shows: "‹ Properties". |
| 1 | Eyebrow | `eyebrow` | None on a top-level page (V2). A nested page with no crumbs may name its parent. A record's kind ("Agricultural land", "Holding") is not an eyebrow: it goes in `meta`, under the title. |
| 2 | Title row | `glyph`, `title`, `info`, `switcher`, `pill`, `actions` | Left: glyph, h1, ⓘ, switcher, status or extent pill. Right: the actions, centred on the h1 line. |
| 3 | Summary | `summary` | One `.note` line (13px ink-3) 6px under the h1, on **every top-level page a rail label opens**, as on Properties (Reddy, 09/10/2026: "the same UX design for all the side menu items"). Figures, never guidance or a tagline: "{N} {things} · {totals}" from what the page already reads — Properties "1 property · 5.00 ac", Families & groups "1 family · 1 property · 5.00 ac", Wallet "₹0 available · ₹1,180 held for 1 order". The band's tally counts what the filter lets through; the summary carries the account's totals, so a tally is never a reason to leave the summary out, and a filtered-empty page keeps it. A zero figure is dropped (a money balance excepted). A placeholder line (`Sk`, 18rem) while the first read is pending; no line on a failed read or a first-run empty page. A page that reads nothing it could count (Help & support) is a named exception in the guard, never a silent omission. |
| 3′ | Meta | `meta` | Detail pages: the facts row (kind · place · holder) in one treatment, 6px under the h1. |
| 4 | Place line | `PlaceLine` | Only where there is a place hierarchy: always on Cadastral maps; on Documents inside a folder or while filtering. The first row of the band, 13px, the current place bold. |
| 5 | Toolbar band | `FacetFilter` / `ToolbarBand` | Collection pages only. One row between hairlines, 24px under the head and 24px above the content. Left: + Filter and the active chips. Right, in order: tally, the page's own search (`BandSearch`), sort (`SortCycle`), view toggle (`ViewToggle`). It does not wrap at 1512. View toggles and search never sit in the head. A tab's band sits the same way under its `SectionHead` (§ Property tabs). |
| 6 | Tabs | `tabs` | Detail pages (and Tools, a top-level page that keeps its tabs): the last row of the head, 24px below it, so the content starts 24px under the strip. |

Vertical rhythm (1512, 390 in brackets): frame top → first row 24px (16);
crumbs → h1 8px; nested eyebrow → h1 4px; h1 → summary or meta 6px; head →
place line, band, tabs or content 24px; band → content 24px.

### Actions
`actions` takes `{ primary, secondaries, overflow }` (`HeadActions`), each
command as data (`HeadAction`: label, icon, `onClick` or `to`, and a `tip`
when a hover tooltip says more than the label), so the head draws it and
moves it — never hand-placed buttons. `overflowLabel` names the ⋮ and
`overflowHeader` names what its items act on. `PageHead` takes no children:
everything under the title is `summary`, `meta` or `tabs`.
- At most **one filled** head button, the `primary`. Export, Print, Share
  and Edit are outlined `secondaries` or in the ⋮.
- Left to right: secondaries by importance, then the filled primary, then
  the ⋮ (`overflow`) last (Reddy, 13/10/2026: "more actions should be in
  the end"). `PageHead` draws the first two secondaries; any more go into
  the ⋮. A tab's `SectionHead` draws the same row from the same data, and
  holds commands only: no search, year, view, scope or segmented choice
  (Reddy, 13/10/2026; SC-H6 scans section heads too). Those go in the tab's
  band. A command that is not the tab's add stays in the ⋮, even when it is
  the ⋮'s only item; the ⋮ is named "More actions for {heading}".
- A detail page has no filled primary: its own add lives in its tab's
  section head (as Documents does on a property). Secondaries, then ⋮. The
  type says so: a head with `crumbs` takes `DetailActions`, which has no
  `primary`.
- A command that cannot act is not drawn. A filled button that is always
  disabled is a dead control (Wallet offers no "Add money" until payments
  are live).
- A command that appears on several pages has one label and one position:
  **Export** (never "Download CSV"); "Add a property", never a bare "Add"
  (A1).
- **Home** (option A): the shortcuts sit on the title row, right-aligned —
  "Add a document" and "Order a service" outlined, **"Add a property"**
  filled, then the ⋮ holding "Share a property", last. The greeting stays the
  h1; `docTitle="Home"` names the tab "Home · Pattadar" (V1).
- **Cadastral maps**: "Add a cadastral map" is its one filled primary, at the
  standard button height; Print is outlined.

### Every state has the head
The loading, failed and not-found states of a page draw the same `PageHead`
as the page itself: crumbs back and a title that names the state ("There is
no shelf by that name", "This order is not in your account"), or the page's
own title while it loads. So the tab is named and there is a heading to land
on before the data arrives, and when it never does. A signed-in address that
matches nothing is a page too (`w360/pages/NotFound.tsx`), on the same head.

### ⓘ (`info`)
- An ⓘ appears only where a page has standing guidance, and always right
  after the h1. Guidance is never printed as a permanent sentence (`.lede`)
  under a title.
- An ⓘ holds guidance, never a data fact. A fact goes in the summary line or
  the page footer — Documents' residency note ("{region} · Private unless
  shared") is in its summary line, not its ⓘ.
- How many pages have an ⓘ may vary; where it sits may not.

### Empty states
- **First-run empty** (the owner has none yet): the title (and ⓘ) at the
  populated y, and nothing else in the head — no eyebrow, no summary, no
  actions, no band, no view toggle. The empty card carries the one filled
  add.
- **Filtered empty** (a filter or search matched nothing): the head and band
  stay exactly as when populated, filled primary included. The card offers
  the way out ("Show all", "Clear all"), never a second add.

### Phone (under 600px)
- The title never truncates and the summary wraps between facts, never
  inside one; nothing scrolls sideways. Two-pane pages stack.
- The head keeps one row of actions: the filled primary always visible, the
  secondaries and overflow in the ⋮ (`PageHead` does this itself). A command
  moved into the ⋮ hands focus back to the ⋮ when the panel it opened closes.
- The band keeps + Filter left and its tools right, on one row: the tools
  take the rest of the + Filter row and the sort chip's words shorten before
  the row wraps. Search becomes an icon that opens a full-width field; the
  view toggle goes icon-only, each icon keeping its word as its name.
- Crumbs show only the parent.
- A detail page's meta facts stack one per line, without separator dots.
- The first list item shows in the top half of an 844px viewport.

### Browser tab
`PageHead` names the tab "{title} · Pattadar" (V1). A page whose `title` is
not plain text (Home's greeting, a property's name with markup) passes
`docTitle`. A property page's tab reads "LP {survey no} · {extent} {unit} ·
Pattadar" (Reddy, 11/10/2026; `RecordHead.tsx`): the extent as the extent chip
formats it, in acres (acre for exactly 1), sq yds or sq ft; the property's
title stands in when it has no survey no, and the extent part is left out
when there is none.

### Named exceptions
- The full-bleed **Document reader** keeps its own bar (`main.flush` with
  `.rd-bar`, h1 at 16px): a viewer is an M3 small top app bar, not a page.
- Full-screen flows such as **Checkout** keep their own bar.
- Both still name the tab, with `useDocumentTitle`.
Everything else uses the shared frame and `PageHead`.

### Shared with me
One route. Its h1 is "Shared with me" (the rail label); the selected share's
name is an h2 under it.

## Tables (founder decision, 10/10/2026)

Every rows-and-columns view in the signed-in app follows one standard, drawn from the
shared parts in `apps/web/src/w360/ui.tsx` § Tables (`usePaged`, `TablePager`,
`Th`, `sortBy`, `SelectAllBox`, `SelectCell`, `useRowSelection`,
`SelectionBar`) with `PropertyTable.tsx` as the reference. The founder raised
each rule below after a pass that skipped it; none of them is optional by size.

- **Every data table can be ticked.** A tick box on each row, `SelectAllBox` in
  the header ("Select all N things", partial state shown), selection over every
  row the filter lets through (not the page), dropped when the filter changes,
  kept across sort, paging and view switch. Ticking is how the reader gets a
  spreadsheet's status-bar sum, so it does not wait for a bulk action.
- **Every table with ticks or summable columns has a total row,** whatever its
  size: a `<tfoot>` whose label is `<th scope="row">` "Total · N things", or
  "N things selected" while rows are ticked, with each summable column summed
  underneath (rupees; extent per unit as entered, never converted; counts).
  Rates, dates and statuses get an empty cell.
- **The selection bar** (`SelectionBar`) appears only while rows are ticked:
  the count, **Export** of the ticked rows in the screen's own CSV format, the
  bulk actions the screen already has, and Clear. A new bulk action that
  changes data or money is Reddy's decision.
- **Pager** (`TablePager`) under every data table: 20 rows by default, 5 / 10 /
  20 / 50, remembered per table, hidden at 5 rows or fewer, back to page 1 on
  sort or filter. Choosing tables in a flow (order step 1) are not paged.
- **Figures** are right-aligned with `.num` in the heading, the cells and the
  total; headings sort through `Th` where reordering helps.
- **Grid · Table on every collection page.** A top-level page that lists things
  (properties, families and groups, documents, holdings, service orders,
  invitations, members) offers `ViewToggle` Grid · Table (· Map where there is
  geometry) in the band. The grid's cards share the table's selection and row
  menu. Ledgers and reference tables (wallet transactions, SRO offices,
  government values, geography, desk coverage) are table-only. A rows-and-
  columns view is called **Table**, never "List"; "List" names a view that is
  not a table.
- **The property register** (founder, 11/10/2026). `PropertyTable` reads as a
  land register: **Survey No / LP** (the record's name; under it the
  **Pattadar ID**, our id for it (a UUIDv7), and a built property's LP), Type (with
  khata), Owner (+ other owners; father/husband), Where (village, then mandal
  and district; a boundary, pin or crossed-pin mark), Held by, Holding,
  Managed by (first caretaker or agent; your stake), Status (mutation, EC, in
  court), Extent, Market estimate (what was paid and when), Title deed
  (registered on), Last activity (when · by whom; what changed · added). Each
  cell is the fact over what qualifies it; an unrecorded fact is "—". Lines
  never wrap; the tick box and Survey No / LP stay put while it scrolls. The
  CSV leads with Pattadar ID and LP and carries every fact flat.
- **A fact opens the tab it lives on** (founder, 11/10/2026). A link about one
  aspect of a property goes to that tab of `/properties/:id`, never the front
  page: location → `location`, services and orders → `services`, people and
  managers → `people`, price → `money`, expenses → `expenses`, trail →
  `activity`, deeds and documents → the default Documents tab. Only a link that
  names the property itself opens the default tab.
- **Section head.** A table inside a tab, step or block opens with `SectionHead`
  (`RecordHead.tsx`): the title, one line of facts ("12 expenses · ₹48,200
  spent"), guidance behind its ⓘ, its own actions as `HeadActions` (⋮ last).
  Never a hand-built `.sechead`, never guidance as the line under the heading,
  never a search, year, view or scope control in it: those are the band's
  (§ Property tabs, "A section's band").

- **One order flow** (founder, 10/10/2026). Every "Order a service" — page
  head, property head, row or card menu, a selection's bulk bar, "Order it
  again", the one-tap visit buttons — opens `/order` through `orderHref`
  (`orderFlow.ts`). With the properties already known it opens on the services
  step with them chosen, and step 2 names them ("Ordering for" chips, each
  removable, and Change). No screen places an order itself and there is no
  second route in.

## Loading (founder decision, 10/10/2026)

"Where is the smooth loading?" — a region loads as a skeleton of its own
shape, never a grey box with a sentence under it.

- **First read:** a table draws `SkTable` (its real headings, shaped rows, the
  tick column and the total row reserved); a card grid draws `SkGrid` (or the
  screen's own card skeleton, as Properties' `SkRecordCards`); a list of rows
  draws `SkRows`; a map draws `SkMap` (tile grid, zoom and scale where
  Leaflet puts them — also the lazy map's Suspense fallback); a document or
  scan draws `SkPaper`; a page draws its own page skeleton. Nothing moves when the
  data lands. `Loading` (the generic box) is not used on signed-in screens.
- **A new read of something already on screen** (a filter, a chosen property,
  a tab's year): the query keeps its last answer (`placeholderData:
  keepPreviousData`) and the region dims and goes inert (`aria-busy`) until the
  new one lands; a command that would act on the stale answer waits. A region
  never blanks back to a skeleton.
- One live region per skeleton (`Busy`); the scaffold is `aria-hidden`.
- A failed read is `Failed`, never a skeleton that pulses forever.

`scripts/shared-components-tests.ts` (SC-S1, SC-T*, SC-O1, SC-L1) fails a hand-built section
head, a page-local pager, an unlabelled total row, a data table without tick
boxes and a collection page without the view toggle.

## Data provenance (project rule, enforced 2026-09-25)

Nothing invented may render as though it were a record. This is the founder
decision of 2026-07-26 ("it is real application now") written down as a rule
with a gate behind it, after an audit found one live leak and a loaded gun:

- A failed read shows **shape-correct emptiness**, never a stand-in row.
  `useLiveOrSample` and `useFamLive` zero-fill through `emptyLike`; a hook that
  hands a bundled template back as `data` fails `scripts/provenance-tests.ts`.
  `useWallet` was doing exactly that, so `/legacy/wallet` printed an invented
  ₹12,500 balance and five payments nobody made to a signed-in owner.
- `packages/core/src/sample/data.ts` holds **shape templates only** — ids, union
  members and zeros. It was a 599-line invented estate (a named owner with a
  masked Aadhaar reference and a street address, khatas, survey numbers,
  valuations, family members with phone numbers and birthdates, an audit trail
  of things nobody did) and all of it shipped in the browser bundle. Any
  realistic value added back fails the guard.
- **One sentence** for a failed read: `UNREACHABLE_NOTE`, defined beside the
  flag that raises it. Six surfaces used to word this themselves and five worded
  it wrongly — a "Sample data" chip and a matching caption claiming fiction was
  on screen when what was on screen was nothing.
- Seed scripts **refuse a non-local `APP_PG_DSN`** (`scripts/seed_guard.py`).
  They write invented records, and `seed-demo-data.py` stamps generated base
  fields onto records that were merely empty — which has already corrupted one
  hand-filed parcel.

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
  **VillageCanvas** plot and edge colours (Leaflet paints onto a canvas over
  map imagery and cannot resolve a CSS var — literals, but Bloom values: the
  blue magnitude ramp, the white mesh and the Bloom paper/ink edges, all
  measured against the imagery rather than the page). Since 03/10/2026 the
  selection and hover are not literals: VillageCanvas and MapCanvas read the
  scheme's `--w-accent` and `--w-focus` off `<html>` when they draw
  (`w360/cssVar.ts`) and repaint when the scheme changes, so a Light or High
  Contrast map selects in that scheme's accent. The `ErrorBoundary` fallback is a fifth, separate
  case: it uses inline literals deliberately because it must render when the
  theme provider or stylesheet is itself the thing that failed.

  **Exception list reconciled and enforced 2026-09-25.** The list above named
  five cases; the tree held eleven legitimate ones, because the rule was
  enforced by review and review does not scale. `theme.ts` is not an exception
  at all: since 03/10/2026 it builds every scheme, and the High Contrast focus
  ring, from the palette pack (§ Exports), which is where palette values live.
  The six that were true but unwritten: `GeoMap.tsx` and
  `MapCanvas.tsx` (Leaflet canvases, identical reasoning to VillageCanvas),
  `lib/format.ts` (the Bloom-derived avatar ramp that *replaced* the Ant
  rainbow — the fix was made and never recorded here), `holdingCards.tsx` and
  `pages/detail/common.tsx` (the user-media scrims named abstractly above),
  and `TrainingCertificatePage.tsx` (a printed certificate is ink on paper, not
  a themed surface). One genuine violation was found and fixed:
  `w360/ScanFirst.tsx` carried `var(--muted, #6b7280)`, and `--muted` has never
  been declared anywhere in this repo — so the cost panel's labels always
  rendered a cool grey fallback, in all three schemes, where High Contrast owes
  secondary text `#171717`.

  `scripts/a11y-web-tests.ts` now holds the line as a ratchet: each file above
  may keep the literals it has and not one more, a file not on its list may
  have none, and a `var(--token)` that resolves to no declaration fails the
  build. Comments are stripped before counting, so describing a superseded
  system does not count as using it. Adding an exception means saying why at
  the call site **and** here **and** in that script.
- **Hairline, not shadow.** `MuiCard` defaults to `variant="outlined"`.
  Surfaces separate with a 1px `divider` rule; pass `elevation` explicitly only
  for things that genuinely float (menus, dialogs). Card hover is
  `translateY(-2px)` + border-strong, mirroring site.css `.card:hover`.
- **Eyebrows are small uppercase labels, not a second face.**
  `theme.typography.overline` and W360's `.eyebrow` are Atkinson Hyperlegible
  400, uppercase, positively tracked and muted; every `PageHeader` eyebrow and
  `<Typography variant="overline">` inherits that.
- **Fill means act.** Filled chips are reserved for state that demands
  attention. Counts and classifications are `variant="outlined"`.
- **Grid tracks are `minmax(0, Nfr)`, never bare `Nfr`.** A bare `fr` floors at
  min-content, so one non-shrinking child scrolls the whole page sideways —
  which is what it did at 375px until 2026-08-14.
- **Progress tracks are neutral.** MUI derives a track from its bar's colour
  (`darken(primary, 0.5)` = a solid `#7f4307`), so an empty bar read as a
  finished amber line. `MuiLinearProgress` pins the track to `action.selected`.
- **Content is measure-capped.** `AppShell` caps the routed area at `80rem`
  (`--max-width`) and centres it, so the app and marketing pages agree. On
  W360 the cap is on `.w360 main` itself (§ Page head, "One frame"): one
  80rem measure that the head, the toolbar band and the content share. A page
  may cap a form's own field measure, never its cards or its head.
- **One component per concern** (founder decision, 27/09/2026). A screen
  composes the shared components — `apps/web/src/w360/ui.tsx` on W360 (`Card`,
  `KV`, `Cell`, `Empty`, `Failed`, `Loading`, `PageHead`, `Chip`, `StatusChip`,
  `FacetFilter`, `Menu` …) and `apps/web/src/components/` on the previous app —
  and never re-implements one inside a page file. A page that needs a variant
  adds a prop to the shared component; it does not copy it. Where a concern has
  no shared component yet (form fields, tables), the
  second copy is the moment to lift it into `ui.tsx`, never a third page-local
  copy. Domain and format rules (units and their singular/plural labels,
  dates, money) live in `packages/core`. `scripts/shared-components-tests.ts`
  holds every page to the hand-built count it has today, and
  `docs/specs/TODO-one-platform.md` is the backlog that brings those counts
  down.
- **A filter is one component, not a page treatment.** List pages use the
  shared Web360 `FacetFilter`: one `+ Filter` trigger, checkbox facet groups,
  counted options, removable active chips, `Clear all`, and an adjacent result
  tally. Pages supply domain groups and values; they do not introduce their own
  select bars, filter drawers, search-as-filter layouts, or dismissal behavior.
  The filter is the left half of the **toolbar band** (§ Page head, slot 5):
  the band's right half is, in this order, the tally, the page's own search
  (`BandSearch`), sort (`SortCycle`) and the view toggle (`ViewToggle`) —
  `FacetFilter`'s `search`, `sort` and `view` props, never the page head's
  action slot. A collection with nothing to filter uses `ToolbarBand`. A
  segmented choice (a view, a scope such as Services' Open / All, a unit) is
  `Segmented` from `ui.tsx`; Grid · List · Table · Map is `ViewToggle`, in
  that order on every page.

- **A tab declares who owns vertical space.** Every active Record and Holding
  frame exposes `data-tab-layout`: `document`, `viewport`, or
  `split-instrument`. Document tabs size panels from content and leave vertical
  scrolling to the document; they never use `window.innerHeight - guessedChrome`.
  The People **Chain** and selected Media are viewport instruments; People
  Cards/Table remain document-shaped states inside that route. Viewport
  instruments may bound and clip only their visual stage and must not repeat
  the stage's links in rows beneath it. **A viewport instrument's stage reaches
  the bottom of the window** (founder direction, 2026-09-25). `main` carries
  `padding-bottom: var(--space-3xl)` as scrolling room for a document tab; under
  an instrument those 96px are the dead margin the instrument exists to remove,
  so such a tab drops it to `--space-lg` and draws nothing in a row beneath the
  stage. Media took that exemption from the start. The People **Chain** did not,
  and with a footer note under it as well the page ended in ~130px of nothing —
  which is what this rule now forbids.
  Split instruments fill the remaining desktop region,
  keep stage and rail bottoms aligned, and give overflow to the rail; at
  `≤1200px` they stack and return vertical scrolling to the document. A mobile
  stack must use natural height or `dvh`, never retain a fixed-height parent
  with `overflow:hidden`. Routed tabs never render a second `<main>` inside the
  frame, and a section heading precedes the split it describes so both columns
  begin at the same content line.

## Notes — anti-patterns NOT to carry over / reintroduce

- From the old landing (removed 2026-08-14): moving-border conic CTA, gradient
  shimmer text, floating/tilting product frame, glow-on-hover cards, aurora
  blobs, dot-grid + spotlight hero, blue-gradient step circles.
- Never: transition-all, hover-scale, bouncy easings, italic full headers,
  numbered eyebrows beyond copy that genuinely contains numerals, fake browser
  chrome, invented stats.
- Never: a second font family, a per-role face (mono labels or figures, a serif
  accent, a display face for headings), monospace to line up digits, a weight
  the face does not have (500/600/800), or a page-local copy of a shared
  component. The four-face system (Inter Tight, Atkinson Hyperlegible,
  JetBrains Mono, Instrument Serif) was retired on 27/09/2026.
- **Never leave a superseded system described in a comment.** The audit found
  header comments still naming the "stock theme", the "emerald gradient" (over
  code that was blue) and the "gold-glass surface" (over a plain Paper). A
  stale comment is how the next redesign inherits a dead system.

## Exports

Colour schemes: the palette pack, `packages/tokens/src/palette` (Bloom Light,
Bloom Dark, Pattadar Gold, High Contrast and the registry that names them and
picks each app's default). `scripts/palette-tests.ts` holds every scheme to the
role contract and the contrast floors. `apps/web/src/theme.ts` and
`apps/university/src/theme.ts` build MUI's colour schemes from it
(`muiColorSchemes`) and key them on `<html data-scheme>`. University draws with
its own stylesheet: its `--color-*` names in `apps/university/tokens.css` (and
the header's own in `src/styles.css`) are aliases of those MUI variables, and
that file declares no colour (`scripts/a11y-web-tests.ts` M3-7).
Non-colour tokens (type, spacing, motion, rules, layout):
`apps/web/src/styles/tokens.css` (imported globally by `apps/web/src/main.tsx`),
which declares no colour. The marketing surface's `--color-*` names are
aliases of MUI's variables that `apps/web/src/styles/site.css` declares on
`.site`, which always wears `data-scheme="dark"`; only the marketing pages may
read them (`scripts/a11y-web-tests.ts` M3-6).
The one font token, `--font-sans`, is declared in tokens.css and repeated
verbatim in `apps/university/tokens.css` and as `FONT_SANS` in
`packages/tokens/src/index.ts`; `scripts/typography-tests.ts` fails when any copy
differs.
The Web360 surface (`apps/web/src/w360/w360.css`) reads the same schemes: its
`--w-*` slots are aliases of MUI's `--mui-palette-*` variables, declared on
`:root` and on every `[data-scheme]` element, so W360 holds no colour values of
its own and a pack change reaches it with no second edit. (Until 03/10/2026 it
redeclared Light and High Contrast by hand, and its High Contrast drew several
semantic colours and its focus ring differently from MUI's.)
`scripts/a11y-web-tests.ts` M3-6 fails an alias of a variable the theme does
not emit in every scheme.
Cross-app values (chart series, status hues): each scheme's `chart` and
`status` in the palette pack (`packages/tokens/src/palette`) — consumed by
`apps/web` and `apps/university`, NOT by mobile/iOS.
No Tailwind/shadcn consumers exist in this repo; generate those formats from
tokens.css on demand if ever needed.

### Chart series (re-derived 2026-08-14)

Slot order `amber(brand) · teal · coral · green · plum · slate`. The previous
ramp led with `#1976D2` and was validated against a neutral `#121212`; Bloom's
dark paper is warm `#0d0504`, so both the hues and the validation surface were
wrong. Every slot clears 3:1 on its own surface. Slots 1 and 3 are the two warm
hues and so the colour-blindness risk — they are separated by **lightness**
(1.78:1 normal, 1.69:1 simulated deuteranopia), not hue alone.

Light slot 4 (green) moved on 04/10/2026 from `#387d3d` to `#539344`
(oklch 60% 0.13 140, 3.64:1 on surface): it was 1.12:1 against the status green
`#27762f`, so a chart series read as a status. It is 1.51:1 apart now. High
Contrast and Pattadar Gold draw Light's series, so they moved with it.

Outstanding: the full six-checks adjacent-ΔE sweep across all 15 pairs has NOT
been re-run. Do that before this palette carries a dense multi-series view.
