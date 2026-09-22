/** Every row of a passbook becomes its own record, and this is the one function
 *  that decides how much land each of those records claims. It is tested apart
 *  from the drawer because the failure mode is silent: nobody eyeballs twelve
 *  extents the way they eyeball one, so a wrong conversion here is filed and
 *  believed.
 *
 *  The cents case is the reason this exists at all. The drawer's other helper,
 *  deedExtent, maps the word "cents" onto the acres box and converts nothing —
 *  fine for a single figure somebody is about to read back, a hundredfold
 *  overstatement of a family's land when it is applied to a row nobody checks. */
import { expect, test } from 'bun:test';

import { parcelAcres } from './PropertyActions';

test('reads the extent as written and converts by the unit the paper names', () => {
  // The shape the reader actually returns for a ROR-1B row.
  expect(parcelAcres({ survey: '119-2', extent: '1.39 acres', unit: 'Acres' })).toBe(1.39);
  expect(parcelAcres({ survey: '70-3', extent: '3.20 acres', unit: 'Acres' })).toBe(3.2);
});

test('cents are converted, not relabelled', () => {
  // 100 cents = 1 acre. Relabelling would file this as five acres.
  expect(parcelAcres({ survey: '12', extent: '5 Cents', unit: 'Cents' })).toBe(0.05);
});

test('guntas and hectares are carried rather than dropped to zero', () => {
  expect(parcelAcres({ survey: '12', extent: '40 Guntas', unit: 'Guntas' })).toBe(1);
  expect(parcelAcres({ survey: '13', extent: '1 Hectare', unit: 'Hectares' })).toBe(2.47);
});

test('a bare number under the legacy compound label is decimal acres', () => {
  expect(parcelAcres({ survey: '14', extent: 2, unit: 'Acres-Guntas' })).toBe(2);
});

test('an unnamed unit falls back to the words in the extent itself', () => {
  expect(parcelAcres({ survey: '15', extent: '3 cents', unit: '' })).toBe(0.03);
});

test('nothing readable is zero, not a guess', () => {
  expect(parcelAcres({ survey: '16', extent: '', unit: 'Acres' })).toBe(0);
  expect(parcelAcres({ survey: '17', extent: 0, unit: 'Acres' })).toBe(0);
});
