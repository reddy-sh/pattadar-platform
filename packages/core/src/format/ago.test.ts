import { describe, expect, test } from 'bun:test';

import { agoSpelled, dayAndTime } from './ago';

const now = new Date('2026-10-09T12:00:00Z');

describe('agoSpelled', () => {
  test('spells every unit out, singular and plural (U4)', () => {
    expect(agoSpelled('2026-10-09T11:59:40Z', now)).toBe('just now');
    expect(agoSpelled('2026-10-09T11:59:00Z', now)).toBe('1 minute ago');
    expect(agoSpelled('2026-10-09T11:45:00Z', now)).toBe('15 minutes ago');
    expect(agoSpelled('2026-10-09T11:00:00Z', now)).toBe('1 hour ago');
    expect(agoSpelled('2026-10-09T09:00:00Z', now)).toBe('3 hours ago');
    expect(agoSpelled('2026-10-08T11:00:00Z', now)).toBe('yesterday');
    expect(agoSpelled('2026-10-05T12:00:00Z', now)).toBe('4 days ago');
  });

  test('a week or more is the date itself, DD/MM/YYYY', () => {
    expect(agoSpelled('2026-09-25T12:00:00Z', now)).toMatch(/^2[45]\/09\/2026$/);
  });

  test('a timestamp with no zone is read as UTC, as the API writes it', () => {
    expect(agoSpelled('2026-10-09T09:00:00', now)).toBe('3 hours ago');
  });

  test('nonsense comes back as it went in, never "NaN"', () => {
    expect(agoSpelled('', now)).toBe('');
    expect(agoSpelled('soon', now)).toBe('soon');
  });
});

describe('dayAndTime', () => {
  test('is DD/MM/YYYY, HH:mm', () => {
    expect(dayAndTime('2026-10-05T14:30:00')).toMatch(/^\d{2}\/\d{2}\/2026, \d{2}:\d{2}$/);
  });
});
