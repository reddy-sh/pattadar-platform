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
 *
 * THE RULE, stated identically here and in `Action.tsx`: a region may hold one
 * filled button when it is declared `root` — a surface whose actions are
 * complete in themselves and are counted against nothing outside it — or when
 * no other region encloses it; every other region inherits, and a
 * `role="primary"` inside an inherited region that has a region above it
 * renders tonal.
 */
export interface ActionRegionApi {
  /** Names the region in the dev-time error, e.g. "Properties toolbar". */
  name: string;
  /**
   * Distance from the nearest ROOT — 0 in a region declared `root` and in any
   * region nothing encloses, parent + 1 in an inherited region. It is not the
   * component nesting depth: a `root` region resets it to 0 however deep it is
   * mounted, which is what lets a `FormDialog` opened from inside a `Section`,
   * or a `FormActions` footer on a page form inside a card, keep its one filled
   * button.
   *
   * A `role="primary"` in a region with `depth > 0` demotes to tonal at render
   * time without claiming, so an inherited region can never put a second filled
   * button on screen beside its host's. That is the mechanism the rollout
   * leans on wherever a sub-list carries its own create action — the deed
   * expander's "Add as Parcel", GroupDetail's "Add member" — and `demote` is
   * the caller-driven override for when the inner action should win instead.
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
