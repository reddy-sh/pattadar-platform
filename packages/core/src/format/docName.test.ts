/**
 * Once the AI has read a file, this is what the owner sees in their list and
 * what lands on their disk. Two things make it worth testing rather than
 * eyeballing: the name becomes a real filename, so a stray slash or colon is a
 * broken download; and the date in it is the one place in the repository where
 * invariant 6 is deliberately written DD-MM-YYYY instead of DD/MM/YYYY, because
 * a slash cannot appear in a filename.
 *
 * Findings pinned below rather than corrected:
 *   - a date already in DD/MM/YYYY form is silently replaced by TODAY
 *   - the 120-character cap can cut the extension off the filename
 *   - the date taken from a timestamp is the UTC calendar date, which is not the
 *     owner's date in the small hours of an Indian morning
 *   - stripTypePrefix ends in `? n : n`, so its last branch does nothing
 */
import { describe, expect, test } from 'bun:test';

import { documentDisplayName, documentFileName, formatAadhaarMask, stripTypePrefix } from './docName';

/** Today as the module would write it, read off Intl rather than off the code. */
const todayDmy = (): string =>
  new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' })
    .format(new Date())
    .replace(/\//g, '-');

/** What calendar day an instant falls on in a named zone. */
const dayIn = (timeZone: string, instant: Date): string =>
  new Intl.DateTimeFormat('en-GB', { timeZone, day: '2-digit', month: '2-digit', year: 'numeric' }).format(instant);

describe('documentDisplayName', () => {
  test('says what the paper IS, in the agreed order', () => {
    expect(
      documentDisplayName({ docType: 'ROR/Adangal', village: 'Village One', surveyNo: '71-2', date: '2026-07-27' }),
    ).toBe('ROR-Adangal · Village One · Sy 71-2 · 27-07-2026');
  });

  test('the owner names the paper only when there is no survey number', () => {
    const parts = { docType: 'Sale Deed', village: 'Village One', ownerName: 'Owner One', date: '2026-07-27' };
    expect(documentDisplayName(parts)).toBe('Sale Deed · Village One · Owner One · 27-07-2026');
    // A survey number identifies the land better, so it wins outright.
    expect(documentDisplayName({ ...parts, surveyNo: '71-2' })).toBe(
      'Sale Deed · Village One · Sy 71-2 · 27-07-2026',
    );
  });

  test('a registration number carries its year when there is one', () => {
    expect(documentDisplayName({ docType: 'Sale Deed', documentNo: '1234', regYear: '2019', date: '2026-07-27' })).toBe(
      'Sale Deed · No 1234-2019 · 27-07-2026',
    );
    expect(documentDisplayName({ docType: 'Sale Deed', documentNo: '1234', date: '2026-07-27' })).toBe(
      'Sale Deed · No 1234 · 27-07-2026',
    );
  });

  test('an unclassified paper is called Document, not left blank', () => {
    expect(documentDisplayName({ date: '2026-07-27' })).toBe('Document · 27-07-2026');
    // Whitespace-only fields count as absent, and do not leave an empty segment.
    expect(documentDisplayName({ docType: '   ', village: '  ', date: '2026-07-27' })).toBe('Document · 27-07-2026');
    expect(documentDisplayName({ docType: 'Doc', village: null, surveyNo: null, date: '2026-07-27' })).toBe(
      'Doc · 27-07-2026',
    );
  });

  test('every path-hostile character is replaced before it can reach a disk', () => {
    expect(documentDisplayName({ docType: 'A/B\\C:D*E?F"G<H>I|J', date: '2026-07-27' })).toBe(
      'A-B-C-D-E-F-G-H-I-J · 27-07-2026',
    );
    // Runs collapse to one dash, and inner whitespace collapses to one space.
    expect(documentDisplayName({ docType: 'A//\\:B', village: 'Spaced    Out', date: '2026-07-27' })).toBe(
      'A-B · Spaced Out · 27-07-2026',
    );
  });

  test('the date is DD-MM-YYYY: invariant 6 with hyphens, because filename', () => {
    // Deliberate deviation from DD/MM/YYYY — a slash cannot appear in a path.
    expect(documentDisplayName({ docType: 'Doc', date: '2026-01-01' })).toBe('Doc · 01-01-2026');
    expect(documentDisplayName({ docType: 'Doc', date: '2026-12-31' })).toBe('Doc · 31-12-2026');
    expect(documentDisplayName({ docType: 'Doc', date: '1983-06-09' })).toBe('Doc · 09-06-1983');
  });

  test('a date-only string is never shifted by a timezone', () => {
    // This is the London-timezone filename defect, and the reason the date-only
    // branch does string surgery: parsed as an instant, 2026-07-27 is the 26th
    // anywhere west of Greenwich.
    expect(documentDisplayName({ docType: 'Doc', date: '2026-07-27' })).toBe('Doc · 27-07-2026');
    expect(dayIn('America/Los_Angeles', new Date('2026-07-27'))).toBe('26/07/2026');
  });

  test('a timestamp contributes its own calendar date, which is the UTC one', () => {
    // The offset is ignored: the first ten characters win. Stable in every zone…
    expect(documentDisplayName({ docType: 'Doc', date: '2026-07-27T18:45:00Z' })).toBe('Doc · 27-07-2026');
    expect(documentDisplayName({ docType: 'Doc', date: '2026-07-28T02:00:00+05:30' })).toBe('Doc · 28-07-2026');
    // …but FINDING: for a Z timestamp late in the UTC day, the UTC date is not
    // the owner's date. 20:00Z is already 01:30 on the 28th in India.
    expect(documentDisplayName({ docType: 'Doc', date: '2026-07-27T20:00:00Z' })).toBe('Doc · 27-07-2026');
    expect(dayIn('Asia/Kolkata', new Date('2026-07-27T20:00:00Z'))).toBe('28/07/2026');
  });

  test('a missing or unreadable date falls back to today', () => {
    for (const date of [undefined, null, '', '   ', 'garbage']) {
      expect(documentDisplayName({ docType: 'Doc', date })).toBe(`Doc · ${todayDmy()}`);
    }
  });

  test('a date already in DD/MM/YYYY form is silently replaced by today', () => {
    // FINDING: the parser only understands ISO, and the fallback is `new Date()`
    // rather than an error, so a display-format date loses the document's real
    // date without anything being logged.
    expect(documentDisplayName({ docType: 'Doc', date: '27/07/2026' })).toBe(`Doc · ${todayDmy()}`);
  });
});

describe('documentFileName', () => {
  test('the display name becomes a path-safe base with the extension kept', () => {
    expect(
      documentFileName({ docType: 'ROR/Adangal', village: 'Village One', surveyNo: '71-2', date: '2026-07-27' }, 'scan.PDF'),
    ).toBe('ROR-Adangal - Village One - Sy 71-2 - 27-07-2026.pdf');
  });

  test('the middot separator becomes a hyphen and odd punctuation is dropped', () => {
    expect(documentFileName({ docType: 'Doc · Type', village: 'Village (One)', date: '2026-07-27' }, 'a.pdf')).toBe(
      'Doc - Type - Village One - 27-07-2026.pdf',
    );
  });

  test('the extension is taken from the original name and lower-cased', () => {
    const parts = { docType: 'Sale Deed', date: '2026-07-27' };
    expect(documentFileName(parts, 'photo.JPEG')).toBe('Sale Deed - 27-07-2026.jpeg');
    // Only the last extension, and only up to five characters of it.
    expect(documentFileName(parts, 'archive.tar.gz')).toBe('Sale Deed - 27-07-2026.gz');
    expect(documentFileName(parts, 'weird.TOOLONGEXT')).toBe('Sale Deed - 27-07-2026');
    expect(documentFileName(parts, 'noextension')).toBe('Sale Deed - 27-07-2026');
    expect(documentFileName(parts, '')).toBe('Sale Deed - 27-07-2026');
  });

  test('a very long name is capped at 120 characters and loses its extension', () => {
    // FINDING: the slice is applied after the extension is appended, so the file
    // that reaches the owner's disk has no suffix at all.
    const name = documentFileName({ docType: 'V'.repeat(200), date: '2026-07-27' }, 'scan.pdf');
    expect(name).toHaveLength(120);
    expect(name.endsWith('.pdf')).toBe(false);
    expect(name).toBe('V'.repeat(120));
  });
});

describe('formatAadhaarMask', () => {
  test('CL-483/498/513: the separators become spaces so they cannot read as dashes', () => {
    expect(formatAadhaarMask('XXXX-XXXX-0000')).toBe('XXXX XXXX 0000');
  });

  test('en dashes and em dashes are normalised too', () => {
    expect(formatAadhaarMask('XXXX\u2013XXXX\u20140000')).toBe('XXXX XXXX 0000');
  });

  test('runs of separators and stray padding collapse', () => {
    expect(formatAadhaarMask('XXXX--XXXX---0000')).toBe('XXXX XXXX 0000');
    expect(formatAadhaarMask('  XXXX-XXXX-0000  ')).toBe('XXXX XXXX 0000');
    // Already-spaced input is unchanged, so the function is safe to re-apply.
    expect(formatAadhaarMask('XXXX XXXX 0000')).toBe('XXXX XXXX 0000');
  });

  test('no reference means an empty string, not the word null', () => {
    expect(formatAadhaarMask('')).toBe('');
    expect(formatAadhaarMask(null)).toBe('');
    expect(formatAadhaarMask(undefined)).toBe('');
    expect(formatAadhaarMask()).toBe('');
  });
});

describe('stripTypePrefix', () => {
  test('the type is dropped when the chip beside it already says it', () => {
    expect(stripTypePrefix('Aadhaar - Owner One', 'Aadhaar')).toBe('Owner One');
    expect(stripTypePrefix('Sale Deed · Village One', 'Sale Deed')).toBe('Village One');
    expect(stripTypePrefix('Aadhaar — Owner One', 'Aadhaar')).toBe('Owner One');
    expect(stripTypePrefix('Aadhaar-Owner One', 'Aadhaar')).toBe('Owner One');
    expect(stripTypePrefix('Aadhaar·Owner One', 'Aadhaar')).toBe('Owner One');
  });

  test('punctuation and case are compared loosely', () => {
    // "ROR/Adangal" is written "ROR-Adangal" once it is a filename.
    expect(stripTypePrefix('ROR-Adangal - Village One', 'ROR/Adangal')).toBe('Village One');
    expect(stripTypePrefix('aadhaar - Owner One', 'Aadhaar')).toBe('Owner One');
    expect(stripTypePrefix('  Aadhaar - Owner One  ', 'Aadhaar')).toBe('Owner One');
  });

  test('a type that is not the prefix is left where it is', () => {
    expect(stripTypePrefix('Owner One - Aadhaar', 'Aadhaar')).toBe('Owner One - Aadhaar');
    expect(stripTypePrefix('Sale Deed - Owner One', 'Aadhaar')).toBe('Sale Deed - Owner One');
  });

  test('nothing to compare against means nothing is removed', () => {
    expect(stripTypePrefix('Sale Deed - Owner One', '')).toBe('Sale Deed - Owner One');
    expect(stripTypePrefix('Sale Deed - Owner One', null)).toBe('Sale Deed - Owner One');
    expect(stripTypePrefix('Sale Deed - Owner One', undefined)).toBe('Sale Deed - Owner One');
    expect(stripTypePrefix('', 'Aadhaar')).toBe('');
    expect(stripTypePrefix('   ', 'Aadhaar')).toBe('');
  });

  test('a name that is nothing but the type is returned unchanged', () => {
    // FINDING: the final line reads `return loose(n) === loose(t) ? n : n`, so
    // both branches are the same value. Whatever that ternary was meant to
    // decide, it decides nothing — the row shows the type twice.
    expect(stripTypePrefix('Sale Deed', 'Sale Deed')).toBe('Sale Deed');
    expect(stripTypePrefix('ROR-Adangal', 'ROR/Adangal')).toBe('ROR-Adangal');
  });

  test('a partial type match cuts at the first hyphen it finds', () => {
    // FINDING: with type "ROR" the loose comparison succeeds on the fragment
    // before the hyphen, so half of the document type survives in the name.
    expect(stripTypePrefix('ROR-Adangal - Village One', 'ROR')).toBe('Adangal - Village One');
  });
});
