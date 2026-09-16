/** One job on the desk, and the people who could take it.
 *
 *  This is the screen the "Find someone" button on `/app/desk` opens, and it is
 *  where a job stops waiting: the service, the place, the owner-facing ref, what
 *  is set aside, who is on it — and under that, the roster, with one button per
 *  person that puts them on it.
 *
 *  Three things about it are deliberate and will look like omissions otherwise.
 *
 *  **There is no `deskJob(id)` query.** The desk's five cross-owner reads are
 *  the only resolvers in the API that see another owner's work_requests, and a
 *  sixth is a design change rather than a convenience. So this page takes the
 *  whole desk and finds its row in it. The cost is honest: a job the desk does
 *  not list — closed, cancelled, or never on it — cannot be shown here, and the
 *  page says exactly that rather than drawing a blank shell.
 *
 *  **The list is not area-matched, and says so.** Phase 1 has no `candidates`
 *  resolver: nothing on the server has ranked these people against this job's
 *  village or scored who is nearest. What this asks for is everyone enrolled in
 *  the line of work this service belongs to, and the note above the list says
 *  that in plain words. An area match invented in the browser — splitting the
 *  place string and comparing it to an area label — would be a claim the server
 *  never made, printed in the same typeface as the ones it did.
 *
 *  **Putting somebody on a job asks for no confirmation.** It is one write, it
 *  is reversible, and the control that reverses it is in the aside on this same
 *  page. A dialog between the desk and the thing the desk exists to do would be
 *  ceremony. Taking somebody OFF does open one — not to confirm, but because
 *  the reason is mandatory and is the only record of why a job that was moving
 *  stopped.
 *
 *  Every number on this page is drawn masked and dialled whole: the text is the
 *  server's `contactMasked` (or this module's mirror of it, for the one field
 *  that arrives raw), and the digits live only in the link's href. A screenshot
 *  of the desk must not be a phone book — `Contact` in Desk.tsx carries the rest
 *  of that reasoning.
 */
import { useState } from 'react';
import { Link, useParams } from 'react-router';

import {
  useAssociates, useDeskAssign, useDesk, useDisciplines, usePortfolio,
} from '../api';
import type { Associate, DeskJob as DeskJobRow } from '../api';
import {
  Card, Chip, Crumbs, Empty, Failed, Loading, State, Tag,
  ddmmyyyy, initialsOf, inr, inrFullish, plural,
} from '../ui';
import { Contact, MOVE_FAILED, NotTheDesk, TakeOff } from './Desk';

/** "1 of 3 jobs in hand" — from the discipline row when there is one, because
 *  capacity attaches to the pair and not to the person: a surveyor with three
 *  surveys in hand can still take a site visit. Falls back to the person's
 *  total when this job's line of work is not one of theirs. */
function inHand(a: Associate, discipline: string): string {
  const d = a.disciplines.find((x) => x.key === discipline);
  if (d) return `${d.openCount} of ${d.capacity} jobs in hand`;
  return `${plural(a.jobsOpen, 'job')} in hand`;
}

function Person({ a, discipline, job, onAssign, going }: {
  a: Associate; discipline: string; job: DeskJobRow;
  onAssign: (id: string) => void;
  /** This row's own write is in flight. Only this row's button is held, and it
   *  says what it is doing while it is held — a column of greyed primaries
   *  with no explanation is the dead control the house rules forbid, and the
   *  write it is waiting on belongs to one row, not to the list. */
  going: boolean;
}) {
  const already = !!job.assigneeRef && job.assigneeRef === a.id;
  const areas = a.areas.map((x) => x.label).filter(Boolean).join(' · ');
  const kinds = a.disciplines.map((d) => d.label).filter(Boolean).join(' · ');
  return (
    <div>
      <span className="avatarlg" style={{ width: '2.25rem', height: '2.25rem' }}>
        {a.initials || initialsOf(a.name)}
      </span>
      <span className="grow">
        <span className="row tight">
          <strong style={{ fontSize: '0.9375rem' }}>{a.name}</strong>
          {a.firm && <span className="note">{a.firm}</span>}
          <State state={a.stateState}>{a.stateWord}</State>
          {already && <Tag>On this job</Tag>}
        </span>
        <span className="note" style={{ display: 'block', margin: '0.25rem 0 0' }}>
          {kinds || 'No line of work recorded'}
          {' · '}
          {/* Where they work, printed as they recorded it. Nothing here has
              been compared to this job's place — see the note above the list. */}
          {areas || 'no areas recorded'}
        </span>
        <span className="note" style={{ display: 'block', marginTop: '0.125rem' }}>
          {inHand(a, discipline)}
          {a.jobsDone > 0 && <> · {plural(a.jobsDone, 'job')} finished</>}
          {a.contactMasked && <> · <Contact contact={a.contact} masked={a.contactMasked} /></>}
        </span>
      </span>
      <Link className="btn sm" to={`/app/desk/associates/${a.id}`}>Open</Link>
      {already ? (
        <span className="note">They already have it.</span>
      ) : a.dispatchable ? (
        <button type="button" className="btn sm primary" disabled={going}
                onClick={() => onAssign(a.id)}>
          {going ? 'Putting them on…'
            : job.assignee ? 'Put them on it instead' : 'Put them on it'}
        </button>
      ) : (
        // Shown, never filtered. A shortlist that quietly shrank from four to
        // one is a question the desk needs answered on the screen.
        <span className="note" style={{ maxWidth: '16rem', textAlign: 'right' }}>
          {a.whyNot.length > 0 ? a.whyNot.join(' · ') : 'Not taking work just now.'}
        </span>
      )}
    </div>
  );
}

export function DeskJob() {
  const { id = '' } = useParams<{ id: string }>();
  const portfolio = usePortfolio();
  const desk = useDesk('all');
  const disciplines = useDisciplines();
  const assign = useDeskAssign();
  const [pickedKind, setPickedKind] = useState('');
  const [err, setErr] = useState('');
  /** Who the write in flight is for, so one row can say "Putting them on…"
   *  without the other nine going grey for a job they are not part of. */
  const [going, setGoing] = useState('');

  const job = [...(desk.data?.jobs ?? []), ...(desk.data?.silent ?? [])]
    .find((j) => j.ticketId === id);

  /** Which line of work this service belongs to — the server's own mapping
   *  (`DisciplineInfo.kinds`, out of `associates.disciplines_for`), never a
   *  guess made from the service's name. A kind can belong to more than one:
   *  a site visit is a caretaker's job and a photo studio's, so the desk picks
   *  and the chips say so. The order is the roster's own, not a ranking —
   *  nothing here has scored anybody. */
  const forThisJob = (disciplines.data ?? []).filter((d) => d.kinds.includes(job?.kind ?? ''));
  const discipline = pickedKind || forThisJob[0]?.key || '';
  const disciplineLabel = forThisJob.find((d) => d.key === discipline)?.label ?? '';
  const people = useAssociates({ discipline });

  const onAssign = async (associateId: string) => {
    setErr('');
    setGoing(associateId);
    try {
      const res = await assign.mutateAsync({ ticketId: id, associateId, note: '' });
      if (!res.web.deskAssign) setErr(MOVE_FAILED);
    } catch {
      // The server's own reason arrives as a toast from the shared mutation
      // helper; this line is what the card says about its own state.
      setErr(MOVE_FAILED);
    } finally {
      setGoing('');
    }
  };

  if (portfolio.data && !portfolio.data.isPlatformAdmin) return <NotTheDesk />;

  if (desk.isLoading) return <main><Loading h="20rem" what="this job" /></main>;
  if (!desk.data) {
    return <main><Failed what="This job" error={desk.error} boxed h="20rem" /></main>;
  }
  if (!job) {
    return (
      <main>
        <Crumbs trail={[{ label: 'The desk', to: '/app/desk' }, { label: 'This job' }]} />
        <Empty
          boxed h="18rem" icon="clock" title="This job is not on the desk."
          action={<Link className="btn primary" to="/app/desk">Back to the desk</Link>}
        >
          It was accepted or cancelled, or it never reached the desk. The desk only holds
          jobs that are still open — the owner&rsquo;s own job has the rest of its story.
        </Empty>
      </main>
    );
  }

  const j: DeskJobRow = job;
  const roster = people.data ?? [];

  return (
    <main>
      <Crumbs trail={[{ label: 'The desk', to: '/app/desk' }, { label: j.ref }]} />
      <p className="eyebrow">{j.ref} · {j.serviceLabel} · {j.place || 'place not recorded'}</p>

      <header className="pagehead">
        <div className="grow">
          <h1>{j.serviceLabel}</h1>
          <p className="lede" style={{ marginTop: '0.375rem' }}>
            {j.orderedAt && <>Ordered {ddmmyyyy(j.orderedAt)} · </>}
            {inrFullish(j.quoted)}
            {j.dueDate && <> · due {j.dueDate}</>}
            {j.assignee ? <> · with {j.assignee}</> : <> · nobody on it yet</>}
          </p>
          {/* The four pips are not drawn here. `DeskJob` carries a status and no
              `stage`, and `stage` is a stored column the server projects from
              the status — re-deriving it in the browser would be a second copy
              of that projection, and the first thing to drift. The status word
              is the same truth in one line. */}
          <div className="row tight" style={{ marginTop: 'var(--space-sm)' }}>
            <State state={j.statusState}>{j.statusLabel}</State>
            {j.ageDays > 0 && <span className="note">{plural(j.ageDays, 'day')} old</span>}
            {j.quiet && j.quietDays > 0 && <Tag alert>{plural(j.quietDays, 'day')} quiet</Tag>}
            {j.overdue && <Tag alert>Past due</Tag>}
            {j.stuck && <Tag alert>Nobody can take it</Tag>}
          </div>
        </div>
      </header>

      <div className="split" style={{ marginTop: 'var(--space-md)' }}>
        <div className="stack">
          <Card
            title="Who could take this"
            aside={roster.length > 0
              ? <span className="note">{plural(roster.length, 'person', 'people')}</span>
              : undefined}
          >
            {/* Which line of work, when the service belongs to more than one.
                One matching discipline needs no control; none at all is said
                in the note below rather than left to be inferred. */}
            {forThisJob.length > 1 && (
              <div className="row tight" style={{ marginBottom: 'var(--space-sm)' }}>
                {forThisJob.map((d) => (
                  <Chip key={d.key} active={discipline === d.key}
                        onClick={() => setPickedKind(d.key)}>
                    {d.label}
                  </Chip>
                ))}
              </div>
            )}

            <p className="note" style={{ marginTop: 0 }}>
              {!disciplines.data
                ? <>The whole roster — what this service needs could not be read.</>
                : disciplineLabel
                  ? <>Everyone on the roster for {disciplineLabel}.</>
                  : <>The whole roster — no line of work is registered against {j.serviceLabel}.</>}
              {' '}
              Pattadar has not matched anybody to {j.place || 'this place'}: read each
              person&rsquo;s areas before you put them on it.
            </p>

            {err && (
              <p className="note" role="alert" style={{ color: 'var(--w-danger)' }}>{err}</p>
            )}

            {/* Two reads stand behind this list — which line of work the service
                belongs to, then who is enrolled in it — and the second is asked
                again the moment the first lands. One waiting state over both, so
                the roster is not drawn once against the wrong question. */}
            {disciplines.isLoading || people.isLoading
              ? <Loading h="12rem" what="the roster" />
              : !people.data ? <Failed what="The roster" error={people.error} boxed h="12rem" />
              : roster.length === 0 ? (
                <Empty
                  boxed icon="person" title="Nobody can take this today."
                  action={<Link className="btn primary" to="/app/desk/enrol">Add somebody</Link>}
                >
                  {disciplineLabel
                    ? `Nobody is on the roster for ${disciplineLabel}.`
                    : 'Nobody is on the roster at all.'}
                  {' '}
                  Add the person you already phone — they do not need an account.
                </Empty>
              ) : (
                <div className="rows boxed">
                  {roster.map((a) => (
                    <Person key={a.id} a={a} discipline={discipline} job={j}
                            onAssign={(x) => { void onAssign(x); }}
                            going={assign.isPending && going === a.id} />
                  ))}
                </div>
              )}
          </Card>
        </div>

        <aside className="stack">
          <Card title="Who is on it">
            {j.assignee ? (
              <div className="row">
                <span className="avatarlg">{initialsOf(j.assignee)}</span>
                <span className="grow">
                  <strong style={{ fontSize: '0.9375rem' }}>{j.assignee}</strong>
                  <span className="note" style={{ display: 'block', marginTop: '0.125rem' }}>
                    {j.assigneeContact
                      ? <Contact contact={j.assigneeContact} />
                      : j.assigneeRef
                        ? 'No number recorded against them.'
                        : 'The owner typed this name on their job. Pattadar has no number for them.'}
                  </span>
                  {j.assigneeRef && (
                    <Link className="link" to={`/app/desk/associates/${j.assigneeRef}`}>
                      Open their record
                    </Link>
                  )}
                </span>
              </div>
            ) : (
              <p className="note" style={{ margin: 0 }}>
                Nobody yet. Put somebody on it from the list beside this: the owner sees
                who is on their job straight away, and that person&rsquo;s number too when
                they agreed to owners having it.
              </p>
            )}
            {j.assignee && j.assigneeRef && (
              <div className="row tight" style={{ marginTop: 'var(--space-sm)' }}>
                <TakeOff ticketId={j.ticketId} jobRef={j.ref} name={j.assignee} />
              </div>
            )}
            {j.assignee && !j.assigneeRef && (
              <p className="note" style={{ marginTop: 'var(--space-sm)' }}>
                This is a name the owner typed, not an associate, so the desk cannot take
                them off it. Putting an associate on it replaces the name.
              </p>
            )}
          </Card>

          <Card title="The money">
            <p style={{ margin: 0, fontSize: '1rem', fontWeight: 600 }}>
              {inrFullish(j.quoted)} quoted
            </p>
            <p style={{ margin: '0.375rem 0 0' }}>
              <span className="pill sim">Not charged</span>
            </p>
            <p className="note">
              {j.held > 0 ? (
                <>
                  {inr(j.held)} is set aside on this job. Nothing has been taken from the
                  owner: it is owed to whoever finishes the work and has it accepted.
                </>
              ) : (
                <>
                  Nothing is set aside on this job yet. A job with no money behind it is
                  one nobody has a reason to start.
                </>
              )}
            </p>
          </Card>

          <Card title="Where it stands">
            <p className="note" style={{ margin: 0 }}>
              {j.place || 'No place recorded on this job.'}
              {j.orderedAt && <> · ordered {ddmmyyyy(j.orderedAt)}</>}
              {j.dueDate && <> · due {j.dueDate}</>}
            </p>
            {j.quiet && j.quietDays > 0 && (
              <p className="note">
                Nothing has happened on this for {plural(j.quietDays, 'day')}. That is the
                one thing on this desk that loses an owner — ring them, or take them off.
              </p>
            )}
          </Card>
        </aside>
      </div>
    </main>
  );
}
