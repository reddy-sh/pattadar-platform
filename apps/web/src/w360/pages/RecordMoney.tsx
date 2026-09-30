/** W10 — what it cost, what the government says, what it may be worth.
 *
 *  Three numbers, kept apart on purpose. What you PAID is a fact. What the
 *  government says is a published rate. What it is WORTH is an assumption you
 *  chose — which is why the appreciation control is on the page and labelled
 *  "an assumption you chose, not a valuation".
 *
 *  Capital work is listed beside the purchase, never inside it, so cost per
 *  acre stays honest and a future capital-gains sum has the right base. */
import { Link } from 'react-router';
import AddOutlined from '@mui/icons-material/AddOutlined';
import FileDownloadOutlined from '@mui/icons-material/FileDownloadOutlined';

import { useDeletePurchase, useMoney, useSavePurchase, useUpdatePurchase } from '../api';
import type { PurchaseLot } from '../api';
import { Card, Empty, Failed, Loading, Menu, ddmmyyyy, downloadCsv, inr, num } from '../ui';
import { Drawer, DrawerAction, drawerEyebrow } from '../Drawer';
import { useToast } from '../Toast';
import { useRecordCtx } from './Record';
import { SectionHead } from './RecordHead';
import { ConfirmDialog } from './PropertyActions';
import { ExpenseDrawerFor } from './RecordExpenses';
import { useId, useRef, useState } from 'react';

const RATES = [6, 10, 14];
/** The server compounds whatever rate it is given over every year since the
 *  purchase and validates none of it (web360.py, `rate_pct`), so −30 or 500
 *  would draw a curve into the billions and call it a market estimate. */
const RATE_MAX = 50;

/** Three series over the years since purchase. Drawn as a plain SVG polyline —
 *  a chart library for three lines would be more code, not less. */
function ValueChart({ series }: { series: { year: string; market: number; government: number; paid: number }[] }) {
  // Kept as a guard, but the caller no longer relies on it: a null here left a
  // titled card with a legend and nothing under it. See the call site.
  if (series.length < 2) return null;
  const W = 100, H = 34;
  const max = Math.max(...series.flatMap((p) => [p.market, p.government, p.paid])) || 1;
  const x = (i: number) => (i / (series.length - 1)) * W;
  const y = (v: number) => H - (v / max) * (H - 3);
  const line = (get: (p: typeof series[0]) => number) =>
    series.map((p, i) => `${x(i)},${y(get(p))}`).join(' ');

  return (
    <svg viewBox={`0 0 ${W} ${H + 6}`} style={{ width: '100%', height: '11rem' }} role="img"
         aria-label="Value over time">
      <polyline points={line((p) => p.paid)} fill="none" stroke="var(--w-ink-3)"
                strokeWidth="0.5" strokeDasharray="1.5 1.5" />
      <polyline points={line((p) => p.government)} fill="none" stroke="var(--w-info)" strokeWidth="0.7" />
      <polyline points={line((p) => p.market)} fill="none" stroke="var(--w-accent)" strokeWidth="0.9" />
      <circle cx={x(series.length - 1)} cy={y(series[series.length - 1].market)} r="1" fill="var(--w-accent)" />
      <circle cx={x(series.length - 1)} cy={y(series[series.length - 1].government)} r="1" fill="var(--w-info)" />
      <g fill="var(--w-ink-3)" fontSize="2.4">
        <text x="0" y={H + 5}>{series[0].year}</text>
        <text x={W / 2 - 3} y={H + 5}>{series[Math.floor(series.length / 2)].year}</text>
        <text x={W - 7} y={H + 5}>{series[series.length - 1].year}</text>
      </g>
    </svg>
  );
}

/**
 * Recording a purchase — one registration the land was bought in.
 *
 * The write the "How you bought it" card was missing. Only the amount paid is
 * required: it is what someone remembers first and it is all the figures above
 * need. Everything else — the date, the extent, the government value, the
 * seller and the deed reference — is optional, filled in as it is recalled. The
 * rate is not asked for; the server derives it from paid ÷ extent so it can
 * never disagree with the two numbers it comes from.
 */
/** A figure for a form field: the number as typed, and nothing for a 0 — the
 *  server stores "not recorded" as 0, and a box pre-filled with 0 invites the
 *  owner to believe somebody recorded nothing. */
const fieldOf = (n: number) => (n > 0 ? String(n) : '');
/** 18/07/2019 (as a lot stores it) → 2019-07-18, which a date input needs. */
const isoOf = (d: string) => {
  const m = d.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : d.slice(0, 10);
};

function PurchaseDrawer({ recordId, recordTitle, extentUnit, lot, onClose, returnFocus }: {
  recordId: string;
  recordTitle: string;
  extentUnit: string;
  /** Present when correcting a lot already on file; absent to record a new one. */
  lot?: PurchaseLot;
  onClose: () => void;
  returnFocus: React.RefObject<HTMLElement | null>;
}) {
  const save = useSavePurchase();
  const update = useUpdatePurchase();
  const [paid, setPaid] = useState(lot ? fieldOf(lot.paid) : '');
  const [boughtOn, setBoughtOn] = useState(lot ? isoOf(lot.boughtOn) : '');
  const [extent, setExtent] = useState(lot ? fieldOf(lot.extent) : '');
  const [govt, setGovt] = useState(lot ? fieldOf(lot.govtValue) : '');
  const [seller, setSeller] = useState(lot?.seller ?? '');
  const [deedNo, setDeedNo] = useState(lot?.deedNo ?? '');
  const [sro, setSro] = useState(lot?.sro ?? '');
  const [err, setErr] = useState('');
  const whyId = useId();
  const unit = lot?.extentUnit || extentUnit;
  const unitWord = unit === 'ac' ? 'acre' : unit || 'unit';
  const pending = save.isPending || update.isPending;

  const paidNum = Number(paid);
  const ready = paid.trim() !== '' && Number.isFinite(paidNum) && paidNum > 0 && !pending;
  const fields = [paid, boughtOn, extent, govt, seller, deedNo, sro];
  const dirty = lot
    ? fields.join('\u0000') !== [fieldOf(lot.paid), isoOf(lot.boughtOn), fieldOf(lot.extent),
      fieldOf(lot.govtValue), lot.seller, lot.deedNo, lot.sro].join('\u0000')
    : fields.some((v) => v.trim() !== '');

  const commit = async () => {
    if (!ready) return;
    setErr('');
    // A blank optional box goes as 0, which is how the server stores "not
    // recorded" — and the page reads a 0 back as "—", never as ₹0 or 0 ac.
    const vars = {
      boughtOn: boughtOn.trim(), paid: paidNum,
      extent: Number(extent) || 0, extentUnit: unit, govtValue: Number(govt) || 0,
      seller: seller.trim(), deedNo: deedNo.trim(), sro: sro.trim(),
    };
    // The mutation raises its own toast when the request fails; the line
    // below is what the panel says about its own state. It closes only on a
    // clean save.
    const ok = lot
      ? await update.mutateAsync({ lotId: lot.id, ...vars })
        .then((r) => r.web.updatePurchase).catch(() => false)
      : await save.mutateAsync({ recordId, ...vars })
        .then((r) => !!r.web.savePurchase).catch(() => false);
    if (!ok) {
      setErr(lot ? 'That correction was not saved. The lot is unchanged.'
        : 'That purchase could not be saved. Nothing was recorded.');
      return;
    }
    onClose();
  };

  return (
    <Drawer
      eyebrow={drawerEyebrow(recordTitle, 'Money')}
      title={lot ? 'Correct this purchase' : 'Record a purchase'}
      onClose={onClose}
      onSubmit={() => void commit()}
      busy={pending}
      dirty={dirty}
      initialFocus="#pu-paid"
      returnFocus={returnFocus}
      // A greyed primary says why, beside it.
      primaryWhy={!ready && !pending ? { id: whyId, text: 'Enter what you paid to save this.' } : undefined}
      primary={(
        <DrawerAction label={lot ? 'Save the correction' : 'Record it'} working="Saving…"
                      pending={pending} disabled={!ready}
                      describedBy={!ready && !pending ? whyId : undefined} />
      )}
    >
      <div className="field">
        <label htmlFor="pu-paid">What you paid</label>
        <input id="pu-paid" type="text" inputMode="numeric" value={paid} placeholder="0"
               onChange={(e) => setPaid(e.target.value.replace(/[^\d.]/g, ''))} />
        {paid && <span className="note">₹{inr(paidNum || 0).replace('₹', '')}</span>}
      </div>
      <div className="field">
        <label htmlFor="pu-date">When (date on the deed)</label>
        <input id="pu-date" type="date" value={boughtOn} onChange={(e) => setBoughtOn(e.target.value)} />
        <span className="note">Optional.</span>
      </div>
      <div className="field">
        <label htmlFor="pu-extent">Extent bought ({unitWord})</label>
        <input id="pu-extent" type="text" inputMode="decimal" value={extent} placeholder="0"
               onChange={(e) => setExtent(e.target.value.replace(/[^\d.]/g, ''))} />
        <span className="note">
          {extent && paidNum > 0 && Number(extent) > 0
            ? `${inr(Math.round(paidNum / Number(extent)))} per ${unitWord}`
            : 'Optional.'}
        </span>
      </div>
      <div className="field">
        <label htmlFor="pu-govt">Government value then</label>
        <input id="pu-govt" type="text" inputMode="numeric" value={govt} placeholder="0"
               onChange={(e) => setGovt(e.target.value.replace(/[^\d.]/g, ''))} />
        <span className="note">Optional.</span>
      </div>
      <div className="field">
        <label htmlFor="pu-seller">Seller</label>
        <input id="pu-seller" type="text" value={seller} placeholder="Who you bought from"
               onChange={(e) => setSeller(e.target.value)} />
      </div>
      <div className="field">
        <label htmlFor="pu-deed">Deed number &amp; SRO</label>
        <div className="row tight" style={{ gap: 8, alignItems: 'flex-start' }}>
          <input id="pu-deed" type="text" value={deedNo} placeholder="Deed no."
                 onChange={(e) => setDeedNo(e.target.value)} style={{ flex: '1 1 0', minWidth: 0 }} />
          <input aria-label="SRO" type="text" value={sro} placeholder="SRO"
                 onChange={(e) => setSro(e.target.value)} style={{ flex: '1 1 0', minWidth: 0 }} />
        </div>
        <span className="note">Optional.</span>
      </div>
      {err && <p className="note" role="alert" style={{ margin: 0, color: 'var(--w-danger)' }}>{err}</p>}
    </Drawer>
  );
}

export function RecordMoney() {
  const rec = useRecordCtx();
  const toast = useToast();
  const delLot = useDeletePurchase();
  /** The lot being corrected (the purchase drawer in edit mode), or null. */
  const [editLot, setEditLot] = useState<PurchaseLot | null>(null);
  /** The lot whose removal is being confirmed, or null. */
  const [dropLot, setDropLot] = useState<PurchaseLot | null>(null);
  const [dropErr, setDropErr] = useState('');
  /** Where focus goes back to when the lot's drawer or dialog closes: the
   *  kebab that opened it is inside a menu that has already shut. */
  const lotTrigger = useRef<HTMLElement | null>(null);
  const [rate, setRate] = useState<number>(10);
  // The custom rate is typed into a box of its own and committed on blur or
  // Enter. `draft` is deliberately separate from `rate`: the rate is part of
  // the money query's key, so binding the box straight to it would send a
  // round trip per keystroke — 1%, then 12%, on the way to 12.5%.
  const [custom, setCustom] = useState(false);
  const [draft, setDraft] = useState('10');
  const customChip = useRef<HTMLButtonElement>(null);
  const cancelCustom = useRef(false);
  const [adding, setAdding] = useState(false);
  const addTrigger = useRef<HTMLButtonElement>(null);
  // The purchase drawer — separate from the expense one above. Recording what
  // the land COST is a different act from recording an ongoing cost, and it
  // writes a different table (purchase_lots, not land_expenses).
  const [buying, setBuying] = useState(false);
  const buyTrigger = useRef<HTMLButtonElement>(null);

  const money = useMoney(rec.id, rate);
  const lastGood = useRef<NonNullable<typeof money.data> | undefined>(undefined);
  if (money.data) lastGood.current = money.data;
  const data = money.data ?? lastGood.current;
  const isPending = money.isPending;
  const error = money.error;
  /** Showing a previous rate's numbers while the chosen one loads. Not the
   *  same as "fetching": an ordinary background revalidation of the SAME rate
   *  must not dim anything, because the reader did nothing. */
  const stale = money.isPlaceholderData || (!money.data && !!lastGood.current);

  if (!data) {
    return isPending
      ? <Loading h="70vh" what="the money figures" />
      : <Failed what="The money figures" error={error} boxed h="26rem" />;
  }

  const unit = data.extentUnit === 'ac' ? 'acre' : data.extentUnit;

  /** The gain, and whether there is one to show.
   *
   *  Nothing recorded as paid means there is no cost to measure against. The
   *  resolver used to hand back the whole market value with `marketGainPct: 0`
   *  as a zero-denominator fallback, which printed as "+₹1.40 Cr over what you
   *  paid · +0%" — two halves of one sentence contradicting each other, both
   *  meaningless. It now returns null for both.
   *
   *  The resolver returns null for both gain fields when nothing is on file as
   *  paid — it used to return the whole market value at +0%, which read as a
   *  parcel that had appreciated infinitely. Narrowing on the values
   *  themselves rather than on `paidTotal > 0` means the screen cannot print a
   *  gain the server declined to compute, even if the two ever disagree. */
  const gain = data.marketGain;
  const gainPct = data.marketGainPct;
  const paidKnown = data.paidTotal > 0 && gain !== null && gainPct !== null;

  /** What the page is showing, as a file: the three headline figures, the lots
   *  behind them and the capital work beside them.
   *
   *  Printing was the other candidate for this button and is not one yet —
   *  w360.css's print block forces black text only on `.pagehead` and the
   *  fence sheet, so this page would come out pale grey on white, and the
   *  wide purchase table sits inside a `.scroll-x` that paper cannot scroll.
   *  Built the way Properties' export is, down to the injection guard. */
  const costSheet = () => {
    const rows: unknown[][] = [
      ['Record', rec.title],
      ['Extent', num(data.extent, data.extentUnit === 'ac' ? 2 : 0), data.extentUnit],
      [],
      ['What you actually paid', paidKnown ? Math.round(data.paidTotal) : ''],
      [`Paid per ${unit}`, paidKnown ? Math.round(data.paidPerUnit) : ''],
      ['Of that, duty and capital work', Math.round(data.extrasTotal)],
      ['Government value today', Math.round(data.govtTotal)],
      [`Government per ${unit}`, Math.round(data.govtPerUnit)],
      ['Market estimate', Math.round(data.marketTotal)],
      ['Appreciation assumed, % a year', data.appreciationPct],
      // A gain with nothing paid is not a gain, so it is left out of the file
      // rather than exported as a zero somebody's spreadsheet would sum.
      ...(paidKnown ? [
        ['Over what you paid', Math.round(gain ?? 0)],
        ['Over what you paid, %', Math.round(gainPct ?? 0)],
      ] : []),
    ];
    if (data.lots.length) {
      rows.push([], ['How you bought it'],
        ['Date', 'Extent', 'Unit', `Rate per ${unit}`, 'Paid', 'Govt then', 'Seller', 'Deed', 'SRO']);
      for (const l of data.lots) {
        rows.push([l.boughtOn, l.extent, l.extentUnit, Math.round(l.rate), Math.round(l.paid),
          Math.round(l.govtValue), l.seller, l.deedNo, l.sro]);
      }
    }
    if (data.extras.length) {
      rows.push([], ['Everything else you put in']);
      for (const e of data.extras) rows.push([e.label, Math.round(e.amount)]);
    }
    // The one CSV routine (ui.tsx downloadCsv), shared with the ledger's
    // Export, and silent on success like it: the browser's own download is the
    // answer. Only a refusal is said.
    try {
      downloadCsv(`cost-sheet-${rec.title.replace(/[^a-z0-9]+/gi, '-').toLowerCase()
        }-${new Date().toISOString().slice(0, 10)}.csv`, rows);
    } catch (e) {
      toast.bad('The cost sheet could not be saved.', e);
    }
  };

  /** Remove a lot, holding the confirmation open until the answer comes. */
  const removeLot = async () => {
    if (!dropLot || delLot.isPending) return;
    setDropErr('');
    try {
      const res = await delLot.mutateAsync({ lotId: dropLot.id });
      if (!res.web.deletePurchase) {
        setDropErr('That purchase was not removed. It may already be gone — reload the page.');
        return;
      }
      setDropLot(null);
      // Its row, and the kebab that opened this, are gone; focus goes to the
      // control that is always there.
      requestAnimationFrame(() => buyTrigger.current?.focus());
    } catch {
      setDropErr('That purchase could not be removed. It is still recorded.');
    }
  };

  /** Take the typed rate, or put the box back to the rate in force. */
  const commitCustom = () => {
    if (cancelCustom.current) {
      cancelCustom.current = false;
      setDraft(String(rate));
      return;
    }
    const n = Number(draft);
    if (!draft.trim() || !Number.isFinite(n)) { setDraft(String(rate)); return; }
    const clamped = Math.min(RATE_MAX, Math.max(0, Math.round(n * 10) / 10));
    setDraft(String(clamped));
    setRate(clamped);
  };

  /** Only the chart moves with the appreciation rate: `market_value`, the
   *  government figure and the per-unit rates are read straight off the record
   *  (web360.py `money`), so dimming those cards would claim a recalculation
   *  that is not happening. */
  const dim = {
    opacity: stale ? 0.55 : undefined,
    transition: 'opacity var(--dur-fast) var(--ease-out)',
  };

  return (
    <>
      <SectionHead
        title="Money"
        /* The two numbers the whole hanger is about, said at the top. Both
           halves refuse to round an unknown to zero: a record with no purchase
           on file has not been bought for nothing. */
        sub={[
          paidKnown
            ? `Paid ${inr(data.paidTotal)}${rec.boughtYear ? ` (${rec.boughtYear})` : ''}`
            : 'Purchase price not recorded',
          data.marketTotal > 0
            ? `Estimated value ${inr(data.marketTotal)}`
            : 'Value not recorded',
          // How many registrations the cost is spread over. The extent half of
          // this line moved to the header chip; the lots did not, because they
          // are the reason the table below has more than one block.
          data.lots.length > 1 ? `${data.lots.length} purchase lots` : '',
        ].filter(Boolean).join(' · ')}
        actions={(
          <>
          <button type="button" className="btn" onClick={costSheet}>
            <FileDownloadOutlined sx={{ fontSize: 16 }} /> Cost sheet
          </button>
          {/* Two adds, because this hanger holds two different things. "Record
              a purchase" writes a registration lot (savePurchase → purchase_lots)
              — what the land COST, the figures at the top of the page. "Add an
              expense" writes an ongoing expense (saveExpense → land_expenses) —
              what it costs to HOLD, the ledger the page links to — and it is
              the same words the ledger's own button and drawer use, so one
              drawer has one name. The purchase (the thing an empty page is
              missing) is the filled lead action; the expense is outlined. */}
          <button ref={buyTrigger} type="button" className="btn primary"
                  aria-haspopup="dialog" aria-expanded={buying}
                  onClick={() => setBuying(true)}>
            <AddOutlined sx={{ fontSize: 16 }} /> Record a purchase
          </button>
          <button ref={addTrigger} type="button" className="btn"
                  aria-haspopup="dialog" aria-expanded={adding}
                  onClick={() => setAdding(true)}>
            <AddOutlined sx={{ fontSize: 16 }} /> Add an expense
          </button>
          </>
        )}
      />

      {adding && (
        <ExpenseDrawerFor
          recordId={rec.id}
          recordTitle={rec.title}
          mode="expense"
          onClose={() => setAdding(false)}
        />
      )}

      {buying && (
        <PurchaseDrawer
          recordId={rec.id}
          recordTitle={rec.title}
          extentUnit={data.extentUnit}
          returnFocus={buyTrigger}
          onClose={() => setBuying(false)}
        />
      )}

      {editLot && (
        <PurchaseDrawer
          key={editLot.id}
          recordId={rec.id}
          recordTitle={rec.title}
          extentUnit={data.extentUnit}
          lot={editLot}
          returnFocus={lotTrigger}
          onClose={() => setEditLot(null)}
        />
      )}

      {dropLot && (
        <ConfirmDialog
          title="Remove this purchase?"
          // What delete_purchase does (web360.py): the one lot goes and the
          // totals and blended rate recompute from the lots that remain.
          body={`The ${inr(dropLot.paid)} registration${dropLot.boughtOn ? ` of ${ddmmyyyy(dropLot.boughtOn)}` : ''}`
            + ' comes off this property, and the totals are worked out again from what is left.'}
          actionLabel="Remove"
          danger
          busy={delLot.isPending}
          error={dropErr}
          onConfirm={() => void removeLot()}
          onClose={() => {
            setDropErr('');
            setDropLot(null);
            requestAnimationFrame(() => lotTrigger.current?.focus());
          }}
        />
      )}

      <div className="grid3" style={{ margin: '0 0 var(--space-lg)' }}>
        <div className="card">
          <span className="eyebrow">What you actually paid</span>
          {/* A record with no purchase on file has not been bought for nothing;
              it has nothing recorded. ₹0 is a claim, "—" is the truth. */}
          <p className="num" style={{ fontSize: '2rem', margin: '0.25rem 0 0.5rem' }}>
            {paidKnown ? inr(data.paidTotal) : '—'}
          </p>
          <hr className="hr" style={{ margin: '0 0 0.5rem' }} />
          {/* The duty and capital work are told once, in Other costs below —
              not a third time here as "incl.". */}
          {paidKnown ? (
            <p className="note mono">
              {inr(data.paidPerUnit)} / {unit}
            </p>
          ) : (
            <p className="note">No purchase recorded.</p>
          )}
        </div>
        {/* An unknown value is "—" and says so, as the paid card does — never
            ₹0, which is a claim that somebody valued it at nothing. */}
        <div className="card">
          <span className="eyebrow">Government value today</span>
          <p className="num" style={{ fontSize: '2rem', margin: '0.25rem 0 0.5rem', color: 'var(--w-info)' }}>
            {data.govtTotal > 0 ? inr(data.govtTotal) : '—'}
          </p>
          <hr className="hr" style={{ margin: '0 0 0.5rem' }} />
          {data.govtTotal > 0 ? (
            <p className="note mono">
              {/* The revision date only when the API has a real one. It used
                  to print the current month on every read — a claim about the
                  government rate that nothing stood behind. */}
              {inr(data.govtPerUnit)} / {unit} · SRO rate
              {data.govtRevised && <>, revised {ddmmyyyy(data.govtRevised)}</>}
            </p>
          ) : (
            <p className="note">Value not recorded.</p>
          )}
        </div>
        <div className="card accent">
          <span className="eyebrow">Market estimate</span>
          <p className="num accent" style={{ fontSize: '2rem', margin: '0.25rem 0 0.5rem' }}>
            {data.marketTotal > 0 ? inr(data.marketTotal) : '—'}
          </p>
          <hr className="hr" style={{ margin: '0 0 0.5rem' }} />
          {data.marketTotal <= 0 ? (
            <p className="note">Value not recorded.</p>
          ) : paidKnown ? (
            <p className="note mono">
              <span className={(gain ?? 0) >= 0 ? 'up' : 'down'}>
                {inr(gain ?? 0, true)} over what you paid · {(gain ?? 0) >= 0 ? '+' : ''}
                {Math.round(gainPct ?? 0)}%
              </span>
            </p>
          ) : (
            <p className="note">No gain to show.</p>
          )}
        </div>
      </div>

      <div className="split">
        <div className="stack lg">
          {/* The card stays whether or not there are lots. Dropping it left a
              record with no purchase looking at a page that simply ended, with
              no word anywhere about the thing that was missing. */}
          <Card title="Purchase"
                aside={data.lots.length > 0 ? <span className="note">
                  {data.lots.length > 1
                    ? `${data.lots.length} lots, one registration summary`
                    : 'One registration'}
                </span> : undefined}>
            {data.lots.length > 0 ? (
              /* Six columns of registration detail: it scrolls inside the
                 card rather than taking the page sideways on a phone, and the
                 edge fade (`.edgefade`) says there is more to the side. */
              <div className="scroll-x edgefade">
              <table style={{ minWidth: '40rem' }}>
                <thead>
                  <tr>
                    <th>Date</th><th className="right">Extent</th>
                    <th className="right">₹ / {unit}</th>
                    <th className="right">Paid</th><th className="right">Govt then</th><th>Seller &amp; deed</th>
                    <th className="menucol" aria-label="Actions" />
                  </tr>
                </thead>
                <tbody>
                  {data.lots.map((l) => (
                    <tr key={l.id}>
                      {/* A figure the owner did not give is "—": the server
                          stores "not recorded" as 0, and "0 ac" or "₹0 Govt
                          then" would each be a claim. */}
                      <td className="num">{l.boughtOn ? ddmmyyyy(l.boughtOn) : '—'}</td>
                      <td className="right num">
                        {l.extent > 0 ? `${num(l.extent, l.extentUnit === 'ac' ? 2 : 0)} ${l.extentUnit}` : '—'}
                      </td>
                      <td className="right num">{l.rate > 0 ? inr(l.rate) : '—'}</td>
                      <td className="right num">{inr(l.paid)}</td>
                      <td className="right num" style={{ color: 'var(--w-info)' }}>
                        {l.govtValue > 0 ? inr(l.govtValue) : '—'}
                      </td>
                      <td>
                        {l.seller || '—'}
                        {(l.deedNo || l.sro) && (
                          <span className="note" style={{ display: 'block' }}>
                            {[l.deedNo, l.sro].filter(Boolean).join(' · ')}
                          </span>
                        )}
                      </td>
                      {/* A real menu now that there is something to put in it:
                          a price typed wrong used to stay on the property. */}
                      <td className="menucol">
                        <Menu label={`Actions for the ${inr(l.paid)} purchase`} items={[
                          {
                            label: 'Edit',
                            onClick: () => {
                              lotTrigger.current = document.activeElement as HTMLElement | null;
                              setEditLot(l);
                            },
                          },
                          {
                            label: 'Delete',
                            danger: true,
                            onClick: () => {
                              lotTrigger.current = document.activeElement as HTMLElement | null;
                              setDropErr('');
                              setDropLot(l);
                            },
                          },
                        ]} />
                      </td>
                    </tr>
                  ))}
                  {data.lots.length > 1 && (
                    <tr className="total">
                      <td className="accent">Together</td>
                      <td className="right num">
                        {num(data.extent, data.extentUnit === 'ac' ? 2 : 0)} {data.extentUnit}
                      </td>
                      <td className="right num">{inr(data.blendedRate)}</td>
                      <td className="right num">{inr(data.blendedPaid)}</td>
                      <td className="right num" style={{ color: 'var(--w-info)' }}>
                        {data.blendedGovt > 0 ? inr(data.blendedGovt) : '—'}
                      </td>
                      <td className="note">Blended rate</td>
                      <td className="menucol" />
                    </tr>
                  )}
                </tbody>
              </table>
              </div>
            ) : (
              // No second "Record a purchase": the section head already opens
              // the same drawer.
              <Empty title={paidKnown
                ? 'The price is on the property, not broken into lots'
                : 'No purchase recorded yet'} />
            )}
          </Card>

          {/* The one place the duty and capital work are told. A total beside
              a single row is that row a second time, so it is drawn only when
              there is more than one thing to add up. */}
          {data.extras.length > 0 && (
            <Card title="Other costs"
                  aside={data.extras.length > 1
                    ? <span className="num">{inr(data.extrasTotal)}</span> : undefined}>
              <div className="grid4">
                {data.extras.map((e) => (
                  <div key={e.id}>
                    <span className="eyebrow" style={{ margin: '0 0 0.25rem' }}>{e.label}</span>
                    <span className="num" style={{ fontSize: '1.0625rem' }}>{inr(e.amount)}</span>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* Three states, not one. The card used to be drawn whatever the
              data said, so a record with no purchase — and any record bought
              this calendar year — ended the column in a bordered box with a
              three-colour legend and nothing under it, which reads as a chart
              that failed to load. The legend is the Card's `aside`, so only
              the parent can drop it. */}
          {data.series.length >= 2 ? (
            <div aria-busy={stale || undefined} style={dim}>
              <Card
                title="Value over time"
                aside={
                  <span className="row tight note" style={{ fontSize: '0.75rem' }}>
                    <span style={{ color: 'var(--w-accent)' }}>— Market estimate</span>
                    <span style={{ color: 'var(--w-info)' }}>— Government</span>
                    <span className="muted">— What you paid</span>
                  </span>
                }
              >
                <ValueChart series={data.series} />
                {/* The chart's three lines as figures, for anyone who cannot
                    read a line off a picture — a screen reader heard only
                    "Value over time" — and for anyone who wants the number. */}
                <details className="chart-figures">
                  <summary>The figures by year</summary>
                  <div className="scroll-x">
                    <table>
                      <thead>
                        <tr>
                          <th scope="col">Year</th>
                          <th scope="col" className="right">Market estimate</th>
                          <th scope="col" className="right">Government</th>
                          <th scope="col" className="right">What you paid</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.series.map((p) => (
                          <tr key={p.year}>
                            <th scope="row" className="num">{p.year}</th>
                            <td className="right num">{p.market > 0 ? inr(p.market) : '—'}</td>
                            <td className="right num">{p.government > 0 ? inr(p.government) : '—'}</td>
                            <td className="right num">{p.paid > 0 ? inr(p.paid) : '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </details>
              </Card>
            </div>
          ) : data.lots.length > 0 ? (
            <Card title="Value over time">
              <Empty>Only one year of history so far.</Empty>
            </Card>
          ) : null}

          {/* The ledger, by the name its own page carries. It opens inside
              this property's frame, with Money still the tab you are on. */}
          <Link to={`/app/records/${rec.id}/expenses`} className="btn">
            See the expenses ›
          </Link>
        </div>

        <aside className="stack">
          <Card title="Appreciation rate" className="railcard">
            <p style={{ margin: 0 }}>
              {/* While the newly chosen rate is still loading the payload on
                  screen is the old one, and printing its `appreciationPct`
                  here would have the headline saying 10% with the 6% chip
                  already pressed — a control appearing to do nothing. */}
              <span className="num accent" style={{ fontSize: '1.75rem' }}>
                {stale ? rate : data.appreciationPct}%
              </span>{' '}
              <span className="note">a year, compounding</span>
            </p>
            <div className="row tight" style={{ marginTop: 'var(--space-sm)' }}>
              {/* Washed when pressed: the rate is a view setting, not an
                  action, and the viewport's one amber fill is "Record a
                  purchase". */}
              {RATES.map((r) => (
                <button key={r} type="button" className="chip wash" aria-pressed={rate === r}
                        onClick={() => { setCustom(false); setRate(r); }}>{r}%</button>
              ))}
              {/* This was a `chip static` span: it hovered like the three
                  beside it, took no click and no focus, and there was no other
                  way to price this land at anything but 6, 10 or 14. */}
              <button ref={customChip} type="button" className="chip wash"
                      aria-expanded={custom} aria-controls="mn-rate-field"
                      onClick={() => {
                        cancelCustom.current = false;
                        setDraft(String(rate));
                        setCustom(true);
                      }}>
                Custom
              </button>
            </div>
            {custom && (
              <div id="mn-rate-field" className="field" style={{ marginTop: 'var(--space-sm)' }}>
                <label htmlFor="mn-rate">Your own rate, per cent a year</label>
                <input id="mn-rate" type="number" min="0" max={RATE_MAX} step="0.5"
                       inputMode="decimal" value={draft} autoFocus
                       onChange={(e) => setDraft(e.target.value)}
                       onBlur={commitCustom}
                       onKeyDown={(e) => {
                         if (e.key === 'Enter') { e.preventDefault(); commitCustom(); }
                         if (e.key === 'Escape') {
                           e.preventDefault();
                           cancelCustom.current = true;
                           setCustom(false);
                           requestAnimationFrame(() => customChip.current?.focus());
                         }
                       }} />
                <p className="note" style={{ margin: 0 }}>
                  0 to {RATE_MAX}. Not saved with the record.
                </p>
              </div>
            )}
            {/* A rate that would not load leaves the previous one on screen.
                Saying so beats the page blanking into an error, and beats the
                chips quietly disagreeing with the numbers. */}
            {error && lastGood.current && (
              <p className="note" style={{ color: 'var(--w-danger)', marginTop: 'var(--space-sm)' }}>
                The {rate}% figures did not load. Showing {data.appreciationPct}%.
              </p>
            )}
          </Card>

          {/* Two columns on a laptop, one on a phone (`.guide-rates`), and an
              amount never breaks across two lines. */}
          {data.rates.length > 0 && (
            <Card title="Guideline rates" className="railcard">
              <div className="guide-rates">
                {data.rates.map((r) => (
                  <div key={r.label} className="row between" style={{ flexWrap: 'nowrap' }}>
                    <span className="note">{r.label}</span>
                    <span className="num" style={{ fontSize: '0.875rem', whiteSpace: 'nowrap' }}>{inr(r.value)}</span>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {data.isBuilt && (
            <Card title="Land and building value" className="railcard">
              <div className="rows">
                <div>
                  <span className="grow">
                    Land
                    <span className="note mono" style={{ display: 'block' }}>
                      {num(data.landArea)} sq.yd × {inr(data.landRate)}
                    </span>
                  </span>
                  <span className="num">{inr(data.landValue)}</span>
                </div>
                <div>
                  <span className="grow">
                    Construction
                    <span className="note mono" style={{ display: 'block' }}>
                      {num(data.buildArea)} sq.ft × {inr(data.buildRate)}
                    </span>
                  </span>
                  <span className="num">{inr(data.buildValue)}</span>
                </div>
                <div>
                  <span className="grow">
                    Less depreciation
                    <span className="note mono" style={{ display: 'block' }}>
                      {data.depreciationYears} years, structure only
                    </span>
                  </span>
                  <span className="num down">−{inr(data.depreciation)}</span>
                </div>
              </div>
            </Card>
          )}
        </aside>
      </div>
    </>
  );
}
