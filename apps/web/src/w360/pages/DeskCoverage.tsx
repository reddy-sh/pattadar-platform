/** Every place Pattadar holds land, against every kind of work — and where the
 *  two do not meet.
 *
 *  This is the one screen that answers "what can we sell where", and it answers
 *  it by subtraction: a zero in a square is a service somebody can order today
 *  that nobody on the roster can do. That is not an abstraction. An order
 *  placed into an empty square becomes a job that ages on the desk until a
 *  human notices it, and the owner's only experience of it is silence.
 *
 *  The grid distinguishes a PROBLEM from a FACT, and the difference is one
 *  column of this table: a zero with a live job behind it is amber, and a zero
 *  with nothing waiting is a muted dash. Painting all of them red would make a
 *  screen that is mostly red on day one and that nobody looks at by week two.
 *
 *  Cold start is the normal case for months: records exist, associates do not,
 *  and every square is a dash. That is not an error state and it does not get a
 *  wall of amber — it gets one sentence above the grid saying exactly what it
 *  means, which is that every order will land on this desk by hand.
 */
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router';
import ChevronRightOutlined from '@mui/icons-material/ChevronRightOutlined';
import FileDownloadOutlined from '@mui/icons-material/FileDownloadOutlined';

import { useCoverage, useCoverageAssociates, useDisciplines } from '../api';
import type { CoverageAssociate, CoverageCell } from '../api';
import {
  Card, Chip, Empty, Failed, PageHead, SelectAllBox, SelectCell, SelectionBar, State, TablePager, Tag,
  downloadCsv, num, plural, usePaged, useRowSelection,
} from '../ui';
import { SkRows, SkTable, Sk } from '../skeletons';
import { SectionHead } from './RecordHead';

type Scope = { key: string; name: string };
type PlaceRow = {
  scopeKey: string; name: string; records: number; cells: CoverageCell[];
  stateKey: string; stateName: string; districtKey: string; districtName: string;
  mandalKey: string; mandalName: string;
};

const placeId = (p: PlaceRow) => p.scopeKey;

/** The last column's sentence: which squares have work waiting and nobody to do it. */
function gapText(p: PlaceRow) {
  const gaps = p.cells.filter((c) => c.activeCount === 0 && c.openJobs > 0);
  return `${gaps.length > 0 ? `No ${gaps.map((g) => g.disciplineLabel.toLowerCase()).join(', no ')}. ` : ''}${plural(p.records, 'record')} here.`;
}

function AssociateRows({ people, village }: {
  people: CoverageAssociate[]; village: Scope;
}) {
  if (people.length === 0) {
    return (
      <Empty
        boxed h="16rem" icon="person" title={`Nobody is available in ${village.name}`}
        action={<Link className="btn primary" to="/desk/enrol">Add a member</Link>}
      />
    );
  }
  return (
    <div className="card" style={{ padding: 0 }}>
      <div className="rows boxed">
        {people.map((person) => {
          const work = person.disciplines
            .filter((discipline) => discipline.state === 'on')
            .map((discipline) => discipline.label);
          return (
            <div key={person.id}>
              <span className="avatarlg">{person.initials}</span>
              <span className="grow">
                <span className="row tight">
                  <strong>{person.name}</strong>
                  <State state={person.stateState}>{person.stateWord}</State>
                </span>
                <span className="note" style={{ display: 'block', marginTop: '0.25rem' }}>
                  {[person.firm, work.join(' · ')].filter(Boolean).join(' · ')}
                </span>
                {person.areas.length > 0 && (
                  <span className="note" style={{ display: 'block', marginTop: '0.125rem' }}>
                    {person.areas.map((area) => area.label).join(' · ')}
                  </span>
                )}
              </span>
              <span style={{ textAlign: 'right', flex: 'none' }}>
                <span className="num" style={{ display: 'block' }}>{person.jobsOpen}</span>
                <span className="note" style={{ display: 'block' }}>
                  {person.jobsOpen === 1 ? 'job in hand' : 'jobs in hand'}
                </span>
              </span>
              <Link className="btn sm" to={`/admin/members/${person.id}`}>Open</Link>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function DeskCoverage() {
  const [stateScope, setStateScope] = useState<Scope | null>(null);
  const [districtScope, setDistrictScope] = useState<Scope | null>(null);
  const [villageScope, setVillageScope] = useState<Scope | null>(null);
  const level = !stateScope ? 'state' : !districtScope ? 'district' : 'village';
  const { data, isLoading, error, isPlaceholderData: stale } = useCoverage(
    level, stateScope?.key ?? '', districtScope?.key ?? '',
  );
  const people = useCoverageAssociates(villageScope?.key ?? '');
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);
  // Pure, no database, and cached for the whole session — it is here only so
  // the nine columns come out in the order the catalogue names them (deepest
  // supply first) rather than in whatever order the rows happened to arrive.
  const catalogue = useDisciplines();

  const cells = useMemo(() => data ?? [], [data]);

  /** The columns: every discipline the server actually sent a square for, in
   *  the catalogue's order. A discipline nobody could ever be asked for in any
   *  of these places is a column of dashes and nine of those is a table that
   *  cannot be read across. */
  const cols = useMemo(() => {
    const seen = new Map<string, string>();
    for (const c of cells) if (!seen.has(c.discipline)) seen.set(c.discipline, c.disciplineLabel);
    const canon = catalogue.data ?? [];
    const known = canon.filter((d) => seen.has(d.key)).map((d) => ({ key: d.key, label: d.label }));
    // Anything the server sent that the catalogue does not know about still
    // gets a column. A square silently dropped because a name changed is the
    // one failure this screen must not have.
    const rest = [...seen.entries()]
      .filter(([k]) => !canon.some((d) => d.key === k))
      .map(([key, label]) => ({ key, label }))
      .sort((a, b) => a.label.localeCompare(b.label));
    return [...known, ...rest];
  }, [cells, catalogue.data]);

  /** The rows: the places records are actually held in, most land first. */
  const places = useMemo(() => {
    const by = new Map<string, PlaceRow>();
    for (const c of cells) {
      const at = by.get(c.scopeKey);
      if (at) { at.cells.push(c); at.records = Math.max(at.records, c.records); }
      else by.set(c.scopeKey, {
        scopeKey: c.scopeKey, name: c.name, records: c.records, cells: [c],
        stateKey: c.stateKey, stateName: c.stateName,
        districtKey: c.districtKey, districtName: c.districtName,
        mandalKey: c.mandalKey, mandalName: c.mandalName,
      });
    }
    return [...by.values()].sort(
      (a, b) => b.records - a.records || a.name.localeCompare(b.name),
    );
  }, [cells]);

  const at = (row: { cells: CoverageCell[] }, discipline: string) =>
    row.cells.find((c) => c.discipline === discipline);

  // Places per level run from ten to sixty; the page goes back to 1 whenever
  // the level or the place drilled into changes.
  const scopeKey = `${level}|${stateScope?.key ?? ''}|${districtScope?.key ?? ''}`;
  const paged = usePaged(places, { resetKey: scopeKey, storeKey: 'pattadar.table.coverage' });
  // Ticking places turns the footer into their sum; drilling to another level drops it.
  const sel = useRowSelection(places, placeId, scopeKey);
  const summed = sel.picked.length > 0 ? sel.picked : places;
  // The footer adds up every place at this level (or the ticked ones), not just
  // the page. A member who covers two places counts in both, as the squares do.
  const colSum = (key: string) => summed.reduce((n, p) => n + (at(p, key)?.activeCount ?? 0), 0);
  const recordSum = summed.reduce((n, p) => n + p.records, 0);
  const exportCsv = (rows: PlaceRow[]) => downloadCsv('provider-coverage.csv', [
    [levelWord, ...cols.map((c) => c.label), 'Where the gap is'],
    ...rows.map((p) => [p.name, ...cols.map((c) => at(p, c.key)?.activeCount ?? 0), gapText(p)]),
  ]);

  /** Nobody at all, anywhere. The cold-start case, and it gets its own sentence
   *  rather than 90 amber squares. */
  const bare = cells.length > 0 && cells.every((c) => c.activeCount === 0);
  const orphans = places.filter((p) => p.cells.every((c) => c.activeCount === 0));
  const levelWord = level === 'state' ? 'State' : level === 'district' ? 'District' : 'Village';
  const context = districtScope?.name || stateScope?.name || 'all states';
  const tally = villageScope
    ? plural(people.data?.length ?? 0, 'member')
    : `${plural(places.length, level)} · ${plural(cols.length, 'kind')} of work`;

  const choose = (place: PlaceRow) => {
    if (level === 'state') {
      setStateScope({ key: place.stateKey, name: place.stateName });
      setDistrictScope(null);
      setVillageScope(null);
    } else if (level === 'district') {
      setDistrictScope({ key: place.districtKey, name: place.districtName });
      setVillageScope(null);
    } else {
      setVillageScope({ key: place.scopeKey, name: place.name });
    }
  };

  const allStates = () => {
    setStateScope(null);
    setDistrictScope(null);
    setVillageScope(null);
  };

  return (
    <main>
      <PageHead
        crumbs={[{ label: 'Pattadar desk', to: '/desk' }, { label: 'Provider coverage' }]}
        title="Provider coverage"
      />

      {isLoading ? (
        // First read only: drilling keeps the last level on screen, dimmed.
        <>
          <div className="row between coverage-controls" aria-hidden style={{ marginBottom: 'var(--space-sm)' }}>
            <Sk w="5.5rem" h="2rem" r="var(--radius-pill)" style={{ flex: 'none' }} />
            <Sk w="9rem" style={{ flex: 'none' }} />
          </div>
          <SectionHead title={`${levelWord}s`}
                       actions={{ primary: { label: 'Add a member', to: '/desk/enrol' } }} />
          <SkTable
            label="Loading the coverage grid" minWidth="52rem"
            cols={[
              { head: levelWord },
              ...(catalogue.data ?? []).map((d) => ({ head: d.label, right: true, w: '1.25rem' })),
              { head: 'Where the gap is', w: '80%' },
            ]}
          />
        </>
      )
        : !data ? <Failed what="The coverage grid" error={error} boxed h="18rem" />
          : cells.length === 0 ? (
            <Empty boxed h="18rem" icon="map" title="No properties to cover yet" />
          ) : (
            <>
              <div className="row between coverage-controls" style={{ marginBottom: 'var(--space-sm)' }}>
                <div className="row tight coverage-path" role="group" aria-label="Coverage location">
                  <Chip active={!stateScope} onClick={allStates}>All states</Chip>
                  {stateScope && (
                    <Chip
                      active={!districtScope}
                      onClick={() => { setDistrictScope(null); setVillageScope(null); }}
                    >
                      {stateScope.name}
                    </Chip>
                  )}
                  {districtScope && (
                    <Chip active={!villageScope} onClick={() => setVillageScope(null)}>
                      {districtScope.name}
                    </Chip>
                  )}
                  {villageScope && <Chip active>{villageScope.name}</Chip>}
                </div>
                <span className="tally">{tally}</span>
              </div>

              {villageScope ? (
                <section>
                  <SectionHead title={`People who can serve ${villageScope.name}`} />
                  {people.isLoading ? <SkRows rows={4} label={`Loading the members who can serve ${villageScope.name}`} />
                    : !people.data ? (
                      <Failed what="Available members" error={people.error} boxed h="14rem" />
                    ) : <AssociateRows people={people.data} village={villageScope} />}
                </section>
              ) : (
                <>
                  {/* The band already counts the places; the sub says where nobody works. */}
                  <SectionHead
                    title={`${levelWord}s`}
                    sub={bare ? `Nobody enrolled across ${context}`
                      : orphans.length > 0 ? `${plural(orphans.length, level)} with nobody to work on it`
                        : undefined}
                    actions={{ primary: { label: 'Add a member', to: '/desk/enrol' } }}
                  />
                  {/* Its own scroller. Ten disciplines plus a location and a sentence
                      is wider than a phone whatever is done to it. */}
                  <div aria-busy={stale}
                       style={{ opacity: stale ? 0.6 : 1, pointerEvents: stale ? 'none' : undefined,
                         transition: 'opacity var(--dur-fast) var(--ease-out)' }}>
                  <Card flush className="scroll-x edgefade">
                    <table className="rectable" aria-label={`${levelWord}s`} style={{ minWidth: '52rem' }}>
                      <thead>
                        <tr>
                          <th className="selcol">
                            <SelectAllBox total={places.length} picked={sel.picked.length}
                                          noun={[level, `${level}s`]} onToggle={sel.toggleAll} />
                          </th>
                          <th>{levelWord}</th>
                          {cols.map((c) => <th key={c.key} className="right">{c.label}</th>)}
                          <th>Where the gap is</th>
                        </tr>
                      </thead>
                      <tbody>
                        {paged.shown.map((p) => {
                          return (
                            <tr key={p.scopeKey} className={sel.selected.has(p.scopeKey) ? 'selected' : undefined}>
                              <SelectCell checked={sel.selected.has(p.scopeKey)} label={`Select ${p.name}`}
                                          onToggle={() => sel.toggle(p.scopeKey)} />
                              <td>
                                <button type="button" className="linkbtn coverage-place" onClick={() => choose(p)}>
                                  <strong>{p.name}</strong>
                                  <ChevronRightOutlined sx={{ fontSize: 16 }} />
                                </button>
                              </td>
                              {cols.map((c) => {
                                const cell = at(p, c.key);
                                const n = cell?.activeCount ?? 0;
                                const waiting = (cell?.openJobs ?? 0) > 0;
                                return (
                                  <td key={c.key} className="right num">
                                    {n === 0
                                      ? (waiting
                                        ? <Tag alert>0</Tag>
                                        : <span className="muted" aria-label="Nobody, and nothing waiting">—</span>)
                                      : <span className="num">{n}</span>}
                                  </td>
                                );
                              })}
                              <td className="muted">{gapText(p)}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                      <tfoot>
                        <tr>
                          <td className="selcol" />
                          <th scope="row">
                            {sel.picked.length > 0
                              ? `${plural(sel.picked.length, level)} selected`
                              : `Total · ${plural(places.length, level)}`}
                          </th>
                          {cols.map((c) => <td key={c.key} className="right num">{num(colSum(c.key))}</td>)}
                          <td className="muted">{plural(recordSum, 'record')}</td>
                        </tr>
                      </tfoot>
                    </table>
                  </Card>
                  <TablePager {...paged} onSize={paged.setSize} label={`${levelWord}s pages`} />
                  </div>
                  <SelectionBar count={sel.picked.length} noun={[level, `${level}s`]}
                                label={`Act on the selected ${level}s`} onClear={sel.clear}>
                    <button type="button" className="btn sm" disabled={stale} onClick={() => exportCsv(sel.picked)}>
                      <FileDownloadOutlined sx={{ fontSize: 15 }} /> Export
                    </button>
                  </SelectionBar>
                </>
              )}
            </>
          )}
    </main>
  );
}
