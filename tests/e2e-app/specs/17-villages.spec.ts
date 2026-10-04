/**
 * W16 · village maps — /app/maps.
 *
 * Everywhere else in this app you start from a record and ask where it is.
 * Here you start from the ground and ask whose it is, so the screen is the map:
 * the survey department's own shape file for a village, every plot in it, and a
 * column beside it that only ever says what is actually known.
 *
 * Four questions run through every test below:
 *
 *   · does the screen say which of its states it is in — no maps at all, maps
 *     it could not ask for, a village still being read, a village whose file
 *     did not come back — or does it fall back to drawing something?
 *   · does the panel only claim what it can honestly know? The shape file
 *     carries a number, an extent and a chaltha; the owner, the passbook and
 *     the papers come from THIS ACCOUNT'S records, and until those answer the
 *     screen may not call an owner's own field a stranger's.
 *   · does every control that writes actually write — the upload, the removal,
 *     the boundary hand-off, the fence request — and say so when it is refused?
 *   · and is a refusal visibly a refusal, rather than a silent success?
 *
 * TWO THINGS A READER MUST KNOW ABOUT THE GROUND THESE TESTS STAND ON:
 *
 *   1. `/vm/index.json` and `/vm/catalog.json` are BUNDLE assets, not API
 *      calls, so the suite's seal does not cover them: the founder's dev server
 *      really does serve eight villages out of apps/web/public/vm. Every test
 *      here answers them itself (`ground()`), so the villages on screen are the
 *      ones the test chose and nothing else.
 *   2. The village under test — KATRAGUNTA, seven plots on a three-by-two grid
 *      with one detached subdivision — is served through the UPLOADS endpoint,
 *      which is under /api and therefore inside the seal. Its geometry is
 *      deliberately regular: plot 215 adjoins 214/2, 216 and 218 and nothing
 *      else, and 77/2 touches nothing, which is what makes "adjoining plots"
 *      and "nothing to disclose" assertable rather than approximate.
 *
 * Map interactions are driven the way tests/e2e-web360 drives them: a click at
 * a FRACTION of the map panel, never a viewport coordinate — or, where WHICH
 * field was clicked is the assertion, at the centre of the number the map
 * itself wrote on that field (`clickLabel`). Everything else is asserted on
 * the controls, the wording and the call the world saw.
 *
 * No expected-failure scenario is hidden in this file: known defects on this
 * screen stay as ordinary assertions and must pass with the rest of the flow.
 */
import { test, expect, World, TILE_HOSTS } from '../fixtures/harness';
import type { Page } from '../fixtures/harness';
import { ID } from '../fixtures/ids';

// ── the village these tests are about ──────────────────────────────────

const VILLAGE = 'KATRAGUNTA';
const KEY = 'katragunta';
const FILE = 'katragunta.json';

/** A rectangle, as [lat, lon] corners, open (no repeated first corner). */
type Ring = Array<[number, number]>;
const cell = (s: number, w: number, n: number, e: number): Ring =>
  [[s, w], [s, e], [n, e], [n, w]];

/** Three columns and two rows of ~130 m fields, plus one detached subdivision
 *  to the south with a gap between it and the grid — a plot that touches
 *  nothing is the only way to assert that the panel stops offering "More". */
const LON = [79.2690, 79.2702, 79.2714, 79.2726];
const LAT = [15.7390, 15.7402, 15.7414];

interface Plot { lp: string; ring: Ring; ac?: string; chaltha?: string }

const PLOTS: Plot[] = [
  { lp: '214/2', ring: cell(LAT[1], LON[0], LAT[2], LON[1]), ac: '2.50', chaltha: 'Bandla Cheruvu' },
  { lp: '215', ring: cell(LAT[1], LON[1], LAT[2], LON[2]), ac: '4.25' },
  { lp: '216', ring: cell(LAT[1], LON[2], LAT[2], LON[3]), ac: '0.80' },
  { lp: '217', ring: cell(LAT[0], LON[0], LAT[1], LON[1]), ac: '12.00' },
  { lp: '218', ring: cell(LAT[0], LON[1], LAT[1], LON[2]), ac: '2.50' },
  // No `ac` on the sheet, so its extent is measured off the polygon —
  // 4.2441 acres — and the panel has to say which of the two it is showing.
  { lp: '219', ring: cell(LAT[0], LON[2], LAT[1], LON[3]) },
  { lp: '77/2', ring: cell(15.7378, 79.2714, 15.7386, 79.2722), ac: '0.50' },
];

/** The village's own edge, as the mandal map wants it: loose segments. */
const OUTLINE = [
  [[LAT[0], LON[0]], [LAT[0], LON[3]]],
  [[LAT[0], LON[3]], [LAT[2], LON[3]]],
  [[LAT[2], LON[3]], [LAT[2], LON[0]]],
  [[LAT[2], LON[0]], [LAT[0], LON[0]]],
];

/** The whole village, as a plot map: 7 plots, 26.794… acres. */
const TOTAL_ACRES_1DP = '26.8';

/** One feature per plot, in the shape services/api/src/main.py stores and
 *  villageIndex.ts reads: RFC 7946 lon-first, and the ring CLOSED. */
function collection(plots: Plot[] = PLOTS): Record<string, unknown> {
  return {
    type: 'FeatureCollection',
    features: plots.map((p) => ({
      type: 'Feature',
      properties: {
        lp: p.lp,
        ...(p.ac ? { ac: p.ac } : {}),
        ...(p.chaltha ? { chaltha: p.chaltha } : {}),
      },
      geometry: {
        type: 'Polygon',
        coordinates: [[...p.ring, p.ring[0]].map(([lat, lon]) => [lon, lat])],
      },
    })),
  };
}

/** One row of GET /village-maps — every field main.py:6178 returns. */
function entry(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    key: KEY, village: VILLAGE, file: FILE, plots: PLOTS.length,
    source: 'katragunta.kmz', uploadedOn: '2026-09-10T09:12:00', uploaded: true,
    acres: 26.79, centre: [15.7396, 79.2708], outline: OUTLINE,
    ...over,
  };
}

/** One village out of POST /village-maps — every field the report prints. */
function landedRow(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    key: KEY, village: VILLAGE, plots: PLOTS.length, file: FILE,
    from: 'katragunta.kmz', replaced: false,
    within: 0, near: 0, dropped: 0, clashes: 0, duplicates: [],
    ...over,
  };
}

// ── the world under the screen ─────────────────────────────────────────

interface RestAnswer {
  status?: number; contentType?: string; body?: string; json?: unknown; delayMs?: number;
}

/** Every answer this screen's own store can give, each swappable mid-test. */
interface Store {
  /** The shipped manifest — apps/web/public/vm, served by Vite, not the API. */
  shipped: Array<Record<string, unknown>>;
  /** GET /village-maps */
  list: () => RestAnswer;
  /** GET /village-maps/<file> */
  file: (name: string) => RestAnswer;
  /** POST /village-maps */
  post: () => RestAnswer;
  /** DELETE /village-maps/<key> */
  remove: (key: string) => RestAnswer;
}

/**
 * The ground every test stands on.
 *
 * The /vm/ manifest is answered here rather than left to the dev server: it is
 * a bundle asset and the seal only covers /api, so without this the villages on
 * screen would be whichever eight KMZs happen to be in apps/web/public/vm.
 */
async function ground(page: Page, world: World, over: Partial<Store> = {}): Promise<Store> {
  const store: Store = {
    shipped: [],
    list: () => ({ json: [entry()] }),
    file: () => ({ json: collection() }),
    post: () => ({ json: { villages: [landedRow()], skipped: [] } }),
    remove: () => ({ json: { removed: VILLAGE } }),
    ...over,
  };

  await page.route('**/vm/overview.json', (route) => route.fulfill({ json: store.shipped }));
  await page.route('**/vm/index.json', (route) => route.fulfill({ json: store.shipped }));
  // No mandal catalog, so the landing map is every outline in the manifest
  // above rather than the fixture mandal apps/web/public/vm ships.
  await page.route('**/vm/catalog.json', (route) => route.fulfill({ json: [] }));
  await page.route('**/vm/*.geojson', (route) => route.fulfill({ json: collection() }));

  // Print is the one control on this screen that leaves the browser, and
  // headless Chrome has nowhere to send it. Counted instead of performed.
  await page.addInitScript(() => {
    (window as unknown as { __printed: number }).__printed = 0;
    window.print = () => { (window as unknown as { __printed: number }).__printed += 1; };
  });

  world.route(/\/api\/gateway\/pattadar\/village-maps/, (_route, call) => {
    const tail = call.path.replace(/^.*\/village-maps\/?/, '');
    if (call.method === 'DELETE') return store.remove(decodeURIComponent(tail));
    if (call.method === 'POST') return store.post();
    return tail ? store.file(decodeURIComponent(tail)) : store.list();
  });

  return store;
}

const printed = (page: Page) =>
  page.evaluate(() => (window as unknown as { __printed: number }).__printed);

// ── this account's records, where a test needs a different cast ────────

/** Every field CARD selects (api.ts:22). A field left out draws as undefined,
 *  which is the bug this suite exists to catch rather than to produce. */
function card(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'w-rec-1', kind: 'parcel', title: 'Sy 300', subtitle: 'Katragunta · 2 acres',
    classification: 'Dry land', status: 'owned', stake: 'owned', khataNo: '1042',
    ownerName: 'Telukutla Shankar Reddy', village: 'Katragunta', mandal: 'Markapur',
    district: 'Prakasam', placeLine: 'Katragunta, Markapur, Prakasam',
    extent: 2, extentUnit: 'ac', extentAlt: '2 acres', marketValue: 4_000_000,
    tags: [], lat: 15.7396, lon: 79.2708, ring: [], coverFileRef: '',
    ...over,
  };
}

/** Every field PropertyList selects. Only `cards` reaches this screen, but a
 *  half-answered query is not a thing the server can do. */
function listOf(cards: Array<Record<string, unknown>>): Record<string, unknown> {
  return {
    shown: cards.length, total: cards.length, hidden: 0, filterSummary: '',
    hiddenPlaces: [], activeCount: 0, cards, facets: [],
  };
}

// ── openers and locators ───────────────────────────────────────────────

async function openMaps(page: Page): Promise<void> {
  await page.goto('/app/maps');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
}

/** Leaflet is behind a lazy import; nothing here can be driven until the map
 *  has mounted and painted its first plot number. */
async function revealVillage(page: Page, name = VILLAGE): Promise<void> {
  await page.locator('.vm-village-search input').fill(name);
}

async function openVillage(page: Page, name = VILLAGE): Promise<void> {
  await page.goto('/app/maps');
  await revealVillage(page, name);
  await page.getByRole('button', { name: new RegExp(`^${name}`) }).click();
  await expect(page.getByRole('heading', { level: 1, name })).toBeVisible();
  await expect(page.locator('.vc-label').first()).toBeVisible({ timeout: 20_000 });
}

const sideCard = (page: Page, title: string) =>
  page.locator('section.card').filter({ has: page.getByRole('heading', { name: title, exact: true }) });

const plotCard = (page: Page) => sideCard(page, 'Selected plot');
const plotFinder = (page: Page) => page.locator('.vc-tr');
const plotOptions = (page: Page) => plotFinder(page).getByRole('option');
const tape = (page: Page) => page.locator('.vc-measure');
const chip = (page: Page, name: string) =>
  page.locator('.vc-tl').getByRole('button', { name, exact: true });

/** Select a plot through the compact finder — the keyboard alternative to
 *  clicking one of the canvas polygons. */
async function pick(page: Page, lp: string): Promise<void> {
  await page.getByLabel('Find survey or plot number').fill(lp);
  await plotFinder(page).getByRole('option', {
    name: new RegExp(`^Plot ${lp.replace('/', '\\/')}\\b`),
  }).click();
  await expect(plotCard(page).locator('.vm-plotno')).toContainText(lp);
  // Selecting the first plot introduces the inspector column and resizes the
  // Leaflet stage. Let ResizeObserver and Leaflet settle before a test (or a
  // rapid keyboard-to-map user) measures coordinates against its new box.
  await page.locator('.vc-map').evaluate((el) => new Promise<void>((resolve) =>
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
}

async function startMeasure(page: Page): Promise<void> {
  const button = page.getByRole('button', { name: 'Measure on satellite', exact: true });
  await button.click();
  // A React state update arms VillageCanvas; do not send a ground click until
  // the pressed state confirms that its live event handler has the new mode.
  await expect(button).toHaveAttribute('aria-pressed', 'true');
  await page.locator('.vc-map').evaluate(() => new Promise<void>((resolve) =>
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
}

async function clickMap(page: Page, fx: number, fy: number): Promise<void> {
  const box = (await page.locator('.vc-map').boundingBox())!;
  await page.mouse.click(box.x + box.width * fx, box.y + box.height * fy);
}

async function beginTape(page: Page, fx: number, fy: number): Promise<void> {
  await clickMap(page, fx, fy);
  // The first point has no numeric readout yet; Undo becoming available is the
  // visible proof it landed before the next click is sent.
  await expect(tape(page).getByRole('button', { name: 'Undo point' })).toBeEnabled();
}

/** Click the ground under the number the map wrote for a plot.
 *
 *  The label sits on that plot's own centroid (VillageCanvas.tsx:525) and the
 *  label overlay takes no pointer events (w360.css:2563), so this is a click
 *  inside that field and inside no other — which a fraction of the panel is
 *  not, and cannot be made to be without repeating Leaflet's arithmetic. */
async function clickLabel(page: Page, lp: string): Promise<void> {
  const label = page.locator('.vc-label', {
    hasText: new RegExp(`^${lp.replace('/', '\\/')}\\b`),
  }).first();
  const box = (await label.boundingBox())!;
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
}

/** The zoom the badge is reporting — the only reading of the map's own state
 *  this screen prints, and therefore what a framing test can stand on.
 *
 *  textContent and not innerText: the badge is rendered through
 *  `text-transform: uppercase` (w360.css:2511), so innerText comes back
 *  shouting and nothing lower-case matches it. */
async function zoomShown(page: Page): Promise<number> {
  const said = (await page.locator('.vc-badge').textContent()) ?? '';
  return Number(/zoom (\d+)/.exec(said)?.[1] ?? -1);
}

/** The ground the Area filter needs: two districts with a mandal each, and
 *  three shipped villages between them — two called MYLAVARAM, because the
 *  name alone is not an address. The same places the mandal test below draws. */
async function twoMandals(page: Page, world: World): Promise<void> {
  const place = (district: string, mandal: string, village: string, slug: string, shift: number) => ({
    village, district, mandal, state: 'Andhra Pradesh', plots: 3,
    key: `ap/${slug}/${village.toLowerCase()}`, path: `ap/${slug}/${village.toLowerCase()}.geojson`,
    file: `ap/${slug}/${village.toLowerCase()}.geojson`, centre: [15.8 + shift, 79.9 + shift],
    outline: [[[15.79 + shift, 79.89 + shift], [15.79 + shift, 79.91 + shift],
      [15.81 + shift, 79.91 + shift], [15.81 + shift, 79.89 + shift]]],
  });
  const mandal = (district: string, name: string, slug: string, villages: number) => ({
    key: `ap/${slug}`, overview: `ap/${slug}/overview.json`, state: 'Andhra Pradesh',
    district, mandal: name, villages, plots: 3 * villages, acres: 1, centre: [15.8, 79.9],
  });
  await ground(page, world, {
    shipped: [
      place('BAPATLA', 'ADDANKI', 'MYLAVARAM', 'bapatla/adanki', 0),
      place('BAPATLA', 'ADDANKI', 'GOPALAPURAM', 'bapatla/adanki', 0.2),
      place('PRAKASAM', 'CHIMAKURTHI', 'MYLAVARAM', 'prakasam/chimakurti', 1),
    ],
    list: () => ({ json: [] }),
  });
  await page.route('**/vm/catalog.json', (route) => route.fulfill({ json: [
    mandal('BAPATLA', 'ADDANKI', 'bapatla/adanki', 2),
    mandal('PRAKASAM', 'CHIMAKURTHI', 'prakasam/chimakurti', 1),
  ] }));
  await page.route('**/vm/ap/*/*/overview.json', (route) => route.fulfill({ json: [] }));
}

/** The focus ring an element draws, as the browser computed it. A ring is a
 *  style, and nothing in the accessible tree carries one. */
const ring = (target: ReturnType<Page['locator']>) => target.evaluate((el) => {
  const drawn = getComputedStyle(el);
  return { style: drawn.outlineStyle, width: drawn.outlineWidth, offset: drawn.outlineOffset };
});

/** Whether all of an element's focus ring is inside the list of matches. The
 *  list scrolls, so it cuts off whatever is drawn past its own edges, and the
 *  rows sit right against them. */
const ringWhole = (target: ReturnType<Page['locator']>) => target.evaluate((el) => {
  // The scroller by its class: it is a plain div, and what clips is its box.
  const list = el.closest('.vm-search-results') as HTMLElement;
  const drawn = getComputedStyle(el);
  const reach = drawn.outlineStyle === 'none' ? 0
    : parseFloat(drawn.outlineOffset) + parseFloat(drawn.outlineWidth);
  const box = el.getBoundingClientRect();
  const port = list.getBoundingClientRect();
  const left = port.left + list.clientLeft;
  const top = port.top + list.clientTop;
  return box.left - reach >= left - 0.5 && box.top - reach >= top - 0.5
    && box.right + reach <= left + list.clientWidth + 0.5
    && box.bottom + reach <= top + list.clientHeight + 0.5;
});

/** The village search's matches. The list is labelled "Matching villages"
 *  but is a plain div with no role, so it is found by its class, and so are
 *  its rows: the buttons that open a village, which the bins beside them are
 *  not. */
const matches = (page: Page) => page.locator('.vm-villages');
const matchRows = (page: Page) => matches(page).locator('.villagerow');

/** High Contrast, from the theme menu. The item is chosen with Enter, a key
 *  press, so a focus() after it is keyboard focus in both engines. */
async function highContrast(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Change theme' }).click();
  await page.getByRole('menu', { name: 'Change theme' })
    .getByRole('menuitemradio', { name: 'High Contrast' }).focus();
  await page.keyboard.press('Enter');
  // The scheme is an attribute on the document; nothing in the accessible
  // tree carries it.
  await expect(page.locator('html')).toHaveAttribute('data-scheme', 'highContrast');
}

// ── nothing on file, and nothing askable ───────────────────────────────

test('the old village URL keeps bookmarks working and redirects to Cadastral maps', async ({ page, world }) => {
  await ground(page, world);
  await page.goto('/app/villages');
  await expect(page).toHaveURL(/\/app\/maps$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Cadastral maps' })).toBeVisible();
  const rail = page.getByRole('navigation', { name: 'Sections' })
    .getByRole('link', { name: 'Cadastral maps' });
  await expect(rail).toHaveAttribute('href', '/app/maps');
  await expect(rail).toHaveAttribute('aria-current', 'page');
});

test('with no village map anywhere, the screen says so and offers the upload rather than an empty canvas', async ({ page, world }) => {
  await ground(page, world, { list: () => ({ json: [] }) });
  await openMaps(page);

  await expect(page.getByRole('heading', { level: 1, name: 'Cadastral maps' })).toBeVisible();
  await expect(page.locator('.pagehead .grow > .note')).toHaveText('');

  const empty = sideCard(page, 'No cadastral maps yet');
  await expect(empty).toBeVisible();
  await expect(empty.getByRole('button', { name: 'Choose KMZ or KML' })).toBeVisible();
  // The only thing to do here, so here, and only here, it is the filled one.
  await expect(page.locator('main.vm .btn.primary')).toHaveText('Choose KMZ or KML');

  // No stage, no Leaflet, and nothing to fit or print — there is no map.
  await expect(page.locator('.vm-stage')).toHaveCount(0);
  await expect(page.locator('.leaflet-container')).toHaveCount(0);
  await expect(page.getByRole('button', { name: /^Fit/ })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Print' })).toHaveCount(0);
});

test('a village map being read says so on the button that is reading it', async ({ page, world }) => {
  let landed = false;
  const store = await ground(page, world, { list: () => ({ json: landed ? [entry()] : [] }) });
  // A village KMZ is a few hundred kilobytes and the read is the server's, so
  // the seconds here are real. A button that looks untouched for them is a
  // button somebody presses again.
  store.post = () => {
    landed = true;
    return { json: { villages: [landedRow()], skipped: [] }, delayMs: 1_500 };
  };
  await openMaps(page);

  await page.getByLabel('Cadastral map file').setInputFiles(KMZ);

  const reading = page.getByRole('button', { name: 'Reading…' });
  await expect(reading).toBeVisible();
  await expect(reading).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Choose KMZ or KML' })).toHaveCount(0);

  await expect(page.getByRole('heading', { level: 1, name: VILLAGE })).toBeVisible();
  expect(world.restCalls(/village-maps$/).filter((c) => c.method === 'POST')).toHaveLength(1);
});

test('while the index is still coming the screen waits rather than claiming there are none', async ({ page, world }) => {
  await ground(page, world, { list: () => ({ json: [entry()], delayMs: 1_500 }) });
  await page.goto('/app/maps');

  const waiting = page.locator('[role="status"]', { hasText: 'Loading…' });
  await expect(waiting).toBeVisible();
  await expect(waiting).toHaveAttribute('aria-busy', 'true');
  // Neither sentence may be on screen while the answer is still in flight.
  await expect(page.getByText('No cadastral maps yet')).toHaveCount(0);
  await expect(page.getByText('Cadastral maps could not be loaded')).toHaveCount(0);

  await expect(page.getByRole('heading', { level: 1, name: 'Cadastral maps' })).toBeVisible();
  await expect(page.getByLabel('Search all villages')).toBeVisible();
});

test('a village that is both shipped and uploaded is one village, and the upload is the one drawn', async ({ page, world }) => {
  // Re-uploading a village is how a wrong map is corrected (villageIndex.ts:12),
  // so the copy in the bundle has to lose — and be left unread.
  await ground(page, world, {
    shipped: [{
      village: 'KATRAGUNTA', file: 'katragunta.geojson', key: 'katragunta',
      plots: 3, acres: 9, centre: [15.7396, 79.2708], outline: OUTLINE,
    }],
  });
  let fromBundle = 0;
  await page.route('**/vm/katragunta.geojson', (route) => {
    fromBundle += 1;
    return route.fulfill({ json: collection(PLOTS.slice(0, 3)) });
  });
  await openMaps(page);

  await page.getByLabel('Search all villages').fill(VILLAGE);
  const rows = page.locator('.vm-villages .villagerow');
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText('7');          // the uploaded sheet, not the shipped 3
  // The bin is the proof of which of the two won: only an upload can be taken
  // back off.
  await expect(page.getByRole('button', { name: `Remove ${VILLAGE}` })).toBeVisible();

  await rows.first().click();
  await expect(page.locator('.vc-label').first()).toBeVisible({ timeout: 20_000 });
  await expect(page.locator('.vc-label')).toHaveCount(7);
  expect(world.restCalls(new RegExp(FILE)).length).toBeGreaterThan(0);
  expect(fromBundle, 'the shipped copy was read even though an upload replaced it').toBe(0);
});

// ── the landing map: the mandal ────────────────────────────────────────

test('every village on record is drawn on one map, and the head counts what is on it', async ({ page, world }) => {
  await ground(page, world);
  await openMaps(page);

  await expect(page.locator('.pagehead .grow > .note')).toHaveText('1 village on record · 7 plots');
  await expect(page.locator('.vc-badge')).toHaveText('1 village');
  await expect(page.getByRole('button', { name: 'Fit all' })).toBeVisible();
  // The village writes its own name and totals on the overview, to the same
  // one decimal the head and the village switch use once it is open.
  const mark = page.locator('.vc-village');
  await expect(mark).toContainText(VILLAGE);
  await expect(mark).toContainText(`7 plots · ${TOTAL_ACRES_1DP} ac`);
});

test('the first screen is the page header filter and a full-width map with one way to choose', async ({ page, world }) => {
  await ground(page, world);
  await openMaps(page);
  await expect(page.locator('.vc-village')).toBeVisible();

  // Nothing above the title: the mandal is the page, and the rail already
  // says Village maps. A level names only the one above it.
  await expect(page.locator('main.vm .pagehead .eyebrow')).toHaveCount(0);
  // The list is open and there is no dropdown over it: the rows and the
  // outlines on the map are the choice.
  await expect(page.locator('.vm-switch')).toHaveCount(0);
  await expect(page.getByLabel('Search all villages')).toBeVisible();
  // The Properties-style filter tally carries the list count; the map carries
  // the village until search asks for a matching row. No paper rail reserves
  // width: the stage is the whole map body.
  await expect(page.locator('.filterbar .tally')).toHaveText('1 village');
  await expect(page.locator('.vc-village')).toHaveCount(1);
  await expect(page.locator('.vm-side')).toHaveCount(0);
  const bodyBox = (await page.locator('.vm-body').boundingBox())!;
  const mapBox = (await page.locator('.vm-stage').boundingBox())!;
  expect(mapBox.width).toBeGreaterThan(bodyBox.width * 0.98);
  // With nothing chosen there is nothing to commit, so nothing is filled.
  await expect(page.locator('main.vm .btn.primary')).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Properties map' })).toBeVisible();
});

test('the map reaches the bottom of the window, with no dead page under it', async ({ page, world }) => {
  await ground(page, world);
  await openMaps(page);
  await expect(page.locator('.vc-village')).toBeVisible();

  const stage = (await page.locator('.vm-stage').boundingBox())!;
  const view = page.viewportSize()!;
  const bottom = stage.y + stage.height;
  // Inside the window, and within main's closing 24px of it: the stage used
  // to end 20px past the fold with 96px of empty page under it.
  expect(bottom).toBeLessThanOrEqual(view.height);
  expect(view.height - bottom).toBeLessThanOrEqual(40);
});

test('clicking a village on the mandal map opens it', async ({ page, world }) => {
  await ground(page, world);
  await openMaps(page);
  await expect(page.locator('.vc-village')).toBeVisible();

  await clickMap(page, 0.5, 0.5);

  await expect(page.getByRole('heading', { level: 1, name: VILLAGE })).toBeVisible();
  await expect(page.locator('.vc-badge')).toContainText(VILLAGE);
  await expect(page.getByRole('button', { name: 'Fit village' })).toBeVisible();
});

test('the mandal map offers no Plot size, because it is not showing plots', async ({ page, world }) => {
  await ground(page, world);
  await openMaps(page);
  await expect(page.locator('.vc-village')).toBeVisible();

  await expect(page.locator('.vc-tl').getByRole('button')).toHaveCount(3);
  await expect(chip(page, 'Plot size')).toHaveCount(0);

  // Which photograph a village sits on is a fair question before opening it,
  // so the other three still work.
  await chip(page, 'Street map').click();
  await expect(page.locator('.leaflet-tile-pane img[src*="tile.openstreetmap.org"]').first()).toBeVisible();
  await expect(page.locator('.vc-village')).toContainText(VILLAGE);
});

test('a village map with no outline is still listed, and the panel says where to pick it', async ({ page, world }) => {
  await ground(page, world, { list: () => ({ json: [entry({ outline: [] })] }) });
  await openMaps(page);

  await expect(page.getByText('1 cadastral map on file')).toBeVisible();
  // No count of an area that is not drawn; search remains the way into it.
  await expect(page.locator('.pagehead .grow > .note')).toHaveText('');
  await expect(page.locator('.vm-stage')).toContainText('Search for a village above.');
  await revealVillage(page);
  await expect(page.getByRole('button', { name: new RegExp(`^${VILLAGE}`) })).toBeVisible();
  // Nothing is drawn, so nothing is offered to fit or print.
  await expect(page.getByRole('button', { name: /^Fit/ })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Print' })).toHaveCount(0);
  await expect(page.locator('.leaflet-container')).toHaveCount(0);
});

test('with no mandal to hold the stage, a village being read holds it instead', async ({ page, world }) => {
  await ground(page, world, {
    list: () => ({ json: [entry({ outline: [] })] }),
    file: () => ({ json: collection(), delayMs: 1_500 }),
  });
  await openMaps(page);
  await expect(page.locator('.vm-stage')).toContainText('Search for a village above.');

  await revealVillage(page);
  await page.getByRole('button', { name: new RegExp(`^${VILLAGE}`) }).click();

  // Neither the empty state nor a blank panel: the shape file is being read
  // and the stage says so.
  const waiting = page.locator('.vm-stage [role="status"]');
  await expect(waiting).toBeVisible();
  await expect(waiting).toHaveAttribute('aria-busy', 'true');
  await expect(page.locator('.vm-stage')).not.toContainText('Pick a village from the list.');

  await expect(page.locator('.vc-label').first()).toBeVisible({ timeout: 20_000 });
  await expect(page.locator('.pagehead .grow > .note')).toHaveText(`7 plots · ${TOTAL_ACRES_1DP} ac`);
});

test('the way back out of a village is to all of them', async ({ page, world }) => {
  await ground(page, world);
  await openVillage(page);

  await page.getByRole('button', { name: 'All villages' }).click();

  await expect(page.getByRole('heading', { level: 1, name: 'Cadastral maps' })).toBeVisible();
  await expect(page.locator('.vc-badge')).toHaveText('1 village');
  await expect(plotCard(page)).toHaveCount(0);
  // And the list is open again, because that is what you came back for.
  await expect(page.getByLabel('Search all villages')).toBeVisible();
});

// ── choosing a village ─────────────────────────────────────────────────

test('searching the village list folds the spelling, so Chintagunta finds CHINTHAGUNTA', async ({ page, world }) => {
  await ground(page, world, {
    list: () => ({ json: [
      entry(),
      entry({ key: 'chintagunta', village: 'CHINTHAGUNTA', file: 'chinthagunta.json', plots: 219 }),
    ] }),
  });
  await openMaps(page);

  const rows = page.locator('.vm-villages .villagerow');
  await expect(page.locator('.filterbar .tally')).toHaveText('2 villages');
  await expect(rows).toHaveCount(0);

  await page.getByLabel('Search all villages').fill('Chintagunta');

  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText('CHINTHAGUNTA');
});

test('the village list follows the mandal I pick, and a shared name is two villages', async ({ page, world }) => {
  // Two MYLAVARAMs in two mandals: the name alone is not an address.
  const place = (district: string, mandal: string, village: string, slug: string, shift: number) => ({
    village, district, mandal, state: 'Andhra Pradesh', plots: 3,
    key: `ap/${slug}/${village.toLowerCase()}`, path: `ap/${slug}/${village.toLowerCase()}.geojson`,
    file: `ap/${slug}/${village.toLowerCase()}.geojson`, centre: [15.8 + shift, 79.9 + shift],
    outline: [[[15.79 + shift, 79.89 + shift], [15.79 + shift, 79.91 + shift],
      [15.81 + shift, 79.91 + shift], [15.81 + shift, 79.89 + shift]]],
  });
  const addanki = [place('BAPATLA', 'ADDANKI', 'MYLAVARAM', 'bapatla/adanki', 0),
    place('BAPATLA', 'ADDANKI', 'GOPALAPURAM', 'bapatla/adanki', 0.2)];
  const chimakurthi = [place('PRAKASAM', 'CHIMAKURTHI', 'MYLAVARAM', 'prakasam/chimakurti', 1)];
  const mandal = (district: string, name: string, slug: string, villages: number) => ({
    key: `ap/${slug}`, overview: `ap/${slug}/overview.json`, state: 'Andhra Pradesh',
    district, mandal: name, villages, plots: 3 * villages, acres: 1, centre: [15.8, 79.9],
  });
  await ground(page, world, { shipped: [...addanki, ...chimakurthi], list: () => ({ json: [] }) });
  await page.route('**/vm/catalog.json', (route) => route.fulfill({ json: [
    mandal('BAPATLA', 'ADDANKI', 'bapatla/adanki', 2),
    mandal('PRAKASAM', 'CHIMAKURTHI', 'prakasam/chimakurti', 1),
  ] }));
  await page.route('**/vm/ap/*/*/overview.json', (route) => route.fulfill({ json: [] }));
  await openMaps(page);

  const rows = page.locator('.vm-villages .villagerow');
  // With no Area filter, the map and filter tally hold the complete global
  // answer; rows appear only when the header search asks for matches.
  await expect(rows).toHaveCount(0);
  await expect(page.locator('.filterbar .tally')).toHaveText('3 villages');
  await expect(page.locator('.vc-village')).toHaveCount(3);
  await expect(page.getByRole('button', { name: 'Fit all' })).toBeVisible();

  // Country and State are information, not disabled form controls. District
  // and Mandal are the same shared filter surface Properties uses.
  await expect(page.getByText('India · Andhra Pradesh')).toBeVisible();
  await expect(page.getByText('All mapped areas')).toBeVisible();
  await expect(page.getByLabel('Country')).toHaveCount(0);
  await expect(page.getByLabel('State')).toHaveCount(0);
  await page.getByRole('button', { name: '+ Filter' }).click();
  const area = page.getByRole('group', { name: 'Narrow villages by area' });
  const optionSearch = page.getByLabel('Search districts or mandals');
  await optionSearch.fill('Chimakurthi');
  await expect(area.getByRole('button', { name: /CHIMAKURTHI/ })).toBeVisible();
  await expect(area.getByRole('button', { name: /BAPATLA/ })).toHaveCount(0);
  await optionSearch.fill('Prakasam');
  await area.locator('.fgrp').first().getByRole('button', { name: /PRAKASAM/ }).click();
  await page.getByRole('button', { name: 'Close filters' }).click();

  // Changing the district jumps the map and list to its first mandal, reports
  // the result count, and leaves a removable Properties-style filter chip.
  await expect(page.locator('.vm-place strong')).toHaveText('PRAKASAM');
  await expect(rows).toHaveCount(0);
  await expect(page.locator('.vc-village')).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Fit district' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Remove filter District PRAKASAM' })).toBeVisible();
  await expect(page.locator('.filterbar .tally')).toHaveText('1 village');

  // Search says and keeps its scope; it never silently returns Addanki's
  // MYLAVARAM while the information line says Prakasam · Chimakurthi.
  await page.getByLabel('Search villages in PRAKASAM').fill('Mylavaram');
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText('MYLAVARAM');
  await expect(page.locator('.filterbar .tally')).toHaveText('1 village');
});

test('the Filter narrows by district and mandal, and finding a village by name is the header search\'s job', async ({ page, world }) => {
  await twoMandals(page, world);
  await openMaps(page);

  await page.getByRole('button', { name: '+ Filter' }).click();
  const area = page.getByRole('group', { name: 'Narrow villages by area' });
  // A group in the popover is an eyebrow over its options and has no role or
  // name of its own, so the eyebrows are read by class.
  await expect(area.locator('.fgrp > .eyebrow')).toHaveText(['District', 'Mandal']);
  // Its search says what it searches, and a village's name is not in it.
  await area.getByLabel('Search districts or mandals').fill('Gopalapuram');
  await expect(area).toContainText('No filter options match that search.');
  await page.getByRole('button', { name: 'Close filters' }).click();

  // One way to a village by its name: the search in the header.
  await page.getByLabel('Search all villages').fill('Gopalapuram');
  const rows = matchRows(page);
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText('GOPALAPURAM');
});

test('the Filter says nothing matched only once I have typed something for it to match', async ({ page, world }) => {
  // No catalog: ground() serves an empty one, which is what a failed or
  // refused /vm/catalog.json read leaves too. The Filter has no district or
  // mandal to offer.
  await ground(page, world);
  await openMaps(page);

  await page.getByRole('button', { name: '+ Filter' }).click();
  const area = page.getByRole('group', { name: 'Narrow villages by area' });
  const search = area.getByLabel('Search districts or mandals');
  await expect(search).toBeVisible();
  // Nothing typed, so nothing has failed to match: the search row, and
  // nothing under it. (A group is an eyebrow over its options with no role of
  // its own, so groups are counted by class.)
  await expect(area.getByText('No filter options match that search.')).toHaveCount(0);
  await expect(area.locator('.fgrp')).toHaveCount(0);

  await search.fill('Ongole');

  await expect(area.getByText('No filter options match that search.')).toBeVisible();
});

test('a village nobody has sent a map for says so rather than showing an empty list', async ({ page, world }) => {
  await ground(page, world);
  await openMaps(page);

  await page.getByLabel('Search all villages').fill('Ongole');

  await expect(page.locator('.vm-villages .villagerow')).toHaveCount(0);
  await expect(page.getByText('No cadastral map on file matching that.')).toBeVisible();
});

test('opening a village keeps the information filter and marks one row, without a duplicate switch', async ({ page, world }) => {
  await ground(page, world);
  await openVillage(page);

  await expect(page.getByLabel('Search all villages')).toBeVisible();
  await expect(page.locator('.vm-side')).toHaveCount(0);
  await page.getByLabel('Search all villages').fill(VILLAGE);
  await expect(page.locator('.vm-villages .villagerow[aria-pressed="true"]')).toContainText(VILLAGE);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(VILLAGE);
});
test('a village opens with every plot numbered, and the head counts them', async ({ page, world }) => {
  await ground(page, world);
  await openVillage(page);

  // The eyebrow names the level above, the page; the title names this one.
  await expect(page.locator('main.vm .pagehead .eyebrow')).toHaveText('Cadastral maps');
  await expect(page.locator('.pagehead .grow > .note')).toHaveText(`7 plots · ${TOTAL_ACRES_1DP} ac`);
  await expect(sideCard(page, 'All plots')).toHaveCount(0);
  await expect(page.getByLabel('Find survey or plot number')).toBeVisible();
  await expect(page.locator('.vc-label')).toHaveCount(7);
  // A real zoom level, not the em-dash the badge starts life with: the map
  // has framed the village and said where it got to.
  await expect(page.locator('.vc-badge'))
    .toHaveText(new RegExp(`^${VILLAGE} · zoom \\d+ · numbers on$`));
});

test('Fit village puts the whole village back after I have zoomed into it', async ({ page, world }) => {
  await ground(page, world);
  await openVillage(page);
  await expect(page.locator('.vc-badge')).toHaveText(/zoom \d+/);
  const framed = await zoomShown(page);

  await page.getByRole('button', { name: 'Zoom in' }).click();
  await expect.poll(() => zoomShown(page)).toBe(framed + 1);

  await page.getByRole('button', { name: 'Fit village' }).click();

  await expect.poll(() => zoomShown(page)).toBe(framed);
  await expect(page.locator('.vc-label')).toHaveCount(7);
});

test('the number and the extent are written on the plot, and never on each other', async ({ page, world }) => {
  await ground(page, world);
  await openVillage(page);

  const label = page.locator('.vc-label', { hasText: '215' }).first();
  await expect(label).toContainText('215');
  await expect(label).toContainText('4.25 ac');

  // No two numbers may be written over each other: half a plot number reads
  // as a different plot number.
  const boxes = await page.locator('.vc-label').evaluateAll((nodes) =>
    nodes.map((n) => n.getBoundingClientRect()).map((r) => [r.left, r.top, r.right, r.bottom]));
  for (let i = 0; i < boxes.length; i += 1) {
    for (let j = i + 1; j < boxes.length; j += 1) {
      const [a, b] = [boxes[i], boxes[j]];
      const overlaps = a[0] < b[2] && a[2] > b[0] && a[1] < b[3] && a[3] > b[1];
      expect(overlaps, `labels ${i} and ${j} are written over each other`).toBe(false);
    }
  }
});

test('Numbers puts the plot numbers away, and the badge says which way it is', async ({ page, world }) => {
  await ground(page, world);
  await openVillage(page);

  const numbers = page.getByRole('button', { name: 'Numbers' });
  await expect(numbers).toHaveAttribute('aria-pressed', 'true');

  await numbers.click();

  await expect(numbers).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('.vc-label')).toHaveCount(0);
  await expect(page.locator('.vc-badge')).toContainText('numbers off');

  await numbers.click();
  await expect(page.locator('.vc-label')).toHaveCount(7);
});

test('the three basemaps are three different maps', async ({ page, world }) => {
  await ground(page, world);
  await openVillage(page);

  await expect(chip(page, 'Satellite')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.leaflet-tile-pane img[src*="arcgisonline"]').first()).toBeVisible();

  await chip(page, 'Street map').click();
  await expect(chip(page, 'Street map')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.leaflet-tile-pane img[src*="tile.openstreetmap.org"]').first()).toBeVisible();
  await expect(page.locator('.leaflet-tile-pane img[src*="arcgisonline"]')).toHaveCount(0);

  // Boundaries is the bare cadastre — no photograph under it at all.
  await chip(page, 'Boundaries').click();
  await expect(chip(page, 'Boundaries')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.leaflet-tile-pane img')).toHaveCount(0);
  // The plots are still there; it is the ground that went.
  await expect(page.locator('.vc-label')).toHaveCount(7);
});

test('a mode chip is a switch, so the one that is already on turns itself off', async ({ page, world }) => {
  await ground(page, world);
  await openVillage(page);

  await chip(page, 'Street map').click();
  await chip(page, 'Street map').click();
  await expect(chip(page, 'Satellite')).toHaveAttribute('aria-pressed', 'true');
  await expect(chip(page, 'Street map')).toHaveAttribute('aria-pressed', 'false');

  // "Off" for the imagery is the bare cadastre, which is Boundaries.
  await chip(page, 'Satellite').click();
  await expect(chip(page, 'Boundaries')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.leaflet-tile-pane img')).toHaveCount(0);
});

test('Plot size shades the village by extent and counts every band', async ({ page, world }) => {
  await ground(page, world);
  await openVillage(page);

  await chip(page, 'Plot size').click();

  const legend = page.locator('.vc-legend', { hasText: 'Plot size' });
  await expect(legend).toBeVisible();
  for (const [band, count] of [
    ['Under 1 ac', '2'],       // 0.80 and 0.50
    ['1 – 3 ac', '2'],         // 2.50 and 2.50
    ['3 – 10 ac', '2'],        // 4.25 and the 4.244 measured off the shape
    ['10 ac and over', '1'],   // 12.00
  ] as const) {
    await expect(legend.locator('.row', { hasText: band })).toContainText(count);
  }
  // The bands are the whole village, not a sample of a sidebar list.
  await expect(page.locator('.pagehead .grow > .note')).toContainText('7 plots');
});

test('a shape with no third corner is not a plot, and is not counted as one', async ({ page, world }) => {
  // Exports carry stray two-point lines — a road edge, half a boundary. Drawn
  // as a plot each would be a field with no area, listed and searchable and
  // handable to a record (villageIndex.ts:213 drops them).
  await ground(page, world, {
    file: () => ({ json: collection([
      ...PLOTS,
      { lp: '900', ring: [[15.7370, 79.2680], [15.7372, 79.2682]] as Ring, ac: '1.00' },
    ]) }),
  });
  await openVillage(page);

  await expect(page.locator('.pagehead .grow > .note')).toHaveText(`7 plots · ${TOTAL_ACRES_1DP} ac`);
  await expect(page.locator('.vc-label')).toHaveCount(7);

  await page.getByLabel('Find survey or plot number').fill('900');
  await page.getByRole('button', { name: 'Find plot' }).click();
  await expect(page.locator('.vc-tr')).toContainText('No plot starts with 900 in this village.');
});

// ── the village search's matches ───────────────────────────────────────
// They float over the map the way the jump box's results float over the
// page. Listed in the page's flow, they pushed the map 146px down.

test('choosing a matching village closes the matches and clears the search', async ({ page, world }) => {
  await ground(page, world);
  await openMaps(page);
  const search = page.getByLabel('Search all villages');
  await search.fill(VILLAGE);
  const rows = matchRows(page);
  await expect(rows).toHaveCount(1);

  await rows.first().click();

  await expect(page.getByRole('heading', { level: 1, name: VILLAGE })).toBeVisible();
  await expect(matches(page)).toHaveCount(0);
  await expect(search).toHaveValue('');
  // Back in the field, ready for the next name.
  await expect(search).toBeFocused();
});

test('Enter on a matching village opens it and puts me back in the search @phone', async ({ page, world }) => {
  await ground(page, world);
  await openMaps(page);
  const search = page.getByLabel('Search all villages');
  await search.fill(VILLAGE);
  // Reached from the keyboard. focus() rather than Tab, because Safari's Tab
  // passes buttons by unless the reader has asked it not to.
  await matchRows(page).first().focus();

  await page.keyboard.press('Enter');

  await expect(page.getByRole('heading', { level: 1, name: VILLAGE })).toBeVisible();
  await expect(matches(page)).toHaveCount(0);
  await expect(search).toHaveValue('');
  // The row focus was on has gone, so focus comes back to the field rather
  // than falling to the page.
  await expect(search).toBeFocused();
});

test('Escape closes the matches and keeps what I typed', async ({ page, world }) => {
  await ground(page, world);
  await openVillage(page);
  // A plot is chosen, and the page's own Escape puts a plot away. This Escape
  // belongs to the matches, and does nothing else.
  await pick(page, '215');
  const search = page.getByLabel('Search all villages');
  await search.fill(VILLAGE);
  const rows = matchRows(page);
  await expect(rows).toHaveCount(1);

  await page.keyboard.press('Escape');

  await expect(rows).toHaveCount(0);
  await expect(search).toHaveValue(VILLAGE);
  await expect(search).toBeFocused();
  await expect(plotCard(page)).toBeVisible();

  // From a row as well: focus comes back to the field rather than going
  // with the row it was on.
  await search.click();
  await expect(rows).toHaveCount(1);
  await page.keyboard.press('Tab');
  await expect(rows.first()).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(rows).toHaveCount(0);
  await expect(search).toBeFocused();
  await expect(search).toHaveValue(VILLAGE);
  await expect(plotCard(page)).toBeVisible();
});

test('once the matches are away, the next Escape is the page\'s again and puts the plot away', async ({ page, world }) => {
  await ground(page, world);
  await openVillage(page);
  await pick(page, '215');
  const search = page.getByLabel('Search all villages');
  await search.fill(VILLAGE);
  await expect(matchRows(page)).toHaveCount(1);
  await page.keyboard.press('Escape');
  await expect(matches(page)).toHaveCount(0);
  await expect(plotCard(page)).toBeVisible();

  await page.keyboard.press('Escape');

  await expect(plotCard(page)).toHaveCount(0);
  await expect(page.getByLabel('Find survey or plot number')).toHaveValue('');
  await expect(search).toHaveValue(VILLAGE);
});

test('after I remove a village from the matches, Escape still puts the rest of them away @phone', async ({ page, world }) => {
  let gone = false;
  const other = entry({ key: 'katrapadu', village: 'KATRAPADU', file: 'katrapadu.json' });
  const store = await ground(page, world, { list: () => ({ json: gone ? [entry()] : [entry(), other] }) });
  store.remove = () => { gone = true; return { json: { removed: 'KATRAPADU' } }; };
  await openVillage(page);
  await pick(page, '215');
  const search = page.getByLabel('Search all villages');
  await search.fill('KATRA');
  await expect(matchRows(page)).toHaveCount(2);

  // The bin that was pressed goes with its row, and focus goes with it. In
  // Safari a pressed button never takes focus, so there focus is out of the
  // matches after any press in them.
  await page.getByRole('button', { name: 'Remove KATRAPADU' }).click();
  await expect(matchRows(page)).toHaveCount(1);

  await page.keyboard.press('Escape');

  await expect(matches(page)).toHaveCount(0);
  await expect(search).toHaveValue('KATRA');
  // The matches' own Escape, and nothing else: the plot is still chosen.
  await expect(plotCard(page)).toBeVisible();
});

test('a click away from the search closes its matches', async ({ page, world }) => {
  await ground(page, world);
  await openMaps(page);
  const search = page.getByLabel('Search all villages');
  await search.fill(VILLAGE);
  const rows = matchRows(page);
  await expect(rows).toHaveCount(1);

  // Somewhere neutral: a click on the map would open a village as well.
  await page.getByRole('heading', { level: 1, name: 'Cadastral maps' }).click();

  await expect(rows).toHaveCount(0);
  await expect(search).toHaveValue(VILLAGE);
});

test('tabbing out of the village search closes its matches, as a click away does', async ({ page, world }) => {
  await ground(page, world);
  await openMaps(page);
  const search = page.getByLabel('Search all villages');
  await search.fill(VILLAGE);
  const rows = matchRows(page);
  await expect(rows).toHaveCount(1);

  await page.keyboard.press('Shift+Tab');

  await expect(page.getByRole('button', { name: '+ Filter' })).toBeFocused();
  await expect(rows).toHaveCount(0);
  await expect(search).toHaveValue(VILLAGE);
});

test('the Filter and the village matches take turns rather than covering each other @phone', async ({ page, world }) => {
  await twoMandals(page, world);
  await openMaps(page);
  const area = page.getByRole('group', { name: 'Narrow villages by area' });
  const search = page.getByLabel('Search all villages');
  const rows = matchRows(page);

  await page.getByRole('button', { name: '+ Filter' }).click();
  await expect(area).toBeVisible();
  // The village search sits in the Filter's own row, so pressing it is not
  // pressing away from the Filter. Typing a name is what puts the Filter away.
  await search.click();
  await search.fill('Mylavaram');
  await expect(rows).toHaveCount(2);
  await expect(area).toHaveCount(0);
  // Put away without taking me out of the field I am typing in.
  await expect(search).toBeFocused();
  await expect(search).toHaveValue('Mylavaram');

  await page.getByRole('button', { name: '+ Filter' }).click();
  await expect(area).toBeVisible();
  await expect(rows).toHaveCount(0);
  await expect(search).toHaveValue('Mylavaram');
});

// ── where the keyboard is ──────────────────────────────────────────────
// A search pill is a borderless input inside a bordered pill. The ring was
// drawn on the input, a box inside the pill's own edge, and the Filter's own
// search drew none at all. These run on the phone as well, because Safari
// draws its own rings and decides :focus-visible for itself.

test('the village search draws its focus ring around the whole field, not inside it @phone', async ({ page, world }) => {
  await ground(page, world);
  await openMaps(page);
  const search = page.getByLabel('Search all villages');
  // focus() from a fresh load is keyboard focus in both engines.
  await search.focus();
  await expect(search).toBeFocused();

  // The pill by its class: the ring is a style of that element.
  const pill = page.locator('.vm-village-search');
  await expect.poll(() => ring(pill)).toMatchObject({ style: 'solid', width: '2px' });
  await expect.poll(async () => (await ring(search)).style).toBe('none');
});

test('in High Contrast the village search keeps one 3px ring, on the field @phone', async ({ page, world }) => {
  await ground(page, world);
  await openMaps(page);
  await highContrast(page);

  const search = page.getByLabel('Search all villages');
  await search.focus();
  await expect(search).toBeFocused();
  // The pill by its class: the ring is a style of that element.
  const pill = page.locator('.vm-village-search');
  await expect.poll(() => ring(pill)).toMatchObject({ style: 'solid', width: '3px' });
  await expect.poll(async () => (await ring(search)).style).toBe('none');
});

test('the Filter\'s own search shows where focus is @phone', async ({ page, world }) => {
  await twoMandals(page, world);
  await openMaps(page);
  // Opened from the keyboard, so focus arrives in its search the way it does
  // for anybody who reached + Filter with Tab.
  await page.getByRole('button', { name: '+ Filter' }).focus();
  await page.keyboard.press('Enter');
  const area = page.getByRole('group', { name: 'Narrow villages by area' });
  const search = area.getByRole('textbox');
  await expect(search).toBeFocused();

  // The search row by its class: FacetFilter draws it as a plain div with no
  // role or name. The popover scrolls, and would cut off a ring drawn outside
  // the row, so the row draws it inset.
  const head = area.locator('.fpop-head');
  await expect.poll(() => ring(head)).toMatchObject({ style: 'solid', width: '2px' });
  expect(parseFloat((await ring(head)).offset)).toBeLessThan(0);
  await expect.poll(async () => (await ring(search)).style).toBe('none');
});

test('in High Contrast the Filter\'s own search keeps one 3px ring, inside its row @phone', async ({ page, world }) => {
  await twoMandals(page, world);
  await openMaps(page);
  await highContrast(page);
  await page.getByRole('button', { name: '+ Filter' }).focus();
  await page.keyboard.press('Enter');
  const area = page.getByRole('group', { name: 'Narrow villages by area' });
  const search = area.getByRole('textbox');
  await expect(search).toBeFocused();

  // The search row by its class: FacetFilter draws it as a plain div with no
  // role or name.
  const head = area.locator('.fpop-head');
  await expect.poll(() => ring(head)).toMatchObject({ style: 'solid', width: '3px' });
  expect(parseFloat((await ring(head)).offset)).toBeLessThan(0);
  await expect.poll(async () => (await ring(search)).style).toBe('none');
});

test('the top bar\'s search draws its ring around the whole field as well @phone', async ({ page, world }) => {
  await ground(page, world);
  await openMaps(page);
  // Every search pill shares the rule, and the top bar's is on this screen.
  const jump = page.getByLabel('Jump to a property, document, person');
  await jump.focus();
  await expect(jump).toBeFocused();

  const pill = page.getByRole('search').filter({ has: jump });
  await expect.poll(() => ring(pill)).toMatchObject({ style: 'solid', width: '2px' });
  await expect.poll(async () => (await ring(jump)).style).toBe('none');
});

test('a matching village shows all of its focus ring, not one cut off at the list\'s edge @phone', async ({ page, world }) => {
  await ground(page, world);
  await openMaps(page);
  await page.getByLabel('Search all villages').fill(VILLAGE);
  const row = matchRows(page).first();
  const bin = page.getByRole('button', { name: `Remove ${VILLAGE}` });

  // focus() with nothing clicked yet is keyboard focus in both engines.
  await row.focus();
  await expect.poll(async () => (await ring(row)).style).not.toBe('none');
  expect(await ringWhole(row), 'the row\'s ring runs past the edge of the list').toBe(true);
  await bin.focus();
  await expect.poll(async () => (await ring(bin)).style).not.toBe('none');
  expect(await ringWhole(bin), 'the bin\'s ring runs past the edge of the list').toBe(true);
});

test('in High Contrast a matching village\'s 3px ring is all there too @phone', async ({ page, world }) => {
  await ground(page, world);
  await openMaps(page);
  await highContrast(page);
  await page.getByLabel('Search all villages').fill(VILLAGE);
  const row = matchRows(page).first();
  const bin = page.getByRole('button', { name: `Remove ${VILLAGE}` });

  await row.focus();
  await expect.poll(() => ring(row)).toMatchObject({ style: 'solid', width: '3px' });
  expect(await ringWhole(row), 'the row\'s ring runs past the edge of the list').toBe(true);
  await bin.focus();
  await expect.poll(() => ring(bin)).toMatchObject({ style: 'solid', width: '3px' });
  expect(await ringWhole(bin), 'the bin\'s ring runs past the edge of the list').toBe(true);
});

// ── one selection, shared by the finder and the map ────────────────────

test('the plot finder and the map are one selection', async ({ page, world }) => {
  await ground(page, world);
  await openVillage(page);

  await pick(page, '215');

  await expect(page.getByLabel('Find survey or plot number')).toHaveValue('215');
  await expect(plotCard(page).locator('.vm-plotno')).toContainText('215');
  // The map writes the chosen plot's number unconditionally — `.on` is the
  // forced label (VillageCanvas.tsx:547), so this is the map agreeing.
  await expect(page.locator('.vc-label.on')).toContainText('215');
});

test('clicking a field on the map writes its number into the finder', async ({ page, world }) => {
  await ground(page, world);
  await openVillage(page);

  // The ground under 217's own number, not a fraction of the panel: which
  // field was clicked is the whole assertion.
  await clickLabel(page, '217');

  await expect(plotCard(page).locator('.vm-plotno')).toContainText('217');
  await expect(plotCard(page).locator('.vm-acres')).toHaveText('12.00');
  await expect(page.getByLabel('Find survey or plot number')).toHaveValue('217');
  await expect(page.locator('.vc-label.on')).toContainText('217');
});

test('clicking bare ground puts the plot card away', async ({ page, world }) => {
  await ground(page, world);
  await openVillage(page);
  await pick(page, '215');

  // The far left of the panel is outside the village's own bounds — fitBounds
  // pads by 26px and the mode chips are along the top, not down the side.
  const box = (await page.locator('.vc-map').boundingBox())!;
  await page.mouse.click(box.x + 5, box.y + box.height * 0.5);

  await expect(plotCard(page)).toHaveCount(0);
  await expect(page.getByLabel('Find survey or plot number')).toHaveValue('');
});

test('Escape puts the tape away, restores the prior map, then clears the selection', async ({ page, world }) => {
  await ground(page, world);
  await openVillage(page);
  await pick(page, '215');

  // Measure temporarily owns Satellite, but Escape must not discard the map
  // the reader deliberately chose before taking the tape out.
  await chip(page, 'Boundaries').click();
  const measure = page.getByRole('button', { name: 'Measure on satellite', exact: true });
  await measure.click();
  await expect(measure).toHaveAttribute('aria-pressed', 'true');
  await expect(chip(page, 'Satellite')).toHaveAttribute('aria-pressed', 'true');

  await page.keyboard.press('Escape');
  await expect(measure).toHaveAttribute('aria-pressed', 'false');
  await expect(chip(page, 'Boundaries')).toHaveAttribute('aria-pressed', 'true');
  await expect(plotCard(page)).toBeVisible();

  await page.keyboard.press('Escape');
  await expect(plotCard(page)).toHaveCount(0);
});

// ── what the panel knows about one plot ────────────────────────────────

test('a plot answers for itself in the units the papers use', async ({ page, world }) => {
  await ground(page, world);
  await openVillage(page);
  await pick(page, '214/2');

  const plot = plotCard(page);
  // The department's figure as the sheet wrote it, and the same one the
  // finder and the map label print.
  await expect(plot.locator('.vm-acres')).toHaveText('2.50');
  await expect(plot.locator('.vm-plot')).toContainText('acres');
  await expect(plot.locator('.vm-plot')).toContainText('2 Acres 20 Guntas · 1.012 ha');
  await expect(plot.locator('.vm-facts')).toContainText('15.74080, 79.26960');
  // No Village row: the village is the page's title and the switch above.
  await expect(plot.locator('.vm-facts dt')).toHaveText(['Owner', 'Passbook', 'Centroid']);
});

test('the plot number is outlined and as wide as the number needs', async ({ page, world }) => {
  await ground(page, world);
  await openVillage(page);
  await pick(page, '214/2');

  const tile = plotCard(page).locator('.vm-plotno');
  await expect(tile).toContainText('214/2');
  // Nothing spills past the tile's own edge.
  expect(await tile.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
  // One filled button in view, and it is the plot's own way on: 214/2 is one
  // of my properties, so that is Open, not Add.
  const filled = page.locator('main.vm .btn.primary');
  await expect(filled).toHaveCount(1);
  await expect(filled).toHaveText('Open Sy 214/2');
  // The toggles that are on say so with a check, not a fill.
  await expect(chip(page, 'Satellite')).toHaveAttribute('aria-pressed', 'true');
  await expect(chip(page, 'Satellite').locator('svg')).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Numbers' }).locator('svg')).toHaveCount(1);
  await expect(chip(page, 'Street map').locator('svg')).toHaveCount(0);
});

test('a figure off the sheet and a figure off the polygon are not the same claim', async ({ page, world }) => {
  await ground(page, world);
  await openVillage(page);

  await pick(page, '214/2');
  await expect(plotCard(page)).toContainText('As stated on the shape file. · Chaltha Bandla Cheruvu');

  await pick(page, '219');
  // Measured off the ring, so two decimals: the finder's figure too.
  await expect(plotCard(page).locator('.vm-acres')).toHaveText('4.24');
  await expect(plotCard(page)).toContainText('Measured from the shape.');
});

test('adjoining plots lead to each other', async ({ page, world }) => {
  await ground(page, world);
  await openVillage(page);
  await pick(page, '215');

  const plot = plotCard(page);
  await expect(plot).toContainText('Adjoining plots');
  const neighbours = plot.locator('.chip');
  await expect(neighbours).toHaveText(['214/2', '216', '218']);

  await plot.getByRole('button', { name: '216', exact: true }).click();

  await expect(plot.locator('.vm-plotno')).toContainText('216');
  await expect(plot.locator('.chip')).toHaveText(['215', '219']);
  await expect(page.getByLabel('Find survey or plot number')).toHaveValue('216');
});

test('a plot with nothing to disclose does not offer More', async ({ page, world }) => {
  await ground(page, world);
  await openVillage(page);
  await pick(page, '77/2');

  // Nothing touches it and it is nobody's record, so there is nothing under a
  // chevron that turns and reveals empty space.
  await expect(plotCard(page)).not.toContainText('Adjoining plots');
  await expect(plotCard(page).getByRole('button', { name: /^(More|Less)$/ })).toHaveCount(0);
});

test('More and Less fold what there is to disclose', async ({ page, world }) => {
  await ground(page, world);
  await openVillage(page);
  await pick(page, '215');

  const fold = plotCard(page).getByRole('button', { name: 'Less' });
  await expect(fold).toHaveAttribute('aria-expanded', 'true');

  await fold.click();

  await expect(plotCard(page)).not.toContainText('Adjoining plots');
  await expect(plotCard(page).getByRole('button', { name: 'More' })).toHaveAttribute('aria-expanded', 'false');
});

test('the owner comes from my own records, and a plot that is not mine says so', async ({ page, world }) => {
  await ground(page, world);
  await openVillage(page);

  await pick(page, '214/2');
  const facts = plotCard(page).locator('.vm-facts');
  await expect(facts).toContainText('Telukutla Shankar Reddy');
  await expect(facts).toContainText('1042');

  await pick(page, '216');
  await expect(facts).toContainText('Not one of your properties');
  await expect(facts).toContainText('—');
});

test('a record with no owner name on it is still named, and an empty passbook is a dash', async ({ page, world }) => {
  // Half the records in a portfolio are filed with a title and nothing else.
  // The panel may not answer "Owner" with a blank where it knows the record.
  world.set('properties', listOf([
    card({ id: ID.watched, title: 'Sy 215', ownerName: '', khataNo: '' }),
  ]));
  await ground(page, world);
  await openVillage(page);
  await pick(page, '215');

  const facts = plotCard(page).locator('.vm-facts');
  await expect(facts).toContainText('Sy 215');
  await expect(facts).not.toContainText('Not one of your properties');
  await expect(facts.locator('dd').nth(1)).toHaveText('—');
  // It is still one of mine, so the way in is that record and not a second
  // copy of it.
  await expect(plotCard(page).getByRole('button', { name: 'Open Sy 215' })).toBeVisible();
  await expect(plotCard(page).getByRole('button', { name: 'Add to Properties' })).toHaveCount(0);
});

test('a record for plot 214 does not get to claim 214/2', async ({ page, world }) => {
  // 214 and 214/2 are two pieces of ground. Reading one as the other is how a
  // record for a subdivision comes to claim the department's whole plot — and
  // then to have that plot's shape written onto it.
  world.set('properties', listOf([
    card({ id: ID.parcel, title: 'Sy 214', ownerName: 'Telukutla Shankar Reddy' }),
  ]));
  await ground(page, world);
  await openVillage(page);
  await pick(page, '214/2');

  await expect(plotCard(page).locator('.vm-facts')).toContainText('Not one of your properties');
  await expect(plotCard(page).locator('.vm-facts')).not.toContainText('Telukutla Shankar Reddy');
  await expect(plotCard(page).getByRole('button', { name: 'Add to Properties' })).toBeEnabled();
});

test('a flat in the same village does not get to claim a field', async ({ page, world }) => {
  // "Flat 215" is a door number, not a survey number. Reading one as the other
  // would put two acres of somebody's land under an apartment.
  world.set('properties', listOf([
    card({ id: ID.flat, kind: 'flat', classification: 'flat', title: 'Flat 215', village: 'Katragunta', ownerName: 'Nobody At All' }),
  ]));
  await ground(page, world);
  await openVillage(page);
  await pick(page, '215');

  await expect(plotCard(page).locator('.vm-facts')).toContainText('Not one of your properties');
  await expect(plotCard(page)).not.toContainText('Nobody At All');
});

// ── the papers filed against a plot that IS mine ───────────────────────

test('the papers on my own plot are listed with their page counts', async ({ page, world }) => {
  await ground(page, world);
  await openVillage(page);
  await pick(page, '214/2');

  const plot = plotCard(page);
  await expect(plot).toContainText('Documents on file');
  await expect(plot.locator('.row.between')).toHaveCount(5);
  await expect(plot.locator('.row.between').first()).toContainText('Sale deed 4412 of 1998');
  await expect(plot.locator('.row.between').first()).toContainText('14 pp');
  expect(world.lastVars('papers')).toMatchObject({ id: ID.parcel });
});

test('papers still on their way are not "nothing filed"', async ({ page, world }) => {
  world.set('papers', World.never());
  await ground(page, world);
  await openVillage(page);
  await pick(page, '214/2');

  const looking = plotCard(page).getByText('Looking for documents…');
  await expect(looking).toBeVisible();
  await expect(looking).toHaveAttribute('aria-busy', 'true');
  await expect(plotCard(page)).not.toContainText('Nothing filed against');
});

test('papers that could not be read say so, and come back on a second go', async ({ page, world }) => {
  world.set('papers', World.gqlError('the paper store is down'));
  await ground(page, world);
  await openVillage(page);
  await pick(page, '214/2');

  const plot = plotCard(page);
  await expect(plot).toContainText('The documents filed against Sy 214/2 could not be loaded.');
  await expect(plot).not.toContainText('Nothing filed against');

  world.set('papers', [
    { id: 'w-paper-1', title: 'Adangal 2025-26', detail: 'Revenue record', shelf: 'revenue', icon: 'revenue', tags: [], shared: false, pageCount: 2, fileRef: 'file-adangal' },
  ]);
  await plot.getByRole('button', { name: 'Try again' }).click();

  await expect(plot).toContainText('Adangal 2025-26');
});

test('a paper list that fails to refresh is not a denial that the papers exist', async ({ page, world }) => {
  // The desk answers and refuses — which is still a write, and every write on
  // this surface refreshes the screen's reads (api.ts:688).
  world.set('createRequest', '');
  await ground(page, world);
  await openVillage(page);
  await pick(page, '214/2');
  await expect(plotCard(page)).toContainText('Sale deed 4412 of 1998');

  // The paper store goes down between the read that filled the panel and that
  // refresh. What is already on screen was read successfully once.
  world.set('papers', World.gqlError('the paper store is down'));
  await page.getByRole('button', { name: 'Fence calculator' }).click();
  await page.getByRole('button', { name: 'Ask for this on Sy 214/2' }).click();
  await expect(page.locator('.fs-panel')).toContainText('That request was not accepted.');
  await page.getByRole('button', { name: 'Close the fence calculator' }).click();

  await expect.poll(() => world.calls('papers').length).toBeGreaterThan(1);
  await expect(plotCard(page)).toContainText('Sale deed 4412 of 1998');
  await expect(plotCard(page)).not.toContainText('could not be loaded');
});

test('a plot with more papers than the panel shows says how many there are', async ({ page, world }) => {
  // The panel keeps six rows compact but must say what was left out, so an
  // owner looking for the EC among nine papers does not conclude it vanished.
  world.set('papers', Array.from({ length: 9 }, (_, i) => ({
    id: `w-paper-${i}`, title: `Paper ${i + 1}`, detail: 'Filed', shelf: 'unsorted',
    icon: 'unsorted', tags: [], shared: false, pageCount: 1, fileRef: `file-${i}`,
  })));
  await ground(page, world);
  await openVillage(page);
  await pick(page, '214/2');

  await expect(plotCard(page).locator('.row.between')).toHaveCount(6);
  await expect(plotCard(page)).toContainText('first 6 of 9');
});

test('a record with nothing filed against it says that, not nothing at all', async ({ page, world }) => {
  world.set('papers', []);
  await ground(page, world);
  await openVillage(page);
  await pick(page, '214/2');

  await expect(plotCard(page)).toContainText('Nothing filed against Sy 214/2 yet.');
});

// ── what the screen may not claim while the records are unknown ────────

test('while my records have not answered the screen will not call my own land a stranger’s', async ({ page, world }) => {
  world.set('properties', World.never());
  await ground(page, world);
  await openVillage(page);
  await pick(page, '216');

  const plot = plotCard(page);
  await expect(plot.locator('.vm-facts')).toContainText('Checking your properties…');
  await expect(plot.locator('.vm-facts')).not.toContainText('Not one of your properties');
  // Adding waits for them, because on unknown data it cannot tell a new plot
  // from one the account already holds.
  await expect(plot.getByRole('button', { name: 'Add to Properties' })).toBeDisabled();
  await expect(plot).toContainText('Checking your properties…');
  await expect(sideCard(page, 'All plots')).toHaveCount(0);
});

test('records that could not be read turn filing off and say why', async ({ page, world }) => {
  world.set('properties', World.gqlError('the record store is down'));
  await ground(page, world);
  await openVillage(page);
  await pick(page, '216');

  const plot = plotCard(page);
  await expect(plot.locator('.vm-facts')).toContainText('Your properties could not be loaded');
  await expect(plot.locator('.vm-facts')).toContainText('Not known');
  await expect(plot.getByRole('button', { name: 'Add to Properties' })).toBeDisabled();
  // One short sentence under the buttons, with its retry beside it.
  await expect(plot).toContainText('Your properties could not be loaded. Try again');
  await expect(plot.getByRole('button', { name: 'Try again' })).toBeVisible();
  await expect(sideCard(page, 'All plots')).toHaveCount(0);
});

test('Try again on my own records is a real read, and the panel answers with them', async ({ page, world }) => {
  // The last retry on this screen with nothing asserting it. A dead button on
  // an error line is the point at which somebody stops trusting the screen —
  // and this one is the only way back to an owner's own name on their own plot.
  world.set('properties', World.gqlError('the record store is down'));
  await ground(page, world);
  await openVillage(page);
  await pick(page, '216');

  const plot = plotCard(page);
  await expect(plot.locator('.vm-facts')).toContainText('Your properties could not be loaded');

  world.set('properties', listOf([
    card({ id: ID.parcel, title: 'Sy 216', ownerName: 'Telukutla Shankar Reddy' }),
  ]));
  await plot.getByRole('button', { name: 'Try again' }).click();

  await expect(plot.locator('.vm-facts')).toContainText('Telukutla Shankar Reddy');
  await expect(plot.locator('.vm-facts')).toContainText('1042');
  await expect(plot).not.toContainText('could not be loaded');
  // Filing is back off the table, because this plot is now known to be a
  // record the account already holds.
  await expect(plot.getByRole('button', { name: 'Open Sy 216' })).toBeVisible();
  await expect(sideCard(page, 'All plots')).toHaveCount(0);
});

// ── finding a plot by its number ───────────────────────────────────────

test('a plot number found flies to it and opens it', async ({ page, world }) => {
  await ground(page, world);
  await openVillage(page);

  await page.getByLabel('Find survey or plot number').fill('215');
  await page.getByRole('button', { name: 'Find plot' }).click();

  await expect(page.locator('.vc-tr')).toContainText('Plot 215 · 4.25 ac');
  await expect(plotCard(page).locator('.vm-plotno')).toContainText('215');
  await expect(page.getByLabel('Find survey or plot number')).toHaveValue('215');
});

test('the plot search takes a survey number the way anybody writes it, and Enter is enough', async ({ page, world }) => {
  await ground(page, world);
  await openVillage(page);

  // "Sy 219" is what is written on the record, the passbook and the deed.
  await page.getByLabel('Find survey or plot number').fill('Sy 219');
  await page.getByLabel('Find survey or plot number').press('Enter');

  await expect(page.locator('.vc-tr')).toContainText('Plot 219 · 4.24 ac');
  await expect(plotCard(page).locator('.vm-plotno')).toContainText('219');
  await expect(page.locator('.vc-label.on')).toContainText('219');
  await expect(page.getByLabel('Find survey or plot number')).toHaveValue('219');
});

test('a survey-number prefix offers the full subdivision before selecting it', async ({ page, world }) => {
  await ground(page, world);
  await openVillage(page);

  // 214 is not 214/2: the prefix may help the reader reach the subdivision,
  // but the full number becomes selected only when its option is chosen.
  const finder = page.getByLabel('Find survey or plot number');
  await finder.fill('214');

  const option = plotFinder(page).getByRole('option', { name: /^Plot 214\/2\b/ });
  await expect(option).toBeVisible();
  await option.click();

  await expect(finder).toHaveValue('214/2');
  await expect(plotCard(page).locator('.vm-plotno')).toContainText('214/2');
});

test('the finder suggests plot numbers by prefix without a permanent plot column', async ({ page, world }) => {
  await ground(page, world);
  await openVillage(page);

  await expect(sideCard(page, 'All plots')).toHaveCount(0);
  const finder = page.getByLabel('Find survey or plot number');
  await finder.fill('21');

  await expect(plotOptions(page)).toHaveCount(6);
  await expect(plotFinder(page)).toContainText('6 matching plots');
  await expect(plotFinder(page).getByRole('option', { name: /^Plot 214\/2\b/ }))
    .toContainText('2.50 ac');
  await expect(plotFinder(page).getByRole('option', { name: /^Plot 216\b/ }))
    .toContainText('0.80 ac');

  await plotFinder(page).getByRole('option', { name: /^Plot 216\b/ }).click();
  await expect(finder).toHaveValue('216');
  await expect(plotCard(page).locator('.vm-plotno')).toContainText('216');

  await finder.fill('Ongole');
  await expect(plotOptions(page)).toHaveCount(0);
  await expect(plotFinder(page)).toContainText('Use a number such as 1234 or 1234/2.');
});

test('a large village shows only compact prefix suggestions and reports the full match', async ({ page, world }) => {
  const many: Plot[] = [];
  for (let r = 0; r < 13; r += 1) {
    for (let c = 0; c < 12; c += 1) {
      many.push({
        lp: String(100 + r * 12 + c),
        ac: '1.00',
        ring: cell(15.70 + r * 0.0012, 79.20 + c * 0.0012,
                   15.70 + (r + 1) * 0.0012, 79.20 + (c + 1) * 0.0012),
      });
    }
  }
  await ground(page, world, {
    list: () => ({ json: [entry({ plots: many.length })] }),
    file: () => ({ json: collection(many) }),
  });
  await openVillage(page);

  const finder = page.getByLabel('Find survey or plot number');
  await finder.fill('1');
  await expect(plotOptions(page)).toHaveCount(8);
  await expect(plotFinder(page)).toContainText('100 matching plots · first 8 shown');
  await expect(plotOptions(page).first()).toContainText('Plot 100');

  // Prefix means prefix: 25 finds 250–255, not 125 or 225.
  await finder.fill('25');
  await expect(plotOptions(page)).toHaveCount(6);
  await expect(plotFinder(page)).toContainText('6 matching plots');
  await expect(plotFinder(page)).not.toContainText('Plot 125');
  await expect(plotFinder(page)).not.toContainText('Plot 225');
});

// ── the measuring tape ─────────────────────────────────────────────────

test('the tape reports a distance, then an area once it closes', async ({ page, world }) => {
  await ground(page, world);
  await openVillage(page);

  await startMeasure(page);
  await expect(tape(page)).toContainText('Tap each corner.');
  await expect(tape(page).getByRole('button', { name: 'Undo point' })).toBeDisabled();

  await clickMap(page, 0.35, 0.35);
  await clickMap(page, 0.6, 0.35);
  // A reading, not the word: a tape that says "Distance — m" is a tape nobody
  // can use.
  await expect(tape(page)).toContainText(/Distance [\d,]+(\.\d)? m · 2 points/);
  await expect(tape(page)).not.toContainText('Encloses');

  await clickMap(page, 0.6, 0.6);
  await expect(tape(page)).toContainText(/Perimeter [\d,]+(\.\d)? m · 3 points/);
  await expect(tape(page)).toContainText(/Encloses \d+\.\d{3} ac/);
  // Every corner lettered and every side dimensioned, the way a boundary is.
  await expect(page.locator('.w-corner-no')).toHaveCount(3);
  await expect(page.locator('.w-side')).toHaveCount(3);
});

test('the tape takes back one point at a time, and empties without putting itself away', async ({ page, world }) => {
  await ground(page, world);
  await openVillage(page);

  await startMeasure(page);
  for (const [x, y] of [[0.35, 0.35], [0.6, 0.35], [0.6, 0.6]] as const) await clickMap(page, x, y);
  await expect(tape(page)).toContainText('Encloses');

  await tape(page).getByRole('button', { name: 'Undo point' }).click();
  await expect(tape(page)).toContainText('Distance');
  await expect(tape(page)).not.toContainText('Encloses');
  await expect(page.locator('.w-corner-no')).toHaveCount(2);

  await tape(page).getByRole('button', { name: 'Clear measure' }).click();
  await expect(page.locator('.w-corner-no')).toHaveCount(0);
  await expect(page.locator('.w-side')).toHaveCount(0);
  await expect(tape(page)).toContainText('Tap each corner.');
  // Cleared, not closed: the tape is still out.
  await expect(page.getByRole('button', { name: 'Measure on satellite', exact: true })).toHaveAttribute('aria-pressed', 'true');
});

test('Measure switches to Satellite, locks layers, and restores the previous map', async ({ page, world }) => {
  await ground(page, world);
  await openVillage(page);

  const measure = page.getByRole('button', { name: 'Measure on satellite', exact: true });
  await chip(page, 'Boundaries').click();
  await expect(chip(page, 'Boundaries')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.leaflet-tile-pane img')).toHaveCount(0);

  await measure.click();

  await expect(measure).toHaveAttribute('aria-pressed', 'true');
  await expect(chip(page, 'Satellite')).toHaveAttribute('aria-pressed', 'true');
  await expect(tape(page)).toContainText('Satellite view on');
  for (const name of ['Satellite', 'Street map', 'Plot size', 'Boundaries']) {
    await expect(chip(page, name)).toBeDisabled();
  }

  // Keep the synthetic tape below the Measure panel and the plot finder; this
  // scenario is about layer dependency, not whether overlay chrome takes clicks.
  for (const [x, y] of [[0.45, 0.70], [0.65, 0.70]] as const) {
    await clickMap(page, x, y);
  }
  await expect(tape(page)).toContainText('Distance');
  await expect(page.locator('.w-corner-no')).toHaveCount(2);

  await measure.click();

  await expect(measure).toHaveAttribute('aria-pressed', 'false');
  await expect(chip(page, 'Boundaries')).toHaveAttribute('aria-pressed', 'true');
  for (const name of ['Satellite', 'Street map', 'Plot size', 'Boundaries']) {
    await expect(chip(page, name)).toBeEnabled();
  }
  await expect(page.locator('.leaflet-tile-pane img')).toHaveCount(0);
  await expect(page.locator('.w-corner-no')).toHaveCount(0);
});

test('a crossed tape shows the distance without claiming an acreage', async ({ page, world }) => {
  await ground(page, world);
  await openVillage(page);
  await pick(page, '215');

  await startMeasure(page);
  await beginTape(page, 0.35, 0.55);
  for (const [x, y] of [[0.6, 0.8], [0.6, 0.55], [0.35, 0.8]] as const) {
    await clickMap(page, x, y);
  }

  await expect(tape(page)).toContainText('The boundary crosses itself.');
  await expect(tape(page)).toContainText('Perimeter');
  await expect(tape(page)).not.toContainText('Encloses');
  // And a shape with no honest area is not something to price a fence around.
  await expect(page.getByRole('button', { name: 'Fence calculator' })).toBeDisabled();

  await tape(page).getByRole('button', { name: 'Undo point' }).click();
  await expect(tape(page)).toContainText('Encloses');
  await expect(page.getByRole('button', { name: 'Fence calculator' })).toBeEnabled();
});

// ── the fence calculator ───────────────────────────────────────────────

/** Open the calculator on a plot, and wait for its own map to mount. */
async function openFence(page: Page, lp: string): Promise<void> {
  await pick(page, lp);
  await page.getByRole('button', { name: 'Fence calculator' }).click();
  await expect(page.locator('.fs-bar')).toContainText('Fence calculator');
  await expect(page.locator('.fs-side').first()).toBeVisible();
}

test('the fence calculator opens over the map with the plot’s own corners counted', async ({ page, world }) => {
  await ground(page, world);
  await openVillage(page);
  await openFence(page, '215');

  // It takes the stage, and the inspector stands down rather than answering
  // the same question in a second panel.
  await expect(page.getByRole('heading', { level: 1, name: 'Plot 215' })).toBeVisible();
  await expect(page.locator('.pagehead .grow > .note')).toHaveText(VILLAGE);
  await expect(page.locator('.vm-side')).toHaveCount(0);

  const sides = page.locator('.fs-side');
  await expect(sides).toHaveCount(4);
  await expect(sides.first()).toContainText('A–B');
  await expect(sides.first()).toContainText('fencing');
  await expect(page.locator('.fs-panel')).toContainText('4 sides of 4 sides');

  // Four corners, one post at each, because a fence turns there.
  const bill = page.locator('.fs-bill');
  await expect(bill.locator('tr', { hasText: 'Corner posts' })).toContainText('4');
  // One gate by default, and a gate stands on two posts of its own.
  await expect(bill.locator('tr', { hasText: 'Gate posts' })).toContainText('2');

  // The perimeter is the sides it is made of, not a second opinion.
  const shown = Number(/([\d,.]+) m to fence/.exec(await page.locator('.fs-panel').innerText())![1].replace(/,/g, ''));
  const total = (await sides.locator('.num').allInnerTexts())
    .reduce((sum, text) => sum + Number(text.replace(/[^\d.]/g, '')), 0);
  expect(Math.abs(shown - total)).toBeLessThan(0.2);
});

test('the estimate is its own bill added up, not a second opinion', async ({ page, world }) => {
  await ground(page, world);
  await openVillage(page);
  await openFence(page, '215');

  await page.getByLabel('₹ per post').fill('250');
  await page.getByLabel('₹ per m of wire').fill('12');
  await page.getByLabel('₹ per gate').fill('6000');

  const bill = page.locator('.fs-bill');
  // By the row's own heading: 'Posts' as a substring would also catch 'Corner
  // posts' and 'Gate posts', which are the two lines it is the sum of.
  const figure = async (head: string) => Number((await bill
    .getByRole('row')
    .filter({ has: page.getByRole('rowheader', { name: head, exact: true }) })
    .locator('td.num').first().innerText()).replace(/[^\d.]/g, ''));
  const posts = await figure('Posts');
  const wire = await figure('Wire');

  // What you buy, not what you measure: wire comes on rolls and the last one
  // is bought whole.
  expect(await figure('Rolls')).toBe(Math.ceil(wire / 500));
  await expect(bill.getByRole('row').filter({ has: page.getByRole('rowheader', { name: 'Rolls', exact: true }) }))
    .toContainText('of 500 m');

  // And the total is those lines at those rates, to the rupee.
  const total = Number((await page.locator('.fs-total .num').innerText()).replace(/[^\d]/g, ''));
  expect(Math.abs(total - (posts * 250 + wire * 12 + 6_000))).toBeLessThan(2);
});

test('a fence with no gate in it carries wire the whole way round', async ({ page, world }) => {
  await ground(page, world);
  await openVillage(page);
  await openFence(page, '215');

  const bill = page.locator('.fs-bill');
  await expect(bill.locator('tr', { hasText: 'Gate posts' })).toHaveCount(1);
  await expect(bill.locator('tr', { hasText: 'Wire' }).first()).toContainText('m of gate taken out');

  await page.getByLabel('Gates', { exact: true }).fill('0');

  await expect(bill.locator('tr', { hasText: 'Gate posts' })).toHaveCount(0);
  await expect(bill.locator('tr', { hasText: 'Wire' }).first()).not.toContainText('of gate taken out');
  const metres = (text: string) => Number(/([\d,.]+) m/.exec(text)![1].replace(/,/g, ''));
  const perimeter = metres(/([\d,.]+ m) to fence/.exec(await page.locator('.fs-panel').innerText())![1]);
  const wire = metres(await bill.locator('tr', { hasText: 'Wire' }).first().locator('td.num').innerText());
  expect(Math.abs(wire - perimeter * 4)).toBeLessThan(0.5);   // four strands, no hole in it
});

test('the fence panel moves to whichever hand suits me', async ({ page, world }) => {
  await ground(page, world);
  await openVillage(page);
  await openFence(page, '215');

  const where = async () => {
    const panel = (await page.locator('.fs-panel').boundingBox())!;
    const map = (await page.locator('.fs-map').boundingBox())!;
    return panel.x > map.x ? 'right' : 'left';
  };
  expect(await where()).toBe('right');

  await page.getByRole('button', { name: 'Panel left' }).click();

  await expect(page.getByRole('button', { name: 'Panel right' })).toBeVisible();
  expect(await where()).toBe('left');
  // The shape is still the thing being priced, not a casualty of the move.
  await expect(page.locator('.fs-side')).toHaveCount(4);
});

test('leaving a side out opens the run and takes it off the bill', async ({ page, world }) => {
  await ground(page, world);
  await openVillage(page);
  await openFence(page, '215');

  const before = Number(/([\d,.]+) m to fence/.exec(await page.locator('.fs-panel').innerText())![1].replace(/,/g, ''));
  await page.locator('.fs-side').first().click();

  await expect(page.locator('.fs-side').first()).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('.fs-side').first()).toContainText('skipped');
  await expect(page.locator('.fs-panel')).toContainText('3 sides of 4 sides');

  const after = Number(/([\d,.]+) m to fence/.exec(await page.locator('.fs-panel').innerText())![1].replace(/,/g, ''));
  expect(after).toBeLessThan(before);
});

test('the rates I typed are still there the next time I price a plot', async ({ page, world }) => {
  await ground(page, world);
  await openVillage(page);
  await openFence(page, '215');

  await expect(page.locator('.fs-panel')).toContainText('Enter your rates to price it.');

  await page.getByLabel('₹ per post').fill('250');
  await page.getByLabel('₹ per m of wire').fill('12');
  await page.getByLabel('₹ per gate').fill('6000');

  const total = page.locator('.fs-total');
  await expect(total).toContainText('Materials');
  await expect(total).toContainText(/₹[\d,]+/);
  await expect(page.locator('.fs-bill')).toContainText('₹6,000');

  // Out of the calculator and back into it — a rate is local and retyping four
  // figures every time is what stops a tool being used.
  await page.getByRole('button', { name: `Back to ${VILLAGE}` }).click();
  await expect(page.locator('.fs-bar')).toHaveCount(0);
  await page.getByRole('button', { name: 'Fence calculator' }).click();

  await expect(page.getByLabel('₹ per post')).toHaveValue('250');
  await expect(page.getByLabel('₹ per m of wire')).toHaveValue('12');
  await expect(page.getByLabel('₹ per gate')).toHaveValue('6000');
});

test('the estimate leaves the screen as work on the record it belongs to', async ({ page, world }) => {
  await ground(page, world);
  await openVillage(page);
  await openFence(page, '214/2');

  await page.getByLabel('₹ per post').fill('250');
  await page.getByLabel('₹ per m of wire').fill('12');
  await page.getByRole('button', { name: 'Ask for this on Sy 214/2' }).click();

  await expect(page).toHaveURL(new RegExp(`/app/records/${ID.parcel}/services$`));
  expect(world.calls('createRequest')).toHaveLength(1);
  const asked = world.lastVars('createRequest');
  expect(asked).toMatchObject({ recordId: ID.parcel, kind: 'fencing' });
  // The whole bill rides along in the message — a work request that says
  // "fencing needed" is not an estimate anybody can act on.
  const message = String(asked.message);
  expect(message).toContain('Fence Plot 214/2 (KATRAGUNTA)');
  expect(message).toContain('at the corners');
  expect(message).toContain('strands');
  expect(message).toContain('Materials only');
});

test('a refused fence request keeps the estimate on screen and says it was not accepted', async ({ page, world }) => {
  world.set('createRequest', '');
  await ground(page, world);
  await openVillage(page);
  await openFence(page, '214/2');

  await page.getByRole('button', { name: 'Ask for this on Sy 214/2' }).click();

  await expect(page.locator('.fs-panel')).toContainText('That request was not accepted.');
  await expect(page).toHaveURL(/\/app\/maps$/);
  await expect(page.locator('.fs-bar')).toBeVisible();
});

test('a fence request the desk could not take says what the desk said', async ({ page, world }) => {
  // Not the same failure as a refusal: this one never reached a desk at all,
  // and the reason is the only thing anybody can act on.
  world.set('createRequest', World.gqlError('that record is no longer yours'));
  await ground(page, world);
  await openVillage(page);
  await openFence(page, '214/2');

  await page.getByRole('button', { name: 'Ask for this on Sy 214/2' }).click();

  await expect(page.locator('.fs-panel')).toContainText('that record is no longer yours');
  await expect(page.getByRole('alert')).toContainText('That request could not be saved. Nothing has changed.');
  await expect(page).toHaveURL(/\/app\/maps$/);
  await expect(page.locator('.fs-bar')).toBeVisible();
});

test('a plot that is nobody’s record can be printed and not much else', async ({ page, world }) => {
  await ground(page, world);
  await openVillage(page);
  await openFence(page, '216');

  await expect(page.getByRole('button', { name: /^Ask for this/ })).toHaveCount(0);
  await expect(page.locator('.fs-panel')).toContainText(
    'File this plot as a property to raise it as work.');

  await page.locator('.fs-bar').getByRole('button', { name: 'Print' }).click();
  expect(await printed(page)).toBe(1);
  // And the sheet that prints is the drawing, not the form.
  await expect(page.locator('.fs-sheet')).toContainText('Fence estimate');
  await expect(page.locator('.fs-sheet')).toContainText('Plot 216');
  await expect(page.locator('svg.fs-plan')).toHaveCount(1);
});

test('the fence calculator prices the shape I walked, not the plot behind it', async ({ page, world }) => {
  await ground(page, world);
  await openVillage(page);
  await pick(page, '215');

  await startMeasure(page);
  await beginTape(page, 0.35, 0.55);
  for (const [x, y] of [[0.6, 0.55], [0.6, 0.8]] as const) await clickMap(page, x, y);
  await expect(tape(page)).toContainText('3 points');

  await page.getByRole('button', { name: 'Fence calculator' }).click();

  await expect(page.getByRole('heading', { level: 1, name: 'The shape you measured' })).toBeVisible();
  await expect(page.locator('.pagehead .grow > .note')).toHaveText('3 points');
  await expect(page.locator('.fs-side')).toHaveCount(3);
});

test('a tape with two points in it prices an open run, not a plot', async ({ page, world }) => {
  await ground(page, world);
  await openVillage(page);
  await pick(page, '215');

  await startMeasure(page);
  await beginTape(page, 0.35, 0.55);
  await clickMap(page, 0.6, 0.55);
  await expect(tape(page)).toContainText('2 points');

  await page.getByRole('button', { name: 'Fence calculator' }).click();

  await expect(page.getByRole('heading', { level: 1, name: 'The shape you measured' })).toBeVisible();
  await expect(page.locator('.pagehead .grow > .note')).toHaveText('2 points');
  await expect(page.locator('.fs-side')).toHaveCount(1);
  await expect(page.locator('.fs-panel')).toContainText('1 side of 1 side');
  // A run has two ends, and a post stands at each of them — it does not close
  // on itself the way a boundary does.
  await expect(page.locator('.fs-bill').locator('tr', { hasText: 'Corner posts' })).toContainText('2');
  // And there is no enclosed shape to draw on the sheet that goes to a supplier.
  await expect(page.locator('svg.fs-plan')).toHaveCount(0);
  await expect(page.locator('.fs-sheet')).toContainText('Fence estimate');
});

test('closing the fence calculator goes back up to the village, not out of it', async ({ page, world }) => {
  await ground(page, world);
  await openVillage(page);
  await openFence(page, '215');

  await page.getByRole('button', { name: 'Close the fence calculator' }).click();

  await expect(page.locator('.fs-bar')).toHaveCount(0);
  await expect(page.getByRole('heading', { level: 1, name: VILLAGE })).toBeVisible();
  await expect(plotCard(page).locator('.vm-plotno')).toContainText('215');
  // And the way back in has the focus, because that is where you just were.
  await expect(page.getByRole('button', { name: 'Fence calculator' })).toBeFocused();
});

test('Escape backs out of the fence calculator before it backs out of anything else', async ({ page, world }) => {
  await ground(page, world);
  await openVillage(page);
  await openFence(page, '215');

  await page.keyboard.press('Escape');

  await expect(page.locator('.fs-bar')).toHaveCount(0);
  await expect(page.getByRole('heading', { level: 1, name: VILLAGE })).toBeVisible();
  // The plot it was open on is still chosen — one Escape, one step.
  await expect(plotCard(page).locator('.vm-plotno')).toContainText('215');
  await expect(page.getByRole('button', { name: 'Fence calculator' })).toBeFocused();
});

// ── handing a plot to a record ─────────────────────────────────────────

test('handing a village plot to a record I already have puts the shape on it and opens it', async ({ page, world }) => {
  await ground(page, world);
  await openVillage(page);
  await pick(page, '216');

  const plot = plotCard(page);
  await expect(plot).toContainText('Or give it to a property in this village');
  await expect(plot).toContainText('1 property');

  await plot.getByRole('button', { name: /^Sy 301/ }).click();

  await expect(page).toHaveURL(new RegExp(`/app/records/${ID.watched}/map$`));
  expect(world.calls('setBoundary')).toHaveLength(1);
  const sent = world.lastVars('setBoundary');
  expect(sent).toMatchObject({ recordId: ID.watched });
  // The department's own corners, flat, in the order the sheet walks them.
  expect(sent.ring).toEqual([15.7402, 79.2714, 15.7402, 79.2726, 15.7414, 79.2726, 15.7414, 79.2714]);
});

test('a refused boundary says so, and does not pretend the record has a shape', async ({ page, world }) => {
  world.set('setBoundary', false);
  await ground(page, world);
  await openVillage(page);
  await pick(page, '216');

  await plotCard(page).getByRole('button', { name: /^Sy 301/ }).click();

  await expect(plotCard(page)).toContainText(
    'That boundary was refused — the shape may have fewer than three usable corners, '
    + 'or that property is no longer yours.');
  await expect(page).toHaveURL(/\/app\/maps$/);
});

test('the adopt list is land in this village with no boundary on it yet', async ({ page, world }) => {
  world.set('properties', listOf([
    card({ id: 'w-near', title: 'Sy 217', village: 'Katragunta' }),
    card({ id: 'w-open', title: 'Plot 220', kind: 'property', classification: 'open_plot', village: 'Katragunta' }),
    card({ id: 'w-far', title: 'Sy 300', village: 'Katragunta' }),
    // A flat would put two acres of a field under an apartment.
    card({ id: 'w-flat', title: 'Flat 216', kind: 'flat', classification: 'flat', village: 'Katragunta' }),
    // Already surveyed: linking would overwrite a ring with no warning at all.
    card({ id: 'w-surveyed', title: 'Sy 218', village: 'Katragunta', ring: [15.74, 79.27, 15.741, 79.271, 15.742, 79.272] }),
    // Another village altogether.
    card({ id: 'w-elsewhere', title: 'Sy 88', village: 'Konakalamitla' }),
  ]));
  await ground(page, world);
  await openVillage(page);
  await pick(page, '216');

  const offered = plotCard(page).locator('.vm-list .villagerow');
  await expect(plotCard(page)).toContainText('3 properties');
  await expect(offered).toHaveCount(3);
  // Nearest survey number first: 217 is one away from 216, 220 is four.
  await expect(offered.nth(0)).toContainText('Sy 217');
  await expect(offered.nth(1)).toContainText('Plot 220');
  await expect(offered.nth(2)).toContainText('Sy 300');
  await expect(plotCard(page)).not.toContainText('Flat 216');
  await expect(plotCard(page)).not.toContainText('Sy 218');
  await expect(plotCard(page)).not.toContainText('Sy 88');
});

test('a village where I hold more records than the list can show says how many it left out', async ({ page, world }) => {
  // Forty-five parcels in one village is a family holding, not a stress test.
  // A list that stops at forty with no total puts the other five out of reach
  // with nothing on screen admitting it.
  world.set('properties', listOf(Array.from({ length: 45 }, (_, i) => card({
    id: `w-many-${i}`, title: `Sy ${400 + i}`, village: 'Katragunta', ring: [],
  }))));
  await ground(page, world);
  await openVillage(page);
  await pick(page, '216');

  const offered = plotCard(page).locator('.vm-list .villagerow');
  await expect(plotCard(page)).toContainText('first 40 of 45');
  await expect(offered).toHaveCount(40);
  await expect(offered.first()).toContainText('Sy 400');
  await expect(plotCard(page)).not.toContainText('Sy 444');
});

test('the nearest record to a subdivision is offered first', async ({ page, world }) => {
  // Rank a subdivision by its leading survey number: 77/2 is nearest to Sy 77,
  // not an unparseable value that drops every record into alphabetical order.
  world.set('properties', listOf([
    card({ id: 'w-9', title: 'Sy 9', village: 'Katragunta' }),
    card({ id: 'w-77', title: 'Sy 77', village: 'Katragunta' }),
    card({ id: 'w-300', title: 'Sy 300', village: 'Katragunta' }),
  ]));
  await ground(page, world);
  await openVillage(page);
  await pick(page, '77/2');

  await expect(plotCard(page).locator('.vm-list .villagerow').first()).toContainText('Sy 77');
});

test('adding a mapped plot opens Properties only after its boundary is saved', async ({ page, world }) => {
  await ground(page, world);
  await openVillage(page);
  await pick(page, '216');

  await plotCard(page).getByRole('button', { name: 'Add to Properties' }).click();

  await expect(page).toHaveURL(/\/app\/properties$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Properties' })).toBeVisible();
  expect(world.lastVars('saveRecord')).toMatchObject({
    input: {
      kind: 'parcel', title: '216', classification: 'agri', status: 'owned',
      stake: 'owned', village: VILLAGE, extent: 0.8, extentUnit: 'ac',
    },
  });
  expect(world.lastVars('setBoundary')).toMatchObject({ recordId: 'w-record-new' });
});

test('a property filed without its shape offers the boundary alone, never a second copy', async ({ page, world }) => {
  world.set('setBoundary', false);
  await ground(page, world);
  await openVillage(page);
  await pick(page, '216');

  await plotCard(page).getByRole('button', { name: 'Add to Properties' }).click();

  await expect(plotCard(page)).toContainText(
    '216 was added to Properties, but its boundary was refused. Try the boundary again, '
    + 'or open Properties and draw the shape.');
  await expect(page).toHaveURL(/\/app\/maps$/);

  world.set('setBoundary', true);
  await plotCard(page).getByRole('button', { name: 'Try the boundary again' }).click();

  await expect(page).toHaveURL(/\/app\/properties$/);
  // Added once, however many times the shape was tried.
  expect(world.calls('saveRecord')).toHaveLength(1);
  expect(world.calls('setBoundary')).toHaveLength(2);
});

test('a boundary refused a second time says so again, and still files nothing twice', async ({ page, world }) => {
  world.set('setBoundary', false);
  await ground(page, world);
  await openVillage(page);
  await pick(page, '216');

  await plotCard(page).getByRole('button', { name: 'Add to Properties' }).click();
  await expect(plotCard(page)).toContainText('was added to Properties, but its boundary was refused');

  await plotCard(page).getByRole('button', { name: 'Try the boundary again' }).click();

  await expect(plotCard(page)).toContainText(
    'That boundary was refused again — the shape may have fewer than three usable corners.');
  await expect(page).toHaveURL(/\/app\/maps$/);
  // One record, two attempts at its shape. A second press of Try again must
  // never become a second copy of the plot.
  expect(world.calls('saveRecord')).toHaveLength(1);
  expect(world.calls('setBoundary')).toHaveLength(2);
  await expect(plotCard(page).getByRole('button', { name: 'Try the boundary again' })).toBeVisible();
});

test('a plot that is already one of my records opens the record instead of filing it twice', async ({ page, world }) => {
  await ground(page, world);
  await openVillage(page);
  await pick(page, '214/2');

  await expect(plotCard(page).getByRole('button', { name: 'Add to Properties' })).toHaveCount(0);
  await plotCard(page).getByRole('button', { name: 'Open Sy 214/2' }).click();

  await expect(page).toHaveURL(new RegExp(`/app/records/${ID.parcel}/map$`));
  expect(world.calls('saveRecord')).toHaveLength(0);
});

// ── sending a village map up, and taking it back off ───────────────────

const KMZ = { name: 'katragunta.kmz', mimeType: 'application/vnd.google-earth.kmz', buffer: Buffer.from('PK katragunta') };

test('uploading a village map sends the file and lands me on the map it just took', async ({ page, world }) => {
  let landed = false;
  const store = await ground(page, world, { list: () => ({ json: landed ? [entry()] : [] }) });
  store.post = () => { landed = true; return { json: { villages: [landedRow()], skipped: [] } }; };
  await openMaps(page);
  await expect(sideCard(page, 'No cadastral maps yet')).toBeVisible();

  await page.getByLabel('Cadastral map file').setInputFiles(KMZ);

  const posts = world.restCalls(/village-maps$/).filter((c) => c.method === 'POST');
  expect(posts).toHaveLength(1);
  expect(posts[0].body).toContain('katragunta.kmz');

  // Straight to the map it just took; the same Properties-style information
  // filter and list remain available without a duplicate village switch.
  await expect(page.getByRole('heading', { level: 1, name: VILLAGE })).toBeVisible();
  await expect(page.locator('.vc-label').first()).toBeVisible({ timeout: 20_000 });
  await expect(page.getByLabel('Search all villages')).toBeVisible();
  await expect(page.locator('.pagehead .grow > .note')).toHaveText(`7 plots · ${TOTAL_ACRES_1DP} ac`);
});

test('an upload says which file each village came from, what was recovered and what was left out', async ({ page, world }) => {
  let landed = false;
  const store = await ground(page, world, { list: () => ({ json: landed ? [entry()] : [] }) });
  store.post = () => {
    landed = true;
    return { json: {
      villages: [landedRow({
        replaced: true, within: 8, near: 4, dropped: 1, clashes: 2,
        duplicates: [{ name: 'katragunta-labels.kml', why: 'labels only' }],
      })],
      skipped: [{ name: 'notes.txt', why: 'not a KML or KMZ' }],
    } };
  };
  await openMaps(page);

  await page.getByLabel('Cadastral map file').setInputFiles(KMZ);

  const report = page.locator('.vm-map-filters');
  await expect(report).toContainText(
    'KATRAGUNTA — 7 plots, replacing the one on file, from katragunta.kmz.');
  await expect(report).toContainText('12 plot numbers were read off a separate label sheet.');
  await expect(report).toContainText('1 shape had no number and was left out.');
  await expect(report).toContainText(
    '2 plot numbers are claimed by more than one shape.');
  await expect(report).toContainText('katragunta-labels.kml was not used (labels only).');
  await expect(report).toContainText('notes.txt — not a KML or KMZ');
});

test('re-uploading a village redraws the map that is open, not just the row in the list', async ({ page, world }) => {
  // Correcting a wrong map is the whole reason an upload is allowed to replace
  // one (villageIndex.ts:223). A tab that kept the first read would show the
  // old shapes until it was reloaded.
  let plots = PLOTS;
  const store = await ground(page, world, {
    list: () => ({ json: [entry({ plots: plots.length })] }),
    file: () => ({ json: collection(plots) }),
  });
  store.post = () => {
    plots = PLOTS.slice(0, 3);
    return { json: { villages: [landedRow({ plots: 3, replaced: true })], skipped: [] } };
  };
  await openVillage(page);
  await expect(page.locator('.vc-label')).toHaveCount(7);

  await page.getByLabel('Cadastral map file').setInputFiles(KMZ);

  await expect(page.locator('.pagehead .grow > .note')).toHaveText(/^3 plots · /);
  await expect(sideCard(page, 'All plots')).toHaveCount(0);
  await expect(page.locator('.vc-label')).toHaveCount(3);
  await expect(page.locator('.vm-map-filters')).toContainText(
    'KATRAGUNTA — 3 plots, replacing the one on file, from katragunta.kmz.');
});

test('a shipped village map has no bin, because it is not this screen’s to delete', async ({ page, world }) => {
  await ground(page, world, {
    shipped: [{ village: 'KONDAPURAM', file: 'kondapuram.geojson', key: 'kondapuram', plots: 3 }],
  });
  await openMaps(page);

  await page.getByLabel('Search all villages').fill(VILLAGE);
  await expect(page.getByRole('button', { name: `Remove ${VILLAGE}` })).toBeVisible();
  await page.getByLabel('Search all villages').fill('KONDAPURAM');
  await expect(page.getByRole('button', { name: 'Remove KONDAPURAM' })).toHaveCount(0);
});

test('taking an uploaded map off closes it and leaves the shelf empty', async ({ page, world }) => {
  let gone = false;
  const store = await ground(page, world, { list: () => ({ json: gone ? [] : [entry()] }) });
  store.remove = () => { gone = true; return { json: { removed: VILLAGE } }; };
  await openVillage(page);

  await page.getByLabel('Search all villages').fill(VILLAGE);
  await page.getByRole('button', { name: `Remove ${VILLAGE}` }).click();

  const deletes = world.restCalls(/village-maps/).filter((c) => c.method === 'DELETE');
  expect(deletes).toHaveLength(1);
  expect(deletes[0].path).toBe(`/api/gateway/pattadar/village-maps/${KEY}`);

  await expect(sideCard(page, 'No cadastral maps yet')).toBeVisible();
  await expect(page.locator('.leaflet-container')).toHaveCount(0);
});

// ── when the server refuses ────────────────────────────────────────────

test.describe('when the server refuses', () => {
  // Chrome logs every non-2xx response itself ("Failed to load resource … 503"),
  // and provoking exactly that is the point of each test in here.
  test.use({ allowConsole: true });

  test('an uploads outage is not an empty shelf, and does not ask me to send them all up again', async ({ page, world }) => {
    await ground(page, world, { list: () => ({ status: 503, json: { error: 'the village map store is down' } }) });
    await openMaps(page);

    const said = sideCard(page, 'Cadastral maps could not be loaded');
    await expect(said).toBeVisible();
    await expect(said).toContainText('Your uploaded cadastral maps could not be loaded.');
    await expect(said.getByRole('button', { name: 'Try again' })).toBeVisible();
    // The uploader is still there, but it is no longer the whole answer: the
    // filled button is the retry, and sending every map up again is outlined.
    await expect(said.getByRole('button', { name: 'Choose KMZ or KML' })).toBeVisible();
    await expect(said.locator('.btn.primary')).toHaveCount(1);
    await expect(said.locator('.btn.primary')).toHaveText('Try again');
    await expect(page.getByText('No cadastral maps yet')).toHaveCount(0);
  });

  test('the villages come back the moment the server does', async ({ page, world }) => {
    let down = true;
    const store = await ground(page, world);
    store.list = () => (down ? { status: 503, json: { error: 'down' } } : { json: [entry()] });
    await openMaps(page);
    await expect(sideCard(page, 'Cadastral maps could not be loaded')).toBeVisible();

    down = false;
    await page.getByRole('button', { name: 'Try again' }).click();

    await expect(page.getByLabel('Search all villages')).toBeVisible();
    await expect(page.getByText('Cadastral maps could not be loaded')).toHaveCount(0);
    await expect(page.locator('.vc-badge')).toHaveText('1 village');
  });

  test('a village list that is knowingly short says so beside the villages it does have', async ({ page, world }) => {
    const store = await ground(page, world, {
      shipped: [{ village: 'KONDAPURAM', file: 'kondapuram.geojson', key: 'kondapuram', plots: 3 }],
      list: () => ({ status: 502, json: { error: 'bad gateway' } }),
    });
    await openMaps(page);

    const listed = page.locator('.vm-map-filters');
    await expect(listed).toContainText('Your uploaded cadastral maps could not be loaded.');
    await expect(listed.locator('.tally')).toHaveText('1 village');

    // And it is repairable from where it is said, not only from a reload.
    store.list = () => ({ json: [entry()] });
    await listed.getByRole('button', { name: 'Try again' }).click();

    await expect(listed.locator('.tally')).toHaveText('2 villages');
    await expect(listed).not.toContainText('could not be loaded');
  });

  test('a build with no overview manifest still lists what it shipped', async ({ page, world }) => {
    // overview.json is the newer manifest and carries the outlines; index.json
    // is what older builds wrote, and a village map with no outline is still a
    // village map (villageIndex.ts:55).
    await ground(page, world, { list: () => ({ json: [] }) });
    await page.route('**/vm/overview.json', (route) => route.fulfill({ status: 404, body: '' }));
    await page.route('**/vm/index.json', (route) => route.fulfill({ json: [
      { village: 'KONDAPURAM', file: 'kondapuram.geojson', key: 'kondapuram', plots: 3 },
    ] }));
    await openMaps(page);

    await revealVillage(page, 'KONDAPURAM');
    await expect(page.getByRole('button', { name: /^KONDAPURAM/ })).toBeVisible();
    await expect(page.getByText('No cadastral maps yet')).toHaveCount(0);
    await expect(page.locator('.vm-stage')).toContainText('Search for a village above.');
  });

  test('a village whose shape file did not come back says so where its map would be', async ({ page, world }) => {
    await ground(page, world, { file: () => ({ status: 503, json: { error: 'gone' } }) });
    await page.goto('/app/maps');
    await revealVillage(page);
    await page.getByRole('button', { name: new RegExp(`^${VILLAGE}`) }).click();

    const failed = page.getByRole('alert');
    await expect(failed).toContainText('KATRAGUNTA’s map did not load');
    await expect(failed).toContainText('The shape file did not come back.');
    await expect(failed.getByRole('button', { name: 'Try again' })).toBeVisible();

    // The head still names the village that failed — but what stands under that
    // name must not be the MANDAL's totals.
    await expect(page.getByRole('heading', { level: 1, name: VILLAGE })).toBeVisible();
    await expect(page.locator('.pagehead .grow > .note')).toHaveText('Its shape file could not be read.');
    await expect(page.locator('.vc-map')).toHaveCount(0);
    // Nothing to fit and nothing to print, because there is no map.
    await expect(page.getByRole('button', { name: /^Fit/ })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Print' })).toHaveCount(0);
    // And the way out is still offered from here.
    await expect(page.getByRole('button', { name: 'All villages' })).toBeVisible();
  });

  test('Try again on a failed village is a real second read, not the cached miss', async ({ page, world }) => {
    let down = true;
    const store = await ground(page, world);
    store.file = () => (down ? { status: 503, json: { error: 'gone' } } : { json: collection() });
    await page.goto('/app/maps');
    await revealVillage(page);
    await page.getByRole('button', { name: new RegExp(`^${VILLAGE}`) }).click();
    await expect(page.getByRole('alert')).toContainText('KATRAGUNTA’s map did not load');

    down = false;
    await page.getByRole('alert').getByRole('button', { name: 'Try again' }).click();

    await expect(page.locator('.vc-label').first()).toBeVisible({ timeout: 20_000 });
    await expect(page.locator('.pagehead .grow > .note')).toHaveText(`7 plots · ${TOTAL_ACRES_1DP} ac`);
    expect(world.restCalls(new RegExp(FILE)).length).toBeGreaterThan(1);
  });

  test('half a village is refused, and the refusal says which half is missing', async ({ page, world }) => {
    const store = await ground(page, world, { list: () => ({ json: [] }) });
    store.post = () => ({
      status: 400,
      json: {
        error: 'Nothing here could be read as a village map.',
        skipped: [{
          name: 'katragunta-shapes.kml',
          why: 'its shapes carry no plot numbers — this export keeps them in a separate '
             + 'label file, so send both together',
        }],
      },
    });
    await openMaps(page);

    await page.getByLabel('Cadastral map file').setInputFiles({
      name: 'katragunta-shapes.kml', mimeType: 'application/vnd.google-earth.kml+xml',
      buffer: Buffer.from('<kml/>'),
    });

    const card = sideCard(page, 'No cadastral maps yet');
    await expect(card).toContainText('Nothing here could be read as a village map.');
    await expect(card).toContainText(
      'katragunta-shapes.kml — its shapes carry no plot numbers — this export keeps them '
      + 'in a separate label file, so send both together');
    // Nothing landed, so nothing was opened.
    await expect(page.getByRole('heading', { level: 1, name: 'Cadastral maps' })).toBeVisible();
  });

  test('a refused removal keeps the village, and says so beside the bin that was pressed', async ({ page, world }) => {
    await ground(page, world, {
      remove: () => ({ status: 409, json: { error: 'that village map is in use' } }),
    });
    await openVillage(page);
    const before = world.restCalls(/village-maps$/).length;

    await page.getByLabel('Search all villages').fill(VILLAGE);
    await page.getByRole('button', { name: `Remove ${VILLAGE}` }).click();

    await expect(page.locator('.vm-map-filters')).toContainText('that village map is in use');
    // The village is still on the list and its map is still open: a refused
    // DELETE that refreshed anyway made the removal look like it undid itself.
    await expect(page.locator('.vm-villages').getByRole('button', { name: new RegExp(`^${VILLAGE}`) })).toBeVisible();
    await expect(page.getByRole('heading', { level: 1, name: VILLAGE })).toBeVisible();
    expect(world.restCalls(/village-maps$/).length).toBe(before);
  });

  test('a removal that fails with nothing to say still names the village that stayed', async ({ page, world }) => {
    await ground(page, world, { remove: () => ({ status: 500, body: 'nope' }) });
    await openVillage(page);

    await page.getByLabel('Search all villages').fill(VILLAGE);
    await page.getByRole('button', { name: `Remove ${VILLAGE}` }).click();

    await expect(page.locator('.vm-map-filters')).toContainText(
      `${VILLAGE} could not be taken off (500).`);
    await expect(page.locator('.vm-villages').getByRole('button', { name: new RegExp(`^${VILLAGE}`) })).toBeVisible();
    await expect(page.getByRole('heading', { level: 1, name: VILLAGE })).toBeVisible();
  });

  test('a removal refused after I put the matches away is still said', async ({ page, world }) => {
    await ground(page, world, {
      remove: () => ({ status: 409, json: { error: 'that village map is in use' }, delayMs: 1_500 }),
    });
    await openMaps(page);
    const search = page.getByLabel('Search all villages');
    await search.fill(VILLAGE);
    await page.getByRole('button', { name: `Remove ${VILLAGE}` }).click();
    // Put away while the server is still thinking it over.
    await page.keyboard.press('Escape');
    await expect(matches(page)).toHaveCount(0);

    await expect(page.getByRole('region', { name: 'Cadastral map filters' }))
      .toContainText('that village map is in use');
    await expect(search).toHaveValue(VILLAGE);
  });

  test('imagery that will not load leaves the survey plots on screen and says so', async ({ page, world }) => {
    await ground(page, world);
    let dead = true;
    await page.route(TILE_HOSTS, (route) => (dead ? route.abort() : route.continue()));
    await openVillage(page);

    const notice = page.locator('.vc-tile-error');
    await expect(notice).toContainText('Imagery could not fully load.');
    await expect(page.locator('.vc-label')).toHaveCount(7);

    dead = false;
    await notice.getByRole('button', { name: 'Retry map' }).click();

    await expect(page.locator('.vc-tile-error')).toHaveCount(0);
  });

  test('a street map that will not load says it is the street map that is missing', async ({ page, world }) => {
    // Which basemap failed is the whole content of the notice: the answer to
    // "imagery is down" is to switch, and to "the street map is down" is not.
    await ground(page, world);
    await page.route(TILE_HOSTS, (route) => route.abort());
    await openVillage(page);
    await expect(page.locator('.vc-tile-error'))
      .toContainText('Imagery could not fully load.');

    await chip(page, 'Street map').click();

    await expect(page.locator('.vc-tile-error'))
      .toContainText('Street map could not fully load.');
    await expect(page.locator('.vc-label')).toHaveCount(7);
  });
});

// ── the map stays up while the next one is read ────────────────────────

test('the mandal stays on screen while a village’s shape file is read', async ({ page, world }) => {
  await ground(page, world, { file: () => ({ json: collection(), delayMs: 1_500 }) });
  await openMaps(page);
  await expect(page.locator('.vc-village')).toBeVisible();

  await revealVillage(page);
  await page.getByRole('button', { name: new RegExp(`^${VILLAGE}`) }).click();

  await expect(page.locator('.vc-badge')).toHaveText('Reading KATRAGUNTA’s shape file…');
  // Tearing the map down for a corner note reads as a panel that failed.
  await expect(page.locator('.leaflet-container')).toBeVisible();

  await expect(page.locator('.vc-label').first()).toBeVisible({ timeout: 20_000 });
  await expect(page.locator('.vc-badge')).toContainText(`${VILLAGE} · zoom`);
});

// ── the phone ──────────────────────────────────────────────────────────

test('the fence calculator keeps its drawing and its bill out of each other’s way @phone', async ({ page, world }) => {
  await ground(page, world);
  await openVillage(page);
  await openFence(page, '215');

  // Side by side on a desk, stacked on a phone — but never one over the other,
  // because the whole point is pointing at the map while reading the bill.
  const map = (await page.locator('.fs-map').boundingBox())!;
  const panel = (await page.locator('.fs-panel').boundingBox())!;
  const clear = map.y + map.height <= panel.y + 1 || panel.y + panel.height <= map.y + 1
    || map.x + map.width <= panel.x + 1 || panel.x + panel.width <= map.x + 1;
  expect(clear, 'the drawing and the estimate are drawn over each other').toBe(true);

  await expect(page.locator('.fs-bill')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Close the fence calculator' })).toBeInViewport();
  // An estimate that has run off the side of the screen is not an estimate.
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('the map’s tools and its plot search do not sit on top of each other @phone', async ({ page, world }) => {
  await ground(page, world);
  await openVillage(page);

  await page.getByLabel('Find survey or plot number').fill('215');
  await page.getByRole('button', { name: 'Find plot' }).click();
  await expect(plotCard(page).locator('.vm-plotno')).toContainText('215');

  const tools = (await page.locator('.vc-tl').boundingBox())!;
  const search = (await page.locator('.vc-tr').boundingBox())!;
  const clear = tools.y + tools.height <= search.y || search.y + search.height <= tools.y
    || tools.x + tools.width <= search.x || search.x + search.width <= tools.x;
  expect(clear, 'the mode chips and the plot search overlap').toBe(true);

  // A cadastral map that scrolls sideways has lost the plot it was opened for.
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('typing a village name does not move the map @phone', async ({ page, world }) => {
  await ground(page, world);
  await openMaps(page);
  // A village outline on the mandal map, by class: Leaflet draws it as a
  // path with no role. Once one is drawn, the stage has its final place.
  await expect(page.locator('.vc-village')).toBeVisible();
  // The map's frame, by class: a plain div, and the thing that must not move.
  const stage = page.locator('.vm-stage');
  const before = (await stage.boundingBox())!;

  await page.getByLabel('Search all villages').fill(VILLAGE);

  const row = matchRows(page);
  await expect(row).toHaveCount(1);
  await expect(row).toBeInViewport();
  const after = (await stage.boundingBox())!;
  expect(Math.abs(after.y - before.y), 'the matches pushed the map down').toBeLessThanOrEqual(1);
  // Over the map, not under it: a tap at the row's centre lands on the row
  // (the row's class again, as matchRows reads it).
  const box = (await row.boundingBox())!;
  const onTop = await page.evaluate(([x, y]) => Boolean(document.elementFromPoint(x, y)?.closest('.villagerow')),
    [box.x + box.width / 2, box.y + box.height / 2]);
  expect(onTop, 'the matching village is drawn under the map').toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('tapping a matching village opens it and leaves the keyboard down @phone-only', async ({ page, world }) => {
  await ground(page, world);
  await openMaps(page);
  const search = page.getByLabel('Search all villages');
  await search.fill(VILLAGE);
  // Typing: the field has focus, so a phone has its keyboard up.
  await expect(search).toBeFocused();

  await matchRows(page).first().tap();

  await expect(page.getByRole('heading', { level: 1, name: VILLAGE })).toBeVisible();
  await expect(matches(page)).toHaveCount(0);
  await expect(search).toHaveValue('');
  // The tap took the keyboard down. Focus back in the field would bring it
  // up again, over the village that has just opened.
  await expect(search).not.toBeFocused();
});

// ── the way out ────────────────────────────────────────────────────────

test('the village map hands off to my own land on the map', async ({ page, world }) => {
  await ground(page, world);
  await openVillage(page);

  // Named for where it goes: the Map view of Properties.
  await page.getByRole('link', { name: 'Properties map' }).click();

  await expect(page).toHaveURL(/\/app\/properties\?view=map$/);
});

test('Print prints the village that is on the stage', async ({ page, world }) => {
  await ground(page, world);
  await openVillage(page);

  await page.getByRole('button', { name: 'Print' }).click();

  expect(await printed(page)).toBe(1);
});
