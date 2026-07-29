/** error != empty (H-6) — mergeOnFailure preserves last-good data on fetch failure. `bun run scripts/hooks-tests.ts`. */
import { mergeOnFailure } from '../apps/mobile/src/lib/mergeOnFailure';

let failures = 0;
const check = (name: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) { failures += 1; console.error(`FAIL: ${name} — got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`); }
};

// A transient outage must not wipe already-loaded holdings: the previous
// good payload survives, flagged isSample so the screen still shows a banner.
check(
  'prev exists — keeps prev.data, flags isSample',
  mergeOnFailure({ data: { count: 3 }, isSample: false }, () => ({ count: 0 })),
  { data: { count: 3 }, isSample: true },
);

// Cold start (nothing cached yet) falls back to the caller's empty() shape.
check(
  'prev undefined — falls back to empty(), flags isSample',
  mergeOnFailure(undefined, () => ({ count: 0 })),
  { data: { count: 0 }, isSample: true },
);

console.log(failures === 0 ? 'HOOKS TESTS PASS' : `HOOKS TESTS FAILED (${failures})`);
process.exit(failures === 0 ? 0 : 1);
