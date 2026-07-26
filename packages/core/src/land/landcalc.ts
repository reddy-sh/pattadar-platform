/**
 * Ground-measurement geometry for the Area Calculator (ported verbatim from
 * the predecessor's pattadar app's landcalc.ts). Lengths in feet unless noted; polygon
 * helpers mirror the shared GeoMap's spherical formulas. Pure functions.
 */

export const LENGTH_FT = { ft: 1, m: 3.280839895, yd: 3, link: 0.66 } as const;
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
