/** W01 — the portfolio in one screen: what you hold, what it is worth, what is
  *  waiting on you, and where the value actually sits.
 *
 *  Home (26/09/2026, founder decision): user-focused and Material 3 — the
 *  greeting and shortcuts, "For you" (reminders and orders waiting on the
 *  owner in one list), missing details, four overview cards that are also
 *  ways in, recently opened, then recent activity.
 *
 *  Since 02/10/2026 (heuristic audit, .local/ux-audits/2026-10-02-w360-home)
 *  Missing details is no longer a card of its own: it is one summary row
 *  inside For you, so For you holds the orders, the reminders and the
 *  properties missing details, and says "You're all caught up" only when all
 *  three are empty. The order is the greeting with the shortcuts on its row
 *  (09/10/2026, design.md § Page head, Home option A), the summary line;
 *  For you; Overview; Value by village; Recently opened; Recent activity. The
 *  Estimated value card is always one of the four and reads "—" while nothing
 *  is valued; Value by village appears only when something has been valued. */
import { useId, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import AddOutlined from '@mui/icons-material/AddOutlined';
import CloseOutlined from '@mui/icons-material/CloseOutlined';
import FileUploadOutlined from '@mui/icons-material/FileUploadOutlined';
import HandshakeOutlined from '@mui/icons-material/HandshakeOutlined';
import IosShareOutlined from '@mui/icons-material/IosShareOutlined';

import { useAuditTrail } from '../../data/hooks';
import { EMPTY_FILTER, useOrders, usePortfolio, useProperties, useDismissWaiting } from '../api';
import type { Order, Portfolio, RecordCard, WaitingItem } from '../api';
import { Dialog } from '../Dialog';
import { NOTHING_MISSING, missingOf } from '../homeGaps';
import type { Incomplete, Missing } from '../homeGaps';
import { ActivityRow } from './Audit';
import {
  Card, Chip, Empty, Failed, Icon, KV, PageHead, StatusChip, inr, inrOr, num, plural,
} from '../ui';
import type { HeadActions } from '../ui';
import { SetupChecklist } from '../SetupChecklist';
import { Sk, SkRowItems } from '../skeletons';

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

/** A recently opened property as the shared `.rec` card, in its compact
 *  variant. Home draws no photo, map or scan for a tile, so the 6.5rem art
 *  band was only ever the placeholder — an icon over a gradient, decoration on
 *  an app page. The kind stays, as the band's own icon in its own colour,
 *  inline beside the name. */
export function RecordTile({ rec }: { rec: RecordCard }) {
  const art = rec.classification === 'flat' || rec.classification === 'open_plot'
    ? 'built' : rec.classification === 'shop' ? 'shop' : '';
  return (
    <Link className="rec compact" to={`/properties/${rec.id}`}>
      <span className={`rec-kind ${art}`}>
        <Icon name={rec.classification} size={20} />
      </span>
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
  if (w.recordId) return { to: `/properties/${w.recordId}`, label: 'Open property' };
  if (w.icon === 'lock') return { to: '/papers', label: 'Open Documents' };
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
        {/* A text action, named for its row: three rows say "Open property",
            and a screen reader's list of links must not hold three identical
            names. */}
        {go && (
          <Link className="linkbtn" to={go.to} aria-label={`${go.label}: ${w.title}`}>
            {go.label}
          </Link>
        )}
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
                Cancel
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
          <Link to={`/services/${o.id}`} style={{ color: 'inherit', textDecoration: 'none' }}>
            {o.pendingReview > 0 ? `Review submitted work · ${o.title}` : o.title}
          </Link>
        </h3>
        <p className="note" style={{ marginTop: '0.1875rem' }}>
          {[o.ref, o.recordTitle].filter(Boolean).join(' · ')}
        </p>
      </div>
      <span className="row tight" style={{ flexWrap: 'nowrap' }}>
        <StatusChip state={o.statusState}>{o.statusLabel}</StatusChip>
        <Link className="linkbtn" to={`/services/${o.id}`}
              aria-label={`Open order: ${[o.ref, o.recordTitle].filter(Boolean).join(' · ') || o.title}`}>
          Open order
        </Link>
      </span>
    </div>
  );
}

const GAP_ROWS = 3;

/** One property under Missing details, on one line: its name, what it is
 *  missing beside it, and the first fix as a text action named for the
 *  property — every row's action would otherwise read the same. */
function GapRow({ r, gaps }: Incomplete) {
  return (
    <div>
      <div className="grow gapline">
        <h4>
          <Link to={`/properties/${r.id}`} style={{ color: 'inherit', textDecoration: 'none' }}>
            {r.title}
          </Link>
        </h4>
        <span className="gapchips">
          {gaps.map((g) => <StatusChip key={g.label} state="warn">{g.label}</StatusChip>)}
        </span>
      </div>
      <Link className="linkbtn" to={gaps[0].to} aria-label={`${gaps[0].fix}: ${r.title}`}>
        {gaps[0].fix}
      </Link>
    </div>
  );
}

/**
 * Missing details as one row of For you (02/10/2026), rather than a card of
 * its own under it: how many of the properties you own are complete, a
 * neutral track that draws the same figure, one outlined chip per kind of gap
 * with how many properties carry it, and a disclosure listing up to GAP_ROWS
 * of them on one line each.
 *
 * A property a reminder already names is not listed a second time under the
 * disclosure: the reminder row above it is where it is acted on. It still
 * counts in "N of M complete", in its chip and in For you's count, because it
 * is still missing that detail. When every property with a gap is named by a
 * reminder there is nothing left to disclose, so there is no disclosure — a
 * "Show all" that opens nothing would be a dead control.
 */
function MissingRow({ missing }: { missing: Missing }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const done = missing.owned - missing.open.length;
  const pct = Math.round((done / missing.owned) * 100);
  const shown = missing.listed.slice(0, GAP_ROWS);
  const more = missing.listed.length - shown.length;
  return (
    <div>
      <span className="muted" style={{ display: 'flex', paddingTop: '0.125rem' }}>
        <Icon name="warn" size={19} />
      </span>
      <div className="grow gapline">
        <h3 id={`${id}-t`}>Missing details</h3>
        <span className="note num">{done} of {missing.owned} complete</span>
        <span className="gaptrack" aria-hidden><span style={{ width: `${pct}%` }} /></span>
        <span className="gapchips">
          {missing.tally.map((t) => (
            <Chip key={t.label}><span className="num">{t.n}</span> {t.label}</Chip>
          ))}
        </span>
      </div>
      {missing.listed.length > 0 && (
        <>
          {/* Named "Show all Missing details" / "Hide Missing details": the
              visible word, then the row it opens. */}
          <button type="button" className="linkbtn" aria-expanded={open}
                  aria-controls={`${id}-p`} aria-labelledby={`${id}-l ${id}-t`}
                  onClick={() => setOpen((v) => !v)}>
            <span id={`${id}-l`}>{open ? 'Hide' : 'Show all'}</span>
          </button>
          <div id={`${id}-p`} className="gappanel" hidden={!open}>
            <div className="rows">
              {shown.map((x) => <GapRow key={x.r.id} {...x} />)}
            </div>
            {more > 0 && (
              <p className="note" style={{ margin: 'var(--space-md) 0 0' }}>
                {plural(more, 'more property', 'more properties')} ·{' '}
                <Link className="link accent" to="/properties">All properties</Link>
              </p>
            )}
          </div>
        </>
      )}
    </div>
  );
}

/** "For you": everything that needs the owner, in one card. Orders that came
 *  back, reminders and properties missing details are the same question —
 *  what should I do next — so they are one card, and its count is all three.
 *  "You're all caught up" is For you's own empty state, said only when all
 *  three are empty AND both the orders and the properties reads have
 *  answered: a read still out, or one that failed, is no proof that nothing
 *  is missing, so For you then says nothing rather than claim it. */
function ForYou({ data, orders, ordersKnown, missing }: {
  data: Portfolio; orders: Order[]; ordersKnown: boolean; missing: Missing | undefined;
}) {
  const gaps = missing?.open.length ?? 0;
  const total = data.waiting.length + orders.length + gaps;
  if (total === 0) {
    if (!ordersKnown || !missing) return null;
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
        {missing && gaps > 0 && <MissingRow missing={missing} />}
      </div>
    </Card>
  );
}

/** One overview figure that is also a way in (Material 3 summary card). */
function Overview({ label, value, say, note, to }: {
  label: string; value: string; note?: string; to: string;
  /** What a screen reader hears instead of a glyph value: "—" is read as
   *  nothing, or as "em dash", so the figure that is not held is named. */
  say?: string;
}) {
  return (
    <Link className="ovcard" to={to}>
      <span className="ov-label">{label}</span>
      <span className="ov-value num" aria-hidden={say ? true : undefined}>{value}</span>
      {say && <span className="sr-only">{say}</span>}
      {note && <span className="ov-note">{note}</span>}
    </Link>
  );
}

/** The four things an owner comes to Home to start, as the head's commands
 *  (design.md § Page head, Home option A, 09/10/2026): on the title row,
 *  right-aligned, "Add a document" and "Order a service" outlined, "Share a
 *  property" in the ⋮ and "Add a property" filled and rightmost. Each lands on
 *  the screen that does it with its dialog already open (`?new=1`, `?do=`),
 *  so none is a second click. "Add a property" opens the add drawer, which
 *  starts on the passbook scanner. Under 600px the two outlined ones join the
 *  ⋮ and the filled one stays (PageHead does that itself). */
function shortcuts(go: (to: string) => void): HeadActions {
  return {
    secondaries: [
      { label: 'Add a document', icon: <FileUploadOutlined sx={{ fontSize: 16 }} />, to: '/papers?do=add' },
      { label: 'Order a service', icon: <HandshakeOutlined sx={{ fontSize: 16 }} />, to: '/order' },
    ],
    overflow: [{
      label: 'Share a property', icon: <IosShareOutlined sx={{ fontSize: 16 }} />,
      onClick: () => go('/papers?do=share'),
    }],
    overflowLabel: 'More shortcuts',
    primary: { label: 'Add a property', icon: <AddOutlined sx={{ fontSize: 17 }} />, to: '/properties?new=1' },
  };
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
        <Link className="link accent" to="/audit" style={{ fontSize: '0.8125rem' }}>
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

/** Home before the portfolio lands: For you and Overview in their own boxes
 *  (the four tiles' labels are constants, printed for real), so nothing moves
 *  when the figures arrive. One live region; the scaffold is aria-hidden. */
function HomeSkeleton() {
  return (
    <div role="status" aria-busy="true" aria-label="Loading your home page">
      <div aria-hidden>
        <div className="sec sec-first">
          <Card title="For you"><div className="rows"><SkRowItems rows={3} /></div></Card>
        </div>
        <div className="sec ov-sec">
          <h2 className="home-h2">Overview</h2>
          <div className="overview">
            {['Properties', 'Documents', 'Open orders', 'Market estimate'].map((label) => (
              <div className="ovcard" key={label}>
                <span className="ov-label">{label}</span>
                <span className="ov-value" style={{ display: 'flex', alignItems: 'center', height: '1.5em' }}>
                  <Sk w="4rem" h="0.62em" />
                </span>
                <span className="ov-note"><Sk w="7rem" h="0.62em" /></span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export function Dashboard() {
  const { data, isLoading, error } = usePortfolio();
  // The same query the rail's Services badge already runs, so this costs
  // nothing extra: it is answered from the cache.
  const orderQ = useOrders();
  // Missing details is worked out from the property list — the same key
  // Properties reads. It used to be asked by the Missing details card after the
  // page had drawn; asked here it is in flight beside the portfolio, so For you
  // is whole when it draws instead of saying "all caught up" first.
  const propsQ = useProperties(EMPTY_FILTER);
  const nav = useNavigate();

  // The head is drawn while the portfolio is out or failed too, so the tab is
  // named and the page has a heading; the name joins the greeting on arrival,
  // and the summary line holds its place while the first read is out.
  if (isLoading) {
    return (
      <main>
        <PageHead title={greeting()} docTitle="Home" summary={<Sk w="18rem" h="1rem" r="var(--radius-xs)" />}
                  actions={shortcuts(nav)} />
        <HomeSkeleton />
      </main>
    );
  }
  // A failed read used to hold this same skeleton for good — retry: 1 in
  // main.tsx settles a dead query at isLoading:false, data:undefined, and the
  // old guard could not tell that apart from a query still in flight.
  if (!data) {
    return <main><PageHead title={greeting()} docTitle="Home" /><Failed what="Your home page" error={error} boxed h="26rem" /></main>;
  }

  // For you claims "all caught up" only on answers it has: undefined here is
  // a read still out or one that failed, and neither is "nothing missing".
  const ordersKnown = orderQ.data !== undefined;
  const missing = propsQ.data ? missingOf(propsQ.data.cards, data.waiting) : undefined;
  const orders = orderQ.data ?? [];
  const needYou = orders.filter((o) => o.needsYou || o.pendingReview > 0);
  // Every active property is a land parcel, a plot or a building; managed and
  // watched are stakes on those same rows (web360.py `portfolio`), so adding
  // them as well counted each one twice, against the Properties count.
  const all = data.farmCount + data.plotCount + data.builtFlats + data.builtShops;
  const title = data.displayName ? `${greeting()}, ${data.displayName}` : greeting();

  // Only facts that exist: "1 property · 2.80 ac · 200 sq.yd". An extent
  // that rounds to "0.00 ac" or "0 sq.yd" is dropped too, as Properties does.
  // No document count: `paperCount` adds parcel gallery photos to the vault's
  // documents (web360.py `portfolio`), and a photo filed in Documents and
  // linked to a parcel is in both, so it is not the Documents page's figure.
  const meta = [
    plural(all, 'property', 'properties'),
    data.farmExtent >= 0.005 ? `${num(data.farmExtent, 2)} ac` : '',
    data.plotExtent >= 0.5 ? `${num(data.plotExtent)} sq.yd` : '',
  ].filter(Boolean).join(' · ');

  const add = (
    <Link to="/properties?new=1" className="btn primary">
      <AddOutlined sx={{ fontSize: 17 }} /> Add a property
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
        {/* First-run empty (design.md § Page head): the title alone; the
            empty card carries the one filled add. */}
        <PageHead title={title} docTitle="Home" />
        <SetupChecklist />
        {data.waiting.length > 0 && (
          <div className="sec">
            <ForYou data={data} orders={needYou} ordersKnown={ordersKnown} missing={NOTHING_MISSING} />
          </div>
        )}
        <Empty boxed h="18rem" icon="parcel" title="No properties yet" action={add}>
          Add a property, or upload a pattadar passbook.
        </Empty>
      </main>
    );
  }

  const openOrders = orders.length;
  // A market value of nought is an unknown figure, "—" (design.md § Property
  // tabs, "Missing reads as missing"): never ₹0 and never a loss — the old
  // strip printed −₹5.6 L as a gain on land that simply had no valuation
  // recorded. Value by village is drawn only when something has been valued.
  const valued = data.worthNow > 0;
  const bars = data.valueBars.filter((b) => b.value > 0);

  return (
    <main>
      {/* The greeting stays the h1 (V1); the tab reads "Home · Pattadar". */}
      <PageHead title={title} docTitle="Home" summary={meta} actions={shortcuts(nav)} />
      <SetupChecklist />

      {/* The first block under the head: the head's own 24px is the gap,
          not that plus a section margin (64px, against 24px on every other
          page under Your portfolio). */}
      <div className="sec sec-first">
        <ForYou data={data} orders={needYou} ordersKnown={ordersKnown} missing={missing} />
      </div>

      {/* `ov-sec` makes the section the width the Overview's tracks are
          chosen from (w360.css): the window less the rail and the padding. */}
      <section className="sec ov-sec" aria-labelledby="home-overview">
        <h2 id="home-overview" className="home-h2">Overview</h2>
        <div className="overview">
          <Overview label="Properties" value={num(all)}
                    note={[
                      data.farmCount ? plural(data.farmCount, 'land parcel') : '',
                      data.plotCount ? plural(data.plotCount, 'plot') : '',
                      data.builtFlats + data.builtShops > 0
                        ? plural(data.builtFlats + data.builtShops, 'building') : '',
                    ].filter(Boolean).join(' · ')}
                    to="/properties" />
          <Overview label="Documents" value={num(data.paperCount)} to="/papers" />
          <Overview label="Open orders" value={num(openOrders)}
                    note={needYou.length > 0 ? `${needYou.length} need you` : undefined}
                    to="/services" />
          <Overview label="Market estimate" value={inrOr(data.worthNow)}
                    say={valued ? undefined : 'not set'}
                    note={data.invested > 0 ? `Bought for ${inr(data.invested)}` : undefined}
                    to="/properties" />
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
              <KV rows={[{ k: 'Expenses this year', v: inr(data.runningCosts) }]} />
            )}
          </Card>
        </div>
      )}

      {data.recent.length > 0 && (
        <section className="sec" aria-labelledby="home-recent">
          <div className="row between" style={{ marginBottom: 'var(--space-md)' }}>
            <h2 id="home-recent" className="home-h2" style={{ margin: 0 }}>Recently opened</h2>
            <Link className="link accent" to="/properties" style={{ fontSize: '0.8125rem' }}>
              All properties
            </Link>
          </div>
          <div className="cards compact">
            {data.recent.map((r) => <RecordTile key={r.id} rec={r} />)}
          </div>
        </section>
      )}

      <RecentActivity />
    </main>
  );
}
