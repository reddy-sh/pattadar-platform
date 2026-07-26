/**
 * Table-export data preparation (ported from the predecessor's design-system
 * exporters.ts). This is the RENDERING-FREE half: column/brand shapes, cell
 * resolution, timestamping and CSV text building — pure functions safe for
 * both web and native heads. The web app layers jsPDF/xlsx/Blob rendering on
 * top (apps/web/src/export/exporters.ts).
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
export type ExportCol<T = any> = { key: string; title: string; fmt?: (v: any, row: T) => string };

export type ExportBrand = {
  brand: string; // e.g. "Pattadar"
  title: string; // report title, e.g. "Passbook Register"
  subtitle?: string; // e.g. "Andhra Pradesh / Telangana Land Records"
  watermark?: string; // diagonal watermark text (defaults to brand)
};

/** Resolve one cell to its export string (fmt wins; null/undefined → ""). */
export function exportCell<T>(c: ExportCol<T>, row: T): string {
  const raw = (row as any)[c.key];
  if (c.fmt) return c.fmt(raw, row);
  return raw === null || raw === undefined ? '' : String(raw);
}

/** "DD/MM/YYYY, HH:mm" generation stamp used in headers/footers. */
export function exportStamp(now: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(now.getDate())}/${p(now.getMonth() + 1)}/${now.getFullYear()}, ${p(now.getHours())}:${p(now.getMinutes())}`;
}

export function csvEscape(v: string): string {
  return /[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

/** Full CSV body (CRLF rows, header first) — caller adds BOM + download. */
export function buildCsv<T>(cols: ExportCol<T>[], rows: T[]): string {
  return [
    cols.map((c) => csvEscape(c.title)).join(','),
    ...rows.map((r) => cols.map((c) => csvEscape(exportCell(c, r))).join(',')),
  ].join('\r\n');
}

/** Rows resolved to a string matrix (header + body) — feeds xlsx/pdf tables. */
export function buildMatrix<T>(cols: ExportCol<T>[], rows: T[]): { head: string[]; body: string[][] } {
  return {
    head: cols.map((c) => c.title),
    body: rows.map((r) => cols.map((c) => exportCell(c, r))),
  };
}
