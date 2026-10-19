import { expect, test } from 'bun:test';

import { perUnit } from './perUnit';

test('the units the server stores read as one of them', () => {
  expect(perUnit('ac')).toBe('an acre');
  expect(perUnit('acres')).toBe('an acre');
  expect(perUnit('Sq.yd')).toBe('a sq.yd');
  expect(perUnit('sqft')).toBe('a sq.ft');
  expect(perUnit('cents')).toBe('a cent');
});

test('an unknown unit is said as it came, and no unit says nothing', () => {
  expect(perUnit('bigha')).toBe('a bigha');
  expect(perUnit('')).toBe('');
  expect(perUnit(undefined)).toBe('');
});
