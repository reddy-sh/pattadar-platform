/** Holdings — the list (route `/app/holdings`; the GraphQL fields keep `combined`).
 *
 *  A holding is several properties an owner holds as one piece of ground:
 *  thirty acres and thirty acres, two khatas, one fence. The list wears the
 *  same page chrome as Properties — PageHead with a summary line and the head
 *  actions, then FacetFilter with its "N of M shown" count and the SortCycle
 *  chip — because the owner reported (03/10/2026) that a thinner page read as
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
 *  Still absent, on purpose:
 *   · a Grid/List/Map toggle. A map needs each row's geometry, which the list
 *     query does not carry (it lives in the per-view `combinedFmb` query, one
 *     round trip per row), and there is no holding card for a grid. A toggle
 *     with one working option is furniture.
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
import { useToast } from '../Toast';
import {
  Empty, FacetFilter, Failed, HOLDING_WORD, Icon, PageHead, Pill, SortCycle,
  downloadCsv, inrOr, num, plural,
} from '../ui';
import { Sk } from '../skeletons';

/** Acres, plot yards and built square feet in one line — and only the ones this
 *  view actually has. They are never added together: a line reading
 *  "61,450" over land and slab would be a number that measures nothing. */
function ExtentLine({ farm, plot, built }: { farm: number; plot: number; built: number }) {
  const bits = [
    farm > 0 && `${num(farm, 2)} ac`,
    plot > 0 && `${num(plot)} Sq.yd`,
    built > 0 && `${num(built)} Sq.ft built`,
  ].filter(Boolean) as string[];
  return <span className="num">{bits.join(' · ') || 'No extent recorded'}</span>;
}

const FACETS = Object.keys(HOLDING_PARAM) as HoldingFacet[];
const many = HOLDING_WORD.many.toLowerCase();

export function Holdings() {
  const { data, isLoading, error } = useHoldings();
  const [params, setParams] = useSearchParams();
  const [sortKey, setSortKey] = useState<HoldingSortKey>('newest');
  const toast = useToast();

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
  const sortLabel = HOLDING_SORTS.find((s) => s.key === sortKey)?.label ?? '';

  const exportCsv = () => {
    try {
      downloadCsv(`${many.replace(/\s+/g, '-')}-${new Date().toISOString().slice(0, 10)}.csv`,
        holdingCsvRows(shown));
    } catch (e) {
      toast.bad('The export did not download. Try again.', e);
    }
  };

  return (
    <div className="onecol">
      <main>
        <PageHead
          eyebrow={HOLDING_WORD.eyebrow}
          title={HOLDING_WORD.many}
          info="Made on Properties: select 2 or more and choose Combine. Official records stay separate."
          actions={
            !data || virgin ? undefined : (
              <>
                <button type="button" className="btn" onClick={exportCsv} disabled={shown.length === 0}>
                  <FileDownloadOutlined sx={{ fontSize: 16 }} /> Export
                </button>
                <Link className="btn primary" to="/app/properties?combine=1">
                  <AddOutlined sx={{ fontSize: 17 }} /> New {HOLDING_WORD.one.toLowerCase()}
                </Link>
              </>
            )
          }
        >
          {data && !virgin && (
            <p className="note num" style={{ marginTop: '0.375rem' }}>{holdingSummary(shown)}</p>
          )}
          {isLoading && <Sk w="18rem" h="1rem" r="var(--radius-xs)" />}
        </PageHead>

        {data && !virgin && (
          <FacetFilter
            groups={holdingFacets(data)}
            selected={selected}
            onToggle={toggle}
            onClear={clearAll}
            tally={`${shown.length} of ${data.length} shown`}
            ariaLabel="Narrow the holdings list"
            trailing={(
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

        {isLoading && <Sk w="100%" h="8rem" r="var(--radius-md)" />}
        {!isLoading && !data && <Failed what="The holdings list" error={error} boxed h="18rem" />}

        {virgin && (
          <Empty
            boxed h="20rem" icon="parcel" title={`No ${many} yet`}
            action={
              <Link className="btn primary" to="/app/properties?combine=1">Go to Properties</Link>
            }
          >
            On Properties, select 2 or more and choose Combine to make a holding. Official records stay separate.
          </Empty>
        )}

        {/* Filtered to nothing: the same panel and remedy Properties offers. */}
        {data && !virgin && shown.length === 0 && (
          <div className="emptypanel">
            <h3>{`No ${many} match these filters`}</h3>
            <p className="note" style={{ maxWidth: '26rem' }}>{filteredEmptyNote(data.length)}</p>
            <button type="button" className="btn" onClick={clearAll}>Clear filters</button>
          </div>
        )}

        {shown.length > 0 && (
          <div className="rows boxed card" style={{ padding: 0 }}>
            {shown.map((c) => (
              <div className="row" key={c.id}>
                <span className="grow">
                  <Link to={`/app/holdings/${c.id}`} className="accent"
                        style={{ textDecoration: 'none', fontWeight: 700 }}>
                    {c.name}
                  </Link>
                  <small className="note" style={{ display: 'block' }}>
                    {[
                      plural(c.memberCount, 'record'),
                      c.placeLine,
                      `${c.surveyedCount} of ${c.memberCount} with boundaries`,
                    ].filter(Boolean).join(' · ')}
                  </small>
                  {c.note && <small className="note" style={{ display: 'block' }}>{c.note}</small>}
                </span>
                {/* A holding that has lost a member says so here rather than only
                    on its own page: the list is where somebody would notice. */}
                {!c.isComplete && <Pill kind="disputed">Missing a record</Pill>}
                <ExtentLine farm={c.farmExtent} plot={c.plotExtent} built={c.builtExtent} />
                <span className="num">{inrOr(c.marketValue)}</span>
                <Link className="btn sm" to={`/app/holdings/${c.id}`}>
                  <Icon name="parcel" size={15} /> Open
                </Link>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

export default Holdings;
