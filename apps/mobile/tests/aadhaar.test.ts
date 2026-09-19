import { expect, test } from 'bun:test';

import { aadhaarPrefill } from '../src/lib/aadhaar';

test('Aadhaar prefill retains only a mask and opaque candidate from extraction', () => {
  const result = aadhaarPrefill({
    name: 'Example Person',
    dob: '2000-01-01',
    gender: 'FEMALE',
    aadhaarMasked: 'XXXX-XXXX-9012',
    aadhaarCandidateId: 'candidate-opaque',
    address: 'Example address',
    confidence: 'high',
    // A legacy/unexpected full-number key is intentionally ignored.
    aadhaar: '123456789012',
  } as Record<string, string>);

  expect(result).toEqual({
    name: 'Example Person',
    dob: '2000-01-01',
    gender: 'female',
    aadhaarMasked: 'XXXX-XXXX-9012',
    aadhaarCandidateId: 'candidate-opaque',
    address: 'Example address',
    lowConfidence: false,
    readAnything: true,
  });
  expect(JSON.stringify(result)).not.toContain('123456789012');
});

test('invalid extracted DOB and gender do not overwrite typed values', () => {
  const result = aadhaarPrefill({
    dob: '01/01/2000',
    gender: 'unknown',
    confidence: 'low',
  });
  expect(result.dob).toBe('');
  expect(result.gender).toBe('');
  expect(result.lowConfidence).toBe(true);
});


test('malformed or full-number mask values fail closed with no candidate', () => {
  const result = aadhaarPrefill({
    aadhaarMasked: '1234-5678-9012',
    aadhaarCandidateId: 'candidate-must-not-survive',
  });
  expect(result.aadhaarMasked).toBe('');
  expect(result.aadhaarCandidateId).toBe('');
  expect(JSON.stringify(result)).not.toContain('1234-5678-9012');
});
