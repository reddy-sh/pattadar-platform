/** Tools — the five land utilities, drawn in this app (the redrawn /tools).
 *
 *  This replaces the "still in the previous version" signpost and the MUI
 *  screen it pointed at (pages/ToolsPage.tsx + pages/tools/*, now deleted).
 *  The first four are that screen's tools, same arithmetic, same reads:
 *
 *   · Find SRO      — the Sub-Registrar directory (`useSroOffices`).
 *   · Stamp duty    — the AP fee schedule (`useFeeSchedule`) and the live
 *                     `calculateStampDuty` query, with @pattadar/core
 *                     `calcStampDuty` on the chosen row when the service does
 *                     not answer. Duty is on the higher of consideration and
 *                     guideline value either way.
 *   · Market value  — the guideline-rate table (`useMarketValues`) narrowed by
 *                     a district → mandal → village cascade.
 *   · Area          — pure @pattadar/core units/landcalc: converter, plot
 *                     area, and area from a pasted GeoJSON ring; Plot area
 *                     and Map area hand their sides, in metres, to the Fence
 *                     tab. The old feet / `fenceEstimate` sub-tab is retired.
 *   · Fence         — the village-map fence calculator (FenceStudio) without
 *                     the map: sides typed in metres, priced and printed by
 *                     the same FenceParts.tsx / fenceBill.ts. No reads.
 *
 *  The tab rides in `?tab=` so the old addresses (/legacy/tools and the four
 *  /legacy/sro-style aliases, routes.tsx ToTools) keep landing on the tool
 *  they named.
 *
 *  A read that failed is said as a failure (`Failed`), never as an empty
 *  directory or a search that matched nothing. The stamp-duty tool used to
 *  claim it was "working from the bundled fee schedule" over an EMPTY list —
 *  no bundled schedule has painted since useLiveOrSample stopped serving
 *  samples — so without a schedule it now says it cannot run, instead of
 *  offering a picker with nothing in it.
 */
import { useId, useLayoutEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { useSearchParams } from 'react-router';
import CloseOutlined from '@mui/icons-material/CloseOutlined';
import FileDownloadOutlined from '@mui/icons-material/FileDownloadOutlined';
import PrintOutlined from '@mui/icons-material/PrintOutlined';
import SearchOutlined from '@mui/icons-material/SearchOutlined';

import {
  LENGTH_FT,
  LENGTH_UNITS,
  UNITS,
  acresToAll,
  calcStampDuty,
  formatArea,
  formatINR,
  formatNumberIN,
  parseISOToDisplay,
  parsePolygonRing,
  quadrilateralSqft,
  rectangleSqft,
  ringAreaSqM,
  ringPerimM,
  ringSides,
  round2,
  toAcres,
  toFeet,
  triangleSqft,
  unitLabelFor,
} from '@pattadar/core';
import type { FeeScheduleRow, LengthUnit, UnitKey } from '@pattadar/core';

import { gql } from '../../api/client';
import { useFeeSchedule, useMarketValues, useSroOffices } from '../../data/hooks';
import { fenceBill } from '../fenceBill';
import { FenceBillTable, FenceBuildFields, FenceSheet, sideName, useFenceBuild } from '../FenceParts';
// The tab strip and its panel are the shared ui.tsx TabStrip / TabPanel (one
// role="tablist" contract, Arrow/Home/End, for this screen and Families & groups).
import {
  Card, Empty, Failed, PageHead, Segmented, SelectAllBox, SelectCell, SelectionBar, TabPanel, TabStrip, TablePager, Th,
  downloadCsv, num, plural, sortBy, usePaged, useRowSelection,
} from '../ui';
import type { SegmentOption, SortState } from '../ui';
import { Sk, SkTable } from '../skeletons';
import { SectionHead } from './RecordHead';

// ── Small form atoms ───────────────────────────────────────────────────

/** A labelled number box. Labels are real `<label for>` so the field is named
 *  by what it asks for, not by its placeholder. */
function NumField({ label, value, onChange, placeholder, invalid, hint }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string;
  /** A short gloss under the box, for a label an owner may know by another name. */
  hint?: string;
  /** The box holds something that is not an answer to its question. */
  invalid?: boolean;
}) {
  const id = useId();
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <input
        id={id} type="number" inputMode="decimal" value={value} placeholder={placeholder}
        aria-invalid={invalid || undefined}
        onChange={(e) => onChange(e.currentTarget.value)}
      />
      {hint && <span className="note">{hint}</span>}
    </div>
  );
}

function SelectField<T extends string>({ label, value, onChange, children }: {
  label: string; value: T; onChange: (v: T) => void; children: ReactNode;
}) {
  const id = useId();
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <select id={id} value={value} onChange={(e) => onChange(e.currentTarget.value as T)}>
        {children}
      </select>
    </div>
  );
}

// ── The head's summary ─────────────────────────────────────────────────

/** Hands the open tool's totals up to the page head (design.md § Page head,
 *  slot 3) from the read that tool already makes, so the head never fetches
 *  for a tab that is not open: a placeholder while the first read is pending,
 *  nothing once it failed or the table is empty. Area and Fence read nothing,
 *  so they have no summary. */
function useHeadSummary(set: (s: ReactNode) => void, isLoading: boolean, isSample: boolean, line: string) {
  useLayoutEffect(() => {
    set(isLoading ? <Sk w="18rem" h="1rem" r="var(--radius-xs)" /> : isSample ? undefined : line || undefined);
    return () => set(undefined);
  }, [set, isLoading, isSample, line]);
}

// ── Find SRO ───────────────────────────────────────────────────────────

const SRO_NOUN = ['office', 'offices'] as const;
const GV_NOUN = ['government value', 'government values'] as const;
const rowId = (o: { id: string }) => o.id;

function SroTool({ onSummary }: { onSummary: (s: ReactNode) => void }) {
  const { data: offices, isSample, isLoading, error, refetch } = useSroOffices();
  // The directory's totals; a search narrows the card's count, not these.
  // The bundled AP-IGRS directory loads every office with a blank district
  // (main.py _load_reference_data), so a blank is not a district and none
  // drops the figure rather than claiming "1 district".
  const districts = new Set(offices.map((o) => o.district).filter(Boolean)).size;
  useHeadSummary(onSummary, isLoading, isSample, offices.length
    ? [plural(offices.length, 'SRO office'), districts ? plural(districts, 'district') : ''].filter(Boolean).join(' · ')
    : '');
  const [q, setQ] = useState('');
  const needle = q.trim().toLowerCase();
  const rows = needle
    ? offices.filter((o) =>
        [o.code, o.name, o.drZone, o.district, o.mandal].join(' ').toLowerCase().includes(needle),
      )
    : offices;
  const paged = usePaged(rows, { resetKey: needle, storeKey: 'pattadar.table.tools-sro' });
  const sel = useRowSelection(rows, rowId, needle);

  if (isLoading) {
    return (
      <section className="stack">
        <SectionHead title="SRO offices" info="The Sub-Registrar Office that serves your village." />
        <Sk w="min(36rem, 100%)" h="2.375rem" r="var(--radius-pill)" />
        <SkTable label="Loading the office directory" minWidth="36rem" rows={8}
                 cols={[{ head: 'Code', w: '3rem' }, { head: 'Office' }, { head: 'DR zone' }, { head: 'District' }, { head: 'Mandal' }]} />
      </section>
    );
  }
  // Branch on the failure first: an empty list after a failed read is not
  // "no offices match", and the owner has not searched for anything yet.
  if (isSample) return <Failed what="The office directory" error={error} onRetry={refetch} boxed />;

  return (
    <section className="stack">
      {/* The directory's totals are the page head's; the line under this
          heading only says what a search has narrowed it to (design.md
          § Page head, one level down). */}
      <SectionHead title="SRO offices" info="The Sub-Registrar Office that serves your village."
                   sub={needle && rows.length > 0 ? `${plural(rows.length, 'office')} found` : undefined} />
      <div className="search" style={{ justifySelf: 'start' }}>
        <SearchOutlined sx={{ fontSize: 16 }} aria-hidden />
        <input
          type="search" value={q} onChange={(e) => setQ(e.currentTarget.value)}
          placeholder="Search office, district, mandal…"
          aria-label="Search SRO offices"
        />
      </div>
      {offices.length === 0 ? (
        <Empty title="No SRO offices are listed yet" />
      ) : rows.length === 0 ? (
        <Empty title="No offices match">
          Try a district or mandal name — for example Guntur, Gannavaram or Kurnool.
        </Empty>
      ) : (<div>
        <Card flush className="scroll-x edgefade">
          <table className="rectable" aria-label="SRO offices" style={{ minWidth: '36rem' }}>
            <thead>
              <tr>
                <th className="selcol">
                  <SelectAllBox total={rows.length} picked={sel.picked.length} noun={SRO_NOUN} onToggle={sel.toggleAll} />
                </th>
                <th scope="col">Code</th>
                <th scope="col">Office</th>
                <th scope="col">DR zone</th>
                <th scope="col">District</th>
                <th scope="col">Mandal</th>
              </tr>
            </thead>
            <tbody>
              {paged.shown.map((o) => (
                <tr key={o.id} className={sel.selected.has(o.id) ? 'selected' : undefined}>
                  <SelectCell checked={sel.selected.has(o.id)} label={`Select ${o.name}`} onToggle={() => sel.toggle(o.id)} />
                  <td className="num">{o.code}</td>
                  <td><strong>{o.name}</strong></td>
                  <td>{o.drZone}</td>
                  <td>{o.district}</td>
                  <td>{o.mandal}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td className="selcol" />
                <th scope="row" colSpan={5}>
                  {sel.picked.length > 0
                    ? `${plural(sel.picked.length, ...SRO_NOUN)} selected`
                    : `Total · ${plural(rows.length, ...SRO_NOUN)}`}
                </th>
              </tr>
            </tfoot>
          </table>
        </Card>
        <TablePager {...paged} onSize={paged.setSize} label="SRO office pages" />
      </div>)}
      <SelectionBar count={sel.picked.length} noun={SRO_NOUN} label="Act on the selected offices" onClear={sel.clear}>
        <button type="button" className="btn sm" onClick={() => downloadCsv('sro-offices.csv', [
          ['Code', 'Office', 'DR zone', 'District', 'Mandal'],
          ...sel.picked.map((o) => [o.code, o.name, o.drZone, o.district, o.mandal]),
        ])}>
          <FileDownloadOutlined sx={{ fontSize: 15 }} /> Export
        </button>
      </SelectionBar>
    </section>
  );
}

// ── Stamp duty ─────────────────────────────────────────────────────────

interface DutyResult {
  deedType: string;
  consideration: number;
  marketValue: number;
  stampDuty: number;
  transferDuty: number;
  registrationFee: number;
  userCharges: number;
  total: number;
}

const deedLabel = (r: FeeScheduleRow) => `${r.natureEn} — ${r.regTypeEn}`;

function StampDutyTool({ onSummary }: { onSummary: (s: ReactNode) => void }) {
  const { data: fees, isSample, isLoading, error, refetch } = useFeeSchedule();
  useHeadSummary(onSummary, isLoading, isSample, fees.length ? plural(fees.length, 'AP deed type') : '');
  const [deedId, setDeedId] = useState('');
  const [consideration, setConsideration] = useState('');
  const [marketValue, setMarketValue] = useState('');
  const [result, setResult] = useState<DutyResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');
  const deedSelectId = useId();

  // One optgroup per registration type, so 115 rows read as a short list of
  // kinds with their natures under each rather than one undifferentiated run.
  const groups = useMemo(() => {
    const by = new Map<string, FeeScheduleRow[]>();
    for (const r of fees) {
      const list = by.get(r.regTypeEn) ?? [];
      list.push(r);
      by.set(r.regTypeEn, list);
    }
    return [...by.entries()];
  }, [fees]);
  const deed = fees.find((r) => r.id === deedId) ?? null;

  const calculate = async () => {
    const c = Number(consideration);
    const m = Number(marketValue);
    if (!deed || !(c >= 0) || !(m >= 0) || (!c && !m)) {
      setProblem('Choose a deed type and enter the amount in the deed and the government value.');
      return;
    }
    setProblem('');
    setBusy(true);
    try {
      const d = await gql<{ calculateStampDuty: DutyResult | null }>(
        'query($deedType: String!, $consideration: Float!, $marketValue: Float!) { calculateStampDuty(deedType: $deedType, consideration: $consideration, marketValue: $marketValue) { deedType consideration marketValue stampDuty transferDuty registrationFee userCharges total } }',
        { deedType: deed.id, consideration: c, marketValue: m },
      );
      if (!d?.calculateStampDuty) throw new Error('empty');
      setResult(d.calculateStampDuty);
    } catch {
      // Pure arithmetic on the row the owner chose — a read-only query, so
      // computing it here is not a retry of anything that changes state.
      const b = calcStampDuty(c, m, deed);
      setResult({
        deedType: deedLabel(deed),
        consideration: c,
        marketValue: m,
        stampDuty: b.stampDuty,
        transferDuty: b.transferDuty,
        registrationFee: b.registrationFee,
        userCharges: b.userCharges,
        total: b.total,
      });
    } finally {
      setBusy(false);
    }
  };

  if (isLoading) {
    // The form's own card and the idle answer box, so nothing moves when the
    // deed types land; only the boxes that need the schedule go grey.
    return (
      <div className="two">
        <div role="status" aria-busy="true" aria-label="Loading the fee schedule">
          <Card title="Stamp duty & fee calculator">
            <div className="stack" aria-hidden>
              {['Deed type', 'Amount in the deed (₹)', 'Government value (₹)'].map((l, i) => (
                <div key={l} className="field">
                  <Sk w="40%" /><Sk h="2.5rem" r="var(--radius-sm)" />
                  {i > 0 && <Sk w="55%" />}{/* the amount boxes' hint line */}
                </div>
              ))}
              <Sk h="2.5rem" r="var(--radius-pill)" />
            </div>
          </Card>
        </div>
        <Empty boxed title="Enter values, then choose Calculate">
          Duty is on the higher of the amount in the deed and the government value.
        </Empty>
      </div>
    );
  }
  // Without a schedule there are no rates to charge, so there is nothing this
  // tool can honestly compute. Say that, rather than offer an empty picker.
  if (isSample) return <Failed what="The AP fee schedule" error={error} onRetry={refetch} boxed />;
  if (fees.length === 0) {
    return (
      <Empty boxed title="No deed types are in the fee schedule yet">
        Stamp duty can be worked out once the AP fee schedule has been loaded.
      </Empty>
    );
  }

  return (
    <div className="two">
      <Card title="Stamp duty & fee calculator">
        <form
          className="stack"
          onSubmit={(e) => { e.preventDefault(); void calculate(); }}
          noValidate
        >
          <div className="field">
            <label htmlFor={deedSelectId}>Deed type</label>
            <select id={deedSelectId} value={deedId} onChange={(e) => setDeedId(e.currentTarget.value)}>
              <option value="">Choose one of {plural(fees.length, 'AP deed type')}</option>
              {groups.map(([type, rows]) => (
                <optgroup key={type} label={type}>
                  {rows.map((r) => (
                    <option key={r.id} value={r.id}>{deedLabel(r)}</option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>
          <NumField label="Amount in the deed (₹)" value={consideration} onChange={setConsideration}
                    placeholder="e.g. 5000000" hint="The sale price, also called the consideration" />
          <NumField label="Government value (₹)" value={marketValue} onChange={setMarketValue}
                    placeholder="e.g. 6000000" hint="Also called market or guideline value" />
          {problem && <p className="note" role="alert" style={{ color: 'var(--w-danger)', margin: 0 }}>{problem}</p>}
          <button type="submit" className="btn primary" disabled={busy} style={{ justifyContent: 'center' }}>
            {busy ? 'Calculating…' : 'Calculate'}
          </button>
        </form>
      </Card>

      {result ? (
        <Card title="Duty & fee breakup" busy={busy}>
          <dl className="kv">
            <div><dt>Deed type</dt><dd>{result.deedType.replace(/_/g, ' ')}</dd></div>
            <div><dt>Amount in the deed</dt><dd>{formatINR(result.consideration)}</dd></div>
            <div><dt>Government value</dt><dd>{formatINR(result.marketValue)}</dd></div>
            <div><dt>Stamp duty</dt><dd>{formatINR(result.stampDuty)}</dd></div>
            <div><dt>Transfer duty</dt><dd>{formatINR(result.transferDuty)}</dd></div>
            <div><dt>Registration fee</dt><dd>{formatINR(result.registrationFee)}</dd></div>
            <div><dt>User charges</dt><dd>{formatINR(result.userCharges)}</dd></div>
            <div className="hl"><dt><strong>Total</strong></dt><dd><strong>{formatINR(result.total)}</strong></dd></div>
          </dl>
          <p className="note" style={{ marginTop: 'var(--space-md)' }}>
            Online stamp-duty payment is not available yet.
          </p>
        </Card>
      ) : (
        <Empty boxed title="Enter values, then choose Calculate">
          Duty is on the higher of the amount in the deed and the government value.
        </Empty>
      )}
    </div>
  );
}

// ── Market value ───────────────────────────────────────────────────────

const ALL = '__all__';

function MarketValueTool({ onSummary }: { onSummary: (s: ReactNode) => void }) {
  const { data: rows, isSample, isLoading, error, refetch } = useMarketValues();
  // Totals over every row, not the cascade's; a village name recurs across
  // mandals, so a village is counted by its whole place.
  useHeadSummary(onSummary, isLoading, isSample, rows.length
    ? `${plural(rows.length, 'government value')} · ${plural(new Set(rows.map((r) => `${r.district}|${r.mandal}|${r.village}`)).size, 'village')}`
    : '');
  const [district, setDistrict] = useState(ALL);
  const [mandal, setMandal] = useState(ALL);
  const [village, setVillage] = useState(ALL);

  const districts = useMemo(() => [...new Set(rows.map((r) => r.district))].sort(), [rows]);
  const mandals = useMemo(
    () => [...new Set(rows.filter((r) => district === ALL || r.district === district).map((r) => r.mandal))].sort(),
    [rows, district],
  );
  const villages = useMemo(
    () =>
      [
        ...new Set(
          rows
            .filter((r) => (district === ALL || r.district === district) && (mandal === ALL || r.mandal === mandal))
            .map((r) => r.village),
        ),
      ].sort(),
    [rows, district, mandal],
  );
  const [sort, setSort] = useState<SortState<'rate'>>(null);
  const shown = rows.filter(
    (r) =>
      (district === ALL || r.district === district) &&
      (mandal === ALL || r.mandal === mandal) &&
      (village === ALL || r.village === village),
  );

  const paged = usePaged(sortBy(shown, sort, { rate: (r) => r.ratePerUnit }), {
    resetKey: `${district}|${mandal}|${village}|${sort?.key ?? ''}${sort?.dir ?? ''}`,
    storeKey: 'pattadar.table.tools-government-values',
  });
  // The picks narrow the list; a sort only reorders it, so it keeps the ticks.
  const sel = useRowSelection(shown, rowId, `${district}|${mandal}|${village}`);

  if (isLoading) {
    return (
      <section className="stack">
        <SectionHead title="Government values"
                     info="Government values (also called market or guideline values) from AP Registration & Stamps. Sale prices can differ." />
        <div className="toolfields" aria-hidden>
          {['District', 'Mandal', 'Village'].map((l) => (
            <div key={l} className="field"><Sk w="40%" /><Sk h="2.5rem" r="var(--radius-sm)" /></div>
          ))}
        </div>
        <SkTable label="Loading government values" minWidth="48rem" rows={8}
                 cols={[{ head: 'District' }, { head: 'Mandal' }, { head: 'Village' }, { head: 'Classification' },
                   { head: 'Rate / unit (₹)', right: true, w: '5rem' }, { head: 'Unit', w: '3rem' }, { head: 'Effective from', w: '5.5rem' }]} />
      </section>
    );
  }
  if (isSample) return <Failed what="The government values" error={error} onRetry={refetch} boxed />;

  const options = (list: string[], allLabel: string) => (
    <>
      <option value={ALL}>{allLabel}</option>
      {list.map((o) => <option key={o} value={o}>{o}</option>)}
    </>
  );

  return (
    <section className="stack">
      {/* The page head carries the totals; the line here is only what the
          district / mandal / village choice has narrowed the table to. */}
      <SectionHead title="Government values"
                   info="Government values (also called market or guideline values) from AP Registration & Stamps. Sale prices can differ."
                   sub={shown.length > 0 && shown.length < rows.length ? `${plural(shown.length, 'government value')} for this selection` : undefined} />

      <div className="toolfields">
        <SelectField label="District" value={district}
                     onChange={(v) => { setDistrict(v); setMandal(ALL); setVillage(ALL); }}>
          {options(districts, 'All districts')}
        </SelectField>
        <SelectField label="Mandal" value={mandal} onChange={(v) => { setMandal(v); setVillage(ALL); }}>
          {options(mandals, 'All mandals')}
        </SelectField>
        <SelectField label="Village" value={village} onChange={setVillage}>
          {options(villages, 'All villages')}
        </SelectField>
      </div>

      {village !== ALL && shown.length > 0 && (
        <div className="strip">
          {shown.map((r) => (
            <div key={r.id}>
              <span className="k">{r.classification}</span>
              <span className="v">₹{formatNumberIN(r.ratePerUnit)}<small> / {r.unit}</small></span>
              <span className="s">{r.village}, {r.mandal} · effective {parseISOToDisplay(r.effectiveFrom)}</span>
            </div>
          ))}
        </div>
      )}

      <div>
        <Card flush className="scroll-x edgefade">
          <table className="rectable" aria-label="Government values" style={{ minWidth: '48rem' }}>
            <thead>
              <tr>
                <th className="selcol">
                  <SelectAllBox total={shown.length} picked={sel.picked.length} noun={GV_NOUN} onToggle={sel.toggleAll} />
                </th>
                <th scope="col">District</th>
                <th scope="col">Mandal</th>
                <th scope="col">Village</th>
                <th scope="col">Classification</th>
                <Th k="rate" label="Rate / unit (₹)" right sort={sort} setSort={setSort} />
                <th scope="col">Unit</th>
                <th scope="col">Effective from</th>
              </tr>
            </thead>
            <tbody>
              {paged.shown.map((r) => (
                <tr key={r.id} className={sel.selected.has(r.id) ? 'selected' : undefined}>
                  <SelectCell checked={sel.selected.has(r.id)} label={`Select ${r.village} ${r.classification}`}
                              onToggle={() => sel.toggle(r.id)} />
                  <td>{r.district}</td>
                  <td>{r.mandal}</td>
                  <td>{r.village}</td>
                  <td>{r.classification}</td>
                  <td className="right num">₹{formatNumberIN(r.ratePerUnit)}</td>
                  <td>{r.unit}</td>
                  <td className="num" style={{ whiteSpace: 'nowrap' }}>{parseISOToDisplay(r.effectiveFrom)}</td>
                </tr>
              ))}
              {shown.length === 0 && (
                <tr>
                  <td colSpan={8} className="note" style={{ textAlign: 'center', padding: 'var(--space-lg)' }}>
                    {rows.length === 0 ? 'No government values have been published yet.' : 'No government values match this selection.'}
                  </td>
                </tr>
              )}
            </tbody>
            {/* Rates are per different units, so nothing sums; the count is the point. */}
            <tfoot>
              <tr>
                <td className="selcol" />
                <th scope="row" colSpan={7}>
                  {sel.picked.length > 0
                    ? `${plural(sel.picked.length, ...GV_NOUN)} selected`
                    : `Total · ${plural(shown.length, ...GV_NOUN)}`}
                </th>
              </tr>
            </tfoot>
          </table>
        </Card>
        <TablePager {...paged} onSize={paged.setSize} label="Government value pages" />
      </div>
      <SelectionBar count={sel.picked.length} noun={GV_NOUN} label="Act on the selected government values" onClear={sel.clear}>
        <button type="button" className="btn sm" onClick={() => downloadCsv('government-values.csv', [
          ['District', 'Mandal', 'Village', 'Classification', 'Rate / unit (₹)', 'Unit', 'Effective from'],
          ...sel.picked.map((r) => [r.district, r.mandal, r.village, r.classification, r.ratePerUnit, r.unit,
            parseISOToDisplay(r.effectiveFrom)]),
        ])}>
          <FileDownloadOutlined sx={{ fontSize: 15 }} /> Export
        </button>
      </SelectionBar>
    </section>
  );
}

// ── Area calculator ────────────────────────────────────────────────────

/** The acres + cents readout and every unit for the same acreage. */
function AreaResult({ acres, title }: { acres: number; title?: string }) {
  const rows = useMemo(() => acresToAll(acres), [acres]);
  return (
    <section className="card pad-lg" style={{ marginTop: 'var(--space-md)' }} aria-label={title || 'Area'}>
      <p className="eyebrow">{title || 'Area'}</p>
      <p className="num" style={{ fontSize: '1.25rem', margin: '0 0 var(--space-sm)' }}>{formatArea(acres)}</p>
      <table>
        <tbody>
          {rows.map((u) => (
            <tr key={u.key}>
              <td className="muted">{u.label}</td>
              <td className="num" style={{ textAlign: 'right' }}>{round2(u.value).toLocaleString('en-IN')}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function UsePerimeter({ perimFt, sidesM, onUse, extra }: {
  perimFt: number; sidesM: number[]; onUse: (m: number[]) => void; extra?: string;
}) {
  if (!(perimFt > 0)) return null;
  return (
    <div className="row" style={{ marginTop: 'var(--space-sm)' }}>
      <span className="note">
        Perimeter ≈ {round2(perimFt).toLocaleString('en-IN')} ft{extra ? ` (${extra})` : ''}
      </span>
      <button type="button" className="btn sm" onClick={() => onUse(sidesM)}>Use in Fence calculator →</button>
    </div>
  );
}

function ConverterTab() {
  const [value, setValue] = useState('1');
  const [unit, setUnit] = useState<UnitKey>('acre');
  const amount = Number(value) || 0;
  const acres = toAcres(amount, unit);
  return (
    <>
      <div className="toolfields">
        <NumField label="Amount" value={value} onChange={setValue} />
        <SelectField label="Unit" value={unit} onChange={setUnit}>
          {UNITS.map((u) => <option key={u.key} value={u.key}>{u.label}</option>)}
        </SelectField>
      </div>
      {/* The unit agrees with the amount ("1 Acre =", "2 Acres ="), the way
          formatArea writes the value under it. */}
      <AreaResult acres={acres} title={`${amount} ${unitLabelFor(amount, unit)} =`} />
    </>
  );
}

type Shape = 'rect' | 'tri' | 'quad';

function PlotAreaTab({ onUseSides }: { onUseSides: (m: number[]) => void }) {
  const [shape, setShape] = useState<Shape>('rect');
  const [lu, setLu] = useState<LengthUnit>('ft');
  const [d, setD] = useState<Record<string, string>>({});
  const ft = (k: string) => toFeet(Number(d[k]) || 0, lu);

  const sqft =
    shape === 'rect'
      ? rectangleSqft(ft('len'), ft('wid'))
      : shape === 'tri'
        ? triangleSqft(ft('a'), ft('b'), ft('c'))
        : quadrilateralSqft(ft('s1'), ft('s2'), ft('s3'), ft('s4'), ft('diag'));
  const perimFt =
    shape === 'rect'
      ? 2 * (ft('len') + ft('wid'))
      : shape === 'tri'
        ? ft('a') + ft('b') + ft('c')
        : ft('s1') + ft('s2') + ft('s3') + ft('s4');
  // The same sides in metres for the Fence tab; the diagonal is not a side.
  const m = (k: string) => ft(k) / LENGTH_FT.m;
  const sidesM =
    shape === 'rect'
      ? [m('len'), m('wid'), m('len'), m('wid')]
      : shape === 'tri'
        ? [m('a'), m('b'), m('c')]
        : [m('s1'), m('s2'), m('s3'), m('s4')];

  const side = (k: string, label: string) => (
    <NumField key={k} label={label} value={d[k] ?? ''} onChange={(v) => setD((p) => ({ ...p, [k]: v }))} />
  );
  const SHAPES: SegmentOption<Shape>[] = [
    { value: 'rect', label: 'Rectangle' },
    { value: 'tri', label: 'Triangle' },
    { value: 'quad', label: 'Quadrilateral' },
  ];

  return (
    <>
      <div className="row" style={{ marginBottom: 'var(--space-md)', alignItems: 'flex-end', gap: 'var(--space-md)' }}>
        <Segmented label="Plot shape" options={SHAPES} value={shape} onChange={setShape} />
        <div style={{ minWidth: '10rem' }}>
          <SelectField label="Measured in" value={lu} onChange={setLu}>
            {LENGTH_UNITS.map((u) => <option key={u.key} value={u.key}>{u.label}</option>)}
          </SelectField>
        </div>
      </div>
      <div className="toolfields">
        {shape === 'rect' && [side('len', 'Length'), side('wid', 'Width')]}
        {shape === 'tri' && [side('a', 'Side A'), side('b', 'Side B'), side('c', 'Side C')]}
        {shape === 'quad' && [
          side('s1', 'Side 1'), side('s2', 'Side 2'), side('s3', 'Side 3'), side('s4', 'Side 4'),
          side('diag', 'Diagonal (corner 1→3)'),
        ]}
      </div>
      <AreaResult acres={sqft / 43560} />
      <UsePerimeter perimFt={perimFt} sidesM={sidesM} onUse={onUseSides} />
    </>
  );
}

function MapAreaTab({ onUseSides }: { onUseSides: (m: number[]) => void }) {
  const [geo, setGeo] = useState('');
  const id = useId();
  const ring = useMemo(() => parsePolygonRing(geo), [geo]);
  const perimM = ringPerimM(ring);
  const sidesM = useMemo(() => ringSides(ring).map((s) => s.metres), [ring]);
  return (
    <>
      <div className="field">
        <label htmlFor={id}>Boundary as GeoJSON</label>
        <textarea
          id={id} rows={5} value={geo} onChange={(e) => setGeo(e.currentTarget.value)}
          className="mono" spellCheck={false}
          placeholder='{"type":"Polygon","coordinates":[[[80.648,16.506],[80.650,16.506],[80.650,16.508],[80.648,16.508],[80.648,16.506]]]}'
        />
      </div>
      <p className="note" style={{ margin: 'var(--space-xs) 0 0' }}>
        A Polygon of [longitude, latitude] corners, from any GPS or mapping tool, or a parcel&apos;s saved location.
      </p>
      {ring.length >= 3 ? (
        <>
          <AreaResult acres={ringAreaSqM(ring) / 4046.8564} />
          <UsePerimeter perimFt={perimM * 3.280839895} sidesM={sidesM} onUse={onUseSides}
                        extra={`${round2(perimM).toLocaleString('en-IN')} m`} />
        </>
      ) : (
        <p className="note" style={{ marginTop: 'var(--space-sm)' }}>Add at least 3 points to compute an area.</p>
      )}
    </>
  );
}

type CalcTab = 'convert' | 'plot' | 'map';
const CALC_TABS: { id: CalcTab; label: string }[] = [
  { id: 'convert', label: 'Unit converter' },
  { id: 'plot', label: 'Plot area' },
  { id: 'map', label: 'Map area' },
];

function CalculatorTool({ onUseSides }: { onUseSides: (m: number[]) => void }) {
  const [tab, setTab] = useState<CalcTab>('convert');
  const idBase = useId();
  return (
    <Card title="Area calculator">
      <p className="note" style={{ margin: '0 0 var(--space-md)' }}>
        Unit conversion, plot measurement and boundary area.
      </p>
      <TabStrip tabs={CALC_TABS} value={tab} onChange={setTab} label="Area calculator" idBase={idBase} />
      <TabPanel idBase={idBase} id={tab}>
        {tab === 'convert' ? (
          <ConverterTab />
        ) : tab === 'plot' ? (
          <PlotAreaTab onUseSides={onUseSides} />
        ) : (
          <MapAreaTab onUseSides={onUseSides} />
        )}
      </TabPanel>
    </Card>
  );
}

// ── Fence calculator ───────────────────────────────────────────────────

/** Four sides is a plot; the owner adds or removes from there. */
const FOUR_SIDES = ['', '', '', ''];

/** The village-map fence calculator, without the map: the sides are typed
 *  rather than traced. Steps 2 and 3, the sheet and every sum are the studio's
 *  own (FenceParts.tsx, fenceBill.ts), and the build and rates are remembered
 *  under the same key, so the two cannot price the same fence differently.
 *  There is no record here, so nothing to raise the work against — it prints. */
function FenceTool({ initial }: { initial?: string[] }) {
  const [sides, setSides] = useState<string[]>(initial ?? FOUR_SIDES);
  const [closed, setClosed] = useState(true);
  const [build, setField] = useFenceBuild();
  const closedId = useId();

  // A blank box is a side not entered yet; anything else must be a length.
  const metres = sides.map((v) => (v.trim() === '' ? null : Number(v)));
  const bad = metres.map((m) => m !== null && !(Number.isFinite(m) && m > 0));
  const kept = metres.filter((m, i): m is number => m !== null && !bad[i]);
  const bill = fenceBill(kept, closed, build);
  const name = (i: number) => sideName(i, sides.length, closed);
  // The sheet calls each side what its row calls it, blank rows skipped.
  const keptNames = sides.map((_, i) => name(i)).filter((_, i) => metres[i] !== null && !bad[i]);
  // A refused side would be missing from the sheet with nothing saying so.
  const invalid = bad.some(Boolean);

  const setSide = (i: number, v: string) => setSides((s) => s.map((x, j) => (j === i ? v : x)));
  const removeSide = (i: number) => setSides((s) => s.filter((_, j) => j !== i));

  const actions = (
    <>
      <div className="row tight" style={{ marginTop: 'var(--space-sm)' }}>
        <button type="button" className="btn sm" disabled={kept.length === 0 || invalid}
                onClick={() => window.print()}>
          <PrintOutlined sx={{ fontSize: 15 }} /> Print for the supplier
        </button>
        <button type="button" className="btn sm" onClick={() => setSides(FOUR_SIDES)}>
          Clear
        </button>
      </div>
      <p className="note" style={{ marginTop: 'var(--space-sm)' }}>
        Add this plot as a property to order the fencing as a service order.
      </p>
    </>
  );

  return (
    <div className="fs-tool">
      <div className="two">
        <Card title="Fence calculator">
          <div className="fs-steps">
            <section>
              <p className="eyebrow">Step 1 · What you are fencing</p>
              {sides.map((v, i) => (
                <div className="fs-siderow" key={i}>
                  <NumField label={`Side ${name(i)} (m)`} value={v} invalid={bad[i]}
                            onChange={(x) => setSide(i, x)} />
                  <button type="button" className="btn sm" aria-label={`Remove side ${name(i)}`}
                          disabled={sides.length <= 1} onClick={() => removeSide(i)}>
                    <CloseOutlined sx={{ fontSize: 15 }} />
                  </button>
                </div>
              ))}
              {invalid && (
                <p className="note" role="alert" style={{ color: 'var(--w-danger)', margin: 0 }}>
                  Enter each side as a length in metres, more than 0.
                </p>
              )}
              <div className="row tight">
                <button type="button" className="btn sm" onClick={() => setSides((s) => [...s, ''])}>
                  Add a side
                </button>
              </div>
              <label className="check" htmlFor={closedId}>
                <input id={closedId} type="checkbox" checked={closed}
                       onChange={(e) => setClosed(e.currentTarget.checked)} />
                The fence goes all the way round
              </label>
              <p className="note">
                {plural(kept.length, 'side')} ·{' '}
                <strong className="num">{num(bill.plan.perimeter, 1)} m</strong> to fence.
              </p>
            </section>

            <FenceBuildFields build={build} set={setField} idBase="fence-tool" />
          </div>
        </Card>

        <Card title="What it comes to">
          {kept.length === 0 ? (
            <>
              <Empty title="Enter the length of each side to price a fence" />
              {actions}
            </>
          ) : (
            <FenceBillTable bill={bill} build={build}>{actions}</FenceBillTable>
          )}
        </Card>
      </div>

      <FenceSheet sides={kept} names={keptNames} dropped={NONE_DROPPED}
                  closed={closed} bill={bill} build={build} />
    </div>
  );
}

/** Typed sides are all fenced: a side you are not fencing is not entered. */
const NONE_DROPPED = new Set<number>();

// ── The page ───────────────────────────────────────────────────────────

type ToolTab = 'sro' | 'stamp-duty' | 'market-value' | 'calculator' | 'fence';
const TOOL_TABS: { id: ToolTab; label: string }[] = [
  { id: 'sro', label: 'SRO finder' },
  { id: 'stamp-duty', label: 'Stamp duty' },
  { id: 'market-value', label: 'Government value' },
  { id: 'calculator', label: 'Area calculator' },
  { id: 'fence', label: 'Fence calculator' },
];
const isToolTab = (v: string | null): v is ToolTab => TOOL_TABS.some((t) => t.id === v);

export function Tools() {
  const [params, setParams] = useSearchParams();
  const raw = params.get('tab');
  // An unknown ?tab= falls back to the directory rather than a blank panel.
  const tab: ToolTab = isToolTab(raw) ? raw : 'sro';
  const choose = (t: ToolTab) => setParams({ tab: t }, { replace: true });
  // Plot area / Map area hand their sides (metres) to the Fence tab; a new
  // key starts the fence tool afresh from them. A blank or zero side goes in
  // as a blank box ("not entered"), never as a 0 m side.
  const [fenceSeed, setFenceSeed] = useState<{ n: number; sides: string[] } | null>(null);
  // Set by the open tool from its own read (useHeadSummary).
  const [summary, setSummary] = useState<ReactNode>();
  const handOffSides = (m: number[]) => {
    setFenceSeed((s) => ({ n: (s?.n ?? 0) + 1, sides: m.map((v) => (v > 0 ? String(round2(v)) : '')) }));
    choose('fence');
  };

  return (
    <main>
      <PageHead title="Tools" summary={summary}
                tabs={<TabStrip tabs={TOOL_TABS} value={tab} onChange={choose} label="Tools" idBase="tools" />} />
      <TabPanel idBase="tools" id={tab}>
        {tab === 'sro' ? (
          <SroTool onSummary={setSummary} />
        ) : tab === 'stamp-duty' ? (
          <StampDutyTool onSummary={setSummary} />
        ) : tab === 'market-value' ? (
          <MarketValueTool onSummary={setSummary} />
        ) : tab === 'fence' ? (
          <FenceTool key={fenceSeed?.n ?? 0} initial={fenceSeed?.sides} />
        ) : (
          <CalculatorTool onUseSides={handOffSides} />
        )}
      </TabPanel>
    </main>
  );
}
