/**
 * Money is read in lakhs and crores here, not in thousands and millions, and
 * ₹12,34,567 is the grouping an Indian owner checks a valuation against. The
 * grouping comes from Intl 'en-IN', so these cases are as much a pin on the
 * runtime's locale data as on the module: if a future Bun or a slimmed-down ICU
 * build silently falls back to ₹1,234,567, this is what says so.
 *
 * Findings pinned below rather than corrected:
 *   - the compact form puts the minus sign INSIDE the symbol ("₹-1.24 Cr")
 *     while the full form puts it outside ("-₹1,24,00,000")
 *   - a value between -1 and 0 renders as "-₹0"
 *   - a non-finite value reaches the screen as "₹Infinity Cr"
 */
import { describe, expect, test } from 'bun:test';

import { formatINR, formatINRCompact, formatNumberIN } from './inr';

describe('formatINR', () => {
  test('groups in lakhs and crores, not in thousands', () => {
    // The whole point of en-IN: the first comma is three digits in, the rest
    // every two. A thousands-grouped "₹1,234,567" would be the regression.
    expect(formatINR(1234567)).toBe('₹12,34,567');
    expect(formatINR(12345678)).toBe('₹1,23,45,678');
    expect(formatINR(1000)).toBe('₹1,000');
    expect(formatINR(100000)).toBe('₹1,00,000');
    expect(formatINR(10000000)).toBe('₹1,00,00,000');
  });

  test('the last ungrouped figure and the first grouped one', () => {
    expect(formatINR(999)).toBe('₹999');
    expect(formatINR(99999)).toBe('₹99,999');
  });

  test('zero is a figure, not a blank', () => {
    expect(formatINR(0)).toBe('₹0');
  });

  test('paise are rounded away, half up', () => {
    expect(formatINR(1234.4)).toBe('₹1,234');
    expect(formatINR(1234.5)).toBe('₹1,235');
    expect(formatINR(0.4)).toBe('₹0');
    expect(formatINR(0.6)).toBe('₹1');
    // Math.round breaks ties toward +∞, so a negative half rounds the other way.
    expect(formatINR(-1234.5)).toBe('-₹1,234');
    expect(formatINR(-1234.6)).toBe('-₹1,235');
  });

  test('a negative amount keeps the sign ahead of the symbol', () => {
    expect(formatINR(-1234567)).toBe('-₹12,34,567');
    expect(formatINR(-99999)).toBe('-₹99,999');
  });

  test('a fraction of a rupee below zero renders as minus zero', () => {
    // FINDING: Math.round(-0.4) is -0, which Intl signs. "-₹0" on a screen
    // reads like a defect even though the arithmetic is right.
    expect(formatINR(-0.4)).toBe('-₹0');
    expect(formatNumberIN(-0.4)).toBe('-0');
  });

  test('a non-numeric or NaN value falls back to zero', () => {
    expect(formatINR(NaN)).toBe('₹0');
    expect(formatINR(0)).toBe('₹0');
    // FINDING: the `|| 0` guard does not cover infinities.
    expect(formatINR(Infinity)).toBe('₹∞');
  });

  test('the symbol is the rupee sign and the separators are plain ASCII', () => {
    // A stray non-breaking space here has broken string assertions elsewhere.
    expect([...formatINR(1234567)].map((c) => c.codePointAt(0))).toEqual([
      8377, 49, 50, 44, 51, 52, 44, 53, 54, 55,
    ]);
  });
});

describe('formatNumberIN', () => {
  test('same grouping without the symbol', () => {
    expect(formatNumberIN(1234567)).toBe('12,34,567');
    expect(formatNumberIN(12345678)).toBe('1,23,45,678');
    expect(formatNumberIN(999)).toBe('999');
    expect(formatNumberIN(0)).toBe('0');
    expect(formatNumberIN(-1234567)).toBe('-12,34,567');
  });

  test('rounds like the currency form', () => {
    expect(formatNumberIN(1234.5)).toBe('1,235');
    expect(formatNumberIN(NaN)).toBe('0');
  });
});

describe('formatINRCompact', () => {
  test('a crore or more is shown in crores', () => {
    expect(formatINRCompact(10000000)).toBe('₹1 Cr');
    expect(formatINRCompact(12400000)).toBe('₹1.24 Cr');
    expect(formatINRCompact(10500000)).toBe('₹1.05 Cr');
    expect(formatINRCompact(11000000)).toBe('₹1.1 Cr');
    expect(formatINRCompact(200000000)).toBe('₹20 Cr');
    expect(formatINRCompact(1000000000)).toBe('₹100 Cr');
  });

  test('a lakh or more is shown in lakhs', () => {
    expect(formatINRCompact(100000)).toBe('₹1 L');
    expect(formatINRCompact(150000)).toBe('₹1.5 L');
    expect(formatINRCompact(850000)).toBe('₹8.5 L');
    expect(formatINRCompact(1234567)).toBe('₹12.35 L');
    expect(formatINRCompact(1050000)).toBe('₹10.5 L');
  });

  test('below a lakh it falls back to full grouping', () => {
    expect(formatINRCompact(99999)).toBe('₹99,999');
    expect(formatINRCompact(12345)).toBe('₹12,345');
    expect(formatINRCompact(0)).toBe('₹0');
  });

  test('trailing zeros are trimmed but significant digits are not', () => {
    // "1.00" → "1" and "8.50" → "8.5", while "1.05" keeps its zero.
    expect(formatINRCompact(10000000)).toBe('₹1 Cr');
    expect(formatINRCompact(850000)).toBe('₹8.5 L');
    expect(formatINRCompact(10500000)).toBe('₹1.05 Cr');
  });

  test('the threshold is applied to the ROUNDED rupee value', () => {
    // 99,999.60 is not a lakh, but it is after rounding — so it crosses.
    expect(formatINRCompact(99999)).toBe('₹99,999');
    expect(formatINRCompact(99999.5)).toBe('₹1 L');
    expect(formatINRCompact(9999999.6)).toBe('₹1 Cr');
  });

  test('a compact negative puts the sign inside the symbol', () => {
    // FINDING: inconsistent with formatINR, which renders "-₹1,24,00,000". The
    // two forms sit next to each other on the portfolio screen.
    expect(formatINRCompact(-12400000)).toBe('₹-1.24 Cr');
    expect(formatINRCompact(-850000)).toBe('₹-8.5 L');
    // Below a lakh the Intl path takes over and the sign moves back out.
    expect(formatINRCompact(-99999)).toBe('-₹99,999');
  });

  test('a non-finite value escapes the compact branch as text', () => {
    // FINDING: no guard, so "₹Infinity Cr" is reachable.
    expect(formatINRCompact(Infinity)).toBe('₹Infinity Cr');
    expect(formatINRCompact(NaN)).toBe('₹0');
  });

  test('the compact branch does not group its own digits', () => {
    // FINDING (cosmetic): past ten crore the number is printed bare.
    expect(formatINRCompact(1e15)).toBe('₹100000000 Cr');
  });
});
