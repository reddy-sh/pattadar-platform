/**
 * A date of birth is typed and shown DD/MM/YYYY (invariant 6 of README.md, and
 * the shape on every ID the owner is copying from) but stored ISO. These are the
 * four functions the field is built out of, and until now none of them had a
 * single test: a regression would have silently rewritten a stored DOB.
 *
 * Cases were read off the implementation. Two of them pin behaviour that looks
 * wrong rather than asserting a preference, and say so where they sit:
 *   - isoToDmy hands back a full ISO TIMESTAMP untouched, so a value with a time
 *     component would appear verbatim in a DD/MM/YYYY field
 *   - 31/02/2026 and 29/02/2023 are accepted as valid: each field is
 *     range-checked on its own, and Date rolls the overflow into March
 */
import { describe, expect, test } from 'bun:test';

import { dmyToIso, isoToDmy, isValidDmy, maskDmyInput } from './dob';

/** DD/MM/YYYY for an instant, read off Intl rather than off the code under test. */
const dmyOf = (instant: Date): string =>
  new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', day: '2-digit', month: '2-digit', year: 'numeric' }).format(instant);

const DAY_MS = 86_400_000;

describe('isoToDmy', () => {
  test('a stored date turns around into DD/MM/YYYY', () => {
    expect(isoToDmy('1983-06-09')).toBe('09/06/1983');
    expect(isoToDmy('2026-07-25')).toBe('25/07/2026');
  });

  test('the ends of the calendar keep their padding', () => {
    expect(isoToDmy('2026-01-01')).toBe('01/01/2026');
    expect(isoToDmy('2026-12-31')).toBe('31/12/2026');
    expect(isoToDmy('2026-01-31')).toBe('31/01/2026');
    expect(isoToDmy('2026-12-01')).toBe('01/12/2026');
  });

  test('surrounding whitespace is trimmed before the swap', () => {
    expect(isoToDmy('   1983-06-09  ')).toBe('09/06/1983');
  });

  test('nothing is invented for a missing value', () => {
    expect(isoToDmy('')).toBe('');
    expect(isoToDmy('   ')).toBe('');
    expect(isoToDmy(null)).toBe('');
    expect(isoToDmy(undefined)).toBe('');
    expect(isoToDmy()).toBe('');
  });

  test('a value it does not recognise is echoed verbatim', () => {
    // Loose ISO is not accepted — the regex demands two digits.
    expect(isoToDmy('1983-6-9')).toBe('1983-6-9');
    expect(isoToDmy('not-a-date')).toBe('not-a-date');
    // Already-display input is idempotent, by pass-through rather than by parse.
    expect(isoToDmy('09/06/1983')).toBe('09/06/1983');
  });

  test('a timestamp is echoed as a raw ISO string into a DD/MM/YYYY field', () => {
    // FINDING: the anchored regex rejects anything with a time component, and
    // the fallback is the input itself, so a DOB stored as a timestamp would be
    // shown to the owner as "1983-06-09T10:00:00Z".
    expect(isoToDmy('1983-06-09T10:00:00Z')).toBe('1983-06-09T10:00:00Z');
  });
});

describe('dmyToIso', () => {
  test('a typed date becomes a zero-padded ISO date', () => {
    expect(dmyToIso('09/06/1983')).toBe('1983-06-09');
    expect(dmyToIso('25/07/2026')).toBe('2026-07-25');
  });

  test('single-digit day and month are accepted and padded', () => {
    expect(dmyToIso('9/6/1983')).toBe('1983-06-09');
    expect(dmyToIso('1/1/2026')).toBe('2026-01-01');
  });

  test('the ends of the calendar are accepted', () => {
    expect(dmyToIso('31/12/2026')).toBe('2026-12-31');
    expect(dmyToIso('01/01/2026')).toBe('2026-01-01');
    expect(dmyToIso('31/01/2026')).toBe('2026-01-31');
    expect(dmyToIso('01/12/2026')).toBe('2026-12-01');
  });

  test('a day or month outside its range is refused outright', () => {
    for (const bad of ['32/01/2026', '00/01/2026', '09/13/1983', '09/00/1983']) {
      expect(dmyToIso(bad)).toBe('');
    }
  });

  test('an ISO value passes straight through, anything else is dropped', () => {
    // The field re-runs this over its own stored value, so ISO in / ISO out.
    expect(dmyToIso('1983-06-09')).toBe('1983-06-09');
    for (const bad of ['1983-6-9', '9/6/83', '09-06-1983', '9.6.1983', 'abc', '']) {
      expect(dmyToIso(bad)).toBe('');
    }
    expect(dmyToIso(null)).toBe('');
    expect(dmyToIso(undefined)).toBe('');
  });

  test('surrounding whitespace does not make a date invalid', () => {
    expect(dmyToIso(' 09/06/1983 ')).toBe('1983-06-09');
  });

  test('a day that does not exist in that month is still converted', () => {
    // FINDING: each field is checked alone (1-31, 1-12), so a date the calendar
    // has never had is handed to the API as a well-formed ISO string.
    expect(dmyToIso('31/02/2026')).toBe('2026-02-31');
    expect(dmyToIso('29/02/2023')).toBe('2023-02-29');
    expect(dmyToIso('31/04/2026')).toBe('2026-04-31');
  });

  test('a padded date survives the round trip in both directions', () => {
    for (const dmy of ['09/06/1983', '01/01/2026', '31/12/2026']) {
      expect(isoToDmy(dmyToIso(dmy))).toBe(dmy);
    }
    for (const iso of ['1983-06-09', '2026-01-01', '2026-12-31']) {
      expect(dmyToIso(isoToDmy(iso))).toBe(iso);
    }
  });
});

describe('maskDmyInput', () => {
  test('eight digits become DD/MM/YYYY as the owner types', () => {
    expect(maskDmyInput('09061983')).toBe('09/06/1983');
  });

  test('the slashes appear one keystroke at a time', () => {
    expect(maskDmyInput('')).toBe('');
    expect(maskDmyInput('0')).toBe('0');
    expect(maskDmyInput('09')).toBe('09');
    expect(maskDmyInput('090')).toBe('09/0');
    expect(maskDmyInput('0906')).toBe('09/06');
    expect(maskDmyInput('09061')).toBe('09/06/1');
    expect(maskDmyInput('0906198')).toBe('09/06/198');
  });

  test('re-masking its own output changes nothing', () => {
    // The field feeds the masked value back in on every keystroke.
    expect(maskDmyInput('09/06/1983')).toBe('09/06/1983');
    expect(maskDmyInput(maskDmyInput('09061983'))).toBe('09/06/1983');
  });

  test('anything that is not a digit is discarded', () => {
    expect(maskDmyInput('ab09/06')).toBe('09/06');
    expect(maskDmyInput('09 06 1983')).toBe('09/06/1983');
  });

  test('a ninth digit cannot be typed', () => {
    expect(maskDmyInput('090619831234')).toBe('09/06/1983');
  });

  test('digits are regrouped by position, so a hyphenated date comes out wrong', () => {
    // FINDING, and a real paste case: "1-2-2026" holds six digits, which the
    // mask reads as 12/20/26 rather than 01/02/2026.
    expect(maskDmyInput('1-2-2026')).toBe('12/20/26');
    expect(dmyToIso(maskDmyInput('1-2-2026'))).toBe('');
  });
});

describe('isValidDmy', () => {
  test('an empty value is valid because the field is optional', () => {
    expect(isValidDmy('')).toBe(true);
    expect(isValidDmy('   ')).toBe(true);
    expect(isValidDmy(null)).toBe(true);
    expect(isValidDmy(undefined)).toBe(true);
  });

  test('a real past date is valid in either padding', () => {
    expect(isValidDmy('09/06/1983')).toBe(true);
    expect(isValidDmy('9/6/1983')).toBe(true);
    expect(isValidDmy('29/02/2024')).toBe(true);
    // An ISO value is accepted too, since dmyToIso lets it through.
    expect(isValidDmy('1983-06-09')).toBe(true);
  });

  test('a date that has not happened yet is refused', () => {
    expect(isValidDmy(dmyOf(new Date(Date.now() + 2 * DAY_MS)))).toBe(false);
    expect(isValidDmy(dmyOf(new Date(Date.now() - 2 * DAY_MS)))).toBe(true);
    expect(isValidDmy('31/12/2099')).toBe(false);
  });

  test('a malformed value is refused', () => {
    for (const bad of ['32/01/2026', '09/13/1983', 'abc', '9/6/83', '09-06-1983']) {
      expect(isValidDmy(bad)).toBe(false);
    }
  });

  test('a day that does not exist in that month is accepted as valid', () => {
    // FINDING: dmyToIso produces "2026-02-31", and Date rolls that into 03/03,
    // so the impossible date passes validation and is stored as typed. 29/02 in
    // a non-leap year gets in the same way.
    expect(isValidDmy('31/02/2026')).toBe(true);
    expect(isValidDmy('29/02/2023')).toBe(true);
    // The rollover that lets it through, stated outright.
    expect(dmyOf(new Date('2026-02-31'))).toBe('03/03/2026');
    expect(dmyOf(new Date('2023-02-29'))).toBe('01/03/2023');
  });
});
