/**
 * Date formatting helpers — India convention: DD/MM/YYYY.
 * Pure functions, no dependencies.
 */

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/** Format a Date as DD/MM/YYYY (local time). */
export function formatDate(date: Date): string {
  return `${pad2(date.getDate())}/${pad2(date.getMonth() + 1)}/${date.getFullYear()}`;
}

/** Format a Date as DD/MM/YYYY HH:mm (local time, 24-hour clock). */
export function formatDateTime(date: Date): string {
  return `${formatDate(date)} ${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
}

/**
 * Convert an ISO string (e.g. "2026-07-25" or "2026-07-25T10:30:00Z") to
 * DD/MM/YYYY for display. Date-only strings are formatted verbatim (no
 * timezone shift); strings with a time component use local time.
 * Returns the input unchanged if it cannot be parsed.
 */
export function parseISOToDisplay(iso: string): string {
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (dateOnly) {
    const [, y, m, d] = dateOnly;
    return `${d}/${m}/${y}`;
  }
  // Already day-first — how deed readings and Indian forms write a date
  // ("04/03/1998" is the 4th of March). It must never reach `new Date`, which
  // reads it month-first and swapped the day and month of every reading whose
  // day was 12 or less. Reshaped by string surgery, like the ISO branch.
  const dayFirst = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(iso);
  if (dayFirst) {
    const [, d, m, y] = dayFirst;
    return `${d.padStart(2, '0')}/${m.padStart(2, '0')}/${y}`;
  }
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) {
    return iso;
  }
  return formatDate(parsed);
}
