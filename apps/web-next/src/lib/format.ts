/**
 * Small display helpers ported from the predecessor pattadar app (RemoteApp.tsx /
 * shared.ts): server-timestamp formatting and the deterministic avatar
 * colour used on owner initials.
 */

/**
 * Format a server timestamp (naive UTC) in the browser's local time as
 * DD/MM/YYYY — the Indian convention. `dateOnly` drops the HH:mm suffix.
 */
export function fmtLocal(iso: string | null | undefined, opts?: { dateOnly?: boolean }): string {
  if (!iso) return '—';
  const hasTz = /[zZ]$|[+-]\d\d:?\d\d$/.test(iso);
  const d = new Date(hasTz ? iso : iso + 'Z');
  if (isNaN(d.getTime())) return iso;
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const date = `${dd}/${mm}/${d.getFullYear()}`;
  if (opts?.dateOnly) return date;
  const hh = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  return `${date}, ${hh}:${min}`;
}

const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

/**
 * Human-friendly entity text for feeds and tables — machine UUIDs are NEVER
 * user-facing copy. Prefers `detail` when it reads as a label (survey no,
 * name, doc no), falls back to `ref`, and returns '' when only a raw UUID is
 * available so callers omit the id entirely.
 */
export function humanEntity(ref?: string | null, detail?: string | null): string {
  const d = (detail || '').trim();
  if (d && !UUID_RE.test(d)) return d;
  const r = (ref || '').trim();
  if (r && !UUID_RE.test(r)) return r;
  return '';
}

const AVA_COLORS = [
  '#1677ff', '#389e0d', '#722ed1', '#d46b08', '#eb2f96', '#08979c', '#cf1322',
  '#d48806', '#2f54eb', '#c41d7f', '#d4380d', '#5b8c00', '#873800', '#0ea5b7',
];

/** Deterministic avatar colour from a name/string (same hash as source). */
export function avaColor(s: string): string {
  let h = 0;
  for (const ch of String(s || '?')) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return AVA_COLORS[h % AVA_COLORS.length];
}
