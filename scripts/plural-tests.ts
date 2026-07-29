/** Plural forms — `bun run scripts/plural-tests.ts`. */
import { pluralOf, pluralize } from '../apps/mobile/src/lib/family';

let failures = 0;
const check = (name: string, ok: boolean, detail = '') => {
  if (!ok) { failures += 1; console.error(`FAIL: ${name}${detail ? ` — ${detail}` : ''}`); }
};

// The exact bug seen on screen.
check('property → properties', pluralize(2, 'property') === '2 properties', pluralize(2, 'property'));
check('one property stays singular', pluralize(1, 'property') === '1 property');
// The app's other nouns.
for (const [w, p] of [
  ['parcel', 'parcels'], ['plot', 'plots'], ['passbook', 'passbooks'],
  ['member', 'members'], ['group', 'groups'], ['document', 'documents'],
  ['member record', 'member records'],
] as const) {
  check(`${w} → ${p}`, pluralOf(w) === p, pluralOf(w));
}
// A vowel before y is not the -ies case.
check('survey → surveys', pluralOf('survey') === 'surveys', pluralOf('survey'));
// Sibilants take -es.
check('address → addresses', pluralOf('address') === 'addresses', pluralOf('address'));
check('match → matches', pluralOf('match') === 'matches', pluralOf('match'));

console.log(failures === 0 ? 'PLURAL TESTS PASS' : `PLURAL TESTS FAILED (${failures})`);
process.exit(failures === 0 ? 0 : 1);
