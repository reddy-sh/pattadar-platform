# Web component kit — locked contract

> **Historical test references:** the `tests/e2e-ux` suite was retired on 2026-09-16. References to its former assertions remain in this contract as provenance for accessibility and behavior requirements; active coverage belongs in retained CI suites.

This is the binding contract for the shared component kit of `apps/web-next`. Every primitive in it is extracted from `src/views/LandPropertiesPage.tsx` — the 828-line Land & Properties screen that the founder named as the core — and from the four files it is assembled out of (`components/holdingCards.tsx`, `components/PageHeader.tsx`, `components/tableSx.ts`, `components/Skeletons.tsx`). Properties is not copied into a template; it is dissolved: every reusable idea becomes a primitive that owns exactly one decision, and Properties is then rewritten as a consumer of `ListScreen`, so the reference screen is itself the migration proof. The governing design authority is `docs/specs/2026-07-26-ux-redesign-m3.md` (Material Design 3); the root `design.md` governs the OTHER app (`apps/web`, "Bloom") and does not apply here. Nothing in this contract may be renegotiated file-by-file during implementation: the API blocks below are the interface, the implementation briefs are the specification, and the **Do not** lists are the review checklist.

**Non-negotiables, restated once so no section has to repeat them.** MUI 9 + React 19 + Next 16 app router; **zero new dependencies**. Theme tokens only — no hex literal appears anywhere in `src/components/kit/**`, and light, dark and `highContrast` must all be correct. One filled button per region. The 4px grid (4/8/12/16/24/32/48). Radius 12 controls / 16 cards / 20 dialogs / 999 pills. Shadows only on overlays; resting cards use border + surface tint. Tonal status chips, outlined metadata chips. 52px table rows with sticky heads and right-aligned tabular numerals. Designed loading, empty, no-results and error states — never a lone spinner, never a blank region. 200ms standard / 250ms emphasized motion on `cubic-bezier(0.2, 0, 0, 1)`, with `prefers-reduced-motion` respected (already global, `theme/index.tsx:111-117`). AA contrast, 44×44 touch targets, visible focus, Esc closes every overlay, no horizontal overflow at 400px, no new tabs. Filter, tab and view-mode state is URL-addressable, and Properties' `?pb=` / `?group=` / `?tab=` deep links keep working exactly.

---

## Rationale

**Why this shape.** Two layers. Layer 1 is `src/components/kit/*` primitives, and it is where *all* styling lives. Layer 2 is three scaffolds — `ListScreen`, `TabbedScreen`, `RecordScreen` — and it is pure orchestration and rhythm. The split is falsifiable rather than aspirational: `grep -nE 'bgcolor|borderRadius|border:|boxShadow|#[0-9a-fA-F]{3}' src/components/kit/{ListScreen,TabbedScreen,RecordScreen}.tsx` must return **empty**. If a scaffold needs a style, the style belongs in a primitive. That single rule is what guarantees a screen can drop from L2 to L1 without leaving the design system.

**The adoption rule is mechanical, not a matter of taste.** A screen takes a scaffold when its body is one homogeneous collection (`ListScreen`), a set of independently-owned tab bodies (`TabbedScreen`), or one record with a hero and tabs (`RecordScreen`). It drops to primitives when the body is heterogeneous panels (Dashboard), a form (Profile, StampDuty), or pure client maths (Calculator). Every scaffold additionally exposes `renderBody`, so an awkward screen keeps the chrome while owning the content instead of forking the kit.

**Domain law is never absorbed.** Tabs take a predicate, not a field name. Stats declare `scope: 'dataset' | 'filtered'` because Properties deliberately computes its tiles from the full dataset (`LandPropertiesPage.tsx:232-251`) while the list shows `shown` (`:263-280`). Pills and statuses are passed as data — `parcelPill`'s litigation-outranks-status rule and `stakePill`'s owned-renders-nothing rule stay in the feature. The row shape stays in the feature via `columns` / `renderCard`. `formatArea` from `@pattadar/core` remains the only legal renderer of acreage.

### What was grafted in, and which judge findings it closes

| Finding | Fix in this contract |
|---|---|
| First-run must replace the WHOLE page (no stats, no toolbar, header reduced to eyebrow+title) — `ListScreen` rendered header→stats→toolbar above the state switch, losing `LandPropertiesPage.tsx:431-441` | `StateSwitch` returns a `replacesPage` signal and `ListScreen` honours it: `first-run` replaces everything; `no-results` and `error` keep header, stats, tabs, toolbar and chip row mounted. Written down in the ZeroState and ListScreen briefs as a table. |
| Mechanically templated `Actions for ${rowLabel}` made the e2e-asserted names `Card actions` / `Row actions` unpreservable | `ActionMenu` takes a free-form `menuLabel`, and both triggers take an explicit `triggerLabel` that **defaults to the literal `'Row actions'` / `'Card actions'`**. `tests/e2e-ux/specs/holdings.spec.ts:105` keeps passing byte-for-byte. |
| `ViewToggle` exposed only `options?: ViewMode[]`, losing the `List view` / `Grid view` names asserted at `holdings.spec.ts:30,67` and `passbooks.spec.ts:82,86` | `ViewToggle` takes `options?: ViewToggleOption[]` with a per-option `label` that becomes both the visible text and the `aria-label`, defaulting to exactly `List` / `List view` and `Grid` / `Grid view`. |
| `format.ts` silently re-cased unit suffixes (`Sq.yd` → `Sq. yd`), rewriting two Properties stat tiles | The kit ships **no** unit re-casing. `format.ts` exposes `num()` and the screen concatenates its own suffix, so `:467` and `:469` render byte-identically. A copy change is a founder decision, not a formatting fix. |
| `MediaCard` omitted the location row when empty, changing card height | The location row **always renders** with the place icon and the em-dash fallback, matching `LandPropertiesPage.tsx:633-638`. `location` is `string | undefined`, never conditionally omitted. |
| `RADIUS` exported as bare numbers re-armed the `sx borderRadius × 8` footgun it diagnosed | `RADIUS` exports **literal px strings** (`'12px'`, `'16px'`, `'20px'`, `'999px'`). There is no `px()` helper to forget. |
| Focus ring was an opt-in `.kit-focusable` class | `focusRingSx` is composed into every interactive primitive's own `&:focus-visible`. The global class remains only as a convenience for feature code. |
| `toExportCols` lived inside a `'use client'` table module | Moved to a pure, React-free `kit/columns.ts`. `ExportAction` never imports `DataTable`. |
| `Column<T>` never stated the no-accessor fallback; `exportOnly` + `screenOnly` encoded a tri-state as two booleans | `visibility?: 'both' \| 'screen' \| 'export'`, and the precedence chain `exportValue?.(row) ?? value?.(row) ?? row[key]` is written into the type's doc comment. `toExportCols` **always** emits `fmt`, because `packages/core/src/export/exporters.ts:20` reads `row[key]` directly. |
| `ListScreenProps.table` was an eight-key `Omit<DataTableProps<T>, …>` that rots silently | Replaced by an explicitly declared `ListTableOptions<T>`. |
| `seedWhen` conflated synchronous precedence with asynchronous id→label resolution | `useQueryState` ships **two** mechanisms: a pure mount-time `seed(raw, parsed)` for `?pb=` outranking `?tab=`, and a ref-guarded `seedOnce(key, value)` that stays **pending** while the lookup returns `undefined` and is marked consumed only once it resolves — the `ListParamAlias.resolve()` semantics. This is what kills the render-phase `setFGroup` at `LandPropertiesPage.tsx:228-229`. |
| `ActionRegion` only warned; two filled buttons still shipped | `ActionRegion` is a **claim registry**: the first `role="primary"` to claim in a layout effect wins, later claims render tonal automatically, claims release on unmount, and dev logs one error naming the region and both labels. A `role="primary"` inside an INHERITED region that something else encloses auto-demotes at render time; a region declared **`root`** (an overlay, a form footer) starts a fresh count and keeps its filled button at any depth. `Action.demote` stays as the caller-driven override so demotion never depends on mount order alone. |
| `JSX.Element` return annotations do not compile under React 19 / TS 6 | **No API block in this contract annotates a return type.** Where one is unavoidable, write `React.JSX.Element`. |
| No landing/legal exclusion row | See **Exclusions** below. |
| `MediaResolver` dropped cancellation | `(fileRef: string, signal: AbortSignal) => Promise<Blob>`. |
| Deletions would break twelve call sites at once | `components/PageHeader.tsx`, `EmptyState.tsx`, `Skeletons.tsx` and `tableSx.ts` become **deprecation shims** re-exporting the kit, deleted only in the final step. |
| `selectionBarSx: borderRadius: 3` renders 24px against its own `// 12` comment (`tableSx.ts:35`) | Fixed when lifted into `tokens.ts`: `borderRadius: RADIUS.control` (`'12px'`). |
| `minmax(0, 1fr)` / `auto-fit` are the real no-overflow mechanism | `FormGrid`, `FieldGrid` and `CardGrid` use `minmax(0, 1fr)` tracks; `CardGrid`'s auto mode uses `repeat(auto-fit, minmax(min(100%, N), 1fr))`. |
| The outage state could still be handed a create CTA | `StateSwitch` accepts `errorState` as `Partial<ZeroSpec>` **minus** `primaryAction` (`UnreachableSpec`), so an outage CTA is a compile error, not a rule. |
| `shape.borderRadius` is `radii.md` = 8 while the spec mandates 12 | Fixed in the theme prerequisite, not patched around in the kit. |

**What the kit will NOT absorb.** Status-pill precedence (litigation outranks status). Unit conversion and `toAcres` round-tripping. Stat scope. Filter match keys (group by name, passbook by id). Report identity (`exportBrand`). Cascade-delete copy. The bimodal Add (Add Parcel vs the AI classifier). Parcels-only Location. Aadhaar handling. Any of these appearing inside `src/components/kit/**` is a review failure.

### Exclusions

`src/views/landing/**` and `src/views/legal/**` are **out of scope**, per the governing spec's own "Out of scope" clause. The landing page is approved, permanent-dark and brand-hex by intent, and its two `size="large"` CTAs already clear the 44px gate; the legal pages are static compliance copy. Risk is NONE — the hazard is touching them by accident during the shared-file cleanup step. No codemod, no find-and-replace, and no kit import may reach them.

### Known seams this kit does NOT close

- **The Leaflet engine.** `MapSurface` wraps `GeoMap.tsx`; it does not rewrite it. After the prerequisite patch the engine still keeps its own search implementation (disabled by `MapSurface`), its private copies of `ringAreaSqM` / `ringPerimM` (`GeoMap.tsx:83-119`) that duplicate `packages/core/src/land/landcalc.ts:73,158` — whose own comment reads "(Mirrors GeoMap.)" — and Leaflet's un-named marker/vertex buttons (`leaflet-src.js` gives every DivIcon marker `tabindex 0` and `role="button"` with no accessible name). Full keyboard editing of a boundary is explicitly deferred. `MapSurface` makes those fixes possible later; it does not deliver them now.
- **Scale.** `DataTable` renders sort affordances and calls back; the comparator, pagination and virtualisation stay with the screen. A 10k-row table still renders every row, and the PDF exporter still has no row-count guard.
- **Aadhaar copy.** `PersonDialog:611`'s "Stored masked — only last 4 digits (DPDP-2023)" contradicts the platform's recorded encrypted-storage decision. That is a **compliance statement to raise with the founder**, not a string to quietly correct inside a migration commit.
- **Destructive emphasis, settled by fiat.** Confirm buttons stay `variant="contained" color="error"` **inside** the dialog (eleven existing dialogs already agree) while the **trigger** outside is `Action role="destructive"` — red text, per the spec's literal wording. The kit writes the split down rather than churning it. Confirm with the founder rather than discovering it in review.

---

## Shared types

The file below is `apps/web-next/src/components/kit/types.ts`, verbatim. It compiles today under `bunx tsc --noEmit`. Every other kit file imports its shared types from here and declares only its own local `*Props` interface.

```ts
/**
 * The single source of truth for every cross-file type in the web-next
 * component kit.
 *
 * Extracted from `src/views/LandPropertiesPage.tsx` (the canonical list screen)
 * plus the primitives it is assembled from — `components/holdingCards.tsx`,
 * `components/PageHeader.tsx`, `components/tableSx.ts`, `components/Skeletons.tsx`,
 * `components/EmptyState.tsx`, `export/ExportMenu.tsx` and
 * `views/detail/common.tsx`.
 *
 * RULES
 *  - Types ONLY. No runtime values, no JSX, no `'use client'`.
 *  - Every other kit file imports its shared types from here and declares only
 *    its own local `*Props` interface.
 *  - Never annotate a component's return type as `JSX.Element` anywhere in the
 *    kit — under React 19 / TS 6 the global `JSX` namespace is gone. Omit the
 *    return type (inferred) or write `React.JSX.Element`.
 *
 * Contract: docs/specs/2026-09-14-web-component-kit-contract.md
 * Design authority: docs/specs/2026-07-26-ux-redesign-m3.md
 */
import type { MouseEvent, ReactNode, Ref } from 'react';
import type { Breakpoint, SxProps, Theme } from '@mui/material/styles';
import type { ExportBrand, ExportCol } from '@pattadar/core';

/* Re-exported so a kit consumer never imports the export shapes from two
 * different places (`@pattadar/core` for the type, `src/export/exporters` for
 * the writers). */
export type { ExportBrand, ExportCol };

/* ── Actions ─────────────────────────────────────────────────────────── */

/**
 * The closed button vocabulary. `variant` / `color` are never passed by a
 * consumer — the role decides:
 *   primary     → contained  + color="primary"   (ONE per ActionRegion)
 *   secondary   → tonal      + color="primary"
 *   tertiary    → outlined   + color="inherit"
 *   quiet       → text       + color="inherit"
 *   destructive → text       + color="error"     (spec: red TEXT + confirm)
 */
export type ActionRole = 'primary' | 'secondary' | 'tertiary' | 'quiet' | 'destructive';

/** `default` = 40px visual / 48px touch. `compact` = 32px visual / 44px touch. */
export type ActionSize = 'default' | 'compact';

/** A button described as DATA, so a scaffold can demote or reorder it. */
export interface ActionSpec {
  key?: string;
  label: string;
  icon?: ReactNode;
  onClick: () => void;
  role?: ActionRole;
  size?: ActionSize;
  disabled?: boolean;
  /** Rendered as a tooltip on a wrapping span when disabled. Never a dead control. */
  disabledReason?: string;
  busy?: boolean;
  busyLabel?: string;
  href?: string;
  /** Overrides the accessible name when the visible label is not enough. */
  ariaLabel?: string;
}

/** One entry in a row / card overflow menu. */
export interface ActionItem {
  key: string;
  label: string;
  icon?: ReactNode;
  /** Renders the label in `error.main`. */
  danger?: boolean;
  disabled?: boolean;
  disabledReason?: string;
  /** Dropped from the menu entirely (not rendered disabled). */
  hidden?: boolean;
  dividerBefore?: boolean;
  /** When set, ActionMenu opens a ConfirmDialog and only then runs `onSelect`. */
  confirm?: ConfirmSpec;
  onSelect: () => void | Promise<void>;
}

export interface ConfirmSpec {
  title: string;
  /** REQUIRED: a destructive confirm without a stated consequence must not compile. */
  body: ReactNode;
  confirmLabel?: string;
  busyLabel?: string;
  destructive?: boolean;
}

/**
 * The one-filled-button registry. `claimPrimary` is called in a layout effect
 * by every `role="primary"` Action; the first claimant in a region wins and
 * later claimants render tonal. The returned disposer releases the claim on
 * unmount so a remount cannot permanently poison the region.
 */
export interface ActionRegionApi {
  /** Names the region in the dev-time error, e.g. "Properties toolbar". */
  name: string;
  /**
   * Distance from the nearest ROOT region — 0 in a region declared `root` and
   * in any region nothing encloses, parent + 1 in an inherited region. Not the
   * component nesting depth: `root` resets it to 0 however deep it is mounted.
   */
  depth: number;
  /** True when this Action may render filled. Returns a release function. */
  claimPrimary: (label: string) => { granted: boolean; release: () => void };
}

/* ── Status / chips ──────────────────────────────────────────────────── */

export type StatusTone = 'neutral' | 'info' | 'success' | 'warning' | 'error' | 'brand';

/** `status` = tonal container fill; `metadata` = outlined. Spec, "Chips". */
export type ChipKind = 'status' | 'metadata';

/** A status badge passed as DATA — the kit never derives a pill from a domain rule. */
export interface PillSpec {
  label: string;
  tone: StatusTone;
  /** Explains an unobvious status on hover AND as the accessible description. */
  hint?: string;
}

/* ── Filters ─────────────────────────────────────────────────────────── */

export interface FilterOption {
  value: string;
  label: string;
}

/**
 * A filter declared ONCE and consumed by the panel, the collapsed chip row,
 * the active count and (optionally) the row predicate.
 *
 * `Ctx` is whatever the screen needs to build options and labels — normally
 * its own fetched dataset.
 *
 * NOTE for implementers: `options`, `visible`, `chipLabel` and `match` are
 * declared as METHOD signatures, not arrow properties, deliberately. Method
 * syntax stays bivariant, so a `FilterField<Holding>[]` remains assignable
 * where a wider element type is expected; arrow properties would make every
 * screen boundary a variance error.
 */
export interface FilterField<Ctx = unknown, Row = unknown> {
  key: string;
  label: string;
  /** The `value=""` option, e.g. "All statuses". `undefined` is the only no-filter value. */
  placeholder: string;
  options: FilterOption[] | ((ctx: Ctx) => FilterOption[]);
  /** Hide the control WITHOUT clearing its value (Properties hides Passbook on the Properties tab). */
  visible?(ctx: Ctx): boolean;
  /** Also clear the value whenever `visible()` goes false. Default FALSE. */
  clearWhenHidden?: boolean;
  /** Chip text when collapsed. Defaults to the matching option's label. */
  chipLabel?(value: string, ctx: Ctx): string;
  /**
   * The row predicate, declared beside the options so the "group matches by
   * NAME / passbook matches by ID" divergence stays a visible statement.
   * Omit to let the screen filter for itself.
   */
  match?(row: Row, value: string, ctx: Ctx): boolean;
  /** Cascade: these keys reset to `undefined` when this field changes (district→mandal→village). */
  clears?: string[];
  minWidth?: number;
}

/** `undefined` is the ONLY no-filter value. Never `''`, never `'all'`. */
export type FilterValues = Record<string, string | undefined>;

/* ── Tables ──────────────────────────────────────────────────────────── */

export type ColumnAlign = 'left' | 'right';

/** Where a column appears. Replaces the `exportOnly` + `screenOnly` boolean pair. */
export type ColumnVisibility = 'both' | 'screen' | 'export';

/**
 * ONE column definition drives the head, the cell, the sort AND the export.
 *
 * Value precedence, which `toExportCols()` and the default cell body both
 * follow verbatim:
 *   exportValue?.(row)  ??  value?.(row)  ??  (row as Record<string, unknown>)[key]
 *
 * This chain is load-bearing: `@pattadar/core`'s `exportCell` reads `row[key]`
 * directly and only calls `fmt` when present, so `toExportCols()` MUST always
 * emit a `fmt` or every computed column (extentLabel, typeLabel, groupName)
 * exports blank while still typechecking.
 */
export interface Column<T> {
  key: string;
  header: string;
  /** Plain value: the default cell body, the export cell and the default sort key. */
  value?: (row: T) => string | number | null | undefined;
  /** Rich cell. When set, `value` is still used for export and sorting. */
  render?: (row: T) => ReactNode;
  align?: ColumnAlign;
  /** Right-aligns and applies the `.tnum` class. */
  numeric?: boolean;
  width?: number | string;
  nowrap?: boolean;
  sortable?: boolean;
  sortValue?: (row: T) => string | number;
  /** Column is dropped from the DOM below this breakpoint — never causes overflow. */
  hideBelow?: Breakpoint;
  /** Overrides `value` for the EXPORT only. */
  exportValue?: (row: T) => string;
  /** Default 'both'. */
  visibility?: ColumnVisibility;
}

export type SortDirection = 'asc' | 'desc';
export type SortState = { key: string; dir: SortDirection } | null;

/**
 * Row identity. MUST be unique ACROSS tabs, not just within one: a parcel id
 * and a property id can collide in Properties' merged "All" list, which is why
 * the live screen keys on `` `${row.kind}-${row.id}` `` (LandPropertiesPage.tsx:611).
 */
export type RowKey<T> = (row: T) => string;

/** Names one row for assistive tech — feeds the row menu's accessible name. */
export type RowLabel<T> = (row: T) => string;

/* ── Tabs ────────────────────────────────────────────────────────────── */

export interface TabItem {
  value: string;
  label: string;
  /** Rendered as a tonal badge inside the label, never concatenated into it. */
  count?: number;
  disabled?: boolean;
}

export interface TabPanelItem extends TabItem {
  render: () => ReactNode;
}

/* ── Stats ───────────────────────────────────────────────────────────── */

/**
 * Explicit and load-bearing. Properties deliberately computes its tiles from
 * the FULL dataset (LandPropertiesPage.tsx:232-251) while the list shows the
 * filtered rows — tiles do not move when a filter changes.
 */
export type StatScope = 'dataset' | 'filtered';

/** 'md' = 24px figure (StatCard parity). 'lg' = 32px for a hero row. */
export type StatEmphasis = 'md' | 'lg';

export interface StatItem {
  key: string;
  label: string;
  value: ReactNode;
  /** Optional delta chip (spec, "Stat cards"). */
  delta?: { label: string; tone: StatusTone };
  hint?: string;
  /** Makes the tile a real button: 44px, focus ring, aria-label `${label}: ${value}`. */
  onClick?: () => void;
  href?: string;
  /** Renders •••• until revealed — Dashboard's privacy mask. */
  masked?: boolean;
}

/* ── Zero / async states ─────────────────────────────────────────────── */

export type ZeroVariant = 'first-run' | 'no-results' | 'error' | 'idle';

/** 'page' = Card, 72px padding. 'panel' = bare, 48px. 'cell' = one full-width table row. */
export type ZeroPlacement = 'page' | 'panel' | 'cell';

export interface ZeroSpec {
  /** A string renders as a large emoji; a node renders at 44px in `text.disabled`. */
  icon?: ReactNode | string;
  title: string;
  body?: ReactNode;
  primaryAction?: ActionSpec;
  secondaryAction?: ActionSpec;
}

/** Precedence is fixed: loading → error → first-run → no-results → ready. */
export type AsyncStatus = 'loading' | 'error' | 'empty' | 'ready';

/**
 * The async facts a scaffold needs. `isUnreachable` is what stops an outage
 * from rendering "Add your first holding" (the highest-severity defect on the
 * canonical screen, LandPropertiesPage.tsx:375 + :433).
 */
export interface DataStatus {
  isLoading: boolean;
  isError?: boolean;
  errorMessage?: string;
  onRetry?: () => void;
  isUnreachable?: boolean;
}

/* ── Misc vocabulary ─────────────────────────────────────────────────── */

export type ViewMode = 'list' | 'grid';

/** 'page' → h1 at the h4 scale. 'section' → h2 at the h6 scale. */
export type HeaderLevel = 'page' | 'section';

/**
 * ONE vocabulary for "the service did not answer". Replaces the five spellings
 * in the app: PageHeader's `sample` boolean, RegisteredDeedsTab's caption,
 * MembersTab's inline "· sample data", and the detail pages' "Sample data" chip.
 */
export type DataState = 'live' | 'unreachable';

export type ToastSeverity = 'success' | 'error' | 'warning' | 'info';

export interface ToastMessage {
  id: string;
  message: ReactNode;
  severity: ToastSeverity;
  action?: ActionSpec;
}

/* ── Media ───────────────────────────────────────────────────────────── */

export interface MediaSource {
  /** Direct URL (holder-photo data URLs etc.). Wins over `fileRef`. */
  url?: string;
  /** My-Drive fileRef, resolved through the injected, cached resolver. */
  fileRef?: string;
  fallbackIcon?: ReactNode | string;
  /** Alt text. Empty string marks the image as decorative. */
  alt?: string;
}

/**
 * The storage seam. The kit NEVER hardcodes `/api/gateway/storage/...`; the app
 * shell injects this. `signal` is required so a grid that unmounts mid-scroll
 * cancels its in-flight fetches.
 */
export type MediaResolver = (fileRef: string, signal: AbortSignal) => Promise<Blob>;

export type MediaRefStatus = 'idle' | 'loading' | 'ready' | 'failed';

export interface MediaRefState {
  status: MediaRefStatus;
  /** Object URL, or '' while idle/loading/failed. */
  url: string;
}

/* ── Content-area (record detail) vocabulary ─────────────────────────── */

export type FieldFormat = 'text' | 'date' | 'money' | 'area' | 'number' | 'phone';

export interface FieldSpec {
  label: string;
  value: ReactNode | string | number | null | undefined;
  format?: FieldFormat;
  /** Lets a long field take more than one grid column. */
  span?: 1 | 2 | 3;
  hint?: string;
}

export interface GlanceItem {
  key: string;
  count: number | string;
  label: string;
  /** When set the counter becomes a real 44px button named `${count} ${label}`. */
  onActivate?: () => void;
}

/** `card` = elevated unit. `quiet` = background.default + hairline. `table` = zero padding. `bare` = rhythm only. */
export type SectionVariant = 'card' | 'quiet' | 'table' | 'bare';

/** `brand` = the deliberate dark/gold flourish (Dashboard, Wallet). */
export type HeroTone = 'brand' | 'surface';

/* ── Forms ───────────────────────────────────────────────────────────── */

/** 'standard' = 560px (spec). 'wide' = 720. 'workbench' = 1040 (batch import only). */
export type DialogWidth = 'standard' | 'wide' | 'workbench';

export interface FieldError {
  field: string;
  message: string;
}

export type FilePickResult =
  | { status: 'ok'; files: File[] }
  | { status: 'cancelled' }
  | { status: 'too-many'; limit: number }
  | { status: 'too-large'; limitBytes: number }
  | { status: 'wrong-type'; accept: string };

/* ── Selection / bulk ────────────────────────────────────────────────── */

export interface RowSelectionApi {
  selected: ReadonlySet<string>;
  /** `shiftKey` extends from the last-clicked row across the VISIBLE order. */
  toggle: (id: string, shiftKey?: boolean) => void;
  toggleAll: (checked: boolean) => void;
  clear: () => void;
  isSelected: (id: string) => boolean;
  count: number;
  ids: string[];
}

export interface BulkProgress {
  done: number;
  total: number;
}

/* ── Map ─────────────────────────────────────────────────────────────── */

/** ONE editing axis, replacing GeoMap's readOnly / mode / drawMode trio. */
export type MapMode = 'view' | 'pin' | 'draw';

/** compact 280 · standard 430 · tall 560 · fill = viewport-measured. */
export type MapHeight = 'compact' | 'standard' | 'tall' | 'fill' | number;

export type MapLayer = 'street' | 'satellite';

export interface MapMeasurement {
  areaSqM: number;
  perimeterM: number;
  points: number;
}

export interface MapFeature {
  id?: string;
  /** GeoJSON STRING — the persisted contract with updateParcelGeo. */
  geojson: string;
  title?: string;
  /** ReactNode, never an HTML string: `GeoMap.label` is an injection seam. */
  popup?: ReactNode;
}

export type MapErrorKind = 'chunk' | 'geocode' | 'search-empty' | 'parse' | 'tiles';

export interface MapError {
  kind: MapErrorKind;
  message: string;
}

/** Which map controls are offered. Omitted keys take the documented default. */
export interface MapControls {
  search?: boolean;
  layers?: boolean;
  locate?: boolean;
  undo?: boolean;
  clear?: boolean;
}

/** Imperative commands, so a parent NEVER remounts a map with a React `key`. */
export interface MapSurfaceHandle {
  /** Fit to a geometry, or to the current value when omitted. */
  fitTo(geojson?: string): void;
  /** Recompute size after a container resize. */
  invalidate(): void;
  focus(): void;
  undoPoint(): void;
  clear(): void;
}

export type MapSurfaceRef = Ref<MapSurfaceHandle>;

/* ── URL state ───────────────────────────────────────────────────────── */

/** A screen's URL-addressable state: every value is a string or absent. */
export type QueryStateShape = Record<string, string | undefined>;

export type QueryHistoryMode = 'replace' | 'push';

/* ── Shared style helper aliases ─────────────────────────────────────── */

/** An sx value or a theme callback returning one — what every kit token exports. */
export type KitSx = SxProps<Theme>;
export type KitSxFn = (theme: Theme) => Record<string, unknown>;

/** The mouse handler shape kit triggers accept (menus, row actions, cards). */
export type KitMouseHandler = (event: MouseEvent<HTMLElement>) => void;
```

---

## Build order

No file may depend on a file of equal or higher order. `types.ts` is order 0 and depends on nothing. Orders 1–2 are prerequisite patches **outside** the kit; nothing token-driven can ship before they land, so they serialise the start of the work and should be done first, together, in one commit.

| # | File | Depends on |
|---|---|---|
| 0 | `apps/web-next/src/components/kit/types.ts` | — |
| 1 | `apps/web-next/src/theme/palette.ts` | — |
| 1 | `apps/web-next/src/components/GeoMap.tsx` | — |
| 2 | `apps/web-next/src/theme/index.tsx` | `theme/palette.ts` |
| 3 | `apps/web-next/src/components/kit/tokens.ts` | `types.ts`, `theme/index.tsx` |
| 3 | `apps/web-next/src/components/kit/format.ts` | — |
| 3 | `apps/web-next/src/components/kit/columns.ts` | `types.ts` |
| 3 | `apps/web-next/src/components/kit/useQueryState.ts` | — |
| 3 | `apps/web-next/src/components/kit/useFilePicker.ts` | — |
| 4 | `apps/web-next/src/components/kit/Action.tsx` | `types.ts`, `tokens.ts` |
| 4 | `apps/web-next/src/components/kit/StatusChip.tsx` | `types.ts`, `tokens.ts`, `format.ts` |
| 4 | `apps/web-next/src/components/kit/KitSkeletons.tsx` | `types.ts`, `tokens.ts` |
| 4 | `apps/web-next/src/components/kit/TabStrip.tsx` | `types.ts`, `tokens.ts` |
| 4 | `apps/web-next/src/components/kit/FieldGrid.tsx` | `types.ts`, `tokens.ts`, `format.ts` |
| 5 | `apps/web-next/src/components/kit/ToastProvider.tsx` | `types.ts`, `Action.tsx` |
| 5 | `apps/web-next/src/components/kit/ConfirmDialog.tsx` | `types.ts`, `tokens.ts`, `Action.tsx` |
| 5 | `apps/web-next/src/components/kit/SearchField.tsx` | `types.ts`, `tokens.ts`, `Action.tsx` |
| 5 | `apps/web-next/src/components/kit/Section.tsx` | `types.ts`, `tokens.ts`, `Action.tsx` |
| 5 | `apps/web-next/src/components/kit/PageHeader.tsx` | `types.ts`, `tokens.ts`, `Action.tsx`, `StatusChip.tsx` |
| 5 | `apps/web-next/src/components/kit/ListToolbar.tsx` | `tokens.ts`, `Action.tsx` |
| 5 | `apps/web-next/src/components/kit/StatTiles.tsx` | `types.ts`, `tokens.ts`, `Action.tsx`, `StatusChip.tsx` |
| 5 | `apps/web-next/src/components/kit/FilterBar.tsx` | `types.ts`, `tokens.ts`, `Action.tsx`, `StatusChip.tsx` |
| 5 | `apps/web-next/src/components/kit/FormDialog.tsx` | `types.ts`, `tokens.ts`, `Action.tsx` |
| 6 | `apps/web-next/src/components/kit/ActionMenu.tsx` | `types.ts`, `tokens.ts`, `Action.tsx`, `ConfirmDialog.tsx` |
| 6 | `apps/web-next/src/components/kit/ZeroState.tsx` | `types.ts`, `tokens.ts`, `Action.tsx`, `Section.tsx` |
| 6 | `apps/web-next/src/components/kit/ExportAction.tsx` | `types.ts`, `columns.ts`, `Action.tsx`, `ToastProvider.tsx` |
| 6 | `apps/web-next/src/components/kit/useRowSelection.tsx` | `types.ts`, `tokens.ts`, `Action.tsx`, `ToastProvider.tsx` |
| 6 | `apps/web-next/src/components/kit/TabbedScreen.tsx` | `types.ts`, `PageHeader.tsx`, `TabStrip.tsx`, `StatTiles.tsx`, `Action.tsx`, `KitSkeletons.tsx` |
| 7 | `apps/web-next/src/components/kit/DataTable.tsx` | `types.ts`, `tokens.ts`, `format.ts`, `columns.ts`, `KitSkeletons.tsx`, `ActionMenu.tsx`, `ZeroState.tsx` |
| 7 | `apps/web-next/src/components/kit/CardGrid.tsx` | `types.ts`, `tokens.ts`, `StatusChip.tsx`, `ActionMenu.tsx` |
| 7 | `apps/web-next/src/components/kit/MapSurface.tsx` | `types.ts`, `tokens.ts`, `format.ts`, `Action.tsx`, `Section.tsx`, `ConfirmDialog.tsx`, `ZeroState.tsx`, `components/GeoMap.tsx` |
| 8 | `apps/web-next/src/components/kit/ListScreen.tsx` | `types.ts`, `columns.ts`, `Action.tsx`, `TabStrip.tsx`, `KitSkeletons.tsx`, `PageHeader.tsx`, `ListToolbar.tsx`, `SearchField.tsx`, `FilterBar.tsx`, `StatTiles.tsx`, `ZeroState.tsx`, `ExportAction.tsx`, `useRowSelection.tsx`, `DataTable.tsx`, `CardGrid.tsx` |
| 8 | `apps/web-next/src/components/kit/RecordScreen.tsx` | `types.ts`, `tokens.ts`, `Action.tsx`, `StatusChip.tsx`, `TabStrip.tsx`, `KitSkeletons.tsx`, `PageHeader.tsx`, `ZeroState.tsx`, `CardGrid.tsx` |
| 9 | `apps/web-next/src/components/kit/index.ts` | everything above |

**Verification cadence.** Run `cd apps/web-next && bunx tsc --noEmit` after each order band. Never run a dev server or a build — the founder drives the stack.

---

## Files

### apps/web-next/src/theme/palette.ts

- **Purpose** — PREREQUISITE PATCH. Adds M3 `container` / `onContainer` roles to `info`, `success`, `warning` and `error` in all three schemes, and gives `highContrast` a `background.neutral` that is not white. `StatusChip`, `StatTiles`, `SelectionBar`, `ZeroState` and every tonal surface in the kit are token-driven off these roles and literally cannot be written without them. This is a pure data change: no component reads a hex literal after it lands.
- **Extracted from** — nothing; it is an addition to the existing file. The gap is at `src/theme/palette.ts:100-110` (the shared `base` object, where `info`/`success`/`warning`/`error` are spread in with no container roles), `:113-142` (`lightPalette`, where only `primary` `:119-121` and `secondary` `:124-127` carry them), `:144-179` (`darkPalette`, same), `:182-263` (`highContrastPalette`, where `:210-239` redefine the four status hues with no containers and `:247-251` set `background` to `{ paper: '#FFFFFF', default: '#FFFFFF', neutral: '#FFFFFF' }`).
- **API**

```ts
// No type augmentation is needed: PaletteColor.container / .onContainer are
// already declared at src/theme/index.tsx:43-56.
export const lightPalette: { /* …unchanged shape, four hues gain container/onContainer… */ };
export const darkPalette: { /* …idem… */ };
export const highContrastPalette: { /* …idem, plus a non-white background.neutral… */ };
```

- **Implementation brief** — Add `container` and `onContainer` to `info`, `success`, `warning` and `error` in each of the three exported palettes. Because `base` (`:100-110`) is shared by all three, the four hues must be re-spread per scheme rather than mutated in `base`.

  Light — flat tints of the existing `.main`, each verified ≥ 4.5:1 against its `onContainer`:
  `info { container: '#D8ECFB', onContainer: '#0B3A5D' }`,
  `success { container: '#DCEFE0', onContainer: '#12401D' }`,
  `warning { container: '#FDEBCF', onContainer: '#4A2F03' }`,
  `error { container: '#FBDDDC', onContainer: '#5A1512' }`.

  Dark — translucent so the chip picks up whatever surface it sits on, exactly as `darkPalette.background.neutral` already does at `:177` (`alpha(grey[500], 0.12)`):
  `info { container: 'rgba(84,163,225,0.16)', onContainer: '#B9DCF7' }`,
  `success { container: 'rgba(84,214,124,0.16)', onContainer: '#BFE6C8' }`,
  `warning { container: 'rgba(255,171,0,0.16)', onContainer: '#FFD98A' }`,
  `error { container: 'rgba(255,86,72,0.16)', onContainer: '#FFC0BA' }`.

  High contrast — `container: '#FFFFFF'`, `onContainer: '#000000'` for all four; the consumer adds a 2px border in `highContrast` (see `StatusChip`), which is what makes the chip legible on a white ground.

  Also change `highContrastPalette.background` (`:247-251`) to `{ paper: '#FFFFFF', default: '#FFFFFF', neutral: '#EFEFEF' }`. Table heads (`overrides/components/table.js:42`), the sticky-header band (`:46`) and every `Skeleton` (`skeleton.js:8`) fill with `background.neutral` and are currently white-on-white in High Contrast.

  These hex values are the ONLY new hex literals permitted anywhere in this contract, and they live in the palette, which is where hex belongs. Verify by rendering one `StatusChip` of each tone on `background.default` and again on a `Card`, in all three schemes.
- **Do not** — Do not add the container roles to the shared `base` object; `highContrastPalette` deliberately overrides all four hues and would silently inherit the light containers. Do not add a new type augmentation — `index.tsx:43-56` already declares both keys as optional on `PaletteColor`. Do not change `primary` or `secondary`; they already carry the roles from `@pattadar/tokens`. Do not make the dark containers opaque hexes: a translucent container is what lets one chip read correctly on `background.paper`, on `background.default` and over a card.

### apps/web-next/src/components/GeoMap.tsx

- **Purpose** — PREREQUISITE PATCH, engine only, no rewrite. Adds the six props `MapSurface` needs in order to own all map chrome, and makes the Leaflet accent follow a colour-scheme change. The ~600-line Leaflet engine is otherwise untouched; nothing about its behaviour changes when the new props are omitted.
- **Extracted from** — `src/components/GeoMap.tsx:25-52` (the `GeoMapProps` interface) and the engine internals it plumbs into: `:53-62` (`accent()`, sampled once at module scope), `:64-80` (`pinIcon` / `vertexIcon`, which bake the accent into HTML strings), `:126-144` (the prop destructure and defaults), `:187` (`scrollWheelZoom` hardcoded `true`), `:188` (`L.control.layers` added expanded), `:287-289` / `:371-373` / `:508-510` (the three swallowed `catch` blocks), `:507` (the zero-result search branch that does nothing), `:403` (the init effect's `[]` deps), `:439-445` (external-value re-sync, interactive mode only).
- **API**

```ts
export interface GeoMapProps {
  // ── existing props, all unchanged ──────────────────────────────────────
  value?: string | null;
  onChange?: (geojson: string) => void;
  center?: [number, number];
  zoom?: number;
  height?: number | string;
  readOnly?: boolean;
  mode?: 'marker' | 'polygon';
  drawMode?: 'off' | 'marker' | 'polygon';
  label?: string;
  showSearch?: boolean;
  geometries?: string[];
  features?: Array<{ geojson: string; popup?: string; title?: string; id?: string }>;
  onFeatureClick?: (id: string) => void;
  autoLocate?: string | string[];

  // ── NEW ────────────────────────────────────────────────────────────────
  /** Default FALSE (today hardcoded true, which makes every map a scroll trap). */
  scrollWheelZoom?: boolean;
  /** Default true. MapSurface passes false and renders its own MUI layer switcher. */
  showLayerControl?: boolean;
  /** Base layer to start on. Default 'street'. */
  layer?: 'street' | 'satellite';
  /** Fired from the three swallowed catch blocks plus the zero-result search branch. */
  onError?: (e: { kind: 'geocode' | 'search-empty' | 'parse' | 'tiles'; message: string }) => void;
  /** Bump to force the engine to re-read --mui-palette-primary-main and restyle
   *  icons + vector layers. MapSurface passes the active colour-scheme name. */
  accentKey?: string;
  /** Hands back a stable imperative handle so parents never remount with a React key. */
  onReady?: (handle: GeoMapHandle) => void;
}

export interface GeoMapHandle {
  fitTo(geojson?: string): void;
  invalidate(): void;
  focus(): void;
  undoPoint(): void;
  clear(): void;
}

export default function GeoMap(props: GeoMapProps);
```

- **Implementation brief** — Six mechanical changes.

  1. `scrollWheelZoom` — destructure with `= false` and pass into the `L.map(...)` options at `:187` in place of the literal `true`. Every existing consumer therefore stops trapping page scroll, which is the desired outcome.
  2. `showLayerControl` — destructure with `= true` and guard the `L.control.layers(...).addTo(map)` call at `:188`. Also honour `layer` (default `'street'`) by adding the Esri layer instead of OSM as the initial base when `layer === 'satellite'`.
  3. `onError` — call it, never throw, from the polygon/point parse `catch` (`:287-289`, `kind: 'parse'`), from the autoLocate geocode `catch` (`:371-373`, `kind: 'geocode'`), from the search `catch` (`:508-510`, `kind: 'geocode'`), and from the zero-result branch at `:507` (`kind: 'search-empty'`, message `'No place matched that search.'`). Keep every existing swallow semantics intact for consumers that pass no `onError`. Hold it in a ref (`onErrorRef.current = onError`, the pattern already used for `onFeatureClick` at `:144-145`) so the init effect's `[]` deps stay valid.
  4. `accentKey` — move the one-time `accent()` sample into a `useEffect` keyed on `[accentKey]`. On change: re-derive the colour, replace the pin marker's icon via `marker.setIcon(pinIcon())`, replace each vertex marker's icon, and call `setStyle({ color, fillColor })` on the polygon/polyline layers. Do not remount the map and do not re-run `autoLocate`.
  5. `onReady` — build one stable handle object in a ref, populated once the map exists, and call `onReady(handle)` exactly once from the init effect. `fitTo(geojson?)` parses the string (or falls back to the current `value`) and calls `map.fitBounds` on its bounds, using the same parser the engine already has; `invalidate()` calls `map.invalidateSize()`; `focus()` calls `map.getContainer().focus()`; `undoPoint()` and `clear()` call the same internal functions the existing footer buttons at `:584-593` already call.
  6. Leave everything else alone. Do not touch the geo maths, the Nominatim call, the height-`fill` resize loop (`:409-428`), or the container styling.
- **Do not** — Do not rewrite the engine, and do not change any existing default other than `scrollWheelZoom` (which is a deliberate defect fix). Do not delete the internal search box; `MapSurface` disables it with `showSearch={false}` and renders its own. Do not attempt to de-duplicate `ringAreaSqM` / `ringPerimM` against `@pattadar/core` in this patch — it is a separate, riskier change and is explicitly deferred. Do not make `onReady` fire on every render; it fires once. Do not add a `key` anywhere.

### apps/web-next/src/theme/index.tsx

- **Purpose** — PREREQUISITE PATCH. Fixes the invisible High-Contrast card, moves `shape.borderRadius` onto the spec's 12, wires the spec's motion tokens into `theme.transitions`, gives Button and IconButton the M3 heights so no kit control ever sets a height inline, and adds the kit focus-ring seam.
- **Extracted from** — `src/theme/index.tsx:205` (`shape: { borderRadius: radii.md }` — `radii.md` is 8, the spec mandates 12), `:209-219` (the merged `MuiCard` override whose `highContrast` branch sets `boxShadow`, `borderColor` and `borderWidth` but never `borderStyle`, so CSS renders no border at all), `:14` (`import { radii } from '@pattadar/tokens'` — `motion` is defined at `packages/tokens/src/index.ts:341-344` and imported by nobody), `:94-153` (`pattadarSeams`, the merge seam that always wins), `:98-125` (the `MuiCssBaseline` block that owns `.tnum` and `.rowActions`), `:126-146` (the `tonal` Button variant), and `src/theme/overrides/components/button.js:109-116` (small = 30px) and `:120-127` (medium sets no height and falls to MUI's ~36px).
- **API**

```ts
export default function ThemeProvider(props: { children: React.ReactNode });
```

- **Implementation brief** — Five changes, all inside the existing `createTheme` call and `pattadarSeams`.

  1. **Shape.** `shape: { borderRadius: radii.lg }` — `radii.lg` is 12, the spec's default. Import it alongside `radii.md` if the tokens package exports them separately; otherwise `radii.lg`. This changes what `sx borderRadius: N` multiplies by, so it must land BEFORE any kit file is written and every existing numeric `sx borderRadius` in `src/` must be re-read against ×12 (the kit itself uses literal px strings and is immune).
  2. **High-Contrast card.** Add `borderStyle: 'solid'` to the `highContrast` branch at `:212-217`:
     `created.applyStyles('highContrast', { boxShadow: 'none', borderStyle: 'solid', borderColor: '#000000', borderWidth: 2 })`.
  3. **Motion.** `import { motion, radii } from '@pattadar/tokens'` and add to `createTheme`:
     `transitions: { duration: { standard: 200, complex: 250, enteringScreen: 200, leavingScreen: 200 }, easing: { easeInOut: 'cubic-bezier(0.2, 0, 0, 1)', easeOut: 'cubic-bezier(0.2, 0, 0, 1)' } }`, sourcing the numbers from `motion` rather than retyping them. After this, `clickableCardSx`'s claim that it "rides the theme's standard tokens" becomes true, and no kit file ever writes a duration.
  4. **Control heights,** added to `pattadarSeams` so they win the merge:
     `MuiButton.styleOverrides.sizeMedium = { minHeight: 40 }`;
     `MuiButton.styleOverrides.sizeSmall = { minHeight: 32 }`;
     `MuiIconButton.styleOverrides.root = { minWidth: 44, minHeight: 44 }`;
     `MuiIconButton.styleOverrides.sizeSmall = { minWidth: 44, minHeight: 44, padding: 10 }`.
     Icon buttons grow 30/40 → 44 and buttons 36 → 40, which is the whole point: `Action` never sets a height.
  5. **Focus ring seam.** In the `MuiCssBaseline` block, next to `.tnum` and `.rowActions`:
     `'.kit-focusable:focus-visible': { outline: '2px solid ' + vars.palette.secondary.main, outlineOffset: 2 }`.
     The existing `.highContrast :focus-visible` rule at `:120-123` (3px primary) keeps winning by specificity. This class is a convenience for feature code; kit primitives compose `focusRingSx` into their own `&:focus-visible` and do not rely on it.
- **Do not** — Do not change `colorSchemeSelector: 'class'`, the `defaultMode`, or `ModeSync`; `tests/e2e-ux/specs/nav.spec.ts` asserts the theme menu's behaviour. Do not edit any file under `src/theme/overrides/` — that is untouched donor-kit code and `pattadarSeams` is merged on top of it (`:209`). Do not remove the `prefers-reduced-motion` guard (`:111-117`). Do not add `spacing` — MUI's default 8 is what every existing `sx` value assumes. Do not touch `packages/` (repo rule).

### apps/web-next/src/components/kit/tokens.ts

- **Purpose** — The layout constants and `sx` atoms every primitive reuses, so no component hard-codes a radius, a row height, a gap or a state-layer percentage. It exists mainly because `sx borderRadius: N` silently multiplies by `theme.shape.borderRadius` — a footgun that has already produced two live bugs — and because the two table atoms currently live in an orphan file with one of them unused.
- **Extracted from** — `src/components/tableSx.ts:10-19` (`stickyHeadSx`, lifted verbatim) and `:26-38` (`selectionBarSx`, lifted with its radius bug fixed); `src/views/LandPropertiesPage.tsx:486` (the toolbar row), `:492` (the action cluster), `:540` (the quiet filter-panel surface), `:570` (the quiet chip-row surface), `:608` (the card grid); `src/components/holdingCards.tsx:95-114` (`clickableCardSx`), `:249-267` (`StatRow`'s tinted container), `:257` (the `borderRadius: 4, // 16px` comment that actually renders 32px), `:77-88` (`pillSx`, the `color-mix` against literal `#FFFFFF` / `#16191c` that must NOT be inherited).
- **API**

```ts
import type { SxProps, Theme } from '@mui/material/styles';
import type { StatusTone } from './types';

/**
 * Spec "Shape". LITERAL PX STRINGS — never numbers. `sx borderRadius: 1`
 * multiplies by theme.shape.borderRadius; a string is passed through untouched.
 */
export const RADIUS: {
  readonly control: '12px';
  readonly card: '16px';
  readonly dialog: '20px';
  readonly pill: '999px';
};

/** Spec "Tables/lists": 52px rows. */
export const ROW_HEIGHT: 52;
/** Accessibility gate: 44x44 minimum. */
export const TOUCH: 44;
/** M3 control heights. Consumed only by the ::after hit-box, never as a height. */
export const CONTROL_H: { readonly default: 40; readonly compact: 32 };

/** MUI spacing units (x8). Spec "the 4px grid is law": 4/8/12/16/24/32/48. */
export const GAP: {
  readonly tight: 0.5;
  readonly control: 1;
  readonly cluster: 1.5;
  readonly block: 2;
  readonly page: 3;
  readonly section: 4;
};

/** Spec "Card padding 20". */
export const PAD: { readonly card: 2.5; readonly quiet: 1.75; readonly dialog: 3 };

/** Standard form measure (spec, Forms/dialogs). */
export const MEASURE: { readonly form: 560; readonly wide: 720; readonly workbench: 1040 };

/** State layers: hover 8% / focus 12% / pressed 12% / selected 16% of the role colour. */
export function stateLayer(
  role: 'primary' | 'secondary' | 'error',
  pct: 8 | 12 | 16 | 24,
): (theme: Theme) => string;

/** Tonal fill for a tone, from palette.<tone>.container / .onContainer. */
export function tonalSx(tone: StatusTone): SxProps<Theme>;

/** Resting card: border + surface tint. Shadow only where an overlay is intended. */
export const surfaceSx: SxProps<Theme>;
/** Filter panel / chip bar: background.default, hairline, radius 12, padding 14. */
export const quietSurfaceSx: SxProps<Theme>;
/** 2px secondary ring at 2px offset. Compose into any primitive's &:focus-visible. */
export const focusRingSx: SxProps<Theme>;
/** Hover lift + pressed layer + focus ring, for ClickableCard. */
export const clickableSurfaceSx: SxProps<Theme>;
/** Container-scoped scrollport + pinned head. Moved from components/tableSx.ts. */
export const stickyHeadSx: SxProps<Theme>;
/** primary.container contextual bulk-action bar (radius bug fixed). */
export const selectionBarSx: SxProps<Theme>;

/** THE card grid, declared once — the live grid and its skeleton share it. */
export const cardGridSx: SxProps<Theme>;
/** THE toolbar row: space-between, wrap, gap 12, mb 12. */
export const toolbarRowSx: SxProps<Theme>;
/** THE right-hand action cluster: flex, gap 8, wrap, align center. */
export const actionClusterSx: SxProps<Theme>;
```

- **Implementation brief** — No JSX. Every colour resolves from the theme through a callback — `(t: Theme) => ({ … (t.vars ?? t).palette… })` — using the `t.vars ?? t` idiom already used at `LandPropertiesPage.tsx:654-661`, plus `t.applyStyles('dark', …)` and `t.applyStyles('highContrast', …)` where a scheme needs a different treatment. No hex literal appears in this file.

  `RADIUS` values are strings so `borderRadius: RADIUS.card` cannot be multiplied. `GAP` and `PAD` stay MUI spacing units because that is what `sx` `gap` / `p` expect; the comment beside each records the resulting px.

  `stateLayer(role, pct)` returns `` `color-mix(in srgb, ${(t.vars ?? t).palette[role].main} ${pct}%, transparent)` ``, matching the `tonal` Button variant's 16%/24% at `theme/index.tsx:134,138`.

  `tonalSx(tone)` maps `brand` → `primary`, `neutral` → `{ bgcolor: 'background.neutral', color: 'text.primary' }`, and the four status tones → `palette[tone].container` / `.onContainer`. In `highContrast` it adds `border: '2px solid', borderColor: 'currentColor'` via `applyStyles`, because that scheme's containers are white.

  `surfaceSx`: `{ borderRadius: RADIUS.card, border: '1px solid', borderColor: 'divider', bgcolor: 'background.paper', boxShadow: 'none' }`.
  `quietSurfaceSx`: `{ borderRadius: RADIUS.control, border: '1px solid', borderColor: 'divider', bgcolor: 'background.default', p: PAD.quiet }` — the exact treatment at `LandPropertiesPage.tsx:540`.
  `focusRingSx`: `{ outline: '2px solid', outlineColor: 'secondary.main', outlineOffset: '2px' }` applied under `'&:focus-visible'` by the consumer.
  `clickableSurfaceSx`: port `holdingCards.tsx:95-114` and **fix its three defects** — replace the literal `'0 4px 12px rgba(13, 38, 25, 0.12)'` with `theme.customShadows.z4`, replace the `45%` border `color-mix` with `stateLayer('primary', 24)`, and ADD the missing `'&:focus-visible': focusRingSx`. Keep the `-2px` hover lift, the `translateY(0)` pressed state and the `action.selected` pressed layer. The transition stays `t.transitions.create([...], { duration: t.transitions.duration.standard, easing: t.transitions.easing.easeInOut })`, which is 200ms / `cubic-bezier(0.2,0,0,1)` after the theme patch.
  `stickyHeadSx`: verbatim from `tableSx.ts:10-19` — `overflowX: 'auto'`, `maxHeight: 'min(72vh, 680px)'`, `& thead th` sticky, `top: 0`, `zIndex: 2`, `bgcolor: 'background.paper'`. The container-scoped scrollport is what keeps a wide table from ever overflowing the page.
  `selectionBarSx`: from `tableSx.ts:26-38`, with `borderRadius: 3` replaced by `borderRadius: RADIUS.control`. Keep `minHeight: 52`, `px: 2`, `py: 1`, `bgcolor: 'primary.container'`, `color: 'primary.onContainer'`.
  `cardGridSx`: `{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', sm: 'repeat(2, minmax(0, 1fr))', lg: 'repeat(3, minmax(0, 1fr))', xl: 'repeat(4, minmax(0, 1fr))' }, gap: GAP.page }` — `LandPropertiesPage.tsx:608` with `minmax(0, …)` tracks so a long unbroken string can never widen a column past the viewport.
  `toolbarRowSx`: `{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: GAP.cluster, flexWrap: 'wrap', mb: GAP.cluster }` — `:486` verbatim.
  `actionClusterSx`: `{ display: 'flex', gap: GAP.control, alignItems: 'center', flexWrap: 'wrap' }` — `:492` verbatim.
- **Do not** — Do not export `RADIUS` as numbers, and do not ship a `px()` helper: an implementer will forget it. Do not port `pillSx` (`holdingCards.tsx:77-88`); its `color-mix` against literal `#FFFFFF` / `#16191c` is exactly the bug the founder called out, and `tonalSx` replaces it. Do not invent a `spacing` scale — `GAP` and `PAD` are MUI units. Do not put a `boxShadow` on any resting surface. Do not add a `zebra` or `hover` table atom; MUI's `hover` prop on `TableRow` already does it.

### apps/web-next/src/components/kit/format.ts

- **Purpose** — The only legal renderers for money, counts, dates and status labels. It kills `toLocaleString('en-IN')` at nine call sites, the three copies of the `.replace(/-/g,' ')` status transform, and the hand-written em-dash at nine more.
- **Extracted from** — `src/views/LandPropertiesPage.tsx:103-108` (`shortName`), `:292` and `:740` (`toLocaleString('en-IN')` for money), `:467` / `:469` (`toLocaleString('en-IN')` for counts), `:551` / `:577` / `:745` (the three `.replace(/-/g, ' ')` status transforms), `:631` / `:636` / `:729` / `:730` / `:731` / `:737` (the em-dash fallback); `src/views/detail/common.tsx:29-30` (`fmtDMY`), `:32-33` (`money`), `:35-36` (`dashVal`).
- **API**

```ts
import { formatArea } from '@pattadar/core';

/** The one em-dash fallback. */
export const dash: '—';

/** Rupees, en-IN, no decimals, no symbol duplication. Render inside a .tnum element. */
export function inr(n: number | null | undefined): string;
/** inr(), or the em-dash for null / undefined / 0. */
export function inrOrDash(n: number | null | undefined): string;

/** Plain en-IN integer grouping. NO unit suffix is ever appended. */
export function num(n: number | null | undefined): string;
export function numOrDash(n: number | null | undefined): string;

/** DD/MM/YYYY — the plain-language invariant. Accepts an ISO string or a Date. */
export function dmy(v: string | Date | null | undefined): string;
/** DD/MM/YYYY, HH:mm. */
export function dmyTime(v: string | Date | null | undefined): string;

/** 'for-sale' -> 'For sale'. Replaces the three inline .replace(/-/g,' ') sites. */
export function statusLabel(v: string | null | undefined): string;
export function titleCase(v: string): string;

/** Acres -> "N Acres M Cents". Re-export so no view imports formatArea directly. */
export { formatArea as area };
export function areaOrDash(acres: number | null | undefined): string;

/** First two words, ellipsis if more, hard-truncated at `max` (default 25). */
export function shortName(v: string, max?: number): string;

/** pluralise(2, 'parcel') -> '2 parcels'; pluralise(1, 'property', 'properties'). */
export function pluralise(n: number, one: string, many?: string): string;

/** Metres -> '820 m' / '1.24 km'. Square metres -> acres via core. */
export function metres(m: number | null | undefined): string;
```

- **Implementation brief** — Pure functions. No React, no `'use client'`, no imports beyond `@pattadar/core`.

  `inr(n)` → `` `₹${Math.round(n).toLocaleString('en-IN')}` ``; `inrOrDash` returns `dash` for `null`, `undefined`, `NaN` or `0`, matching `:740`'s `r.value ? … : '—'`.
  `num(n)` → `n.toLocaleString('en-IN')`, nothing else.
  `dmy` accepts `'YYYY-MM-DD'`, a full ISO timestamp, or a `Date`; returns `dash` for empty, and returns the input unchanged if it does not parse (never `Invalid Date`). Reuse the exact semantics of `detail/common.tsx:29-30`.
  `statusLabel(v)` → `v.replace(/[-_]/g, ' ')` then upper-case the first character only. `'for-sale'` → `'For sale'`, `'disputed'` → `'Disputed'`. This is a deliberate, founder-visible casing improvement over the current all-lowercase chips; the four affected strings are `owned / for-sale / sold / disputed`.
  `shortName` is `LandPropertiesPage.tsx:103-108` verbatim, with `max` defaulted to 25.
  `area` is a re-export of `@pattadar/core`'s `formatArea` — the kit never re-implements land maths.
- **Do not** — **Do not re-case unit suffixes.** `'Sq.yd'` and `'sq.ft'` at `LandPropertiesPage.tsx:467,469` render exactly as they do today; the screen concatenates its own suffix onto `num()`. Changing them is a copy change and needs the founder, not a formatting commit. Do not add a `formatArea` of your own. Do not make `inr` return a `ReactNode` — it returns a string, and the `.tnum` class is applied by the component. Do not let `dmy` ever emit `'Invalid Date'` or `'NaN'`.

### apps/web-next/src/components/kit/columns.ts

- **Purpose** — The pure, React-free bridge between a `Column<T>[]` definition and everything derived from it: the cell value, the sort key and the export columns. It is a separate file precisely so `ExportAction` never has to import the `'use client'` table module to reach a pure function.
- **Extracted from** — `src/views/LandPropertiesPage.tsx:283-294` (`exportCols`) and `:694-704` + `:710-752` (the `TableCell` head and body) — the same ten columns declared twice, already disagreeing in shape; and `packages/core/src/export/exporters.ts:20-24` (`exportCell`, which reads `row[c.key]` directly and only calls `fmt` when present).
- **API**

```ts
import type { Column, ExportCol, SortState } from './types';

/**
 * THE value precedence chain, used by the default cell body, the sort key and
 * the export cell alike:
 *   exportForExport ? column.exportValue?.(row) : undefined
 *     ?? column.value?.(row)
 *     ?? (row as Record<string, unknown>)[column.key]
 */
export function columnValue<T>(column: Column<T>, row: T, forExport?: boolean): string;

/** The sort key: column.sortValue ?? column.value ?? row[key]. */
export function columnSortValue<T>(column: Column<T>, row: T): string | number;

/** Columns rendered on screen, in declaration order (visibility !== 'export'). */
export function screenColumns<T>(columns: Column<T>[]): Column<T>[];

/**
 * THE single source of truth for exports. Drops visibility 'screen', keeps
 * 'export' and 'both', preserves declaration order, and ALWAYS emits `fmt`.
 */
export function toExportCols<T>(columns: Column<T>[]): ExportCol<T>[];

/** Stable comparator built from one column. Screens may ignore it. */
export function compareBy<T>(columns: Column<T>[], sort: SortState): ((a: T, b: T) => number) | null;
```

- **Implementation brief** — No React import, no `'use client'`, no MUI import. `columnValue` returns a string: `null` / `undefined` become `''` (the caller decides whether to substitute `dash`); numbers are `String(n)`.

  `toExportCols` maps each surviving column to `{ key: column.key, title: column.header, fmt: (_raw, row) => columnValue(column, row, true) }`. **The `fmt` is unconditional and non-negotiable.** `exportCell` reads `row[c.key]` and only calls `fmt` when present, so a computed column — Properties has four: `extentLabel`, `typeLabel`, `passbook`, `groupName` — exports blank without it while typechecking perfectly. That is the failure mode this function exists to prevent.

  `compareBy` returns `null` when `sort` is `null` or names an unknown column. Numbers compare numerically, strings with `localeCompare(undefined, { numeric: true, sensitivity: 'base' })` so `Sy 9` sorts before `Sy 10`. `dir === 'desc'` negates.
- **Do not** — Do not put these functions in `DataTable.tsx`. Do not make `fmt` conditional. Do not import anything from `src/export/exporters` here — the `ExportCol` type comes from `./types`, which re-exports it from `@pattadar/core`. Do not sort inside the kit's table; sorting is presentational there and the screen owns the comparator.

### apps/web-next/src/components/kit/useQueryState.ts

- **Purpose** — URL-addressable screen state for tab, view, search and every filter, with two distinct deep-link mechanisms. This is the file that both preserves `?pb=` / `?group=` / `?tab=` and kills the render-phase `setState` that makes a deep-linked group filter permanently unclearable.
- **Extracted from** — `src/views/LandPropertiesPage.tsx:116-118` (the three raw params), `:119-121` (the tab `useState` initializer, where `?pb=` outranks `?tab=`), `:128-132` (the `fGroup` / `fPb` initializers), and — the bug — `:227-229`: `const g0Name = g0 ? gname.get(g0) : undefined; if (g0Name && !fGroup) setFGroup(g0Name);` runs **during render**, so after "Clear all" the condition is true again and the group filter immediately re-applies. Also `:254` (`activeFilters`) and `:255-261` (`clearFilters`). Nothing in the current screen writes any of it back to the URL.
- **API**

```ts
'use client';
import type { QueryHistoryMode, QueryStateShape } from './types';

export interface QueryStateOptions<S extends QueryStateShape> {
  /** state key -> query param name. A key omitted here is local-only, never in the URL. */
  params: Partial<Record<keyof S, string>>;
  /** Values when the URL says nothing. A key equal to its default is REMOVED from the query. */
  defaults: S;
  /**
   * Cross-field precedence, evaluated ONCE against the mount-time query string.
   * Pure: it must not call setState and must not read anything asynchronous.
   * Properties: (raw) => (raw.pb ? { tab: 'parcels', passbook: raw.pb } : {})
   */
  seed?: (raw: Readonly<Record<string, string>>, parsed: S) => Partial<S>;
  /** 'replace' (default) keeps Back meaning "previous page"; 'push' for tab changes. */
  history?: QueryHistoryMode;
  /** Keys read from the URL but never written back. Rare. */
  readOnlyKeys?: (keyof S)[];
  /** Debounce before the URL is rewritten. Default 150ms. */
  writeDelayMs?: number;
}

export interface QueryState<S extends QueryStateShape> {
  values: S;
  /** Merge a patch. `undefined` clears that key. Marks every patched key touched. */
  set: (patch: Partial<S>) => void;
  /** Reset the listed keys (or every non-default key) to their defaults. Marks them touched. */
  reset: (keys?: (keyof S)[]) => void;
  /**
   * Apply a deep-linked value ONCE, after an async lookup resolves.
   * Safe to call from an effect on EVERY render. Semantics:
   *  - value === undefined  -> the alias stays PENDING and is retried next render
   *  - already applied      -> no-op
   *  - user touched the key -> no-op, permanently
   *  - otherwise            -> applies, marks consumed, strips the source param
   */
  seedOnce: <K extends keyof S>(key: K, value: S[K] | undefined) => void;
  /** The MOUNT-TIME raw query value for a param — the input to a seedOnce lookup. */
  rawParam: (param: string) => string | undefined;
  /** Keys differing from their default. Feeds the Filters button badge. */
  activeCount: number;
  /** False until the first paint has reconciled the URL; scaffolds skip write-back until true. */
  hydrated: boolean;
}

export function useQueryState<S extends QueryStateShape>(
  options: QueryStateOptions<S>,
): QueryState<S>;
```

- **Implementation brief** — Built on `useSearchParams` and `useRouter` re-exported by `src/routes/hooks` (which are `next/navigation`'s, see `src/routes/hooks/use-router.js` and `use-search-params.js`).

  **Mount.** Snapshot the raw query into a ref exactly once (`useRef` + a lazy initializer), so `rawParam` keeps answering about the URL the user arrived on even after write-back has rewritten it. Compute the initial state in a `useState` initializer — **never during render** — as: start from `defaults`, overlay each mapped param present in the URL, then overlay `seed(rawSnapshot, parsed)`. `seed` is called once, inside that initializer, and is pure.

  **Two refs guard the two failure modes.** `seededRef: Record<string, true>` records which keys `seedOnce` has already applied. `touchedRef: Record<string, true>` records which keys `set` / `reset` have modified. `seedOnce(key, value)` returns immediately if `value === undefined` (pending — it will be called again on the next render, which is the whole point for the `?group=<id>` → group NAME lookup that only resolves after the query lands), or if `seededRef[key]`, or if `touchedRef[key]`. Otherwise it sets the value, sets `seededRef[key]`, and drops the source param from the mount snapshot. **`touchedRef` is why "Clear all" finally sticks.**

  **Write-back.** One effect, debounced by `writeDelayMs` (150), builds the next query string from `values` — omitting any key whose value equals its default, is `undefined`, or is listed in `readOnlyKeys` — and calls `router.replace(...)` or `router.push(...)` with `{ scroll: false }` so a filter change never jumps the page. Skip entirely while `hydrated` is false. Preserve any query param the hook does not own (the screen may share the URL with other features). Set `hydrated` true in a `useEffect` on the first commit.

  **Stability.** Hold `options` in a ref and read it inside the callbacks, so a caller passing an inline object literal cannot re-seed or re-subscribe on every render. `set`, `reset`, `seedOnce` and `rawParam` must be referentially stable (`useCallback` with `[]`).

  **Properties' exact usage,** which must work unchanged:

```ts
const q = useQueryState({
  params: { tab: 'tab', view: undefined, q: undefined, kind: 'kind', status: 'status',
            stake: 'stake', group: 'group', pb: 'pb' },
  defaults: { tab: 'all', view: 'grid', q: '', kind: undefined, status: undefined,
              stake: undefined, group: undefined, pb: undefined },
  seed: (raw) => (raw.pb ? { tab: 'parcels', pb: raw.pb } : {}),
  history: 'replace',
});
// ?group=<id> resolves to a group NAME only after the groups query lands:
useEffect(() => { q.seedOnce('group', g0 ? gname.get(g0) : undefined); });
```

- **Do not** — Do not call `setState` during render, ever; that is the bug this file deletes. Do not merge `seed` and `seedOnce` into one mechanism — one is synchronous precedence, the other is an asynchronous lookup, and conflating them forces the screen to gate the synchronous case on data it does not need. Do not treat a `seedOnce(key, undefined)` as consumed. Do not debounce search text here; `SearchField` owns that. Do not use `router.push` by default — Back must keep meaning "previous page". Do not write a key whose value equals its default; clean URLs stay clean.

### apps/web-next/src/components/kit/useFilePicker.ts

- **Purpose** — The hidden-input dance, extracted: a hook any button or menu item can call, with caps, a discriminated result and no page-level DOM input left lying in the JSX.
- **Extracted from** — `src/views/LandPropertiesPage.tsx:143-144` (the two refs), `:321-335` (`onCoverFile`, including the `e.target.value = ''` reset at `:323`), `:344-350` (the menu item that clicks the hidden input), `:819` (the bare `<input type="file" hidden>` at page level).
- **API**

```ts
'use client';
import type { ReactNode } from 'react';
import type { FilePickResult } from './types';

export interface FilePickerOptions {
  accept?: string;
  multiple?: boolean;
  maxFiles?: number;
  maxBytes?: number;
}

export interface FilePicker {
  /** Opens the OS picker and resolves with the outcome. Never rejects. */
  pick: () => Promise<FilePickResult>;
  /** Mount once per screen. Renders the managed hidden input. */
  element: ReactNode;
}

export function useFilePicker(options?: FilePickerOptions): FilePicker;
```

- **Implementation brief** — One `useRef<HTMLInputElement>`; `element` is a single `<input type="file" hidden accept={accept} multiple={multiple} ref={ref} onChange={…} />`. `pick()` stores the promise's `resolve` in a ref, sets `ref.current.value = ''` (so re-picking the same file re-fires `change` — the reason `:323` exists), then calls `ref.current.click()`.

  On `change`: if no files, resolve `{ status: 'cancelled' }`. Then enforce, in this order, `maxFiles` → `{ status: 'too-many', limit }`, `maxBytes` (per file, summed if `multiple`) → `{ status: 'too-large', limitBytes }`, `accept` extension/MIME mismatch → `{ status: 'wrong-type', accept }`. Otherwise `{ status: 'ok', files }`. Also resolve `{ status: 'cancelled' }` on a `window` `focus` event that arrives with no `change` within ~500ms, so a dismissed OS dialog never leaves a promise hanging.

  The hook **does not toast**. The caller owns the copy and the severity — which is precisely why the 10-file cap currently toasts `'info'` in one file (`DocumentsTab:418-421`) and `'warning'` in another (`PropertyFilesPanel:311`).
- **Do not** — Do not render progress here; batch progress belongs to `useBulkRun`. Do not call `useToast` from this hook. Do not forget the `value = ''` reset. Do not expose the raw input ref.

### apps/web-next/src/components/kit/Action.tsx

- **Purpose** — THE button vocabulary the founder asked for by name. A closed `role` set replaces `variant` / `color` / `size` across 173 call sites, and `ActionRegion` turns "one filled button per region" from an aspiration into a claim registry that demotes the loser automatically.
- **Extracted from** — `src/views/LandPropertiesPage.tsx:517-524` (the Filters button that flips to `contained` when filters are active, putting two filled buttons in one toolbar region — the headline violation), `:526-534` (the bimodal contained Add), `:561-563` (the disabled-when-clean Clear), `:597-602` (the two caption `Link component="button"` pseudo-links), `:749-751` (the `className="rowActions"` `IconButton`), `:788-793` (the dialog footer pair with its busy label); `src/components/holdingCards.tsx:311` (`EmptyLanding`'s `size="large"` CTA); `src/theme/index.tsx:126-146` (the `tonal` variant this maps onto).
- **API**

```ts
'use client';
import type { MouseEvent, ReactNode } from 'react';
import type { ActionRole, ActionSize, ActionSpec } from './types';

export interface ActionProps extends Omit<ActionSpec, 'key'> {
  /** Default 'tertiary'. See types.ts for the role -> variant/color mapping. */
  role?: ActionRole;
  /** 'default' 40px visual / 48 touch; 'compact' 32 visual / 44 touch. */
  size?: ActionSize;
  /**
   * Force primary -> secondary. The empty-state rule, expressed once: while a
   * list is empty the ZeroState owns the one filled button and the toolbar's
   * create action goes tonal.
   */
  demote?: boolean;
  fullWidth?: boolean;
  /** Renders a managed hidden <input type="file"> and makes the button its label. */
  fileInput?: { accept?: string; multiple?: boolean; onFiles: (files: File[]) => void };
  /** Never accepted: an Action's content is its `label`. */
  children?: never;
}
export function Action(props: ActionProps);

export interface IconActionProps {
  /** REQUIRED. Becomes both the aria-label and the tooltip title. */
  label: string;
  icon: ReactNode;
  onClick: (event: MouseEvent<HTMLElement>) => void;
  danger?: boolean;
  disabled?: boolean;
  disabledReason?: string;
  /** Adds className="rowActions": reveal on row hover/focus, always on for touch. */
  revealOnRowHover?: boolean;
  edge?: 'start' | 'end';
  'aria-expanded'?: boolean;
  'aria-controls'?: string;
  'aria-haspopup'?: 'menu' | 'dialog' | 'true';
}
export function IconAction(props: IconActionProps);

export interface ActionRegionProps {
  /** Names the region in the dev error, e.g. "Properties toolbar". */
  name: string;
  children: ReactNode;
  /** Render as a flex row with the standard 8px cluster gap. Default false (no DOM). */
  row?: boolean;
  /**
   * Declare a ROOT region: it starts a fresh count and keeps its one filled
   * button wherever it is mounted. Default FALSE — the region inherits, and its
   * `role="primary"` demotes whenever another region encloses it. Legal only
   * for a surface whose actions are complete in themselves: an overlay or a
   * form footer. Never for structure.
   */
  root?: boolean;
}
/**
 * Declares an action region and registers its ONE filled button. An inherited
 * region counts inside whatever encloses it, so a detail pane or an expanded
 * row demotes rather than competing with the page's primary; a `root` region
 * starts the count over and keeps its filled button at any depth.
 */
export function ActionRegion(props: ActionRegionProps);

/** Sugar for toolbars and dialog footers: <ActionRegion row>. */
export function ActionRow(props: {
  name: string;
  children: ReactNode;
  justify?: 'start' | 'end' | 'between';
  /** Same meaning and default (false) as ActionRegionProps.root. */
  root?: boolean;
});

/** Null outside any region. Used by Action and by ListToolbar's dev check. */
export function useActionRegion(): import('./types').ActionRegionApi | null;

/**
 * An anchor when `href` is set, a quiet compact button when `onClick` is.
 * Exists so `<Link component="button">` never appears in a view again.
 */
export function LinkAction(props: {
  label: string;
  href?: string;
  onClick?: () => void;
  /** Required when the visible label is a glyph. */
  ariaLabel?: string;
  trailingChevron?: boolean;
});
```

- **Implementation brief** — `Action` renders one MUI `Button`. It maps `role` to `variant` / `color` and accepts neither, nor an `sx` that touches `background` or `color`:
  `primary` → `contained` + `primary`; `secondary` → `tonal` + `primary` (the theme variant at `theme/index.tsx:129-145`); `tertiary` → `outlined` + `inherit`; `quiet` → `text` + `inherit`; `destructive` → `text` + `error`.
  `size` maps to MUI `medium` / `small`, whose heights come from the theme patch (40 / 32). `compact` additionally carries a 44px hit box via `'&::after': { content: '""', position: 'absolute', inset: '50% 0 0 0', transform: 'translateY(-50%)', height: 44 }` on a `position: relative` root — the visual control keeps its M3 height while the target passes the gate.

  `icon` always goes through `startIcon`; the 8px gap is MUI's default and is not overridden. An emoji inside `label` is forbidden (screen readers read it aloud) and is caught by the lint rule below.

  `busy` disables the button and swaps the label to `busyLabel` (default `'Working…'`), keeping the button's width stable with `minWidth` measured from the resting label where practical. `disabled` + `disabledReason` wraps the button in `Tooltip` → `span` (a disabled MUI button fires no pointer events, so the span is required) so a disabled control always explains itself.

  `fileInput` renders `component="label"` with a managed hidden `<input>` inside; MUI `Button` is a `ButtonBase`, so it gets `role="button"` and `tabIndex` and stays keyboard-reachable — which is the exact fix for `PersonDialog:360`'s `<Link component="label">`, unreachable because MUI `Link` is not a `ButtonBase`. Reset `input.value` before each open.

  **`ActionRegion` is a claim registry, not a warning.** It provides an `ActionRegionApi` through context: `name`, `depth`, and `claimPrimary(label)`. Each `Action` with an effective `role === 'primary'` calls `claimPrimary` in a `useLayoutEffect` and stores the result; the first claimant renders `contained`, every later one renders `tonal`, and the disposer releases on unmount so remounting cannot poison the region. In development the registry `console.error`s once, naming the region and both labels: `Two filled buttons in region "Properties toolbar": "Add" and "Filters"`. A `role="primary"` inside a region whose `depth > 0` **auto-demotes at render time** without needing to claim. `demote` is the caller-driven override and always wins, so demotion never depends on mount order alone.

  **THE REGION RULE, and it is a property of the call site.** *A region may hold one filled button when it is declared `root` — a surface whose actions are complete in themselves and are counted against nothing outside it — or when no other region encloses it; every other region inherits, and a `role="primary"` inside an inherited region that has a region above it renders tonal.* Mechanically, `depth = root || parent === null ? 0 : parent.depth + 1`, so `depth` is the distance from the nearest **root**, not the component nesting depth.

  Inheriting is the default because structural nesting is the common case, and it is what makes the nested `GroupDetail` and deed-expander demotions correct by construction. `root` is the stated exception, and it exists because two of these surfaces are mounted from inside other people's regions and are still entitled to their own filled button: React context reaches a portal through the React tree, so a `FormDialog` written inside a `Section` inherits that section's region and would demote its own footer primary, and a page form's `FormActions` footer dropped into a `Section` — the shape the rollout gives every form-tool screen — would silently render `Save` as tonal.

  A reviewer settles any call site with two questions and no running app: **is this region declared `root`, and is any region above it?** The kit's own answers, which are the complete set:

  | Region-opening site | Kind | Filled primary possible |
  |---|---|---|
  | `ActionRegion` / `ActionRow` (primitives) | caller states it | when `root`, or when nothing encloses it |
  | `FormDialog` — the dialog subtree (`name={title}`) | **root** | yes, anywhere the dialog is written |
  | `FormDialog` — `FooterRow`'s row, i.e. `FormActions` (`name="Form actions"`) | **root** | yes; the dialog path passes `region={false}` and claims the dialog's region instead |
  | `ConfirmDialog` — the footer (`name="Confirm"`) | **root** | yes, from any trigger (the `destructive` branch is a raw filled-red `Button` and never claims) |
  | `PageHeader` — the `actions` cluster, named "&lt;title&gt; header" | inherits | yes at page level; a `level="section"` header inside a region demotes |
  | `Section` — the section body | inherits | yes on a page or in a tab panel; demotes inside another region |
  | `HeroSection` (`name="hero"`) | inherits | yes — a hero is a page's top band, so nothing encloses it |
  | `ListToolbar` (`name={regionName}`) | inherits | yes at page level and inside a tab panel; a list embedded in another region demotes |
  | `SelectionBar` (`name="selection bar"`) | inherits | **never** — every spec is re-spelled `quiet` or `destructive` before the region is consulted |
  | `RecordMedia` (`name="Record media"`, both rows) | inherits | yes for `emptyAction` on a record page; the count row is `quiet` only |

  **A tab panel opens no region.** `TabbedScreen` and `RecordScreen` render `TabPanel` bare. A panel has nothing of its own to count, and wrapping one turned every region its content opened — an embedded `ListToolbar`, a `Section` — into a nested region and demoted it, which is how a tab the contract promises a primary ended up with no filled button anywhere in it. Unwrapped, a tab's content counts exactly as it would at page level, and when the scaffold is itself embedded in a region (GroupDetail inside the families page) the content inherits and demotes — which is what that case wants.

  Every interactive root composes `focusRingSx` into `'&:focus-visible'`.

  Ship two ESLint rules alongside this file, as rollout items with an owner — not as a comment: `no-restricted-imports` forbidding `@mui/material/Button` and `@mui/material/IconButton` inside `src/views/**`, and `no-restricted-syntax` flagging an emoji literal inside an `Action`'s `label`.
- **Do not** — Do not accept `variant`, `color`, or a `size="large"`. Do not set a height inline; the theme patch owns heights. Do not make `ActionRegion` render a DOM node unless `row` is true. Do not console.error in production. Do not use `contained error` for a destructive trigger — that spelling is legal only for the confirm button INSIDE a `ConfirmDialog`. Do not let `LinkAction` render `Link component="button"`.

### apps/web-next/src/components/kit/StatusChip.tsx

- **Purpose** — One chip vocabulary: tonal for status, outlined for metadata, per the spec. It retires six raw hex pills, three copies of the label transform, and the two competing colour systems that render the same status two different ways on one screen.
- **Extracted from** — `src/components/holdingCards.tsx:27-37` (`parcelPill`, six raw hexes: `#cf1322`, `#2e7d32`, `#1677ff`, `#8c8c8c`, `#d48806`), `:40-44` (`stakePill`), `:77-88` (`pillSx`, the `color-mix` against literal `#FFFFFF` / `#16191c`); `src/views/LandPropertiesPage.tsx:628` (the filled type chip), `:642-662` (the hand-built `primary.container` Khata chip with its 8% hover `color-mix`), `:665-673` (the outlined group chip), `:721-726` (the outlined kind chip), `:734` (the outlined group chip, inert here), `:742-746` (the litigation / status chips), `:449` (the header count chip); `src/views/detail/common.tsx:38-56` (`STATUS_COLOR` + `StatusChip`).
- **API**

```ts
'use client';
import type { ReactNode } from 'react';
import type { ChipKind, StatusTone } from './types';

export interface StatusChipProps {
  /** Raw domain value; rendered through format.statusLabel unless `label` is given. */
  value?: string;
  label?: string;
  tone?: StatusTone;
  /** 'status' -> tonal container fill; 'metadata' -> outlined. Default 'status'. */
  kind?: ChipKind;
  icon?: ReactNode;
  /** 24px / 32px per spec. Default 'small'. */
  size?: 'small' | 'medium';
  /** Explains an unobvious status on hover AND as the accessible description. */
  hint?: string;
}
export function StatusChip(props: StatusChipProps);

/** Sugar: <StatusChip kind="metadata" tone="neutral" />. */
export function MetaChip(props: Omit<StatusChipProps, 'kind'>);

/** The header count chip ("38 holdings"): tonal brand, tabular numerals. */
export function CountChip(props: { count: number; noun: string; nounPlural?: string });

/** Convenience word -> tone map. Screens may ignore it and pass `tone` directly. */
export function toneFor(value: string): StatusTone;
```

- **Implementation brief** — One MUI `Chip`. Colours come from `tokens.tonalSx(tone)` for `kind="status"` — i.e. `palette[tone].container` / `.onContainer`, which the palette prerequisite adds for `info` / `success` / `warning` / `error`; `brand` maps to `primary`, `neutral` to `background.neutral` + `text.primary`. For `kind="metadata"`, `variant="outlined"` with `borderColor: 'divider'` and `color: 'text.secondary'`, no fill.

  `borderRadius: RADIUS.pill` (`'999px'`) so chips finally read as pills rather than the theme's 12. Heights: `small` = 24, `medium` = 32 (spec). In `highContrast`, `tonalSx` adds the 2px `currentColor` border, which is what keeps a white-container chip legible.

  Label: `label ?? statusLabel(value)`. `hint` renders a `Tooltip` and sets `aria-describedby` on the chip via a generated id — hover-only information is not acceptable on its own.

  `toneFor` maps the words the app actually uses: `owned`/`registered`/`possession`/`accepted`/`sent` → `success`; `for-sale`/`pending`/`under_purchase`/`agreement` → `info`; `disputed`/`litigation`/`failed`/`revoked` → `error`; `managed`/`expired`/`stale` → `warning`; `sold`/`watch`/anything unknown → `neutral`. It is a convenience only.
- **Do not** — **Do not derive a status from a domain rule here.** `parcelPill`'s litigation-outranks-status and `stakePill`'s owned-renders-nothing move to `src/views/holdings/holdingPills.ts` and return `PillSpec { label, tone }`. Do not reuse `pillSx`'s `color-mix` against a literal white — that is the bug the founder named. Do not hardcode a height; use the two spec values. Do not let `hint` be the only carrier of the information.

### apps/web-next/src/components/kit/KitSkeletons.tsx

- **Purpose** — Loading placeholders shaped like the content they replace — including the toolbar, which today pops in whole, and the 4th grid column, which today reflows the moment data lands.
- **Extracted from** — `src/components/Skeletons.tsx:11-22` (`StatRowSkeleton`, a `Card` where the real `StatRow` is a tinted `Box`), `:25-51` (`TableSkeleton`, which honours the spec's 52px rows the live table does not), `:54-79` (`CardGridSkeleton`, with a phantom 40px avatar at `:68` that no real card renders and a grid that stops at `lg` `:59` while the live grid goes to `xl`), `:82-90` (`HeaderSkeleton`), `:93-95` (`HeroSkeleton`); and the consumer at `src/views/LandPropertiesPage.tsx:420-427`, whose loading branch drops the tabs, search, view toggle, Filters, Export and Add entirely.
- **API**

```ts
import type { ViewMode } from './types';

export interface PageSkeletonProps {
  header?: boolean;        // default true
  stats?: number | false;  // tile count, default 4
  toolbar?: boolean;       // default true — the control surface must NOT pop in
  tabs?: boolean;          // default false
  /** Picks TableSkeleton vs CardGridSkeleton from the LIVE view mode. */
  view?: ViewMode;         // default 'grid'
  rows?: number;           // default 6
  columns?: number;        // default 6
}
export function PageSkeleton(props: PageSkeletonProps);

export function HeaderSkeleton(props: { chips?: boolean; actions?: number });
/** Renders INSIDE StatTiles' own tinted container — same surface, loaded or not. */
export function StatTilesSkeleton(props: { count?: number; emphasis?: 'md' | 'lg' });
export function ToolbarSkeleton(props: { tabs?: boolean; controls?: number });
export function TableSkeleton(props: { rows?: number; columns?: number; selectable?: boolean });
/** Uses tokens.cardGridSx — identical breakpoints to the live grid, no phantom avatar. */
export function CardGridSkeleton(props: { count?: number; media?: boolean });
export function SectionSkeleton(props: { lines?: number; title?: boolean });
export function RecordSkeleton(props: { hero?: boolean; tabs?: boolean; sections?: number });
export function FieldGridSkeleton(props: { fields?: number; columns?: number });
export function MapSkeleton(props: { height?: number; toolbar?: boolean });
```

- **Implementation brief** — Every skeleton composes the same token atoms as the real component. `TableSkeleton` rows are `height: ROW_HEIGHT`. `CardGridSkeleton` uses `cardGridSx` — the same object the live grid uses, so the column count can never drift — and renders a 140px `variant="rectangular"` media band plus title/subtitle/location/footer bars, **with no circular avatar**. `StatTilesSkeleton` renders its `Skeleton`s inside `StatTiles`' own tinted `Box`, not a `Card`, so the surface does not change when data lands. `ToolbarSkeleton` reserves a search field, a toggle group and two buttons in the standard cluster so the control surface stays put. `HeaderSkeleton` reserves width for the eyebrow, the title, the title chip and the unreachable chip.

  `PageSkeleton` composes them in the screen's own order: header → stats → tabs → toolbar → body, picking `TableSkeleton` or `CardGridSkeleton` from `view`. `MapSkeleton` is a `variant="rounded"` block at `RADIUS.card` and the exact height `MapSurface` will render, plus a toolbar row — this is what removes the 380→430px and 24px→12px jump caused by `GeoMapLazy.tsx:18-31`.

  No `CircularProgress` appears in this file, or anywhere in the kit.
- **Do not** — Do not draw an element the real component never renders. Do not let any skeleton's grid or radius be declared independently of the component it replaces — import the token. Do not use a `Card` where the live surface is a `Box`. Do not render a lone spinner, ever.

### apps/web-next/src/components/kit/TabStrip.tsx

- **Purpose** — One `Tabs` spelling replacing five, with counts, scroll-on-overflow by default, real tab-panel semantics, and no opinion whatsoever about URL state.
- **Extracted from** — `src/views/LandPropertiesPage.tsx:487-491` (the 38px metrics that become the only metrics, and the tab body at `:607-758` that is a bare sibling with no `role="tabpanel"`); the four competing spellings at `DocumentsPage.tsx:43`, `families/GroupDetail.tsx:247`, `detail/ParcelDetailPage.tsx:1027` and `AdminRefDataPage.tsx:201` (the only one that sets `variant="scrollable"`).
- **API**

```ts
'use client';
import type { ReactNode } from 'react';
import type { HeaderLevel, TabItem } from './types';

export interface TabStripProps {
  items: TabItem[];
  value: string;
  onChange: (value: string) => void;
  /** REQUIRED. e.g. "Holdings view", "Document type". */
  ariaLabel: string;
  /** Namespaces the generated tab/panel ids so nested strips never collide. */
  idPrefix: string;
  /** Visual weight only — semantics are identical. Default 'page'. */
  level?: HeaderLevel;
}
export function TabStrip(props: TabStripProps);

export interface TabPanelProps {
  idPrefix: string;
  value: string;
  active: string;
  children: ReactNode;
  /** Keep mounted when inactive (preserves scroll / a half-typed search). Default false. */
  keepMounted?: boolean;
}
export function TabPanel(props: TabPanelProps);

export function useTabPanelIds(idPrefix: string, value: string): { tabId: string; panelId: string };
```

- **Implementation brief** — MUI `Tabs`, always `variant="scrollable"` with `allowScrollButtonsMobile` and `scrollButtons="auto"`. Four labels must never overflow at 400px — that is a hard accessibility-gate failure today, and `ToolsPage` nests a four-tab strip above `CalculatorTool`'s own four.

  Metrics, from Properties and nowhere else: `sx={{ minHeight: 38, '& .MuiTab-root': { minHeight: 38, py: 0.5 } }}`. `level="section"` keeps identical metrics and only drops the bottom margin, so a nested strip inside a card reads quieter without a second set of numbers.

  `count` renders as a `StatusChip`-shaped tonal badge inside the `Tab`'s `label` node — never concatenated into the string, so `'All (12)'` never becomes the accessible name.

  `TabPanel` emits `role="tabpanel"`, `id={panelId}`, `aria-labelledby={tabId}` and `tabIndex={0}`; each `Tab` gets `id={tabId}` and `aria-controls={panelId}`, both built from `idPrefix` + the tab value. No tab body in the app has these today. With `keepMounted`, inactive panels render with the `hidden` attribute rather than being unmounted.

  The indicator is MUI's default with `borderRadius: RADIUS.pill` on `.MuiTabs-indicator`.
- **Do not** — Do not own URL state here. The screen passes `value` / `onChange` from `useQueryState`, which is what keeps precedence rules (`?pb=` outranks `?tab=`) in the screen where they belong. Do not put the count in the label string. Do not use `variant="standard"`. Do not assume a tab maps to a field — the screen owns the predicate.

### apps/web-next/src/components/kit/FieldGrid.tsx

- **Purpose** — The detail-page content vocabulary: label/value rows with the format applied once, a glance counter row that is actually keyboard-operable, and a definition grid that genuinely collapses to one column on a phone.
- **Extracted from** — `src/views/detail/common.tsx:90-101` (`Field`, which hard-codes `'label:'` with a colon in `body2` instead of the label type role) and `:103-116` (`FieldGrid`); `src/views/detail/ParcelDetailPage.tsx:789-796` and `src/views/detail/PropertyDetailPage.tsx:548-555` (the byte-identical `glance` helpers, non-focusable `div`s with `onClick`); `ParcelDetailPage.tsx:873,885-888` (raw ISO dates) versus `PropertyDetailPage.tsx:620-629` (the same fields through `fmtDMY`) — the divergence a shared `format` prop ends.
- **API**

```ts
'use client';
import type { ReactNode } from 'react';
import type { FieldFormat, FieldSpec, GlanceItem } from './types';

export interface FieldProps extends FieldSpec {
  /** A labelled action beside the value (Edit, Copy). */
  action?: ReactNode;
}
export function Field(props: FieldProps);

export interface FieldGridProps {
  fields: FieldSpec[];
  /** Columns at md+. Always 1 below sm. Default 2. */
  columns?: 1 | 2 | 3;
  /** Drop empty fields rather than printing a column of dashes. Default false. */
  hideEmpty?: boolean;
}
export function FieldGrid(props: FieldGridProps);

/** "At a glance" counters, as REAL buttons: 44px, focus ring, name `${count} ${label}`. */
export function GlanceRow(props: { items: GlanceItem[] });

/** Compact two-column readout for spec sheets and calculator results. */
export function KeyValueList(props: {
  rows: Array<{ label: string; value: ReactNode; format?: FieldFormat }>;
});
```

- **Implementation brief** — `Field` renders the label as `Typography variant="overline" color="text.secondary" component="div"` — **no hard-coded colon** — and the value as `body2`. The format routes through `kit/format`: `'date'` → `dmy`, `'money'` → `inrOrDash`, `'area'` → `areaOrDash`, `'number'` → `numOrDash`, `'phone'` → the value as given, `'text'` / undefined → the value as given. `'money'`, `'number'` and `'area'` add `className="tnum"`. An empty value renders `dash`. `span` widens the field via `gridColumn: 'span N'`, clamped to the current column count.

  `FieldGrid` is a CSS grid: `gridTemplateColumns: { xs: 'minmax(0, 1fr)', md: 'repeat(N, minmax(0, 1fr))' }`, `columnGap: GAP.page`, `rowGap: GAP.block`. The `minmax(0, …)` track is the actual mechanism that stops a long unbroken value from widening the grid past 400px; it is not optional.

  `GlanceRow` items are MUI `ButtonBase` when `onActivate` is set and plain `div`s otherwise — never a `div` with an `onClick`. Each carries `aria-label={count + ' ' + label}`, `minHeight: TOUCH`, and `focusRingSx` on `&:focus-visible`. The count is `className="tnum"` at 20px/700; the label is `caption` / `text.secondary`. One soft container (`quietSurfaceSx`), items separated by `GAP.page`, wrapping.
- **Do not** — Do not put a colon in the label. Do not let the grid use bare `1fr` tracks. Do not format inside the caller — pass `format` and let the kit do it once, so a date cannot render raw on one twin and DD/MM/YYYY on the other. Do not encode any domain rule about which fields exist or in what order; the deed record's legal ordering must survive, so the caller owns the array.

### apps/web-next/src/components/kit/ToastProvider.tsx

- **Purpose** — One app-level snackbar queue replacing nine copied `Snackbar` blocks plus `ExportMenu`'s private one. Bottom-center, one at a time, errors persisting until dismissed — the spec's rule, implemented once.
- **Extracted from** — `src/views/LandPropertiesPage.tsx:97-100` (the local `Toast` interface), `:146` (`notify`), `:821-825` (the `Snackbar` + `Alert`, 4000ms, errors auto-hiding against the spec), and the four dialogs it is threaded into as a prop at `:806`, `:813`, `:815`, `:816`; `src/export/ExportMenu.tsx:84-88` (the second, overlapping queue at 5000ms); `src/theme/index.tsx:147-151` (the bottom-center default this inherits rather than re-declares).
- **API**

```ts
'use client';
import type { ReactNode } from 'react';
import type { ActionSpec, ToastSeverity } from './types';

export interface ToastApi {
  /** Default severity 'success'. Errors never auto-hide. */
  notify: (message: ReactNode, severity?: ToastSeverity, action?: ActionSpec) => void;
  success: (message: ReactNode) => void;
  error: (message: ReactNode, action?: ActionSpec) => void;
  warning: (message: ReactNode) => void;
  info: (message: ReactNode) => void;
  dismiss: () => void;
}

export interface ToastProviderProps { children: ReactNode }
export function ToastProvider(props: ToastProviderProps);

/** Throws outside a ToastProvider — a missing provider must fail loudly. */
export function useToast(): ToastApi;
```

- **Implementation brief** — A FIFO queue of `ToastMessage` in state; exactly one MUI `Snackbar` mounted at the app root. `autoHideDuration` is 4000 for `success` and `info`, 6000 for `warning`, and `null` for `error` — errors persist until dismissed, per the spec. The `Alert` always carries a close button (`onClose`), and renders `action` as an `Action role="quiet" size="compact"` when supplied.

  The anchor comes from the theme default (`bottom` / `center`, `theme/index.tsx:149`) and is **not** re-declared here. `variant` is left at MUI's default, not `filled`.

  Every function on the api object is stable across renders (`useMemo` over `useCallback`s with `[]`, queue held in a ref-backed reducer) so `notify` can still be passed into a dialog as a prop while the twenty-odd call sites migrate one at a time.

  Ids come from `useId` plus a counter. When a new toast arrives while one is showing, the current one closes and the next opens on its exit transition — one at a time, never stacked.

  Mount once in `src/app/layout.tsx`, inside the existing provider stack and **outside** `RequireAuth`, so a sign-in failure can still toast.
- **Do not** — Do not re-declare `anchorOrigin`. Do not auto-hide an error. Do not allow two `Snackbar`s to be mounted — `ExportMenu`'s private one is deleted, not wrapped. Do not return `undefined` from `useToast`; throw, so a missing provider is a loud failure rather than a silent no-op. Do not narrow the severity union per screen (`DocumentsPage.tsx:23-26` narrows it to `success|error|info`, so its children cannot warn).

### apps/web-next/src/components/kit/ConfirmDialog.tsx

- **Purpose** — One destructive-confirm dialog replacing eleven near-copies, with the pending state built in so a double-tap can never fire two deletes, and with the dialog staying open when the mutation fails.
- **Extracted from** — `src/views/LandPropertiesPage.tsx:780-795` (the kind-aware delete confirm: no `maxWidth`, a `contained error` confirm, `deleting` guarding both buttons, and `confirmDelete`'s `finally` at `:315-318` that clears `deleteTarget` even when the delete threw, so the dialog closes on failure and the error survives only as a 4-second toast); and its ten siblings, notably `InvitationsPage.tsx:366-379` and `NotificationsPage.tsx:279-290` (no pending state at all — double-tap fires twice), `families/GroupDetail.tsx:590-598` (a confirm with no `DialogContent`), `detail/ParcelDetailPage.tsx:502-518` (a destructive confirm with no body), `detail/PropertyDetailPage.tsx:736-768` (the whole mutation chain inlined in the `onClick`).
- **API**

```ts
'use client';
import type { ReactNode } from 'react';
import type { ConfirmSpec } from './types';

export interface ConfirmDialogProps extends ConfirmSpec {
  open: boolean;
  onClose: () => void;
  /** Rejecting keeps the dialog OPEN and shows the error inline. */
  onConfirm: () => void | Promise<void>;
  /** Third, left-aligned action (GroupDetail's "Reset to everyone"). Rare. */
  tertiaryAction?: { label: string; onClick: () => void };
}
export function ConfirmDialog(props: ConfirmDialogProps);

export interface ConfirmController {
  /** Guard any action in one line. */
  ask: (spec: ConfirmSpec, run: () => void | Promise<void>) => void;
  /** Mount once per screen. The scaffolds mount it for you. */
  element: ReactNode;
}
export function useConfirm(): ConfirmController;
```

- **Implementation brief** — MUI `Dialog`, `maxWidth="xs"` with `PaperProps` capping at `MEASURE.form` (560) and `borderRadius: RADIUS.dialog`. `aria-labelledby` and `aria-describedby` wired to ids from `useId`.

  `body` is **required** by the type: a destructive confirm without a stated consequence does not compile. That is the direct answer to `GroupDetail.tsx:590-598` and `ParcelDetailPage.tsx:502-518`.

  The footer is an `ActionRow name="Confirm"`: `[tertiaryAction?]` pushed left with `mr: 'auto'`, then `Cancel` (`Action role="quiet"`), then the confirm. The confirm is a MUI `Button variant="contained" color="error"` when `destructive`, otherwise `Action role="primary"` — see the fiat in **Known seams**: filled red inside the dialog, red text outside it.

  Busy behaviour, which is the whole reason this file exists: while the promise is in flight both buttons disable, the confirm label swaps to `busyLabel` (default `'Working…'`), and `onClose` is blocked for Esc, backdrop and the close affordance alike (`disableEscapeKeyDown` plus an `onClose` that returns early). When not busy, Esc closes — the accessibility gate.

  A rejected `onConfirm` renders an inline MUI `Alert severity="error"` above the footer with the rejection's message and **leaves the dialog open**. Only a resolved `onConfirm` calls `onClose`.

  `useConfirm()` holds one `{ spec, run } | null` in state and returns `ask` plus `element` (a mounted `ConfirmDialog` bound to it), so a row menu can guard a delete in one line without the screen holding a target-state pair.
- **Do not** — Do not close on failure, and do not clear the target in a `finally`. Do not omit `maxWidth`. Do not make `body` optional. Do not use `Action role="destructive"` for the confirm button itself — `destructive` is the red-text TRIGGER outside the dialog. Do not inline a mutation chain in the `onClick`; `onConfirm` is a named handler.

### apps/web-next/src/components/kit/SearchField.tsx

- **Purpose** — The search input and the list/grid toggle, the two most-copied toolbar atoms. `SearchField` finally has an accessible name, a clear button and a debounce; `ViewToggle` finally persists and keeps the accessible names the e2e suite asserts.
- **Extracted from** — `src/views/LandPropertiesPage.tsx:493-508` (the `TextField` with a `SearchIcon` adornment, `minWidth: 190`, no label, no clear, refiltering on every keystroke) and `:509-516` (the `ToggleButtonGroup` with `aria-label="View mode"` and the null-guard `val && setView(val)`); the near-identical copies at `PassbooksPage.tsx:221-236` (`minWidth: 220`) and `:238-251`, `documents/DocumentsTab.tsx:645-660` (`minWidth: 260`), `AuditLogPage.tsx:85-99`, `AdminRefDataPage.tsx:120-135`, `ToolsPage.tsx:63-77`.
- **API**

```ts
'use client';
import type { ViewMode } from './types';

export interface SearchFieldProps {
  /**
   * The noun searched. Renders placeholder "Search {noun}…" AND the visually
   * hidden label "Search {noun}". REQUIRED: no more unlabelled comboboxes.
   */
  noun: string;
  value: string;
  onChange: (value: string) => void;
  /** Default 250. The input echoes instantly; only onChange is debounced. */
  debounceMs?: number;
  /** Default 220. */
  minWidth?: number;
  autoFocus?: boolean;
  disabled?: boolean;
}
export function SearchField(props: SearchFieldProps);

export interface ViewToggleOption {
  value: ViewMode;
  /** Visible text. */
  label: string;
  /** Accessible name. MUST default to 'List view' / 'Grid view'. */
  ariaLabel: string;
}

export interface ViewToggleProps {
  value: ViewMode;
  onChange: (value: ViewMode) => void;
  /**
   * Defaults to exactly:
   *   [{ value: 'list', label: 'List', ariaLabel: 'List view' },
   *    { value: 'grid', label: 'Grid', ariaLabel: 'Grid view' }]
   */
  options?: ViewToggleOption[];
  /** localStorage key; the choice survives navigation and reload. */
  persistKey?: string;
  /** Group aria-label. Default 'View mode'. */
  ariaLabel?: string;
}
export function ViewToggle(props: ViewToggleProps);
```

- **Implementation brief** — `SearchField` is a MUI `TextField size="small" type="search"` with a `SearchIcon` start adornment (`fontSize="small"`) and `sx={{ minWidth }}`. The accessible name comes from a visually-hidden `<label htmlFor>` reading `Search {noun}` — the placeholder alone is not a name. Internal state mirrors the input so typing is never laggy; the debounced value flows out through `onChange` after `debounceMs`, and the timer is flushed on unmount. When the value is non-empty an end adornment renders an `IconAction label="Clear search"` (44px) that clears immediately, without debounce. `Escape` inside the field clears it and stops propagation so it does not also close an enclosing overlay.

  `ViewToggle` is a MUI `ToggleButtonGroup size="small" exclusive` with `aria-label={ariaLabel}`. Each `ToggleButton` carries `value`, `aria-label={option.ariaLabel}` and the icon + visible label — `ViewListOutlinedIcon` / `GridViewOutlinedIcon` at `fontSize="small"` with `mr: 0.5`, exactly `LandPropertiesPage.tsx:511,514`. The null guard is preserved verbatim: `onChange={(_e, val) => val && onChange(val)}`, so the group can never be deselected. Buttons are 44px tall via `minHeight: TOUCH` on `.MuiToggleButton-root` — the visible chrome keeps its `small` padding.

  `persistKey` is read in a `useEffect` (never during render, never in a `useState` initializer — `DashboardPage.tsx:75` is the app's only violation and it must not be copied) and every `localStorage` access is wrapped in `try/catch`.

  **Accessible-name contract.** `tests/e2e-ux/specs/holdings.spec.ts:30,67` and `passbooks.spec.ts:82,86` do `getByRole('button', { name: 'List view' })` / `'Grid view'`. Those strings are the defaults and must not change.

  A comment at the top of the file states the distinction, because `NotificationsPage.tsx:134-143` currently confuses them: **`ViewToggle` is for view mode only. A data-scope toggle is a `TabStrip`.**
- **Do not** — Do not make the placeholder the accessible name. Do not debounce the input's own echo. Do not read `localStorage` during render. Do not change the default `ariaLabel`s. Do not use `ViewToggle` for a data scope.

### apps/web-next/src/components/kit/Section.tsx

- **Purpose** — The one surface primitive, replacing `GlassCard` (a dead wrapper with a dead `tone` prop), the three ad-hoc panel spellings inside a single file, and the hand-rolled section headers on every detail page.
- **Extracted from** — `src/views/LandPropertiesPage.tsx:540` (`<Card variant="outlined" sx={{ p: 1.75, bgcolor: 'background.default' }}>` for the filter panel), `:570` (the same idea at `px: 1.5, py: 1` for the chip row), `:690` (`<TableContainer component={Card}>`) — three ways to make a panel in one file; `src/components/GlassCard.tsx:17-23` (the vestigial `Paper elevation={2}` with the ignored `tone`); `src/views/detail/common.tsx:67-87` (`SectionCard`, `p: 1.75`, title at `fontWeight 600 / fontSize 14`); `src/views/DashboardPage.tsx:50-59` (`heroSx`, a gradient built from six colour literals).
- **API**

```ts
'use client';
import type { ReactNode } from 'react';
import type { ActionSpec, HeroTone, SectionVariant } from './types';

export interface SectionProps {
  /** 'card' (default) | 'quiet' | 'table' | 'bare'. See types.ts. */
  variant?: SectionVariant;
  title?: string;
  /** Overline eyebrow above the title. */
  eyebrow?: string;
  description?: ReactNode;
  /**
   * Right-aligned. The Section is its own ActionRegion, named after the title,
   * and it inherits: a `primary` here fills when the section stands on a page
   * or in a tab panel, and demotes when another region encloses the section.
   */
  actions?: ReactNode;
  /** Default 'h2' inside a page, 'h3' when nested. */
  headingAs?: 'h2' | 'h3' | 'h4';
  /** Bottom margin in grid units. Default GAP.section (32px). `false` removes it. */
  gutter?: number | false;
  children: ReactNode;
  id?: string;
}
export function Section(props: SectionProps);

export interface SectionHeaderProps {
  title: string;
  eyebrow?: string;
  description?: ReactNode;
  actions?: ReactNode;
  headingAs?: 'h2' | 'h3' | 'h4';
}
/** The header alone, for content that supplies its own surface. */
export function SectionHeader(props: SectionHeaderProps);

export interface HeroSectionProps {
  children: ReactNode;
  /** 'brand' = the deliberate dark/gold flourish (Dashboard, Wallet). */
  tone?: HeroTone;
  actions?: ActionSpec[];
}
export function HeroSection(props: HeroSectionProps);
```

- **Implementation brief** — `variant="card"` → MUI `Card` with `surfaceSx` and `p: PAD.card` (20px, the spec). `variant="quiet"` → `quietSurfaceSx` (`background.default`, hairline, `RADIUS.control`, `p: PAD.quiet`). `variant="table"` → the card surface with `p: 0`, for a `TableContainer` child. `variant="bare"` → no surface at all, rhythm only. All radii come from `RADIUS.*` as px strings; `customShadows.card` appears only where an overlay is intended, never on a resting section.

  `SectionHeader` renders the eyebrow as `Typography variant="overline" color="text.secondary"`, the title as `Typography variant="h6" component={headingAs}`, the description as `body2 / text.secondary`, and `actions` right-aligned in a flex cluster at `GAP.control`. Header→content gap is `GAP.cluster` (12px); the section's own bottom margin is `gutter` (default `GAP.section`, 32px).

  Every `Section` wraps its children in an **inherited** `ActionRegion` named after `title ?? id ?? 'section'` — never `root`, because a section is structure. That cuts both ways deliberately: a section standing on a page or in a tab panel has no region above it and legally owns its own primary, while a section nested inside another region (a sub-panel, an expanded row's body, a detail pane the screen wrapped) counts inside its host and demotes.

  `HeroSection` is the ONE gradient surface in the app, replacing the three hardcoded ones (`DashboardPage.tsx:50-59`, `holdingCards.tsx:148`, `detail/common.tsx:366`). Its gradient is composed from `primary.darker` → `primary.dark` → `secondary.dark` channels with an explicit `primary.contrastText` ink, through a theme callback, so it survives all three schemes instead of being three hex stops. On `tone="brand"` it sets a context flag that switches `Action` into the on-dark colour context: `primary` renders with `bgcolor: 'common.white'` / `color: 'primary.darker'` resolved from tokens, and `secondary` renders as a `common.white` alpha wash — **the mechanism is an explicit React context exported from this file and consumed by `Action`, not implicit magic**; `Action` reads it with a `useHeroContext()` hook that returns `false` outside a brand hero. `radius` is `RADIUS.dialog` (20px), per the spec's hero rule.
- **Do not** — Do not keep `GlassCard`; fold it in and delete it once its two call sites move. Do not put a shadow on a resting section. Do not let `HeroSection`'s ink be a literal. Do not let the on-dark Action context be inferred from anything other than the exported context. Do not hand-roll a section header anywhere in `src/views/**` once this ships.

### apps/web-next/src/components/kit/PageHeader.tsx

- **Purpose** — The upgraded page/section header. It keeps the one-`h1` contract, renames the lying `sample` prop, and gains the back link, breadcrumbs, media slot and rich subtitle that detail pages hand-roll today — plus the `below` slot that finally gives every screen identical header → controls → content rhythm.
- **Extracted from** — `src/components/PageHeader.tsx:7-25` (the props, including `sample?: boolean`) and `:32-79` (the body, whose `variant` maps `'h2'`→`h4` and `'h3'`→`h6` at `:59` and whose `sample` chip at `:63-67` renders "Service unreachable" — a name that claims demo data while the chip says outage); the consumer at `src/views/LandPropertiesPage.tsx:445-451`, which builds its subtitle as a template literal at `:450` because `subtitle` is `string`, and renders its toolbar as a sibling row at `:486-536` because there is no `below` slot.
- **API**

```ts
'use client';
import type { ElementType, ReactNode } from 'react';
import type { DataState, HeaderLevel } from './types';

export interface PageHeaderProps {
  title: string;
  eyebrow?: string;
  /** ReactNode, not string — composition lines carry chips and links. */
  subtitle?: ReactNode;
  titleChips?: ReactNode;
  /**
   * Replaces the old `sample` boolean. ONE vocabulary for every screen, list
   * and record alike.
   */
  dataState?: DataState;
  /** Extra status chips ("Coming soon"). Must never contradict dataState. */
  status?: ReactNode;
  back?: { label: string; href: string } | { label: string; onClick: () => void };
  breadcrumbs?: Array<{ label: string; href?: string }>;
  /** Avatar / record icon slot, left of the title. */
  media?: ReactNode;
  /**
   * Right-aligned. The header is its own ActionRegion, and it inherits: a
   * page-level header keeps its filled button, a `level="section"` header
   * nested inside another region demotes.
   */
  actions?: ReactNode;
  /** 'page' -> h1 at the h4 scale, mb 24. 'section' -> h2 at the h6 scale, mb 16. */
  level?: HeaderLevel;
  /** Override the heading ELEMENT only; semantics and visual size stay separable. */
  component?: ElementType;
  /** Tabs + toolbar, rendered beneath with the standard 12px rhythm. */
  below?: ReactNode;
  id?: string;
}
export function PageHeader(props: PageHeaderProps);

/** The one unreachable indicator. Exported for tool tabs with no header. */
export function ServiceStateChip(props: { state: DataState; compact?: boolean });
```

- **Implementation brief** — Structure, top to bottom: optional `Breadcrumbs`, optional back link (an `Action role="quiet" size="compact"` with a `ChevronLeft` start icon, or a Next `Link` when `href` is given — never `Link component="button"`), then the main row.

  The main row is the existing `:43-51` flex: `alignItems: 'flex-start'`, `flexWrap: 'wrap'`, `gap: GAP.cluster`, and a bottom margin of `GAP.page` (24) at `level="page"` or `GAP.block` (16) at `level="section"`. Left column (`minWidth: 0, flexGrow: 1`): `media`, then the eyebrow (`overline`, `text.secondary`, `mb: 0.25`), then the title row (`display: flex, alignItems: center, gap: 1.25, flexWrap: wrap`) holding `Typography variant={level === 'page' ? 'h4' : 'h6'} component={component ?? (level === 'page' ? 'h1' : 'h2')}`, then `titleChips`, then `ServiceStateChip` when `dataState === 'unreachable'`, then `status`. Subtitle below at `body2 / text.secondary`, `mt: 0.5`, `maxWidth: 720` — now a `ReactNode`, so a composition line can carry chips and links instead of being a template literal. Right cluster: `actions`, inside an `ActionRegion` named `` `${title} header` ``.

  `below` renders directly beneath the row with a `GAP.cluster` (12px) gap above it and `GAP.page` (24px) below it, so the header owns the header→tabs→toolbar→content rhythm and no screen re-declares it.

  `ServiceStateChip` renders nothing for `'live'`, and for `'unreachable'` an outlined `error` `Chip` labelled `Service unreachable` inside a `Tooltip` reading exactly `The live service is not reachable — nothing is shown until it responds.` — both strings preserved verbatim from `PageHeader.tsx:64-66`, because the e2e suite's service-unreachable expectations depend on them.

  Exactly one `h1` per page stays a hard contract. `level="section"` emits `h2` and must be used by every in-page section header — `GroupDetail`, the tool tabs, the detail-page sections — instead of a hand-rolled `Box` + `Typography`.

  Ship `src/components/PageHeader.tsx` as a **deprecation shim** re-exporting this component with the mapping `variant: 'h2' | 'h3'` → `level: 'page' | 'section'` and `sample: true` → `dataState: 'unreachable'`, marked `@deprecated`. Twelve call sites keep compiling and rendering identically while screens migrate one at a time; the shim is deleted in the final cleanup step, not the first.
- **Do not** — Do not emit a second `h1`. Do not keep the `sample` name in the kit. Do not let `status` contradict `dataState`. Do not delete the old `PageHeader.tsx` before its last consumer has moved. Do not change the unreachable chip's label or tooltip text.

### apps/web-next/src/components/kit/ListToolbar.tsx

- **Purpose** — The most-copied block in the platform, fixed permanently: one row, one order, two gap values, exactly one filled button. Left free-form it drifts immediately — three screens already arrange the same five controls three different ways.
- **Extracted from** — `src/views/LandPropertiesPage.tsx:486-536` (tabs left; then search → view toggle → Filters → Export → Add, with the Filters button flipping to `contained` at `:518`); `PassbooksPage.tsx:220-256` (search pinned far LEFT behind a `flexGrow` spacer, then toggle → Export → New Passbook, `mb: 2`); `documents/DocumentsTab.tsx:645-682` (primary BEFORE export, `minWidth: 260`); `InvitationsPage.tsx:186-197` and `NotificationsPage.tsx:132-147` (the whole cluster inside `PageHeader`'s `actions` slot).
- **API**

```ts
'use client';
import type { ReactNode } from 'react';

export interface ListToolbarProps {
  /** Tabs or a scope control, pinned left. */
  left?: ReactNode;
  /**
   * The right cluster. ALWAYS rendered in this order regardless of prop order:
   *   search -> viewToggle -> filters -> extras -> exportAction -> primaryAction
   */
  search?: ReactNode;
  viewToggle?: ReactNode;
  filters?: ReactNode;
  extras?: ReactNode;
  exportAction?: ReactNode;
  primaryAction?: ReactNode;
  /** Names the ActionRegion for the one-filled-button registry. */
  regionName: string;
  /**
   * Replaces the whole right cluster (selection mode) while KEEPING `left` and
   * any active-filter display mounted.
   */
  replaceWith?: ReactNode;
}
export function ListToolbar(props: ListToolbarProps);
```

- **Implementation brief** — Two `Box`es and nothing else. The outer row is `toolbarRowSx` (`space-between`, `alignItems: center`, `gap: GAP.cluster`, `flexWrap: wrap`, `mb: GAP.cluster`) — `LandPropertiesPage.tsx:486` verbatim. The right cluster is `actionClusterSx` (`flex`, `gap: GAP.control`, `alignItems: center`, `flexWrap: wrap`) — `:492` verbatim.

  **The order is enforced by the component, not the caller.** The component renders the six slots in the fixed sequence above; a caller cannot reorder them, which is what stops the drift.

  The whole toolbar is one **inherited** `ActionRegion` named `regionName`, so the claim registry makes the one-filled-button rule structural: the Filters trigger is `tertiary`/`secondary` and can never win the claim against the create action. Inherited and not `root` on purpose — at page level, and inside a tab panel (which opens no region), nothing encloses the toolbar and the create action is filled exactly as `LandPropertiesPage.tsx:526-534` has it; a list embedded in another region (a sub-list inside a `Section`, a detail pane) counts inside its host and the create action demotes.

  When `replaceWith` is set, the right cluster is swapped for it while `left` stays mounted — so a selection bar never unmounts the search box or the active-filter display, the defect at `DocumentsTab.tsx:609-702`.

  At 400px the row wraps: `left` takes the first line and the cluster the second, each item keeping its own 44px height. No `min-width` wider than the screen appears anywhere.

  In development, after mount, walk `children` and `console.error` if more than one contained button is present in the cluster — a second line of defence behind the registry.
- **Do not** — Do not accept an order override. Do not put any colour, border, radius or shadow in this file; it is layout only, and the grep test covers it. Do not stack a selection bar above the toolbar — replace the cluster. Do not put this cluster inside `PageHeader`'s `actions` slot; `actions` is for page-level verbs, `below` is for the toolbar.

### apps/web-next/src/components/kit/StatTiles.tsx

- **Purpose** — The 4-tile summary row, token-driven, with the delta chip the spec asks for, clickable tiles, a masked mode for Dashboard's privacy toggle, a plain variant for in-card figure rows, and its own skeleton so the surface never changes when data lands.
- **Extracted from** — `src/components/holdingCards.tsx:249-267` (`StatRow`: `borderRadius: 4` that renders 32px against its own `// 16px` comment, and the hand-mixed `rgba(25, 118, 210, 0.05)` / dark `rgba(144, 202, 249, 0.08)` container — MUI-default blue, not a palette token) and `:270-284` (`StatCard`: overline label + `fontSize: 24 / fontWeight: 700` `.tnum` figure); the consumer at `src/views/LandPropertiesPage.tsx:454-483` (the three per-tab sets computed from the FULL dataset at `:232-251`); `src/components/Skeletons.tsx:11-22` (`StatRowSkeleton`, a `Card` where the real row is a tinted `Box`).
- **API**

```ts
'use client';
import type { StatEmphasis, StatItem, StatScope } from './types';

export interface StatTilesProps {
  items: StatItem[];
  /**
   * REQUIRED and load-bearing. 'dataset' = computed from the whole collection,
   * so tiles do NOT move when filters change (Properties' deliberate parity
   * behaviour); 'filtered' = computed from the visible rows. Rendered as a hint
   * on the row so the reader is told which it is.
   */
  scope: StatScope;
  /** 'contained' (default) = one tinted container with hairline dividers. */
  variant?: 'contained' | 'plain';
  /** 'md' 24px figures (default) or 'lg' 32px for a hero row. */
  emphasis?: StatEmphasis;
  /** Renders the skeleton in the SAME surface as the loaded row. */
  loading?: boolean;
  /** Global reveal for tiles marked `masked`, plus the Show/Hide toggle. */
  revealed?: boolean;
  onRevealChange?: (revealed: boolean) => void;
  columns?: number;
}
export function StatTiles(props: StatTilesProps);

/** A single tile. Exported so Dashboard / Calculator can place one alone. */
export function StatTile(props: StatItem & { emphasis?: StatEmphasis });
```

- **Implementation brief** — The container is a `Box` (never a `Card`) carrying `tonalSx('brand')` at low alpha — `primary.container` with a correct dark and `highContrast` branch — `borderRadius: RADIUS.card` (`'16px'`, which is what the original comment intended), `mb: GAP.block`, `'& > *': { flex: 1, minWidth: 140 }` and `'& > * + *': { borderLeft: '1px solid', borderColor: 'divider' }` — `holdingCards.tsx:252-262` with the two bugs fixed.

  Each tile is `px: PAD.card, py: 1.75, minWidth: 0`. The label is `Typography variant="overline" color="text.secondary" component="div"` with `whiteSpace: 'nowrap'`; the figure is `className="tnum"` at **exactly 24px / 700 / lineHeight 1.3 / `overflowWrap: 'anywhere'`** for `emphasis="md"` and 32px / 700 for `'lg'`. The 24px figure is pinned in pixels because `holdingCards.tsx:278` is pinned, and the four Properties tiles must not shift.

  `delta` renders a `StatusChip size="small"` beside the figure. `hint` renders as a `caption / text.secondary` line under the figure. `scope` renders once on the row, right-aligned, as a `caption / text.secondary`: `Across all records` for `'dataset'`, `Matching the current filters` for `'filtered'`.

  A tile with `onClick` or `href` becomes a real `ButtonBase` / link: `minHeight: TOUCH`, `focusRingSx` on `&:focus-visible`, `aria-label={label + ': ' + value}`, and a `stateLayer('primary', 8)` hover.

  `masked` renders `'••••'` until `revealed`, with the reveal control as an `IconAction` labelled `Show value` / `Hide value`.

  `loading` renders `Skeleton`s **inside the same tinted `Box`** — no `Card`-vs-`Box` surface swap, which is the defect at `Skeletons.tsx:13`.

  `variant="plain"` drops the container and the dividers, leaving bare label/figure pairs for use inside a card or a calculator result panel.

  At 400px the tiles wrap to two columns via `flexWrap: 'wrap'` with `minWidth: 140`; the dividers become top borders on wrapped rows only if that can be done without a hardcoded breakpoint — otherwise they are simply absent on wrap, which is acceptable.
- **Do not** — Do not compute anything; `items` arrive as data. Do not make `scope` optional or default it — the next screen will get it wrong by accident in either direction. Do not use a `Card`. Do not change the 24px figure size. Do not hand-mix an rgba container.

### apps/web-next/src/components/kit/FilterBar.tsx

- **Purpose** — The whole filter lifecycle from ONE declaration: the collapsible panel, the collapsed chip row, the active count, Clear, cascades, per-tab visibility, and properly labelled selects. It fixes the app's worst accessibility defect — five unlabelled comboboxes on the canonical screen.
- **Extracted from** — `src/views/LandPropertiesPage.tsx:377-385` (`flabel`, a detached `Typography` that is NOT tied to its field, which is why all five filters are unlabelled comboboxes), `:386-411` (`filterSelect`, including the `value=""` placeholder convention and `e.target.value || undefined` at `:400`), `:413-417` (the option builders), `:517-524` (the Filters trigger with no `aria-expanded` / `aria-controls`, flipping to `contained`), `:539-566` (the panel, with `Kind` only on the `all` tab at `:542` and `Passbook` hidden on `properties` at `:560` — proof the `visible(ctx)` predicate is needed), `:569-605` (the five bespoke chip branches, including the inline IIFE at `:590-593` that re-scans `data.passbooks` to relabel the passbook chip), `:597-602` (the two caption pseudo-links), `:642-662` and `:664-674` (the two filter-shortcut chips, one of which lights up on hover with no handler).
- **API**

```ts
'use client';
import type { FilterField, FilterValues, StatusTone } from './types';

export interface FilterPanelProps<Ctx> {
  fields: FilterField<Ctx>[];
  values: FilterValues;
  ctx: Ctx;
  /** Receives the FULL next values object, with cascades already applied. */
  onChange: (next: FilterValues) => void;
  onClear: () => void;
  open: boolean;
  onClose: () => void;
  /** Must match FilterTrigger's `controls`. */
  id: string;
}
export function FilterPanel<Ctx>(props: FilterPanelProps<Ctx>);

export interface FilterTriggerProps {
  activeCount: number;
  open: boolean;
  onToggle: () => void;
  controls: string;
}
/**
 * NEVER contained — it is a state control, not a decision. `tertiary` when
 * clean, `secondary` (tonal) when filters are active.
 */
export function FilterTrigger(props: FilterTriggerProps);

export interface FilterChipRowProps<Ctx> {
  fields: FilterField<Ctx>[];
  values: FilterValues;
  ctx: Ctx;
  onChange: (next: FilterValues) => void;
  onClear: () => void;
  /** Opens the panel; renders the "Edit" affordance. */
  onEdit?: () => void;
  /** Show even while the panel is open. Default true — the summary must not vanish. */
  alwaysVisible?: boolean;
  /** Extra non-field chips, e.g. the live search term. */
  extra?: Array<{ key: string; label: string; onDelete: () => void }>;
}
export function FilterChipRow<Ctx>(props: FilterChipRowProps<Ctx>);

export interface FilterShortcutChipProps {
  label: string;
  /** Sets a filter from inside a card or row. Calls stopPropagation for you. */
  onActivate?: () => void;
  /** Already the active filter — renders pressed, with aria-pressed. */
  pressed?: boolean;
  tone?: StatusTone;
  variant?: 'tonal' | 'outlined';
  /** Names what pressing it does: "Filter by khata 1234". REQUIRED with onActivate. */
  actionLabel?: string;
}
export function FilterShortcutChip(props: FilterShortcutChipProps);

export function activeFilterCount(values: FilterValues): number;
export function resolveFilterOptions<Ctx>(field: FilterField<Ctx>, ctx: Ctx): { value: string; label: string }[];
export function filterChipLabel<Ctx>(field: FilterField<Ctx>, value: string, ctx: Ctx): string;
```

- **Implementation brief** — Each control is a **real labelled select**: `<TextField select size="small" fullWidth label={field.label} value={values[field.key] ?? ''} onChange={e => apply(field, e.target.value || undefined)} slotProps={{ select: { displayEmpty: true } }}>` with a `<MenuItem value="">{field.placeholder}</MenuItem>` first. The MUI `label` gives a programmatic name — `flabel` is deleted, not ported. `undefined` stays the only no-filter value.

  `apply` builds the next `FilterValues` in one pass: set the changed key, then reset every key in `field.clears` to `undefined` (the district→mandal→village cascade), then clear any field whose `visible(ctx)` is false **and** whose `clearWhenHidden` is true. `clearWhenHidden` defaults to **false**, which is what preserves Properties' behaviour: the Passbook filter stays applied while hidden on the Properties tab, and the Kind filter stays applied off the All tab. Then `onChange(next)` once.

  The panel is `Section variant="quiet"` (`background.default`, hairline, `RADIUS.control`, `p: PAD.quiet`) wrapping a `Box` at `display: flex, gap: GAP.cluster, flexWrap: wrap, alignItems: flex-end`, each field at `minWidth: field.minWidth ?? 170, flex: 1` — `LandPropertiesPage.tsx:540-541,393` verbatim. A `Clear` `Action role="quiet"` disabled when `activeCount === 0` closes the row. The panel has `id={id}`, closes on `Escape`, and moves focus to the first control when it opens.

  `FilterTrigger` is an `Action` with `FilterListIcon`, label `` `Filters${activeCount ? ` (${activeCount})` : ''}` ``, `aria-expanded={open}` and `aria-controls={controls}`. Its role is `tertiary` when `activeCount === 0` and `secondary` when active — **never `primary`**. That single change kills the two-filled-buttons bug at `:517-524`.

  `FilterChipRow` derives every chip from the same `fields` + `values`, so the five bespoke branches and the passbook-relabelling IIFE both disappear. Each chip's accessible name is `` `${field.label}: ${valueLabel}, remove filter` `` — not the bare value. Its surface is `quietSurfaceSx` at `px: 1.5, py: 1`, prefixed by a `caption / text.secondary` `Filtered by`, with `Edit` and `Clear all` as `LinkAction`s in an `ml: 'auto'` cluster at `GAP.cluster`. `alwaysVisible` defaults to **true**, so opening the panel no longer hides the summary.

  `FilterShortcutChip` is the card-chip-sets-a-page-filter pattern, made honest. With `onActivate` it is a real `Chip` with `onClick` (which gives MUI a `button` role), `aria-label={actionLabel}`, `aria-pressed={pressed}`, `stopPropagation` handled for you, and the tonal hover from `stateLayer('primary', 8)` — the exact treatment at `:654-661`, now token-driven. **Without `onActivate` it renders inert**: no pointer cursor, no hover affordance, no role. Today an empty-passbook Khata chip lights up on hover and does nothing.
- **Do not** — Do not use a detached caption as a label. Do not let `''` mean "no filter". Do not default `clearWhenHidden` to true. Do not make the Filters trigger `contained`. Do not hide the chip row when the panel opens. Do not put the match logic here unless the field declares `match` — the group-by-name / passbook-by-id divergence must stay a visible declaration, not an accident.

### apps/web-next/src/components/kit/FormDialog.tsx

- **Purpose** — The dialog shell and the form layout system, replacing six widths, three section-header styles, four validation models and ten hand-written footers. The section primitives are exported independently so full-page forms (Profile, StampDuty) use the same rhythm outside any dialog.
- **Extracted from** — `src/views/LandPropertiesPage.tsx:780-795` (the footer pair with its busy label); the six widths at `holdings/AddParcelDialog.tsx:105` (`sm`), `holdings/LocationDialog.tsx:63` (`md`), `holdings/StakeDialog.tsx` (`xs`), `families/PersonDialog.tsx:312` (`md`, with the backdrop at `:312` discarding a fully typed 749-line form), `documents/DeedImportDialog.tsx:213` (`lg`), `holdings/AddPropertyDialog.tsx:589` (`sm` in one step and `lg` in the next — a dialog that resizes itself mid-flow); the three section-header styles at `ParcelDetailPage.tsx:650-656` (`overline`), `PropertyDetailPage.tsx:372-378` (`caption`), `AddPropertyDialog.tsx:529-531` (`subtitle2` + `borderTop`); the fixed grids at `AddPropertyDialog.tsx:505` (`1fr 1fr`) and `:563` (`1fr 1fr 1fr 1fr`) that never collapse at 400px; `AddParcelDialog.tsx:117-142` (fields painted red with no `helperText`) and `:192` (the primary labelled `OK`).
- **API**

```ts
'use client';
import type { ReactNode } from 'react';
import type { ActionSpec, DialogWidth, FieldError } from './types';

export interface FormDialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  /** 'standard' 560 (spec) | 'wide' 720 | 'workbench' 1040 (batch import only). */
  width?: DialogWidth;
  /** The primary label must NAME the act ("Save parcel"), never "OK". */
  primary: ActionSpec;
  secondary?: ActionSpec;
  cancelLabel?: string;
  /** Blocks Esc / backdrop and disables both footer buttons. */
  busy?: boolean;
  /** Warn before discarding a touched form on Esc / backdrop / Cancel. */
  dirty?: boolean;
  dirtyMessage?: string;
  /** Wraps children in a <form> so Enter submits into primary.onClick. Default true. */
  asForm?: boolean;
  /** Full-screen below this breakpoint. Default 'sm'. */
  fullScreenBelow?: 'sm' | 'md' | false;
  children: ReactNode;
}
export function FormDialog(props: FormDialogProps);

export interface FormSectionProps {
  /** An overline label with a rule above (spec: "sections with overline headers"). */
  title?: string;
  description?: ReactNode;
  children: ReactNode;
  /** The first section drops its top rule. */
  first?: boolean;
}
export function FormSection(props: FormSectionProps);

export interface FormGridProps {
  /** Columns at sm and up; ALWAYS 1 column below sm. Default 2. */
  columns?: 1 | 2 | 3 | 4;
  children: ReactNode;
}
/** A child may set data-span="full" to occupy the whole row. */
export function FormGrid(props: FormGridProps);

export interface FormActionsProps {
  primary: ActionSpec;
  secondary?: ActionSpec;
  cancel?: ActionSpec;
  /** Sticky bottom bar for long page-level forms (Profile). Default false. */
  sticky?: boolean;
  /** Explains a disabled primary in context instead of leaving a dead button. */
  note?: ReactNode;
}
export function FormActions(props: FormActionsProps);

export interface FormErrorSummaryProps {
  errors: FieldError[];
  /** Focuses the named field when a summary entry is clicked. */
  onFocusField?: (field: string) => void;
}
export function FormErrorSummary(props: FormErrorSummaryProps);
```

- **Implementation brief** — `FormDialog` is a MUI `Dialog fullWidth` whose `PaperProps.sx` sets `maxWidth: MEASURE[width]` (560 / 720 / 1040) and `borderRadius: RADIUS.dialog` (20px, the spec). `fullScreenBelow` drives `fullScreen={useMediaQuery(theme.breakpoints.down(bp))}`, default `'sm'`.

  Header: `DialogTitle` with the title and an optional `subtitle` `body2 / text.secondary` beneath, plus an `IconAction label="Close"` at the top-right that is hidden while `busy`.

  Body: `DialogContent` with `p: PAD.dialog`. When `asForm` (default), the content is wrapped in a `<form onSubmit>` that calls `primary.onClick` and `preventDefault`s, so Enter submits — which `AddPropertyDialog` and `PersonDialog` do not support today.

  Footer: the shared footer row inside `DialogActions`, order always `[secondary?] [Cancel] [Primary]` with Primary rightmost. The dialog subtree is its own **`root`** `ActionRegion` named `title`, and the footer claims THAT region rather than opening a second one inside it (`region={false}`), so the footer primary is the dialog's one filled button and a `role="primary"` dropped into the body demotes against it. `root` is load-bearing: React context reaches a portal through the React tree, so without it a dialog whose JSX sits inside a `Section` would inherit that section's region and tonalise its own Save. The same footer outside a dialog (`FormActions`) opens its own `root` region named `Form actions`, for the same reason.

  `busy` blocks `onClose` entirely — Esc, backdrop and the close button — and disables both footer buttons, swapping the primary's label to `busyLabel`. `dirty` (and not `busy`) routes Esc / backdrop / Cancel through a nested `ConfirmDialog` carrying `dirtyMessage` (default `Discard your changes? Anything you have typed will be lost.`).

  `FormSection` renders a top rule (`borderTop: '1px solid', borderColor: 'divider'`, `pt: GAP.block`) unless `first`, then the title as `Typography variant="overline" color="text.secondary"` — **overline, settling the three-way split** — then the description, then the children.

  `FormGrid` is `display: grid`, `gridTemplateColumns: { xs: 'minmax(0, 1fr)', sm: 'repeat(N, minmax(0, 1fr))' }`, `gap: GAP.block`, with `'& > [data-span="full"]': { gridColumn: '1 / -1' }`. The `xs` single column is the fix for every fixed `1fr 1fr` and `1fr 1fr 1fr 1fr` grid that never collapsed at 400px; the `minmax(0, …)` track is what stops a long value widening it.

  `FormActions` is the same footer usable outside a dialog. `sticky` gives it `position: sticky, bottom: 0`, the paper background, a top hairline and `py: GAP.block`, so Save does not scroll out of view on a long page form. `note` renders as `caption / text.secondary` left of the buttons — the in-context explanation for a disabled primary, replacing `ProfilePage.tsx:257`'s silent `disabled`.

  `FormErrorSummary` is an `Alert severity="error"` with a `<ul>` of messages, each a `LinkAction` calling `onFocusField(field)`; it renders `role="alert"` and receives focus after a failed submit.

  Validation model, stated once so the four in the app collapse to one: validate **on blur**, report through the field's own `error` + `helperText`, and render `FormErrorSummary` only after a failed submit attempt.
- **Do not** — Do not let a dialog change width mid-flow. Do not label a primary `OK`. Do not allow Esc or a backdrop click to discard a dirty form silently. Do not use `caption` or `subtitle2` for a section header. Do not write a fixed multi-column grid with no `xs` breakpoint. Do not validate only on submit.

### apps/web-next/src/components/kit/ActionMenu.tsx

- **Purpose** — ONE overflow menu for table rows and grid cards, replacing two byte-similar implementations plus three hand-written `MenuItem` lists. Row triggers finally get per-row accessible names where that is safe, and the two names the e2e suite asserts are preserved exactly.
- **Extracted from** — `src/views/LandPropertiesPage.tsx:341-373` (`rowActions(h)`, the per-row array with its `danger` flag and the parcels-only Location spread at `:357-371`), `:748-752` (the table trigger: `className="rowActions"`, `size="small"`, the constant `aria-label="Row actions"`), `:763-777` (the page-level `Menu` driven by `rowMenu` state); `src/components/holdingCards.tsx:196-201` (`CardAction`) and `:204-243` (`CardActionsMenu`: the absolutely-positioned trigger at `:211`, `aria-label="Card actions"` at `:214`, the `rgba(10, 26, 17, 0.40)` scrim at `:219` and `color: '#fff'` at `:220`, and the double `stopPropagation` at `:206-211`).
- **API**

```ts
'use client';
import type { MouseEvent } from 'react';
import type { ActionItem } from './types';

export interface ActionMenuProps {
  anchorEl: HTMLElement | null;
  open: boolean;
  onClose: () => void;
  items: ActionItem[];
  /** The menu's accessible name, e.g. "Actions for Sy 214/2". Free-form. */
  menuLabel: string;
}
export function ActionMenu(props: ActionMenuProps);

/** Page-level menu state shared by every row — ONE Menu per table, not one per row. */
export interface ActionMenuController<T> {
  open: (event: MouseEvent<HTMLElement>, row: T) => void;
  close: () => void;
  row: T | null;
  /** Spread onto <ActionMenu {...menu.menuProps} items={…} menuLabel={…} />. */
  menuProps: { anchorEl: HTMLElement | null; open: boolean; onClose: () => void };
}
export function useActionMenu<T>(): ActionMenuController<T>;

export interface RowActionsTriggerProps {
  /**
   * Accessible name. DEFAULTS TO THE LITERAL 'Row actions' — the app's current
   * name. Pass a per-row name only where no test pins the constant.
   */
  triggerLabel?: string;
  onClick: (event: MouseEvent<HTMLElement>) => void;
  disabled?: boolean;
  disabledReason?: string;
}
export function RowActionsTrigger(props: RowActionsTriggerProps);

export interface CardActionsTriggerProps {
  /** Accessible name. DEFAULTS TO THE LITERAL 'Card actions'. */
  triggerLabel?: string;
  /** The menu's accessible name. */
  menuLabel: string;
  items: ActionItem[];
}
export function CardActionsTrigger(props: CardActionsTriggerProps);
```

- **Implementation brief** — `ActionMenu` is one MUI `Menu` with `MenuListProps={{ 'aria-label': menuLabel }}`. Items with `hidden` are dropped entirely. `disabled` items render disabled inside a `Tooltip` + `span` carrying `disabledReason`, and stay announced. `danger` colours the label `error.main`. `dividerBefore` inserts a `Divider`. `icon` renders in a `ListItemIcon` at `fontSize="small"`.

  `confirm` opens the kit `ConfirmDialog` (via `useConfirm`, mounted by this component), awaits `onSelect`, and keeps the dialog open on rejection. Without `confirm`, selecting an item closes the menu first and then runs `onSelect` — the order at `:768-771`.

  Esc and a backdrop click close the menu, and focus returns to the trigger (MUI's default, not to be disabled).

  `RowActionsTrigger` is an `IconAction` with `MoreVertIcon`, `revealOnRowHover` (which adds `className="rowActions"`, whose hover/focus reveal and touch-always-on rules already live at `theme/index.tsx:105-110`), 44×44, `aria-haspopup="menu"` and `aria-expanded`. **`triggerLabel` defaults to the literal `'Row actions'`.**

  `CardActionsTrigger` owns its own menu instance, sits absolutely at `top: 8, right: 8, zIndex: 2`, and calls `stopPropagation` on both the wrapper and the trigger so the enclosing clickable card never fires — both guards at `holdingCards.tsx:206,211` are required, not one. It is always visible (touch). Its scrim circle is built from `alpha(theme.palette.common.black, 0.40)` and `theme.palette.common.white`, with `0.62` on hover — **the same visual, zero hex literals**. **`triggerLabel` defaults to the literal `'Card actions'`.**

  **Accessible-name contract.** `tests/e2e-ux/specs/holdings.spec.ts:105` does `getByRole('button', { name: 'Card actions' })`. The default must never become a template.
- **Do not** — Do not mechanically template the trigger name; `triggerLabel` defaults to the literals and the caller opts in to a per-row name. Do not mount one `Menu` per table row. Do not drop either `stopPropagation`. Do not use a hex scrim. Do not run `onSelect` before closing the menu (for unconfirmed items) — the current order is deliberate.

### apps/web-next/src/components/kit/ZeroState.tsx

- **Purpose** — One component for first-run, no-results, error and idle, plus the `StateSwitch` and `AsyncPanel` that choose between them. This is the highest-severity fix in the whole inventory: today an outage renders "Add your first holding" with an Add CTA, and filtering to zero renders a blank page.
- **Extracted from** — `src/views/LandPropertiesPage.tsx:375` (`const firstRun = !isLoading && holdings.length === 0` — also true when the service is unreachable, because `useLiveOrSample` returns `emptyLike` on failure), `:431-441` (the first-run branch, which replaces the WHOLE page and deliberately omits `sample={isSample}` at `:433`), `:607-757` (the loaded body, which renders a blank grid or a headers-only table when filters exclude everything); `src/components/holdingCards.tsx:287-317` (`EmptyLanding`: `Card`, `py: 9`, emoji at 56px, one mandatory `contained size="large"` CTA); `src/components/EmptyState.tsx:13-29` (bare `Box`, `py: 6`, `ReactNode` icon at 44px, optional action) — two components, one job, incompatible APIs.
- **API**

```ts
'use client';
import type { ReactNode } from 'react';
import type { AsyncStatus, ZeroPlacement, ZeroSpec, ZeroVariant } from './types';

export interface ZeroStateProps extends ZeroSpec {
  variant?: ZeroVariant;          // default 'first-run'
  placement?: ZeroPlacement;      // default 'panel'
  /** Colspan for placement='cell'. DataTable supplies it automatically. */
  colSpan?: number;
}
export function ZeroState(props: ZeroStateProps);

/**
 * An error / outage spec. It structurally CANNOT carry a create CTA — an
 * outage offering "Add your first holding" is a compile error, not a rule.
 */
export type UnreachableSpec = Omit<Partial<ZeroSpec>, 'primaryAction'>;

export interface StateSwitchProps {
  isLoading: boolean;
  isError?: boolean;
  errorMessage?: string;
  onRetry?: () => void;
  /** The whole collection's size, BEFORE search and filters. */
  total: number;
  /** What the user can actually see right now. */
  visibleCount: number;
  /** True when a search term or any filter is set. */
  hasActiveQuery: boolean;
  onClearQuery?: () => void;
  /** True when the backend did not answer. total === 0 must NEVER render first-run. */
  isUnreachable?: boolean;
  skeleton: ReactNode;
  firstRun: ZeroSpec;
  noResults?: Omit<Partial<ZeroSpec>, 'primaryAction'>;
  errorState?: UnreachableSpec;
  placement?: ZeroPlacement;
  /** The loaded body. */
  children: ReactNode;
  /**
   * Called with the resolved state so a scaffold knows whether this state
   * REPLACES the page chrome (first-run) or sits inside it.
   */
  onResolve?: (state: {
    status: AsyncStatus;
    variant: ZeroVariant | null;
    replacesPage: boolean;
  }) => void;
}
export function StateSwitch(props: StateSwitchProps);

export interface AsyncPanelProps {
  isLoading?: boolean;
  isError?: boolean;
  isEmpty?: boolean;
  onRetry?: () => void;
  skeleton?: ReactNode;
  empty: ZeroSpec;
  errorState?: UnreachableSpec;
  placement?: ZeroPlacement;
  children: ReactNode;
}
/** The three-state wrapper for a panel with no filtering (notes, audit, owners, files). */
export function AsyncPanel(props: AsyncPanelProps);

export function resolveAsyncStatus(p: {
  isLoading?: boolean;
  isError?: boolean;
  isEmpty?: boolean;
}): AsyncStatus;

/** Does this state replace the page chrome? Exported so scaffolds agree with it. */
export function replacesPage(variant: ZeroVariant | null): boolean;
```

- **Implementation brief** — **Precedence is fixed and non-negotiable:** `loading` → `error` → `(isUnreachable ? error : first-run)` → `no-results` → `children`. `total === 0` while `isUnreachable` renders the error state, never first-run. That single line is the fix.

  **What replaces the page, written down once, because getting it wrong is most visible on the reference screen:**

  | State | Header | Stats | Tabs | Toolbar | Chip row | Body |
  |---|---|---|---|---|---|---|
  | `loading` | skeleton | skeleton | skeleton | skeleton | — | skeleton |
  | `first-run` | **eyebrow + title only** — no data-state chip, no count chip, no subtitle | **hidden** | **hidden** | **hidden** | **hidden** | the ZeroState, `placement="page"` |
  | `no-results` | full | shown | shown | shown | shown | the ZeroState, `placement="panel"` |
  | `error` | full, with the unreachable chip | shown | shown | shown | shown | the ZeroState, `placement="panel"` |
  | `ready` | full | shown | shown | shown | shown | `children` |

  `replacesPage(variant)` returns `true` only for `'first-run'`, and `StateSwitch` reports it through `onResolve` so `ListScreen` can honour the table above rather than guessing. That row is exactly `LandPropertiesPage.tsx:431-441` preserved.

  `placement="page"` renders a `Card` at `py: 9, px: 3`, centred, with the icon at 56px and a `contained` primary — `EmptyLanding`'s metrics, preserved so the first-run screen looks unchanged. `placement="panel"` renders a bare `Box` at `py: 6, px: 2`, centred, icon at 44px in `text.disabled` — `EmptyState`'s metrics. `placement="cell"` renders a `TableRow` containing one `TableCell colSpan={colSpan}` with the panel body inside.

  `icon` accepts a string (rendered as a large emoji, `aria-hidden`) or a node (rendered at 44px, `text.disabled`) — one component, both existing vocabularies, so `EmptyState.tsx` and `EmptyLanding` both retire.

  A `first-run` state may carry a primary action. `no-results` carries `Clear filters` as a **secondary** and **never a create CTA** (the type forbids `primaryAction`). `error` carries `Try again` wired to `onRetry`, and its copy names the outage rather than blaming the user's query — the defect in `AuditLogPage.tsx:105-112`, `AdminRefDataPage.tsx:138-145` and `ToolsPage.tsx:83-85`.

  Default copy, used when the caller supplies only a partial spec: no-results title `No matches`, body `Nothing matches the current search and filters.`, secondary `Clear filters`. Error title `We could not load this`, body `The service did not answer. Your records are safe — try again in a moment.`, with a `Try again` secondary and no primary.

  `AsyncPanel` never shows `empty` while loading — the defect in all four `GroupDetail` tabs and in `PropertyFilesPanel.tsx:189`.
- **Do not** — Do not render first-run for an outage. Do not offer a create CTA in a no-results or error state. Do not render a blank region when a filter excludes everything. Do not show `empty` while `isLoading`. Do not keep two empty-state components.

### apps/web-next/src/components/kit/ExportAction.tsx

- **Purpose** — The export control, with its columns derived from the table's own definition, a busy state, aria wiring, a scope hint, and no private snackbar.
- **Extracted from** — `src/export/ExportMenu.tsx:36-90` (the whole component: the `variant="outlined" color="inherit"` trigger with `disabled={!rows.length}` at `:55-60`, the three menu items with hardcoded brand hexes at `:67`, `:73`, `:79`, the private `Snackbar` at `:84-88`, and the date-stamped filename at `:42`); `src/views/LandPropertiesPage.tsx:283-294` (`exportCols`, the hand-maintained copy of the table's ten columns), `:295-300` (`exportBrand`), `:301-302` (the per-tab filename), `:525` (`rows={shown}` — the export follows the filters, with nothing telling the user so).
- **API**

```ts
'use client';
import type { Column, ExportBrand } from './types';

export interface ExportActionProps<T> {
  /** Base name; the date stamp is appended by the component. */
  filename: string;
  brand: ExportBrand;
  /** Pass the SAME array the DataTable renders. toExportCols() does the rest. */
  columns: Column<T>[];
  rows: T[];
  /** "Exports the 24 rows currently shown" — tells the user filters apply. */
  scopeNote?: string;
  disabledReason?: string;
  /** Trigger label. Default 'Export'. */
  label?: string;
}
export function ExportAction<T>(props: ExportActionProps<T>);

/** The brand literal, written once instead of five times. */
export const PATTADAR_BRAND: Pick<ExportBrand, 'brand' | 'subtitle' | 'watermark'>;

/** exportBrand('Land & Properties Register') -> a complete ExportBrand. */
export function exportBrand(title: string): ExportBrand;
```

- **Implementation brief** — Wraps the existing `src/export/exporters.ts` writers unchanged, still lazily imported (`exportCsv`, `exportExcel`, `exportPdf`).

  The trigger is `Action role="tertiary"` with `FileDownloadOutlinedIcon`, `aria-haspopup="menu"` and `aria-expanded`. When `rows.length === 0` it is disabled with `disabledReason` (default `There is nothing to export yet.`) rendered as a tooltip — a disabled control that explains itself, not a dead one.

  The menu lists PDF, Excel (.xlsx) and CSV, each with its icon at `color: 'text.secondary'` — the three hardcoded brand hexes are dropped. Above them, `scopeNote` renders as a non-interactive `caption / text.secondary` list item (`disabled` with `sx={{ opacity: 1 }}`), defaulting to `Exports the {n} rows currently shown`, built with `pluralise`.

  Columns come from `toExportCols(columns)` in `kit/columns.ts` — one declaration drives the table and the export, and the `fmt` is always emitted. The filename is the base plus a `-YYYY-MM-DD` stamp plus the extension — `ExportMenu.tsx:42` verbatim.

  While an xlsx or pdf generates, the trigger shows `busy` with `busyLabel="Exporting…"` and stays disabled, so a large PDF no longer blocks silently.

  Failures go through `useToast().error(...)`. `PATTADAR_BRAND` is `{ brand: 'Pattadar', subtitle: 'Andhra Pradesh / Telangana Land Records', watermark: 'PATTADAR' }` — `LandPropertiesPage.tsx:295-300` minus the per-screen `title`, which `exportBrand(title)` supplies. `src/export/ExportMenu.tsx` is removed once all call sites migrate.
- **Do not** — Do not mount a `Snackbar` here. Do not accept a second column list. Do not import `DataTable` to reach `toExportCols`. Do not change the filename format — it is a user-visible convention. Do not colour the format icons with brand hexes.

### apps/web-next/src/components/kit/useRowSelection.tsx

- **Purpose** — Checkbox selection and bulk actions, extracted from two near-copies that have already drifted (only one has shift-range extend), plus the progress-bearing bulk runner and the one standard result toast.
- **Extracted from** — `src/components/tableSx.ts:26-38` (`selectionBarSx`, exported and documented but used by no screen — the atom and the canonical screen disagree about whether tables support bulk actions); `documents/DocumentsTab.tsx:262-309` (the sync effect, the Esc listener, `toggleAll` / `toggleRow` **with** shift-range extend) and `:606-641` (the bar, which replaces the toolbar AND the type-filter chip row) and `:515-556` (the bulk loop and its summary sentence); `documents/RegisteredDeedsTab.tsx:332-362` (the same hook **without** shift-range extend), `:424-453` and `:364-388`.
- **API**

```ts
'use client';
import type { ReactNode } from 'react';
import type { ActionSpec, BulkProgress, RowSelectionApi } from './types';

/**
 * `visibleIds` prunes the selection whenever filtering changes, and installs the
 * Esc-to-clear listener.
 */
export function useRowSelection(visibleIds: string[]): RowSelectionApi;

export interface SelectionBarProps {
  count: number;
  onClear: () => void;
  /** Destructive first, then benign. Clear is rendered last by the component. */
  actions: ActionSpec[];
  /** Determinate progress while a bulk run is in flight. */
  progress?: BulkProgress | null;
  /**
   * Rendered beside the count — e.g. the still-applied filter chips, so the bar
   * never hides state that is still in effect.
   */
  context?: ReactNode;
}
export function SelectionBar(props: SelectionBarProps);

export interface BulkRunner<T> {
  run: (items: T[], fn: (item: T) => Promise<void>) => Promise<void>;
  progress: BulkProgress | null;
  busy: boolean;
}
/** Sequential, progress-reporting, and emits exactly ONE standard summary toast. */
export function useBulkRun<T>(opts: { noun: string; onDone?: () => void }): BulkRunner<T>;
```

- **Implementation brief** — `useRowSelection` holds a `Set<string>` in state and prunes it in a `useEffect` keyed on the joined `visibleIds` (join on a separator that cannot occur in an id, e.g. a pipe), so filtering can never leave a phantom selection. `toggle(id, shiftKey)` extends from the last-clicked row **across the visible order** — the behaviour only one of the two copies has today, and the one that is kept.

  The Esc listener clears the selection, but is **gated on the absence of any mounted overlay**: skip when `document.querySelector('[role="dialog"], .MuiModal-root')` matches, so Esc closes the topmost overlay first. Do not gate on `event.defaultPrevented`; MUI does not set it reliably.

  `SelectionBar` uses `tokens.selectionBarSx` (`primary.container` / `primary.onContainer`, `minHeight: 52`, `RADIUS.control`). Layout: the count `N selected` (`.tnum`), then `context`, then the actions right-aligned. It is an inherited `ActionRegion` with **no primary** — bulk actions are re-spelled `destructive` or `quiet` before the region is ever consulted, so a bulk Delete and a bulk Download never read at the same weight, and the bar cannot outrank the page's own primary whether it is nested in the toolbar's region or not. `Clear` is appended by the component, always last. While `progress` is non-null, a determinate `LinearProgress` renders inside the bar and the actions disable.

  `useBulkRun` runs `fn` over `items` **sequentially**, updating `{ done, total }` after each, collecting failures, and emitting exactly one toast at the end: `N {noun} done` on full success, or `N done, M failed — {first reason}` otherwise. One sentence, one place, replacing the three hand-rolled copies.
- **Do not** — Do not stack the selection bar above the toolbar; `ListToolbar.replaceWith` swaps the cluster while `left` stays mounted. Do not let the bar hide a live filter — pass the chip row as `context`. Do not put a filled button in the bar. Do not gate the Esc listener on `defaultPrevented`. Do not toast per item.

### apps/web-next/src/components/kit/TabbedScreen.tsx

- **Purpose** — LAYER 2. The tab HOST for pages whose tabs are separate collections or unrelated tools, each owning its own toolbar and primary action. It deliberately owns only the header, the tab bar and the panel semantics — which is what Documents and Tools need, and what `ListScreen` must not be bent into.
- **Extracted from** — `src/views/DocumentsPage.tsx:28-58` (a pure tab host that nonetheless calls `useDocuments()` at `:30` — a query no tab uses, duplicating a fetch and letting the header contradict the body — and mounts its own `Snackbar` at `:48-57` with the severity union narrowed to `success|error|info` at `:23-26`); `src/views/ToolsPage.tsx:121-140` (the `?tab=` allowlist at `:40` and the four legacy redirects); `src/views/families/GroupDetail.tsx:141-167` (a hand-rolled section header) and `:247-256` (a fourth `Tabs` spelling); `src/views/AdminRefDataPage.tsx:196-210`.
- **API**

```ts
'use client';
import type { ReactNode } from 'react';
import type { HeaderLevel, StatItem, StatScope, TabPanelItem } from './types';
import type { PageHeaderProps } from './PageHeader';

export interface TabbedScreenProps {
  /** 'page' (default) or 'section' for an in-page host like GroupDetail. */
  level?: HeaderLevel;
  header: Omit<PageHeaderProps, 'below' | 'level'>;
  /** Each tab renders its OWN toolbar, stats, primary action and empty state. */
  tabs: TabPanelItem[];
  value: string;
  onChange: (value: string) => void;
  ariaLabel: string;
  idPrefix: string;
  /** Optional host-level stats above the tab bar (all tabs share them). */
  stats?: { items: StatItem[]; scope: StatScope };
  /**
   * Actions in the header's right slot. The host owns at most one filled button,
   * and a tab that supplies its own primary must not receive one here — a
   * call-site discipline, because the header's region and the panel's content
   * are siblings and neither demotes the other. Use `demote` to settle it.
   */
  actions?: ReactNode;
  /** Rendered instead of the active panel while the HOST's own data loads. */
  loading?: boolean;
  loadingSkeleton?: ReactNode;
  /** Keep inactive panels mounted (preserves a half-typed search). Default false. */
  keepMounted?: boolean;
  /** Dialogs. Rendered after the panels, outside every region. */
  children?: ReactNode;
}
export function TabbedScreen(props: TabbedScreenProps);
```

- **Implementation brief** — Renders `PageHeader` (with `actions`, `level`, and `below` holding the `TabStrip`) → optional `StatTiles` → the active `TabPanel` with full `role` / `id` / `aria-labelledby` wiring from `TabStrip`.

  **A panel opens no `ActionRegion` of its own** — `TabPanel` is rendered bare. A tab is an independent tool, so its content must count exactly as it would at page level: `DocumentsTab`'s `ListToolbar` keeps its filled create action inside a tab for the same reason it keeps it on a page of its own. A wrapper here does the opposite of what it looks like — a panel has nothing of its own to count, so all it does is turn every region the content opens into a nested one and demote it. `RegisteredDeedsTab`'s two filled buttons (`:458` in the toolbar and `:298` inside an expanded row) are fixed at the expander instead: the toolbar is the tab's region at depth 0, and the screen wraps the expanded row's body in an inherited `ActionRegion`, so `Add as Parcel` demotes inside it.

  It does **not** fetch, does not own a toolbar, and does not read a query its tabs do not use. `loading` renders `loadingSkeleton` (default `PageSkeleton` with `toolbar: false`) in place of the panel only while the HOST's own data is pending.

  Tab value comes from `useQueryState` in the page, so `?tab=` keeps working and now writes back. `?tab=deeds` is a routing contract from the retired `/app/deeds` redirect and must still land correctly; so must `/app/sro`, `/app/stamp-duty`, `/app/market-value` and `/app/calculator` on `ToolsPage`.

  Pure orchestration: the grep for `bgcolor|borderRadius|border:|boxShadow|#[0-9a-fA-F]{3}` in this file must return empty.
- **Do not** — Do not own a toolbar. Do not fetch. Do not pass a `primaryAction` to the host when the active tab supplies one. Do not narrow the toast severity union. Do not render a tab body without `role="tabpanel"`.

### apps/web-next/src/components/kit/DataTable.tsx

- **Purpose** — One table. Columns declared once drive the head, the cells, the sort AND the export. It bakes in sticky heads, 52px rows, right-aligned tabular numerals, hover-reveal row actions, selection, expandable rows with an automatic colSpan, and its own three states.
- **Extracted from** — `src/views/LandPropertiesPage.tsx:690` (`<TableContainer component={Card} sx={stickyHeadSx}>`), `:691` (`<Table size="small">`, which is why rows are dense against a spec that says 52px), `:692-706` (the eleven head cells), `:708-753` (the body: the first-cell `Link component="button"` at `:711-718`, the outlined kind chip at `:721-726`, the unstyled left-aligned Extent and Value cells at `:739-740` — while the card's figure uses `.tnum` at `:678` — the litigation/status chips at `:741-747`, and the `className="rowActions"` trigger at `:748-752`), `:283-294` (the export columns, the second declaration of the same ten); `src/components/tableSx.ts:10-19` (`stickyHeadSx`); `src/views/AdminRefDataPage.tsx:93-176` (the private `RefTable` — already 80% of this component but unimportable); `src/views/AuditLogPage.tsx:127-172` (the expandable row with a handler-less `IconButton` at `:135`, no `aria-expanded`, a keyboard-dead `TableRow` at `:129-133` and a hand-counted `colSpan={5}`); `src/views/documents/RegisteredDeedsTab.tsx:576` (`colSpan={12}` hand-counted against a 12-column head).
- **API**

```ts
'use client';
import type { ReactNode } from 'react';
import type {
  ActionItem, Column, RowKey, RowLabel, RowSelectionApi, SortState, ZeroSpec,
} from './types';

export interface DataTableSelection extends Pick<RowSelectionApi, 'selected'> {
  onToggle: (id: string, shiftKey: boolean) => void;
  onToggleAll: (checked: boolean) => void;
  /** Whole-table disable with a stated reason — never a silently dead checkbox. */
  disabled?: boolean;
  disabledReason?: string;
}

export interface DataTableExpandable<T> {
  isExpanded: (row: T) => boolean;
  onToggle: (row: T) => void;
  render: (row: T) => ReactNode;
  /** Renders a designed loading body for a lazily-fetched expander. */
  loadingRow?: (row: T) => boolean;
}

export interface DataTableTotals {
  label: string;
  /** Keyed by column key. Adapts to the LIVE column count — no hand-counted colSpan. */
  values: Record<string, ReactNode>;
}

export interface DataTableProps<T> {
  columns: Column<T>[];
  rows: T[];
  getRowKey: RowKey<T>;
  /** Names the table for assistive tech, e.g. "Land parcels and properties". */
  ariaLabel: string;

  /** Makes the first column a real button and the row keyboard-reachable. */
  onRowOpen?: (row: T) => void;
  /** Also names the row's overflow trigger when a per-row name is requested. */
  rowLabel: RowLabel<T>;
  rowActions?: (row: T) => ActionItem[];
  /** Accessible name for the row trigger. Default 'Row actions'. */
  rowActionsLabel?: string;

  sort?: SortState;
  onSortChange?: (sort: SortState) => void;

  selection?: DataTableSelection;
  expandable?: DataTableExpandable<T>;
  totals?: DataTableTotals;

  /** Rendered as one full-width row inside the tbody. */
  emptyState?: ZeroSpec;
  isLoading?: boolean;
  skeletonRows?: number;

  /** Bounded scrollport + pinned head. Default true. */
  sticky?: boolean;
  maxHeight?: number | string;
  /** false forces a full-width table with no surface of its own (inside a Card). */
  surface?: boolean;
}
export function DataTable<T>(props: DataTableProps<T>);

/** Standalone totals row, for a table assembled by hand. */
export function TotalsRow<T>(props: {
  label: string;
  columns: Column<T>[];
  values: Record<string, ReactNode>;
});
```

- **Implementation brief** — Structure: `TableContainer` (`component={Card}` when `surface !== false`, carrying `stickyHeadSx` when `sticky`, with `maxHeight` overriding the token's `min(72vh, 680px)`) → `Table` with `aria-label={ariaLabel}` → `TableHead` → `TableBody`.

  **Rows are `height: ROW_HEIGHT` (52) with MUI's `hover`.** Do not pass `size="small"`; that is exactly what makes the live table dense against the spec.

  Visible columns are `screenColumns(columns)` filtered again by `hideBelow`: a column whose breakpoint is not met is **dropped from the DOM** via `useMediaQuery(theme.breakpoints.up(bp))`, so nothing ever overflows horizontally. The container-scoped scrollport is the second line of defence, not the first.

  Head cells render `column.header` in the `overline` role, `align="right"` for `numeric`. `sortable` wraps the header in `TableSortLabel` with `active` and `direction` from `sort`, calling `onSortChange` with the next `{ key, dir }` (asc → desc → null). **Sorting is presentational here**: `DataTable` never reorders `rows`; the screen owns the comparator (and may use `compareBy` from `kit/columns.ts`).

  Body cells render `column.render?.(row)` when present, otherwise `columnValue(column, row)` with `dash` substituted for `''`. `numeric` adds `align="right"` and `className="tnum"` — which is what ends the Extent/Value inconsistency between the card and the table. `nowrap` adds `whiteSpace: 'nowrap'`; `width` sets the cell width.

  `onRowOpen` turns the **first visible column's** cell into an `Action role="quiet" size="compact"` rendered as a text button at `fontWeight: 600` with `underline` on hover — a real, focusable control, replacing both `Link component="button"` and the keyboard-dead `<Box onClick>` at `DocumentsTab.tsx:750-758`.

  `rowActions` renders a trailing `align="right"` cell holding a `RowActionsTrigger` (`className="rowActions"`, default name `'Row actions'`, per-row name available via `rowLabel`) wired to one page-level `useActionMenu` instance — one `Menu` per table, never one per row.

  `selection` prepends a checkbox column: the head checkbox is `indeterminate` when a partial selection is live, and the whole column is disabled with a `Tooltip` reason when `disabled`. Row checkboxes pass `event.shiftKey` through to `onToggle`.

  `expandable` prepends a disclosure column whose control is a **real button** with `aria-expanded`, `aria-controls={detailRowId}` and a label that flips between `Show details for {rowLabel}` and `Hide details for {rowLabel}`. `Enter` and `Space` on the row also toggle it. The detail row is a `TableRow` with one `TableCell` whose `colSpan` is **computed from the live visible column count** plus the selection and action columns — never hand-counted. While `loadingRow(row)` is true the body renders `SectionSkeleton`, not a spinner.

  `totals` renders a footer `TableRow` that maps the live visible columns to `values[column.key]`, with `label` in the first cell — so adding a column cannot break it, unlike `PassbookDetailPage.tsx:519-523`'s `colSpan={5}`.

  States: `isLoading` renders `TableSkeleton` with the live column count inside the same container. `emptyState` renders `ZeroState placement="cell"` with the computed `colSpan`.

  At 400px: `hideBelow` drops the optional columns, the container scrolls horizontally within its own bounds, and the page body never does.
- **Do not** — Do not sort the rows. Do not use `size="small"`. Do not hand-count a `colSpan`. Do not mount one `Menu` per row. Do not put `toExportCols` in this file. Do not render a `CircularProgress` in an expander. Do not let a column that is hidden at a breakpoint still occupy DOM.

### apps/web-next/src/components/kit/CardGrid.tsx

- **Purpose** — The grid view: one breakpoint declaration shared with the skeleton, a genuinely keyboard-operable clickable card, a media band whose pills are real chips and whose gradient is theme-driven, and a cached `fileRef` resolver so a 40-card grid stops issuing 40 uncached fetches.
- **Extracted from** — `src/views/LandPropertiesPage.tsx:608` (the grid breakpoints, missing `xl` in the skeleton at `Skeletons.tsx:59`), `:610-620` (the `Card role="link" tabIndex={0} aria-label` with its Enter handler and the `e.target === e.currentTarget` guard — Space does NOT activate today), `:621` (`CardActionsMenu`), `:622` (`CardHero` with its `pill` / `pill2` pair), `:623-685` (the whole card body: title row with the type chip at `:625-628`, owner at `:630-632`, the always-present location row with the place icon at `:633-638`, the chip row at `:639-676`, the footer rule at `:677-684`); `src/components/holdingCards.tsx:47-74` (`useBlobUrl`: one uncached fetch per card, failures swallowed), `:95-114` (`clickableCardSx`, with no `:focus-visible`), `:122-194` (`CardHero`: the blue gradient at `:148` against a docblock claiming emerald, `alt=""` at `:156`, the scrim at `:177-185`, the pills as plain `Box`es at `:186-191`).
- **API**

```ts
'use client';
import type { ReactNode } from 'react';
import type {
  ActionItem, MediaRefState, MediaResolver, MediaSource, PillSpec,
} from './types';

export interface CardGridProps {
  children: ReactNode;
  /** Switches to repeat(auto-fit, minmax(min(100%, N), 1fr)). Omit for fixed columns. */
  minItemWidth?: number;
}
/** THE grid: xs 1 / sm 2 / lg 3 / xl 4, gap 24 — declared once in tokens.cardGridSx. */
export function CardGrid(props: CardGridProps);

export interface ClickableCardProps {
  /** Announced as the card's accessible name, e.g. "Open Sy 214/2". */
  ariaLabel: string;
  onOpen: () => void;
  /** 'link' (default) or 'option' for selector grids (adds aria-selected). */
  role?: 'link' | 'option';
  selected?: boolean;
  children: ReactNode;
}
export function ClickableCard(props: ClickableCardProps);

export interface CardHeroProps {
  media: MediaSource;
  /** Zero to N chips over the media — not the current pill/pill2 pair. */
  pills?: PillSpec[];
  height?: number;   // default 140
}
export function CardHero(props: CardHeroProps);

export interface MediaCardProps {
  ariaLabel: string;
  onOpen: () => void;
  media?: MediaSource;
  pills?: PillSpec[];
  actions?: ActionItem[];
  /** Accessible name for the card's overflow trigger. Default 'Card actions'. */
  actionsLabel?: string;
  title: string;
  titleChip?: ReactNode;
  subtitle?: string;
  /** ALWAYS rendered with the place icon; an absent value shows the em-dash. */
  location?: string;
  /** Metadata / filter-shortcut chips under the body. */
  chips?: ReactNode;
  /** The rule at the bottom: one figure (tnum) + one caption. */
  footer?: { figure: ReactNode; caption: ReactNode };
  selected?: boolean;
}
/** The whole card anatomy, assembled. Screens pass DATA; the kit derives no pill. */
export function MediaCard(props: MediaCardProps);

/** Cached and in-flight-deduped across every card on the page. */
export function useMediaRef(fileRef?: string): MediaRefState;

/** Injects the storage resolver so the kit never hardcodes a gateway path. */
export function MediaRefProvider(props: { resolve: MediaResolver; children: ReactNode });
```

- **Implementation brief** — `CardGrid` renders a `Box` with `tokens.cardGridSx`, or with `repeat(auto-fit, minmax(min(100%, ${minItemWidth}px), 1fr))` when `minItemWidth` is given. The `min(100%, N)` is what stops a fixed minimum from overflowing a 400px viewport.

  `ClickableCard` is a MUI `Card` carrying `tokens.clickableSurfaceSx`. It owns `role`, `tabIndex={0}`, `aria-label`, **`Enter` AND `Space`** (Space also `preventDefault`s to stop the page scrolling — today only Enter works, `LandPropertiesPage.tsx:616-618`), and the `e.target === e.currentTarget` guard so a click on an inner control never opens the card. `role="option"` adds `aria-selected`. **Selection is a tint plus an inset ring** (`boxShadow: 'inset 0 0 0 2px'` in `primary.main`) — never a border-width change, which shifts content by a pixel (`FamiliesGroupsPage.tsx:144-148`). Focus is the composed `focusRingSx`, which `clickableCardSx` lacks today.

  `CardHero` is a `Box` at `position: relative, height, flexShrink: 0, overflow: hidden`. Its fallback background is a theme callback composing `primary.dark` → `primary.main` → `primary.light` through `color-mix`/`alpha`, plus the radial highlight from `common.white` at low alpha — the same visual as `holdingCards.tsx:148`, with **zero hex**. The image renders as `component="img"` at `objectFit: 'cover'` with `alt={media.alt ?? ''}`; a failed `fileRef` falls back to the gradient plus `fallbackIcon` rather than a broken image. The scrim is `linear-gradient` from `alpha(common.black, 0.32)` to transparent — the values at `:182`, token-sourced.

  Pills render as `StatusChip size="small"` at `top: 12, left: 12`, gap `GAP.tight`, **each inside its own small scrim** (`alpha(common.black, 0.25)`, `borderRadius: RADIUS.pill`, 2px inset) so contrast holds over an arbitrary cover photo. `pills` is an array: the `pill` / `pill2` cap is gone.

  `MediaCard` assembles the anatomy in exactly the source order: `CardActionsTrigger` (absolute, `actionsLabel` defaulting to `'Card actions'`) → `CardHero` → body `Box` at `p: GAP.block, display: flex, flexDirection: column, gap: GAP.control, flexGrow: 1` → title row (`space-between`, title at `fontSize: 17 / fontWeight: 600 / noWrap / ellipsis`, `titleChip` with `flexShrink: 0`) → `subtitle` (`body2 / text.secondary / noWrap`, em-dash when empty) → **the location row, always rendered** (`PlaceOutlinedIcon` at `fontSize: 16, ml: -0.25, flexShrink: 0`, then the value or the em-dash, `noWrap`) → `chips` row (`flexWrap: wrap, gap: 0.75, mt: 0.25`) → footer (`mt: 'auto', pt: GAP.cluster, borderTop: 1, borderColor: 'divider', space-between, alignItems: baseline`, figure at `fontSize: 17 / fontWeight: 700 / className="tnum"`, caption `body2 / text.secondary`). **The location row is never conditionally omitted** — omitting it changes card height and breaks the grid's vertical rhythm.

  `useMediaRef` keeps a **module-level** `Map<string, { promise: Promise<string>; url: string; refs: number }>` so N cards asking for the same `fileRef` issue one request, with an LRU cap of 60 and `URL.revokeObjectURL` on eviction — not on every unmount, which is what makes scrolling back up re-fetch today. Each request passes an `AbortSignal` from the calling component's effect. Failures resolve to `{ status: 'failed', url: '' }` and are never thrown — the cover is decorative.

  `MediaRefProvider` injects the resolver; mount it once in `AppShell` with the `/api/gateway/storage/files/{ref}/content` fetch through `apiFetch`, so the gateway path lives in the app, not the kit. `useMediaRef` outside a provider returns `{ status: 'idle', url: '' }` and warns once in development.
- **Do not** — Do not omit the location row. Do not cap pills at two. Do not use a hex gradient or a hex scrim. Do not change a border width to show selection. Do not fetch per card without dedupe. Do not hardcode the storage path. Do not forget Space, or the `currentTarget` guard.

### apps/web-next/src/components/kit/MapSurface.tsx

- **Purpose** — THE map component the founder asked for by name. One editing axis, one height token set, every control as a real MUI button in one toolbar, designed loading / empty / error states, and an imperative handle so no parent ever remounts a map with a React `key` again.
- **Extracted from** — `src/components/GeoMap.tsx:25-52` (the three-way editing API: `readOnly`, legacy `mode`, interactive `drawMode`), `:187` (scroll-wheel zoom hardcoded on), `:188` (the always-expanded Leaflet layers control), `:514-531` and `:539-554` and `:584-593` (the raw inline-styled search box and footer buttons, ~25-27px tall with no interaction states), `:556-564` (the 12px-radius, primary-bordered container that matches nothing else in the app), `:594-601` (the guntas area readout); `src/components/GeoMapLazy.tsx:18-31` (the lone `CircularProgress` in a 380px, 24px-radius dashed box that becomes a 430px, 12px-radius map); `src/views/detail/ParcelDetailPage.tsx:299-521` (`GeoSection`: the four emoji-labelled buttons at `:424-452`, the second inline control bar, the measurements card at `:458-476`, the delete confirm at `:502-518`, the unvalidated Advanced GeoJSON paste at `:491-499`) and `:1036` (`key={p.geoPoint}` — a full remount on every save); `src/views/detail/PropertyDetailPage.tsx:529-546` (the read-only, search-less, readout-less dead end); `src/views/holdings/LocationDialog.tsx:63-90` (the mode `Select` at `:72-75`, `key={mapMode}` at `:80`, and the display-vs-save divergence between `value={target.geoPoint}` and the separate `geo` state at `:34,48-51`).
- **API**

```ts
'use client';
import type { ReactNode } from 'react';
import type {
  ConfirmSpec, MapControls, MapError, MapFeature, MapHeight, MapLayer,
  MapMeasurement, MapMode, MapSurfaceHandle, MapSurfaceRef, StatusTone, ZeroSpec,
} from './types';

export interface MapSurfaceProps {
  /** Always controlled. A GeoJSON Point or Polygon STRING — the persisted contract. */
  value?: string | null;
  onChange?: (geojson: string) => void;

  /** ONE editing axis. Changing it NEVER remounts the map. Default 'view'. */
  mode?: MapMode;
  onModeChange?: (mode: MapMode) => void;
  /** Which mode buttons to offer. [] hides the mode control entirely. Default []. */
  allowedModes?: MapMode[];

  height?: MapHeight;                   // default 'standard'
  /** Ranked geocode candidates, most specific first. Caller-built, never derived. */
  autoLocate?: string[];

  controls?: MapControls;
  defaultLayer?: MapLayer;
  /** Default FALSE. A map must not trap page scroll; the kit shows a ctrl/cmd hint. */
  scrollZoom?: boolean;

  /** Routed through ConfirmDialog. Without it, no Clear button is rendered. */
  onClear?: () => void;
  clearConfirm?: ConfirmSpec;

  /** Independent of mode, so a read-only map can still show its area. */
  measurements?: 'none' | 'inline' | 'external';
  onMeasure?: (m: MapMeasurement) => void;

  /** One typographic role for the line above the map. */
  caption?: ReactNode;
  status?: { tone: StatusTone; label: string };

  features?: MapFeature[];
  onFeatureClick?: (id: string) => void;
  /** ReactNode, not an HTML string — GeoMap's `label` prop is an injection seam. */
  popup?: ReactNode;

  /** Shown INSTEAD of the map chrome when there is no value and nothing to locate. */
  empty?: ZeroSpec;
  busy?: boolean;
  onError?: (e: MapError) => void;

  /** REQUIRED. Names the map region, e.g. "Boundary of Sy 214/2". */
  ariaLabel: string;
  ref?: MapSurfaceRef;
}
export function MapSurface(props: MapSurfaceProps);

/** compact 280 · standard 430 · tall 560. 'fill' is viewport-measured. */
export const MAP_HEIGHTS: { readonly compact: 280; readonly standard: 430; readonly tall: 560 };
```

- **Implementation brief** — `MapSurface` renders `GeoMapLazy` with `showSearch={false}`, `showLayerControl={false}`, `scrollWheelZoom={scrollZoom}` (default false), `layer={defaultLayer}`, `accentKey={colorScheme}` from `useColorScheme()`, `onReady` capturing the `GeoMapHandle`, and `onError` forwarded. It supplies **every** control itself, as `Action` / `IconAction`, in ONE toolbar above the map, in a fixed order:

  `[modes] [locate] [search] [layers] | [undo] [clear]`

  Mode buttons are a segmented control over `allowedModes`, each an `Action` with `aria-pressed`, so the conditional-`contained` emphasis hack at `ParcelDetailPage.tsx:424` disappears. Changing `mode` maps onto `GeoMap`'s `drawMode` (`'view'` → `'off'`, `'pin'` → `'marker'`, `'draw'` → `'polygon'`) which never remounts.

  **Accessible names are a hard e2e contract.** `tests/e2e-ux/specs/parcel-detail.spec.ts:67-69` asserts buttons matching `/Draw boundary|Edit boundary/`, `/Drop pin|Move pin/` and `/Use my location/`. The mode buttons render exactly `Draw boundary` / `Edit boundary` (when a polygon exists), `Drop pin` / `Move pin` (when a point exists), and the locate button renders exactly `Use my location`. Icons go through `startIcon`; **no emoji in any label** — `:424`, `:434` and `:445` currently put the glyph in the string.

  Container chrome is `Section variant="card"` — `RADIUS.card`, `surfaceSx`, no bespoke primary hairline. One treatment, replacing four.

  `caption` renders above the toolbar as `Typography variant="body2" color="text.secondary"` — one type role, replacing the raw 12px `Box`, the `body2` and the `caption` in the three consumers. `status` renders as a `StatusChip` beside it.

  The lazy placeholder is `MapSkeleton` at the **same height and radius** as the loaded map, including the toolbar row — removing the 380→430px and 24px→12px jump. An `ErrorBoundary` around the lazy map catches a failed Leaflet chunk and renders `ZeroState variant="error"` with `Try again`.

  `empty` renders **instead of** the map chrome when there is no `value`, no `features` and no `autoLocate` — the founder's rule that empty must not draw a full screen's chrome.

  `measurements="inline"` renders an area / perimeter / corner readout beneath the map, formatted through `kit/format` in ONE unit system (acres via `@pattadar/core`), replacing the guntas-vs-cents double readout. `'external'` calls `onMeasure` only. It is independent of `mode`, so a read-only map can still state its area — the gap at `PropertyDetailPage.tsx:544`.

  `onClear` renders a `Clear` `Action role="destructive"` routed through `ConfirmDialog` with `clearConfirm`; without `onClear` there is no Clear button, so a boundary can never be erased in two clicks the way `LocationDialog.tsx:88` allows.

  `scrollZoom` false renders a `ctrl + scroll to zoom` hint over the map on wheel, and never traps the page.

  `MapSurfaceHandle` (`fitTo`, `invalidate`, `focus`, `undoPoint`, `clear`) is exposed through `ref` and delegates to the `GeoMapHandle` from `onReady`. **This is what replaces both `key=` remount hacks** (`LocationDialog.tsx:80`, `ParcelDetailPage.tsx:1036`), each of which costs the view, a Nominatim call and any focus inside the map.

  `value` is always controlled and always re-synced, in every mode — so a refreshed `geoPoint` reaches the map and a dialog can never display one shape while saving another.

  A file-header comment records the **known seams this does not close**: Leaflet's own search implementation, its un-named marker/vertex buttons, and `GeoMap`'s private geo maths duplicating `@pattadar/core`. The next reader must not assume the map is done.
- **Do not** — Do not remount the map for any reason. Do not put an emoji in a control label, and do not change the four asserted names. Do not enable scroll-wheel zoom by default. Do not render a lone spinner while the chunk loads. Do not let the map draw full chrome when there is nothing to show. Do not duplicate the area readout in two unit systems. Do not pass `popup` as an HTML string. Do not build a geocode cascade inside the kit — `autoLocate` is caller-supplied, because the parcel's village→mandal→district→state and the property's address→locality→city→district are different by design.

### apps/web-next/src/components/kit/ListScreen.tsx

- **Purpose** — LAYER 2. The whole list screen as one component: header, stats, tabs, toolbar, filters, chip row, selection, grid/table body, and all four async states. Properties becomes a ~200-line consumer of this, so the reference screen is itself the migration proof rather than an exception.
- **Extracted from** — `src/views/LandPropertiesPage.tsx:429-760` in full: the `firstRun` branch at `:431-441` (which replaces the page), the header at `:445-451`, the per-tab stat row at `:454-483`, the tabs + toolbar row at `:486-536`, the filter panel at `:539-566`, the collapsed chip row at `:569-605`, the grid at `:607-688`, the table at `:690-757`, the row menu at `:763-777`, the delete confirm at `:780-795` and the toast at `:821-825`; plus the loading branch at `:420-427` that drops the entire control surface.
- **API**

```ts
'use client';
import type { ReactNode } from 'react';
import type {
  ActionSpec, Column, DataStatus, ExportBrand, FilterField, FilterValues,
  HeaderLevel, RowKey, RowLabel, SortState, StatEmphasis, StatItem, StatScope,
  TabItem, ViewMode, ZeroSpec,
} from './types';
import type { PageHeaderProps } from './PageHeader';
import type { DataTableExpandable, DataTableTotals } from './DataTable';
import type { UnreachableSpec } from './ZeroState';

/**
 * Explicitly declared pass-through options for the table body. NOT an Omit of
 * DataTableProps: an Omit rots silently the first time DataTable gains a field,
 * and forces an implementer to read two declarations to know what this accepts.
 */
export interface ListTableOptions<T> {
  sort?: SortState;
  onSortChange?: (sort: SortState) => void;
  expandable?: DataTableExpandable<T>;
  totals?: DataTableTotals;
  onRowOpen?: (row: T) => void;
  rowActions?: (row: T) => import('./types').ActionItem[];
  rowActionsLabel?: string;
  sticky?: boolean;
  maxHeight?: number | string;
  surface?: boolean;
  skeletonRows?: number;
}

export interface ListScreenProps<T, Ctx = unknown> {
  /** 'page' (default) or 'section' for a list nested inside a record or a tab. */
  level?: HeaderLevel;
  header: Omit<PageHeaderProps, 'below' | 'level'>;

  stats?: { items: StatItem[]; scope: StatScope; emphasis?: StatEmphasis };

  tabs?: {
    items: TabItem[];
    value: string;
    onChange: (value: string) => void;
    ariaLabel: string;
    idPrefix: string;
  };

  search?: { noun: string; value: string; onChange: (value: string) => void };
  view?: { value: ViewMode; onChange: (value: ViewMode) => void; persistKey?: string };

  filters?: {
    fields: FilterField<Ctx, T>[];
    values: FilterValues;
    ctx: Ctx;
    onChange: (next: FilterValues) => void;
    onClear: () => void;
    open: boolean;
    onOpenChange: (open: boolean) => void;
  };

  /**
   * DATA, not a node — ListScreen demotes it to tonal while the list is empty so
   * the ZeroState owns the one filled button.
   */
  primaryAction?: ActionSpec;
  secondaryActions?: ActionSpec[];
  toolbarExtras?: ReactNode;

  exportConfig?: { filename: string; brand: ExportBrand; scopeNote?: string };

  selection?: {
    enabled: boolean;
    actions: ActionSpec[];
    /** Kept beside "N selected" so a live filter is never hidden. */
    context?: ReactNode;
    progress?: { done: number; total: number } | null;
  };

  /** The rows to render — already searched, filtered and sorted by the screen. */
  rows: T[];
  getRowKey: RowKey<T>;
  rowLabel: RowLabel<T>;
  /** The collection size BEFORE search and filters. Drives first-run vs no-results. */
  total: number;

  /** Table body, and the single source for export columns via toExportCols(). */
  columns?: Column<T>[];
  table?: ListTableOptions<T>;
  /** Grid body. Required when view.value can be 'grid'. */
  renderCard?: (row: T) => ReactNode;
  /**
   * ESCAPE HATCH. Replaces the body entirely while keeping every piece of chrome.
   * Code-review gated: today only a type-aware member table and a map-backed list
   * legitimately need it.
   */
  renderBody?: (rows: T[]) => ReactNode;

  state: DataStatus;

  empty: ZeroSpec;
  noResults?: Omit<Partial<ZeroSpec>, 'primaryAction'>;
  errorState?: UnreachableSpec;

  /** Dialogs, hidden inputs, menus. Rendered after the body, outside every region. */
  children?: ReactNode;
}
export function ListScreen<T, Ctx = unknown>(props: ListScreenProps<T, Ctx>);
```

- **Implementation brief** — **Pure orchestration. This file owns no styling.** The grep `grep -nE 'bgcolor|borderRadius|border:|boxShadow|#[0-9a-fA-F]{3}'` over it must return empty; if a style is needed, it belongs in a primitive.

  Render order:

  1. `StateSwitch` is evaluated **first**, with `total`, `rows.length`, `hasActiveQuery`, the skeleton and the four specs, and its `onResolve` captured. `hasActiveQuery` is computed here as `Boolean(search?.value.trim()) || activeFilterCount(filters?.values ?? {}) > 0`.
  2. When the resolved variant is `first-run` (`replacesPage` true), render **only** `PageHeader` reduced to `{ eyebrow, title }` — no `dataState`, no `titleChips`, no `subtitle`, no stats, no tabs, no toolbar, no chip row — followed by the `ZeroState placement="page"`. That is `LandPropertiesPage.tsx:431-441` preserved byte-for-byte in behaviour.
  3. Otherwise render `PageHeader` with the full `header` plus `below={<><TabStrip/><ListToolbar/></>}` → `StatTiles` → `FilterPanel` → `FilterChipRow` → the body from `StateSwitch`.

  `ListToolbar` receives `left={tabs && <TabStrip …/>}` when tabs exist (Properties puts them in the same row, `:486-491`), `search={<SearchField …/>}`, `viewToggle={<ViewToggle …/>}`, `filters={<FilterTrigger …/>}`, `extras={toolbarExtras}`, `exportAction={exportConfig && <ExportAction columns={columns} rows={rows} …/>}` and `primaryAction={primaryAction && <Action {...primaryAction} role="primary" demote={total === 0} />}`. `regionName` is the header title plus ` toolbar`.

  Export columns come from the same `columns` array via `toExportCols`, so the table and the export can never disagree.

  Selection: when `selection.enabled`, wire `useRowSelection(rows.map(getRowKey))` into `DataTable.selection`, and pass `replaceWith={<SelectionBar …/>}` to `ListToolbar` while `count > 0` — so `left` and the chip row stay mounted and a live filter is never hidden.

  Body: `renderBody` wins if given; else `view.value === 'grid'` renders `<CardGrid>{rows.map(renderCard)}</CardGrid>`; else `<DataTable columns={columns} rows={rows} … {...table} />`. The skeleton passed to `StateSwitch` is `PageSkeleton` with `view` taken from the live `view.value`, `tabs` from whether tabs exist, and `stats` from the live tile count — so nothing pops in and nothing reflows.

  **It holds no domain state.** Tab value, filter values, search and view all arrive as props from `useQueryState`, which is exactly why per-tab predicates, per-tab stat sets and dataset-scoped stats survive untouched.

  Responsive: every layout decision is delegated (`toolbarRowSx` wraps, `cardGridSx` collapses to one column, `DataTable` drops `hideBelow` columns). `ListScreen` adds nothing of its own.

  **Properties' migration is four sub-steps, each verified against `tests/e2e-ux/specs/holdings.spec.ts` before the next begins:** (1) header + stats, (2) toolbar + filters + chip row, (3) grid, (4) table + dialogs. Do not do it as one 828→200-line rewrite.
- **Do not** — Do not put a colour, border, radius or shadow in this file. Do not render the header, stats or toolbar above a first-run state. Do not hold tab, filter, search or view state. Do not `Omit` `DataTableProps`. Do not let `renderBody` ship without review. Do not compute stats, predicates, pills or row shapes.

### apps/web-next/src/components/kit/RecordScreen.tsx

- **Purpose** — LAYER 2. The record page: hero, media banner, tabs, back link, and the loading / not-found / unreachable states. The two 360 pages are near-twins across roughly twenty blocks; this is where that duplication dies.
- **Extracted from** — `src/views/detail/ParcelDetailPage.tsx:995-1019` (the hand-rolled header whose title is `h6`, and the `Sample data` chip at `:1010-1014` whose tooltip claims bundled sample data the app no longer paints), `:1021` (`MediaHero`), `:1027-1040` (the six tabs and the `{tab === 'x' && …}` switch with no tab-panel semantics), `:1042` (the back link as `Link component="button"`), `:1036` (`key={p.geoPoint}`); `src/views/detail/PropertyDetailPage.tsx:682-713` (the same header with `Edit details` + a red-text `Delete`), `:699-703` (the same stale chip), `:715` (`MediaHero`), `:716-729` (the same six tabs), `:731` (the back link), `:204-215` (`attentionBadges`, which exists only here); `src/views/detail/PassbookDetailPage.tsx:373-379` (a skeleton promising a page header and a hero the page does not have), `:382` (`NotFoundCard` rendered during an outage because `sampleFor(id)` returns null for any real id, `:166-167`), `:411-463` (the third hand-rolled header), `:466-471` (four `StatCard`s dropped into a hand-built flex with no container); `src/views/detail/common.tsx:333-380` (`MediaHero`: the hard-coded gradient at `:366`, the `rgba(0,0,0,0.65)` / `#fff` chips at `:316-318`, and the mouse-only hero at `:354-358` with `role="button"` but no `tabIndex` and no key handler), `:119-131` (`NotFoundCard`).
- **API**

```ts
'use client';
import type { ReactNode } from 'react';
import type {
  ActionSpec, DataState, MediaSource, PillSpec, TabPanelItem, ZeroSpec,
} from './types';

export interface RecordHeroProps {
  /** The page's single h1, at the page-title scale (not h6, as today). */
  title: string;
  eyebrow?: string;
  /** Tonal status chips: status, classification, stake. Passed as DATA. */
  pills?: PillSpec[];
  /** Outlined metadata chips. */
  metaChips?: ReactNode;
  /** The muted "extent · address" line. */
  summary?: ReactNode;
  /** Tax overdue / EC stale / litigation. Severity is the caller's domain triage. */
  attention?: PillSpec[];
  dataState?: DataState;
  /** Editable avatar (the passbook holder's photograph). */
  avatar?: { media?: MediaSource; onEdit?: () => void; editLabel?: string };
  /** One primary at most, plus secondaries and one destructive (red text). */
  actions?: ActionSpec[];
}
export function RecordHero(props: RecordHeroProps);

export interface RecordMediaProps {
  photos: Array<{ fileRef: string; name?: string }>;
  videos?: Array<{ fileRef: string; name?: string }>;
  /** Opens the in-portal FileViewer — never a new tab (founder rule). */
  onOpen: (index: number) => void;
  height?: number;                    // default 240
  fallbackIcon?: ReactNode | string;
  /** "Add a photo" when there is no media, instead of an empty gradient. */
  emptyAction?: ActionSpec;
}
export function RecordMedia(props: RecordMediaProps);

export interface RecordScreenProps {
  hero: RecordHeroProps;
  media?: RecordMediaProps;
  tabs: TabPanelItem[];
  value: string;
  onChange: (value: string) => void;
  idPrefix: string;
  tabsAriaLabel: string;
  back: { label: string; href: string } | { label: string; onClick: () => void };
  state: {
    isLoading: boolean;
    /** Only true for a genuine 404 — an outage must NOT render not-found. */
    notFound?: boolean;
    isUnreachable?: boolean;
    onRetry?: () => void;
  };
  notFound?: ZeroSpec;
  /** Dialogs. */
  children?: ReactNode;
}
export function RecordScreen(props: RecordScreenProps);
```

- **Implementation brief** — **Pure orchestration; the same empty-grep rule applies to this file.**

  Structure: back link (through `PageHeader.back`, rendered as an `Action role="quiet"` or a Next link — never `Link component="button"`) → `RecordHero` → optional `RecordMedia` → `TabStrip` → the active `TabPanel`.

  `RecordHero` renders through `PageHeader level="page"` so the record title is the page's single `h1` **at the `h4` scale**, ending the `h6`-titled record pages. `pills` render as `StatusChip kind="status"`, `metaChips` as outlined chips, `attention` as `StatusChip` with the caller's tone, `dataState` as the one `ServiceStateChip` — replacing the "Sample data" chip and its untrue tooltip on all three record pages. `avatar` renders a `ClickableCard`-style focusable `ButtonBase` around the image with `aria-label={editLabel ?? 'Change photo'}` when `onEdit` is set — never an `Avatar` with a bare `onClick` named only by a `Tooltip` (`PassbookDetailPage.tsx:414-429`). `actions` go through the header's `ActionRegion`: at most one `primary`, the rest `secondary` / `tertiary`, and at most one `destructive` (red text, confirmed).

  `RecordMedia` is the cover banner, built on `CardHero` at `height` (default 240). The photo and video counts are **real, named buttons** (`IconAction` / `Action role="quiet" size="compact"`, e.g. `View 4 photos`), not `Box`es with `onClick` — `common.tsx:385-417`. The banner itself is a `ButtonBase` with `tabIndex` and Enter/Space. With no media and an `emptyAction`, it renders the action rather than an empty gradient.

  A tab panel opens no `ActionRegion`. The hero's region is the header's action cluster, which is a **sibling** of the panel and never its ancestor, so a record's Edit and a tab's Add note already do not compete — while a region around the panel would have made every `Section` in that tab a nested region and tonalised the Add note.

  **State precedence, which is the bug fix:** `isLoading` → `isUnreachable` → `notFound` → content. `isUnreachable` **outranks** `notFound`, so an outage renders `ZeroState variant="error"` with `Try again` instead of "Passbook not found or not yours" (`PassbookDetailPage.tsx:382`). Loading renders `RecordSkeleton` shaped like THIS page — hero, tabs, sections — not the header/hero/table triple that currently promises furniture the page never shows.

  `RecordHero` derives nothing: pills, attention badges and the action set all arrive as data, so the parcel/property/passbook differences (Delete present or absent, parcels-only Location, the type-adaptive attributes) stay in the feature.
- **Do not** — Do not render not-found during an outage. Do not emit a second `h1`, and do not title a record at `h6`. Do not derive a pill. Do not use `Link component="button"` for the back link. Do not promise furniture in the skeleton that the page will not render. Do not open media in a new tab.

---

## Barrel

`apps/web-next/src/components/kit/index.ts` — the single import surface. Views import from `src/components/kit` and never reach into a file path, so internal reorganisation never touches a screen. It carries no `'use client'`: it is a re-export barrel, and each leaf carries its own directive.

```ts
/**
 * The web-next component kit — one import surface.
 *
 * Views import from 'src/components/kit' and never from a file inside it.
 * Enforced by an eslint `no-restricted-imports` rule forbidding deep imports
 * into src/components/kit/** from src/views/**, shipped alongside the rule
 * banning bare <Button> / <IconButton> imports inside src/views/**.
 *
 * Contract: docs/specs/2026-09-14-web-component-kit-contract.md
 */

// Layer 0 — types and pure helpers
export * from './types';
export * from './tokens';
export * from './format';
export * from './columns';

// Layer 1 — hooks
export * from './useQueryState';
export * from './useFilePicker';
export * from './useRowSelection';

// Layer 1 — primitives
export * from './Action';
export * from './ActionMenu';
export * from './ConfirmDialog';
export * from './FormDialog';
export * from './SearchField';
export * from './TabStrip';
export * from './FilterBar';
export * from './StatusChip';
export * from './StatTiles';
export * from './Section';
export * from './ZeroState';
export * from './KitSkeletons';
export * from './DataTable';
export * from './CardGrid';
export * from './ExportAction';
export * from './PageHeader';
export * from './ListToolbar';
export * from './FieldGrid';
export * from './MapSurface';
export * from './ToastProvider';

// Layer 2 — scaffolds
export * from './ListScreen';
export * from './TabbedScreen';
export * from './RecordScreen';
```

---

## Verification checklist

Run these before calling any band done.

1. `cd apps/web-next && bunx tsc --noEmit` — clean.
2. `grep -rnE 'bgcolor|borderRadius|border:|boxShadow|#[0-9a-fA-F]{3}' src/components/kit/{ListScreen,TabbedScreen,RecordScreen}.tsx` — **empty**.
3. `grep -rnE '#[0-9a-fA-F]{3,8}' src/components/kit/` — **empty**.
4. `grep -rn 'JSX.Element' src/components/kit/` — **empty**.
5. `grep -rn "from '@mui/material/Button'\|from '@mui/material/IconButton'" src/views/` — empty once migration completes.
6. `grep -rn 'CircularProgress' src/components/kit/` — **empty**.
7. The four accessible names the suite pins still resolve: `Card actions`, `List view`, `Grid view`, and the three map buttons `/Draw boundary|Edit boundary/`, `/Drop pin|Move pin/`, `/Use my location/`.
8. `?pb=`, `?group=` and `?tab=` still land correctly on `/app/parcels`, and `Clear all` now clears a deep-linked group filter and it stays cleared.
9. All three colour schemes rendered: a `StatusChip` of each tone, a `Card`, a table head, a skeleton and a stat row — nothing white-on-white, nothing invisible.
10. 400px viewport: no horizontal page scroll on any migrated screen.

---

## Rollout

`find apps/web-next/src/views -type f \( -name '*.tsx' -o -name '*.ts' \)` returns **42 files**: **35 view components** and **7 non-view modules** (data, constants and pure helpers that render nothing). All 42 are listed; nothing under `src/views/` is omitted.

**Tier meanings.** `full-list` — adopts the whole Properties kit via `ListScreen` (scaffold + toolbar + filters + view toggle + card/table + all four states). `tabbed-container` — hosts tabs via `TabbedScreen`; each tab owns its own body, toolbar and primary action. `detail` — a record surface on `RecordScreen` plus the content-area primitives (`Section`, `FieldGrid`, `AsyncPanel`, `StatusChip`). `form-tool` — no scaffold; takes `FormDialog` / `FormSection` / `FormGrid`, the `Action` vocabulary and the content-area rules only. `shell-only` — no scaffold at all: `PageHeader` plus free-standing primitives, because the body is heterogeneous panels rather than one collection. `none` — genuinely out of scope, with the reason stated.

**Ordering.** Rows are grouped by tier, and within `full-list` by migration order: Properties first (it is the proof), then its two nearest siblings, then the rest. No screen may be migrated before build-order band 8 lands; `form-tool` and `shell-only` rows only need band 5.

| View | Tier | Uses | Changes | Risk |
|---|---|---|---|---|
| `views/LandPropertiesPage.tsx` | full-list | `ListScreen`, `TabStrip`, `FilterBar`, `StatTiles`, `SearchField`, `ViewToggle`, `ExportAction`, `DataTable`, `CardGrid`, `ActionMenu`, `ConfirmDialog`, `ZeroState`/`StateSwitch`, `useQueryState`, `useFilePicker`, `StatusChip`, `format` | 828 lines → ~200-line consumer. Columns declared **once** and drive head, cells, sort and export (kills the `exportCols` L283-294 / table-cell L694-704 divergence). One `ActionMenu` replaces the card menu (`holdingCards:227-240`) and the page-level row menu (L763-777). `useQueryState` writes tab/view/search/filters back to the URL, and its `seedOnce` kills the render-phase `setFGroup` at L227-229 that makes a deep-linked `?group=` permanently unclearable. `StateSwitch` splits first-run / no-results / error, so an outage stops rendering "Add your first holding" with an Add CTA. The Filters button becomes `Action role="secondary"` with a pressed state — the second filled button in the toolbar region disappears. The page `Snackbar` (L821-825) and `ExportMenu`'s private one collapse into `ToastProvider`; errors stop auto-hiding. Delete confirm becomes `ConfirmDialog` and no longer closes on a failed mutation. | **High** — the reference screen: four domain dialogs, two e2e specs, three live deep links. Migrate alone, verify, then stop. |
| `views/PassbooksPage.tsx` | full-list | `ListScreen`, `FilterBar`, `StatTiles`, `SearchField`, `ViewToggle`, `ExportAction`, `DataTable`, `CardGrid`, `ActionMenu`, `ConfirmDialog`, `ZeroState`, `useQueryState` | Toolbar geometry flips to the canonical order — search stops being pinned far-left behind a `flexGrow` spacer (L237). **Gains** the filter panel it never had: village / mandal / district / group / has-parcels are already fetched and rendered in the table (L420-429) and become `FilterBar` fields. Gains the no-results state that today leaves a blank grid under a greyed-out Export. The card loses the 40px `Avatar` that duplicates its own `CardHero` photo (L285 + L289). `acres.toFixed(2)` (L345-347) is replaced by `formatArea`, matching its own stat tile at L214. The grid gains the missing `xl` column. The inert khata `Box` becomes the same clickable `StatusChip` Properties uses. | **Medium** — closest sibling to Properties; the delete cascade and the "card opens the filtered parcel list" contract are the sharp edges. |
| `views/InvitationsPage.tsx` | full-list | `ListScreen`, `StatTiles`, `SearchField`, `FilterBar`, `ExportAction`, `DataTable`, `ActionMenu`, `ConfirmDialog`, `FormDialog`, `StatusChip` | The toolbar moves out of `PageHeader.actions` (L186-197) into `ListToolbar`. The pending count leaves the subtitle string (L179-183) and becomes `StatTiles` (Pending / Accepted / Revoked / Expired). Gains search and a status/role/scope `FilterBar` — the facets already exist as `STATUS_CHIP` (L55-60). The table spelling normalises from `<Card><TableContainer>` onto `DataTable`. The delete confirm gains the `busy` state it lacks (L374-377), so a double-tap can no longer fire two deletes. **Revoke** (L142) gains a `ConfirmDialog` — today it fires straight from the menu while Delete beside it confirms. The send dialog becomes a 560px `FormDialog` with blur validation. The empty-state tonal downgrade it already does correctly becomes `ListToolbar`'s `isEmpty` contract. | **Medium** — status-gated row actions, and the scopeId hide-in-UI / keep-in-export contract, must be carried through as data. |
| `views/AuditLogPage.tsx` | full-list | `ListScreen`, `StatTiles`, `SearchField`, `FilterBar`, `ExportAction`, `DataTable` (expandable), `ZeroState`/`StateSwitch` | `DataTable.expandable` replaces the hand-rolled Fragment + second `TableRow` + `colSpan={5}`, and the disclosure button finally owns its own `onClick` and `aria-expanded` — today L135 has an aria-label, no handler, and works only because the click bubbles from the `<TableRow onClick>` at L129. The row becomes keyboard-reachable. The single message at L105-112 that covers no-data, no-results **and** service-unreachable splits into three `ZeroState` variants. Gains actor / action-type / date-range filters and a `StatTiles` row (Events / Actors / Today / Last activity). Gains `ToastProvider` — today a failed query silently renders "No activity recorded". `rowActions` stays absent: append-only by design. | **Low** — read-only, no mutations, no deep links. The right first non-Properties migration. |
| `views/NotificationsPage.tsx` | full-list | `ListScreen`, `TabStrip`, `StatTiles`, `SearchField`, `ExportAction`, `DataTable`, `ActionMenu`, `ConfirmDialog`, `StatusChip` | The `ToggleButtonGroup` at L134-143 stops meaning "data scope" and becomes a `TabStrip` (All / Failures) with counts, so one control never means two things across screens. `rows.length` / `failureCount` (L77) surface as `StatTiles`. Gains search — the most text-heavy table in the app has none — and `ExportAction`, which every other table screen already has. The bare delete `IconButton` (L227-238) folds into `ActionMenu`, so a destructive action stops being one click closer here than anywhere else. The delete confirm gains `busy`. The duplicate `h2` "Sent notifications" under the page title is removed. `CHANNEL_COLOR` (L53-57) retires into `StatusChip`, ending the third status-colour vocabulary. | **Low–Medium** — the `stub · not delivered` provider state and the `isFailure` union must survive as data. |
| `views/documents/DocumentsTab.tsx` | full-list | `ListScreen` (headerless, inside `TabbedScreen`), `FilterBar` (chip mode), `SearchField`, `ViewToggle`, `ExportAction`, `DataTable`, `CardGrid`, `useRowSelection`/`SelectionBar`, `useBulkAction`, `useFilePicker`, `ActionMenu`, `ConfirmDialog`, `ZeroState` | Selection moves to `useRowSelection`, so the toolbar swaps **in place** without unmounting the search box or hiding the live TYPE filter — today L609-702 hides both while both are still applied to `shown`. The bare TYPE chip row gains an active count and Clear via `FilterBar`'s chip mode. The 7 hand-written `MenuItem`s (L794-858) become an `ActionMenu` array with a `danger` flag. The name cell stops being a keyboard-dead `<Box onClick>` (L750-758). Gains the grid/thumbnail view it lacks. The empty state gains the Upload action its own copy already tells the user to press (L704-711 passes none). `disabled={isSample}` at L723/744/779 is deleted as unreachable. Upload caps and the background classify round trip move into `useFilePicker` + `storage.ts`. | **Medium–High** — 10-file / 1 GB caps, the classify round trip, storage-offline-as-info and the in-portal `FileViewer` rule all survive verbatim. |
| `views/documents/RegisteredDeedsTab.tsx` | full-list | `ListScreen` (headerless), `SearchField`, `FilterBar`, `ExportAction`, `DataTable` (expandable), `useRowSelection`, `useBulkAction`, `ActionMenu`, `ConfirmDialog`, `ZeroState`, `Section`, `FieldGrid` | Gains search and filters — 638 lines with no way to find a deed by doc no, survey, SRO or village — which also fixes the only Export in the app that exports unfiltered source rows (`rows={data.deeds}`, L456). `DataTable.expandable` computes its own colSpan, killing the hand-counted `colSpan={12}` (L576), and makes the row keyboard-operable with real `aria-expanded` (L529 has no handler today). The expander's hand-rolled label/value pairs become `FieldGrid` + `Section`. The lone `CircularProgress` (L197-198) becomes a shaped skeleton. Selection gains shift-range extend, matching its sibling tab. Its private "Sample data — the live service is not reachable." caption (L589-593) is deleted in favour of one host-level service chip. `Register a Deed` and the expander's `Add as Parcel` stop being two filled buttons because the screen wraps the expanded row's body in an inherited `ActionRegion`: the toolbar is the tab's region at depth 0 and keeps the fill, and everything inside the expander — including the `Section` the field pairs move into — counts inside that wrap and demotes. | **Medium–High** — the legally-ordered wide record, the one-way `Add as Parcel` / `Link to Passbook` split, and the deliberate absence of a `/app/deeds` detail route. |
| `views/detail/PropertyFilesPanel.tsx` | full-list | `ListScreen` (headerless, embedded — emits **no** `h1`), `DataTable`, `ExportAction`, `useFilePicker`, `useRowSelection`, `ActionMenu`, `ConfirmDialog`, `ZeroState`/`AsyncPanel`, `ToastProvider` | Mounts inside a record tab, so it takes the list body without the page header. `isLoading` is finally honoured (ignored at L189 today), so the tab stops painting the empty sentence before the first fetch resolves. The table gains `stickyHeadSx`, 52px rows and the `.rowActions` reveal class (today a bare `overflowX:'auto'`, L449). Its private `Snackbar` (L588) folds into `ToastProvider`, ending the stacked-snackbar problem with its host page, and errors stop auto-hiding at 4s. The duplicated upload pipeline (L235-336 — line-for-line `DocumentsTab` L311-427) collapses into `useFilePicker`; storage-offline and batch-cap severities reconcile to one treatment. The dropzone **or** the Upload button — not both in one region. The row menu gains a whole-menu disabled reason instead of the unexplained `disabled={isSample}` at L490. Gains bulk selection. | **Medium** — two different parents; the parcel-scope nested Drive filing and the trash-not-hard-delete flow are load-bearing. |
| `views/tools/MarketValueTool.tsx` | full-list | `ListScreen` (headerless, `component="h2"` section header), `FilterBar` (cascade), `SearchField`, `ExportAction`, `DataTable`, `ZeroState` | A list screen wearing tool clothing. Gains a section header — today there is no title element at all, so the heading order jumps from the page `h1` straight to the table. The three bare cascading selects (L61-76, L88-92) become one `FilterBar` with dependent options, labelled controls, an active count, Clear and a collapsed chip row. Gains search and `ExportAction`. The in-table `colSpan={7}` empty row (L157-165) — the only one in the app — becomes `ZeroState`, split into no-results vs unreachable, so a backend outage stops blaming the user's query. The table gains a sticky head and a bounded scrollport (neither today, L123). The `repeat(${Math.min(3, shown.length)}, 1fr)` template literal (L95) becomes `CardGrid`'s breakpoint object. | **Low–Medium** — the fixed district → mandal → village cascade order and the per-row rate unit must stay. |
| `views/FamiliesGroupsPage.tsx` | full-list | `ListScreen` (grid-only, `renderBody` for the detail pane), `CardGrid` (selectable), `StatTiles`, `SearchField`, `ActionMenu`, `ZeroState`, `FormDialog`, `useQueryState`, `ActionRegion` | The selector grid becomes `CardGrid` with `selected` expressed as tint + ring — no 1→2px border nudging content by a pixel — and real `role` / `tabIndex` / Enter / `aria-current`; today the cards (L141-192) are unreachable by keyboard entirely. Gains search, a `StatTiles` row (groups / members / passbooks) and a per-card `ActionMenu`, so Edit and Delete stop being buried in `GroupDetail`'s header. `useQueryState` makes the selected group deep-linkable and Back-restorable — today `?group=` is only emitted **out** toward Properties (L185), never accepted. The bespoke Card + `EmptyState` first-run collapses into `ZeroState`. The screen wraps the `renderBody` detail pane in an inherited `ActionRegion`, so `Create Group` in the toolbar keeps the fill and `GroupDetail`'s `Add member` — which reaches the screen through that pane's own `PageHeader level="section"` region — demotes inside it; the screen stops shipping two filled buttons. Grid rhythm moves onto the canonical gap and breakpoints. | **Medium** — master/detail with no route; the implicit `?? groups[0]` auto-selection and the typed-group vocabulary swap must be preserved deliberately, not inherited. |
| `views/DocumentsPage.tsx` | tabbed-container | `TabbedScreen`, `PageHeader`, `TabStrip`, `StatTiles`, `ToastProvider`, `KitSkeletons` | Becomes a pure `TabbedScreen` host. `TabStrip` writes `?tab=` back to the URL (read once at mount today, never updated) and emits real `role="tabpanel"` / `aria-controls` / `aria-labelledby`, which no tab host in the app does. The duplicate `useDocuments()` fetch at L30 — a query **no tab uses**, whose state can contradict the body — is deleted; the service chip is driven by the active tab's own query. Its narrowed toast union (`success|error|info`, L23-26) widens to the kit's, so children can finally warn. Gains a per-tab `StatTiles` slot and a page-level skeleton. Both tabs keep their own toolbars and primary actions, filled: a panel opens no region, so each tab's `ListToolbar` is at depth 0 exactly as it would be on a page of its own, and the host's own header action — if it ever grows one — is a sibling region rather than an ancestor. | **Low** — thin host. The `?tab=deeds` redirect from the retired `/app/deeds` route is the one thing to verify. |
| `views/ToolsPage.tsx` | tabbed-container | `TabbedScreen`, `PageHeader`, `TabStrip`, `ListScreen` (inlined SRO table), `SearchField`, `ExportAction`, `DataTable`, `ZeroState` | `TabStrip` becomes scrollable by default, fixing the four labels that overflow at 400px — and, critically, the four-tab strip nested above `CalculatorTool`'s own four-tab strip. All four tools take their title from the same `PageHeader` section mode: today it is `PageHeader` for SRO, a hand-rolled `h2` for Calculator, a card-buried `h6` for Stamp Duty, and nothing at all for Market Value. The SRO directory becomes a headerless `ListScreen` and gains the `ExportAction` every other reference table has, plus district and DR-zone filters. The "No offices match / Try a district or mandal name" copy that blames the user for a backend outage (L83-85) splits into `ZeroState` no-results vs unreachable. The three competing unreachable signals across the four tabs collapse into one. | **Low** — the `?tab=` allowlist at L40 and the four legacy redirects (`/app/sro`, `/app/stamp-duty`, `/app/market-value`, `/app/calculator`) must keep resolving. |
| `views/AdminRefDataPage.tsx` | tabbed-container | `TabbedScreen`, `TabStrip`, `DataTable`, `SearchField`, `FilterBar`, `ExportAction`, `ZeroState`, `Section` | Its private `RefTable` (L93-176) — already 80% of `DataTable`, with generic `cols`, `render`, `align`, `searchKeys` and export mapping, but importable by nobody — is **deleted** and replaced by the kit's. That removes the third column dialect and the L113-117 translation layer that exists only to convert it into `ExportCol`. All five reference tables gain `ExportAction`; Districts gains a state filter, and the 115-row fee schedule gains a reg-type filter and sortable columns. The empty copy written to cover no-data and no-results at once (L141-143) splits into two. Counts move out of tab labels into `TabStrip` count badges. The Analytics coming-soon Alert becomes `ZeroState variant="idle"`. Read-only: no row actions, ever. | **Low** — government reference data, no mutations. Fee rates stay fractions rendered as 2dp right-aligned tabular percentages; Telugu columns keep a Telugu-capable stack and are never truncated. |
| `views/detail/ParcelDetailPage.tsx` | detail | `RecordScreen`, `PageHeader`, `TabStrip`, `Section`, `FieldGrid`, `GlanceRow`, `StatusChip`, `MapSurface`, `FormDialog`, `ConfirmDialog`, `ActionMenu`, `AsyncPanel`, `ToastProvider` | The record title moves from a hand-rolled `h6` onto `PageHeader`'s h1 scale. Tabs gain `role="tabpanel"`, `?tab=` deep links and scroll-on-overflow. The `glance` counters (L789-796) — non-focusable divs with `onClick` — become `GlanceRow` buttons. `MapSurface` takes over the geo tab: one `mode: 'view' | 'pin' | 'draw'` axis, every control a real MUI button in one toolbar (retiring the emoji-in-label buttons at L424/434/445 and the raw inline-styled Undo/Clear below the map), one measurement formatter (today guntas from `GeoMap` **and** cents from `formatArea` on one screen), and an imperative handle that kills `<GeoSection key={p.geoPoint}>` (L1036) so a save no longer discards pan/zoom and re-runs Nominatim. Dates route through `FieldGrid`'s `format`, ending the raw-ISO vs `fmtDMY` split with its twin. The edit dialog becomes a `FormDialog` with blur validation and `type="date"` inputs. The "Sample data" chip becomes the one honest service-state chip. Gains a record-level Delete to match its twin. | **High** — the only boundary editor on the platform. `tests/e2e-ux/specs/parcel-detail.spec.ts:60-70` pins `.leaflet-container` and the names `/Draw boundary\|Edit boundary/`, `/Drop pin\|Move pin/`, `/Use my location/`. The fencing estimate, the recorded-vs-drawn extent comparison and `updateParcel`'s verbatim field set are untouchable. |
| `views/detail/PropertyDetailPage.tsx` | detail | `RecordScreen`, `PageHeader`, `TabStrip`, `Section`, `FieldGrid`, `GlanceRow`, `StatusChip`, `MapSurface`, `DataTable`, `FormDialog`, `ConfirmDialog`, `AsyncPanel`, `ToastProvider` | Near-twin of Parcel across roughly twenty blocks; both collapse onto `RecordScreen`. The owners table gains a `TableContainer`, `stickyHeadSx` and 52px rows — today a bare `<Table>` (L660-677) and a horizontal-overflow risk at 400px — and gains row actions, so ownership stops being display-only. `MapSurface` gets a real non-editing `mode="view"` **with** measurements and an "add a location" affordance, replacing today's dead read-only map (`showSearch={false}`, no way to set `geoPoint` anywhere in the UI). Edit section headers move from `caption` to the spec's `overline`, matching its twin; EC status and mutation status become selects, matching its twin. Delete keeps its `Action role="destructive"` trigger — the one place in the app that already gets destructive right — and its inline mutation/router/catch chain moves into a named handler so `ConfirmDialog` can absorb it with an `onSuccess` hook. The two competing note systems are reconciled or cross-referenced. | **High** — type-adaptive attributes must preserve non-type keys written by Add Property (`boundaries`, `stamp_duty`, `deed_type`, L312-325), and `updateProperty` erases omitted fields. |
| `views/detail/PassbookDetailPage.tsx` | detail | `RecordScreen`, `PageHeader`, `TabStrip`, `Section`, `StatTiles`, `FieldGrid`, `DataTable`, `StatusChip`, `FormDialog`, `ConfirmDialog`, `AsyncPanel`, `ToastProvider` | Gains the `PageHeader` it never had — the h1 currently lives inside a Card (L434) — with an editable avatar slot for the holder photo. The four bare `StatCard`s dropped into a hand-built flex Box (L466) go back inside `StatTiles`, recovering the container, dividers and sizing. The parcels table becomes a `DataTable` with a sticky head and a totals row that derives its own colSpan (hard-coded `colSpan={5}` today, L519-523). Gains tabs, `NotesPanel`, `AuditTrailPanel`, a files panel, Edit and record-level Delete — all present on both sibling record pages and absent here. Its `{msg, err:boolean}` toast shape converges on `notify(msg, severity)`, which is what today forces `AddParcelHereDialog`'s notify prop to disagree with `PassbookCreateDialog`'s. **Bug fix:** `sampleFor(id)` returning `{passbook:null}` (L166-167) makes an outage render "Passbook not found or not yours" — `RecordScreen`'s unreachable state replaces that. Hand-built `₹` strings route through `format.inr`. | **Medium–High** — `formatArea` / `toAcres` round-tripping, the derived cost-per-acre write-back, and the Total reconciliation row are domain law. |
| `views/families/GroupDetail.tsx` | detail | `RecordScreen` (`component="h2"`), `PageHeader` section mode, `TabStrip`, `DataTable`, `SearchField`, `ExportAction`, `StatTiles`, `ActionMenu`, `ConfirmDialog`, `FormDialog`, `AsyncPanel`, `ZeroState`, `ActionRegion` | The hand-rebuilt header (L141-167) becomes `PageHeader` section mode, which already exists for exactly this. All four tabs finally read the `isLoading` their hooks already expose (`familiesData.ts:252-256`) — today a loading group paints full table chrome plus a false "No members yet — click Add member." Four `TableContainer`s gain `stickyHeadSx` (all four opt out today) and become `DataTable`. Counts leave prose (L152-156, L405-414) for `StatTiles`. Members gain search; Land / Invitations / Activity gain export, and the export filename stops being the group-agnostic `pattadar-family`. `ActivityTab`'s three-column table becomes the `AuditTrailPanel` timeline that already exists. The notifier reorder `↑` / `↓` links — roughly 8×20px with a single glyph as their entire accessible name — become labelled `IconAction`s, and `Remove` and `Unassign` gain `ConfirmDialog`. The tab-reset effect stops depending on `group.name` / `group.description`, so renaming no longer throws the user from Activity back to Members. The `wa.me` `target="_blank"` is removed per the no-new-tabs rule. The remove-member confirm gains the body text it lacks. | **High** — 24 button call sites, the largest single source of vocabulary drift. Notifier escalation policy, minor/guardian gating, `isSelf` immutability, the >100% share warning and the "whole estate vs a specific parcel" distinction are all product law. |
| `views/detail/common.tsx` | detail | Dissolved into `Section`, `FieldGrid`, `StatusChip`, `AsyncPanel`, `ZeroState`, `CardGrid` media band, `format` | Not a page — the app's only pre-existing shared content-area kit, and it is absorbed rather than migrated. `SectionCard` becomes `Section` (20px padding, overline title, a `state` prop). `Field` / `FieldGrid` become the kit's, with `format` applied once so dates cannot diverge per page. `STATUS_COLOR` (L38-49), which deliberately mixes parcel and property-holding vocabularies, becomes `StatusChip`'s map and must keep accepting **both**. `NotesPanel` and `AuditTrailPanel` wrap in `AsyncPanel`, so a failed fetch stops reading as an empty record — today both `catch()` into `[]`. `MediaHero`'s hard-coded blue gradient and `rgba(0,0,0,0.65)` chips become theme tokens, and the mouse-only hero (`role="button"`, no `tabIndex`, no key handler) becomes keyboard-operable with real Chips. `NotFoundCard`'s back `Button href` reconciles with the pages' `Link component="button"`. The file then survives only as a deprecation shim re-exporting the kit, deleted in the final step. | **Medium** — three record pages import it simultaneously. Migrate it in the same commit as `RecordScreen`, never before. |
| `views/ProfilePage.tsx` | form-tool | `PageHeader`, `FormSection`, `FormGrid`, `Action`/`ActionRegion`, `ToastProvider`, `ConfirmDialog` (dirty guard), `KitSkeletons` | Page scaffold and action vocabulary only — no list, no scaffold. Adopts the 560px standard width, overline section headers (replacing two `h6` card titles) and blur-time validation wired to `TextField` `error`/`helperText`; today a 3-digit Aadhaar submits silently. Gains a dirty-state guard, so the `me` re-seed effect at L70-79 can no longer discard edits on a refetch. `TableSkeleton rows={4}` over a two-card form (L118) becomes a form-shaped skeleton. Save stops being silently dead when the service is unreachable (L257) — it gains a disabled reason, or stays live and reports failure through the toast like every list page. Its bottom-center `filled` snackbar anchor — which is the **spec-correct** one, unlike Properties' — becomes the kit default. The districts select's private "loads from the live service" helper text retires into the one service-state treatment. | **Medium** — DPDP: Aadhaar stays `type="password"`, digit-stripped, capped at 12, cleared after save and never echoed; only the server's masked reference renders. Every writable field must still round-trip through the read query or the mutation wipes it. |
| `views/tools/StampDutyTool.tsx` | form-tool | `PageHeader` section mode, `FormSection`, `FormGrid`, `Action`, `ZeroState` (`idle`), `ToastProvider`, `ExportAction`, `KitSkeletons` | Gains a real section header — today an `h6` inside `CardContent` (L101-103) while its sibling SRO tab gets a proper one in the same tab strip. Blur-time validation replaces the single combined submit-time error, and field errors move from an in-form Alert onto the fields. The full-width contained primary — the only one in the app — becomes a standard-width `Action role="primary"`. `EmptyState` repurposed as an idle panel (L179-183) becomes `ZeroState variant="idle"`, so the shared component stops being pulled in two directions. Gains a toast: today a mid-calculation query failure silently falls back to local math and presents the result as if it came from the service (L66-79). Gains export/copy of the breakup. `TableSkeleton` over a form (L95) becomes a form skeleton. | **Low–Medium** — the Autocomplete value stays the fee-schedule **row** object, not a label; duty is charged on the higher of consideration and guideline value; the fixed line-item order and the "online payment is not yet available" warning stay attached to the computed total. |
| `views/tools/CalculatorTool.tsx` | form-tool | `PageHeader` section mode, `TabStrip`, `FormSection`, `FormGrid`, `StatTiles` (`plain`), `ZeroState` (`idle`), `Action`, `format` | Gains the section header it has none of (hand-rolled `h6` + `body2`, L307-313). Its inner `TabStrip` becomes scrollable — the worst overflow risk in the app, four labels nested inside `ToolsPage`'s own four. The fencing figures (L231-258) and the `AreaResult` key/value `<Table>` (L60-71) become `StatTiles variant="plain"`. "Add at least 3 points to compute an area" becomes `ZeroState variant="idle"`, matching how Stamp Duty states the same situation. Inline `round2(...).toLocaleString('en-IN')` (L66-67, L82, L246, L254) routes through `format`. **No** loading, empty-data or unreachable states are added — the scaffold must not force them onto a screen with no network. | **Low** — the `usePerimeter` cross-tab handoff and the `key={perimeterFt}` remount-to-reseed semantics must survive; `UNITS` / `LENGTH_UNITS` stay data-driven from `@pattadar/core`; the GeoJSON textarea stays monospace. |
| `views/holdings/AddParcelDialog.tsx` | form-tool | `FormDialog`, `FormSection`, `FormGrid`, `Action` | Width standardises to 560 — from `sm`/600 here, and from the `md`/900 of the edit dialog that writes the same record. The undifferentiated 2-column grid (L108-185) gains overline section headers and `minmax(0,1fr)` tracks that actually collapse at 400px. The `tried`-flag + bare `error`-prop model (L57, L117-142) — fields painted red with **no** helperText saying what is wrong, and only after a submit attempt — becomes blur validation with messages, an error summary and focus-the-first-error. `OK` (L192) becomes a named primary. Esc and backdrop are blocked while saving. Its footer shape is the one ten dialogs already agree on and becomes `FormDialog`'s reference. | **Low** — `toAcres` canonicalisation into acres, the seven-unit entry list, and the passbook-required rule are the only invariants. |
| `views/holdings/AddPropertyDialog.tsx` | form-tool | `FormDialog` (+ extracted batch-import shell), `FormSection`, `FormGrid`, `Action`, `useFilePicker`, `ZeroState`, `ConfirmDialog`, `KitSkeletons`, `ToastProvider` | Stops resizing itself mid-flow (`sm` → `lg`, L589). Gains a dialog-level close in the choose step, which today has **no** `DialogActions` at all (L782). The `<Box onClick>` dropzone (L602-620) — no role, no tabIndex, no accessible name, and it is the dialog's primary path — becomes the kit's labelled, keyboard-operable dropzone. Draft rows (L648-670) become a real listbox with `aria-selected`. The lone `CircularProgress` (L616-620, L772) becomes a shaped skeleton. Remove-draft gains a `ConfirmDialog` — it destroys unsaved extracted data today. Errors stop landing in three places at once for one draft. `useReadingMessage` is imported from `documents/readingMessages.ts` instead of re-implemented. The shared batch shell — step machine, `runPool`, `MAX_DRAFTS`, `DraftBadge`, the 260px\|1fr grid, the spinner pane, the footer — is factored out and shared with `PassbookCreateDialog`; the two are the same ~700-line dialog written twice. | **Medium–High** — agricultural deeds must auto-route to the parcel register, and a lone agricultural file must route **without** ever flashing the batch UI (L273-326). `EXTRACT_CONCURRENCY=2` / `MAX_DRAFTS=5` are cost controls on a heavy vision-LLM endpoint, not UI preferences. Partial-failure semantics (successes dropped, failures retained for retry) stay. |
| `views/passbooks/PassbookCreateDialog.tsx` | form-tool | `FormDialog` (+ the same batch-import shell), `FormSection`, `FormGrid`, `Action`, `useFilePicker`, `ZeroState`, `ConfirmDialog`, `ToastProvider` | Consumes the same extracted batch-import shell as `AddPropertyDialog`; only the reading messages, the extraction endpoint, the "What I read" renderer, the form, the save function and the labels stay per-domain. Its `dropzone(compact)` helper (L461) — the abstraction this file already found, while its twin inlines both variants — becomes the kit's, and gains role, tabIndex and an accessible name. It drops its inline `useReadingMessage` copy for the shared hook. Saving becomes pooled with a "3 of 5" progress signal instead of an unbounded sequential loop behind one "Saving…" label (L428-433). The freeSolo cascading Autocompletes reconcile with the select-`TextField` idiom used by every other picker in the cluster — one idiom, declared, not two. Esc and backdrop are blocked while saving. | **Medium** — a passbook import creates its **parcels** too, with the domain unit default `'Acres-Guntas'`; the mirror-to-Drive → extract → attach-as-`passbook` three-step contract, with attach-failure as a warning rather than a save failure, must survive; the empty-result retry for Telugu passbooks stays; "or enter the details manually →" stays reachable. |
| `views/documents/DeedImportDialog.tsx` | form-tool | `FormDialog`, `FormSection`, `FormGrid`, `Action`, `useFilePicker`, `KitSkeletons` | Adopts the 560 / wide width tokens and the one footer with a two-source `busy` flag (`saving || importing`). Its `useRef`-driven file picker becomes `useFilePicker` — the fourth of four distinct file-picker implementations across four files, now one. Gains drag-and-drop, which both sibling import dialogs already have, and a per-file remove control. It already imports the shared `useReadingMessage`; that stays the reference for the other two. | **Low** — extraction is long-running and the dialog must stay open with both actions disabled while it runs. |
| `views/families/PersonDialog.tsx` | form-tool | `FormDialog`, `FormSection`, `FormGrid`, `Action`, `useFilePicker`, `ConfirmDialog` (dirty guard), `StatusChip` | Width drops from `md` to the 560 standard. `subtitle2` headings become overline section headers. Gains blur validation, a `<form onSubmit>` so Enter submits, scroll-to-first-error, a title-bar close and a dirty guard — today a backdrop click discards a fully typed 749-line form (L312). The three photo controls collapse into `useFilePicker`: `<Link component="label">` "Change photo" (L360) is **completely keyboard-unreachable** because MUI Link is not a ButtonBase. Inner grids gain `xs` breakpoints — phone/email, DOB/gender and Type/Share/Parcel stay two- and three-up at 400px today. The two `rgba` callout blocks become tonal container tokens that re-tint in dark mode. The Aadhaar scan panel keeps its own busy state independent of the form. The minor rule is enforced consistently with what the DOB helper text claims. | **Medium** — DOB→minor→guardian and married→spouse stay one gated unit; a beneficiary needs a reachable contact because the verification invite depends on it; `hasTree` swaps relationship/role and the parent/spouse links; phone stays a dial-code + national split. **The "Stored masked — only last 4 digits (DPDP-2023)" copy at L611 contradicts the recorded encrypted-storage decision — raise it with the founder, do not quietly correct it inside a migration commit.** |
| `views/holdings/LocationDialog.tsx` | form-tool | `FormDialog`, `MapSurface`, `Action`, `ConfirmDialog`, `ToastProvider` | Becomes a thin `FormDialog` around `MapSurface`. The 170px mode `TextField select` (L72-75) is deleted — mode lives in the map's own toolbar, one vocabulary shared with the parcel page. **Bug fix:** `key={mapMode}` remounting (L80), combined with `value={target.geoPoint}` while edits accumulate in a separate `geo` state, lets the dialog display one shape and persist another; `MapSurface`'s always-controlled value and imperative handle remove both. Gains an unsaved-change guard, a measurement readout, `Use my location`, and a `ConfirmDialog` before Save-with-empty erases a stored boundary in two clicks — the parcel page already confirms for the same act. `autoLocate` becomes the ranked candidate array both detail pages pass, instead of the `''` that lands silently on the zoom-6 default. Width 560, fullScreen on mobile. | **Medium** — it must still work from the holdings row menu without navigating away, and stay a one-shot `updateParcelGeo` with no draft/dirty cycle the list does not expect. `mapMode` seeding from the stored geometry is correct and is preserved. |
| `views/holdings/StakeDialog.tsx` | form-tool | `FormDialog`, `Action` | Width 560. The record name moves into the dialog title (`Stake — {title}`), matching `LocationDialog`, instead of a secondary `Typography` in the body — one place for "which record is this about". The three option hints become a labelled radio row with real supporting text rather than `Typography` nested inside a `FormControlLabel` label. Esc and backdrop blocked while saving; failures surface in the dialog, not only in the parent's toast. | **Low** — the owned / managed / watch values and their plain-language hints are product policy copy, passed verbatim as per-option descriptions. |
| `views/DashboardPage.tsx` | shell-only | `PageHeader`, `StatTiles` (masked + `emphasis`), `Section`, `ZeroState`, `Action`/`ActionRegion`, `StatusChip`, `ToastProvider`, `KitSkeletons`, `format` | No scaffold — the body is heterogeneous panels, so it drops to primitives and keeps its own layout. Gains the eyebrow every sibling passes. The three hand-built hero figures (L325/336/347, at a different type scale from `StatCard`) become `StatTiles variant="emphasis"` with the masked-value state built in. The bespoke first-run Card (L281-314) becomes `ZeroState`. The hero buttons stop hand-painting fills — the theme already ships `variant="tonal"`, which this same file uses correctly at L445. Severity tints move to `error.container` / `warning.container`. The `rgba(25,118,210,0.05)` property-row surface (L502) — copy-pasted from `StatRow` **without** its dark branch, so it stays a pale blue wash in dark mode — becomes a token. `<Box component="span" onClick>` (L388-394), a link with no role, tabIndex, href or accessible name, becomes an `Action`. The `Chip onClick` mask toggle becomes a real toggle. `localStorage` leaves the render-phase `useState` initializer (L75) for a provider. The skeleton stops promising a stat row and a table the page never renders. Gains a toast — today the only failure path surfaces nothing. `formatDateTime` reconciles with the cluster's `fmtLocal`. | **Medium** — the IGRS guideline-rate honesty copy (tooltip, divider note, footer note) must travel with the stat tiles; the attention-queue red/amber triage stays data-driven; the hour-of-day greeting stays dynamic; "other villages" bucketing stays. |
| `views/WalletPage.tsx` | shell-only | `PageHeader`, `StatTiles` (`plain`), `Section`, `DataTable`, `ZeroState` (`idle`), `Action` | Placeholder screen: header plus primitives only. **Bug fix:** `useWallet()` hardcodes `{ isSample: true }`, so `PageHeader` permanently paints a red "Service unreachable" chip beside "Coming soon" on a screen whose service was never called — `PageHeader`'s renamed `status` slot takes one honest chip. The illustrative transaction table gains a sticky head and a bounded scrollport (the only table besides Market Value with neither, and the only one that can scroll the page horizontally on a phone). The balance figure becomes `StatTiles variant="plain"`. The permanently-disabled contained primary — the only one in the app — becomes tonal or is removed under the no-dead-controls rule; the `Tooltip` + `span` disabled-reason wrapper it already uses is the pattern the kit adopts. Credit amounts stop reading `statusColors.good` from the chart palette. Section and grid gaps move onto the canonical scale. | **Low** — it must never gain export or row actions that make illustrative numbers look authoritative; the "A preview of how your payment history will look" caption is what keeps it honest. Gold stays reserved for this surface. |
| `views/VerifyPage.tsx` | shell-only | `ZeroState`, `Action`, `KitSkeletons` | Public, unauthenticated, outside `AppShell` — no page header, no nav. It takes the state vocabulary only. The lone `CircularProgress` becomes a shaped skeleton, and the success and failure branches each gain a terminal `Action`: today the file contains **not one** Button or Link, so a verified user is told they are verified and given nothing to press, and a failed one gets no retry and no way back. This is the most complete action gap in the inventory. | **Low** — it runs from an emailed token with no session, so the next step must be a sign-in / home link, not an in-app route. Both `/verify/[token]` and `/active/[token]` render it, and `auth-pages.spec.ts` probes the same "Verify membership" text on both. |
| `views/landing/LandingPage.tsx` | none | — | **Out of scope** per the governing spec's own "Out of scope" clause and this contract's Exclusions section. Approved design, permanent-dark, brand-hex by intent; its two `size="large"` CTAs are the only controls in the app that already clear the 44px gate. No codemod, no find-and-replace and no kit import may reach it, and its five variant-less buttons do not count as violations. | **None** — the only hazard is touching it by accident during the shared-file cleanup step. |
| `views/legal/LegalLayout.tsx` | none | — | **Out of scope** — public, unauthenticated compliance shell. The grievance `mailto:` is a DPDP requirement and stays a real `mailto:`. | **None** |
| `views/legal/PrivacyPage.tsx` | none | — | **Out of scope** — static legal copy. Do not restyle or reword. | **None** |
| `views/legal/TermsPage.tsx` | none | — | **Out of scope** — static legal copy. Do not restyle or reword. | **None** |
| `views/documents/docTypes.ts` | none | — | Not a view — a document-type constant table with no JSX. `DocumentsTab`'s type chips consume it as `FilterBar` options data; the module itself is unchanged. | **None** |
| `views/documents/readingMessages.ts` | none | — | Not a view — it already exports `useReadingMessage`, which `AddPropertyDialog` and `PassbookCreateDialog` re-implement inline. Unchanged; it becomes the single import for all three call sites. | **None** |
| `views/documents/storage.ts` | none | — | Not a view — the My Drive upload / mirror / classify helpers. Unchanged, but `useFilePicker` becomes its only caller, so the duplicated pipelines in `DocumentsTab` and `PropertyFilesPanel` converge on it. | **None** |
| `views/families/countryCodes.ts` | none | — | Not a view — the dial-code table behind `PersonDialog`'s `joinPhone` / `splitPhone`. Unchanged. | **None** |
| `views/families/familiesData.ts` | none | — | Not a view — group / member / passbook / activity queries and mutations. Unchanged; its already-exposed `isLoading` (L252-256) is what `GroupDetail`'s four tabs start reading. | **None** |
| `views/holdings/propertyImport.ts` | none | — | Not a view — the deed-extraction and property-draft routing helpers. Unchanged; the agricultural auto-route stays here, in the feature, never in the shared dialog shell. | **None** |
| `views/holdings/propertyTypes.ts` | none | — | Not a view — `propertyTypeDef` / `attributeFieldsFor`, which drive both the read view and the edit form on `PropertyDetailPage`. Unchanged; the kit takes their output as data. | **None** |

**Tier totals.** full-list 10 · tabbed-container 3 · detail 5 · form-tool 10 · shell-only 3 · none 11 — **42 files**, of which 35 are view components and 7 are non-view modules.

### Must not change — per full-list screen

These are the behaviours that have to survive the migration untouched. Each is a live URL contract, an e2e assertion, a domain rule or a compliance statement. A migration that "cleans up" any of them is a failed migration.

**`LandPropertiesPage.tsx`**
- Deep links: `?pb=<id>` lands on Land Parcels filtered to that khata, `?group=<id>` pre-filters by family, `?tab=properties` opens the Properties tab. `?pb=` outranks `?tab=`. The one thing that *does* change: `Clear all` must now clear a deep-linked group filter, and it must stay cleared.
- The group filter matches on **name**, the passbook filter on **id**. Do not "fix" the asymmetry inside the kit.
- Stats are computed from the **full dataset** (`data.parcels` / `data.properties`), never from `shown` — filters change the list, never the tiles. Declared explicitly as `scope: 'dataset'`.
- The tab axis **is** the kind axis: tabs take a predicate, never a field name.
- `formatArea` from `@pattadar/core` is the only legal renderer of acreage. Stat unit suffixes render byte-identically, `Sq.yd` and `sq.ft` included — a copy change is a founder decision, not a formatting fix.
- `parcelPill`'s litigation-outranks-status rule and `stakePill`'s owned-renders-nothing rule stay in the feature and are passed as data.
- Add is bimodal: `Add Parcel` opens the manual form on the parcels tab; `Add` opens the AI classifier that routes agricultural deeds to parcels and everything else to properties.
- Location is parcels-only (spread-conditional) — only parcels carry `geoPoint`.
- Delete cascades into document storage; the "files go to My Drive Trash" confirm copy is load-bearing, not boilerplate.
- Cover photos resolve through a My Drive `fileRef`, not a URL; the doc scan keys on `docType==='photo' || tags==='photo'` by `parcelId || propertyId`. `typeColor` success/info is a land-classification signal, not a generic status colour.
- Export identity: `exportBrand` (`Pattadar` / `Land & Properties Register` / `Andhra Pradesh / Telangana Land Records` / watermark `PATTADAR`) and the ten export columns with their en-IN money and land-kind formatters.
- Accessible names pinned by `tests/e2e-ux/specs/holdings.spec.ts`: `Card actions`, `Row actions`, `List view`, `Grid view`.

**`PassbooksPage.tsx`**
- A card click means "show me this khata's land" (`/app/parcels?pb=…`), **not** "open this record" — and it becomes an explicit `onCardClick` / `primaryTarget` prop, not an accident of how the page was written.
- Khata number (`pattadarNo`) is the record's identity, not a status badge: it belongs in the card's identity slot.
- Father/Husband name is a legal identifier on AP/TS land records and keeps its own field — it must not be folded into a generic subtitle.
- Village / Mandal / District / State is the canonical four-level revenue hierarchy; the table keeps all four as separate columns and must not collapse them into one "Location" string.
- `totalExtent` lives on the passbook itself while parcel count and acquisition cost aggregate from parcels — the stat row mixes two sources and both stay visible.
- Delete cascades to parcels, ownership history and documents; the confirm copy stays record-specific.
- `List view` / `Grid view` names pinned by `passbooks.spec.ts:82,86`.

**`InvitationsPage.tsx`**
- Row actions are status-gated: Accept only on `pending`, Revoke on `pending|accepted`, Delete always. The menu stays computed per row, never a fixed list.
- The status vocabulary `pending | accepted | revoked | expired` and its colour map is domain law; `expired` deliberately has no colour.
- Scope is a `(scopeType, scopeId)` pair over parcel/document/passbook. The raw UUID stays **out of the UI** via `humanEntity` but must still reach the **export**.
- Expiry stays a real date input, not a relative picker.
- Acceptance triggers the mandatory-SMS member-verification policy: it remains a single explicit click, never a bulk or checkbox operation.

**`AuditLogPage.tsx`**
- Append-only by definition: no create, no edit, no delete, no row menu, no bulk selection. Row actions stay genuinely absent, not merely unused.
- `details` stays monospace + `pre-wrap` + `break-word` — it is the forensic record.
- Actor is truncated at `@` for display but the **export keeps the full value**.
- `humanEntity(e.target, e.details)` is the only thing keeping UUIDs off the screen: the column renderer must see the whole row, not just the cell value.
- `actionLabel()` maps machine action names to plain language, with the raw name preserved in a tooltip — the plain-language invariant.

**`NotificationsPage.tsx`**
- `stub · not delivered` is an honesty flag: a row recorded before any real provider was wired must never read as delivered. It stays an explicit provider state and is never flattened into the generic status chip.
- `isFailure = status === 'failed' || a non-empty error` — two different fields, and the union stays.
- The provider error string must stay reachable (today only through the status chip's tooltip); operator data may become more visible, never less.
- Channel (email / sms / whatsapp) drives real routing — SMS is mandatory on member accept — so the channel column is load-bearing, not decoration.
- This is an append-only log: there is no edit, and delete is admin housekeeping rather than a user action.

**`documents/DocumentsTab.tsx`**
- Upload caps: 10 files / 1 GB per batch.
- The background classify → `updateDocumentType` round trip with the per-row "Classifying…" chip — rows mutate their own type after landing.
- Storage-offline is a distinct **non-error** outcome (`STORAGE_OFFLINE_MSG` at `info` severity) and must never read as a failure.
- "Create parcel from this deed" stays **visible-but-guarded** — the guard toasts an explanation; it is never hidden or disabled.
- My Drive filenames resolve asynchronously, so a row's display name arrives after the row does. The fallback chain is `docNo` → `Photo` → titleized `docType`.
- Preview opens the in-portal `FileViewer` over the filtered set with ←/→ navigation. **Never a new tab** (founder rule).
- The selection bar **replaces** the toolbar rather than stacking — that swap is right and the kit adopts it — but it must stop hiding the live search query and TYPE filter while both are still applied to `shown`.

**`documents/RegisteredDeedsTab.tsx`**
- The deed record is legitimately wide and **legally ordered**: parties with role / parentage / age / address / GPA flag, four boundaries, six fee lines, and the prior/GPA chain. It must not be flattened into a generic key/value card.
- `Add as Parcel` (`createParcelFromDocument`) and `Link to Passbook` (`linkDocumentPassbook`) are different legal operations over the same picked passbook and stay distinguishable.
- Once `parcelId` is set, the whole action block is replaced by the success alert — the operation is one-way.
- There is deliberately **no** `/app/deeds` detail route: the inline expander **is** the detail surface, so the expandable row must be able to host a full record.
- The registration ref stays monospace and the row identity stays a non-link.

**`detail/PropertyFilesPanel.tsx`**
- Parcel-scope uploads file into `My Drive / Pattadar / Passbook <ref> / Parcel <label>`; property uploads deliberately stay unfiled. The `scope` prop keeps carrying `passbookRef` and `parcelLabel`.
- Background classification is fire-and-forget with a per-row "Classifying…" state, and **Reclassify guards inside the handler** and toasts, rather than hiding or disabling the menu item.
- Preview opens the in-portal `FileViewer` over the whole panel list. Never a new tab.
- Delete is a **trash** flow — the file survives in My Drive Trash — not a hard delete.
- It is embedded in two different parents: it renders no page header and claims no `<h1>`.

**`tools/MarketValueTool.tsx`**
- The cascade order district → mandal → village is domain law, and selecting upstream resets everything downstream.
- Guideline values are official published references with an effective-from date; the "actual market values may vary" alert stays **above** the data, not inside an empty state.
- Rate units vary per row (sq.yd / acre / sq.ft), so the rate column cannot be normalised — the unit travels with the value.
- The agri / non-agri classification colouring matches the parcel classification vocabulary used on Properties, and after migration it is resolved in exactly one place.

**`FamiliesGroupsPage.tsx`**
- `?group=<id>` deep-links **out** to Properties, and that contract survives any refactor.
- A group's detail is genuinely master/detail, not a route — there is no `/app/groups/:id` in the rebuild. The selector grid feeds an in-page record pane.
- Typed groups (family / partnership / company) change downstream vocabulary — relationship vs role, family tree vs none via `groupTypeDef(...).hasTree` — so the type chip is load-bearing, not decoration.
- The card is a **selector**, not a navigation target: it takes `aria-current` / `aria-pressed`, never `role="link"`, and its selected state must not shift layout.
- The implicit `groups.find(...) ?? groups[0]` auto-selection is preserved deliberately and stated visibly, rather than left silent as it is today.
