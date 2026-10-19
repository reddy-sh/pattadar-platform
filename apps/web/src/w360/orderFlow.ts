/** Everything the order flow knows that is not a screen.
 *
 *  Ordering happens in one flow (`/order`: properties, services, review),
 *  reached only through `orderHref` — the head's "Order a service", a row's
 *  menu, the one-tap buttons on the Features and Photos tabs — and they
 *  have to agree about the same six things: whether a piece of land is on the
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
import { num } from './ui';

// ── Is this land on the map? ───────────────────────────────────────────

/** The one way into ordering (founder, 10/10/2026: "order a service uses a
 *  single workflow only"). With the properties already known — a property's
 *  head, a row's menu, a selection — the flow opens on the services step with
 *  them chosen; `extra` carries a preset service, its answers (`a.<field>`)
 *  and the provenance word (`why`). */
export function orderHref(ids: string | readonly string[] = [], extra: Record<string, string> = {}): string {
  const list = typeof ids === 'string' ? [ids] : ids;
  const q = new URLSearchParams();
  if (list.length > 0) { q.set('for', list.join(',')); q.set('step', 'services'); }
  Object.entries(extra).forEach(([k, v]) => q.set(k, v));
  const s = q.toString();
  return s ? `/order?${s}` : '/order';
}

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
    pin: 'There is a pin on this land but no boundary. Setting the corners is the work.',
    none: 'Nothing on this property says where this land is. This is the service that puts '
      + 'that right — tell the surveyor where to come below.',
  },
  site_visit: {
    mapped: 'Your boundary is on record. The outline goes with the order, so the provider '
      + 'knows where the land ends.',
    pin: 'There is a pin on this land but nobody has drawn its edges. The provider will '
      + 'find the land; they will not know where it ends.',
    none: 'Nothing on this property says where this land is, so no provider can be sent to it yet.',
  },
  bore_point: {
    mapped: 'Your boundary is on record. The outline goes with the order, so the '
      + 'hydrogeologist studies the ground inside your corners.',
    pin: 'There is a pin on this land but no boundary. The hydrogeologist will find the land; '
      + 'tell them below where it ends.',
    none: 'Nothing on this property says where this land is. Tell the hydrogeologist where to '
      + 'come below.',
  },
};

/** When the record cannot say where the land is, the field to answer is the
 *  catalogue's own `directionsField` (survey `notes`, site visit `meet`) —
 *  never an invented params key: the server renders any key it does not
 *  recognise as a labelled Pair on the worker's sheet, for ever. */
export const DIRECTIONS_HELP =
  'Nobody can find this land from what is saved, so write down how to get there.';

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

/** The catalogue key behind an order.
 *
 *  The API persists `serviceKey` as the stable identity. An older row has only
 *  `kind`, which may be a legacy name (`opinion`, `visit`) the catalogue lists
 *  under the service's `aliases`. */
export const serviceKeyOf = (
  order: Pick<Order, 'kind' | 'serviceKey'>, offers: ServiceOffer[] = [],
): string => order.serviceKey || canonicalKey(order.kind, offers);

const canonicalKey = (kind: string, offers: ServiceOffer[]): string =>
  offers.find((o) => o.aliases.includes(kind))?.key ?? kind;

/** NOTE for whoever is here next: `useOrders(undefined)` and `useOrders('')`
 *  are not the same question. The resolver drops the filter when the id is
 *  falsy, so BOTH return every open order on the account — but the chooser
 *  wants that (it counts jobs per card) and the flow never does. The old
 *  screen called it with '' before a property had been picked and headed a
 *  survey on an unrelated parcel with "Already ordered here". In this design
 *  the record is a path segment, so the flow cannot mount without one. */
export const openSameJob = (
  orders: Order[] | undefined, key: string, offers: ServiceOffer[] = [],
): Order | undefined => {
  const want = canonicalKey(key, offers);
  return (orders ?? []).find((o) => serviceKeyOf(o, offers) === want);
};

// ── Where an order came from ───────────────────────────────────────────

/** The Features and Photos hangers used to place their own order inline. They
 *  now hand off into the flow, and their provenance — which is what the note
 *  on the order was for — comes with them. */
export const WHY_NOTE: Record<string, string> = {
  features: 'Asked for from the features list',
  photos: 'Asked for from the photos',
  boundary: 'Asked for from the boundary screen',
  owners: 'Asked for from the owners list',
  properties: 'Ordered from the properties list',
};

export const noteFor = (why: string, recordTitle: string): string =>
  WHY_NOTE[why] ?? `Ordered against ${recordTitle}`;

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

/** Going to draw a boundary and coming back to the order being composed.
 *
 *  `back` is the order page's own address, carrying the selection, the typed
 *  answers (`a.<service>.<field>`) and the ticked files (`att`), so the trip
 *  loses nothing the owner has done. */
export const drawBack = (recordId: string, back: string): string =>
  `/properties/${recordId}/location?draw=1&back=${encodeURIComponent(back)}`;

// ── Words for an order that came back ──────────────────────────────────

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
