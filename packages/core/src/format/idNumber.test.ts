/**
 * Aadhaar-like runs in free text (design AC 13). The same vectors run against
 * the server's `aadhaar._AADHAAR_LIKE` in services/api/tests/test_network_interest.py.
 */
import { describe, expect, test } from 'bun:test';

import { looksLikeAadhaar } from './idNumber';

describe('looksLikeAadhaar', () => {
  for (const text of ['1234 5678 9012', '123456789012', '1234-5678-9012', 'Ravi 1234 5678 9012']) {
    test(`flags ${JSON.stringify(text)}`, () => {
      expect(looksLikeAadhaar(text)).toBe(true);
    });
  }
  for (const text of ['Ravi Kumar', 'Survey 123/4', '12345678901', '1234567890123', '']) {
    test(`leaves ${JSON.stringify(text)} alone`, () => {
      expect(looksLikeAadhaar(text)).toBe(false);
    });
  }
});
