/** The Pattadar desk's roster — everybody who takes jobs.
 *
 * The roster is read once and narrowed in the browser. That keeps one audited
 * desk read per visit instead of one per search keystroke, and lets every
 * facet count describe the same complete roster. Contact details deliberately
 * stay on the member page; this screen is for capacity, coverage and trust.
 */
import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import SearchOutlined from '@mui/icons-material/SearchOutlined';

import { useAssociates } from '../api';
import type { Associate } from '../api';
import { Chip, Empty, FacetFilter, Failed, Loading, PageHead, State, Tag, plural } from '../ui';

type MemberView = 'list' | 'grid' | 'table';

const STATE_CHIPS: { key: string; word: string }[] = [
  { key: 'active', word: 'Taking work' },
  { key: 'paused', word: 'Paused' },
  { key: 'blocked', word: 'Stopped' },
  { key: 'invited', word: 'Waiting on us' },
];

const DATE = new Intl.DateTimeFormat('en-IN', {
  day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC',
});

function dateLabel(value: string, empty: string) {
  const raw = (value || '').slice(0, 10);
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  if (!match) return empty;
  return DATE.format(new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]))));
}

const haystack = (a: Associate): string => [
  a.name,
  a.firm,
  a.addressLabel,
  ...a.disciplines.map((d) => d.label),
  ...a.areas.map((x) => x.label || x.name),
].join(' ').toLowerCase();

function paperAlerts(a: Associate) {
  return a.credentials.filter((c) => c.lapsed || c.expiring);
}

type Certification = { label: string; state: 'good' | 'warn' | 'bad' | 'unknown' };

function certificationOf(a: Associate): Certification {
  if (a.disciplines.length === 0) return { label: 'No role set', state: 'unknown' };
  const states = a.disciplines.map((d) => d.credentialState);
  if (a.credentials.some((c) => c.lapsed) || states.includes('lapsed')) {
    return { label: 'Lapsed', state: 'bad' };
  }
  if (states.includes('rejected')) return { label: 'Rejected', state: 'bad' };
  if (a.credentials.some((c) => c.expiring) || states.includes('expiring')) {
    return { label: 'Expiring', state: 'warn' };
  }
  if (states.every((s) => s === 'verified')) return { label: 'Certified', state: 'good' };
  return { label: 'Review needed', state: 'warn' };
}

const isCertified = (a: Associate) => certificationOf(a).label === 'Certified';

function ratingLabel(a: Associate) {
  return a.ratingCount > 0
    ? `${a.ratingAverage.toFixed(1)} / 5 · ${plural(a.ratingCount, 'rating')}`
    : 'Not rated yet';
}

function areaLabel(a: Associate) {
  return a.areas.length > 0
    ? a.areas.map((x) => x.label || x.name).join(' · ')
    : 'No coverage area';
}

function MemberTags({ member }: { member: Associate }) {
  return (
    <span className="row tight member-tags">
      {member.disciplines.map((d) => <Chip key={d.key} wash>{d.label}</Chip>)}
      {member.disciplines.length === 0 && <span className="note">No role assigned</span>}
    </span>
  );
}

function MemberAlerts({ member }: { member: Associate }) {
  return (
    <>
      {paperAlerts(member).map((c) => (
        <Tag key={c.id} alert>
          {c.lapsed ? `${c.kind} lapsed` : `${c.kind}: ${plural(c.daysLeft, 'day')}`}
        </Tag>
      ))}
      {!member.addressComplete && <Tag alert>Address incomplete</Tag>}
    </>
  );
}

function MemberList({ members }: { members: Associate[] }) {
  return (
    <div className="card member-list">
      <div className="rows boxed">
        {members.map((a) => {
          const certification = certificationOf(a);
          return (
            <div key={a.id}>
              <span className="avatarlg">{a.initials}</span>
              <span className="grow member-list-copy">
                <span className="row tight">
                  <strong>{a.name}</strong>
                  <State state={a.stateState}>{a.stateWord}</State>
                  <MemberAlerts member={a} />
                </span>
                {a.firm && <span className="note member-line">{a.firm}</span>}
                <span className="note member-line">{a.addressLabel || 'Full address not recorded'}</span>
                <MemberTags member={a} />
                <span className="note member-line">{areaLabel(a)}</span>
              </span>
              <span className="member-list-facts">
                <span><b className="num">{a.jobsOpen}</b> in progress</span>
                <span><b className="num">{a.jobsDone}</b> completed</span>
                <span className="note">Joined {dateLabel(a.createdAt, 'date not recorded')}</span>
                <span className="note">Last completed {dateLabel(a.lastCompletedAt, 'none yet')}</span>
                <State state={certification.state}>{certification.label}</State>
                <span className="note">{ratingLabel(a)}</span>
              </span>
              <Link className="btn sm" to={`/app/admin/members/${a.id}`}>Open</Link>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function MemberGrid({ members }: { members: Associate[] }) {
  return (
    <div className="member-grid">
      {members.map((a) => {
        const certification = certificationOf(a);
        return (
          <article className="member-card" key={a.id}>
            <header>
              <span className="avatarlg">{a.initials}</span>
              <span className="grow">
                <span className="row tight">
                  <strong>{a.name}</strong>
                  <State state={a.stateState}>{a.stateWord}</State>
                </span>
                <span className="note member-line">{a.firm || 'Independent'}</span>
              </span>
              <Link className="btn sm" to={`/app/admin/members/${a.id}`}>Open</Link>
            </header>

            <MemberTags member={a} />
            <p className="note member-card-place">{a.addressLabel || 'Full address not recorded'}</p>
            <p className="note member-card-place">Covers: {areaLabel(a)}</p>

            <div className="member-card-metrics">
              <div><span>In progress</span><strong className="num">{a.jobsOpen}</strong></div>
              <div><span>Completed</span><strong className="num">{a.jobsDone}</strong></div>
              <div><span>Joined</span><strong>{dateLabel(a.createdAt, 'Not recorded')}</strong></div>
              <div><span>Last completion</span><strong>{dateLabel(a.lastCompletedAt, 'None yet')}</strong></div>
            </div>

            <footer>
              <State state={certification.state}>{certification.label}</State>
              <span className="note">{ratingLabel(a)}</span>
              <MemberAlerts member={a} />
            </footer>
          </article>
        );
      })}
    </div>
  );
}

function MemberTable({ members }: { members: Associate[] }) {
  return (
    <div className="card scroll-x member-table">
      <table className="rectable">
        <thead>
          <tr>
            <th>Member</th>
            <th>Status</th>
            <th>Roles</th>
            <th>Coverage</th>
            <th>Certification</th>
            <th>Joined</th>
            <th>Last completion</th>
            <th className="right">In progress</th>
            <th className="right">Completed</th>
            <th>Rating</th>
            <th aria-label="Actions" />
          </tr>
        </thead>
        <tbody>
          {members.map((a) => {
            const certification = certificationOf(a);
            return (
              <tr key={a.id}>
                <td>
                  <span className="member-table-person">
                    <span className="avatarlg">{a.initials}</span>
                    <span>
                      <Link to={`/app/admin/members/${a.id}`}>{a.name}</Link>
                      <small>{a.firm || 'Independent'}</small>
                    </span>
                  </span>
                </td>
                <td><State state={a.stateState}>{a.stateWord}</State></td>
                <td>{a.disciplines.map((d) => d.label).join(', ') || 'No role assigned'}</td>
                <td className="muted">{areaLabel(a)}</td>
                <td><State state={certification.state}>{certification.label}</State></td>
                <td className="num">{dateLabel(a.createdAt, 'Not recorded')}</td>
                <td className="num">{dateLabel(a.lastCompletedAt, 'None yet')}</td>
                <td className="right num"><strong>{a.jobsOpen}</strong></td>
                <td className="right num"><strong>{a.jobsDone}</strong></td>
                <td>{ratingLabel(a)}</td>
                <td><Link className="btn sm" to={`/app/admin/members/${a.id}`}>Open</Link></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function DeskAssociates() {
  const { data, isLoading, error } = useAssociates({});
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState('');
  const [discipline, setDiscipline] = useState('');
  const [state, setState] = useState('');
  const [readiness, setReadiness] = useState('');
  const [location, setLocation] = useState('');
  const view: MemberView = params.get('view') === 'grid'
    ? 'grid' : params.get('view') === 'table' ? 'table' : 'list';
  const setView = (nextView: MemberView) => {
    const next = new URLSearchParams(params);
    next.set('view', nextView);
    setParams(next, { replace: true });
  };

  const all = useMemo(() => data ?? [], [data]);
  const stats = useMemo(() => ({
    members: all.length,
    ready: all.filter((a) => a.dispatchable).length,
    open: all.reduce((sum, a) => sum + a.jobsOpen, 0),
    done: all.reduce((sum, a) => sum + a.jobsDone, 0),
    certified: all.filter(isCertified).length,
  }), [all]);

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
      .map(([key, value]) => ({ key, ...value }))
      .sort((x, y) => y.count - x.count || x.label.localeCompare(y.label));
  }, [all]);

  const stateChips = useMemo(
    () => STATE_CHIPS
      .map((item) => ({ ...item, count: all.filter((a) => a.state === item.key).length }))
      .filter((item) => item.count > 0),
    [all],
  );

  const locationOptions = useMemo(() => {
    const counts = new Map<string, number>();
    for (const a of all) {
      const label = a.district || a.stateName || a.villageLocality;
      if (label) counts.set(label, (counts.get(label) ?? 0) + 1);
    }
    return [...counts.entries()]
      .map(([key, count]) => ({ key, label: key, count }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [all]);

  const readinessOptions = useMemo(() => [
    { key: 'certified', label: 'Certified', count: all.filter(isCertified).length },
    { key: 'working', label: 'Working now', count: all.filter((a) => a.jobsOpen > 0).length },
    { key: 'training', label: 'Needs training', count: all.filter((a) => ['required', 'in_training'].includes(a.trainingState)).length },
    { key: 'low_rating', label: 'Below 3 after 100', count: all.filter((a) => a.ratingCount >= 100 && a.ratingAverage < 3).length },
    { key: 'address_missing', label: 'Address incomplete', count: all.filter((a) => !a.addressComplete).length },
  ].filter((item) => item.count > 0), [all]);

  const groups = useMemo(() => [
    { key: 'role', label: 'Role', options: discChips },
    { key: 'status', label: 'Status', options: stateChips.map((item) => ({ key: item.key, label: item.word, count: item.count })) },
    { key: 'readiness', label: 'Readiness', options: readinessOptions },
    { key: 'location', label: 'Location', options: locationOptions },
  ], [discChips, stateChips, readinessOptions, locationOptions]);

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return all.filter((a) => {
      if (discipline && !a.disciplines.some((d) => d.key === discipline)) return false;
      if (state && a.state !== state) return false;
      if (location && ![a.district, a.stateName, a.villageLocality].includes(location)) return false;
      if (readiness === 'certified' && !isCertified(a)) return false;
      if (readiness === 'training' && !['required', 'in_training'].includes(a.trainingState)) return false;
      if (readiness === 'working' && a.jobsOpen === 0) return false;
      if (readiness === 'low_rating' && !(a.ratingCount >= 100 && a.ratingAverage < 3)) return false;
      if (readiness === 'address_missing' && a.addressComplete) return false;
      if (needle && !haystack(a).includes(needle)) return false;
      return true;
    });
  }, [all, q, discipline, state, readiness, location]);

  const narrowed = !!q.trim() || !!discipline || !!state || !!readiness || !!location;
  const clear = () => {
    setQ(''); setDiscipline(''); setState(''); setReadiness(''); setLocation('');
  };
  const toggle = (group: string, key: string) => {
    if (group === 'role') setDiscipline((value) => (value === key ? '' : key));
    if (group === 'status') setState((value) => (value === key ? '' : key));
    if (group === 'readiness') setReadiness((value) => (value === key ? '' : key));
    if (group === 'location') setLocation((value) => (value === key ? '' : key));
  };

  return (
    <main>
      <PageHead
        eyebrow="Administration"
        title="Company members"
        actions={(
          <>
            {all.length > 0 && (
              <div className="segmented" role="group" aria-label="Member view">
                <button type="button" aria-pressed={view === 'list'} onClick={() => setView('list')}>List</button>
                <button type="button" aria-pressed={view === 'grid'} onClick={() => setView('grid')}>Grid</button>
                <button type="button" aria-pressed={view === 'table'} onClick={() => setView('table')}>Table</button>
              </div>
            )}
            <Link className="btn primary" to="/app/admin/members/enrol">Add somebody</Link>
          </>
        )}
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
            action={<Link className="btn primary" to="/app/admin/members/enrol">Add the first one</Link>}
          >
            An associate is somebody who takes jobs — a surveyor, an advocate, a
            document writer. Add the people you already work with; they do not need
            an account.
          </Empty>
        ) : (
          <>
            <section className="member-stats" aria-label="Member summary">
              <div><span>Members</span><strong className="num">{stats.members}</strong></div>
              <div><span>Ready now</span><strong className="num">{stats.ready}</strong></div>
              <div><span>Jobs in progress</span><strong className="num">{stats.open}</strong></div>
              <div><span>Jobs completed</span><strong className="num">{stats.done}</strong></div>
              <div><span>Certified</span><strong className="num">{stats.certified}</strong></div>
            </section>

            <FacetFilter
              groups={groups}
              selected={{
                role: discipline ? [discipline] : [],
                status: state ? [state] : [],
                readiness: readiness ? [readiness] : [],
                location: location ? [location] : [],
              }}
              onToggle={toggle}
              onClear={clear}
              tally={narrowed ? `${rows.length} of ${all.length} shown` : plural(all.length, 'person', 'people')}
              extraChips={q.trim() ? [{
                id: 'q', group: 'Search', label: q.trim(), removeLabel: 'Clear roster search',
                onRemove: () => setQ(''),
              }] : []}
              trailing={(
                <span className="search member-search">
                  <SearchOutlined sx={{ fontSize: 16 }} aria-hidden />
                  <input value={q} onChange={(event) => setQ(event.target.value)}
                         placeholder="Name, firm or full address" aria-label="Search the roster" />
                </span>
              )}
              ariaLabel="Filter company members"
            />

            {rows.length === 0 ? (
              <Empty
                boxed h="14rem" icon="search" title="Nobody here matches that."
                action={<button type="button" className="btn" onClick={clear}>Clear</button>}
              >
                The search looks at a person&rsquo;s name, their firm, the kinds of work
                they take and the places they cover.
              </Empty>
            ) : view === 'grid' ? <MemberGrid members={rows} />
              : view === 'table' ? <MemberTable members={rows} />
                : <MemberList members={rows} />}
          </>
        )}
    </main>
  );
}
