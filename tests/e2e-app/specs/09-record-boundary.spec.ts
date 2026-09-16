/**
 * W04 · the record map — /app/records/:id/map.
 *
 * The screen that claims to show real ground, so it is the screen that must
 * never invent any. Four questions run through every test below:
 *
 *   · is there a boundary, and does the screen draw only what it has?
 *   · does what the map SAYS agree with what the map DREW? (the caption, the
 *     place note, the offline notice, the stray-stone warning)
 *   · does every control that writes actually write — the right mutation, the
 *     right variables, once — and say so when it is refused?
 *   · and does a wrong answer from the server look like a wrong answer, rather
 *     than like a success?
 *
 * Two of this screen's entrances are not links from the record at all. The
 * order flow hands an owner here when a service needs corners the record does
 * not have, in two search params — `draw=1` arms the drawing tool on arrival,
 * `back=` names the half-composed order to return to once there is an outline
 * to send it. Both are tested under "the hand-off from an order", including
 * the two things the return trip must refuse: an empty ring (the same save
 * backs "Remove saved boundary") and a `back=` that points off this app.
 *
 * Map interactions are driven the way tests/e2e-web360 drives them: a forced
 * click at a fraction of the panel, never a viewport coordinate (the bottom
 * right corner of a Leaflet map is its attribution link, and a run once
 * navigated to leafletjs.com mid-test). Everything else is asserted on the
 * controls, the wording and the mutation the world saw — a pixel is not an
 * assertion anybody can read in six months.
 *
 * Four scenarios are `test.fail()`. Each is named at the line that causes it;
 * each goes green the day it is fixed:
 *
 *   1. accepting a moved mark always reports failure — api.ts:855 asks for
 *      `acceptMarkPosition`; RecordBoundary.tsx:164 reads `acceptMark`.
 *   2. "Remove saved boundary" wipes a surveyed ring on one click, with no
 *      second confirmation — RecordBoundary.tsx:913-919.
 *   3. a refused "add a mark at each corner" says nothing at all —
 *      RecordBoundary.tsx:1329-1332 wires onError and never reads the count.
 *   4. a side pinned from the keyboard drops focus on the floor — the tip's
 *      whole DOM is rebuilt on every render (MapCanvas.tsx:1486), including
 *      the one the hand-off itself causes.
 */
import { test, expect, World, TILE_HOSTS } from '../fixtures/harness';
import type { Page } from '../fixtures/harness';
import { ID, PAPER, MARK } from '../fixtures/ids';

/** Longer than the suite's 45s default, and only here. Every test in this file
 *  waits for MapCanvasLazy — Leaflet plus this module's own 150 kB — to be
 *  transformed and served by the dev server, and that first transform is the
 *  slowest single thing any spec in this suite does. On a laptop already
 *  running the founder's stack it can take most of the default budget on its
 *  own, and a timeout there says nothing about the screen. */
test.describe.configure({ timeout: 75_000 });

// ── the ground these tests stand on ────────────────────────────────────

/** Sy 214/2's ring, exactly as fixtures/seed.ts serves it: four corners,
 *  ~107 m by ~89 m, a shade over 2⅓ acres. Restated here rather than imported
 *  so a test that replaces the whole boundary still frames the same land. */
const RING = [15.7410, 79.2694, 15.7410, 79.2704, 15.7402, 79.2704, 15.7402, 79.2694];

/** The centre of that ring, to four decimals — what the Location card prints
 *  and what "Move the pin onto the boundary" must send. */
const RING_CENTRE = { lat: 15.7406, lon: 79.2699 };

type Mark = Record<string, unknown>;

const marks = (): Mark[] => [
  { id: MARK.ne, seq: 1, label: 'North-east stone', state: 'accepted', detail: 'Granite, chipped', lat: 15.7410, lon: 79.2704, photoCount: 2, notedOn: '2026-08-12' },
  { id: MARK.se, seq: 2, label: 'South-east stone', state: 'accepted', detail: '', lat: 15.7402, lon: 79.2704, photoCount: 0, notedOn: '2026-08-12' },
  { id: MARK.proposed, seq: 3, label: 'West corner', state: 'proposed', detail: 'Surveyor moved this 4 m west', lat: 15.7406, lon: 79.2691, photoCount: 1, notedOn: '2026-09-05' },
];

/** Every field Q_BOUNDARY selects (api.ts:340). A field left out here renders
 *  as `undefined` on the screen, which is the bug this suite exists to catch
 *  rather than to produce. */
function boundary(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    recordId: ID.parcel,
    title: 'Sy 214/2',
    lat: 15.7406698,
    lon: 79.2698502,
    setBy: 'Walked by Shankar Reddy',
    accuracy: '±3 m',
    extentLabel: '4 acres 12 guntas',
    caption: '8 corners walked 12 Aug 2026',
    ring: RING,
    sheetTitle: 'FMB sketch',
    sheetDetail: 'Survey 214/2 · Katragunta',
    sheetId: PAPER.map,
    marks: marks(),
    ...over,
  };
}

/** Every field Q_RECORD selects (api.ts:315). Only the three tests that need
 *  an extent in `ac` use this — the seeded parcel is filed in `acres`, and the
 *  traced-against-recorded sentence is written for `ac`. */
function parcelRecord(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: ID.parcel, kind: 'parcel', title: 'Sy 214/2', eyebrow: 'Agricultural land',
    classification: 'Dry land', status: 'owned', stake: 'owned',
    khataNo: '1042', ownerName: 'Telukutla Shankar Reddy',
    village: 'Katragunta', mandal: 'Markapur', district: 'Prakasam',
    placeLine: 'Katragunta, Markapur, Prakasam',
    placeLineTe: 'కత్రగుంట, మార్కాపురం, ప్రకాశం', state: 'Andhra Pradesh',
    extent: 2.35, extentUnit: 'ac', extentDetail: '',
    marketValue: 8_600_000, perUnitValue: 2_000_000, perUnitLabel: 'per acre',
    boughtYear: '1998', lat: 15.7406698, lon: 79.2698502, ring: RING,
    mapCaption: 'Walked 12 Aug 2026 · 8 corners',
    paperCount: 12, featureCount: 14, peopleCount: 3, serviceCount: 2,
    photoCount: 18, photoNote: 'Last visit 12 Aug 2026', tags: ['ancestral'],
    noteBody: '', noteAuthor: '', noteAt: '',
    ...over,
  };
}

/** Click a fraction across the map panel.
 *
 *  Two traps, both borrowed from tests/e2e-web360: a plain click waits for the
 *  CONTAINER to be actionable and Leaflet fills it with its own panes, so
 *  `force` is required; and a bare viewport coordinate lands on whatever is
 *  painted there, which near an edge is Leaflet's own attribution link. */
async function clickMapAt(page: Page, fx: number, fy: number): Promise<void> {
  const map = page.locator('.plot .map');
  const box = (await map.boundingBox())!;
  await map.click({ force: true, position: { x: box.width * fx, y: box.height * fy } });
}

/** The map is behind a lazy import and Leaflet is 150 kB; nothing on this
 *  screen can be driven until it has mounted. */
async function openMap(page: Page, id: string): Promise<void> {
  await page.goto(`/app/records/${id}/map`);
  await expect(page.locator('.leaflet-container')).toBeVisible({ timeout: 40_000 });
}

const marksCard = (page: Page) => page.locator('.card', { hasText: 'Boundary marks' });
/** The screen's own error line — `pinErr`, which every write on this page
 *  reports through (RecordBoundary.tsx:827). */
const mapError = (page: Page) => page.locator('.mapsays p[role="alert"]');

type Loc = ReturnType<Page['locator']>;

/** The value beside a named key in a KV block (ui.tsx:412). A card asserted
 *  with `toContainText('392 m')` would pass with the number filed under the
 *  wrong label; this says which row it is in. */
const kv = (card: Loc, key: string) =>
  card.locator('.kv > div').filter({ hasText: new RegExp(`^${key}`) }).locator('.v');

/** The zoom every tile on the map is drawn at, or -1 while a zoom is still in
 *  flight and two levels are on screen at once (which is why every caller
 *  polls). Leaflet writes its zoom nowhere in the DOM; the tile URLs are
 *  `{z}/{y}/{x}` and are the only public record of what the map is showing. */
async function tileZoom(page: Page): Promise<number> {
  const zooms = await page.locator('.leaflet-tile').evaluateAll((els) => els.map((el) => {
    const hit = /\/(\d+)\/(\d+)\/(\d+)(?:\.png)?(?:\?|$)/.exec((el as HTMLImageElement).src);
    return hit ? Number(hit[1]) : -1;
  }));
  const levels = new Set(zooms.filter((z) => z >= 0));
  return levels.size === 1 ? [...levels][0] : -1;
}

// ── what a surveyed record shows ───────────────────────────────────────

test('a surveyed record draws its ring and letters every corner of it', async ({ page, world }) => {
  await openMap(page, ID.parcel);

  await expect(page.locator('path.w-ring')).toHaveCount(1);
  // The letters are the whole point: the side table names "A → B", and without
  // them that is two points appearing nowhere on the map.
  await expect(page.locator('.w-corner-no')).toHaveText(['A', 'B', 'C', 'D']);
  // Four corners is four lengths, written along the boundary itself.
  await expect(page.locator('.w-side')).toHaveText(['107 m', '89 m', '107 m', '89 m']);
  // And the three stones, numbered the way the list beside the map numbers
  // them. Leaflet paints into SVG and divIcons, so its own class names are the
  // only handle these have — there is no role or label to reach them by.
  await expect(page.locator('.w-mark-no')).toHaveText(['1', '2', '3']);
  await expect(page.locator('path.w-mark')).toHaveCount(3);

  expect(world.lastVars('boundary')).toMatchObject({ id: ID.parcel });
});

test('the map names which land this is, before anyone has to click anything', async ({ page }) => {
  await openMap(page, ID.parcel);

  await expect(page.locator('main > p.eyebrow')).toHaveText('Sy 214/2 · boundary');
  await expect(page.getByRole('heading', { name: 'Map & boundary' })).toBeVisible();
  await expect(page.locator('.pagehead .lede'))
    .toHaveText('Katragunta, Markapur, Prakasam — Andhra Pradesh');
  await expect(page.locator('.pagehead .note'))
    .toHaveText('Khata 1042 · 4 acres 12 guntas · Telukutla Shankar Reddy');
});

test('the caption says when the land was walked and which imagery it is drawn on', async ({ page }) => {
  await openMap(page, ID.parcel);
  await expect(page.locator('.plot .cap'))
    .toHaveText('8 corners walked 12 Aug 2026 · Esri World Imagery');
});

test('with nothing armed, the map says what its tools are for and which of them write', async ({ page }) => {
  await openMap(page, ID.parcel);

  // The idle sentence. It is the only instruction anyone gets before arming
  // something, and it is the one piece of copy on this panel that is always on
  // screen (RecordBoundary.tsx:841).
  await expect(page.locator('.mapsays .hint')).toHaveText(
    'Add a named boundary mark, or choose “Move this mark” from its menu to correct its position.');
  // And the panel says out loud which of its three tools touch the record —
  // the header used to be seven buttons of three different kinds in one row.
  await expect(page.locator('.maptools .tools .eyebrow')).toHaveText('Changes the record');
  for (const tool of ['Add boundary mark', 'Move the pin', 'Redraw boundary']) {
    await expect(page.getByRole('button', { name: tool, exact: true })).toHaveAttribute('aria-pressed', 'false');
  }
  await expect(page.locator('.editbar')).toHaveCount(0);
});

test('the Location card says who set the pin and how closely', async ({ page }) => {
  await openMap(page, ID.parcel);
  const card = page.locator('.card', { hasText: 'LOCATION' });

  await expect(card).toContainText('15.7406° N, 79.2699° E');   // the ring's centre
  await expect(card).toContainText('15.7407° N, 79.2699° E');   // the filed pin
  await expect(card).toContainText('Walked by Shankar Reddy');
  await expect(card).toContainText('±3 m');
});

test('the map opens framed on the land, and the zoom cluster moves it', async ({ page }) => {
  await openMap(page, ID.parcel);
  await expect(page.locator('path.w-ring')).toHaveCount(1);

  // Framed on this parcel, not on the state it is in. The opening view used to
  // be one real village at street level (MapCanvas.tsx:696-706), which made
  // every record look authoritative about somebody else's fields.
  await expect.poll(() => tileZoom(page)).toBeGreaterThan(14);
  const framed = await tileZoom(page);

  // Deliberately out first: the fit is already at the FIT ceiling of 18 and
  // the map's own maxZoom is 19, so "in, in" would silently stop moving.
  await page.getByRole('button', { name: 'Zoom out' }).click();
  await expect.poll(() => tileZoom(page)).toBe(framed - 1);
  await page.getByRole('button', { name: 'Zoom out' }).click();
  await expect.poll(() => tileZoom(page)).toBe(framed - 2);

  await page.getByRole('button', { name: 'Zoom in' }).click();
  await expect.poll(() => tileZoom(page)).toBe(framed - 1);

  // Recentre means the whole parcel — back to the frame it opened on.
  await page.getByRole('button', { name: 'Recentre' }).click();
  await expect.poll(() => tileZoom(page)).toBe(framed);
  await expect(page.locator('path.w-ring')).toHaveCount(1);
});

test('the three boundary marks are listed by number, name and note', async ({ page }) => {
  await openMap(page, ID.parcel);
  const card = marksCard(page);

  // Numbered the way the map numbers them, or the list and the ground are
  // talking about different stones.
  await expect(card.locator('.avatarlg')).toHaveText(['1', '2', '3']);
  await expect(card).toContainText('North-east stone');
  await expect(card).toContainText('Granite, chipped');
  await expect(card).toContainText('South-east stone');
  await expect(card).toContainText('West corner');
  await expect(card).toContainText('Surveyor moved this 4 m west');
  await expect(card.getByRole('button', { name: /^Actions for / })).toHaveCount(3);
});

test('the filed sheet opens on the paper it actually is', async ({ page }) => {
  await openMap(page, ID.parcel);
  const card = page.locator('.card', { hasText: 'FMB sketch' });

  await expect(card).toContainText('Survey 214/2 · Katragunta');
  await expect(card.getByRole('link', { name: 'Open sheet' }))
    .toHaveAttribute('href', `/app/papers/${PAPER.map}`);

  await card.getByRole('link', { name: 'Open sheet' }).click();
  await expect(page).toHaveURL(new RegExp(`/app/papers/${PAPER.map}$`));
});

test('a sheet whose corners were never placed says why nothing is drawn', async ({ page, world }) => {
  // The paper is filed; the survey never happened. Both halves are true at
  // once and the card is the only place that can say so.
  world.set('boundary', boundary({ ring: [], marks: [], caption: 'This record has never been surveyed' }));
  await openMap(page, ID.parcel);

  await expect(page.locator('.card', { hasText: 'FMB sketch' })).toContainText(
    'The sheet is filed but its corners have never been placed on the ground, which is why there is no boundary drawn.');
  await expect(page.locator('path.w-ring')).toHaveCount(0);
});

// ── measurements ───────────────────────────────────────────────────────

test('Measurements opens on arrival and counts every side of the saved outline', async ({ page }) => {
  await openMap(page, ID.parcel);
  const card = page.locator('.card', { hasText: 'Measurements' });

  // Each figure against the row it is filed under: a card that merely CONTAINS
  // "392 m" would pass just as well with the perimeter printed as the area.
  await expect(kv(card, 'Sides')).toHaveText('4');
  await expect(kv(card, 'Around')).toHaveText('392 m');
  await expect(kv(card, 'Area')).toHaveText('2 Acres 14 Guntas');
  await expect(kv(card, 'On record')).toHaveText('4 acres 12 guntas');
  await expect(card).toContainText('Approximate measurements from the saved outline.');

  await expect(card.getByRole('button', { name: 'A → B' })).toBeVisible();
  await expect(card.getByRole('button', { name: 'D → A' })).toBeVisible();
  await expect(card.locator('tbody tr')).toHaveCount(4);
  // The lengths, in order, and the compass point each side runs on. This ring
  // is a rectangle walked clockwise from its north-west corner, so the
  // directions are the one column nobody would notice going wrong.
  await expect(card.locator('tbody td:nth-child(2)'))
    .toHaveText(['107 m', '89 m', '107 m', '89 m']);
  await expect(card.locator('tbody td:nth-child(3)')).toHaveText(['E', 'S', 'W', 'N']);
});

test('the unit switch moves every length on the screen and never the area', async ({ page }) => {
  await openMap(page, ID.parcel);
  const card = page.locator('.card', { hasText: 'Measurements' });

  await expect(card).toContainText('392 m');
  await card.getByRole('button', { name: 'Feet' }).click();

  await expect(card).toContainText('1,286 ft');
  await expect(card).not.toContainText('392 m');
  // Lengths convert; areas do not. Acres and guntas is how land is spoken
  // about here, whatever the sides are measured in.
  await expect(card).toContainText('2 Acres 14 Guntas');
  // And the map's own labels follow the switch, or the table and the ground
  // disagree about the same edge.
  await expect(page.locator('.w-side')).toHaveText(['351 ft', '292 ft', '351 ft', '292 ft']);
});

test('a side pinned from its row gives both corners, to read down a phone', async ({ page }) => {
  await openMap(page, ID.parcel);
  const row = page.getByRole('button', { name: 'A → B' });

  await expect(row).toHaveAttribute('aria-pressed', 'false');
  await row.click();
  await expect(row).toHaveAttribute('aria-pressed', 'true');

  const tip = page.getByRole('dialog', { name: 'Side details' });
  await expect(tip).toContainText('Corner A');
  await expect(tip).toContainText('15.741000, 79.269400');
  await expect(tip).toContainText('Corner B');
  await expect(tip).toContainText('15.741000, 79.270400');
  // Both units, always, in the tip — a toggle the surveyor on the other end of
  // the phone cannot see is no use to them.
  await expect(tip).toContainText('107 m · 351 ft · E');   // …and the way it runs
  await expect(tip.getByRole('button', { name: 'Copy both' })).toBeVisible();

  // The same row is also how you let go of it. A pin with only one way out is
  // how a tip ends up covering the map it is about.
  await row.click();
  await expect(row).toHaveAttribute('aria-pressed', 'false');
  await expect(tip).toHaveCount(0);
});

test('the tip closes on its own ×, without touching the row it came from', async ({ page }) => {
  await openMap(page, ID.parcel);
  await page.getByRole('button', { name: 'C → D' }).click();

  const tip = page.getByRole('dialog', { name: 'Side details' });
  await expect(tip).toContainText('Corner C');
  // Settle the pointer on the tip BEFORE pressing. Leaving the row fires its
  // mouseLeave, and the re-render that causes rebuilds the whole tip (see the
  // test.fail below, and MapCanvas.tsx:1486) — so a press and a release
  // delivered in the same millisecond land on two different buttons and the
  // browser reports no click at all. A hand moving a mouse cannot do that;
  // Playwright can, and does.
  await tip.getByRole('button', { name: 'Close' }).hover();
  await expect(tip).toBeVisible();
  await tip.getByRole('button', { name: 'Close' }).click();

  await expect(tip).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'C → D' })).toHaveAttribute('aria-pressed', 'false');
  // Letting go of a side is not the same as putting the measurements away.
  await expect(page.locator('.card', { hasText: 'Measurements' })).toBeVisible();
  await expect(page.locator('.w-side')).toHaveCount(4);
});

test('a side pinned from the keyboard leaves the keyboard inside the tip', async ({ page }) => {
  // DEFECT. The map is drawn BEFORE this table in the DOM, so Tab out of a
  // pinned row moves AWAY from the Copy button the pin was for; reaching it
  // means Shift+Tabbing back through the zoom cluster and the whole map. That
  // is what RecordBoundary.tsx:303-310 exists to prevent, and it does its
  // half: focus really does land on "Copy both".
  //
  // It is then thrown on the floor, one render later. The tip is drawn with
  // `dangerouslySetInnerHTML={{ __html: tip }}` — a fresh object every render
  // (MapCanvas.tsx:1486) — and React 19 diffs that prop by IDENTITY
  // (react-dom updateProperties: `propKey !== lastProp && setProp(…)`, and
  // setProp assigns innerHTML unconditionally). So EVERY re-render of the map
  // rebuilds the tip's DOM. The focus hand-off itself causes such a render:
  // focus leaving the row fires its own onBlur (RecordBoundary.tsx:1204),
  // which clears hoverSide and keyFocus. Watched from the page, the order is
  //   focusin row → focusin Copy both → tip childList +6/-6 → focus = BODY.
  // The keyboard user ends up at the top of the document, which is exactly
  // the bug the hand-off was written to fix.
  //
  // It costs more than one focus. The keyboard user cannot let go again
  // either: Escape is caught on the panel (RecordBoundary.tsx:721-727), and a
  // keydown that starts at <body> never passes through it — so after pinning a
  // side from the keyboard, the tip can be dismissed only with a mouse. And
  // any click whose press and release straddle one of these rebuilds is
  // swallowed outright, because the two land on different nodes.
  //
  // Owed: a stable html prop — hold `{__html}` in a memo or set innerHTML from
  // a ref only when the string actually changes — so the tip's DOM survives a
  // render that has nothing to say about it.
  test.fail();
  await openMap(page, ID.parcel);
  const row = page.getByRole('button', { name: 'A → B' });

  await row.focus();
  await page.keyboard.press('Enter');

  const tip = page.getByRole('dialog', { name: 'Side details' });
  await expect(tip).toBeVisible();
  // Short and explicit: a `test.fail()` that fails by TIMING OUT is reported
  // as a plain failure rather than as an expected one.
  await expect(tip.getByRole('button', { name: 'Copy both' }),
    'a keyboard pin must leave the keyboard on the button it pinned for')
    .toBeFocused({ timeout: 2_000 });
});

test('hovering a row in the table lights that side on the ground', async ({ page }) => {
  await openMap(page, ID.parcel);
  await expect(page.locator('.w-side-lit')).toHaveCount(0);

  await page.getByRole('button', { name: 'B → C' }).hover();

  // Leaflet paints these as bare SVG paths — no role, no label, nothing a
  // role-based locator can reach — so the class names are the only handle.
  await expect(page.locator('.w-side-lit')).toHaveCount(1);
  // Both ends of that side light with it, and only those two of the four.
  await expect(page.locator('.w-corner-no.active')).toHaveText(['B', 'C']);
  // A hover is a preview, not a selection: no tip, and nothing pinned.
  await expect(page.getByRole('dialog', { name: 'Side details' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'B → C' })).toHaveAttribute('aria-pressed', 'false');

  await page.getByRole('heading', { name: 'Map & boundary' }).hover();
  await expect(page.locator('.w-side-lit')).toHaveCount(0);
});

test('Escape lets go of a pinned side and puts focus back on its row', async ({ page }) => {
  await openMap(page, ID.parcel);
  const row = page.getByRole('button', { name: 'B → C' });

  await row.click();
  await expect(page.getByRole('dialog', { name: 'Side details' })).toBeVisible();

  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'Side details' })).toHaveCount(0);
  await expect(row).toHaveAttribute('aria-pressed', 'false');
});

test('a corner picked on the map answers about that corner and nothing else', async ({ page }) => {
  await openMap(page, ID.parcel);
  await expect(page.locator('path.w-ring')).toHaveCount(1);

  // The span, not the marker. Leaflet's divIcon is given no iconSize here
  // (MapCanvas.tsx textIcon), so the <div> that carries the click handler
  // measures 0x0 and only the <span> inside it has a box to aim at.
  await page.locator('.w-corner-no span').first().click({ force: true });
  const tip = page.getByRole('dialog', { name: 'Side details' });
  await expect(tip).toContainText('Corner A');
  await expect(tip).toContainText('15.741000, 79.269400');
  // A corner is one point. The side tip's second corner has no business here.
  await expect(tip).not.toContainText('Corner B');
  await expect(tip.getByRole('button', { name: 'Copy', exact: true })).toBeVisible();
  await expect(tip.getByRole('link', { name: /Navigate/ })).toBeVisible();
});

test('Copy both puts the whole side on the clipboard, and says it did', async ({ page }) => {
  // The reason the tip exists: reading a boundary down a phone to a surveyor
  // standing in the field. If the button lies, the number they write down is
  // whatever was on the clipboard before.
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  await openMap(page, ID.parcel);

  await page.getByRole('button', { name: 'A → B' }).click();
  const both = page.getByRole('dialog', { name: 'Side details' })
    .getByRole('button', { name: 'Copy both' });
  // Pointer first, then press — the tip is rebuilt when the pointer leaves the
  // row (see the test.fail above), and a press and release delivered in the
  // same millisecond straddle the rebuild and produce no click.
  await both.hover();
  await expect(both).toBeVisible();
  await both.click();

  await expect(page.locator('.plot').getByText('Coordinates copied.')).toBeVisible();
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  expect(copied).toBe(
    'Sy 214/2 corner A: 15.741000, 79.269400\n'
    + 'Sy 214/2 corner B: 15.741000, 79.270400\n'
    + 'between: 107 m (351 ft) E');
});

test('a corner copies as one line, naming the record it belongs to', async ({ page }) => {
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  await openMap(page, ID.parcel);
  await expect(page.locator('path.w-ring')).toHaveCount(1);

  await page.locator('.w-corner-no span').first().click({ force: true });
  await page.getByRole('dialog', { name: 'Side details' })
    .getByRole('button', { name: 'Copy', exact: true }).click();

  await expect(page.locator('.plot').getByText('Coordinates copied.')).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText()))
    .toBe('Sy 214/2 corner A: 15.741000, 79.269400');
});

test('an outline too small to be called guntas is measured in square metres', async ({ page, world }) => {
  // An 8 m square — a well head, a pump shed, or a tracing gone wrong. Under a
  // gunta (101 m²) "0 Acres 0 Guntas" is the screen refusing to say what it
  // measured, so the unit changes (RecordBoundary.tsx:1141-1143).
  world.set('boundary', boundary({
    ring: [15.7410, 79.2694, 15.7410, 79.2694747, 15.740928, 79.2694747, 15.740928, 79.2694],
    marks: [],
  }));
  await openMap(page, ID.parcel);
  const card = page.locator('.card', { hasText: 'Measurements' });

  // "0 Acres 0 Guntas" is the screen refusing to say what it just measured.
  await expect(kv(card, 'Area')).toHaveText('64 m²');
  await expect(kv(card, 'Around')).toHaveText('32 m');
  await expect(kv(card, 'Sides')).toHaveText('4');
  // The record still says what it says: the comparison is not the measurement.
  await expect(kv(card, 'On record')).toHaveText('4 acres 12 guntas');
});

test('hiding the measurements takes the lengths off the map with them', async ({ page }) => {
  await openMap(page, ID.parcel);
  await expect(page.locator('.w-side')).toHaveCount(4);

  await page.getByRole('button', { name: 'Hide measurements' }).click();

  await expect(page.locator('.card', { hasText: 'Measurements' })).toHaveCount(0);
  await expect(page.locator('.w-side')).toHaveCount(0);
  // The ring itself is not a measurement and must stay.
  await expect(page.locator('path.w-ring')).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Measure', exact: true })).toHaveAttribute('aria-pressed', 'false');
});

test('a traced outline within a few percent of the record is called close, not wrong', async ({ page, world }) => {
  world.set('record', () => parcelRecord({ extent: 2.35 }));
  await openMap(page, ID.parcel);

  await expect(page.locator('.card', { hasText: 'Measurements' }))
    .toContainText(/Within \d+\.\d% of the extent on record — as close as a traced boundary gets\./);
});

test('an outline a fifth off the record is worth a look rather than an alarm', async ({ page, world }) => {
  world.set('record', () => parcelRecord({ extent: 2 }));
  await openMap(page, ID.parcel);

  await expect(page.locator('.card', { hasText: 'Measurements' })).toContainText(
    /\d+\.\d% larger than the extent on record\. A traced outline drifts by a few percent, so this is worth a look rather than an alarm\./);
});

test('an outline nowhere near the recorded extent is called a mistake', async ({ page, world }) => {
  world.set('record', () => parcelRecord({ extent: 10 }));
  await openMap(page, ID.parcel);

  await expect(page.locator('.card', { hasText: 'Measurements' })).toContainText(
    /\d+% smaller than the extent on record\. That is far too big a gap to be tracing error — either this outline is not the parcel, or the recorded extent is wrong\./);
});

// ── the basemap ────────────────────────────────────────────────────────

test('the basemap switches between street and satellite, and the caption says which', async ({ page }) => {
  await openMap(page, ID.parcel);
  const chip = page.getByRole('button', { name: 'Satellite' });

  await expect(chip).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.plot .cap')).toContainText('Esri World Imagery');

  await chip.click();
  await expect(chip).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('.plot .cap')).toContainText('OpenStreetMap');
  // The boundary is drawn on either. It is the reason most people switch.
  await expect(page.locator('path.w-ring')).toHaveCount(1);

  await chip.click();
  await expect(page.locator('.plot .cap')).toContainText('Esri World Imagery');
});

test.describe('with no basemap at all', () => {
  // An aborted tile is logged by the browser itself, so the console guard has
  // to be lifted here: those errors ARE the scenario.
  test.use({ allowConsole: true });

  test('when neither basemap will load, the screen names what failed and keeps the boundary', async ({ page }) => {
    await page.route(TILE_HOSTS, (route) => route.abort());
    await openMap(page, ID.parcel);

    const notice = page.locator('.plot p.nogeo.low');
    await expect(notice).toContainText('Satellite imagery is unavailable here. Try Street view or zoom out.');
    await expect(notice).toContainText('Your saved boundary and any drawing remain visible.');

    await page.getByRole('button', { name: 'Satellite' }).click();
    await expect(notice).toContainText('Street map tiles are unavailable. Try Satellite or check your connection.');

    // Whatever the tiles did, the record's own ring is the record's own ring.
    await expect(page.locator('path.w-ring')).toHaveCount(1);
    await expect(page.locator('.w-corner-no')).toHaveText(['A', 'B', 'C', 'D']);
  });
});

// ── the marks, and what can be done to one ─────────────────────────────

test('a mark that has been moved is flagged, and offers the position to accept', async ({ page, world }) => {
  const moved = marks();
  moved[2].state = 'moved';
  world.set('boundary', boundary({ marks: moved }));
  await openMap(page, ID.parcel);
  const card = marksCard(page);

  await expect(card.getByRole('button', { name: 'Accept new position' })).toBeVisible();
  await expect(card.getByRole('button', { name: 'Delete mark' })).toBeVisible();
  await expect(card).toContainText(
    'Deleting a mark keeps the old position in History — the FMB sheet it came from is never edited.');
  // And the map agrees with the list: the moved stone is drawn in the alarm
  // hue, and only that one. (Leaflet class names again — see above.)
  await expect(page.locator('path.w-mark.moved')).toHaveCount(1);
  await expect(page.locator('.w-mark-no.moved')).toHaveText(['3']);

  // And the same two live behind the kebab, for a mark whose row is collapsed.
  await card.getByRole('button', { name: 'Actions for West corner' }).click();
  await expect(page.getByRole('menuitem', { name: 'Accept the new position' })).toBeVisible();
});

test('accepting a moved position asks the server to accept that mark', async ({ page, world }) => {
  const moved = marks();
  moved[2].state = 'moved';
  world.set('boundary', boundary({ marks: moved }));
  await openMap(page, ID.parcel);

  await marksCard(page).getByRole('button', { name: 'Accept new position' }).click();

  await expect.poll(() => world.calls('acceptMarkPosition').length).toBe(1);
  expect(world.lastVars('acceptMarkPosition')).toMatchObject({ markId: MARK.proposed });
});

test('accepting a moved position tells the owner it worked', async ({ page, world }) => {
  // DEFECT. api.ts:855 sends `web { acceptMarkPosition(markId:$markId) }` and
  // RecordBoundary.tsx:164 reads `res.web.acceptMark` — a key that is never in
  // the reply, under any server. So every successful accept falls into the
  // failure branch and the owner is told, in red, that the stone they just
  // confirmed could not be accepted. The mark IS accepted; only the sentence
  // is wrong, which is the worst shape this bug could have.
  // Owed: read `acceptMarkPosition` (or alias the field to `acceptMark`), and
  // the screen goes quiet on success as every other write here does.
  test.fail();
  const moved = marks();
  moved[2].state = 'moved';
  world.set('boundary', boundary({ marks: moved }));
  await openMap(page, ID.parcel);

  await marksCard(page).getByRole('button', { name: 'Accept new position' }).click();
  // The refetch the successful mutation triggers is the settle signal: by the
  // time the world has seen the second read, React has already rendered
  // whatever the accept had to say.
  await expect.poll(() => world.calls('boundary').length).toBeGreaterThan(1);

  // A short timeout on purpose. A `test.fail()` that fails by TIMING OUT is
  // reported as a plain failure, so the expected failure has to arrive well
  // inside the test budget.
  await expect(mapError(page), 'a confirmed stone must not be reported as refused')
    .toHaveCount(0, { timeout: 2_000 });
});

// NOTE: while the defect above stands, this sentence is what an accept says
// whatever the server answered. It is kept because the wording is right and
// because it is the assertion that must still hold once the read is fixed.
test('an accept the server refuses says so', async ({ page, world }) => {
  const moved = marks();
  moved[2].state = 'moved';
  world.set('boundary', boundary({ marks: moved }));
  world.set('acceptMarkPosition', false);
  await openMap(page, ID.parcel);

  await marksCard(page).getByRole('button', { name: 'Accept new position' }).click();
  await expect(mapError(page)).toHaveText('That mark could not be accepted.');
});

test('deleting a mark deletes that stone and takes it off the list', async ({ page, world }) => {
  let live = marks();
  world.set('boundary', () => boundary({ marks: live }));
  world.set('deleteMark', (vars) => {
    live = live.filter((m) => m.id !== vars.markId);
    return true;
  });
  await openMap(page, ID.parcel);
  const card = marksCard(page);
  await expect(card.getByRole('button', { name: /^Actions for / })).toHaveCount(3);

  await card.getByRole('button', { name: 'Actions for South-east stone' }).click();
  await page.getByRole('menuitem', { name: 'Delete this mark' }).click();

  expect(world.lastVars('deleteMark')).toMatchObject({ markId: MARK.se });
  await expect(card.getByRole('button', { name: /^Actions for / })).toHaveCount(2);
  await expect(card).not.toContainText('South-east stone');
  await expect(mapError(page)).toHaveCount(0);
});

test('a deletion the server refuses says so, instead of pretending the stone is gone', async ({ page, world }) => {
  // The resolver answers true whatever happens, so a refusal reaches the
  // screen as `false` in the payload and nothing else. Silence here is an
  // owner who believes a stone is deleted and finds it there next time.
  world.set('deleteMark', false);
  await openMap(page, ID.parcel);

  await marksCard(page).getByRole('button', { name: 'Actions for North-east stone' }).click();
  await page.getByRole('menuitem', { name: 'Delete this mark' }).click();

  await expect(mapError(page)).toHaveText('That mark could not be deleted.');
  await expect(marksCard(page)).toContainText('North-east stone');
});

test('a deletion that is already in flight cannot be fired a second time', async ({ page, world }) => {
  world.set('deleteMark', World.slow(1200, true));
  await openMap(page, ID.parcel);
  const card = marksCard(page);

  await card.getByRole('button', { name: 'Actions for North-east stone' }).click();
  await page.getByRole('menuitem', { name: 'Delete this mark' }).click();

  // MenuItem has no disabled state to set, so the label is the only warning
  // and the handler is the only guard. Both have to hold.
  await card.getByRole('button', { name: 'Actions for North-east stone' }).click();
  const again = page.getByRole('menuitem', { name: 'Deleting…' });
  await expect(again).toBeVisible();
  await again.click();

  expect(world.calls('deleteMark')).toHaveLength(1);
  await expect.poll(() => world.calls('deleteMark').length, { timeout: 5_000 }).toBe(1);
});

test('one stone being deleted does not make every other stone say it is being deleted', async ({ page, world }) => {
  // react-query keeps `variables` after a mutation settles, so the pending
  // label was once read off `isPending` alone and every mark's menu reported
  // itself as being deleted (RecordBoundary.tsx:140-146). One owner, three
  // stones, and no way to tell which one is actually going.
  // Long enough that the whole comparison happens while the write is in
  // flight; the test is over before it lands, which is the point.
  world.set('deleteMark', World.slow(8_000, true));
  await openMap(page, ID.parcel);
  const card = marksCard(page);

  await card.getByRole('button', { name: 'Actions for North-east stone' }).click();
  await page.getByRole('menuitem', { name: 'Delete this mark' }).click();

  await card.getByRole('button', { name: 'Actions for South-east stone' }).click();
  await expect(page.getByRole('menuitem', { name: 'Delete this mark' })).toBeVisible();
  await expect(page.getByRole('menuitem', { name: 'Deleting…' })).toHaveCount(0);
  await page.keyboard.press('Escape');

  // …and the one that IS going says so.
  await card.getByRole('button', { name: 'Actions for North-east stone' }).click();
  await expect(page.getByRole('menuitem', { name: 'Deleting…' })).toBeVisible();
  expect(world.calls('deleteMark')).toHaveLength(1);
});

test('a mark is never filed without a name', async ({ page }) => {
  await openMap(page, ID.parcel);

  await page.getByRole('button', { name: 'Add boundary mark', exact: true }).click();
  await expect(page.locator('.mapsays .hint')).toHaveText(
    'Click where the stone is. It is numbered in the order marks were added, and nothing is overwritten.');
  await clickMapAt(page, 0.45, 0.45);

  const form = marksCard(page).locator('.marknote');
  await expect(form).toBeVisible();
  await expect(form.getByRole('button', { name: 'Add this mark' })).toBeDisabled();

  // Whitespace is not a name either.
  await form.locator('input').first().fill('   ');
  await expect(form.getByRole('button', { name: 'Add this mark' })).toBeDisabled();
});

test('adding a mark files the name and the note at the point that was clicked', async ({ page, world }) => {
  await openMap(page, ID.parcel);

  await page.getByRole('button', { name: 'Add boundary mark', exact: true }).click();
  await clickMapAt(page, 0.45, 0.45);

  const form = marksCard(page).locator('.marknote');
  await form.locator('input').first().fill('South-west stone');
  await form.locator('input').nth(1).fill('granite, chipped on the north face');
  await form.getByRole('button', { name: 'Add this mark' }).click();

  await expect(form).toHaveCount(0);
  await expect.poll(() => world.calls('addMark').length).toBe(1);
  const sent = world.lastVars('addMark');
  expect(sent).toMatchObject({
    recordId: ID.parcel,
    label: 'South-west stone',
    detail: 'granite, chipped on the north face',
  });
  // The click has to become a real reading on this parcel, not 0,0.
  expect(Math.abs(Number(sent.lat) - 15.7406)).toBeLessThan(0.01);
  expect(Math.abs(Number(sent.lon) - 79.2699)).toBeLessThan(0.01);
});

test('the name field files the mark on Enter, without reaching for the button', async ({ page, world }) => {
  await openMap(page, ID.parcel);

  await page.getByRole('button', { name: 'Add boundary mark', exact: true }).click();
  await clickMapAt(page, 0.45, 0.45);

  const form = marksCard(page).locator('.marknote');
  await form.locator('input').first().fill('South-west stone');
  await form.locator('input').first().press('Enter');

  await expect.poll(() => world.calls('addMark').length).toBe(1);
  expect(world.lastVars('addMark')).toMatchObject({ label: 'South-west stone', detail: '' });
  await expect(form).toHaveCount(0);
});

test('an unanswered naming form holds the map, and Cancel gives it back', async ({ page, world }) => {
  // Three tools that each reinterpret the next click on the map, and a form
  // waiting for the name of a stone that has not been filed yet. Arming one of
  // them here is how a mark gets placed while a different one is being named.
  await openMap(page, ID.parcel);

  await page.getByRole('button', { name: 'Add boundary mark', exact: true }).click();
  await clickMapAt(page, 0.45, 0.45);
  const form = marksCard(page).locator('.marknote');
  await expect(form).toBeVisible();

  for (const tool of ['Add boundary mark', 'Move the pin', 'Redraw boundary']) {
    await expect(page.getByRole('button', { name: tool, exact: true })).toBeDisabled();
  }

  await form.getByRole('button', { name: 'Cancel' }).click();

  await expect(form).toHaveCount(0);
  expect(world.calls('addMark')).toHaveLength(0);
  for (const tool of ['Add boundary mark', 'Move the pin', 'Redraw boundary']) {
    await expect(page.getByRole('button', { name: tool, exact: true })).toBeEnabled();
  }
});

test('a mark the server will not file says so and keeps the form open', async ({ page, world }) => {
  world.set('addMark', '');            // the resolver's own "refused"
  await openMap(page, ID.parcel);

  await page.getByRole('button', { name: 'Add boundary mark', exact: true }).click();
  await clickMapAt(page, 0.45, 0.45);
  const form = marksCard(page).locator('.marknote');
  await form.locator('input').first().fill('South-west stone');
  await form.getByRole('button', { name: 'Add this mark' }).click();

  await expect(mapError(page)).toHaveText('That mark could not be saved to this record.');
  await expect(form).toBeVisible();
  await expect(form.locator('input').first()).toHaveValue('South-west stone');
});

test('renaming a mark opens on what it is called now, and sends what it is called next', async ({ page, world }) => {
  await openMap(page, ID.parcel);
  const card = marksCard(page);

  await card.getByRole('button', { name: 'Actions for North-east stone' }).click();
  await page.getByRole('menuitem', { name: 'Rename or describe it' }).click();

  const form = card.locator('.marknote');
  await expect(form.locator('input').first()).toHaveValue('North-east stone');
  await expect(form.locator('input').nth(1)).toHaveValue('Granite, chipped');

  await form.locator('input').first().fill('North-east boundary stone');
  await form.getByRole('button', { name: 'Save the name' }).click();

  await expect.poll(() => world.calls('updateMark').length).toBe(1);
  expect(world.lastVars('updateMark')).toMatchObject({
    markId: MARK.ne, label: 'North-east boundary stone', detail: 'Granite, chipped',
  });
});

test('moving a mark can be cancelled, and nothing is written', async ({ page, world }) => {
  await openMap(page, ID.parcel);

  await marksCard(page).getByRole('button', { name: 'Actions for North-east stone' }).click();
  await page.getByRole('menuitem', { name: 'Move this mark', exact: true }).click();

  await expect(page.locator('.mapsays .hint')).toHaveText(
    'Click the corrected location for North-east stone. Its previous position is kept.');

  await page.locator('.editbar').getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(page.locator('.editbar')).toHaveCount(0);
  expect(world.calls('moveMark')).toHaveLength(0);

  // Disarmed: the next click on the map is a pan, not a correction. Re-arming
  // and clicking again is what proves it — one write in total, not two.
  await clickMapAt(page, 0.6, 0.4);
  await marksCard(page).getByRole('button', { name: 'Actions for North-east stone' }).click();
  await page.getByRole('menuitem', { name: 'Move this mark', exact: true }).click();
  await clickMapAt(page, 0.55, 0.4);

  await expect.poll(() => world.calls('moveMark').length).toBe(1);
});

test('moving a mark saves the corrected position against that stone', async ({ page, world }) => {
  await openMap(page, ID.parcel);

  await marksCard(page).getByRole('button', { name: 'Actions for North-east stone' }).click();
  await page.getByRole('menuitem', { name: 'Move this mark', exact: true }).click();
  await clickMapAt(page, 0.6, 0.45);

  await expect.poll(() => world.calls('moveMark').length).toBe(1);
  const sent = world.lastVars('moveMark');
  expect(sent).toMatchObject({ markId: MARK.ne });
  expect(Math.abs(Number(sent.lat) - 15.7406)).toBeLessThan(0.01);
  // And the bar closes itself, or the next click moves it again by accident.
  await expect(page.locator('.editbar')).toHaveCount(0);
});

test('a move the server refuses says so and leaves the mark where it was', async ({ page, world }) => {
  world.set('moveMark', false);
  await openMap(page, ID.parcel);

  await marksCard(page).getByRole('button', { name: 'Actions for North-east stone' }).click();
  await page.getByRole('menuitem', { name: 'Move this mark', exact: true }).click();
  await clickMapAt(page, 0.6, 0.45);

  await expect(mapError(page)).toHaveText('That mark could not be moved.');
});

test('a surveyed record with no stones offers one mark per corner', async ({ page, world }) => {
  // The KML already named these corners — that is what its coordinate list
  // is. Clicking four of them back in is asking for work the file already did.
  world.set('boundary', boundary({ marks: [] }));
  await openMap(page, ID.parcel);
  const card = marksCard(page);

  await expect(card).toContainText(
    'No marks recorded. A mark is a numbered corner with its own photos and its own history — add one, or order a survey and the surveyor sets them.');

  await card.getByRole('button', { name: 'Add a mark at each of the 4 corners' }).click();
  await expect.poll(() => world.calls('marksFromBoundary').length).toBe(1);
  expect(world.lastVars('marksFromBoundary')).toMatchObject({ recordId: ID.parcel });
});

test('a refused "mark every corner" says so, instead of doing nothing in silence', async ({ page, world }) => {
  // DEFECT. RecordBoundary.tsx:1329-1332 mutates with an onError handler and
  // never reads the answer. The resolver returns a COUNT (web360.py:4467) and
  // returns 0 for every refusal it has: the record is not the caller's, it
  // already has marks, or its ring is not a ring. So a refused click looks
  // exactly like a successful one — the menu closes, the list refetches
  // unchanged, and the button that was just pressed is still sitting there.
  // Owed: read the count the way every other write on this screen reads its
  // answer, and say "Those marks could not be added." when it is 0.
  test.fail();
  world.set('boundary', boundary({ marks: [] }));
  world.set('marksFromBoundary', 0);
  await openMap(page, ID.parcel);

  await marksCard(page).getByRole('button', { name: 'Add a mark at each of the 4 corners' }).click();
  await expect.poll(() => world.calls('marksFromBoundary').length).toBe(1);
  // The refetch the mutation triggers is the settle signal: once the world has
  // seen the second read, whatever the screen had to say has been rendered.
  await expect.poll(() => world.calls('boundary').length).toBeGreaterThan(1);

  // A short timeout on purpose: a `test.fail()` that fails by TIMING OUT is
  // reported as a plain failure rather than as an expected one.
  await expect(mapError(page), 'a refused write must say so on this screen')
    .toBeVisible({ timeout: 2_000 });
});

test('a record whose stones already exist is not offered them a second time', async ({ page }) => {
  await openMap(page, ID.parcel);
  await expect(marksCard(page).getByRole('button', { name: /Add a mark at each/ })).toHaveCount(0);
});

test('stones nowhere near the boundary are called out, with the distance', async ({ page, world }) => {
  // Four stones in the list and none of them on the map is a contradiction
  // the screen used to keep to itself.
  const stray = marks().map((m) => ({ ...m, lat: 17.4948, lon: 78.3996 }));   // Hyderabad
  world.set('boundary', boundary({ marks: stray }));
  await openMap(page, ID.parcel);

  const card = marksCard(page);
  await expect(card).toContainText('None of these 3 stones is near the boundary on this record');
  await expect(card).toContainText('so they are off the map you are looking at');
  await expect(card).toContainText(/\d[\d,.]* km away/);
});

test('one stray stone among three is counted as one, not as all of them', async ({ page, world }) => {
  const mixed = marks();
  mixed[2] = { ...mixed[2], lat: 17.4948, lon: 78.3996 };
  world.set('boundary', boundary({ marks: mixed }));
  await openMap(page, ID.parcel);

  await expect(marksCard(page)).toContainText('1 of these 3 stones is not near the boundary');
});

test("a mark's menu opens the record's own gallery, and says that is what it is", async ({ page }) => {
  await openMap(page, ID.parcel);

  await marksCard(page).getByRole('button', { name: 'Actions for North-east stone' }).click();
  await page.getByRole('menuitem', { name: "Open the record's photos" }).click();

  await expect(page).toHaveURL(new RegExp(`/app/records/${ID.parcel}/photos$`));
});

// ── the pin ────────────────────────────────────────────────────────────

test('an unarmed click on the map moves nothing', async ({ page, world }) => {
  await openMap(page, ID.parcel);
  const arm = page.getByRole('button', { name: 'Move the pin' });
  await expect(arm).toHaveAttribute('aria-pressed', 'false');

  // Idle, a click on the map pans and saves nothing…
  await clickMapAt(page, 0.4, 0.4);
  // …and the proof is that the NEXT click, armed, produces exactly one write.
  // Asserting "nothing happened" straight after the first click would pass
  // just as well against an app that had not got round to it yet.
  await arm.click();
  await clickMapAt(page, 0.5, 0.45);

  await expect.poll(() => world.calls('setPin').length).toBe(1);
  expect(world.calls('addMark')).toHaveLength(0);
  expect(world.calls('setBoundary')).toHaveLength(0);
});

test('Move the pin arms the map, and the next click becomes the pin', async ({ page, world }) => {
  await openMap(page, ID.parcel);
  const arm = page.getByRole('button', { name: 'Move the pin' });

  await arm.click();
  await expect(page.getByRole('button', { name: 'Click the map — or cancel' })).toBeVisible();
  await expect(page.locator('.plot .map.picking')).toBeVisible();
  await expect(page.locator('.mapsays .hint')).toHaveText(
    'Click where the land actually is — or use your current location if you are standing on it.');

  await clickMapAt(page, 0.5, 0.45);

  await expect.poll(() => world.calls('setPin').length).toBe(1);
  expect(world.lastVars('setPin')).toMatchObject({ recordId: ID.parcel });
  // Disarmed once it lands, or the next click moves it by accident.
  await expect(page.locator('.plot .map.picking')).toHaveCount(0);
});

test('a pin the server refuses to save says so', async ({ page, world }) => {
  world.set('setPin', false);
  await openMap(page, ID.parcel);

  await page.getByRole('button', { name: 'Move the pin' }).click();
  await clickMapAt(page, 0.5, 0.45);

  await expect(mapError(page)).toHaveText('That pin could not be saved to this record.');
});

test('a pin that disagrees with the boundary is named, and can be moved onto it', async ({ page, world }) => {
  world.set('boundary', boundary({ lat: 17.4948, lon: 78.3996 }));      // Hyderabad
  await openMap(page, ID.parcel);
  const card = page.locator('.card', { hasText: 'LOCATION' });

  await expect(card).toContainText(/The pin is [\d,]+ km from the boundary drawn on this record\./);
  await expect(card).toContainText('One of the two is wrong.');

  await card.getByRole('button', { name: 'Move the pin onto the boundary' }).click();

  await expect.poll(() => world.calls('setPin').length).toBe(1);
  const sent = world.lastVars('setPin');
  expect(Math.abs(Number(sent.lat) - RING_CENTRE.lat)).toBeLessThan(0.001);
  expect(Math.abs(Number(sent.lon) - RING_CENTRE.lon)).toBeLessThan(0.001);
});

test('a browser that will not share a location says so rather than hanging', async ({ page, world }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'geolocation', { get: () => undefined });
  });
  await openMap(page, ID.parcel);

  await page.getByRole('button', { name: 'Move the pin' }).click();
  await page.getByRole('button', { name: 'Use my current location' }).click();

  await expect(mapError(page)).toHaveText('This browser will not share a location.');
  expect(world.calls('setPin')).toHaveLength(0);
});

test('a refused location permission is reported as a refusal, not as a fault', async ({ page, world }) => {
  // Nothing is granted, so the browser denies it — which is an ordinary answer
  // from an owner who does not want to share where they are standing, and must
  // not read like something broke (RecordBoundary.tsx:873-880).
  await openMap(page, ID.parcel);

  await page.getByRole('button', { name: 'Move the pin' }).click();
  await page.getByRole('button', { name: 'Use my current location' }).click();

  await expect(mapError(page)).toHaveText(
    'Location permission was refused, so the pin was not moved.');
  expect(world.calls('setPin')).toHaveLength(0);
  // Still armed: clicking the map is the other way to do this, and the refusal
  // must not take it away.
  await expect(page.locator('.plot .map.picking')).toBeVisible();
});

test('the phone standing on the land can set the pin itself', async ({ page, world }) => {
  await page.context().grantPermissions(['geolocation']);
  await page.context().setGeolocation({ latitude: 15.74055, longitude: 79.26975 });
  await openMap(page, ID.parcel);

  await page.getByRole('button', { name: 'Move the pin' }).click();
  await page.getByRole('button', { name: 'Use my current location' }).click();

  await expect.poll(() => world.calls('setPin').length).toBe(1);
  expect(world.lastVars('setPin')).toMatchObject({
    recordId: ID.parcel, lat: 15.74055, lon: 79.26975,
  });
});

// ── drawing a boundary ─────────────────────────────────────────────────

test('Redraw opens on the corners already saved, and Clear empties the draft', async ({ page }) => {
  await openMap(page, ID.parcel);

  await page.getByRole('button', { name: 'Redraw boundary' }).click();
  const bar = page.locator('.editbar');
  // The whole summary, not just the count: the draft opens on the ring already
  // on file, so it has to measure the same 2⅓ acres the Measurements card does
  // — 2.36 ac to two decimals, 2 acres 14 guntas rounded to whole guntas.
  await expect(bar.locator('.num')).toHaveText('4 corners · 2.36 ac · 392 m around');
  await expect(page.locator('.mapsays .hint')).toHaveText(
    'Click each corner in order. Drag a corner to adjust it, then save the outline.');

  await bar.getByRole('button', { name: 'Undo corner' }).click();
  await expect(bar).toContainText('3 corners');

  await bar.getByRole('button', { name: 'Clear' }).click();
  await expect(bar).toContainText('0 corners');
  await expect(bar.getByRole('button', { name: 'Save boundary' })).toBeDisabled();
  await expect(bar.getByRole('button', { name: 'Undo corner' })).toBeDisabled();
});

test('a drawn boundary is refused until three corners enclose something', async ({ page }) => {
  await openMap(page, ID.plot);

  await page.getByRole('button', { name: 'Draw boundary', exact: true }).click();
  const bar = page.locator('.editbar');
  await expect(bar.getByRole('button', { name: 'Save boundary' })).toBeDisabled();
  // Nothing on file, so there is nothing to remove — the destructive button is
  // gated on a saved ring (RecordBoundary.tsx:913) and must not appear here.
  await expect(bar.getByRole('button', { name: 'Remove saved boundary' })).toHaveCount(0);

  await clickMapAt(page, 0.35, 0.35);
  await expect(bar).toContainText('1 corner');
  await clickMapAt(page, 0.6, 0.35);
  await expect(bar).toContainText('2 corners');
  await expect(bar.getByRole('button', { name: 'Save boundary' })).toBeDisabled();

  await clickMapAt(page, 0.6, 0.6);
  await expect(bar).toContainText('3 corners');
  await expect(bar.getByRole('button', { name: 'Save boundary' })).toBeEnabled();
});

test('a boundary that crosses itself is named and refused', async ({ page, world }) => {
  await openMap(page, ID.plot);

  await page.getByRole('button', { name: 'Draw boundary', exact: true }).click();
  // A bowtie: the sides cross, which is not a shape any land has.
  for (const [fx, fy] of [[0.3, 0.3], [0.7, 0.3], [0.3, 0.7], [0.7, 0.7]] as const) {
    await clickMapAt(page, fx, fy);
  }

  await expect(page.locator('.mapsays')).toContainText(
    'The boundary crosses itself. Move the corners so the sides do not cross.');
  await expect(page.locator('.editbar').getByRole('button', { name: 'Save boundary' })).toBeDisabled();
  expect(world.calls('setBoundary')).toHaveLength(0);
});

test('a boundary drawn on the map is saved against this record, corner for corner', async ({ page, world }) => {
  await openMap(page, ID.plot);

  await page.getByRole('button', { name: 'Draw boundary', exact: true }).click();
  for (const [fx, fy] of [[0.35, 0.35], [0.6, 0.35], [0.6, 0.6], [0.35, 0.6]] as const) {
    await clickMapAt(page, fx, fy);
  }
  const bar = page.locator('.editbar');
  await expect(bar).toContainText('4 corners');
  // The draft is dashed and numbered, and never counts as a surveyed ring.
  await expect(page.locator('path.w-draft-dot')).toHaveCount(4);
  await expect(page.locator('path.w-ring')).toHaveCount(0);

  await bar.getByRole('button', { name: 'Save boundary' }).click();

  await expect.poll(() => world.calls('setBoundary').length).toBe(1);
  const sent = world.lastVars('setBoundary');
  expect(sent).toMatchObject({ recordId: ID.plot });
  expect((sent.ring as number[]).length, 'four corners is eight numbers').toBe(8);
  // Saved, the bar goes away — the header holds the actions that start a job
  // and the bar holds only the ones that finish it.
  await expect(page.locator('.editbar')).toHaveCount(0);
});

test('an arrow key walks a drawn corner, and the saved ring is the walked one', async ({ page, world }) => {
  // The handles carry Leaflet's keyboard affordance (MapCanvas.tsx:1420-1437)
  // and it is the only way to adjust a corner without a mouse. Redraw opens on
  // the four corners already on file, so where each one started is known to
  // six decimals and where it ends up can be checked rather than eyeballed.
  await openMap(page, ID.parcel);
  await page.getByRole('button', { name: 'Redraw boundary' }).click();
  await expect(page.locator('.editbar')).toContainText('4 corners');

  // Corner 1 of the draft — a 36px handle numbered by its own <span>, which is
  // where its accessible name comes from.
  const handle = page.getByRole('button', { name: '1', exact: true });
  await handle.focus();
  for (let i = 0; i < 5; i++) await page.keyboard.press('Shift+ArrowRight');

  await page.locator('.editbar').getByRole('button', { name: 'Save boundary' }).click();
  await expect.poll(() => world.calls('setBoundary').length).toBe(1);

  const ring = world.lastVars('setBoundary').ring as number[];
  expect(ring).toHaveLength(8);
  // East, along its own latitude: the walked corner and nothing else.
  expect(ring[0]).toBeCloseTo(RING[0], 5);
  expect(ring[1], 'the nudged corner moved east').toBeGreaterThan(RING[1] + 0.00002);
  expect(ring.slice(2)).toEqual(RING.slice(2));
});

test('a save in flight says so, and cannot be sent a second time', async ({ page, world }) => {
  world.set('setBoundary', World.slow(4_000, true));
  await openMap(page, ID.plot);

  await page.getByRole('button', { name: 'Draw boundary', exact: true }).click();
  for (const [fx, fy] of [[0.35, 0.35], [0.6, 0.35], [0.6, 0.6]] as const) {
    await clickMapAt(page, fx, fy);
  }
  const bar = page.locator('.editbar');
  const save = bar.getByRole('button', { name: 'Save boundary' });
  await save.click();

  // The bar says what is happening, and everything that could contradict it is
  // shut: a second Save, and the Cancel that would drop the draft mid-write.
  await expect(bar).toContainText('Saving the boundary…');
  await expect(bar.getByRole('button', { name: 'Saving…' })).toBeDisabled();
  await expect(bar.getByRole('button', { name: 'Cancel', exact: true })).toBeDisabled();

  await expect(bar).toHaveCount(0, { timeout: 15_000 });
  expect(world.calls('setBoundary')).toHaveLength(1);
});

test('a boundary the server refuses says so and keeps the draft on screen', async ({ page, world }) => {
  world.set('setBoundary', false);
  await openMap(page, ID.plot);

  await page.getByRole('button', { name: 'Draw boundary', exact: true }).click();
  for (const [fx, fy] of [[0.35, 0.35], [0.6, 0.35], [0.6, 0.6]] as const) {
    await clickMapAt(page, fx, fy);
  }
  await page.locator('.editbar').getByRole('button', { name: 'Save boundary' }).click();

  await expect(mapError(page)).toHaveText('That boundary could not be saved to this record.');
  await expect(page.locator('.editbar')).toContainText('3 corners');
});

test('Escape gets out of drawing without saving anything', async ({ page, world }) => {
  await openMap(page, ID.parcel);

  await page.getByRole('button', { name: 'Redraw boundary' }).click();
  await expect(page.locator('.editbar')).toBeVisible();

  await page.keyboard.press('Escape');
  await expect(page.locator('.editbar')).toHaveCount(0);
  expect(world.calls('setBoundary')).toHaveLength(0);
  // The saved ring is still the saved ring.
  await expect(page.locator('path.w-ring')).toHaveCount(1);
});

test('removing a saved boundary asks a second time before it wipes it', async ({ page, world }) => {
  // DEFECT. RecordBoundary.tsx:913-919 puts "Remove saved boundary" in the
  // draw bar and wires it straight to saveDraft([], …) — one click and the
  // surveyed ring is gone. The server does not soften it either: web360.py
  // set_boundary clears the column outright, and nothing keeps the old ring
  // the way a deleted MARK keeps its position in History (which is the
  // screen's own stated reason a destructive action may sit on the page at
  // all, RecordBoundary.tsx:1-6).
  // Owed: a second deliberate confirmation — the Dialog this module already
  // has — naming what is about to be lost, before setBoundary is sent.
  test.fail();
  await openMap(page, ID.parcel);

  await page.getByRole('button', { name: 'Redraw boundary' }).click();
  await page.locator('.editbar').getByRole('button', { name: 'Remove saved boundary' }).click();

  // Short timeout on purpose: a `test.fail()` that fails by timing out is
  // reported as a plain failure rather than as an expected one.
  await expect(page.getByRole('dialog'),
    'wiping a surveyed ring must be confirmed, not done on one click')
    .toBeVisible({ timeout: 3_000 });
  expect(world.calls('setBoundary')).toHaveLength(0);
});

// ── the hand-off from an order ─────────────────────────────────────────

/** The round trip the order flow composes when a service needs corners the
 *  record does not have (orderFlow.ts:297-300): `draw=1` to arm the tool on
 *  arrival, and `back=` naming the half-composed order to come back to. Built
 *  here the way the app builds it — the same two params, the same encoding —
 *  so a change to either half surfaces as a failure rather than as a test that
 *  only agrees with itself. */
const orderStep = (id: string) => `/app/records/${id}/order?service=survey&step=pick`;
const handOff = (id: string) => `draw=1&back=${encodeURIComponent(orderStep(id))}`;

/** openMap, with the order's params on the URL. */
async function openMapWith(page: Page, id: string, query: string): Promise<void> {
  await page.goto(`/app/records/${id}/map?${query}`);
  await expect(page.locator('.leaflet-container')).toBeVisible({ timeout: 40_000 });
}

test('an order that needs corners arms the drawing tool on the corners already on file', async ({ page, world }) => {
  // What the order flow promises when it sends someone here is "go and draw
  // it, then come back". Landing on a read-only map and having to find
  // "Redraw boundary" for themselves would make that hand-off a fetch quest,
  // which is the whole of what RecordBoundary.tsx:605-636 exists to prevent.
  await openMapWith(page, ID.parcel, handOff(ID.parcel));

  await expect(page.getByRole('button', { name: 'Drawing — or cancel' }))
    .toHaveAttribute('aria-pressed', 'true');
  // And on this record's OWN four corners. That is why the arming waits for
  // the boundary to land instead of firing on the first render: `ring` is
  // still empty then, and an owner who already has an outline would be handed
  // a blank draft and asked to trace it again from scratch.
  await expect(page.locator('.editbar .num')).toHaveText('4 corners · 2.36 ac · 392 m around');
  await expect(page.locator('.mapsays .hint')).toHaveText(
    'Click each corner in order. Drag a corner to adjust it, then save the outline.');
  // Arriving armed is not the same as arriving and writing.
  expect(world.calls('setBoundary')).toHaveLength(0);
});

test('a map opened without ?draw=1 arms nothing, return address or not', async ({ page, world }) => {
  // `back=` on its own is not an instruction to start drawing. A link
  // carrying only the return address must leave an owner looking at the ring
  // they came to look at, rather than dropped into an edit of it they never
  // asked for and may not notice they are in.
  await openMapWith(page, ID.parcel, `back=${encodeURIComponent(orderStep(ID.parcel))}`);
  await expect(page.locator('path.w-ring')).toHaveCount(1);

  await expect(page.locator('.editbar')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Redraw boundary' }))
    .toHaveAttribute('aria-pressed', 'false');
  expect(world.calls('setBoundary')).toHaveLength(0);
});

test('a corner taken off the draft is not put back when the record is read again', async ({ page, world }) => {
  // `draw=1` stays on the URL for the whole visit, so what makes the arming
  // happen once is a ref and nothing else (RecordBoundary.tsx:630-636). What
  // makes that load-bearing is a SECOND read of the boundary: every write on
  // this screen invalidates the query (api.ts:688), the answer comes back a
  // different object, and the arming effect runs again on it. Re-armed,
  // beginDrawing re-seeds the draft from the saved ring — so the corner the
  // owner had just taken off would silently come back, and every corner they
  // had placed since arriving would be thrown away without a word.
  let live = marks();
  world.set('boundary', () => boundary({ marks: live }));
  world.set('deleteMark', (vars) => {
    live = live.filter((m) => m.id !== vars.markId);
    return true;
  });
  await openMapWith(page, ID.parcel, handOff(ID.parcel));
  const bar = page.locator('.editbar');
  await expect(bar).toContainText('4 corners');

  await bar.getByRole('button', { name: 'Undo corner' }).click();
  await expect(bar).toContainText('3 corners');

  // A write made from the card beside the map, purely for the re-read it
  // forces — the map itself has nothing to press mid-draft that reads again.
  await marksCard(page).getByRole('button', { name: 'Actions for South-east stone' }).click();
  await page.getByRole('menuitem', { name: 'Delete this mark' }).click();
  await expect(marksCard(page).getByRole('button', { name: /^Actions for / })).toHaveCount(2);
  await expect.poll(() => world.calls('boundary').length).toBeGreaterThan(1);

  // Still three, and still drawing. The draft belongs to the owner, and the
  // record being read again is not permission to throw it away.
  await expect(bar).toContainText('3 corners');
  await expect(page.getByRole('button', { name: 'Drawing — or cancel' }))
    .toHaveAttribute('aria-pressed', 'true');
});

test('a boundary drawn for an order hands the owner back to the order they left', async ({ page, world }) => {
  await openMapWith(page, ID.plot, handOff(ID.plot));
  const bar = page.locator('.editbar');
  await expect(bar).toContainText('0 corners');

  for (const [fx, fy] of [[0.35, 0.35], [0.6, 0.35], [0.6, 0.6], [0.35, 0.6]] as const) {
    await clickMapAt(page, fx, fy);
  }
  await expect(bar).toContainText('4 corners');
  await bar.getByRole('button', { name: 'Save boundary' }).click();

  // Saved first — the trip back is only worth anything if the corners it was
  // for are on the record.
  await expect.poll(() => world.calls('setBoundary').length).toBe(1);
  expect((world.lastVars('setBoundary').ring as number[]).length,
    'four corners is eight numbers').toBe(8);

  // Back to the step the order was left on, not to the record's front page and
  // not to a fresh order.
  await expect(page).toHaveURL(
    new RegExp(`/app/records/${ID.plot}/order\\?service=survey&step=pick$`));
  await expect(page.getByRole('heading', { name: 'What do you want done on this land?' }))
    .toBeVisible();
  // …with the service still chosen, so the errand cost the owner nothing but
  // the drawing they came to do.
  await expect(page.getByRole('button', { name: /Boundary re-survey/ }))
    .toHaveAttribute('aria-pressed', 'true');
});

test('withdrawing a boundary keeps the owner on the map, not back in an order with nothing to send', async ({ page, world }) => {
  // This is what the corner count at RecordBoundary.tsx:244 is for, and it is
  // the reason a `back=` cannot simply be followed on every success: "Remove
  // saved boundary" is the SAME saveDraft, called with an empty ring. Navigate
  // on that and withdrawing an outline hands the owner straight back to their
  // half-composed survey order exactly as though they had just drawn one — and
  // that order then goes out against a record with no boundary left to send.
  //
  // One click is all it takes today; if the second confirmation owed above
  // ("removing a saved boundary asks a second time") ships, this test gains
  // that step and keeps the same guarantee.
  await openMapWith(page, ID.parcel, handOff(ID.parcel));
  const bar = page.locator('.editbar');
  await expect(bar).toContainText('4 corners');

  await bar.getByRole('button', { name: 'Remove saved boundary' }).click();

  await expect.poll(() => world.calls('setBoundary').length).toBe(1);
  expect(world.lastVars('setBoundary')).toMatchObject({ recordId: ID.parcel });
  expect(world.lastVars('setBoundary').ring,
    'removing a boundary is an empty ring, which is exactly what must not travel').toEqual([]);
  // The bar closing is the settle signal: stopEditing() runs in the same
  // success path the navigation would have run in, immediately before it.
  await expect(bar).toHaveCount(0);

  await expect(page).toHaveURL(new RegExp(`/app/records/${ID.parcel}/map\\?draw=1&back=`));
  await expect(page.getByRole('heading', { name: 'Map & boundary' })).toBeVisible();
});

test('a back= pointing off this app is ignored rather than followed', async ({ page, world }) => {
  // `back` is whatever the URL says, and an order link is a thing people paste
  // to each other. Followed blind, a saved boundary would walk the owner off
  // this app mid-order and onto whatever host the link named — which is free
  // to dress as this one and ask them to sign in again.
  await openMapWith(page, ID.parcel,
    `draw=1&back=${encodeURIComponent('https://evil.example.com/app/records/x/order')}`);
  await page.locator('.editbar').getByRole('button', { name: 'Save boundary' }).click();

  await expect.poll(() => world.calls('setBoundary').length).toBe(1);
  await expect(page.locator('.editbar')).toHaveCount(0);
  await expect(page).toHaveURL(new RegExp(`/app/records/${ID.parcel}/map\\?draw=1`));

  // And again protocol-relative, which is the shape that gets past a guard
  // written as "does it start with a slash" — //host/path is a different
  // origin, not a path on this one.
  await openMapWith(page, ID.parcel,
    `draw=1&back=${encodeURIComponent('//evil.example.com/app/records/x/order')}`);
  await page.locator('.editbar').getByRole('button', { name: 'Save boundary' }).click();

  await expect.poll(() => world.calls('setBoundary').length).toBe(2);
  await expect(page.locator('.editbar')).toHaveCount(0);
  await expect(page).toHaveURL(new RegExp(`/app/records/${ID.parcel}/map\\?draw=1`));
});

// ── a file the owner already has ───────────────────────────────────────

/** A square in Konakalamitla, written the way every mapping tool writes one:
 *  longitude first, ring closed. */
const GEOJSON = JSON.stringify({
  type: 'Feature',
  properties: { name: 'Sy 88' },
  geometry: {
    type: 'Polygon',
    coordinates: [[
      [79.2650, 15.7350], [79.2660, 15.7350], [79.2660, 15.7342], [79.2650, 15.7342],
      [79.2650, 15.7350],
    ]],
  },
});

test('a GeoJSON the owner already has previews before it becomes the boundary', async ({ page, world }) => {
  await openMap(page, ID.plot);

  const chooser = page.waitForEvent('filechooser');
  await page.locator('.pagehead').getByRole('button', { name: 'Import KML / GeoJSON' }).click();
  await (await chooser).setFiles({
    name: 'corners.geojson', mimeType: 'application/geo+json', buffer: Buffer.from(GEOJSON),
  });

  await expect(page.locator('.mapsays .hint')).toHaveText(
    'Previewing corners.geojson. Check the outline, then save it to this record.');
  await expect(page.locator('.editbar')).toContainText('4 corners');
  // Nothing is written by looking at it.
  expect(world.calls('setBoundary')).toHaveLength(0);

  await page.locator('.editbar').getByRole('button', { name: 'Save boundary' }).click();
  await expect.poll(() => world.calls('setBoundary').length).toBe(1);
  // GeoJSON is longitude first and our rings are [lat, lon]. Read the wrong
  // way round this parcel lands in the Barents Sea.
  const ring = world.lastVars('setBoundary').ring as number[];
  expect(ring).toEqual([15.735, 79.265, 15.735, 79.266, 15.7342, 79.266, 15.7342, 79.265]);
});

/** The same square as a surveyor's GPS writes it: a KML Placemark, lon,lat,alt
 *  triples, the ring closed. This is the file the primary button is named for
 *  and the one the sheet card tells an owner to upload. */
const KML = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2"><Document><Placemark>
  <name>Sy 88 corners</name>
  <Polygon><outerBoundaryIs><LinearRing><coordinates>
    79.2670,15.7330,0 79.2682,15.7330,0 79.2682,15.7321,0 79.2670,15.7321,0 79.2670,15.7330,0
  </coordinates></LinearRing></outerBoundaryIs></Polygon>
</Placemark></Document></kml>`;

test('the KML a surveyor sent becomes the boundary, corner for corner', async ({ page, world }) => {
  await openMap(page, ID.plot);

  const chooser = page.waitForEvent('filechooser');
  await page.locator('.pagehead').getByRole('button', { name: 'Import KML / GeoJSON' }).click();
  await (await chooser).setFiles({
    name: 'sy-88.kml',
    mimeType: 'application/vnd.google-earth.kml+xml',
    buffer: Buffer.from(KML),
  });

  await expect(page.locator('.mapsays .hint')).toHaveText(
    'Previewing sy-88.kml. Check the outline, then save it to this record.');
  await expect(page.locator('.editbar')).toContainText('4 corners');
  await expect(page.locator('path.w-draft-dot')).toHaveCount(4);
  expect(world.calls('setBoundary')).toHaveLength(0);

  await page.locator('.editbar').getByRole('button', { name: 'Save boundary' }).click();
  await expect.poll(() => world.calls('setBoundary').length).toBe(1);
  // KML is longitude first and carries an altitude our rings have no room for.
  // Read straight through, this parcel lands in the Barents Sea.
  expect(world.lastVars('setBoundary').ring)
    .toEqual([15.733, 79.267, 15.733, 79.2682, 15.7321, 79.2682, 15.7321, 79.267]);
});

test('a file with fewer than three corners is refused with the reason', async ({ page, world }) => {
  await openMap(page, ID.plot);

  const chooser = page.waitForEvent('filechooser');
  await page.locator('.pagehead').getByRole('button', { name: 'Import KML / GeoJSON' }).click();
  await (await chooser).setFiles({
    name: 'two.geojson',
    mimeType: 'application/geo+json',
    buffer: Buffer.from(JSON.stringify({
      type: 'Polygon', coordinates: [[[79.265, 15.735], [79.266, 15.735]]],
    })),
  });

  await expect(mapError(page)).toHaveText(
    'That file has fewer than three corners, so it does not enclose any land.');
  await expect(page.locator('.editbar')).toHaveCount(0);
  expect(world.calls('setBoundary')).toHaveLength(0);
});

test('the filed sheet can be replaced by a better one, from the card that names it', async ({ page, world }) => {
  // The second picker on this screen (RecordBoundary.tsx:1508-1511), on the
  // record that already has a ring — a re-survey, or the KML that arrived
  // after somebody traced the outline by hand.
  await openMap(page, ID.parcel);
  const card = page.locator('.card', { hasText: 'FMB sketch' });

  const chooser = page.waitForEvent('filechooser');
  await card.getByRole('button', { name: 'Import replacement boundary' }).click();
  await (await chooser).setFiles({
    name: 'resurvey.geojson', mimeType: 'application/geo+json', buffer: Buffer.from(GEOJSON),
  });

  const bar = page.locator('.editbar');
  await expect(page.locator('.mapsays .hint')).toHaveText(
    'Previewing resurvey.geojson. Check the outline, then save it to this record.');
  await expect(bar).toContainText('4 corners');
  // The ring on file is still the ring on file until the preview is saved.
  expect(world.calls('setBoundary')).toHaveLength(0);

  await bar.getByRole('button', { name: 'Save boundary' }).click();
  await expect.poll(() => world.calls('setBoundary').length).toBe(1);
  expect(world.lastVars('setBoundary')).toMatchObject({ recordId: ID.parcel });
  expect(world.lastVars('setBoundary').ring)
    .toEqual([15.735, 79.265, 15.735, 79.266, 15.7342, 79.266, 15.7342, 79.265]);
});

test('a file that is not a boundary at all is refused with the reason', async ({ page }) => {
  await openMap(page, ID.plot);

  const chooser = page.waitForEvent('filechooser');
  await page.locator('.pagehead').getByRole('button', { name: 'Import KML / GeoJSON' }).click();
  await (await chooser).setFiles({
    name: 'notes.json', mimeType: 'application/json', buffer: Buffer.from('{"hello":"world"}'),
  });

  await expect(mapError(page)).toHaveText('That GeoJSON has no polygon in it.');
});

// ── a record with no survey ────────────────────────────────────────────

test('an unsurveyed record says it has never been surveyed and draws no shape', async ({ page }) => {
  await openMap(page, ID.plot);

  await expect(page.locator('.plot .cap')).toHaveText('This record has never been surveyed');
  await expect(page.locator('path.w-ring')).toHaveCount(0);
  await expect(page.locator('.w-corner-no')).toHaveCount(0);
  await expect(page.locator('.w-side')).toHaveCount(0);
  // No shape means nothing to measure and nothing to hand over.
  await expect(page.getByRole('button', { name: 'Measure', exact: true })).toHaveCount(0);
  await expect(page.locator('.card', { hasText: 'Measurements' })).toHaveCount(0);
});

test('an unsurveyed record offers to have its corners established', async ({ page }) => {
  await openMap(page, ID.plot);

  // Into the order flow, not the old free-text /request form: a survey asked
  // for from the map is the same catalogue order as one placed from
  // Properties, priced and made idempotent the same way, and it arrives on the
  // step that chooses a service with the service already chosen. `why=boundary`
  // is the one thing this route knows that the flow does not — it writes onto
  // the order that the owner was looking at their own land when they asked.
  await expect(page.getByRole('link', { name: 'Order a survey' })).toHaveAttribute(
    'href', `/app/records/${ID.plot}/order?service=survey&step=pick&why=boundary`);

  const sheet = page.locator('.card', { hasText: 'FMB sheet' });
  await expect(sheet).toContainText(
    'No FMB or survey sheet is filed against this record, so there is nothing to open.');
  await expect(sheet).toContainText("filed on this record’s Papers tab, and nothing here reads one.");
  await expect(sheet.getByRole('button', { name: 'Import KML / GeoJSON' })).toBeVisible();
  await expect(sheet.getByRole('button', { name: 'Draw it instead' })).toBeVisible();

  await expect(marksCard(page)).toContainText(
    'No marks recorded. A mark is a numbered corner with its own photos and its own history — add one, or order a survey and the surveyor sets them.');
  await expect(page.locator('.card', { hasText: 'LOCATION' })).toContainText('not set');
});

test('"Draw it instead" on the sheet card arms the same tool the map does', async ({ page }) => {
  await openMap(page, ID.plot);

  await page.locator('.card', { hasText: 'FMB sheet' })
    .getByRole('button', { name: 'Draw it instead' }).click();

  await expect(page.getByRole('button', { name: 'Drawing — or cancel' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.editbar')).toContainText('0 corners');
});

test('with no pin and no survey the screen names the place the map settled on', async ({ page }) => {
  await openMap(page, ID.plot);

  await expect(page.locator('.plot p.nogeo')).toHaveText(
    'The map is showing Markapur, Markapuram — not this parcel. Nothing on this record says where within it the land sits.');
});

test('a record with a pin and no survey says the pin is all it has', async ({ page }) => {
  // Shop 7 carries coordinates and no ring — a different sentence from the
  // record that carries neither, and the two used to be the same one.
  await openMap(page, ID.shop);

  await expect(page.locator('.plot p.nogeo')).toHaveText(
    'No surveyed boundary on this record — the pin is where it was filed from. Order a survey and the corners are set on the ground.');
  await expect(page.locator('path.w-ring')).toHaveCount(0);
  // And the pin it is talking about is actually drawn, named for the record it
  // belongs to. Saying "the pin is where it was filed from" over an empty map
  // would be the panel describing something nobody can see.
  await expect(page.locator('path.w-mark')).toHaveCount(1);
  await expect(page.locator('.w-mark-no')).toHaveText('Shop 7, Market Road');
});

test('a pin filed in another district is called out by distance, once', async ({ page, world }) => {
  // The shop is filed in Markapur and its pin says Hyderabad. Both cannot be
  // true, and the screen that claims to show real ground is the one that has
  // to say so (RecordBoundary.tsx:1085-1092).
  world.set('boundary', boundary({
    recordId: ID.shop, title: 'Shop 7, Market Road',
    lat: 17.4948, lon: 78.3996, ring: [], marks: [],
    setBy: '', accuracy: '', caption: 'This record has never been surveyed',
    sheetTitle: '', sheetDetail: '', sheetId: '',
  }));
  await openMap(page, ID.shop);

  const note = page.locator('.plot p.nogeo');
  await expect(note).toHaveText(
    /^This location is \d[\d,]* km from Markapur, Markapuram\. Phones report where you are standing, not where the land is\.$/);
  // Once. The map has its own sentence for a pin it cannot believe, and the
  // two of them printed together used to contradict each other.
  await expect(note).toHaveCount(1);
});

test('a record nowhere on the map says it has no location at all', async ({ page, world }) => {
  // No ring, no pin, no stones, and a geocoder that cannot place the village
  // either — the last rung of MapCanvas.tsx:1516-1528, and the only honest
  // thing left to say. Routed here rather than seeded: the sealed world
  // answers for Markapur, and this scenario is the answer going missing.
  await page.route(/nominatim\.openstreetmap\.org/i, (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
  await openMap(page, ID.plot);

  await expect(page.locator('.plot p.nogeo')).toHaveText(
    'This record has no location yet. Move the pin, or order a survey.');
  await expect(page.locator('path.w-ring')).toHaveCount(0);
  await expect(page.locator('path.w-mark')).toHaveCount(0);
  // The two ways out of that state are still on the screen.
  await expect(page.getByRole('button', { name: 'Move the pin' })).toBeEnabled();
  await expect(page.getByRole('link', { name: 'Order a survey' })).toBeVisible();
});

test('an archived record still opens its map, and says it is archived', async ({ page }) => {
  await openMap(page, ID.shop);

  await expect(page.locator('.pagehead').getByText('Archived')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Map & boundary' })).toBeVisible();
});

test('a record whose only location is its stones draws them and joins nothing', async ({ page, world }) => {
  world.set('boundary', boundary({
    recordId: ID.plot, title: 'Sy 88', lat: 0, lon: 0, ring: [],
    setBy: '', accuracy: '', caption: 'This record has never been surveyed',
    sheetTitle: '', sheetDetail: '', sheetId: '',
  }));
  await openMap(page, ID.plot);

  await expect(page.locator('.plot p.nogeo')).toHaveText(
    'No surveyed boundary on this record. The numbered stones are where they were recorded — nothing joins them, because a handful of readings is not a boundary. Order a survey and the corners are set with a GPS.');
  await expect(page.locator('path.w-ring')).toHaveCount(0);
  await expect(marksCard(page)).toContainText('North-east stone');
  // Drawn, and numbered to match the list — the sentence above is about stones
  // the owner is meant to be looking at. No lone pin beside them either: a
  // fifth unnumbered dot is only ambiguous (MapCanvas.tsx:650-666).
  await expect(page.locator('path.w-mark')).toHaveCount(3);
  await expect(page.locator('.w-mark-no')).toHaveText(['1', '2', '3']);
});

// ── the village map, and the hand-offs ─────────────────────────────────

test('a village with no shape file on the wall says so and changes nothing', async ({ page, world }) => {
  await openMap(page, ID.parcel);

  await page.getByRole('button', { name: 'Village map' }).click();

  await expect(page.locator('.vmnote')).toHaveText('No village map on file for Katragunta');
  // It opens on the record's own survey number, because that is the one
  // question an owner turning this on is asking.
  await expect(page.locator('#w360-plotfind')).toHaveValue('214');
  await expect(page.locator('.plotfind')).toContainText('No plot 214 in this village map.');
  // Nothing was written, and the record's own ring is untouched.
  expect(world.calls('setBoundary')).toHaveLength(0);
  await expect(page.locator('path.w-ring')).toHaveCount(1);
});

test('the village map is not offered while the record is being edited', async ({ page }) => {
  await openMap(page, ID.parcel);

  await page.getByRole('button', { name: 'Redraw boundary' }).click();
  await expect(page.getByRole('button', { name: 'Village map' })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Measure', exact: true })).toBeDisabled();
  // And the measurements go with them: they are of the SAVED outline, and
  // leaving them beside a draft that is being moved about states them of a
  // shape they were never taken from.
  await expect(page.locator('.card', { hasText: 'Measurements' })).toHaveCount(0);
  await expect(page.locator('.w-side')).toHaveCount(0);
});

test('the hand-off is named for the map app that will actually open', async ({ page }) => {
  await openMap(page, ID.parcel);

  await page.getByRole('button', { name: 'More for this map' }).click();
  // Named for the app that will ACTUALLY open, so it never promises Apple Maps
  // to somebody on a Pixel. The desktop project runs Playwright's Desktop
  // Chrome profile, whose user agent is Windows — so the honest answer here is
  // OpenStreetMap, the same data the app's own tiles come from. The phone
  // project's iPhone profile gets Apple Maps from the same line.
  const away = page.getByRole('menuitem', { name: 'Open in OpenStreetMap' });
  await expect(away).toBeVisible();
  await expect(page.getByRole('menuitem', { name: /Apple Maps/ })).toHaveCount(0);

  // A real link, so it can be copied or opened in a new tab from the menu, and
  // it is dropped on the middle of the land rather than on the filed pin.
  const href = await away.getAttribute('href');
  expect(href).toContain('openstreetmap.org');
  expect(href).toContain('mlat=15.7406');
});

test('GeoJSON is offered for export only where there is a boundary to export', async ({ page }) => {
  await openMap(page, ID.parcel);
  await page.getByRole('button', { name: 'More for this map' }).click();
  await expect(page.getByRole('menuitem', { name: 'Export GeoJSON' })).toBeVisible();
  await expect(page.getByRole('menuitem', { name: 'Print this map' })).toBeVisible();
  await page.keyboard.press('Escape');

  await openMap(page, ID.plot);
  await page.getByRole('button', { name: 'More for this map' }).click();
  await expect(page.getByRole('menuitem', { name: 'Export GeoJSON' })).toHaveCount(0);
  // Nor a hand-off: this record has no ring and no pin, so there is no point
  // to drop in any maps app (RecordBoundary.tsx:547-563). An "Open in…" that
  // lands on 0,0 puts an Andhra parcel in the Gulf of Guinea.
  await expect(page.getByRole('menuitem', { name: /^Open in / })).toHaveCount(0);
  await expect(page.getByRole('menuitem', { name: 'Print this map' })).toBeVisible();
});

// ── the states in between ──────────────────────────────────────────────

test('the screen holds its shape while the boundary is still being read', async ({ page, world }) => {
  world.set('boundary', World.never());
  await page.goto(`/app/records/${ID.parcel}/map`);

  await expect(page.getByRole('status').filter({ hasText: 'Loading this boundary…' }))
    .toBeVisible();
  // Still loading is not the same as nothing there, and must never say so.
  await expect(page.getByText('never been surveyed')).toHaveCount(0);
  await expect(page.locator('.leaflet-container')).toHaveCount(0);
});

test('a slow boundary arrives, and the map is drawn when it does', async ({ page, world }) => {
  world.set('boundary', World.slow(1200, boundary()));
  await page.goto(`/app/records/${ID.parcel}/map`);

  await expect(page.getByRole('status').filter({ hasText: 'Loading this boundary…' }))
    .toBeVisible();
  await expect(page.locator('path.w-ring')).toHaveCount(1, { timeout: 20_000 });
  await expect(page.locator('.plot .cap')).toContainText('8 corners walked 12 Aug 2026');
});

test('a boundary the server refused says so, with the reason, and offers to try again', async ({ page, world }) => {
  world.set('boundary', World.gqlError('the boundary store is down'));
  await page.goto(`/app/records/${ID.parcel}/map`);

  const failed = page.getByRole('alert');
  await expect(failed).toContainText('This boundary did not load');
  await expect(failed).toContainText('Your records are untouched.');
  await expect(failed).toContainText('the boundary store is down');
  await expect(failed.getByRole('button', { name: 'Try again' })).toBeVisible();
});

test.describe('when the transport itself drops the read', () => {
  // A 503 is logged by the browser as a failed resource, twice — react-query
  // retries once. Provoking it is the whole point of the test below.
  test.use({ allowConsole: true });

  test('a boundary the transport dropped says so too', async ({ page, world }) => {
    world.set('boundary', World.httpError(503));
    await page.goto(`/app/records/${ID.parcel}/map`);

    await expect(page.getByRole('alert')).toContainText('This boundary did not load');
  });
});

test('a record with no boundary row at all is a failure, not a blank map', async ({ page, world }) => {
  world.set('boundary', null);
  await page.goto(`/app/records/${ID.parcel}/map`);

  await expect(page.getByRole('alert')).toContainText('This boundary did not load');
  await expect(page.locator('.leaflet-container')).toHaveCount(0);
});

test('a record that is not in the portfolio never reaches the map at all', async ({ page, world }) => {
  await page.goto(`/app/records/${ID.missing}/map`);

  await expect(page.getByRole('heading', { name: 'That record is not in your portfolio' })).toBeVisible();
  expect(world.asked('boundary'), 'no record, no boundary read').toBe(false);
});

test('a record read that failed never pretends the boundary is missing', async ({ page, world }) => {
  world.set('record', World.gqlError('the record store is down'));
  await page.goto(`/app/records/${ID.parcel}/map`);

  const failed = page.getByRole('alert');
  await expect(failed).toContainText('This record did not load');
  await expect(failed).toContainText('the record store is down');
  await expect(page.getByText('not in your portfolio')).toHaveCount(0);
});

// ── the phone ──────────────────────────────────────────────────────────

test('@phone the map, its tools and the mark list all fit a phone', async ({ page }) => {
  await openMap(page, ID.parcel);

  await expect(page.locator('path.w-ring')).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Satellite' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Add boundary mark', exact: true })).toBeVisible();
  await expect(marksCard(page)).toContainText('North-east stone');

  const overflow = await page.evaluate(() =>
    document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow, 'nothing on this screen may push the page sideways').toBeLessThanOrEqual(1);
});
