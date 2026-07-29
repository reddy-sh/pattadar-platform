/**
 * Pure selection logic for `drive-*` download-cache eviction (H-2): which
 * cached entries to delete, given their age and the directory's total size.
 * Kept free of any expo-file-system/React Native import so it can run under
 * plain `bun run` — see scripts/cache-eviction-tests.ts.
 */
export interface CacheFileStat {
  name: string;
  size: number;
  mtimeMs: number;
}

export const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
export const CACHE_SIZE_CAP_BYTES = 200 * 1024 * 1024; // ~200 MB

/**
 * Names to delete: anything past the TTL, then — among what is left — the
 * oldest by modification time until the remaining total fits under the size
 * cap (LRU).
 */
export function selectCacheEvictions(
  files: CacheFileStat[],
  now: number,
  ttlMs: number = CACHE_TTL_MS,
  sizeCapBytes: number = CACHE_SIZE_CAP_BYTES,
): string[] {
  const stale = files.filter((f) => now - f.mtimeMs > ttlMs);
  const staleNames = new Set(stale.map((f) => f.name));
  const kept = files.filter((f) => !staleNames.has(f.name)).sort((a, b) => a.mtimeMs - b.mtimeMs);
  let total = kept.reduce((sum, f) => sum + f.size, 0);
  const overCap: string[] = [];
  for (const f of kept) {
    if (total <= sizeCapBytes) break;
    overCap.push(f.name);
    total -= f.size;
  }
  return [...stale.map((f) => f.name), ...overCap];
}
