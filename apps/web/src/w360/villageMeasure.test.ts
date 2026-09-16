import { expect, test } from 'bun:test';
import { haversineKm, ringAreaSqM } from '@pattadar/core';
import { measureVillageTape } from './villageMeasure';

test('distance has no area until the tape encloses land', () => {
  expect(measureVillageTape([])).toMatchObject({ points: 0, metres: 0, acres: null });
  expect(measureVillageTape([[16, 80]])).toMatchObject({ points: 1, metres: 0, acres: null });
  const line = measureVillageTape([[16, 80], [16.001, 80]]);
  expect(line.metres).toBeCloseTo(111.195, 2);
  expect(line.acres).toBeNull();
  expect(line.error).toBe('');
});

test('perimeter includes the closing side and agrees with the enclosed area', () => {
  const ring: Array<[number, number]> = [[16, 80], [16.001, 80], [16.001, 80.001]];
  const closed = measureVillageTape(ring);
  const a = measureVillageTape(ring.slice(0, 2)).metres;
  const b = measureVillageTape(ring.slice(1)).metres;
  const closing = haversineKm({ latitude: ring[2][0], longitude: ring[2][1] },
    { latitude: ring[0][0], longitude: ring[0][1] }) * 1000;
  expect(closed.metres).toBeCloseTo(a + b + closing, 6);
  expect(closed.acres).toBeCloseTo(ringAreaSqM(ring) / 4046.8564224, 8);
  expect(closed.ring).toEqual(ring);
  expect(closed.ring).not.toBe(ring);
  expect(closed.error).toBe('');
});

test('crossed tape keeps its measured distance but cannot claim an enclosed area', () => {
  // Unequal lobes: this bowtie has a nonzero signed area, so checking only
  // area > 0 would still produce an incorrect parcel/fencing estimate.
  const ring: Array<[number, number]> = [[16, 80], [16.002, 80.002], [16, 80.002], [16.001, 80]];
  const tape = measureVillageTape(ring);
  const expectedDistance = ring.reduce((sum, point, i) => {
    const next = ring[(i + 1) % ring.length];
    return sum + haversineKm({ latitude: point[0], longitude: point[1] },
      { latitude: next[0], longitude: next[1] }) * 1000;
  }, 0);
  expect(tape.metres).toBeCloseTo(expectedDistance, 6);
  expect(tape.acres).toBeNull();
  expect(tape.error).toContain('crosses itself');
  expect(tape.ring).toEqual(ring);
});

test('collinear or overlapping closed tapes do not get acreage', () => {
  for (const ring of [
    [[16, 80], [16.001, 80.001], [16.002, 80.002]],
    [[16, 80], [16, 80.002], [16, 80.001], [16.001, 80.001], [16.001, 80]],
  ] as Array<Array<[number, number]>>) {
    const tape = measureVillageTape(ring);
    expect(tape.metres).toBeGreaterThan(0);
    expect(tape.acres).toBeNull();
    expect(tape.error).not.toBe('');
  }
});

test('valid concave land has an area and a repaired tape clears its error', () => {
  const ring: Array<[number, number]> = [[16, 80], [16, 80.002], [16.001, 80.001], [16.002, 80.002], [16.002, 80]];
  expect(measureVillageTape(ring).acres).toBeGreaterThan(0);
  expect(measureVillageTape(ring).error).toBe('');
  expect(measureVillageTape([]).error).toBe('');
});
