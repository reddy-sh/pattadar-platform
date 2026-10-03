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
- **App pages** (`/app/*`): functional shell, tokens-only restyle. No
  decoration ever — function carries the page. Light, Dark, and High Contrast
  remain complete, user-switchable schemes. **Domain structure is allowed**
  (founder decision, 27/09/2026): an app surface may take the grammar of the
  land record it shows — register rows with entry numbers, paper spines with
  their record code and year, dashed slots for what is not filed yet — when
  that grammar carries real data. It stays token-only colour, hairline rules
  and type: no illustration, scene, texture or ornament, and nothing drawn
  that the record does not say. First applied on Documents (`/app/papers`).
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
- `--color-ink-3`   oklch(58% 0.015 50)   ≈ #827873  (small uppercase labels on base paper only — 4.47:1 on paper-2, keep off paper-2 body text)
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
  verbatim in `apps/web/src/theme.ts`, `apps/university/tokens.css` and
  `packages/tokens`. A root names it once (`.w360`, `.site`, the certificate
  page, University `body`) and everything else inherits. A component never
  names a font family.
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

The signed-in W360 app (`/app/*`) uses one noun per concept, and a page's
title always matches its rail label. Decided by the founder as "Option C":
short, stable rail nouns; noun-phrase section headings; factual
dot-separated subheaders ("Village recorded · Boundary saved · Pin not set");
verb + object actions. `/legacy/*` keeps its own older copy until retired.

| Concept | Say | Not |
|---|---|---|
| Everything the owner holds | **Properties** (a parcel, plot, flat or house when known). **Holdings** must never be used for the Properties list | holdings, records, land, portfolio items |
| Stored papers | **Documents** (item: document; bytes: file) | Papers, Vault, My Drive |
| Several properties held as one | **Holding** (list: **Holdings**) — official records stay separate. Inside one, use the singular ("This holding"). Never write "your holdings" to mean all of an owner's land. Web: one constant, `HOLDING_WORD` in `apps/web/src/w360/ui.tsx` | combined view, combined property, estate, portfolio |
| Village / cadastral maps | **Cadastral maps** | Village maps, Maps |
| One property's pin and boundary | **Location & boundary** — "Boundary saved", never "surveyed" | Where this land is |
| Things physically on the land | **Site features** | Features, assets |
| Owner's paid work | **Service order** (the desk's operational unit stays a **job**) | ticket, request, job (on owner screens) |
| Owner-facing trail | **Activity** (Audit log is reserved for a compliance surface) | Audit Log, History, Timeline |
| Pattadar's people | **Member** / **provider** | associate, somebody |
Holding approved by Reddy on 03/10/2026, superseding the 26/09/2026 "Combined view" entry (research: `.agents/tasks/pattadar-platform-combined-views-standardize-2026-10-27/naming-research.md`). Web files, identifiers and routes say holding (`/app/holdings`; `/app/combined…` redirects); GraphQL fields, operations, query keys and the `combined_*` tables keep `combined` (server contract). `scripts/vocab-tests.ts` (VOC-1..7) holds the web to it, and holds iOS (which has no Holdings feature) to "property" for one property.

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
owed only once you accept the work." Owners count **properties**; "record"
is used only for the members of a holding.

### Property tabs (founder decision, 28/09/2026)

Taken from the ten heuristic audits of the property page
(`/app/records/:id/*`), as recommended. Evidence:
`.local/ux-audits/2026-09-27-w360-record-*/board.html`.

- **Headings name the tab:** Documents, Site features, People (sides
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
- **Fill means act:** pressed filters and view toggles take the wash state;
  the property header's "Share securely" is outlined, so each tab's own add is
  its one filled button.
- **Removing or replacing** something saved asks in the shared confirmation
  (`ConfirmDialog`), naming it and saying what happens; the dialog holds until
  the server answers.
- **Motion:** the Location outline draws on once, on the first visit; the
  per-visit stars and glow are gone.
- **Notes** cannot be edited once added; deleting one is recorded in Activity.
  **Activity** names who acted in words ("You", "Pattadar desk"), never an
  identity key.
- **Kept on purpose:** the share panel's "Valid for 30 days · Anyone with the
  link can download…" line stays visible rather than behind an ⓘ, because it
  is the consent notice for a public link.

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
  **VillageCanvas** plot/edge/selection colours (Leaflet paints onto a canvas
  over map imagery and cannot resolve a CSS var — literals, but Bloom values:
  the blue magnitude ramp, `--color-accent` selection, `--color-focus` hover,
  and Bloom paper/ink edges). The `ErrorBoundary` fallback is a fifth, separate
  case: it uses inline literals deliberately because it must render when the
  theme provider or stylesheet is itself the thing that failed.

  **Exception list reconciled and enforced 2026-09-25.** The list above named
  five cases; the tree held eleven legitimate ones, because the rule was
  enforced by review and review does not scale. `theme.ts` is not an exception
  at all — § Exports names it as where palette values live, so it is the
  source. The six that were true but unwritten: `GeoMap.tsx` and
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
  (`--max-width`) and centres it, so the app and marketing pages agree.
- **One component per concern** (founder decision, 27/09/2026). A screen
  composes the shared components — `apps/web/src/w360/ui.tsx` on W360 (`Card`,
  `KV`, `Cell`, `Empty`, `Failed`, `Loading`, `PageHead`, `Chip`, `StatusChip`,
  `FacetFilter`, `Menu` …) and `apps/web/src/components/` on the previous app —
  and never re-implements one inside a page file. A page that needs a variant
  adds a prop to the shared component; it does not copy it. Where a concern has
  no shared component yet (tabs, form fields, segmented controls, tables), the
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

Canonical: `apps/web/src/styles/tokens.css` (imported globally by
`apps/web/src/main.tsx`). MUI mappings: `apps/web/src/theme.ts`.
The one font token, `--font-sans`, is declared in tokens.css and repeated
verbatim in `theme.ts`, `apps/university/tokens.css` and
`packages/tokens/src/index.ts`; `scripts/typography-tests.ts` fails when any copy
differs.
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
