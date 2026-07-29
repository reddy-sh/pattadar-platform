/**
 * Entity vocabulary + counting (CL-610..612) — `bun run scripts/vocab-tests.ts`.
 *
 * The bug this locks: Properties once said "33 items" while Home said
 * "32 parcels", because a plot was counted as an item but not as a parcel.
 * Segment counts must partition the set exactly.
 */
import { normalizeHoldings } from '../apps/mobile/src/data/holdings';

let failures = 0;
const check = (name: string, ok: boolean, detail = '') => {
  if (!ok) { failures += 1; console.error(`FAIL: ${name}${detail ? ` — ${detail}` : ''}`); }
};

const data = {
  parcels: [
    { id: 'p1', surveyNo: '81', subdivision: '4', extent: 4.6, passbookId: 'pb1', classification: 'agri' },
    { id: 'p2', surveyNo: '119', subdivision: '5', extent: 5.43, passbookId: 'pb1', classification: 'agri' },
  ],
  passbooks: [{ id: 'pb1', pattadarNo: '5001', ownerName: 'T N Reddy', village: 'Katragunta', mandal: '', district: '', groupId: '' }],
  properties: [
    { id: 'r1', type: 'open_plot', label: 'Plot 12-B', city: 'Vijayawada', district: 'Krishna', landArea: 240, landUnit: 'Sq.yd' },
  ],
  groups: [],
  documents: [],
} as never;

const rows = normalizeHoldings(data);
const parcels = rows.filter((h) => h.kind === 'parcel');
const plots = rows.filter((h) => h.kind === 'property');

// CL-611: All must be exactly Farmland + Plots — no third bucket, no double count.
check('All equals farmland plus plots', rows.length === parcels.length + plots.length,
  `${rows.length} vs ${parcels.length}+${plots.length}`);
check('every row is one kind or the other', rows.every((h) => h.kind === 'parcel' || h.kind === 'property'));
check('two parcels', parcels.length === 2, String(parcels.length));
check('one plot', plots.length === 1, String(plots.length));

// CL-612: the two kinds carry different units and must never be summed together.
const acres = parcels.reduce((s, h) => s + h.extentAcres, 0);
check('parcel acres sum on their own', Math.abs(acres - 10.03) < 0.001, String(acres));
check('a plot contributes no acres', plots.every((h) => h.extentAcres === 0),
  'adding square yards into an acre total is how 240 sq.yd becomes 240 acres');
check('a plot states its own unit', /Sq\.yd/i.test(plots[0]?.extentLabel ?? ''), plots[0]?.extentLabel);

console.log(failures === 0 ? 'VOCAB TESTS PASS' : `VOCAB TESTS FAILED (${failures})`);
process.exit(failures === 0 ? 0 : 1);
