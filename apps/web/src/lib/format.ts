/**
 * Small display helpers ported from the rhub pattadar app (RemoteApp.tsx /
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

/**
 * Deterministic avatar ramp — 12 hues evenly walked around the wheel at a
 * fixed oklch(48% 0.120 H), warm hues first so the common case sits near the
 * Bloom anchor (design.md § Theme). Constant lightness means white initials
 * clear AA on every swatch: measured 5.85:1 worst case (hue 200), 7.00:1 best.
 * Replaces an Ant Design ramp whose 14 entries ranged #1677ff → #eb2f96 and
 * varied wildly in lightness, so some initials were unreadable.
 */
const AVA_COLORS = [
  '#953c43', '#944123', '#8f4700', '#7c5600', '#556600', '#197037',
  '#00725a', '#007078', '#006894', '#3c5aa1', '#694b96', '#82417d',
];

/** Deterministic avatar colour from a name/string (same hash as source). */
export function avaColor(s: string): string {
  let h = 0;
  for (const ch of String(s || '?')) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return AVA_COLORS[h % AVA_COLORS.length];
}
