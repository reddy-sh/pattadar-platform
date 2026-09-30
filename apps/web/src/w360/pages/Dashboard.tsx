/** W01 — the portfolio in one screen: what you hold, what it is worth, what is
  *  waiting on you, and where the value actually sits.
 *
 *  Home (26/09/2026, founder decision): user-focused and Material 3 — the
 *  greeting and shortcuts, "For you" (reminders and orders waiting on the
 *  owner in one list), missing details, four overview cards that are also
 *  ways in, recently opened, then recent activity. Value appears only when
 *  something has been valued. */
import { useState } from 'react';
import { Link } from 'react-router';
import AddOutlined from '@mui/icons-material/AddOutlined';
import CloseOutlined from '@mui/icons-material/CloseOutlined';
import FileUploadOutlined from '@mui/icons-material/FileUploadOutlined';
import HandshakeOutlined from '@mui/icons-material/HandshakeOutlined';
import IosShareOutlined from '@mui/icons-material/IosShareOutlined';

import { useAuditTrail } from '../../data/hooks';
import { EMPTY_FILTER, useOrders, usePortfolio, useProperties, useDismissWaiting } from '../api';
import type { Order, Portfolio, RecordCard, WaitingItem } from '../api';
import { Dialog } from '../Dialog';
import { ActivityRow } from './Audit';
import {
  Card, Empty, Failed, Icon, KV, Loading, PageHead, StatusChip, inr, num, plural,
} from '../ui';
import { SetupChecklist } from '../SetupChecklist';

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

export function RecordTile({ rec }: { rec: RecordCard }) {
  const art = rec.classification === 'flat' || rec.classification === 'open_plot'
    ? 'built' : rec.classification === 'shop' ? 'shop' : '';
  return (
    <Link className="rec" to={`/app/records/${rec.id}`}>
      <div className={`art ${art}`}>
        <Icon name={rec.classification} size={44} />
      </div>
      <div className="meat">
        <h3>{rec.title}</h3>
        <p className="note" style={{ marginTop: '0.1875rem' }}>
          {rec.extentUnit === 'ac' ? `${num(rec.extent, 2)} ac` : `${num(rec.extent)} ${rec.extentUnit}`}
          {rec.village ? ` · ${rec.village}` : ''}
        </p>
      </div>
    </Link>
  );
}

/**
 * Where a waiting row can actually be acted on.
 *
 * A row carries no intent and no target: `action_kind` is a style token
 * ('primary' | 'ghost'), and beyond `record_id` the table holds nothing — no
 * link id, no ticket id (waiting_items, web360.py). So the destination is
 * worked out from what the row does carry. A record opens its 360, which is
 * where the papers, the people and the service tickets for it hang. A `lock`
 * row is about something shared out, and every live link — its terms, its days
 * left, its revoke — is on Papers. Anything else has no destination this data
 * can name, so the row carries no navigation rather than a guess that lands
 * the owner on the wrong screen.
 */
function whereTo(w: WaitingItem): { to: string; label: string } | null {
  if (w.recordId) return { to: `/app/records/${w.recordId}`, label: 'Open record' };
  if (w.icon === 'lock') return { to: '/app/papers', label: 'Open Documents' };
  return null;
}

/**
 * One thing waiting on the owner.
 *
 * Every row used to carry a button labelled with the server's `action_label` —
 * "Sign", "Extend", "Combine" — wired, whatever the label said, to
 * `dismissWaiting`, which does nothing but `UPDATE waiting_items SET
 * done=true`. Pressing "Sign" signed nothing and "Extend" left the advocate's
 * link expiring tomorrow; each press silently threw the reminder away instead,
 * with no confirmation and no way back. Those verbs cannot be honoured from
 * here until a row can say what it wants done and to what, so the label is
 * gone and the two controls now say exactly what they do: open where the thing
 * lives, or take the reminder away.
 *
 * The dismiss mutation is per-row, not one shared by the panel, so a dismiss
 * being confirmed on one row does not disable the row under it.
 */
function WaitingRow({ w }: { w: WaitingItem }) {
  const dismiss = useDismissWaiting();
  const [asking, setAsking] = useState(false);
  const go = whereTo(w);

  const drop = async () => {
    try {
      await dismiss.mutateAsync({ id: w.id });
    } catch {
      // The mutation raises its own failure toast with the reason. The dialog
      // stays open, because the reminder is still there and still unwanted.
      return;
    }
    setAsking(false);
  };

  return (
    <div>
      <span className="muted" style={{ display: 'flex', paddingTop: '0.125rem' }}>
        <Icon name={w.icon} size={19} />
      </span>
      <div className="grow">
        <h3>
          {go
            ? <Link to={go.to} style={{ color: 'inherit', textDecoration: 'none' }}>{w.title}</Link>
            : w.title}
        </h3>
        <p className="note" style={{ marginTop: '0.1875rem' }}>{w.detail}</p>
      </div>
      <span className="row tight" style={{ flexWrap: 'nowrap' }}>
        {go && <Link className="btn" to={go.to}>{go.label}</Link>}
        <button
          type="button"
          className="iconbtn"
          aria-label={`Dismiss: ${w.title}`}
          onClick={() => setAsking(true)}
        >
          <CloseOutlined sx={{ fontSize: 16 }} />
        </button>
      </span>

      {/* `dismissWaiting` sets done=true and there is no mutation that sets it
          back, so a dismissal cannot be undone from this screen or any other.
          That is asked for rather than done on one click. */}
      {asking && (
        <Dialog
          title="Dismiss this reminder?"
          busy={dismiss.isPending}
          onClose={() => setAsking(false)}
          footer={
            <>
              <button type="button" className="btn" disabled={dismiss.isPending}
                      onClick={() => setAsking(false)}>
                Keep it
              </button>
              <button type="button" className="btn danger" disabled={dismiss.isPending}
                      onClick={() => { void drop(); }}>
                {dismiss.isPending ? 'Dismissing…' : 'Dismiss it'}
              </button>
            </>
          }
        >
          <p className="note">
            &ldquo;{w.title}&rdquo; cannot be brought back.
          </p>
        </Dialog>
      )}
    </div>
  );
}

/** One order that is waiting on the owner: work came back, or a change asked
 *  for. It opens the order, which is where accepting or answering happens. */
function OrderRow({ o }: { o: Order }) {
  return (
    <div>
      <span className="muted" style={{ display: 'flex', paddingTop: '0.125rem' }}>
        <Icon name="agent" size={19} />
      </span>
      <div className="grow">
        <h3>
          <Link to={`/app/services/${o.id}`} style={{ color: 'inherit', textDecoration: 'none' }}>
            {o.pendingReview > 0 ? `Review submitted work · ${o.title}` : o.title}
          </Link>
        </h3>
        <p className="note" style={{ marginTop: '0.1875rem' }}>
          {[o.ref, o.recordTitle].filter(Boolean).join(' · ')}
        </p>
      </div>
      <span className="row tight" style={{ flexWrap: 'nowrap' }}>
        <StatusChip state={o.statusState}>{o.statusLabel}</StatusChip>
        <Link className="btn" to={`/app/services/${o.id}`}>Open order</Link>
      </span>
    </div>
  );
}

/** "For you": everything that needs the owner, in one list. Reminders and
 *  orders that came back are the same question — what should I do next — so
 *  they are one card, not two. With nothing waiting it is one short line. */
function ForYou({ data, orders }: { data: Portfolio; orders: Order[] }) {
  const total = data.waiting.length + orders.length;
  if (total === 0) {
    return (
      <section className="card foryou-clear" aria-label="For you">
        <span className="up" style={{ display: 'flex' }}><Icon name="ok" size={18} /></span>
        <strong>You're all caught up</strong>
        <span className="note">Nothing needs your attention.</span>
      </section>
    );
  }
  return (
    <Card title="For you" aside={<span className="num muted">{total}</span>}>
      <div className="rows">
        {orders.map((o) => <OrderRow key={o.id} o={o} />)}
        {data.waiting.map((w) => <WaitingRow key={w.id} w={w} />)}
      </div>
    </Card>
  );
}

/** One overview figure that is also a way in (Material 3 summary card). */
function Overview({ label, value, note, to, words }: {
  label: string; value: string; note?: string; to: string;
  /** The value is a word ("Not valued"), not a figure: no tabular face. */
  words?: boolean;
}) {
  return (
    <Link className="ovcard" to={to}>
      <span className="ov-label">{label}</span>
      <span className={words ? 'ov-value' : 'ov-value num'}>{value}</span>
      {note && <span className="ov-note">{note}</span>}
    </Link>
  );
}

/** The four things an owner comes to Home to start. Each lands on the screen
 *  that does it with its dialog already open (`?new=1`, `?do=`), so none is a
 *  second click. "Add property" opens the add drawer, which starts on the
 *  passbook scanner. */
function Shortcuts() {
  return (
    <nav className="shortcuts" aria-label="Shortcuts">
      <Link className="btn primary" to="/app/properties?new=1">
        <AddOutlined sx={{ fontSize: 17 }} /> Add property
      </Link>
      <Link className="btn" to="/app/papers?do=add">
        <FileUploadOutlined sx={{ fontSize: 16 }} /> Add document
      </Link>
      <Link className="btn" to="/app/order">
        <HandshakeOutlined sx={{ fontSize: 16 }} /> Order a service
      </Link>
      <Link className="btn" to="/app/papers?do=share">
        <IosShareOutlined sx={{ fontSize: 16 }} /> Share documents
      </Link>
    </nav>
  );
}

interface Gap { label: string; fix: string; to: string }

/**
 * What a property is missing, from facts the card already carries.
 *
 * Only gaps the owner can close from this app are listed. A deed number is
 * not: `deedLine` reads parcels.reg_doc_no, which nothing in W360 writes, so
 * "No deed recorded" would be a nag with no way to act on it. EC and tax
 * checks are not on the card at all and are not guessed at.
 */
function gapsOf(r: RecordCard): Gap[] {
  const out: Gap[] = [];
  const land = r.classification === 'agri' || r.classification === 'open_plot';
  // _located() already falls back to the boundary's centre, so 0,0 here means
  // neither a pin nor a boundary.
  if (!r.lat && !r.lon) {
    out.push({ label: 'Not on the map', fix: 'Set location', to: `/app/records/${r.id}/map` });
  } else if (land && r.ring.length < 6) {
    out.push({ label: 'No boundary', fix: 'Draw boundary', to: `/app/records/${r.id}/map` });
  }
  if (r.paperCount === 0) {
    out.push({ label: 'No documents', fix: 'Add document', to: `/app/records/${r.id}` });
  }
  return out;
}

const GAP_ROWS = 5;

/** Properties you own that are missing a location, a boundary or documents.
 *  Managed and watched land is somebody else's to complete. Hidden while it
 *  loads, when it fails, and when nothing is missing. */
function MissingDetails() {
  const { data } = useProperties(EMPTY_FILTER);
  const owned = (data?.cards ?? []).filter((c) => c.stake === 'owned');
  const open = owned.map((r) => ({ r, gaps: gapsOf(r) })).filter((x) => x.gaps.length > 0);
  if (open.length === 0) return null;
  const done = owned.length - open.length;
  return (
    <div className="sec">
      <Card title="Missing details"
            aside={<span className="note">{done} of {owned.length} complete</span>}>
        <div className="rows">
          {open.slice(0, GAP_ROWS).map(({ r, gaps }) => (
            <div key={r.id}>
              <span className="muted" style={{ display: 'flex', paddingTop: '0.125rem' }}>
                <Icon name={r.classification} size={19} />
              </span>
              <div className="grow">
                <h3>
                  <Link to={`/app/records/${r.id}`} style={{ color: 'inherit', textDecoration: 'none' }}>
                    {r.title}
                  </Link>
                </h3>
                <span className="gapchips">
                  {gaps.map((g) => <StatusChip key={g.label} state="warn">{g.label}</StatusChip>)}
                </span>
              </div>
              <Link className="btn" to={gaps[0].to}>{gaps[0].fix}</Link>
            </div>
          ))}
        </div>
        {open.length > GAP_ROWS && (
          <p className="note" style={{ margin: 'var(--space-md) 0 0' }}>
            {plural(open.length - GAP_ROWS, 'more property', 'more properties')} ·{' '}
            <Link className="link accent" to="/app/properties">All properties</Link>
          </p>
        )}
      </Card>
    </div>
  );
}

const ACTIVITY_ROWS = 5;

/** The last few events from Activity, drawn with Activity's own row. The
 *  trail arrives newest first. Hidden while empty: Home is not the place to
 *  say that nothing has happened. */
function RecentActivity() {
  const { data } = useAuditTrail();
  const events = (data ?? []).slice(0, ACTIVITY_ROWS);
  if (events.length === 0) return null;
  return (
    <section className="sec" aria-labelledby="home-activity">
      <div className="row between" style={{ marginBottom: 'var(--space-md)' }}>
        <h2 id="home-activity" className="home-h2" style={{ margin: 0 }}>Recent activity</h2>
        <Link className="link accent" to="/app/audit" style={{ fontSize: '0.8125rem' }}>
          All activity
        </Link>
      </div>
      <div className="card" style={{ padding: 0 }}>
        <div className="rows boxed">
          {events.map((e) => <ActivityRow key={e.id} e={e} />)}
        </div>
      </div>
    </section>
  );
}

export function Dashboard() {
  const { data, isLoading, error } = usePortfolio();
  // The same query the rail's Services badge already runs, so this costs
  // nothing extra: it is answered from the cache.
  const orderQ = useOrders();

  if (isLoading) return <main><Loading h="70vh" what="your home page" /></main>;
  // A failed read used to hold this same skeleton for good — retry: 1 in
  // main.tsx settles a dead query at isLoading:false, data:undefined, and the
  // old guard could not tell that apart from a query still in flight.
  if (!data) return <main><Failed what="Your home page" error={error} boxed h="26rem" /></main>;

  const orders = orderQ.data ?? [];
  const needYou = orders.filter((o) => o.needsYou || o.pendingReview > 0);
  const properties = data.farmCount + data.plotCount + data.builtFlats + data.builtShops;
  const all = properties + data.managedCount + data.watchedCount;
  const title = data.displayName ? `${greeting()}, ${data.displayName}` : greeting();

  // Only facts that exist: "1 property · 2.80 ac · 2 documents".
  const meta = [
    plural(all, 'property', 'properties'),
    data.farmExtent > 0 ? `${num(data.farmExtent, 2)} ac` : '',
    data.plotExtent > 0 ? `${num(data.plotExtent)} sq.yd` : '',
    data.paperCount > 0 ? plural(data.paperCount, 'document') : '',
  ].filter(Boolean).join(' · ');

  const add = (
    <Link to="/app/properties?new=1" className="btn primary">
      <AddOutlined sx={{ fontSize: 17 }} /> Add property
    </Link>
  );

  /**
   * First run: the account holds nothing.
   *
   * Everything else on this page is a lens onto rows that do not exist, so the
   * only things said are what needs the owner (an invitation can arrive before
   * a parcel does) and the one thing to do.
   */
  if (all === 0) {
    return (
      <main>
        <PageHead title={title} />
        <SetupChecklist />
        {data.waiting.length > 0 && <div className="sec"><ForYou data={data} orders={needYou} /></div>}
        <Empty boxed h="18rem" icon="parcel" title="No properties yet" action={add}>
          Add a parcel or property, or upload a pattadar passbook.
        </Empty>
      </main>
    );
  }

  const openOrders = orders.length;
  // Value is shown only when something has been valued. A market value of
  // nought is "not valued", not a loss: the old strip printed −₹5.6 L as a
  // gain on land that simply had no valuation recorded.
  const valued = data.worthNow > 0;
  const bars = data.valueBars.filter((b) => b.value > 0);

  return (
    <main>
      {/* "Add property" is the first shortcut, so it is not also a header
          action — the same button twice on one screen. */}
      <PageHead title={title}>
        <p className="note" style={{ margin: '0.375rem 0 0' }}>{meta}</p>
        <Shortcuts />
      </PageHead>
      <SetupChecklist />

      <div className="sec"><ForYou data={data} orders={needYou} /></div>

      <MissingDetails />

      <section className="sec" aria-labelledby="home-overview">
        <h2 id="home-overview" className="home-h2">Overview</h2>
        <div className="overview">
          <Overview label="Properties" value={num(all)}
                    note={[
                      data.farmCount ? plural(data.farmCount, 'land parcel') : '',
                      data.plotCount ? plural(data.plotCount, 'plot') : '',
                      data.builtFlats + data.builtShops > 0
                        ? plural(data.builtFlats + data.builtShops, 'building') : '',
                    ].filter(Boolean).join(' · ')}
                    to="/app/properties" />
          <Overview label="Documents" value={num(data.paperCount)} to="/app/papers" />
          <Overview label="Open orders" value={num(openOrders)}
                    note={needYou.length > 0 ? `${needYou.length} need you` : undefined}
                    to="/app/services" />
          <Overview label="Estimated value" value={valued ? inr(data.worthNow) : 'Not valued'}
                    words={!valued}
                    note={data.invested > 0 ? `Bought for ${inr(data.invested)}` : undefined}
                    to="/app/properties" />
        </div>
      </section>

      {/* Only when something has actually been valued — a bar chart of ₹0
          per village is a chart of nothing. */}
      {bars.length > 0 && (
        <div className="sec">
          <Card title="Value by village">
            <div className="bars">
              {bars.map((b) => (
                <div className="bar" key={b.label}>
                  <span>{b.label}</span>
                  <span className="track">
                    <span className="fill" style={{ width: `${Math.max(4, b.share * 100)}%` }} />
                  </span>
                  <span className="num right">{inr(b.value)}</span>
                </div>
              ))}
            </div>
            {data.runningCosts > 0 && (
              <KV rows={[{ k: 'Running costs this year', v: inr(data.runningCosts) }]} />
            )}
          </Card>
        </div>
      )}

      {data.recent.length > 0 && (
        <section className="sec" aria-labelledby="home-recent">
          <div className="row between" style={{ marginBottom: 'var(--space-md)' }}>
            <h2 id="home-recent" className="home-h2" style={{ margin: 0 }}>Recently opened</h2>
            <Link className="link accent" to="/app/properties" style={{ fontSize: '0.8125rem' }}>
              All properties
            </Link>
          </div>
          <div className="cards">
            {data.recent.map((r) => <RecordTile key={r.id} rec={r} />)}
          </div>
        </section>
      )}

      <RecentActivity />
    </main>
  );
}
