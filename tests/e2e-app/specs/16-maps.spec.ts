/**
 * W09 — finding it on a map.
 *
 * Five things a reader of this file has to know before the first test.
 *
 * 1. **There is no map screen.** `/app/map` is now four lines of redirect
 *    (pages/MapFind.tsx) onto `/app/properties?view=map`, so the map under
 *    test is W02's third view — the `.pf` panel in pages/Properties.tsx:1034
 *    — drawing `PortfolioCanvas.tsx` over the same filtered answer the grid
 *    and the table draw. Everything here therefore goes through Properties:
 *    one query, one filter, three views of one answer. The screen holds a
 *    SECOND map besides that one — the picture of the ground on every card in
 *    the grid (MapThumb.tsx), tile arithmetic and one SVG path rather than
 *    forty Leaflet instances — and the last describe covers it, because it
 *    reads the same ring and has to make the same distinction the live map
 *    does between an outline and a point.
 *
 * 2. **The old W09 is dead on the client.** `mapRecords` — `areaLabel`, the
 *    kind `counts`, the `insights` list, and a record's `watcher`,
 *    `featureChips`, `paperCount` and `photoCount` (api.ts:395, seeded at
 *    fixtures/seed.ts:534) — is still a query, still seeded, and asked for by
 *    nobody. A test below pins that down, because a screen quietly costing two
 *    round trips is the thing the join was removed to stop. The card that
 *    opens when a pin is picked carries the record's name, its place, its
 *    extent and two links; the chips, the watcher and the two counts the old
 *    screen showed have no home on it. That is a redesign, not a defect, so it
 *    is recorded here rather than asserted as one.
 *
 * 3. **Where the seeded records sit is not clickable geometry.** Four of the
 *    five cards share one fix (fixtures/seed.ts:56), so Sy 301's pin lands on
 *    top of Sy 214/2's outline, and the north-west corner of the fitted bounds
 *    — the flat in Kukatpally — sits under the Satellite chip. Every test that
 *    genuinely clicks a record therefore states a portfolio of ONE, which
 *    `fitNow` frames dead centre (PortfolioCanvas.tsx:226) with nothing else
 *    on the ground to take the click. The single exception is the scrolling
 *    defect below, whose whole subject is a list too long to see: it states
 *    twenty-five pins on a diagonal, laid out a comfortable thirty-odd pixels
 *    apart at the zoom that frames them. Every shape is reached by the name the
 *    canvas gives it — `aria-label="Select <title>"` — never by a coordinate.
 *
 * 4. **Units.** The seed files extents as `acres`/`sft`; the server's column is
 *    `ac | sq.yd | sq.ft` (web360.py:147) and `fmtExtent` keys off the real
 *    spellings, so "4.3 acres" prints as "4 acres". Fixtures are not ours to
 *    edit: the one test that asserts an extent states its own answer in the
 *    server's units, and the rest assert what the seed can honestly say.
 *
 * 5. **Five `test.fail()`s over four defects**, each naming its cause: a
 *    search that matched nothing takes the search box down with the map (once
 *    on the desktop, once on the phone, where it is the whole screen); taking
 *    a pin with the keyboard drops the focus, because raising a path re-parents
 *    it; the picked record is not in the URL, so a reload forgets it; and the
 *    list beside the map never scrolls to the record picked out on the map,
 *    though the Reader and the photo strip both follow their selection. Each
 *    goes green the day it is fixed.
 *
 *    A fourth defect is REPORTED but not asserted: unmounting the live map —
 *    which is what a search that matches nothing does — throws
 *    `Cannot read properties of undefined (reading '_leaflet_pos')` about one
 *    run in ten, and four in five if the map is still zooming. A test that
 *    fails four times in five is worse than no test, so the two scenarios that
 *    empty a live map take the console guard off instead, and say so.
 *
 * The tile-failure block opts out of the console guard too, and says why there.
 */
import { test, expect, World } from '../fixtures/harness';
import type { Page } from '../fixtures/harness';
import { ID } from '../fixtures/ids';
import { CARDS } from '../fixtures/seed';

type Card = Record<string, unknown>;

const BY_ID = new Map(CARDS.map((c) => [c.id as string, c]));

/** Seeded cards, cloned. Cloned because `CARDS` is the suite's shared cast and
 *  a test that edited one in place would edit it for every spec beside it. */
const only = (...ids: string[]): Card[] => ids.map((id) => structuredClone(BY_ID.get(id)!));

/** The four an unfiltered list shows — everything but the archived shop. */
const ACTIVE = () => only(ID.parcel, ID.plot, ID.flat, ID.watched);

/** A portfolio of one, so the map frames it dead centre and nothing else is on
 *  the ground to take a click meant for it (see note 3 in the header). */
const lone = (id: string): Card[] => only(id);

/** A `properties` answer. `facets: []` on purpose — the filter row is 03's
 *  screen, not this one; a map test that needs a facet states it. */
const listOf = (cards: Card[], over: Record<string, unknown> = {}) => ({
  shown: cards.length,
  total: cards.length,
  hidden: 0,
  filterSummary: '',
  hiddenPlaces: [] as string[],
  activeCount: 0,
  cards,
  facets: [] as unknown[],
  ...over,
});

/** Extents as the server actually spells them (web360.py:1351, 1375). */
const inRealUnits = (cards: Card[]): Card[] =>
  cards.map((c) => ({ ...c, extentUnit: c.kind === 'parcel' ? 'ac' : 'sq.ft' }));

const MAP = '/app/properties?view=map';

// ── handles on the map ─────────────────────────────────────────────────

/** The Leaflet host itself — `PortfolioCanvas.tsx:399` gives it the region
 *  role, and Leaflet then initialises on the same div. */
const stage = (page: Page) => page.getByRole('region', { name: 'Map of your properties' });

/** Everything drawn, whatever shape it is. Every path the canvas adds carries
 *  `role="button"` and `aria-label="Select <title>"`; the select boxes in the
 *  results list answer to the same words but are checkboxes, so this cannot
 *  collide with them. */
const onMap = (page: Page) => page.getByRole('button', { name: /^Select / });

const pinFor = (page: Page, title: string) =>
  page.getByRole('button', { name: `Select ${title}`, exact: true });

/** Land from a survey, and a dropped pin. The class Leaflet was handed is the
 *  only thing in the DOM that tells the two apart (PortfolioCanvas.tsx:305). */
const shapes = (page: Page) => page.locator('path.pf-shape');
const pins = (page: Page) => page.locator('path.pf-pin');

const results = (page: Page) => page.getByRole('complementary', { name: 'Map search results' });

/** One row of the results list. The row is a div with no role of its own — the
 *  pick button, the select box and the boundary link inside it carry all
 *  three — so it is reached by the record it is about. */
const row = (page: Page, title: string) =>
  results(page).locator('.pf-result').filter({ hasText: title });

/** What is picked, and the way in. A plain div (Properties.tsx:1082); its only
 *  roles are the two links inside it. */
const pickCard = (page: Page) => page.locator('.pf-pick');

/** The honest sentence under the map — the only note that is a direct child of
 *  the map panel (Properties.tsx:1164). */
const drawnLine = (page: Page) => page.locator('.pf > p.note');

const searchBox = (page: Page) => page.getByLabel('Search your land on the map');

/** Which basemap the ground came from. A `<span class="cap">`; nothing else on
 *  the stage prints a source. */
const groundCaption = (page: Page) => page.locator('.pf-stage .cap');

/**
 * Open the map and wait until it has framed itself.
 *
 * The waiting is not politeness. The opening frame is driven by a
 * ResizeObserver — the panel is laid out after the map mounts and is 0x0 for a
 * frame or two (PortfolioCanvas.tsx:178) — and `fitNow` only remembers what it
 * framed once the container has a size. A `goTo` that lands inside that window
 * is quietly undone by the fit that follows it, which is a real race and was
 * 1 run in 8 before this wait went in. A name on the map is the visible proof
 * that the observer has fired: `place()` writes nothing into a 0x0 box.
 *
 * `framed: false` for a portfolio with nothing to draw, which has no names.
 */
async function openMap(page: Page, url = MAP, { framed = true } = {}): Promise<void> {
  await page.goto(url);
  // Leaflet is behind a lazy seam (PortfolioCanvasLazy.tsx) and the dev server
  // compiles the chunk on demand, so the first mount is slower than a render.
  await expect(stage(page)).toBeVisible({ timeout: 20_000 });
  await expect(stage(page)).toHaveClass(/leaflet-container/);
  if (framed) await expect(page.locator('.pf-label').first()).toBeVisible({ timeout: 20_000 });
}

/** The closest zoom any tile on screen was cut at — how the test sees the map
 *  move without a handle on the Leaflet instance. OSM ends its path `.png`,
 *  Esri does not. */
const tileZoom = (page: Page) => page.evaluate(() => Math.max(
  -1,
  ...[...document.querySelectorAll('img.leaflet-tile')].map((img) =>
    Number(/\/(\d+)\/\d+\/\d+(?:\.png)?(?:\?.*)?$/.exec((img as HTMLImageElement).src)?.[1] ?? -1)),
));

/** What the scale bar says — "200 m", "5 km". The one figure on the map that
 *  is written for the reader AND changes with the zoom, so a test can say "the
 *  map moved" without a handle on the Leaflet instance. Steadier than counting
 *  tiles for a move OUTWARDS: the closer level stays in the DOM until the
 *  wider one has loaded. */
const scaleLine = (page: Page) => page.locator('.leaflet-control-scale-line').first().textContent();

/** A point on the stage with nothing of ours under it — no path, no label, no
 *  chip, no control — so "click the ground" means the ground. */
async function bareGround(page: Page): Promise<{ x: number; y: number }> {
  const box = (await stage(page).boundingBox())!;
  const candidates: Array<{ x: number; y: number }> = [];
  for (const fx of [0.5, 0.66, 0.34, 0.8, 0.22]) {
    for (const fy of [0.45, 0.3, 0.6, 0.18]) {
      candidates.push({ x: box.x + box.width * fx, y: box.y + box.height * fy });
    }
  }
  for (const point of candidates) {
    const clear = await page.evaluate(({ x, y }) => {
      const el = document.elementFromPoint(x, y);
      return !!el && !el.closest('path, .pf-label, .pf-pick, .maptools, .mapsays, .leaflet-control, .cap');
    }, point);
    if (clear) return point;
  }
  throw new Error('no bare ground on this map to click');
}

/** Click a shape on the map.
 *
 *  `force`, and not to paper over anything: a path IS the thing under the
 *  pointer — the name overlay above it takes no clicks — but a 4-acre outline
 *  drawn at a zoom that frames a whole portfolio has a zero-size box, and
 *  Playwright calls a zero-size box hidden. Every test that taps one states a
 *  portfolio of one, so the element under the point is never in doubt. */
const tap = (shape: ReturnType<typeof pinFor>) => shape.click({ force: true });

// ─────────────────────────────────────────────────────────────────────────
test.describe('W09 · the link somebody saved', () => {
  test('a link to /app/map opens the live map, on the same list and the same filters', async ({ page, world }) => {
    await page.goto('/app/map');

    await expect(page).toHaveURL(/\/app\/properties\?view=map$/);
    await expect(stage(page)).toBeVisible({ timeout: 20_000 });
    await expect.poll(() => world.asked('properties')).toBe(true);
    // `exact`, because the accessible name of a results row — "Sy 214/2
    // Katragunta, Markapur …" — contains the word Map.
    await expect(page.getByRole('button', { name: 'Map', exact: true }))
      .toHaveAttribute('aria-pressed', 'true');
    // The same list, and not merely a screen that loaded: the redirect carried
    // no filter, so what arrives is the whole unfiltered answer the grid shows.
    expect(world.lastVars('properties')).toMatchObject({ statuses: [], kinds: [] });
    await expect(results(page).getByText('4 matching records · 3 on map')).toBeVisible();
  });

  test('a filter riding in that link is still on when the map opens', async ({ page, world }) => {
    await openMap(page, '/app/map?status=watch');

    await expect(page).toHaveURL(/\/app\/properties\?status=watch&view=map$/);
    expect(world.lastVars('properties')).toMatchObject({ statuses: ['watch'] });
    await expect(onMap(page)).toHaveCount(1);
    await expect(pinFor(page, 'Sy 301')).toHaveCount(1);
  });

  test('the map costs the one answer the list already had, not a second round trip', async ({ page, world }) => {
    await page.goto('/app/properties');
    await expect(page.locator('.cards .rec')).toHaveCount(4);
    expect(world.askedFields()).toContain('properties');
    const alreadyPaidFor = world.calls('properties').length;

    await page.getByRole('button', { name: 'Map', exact: true }).click();
    await expect(stage(page)).toBeVisible({ timeout: 20_000 });
    await expect(onMap(page)).toHaveCount(3);

    // `mapRecords` is still a query, still seeded, and asked for by nobody:
    // every card carries its own lat/lon/ring (Properties.tsx:582).
    expect(world.asked('mapRecords')).toBe(false);
    // And the third view of one answer does not go back for the answer: the
    // grid, the table and the map are one query key (api.ts:423).
    expect(world.calls('properties')).toHaveLength(alreadyPaidFor);
  });

  test('the map is not mounted until the map view is asked for', async ({ page }) => {
    await page.goto('/app/properties');
    await expect(page.locator('.cards .rec')).toHaveCount(4);

    // ~150 kB of Leaflet behind a lazy seam. A map that mounted on the landing
    // screen would cost every visit that never switches views.
    await expect(stage(page)).toHaveCount(0);

    await page.getByRole('button', { name: 'Map', exact: true }).click();
    await expect(stage(page)).toBeVisible({ timeout: 20_000 });
  });
});

// ─────────────────────────────────────────────────────────────────────────
test.describe('W09 · what is on the map, and what is not', () => {
  test('every record that knows where it is, is drawn — the surveyed one as land, the rest as pins', async ({ page }) => {
    await openMap(page);

    await expect(onMap(page)).toHaveCount(3);
    await expect(shapes(page)).toHaveCount(1);
    await expect(pins(page)).toHaveCount(2);
    // Counted, not `toBeVisible`: at the zoom that frames two districts a
    // 4-acre outline is drawn as `d="M439 418L439 418z"` — a real path with a
    // zero-size box, which is what the fit is supposed to do with it.
    await expect(pinFor(page, 'Sy 214/2')).toHaveCount(1);
    await expect(pinFor(page, 'Flat 4B, Sai Residency')).toHaveCount(1);
    await expect(pinFor(page, 'Sy 301')).toHaveCount(1);
  });

  test('the record with nowhere to be is named under the map rather than quietly dropped', async ({ page }) => {
    await openMap(page);

    // A map is the one view that can look complete while leaving records out,
    // because what is missing takes up no space.
    await expect(pinFor(page, 'Sy 88')).toHaveCount(0);
    await expect(drawnLine(page)).toContainText('3 records drawn — 1 from a survey, 2 from a pin.');
    await expect(drawnLine(page)).toContainText(
      '1 record is not here: Sy 88 — neither surveyed nor pinned. Opening one and dropping its pin is enough.');
  });

  test('the count beside the list says how many matched and how many of those are on the map', async ({ page }) => {
    await openMap(page);

    await expect(results(page).getByText('4 matching records · 3 on map')).toBeVisible();
    await expect(page.getByText('4 of 5 shown')).toBeVisible();
  });

  test('a portfolio the survey has reached says so in the singular, and names nobody as missing', async ({ page }) => {
    await openMap(page, '/app/properties?view=map&in=surveyed');

    await expect(onMap(page)).toHaveCount(1);
    await expect(shapes(page)).toHaveCount(1);
    await expect(drawnLine(page)).toContainText('1 record drawn — from its survey.');
    await expect(drawnLine(page)).not.toContainText('not here');
  });

  test('a portfolio the survey has reached twice counts no pins it did not drop', async ({ page, world }) => {
    const surveyed = only(ID.parcel, ID.watched);
    // Sy 301 is seeded as a bare pin on its neighbour's fix. Given corners of
    // its own it becomes the second shape on the map, which is the one case
    // the sentence under the map has left: all surveyed, and more than one.
    surveyed[1] = { ...surveyed[1], ring: [15.7420, 79.2710, 15.7420, 79.2720, 15.7412, 79.2720, 15.7412, 79.2710] };
    world.set('properties', listOf(surveyed));
    await openMap(page);

    await expect(shapes(page)).toHaveCount(2);
    await expect(pins(page)).toHaveCount(0);
    await expect(drawnLine(page)).toContainText('2 records drawn — every one from a survey.');
    // Not "2 from a survey, 0 from a pin" — a breakdown of a set with nothing
    // in the other half (Properties.tsx:1183).
    await expect(drawnLine(page)).not.toContainText('from a pin');
  });

  test('two records sharing one spot do not write their names over each other', async ({ page, world }) => {
    const stacked = only(ID.flat, ID.watched);
    stacked[1] = { ...stacked[1], lat: stacked[0].lat, lon: stacked[0].lon, ring: [] };
    world.set('properties', listOf(stacked));
    await openMap(page);

    // Both are drawn — nothing is dropped from the map itself.
    await expect(pins(page)).toHaveCount(2);
    // But only one NAME, because two survey numbers printed over each other
    // read as a third number that does not exist (PortfolioCanvas.tsx:236).
    // The label overlay is the only thing in the DOM that carries a name.
    await expect(page.locator('.pf-label')).toHaveCount(1);
    await expect(page.locator('.pf-label')).toHaveText('Flat 4B, Sai Residency');
    // And the one it dropped is still reachable: the list beside the map is
    // where a name the map could not fit is answered for.
    await expect(row(page, 'Sy 301')).toBeVisible();
  });

  test('a record in dispute is not drawn in the same colour as one nobody is arguing over', async ({ page, world }) => {
    const mixed = only(ID.flat, ID.watched);
    mixed[0] = { ...mixed[0], status: 'disputed' };
    world.set('properties', listOf(mixed));
    await openMap(page);

    // Colour is status on this map, as on the cards, and it comes from a design
    // token (w360.css:3008) — the class Leaflet was handed is the only handle
    // the DOM offers on which tone a record was drawn in.
    await expect(pinFor(page, 'Flat 4B, Sai Residency')).toHaveClass(/\bpf-disputed\b/);
    await expect(pinFor(page, 'Sy 301')).toHaveClass(/\bpf-owned\b/);
    // And the same word is written out beside the map, for a reader who cannot
    // tell the two colours apart.
    await expect(row(page, 'Flat 4B')).toContainText('Disputed');
  });

  test('a map with nothing on it says why, instead of counting nothing', async ({ page, world }) => {
    world.set('properties', listOf(ACTIVE().map((c) => ({ ...c, lat: 0, lon: 0, ring: [] }))));
    await openMap(page, MAP, { framed: false });

    await expect(onMap(page)).toHaveCount(0);
    await expect(page.getByText(
      'None of these records knows where it is yet. A survey or a dropped pin puts one on this map.',
    )).toBeVisible();
    // "0 records drawn — every one from a pin" used to be said here, under a
    // band already explaining that nothing is drawn (Properties.tsx:1159).
    await expect(drawnLine(page)).toHaveCount(0);
    await expect(results(page).getByText('4 matching records · 0 on map')).toBeVisible();
    // And the ground under the explanation is still Andhra Pradesh and
    // Telangana at zoom 7 (PortfolioCanvas.tsx:73), not the Atlantic — which is
    // where a fitBounds over nothing lands a map.
    await expect.poll(() => tileZoom(page)).toBe(7);
  });

  test('a half-written outline falls back to the pin rather than drawing land nobody walked', async ({ page, world }) => {
    const cards = ACTIVE();
    // Three corners, all of them the same corner: a ring, but not a shape
    // (portfolioGeo.ts hasBoundaryRing).
    cards[0] = { ...cards[0], ring: [15.741, 79.2694, 15.741, 79.2694, 15.741, 79.2694] };
    world.set('properties', listOf(cards));
    await openMap(page);

    await expect(shapes(page)).toHaveCount(0);
    await expect(pins(page)).toHaveCount(3);
    await expect(row(page, 'Sy 214/2')).toContainText('Location pin only');
    await expect(drawnLine(page)).toContainText('3 records drawn — every one from a pin, none from a survey.');
  });

  test('the list beside the map says, record by record, what the map could do with it', async ({ page }) => {
    await openMap(page);

    await expect(row(page, 'Sy 214/2')).toContainText('Katragunta, Markapur');
    await expect(row(page, 'Sy 214/2')).toContainText('Boundary on map');
    await expect(row(page, 'Sy 214/2').getByRole('link', { name: 'View / measure boundary' }))
      .toHaveAttribute('href', `/app/records/${ID.parcel}/map`);

    await expect(row(page, 'Flat 4B')).toContainText('Location pin only');
    await expect(row(page, 'Sy 301')).toContainText('Watch');

    await expect(row(page, 'Sy 88')).toContainText('Add a location to show on map');
    await expect(row(page, 'Sy 88').getByRole('link', { name: 'Locate / draw boundary' }))
      .toHaveAttribute('href', `/app/records/${ID.plot}/map`);
  });

  test('a record with no place at all still says so where its village would be', async ({ page, world }) => {
    const cards = ACTIVE();
    cards[1] = { ...cards[1], village: '', mandal: '', district: '', placeLine: '' };
    world.set('properties', listOf(cards));
    await openMap(page);

    await expect(row(page, 'Sy 88')).toContainText('Place not added');
  });

  test('an archived record comes back onto the map when the Archived facet asks for it', async ({ page }) => {
    await openMap(page, '/app/properties?view=map&status=archived');

    await expect(onMap(page)).toHaveCount(1);
    await expect(pinFor(page, 'Shop 7, Market Road')).toHaveCount(1);
    await expect(drawnLine(page)).toContainText('1 record drawn — every one from a pin, none from a survey.');
  });

  test('the ground the land is drawn on is named under the map', async ({ page }) => {
    await openMap(page);

    await expect(groundCaption(page)).toHaveText('OpenStreetMap');
    await expect(page.locator('.leaflet-control-attribution')).toContainText('OpenStreetMap');
  });
});

// ─────────────────────────────────────────────────────────────────────────
test.describe('W09 · picking one out of the map', () => {
  test('clicking land says what it is, where it is and how big it is', async ({ page, world }) => {
    world.set('properties', listOf(inRealUnits(lone(ID.parcel))));
    await openMap(page);
    await expect(shapes(page)).toHaveCount(1);

    await tap(pinFor(page, 'Sy 214/2'));

    await expect(pickCard(page)).toContainText('Sy 214/2');
    await expect(pickCard(page)).toContainText('Katragunta, Markapur · 4.30 ac');
    await expect(pickCard(page).getByRole('link', { name: 'Open' }))
      .toHaveAttribute('href', `/app/records/${ID.parcel}`);
    await expect(pickCard(page).getByRole('link', { name: 'Boundary' }))
      .toHaveAttribute('href', `/app/records/${ID.parcel}/map`);
  });

  test('the pointer resting on a piece of land names it without my having to take it', async ({ page, world }) => {
    world.set('properties', listOf(lone(ID.parcel)));
    await openMap(page);
    await expect(shapes(page)).toHaveCount(1);

    await pinFor(page, 'Sy 214/2').hover({ force: true });

    // The tooltip is what answers "which one is that" while the pointer is on
    // it; the pick card answers "what is it" after the pointer has left
    // (PortfolioCanvas.tsx:316).
    await expect(page.locator('.leaflet-tooltip')).toHaveText('Sy 214/2 · Katragunta, Markapur');
    // And it says it without taking the record — hovering is not picking.
    await expect(pickCard(page)).toHaveCount(0);
    await expect(pinFor(page, 'Sy 214/2')).toHaveAttribute('aria-pressed', 'false');
  });

  test('running my finger down the list lights the record it is about, out on the map', async ({ page, world }) => {
    world.set('properties', listOf(lone(ID.flat)));
    await openMap(page);
    const pin = pinFor(page, 'Flat 4B, Sai Residency');

    await row(page, 'Flat 4B').hover();

    // Lit, not picked: no card opens, nothing moves, the name and the point
    // simply answer to the row the pointer is on (Properties.tsx:1129).
    // `lit` is a token colour and a stroke width; the class is the only thing
    // in the DOM that carries it.
    await expect(page.locator('.pf-label.lit')).toHaveText('Flat 4B, Sai Residency');
    await expect(pin).toHaveClass(/\blit\b/);
    await expect(pin).toHaveAttribute('aria-pressed', 'false');
    await expect(pickCard(page)).toHaveCount(0);
  });

  test('a record taken on the map is shown as taken in the list beside it', async ({ page, world }) => {
    world.set('properties', listOf(lone(ID.flat)));
    await openMap(page);
    const listPick = row(page, 'Flat 4B').getByRole('button');
    await expect(listPick).toHaveAttribute('aria-pressed', 'false');

    await tap(pinFor(page, 'Flat 4B, Sai Residency'));

    // One record, picked in one place, said in both — otherwise the list and
    // the map are two opinions about what the reader has in hand.
    await expect(listPick).toHaveAttribute('aria-pressed', 'true');
    await expect(row(page, 'Flat 4B')).toHaveClass(/\bon\b/);
  });

  // DEFECT. Picking on the map marks the record's row — `.pf-result.on`
  // (Properties.tsx:1127) — but nothing scrolls that row into view, and the
  // list is a 65vh box with `overflow-y: auto` (w360.css:2971). On a portfolio
  // long enough for the list to scroll, taking a pin at the south end of the
  // map highlights a row the reader cannot see, and the row is where its
  // extent, its status and the way to its boundary are. The app already owns
  // the idiom twice over — the Reader's page strip (Reader.tsx:174) and the
  // photo strip (RecordPhotos.tsx:214) both `scrollIntoView({ block:
  // 'nearest' })` when the selection changes. The owner is owed the same two
  // lines here, keyed on `picked`. Observed: the row really is `pf-result on`,
  // and its viewport ratio is 0.
  test.fail('the list beside the map scrolls to the record I picked out on the map', async ({ page, world }) => {
    // Twenty-five pins on a diagonal, far enough apart at the framed zoom to
    // take a click each, and far more rows than the 65vh list can hold
    // (w360.css:2971) — which is the only world in which "did the list move"
    // is a question at all.
    const many = Array.from({ length: 25 }, (_, i) => ({
      ...structuredClone(BY_ID.get(ID.watched)!),
      id: `w-many-${i}`, title: `Sy ${400 + i}`,
      lat: 15.70 + i * 0.01, lon: 79.26 + i * 0.002, ring: [] as number[],
    }));
    world.set('properties', listOf(many));
    await openMap(page);
    const last = row(page, 'Sy 424');
    await expect(last).not.toBeInViewport();

    await tap(pinFor(page, 'Sy 424'));

    await expect(pickCard(page)).toContainText('Sy 424');
    await expect(last).toBeInViewport();
  });

  test('a picked pin is pressed, and says so to anything that cannot see colour', async ({ page, world }) => {
    world.set('properties', listOf(lone(ID.flat)));
    await openMap(page);
    const pin = pinFor(page, 'Flat 4B, Sai Residency');
    await expect(pin).toHaveAttribute('aria-pressed', 'false');

    await tap(pin);

    await expect(pin).toHaveAttribute('aria-pressed', 'true');
    await expect(pin).toHaveClass(/\bon\b/);
  });

  test('Open on the card is the way into the record', async ({ page, world }) => {
    world.set('properties', listOf(lone(ID.flat)));
    await openMap(page);
    await tap(pinFor(page, 'Flat 4B, Sai Residency'));
    await expect(pickCard(page)).toContainText('Flat 4B, Sai Residency');

    await pickCard(page).getByRole('link', { name: 'Open' }).click();

    await expect(page).toHaveURL(new RegExp(`/app/records/${ID.flat}$`));
  });

  test('Boundary on the card is the way to its own ground', async ({ page, world }) => {
    world.set('properties', listOf(lone(ID.parcel)));
    await openMap(page);
    await tap(pinFor(page, 'Sy 214/2'));
    await expect(pickCard(page)).toContainText('Sy 214/2');

    await pickCard(page).getByRole('link', { name: 'Boundary' }).click();

    await expect(page).toHaveURL(new RegExp(`/app/records/${ID.parcel}/map$`));
  });

  test('clicking the same pin a second time opens the record', async ({ page, world }) => {
    world.set('properties', listOf(lone(ID.flat)));
    await openMap(page);
    const pin = pinFor(page, 'Flat 4B, Sai Residency');

    await tap(pin);
    await expect(pickCard(page)).toContainText('Flat 4B, Sai Residency');
    await tap(pin);

    await expect(page).toHaveURL(new RegExp(`/app/records/${ID.flat}$`));
  });

  test('clicking bare ground lets the record go again', async ({ page, world }) => {
    world.set('properties', listOf(lone(ID.flat)));
    await openMap(page);
    await tap(pinFor(page, 'Flat 4B, Sai Residency'));
    await expect(pickCard(page)).toContainText('Flat 4B, Sai Residency');

    const empty = await bareGround(page);
    await page.mouse.click(empty.x, empty.y);

    await expect(pickCard(page)).toHaveCount(0);
    await expect(pinFor(page, 'Flat 4B, Sai Residency')).toHaveAttribute('aria-pressed', 'false');
  });

  test('a click that lands on the card itself is not a click on the ground behind it', async ({ page, world }) => {
    world.set('properties', listOf(lone(ID.flat)));
    await openMap(page);
    const pin = pinFor(page, 'Flat 4B, Sai Residency');
    await tap(pin);
    await expect(pickCard(page)).toContainText('Flat 4B, Sai Residency');

    // The card sits over the map. Reaching for Open and missing it by a few
    // pixels must not be the gesture that closes the card (Properties.tsx:1089).
    await pickCard(page).getByText('Flat 4B, Sai Residency').click();

    await expect(pickCard(page)).toContainText('Flat 4B, Sai Residency');
    await expect(pin).toHaveAttribute('aria-pressed', 'true');
  });

  test('a pin can be taken with the keyboard, and a pointer wandering elsewhere does not steal it', async ({ page, world }) => {
    world.set('properties', listOf(only(ID.parcel, ID.flat)));
    await openMap(page);
    const pin = pinFor(page, 'Sy 214/2');

    await pin.focus();
    await expect(pin).toBeFocused();

    // Lighting another record redraws every name on the map. The hand must not
    // come off the shape it is on.
    await row(page, 'Flat 4B').hover();
    await expect(pin).toBeFocused();

    await page.keyboard.press('Enter');

    await expect(pickCard(page)).toContainText('Sy 214/2');
    await expect(pin).toHaveAttribute('aria-pressed', 'true');
  });

  // DEFECT. Taking a pin raises it — `layer.bringToFront()` in the selection
  // effect (PortfolioCanvas.tsx:354) — and Leaflet raises a path by appending
  // the node to the end of its group, which MOVES it in the DOM and blurs it.
  // So the keyboard user who has just pressed Enter is standing on <body>: the
  // second Enter that opens the record (PortfolioCanvas.tsx:336) never reaches
  // the pin, and they have to tab in from the top of the document to try
  // again. Clicking has no such problem, which is the tell. The owner is owed
  // the focus back after the raise — the same thing the facet popover already
  // does for Escape (Properties.tsx:624) — or a raise that paints rather than
  // re-parents. Passes with one record only, where the path is already last.
  test.fail('the pin I have just taken with the keyboard still has my hand on it', async ({ page, world }) => {
    world.set('properties', listOf(only(ID.parcel, ID.flat)));
    await openMap(page);
    const pin = pinFor(page, 'Sy 214/2');
    await pin.focus();
    await expect(pin).toBeFocused();

    await page.keyboard.press('Enter');
    await expect(pin).toHaveAttribute('aria-pressed', 'true');

    await expect(pin).toBeFocused({ timeout: 3_000 });
  });

  test('Space takes a pin too, and a second press opens the record', async ({ page, world }) => {
    world.set('properties', listOf(lone(ID.parcel)));
    await openMap(page);
    const pin = pinFor(page, 'Sy 214/2');

    await pin.focus();
    await page.keyboard.press(' ');
    await expect(pickCard(page)).toContainText('Sy 214/2');

    await page.keyboard.press(' ');

    await expect(page).toHaveURL(new RegExp(`/app/records/${ID.parcel}$`));
  });

  test('picking one from the list beside the map moves the map onto it', async ({ page }) => {
    await openMap(page);
    await expect(onMap(page)).toHaveCount(3);
    // Two districts apart, so the opening frame is a long way out.
    expect(await tileZoom(page)).toBeLessThan(12);

    await row(page, 'Sy 214/2').getByRole('button').click();

    await expect(pickCard(page)).toContainText('Sy 214/2');
    await expect.poll(() => tileZoom(page)).toBeGreaterThanOrEqual(15);
  });

  test('Fit all frames everything again and lets the picked record go', async ({ page }) => {
    await openMap(page);
    await row(page, 'Sy 214/2').getByRole('button').click();
    await expect.poll(() => tileZoom(page)).toBeGreaterThanOrEqual(15);
    const close = await scaleLine(page);

    await page.getByRole('button', { name: 'Fit all' }).click();

    await expect(pickCard(page)).toHaveCount(0);
    await expect.poll(() => scaleLine(page)).not.toBe(close);
    await expect(onMap(page)).toHaveCount(3);
  });

  test('a record with no location is not picked on the map — it is taken to where its pin would go', async ({ page }) => {
    await openMap(page);

    await row(page, 'Sy 88').getByRole('button').click();

    await expect(page).toHaveURL(new RegExp(`/app/records/${ID.plot}/map$`));
  });

  test('the record I picked is still picked after the map has moved', async ({ page }) => {
    await openMap(page);
    await row(page, 'Sy 214/2').getByRole('button').click();
    await expect(pickCard(page)).toContainText('Sy 214/2');
    await expect.poll(() => tileZoom(page)).toBeGreaterThanOrEqual(15);
    const framed = await scaleLine(page);

    await page.getByRole('button', { name: 'Zoom out' }).click();

    await expect.poll(() => scaleLine(page)).not.toBe(framed);
    await expect(pickCard(page)).toContainText('Sy 214/2');
    await expect(pinFor(page, 'Sy 214/2')).toHaveAttribute('aria-pressed', 'true');
  });

  // DEFECT. `picked` is component state (Properties.tsx:362) and nothing puts
  // it in the URL, while `view` and `q` beside it both are. A reload, a sent
  // link or a back-and-forward therefore loses the record the reader had in
  // hand on a screen whose whole job is finding one. The owner is owed the
  // pick in the query string — `?pick=<id>` — the way `?view=map` already
  // survives being sent to somebody.
  test.fail('the record I picked is still picked when the map comes back', async ({ page }) => {
    await openMap(page);
    await row(page, 'Sy 214/2').getByRole('button').click();
    await expect(pickCard(page)).toContainText('Sy 214/2');

    await page.reload();
    await expect(stage(page)).toBeVisible({ timeout: 20_000 });

    await expect(pickCard(page)).toContainText('Sy 214/2', { timeout: 3_000 });
  });

  test('a record the search has just taken off the map stops being described beside it', async ({ page }) => {
    await openMap(page);
    await row(page, 'Sy 214/2').getByRole('button').click();
    await expect(pickCard(page)).toContainText('Sy 214/2');

    await searchBox(page).fill('Kukatpally');

    // A card describing something nobody can see any more (Properties.tsx:597).
    await expect(pickCard(page)).toHaveCount(0);
    await expect(onMap(page)).toHaveCount(1);
  });

  test('records found on the map can be picked up for a bulk action without going back to the grid', async ({ page }) => {
    await openMap(page);

    const box = row(page, 'Sy 214/2').getByRole('checkbox', { name: 'Select Sy 214/2' });
    await box.click();
    await expect(box).toBeChecked();

    await expect(page.getByRole('group', { name: 'Act on the selected records' }))
      .toContainText('1 record selected');
  });
});

// ─────────────────────────────────────────────────────────────────────────
test.describe('W09 · finding one by name', () => {
  test('the search box narrows the map to what it found, and moves onto it', async ({ page }) => {
    await openMap(page);
    await expect(onMap(page)).toHaveCount(3);

    await searchBox(page).fill('Kukatpally');

    await expect(page).toHaveURL(/q=Kukatpally/);
    await expect(onMap(page)).toHaveCount(1);
    await expect(pinFor(page, 'Flat 4B, Sai Residency')).toHaveCount(1);
    await expect(results(page).getByText('1 matching record · 1 on map')).toBeVisible();
    await expect(drawnLine(page)).toContainText('1 record drawn — every one from a pin, none from a survey.');
    // One record framed alone is framed at street level, not at the tile
    // server's maximum (PortfolioCanvas.tsx:226).
    await expect.poll(() => tileZoom(page)).toBe(15);
  });

  test('a search finds a record by its khata, not only by its name', async ({ page }) => {
    await openMap(page);

    await searchBox(page).fill('1042');

    await expect(onMap(page)).toHaveCount(1);
    await expect(row(page, 'Sy 214/2')).toBeVisible();
  });

  test('a search that arrived from the jump box is already in the box, and comes off at its own chip', async ({ page }) => {
    await openMap(page, `${MAP}&q=Katragunta`);

    await expect(searchBox(page)).toHaveValue('Katragunta');
    await expect(onMap(page)).toHaveCount(2);
    await expect(drawnLine(page)).toContainText('2 records drawn — 1 from a survey, 1 from a pin.');

    await page.getByRole('button', { name: 'Clear the search for Katragunta' }).click();

    await expect(searchBox(page)).toHaveValue('');
    await expect(onMap(page)).toHaveCount(3);
  });

  test('emptying the search box by hand puts the whole portfolio back, and takes the search out of the link', async ({ page }) => {
    await openMap(page, `${MAP}&q=Kukatpally`);
    await expect(onMap(page)).toHaveCount(1);

    await searchBox(page).fill('');

    // The box writes the URL on every keystroke and DELETES the parameter when
    // it is emptied (Properties.tsx:1053) — an empty `?q=` left behind would
    // keep a chip in the filter row for a search that is no longer on.
    await expect(page).toHaveURL(/\/app\/properties\?view=map$/);
    await expect(onMap(page)).toHaveCount(3);
    await expect(results(page).getByText('4 matching records · 3 on map')).toBeVisible();
    await expect(page.getByRole('button', { name: /^Clear the search/ })).toHaveCount(0);
  });

  test('the map offers the village maps for the land that is not mine yet', async ({ page }) => {
    await openMap(page);

    // The one way off this screen that is not a record of the reader's own:
    // W16 answers "whose is that field" where this map only answers "where is
    // mine". The door is asserted, not walked through — the village files live
    // outside the seal (see tests/e2e-app/specs/17-villages.spec.ts), and this
    // spec has no business opening them.
    await expect(page.getByRole('link', { name: 'Search village maps' }))
      .toHaveAttribute('href', '/app/villages');
  });

  /**
   * A search that matches nothing takes the whole map panel down with it, and
   * the live Leaflet map underneath goes out mid-flight: about one run in ten
   * — and four in five if the map is still zooming when the answer empties —
   * the page throws `Cannot read properties of undefined (reading
   * '_leaflet_pos')`, which is Leaflet reading a pane it has already removed
   * (PortfolioCanvas.tsx:195 defers `map.remove()` by a frame, and anything
   * still in flight lands after it). It is a genuine defect and it is reported
   * as one, but it is a RACE: asserting it would be a test that fails four
   * times in five, which is worse than no test. So the console guard comes off
   * for the two scenarios that empty a live map, and the assertions are about
   * what the reader is left with.
   */
  test.describe('and the search empties it', () => {
    test.use({ allowConsole: true });

    test('a search that matches nothing says so in its own words, and offers to clear itself', async ({ page, consoleErrors }) => {
      await openMap(page);

      await searchBox(page).fill('Vizag');

      await expect(page.getByRole('heading', { name: /Nothing matches/ })).toBeVisible();
      await expect(page.getByText("Try a survey number, a village, a khata or an owner's name.")).toBeVisible();

      await page.getByRole('button', { name: 'Clear search' }).click();

      await expect(page).toHaveURL(/view=map/);
      await expect(stage(page)).toBeVisible({ timeout: 20_000 });
      await expect(onMap(page)).toHaveCount(3);
      // The guard is off for this block, and the exemption is for ONE known
      // race. Anything else the screen logs on the way through is a second bug
      // riding in under the first, so it is checked here by hand.
      expect(consoleErrors.filter((e) => !/_leaflet_pos/.test(e)),
        'something other than the known Leaflet teardown race was logged').toEqual([]);
    });

    // DEFECT. The map panel — and the only search box on this screen with it —
    // is gated on `cards.length > 0` (Properties.tsx:1034), so a query that
    // matches nothing takes away the box it was typed into. A typo cannot be
    // corrected; the reader has to clear the whole search and start again, and
    // on a phone the box is the screen. The owner is owed a search box that
    // outlives its own empty result, the way the grid's filter row does.
    test.fail('a search that found nothing leaves the box I typed it into, so I can fix the typo', async ({ page }) => {
      await openMap(page);

      await searchBox(page).fill('Kukatpaly');

      await expect(page.getByRole('heading', { name: /Nothing matches/ })).toBeVisible();
      await expect(searchBox(page)).toBeVisible({ timeout: 3_000 });
    });
  });

  test('a filter that leaves nothing to draw says which filter did it, rather than drawing an empty map', async ({ page }) => {
    await page.goto(`${MAP}&kind=shop`);

    await expect(page.getByRole('heading', { name: 'No records match these filters' })).toBeVisible();
    await expect(page.getByText('The ones being held back are in Markapur.')).toBeVisible();
    await expect(stage(page)).toHaveCount(0);

    await page.getByRole('button', { name: 'Clear filters' }).click();

    // The view survives what cleared the filter — it is still the map.
    await expect(page).toHaveURL(/view=map/);
    await expect(stage(page)).toBeVisible({ timeout: 20_000 });
    await expect(onMap(page)).toHaveCount(3);
  });
});

// ─────────────────────────────────────────────────────────────────────────
test.describe('W09 · the ground under the land', () => {
  test('the satellite switch changes the ground, the caption and the attribution — and keeps the land', async ({ page }) => {
    await openMap(page);
    const sat = page.getByRole('button', { name: 'Satellite' });
    await expect(sat).toHaveAttribute('aria-pressed', 'false');
    // The chip is one word either way, so what it would DO next is in its
    // hover text, and that has to turn over with the state (Properties.tsx:1073).
    await expect(sat).toHaveAttribute('title', 'Real ground under your land');

    await sat.click();

    await expect(sat).toHaveAttribute('aria-pressed', 'true');
    await expect(sat).toHaveAttribute('title', 'Turn the imagery off');
    await expect(groundCaption(page)).toHaveText('Esri World Imagery');
    await expect(page.locator('.leaflet-control-attribution')).toContainText('Esri');
    await expect(onMap(page)).toHaveCount(3);

    await sat.click();

    await expect(groundCaption(page)).toHaveText('OpenStreetMap');
    await expect(page.locator('.leaflet-control-attribution')).not.toContainText('Esri');
    await expect(onMap(page)).toHaveCount(3);
  });

  test('the ground I chose survives picking a record and moving the map', async ({ page }) => {
    await openMap(page);
    await page.getByRole('button', { name: 'Satellite' }).click();
    await expect(groundCaption(page)).toHaveText('Esri World Imagery');

    await row(page, 'Sy 214/2').getByRole('button').click();
    await expect(pickCard(page)).toContainText('Sy 214/2');

    await expect(groundCaption(page)).toHaveText('Esri World Imagery');
    await expect(page.getByRole('button', { name: 'Satellite' })).toHaveAttribute('aria-pressed', 'true');
  });
});

// ─────────────────────────────────────────────────────────────────────────
test.describe('W09 · ground that will not load', () => {
  /* A tile the server refuses is a console error in Chrome, and the seal's
   * console watch would otherwise fail these for the very thing they are
   * about. Nothing else here provokes one — which each test says for itself
   * with `noOtherNoise` rather than leaving the exemption to cover the lot. */
  test.use({ allowConsole: true });

  const ESRI = /server\.arcgisonline\.com/;
  const OSM = /tile\.openstreetmap\.org/;
  const refuse = (route: { fulfill: (r: { status: number; contentType: string; body: string }) => Promise<void> }) =>
    route.fulfill({ status: 404, contentType: 'text/plain', body: 'no imagery' });

  /** Everything logged that is NOT the refused tile. A React error thrown by
   *  the failure path would otherwise ride into these tests unnoticed under
   *  the exemption the refused tile needs. */
  const noOtherNoise = (errors: string[]) =>
    errors.filter((e) => !/Failed to load resource|ERR_|net::/i.test(e));

  const esriTilesLoaded = (page: Page) => page.evaluate(() =>
    [...document.querySelectorAll('img.leaflet-tile-loaded')]
      .filter((img) => (img as HTMLImageElement).src.includes('arcgisonline')).length);

  test('the street map failing to arrive is named as the street map, not as the imagery', async ({ page, consoleErrors }) => {
    await page.route(OSM, refuse);
    await openMap(page);

    // The one basemap the reader never chose — it is what the map opens on —
    // and the sentence has to name it rather than the layer they might switch
    // to (PortfolioCanvas.tsx:371).
    await expect(page.getByText(
      'Street map could not be fully loaded. Your saved locations are still shown.',
    )).toBeVisible();
    await expect(page.getByText(/Satellite imagery could not/)).toHaveCount(0);
    // The land came from the records, not from the tile server.
    await expect(onMap(page)).toHaveCount(3);
    await expect(groundCaption(page)).toHaveText('OpenStreetMap');
    expect(noOtherNoise(consoleErrors), 'something other than the refused tiles was logged').toEqual([]);
  });

  test('imagery that does not arrive says so, names itself, and keeps my land on the screen', async ({ page, consoleErrors }) => {
    await page.route(ESRI, refuse);
    await openMap(page);
    await expect(onMap(page)).toHaveCount(3);

    await page.getByRole('button', { name: 'Satellite' }).click();

    await expect(page.getByText(
      'Satellite imagery could not be fully loaded. Your saved locations are still shown.',
    )).toBeVisible();
    // The record's own geometry came from the record, not from the tile server.
    await expect(onMap(page)).toHaveCount(3);
    await expect(groundCaption(page)).toHaveText('Esri World Imagery');
    expect(noOtherNoise(consoleErrors), 'something other than the refused tiles was logged').toEqual([]);
  });

  test('the street map I came back to is not blamed for the imagery that failed', async ({ page, consoleErrors }) => {
    await page.route(ESRI, refuse);
    await openMap(page);
    const sat = page.getByRole('button', { name: 'Satellite' });
    await sat.click();
    await expect(page.getByText(/Satellite imagery could not be fully loaded/)).toBeVisible();

    await sat.click();

    await expect(page.getByText(/could not be fully loaded/)).toHaveCount(0);
    await expect(groundCaption(page)).toHaveText('OpenStreetMap');
    expect(noOtherNoise(consoleErrors), 'something other than the refused tiles was logged').toEqual([]);
  });

  test('Retry map puts the imagery back once the tiles answer again', async ({ page, consoleErrors }) => {
    await page.route(ESRI, refuse);
    await openMap(page);
    // The street tiles arrived first — this is a failure on the layer switched
    // to, not a map that never worked.
    await expect(page.locator('img.leaflet-tile-loaded').first()).toBeVisible();

    await page.getByRole('button', { name: 'Satellite' }).click();
    await expect(page.getByText(/Satellite imagery could not be fully loaded/)).toBeVisible();

    await page.unroute(ESRI, refuse);
    await page.getByRole('button', { name: 'Retry map' }).click();

    await expect.poll(() => esriTilesLoaded(page)).toBeGreaterThan(0);
    await expect(page.getByText(/could not be fully loaded/)).toHaveCount(0);
    expect(noOtherNoise(consoleErrors), 'something other than the refused tiles was logged').toEqual([]);
  });

  test('a retry that changes nothing says so again rather than going quiet', async ({ page, consoleErrors }) => {
    await page.route(ESRI, refuse);
    await openMap(page);
    await page.getByRole('button', { name: 'Satellite' }).click();
    await expect(page.getByText(/Satellite imagery could not be fully loaded/)).toBeVisible();

    await page.getByRole('button', { name: 'Retry map' }).click();

    await expect(page.getByText(
      'Satellite imagery could not be fully loaded. Your saved locations are still shown.',
    )).toBeVisible();
    // And the way out is still offered: a retry that failed must not take its
    // own button away (PortfolioCanvas.tsx:372).
    await expect(page.getByRole('button', { name: 'Retry map' })).toBeVisible();
    expect(noOtherNoise(consoleErrors), 'something other than the refused tiles was logged').toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────
test.describe('W09 · adding land from the map', () => {
  test('a record added from the map lands on its own ground, ready for a pin', async ({ page, world }) => {
    // The world answers the save with a record it already knows, so the screen
    // the drawer hands over to is a real one rather than a 404.
    world.set('saveRecord', ID.plot);
    await openMap(page);

    await page.getByRole('button', { name: 'Add', exact: true }).click();
    const drawer = page.getByRole('dialog', { name: 'Add a record' });
    await drawer.getByRole('button', { name: 'Enter the details by hand instead' }).click();
    await drawer.getByLabel('Survey number').fill('Sy 500');
    await drawer.getByRole('button', { name: 'Add record' }).click();

    await expect.poll(() => world.calls('saveRecord')).toHaveLength(1);
    await expect(page).toHaveURL(new RegExp(`/app/records/${ID.plot}/map$`));
  });

  test('the same record added from the grid stays on the list, because there is no map to put it on', async ({ page, world }) => {
    world.set('saveRecord', ID.plot);
    await page.goto('/app/properties');
    await expect(page.locator('.cards .rec')).toHaveCount(4);

    await page.getByRole('button', { name: 'Add', exact: true }).click();
    const drawer = page.getByRole('dialog', { name: 'Add a record' });
    await drawer.getByRole('button', { name: 'Enter the details by hand instead' }).click();
    await drawer.getByLabel('Survey number').fill('Sy 500');
    await drawer.getByRole('button', { name: 'Add record' }).click();

    await expect.poll(() => world.calls('saveRecord')).toHaveLength(1);
    await expect(drawer).toHaveCount(0);
    await expect(page).toHaveURL(/\/app\/properties$/);
  });
});

// ─────────────────────────────────────────────────────────────────────────
test.describe('W09 · nothing to draw, still drawing, and not drawing at all', () => {
  test('an account with nothing in it is not given a map with nothing on it', async ({ page, world }) => {
    world.set('properties', listOf([], { total: 0 }));
    await page.goto(MAP);

    await expect(page.getByText('Nothing filed yet')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Add a record' })).toBeVisible();
    await expect(stage(page)).toHaveCount(0);
    // Three view shapes, Export and a sort chip are furniture for rows that do
    // not exist (Properties.tsx:804).
    await expect(page.getByRole('group', { name: 'View' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Export' })).toHaveCount(0);
  });

  test('an account whose every record is archived is told where they went, not asked to start again', async ({ page, world }) => {
    world.set('properties', listOf([], {
      total: 0,
      facets: [{ key: 'status', label: 'Status', options: [
        { key: 'archived', label: 'Archived', count: 3, active: false },
      ] }],
    }));
    await page.goto(MAP);

    await expect(page.getByText('Nothing active')).toBeVisible();
    await expect(page.getByText(
      '3 records are archived. Archived records leave the list, the map and every total until you bring them back.',
    )).toBeVisible();
    await expect(page.getByRole('button', { name: 'Show archived' })).toBeVisible();
    await expect(stage(page)).toHaveCount(0);
  });

  test('a map still on its way holds the shape of a map, and claims nothing about the land', async ({ page, world }) => {
    world.set('properties', World.never());
    await page.goto(MAP);

    await expect(page.getByRole('status', { name: 'Loading the map of your properties' })).toBeVisible();
    await expect(stage(page)).toHaveCount(0);
    await expect(page.getByText('Nothing filed yet')).toHaveCount(0);
    await expect(page.getByText(/records drawn/)).toHaveCount(0);
    // The shape of a map, and not a grey line where one will be: the stand-in
    // holds the panel's own height (skeletons.tsx:174), so the page does not
    // jump by a third of a screen when the answer lands.
    const heldOpen = page.locator('.pf .pf-stage');
    await expect(heldOpen).toBeVisible();
    expect((await heldOpen.boundingBox())!.height,
      'the map skeleton must hold the height of a map').toBeGreaterThan(300);
  });

  test('a map that did not load says so, prints what the server said, and offers to try again', async ({ page, world }) => {
    world.set('properties', World.gqlError('the record store is down'));
    await page.goto(MAP);

    const failed = page.getByRole('alert');
    await expect(failed).toContainText('Your properties did not load');
    await expect(failed).toContainText('the record store is down');
    await expect(failed.getByRole('button', { name: 'Try again' })).toBeVisible();
    await expect(stage(page)).toHaveCount(0);
  });

  test('the map comes back the moment the server does', async ({ page, world }) => {
    world.set('properties', World.gqlError('the record store is down'));
    await page.goto(MAP);
    await expect(page.getByRole('alert')).toBeVisible();

    world.set('properties', listOf(ACTIVE()));
    await page.getByRole('button', { name: 'Try again' }).click();

    await expect(stage(page)).toBeVisible({ timeout: 20_000 });
    await expect(onMap(page)).toHaveCount(3);
    await expect(page.getByRole('alert')).toHaveCount(0);
  });

  test('a slow answer leaves the map loading rather than empty', async ({ page, world }) => {
    world.set('properties', World.slow(1_200, listOf(ACTIVE())));
    await page.goto(MAP);

    await expect(page.getByRole('status', { name: 'Loading the map of your properties' })).toBeVisible();
    await expect(stage(page)).toBeVisible({ timeout: 20_000 });
    await expect(onMap(page)).toHaveCount(3);
  });
});

// ─────────────────────────────────────────────────────────────────────────
/** The other map in this screen: the picture of the ground on every card in
 *  the grid (MapThumb.tsx), which is tile arithmetic and one SVG path rather
 *  than forty Leaflet instances on the app's landing screen. It is drawn from
 *  the same `ring`/`lat`/`lon` the live map reads, and it has to make the same
 *  distinction the live map does — an outline is a survey, a point is a pin. */
test.describe('W09 · the map on a card', () => {
  test('a card draws the ground it stands on — the surveyed one as its outline, the pinned one as a point', async ({ page, world }) => {
    // The owner's own photograph wins over the ground when a card has one
    // (Properties.tsx:172), and two of the seeded five do. Taking the covers
    // away is what leaves the card's second choice on screen to be read.
    world.set('properties', listOf(ACTIVE().map((c) => ({ ...c, coverFileRef: '' }))));
    await page.goto('/app/properties');
    await expect(page.locator('.cards .rec')).toHaveCount(4);

    const surveyed = page.getByRole('img', { name: 'Where Sy 214/2 is' });
    await expect(surveyed).toBeVisible();
    await expect(surveyed.locator('path.w-ring')).toHaveCount(1);
    await expect(surveyed.locator('circle')).toHaveCount(0);

    const pinned = page.getByRole('img', { name: 'Where Flat 4B, Sai Residency is' });
    // A point and not a little square: a record with no survey has a POSITION
    // and drawing it as a shape would claim a boundary (MapThumb.tsx:143).
    await expect(pinned.locator('circle.pf-pin')).toHaveCount(1);
    await expect(pinned.locator('path.w-ring')).toHaveCount(0);

    // And the one that knows neither draws no ground at all, so the card's own
    // illustration is what shows (MapThumb.tsx:81).
    await expect(page.getByRole('img', { name: 'Where Sy 88 is' })).toHaveCount(0);
  });

  test.describe('when the imagery does not come', () => {
    /* Refused tiles are a console error in Chrome, which is the point of the
     * test; the assertion at the end says nothing else was logged. */
    test.use({ allowConsole: true });

    test('a card with no imagery still draws the boundary, because the boundary came from the record', async ({ page, world, consoleErrors }) => {
      await page.route(/server\.arcgisonline\.com/, (route) =>
        route.fulfill({ status: 404, contentType: 'text/plain', body: 'no imagery' }));
      world.set('properties', listOf(ACTIVE().map((c) => ({ ...c, coverFileRef: '' }))));
      await page.goto('/app/properties');

      const surveyed = page.getByRole('img', { name: 'Where Sy 214/2 is' });
      await expect(surveyed).toBeVisible();
      // No blanked mosaic, no error state on the card: an <img alt=""> that
      // fails renders as nothing at all and the ring is drawn over the card's
      // own gradient (MapThumb.tsx:132). That is the whole offline story.
      await expect(surveyed.locator('path.w-ring')).toHaveCount(1);
      await expect(page.getByText(/could not be fully loaded/)).toHaveCount(0);
      expect(consoleErrors.filter((e) => !/Failed to load resource|ERR_|net::/i.test(e)),
        'something other than the refused tiles was logged').toEqual([]);
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────
test.describe('W09 · on a phone', () => {
  test('the map, the search and the list all fit inside the screen @phone', async ({ page }) => {
    await openMap(page);
    await expect(onMap(page)).toHaveCount(3);

    await expect(searchBox(page)).toBeVisible();
    await expect(results(page)).toBeVisible();
    const spill = await page.evaluate(() =>
      document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(spill, 'the page must not scroll sideways').toBeLessThanOrEqual(1);
  });

  test('the list of what was found stacks under the map instead of beside it @phone-only', async ({ page }) => {
    await openMap(page);
    await expect(onMap(page)).toHaveCount(3);

    const map = (await stage(page).boundingBox())!;
    const list = (await results(page).boundingBox())!;
    expect(list.y).toBeGreaterThan(map.y + map.height - 2);
    expect(Math.round(list.width)).toBeGreaterThan(Math.round(map.width) - 2);
  });

  /* Both of these empty a live map, so they carry the console guard's exemption
     for the same reason the desktop pair above does — see the note there. */
  test.describe('and the search finds nothing', () => {
    test.use({ allowConsole: true });

    test('a search that found nothing still leaves something to do @phone', async ({ page, consoleErrors }) => {
      await openMap(page);

      await searchBox(page).fill('Vizag');

      const clear = page.getByRole('button', { name: 'Clear search' });
      await expect(clear).toBeVisible();
      const spill = await page.evaluate(() =>
        document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(spill, 'the page must not scroll sideways').toBeLessThanOrEqual(1);

      await clear.click();
      await expect(stage(page)).toBeVisible({ timeout: 20_000 });
      await expect(onMap(page)).toHaveCount(3);
      // As above: the exemption covers the one known teardown race and nothing
      // else that might be logged while the map goes out and comes back.
      expect(consoleErrors.filter((e) => !/_leaflet_pos/.test(e)),
        'something other than the known Leaflet teardown race was logged').toEqual([]);
    });

    // DEFECT, and the same one as in "finding one by name" — recorded again
    // here because the phone is where it hurts: the map panel is gated on
    // `cards.length > 0` (Properties.tsx:1034), and on a 390px screen the
    // search box that vanishes with it IS the screen. The owner is owed the
    // box, with the words they typed still in it, above whatever the empty
    // result says.
    test.fail('the phone keeps the search box over an empty result @phone', async ({ page }) => {
      await openMap(page);

      await searchBox(page).fill('Vizag');

      await expect(page.getByRole('heading', { name: /Nothing matches/ })).toBeVisible();
      await expect(searchBox(page)).toBeVisible({ timeout: 3_000 });
    });
  });
});
