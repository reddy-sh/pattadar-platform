import { describe, expect, test } from 'bun:test';
import { UNITS, formatArea, unitLabelFor } from './units';

describe('unitLabelFor — a unit named for a quantity', () => {
  test('one of a unit is singular', () => {
    expect(unitLabelFor(1, 'acre')).toBe('Acre');
    expect(unitLabelFor(1, 'cent')).toBe('Cent');
    expect(unitLabelFor(1, 'gunta')).toBe('Gunta');
    expect(unitLabelFor(1, 'sqyd')).toBe('Sq. yard');
    expect(unitLabelFor(1, 'sqft')).toBe('Sq. foot');
    expect(unitLabelFor(1, 'sqm')).toBe('Sq. metre');
    expect(unitLabelFor(1, 'hectare')).toBe('Hectare');
    expect(unitLabelFor(1, 'ankanam')).toBe('Ankanam');
  });

  test('every other count, zero and fractions included, is the plural the picker shows', () => {
    for (const u of UNITS) {
      for (const n of [0, 0.5, 1.5, 2, 100]) expect(unitLabelFor(n, u.key)).toBe(u.label);
    }
  });

  test('every unit has a singular', () => {
    for (const u of UNITS) expect(unitLabelFor(1, u.key)).not.toBe('');
  });

  test('the converter title agrees with the value under it', () => {
    // The Tools converter drew "1 ACRES =" above "1 Acre".
    expect(`1 ${unitLabelFor(1, 'acre')} =`).toBe('1 Acre =');
    expect(formatArea(1)).toBe('1 Acre');
    expect(`2 ${unitLabelFor(2, 'acre')} =`).toBe('2 Acres =');
    expect(formatArea(2)).toBe('2 Acres');
  });
});
