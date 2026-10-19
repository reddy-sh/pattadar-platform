import { expect, test } from 'bun:test';
import { canCombine, combineStakeFor } from './holdingStake';

const rec = (stake: string) => ({ stake });

test('canCombine: owned and managed may join a holding of their own stake; watched never', () => {
  expect(canCombine(rec('owned'))).toBe(true);
  expect(canCombine(rec('managed'))).toBe(true);
  expect(canCombine(rec(''))).toBe(true); // no stake reads as owned
  expect(canCombine(rec('watch'))).toBe(false);
  expect(canCombine(rec('watch'), 'owned')).toBe(false);
  expect(canCombine(rec('managed'), 'owned')).toBe(false);
  expect(canCombine(rec('owned'), 'managed')).toBe(false);
  expect(canCombine(rec('managed'), 'managed')).toBe(true);
});

test('combineStakeFor: the majority stake, owned on a tie, null when all are watched', () => {
  expect(combineStakeFor([rec('managed'), rec('managed'), rec('owned')])).toBe('managed');
  expect(combineStakeFor([rec('managed'), rec('owned')])).toBe('owned');
  expect(combineStakeFor([rec('owned'), rec('owned'), rec('managed')])).toBe('owned');
  expect(combineStakeFor([rec('watch'), rec('managed')])).toBe('managed');
  expect(combineStakeFor([rec('watch'), rec('watch')])).toBeNull();
});
