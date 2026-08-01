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
 */
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { checkLocation, haversineKm, parseAreaSqYd, toAcres, unitKey } from '../packages/core/src/index';

const OUT = join(import.meta.dir, '..', 'packages', 'core', 'vectors');

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

const write = (file: string, data: unknown) => {
  writeFileSync(join(OUT, file), `${JSON.stringify(data, null, 2)}\n`);
  console.log(`  wrote vectors/${file}`);
};
write('units.json', units);
write('areas.json', areas);
write('geo.json', geo);
console.log('VECTORS EMITTED');
