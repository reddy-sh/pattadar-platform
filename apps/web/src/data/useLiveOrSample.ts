/**
 * Live-only data hook (founder decision 2026-07-26: "it is real application
 * now" — NO mock/sample rows may ever render). Every view fetches the real
 * GraphQL API; on failure it gets a shape-correct EMPTY dataset (derived from
 * the legacy sample argument, which now serves only as a shape template) and
 * the view shows a "Service unreachable" chip. While loading, views see the
 * empty shape too (skeletons cover the paint), never fake data.
 *
 * The rejection reaches react-query, so a failure is an errored query — it is
 * never stored as fresh data, it recovers on the next mount or window focus,
 * and `error`/`refetch` give a screen the Failed state and retry the chip
 * alone could not.
 */
import { useQuery } from '@tanstack/react-query';

/** Shape-correct emptiness: arrays → [], objects → recurse, numbers → 0,
 *  strings → '', booleans → false. Keeps every consumer type-safe with no
 *  fake values. */
export function emptyLike<T>(template: T): T {
  if (Array.isArray(template)) return [] as T;
  if (template && typeof template === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(template as Record<string, unknown>)) out[k] = emptyLike(v);
    return out as T;
  }
  if (typeof template === 'number') return 0 as T;
  if (typeof template === 'string') return '' as T;
  if (typeof template === 'boolean') return false as T;
  return template;
}

/** The read every legacy screen makes. One definition, so the copy of this
 *  pattern in pages/families/familiesData.ts cannot drift back into swallowing
 *  failures. */
export function liveQueryOptions<T>(queryKey: readonly unknown[], fetchLive: () => Promise<T>) {
  return {
    queryKey,
    // The failure is NOT swallowed into a resolved empty dataset: react-query
    // has to see the rejection, or an outage is cached as fresh data for
    // staleTime and the screen keeps claiming the account is empty.
    queryFn: fetchLive,
    staleTime: 30_000,
    retry: false,
  };
}

export interface LiveOrSampleResult<T> {
  data: T;
  /** True once the query resolved via the sample fallback. */
  isSample: boolean;
  isLoading: boolean;
  /** The failure behind isSample, for screens that can say more than the chip. */
  error: Error | null;
  /** Re-run the query — the retry the chip never had. */
  refetch: () => void;
}

export function useLiveOrSample<T>(
  key: string,
  fetchLive: () => Promise<T>,
  sample: T,
): LiveOrSampleResult<T> {
  const q = useQuery(liveQueryOptions(['pattadar', key], fetchLive));
  return {
    data: q.data ?? emptyLike(sample),
    isSample: q.isError,
    isLoading: q.isPending,
    error: q.error,
    refetch: () => void q.refetch(),
  };
}
