import { expect, test } from 'bun:test';
import { plotAt } from './villageGeom';
import type { VillagePlot } from './villageIndex';

/** A square of `d` degrees with its south-west corner at (lat, lon). */
const square = (lp: string, lat: number, lon: number, d = 0.001): VillagePlot => ({
  lp, ring: [[lat, lon], [lat + d, lon], [lat + d, lon + d], [lat, lon + d]],
});
const WEST = square('101', 15.74, 79.26);
const EAST = square('102', 15.74, 79.261);

test('a point inside one of two adjacent plots is that plot', () => {
  expect(plotAt([WEST, EAST], { lat: 15.7405, lon: 79.2615 })?.lp).toBe('102');
  expect(plotAt([WEST, EAST], { lat: 15.7405, lon: 79.2605 })?.lp).toBe('101');
});

test('a point outside every plot, or no plots at all, is null', () => {
  expect(plotAt([WEST, EAST], { lat: 15.75, lon: 79.2605 })).toBeNull();
  expect(plotAt([], { lat: 15.7405, lon: 79.2605 })).toBeNull();
  expect(plotAt([WEST], { lat: NaN, lon: 79.2605 })).toBeNull();
});

test('overlapping plots resolve to the smaller', () => {
  const big = square('200', 15.74, 79.26, 0.01);
  const small = square('200/1', 15.7404, 79.2604, 0.0004);
  expect(plotAt([big, small], { lat: 15.7406, lon: 79.2606 })?.lp).toBe('200/1');
  expect(plotAt([small, big], { lat: 15.7406, lon: 79.2606 })?.lp).toBe('200/1');
});

test('a closed ring and an open ring answer the same', () => {
  const closed: VillagePlot = { lp: '7', ring: [...WEST.ring, WEST.ring[0]] };
  expect(plotAt([closed], { lat: 15.7405, lon: 79.2605 })?.lp).toBe('7');
  expect(plotAt([closed], { lat: 15.7395, lon: 79.2605 })).toBeNull();
});

test('a ring with fewer than three corners encloses nothing', () => {
  const line: VillagePlot = { lp: '9', ring: [[15.74, 79.26], [15.75, 79.27]] };
  expect(plotAt([line], { lat: 15.745, lon: 79.265 })).toBeNull();
});
