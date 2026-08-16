/**
 * The two apps have to agree about where a paper lives.
 *
 * These are ported case-for-case from the Swift `documentFamily` in
 * PattadarKit/Format/DocSpine.swift. If one side changes and the other does
 * not, a person is told their deed is under "Title" on the phone and "Unsorted"
 * on the laptop — which is the bug this taxonomy exists to end.
 */
import { describe, expect, test } from 'bun:test';

import { DOC_FAMILIES, documentFamily, familyBlurb, familyLabel, familyTint } from './docFamilies';

describe('documentFamily', () => {
  test('deeds and the things that act like them are title', () => {
    expect(documentFamily('Sale Deed')).toBe('title');
    expect(documentFamily('SALE DEED (ABSOLUTE)')).toBe('title');
    expect(documentFamily('Gift Deed')).toBe('title');
    expect(documentFamily('GPA')).toBe('title');
    expect(documentFamily('Power of Attorney')).toBe('title');
    expect(documentFamily('Will')).toBe('title');
    expect(documentFamily('Mortgage')).toBe('title');
    expect(documentFamily('Agreement of Sale')).toBe('title');
  });

  test('the revenue department’s own papers are revenue', () => {
    expect(documentFamily('Pattadar Passbook')).toBe('revenue');
    expect(documentFamily('ROR/Adangal')).toBe('revenue');
    expect(documentFamily('1-B Register')).toBe('revenue');
    expect(documentFamily('Pahani')).toBe('revenue');
    expect(documentFamily('Mutation Order')).toBe('revenue');
  });

  test('sheets and sketches are maps', () => {
    expect(documentFamily('FMB')).toBe('map');
    expect(documentFamily('Tippon')).toBe('map');
    expect(documentFamily('Survey Sketch')).toBe('map');
  });

  test('identity cards are people, not land', () => {
    expect(documentFamily('Aadhaar')).toBe('identity');
    expect(documentFamily('aadhar card')).toBe('identity');
    expect(documentFamily('PAN')).toBe('identity');
  });

  test('searches and payments share a shelf', () => {
    expect(documentFamily('Encumbrance Certificate')).toBe('search');
    expect(documentFamily('EC')).toBe('search');
    expect(documentFamily('Tax Receipt')).toBe('search');
    expect(documentFamily('Kist challan')).toBe('search');
  });

  test('a settlement REGISTER is an old record, a settlement DEED is title', () => {
    // The order of these two tests is the whole reason this case exists.
    expect(documentFamily('Settlement Register')).toBe('old_record');
    expect(documentFamily('Settlement Deed')).toBe('title');
    expect(documentFamily('Sethwar')).toBe('old_record');
    expect(documentFamily('Khasra Pahani')).toBe('old_record');
  });

  test('"household" is not an old record', () => {
    // Bare "old" is deliberately never matched.
    expect(documentFamily('Household survey')).not.toBe('old_record');
  });

  test('an unknown paper admits it rather than posing as title', () => {
    expect(documentFamily('')).toBe('unsorted');
    expect(documentFamily('other')).toBe('unsorted');
    expect(documentFamily('some scanned thing')).toBe('unsorted');
  });

  test('bytes beat labels for photos and video', () => {
    expect(documentFamily('photo')).toBe('photo');
    expect(documentFamily('video')).toBe('photo');
    expect(documentFamily('other', 'image/jpeg')).toBe('photo');
    expect(documentFamily('other', 'video/mp4')).toBe('photo');
    // A PDF of a deed is not a photo just because it was scanned.
    expect(documentFamily('Sale Deed', 'application/pdf')).toBe('title');
  });
});

describe('the shelves themselves', () => {
  test('every family has a label, a blurb and a tint', () => {
    for (const f of DOC_FAMILIES) {
      expect(familyLabel(f).length).toBeGreaterThan(0);
      expect(familyBlurb(f).length).toBeGreaterThan(0);
      expect(familyTint(f).length).toBeGreaterThan(0);
    }
  });

  test('labels match the Swift twin word for word', () => {
    // Copied from familyLabel in DocSpine.swift. A mismatch here means the two
    // apps are naming the same shelf differently.
    expect(DOC_FAMILIES.map(familyLabel)).toEqual([
      'Title',
      'Revenue record',
      'Map',
      'Identity',
      'Search & tax',
      'Old record',
      'Photos',
      'Unsorted',
    ]);
  });

  test('an unrecognised family degrades to unsorted rather than blank', () => {
    expect(familyLabel('nonsense')).toBe('Unsorted');
    expect(familyTint('nonsense')).toBe('gray');
  });
});
