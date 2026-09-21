/** Which land is this for — the one question an order cannot be composed
 *  without.
 *
 *  Every service Pattadar sells is done on exactly one piece of land, and the
 *  server enforces it: `orderService` takes `recordIds` and silently drops any
 *  id it cannot resolve for the caller. The old screen knew this and asked the
 *  question anyway in the worst possible place — a boxed card at the top of a
 *  page that already had the whole catalogue on it, listing ten of thirty
 *  parcels as bare text rows under an unlabelled search pill that looked
 *  exactly like the unlabelled search pill immediately below it, which
 *  searched something else entirely.
 *
 *  So the question gets its own screen, and the answer is shown the way the
 *  owner already recognises their land: as the card they see on the Properties
 *  grid, with its photograph or its boundary on the map, its extent, its khata
 *  and — new, and the point of the redesign — whether this record can say
 *  where the land actually is.
 *
 *  For ONE property this screen still composes nothing: pick the land and the
 *  record's own four-step flow takes over, because that is where a service's
 *  questions, its attachments and its review belong.
 *
 *  For MANY it composes the order itself, and that is the one case the long way
 *  round cannot serve. `orderService` has always taken `recordIds` and filed one
 *  job per record — it is what the Properties bulk bar's "Order EC ×N" does — so
 *  a holder with forty parcels in one village can tick them, answer the
 *  service's questions once, and see the total before anything is committed.
 *  Two services are kept out of that: see PER_PROPERTY in orderFlow.ts, because
 *  the server writes one set of answers onto every job in the batch and "North,
 *  yes" is an answer about one boundary.
 *
 *  The catalogue strip below the grid stays READING — tiles saying what exists
 *  and what it costs, because a first-time owner with no land added yet must
 *  still be able to see what this app is for.
 */
import { useMemo, useRef, useState } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router';
import SearchOutlined from '@mui/icons-material/SearchOutlined';

import {
  EMPTY_FILTER, placeOrder, useOrderService, useOrders, useProperties, useServicesOffered,
} from '../api';
import type { RecordCard, ServiceField, ServiceOffer } from '../api';
import {
  ALSO_CALLED, MAP_WORD, PER_PROPERTY, artOf, bulkable, extentLine, mapStateOf, mintKey,
  openSameJob,
} from '../orderFlow';
import { Dialog } from '../Dialog';
import { useToast } from '../Toast';
import { pairRing } from '../portfolioGeo';
import { surveyNumber } from '../surveyNumber';
import { SkRecordCards } from '../skeletons';
import { MapThumb } from '../MapThumb';
import { ServiceVisual } from '../ServiceVisual';
import {
  Chip, Empty, Failed, Icon, Loading, PageHead, PhotoImg, inr, num, plural,
} from '../ui';

/** How many cards before the fold. The old picker cut at ten and said so in a
 *  sentence under the rows, which is an apology rather than a control — the
 *  other twenty were reachable only by guessing that the box above searched
 *  them. A batch and a button is what the Properties grid already does. */
const PAGE = 24;

/** Above this many properties the grid stops being an answer to "which land"
 *  and becomes the haystack. Past it the question leads with the search box and
 *  the village chips, and nothing is drawn until the reader has narrowed to
 *  something they could actually read.
 *
 *  A three-parcel owner must never meet that: their whole portfolio is shorter
 *  than the question, so it IS the answer and the box would be furniture. */
const SEARCH_LEADS = 60;

/** The hard ceiling on cards mounted at once, whatever the count says.
 *
 *  Every card carries a Leaflet map thumbnail and a photograph, so "Show all"
 *  on a portfolio of three thousand was an offer to hang the browser. Past this
 *  the control stops being a button and becomes a sentence telling the reader
 *  how to narrow — which is the honest answer, because no one picks their land
 *  out of three thousand pictures by scrolling. */
const CAP = 48;

/** The village a record sits in — the first name in its place line, which is
 *  how `placeLine` is composed on the server and how the rest of this app
 *  reads it. It is the axis a large portfolio is actually organised along:
 *  nobody holds three thousand parcels scattered at random. */
const villageOf = (placeLine: string) => (placeLine.split(',')[0] || '').trim();

function LandCard({ c, to, jobs, picked, onPick }: {
  c: RecordCard; to: string; jobs: number | null;
  picked: boolean; onPick: (id: string) => void;
}) {
  // The same three-deep fallback the Properties grid uses: the photograph the
  // owner took, then the ground the record sits on, then the illustration for
  // what kind of thing it is. No arrangement of missing data leaves a card
  // blank — which matters most here, because the card with nothing to show is
  // exactly the one this redesign is about.
  const geo = { ring: pairRing(c.ring), lat: c.lat, lon: c.lon };
  const thumb = <MapThumb {...geo} title={c.title} />;
  const state = mapStateOf(c);
  /** A div with one anchor in it, not an anchor wrapped around everything.
   *
   *  The tick box has to be a sibling of the link, or it is interactive content
   *  inside an anchor — which HTML forbids and a screen reader reads out as a
   *  single link called "Include Sy 214/2, Sy 214/2, 2.80 ac, …". The whole card
   *  is still one click target: the stretched span inside the anchor covers it,
   *  and w360.css already lifts `.sel` above that span so the box stays
   *  clickable. This is the shape the Properties grid settled on. */
  return (
    <div className={`rec ${picked ? 'selected' : ''}`} style={{ position: 'relative' }}>
      <div className={`art ${artOf(c.classification)}`}>
        <Icon name={c.classification} size={46} />
        {c.coverFileRef
          ? <PhotoImg className="cardphoto" fileRef={c.coverFileRef} alt="" thumb={512} fallback={thumb} />
          : thumb}
        <span className="badges">
          <span className="sel">
            <input type="checkbox" checked={picked} aria-label={`Include ${c.title}`}
                   onChange={() => onPick(c.id)} />
          </span>
        </span>
      </div>
      <div className="meat">
        <span className="figure" style={{ display: 'block' }}>
          <Link className="recgo" to={to} style={{ color: 'inherit', textDecoration: 'none' }}>
            {c.title}
            <span aria-hidden style={{ position: 'absolute', inset: 0 }} />
          </Link>
        </span>
        <span className="note" style={{ display: 'block' }}>{c.placeLine}</span>
        <span className="note" style={{ display: 'block', marginTop: '0.25rem' }}>
          {extentLine(c)}
          {c.khataNo && ` · Khata ${c.khataNo}`}
        </span>
        {/* Said here, before a service is even a thought. An owner who learns
            at the review step that nobody can find their land has already
            answered three questions for nothing. */}
        <span className={`note ${state === 'mapped' ? '' : 'accent'}`}
              style={{ display: 'block', marginTop: '0.25rem' }}>
          {MAP_WORD[state]}
        </span>
        {/* Absent, not zero, while the read is in flight: the absence of a
            badge is not a claim that there is no work running here. */}
        {jobs !== null && jobs > 0 && (
          <span className="note" style={{ display: 'block' }}>
            {plural(jobs, 'job')} already running here
          </span>
        )}
      </div>
    </div>
  );
}

/** One of a service's own questions, asked once for the whole selection.
 *
 *  Only the kinds the catalogue actually uses — date, number, select, text,
 *  textarea, year. An unknown kind falls back to a text box rather than
 *  rendering nothing, because a required question with no control is an order
 *  the server will refuse with no way to satisfy it. */
function Answer({ f, value, onChange }: {
  f: ServiceField; value: string; onChange: (v: string) => void;
}) {
  const id = `bulk-${f.name}`;
  const common = { id, value, onChange: (e: { target: { value: string } }) => onChange(e.target.value) };
  return (
    <div className="field">
      <label htmlFor={id}>
        {f.label}
        {!f.required && <span className="note"> · optional</span>}
      </label>
      {f.kind === 'select' ? (
        <select {...common}>
          <option value="">Choose one</option>
          {f.options.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      ) : f.kind === 'textarea' ? (
        <textarea {...common} rows={3} />
      ) : (
        <input {...common}
               type={f.kind === 'number' || f.kind === 'year' ? 'number' : f.kind === 'date' ? 'date' : 'text'} />
      )}
      {f.help && <span className="note">{f.help}</span>}
    </div>
  );
}

/** A catalogue tile that composes nothing. Following it re-heads this same
 *  page — "Which land is the Boundary re-survey for?" — rather than opening an
 *  order against a property nobody has chosen. */
function OfferTile({ o, q }: { o: ServiceOffer; q: string }) {
  const to = `/app/order?service=${o.key}${q ? `&q=${encodeURIComponent(q)}` : ''}`;
  return (
    <Link className="rec service-catalog-tile" to={to}>
      <ServiceVisual serviceKey={o.key} label={o.label} visual={o.visual} variant="card" />
      <span className="service-catalog-copy">
        <span className="row tight between svchead">
          <strong style={{ fontSize: '0.9375rem' }}>{o.label}</strong>
          <Chip>{inr(o.price)}</Chip>
        </span>
        <span className="note service-meaning">{o.visual.caption}</span>
        <span className="note" style={{ display: 'block', marginTop: '0.25rem' }}>
          about {o.days} days
          {ALSO_CALLED[o.key] && ` · ${ALSO_CALLED[o.key]}`}
        </span>
      </span>
    </Link>
  );
}

export function OrderLand() {
  const [params, setParams] = useSearchParams();
  const service = params.get('service') ?? '';
  // The old flow carried the record in the query string, so every bookmark,
  // and two shipped links that still point here, name a property this screen
  // no longer composes against. They resolve: the record belongs in the path
  // now, and this is where it is put there.
  const legacy = params.get('record') ?? '';
  // The search text lives in the URL rather than in state so that following a
  // catalogue tile — which re-heads this page — does not throw away the
  // narrowing the owner has already typed, and a reload keeps it.
  const q = params.get('q') ?? '';
  // The two facets, in the URL for the same reasons `q` is: a chosen village is
  // most of the answer to "which land", and losing it to a catalogue tile or a
  // reload would send the reader back through three thousand cards.
  const village = params.get('village') ?? '';
  const running = params.get('running') === '1';
  const [limit, setLimit] = useState(PAGE);
  /** The selection. Deliberately NOT in the URL: a set of forty ids is not a
   *  link anybody sends, and it would push the address bar past what browsers
   *  and proxies carry. The narrowing that produced it is in the URL, which is
   *  the part worth restoring. */
  const [picked, setPicked] = useState<Set<string>>(new Set());
  /** Is the composing dialog open, and which service has been chosen in it.
   *  Two pieces of state because the dialog opens before a service is picked —
   *  choosing one IS its first question. */
  const [ordering, setOrdering] = useState(false);
  const [kind, setKind] = useState('');
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [orderErr, setOrderErr] = useState('');
  const order = useOrderService(false);
  const toast = useToast();
  const nav = useNavigate();

  const { data: mine, isLoading, error } = useProperties(EMPTY_FILTER);
  const { data: offers, isLoading: offersLoading, error: offersErr } = useServicesOffered('');
  // `undefined`, deliberately, and NOT '' — see the note over `openSameJob` in
  // orderFlow.ts. Here every open order on the account is exactly what is
  // wanted: the cards are counted from it.
  const { data: orders, error: ordersErr } = useOrders(undefined, false, true);
  // Only when a key was actually given. `servicesOffered` with an empty key
  // answers the whole catalogue, so taking [0] of it would silently re-head
  // this page after whichever service happens to sort first.
  const chosen = service ? offers?.find((o) => o.key === service) : undefined;

  const pool = useMemo(() => mine?.cards ?? [], [mine?.cards]);

  const jobsOn = useMemo(() => {
    if (!orders) return null;
    const n = new Map<string, number>();
    for (const o of orders) n.set(o.recordId, (n.get(o.recordId) ?? 0) + 1);
    return n;
  }, [orders]);

  /** The villages this portfolio is spread over, commonest first.
   *
   *  Derived rather than fetched: the place line already carries it, and a
   *  chip that says "Katragunta 40" answers the real question a large holder
   *  arrives with — not "which of my parcels" but "the ones over there". */
  const villages = useMemo(() => {
    const n = new Map<string, number>();
    pool.forEach((c) => {
      const v = villageOf(c.placeLine);
      if (v) n.set(v, (n.get(v) ?? 0) + 1);
    });
    return [...n.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  }, [pool]);

  const matches = useMemo(() => {
    const needle = q.trim().toLowerCase();
    // "120/2" and "120-2" and "Sy 120/2" are one survey number written three
    // ways, and this app already knows that — surveyNumber() is what the
    // record editor and the boundary sheet normalise through. Without it the
    // picker failed on the one string every owner types, because a plain
    // substring of "120/2" is not in the title "Sy 120-2".
    const asSurvey = surveyNumber(q);
    const wantVillage = village.trim().toLowerCase();
    return pool.filter((c) => {
      if (wantVillage && villageOf(c.placeLine).toLowerCase() !== wantVillage) return false;
      if (running && !(jobsOn?.get(c.id) ?? 0)) return false;
      if (!needle) return true;
      if (`${c.title} ${c.placeLine} ${c.khataNo}`.toLowerCase().includes(needle)) return true;
      return !!asSurvey && surveyNumber(c.title) === asSurvey;
    });
  }, [pool, q, village, running, jobsOn]);

  const visible = matches.slice(0, limit);
  /** Has the reader said anything yet that cuts the portfolio down? */
  const narrowed = !!q.trim() || !!village || running;
  /** Is the portfolio big enough that showing all of it answers nothing? */
  const searchLeads = pool.length > SEARCH_LEADS;

  /** One writer for the whole query string, so a facet cannot silently drop
   *  the search text or the service the reader came in with. */
  const go = (next: { q?: string; village?: string; running?: boolean }) => {
    const out: Record<string, string> = {};
    const nq = next.q ?? q;
    const nv = next.village ?? village;
    const nr = next.running ?? running;
    if (nq) out.q = nq;
    if (nv) out.village = nv;
    if (nr) out.running = '1';
    if (service) out.service = service;
    setParams(out, { replace: true });
    setLimit(PAGE);
  };
  const setQ = (v: string) => go({ q: v });

  const to = (id: string) =>
    `/app/records/${id}/order?${service ? `service=${service}&` : ''}step=pick`;

  const pick = (id: string) => setPicked((was) => {
    const next = new Set(was);
    if (!next.delete(id)) next.add(id);
    return next;
  });
  // Only what is on screen can be acted on, in the order it is drawn. A bar
  // that says "3 selected" must not file a fourth the reader filtered away.
  const chosenIds = useMemo(
    () => visible.filter((c) => picked.has(c.id)).map((c) => c.id),
    [visible, picked],
  );
  const armed = kind ? offers?.find((o) => o.key === kind) : undefined;
  const duplicateOrders = useMemo(() => {
    if (!armed || !orders) return [];
    return chosenIds.flatMap((recordId) => {
      const current = openSameJob(orders.filter((o) => o.recordId === recordId), armed.key);
      return current ? [current] : [];
    });
  }, [armed, chosenIds, orders]);
  const duplicateIds = new Set(duplicateOrders.map((o) => o.recordId));
  const eligibleIds = chosenIds.filter((id) => !duplicateIds.has(id));
  const missing = (armed?.fields ?? []).filter(
    (f) => f.required && !String(answers[f.name] ?? '').trim());

  /** One idempotency key per intent, not per press — the reasoning is the bulk
   *  bar's in Properties.tsx, and it is the same server contract: a key replays
   *  only for a matching request hash, so it is re-minted whenever the service,
   *  the records or the answers change, and deliberately kept when an attempt
   *  came back short so a second press cannot file the remainder twice. */
  const intent = useRef<{ fp: string; key: string } | null>(null);
  const keyFor = (kind: string, ids: string[], a: Record<string, string>) => {
    const fp = JSON.stringify([kind, ids, a]);
    if (intent.current?.fp !== fp) intent.current = { fp, key: mintKey() };
    return intent.current.key;
  };

  const closeArmed = () => {
    setOrdering(false);
    setKind('');
    setAnswers({});
    setOrderErr('');
  };

  async function placeForAll() {
    if (!armed || eligibleIds.length === 0 || missing.length > 0 || ordersErr) return;
    setOrderErr('');
    // Only the answers this service actually asked for. The state object
    // survives a change of service in the dialog, and posting a stale key
    // would change the request hash the idempotency key is pinned to.
    const params: Record<string, string> = {};
    armed.fields.forEach((f) => {
      const v = String(answers[f.name] ?? '').trim();
      if (v) params[f.name] = v;
    });
    try {
      const filed = await placeOrder(order.mutateAsync, {
        recordIds: eligibleIds,
        kind: armed.key,
        note: `Ordered for ${plural(eligibleIds.length, 'property', 'properties')} at once`,
        params,
        idempotencyKey: keyFor(armed.key, eligibleIds, params),
      });
      if (filed !== eligibleIds.length) {
        // Never "the order failed" over a batch that half landed: the count is
        // what the server actually filed, and the rest are still unordered.
        setOrderErr(filed > 0
          ? `${filed} of ${eligibleIds.length} were ordered. The rest were refused — reload and try those again.`
          : 'None of those were ordered, and nothing was charged. Reload the list and try again.');
        return;
      }
      intent.current = null;
      toast.ok(`${plural(filed, 'order')} placed — one on each property.`);
      setPicked(new Set());
      closeArmed();
      // The jobs are spread across records, so the account-wide list is the
      // only place that can show all of them at once.
      nav('/app/services');
    } catch {
      setOrderErr('That did not go through. Nothing was ordered — try again.');
    }
  }

  // A reader who followed a catalogue tile is answering a narrower question,
  // and the heading is where that is said. `chosen` may still be in flight, in
  // which case the general question is the honest one to ask.
  const heading = chosen
    ? `Which land is the ${chosen.label.toLowerCase()} for?`
    : 'Which land is this for?';

  if (legacy) {
    return (
      <Navigate replace
                to={`/app/records/${legacy}/order?${service ? `service=${service}&` : ''}step=pick`} />
    );
  }

  return (
    <main>
      <PageHead
        eyebrow="Order a service"
        title={heading}
        actions={service ? (
          <Link className="btn" to={q ? `/app/order?q=${encodeURIComponent(q)}` : '/app/order'}>
            Choose a different service
          </Link>
        ) : undefined}
      >
        <p className="lede">
          Every service is done on one piece of land. Choose it, and we will show you what
          that land actually needs.
        </p>
      </PageHead>

      {/* Four states, not one. A portfolio still loading, a read that failed,
          an account with no land yet and a search that matched nothing are
          four different answers, and the old screen gave the last three of
          them the same borderless box of zero height. */}
      {isLoading && !mine ? (
        <SkRecordCards count={6} />
      ) : !mine ? (
        <Failed what="Your land" error={error} boxed h="20rem" />
      ) : pool.length === 0 ? (
        <Empty
          boxed h="20rem" icon="parcel" title="No land to order against yet"
          action={<Link className="btn primary" to="/app/properties?new=1">Add a property</Link>}
        >
          A service is always done on one piece of land. Add the land first, then come back
          and order.
        </Empty>
      ) : (
        <>
          {/* Labelled, and deliberately not `.search`: that class is
              `justify-self: center; width: min(36rem, 100%)`, so nesting it in
              a `.field` grid centres the pill under a left-aligned label. */}
          <div className="field" style={{ maxWidth: '32rem', marginBottom: 'var(--space-md)' }}>
            <label htmlFor="land-q">Find your land</label>
            <span className="row tight" style={{ position: 'relative' }}>
              <SearchOutlined
                sx={{ fontSize: 16, position: 'absolute', left: '0.625rem', opacity: 0.55 }}
                aria-hidden
              />
              <input id="land-q" type="text" value={q} style={{ paddingLeft: '2rem' }}
                     autoFocus={searchLeads}
                     placeholder="Village, survey number or khata"
                     onChange={(e) => setQ(e.target.value)} />
            </span>
          </div>

          {/* The facets, and only where they earn their place: one village is
              not a choice, and a chip row longer than the grid it filters is
              just a second grid. Counts are on the chips because "Katragunta
              40" is the sentence a large holder is looking for. */}
          {(villages.length > 1 || (jobsOn && jobsOn.size > 0)) && (
            <div className="row tight" style={{ marginBottom: 'var(--space-md)' }}>
              <Chip active={!village && !running}
                    onClick={() => go({ village: '', running: false })}>
                All {num(pool.length)}
              </Chip>
              {villages.slice(0, 8).map(([name, n]) => (
                <Chip key={name} active={village.toLowerCase() === name.toLowerCase()} count={n}
                      onClick={() => go({ village: village.toLowerCase() === name.toLowerCase() ? '' : name })}>
                  {name}
                </Chip>
              ))}
              {/* Not a village, but the same kind of shortcut: the land you
                  have been dealing with lately is the land with work on it. */}
              {jobsOn && jobsOn.size > 0 && (
                <Chip active={running} count={jobsOn.size}
                      onClick={() => go({ running: !running })}>
                  A job running
                </Chip>
              )}
            </div>
          )}

          {/* The read that failed is named where it failed. Withholding thirty
              perfectly good cards because a count could not be fetched would
              be the outage deciding whether anything can be ordered. */}
          {ordersErr && (
            <p className="note" style={{ marginBottom: 'var(--space-sm)' }}>
              We could not check what is already running on your land.
            </p>
          )}

          {searchLeads && !narrowed ? (
            /* A big portfolio, and nothing said yet. Drawing the first
               twenty-four of three thousand parcels is not an answer to "which
               land" — it is the haystack with a lid on it. So the screen asks
               for a name instead, and names what it is holding so the reader
               knows the search box is not hiding an empty account. */
            <Empty
              boxed h="14rem" icon="search"
              title={`${num(pool.length)} properties in ${plural(villages.length, 'village')}`}
            >
              Type a survey number, a village or a khata above — or pick a village from the
              chips. Numbers match however you write them: 120/2 finds Sy 120-2.
            </Empty>
          ) : matches.length === 0 ? (
            <Empty
              boxed h="14rem" icon="search"
              title={q ? `No land matches “${q}”` : 'Nothing matches those filters'}
              action={(
                <button type="button" className="btn sm"
                        onClick={() => go({ q: '', village: '', running: false })}>
                  Clear
                </button>
              )}
            >
              Try the village name, the survey number or the khata number.
            </Empty>
          ) : (
            <>
              {/* `selecting` keeps every tick box visible once one is ticked —
                  otherwise the boxes fade back to a hover affordance and the
                  reader cannot see what else they have chosen. */}
              <div className={`cards ${picked.size > 0 ? 'selecting' : ''}`}>
                {visible.map((c) => (
                  <LandCard key={c.id} c={c} to={to(c.id)}
                            jobs={jobsOn ? (jobsOn.get(c.id) ?? 0) : null}
                            picked={picked.has(c.id)} onPick={pick} />
                ))}
              </div>
              {matches.length > visible.length && (
                <div className="loadmore" style={{ marginTop: 'var(--space-md)' }}>
                  <span className="hair" aria-hidden />
                  {/* A button while the rest can be drawn, a sentence once it
                      cannot. Past the ceiling, "show all" would mount hundreds
                      of map thumbnails to answer a question that scrolling
                      cannot answer anyway. */}
                  {limit < CAP ? (
                    <button type="button" className="btn sm"
                            onClick={() => setLimit(Math.min(matches.length, CAP))}>
                      Show {matches.length <= CAP
                        ? `all ${num(matches.length)}`
                        : `${num(CAP - limit)} more`}
                    </button>
                  ) : (
                    <span className="note">
                      Showing {num(visible.length)} of {num(matches.length)}. Narrow by village or
                      survey number to see the rest.
                    </span>
                  )}
                  <span className="hair" aria-hidden />
                </div>
              )}
            </>
          )}
        </>
      )}

      {/* Nothing about ordering for many exists until many are picked. The bar
          floats over the grid rather than sitting under it, so the cards it acts
          on stay on screen while it is read — the same bar, and the same
          reasoning, as the Properties list. */}
      {chosenIds.length > 0 && (
        <div className="selbar">
          <div className="bulkbar" role="group" aria-label="Order for the selected properties">
            <span className="count" role="status">
              {plural(chosenIds.length, 'property', 'properties')} selected — one job will be
              filed on each.
            </span>
            <span className="vrule" aria-hidden />
            <span className="acts">
              <button type="button" className="btn sm primary"
                      onClick={() => { setOrderErr(''); setOrdering(true); }}>
                Order a service ×{chosenIds.length}
              </button>
            </span>
            <button type="button" className="clearall" onClick={() => setPicked(new Set())}>
              Clear
            </button>
          </div>
        </div>
      )}

      {/* One dialog, doing what the single-property flow does in four steps:
          which service, its own questions, and the total before anything is
          committed. It can afford to be one screen because the land is already
          answered — that was the hard question. */}
      {ordering && (
        <Dialog
          wide
          title={`Order for ${plural(chosenIds.length, 'property', 'properties')}`}
          busy={order.isPending}
          dismissable={false}
          onClose={closeArmed}
          footer={(
            <>
              <button type="button" className="btn" onClick={closeArmed}>Cancel</button>
              <button type="button" className="btn primary"
                      disabled={!armed || missing.length > 0 || order.isPending
                        || eligibleIds.length === 0 || !!ordersErr}
                      onClick={() => void placeForAll()}>
                {order.isPending
                  ? 'Placing…'
                  : armed
                    ? eligibleIds.length > 0
                      ? `Place ${plural(eligibleIds.length, 'order')} · ${inr(armed.price * eligibleIds.length)}`
                      : 'Requests already exist'
                    : 'Choose a service'}
              </button>
            </>
          )}
        >
          {!offers ? (
            <Loading h="8rem" what="the list of services" />
          ) : (
            <>
              {/* One column: this is a list of choices to read down, not a grid
                  to scan. `.choice` already draws the pressed one with the
                  accent border and wash. */}
              <div className="choice" style={{ gridTemplateColumns: 'minmax(0, 1fr)' }}>
                {offers.filter((o) => bulkable(o.key)).map((o) => (
                  <button key={o.key} type="button" aria-pressed={kind === o.key}
                          onClick={() => { setKind(o.key); setAnswers({}); setOrderErr(''); }}>
                    <span className="row between" style={{ flexWrap: 'nowrap' }}>
                      <strong>{o.label}</strong>
                      <span className="num">{inr(o.price)} each</span>
                    </span>
                    <small>{o.blurb}</small>
                  </button>
                ))}
              </div>

              {/* Named, not hidden. A service missing from the list above with
                  no explanation reads as a service Pattadar does not sell. */}
              {offers.some((o) => PER_PROPERTY.has(o.key)) && (
                <p className="note" style={{ margin: 0 }}>
                  {offers.filter((o) => PER_PROPERTY.has(o.key)).map((o) => o.label).join(' and ')}
                  {' '}
                  {offers.filter((o) => PER_PROPERTY.has(o.key)).length > 1 ? 'ask' : 'asks'} something
                  about one parcel — which side, which deed — so they are ordered one property at a
                  time, from that property.
                </p>
              )}

              {/* The service's own questions, asked once and written onto every
                  job in the batch. That is what the server does with them. */}
              {armed && armed.fields.length > 0 && (
                <div className="stack sm">
                  {armed.fields.map((f) => (
                    <Answer key={f.name} f={f} value={answers[f.name] ?? ''}
                            onChange={(v) => setAnswers((a) => ({ ...a, [f.name]: v }))} />
                  ))}
                  <p className="note" style={{ margin: 0 }}>
                    This answer goes on all {plural(chosenIds.length, 'job')}.
                  </p>
                </div>
              )}

              {armed && (
                <p className="note" style={{ margin: 0 }}>
                  {plural(eligibleIds.length, 'new job')} at {inr(armed.price)} each, about {armed.days} days.
                  Nothing is charged now — the desk quotes each job and you pay when you choose to.
                </p>
              )}

              {duplicateOrders.length > 0 && (
                <div className="card alert" style={{ padding: 'var(--space-sm)' }}>
                  <strong>{plural(duplicateOrders.length, 'request')} already exists</strong>
                  <p className="note">
                    Those properties are excluded from this order. Open or cancel each existing
                    request before asking for the same work again.
                  </p>
                  <div className="row tight">
                    {duplicateOrders.map((existing) => (
                      <span className="row tight" key={existing.id}>
                        <Link className="btn sm" to={`/app/services/${existing.id}`}>
                          Open {existing.recordTitle || existing.ref}
                        </Link>
                        <Link className="btn sm danger" to={`/app/services/${existing.id}?action=cancel`}>
                          Cancel
                        </Link>
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {orderErr && (
                <p className="note" role="alert" style={{ margin: 0, color: 'var(--w-danger)' }}>
                  {orderErr}
                </p>
              )}
            </>
          )}
        </Dialog>
      )}

      {/* Below the grid, and rendered even when there is no land at all: a
          first-time owner has to be able to read what this costs before they
          are asked to add a property to find out. */}
      <section className="sec">
        <h2>What can be ordered</h2>
        {/* Counted, not spelled out. The catalogue is the server's and it is
            searchable precisely so it can grow past what a sentence here
            claims — "Six jobs" was already a hostage to the seventh. */}
        <p className="lede" style={{ marginTop: '0.375rem' }}>
          {offers ? `${plural(offers.length, 'job')}, on` : 'Work on'} any one piece of your land.
          Choose the land first — the price and the wait are the same whichever you pick.
        </p>
        <div style={{ marginTop: 'var(--space-md)' }}>
          {offersLoading && !offers ? (
            <Loading h="14rem" what="the list of services" />
          ) : !offers ? (
            <Failed what="The list of services" error={offersErr} boxed h="14rem" />
          ) : offers.length === 0 ? (
            <Empty boxed h="10rem" icon="unsorted" title="There is nothing on offer just now">
              Nothing is wrong with your land. You can still ask a surveyor, an advocate or a
              caretaker directly from any record.
            </Empty>
          ) : (
            <div className="cards">
              {offers.map((o) => <OfferTile key={o.key} o={o} q={q} />)}
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
