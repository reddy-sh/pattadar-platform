/** W01 — the portfolio in one screen: what you hold, what it is worth, what is
 *  waiting on you, and where the value actually sits. */
import { useState } from 'react';
import { Link } from 'react-router';
import AddOutlined from '@mui/icons-material/AddOutlined';
import CloseOutlined from '@mui/icons-material/CloseOutlined';

import { usePortfolio, useDismissWaiting } from '../api';
import type { Portfolio, RecordCard, WaitingItem } from '../api';
import { Dialog } from '../Dialog';
import {
  Card, Cell, Empty, Eyebrow, Failed, Icon, Loading, PageHead, inr, num, plural,
} from '../ui';

/** The owner sits in one time zone and the land in another; both clocks matter
 *  because the office that opens at 09:30 IST is the one holding the file.
 *  The land's clock is named after where the land actually is — the village
 *  holding most of the value — not after the town this screen was drawn with. */
function clocks(landPlace: string): string {
  const at = (tz?: string) =>
    new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false })
      .format(new Date());
  const here = new Intl.DateTimeFormat('en-GB', { timeZoneName: 'short' })
    .formatToParts(new Date()).find((p) => p.type === 'timeZoneName')?.value ?? 'Local';
  const there = `${landPlace || 'India'} ${at('Asia/Kolkata')} IST`;
  return `${here} ${at()}, ${there}`;
}

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
  if (w.icon === 'lock') return { to: '/app/papers', label: 'Open Papers' };
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
            &ldquo;{w.title}&rdquo; leaves this screen for good — it cannot be brought back.
            Only the reminder goes: whatever it is about is left exactly as it is, with the
            same deadline on it.
          </p>
        </Dialog>
      )}
    </div>
  );
}

/** What is actually waiting on the owner. Lifted out of the one big return so
 *  a first-run dashboard can carry it too: an invitation to a family group can
 *  arrive before the account holds a single parcel, and it was the one panel
 *  worth drawing on a screen with nothing else on it. */
function Waiting({ data }: { data: Portfolio }) {
  return (
    <Card title="Waiting on you" link="Notifications" linkTo="/app/notifications">
      {data.waiting.length === 0 && <p className="note">Nothing is waiting on you.</p>}
      <div className="rows">
        {data.waiting.map((w) => <WaitingRow key={w.id} w={w} />)}
      </div>
    </Card>
  );
}

export function Dashboard() {
  const { data, isLoading, error } = usePortfolio();

  if (isLoading) return <main><Loading h="70vh" what="your dashboard" /></main>;
  // A failed read used to hold this same skeleton for good — retry: 1 in
  // main.tsx settles a dead query at isLoading:false, data:undefined, and the
  // old guard could not tell that apart from a query still in flight.
  if (!data) return <main><Failed what="Your dashboard" error={error} boxed h="26rem" /></main>;

  // Each clause appears only if the portfolio actually holds that kind, and
  // every noun agrees with its count — the line used to read
  // "Built — (0 sq.ft)" for anyone who owns only land.
  const land = [
    data.farmCount ? `${plural(data.farmCount, 'farm parcel')} (${num(data.farmExtent, 2)} ac)` : '',
    data.plotCount ? `${plural(data.plotCount, 'open plot')} (${num(data.plotExtent)} sq.yd)` : '',
  ].filter(Boolean).join(' and ');
  const built = [
    data.builtFlats ? plural(data.builtFlats, 'flat') : '',
    data.builtShops ? plural(data.builtShops, 'shop') : '',
  ].filter(Boolean).join(' + ');
  const summary = [
    land && `Land — ${land}`,
    built && `Built — ${built} (${num(data.builtExtent)} sq.ft)`,
  ].filter(Boolean).join(' · ');
  const stake = [
    data.managedCount ? { n: data.managedCount, word: 'managed', to: 'managed' } : null,
    data.watchedCount ? { n: data.watchedCount, word: 'watched', to: 'watch' } : null,
  ].filter(Boolean) as { n: number; word: string; to: string }[];

  /**
   * First run: the account holds nothing.
   *
   * Everything below this point is a lens onto rows that do not exist. Drawn
   * over an empty portfolio the screen said: four tiles reading ₹0, a chart
   * titled "Where the value sits" with no bars under it, a "Recently opened"
   * heading over an empty grid, and a per-village cost note about ₹0 paid.
   * Together they read as an app that failed to load its data. What is true is
   * much simpler and is now the only thing said: nothing has been added yet,
   * and here is the one thing to do about it.
   */
  const holdings = data.farmCount + data.plotCount + data.builtFlats + data.builtShops
    + data.managedCount + data.watchedCount;

  if (holdings === 0) {
    return (
      <main>
        <PageHead
          eyebrow="Your portfolio"
          title={data.displayName ? `${greeting()}, ${data.displayName}` : greeting()}
        >
          <p className="note">
            {data.waitingCount > 0
              ? `${plural(data.waitingCount, 'thing')} waiting on you`
              : 'Nothing waiting on you'}
            {' · '}{clocks('')}
          </p>
        </PageHead>

        <Empty
          boxed h="20rem" icon="parcel" title="Nothing in your portfolio yet"
          action={
            <Link to="/app/properties?new=1" className="btn primary">
              <AddOutlined sx={{ fontSize: 17 }} /> Add your first record
            </Link>
          }
        >
          A record is one parcel or one built property. Everything else here hangs off it —
          its papers, its boundary on the map, its photos, who works it, and what it has cost
          you. Add one and this screen fills itself in.
        </Empty>

        {/* An invitation can arrive before a single parcel does. */}
        {data.waiting.length > 0 && (
          <div className="sec">
            <Waiting data={data} />
          </div>
        )}
      </main>
    );
  }

  return (
    <main>
      <PageHead
        eyebrow="Your portfolio"
        title={data.displayName ? `${greeting()}, ${data.displayName}` : greeting()}
        // "Share proof of ownership" used to sit here. It had no onClick — it
        // was a dead control on the first screen of the app, and it asked the
        // wrong question anyway: proof is shared FROM a record or from the
        // vault, where there is something to name, set terms on and expire.
        // The real flow lives on Papers → Share, so the decoration is gone
        // rather than wired to a second, weaker copy of it.
        actions={
          <Link to="/app/properties?new=1" className="btn primary">
            <AddOutlined sx={{ fontSize: 17 }} /> Add
          </Link>
        }
      >
        {summary && <p className="lede">{summary}</p>}
        {stake.length > 0 && (
          <p className="lede">
            Owned only ·{' '}
            {stake.map((s, i) => (
              <span key={s.to}>
                {i > 0 && ' and '}
                <Link to={`/app/properties?stake=${s.to}`} className="accent">
                  {s.n} {s.word}
                </Link>
              </span>
            ))}
            {' '}sit in Holdings
          </p>
        )}
        <p className="note">
          {data.waitingCount > 0
            ? `${plural(data.waitingCount, 'thing')} waiting on you`
            : 'Nothing waiting on you'}
          {' · '}{clocks(data.valueBars[0]?.label ?? '')}
        </p>
      </PageHead>

      <div className="strip">
        {data.tiles.map((t) => (
          <Cell key={t.key} k={t.label} v={t.value} unit={t.unit} note={t.note} tone={t.tone} />
        ))}
      </div>

      <div className="two sec">
        <Waiting data={data} />

        <Card title="Where the value sits" aside={<span className="note">worth today</span>}>
          {data.valueBars.length === 0 && (
            <p className="note">
              No village holds any value yet — a record needs a market value on its Money tab
              before it can appear here.
            </p>
          )}
          <div className="bars">
            {data.valueBars.map((b) => (
              <div className="bar" key={b.label}>
                <span>{b.label}</span>
                <span className="track">
                  <span className="fill" style={{ width: `${Math.max(4, b.share * 100)}%` }} />
                </span>
                <span className="num right">{inr(b.value)}</span>
              </div>
            ))}
          </div>
          {/* Only says "one bar per village" when there are bars. */}
          {data.valueBars.length > 0 && (
            <p className="note" style={{ marginTop: 'var(--space-md)' }}>
              Worth today, one bar per village. Against {inr(data.invested)} paid in total — the
              per-village split of cost is on each holding&rsquo;s Money tab.
            </p>
          )}
          <hr className="hr" />
          <div className="row between">
            <span>Running costs this year</span>
            <span className="num">{inr(data.runningCosts)}</span>
          </div>
          <hr className="hr" />
          <div className="row" style={{ flexWrap: 'nowrap', alignItems: 'flex-start' }}>
            <span className="up" style={{ display: 'flex', paddingTop: '0.125rem' }}>
              <Icon name="shield" size={17} />
            </span>
            {/* This line used to read "N papers, all in Mumbai (ap-south-1).
                Last backup verified <date>." Both halves were made up. The
                region was a literal typed here with no server field behind it,
                so a stack storing its bytes anywhere else still claimed
                Mumbai; and `backup_verified_on` is `_ddmmyyyy(_today())`
                (web360.py) — today's date, on every account, every visit,
                whether or not a backup ever ran. The one safety claim on the
                screen was the one sentence nothing checked. What is true is
                the count, and that Papers carries the storage note the server
                actually sets (`regionNote`) next to the links out. The claim
                can come back the day a verification is recorded and returned
                as a real, optional timestamp. */}
            <p className="note">
              {data.paperCount > 0
                ? `${plural(data.paperCount, 'paper')} filed against your records. `
                : 'No papers filed against your records yet. '}
              <Link className="accent" to="/app/papers">Papers</Link> says how they are
              stored and what is out on a link right now.
            </p>
          </div>
        </Card>
      </div>

      {/* A heading and an "All holdings ›" link over an empty grid is a
          section that failed to load, as far as anyone reading it can tell.
          Nothing opened yet is not worth a section. */}
      {data.recent.length > 0 && (
        <section className="sec">
          <div className="row between" style={{ marginBottom: 'var(--space-md)' }}>
            <Eyebrow>Recently opened</Eyebrow>
            <Link className="link accent" to="/app/properties" style={{ fontSize: '0.8125rem' }}>
              All holdings ›
            </Link>
          </div>
          <div className="cards">
            {data.recent.map((r) => <RecordTile key={r.id} rec={r} />)}
          </div>
        </section>
      )}
    </main>
  );
}
