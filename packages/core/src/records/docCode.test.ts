/**
 * The spine code must agree with the Swift `documentMono` (DocSpine.swift),
 * case for case, so a sale deed is "SD" wherever it is drawn.
 */
import { describe, expect, test } from 'bun:test';

import { documentCode, documentYear } from './docCode';

describe('documentCode', () => {
  test('revenue papers', () => {
    expect(documentCode('Adangal 2025-26')).toBe('AD');
    expect(documentCode('Pahani')).toBe('AD');
    expect(documentCode('Pattadar passbook')).toBe('1B');
    expect(documentCode('ROR 1-B')).toBe('1B');
    expect(documentCode('Mutation order')).toBe('MU');
  });

  test('maps and searches', () => {
    expect(documentCode('FMB sketch')).toBe('FM');
    expect(documentCode('Tippon')).toBe('FM');
    expect(documentCode('Encumbrance certificate')).toBe('EC');
    expect(documentCode('EC')).toBe('EC');
    expect(documentCode('EC 1985-2026')).toBe('EC');
    expect(documentCode('Land revenue receipt')).toBe('₹');
    expect(documentCode('Water tax challan')).toBe('₹');
  });

  test('identity papers', () => {
    expect(documentCode('Aadhaar')).toBe('AA');
    expect(documentCode('PAN')).toBe('PA');
    expect(documentCode('PAN card')).toBe('PA');
  });

  test('old records', () => {
    expect(documentCode('Sethwar extract')).toBe('SE');
    expect(documentCode('Khasra pahani 1954')).toBe('AD'); // pahani wins, as in Swift
    expect(documentCode('Khasra')).toBe('KH');
  });

  test('title papers, in the Swift order', () => {
    expect(documentCode('GPA')).toBe('GP');
    expect(documentCode('Power of attorney')).toBe('GP');
    expect(documentCode('Gift deed')).toBe('GD');
    expect(documentCode('Partition deed')).toBe('PD');
    expect(documentCode('Will')).toBe('WL');
    // An agreement of sale is an agreement before it is a sale.
    expect(documentCode('Sale agreement')).toBe('AG');
    expect(documentCode('Sale deed 4412 of 1998')).toBe('SD');
    expect(documentCode('Conveyance')).toBe('SD');
  });

  test('anything else is its initials, and nothing is a question mark', () => {
    expect(documentCode('Scan 2026-08-02')).toBe('S');
    expect(documentCode('Survey report')).toBe('SR');
    expect(documentCode('')).toBe('?');
    expect(documentCode('2026')).toBe('?');
  });
});

describe('documentYear', () => {
  test('reads the title first', () => {
    expect(documentYear('Sale deed 4412 of 1998', 'Markapur SRO · 2001')).toBe('1998');
    expect(documentYear('Adangal 2025-26')).toBe('2025-26');
  });

  test('falls back to the detail line', () => {
    expect(documentYear('Sale agreement', 'Sai Residency · 2019 · 9 pages')).toBe('2019');
  });

  test('a date is its year, not a revenue year', () => {
    expect(documentYear('Scan 2026-08-02')).toBe('2026');
    expect(documentYear('Scan 02-08-2026')).toBe('2026');
  });

  test('never guesses', () => {
    expect(documentYear('FMB sketch', 'Survey 214/2 · village map')).toBe('');
    expect(documentYear('Sale deed 44120')).toBe('');
    expect(documentYear('')).toBe('');
  });
});
