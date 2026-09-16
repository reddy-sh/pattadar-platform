import { describe, expect, test } from 'bun:test';
import { centreOf, hasBoundaryRing, isLocated, pairRing } from './portfolioGeo';

describe('portfolio locations', () => {
  const ring: Array<[number, number]> = [[16, 80], [16, 81], [17, 81], [17, 80]];

  test('a boundary is usable without a pin', () => {
    expect(isLocated({ ring, lat: 0, lon: 0 })).toBe(true);
  });

  test('missing, nonfinite, and out-of-range pins are not drawable', () => {
    for (const [lat, lon] of [[0, 0], [NaN, 80], [16, Infinity], [91, 80], [16, -181]]) {
      expect(isLocated({ ring: [], lat, lon })).toBe(false);
    }
    expect(isLocated({ ring: [], lat: 16, lon: 80 })).toBe(true);
  });

  test('invalid rings fall back to the pin without inventing replacement edges', () => {
    const damaged: Array<[number, number]> = [[16, 80], [NaN, 81], [17, 81]];
    expect(hasBoundaryRing(damaged)).toBe(false);
    expect(isLocated({ ring: damaged, lat: 16.5, lon: 80.5 })).toBe(true);
    expect(centreOf({ ring: damaged, lat: 16.5, lon: 80.5 })).toEqual([16.5, 80.5]);
    expect(pairRing(damaged.flat())).toEqual([]);
  });

  test('three repeated entries cannot masquerade as three surveyed corners', () => {
    expect(hasBoundaryRing([[16, 80], [17, 81], [16, 80]])).toBe(false);
    expect(pairRing([16, 80, 17, 81, 16, 80])).toEqual([]);
  });

  test('open and closed rings place their label at the same point', () => {
    const record = { ring, lat: 0, lon: 0 };
    expect(centreOf(record)).toEqual([16.5, 80.5]);
    expect(centreOf({ ...record, ring: [...ring, ring[0]] })).toEqual(centreOf(record));
  });

  test('half a trailing coordinate is ignored without losing complete corners', () => {
    expect(pairRing([...ring.flat(), 19])).toEqual(ring);
  });
});
