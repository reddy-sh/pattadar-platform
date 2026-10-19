import type { RecordCard } from '../api';

/** Records that may be combined, and why the rest may not.
 *
 *  `stake` is the whole test, and it is the server's test too (founder
 *  amendment 2026-10-04 to combined-properties rule 3): every member of one
 *  holding shares ONE stake — all held in your own name, or all land you
 *  manage. Watched land is never combined, and owned and managed land never
 *  share a holding, because one holding's costs and value are one person's
 *  arithmetic. The rest is explained in the dialog rather than silently
 *  filtered, because a record the owner ticked and cannot find again is worse
 *  than a refusal.
 */
export type CombineStake = 'owned' | 'managed';

export const stakeOf = (rec: Pick<RecordCard, 'stake'>): string => rec.stake || 'owned';

/** Whether a record could be in a holding of `stake` (any non-watch stake when
 *  none is given). */
export const canCombine = (rec: Pick<RecordCard, 'stake'>, stake?: CombineStake) => {
  const own = stakeOf(rec);
  if (own !== 'owned' && own !== 'managed') return false;
  return !stake || own === stake;
};

/** The stake a set of records would be combined under: the one most of the
 *  non-watched records share, owned on a tie. Null when every one is watched. */
export function combineStakeFor(records: Pick<RecordCard, 'stake'>[]): CombineStake | null {
  const owned = records.filter((r) => stakeOf(r) === 'owned').length;
  const managed = records.filter((r) => stakeOf(r) === 'managed').length;
  if (!owned && !managed) return null;
  return managed > owned ? 'managed' : 'owned';
}

