/** W16 — the money side of a service ticket.
 *
 *  Three questions, in the order an owner asks them: what have I got, what is
 *  spoken for on work that is still out, and where did the rest of it go. The
 *  first two are different numbers and the page says so — money set aside on a
 *  job is neither spent nor available, and a screen that folds it into one
 *  balance is the reason people ring up asking why their wallet "lost" 8,600.
 *
 *  Every figure comes off the ledger the API sums; nothing is computed here.
 *  While the payments provider is a stub no rupee has actually moved, so the
 *  notice at the top and the row-level pill say exactly that. Adding money is
 *  the one thing the prototype cannot honestly pretend to do, so its button is
 *  disabled and says why rather than opening a card form that charges nobody.
 */
import { Link } from 'react-router';

import { useWallet } from '../api';
import { Card, Cell, Failed, Loading, PageHead, State, inrFull, inrFullish, plural } from '../ui';

/** useWallet asks the resolver for 60 ledger rows and the resolver honours that
 *  exactly, with no offset and no cursor to ask for the rest. So a full page is
 *  the one case where movements exist that are not on screen; anything short of
 *  it is the whole ledger and can honestly be counted as such. */
const LEDGER_PAGE = 60;

export function Wallet() {
  const { data, isLoading, error } = useWallet();
  const rowCount = data?.rows.length ?? 0;
  const capped = rowCount >= LEDGER_PAGE;

  return (
    <main>
      <PageHead eyebrow="Money" title="What is set aside, and what has gone">
        <p className="lede">The surveyor, the advocate and the caretaker are paid from here.</p>
      </PageHead>

      {/* Three states, not two. A wallet that cannot be read is the one screen
          where a skeleton held forever is actively frightening — it reads as
          money that has gone missing rather than as a request that failed. */}
      {isLoading ? <Loading h="60vh" />
        : !data ? <Failed what="Your wallet" error={error} boxed h="24rem" />
        : (
        <>
          {/* The API writes this sentence, not the page — the same words have to
              hold on any screen that shows a figure the stub recorded. */}
          {!data.live && (
            <div className="card dashed" style={{ marginBottom: 'var(--space-lg)' }}>
              <p className="note">{data.notice}</p>
            </div>
          )}

          {/* Whole rupees, not lakh short forms. inr() printed ₹1,00,500 as
              "₹1.01 L" while the movement that put it there was listed as
              ₹1,00,500 a few inches below — ₹433 of daylight between two figures
              on one screen is exactly the "why did my wallet lose money" call
              this page exists to prevent. A balance is a number someone
              reconciles, not a magnitude. */}
          <div className="strip">
            <Cell k="Available" v={inrFullish(data.available)} note="in your wallet" />
            <Cell k="Set aside on jobs" v={inrFullish(data.setAside)}
                  note={plural(data.jobs.length, 'job', 'jobs')} />
            <Cell k="Gone out" v={inrFullish(data.paidOut)} note="to people and to Pattadar" />
            <Cell k="Put in" v={inrFullish(data.putIn)}
                  note={data.autoTopUp ? 'auto top-up on' : 'auto top-up off'} />
          </div>

          <div style={{ margin: 'var(--space-md) 0 var(--space-lg)' }}>
            <button type="button" className="btn soft" disabled
                    title="Adding money to the wallet is not switched on yet"
                    style={{ width: '100%', justifyContent: 'center' }}>
              Add money
            </button>
          </div>

          <div className="stack">
            <Card title="Jobs holding money"
                  aside={<span className="num muted">{data.jobs.length}</span>}>
              {data.jobs.length === 0 ? (
                <p className="note">
                  No money is set aside on any job. When you order a survey or a title opinion,
                  what it costs appears here until you accept the work.
                </p>
              ) : (
                <div className="rows boxed">
                  {data.jobs.map((j) => (
                    <div key={j.ticketId}>
                      <span className="grow">
                        <Link to={`/app/services/${j.ticketId}`}
                              style={{ color: 'inherit', textDecoration: 'none',
                                       fontSize: '0.9375rem' }}>
                          <strong>{j.title}</strong>
                        </Link>
                        <span className="note" style={{ display: 'block', marginTop: '0.125rem' }}>
                          {j.ref} · {j.recordTitle} · {j.statusLabel}
                        </span>
                      </span>
                      <span className="num" style={{ textAlign: 'right', flex: 'none' }}>
                        {inrFullish(j.held)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </Card>

            {/* The number beside a card title reads as a total on every other
                screen in this module, and here it was the size of the page the
                API returned: an account with 300 entries said "Every movement
                60" and ended at the sixtieth with nothing to say the rest
                existed. While the whole ledger fits in one page the count is
                the total and the old title is true; once it does not, the card
                claims only what it is actually showing. */}
            <Card title={capped ? 'The latest movements' : 'Every movement'}
                  aside={capped ? undefined : <span className="num muted">{rowCount}</span>}>
              {data.rows.length === 0 ? (
                <p className="note">
                  Nothing has moved yet. When money is set aside on a job, released to the person
                  who did it, or given back, every movement is listed here with the date.
                </p>
              ) : (
                <div className="rows boxed">
                  {data.rows.map((r) => (
                    <div key={r.id}>
                      <span className="grow">
                        <strong style={{ fontSize: '0.9375rem' }}>{r.label}</strong>
                        <span className="note" style={{ display: 'block', marginTop: '0.125rem' }}>
                          {r.note}
                          {r.payee && ` · ${r.payee}`}
                          {r.ticketRef && ` · ${r.ticketRef}`}
                        </span>
                      </span>
                      {/* Deliberately colourless while the provider is a stub:
                          a green tick beside a figure nobody collected would
                          vouch for a movement that never left the building. */}
                      {r.simulated ? (
                        <span className="pill sim">Not charged</span>
                      ) : (
                        <State state={r.status === 'failed' ? 'bad' : 'good'}>
                          {r.status === 'failed' ? 'It did not go' : 'Settled'}
                        </State>
                      )}
                      <span style={{ textAlign: 'right', flex: 'none' }}>
                        <span className="num" style={{ display: 'block' }}>{inrFull(r.amount)}</span>
                        <span className="note">{r.at}</span>
                      </span>
                    </div>
                  ))}
                </div>
              )}
              {capped && (
                <p className="note" style={{ marginTop: 'var(--space-md)' }}>
                  Showing the latest {plural(LEDGER_PAGE, 'movement')}. Older ones are not on this
                  screen yet; every movement made against a job is listed in full on that job's
                  own page.
                </p>
              )}
            </Card>
          </div>
        </>
      )}
    </main>
  );
}
