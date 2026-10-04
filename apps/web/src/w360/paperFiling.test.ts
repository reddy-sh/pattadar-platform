/** A paper's detail line shows dates DD/MM/YYYY (India), whether the reading
 *  wrote it today or a row stored earlier carries the raw ISO date. */
import { expect, test } from 'bun:test';

import { describeReading, displayDetail } from './paperFiling';

test('a stored ISO registration date reads DD/MM/YYYY', () => {
  expect(displayDetail('Registered 2013-08-26 · SRO Tarlupadu')).toBe('Registered 26/08/2013 · SRO Tarlupadu');
  expect(displayDetail('Podili · Registered 2022-01-05')).toBe('Podili · Registered 05/01/2022');
});

test('an already DD/MM/YYYY date and a line with no date pass through', () => {
  expect(displayDetail('Registered 26/08/2013 · SRO Tarlupadu')).toBe('Registered 26/08/2013 · SRO Tarlupadu');
  expect(displayDetail('Filed 23/08/2026')).toBe('Filed 23/08/2026');
  expect(displayDetail('Joint FMB')).toBe('Joint FMB');
  expect(displayDetail('')).toBe('');
});

test('a fresh reading files its registration date as DD/MM/YYYY', () => {
  const row = describeReading(
    { docType: 'sale_deed', docTypeLabel: 'Sale Deed', fields: { registration_date: '2013-08-26', sro: 'Tarlupadu' } } as never,
    new File([''], 'deed.pdf', { type: 'application/pdf' }),
  );
  expect(row.subtitle).toBe('Registered 26/08/2013 · Tarlupadu');
});
