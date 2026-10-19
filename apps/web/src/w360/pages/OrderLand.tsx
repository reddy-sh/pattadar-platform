/** Ordering services: one flow, three steps (Reddy, 10/10/2026).
 *
 *    1 Properties  which land — one or more, as cards or as a table
 *    2 Services    what that land can have done, from the catalogue alone
 *                  (`servicesForRecords`: each property priced for its own
 *                  place), recommended first, one or more
 *    3 Review      each chosen service's own questions once, the files to send
 *                  when it is one property, and every line with its price
 *
 *  The step is in the URL (`?step=`) so Back walks the steps; the selections
 *  are page state, seeded from `?for=` and `?service=` and written back to
 *  them (replacing, not pushing), so they survive Back and a reload or shared
 *  link restores what was chosen. Every "Order a service" in the app links here
 *  through `orderHref` (orderFlow.ts), with `for` and `step=services` when the
 *  property is already known — there is no second way in. The entry link's `why` and `a.<field>` prefills
 *  apply only to the property and services it named.
 *
 *  Placing is one `orderService` per service — `recordIds` is a list and the
 *  server files one order per property — each with its own idempotency key.
 *  A service the catalogue marks `perRecord` is shut when more than one
 *  property is chosen: the server writes one set of answers onto every order,
 *  and "North, yes" is an answer about one boundary — and for the same reason
 *  work on the ground is shut when more than one of the chosen properties has
 *  no boundary, since its directions answer is about one piece of land.
 *  Nothing is charged at
 *  placement.
 */
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import UploadFileOutlined from '@mui/icons-material/UploadFileOutlined';
import { parseBoundaryFile } from '@pattadar/core';

import {
  EMPTY_FILTER, placeOrder, useOrderService, useOrders, usePapers, usePhotos, useProperties,
  useServicesForRecords, useServicesOffered, useSetBoundary,
} from '../api';
import { checkBoundaryDraft } from './boundaryDraft';
import type { Order, Paper, Photo, RecordCard, ServiceField, ServiceOffer } from '../api';
import {
  DIRECTIONS_HELP, LAND_SENTENCE, MAP_WORD, PIN_CANNOT_GO, artOf, drawBack, extentLine,
  groundService, mapStateOf, mintKey, noteFor, openSameJob, pruneSheet,
} from '../orderFlow';
import { useToast } from '../Toast';
import { hasBoundaryRing, pairRing } from '../portfolioGeo';
import { surveyNumber } from '../surveyNumber';
import { Sk, SkRecordCards, SkTable } from '../skeletons';
import { MapThumb } from '../MapThumb';
import { ServiceTable, rankOffers } from '../ServiceList';
import { SectionHead } from './RecordHead';
import type { ServiceLine } from '../ServiceList';
import { ServiceRequestGuidance } from '../GovernanceGuidance';
import {
  BandSearch, Card, Empty, FacetFilter, Failed, Icon, OrderTracker, PageHead, PhotoImg,
  SelectAllBox, SelectionBar, ViewToggle, extentText, inr, num, plural, useNarrow,
} from '../ui';
import { extentTotal } from '../PropertyTable';

const STEPS = ['properties', 'services', 'review'] as const;
type Step = (typeof STEPS)[number];
const STEP_WORD: Record<Step, string> = { properties: 'Properties', services: 'Services', review: 'Review' };

/** Cards before "Show all"; and the ceiling on cards mounted at once — every
 *  card carries a map thumbnail and a photograph. */
const PAGE = 24;
const CAP = 48;
/** Above this many properties nothing is drawn until the list is narrowed. */
const SEARCH_LEADS = 60;

/** The village a record sits in — the first name in its place line. */
const villageOf = (placeLine: string) => (placeLine.split(',')[0] || '').trim();

const ids = (v: string | null) => new Set((v ?? '').split(',').map((s) => s.trim()).filter(Boolean));

// ── Step 1 · the land ──────────────────────────────────────────────────

function LandCard({ c, jobs, picked, onPick }: {
  c: RecordCard; jobs: number | null; picked: boolean; onPick: (id: string) => void;
}) {
  const box = useId();
  const geo = { ring: pairRing(c.ring), lat: c.lat, lon: c.lon };
  const thumb = <MapThumb {...geo} title={c.title} />;
  const state = mapStateOf(c);
  // The tick box is a sibling of the label, and the label is stretched over
  // the card: the whole card toggles it, with one control per card.
  return (
    <div className={`rec ${picked ? 'selected' : ''}`} style={{ position: 'relative' }}>
      <div className={`art ${artOf(c.classification)}`}>
        <Icon name={c.classification} size={46} />
        {/* A saved boundary beats the cover photo, as on the Properties grid. */}
        {c.coverFileRef && !hasBoundaryRing(geo.ring)
          ? <PhotoImg className="cardphoto" fileRef={c.coverFileRef} alt="" thumb={512} fallback={thumb} />
          : thumb}
        <span className="badges">
          <span className="sel">
            <input id={box} type="checkbox" checked={picked} aria-label={`Include ${c.title}`}
                   onChange={() => onPick(c.id)} />
          </span>
        </span>
      </div>
      <div className="meat">
        <span className="figure" style={{ display: 'block' }}>
          <label htmlFor={box} className="recgo" style={{ color: 'inherit', cursor: 'pointer' }}>
            {c.title}
            <span aria-hidden style={{ position: 'absolute', inset: 0 }} />
          </label>
        </span>
        <span className="note" style={{ display: 'block' }}>{c.placeLine}</span>
        <span className="note" style={{ display: 'block', marginTop: '0.25rem' }}>
          {extentLine(c)}
          {c.khataNo && ` · Khata ${c.khataNo}`}
        </span>
        <span className={`note ${state === 'mapped' ? '' : 'accent'}`}
              style={{ display: 'block', marginTop: '0.25rem' }}>
          {MAP_WORD[state]}
        </span>
        {/* Absent, not zero, while the read is in flight. */}
        {jobs !== null && jobs > 0 && (
          <span className="note" style={{ display: 'block' }}>
            {plural(jobs, 'order')} already running here
          </span>
        )}
      </div>
    </div>
  );
}

function LandTable({ rows, jobs, picked, onPick, onPickAll }: {
  rows: RecordCard[]; jobs: Map<string, number> | null; picked: ReadonlySet<string>;
  onPick: (id: string) => void; onPickAll: () => void;
}) {
  // The footer sums the ticked rows on screen, or every row when none is ticked.
  const ticked = rows.filter((r) => picked.has(r.id));
  const agg = ticked.length ? ticked : rows;
  return (
    <Card flush className="scroll-x edgefade">
      <table className="rectable" aria-label="Your properties" style={{ minWidth: '44rem' }}>
        <thead>
          <tr>
            <th className="selcol">
              <SelectAllBox total={rows.length} picked={ticked.length} onToggle={onPickAll}
                            noun={['property', 'properties']} />
            </th>
            <th>Property</th>
            <th>Place</th>
            <th className="right">Extent</th>
            <th>Khata</th>
            <th className="right">Orders running</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const on = picked.has(r.id);
            return (
              <tr key={r.id} className={on ? 'openrow selected' : 'openrow'}
                  onClick={(e) => { if (!(e.target instanceof HTMLInputElement)) onPick(r.id); }}>
                <td className="selcol">
                  <input type="checkbox" checked={on} aria-label={`Select ${r.title}`}
                         onChange={() => onPick(r.id)} />
                </td>
                <td><strong>{r.title}</strong>
                  <span className="note" style={{ display: 'block' }}>{MAP_WORD[mapStateOf(r)]}</span>
                </td>
                <td className="muted">{r.placeLine}</td>
                <td className="right num">{extentLine(r)}</td>
                <td className="muted">{r.khataNo || '—'}</td>
                <td className="right num">{jobs ? (jobs.get(r.id) ?? 0) : '—'}</td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr>
            <th scope="row" colSpan={3}>
              {ticked.length ? `${plural(ticked.length, 'property', 'properties')} selected`
                : `Total · ${plural(rows.length, 'property', 'properties')}`}
            </th>
            <td className="right num">{extentTotal(agg)}</td>
            <td />
            <td className="right num">{jobs ? num(agg.reduce((n, r) => n + (jobs.get(r.id) ?? 0), 0)) : '—'}</td>
          </tr>
        </tfoot>
      </table>
    </Card>
  );
}

// ── Step 3 · a service's questions, and what goes with the order ──────

const todayIso = () => new Date().toISOString().slice(0, 10);

/** One question a service asks. The help is linked to the box, so a screen
 *  reader reads it with the question; a required box is announced as one. */
function AnswerField({ field, idBase, value, required, error, extraHelp, onChange }: {
  field: ServiceField; idBase: string; value: string; required: boolean; error: string;
  extraHelp?: string; onChange: (v: string) => void;
}) {
  const id = `${idBase}-${field.name}`;
  const helpId = `${id}-help`;
  const errId = `${id}-err`;
  const help = [field.help, extraHelp].filter(Boolean);
  const described = [help.length ? helpId : '', error ? errId : ''].filter(Boolean).join(' ');
  const common = {
    id, value,
    'aria-required': required || undefined,
    'aria-invalid': error ? true : undefined,
    'aria-describedby': described || undefined,
  };
  const change = (e: { target: { value: string } }) => onChange(e.target.value);
  return (
    <div className="field">
      <label htmlFor={id}>
        {field.label}{required && <span className="accent" aria-hidden> *</span>}
      </label>
      {field.kind === 'select' ? (
        // The server validates no membership: the empty option is what stands
        // between a required select and an order carrying ''.
        <select {...common} onChange={change}>
          <option value="">Choose…</option>
          {field.options.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      ) : field.kind === 'textarea' ? (
        <textarea {...common} rows={3} onChange={change} />
      ) : field.kind === 'date' ? (
        <input {...common} type="date" min={todayIso()} onChange={change} />
      ) : field.kind === 'year' ? (
        <input {...common} type="number" min={1900} max={new Date().getFullYear()} step={1} onChange={change} />
      ) : field.kind === 'number' ? (
        <input {...common} type="number" min={1} step={1} onChange={change} />
      ) : (
        <input {...common} type="text" onChange={change} />
      )}
      {help.length > 0 && <p className="note" id={helpId} style={{ margin: 0 }}>{help.join(' ')}</p>}
      {error && (
        <p className="note" id={errId} role="alert" style={{ margin: 0, color: 'var(--w-danger)' }}>{error}</p>
      )}
    </div>
  );
}

/** Everything saved on the one chosen property, documents kept apart from the
 *  photos, nothing capped. Below 900px the list is behind a button: an inner
 *  scroller inside a phone screen is a scroll trap. */
function Attachments({ papers, photos, picked, onToggle, compact }: {
  papers: Paper[]; photos: Photo[]; picked: string[]; onToggle: (id: string) => void; compact: boolean;
}) {
  const [open, setOpen] = useState(false);
  if (compact && !open) {
    return (
      <button type="button" className="btn sm" onClick={() => setOpen(true)}>
        {picked.length === 0 ? 'Nothing attached — choose files' : `${plural(picked.length, 'file')} attached — change`}
      </button>
    );
  }
  const row = (id: string, title: string, detail: string) => (
    <label key={id} style={{ cursor: 'pointer' }}>
      <input type="checkbox" checked={picked.includes(id)} onChange={() => onToggle(id)} />
      <span className="grow">{title}<span className="note" style={{ display: 'block' }}>{detail}</span></span>
    </label>
  );
  return (
    <div style={{ maxHeight: '22rem', overflowY: 'auto' }}>
      {papers.length > 0 && (
        <>
          <p className="note" style={{ marginBottom: '0.25rem' }}>Documents · {papers.length}</p>
          <div className="rows boxed">{papers.map((d) => row(d.id, d.title, d.detail))}</div>
        </>
      )}
      {photos.length > 0 && (
        <>
          <p className="note" style={{ margin: 'var(--space-sm) 0 0.25rem' }}>Photos and video · {photos.length}</p>
          <div className="rows boxed">
            {photos.map((x) => row(x.id, x.caption || x.fileName || 'Photo',
              `${x.mediaKind === 'video' ? 'Video' : 'Photo'}${x.capturedAt ? ` · ${x.capturedAt.slice(0, 10)}` : ''}`))}
          </div>
        </>
      )}
    </div>
  );
}

// ── The page ───────────────────────────────────────────────────────────

type Outcome = { key: string; label: string; ids: string[]; want: number; filed: number; threw: boolean; already: boolean };

export function OrderLand() {
  const [params, setParams] = useSearchParams();
  const nav = useNavigate();
  const toast = useToast();
  const compact = useNarrow(900);

  const wanted = params.get('step') as Step;
  const step: Step = STEPS.includes(wanted) ? wanted : 'properties';
  const q = params.get('q') ?? '';
  const villages = params.getAll('village');
  const running = params.get('running') === '1';
  const why = params.get('why') ?? '';

  const [view, setView] = useState<'grid' | 'table'>('grid');
  const [limit, setLimit] = useState(PAGE);
  const [picked, setPicked] = useState<Set<string>>(() => ids(params.get('for') ?? params.get('record')));
  const [chosenSvc, setChosenSvc] = useState<Set<string>>(() => ids(params.get('service')));
  /** What the entry link named: its `why` and `a.<field>` belong to that only. */
  const [seed] = useState(() => ({ for: params.get('for') ?? params.get('record') ?? '', svc: ids(params.get('service')) }));
  const [answers, setAnswers] = useState<Record<string, Record<string, string>>>({});
  // `att` comes back from drawing a boundary; place() keeps only this property's files.
  const [attach, setAttach] = useState<string[]>(() => [...ids(params.get('att'))]);
  const [sendBoundary, setSendBoundary] = useState(true);
  const [showErrors, setShowErrors] = useState(false);
  const [placing, setPlacing] = useState(false);
  const [report, setReport] = useState('');
  const [allChosen, setAllChosen] = useState(false);
  // A boundary added from the owner's KML on the review card (ground work).
  const saveRing = useSetBoundary();
  const [kmlBusy, setKmlBusy] = useState(false);
  const [kmlErr, setKmlErr] = useState('');
  /** One idempotency key per service intent: kept while the request is the
   *  same (a second press after a timeout replays), re-minted when it changes. */
  const intents = useRef(new Map<string, { fp: string; key: string }>());
  const headRef = useRef<HTMLHeadingElement | null>(null);
  const firstStep = useRef(true);
  const order = useOrderService(false);

  const { data: mine, isLoading, error } = useProperties(EMPTY_FILTER);
  const { data: offers, isLoading: offersLoading, error: offersErr } = useServicesOffered('');
  // `undefined`, deliberately — every open order on the account (see the
  // note over `openSameJob` in orderFlow.ts).
  const {
    data: orders, isLoading: ordersLoading, isFetching: ordersFetching, error: ordersErr, refetch: refetchOrders,
  } = useOrders(undefined, false, true);

  const pool = useMemo(() => mine?.cards ?? [], [mine?.cards]);
  const chosen = useMemo(() => pool.filter((c) => picked.has(c.id)), [pool, picked]);
  const chosenIds = useMemo(() => chosen.map((c) => c.id), [chosen]);
  const many = chosenIds.length > 1;
  const single = chosenIds.length === 1 ? chosen[0] : undefined;

  const jobsOn = useMemo(() => {
    if (!orders) return null;
    const n = new Map<string, number>();
    for (const o of orders) n.set(o.recordId, (n.get(o.recordId) ?? 0) + 1);
    return n;
  }, [orders]);

  /** The step lives in the URL and every move is pushed, so Back walks it. */
  const patch = (next: Record<string, string | string[] | null>, push = false) => {
    const out = new URLSearchParams(params);
    for (const [k, v] of Object.entries(next)) {
      out.delete(k);
      if (Array.isArray(v)) v.forEach((x) => out.append(k, x));
      else if (v) out.set(k, v);
    }
    setParams(out, { replace: !push });
  };
  // The selection is the order: keep ?for=/?service= true to it, in place.
  useEffect(() => {
    const f = [...picked].join(',');
    const sv = [...chosenSvc].join(',');
    if ((params.get('for') ?? '') === f && (params.get('service') ?? '') === sv) return;
    const out = new URLSearchParams(params);
    if (f) out.set('for', f); else out.delete('for');
    if (sv) out.set('service', sv); else out.delete('service');
    setParams(out, { replace: true });
  }, [picked, chosenSvc]);
  const goStep = (s: Step) => { setReport(''); setShowErrors(false); patch({ step: s }, true); };

  useEffect(() => {
    if (firstStep.current) { firstStep.current = false; return; }
    window.scrollTo({ top: 0 });
    headRef.current?.focus();
  }, [step]);

  // ── step 1 ───────────────────────────────────────────────────────────

  const villageCounts = useMemo(() => {
    const n = new Map<string, number>();
    pool.forEach((c) => { const v = villageOf(c.placeLine); if (v) n.set(v, (n.get(v) ?? 0) + 1); });
    return [...n.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  }, [pool]);

  const matches = useMemo(() => {
    const needle = q.trim().toLowerCase();
    // "120/2", "120-2" and "Sy 120/2" are one survey number written three ways.
    const asSurvey = surveyNumber(q);
    const want = villages.map((v) => v.toLowerCase());
    return pool.filter((c) => {
      if (want.length && !want.includes(villageOf(c.placeLine).toLowerCase())) return false;
      if (running && !(jobsOn?.get(c.id) ?? 0)) return false;
      if (!needle) return true;
      if (`${c.title} ${c.placeLine} ${c.khataNo}`.toLowerCase().includes(needle)) return true;
      return !!asSurvey && surveyNumber(c.title) === asSurvey;
    });
  }, [pool, q, villages.join('\u0000'), running, jobsOn]);
  // The cap is for cards (thumbnails); a table row is cheap, so it shows every match.
  const visible = view === 'table' ? matches : matches.slice(0, limit);
  const narrowed = !!q.trim() || villages.length > 0 || running;
  const searchLeads = pool.length > SEARCH_LEADS;

  const pick = (id: string) => setPicked((was) => {
    const next = new Set(was);
    if (!next.delete(id)) next.add(id);
    return next;
  });
  const pickAllShown = () => setPicked((was) => {
    const next = new Set(was);
    const all = visible.every((c) => next.has(c.id));
    visible.forEach((c) => (all ? next.delete(c.id) : next.add(c.id)));
    return next;
  });

  // ── step 2 ───────────────────────────────────────────────────────────

  const forChosen = useServicesForRecords(step === 'properties' ? [] : chosenIds);
  const local = useMemo(() => {
    const byKey = new Map<string, { offer: ServiceOffer; prices: Map<string, number> }>();
    for (const r of forChosen.data ?? []) {
      if (!picked.has(r.recordId)) continue;
      for (const o of r.offers) {
        const hit = byKey.get(o.key) ?? { offer: o, prices: new Map<string, number>() };
        hit.prices.set(r.recordId, o.price);
        byKey.set(o.key, hit);
      }
    }
    return byKey;
  }, [forChosen.data, picked]);

  /** The open order of this service on this property, if any. */
  const dupOf = (key: string, id: string): Order | undefined =>
    openSameJob((orders ?? []).filter((o) => o.recordId === id), key, offers);

  const plan = useMemo(() => rankOffers([...local.values()].map((v) => v.offer)).map((o) => {
    const prices = local.get(o.key)!.prices;
    const offered = chosenIds.filter((id) => prices.has(id));
    const dups = offered.map((id) => dupOf(o.key, id)).filter((d): d is Order => !!d);
    const eligible = offered.filter((id) => !dupOf(o.key, id));
    let blocked: ReactNode = undefined;
    if (many && o.perRecord) blocked = 'Ordered one property at a time';
    else if (groundService(o) && o.directionsField
      && chosen.filter((c) => eligible.includes(c.id) && mapStateOf(c) === 'none').length > 1) {
      blocked = 'Directions are needed for each property with no boundary — order one at a time';
    } else if (eligible.length === 0 && dups.length > 0) {
      blocked = (
        <>Already on order{dups.length === 1 && <> · <Link className="link" to={`/services/${dups[0].id}`}>Open order</Link></>}</>
      );
    }
    const amounts = (eligible.length ? eligible : offered).map((id) => prices.get(id)!);
    const lo = Math.min(...amounts); const hi = Math.max(...amounts);
    const each = many ? ' each' : '';
    return {
      offer: o, prices, offered, eligible, blocked,
      price: lo === hi ? `${inr(lo)}${each}` : `${inr(lo)}–${inr(hi)}${each}`,
      amount: eligible.reduce((n, id) => n + (prices.get(id) ?? 0), 0),
      where: offered.length === chosenIds.length ? 'All' : `${offered.length} of ${chosenIds.length}`,
    };
  }), [local, chosenIds, chosen, many, orders, offers]);

  const picks = plan.filter((p) => !p.blocked && chosenSvc.has(p.offer.key));
  const toggleSvc = (key: string) => setChosenSvc((was) => {
    const next = new Set(was);
    if (!next.delete(key)) next.add(key);
    return next;
  });
  const toggleAllSvc = () => setChosenSvc((was) => {
    const free = plan.filter((p) => !p.blocked).map((p) => p.offer.key);
    const all = free.every((k) => was.has(k));
    const next = new Set(was);
    free.forEach((k) => (all ? next.delete(k) : next.add(k)));
    return next;
  });

  // ── step 3 ───────────────────────────────────────────────────────────

  const { data: papers, error: papersErr, isLoading: papersLoading } = usePapers(step === 'review' ? single?.id : undefined);
  const { data: photos, error: photosErr, isLoading: photosLoading } = usePhotos(step === 'review' ? single?.id : undefined);
  const paperList = papers ?? [];
  const photoList = photos?.photos ?? [];
  const singleMap = single ? mapStateOf(single) : 'none';
  const attachHere = attach.filter((id) => paperList.some((d) => d.id === id) || photoList.some((x) => x.id === id));
  // Files ticked for one property do not carry over to another.
  const attachFor = useRef(single?.id);
  useEffect(() => {
    if (!single) return;
    if (attachFor.current && attachFor.current !== single.id) { setAttach([]); setSendBoundary(true); }
    attachFor.current = single.id;
  }, [single?.id]);

  const valueOf = (key: string, field: string) =>
    answers[key]?.[field] ?? params.get(`a.${key}.${field}`)
      ?? (seed.svc.has(key) ? params.get(`a.${field}`) : null) ?? '';
  const setValue = (key: string, field: string, v: string) =>
    setAnswers((a) => ({ ...a, [key]: { ...a[key], [field]: v } }));

  /** Required: the catalogue's own, plus the directions question for work on
   *  the ground when one of the properties it goes to cannot be found. */
  const unmappedFor = (p: (typeof plan)[number]) =>
    chosen.filter((c) => p.eligible.includes(c.id) && mapStateOf(c) === 'none');
  const requiredOf = (p: (typeof plan)[number]) => {
    const s = new Set(p.offer.fields.filter((f) => f.required).map((f) => f.name));
    if (groundService(p.offer) && p.offer.directionsField && unmappedFor(p).length > 0) s.add(p.offer.directionsField);
    return s;
  };
  const missing = picks.flatMap((p) => {
    const req = requiredOf(p);
    return p.offer.fields
      .filter((f) => req.has(f.name) && !valueOf(p.offer.key, f.name).trim())
      .map((f) => ({ key: p.offer.key, name: f.name, label: `${p.offer.label}: ${f.label}` }));
  });
  const lines = picks.flatMap((p) => chosen.map((c) => ({ p, c })));
  const orderCount = picks.reduce((n, p) => n + p.eligible.length, 0);
  const total = picks.reduce((n, p) => n + p.eligible.reduce((m, id) => m + (p.prices.get(id) ?? 0), 0), 0);
  const existingUnknown = ordersLoading || ordersFetching || !!ordersErr || !orders;
  const anyGround = picks.some((p) => groundService(p.offer));
  const canSendBoundary = !!single && anyGround && singleMap === 'mapped';

  /** The owner's KML (or GeoJSON) becomes this property's boundary — the same
   *  parse, shape check and save the Location tab uses — and once the list
   *  re-reads, the property is mapped and the boundary goes with the order. */
  const addKml = async (file: File | undefined) => {
    if (!file || !single) return;
    setKmlErr(''); setKmlBusy(true);
    try {
      const { ring, error } = checkBoundaryDraft(parseBoundaryFile(await file.text(), file.name).ring);
      if (error) throw new Error(error);
      const res = await saveRing.mutateAsync({ recordId: single.id, ring: ring.flat() });
      if (!res?.web?.setBoundary) throw new Error('That boundary could not be saved on this property. Try again.');
      toast.ok(`Boundary added to ${single.title} from ${file.name}.`);
    } catch (e) {
      setKmlErr(e instanceof Error ? e.message : 'That file could not be read.');
    } finally {
      setKmlBusy(false);
    }
  };

  /** This page as it stands, for coming back after drawing the boundary. */
  const backHere = (id: string) => {
    const u = new URLSearchParams(params);
    u.set('for', id);
    u.set('service', picks.map((x) => x.offer.key).join(','));
    u.set('step', 'review');
    for (const [k, f] of Object.entries(answers)) for (const [n, v] of Object.entries(f)) if (v) u.set(`a.${k}.${n}`, v);
    if (attach.length) u.set('att', attach.join(',')); else u.delete('att');
    return `/order?${u}`;
  };

  async function place() {
    if (placing || orderCount === 0 || existingUnknown) return;
    if (missing.length > 0) { setShowErrors(true); return; }
    setPlacing(true);
    setReport('');
    const attachedPapers = single ? paperList.filter((d) => attach.includes(d.id)) : [];
    const attachedPhotos = single ? photoList.filter((x) => attach.includes(x.id)) : [];
    const named = [...attachedPapers.map((d) => d.title), ...attachedPhotos.map((x) => x.caption || x.fileName || 'Photo')];
    const out: Outcome[] = [];
    for (const p of picks.filter((x) => x.eligible.length > 0)) {
      // Only the answers THIS service asks for, and only those given.
      const sheet = pruneSheet(p.offer.fields, Object.fromEntries(p.offer.fields.map((f) => [f.name, valueOf(p.offer.key, f.name).trim()])));
      const sent: Record<string, string> = {};
      Object.entries(sheet).forEach(([k, v]) => { if (v) sent[k] = v; });
      if (named.length) sent.shared = named.join(', ');
      const manifest = single ? {
        documentIds: attachedPapers.map((d) => d.id),
        photoIds: attachedPhotos.map((x) => x.id),
        ...(groundService(p.offer) && canSendBoundary && sendBoundary ? { includeBoundary: true } : {}),
      } : undefined;
      const fp = JSON.stringify([p.offer.key, p.eligible, sent, manifest ?? null]);
      const was = intents.current.get(p.offer.key);
      if (was?.fp !== fp) intents.current.set(p.offer.key, { fp, key: mintKey() });
      const outcome: Outcome = {
        key: p.offer.key, label: p.offer.label, ids: p.eligible, want: p.eligible.length, filed: 0, threw: false, already: false,
      };
      try {
        outcome.filed = await placeOrder(order.mutateAsync, {
          recordIds: p.eligible,
          kind: p.offer.key,
          note: single
            ? noteFor(single.id === seed.for && (seed.svc.size === 0 || seed.svc.has(p.offer.key)) ? why : '', single.title)
            : `Ordered for ${plural(p.eligible.length, 'property', 'properties')} at once`,
          params: sent,
          manifest,
          idempotencyKey: intents.current.get(p.offer.key)!.key,
        });
      } catch {
        outcome.threw = true;
      }
      // A definite short answer is final under that key (the server stored it):
      // only an answer that never came back is replayed under the same key.
      if (outcome.filed === outcome.want || !outcome.threw) intents.current.delete(p.offer.key);
      out.push(outcome);
    }
    // A short answer the server gave on purpose may be a duplicate it refused
    // (placed from another tab since this page read the open orders).
    if (out.some((o) => o.filed < o.want && !o.threw)) {
      const fresh = (await refetchOrders()).data ?? [];
      for (const o of out) {
        if (o.filed < o.want && !o.threw) {
          o.already = o.ids.every((id) => !!openSameJob(fresh.filter((x) => x.recordId === id), o.key, offers));
        }
      }
    }
    const done = out.filter((o) => o.filed === o.want || o.already);
    const filed = out.reduce((n, o) => n + o.filed, 0);
    const already = out.filter((o) => o.filed < o.want && o.already).map((o) => o.label);
    const alreadyLine = already.length
      ? `${already.join(' and ')} ${already.length === 1 ? 'was' : 'were'} already on order` : '';
    if (done.length === out.length) {
      toast.ok(`${[filed > 0 ? `${plural(filed, 'order')} placed` : '', alreadyLine].filter(Boolean).join('; ')}.`
        + ' Nothing is charged until you accept the work.');
      nav('/services');
      return;
    }
    // Not on success: the page is leaving, and an idle review with nothing
    // left to place would send the guard after it.
    setPlacing(false);
    // What went through is taken off the selection, so trying again sends only
    // what did not.
    setChosenSvc((was) => {
      const next = new Set(was);
      done.forEach((d) => next.delete(d.key));
      return next;
    });
    const short = out.filter((o) => !done.includes(o)).map((o) => (o.filed > 0
      ? `${o.label} (placed for ${o.filed} of ${o.want} properties; the rest are already on order or could not be placed)`
      : o.label));
    setReport(`${done.length} of ${out.length} placed; ${short.join(' and ')} could not be placed — try again.`
      + (alreadyLine ? ` ${alreadyLine}.` : '')
      + ' If one shows under Services, it was placed or was already on order and need not be ordered again.');
  }

  // ── guards ───────────────────────────────────────────────────────────

  // A later step with nothing chosen for it goes back to where the choice is.
  useEffect(() => {
    if (!mine) return;
    if (step !== 'properties' && chosenIds.length === 0) patch({ step: 'properties' });
    else if (step === 'review' && forChosen.data && picks.length === 0 && !placing && !report) patch({ step: 'services' });
  }, [mine, step, chosenIds.length, forChosen.data, picks.length, placing, report]);

  const at = STEPS.indexOf(step);
  const tracker = (
    <OrderTracker
      label="Order steps"
      steps={STEPS.map((s, i) => ({
        label: STEP_WORD[s],
        state: i < at ? 'done' : i === at ? 'current' : 'todo',
        caption: s === 'properties' && chosenIds.length ? `${chosenIds.length} chosen`
          : s === 'services' && i <= at && picks.length ? `${picks.length} chosen` : undefined,
        onClick: i < at ? () => goStep(s) : undefined,
      }))}
    />
  );

  // The review step's bar is a commit (orders and rupees), not a selection,
  // so it keeps this markup; the two choosing steps use SelectionBar.
  const bar = (count: ReactNode, actions: ReactNode, label: string) => (
    <div className="selbar">
      <div className="bulkbar" role="group" aria-label={label}>
        <span className="count" role="status">{count}</span>
        <span className="vrule" aria-hidden />
        <span className="acts">{actions}</span>
      </div>
    </div>
  );

  const noLand = !!mine && pool.length === 0;

  return (
    <main style={{ paddingBottom: noLand ? undefined : '6rem' }}>
      <PageHead title="Order a service" />

      {isLoading && !mine ? (
        <SkRecordCards count={6} />
      ) : !mine ? (
        <Failed what="Your properties" error={error} boxed h="20rem" />
      ) : noLand ? (
        <>
          <Empty boxed h="14rem" icon="parcel" title="Add a property before ordering"
                 action={<Link className="btn primary" to="/properties?new=1">Add a property</Link>} />
          {/* A first-time owner still reads what Pattadar sells and what it costs. */}
          <section className="sec">
            <SectionHead title="Available services"
                         sub={offers && offers.length > 0 ? plural(offers.length, 'service') : undefined} />
            <div>
              {offersLoading && !offers ? (
                <SkTable label="Loading the list of services" rows={8} select={false} foot={false} minWidth="36rem"
                         cols={[{ head: 'Service' }, { head: 'Group' }, { head: 'Price', right: true, w: '4rem' },
                           { head: 'Takes', w: '5rem' }, { head: '' }]} />
              ) : !offers ? (
                <Failed what="The list of services" error={offersErr} boxed h="14rem" />
              ) : offers.length === 0 ? (
                <Empty boxed h="10rem" icon="unsorted" title="No services are available right now" />
              ) : (
                <ServiceTable label="Available services"
                              lines={rankOffers(offers).map((o) => ({ offer: o, price: inr(o.price) }))} />
              )}
            </div>
          </section>
        </>
      ) : (
        <>
          {tracker}

          {step === 'properties' && (
            <section aria-labelledby="order-step-h">
              <SectionHead id="order-step-h" headRef={headRef} title="Choose the properties" />
              <FacetFilter
                groups={[
                  ...(villageCounts.length > 1 ? [{
                    key: 'village', label: 'Village',
                    options: villageCounts.map(([name, n]) => ({ key: name, label: name, count: n })),
                  }] : []),
                  ...(jobsOn && jobsOn.size > 0 ? [{
                    key: 'running', label: 'Orders',
                    options: [{ key: '1', label: 'An order in progress', count: jobsOn.size }],
                  }] : []),
                ]}
                selected={{ village: villages, running: running ? ['1'] : [] }}
                onToggle={(g, k) => {
                  setLimit(PAGE);
                  if (g === 'running') patch({ running: running ? null : '1' });
                  else patch({ village: villages.includes(k) ? villages.filter((v) => v !== k) : [...villages, k] });
                }}
                onClear={() => { setLimit(PAGE); patch({ village: null, running: null, q: null }); }}
                tally={`${num(matches.length)} of ${num(pool.length)} shown`}
                search={(
                  <BandSearch value={q} label="Find your property" placeholder="Village, survey number or khata"
                              onChange={(v) => { setLimit(PAGE); patch({ q: v || null }); }} />
                )}
                view={<ViewToggle views={['grid', 'table'] as const} value={view} onChange={setView} />}
              />

              {ordersErr && (
                <p className="note" style={{ marginBottom: 'var(--space-sm)' }}>Existing orders could not be checked.</p>
              )}

              {searchLeads && !narrowed ? (
                <Empty boxed h="14rem" icon="search"
                       title={`${num(pool.length)} properties in ${plural(villageCounts.length, 'village')}`}>
                  Search or filter to find the ones to order for.
                </Empty>
              ) : matches.length === 0 ? (
                <Empty boxed h="14rem" icon="search"
                       title={q ? `No property matches “${q}”` : 'Nothing matches those filters'}
                       action={(
                         <button type="button" className="btn sm"
                                 onClick={() => patch({ q: null, village: null, running: null })}>
                           Clear
                         </button>
                       )} />
              ) : (
                <>
                  {view === 'table' ? (
                    <LandTable rows={visible} jobs={jobsOn} picked={picked} onPick={pick} onPickAll={pickAllShown} />
                  ) : (
                    <div className={`cards ${picked.size > 0 ? 'selecting' : ''}`}>
                      {visible.map((c) => (
                        <LandCard key={c.id} c={c} jobs={jobsOn ? (jobsOn.get(c.id) ?? 0) : null}
                                  picked={picked.has(c.id)} onPick={pick} />
                      ))}
                    </div>
                  )}
                  {matches.length > visible.length && (
                    <div className="loadmore" style={{ marginTop: 'var(--space-md)' }}>
                      <span className="hair" aria-hidden />
                      {limit < CAP ? (
                        <button type="button" className="btn sm"
                                onClick={() => setLimit(Math.min(matches.length, CAP))}>
                          Show {matches.length <= CAP ? `all ${num(matches.length)}` : `${num(CAP - limit)} more`}
                        </button>
                      ) : (
                        <span className="note">Showing {num(visible.length)} of {num(matches.length)}.</span>
                      )}
                      <span className="hair" aria-hidden />
                    </div>
                  )}
                </>
              )}

              <SelectionBar count={chosenIds.length} noun={['property', 'properties']}
                            label="The chosen properties" onClear={() => setPicked(new Set())}>
                <button type="button" className="btn sm primary" onClick={() => goStep('services')}>
                  Next: choose services
                </button>
              </SelectionBar>
            </section>
          )}

          {step === 'services' && chosenIds.length > 0 && (
            <section aria-labelledby="order-step-h">
              {/* Facts under the heading, guidance behind its ⓘ (design.md
                  § Page head, ⓘ) — the same SectionHead every tab uses. */}
              <SectionHead id="order-step-h" headRef={headRef} title="Choose the services"
                           info={`Each price is for where ${single ? 'this property is' : 'each property is'}. Choose one or more.`}
                           sub={forChosen.data && plan.length > 0
                             ? `${plural(chosenIds.length, 'property', 'properties')} · ${plural(plan.length, 'service')} offered`
                             : plural(chosenIds.length, 'property', 'properties')} />
              {/* WHICH land, not just how much: the price and what work on the
                  ground can do both depend on where each property is. A chip
                  drops one (never the last); Change goes back to choosing. */}
              <div className="chippick" role="group" aria-label="Ordering for"
                   style={{ marginBottom: 'var(--space-md)' }}>
                {(allChosen ? chosen : chosen.slice(0, 4)).map((c) => (
                  <span className="fchip" key={c.id}>
                    <span className="val num">{[c.title, c.village, extentText(c)].filter(Boolean).join(' · ')}</span>
                    {chosen.length > 1 && (
                      <button type="button" aria-label={`Remove ${c.title}`} onClick={() => pick(c.id)}>×</button>
                    )}
                  </span>
                ))}
                {chosen.length > 4 && !allChosen && (
                  <button type="button" className="link" onClick={() => setAllChosen(true)}>
                    {num(chosen.length - 4)} more
                  </button>
                )}
                <button type="button" className="link" onClick={() => goStep('properties')}>Change</button>
              </div>
              {forChosen.isLoading ? (
                <SkTable label="Loading the services offered there" rows={8}
                         cols={[{ head: 'Service' }, { head: 'Group' }, { head: 'Price', right: true, w: '4rem' },
                           { head: 'Takes', w: '5rem' }, ...(many ? [{ head: 'Available at', w: '3rem' }] : []), { head: '' }]} />
              ) : forChosen.error || !forChosen.data ? (
                <Failed what="The services offered there" error={forChosen.error} boxed h="12rem" />
              ) : plan.length === 0 ? (
                <Empty boxed h="10rem" icon="unsorted" title="No service is offered there yet"
                       action={single && <Link className="btn" to={`/properties/${single.id}/request`}>Ask your own provider</Link>}>
                  Pattadar does not offer services where {single ? 'this property is' : 'these properties are'} yet.
                </Empty>
              ) : (
                // While a changed set of properties is priced, the last table
                // stays, dimmed and inert, rather than blanking (design.md § Loading).
                <div aria-busy={forChosen.isPlaceholderData}
                     style={{ opacity: forChosen.isPlaceholderData ? 0.6 : 1,
                       pointerEvents: forChosen.isPlaceholderData ? 'none' : undefined,
                       transition: 'opacity var(--dur-fast) var(--ease-out)' }}>
                <ServiceTable
                  label="Services offered there"
                  lines={plan.map((p): ServiceLine => ({
                    offer: p.offer, price: p.price, amount: p.amount, blocked: p.blocked,
                    where: many ? p.where : undefined,
                  }))}
                  selected={chosenSvc} onToggle={toggleSvc} onToggleAll={toggleAllSvc}
                />
                </div>
              )}
              {/* Asking someone yourself is per record, so it is offered for one property. */}
              {single && plan.length > 0 && (
                <p className="note">
                  Not what you need?{' '}
                  <Link className="link" to={`/properties/${single.id}/request`}>Ask a provider you already work with.</Link>
                </p>
              )}

              <SelectionBar count={picks.length} noun={['service', 'services']}
                            label="The chosen services" onClear={() => setChosenSvc(new Set())}>
                <button type="button" className="btn sm" onClick={() => goStep('properties')}>Back</button>
                <button type="button" className="btn sm primary" disabled={forChosen.isPlaceholderData}
                        onClick={() => goStep('review')}>
                  Next: review
                </button>
              </SelectionBar>
            </section>
          )}

          {step === 'review' && chosenIds.length > 0 && !forChosen.data && (forChosen.isLoading
            ? <SkTable label="Loading the services offered there" rows={8}
                       cols={[{ head: 'Service' }, { head: 'Group' }, { head: 'Price', right: true, w: '4rem' },
                         { head: 'Takes', w: '5rem' }, ...(many ? [{ head: 'Available at', w: '3rem' }] : []), { head: '' }]} />
            : <Failed what="The services offered there" error={forChosen.error} boxed h="12rem" />)}

          {step === 'review' && picks.length > 0 && (
            <section aria-labelledby="order-step-h" className="stack">
              <SectionHead id="order-step-h" headRef={headRef} title="Review and place"
                           sub={`${plural(orderCount, 'order')} · ${inr(total)}`}
                           info={many ? 'Each answer goes on every chosen property’s order.' : undefined} />

              {picks.map((p) => {
                const req = requiredOf(p);
                const lost = unmappedFor(p);
                const missed = new Set(missing.filter((m) => m.key === p.offer.key).map((m) => m.name));
                return (
                  <Card key={p.offer.key} title={p.offer.label}
                        aside={<span className="note num">{p.price} · about {p.offer.days} days</span>}>
                    {groundService(p.offer) && single && LAND_SENTENCE[p.offer.key]?.[singleMap] && (
                      <p className="note" style={{ marginTop: 0 }}>{LAND_SENTENCE[p.offer.key][singleMap]}</p>
                    )}
                    {groundService(p.offer) && lost.length > 0 && (
                      <div className="row tight" style={{ flexWrap: 'wrap', marginTop: 0, marginBottom: 'var(--space-sm)' }}>
                        <p className="note accent" style={{ margin: 0 }}>
                          No boundary on record for {lost.map((c) => c.title).join(', ')}.
                        </p>
                        {/* The provider finds the land from its boundary, so the
                            owner's KML goes on the property right here — saved
                            to it and sent with the order — without leaving the
                            order (founder, 10/10/2026: "kml is very important for
                            borewell"). Drawing it stays one link away. */}
                        {single && (
                          <>
                            <label className="btn sm">
                              <UploadFileOutlined sx={{ fontSize: 15 }} />
                              {kmlBusy ? 'Reading…' : 'Add boundary from a KML file'}
                              <input type="file" hidden disabled={kmlBusy}
                                     accept=".kml,.json,.geojson,application/vnd.google-earth.kml+xml,application/geo+json,application/json"
                                     onChange={(e) => { void addKml(e.target.files?.[0]); e.target.value = ''; }} />
                            </label>
                            <Link className="link" to={drawBack(single.id, backHere(single.id))}>
                              or draw it on the map
                            </Link>
                          </>
                        )}
                        {kmlErr && <p className="note" role="alert" style={{ margin: 0, color: 'var(--w-danger)', flexBasis: '100%' }}>{kmlErr}</p>}
                      </div>
                    )}
                    {p.offer.fields.length === 0 ? (
                      <p className="note" style={{ margin: 0 }}>There is nothing to fill in for this one.</p>
                    ) : (
                      // Short answers side by side (founder, 10/10/2026: "simple
                      // form, not big space usage"); the sentence that every
                      // answer goes on each property's order is said once, behind
                      // the heading's ⓘ, not under every card.
                      <div className="qsheet">
                        {p.offer.fields.map((f) => (
                          <AnswerField key={f.name} field={f} idBase={`sf-${p.offer.key}`}
                                       value={valueOf(p.offer.key, f.name)} required={req.has(f.name)}
                                       error={showErrors && missed.has(f.name) ? 'We need this before the order can go in.' : ''}
                                       extraHelp={lost.length > 0 && f.name === p.offer.directionsField ? DIRECTIONS_HELP : undefined}
                                       onChange={(v) => setValue(p.offer.key, f.name, v)} />
                        ))}
                      </div>
                    )}
                  </Card>
                );
              })}

              {single && (
                <Card title="Files to share with the provider"
                      aside={<span className="note num">{attachHere.length} of {paperList.length + photoList.length}</span>}>
                  {/* One guide per kind of work chosen, not only the first service's. */}
                  {[...new Map(picks.map((p) => [groundService(p.offer), p])).values()].map((p) => (
                    <ServiceRequestGuidance key={p.offer.key} serviceKind={p.offer.key} ground={groundService(p.offer)}
                                            district={single.district || '*'} />
                  ))}
                  {picks.length > 1 && (
                    <p className="note" style={{ margin: 0 }}>These files go with every service you picked.</p>
                  )}
                  {(papersLoading || photosLoading) && paperList.length === 0 && photoList.length === 0 ? (
                    // First read: the file rows' own shape, so the card does not jump (design.md § Loading).
                    <div role="status" aria-busy="true" aria-label="Loading the files saved on this property">
                      <div className="rows boxed" aria-hidden>
                        {[0, 1, 2].map((i) => (
                          <div key={i}>
                            <Sk w="0.9375rem" h="0.9375rem" r="var(--radius-xs)" style={{ flex: 'none' }} />
                            <span className="grow">
                              <Sk w={`${9 + i * 2}rem`} h="0.9375rem" />
                              <Sk w={`${6 + i}rem`} h="0.8125rem" style={{ marginTop: '0.3125rem' }} />
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (papersErr || photosErr) && paperList.length === 0 && photoList.length === 0 ? (
                    <Failed what="What is saved on this property" error={papersErr || photosErr} />
                  ) : paperList.length === 0 && photoList.length === 0 ? (
                    <Empty icon="paper" title="No documents on this property yet" />
                  ) : (
                    <Attachments papers={paperList} photos={photoList} picked={attachHere} compact={compact}
                                 onToggle={(id) => setAttach((a) => (a.includes(id) ? a.filter((x) => x !== id) : [...a, id]))} />
                  )}
                  {anyGround && (canSendBoundary ? (
                    <label className="check" style={{ marginTop: 'var(--space-sm)' }}>
                      <input type="checkbox" checked={sendBoundary} onChange={() => setSendBoundary(!sendBoundary)} />
                      <span className="grow">Send the boundary you have drawn with the work on the ground</span>
                    </label>
                  ) : (
                    <p className="note" style={{ marginBottom: 0 }}>{PIN_CANNOT_GO}</p>
                  ))}
                </Card>
              )}

              <Card flush className="scroll-x" busy={placing}>
                <table className="rectable" aria-label="What will be ordered" style={{ minWidth: '36rem' }}>
                  <thead>
                    <tr><th>Service</th><th>Property</th><th className="right">Price</th></tr>
                  </thead>
                  <tbody>
                    {lines.map(({ p, c }) => {
                      const price = p.prices.get(c.id);
                      const dup = price !== undefined ? dupOf(p.offer.key, c.id) : undefined;
                      return (
                        <tr key={`${p.offer.key}-${c.id}`} data-line={`${p.offer.key}:${c.id}`}>
                          <td>{p.offer.label}</td>
                          <td className="muted">{c.title}</td>
                          <td className="right num">
                            {price === undefined ? 'Not offered there'
                              : dup ? <>Already on order · <Link className="link" to={`/services/${dup.id}`}>Open order</Link></>
                                : inr(price)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr>
                      <th scope="row" colSpan={2}>{plural(orderCount, 'new order')}</th>
                      <td className="right num">{inr(total)}</td>
                    </tr>
                  </tfoot>
                </table>
              </Card>
              <p className="note" style={{ margin: 0 }}>
                Nothing is charged now. You pay only after you accept the work.
              </p>
              {existingUnknown && (
                <p className="note">
                  {ordersLoading ? 'Checking what is already on order…'
                    : 'Existing orders could not be checked, so nothing can be placed yet. Try again in a moment.'}
                </p>
              )}
              {showErrors && missing.length > 0 && (
                <p className="note" role="alert" style={{ color: 'var(--w-danger)' }}>
                  Still needed: {missing.map((m) => m.label).join(', ')}.
                </p>
              )}
              {report && (
                <p className="note" role="alert" style={{ color: 'var(--w-danger)' }}>{report}</p>
              )}

              {bar(
                `${plural(orderCount, 'order')} · ${inr(total)}`,
                <>
                  <button type="button" className="btn sm" disabled={placing} onClick={() => goStep('services')}>Back</button>
                  <button type="button" className="btn sm primary"
                          disabled={placing || orderCount === 0 || existingUnknown}
                          onClick={() => { void place(); }}>
                    {placing ? 'Placing…' : `Place ${plural(orderCount, 'order')} · ${inr(total)}`}
                  </button>
                </>,
                'Place the orders',
              )}
            </section>
          )}
        </>
      )}
    </main>
  );
}
