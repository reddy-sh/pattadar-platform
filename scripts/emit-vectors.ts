/**
 * Emit the land rules as language-neutral test vectors.
 *
 * `packages/core` is the single definition of what an extent means, whether a
 * pin is plausible, and how a village name is chosen — and three heads import
 * it. A Swift client cannot import TypeScript, so the rules would exist twice
 * and drift. They have drifted before INSIDE one language: add-parcel converted
 * extents through toAcres and add-khata did not, so a scanned "40 Guntas" would
 * have been filed as 40 acres.
 *
 * These vectors are the contract. Both implementations must pass them, so a
 * divergence fails a build instead of quietly mis-stating someone's land.
 * Regenerate with `bun run scripts/emit-vectors.ts` whenever a rule changes.
 *
 * `--check` recomputes and compares WITHOUT writing, so `parity-check.ts` can
 * ask "are these stale?" without dirtying a clean tree. It exits non-zero and
 * names the files that would move.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { checkLocation, haversineKm, parseAreaSqYd, toAcres, unitKey, parseBoundaryFile, fencePlan } from '../packages/core/src/index';

/**
 * `placeCandidates` and `ringCentroid` are loaded through the namespace rather
 * than named imports, because they may not be there.
 *
 * A named import of a missing export is a hard module-load failure: the whole
 * emitter dies and every OTHER family stops being generated too. That is
 * exactly what happened — the Swift ports and these vectors were committed
 * while the TypeScript side was still uncommitted work in another session, so
 * a clean checkout had vectors pinning a rule that existed on only one side.
 *
 * Skipping loudly is the honest failure: the families that can be generated
 * still are, and the two that cannot say why. When the TypeScript lands, they
 * start being emitted again with no change here.
 */
import * as core from '../packages/core/src/index';

type PlaceCandidates = (line: string, state?: string) => string[];
type RingCentroid = (ring: { latitude: number; longitude: number }[]) => { latitude: number; longitude: number } | null;

const placeCandidates = (core as Record<string, unknown>).placeCandidates as PlaceCandidates | undefined;
const ringCentroid = (core as Record<string, unknown>).ringCentroid as RingCentroid | undefined;
const missing: string[] = [];
if (typeof placeCandidates !== 'function') missing.push('placeCandidates');
if (typeof ringCentroid !== 'function') missing.push('ringCentroid');

const OUT = join(import.meta.dir, '..', 'packages', 'core', 'vectors');
const CHECK = process.argv.includes('--check');

// ── extents: the number IS the product ──────────────────────────────────
const unitCases = [
  [40, 'Guntas'], [40, 'gunta'], [1, 'acre'], [100, 'Cents'], [4840, 'Sq. yards'],
  [43560, 'Sq. feet'], [1, 'Hectares'], [2.5, 'Acres-Guntas'], [605, 'Ankanam'],
] as const;
const units = unitCases.map(([value, label]) => ({
  value, label, key: unitKey(label), acres: toAcres(value, unitKey(label)),
}));

// ── deed extents as they are actually written on paper ──────────────────
const areaStrings = [
  '418-1/2 sq. yards', '418 1/2 sq yards', '240', '175-58 sq yards',
  'C.G.191 sq.yds (159.70 sq.mtrs)', '1,200 sq yd', 'Cha.G 200 (sq. yards)', '',
];
const areas = areaStrings.map((text) => ({ text, sqyd: parseAreaSqYd(text) }));

// ── plausibility: how a Sunnyvale pin on Guntur land gets caught ────────
const KATRAGUNTA = { latitude: 15.55, longitude: 79.28 };
const geoCases = [
  { name: 'same place', a: KATRAGUNTA, b: KATRAGUNTA },
  { name: 'the app default, 150km away', a: { latitude: 16.5, longitude: 80.6 }, b: KATRAGUNTA },
  { name: 'Sunnyvale California', a: { latitude: 37.374353, longitude: -122.019307 }, b: KATRAGUNTA },
  { name: 'just inside the radius', a: { latitude: 15.95, longitude: 79.28 }, b: KATRAGUNTA },
];
const geo = geoCases.map((c) => ({
  name: c.name,
  a: c.a,
  b: c.b,
  km: Math.round(haversineKm(c.a, c.b) * 1000) / 1000,
  suspect: checkLocation(c.a, c.b, 'Katragunta').suspect,
}));

// ── the geocoder ladder: which names to try, in which order ─────────────
//
// The rung order is the whole rule. OpenStreetMap files Konakanamitla under
// Markapuram, so the full chain matches nothing and a naive ladder's next rung
// is the entire district — a 20 km frame for a village that would have
// resolved on its own. Any client that widens in a different order lands
// somewhere else, which is exactly the failure this file exists to prevent.
const placeLines = [
  'Konakanamitla, Prakasam',
  'Katragunta, Markapuram, Prakasam',
  'Markapuram, Markapuram, Prakasam',
  'Mangalakunta',
  '',
  '  ,  ',
];
const places = placeCandidates ? placeLines.map((line) => ({ line, candidates: placeCandidates(line) })) : null;

/* ── why `mapsLink` is NOT vectored ──────────────────────────────────────
 *
 * `mapsAppFor` sniffs a user agent and `mapsLink` builds a URL, because a
 * browser has no other way to hand a pin to a maps app. A phone does: iOS
 * opens an `MKMapItem` directly, and porting the URL builder to Swift would
 * be importing a web workaround as if it were a rule.
 *
 * Per docs/specs/2026-08-22-web-ios-parity-contract.md this is bucket 3 —
 * mirror the CAPABILITY, natively — so the two implementations are meant to
 * differ and a vector asserting otherwise would force the wrong port.
 * `ringCentroid` below is the part that genuinely crosses: both clients must
 * drop the pin in the same place.
 */

// ── where the pin goes when the record has a shape, not a point ─────────
//
// The plain average of the corners drags towards whichever edge the surveyor
// marked most often; on an L-shaped field it can land outside the land
// altogether. Area weighting is the rule, and a degenerate ring falls back.
const round6 = (p: { latitude: number; longitude: number } | null) =>
  p === null ? null : {
    latitude: Number(p.latitude.toFixed(6)),
    longitude: Number(p.longitude.toFixed(6)),
  };
const ringCases: { name: string; ring: { latitude: number; longitude: number }[] }[] = [
  { name: 'empty', ring: [] },
  { name: 'single corner', ring: [{ latitude: 15.5, longitude: 79.2 }] },
  {
    name: 'square, open',
    ring: [
      { latitude: 15.0, longitude: 79.0 }, { latitude: 15.0, longitude: 79.1 },
      { latitude: 15.1, longitude: 79.1 }, { latitude: 15.1, longitude: 79.0 },
    ],
  },
  {
    name: 'square, closed',
    ring: [
      { latitude: 15.0, longitude: 79.0 }, { latitude: 15.0, longitude: 79.1 },
      { latitude: 15.1, longitude: 79.1 }, { latitude: 15.1, longitude: 79.0 },
      { latitude: 15.0, longitude: 79.0 },
    ],
  },
  {
    name: 'L-shape, where the plain average would lie',
    ring: [
      { latitude: 15.0, longitude: 79.0 }, { latitude: 15.0, longitude: 79.3 },
      { latitude: 15.1, longitude: 79.3 }, { latitude: 15.1, longitude: 79.1 },
      { latitude: 15.3, longitude: 79.1 }, { latitude: 15.3, longitude: 79.0 },
    ],
  },
  {
    name: 'collinear, no area to weight by',
    ring: [
      { latitude: 15.0, longitude: 79.0 }, { latitude: 15.1, longitude: 79.0 },
      { latitude: 15.2, longitude: 79.0 },
    ],
  },
];
const rings = ringCentroid
  ? ringCases.map((c) => ({ name: c.name, ring: c.ring, centroid: round6(ringCentroid(c.ring)) }))
  : null;

// ── write, or say what would move ───────────────────────────────────────
const parcelRing = [[79, 15], [79.02, 15], [79.02, 15.02], [79, 15.02], [79, 15]];
const shedRing = [[79, 15], [79.001, 15], [79.001, 15.001], [79.0005, 15.001], [79, 15.001], [79, 15]];
const boundaryInputs = [
  { text: JSON.stringify({ type: 'MultiPolygon', coordinates: [[shedRing], [parcelRing]] }), fileName: 'parcel.geojson' },
  { text: JSON.stringify({ type: 'MultiPolygon', coordinates: [[parcelRing.slice().reverse()], [shedRing]] }), fileName: 'clockwise.geojson' },
  { text: JSON.stringify({ type: 'Feature', properties: { name: 'Field 1' }, geometry: { type: 'Polygon', coordinates: [parcelRing] } }), fileName: 'field.geojson' },
  { text: '<kml><Placemark><name>Survey</name><Polygon><outerBoundaryIs><LinearRing><coordinates>79,15 79.02,15 79.02,15.02 79,15.02 79,15</coordinates></LinearRing></outerBoundaryIs></Polygon></Placemark></kml>', fileName: 'survey.kml' },
];
const boundaries = boundaryInputs.map((input) => ({ ...input, ...parseBoundaryFile(input.text, input.fileName) }));
const fenceInputs = [
  { sideMetres: [100, 80, 100, 80], opts: { spacing: 3, strands: 4, closed: true, costPerPost: 450, costPerMetre: 12 } },
  { sideMetres: [6, 3], opts: { spacing: 3, strands: 2, closed: false, costPerPost: 0, costPerMetre: 0 } },
  { sideMetres: [0, -1, 5], opts: { spacing: 0, strands: 0, closed: true, costPerPost: 10, costPerMetre: 1 } },
  { sideMetres: [], opts: { spacing: 3, strands: 4, closed: true, costPerPost: 10, costPerMetre: 1 } },
];
const fences = fenceInputs.map((input) => ({ ...input, expected: fencePlan(input.sideMetres, input.opts) }));
const stale: string[] = [];
const write = (file: string, data: unknown) => {
  const body = `${JSON.stringify(data, null, 2)}\n`;
  const path = join(OUT, file);
  if (CHECK) {
    let current = '';
    try { current = readFileSync(path, 'utf8'); } catch { current = ''; }
    if (current !== body) stale.push(`vectors/${file}`);
    return;
  }
  writeFileSync(path, body);
  console.log(`  wrote vectors/${file}`);
};
write('units.json', units);
write('areas.json', areas);
write('geo.json', geo);
if (places) write('places.json', places);
if (rings) write('rings.json', rings);
write('boundaries.json', boundaries);
write('fences.json', fences);

// Say what was skipped and why. A silent skip would let the vectors sit
// there looking authoritative while pinning nothing.
if (missing.length) {
  console.log(
    `SKIPPED places/rings — packages/core does not export ${missing.join(', ')} yet.\n` +
    '  The Swift side and the existing vector files are AHEAD of the TypeScript.\n' +
    '  Those vectors currently pin one implementation, not an agreement between two.',
  );
}

if (CHECK) {
  if (stale.length) {
    console.log(`stale vectors — run \`bun run scripts/emit-vectors.ts\`: ${stale.join(', ')}`);
    process.exit(1);
  }
  console.log('VECTORS CURRENT');
} else {
  console.log('VECTORS EMITTED');
}
