# TODO — one font, one component, one platform

Status: **fonts done on the web; components not started.** Written down so the
rest is not lost. Founder decision, 27/09/2026 (design.md § Design authority).

## What was asked for

> "one font one platform — one component one platform — all the components,
> custom components follow [the shared ones] instead of building on their own …
> we need to fix the font and we do todos for components later"

The screen behind it: the Area calculator's result card drew "1 ACRES =" and
"1 Acre" in JetBrains Mono inside a sans card. It was a page-local component
(`AreaResult` in `apps/web/src/w360/pages/Tools.tsx`) building its own card,
eyebrow and table beside the `Card`, `KV` and `Cell` that `w360/ui.tsx`
already exports, and it echoed the picker's plural label over a value that
`formatArea` wrote in the singular.

## What shipped on 27/09/2026

- **One face on the web.** Atkinson Hyperlegible 400/700 and 400 italic is the
  only font `apps/web` and `apps/university` load. One token, `--font-sans`;
  a root names it (`.w360`, `.site`, the certificate page, University `body`)
  and everything inherits. Figures line up through `tabular-nums`, not a
  monospace face. Weights are the two the face has. See design.md § Typography.
- **Guards.** `scripts/typography-tests.ts` (source: packages, tokens,
  `font-family`, weights, spelled stacks, the roots, the entry imports) and
  `tests/e2e-app/specs/26-one-font.spec.ts` (the browser: every visible text
  box and pseudo-element on every signed-in, previous-app and public route,
  both projects; Chromium traces the Area calculator's glyphs to the font file
  that drew them).
- **"1 Acres =".** `unitLabelFor(count, key)` in `packages/core` names a unit
  for a quantity; the converter title uses it.
- **The ratchet.** `scripts/shared-components-tests.ts` holds every W360 file to
  the hand-built cards, cells, empty states, tab lists and ui.tsx shadows it has
  today. New files get none. Lower a budget in the same change that lowers a
  count.

## Why the components were not done now

The founder asked for the font now and the components as TODOs. The work is
wide: about 177 hand-built form fields in 25 W360 files, 11 segmented
controls, two tab strips, 60-odd hand-built cards. Each lift must keep the
keyboard/ARIA contract and the e2e selectors (`getByLabel`, `role=tab`,
`.num`, `.eyebrow`) that the sealed suite reads, so each is its own change
with its own tests.

## Components — ranked

| # | Concern | Evidence today | Shared owner | Size | Risk |
|---|---|---|---|---|---|
| 1 | Unit words and plurals still wrong elsewhere | `formatExtent('cents')` always prints "Cents"; its `sqyd` prints "Sq.yd" where UNITS says "Sq. yards"; `plural()` in ui.tsx only appends "s"; FenceStudio.tsx and mobile `lib/family.ts` carry their own plurals | `packages/core` (`unitLabelFor`, one plural helper) | S | Low–med: visible copy; iOS vectors |
| 2 | Unit option lists copied | `PARCEL_UNIT_OPTIONS` in AddParcelDialog.tsx and PassbookDetailPage.tsx; mobile add-parcel.tsx `UNITS`; OwnerChain.tsx `EXTENT_UNITS` (a third vocabulary); PropertyActions.tsx `UNIT_IN_WORDS` | `packages/core` beside `UNITS` / `parseAreaSqYd` | S | Med if OwnerChain's unit strings are stored |
| 3 | Geometry copied | `ringAreaSqM` / `ringPerimM` private in components/GeoMap.tsx vs `landcalc.ts` | `packages/core` | S | Med; needs tests |
| 4 | Tabs | Done 03/10/2026 for in-page tabs: `ui.tsx` `TabStrip` (with an optional glyph-and-word status) and `TabPanel` serve Tools.tsx and Groups.tsx, and the page-local copies are gone. Remaining: route tabs in RecordHead.tsx and Holding.tsx | `ui.tsx` `RouteTabs` | S | Low–med: `role=tab` selectors |
| 5 | Form fields | ~177 hand-built `div.field`; Tools.tsx `NumField`/`SelectField`; RecordPeople.tsx `PhotoField` | `ui.tsx` `Field`, `NumberField`, `SelectField`, `TextAreaField` | M | Med: `label for` naming, `getByLabel` |
| 6 | Segmented control | 11 hand-built `.segmented` groups (PaperPreview, BoundaryMeasurementsCard, Reader, Tools, HoldingLedger, Properties, Orders, RecordPeople ×3, DeskAssociates) | `ui.tsx` `Segmented` | S | Low |
| 7 | Readouts and tables | Tools.tsx `AreaResult`, hand-built `.strip`/`.kv` in Tools.tsx; BoundaryMeasurementsCard; ParcelDetailPage extents; no W360 table primitive | `ui.tsx` `AreaReadout` over `Card`/`KV`/`Cell`; a `Table` | S | Low |
| 8 | Write-failure copy | `MOVE_FAILED` in Desk.tsx, Orders.tsx, Ticket.tsx; `WRITE_FAILED` in DeskAssociate.tsx; inline strings in OrderLand, HoldingActions ×4, DeskEnrol, Properties, HoldingLedger | `ui.tsx` | S | Low — but keep `ORDER_FAILED`/`RAISE_FAILED` separate: they tell the owner to check before retrying a non-idempotent order |
| 9 | Format helpers | ui.tsx `ddmmyyyy`/`inr*`/`num`/`extent`; detail/common.tsx `fmtDMY`/`money`; lib/format.ts `fmtLocal`; core `parseISOToDisplay`/`formatINR` | `packages/core/src/format` | M | Med: DD/MM/YYYY invariant; iOS vectors |
| 10 | Status words | ui.tsx `STATUS_WORD`; detail/common.tsx `StatusChip`; Groups.tsx `STATE_OF`; DeskAssociates.tsx `STATE_CHIPS`; PropertyDetailPage.tsx `HOLDING_STATUSES` | core (words) + ui.tsx (render) | M | Low–med |
| 11 | Inline styles | ~955 `style={{` in w360/pages, ~528 `sx={{` in legacy pages | w360.css utilities and component props | L | Low per edit; measure the recurring patterns first |
| 12 | Two UI systems | `/legacy/*` MUI screens still routed; W360 imports `pages/documents/*` and `families/familiesData` as a data layer | W360 + a `data/` module | L | High — Reddy's architecture decision |
| 13 | Mobile | screen-local `StatChip`, `SectionHeader`, `CompositionBar` ((tabs)/index), `HoldingRow`, `PassbookCard`, `Row`/`Section` (property/[id]); the EmptyState guard skips activity.tsx; `UNIT_LABELS`/`pluralize` belong in core | `apps/mobile/src/components`, core | M | Low–med |
| 14 | University | its own AppHeader, Footer, AuthProvider; no `@pattadar/*` dependency | Reddy decides whether the rule covers it | L | Med |
| 15 | Guard helpers | ux-guards.ts, a11y-web-tests.ts and provenance-tests.ts each carry a comment-stripping scanner | `scripts/lib/source-scan.ts` (the new guards already use it) | S | Low |
| 16 | Docs drift | web-next references in the web-next-cutover skill; the component-kit contract is web-next-only | skills + a re-based contract if adopted | S | Low |
| 17 | ~~Muted text on cards~~ **Done 03/10/2026** | `--w-ink-3` (4.47:1 on paper-2) set unit names, eyebrows and field labels inside `.card` — the Area calculator's result table is one — which design.md § Theme kept off paper-2 body text. Found by both skill replays on 27/09/2026. Fixed at the source instead of with a `.card` rule: the pack's muted ink moved the smallest step that clears 4.5:1 on the page and on cards in Dark (oklch 58% → 58.5%) and Light, and `scripts/palette-tests.ts` now has no known failures | the palette pack (`packages/tokens/src/palette/bloom.ts`) | S | — |
| 18 | Field height | W360 `input`/`select` measure ~38px; the 44px coarse-pointer floor covers `.btn` only | w360.css field rule, or the `Field` component of item 5 | S | Low; measure in the phone project |
| 19 | Search with results | Three hand-built copies: the top bar's `.jump`/`.jump-results` (Shell.tsx), the plot finder's `.vc-tr`/`.vc-plot-options` and the village search's `.vm-find`/`.vm-find-results` (both VillageMaps.tsx; the third, 03/10/2026). Each carries its own open, Escape and press-away rules. The village search puts the Filter's popover away through `FacetFilter`'s optional `ref` handle (`FacetFilterHandle.close()`, 03/10/2026); before that it clicked the component's own `+ Filter` button. Only the village search has no combobox state (`aria-expanded`, `aria-controls`) or arrow keys: its rows are Tab stops. A choice there hands focus back to the field after a key or a mouse but not after a tap, which would raise a phone's keyboard again, and its Escape is also answered from `window` once focus has fallen out of it. The ring is already on the container: since 03/10/2026 every `.search` pill, the jump box's and the village search's, draws its keyboard ring on the pill and none on the input inside it (`.w360 .search:has(input:focus-visible)` in w360.css, with High Contrast's 3px ring moved there too), and the Filter's own search draws its ring inset on its `.fpop-head` row | `ui.tsx` `SearchField` (pill, floating results, open/close/Escape rules, one ring on the pill, combobox semantics and arrow keys) for all three | M | Med: combobox/listbox ARIA, `getByLabel` names and the `.jump-results`/`.vm-villages .villagerow` selectors. Reddy granted the village search an exception on 03/10/2026 until this is lifted; not lifted in the Cadastral maps change |
| 20 | ~~Filter with nothing to offer~~ **Done 03/10/2026** | `FacetFilter` printed "No filter options match that search." whenever no group had options, with or without a typed query (`ui.tsx`, `.fpop-empty`). Cadastral maps without `/vm/catalog.json` (a failed or refused read gives `[]`) has no District or Mandal options, and since its Village group went on 03/10/2026, `+ Filter` opened on that line alone. Found in the Cadastral maps review. Fixed on 03/10/2026 with the option Reddy approved that day, that the line shows "only once a query has been typed": a popover with a search now says it only once a query is typed, and with nothing typed shows its search row alone. A popover without a search, where nothing can be typed, still says it. That part is the implementer's reading, not Reddy's words, kept so those popovers never open as an empty box; it waits for Reddy to confirm it or to drop the `\|\| !searchPlaceholder` term | `FacetFilter` (`ui.tsx`) | S | — |

## One font beyond the web — not decided

- **iOS.** SF with the New York serif register (`Font.recordDisplay`,
  `.recordTitle`) and monospaced digits. `apps/ios/design.md` lists the serif
  register as one of the three brand elements that cross; changing it is a
  parity-contract decision. One face would mean bundling Atkinson TTFs
  (Fontsource ships only woff/woff2; the OFL source files do), `UIAppFonts`,
  and a Dynamic Type mapping.
- **iOS unit words.** `areaText` / `propertyAreaText` in
  `PattadarKit/Land/Units.swift` print `UnitKey.label`, which is plural, so one
  acre reads "1 Acres" on the phone. The twin of the web fix exists —
  `UnitKey.singular` and `label(for:)`, tested in `UnitLabelTests.swift` — but
  no phone screen uses it yet: switching `areaText` changes visible iOS copy.
  `UnitKey.label` must stay plural; the API stores it as a parcel's unit.
- **Expo.** Paper's `configureFonts` uses the system face; `'Menlo'` (iOS only)
  sets the Aadhaar mask and parcel references, so Android shows a proportional
  face there; `expo-font` is declared and unused.
- **PDF exports.** jsPDF's core Helvetica in `apps/web/src/export/exporters.ts`
  and `apps/university/src/pdf/coursePdf.ts`. Embedding Atkinson needs a TTF
  and `addFont`, and grows every export.
- **₹.** Atkinson Hyperlegible has no U+20B9, so every rupee sign comes from the
  system fallback in the stack, as it did before.
- **`docs/font-review-atkinson.html`.** Review-only, loads Google Fonts from the
  CDN, and demonstrates tabular figures with a monospace face. Refresh or
  retire it.

## One palette — in progress

Planned with Reddy on 03/10/2026; design.md § Design authority records each
decision as the step that makes it visible lands. One palette pack,
`packages/tokens/src/palette`, drives every web surface, University and the
Android app. MUI CSS theme variables keyed on `<html data-scheme>` become the
one runtime colour layer on the web. A light Pattadar Gold theme joins Light,
Dark and High Contrast, and Atkinson Hyperlegible moves onto iOS, Expo and the
PDF exports.

- [x] The pack and its contrast gate (`scripts/palette-tests.ts`), 03/10/2026.
  Nothing renders from it yet; its known failures are the muted ink of #17.
- [x] apps/web's MUI theme built from the pack and keyed on `data-scheme`,
  03/10/2026. Same colours except one wash strength (14%) for the previous
  app's selected fills.
- [x] One saved theme for W360 and the previous app, applied before first
  paint (`public/theme-init.js`), 03/10/2026. Next release: delete the old
  `w360.scheme` key and the migration, and seed MUI's keys in
  `tests/e2e-app/fixtures/harness.ts` instead of the old key.
- [x] W360 colours from the pack, and the muted ink on cards (#17),
  03/10/2026. W360's `--w-*` slots alias MUI's variables, so `.w360` no longer
  carries the scheme. High Contrast W360 takes design.md's semantic colours and
  the one black ring with a white halo; Light takes its own focus colour and
  washes; text on the accent wash reads the wash's own ink; map selections
  follow the scheme. The contrast gate has no known failures left.
- [x] Marketing, sign-in and public pages from the pack, 03/10/2026.
  `tokens.css` declares no colour; the `--color-*` names are aliases on
  `.site`, and the file viewer reads MUI's variables under its own
  `data-scheme="dark"`. Computed colours on the seven public pages match the
  oklch originals to 1/255, except a few `color-mix(in oklch)` results whose
  low-chroma input lost its hue (badge and free-plan borders up to 7/255).
- [x] Pattadar Gold, 03/10/2026: the fourth scheme in the menu (Light · Dark ·
  Pattadar Gold · High Contrast), from the appearance study's anchors, with a
  charcoal header and a 2px gold rule that W360's top bar and the previous
  app's AppBar both read from the scheme's `chrome` roles. Charts read the
  active scheme. `/app?scheme=pattadar` opens it for review; `/theme-samples`
  is retired. Android's half lands with the Android themes below.
- [x] University on the pack, 03/10/2026. `apps/university/tokens.css`
  declares no colour; its `--color-*` names alias the MUI variables of
  `src/theme.ts`, built by the same adapter as the web's. The switcher offers
  the registry's four schemes (University keeps its "High contrast" wording),
  saved in MUI's keys and applied before first paint by its own
  `public/theme-init.js`; the old `pattadar.university.theme` choice is
  carried over once. Opens in Light, as before. Its colours are now the
  pack's, so University's own hand-tuned values give way: Light ink darkens
  less (`#261d1a` for `#1c1411`) and its secondary text lightens to `#615956`;
  High Contrast takes design.md's values. `scripts/a11y-web-tests.ts` M3-7
  holds the aliases to the variables the theme emits.
- [x] Colours told apart by lightness, 04/10/2026 (design.md § Design
  authority). Bloom's coral left the error red (lightened in Dark, deepened in
  Light), Light's warning left the action amber (bronze `#72480b`), Light chart
  slot 4 left the status green, muted ink clears 4.5:1 on raised, and Dark's
  danger fill carries dark text. The gate now holds muted ink on raised and
  text on every filled control at 4.5:1.
- [ ] One type scale, with W360 and University on it. W360 still sets
  0.625, 0.6875, 0.875, 0.9375 and 1.1875rem beside tokens.css's `--text-*`
  steps, and `--text-display` is declared but read by nothing.
- [ ] One radius scale. `tokens.css` has 3 · 6 · 12 · 20px, `packages/tokens`
  `radii` (Expo) has 4 · 8 · 12 · 16 · 20, and MUI's `shape.borderRadius` is 8.
- [ ] Shadows as palette roles. `w360.css` writes about six literal floating
  shadows (menus, hover cards, drawers, dialogs). They carry colour, so they
  belong in the pack (per scheme), not in `tokens.css`, which declares none.
- [ ] Atkinson TTFs, checked; PDFs in Atkinson; evidence for Telugu in PDFs.
- [ ] Expo in Atkinson and on the pack, with the four themes.
- [ ] iOS in Atkinson.

## Until then

- New W360 code composes `ui.tsx`; a concern with no shared component gets one
  at its second copy, never a third page-local copy (design.md § App-surface
  rules). `scripts/shared-components-tests.ts` fails a new hand-built card,
  cell, empty state, tab list or shadow.
- New CSS and TSX name no font family and use only 400 and 700;
  `scripts/typography-tests.ts` and `26-one-font.spec.ts` fail otherwise.
