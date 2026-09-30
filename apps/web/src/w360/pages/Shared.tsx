/** W09 — someone else's property, with their kit.
 *
 *  The most important thing on this screen is what it does NOT do: a kit is
 *  read-only, belongs to whoever sent it, and never counts toward your acres.
 *  Everything the seller supplied is marked as theirs, and the things nobody
 *  has confirmed are priced — so a buyer can see what checking would cost
 *  before deciding anything.
 *
 *  Ordering those checks is not open from here, and the screen says so rather
 *  than offering it: `orderService` takes record ids and refuses anything that
 *  is not one of your own records, and a kit lives in `shared_kits`, never in
 *  your parcels. The other buttons this screen used to carry — answer the
 *  sender, ask for longer, make an offer — had no server behind them either,
 *  and a control that swallows a click is worse than a sentence saying why it
 *  is not there. What is left either works or explains itself.
 */
import { useState } from 'react';
import { Link } from 'react-router';
import GppGoodOutlined from '@mui/icons-material/GppGoodOutlined';
import VisibilityOutlined from '@mui/icons-material/VisibilityOutlined';
import OpenInNewOutlined from '@mui/icons-material/OpenInNewOutlined';
import CheckOutlined from '@mui/icons-material/CheckOutlined';
import ErrorOutlineOutlined from '@mui/icons-material/ErrorOutlineOutlined';
import CloseOutlined from '@mui/icons-material/CloseOutlined';

import { useSharedKits, useSharedKit } from '../api';
import { Card, Empty, Failed, Icon, Loading, PageHead, inr, inrFull, num, plural } from '../ui';

const VERDICT = {
  ok: { I: CheckOutlined, tone: 'up' },
  warn: { I: ErrorOutlineOutlined, tone: 'accent' },
  missing: { I: CloseOutlined, tone: 'down' },
} as const;

/** The eyebrow + title that head this section, on every one of its states. */
const HEAD = {
  eyebrow: 'Shared with you',
  title: 'Shared with me',
};

export function Shared() {
  const kits = useSharedKits();
  const [sel, setSel] = useState<string | null>(null);
  const list = kits.data ?? [];
  const activeId = sel ?? list.find((k) => k.state === 'live')?.id ?? list[0]?.id;
  const one = useSharedKit(activeId);
  const kit = one.data;
  const kitExpired = !!kit && kit.state !== 'live';
  // Sale wording only on a share that is actually a sale. A bank or a lawyer
  // sending one paper is not a seller, and the reader is not a buyer.
  const forSale = !!kit && /sale/i.test(kit.purpose || 'for_sale');

  if (kits.isPending && !kits.data) {
    return <main><Loading h="70vh" what="what has been shared with you" /></main>;
  }

  // The three states that used to be one 60vh skeleton held forever. With no
  // kits there is no `activeId`, so `useSharedKit` stays disabled and its data
  // never arrives — the old `{!kit && <Loading/>}` could not resolve, ever.
  if (kits.isError && !kits.data) {
    return (
      <main>
        <PageHead eyebrow={HEAD.eyebrow} title={HEAD.title} />
        <Failed what="Shared with me" error={kits.error} boxed h="26rem" />
      </main>
    );
  }

  // An empty inbox drops the rail: an 18rem column of filters over nothing is
  // dead space.
  if (kits.data && list.length === 0) {
    return (
      <main>
        <PageHead eyebrow={HEAD.eyebrow} title={HEAD.title} />
        <Empty boxed h="24rem" icon="eye" title="Nothing has been shared with you" />
      </main>
    );
  }

  return (
    <div className="withrail" style={{ gridTemplateColumns: '18rem minmax(0,1fr)' }}>
      <aside className="filters" aria-label="Shared with me">
        <div>
          <p className="eyebrow">{HEAD.eyebrow}</p>
          <h2 style={{ fontSize: '1.375rem' }}>{HEAD.title}</h2>
        </div>

        <div className="rows">
          {list.map((k) => {
            const on = k.id === activeId;
            const dead = k.state !== 'live';
            return (
              <button
                key={k.id}
                type="button"
                onClick={() => setSel(k.id)}
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
                  <span style={{ display: 'block', fontWeight: 700, fontSize: '0.875rem' }}>{k.title}</span>
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
          The sender can see when you open this.
        </p>
      </aside>

      <main>
        {!kit && one.isPending && <Loading h="60vh" what="this share" />}
        {!kit && one.isError && (
          <Failed what="This share" error={one.error} boxed h="24rem" onRetry={() => one.refetch()} />
        )}
        {/* Resolved to null: the link was revoked, or the sender withdrew it
            between the list arriving and this read. The row stays in the rail
            so the user can see which one went, rather than silently vanishing. */}
        {!kit && one.data === null && !one.isError && (
          <Empty boxed h="24rem" icon="lock" title="This share is no longer available">
            Whoever sent it has withdrawn it.
          </Empty>
        )}
        {kit && (
          <>
            {kits.isRefetchError && (
              <p className="note" role="status" style={{ color: 'var(--w-danger)', marginBottom: 'var(--space-md)' }}>
                The list could not refresh.
              </p>
            )}
            <header className="pagehead">
              <div className="grow">
                <p className="eyebrow row tight" style={{ gap: 'var(--space-sm)' }}>
                  {kitExpired ? 'Share expired' : forSale ? 'For sale' : 'Shared'}
                  <span className="pill for_sale" style={{ textTransform: 'none', letterSpacing: 0 }}>
                    <VisibilityOutlined sx={{ fontSize: 12 }} /> Read-only · Not your property
                  </span>
                </p>
                <h1>{kit.title}</h1>
                <p className="lede" style={{ marginTop: '0.375rem' }}>{kit.headline}</p>
                {kitExpired && (
                  <p className="note" style={{ marginTop: 'var(--space-sm)', maxWidth: '44rem', color: 'var(--w-danger)' }}>
                    This share expired{kit.expiredOn ? ` on ${kit.expiredOn}` : ''}.
                  </p>
                )}
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
              </section>
            )}

            <div className="two">
              <Card title="Shared documents"
                    aside={<span className="note">Watermarked · No download</span>}>
                {kit.items.length === 0 ? (
                  <Empty icon="paper" title="No documents were shared" />
                ) : (
                  <>
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
                              <span style={{ display: 'block', fontWeight: 700, fontSize: '0.875rem' }}>{it.title}</span>
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
                  </>
                )}
              </Card>

              <div className="stack">
                <Card className="accent" title={
                  <span className="row tight">
                    <span className="accent" style={{ display: 'flex' }}>
                      <GppGoodOutlined sx={{ fontSize: 17 }} />
                    </span>
                    Not independently checked
                  </span>
                }>
                  {/* A kit whose seller priced no checks used to read "These
                      are the 0 things a buyer regrets not checking" over an
                      empty box, under a live primary button offering "Order
                      all 0 · ₹0". The count comes from shared_kit_checks,
                      which can legitimately have no rows, so the whole body
                      branches rather than the sentence alone — a disabled
                      "Order all 0" would still be nonsense on screen. */}
                  {kit.checks.length === 0 ? (
                    <p className="note">
                      Only the sender has confirmed these.
                    </p>
                  ) : (
                    <>
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
                      {/* Disabled. orderService(recordIds, kind) is checked
                          against your own records and a kit is not one; the
                          rows also carry no catalogue key to order by, and
                          their prices and the catalogue's disagree — so a
                          wired button would charge a total other than the one
                          printed on it, or refuse by returning 0 in silence.
                          The price list is still the useful half: it is what
                          checking this land would cost. .btn has no disabled
                          styling of its own, hence the inline dimming. */}
                      <button type="button" className="btn primary" disabled
                              style={{
                                width: '100%', justifyContent: 'center', marginTop: 'var(--space-md)',
                                opacity: 0.55, cursor: 'not-allowed',
                              }}>
                        {kit.checks.length === 1
                          ? 'Order it'
                          : `Order all ${kit.checks.length === 4 ? 'four' : num(kit.checks.length)}`}
                        {' · '}{inr(kit.checksTotal)}
                      </button>
                    </>
                  )}
                  <Link className="btn sm" to="/app/order" style={{ marginTop: 'var(--space-md)' }}>
                    Order a check on your own land
                  </Link>
                </Card>

                {!kitExpired && forSale && <Card title="Before you buy">
                  {/* Both counts are interpolated into prose, so both need a
                      zero and a singular: this card used to promise that "Its
                      0 papers move into your vault" on a kit with nothing
                      attached. */}
                  <p className="note" style={{ color: 'var(--w-ink-2)' }}>
                    On registration this becomes one of your properties.{' '}
                    {kit.items.length > 0 && (
                      <>
                        Its {plural(kit.items.length, 'document')}{' '}
                        {kit.items.length === 1 ? 'moves' : 'move'} into your Documents.
                      </>
                    )}
                  </p>
                  <div className="row tight" style={{ marginTop: 'var(--space-sm)' }}>
                    <Link className="btn sm" to="/app/tools?tab=stamp-duty" target="_blank" rel="noopener">
                      <OpenInNewOutlined sx={{ fontSize: 15 }} /> Work out stamp duty
                    </Link>
                  </div>
                  {kit.askedPrice > 0 && (
                    <p className="note" style={{ marginTop: 'var(--space-xs)' }}>
                      Asked at {inrFull(kit.askedPrice)}.
                    </p>
                  )}
                </Card>}
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
