/** Tools — the four land utilities, drawn in this app (the redrawn /app/tools).
 *
 *  This replaces the "still in the previous version" signpost and the MUI
 *  screen it pointed at (pages/ToolsPage.tsx + pages/tools/*, now deleted).
 *  Same four tools, same arithmetic, same reads:
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
 *                     area, fencing, and area from a pasted GeoJSON ring.
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
import { useId, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent, ReactNode } from 'react';
import { useSearchParams } from 'react-router';
import SearchOutlined from '@mui/icons-material/SearchOutlined';

import {
  LENGTH_UNITS,
  UNITS,
  acresToAll,
  calcStampDuty,
  fenceEstimate,
  formatArea,
  formatINR,
  formatNumberIN,
  parseISOToDisplay,
  parsePolygonRing,
  quadrilateralSqft,
  rectangleSqft,
  ringAreaSqM,
  ringPerimM,
  round2,
  toAcres,
  toFeet,
  triangleSqft,
  unitLabelFor,
} from '@pattadar/core';
import type { FeeScheduleRow, LengthUnit, UnitKey } from '@pattadar/core';

import { gql } from '../../api/client';
import { useFeeSchedule, useMarketValues, useSroOffices } from '../../data/hooks';
import { Card, Empty, Failed, Loading, PageHead, plural } from '../ui';

// ── Tab strip ──────────────────────────────────────────────────────────

/** A real tab list: `aria-selected`, one tab stop, Arrow/Home/End between
 *  tabs — the same contract as the Families & Groups strip. The stylesheet
 *  keys `.tabs [aria-selected='true']`, which is only valid inside
 *  `role="tablist"`, so the role comes with its keyboard behaviour. */
function TabStrip<T extends string>({
  tabs, value, onChange, label, idBase,
}: {
  tabs: { id: T; label: string }[];
  value: T;
  onChange: (id: T) => void;
  label: string;
  idBase: string;
}) {
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});
  const onKeyDown = (e: KeyboardEvent) => {
    const at = tabs.findIndex((t) => t.id === value);
    let to = -1;
    if (e.key === 'ArrowRight') to = (at + 1) % tabs.length;
    else if (e.key === 'ArrowLeft') to = (at - 1 + tabs.length) % tabs.length;
    else if (e.key === 'Home') to = 0;
    else if (e.key === 'End') to = tabs.length - 1;
    if (to < 0) return;
    e.preventDefault();
    onChange(tabs[to].id);
    refs.current[tabs[to].id]?.focus();
  };
  return (
    <div className="tabs" role="tablist" aria-label={label} onKeyDown={onKeyDown}>
      {tabs.map((t) => (
        <button
          key={t.id}
          type="button"
          role="tab"
          id={`${idBase}-tab-${t.id}`}
          aria-controls={`${idBase}-panel-${t.id}`}
          aria-selected={t.id === value}
          tabIndex={t.id === value ? 0 : -1}
          ref={(el) => { refs.current[t.id] = el; }}
          onClick={() => onChange(t.id)}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

function Panel({ idBase, id, children }: { idBase: string; id: string; children: ReactNode }) {
  return (
    <div role="tabpanel" id={`${idBase}-panel-${id}`} aria-labelledby={`${idBase}-tab-${id}`}>
      {children}
    </div>
  );
}

// ── Small form atoms ───────────────────────────────────────────────────

/** A labelled number box. Labels are real `<label for>` so the field is named
 *  by what it asks for, not by its placeholder. */
function NumField({ label, value, onChange, placeholder }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string;
}) {
  const id = useId();
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <input
        id={id} type="number" inputMode="decimal" value={value} placeholder={placeholder}
        onChange={(e) => onChange(e.currentTarget.value)}
      />
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

// ── Find SRO ───────────────────────────────────────────────────────────

function SroTool() {
  const { data: offices, isSample, isLoading, error, refetch } = useSroOffices();
  const [q, setQ] = useState('');
  const needle = q.trim().toLowerCase();
  const rows = needle
    ? offices.filter((o) =>
        [o.code, o.name, o.drZone, o.district, o.mandal].join(' ').toLowerCase().includes(needle),
      )
    : offices;

  if (isLoading) return <Loading h="16rem" what="the office directory" />;
  // Branch on the failure first: an empty list after a failed read is not
  // "no offices match", and the owner has not searched for anything yet.
  if (isSample) return <Failed what="The office directory" error={error} onRetry={refetch} boxed />;

  return (
    <Card
      title="SRO offices"
      aside={<span className="num muted">{rows.length}</span>}
    >
      <p className="note" style={{ margin: '0 0 var(--space-md)' }}>
        The Sub-Registrar Office that serves your village.
      </p>
      <div className="search" style={{ marginBottom: 'var(--space-md)' }}>
        <SearchOutlined sx={{ fontSize: 16 }} aria-hidden />
        <input
          type="text" value={q} onChange={(e) => setQ(e.currentTarget.value)}
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
      ) : (
        <div className="scroll-x">
          <table>
            <thead>
              <tr>
                <th scope="col">Code</th>
                <th scope="col">Office</th>
                <th scope="col">DR zone</th>
                <th scope="col">District</th>
                <th scope="col">Mandal</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((o) => (
                <tr key={o.id}>
                  <td className="num">{o.code}</td>
                  <td><strong>{o.name}</strong></td>
                  <td>{o.drZone}</td>
                  <td>{o.district}</td>
                  <td>{o.mandal}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
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

function StampDutyTool() {
  const { data: fees, isSample, isLoading, error, refetch } = useFeeSchedule();
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
      setProblem('Pick a deed type and enter the consideration and market value.');
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

  if (isLoading) return <Loading h="16rem" what="the fee schedule" />;
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
          <NumField label="Consideration amount (₹)" value={consideration} onChange={setConsideration}
                    placeholder="e.g. 5000000" />
          <NumField label="Market / guideline value (₹)" value={marketValue} onChange={setMarketValue}
                    placeholder="e.g. 6000000" />
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
            <div><dt>Consideration</dt><dd>{formatINR(result.consideration)}</dd></div>
            <div><dt>Market value</dt><dd>{formatINR(result.marketValue)}</dd></div>
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
        <Empty boxed title="Enter values and click Calculate">
          Duty is on the higher of the sale price and the guideline value.
        </Empty>
      )}
    </div>
  );
}

// ── Market value ───────────────────────────────────────────────────────

const ALL = '__all__';

function MarketValueTool() {
  const { data: rows, isSample, isLoading, error, refetch } = useMarketValues();
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
  const shown = rows.filter(
    (r) =>
      (district === ALL || r.district === district) &&
      (mandal === ALL || r.mandal === mandal) &&
      (village === ALL || r.village === village),
  );

  if (isLoading) return <Loading h="16rem" what="guideline rates" />;
  if (isSample) return <Failed what="The guideline rates" error={error} onRetry={refetch} boxed />;

  const options = (list: string[], allLabel: string) => (
    <>
      <option value={ALL}>{allLabel}</option>
      {list.map((o) => <option key={o} value={o}>{o}</option>)}
    </>
  );

  return (
    <div className="stack">
      <p className="note" style={{ margin: 0 }}>
        Guideline values from AP Registration &amp; Stamps. Market prices can differ.
      </p>

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

      <section className="card" style={{ padding: 'var(--space-md)' }} aria-label="Guideline rates">
        <div className="scroll-x">
          <table>
            <thead>
              <tr>
                <th scope="col">District</th>
                <th scope="col">Mandal</th>
                <th scope="col">Village</th>
                <th scope="col">Classification</th>
                <th scope="col" style={{ textAlign: 'right' }}>Rate / unit (₹)</th>
                <th scope="col">Unit</th>
                <th scope="col">Effective from</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => (
                <tr key={r.id}>
                  <td>{r.district}</td>
                  <td>{r.mandal}</td>
                  <td>{r.village}</td>
                  <td>{r.classification}</td>
                  <td className="num" style={{ textAlign: 'right' }}>₹{formatNumberIN(r.ratePerUnit)}</td>
                  <td>{r.unit}</td>
                  <td className="num" style={{ whiteSpace: 'nowrap' }}>{parseISOToDisplay(r.effectiveFrom)}</td>
                </tr>
              ))}
              {shown.length === 0 && (
                <tr>
                  <td colSpan={7} className="note" style={{ textAlign: 'center', padding: 'var(--space-lg)' }}>
                    {rows.length === 0 ? 'No guideline rates have been published yet.' : 'No guideline rates match this selection.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
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

function UsePerimeter({ perimFt, onUse, extra }: { perimFt: number; onUse: (ft: number) => void; extra?: string }) {
  if (!(perimFt > 0)) return null;
  return (
    <div className="row" style={{ marginTop: 'var(--space-sm)' }}>
      <span className="note">
        Perimeter ≈ {round2(perimFt).toLocaleString('en-IN')} ft{extra ? ` (${extra})` : ''}
      </span>
      <button type="button" className="btn sm" onClick={() => onUse(perimFt)}>Use in Fencing →</button>
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

function PlotAreaTab({ onUsePerimeter }: { onUsePerimeter: (ft: number) => void }) {
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

  const side = (k: string, label: string) => (
    <NumField key={k} label={label} value={d[k] ?? ''} onChange={(v) => setD((p) => ({ ...p, [k]: v }))} />
  );
  const SHAPES: { id: Shape; label: string }[] = [
    { id: 'rect', label: 'Rectangle' },
    { id: 'tri', label: 'Triangle' },
    { id: 'quad', label: 'Quadrilateral' },
  ];

  return (
    <>
      <div className="row" style={{ marginBottom: 'var(--space-md)', alignItems: 'flex-end', gap: 'var(--space-md)' }}>
        <div className="segmented" role="group" aria-label="Plot shape">
          {SHAPES.map((s) => (
            <button key={s.id} type="button" aria-pressed={shape === s.id} onClick={() => setShape(s.id)}>
              {s.label}
            </button>
          ))}
        </div>
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
      <UsePerimeter perimFt={perimFt} onUse={onUsePerimeter} />
    </>
  );
}

function FencingTab({ perimeterFt }: { perimeterFt: number }) {
  const [perimeter, setPerimeter] = useState(perimeterFt > 0 ? String(round2(perimeterFt)) : '');
  const [spacing, setSpacing] = useState('8');
  const [strands, setStrands] = useState('3');
  const [costPost, setCostPost] = useState('');
  const [costWire, setCostWire] = useState('');
  const r = fenceEstimate(
    Number(perimeter) || 0,
    Number(spacing) || 0,
    Number(strands) || 0,
    Number(costPost) || 0,
    Number(costWire) || 0,
  );
  return (
    <>
      <div className="toolfields">
        <NumField label="Perimeter (ft)" value={perimeter} onChange={setPerimeter} />
        <NumField label="Post spacing (ft)" value={spacing} onChange={setSpacing} />
        <NumField label="Wire strands / rails" value={strands} onChange={setStrands} />
        <NumField label="Cost per post (₹)" value={costPost} onChange={setCostPost} />
        <NumField label="Cost per ft wire (₹)" value={costWire} onChange={setCostWire} />
      </div>
      <div className="strip" style={{ marginTop: 'var(--space-md)' }}>
        <div><span className="k">Posts</span><span className="v">{r.posts}</span></div>
        <div><span className="k">Wire length (ft)</span><span className="v">{round2(r.wire).toLocaleString('en-IN')}</span></div>
        <div>
          <span className="k">Est. cost</span>
          <span className="v">{r.cost > 0 ? `₹${round2(r.cost).toLocaleString('en-IN')}` : '—'}</span>
        </div>
      </div>
    </>
  );
}

function MapAreaTab({ onUsePerimeter }: { onUsePerimeter: (ft: number) => void }) {
  const [geo, setGeo] = useState('');
  const id = useId();
  const ring = useMemo(() => parsePolygonRing(geo), [geo]);
  const perimM = ringPerimM(ring);
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
          <UsePerimeter perimFt={perimM * 3.280839895} onUse={onUsePerimeter}
                        extra={`${round2(perimM).toLocaleString('en-IN')} m`} />
        </>
      ) : (
        <p className="note" style={{ marginTop: 'var(--space-sm)' }}>Add at least 3 points to compute an area.</p>
      )}
    </>
  );
}

type CalcTab = 'convert' | 'plot' | 'fence' | 'map';
const CALC_TABS: { id: CalcTab; label: string }[] = [
  { id: 'convert', label: 'Unit converter' },
  { id: 'plot', label: 'Plot area' },
  { id: 'fence', label: 'Fencing' },
  { id: 'map', label: 'Map area' },
];

function CalculatorTool() {
  const [tab, setTab] = useState<CalcTab>('convert');
  const [perimeterFt, setPerimeterFt] = useState(0);
  const idBase = useId();
  const usePerimeter = (ftVal: number) => {
    setPerimeterFt(ftVal);
    setTab('fence');
  };
  return (
    <Card title="Area calculator">
      <p className="note" style={{ margin: '0 0 var(--space-md)' }}>
        Unit conversion, plot measurement, fencing estimates and boundary area.
      </p>
      <TabStrip tabs={CALC_TABS} value={tab} onChange={setTab} label="Area calculator" idBase={idBase} />
      <Panel idBase={idBase} id={tab}>
        {tab === 'convert' ? (
          <ConverterTab />
        ) : tab === 'plot' ? (
          <PlotAreaTab onUsePerimeter={usePerimeter} />
        ) : tab === 'fence' ? (
          <FencingTab key={perimeterFt} perimeterFt={perimeterFt} />
        ) : (
          <MapAreaTab onUsePerimeter={usePerimeter} />
        )}
      </Panel>
    </Card>
  );
}

// ── The page ───────────────────────────────────────────────────────────

type ToolTab = 'sro' | 'stamp-duty' | 'market-value' | 'calculator';
const TOOL_TABS: { id: ToolTab; label: string }[] = [
  { id: 'sro', label: 'Find SRO' },
  { id: 'stamp-duty', label: 'Stamp duty' },
  { id: 'market-value', label: 'Market value' },
  { id: 'calculator', label: 'Area calculator' },
];
const isToolTab = (v: string | null): v is ToolTab => TOOL_TABS.some((t) => t.id === v);

export function Tools() {
  const [params, setParams] = useSearchParams();
  const raw = params.get('tab');
  // An unknown ?tab= falls back to the directory rather than a blank panel.
  const tab: ToolTab = isToolTab(raw) ? raw : 'sro';
  const choose = (t: ToolTab) => setParams({ tab: t }, { replace: true });

  return (
    <main>
      <PageHead eyebrow="Account" title="Tools">
        <p className="lede" style={{ maxWidth: '46rem' }}>
          SRO finder · Stamp duty · Guideline values · Area
        </p>
      </PageHead>
      <TabStrip tabs={TOOL_TABS} value={tab} onChange={choose} label="Tools" idBase="tools" />
      <Panel idBase="tools" id={tab}>
        {tab === 'sro' ? (
          <SroTool />
        ) : tab === 'stamp-duty' ? (
          <StampDutyTool />
        ) : tab === 'market-value' ? (
          <MarketValueTool />
        ) : (
          <CalculatorTool />
        )}
      </Panel>
    </main>
  );
}
