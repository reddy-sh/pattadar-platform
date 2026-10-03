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
| 4 | Tabs | `TabStrip`/`Panel` in Tools.tsx and `TabStrip` in Groups.tsx (same contract); route tabs in RecordHead.tsx and Holding.tsx | `ui.tsx` `TabStrip`, `TabPanel`, `RouteTabs` | S | Low–med: `role=tab` selectors |
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
| 17 | Muted text on cards | `--w-ink-3` (4.47:1 on paper-2) sets unit names, eyebrows and field labels inside `.card` — the Area calculator's result table is one — which design.md § Theme keeps off paper-2 body text. Found by both skill replays on 27/09/2026 | a `.card`-scoped ink-2 rule in w360.css | S | Med: touches every W360 card; check all three schemes |
| 18 | Field height | W360 `input`/`select` measure ~38px; the 44px coarse-pointer floor covers `.btn` only | w360.css field rule, or the `Field` component of item 5 | S | Low; measure in the phone project |

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

## Until then

- New W360 code composes `ui.tsx`; a concern with no shared component gets one
  at its second copy, never a third page-local copy (design.md § App-surface
  rules). `scripts/shared-components-tests.ts` fails a new hand-built card,
  cell, empty state, tab list or shadow.
- New CSS and TSX name no font family and use only 400 and 700;
  `scripts/typography-tests.ts` and `26-one-font.spec.ts` fail otherwise.
