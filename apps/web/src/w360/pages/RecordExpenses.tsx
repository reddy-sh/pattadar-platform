/** W11 + W12 — one ledger, two vocabularies.
 *
 *  A parcel talks about bores, kist and labour; a flat talks about society
 *  dues, tax assessments and tenants. Same table, same columns, different
 *  categories — and on a let property, rent sits in the same list as money in,
 *  because a property's cost only means something next to what it earns.
 *
 *  The capital/running switch in the drawer is the screen's whole argument:
 *  capital rows lift the cost base on the Money tab, running rows answer "what
 *  does holding this cost me a year". */
import { useState } from 'react';
import AddOutlined from '@mui/icons-material/AddOutlined';
import FileDownloadOutlined from '@mui/icons-material/FileDownloadOutlined';
import SouthWestOutlined from '@mui/icons-material/SouthWestOutlined';
import ReceiptLongOutlined from '@mui/icons-material/ReceiptLongOutlined';
import PhotoCameraOutlined from '@mui/icons-material/PhotoCameraOutlined';
import DocumentScannerOutlined from '@mui/icons-material/DocumentScannerOutlined';
import CloseOutlined from '@mui/icons-material/CloseOutlined';

import { useExpenses, useSaveExpense } from '../api';
import { Cell, Chip, Icon, Loading, ddmmyyyy, inGroup, inr, num } from '../ui';
import { RecordCrumbs, useRecordCtx } from './Record';

const KINDS = ['Repair', 'Power bill', 'Labour', 'Seed & inputs', 'Tax / kist', 'Caretaker',
  'Legal', 'New work'];

function Drawer({
  recordId, features, onClose,
}: { recordId: string; features: { key: string; label: string }[]; onClose: () => void }) {
  const save = useSaveExpense();
  const [amount, setAmount] = useState('18400');
  const [title, setTitle] = useState('');
  const [date, setDate] = useState('2026-08-12');
  const [paidBy, setPaidBy] = useState('Caretaker');
  const [cat, setCat] = useState('Repair');
  const [on, setOn] = useState(features[0]?.key ?? '');
  const [kind, setKind] = useState<'capital' | 'running'>('capital');
  const [recover, setRecover] = useState(false);
  const [repeat, setRepeat] = useState(false);

  return (
    <>
      <button type="button" className="scrim" aria-label="Close" onClick={onClose} />
      <aside className="drawer" aria-label="Add an expense">
        <div className="row between">
          <div>
            <p className="eyebrow" style={{ margin: 0 }}>This record</p>
            <h2>Add an expense</h2>
          </div>
          <button type="button" className="iconbtn" onClick={onClose} aria-label="Close">
            <CloseOutlined sx={{ fontSize: 18 }} />
          </button>
        </div>

        <div className="card dashed row" style={{ gap: 'var(--space-sm)', flexWrap: 'nowrap' }}>
          <span className="accent" style={{ display: 'flex' }}>
            <DocumentScannerOutlined sx={{ fontSize: 22 }} />
          </span>
          <span>
            <strong style={{ fontSize: '0.875rem' }}>Photograph the receipt first</strong>
            <span className="note" style={{ display: 'block' }}>Amount, date and vendor are read off it</span>
          </span>
        </div>
        <p className="note" style={{ textAlign: 'center' }}>or fill it in</p>

        <div className="field">
          <label htmlFor="ex-amt">Amount</label>
          <input id="ex-amt" type="text" value={`₹${inGroup(Number(amount) || 0)}`}
                 onChange={(e) => setAmount(e.target.value.replace(/[^\d]/g, ''))} />
        </div>
        <div className="field">
          <label htmlFor="ex-title">What it was</label>
          <input id="ex-title" type="text" value={title} onChange={(e) => setTitle(e.target.value)}
                 placeholder="Bore flushing and new starter panel" />
        </div>
        <div className="row" style={{ gap: 'var(--space-sm)', flexWrap: 'nowrap' }}>
          <div className="field grow">
            <label htmlFor="ex-date">Date</label>
            <input id="ex-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="field grow">
            <label htmlFor="ex-by">Paid by</label>
            <select id="ex-by" value={paidBy} onChange={(e) => setPaidBy(e.target.value)}>
              {['Caretaker', 'You · UPI', 'You · card', 'Wallet · auto', 'Pattadar order', 'Letting agent']
                .map((v) => <option key={v}>{v}</option>)}
            </select>
          </div>
        </div>

        <div className="field">
          <label>Category</label>
          <div className="row tight">
            {KINDS.map((k) => (
              <Chip key={k} active={cat === k} onClick={() => setCat(k)}>{k}</Chip>
            ))}
          </div>
        </div>

        <div className="field">
          <label htmlFor="ex-on">On what</label>
          <select id="ex-on" value={on} onChange={(e) => setOn(e.target.value)}>
            <option value="">The whole parcel</option>
            {features.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
          </select>
          <span className="note">Or the whole parcel, a person, or a bill account.</span>
        </div>

        <div className="field">
          <label>Does it add to what the land cost you?</label>
          <div className="choice">
            <button type="button" aria-pressed={kind === 'capital'} onClick={() => setKind('capital')}>
              Yes — capital
              <small>New work that lasts. Lifts your cost base.</small>
            </button>
            <button type="button" aria-pressed={kind === 'running'} onClick={() => setKind('running')}>
              No — running
              <small>Upkeep and bills. Cost of holding it.</small>
            </button>
          </div>
        </div>

        <div className="switch">
          <span>
            Recover this from the tenant
            <span className="note" style={{ display: 'block' }}>Adds it to what the tenant owes at harvest</span>
          </span>
          <button type="button" aria-pressed={recover} aria-label="Recover from the tenant"
                  onClick={() => setRecover(!recover)} />
        </div>
        <div className="switch">
          <span>
            Repeats every month
            <span className="note" style={{ display: 'block' }}>For salaries, bills and leases</span>
          </span>
          <button type="button" aria-pressed={repeat} aria-label="Repeats every month"
                  onClick={() => setRepeat(!repeat)} />
        </div>

        <div className="row" style={{ gap: 'var(--space-sm)', flexWrap: 'nowrap' }}>
          <button type="button" className="btn grow" style={{ justifyContent: 'center' }} onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="btn primary grow"
            style={{ justifyContent: 'center' }}
            disabled={save.isPending}
            onClick={() =>
              save.mutate({
                recordId, title: title || cat, amount: Number(amount) || 0, spentOn: ddmmyyyy(date),
                kind, category: cat, paidBy, onLabel: features.find((f) => f.key === on)?.label ?? 'Whole parcel',
                featureId: on, recoverable: recover,
              }, { onSuccess: onClose })}
          >
            {save.isPending ? 'Saving…' : 'Save expense'}
          </button>
        </div>
      </aside>
    </>
  );
}

export function RecordExpenses() {
  const rec = useRecordCtx();
  const [year, setYear] = useState<string | undefined>();
  const [cat, setCat] = useState('all');
  const [open, setOpen] = useState(false);
  const { data, isLoading } = useExpenses(rec.id, year);

  if (isLoading || !data) return <main><Loading h="70vh" /></main>;

  const rows = data.rows.filter((r) => cat === 'all' || r.category === cat);
  const perUnit = data.extentUnit === 'ac' ? 'an acre' : `a ${data.extentUnit}`;

  return (
    <main>
      <RecordCrumbs rec={rec} here="Expenses" />
      <p className="eyebrow">
        {data.isBuilt
          ? `${num(rec.extent)} sq.ft · let to a tenant`
          : 'What this land costs'}
      </p>

      <header className="pagehead">
        <div className="grow"><h1>{data.isBuilt ? 'Expenses & rent' : 'Expenses'}</h1></div>
        <div className="actions">
          <select value={data.year} onChange={(e) => setYear(e.target.value)}
                  aria-label="Financial year" style={{ width: 'auto' }}>
            {data.years.map((y) => <option key={y}>{y}</option>)}
          </select>
          {data.isBuilt && (
            <button type="button" className="btn">
              <SouthWestOutlined sx={{ fontSize: 16 }} /> Record rent
            </button>
          )}
          {!data.isBuilt && (
            <button type="button" className="btn">
              <FileDownloadOutlined sx={{ fontSize: 16 }} /> Export
            </button>
          )}
          <button type="button" className="btn primary" onClick={() => setOpen(true)}>
            <AddOutlined sx={{ fontSize: 17 }} /> Add an expense
          </button>
        </div>
      </header>

      <div className="strip">
        {data.isBuilt ? (
          <>
            <Cell k="Rent received" v={inr(data.income)} tone="up" />
            <Cell k="Spent" v={inr(data.spent)} />
            <Cell k="Capital · adds to cost" v={inr(data.capital)} tone="info" />
            <Cell k="Net yield on value" v={`${data.netYield.toFixed(2)}%`} />
          </>
        ) : (
          <>
            <Cell k="Spent this year" v={inr(data.spent)} />
            <Cell k="Capital · adds to cost" v={inr(data.capital)} />
            <Cell k="Running" v={inr(data.running)} />
            <Cell k="Owed back by tenant" v={inr(data.owedBack)} tone="down" />
          </>
        )}
      </div>

      <div className="row between" style={{ margin: 'var(--space-lg) 0 var(--space-md)', gap: 'var(--space-lg)' }}>
        <span className="row tight">
          {data.categories.map((c) => (
            <Chip key={c.key} active={cat === c.key} count={c.count} onClick={() => setCat(c.key)}>
              {c.label}
            </Chip>
          ))}
        </span>
        <span className="note" style={{ textAlign: 'right', flex: '1 1 16rem', minWidth: 0 }}>
          {data.isBuilt
            ? 'Rows hang off the flat, its parking slot, or the society account'
            : "Every row can hang off a feature, so the bore's true cost is knowable"}
        </span>
      </div>

      <div className="card scroll-x" style={{ padding: 0 }}>
        <table style={{ minWidth: '44rem' }}>
          <thead>
            <tr>
              <th>Date</th><th>What it was</th><th>On</th><th>Kind</th><th>Paid by</th>
              <th className="right">Amount</th><th />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className={r.kind === 'income' ? 'income' : r.recoverable ? 'flagged' : ''}>
                <td className="num" style={{ whiteSpace: 'nowrap' }}>{ddmmyyyy(r.spentOn)}</td>
                <td>
                  {r.title}
                  {r.subtitle && (
                    <span className={r.recoverable ? 'accent' : 'note'} style={{ display: 'block', fontSize: '0.75rem' }}>
                      {r.subtitle}
                    </span>
                  )}
                </td>
                {/* The flex lives in a span, never on the <td> — a display:flex
                    table cell drops out of the table's column layout. */}
                <td className="note">
                  <span className="row tight" style={{ flexWrap: 'nowrap' }}>
                    <Icon name={r.onIcon || 'feature'} size={14} /> {r.onLabel}
                  </span>
                </td>
                <td>
                  <span className={`pill ${r.kind === 'capital' ? 'for_sale' : r.kind === 'income' ? 'owned' : ''}`}>
                    {r.kind === 'capital' ? 'Capital' : r.kind === 'income' ? 'Income' : 'Running'}
                  </span>
                </td>
                <td className="muted">{r.paidBy}</td>
                <td className={`right num ${r.kind === 'income' ? 'up' : ''}`}>{inrFullish(r.amount)}</td>
                <td className={r.hasReceipt ? 'up' : 'muted'} aria-hidden>
                  {r.hasReceipt
                    ? <ReceiptLongOutlined sx={{ fontSize: 15 }} />
                    : <PhotoCameraOutlined sx={{ fontSize: 15 }} />}
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={7} className="note">Nothing in this category for {data.year}.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <p className="note" style={{ marginTop: 'var(--space-md)', maxWidth: '58rem' }}>
        {data.isBuilt ? (
          <>
            One ledger, two vocabularies: a parcel talks about bores, kist and labour; a flat talks
            about society dues, tax assessments and tenants. Rent sits in the same list as money in,
            because a property&rsquo;s cost only means something next to what it earns.
          </>
        ) : (
          <>
            Capital rows lift the cost base on the Money tab. Running rows never do — they answer
            &ldquo;what does holding this cost me a year&rdquo;, which is {inr(data.running)}, or{' '}
            {inr(data.perUnitRunning)} {perUnit}.
          </>
        )}
      </p>

      {open && (
        <Drawer
          recordId={rec.id}
          features={data.featureOptions.map((f) => ({ key: f.key, label: f.label }))}
          onClose={() => setOpen(false)}
        />
      )}
    </main>
  );
}

/** Ledger rows show the exact rupee figure, not a lakh short form: a receipt
 *  for ₹18,400 must read ₹18,400. Anything past a crore still shortens. */
function inrFullish(n: number): string {
  return n >= 1e7 ? inr(n) : `₹${inGroup(n)}`;
}
