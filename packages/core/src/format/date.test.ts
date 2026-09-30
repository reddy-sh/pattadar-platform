/**
 * Invariant 6 of README.md — "Dates render DD/MM/YYYY (India) everywhere" — is
 * made of this module. Until now the only place the repository asserted it was
 * a single end-to-end check of a footer string, so a regression here would have
 * reached an owner before it reached a test.
 *
 * Every case below was read off the implementation, not off the invariant.
 * Where the two disagree the test pins what the code DOES and says so, so that
 * the change which fixes it has to be deliberate:
 *   - an unparseable Date renders as the literal text "NaN/NaN/NaN"
 *   - a timestamped ISO string is rendered in the READER's zone, so it lands on
 *     a different calendar day than the owner's whenever the process is not in
 *     IST (`bun test` runs in UTC unless TZ says otherwise)
 *   - a date-only string is reshaped without being range-checked, so
 *     "2026-13-45" becomes "45/13/2026"
 */
import { describe, expect, test } from 'bun:test';

import { formatDate, formatDateTime, parseISOToDisplay } from './date';

/**
 * What calendar day an instant falls on in a named zone — an oracle independent
 * of the code under test. Mutating process.env.TZ mid-run is not reliable under
 * bun test (Date keeps the zone it first resolved), so the zone-sensitive cases
 * below are pinned by comparing against this instead.
 */
const dayIn = (timeZone: string, instant: Date): string =>
  new Intl.DateTimeFormat('en-GB', { timeZone, day: '2-digit', month: '2-digit', year: 'numeric' }).format(instant);

/** The zone this process happens to be in. On CI that is UTC, never IST. */
const RUNNER_ZONE = Intl.DateTimeFormat().resolvedOptions().timeZone;

describe('formatDate', () => {
  test('a date renders DD/MM/YYYY with both fields zero-padded', () => {
    // 09/06/1983 — the shape printed on the IDs an owner copies from.
    expect(formatDate(new Date(1983, 5, 9))).toBe('09/06/1983');
    expect(formatDate(new Date(2026, 6, 25))).toBe('25/07/2026');
  });

  test('single-digit days and months keep their leading zero', () => {
    expect(formatDate(new Date(2026, 0, 1))).toBe('01/01/2026');
    expect(formatDate(new Date(2026, 8, 9))).toBe('09/09/2026');
  });

  test('the ends of the calendar are not special-cased', () => {
    // Day 01 and 31, month 01 and 12 — the four boundaries pad2 has to survive.
    expect(formatDate(new Date(2026, 0, 31))).toBe('31/01/2026');
    expect(formatDate(new Date(2026, 11, 1))).toBe('01/12/2026');
    expect(formatDate(new Date(2026, 11, 31))).toBe('31/12/2026');
    expect(formatDate(new Date(2024, 1, 29))).toBe('29/02/2024');
  });

  test('an instant renders as the READER’s calendar day, not India’s', () => {
    // 26/07/2026 at 02:00 in India, still 25/07/2026 in UTC and in California.
    // This is the same class of defect as the London-timezone filename: the
    // owner's day and the rendered day agree only when the process runs in IST.
    const instant = new Date('2026-07-25T20:30:00Z');
    expect(formatDate(instant)).toBe(dayIn(RUNNER_ZONE, instant));
    expect(dayIn('Asia/Kolkata', instant)).toBe('26/07/2026');
    expect(dayIn('UTC', instant)).toBe('25/07/2026');
    expect(dayIn('America/Los_Angeles', instant)).toBe('25/07/2026');
  });

  test('an invalid Date prints the literal text NaN/NaN/NaN', () => {
    // FINDING, not a preference: nothing guards this, so a bad date reaches the
    // screen as "NaN/NaN/NaN" rather than as blank or a dash. Callers that want
    // the graceful form have to go through parseISOToDisplay.
    expect(formatDate(new Date('not a date'))).toBe('NaN/NaN/NaN');
  });
});

describe('formatDateTime', () => {
  test('appends a zero-padded 24-hour clock', () => {
    expect(formatDateTime(new Date(2026, 6, 25, 9, 5))).toBe('25/07/2026 09:05');
    expect(formatDateTime(new Date(2026, 6, 25, 14, 30))).toBe('25/07/2026 14:30');
  });

  test('midnight is 00:00 and the last minute of the day is 23:59', () => {
    expect(formatDateTime(new Date(2026, 6, 25, 0, 0))).toBe('25/07/2026 00:00');
    expect(formatDateTime(new Date(2026, 6, 25, 23, 59))).toBe('25/07/2026 23:59');
  });

  test('seconds are dropped, not rounded up into the minute', () => {
    expect(formatDateTime(new Date(2026, 6, 25, 9, 5, 59))).toBe('25/07/2026 09:05');
  });

  test('an invalid Date carries the NaN through to the clock', () => {
    expect(formatDateTime(new Date('not a date'))).toBe('NaN/NaN/NaN NaN:NaN');
  });
});

describe('parseISOToDisplay', () => {
  test('a date-only string is reshaped by string surgery, not by parsing', () => {
    // A stored date-only value is a CALENDAR date and has to read the same from
    // every chair on earth. Proof it never goes through Date: the instant
    // reading of the very same string is the 24th west of Greenwich.
    expect(parseISOToDisplay('2026-07-25')).toBe('25/07/2026');
    expect(dayIn('America/Los_Angeles', new Date('2026-07-25'))).toBe('24/07/2026');
    expect(parseISOToDisplay('1983-06-09')).toBe('09/06/1983');
  });

  test('month and day boundaries survive the reshape', () => {
    expect(parseISOToDisplay('2026-01-01')).toBe('01/01/2026');
    expect(parseISOToDisplay('2026-12-31')).toBe('31/12/2026');
    expect(parseISOToDisplay('2026-01-31')).toBe('31/01/2026');
    expect(parseISOToDisplay('2026-12-01')).toBe('01/12/2026');
  });

  test('a timestamped string is rendered in the reader’s zone', () => {
    // FINDING (the module says so, this pins it): "uploaded at" and audit rows
    // are exactly this input, and an event 20:30 UTC already belongs to the
    // next day in India.
    const iso = '2026-07-25T20:30:00Z';
    expect(parseISOToDisplay(iso)).toBe(dayIn(RUNNER_ZONE, new Date(iso)));
    expect(dayIn('Asia/Kolkata', new Date(iso))).toBe('26/07/2026');

    // An offset-bearing string is converted, not read literally: 00:30 IST is
    // still the previous day everywhere west of India.
    const zoned = '2026-07-26T00:30:00+05:30';
    expect(parseISOToDisplay(zoned)).toBe(dayIn(RUNNER_ZONE, new Date(zoned)));
    expect(dayIn('Asia/Kolkata', new Date(zoned))).toBe('26/07/2026');
    expect(dayIn('UTC', new Date(zoned))).toBe('25/07/2026');
  });

  test('a midday timestamp agrees across the zones this team works in, which is why the bug hides', () => {
    // India, California, London and UTC (CI) all call 10:30Z the 25th, so a
    // developer never sees the defect above. It is not stable everywhere: at
    // UTC+14 it is already the 26th and at UTC-11 still the 24th, which is why
    // the last assertion uses the oracle rather than a literal.
    const iso = '2026-07-25T10:30:00Z';
    for (const zone of ['Asia/Kolkata', 'America/Los_Angeles', 'UTC', 'Europe/London']) {
      expect(dayIn(zone, new Date(iso))).toBe('25/07/2026');
    }
    expect(dayIn('Pacific/Kiritimati', new Date(iso))).toBe('26/07/2026');
    expect(dayIn('Pacific/Pago_Pago', new Date(iso))).toBe('24/07/2026');
    expect(parseISOToDisplay(iso)).toBe(dayIn(RUNNER_ZONE, new Date(iso)));
  });

  test('the date-only branch does no range checking at all', () => {
    // FINDING: no field is validated, so nonsense is handed to the screen in
    // perfect DD/MM/YYYY shape instead of being rejected.
    expect(parseISOToDisplay('2026-13-45')).toBe('45/13/2026');
    expect(parseISOToDisplay('0000-00-00')).toBe('00/00/0000');
  });

  test('a string it cannot parse is returned unchanged', () => {
    expect(parseISOToDisplay('')).toBe('');
    expect(parseISOToDisplay('not-a-date')).toBe('not-a-date');
    // Already-display DD/MM/YYYY survives by the pass-through path (month 25 is
    // unparseable), not by being recognised as a date.
    expect(parseISOToDisplay('25/07/2026')).toBe('25/07/2026');
    expect(Number.isNaN(new Date('25/07/2026').getTime())).toBe(true);
  });

  test('a loose ISO string goes through Date and still lands on DD/MM/YYYY', () => {
    // "2026-1-5" misses the strict \d{2} branch, but Date reads it as a LOCAL
    // calendar date, so no zone can move it and the shape still holds.
    expect(parseISOToDisplay('2026-1-5')).toBe('05/01/2026');
  });

  test('a year-month string is treated as an instant and can lose a day', () => {
    // FINDING: "2026-07" parses as UTC midnight on the 1st, so west of
    // Greenwich it displays as the last day of June.
    expect(parseISOToDisplay('2026-07')).toBe(dayIn(RUNNER_ZONE, new Date('2026-07')));
    expect(dayIn('Asia/Kolkata', new Date('2026-07'))).toBe('01/07/2026');
    expect(dayIn('America/Los_Angeles', new Date('2026-07'))).toBe('30/06/2026');
  });
});
