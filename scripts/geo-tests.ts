/** Location sanity tests — `bun run scripts/geo-tests.ts`. */
import { checkLocation, formatDistance, haversineKm } from '../packages/core/src/index';

let failures = 0;
const check = (name: string, ok: boolean, detail = '') => {
  if (!ok) {
    failures += 1;
    console.error(`FAIL: ${name}${detail ? ` — ${detail}` : ''}`);
  }
};

// The actual bad row: parcel 9e098038, geo_point 37.374353,-122.019307,
// on a passbook whose village is Mangala Kunta, Prakasam district, AP.
const SUNNYVALE = { latitude: 37.374353, longitude: -122.019307 };
const MANGALA_KUNTA = { latitude: 15.7, longitude: 79.4 };

const d = haversineKm(SUNNYVALE, MANGALA_KUNTA);
check('the Sunnyvale pin is ~13,000 km from Mangala Kunta', d > 12_000 && d < 14_000, `${Math.round(d)} km`);

const bad = checkLocation(SUNNYVALE, MANGALA_KUNTA, 'Mangala Kunta');
check('it is reported as suspect', bad.suspect);
check('the message names the distance and the village', /13,\d\d\d km from Mangala Kunta/.test(bad.message), bad.message);

// Farmland legitimately sits outside the village settlement — this must be quiet.
const OUTLYING_FIELD = { latitude: 15.78, longitude: 79.46 };
check('a field 10 km out is fine', !checkLocation(OUTLYING_FIELD, MANGALA_KUNTA).suspect);

// A neighbouring district is not fine.
const HYDERABAD = { latitude: 17.385, longitude: 78.4867 };
check('another district trips the check', checkLocation(HYDERABAD, MANGALA_KUNTA).suspect);

// An unverifiable pin must never be reported as a wrong one.
check('no centroid → not suspect', !checkLocation(SUNNYVALE, null).suspect);
check('no pin → not suspect', !checkLocation(null, MANGALA_KUNTA).suspect);

// Distance formatting reads like a person wrote it.
check('sub-kilometre in metres', formatDistance(0.42) === '420 m', formatDistance(0.42));
check('single digits keep a decimal', formatDistance(3.14) === '3.1 km', formatDistance(3.14));
check('long distances group digits', formatDistance(13345) === '13,345 km', formatDistance(13345));

// Symmetry and the zero case.
check('distance is symmetric', Math.abs(haversineKm(SUNNYVALE, MANGALA_KUNTA) - haversineKm(MANGALA_KUNTA, SUNNYVALE)) < 1e-9);
check('same point is zero', haversineKm(MANGALA_KUNTA, MANGALA_KUNTA) === 0);

console.log(failures === 0 ? 'GEO TESTS PASS' : `GEO TESTS FAILED (${failures})`);
process.exit(failures === 0 ? 0 : 1);
