/**
 * The Network interest form's phone rule. The same vectors run against the
 * server in services/api/tests/test_network_interest.py (design AC 22): a
 * number the client accepts must be one the server accepts, and vice versa.
 */
import { describe, expect, test } from 'bun:test';

import { normalizeIndianMobile } from './phone';

const VALID = ['9848012345', '+91 98480 12345', '098480-12345', '919848012345', '(+91) 98480-12345'];

const INVALID = [
  '12345',
  '+91 5123456789',
  '+9198480123456',
  '09848012345678',
  '98480 1234a',
  // Non-ASCII digits are rejected, never folded (design-review round 3, MEDIUM 1).
  '9८४८०१२३४५',
  '९८४८०१२३४५',
  '+91 ९८४८०१२३४५',
  '౯౮౪౮౦౧౨౩౪౫',
  '９８４８０１２３４５',
  // Over-length raw input (21 characters).
  '+91 98480 12345 000000',
  '',
];

describe('normalizeIndianMobile', () => {
  for (const raw of VALID) {
    test(`accepts ${JSON.stringify(raw)} as +919848012345`, () => {
      expect(normalizeIndianMobile(raw)).toBe('+919848012345');
    });
  }
  for (const raw of INVALID) {
    test(`rejects ${JSON.stringify(raw)}`, () => {
      expect(normalizeIndianMobile(raw)).toBeNull();
    });
  }
  test('the stored form is plain ASCII', () => {
    expect(normalizeIndianMobile('(+91) 98480-12345')).toMatch(/^\+91[0-9]{10}$/);
  });
});
