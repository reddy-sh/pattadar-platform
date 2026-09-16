/** Ordering a service, against one piece of land, in four steps.
 *
 *  What was here before was a single screen holding five questions at once:
 *  which property, which service, the service's own questions, what to attach,
 *  and what had already been ordered — a catalogue of six rendered as three
 *  full-width boxes down a two-thousand-pixel page, beside a 22rem column that
 *  said "Pick a service" and nothing else for the whole of that scroll. It
 *  asked for the land in a card the size of a postage stamp, listed ten of
 *  thirty parcels as bare text, and ended by navigating silently to a list:
 *  no summary before the money was committed, no reference afterwards, and no
 *  way to tell a server that refused the order from a network that never
 *  delivered it.
 *
 *  The shape now is the one ServiceNow settled on for the same problem, minus
 *  the parts a six-item catalogue does not earn. THIS screen orders against one
 *  record — it is a path segment, see below — and there is no category tree and
 *  no four-deep breadcrumb over three groups of two. What is kept is the spine
 *  that matters: an item you read before you choose it, a form that is the
 *  item's own questions, a review you check before anything is committed, and
 *  a receipt you can act on.
 *
 *  Ordering the same service for MANY properties at once is a real thing an
 *  owner with a village full of parcels needs, and `orderService` has always
 *  been able to do it — `recordIds` is a list and it files one job per record.
 *  That lives on the land picker (OrderLand), which is the only screen that
 *  holds a selection; it is not a second flow here, and it is deliberately shut
 *  to the two services whose answers belong to one parcel (PER_PROPERTY).
 *
 *  The land is the equivalent of ServiceNow's affected Configuration Item, and
 *  it is not a dropdown at the bottom of a form: it is a path segment, so this
 *  screen cannot mount without one, and it is on the page — with its map — at
 *  every step. That is the second half of the founder's sentence. The first
 *  half is `LAND_SENTENCE`: when a service needs somebody to physically find
 *  the land and the record cannot say where it is, the flow says so, offers to
 *  go and draw it, and comes back to where it left off.
 *
 *  A survey is never blocked for want of a boundary. Refusing to sell the
 *  service that produces the map, because there is no map, is not a safeguard.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode, RefObject } from 'react';
import { Link, useSearchParams } from 'react-router';
import HandshakeOutlined from '@mui/icons-material/HandshakeOutlined';

import {
  placeOrder, useOrderService, useOrders, usePapers, usePhotos, useServicesOffered,
} from '../api';
import type { Order, Paper, Photo, RecordDetail, ServiceField, ServiceOffer } from '../api';
import {
  ALSO_CALLED, DELIVERABLE, DIRECTIONS_FIELD, DIRECTIONS_HELP, LAND_SENTENCE,
  MAP_LINK, MAP_WORD, PIN_CANNOT_GO, aOrAn, clearDraft, drawBack, extentLine, fingerprint,
  groundService,
  groupsOf, mapStateOf, mintKey, noteFor, openSameJob, pruneSheet, readDraft, writeDraft,
} from '../orderFlow';
import type { MapState } from '../orderFlow';
import { pairRing } from '../portfolioGeo';
import { MapThumb } from '../MapThumb';
import {
  Card, Chip, Empty, Failed, Icon, KV, Loading, ddmmyyyy, inr, plural,
} from '../ui';
import { RecordCrumbs, useRecordCtx } from './Record';

// ── Words ──────────────────────────────────────────────────────────────

/** A server that answered, and said no.
 *
 *  This replaces a single sentence that stood for six different server causes
 *  and whose advice — "choose the property or service again" — was wrong for
 *  most of them. `orderService` answers 0 without raising, and by far the
 *  commonest reason is an attachment that is no longer on the record: the
 *  manifest is checked against what is filed now, not what was filed when the
 *  box was ticked. So the sentence names that, and the handler goes and looks. */
const ORDER_REFUSED =
  'That order was not accepted, and nothing was charged. The usual reason is that '
  + 'something you attached is no longer on this land — a paper that was deleted or '
  + 'moved since you ticked it. Check what is attached, and place it again.';

/** A request that never came back.
 *
 *  Kept from the screen this replaces, for its reasoning, which was right: a
 *  rejected request is NOT proof that nothing was filed. The order may have
 *  been committed and only the answer lost — a timeout, a reset, a gateway 502
 *  after the resolver ran — so telling the owner "nothing has been ordered"
 *  would be a lie the Services list disproves. Only the clause naming a card
 *  that no longer exists is re-worded, and it now carries a live link rather
 *  than the name of somewhere to go looking. */
const ORDER_FAILED =
  'That order did not go through — check your connection and try again. If it does '
  + 'appear under Services on this land, it was filed and you need not order again.';

const STEPS = ['pick', 'tell', 'check', 'done'] as const;
type Step = (typeof STEPS)[number];

const todayIso = () => new Date().toISOString().slice(0, 10);

/** The heading each step announces itself with.
 *
 *  `tabIndex={-1}` so the step effect can move focus here: on a phone the
 *  consequence of a choice lands eight hundred pixels below the thumb that made
 *  it, and without this the screen reads as though nothing happened. Module
 *  level, and not a closure inside the page, because a component declared in a
 *  render body is a NEW type on every render — React unmounts the old <h2> and
 *  mounts a fresh one, taking that focus straight back off again. */
function StepHead(
  { headRef, children }:
  { headRef: RefObject<HTMLHeadingElement | null>; children: ReactNode },
) {
  return <h2 ref={headRef} tabIndex={-1} style={{ outline: 'none' }}>{children}</h2>;
}

// ── The land, always on the page ───────────────────────────────────────

/** The full card, at step 2 and on wide screens only.
 *
 *  This is the one step where the owner is still deciding, so the land is
 *  worth the height: the photograph or the boundary, the extent, the khata,
 *  and what the record can say about where it is. */
function LandRail({ rec, state }: { rec: RecordDetail; state: MapState }) {
  const geo = { ring: pairRing(rec.ring), lat: rec.lat, lon: rec.lon };
  return (
    <aside className="landrail">
      <Card title="This land">
        <div className="landart">
          <Icon name={rec.kind === 'parcel' ? 'parcel' : 'flat'} size={40} />
          <MapThumb {...geo} title={rec.title} />
        </div>
        <p style={{ margin: 'var(--space-sm) 0 0', fontWeight: 600 }}>{rec.title}</p>
        <p className="note" style={{ margin: '0.125rem 0 0' }}>{rec.placeLine}</p>
        <p className="note" style={{ margin: '0.25rem 0 0' }}>
          {extentLine(rec)}
          {rec.khataNo && ` · Khata ${rec.khataNo}`}
        </p>
        <p className={`note ${state === 'mapped' ? '' : 'accent'}`} style={{ margin: '0.5rem 0 0' }}>
          {MAP_WORD[state]}
        </p>
        <p style={{ margin: '0.25rem 0 0' }}>
          <Link className="link" to={`/app/records/${rec.id}/map`}>{MAP_LINK[state]}</Link>
        </p>
        <p style={{ margin: 'var(--space-sm) 0 0' }}>
          <Link className="link" to="/app/order">Change land</Link>
        </p>
      </Card>
    </aside>
  );
}

/** The same land, as one hairline row.
 *
 *  Used from step 3 onwards and at every width at or below the shell's
 *  breakpoint. The full card is about 400px; on a phone it was four hundred
 *  pixels of preamble the owner scrolled past on every one of four steps to
 *  place a single order. The review step restates the land in full anyway. */
function LandBar({ rec, state }: { rec: RecordDetail; state: MapState }) {
  const geo = { ring: pairRing(rec.ring), lat: rec.lat, lon: rec.lon };
  return (
    <aside className="landrail">
      <div className="landbar">
        <span className="thumb">
          <Icon name={rec.kind === 'parcel' ? 'parcel' : 'flat'} size={16} />
          <MapThumb {...geo} title={rec.title} />
        </span>
        <span className="grow">
          <strong style={{ fontSize: '0.875rem' }}>{rec.title}</strong>
          <span className="note" style={{ display: 'block' }}>
            {rec.placeLine} · {MAP_WORD[state]}
          </span>
        </span>
        <Link className="link" to="/app/order">Change land</Link>
      </div>
    </aside>
  );
}

// ── One question a service asks ────────────────────────────────────────

/** The old `Field` wrapped text, date and number inputs in `.search` — the
 *  pill this module uses for search boxes — so "Registered deed number" was
 *  dressed as something you search. It is gone: `input`, `select` and
 *  `textarea` are styled by element selector inside `.w360` and need no
 *  wrapper at all.
 *
 *  The help text was rendered and never linked, so a screen reader announced
 *  "How far back to trace" and stopped — "Banks usually ask for 30" existed
 *  only for people who could see it. `aria-describedby` is the whole fix. */
function AnswerField(
  { field, value, required, error, extraHelp, onChange }: {
    field: ServiceField; value: string; required: boolean; error: string;
    extraHelp?: string; onChange: (v: string) => void;
  },
) {
  const id = `sf-${field.name}`;
  const helpId = `${id}-help`;
  const errId = `${id}-err`;
  const help = [field.help, extraHelp].filter(Boolean);
  const described = [help.length ? helpId : '', error ? errId : ''].filter(Boolean).join(' ');
  const common = {
    id,
    value,
    'aria-required': required || undefined,
    'aria-invalid': error ? true : undefined,
    'aria-describedby': described || undefined,
  };
  const thisYear = new Date().getFullYear();
  return (
    <div className="field">
      <label htmlFor={id}>
        {field.label}{required && <span className="accent" aria-hidden> *</span>}
      </label>
      {field.kind === 'select' ? (
        // The server validates no membership, so the empty option is what
        // stands between a required select and an order carrying ''.
        <select {...common} onChange={(e) => onChange(e.target.value)}>
          <option value="">Choose…</option>
          {field.options.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      ) : field.kind === 'textarea' ? (
        <textarea {...common} rows={3} onChange={(e) => onChange(e.target.value)} />
      ) : field.kind === 'date' ? (
        // A preferred date in the past is not a preference, it is a typo.
        <input {...common} type="date" min={todayIso()} onChange={(e) => onChange(e.target.value)} />
      ) : field.kind === 'year' ? (
        <input {...common} type="number" min={1900} max={thisYear} step={1}
               onChange={(e) => onChange(e.target.value)} />
      ) : field.kind === 'number' ? (
        <input {...common} type="number" min={1} step={1} onChange={(e) => onChange(e.target.value)} />
      ) : (
        <input {...common} type="text" onChange={(e) => onChange(e.target.value)} />
      )}
      {help.length > 0 && (
        <p className="note" id={helpId} style={{ margin: 0 }}>{help.join(' ')}</p>
      )}
      {error && (
        <p className="note" id={errId} role="alert" style={{ margin: 0, color: 'var(--w-danger)' }}>
          {error}
        </p>
      )}
    </div>
  );
}

// ── What goes with the order ───────────────────────────────────────────

/** Everything filed, papers kept out of the photos, nothing capped.
 *
 *  Both of those were bugs already paid for on the old screen and are kept
 *  verbatim in spirit: it stopped at eight papers and six photos with nothing
 *  saying so, under a promise that the worker sees what is ticked here — so
 *  the one deed the advocate needed simply could not be ticked.
 *
 *  What is new is `compact`. A 22rem inner scroller inside a 667px phone
 *  screen, sitting between the answers and the button, is a scroll trap: the
 *  page stops moving and there is no way to know why. Below the breakpoint the
 *  list is behind a button instead. */
function Attachments(
  { papers, photos, picked, onToggle, compact }: {
    papers: Paper[]; photos: Photo[]; picked: string[];
    onToggle: (id: string) => void; compact: boolean;
  },
) {
  const [open, setOpen] = useState(false);
  if (compact && !open) {
    return (
      <button type="button" className="btn sm" onClick={() => setOpen(true)}>
        {picked.length === 0
          ? 'Nothing attached — choose files'
          : `${plural(picked.length, 'file')} attached — change`}
      </button>
    );
  }
  return (
    <div style={{ maxHeight: '22rem', overflowY: 'auto' }}>
      {papers.length > 0 && (
        <>
          <p className="note" style={{ marginBottom: '0.25rem' }}>Papers · {papers.length}</p>
          <div className="rows boxed">
            {papers.map((d) => (
              <label key={d.id} style={{ cursor: 'pointer' }}>
                <input type="checkbox" checked={picked.includes(d.id)}
                       onChange={() => onToggle(d.id)} />
                <span className="grow">
                  {d.title}
                  <span className="note" style={{ display: 'block' }}>{d.detail}</span>
                </span>
              </label>
            ))}
          </div>
        </>
      )}
      {photos.length > 0 && (
        <>
          <p className="note" style={{ margin: 'var(--space-sm) 0 0.25rem' }}>
            Photos and video · {photos.length}
          </p>
          <div className="rows boxed">
            {photos.map((x) => (
              <label key={x.id} style={{ cursor: 'pointer' }}>
                <input type="checkbox" checked={picked.includes(x.id)}
                       onChange={() => onToggle(x.id)} />
                <span className="grow">
                  {x.caption || x.fileName || 'Photo'}
                  <span className="note" style={{ display: 'block' }}>
                    {x.mediaKind === 'video' ? 'Video' : 'Photo'}
                    {x.capturedAt && ` · ${x.capturedAt.slice(0, 10)}`}
                  </span>
                </span>
              </label>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ── The screen ─────────────────────────────────────────────────────────

export function OrderService() {
  const rec = useRecordCtx();
  const [params, setParams] = useSearchParams();

  const service = params.get('service') ?? '';
  const why = params.get('why') ?? '';
  const wanted = (params.get('step') ?? 'pick') as Step;
  const step: Step = STEPS.includes(wanted) ? wanted : 'pick';

  const mapState = useMemo(() => mapStateOf(rec), [rec.ring, rec.lat, rec.lon]);

  const { data: offers, isLoading: offersLoading, error: offersErr } = useServicesOffered('');
  // Always the record's own id — never '', which makes the resolver drop the
  // filter and answer with every open order on the account. That cannot happen
  // here by construction now: the record is a path segment.
  const {
    data: existing, error: existingErr, refetch: refetchExisting,
  } = useOrders(rec.id);
  const { data: papers, error: papersErr, refetch: refetchPapers } = usePapers(rec.id);
  const { data: photos, error: photosErr, refetch: refetchPhotos } = usePhotos(rec.id);
  const order = useOrderService(false);

  const offer = service ? offers?.find((o) => o.key === service) : undefined;
  const paperList = useMemo(() => papers ?? [], [papers]);
  const photoList = useMemo(() => photos?.photos ?? [], [photos?.photos]);

  const [group, setGroup] = useState('');
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [attach, setAttach] = useState<string[]>([]);
  const [sendBoundary, setSendBoundary] = useState(true);
  const [showErrors, setShowErrors] = useState(false);
  const [err, setErr] = useState('');
  const [placed, setPlaced] = useState<{ found: Order | null; read: 'ok' | 'flying' | 'failed' } | null>(null);
  // Bumped whenever an intent is deliberately started over: after a refusal
  // the owner goes back and comes forward again, and "place a second one
  // anyway" means a genuinely second order. Both must mint a new key — the
  // same key with the same request hash replays the previous count WITHOUT
  // inserting, which would print "That is placed." over nothing at all.
  const [attempt, setAttempt] = useState(0);
  const intent = useRef({ fp: '', key: '' });
  const headRef = useRef<HTMLHeadingElement | null>(null);

  const compact = useNarrow(900);

  // ── The URL is the state ─────────────────────────────────────────────

  const go = useCallback((next: { step?: Step; service?: string | null }) => {
    const out: Record<string, string> = {};
    const sv = next.service === null ? '' : (next.service ?? service);
    if (sv) out.service = sv;
    if (why) out.why = why;
    out.step = next.step ?? step;
    setParams(out, { replace: false });
  }, [service, why, step, setParams]);

  // A step that cannot be honoured is corrected rather than rendered. Every
  // one of these is reachable by hand, by a stale bookmark, or by Android's
  // Back button landing on a step whose precondition has since gone.
  useEffect(() => {
    if ((step === 'tell' || step === 'check') && !offer && !offersLoading && offers) {
      setParams({ step: 'pick', ...(why ? { why } : {}) }, { replace: true });
    } else if (step === 'done' && !placed) {
      setParams({ step: 'pick', ...(why ? { why } : {}) }, { replace: true });
    }
  }, [step, offer, offersLoading, offers, placed, why, setParams]);

  // The choice's consequence has to land under the tap. Without this, choosing
  // a service at 375px changed a heading eight hundred pixels above the thumb
  // and read as nothing having happened at all.
  useEffect(() => {
    window.scrollTo({ top: 0 });
    headRef.current?.focus();
  }, [step]);

  // ── The draft ────────────────────────────────────────────────────────

  // Seeded once per service. `?a.<field>=` is how the one-tap buttons on the
  // Features and Photos hangers hand their answer over, and it is pruned to
  // this service's own fields on the way in — an unknown key would otherwise
  // ride to the server and render for ever as a stray Pair on the worker's
  // sheet.
  useEffect(() => {
    if (!offer) return;
    const draft = readDraft(rec.id, offer.key);
    const prefill: Record<string, string> = {};
    for (const f of offer.fields) {
      const v = params.get(`a.${f.name}`);
      if (v) prefill[f.name] = v;
    }
    setAnswers({ ...(draft?.answers ?? {}), ...prefill });
    setAttach(draft?.attach ?? []);
    setSendBoundary(draft?.sendBoundary ?? true);
    setShowErrors(false);
    setErr('');
    if (draft?.key) intent.current = { fp: draft.fp, key: draft.key };
    // Deliberately keyed on the service alone: re-running this on every param
    // change would wipe what has been typed each time the step advances.
  }, [offer?.key, rec.id]);

  const sheet = useMemo(
    () => (offer ? pruneSheet(offer.fields, answers) : {}),
    [offer?.key, offer?.fields, answers],
  );

  // Kept across a trip to the boundary screen and back, and across a reload.
  // The key rides with it, so returning to a half-composed order does not mint
  // a fresh one for an intent that has not changed.
  useEffect(() => {
    if (!offer || step === 'done') return;
    writeDraft(rec.id, offer.key, {
      answers, attach, sendBoundary, key: intent.current.key, fp: intent.current.fp,
    });
  }, [offer?.key, rec.id, answers, attach, sendBoundary, step]);

  // ── What this order needs ────────────────────────────────────────────

  const needsDirections = !!offer && groundService(offer) && mapState === 'none';
  const directionsField = offer ? DIRECTIONS_FIELD[offer.key] : undefined;

  const requiredNames = useMemo(() => {
    if (!offer) return new Set<string>();
    const s = new Set(offer.fields.filter((f) => f.required).map((f) => f.name));
    if (needsDirections && directionsField) s.add(directionsField);
    return s;
  }, [offer?.key, offer?.fields, needsDirections, directionsField]);

  const missing = useMemo(
    () => (offer?.fields ?? []).filter(
      (f) => requiredNames.has(f.name) && !String(sheet[f.name] ?? '').trim(),
    ),
    [offer?.fields, requiredNames, sheet],
  );

  // Only when there is a real ring to send. `capabilities.snapshot()` raises on
  // an empty boundary and `order_service` turns that into a bare 0 — so an
  // unguarded `includeBoundary: true` would kill the whole order and blame the
  // server for the owner's own record. The checkbox is ABSENT below three
  // corners, not disabled: there is nothing to decide.
  const canSendBoundary = !!offer && groundService(offer) && mapState === 'mapped';

  const duplicate = offer ? openSameJob(existing, offer.key) : undefined;

  // ── Filing it ────────────────────────────────────────────────────────

  const attachedPapers = useMemo(
    () => paperList.filter((d) => attach.includes(d.id)), [paperList, attach],
  );
  const attachedPhotos = useMemo(
    () => photoList.filter((p) => attach.includes(p.id)), [photoList, attach],
  );

  async function submit() {
    if (!offer) return;
    setErr('');
    // What the worker is given to look at, by NAME. Kept from the old screen:
    // a surveyor sent to the wrong field can be shown what they were actually
    // handed, which ids do not do.
    const named = [
      ...attachedPapers.map((d) => d.title),
      ...attachedPhotos.map((x) => x.caption || x.fileName || 'Photo'),
    ];
    const fp = fingerprint(rec.id, offer.key, sheet, attach, sendBoundary && canSendBoundary, attempt);
    if (intent.current.fp !== fp) intent.current = { fp, key: mintKey() };

    const before = new Set((existing ?? []).map((o) => o.id));
    let count = 0;
    try {
      count = await placeOrder(order.mutateAsync, {
        recordIds: [rec.id],
        kind: offer.key,
        note: noteFor(why, rec.title),
        params: named.length ? { ...sheet, shared: named.join(', ') } : sheet,
        manifest: {
          documentIds: attachedPapers.map((d) => d.id),
          photoIds: attachedPhotos.map((p) => p.id),
          ...(sendBoundary && canSendBoundary ? { includeBoundary: true } : {}),
        },
        idempotencyKey: intent.current.key,
      });
    } catch {
      // A throw is not a refusal. The order may be filed and only the answer
      // lost, so this points at the list rather than claiming nothing happened.
      setErr(ORDER_FAILED);
      void refetchExisting();
      return;
    }
    if (!count) {
      // Go and look at what is actually filed, then say what changed under the
      // owner's feet. This is the best that can be said without a per-record
      // outcome from the mutation.
      setErr(ORDER_REFUSED);
      const [p, ph] = await Promise.all([refetchPapers(), refetchPhotos()]);
      const live = new Set([
        ...(p.data ?? []).map((d) => d.id),
        ...(ph.data?.photos ?? []).map((x) => x.id),
      ]);
      setAttach((a) => a.filter((x) => live.has(x)));
      return;
    }

    clearDraft(rec.id, offer.key);
    setPlaced({ found: null, read: 'flying' });
    setParams({ service: offer.key, ...(why ? { why } : {}), step: 'done' }, { replace: true });
    // `orderService` returns a count, not an id, so the new job is found by
    // diffing the list. The reference on screen is then the server's own — it
    // is never derived here.
    try {
      const res = await refetchExisting();
      const fresh = (res.data ?? []).filter(
        (o) => !before.has(o.id) && (o.kind === offer.key),
      );
      setPlaced({ found: fresh.length === 1 ? fresh[0] : null, read: 'ok' });
    } catch {
      setPlaced({ found: null, read: 'failed' });
    }
  }

  // ── Steps ────────────────────────────────────────────────────────────

  return (
    <main>
      <RecordCrumbs rec={rec} here="Order a service" />
      <p className="eyebrow">{rec.title} · {rec.placeLine}</p>

      <div className={`orderflow${step === 'pick' && !compact ? '' : ' solo'}`}
           style={{ marginTop: 'var(--space-sm)' }}>
        {step === 'pick' && !compact
          ? <LandRail rec={rec} state={mapState} />
          : <LandBar rec={rec} state={mapState} />}

        <div className="stack">
          {step === 'pick' && (
            <PickStep
              rec={rec} offers={offers} loading={offersLoading} error={offersErr}
              existing={existing} existingErr={existingErr}
              mapState={mapState} group={group} setGroup={setGroup}
              service={service} headRef={headRef}
              onPick={(k) => go({ service: k, step: 'pick' })}
              onNext={() => go({ step: 'tell' })}
            />
          )}

          {step === 'tell' && offer && (
            <TellStep
              rec={rec} offer={offer} mapState={mapState} headRef={headRef}
              sheet={sheet} onAnswer={(n, v) => setAnswers((a) => ({ ...a, [n]: v }))}
              requiredNames={requiredNames} missing={missing} showErrors={showErrors}
              needsDirections={needsDirections} directionsField={directionsField}
              canSendBoundary={canSendBoundary}
              sendBoundary={sendBoundary} setSendBoundary={setSendBoundary}
              papers={paperList} photos={photoList} attach={attach}
              onToggle={(id) => setAttach((a) => (a.includes(id) ? a.filter((x) => x !== id) : [...a, id]))}
              filesErr={papersErr || photosErr}
              onRetryFiles={() => { void refetchPapers(); void refetchPhotos(); }}
              compact={compact}
              onBack={() => go({ service: null, step: 'pick' })}
              onNext={() => {
                if (missing.length > 0) { setShowErrors(true); return; }
                go({ step: 'check' });
              }}
            />
          )}

          {step === 'check' && offer && (
            <CheckStep
              rec={rec} offer={offer} mapState={mapState} headRef={headRef}
              sheet={sheet} attachedPapers={attachedPapers} attachedPhotos={attachedPhotos}
              sendBoundary={sendBoundary && canSendBoundary} canSendBoundary={canSendBoundary}
              duplicate={duplicate} duplicateUnknown={!!existingErr && !existing}
              err={err} placing={order.isPending}
              recordId={rec.id}
              onBack={() => { setAttempt((n) => n + 1); go({ step: 'tell' }); }}
              onPlace={() => { void submit(); }}
              onPlaceAnyway={() => { setAttempt((n) => n + 1); void submit(); }}
            />
          )}

          {step === 'done' && placed && offer && (
            <DoneStep rec={rec} offer={offer} placed={placed} headRef={headRef} />
          )}

          {/* Three ways to arrive at a step past the first with no service in
              hand, and they are three different sentences. The catalogue is
              still coming; the catalogue did not come; or the catalogue came
              and does not sell what the link names. The old screen had one
              answer for all three — the right-hand column said "Pick a service"
              for ever while the row on the left claimed to be the chosen one —
              and the second of them, an outage, drew nothing at all. */}
          {step !== 'pick' && step !== 'done' && !offer && offersLoading && (
            <Loading h="14rem" what="the service you chose" />
          )}
          {step !== 'pick' && step !== 'done' && !offer && !offersLoading && !offers && (
            <Failed what="The list of services" error={offersErr} boxed h="14rem" />
          )}
          {step !== 'done' && service && !offer && !offersLoading && offers && (
            <Card title="That service is no longer offered">
              <p className="note" style={{ marginBottom: 'var(--space-sm)' }}>
                The link you followed names a service this catalogue does not have. It may
                have been withdrawn or renamed. Nothing has been ordered.
              </p>
              <button type="button" className="btn" onClick={() => go({ service: null, step: 'pick' })}>
                Choose another
              </button>
            </Card>
          )}
        </div>
      </div>
    </main>
  );
}

// ── Step 2 ─────────────────────────────────────────────────────────────

function PickStep(
  { rec, offers, loading, error, existing, existingErr, mapState, group, setGroup,
    service, headRef, onPick, onNext }: {
    rec: RecordDetail; offers: ServiceOffer[] | undefined; loading: boolean; error: unknown;
    existing: Order[] | undefined; existingErr: unknown; mapState: MapState;
    group: string; setGroup: (g: string) => void; service: string;
    headRef: RefObject<HTMLHeadingElement | null>;
    onPick: (k: string) => void; onNext: () => void;
  },
) {
  const groups = useMemo(() => groupsOf(offers ?? []), [offers]);
  const shown = useMemo(
    () => (offers ?? []).filter((o) => !group || o.group === group),
    [offers, group],
  );

  // At most three sentences, each with somewhere to go. `paperCount` is on the
  // record already — fetching the papers list to count it would be a second
  // read for a number the parent route has held since the page opened.
  const needs: { say: string; to: string; word: string }[] = [];
  if (mapState !== 'mapped') {
    needs.push({
      say: mapState === 'pin'
        ? 'There is a pin on this land but nobody has drawn its edges.'
        : 'There is no boundary on record for this land.',
      to: `/app/records/${rec.id}/map`,
      word: MAP_LINK[mapState],
    });
  }
  if (rec.paperCount === 0) {
    needs.push({
      say: 'No papers are filed on this land yet.',
      to: `/app/records/${rec.id}`,
      word: 'Open Papers',
    });
  }
  const running = (existing ?? [])[0];
  if (running) {
    needs.push({
      say: `${aOrAn(running.title)} ${running.title.toLowerCase()} is already on order here.`,
      to: `/app/services/${running.id}`,
      word: 'Open the job',
    });
  }

  return (
    <>
      <StepHead headRef={headRef}>What do you want done on this land?</StepHead>

      <Card className="flat">
        {needs.length === 0 ? (
          <p className="note" style={{ margin: 0 }}>
            This land has its boundary and its papers on record.
          </p>
        ) : (
          <ul style={{ margin: 0, paddingLeft: '1.1rem' }}>
            {needs.map((n) => (
              <li key={n.word} className="note" style={{ marginBottom: '0.25rem' }}>
                {n.say} <Link className="link" to={n.to}>{n.word}</Link>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {loading && !offers ? (
        <Loading h="14rem" what="the list of services" />
      ) : !offers ? (
        <Failed what="The list of services" error={error} boxed h="16rem" />
      ) : offers.length === 0 ? (
        <Empty
          boxed h="16rem" icon="unsorted" title="There is nothing on offer just now"
          action={<Link className="btn" to={`/app/records/${rec.id}/request`}>Ask someone yourself</Link>}
        >
          Nothing is wrong with your land. You can still ask a surveyor, an advocate or a
          caretaker directly.
        </Empty>
      ) : (
        <>
          {/* The server sorts (group, label), which puts Legal first by
              alphabetical accident. Work on the ground is why most owners are
              here. */}
          {groups.length > 1 && (
            <div className="row tight" style={{ flexWrap: 'wrap' }}>
              <Chip active={!group} onClick={() => setGroup('')}>All</Chip>
              {groups.map((g) => (
                <Chip key={g} active={group === g} onClick={() => setGroup(g)}>{g}</Chip>
              ))}
            </div>
          )}

          {existingErr && !existing && (
            <p className="note">We could not check what is already running on this land.</p>
          )}

          {shown.length === 0 ? (
            <Empty
              boxed h="10rem" icon="search" title={`Nothing under ${group}`}
              action={<button type="button" className="btn sm" onClick={() => setGroup('')}>Show all</button>}
            />
          ) : (
            <div className="choice svc">
              {shown.map((o) => {
                const on = service === o.key;
                const already = openSameJob(existing, o.key);
                // First match wins, and the order is deliberate: what this land
                // needs beats what you already have, which beats what you get,
                // which beats what it is called, which beats the catalogue's
                // own description of the work.
                const sub = groundService(o) ? LAND_SENTENCE[o.key]?.[mapState]
                  : already ? 'You already have one of these running here.'
                  : DELIVERABLE[o.key] ?? ALSO_CALLED[o.key] ?? o.blurb;
                return (
                  <button key={o.key} type="button" aria-pressed={on} onClick={() => onPick(o.key)}>
                    <span className="row tight between svchead">
                      <strong>{o.label}</strong>
                      <Chip>{inr(o.price)}</Chip>
                    </span>
                    <small>about {o.days} days</small>
                    <small>{sub ?? o.blurb}</small>
                    {on && groundService(o) && mapState !== 'mapped' && (
                      <small>
                        <Link className="link" to={drawBack(rec.id, o.key)}
                              onClick={(e) => e.stopPropagation()}>
                          {MAP_LINK[mapState]}
                        </Link>
                      </small>
                    )}
                  </button>
                );
              })}
            </div>
          )}

          <p className="note">
            Not what you need?{' '}
            <Link className="link" to={`/app/records/${rec.id}/request`}>
              Ask someone you already work with.
            </Link>
          </p>

          <div className="row tight">
            <button type="button" className="btn primary" disabled={!service} onClick={onNext}>
              <HandshakeOutlined sx={{ fontSize: 16 }} /> Answer what it needs
            </button>
          </div>
        </>
      )}
    </>
  );
}

// ── Step 3 ─────────────────────────────────────────────────────────────

function TellStep(
  { rec, offer, mapState, headRef, sheet, onAnswer, requiredNames, missing, showErrors,
    needsDirections, directionsField, canSendBoundary, sendBoundary, setSendBoundary,
    papers, photos, attach, onToggle, filesErr, onRetryFiles, compact, onBack, onNext }: {
    rec: RecordDetail; offer: ServiceOffer; mapState: MapState;
    headRef: RefObject<HTMLHeadingElement | null>;
    sheet: Record<string, string>; onAnswer: (n: string, v: string) => void;
    requiredNames: Set<string>; missing: ServiceField[]; showErrors: boolean;
    needsDirections: boolean; directionsField: string | undefined;
    canSendBoundary: boolean; sendBoundary: boolean; setSendBoundary: (v: boolean) => void;
    papers: Paper[]; photos: Photo[]; attach: string[]; onToggle: (id: string) => void;
    filesErr: unknown; onRetryFiles: () => void; compact: boolean;
    onBack: () => void; onNext: () => void;
  },
) {
  const missingNames = new Set(missing.map((m) => m.name));
  return (
    <>
      <StepHead headRef={headRef}>What we need to know</StepHead>
      <p className="lede">
        {offer.label} on {rec.title}. {inr(offer.price)} · about {offer.days} days once
        somebody is on it.
      </p>

      <Card title="The questions">
        {offer.fields.length === 0 ? (
          <p className="note" style={{ margin: 0 }}>There is nothing to fill in for this one.</p>
        ) : (
          <>
            {requiredNames.size > 0 && (
              <p className="note" style={{ marginTop: 0 }}>
                Marked <span className="accent">*</span> — we cannot start without it.
              </p>
            )}
            <div className="stack qsheet">
              {offer.fields.map((f) => (
                <AnswerField
                  key={f.name} field={f} value={String(sheet[f.name] ?? '')}
                  required={requiredNames.has(f.name)}
                  error={showErrors && missingNames.has(f.name)
                    ? 'We need this before the order can go in.' : ''}
                  extraHelp={needsDirections && f.name === directionsField ? DIRECTIONS_HELP : undefined}
                  onChange={(v) => onAnswer(f.name, v)}
                />
              ))}
            </div>
          </>
        )}
      </Card>

      {/* Only for work somebody has to physically do, and only about what this
          record can actually say. The four paperwork services get no map
          sentence at all — an EC does not care where the land is. */}
      {groundService(offer) && (
        <Card title="Where this land is">
          <p className="note" style={{ marginTop: 0 }}>
            {LAND_SENTENCE[offer.key]?.[mapState]}
          </p>
          {canSendBoundary ? (
            <label className="check">
              <input type="checkbox" checked={sendBoundary}
                     onChange={() => setSendBoundary(!sendBoundary)} />
              <span className="grow">
                Send them the boundary you have drawn
                <span className="note" style={{ display: 'block' }}>
                  Only the outline goes — no name, no khata, no survey number.
                </span>
              </span>
            </label>
          ) : (
            <p className="note" style={{ marginBottom: 0 }}>{PIN_CANNOT_GO}</p>
          )}
        </Card>
      )}

      <Card
        title="What should they be given?"
        aside={<Chip>{attach.length} of {papers.length + photos.length}</Chip>}
      >
        <p className="note" style={{ marginTop: 0 }}>
          Whoever does this work sees only what you tick here.
        </p>
        {/* A read that failed is named here and nowhere else. The order still
            goes — a papers outage is not a reason to refuse to sell. */}
        {filesErr && papers.length === 0 && photos.length === 0 ? (
          <Failed what="What is filed on this land" error={filesErr} onRetry={onRetryFiles} />
        ) : papers.length === 0 && photos.length === 0 ? (
          <Empty
            icon="paper" title="Nothing is filed on this land yet"
            action={<Link className="btn sm" to={`/app/records/${rec.id}`}>File a paper first</Link>}
          >
            You can still order — they simply go without paperwork. Anything you file
            later will not be added to an order that has already gone in.
          </Empty>
        ) : (
          <Attachments papers={papers} photos={photos} picked={attach}
                       onToggle={onToggle} compact={compact} />
        )}
      </Card>

      {/* Safe first. The old row put the primary on the left and left Cancel
          live while the order was in flight. */}
      <div className="row tight">
        <button type="button" className="btn" onClick={onBack}>Choose a different service</button>
        <button type="button" className="btn primary" onClick={onNext}>Check the order</button>
      </div>
      {showErrors && missing.length > 0 && (
        <p className="note" role="alert" style={{ color: 'var(--w-danger)' }}>
          Still needed: {missing.map((m) => m.label).join(', ')}.
        </p>
      )}
    </>
  );
}

// ── Step 4 ─────────────────────────────────────────────────────────────

function CheckStep(
  { rec, offer, mapState, headRef, sheet, attachedPapers, attachedPhotos, sendBoundary,
    canSendBoundary, duplicate, duplicateUnknown, err, placing, recordId,
    onBack, onPlace, onPlaceAnyway }: {
    rec: RecordDetail; offer: ServiceOffer; mapState: MapState;
    headRef: RefObject<HTMLHeadingElement | null>;
    sheet: Record<string, string>; attachedPapers: Paper[]; attachedPhotos: Photo[];
    sendBoundary: boolean; canSendBoundary: boolean;
    duplicate: Order | undefined; duplicateUnknown: boolean;
    err: string; placing: boolean; recordId: string;
    onBack: () => void; onPlace: () => void; onPlaceAnyway: () => void;
  },
) {
  const answered = offer.fields
    .filter((f) => String(sheet[f.name] ?? '').trim())
    .map((f) => ({ k: f.label, v: sheet[f.name] }));

  const goesWith = [
    attachedPapers.length ? plural(attachedPapers.length, 'paper') : '',
    attachedPhotos.length ? plural(attachedPhotos.length, 'photo') : '',
  ].filter(Boolean).join(', ') || 'Nothing';

  const rows: { k: string; v: ReactNode; highlight?: boolean }[] = [
    { k: 'Land', v: `${rec.title} — ${rec.placeLine}` },
    { k: 'Service', v: offer.label },
    ...(DELIVERABLE[offer.key] ? [{ k: 'You get', v: DELIVERABLE[offer.key] }] : []),
    { k: 'Quoted', v: inr(offer.price), highlight: true },
    { k: 'Expected', v: `about ${offer.days} days once somebody is on it` },
    ...answered,
    { k: 'Goes with it', v: goesWith },
    ...(groundService(offer)
      ? [{
        k: 'Boundary',
        v: canSendBoundary
          ? (sendBoundary ? 'Sent with the order' : 'Not sent')
          : mapState === 'pin' ? 'Only a pin — nothing to send' : 'Nothing drawn yet',
      }]
      : []),
  ];

  return (
    <>
      <StepHead headRef={headRef}>Check this before it goes in</StepHead>

      <Card busy={placing}>
        <KV rows={rows} />

        {/* Word for word the vocabulary the ticket screen uses. "Paid from your
            wallet" is what the Services list used to say one click away, and it
            is wrong: funding is a separate later act. */}
        <p className="note" style={{ marginTop: 'var(--space-md)' }}>
          Nothing is taken now. {inr(offer.price)} is what this job costs. You set that money
          aside on the job itself, and it is only owed once you accept what came back.
        </p>
        {offer.key === 'patta_copy' && (
          <p className="note">
            {inr(offer.price)} is what is quoted for this job. The number of copies does not
            change it.
          </p>
        )}
      </Card>

      {duplicate && (
        <Card className="alert" title="You already have one of these here">
          <p className="note" style={{ marginTop: 0 }}>
            {aOrAn(duplicate.title)} {duplicate.title.toLowerCase()} is already running on this land
            {duplicate.stageLabel && ` — ${duplicate.stageLabel.toLowerCase()}`}
            {duplicate.cost > 0 && `, at ${inr(duplicate.cost)}`}.
          </p>
          <Link className="btn" to={`/app/services/${duplicate.id}`}>Open the one you have</Link>
        </Card>
      )}
      {/* Warn, never block. This screen restates the whole order before
          anything is committed, so an owner who means it can proceed; it is the
          one-tap buttons elsewhere that need a hard stop. */}
      {duplicateUnknown && (
        <p className="note">
          We could not check what is already running on this land, so look under{' '}
          <Link className="link" to={`/app/records/${recordId}/services`}>Services</Link>{' '}
          before you place a second one.
        </p>
      )}

      {err && (
        <p className="note" role="alert" style={{ color: 'var(--w-danger)' }}>
          {err}
          {err === ORDER_FAILED && (
            <>
              {' '}
              <Link className="link" to={`/app/records/${recordId}/services`}>
                See what is running here
              </Link>
            </>
          )}
        </p>
      )}

      <div className="row tight">
        <button type="button" className="btn" disabled={placing} onClick={onBack}>
          Go back and change something
        </button>
        <button type="button" className="btn primary" disabled={placing}
                onClick={duplicate ? onPlaceAnyway : onPlace}>
          <HandshakeOutlined sx={{ fontSize: 16 }} />
          {placing ? 'Placing…' : duplicate ? 'Place a second one anyway' : `Place the order · ${inr(offer.price)}`}
        </button>
      </div>
    </>
  );
}

// ── Step 5 ─────────────────────────────────────────────────────────────

function DoneStep(
  { rec, offer, placed, headRef }: {
    rec: RecordDetail; offer: ServiceOffer;
    placed: { found: Order | null; read: 'ok' | 'flying' | 'failed' };
    headRef: RefObject<HTMLHeadingElement | null>;
  },
) {
  const { found, read } = placed;
  return (
    <>
      <StepHead headRef={headRef}>
        <span className="row tight" style={{ alignItems: 'center' }}>
          <Icon name="ok" size={22} /> That is placed.
        </span>
      </StepHead>

      <Card>
        {read === 'flying' ? (
          // The headline stands on the count, which is proof enough that it was
          // filed. Only the reference waits.
          <Loading h="6rem" what="your new job" />
        ) : found ? (
          <p className="note" style={{ marginTop: 0 }}>
            {offer.label} on {rec.title}. It is job <strong className="mono">{found.ref}</strong>
            {found.dueDate && <>, and we expect it back by {ddmmyyyy(found.dueDate)}</>}.
            Nobody is on it yet — open it to put somebody on it, or to have Pattadar send
            it out.
          </p>
        ) : read === 'failed' ? (
          // A failed read after a successful write must never read as a failed
          // write.
          <p className="note" style={{ marginTop: 0 }}>
            We could not read the list back just now. The order is filed; you will find it
            under Services on this land.
          </p>
        ) : (
          // Zero new rows, or more than one. A reference is never invented.
          <p className="note" style={{ marginTop: 0 }}>
            {offer.label} is filed against {rec.title}. We could not pick it out of the list
            just now — it is under Services on this land.
          </p>
        )}

        <div className="row tight" style={{ marginTop: 'var(--space-md)' }}>
          {found && (
            <Link className="btn primary" to={`/app/services/${found.id}`}>Open the job</Link>
          )}
          <Link className="btn" to={`/app/records/${rec.id}/services`}>
            {found ? 'Back to this land' : 'See what is running here'}
          </Link>
        </div>
      </Card>
    </>
  );
}

// ── Width ──────────────────────────────────────────────────────────────

/** The attachment list and the land card both have to know whether they are on
 *  a phone, and CSS cannot collapse a scroller into a button. One listener,
 *  matchMedia rather than a resize handler, and it tolerates the older Safari
 *  that has `addListener` and not `addEventListener`. */
function useNarrow(px: number): boolean {
  const [narrow, setNarrow] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(`(max-width: ${px}px)`).matches,
  );
  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${px}px)`);
    const on = () => setNarrow(mq.matches);
    on();
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, [px]);
  return narrow;
}
