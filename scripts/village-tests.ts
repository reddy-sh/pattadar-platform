/** Village canonicalization — `bun run scripts/village-tests.ts`. */
import { canonicalizeVillages } from '../packages/core/src/index';

let failures = 0;
const check = (name: string, ok: boolean, detail = '') => {
  if (!ok) { failures += 1; console.error(`FAIL: ${name}${detail ? ` — ${detail}` : ''}`); }
};

// The exact contradiction seen on screen: one of each spelling.
const a = canonicalizeVillages(['Katraguntla', 'Katragunta']);
const b = canonicalizeVillages(['Katragunta', 'Katraguntla']);
check('the answer does not depend on input order',
  a.get('Katragunta') === b.get('Katragunta') && a.get('Katraguntla') === b.get('Katraguntla'),
  `${a.get('Katragunta')} vs ${b.get('Katragunta')}`);
check('both spellings map to one name', a.get('Katragunta') === a.get('Katraguntla'), String(a.get('Katragunta')));
check('the shorter spelling wins a tie', a.get('Katraguntla') === 'Katragunta', String(a.get('Katraguntla')));

// Frequency still beats the tie-break.
const c = canonicalizeVillages(['Katraguntla', 'Katraguntla', 'Katragunta']);
check('a clear majority still wins', c.get('Katragunta') === 'Katraguntla', String(c.get('Katragunta')));

// Genuinely different short names must never merge.
const d = canonicalizeVillages(['Kota', 'Gota']);
check('short distinct names stay separate', d.get('Kota') !== d.get('Gota'));

// A long pair that should merge (CL-172).
const e = canonicalizeVillages(['Mahrajapuram', 'Markapuram']);
check('long near-matches merge', e.get('Mahrajapuram') === e.get('Markapuram'));

console.log(failures === 0 ? 'VILLAGE TESTS PASS' : `VILLAGE TESTS FAILED (${failures})`);
process.exit(failures === 0 ? 0 : 1);
