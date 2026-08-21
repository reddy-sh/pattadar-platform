/** W09 — someone else's property, with their kit.
 *
 *  The most important thing on this screen is what it does NOT do: a kit is
 *  read-only, belongs to whoever sent it, and never counts toward your acres.
 *  Everything the seller supplied is marked as theirs; the four things nobody
 *  has confirmed are priced and orderable in your name, and the seller is not
 *  told you ordered them. */
import { useState } from 'react';
import BlockOutlined from '@mui/icons-material/BlockOutlined';
import GppGoodOutlined from '@mui/icons-material/GppGoodOutlined';
import VisibilityOutlined from '@mui/icons-material/VisibilityOutlined';
import CheckOutlined from '@mui/icons-material/CheckOutlined';
import ErrorOutlineOutlined from '@mui/icons-material/ErrorOutlineOutlined';
import CloseOutlined from '@mui/icons-material/CloseOutlined';

import { useSharedKits, useSharedKit } from '../api';
import { Card, Icon, Loading, inr } from '../ui';

const TABS = ['Their kit', 'Map', 'Photos', 'Features', 'My private notes'];

const VERDICT = {
  ok: { I: CheckOutlined, tone: 'up' },
  warn: { I: ErrorOutlineOutlined, tone: 'accent' },
  missing: { I: CloseOutlined, tone: 'down' },
} as const;

export function Shared() {
  const kits = useSharedKits();
  const [sel, setSel] = useState<string | null>(null);
  const list = kits.data ?? [];
  const activeId = sel ?? list.find((k) => k.state === 'live')?.id ?? list[0]?.id;
  const { data: kit } = useSharedKit(activeId);
  const [tab, setTab] = useState('Their kit');

  if (kits.isLoading) return <main><Loading h="70vh" /></main>;

  return (
    <div className="withrail" style={{ gridTemplateColumns: '18rem minmax(0,1fr)' }}>
      <aside className="filters" aria-label="Shared with me">
        <div>
          <p className="eyebrow">Not yours</p>
          <h2 style={{ fontSize: '1.375rem' }}>Shared with me</h2>
          <p className="note" style={{ marginTop: '0.375rem' }}>
            Kept out of your portfolio. Nothing here counts toward your acres.
          </p>
        </div>

        <div className="rows">
          {list.map((k) => {
            const on = k.id === activeId;
            const dead = k.state !== 'live';
            return (
              <button
                key={k.id}
                type="button"
                onClick={() => { setSel(k.id); setTab('Their kit'); }}
                style={{
                  border: 0, background: on ? 'var(--w-accent-wash)' : 'none', font: 'inherit',
                  textAlign: 'left', cursor: 'pointer', color: 'inherit', width: '100%',
                  borderLeft: `2px solid ${on ? 'var(--w-accent)' : 'transparent'}`,
                  paddingLeft: 'var(--space-sm)', opacity: dead ? 0.55 : 1,
                }}
              >
                <span className="avatarlg" style={{ width: '2.25rem', height: '2.25rem' }}>
                  <Icon name={k.kind === 'parcel' ? 'agri' : 'flat'} size={18} />
                </span>
                <span className="grow">
                  <span style={{ display: 'block', fontWeight: 600, fontSize: '0.875rem' }}>{k.title}</span>
                  <span className="note" style={{ display: 'block' }}>{k.listLine}</span>
                  <span className={dead ? 'note' : 'note accent'} style={{ display: 'block', marginTop: '0.125rem' }}>
                    {dead
                      ? `expired ${k.expiredOn} — ${k.senderNote}`
                      : k.sharedAt
                        ? `shared ${k.sharedAt.split(' ')[0]} · ${k.daysLeft} days left`
                        : k.senderNote}
                  </span>
                </span>
              </button>
            );
          })}
        </div>

        <p className="note">
          A kit is read-only and belongs to whoever sent it. Your notes on it are private — the
          sender never sees them.
        </p>
      </aside>

      <main>
        {!kit && <Loading h="60vh" />}
        {kit && (
          <>
            <header className="pagehead">
              <div className="grow">
                <p className="eyebrow row tight" style={{ gap: 'var(--space-sm)' }}>
                  Shared for sale
                  <span className="pill for_sale" style={{ textTransform: 'none', letterSpacing: 0 }}>
                    <VisibilityOutlined sx={{ fontSize: 12 }} /> Read-only · not your record
                  </span>
                </p>
                <h1>{kit.title}</h1>
                <p className="lede" style={{ marginTop: '0.375rem' }}>{kit.headline}</p>
              </div>
              <div className="actions">
                <button type="button" className="btn">
                  <BlockOutlined sx={{ fontSize: 16 }} /> Not interested
                </button>
                <button type="button" className="btn primary">
                  <GppGoodOutlined sx={{ fontSize: 16 }} /> Check it independently
                </button>
              </div>
            </header>

            {kit.senderName && (
              <section className="card row between" style={{ flexWrap: 'nowrap', gap: 'var(--space-md)', marginBottom: 'var(--space-md)' }}>
                <span className="row" style={{ flexWrap: 'nowrap', gap: 'var(--space-sm)' }}>
                  <span className="avatarlg">{kit.senderInitials}</span>
                  <span>
                    <strong style={{ fontSize: '0.9375rem' }}>
                      Sent by {kit.senderName}
                      {kit.senderNote && <span className="note" style={{ fontWeight: 400 }}> · {kit.senderNote}</span>}
                    </strong>
                    <span className="note" style={{ display: 'block', marginTop: '0.125rem' }}>
                      {[kit.sharedAt, kit.terms, kit.daysLeft && `${kit.daysLeft} days left`]
                        .filter(Boolean).join(' · ')}
                    </span>
                  </span>
                </span>
                <span className="row tight" style={{ flexWrap: 'nowrap' }}>
                  <button type="button" className="btn sm">Message him</button>
                  <button type="button" className="btn sm">Ask for more time</button>
                </span>
              </section>
            )}

            <nav className="tabs" aria-label="This kit">
              {TABS.map((t) => (
                <button key={t} type="button" aria-selected={tab === t} onClick={() => setTab(t)}>
                  {t}
                  {t === 'Their kit' && kit.items.length > 0 && <span className="n">{kit.items.length}</span>}
                  {t === 'Photos' && kit.photoCount > 0 && <span className="n">{kit.photoCount}</span>}
                  {t === 'Features' && kit.featureCount > 0 && <span className="n">{kit.featureCount}</span>}
                </button>
              ))}
            </nav>

            {tab !== 'Their kit' && (
              <p className="note" style={{ padding: 'var(--space-xl) 0' }}>
                {tab === 'My private notes'
                  ? 'Anything you write here stays yours. The sender never sees it.'
                  : `${tab} the sender supplied — read-only, watermarked, no download.`}
              </p>
            )}

            {tab === 'Their kit' && (
              <div className="two">
                <Card title="What they gave you"
                      aside={<span className="note">watermarked · no download</span>}>
                  <div className="rows">
                    {kit.items.map((it) => {
                      const v = VERDICT[it.verdict as keyof typeof VERDICT] ?? VERDICT.ok;
                      return (
                        <div key={it.id}>
                          <span className="muted" style={{ display: 'flex', color: 'var(--w-info)' }}>
                            <Icon name={it.shelf.toLowerCase().includes('title') ? 'title'
                              : it.shelf.toLowerCase().includes('revenue') ? 'revenue'
                              : it.shelf.toLowerCase().includes('map') ? 'map'
                              : it.shelf.toLowerCase().includes('photo') ? 'photos' : 'search'} size={18} />
                          </span>
                          <span className="grow">
                            <span style={{ display: 'block', fontWeight: 600, fontSize: '0.875rem' }}>{it.title}</span>
                            <span className="note" style={{ display: 'block' }}>
                              {it.shelf} · <span className={it.verdict === 'ok' ? '' : v.tone}>{it.note}</span>
                            </span>
                          </span>
                          <span className={v.tone} style={{ display: 'flex' }}>
                            <v.I sx={{ fontSize: 17 }} />
                          </span>
                        </div>
                      );
                    })}
                  </div>
                  <p className="note" style={{ marginTop: 'var(--space-md)' }}>
                    Read by AI, filed on the same eight shelves as your own vault — so a
                    stranger&rsquo;s kit is browsable the moment it lands, without you sorting anything.
                  </p>
                </Card>

                <div className="stack">
                  <Card className="accent" title={
                    <span className="row tight">
                      <span className="accent" style={{ display: 'flex' }}>
                        <GppGoodOutlined sx={{ fontSize: 17 }} />
                      </span>
                      What nobody has confirmed
                    </span>
                  }>
                    <p className="note" style={{ marginBottom: 'var(--space-sm)' }}>
                      Everything above came from the seller. These are the{' '}
                      {kit.checks.length === 4 ? 'four' : kit.checks.length} things a buyer regrets
                      not checking.
                    </p>
                    <div className="rows">
                      {kit.checks.map((c) => (
                        <div key={c.id}>
                          <span className="accent" style={{ display: 'flex' }}>
                            <ErrorOutlineOutlined sx={{ fontSize: 16 }} />
                          </span>
                          <span className="grow">
                            <span style={{ display: 'block', fontSize: '0.875rem' }}>{c.title}</span>
                            <span className="note" style={{ display: 'block' }}>{c.note}</span>
                          </span>
                          <span className="num" style={{ fontSize: '0.8125rem' }}>{inr(c.price)}</span>
                        </div>
                      ))}
                    </div>
                    <button type="button" className="btn primary"
                            style={{ width: '100%', justifyContent: 'center', marginTop: 'var(--space-md)' }}>
                      Order all {kit.checks.length === 4 ? 'four' : kit.checks.length} · {inr(kit.checksTotal)}
                    </button>
                    <p className="note" style={{ textAlign: 'center', marginTop: 'var(--space-xs)' }}>
                      Ordered in your name. The seller is not told.
                    </p>
                  </Card>

                  <Card title="If you buy it">
                    <p className="note" style={{ color: 'var(--w-ink-2)' }}>
                      On registration this kit becomes a holding of yours. Its {kit.items.length}{' '}
                      papers move into your vault as the record&rsquo;s starting history, the FMB
                      becomes its map, and the seller&rsquo;s name stays on them where it belongs.
                    </p>
                    <div className="row tight" style={{ marginTop: 'var(--space-md)' }}>
                      <button type="button" className="btn sm">Make an offer</button>
                      <button type="button" className="btn sm">Stamp duty on {inr(kit.askedPrice)}</button>
                    </div>
                  </Card>
                </div>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
