/** W11 + W12 — one ledger, two vocabularies.
 *
 *  A parcel talks about bores, kist and labour; a flat talks about society
 *  dues, tax assessments and tenants. Same table, same columns, different
 *  categories — and on a let property, rent sits in the same list as money in,
 *  because a property's cost only means something next to what it earns.
 *
 *  The capital/running switch in the drawer is the screen's whole argument:
 *  capital rows lift the cost base on the Money tab, running rows answer "what
 *  does holding this cost me a year".
 *
 *  Two things this screen had to unlearn. The drawer opened pre-filled with a
 *  comp's ₹18,400 on 12/08/2026 — demo furniture in a form that writes to a
 *  real ledger, so a person who typed only a title filed a fabricated expense
 *  into the year totals and the cost base. And `isBuilt` is the unit of
 *  measure and nothing else (the server derives it from `extent_unit ==
 *  "sq.ft"`), so using it as "is let" told every flat, shop and self-occupied
 *  house that it had a tenant. Rent that has actually been recorded is the
 *  only tenancy this client can attest to. */
import { useState } from 'react';
import AddOutlined from '@mui/icons-material/AddOutlined';
import FileDownloadOutlined from '@mui/icons-material/FileDownloadOutlined';
import SouthWestOutlined from '@mui/icons-material/SouthWestOutlined';
import ReceiptLongOutlined from '@mui/icons-material/ReceiptLongOutlined';
import PhotoCameraOutlined from '@mui/icons-material/PhotoCameraOutlined';

import { useExpenses, useSaveExpense } from '../api';
import {
  Cell, Chip, Empty, Failed, Icon, Loading, ddmmyyyy, downloadCsv, inGroup, inr, inrFullish,
} from '../ui';
import { Drawer, DrawerAction, drawerEyebrow } from '../Drawer';
import { useToast } from '../Toast';
import { useRecordCtx } from './Record';
import { SectionHead } from './RecordHead';
import { downloadBlob, fetchFileBlob } from '../../pages/documents/storage';

const KINDS = ['Repair', 'Power bill', 'Labour', 'Seed & inputs', 'Tax / kist', 'Caretaker',
  'Legal', 'New work'];

/** Money in, on a let property. 'Rent' is spelled exactly as the monthly rent
 *  rows already on file are, so a row added here folds into the same category
 *  chip instead of opening a facet of one. */
const RENT_KINDS = ['Rent', 'Deposit', 'Advance'];

const PAID_BY = ['Caretaker', 'You · UPI', 'You · card', 'Wallet · auto', 'Pattadar order',
  'Letting agent'];
/** Rent arrives; it is not paid out. The list is who it came from. */
const RECEIVED_FROM = ['Bank transfer', 'Tenant · UPI', 'Cash', 'Cheque', 'Letting agent'];

function fiscalYearOf(isoDate: string) {
  const [yearText, monthText] = isoDate.split('-');
  const year = Number(yearText);
  const month = Number(monthText);
  const start = month >= 4 ? year : year - 1;
  return `${start}-${String((start + 1) % 100).padStart(2, '0')}`;
}

/** Today as the calendar on the wall has it. `toISOString().slice(0,10)` is
 *  UTC, so between midnight and 05:29 IST it names yesterday — and on the 1st
 *  of April, the wrong financial year. */
function todayIso(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/**
 * The ledger's own drawer — money out, or rent in.
 *
 * It used to carry a local copy of Dialog.tsx's focus trap, and the comment
 * above that copy said what it was waiting for: "the shell itself wants lifting
 * into ui.tsx so W02's add/edit drawer stops repeating the same gaps". That
 * shell exists now (Drawer.tsx) and every hanger on the record uses it, so this
 * panel is the same form inside the shared one. The copy is gone with it, and
 * so are the gaps it had drifted into having — Escape no longer fires mid-write,
 * the page behind is inert rather than merely covered, and the footer is pinned
 * instead of being the last thing you scroll to.
 */
export function ExpenseDrawer({
  recordId, recordTitle, features, mode, wholeLabel, onClose,
}: {
  recordId: string;
  recordTitle: string;
  features: { key: string; label: string }[];
  /** Money out or money in. Rent is the same row with the other sign, but it
   *  is not the same form: the capital/running question, the recover-from-the
   *  -tenant switch and the whole paid-by list mean nothing on money in. */
  mode: 'expense' | 'income';
  built: boolean;
  /** What "not a feature" is called here — a parcel has a whole parcel, a flat
   *  has itself. It is also what the row is filed under when nothing is
   *  picked, so a flat's power bill stops reading "Whole parcel". */
  wholeLabel: string;
  onClose: () => void;
}) {
  const income = mode === 'income';
  const save = useSaveExpense(income ? 'That rent' : 'That expense');
  const toast = useToast();
  // Empty, not a figure. Anything seeded here is a number the user never typed
  // and will not read before pressing Save.
  const [amount, setAmount] = useState('');
  const [title, setTitle] = useState('');
  const [date, setDate] = useState(todayIso);
  const [paidBy, setPaidBy] = useState(income ? RECEIVED_FROM[0] : PAID_BY[0]);
  const [cat, setCat] = useState(income ? RENT_KINDS[0] : KINDS[0]);
  // The whole parcel, not features[0]. Attributing a power bill to whichever
  // bore happens to sort first is a claim the owner never made, and this
  // screen's argument is that a feature's true cost is knowable.
  const [on, setOn] = useState('');
  const [kind, setKind] = useState<'capital' | 'running'>('capital');
  const [recover, setRecover] = useState(false);

  const heading = income ? 'Record rent' : 'Add an expense';
  const enough = Number(amount) > 0 && !!date;
  const dirty = !!(amount || title.trim() || on || recover || date !== todayIso());

  const commit = () => save.mutate({
    recordId, title: title.trim() || cat, amount: Number(amount),
    spentOn: ddmmyyyy(date),
    kind: income ? 'income' : kind, category: cat, paidBy,
    onLabel: features.find((f) => f.key === on)?.label ?? wholeLabel,
    featureId: on, recoverable: !income && recover,
    fiscalYear: fiscalYearOf(date),
  }, {
    onSuccess: () => {
      // Said out loud because the row does not always appear where the drawer
      // closed: a category chip may be filtering it out, and the selected
      // category or year may keep it out of sight.
      toast.ok(income ? 'Rent recorded.' : 'Expense saved.');
      onClose();
    },
  });

  return (
    <Drawer
      eyebrow={drawerEyebrow(recordTitle, 'Money')}
      title={heading}
      onClose={onClose}
      onSubmit={commit}
      busy={save.isPending}
      dirty={dirty}
      discardCopy={{
        title: income ? 'Discard this rent?' : 'Discard this expense?',
        body: 'The row you entered will be lost.',
      }}
      initialFocus=".drawerbody"
      primary={(
        <DrawerAction
          label={income ? 'Save rent' : 'Save expense'}
          working="Saving…"
          pending={save.isPending}
          paused={save.isPaused}
          disabled={!enough}
        />
      )}
    >
        {/* Raw digits in the value. Rebuilding "₹18,400" from the number on
            every keystroke threw the caret to the end of the string, stalled
            backspace on the ₹ and the commas, and made an empty field
            impossible — select-all-delete re-rendered as ₹0. The grouped form
            belongs under the field, where it proves an 8 was not typed for a
            9 without fighting the person typing it. */}
        <div className="field">
          <label htmlFor="ex-amt">Amount</label>
          <input id="ex-amt" type="text" inputMode="numeric" value={amount} placeholder="0"
                 onChange={(e) => setAmount(e.target.value.replace(/[^\d]/g, ''))} />
          {amount && <span className="note">₹{inGroup(Number(amount))}</span>}
        </div>
        <div className="field">
          <label htmlFor="ex-title">What it was</label>
          <input id="ex-title" type="text" value={title} onChange={(e) => setTitle(e.target.value)}
                 placeholder={income ? 'Rent for August' : 'Bore flushing and new starter panel'} />
        </div>
        <div className="row" style={{ gap: 'var(--space-sm)', flexWrap: 'nowrap' }}>
          <div className="field grow">
            <label htmlFor="ex-date">Date</label>
            <input id="ex-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="field grow">
            <label htmlFor="ex-by">{income ? 'Received from' : 'Paid by'}</label>
            <select id="ex-by" value={paidBy} onChange={(e) => setPaidBy(e.target.value)}>
              {(income ? RECEIVED_FROM : PAID_BY).map((v) => <option key={v}>{v}</option>)}
            </select>
          </div>
        </div>

        <div className="field">
          <label>Category</label>
          <div className="row tight">
            {(income ? RENT_KINDS : KINDS).map((k) => (
              <Chip key={k} wash active={cat === k} onClick={() => setCat(k)}>{k}</Chip>
            ))}
          </div>
        </div>

        <div className="field">
          <label htmlFor="ex-on">On what</label>
          <select id="ex-on" value={on} onChange={(e) => setOn(e.target.value)}>
            <option value="">{wholeLabel}</option>
            {features.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
          </select>
        </div>

        {/* Money in is neither capital nor running, and it is not recoverable
            from the tenant — it came from the tenant. Both controls stay out
            of the rent form rather than sitting there meaning nothing. */}
        {!income && (
          <>
            <div className="field">
              <label>Does it add to what the land cost you?</label>
              <div className="choice">
                <button type="button" aria-pressed={kind === 'capital'} onClick={() => setKind('capital')}>
                  Yes — capital
                </button>
                <button type="button" aria-pressed={kind === 'running'} onClick={() => setKind('running')}>
                  No — running
                </button>
              </div>
            </div>

            {/* Not "from the tenant": a cost owed back is as often a
                co-owner's half of a fence as a tenant's share of a bill, and
                most property here has no tenant at all. */}
            <div className="switch">
              <span>
                Someone owes this back to you
              </span>
              <button type="button" aria-pressed={recover} aria-label="Someone owes this back to you"
                      onClick={() => setRecover(!recover)} />
            </div>
          </>
        )}

        {/* A "Repeats every month" switch stood here. Nothing carried it: the
            mutation has no such field and `land_expenses` has no schedule, so
            a person who turned it on for a salary or a lease was promised
            twelve rows and got one. Bringing it back needs a recurrence on the
            row and something server-side to post the copies. */}

        {!enough && (
          <p className="note" style={{ margin: 0 }}>
            Enter the amount and date to save this row.
          </p>
        )}
    </Drawer>
  );
}

export function RecordExpenses() {
  const rec = useRecordCtx();
  const toast = useToast();
  const [year, setYear] = useState<string | undefined>();
  const [cat, setCat] = useState('all');
  const [drawer, setDrawer] = useState<'expense' | 'income' | null>(null);
  const { data, isLoading, error } = useExpenses(rec.id, year);

  // Inside the property's frame now (Money › Expenses), so no <main> of its
  // own: the shell draws the record, the breadcrumb and the tab strip.
  if (isLoading) return <Loading h="40vh" what="the expenses" />;
  if (!data) return <Failed what="The expenses" error={error} boxed h="26rem" />;

  const rows = data.rows.filter((r) => cat === 'all' || r.category === cat);
  /** Nothing has ever been spent on this record — not "nothing matches the
   *  filter". The two used to share one sentence, so a brand-new record was
   *  told a category it had never chosen was hiding its rows. */
  const bare = data.rows.length === 0;
  const catLabel = data.categories.find((c) => c.key === cat)?.label ?? cat;
  /** Rent on file is the only tenancy the client can prove. It is the selected
   *  year's rent, so a let property read on a year before the lease began
   *  still says "built property" — which is at least a thing the data says.
   *  A real answer needs the server to send `isLet` off a lease or a tenant
   *  row in record_people. */
  const isLet = data.income > 0;

  const downloadReceipt = async (fileRef: string, fileName: string) => {
    try {
      downloadBlob(await fetchFileBlob(fileRef), fileName || 'receipt');
    } catch (cause) {
      toast.bad('That receipt could not be opened.', cause);
    }
  };

  /** The visible list — the category filter included — as a file, through the
   *  one CSV routine the Money tab's Cost sheet uses too (ui.tsx downloadCsv).
   *  The record and the year are in the name, so a ledger cannot be mistaken
   *  for another record's or for the properties list's own export. Silent on
   *  success, like the Cost sheet; only a refusal is said. */
  const exportCsv = () => {
    const head = ['Date', 'What it was', 'Detail', 'On', 'Kind', 'Paid by', 'Amount (₹)',
      'Recoverable', 'Receipt'];
    const lines = rows.map((r) => [ddmmyyyy(r.spentOn), r.title, r.subtitle, r.onLabel, r.kind,
      r.paidBy, Math.round(r.amount), r.recoverable ? 'yes' : 'no',
      r.hasReceipt ? 'filed' : 'none']);
    try {
      downloadCsv(`expenses-${rec.id}-${data.year}.csv`, [head, ...lines]);
    } catch (cause) {
      toast.bad('The expenses could not be exported.', cause);
    }
  };

  /** Who owes the money back, in the row's own words ("Half owed back by
   *  Venkat") — the strip used to say "by tenant" for any recoverable cost. */
  const owedNotes = data.rows.filter((r) => r.recoverable && r.recoverableNote)
    .map((r) => r.recoverableNote);

  return (
    <>
      {/* The ledger's own section heading, inside the property's frame: the
          record is the <h1>, and Money stays the tab you are on. */}
      {/* One noun for the ledger, "Expenses", under Money. The extent is the
          frame's chip and the year is the picker's, so the line under the
          heading says only what neither does: that rent is on file, and the
          year when there is no picker to show it. */}
      {/* "Let to a tenant" only on a built property: money in on a parcel is a
          harvest or a lease payment, not proof of a tenant — the rule the
          old page-head line kept (" · let to a tenant" on built records). */}
      <SectionHead
        title={data.isBuilt && isLet ? 'Expenses & rent' : 'Expenses'}
        sub={[
          data.isBuilt && isLet && 'Let to a tenant',
          bare && data.years.length <= 1 && data.year,
        ].filter(Boolean).join(' · ') || undefined}
        actions={(
          <>
          {/* On an empty ledger a lone option is not a choice at all — it is
              the server's fallback year, not a year any row attests to. */}
          {(!bare || data.years.length > 1) && (
            <select value={data.year} onChange={(e) => setYear(e.target.value)}
                    aria-label="Financial year" style={{ width: 'auto' }}>
              {data.years.map((y) => <option key={y}>{y}</option>)}
            </select>
          )}
          {/* Recording rent is an action, not a claim about the property, so it
              is offered on any built record — it is the only way into the
              income side of the ledger, and it used to do nothing at all. */}
          {data.isBuilt && (
            <button type="button" className="btn" onClick={() => setDrawer('income')}>
              <SouthWestOutlined sx={{ fontSize: 16 }} /> Record rent
            </button>
          )}
          {/* Export was gated behind !isBuilt, so the one ledger with rent in
              it could not be exported. It follows the visible list instead. */}
          {rows.length > 0 && (
            <button type="button" className="btn" onClick={exportCsv}>
              <FileDownloadOutlined sx={{ fontSize: 16 }} /> Export
            </button>
          )}
          <button type="button" className="btn primary" onClick={() => setDrawer('expense')}>
            <AddOutlined sx={{ fontSize: 17 }} /> Add an expense
          </button>
          </>
        )}
      />

      <div className="strip">
        {data.isBuilt && isLet ? (
          <>
            <Cell k="Rent received" v={inr(data.income)} tone="up" />
            <Cell k="Spent" v={inr(data.spent)} />
            <Cell k="Capital · adds to cost" v={inr(data.capital)} tone="info" />
            <Cell k="Net yield on value" v={`${data.netYield.toFixed(2)}%`} />
            {/* The same total the other shape carries, under the same guard:
                the server sums owed_back for every record, and on a let flat
                it used to appear in no total at all — on exactly the records
                with a tenant to owe it. */}
            {data.owedBack > 0 && (
              <Cell k="Owed back" v={inr(data.owedBack)} tone="down"
                    note={owedNotes.length === 1 ? owedNotes[0]
                      : owedNotes.length > 1 ? `on ${owedNotes.length} rows` : undefined} />
            )}
          </>
        ) : (
          <>
            <Cell k="Spent this year" v={inr(data.spent)} />
            <Cell k="Capital · adds to cost" v={inr(data.capital)} />
            <Cell k="Running" v={inr(data.running)} />
            {/* Only when something is actually marked to claim back, and
                naming who from the row's own note. "Owed back by tenant"
                asserted a tenant on every record — the seed's is owed by a
                co-owner. */}
            {data.owedBack > 0 && (
              <Cell k="Owed back" v={inr(data.owedBack)} tone="down"
                    note={owedNotes.length === 1 ? owedNotes[0]
                      : owedNotes.length > 1 ? `on ${owedNotes.length} rows` : undefined} />
            )}
          </>
        )}
      </div>

      {!bare && (
        <div className="row between" style={{ margin: 'var(--space-lg) 0 var(--space-md)', gap: 'var(--space-lg)' }}>
          <span className="row tight">
            {/* Washed when pressed: a filter is not an action, and the one
                amber fill here is "Add an expense". */}
            {data.categories.map((c) => (
              <Chip key={c.key} wash active={cat === c.key} count={c.count} onClick={() => setCat(c.key)}>
                {c.label}
              </Chip>
            ))}
          </span>
        </div>
      )}

      {bare ? (
        // No second "Add an expense": the head's is the one way in, and a
        // second filled button under it was a second fill in the viewport.
        <div style={{ marginTop: 'var(--space-lg)' }}>
          <Empty boxed h="18rem" icon="tax" title="No costs recorded yet" />
        </div>
      ) : (
        <div className="card scroll-x" style={{ padding: 0 }}>
          <table style={{ minWidth: '44rem' }}>
            <thead>
              <tr>
                <th>Date</th><th>What it was</th><th>On</th><th>Kind</th><th>Paid by</th>
                <th className="right">Amount</th><th aria-label="Receipt" />
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
                  {/* An outlined chip: the kind is a classification, and the
                      status pills' colours (For sale amber, Owned green) said
                      something about the property that a ledger row does not. */}
                  <td>
                    <Chip>{r.kind === 'capital' ? 'Capital' : r.kind === 'income' ? 'Income' : 'Running'}</Chip>
                  </td>
                  <td className="muted">{r.paidBy}</td>
                  {/* inrFullish, not inr: a ledger row is the receipt, and a
                      receipt for ₹18,400 has to read ₹18,400 rather than
                      "₹18.4 K". The strip cells above are magnitudes, so they
                      keep inr. Anything past a crore still shortens. */}
                  <td className={`right num ${r.kind === 'income' ? 'up' : ''}`}>{inrFullish(r.amount)}</td>
                  {/* The glyph was aria-hidden under an empty <th>, so "has a
                      receipt" was invisible to a screen reader and unexplained
                      to everyone else. `titleAccess` gives the icon both an
                      accessible name and a hover tooltip. */}
                  <td className={r.hasReceipt ? 'up' : 'muted'}>
                    {r.receiptFileRef
                      ? (
                        <button type="button" className="iconbtn"
                                aria-label={`Download receipt for ${r.title}`}
                                onClick={() => void downloadReceipt(r.receiptFileRef, r.receiptFileName)}>
                          <ReceiptLongOutlined sx={{ fontSize: 15 }} />
                        </button>
                      )
                      : r.hasReceipt
                        ? <ReceiptLongOutlined sx={{ fontSize: 15 }} titleAccess="Receipt filed" />
                      : <PhotoCameraOutlined sx={{ fontSize: 15 }} titleAccess="No receipt yet" />}
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr><td colSpan={7} className="note">Nothing under {catLabel} for {data.year}.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {drawer && (
        <ExpenseDrawer
          recordId={rec.id}
          recordTitle={rec.title}
          features={data.featureOptions.map((f) => ({ key: f.key, label: f.label }))}
          mode={drawer}
          built={data.isBuilt}
          wholeLabel={data.isBuilt ? data.title : 'The whole parcel'}
          onClose={() => setDrawer(null)}
        />
      )}
    </>
  );
}

/**
 * The expense drawer, for a screen that does not already hold the ledger.
 *
 * The Money hanger needs it — its whole subject is what this land cost, and
 * until now it was the one hanger with no way to add anything at all. It does
 * not run the ledger query, though, and the drawer needs the feature list so a
 * power bill can hang off the bore it was spent on.
 *
 * So this fetches that on open, and only on open: it is mounted by the drawer
 * being open, so a reader who never presses the button never pays for the read.
 * Until it lands the panel is not drawn — a form whose "On what" list is empty
 * would quietly file every row against the whole parcel.
 */
export function ExpenseDrawerFor({ recordId, recordTitle, mode, onClose }: {
  recordId: string;
  recordTitle: string;
  mode: 'expense' | 'income';
  onClose: () => void;
}) {
  const { data } = useExpenses(recordId);
  if (!data) return null;
  return (
    <ExpenseDrawer
      recordId={recordId}
      recordTitle={recordTitle}
      features={data.featureOptions.map((f) => ({ key: f.key, label: f.label }))}
      mode={mode}
      built={data.isBuilt}
      wholeLabel={data.isBuilt ? data.title : 'The whole parcel'}
      onClose={onClose}
    />
  );
}
