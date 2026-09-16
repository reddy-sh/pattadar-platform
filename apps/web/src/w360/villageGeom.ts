/**
 * What a village's plots are, geometrically.
 *
 * The shape file gives rings and a number. Everything a person actually asks
 * of a cadastral map is derived: how big is this, where is its middle, what
 * touches it. Pure functions over the plots `villageIndex` already loaded, so
 * this can be reasoned about — and tested — without a map on screen.
 */
import { ringAreaSqM, ringCentroid } from '@pattadar/core';

import type { VillagePlot } from './villageIndex';

export interface PlotFacts {
  lp: string;
  ring: Array<[number, number]>;
  /** Acres. The department's figure where the export carries one, otherwise
   *  measured off the ring — and `measured` says which, because a figure from
   *  the sheet and a figure from a polygon are not the same claim. */
  acres: number;
  measured: boolean;
  chaltha?: string;
  centre: [number, number];
  /** [south, west, north, east] — for the label pass and the viewport filter. */
  box: [number, number, number, number];
}

/** Ring in [lat, lon]; area via the geodesic formula the record screens use. */
export function factsFor(plots: VillagePlot[]): PlotFacts[] {
  return plots.map((p) => {
    const sheet = Number(p.ac);
    const sqm = ringAreaSqM(p.ring);
    let south = Infinity;
    let west = Infinity;
    let north = -Infinity;
    let east = -Infinity;
    for (const [lat, lon] of p.ring) {
      if (lat < south) south = lat;
      if (lat > north) north = lat;
      if (lon < west) west = lon;
      if (lon > east) east = lon;
    }
    const c = ringCentroid(p.ring.map(([latitude, longitude]) => ({ latitude, longitude })));
    return {
      lp: p.lp,
      ring: p.ring,
      acres: Number.isFinite(sheet) && sheet > 0 ? sheet : sqm / 4046.8564224,
      measured: !(Number.isFinite(sheet) && sheet > 0),
      chaltha: p.chaltha,
      centre: c ? [c.latitude, c.longitude] : [(south + north) / 2, (west + east) / 2],
      box: [south, west, north, east],
    };
  });
}

// ── Which plots touch which ───────────────────────────────────────────
//
// "Who owns the plot next to mine" is the question a village map is opened
// with, and it is not answered by comparing corner lists. Neighbouring parcels
// in a cadastral export rarely share a whole edge: one long boundary faces two
// or three shorter ones across it, and the corner coordinates on either side
// are metres apart. Matching identical edges, or edge midpoints, reported a
// mean of 1.3 neighbours per plot where the truth is nearer six.
//
// So edges are matched as COLLINEAR OVERLAPPING SEGMENTS instead. Two plots
// adjoin when one has an edge lying along the same infinite line as an edge of
// the other, at the same offset, with the two segments overlapping along that
// line by more than a corner's worth.

/** ~0.2 m at this latitude: the two sides of one boundary, as digitised. */
const OFFSET_TOL = 2e-6;
/** cos of ~2.5° — parallel enough to be the same boundary. */
const PARALLEL = 0.999;
/** ~6 m of shared run. Below this the plots meet at a corner, and a corner is
 *  not a neighbour: it would make every plot in a four-way junction adjoin. */
const MIN_RUN = 6e-5;

interface Edge {
  plot: number;
  ux: number;
  uy: number;
  /** Signed perpendicular offset of the line from the origin. */
  off: number;
  /** The segment's extent along its own direction. */
  lo: number;
  hi: number;
}

/** Direction in degrees, folded to [0, 180) — a line has no arrow. */
const bucketOf = (ux: number, uy: number) => {
  const deg = (Math.atan2(uy, ux) * 180) / Math.PI;
  return ((Math.round(deg) % 180) + 180) % 180;
};

export function adjoining(facts: PlotFacts[]): Map<string, string[]> {
  const buckets = new Map<number, Edge[]>();

  facts.forEach((f, plot) => {
    const ring = f.ring;
    for (let i = 0; i < ring.length; i += 1) {
      const [ay, ax] = ring[i];
      const [by, bx] = ring[(i + 1) % ring.length];
      let dx = bx - ax;
      let dy = by - ay;
      const len = Math.hypot(dx, dy);
      if (len < 1e-9) continue;
      dx /= len;
      dy /= len;
      // A direction and its reverse are the same line. Collapsing them here is
      // what lets two plots that traced their shared boundary in opposite
      // directions — which is every pair of them — land in one bucket.
      if (dx < 0 || (dx === 0 && dy < 0)) { dx = -dx; dy = -dy; }
      const edge: Edge = {
        plot,
        ux: dx,
        uy: dy,
        off: dx * ay - dy * ax,
        lo: Math.min(dx * ax + dy * ay, dx * bx + dy * by),
        hi: Math.max(dx * ax + dy * ay, dx * bx + dy * by),
      };
      const key = bucketOf(dx, dy);
      const list = buckets.get(key);
      if (list) list.push(edge); else buckets.set(key, [edge]);
    }
  });

  // Sorted by offset so a candidate's matches are a contiguous window. A
  // village of grid-aligned fields puts thousands of edges at one angle, and
  // comparing every pair of those is the difference between milliseconds and
  // a locked tab.
  for (const list of buckets.values()) list.sort((a, b) => a.off - b.off);

  const links = facts.map(() => new Set<number>());
  const scan = (edge: Edge, list: Edge[], flip: boolean) => {
    const want = flip ? -edge.off : edge.off;
    let lo = 0;
    let hi = list.length;
    while (lo < hi) {                       // first index with off >= want - tol
      const mid = (lo + hi) >> 1;
      if (list[mid].off < want - OFFSET_TOL) lo = mid + 1; else hi = mid;
    }
    for (let i = lo; i < list.length && list[i].off <= want + OFFSET_TOL; i += 1) {
      const other = list[i];
      if (other.plot === edge.plot) continue;
      const dot = edge.ux * other.ux + edge.uy * other.uy;
      if (Math.abs(dot) < PARALLEL) continue;
      const a = flip ? -other.hi : other.lo;
      const b = flip ? -other.lo : other.hi;
      if (Math.min(edge.hi, b) - Math.max(edge.lo, a) <= MIN_RUN) continue;
      links[edge.plot].add(other.plot);
      links[other.plot].add(edge.plot);
    }
  };

  for (const [key, list] of buckets) {
    for (const edge of list) {
      // The rounding boundary cuts real neighbours apart, so the buckets on
      // either side are searched too. At 0° and 179° the fold has flipped one
      // side's direction, and with it the sign of its offset and of its
      // interval — hence the mirrored scan.
      scan(edge, list, false);
      const before = buckets.get((key + 179) % 180);
      const after = buckets.get((key + 1) % 180);
      if (before) scan(edge, before, key === 0);
      if (after) scan(edge, after, key === 179);
    }
  }

  const out = new Map<string, string[]>();
  facts.forEach((f, i) => {
    const names = [...links[i]]
      .map((j) => facts[j].lp)
      .filter((lp) => lp && lp !== f.lp);
    out.set(f.lp, [...new Set(names)].sort(
      (a, b) => (Number(a) || 0) - (Number(b) || 0) || a.localeCompare(b)));
  });
  return out;
}

/** The village's own edge: every plot edge that nothing lies against.
 *
 *  A shared boundary is covered along its whole run by the plots on the other
 *  side of it — usually two or three shorter edges, not one matching edge. An
 *  edge covered for less than half its length is facing open ground, and open
 *  ground at the edge of a village is where the village stops.
 *
 *  Not a hull. It is ragged where the cadastre is ragged, and it should be: a
 *  sliver of unclaimed land inside the village is a real gap in the sheet, and
 *  drawing a tidy ring around it would be inventing a boundary. */
export function outerEdges(facts: PlotFacts[]): Array<Array<[number, number]>> {
  const all: Edge[] = [];
  const buckets = new Map<number, Edge[]>();
  const covered: number[] = [];
  const ends: Array<[[number, number], [number, number]]> = [];

  facts.forEach((f, plot) => {
    const ring = f.ring;
    for (let i = 0; i < ring.length; i += 1) {
      const [ay, ax] = ring[i];
      const [by, bx] = ring[(i + 1) % ring.length];
      let dx = bx - ax;
      let dy = by - ay;
      const len = Math.hypot(dx, dy);
      if (len < 1e-9) continue;
      dx /= len;
      dy /= len;
      if (dx < 0 || (dx === 0 && dy < 0)) { dx = -dx; dy = -dy; }
      const edge: Edge = {
        plot,
        ux: dx,
        uy: dy,
        off: dx * ay - dy * ax,
        lo: Math.min(dx * ax + dy * ay, dx * bx + dy * by),
        hi: Math.max(dx * ax + dy * ay, dx * bx + dy * by),
      };
      covered.push(0);
      ends.push([[ay, ax], [by, bx]]);
      all.push(edge);
      const key = bucketOf(dx, dy);
      const list = buckets.get(key);
      if (list) list.push(edge); else buckets.set(key, [edge]);
    }
  });

  const index = new Map<Edge, number>();
  all.forEach((e, i) => index.set(e, i));
  for (const list of buckets.values()) list.sort((a, b) => a.off - b.off);

  const add = (edge: Edge, list: Edge[], flip: boolean) => {
    const want = flip ? -edge.off : edge.off;
    let lo = 0;
    let hi = list.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (list[mid].off < want - OFFSET_TOL) lo = mid + 1; else hi = mid;
    }
    for (let i = lo; i < list.length && list[i].off <= want + OFFSET_TOL; i += 1) {
      const other = list[i];
      if (other.plot === edge.plot) continue;
      if (Math.abs(edge.ux * other.ux + edge.uy * other.uy) < PARALLEL) continue;
      const a = flip ? -other.hi : other.lo;
      const b = flip ? -other.lo : other.hi;
      const run = Math.min(edge.hi, b) - Math.max(edge.lo, a);
      if (run > 0) covered[index.get(edge) as number] += run;
    }
  };

  for (const [key, list] of buckets) {
    for (const edge of list) {
      add(edge, list, false);
      const before = buckets.get((key + 179) % 180);
      const after = buckets.get((key + 1) % 180);
      if (before) add(edge, before, key === 0);
      if (after) add(edge, after, key === 179);
    }
  }

  const out: Array<Array<[number, number]>> = [];
  all.forEach((edge, i) => {
    if (covered[i] < (edge.hi - edge.lo) * 0.5) out.push([ends[i][0], ends[i][1]]);
  });
  return out;
}
