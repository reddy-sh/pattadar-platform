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
import { Link, useNavigate, useSearchParams } from 'react-router';
import HandshakeOutlined from '@mui/icons-material/HandshakeOutlined';
import AccessTimeOutlined from '@mui/icons-material/AccessTimeOutlined';
import FileDownloadOutlined from '@mui/icons-material/FileDownloadOutlined';

import { actionLabel, eventEntity } from '@pattadar/core';

import { HISTORY_CAP, useOrders, useRecordHistory } from '../api';
import type { Order } from '../api';
import {
  Card, Empty, classWord, FacetFilter, Failed, Menu, ORDER_STAGES, PageHead, Rail, SelectAllBox, SelectCell,
  Segmented, SelectionBar, StatusChip, TablePager, Th, ToolbarBand, ViewToggle, ddmmyyyy, downloadCsv, inr, inrOr, num, plural,
  sortBy, usePaged, useRowSelection,
} from '../ui';
import { Sk, SkGrid, SkTable } from '../skeletons';
import { fmtLocal } from '../../lib/format';
import type { FacetFilterGroup, SortState } from '../ui';
import { useRecordCtx } from './Record';
import { SectionHead } from './RecordHead';
import { AssignedResourceProof } from '../AssignedResourceProof';

/** One status per order, in one word. "Needs you" used to be a second pill
 *  beside the status "Waiting on you" — the same fact twice, and with the word
 *  under the pips and the "to look at" tag, one state said four ways. It is
 *  folded in: an order the server flags as needing the owner reads "Waiting on
 *  you", the ticket machine's word for that state (ticketing.STATUS_LABEL),
 *  even on an older row whose status was worked out from its stage. */
const statusOf = (o: Order) => (o.needsYou
  ? { word: 'Waiting on you', state: 'warn' }
  : { word: o.statusLabel || o.stageLabel, state: o.statusState });

/** An order that is over: accepted or cancelled. `Order` carries no `closed`
 *  field of its own; adding one to the GraphQL type would survive a ninth
 *  status better than this does. */
const isClosed = (o: Order) => o.status === 'accepted' || o.status === 'cancelled';

const recordTypeLabel = (order: Order) => classWord(order.recordClassification || order.recordKind);

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

/** The order rows while their first read is pending (design.md § Loading):
 *  the same card, ruled rows and `service-order-row` grid as Rows — title and
 *  chip, the detail, the pips; the money; the two buttons — so nothing moves
 *  when the orders land. */
function SkOrderRows({ label, rows = 3 }: { label: string; rows?: number }) {
  return (
    <Card flush>
      <div role="status" aria-busy="true" aria-label={label} className="rows boxed">
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} className="service-order-row" aria-hidden>
            <span className="grow">
              <span className="row tight">
                <Sk w={`${9 + ((i * 3) % 5)}rem`} h="0.9375rem" />
                <Sk w="4.5rem" h="1.375rem" r="var(--radius-pill)" />
              </span>
              <Sk w={`${12 + ((i * 5) % 7)}rem`} h="0.8125rem" style={{ margin: '0.25rem 0 0.4375rem' }} />
              <Sk w="6rem" h="0.5rem" r="var(--radius-pill)" />
            </span>
            <span className="service-order-money">
              <Sk w="4rem" style={{ marginLeft: 'auto' }} />
            </span>
            <span className="row tight service-order-actions">
              <Sk w="6.5rem" h="2rem" r="var(--radius-pill)" />
              <Sk w="7.5rem" h="2rem" r="var(--radius-pill)" />
            </span>
          </div>
        ))}
      </div>
    </Card>
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
                {/* The status, once, as the same chip /services draws. The
                    four pips cannot say "sent out and unanswered" or "waiting
                    on you", and those are the two states an owner acts on. */}
                <StatusChip state={status.state}>{status.word}</StatusChip>
                {o.pendingReview > 0 && (
                  <StatusChip state="warn">{o.pendingReview} to review</StatusChip>
                )}
                {showRecord && o.recordTitle && (
                  <Link to={`/properties/${o.recordId}/services`} className="note accent"
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
                          ? <span className="pill managed">Pattadar provider</span>
                          : '(a name you typed)'}
                      </>
                    )}
                  </p>
                  {o.assignedResource && <AssignedResourceProof resource={o.assignedResource} />}
                  {/* What was actually asked for. An order you cannot read back
                      is one you have to ring someone to understand. */}
                  {/* Who does the work is Pattadar desk's decision, never the
                      owner's (service order spec §7), so there is no picker
                      here. A closed order nobody was on says so once. */}
                  {!o.assignee && isClosed(o) && (
                    <p className="note" style={{ marginTop: 'var(--space-sm)' }}>
                      Never assigned.
                    </p>
                  )}
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
              <Link className="btn sm" to={`/services/${o.id}`}>Open order</Link>
              <button type="button" className="btn sm" aria-expanded={open === o.id}
                      onClick={() => setOpen((v) => (v === o.id ? '' : o.id))}>
                {/* Opposite words for a toggle (naming standard A6). */}
                {open === o.id ? 'Hide progress' : 'Show progress'}
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
  // The record's own Open / All, for the reason written over WhichOrders
  // below: this tab only ever asked for open orders and had no control to ask
  // for the rest, so a record whose survey, EC and title opinion had all been
  // accepted read as one that had never ordered anything.
  const [closed, setClosed] = useState(false);
  const q = useOrders(rec.id, closed);
  const { data, isLoading, error } = q;
  // Open -> All keeps the last rows, dimmed and inert, until the answer lands.
  const stale = q.isPlaceholderData;
  const bare = !closed && !isLoading && !!data && data.length === 0;
  // "2 open · 1 assigned · 1 unassigned" — the state of the work, which is
  // what the hanger is asked. The promise about money is behind the ⓘ: it is a
  // standing condition of ordering, not a description of what is on this
  // record, and /services keeps it in the same place.
  //
  // `closed` is the server's own filter, so these rows ARE the open ones until
  // the reader asks for the finished ones too — no second pass over them here.
  const rows = data ?? [];
  const assigned = rows.filter((o) => !!o.assignee).length;
  // No sub on an empty read (zero figures are dropped), and no "Includes
  // completed": the Open | All control under the head already says which.
  const servicesSub = data && rows.length > 0 && (closed
    ? plural(rows.length, 'order')
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
        controls={<Link className="link" to="/services">All your service orders</Link>}
      />
      {/* Open | All is a scope, so it sits in the tab's band, not the head
          (design.md § Page head, slot 5). */}
      {!bare && <ToolbarBand left={<WhichOrders closed={closed} setClosed={setClosed} />} />}
      <div>
        {isLoading ? <SkOrderRows label="Loading this property's service orders" />
          : !data ? <Failed what="This property's service orders" error={error} boxed h="12rem" />
          : (
            <div aria-busy={stale}
                 style={{ opacity: stale ? 0.6 : 1, pointerEvents: stale ? 'none' : undefined,
                   transition: 'opacity var(--dur-fast) var(--ease-out)' }}>
              <Rows orders={data} closed={closed} onShowAll={() => setClosed(true)} />
            </div>
          )}
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
        // Counts only: the dates on the rows already show the order, and an
        // empty trail says so in its own card.
        sub={data && rows.length > 0 && (capped
          ? `Latest ${num(HISTORY_CAP)} changes`
          : plural(rows.length, 'change'))}
      />
      <div>
        {isLoading ? (
          // The same card and ruled rows as the trail: what changed and its
          // detail on the left, when and who on the right.
          <Card flush>
            <div role="status" aria-busy="true" aria-label="Loading this property's activity"
                 className="rows boxed">
              {Array.from({ length: 4 }, (_, i) => (
                <div key={i} aria-hidden>
                  <span className="grow">
                    <Sk w={`${8 + ((i * 3) % 6)}rem`} h="0.9375rem" />
                    <Sk w={`${11 + ((i * 5) % 8)}rem`} h="0.8125rem" style={{ marginTop: '0.125rem' }} />
                  </span>
                  <span style={{ flex: 'none', display: 'grid', justifyItems: 'end', gap: '0.125rem' }}>
                    <Sk w="7.5rem" h="0.8125rem" />
                    <Sk w="5rem" h="0.8125rem" />
                  </span>
                </div>
              ))}
            </div>
          </Card>
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
                // A source line the detail already says (record.source_bound) shows once.
                const detail = e.action === 'record.corrected' || (e.source && e.source === e.detail)
                  ? '' : eventEntity(e.action, '', e.detail);
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
                      {/* What the record was created from (D2). */}
                      {e.source && (
                        <span className="note" style={{ display: 'block', marginTop: '0.125rem' }}>
                          {e.source}
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

/** Open | All, the one scope control both order lists share (ui.tsx
 *  `Segmented`). A finished job stops being work and starts being evidence,
 *  so it leaves the default list — but a closed job that cannot be found
 *  reads as a job that was never done. */
function WhichOrders({ closed, setClosed }: { closed: boolean; setClosed: (v: boolean) => void }) {
  return (
    <Segmented
      label="Which orders"
      options={[{ value: 'open', label: 'Open' }, { value: 'all', label: 'All' }]}
      value={closed ? 'all' : 'open'}
      onChange={(v) => setClosed(v === 'all')}
    />
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
  const toReview = waiting.reduce((sum, o) => sum + o.pendingReview, 0);
  return (
    <main>
      {/* Nothing to add from here and nothing to narrow, so the head is the
          title and, once something is waiting, its count (design.md § Page
          head: no summary when there is nothing to count). */}
      <PageHead
        title="Waiting on you"
        summary={isLoading ? <Sk w="18rem" h="1rem" r="var(--radius-xs)" />
          : waiting.length > 0
          ? [plural(waiting.length, 'order'), toReview > 0 && `${num(toReview)} to review`]
            .filter(Boolean).join(' · ')
          : undefined}
      />
      {isLoading ? <SkOrderRows label="Loading the orders waiting on you" />
        : !data ? <Failed what="Work waiting on you" error={error} boxed h="16rem" />
        : (
          <Rows
            orders={waiting} showRecord
            empty={(
              <Empty
                boxed h="16rem" icon="ok" title="Nothing is waiting on you"
                action={(
                  <Link className="btn sm" to="/services">
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

type OrderSortKey = 'title' | 'due' | 'cost';
const ORDER_SORT: Record<OrderSortKey, (o: Order) => string | number> = {
  title: (o) => o.title.toLowerCase(),
  // DD/MM/YYYY or ISO in, YYYYMMDD out; an order with no due date sorts
  // after the dated ones, not before them.
  due: (o) => ddmmyyyy(o.dueDate).split('/').reverse().join('') || '\uffff',
  cost: (o) => o.cost,
};

const idOf = (o: Order) => o.id;

/** The orders as a CSV, the columns the table shows. */
function exportOrders(orders: Order[]) {
  downloadCsv('pattadar-services.csv', [
    ['Service', 'Reference', 'Property', 'Status', 'Due', 'Cost (₹)', 'Held (₹)'],
    ...orders.map((o) => [
      o.title, [o.ref, o.batchRef].filter(Boolean).join(' · '), o.recordTitle,
      statusOf(o).word, ddmmyyyy(o.dueDate), o.cost, o.held,
    ]),
  ]);
}

type OrderSelection = ReturnType<typeof useRowSelection<Order>>;

/** One order's kebab, the same in the table and on its card. */
const orderMenu = (o: Order, nav: (to: string) => void) => [
  { label: 'Open order', onClick: () => nav(`/services/${o.id}`) },
  ...(o.recordId ? [{ label: 'Open property', onClick: () => nav(`/properties/${o.recordId}`) }] : []),
];

/** The Grid view: a card per order, ticked from the same selection as the
 *  table, so switching views keeps what is picked (design.md § Tables). */
function OrderGrid({ orders, sel, resetKey }: { orders: Order[]; sel: OrderSelection; resetKey: string }) {
  const nav = useNavigate();
  const paged = usePaged(orders, { resetKey, storeKey: 'pattadar.grid.services' });
  return (
    <>
      <div className={`cards${sel.picked.length > 0 ? ' selecting' : ''}`}>
        {paged.shown.map((o) => {
          const on = sel.selected.has(o.id);
          const st = statusOf(o);
          return (
            <div key={o.id} className={`rec groupcard ordercard${on ? ' selected' : ''}`}>
              <div className="meat">
                <div className="groupcard-top">
                  <span className="sel">
                    <input type="checkbox" checked={on} aria-label={`Select ${o.title} ${o.ref}`}
                           onChange={() => sel.toggle(o.id)} />
                  </span>
                  <span className="groupcard-title">
                    <h3>
                      <Link to={`/services/${o.id}`} className="recgo" title={o.title}>
                        {o.title}
                        {/* The whole card opens the order; the box and the menu sit above it. */}
                        <span aria-hidden className="groupcard-hit" />
                      </Link>
                    </h3>
                    <span className="note mono">{[o.ref, o.batchRef].filter(Boolean).join(' · ')}</span>
                  </span>
                  <Menu className="groupcard-menu" label={`Actions for ${o.title}`} header={o.title}
                        items={orderMenu(o, nav)} />
                </div>
                <span className="row tight" style={{ flexWrap: 'wrap' }}>
                  <StatusChip state={st.state}>{st.word}</StatusChip>
                  {o.pendingReview > 0 && <StatusChip state="warn">{o.pendingReview} to review</StatusChip>}
                </span>
                <dl className="groupcard-facts">
                  <div><dt>Property</dt><dd>{o.recordTitle || '—'}</dd></div>
                  <div><dt>Due</dt><dd className="num">{ddmmyyyy(o.dueDate) || '—'}</dd></div>
                  <div>
                    <dt>Cost</dt>
                    <dd className="num">{inr(o.cost)}{o.held > 0 && <> · {inr(o.held)} held</>}</dd>
                  </div>
                </dl>
              </div>
            </div>
          );
        })}
      </div>
      <TablePager {...paged} onSize={paged.setSize} label="Service order pages" />
    </>
  );
}

/** The Services list as a Material 3 data table.
 *
 *  One row per order, noun columns, the status as a chip, and the whole row
 *  opening the order. The service name is the row's real link, so keyboard and
 *  screen-reader users get the same target the pointer does; everything else
 *  on the row (the property, the kebab) is its own control and does not also
 *  fire the row. Assigning, messaging and settling live on the order itself. */
function OrderTable({ orders, sel, resetKey }: { orders: Order[]; sel: OrderSelection; resetKey: string }) {
  const nav = useNavigate();
  const [sort, setSort] = useState<SortState<OrderSortKey>>(null);
  const rows = useMemo(() => sortBy(orders, sort, ORDER_SORT), [orders, sort]);
  const paged = usePaged(rows, {
    resetKey: `${sort?.key ?? ''}${sort?.dir ?? ''}|${resetKey}`, storeKey: 'pattadar.table.services',
  });
  // The footer sums the ticked orders, or else every order the filter lets
  // through — not just this page.
  const summed = sel.picked.length > 0 ? sel.picked : orders;
  const cost = summed.reduce((n, o) => n + o.cost, 0);
  const held = summed.reduce((n, o) => n + o.held, 0);
  const open = (e: MouseEvent<HTMLTableRowElement>, id: string) => {
    // A click that landed on a link, a button, a tick box or the menu is that control's.
    if ((e.target as HTMLElement).closest('a, button, input, td.selcol, .menu-list, [role="menu"]')) return;
    nav(`/services/${id}`);
  };
  return (
    <>
    <Card flush className="scroll-x edgefade">
      <table className="rectable" aria-label="Your service orders" style={{ minWidth: '44rem' }}>
        <thead>
          <tr>
            <th className="selcol">
              <SelectAllBox total={orders.length} picked={sel.picked.length} noun={['order', 'orders']}
                            onToggle={sel.toggleAll} />
            </th>
            <Th k="title" label="Service" sort={sort} setSort={setSort} />
            <th scope="col">Property</th>
            <th scope="col">Status</th>
            <Th k="due" label="Due" sort={sort} setSort={setSort} />
            <Th k="cost" label="Cost" right sort={sort} setSort={setSort} />
            <th scope="col" className="menucol" aria-label="Actions" />
          </tr>
        </thead>
        <tbody>
          {paged.shown.map((o) => (
            <tr key={o.id} className={sel.selected.has(o.id) ? 'openrow selected' : 'openrow'}
                onClick={(e) => open(e, o.id)}>
              <SelectCell checked={sel.selected.has(o.id)} label={`Select ${o.title} ${o.ref}`}
                          onToggle={() => sel.toggle(o.id)} />
              <td>
                <Link className="accent" to={`/services/${o.id}`}
                      style={{ textDecoration: 'none', fontWeight: 700 }}>{o.title}</Link>
                <span className="note mono" style={{ display: 'block' }}>
                  {[o.ref, o.batchRef].filter(Boolean).join(' · ')}
                </span>
              </td>
              <td>
                {o.recordTitle
                  ? <Link className="accent" to={`/properties/${o.recordId}`}
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
              <td className="num" style={{ whiteSpace: 'nowrap' }}>{ddmmyyyy(o.dueDate) || '—'}</td>
              <td className="right num">
                {inr(o.cost)}
                {o.held > 0 && <span className="note" style={{ display: 'block' }}>{inr(o.held)} held</span>}
              </td>
              <td className="menucol">
                <Menu label={`Actions for ${o.title}`} header={o.title} items={orderMenu(o, nav)} />
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td className="selcol" />
            <th scope="row" colSpan={4}>
              {sel.picked.length > 0
                ? `${plural(sel.picked.length, 'order')} selected`
                : `Total · ${plural(orders.length, 'order')}`}
            </th>
            <td className="right num">
              {inr(cost)}
              {held > 0 && <span className="note" style={{ display: 'block' }}>{inr(held)} held</span>}
            </td>
            <td className="menucol" />
          </tr>
        </tfoot>
      </table>
    </Card>
    <TablePager {...paged} onSize={paged.setSize} label="Service order pages" />
    </>
  );
}

export function Services() {
  const [closed, setClosed] = useState(false);
  // Table is this page's default; ?view=grid is the card view (design.md § Tables).
  const [params, setParams] = useSearchParams();
  const view = params.get('view') === 'grid' ? 'grid' : 'table';
  const setView = (v: 'grid' | 'table') => {
    const next = new URLSearchParams(params);
    if (v === 'grid') next.set('view', 'grid'); else next.delete('view');
    setParams(next, { replace: true });
  };
  const [filters, setFilters] = useState<ServiceFilters>(emptyServiceFilters);
  // Both scopes are read: the open orders are the default list, and every
  // order (done included) is what the summary totals and what tells a first
  // visit (nothing ever ordered) from an Open list that is merely empty. The
  // All read is the same query the Open | All toggle asks for, so switching
  // scope is already in the cache.
  const openQ = useOrders(undefined, false);
  const allQ = useOrders(undefined, true);
  const { data, isLoading, error } = closed ? allQ : openQ;
  const everything = allQ.data;
  // First-run empty (design.md § Page head, "Empty states"): nothing has ever
  // been ordered, so the head is the title and its ⓘ, there is no band, and
  // the empty card carries the one filled "Order a service".
  const firstRun = !!everything && everything.length === 0;
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
  // What narrows the list: a change drops the selection and goes back to page 1.
  const narrowKey = `${closed}|${JSON.stringify(filters)}`;
  const sel = useRowSelection(filtered, idOf, narrowKey);
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
  // The account's totals whichever scope is showing (design.md § Page head,
  // slot 3); the band's tally counts what is in view. `cost` is the quote on
  // an open order and what was settled on a closed one (cancel_ticket rewrites
  // it), so a cancelled job adds only what was paid on it.
  const summary = everything && everything.length > 0
    ? [plural(everything.length, 'order'), inrOr(everything.reduce((sum, o) => sum + o.cost, 0), '')]
      .filter(Boolean).join(' · ')
    : undefined;
  const order = {
    // Straight into ordering. The page asks which property first, because an
    // order that is not against one piece of land cannot be worked on —
    // sending people to the list to find it was a detour, not an answer.
    label: 'Order a service',
    icon: <HandshakeOutlined sx={{ fontSize: 16 }} />,
    to: '/order',
  };
  return (
    <main>
      <PageHead
        title="Services"
        // Payment terms: must match the order flow and the order page.
        info="You pay only after you accept the work."
        actions={everything && !firstRun ? { primary: order } : undefined}
        // Placeholder only while a first read is pending; a failed read
        // leaves the Failed card to speak.
        summary={isLoading || (data && allQ.isLoading)
          ? <Sk w="18rem" h="1rem" r="var(--radius-xs)" />
          : data ? summary : undefined}
      />
      {/* Open | All is a view of the same list, so it sits in the one band
          rather than as a second row of chips above it. */}
      {data && !firstRun && (
        <FacetFilter
          groups={groups}
          selected={filters}
          onToggle={toggleFilter}
          onClear={clearFilters}
          tally={`${filtered.length} of ${data.length} shown`}
          view={(
            <span className="row tight">
              <WhichOrders closed={closed} setClosed={setClosed} />
              <ViewToggle views={['grid', 'table']} value={view} onChange={setView} />
            </span>
          )}
          ariaLabel="Filter orders"
        />
      )}
      {isLoading ? (view === 'grid'
          ? <SkGrid label="Loading your service orders" facts={3} />
          : <SkTable label="Loading your service orders" rows={8}
                     cols={[{ head: 'Service' }, { head: 'Property' }, { head: 'Status', w: '5rem' },
                       { head: 'Due', w: '5rem' }, { head: 'Cost', right: true, w: '4rem' }, { head: '', w: '1.5rem' }]} />)
        : !data ? <Failed what="Your service orders" error={error} boxed h="16rem" />
        : firstRun ? (
          <Empty boxed h="14rem" icon="clock" title="No orders yet"
                 action={(
                   <Link className="btn primary" to={order.to}>
                     {order.icon} {order.label}
                   </Link>
                 )} />
        ) : filtered.length === 0 ? (
          // Filtered empty: the head and band stay as they are; the card
          // offers the way out, never a second "Order a service".
          hasFilters ? (
            <Empty boxed h="14rem" icon="search" title="No orders match these filters"
                   action={<button type="button" className="btn sm" onClick={clearFilters}>Clear all</button>} />
          ) : closed ? (
            <Empty boxed h="14rem" icon="clock" title="No orders yet" />
          ) : (
            <Empty boxed h="14rem" icon="clock" title="No open orders"
                   action={<button type="button" className="btn sm" onClick={() => setClosed(true)}>Show all</button>} />
          )
        ) : view === 'grid'
          ? <OrderGrid orders={filtered} sel={sel} resetKey={narrowKey} />
          : <OrderTable orders={filtered} sel={sel} resetKey={narrowKey} />}
      {/* Ticking covers every order the filter lets through, in either view. */}
      <SelectionBar count={sel.picked.length} noun={['order', 'orders']}
                    label="Act on the selected orders" onClear={sel.clear}>
        <button type="button" className="btn sm" onClick={() => exportOrders(sel.picked)}>
          <FileDownloadOutlined sx={{ fontSize: 15 }} /> Export
        </button>
      </SelectionBar>
    </main>
  );
}
