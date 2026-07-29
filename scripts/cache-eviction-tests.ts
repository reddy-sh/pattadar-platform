/** Drive-file cache eviction (H-2) — `bun run scripts/cache-eviction-tests.ts`. */
import { selectCacheEvictions, type CacheFileStat } from '../apps/mobile/src/lib/cacheEviction';

let failures = 0;
const check = (name: string, got: string[], want: string[]) => {
  const ok = got.length === want.length && got.every((g) => want.includes(g));
  if (!ok) { failures += 1; console.error(`FAIL: ${name} — got [${got}], want [${want}]`); }
};

const DAY = 24 * 60 * 60 * 1000;
const now = Date.now();
const MB = 1024 * 1024;

// Nothing stale, nothing over the size cap — keep everything.
check(
  'all fresh, under the cap',
  selectCacheEvictions(
    [
      { name: 'a', size: 10 * MB, mtimeMs: now - 1 * DAY },
      { name: 'b', size: 10 * MB, mtimeMs: now - 2 * DAY },
    ],
    now,
  ),
  [],
);

// Past the TTL is deleted regardless of size.
check(
  'one stale file, one fresh',
  selectCacheEvictions(
    [
      { name: 'old', size: 1 * MB, mtimeMs: now - 8 * DAY },
      { name: 'new', size: 1 * MB, mtimeMs: now - 1 * DAY },
    ],
    now,
  ),
  ['old'],
);

// Exactly at the TTL boundary is not yet stale.
check(
  'exactly at the TTL boundary stays',
  selectCacheEvictions([{ name: 'edge', size: 1 * MB, mtimeMs: now - 7 * DAY }], now, 7 * DAY),
  [],
);

// Over the size cap, none stale — oldest (LRU) goes first until it fits.
check(
  'over the size cap, LRU order',
  selectCacheEvictions(
    [
      { name: 'oldest', size: 80 * MB, mtimeMs: now - 3 * DAY },
      { name: 'middle', size: 80 * MB, mtimeMs: now - 2 * DAY },
      { name: 'newest', size: 80 * MB, mtimeMs: now - 1 * DAY },
    ],
    now,
    7 * DAY,
    200 * MB,
  ),
  ['oldest'],
);

// A deed-sized (~14 MB) fresh file plus a pile of stale ones: only the stale
// ones go, the fresh deed is untouched even though it is the newest.
check(
  'stale entries evicted, fresh deed kept',
  selectCacheEvictions(
    [
      { name: 'deed.pdf', size: 14 * MB, mtimeMs: now - 1 * DAY },
      { name: 'ancient-1', size: 1 * MB, mtimeMs: now - 30 * DAY },
      { name: 'ancient-2', size: 1 * MB, mtimeMs: now - 45 * DAY },
    ],
    now,
  ),
  ['ancient-1', 'ancient-2'],
);

// Empty directory — nothing to do, and no crash.
check('empty', selectCacheEvictions([] as CacheFileStat[], now), []);

console.log(failures === 0 ? 'CACHE EVICTION TESTS PASS' : `CACHE EVICTION TESTS FAILED (${failures})`);
process.exit(failures === 0 ? 0 : 1);
