/** Location sanity tests — `bun run scripts/geo-tests.ts`. */
import {
  checkLocation, formatDistance, haversineKm,
  mapsAppFor, mapsAppName, mapsLink, parseBoundaryFile, placeCandidates, ringCentroid,
  villageKey, TILE_PX, boundsZoom, lonLatToPixel, pixelToLonLat, snapZoom,
  ringSides, compassPoint, cornerLabel, ringPerimM, SQ_M_PER_ACRE, ringAreaSqM, safeMapLabel,
  toBoundaryGeoJson, boundaryFileName,
  BoundaryFileError,
} from '../packages/core/src/index';

let failures = 0;
const check = (name: string, ok: boolean, detail = '') => {
  if (!ok) {
    failures += 1;
    console.error(`FAIL: ${name}${detail ? ` — ${detail}` : ''}`);
  }
};

// The actual bad row: parcel 9e098038, geo_point 37.374353,-122.019307,
// on a passbook whose village is Mangala Kunta, Prakasam district, AP.
const SUNNYVALE = { latitude: 37.374353, longitude: -122.019307 };
const MANGALA_KUNTA = { latitude: 15.7, longitude: 79.4 };

const d = haversineKm(SUNNYVALE, MANGALA_KUNTA);
check('the Sunnyvale pin is ~13,000 km from Mangala Kunta', d > 12_000 && d < 14_000, `${Math.round(d)} km`);

const bad = checkLocation(SUNNYVALE, MANGALA_KUNTA, 'Mangala Kunta');
check('it is reported as suspect', bad.suspect);
check('the message names the distance and the village', /13,\d\d\d km from Mangala Kunta/.test(bad.message), bad.message);

// Farmland legitimately sits outside the village settlement — this must be quiet.
const OUTLYING_FIELD = { latitude: 15.78, longitude: 79.46 };
check('a field 10 km out is fine', !checkLocation(OUTLYING_FIELD, MANGALA_KUNTA).suspect);

// A neighbouring district is not fine.
const HYDERABAD = { latitude: 17.385, longitude: 78.4867 };
check('another district trips the check', checkLocation(HYDERABAD, MANGALA_KUNTA).suspect);

// An unverifiable pin must never be reported as a wrong one.
check('no centroid → not suspect', !checkLocation(SUNNYVALE, null).suspect);
check('no pin → not suspect', !checkLocation(null, MANGALA_KUNTA).suspect);

// Distance formatting reads like a person wrote it.
check('sub-kilometre in metres', formatDistance(0.42) === '420 m', formatDistance(0.42));
check('single digits keep a decimal', formatDistance(3.14) === '3.1 km', formatDistance(3.14));
check('long distances group digits', formatDistance(13345) === '13,345 km', formatDistance(13345));

// Symmetry and the zero case.
check('distance is symmetric', Math.abs(haversineKm(SUNNYVALE, MANGALA_KUNTA) - haversineKm(MANGALA_KUNTA, SUNNYVALE)) < 1e-9);
check('same point is zero', haversineKm(MANGALA_KUNTA, MANGALA_KUNTA) === 0);

// ── Handing a parcel to the device's own map ────────────────────────────────

const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
const IPAD_13 = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15';
const MAC = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';
const ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36';
const WINDOWS = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';

// An iPhone UA contains "like Mac OS X", so the order of the sniffs is the test.
check('an iPhone opens Apple Maps', mapsAppFor(IPHONE) === 'apple', mapsAppFor(IPHONE));
// iPadOS 13+ lies about being a Mac. It opens Apple Maps either way.
check('an iPad reporting as a Mac still opens Apple Maps', mapsAppFor(IPAD_13) === 'apple');
check('a Mac opens Apple Maps', mapsAppFor(MAC) === 'apple');
check('an Android phone gets the geo: intent', mapsAppFor(ANDROID) === 'android', mapsAppFor(ANDROID));
check('everything else gets OpenStreetMap', mapsAppFor(WINDOWS) === 'osm', mapsAppFor(WINDOWS));
check('an empty user agent is not guessed', mapsAppFor('') === 'osm');

// Field No. 01, Mangalakunta — the centroid of the FMB ring in the test fixture.
const FIELD_01 = { latitude: 15.662204, longitude: 79.321775 };

const apple = mapsLink(FIELD_01, { label: 'Sy 71/2', userAgent: IPHONE });
check('apple link is a universal link, not a scheme', apple.startsWith('https://maps.apple.com/'), apple);
check('apple link carries the pin', apple.includes('ll=15.662204,79.321775'), apple);
check('apple link names the pin', apple.includes('q=Sy%2071%2F2'), apple);
check('apple link opens on imagery', apple.includes('t=k'), apple);

const android = mapsLink(FIELD_01, { label: 'Sy 71/2', userAgent: ANDROID });
check('android gets a geo: URI', android.startsWith('geo:15.662204,79.321775'), android);
// geo:...?q=Label alone is a SEARCH — a bare survey number finds another village.
check('android pins the coordinate, not the name', android.includes('q=15.662204,79.321775(Sy%2071%2F2)'), android);

const osm = mapsLink(FIELD_01, { label: 'Sy 71/2', userAgent: WINDOWS });
check('the fallback is OpenStreetMap, not a keyed service', osm.startsWith('https://www.openstreetmap.org/?mlat='), osm);
check('osm link marks and centres the same point', osm.includes('mlat=15.662204') && osm.includes('#map=17/15.662204/79.321775'), osm);

check('the target can be forced past the sniff', mapsLink(FIELD_01, { app: 'osm', userAgent: IPHONE }).includes('openstreetmap.org'));
check('an unnamed pin still resolves', mapsLink(FIELD_01, { userAgent: IPHONE }).includes('q=15.662204,79.321775'));
// Float noise must never reach a URL.
check('coordinates are trimmed, not stringified raw',
  mapsLink({ latitude: 15.66026, longitude: 79.31919 }, { app: 'osm' }).includes('mlat=15.66026'),
  mapsLink({ latitude: 15.66026, longitude: 79.31919 }, { app: 'osm' }));

check('the button can name what will open', mapsAppName('apple') === 'Apple Maps' && mapsAppName('osm') === 'OpenStreetMap');

// ── Where the pin lands on a shape ──────────────────────────────────────────

// Field No. 01, Mangalakunta: the 9 corners of the FMB ring, in ring order.
const MANGALAKUNTA_RING = [
  [15.66567, 79.32177], [15.66514, 79.32274], [15.66486, 79.32344],
  [15.66464, 79.32437], [15.66053, 79.32334], [15.65922, 79.32252],
  [15.65872, 79.32146], [15.66026, 79.31919], [15.66072, 79.31944],
].map(([latitude, longitude]) => ({ latitude, longitude }));

const c = ringCentroid(MANGALAKUNTA_RING)!;
check('the centroid of the real ring is inside its bounding box',
  c.latitude > 15.65872 && c.latitude < 15.66567 && c.longitude > 79.31919 && c.longitude < 79.32437,
  `${c.latitude},${c.longitude}`);
// Closing the ring is the same shape and must not move the pin.
const closed = [...MANGALAKUNTA_RING, MANGALAKUNTA_RING[0]];
check('a closed ring gives the same centroid as an open one',
  Math.abs(ringCentroid(closed)!.latitude - c.latitude) < 1e-12 &&
  Math.abs(ringCentroid(closed)!.longitude - c.longitude) < 1e-12);

// An L-shape is the case corner-averaging gets wrong: the plain average of
// these six corners sits at 0.333,0.333, which is fine — but weight by area
// and the true centroid is 0.4166,0.4166, further into the mass of the L.
const L_SHAPE = [[0, 0], [0, 1], [0.5, 1], [0.5, 0.5], [1, 0.5], [1, 0]]
  .map(([latitude, longitude]) => ({ latitude, longitude }));
const lc = ringCentroid(L_SHAPE)!;
check('an L-shape is weighted by area, not by corner count',
  Math.abs(lc.latitude - 0.4166667) < 1e-5 && Math.abs(lc.longitude - 0.4166667) < 1e-5,
  `${lc.latitude},${lc.longitude}`);

check('no ring, no pin', ringCentroid([]) === null);
check('a single corner is its own centroid', ringCentroid([FIELD_01])!.latitude === FIELD_01.latitude);
// Three identical corners enclose nothing; the average is the only honest answer.
const degenerate = ringCentroid([FIELD_01, FIELD_01, FIELD_01])!;
check('a degenerate ring falls back to the average', Math.abs(degenerate.latitude - FIELD_01.latitude) < 1e-9);

// ── Which place names to ask a geocoder ──────────────────────────────────
//
// The real record: "Konakanamitla, Prakasam". OpenStreetMap files that village
// under Markapuram, so the full chain matches nothing — and a ladder that only
// drops the front of the chain lands on the district, framing 20 km of country
// for a village that resolves perfectly well on its own.
const ladder = placeCandidates('Konakanamitla, Prakasam');
check('the full chain is tried first',
  ladder[0] === 'Konakanamitla, Prakasam, Andhra Pradesh', ladder[0]);
check('the village alone is tried BEFORE widening to the district',
  ladder.indexOf('Konakanamitla, Andhra Pradesh') < ladder.indexOf('Prakasam, Andhra Pradesh'),
  ladder.join(' | '));
check('the state is the last resort', ladder[ladder.length - 1] === 'Andhra Pradesh');
check('no name is asked twice', new Set(ladder).size === ladder.length, ladder.join(' | '));

const single = placeCandidates('Kothapalli');
check('a lone village yields the village then the state',
  single.join(' | ') === 'Kothapalli, Andhra Pradesh | Andhra Pradesh', single.join(' | '));
check('an empty address still offers the state',
  placeCandidates('').join('') === 'Andhra Pradesh', placeCandidates('').join('|'));

// ── Reading a boundary out of a file the owner already has ───────────────
//
// The fixture is the founder's own Mangalakunta export, so the numbers below
// are a real parcel's and not invented ones.
const MANGALAKUNTA_GEOJSON = JSON.stringify({
  type: 'Feature',
  geometry: { type: 'Polygon', coordinates: [[
    [79.32177, 15.66567], [79.32274, 15.66514], [79.32344, 15.66486],
    [79.32437, 15.66464], [79.32334, 15.66053], [79.32252, 15.65922],
    [79.32146, 15.65872], [79.31919, 15.66026], [79.31944, 15.66072],
    [79.32177, 15.66567],
  ]] },
  properties: { village: 'Mangalakunta', area_ac: 59.9 },
});

const gj = parseBoundaryFile(MANGALAKUNTA_GEOJSON);
check('GeoJSON is read lat-first, not as it is written',
  Math.abs(gj.ring[0][0] - 15.66567) < 1e-9 && Math.abs(gj.ring[0][1] - 79.32177) < 1e-9,
  gj.ring[0].join(','));
// Read lon-first, this parcel lands at 79°N 15°E — the Barents Sea.
check('no corner is out of range', gj.ring.every(([la, lo]) => Math.abs(la) <= 90 && Math.abs(lo) <= 180));
check('the closing corner is dropped', gj.ring.length === 9, String(gj.ring.length));
check('the village name comes along', gj.name === 'Mangalakunta', gj.name);

// The same nine corners as a surveyor's KML, which writes lon,lat,alt.
const KML = `<?xml version="1.0"?><kml><Document><name>Field No. 01</name>
<Placemark><Polygon><outerBoundaryIs><LinearRing><coordinates>
${JSON.parse(MANGALAKUNTA_GEOJSON).geometry.coordinates[0]
    .map(([lo, la]: number[]) => `${lo},${la},0`).join(' ')}
</coordinates></LinearRing></outerBoundaryIs></Polygon></Placemark></Document></kml>`;
const kml = parseBoundaryFile(KML, 'field.kml');
check('KML gives the same ring as the GeoJSON',
  JSON.stringify(kml.ring) === JSON.stringify(gj.ring));
check('KML altitude in the triple is ignored', kml.ring[0].length === 2);
check('the KML name is read', kml.name === 'Field No. 01', kml.name);

// A surveyor's KML often carries the walked track as well as the parcel; the
// parcel is the Polygon, and it must win.
const BOTH = `<kml><Placemark><LineString><coordinates>1,1 2,2 3,3</coordinates></LineString></Placemark>
<Placemark><Polygon><outerBoundaryIs><LinearRing><coordinates>
79.1,15.1 79.2,15.1 79.2,15.2 79.1,15.2 79.1,15.1
</coordinates></LinearRing></outerBoundaryIs></Polygon></Placemark></kml>`;
check('a Polygon outranks a stray LineString',
  parseBoundaryFile(BOTH, 'x.kml').ring.length === 4);

// Refusals a person can act on, not stack traces.
const refuses = (text: string, why: string) => {
  try { parseBoundaryFile(text, 'x.kml'); check(why, false, 'no error thrown'); }
  catch (e) { check(why, e instanceof BoundaryFileError, String(e)); }
};
refuses('', 'an empty file is refused');
refuses('<kml><coordinates>79.1,15.1 79.2,15.2</coordinates></kml>',
  'two corners enclose nothing and are refused');
refuses('not xml and not json', 'unreadable text is refused');

// A FeatureCollection, which is what most tools actually export.
const fc = parseBoundaryFile(JSON.stringify({
  type: 'FeatureCollection',
  features: [JSON.parse(MANGALAKUNTA_GEOJSON)],
}));
check('a FeatureCollection is unwrapped', fc.ring.length === 9, String(fc.ring.length));

// ── Sides of a boundary ──────────────────────────────────────────────────
//
// Field No. 01, Mangalakunta again — a real nine-corner parcel.
const FIELD = [
  [15.66567, 79.32177], [15.66514, 79.32274], [15.66486, 79.32344],
  [15.66464, 79.32437], [15.66053, 79.32334], [15.65922, 79.32252],
  [15.65872, 79.32146], [15.66026, 79.31919], [15.66072, 79.31944],
] as [number, number][];

const sides = ringSides(FIELD);
check('a nine-corner ring has nine sides — it closes', sides.length === 9, String(sides.length));
check('corners are numbered from 1, and the last side returns to 1',
  sides[0].from === 1 && sides[0].to === 2 && sides[8].from === 9 && sides[8].to === 1,
  JSON.stringify([sides[0], sides[8]]));
// The sides must add up to the perimeter, or the table and the summary would
// print two different parcels.
const sumSides = sides.reduce((t, x) => t + x.metres, 0);
check('the sides sum to the perimeter', Math.abs(sumSides - ringPerimM(FIELD)) < 1e-6,
  `${sumSides} vs ${ringPerimM(FIELD)}`);

// An open path of two points is one side and does not close back on itself.
check('two corners make one side, not two', ringSides(FIELD.slice(0, 2)).length === 1);
check('fewer than two corners has no sides', ringSides([FIELD[0]]).length === 0);

// Bearings: due north and due east, checked against a hand-built square.
const SQ = [[15, 79], [16, 79], [16, 80], [15, 80]] as [number, number][];
const sq = ringSides(SQ);
check('a due-north side bears 0\u00b0', Math.abs(sq[0].bearing) < 0.5, String(sq[0].bearing));
check('a due-east side bears about 90\u00b0', Math.abs(sq[1].bearing - 90) < 1, String(sq[1].bearing));
check('north reads as N', compassPoint(sq[0].bearing) === 'N', compassPoint(sq[0].bearing));
check('east reads as E', compassPoint(sq[1].bearing) === 'E', compassPoint(sq[1].bearing));
check('compass wraps past 360', compassPoint(359) === 'N' && compassPoint(-1) === 'N');
check('45\u00b0 is NE', compassPoint(45) === 'NE', compassPoint(45));

// The acre constant must be the exact one, not the truncated literal that had
// spread to three other call sites.
check('an acre is 4046.8564224 m\u00b2 exactly', SQ_M_PER_ACRE === 4046.8564224);
check('Field No. 01 measures about 60 acres',
  Math.abs(ringAreaSqM(FIELD) / SQ_M_PER_ACRE - 60.2) < 0.1,
  String(ringAreaSqM(FIELD) / SQ_M_PER_ACRE));

// ── The caption on the dropped pin ───────────────────────────────────────
//
// Android's label slot is literally parentheses — geo:lat,lon?q=lat,lon(Label)
// — and encodeURIComponent does NOT escape them, so a name carrying its own
// brackets closes the label early and corrupts the URI.
check('parentheses are stripped from a label',
  safeMapLabel('Mangalakunta (Konakanamitla)') === 'Mangalakunta Konakanamitla',
  safeMapLabel('Mangalakunta (Konakanamitla)'));
check('whitespace is collapsed', safeMapLabel('  Sy   71/2  ') === 'Sy 71/2');
check('a runaway label is capped', safeMapLabel('x'.repeat(200)).length === 60);
check('an empty label stays empty', safeMapLabel('') === '' && safeMapLabel(undefined as never) === '');

const brackets = mapsLink({ latitude: 15.6, longitude: 79.3 },
  { label: 'Sy 71/2 (old survey)', app: 'android' });
check('no raw parenthesis survives into the android label',
  (brackets.match(/\(/g) || []).length === 1 && (brackets.match(/\)/g) || []).length === 1,
  brackets);

// Apple: the coordinate must be the one we gave, whatever the label says.
const appleLabelled = mapsLink({ latitude: 15.616405, longitude: 79.458318 },
  { label: 'Sy 71/2, Konakanamitla', app: 'apple' });
check('apple keeps our exact coordinate',
  appleLabelled.includes('ll=15.616405,79.458318'), appleLabelled);
check('apple carries the label in q',
  appleLabelled.includes('q=Sy%2071%2F2%2C%20Konakanamitla'), appleLabelled);
check('the survey number slash is encoded, not left to split the query',
  !appleLabelled.includes('71/2'), appleLabelled);

// ── Handing the boundary back out ────────────────────────────────────────
const exported = JSON.parse(toBoundaryGeoJson(FIELD, {
  title: 'Sy 71/2', village: 'Mangalakunta', khataNo: '593',
  areaAcres: 60.204, perimeterM: 2029.04,
}));
check('it is a Feature with a Polygon', exported.type === 'Feature'
  && exported.geometry.type === 'Polygon');
// The trap, in reverse: GeoJSON is lon-first and our rings are lat-first.
check('the export writes longitude first',
  Math.abs(exported.geometry.coordinates[0][0][0] - 79.32177) < 1e-9
  && Math.abs(exported.geometry.coordinates[0][0][1] - 15.66567) < 1e-9,
  JSON.stringify(exported.geometry.coordinates[0][0]));
// RFC 7946 requires a closed ring even though we store it open.
const outRing = exported.geometry.coordinates[0];
check('the ring is closed for export', outRing.length === FIELD.length + 1
  && JSON.stringify(outRing[0]) === JSON.stringify(outRing[outRing.length - 1]),
  String(outRing.length));
check('the properties carry the record', exported.properties.survey_no === 'Sy 71/2'
  && exported.properties.village === 'Mangalakunta'
  && exported.properties.corners === 9);
check('area and perimeter stop where the numbers stop being real',
  exported.properties.area_ac === 60.2 && exported.properties.perimeter_m === 2029,
  JSON.stringify([exported.properties.area_ac, exported.properties.perimeter_m]));

// It must survive its own round trip.
const back = parseBoundaryFile(toBoundaryGeoJson(FIELD, {}));
check('export then import returns the same ring',
  JSON.stringify(back.ring) === JSON.stringify(FIELD), JSON.stringify(back.ring.slice(0, 2)));

try {
  toBoundaryGeoJson(FIELD.slice(0, 2), {});
  check('two corners cannot be exported', false, 'no error thrown');
} catch (e) { check('two corners cannot be exported', e instanceof BoundaryFileError); }

// A survey number's slash cannot survive a filesystem.
check('the filename is safe and findable',
  boundaryFileName('Sy 71/2', 'Konakanamitla') === 'Sy 71-2 Konakanamitla boundary.geojson',
  boundaryFileName('Sy 71/2', 'Konakanamitla'));
check('a nameless record still gets a file',
  boundaryFileName('', '') === 'boundary.geojson', boundaryFileName('', ''));

// ── Naming a corner ──────────────────────────────────────────────────────
// Letters, because a boundary screen is already full of numbers: every side
// carries a length, and "13" beside "136 m" makes you stop and work out which
// is which.
check('corners are lettered from A', cornerLabel(0) === 'A' && cornerLabel(1) === 'B');
check('the 26th corner is Z', cornerLabel(25) === 'Z', cornerLabel(25));
check('past Z it doubles up like a spreadsheet',
  cornerLabel(26) === 'AA' && cornerLabel(27) === 'AB' && cornerLabel(51) === 'AZ'
  && cornerLabel(52) === 'BA',
  [26, 27, 51, 52].map(cornerLabel).join(' '));
check('a nonsense index names nothing',
  cornerLabel(-1) === '' && cornerLabel(NaN) === '', `${cornerLabel(-1)}|${cornerLabel(NaN)}`);

// ── One village, several spellings ───────────────────────────────────────
// The real pair: a parcel filed in "Chintagunta", a shape file called
// "CHINTHAGUNTA". One letter, and the village map was lost.
check('the two spellings of Chinthagunta agree',
  villageKey('Chintagunta') === villageKey('CHINTHAGUNTA'),
  `${villageKey('Chintagunta')} vs ${villageKey('CHINTHAGUNTA')}`);
check('case and spacing do not matter',
  villageKey('  chinthagunta ') === villageKey('CHINTHAGUNTA'));
check('the record\u2019s own two spellings of its mandal agree',
  villageKey('Konakanamitla') === villageKey('Konakanamitla'));
// It must still tell genuinely different villages apart.
check('two different villages stay different',
  villageKey('Kothapalli') !== villageKey('Katragunta'));
check('Mangalakunta is not Chinthagunta',
  villageKey('Mangalakunta') !== villageKey('Chinthagunta'));
check('an empty name keys to nothing', villageKey('') === '' && villageKey('  ') === '');

// ── Web Mercator, against Leaflet's own numbers ──────────────────────────
// The one risk packages/core/src/land/tiles.ts carries is being a SECOND
// projection in a repo that already has Leaflet's. These are Leaflet's answers
// for `L.CRS.EPSG3857.latLngToPoint(L.latLng(lat, lon), z)`, so the two cannot
// drift apart without this failing.
const near = (a: number, b: number, tol = 0.01) => Math.abs(a - b) < tol;

// Sy 214/2, Kothapalli — the record every screen in W360 is drawn around.
{
  const p = lonLatToPixel(17.07765, 82.13872, 16);
  check('Leaflet agrees on the x pixel at z16', near(p.x, 12216549.7983),
    `${p.x.toFixed(4)} vs 12216549.7983`);
  check('Leaflet agrees on the y pixel at z16', near(p.y, 7580678.8062),
    `${p.y.toFixed(4)} vs 7580678.8062`);
}
// Mangalakunta corner 1, deeper in, where a rounding difference would show.
{
  const p = lonLatToPixel(15.66026, 79.31919, 17);
  check('and at z17, 700 km away', near(p.x, 24170300.3532) && near(p.y, 15299053.1232),
    `${p.x.toFixed(4)}, ${p.y.toFixed(4)}`);
}
// The equator and the prime meridian sit exactly at the middle of the world.
{
  const p = lonLatToPixel(0, 0, 0);
  check('null island is the centre of the zero-zoom world',
    near(p.x, TILE_PX / 2) && near(p.y, TILE_PX / 2), `${p.x}, ${p.y}`);
}
// Doubling the zoom doubles the pixel grid — the property the tile scheme is.
{
  const a = lonLatToPixel(15.66, 79.32, 12);
  const b = lonLatToPixel(15.66, 79.32, 13);
  check('one zoom in is exactly twice the pixels',
    near(b.x, a.x * 2) && near(b.y, a.y * 2));
  check('and both match Leaflet exactly',
    near(a.x, 755324.2453) && near(a.y, 478096.1966)
    && near(b.x, 1510648.4907) && near(b.y, 956192.3932));
}
// A round trip must land back on the same ground.
{
  const p = lonLatToPixel(15.66026, 79.31919, 17);
  const back = pixelToLonLat(p.x, p.y, 17);
  check('projecting and unprojecting returns the same point',
    near(back.lat, 15.66026, 1e-6) && near(back.lon, 79.31919, 1e-6),
    `${back.lat}, ${back.lon}`);
}
// Mangalakunta Field No. 01 — the real FMB sheet the geometry tests use. Its
// bbox is about 600 m across, and it has to fit a card's art box.
{
  // 772 m tall in an 84 px band is 9.2 m a pixel, which is z14 at this
  // latitude — the HEIGHT binds, not the width. A card is a letterbox, and
  // that is the axis that decides what fits in one.
  const z = boundsZoom(15.65872, 79.31919, 15.66567, 79.32437, 304, 104, 10);
  check('the short axis is what decides the zoom', z > 13.9 && z < 14.1, z.toFixed(3));
  // 13.998 is a hair BELOW the lowest rung, which is the documented floor
  // case: there is no rung under it, so the lowest is the least wrong and it
  // clips a boundary by a whisker rather than losing the parcel off the card.
  check('a field just under the lowest rung floors there',
    snapZoom(z, [14, 15, 16, 17]) === 14, String(snapZoom(z, [14, 15, 16, 17])));
  // With a rung underneath, it always snaps DOWN — up would clip.
  check('and otherwise it snaps down, never up',
    snapZoom(16.4, [14, 15, 16, 17]) === 16 && snapZoom(15.999, [14, 15, 16, 17]) === 15);
  // Widen the box and the same field earns a closer zoom.
  const wide = boundsZoom(15.65872, 79.31919, 15.66567, 79.32437, 304, 260, 10);
  check('a taller box fits the same field closer', wide > z, wide.toFixed(3));
}
// The ladder must never hand back a zoom the caller did not offer.
check('a huge parcel still gets the lowest rung rather than nothing',
  snapZoom(3.2, [14, 15, 16, 17]) === 14);
check('a tiny parcel is capped at the highest rung',
  snapZoom(21.9, [14, 15, 16, 17]) === 17);
// A single point has no extent, so no zoom fits it — the caller must choose.
check('a box with no extent reports no fitting zoom',
  boundsZoom(17.1, 82.1, 17.1, 82.1, 304, 104) === 0);

console.log(failures === 0 ? 'GEO TESTS PASS' : `GEO TESTS FAILED (${failures})`);
process.exit(failures === 0 ? 0 : 1);
