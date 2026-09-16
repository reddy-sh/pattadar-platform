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

/** The eyebrow + title + lede that head this section, on every one of its
 *  states. An empty inbox still has to say what the inbox is for. */
const HEAD = {
  eyebrow: 'Not yours',
  title: 'Shared with me',
  lede: 'Kept out of your portfolio. Nothing here counts toward your acres.',
};

export function Shared() {
  const kits = useSharedKits();
  const [sel, setSel] = useState<string | null>(null);
  const list = kits.data ?? [];
  const activeId = sel ?? list.find((k) => k.state === 'live')?.id ?? list[0]?.id;
  const one = useSharedKit(activeId);
  const kit = one.data;
  const kitExpired = !!kit && kit.state !== 'live';

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
  // dead space, and the sentence explaining what a kit is belongs in the middle
  // of the screen where it will actually be read.
  if (kits.data && list.length === 0) {
    return (
      <main>
        <PageHead eyebrow={HEAD.eyebrow} title={HEAD.title}>
          <p className="lede" style={{ marginTop: '0.375rem' }}>{HEAD.lede}</p>
        </PageHead>
        <Empty boxed h="24rem" icon="eye" title="Nothing has been shared with you">
          When someone sends you a kit — the papers and the price behind a property they
          are selling — it lands here, read-only. You will be told when one arrives; there
          is nothing to set up.
        </Empty>
      </main>
    );
  }

  return (
    <div className="withrail" style={{ gridTemplateColumns: '18rem minmax(0,1fr)' }}>
      <aside className="filters" aria-label="Shared with me">
        <div>
          <p className="eyebrow">{HEAD.eyebrow}</p>
          <h2 style={{ fontSize: '1.375rem' }}>{HEAD.title}</h2>
          <p className="note" style={{ marginTop: '0.375rem' }}>{HEAD.lede}</p>
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

        {/* Reading can be counted by the share link, and the kit prints that
            fact in its own terms. What is private is narrower: this screen has
            no reply channel and sends no note, order or offer to the sender. */}
        <p className="note">
          A kit is read-only and belongs to whoever sent it. Opening it may be counted;
          this screen sends the sender no reply, note, order or offer.
        </p>
      </aside>

      <main>
        {!kit && one.isPending && <Loading h="60vh" what="this kit" />}
        {!kit && one.isError && (
          <Failed what="This kit" error={one.error} boxed h="24rem" onRetry={() => one.refetch()} />
        )}
        {/* Resolved to null: the link was revoked, or the sender withdrew it
            between the list arriving and this read. The row stays in the rail
            so the user can see which one went, rather than silently vanishing. */}
        {!kit && one.data === null && !one.isError && (
          <Empty boxed h="24rem" icon="lock" title="This kit is no longer available">
            Whoever sent it has withdrawn it. Nothing you did removed it, and
            nothing of yours went with it — a kit was never part of your portfolio.
          </Empty>
        )}
        {kit && (
          <>
            {kits.isRefetchError && (
              <p className="note" role="status" style={{ color: 'var(--w-danger)', marginBottom: 'var(--space-md)' }}>
                The list could not refresh. The kit already on screen is still available;
                try again when the connection returns.
              </p>
            )}
            <header className="pagehead">
              <div className="grow">
                <p className="eyebrow row tight" style={{ gap: 'var(--space-sm)' }}>
                  {kitExpired ? 'Share expired' : 'Shared for sale'}
                  <span className="pill for_sale" style={{ textTransform: 'none', letterSpacing: 0 }}>
                    <VisibilityOutlined sx={{ fontSize: 12 }} /> Read-only · not your record
                  </span>
                </p>
                <h1>{kit.title}</h1>
                <p className="lede" style={{ marginTop: '0.375rem' }}>{kit.headline}</p>
                {/* "Not interested" and "Check it independently" stood here as
                    buttons with no onClick, and neither could have been wired:
                    web360.py exposes sharedKits and sharedKit as reads and has
                    no kit mutation at all, so there is no way to answer the
                    sender, and orderService refuses an id that is not one of
                    your own records. Two live-looking controls that swallowed
                    a click are replaced by the two facts they implied. */}
                {kitExpired ? (
                  <p className="note" style={{ marginTop: 'var(--space-sm)', maxWidth: '44rem', color: 'var(--w-danger)' }}>
                    This share expired{kit.expiredOn ? ` on ${kit.expiredOn}` : ''}. Its contents
                    remain read-only here; ask the sender to share it again before relying on them.
                  </p>
                ) : (
                  <p className="note" style={{ marginTop: 'var(--space-sm)', maxWidth: '44rem' }}>
                    A kit asks nothing of you. Leave it alone and it lapses on its own. Opening it
                    may be counted, but no reply, note, order or offer is sent to the sender.
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
                {/* "Message him" and "Ask for more time" were buttons with no
                    handler, and nothing in the payload could have made them
                    work: a kit carries the sender's name and initials, no
                    phone and no email, and there is no mutation that writes
                    back to whoever shared it. The row now says how the clock
                    is actually changed — only the sender can re-share. */}
                <span className="note" style={{ maxWidth: '17rem', textAlign: 'right', flexShrink: 0 }}>
                  A kit carries no reply channel. To reach {kit.senderName} or ask for longer,
                  go back the way they first reached you — only the sender can re-share it.
                </span>
              </section>
            )}

            {/* The tab strip offered Map, Photos, Features and My private
                notes beside this one, with counts on two of them, and not one
                of the four had anything to render: shared_kits holds no ring,
                lat or lon, there are no kit photo or feature tables, and no
                kit note exists to write into. Four tabs printed a single grey
                sentence, and the badges promised twelve photos the server
                never sends. What a kit does and does not carry is said once,
                here, instead. */}
            <p className="note" style={{ marginBottom: 'var(--space-lg)' }}>
              This view lists what the sender included. Map sheets and photo counts can appear
              below as items, but there is no interactive map, photo gallery, feature list or
              private notebook attached to this kit.
            </p>

            <div className="two">
              <Card title="What they gave you"
                    aside={<span className="note">watermarked · no download</span>}>
                {/* An empty kit used to draw a card head, a blank strip and a
                    paragraph about AI filing papers onto eight shelves — a
                    sentence about a filing that did not happen. That a seller
                    sent no documents at all is the single most useful thing a
                    buyer can learn here, so it is said, and the paragraph
                    about the filing only appears when there is something
                    filed. */}
                {kit.items.length === 0 ? (
                  <Empty icon="paper" title="The seller sent no papers">
                    This kit is a listing, not a file — nothing in it has a document behind it.
                    Ask the sender to re-share with the deed, passbook and ROR attached.
                  </Empty>
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
                  </>
                )}
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
                  {/* A kit whose seller priced no checks used to read "These
                      are the 0 things a buyer regrets not checking" over an
                      empty box, under a live primary button offering "Order
                      all 0 · ₹0". The count comes from shared_kit_checks,
                      which can legitimately have no rows, so the whole body
                      branches rather than the sentence alone — a disabled
                      "Order all 0" would still be nonsense on screen. */}
                  {kit.checks.length === 0 ? (
                    <p className="note">
                      Nobody has listed anything to check on this kit yet, so nothing in it
                      has been confirmed by anyone but the seller.
                    </p>
                  ) : (
                    <>
                      <p className="note" style={{ marginBottom: 'var(--space-sm)' }}>
                        Everything above came from the seller.{' '}
                        {kit.checks.length === 1
                          ? 'This is the one thing a buyer regrets not checking.'
                          : `These are the ${kit.checks.length === 4 ? 'four things' : plural(kit.checks.length, 'thing')} a buyer regrets not checking.`}
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
                      {/* Disabled, and said out loud underneath rather than in
                          a title=. orderService(recordIds, kind) is checked
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
                      <p className="note" style={{ textAlign: 'center', marginTop: 'var(--space-xs)' }}>
                        Not open yet: a check is ordered against a property that is already
                        yours, and this one is someone else&rsquo;s.
                      </p>
                      <p className="note" style={{ textAlign: 'center', marginTop: 'var(--space-xs)' }}>
                        When it opens: ordered in your name. The seller is not told.
                      </p>
                    </>
                  )}
                  <p className="note" style={{ marginTop: 'var(--space-md)' }}>
                    Checks you can order today are the ones on your own land — the same
                    survey, encumbrance and title reading, against a record of yours.
                  </p>
                  <Link className="btn sm" to="/app/order" style={{ marginTop: 'var(--space-sm)' }}>
                    Order a check on your own land
                  </Link>
                </Card>

                {!kitExpired && <Card title="If you buy it">
                  {/* Both counts are interpolated into prose, so both need a
                      zero and a singular: this card used to promise that "Its
                      0 papers move into your vault" on a kit with nothing
                      attached. */}
                  <p className="note" style={{ color: 'var(--w-ink-2)' }}>
                    On registration this kit becomes a holding of yours.{' '}
                    {kit.items.length > 0 ? (
                      <>
                        Its {plural(kit.items.length, 'paper')}{' '}
                        {kit.items.length === 1 ? 'moves' : 'move'} into your vault as the
                        record&rsquo;s starting history, the FMB becomes its map, and the
                        seller&rsquo;s name stays on them where it belongs.
                      </>
                    ) : (
                      <>
                        Nothing is attached to this kit to move into your vault, so the record
                        would start with no history behind it — only what you are handed at
                        registration.
                      </>
                    )}
                  </p>
                  {/* "Make an offer" was a button with no handler and nothing
                      to give it: an offer is not a thing this system records —
                      no table, no mutation, and no channel back to the sender.
                      "Stamp duty on ₹…" was dead too, but that one has a real
                      calculator behind it at /legacy/tools, so it opens it.
                      The calculator takes no figure in its URL, which is why
                      the asked price is printed here to be typed in. */}
                  <p className="note" style={{ marginTop: 'var(--space-md)' }}>
                    An offer is made between you and the seller. Pattadar does not carry one,
                    and this screen does not send offers or notes to {kit.senderName || 'the sender'}.
                  </p>
                  <div className="row tight" style={{ marginTop: 'var(--space-sm)' }}>
                    <Link className="btn sm" to="/legacy/tools?tab=stamp-duty" target="_blank" rel="noopener">
                      <OpenInNewOutlined sx={{ fontSize: 15 }} /> Work out stamp duty
                    </Link>
                  </div>
                  {kit.askedPrice > 0 && (
                    <p className="note" style={{ marginTop: 'var(--space-xs)' }}>
                      The calculator opens blank. This kit is asked at {inrFull(kit.askedPrice)}.
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
