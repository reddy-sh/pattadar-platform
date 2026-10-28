import { expect, test } from 'bun:test';

import { daysAgo, newestInDomain } from './climateLayers';

test('the newest date is the end of the last range NASA lists', () => {
  expect(newestInDomain('<Domains><Domain>2026-10-15/2026-10-24/P1D</Domain></Domains>')).toBe('2026-10-24');
  // Gaps split the range; a lone date can come last, and times are dropped.
  expect(newestInDomain('<Domain>2026-10-01/2026-10-10/P1D,2026-10-12/2026-10-20/P1D,2026-10-22</Domain>'))
    .toBe('2026-10-22');
  expect(newestInDomain('<Domain>2026-10-01T00:00:00Z/2026-10-23T00:00:00Z/PT30M</Domain>')).toBe('2026-10-23');
  expect(newestInDomain('<Domains></Domains>')).toBeNull();
  expect(newestInDomain('')).toBeNull();
});

test('how old a picture is, in days before today in India', () => {
  // 25/10/2026, 10:00 in India.
  const now = new Date('2026-10-25T04:30:00Z');
  expect(daysAgo('2026-10-25', now)).toBe('today');
  expect(daysAgo('2026-10-24', now)).toBe('yesterday');
  expect(daysAgo('2026-10-20', now)).toBe('5 days ago');
  // 00:30 in India is already the next day there.
  expect(daysAgo('2026-10-25', new Date('2026-10-24T19:00:00Z'))).toBe('today');
});
