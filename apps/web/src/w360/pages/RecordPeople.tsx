/** W08 — who looks after it, under what arrangement, paid how much.
 *
 *  Five kinds of person sit on one parcel and only two of them are users of the
 *  app. The card is therefore graded: the ones you pay get the full arrangement
 *  grid (what, how much, when next, what they can see); the ones you don't get
 *  a single line and one action. "Can see" is on the card and not in a settings
 *  screen because it is the fact people get wrong. */
import HistoryOutlined from '@mui/icons-material/HistoryOutlined';
import PersonAddAltOutlined from '@mui/icons-material/PersonAddAltOutlined';
import MoreVertOutlined from '@mui/icons-material/MoreVertOutlined';
import NorthEastOutlined from '@mui/icons-material/NorthEastOutlined';
import SouthWestOutlined from '@mui/icons-material/SouthWestOutlined';
import AccessTimeOutlined from '@mui/icons-material/AccessTimeOutlined';
import VerifiedOutlined from '@mui/icons-material/VerifiedOutlined';
import AccountBalanceWalletOutlined from '@mui/icons-material/AccountBalanceWalletOutlined';

import { usePeople } from '../api';
import { Card, Loading, initialsOf, inr } from '../ui';
import { RecordCrumbs, RecordTabs, useRecordCtx } from './Record';

export function RecordPeople() {
  const rec = useRecordCtx();
  const { data, isLoading } = usePeople(rec.id);

  return (
    <main>
      <RecordCrumbs rec={rec} here="People" />
      <p className="eyebrow">{rec.title} · {rec.placeLine.split(',')[0]}</p>

      <header className="pagehead">
        <div className="grow">
          <h1>Who looks after it</h1>
          {data && (
            <p className="lede" style={{ marginTop: '0.375rem' }}>
              {data.count} people · {inr(data.monthlyOut)} a month going out ·{' '}
              {inr(data.seasonalIn)} a season coming in
            </p>
          )}
        </div>
        <div className="actions">
          <button type="button" className="btn">
            <HistoryOutlined sx={{ fontSize: 16 }} /> Payment history
          </button>
          <button type="button" className="btn primary">
            <PersonAddAltOutlined sx={{ fontSize: 17 }} /> Assign someone
          </button>
        </div>
      </header>

      <RecordTabs rec={rec} />

      {isLoading && <Loading h="24rem" />}

      {data && (
        <div className="split" style={{ marginTop: 'var(--space-md)' }}>
          <div className="stack">
            {data.people.filter((p) => !p.compact).map((p) => (
              <article className="card pad-lg" key={p.id}>
                <div className="row" style={{ flexWrap: 'nowrap', alignItems: 'flex-start', gap: 'var(--space-md)' }}>
                  {/* Derived, not stored: saved initials belonged to the cast
                      the screen was drawn with and drifted from the names. */}
                  <span className="avatarlg">{initialsOf(p.name)}</span>
                  <div className="grow">
                    <div className="row" style={{ gap: 'var(--space-xs)' }}>
                      <h2>{p.name}</h2>
                      {p.badges.map((b) => (
                        <span key={b} className={`pill ${b.includes('verified') ? 'owned' : 'managed'}`}>
                          {b.includes('verified') && <VerifiedOutlined sx={{ fontSize: 12 }} />}
                          {b}
                        </span>
                      ))}
                      {p.badges.length === 0 && p.role && <span className="pill managed">{p.role}</span>}
                    </div>
                    <p className="note" style={{ marginTop: '0.375rem', color: 'var(--w-ink-2)' }}>{p.summary}</p>
                  </div>
                </div>

                <hr className="hr" />

                <div className="grid4">
                  {[
                    ['Arrangement', p.arrangement],
                    [p.payLabel, p.payValue],
                    [p.dueLabel, p.dueValue],
                    ['Can see', p.visibility],
                  ].filter(([k, v]) => k && v).map(([k, v]) => (
                    <div key={k}>
                      <span className="eyebrow" style={{ margin: '0 0 0.3125rem' }}>{k}</span>
                      <span style={{ fontSize: '0.9375rem' }}>{v}</span>
                    </div>
                  ))}
                </div>

                <div className="row tight" style={{ marginTop: 'var(--space-md)' }}>
                  {p.actions.map((a) => (
                    <button key={a} type="button"
                            className={`btn sm ${/^End /.test(a) ? 'danger' : ''}`}>
                      {a}
                    </button>
                  ))}
                </div>
              </article>
            ))}

            {data.people.some((p) => p.compact) && (
              <div className="card" style={{ padding: 0 }}>
                <div className="rows boxed">
                  {data.people.filter((p) => p.compact).map((p) => (
                    <div key={p.id}>
                      <span className="avatarlg" style={{ width: '2.25rem', height: '2.25rem', fontSize: '0.75rem' }}>
                        {initialsOf(p.name)}
                      </span>
                      <span className="grow">
                        <span className="row tight">
                          <strong style={{ fontSize: '0.9375rem' }}>{p.name}</strong>
                          {p.badges.map((b) => <span key={b} className="pill">{b}</span>)}
                        </span>
                        <span className="note" style={{ display: 'block', marginTop: '0.125rem' }}>{p.summary}</span>
                      </span>
                      <span className="row tight" style={{ flexWrap: 'nowrap' }}>
                        {p.actions.map((a) => (
                          <button key={a} type="button" className="btn sm">{a}</button>
                        ))}
                        <span className="muted" aria-hidden style={{ display: 'flex' }}>
                          <MoreVertOutlined sx={{ fontSize: 17 }} />
                        </span>
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <aside className="stack">
            <Card title={<span className="eyebrow" style={{ margin: 0 }}>Money on people</span>}>
              <p className="num" style={{ fontSize: '1.75rem', margin: 0 }}>
                {inr(data.monthlyOut)}{' '}
                <span className="note" style={{ fontSize: '0.8125rem' }}>out, this month</span>
              </p>
              <p className="num up" style={{ fontSize: '1.75rem', margin: '0.375rem 0 0' }}>
                {inr(data.seasonalIn)}{' '}
                <span className="note" style={{ fontSize: '0.8125rem' }}>in, at harvest</span>
              </p>
              <hr className="hr" />
              <div className="row" style={{ flexWrap: 'nowrap', alignItems: 'flex-start', gap: 'var(--space-sm)' }}>
                <span className="accent" style={{ display: 'flex', paddingTop: '0.125rem' }}>
                  <AccountBalanceWalletOutlined sx={{ fontSize: 18 }} />
                </span>
                <span>
                  <strong style={{ fontSize: '0.875rem' }}>Paid from your Pattadar wallet</strong>
                  <span className="note" style={{ display: 'block' }}>
                    Balance {inr(data.walletBalance)} · {data.walletNote}
                  </span>
                </span>
              </div>
              <button type="button" className="btn soft" style={{ width: '100%', justifyContent: 'center', marginTop: 'var(--space-sm)' }}>
                Top up the wallet
              </button>
            </Card>

            <Card title="Last payments">
              <div className="rows">
                {data.payments.map((p) => (
                  <div key={p.id}>
                    <span style={{ display: 'flex', color: p.state === 'escrow' ? 'var(--w-warn)' : p.direction === 'in' ? 'var(--w-ok)' : 'var(--w-ink-3)' }}>
                      {p.state === 'escrow'
                        ? <AccessTimeOutlined sx={{ fontSize: 16 }} />
                        : p.direction === 'in'
                          ? <SouthWestOutlined sx={{ fontSize: 16 }} />
                          : <NorthEastOutlined sx={{ fontSize: 16 }} />}
                    </span>
                    <span className="grow">
                      <span style={{ display: 'block', fontSize: '0.875rem' }}>{p.title}</span>
                      <span className="note mono" style={{ display: 'block', fontSize: '0.6875rem' }}>
                        {p.subtitle}
                      </span>
                    </span>
                    <span className={`num ${p.direction === 'in' ? 'up' : ''}`} style={{ fontSize: '0.8125rem' }}>
                      {inr(p.amount)}
                    </span>
                  </div>
                ))}
              </div>
            </Card>
          </aside>
        </div>
      )}
    </main>
  );
}
