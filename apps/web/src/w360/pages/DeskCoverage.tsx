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
import { useMemo, useState } from 'react';
import { Link } from 'react-router';

import { useCoverage, useDisciplines } from '../api';
import type { CoverageCell } from '../api';
import { Empty, Failed, Loading, PageHead, Tag, plural } from '../ui';

/** The three grains worth looking at the portfolio through. Village is where
 *  a surveyor actually works, mandal is where a writer does, and district is
 *  the widest thing that still means something to somebody being asked to
 *  travel. `state` is not offered: a column of "all of Telangana" would be one
 *  square per discipline and answers nothing. */
const GRAINS: { key: string; word: string }[] = [
  { key: 'village', word: 'Village' },
  { key: 'mandal', word: 'Mandal' },
  { key: 'district', word: 'District' },
];

export function DeskCoverage() {
  const [level, setLevel] = useState('mandal');
  const { data, isLoading, error } = useCoverage(level);
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
    const by = new Map<string, { name: string; records: number; cells: CoverageCell[] }>();
    for (const c of cells) {
      const at = by.get(c.name);
      if (at) { at.cells.push(c); at.records = Math.max(at.records, c.records); }
      else by.set(c.name, { name: c.name, records: c.records, cells: [c] });
    }
    return [...by.values()].sort(
      (a, b) => b.records - a.records || a.name.localeCompare(b.name),
    );
  }, [cells]);

  const at = (row: { cells: CoverageCell[] }, discipline: string) =>
    row.cells.find((c) => c.discipline === discipline);

  /** Nobody at all, anywhere. The cold-start case, and it gets its own sentence
   *  rather than 90 amber squares. */
  const bare = cells.length > 0 && cells.every((c) => c.activeCount === 0);
  const orphans = places.filter((p) => p.cells.every((c) => c.activeCount === 0));

  return (
    <main>
      <PageHead eyebrow="Pattadar desk" title="Who covers what">
        <p className="lede" style={{ marginTop: '0.375rem' }}>
          Every place we hold land, against every kind of work. A zero is a service we
          can sell there and nobody to do it.
        </p>
      </PageHead>

      {isLoading ? <Loading h="18rem" what="the coverage grid" />
        : !data ? <Failed what="The coverage grid" error={error} boxed h="18rem" />
          : cells.length === 0 ? (
            <Empty boxed h="18rem" icon="map" title="No records to cover yet.">
              The grid fills in as land is added.
            </Empty>
          ) : (
            <>
              <div className="row between" style={{ marginBottom: 'var(--space-sm)' }}>
                <div className="segmented" role="group" aria-label="How finely to cut the grid">
                  {GRAINS.map((g) => (
                    <button
                      key={g.key} type="button" aria-pressed={level === g.key}
                      onClick={() => setLevel(g.key)}
                    >
                      {g.word}
                    </button>
                  ))}
                </div>
                <span className="tally">
                  {plural(places.length, 'place')} · {plural(cols.length, 'kind')} of work
                </span>
              </div>

              {bare && (
                <p className="note" style={{ marginBottom: 'var(--space-sm)' }}>
                  You hold land in {plural(places.length, 'place')} and nobody is enrolled
                  for any of it. Every order will land on this desk.
                </p>
              )}

              {/* Its own scroller. Nine disciplines plus a place and a sentence
                  is wider than a phone whatever is done to it, and the page
                  body must never be the thing that scrolls sideways. */}
              <div className="card scroll-x" style={{ padding: 0 }}>
                <table className="rectable" style={{ minWidth: '52rem' }}>
                  <thead>
                    <tr>
                      <th>Place</th>
                      {cols.map((c) => <th key={c.key}>{c.label}</th>)}
                      <th>Where the gap is</th>
                    </tr>
                  </thead>
                  <tbody>
                    {places.map((p) => {
                      const gaps = p.cells.filter((c) => c.activeCount === 0 && c.openJobs > 0);
                      return (
                        <tr key={p.name}>
                          <td><strong>{p.name}</strong></td>
                          {cols.map((c) => {
                            const cell = at(p, c.key);
                            const n = cell?.activeCount ?? 0;
                            const waiting = (cell?.openJobs ?? 0) > 0;
                            return (
                              <td key={c.key}>
                                {n === 0
                                  ? (waiting
                                    ? <Tag alert>0</Tag>
                                    : <span className="muted" aria-label="Nobody, and nothing waiting">—</span>)
                                  : (cell && Boolean(cell.risk)
                                    ? <Tag alert>{n}</Tag>
                                    : <span className="num">{n}</span>)}
                              </td>
                            );
                          })}
                          <td className="muted">
                            {gaps.length > 0
                              ? `No ${gaps.map((g) => g.disciplineLabel.toLowerCase()).join(', no ')}. `
                              : ''}
                            {plural(p.records, 'record')} here.
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="row" style={{ marginTop: 'var(--space-md)', alignItems: 'flex-start' }}>
                <p className="note" style={{ maxWidth: '38rem', margin: 0 }}>
                  {orphans.length > 0
                    ? `${plural(orphans.length, 'place')} ${orphans.length === 1 ? 'has' : 'have'} `
                      + 'land and nobody to work on it. Enrol somebody, or widen an existing '
                      + 'associate’s area — an advocate needs no local presence at all.'
                    : 'Every place here has somebody for at least one kind of work. Widening an '
                      + 'existing associate’s area is usually faster than finding a new person.'}
                </p>
                <Link className="btn primary" to="/app/desk/enrol">Add somebody</Link>
              </div>
            </>
          )}
    </main>
  );
}
