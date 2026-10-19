/** The holding's three gathered tabs: Papers, Expenses and Services.
 *
 *  All three are lenses over the members, and all three carry the same discipline:
 *  every row says which record it came from. A paper is issued for a survey
 *  number, a service is ordered against a survey number, and a cost is either
 *  about the whole holding or about one survey — folding those together without
 *  saying which would make "what has THIS survey cost me" unanswerable forever.
 *
 *  Expenses is the one tab here that writes, and the only thing it writes is a
 *  cost at the HOLDING's scope. A cost that belongs to one record is still
 *  recorded on that record, where its own ledger, its features and its receipts
 *  are — this screen links there rather than growing a second way to do it.
 */
import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import AddOutlined from '@mui/icons-material/AddOutlined';
import FileDownloadOutlined from '@mui/icons-material/FileDownloadOutlined';

import {
  useHoldingExpenses, useHoldingOrders, useHoldingPapers, useDeleteHoldingExpense,
} from '../api';
import type { HoldingExpenseRow } from '../api';
import {
  Card, Cell, Empty, FacetFilter, Failed, Icon, Pill, SHELF_WORD, Segmented, SelectAllBox, SelectCell,
  SelectionBar, Tag, TablePager, ToolbarBand, YearSelect, ddmmyyyy, downloadCsv, inr, inrOr, num,
  plural, usePaged, useRowSelection,
} from '../ui';
import { useHoldingCtx } from './Holding';
import { displayDetail } from '../paperFiling';
import { HoldingExpenseDialog } from './HoldingActions';
import { SectionHead } from './RecordHead';
import { Sk, SkRows, SkTable } from '../skeletons';

/** A re-read with new arguments keeps the last answer on screen, dimmed and
 *  inert, until the new one lands (design.md § Loading). */
const dimmed = (on: boolean) => ({
  opacity: on ? 0.6 : 1, pointerEvents: on ? 'none' as const : undefined,
  transition: 'opacity var(--dur-fast) var(--ease-out)',
});

// ── Papers ────────────────────────────────────────────────────────────

export function HoldingPapersTab() {
  const holding = useHoldingCtx();
  const { data, isLoading, error } = useHoldingPapers(holding.id);
  const [shelf, setShelf] = useState('all');

  const shelves = useMemo(() => {
    const seen = new Map<string, number>();
    for (const p of data ?? []) seen.set(p.shelf, (seen.get(p.shelf) ?? 0) + 1);
    return [...seen.entries()];
  }, [data]);

  const shown = (data ?? []).filter((p) => shelf === 'all' || p.shelf === shelf);
  const paged = usePaged(shown, { resetKey: shelf, storeKey: 'pattadar.table.holding-papers' });

  return (
    <>
      {/* The count waits for the read: no sub while loading, on a failure or on
          an empty tab (design.md § Page head). */}
      <SectionHead title="Documents"
                   sub={data && data.length > 0 ? plural(data.length, 'document') : undefined} />

      {isLoading && <SkRows rows={4} label="Loading the documents" />}
      {!isLoading && !data && <Failed what="These documents" error={error} boxed h="18rem" />}

      {data && data.length === 0 && (
        <Empty boxed h="18rem" icon="title" title="No documents yet">
          No document is linked to this holding or its properties.
        </Empty>
      )}

      {data && data.length > 0 && (
        <>
          {shelves.length > 1 && (
            <FacetFilter
              groups={[{ key: 'shelf', label: 'Shelf',
                options: shelves.map(([key, n]) => ({ key, label: SHELF_WORD[key] ?? key, count: n })) }]}
              selected={{ shelf: shelf === 'all' ? [] : [shelf] }}
              onToggle={(_, key) => setShelf(shelf === key ? 'all' : key)}
              onClear={() => setShelf('all')}
              tally={`${num(shown.length)} of ${num(data.length)}`}
            />
          )}
          <div className="rows boxed card" style={{ padding: 0 }}>
            {paged.shown.map((p) => (
              <div className="row" key={p.id}>
                <span style={{ display: 'flex', color: 'var(--w-info)' }}>
                  <Icon name={p.icon || 'unsorted'} size={18} />
                </span>
                <span className="grow">
                  <Link to={`/papers/${p.id}`} className="accent"
                        style={{ textDecoration: 'none', fontWeight: 700 }}>
                    {p.title}
                  </Link>
                  <small className="note" style={{ display: 'block' }}>
                    {[displayDetail(p.detail), SHELF_WORD[p.shelf] ?? p.shelf,
                      p.pageCount > 0 && plural(p.pageCount, 'page')]
                      .filter(Boolean).join(' · ')}
                  </small>
                </span>
                {p.tags.map((t) => <Tag key={t}>{t}</Tag>)}
                {p.shared && <Pill kind="for_sale">Shared</Pill>}
                <Link className="chip"
                      to={p.recordId === holding.id
                        ? `/holdings/${holding.id}` : `/properties/${p.recordId}`}>
                  {p.recordTitle}
                </Link>
              </div>
            ))}
          </div>
          <TablePager {...paged} onSize={paged.setSize} label="Document pages" />
        </>
      )}
    </>
  );
}

// ── Expenses ──────────────────────────────────────────────────────────

/** An expense's kind, in the owner's words: does it improve the land, keep it
 *  going, or bring money in. Stored codes stay capital / running / income. */
const KIND_WORD: Record<string, string> = {
  capital: 'Improvement',
  running: 'Upkeep',
  income: 'Money in',
};

const idOfExpense = (r: HoldingExpenseRow) => r.id;

const SCOPE_WORD: Record<string, string> = {
  combined: 'Shared expense',
  record: 'One property',
};

export function HoldingExpensesTab() {
  const holding = useHoldingCtx();
  const [params, setParams] = useSearchParams();
  const year = params.get('year') ?? undefined;
  const scope = params.get('scope') ?? 'all';
  const category = params.get('cat') ?? 'all';
  const [adding, setAdding] = useState(false);
  const [err, setErr] = useState('');
  const { data, isPlaceholderData: stale, error } = useHoldingExpenses(holding.id, year);
  const del = useDeleteHoldingExpense(false);

  const set = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value && value !== 'all') next.set(key, value); else next.delete(key);
    setParams(next, { replace: true });
  };

  const rows = (data?.rows ?? []).filter((r) =>
    (scope === 'all' || r.scope === scope)
    && (category === 'all' || r.category === category));
  const narrow = `${year ?? ''}|${scope}|${category}`;
  const paged = usePaged(rows, { resetKey: narrow, storeKey: 'pattadar.table.holding-expenses' });
  const sel = useRowSelection(rows, idOfExpense, narrow);
  const ticked = sel.picked.length > 0;
  // The footer sums the ticked rows, else every row the chips let through (not
  // just this page), and keeps money in apart from money spent — one figure
  // netting them would lie.
  const footRows = ticked ? sel.picked : rows;
  const spentRows = footRows.filter((r) => r.kind !== 'income');
  const inRows = footRows.filter((r) => r.kind === 'income');
  const sum = (list: HoldingExpenseRow[]) => list.reduce((t, r) => t + r.amount, 0);
  /** One noun in the footer, the tick-all box and the bar: "expenses", or
   *  "entries" once money in is among them (design.md § Tables). */
  const nounFor = (list: HoldingExpenseRow[]) => (list.some((r) => r.kind === 'income')
    ? ['entry', 'entries'] as const : ['expense', 'expenses'] as const);

  const remove = async (row: HoldingExpenseRow) => {
    setErr('');
    try {
      const ok = (await del.mutateAsync({ expenseId: row.id })).web.deleteCombinedExpense;
      if (!ok) setErr('That expense could not be deleted. Reload the page and try again.');
    } catch {
      setErr('That did not go through. Nothing was deleted.');
    }
  };

  /** The visible ledger as a file — the thing an owner hands an accountant. The
   *  scope column goes out with it, because a total that mixes the two without
   *  saying so is the defect this whole tab is shaped around. */
  const exportCsv = (list: HoldingExpenseRow[]) => downloadCsv(
    `${holding.name.replace(/\s+/g, '-').toLowerCase()}-expenses-${data?.year ?? ''}.csv`,
    [['Date', 'What', 'Scope', 'Property', 'Kind', 'Category', 'Paid by', 'Amount (₹)'],
      ...list.map((r) => [r.spentOn, r.title, SCOPE_WORD[r.scope] ?? r.scope,
        r.recordTitle, KIND_WORD[r.kind] ?? r.kind, r.category, r.paidBy, Math.round(r.amount)])]);

  if (!data) {
    return error
      ? <Failed what="This ledger" error={error} boxed h="22rem" />
      : (
        <>
          <SectionHead title="Expenses" />
          <div role="status" aria-busy="true" aria-label="Loading this year's totals">
            <div className="strip" aria-hidden>
              {['Spent', 'Shared expenses', 'On its properties', 'Upkeep per acre'].map((k) => (
                <Cell key={k} k={k} v={<Sk w="6rem" h="1.25rem" />} note={<Sk w="8rem" />} />
              ))}
            </div>
            <div className="filterbar band" aria-hidden style={{ margin: 'var(--space-lg) 0' }}>
              {['5rem', '4.5rem'].map((w) => <Sk key={w} w={w} h="1.75rem" r="var(--radius-pill)" />)}
            </div>
          </div>
          <SkTable label="Loading the expenses" minWidth="46rem"
                   cols={[{ head: 'When', w: '5rem' }, { head: 'What' }, { head: 'Against' },
                     { head: 'Kind' }, { head: 'Amount', right: true, w: '5rem' }, { head: '', w: '3.5rem' }]} />
        </>
      );
  }

  const facets = [
    { key: 'scope', label: 'Scope', options: data.scopes.filter((o) => o.key !== 'all') },
    { key: 'cat', label: 'Category', options: data.categories.filter((o) => o.key !== 'all') },
  ].filter((g) => g.options.length > 1);
  const yearPick = data.years.length > 1
    ? <YearSelect years={data.years} value={year ?? data.year} onChange={(y) => set('year', y)} />
    : undefined;
  // The sub counts the whole year, not what the chips let through (the footer does that).
  const inAll = data.rows.filter((r) => r.kind === 'income').length;
  const spentAll = data.rows.length - inAll;

  return (
    <>
      <SectionHead title="Expenses"
                   sub={[spentAll > 0 && plural(spentAll, 'expense'),
                     inAll > 0 && plural(inAll, 'money-in entry', 'money-in entries')]
                     .filter(Boolean).join(' · ') || undefined}
                   info="A shared expense belongs to the whole holding. An expense for one property is recorded on that property's own Expenses tab, and shows here too."
                   actions={{
                     // Export lives in the More menu (Reddy, 13/10/2026).
                     overflowHeader: holding.name,
                     overflow: [{
                       label: 'Export', icon: <FileDownloadOutlined sx={{ fontSize: 17 }} />,
                       onClick: () => exportCsv(rows), disabled: stale || rows.length === 0,
                     }],
                     primary: {
                       label: 'Add a shared expense', icon: <AddOutlined sx={{ fontSize: 17 }} />,
                       onClick: () => setAdding(true),
                     },
                   }} />

      <div className="strip" aria-busy={stale || undefined} style={dimmed(stale)}>
        <Cell k={`Spent in ${data.year}`} v={inrOr(data.spent)}
              note={`${inrOr(data.capital)} improvement · ${inrOr(data.running)} upkeep`} />
        <Cell k="Shared expenses" v={inrOr(data.combinedSpend)} />
        <Cell k="On its properties" v={inrOr(data.memberSpend)} />
        <Cell k="Upkeep per acre"
              v={data.farmExtent > 0 ? inrOr(data.perAcreRunning) : '—'}
              note={data.farmExtent > 0
                ? `over ${num(data.farmExtent, 2)} ac of land`
                : 'no agricultural land in this holding'} />
      </div>

      {/* The band: the year, then Scope and Category as labelled filter
          groups, so no two controls both read "All" (design.md § Page head,
          slot 5). A group with one option is not a choice and is left out. */}
      {facets.length === 0 ? (
        yearPick && <ToolbarBand left={yearPick} busy={stale} />
      ) : (
      <FacetFilter
        lead={yearPick}
        busy={stale}
        groups={facets}
        selected={{ scope: scope === 'all' ? [] : [scope], cat: category === 'all' ? [] : [category] }}
        onToggle={(key, value) => set(key, (key === 'scope' ? scope : category) === value ? 'all' : value)}
        onClear={() => {
          const next = new URLSearchParams(params);
          next.delete('scope'); next.delete('cat');
          setParams(next, { replace: true });
        }}
        tally={`${num(rows.length)} of ${num(data.rows.length)}`}
      />
      )}

      {err && (
        <p className="note" role="alert" style={{ color: 'var(--w-danger)' }}>{err}</p>
      )}

      <div aria-busy={stale || undefined} style={dimmed(stale)}>
      {rows.length === 0 && (
        <Empty boxed h="16rem" icon="unsorted" title="No expenses yet"
               action={
                 <button type="button" className="btn primary" onClick={() => setAdding(true)}>
                   <AddOutlined sx={{ fontSize: 17 }} /> Add a shared expense
                 </button>
               }>
          Expenses shared by these properties go here.
        </Empty>
      )}

      {rows.length > 0 && (<>
        <Card flush className="scroll-x edgefade">
          <table className="rectable" aria-label="Expenses" style={{ minWidth: '46rem' }}>
            <thead>
              <tr>
                <th className="selcol">
                  <SelectAllBox total={rows.length} picked={sel.picked.length}
                                noun={nounFor(rows)} onToggle={sel.toggleAll} />
                </th>
                <th>When</th>
                <th>What</th>
                <th>Against</th>
                <th>Kind</th>
                <th className="right">Amount</th>
                <th className="menucol" aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {paged.shown.map((r) => (
                <tr key={r.id} className={sel.selected.has(r.id) ? 'selected' : undefined}>
                  <SelectCell checked={sel.selected.has(r.id)} label={`Select ${r.title}`}
                              onToggle={() => sel.toggle(r.id)} />
                  <td className="muted num">{ddmmyyyy(r.spentOn)}</td>
                  <td>
                    <strong>{r.title}</strong>
                    {r.paidBy && <small className="note" style={{ display: 'block' }}>Paid by {r.paidBy}</small>}
                  </td>
                  <td>
                    {r.scope === 'combined'
                      ? <Pill kind="owned">Shared expense</Pill>
                      : (
                        <Link className="chip" to={`/properties/${r.recordId}/expenses`}>
                          {r.recordTitle || 'One property'}
                        </Link>
                      )}
                  </td>
                  <td className="muted">{KIND_WORD[r.kind] ?? KIND_WORD.running}</td>
                  <td className="right num">{inr(r.amount)}</td>
                  <td className="menucol">
                    {/* Only the holding's own rows can be deleted here. A
                        property's expense is deleted on that property's
                        ledger, which is the screen that owns it. */}
                    {r.scope === 'combined' ? (
                      <button type="button" className="btn sm danger" disabled={del.isPending || stale}
                              onClick={() => void remove(r)}>
                        Delete
                      </button>
                    ) : (
                      <Link className="btn sm" to={`/properties/${r.recordId}/expenses`}>
                        On its property
                      </Link>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              {/* Ticking only money-in rows must not read "0 expenses selected". */}
              {(!ticked || spentRows.length > 0) && (
                <tr>
                  <td className="selcol" />
                  <th scope="row" colSpan={4}>
                    {ticked ? `Spent · ${plural(spentRows.length, 'expense')} selected`
                      : `Total spent · ${plural(spentRows.length, 'expense')}`}
                  </th>
                  <td className="right num">{inrOr(sum(spentRows))}</td>
                  <td />
                </tr>
              )}
              {inRows.length > 0 && (
                <tr>
                  <td className="selcol" />
                  <th scope="row" colSpan={4}>
                    Money in · {plural(inRows.length, 'entry', 'entries')}{ticked && ' selected'}
                  </th>
                  <td className="right num">{inrOr(sum(inRows))}</td>
                  <td />
                </tr>
              )}
            </tfoot>
          </table>
        </Card>
        <TablePager {...paged} onSize={paged.setSize} label="Expense pages" />
        <SelectionBar count={sel.picked.length} noun={nounFor(sel.picked)}
                      label="Act on the selected expenses" onClear={sel.clear}>
          <button type="button" className="btn sm" onClick={() => exportCsv(sel.picked)}>
            <FileDownloadOutlined sx={{ fontSize: 15 }} /> Export
          </button>
        </SelectionBar>
      </>)}
      </div>

      {adding && (
        <HoldingExpenseDialog holding={holding} onClose={() => setAdding(false)} />
      )}
    </>
  );
}

// ── Services ──────────────────────────────────────────────────────────

export function HoldingServicesTab() {
  const holding = useHoldingCtx();
  const [closed, setClosed] = useState(false);
  const { data, isLoading, isPlaceholderData: stale, error } = useHoldingOrders(holding.id, closed);
  const paged = usePaged(data ?? [], { resetKey: String(closed), storeKey: 'pattadar.table.holding-services' });
  const needsYou = (data ?? []).filter((o) => o.needsYou).length;

  return (
    <>
      <SectionHead title="Service orders"
                   sub={data && data.length > 0
                     ? [plural(data.length, closed ? 'order' : 'open order'),
                       needsYou > 0 && `${num(needsYou)} need${needsYou === 1 ? 's' : ''} you`]
                       .filter(Boolean).join(' · ')
                     : undefined} />
      <ToolbarBand left={
        <Segmented label="Which service orders" value={closed ? 'all' : 'open'}
                   onChange={(v) => setClosed(v === 'all')}
                   options={[{ value: 'open', label: 'Open' }, { value: 'all', label: 'All' }]} />
      } />

      {isLoading && <SkRows rows={4} label="Loading the service orders" />}
      {!isLoading && !data && <Failed what="These service orders" error={error} boxed h="18rem" />}

      <div aria-busy={stale || undefined} style={dimmed(stale)}>
      {data && data.length === 0 && (
        <Empty boxed h="18rem" icon="unsorted" title={closed ? 'Nothing ordered yet' : 'Nothing open'}>
          {closed
            ? 'No service has been ordered for any property in this holding.'
            : 'Nothing is in progress.'}
        </Empty>
      )}

      {data && data.length > 0 && (<>
        <div className="rows boxed card" style={{ padding: 0 }}>
          {paged.shown.map((o) => (
            <div className="row" key={o.id}>
              <span className="grow">
                <Link to={`/services/${o.id}`} className="accent"
                      style={{ textDecoration: 'none', fontWeight: 700 }}>
                  {o.title}
                </Link>
                <small className="note" style={{ display: 'block' }}>
                  {[o.ref, o.stageLabel, o.dueDate && `due ${ddmmyyyy(o.dueDate)}`]
                    .filter(Boolean).join(' · ')}
                </small>
              </span>
              {o.needsYou && <Pill kind="for_sale">Needs you</Pill>}
              <Pill kind={o.statusState || 'owned'}>{o.statusLabel}</Pill>
              {/* An order's property: onto its Services tab, as the expense
                  chip above lands on Expenses. */}
              <Link className="chip" to={`/properties/${o.recordId}/services`}>{o.recordTitle}</Link>
              <span className="num">{inrOr(o.cost)}</span>
            </div>
          ))}
        </div>
        <TablePager {...paged} onSize={paged.setSize} label="Service order pages" />
      </>)}
      </div>
    </>
  );
}
