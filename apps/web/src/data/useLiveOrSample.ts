/**
 * Live-first data hook: every view tries the real GraphQL API
 * (POST /api/gateway/pattadar/graphql — in local dev the Vite proxy forwards
 * this to the FastAPI service with the founder's x-user-id) and on ANY
 * failure falls back to the bundled sample dataset. Views show a small
 * "Sample data" chip when the fallback is active.
 */
import { useQuery } from '@tanstack/react-query';

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
        return { data: sample, isSample: true };
      }
    },
    staleTime: 30_000,
    retry: false,
  });
  return {
    data: q.data?.data ?? sample,
    isSample: q.data?.isSample ?? false,
    isLoading: q.isPending,
  };
}
