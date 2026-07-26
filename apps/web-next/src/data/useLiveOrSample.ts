/**
 * Live-only data hook (founder decision 2026-07-26: "it is real application
 * now" — NO mock/sample rows may ever render). Every view fetches the real
 * GraphQL API; on failure it gets a shape-correct EMPTY dataset (derived from
 * the legacy sample argument, which now serves only as a shape template) and
 * the view shows a "Service unreachable" chip. While loading, views see the
 * empty shape too (skeletons cover the paint), never fake data.
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

interface Resolved<T> {
  data: T;
  isSample: boolean;
}

export interface LiveOrSampleResult<T> {
  data: T;
  /** True once the query resolved via the sample fallback. */
  isSample: boolean;
  isLoading: boolean;
}

export function useLiveOrSample<T>(
  key: string,
  fetchLive: () => Promise<T>,
  sample: T,
): LiveOrSampleResult<T> {
  const q = useQuery({
    queryKey: ['pattadar', key],
    queryFn: async (): Promise<Resolved<T>> => {
      try {
        return { data: await fetchLive(), isSample: false };
      } catch {
        return { data: emptyLike(sample), isSample: true };
      }
    },
    staleTime: 30_000,
    retry: false,
  });
  return {
    data: q.data?.data ?? emptyLike(sample),
    isSample: q.data?.isSample ?? false,
    isLoading: q.isPending,
  };
}
