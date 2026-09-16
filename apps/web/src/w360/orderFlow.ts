/** Everything the order flow knows that is not a screen.
 *
 *  Ordering happens on three surfaces now — the land chooser (`/app/order`),
 *  the flow itself (`/app/records/:id/order`) and the one-tap buttons on the
 *  Features and Photos hangers that hand off into it — and every one of them
 *  has to agree about the same six things: whether a piece of land is on the
 *  map, what to call that state, which services care, what counts as the same
 *  job twice, what the owner is actually buying, and how an order is made
 *  idempotent. Those agreements live here rather than in whichever screen
 *  happened to need them first.
 *
 *  No JSX: the one-tap buttons import `pruneSheet` and `WHY_NOTE` without
 *  pulling a page's worth of components with them.
 */
import { isLocated, pairRing } from './portfolioGeo';
import type { Order, ServiceField, ServiceOffer } from './api';
import { inrOr, num } from './ui';

// ── Is this land on the map? ───────────────────────────────────────────

export type MapState = 'mapped' | 'pin' | 'none';

/** The ring is tested FIRST, always, and this is not style.
 *
 *  Two traps sit either side of it. `RecordCard.lat/lon` is not the owner's
 *  pin — `_to_card` substitutes the ring's centroid when there is one — so a
 *  record with a drawn boundary and no pin still answers a coordinate, and
 *  "has a pin" inferred from lat/lon would be inventing one. And going the
 *  other way, `RecordDetail.lat` IS the raw pin, so a properly mapped record
 *  legitimately reads 0,0 and would be called unlocated by anything that
 *  asked about coordinates before it asked about corners.
 *
 *  `pairRing` and `isLocated` are used rather than `pairs` from ui.tsx:
 *  `pairs` chunks a flat array and validates no coordinate in it, so a ring of
 *  [0,0,0,0,0,0] would come back three corners strong. */
export function mapStateOf(r: { ring: number[]; lat: number; lon: number }): MapState {
  const geo = { ring: pairRing(r.ring), lat: r.lat, lon: r.lon };
  if (geo.ring.length >= 3) return 'mapped';
  return isLocated(geo) ? 'pin' : 'none';
}

/** Word for word what the Properties map list already says for the same three
 *  states. One piece of land must not be "Location pin only" on one screen and
 *  "Partly located" on the next. */
export const MAP_WORD: Record<MapState, string> = {
  mapped: 'Boundary on map',
  pin: 'Location pin only',
  none: 'Add a location to show on map',
};

export const MAP_LINK: Record<MapState, string> = {
  mapped: 'View / measure boundary',
  pin: 'Locate / draw boundary',
  none: 'Locate / draw boundary',
};

/** Which services care where the land actually is.
 *
 *  Keyed off the server's own group string, never a hardcoded
 *  ['survey','site_visit']. The catalogue is a Python dict that is expected to
 *  grow; a seventh service filed under "On the ground" is covered the day it
 *  ships, and a group name nobody here has heard of fails safe — no map
 *  sentence, no geometry, the order still goes. */
export const groundService = (o: ServiceOffer): boolean => o.group === 'On the ground';

/** What to say about the land, per service and per state.
 *
 *  A survey is NEVER blocked on an unmapped record. A product that refuses to
 *  sell the service which produces the map is broken — so the unmapped cases
 *  reword rather than refuse, which is the pattern RequestWork's `noGeo`
 *  opener already ships. */
export const LAND_SENTENCE: Record<string, Record<MapState, string>> = {
  survey: {
    mapped: 'Your boundary is on record. The outline goes with the order, so the '
      + 'surveyor starts from your corners.',
    pin: 'There is a pin on this land but no boundary. Establishing the corners is the job.',
    none: 'Nothing on this record says where this land is. This is the service that puts '
      + 'that right — tell the surveyor where to come below.',
  },
  site_visit: {
    mapped: 'Your boundary is on record. The outline goes with the order, so whoever goes '
      + 'knows where the land ends.',
    pin: 'There is a pin on this land but nobody has drawn its edges. Whoever goes will '
      + 'find the land; they will not know where it ends.',
    none: 'Nothing on this record says where this land is, so nobody can be sent to it yet.',
  },
};

/** The catalogue field that has to be answered when the record cannot say
 *  where the land is. Both are real catalogue fields — `survey.notes` and
 *  `site_visit.meet` — never an invented params key: the server renders any
 *  key it does not recognise as a labelled Pair on the worker's sheet, for
 *  ever. */
export const DIRECTIONS_FIELD: Record<string, string> = {
  survey: 'notes',
  site_visit: 'meet',
};

export const DIRECTIONS_HELP =
  'Nobody can find this land from the record, so write down how to get there.';

/** A pin cannot be sent. `capabilities.public_manifest` hands the worker
 *  `{items, boundary}` and nothing else — no lat, no lon, no place line — so
 *  any copy promising "they will be sent to the pin on your map" is a lie the
 *  code disproves. */
export const PIN_CANNOT_GO = 'A pin cannot go with the order — only a drawn boundary can.';

// ── The catalogue, as this flow reads it ───────────────────────────────

/** `servicesOffered` sorts (group, label), which puts Legal first and On the
 *  ground last by alphabetical accident. Work on the ground is the reason most
 *  owners are here, so the chip row orders it deliberately and appends any
 *  group this list has not heard of in the server's own order. */
export const GROUP_ORDER = ['On the ground', 'Records', 'Legal'];

export const groupsOf = (offers: ServiceOffer[]): string[] => {
  const seen: string[] = [];
  for (const o of offers) if (!seen.includes(o.group)) seen.push(o.group);
  return [
    ...GROUP_ORDER.filter((g) => seen.includes(g)),
    ...seen.filter((g) => !GROUP_ORDER.includes(g)),
  ];
};

/** What the owner actually receives. The catalogue's `blurb` describes the
 *  work; this describes the thing that lands in their hands, which is the
 *  question a review step has to answer before money is committed. An unknown
 *  key simply has no row — never a placeholder. */
export const DELIVERABLE: Record<string, string> = {
  ec: 'The registrar’s list of transactions, as a certificate',
  survey: 'A surveyor’s sheet with your corners pinned against the FMB',
  site_visit: 'Photographs and a written report of what was found',
  title_opinion: 'A written opinion from an advocate on whether the title is clean',
  mutation: 'The revenue record in the new owner’s name',
  patta_copy: 'A stamped copy of the passbook entry',
};

/** Services whose required answers belong to ONE parcel, so a set cannot share
 *  them.
 *
 *  `orderService` takes `recordIds` and files one job per record — that is what
 *  the bulk bar's "Order EC ×N" has always done — but it validates the answers
 *  ONCE for the whole call and then writes the same `params` onto every job.
 *  For most of the catalogue that is exactly right: two copies of each patta,
 *  one brief for every site visit, the same span of years on every EC.
 *
 *  For these two it is a lie the owner would only discover on delivery. A
 *  boundary re-survey asks which side and whether a neighbour is disputing it —
 *  "North, yes" is an answer about one parcel, not about forty. A mutation asks
 *  the new owner and the deed number, and the deed number IS the parcel.
 *
 *  So a set may not order these together, and the picker says so rather than
 *  filing forty jobs that all quote one parcel's deed. Ordering them one at a
 *  time still works and is the only correct shape.
 *
 *  The server cannot express this yet — nothing on `ServiceField` says "this
 *  varies per record" — so the rule lives here, in one place, next to the other
 *  vocabulary this flow keeps about the catalogue. If a seventh service arrives
 *  with a per-parcel answer, this set is the line to add it to. */
export const PER_PROPERTY = new Set(['survey', 'mutation']);

/** Can this service be ordered for several properties in one go? */
export const bulkable = (key: string) => !PER_PROPERTY.has(key);

/** What an owner calls it when they are not reading a catalogue.
 *
 *  This is the value the old debounced service-search box was reaching for and
 *  could not deliver: the server matches label, blurb and group, so typing
 *  "name transfer" or "EC" returned nothing and the box read as a control that
 *  says no. A line on the tile always answers; a box only answers if somebody
 *  has written the dictionary. Two entries today, and it extends by one line. */
export const ALSO_CALLED: Record<string, string> = {
  ec: 'Also called an EC',
  mutation: 'Also called a name transfer',
};

/** Kinds that count as "you already have one of these running here".
 *
 *  Not equality: `work_requests.kind` carries three vocabularies — catalogue
 *  keys from `orderService`, and the `survey`/`visit`/`opinion` openers from
 *  `createRequest` — so an owner who asked a surveyor directly last week and
 *  orders a re-survey today is doing the same thing twice under two names. */
export const SAME_JOB: Record<string, string[]> = {
  survey: ['survey'],
  site_visit: ['site_visit', 'visit'],
  title_opinion: ['title_opinion', 'opinion'],
  ec: ['ec'],
  mutation: ['mutation'],
  patta_copy: ['patta_copy'],
};

/** NOTE for whoever is here next: `useOrders(undefined)` and `useOrders('')`
 *  are not the same question. The resolver drops the filter when the id is
 *  falsy, so BOTH return every open order on the account — but the chooser
 *  wants that (it counts jobs per card) and the flow never does. The old
 *  screen called it with '' before a property had been picked and headed a
 *  survey on an unrelated parcel with "Already ordered here". In this design
 *  the record is a path segment, so the flow cannot mount without one. */
export const openSameJob = (orders: Order[] | undefined, key: string): Order | undefined =>
  (orders ?? []).find((o) => (SAME_JOB[key] ?? [key]).includes(o.kind));

// ── Where an order came from ───────────────────────────────────────────

/** The Features and Photos hangers used to place their own order inline. They
 *  now hand off into the flow, and their provenance — which is what the note
 *  on the order was for — comes with them. */
export const WHY_NOTE: Record<string, string> = {
  features: 'Asked for from the features list',
  photos: 'Asked for from the photos',
  boundary: 'Asked for from the boundary screen',
  properties: 'Ordered from the properties list',
};

export const noteFor = (why: string, recordTitle: string): string =>
  WHY_NOTE[why] ?? `Ordered against ${recordTitle}`;

/** "A encumbrance certificate" is what a template gets you when the thing it
 *  names is a catalogue label rather than a constant. Two of the six start
 *  with a vowel sound, and one of those — Encumbrance Certificate — is the
 *  service most owners order first. */
export const aOrAn = (word: string): string =>
  (/^[aeiou]/i.test(word.trim()) ? 'An' : 'A');

// ── Filing one order, once ─────────────────────────────────────────────

/** `crypto.randomUUID` exists only in a secure context.
 *
 *  `phone-local.sh` serves the app to a real iPhone over `http://<LAN-IP>`,
 *  which is not one — so on the very rig this project tests on, randomUUID is
 *  undefined, the submit handler threw before the mutation, and the Order
 *  button was silently inert: no error, no toast, `isPending` never set. The
 *  fallback is not cryptographic and does not need to be; it only has to be
 *  unique per intent per browser. */
export function mintKey(): string {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
  } catch {
    // Some embedded webviews throw on the property access itself.
  }
  return `k-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

/** Only the fields THIS service asks for.
 *
 *  The old sheet was `{...blank(offer.fields), ...answers}`, so an answer typed
 *  against a service the owner then changed their mind about rode along to the
 *  server, was stored on the order, and rendered for ever as a labelled Pair on
 *  the worker's sheet. Applied at submit and to the `?a.<field>=` prefill, so
 *  the one-tap buttons cannot open a second door to the same leak. */
export function pruneSheet(
  fields: ServiceField[], answers: Record<string, string>,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const f of fields) out[f.name] = String(answers[f.name] ?? '');
  return out;
}

/** One intent, one key.
 *
 *  The server hashes the request and replays the previous count for a repeated
 *  (key, hash) pair without inserting. So the key must be stable while the
 *  order is unchanged — a reload, an Android Back, a second press after a
 *  timeout — and must be re-minted the moment anything about the order
 *  changes, because the same key with a DIFFERENT hash answers 0, which is
 *  indistinguishable from a refusal. */
export function fingerprint(
  recordId: string, serviceKey: string, sheet: Record<string, string>,
  attach: string[], sendBoundary: boolean, attempt = 0,
): string {
  return JSON.stringify([recordId, serviceKey, sheet, [...attach].sort(), sendBoundary, attempt]);
}

// ── The draft ──────────────────────────────────────────────────────────

export interface Draft {
  answers: Record<string, string>;
  attach: string[];
  sendBoundary: boolean;
  key: string;
  fp: string;
  /** Set once the order is filed, so `?step=check` can bounce forward rather
   *  than offering "Place the order" over an order that is already placed —
   *  which is exactly where Android's Back button lands. */
  placed?: boolean;
}

const slot = (recordId: string, serviceKey: string) => `w360.order.${recordId}.${serviceKey}`;

/** Every read and write is wrapped: a private window throws on the property
 *  access, not on the call, and a draft is a convenience — losing it must
 *  never take the screen down with it. */
export function readDraft(recordId: string, serviceKey: string): Draft | null {
  try {
    const raw = sessionStorage.getItem(slot(recordId, serviceKey));
    return raw ? (JSON.parse(raw) as Draft) : null;
  } catch {
    return null;
  }
}

export function writeDraft(recordId: string, serviceKey: string, d: Draft): void {
  try {
    sessionStorage.setItem(slot(recordId, serviceKey), JSON.stringify(d));
  } catch {
    // Full, disabled or private. The flow still works; only the round trip to
    // the boundary screen stops being survivable.
  }
}

export function clearDraft(recordId: string, serviceKey: string): void {
  try {
    sessionStorage.removeItem(slot(recordId, serviceKey));
  } catch {
    // As above.
  }
}

/** Going to draw a boundary and coming back to the order being composed.
 *
 *  Offered only at step 2 — never over a half-filled answer sheet, where a
 *  link that leaves the page throws every typed field away. */
export const drawBack = (recordId: string, serviceKey: string): string =>
  `/app/records/${recordId}/map?draw=1&back=${encodeURIComponent(
    `/app/records/${recordId}/order?service=${serviceKey}&step=pick`,
  )}`;

// ── Words for an order that came back ──────────────────────────────────

/** `createRequest` writes cost 0, quoted 0 and due_date '' — an order raised
 *  by asking somebody directly has no price and no date. Without these the
 *  rail prints "₹0" and a dangling "due " against a perfectly good job. */
export const costWord = (o: Order): string => inrOr(o.cost, '');
export const dueWord = (o: Order): string => (o.dueDate ? `due ${o.dueDate}` : '');

/** The extent, said the way every other screen in the module says it.
 *
 *  `extent()` from ui.tsx rounds to the unit — on a card whose unit is spelled
 *  "acres" it prints 4.3 as "4 acres", and 1.2 as "1 acres". The Properties
 *  grid this chooser is deliberately a copy of prints the server's own
 *  `extentAlt` beside the figure, and the record screens print `extentDetail`,
 *  because land in Telangana is measured to the gunta and "4 acres" is a
 *  different piece of land from "4 acres 12 guntas". The same parcel must not
 *  state two sizes one click apart, least of all on the screen where work on
 *  it is being sold. */
export const extentLine = (
  r: { extent: number; extentUnit: string; extentAlt?: string; extentDetail?: string },
): string => {
  // `extentAlt` and `extentDetail` are the same figure written out in full —
  // "4 acres 12 guntas" — not a suffix to hang off the short one, so the
  // server's own words stand alone rather than being printed twice. The
  // fallback is `RecordBoundary`'s, to the decimal place it uses.
  const said = (r.extentDetail ?? r.extentAlt ?? '').trim();
  return said || `${num(r.extent, r.extentUnit === 'ac' ? 2 : 0)} ${r.extentUnit}`;
};

/** The card artwork class, as the Properties grid derives it. Shared so the
 *  chooser's cards are the same object the owner already recognises. */
export const artOf = (classification: string): string =>
  (classification === 'flat' || classification === 'open_plot' ? 'built'
    : classification === 'shop' ? 'shop' : '');
