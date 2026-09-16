# Pattadar web-next — design system (LOCKED)

**Applies to:** `apps/web-next` only — Next.js 16, MUI 9 (CSS-variables `colorSchemes`), React 19, TypeScript.
**Peers, which this file does NOT govern and which do not govern this app:** `/design.md` (apps/web, "Bloom") and `apps/ios/design.md` (SwiftUI).
**Originating spec:** `docs/specs/2026-07-26-ux-redesign-m3.md`. That document is the design authority. **This document must never contradict it** — where this file is more specific, it is the spec applied; where the two ever disagree, the spec wins and this file is the bug.
**Component contract:** `docs/specs/2026-09-14-web-component-kit-contract.md`. Every API quoted below is the one on disk in `src/components/kit/`, not an aspiration.

## What this document is

This is the file a screen reads before it emits a line of code. It is prescriptive on purpose: it tells you which component, which variant, which token, which height, and what you may not do instead. Every rule is written as **Use X. Never Y** with the reason in the clause, because a rule without a reason gets re-litigated at the next call site.

It is not a style essay. If a rule here cannot be checked by reading a diff, running `bunx tsc --noEmit`, or looking at a 400px viewport, it does not belong in this file.

## M3 principles applied — not Google's brand copied

This app applies **Google's Material Design 3** as a *system of principles*: the one-decision-per-region emphasis ladder, tonal container roles paired with on-colors, state layers as percentages of a role color, the 4px grid, shape scale by role, elevation reserved for things that actually float, and standard/emphasized motion on the emphasized-decelerate curve. Where a rule below descends from Google's guidance it says so (M3: *Buttons*, *Color roles*, *States*, *Elevation*, *Motion*, and the Google Maps Platform control conventions).

**Pattadar owns everything that identifies it.** The palette is ours (`@pattadar/tokens`), the artwork is ours, and the product metaphors — passbook, khata, holding, parcel, survey number, extent in acres and cents, DD/MM/YYYY, `₹` in en-IN grouping — are ours. We do not ship Google's brand colors, Google's product iconography, Google Sans, or anything that would make this look like a Google product. M3 is the grammar; the vocabulary is Pattadar's.

**Plain language is an invariant, not a style.** Labels are what a farming family would say aloud. Dates are DD/MM/YYYY. Money is `₹` with en-IN grouping and no paise. That predates this file and outranks it.

---

# 1. Foundations

Everything in this section is a fact about `src/theme/` and `src/components/kit/tokens.ts`. Read those two files before you disagree with this one.

## 1.1 The color system

### Where color comes from

`@pattadar/tokens` is the single source shared with the mobile Paper theme. `src/theme/palette.ts` spreads it onto the MUI palette shape as **three complete schemes** — `light`, `dark`, `highContrast` — consumed through MUI 9's `colorSchemes` CSS-variables API with a **class** selector (`src/theme/index.tsx`), so all three ship in one stylesheet.

Use a palette **path** (`bgcolor: 'primary.container'`) or `theme.vars.palette.…` when you need a real string for a `color-mix()` operand. **Never write a hex literal in a component** — three schemes exist, a literal is correct in at most one of them, and `grep -rnE '#[0-9a-fA-F]{3,8}' src/components/kit/` is required to come back empty.

### The roles

| Role | Light | Dark | Meaning — the only thing it may be used for |
|---|---|---|---|
| `primary.main` | `brand[600]` `#1976D2` | `brand[200]` `#90CAF9` | The one decision on screen. Filled buttons, active nav pill, selection state. |
| `primary.container` / `.onContainer` | `brand[50]` / `brand[800]` | `rgba(144,202,249,.16)` / `brand[100]` | Tonal fill: the `tonal` button variant, the selection bar, brand chips, the zoom hint. |
| `secondary.main` | `gold[600]` `#B8860B` | `gold[300]` | **Gold is seasoning, never structure** (spec, Color). Wallet, premium moments, the hero gradient tail — and the focus ring. |
| `secondary.container` / `.onContainer` | `gold[100]` / `gold[800]` | translucent gold | Accent tonal surfaces only. |
| `info` / `success` / `warning` / `error` | flat tints + AA-checked `onContainer` | translucent fills + light ink | Status only. **`warning` (orange) stays reserved for tax/EC attention** — the properties domain wears gold, never orange. |
| `background.default` / `.paper` / `.neutral` | `#FFFFFF` / `#FFFFFF` / `grey[200]` | `grey[900]` / `grey[800]` / 12% grey | `paper` = a content unit. `default` = recessed chrome. `neutral` = table-head band, skeleton fill, map ground. |
| `divider` | 20% `grey[500]` | same | Hairlines. High Contrast redefines it to pure black. |

Note on hue: the spec is titled "Emerald & Gold" and fixes the *role structure* — primary/secondary, container pairs, gold as seasoning, orange reserved. The founder reset the hue anchor on the same date (`packages/tokens/src/index.ts`: "INDUSTRY-STANDARD NEUTRAL PALETTE (2026-07-26, founder decision: the Emerald & Gold green theme is removed)"), so primary is Material-standard blue and gold remains the second hue. **Take every role rule from the spec; take every hue value from `@pattadar/tokens`.** Do not reintroduce green.

**Container pairs are the M3 mechanism and they are already in the palette.** Use `bgcolor: '<role>.container'` with `color: '<role>.onContainer'`, or call `tonalSx(tone)` from the kit. **Never hand-mix an alpha for a tonal surface** — `alpha(main, 0.12)` computed against an assumed white background is exactly the bug `tonalSx` was written to delete (`components/holdingCards.tsx:77-88` mixed against a literal `#FFFFFF`, and the same chip was unreadable in dark).

**High Contrast is a first-class scheme, not a filter.** Its containers are plain white paired with plain black and it leans on a 2px border its consumers draw — `tonalSx` adds that border via `t.applyStyles('highContrast', …)`. If you invent a tonal surface by hand it will be invisible in that scheme. Use the token.

### The one gold flourish

`HeroSection tone="brand"` paints `linear-gradient(150deg, primary.darker 0%, primary.dark 60%, secondary.dark 100%)` and sets the ink for everything inside it. That is the brand's one deliberate flourish (Dashboard, Wallet). Use it there. **Never paint a gradient on a section, a card, or a table** — a gradient anywhere else is decoration sitting on content that is trying to be read.

## 1.2 Spacing — the 4px grid is law

`GAP` and `PAD` in `src/components/kit/tokens.ts` are **MUI spacing units (×8)**, not pixels.

```ts
GAP.tight    // 0.5 →  4px
GAP.control  // 1   →  8px   — between two controls in a cluster
GAP.cluster  // 1.5 → 12px   — header → controls, chip rows
GAP.block    // 2   → 16px   — between blocks inside a section
GAP.page     // 3   → 24px   — card-grid gap, controls → content
GAP.section  // 4   → 32px   — between sections (Section's default bottom gutter)

PAD.card     // 2.5 → 20px   — spec: "Card padding 20"
PAD.quiet    // 1.75→ 14px   — the filter panel's tighter inset
PAD.dialog   // 3   → 24px
```

Use these names. **Never type a raw spacing number in a view** — `mb: 1.75` in one file and `mb: 2` in the next is how three list screens ended up with three different gaps under the toolbar. The ladder is 4/8/12/16/24/32/48 and there is nothing between the steps.

## 1.3 Shape

```ts
RADIUS.control // '12px'
RADIUS.card    // '16px'
RADIUS.dialog  // '20px'   — dialogs and hero surfaces
RADIUS.pill    // '999px'  — chips, pills, tab indicator, progress bars
```

**These are literal px STRINGS and that is load-bearing.** `sx={{ borderRadius: 3 }}` does **not** mean 3px — it means `3 × theme.shape.borderRadius`, which is **12**, so it paints **36px**. That footgun has already shipped twice here (`components/tableSx.ts:35` asked for 12 and painted 24; `components/holdingCards.tsx:257` annotated "16px" and painted 32). Use `RADIUS.*`. **Never pass a number to `borderRadius`** — there is deliberately no `px()` helper to forget.

`theme.shape.borderRadius` is **12** (the spec's control radius, from `radii.lg`), not MUI's 8.

## 1.4 Elevation

**Borders and surface tint for anything at rest. Shadows only for things that actually float.**

- Resting card → `surfaceSx`: `RADIUS.card` + `1px solid divider` + `background.paper` + **`boxShadow: 'none'`**.
- Recessed chrome → `quietSurfaceSx`: `RADIUS.control` + hairline + `background.default` + `PAD.quiet`.
- Overlays → `theme.customShadows.dropdown` (menus), `.dialog` (dialogs), `.z4` / `.z8` (hover lift, map popover).

Use `surfaceSx` / `quietSurfaceSx`, or just use `<Section>`. **Never put a shadow on a resting section** — in this spec elevation means "this floats above the page", so a card wearing one is making a claim about itself that is not true. `customShadows` are scheme-adaptive through `--mui-palette-shadowChannel`; a literal `rgba(…)` shadow is wrong in dark and is a review rejection.

High Contrast replaces card elevation with a **2px solid black border** (`theme/index.tsx` names `borderStyle` explicitly, because MUI's Card ships `border: 0` and a color plus a width alone paints nothing at all).

## 1.5 Motion

```ts
motion.duration.standard   // 200ms
motion.duration.emphasized // 250ms
motion.easing              // cubic-bezier(0.2, 0, 0, 1)
```

The theme maps these onto `transitions.duration.standard` / `.complex` and `transitions.easing.easeInOut` / `.easeOut`. Spend the theme:

```tsx
transition: t.transitions.create(['transform', 'box-shadow'], {
  duration: t.transitions.duration.standard,
  easing: t.transitions.easing.easeInOut,
})
```

**Never type a duration or a cubic-bezier in a component.** A surface that claims to ride the standard duration must actually ride it.

`prefers-reduced-motion: reduce` is honoured globally in `MuiCssBaseline` (every animation and transition collapses to 0.01ms). Do not re-implement that check per component, and never build an interaction whose *meaning* depends on the animation playing.

## 1.6 Type scale

Roboto, self-hosted via `next/font/local` (400 and 700 only — nothing loads from a third-party URL, so Docker builds need no network). Intermediate weights render by synthesis, which is why heading weights cap at 700.

| Variant | Size (xs → lg) | Weight | Use |
|---|---|---|---|
| `h1` | 40 → 64 | 700 | Landing hero only. |
| `h2` | 32 → 48 | 700 | Landing / marketing sections. |
| `h4` | 20 → 24 | 700 | **Page title** — emitted as `<h1>` by `PageHeader level="page"`. |
| `h6` | 17 → 18 | 700 | **Section title** — emitted as `<h2>`/`<h3>` by `Section`, and the dialog title. |
| `subtitle2` | 14 | 600 | Selection count, dense emphasis. |
| `body1` | 16 | 400 | Prose; the map measurement figures. |
| `body2` | 14 | 400 | **The app's default content size** — field values, table cells, captions under a title. |
| `caption` | 12 | 400 | Hints, scope notes, footers. |
| `overline` | 12, uppercase | 700 | **Labels**: field labels, table headers, eyebrows, stat-tile labels. |
| `button` | 14 | 700, `textTransform: unset` | Buttons never SHOUT. |

Rules:

- **Visual size and outline depth are separate decisions.** `PageHeader level="page"` renders the `h4` *scale* as an `<h1>` *element*; `level="section"` renders the `h6` scale as `<h2>`. `component` overrides the element alone. **Never pick a heading variant to get a font size** — a screen reader navigating by heading is reading your type choices.
- **One `<h1>` per page**, and `PageHeader level="page"` is it.
- **Every figure carries `className="tnum"`** (tabular numerals, defined once in `MuiCssBaseline`). A count that re-renders as a filter moves must not jitter, and proportional digits are what make it jitter. `Field`, `KeyValueList`, `StatTile`, `CountChip`, `SelectionBar` and the map readout already do it.
- **`overline` is the label role, so a label carries no colon.** `Field` prints `EXTENT`, never `Extent:` — punctuation doing a job the type scale already does is noise.

## 1.7 State layers, focus, and touch targets

**State layers** are percentages of the role color, mixed against `transparent` so the layer is correct over any surface beneath it:

```ts
stateLayer('primary', 8)   // hover
stateLayer('primary', 12)  // focus / pressed
stateLayer('primary', 16)  // selected
stateLayer('primary', 24)  // pressed on a tonal surface
```

(M3: *States* — hover 8%, focus 12%, pressed 12%.) Use `stateLayer()`. **Never use `alpha(color, n)` against an assumed background** — it is right on one surface, in one scheme, by luck.

**Focus.** Every interactive thing composes `focusRingSx` into its own `&:focus-visible`:

```ts
focusRingSx // { outline: '2px solid', outlineColor: 'secondary.main', outlineOffset: '2px' }
```

Gold is the ring because primary is the *fill* of the thing most often focused. `.kit-focusable` exists as a global opt-in class for feature code that owns its own focusable element, but **kit primitives compose the ring themselves, so a control cannot ship without one by forgetting to opt in**. High Contrast overrides globally with a 3px primary ring, declared after `.kit-focusable` so source order lets it win.

Where an outline would be clipped — a `<tr>`, the Leaflet container — use `outlineOffset: '-2px'`. **Never remove the outline.**

**Touch.** 44×44 is the floor (spec, Accessibility gates). The theme pins `MuiIconButton` to `minWidth/minHeight: 44` *including* `sizeSmall` (which keeps its 20px glyph and gains padding). `MuiButton` is 40px medium / 32px small; a `size="compact"` `Action` keeps its 32px body and grows an invisible, centred 44px `::after` hit box, so **the control looks right and the target still passes**. Never inflate a control to reach 44 — that breaks the type scale the spec fixes.

## 1.8 The import rule

```tsx
import { Action, ListScreen, MapSurface, Section, StatusChip } from 'src/components/kit';
```

Views import from the **barrel** and never from a file inside it. Two lint rules back this: no deep imports into `src/components/kit/**` from `src/views/**`, and no bare `@mui/material/Button` or `@mui/material/IconButton` inside `src/views/**`. If the kit does not have what you need, **add it to the kit** — the moment a screen invents a primitive it has left the design system, and it will drift within a month.

---

# 2. Maps

A map is the most expensive surface in this product — it downloads a ~150 kB chunk, calls a geocoder, and is the one place a reader draws something that becomes a legal record. It gets the longest section in this document because before `MapSurface` existed, three screens drew a map and no two of them agreed on what a map *is*.

## 2.1 There is exactly one map

**Use `MapSurface` from `src/components/kit`. Never import `GeoMap` or `GeoMapLazy` in a view, and never build a second map wrapper** — `GeoMap` is the Leaflet engine and an implementation detail. `MapSurface` owns the frame, the toolbar, the states, the measurements and the keyboard story; a screen that reaches past it loses all of them at once and will re-introduce the defects listed at the end of this section.

```tsx
import { MapSurface } from 'src/components/kit';

<MapSurface
  ariaLabel={`Boundary of ${parcel.surveyNo}`}
  value={parcel.geoPoint}
  onChange={setDraft}
  mode={mode}
  onModeChange={setMode}
  allowedModes={['draw', 'pin']}
  height="standard"
  autoLocate={[village, mandal, district, 'Telangana']}
  measurements="inline"
  onClear={() => void clearBoundary()}
  empty={{
    icon: '🗺️',
    title: 'No location recorded',
    body: 'Add a pin or draw the boundary so this parcel appears on the map.',
    primaryAction: { label: 'Drop pin', onClick: () => setMode('pin') },
  }}
/>
```

## 2.2 The full props

Every prop below is on disk in `src/components/kit/MapSurface.tsx`.

| Prop | Type | Default | Contract |
|---|---|---|---|
| `ariaLabel` | `string` | — | **REQUIRED.** Names the map `role="region"`, e.g. `"Boundary of Sy 214/2"`. |
| `value` | `string \| null` | — | **Always controlled.** A GeoJSON `Point` or `Polygon` **string** — the persisted contract with `updateParcelGeo`. |
| `onChange` | `(geojson: string) => void` | — | Fires on every committed edit. |
| `mode` | `'view' \| 'pin' \| 'draw'` | `'view'` | **ONE editing axis.** Changing it **never** remounts the map. Omit it and the surface drives itself. |
| `onModeChange` | `(mode: MapMode) => void` | — | For a screen that owns the mode. |
| `allowedModes` | `MapMode[]` | `[]` | Which mode buttons are offered. `[]` hides the mode control and the map is read-only. |
| `height` | `'compact' \| 'standard' \| 'tall' \| 'fill' \| number` | `'standard'` | See 2.4. |
| `autoLocate` | `string[]` | — | Ranked geocode candidates, most specific first. **Caller-built**, never derived. |
| `controls` | `{ search?, layers?, locate?, undo?, clear? }` | see 2.5 | Which controls are offered. |
| `defaultLayer` | `'street' \| 'satellite'` | `'street'` | Read once at init by the engine. |
| `scrollZoom` | `boolean` | **`false`** | A map must never trap page scroll. |
| `onClear` | `() => void` | — | **Without it there is no Clear button at all.** |
| `clearConfirm` | `ConfirmSpec` | the built-in | Routed through `ConfirmDialog`. |
| `measurements` | `'none' \| 'inline' \| 'external'` | `'none'` | Independent of `mode`, so a read-only map can still state its area. |
| `onMeasure` | `(m: MapMeasurement) => void` | — | `{ areaSqM, perimeterM, points }`. |
| `caption` | `ReactNode` | — | One line above the toolbar, `body2` / `text.secondary`. |
| `status` | `{ tone: StatusTone; label: string }` | — | A `StatusChip` beside the caption. |
| `features` | `MapFeature[]` | — | `{ id?, geojson, title?, popup? }`. |
| `onFeatureClick` | `(id: string) => void` | — | Only fires for features the caller gave an `id`. |
| `popup` | `ReactNode` | — | **A node, never an HTML string.** |
| `empty` | `ZeroSpec` | — | Replaces the whole map chrome. See 2.6. |
| `busy` | `boolean` | `false` | Top `LinearProgress`, every control disabled. |
| `onError` | `(e: MapError) => void` | — | `kind` ∈ `chunk \| geocode \| search-empty \| parse \| tiles`. |
| `ref` | `MapSurfaceRef` | — | `{ fitTo, invalidate, focus, undoPoint, clear }`. |

**Use the `ref` to change what a map is showing. Never remount a map with a React `key`.** `ParcelDetailPage.tsx:1036` keys the map on `p.geoPoint`, so saving a boundary throws the map away and rebuilds it — the pan and zoom the reader spent a minute on, the tiles, the geocoder call that placed the view and any focus inside the map all go with it. `LocationDialog.tsx:80` keys on `mapMode`, so merely switching pin → polygon does the same, and because it remounts with `value={target.geoPoint}` while edits accumulate in a separate `geo` state, **the dialog can display one shape and save another**. `fitTo`, `invalidate`, `focus`, `undoPoint` and `clear` are commands, not a new component tree.

## 2.3 Container shape and elevation

The frame is **the kit's card** — `MapSurface` renders inside `<Section variant="card">`, so it is `RADIUS.card` (16px), a 1px `divider` hairline, `background.paper`, `PAD.card` inset, and **no shadow**. The map stage inside it is `RADIUS.card` with `overflow: hidden` and a `background.neutral` ground so the area reads as a map surface before a single tile lands.

**Use the Section frame. Never give a map its own border, radius or shadow.** The engine paints a 12px radius with a primary-coloured hairline as *inline* styles (`GeoMap.tsx:556-564`) which no class can outrank; `MapSurface` cancels it with the one `!important` in the entire kit, so that a map is not a frame nested inside a second frame.

**Never let the container jump.** The loading placeholder is `MapSkeleton` at the **same height and the same radius** as the loaded map. Before the kit, a 380px dashed box at a 24px radius holding a lone spinner became a 430px map at a 12px radius, so every detail view jumped twice — once in height, once in shape — before it settled.

## 2.4 Heights per context

```ts
MAP_HEIGHTS = { compact: 280, standard: 430, tall: 560 }
```

| Context | `height` | Why |
|---|---|---|
| Inline card inside a list or a shared panel | `"compact"` (280) | The map is one item among several; it must not push the rest of the panel below the fold. |
| Record detail panel (parcel, property) | `"standard"` (430) | The default, and the height the two detail pages already use. A boundary is legible and the page still scrolls. |
| Dialog (`LocationDialog`, "set a location") | `"standard"` (430) | The dialog is `'standard'` width (560px); a taller map fights the footer on a laptop. Below `sm` the dialog goes full-screen and the map keeps its height. |
| Full-bleed — the map **is** the screen | `"fill"` | Viewport-measured by the engine, which is the only place that can call `invalidateSize()` after the height moves. Floors at `compact` so it can never collapse to nothing. |
| Anything else | a `number` | Allowed, but justify it in review. Four heights is a scale; five is drift. |

**Use a named height. Never type a `height` into a wrapper around the map** — the engine has to be told, because Leaflet measures its own container and a CSS height it was not told about produces a grey rectangle.

## 2.5 Controls — Google Maps Platform convention, one toolbar

Every control is a real `Action` / `IconAction` in **one row above the map**, in a fixed order that a call site cannot override:

```
[ modes ] [ locate ] [ search ]  |  [ undo ] [ clear ]
```

`hasViewCluster && hasEditCluster` inserts a vertical `Divider` between the two groups. Defaults: `search` on, `layers` on, `locate` on when the map is editable, `undo` on when editable **and** the mode is `draw`, `clear` only when `onClear` was passed.

- **Use the toolbar for everything the app owns. Never let the engine draw a control.** `showSearch={false}` is passed to the engine and its footer is hidden, because the engine's own search box and buttons are ~25px hand-rolled `<input>`/`<button>` elements with no hover, focus or disabled state (`GeoMap.tsx:514-531`, `:584-593`) — and two of everything is worse than one of anything.
- **Zoom stays on the map, in its own corner** — top-left, the engine's default control pane, which is where the Google Maps Platform convention puts the zoom affordance. **Never lift zoom into the toolbar**; a zoom control that is not on the map has to be aimed at the map, and the toolbar row is already the widest thing on a 400px screen.
- **Attribution is never obscured.** Leaflet's attribution bar sits bottom-right, on the map's bottom edge. Everything this surface lays over the map is either inset by `INSET.edge` (8px) at **bottom-LEFT** — the feature popover, capped at 280px from `sm` up — or is a centred, `pointer-events: none`, auto-dismissing hint. **Never place a persistent overlay bottom-right**, and never `display: none` the attribution: the tile licence requires it, so removing it is a legal problem rather than a visual one. At `xs` the popover spans the full width 8px above the bottom edge, so **keep `popup` content to two or three short lines** — a tall popover on a phone is the one thing in this layout that can reach the attribution bar.
- **Exactly one way to switch base layer.** The switcher is Leaflet's own `L.control.layers`, top-right and uncollapsed, over two layers: **Street** (OpenStreetMap) and **Satellite** (Esri World Imagery). `controls.layers === false` hides it. It is the single control `MapSurface` deliberately does **not** take over: the engine reads `layer` once at init and exposes no `setLayer`, so a kit button here could only pretend, and a control that pretends is the defect this kit exists to remove. **Never add a second layer control**, and never wire a layer button to something that cannot change the layer.
- **Icons go in `startIcon`. Never put a glyph in a label.** The parcel page ships `✏️ Draw boundary`, `📍 Drop pin`, `🎯 Use my location` (`ParcelDetailPage.tsx:432,443,446`); a screen reader reads "pencil" in the middle of the button's name.
- **These accessible names are a hard contract:** `Draw boundary` / `Edit boundary`, `Drop pin` / `Move pin`, `Use my location`. The `Edit` and `Move` halves are not decoration — a reader who already has a shape is being offered a change, not a first act. **Never reword them.**
- **Mode buttons are a toggle set, not three verbs.** Each carries `aria-pressed`, the pressed one renders `role="secondary"` (tonal) and the rest `role="tertiary"` (outlined), inside `<Box role="group" aria-label="Map mode">`. **Never use `variant="contained"` to show that a mode is armed** (`ParcelDetailPage.tsx:426` does) — a filled button says "do this", not "this is on".
- **Clear is `role="destructive"` and always routed through `ConfirmDialog`.** Erasing a stored boundary is never a two-click act; `LocationDialog.tsx:88` allows exactly that.
- **`scrollZoom` is false and stays false.** The wheel belongs to the page — nothing is prevented — and a wheel over the map raises a centred pill for 1400ms reading *"Use + and − to zoom — the page keeps scrolling"*. **Never enable `scrollWheelZoom` by default**; `GeoMap.tsx:187` hardcoded it on, which is why scrolling past a parcel zooms its map instead of scrolling the page. The hint names the controls that actually work, because with wheel zoom off `ctrl+scroll` does not zoom either.

## 2.6 The three states

**Zero geometry.** When there is no `value`, no `features`, no `autoLocate` **and** the mode is `view`, `MapSurface` renders `<Section variant="card"><ZeroState placement="panel" …/></Section>` — **instead of** the map chrome, not decorating it.

**Use `empty` with a real action. Never draw a toolbar of live controls over a grey rectangle** — that is the "full screen of chrome for nothing" the founder's zero-state standard forbids. `mode` is part of the test on purpose: a reader who has armed drawing has *asked* for the map, and a zero state offering "Add a location" would otherwise be the thing hiding the place to add it.

**Loading.** Two layers, both designed:
1. The Leaflet chunk is lazy. Until `onReady` fires, `MapSkeleton` covers the stage at the **map's own height and radius**. **Never render a lone `CircularProgress`** — `grep -rn 'CircularProgress' src/components/kit/` must come back empty.
2. `busy` adds a top `LinearProgress` (`aria-hidden`, `zIndex: 1100`) and disables every control, and the stage carries `aria-busy`.

**Error.** Three separate failures, three separate answers:
- **Chunk failed** → a class `ChunkBoundary` catches it and renders `ZeroState variant="error"` with *"The map could not be loaded / The map component did not finish downloading. Everything else on this record is unaffected."* and a **Try again** that re-mounts the children, which re-requests the chunk. **Never let a failed map blank the tab or the record** — without the boundary the failure is React's, and it takes the whole tree.
- **Place search matched nothing** → `onError({ kind: 'search-empty' })` with *"No place matched that search."* **Never let an empty result look like a working one** — that is what the engine's own search did.
- **Geocoder or geolocation unavailable** → `kind: 'geocode'`, with copy that says what to do (*"allow location access and try again"*).

Everything reaches the screen's `onError`; route it to `useToast().error(...)`. **Never swallow a map error** — a map that quietly does nothing is indistinguishable from a map that is still thinking.

## 2.7 Keyboard reachability and focus order

Tab order is **DOM order, and the toolbar is before the map on purpose**:

1. `caption` / `status` (not focusable)
2. mode buttons (`aria-pressed`, arrow keys not required — they are buttons in a labelled group)
3. **Use my location** (`busy` → `Locating…`)
4. the search `TextField` (`aria-label="Search a place"`), **Enter submits**, then the **Search** `IconAction` (disabled with a stated reason while the box is empty)
5. **Undo point**, **Clear** (both with `disabledReason` when inert)
6. the map stage — `role="region"` with `aria-label={ariaLabel}`, and Leaflet's container takes a focus ring inset by `-2px` so the outline is not clipped
7. Leaflet's own zoom and layer controls

**`Escape` on the stage closes the feature popover.** Every kit overlay closes on Esc (spec, Accessibility gates).

**Every disabled control says why.** `Search` → *"Type a place to search for."*; `Undo point` → *"There is no point to undo yet."*; `Clear` → *"There is nothing on the map to clear."* `Action` renders the reason as a tooltip on a **focusable** wrapping span, so the explanation is not mouse-only. **Never ship a disabled control with no reason** — it reads as broken.

**A known, recorded gap:** Leaflet's marker and vertex handles are `tabindex="0" role="button"` elements with **no accessible name**, so a boundary still cannot be *reshaped* from the keyboard. This is documented in the file header of `MapSurface.tsx` so the next reader does not assume the map is finished. **Never present drawing as the only way to record a location** — `Drop pin`, `Use my location` and place search all reach the same `value`, and that is what keeps the feature operable.

## 2.8 Behaviour at 400px

- The toolbar is `actionClusterSx` — `flex-wrap: wrap`, 8px gap — so controls stack instead of overflowing. **Never put the toolbar in a `nowrap` row.**
- Search is `flexGrow: 1; minWidth: 200; maxWidth: 320`, so it takes the free space on a laptop and a full line on a phone.
- The feature popover is `left/bottom: 8px` and `right: 8px` at `xs` (full width, no `maxWidth`), dropping to `right: auto; maxWidth: 280` from `sm` up. **Never give an overlay a fixed px width wider than 368** — it will put a horizontal scrollbar on the whole page.
- The measurement readout is a wrapping flex row (Area / Perimeter / Corners) with a 24px gap.
- `height="fill"` floors at 280px so a short viewport cannot collapse the map.
- **Never let the map cause horizontal page scroll.** It is a gate: 400px viewport, no horizontal scroll on any screen.

## 2.9 Measurements and popups

- **One boundary, one number, one unit system.** `measurements="inline"` renders Area / Perimeter / Corners under the map, measured through `@pattadar/core` (`parsePolygonRing` → `ringAreaSqM` / `ringPerimM` → `toAcres` → `area()`), as **acres**. **Never print a second area readout beside it** — the engine's footer prints guntas while `ParcelDetailPage` prints cents, two unit systems for one boundary on one screen.
- With fewer than 3 points and a `Point` geometry, the readout is replaced by *"A pin marks this location. Draw a boundary to measure area and perimeter."* **Never show `0 Acres` for a pin.**
- **`popup` is a `ReactNode`, never an HTML string.** The engine's `label` prop is `bindPopup(html)` — i.e. `innerHTML` of a string a screen concatenated out of record fields (`ParcelDetailPage.tsx:383-391`), which is an injection seam. The kit renders the node in a real overlay card, which is also what gives it a close button and an Esc key.
- **Geocode cascades are the caller's.** `autoLocate` is caller-supplied because the parcel's village→mandal→district→state and the property's address→locality→city→district are different by design. **Never build a cascade inside the kit.**

---

# 3. Buttons

A button in this app used to answer four questions at every call site — which `variant`, which `color`, which `size`, and how emphatic it should be relative to whatever else is on screen — and it answered them **173 times, each time locally**. That is how one toolbar ended up with two filled buttons. Neither call site was wrong on its own; there was simply nowhere for the rule to live.

**Use `Action`, `IconAction` or `LinkAction`. State a ROLE and nothing else. Never pass `variant`, `color` or `sx` to a button in a view** — the role decides the spelling, once, in `Action.tsx`, and a lint rule forbids importing `@mui/material/Button` or `@mui/material/IconButton` under `src/views/**`.

## 3.1 The closed vocabulary

```ts
const SPELLING: Record<ActionRole, { variant; color }> = {
  primary:     { variant: 'contained', color: 'primary' },
  secondary:   { variant: 'tonal',     color: 'primary' },
  tertiary:    { variant: 'outlined',  color: 'inherit' },
  quiet:       { variant: 'text',      color: 'inherit' },
  destructive: { variant: 'text',      color: 'error'   },
};
```

`tonal` is the theme's own filled-tonal variant (`theme/index.tsx`): `primary.container` fill, `primary.onContainer` ink, 16%/24% state layers. It is M3's filled-tonal button, and it is the reason there is a real rung between "filled" and "outlined" — which is what makes one-filled-button-per-region livable.

Sizes: `default` = 40px visual / 48px touch. `compact` = 32px visual / 44px touch (via the invisible `::after` hit box). **There is no third size.** `components/holdingCards.tsx:311` ships `size="large"` on the empty-state CTA — a fourth size this kit does not have, and a scale nobody decided.

## 3.2 The action roles, one row each

| Product role | Component + props | Icon | Label | Placement | Accessible name |
|---|---|---|---|---|---|
| **Primary create** (Add parcel, New passbook) | `<Action role="primary" size="default">` — via `ListScreen primaryAction` | `startIcon={<AddIcon />}` | Verb + noun: `Add parcel`. Never `Add`, never `+`, never `New` alone | **Last** in the toolbar's right cluster, after Export | Visible label |
| **Secondary create** (Import deeds, Add from passbook) | `<Action role="secondary">` — `ListScreen secondaryActions[]` | optional `startIcon` | Verb + noun | In `extras`, left of Export | Visible label |
| **Export** | `<ExportAction>` — renders `role="tertiary"` + `FileDownloadOutlinedIcon` | fixed | `Export` (override only for a non-table export) | Immediately **before** the primary | Visible label + `aria-haspopup="menu"` / `aria-expanded` / `aria-controls` |
| **Filter toggle** | `<FilterTrigger>` — `outlined` when clean, `tonal` when active | `FilterListIcon` | `Filters` / `Filters (3)` | Third slot, after the view toggle | Label + `aria-expanded` + `aria-controls` pointing at the real panel id |
| **View toggle** | `<ViewToggle>` — `ToggleButtonGroup size="small" exclusive` | `ViewListOutlinedIcon` / `GridViewOutlinedIcon` | `List` / `Grid` | Second slot, after search | `aria-label="View mode"` on the group; `List view` / `Grid view` per button (**pinned by e2e**) |
| **Row overflow** | `<RowActionsTrigger>` → `IconAction revealOnRowHover` | `MoreVertIcon` | none | Trailing cell, right-aligned, 56px column | `Row actions` by default (**pinned by e2e**), or `Actions for {rowLabel(row)}` |
| **Card overflow** | `<CardActionsTrigger>` | `MoreVertIcon` | none | Absolute `top:8 right:8` on the card's media band, **always visible** | `Card actions` (**pinned by e2e**); menu named `Actions for {title}` |
| **Destructive** (Delete, Remove, Revoke) | `<Action role="destructive">` → red **text** button, plus a `ConfirmDialog` | usually none | Verb + noun: `Delete parcel` | Last in a detail region; first in a `SelectionBar`; never in a list toolbar | Visible label |
| **Destructive confirm** (inside its own dialog) | `variant="contained" color="error"` | none | The verb alone: `Delete`, `Discard`, `Clear` | Rightmost in the dialog footer | Visible label |
| **Cancel** | `<Action role="quiet">` | none | `Cancel` (or `Keep editing` when discarding) | Between secondary and primary in a footer | Visible label |
| **Inline link action** | `<LinkAction>` — anchor when `href`, quiet compact button when `onClick` | optional `trailingChevron` | Sentence case, e.g. `Edit ›` | Inside prose, chip rows, field values | Chevron is `aria-hidden`, so `Edit ›` is announced as `Edit` |
| **FAB** | **none exists** | — | — | — | — |

### The FAB rule

**This product has no floating action button, and the kit exports none. Never introduce one.** The reason is structural, not aesthetic: every screen here already has a permanent header row with a right-hand action cluster, and the primary create action lives there under the one-filled-button registry. A FAB is a *second* primary that the registry cannot see, it floats over the table rows it is asking you to act on, and on the 400px layout it lands on top of the last row. (The donor theme still carries `MuiFab` overrides; they are dead code, not permission.)

### Label rules

- **Name the act.** `Save parcel`, `Add passbook`, `Delete boundary`. **Never `OK`, `Submit`, `Yes`, `Done`** — a reader deciding in a dialog should be able to read only the buttons and know what happens.
- **Sentence case, no shouting.** `typography.button` sets `textTransform: 'unset'` deliberately.
- **Icons are decoration; the label is the name.** `startIcon` only. **Never put an emoji or a glyph in a label string.**
- **A busy button states its own progress**: `busy` + `busyLabel` (`Saving…`, `Exporting…`, `Locating…`). `Action` pins the width the resting label had, so **the row does not reflow mid-save**, and sets `aria-busy`.

### Accessible-name rules

- **`IconAction.label` is required and is both the `aria-label` and the tooltip title**, so the two can never disagree. **Never ship a nameless icon button** — it is an accessibility gate in the spec.
- A row trigger that names its row (`Actions for Sy 214/2`) is better than the constant — **except** where an e2e spec pins the constant. Those four pinned names are `Card actions`, `Row actions`, `List view`, `Grid view`, plus the three map names in §2.5.
- When the visible label is a glyph or is ambiguous in a list, pass `ariaLabel`.
- **Never use `<Link component="button">`.** It looks like a link, is announced as a link, and navigates nowhere. Use `LinkAction`. Real violations: `LandPropertiesPage.tsx:597` (`Edit ›`), `:600` (`Clear all`), `:712`, `ParcelDetailPage.tsx:483,844,1042`, `PropertyDetailPage.tsx:731`, `PassbookDetailPage.tsx:531,534`, `PassbooksPage.tsx:407`.
- **Never use `<Link component="label">` for a file picker.** MUI's `Link` is not a `ButtonBase`, so it is keyboard-unreachable: `PersonDialog.tsx:360` ships a "Change photo" control that a keyboard user cannot reach at all. Use `Action`'s `fileInput` prop, which renders a `Button component="label"` — still a `ButtonBase`, so it keeps `role="button"` and a tab stop — with a managed hidden `<input type="file">`.

## 3.3 The one-filled-button law, enforced

M3 (*Buttons*, emphasis) and the spec's Principle 1: **exactly one filled button per screen region; everything else is tonal, outlined or text.** This is not a review note here — it is a registry.

```tsx
<ActionRegion name="Properties toolbar">   {/* or <ActionRow name=… justify="end"> */}
  <Action role="tertiary" label="Filters"  onClick={…} />
  <Action role="primary"  label="Add parcel" icon={<AddIcon />} onClick={…} />
</ActionRegion>
```

How it works, and why each part exists:

- The **first** `role="primary"` to claim a region wins. Every later claimant renders **tonal automatically**. Dev gets one `console.error` naming the region and both labels; production gets the correct pixels in silence. The rule cannot be enforced by review because the two buttons are usually written months apart, often in different files.
- **Nesting is what makes it livable.** A region inside a region starts its own count, and a `role="primary"` in a nested region demotes at render time without even trying to claim. That is how a detail panel, an expanded row, a dialog footer or a tab body **legally** owns a primary of its own. `Section`, `HeroSection`, `PageHeader`, `ListToolbar`, `FormDialog`'s footer, `SelectionBar` and each `RecordScreen` tab panel each declare one.
- **`demote` is the explicit override**, so the outcome never depends on mount order alone. It expresses the empty-state rule once: **while a list is empty, `ZeroState` owns the one filled button and the toolbar's create action goes tonal** — `ListScreen` passes `demote={total === 0}`.
- A claim is released on unmount and is **guarded by object identity**, so a remount cannot permanently poison a region and two buttons sharing a label cannot release each other's claim.
- **`FilledButtonAudit`** is the dev-only second line of defence in `ListToolbar`: it counts `.MuiButton-contained` in the rendered cluster, because the registry can only govern buttons that came through `Action`, and a raw `<Button variant="contained">` handed in through `extras` never claims anything.

**Use `ActionRegion`/`ActionRow` around every cluster of two or more buttons, and name it after what the reader can see. Never nest a region just to get a second filled button** — if two things on one screen both look like the decision, one of them is not.

## 3.4 Worked examples of what not to do — from this codebase

**1. Two filled buttons in one toolbar.**
`views/LandPropertiesPage.tsx:518` flips Filters to `contained` the moment a filter is active:

```tsx
<Button variant={activeFilters ? 'contained' : 'outlined'} color={activeFilters ? 'primary' : 'inherit'} …>
  Filters{activeFilters ? ` (${activeFilters})` : ''}
</Button>
```

…and eight lines later, `:527` and `:531` render `<Button variant="contained" startIcon={<AddIcon />}>`. Two filled buttons in one row. **Wrong because a state control is not a decision** — the badge already says a filter is on; emphasis is not the channel for that. **Fix:** `FilterTrigger` (`outlined` → `tonal`, never `contained`) inside `ListToolbar`'s single `ActionRegion`, which makes it structurally unable to win against the create action.

**2. Emphasis used to mean "armed".**
`views/detail/ParcelDetailPage.tsx:426`: `variant={parcel.geoPoint ? 'outlined' : 'contained'}` on **Draw boundary**, sitting in the same cluster as the `contained` **Save** at `:415`. **Wrong because a filled button says "do this", not "this is on"**, and because the same region now has two. **Fix:** `aria-pressed` + `role="secondary"` on the pressed mode button, which is what `MapSurface`'s `ModeButton` does.

**3. Emoji inside the accessible name.**
`ParcelDetailPage.tsx:432` `✏️ {isPolygon ? 'Edit boundary' : 'Draw boundary'}`, `:443` `📍 …`, `:446` `🎯 Use my location`. **Wrong because the glyph is read aloud inside the button's name.** **Fix:** `icon={<PolylineOutlinedIcon />}` and a clean label.

**4. A fourth button size.**
`components/holdingCards.tsx:311` `<Button variant="contained" size="large" sx={{ mt: 2.5 }}>`. **Wrong because `large` is not in the vocabulary and `sx` re-decides spacing at the call site.** **Fix:** `ZeroState primaryAction`, which renders `role="primary"` at the default size with the placement's own rhythm.

**5. A link that is a button, and a button that is a link.**
`LandPropertiesPage.tsx:597,600` — two `<Link component="button" variant="caption">` pseudo-links. **Wrong because they are announced as links and navigate nowhere.** **Fix:** `LinkAction` — an anchor when there is an `href`, a quiet compact `Action` when there is not.

**6. A keyboard-unreachable file picker.**
`views/families/PersonDialog.tsx:360` `<Link component="label" sx={{ cursor: 'pointer' }} variant="body2">Change photo<input hidden type="file" …/></Link>`. **Wrong because MUI `Link` is not a `ButtonBase`** — no `role`, no tab stop. **Fix:** `<Action label="Change photo" fileInput={{ accept: 'image/*', onFiles }} />`.

**7. Primary before Export.**
`views/documents/DocumentsTab.tsx:665` renders the `contained` **Upload** and only then `<ExportMenu>` at `:681`; `views/PassbooksPage.tsx:220-256` pins search to the far left behind a `flexGrow` spacer and uses a 16px bottom margin instead of 12. **Wrong because the order was never decided — it was rebuilt from memory, and memory drifts.** **Fix:** `ListToolbar`, whose right cluster always renders `search → viewToggle → filters → extras → exportAction → primaryAction` **regardless of prop order**.

**8. Dead controls with no stated reason.**
`LandPropertiesPage.tsx:561` `<Button disabled={!activeFilters} onClick={clearFilters}>Clear</Button>`. **Wrong because a disabled control with no explanation reads as broken.** **Fix:** `disabledReason` — `Action` wraps a disabled button in a tooltip on a **focusable** span, so the reason is not mouse-only.

## 3.5 Menus and confirms

- **A row or card action set is `ActionItem[]` data, not JSX.** `{ key, label, icon?, danger?, disabled?, disabledReason?, hidden?, dividerBefore?, confirm?, onSelect }`. `hidden` drops an item entirely; `disabled` keeps it with a reason. **Never render a menu item the reader can never use and never explain.**
- **`confirm` is a `ConfirmSpec` and its `body` is REQUIRED** — a destructive confirm without a stated consequence does not compile. `ActionMenu` opens the dialog and only then runs `onSelect`.
- **A rejected confirm keeps the dialog OPEN and shows the error inline.** `ConfirmDialog` sets the failure and returns; it deliberately does not close in a `finally`. Esc, the backdrop and Cancel are all refused while busy.
- **The settled fiat on destructive emphasis:** the *trigger* is red **text** (`role="destructive"`); the *confirm inside its own dialog* is `contained` + `color="error"`. One region, one filled button, and the filled one is the one you are about to press.

---

# 4. Content areas

## 4.1 The page box, and what a page may assume from the shell

`src/layout/AppShell.tsx` is the shell. A routed page is rendered as:

```tsx
<Box component="main" sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
  <Toolbar />                                        {/* AppBar spacer */}
  <Box sx={{ flexGrow: 1, p: { xs: 2, sm: 3 } }}>{children}</Box>
  <Divider />
  <Box component="footer" sx={{ px: 3, py: 1.5 }}>…</Box>
</Box>
```

**What a page may assume:**

| Fact | Value |
|---|---|
| Page gutters | **16px below `sm`, 24px from `sm` up** — already applied by the shell |
| Nav drawer | 252px permanent `Drawer` from `md` up; temporary overlay below `md`. The content column is the remaining width |
| AppBar | Quiet, and the `<Toolbar/>` spacer is already placed. **The page title lives in the content, never in the bar** (spec, Top bar) |
| Footer | The shell's, with the DD/MM/YYYY note. Pages do not add one |
| `minWidth: 0` | Set on `main`, so a wide child can shrink instead of widening the column |
| Overlays | `ToastProvider` (bottom-centre), `FileViewerHost` and the assistant panel are mounted by the shell |

**Rules:**

- **Never add page gutters.** A page that opens with `<Box sx={{ p: 3 }}>` doubles the shell's inset to 48px on a laptop and 40px on a phone.
- **Never set a `maxWidth` on the page.** There is no `Container`, deliberately: this is a records product and a ten-column table needs the width. Measures are applied to *text*, not to the page — `PageHeader` caps its subtitle at 720px, `ZeroState` caps its body at 420/460px, dialogs cap at `MEASURE.form` (560) / `wide` (720) / `workbench` (1040).
- **A page's first element is a `PageHeader`.** No exceptions — it owns the `<h1>`.
- **Never add a second scroll container.** The page scrolls; only a bounded table scrollport (`stickyHeadSx`, `min(72vh, 680px)`) and a map stage own scroll of their own.

## 4.2 Vertical rhythm

One ladder, applied top to bottom, and no screen re-declares it:

| Boundary | Gap | Who owns it |
|---|---|---|
| Page header → tabs/toolbar | **12px** (`GAP.cluster`) | `PageHeader` — steps down automatically when `below` is filled |
| Tabs/toolbar → content | **24px** (`GAP.page`) | `PageHeader`'s `below` wrapper |
| Page header → content (no toolbar) | **24px** (`GAP.page`) | `PageHeader level="page"` |
| Section header → section body | **12px** (`GAP.cluster`) | `SectionHeader` |
| Section → section | **32px** (`GAP.section`) | `Section`'s default `gutter` |
| Block → block inside a section | **16px** (`GAP.block`) | the caller, using `GAP.block` |
| Control → control in a cluster | **8px** (`GAP.control`) | `actionClusterSx` |
| Card → card in a grid | **24px** (`GAP.page`) | `cardGridSx` |

**Use the components' own margins. Never add `mb` to a `Section` or a `PageHeader`** — `PageHeader`'s bottom margin already steps 24 → 12 when `below` is filled, precisely so the two never sum into a 36px gutter that is on nobody's scale. If you need to remove a gutter, pass `gutter={false}`; if you need a different one, pass a `GAP.*` value.

## 4.3 The content primitives

### Record hero — `RecordHero` / `HeroSection`

`RecordHero` is the identity block of a record page: eyebrow, `<h1>` at the `h4` scale, status pills, metadata chips, the muted summary line, attention badges, an optional editable avatar, the outage chip, and the actions cluster. It delegates to `PageHeader`, which is why a record page still has exactly one `<h1>`.

- **Correct** at the top of a record page (parcel, property, passbook), once.
- **Wrong** anywhere else. A hero inside a tab body, inside a dialog, or twice on a page is a second identity claim.
- **Pass pills as DATA** (`PillSpec[]`). **The kit derives no pill from a domain rule** — severity triage (tax overdue, EC stale, litigation) belongs to the feature, which is the only place that knows it.

`HeroSection tone="brand"` is the **dark gold-gradient slab**, and it belongs to Dashboard and Wallet only. Its verbs sit **below** the copy and left-aligned — a hero's actions belong at the end of what they act on, not opposite it. `tone="surface"` is the same geometry on the resting card surface for a hero that is not a flourish. **Never use `tone="brand"` for an ordinary section**; it sets the ink for its entire subtree and the flourish stops meaning anything if it is everywhere.

### Section block — `Section` / `SectionHeader`

```tsx
<Section title="Registration" eyebrow="Deed" actions={<Action role="quiet" label="Edit" onClick={…} />}>
  <FieldGrid fields={fields} columns={2} />
</Section>
```

Four variants, and the variant answers one question — *what is this surface for*:

| `variant` | Surface | Correct when | Wrong when |
|---|---|---|---|
| `card` (default) | `surfaceSx` + `PAD.card` (20px) | The content is a **unit** — a khata, a holding, a registration block | It is chrome, or it is a table |
| `quiet` | `quietSurfaceSx` — `background.default`, 14px, `RADIUS.control` | **Apparatus**: the filter panel, the collapsed chip row, a glance row | It is content the reader is meant to read |
| `table` | `surfaceSx` with `p: 0` | The child is a `TableContainer` — the 52px rows own the inset | Anything else; the content will touch the edge |
| `bare` | no surface, rhythm only | A headed group that is **not** a panel | You wanted a card and are avoiding the border |

- **No variant carries a shadow**, for the reason in §1.4.
- **`Section` is its own `ActionRegion`**, named after its title — which is how a detail card legally owns a primary of its own.
- **Heading level is automatic**: `h2` at depth 0, `h3` nested. **Never hand-roll `<Box><Typography fontWeight={600} fontSize={14}>`** as a section title. Every detail page grew its own version: a type scale invented at the call site, outside the theme, and emitted as a `<div>` — so a screen reader moving by heading finds nothing between the page's `h1` and the fields.

### Field rows — `Field` / `FieldGrid` / `KeyValueList` / `GlanceRow`

```tsx
<FieldGrid
  columns={2}
  fields={[
    { label: 'Survey number', value: parcel.surveyNo },
    { label: 'Extent',        value: parcel.acres,     format: 'area'  },
    { label: 'Registered on', value: deed.registeredOn, format: 'date' },
    { label: 'Consideration', value: deed.amount,       format: 'money' },
    { label: 'Address',       value: parcel.address,    span: 2 },
  ]}
/>
```

- **`FieldGrid` for a record's attributes.** 1 column below `md`, `columns` (1–3, default 2) above. Column gap 24, row gap 16. A `span` is clamped to the track count, and below `md` it collapses to `auto` — a `span 2` in a one-track grid would conjure an implicit second column, which is the overflow the grid exists to prevent.
- **`KeyValueList` for a compact readout** — spec sheets, unit conversions, calculator results. It is a real `<dl>`, term left, figure right, value track `minmax(0, auto)`. **Never use a `<Table>` for label/value pairs** (`views/tools/CalculatorTool.tsx:60` does); it is not a table of data and it announces as one.
- **`GlanceRow` for "at a glance" counters** above the fields. An item with `onActivate` is a real `ButtonBase` — 44px, focus ring, named `"3 Owners on record"`; an item without one is inert markup. **Never put an `onClick` on a `div`** — no tab stop, no ring, no name; that is the exact defect `GlanceRow` deleted.
- **The caller says what a value IS; the kit decides what it looks like.** `format` ∈ `text | date | money | area | number | phone`. The parcel page printed `p.regDate` raw while its near-twin printed the same field through `fmtDMY`, so one registration date read `2024-03-11` and the other `11/03/2024` on two screens a user opens minutes apart. **Never format a value in a view** — use `format`, or the `kit/format` helpers (`dmy`, `dmyTime`, `inr`, `inrOrDash`, `num`, `numOrDash`, `area`, `areaOrDash`, `metres`, `statusLabel`, `pluralise`, `shortName`, `dash`).
- **Absence is the em-dash `dash`, and it is one character in one place.** Zero is a *figure*: `numOrDash(0)` renders `'0'` because "0 parcels" is a fact, while `inrOrDash(0)` and `areaOrDash(0)` render `—` because a holding with no recorded value is unknown, not worthless.
- **`minmax(0, 1fr)` + `overflowWrap: 'anywhere'` are the mechanism, not a flourish.** A bare `1fr` track has a min-content floor, so one unbreakable document number pushes the grid wider than the phone and takes the page's horizontal scrollbar with it. Removing either re-opens the 400px overflow.

### Card anatomy — `CardGrid` / `MediaCard` / `ClickableCard` / `CardHero`

`cardGridSx`, declared once so the live grid and its skeleton can never drift: **xs 1 / sm 2 / lg 3 / xl 4**, 24px gap, tracks `minmax(0, 1fr)`. `CardGrid minItemWidth={n}` switches to `repeat(auto-fit, minmax(min(100%, n), 1fr))` — `min(100%, n)` and never bare `n`, because a fixed track minimum wider than the viewport is what puts a scrollbar on the whole page.

`MediaCard` top to bottom: **media band (140px)** with pills top-left over a scrim and the `⋮` top-right → **17px/600 title** (`nowrap` + ellipsis) with an optional chip → **`body2` subtitle** → **location row with the place icon** → optional chip row → optional **footer rule** with one `tnum` figure and one caption.

- **The location row always renders, dash and all.** A card that drops it is shorter than the card beside it and the row loses its baseline.
- **Whole-card click is `ClickableCard`**: `role="link"` (or `"option"` for selector grids), `tabIndex={0}`, `aria-label`, **Enter *and* Space** with `preventDefault` on Space, and `event.target === event.currentTarget` so an inner control's Enter does not bubble up and open the card behind the dialog it just opened.
- **Selection paints a 16% state layer and an INSET ring, never a border width** — geometry that changes with state moves the content inside it.
- **Correct** when a row has a photograph, a status and 3–5 attributes, and the reader is scanning. **Wrong** for more than ~6 attributes, for anything needing comparison across rows, or for bulk selection — that is a table.

### Table anatomy — `DataTable`

```tsx
<DataTable
  columns={columns}
  rows={rows}
  getRowKey={(r) => `${r.kind}-${r.id}`}
  rowLabel={(r) => r.surveyNo}
  ariaLabel="Land parcels and properties"
  onRowOpen={(r) => router.push(`/app/parcels/${r.id}`)}
  rowActions={(r) => [{ key: 'del', label: 'Delete', danger: true, confirm: {…}, onSelect: () => …}]}
/>
```

- **52px rows**, declared on the row (`ROW_HEIGHT`). **Never pass `size="small"` to a table** — the density in the pre-kit table is not a decision anyone made, it is that prop, and it contradicts the spec it was written to follow.
- **`overline` head cells**, `background.paper` sticky head inside a bounded scrollport (`min(72vh, 680px)`). The bounded container is also the second line of defence against horizontal page overflow.
- **Numerals right-aligned with `.tnum`.** `numeric: true` wins over `align` — a right-aligned figure column is not a matter of taste.
- **Columns are declared once and drive four things**: the head, the cell, the sort key and the export. `toExportCols()` always emits `fmt`, because `@pattadar/core`'s `exportCell` reads `row[key]` directly — so a computed column exports a blank cell while typechecking perfectly. **Never maintain a second `exportCols` array.**
- **A column below `hideBelow` is DROPPED, not shrunk.** Squeezing ten columns into 400px is how a table takes the page's scrollbar with it.
- **Row actions reveal on hover *and* focus-within, and are always visible under `hover: none`** (the theme's `.rowActions`). **Never hide a row control behind hover alone** — on a phone it does not exist.
- **The first cell is the open affordance** when `onRowOpen` is set: a real `Action role="quiet" size="compact"`, pulled back by its own padding so the text sits on the column's line. A column that declares its own `render` keeps it.
- **Every colSpan derives from `leadingCells + visible.length + trailingCells`.** **Never hand-count a colSpan** — `PassbookDetailPage.tsx:519-523`'s `colSpan={5}` breaks the moment a column is added.
- **Sort cycles asc → desc → unsorted**; the third press returns the screen's own order. The head cell carries `aria-sort` and the label carries the direction in words, because `aria-sort` is inconsistently read on the control the user is focused on.
- **A filtered-to-zero table answers inside its own `<tbody>`** via `emptyState` (`ZeroState placement="cell"`), never as a head with nothing under it.
- **Correct** for comparison, sorting, bulk selection, totals, or more than ~6 attributes. **Wrong** when the reader is scanning identities with photographs — that is a card grid, and that is what `ViewToggle` is for.

### Dialog anatomy — `FormDialog` / `ConfirmDialog`

Three measures and there is no fourth: `standard` **560** (the spec), `wide` **720**, `workbench` **1040** (batch import only). `RADIUS.dialog` (20px), `PAD.dialog` (24px) on title, content and actions; full-screen below `sm` by default, where the radius drops to 0 so it does not fight MUI's own full-screen rules.

Anatomy: **title (`h6` as `<h2>`) + optional subtitle + Close `IconAction`** → **content** → **footer**.

- **Footer order is fixed: secondary → cancel → primary**, right-aligned, inside one `ActionRow` — so the primary is the single filled button no matter what the body contains.
- **The primary names the act.** Never `OK`.
- **`busy` blocks Esc, the backdrop and Cancel, and removes the Close affordance** rather than leaving it inert. Nothing may close a dialog while a save is in flight.
- **`dirty` raises a discard guard** on Esc / backdrop / Cancel: *"Discard your changes? Anything you have typed will be lost."* — Keep editing (quiet) / Discard (filled red, inside its own dialog).
- **`asForm` (default true) wraps children in a `<form>`** with a hidden submit button, so **Enter submits into `primary.onClick`**. Without a default button, Enter in a multi-field form does nothing at all.
- **Group fields with `FormSection`** (overline title + rule above, first section drops the rule) and lay them out with `FormGrid` (1–4 columns, one column below `sm`). **Never invent a `caption`- or `subtitle2`-flavoured section label** — the overline and the rule are the whole vocabulary.
- **`FormErrorSummary` for validation**, with `onFocusField` so each message moves focus to its field. Validate on blur, inline (spec, Forms/dialogs).
- `ConfirmDialog` is for a **question**, not a form: `title` + required `body` + confirm. It caps at `MEASURE.form`, keeps itself open on rejection with the error inline, and refuses to close while busy.

## 4.4 Density rules, restated as numbers

| Thing | Value |
|---|---|
| Table / list row | **52px** |
| Card padding | **20px** (`PAD.card`) — card *body* blocks use 16px internally |
| Quiet panel padding | **14px** (`PAD.quiet`) |
| Dialog padding | **24px** (`PAD.dialog`) |
| Section → section | **32px** (`GAP.section`) |
| Card grid gap | **24px** (`GAP.page`) |
| Button height | 40px default / 32px compact, **44px touch floor either way** |
| Icon button | **44 × 44**, always |
| Tab | **38px** min height — the one metric in this system that is **not** a multiple of 4. It is Properties' height, kept deliberately: the alternative was re-tuning the reference screen's toolbar row to justify the grid, which is a founder decision, not a side effect of extracting a component. Do not "fix" it to 40 |
| Chip | 24px `small` / 32px `medium`, `RADIUS.pill`. Tab count badge = 24px pill |
| Stat tile | 20px inset horizontal, 14px vertical; figure 24px (`md`) / 32px (`lg`), 700, `.tnum` |
| Card media band | 140px |
| Map | 280 / 430 / 560 / fill |

## 4.5 Responsive rules down to 400px

The gate: **no horizontal page scroll at 400px, on any screen.** Everything below exists to hold that line.

- **Every flex row that holds controls wraps.** `toolbarRowSx` and `actionClusterSx` both set `flexWrap: 'wrap'`. **Never write a `nowrap` control row.**
- **Every grid track is `minmax(0, …)`.** Card grid, field grid, form grid, key-value list. A bare `1fr` cannot shrink below its longest unbreakable word.
- **Text that can be unbreakable gets `overflowWrap: 'anywhere'`** (field values, dialog titles, stat figures) or `noWrap` + ellipsis where a single line is the design (card title, subtitle, location).
- **A scrollable tab strip needs `minWidth: 0`.** A flex item's `min-width: auto` is what turns "the tabs scroll" into "the page scrolls".
- **Columns drop below their breakpoint** (`hideBelow`); they never shrink into illegibility.
- **Tables scroll inside their own container**, never the page.
- **Dialogs go full-screen below `sm`** and lose their radius.
- **`FieldGrid` and `FormGrid` collapse to one column** below `md` / `sm`; a `span` collapses with them.
- **Overlays are inset 8px on both sides at `xs`** and only take a `maxWidth` from `sm` up.
- **Stat rows and glance rows wrap**; the scope note stays attached to the row it describes.

---

# 5. States, chips and feedback

States are designed, not defaulted (spec, Principle 4). Four of them, in a fixed precedence that lives in exactly one place — `resolveAsyncStatus` / `StateSwitch`:

> **loading → error → first-run → no-results → ready**

- **Loading is a shaped skeleton, never a spinner.** `PageSkeleton`, `TableSkeleton`, `CardGridSkeleton`, `StatTilesSkeleton`, `RecordSkeleton`, `FieldGridSkeleton`, `MapSkeleton`, `SectionSkeleton`, `HeaderSkeleton`, `ToolbarSkeleton`. They take the **live** tile count, column count and view mode, so nothing pops in and nothing reflows when the rows arrive. `grep -rn 'CircularProgress' src/components/kit/` must stay empty.
- **First-run replaces the page.** Eyebrow and title only, then `ZeroState placement="page"` (a `Card`, 72px inset, 56px icon). No stats, no tabs, no toolbar, no chip row — every one of them would be describing a collection that does not exist yet.
- **No-results keeps everything mounted** and answers in place (`placement="panel"`, 48px, 44px icon, `role="status"`) with a **Clear filters** action offered only when there is genuinely something to undo. The reader needs the tab they are on and the filter they set in order to understand what they are looking at, and to take it back off.
- **An outage is not an empty result.** `isUnreachable` / `isError` outranks emptiness, renders `role="alert"`, and `UnreachableSpec` is `Omit<Partial<ZeroSpec>, 'primaryAction'>` — so **an outage offering "Add your first holding" is a compile error, not a rule**. The copy names the outage and says the records are safe: *"We could not load this / The service did not answer. Your records are safe — try again in a moment."*
- **Outage is stated once, in one vocabulary.** `DataState` is `'live' | 'unreachable'`; `ServiceStateChip` renders nothing at all for `'live'`, because an outage is news and a green "everything is fine" badge beside every title teaches readers to stop looking at the spot where the bad news appears.
- **Never offer a `Try again` wired to nothing.** The retry is absent when there is no `onRetry`.

**Chips.** `StatusChip` (tonal container fill) for a **status**; `MetaChip` / `kind="metadata"` (outlined) for **metadata**; `CountChip` for a header count (it owns its own `Chip` so it can carry `.tnum`). Tone falls back to the word map (`toneFor`) rather than to a house colour, because `<StatusChip value="disputed" />` painting neutral would be a quiet lie. A `hint` is rendered with `describeChild` **plus** a visually-hidden node, so the explanation is a *description* and is not hover-only.

**Toasts.** `useToast()` → `notify / success / error / warning / info / dismiss`. Bottom-centre (the theme's `MuiSnackbar` default), **one at a time**, auto-hide 4000ms for success and info, 6000ms for warning, and **errors persist until dismissed**.

---

# 6. The list-screen pattern

`ListScreen` is Layer 2: the entire list page — header, stats, tabs, toolbar, filter panel, collapsed chip row, selection bar, grid or table body, all four async states, and the a11y wiring — assembled once. It owns **no styling** (the falsifiability grep for a fill, radius, border, shadow or hex over the three scaffolds must stay empty) and **no domain state** (tab, filters, search and view arrive as props from the screen's own `useQueryState`).

That split is not fastidiousness. Properties computes its stat tiles from the **full** dataset while its list shows the **filtered** rows, swaps a different set of tiles in per tab, and matches its Group filter by *name* while its Passbook filter matches by *id*. A scaffold that owned any of that would have to learn all of it.

## 6.1 A new list screen, on the kit, in under 100 lines

```tsx
'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import AddIcon from '@mui/icons-material/Add';
import {
  ListScreen, StatusChip, area, exportBrand, inrOrDash, numOrDash, useQueryState,
  type Column, type FilterField,
} from 'src/components/kit';

type Holding = { id: string; surveyNo: string; village: string; status: string; acres: number; value: number };

/** A TYPE alias, never an interface: `QueryStateShape` is `Record<string, string | undefined>`,
 *  and only a type alias gets the implicit index signature that satisfies it. */
type HoldingsQuery = { tab: string; search: string; view: string; status?: string };
const DEFAULTS: HoldingsQuery = { tab: 'all', search: '', view: 'list' };

const COLUMNS: Column<Holding>[] = [
  { key: 'surveyNo', header: 'Survey no', value: (r) => r.surveyNo, sortable: true, nowrap: true },
  { key: 'village',  header: 'Village',   value: (r) => r.village,  sortable: true, hideBelow: 'sm' },
  { key: 'status',   header: 'Status',    value: (r) => r.status,
    render: (r) => <StatusChip value={r.status} /> },
  { key: 'extent',   header: 'Extent',    numeric: true, sortable: true,
    value: (r) => r.acres, exportValue: (r) => area(r.acres), render: (r) => area(r.acres) },
  { key: 'value',    header: 'Value',     numeric: true, sortable: true,
    value: (r) => r.value, exportValue: (r) => inrOrDash(r.value), render: (r) => inrOrDash(r.value) },
];

const FILTERS: FilterField<Holding[], Holding>[] = [
  {
    key: 'status',
    label: 'Status',
    placeholder: 'All statuses',
    options: (rows) => [...new Set(rows.map((r) => r.status))].map((v) => ({ value: v, label: v })),
    match: (row, value) => row.status === value,
  },
];

export function HoldingsPage({ data, isLoading, isError, onRetry }: {
  data: Holding[]; isLoading: boolean; isError?: boolean; onRetry?: () => void;
}) {
  const router = useRouter();
  const q = useQueryState<HoldingsQuery>({
    params: { tab: 'tab', search: 'q', view: 'view', status: 'status' },
    defaults: DEFAULTS,
  });
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);

  const rows = useMemo(() => {
    const needle = q.values.search.trim().toLowerCase();
    return data.filter((r) => {
      if (q.values.status !== undefined && r.status !== q.values.status) return false;
      if (needle === '') return true;
      return `${r.surveyNo} ${r.village}`.toLowerCase().includes(needle);
    });
  }, [data, q.values.search, q.values.status]);

  return (
    <ListScreen<Holding, Holding[]>
      header={{ eyebrow: 'Records', title: 'Holdings', dataState: isError ? 'unreachable' : 'live' }}
      stats={{
        scope: 'dataset',
        items: [
          { key: 'count',  label: 'Holdings', value: numOrDash(data.length) },
          { key: 'extent', label: 'Total extent', value: area(data.reduce((s, r) => s + r.acres, 0)) },
        ],
      }}
      search={{ noun: 'holdings', value: q.values.search, onChange: (v) => q.set({ search: v }) }}
      view={{ value: q.values.view === 'grid' ? 'grid' : 'list',
              onChange: (v) => q.set({ view: v }), persistKey: 'holdings.view' }}
      filters={{
        fields: FILTERS, values: q.values, ctx: data,
        onChange: (next) => q.set(next), onClear: () => q.reset(['status']),
        open: filtersOpen, onOpenChange: setFiltersOpen,
      }}
      primaryAction={{ label: 'Add holding', icon: <AddIcon />, onClick: () => setAddOpen(true) }}
      exportConfig={{ filename: 'pattadar-holdings', brand: exportBrand('Holdings') }}
      columns={COLUMNS}
      rows={rows}
      total={data.length}
      getRowKey={(r) => r.id}
      rowLabel={(r) => r.surveyNo}
      table={{ onRowOpen: (r) => router.push(`/app/parcels/${r.id}`) }}
      state={{ isLoading, isError, onRetry, isUnreachable: isError }}
      empty={{
        icon: '🌾',
        title: 'No holdings yet',
        body: 'Add your first holding to see it here.',
        primaryAction: { label: 'Add holding', onClick: () => setAddOpen(true) },
      }}
    >
      {/* Dialogs go here — rendered after the body, outside every action region. */}
      {addOpen ? <AddHoldingDialog onClose={() => setAddOpen(false)} /> : null}
    </ListScreen>
  );
}
```

That is the whole screen. What you did **not** write, and must not write again: the toolbar order, the filter panel, the collapsed "Filtered by" chip row with its removable chips, the stat row's scope note, four skeletons shaped like the live view, the first-run / no-results / outage precedence, the export column derivation, the one-filled-button accounting, the `aria-controls` wiring between the Filters button and its panel, and the 400px behaviour of all of it.

## 6.2 Rules for building on `ListScreen`

- **`total` is the collection size BEFORE search and filters.** It is what separates first-run ("you have nothing") from no-results ("nothing matches"). Passing `rows.length` collapses the two and tells an owner with an active filter that they own nothing.
- **`stats.scope` is required and load-bearing.** `'dataset'` means the tiles do not move when a filter changes and the row says so; `'filtered'` means they do. **Never leave the reader guessing which.**
- **`getRowKey` must be unique ACROSS tabs**, not just within one — a parcel id and a property id can collide in a merged "All" list, which is why the live screen keys on `` `${row.kind}-${row.id}` ``.
- **`undefined` is the only no-filter value.** Never `''`, never `'all'`.
- **Declare a filter once.** Its options, its visibility, its chip label and its row predicate live together in the `FilterField`, so the "group matches by NAME / passbook matches by ID" divergence stays a visible statement rather than a surprise in a `useMemo`.
- **`exportConfig` needs `columns`.** Both halves are required because the export reads the same array the table renders; a screen with no columns has nothing to write, and an Export button on it would be a dead control.
- **`renderBody` is code-review gated.** It replaces the body while keeping every piece of chrome, and today only a type-aware member table and a map-backed list legitimately need it.
- **Deep links use `seed` for synchronous precedence and `seedOnce` for an async lookup.** Never resolve a deep link during render — `LandPropertiesPage.tsx:227-229` does, which is why "Clear all" cannot clear a `?group=` filter: the moment the value goes back to `undefined` the condition is true again and the next render re-applies it. The deep link is not a starting point, it is a cage.
- **`TabbedScreen` is the sibling** for a tabbed page that is not a list, and **`RecordScreen`** for a record page (hero → media band → tabs → one mounted panel). In `RecordScreen`, **an outage outranks a 404**: one says the record is not yours, the other says we could not ask, and getting the order wrong tells an owner with a dead API that their land may not be theirs.

---

# 7. Before you call a screen done

Run every line. A "no" is a blocker, not a follow-up.

**Structure**
1. The page's first element is a `PageHeader` (or a scaffold that renders one), and the page has **exactly one `<h1>`**.
2. The page adds **no gutters and no `maxWidth`** of its own.
3. Every section is a `Section` with the right `variant`; no hand-rolled `Box` + `Typography` section title anywhere.
4. Gaps come from `GAP.*` / `PAD.*`; no raw spacing numbers, no `mb` bolted onto a `PageHeader` or a `Section`.

**Buttons**
5. Every button is `Action` / `IconAction` / `LinkAction`; `grep -rn "from '@mui/material/Button'\|from '@mui/material/IconButton'" src/views/` returns nothing for your files.
6. **Exactly one filled button per region.** Open the screen with the dev console visible — the registry and `FilledButtonAudit` both report; neither may fire.
7. No `<Link component="button">` and no `<Link component="label">`.
8. Every icon button has a `label`; every disabled control has a `disabledReason`; every async control has `busy` + `busyLabel`.
9. Every destructive action is red **text** with a `ConfirmDialog` whose `body` states the consequence.

**Color, shape, motion**
10. `grep -rnE '#[0-9a-fA-F]{3,8}'` over your files — empty. No `alpha()` against an assumed background; tonal surfaces come from `tonalSx` or a `container`/`onContainer` pair.
11. No numeric `borderRadius` anywhere; radii come from `RADIUS.*`.
12. No shadow on a resting surface; no literal `rgba()` shadow.
13. No hand-typed duration or easing.

**States**
14. Loading renders a **shaped skeleton** matching the live tile/column/view counts — no `CircularProgress`.
15. First-run, no-results and outage are three different states with three different sentences, in the documented precedence, and the outage state offers **no create CTA**.
16. Every mutation reports through `useToast()`; errors persist until dismissed.

**Accessibility**
17. Keyboard-only pass: every control reachable, in DOM order, with a **visible gold focus ring**; **Esc closes every overlay**; Enter submits a dialog form.
18. Nothing smaller than 44 × 44 is tappable.
19. Tables: `ariaLabel`, `rowLabel`, `aria-sort` on sorted heads, named checkboxes, named expanders.
20. Tabs: `ariaLabel` + `idPrefix`, and each panel wired with `aria-labelledby` / `aria-controls`.
21. No console errors, and no new browser tabs (founder rule).

**Data and copy**
22. No formatting in the view — `format` props and `kit/format` only. DD/MM/YYYY, `₹` en-IN, acres via `area()`, absence as `dash`.
23. Plain language a farming family reads without help; no jargon, no internal field names on screen.
24. An export, if present, reads the **same** `Column[]` the table renders.

**The three schemes and the small screen**
25. Render in **light, dark and High Contrast**: a `StatusChip` of each tone, a card, a table head, a skeleton and a stat row — nothing white-on-white, nothing invisible, every card edge present in High Contrast.
26. **400px viewport: no horizontal page scroll**, nothing clipped, every control cluster wrapped, every table scrolling inside its own container.

**Types**
27. `cd apps/web-next && bunx tsc --noEmit` — clean. No `JSX.Element` return annotations anywhere in or around the kit (the global `JSX` namespace is gone under React 19 / TS 6).
