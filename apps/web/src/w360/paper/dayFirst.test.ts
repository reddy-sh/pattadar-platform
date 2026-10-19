import { describe, expect, test } from 'bun:test';

import { dayFirstProblem } from './dayFirst';

describe('dayFirstProblem', () => {
  test('a real day-first date passes, including one a month-first parser would swap', () => {
    expect(dayFirstProblem('22/12/2025')).toBe('');
    expect(dayFirstProblem('03/04/2020')).toBe('');
    expect(dayFirstProblem('')).toBe('');
  });
  test('a date that cannot exist is refused, not rolled forward', () => {
    expect(dayFirstProblem('31/02/2026')).toBe('That registration date does not exist.');
    expect(dayFirstProblem('12/13/2020')).toBe('That registration date does not exist.');
  });
  test('another shape is refused with the shape to use', () => {
    expect(dayFirstProblem('2025-12-22')).toBe('Write the registration date as DD/MM/YYYY.');
  });
  test('a future date is refused', () => {
    expect(dayFirstProblem('01/01/2999')).toBe('That registration date is not possible.');
  });
});
