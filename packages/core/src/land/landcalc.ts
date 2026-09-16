/**
 * Ground-measurement geometry for the Area Calculator (ported verbatim from
 * the predecessor's pattadar app's landcalc.ts). Lengths in feet unless noted; polygon
 * helpers mirror the shared GeoMap's spherical formulas. Pure functions.
 */

export const LENGTH_FT = { ft: 1, m: 3.280839895, yd: 3, link: 0.66 } as const;

/** 1 acre = 4046.8564224 m², exactly. Named here because it was written out as
 *  a literal at four call sites, three of them truncated to 4046.8564 — a
 *  0.000006% difference that is harmless and still means two screens can
 *  disagree about the same parcel's acreage in the last printed digit. */
export const SQ_M_PER_ACRE = 4046.8564224;
export type LengthUnit = keyof typeof LENGTH_FT;
export const LENGTH_UNITS: { key: LengthUnit; label: string }[] = [
  { key: 'ft', label: 'Feet' },
  { key: 'm', label: 'Metres' },
  { key: 'yd', label: 'Yards' },
  { key: 'link', label: 'Links (chain)' },
];

export function toFeet(value: number, unit: LengthUnit): number {
  return (Number(value) || 0) * LENGTH_FT[unit];
}

export function rectangleSqft(lenFt: number, widFt: number): number {
  return (Number(lenFt) || 0) * (Number(widFt) || 0);
}

/** Heron's formula. Returns 0 for degenerate / impossible triangles. */
export function triangleSqft(a: number, b: number, c: number): number {
  a = Number(a) || 0;
  b = Number(b) || 0;
  c = Number(c) || 0;
  const s = (a + b + c) / 2;
  const area2 = s * (s - a) * (s - b) * (s - c);
  return area2 > 0 ? Math.sqrt(area2) : 0;
}

/**
 * Quadrilateral ABCD with sides s1=AB, s2=BC, s3=CD, s4=DA and the diagonal AC
 * (from corner 1 to corner 3). Split into triangles ABC (s1,s2,diag) and
 * ACD (diag,s3,s4).
 */
export function quadrilateralSqft(
  s1: number,
  s2: number,
  s3: number,
  s4: number,
  diag: number,
): number {
  return triangleSqft(s1, s2, diag) + triangleSqft(diag, s3, s4);
}

/** GeoJSON Polygon string → ring of [lat,lng]; drops the closing duplicate. */
export function parsePolygonRing(geojson: string): [number, number][] {
  try {
    const gj = JSON.parse(geojson);
    if (gj?.type !== 'Polygon' || !Array.isArray(gj.coordinates?.[0])) return [];
    const ring = (gj.coordinates[0] as number[][]).map((c) => [c[1], c[0]] as [number, number]);
    if (ring.length > 1) {
      const a = ring[0];
      const z = ring[ring.length - 1];
      if (a[0] === z[0] && a[1] === z[1]) ring.pop();
    }
    return ring;
  } catch {
    return [];
  }
}

/** Spherical polygon area (m²); ring is [[lat,lng],...]. (Mirrors GeoMap.) */
export function ringAreaSqM(ring: [number, number][]): number {
  if (!ring || ring.length < 3) return 0;
  const R = 6378137;
  const rad = (d: number) => (d * Math.PI) / 180;
  let sum = 0;
  for (let i = 0; i < ring.length; i++) {
    const [lat1, lng1] = ring[i];
    const [lat2, lng2] = ring[(i + 1) % ring.length];
    sum += (rad(lng2) - rad(lng1)) * (2 + Math.sin(rad(lat1)) + Math.sin(rad(lat2)));
  }
  return Math.abs((sum * R * R) / 2);
}

/**
 * A corner's name: A, B, C … Z, then AA, AB, …
 *
 * Letters rather than numbers, because a boundary screen is covered in numbers
 * already — every side carries a length. "13" beside "136 m" is two numbers
 * and you have to think about which is which; "M" beside "136 m" is not.
 *
 * Past 26 corners it doubles up the way spreadsheet columns do. An FMB rarely
 * runs that long, but a traced boundary can.
 */
export function cornerLabel(index: number): string {
  let n = Math.floor(index);
  if (!Number.isFinite(n) || n < 0) return '';
  let out = '';
  do {
    out = String.fromCharCode(65 + (n % 26)) + out;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return out;
}

/** One edge of a boundary, as a person reads it off a sheet. */
export interface RingSide {
  /** 1-based corner numbers, matching how marks and FMB corners are labelled. */
  from: number;
  to: number;
  metres: number;
  /** Compass bearing from `from` to `to`, degrees clockwise from north. */
  bearing: number;
}

/**
 * Every side of a ring, with its length and bearing.
 *
 * Deliberately NOT rounded here: rounding is a presentation decision and the
 * honest number of decimals depends on where the ring came from. A ring traced
 * over satellite imagery is good to a few metres; one built from an FMB's
 * projected corner table is good to centimetres. The caller knows which it has.
 */
export function ringSides(ring: [number, number][]): RingSide[] {
  if (!ring || ring.length < 2) return [];
  const rad = (d: number) => (d * Math.PI) / 180;
  const deg = (r: number) => (r * 180) / Math.PI;
  const out: RingSide[] = [];
  // A closed ring walks back to corner 1; an open path stops at the last.
  const last = ring.length >= 3 ? ring.length : ring.length - 1;
  for (let i = 0; i < last; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % ring.length];
    const dLon = rad(b[1] - a[1]);
    const y = Math.sin(dLon) * Math.cos(rad(b[0]));
    const x = Math.cos(rad(a[0])) * Math.sin(rad(b[0]))
      - Math.sin(rad(a[0])) * Math.cos(rad(b[0])) * Math.cos(dLon);
    out.push({
      from: i + 1,
      to: ((i + 1) % ring.length) + 1,
      metres: ringPerimM([a, b]),
      bearing: (deg(Math.atan2(y, x)) + 360) % 360,
    });
  }
  return out;
}

/** N, NNE, NE, … — a direction anyone can stand in and point. A traced ring
 *  carries a degree or two of error, so printing 47.3° would be fiction. */
export function compassPoint(bearing: number): string {
  const POINTS = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE',
                  'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
  return POINTS[Math.round((((bearing % 360) + 360) % 360) / 22.5) % 16];
}

/** Perimeter (m) via haversine; closed ring for 3+ points. */
export function ringPerimM(ring: [number, number][]): number {
  if (!ring || ring.length < 2) return 0;
  const R = 6371000;
  const rad = (d: number) => (d * Math.PI) / 180;
  const seg = (a: [number, number], b: [number, number]) => {
    const dLat = rad(b[0] - a[0]);
    const dLng = rad(b[1] - a[1]);
    const s =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(rad(a[0])) * Math.cos(rad(b[0])) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(s));
  };
  let sum = 0;
  const last = ring.length >= 3 ? ring.length : ring.length - 1;
  for (let i = 0; i < last; i++) sum += seg(ring[i], ring[(i + 1) % ring.length]);
  return sum;
}

/**
 * What it takes to fence a boundary, side by side.
 *
 * `fenceEstimate` below is the older, blunter version and two screens still
 * call it: posts = perimeter / spacing. That is not what anybody buys. A fence
 * turns at its corners, so there is a post AT every corner whether or not the
 * spacing lands one there, and the run between two corners cannot be spanned
 * by a stride that ignores them. On a 4-sided plot of 100/80/100/80 m at 3 m
 * spacing the blunt sum says 120 posts; the sides say 122, and the two extra
 * are the ones that hold the fence up.
 *
 * Spacing is a MAXIMUM, not a stride: each side is divided into whole
 * intervals no longer than `spacing`, so a 100 m side at 3 m becomes 34
 * intervals of 2.94 m rather than 33 of 3 m and a 1 m orphan at the end. That
 * is how it is actually built.
 *
 * Lengths in metres in, metres out. Money is per post and per metre of wire,
 * because that is how a quote from a fencing contractor is itemised — and the
 * wire is the perimeter once per strand, not once.
 */
export interface FencePlan {
  perimeter: number;
  sides: number;
  corners: number;
  /** One at every corner. These are the braced ones a fence turns on. */
  cornerPosts: number;
  /** Everything between the corners, spaced along the sides. */
  linePosts: number;
  posts: number;
  /** Metres of wire: the perimeter, once for each strand. */
  wire: number;
  postCost: number;
  wireCost: number;
  cost: number;
  /** Per side, so an estimate can be walked and checked against the ground. */
  bySide: Array<{ metres: number; posts: number; spacing: number }>;
}

export interface FenceOptions {
  /** Longest gap allowed between two posts, in metres. */
  spacing: number;
  /** Lines of wire, one above the other. Four is the local norm. */
  strands: number;
  /** A closed boundary has as many corners as sides; an open run has one
   *  more, because both of its ends are corners too. */
  closed?: boolean;
  costPerPost?: number;
  costPerMetre?: number;
}

export function fencePlan(sideMetres: number[], opts: FenceOptions): FencePlan {
  const lengths = (sideMetres ?? []).map((m) => Number(m) || 0).filter((m) => m > 0);
  const spacing = Number(opts?.spacing) || 0;
  const strands = Math.max(0, Number(opts?.strands) || 0);
  const closed = opts?.closed !== false;

  const perimeter = lengths.reduce((t, m) => t + m, 0);
  const sides = lengths.length;
  const corners = sides === 0 ? 0 : closed ? sides : sides + 1;

  const bySide = lengths.map((metres) => {
    const intervals = spacing > 0 ? Math.max(1, Math.ceil(metres / spacing)) : 1;
    return { metres, posts: intervals - 1, spacing: metres / intervals };
  });
  const linePosts = bySide.reduce((t, s) => t + s.posts, 0);
  const posts = corners + linePosts;
  const wire = perimeter * strands;
  const postCost = posts * (Number(opts?.costPerPost) || 0);
  const wireCost = wire * (Number(opts?.costPerMetre) || 0);

  return {
    perimeter,
    sides,
    corners,
    cornerPosts: corners,
    linePosts,
    posts,
    wire,
    postCost,
    wireCost,
    cost: postCost + wireCost,
    bySide,
  };
}

export function fenceEstimate(
  perimeter: number,
  spacing: number,
  strands: number,
  costPerPost = 0,
  costPerLength = 0,
): { posts: number; wire: number; cost: number } {
  const p = Number(perimeter) || 0;
  const sp = Number(spacing) || 0;
  const st = Number(strands) || 0;
  const posts = sp > 0 ? Math.ceil(p / sp) : 0;
  const wire = p * st;
  const cost = posts * (Number(costPerPost) || 0) + wire * (Number(costPerLength) || 0);
  return { posts, wire, cost };
}
