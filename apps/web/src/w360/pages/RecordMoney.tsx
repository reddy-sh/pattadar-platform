/** W10 — what it cost, what the government says, what it may be worth.
 *
 *  Three numbers, kept apart on purpose. What you PAID is a fact. What the
 *  government says is a published rate. What it is WORTH is an assumption you
 *  chose — which is why the appreciation control is on the page and labelled
 *  "an assumption you chose, not a valuation".
 *
 *  Capital work is listed beside the purchase, never inside it, so cost per
 *  acre stays honest and a future capital-gains sum has the right base. */
import { Link } from 'react-router';
import FileDownloadOutlined from '@mui/icons-material/FileDownloadOutlined';
import AddOutlined from '@mui/icons-material/AddOutlined';
import InfoOutlined from '@mui/icons-material/InfoOutlined';
import MoreVertOutlined from '@mui/icons-material/MoreVertOutlined';

import { useMoney } from '../api';
import { Card, Loading, inr, num } from '../ui';
import { RecordCrumbs, RecordTabs, useRecordCtx } from './Record';
import { useState } from 'react';

const RATES = [6, 10, 14];

/** Three series over the years since purchase. Drawn as a plain SVG polyline —
 *  a chart library for three lines would be more code, not less. */
function ValueChart({ series }: { series: { year: string; market: number; government: number; paid: number }[] }) {
  if (series.length < 2) return null;
  const W = 100, H = 34;
  const max = Math.max(...series.flatMap((p) => [p.market, p.government, p.paid])) || 1;
  const x = (i: number) => (i / (series.length - 1)) * W;
  const y = (v: number) => H - (v / max) * (H - 3);
  const line = (get: (p: typeof series[0]) => number) =>
    series.map((p, i) => `${x(i)},${y(get(p))}`).join(' ');

  return (
    <svg viewBox={`0 0 ${W} ${H + 6}`} style={{ width: '100%', height: '11rem' }} role="img"
         aria-label="Value over time">
      <polyline points={line((p) => p.paid)} fill="none" stroke="var(--w-ink-3)"
                strokeWidth="0.5" strokeDasharray="1.5 1.5" />
      <polyline points={line((p) => p.government)} fill="none" stroke="var(--w-info)" strokeWidth="0.7" />
      <polyline points={line((p) => p.market)} fill="none" stroke="var(--w-accent)" strokeWidth="0.9" />
      <circle cx={x(series.length - 1)} cy={y(series[series.length - 1].market)} r="1" fill="var(--w-accent)" />
      <circle cx={x(series.length - 1)} cy={y(series[series.length - 1].government)} r="1" fill="var(--w-info)" />
      <g fill="var(--w-ink-3)" fontSize="2.4" fontFamily="var(--font-mono)">
        <text x="0" y={H + 5}>{series[0].year}</text>
        <text x={W / 2 - 3} y={H + 5}>{series[Math.floor(series.length / 2)].year}</text>
        <text x={W - 7} y={H + 5}>{series[series.length - 1].year}</text>
      </g>
    </svg>
  );
}

export function RecordMoney() {
  const rec = useRecordCtx();
  const [rate, setRate] = useState<number>(10);
  const { data, isLoading } = useMoney(rec.id, rate);

  if (isLoading || !data) return <main><Loading h="70vh" /></main>;

  const unit = data.extentUnit === 'ac' ? 'acre' : data.extentUnit;
  // "bought in two lots" only when there were two; one registration is one.
  const size = `${num(data.extent, data.extentUnit === 'ac' ? 2 : 0)} ${
    data.extentUnit === 'ac' ? 'acres' : data.extentUnit}`;
  const word = ['', 'one', 'two', 'three', 'four', 'five'][data.lots.length] ?? String(data.lots.length);
  const eyebrow = data.lots.length > 1
    ? `${size} · bought in ${word} lots, ${data.lots[0].boughtOn.slice(-4)}`
    : data.lots.length === 1
      ? `${size} · bought ${data.lots[0].boughtOn}`
      : size;

  return (
    <main>
      <RecordCrumbs rec={rec} here="Money" />
      <p className="eyebrow">{eyebrow}</p>

      <header className="pagehead">
        <div className="grow"><h1>What it cost, what it&rsquo;s worth</h1></div>
        <div className="actions">
          <button type="button" className="btn">
            <FileDownloadOutlined sx={{ fontSize: 16 }} /> Cost sheet
          </button>
          <button type="button" className="btn primary">
            <AddOutlined sx={{ fontSize: 17 }} /> Add a purchase
          </button>
        </div>
      </header>

      <RecordTabs rec={rec} />

      <div className="grid3" style={{ margin: 'var(--space-md) 0 var(--space-lg)' }}>
        <div className="card">
          <span className="eyebrow">What you actually paid</span>
          <p className="num" style={{ fontSize: '2rem', margin: '0.25rem 0 0.5rem' }}>{inr(data.paidTotal)}</p>
          <hr className="hr" style={{ margin: '0 0 0.5rem' }} />
          <p className="note mono">
            {inr(data.paidPerUnit)} / {unit} · incl. {inr(data.extrasTotal)} duty &amp; work
          </p>
        </div>
        <div className="card">
          <span className="eyebrow">Government value today</span>
          <p className="num" style={{ fontSize: '2rem', margin: '0.25rem 0 0.5rem', color: 'var(--w-info)' }}>
            {inr(data.govtTotal)}
          </p>
          <hr className="hr" style={{ margin: '0 0 0.5rem' }} />
          <p className="note mono">
            {inr(data.govtPerUnit)} / {unit} · SRO rate, revised {data.govtRevised}
          </p>
        </div>
        <div className="card accent">
          <span className="eyebrow">Market estimate</span>
          <p className="num accent" style={{ fontSize: '2rem', margin: '0.25rem 0 0.5rem' }}>
            {inr(data.marketTotal)}
          </p>
          <hr className="hr" style={{ margin: '0 0 0.5rem' }} />
          <p className="note mono">
            <span className={data.marketGain >= 0 ? 'up' : 'down'}>
              {inr(data.marketGain, true)} over what you paid · {data.marketGain >= 0 ? '+' : ''}
              {Math.round(data.marketGainPct)}%
            </span>
          </p>
        </div>
      </div>

      <div className="split">
        <div className="stack lg">
          {data.lots.length > 0 && (
            <Card title="How you bought it"
                  aside={<span className="note">
                    {data.lots.length > 1
                      ? `${data.lots.length} lots, one registration summary`
                      : 'One registration'}
                  </span>}>
              {/* Seven columns of registration detail: it scrolls inside the
                  card rather than taking the page sideways on a phone. */}
              <div className="scroll-x">
              <table style={{ minWidth: '46rem' }}>
                <thead>
                  <tr>
                    <th>Date</th><th className="right">Extent</th>
                    <th className="right">₹ / {unit}</th>
                    <th className="right">Paid</th><th className="right">Govt then</th><th>Seller &amp; deed</th><th />
                  </tr>
                </thead>
                <tbody>
                  {data.lots.map((l) => (
                    <tr key={l.id}>
                      <td className="num">{l.boughtOn}</td>
                      <td className="right num">
                        {num(l.extent, l.extentUnit === 'ac' ? 2 : 0)} {l.extentUnit}
                      </td>
                      <td className="right num">{inr(l.rate)}</td>
                      <td className="right num">{inr(l.paid)}</td>
                      <td className="right num" style={{ color: 'var(--w-info)' }}>{inr(l.govtValue)}</td>
                      <td>
                        {l.seller}
                        <span className="note" style={{ display: 'block' }}>{l.deedNo} · {l.sro}</span>
                      </td>
                      <td className="muted" aria-hidden><MoreVertOutlined sx={{ fontSize: 16 }} /></td>
                    </tr>
                  ))}
                  {data.lots.length > 1 && (
                    <tr className="total">
                      <td className="accent">Together</td>
                      <td className="right num">
                        {num(data.extent, data.extentUnit === 'ac' ? 2 : 0)} {data.extentUnit}
                      </td>
                      <td className="right num">{inr(data.blendedRate)}</td>
                      <td className="right num">{inr(data.blendedPaid)}</td>
                      <td className="right num" style={{ color: 'var(--w-info)' }}>{inr(data.blendedGovt)}</td>
                      <td colSpan={2} className="note">
                        Blended rate. The registration summary only ever showed the{' '}
                        {inr(data.blendedGovt)} government figure.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
              </div>
            </Card>
          )}

          {data.extras.length > 0 && (
            <Card title="Everything else you put in"
                  aside={<span className="num">{inr(data.extrasTotal)}</span>}>
              <div className="grid4">
                {data.extras.map((e) => (
                  <div key={e.id}>
                    <span className="eyebrow" style={{ margin: '0 0 0.25rem' }}>{e.label}</span>
                    <span className="num" style={{ fontSize: '1.0625rem' }}>{inr(e.amount)}</span>
                  </div>
                ))}
              </div>
              <p className="note" style={{ marginTop: 'var(--space-md)' }}>
                Capital work sits here, not in the purchase price — so cost per acre stays honest
                and a future capital-gains sum has the right base.
              </p>
            </Card>
          )}

          <Card
            title="Value over time"
            aside={
              <span className="row tight note" style={{ fontSize: '0.75rem' }}>
                <span style={{ color: 'var(--w-accent)' }}>— Market estimate</span>
                <span style={{ color: 'var(--w-info)' }}>— Government</span>
                <span className="muted">— What you paid</span>
              </span>
            }
          >
            <ValueChart series={data.series} />
          </Card>

          <Link to={`/app/records/${rec.id}/expenses`} className="btn">
            What this land costs to hold ›
          </Link>
        </div>

        <aside className="stack">
          <Card title={<span className="eyebrow" style={{ margin: 0 }}>Appreciation used</span>}>
            <p style={{ margin: 0 }}>
              <span className="num accent" style={{ fontSize: '1.75rem' }}>{data.appreciationPct}%</span>{' '}
              <span className="note">a year, compounding</span>
            </p>
            <div className="row tight" style={{ marginTop: 'var(--space-sm)' }}>
              {RATES.map((r) => (
                <button key={r} type="button" className="chip" aria-pressed={rate === r}
                        onClick={() => setRate(r)}>{r}%</button>
              ))}
              <span className="chip static">Custom</span>
            </div>
            <hr className="hr" />
            <p className="note row tight">
              <InfoOutlined sx={{ fontSize: 14 }} aria-hidden /> An assumption you chose, not a valuation.
            </p>
          </Card>

          {data.rates.length > 0 && (
            <Card title="Rates this land is priced in">
              <div className="grid4" style={{ gridTemplateColumns: 'repeat(2, minmax(0,1fr))' }}>
                {data.rates.map((r) => (
                  <div key={r.label} className="row between" style={{ flexWrap: 'nowrap' }}>
                    <span className="note">{r.label}</span>
                    <span className="num" style={{ fontSize: '0.875rem' }}>{inr(r.value)}</span>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {data.isBuilt && (
            <Card title="A built property splits in two">
              <div className="rows">
                <div>
                  <span className="grow">
                    Land
                    <span className="note mono" style={{ display: 'block' }}>
                      {num(data.landArea)} sq.yd × {inr(data.landRate)}
                    </span>
                  </span>
                  <span className="num">{inr(data.landValue)}</span>
                </div>
                <div>
                  <span className="grow">
                    Construction
                    <span className="note mono" style={{ display: 'block' }}>
                      {num(data.buildArea)} sq.ft × {inr(data.buildRate)}
                    </span>
                  </span>
                  <span className="num">{inr(data.buildValue)}</span>
                </div>
                <div>
                  <span className="grow">
                    Less depreciation
                    <span className="note mono" style={{ display: 'block' }}>
                      {data.depreciationYears} years, structure only
                    </span>
                  </span>
                  <span className="num down">−{inr(data.depreciation)}</span>
                </div>
              </div>
              <p className="note" style={{ marginTop: 'var(--space-sm)' }}>
                Land appreciates, a building wears out. Averaging them is how a house gets mispriced.
              </p>
            </Card>
          )}
        </aside>
      </div>
    </main>
  );
}
