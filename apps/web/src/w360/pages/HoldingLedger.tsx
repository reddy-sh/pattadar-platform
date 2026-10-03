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
  Cell, Chip, Empty, Failed, Icon, Loading, Pill, SHELF_WORD, Tag, csvCell, ddmmyyyy,
  inr, inrOr, num, plural,
} from '../ui';
import { useHoldingCtx } from './Holding';
import { HoldingExpenseDialog } from './HoldingActions';

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

  return (
    <>
      <header className="sechead">
        <div className="grow">
          <h2>All documents in this holding</h2>
          {/* The count waits for the read. `data?.length ?? 0` stated "0 papers"
              as a fact beside the spinner, and again beside the failure box —
              the `data ?? []` shape the service-detail spec bans outright,
              because it answers a question nobody has been able to ask yet. The
              three branches below already each say their own sentence, and the
              Expenses tab in this same file guards on `!data` before it draws a
              header at all. */}
          {data && (
            <p className="note" style={{ margin: '0.25rem 0 0' }}>
              {plural(data.length, 'document')} in this holding
            </p>
          )}
        </div>
      </header>

      {isLoading && <Loading h="12rem" what="the documents" />}
      {!isLoading && !data && <Failed what="These documents" error={error} boxed h="18rem" />}

      {data && data.length === 0 && (
        <Empty boxed h="18rem" icon="title" title="No documents yet">
          No document is linked to this holding or its properties.
        </Empty>
      )}

      {data && data.length > 0 && (
        <>
          {shelves.length > 1 && (
            <div className="row tight" style={{ marginBottom: 'var(--space-sm)' }}>
              <Chip active={shelf === 'all'} onClick={() => setShelf('all')} count={data.length}>
                All
              </Chip>
              {shelves.map(([key, n]) => (
                <Chip key={key} active={shelf === key} onClick={() => setShelf(key)} count={n}>
                  {SHELF_WORD[key] ?? key}
                </Chip>
              ))}
            </div>
          )}
          <div className="rows boxed card" style={{ padding: 0 }}>
            {shown.map((p) => (
              <div className="row" key={p.id}>
                <span style={{ display: 'flex', color: 'var(--w-info)' }}>
                  <Icon name={p.icon || 'unsorted'} size={18} />
                </span>
                <span className="grow">
                  <Link to={`/app/papers/${p.id}`} className="accent"
                        style={{ textDecoration: 'none', fontWeight: 700 }}>
                    {p.title}
                  </Link>
                  <small className="note" style={{ display: 'block' }}>
                    {[p.detail, SHELF_WORD[p.shelf] ?? p.shelf,
                      p.pageCount > 0 && plural(p.pageCount, 'page')]
                      .filter(Boolean).join(' · ')}
                  </small>
                </span>
                {p.tags.map((t) => <Tag key={t}>{t}</Tag>)}
                {p.shared && <Pill kind="for_sale">Shared</Pill>}
                <Link className="chip"
                      to={p.recordId === holding.id
                        ? `/app/holdings/${holding.id}` : `/app/records/${p.recordId}`}>
                  {p.recordTitle}
                </Link>
              </div>
            ))}
          </div>
        </>
      )}
    </>
  );
}

// ── Expenses ──────────────────────────────────────────────────────────

const SCOPE_WORD: Record<string, string> = {
  combined: 'Shared cost',
  record: 'One survey',
};

export function HoldingExpensesTab() {
  const holding = useHoldingCtx();
  const [params, setParams] = useSearchParams();
  const year = params.get('year') ?? undefined;
  const scope = params.get('scope') ?? 'all';
  const category = params.get('cat') ?? 'all';
  const [adding, setAdding] = useState(false);
  const [err, setErr] = useState('');
  const { data, isFetching, error } = useHoldingExpenses(holding.id, year);
  const del = useDeleteHoldingExpense(false);

  const set = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value && value !== 'all') next.set(key, value); else next.delete(key);
    setParams(next, { replace: true });
  };

  const rows = (data?.rows ?? []).filter((r) =>
    (scope === 'all' || r.scope === scope)
    && (category === 'all' || r.category === category));

  const remove = async (row: HoldingExpenseRow) => {
    setErr('');
    try {
      const ok = (await del.mutateAsync({ expenseId: row.id })).web.deleteCombinedExpense;
      if (!ok) setErr('That cost could not be removed. Reload the page and try again.');
    } catch {
      setErr('That did not go through. Nothing was removed.');
    }
  };

  /** The visible ledger as a file — the thing an owner hands an accountant. The
   *  scope column goes out with it, because a total that mixes the two without
   *  saying so is the defect this whole tab is shaped around. */
  const exportCsv = () => {
    const head = ['Date', 'What', 'Scope', 'Record', 'Kind', 'Category', 'Paid by', 'Amount (₹)'];
    const lines = rows.map((r) => [r.spentOn, r.title, SCOPE_WORD[r.scope] ?? r.scope,
      r.recordTitle, r.kind, r.category, r.paidBy, Math.round(r.amount)]
      .map(csvCell).join(','));
    const blob = new Blob(['\ufeff' + [head.join(','), ...lines].join('\n')],
      { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${holding.name.replace(/\s+/g, '-').toLowerCase()}-costs-${data?.year ?? ''}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  if (!data) {
    return error
      ? <Failed what="This ledger" error={error} boxed h="22rem" />
      : <Loading h="16rem" what="the ledger" />;
  }

  return (
    <>
      <header className="sechead">
        <div className="grow">
          <h2>Costs for this holding</h2>
        </div>
        <div className="actions">
          <button type="button" className="btn" onClick={exportCsv} disabled={rows.length === 0}>
            <FileDownloadOutlined sx={{ fontSize: 16 }} /> Export
          </button>
          <button type="button" className="btn primary" onClick={() => setAdding(true)}>
            <AddOutlined sx={{ fontSize: 17 }} /> Record a cost
          </button>
        </div>
      </header>

      <div className="strip" aria-busy={isFetching || undefined}>
        <Cell k={`Spent in ${data.year}`} v={inrOr(data.spent)}
              note={`${inrOr(data.capital)} one-off · ${inrOr(data.running)} running`} />
        <Cell k="Shared costs" v={inrOr(data.combinedSpend)} />
        <Cell k="On its surveys" v={inrOr(data.memberSpend)} />
        <Cell k="Running, per acre"
              v={data.farmExtent > 0 ? inrOr(data.perAcreRunning) : '—'}
              note={data.farmExtent > 0
                ? `over ${num(data.farmExtent, 2)} ac of land`
                : 'no agricultural land in this holding'} />
      </div>

      <div className="row tight" style={{ marginBottom: 'var(--space-sm)' }}>
        {data.years.length > 1 && data.years.map((y) => (
          <Chip key={y} active={(year ?? data.year) === y} onClick={() => set('year', y)}>{y}</Chip>
        ))}
        {data.years.length > 1 && <span className="vrule" aria-hidden />}
        {data.scopes.map((s) => (
          <Chip key={s.key} active={scope === s.key} count={s.count}
                onClick={() => set('scope', s.key)}>
            {s.label}
          </Chip>
        ))}
        {data.categories.length > 2 && <span className="vrule" aria-hidden />}
        {data.categories.length > 2 && data.categories.map((c) => (
          <Chip key={c.key} active={category === c.key} count={c.count}
                onClick={() => set('cat', c.key)}>
            {c.label}
          </Chip>
        ))}
      </div>

      {err && (
        <p className="note" role="alert" style={{ color: 'var(--w-danger)' }}>{err}</p>
      )}

      {rows.length === 0 && (
        <Empty boxed h="16rem" icon="unsorted" title="Nothing recorded yet"
               action={
                 <button type="button" className="btn primary" onClick={() => setAdding(true)}>
                   <AddOutlined sx={{ fontSize: 17 }} /> Record a cost
                 </button>
               }>
          Costs shared by these records go here.
        </Empty>
      )}

      {rows.length > 0 && (
        <div className="card scroll-x" style={{ padding: 0 }}>
          <table className="rectable" style={{ minWidth: '46rem' }}>
            <thead>
              <tr>
                <th>When</th>
                <th>What</th>
                <th>Against</th>
                <th>Kind</th>
                <th className="right">Amount</th>
                <th className="menucol" aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="muted num">{ddmmyyyy(r.spentOn)}</td>
                  <td>
                    <strong>{r.title}</strong>
                    {r.paidBy && <small className="note" style={{ display: 'block' }}>Paid by {r.paidBy}</small>}
                  </td>
                  <td>
                    {r.scope === 'combined'
                      ? <Pill kind="owned">Shared cost</Pill>
                      : (
                        <Link className="chip" to={`/app/records/${r.recordId}/expenses`}>
                          {r.recordTitle || 'One survey'}
                        </Link>
                      )}
                  </td>
                  <td className="muted">{r.kind === 'income' ? 'Money in' : r.kind === 'capital' ? 'One-off' : 'Running'}</td>
                  <td className="right num">{inr(r.amount)}</td>
                  <td className="menucol">
                    {/* Only the holding's own rows can be removed here. A
                        survey's cost is removed on that survey's ledger, which
                        is the screen that owns it. */}
                    {r.scope === 'combined' ? (
                      <button type="button" className="btn sm danger" disabled={del.isPending}
                              onClick={() => void remove(r)}>
                        Remove
                      </button>
                    ) : (
                      <Link className="btn sm" to={`/app/records/${r.recordId}/expenses`}>
                        On its record
                      </Link>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

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
  const { data, isLoading, error } = useHoldingOrders(holding.id, closed);

  return (
    <>
      <header className="sechead">
        <div className="grow">
          <h2>Services on these records</h2>
        </div>
        <div className="actions">
          <div className="segmented" role="group" aria-label="Which services">
            <button type="button" aria-pressed={!closed} onClick={() => setClosed(false)}>Open</button>
            <button type="button" aria-pressed={closed} onClick={() => setClosed(true)}>Everything</button>
          </div>
        </div>
      </header>

      {isLoading && <Loading h="12rem" what="the services" />}
      {!isLoading && !data && <Failed what="These services" error={error} boxed h="18rem" />}

      {data && data.length === 0 && (
        <Empty boxed h="18rem" icon="unsorted" title={closed ? 'Nothing ordered yet' : 'Nothing open'}>
          {closed
            ? 'No service has been ordered against any record in this holding.'
            : 'Nothing is in progress.'}
        </Empty>
      )}

      {data && data.length > 0 && (
        <div className="rows boxed card" style={{ padding: 0 }}>
          {data.map((o) => (
            <div className="row" key={o.id}>
              <span className="grow">
                <Link to={`/app/services/${o.id}`} className="accent"
                      style={{ textDecoration: 'none', fontWeight: 700 }}>
                  {o.title}
                </Link>
                <small className="note" style={{ display: 'block' }}>
                  {[o.ref, o.stageLabel, o.dueDate && `due ${o.dueDate}`]
                    .filter(Boolean).join(' · ')}
                </small>
              </span>
              {o.needsYou && <Pill kind="for_sale">Needs you</Pill>}
              <Pill kind={o.statusState || 'owned'}>{o.statusLabel}</Pill>
              <Link className="chip" to={`/app/records/${o.recordId}`}>{o.recordTitle}</Link>
              <span className="num">{inrOr(o.cost)}</span>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
