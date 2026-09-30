/** The Services hanger on a record, and the same rows as a standalone list.
 *
 *  An order is the one place money leaves the app on someone else's word, so
 *  the row says what state it is really in, who is doing it and what is still
 *  set aside on it — never just "in progress". The four pips stay, because they
 *  are what a glance down a list reads; the status chip after the title is what
 *  the owner acts on, said once, and "Sent out" and "Waiting on you" have no
 *  pip of their own. */
import { Fragment, useMemo, useState } from 'react';
import type { MouseEvent, ReactNode } from 'react';
import { Link, useNavigate } from 'react-router';
import HandshakeOutlined from '@mui/icons-material/HandshakeOutlined';
import AccessTimeOutlined from '@mui/icons-material/AccessTimeOutlined';

import { actionLabel, eventEntity } from '@pattadar/core';

import { HISTORY_CAP, useAssignRequest, useAssignable, useOrders, useRecordHistory } from '../api';
import type { Order } from '../api';
import {
  Empty, FacetFilter, Failed, Loading, Menu, ORDER_MOVE_FAILED, ORDER_STAGES, PageHead, Rail, StatusChip,
  ddmmyyyy, inr, num, plural,
} from '../ui';
import { fmtLocal } from '../../lib/format';
import type { FacetFilterGroup } from '../ui';
import { useRecordCtx } from './Record';
import { SectionHead } from './RecordHead';
import { AssignedResourceProof } from '../AssignedResourceProof';

/** What a refused move says: the order page's own sentence (ui.tsx), because
 *  the same order refused in two places must not sound like two different
 *  problems. */
const MOVE_FAILED = ORDER_MOVE_FAILED;

/** One status per order, in one word. "Needs you" used to be a second pill
 *  beside the status "Waiting on you" — the same fact twice, and with the word
 *  under the pips and the "to look at" tag, one state said four ways. It is
 *  folded in: an order the server flags as needing the owner reads "Waiting on
 *  you", the ticket machine's word for that state (ticketing.STATUS_LABEL),
 *  even on an older row whose status was worked out from its stage. */
const statusOf = (o: Order) => (o.needsYou
  ? { word: 'Waiting on you', state: 'warn' }
  : { word: o.statusLabel || o.stageLabel, state: o.statusState });

/** A job nobody can be put on any more. `assignRequest` refuses a closed
 *  ticket outright, so the two closed statuses are what decides whether the
 *  picker is a control or a trap. `Order` carries no `closed` field of its
 *  own; adding one to the GraphQL type would survive a ninth status better
 *  than this does. */
const isClosed = (o: Order) => o.status === 'accepted' || o.status === 'cancelled';

const recordTypeLabel = (order: Order) => {
  const key = order.recordClassification || order.recordKind;
  const known: Record<string, string> = {
    agri: 'Agricultural land', open_plot: 'Open plot', house: 'House',
    flat: 'Flat', apartment: 'Apartment', shop: 'Shop', commercial: 'Commercial building',
    parcel: 'Land parcel', property: 'Built property',
  };
  return known[key] ?? key.replaceAll('_', ' ').replace(/^./, (letter) => letter.toUpperCase());
};

type ServiceFilterKey = 'record' | 'service' | 'propertyType' | 'location' | 'status';
type ServiceFilters = Record<ServiceFilterKey, string[]>;
const emptyServiceFilters = (): ServiceFilters => ({
  record: [], service: [], propertyType: [], location: [], status: [],
});

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
        No providers yet.
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

/** The order rows. No illustration: a picture helps where a service is being
 *  chosen (OrderLand, OrderService), and in a list of orders already placed it
 *  was a 4rem thumbnail repeating the title beside it. */
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
        title={closed ? 'No orders yet' : 'No open orders'}
        // The "including done" view is the one question an empty Open list
        // raises — "did I have any?" — so it is offered here, where it is the
        // answer, rather than as a filter chip above an empty box.
        action={!closed && onShowAll ? (
          <button type="button" className="btn sm" onClick={onShowAll}>
            Show all
          </button>
        ) : undefined}
      />
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
                <span>{plural(group.items.length, 'order')}</span>
                <span className="num">{inr(total)}</span>
                <span className="note">
                  {needsYou > 0 ? `${needsYou} waiting on you`
                    : done === group.items.length ? 'Complete'
                      : `${done} of ${group.items.length} complete`}
                </span>
              </div>
            )}
            {group.items.map((o) => {
              const status = statusOf(o);
              return (
          <div key={o.id} className="service-order-row">
            <span className="grow">
              <span className="row tight">
                <strong style={{ fontSize: '0.9375rem' }}>{o.title}</strong>
                <span className="mono note">{o.ref}</span>
                {/* The status, once, as the same chip /app/services draws. The
                    four pips cannot say "sent out and unanswered" or "waiting
                    on you", and those are the two states an owner acts on. */}
                <StatusChip state={status.state}>{status.word}</StatusChip>
                {o.pendingReview > 0 && (
                  <StatusChip state="warn">{o.pendingReview} to review</StatusChip>
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
              {/* Pips only: the word is the chip above. */}
              <Rail stage={o.stage} steps={ORDER_STAGES} pipsOnly />
              {open === o.id && (
                <div className="card" style={{ marginTop: 'var(--space-sm)' }}>
                  {/* `assigneeRef` is the associates row behind the name, or
                      '' for a name somebody typed into a box. The distinction
                      is the difference between a person Pattadar can reach on
                      the owner's behalf and a string — and the row read
                      identically for both until this pill. */}
                  <p className="note">
                    <strong>{o.stageLabel}</strong>
                    {o.dueDate && <> · due {ddmmyyyy(o.dueDate)}</>}
                    {o.assignee && (
                      <>
                        {' · with '}{o.assignee}{' '}
                        {o.assigneeRef
                          ? <span className="pill managed">Pattadar member</span>
                          : '(a name you typed)'}
                      </>
                    )}
                  </p>
                  {o.assignedResource && <AssignedResourceProof resource={o.assignedResource} />}
                  {/* What was actually asked for. An order you cannot read back
                      is one you have to ring someone to understand. */}
                  {/* Placed but unassigned: this is where somebody is put on
                      it. The owner asked; who does it is decided here. An
                      accepted or cancelled job is past that — the server
                      refuses the move — so it says nobody was ever on it
                      rather than offering a picker that quietly does nothing. */}
                  {!o.assignee && (isClosed(o) ? (
                    <p className="note" style={{ marginTop: 'var(--space-sm)' }}>
                      Never assigned.
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
                      No details recorded.
                    </p>
                  )}
                </div>
              )}
            </span>
            <span className="service-order-money">
              <span className="num" style={{ display: 'block' }}>{inr(o.cost)}</span>
              {/* What is actually set aside on this order, which is not always
                  what it was quoted at — an order nobody funded reads ₹2,900
                  and has nothing behind it. "Set aside" and not "paid": nothing
                  has been taken from any account. */}
              {o.held > 0 && (
                <span className="note" style={{ display: 'block' }}>{inr(o.held)} held</span>
              )}
              {o.dueDate && (
                <span className="note row tight service-order-due">
                  <AccessTimeOutlined sx={{ fontSize: 12 }} titleAccess="Due" /> {ddmmyyyy(o.dueDate)}
                </span>
              )}
            </span>
            {/* Beside Track order, not instead of it. The panel answers "where
                is it" without leaving the list; the ticket is where it is sent
                out, reviewed, accepted and settled. */}
            <span className="row tight service-order-actions">
              <Link className="btn sm" to={`/app/services/${o.id}`}>Open order</Link>
              <button type="button" className="btn sm" aria-expanded={open === o.id}
                      onClick={() => setOpen((v) => (v === o.id ? '' : o.id))}>
                {open === o.id ? 'Hide' : 'Track'}
              </button>
            </span>
          </div>
              );
            })}
          </Fragment>
          );
        })}
      </div>
    </div>
  );
}

export function RecordServices() {
  const rec = useRecordCtx();
  // The record's own Open / All, for the reason written over OpenFilter
  // below: this tab only ever asked for open orders and had no control to ask
  // for the rest, so a record whose survey, EC and title opinion had all been
  // accepted read as one that had never ordered anything.
  const [closed, setClosed] = useState(false);
  const { data, isLoading, error } = useOrders(rec.id, closed);
  const bare = !closed && !isLoading && !!data && data.length === 0;
  // "2 open · 1 assigned · 1 unassigned" — the state of the work, which is
  // what the hanger is asked. The promise about money is behind the ⓘ: it is a
  // standing condition of ordering, not a description of what is on this
  // record, and /app/services keeps it in the same place.
  //
  // `closed` is the server's own filter, so these rows ARE the open ones until
  // the reader asks for the finished ones too — no second pass over them here.
  const rows = data ?? [];
  const assigned = rows.filter((o) => !!o.assignee).length;
  const servicesSub = data && (closed
    ? `${plural(rows.length, 'order')} · Includes completed`
    : [
      `${rows.length} open`,
      assigned > 0 && `${assigned} assigned`,
      rows.length - assigned > 0 && `${rows.length - assigned} unassigned`,
    ].filter(Boolean).join(' · '));
  return (
    <>
      {/* No "Order a service" here: the property's own header carries it on
          all nine tabs, and a second copy one fold down was the same
          destination twice. The rail's one link ("See every service ›", to a
          page titled Services that lists orders) is this head's text action
          now, under the name the rest of the app gives that list. */}
      <SectionHead
        title="Service orders"
        info="You pay only after you accept the work."
        sub={servicesSub}
        actions={<Link className="link" to="/app/services">All your service orders</Link>}
      />
      <div>
        {!bare && <OpenFilter closed={closed} setClosed={setClosed} />}
        {isLoading ? <Loading h="12rem" what="this property's service orders" />
          : !data ? <Failed what="This property's service orders" error={error} boxed h="12rem" />
          : <Rows orders={data} closed={closed} onShowAll={() => setClosed(true)} />}
      </div>
    </>
  );
}

/** The property's own Activity tab.
 *
 *  Every row is worded by the one table Account → Activity uses too (core's
 *  `actionLabel`), so the same event never reads two ways; the private phrase
 *  map this used to keep drifted into a second grammar ("Document filed" beside
 *  "Add Note"). A stored detail that only restates the action is dropped
 *  (`eventEntity`), a correction shows its field with the old value struck, and
 *  the time is the owner's local time: `at` is a UTC timestamp, and its first
 *  ten characters were the UTC day, a day early before 05:30 IST. */
export function RecordHistory() {
  const rec = useRecordCtx();
  const { data, isLoading, error, refetch } = useRecordHistory(rec.id);
  const rows = data ?? [];
  const capped = rows.length >= HISTORY_CAP;
  return (
    <>
      <SectionHead
        title="Activity"
        sub={data && (capped
          ? `Latest ${num(HISTORY_CAP)} changes · Newest first`
          : rows.length > 1
            ? `${plural(rows.length, 'change')} · Newest first`
            : plural(rows.length, 'change'))}
      />
      <div>
        {isLoading ? (
          <Loading h="10rem" what="this property's activity" />
        ) : !data ? (
          // A read that failed is not a property where nothing ever changed.
          <Failed what="This property's activity" error={error} boxed h="10rem"
                  onRetry={() => void refetch()} />
        ) : rows.length === 0 ? (
          <Empty boxed h="10rem" title="No activity recorded yet" />
        ) : (
          <div className="card" style={{ padding: 0 }}>
            <div className="rows boxed">
              {rows.map((e) => {
                const detail = e.action === 'record.corrected' ? '' : eventEntity(e.action, '', e.detail);
                return (
                  <div key={e.id}>
                    <span className="grow">
                      <strong style={{ fontSize: '0.9375rem' }}>{actionLabel(e.action)}</strong>
                      {e.field && (
                        <span className="note" style={{ display: 'block', marginTop: '0.125rem' }}>
                          {e.field}: <s>{e.was || '—'}</s> → {e.now || '—'}
                        </span>
                      )}
                      {detail && (
                        <span className="note" style={{ display: 'block', marginTop: '0.125rem' }}>
                          {detail}
                        </span>
                      )}
                    </span>
                    <span className="note" style={{ textAlign: 'right', flex: 'none' }}>
                      {fmtLocal(e.at)}
                      <span style={{ display: 'block' }}>{e.by}</span>
                    </span>
                  </div>
                );
              })}
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
  // The segmented control /app/services uses for the same question, so a
  // scope toggle is drawn in a wash and never takes the amber fill that means
  // "act".
  return (
    <div className="segmented" role="group" aria-label="Which orders"
         style={{ marginBottom: 'var(--space-md)' }}>
      <button type="button" aria-pressed={!closed} onClick={() => setClosed(false)}>Open</button>
      <button type="button" aria-pressed={closed} onClick={() => setClosed(true)}>All</button>
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
 *  Everything ordered, done included, is one screen away under Services. */
export function Assigned() {
  const { data, isLoading, error } = useOrders();
  const waiting = (data ?? []).filter((o) => o.needsYou || o.pendingReview > 0);
  return (
    <main>
      <PageHead eyebrow="Needs your action" title="Waiting on you" />
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
                    All your service orders
                  </Link>
                )}
              />
            )}
          />
        )}
    </main>
  );
}

/** The Services list as a Material 3 data table.
 *
 *  One row per order, noun columns, the status as a chip, and the whole row
 *  opening the order. The service name is the row's real link, so keyboard and
 *  screen-reader users get the same target the pointer does; everything else
 *  on the row (the property, the kebab) is its own control and does not also
 *  fire the row. Assigning, messaging and settling live on the order itself. */
function OrderTable({ orders }: { orders: Order[] }) {
  const nav = useNavigate();
  const open = (e: MouseEvent<HTMLTableRowElement>, id: string) => {
    // A click that landed on a link, a button or the menu is that control's.
    if ((e.target as HTMLElement).closest('a, button, [role="menu"]')) return;
    nav(`/app/services/${id}`);
  };
  return (
    <div className="datatable-wrap">
      <div className="scroll-x">
        <table className="datatable">
          <thead>
            <tr>
              <th scope="col">Service</th>
              <th scope="col">Property</th>
              <th scope="col">Status</th>
              <th scope="col">Due</th>
              <th scope="col" className="right">Cost</th>
              <th scope="col" className="menucol" aria-label="Actions" />
            </tr>
          </thead>
          <tbody>
            {orders.map((o) => (
              <tr key={o.id} onClick={(e) => open(e, o.id)}>
                <td>
                  <Link className="primary" to={`/app/services/${o.id}`}>{o.title}</Link>
                  <span className="sub mono">{[o.ref, o.batchRef].filter(Boolean).join(' · ')}</span>
                </td>
                <td>
                  {o.recordTitle
                    ? <Link className="accent" to={`/app/records/${o.recordId}`}
                            style={{ textDecoration: 'none' }}>{o.recordTitle}</Link>
                    : '—'}
                </td>
                <td>
                  <span className="row tight" style={{ flexWrap: 'wrap' }}>
                    <StatusChip state={statusOf(o).state}>{statusOf(o).word}</StatusChip>
                    {o.pendingReview > 0 && (
                      <StatusChip state="warn">{o.pendingReview} to review</StatusChip>
                    )}
                  </span>
                </td>
                <td className="num-nowrap" style={{ whiteSpace: 'nowrap' }}>{ddmmyyyy(o.dueDate) || '—'}</td>
                <td className="num">
                  {inr(o.cost)}
                  {o.held > 0 && <span className="sub">{inr(o.held)} held</span>}
                </td>
                <td className="menucol">
                  <Menu label={`Actions for ${o.title}`} header={o.title} items={[
                    { label: 'Open order', onClick: () => nav(`/app/services/${o.id}`) },
                    ...(o.recordId ? [{
                      label: 'Open property', onClick: () => nav(`/app/records/${o.recordId}`),
                    }] : []),
                  ]} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="datatable-foot" role="status">
        {orders.length === 0 ? 'No orders' : `1–${orders.length} of ${orders.length}`}
      </div>
    </div>
  );
}

export function Services() {
  const [closed, setClosed] = useState(false);
  const [filters, setFilters] = useState<ServiceFilters>(emptyServiceFilters);
  const { data, isLoading, error } = useOrders(undefined, closed);
  const bare = !closed && !isLoading && !!data && data.length === 0;
  const groups = useMemo<FacetFilterGroup[]>(() => {
    const rows = data ?? [];
    const facet = (
      key: ServiceFilterKey, label: string,
      valueOf: (order: Order) => string, labelOf: (order: Order) => string,
    ): FacetFilterGroup => {
      const options = new Map<string, { label: string; count: number }>();
      rows.forEach((order) => {
        const value = valueOf(order);
        if (!value) return;
        const current = options.get(value);
        options.set(value, { label: current?.label ?? labelOf(order), count: (current?.count ?? 0) + 1 });
      });
      return {
        key, label,
        options: [...options].map(([optionKey, option]) => ({ key: optionKey, ...option }))
          .sort((a, b) => a.label.localeCompare(b.label)),
      };
    };
    return [
      facet('record', 'Property', (order) => order.recordId, (order) => order.recordTitle),
      facet('service', 'Service', (order) => order.kind, (order) => order.title),
      facet('propertyType', 'Property type',
        (order) => `${order.recordKind}:${order.recordClassification}`, recordTypeLabel),
      facet('location', 'Location', (order) => order.recordLocation, (order) => order.recordLocation),
      facet('status', 'Status', (order) => order.status, (order) => order.statusLabel),
    ];
  }, [data]);
  const filtered = useMemo(() => {
    const accepts = (key: ServiceFilterKey, value: string) =>
      filters[key].length === 0 || filters[key].includes(value);
    return (data ?? []).filter((order) => {
      const recordKey = `${order.recordKind}:${order.recordClassification}`;
      return accepts('record', order.recordId)
        && accepts('service', order.kind)
        && accepts('propertyType', recordKey)
        && accepts('location', order.recordLocation)
        && accepts('status', order.status);
    });
  }, [data, filters]);
  const hasFilters = Object.values(filters).some((values) => values.length > 0);
  const toggleFilter = (groupKey: string, optionKey: string) => {
    const key = groupKey as ServiceFilterKey;
    setFilters((current) => ({
      ...current,
      [key]: current[key].includes(optionKey)
        ? current[key].filter((value) => value !== optionKey)
        : [...current[key], optionKey],
    }));
  };
  const clearFilters = () => setFilters(emptyServiceFilters());
  // Open | All is a view of the same list, so it sits in the one filter bar
  // rather than as a second row of chips above it.
  const scope = (
    <div className="segmented" role="group" aria-label="Which orders">
      <button type="button" aria-pressed={!closed} onClick={() => setClosed(false)}>Open</button>
      <button type="button" aria-pressed={closed} onClick={() => setClosed(true)}>All</button>
    </div>
  );
  return (
    <main>
      <PageHead
        title="Services"
        // Payment terms: must match the order flow and the order page.
        info="You pay only after you accept the work."
        actions={
          // Straight into ordering. The page asks which property first, because
          // an order that is not against one piece of land cannot be worked on
          // — sending people to the list to find it was a detour, not an answer.
          <Link className="btn primary" to="/app/order">
            <HandshakeOutlined sx={{ fontSize: 16 }} /> Order a service
          </Link>
        }
      />
      {!bare && data && (
        <FacetFilter
          groups={groups}
          selected={filters}
          onToggle={toggleFilter}
          onClear={clearFilters}
          trailing={scope}
          ariaLabel="Filter orders"
        />
      )}
      {isLoading ? <Loading h="14rem" />
        : !data ? <Failed what="Your service orders" error={error} boxed h="16rem" />
        : filtered.length === 0 ? (
          hasFilters ? (
            <Empty boxed h="14rem" icon="search" title="No orders match these filters"
                   action={<button type="button" className="btn sm" onClick={clearFilters}>Clear filters</button>} />
          ) : closed ? (
            <Empty boxed h="14rem" icon="clock" title="No orders yet" />
          ) : (
            <Empty boxed h="14rem" icon="clock" title="No open orders"
                   action={<button type="button" className="btn sm" onClick={() => setClosed(true)}>Show all</button>} />
          )
        ) : <OrderTable orders={filtered} />}
    </main>
  );
}
