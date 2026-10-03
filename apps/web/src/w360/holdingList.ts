/** The Holdings list: its filters, sort orders, summary line and CSV.
 *
 *  Pure functions over the list the query already answered, so the page stays
 *  layout and the rules have a test of their own. Types only from the API
 *  module, so the test never loads the query client.
 *
 *  Everything here works from facts each row already carries. There is no
 *  district or mandal facet: `placeLine` is a compressed display string
 *  ("3 villages · Prakasam") and splitting it would misfile rows. A Place
 *  facet needs structured places on `HoldingCard` first. */
import type { HoldingCard } from './api';
import type { FacetFilterGroup } from './ui';
import { HOLDING_WORD, inr, num, plural } from './ui';

/** The URL parameter each facet group writes, so a filtered list can be
 *  shared — the same shape Properties uses. */
export const HOLDING_PARAM = { complete: 'complete', ground: 'ground', land: 'land' } as const;
export type HoldingFacet = keyof typeof HOLDING_PARAM;

/** Which value of each group a row carries. `land` is the only group a row
 *  can sit in more than once: a holding may hold farmland and a plot. */
function facetValues(c: HoldingCard): Record<HoldingFacet, string[]> {
  const ground = c.memberCount > 0 && c.surveyedCount >= c.memberCount ? 'all'
    : c.surveyedCount <= 0 ? 'none' : 'some';
  return {
    complete: [c.isComplete ? 'complete' : 'missing'],
    ground: [ground],
    land: [
      c.farmExtent > 0 && 'farm',
      c.plotExtent > 0 && 'plot',
      c.builtExtent > 0 && 'built',
    ].filter(Boolean) as string[],
  };
}

const GROUPS: { key: HoldingFacet; label: string; options: { key: string; label: string }[] }[] = [
  { key: 'complete', label: 'Records', options: [
    { key: 'complete', label: 'All records present' },
    { key: 'missing', label: 'Missing a record' },
  ] },
  { key: 'ground', label: 'Boundaries', options: [
    { key: 'all', label: 'All on map' },
    { key: 'some', label: 'Some missing' },
    { key: 'none', label: 'None on map' },
  ] },
  { key: 'land', label: 'Land', options: [
    { key: 'farm', label: 'Farmland' },
    { key: 'plot', label: 'Plots' },
    { key: 'built', label: 'Built area' },
  ] },
];

/** The filter groups for `FacetFilter`, counted over the whole list. An
 *  option nothing carries is dropped rather than offered at 0, and a group
 *  left with no options is hidden by FacetFilter itself. */
export function holdingFacets(list: readonly HoldingCard[]): FacetFilterGroup[] {
  const values = list.map(facetValues);
  return GROUPS.map((g) => ({
    key: g.key,
    label: g.label,
    options: g.options
      .map((o) => ({ ...o, count: values.filter((v) => v[g.key].includes(o.key)).length }))
      .filter((o) => o.count > 0),
  }));
}

/** AND across groups, OR within one — the semantics Properties' filter has. */
export function matchesHolding(c: HoldingCard, selected: Record<string, readonly string[]>): boolean {
  const have = facetValues(c);
  return (Object.keys(HOLDING_PARAM) as HoldingFacet[]).every((g) => {
    const want = selected[g] ?? [];
    return want.length === 0 || want.some((w) => have[g].includes(w));
  });
}

export type HoldingSortKey = 'newest' | 'name' | 'extent' | 'records' | 'updated';

/** The orders the sort chip cycles through. "Newest first" is the server's own
 *  order (created_at DESC), so it is the default and sorts nothing. */
export const HOLDING_SORTS: { key: HoldingSortKey; label: string }[] = [
  { key: 'newest', label: 'Newest first' },
  { key: 'name', label: 'Name A–Z' },
  { key: 'extent', label: 'Largest extent' },
  { key: 'records', label: 'Most records' },
  { key: 'updated', label: 'Recently updated' },
];

const stamp = (s: string) => {
  const t = Date.parse(s);
  return Number.isFinite(t) ? t : -Infinity;
};

/** A sorted copy; the input is never mutated, and ties keep their order.
 *  "Largest extent" compares acres, then plot yards, then built feet — it
 *  never converts one unit into another to add them. */
export function sortHoldings(list: readonly HoldingCard[], key: HoldingSortKey): HoldingCard[] {
  const out = [...list];
  if (key === 'newest') return out;
  const by: Record<Exclude<HoldingSortKey, 'newest'>, (a: HoldingCard, b: HoldingCard) => number> = {
    name: (a, b) => a.name.localeCompare(b.name, 'en-IN', { sensitivity: 'base' }),
    extent: (a, b) => (b.farmExtent - a.farmExtent) || (b.plotExtent - a.plotExtent)
      || (b.builtExtent - a.builtExtent),
    records: (a, b) => b.memberCount - a.memberCount,
    updated: (a, b) => {
      const x = stamp(a.updatedAt), y = stamp(b.updatedAt);
      return x === y ? 0 : y > x ? 1 : -1;
    },
  };
  return out.sort(by[key]);
}

/** "2 holdings · 62.86 ac · 400 Sq.yd · ₹1.40 Cr valued".
 *
 *  Summed over the rows on screen, as Properties' line is. Acres, plot yards
 *  and built feet are three figures, never one, and each is printed only when
 *  there is some of it — "0.00 ac" or "₹0" would claim somebody measured. The
 *  forms match the rows' own extent line and Properties' `num(x, 2) ac`. */
export function holdingSummary(list: readonly HoldingCard[]): string {
  const sum = (f: (c: HoldingCard) => number) => list.reduce((n, c) => n + (f(c) || 0), 0);
  const farm = sum((c) => c.farmExtent);
  const plot = sum((c) => c.plotExtent);
  const built = sum((c) => c.builtExtent);
  const worth = sum((c) => c.marketValue);
  return [
    plural(list.length, HOLDING_WORD.one.toLowerCase(), HOLDING_WORD.many.toLowerCase()),
    farm >= 0.005 ? `${num(farm, 2)} ac` : '',
    plot > 0 ? `${num(plot)} Sq.yd` : '',
    built > 0 ? `${num(built)} Sq.ft built` : '',
    worth > 0 ? `${inr(worth)} valued` : '',
  ].filter(Boolean).join(' · ');
}

/** The note under "No holdings match these filters", as Properties' panel
 *  has under its own: it says that the list is not empty, only narrowed. */
export function filteredEmptyNote(total: number): string {
  return total === 1
    ? `The one ${HOLDING_WORD.one.toLowerCase()} is hidden by the filters above.`
    : `All ${total} ${HOLDING_WORD.many.toLowerCase()} are hidden by the filters above.`;
}

/** The rows for `downloadCsv`: numbers as numbers, so a spreadsheet can add
 *  them. `downloadCsv` passes every cell through `csvCell`. */
export function holdingCsvRows(list: readonly HoldingCard[]): unknown[][] {
  return [
    ['Name', 'Records', 'Place', 'Farmland (ac)', 'Plots (Sq.yd)', 'Built (Sq.ft)',
      'With boundaries', 'Complete', 'Worth (₹)', 'Note'],
    ...list.map((c) => [
      c.name, c.memberCount, c.placeLine, c.farmExtent, c.plotExtent, c.builtExtent,
      `${c.surveyedCount} of ${c.memberCount}`, c.isComplete ? 'yes' : 'no',
      c.marketValue, c.note,
    ]),
  ];
}
