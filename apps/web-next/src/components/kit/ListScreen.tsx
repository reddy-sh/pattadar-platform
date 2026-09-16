'use client';

/**
 * The whole list screen, assembled once.
 *
 * `views/LandPropertiesPage.tsx` is 828 lines, and only about forty of them are
 * about land. The rest is a page: a header, a stat row, a tab strip, a search
 * box, a view toggle, a Filters disclosure, an export menu, a create button, a
 * collapsed "Filtered by" summary, a grid, a table and four async states. Every
 * other list in this app has rebuilt some subset of that from memory, which is
 * why Passbooks pins its search to the far left, Documents puts its primary
 * before Export, and no two of them agree on the gap beneath the toolbar. This
 * file is where that page stops being retyped: the screen supplies rows, tabs
 * and copy, and the arrangement — the order, the rhythm, the states and the
 * a11y wiring — is decided here, once.
 *
 * **It owns no styling.** The contract's falsifiability grep — the one that
 * hunts a scaffold for a fill, a radius, a border, a shadow or a hex literal —
 * must come back empty over this file forever. Every visual decision below is
 * delegated to a Layer-1 primitive, and when a new one is needed it is added to
 * the primitive rather than leaked up here; that single rule is what lets a
 * screen drop out of this scaffold later without also dropping out of the
 * design system.
 *
 * **It holds no domain state, either.** Tab value, filter values, search text
 * and view mode all arrive as props from the screen's own `useQueryState`. That
 * is not fastidiousness: Properties computes its stat tiles from the FULL
 * dataset while its list shows the filtered rows (`:232-251` against `:263-280`),
 * its tab strip swaps in a different set of four tiles per tab (`:454-483`), and
 * its Passbook filter matches by id while its Group filter matches by name. A
 * scaffold that owned any of that would have to learn all of it. So tabs take a
 * value, stats take an array with a declared `scope`, and filters take
 * predicates — the domain stays in the feature where it can be read.
 *
 * Three structural decisions are worth the ink:
 *
 * **First-run replaces the page.** `:431-441` is the one branch the original
 * got right and the easiest to lose in a refactor: when the collection is empty
 * there are no counts to tile, no rows to export, no filters worth offering and
 * nothing to search, so a header reduced to eyebrow + title carries the empty
 * state and every other control stays unmounted rather than rendering dead. The
 * loading branch at `:420-427` does the same thing for the same reason — the
 * skeleton IS the page, header and toolbar included, so painting the real
 * chrome above `PageSkeleton` would draw two headers. Error and no-results are
 * the opposite case and keep the whole page mounted: the reader needs the tab
 * they are on and the filter they set in order to understand what they are
 * looking at, and to undo it.
 *
 * That gate has to be decided during render, and `StateSwitch` reports its
 * resolution through an effect — correctly so, since a scaffold that stored the
 * report in state and re-rendered on it would paint one frame of full chrome
 * above every first run. So the precedence is mirrored here synchronously, the
 * page-replacement RULE itself is still `ZeroState`'s exported `replacesPage`,
 * and `onResolve` is wired to a dev-time audit that shouts if the two ever stop
 * agreeing. One of them is allowed to be a copy; neither is allowed to drift.
 *
 * **The tabs ride in the toolbar's `left` slot**, not above it. Properties puts
 * the strip and the control cluster on one `space-between` row (`:486-536`) and
 * that is the layout being preserved; `ListToolbar` owns the row and carries its
 * own 12px bottom gap (`toolbarRowSx`), the row sits BELOW the stat band exactly
 * as `:486` sits below `:453` — header 24 / stats 16 / toolbar 12, the reference
 * rhythm — and the strip is asked for its `section` metrics so it does not add a
 * second bottom gap inside a row that already has one.
 *
 * **Selection swaps the cluster, never the row.** `DocumentsTab.tsx:609-702`
 * unmounts its entire toolbar when rows are selected, taking the search box and
 * the live type filter with it — so mid-selection the reader can no longer see
 * WHICH subset they are about to act on. Here `SelectionBar` goes into
 * `ListToolbar.replaceWith`, which replaces the right-hand cluster and leaves
 * the tabs, the chip row and the stat tiles exactly where they were.
 *
 * Extracted from `views/LandPropertiesPage.tsx:420-825` in full: the loading
 * branch `:420-427`, the first-run branch `:431-441`, the header `:445-451`, the
 * per-tab stat row `:454-483`, the tabs + toolbar row `:486-536`, the filter
 * panel `:539-566`, the collapsed chip row `:569-605`, the grid `:607-688`, the
 * table `:690-757`, the row menu `:763-777`, the delete confirm `:780-795` and
 * the toast `:821-825` — the last three of which are now the screen's own
 * `children`, an `ActionMenu` and the `ToastProvider` respectively.
 *
 * Contract: docs/specs/2026-09-14-web-component-kit-contract.md
 * Design authority: docs/specs/2026-07-26-ux-redesign-m3.md
 */
import { Fragment, useId, useMemo } from 'react';
import type { ReactNode } from 'react';

import { Action } from './Action';
import { CardGrid } from './CardGrid';
import { screenColumns } from './columns';
import { DataTable } from './DataTable';
import type { DataTableExpandable, DataTableTotals } from './DataTable';
import { ExportAction } from './ExportAction';
import { activeFilterCount, FilterChipRow, FilterPanel, FilterTrigger } from './FilterBar';
import { PageSkeleton } from './KitSkeletons';
import { ListToolbar } from './ListToolbar';
import { PageHeader } from './PageHeader';
import type { PageHeaderProps } from './PageHeader';
import { SearchField, ViewToggle } from './SearchField';
import { StatTiles } from './StatTiles';
import { TabStrip } from './TabStrip';
import { SelectionBar, useRowSelection } from './useRowSelection';
import { replacesPage, StateSwitch } from './ZeroState';
import type { UnreachableSpec } from './ZeroState';
import type {
  ActionItem,
  ActionSpec,
  Column,
  DataStatus,
  ExportBrand,
  FilterField,
  FilterValues,
  HeaderLevel,
  RowKey,
  RowLabel,
  SortState,
  StatEmphasis,
  StatItem,
  StatScope,
  TabItem,
  ViewMode,
  ZeroSpec,
  ZeroVariant,
} from './types';

/** Stripped from the production bundle; none of the audits below ever ship. */
const DEV = process.env.NODE_ENV !== 'production';

/**
 * Module scope, so a screen that never turns selection on hands `useRowSelection`
 * the same array identity on every commit instead of a fresh empty one.
 */
const NO_SELECTABLE_IDS: string[] = [];

/* ── API ─────────────────────────────────────────────────────────────── */

/**
 * Explicitly declared pass-through options for the table body. NOT an
 * `Omit<DataTableProps<T>, …>`: an Omit rots silently the first time `DataTable`
 * gains a field, and it forces an implementer to read two declarations to learn
 * what one prop accepts.
 *
 * `columns`, `rows`, `getRowKey`, `rowLabel` and the async state are deliberately
 * absent — they are `ListScreen`'s own props, because the export, the grid and
 * the state switch read the same ones.
 */
export interface ListTableOptions<T> {
  sort?: SortState;
  onSortChange?: (sort: SortState) => void;
  expandable?: DataTableExpandable<T>;
  totals?: DataTableTotals;
  onRowOpen?: (row: T) => void;
  rowActions?: (row: T) => ActionItem[];
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
   * DATA, not a node — `ListScreen` demotes it to tonal while the list is empty
   * so the `ZeroState` owns the one filled button.
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

  /** Table body, and the single source for export columns via `toExportCols()`. */
  columns?: Column<T>[];
  table?: ListTableOptions<T>;
  /**
   * Grid body. Required when `view.value` can be 'grid', and also the body for a
   * grid-only list that declares no `columns` and no `view`.
   */
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

/* ── Helpers ─────────────────────────────────────────────────────────── */

/**
 * `ActionSpec.key` is a list identity, not a DOM prop — spreading an object
 * that carries `key` into JSX is a React 19 warning — so it is peeled off and
 * used as the element key it always was. The same idiom as `ZeroState`'s
 * `renderAction`, deliberately: an action described as data is rendered the
 * same way everywhere in the kit.
 */
function renderToolbarAction(spec: ActionSpec) {
  const { key, ...props } = spec;
  return <Action key={key ?? props.label} {...props} />;
}

/**
 * The create action. `role` is forced rather than defaulted — a screen does not
 * get to decide that its primary is quiet — and `demote` carries the empty-list
 * rule: while there is nothing to act on, the empty state owns the one filled
 * button and this one goes tonal.
 */
function renderPrimaryAction(spec: ActionSpec, demote: boolean) {
  const { key, ...props } = spec;
  return <Action key={key ?? props.label} {...props} role="primary" demote={demote} />;
}

/** Dev-time only, once per screen: a list with no body at all is a wiring bug. */
const bodyless = new Set<string>();
function warnNoBody(name: string): void {
  if (!DEV || bodyless.has(name)) return;
  bodyless.add(name);
  console.error(
    `ListScreen "${name}" has no body: give it \`columns\` for a table, \`renderCard\` for a grid, or \`renderBody\`.`,
  );
}

/**
 * Dev-time only, once per screen: `exportConfig` with no `columns` asks for a
 * control that cannot be built. `ExportAction` derives what it writes from
 * `columns` via `toExportCols` — the same array the table renders, which is what
 * stops the two from ever disagreeing — so an export with no columns is not
 * rendered at all. That silence is correct (a button with nothing to write is a
 * dead control) but it must not also be quiet: the screen asked for a control
 * and did not get one, and that is a wiring bug the same way a missing body is.
 */
const exportless = new Set<string>();
function warnNoExportColumns(name: string): void {
  if (!DEV || exportless.has(name)) return;
  exportless.add(name);
  console.error(
    `ListScreen "${name}" was given \`exportConfig\` but no \`columns\`: ExportAction derives its columns from \`columns\` via \`toExportCols\`, so no Export control is rendered. Declare \`columns\`, or drop \`exportConfig\` until you do.`,
  );
}

/* ── ListScreen ──────────────────────────────────────────────────────── */

export function ListScreen<T, Ctx = unknown>({
  level = 'page',
  header,
  stats,
  tabs,
  search,
  view,
  filters,
  primaryAction,
  secondaryActions,
  toolbarExtras,
  exportConfig,
  selection,
  rows,
  getRowKey,
  rowLabel,
  total,
  columns,
  table,
  renderCard,
  renderBody,
  state,
  empty,
  noResults,
  errorState,
  children,
}: ListScreenProps<T, Ctx>) {
  /* One id, two consumers: the panel IS the thing the trigger says it controls,
     and `aria-controls` pointing at nothing is worse than not claiming to be a
     disclosure at all. */
  const filterPanelId = useId();

  const selectionEnabled = selection?.enabled === true;
  const selectableIds = useMemo(
    () => (selectionEnabled ? rows.map(getRowKey) : NO_SELECTABLE_IDS),
    [selectionEnabled, rows, getRowKey],
  );
  /* Called unconditionally — the hook prunes vanished ids itself, and an empty
     visible set is a legal, inert selection. */
  const rowSelection = useRowSelection(selectableIds);
  const selectionActive = selectionEnabled && rowSelection.count > 0;

  const activeFilters = filters ? activeFilterCount(filters.values) : 0;
  const hasActiveQuery = Boolean(search?.value.trim()) || activeFilters > 0;

  /* Offered to the no-results state only when there is genuinely something to
     undo; `StateSwitch` gates the button on `hasActiveQuery` as well. */
  const clearQuery =
    search !== undefined || filters !== undefined
      ? () => {
          search?.onChange('');
          filters?.onClear();
        }
      : undefined;

  /**
   * `StateSwitch`'s precedence, mirrored so the chrome gate can be decided
   * during render rather than an effect later — see the header comment. The
   * page-replacement rule itself stays `replacesPage()`, so only the ordering
   * lives in two places, and the audit below watches even that.
   */
  const outage = state.isError === true || (total === 0 && state.isUnreachable === true);
  const variant: ZeroVariant | null = state.isLoading
    ? null
    : outage
      ? 'error'
      : total === 0
        ? 'first-run'
        : rows.length === 0
          ? 'no-results'
          : null;

  const firstRun = replacesPage(variant);

  /**
   * The control cluster this screen will actually paint, counted in
   * `ListToolbar`'s fixed order: search → viewToggle → filters → extras →
   * export → primary. `PageSkeleton` defaults to four, and Properties renders
   * five, so a scaffold that let the default stand would reserve a row that
   * wraps at a different width than the real one — which is the reflow the
   * skeletons exist to prevent, reintroduced by the one caller all 42 screens
   * go through. `toolbarExtras` is an opaque node and counts as one: it is the
   * only estimate in the row, and the escape hatch is where an estimate
   * belongs.
   */
  const toolbarControls =
    (search !== undefined ? 1 : 0) +
    (view !== undefined ? 1 : 0) +
    (filters !== undefined ? 1 : 0) +
    (toolbarExtras !== undefined && toolbarExtras !== null && toolbarExtras !== false ? 1 : 0) +
    (secondaryActions?.length ?? 0) +
    (exportConfig !== undefined && columns !== undefined ? 1 : 0) +
    (primaryAction !== undefined ? 1 : 0);

  /* Taken from the LIVE view, tile count, control count and column count, so
     nothing pops in and nothing reflows when the rows arrive. */
  const skeleton = (
    <PageSkeleton
      stats={stats !== undefined && stats.items.length > 0 ? stats.items.length : false}
      tabs={tabs !== undefined}
      controls={toolbarControls}
      view={view?.value ?? (columns !== undefined ? 'list' : 'grid')}
      rows={table?.skeletonRows}
      columns={columns !== undefined ? screenColumns(columns).length : undefined}
    />
  );

  const strip = tabs ? (
    /* `level="section"` is about the gap, not the semantics: inside a row that
       already carries the toolbar's own bottom margin, a strip that added its
       own would sum the two into a gutter on nobody's scale. */
    <TabStrip
      items={tabs.items}
      value={tabs.value}
      onChange={tabs.onChange}
      ariaLabel={tabs.ariaLabel}
      idPrefix={tabs.idPrefix}
      level="section"
    />
  ) : undefined;

  const secondaryEls = secondaryActions?.map(renderToolbarAction);
  /* Declared buttons sit nearest the primary; `toolbarExtras` is the escape
     hatch and keeps its distance from it. */
  const extras =
    toolbarExtras !== undefined || secondaryEls !== undefined ? (
      <>
        {toolbarExtras}
        {secondaryEls}
      </>
    ) : undefined;

  if (exportConfig !== undefined && columns === undefined) warnNoExportColumns(header.title);

  const toolbar = (
    <ListToolbar
      regionName={`${header.title} toolbar`}
      left={strip}
      search={
        search ? (
          <SearchField noun={search.noun} value={search.value} onChange={search.onChange} />
        ) : undefined
      }
      viewToggle={
        view ? (
          <ViewToggle value={view.value} onChange={view.onChange} persistKey={view.persistKey} />
        ) : undefined
      }
      filters={
        filters ? (
          <FilterTrigger
            activeCount={activeFilters}
            open={filters.open}
            onToggle={() => filters.onOpenChange(!filters.open)}
            controls={filterPanelId}
          />
        ) : undefined
      }
      extras={extras}
      exportAction={
        /* Both halves required: the export reads the SAME column array the
           table renders, so a screen with no columns has nothing to write and
           an Export button on it would be a dead control. */
        exportConfig && columns ? (
          <ExportAction
            filename={exportConfig.filename}
            brand={exportConfig.brand}
            columns={columns}
            rows={rows}
            scopeNote={exportConfig.scopeNote}
          />
        ) : undefined
      }
      primaryAction={primaryAction ? renderPrimaryAction(primaryAction, total === 0) : undefined}
      replaceWith={
        selectionActive && selection ? (
          <SelectionBar
            count={rowSelection.count}
            onClear={rowSelection.clear}
            actions={selection.actions}
            progress={selection.progress}
            context={selection.context}
          />
        ) : undefined
      }
    />
  );

  let body: ReactNode = null;
  if (renderBody) {
    body = renderBody(rows);
  } else if (renderCard && (view?.value === 'grid' || columns === undefined)) {
    /* Two ways in: the view toggle is on 'grid', or the screen is grid-ONLY —
       cards, no table, so no `columns` and no toggle to declare (Families &
       Groups). Without the second clause that shape falls past the `columns`
       branch into `warnNoBody` and paints an empty region under full chrome.

       The key belongs to the element the map returns, and a screen's
       `renderCard` has no way to put it there. The fragment is what carries it,
       so a card's React identity is the same `getRowKey` the table, the export
       and the selection all key on. */
    body = (
      <CardGrid>
        {rows.map((row) => (
          <Fragment key={getRowKey(row)}>{renderCard(row)}</Fragment>
        ))}
      </CardGrid>
    );
  } else if (columns) {
    body = (
      <DataTable
        columns={columns}
        rows={rows}
        getRowKey={getRowKey}
        ariaLabel={header.title}
        rowLabel={rowLabel}
        onRowOpen={table?.onRowOpen}
        rowActions={table?.rowActions}
        rowActionsLabel={table?.rowActionsLabel}
        sort={table?.sort}
        onSortChange={table?.onSortChange}
        selection={
          selectionEnabled
            ? {
                selected: rowSelection.selected,
                onToggle: rowSelection.toggle,
                onToggleAll: rowSelection.toggleAll,
              }
            : undefined
        }
        expandable={table?.expandable}
        totals={table?.totals}
        sticky={table?.sticky}
        maxHeight={table?.maxHeight}
        surface={table?.surface}
        skeletonRows={table?.skeletonRows}
      />
    );
  } else {
    warnNoBody(header.title);
  }

  /* `placement="panel"` is the in-page geometry for error and no-results;
     `StateSwitch` promotes first-run to the page card itself, which is why the
     two states cannot disagree about which one replaces the screen. */
  const stateSwitch = (
    <StateSwitch
      isLoading={state.isLoading}
      isError={state.isError}
      errorMessage={state.errorMessage}
      onRetry={state.onRetry}
      isUnreachable={state.isUnreachable}
      total={total}
      visibleCount={rows.length}
      hasActiveQuery={hasActiveQuery}
      onClearQuery={clearQuery}
      skeleton={skeleton}
      firstRun={empty}
      noResults={noResults}
      errorState={errorState}
      placement="panel"
      onResolve={(resolved) => {
        /* The audit that lets the mirrored precedence above stay a copy rather
           than become a fork. A new identity every render is harmless:
           `StateSwitch` keeps this in a ref and reports only on a change. */
        if (!DEV || resolved.variant === variant) return;
        console.error(
          `ListScreen "${header.title}" resolved "${variant ?? 'ready'}" during render but StateSwitch resolved "${resolved.variant ?? 'ready'}". The precedence in ListScreen.tsx has drifted from ZeroState.tsx.`,
        );
      }}
    >
      {body}
    </StateSwitch>
  );

  /* Loading: the skeleton IS the page — header, stats and toolbar included — so
     the real chrome stays unmounted above it, exactly as `:420-427` does.
     Painting both would draw two headers and two toolbars. */
  if (state.isLoading) {
    return (
      <>
        {stateSwitch}
        {children}
      </>
    );
  }

  /* First run: eyebrow and title only, then the empty state. No `dataState`, no
     `titleChips`, no composition subtitle, no stats, no tabs, no toolbar and no
     chip row — every one of them would be describing a collection that does not
     exist yet. `:431-441` preserved. */
  if (firstRun) {
    return (
      <>
        <PageHeader eyebrow={header.eyebrow} title={header.title} level={level} />
        {stateSwitch}
        {children}
      </>
    );
  }

  /* Error and no-results keep all of this mounted: the reader needs the tab
     they are on and the filter they set to understand what they are looking at,
     and to take it back off. */
  return (
    <>
      {/* Header → stats → toolbar, which is `:445` → `:453` → `:486` and what
          `PageSkeleton` emits, so the stat band does not jump a row when the
          data lands. The toolbar keeps its own 12px bottom gap from
          `toolbarRowSx`; out here that reads header 24 / stats 16 / toolbar 12. */}
      <PageHeader {...header} level={level} />

      {stats !== undefined && stats.items.length > 0 ? (
        <StatTiles items={stats.items} scope={stats.scope} emphasis={stats.emphasis} />
      ) : null}

      {toolbar}

      {filters ? (
        <FilterPanel
          id={filterPanelId}
          fields={filters.fields}
          values={filters.values}
          ctx={filters.ctx}
          onChange={filters.onChange}
          onClear={filters.onClear}
          open={filters.open}
          onClose={() => filters.onOpenChange(false)}
        />
      ) : null}

      {filters ? (
        /* The summary renders whenever a filter is set, panel open or closed —
           it is the only place a filter hidden on the current tab is still
           visible and removable. "Edit" is offered only while the panel is
           closed, because a link that opens what is already open is a dead one. */
        <FilterChipRow
          fields={filters.fields}
          values={filters.values}
          ctx={filters.ctx}
          onChange={filters.onChange}
          onClear={filters.onClear}
          onEdit={filters.open ? undefined : () => filters.onOpenChange(true)}
        />
      ) : null}

      {stateSwitch}

      {children}
    </>
  );
}
