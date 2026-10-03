import { expect, test } from 'bun:test';

import type { HoldingCard } from './api';
import {
  HOLDING_SORTS, holdingCsvRows, holdingFacets, holdingSummary, filteredEmptyNote, matchesHolding,
  sortHoldings,
} from './holdingList';
import { holdingsPathFrom } from './holdingPath';
import { csvCell } from './ui';

/** A whole, bounded farm of two records until a test takes something away. */
const row = (over: Partial<HoldingCard> = {}): HoldingCard => ({
  id: 'c-1', name: 'Markapur Land', note: '', memberCount: 2, parcelCount: 2, propertyCount: 0,
  farmExtent: 30, plotExtent: 0, builtExtent: 0, extentLine: '', marketValue: 0, invested: 0,
  paperCount: 0, surveyedCount: 2, combinedSpend: 0, memberSpend: 0, placeLine: 'Markapur',
  isComplete: true, createdAt: '2026-10-01T00:00:00Z', updatedAt: '2026-10-01T00:00:00Z',
  members: [],
  ...over,
});

const farm = row({ id: 'a', name: 'Banda farm', farmExtent: 34.53 });
const missing = row({ id: 'b', name: 'arakulapadu', memberCount: 3, surveyedCount: 1, isComplete: false,
  farmExtent: 28.33, updatedAt: '2026-10-20T00:00:00Z' });
const plot = row({ id: 'c', name: 'Ongole plots', farmExtent: 0, plotExtent: 400, surveyedCount: 0,
  updatedAt: 'not a date' });
const list = [farm, missing, plot];

test('facets are counted over the list and an option nothing carries is not offered', () => {
  const groups = holdingFacets(list);
  const byKey = Object.fromEntries(groups.map((g) => [g.key, g.options]));
  expect(byKey.complete).toEqual([
    { key: 'complete', label: 'All records present', count: 2 },
    { key: 'missing', label: 'Missing a record', count: 1 },
  ]);
  expect(byKey.ground.map((o) => [o.key, o.count])).toEqual([['all', 1], ['some', 1], ['none', 1]]);
  // Nothing is built, so "Built area" is dropped rather than offered at 0.
  expect(byKey.land.map((o) => o.key)).toEqual(['farm', 'plot']);
});

test('a row short of a record is what "Missing a record" finds', () => {
  expect(list.filter((c) => matchesHolding(c, { complete: ['missing'] })).map((c) => c.id)).toEqual(['b']);
});

test('filters are OR within a group and AND across groups', () => {
  const ids = (sel: Record<string, string[]>) => list.filter((c) => matchesHolding(c, sel)).map((c) => c.id);
  expect(ids({ ground: ['all', 'none'] })).toEqual(['a', 'c']);
  expect(ids({ land: ['farm'], complete: ['complete'] })).toEqual(['a']);
  expect(ids({})).toEqual(['a', 'b', 'c']);
  expect(ids({ land: ['built'] })).toEqual([]);
});

test('each sort order, without touching the input', () => {
  const before = list.map((c) => c.id);
  const order = (k: (typeof HOLDING_SORTS)[number]['key']) => sortHoldings(list, k).map((c) => c.id);
  expect(order('newest')).toEqual(['a', 'b', 'c']);
  expect(order('name')).toEqual(['b', 'a', 'c']);
  expect(order('extent')).toEqual(['a', 'b', 'c']);
  expect(order('records')).toEqual(['b', 'a', 'c']);
  // An unreadable date goes last, not first.
  expect(order('updated')).toEqual(['b', 'a', 'c']);
  expect(list.map((c) => c.id)).toEqual(before);
  expect(HOLDING_SORTS[0].key).toBe('newest');
});

test('the summary never adds acres to square yards, and agrees in number', () => {
  expect(holdingSummary(list)).toBe('3 holdings · 62.86 ac · 400 Sq.yd');
  expect(holdingSummary([farm])).toBe('1 holding · 34.53 ac');
  expect(holdingSummary([row({ marketValue: 14000000 })])).toBe('1 holding · 30.00 ac · ₹1.40 Cr valued');
  expect(holdingSummary([])).toBe('0 holdings');
});

test('the filtered-empty note says the list is narrowed, not empty', () => {
  expect(filteredEmptyNote(1)).toBe('The one holding is hidden by the filters above.');
  expect(filteredEmptyNote(3)).toBe('All 3 holdings are hidden by the filters above.');
});

test('the CSV has a header row and keeps a formula in a name as text', () => {
  const rows = holdingCsvRows([row({ name: '=HYPERLINK("x")', isComplete: false })]);
  expect(rows[0][0]).toBe('Name');
  expect(rows).toHaveLength(2);
  expect(rows[1][7]).toBe('no');
  expect(csvCell(rows[1][0])).toBe(`"'=HYPERLINK(""x"")"`);
});

test('an old /app/combined address maps onto /app/holdings, id and tab kept', () => {
  expect(holdingsPathFrom('/app/combined')).toBe('/app/holdings');
  expect(holdingsPathFrom('/app/combined/')).toBe('/app/holdings/');
  expect(holdingsPathFrom('/app/combined/cp-1')).toBe('/app/holdings/cp-1');
  expect(holdingsPathFrom('/app/combined/cp-1/papers')).toBe('/app/holdings/cp-1/papers');
  // Only the whole segment moves; a look-alike and other routes are untouched.
  expect(holdingsPathFrom('/app/combinedx')).toBe('/app/combinedx');
  expect(holdingsPathFrom('/app/records/combined')).toBe('/app/records/combined');
});
