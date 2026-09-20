/** The Pattadar desk's roster — everybody who takes jobs.
 *
 *  Deliberately NOT a phone book. Every other roster screen ever built puts
 *  the number on the row, and the first screenshot of it that leaves a laptop
 *  hands a stranger every surveyor and advocate Pattadar works with. The
 *  number lives one click away on the person's own page, masked until somebody
 *  asks for it — an act, with a name attached — and nothing on this list can
 *  be read off over a shoulder. What a list is FOR is answering "who have we
 *  got, where, and can they take another job", and none of those questions
 *  needs a number.
 *
 *  The whole roster is read once and narrowed in the browser. Two reasons, and
 *  both matter more than they look:
 *
 *   1. `associates` is one of the five resolvers in the API that reads across
 *      every owner, and each read writes a `desk_read` audit row. Bound to the
 *      search box that is one audit row per keystroke — an audit trail that
 *      nobody can read is the same as no audit trail.
 *   2. A chip that says how many people are behind it has to count the whole
 *      roster, not the filtered slice, and a screen that cannot tell "nobody
 *      is enrolled" from "nothing matches what you typed" prints the wrong
 *      sentence on the one day it matters most — the first day.
 *
 *  For months there will be zero associates, so that is the case this screen is
 *  built around: no filter bar, no chips, no search, no tally over an empty
 *  box. One sentence and the way to fix it.
 */
import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import SearchOutlined from '@mui/icons-material/SearchOutlined';

import { useAssociates } from '../api';
import type { Associate } from '../api';
import { Chip, Empty, Failed, Loading, PageHead, State, Tag, plural } from '../ui';

/** The four states `associates.STATES` spells, in the words the desk uses for
 *  them. The row's own word comes from the server (`stateWord`), so this map is
 *  only ever the filter's vocabulary — it never labels a person, and it cannot
 *  drift into disagreeing with one.
 *
 *  `invited` reads "Waiting on us" rather than "Invited" because that is what
 *  it actually means: somebody the desk wrote down and has not put on anything
 *  yet. The waiting is ours, not theirs. */
const STATE_CHIPS: { key: string; word: string }[] = [
  { key: 'active', word: 'Taking work' },
  { key: 'paused', word: 'Paused' },
  { key: 'blocked', word: 'Stopped' },
  { key: 'invited', word: 'Waiting on us' },
];

/** Everything about a person that a typed word could plausibly mean.
 *
 *  Searching only the name would be a worse control than no control: the
 *  operator opening this screen is far more often asking "who do we have in
 *  Peddapuram" or "who are the writers" than "where is G. Srinivas", and both
 *  of those are place and trade, not name. */
const haystack = (a: Associate): string => [
  a.name,
  a.firm,
  ...a.disciplines.map((d) => d.label),
  ...a.areas.map((x) => x.label || x.name),
].join(' ').toLowerCase();

/** The papers worth saying something about on a list row.
 *
 *  Only the ones inside 30 days or already gone. A licence with two years left
 *  is a fact about a person, not news, and a column of amber tags that never
 *  changes is a column nobody reads on the day one of them turns red. */
function paperAlerts(a: Associate) {
  return a.credentials.filter((c) => c.lapsed || c.expiring);
}

export function DeskAssociates() {
  // No arguments: the narrowing happens below, for the two reasons written at
  // the top of this file.
  const { data, isLoading, error } = useAssociates({});
  const [q, setQ] = useState('');
  const [discipline, setDiscipline] = useState('');
  const [state, setState] = useState('');
  const [readiness, setReadiness] = useState('');

  // Memoised on `data` so the three derivations below are not recomputed on
  // every keystroke: `data ?? []` is a fresh array identity each render, which
  // would make the dependency arrays lie.
  const all = useMemo(() => data ?? [], [data]);

  /** One chip per discipline SOMEBODY ACTUALLY DOES, commonest first.
   *
   *  Not one chip per discipline that exists. Nine chips over a roster of four
   *  people means five controls that narrow the list to nothing — dead
   *  controls wearing the same clothes as the live ones, which is the thing
   *  this module refuses to draw. */
  const discChips = useMemo(() => {
    const n = new Map<string, { label: string; count: number }>();
    for (const a of all) {
      for (const d of a.disciplines) {
        const at = n.get(d.key);
        if (at) at.count += 1;
        else n.set(d.key, { label: d.label, count: 1 });
      }
    }
    return [...n.entries()]
      .map(([key, v]) => ({ key, ...v }))
      .sort((x, y) => y.count - x.count || x.label.localeCompare(y.label));
  }, [all]);

  /** Same rule for the state chips: a roster where nobody is paused has no
   *  business offering a Paused filter. */
  const stateChips = useMemo(
    () => STATE_CHIPS
      .map((s) => ({ ...s, count: all.filter((a) => a.state === s.key).length }))
      .filter((s) => s.count > 0),
    [all],
  );

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return all.filter((a) => {
      if (discipline && !a.disciplines.some((d) => d.key === discipline)) return false;
      if (state && a.state !== state) return false;
      if (readiness === 'certified'
          && !a.disciplines.every((d) => ['verified', 'expiring'].includes(d.credentialState))) return false;
      if (readiness === 'training' && !['required', 'in_training'].includes(a.trainingState)) return false;
      if (readiness === 'working' && a.jobsOpen === 0) return false;
      if (readiness === 'low_rating' && !(a.ratingCount >= 100 && a.ratingAverage < 3)) return false;
      if (needle && !haystack(a).includes(needle)) return false;
      return true;
    });
  }, [all, q, discipline, state, readiness]);

  const narrowed = !!q.trim() || !!discipline || !!state || !!readiness;
  const clear = () => { setQ(''); setDiscipline(''); setState(''); setReadiness(''); };

  return (
    <main>
      <PageHead
        eyebrow="Administration"
        title="Company members"
        actions={<Link className="btn primary" to="/app/admin/members/enrol">Add somebody</Link>}
      >
        <p className="lede" style={{ marginTop: '0.375rem' }}>
          Surveyors, advocates, crews and other people who take company work.
          Certification, workload and service ratings stay together here.
        </p>
      </PageHead>

      {isLoading ? <Loading h="18rem" what="the roster" />
        : !data ? <Failed what="The roster" error={error} boxed h="18rem" />
        : all.length === 0 ? (
          <Empty
            boxed h="18rem" icon="person" title="Nobody works for Pattadar yet."
            action={(
              <Link className="btn primary" to="/app/admin/members/enrol">Add the first one</Link>
            )}
          >
            An associate is somebody who takes jobs — a surveyor, an advocate, a
            document writer. Add the people you already work with; they do not need
            an account.
          </Empty>
        ) : (
          <>
            <div className="filterbar">
              <span className="search" style={{ width: '15rem' }}>
                <SearchOutlined sx={{ fontSize: 16 }} aria-hidden />
                <input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Name, firm or place"
                  aria-label="Search the roster"
                />
              </span>
              {discChips.length > 0 && <span className="vrule" aria-hidden />}
              {discChips.map((d) => (
                <Chip
                  key={d.key} count={d.count} active={discipline === d.key}
                  onClick={() => setDiscipline((v) => (v === d.key ? '' : d.key))}
                >
                  {d.label}
                </Chip>
              ))}
              {stateChips.length > 1 && <span className="vrule" aria-hidden />}
              {/* One state chip over a roster that is all one state narrows
                  nothing — it is a control whose only outcome is the list you
                  are already looking at. */}
              {stateChips.length > 1 && stateChips.map((s) => (
                <Chip
                  key={s.key} count={s.count} active={state === s.key}
                  onClick={() => setState((v) => (v === s.key ? '' : s.key))}
                >
                  {s.word}
                </Chip>
              ))}
              <span className="vrule" aria-hidden />
              {[
                { key: 'certified', label: 'Certified', count: all.filter((a) => a.disciplines.every((d) => ['verified', 'expiring'].includes(d.credentialState))).length },
                { key: 'working', label: 'Working now', count: all.filter((a) => a.jobsOpen > 0).length },
                { key: 'training', label: 'Needs training', count: all.filter((a) => ['required', 'in_training'].includes(a.trainingState)).length },
                { key: 'low_rating', label: 'Below 3 after 100', count: all.filter((a) => a.ratingCount >= 100 && a.ratingAverage < 3).length },
              ].filter((item) => item.count > 0).map((item) => (
                <Chip key={item.key} count={item.count} active={readiness === item.key}
                      onClick={() => setReadiness((v) => (v === item.key ? '' : item.key))}>
                  {item.label}
                </Chip>
              ))}
              {narrowed && (
                <button type="button" className="clearall" onClick={clear}>Clear</button>
              )}
              <span className="tally" style={{ marginLeft: 'auto' }}>
                {narrowed ? `${rows.length} of ${all.length}` : plural(all.length, 'person', 'people')}
              </span>
            </div>

            {rows.length === 0 ? (
              <Empty
                boxed h="14rem" icon="search" title="Nobody here matches that."
                action={<button type="button" className="btn" onClick={clear}>Clear</button>}
              >
                The search looks at a person&rsquo;s name, their firm, the kinds of work
                they take and the places they cover.
              </Empty>
            ) : (
              <div className="card" style={{ padding: 0, marginTop: 'var(--space-md)' }}>
                <div className="rows boxed">
                  {rows.map((a) => (
                    <div key={a.id}>
                      <span className="avatarlg">{a.initials}</span>
                      <span className="grow">
                        <span className="row tight">
                          <strong style={{ fontSize: '0.9375rem' }}>{a.name}</strong>
                          <State state={a.stateState}>{a.stateWord}</State>
                          {paperAlerts(a).map((c) => (
                            <Tag key={c.id} alert>
                              {c.lapsed
                                ? `${c.kind} lapsed`
                                : `${c.kind}: ${plural(c.daysLeft, 'day')}`}
                            </Tag>
                          ))}
                        </span>
                        {a.firm && (
                          <span className="note" style={{ display: 'block' }}>{a.firm}</span>
                        )}
                        <span className="row tight" style={{ margin: '0.3125rem 0' }}>
                          {a.disciplines.map((d) => (
                            <Chip key={d.key} wash>{d.label}</Chip>
                          ))}
                        </span>
                        {/* Where they work, in the words that were typed in —
                            never a fold or a key. The operator recognises
                            "Peddapuram (R)"; nobody recognises
                            "p|peddapuram|…". */}
                        <span className="note" style={{ display: 'block' }}>
                          {a.areas.length > 0
                            ? a.areas.map((x) => x.label || x.name).join(' · ')
                            : 'No places yet — they will never be offered a job.'}
                        </span>
                      </span>
                      <span style={{ textAlign: 'right', minWidth: '9rem' }}>
                        <span style={{ display: 'block', fontSize: '0.8125rem' }}>
                          {a.jobsOpen > 0
                            ? <><span className="num">{a.jobsOpen}</span> in hand</>
                            : 'Nothing in hand'}
                        </span>
                        {a.jobsDone > 0 && (
                          <span className="note" style={{ display: 'block' }}>
                            {plural(a.jobsDone, 'job')} done
                          </span>
                        )}
                        {a.ratingCount > 0 && (
                          <span className="note" style={{ display: 'block' }}>
                            {a.ratingAverage.toFixed(1)} / 5 · {plural(a.ratingCount, 'rating')}
                          </span>
                        )}
                        {/* The accept rate is hidden entirely below five
                            offers. Four out of four is 100% and means nothing
                            whatever; printed as a figure it is noise wearing a
                            uniform, and somebody will make a decision on it. */}
                        {a.offersSent >= 5 && (
                          <span className="note" style={{ display: 'block' }}>
                            took {a.offersTaken} of {a.offersSent}
                          </span>
                        )}
                        <span className="note" style={{ display: 'block' }}>
                          {a.dispatchable
                            ? 'Free for another'
                            : (a.whyNot.join(' · ') || 'Not taking work')}
                        </span>
                      </span>
                      <Link className="btn sm" to={`/app/admin/members/${a.id}`}>Open</Link>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
    </main>
  );
}
