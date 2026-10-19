/** W16 — the money side of a service ticket.
 *
 *  Three questions, in the order an owner asks them: what have I got, what is
 *  spoken for on work that is still out, and where did the rest of it go. The
 *  first two are different numbers and the page says so — money set aside on a
 *  job is neither spent nor available, and a screen that folds it into one
 *  balance is the reason people ring up asking why their wallet "lost" 8,600.
 *
 *  Every headline figure comes off the ledger the API sums; the only sums made
 *  here are the transactions table's footer, over the rows it lists (or the
 *  ones ticked).
 *  While the payments provider is a stub no rupee has actually moved, so the
 *  notice at the top and the row-level pill say exactly that. Adding money is
 *  the one thing the prototype cannot honestly pretend to do, so it is not
 *  offered at all until payments are live: a disabled button would be the
 *  page's one filled command and a dead one (design.md § Page head).
 */
import { Link } from 'react-router';
import FileDownloadOutlined from '@mui/icons-material/FileDownloadOutlined';

import { useWallet, type WalletView } from '../api';
import {
  Card, Cell, Failed, PageHead, SelectAllBox, SelectCell, SelectionBar, State, TablePager, ddmmyyyy,
  downloadCsv, inrFull, inrFullish, plural, usePaged, useRowSelection,
} from '../ui';
import { Sk } from '../skeletons';
import { SectionHead } from './RecordHead';

/** The standard's movement words, keyed by the server's ledger `entry`
 *  (ticketing.ENTRY_LABEL's keys). An entry not listed shows no word. */
const MOVEMENT_WORD: Record<string, string> = {
  top_up: 'Added', hold: 'Held', release: 'Released', fee: 'Released', return: 'Refunded',
};

/** useWallet asks the resolver for 60 ledger rows and the resolver honours that
 *  exactly, with no offset and no cursor to ask for the rest. So a full page is
 *  the one case where movements exist that are not on screen; anything short of
 *  it is the whole ledger and can honestly be counted as such. */
const LEDGER_PAGE = 60;
const NO_ROWS: WalletView['rows'] = [];
const NOUN = ['transaction', 'transactions'] as const;
const STRIP_KEYS = ['Available', 'Held for orders', 'Released', 'Added'];
const LEDGER_COLS = [{ head: 'Date', w: '5.5rem' }, { head: 'What', w: '70%' }, { head: 'Status', w: '5rem' },
  { head: 'Amount', right: true, w: '5rem' }];
// Module scope: useRowSelection memoises on it.
const rowId = (r: WalletView['rows'][number]) => r.id;

/** The Status column's word, as the row draws it. */
function statusText(r: WalletView['rows'][number]): string {
  return r.simulated ? 'Not charged' : r.status === 'failed' ? 'Failed' : MOVEMENT_WORD[r.entry] ?? '';
}

/** The ledger's four columns as a CSV file; the What cell joins its sub-line. */
function exportCsv(rows: WalletView['rows']) {
  downloadCsv('wallet-transactions.csv', [
    ['Date', 'What', 'Status', 'Amount'],
    ...rows.map((r) => [ddmmyyyy(r.at), [r.label, r.note, r.payee, r.ticketRef].filter(Boolean).join(' · '),
      statusText(r), r.amount]),
  ]);
}

/** What came into and went out of the wallet itself, over the loaded rows. A
 *  release or fee moves money already held (held → payout), so it was counted
 *  out when it was set aside; a failed row moved nothing, as the API's own
 *  figures say (web360.py sums `status <> 'failed'`). */
function walletFlow(rows: WalletView['rows']) {
  let inn = 0, out = 0;
  for (const r of rows) {
    if (r.status === 'failed') continue;
    if (r.toBucket === 'wallet') inn += r.amount;
    if (r.fromBucket === 'wallet') out += r.amount;
  }
  return { inn, out };
}

export function Wallet() {
  const { data, isLoading, error } = useWallet();
  const rowCount = data?.rows.length ?? 0;
  const capped = rowCount >= LEDGER_PAGE;
  // Newest first as the ledger gave them: no sort, a pager only.
  const paged = usePaged(data?.rows ?? NO_ROWS, { storeKey: 'pattadar.table.wallet' });
  // No filter narrows the ledger, so there is no resetKey.
  const sel = useRowSelection(data?.rows ?? NO_ROWS, rowId);
  const ticked = sel.picked.length;
  // The footer sums the ticked rows while any are ticked, else every row.
  const flow = walletFlow(ticked ? sel.picked : data?.rows ?? NO_ROWS);
  // What the owner can spend and what is spoken for. "₹0 available" stays: a
  // zero balance is the fact. A wallet nothing has ever moved through gets none.
  // jobs omits a hold whose order was deleted (deleteWorkRequest does not check
  // for money), so the count is dropped rather than read "held for 0 orders".
  const headline = data && (data.putIn || rowCount) ? [
    `${inrFullish(data.available)} available`,
    data.setAside > 0 ? `${inrFullish(data.setAside)} held${data.jobs.length ? ` for ${plural(data.jobs.length, 'order')}` : ''}` : '',
  ].filter(Boolean).join(' · ') : undefined;

  return (
    <main>
      <PageHead title="Wallet"
        summary={isLoading ? <Sk w="18rem" h="1rem" r="var(--radius-xs)" /> : headline} />

      {/* Three states, not two. A wallet that cannot be read is the one screen
          where a skeleton held forever is actively frightening — it reads as
          money that has gone missing rather than as a request that failed. */}
      {/* First read: the page's own shape (design.md § Loading) — the strip with
          its four real labels, the held list, the ledger with its real headings
          and total rows — so nothing moves when the figures land. */}
      {isLoading ? (
          <div role="status" aria-busy="true" aria-label="Loading your wallet">
            <div aria-hidden>
              <div className="strip">
                {STRIP_KEYS.map((k) => <Cell key={k} k={k} v={<Sk w="6rem" />} note={<Sk w="7rem" />} />)}
              </div>
              <section className="sec">
                <SectionHead title="Money held for orders" />
                <div className="rows boxed">
                  {[0, 1].map((i) => (
                    <div key={i}>
                      <span className="grow">
                        <Sk w={`${10 + i * 3}rem`} h="0.9375rem" />
                        <Sk w={`${14 - i * 2}rem`} h="0.8125rem" style={{ display: 'block', marginTop: '0.3125rem' }} />
                      </span>
                      <Sk w="4.5rem" style={{ flex: 'none' }} />
                    </div>
                  ))}
                </div>
              </section>
              {/* SkTable's markup without its own status: one live region per
                  screen. shortcut: inline copy, until skeletons.tsx exports a
                  region-less SkTable body. */}
              <section className="sec">
                <SectionHead title="Transactions" />
                <Card flush className="scroll-x edgefade">
                  <table className="rectable" style={{ minWidth: '40rem' }}>
                    <thead>
                      <tr>
                        <th className="selcol" />
                        {LEDGER_COLS.map((c) => <th key={c.head} className={c.right ? 'right' : undefined}>{c.head}</th>)}
                      </tr>
                    </thead>
                    <tbody>
                      {Array.from({ length: 6 }, (_, i) => (
                        <tr key={i}>
                          <td className="selcol">
                            <Sk w="0.9375rem" h="0.9375rem" r="var(--radius-xs)" style={{ margin: '0 auto' }} />
                          </td>
                          {LEDGER_COLS.map((c) => (
                            <td key={c.head} className={c.right ? 'right' : undefined}>
                              <Sk w={c.w} style={c.right ? { marginLeft: 'auto' } : undefined} />
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr><th scope="row" colSpan={4}>Money in</th><td className="right num"><Sk w="5rem" style={{ marginLeft: 'auto' }} /></td></tr>
                      <tr><th scope="row" colSpan={4}>Money out</th><td className="right num"><Sk w="5rem" style={{ marginLeft: 'auto' }} /></td></tr>
                      <tr><th scope="row" colSpan={4}>Net</th><td className="right num"><Sk w="5rem" style={{ marginLeft: 'auto' }} /></td></tr>
                    </tfoot>
                  </table>
                </Card>
              </section>
            </div>
          </div>
      )
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
            <Cell k="Held for orders" v={inrFullish(data.setAside)}
                  note={plural(data.jobs.length, 'order', 'orders')} />
            <Cell k="Released" v={inrFullish(data.paidOut)} note="to providers and Pattadar" />
            <Cell k="Added" v={inrFullish(data.putIn)}
                  note={data.autoTopUp ? 'Auto top-up on' : 'Auto top-up off'} />
          </div>

          {/* Each list under the strip opens with the shared section head
              (design.md § Page head, one level down). The held list carries no
              sub: its order count is already the strip cell's note and the
              page summary, and a sub never repeats a fact. */}
          <section className="sec" aria-labelledby="wallet-held-h">
            <SectionHead id="wallet-held-h" title="Money held for orders" />
            {data.jobs.length === 0 ? (
              <p className="note">
                No money is held for any order.
              </p>
            ) : (
              <div className="rows boxed">
                {data.jobs.map((j) => (
                  <div key={j.ticketId}>
                    <span className="grow">
                      <Link to={`/services/${j.ticketId}`}
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
          </section>

          {/* The count under the title reads as a total on every other screen
              in this module, and a full page is the size of the page the API
              returned, not the ledger: an account with 300 entries would
              say "60" and end at the sixtieth. While the whole ledger fits in
              one page the count is the total; once it does not, the line
              claims only what is actually showing. */}
          <section className="sec" aria-labelledby="wallet-ledger-h">
            <SectionHead id="wallet-ledger-h" title="Transactions"
                         sub={rowCount === 0 ? undefined
                           : capped ? `Latest ${plural(LEDGER_PAGE, 'transaction')}`
                           : plural(rowCount, 'transaction')} />
            {data.rows.length === 0 ? (
              <p className="note">
                No transactions yet.
              </p>
            ) : (<>
              <Card flush className="scroll-x edgefade">
                <table className="rectable" aria-label="Transactions" style={{ minWidth: '40rem' }}>
                  <thead>
                    <tr>
                      <th className="selcol">
                        <SelectAllBox total={rowCount} picked={ticked} noun={NOUN} onToggle={sel.toggleAll} />
                      </th>
                      <th>Date</th>
                      <th>What</th>
                      <th>Status</th>
                      <th className="right">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paged.shown.map((r) => (
                      <tr key={r.id} className={sel.selected.has(r.id) ? 'selected' : undefined}>
                        <SelectCell checked={sel.selected.has(r.id)} label={`Select ${r.label}, ${ddmmyyyy(r.at)}`}
                                    onToggle={() => sel.toggle(r.id)} />
                        <td className="num">{ddmmyyyy(r.at)}</td>
                        <td>
                          <strong>{r.label}</strong>
                          <span className="note" style={{ display: 'block', marginTop: '0.125rem' }}>
                            {r.note}
                            {r.payee && ` · ${r.payee}`}
                            {r.ticketRef && ` · ${r.ticketRef}`}
                          </span>
                        </td>
                        <td>
                          {/* Deliberately colourless while the provider is a stub:
                              a green tick beside a figure nobody collected would
                              vouch for a movement that never left the building. */}
                          {r.simulated ? (
                            <span className="pill sim">Not charged</span>
                          ) : r.status === 'failed' ? (
                            <State state="bad">Failed</State>
                          ) : MOVEMENT_WORD[r.entry] ? (
                            /* The word comes from what kind of movement the row
                               is, never from "it did not fail": a top-up or a
                               hold that read "Released" would tell the owner the
                               money had gone to a provider. Only a settled row
                               earns the green; a merely recorded one stays grey. */
                            <State state={r.status === 'settled' ? 'good' : 'unknown'}>
                              {MOVEMENT_WORD[r.entry]}
                            </State>
                          ) : null}
                        </td>
                        <td className="right num">{inrFull(r.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <th scope="row" colSpan={4}>Money in</th>
                      <td className="right num">{inrFull(flow.inn)}</td>
                    </tr>
                    <tr>
                      <th scope="row" colSpan={4}>Money out</th>
                      <td className="right num">{inrFull(flow.out)}</td>
                    </tr>
                    <tr>
                      <th scope="row" colSpan={4}>Net · {ticked ? `${plural(ticked, ...NOUN)} selected`
                        : plural(rowCount, ...NOUN)}</th>
                      <td className="right num">
                        {flow.inn < flow.out ? '−' : ''}{inrFull(Math.abs(flow.inn - flow.out))}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </Card>
              <TablePager {...paged} onSize={paged.setSize} label="Transaction pages" />
              <SelectionBar count={ticked} noun={NOUN} label="Act on the selected transactions" onClear={sel.clear}>
                <button type="button" className="btn sm" onClick={() => exportCsv(sel.picked)}>
                  <FileDownloadOutlined sx={{ fontSize: 15 }} /> Export
                </button>
              </SelectionBar>
            </>)}
          </section>
        </>
      )}
    </main>
  );
}
