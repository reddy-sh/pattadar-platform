'use client';

/**
 * The one table in the app — and the end of the second column list.
 *
 * Land & Properties declares its ten columns twice: once as `exportCols`
 * (`LandPropertiesPage.tsx:283-294`) and once as hand-written head and body
 * cells (`:692-706`, `:708-753`). The two copies have already drifted, in order
 * and in shape, and nothing in the file can notice. Here a column is declared
 * once and drives the head, the cell, the sort key and the exported column
 * alike (`kit/columns.ts`), so that particular divergence has nowhere left to
 * live.
 *
 * Everything else in this file is a defect the app currently ships five times
 * over, closed once. `size="small"` is gone: it is exactly what makes the live
 * table dense against a spec that says 52px rows, and the row height is now
 * the token rather than a guess. `colSpan` is computed from the live visible
 * column count — `AuditLogPage.tsx:135` hand-counts 5,
 * `RegisteredDeedsTab.tsx:576` hand-counts 12 against a 12-column head, and
 * `PassbookDetailPage.tsx:519-523` hand-counts 5 for its totals row, so adding
 * a column to any of the three silently breaks a layout. A hidden column is
 * dropped from the DOM at its breakpoint instead of being shrunk into
 * illegibility, which is what actually keeps a wide table off the page's
 * horizontal scrollbar; the bounded scrollport is the second line of defence,
 * not the first. The expander's disclosure control is a real button that owns
 * its own handler, its `aria-expanded` and its `aria-controls` —
 * `AuditLogPage.tsx:135` has an aria-label, no handler at all, and works only
 * because the click bubbles up from the `TableRow` — and the row itself is
 * reachable by keyboard, which no expandable table in the app is today. The
 * first cell is a real focusable control rather than a `Link component="button"`
 * or, worse, the keyboard-dead `<Box onClick>` at `DocumentsTab.tsx:750-758`.
 * And there is ONE `Menu` for the whole table (`useActionMenu`), not one per
 * row.
 *
 * Sorting here is presentational and nothing more. `DataTable` never reorders
 * `rows`: it draws the affordance, reports the next `{ key, dir }`, and leaves
 * the comparator to the screen — which may take `compareBy` from
 * `kit/columns.ts` or sort on the server. A table that quietly re-sorted the
 * array it was handed would be a table that disagrees with the export button
 * beside it.
 *
 * Two deliberate asymmetries, because both look like oversights. A first
 * column that declares its own `render` KEEPS it even when `onRowOpen` is set:
 * an `Action`'s content is its `label`, a string, so the alternative is
 * silently throwing the column author's cell away. Such a screen states its
 * rich cell on a later column, or drops `render` from the first one and gets
 * the button. And the row trigger's accessible name defaults to the literal
 * `'Row actions'`; `rowLabel` names the MENU that opens ("Actions for Sy
 * 214/2"), which is the name a screen reader user actually needs once the
 * popup is up.
 *
 * Extracted from `views/LandPropertiesPage.tsx:690-753` (the container, the
 * eleven head cells, the linked first cell, the unstyled Extent and Value cells
 * the card renders with `.tnum`, and the `className="rowActions"` trigger) and
 * `:283-294` (the second column declaration); `components/tableSx.ts:10-19`
 * (`stickyHeadSx`, now `tokens.stickyHeadSx`); `views/AdminRefDataPage.tsx:93-176`
 * (the private `RefTable` — 80% of this component, importable by nobody);
 * `views/AuditLogPage.tsx:127-172` (the expandable row); and
 * `views/documents/RegisteredDeedsTab.tsx:515-582` (selection, expander and row
 * menu on one row).
 *
 * Contract: docs/specs/2026-09-14-web-component-kit-contract.md
 * Design authority: docs/specs/2026-07-26-ux-redesign-m3.md
 */
import { Fragment, useId, useMemo } from 'react';
import type { ReactNode } from 'react';
import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import Checkbox from '@mui/material/Checkbox';
import Collapse from '@mui/material/Collapse';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableFooter from '@mui/material/TableFooter';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import TableSortLabel from '@mui/material/TableSortLabel';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import useMediaQuery from '@mui/material/useMediaQuery';
import type { Breakpoint, SxProps, Theme } from '@mui/material/styles';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import KeyboardArrowUpIcon from '@mui/icons-material/KeyboardArrowUp';

import { Action, IconAction } from './Action';
import { ActionMenu, RowActionsTrigger, useActionMenu } from './ActionMenu';
import { columnValue, screenColumns } from './columns';
import { dash } from './format';
import { SectionSkeleton, TableSkeleton } from './KitSkeletons';
import { focusRingSx, GAP, ROW_HEIGHT, stickyHeadSx, surfaceSx, TOUCH } from './tokens';
import { ZeroState } from './ZeroState';
import type {
  ActionItem,
  Column,
  RowKey,
  RowLabel,
  RowSelectionApi,
  SortState,
  ZeroSpec,
} from './types';

/**
 * MUI's sx-composition idiom. `stickyHeadSx` and `surfaceSx` are typed
 * `SxProps<Theme>` — a union that already admits the callback and array forms —
 * so neither can be spread into an object literal without being flattened
 * first. Composing into one array keeps the tokens the single definition of the
 * surface instead of values this file copies and then quietly edits.
 */
function composeSx(...parts: SxProps<Theme>[]): SxProps<Theme> {
  return parts.flatMap((part) => (Array.isArray(part) ? part : [part]));
}

/* ── Geometry ────────────────────────────────────────────────────────── */

/** The checkbox and disclosure gutters, at the touch floor the theme pins. */
const GUTTER = TOUCH;

/** The trailing "⋮" column: the 44px control plus the cell's own right inset. */
const ACTIONS_WIDTH = TOUCH + 12;

/**
 * Spec "Tables/lists": 52px rows. Declared on the row rather than reached for
 * with `size="small"`, which is what makes the live table dense against the
 * very spec it was written to follow.
 */
const rowSx: SxProps<Theme> = { height: ROW_HEIGHT };

/**
 * The same row once it toggles an expander. It takes a tab stop, so the ring is
 * inset — an outline offset outward on a `<tr>` is clipped by the cell borders
 * on either side of it.
 */
const expandableRowSx: SxProps<Theme> = {
  height: ROW_HEIGHT,
  cursor: 'pointer',
  '&:focus-visible': { ...focusRingSx, outlineOffset: '-2px' },
};

/**
 * The detail row's cell: no padding and no rule, because the `Collapse` inside
 * it is zero-height while closed and a border under a collapsed row reads as a
 * stray divider between two real ones.
 */
const detailCellSx: SxProps<Theme> = { p: 0, border: 0 };

/**
 * The first cell's button, pulled back by exactly its own horizontal padding so
 * its text sits on the same vertical line as every other cell in the column.
 * `fontWeight: 600` and the hover underline are what the `Link component="button"`
 * at `LandPropertiesPage.tsx:711-718` looked like; what it was not is focusable
 * in a way anyone could see.
 */
const openCellSx: SxProps<Theme> = {
  display: 'inline-flex',
  maxWidth: '100%',
  ml: -GAP.control,
  '& .MuiButton-root': {
    minWidth: 0,
    px: GAP.control,
    fontWeight: 600,
    textAlign: 'left',
    '&:hover': { textDecoration: 'underline' },
  },
};

/** A totals cell states a figure, so it is body text in bold, never footer chrome. */
const totalsCellSx: SxProps<Theme> = { fontWeight: 700 };

/**
 * Announced-but-unseen text. `aria-sort` lives on the head cell, but it is
 * inconsistently read out on the control the user is actually focused on, so
 * the sort label says the direction in words too.
 */
const visuallyHiddenSx: SxProps<Theme> = {
  position: 'absolute',
  width: 1,
  height: 1,
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  whiteSpace: 'nowrap',
};

/* ── Column helpers ──────────────────────────────────────────────────── */

/** `numeric` wins: a right-aligned figure column is not a matter of taste. */
function alignOf<T>(column: Column<T>): 'left' | 'right' {
  return column.numeric === true ? 'right' : (column.align ?? 'left');
}

function cellSx<T>(column: Column<T>): SxProps<Theme> {
  return {
    width: column.width,
    whiteSpace: column.nowrap === true ? 'nowrap' : undefined,
  };
}

/** The em-dash belongs on screen and nowhere near an export cell. */
function textCell(value: string): ReactNode {
  return value === '' ? dash : value;
}

/** asc → desc → unsorted. The third press must return the screen's own order. */
function nextSort(sort: SortState | undefined, key: string): SortState {
  if (sort === undefined || sort === null || sort.key !== key) return { key, dir: 'asc' };
  return sort.dir === 'asc' ? { key, dir: 'desc' } : null;
}

/**
 * The totals cells, shared by the footer `DataTable` draws for itself and by
 * the exported `TotalsRow` a hand-assembled table uses — one definition, so the
 * two cannot disagree about where the label sits.
 */
function totalsCells<T>(
  label: string,
  columns: Column<T>[],
  values: Record<string, ReactNode>,
): ReactNode[] {
  return columns.map((column, index) => (
    <TableCell
      key={column.key}
      variant="body"
      align={alignOf(column)}
      className={column.numeric === true ? 'tnum' : undefined}
      sx={composeSx(cellSx(column), totalsCellSx)}
    >
      {index === 0 ? label : (values[column.key] ?? null)}
    </TableCell>
  ));
}

/**
 * A control that cannot be used still has to say why. A disabled MUI checkbox
 * fires no pointer events, so the tooltip needs a live wrapper, and the tab
 * stop on it is what stops the explanation being mouse-only.
 */
function withReason(node: ReactNode, disabled?: boolean, reason?: string): ReactNode {
  if (disabled !== true || reason === undefined || reason === '') return node;
  return (
    <Tooltip title={reason}>
      <Box
        component="span"
        tabIndex={0}
        sx={{ display: 'inline-flex', '&:focus-visible': { ...focusRingSx } }}
      >
        {node}
      </Box>
    </Tooltip>
  );
}

/* ── API ─────────────────────────────────────────────────────────────── */

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

/* ── DataTable ───────────────────────────────────────────────────────── */

export function DataTable<T>({
  columns,
  rows,
  getRowKey,
  ariaLabel,
  onRowOpen,
  rowLabel,
  rowActions,
  rowActionsLabel,
  sort,
  onSortChange,
  selection,
  expandable,
  totals,
  emptyState,
  isLoading,
  skeletonRows = 6,
  sticky = true,
  maxHeight,
  surface = true,
}: DataTableProps<T>) {
  /**
   * One hook per breakpoint, not one per column: the column list is data and
   * may change length between renders, and a hook loop over it would be a
   * rules-of-hooks violation waiting for its first optional column.
   */
  const upSm = useMediaQuery((theme) => theme.breakpoints.up('sm'));
  const upMd = useMediaQuery((theme) => theme.breakpoints.up('md'));
  const upLg = useMediaQuery((theme) => theme.breakpoints.up('lg'));
  const upXl = useMediaQuery((theme) => theme.breakpoints.up('xl'));

  /**
   * A column below its breakpoint is DROPPED, not shrunk. Squeezing ten columns
   * into 400px is how a table takes the page's horizontal scrollbar with it;
   * the container's own scrollport below is the second line of defence.
   */
  const visible = useMemo(() => {
    const reached: Record<Breakpoint, boolean> = {
      xs: true,
      sm: upSm,
      md: upMd,
      lg: upLg,
      xl: upXl,
    };
    return screenColumns(columns).filter(
      (column) => column.hideBelow === undefined || reached[column.hideBelow],
    );
  }, [columns, upSm, upMd, upLg, upXl]);

  /** ONE menu for the whole table, driven by the row that opened it. */
  const menu = useActionMenu<T>();
  const menuRow = menu.row;
  const menuKey = menuRow === null ? null : getRowKey(menuRow);

  /** Stable prefix for the `aria-controls` target of every expander. */
  const baseId = useId();

  /**
   * Selection is counted over the rows ON SCREEN. The head checkbox describes
   * what "select all" will do here and now, not the size of a set that may
   * still hold rows a filter has since taken away.
   */
  const selectedHere = useMemo(() => {
    if (selection === undefined) return 0;
    return rows.reduce((total, row) => (selection.selected.has(getRowKey(row)) ? total + 1 : total), 0);
  }, [rows, selection, getRowKey]);

  const hasSelection = selection !== undefined;
  const hasExpander = expandable !== undefined;
  const hasRowActions = rowActions !== undefined;

  /** Every colSpan in this file derives from these three. None is counted by hand. */
  const leadingCells = (hasSelection ? 1 : 0) + (hasExpander ? 1 : 0);
  const trailingCells = hasRowActions ? 1 : 0;
  const colSpan = leadingCells + visible.length + trailingCells;

  const allSelected = rows.length > 0 && selectedHere === rows.length;
  const someSelected = selectedHere > 0 && !allSelected;

  // The skeleton takes the LIVE column count, so a six-column table is never
  // stood in for by four bars that then double. It carries its own surface.
  if (isLoading === true) {
    return (
      <TableSkeleton rows={skeletonRows} columns={visible.length} selectable={hasSelection} />
    );
  }

  const head = (
    <TableHead>
      <TableRow>
        {hasSelection && (
          <TableCell padding="checkbox" sx={{ width: GUTTER }}>
            {withReason(
              <Checkbox
                checked={allSelected}
                indeterminate={someSelected}
                disabled={selection.disabled === true}
                onChange={(event) => selection.onToggleAll(event.target.checked)}
                slotProps={{ input: { 'aria-label': 'Select all rows' } }}
              />,
              selection.disabled,
              selection.disabledReason,
            )}
          </TableCell>
        )}
        {hasExpander && <TableCell padding="checkbox" sx={{ width: GUTTER }} />}

        {visible.map((column) => {
          // The live sort IF it is this column's — one narrowing, reused by the
          // cell's `aria-sort`, the label's arrow and the spoken direction.
          const active =
            sort !== undefined && sort !== null && sort.key === column.key ? sort : null;
          const label = (
            <Typography variant="overline" component="span" color="text.secondary">
              {column.header}
            </Typography>
          );

          return (
            <TableCell
              key={column.key}
              align={alignOf(column)}
              sortDirection={active === null ? false : active.dir}
              sx={cellSx(column)}
            >
              {column.sortable === true ? (
                <TableSortLabel
                  active={active !== null}
                  direction={active === null ? 'asc' : active.dir}
                  onClick={() => onSortChange?.(nextSort(sort, column.key))}
                  sx={{ '&:focus-visible': { ...focusRingSx } }}
                >
                  {label}
                  {active === null ? null : (
                    <Box component="span" sx={visuallyHiddenSx}>
                      {active.dir === 'desc' ? 'sorted descending' : 'sorted ascending'}
                    </Box>
                  )}
                </TableSortLabel>
              ) : (
                label
              )}
            </TableCell>
          );
        })}

        {hasRowActions && <TableCell align="right" sx={{ width: ACTIONS_WIDTH }} />}
      </TableRow>
    </TableHead>
  );

  const body = (
    <TableBody>
      {rows.map((row) => {
        const key = getRowKey(row);
        const selected = hasSelection && selection.selected.has(key);
        const expanded = hasExpander && expandable.isExpanded(row);
        const detailId = `${baseId}-detail-${key}`;

        return (
          <Fragment key={key}>
            <TableRow
              hover
              selected={selected}
              sx={hasExpander ? expandableRowSx : rowSx}
              tabIndex={hasExpander ? 0 : undefined}
              onClick={hasExpander ? () => expandable?.onToggle(row) : undefined}
              onKeyDown={
                hasExpander
                  ? (event) => {
                      // Only the row's own key presses: Enter on the ⋮ inside it
                      // would otherwise open the menu AND toggle the expander.
                      if (event.target !== event.currentTarget) return;
                      if (event.key !== 'Enter' && event.key !== ' ') return;
                      // Space scrolls the page unless it is claimed here.
                      event.preventDefault();
                      expandable?.onToggle(row);
                    }
                  : undefined
              }
            >
              {hasSelection && (
                <TableCell padding="checkbox" onClick={(event) => event.stopPropagation()}>
                  {withReason(
                    <Checkbox
                      checked={selected}
                      disabled={selection.disabled === true}
                      onChange={(event) => {
                        // The shift key rides on the native event; a keyboard
                        // activation carries none, which is the correct answer.
                        const native = event.nativeEvent;
                        selection.onToggle(key, native instanceof MouseEvent && native.shiftKey);
                      }}
                      slotProps={{ input: { 'aria-label': `Select ${rowLabel(row)}` } }}
                    />,
                    selection.disabled,
                    selection.disabledReason,
                  )}
                </TableCell>
              )}

              {hasExpander && (
                <TableCell padding="checkbox" onClick={(event) => event.stopPropagation()}>
                  <IconAction
                    label={`${expanded ? 'Hide' : 'Show'} details for ${rowLabel(row)}`}
                    icon={
                      expanded ? (
                        <KeyboardArrowUpIcon fontSize="small" />
                      ) : (
                        <KeyboardArrowDownIcon fontSize="small" />
                      )
                    }
                    onClick={() => expandable?.onToggle(row)}
                    aria-expanded={expanded}
                    aria-controls={detailId}
                  />
                </TableCell>
              )}

              {visible.map((column, index) => {
                // A column that states its own cell keeps it: an Action's
                // content is its `label`, a string, so the alternative to this
                // is throwing the column author's markup away in silence.
                const opens = index === 0 && onRowOpen !== undefined && column.render === undefined;
                const value = columnValue(column, row);

                return (
                  <TableCell
                    key={column.key}
                    align={alignOf(column)}
                    className={column.numeric === true ? 'tnum' : undefined}
                    sx={cellSx(column)}
                  >
                    {opens ? (
                      <Box sx={openCellSx} onClick={(event) => event.stopPropagation()}>
                        <Action
                          label={value === '' ? rowLabel(row) : value}
                          role="quiet"
                          size="compact"
                          onClick={() => onRowOpen?.(row)}
                        />
                      </Box>
                    ) : column.render !== undefined ? (
                      column.render(row)
                    ) : (
                      textCell(value)
                    )}
                  </TableCell>
                );
              })}

              {hasRowActions && (
                <TableCell
                  align="right"
                  sx={{ width: ACTIONS_WIDTH }}
                  onClick={(event) => event.stopPropagation()}
                >
                  <RowActionsTrigger
                    triggerLabel={rowActionsLabel}
                    onClick={(event) => menu.open(event, row)}
                    expanded={menuKey === key}
                  />
                </TableCell>
              )}
            </TableRow>

            {hasExpander && (
              <TableRow>
                <TableCell id={detailId} colSpan={colSpan} sx={detailCellSx}>
                  <Collapse in={expanded} unmountOnExit>
                    <Box sx={{ px: GAP.block, py: GAP.cluster }}>
                      {expandable.loadingRow?.(row) === true ? (
                        // A shaped body, never a spinner: the expander knows
                        // what is coming, so it says so.
                        <SectionSkeleton />
                      ) : (
                        expandable.render(row)
                      )}
                    </Box>
                  </Collapse>
                </TableCell>
              </TableRow>
            )}
          </Fragment>
        );
      })}

      {/* A filtered-to-zero table answers inside its own body rather than
          leaving the reader a head with nothing under it. */}
      {rows.length === 0 && emptyState !== undefined ? (
        <ZeroState placement="cell" colSpan={colSpan} {...emptyState} />
      ) : null}
    </TableBody>
  );

  const foot =
    totals === undefined ? null : (
      <TableFooter>
        <TableRow>
          {leadingCells > 0 && <TableCell variant="body" colSpan={leadingCells} />}
          {totalsCells(totals.label, visible, totals.values)}
          {trailingCells > 0 && <TableCell variant="body" colSpan={trailingCells} />}
        </TableRow>
      </TableFooter>
    );

  const containerSx = composeSx(
    sticky ? stickyHeadSx : {},
    maxHeight === undefined ? {} : { maxHeight, overflowY: 'auto' },
  );

  // No `size="small"`. The density in the live table is not a decision anyone
  // made; it is this prop, and the spec says 52px rows.
  const table = (
    <Table aria-label={ariaLabel}>
      {head}
      {body}
      {foot}
    </Table>
  );

  return (
    <>
      {surface === false ? (
        <TableContainer sx={containerSx}>{table}</TableContainer>
      ) : (
        <TableContainer component={Card} sx={composeSx(surfaceSx, containerSx)}>
          {table}
        </TableContainer>
      )}

      {/* Mounted whether or not the menu is open: it owns the ConfirmDialog a
          `confirm` item raises, and a guard here would unmount that dialog the
          moment the menu closed behind it. */}
      {hasRowActions && (
        <ActionMenu
          {...menu.menuProps}
          items={menuRow === null ? [] : rowActions(menuRow)}
          menuLabel={menuRow === null ? 'Row actions' : `Actions for ${rowLabel(menuRow)}`}
        />
      )}
    </>
  );
}

/* ── TotalsRow ───────────────────────────────────────────────────────── */

/**
 * The totals row on its own, for a table assembled by hand. It maps the same
 * live columns the body does, so the reconciliation line cannot fall out of
 * step with the table above it the way `PassbookDetailPage.tsx:519-523`'s
 * `colSpan={5}` does the moment a column is added.
 *
 * The label takes the first column's cell; every other cell reads
 * `values[column.key]`, and a key with nothing under it renders empty rather
 * than an em-dash — a blank in a totals row means "this does not sum", which is
 * not the same statement as "no value".
 */
export function TotalsRow<T>({
  label,
  columns,
  values,
}: {
  label: string;
  columns: Column<T>[];
  values: Record<string, ReactNode>;
}) {
  return <TableRow>{totalsCells(label, screenColumns(columns), values)}</TableRow>;
}
