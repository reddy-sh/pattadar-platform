import { expect, test } from 'bun:test';

import { ALL_LAYERS, chooseBase, chooseInsight, resolveLayers, toggleOverlay } from './mapLayers';
import type { LayerChoice, LayerPlace } from './mapLayers';

const EVERYWHERE: LayerPlace = { offers: ALL_LAYERS };
const start: LayerChoice = { base: 'satellite', overlays: ['cadastral', 'numbers'], insight: null };
const row = (r: ReturnType<typeof resolveLayers>, id: string) => r.rows.find((x) => x.def.id === id)!;

test('rule 1: the map-type chip that is on flips — Satellite to Boundaries, the others back to Satellite', () => {
  expect(chooseBase(start, 'street').base).toBe('street');
  expect(chooseBase(start, 'satellite').base).toBe('boundaries');
  expect(chooseBase({ ...start, base: 'street' }, 'street').base).toBe('satellite');
  expect(chooseBase({ ...start, base: 'boundaries' }, 'boundaries').base).toBe('satellite');
});

test('rule 2: reference layers stack', () => {
  const r = resolveLayers({ ...start, overlays: ['cadastral', 'numbers', 'properties', 'measurements'] }, EVERYWHERE);
  expect([...r.shown].sort()).toEqual(['cadastral', 'measurements', 'numbers', 'properties']);
});

test('rule 3: one insight at a time — choosing one replaces the last', () => {
  const a = chooseInsight(start, 'extent');
  const b = chooseInsight(a, 'climate');
  expect(b.insight).toBe('climate');
  expect(resolveLayers(b, EVERYWHERE).shown.has('extent')).toBe(false);
  expect(chooseInsight(b, null).insight).toBeNull();
});

test('rule 4: turning a layer on brings what it is drawn on, and the map type it is coloured for', () => {
  const bare: LayerChoice = { base: 'street', overlays: [], insight: null };
  expect(toggleOverlay(bare, 'numbers').overlays.sort()).toEqual(['cadastral', 'numbers']);
  const graded = chooseInsight(bare, 'suitability');
  expect(graded.base).toBe('satellite');
  expect(graded.overlays).toContain('cadastral');
  expect(resolveLayers(graded, EVERYWHERE).insight).toBe('suitability');
  // Hydrogeology and Climate draw on any ground and bring nothing.
  expect(chooseInsight(bare, 'climate')).toEqual({ ...bare, insight: 'climate' });
});

test('rule 5: a conflict pauses, never unticks, and clears on its own', () => {
  const extent = chooseInsight(start, 'extent');
  const noMesh = toggleOverlay(extent, 'cadastral');
  expect(noMesh.insight).toBe('extent');
  const r = resolveLayers(noMesh, EVERYWHERE);
  expect(r.insight).toBeNull();
  expect(row(r, 'extent')).toMatchObject({ chosen: true, on: false, locked: false, why: 'Paused: shows with Cadastral map.' });
  expect(row(r, 'numbers').why).toBe('Paused: shows with Cadastral map.');

  const street = chooseBase(extent, 'street');
  expect(row(resolveLayers(street, EVERYWHERE), 'extent').why).toBe('Paused: shows on Satellite.');
  expect(resolveLayers(chooseBase(street, 'satellite'), EVERYWHERE).insight).toBe('extent');
});

test('rule 6: Climate pauses every parcel-scale layer, which come back when it goes', () => {
  const both = { ...chooseInsight(start, 'climate'), overlays: ['cadastral', 'numbers', 'properties', 'measurements'] } as LayerChoice;
  const r = resolveLayers(both, EVERYWHERE);
  expect([...r.shown]).toEqual(['climate']);
  expect(row(r, 'properties').why).toBe('Paused while Climate is on: too small to see at district zoom.');
  expect(resolveLayers(chooseInsight(both, null), EVERYWHERE).shown.size).toBe(4);
});

test('rule 7: Measurements step aside for Hydrogeology, whose bore points sit on the same ground', () => {
  const r = resolveLayers({ base: 'satellite', overlays: ['measurements'], insight: 'hydrogeology' }, EVERYWHERE);
  expect(r.shown.has('hydrogeology')).toBe(true);
  expect(row(r, 'measurements').why).toMatch(/^Paused while Hydrogeology is on/);
});

test('rule 8: a tool holds the map type and pauses what it names, without changing the choice', () => {
  const choice: LayerChoice = { base: 'street', overlays: ['cadastral'], insight: 'extent' };
  const r = resolveLayers(choice, {
    offers: ALL_LAYERS,
    tool: { doing: 'you measure', base: 'satellite', pauses: ['extent', 'suitability', 'hydrogeology', 'climate'] },
  });
  expect(r.base).toBe('satellite');
  expect(r.baseHeld).toBe('Held while you measure.');
  expect(row(r, 'extent')).toMatchObject({ chosen: true, on: false, locked: true, unavailable: false, why: 'Paused while you measure.' });
  expect(r.shown.has('cadastral')).toBe(true);
  // Without the tool the same choice resolves as it did before it.
  expect(resolveLayers(choice, EVERYWHERE).base).toBe('street');
});

test('rule 9: unavailable is listed unticked, locked and explained; a layer a place cannot have is not listed', () => {
  const place: LayerPlace = {
    offers: ALL_LAYERS.filter((id) => id !== 'measurements'),
    unavailable: { suitability: 'Not graded for this village yet.' },
  };
  const choice = chooseInsight(start, 'suitability');
  const r = resolveLayers(choice, place);
  expect(r.rows.some((x) => x.def.id === 'measurements')).toBe(false);
  // Not ticked: a tick would claim it is on, over a map that cannot show it.
  expect(row(r, 'suitability')).toMatchObject({
    chosen: false, on: false, locked: true, unavailable: true, why: 'Not graded for this village yet.',
  });
  expect(row(r, 'hydrogeology')).toMatchObject({ chosen: false, locked: false, why: '' });
  // The choice is kept: where it can be had, it is on without being asked again.
  expect(resolveLayers(choice, { offers: ALL_LAYERS }).insight).toBe('suitability');
});
