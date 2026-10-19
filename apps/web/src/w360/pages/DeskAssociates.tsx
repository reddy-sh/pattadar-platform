/** The Pattadar desk's roster — everybody who takes jobs.
 *
 * The roster is read once and narrowed in the browser. That keeps one audited
 * desk read per visit instead of one per search keystroke, and lets every
 * facet count describe the same complete roster. Contact details deliberately
 * stay on the member page; this screen is for capacity, coverage and trust.
 */
import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import FileDownloadOutlined from '@mui/icons-material/FileDownloadOutlined';
import PersonAddOutlined from '@mui/icons-material/PersonAddOutlined';

import { useAssociates } from '../api';
import type { Associate } from '../api';
import {
  BandSearch, Card, Chip, Empty, FacetFilter, Failed, PageHead, SelectAllBox, SelectCell, SelectionBar,
  State, TablePager, Tag, Th, ViewToggle,
  ddmmyyyy, downloadCsv, num, plural, sortBy, usePaged, useRowSelection,
} from '../ui';
import type { HeadActions, SortState } from '../ui';
import { Sk, SkRowItems, SkTable } from '../skeletons';

type MemberView = 'list' | 'grid' | 'table';

/** The head's one command (design.md § Page head). Left off a first-run empty
 *  roster, whose Empty state carries the same add as its one button. */
const HEAD_ACTIONS: HeadActions = {
  primary: { label: 'Add a member', to: '/admin/members/enrol',
             icon: <PersonAddOutlined sx={{ fontSize: 17 }} aria-hidden /> },
};

const STATE_CHIPS: { key: string; word: string }[] = [
  { key: 'active', word: 'Taking work' },
  { key: 'paused', word: 'Paused' },
  { key: 'blocked', word: 'Stopped' },
  { key: 'invited', word: 'Waiting on us' },
];

function dateLabel(value: string, empty: string) {
  const raw = (value || '').slice(0, 10);
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  if (!match) return empty;
  return ddmmyyyy(raw);
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
              <Link className="btn sm" to={`/admin/members/${a.id}`}>Open</Link>
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
              <Link className="btn sm" to={`/admin/members/${a.id}`}>Open</Link>
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

type MemberSort = 'name' | 'open' | 'done' | 'rating';

/** MemberTable's headings, for its skeleton (the action column is unlabelled). */
const MEMBER_COLS = [
  { head: 'Member' }, { head: 'Status' }, { head: 'Roles' }, { head: 'Coverage' },
  { head: 'Certification' }, { head: 'Joined' }, { head: 'Last completion' },
  { head: 'In progress', right: true, w: '2rem' }, { head: 'Completed', right: true, w: '2rem' },
  { head: 'Rating', w: '3rem' }, { head: '', w: '3rem' },
];
const STAT_LABELS = ['Members', 'Ready now', 'Jobs in progress', 'Jobs completed', 'Certified'];

/** The roster's first read (design.md § Loading): the stat strip with its real
 *  labels, then the chosen view's own shape, so nothing moves when it lands. */
function RosterSkeleton({ view }: { view: MemberView }) {
  const label = 'Loading the company members';
  const strip = (
    <>
      <section className="member-stats" aria-hidden>
        {STAT_LABELS.map((s) => <div key={s}><span>{s}</span><Sk w="2.5rem" h="1.5rem" /></div>)}
      </section>
      {/* The FacetFilter band's height: its facets come from the server, so
          only the band is held, not its chips. */}
      <div className="filterbar band" aria-hidden>
        <Sk w="4.5rem" h="1.75rem" r="var(--radius-pill)" style={{ flex: 'none' }} />
        <Sk w="15rem" h="2rem" style={{ flex: 'none', marginLeft: 'auto' }} />
        <Sk w="6.5rem" h="2rem" style={{ flex: 'none' }} />
      </div>
    </>
  );
  // .member-table's own margin and min-width (w360.css), so the table lands in place.
  if (view === 'table') return (
    <>{strip}<div style={{ marginTop: 'var(--space-md)' }}>
      <SkTable label={label} cols={MEMBER_COLS} minWidth="88rem" />
    </div></>
  );
  return (
    <div role="status" aria-busy="true" aria-label={label}>
      {strip}
      {view === 'grid' ? (
        <div className="member-grid" aria-hidden>
          {Array.from({ length: 6 }, (_, i) => (
            <article className="member-card" key={i}>
              <header>
                <Sk w="2.25rem" h="2.25rem" r="var(--radius-pill)" style={{ flex: 'none' }} />
                <span className="grow"><Sk w="60%" h="1rem" /><Sk w="40%" style={{ marginTop: '0.375rem' }} /></span>
              </header>
              <Sk w="70%" /><Sk w="55%" />
              <div className="member-card-metrics">
                {['In progress', 'Completed', 'Joined', 'Last completion'].map((m) => (
                  <div key={m}><span>{m}</span><Sk w="3rem" /></div>
                ))}
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div aria-hidden>
          <Card className="member-list"><div className="rows boxed"><SkRowItems rows={6} /></div></Card>
        </div>
      )}
    </div>
  );
}

const MEMBER_SORT: Record<MemberSort, (a: Associate) => string | number> = {
  name: (a) => a.name.toLowerCase(),
  open: (a) => a.jobsOpen,
  done: (a) => a.jobsDone,
  rating: (a) => a.ratingAverage,
};

const MEMBER_NOUN = ['member', 'members'] as const;
const memberId = (a: Associate) => a.id;

/** The table's columns as a CSV, for the members the reader ticked. */
function exportMembers(members: Associate[]) {
  downloadCsv('company-members.csv', [
    ['Member', 'Firm', 'Status', 'Roles', 'Coverage', 'Certification', 'Joined', 'Last completion',
     'In progress', 'Completed', 'Rating'],
    ...members.map((a) => [
      a.name, a.firm || 'Independent', a.stateWord,
      a.disciplines.map((d) => d.label).join(', ') || 'No role assigned', areaLabel(a),
      certificationOf(a).label, dateLabel(a.createdAt, 'Not recorded'), dateLabel(a.lastCompletedAt, 'None yet'),
      a.jobsOpen, a.jobsDone, ratingLabel(a),
    ]),
  ]);
}

function MemberTable({ members, resetKey }: { members: Associate[]; resetKey: string }) {
  const [sort, setSort] = useState<SortState<MemberSort>>(null);
  const rows = useMemo(() => sortBy(members, sort, MEMBER_SORT), [members, sort]);
  const paged = usePaged(rows, {
    resetKey: `${sort?.key ?? ''}${sort?.dir ?? ''}|${resetKey}`, storeKey: 'pattadar.table.members',
  });
  // Ticks cover every member the filter lets through; a new filter drops them.
  const sel = useRowSelection(rows, memberId, resetKey);
  const counted = sel.picked.length > 0 ? sel.picked : rows;
  return (
    <>
    <Card flush className="scroll-x edgefade member-table">
      <table className="rectable" aria-label="Company members">
        <thead>
          <tr>
            <th className="selcol">
              <SelectAllBox total={rows.length} picked={sel.picked.length} noun={MEMBER_NOUN}
                            onToggle={sel.toggleAll} />
            </th>
            <Th k="name" label="Member" sort={sort} setSort={setSort} />
            <th>Status</th>
            <th>Roles</th>
            <th>Coverage</th>
            <th>Certification</th>
            <th>Joined</th>
            <th>Last completion</th>
            <Th k="open" label="In progress" right sort={sort} setSort={setSort} />
            <Th k="done" label="Completed" right sort={sort} setSort={setSort} />
            <Th k="rating" label="Rating" sort={sort} setSort={setSort} />
            <th aria-label="Actions" />
          </tr>
        </thead>
        <tbody>
          {paged.shown.map((a) => {
            const certification = certificationOf(a);
            return (
              <tr key={a.id} className={sel.selected.has(a.id) ? 'selected' : undefined}>
                <SelectCell checked={sel.selected.has(a.id)} label={`Select ${a.name}`}
                            onToggle={() => sel.toggle(a.id)} />
                <td>
                  <span className="member-table-person">
                    <span className="avatarlg">{a.initials}</span>
                    <span>
                      <Link to={`/admin/members/${a.id}`}>{a.name}</Link>
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
                <td><Link className="btn sm" to={`/admin/members/${a.id}`}>Open</Link></td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr>
            {/* Sums cover the ticked members, else every member the filter
                lets through — never just this page. */}
            <td className="selcol" />
            <th scope="row" colSpan={7}>
              {sel.picked.length > 0
                ? `${plural(sel.picked.length, 'member')} selected`
                : `Total · ${plural(rows.length, 'member')}`}
            </th>
            <td className="right num"><strong>{num(counted.reduce((n, a) => n + a.jobsOpen, 0))}</strong></td>
            <td className="right num"><strong>{num(counted.reduce((n, a) => n + a.jobsDone, 0))}</strong></td>
            <td />
            <td />
          </tr>
        </tfoot>
      </table>
    </Card>
    <TablePager {...paged} onSize={paged.setSize} label="Company members pages" />
    <SelectionBar count={sel.picked.length} noun={MEMBER_NOUN} label="Act on the selected members"
                  onClear={sel.clear}>
      <button type="button" className="btn sm" onClick={() => exportMembers(sel.picked)}>
        <FileDownloadOutlined sx={{ fontSize: 15 }} /> Export
      </button>
    </SelectionBar>
    </>
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
        title="Company members"
        actions={all.length > 0 ? HEAD_ACTIONS : undefined}
        // Whole-roster totals with the status split (the four states sum to it);
        // stateChips already drops a zero state.
        summary={isLoading ? <Sk w="18rem" h="1rem" r="var(--radius-xs)" />
          : all.length > 0 ? [
            plural(all.length, 'member'),
            ...stateChips.map((s) => `${num(s.count)} ${s.word.toLowerCase()}`),
          ].join(' · ') : undefined}
      />

      {isLoading ? <RosterSkeleton view={view} />
        : !data ? <Failed what="The roster" error={error} boxed h="18rem" />
        : all.length === 0 ? (
          <Empty
            boxed h="18rem" icon="person" title="No company members yet"
            action={<Link className="btn primary" to="/admin/members/enrol">Add a member</Link>}
          />
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
              search={(
                <BandSearch value={q} onChange={setQ}
                            placeholder="Name, firm or full address" label="Search the roster" />
              )}
              view={(
                <ViewToggle label="Member view" views={['list', 'grid', 'table']}
                            value={view} onChange={setView} />
              )}
              ariaLabel="Filter company members"
            />

            {rows.length === 0 ? (
              <Empty
                boxed h="14rem" icon="search" title="No members match"
                action={<button type="button" className="btn" onClick={clear}>Clear</button>}
              />
            ) : view === 'grid' ? <MemberGrid members={rows} />
              : view === 'table' ? <MemberTable members={rows} resetKey={[q.trim(), discipline, state, readiness, location].join('|')} />
                : <MemberList members={rows} />}
          </>
        )}
    </main>
  );
}
