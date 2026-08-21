/** The Services hanger on a record, and the same rows as a standalone list.
 *
 *  An order is the one place money leaves the app on someone else's word, so
 *  the row leads with its stage and says who is doing it and what is still held
 *  in escrow — never just "in progress". */
import { Link } from 'react-router';
import HandshakeOutlined from '@mui/icons-material/HandshakeOutlined';
import AccessTimeOutlined from '@mui/icons-material/AccessTimeOutlined';

import { useOrders } from '../api';
import type { Order } from '../api';
import { Loading, PageHead, inr } from '../ui';
import { RecordCrumbs, RecordTabs, useRecordCtx } from './Record';

const STAGES = ['Placed', 'Assigned', 'On site', 'Delivered'];

function Rail({ stage }: { stage: number }) {
  return (
    <span className="row tight" aria-label={`Stage ${stage + 1} of ${STAGES.length}`}>
      {STAGES.map((s, i) => (
        <span
          key={s}
          title={s}
          style={{
            width: '1.75rem', height: '0.25rem', borderRadius: 'var(--radius-pill)',
            background: i <= stage ? 'var(--w-accent)' : 'var(--w-surface-2)',
          }}
        />
      ))}
      <span className="note" style={{ marginLeft: '0.375rem' }}>{STAGES[stage] ?? STAGES[0]}</span>
    </span>
  );
}

function Rows({ orders, showRecord }: { orders: Order[]; showRecord?: boolean }) {
  if (orders.length === 0) {
    return (
      <div className="card">
        <p className="note">
          Nothing is on order. A survey, an EC, a title opinion or a site visit can be ordered from
          any record — the people who do the work appear on its People tab while they hold it.
        </p>
      </div>
    );
  }
  return (
    <div className="card" style={{ padding: 0 }}>
      <div className="rows boxed">
        {orders.map((o) => (
          <div key={o.id}>
            <span className="avatarlg" style={{ width: '2.25rem', height: '2.25rem' }}>
              <HandshakeOutlined sx={{ fontSize: 18 }} />
            </span>
            <span className="grow">
              <span className="row tight">
                <strong style={{ fontSize: '0.9375rem' }}>{o.title}</strong>
                <span className="mono note">{o.id.replace(/^w360-/, '')}</span>
                {o.needsYou && <span className="pill managed">Needs you</span>}
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
              <Rail stage={o.stage} />
            </span>
            <span style={{ textAlign: 'right' }}>
              <span className="num" style={{ display: 'block' }}>{inr(o.cost)}</span>
              {o.dueDate && (
                <span className="note row tight" style={{ justifyContent: 'flex-end' }}>
                  <AccessTimeOutlined sx={{ fontSize: 12 }} /> {o.dueDate}
                </span>
              )}
            </span>
            <button type="button" className="btn sm">Track order</button>
          </div>
        ))}
      </div>
    </div>
  );
}

export function RecordServices() {
  const rec = useRecordCtx();
  const { data, isLoading } = useOrders(rec.id);
  return (
    <main>
      <RecordCrumbs rec={rec} here="Services" />
      <p className="eyebrow">{rec.title} · {rec.placeLine.split(',')[0]}</p>
      <header className="pagehead">
        <div className="grow">
          <h1>What you have ordered</h1>
          <p className="lede" style={{ marginTop: '0.375rem' }}>
            Money for work is held until you accept what came back.
          </p>
        </div>
        <div className="actions">
          <button type="button" className="btn primary">
            <HandshakeOutlined sx={{ fontSize: 16 }} /> Order a service
          </button>
        </div>
      </header>
      <RecordTabs rec={rec} />
      <div style={{ marginTop: 'var(--space-md)' }}>
        {isLoading ? <Loading h="12rem" /> : <Rows orders={data ?? []} />}
      </div>
    </main>
  );
}

export function RecordHistory() {
  const rec = useRecordCtx();
  return (
    <main>
      <RecordCrumbs rec={rec} here="History" />
      <p className="eyebrow">{rec.title} · {rec.placeLine.split(',')[0]}</p>
      <header className="pagehead">
        <div className="grow">
          <h1>What has happened to it</h1>
          <p className="lede" style={{ marginTop: '0.375rem' }}>
            Every version, every moved mark, every paper added — in the order it happened.
          </p>
        </div>
      </header>
      <RecordTabs rec={rec} />
      <div className="card" style={{ marginTop: 'var(--space-md)' }}>
        <p className="note">
          This record&rsquo;s history starts at its sale deed. Older events — a mark moved, a sheet
          replaced, a paper shared — appear here as they occur, and nothing is ever removed from
          the list.
        </p>
      </div>
    </main>
  );
}

export function Assigned() {
  const { data, isLoading } = useOrders();
  return (
    <main>
      <PageHead eyebrow="Work on your records" title="Assigned to me">
        <p className="lede">
          Orders in flight and the things other people are waiting on you for.
        </p>
      </PageHead>
      {isLoading ? <Loading h="14rem" /> : <Rows orders={data ?? []} showRecord />}
    </main>
  );
}

export function Services() {
  const { data, isLoading } = useOrders();
  return (
    <main>
      <PageHead
        eyebrow="Services"
        title="Work you can order"
        actions={
          <button type="button" className="btn primary">
            <HandshakeOutlined sx={{ fontSize: 16 }} /> Order a service
          </button>
        }
      >
        <p className="lede">
          A licensed surveyor, an advocate&rsquo;s title opinion, an encumbrance search, a
          caretaker&rsquo;s visit. Ordered against one record, paid from your wallet, held in escrow
          until you accept the result.
        </p>
      </PageHead>
      {isLoading ? <Loading h="14rem" /> : <Rows orders={data ?? []} showRecord />}
    </main>
  );
}
