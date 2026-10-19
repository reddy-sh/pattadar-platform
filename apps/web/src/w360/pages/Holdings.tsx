/** Holdings — the list (route `/holdings`; the GraphQL fields keep `combined`).
 *
 *  A holding is several properties an owner holds as one piece of ground:
 *  thirty acres and thirty acres, two khatas, one fence. The list wears the
 *  same page chrome as Properties — PageHead (design.md § Page head) with the
 *  totals as its summary line and Export / New holding as its commands, then
 *  the FacetFilter band with its "N of M shown" tally and the SortCycle chip —
 *  because the owner reported (03/10/2026) that a thinner page read as
 *  a different app. It used to be deliberately bare; that decision is
 *  superseded (docs/specs/2026-09-25-combined-properties.md § Screens).
 *
 *  "New holding" is a link to Properties, not a second creation path. A
 *  holding is made OF records, so it is made where the records are: you tick
 *  them on Properties and press Combine. The link carries `?combine=1`, which
 *  makes Properties say so in a dismissable hint and raise its checkboxes. A picker here would ask the
 *  same question in two places, which is how two pickers come to disagree
 *  about what may be combined.
 *
 *  The rows are a table on the table standard (10/10/2026): the name is the
 *  link, figures sit right, the footer sums every row the filter lets
 *  through (or only the ticked rows, while any are ticked — every data table
 *  is selectable, founder 10/10/2026), and a pager takes over past 20. The SortCycle chip stays the
 *  one sort — clickable headings beside it would be a second.
 *
 *  Grid · Table sit in the band (design.md § Tables, founder 10/10/2026);
 *  table stays the default and `?view=grid` is the card view. Both views share
 *  one selection, so what is ticked in one stays ticked in the other.
 *
 *  Still absent, on purpose:
 *   · a Map view. A map needs each row's geometry, which the list query does
 *     not carry (it lives in the per-view `combinedFmb` query, one round trip
 *     per row).
 *   · a district or mandal facet. `placeLine` is a compressed display string,
 *     not a structured place; parsing it would misfile rows.
 */
import { useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import AddOutlined from '@mui/icons-material/AddOutlined';
import FileDownloadOutlined from '@mui/icons-material/FileDownloadOutlined';

import { useHoldings } from '../api';
import {
  HOLDING_PARAM, HOLDING_SORTS, holdingCsvRows, holdingFacets, holdingSummary,
  filteredEmptyNote, matchesHolding, sortHoldings,
} from '../holdingList';
import type { HoldingFacet, HoldingSortKey } from '../holdingList';
import { extentTotal } from '../PropertyTable';
import { useToast } from '../Toast';
import {
  Card, Empty, FacetFilter, Failed, HOLDING_WORD, PageHead, Pill, SelectAllBox, SelectCell, SelectionBar,
  SortCycle, TablePager, ViewToggle, downloadCsv, inrOr, num, plural, usePaged, useRowSelection,
} from '../ui';
import type { HeadActions } from '../ui';
import type { HoldingCard } from '../api';
import { Sk, SkGrid, SkTable } from '../skeletons';

/** Acres, plot yards and built square feet as `extentTotal` rows, so a cell
 *  and the footer print each unit on its own — never added together: a line
 *  reading "61,450" over land and slab would be a number that measures
 *  nothing. A holding's sq.ft is only ever built area. */
const units = (c: HoldingCard) => [
  { extent: c.farmExtent, extentUnit: 'ac' },
  { extent: c.plotExtent, extentUnit: 'sq.yd' },
  { extent: c.builtExtent, extentUnit: 'sq.ft' },
];

const FACETS = Object.keys(HOLDING_PARAM) as HoldingFacet[];
const many = HOLDING_WORD.many.toLowerCase();
const noun = [HOLDING_WORD.one.toLowerCase(), many] as const;
const idOf = (c: HoldingCard) => c.id;

type HoldingSelection = ReturnType<typeof useRowSelection<HoldingCard>>;

/** The Grid view: a card per holding, ticked from the same selection as the
 *  table. The row has no kebab, so the card has none. */
function HoldingGrid({ rows, sel, resetKey }: { rows: HoldingCard[]; sel: HoldingSelection; resetKey: string }) {
  const paged = usePaged(rows, { resetKey, storeKey: 'pattadar.grid.holdings' });
  return (
    <>
      <div className={`cards${sel.picked.length > 0 ? ' selecting' : ''}`}>
        {paged.shown.map((c) => {
          const on = sel.selected.has(c.id);
          return (
            <div key={c.id} className={`rec groupcard holdingcard${on ? ' selected' : ''}`}>
              <div className="meat">
                <div className="groupcard-top">
                  <span className="sel">
                    <input type="checkbox" checked={on} aria-label={`Select ${c.name}`}
                           onChange={() => sel.toggle(c.id)} />
                  </span>
                  <span className="groupcard-title">
                    <h3>
                      <Link to={`/holdings/${c.id}`} className="recgo" title={c.name}>
                        {c.name}
                        <span aria-hidden className="groupcard-hit" />
                      </Link>
                    </h3>
                    <span className="note">{c.placeLine || '—'}</span>
                  </span>
                </div>
                {!c.isComplete && (
                  <span className="row tight" style={{ flexWrap: 'wrap' }}>
                    <Pill kind="disputed">Incomplete</Pill>
                  </span>
                )}
                <dl className="groupcard-facts">
                  <div><dt>Properties</dt><dd className="num">{num(c.memberCount)}</dd></div>
                  <div><dt>With boundary</dt><dd className="num">{`${num(c.surveyedCount)} of ${num(c.memberCount)}`}</dd></div>
                  <div><dt>Extent</dt><dd className="num">{extentTotal(units(c))}</dd></div>
                  <div><dt>Market estimate</dt><dd className="num">{inrOr(c.marketValue)}</dd></div>
                </dl>
              </div>
            </div>
          );
        })}
      </div>
      <TablePager {...paged} onSize={paged.setSize} label={`${HOLDING_WORD.many} pages`} />
    </>
  );
}

export function Holdings() {
  const { data, isLoading, error } = useHoldings();
  const [params, setParams] = useSearchParams();
  const [sortKey, setSortKey] = useState<HoldingSortKey>('newest');
  const toast = useToast();
  // Table is this page's default; ?view=grid is the card view (design.md § Tables).
  const view = params.get('view') === 'grid' ? 'grid' : 'table';
  const setView = (v: 'grid' | 'table') => {
    const next = new URLSearchParams(params);
    if (v === 'grid') next.set('view', 'grid'); else next.delete('view');
    setParams(next, { replace: true });
  };

  const selected = Object.fromEntries(
    FACETS.map((g) => [g, params.getAll(HOLDING_PARAM[g])]),
  ) as Record<HoldingFacet, string[]>;

  const toggle = (group: string, key: string) => {
    const p = HOLDING_PARAM[group as HoldingFacet];
    if (!p) return;
    const next = new URLSearchParams(params);
    const have = next.getAll(p);
    next.delete(p);
    (have.includes(key) ? have.filter((v) => v !== key) : [...have, key])
      .forEach((v) => next.append(p, v));
    setParams(next, { replace: true });
  };

  const clearAll = () => {
    const next = new URLSearchParams(params);
    FACETS.forEach((g) => next.delete(HOLDING_PARAM[g]));
    setParams(next, { replace: true });
  };

  // An account with no holdings, as opposed to a filter that matched
  // none. Export, New, the filter row and the sort chip are all furniture over
  // nothing, and the one thing to do is the Empty state's own button.
  const virgin = !!data && data.length === 0;
  const shown = data ? sortHoldings(data.filter((c) => matchesHolding(c, selected)), sortKey) : [];
  const narrowKey = FACETS.map((g) => selected[g].join(',')).join('|');
  const paged = usePaged(shown, {
    resetKey: `${sortKey}|${narrowKey}`,
    storeKey: 'pattadar.table.holdings',
  });
  // Ticked rows survive sort and paging; a filter change drops them.
  const sel = useRowSelection(shown, idOf, narrowKey);
  // The footer sums the ticked rows when there are any, like a spreadsheet's status bar.
  const foot = sel.picked.length > 0 ? sel.picked : shown;
  const sum = (f: (c: HoldingCard) => number) => foot.reduce((n, c) => n + f(c), 0);
  const sortLabel = HOLDING_SORTS.find((s) => s.key === sortKey)?.label ?? '';

  const exportCsv = (list: readonly HoldingCard[] = shown) => {
    try {
      downloadCsv(`${many.replace(/\s+/g, '-')}-${new Date().toISOString().slice(0, 10)}.csv`,
        holdingCsvRows(list));
    } catch (e) {
      toast.bad('The export did not download. Try again.', e);
    }
  };

  /** The head's commands (design.md § Page head): Export outlined, "New
   *  holding" filled and rightmost. None on a first-run empty account: the
   *  Empty state's own button is the one thing to do. */
  const headActions: HeadActions | undefined = !data || virgin ? undefined : {
    secondaries: [{
      label: 'Export', icon: <FileDownloadOutlined sx={{ fontSize: 16 }} />,
      onClick: () => exportCsv(), disabled: shown.length === 0,
    }],
    primary: {
      label: `New ${HOLDING_WORD.one.toLowerCase()}`, icon: <AddOutlined sx={{ fontSize: 17 }} />,
      to: '/properties?combine=1',
    },
  };

  return (
    <div className="onecol">
      <main>
        <PageHead
          title={HOLDING_WORD.many}
          info="Made on Properties: select 2 or more and choose Combine. Each property stays separate, with its own documents and its own holder."
          actions={headActions}
          // The totals of every holding. What the filter lets through is the
          // band's "x of y shown", so the count is not told twice.
          summary={isLoading
            ? <Sk w="18rem" h="1rem" r="var(--radius-xs)" />
            : data && !virgin ? holdingSummary(data) : undefined}
        />

        {data && !virgin && (
          <FacetFilter
            groups={holdingFacets(data)}
            selected={selected}
            onToggle={toggle}
            onClear={clearAll}
            tally={`${shown.length} of ${data.length} shown`}
            ariaLabel="Narrow the holdings list"
            view={<ViewToggle views={['grid', 'table']} value={view} onChange={setView} />}
            sort={(
              <SortCycle
                label={sortLabel}
                onNext={() => {
                  const at = HOLDING_SORTS.findIndex((s) => s.key === sortKey);
                  setSortKey(HOLDING_SORTS[(at + 1) % HOLDING_SORTS.length].key);
                }}
              />
            )}
          />
        )}

        {/* The shape of the view that is coming (design.md § Loading). */}
        {isLoading && (view === 'grid'
          ? <SkGrid label="Loading the holdings list" facts={4} />
          : <SkTable label="Loading the holdings list" minWidth="52rem"
                     cols={[{ head: 'Name' }, { head: 'Properties', right: true, w: '2rem' }, { head: 'Place' },
                       { head: 'With boundary', right: true, w: '3rem' }, { head: 'Extent', right: true, w: '4rem' },
                       { head: 'Market estimate', right: true, w: '4rem' }]} />)}
        {!isLoading && !data && <Failed what="The holdings list" error={error} boxed h="18rem" />}

        {virgin && (
          <Empty
            boxed h="20rem" icon="parcel" title={`No ${many} yet`}
            action={
              <Link className="btn primary" to="/properties?combine=1">Go to Properties</Link>
            }
          >
            On Properties, select 2 or more and choose Combine to make a holding. Each property stays separate.
          </Empty>
        )}

        {/* Filtered to nothing: the same panel and remedy Properties offers. */}
        {data && !virgin && shown.length === 0 && (
          <div className="emptypanel">
            <h3>{`No ${many} match these filters`}</h3>
            <p className="note" style={{ maxWidth: '26rem' }}>{filteredEmptyNote(data.length)}</p>
            <button type="button" className="btn" onClick={clearAll}>Clear all</button>
          </div>
        )}

        {shown.length > 0 && view === 'grid' && (
          <HoldingGrid rows={shown} sel={sel} resetKey={`${sortKey}|${narrowKey}`} />
        )}

        {shown.length > 0 && view === 'table' && (
          <>
          <Card flush className="scroll-x edgefade">
            <table className="rectable" aria-label={HOLDING_WORD.many} style={{ minWidth: '52rem' }}>
              <thead>
                <tr>
                  <th className="selcol">
                    <SelectAllBox total={shown.length} picked={sel.picked.length} noun={noun}
                                  onToggle={sel.toggleAll} />
                  </th>
                  <th>Name</th>
                  <th className="right">Properties</th>
                  <th>Place</th>
                  <th className="right">With boundary</th>
                  <th className="right">Extent</th>
                  <th className="right">Market estimate</th>
                </tr>
              </thead>
              <tbody>
                {paged.shown.map((c) => (
                  <tr key={c.id} className={sel.selected.has(c.id) ? 'selected' : undefined}>
                    <SelectCell checked={sel.selected.has(c.id)} label={`Select ${c.name}`}
                                onToggle={() => sel.toggle(c.id)} />
                    <td>
                      <Link to={`/holdings/${c.id}`} className="accent"
                            style={{ textDecoration: 'none', fontWeight: 700 }}>
                        {c.name}
                      </Link>
                      {/* A holding that has lost a member says so here rather than
                          only on its own page: the list is where somebody would notice. */}
                      {!c.isComplete && <> <Pill kind="disputed">Incomplete</Pill></>}
                      {c.note && <small className="note" style={{ display: 'block' }}>{c.note}</small>}
                    </td>
                    <td className="right num">{num(c.memberCount)}</td>
                    <td className="muted">{c.placeLine || '—'}</td>
                    <td className="right num">{`${num(c.surveyedCount)} of ${num(c.memberCount)}`}</td>
                    <td className="right num">{extentTotal(units(c))}</td>
                    <td className="right num">{inrOr(c.marketValue)}</td>
                  </tr>
                ))}
              </tbody>
              {/* The ticked rows, or else every row the filter lets through — not just this page. */}
              <tfoot>
                <tr>
                  <td className="selcol" />
                  <th scope="row">{sel.picked.length > 0
                    ? `${plural(sel.picked.length, noun[0], noun[1])} selected`
                    : `Total · ${plural(shown.length, noun[0], noun[1])}`}</th>
                  <td className="right num">{num(sum((c) => c.memberCount))}</td>
                  <td />
                  <td className="right num">{`${num(sum((c) => c.surveyedCount))} of ${num(sum((c) => c.memberCount))}`}</td>
                  <td className="right num">{extentTotal(foot.flatMap(units))}</td>
                  <td className="right num">{inrOr(sum((c) => c.marketValue))}</td>
                </tr>
              </tfoot>
            </table>
          </Card>
          <TablePager {...paged} onSize={paged.setSize} label={`${HOLDING_WORD.many} pages`} />
          </>
        )}

        {/* Ticking covers every holding the filter lets through, in either view. */}
        {shown.length > 0 && (
          <SelectionBar count={sel.picked.length} noun={noun} label={`Act on the selected ${many}`}
                        onClear={sel.clear}>
            <button type="button" className="btn sm" onClick={() => exportCsv(sel.picked)}>
              <FileDownloadOutlined sx={{ fontSize: 15 }} /> Export
            </button>
          </SelectionBar>
        )}
      </main>
    </div>
  );
}

export default Holdings;
