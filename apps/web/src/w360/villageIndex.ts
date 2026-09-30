/**
 * Which village maps exist, and where each one's plots are fetched from.
 *
 * There are two kinds and the difference must not reach the rest of the app:
 *
 *   · **shipped** — built at the desk by scripts/village-map-import.py and
 *     served as static files under `/vm/`: from the village-maps bucket
 *     through CloudFront in AWS, from `apps/web/public/vm` (a small fixture) or
 *     `VM_DIR` locally. Each lives at `state/district/mandal/village`
 *     (`mapKey`), because the village name alone repeats across mandals.
 *     `/vm/index.json` lists every village without geometry, `/vm/catalog.json`
 *     every mandal, and `/vm/<mandal key>/overview.json` one mandal's outlines —
 *     so the landing map fetches one mandal, not 900 villages' edges.
 *   · **uploaded** — sent through the Maps page and kept in the database, so
 *     an owner with a KMZ on their laptop never has to open a terminal.
 *
 * An upload is keyed by village name alone and replaces the shipped village of
 * that name when there is exactly one (villageResolve.ts, `mergeUploads`).
 * That is what makes re-uploading a village the way to correct one: the
 * shipped file stays where it was as the fallback, and the browser stops
 * reaching for it.
 *
 * The browser cannot list a directory, which is why a manifest exists at all —
 * and why guessing a filename from the record's own spelling is what lost
 * Chinthagunta its map (the parcel is filed in "Chintagunta", one letter
 * apart, and the fetch simply 404'd).
 */
import { villageKey } from '@pattadar/core';

import { apiFetch } from '../api/client';
import { mergeUploads, resolveVillage } from './villageResolve';
import { adjoining, factsFor, outerEdges } from './villageGeom';
import type { PlotFacts } from './villageGeom';

export type { PlotFacts } from './villageGeom';

export interface VillageEntry {
  village: string;
  file: string;
  key: string;
  /** Where to GET the FeatureCollection. Callers fetch this and never build a
   *  path themselves — it is the only thing that knows shipped from uploaded. */
  url: string;
  uploaded?: boolean;
  plots?: number;
  source?: string;
  uploadedOn?: string;
  /** Where the village is. Names as the reference data spells them; absent on
   *  an upload that could not be placed (its name is shared by several). */
  state?: string;
  district?: string;
  mandal?: string;
  /** Shipped only: the file under /vm/, `<mapKey>.geojson`. */
  path?: string;
  /** Enough to draw the village on the mandal map without opening it: its own
   *  edge, its middle, and its totals. Carried by a mandal's overview and by
   *  uploads, never by the index — outlines for every village are 12 MB. */
  acres?: number;
  centre?: [number, number];
  outline?: Array<Array<[number, number]>>;
}

/** One mandal with shipped maps, from /vm/catalog.json. */
export interface MandalEntry {
  /** `state/district/mandal`, folded — the prefix of its villages' keys. */
  key: string;
  overview: string;
  state: string;
  district: string;
  mandal: string;
  villages: number;
  plots: number;
  acres: number;
  centre: [number, number];
}

const UPLOADS = '/api/gateway/pattadar/village-maps';

let cached: Promise<VillageIndexRead> | null = null;

/** A path under /vm/ with each segment encoded. The importer writes [a-z/]
 *  only, so this changes nothing for a real file — it is here so a hand-edited
 *  manifest cannot walk the fetch somewhere else. */
const vmUrl = (path: string) =>
  `/vm/${path.split('/').filter((s) => s && s !== '..' && s !== '.').map(encodeURIComponent).join('/')}`;

async function shipped(): Promise<VillageEntry[]> {
  try {
    const res = await fetch('/vm/index.json');
    const rows = (res.ok ? await res.json() : []) as VillageEntry[];
    return rows.map((r) => ({ ...r, url: vmUrl(r.path ?? r.file) }));
  } catch {
    return [];
  }
}

let catalogRead: Promise<MandalEntry[]> | null = null;

/** Every mandal that has shipped maps. An empty list is a missing catalog, and
 *  is not kept — the next read tries again. */
export function loadVillageCatalog(): Promise<MandalEntry[]> {
  if (!catalogRead) {
    const job: Promise<MandalEntry[]> = fetch('/vm/catalog.json')
      .then((r) => (r.ok ? r.json() : []))
      .then((rows: MandalEntry[]) => {
        if (!rows.length && catalogRead === job) catalogRead = null;
        return rows;
      })
      .catch(() => {
        if (catalogRead === job) catalogRead = null;
        return [] as MandalEntry[];
      });
    catalogRead = job;
  }
  return catalogRead;
}

const overviewCache = new Map<string, Promise<VillageEntry[] | null>>();

/** One mandal's villages with their outlines — the landing map. Uploads placed
 *  in that mandal replace the shipped village they correct, exactly as in the
 *  index. `null` is a read that failed and is not kept. */
export function loadMandalOverview(mandal: MandalEntry): Promise<VillageEntry[] | null> {
  return loadOverview(mandal.key, mandal.overview, (row) =>
    row.mandal === mandal.mandal && row.district === mandal.district);
}

/** Every village outline in the published list. This is deliberately one
 * manifest: the unselected screen is a global map of whatever the list holds,
 * and 56 serial/per-mandal reads would leave it filling in piece by piece. */
export function loadGlobalOverview(): Promise<VillageEntry[] | null> {
  return loadOverview('__global__', 'overview.json', () => true);
}

function loadOverview(
  cacheKey: string,
  path: string,
  uploadBelongs: (row: VillageEntry) => boolean,
): Promise<VillageEntry[] | null> {
  const hit = overviewCache.get(cacheKey);
  if (hit) return hit;
  const read = async (): Promise<VillageEntry[] | null> => {
    try {
      const [res, index] = await Promise.all([fetch(vmUrl(path)), readVillageIndex()]);
      if (!res.ok) throw new Error(String(res.status));
      const rows = ((await res.json()) as VillageEntry[])
        .map((r) => ({ ...r, url: vmUrl(r.path ?? r.file) }));
      const uploads = index.rows.filter((r) => r.uploaded && uploadBelongs(r));
      return mergeUploads(rows, uploads).filter((r) => (r.outline?.length ?? 0) > 0);
    } catch {
      return null;
    }
  };
  const job = read().then((rows) => {
    if (!rows && overviewCache.get(cacheKey) === job) overviewCache.delete(cacheKey);
    return rows;
  });
  overviewCache.set(cacheKey, job);
  return job;
}

async function uploaded(): Promise<{ rows: VillageEntry[]; failed: boolean }> {
  try {
    const res = await apiFetch(UPLOADS);
    // A refusal is not an empty shelf, and it is said so. Folding both into []
    // is what let the Maps screen greet an owner with eight uploaded villages
    // with "No village maps yet" and an invitation to upload them.
    if (!res.ok) return { rows: [], failed: true };
    const rows = (await res.json()) as Array<Omit<VillageEntry, 'url'>>;
    return {
      rows: rows.map((r) => ({
        ...r,
        uploaded: true,
        url: `${UPLOADS}/${encodeURIComponent(r.file)}`,
      })),
      failed: false,
    };
  } catch {
    // No API, or not signed in. The shipped maps still work, and a village
    // list that silently loses half itself is better than a page that fails —
    // but the caller is told the list is short rather than empty.
    return { rows: [], failed: true };
  }
}

/** The merged index, and whether it is the whole of it. */
export interface VillageIndexRead {
  rows: VillageEntry[];
  /** True when the uploads endpoint refused or could not be reached, so the
   *  list is knowingly short. A screen that offers to upload must say this
   *  rather than present an outage as an empty shelf. */
  uploadsFailed: boolean;
}

/** The index with its outcome attached. `loadVillageIndex` is the same read
 *  for the callers that only draw a map and have nothing to say about a
 *  short list. */
export function readVillageIndex(refresh = false): Promise<VillageIndexRead> {
  if (refresh) { cached = null; overviewCache.clear(); }
  if (!cached) {
    const job: Promise<VillageIndexRead> = Promise.all([shipped(), uploaded()])
      .then(([a, up]) => {
        // Uploads are keyed by their folded name; recompute it so a row cannot
        // arrive with a key that does not fold. Shipped keys are paths and are
        // exact matches only (resolveVillage), so a bad one simply finds nothing.
        const uploads = up.rows.map((e) => ({ ...e, key: villageKey(e.village) || e.key }));
        const rows = mergeUploads(a, uploads).sort((x, y) =>
          x.village.localeCompare(y.village) || (x.mandal ?? '').localeCompare(y.mandal ?? ''));
        // An index merged while the uploads read was failing is not kept. Held,
        // it would pin both a short list and a stale `uploadsFailed` for the
        // life of the tab, so a one-second blip could never be repaired by a
        // retry — which is the whole defect this read was opened up to fix.
        if (up.failed && cached === job) cached = null;
        return { rows, uploadsFailed: up.failed };
      });
    cached = job;
  }
  return cached;
}

export function loadVillageIndex(refresh = false): Promise<VillageEntry[]> {
  return readVillageIndex(refresh).then((r) => r.rows);
}

/** Forget the merged index — after an upload or a removal, so the next read
 *  sees it. The plot cache is keyed separately and cleared alongside. */
export function invalidateVillageIndex(): void {
  cached = null;
  overviewCache.clear();
}

/** The index row a record or a list pick means — by key, or by name narrowed
 *  by the mandal and district it names (`within`). Null when there is none or
 *  the name is shared and nothing settles it. */
export async function findVillage(ref: string, within: string[] = []): Promise<VillageEntry | null> {
  const { rows } = await readVillageIndex();
  return resolveVillage(rows, ref, within);
}

/** Whether a cache entry held under `k` belongs to `ref` — the exact key, or
 *  any village of that folded name (a name forgets every mandal's copy). */
const belongsTo = (k: string, ref: string) => {
  if (ref.includes('/')) return k === ref;
  const want = villageKey(ref);
  return !!want && (k === want || k.endsWith(`/${want}`));
};


// ── The plots themselves ──────────────────────────────────────────────

/** The village's own plots, keyed by village name. Fetched once per tab: it
 *  is ~100 kB gzipped for a 2,100-plot village and never changes between
 *  records, so opening five parcels in one village should be one request. */
export interface VillagePlot {
  lp: string; ac?: string; chaltha?: string; ring: Array<[number, number]>;
}

/** Drop a repeated closing corner. A closed ring is how files store a polygon;
 *  an open one is how we do, and mixing them invents a zero-length side. */
function openRing(ring: Array<[number, number]>): Array<[number, number]> {
  const out = [...ring];
  while (out.length > 1) {
    const a = out[0];
    const b = out[out.length - 1];
    if (a[0] !== b[0] || a[1] !== b[1]) break;
    out.pop();
  }
  return out;
}
/** A plot number as a plot number can look, and nothing else.
 *
 *  These labels are read out of the `<name>` of an uploaded KMZ, by a regex
 *  that constrains nothing, and every user is served every village's file — so
 *  a name is attacker-typed text that reaches every screen the map is on. It
 *  is rendered as text everywhere today, which is what makes it safe; this
 *  keeps it safe for the next renderer as well. Survey numbers are digits,
 *  subdivision letters and separators ("262/1", "12-A", "839"), so anything
 *  outside that set is dropped rather than escaped: there is no plot whose
 *  name it could be. All eight shipped villages pass through unchanged. */
const plotLabel = (raw: unknown, max: number): string =>
  String(raw ?? '').replace(/[^0-9A-Za-z/\-. ]/g, '').trim().slice(0, max);

/** Exported for the test that pins the rule; callers read `lp` off the plot. */
export const plotNumber = (raw: unknown): string => plotLabel(raw, 32);
export const plotExtent = (raw: unknown): string => plotLabel(raw, 16);

const villageCache = new Map<string, Promise<VillagePlot[] | null>>();


/** A village's plots, by map key or by name. A name is narrowed by the mandal
 *  and district the record names (`within`, e.g. the rest of its place line);
 *  a name shared by several mandals that `within` cannot settle is null — no
 *  map, rather than another mandal's plots under the parcel. */
export async function loadVillage(ref: string, within: string[] = []): Promise<VillagePlot[] | null> {
  if (!ref || (!ref.includes('/') && !villageKey(ref))) return null;
  let match: VillageEntry | null;
  try {
    match = resolveVillage((await readVillageIndex()).rows, ref, within);
  } catch {
    return null;
  }
  // A village missing only because the uploads read failed is not a village
  // with no map; a miss is never cached, so the next read tries again.
  if (!match) return null;
  return plotsOf(match);
}

function plotsOf(match: VillageEntry): Promise<VillagePlot[] | null> {
  const key = match.key;
  const hit = villageCache.get(key);
  if (hit) return hit;
  // A failure must not be what this village answers for the rest of the tab.
  // The cache held every outcome, including a null from a one-second blip, so
  // one bad moment bricked the village until the page was reloaded — every
  // later attempt, Try again included, replayed the cached miss. Only a read
  // that came back is kept; a failure forgets itself on the way out, and the
  // key is only dropped if it is still this job's (a re-upload may have
  // replaced it in the meantime).
  const uncache = () => { if (villageCache.get(key) === job) villageCache.delete(key); };
  const job = (async () => {
    try {
      // The village was looked UP (loadVillage) rather than its filename
      // guessed from the record's own spelling. That guess is what lost
      // Chinthagunta its map: the parcel is filed in "Chintagunta" and the
      // file is "chinthagunta", one letter apart, and the fetch simply 404'd.
      // The entry knows where its plots live — shipped under /vm/, or uploaded
      // and served by the API. Building that path here is what would let the
      // two drift apart.
      const res = await apiFetch(match.url);
      // The index says this file exists, so a refusal here is a read that
      // failed rather than a village nobody has digitised — and a failed read
      // is worth trying again.
      if (!res.ok) { uncache(); return null; }
      const gj = await res.json();
      return (gj.features ?? []).map((f: {
        properties?: Record<string, string>;
        geometry?: { coordinates?: number[][][] };
      }) => ({
        lp: plotNumber(f.properties?.lp),
        ac: plotExtent(f.properties?.ac) || undefined,
        chaltha: f.properties?.chaltha,
        // GeoJSON is lon-first; Leaflet wants lat-first. And RFC 7946 rings
        // are CLOSED — the first corner repeated as the last — while we store
        // them open. Carrying the repeat through gave an adopted plot a
        // phantom final corner and a side 0 m long.
        ring: openRing((f.geometry?.coordinates?.[0] ?? []).map(
          ([lon, lat]) => [lat, lon] as [number, number])),
      })).filter((p: VillagePlot) => p.ring.length >= 3);
    } catch {
      uncache();
      return null;
    }
  })();
  villageCache.set(key, job);
  return job;
}

/** Forget a village's plots. Called after an upload replaces one, so the map
 *  draws the file that is there now rather than the one this tab happened to
 *  fetch first — which is the whole point of being allowed to re-upload. */
export function forgetVillage(ref?: string): void {
  if (!ref) villageCache.clear();
  else for (const k of [...villageCache.keys()]) if (belongsTo(k, ref)) villageCache.delete(k);
  forgetVillageFacts(ref);
}


// ── Everything derived from a village's plots ─────────────────────────

/** Plots, the neighbours of each, and the edges that face nothing — computed
 *  once per village and held with them. Munagapadu is 2,729 plots and 17,717
 *  edges and it takes about 20 ms; doing it per selection instead would pay
 *  that on every click. */
export interface VillageFacts {
  village: string;
  plots: PlotFacts[];
  byLp: Map<string, PlotFacts>;
  neighbours: Map<string, string[]>;
  /** The village's own edge, as the segments no other plot lies against. */
  outline: Array<Array<[number, number]>>;
  acres: number;
}

const factCache = new Map<string, Promise<VillageFacts | null>>();

/** A village's facts — for an index row already in hand (a pick off the list
 *  or the mandal map, which is exact), or by key or name as `loadVillage`. */
export async function loadVillageFacts(
  ref: string | VillageEntry, within: string[] = [],
): Promise<VillageFacts | null> {
  if (!ref) return null;
  if (typeof ref === 'string' && !ref.includes('/') && !villageKey(ref)) return null;
  const match = typeof ref === 'string' ? await findVillage(ref, within) : ref;
  if (!match) return null;
  const key = match.key;
  const hit = factCache.get(key);
  if (hit) return hit;
  // Same rule as the plots below it: only an answer is worth keeping. A null
  // from a failed read, or a throw out of the geometry pass, used to be cached
  // and replayed at every later caller, so the village stayed broken for the
  // life of the tab however many times it was opened.
  const uncache = () => { if (factCache.get(key) === job) factCache.delete(key); };
  const job = plotsOf(match).then((plots) => {
    if (!plots?.length) { uncache(); return null; }
    const facts = factsFor(plots);
    const byLp = new Map<string, PlotFacts>();
    for (const f of facts) if (!byLp.has(f.lp)) byLp.set(f.lp, f);
    return {
      village: match.village,
      plots: facts,
      byLp,
      neighbours: adjoining(facts),
      outline: outerEdges(facts),
      acres: facts.reduce((sum, f) => sum + f.acres, 0),
    };
  }).catch((e) => {
    // The caller still hears about it — VillageMaps says what went wrong and
    // offers Try again — but the rejection is not what this village answers
    // from now on.
    uncache();
    throw e;
  });
  factCache.set(key, job);
  return job;
}

/** Forget a village's derived facts — by key, or every village of a name. */
export function forgetVillageFacts(ref?: string): void {
  if (!ref) { factCache.clear(); return; }
  for (const k of [...factCache.keys()]) if (belongsTo(k, ref)) factCache.delete(k);
}
