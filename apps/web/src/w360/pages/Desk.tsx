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
import { useRef, useState } from 'react';
import { Link } from 'react-router';
import HandshakeOutlined from '@mui/icons-material/HandshakeOutlined';

import { Dialog } from '../Dialog';
import { useDesk, useDeskUnassign, usePortfolio } from '../api';
import type { Desk as DeskData, DeskJob as DeskJobRow } from '../api';
import {
  Cell, Chip, Empty, Failed, Loading, PageHead, State, Tag,
  ddmmyyyy, inr, inrFullish, plural,
} from '../ui';

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
    { k: 'Stuck', v: d.stuck, s: '' },
    { k: 'Taking work', v: d.associatesActive, s: 'associates' },
  ].filter((c) => c.v > 0);
  if (cells.length === 0) return null;
  return (
    <div className="strip" style={{ marginBottom: 'var(--space-md)' }}>
      {cells.map((c) => <Cell key={c.k} k={c.k} v={c.v} note={c.s || undefined} />)}
    </div>
  );
}

const SCOPES: [string, string][] = [
  ['open', 'Open'], ['silent', 'Silent'], ['stuck', 'Stuck'], ['all', 'All'],
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
  const portfolio = usePortfolio();
  const { data, isLoading, error } = useDesk(scope);

  /** The five figures are desk-wide, not scope-dependent, so the last ones read
   *  stay on screen while a scope switch is in flight. A strip that blinks out
   *  and back on every chip click reads as the page breaking, and the numbers it
   *  would redraw are the same numbers. */
  const seen = useRef<DeskData | null>(null);
  if (data) seen.current = data;
  const figures = seen.current;

  if (portfolio.data && !portfolio.data.isPlatformAdmin) return <NotTheDesk />;

  const jobs = data?.jobs ?? [];
  const silent = data?.silent ?? [];
  /** Nothing waiting, nothing quiet, nobody enrolled, no figure above zero.
   *  This is the normal case for months and it gets one sentence — not a strip,
   *  not four chips over an empty box. */
  const bare = !!data
    && jobs.length === 0 && silent.length === 0
    && !data.unassigned && !data.ageing && !data.silentCount
    && !data.stuck && !data.associatesActive;
  const stuckJobs = [...jobs, ...silent].filter((j) => j.stuck).slice(0, 3);
  const words = NOTHING[scope] ?? NOTHING.open;

  return (
    <main>
      <PageHead eyebrow="Pattadar desk" title="Jobs waiting for somebody">
        <p className="lede">
          Every job, across every owner, with nobody on it — and every job that has
          somebody and has stopped moving. Nothing here has been charged to anybody:
          what is set aside is owed to whoever finishes the job.
        </p>
      </PageHead>

      {/* Chrome outside the three states on purpose: the chips must not vanish
          under the hand that clicked them while the new scope lands. */}
      {!bare && (
        <>
          {figures && <Strip d={figures} />}
          <div className="row tight" style={{ marginBottom: 'var(--space-md)' }}>
            {SCOPES.map(([k, label]) => (
              <Chip key={k} active={scope === k} onClick={() => setScope(k)}>{label}</Chip>
            ))}
          </div>
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
            {/* A job nobody can be put on is not a job that is late — it is a
                hole in the roster, and no amount of waiting fills it. */}
            {data.stuck > 0 && (
              <section className="card alert">
                <h2 style={{ margin: 0, fontSize: '1rem' }}>
                  {plural(data.stuck, 'job has', 'jobs have')} nobody who can take it.
                </h2>
                <p className="note">
                  {/* Named, not counted: "one job is stuck" sends the reader
                      back to the list to find out which. The place is dropped
                      when a job has none rather than printing a trailing dot. */}
                  {stuckJobs.length > 0 && (
                    <>
                      {stuckJobs
                        .map((j) => [j.ref, j.serviceLabel, j.place].filter(Boolean).join(' · '))
                        .join(' — ')}
                      {'. '}
                    </>
                  )}
                  Waiting will not fill this. Enrol somebody, or widen an existing
                  associate&rsquo;s areas or line of work.
                </p>
                <div className="row tight">
                  <Link className="btn sm" to="/app/desk/coverage">See the gaps</Link>
                  <Link className="btn sm" to="/app/desk/enrol">Add somebody</Link>
                </div>
              </section>
            )}

            {jobs.length === 0 && silent.length === 0 ? (
              <Empty boxed h="16rem" icon="ok" title={words.title}>{words.body}</Empty>
            ) : (
              <>
                <JobList title="Nobody on it" jobs={jobs} />
                <JobList title="On someone, nothing happening" jobs={silent} />
              </>
            )}
          </>
        )}
    </main>
  );
}
