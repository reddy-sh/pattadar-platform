import { expect, test } from 'bun:test';

import { inr } from './ui';

test('a crore figure rounds half-up from whole lakhs, not through floating point', () => {
  // 238.5 lakh is 2.385 Cr, stored in binary as 2.38499…
  expect(inr(23_850_000)).toBe('₹2.39 Cr');
  expect(inr(14_000_000)).toBe('₹1.40 Cr');
  expect(inr(10_000_000)).toBe('₹1.00 Cr');
  expect(inr(9_999_500)).toBe('₹1.00 Cr');
  expect(inr(-23_850_000)).toBe('−₹2.39 Cr');
});

test('lakhs and smaller figures are unchanged', () => {
  expect(inr(4_200_000)).toBe('₹42.0 L');
  expect(inr(1_008_000)).toBe('₹10.08 L');
  expect(inr(18_400)).toBe('₹18,400');
});
