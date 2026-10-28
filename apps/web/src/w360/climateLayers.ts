/** The Climate chip's four layers: NASA GIBS map tiles, keyless, drawn over
 *  the basemap (approved by Reddy, 23/10/2026).
 *
 *  These are coarse on purpose and say so. Rain and soil moisture are ~2 km a
 *  pixel, ground temperature ~1 km, crop health ~250 m, so the map zooms out
 *  to the district while one is on: at parcel zoom every one of them is a
 *  single colour. The browser fetches the tiles from NASA directly, the way it
 *  fetches Esri imagery, so NASA sees the map area being looked at and nothing
 *  else (no owner, no record).
 *
 *  The key's colours are NASA's own colour map for each layer, read at run
 *  time from GIBS (it allows any origin), so the key always matches the tiles
 *  and this file holds no colour of its own. */
import { useQuery } from '@tanstack/react-query';

export type ClimateId = 'rain' | 'temperature' | 'soil' | 'crop';

export interface ClimateLayerDef {
  id: ClimateId;
  label: string;
  /** What the colour means, for the key's heading. */
  measure: string;
  gibs: string;
  /** The deepest zoom NASA draws; Leaflet enlarges past it. */
  nativeZoom: number;
  colormap: string;
  /** Days behind today (IST) the first date tried is; older ones are tried
   *  in turn when NASA has nothing for it yet. */
  lagDays: number;
  /** A value in the colour map's units, as the key prints it. */
  fmt: (v: number) => string;
  /** Said under the key, where the layer has a caveat worth knowing. */
  note: string;
  /** What one day's picture is — a day's average, one satellite pass, a
   *  model hour, an eight-day window — said beside its date, so "24/10" is
   *  never read as "now". */
  when: string;
}

const pct = (v: number) => `${Math.round(v * 100)}%`;

export const CLIMATE_LAYERS: ClimateLayerDef[] = [
  {
    id: 'rain', label: 'Rainfall', measure: 'Rain rate, mm per hour',
    gibs: 'IMERG_Precipitation_Rate', nativeZoom: 6, colormap: 'GPM_Precipitation_Rate.xml',
    lagDays: 2, fmt: (v) => (v < 1 ? v.toFixed(1) : String(Math.round(v))),
    note: 'GPM IMERG, about 10 km a pixel. Clear means no rain.',
    when: 'The day’s average rain rate. NASA publishes it a day or two later.',
  },
  {
    id: 'temperature', label: 'Temperature', measure: 'Ground temperature by day, °C',
    gibs: 'MODIS_Terra_Land_Surface_Temp_Day', nativeZoom: 7, colormap: 'MODIS_Land_Surface_Temp.xml',
    lagDays: 0, fmt: (k) => String(Math.round(k - 273.15)),
    note: 'MODIS Terra, about 1 km a pixel. Gaps are cloud.',
    when: 'The ground’s temperature at the satellite’s morning pass, about 10:30.',
  },
  {
    id: 'soil', label: 'Soil moisture', measure: 'Root-zone soil moisture, water by volume',
    gibs: 'SMAP_L4_Analyzed_Root_Zone_Soil_Moisture', nativeZoom: 6,
    colormap: 'SMAP_Analyzed_Soil_Moisture.xml', lagDays: 4, fmt: pct,
    note: 'SMAP, about 9 km a pixel.',
    when: 'Modelled for 5:30 pm that day. NASA publishes it about a week later.',
  },
  {
    id: 'crop', label: 'Crop health', measure: 'Green cover (NDVI), 8 days',
    gibs: 'MODIS_Terra_NDVI_8Day', nativeZoom: 9, colormap: 'MODIS_NDVI.xml',
    lagDays: 1, fmt: (v) => v.toFixed(1),
    note: 'MODIS Terra, about 250 m a pixel: whole villages, not single fields.',
    when: 'The eight days up to that day, so a passing cloud does not hide the crop.',
  },
];

export const climateLayer = (id: ClimateId) =>
  CLIMATE_LAYERS.find((l) => l.id === id) ?? CLIMATE_LAYERS[0];

/** How many earlier days are tried before the layer is called unavailable. */
export const CLIMATE_MAX_TRIES = 10;
/** The zoom a climate layer is shown at: the district around the land. */
export const CLIMATE_ZOOM = 8;

export function climateTileUrl(def: ClimateLayerDef, isoDate: string): string {
  return `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/${def.gibs}/default/${isoDate}`
    + `/GoogleMapsCompatible_Level${def.nativeZoom}/{z}/{y}/{x}.png`;
}

/** Today in India, less `days`, as YYYY-MM-DD. */
export function istDate(days: number, now = new Date()): string {
  const ist = new Date(now.getTime() + 330 * 60_000 - days * 86_400_000);
  return ist.toISOString().slice(0, 10);
}

/** The last date in a GIBS DescribeDomains answer — "2026-10-15/2026-10-24/P1D",
 *  or several ranges and single dates joined by commas — or null. */
export function newestInDomain(xml: string): string | null {
  const domain = /<Domain>([^<]*)<\/Domain>/.exec(xml)?.[1];
  if (!domain) return null;
  let newest: string | null = null;
  for (const part of domain.split(',')) {
    const bits = part.trim().split('/');
    const end = (bits.length >= 2 ? bits[1] : bits[0]).slice(0, 10);
    if (/^\d{4}-\d{2}-\d{2}$/.test(end) && (!newest || end > newest)) newest = end;
  }
  return newest;
}

const newestAsked = new Map<ClimateId, Promise<string | null>>();

/** The newest date NASA has published for a layer, asked of GIBS once per
 *  visit (DescribeDomains: a few hundred bytes, any origin) for the last
 *  month. null when there is none, or NASA could not be asked — the tiles
 *  then fall back to trying dates (climateTiles.ts), and the key says it
 *  cannot vouch that the picture is the newest. A failed ask is forgotten,
 *  so choosing the layer again asks again. */
export function newestDate(def: ClimateLayerDef, now = new Date()): Promise<string | null> {
  const hit = newestAsked.get(def.id);
  if (hit) return hit;
  const url = `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/1.0.0/${def.gibs}/default`
    + `/GoogleMapsCompatible_Level${def.nativeZoom}/all/${istDate(31, now)}--${istDate(0, now)}.xml`;
  const job = fetch(url)
    .then((r) => (r.ok ? r.text() : ''))
    .then(newestInDomain)
    .catch(() => null);
  newestAsked.set(def.id, job);
  void job.then((d) => { if (!d) newestAsked.delete(def.id); });
  return job;
}

/** How long before today in India a date is, in words. */
export function daysAgo(iso: string, now = new Date()): string {
  const days = Math.round((Date.parse(istDate(0, now)) - Date.parse(iso)) / 86_400_000);
  return days <= 0 ? 'today' : days === 1 ? 'yesterday' : `${days} days ago`;
}

export interface ClimateKey {
  /** CSS gradient stops, low to high, in NASA's colours. */
  gradient: string;
  low: string;
  mid: string;
  high: string;
}

const num = (s: string) => {
  const v = Number(s.trim());
  return Number.isFinite(v) ? v : null;
};

/** The key from a GIBS v1.3 colour map: the data map (the one with units or
 *  the most entries), its visible entries sampled into a gradient, and the
 *  values at its two ends and middle. Exported for its unit test. */
export function parseColormap(xml: string, fmt: (v: number) => string): ClimateKey | null {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  const maps = Array.from(doc.getElementsByTagName('ColorMap'));
  const data = maps
    .map((m) => Array.from(m.getElementsByTagName('ColorMapEntry'))
      .filter((e) => e.getAttribute('transparent') !== 'true' && e.getAttribute('nodata') !== 'true'))
    .sort((a, b) => b.length - a.length)[0] ?? [];
  const entries = data
    .map((e) => {
      const m = /^\[([^,]+),([^)\]]+)[)\]]$/.exec(e.getAttribute('value') ?? '');
      return { rgb: e.getAttribute('rgb') ?? '', lo: m ? num(m[1]) : null, hi: m ? num(m[2]) : null };
    })
    .filter((e) => /^\d+,\d+,\d+$/.test(e.rgb));
  if (entries.length < 2) return null;
  const STOPS = 16;
  const stops = Array.from({ length: STOPS }, (_, i) => {
    const e = entries[Math.round((i / (STOPS - 1)) * (entries.length - 1))];
    return `rgb(${e.rgb})`;
  });
  const first = entries.find((e) => e.lo != null);
  const last = [...entries].reverse().find((e) => e.hi != null || e.lo != null);
  const middle = entries[Math.floor(entries.length / 2)];
  const at = (e: typeof entries[number] | undefined, side: 'lo' | 'hi') => {
    const v = e ? (e[side] ?? e.lo) : null;
    return v == null ? '' : fmt(v);
  };
  return {
    gradient: `linear-gradient(90deg, ${stops.join(', ')})`,
    low: at(first, 'lo'), mid: at(middle, 'lo'), high: at(last, 'hi'),
  };
}

/** The key for one layer, fetched once per session. */
export function useClimateKey(def: ClimateLayerDef | null) {
  return useQuery({
    enabled: !!def,
    queryKey: ['gibs-colormap', def?.colormap],
    staleTime: Infinity,
    gcTime: Infinity,
    retry: 1,
    queryFn: async () => {
      const r = await fetch(`https://gibs.earthdata.nasa.gov/colormaps/v1.3/${def!.colormap}`);
      if (!r.ok) throw new Error(`colour map ${r.status}`);
      return parseColormap(await r.text(), def!.fmt);
    },
  });
}
