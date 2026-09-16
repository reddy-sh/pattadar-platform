import { ringAreaSqM } from '@pattadar/core';

type Corner = [number, number];

/** Validate at the same six-decimal precision that the record saves. */
export function checkBoundaryDraft(points: Corner[]): { ring: Corner[]; error: string } {
  if (points.some(([lat, lon]) => !Number.isFinite(lat) || !Number.isFinite(lon)
    || Math.abs(lat) > 90 || Math.abs(lon) > 180 || (lat === 0 && lon === 0))) {
    return { ring: [], error: 'Each corner needs a valid latitude and longitude.' };
  }
  const ring: Corner[] = points.map(([lat, lon]) => [Number(lat.toFixed(6)), Number(lon.toFixed(6))]);
  while (ring.length > 1 && same(ring[0], ring[ring.length - 1])) ring.pop();
  if (ring.length < 3) return { ring, error: 'Add at least three different corners to enclose the land.' };
  if (new Set(ring.map((p) => p.join(','))).size !== ring.length) {
    return { ring, error: 'Two corners overlap. Move or remove the repeated corner.' };
  }
  // Integer coordinates avoid floating-point ambiguity for touching edges.
  const xy = ring.map(([lat, lon]) => [Math.round(lat * 1e6), Math.round(lon * 1e6)] as Corner);
  if (xy.every((point) => turn(xy[0], xy[1], point) === 0)) {
    return { ring, error: 'These corners form a line. Move a corner to enclose the land.' };
  }
  for (let i = 0; i < xy.length; i++) {
    const prev = xy[(i + xy.length - 1) % xy.length];
    const current = xy[i];
    const next = xy[(i + 1) % xy.length];
    if (turn(prev, current, next) === 0
      && (current[0] - prev[0]) * (next[0] - current[0])
        + (current[1] - prev[1]) * (next[1] - current[1]) < 0) {
      return { ring, error: 'Two boundary sides overlap. Move the corner where the line doubles back.' };
    }
  }
  for (let i = 0; i < xy.length; i++) {
    for (let j = i + 1; j < xy.length; j++) {
      if (j === i + 1 || (i === 0 && j === xy.length - 1)) continue;
      if (intersects(xy[i], xy[(i + 1) % xy.length], xy[j], xy[(j + 1) % xy.length])) {
        return { ring, error: 'The boundary crosses itself. Move the corners so the sides do not cross.' };
      }
    }
  }
  if (ringAreaSqM(ring) < 0.01) {
    return { ring, error: 'These corners form a line. Move a corner to enclose the land.' };
  }
  return { ring, error: '' };
}

const same = (a: Corner, b: Corner) => a[0] === b[0] && a[1] === b[1];
const turn = (a: Corner, b: Corner, c: Corner) =>
  Math.sign((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]));
const onSegment = (a: Corner, b: Corner, p: Corner) =>
  Math.min(a[0], b[0]) <= p[0] && p[0] <= Math.max(a[0], b[0])
  && Math.min(a[1], b[1]) <= p[1] && p[1] <= Math.max(a[1], b[1]);
function intersects(a: Corner, b: Corner, c: Corner, d: Corner): boolean {
  const [abC, abD, cdA, cdB] = [turn(a, b, c), turn(a, b, d), turn(c, d, a), turn(c, d, b)];
  return (abC * abD < 0 && cdA * cdB < 0)
    || (abC === 0 && onSegment(a, b, c)) || (abD === 0 && onSegment(a, b, d))
    || (cdA === 0 && onSegment(c, d, a)) || (cdB === 0 && onSegment(c, d, b));
}
