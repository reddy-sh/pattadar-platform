/**
 * H-6 (error != empty): what a `useLiveOrSample` queryFn returns once both the
 * live fetch and its one internal retry have failed. React Query's own
 * `isError` never fires for these queries — the queryFn always resolves — so
 * `isSample` is the only failure signal, and it must never overwrite an
 * already-loaded result with an empty one. Kept free of any react-query/React
 * import so it can run under plain `bun run` — see scripts/hooks-tests.ts.
 */
export function mergeOnFailure<T>(
  prev: { data: T; isSample: boolean } | undefined,
  empty: () => T,
): { data: T; isSample: boolean } {
  return prev ? { data: prev.data, isSample: true } : { data: empty(), isSample: true };
}
