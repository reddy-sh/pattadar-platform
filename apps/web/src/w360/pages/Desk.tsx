/** The desk — every job, across every owner, that is waiting for a human.
 *
 *  This screen answers one question: what is waiting for a person. Everything
 *  drawn here earns its place against that question, and nothing else is on it.
 *
 *  It is one of the five reads in the whole API that cross owner boundaries, so
 *  three rules shape it and none of them is cosmetic:
 *
 *  1. **A screenshot of this page must not be a phone book.** The number beside
 *     an assignee is masked on the way out and dialled whole from the link's
 *     href — see `maskContact` below, which also records why the masking happens
 *     here rather than on the server. The one place a real number is ever
 *     legible is the owner's own ticket, for the person on their own live job,
 *     and only when that associate agreed to it. There is no control on this
 *     page that puts digits on the screen.
 *  2. **Narrow rows, never a record.** A `DeskJob` carries a service, a place, a
 *     ref, two figures and a name. It does not carry the owner, the khata, the
 *     survey number or the record id, and nothing on this page links into
 *     another owner's record — only to `/app/desk/jobs/:id`, which is this same
 *     narrow row in full.
 *  3. **Money says set aside and owed.** Nothing on this desk has been charged
 *     to anybody: the provider is a stub and what is held is owed to whoever
 *     finishes the job. The lede says so once, at the top, rather than hanging a
 *     grey pill off twenty rows.
 *
 *  Phase 1 has no dispatcher, so the Dispatch kill-switch menu the design calls
 *  for is deliberately absent — `setDispatchMode` does not exist yet, and a menu
 *  that cannot switch anything is exactly the dead control the house rules
 *  forbid. The same goes for "Write to them": messaging an associate runs
 *  through the owner's own dispatch, and the desk has no cross-owner send. The
 *  two controls on this screen both do something: find somebody, or take
 *  somebody off.
 *
 *  Cold start is the normal case for months. With nothing waiting and nobody
 *  enrolled, the five-figure strip and the scope chips are suppressed entirely
 *  and the screen is one sentence — a strip of five zeroes over an empty list is
 *  the broken screen the zero-state standard was written against.
 */
import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import HandshakeOutlined from '@mui/icons-material/HandshakeOutlined';

import { Dialog } from '../Dialog';
import { useDesk, useDeskUnassign, usePortfolio } from '../api';
import type { Desk as DeskData, DeskJob as DeskJobRow } from '../api';
import {
  Cell, Chip, Empty, FacetFilter, Failed, Loading, PageHead, State, Tag,
  ddmmyyyy, inr, inrFullish, plural,
} from '../ui';
import type { FacetFilterGroup } from '../ui';

/** What a refused move says. Word for word the sentence Orders.tsx and
 *  Ticket.tsx say for the same refusal, because one job refused in three places
 *  must not sound like three different problems. It is copied rather than
 *  imported for the reason those two files record: the sentence is still a
 *  private const of each, and the lift into '../ui' has not landed. Collapse all
 *  four into that one when it does. */
export const MOVE_FAILED =
  'That did not go through. Nothing on this job has changed — reload the page and try again.';

/** A number the desk can recognise and a screenshot cannot use.
 *
 *  `DeskJob.assigneeContact` arrives RAW — api.ts says so in as many words, and
 *  the design it follows prints it on the row. The rule these two screens were
 *  given is the narrower one: one real number, on one ticket, to that ticket's
 *  OWNER, and every desk surface masked, because a list of forty jobs is forty
 *  people's numbers in one screenshot. So the desk masks on the way out and
 *  keeps the raw number in the href, where the call still connects and nothing
 *  is legible.
 *
 *  It mirrors `ticketing.mask_contact` (services/api/src/ticketing.py:836) and
 *  agrees with it character for character on the shapes that reach this screen,
 *  so one person reads the same way here and on their own page, where the server
 *  does the masking. Delete it the day `assigneeContact` arrives masked — a
 *  masking rule written in two languages is one that will eventually disagree
 *  with itself. */
export function maskContact(contact: string): string {
  const c = (contact || '').trim();
  if (!c) return '';
  if (c.includes('@')) {
    const at = c.indexOf('@');
    return `${c.slice(0, 1)}${'•'.repeat(Math.max(at - 1, 3))}@${c.slice(at + 1)}`;
  }
  // The SERVER's rule, to the character: normalise to the last ten digits,
  // then keep only the last four. This used to keep the first two as well —
  // `98•••345` — which is a different rule from `associates.mask_contact`,
  // and the one that leaks. Two masking rules in one product means the same
  // number reads as two people on two screens, and the weaker one is the one
  // that ends up in a screenshot.
  let digits = c.replace(/\D/g, '');
  if (!digits) return '';
  if (digits.length > 10) digits = digits.slice(-10);
  if (digits.length < 4) return '•'.repeat(digits.length);
  return `${'•'.repeat(digits.length - 4)}${digits.slice(-4)}`;
}

/** A number, shown masked and dialled whole.
 *
 *  `masked` is the server's own masking where the type carries one — an
 *  associate's row does — and this module's mirror where it does not. Either
 *  way the digits are never drawn; they live in the href, so a desk on a laptop
 *  with a handset, or on a phone, places the call in one click without the
 *  number being on the screen. A contact with an @ in it gets `mailto:`,
 *  because `tel:g.srinivas@gmail.com` is a dead control wearing a link. */
export function Contact({ contact, masked }: { contact: string; masked?: string }) {
  const shown = masked || maskContact(contact);
  if (!shown) return null;
  if (!contact) return <span className="mono">{shown}</span>;
  const href = contact.includes('@') ? `mailto:${contact}` : `tel:${contact}`;
  return <a className="link mono" href={href}>{shown}</a>;
}

/** The desk is Pattadar's own screen, not a tier of the product.
 *
 *  `desk` answers null for anyone who is not on the admin allowlist, which
 *  would otherwise reach the reader as "The desk did not load" — a failure
 *  message for a read that did not fail. Exported because the job page needs
 *  the same sentence for the same reason. */
export function NotTheDesk() {
  return (
    <main>
      <PageHead eyebrow="Pattadar desk" title="This is not your screen">
        <p className="lede">
          The desk is where Pattadar puts people on jobs. This account is not on the
          platform admin list, so there is nothing on it to show you.
        </p>
      </PageHead>
      <Empty
        boxed h="14rem" icon="lock" title="Nothing here belongs to this account."
        action={<Link className="btn primary" to="/app/services">Work you have ordered</Link>}
      >
        Your own orders, and who is on each of them, are under Services.
      </Empty>
    </main>
  );
}

/** Taking somebody off a job — the desk's most common real action, and the one
 *  that has to be said out loud before it happens.
 *
 *  The reason is mandatory because it is the only record of why a job that was
 *  moving stopped: `deskUnassign` refuses an empty one, so the button is held
 *  until there is something to send and the note beside it says why it is held
 *  rather than hiding the rule in a title=.
 *
 *  It is no confirmation ceremony — the act is reversible from the job page in
 *  one click — but it is not dismissable either: a reason typed and lost to a
 *  stray click on the scrim is a reason that gets typed as "x" the second time.
 *
 *  Exported because the job page needs the identical control, and two copies of
 *  a destructive dialog drift in exactly the sentence that matters. */
export function TakeOff({ ticketId, jobRef, name }: {
  ticketId: string; jobRef: string; name: string;
}) {
  const [open, setOpen] = useState(false);
  const [why, setWhy] = useState('');
  const [err, setErr] = useState('');
  const unassign = useDeskUnassign();
  const said = why.trim() !== '';

  const go = async () => {
    setErr('');
    try {
      const res = await unassign.mutateAsync({ ticketId, reason: why.trim() });
      if (!res.web.deskUnassign) { setErr(MOVE_FAILED); return; }
      setOpen(false);
      setWhy('');
    } catch {
      // The server's own reason arrives as a toast from the shared mutation
      // helper; this line is what the dialog says about its own state.
      setErr(MOVE_FAILED);
    }
  };

  return (
    <>
      <button type="button" className="btn sm danger" onClick={() => setOpen(true)}>
        Take them off this job
      </button>
      {open && (
        <Dialog
          title={`Take ${name} off ${jobRef}?`}
          busy={unassign.isPending}
          dismissable={false}
          initialFocus="textarea"
          onClose={() => { setErr(''); setOpen(false); }}
          footer={(
            <>
              <button type="button" className="btn" disabled={unassign.isPending}
                      onClick={() => { setErr(''); setOpen(false); }}>
                Leave it with them
              </button>
              {!said && (
                <span className="note">Say why first — it is the only record of this.</span>
              )}
              <button type="button" className="btn danger"
                      disabled={!said || unassign.isPending}
                      onClick={() => { void go(); }}>
                {unassign.isPending ? 'Taking them off…' : 'Take them off'}
              </button>
            </>
          )}
        >
          <p className="note" style={{ margin: 0 }}>
            The job goes back to nobody and returns to the top of this desk. {name} is
            not told automatically — ring them; this writes it down. The owner is not
            charged anything extra, and what is set aside stays set aside.
          </p>
          <div className="field">
            <label htmlFor={`off-${ticketId}`}>Why are they coming off</label>
            <textarea
              id={`off-${ticketId}`} rows={3} value={why}
              onChange={(e) => setWhy(e.currentTarget.value)}
              placeholder="Not answering since the 4th. Owner rang twice."
            />
          </div>
          {err && <p className="note" role="alert" style={{ color: 'var(--w-danger)' }}>{err}</p>}
        </Dialog>
      )}
    </>
  );
}

/** One job, as a row.
 *
 *  The row branches on whether anybody is on it rather than on which section it
 *  was drawn in, so the All scope — which mixes both — reads correctly without a
 *  second row component to keep in step. */
function JobRow({ j }: { j: DeskJobRow }) {
  return (
    <div>
      <span className="avatarlg" style={{ width: '2.25rem', height: '2.25rem' }}>
        <HandshakeOutlined sx={{ fontSize: 18 }} />
      </span>
      <span className="grow">
        <span className="row tight">
          <strong style={{ fontSize: '0.9375rem' }}>{j.serviceLabel}</strong>
          <span className="mono note">{j.ref}</span>
          <State state={j.statusState}>{j.statusLabel}</State>
          {/* Two different alarms, never both. A job nobody has taken is
              measured from when it was ordered; a job somebody took and then
              sat on is measured from the last thing that happened on it, and
              that second one is what actually loses a customer. */}
          {j.assignee
            ? j.quiet && j.quietDays > 0 && <Tag alert>{plural(j.quietDays, 'day')} quiet</Tag>
            : j.ageDays >= 3 && <Tag alert>{plural(j.ageDays, 'day')} waiting</Tag>}
          {j.stuck && <Tag alert>Nobody can take it</Tag>}
          {j.overdue && <Tag alert>Past due</Tag>}
        </span>
        <span className="note" style={{ display: 'block', margin: '0.25rem 0 0' }}>
          {j.place || 'Place not recorded'}
          {j.orderedAt && <> · ordered {ddmmyyyy(j.orderedAt)}</>}
          {j.ageDays > 0 && <> · {plural(j.ageDays, 'day')} ago</>}
          {j.dueDate && <> · due {j.dueDate}</>}
        </span>
        {j.assignee && (
          <span className="note" style={{ display: 'block', marginTop: '0.125rem' }}>
            With <strong>{j.assignee}</strong>
            {j.assigneeContact && <> · <Contact contact={j.assigneeContact} /></>}
            {!j.assigneeRef && <> · a name typed on the job, not an associate</>}
          </span>
        )}
      </span>
      <span style={{ textAlign: 'right', flex: 'none' }}>
        <span className="num" style={{ display: 'block' }}>{inrFullish(j.quoted)}</span>
        <span className="note" style={{ display: 'block' }}>
          {j.held > 0 ? `${inr(j.held)} set aside` : 'nothing set aside'}
        </span>
      </span>
      {j.assignee ? (
        <>
          <Link className="btn sm" to={`/app/desk/jobs/${j.ticketId}`}>Open the job</Link>
          {j.assigneeRef && (
            <TakeOff ticketId={j.ticketId} jobRef={j.ref} name={j.assignee} />
          )}
        </>
      ) : (
        <Link className="btn sm primary" to={`/app/desk/jobs/${j.ticketId}`}>Find someone</Link>
      )}
    </div>
  );
}

function JobList({ title, jobs }: { title: string; jobs: DeskJobRow[] }) {
  if (jobs.length === 0) return null;
  return (
    <section style={{ marginTop: 'var(--space-lg)' }}>
      <div className="row between" style={{ marginBottom: 'var(--space-sm)' }}>
        <h2 style={{ margin: 0, fontSize: '1rem' }}>{title}</h2>
        <span className="note mono">{jobs.length}</span>
      </div>
      <div className="card" style={{ padding: 0 }}>
        <div className="rows boxed">
          {jobs.map((j) => <JobRow key={j.ticketId} j={j} />)}
        </div>
      </div>
    </section>
  );
}

/** The five figures, and only the ones that are not zero.
 *
 *  A zero in this strip is not news — it is the absence of news — and five
 *  zeroes in a row is the screen that reads as broken. The whole strip goes
 *  when every one of them is zero; see `bare` below. */
function Strip({ d }: { d: DeskData }) {
  const cells = [
    { k: 'Nobody on it', v: d.unassigned, s: '' },
    { k: 'Ageing', v: d.ageing, s: '' },
    { k: 'Nothing happening', v: d.silentCount, s: '' },
    {
      k: 'Nobody can take it', v: d.stuck, s: 'See coverage',
      tone: 'down', to: '/app/desk/coverage',
    },
    { k: 'Taking work', v: d.associatesActive, s: 'associates' },
  ].filter((c) => c.v > 0);
  if (cells.length === 0) return null;
  return (
    <div className="strip" style={{ marginBottom: 'var(--space-md)' }}>
      {cells.map((c) => (
        <Cell
          key={c.k} k={c.k} v={c.v} note={c.s || undefined}
          tone={c.tone} to={c.to}
        />
      ))}
    </div>
  );
}

const SCOPES: [string, string][] = [
  ['open', 'Open'], ['silent', 'Silent'], ['stuck', 'Stuck'], ['all', 'All'],
];

type DeskFilterKey = 'service' | 'location' | 'status' | 'assignment' | 'attention';
type DeskFilters = Record<DeskFilterKey, string[]>;

const emptyDeskFilters = (): DeskFilters => ({
  service: [], location: [], status: [], assignment: [], attention: [],
});

const UNASSIGNED = 'unassigned';
const NO_LOCATION = 'not-recorded';
const ATTENTION_LABEL: Record<string, string> = {
  stuck: 'Nobody can take it', overdue: 'Past due', ageing: 'Ageing', quiet: 'Gone quiet',
};

const assignmentKey = (job: DeskJobRow) =>
  job.assignee ? (job.assigneeRef || `name:${job.assignee}`) : UNASSIGNED;

const attentionKeys = (job: DeskJobRow): string[] => [
  ...(job.stuck ? ['stuck'] : []),
  ...(job.overdue ? ['overdue'] : []),
  ...(!job.assignee && job.ageDays >= 3 ? ['ageing'] : []),
  ...(job.assignee && job.quiet ? ['quiet'] : []),
];

/** What each scope says when it has nothing in it. The Open and All sentences
 *  are the cold-start copy verbatim; Silent and Stuck get their own, because
 *  "every job has somebody on it" is the wrong answer to "what has gone quiet". */
const NOTHING: Record<string, { title: string; body: string }> = {
  open: {
    title: 'Every job has somebody on it.',
    body: 'Nothing is waiting. New orders land here the moment they are placed.',
  },
  silent: {
    title: 'Nothing has gone quiet.',
    body: 'Every job with somebody on it has moved in the last few days.',
  },
  stuck: {
    title: 'Nothing is stuck.',
    body: 'Every job waiting has at least one person who could be put on it.',
  },
  all: {
    title: 'Every job has somebody on it.',
    body: 'Nothing is waiting. New orders land here the moment they are placed.',
  },
};

export function Desk() {
  const [scope, setScope] = useState('open');
  const [filters, setFilters] = useState<DeskFilters>(emptyDeskFilters);
  const portfolio = usePortfolio();
  // `all` returns both narrow desk lists in one audited read. Modes are views
  // over that same answer, which keeps the shared facets stable while the
  // operator moves between Open, Silent and Stuck.
  const { data, isLoading, error } = useDesk('all');

  const allJobs = data?.jobs ?? [];
  const allSilent = data?.silent ?? [];
  const jobs = scope === 'open' || scope === 'all' ? allJobs
    : scope === 'stuck' ? allJobs.filter((job) => job.stuck) : [];
  const silent = scope === 'silent' || scope === 'all' ? allSilent : [];
  const scoped = [...jobs, ...silent];
  const universe = [...allJobs, ...allSilent];

  const groups = useMemo<FacetFilterGroup[]>(() => {
    const facet = (
      key: DeskFilterKey, label: string,
      valuesOf: (job: DeskJobRow) => string[], labelOf: (value: string, job: DeskJobRow) => string,
    ): FacetFilterGroup => {
      const options = new Map<string, { label: string; count: number }>();
      universe.forEach((job) => {
        [...new Set(valuesOf(job))].filter(Boolean).forEach((value) => {
          const current = options.get(value);
          options.set(value, {
            label: current?.label ?? labelOf(value, job), count: (current?.count ?? 0) + 1,
          });
        });
      });
      return {
        key, label,
        options: [...options].map(([optionKey, option]) => ({ key: optionKey, ...option }))
          .sort((a, b) => a.label.localeCompare(b.label)),
      };
    };
    return [
      facet('service', 'Service', (job) => [job.kind], (_value, job) => job.serviceLabel),
      facet('location', 'Location', (job) => [job.place || NO_LOCATION],
        (value) => value === NO_LOCATION ? 'Place not recorded' : value),
      facet('status', 'Status', (job) => [job.status], (_value, job) => job.statusLabel),
      facet('assignment', 'Assignment', (job) => [assignmentKey(job)],
        (value, job) => value === UNASSIGNED ? 'Nobody assigned' : job.assignee),
      facet('attention', 'Attention', attentionKeys,
        (value) => ATTENTION_LABEL[value] ?? value),
    ];
  }, [data]);

  const filtered = useMemo(() => {
    const accepts = (key: DeskFilterKey, values: string[]) =>
      filters[key].length === 0 || values.some((value) => filters[key].includes(value));
    return scoped.filter((job) =>
      accepts('service', [job.kind])
      && accepts('location', [job.place || NO_LOCATION])
      && accepts('status', [job.status])
      && accepts('assignment', [assignmentKey(job)])
      && accepts('attention', attentionKeys(job)));
  }, [scoped, filters]);
  const filteredIds = new Set(filtered.map((job) => job.ticketId));
  const filteredJobs = jobs.filter((job) => filteredIds.has(job.ticketId));
  const filteredSilent = silent.filter((job) => filteredIds.has(job.ticketId));
  const toggleFilter = (groupKey: string, optionKey: string) => {
    const key = groupKey as DeskFilterKey;
    setFilters((current) => ({
      ...current,
      [key]: current[key].includes(optionKey)
        ? current[key].filter((value) => value !== optionKey)
        : [...current[key], optionKey],
    }));
  };
  const clearFilters = () => setFilters(emptyDeskFilters());
  /** Nothing waiting, nothing quiet, nobody enrolled, no figure above zero.
   *  This is the normal case for months and it gets one sentence — not a strip,
   *  not four chips over an empty box. */
  const bare = !!data
    && allJobs.length === 0 && allSilent.length === 0
    && !data.unassigned && !data.ageing && !data.silentCount
    && !data.stuck && !data.associatesActive;
  const words = NOTHING[scope] ?? NOTHING.open;

  if (portfolio.data && !portfolio.data.isPlatformAdmin) return <NotTheDesk />;

  return (
    <main>
      <PageHead eyebrow="Pattadar desk" title="Jobs waiting for somebody">
        <p className="lede">
          Every job, across every owner, with nobody on it — and every job that has
          somebody and has stopped moving. Nothing here has been charged to anybody:
          what is set aside is owed to whoever finishes the job.
        </p>
      </PageHead>

      {/* Chrome outside the three states stays mounted while modes and facets
          reshape the single desk-wide answer. */}
      {!bare && (
        <>
          {data && <Strip d={data} />}
          <div className="row tight" style={{ marginBottom: 'var(--space-md)' }}>
            {SCOPES.map(([k, label]) => (
              <Chip key={k} active={scope === k} onClick={() => setScope(k)}>{label}</Chip>
            ))}
          </div>
          {data && universe.length > 0 && (
            <FacetFilter
              groups={groups}
              selected={filters}
              onToggle={toggleFilter}
              onClear={clearFilters}
              tally={`${filtered.length} of ${scoped.length} shown`}
              ariaLabel="Filter desk jobs"
            />
          )}
        </>
      )}

      {isLoading ? <Loading h="18rem" what="the desk" />
        : !data ? <Failed what="The desk" error={error} boxed h="18rem" />
        : bare ? (
          <Empty boxed h="16rem" icon="ok" title="Every job has somebody on it.">
            Nothing is waiting. New orders land here the moment they are placed.
          </Empty>
        ) : (
          <>
            {scoped.length === 0 ? (
              <Empty boxed h="16rem" icon="ok" title={words.title}>{words.body}</Empty>
            ) : filtered.length === 0 ? (
              <Empty
                boxed h="16rem" icon="search" title="No jobs match those filters"
                action={<button type="button" className="btn sm" onClick={clearFilters}>Clear filters</button>}
              >
                Try another service, location, status, assignment or attention flag.
              </Empty>
            ) : (
              <>
                <JobList title="Nobody on it" jobs={filteredJobs} />
                <JobList title="On someone, nothing happening" jobs={filteredSilent} />
              </>
            )}
          </>
        )}
    </main>
  );
}
