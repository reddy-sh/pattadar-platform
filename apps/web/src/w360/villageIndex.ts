/**
 * Which village maps exist, and where each one's plots are fetched from.
 *
 * There are two kinds and the difference must not reach the rest of the app:
 *
 *   · **shipped** — built at the desk from the KMZs in `data/vm` and served by
 *     Vite as static files under `/vm/`. These are in the bundle, so they work
 *     with no API at all.
 *   · **uploaded** — sent through the Maps page and kept in the database, so
 *     an owner with a KMZ on their laptop never has to open a terminal.
 *
 * They are merged on the folded village key, and an upload wins. That is what
 * makes re-uploading a village the way to correct one: the shipped file stays
 * on disk as the fallback it always was, and the browser stops reaching for it.
 *
 * The browser cannot list a directory, which is why a manifest exists at all —
 * and why guessing a filename from the record's own spelling is what lost
 * Chinthagunta its map (the parcel is filed in "Chintagunta", one letter
 * apart, and the fetch simply 404'd).
 */
import { villageKey } from '@pattadar/core';

import { apiFetch } from '../api/client';
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
  /** Enough to draw the village on the mandal map without opening it: its own
   *  edge, its middle, and its totals. 77 KB for eight villages, against 2.2 MB
   *  of plots — which is why the landing page can show all of them at once. */
  acres?: number;
  centre?: [number, number];
  outline?: Array<Array<[number, number]>>;
}

const UPLOADS = '/api/gateway/pattadar/village-maps';

let cached: Promise<VillageIndexRead> | null = null;

async function shipped(): Promise<VillageEntry[]> {
  try {
    // The overview carries everything the index does and the outlines besides,
    // so it is the one that is asked for. The index stays the fallback: it is
    // what older builds wrote, and a village map with no outline is still a
    // village map.
    const [over, idx] = await Promise.all([
      fetch('/vm/overview.json').then((r) => (r.ok ? r.json() : null)).catch(() => null),
      fetch('/vm/index.json').then((r) => (r.ok ? r.json() : [])).catch(() => []),
    ]);
    const rows = (over ?? idx) as VillageEntry[];
    return rows.map((r) => ({ ...r, url: `/vm/${encodeURIComponent(r.file)}` }));
  } catch {
    return [];
  }
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
  if (refresh) cached = null;
  if (!cached) {
    const job: Promise<VillageIndexRead> = Promise.all([shipped(), uploaded()])
      .then(([a, up]) => {
        const byKey = new Map<string, VillageEntry>();
        for (const entry of [...a, ...up.rows]) {
          // Keys come from the file the entry was built from; recompute so a
          // hand-edited manifest cannot smuggle in a key that does not fold.
          byKey.set(villageKey(entry.village) || entry.key, entry);
        }
        const rows = [...byKey.values()].sort((x, y) => x.village.localeCompare(y.village));
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
}


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


export function loadVillage(name: string): Promise<VillagePlot[] | null> {
  const key = villageKey(name);
  if (!key) return Promise.resolve(null);
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
      // Look the village UP rather than guessing its filename from the
      // record's own spelling. That guess is what lost Chinthagunta's map: the
      // parcel is filed in "Chintagunta" and the file is "chinthagunta", one
      // letter apart, and the fetch simply 404'd.
      const { rows, uploadsFailed } = await readVillageIndex();
      const match = rows.find((v) => v.key === key);
      if (!match) {
        // A village missing only because the uploads read failed is not a
        // village with no map. Keeping that null would outlive the outage.
        if (uploadsFailed) uncache();
        return null;
      }
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
export function forgetVillage(name?: string): void {
  if (name) villageCache.delete(villageKey(name));
  else villageCache.clear();
  forgetVillageFacts(name);
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

export function loadVillageFacts(name: string): Promise<VillageFacts | null> {
  const key = villageKey(name);
  if (!key) return Promise.resolve(null);
  const hit = factCache.get(key);
  if (hit) return hit;
  // Same rule as the plots below it: only an answer is worth keeping. A null
  // from a failed read, or a throw out of the geometry pass, used to be cached
  // and replayed at every later caller, so the village stayed broken for the
  // life of the tab however many times it was opened.
  const uncache = () => { if (factCache.get(key) === job) factCache.delete(key); };
  const job = loadVillage(name).then((plots) => {
    if (!plots?.length) { uncache(); return null; }
    const facts = factsFor(plots);
    const byLp = new Map<string, PlotFacts>();
    for (const f of facts) if (!byLp.has(f.lp)) byLp.set(f.lp, f);
    return {
      village: name,
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

export function forgetVillageFacts(name?: string): void {
  if (name) factCache.delete(villageKey(name));
  else factCache.clear();
}
