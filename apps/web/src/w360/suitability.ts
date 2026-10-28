/** The land suitability layer on Cadastral maps (phase 1 of
 *  docs/specs/2026-10-23-land-suitability-layer.md, approved by Reddy on
 *  23/10/2026). `scripts/suitability-build.py` writes one
 *  `<village key>/suitability.json` beside each shipped village map; this
 *  reads it and says what it means. Reference data: no owner, no record.
 *
 *  Grades are for general field crops, from public maps, and every one comes
 *  with its reason. Owners never see "unsuitable": the names are Best · Good
 *  · Fair · Limited, and land that is not farmland is "Not assessed". */
import { schemeById } from '@pattadar/tokens';

import { vmUrl } from './villageIndex';
import type { VillageEntry } from './villageIndex';

export type Grade = 0 | 1 | 2 | 3;
export type Factor = 'slope' | 'texture' | 'ph' | 'carbon' | 'rain' | 'lowlying';

export interface PlotGrade {
  /** 0 best … 3 limited; -1 not assessed. */
  g: Grade | -1;
  why?: string;
  s?: number;
  /** Factor scores, 1–4, in `factors` order. */
  f?: number[];
  lim?: Factor | '';
  v?: { slope: number; ph: number; clay: number; sand: number; carbon: number;
        rain: number; low: number; texture: string };
}

export interface Suitability {
  v: number;
  village: string;
  built: string;
  factors: Factor[];
  weights: Record<Factor, number>;
  sources: string[];
  areas: Record<'best' | 'good' | 'fair' | 'limited' | 'none', number>;
  plots: Record<string, PlotGrade>;
}

/** Drawn on imagery, so the Dark scheme's validated hues, as the water-flow
 *  overlay takes them (flowInk.ts): green to red-orange, best to limited. */
const P = schemeById('dark').palette;
export const GRADES: Array<{ key: 'best' | 'good' | 'fair' | 'limited'; label: string; hex: string }> = [
  { key: 'best', label: 'Best', hex: P.status.good },
  { key: 'good', label: 'Good', hex: P.chart[3] },
  { key: 'fair', label: 'Fair', hex: P.status.warning },
  { key: 'limited', label: 'Limited', hex: P.status.serious },
];

export const FACTOR_LABEL: Record<Factor, string> = {
  slope: 'Slope', texture: 'Soil texture', ph: 'Soil pH', carbon: 'Organic carbon',
  rain: 'Rainfall', lowlying: 'Low-lying ground',
};

/** What holds a parcel back, said as the reason, from the values behind it. */
export function limitSentence(p: PlotGrade): string {
  const v = p.v;
  if (!p.lim || !v) return 'Nothing in the public maps holds this parcel back.';
  switch (p.lim) {
    case 'slope': return `Slope of about ${v.slope}%: water and soil run off.`;
    case 'texture': return `${v.texture[0].toUpperCase()}${v.texture.slice(1)} soil`
      + (v.sand >= 52 ? ': holds less water.' : v.clay >= 40 ? ': drains slowly.' : '.');
    case 'ph': return `Soil pH about ${v.ph}: ${v.ph > 7.5 ? 'alkaline' : 'acidic'}.`;
    case 'carbon': return `Organic carbon about ${v.carbon}%: low.`;
    case 'rain': return `About ${v.rain.toLocaleString('en-IN')} mm of rain a year`
      + ' (1991–2020): less without irrigation.';
    case 'lowlying': return `About ${v.low} m below the ground around it: water can collect.`;
  }
}

export const NOT_ASSESSED_WHY: Record<string, string> = {
  trees: 'Mostly tree cover', 'built-up': 'Mostly built-up', water: 'Mostly water',
  wetland: 'Mostly wetland', mangroves: 'Mostly mangroves', 'no data': 'No data here',
};

/** Each graded parcel's colour, by parcel number, for a map to shade. A
 *  parcel with none is "not assessed" and is left as the bare mesh. */
export function gradeColours(suit: Suitability | null): Map<string, string> {
  const out = new Map<string, string>();
  for (const [lp, p] of Object.entries(suit?.plots ?? {})) {
    if (p.g >= 0) out.set(lp, GRADES[p.g].hex);
  }
  return out;
}

const cache = new Map<string, Promise<Suitability | null>>();

/** One village's grades, or null when none were built for it (uploaded
 *  villages, and any shipped one the build has not reached). Built beside the
 *  map file: `a/b/village.geojson` → `a/b/village/suitability.json`. */
export function loadSuitability(entry: Pick<VillageEntry, 'path' | 'uploaded'> | null | undefined):
  Promise<Suitability | null> {
  if (!entry || entry.uploaded || !entry.path?.endsWith('.geojson')) return Promise.resolve(null);
  const villageKey = entry.path.slice(0, -'.geojson'.length);
  const hit = cache.get(villageKey);
  if (hit) return hit;
  const job = fetch(vmUrl(`${villageKey}/suitability.json`))
    .then(async (r) => {
      if (!r.ok || !(r.headers.get('content-type') ?? '').includes('json')) return null;
      const data = (await r.json()) as Suitability;
      return data && data.plots ? data : null;
    })
    .catch(() => null);
  cache.set(villageKey, job);
  return job;
}
