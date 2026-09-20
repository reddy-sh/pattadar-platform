/** The Services hanger on a record, and the same rows as a standalone list.
 *
 *  An order is the one place money leaves the app on someone else's word, so
 *  the row says what state it is really in, who is doing it and what is still
 *  set aside on it — never just "in progress". The four pips stay, because they
 *  are what a glance down a list reads; the status word beside them is what the
 *  owner acts on, and "Sent out" and "Waiting on you" have no pip of their own. */
import { Fragment, useState } from 'react';
import type { ReactNode } from 'react';
import { Link } from 'react-router';
import HandshakeOutlined from '@mui/icons-material/HandshakeOutlined';
import AccessTimeOutlined from '@mui/icons-material/AccessTimeOutlined';

import { useAssignRequest, useAssignable, useOrders, useRecordHistory } from '../api';
import type { Order } from '../api';
import {
  Card, Chip, Empty, Failed, Loading, ORDER_STAGES, PageHead, Rail, State, Tag, ddmmyyyy, inr, plural,
} from '../ui';
import { useRecordCtx } from './Record';
import { SectionHead } from './RecordHead';

/** What a refused move says. Word for word what the ticket screen says for the
 *  same refusal, because the same job refused in two places must not sound
 *  like two different problems. It is copied rather than imported: the
 *  sentence is a private const of Ticket.tsx, and '../ui' — where it belongs —
 *  is shared. Lift it there when that file is next opened. */
const MOVE_FAILED =
  'That did not go through. Nothing on this job has changed — reload the page and try again.';

/** A job nobody can be put on any more. `assignRequest` refuses a closed
 *  ticket outright, so the two closed statuses are what decides whether the
 *  picker is a control or a trap. `Order` carries no `closed` field of its
 *  own; adding one to the GraphQL type would survive a ninth status better
 *  than this does. */
const isClosed = (o: Order) => o.status === 'accepted' || o.status === 'cancelled';

/** The stored answers, as label/value pairs a person can read.
 *
 *  Bad JSON is treated as no answers rather than throwing: an unreadable
 *  order should still show its stage.
 *
 *  Only what the OWNER actually answered. `order_service` stores the validated
 *  attachment manifest inside the same params blob — `{...answers,
 *  attachment_manifest: {...}}`, a dict — so a row that went out with two
 *  papers on it printed "Attachment manifest: [object Object]" under the
 *  owner's own words. What was attached is already said in the `shared` key, by
 *  name, which is the readable half; the manifest is ids and storage keys and
 *  belongs to the worker's sheet, not to this list. Anything non-primitive is
 *  dropped for the same reason rather than this one key being named: the blob
 *  is written by the server and may grow another. */
function answersOf(params: string): [string, string][] {
  try {
    const o = JSON.parse(params || '{}') as Record<string, unknown>;
    return Object.entries(o)
      .filter(([, v]) => v !== null && typeof v !== 'object')
      .filter(([, v]) => String(v ?? '').trim() !== '')
      .map(([k, v]) => [k.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase()), String(v)]);
  } catch {
    return [];
  }
}

/** Putting somebody on a placed job.
 *
 *  Its own component for two reasons. The message it can show belongs to the
 *  row that is open, and collapsing that row unmounts this — which is what
 *  "clear the error" means here, rather than a sentence about one order
 *  following the reader down to the next.
 *
 *  And the mutation is awaited instead of fired and forgotten. `assignRequest`
 *  answers false — it raises nothing — for a move the machine will not make,
 *  and the select is uncontrolled, so the name that was picked sat there
 *  looking saved while no row had changed and nothing had been said. */
function AssignPicker({ order }: { order: Order }) {
  const assign = useAssignRequest();
  const { data: people } = useAssignable();
  const [err, setErr] = useState('');
  // The names are the ones this account has already handed work to, so an
  // empty list is a true answer for a new owner, and a select whose only
  // option is "Nobody yet" is a control that cannot do anything. `people` is
  // undefined while the query is in flight; only a resolved empty array gets
  // the sentence, or every account would read it once before its names came.
  if (people && people.length === 0) {
    return (
      <p className="note" style={{ marginTop: 'var(--space-sm)' }}>
        Nobody has worked on your records yet, so there is no name to pick. Open the
        service and send this to someone — Pattadar does the sending, so you can take
        it back.
      </p>
    );
  }
  // `el` is read from the event before anything is awaited: `currentTarget` is
  // nulled once the handler returns, and the select has to be put back to
  // "Nobody yet" when the name did not take.
  const onPick = async (el: HTMLSelectElement) => {
    const name = el.value;
    if (!name) return;
    setErr('');
    try {
      const res = await assign.mutateAsync({ requestId: order.id, assignee: name });
      if (!res.web.assignRequest) { el.value = ''; setErr(MOVE_FAILED); }
    } catch {
      // The reason itself arrives as a toast from the shared mutation; this
      // line is what the row says about its own state.
      el.value = '';
      setErr(MOVE_FAILED);
    }
  };
  return (
    <div style={{ marginTop: 'var(--space-sm)' }}>
      <div className="row tight">
        <label className="note" htmlFor={`as-${order.id}`}>Assign to</label>
        <select id={`as-${order.id}`} className="input" defaultValue=""
                disabled={assign.isPending}
                onChange={(e) => { void onPick(e.currentTarget); }}>
          <option value="">Nobody yet</option>
          {(people ?? []).map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
        {assign.isPending && <span className="note">Putting them on it…</span>}
      </div>
      {err && (
        <p className="note" role="alert"
           style={{ margin: 'var(--space-xs) 0 0', color: 'var(--w-danger)' }}>
          {err}
        </p>
      )}
    </div>
  );
}

function Rows({ orders, showRecord, closed, onShowAll, empty }: {
  orders: Order[]; showRecord?: boolean; closed?: boolean; onShowAll?: () => void;
  empty?: ReactNode;
}) {
  const [open, setOpen] = useState('');
  if (orders.length === 0) {
    // A list that asks a different question — "what is waiting on you" — hands
    // in its own sentence, rather than telling somebody with nothing to decide
    // that they should go and order a survey they may already have ordered.
    if (empty) return <>{empty}</>;
    return (
      <Empty
        boxed h="16rem" icon="clock"
        title={closed ? 'Nothing has ever been ordered' : 'Nothing is on order'}
        // The "including done" view is the one question an empty Open list
        // raises — "did I have any?" — so it is offered here, where it is the
        // answer, rather than as a filter chip above an empty box.
        action={!closed && onShowAll ? (
          <button type="button" className="btn sm" onClick={onShowAll}>
            Everything, including done
          </button>
        ) : undefined}
      >
        A survey, an EC, a title opinion or a site visit can be ordered from
        any record — the people who do the work appear on its People tab while they hold it.
      </Empty>
    );
  }
  const groups: { key: string; batchRef: string; items: Order[] }[] = [];
  const seen = new Set<string>();
  orders.forEach((order) => {
    if (!order.batchId) {
      groups.push({ key: order.id, batchRef: '', items: [order] });
      return;
    }
    if (seen.has(order.batchId)) return;
    seen.add(order.batchId);
    groups.push({
      key: order.batchId,
      batchRef: order.batchRef,
      items: orders.filter((candidate) => candidate.batchId === order.batchId),
    });
  });
  return (
    <div className="card" style={{ padding: 0 }}>
      <div className="rows boxed">
        {groups.map((group) => {
          const done = group.items.filter(isClosed).length;
          const needsYou = group.items.filter((item) => item.needsYou || item.pendingReview > 0).length;
          const total = group.items.reduce((sum, item) => sum + item.cost, 0);
          return (
          <Fragment key={group.key}>
            {group.batchRef && (
              <div className="service-batch-head">
                <strong>{group.batchRef}</strong>
                <span>{plural(group.items.length, 'service')}</span>
                <span className="num">{inr(total)}</span>
                <span className="note">
                  {needsYou > 0 ? `${needsYou} need you`
                    : done === group.items.length ? 'Complete'
                      : `${done} of ${group.items.length} complete`}
                </span>
              </div>
            )}
            {group.items.map((o) => (
          <div key={o.id}>
            <span className="avatarlg" style={{ width: '2.25rem', height: '2.25rem' }}>
              <HandshakeOutlined sx={{ fontSize: 18 }} />
            </span>
            <span className="grow">
              <span className="row tight">
                <strong style={{ fontSize: '0.9375rem' }}>{o.title}</strong>
                <span className="mono note">{o.ref}</span>
                {o.needsYou && <span className="pill managed">Needs you</span>}
                {/* The four pips cannot say "sent out and unanswered" or
                    "waiting on you", and those are the two states an owner
                    actually acts on. */}
                <State state={o.statusState}>{o.statusLabel}</State>
                {o.pendingReview > 0 && (
                  <Tag alert>{o.pendingReview} to look at</Tag>
                )}
                {showRecord && o.recordTitle && (
                  <Link to={`/app/records/${o.recordId}`} className="note accent"
                        style={{ textDecoration: 'none' }}>
                    {o.recordTitle}
                  </Link>
                )}
              </span>
              <span className="note" style={{ display: 'block', margin: '0.25rem 0 0.4375rem' }}>
                {o.detail}
              </span>
              <Rail stage={o.stage} steps={ORDER_STAGES} word={o.statusLabel || undefined} />
              {open === o.id && (
                <div className="card" style={{ marginTop: 'var(--space-sm)' }}>
                  {/* `assigneeRef` is the associates row behind the name, or
                      '' for a name somebody typed into a box. The distinction
                      is the difference between a person Pattadar can reach on
                      the owner's behalf and a string — and the row read
                      identically for both until this pill. */}
                  <p className="note">
                    <strong>{o.stageLabel}</strong>
                    {o.dueDate && <> · due {o.dueDate}</>}
                    {o.assignee && (
                      <>
                        {' · with '}{o.assignee}{' '}
                        {o.assigneeRef
                          ? <span className="pill managed">Pattadar associate</span>
                          : '(a name you typed)'}
                      </>
                    )}
                  </p>
                  {/* What was actually asked for. An order you cannot read back
                      is one you have to ring someone to understand. */}
                  {/* Placed but unassigned: this is where somebody is put on
                      it. The owner asked; who does it is decided here. An
                      accepted or cancelled job is past that — the server
                      refuses the move — so it says nobody was ever on it
                      rather than offering a picker that quietly does nothing. */}
                  {!o.assignee && (isClosed(o) ? (
                    <p className="note" style={{ marginTop: 'var(--space-sm)' }}>
                      Nobody was ever put on this job.
                    </p>
                  ) : (
                    <AssignPicker order={o} />
                  ))}
                  {answersOf(o.params).length > 0 ? (
                    <dl className="kv" style={{ marginTop: 'var(--space-sm)' }}>
                      {answersOf(o.params).map(([k, v]) => (
                        <div key={k}>
                          <dt className="note">{k}</dt>
                          <dd>{v}</dd>
                        </div>
                      ))}
                    </dl>
                  ) : (
                    <p className="note" style={{ marginTop: 'var(--space-xs)' }}>
                      This order was placed before the form asked for details.
                    </p>
                  )}
                </div>
              )}
            </span>
            <span style={{ textAlign: 'right' }}>
              <span className="num" style={{ display: 'block' }}>{inr(o.cost)}</span>
              {/* What is actually set aside on this job, which is not always
                  what it was quoted at — a job nobody funded reads ₹2,900 and
                  has nothing behind it. "Set aside" and not "paid": nothing
                  has been taken from any account. */}
              {o.held > 0 && (
                <span className="note" style={{ display: 'block' }}>{inr(o.held)} set aside</span>
              )}
              {o.dueDate && (
                <span className="note row tight" style={{ justifyContent: 'flex-end' }}>
                  <AccessTimeOutlined sx={{ fontSize: 12 }} /> {o.dueDate}
                </span>
              )}
            </span>
            {/* Beside Track order, not instead of it. The panel answers "where
                is it" without leaving the list; the ticket is where it is sent
                out, reviewed, accepted and settled. */}
            <Link className="btn sm" to={`/app/services/${o.id}`}>Open the service</Link>
            <button type="button" className="btn sm" aria-expanded={open === o.id}
                    onClick={() => setOpen((v) => (v === o.id ? '' : o.id))}>
              {open === o.id ? 'Hide' : 'Track order'}
            </button>
          </div>
            ))}
          </Fragment>
          );
        })}
      </div>
    </div>
  );
}

export function RecordServices() {
  const rec = useRecordCtx();
  // The record's own Open / Everything, for the reason written over OpenFilter
  // below: this tab only ever asked for open jobs and had no control to ask
  // for the rest, so a record whose survey, EC and title opinion had all been
  // accepted read as one that had never ordered anything.
  const [closed, setClosed] = useState(false);
  const { data, isLoading, error } = useOrders(rec.id, closed);
  const bare = !closed && !isLoading && !!data && data.length === 0;
  // "2 open · 1 assigned · 1 not assigned yet" — the state of the work, which
  // is what the hanger is asked. The promise about money moved below the
  // heading: it is a standing condition of ordering, not a description of what
  // is on this record.
  //
  // `closed` is the server's own filter, so these rows ARE the open ones until
  // the reader asks for the finished ones too — no second pass over them here.
  const rows = data ?? [];
  const assigned = rows.filter((o) => !!o.assignee).length;
  const servicesSub = data && (closed
    ? `${plural(rows.length, 'service')} · finished ones included`
    : [
      `${rows.length} open`,
      assigned > 0 && `${assigned} assigned`,
      rows.length - assigned > 0 && `${rows.length - assigned} not assigned yet`,
    ].filter(Boolean).join(' · '));
  return (
    <>
      <SectionHead
        title="What Pattadar is doing"
        sub={servicesSub}
        actions={(
          <Link className="btn primary" to={`/app/records/${rec.id}/order`}>
            <HandshakeOutlined sx={{ fontSize: 16 }} /> Order a service
          </Link>
        )}
      />
      <p className="note" style={{ margin: '0 0 var(--space-md)' }}>
        Nothing is taken when you order. Money is set aside on the job, and is only
        owed once you accept what came back.
      </p>
      <div className="split">
        <div>
          {!bare && <OpenFilter closed={closed} setClosed={setClosed} />}
          {isLoading ? <Loading h="12rem" />
            : !data ? <Failed what="This record's services" error={error} boxed h="12rem" />
            : <Rows orders={data} closed={closed} onShowAll={() => setClosed(true)} />}
        </div>

        <aside className="stack">
          {/* What an order actually does, in order, so the wait between placing
              one and hearing anything is a known shape rather than silence.
              The pips on each row say where a job IS; this says what the pips
              mean. */}
          <Card title="What happens next" className="railcard">
            <ul className="railnotes railsteps">
              <li>A checker is assigned from the nearest desk.</li>
              <li>They visit and file dated photos against what they were sent for.</li>
              <li>You get a report on this record, and a line in its audit log.</li>
            </ul>
          </Card>

          {/* Every job carries a thread, and an owner with a question about one
              should not have to find the ticket to ask it — the row's own
              "Message the desk" is the same conversation. This is the way to
              the ones not on this record. */}
          <Card title="Who to ask" className="railcard">
            <p className="note" style={{ margin: 0 }}>
              Each job above has its own thread with the desk doing it. Every service
              across all your records is in one list.
            </p>
            <Link className="link accent" to="/app/services"
                  style={{ display: 'inline-block', marginTop: 'var(--space-sm)', fontSize: '0.8125rem' }}>
              See every service ›
            </Link>
          </Card>
        </aside>
      </div>
    </>
  );
}

/** The server logs a raw verb (`add_paper`, `set_pin`); this is the human
 *  headline for it. An unmapped action falls back to its words spaced out, so a
 *  new server-side action still reads sensibly here before this map catches up
 *  rather than showing a bare snake_case token. */
const HISTORY_PHRASES: Record<string, string> = {
  add_person: 'Person added', update_person: 'Person edited', delete_person: 'Person removed',
  add_feature: 'Feature added', update_feature: 'Feature edited', delete_feature: 'Feature removed',
  add_expense: 'Cost recorded', delete_expense: 'Cost removed',
  add_paper: 'Paper filed', update_paper: 'Paper updated', delete_paper: 'Paper removed',
  add_photo: 'Photo added', set_pin: 'Pin moved', set_boundary: 'Boundary changed',
  'record.corrected': 'Field corrected',
};
function historyPhrase(action: string): string {
  return HISTORY_PHRASES[action] || action.replace(/[._]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export function RecordHistory() {
  const rec = useRecordCtx();
  const { data, isLoading } = useRecordHistory(rec.id);
  return (
    <>
      <SectionHead
        title="What has happened here"
        sub={data && `${plural(data.length, 'change')} · newest first · nothing here can be removed`}
      />
      <p className="note" style={{ margin: '0 0 var(--space-md)' }}>
        Every change to this record is kept here — a paper filed, a cost recorded,
        a person added, the pin moved. Nothing on this list can be edited or removed.
      </p>
      <div>
        {isLoading ? <Loading h="10rem" /> : (data ?? []).length === 0 ? (
          <div className="card">
            <p className="note">
              Nothing has been changed on this record yet. As you file papers, record
              costs, add people or move the pin, each action is logged here with who
              did it and when.
            </p>
          </div>
        ) : (
          <div className="card" style={{ padding: 0 }}>
            <div className="rows boxed">
              {(data ?? []).map((e) => (
                <div key={e.id}>
                  <span className="grow">
                    <strong style={{ fontSize: '0.9375rem' }}>{historyPhrase(e.action)}</strong>
                    {e.detail && (
                      <span className="note" style={{ display: 'block', marginTop: '0.125rem' }}>
                        {e.detail}
                      </span>
                    )}
                  </span>
                  <span className="note" style={{ textAlign: 'right', flex: 'none' }}>
                    {ddmmyyyy(e.at.slice(0, 10))}
                    <span style={{ display: 'block' }}>{e.by}</span>
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </>
  );
}

/** Open, or everything. A finished job stops being work and starts being
 *  evidence, so it leaves the default list — but an owner asked "what did the
 *  survey cost last August" has nowhere else to look, and a closed job that
 *  cannot be found reads as a job that was never done. */
function OpenFilter({ closed, setClosed }: { closed: boolean; setClosed: (v: boolean) => void }) {
  return (
    <div className="row tight" style={{ marginBottom: 'var(--space-md)' }}>
      <Chip active={!closed} onClick={() => setClosed(false)}>Open</Chip>
      <Chip active={closed} onClick={() => setClosed(true)}>Everything, including done</Chip>
    </div>
  );
}

/** The orders that have come back and need a decision.
 *
 *  This page was titled "Assigned to me" and ran the identical query to
 *  Services — same arguments, same cache key, same rows — so two entries in
 *  the nav led to the same list, and a page promising the things other people
 *  were waiting on you for listed orders that were Placed with nobody on them.
 *  There is no inbound work to show and no way to ask for it: `orders` is
 *  scoped to the requests this account placed, and `assignee` is free text
 *  naming a surveyor or an advocate, never a Pattadar user. Showing work
 *  handed TO you would need an assignee user id on work_requests and a
 *  resolver that reads it — a schema change, not a filter.
 *
 *  What the data does answer is which of your own orders are sitting on your
 *  decision, so that is the question this asks now.
 *
 *  The Open / Everything chips went with the old title: a finished job is not
 *  waiting on anybody, so the second chip re-asked the first one's question.
 *  Everything ordered, done included, is one screen away under Services, and
 *  the lede says so. */
export function Assigned() {
  const { data, isLoading, error } = useOrders();
  const waiting = (data ?? []).filter((o) => o.needsYou || o.pendingReview > 0);
  return (
    <main>
      <PageHead eyebrow="Work on your records" title="Waiting on you">
        <p className="lede">
          Orders that have come back and need your decision. Everything you have
          ordered, finished jobs included, is under Services.
        </p>
      </PageHead>
      {isLoading ? <Loading h="14rem" />
        : !data ? <Failed what="Work waiting on you" error={error} boxed h="16rem" />
        : (
          <Rows
            orders={waiting} showRecord
            empty={(
              <Empty
                boxed h="16rem" icon="ok" title="Nothing is waiting on you"
                action={(
                  <Link className="btn sm" to="/app/services">
                    Everything you have ordered
                  </Link>
                )}
              >
                When work you ordered comes back, it waits here until you accept it
                or send it back. Money stays set aside until you do.
              </Empty>
            )}
          />
        )}
    </main>
  );
}

export function Services() {
  const [closed, setClosed] = useState(false);
  const { data, isLoading, error } = useOrders(undefined, closed);
  const bare = !closed && !isLoading && !!data && data.length === 0;
  return (
    <main>
      <PageHead
        eyebrow="Services"
        title="Work you can order"
        actions={
          // Straight into ordering. The page asks which property first, because
          // an order that is not against one piece of land cannot be worked on
          // — sending people to the list to find it was a detour, not an answer.
          <Link className="btn primary" to="/app/order">
            <HandshakeOutlined sx={{ fontSize: 16 }} /> Order a service
          </Link>
        }
      >
        {/* Not "paid from your wallet, held in escrow": placing an order takes
            nothing from anybody. Funding is a separate, later act on the ticket
            (`fund_ticket`), what it puts behind the job is set aside and not
            spent, and the money is only owed once the owner accepts what came
            back. That is what the order flow one click away says and what the
            ticket says on arrival, and two screens that far apart must not
            disagree about the owner's money. */}
        <p className="lede">
          A licensed surveyor, an advocate&rsquo;s title opinion, an encumbrance search, a
          caretaker&rsquo;s visit. Ordered against one record &mdash; nothing is taken when you
          order. Money is set aside on the job afterwards, and is only owed once you accept
          what came back.
        </p>
      </PageHead>
      {!bare && <OpenFilter closed={closed} setClosed={setClosed} />}
      {isLoading ? <Loading h="14rem" />
        : !data ? <Failed what="Work you have ordered" error={error} boxed h="16rem" />
        : <Rows orders={data} showRecord closed={closed} onShowAll={() => setClosed(true)} />}
    </main>
  );
}
