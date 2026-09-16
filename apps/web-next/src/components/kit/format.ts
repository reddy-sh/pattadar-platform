/**
 * The kit's display vocabulary: the only legal renderers for money, counts,
 * dates, status labels and area.
 *
 * Every one of these existed already, three or four times over, inline in the
 * screens — nine hand-written `toLocaleString('en-IN')` calls, three copies of
 * the `.replace(/-/g, ' ')` status transform and nine literal em-dashes typed
 * straight into JSX. Duplicated formatting is how a register starts telling two
 * different stories about the same rupee, so the whole vocabulary lives here and
 * the screens concatenate nothing but their own units.
 *
 * Extracted from `src/views/LandPropertiesPage.tsx` (`shortName` at :103-108,
 * the money and count `toLocaleString` sites at :292 / :467 / :469 / :740, the
 * status transforms at :551 / :577 / :745 and the em-dash fallbacks at :631-737)
 * and `src/views/detail/common.tsx` (`fmtDMY` :29-30, `money` :32-33, `dashVal`
 * :35-36), with the local-time timestamp rules of `src/lib/format.ts`'s
 * `fmtLocal` and the distance rule of `components/GeoMap.tsx:212-215`.
 *
 * TWO RULES THIS FILE EXISTS TO ENFORCE
 *  - Units are never re-cased here. `'Sq.yd'` and `'sq.ft'` are founder copy,
 *    not a formatting detail: `num()` returns the grouped digits and the screen
 *    appends its own suffix, so the Properties stat tiles keep rendering
 *    byte-for-byte what they render today.
 *  - Land maths is never re-implemented. `area` is `@pattadar/core`'s
 *    `formatArea`, re-exported so no view reaches past the kit for acreage.
 *
 * Pure functions only — no React, no `'use client'`, no imports beyond
 * `@pattadar/core`. Nothing here ever emits `'NaN'`, `'Invalid Date'` or an
 * empty string where a reader expects a value; absence renders as `dash`.
 *
 * Contract: docs/specs/2026-09-14-web-component-kit-contract.md
 * Design authority: docs/specs/2026-07-26-ux-redesign-m3.md
 */
import { formatArea } from '@pattadar/core';

/** The one em-dash fallback. Every "we do not know this" in the app is this. */
export const dash = '—';

/** A full ISO date head, the only string shape we reverse rather than parse. */
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** A trailing `Z` or `±HH:MM` — the marker that says "this stamp knows its zone". */
const HAS_TZ = /[zZ]$|[+-]\d\d:?\d\d$/;

/** Anything non-numeric collapses to 0 so no caller can ever print `NaN`. */
function finite(n: number | null | undefined): number {
  const v = Number(n);
  return Number.isFinite(v) ? v : 0;
}

/** True for the values that mean "no figure", as opposed to the figure zero. */
function absent(n: number | null | undefined): boolean {
  return n === null || n === undefined || !Number.isFinite(Number(n));
}

function localDMY(d: Date): string {
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}/${d.getFullYear()}`;
}

function localHM(d: Date): string {
  const hh = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  return `${hh}:${min}`;
}

/* ── Money ───────────────────────────────────────────────────────────── */

/**
 * Rupees, en-IN grouping, no paise. Returns a plain string — the `.tnum`
 * tabular-numeral class is the component's job, never this function's.
 */
export function inr(n: number | null | undefined): string {
  return `₹${Math.round(finite(n)).toLocaleString('en-IN')}`;
}

/**
 * `inr()`, or the em-dash for null / undefined / NaN / 0 — a holding with no
 * recorded value must read as unknown, not as worth nothing
 * (LandPropertiesPage.tsx:740).
 */
export function inrOrDash(n: number | null | undefined): string {
  return absent(n) || Number(n) === 0 ? dash : inr(n);
}

/* ── Counts ──────────────────────────────────────────────────────────── */

/**
 * Plain en-IN integer grouping. NO unit suffix is ever appended: the caller
 * owns its own copy, which is what keeps `Sq.yd` and `sq.ft` untouched.
 */
export function num(n: number | null | undefined): string {
  return finite(n).toLocaleString('en-IN');
}

/**
 * `num()`, or the em-dash when there is no number at all. Zero is a COUNT, not
 * an absence — "0 parcels" is a fact the reader needs — so unlike `inrOrDash`
 * this renders `'0'`. A screen that wants a dash for zero says so itself, the
 * way the Properties tiles do.
 */
export function numOrDash(n: number | null | undefined): string {
  return absent(n) ? dash : num(n);
}

/* ── Dates ───────────────────────────────────────────────────────────── */

/**
 * DD/MM/YYYY — the plain-language invariant. Accepts `'YYYY-MM-DD'`, a full ISO
 * timestamp or a `Date`.
 *
 * An ISO string is reversed, never parsed: parsing would drag the stamp through
 * the viewer's timezone and slide a registration date onto the wrong day. Only
 * an unrecognised string falls back to `Date`, and a string that will not parse
 * is returned unchanged rather than shown as `Invalid Date`.
 */
export function dmy(v: string | Date | null | undefined): string {
  if (v === null || v === undefined) return dash;
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? dash : localDMY(v);
  const raw = String(v).trim();
  if (!raw) return dash;
  const head = raw.slice(0, 10);
  if (ISO_DATE.test(head)) return head.split('-').reverse().join('/');
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? raw : localDMY(d);
}

/**
 * DD/MM/YYYY, HH:mm in the reader's own clock. Server stamps arrive naive and
 * are UTC by convention, so a stamp with no zone marker is read as UTC before
 * it is shown locally — the rule `lib/format.ts`'s `fmtLocal` already applies at
 * every audit and notes surface. A date with no time reads as midnight.
 */
export function dmyTime(v: string | Date | null | undefined): string {
  if (v === null || v === undefined) return dash;
  if (v instanceof Date) {
    return Number.isNaN(v.getTime()) ? dash : `${localDMY(v)}, ${localHM(v)}`;
  }
  const raw = String(v).trim();
  if (!raw) return dash;
  if (ISO_DATE.test(raw)) return `${raw.split('-').reverse().join('/')}, 00:00`;
  const d = new Date(HAS_TZ.test(raw) ? raw : `${raw}Z`);
  return Number.isNaN(d.getTime()) ? raw : `${localDMY(d)}, ${localHM(d)}`;
}

/* ── Words ───────────────────────────────────────────────────────────── */

/**
 * `'for-sale'` → `'For sale'`. Replaces the three inline `.replace(/-/g, ' ')`
 * sites. Only the first character is raised: a status is a sentence fragment,
 * not a title, so `'under_purchase'` reads as "Under purchase".
 */
export function statusLabel(v: string | null | undefined): string {
  const s = String(v ?? '')
    .replace(/[-_]/g, ' ')
    .trim();
  if (!s) return dash;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * Raises the first letter of every word and leaves the rest of each word alone,
 * so an acronym already in the data ("RTC", "EC") survives being title-cased.
 */
export function titleCase(v: string): string {
  return String(v ?? '').replace(/\S+/g, (w) => w.charAt(0).toUpperCase() + w.slice(1));
}

/**
 * First two words, an ellipsis when there are more, hard-truncated at `max`.
 * Owner names run long enough to break a card's one-line hero
 * (LandPropertiesPage.tsx:103-108).
 */
export function shortName(v: string, max = 25): string {
  const parts = String(v || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  let out = parts.slice(0, 2).join(' ');
  if (parts.length > 2) out += '…';
  return out.length > max ? `${out.slice(0, max - 1)}…` : out;
}

/** `pluralise(2, 'parcel')` → `'2 parcels'`; `pluralise(1, 'property', 'properties')`. */
export function pluralise(n: number, one: string, many?: string): string {
  const count = finite(n);
  return `${num(count)} ${count === 1 ? one : (many ?? `${one}s`)}`;
}

/* ── Land ────────────────────────────────────────────────────────────── */

/**
 * THE acreage renderer — `@pattadar/core`'s `formatArea` ("2 Acres 50 Cents"),
 * re-exported so no view imports land maths directly and the kit never grows a
 * second opinion about what an acre looks like.
 */
export { formatArea as area };

/**
 * `area()`, or the em-dash when there is no extent. Acreage of zero is not a
 * holding of zero size, it is an extent nobody has recorded yet
 * (LandPropertiesPage.tsx:474).
 */
export function areaOrDash(acres: number | null | undefined): string {
  return absent(acres) || Number(acres) <= 0 ? dash : formatArea(Number(acres));
}

/**
 * A distance: `'820 m'` below a kilometre, `'1.24 km'` above it
 * (GeoMap.tsx:212-215). Perimeters only — square metres become acres through
 * core's `toAcres(sqm, 'sqm')` and then `area()`, never through a second
 * conversion table in here.
 */
export function metres(m: number | null | undefined): string {
  if (absent(m)) return dash;
  const v = Number(m);
  if (v === 0) return dash;
  return Math.abs(v) >= 1000 ? `${(v / 1000).toFixed(2)} km` : `${Math.round(v)} m`;
}
