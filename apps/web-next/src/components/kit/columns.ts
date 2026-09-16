/**
 * One column declaration, three consumers: the cell drawn on screen, the key it
 * sorts by, and the column that reaches CSV/XLSX/PDF.
 *
 * Land & Properties declared its ten columns twice — once as `exportCols`
 * (`views/LandPropertiesPage.tsx:283-294`) and once as hand-written head and
 * body `<TableCell>`s (`:694-704`, `:710-752`) — and the two copies had already
 * drifted apart in shape and in order. Everything here derives from a single
 * `Column<T>[]` so that drift cannot come back.
 *
 * This lives apart from `DataTable.tsx` deliberately. The table is a
 * `'use client'` module; `ExportAction` needs nothing from it but these three
 * lines of arithmetic, and should not drag a React tree into a download handler
 * to get them. Nothing in this file may import React, MUI, or the exporters.
 *
 * `toExportCols` emits `fmt` unconditionally, and that is the entire reason it
 * exists. `@pattadar/core`'s `exportCell` (`packages/core/src/export/exporters.ts:20-24`)
 * reads `row[c.key]` straight off the row and only consults `fmt` when one is
 * present — so a column whose value is computed rather than stored (Properties
 * has four: `extentLabel`, `typeLabel`, `passbook`, `groupName`) exports a blank
 * cell while typechecking perfectly. A silently empty column in a founder-facing
 * report is the failure this file was written to make impossible.
 *
 * Contract: docs/specs/2026-09-14-web-component-kit-contract.md
 * Design authority: docs/specs/2026-07-26-ux-redesign-m3.md
 */
import type { Column, ExportCol, SortState } from './types';

/**
 * `null` and `undefined` collapse to `''`; everything else stringifies. The
 * CALLER decides whether an empty cell earns an em-dash — a table shows `'—'`,
 * a spreadsheet must stay genuinely empty. Mirrors `exportCell`'s own coercion
 * so the two never disagree about what "no value" looks like.
 */
function asText(value: unknown): string {
  return value === null || value === undefined ? '' : String(value);
}

/**
 * THE value precedence chain, used by the default cell body, the sort key and
 * the export cell alike:
 *   forExport ? column.exportValue?.(row) : undefined
 *     ?? column.value?.(row)
 *     ?? (row as Record<string, unknown>)[column.key]
 */
export function columnValue<T>(column: Column<T>, row: T, forExport?: boolean): string {
  const exported = forExport ? column.exportValue?.(row) : undefined;
  if (exported !== undefined && exported !== null) return exported;

  const value = column.value?.(row);
  if (value !== undefined && value !== null) return asText(value);

  return asText((row as Record<string, unknown>)[column.key]);
}

/** The sort key: `column.sortValue ?? column.value ?? row[key]`. */
export function columnSortValue<T>(column: Column<T>, row: T): string | number {
  const sortValue = column.sortValue?.(row);
  if (sortValue !== undefined && sortValue !== null) return sortValue;

  const value = column.value?.(row);
  if (value !== undefined && value !== null) return value;

  // A raw number keeps sorting numerically; anything else sorts as text.
  const raw = (row as Record<string, unknown>)[column.key];
  return typeof raw === 'number' ? raw : asText(raw);
}

/** Columns rendered on screen, in declaration order (`visibility !== 'export'`). */
export function screenColumns<T>(columns: Column<T>[]): Column<T>[] {
  return columns.filter((column) => column.visibility !== 'export');
}

/**
 * THE single source of truth for exports. Drops `visibility: 'screen'`, keeps
 * `'export'` and `'both'`, preserves declaration order, and ALWAYS emits `fmt`
 * — see the file header for why that is non-negotiable.
 */
export function toExportCols<T>(columns: Column<T>[]): ExportCol<T>[] {
  return columns
    .filter((column) => column.visibility !== 'screen')
    .map((column) => ({
      key: column.key,
      title: column.header,
      fmt: (_raw: unknown, row: T) => columnValue(column, row, true),
    }));
}

/**
 * Stable comparator built from one column, or `null` when there is nothing to
 * sort by. Sorting is presentational inside the kit's table — the screen owns
 * the ordering and may ignore this entirely.
 */
export function compareBy<T>(
  columns: Column<T>[],
  sort: SortState,
): ((a: T, b: T) => number) | null {
  if (!sort) return null;

  const column = columns.find((candidate) => candidate.key === sort.key);
  if (!column) return null;

  const sign = sort.dir === 'desc' ? -1 : 1;

  return (a, b) => {
    const left = columnSortValue(column, a);
    const right = columnSortValue(column, b);

    if (typeof left === 'number' && typeof right === 'number') {
      return sign * (left - right);
    }

    // `numeric` is what keeps 'Sy 9' ahead of 'Sy 10' in a survey-number column;
    // `sensitivity: 'base'` keeps case and accents out of the ordering.
    return (
      sign *
      String(left).localeCompare(String(right), undefined, {
        numeric: true,
        sensitivity: 'base',
      })
    );
  };
}
