import { expect, test } from 'bun:test';

import type { RecordCard, WaitingItem } from './api';
import { NOTHING_MISSING, gapsOf, missingOf } from './homeGaps';

/** A whole card: owned land, pinned, bounded and filed, so nothing is missing
 *  until a test takes something away. */
const card = (over: Partial<RecordCard> = {}): RecordCard => ({
  id: 'r-1', kind: 'parcel', title: 'Sy 214/2', passbookId: '', groupId: '',
  subtitle: '', classification: 'agri', status: 'owned', stake: 'owned',
  khataNo: '', ownerName: '', village: 'Katragunta', mandal: '', district: '',
  placeLine: '', extent: 4.3, extentUnit: 'ac', extentAlt: '', marketValue: 0, tags: [],
  lat: 16.5, lon: 80.5, ring: [16.5, 80.5, 16.6, 80.5, 16.6, 80.6], coverFileRef: '',
  extentDetail: '', paperCount: 2, photoCount: 0, featureCount: 0, deedLine: '',
  litigation: false, paperFileRef: '',
  ...over,
});

const reminder = (recordId: string): WaitingItem => ({
  id: `w-${recordId || 'none'}`, title: 'A reminder', detail: '', icon: 'warn',
  actionLabel: '', actionKind: 'ghost', recordId,
});

test('a property with neither a pin nor a boundary is not on the map, and is sent to its map', () => {
  expect(gapsOf(card({ id: 'p', lat: 0, lon: 0, ring: [] }))).toEqual([
    { label: 'Not on the map', fix: 'Set location', to: '/app/records/p/map' },
  ]);
});

test('pinned land without three corners is asked for a boundary, and a flat is not', () => {
  for (const classification of ['agri', 'open_plot']) {
    expect(gapsOf(card({ id: 'p', classification, ring: [16.5, 80.5, 16.6, 80.5] }))).toEqual([
      { label: 'No boundary', fix: 'Draw boundary', to: '/app/records/p/map' },
    ]);
  }
  expect(gapsOf(card({ id: 'f', classification: 'flat', ring: [] }))).toEqual([]);
});

test('nothing filed opens the record, under a label no other destination on Home uses', () => {
  expect(gapsOf(card({ id: 'p', paperCount: 0 }))).toEqual([
    { label: 'No documents', fix: 'Open record', to: '/app/records/p' },
  ]);
  // Neither the shortcut's label nor the shared-link reminder's.
  expect(gapsOf(card({ paperCount: 0 })).map((g) => g.fix)).not.toContain('Add document');
  expect(gapsOf(card({ paperCount: 0 })).map((g) => g.fix)).not.toContain('Open Documents');
});

test('the map comes first when a property misses both, so it is the row’s action', () => {
  expect(gapsOf(card({ lat: 0, lon: 0, ring: [], paperCount: 0 })).map((g) => g.label))
    .toEqual(['Not on the map', 'No documents']);
});

test('only what you own counts: managed and watched land is somebody else’s to complete', () => {
  const m = missingOf([
    card({ id: 'mine', paperCount: 0 }),
    card({ id: 'managed', stake: 'managed', paperCount: 0 }),
    card({ id: 'watched', stake: 'watch', lat: 0, lon: 0, ring: [] }),
  ], []);
  expect(m.owned).toBe(1);
  expect(m.open.map((x) => x.r.id)).toEqual(['mine']);
  expect(m.tally).toEqual([{ label: 'No documents', n: 1 }]);
});

test('the tally counts properties per kind of gap, in the order first seen', () => {
  const m = missingOf([
    card({ id: 'a', lat: 0, lon: 0, ring: [] }),
    card({ id: 'b', paperCount: 0 }),
    card({ id: 'c', lat: 0, lon: 0, ring: [], paperCount: 0 }),
    card({ id: 'd' }),
  ], []);
  expect(m.owned).toBe(4);
  expect(m.open.map((x) => x.r.id)).toEqual(['a', 'b', 'c']);
  expect(m.tally).toEqual([{ label: 'Not on the map', n: 2 }, { label: 'No documents', n: 2 }]);
});

test('a property a reminder already names is counted but not listed a second time', () => {
  const m = missingOf([
    card({ id: 'named', lat: 0, lon: 0, ring: [] }),
    card({ id: 'free', paperCount: 0 }),
  ], [reminder('named')]);
  expect(m.open.map((x) => x.r.id)).toEqual(['named', 'free']);
  expect(m.tally).toEqual([{ label: 'Not on the map', n: 1 }, { label: 'No documents', n: 1 }]);
  expect(m.listed.map((x) => x.r.id)).toEqual(['free']);
});

test('a reminder that names no property hides none', () => {
  const m = missingOf([card({ id: 'p', paperCount: 0 })], [reminder('')]);
  expect(m.listed.map((x) => x.r.id)).toEqual(['p']);
});

test('nothing held is nothing missing', () => {
  expect(missingOf([], [])).toEqual(NOTHING_MISSING);
  expect(missingOf([card()], [])).toEqual({ owned: 1, open: [], listed: [], tally: [] });
});
