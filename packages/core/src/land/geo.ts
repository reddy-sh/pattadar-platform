/**
 * Geographic sanity checks for land records.
 *
 * CL-565: a parcel in Mangala Kunta was saved with a pin in Sunnyvale,
 * California — 13,000 km away, next to a Home Depot. The "Use my location"
 * button captured the *device's* position, and the app accepted it without a
 * word. That is the normal case, not an edge case: people file land records at
 * home, at an office, or abroad. They are almost never standing on the land.
 *
 * So a captured coordinate is treated as a claim to be checked against what the
 * record already says about itself, never as ground truth.
 */

export interface LatLng {
  latitude: number;
  longitude: number;
}

const EARTH_RADIUS_KM = 6371;
const toRad = (deg: number) => (deg * Math.PI) / 180;

/** Great-circle distance in kilometres. */
export function haversineKm(a: LatLng, b: LatLng): number {
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.sin(dLon / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * How far a pin may sit from its village centre before we object.
 *
 * A village geocode resolves to the settlement, while farmland belongs to the
 * revenue village and can lie several kilometres out. 50 km is loose enough to
 * never nag about legitimately outlying fields, and tight enough that another
 * district — let alone another continent — always trips it.
 */
export const PLAUSIBLE_RADIUS_KM = 50;

export interface LocationSanity {
  /** True when the pin is implausibly far from where the record says it is. */
  suspect: boolean;
  distanceKm: number;
  /** Ready-to-render sentence, '' when nothing is wrong. */
  message: string;
}

/** Human distance: "1,200 km", "12 km", "800 m". */
export function formatDistance(km: number): string {
  if (km < 1) return `${Math.round(km * 1000)} m`;
  if (km < 10) return `${km.toFixed(1)} km`;
  return `${Math.round(km).toLocaleString('en-IN')} km`;
}

/**
 * Check a coordinate against the record's own locality.
 *
 * `centroid` is the geocoded village/mandal. When it is unknown the answer is
 * "not suspect" — an unverifiable pin must not be reported as a wrong one.
 */
export function checkLocation(
  pin: LatLng | null | undefined,
  centroid: LatLng | null | undefined,
  placeName = '',
  radiusKm = PLAUSIBLE_RADIUS_KM,
): LocationSanity {
  if (!pin || !centroid) return { suspect: false, distanceKm: 0, message: '' };
  const distanceKm = haversineKm(pin, centroid);
  if (distanceKm <= radiusKm) return { suspect: false, distanceKm, message: '' };
  const where = placeName ? ` from ${placeName}` : ' from this record’s village';
  return {
    suspect: true,
    distanceKm,
    message: `This location is ${formatDistance(distanceKm)}${where}. Phones report where you are standing, not where the land is.`,
  };
}

/** The states this app files in. */
export const DEFAULT_STATE = 'Andhra Pradesh';

/**
 * Place names to try on a geocoder, most specific first, for a record whose
 * address reads "Konakanamitla, Prakasam".
 *
 * The obvious ladder — drop the front of the chain one part at a time — is not
 * enough, and fails on exactly the records that need it. OpenStreetMap files
 * Konakanamitla under Markapuram, so "Konakanamitla, Prakasam, Andhra Pradesh"
 * matches NOTHING and the next rung is the whole district: a 20 km frame for a
 * village that would have resolved on its own. So each part is also tried
 * alone against the state, most specific first, and only then do we widen.
 */
export function placeCandidates(placeLine: string, state = DEFAULT_STATE): string[] {
  const parts = placeLine.split(',').map((x) => x.trim()).filter(Boolean);
  const tries = [
    ...(parts.length > 1 ? [[...parts, state].join(', ')] : []),
    ...parts.map((p) => `${p}, ${state}`),
    state,
  ];
  return [...new Set(tries)];
}

/**
 * A village name reduced to something two spellings of it can agree on.
 *
 * Telugu place names reach us through several transliterations and the records
 * themselves disagree: one parcel is filed in "Chintagunta" and the survey
 * department's shape file is "CHINTHAGUNTA"; another says "Konakanamitla"
 * where its own mandal says "Konakalamitla". Matching on the exact string
 * loses the village map over a single letter.
 *
 * So: fold case, drop anything that is not a letter, un-aspirate the
 * consonants that English spelling adds an 'h' to (th, dh, bh, gh, kh, ph),
 * and collapse doubles. Deliberately NOT a fuzzy distance — this maps the
 * known ways one name is written, and will not quietly match two different
 * villages that happen to look alike.
 */
export function villageKey(name: string): string {
  return (name || '')
    .toLowerCase()
    .replace(/[^a-z]/g, '')
    .replace(/([tdbgkp])h/g, '$1')
    .replace(/(.)\1+/g, '$1');
}

/* ── Handing a parcel to the device's own map ─────────────────────────────
 *
 * Pattadar draws its own maps on OpenStreetMap, which is free, key-free and
 * ours to style. But a person standing in a field wants turn-by-turn to the
 * bund, and that belongs to the maps app they already trust — Apple Maps on an
 * iPhone, whatever answers a `geo:` intent on Android.
 *
 * No consumer maps app accepts a boundary, so the hand-off is always a single
 * pin. `ringCentroid` decides where that pin lands.
 */

/** Which maps app this device would open, from its user agent.
 *
 *  iPadOS 13+ reports itself as "Macintosh" and is only told apart by having a
 *  touch screen — which does not matter here, because a Mac opens Apple Maps
 *  too. Both answer 'apple'. */
export type MapsApp = 'apple' | 'android' | 'osm';

export function mapsAppFor(userAgent: string): MapsApp {
  const ua = userAgent || '';
  if (/Android/i.test(ua)) return 'android';
  // Order matters: an iPhone UA contains "like Mac OS X".
  if (/iPhone|iPad|iPod/i.test(ua)) return 'apple';
  if (/Macintosh|Mac OS X/i.test(ua)) return 'apple';
  return 'osm';
}

export interface MapsLinkOptions {
  /** Name to show on the dropped pin — the survey number, usually. */
  label?: string;
  /** Zoom the app opens at; 17 frames a field without losing the road to it. */
  zoom?: number;
  /** Force a target instead of sniffing the user agent (tests, "open on the web"). */
  app?: MapsApp;
  userAgent?: string;
}

/** Six decimals is ~0.11 m — finer than any FMB corner, and short enough that
 *  the URL stays readable. Float noise (15.660260000000001) never ships. */
const coord = (n: number) => Number(n.toFixed(6)).toString();

/**
 * The pin's caption, made safe to put in a URL.
 *
 * Two documented traps, both live before this existed:
 *
 * 1. `encodeURIComponent` leaves `(` and `)` unescaped, and Android's label
 *    slot IS parentheses — `geo:lat,lon?q=lat,lon(Label)`. A village written
 *    "Mangalakunta (Konakanamitla)" therefore closes the label early and the
 *    rest becomes a malformed query.
 * 2. Apple documents `q` as a search field: "If you include a name in the value
 *    of the q parameter, Maps tries to match the name at the specified
 *    location." The longer and more address-like the string, the likelier Maps
 *    snaps its card to some POI it matched instead of captioning our pin. So
 *    the label stays SHORT — a survey number and a village, never a full
 *    address with mandal, district and state.
 *
 * `ll` still wins on Apple ("If you use both the ll and address parameters, ll
 *  takes precedence"), so the coordinate is never at risk; the caption is.
 */
export function safeMapLabel(label: string): string {
  return (label || '')
    .replace(/[()]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 60);
}

/**
 * A URL that opens this point in the right map for the device.
 *
 * Apple's is a universal link, not a scheme: on an iPhone, iPad or Mac it hands
 * off to the Maps app, and anywhere else the same URL is a web page — so it is
 * safe to render into an ordinary anchor. `t=k` opens on imagery, which is what
 * land is looked at on.
 *
 * Android gets `geo:`, so the choice of app stays the owner's — Google Maps,
 * OsmAnd, Organic Maps, whatever answers the intent.
 *
 * Everyone else gets OpenStreetMap, the same data the app's own tiles come from.
 */
export function mapsLink(pin: LatLng, options: MapsLinkOptions = {}): string {
  const { zoom = 17 } = options;
  const label = safeMapLabel(options.label ?? '');
  const app = options.app ?? mapsAppFor(options.userAgent ?? '');
  const lat = coord(pin.latitude);
  const lon = coord(pin.longitude);
  const name = encodeURIComponent(label);

  if (app === 'apple') {
    const q = name || `${lat},${lon}`;
    return `https://maps.apple.com/?ll=${lat},${lon}&q=${q}&t=k&z=${zoom}`;
  }
  if (app === 'android') {
    // geo:lat,lon?q=lat,lon(Label) drops a NAMED pin. `q=Label` alone is a
    // search, which lands on a different village whenever the label is a bare
    // survey number.
    const q = label ? `${lat},${lon}(${name})` : `${lat},${lon}`;
    return `geo:${lat},${lon}?q=${q}&z=${zoom}`;
  }
  return `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=${zoom}/${lat}/${lon}`;
}

/** What to call the button, so the promise matches what will actually open. */
export function mapsAppName(app: MapsApp): string {
  return app === 'apple' ? 'Apple Maps' : app === 'android' ? 'Maps' : 'OpenStreetMap';
}

/**
 * The area-weighted centroid of a boundary ring — where the pin goes when a
 * record has a surveyed shape rather than a single point.
 *
 * Averaging the corners instead would drag the pin towards whichever edge the
 * surveyor happened to mark most often; on an L-shaped field the plain average
 * can land outside the land altogether. The ring may be open or closed.
 */
export function ringCentroid(ring: LatLng[]): LatLng | null {
  const pts = ring.filter((p) => Number.isFinite(p?.latitude) && Number.isFinite(p?.longitude));
  if (pts.length === 0) return null;
  if (pts.length < 3) return pts[0];
  const first = pts[0];
  const last = pts[pts.length - 1];
  const open =
    first.latitude === last.latitude && first.longitude === last.longitude ? pts.slice(0, -1) : pts;
  if (open.length < 3) return open[0];

  let twiceArea = 0;
  let lat = 0;
  let lon = 0;
  for (let i = 0; i < open.length; i++) {
    const a = open[i];
    const b = open[(i + 1) % open.length];
    const cross = a.longitude * b.latitude - b.longitude * a.latitude;
    twiceArea += cross;
    lat += (a.latitude + b.latitude) * cross;
    lon += (a.longitude + b.longitude) * cross;
  }
  // A degenerate ring (all corners collinear, or duplicated) has no area to
  // weight by; the plain average is then the only honest answer.
  if (twiceArea === 0) {
    return {
      latitude: open.reduce((s, p) => s + p.latitude, 0) / open.length,
      longitude: open.reduce((s, p) => s + p.longitude, 0) / open.length,
    };
  }
  return { latitude: lat / (3 * twiceArea), longitude: lon / (3 * twiceArea) };
}
