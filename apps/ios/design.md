# Design — Pattadar for iOS

The locked design system for the native app. `DesignSystem.swift` is the
executable copy of this file; this file is why.

Stamp: `Hallmark · genre: modern-minimal (native) · surface: platform-grouped + brand record heroes · theme: Bloom-derived (see /design.md) · scope: apps/ios`

## Relationship to the root `design.md`

The repository root's `design.md` is the **web** system. Its macrostructures are
web routes (`/`, `/app/*`, `/privacy`), its components are MUI, and its type is
three Google faces served by `@fontsource`. None of that crosses to a phone.

What crosses is the **brand**, and it is exactly three things:

1. **The amber accent**, at the same values — `#FE860F` dark, `#AA5910` light.
   It lives in `Assets.xcassets/AccentColor.colorset` and therefore in every
   `Color.accentColor`, every `.tint`, and every system control in the app.
2. **The warm paper**, derived from the same OKLCH ramp — `Palette.ground`,
   `.card`, `.cardRaised`, `.record`, `.recordDeep`.
3. **The serif register for records.** The web sets its display in Inter Tight
   with an Instrument Serif accent line. A phone has neither, and shipping
   webfonts to get them would be a worse trade than the platform's own serif.
   `Font.recordDisplay` / `.recordTitle` are the native equivalent: New York,
   the system serif, used for the same job — the name of a thing you own.

Everything else here is native and owes the web nothing. **Do not import web
macrostructures.** A phone screen is not a landing page.

## The container rule

The single most-violated thing in the app before this file existed. Three
idioms were in use — 20 `Form`, 18 `List`, 6 card-`ScrollView` — with nothing
saying which belonged where, so Home was bespoke cards, You was stock Settings,
and the Vault was a `List` with cards inside its sections.

- **A record you read** → `List`, platform grouped surfaces. Holdings, the
  vault, You, activity. The platform's grouped background and row chrome are
  adaptive, accessible and correct by default; do not repaint them. The brand
  shows through the accent, the type and the hero.
- **A record you edit** → `Form`. Every add and edit sheet. `FormRow` for a
  labelled value, `PrimaryButton` for the one action that commits.
- **A dashboard you glance at** → `ScrollView` of cards drawn by the app, on
  `Palette.ground`, cards on `Palette.card`. Home only.
- **The head of a holding** → `RecordHero` on `Palette.record`, dark in both
  appearances.

A screen picks one and stays in it. A card inside a `List` section is allowed
only when the content is a genuine unit (a khata, a holding) — never as
decoration.

## Colour

Tokens live in `Palette`. There are no colour literals in the app; a raw
`Color(red:green:blue:)` or a `Color.orange` outside `DesignSystem.swift` is a
defect.

- **Accent (amber)** is the one interactive colour, and also the attention
  colour. In a records app the thing that needs you *is* the primary action, so
  pointing at both in the accent is honest.
- **Category** hue says *what a holding is* — muted earths, drawn as a wash
  behind a motif that already carries the meaning. Never a status colour.
  Farmland was green while success was also green; home was orange while
  warning was also orange, so a house card and a problem card were the same
  swatch. Hue now carries category, saturation carries urgency.
- **Status** is `danger` / `caution` / `success`, and for readiness it is never
  chosen at the call site — see below.

### Readiness has one verdict

`Readiness.verdict` in `PattadarKit` decides `.blocked` / `.untidy` / `.ready`
from the checks themselves, and `Palette.tint(for:)` is the only place it
becomes a colour. Three screens used to run their own percentage cutoffs —
green at 75% on a holding, green only at 100% on Home — so one record carried
two verdicts in one session. **Never write a readiness threshold in a view.**

## Type

Six roles on `Font`, and screens pick from them:

| Role | What it is for |
|---|---|
| `.recordDisplay` | A holding's name, the greeting — what a screen is about |
| `.recordTitle` | A card or sheet title, same register one step down |
| `.sectionHead` | A section head inside a screen |
| `.figure` | A quantity. Tabular, so a column lines up |
| `.bodyCopy` | Body copy on a card |
| `.note` / `.label` | A supporting line; an uppercase kerned label |

Serif is the register of a printed record and carries identity only. Everything
else is the platform's own face, because the platform's own controls are drawn
in it.

**Every exact size goes through `Font.scaled(_:weight:design:)`**, never
`Font.system(size:)`. The plain form is frozen — it ignores the text-size
setting — and the app had eighty-one of them and no `relativeTo:` anywhere, so
at accessibility sizes nothing grew. `Font.scaled` also floors at 11 points;
there were twenty-three runs of text between 8.5 and 10.5.

The only permitted `Font.system(size:)` calls are sizes computed from a drawn
shape's own dimension (an avatar's initials at `size * 0.38`), where the glyph
must track the circle rather than the text setting.

## Shape and space

- **Radius**: `Radius.control` 10 · `.card` 16 · `.hero` 22. Three, from
  fifteen. Sub-10 literals survive only inside drawn motifs, which are shapes
  rather than containers.
- **Space**: the 4-point grid — `xs` 4 · `sm` 8 · `md` 12 · `lg` 16 · `xl` 20 ·
  `xxl` 24 · `xxxl` 32. `Space.hair` (2) is the one sub-grid step and it is
  *leading*, not layout: the gap between a label and the value directly under
  it, which is set as one block of type. Never use it as padding.
- Raw numbers above 32 are allowed for deliberate one-off offsets (clearing the
  floating tab bar, seating a spinner) and should carry a comment saying so.

## Motion

`Motion.standard()` is the app's only animation, and it returns `nil` when
Reduce Motion is on. There is no bare `withAnimation` in the app. Durations:
`quick` 0.22, `considered` 0.4.

## Accessibility — the floor, not the aspiration

- Every icon-only control has an `.accessibilityLabel`.
- Every control has a 44-point target. `.minimumTouchTarget()` grows the target
  without growing the drawn shape, so a row's rhythm is unchanged.
- Dynamic Type works everywhere (see `Font.scaled`). `lineLimit(1)` is for a
  value that must not wrap, never for a sentence.
- Text on the record surfaces uses `Palette.inkOnRecord` /
  `.inkSoftOnRecord`. The soft value is 0.72 white because 0.45 measured
  3.8:1 on the hero gradient and failed AA.
- A non-text control needs 3:1 against what is behind it. Home's "Fix what is
  blocking" was white-at-12% on a near-black card — 1.4:1 — and is now an
  accent fill.
- The tab bar's centre slot is a button wearing a tab's clothes; it carries
  `.isButton` and its own label, because VoiceOver was announcing an action as
  a place.

## What must never come back

- A colour literal outside `DesignSystem.swift`.
- A readiness threshold written in a view.
- `Font.system(size:)` with a constant.
- A percentage, radius or padding value chosen because it looked right on one
  screen.
- A view component with no call site. Six were deleted on 2026-08-14
  (`HoldingHero`, `NeedsYouSection`, `CountRow`, `StatTile`, `VillageChart`,
  `AttentionCard`) — about 350 lines of dead UI, each carrying its own
  competing rules.
