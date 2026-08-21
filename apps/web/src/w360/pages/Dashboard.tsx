/** W01 — the portfolio in one screen: what you hold, what it is worth, what is
 *  waiting on you, and where the value actually sits. */
import { Link } from 'react-router';
import IosShareOutlined from '@mui/icons-material/IosShareOutlined';
import AddOutlined from '@mui/icons-material/AddOutlined';

import { usePortfolio, useDismissWaiting } from '../api';
import type { RecordCard } from '../api';
import { Cell, Card, Eyebrow, Icon, Loading, PageHead, inr, num, plural } from '../ui';

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

export function Dashboard() {
  const { data, isLoading } = usePortfolio();
  const dismiss = useDismissWaiting();

  if (isLoading || !data) return <main><Loading h="70vh" /></main>;

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

  return (
    <main>
      <PageHead
        eyebrow="Your portfolio"
        title={data.displayName ? `${greeting()}, ${data.displayName}` : greeting()}
        actions={
          <>
            <button type="button" className="btn">
              <IosShareOutlined sx={{ fontSize: 16 }} /> Share proof of ownership
            </button>
            <Link to="/app/properties" className="btn primary">
              <AddOutlined sx={{ fontSize: 17 }} /> Add
            </Link>
          </>
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
        <Card title="Waiting on you" link="Notifications" linkTo="/app/notifications">
          {data.waiting.length === 0 && <p className="note">Nothing is waiting on you.</p>}
          <div className="rows">
            {data.waiting.map((w) => (
              <div key={w.id}>
                <span className="muted" style={{ display: 'flex', paddingTop: '0.125rem' }}>
                  <Icon name={w.icon} size={19} />
                </span>
                <div className="grow">
                  <h3>{w.title}</h3>
                  <p className="note" style={{ marginTop: '0.1875rem' }}>{w.detail}</p>
                </div>
                <button
                  type="button"
                  className={w.actionKind === 'primary' ? 'btn soft' : 'btn'}
                  onClick={() => dismiss.mutate({ id: w.id })}
                >
                  {w.actionLabel}
                </button>
              </div>
            ))}
          </div>
        </Card>

        <Card title="Where the value sits" aside={<span className="note">worth today</span>}>
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
          <p className="note" style={{ marginTop: 'var(--space-md)' }}>
            Worth today, one bar per village. Against {inr(data.invested)} paid in total — the
            per-village split of cost is on each holding&rsquo;s Money tab.
          </p>
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
            <p className="note">
              {data.paperCount} papers, all in Mumbai (ap-south-1). Last backup verified{' '}
              {data.backupVerifiedOn}.
            </p>
          </div>
        </Card>
      </div>

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
    </main>
  );
}
