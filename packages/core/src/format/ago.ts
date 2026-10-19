/**
 * How long ago something happened, spelled out (naming standard U4:
 * "3 hours ago", never "3h"). After a week it is the date itself, DD/MM/YYYY,
 * because "23 days ago" makes the reader do arithmetic the date already did.
 *
 * `relativeTime` in ./audit abbreviates for the dense audit log; an order's
 * Activity stream is read by the owner, so it says the words.
 */
import { formatDate } from './date';

/** A timestamp with no zone marker is UTC, as the API writes it. */
function parse(iso: string): Date {
  const s = String(iso ?? '').trim();
  if (!s) return new Date(NaN);
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return new Date(`${s}T00:00:00`);
  return new Date(/(?:Z|[+-]\d{2}:?\d{2})$/.test(s) ? s : `${s}Z`);
}

const count = (n: number, one: string) => `${n} ${n === 1 ? one : `${one}s`} ago`;

export function agoSpelled(iso: string, now: Date = new Date()): string {
  const d = parse(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const mins = Math.floor((now.getTime() - d.getTime()) / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return count(mins, 'minute');
  const hours = Math.floor(mins / 60);
  if (hours < 24) return count(hours, 'hour');
  const days = Math.floor(hours / 24);
  if (days === 1) return 'yesterday';
  if (days < 7) return count(days, 'day');
  return formatDate(d);
}

/** "05/10/2026, 14:30" — the full moment, for a `<time>`'s title. */
export function dayAndTime(iso: string): string {
  const d = parse(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${formatDate(d)}, ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
