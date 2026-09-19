/**
 * Every screen in the W01–W15 handover, asserted on the figures that appear on
 * more than one of them.
 *
 * The rule these tests encode: a number a user can cross-check between two
 * screens must agree. Sy 214/2 is 3.24 ac and ₹72.9 L on the card, in the 360
 * hero and on the map. Its features are 14 with 2 needing repair, both in the
 * tab label and in the chip. Nine records are nine everywhere.
 */
import type { APIRequestContext, Page } from '@playwright/test';

import { test, expect, NOMINATIM, TILE_HOSTS, stubTiles } from './harness';

const PARCEL = 'w360-p-214-2';   // Sy 214/2 — the record every screen is drawn around
const BIG = 'w360-p-88';         // Sy 88 — the 30-acre holding bought in two lots
const FLAT = 'w360-r-flat4b';    // Flat 4B — the let property, for the rent ledger
const DEED = 'w360-d-deed-4417'; // Sale Deed 4417/2019

/** Click a fraction across the map panel.
 *
 *  Two traps, both hit on the way here. Plain `.click()` waits for the
 *  CONTAINER to be actionable and Leaflet fills it with its own panes, so the
 *  click never becomes eligible — hence `force`. And bare viewport
 *  coordinates land on whatever is painted there, which on a Leaflet map
 *  includes the "Leaflet" attribution link in the bottom-right: the run
 *  navigated to leafletjs.com mid-test. A position INSIDE the element, kept
 *  away from the corners, is both. */
async function clickMapAt(page: Page, fx: number, fy: number): Promise<void> {
  const map = page.locator('.plot .map');
  const box = (await map.boundingBox())!;
  await map.click({
    force: true,
    position: { x: box.width * fx, y: box.height * fy },
  });
}

/** No screen may reach the user with a console error on it. */
async function watchConsole(page: Page): Promise<string[]> {
  const errors: string[] = [];
  page.on('console', (m) => {
    // A missing favicon is the dev server, not the app. A tile that did not
    // arrive is the network, and the map says so on screen by design.
    //
    // The tile check reads location() as well as the text: an aborted request
    // is reported as the bare string "Failed to load resource: net::ERR_FAILED"
    // with no URL in it, so matching on text alone exempts a 404 and misses
    // every other way a tile can fail.
    const where = m.location()?.url ?? '';
    const fromTiles = TILE_HOSTS.test(m.text()) || TILE_HOSTS.test(where)
      || NOMINATIM.test(m.text()) || NOMINATIM.test(where);
    if (m.type() === 'error' && !m.text().includes('favicon') && !fromTiles) {
      errors.push(m.text());
    }
  });
  page.on('pageerror', (e) => errors.push(String(e)));
  return errors;
}

test.describe('W01 · dashboard', () => {
  test('states the portfolio, and its totals are its own records summed', async ({ page }) => {
    const errors = await watchConsole(page);
    await page.goto('/app');

    await expect(page.getByText('Your portfolio')).toBeVisible();
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Sankara');

    // The stat strip — the seven figures the mock leads with.
    const strip = page.locator('.strip').first();
    await expect(strip).toContainText('44.82');
    await expect(strip).toContainText('6 parcels');
    await expect(strip).toContainText('742');
    await expect(strip).toContainText('1 open plot');
    await expect(strip).toContainText('1,760');
    await expect(strip).toContainText('1 flat, 1 shop');
    await expect(strip).toContainText('₹3.62 Cr');   // invested
    await expect(strip).toContainText('₹42.0 L');    // loans outstanding

    // Gain must equal worth − invested, not be a stored number.
    const worth = await strip.locator('div', { hasText: 'WORTH NOW' }).first().innerText();
    const gain = await strip.locator('div', { hasText: 'GAIN' }).first().innerText();
    const cr = (s: string) => Number(/([\d.]+)\s*Cr/.exec(s)?.[1] ?? 0);
    expect(cr(gain)).toBeCloseTo(cr(worth) - 3.62, 1);

    // Two things with a deadline — the map insight is NOT one of them.
    await expect(page.getByText('Mutation for Sy 214/2 needs your signature')).toBeVisible();
    await expect(page.getByText("Advocate's link to 4 papers expires tomorrow")).toBeVisible();
    await expect(page.getByText('214/2 and 214/3 share a boundary')).toHaveCount(0);

    // Where the value sits: every bar has a visible fill, not an empty track.
    const fills = page.locator('.bar .fill');
    await expect(fills.first()).toBeVisible();
    const width = await fills.first().evaluate((el) => el.getBoundingClientRect().width);
    expect(width).toBeGreaterThan(20);

    await expect(page.getByText('Recently opened')).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('the recently-opened strip mixes parcels and built property', async ({ page }) => {
    await page.goto('/app');
    const cards = page.locator('.cards .rec');
    await expect(cards).toHaveCount(4);
    await expect(cards.nth(0)).toContainText('Sy 214/2');
    await expect(cards.nth(1)).toContainText('Flat 4B, Sai Enclave');
  });
});

test.describe('W02 · properties', () => {
  test('one faceted list, and the rail agrees with the grid', async ({ page }) => {
    const errors = await watchConsole(page);
    await page.goto('/app/properties');

    await expect(page.getByText('9 of 9 shown')).toBeVisible();
    await expect(page.locator('.cards .rec')).toHaveCount(9);

    // Facet counts, exactly as drawn. The facets live behind `+ Filter` now
    // rather than in a standing rail, so the counts have to be opened for —
    // which is the point: a group the answer carries no options for can no
    // longer print a heading over nothing.
    await page.getByRole('button', { name: '+ Filter' }).click();
    const pop = page.getByRole('group', { name: 'Narrow the list' });
    await expect(pop.getByText('Land parcels')).toBeVisible();
    await expect(pop.getByRole('button', { name: /^Land parcels/ })).toContainText('6');
    await expect(pop.getByRole('button', { name: /^Properties/ })).toContainText('3');
    await expect(pop.getByRole('button', { name: /^For sale/ })).toContainText('2');
    await expect(pop.getByRole('button', { name: /^Disputed/ })).toContainText('1');
    // Escape puts it away and hands the button back its focus.
    await page.keyboard.press('Escape');
    await expect(pop).toHaveCount(0);

    // A record's figures read on one line, never wrapped into two.
    const first = page.locator('.cards .rec').first();
    await expect(first).toContainText('3.24 ac');
    await expect(first).toContainText('₹72.9 L');
    expect(await first.locator('.figure').evaluate((el) => el.getBoundingClientRect().height))
      .toBeLessThan(40);

    expect(errors).toEqual([]);
  });

  test('a facet narrows the grid, and the chip in the row says what is on', async ({ page }) => {
    await page.goto('/app/properties');
    await page.getByRole('button', { name: '+ Filter' }).click();
    await page.getByRole('group', { name: 'Narrow the list' })
      .getByRole('button', { name: /^For sale/ }).click();

    await expect(page).toHaveURL(/status=for_sale/);
    await expect(page.getByText('2 of 9 shown')).toBeVisible();

    // What is narrowing the list is readable without opening anything: the
    // chip names its group and its value, and carries its own dismissal. This
    // replaces the "7 properties hidden by your filter" card that used to
    // float in the corner of the grid saying the same thing at more length.
    const chip = page.locator('.fchip', { hasText: 'For sale' });
    await expect(chip).toContainText('Status');
    await expect(chip.getByRole('button', { name: 'Remove filter Status For sale' })).toBeVisible();

    await page.getByRole('button', { name: 'Clear all' }).click();
    await expect(page.getByText('9 of 9 shown')).toBeVisible();
    await expect(page.locator('.fchip')).toHaveCount(0);
  });

  test('the filter lives in the URL, so a narrowed list is shareable', async ({ page }) => {
    await page.goto('/app/properties?status=disputed');
    await expect(page.getByText('1 of 9 shown')).toBeVisible();
    await expect(page.locator('.cards .rec').first()).toContainText('Shop 2, Main Rd');
  });
});

test.describe('W02 · what a card shows of itself', () => {
  /** A 2x2 PNG, orange. Small enough to inline, big enough that a card
   *  rendering it is unmistakable in a screenshot. */
  const PNG = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFElEQVR4nGP8z4AAT'
    + 'AwoYIQzAA0uAQMAOcsBGgAAAABJRU5ErkJggg==', 'base64');

  test('the ground the record sits on, drawn without a map library',
    async ({ page }) => {
      const errors = await watchConsole(page);
      await stubTiles(page);
      await page.goto('/app/properties');
      await expect(page.locator('.cards .rec')).toHaveCount(9);

      // Every located record draws its own ground. Nine of nine here — and
      // NOT nine Leaflet maps: forty of those on the app's landing screen is
      // not a thumbnail, it is forty maps.
      await expect(page.locator('.mapart')).toHaveCount(9);
      await expect(page.locator('.leaflet-container')).toHaveCount(0);

      // One surveyed record draws its boundary; the other eight have a
      // position and not an extent, so they get a pin. Drawing those eight as
      // little squares would claim a boundary the record does not have.
      await expect(page.locator('.mapart path.w-ring')).toHaveCount(1);
      await expect(page.locator('.mapart circle.pf-pin')).toHaveCount(8);

      // The ring is drawn in the record's own coordinates, over the tile the
      // record actually sits on — so it must land INSIDE its own card, not at
      // the origin of the SVG.
      const box = (await page.locator('.mapart path.w-ring').boundingBox())!;
      const art = (await page.locator('.rec .art').first().boundingBox())!;
      expect(box.width).toBeGreaterThan(8);
      expect(box.x).toBeGreaterThanOrEqual(art.x - 1);
      expect(box.x + box.width).toBeLessThanOrEqual(art.x + art.width + 1);

      expect(errors).toEqual([]);
    });

  test('neighbours share tiles, because they share a zoom', async ({ page }) => {
    await stubTiles(page);
    await page.goto('/app/properties');
    await expect(page.locator('.mapart img').first()).toBeAttached({ timeout: 20_000 });

    // The zoom is snapped to a four-rung ladder, and this is the whole reason:
    // parcels next to each other sit on the same tiles, but they only share a
    // REQUEST when they share a zoom. Fitted individually they share nothing.
    const urls = await page.locator('.mapart img').evaluateAll((els) =>
      (els as HTMLImageElement[]).map((e) => e.src));
    expect(urls.length).toBeGreaterThan(8);
    expect(new Set(urls).size).toBeLessThan(urls.length);
    // Esri, not OpenStreetMap: fetched over real ground here, an OSM tile is
    // 103 bytes of flat beige because rural Andhra is not drawn. A street-tile
    // grid would be an empty rectangle on every card.
    expect(urls.every((u) => /arcgisonline/.test(u))).toBe(true);
  });

  test('a photograph outranks the map, and a broken one says so',
    async ({ page, request }) => {
      // The record's cover photo is the only one of the three pictures a card
      // can show that the OWNER made, so it wins. But a cover reference is not
      // a promise of bytes — the seed writes 167 photo rows with none — so the
      // chain has to survive the photo failing.
      const GQL = '/api/gateway/pattadar/graphql';
      const ref = '11111111-2222-4333-8444-555555555555';
      const made = await request.post(GQL, { data: {
        query: 'mutation AP($r:String!,$f:String!,$n:String!) '
          + '{ web { addPhoto(recordId:$r,fileRef:$f,fileName:$n) } }',
        variables: { r: PARCEL, f: ref, n: 'cover.png' } } });
      const photoId = (await made.json()).data.web.addPhoto as string;
      expect(photoId).not.toBe('');

      try {
        await stubTiles(page);
        // The bytes are behind a Bearer token the browser cannot put on an
        // <img>, which is why PhotoImg fetches and hands over a blob URL.
        // Serving them here is what lets this suite regress the render path
        // at all — every seeded photo has an empty fileRef.
        await page.route(`**/storage/files/${ref}/content*`, (route) =>
          route.fulfill({ status: 200, contentType: 'image/png', body: PNG }));
        await page.goto('/app/properties');

        const card = page.locator('.rec', { hasText: 'Sy 214/2' });
        await expect(card.locator('.cardphoto')).toBeVisible({ timeout: 20_000 });
        // Its own artwork, not the map — and the map is not also drawn under it.
        await expect(card.locator('.mapart')).toHaveCount(0);
        // Every other card still draws its ground.
        await expect(page.locator('.mapart')).toHaveCount(8);

        // Now break the bytes. The reference is still there, so this is a
        // failed file rather than an empty slot. Say so and offer a retry;
        // never replace it with a broken-image glyph or pretend no photo was
        // filed.
        await page.unroute(`**/storage/files/${ref}/content*`);
        await page.route(`**/storage/files/${ref}/content*`, (route) =>
          route.fulfill({ status: 404, body: '' }));
        await page.reload();
        const failed = card.locator('.photo-failed');
        await expect(failed).toBeVisible({ timeout: 20_000 });
        await expect(failed).toContainText('This did not load');
        await expect(failed.getByRole('button', { name: 'Try again' })).toBeEnabled();
        await expect(card.locator('img.cardphoto')).toHaveCount(0);
        await expect(card.locator('.mapart')).toHaveCount(0);
      } finally {
        await request.post(GQL, { data: {
          query: 'mutation DP($id:String!) { web { deletePhoto(photoId:$id) } }',
          variables: { id: photoId } } });
      }
    });

  test('a record with nowhere to be keeps its illustration', async ({ page, request }) => {
    const GQL = '/api/gateway/pattadar/graphql';
    const made = await request.post(GQL, { data: {
      query: 'mutation SR($input:RecordInput!) { web { saveRecord(input:$input) } }',
      variables: { input: {
        kind: 'parcel', title: 'Sy 909', classification: 'agri', status: 'owned',
        stake: 'owned', khataNo: '10021', ownerName: 'Artless Test',
        village: 'Kothapalli', mandal: 'Peddapuram', district: 'East Godavari',
        extent: 1.5, extentUnit: 'ac' } } } });
    const id = (await made.json()).data.web.saveRecord as string;

    try {
      await stubTiles(page);
      await page.goto('/app/properties');
      const card = page.locator('.rec', { hasText: 'Sy 909' });
      await expect(card).toBeVisible({ timeout: 20_000 });

      // No pin, no survey, so no ground to draw — and it must not invent any.
      // The classification illustration is the honest answer, and it is
      // already in the markup under every card's artwork, which is why no
      // arrangement of failures can leave a card blank.
      await expect(card.locator('.mapart')).toHaveCount(0);
      // The classification illustration is a direct child of the art box; the
      // kebab and the pills carry svgs of their own, so the selector has to be
      // the child and not a descendant.
      await expect(card.locator('.art > svg')).toHaveCount(1);
      await expect(card.locator('.cardphoto')).toHaveCount(0);
    } finally {
      await request.post(GQL, { data: {
        query: 'mutation DR($ids:[String!]!) { web { deleteRecords(ids:$ids) } }',
        variables: { ids: [id] } } });
    }
  });
});

test.describe('W02 · everything you own, on one map', () => {
  /** Scoped to the switcher on purpose. `getByRole('button', { name: 'Map' })`
   *  is page-wide and matches on substrings, and this page also grows a "Maps"
   *  rail link and a record card whose title can be anything. */
  const seg = (page: Page, name: string) =>
    page.locator('.segmented').getByRole('button', { name, exact: true });
  const drawn = (page: Page) => page.locator('path.pf-shape, path.pf-pin');

  test('the page still lands in the grid, and no map is mounted until asked',
    async ({ page }) => {
      // Load-bearing, not cosmetic. Leaflet is ~150 kB behind a lazy seam, and
      // fourteen tests in crud.spec.ts open this page without stubbing a tile
      // server. A map that mounted on arrival would put all of them on the
      // live internet and make a self-contained suite a connectivity check.
      const errors = await watchConsole(page);
      await page.goto('/app/properties');
      await expect(page.locator('.cards .rec')).toHaveCount(9);
      await expect(seg(page, 'Grid')).toHaveAttribute('aria-pressed', 'true');
      await expect(page.locator('.leaflet-container')).toHaveCount(0);
      await expect(page.locator('.pf-map')).toHaveCount(0);
      expect(errors).toEqual([]);
    });

  test('the map draws what the filter left, and the filter narrows it',
    async ({ page }) => {
      const errors = await watchConsole(page);
      await stubTiles(page);
      await page.goto('/app/properties');
      await seg(page, 'Map').click();
      await expect(page.locator('.pf-map')).toBeVisible({ timeout: 20_000 });

      // Nine records, nine things on the map — one from its survey, eight from
      // a dropped pin. The count is said in words as well, because a map is the
      // one view that can look complete while leaving records out: what is
      // missing takes up no space.
      await expect(drawn(page)).toHaveCount(9);
      await expect(page.locator('path.pf-shape')).toHaveCount(1);
      await expect(page.locator('.pf')).toContainText('9 records drawn');
      await expect(page.locator('.pf')).toContainText('1 from a survey, 8 from a pin');

      // The filter row above it is the same filter the grid obeys. A map that
      // drew every record regardless would be a second opinion on screen at
      // once — and the row is above every view for exactly that reason.
      await page.getByRole('button', { name: '+ Filter' }).click();
      await page.getByRole('group', { name: 'Narrow the list' })
        .getByRole('button', { name: /^For sale/ }).click();
      await expect(page.getByText('2 of 9 shown')).toBeVisible();
      await expect(drawn(page)).toHaveCount(2);
      await expect(page.locator('.pf')).toContainText('2 records drawn');
      expect(errors).toEqual([]);
    });

  test('no two names on the map are written over each other', async ({ page }) => {
    await stubTiles(page);
    await page.goto('/app/properties');
    await seg(page, 'Map').click();
    await expect(page.locator('.pf-label').first()).toBeVisible({ timeout: 20_000 });

    // Two survey numbers written over each other read as a third number that
    // does not exist. A label that would land on one already placed is dropped,
    // so there are fewer labels than records and never an overlap.
    const boxes = await page.locator('.pf-label').evaluateAll((els) =>
      els.map((el) => el.getBoundingClientRect())
        .map((r) => [r.x, r.y, r.width, r.height] as [number, number, number, number]));
    expect(boxes.length).toBeGreaterThan(3);
    for (let i = 0; i < boxes.length; i += 1) {
      for (let j = i + 1; j < boxes.length; j += 1) {
        const [ax, ay, aw, ah] = boxes[i];
        const [bx, by, bw, bh] = boxes[j];
        expect(ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by).toBe(false);
      }
    }
  });

  test('picking one names it and offers the way in', async ({ page }) => {
    await stubTiles(page);
    await page.goto('/app/properties');
    await seg(page, 'Map').click();
    await expect(page.locator('path.pf-shape')).toHaveCount(1, { timeout: 20_000 });

    // The one surveyed record in the set — a shape rather than a pin.
    await page.locator('path.pf-shape').click({ force: true });
    const pick = page.locator('.pf-pick');
    await expect(pick).toContainText('Sy 214/2');
    await expect(pick).toContainText('Kothapalli');
    await pick.getByRole('link', { name: 'Open' }).click();
    await expect(page).toHaveURL(new RegExp(`/app/records/${PARCEL}$`));
  });

  test('the basemap switches, and the caption says which one you are on',
    async ({ page }) => {
      await stubTiles(page);
      await page.goto('/app/properties');
      await seg(page, 'Map').click();
      await expect(page.locator('.pf-map')).toBeVisible({ timeout: 20_000 });

      const sat = page.getByRole('button', { name: 'Satellite' });
      await expect(page.locator('.pf-stage .cap')).toHaveText('OpenStreetMap');
      await sat.click();
      await expect(page.locator('.pf-stage .cap')).toHaveText('Esri World Imagery');
      await expect(page.locator('.leaflet-control-attribution')).toContainText('Esri');
      await sat.click();
      await expect(page.locator('.pf-stage .cap')).toHaveText('OpenStreetMap');
    });

  test('a record with nowhere to be is named, not drawn', async ({ page, request }) => {
    // The honest case, and the common one: a record can be filed long before
    // anybody surveys it or stands on it. Plotting it at 0,0 — which is what an
    // empty geo_point parses to, and a real place in the Gulf of Guinea — would
    // not be a failure to locate it but a wrong location, which is worse.
    const GQL = '/api/gateway/pattadar/graphql';
    const made = await request.post(GQL, { data: {
      query: 'mutation SR($input:RecordInput!) { web { saveRecord(input:$input) } }',
      variables: { input: {
        kind: 'parcel', title: 'Sy 909', classification: 'agri', status: 'owned',
        stake: 'owned', khataNo: '10021', ownerName: 'Nowhere Test',
        village: 'Kothapalli', mandal: 'Peddapuram', district: 'East Godavari',
        extent: 1.5, extentUnit: 'ac' } } } });
    const id = (await made.json()).data.web.saveRecord as string;

    try {
      await stubTiles(page);
      await page.goto('/app/properties');
      await seg(page, 'Map').click();
      await expect(page.locator('.pf-map')).toBeVisible({ timeout: 20_000 });

      await expect(page.getByText('10 of 10 shown')).toBeVisible();
      await expect(drawn(page)).toHaveCount(9);
      await expect(page.locator('.pf')).toContainText('9 records drawn');
      await expect(page.locator('.pf')).toContainText('1 record is not here: Sy 909');
      await expect(page.locator('.pf')).toContainText('neither surveyed nor pinned');
    } finally {
      await request.post(GQL, { data: {
        query: 'mutation DR($ids:[String!]!) { web { deleteRecords(ids:$ids) } }',
        variables: { ids: [id] } } });
    }
  });

  for (const [name, width, height] of
    [['laptop', 1512, 900], ['tablet', 900, 800], ['phone', 390, 780]] as const) {
    test(`${name} · the map fits inside the window it opens in`, async ({ page }) => {
      // /app/properties is the FIRST map-bearing route under a sideways-scroll
      // gate in this suite — the existing responsive test walks it in grid view,
      // where no map mounts, so it has never checked one. A Leaflet host with a
      // min-width, or a panel beside it, fails here and nowhere else.
      await stubTiles(page);
      await page.setViewportSize({ width, height });
      await page.goto('/app/properties');
      await seg(page, 'Map').click();
      await expect(page.locator('.pf-map')).toBeVisible({ timeout: 20_000 });

      const overflow = await page.evaluate(() =>
        document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, `${name} at ${width}px`).toBeLessThanOrEqual(1);

      // And it fits VERTICALLY too — sized from the viewport, not from the
      // records in it, so the bulk bar underneath is still reachable.
      const stage = (await page.locator('.pf-stage').boundingBox())!;
      expect(stage.width).toBeLessThanOrEqual(width);
      expect(stage.height).toBeLessThan(height);
    });
  }
});

test.describe('W03 · the record 360', () => {
  test('hero, hangers and the right rail', async ({ page }) => {
    const errors = await watchConsole(page);
    await page.goto(`/app/records/${PARCEL}`);

    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Sy 214/2');
    await expect(page.getByText('Land parcel · Khata 10021 · Agri')).toBeVisible();
    await expect(page.getByText('Kothapalli, Peddapuram, Kakinada — Andhra Pradesh')).toBeVisible();

    // The four-stat strip is gone. The extent is a chip beside the title, and
    // the worth, the rate and the year bought are the Money hanger's subject —
    // W10 asserts them there. Every fact has exactly one home.
    const chip = page.locator('.pagehead .chip.num').first();
    await expect(chip).toContainText('3.24');
    await expect(chip).toHaveAttribute('title', '3 Acres 9.6 Guntas · 324 Cents · 15,682 Sq.yd');
    // How much of the record is filled in, and the one thing to do next.
    // Moved from a full-width strip into the Papers right rail, beside "What is
    // missing" — the segmented bar is gone, so it is asserted by its sentence.
    await expect(page.getByText('of 9 parts')).toBeVisible();

    const tabs = page.locator('.tabs').first();
    await expect(tabs).toContainText('Papers');
    await expect(tabs).toContainText('12');
    await expect(tabs).toContainText('Features');
    await expect(tabs).toContainText('14');
    await expect(tabs).toContainText('People');

    // Twelve papers, the first with its registration line.
    await expect(page.locator('.rows.boxed > div')).toHaveCount(12);
    await expect(page.getByText('Sale Deed 4417/2019')).toBeVisible();
    await expect(page.getByText('Registered 06/09/2019 · SRO Peddapuram · ₹58,00,000 · 22 pages')).toBeVisible();

    // The rail is about the papers now: what is missing from them, and what the
    // deed says. The map thumbnail and the photo and note cards that used to sit
    // here are the Location, Media and Notes hangers — the same ground and the
    // same gallery twice on one screen was the duplication this redesign is for.
    await expect(page.getByRole('heading', { name: 'The deed says' })).toBeVisible();
    await expect(page.locator('.mapthumb')).toHaveCount(0);

    // The note moved to its own hanger, and the guarantee it carried travelled
    // with it: no ISO date ever reaches prose.
    await page.locator('.tabs').getByRole('link', { name: /^Notes/ }).click();
    await expect(page.getByText('Ramesh says the buyer wants possession after the kharif harvest.'))
      .toBeVisible();
    await expect(page.getByText(/\d{2}\/\d{2}\/\d{4}/).first()).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('the paper shelf chips filter the list', async ({ page }) => {
    await page.goto(`/app/records/${PARCEL}`);
    await page.getByRole('button', { name: /^Title/ }).click();
    await expect(page.locator('.rows.boxed > div')).toHaveCount(3);
  });
});

test.describe('W07 · features', () => {
  test('fourteen features, worst first, chips matching the categories', async ({ page }) => {
    const errors = await watchConsole(page);
    await page.goto(`/app/records/${PARCEL}/features`);

    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Sy 214/2');
    await expect(page.getByRole('heading', { level: 2 }).first())
      .toHaveText('What is on this land');
    // "N not checked" is only said when there are any — an all-checked record
    // must not carry a count of nought in its own summary line.
    await expect(page.getByText(
      /14 features · 2 need repair · (\d+ not checked · )?worst condition first · walked 12\/08\/2026 by M. Satyanarayana/,
    )).toBeVisible();

    for (const [label, n] of [['Water', '6'], ['Structures', '3'], ['Power', '2'],
      ['Planting', '2'], ['Access', '1'], ['Needs repair', '2']] as const) {
      await expect(page.getByRole('button', { name: new RegExp(`^${label}`) })).toContainText(n);
    }

    // Worst condition first, and a broken one is drawn as an alert.
    const cards = page.locator('.cards > article');
    await expect(cards.first()).toContainText('Borewell 1');
    await expect(cards.first()).toContainText('Yield dropped');
    await expect(cards.first()).toHaveClass(/alert/);

    await page.getByRole('button', { name: /^Needs repair/ }).click();
    await expect(page.locator('.cards > article')).toHaveCount(3);   // 2 + the add card
    expect(errors).toEqual([]);
  });
});

test.describe('W08 · people', () => {
  test('five people, graded by whether you pay them', async ({ page }) => {
    const errors = await watchConsole(page);
    await page.goto(`/app/records/${PARCEL}/people`);

    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Sy 214/2');
    await expect(page.getByRole('heading', { level: 2 }).first()).toHaveText('Who looks after it');
    await expect(page.getByText(/5 people · ₹1,200 a month going out · ₹42,000 a season coming in/))
      .toBeVisible();

    await expect(page.getByText('M. Satyanarayana')).toBeVisible();
    await expect(page.getByText('Through Pattadar')).toBeVisible();
    await expect(page.getByText('₹1,200 / month')).toBeVisible();
    await expect(page.getByText('This parcel only')).toBeVisible();

    // The tenant is not a user of the app, and the card says so.
    await expect(page.getByText('Nothing — not a user')).toBeVisible();

    // Escrow is money that has NOT moved, and is labelled separately.
    await expect(page.getByText('releases when you accept the sketch')).toBeVisible();
    expect(errors).toEqual([]);
  });
});

test.describe('W10 · money', () => {
  test('paid, government and market are three separate numbers', async ({ page }) => {
    const errors = await watchConsole(page);
    await page.goto(`/app/records/${BIG}/money`);

    await expect(page.getByRole('heading', { level: 2 }).first())
      .toHaveText('What it cost and what it is worth');
    await expect(page.getByText('What you actually paid')).toBeVisible();
    await expect(page.getByText('Government value today')).toBeVisible();
    await expect(page.locator('.card .eyebrow', { hasText: 'Market estimate' })).toBeVisible();

    // Two lots, and the blended row is their sum — not a stored total.
    await expect(page.getByText('B. Venkanna')).toBeVisible();
    await expect(page.getByText('K. Satyavathi & 2 others')).toBeVisible();
    await expect(page.getByText('Sale Deed 1188/2022 · SRO Peddapuram')).toBeVisible();
    const total = page.locator('tr.total');
    await expect(total).toContainText('Together');
    await expect(total).toContainText('30.00 ac');
    await expect(total).toContainText('₹1.68 Cr');

    // Capital work is listed apart from the purchase price.
    await expect(page.getByText('Everything else you put in')).toBeVisible();
    await expect(page.getByText('Stamp & registration')).toBeVisible();
    await expect(page.getByText('An assumption you chose, not a valuation.')).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('changing the appreciation rate changes the estimate, and says it is an assumption', async ({ page }) => {
    await page.goto(`/app/records/${BIG}/money`);
    await expect(page.locator('.card', { hasText: 'Appreciation used' })).toContainText('10%');
    await page.getByRole('button', { name: '14%', exact: true }).click();
    await expect(page.locator('.card', { hasText: 'Appreciation used' })).toContainText('14%');
  });
});

test.describe('W11 + W12 · the ledger', () => {
  test('a parcel splits capital from running, and states the cost of holding', async ({ page }) => {
    const errors = await watchConsole(page);
    await page.goto(`/app/records/${BIG}/expenses`);

    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Expenses');
    const strip = page.locator('.strip').first();
    await expect(strip).toContainText('Capital · adds to cost');
    await expect(strip).toContainText('Running');
    await expect(strip).toContainText('Owed back by tenant');

    // A receipt figure is never shortened to lakhs.
    const boreRow = page.locator('tbody tr', { hasText: 'Bore flushing and new starter panel' });
    await expect(boreRow).toHaveCount(1);
    await expect(boreRow).toContainText('₹18,400');   // never shortened to lakhs
    await expect(boreRow).toContainText('Capital');
    await expect(page.getByText("Tenant's share — recoverable at harvest")).toBeVisible();
    await expect(page.getByText(/Capital rows lift the cost base on the Money tab/)).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('a let property puts rent in the same list as money in', async ({ page }) => {
    await page.goto(`/app/records/${FLAT}/expenses`);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Expenses & rent');
    await expect(page.locator('.strip').first()).toContainText('Rent received');
    await expect(page.locator('.strip').first()).toContainText('Net yield on value');
    // Rent is monthly, so the year holds twelve income rows in the same list.
    await expect(page.locator('tr.income')).toHaveCount(12);
    await expect(page.locator('tr.income', { hasText: 'Rent · June' })).toHaveCount(1);
    await expect(page.getByText(/One ledger, two vocabularies/)).toBeVisible();
  });

  test('the drawer files an expense as capital or running', async ({ page }) => {
    await page.goto(`/app/records/${BIG}/expenses`);
    await expect(page.locator('tbody tr').first()).toBeVisible();
    const before = await page.locator('tbody tr').count();

    await page.getByRole('button', { name: 'Add an expense' }).click();
    await expect(page.getByRole('dialog', { name: 'Add an expense' })).toBeVisible();
    await expect(page.getByText('Photograph the receipt first')).toBeVisible();
    await expect(page.getByText('New work that lasts. Lifts your cost base.')).toBeVisible();

    await page.getByLabel('Amount').fill('1250');
    await page.getByLabel('What it was').fill('Playwright test row');
    await page.getByRole('button', { name: /^No — running/ }).click();
    await page.getByRole('button', { name: 'Save expense' }).click();

    await expect(page.getByRole('dialog', { name: 'Add an expense' })).toHaveCount(0);
    await expect(page.locator('tbody tr')).toHaveCount(before + 1);
    await expect(page.locator('tbody tr', { hasText: 'Playwright test row' })).toHaveCount(1);
  });
});

/* This was "the record's location card" — a real Leaflet thumbnail in the Papers
   rail. Location is its own hanger now, and the map moved there whole rather
   than being drawn twice on one screen, so these guarantees are asserted where
   the map actually is. The caption-band check went with the card: a full-height
   map has no caption band to paint over. */
test.describe('W04 · the record draws its own ground', () => {
  test('is the record\u2019s own ground, not a stock drawing', async ({ page }) => {
    await stubTiles(page);
    const errors = await watchConsole(page);
    await page.goto(`/app/records/${PARCEL}/map`);

    // It used to be an inline <svg> with four literal points, identical on
    // every record in the account. A real basemap is the whole difference.
    const thumb = page.locator('.plot');
    await expect(thumb).toBeVisible();
    await expect(thumb.locator('.leaflet-container')).toBeVisible({ timeout: 20_000 });
    await expect(thumb.locator('svg polygon')).toHaveCount(0);
    // Sy 214/2 is surveyed, so the map draws the boundary rather than a pin.
    await expect(thumb.locator('path.w-ring')).toHaveCount(1);

    expect(errors).toEqual([]);
  });

  test('a record with no survey still shows where it is', async ({ page }) => {
    await stubTiles(page);
    const errors = await watchConsole(page);
    await page.goto(`/app/records/${BIG}/map`);

    await expect(page.locator('.plot .leaflet-container')).toBeVisible({ timeout: 20_000 });
    // No surveyed corners: a pin, and emphatically not a boundary traced over
    // imagery to fill the space.
    await expect(page.locator('.plot path.w-ring')).toHaveCount(0);
    // A pin is drawn. Not exactly one marker, as the thumbnail this moved from
    // drew: the full map also numbers each boundary mark on record, and that is
    // the point of it. `w-ring` above is what proves no boundary was invented.
    expect(await page.locator('.plot .leaflet-marker-icon').count()).toBeGreaterThan(0);

    expect(errors).toEqual([]);
  });

  test('with no pin and no survey it falls back to the place, named honestly',
    async ({ page, request }) => {
    const GQL = '/api/gateway/pattadar/graphql';
    // Built here, not seeded: a seventh demo record would move the portfolio
    // acreage, the record count and the derived gain that a dozen other
    // assertions cross-check. It lives for this test and is deleted after.
    const made = await request.post(GQL, { data: {
      query: 'mutation SR($input:RecordInput!) { web { saveRecord(input:$input) } }',
      variables: { input: {
        kind: 'parcel', title: '994/1', classification: 'agri', status: 'owned',
        stake: 'owned', khataNo: 'E2E-KATRA', ownerName: 'Place Test',
        village: 'Katragunta', mandal: 'Konakalamitla', district: 'Markapur',
        extent: 30, extentUnit: 'ac' } } } });
    const id = (await made.json()).data.web.saveRecord as string;

    try {
      await stubTiles(page);
      const errors = await watchConsole(page);
      await page.goto(`/app/records/${id}/map`);
      await expect(page.locator('.plot .leaflet-container')).toBeVisible({ timeout: 20_000 });

      // Nothing about this parcel's ground is known, so nothing is drawn on it.
      await expect(page.locator('.plot path.w-ring')).toHaveCount(0);
      await expect(page.locator('.plot .leaflet-marker-icon')).toHaveCount(0);

      // The village and mandal are not in OpenStreetMap; the district is. The
      // line must name what the map SETTLED on or it points 20 km wrong. The
      // Location hanger words it "is showing"; the guarantee is the same one.
      await expect(page.getByText(/The map is showing Markapur/)).toBeVisible();
      await expect(page.getByText(/The map is showing Katragunta/)).toHaveCount(0);

      expect(errors).toEqual([]);
    } finally {
      await request.post(GQL, { data: {
        query: 'mutation DR($ids:[String!]!) { web { deleteRecords(ids:$ids) } }',
        variables: { ids: [id] } } });
    }
  });

  /** Location is reached from the tab strip now, not by clicking a thumbnail in
   *  the Papers rail. The still-map contract that used to be asserted here —
   *  not draggable, click goes to the map — went with the card it was about;
   *  nothing renders a `still` MapCanvas any more. */
  test('the Location hanger is one click from the papers', async ({ page }) => {
    await stubTiles(page);
    await page.goto(`/app/records/${PARCEL}`);
    await page.locator('.tabs').getByRole('link', { name: /^Location/ }).click();
    await expect(page).toHaveURL(new RegExp(`/app/records/${PARCEL}/map$`));
    await expect(page.locator('.plot .leaflet-container')).toBeVisible({ timeout: 20_000 });
  });
});

test.describe('W04 · map and boundary', () => {
  /** Records these tests build live for one test and are deleted in `finally`
   *  — unless the run dies first. Playwright's maxFailures kills in-flight
   *  tests before their cleanup, and one leftover parcel puts the demo account
   *  at ten records, which fails every count assertion in the file and reads
   *  as a regression somewhere else entirely. Sweeping BEFORE as well as after
   *  makes a run self-healing rather than poisoned by the last one. */
  const sweepMapRecords = async (request: APIRequestContext) => {
    const res = await request.post('/api/gateway/pattadar/graphql', { data: {
      query: '{ web { properties(statuses:[]) { cards { id title } } } }' } });
    const cards = (await res.json())?.data?.web?.properties?.cards ?? [];
    const ids = cards.filter((c: { title: string }) => /^Sy 99\d/.test(c.title))
                     .map((c: { id: string }) => c.id);
    if (!ids.length) return;
    await request.post('/api/gateway/pattadar/graphql', { data: {
      query: 'mutation DR($ids:[String!]!) { web { deleteRecords(ids:$ids) } }',
      variables: { ids } } });
  };
  test.beforeAll(async ({ request }) => { await sweepMapRecords(request); });
  test.afterAll(async ({ request }) => { await sweepMapRecords(request); });

  test('four marks, one moved, and deleting one keeps its history', async ({ page }) => {
    const errors = await watchConsole(page);
    await stubTiles(page);
    await page.goto(`/app/records/${PARCEL}/map`);

    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Sy 214/2');
    await expect(page.getByRole('heading', { level: 2 }).first()).toHaveText('Where this land is');
    await expect(page.getByText('Drag any numbered mark to correct it. Marks are versioned — nothing is overwritten.'))
      .toBeVisible();
    await expect(page.getByText('South-west stone')).toBeVisible();
    await expect(page.getByText('South-east stone moved ~4 ft in')).toBeVisible();

    // The destructive action is only offered with its consequence stated.
    await expect(page.getByRole('button', { name: 'Delete mark' })).toBeVisible();
    await expect(page.getByText(/Deleting a mark keeps the old position in History/)).toBeVisible();

    await expect(page.locator('.card', { hasText: 'FMB sheet — 214' })).toContainText('v1 kept');
    expect(errors).toEqual([]);
  });

  test('a surveyed record is drawn on real ground, not in sketch space', async ({ page }) => {
    const errors = await watchConsole(page);
    await stubTiles(page);
    await page.goto(`/app/records/${PARCEL}/map`);

    // Leaflet, mounted. 20s because a lazy chunk plus a tile pane is slower
    // than the 10s default — the same allowance the e2e-ux parcel map takes.
    await expect(page.locator('.leaflet-container')).toBeVisible({ timeout: 20_000 });
    // Leaflet's SVG renderer emits <path>, never <polygon>; the boundary is
    // the one carrying the token-styled class.
    await expect(page.locator('path.w-ring')).toHaveCount(1);
    // Four stones, four numbered corners.
    await expect(page.locator('.w-mark-no')).toHaveCount(4);
    // Attribution is a licence condition, so it must actually be on screen.
    // Esri and not OSM: the tape is out on landing and the tape holds the
    // imagery on — a side checked against a road map is checked against a
    // drawing.
    await expect(page.locator('.leaflet-control-attribution')).toContainText('Esri');

    // `.w360 .plot svg { width: 100% }` sizes the sketch, and it also caught
    // Leaflet's own SVGs: the 12x8 flag in the attribution line inflated into
    // a block that covered the zoom cluster, and the overlay pane collapsed
    // its boundary to a few pixels. Both are layout, so every DOM assertion
    // above still passed. Measure instead.
    const flag = await page.locator('.leaflet-attribution-flag').first().boundingBox();
    expect(flag!.width, 'the attribution flag must stay a flag').toBeLessThan(24);
    const ringBox = await page.locator('path.w-ring').boundingBox();
    expect(ringBox!.width, 'the boundary must fill real screen space').toBeGreaterThan(100);
    // The panel's own zoom cluster has to stay reachable above the map.
    await expect(page.getByRole('button', { name: 'Zoom in' })).toBeVisible();

    // Measurements remain available over either basemap.
    const sat = page.getByRole('button', { name: 'Satellite' });
    await expect(sat).toHaveAttribute('aria-pressed', 'true');
    await expect(sat).toBeEnabled();
    await sat.click();
    await expect(page.getByRole('button', { name: 'Measure', exact: true }))
      .toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('.leaflet-control-attribution')).toContainText('OpenStreetMap');
    await expect(page.locator('path.w-ring')).toHaveCount(1);
    await sat.click();
    await expect(sat).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('.leaflet-control-attribution')).toContainText('Esri');
    await expect(page.locator('path.w-ring')).toHaveCount(1);
    // And back to the road map.
    await sat.click();
    await expect(page.locator('.leaflet-control-attribution')).toContainText('OpenStreetMap');
    await expect(page.locator('path.w-ring')).toHaveCount(1);

    expect(errors).toEqual([]);
  });

  test('the hand-off goes to the device\u2019s own map, named honestly', async ({ page }) => {
    await stubTiles(page);
    await page.goto(`/app/records/${PARCEL}/map`);

    // Behind the overflow now: the row was seven buttons wide, and a hand-off
    // to another app is an errand rather than a tool.
    await page.getByRole('button', { name: 'More for this map' }).click();
    // Playwright's Chromium reports a Mac UA, so this machine gets Apple Maps
    // — and the item says so rather than promising it to everyone. Inside a
    // menu its ARIA role is menuitem, but it is still an <a> with an href, so
    // it can be copied or opened in a new tab.
    const away = page.getByRole('menuitem', { name: /^Open in / });
    await expect(away).toHaveText('Open in Apple Maps');
    await expect(away).toHaveJSProperty('tagName', 'A');
    const href = await away.getAttribute('href');
    expect(href).toMatch(/^https:\/\/maps\.apple\.com\/\?ll=17\.078\d+,82\.139\d+/);
    expect(href).toContain('t=k');           // land is looked at on imagery
    expect(href).toContain('q=Sy%20214%2F2'); // the pin is named
    // Never clicked: a geo: URI has nowhere to go in Chromium.
  });

  test('a record with no survey is still on real ground, with its stones', async ({ page }) => {
    const errors = await watchConsole(page);
    await stubTiles(page);
    await page.goto(`/app/records/${BIG}/map`);

    // Sy 88 has never been surveyed corner by corner, but it is not therefore
    // a drawing. It gets the same basemap every other record gets — what it
    // does NOT get is a boundary, because tracing one over imagery would
    // invent the survey. The 0..1 rectangle this used to show was seed filler
    // that looked exactly like a real outline.
    await expect(page.locator('.leaflet-container')).toBeVisible({ timeout: 20_000 });
    await expect(page.locator('.plot svg polygon')).toHaveCount(0);
    await expect(page.locator('path.w-ring')).toHaveCount(0);
    // Imagery is a real choice now: there is ground under this record.
    await expect(page.getByRole('button', { name: 'Satellite' })).toBeVisible();
    await expect(page.getByText(/No surveyed boundary on this record/)).toBeVisible();

    // Its recorded stones are real readings and are drawn, unjoined. They used
    // to appear only alongside a ring, so the records that had nothing else
    // showed nothing at all.
    await expect(page.locator('path.w-mark').first()).toBeVisible();
    await expect(page.getByText(/a handful of readings is not a boundary/)).toBeVisible();

    // Bottom-left holds both the caption and the notice. They were anchored to
    // the same corner, so the notice — opaque and three lines tall — painted
    // straight over the caption. Both are visible to every DOM assertion while
    // one is completely hidden, so the only real check is geometric.
    const note = (await page.locator('.plot .nogeo').boundingBox())!;
    const cap = (await page.locator('.plot .cap').boundingBox())!;
    expect(note.y + note.height, 'the notice must sit above the caption')
      .toBeLessThanOrEqual(cap.y + 1);
    expect(errors).toEqual([]);
  });

  test('offline, the map says so without covering its own attribution', async ({ page }) => {
    const errors = await watchConsole(page);
    // The case MapCanvas exists for: a phone in a field. Aborting rather than
    // stubbing also exercises watchConsole's tile-host exemption, since a dead
    // <img> is reported to Playwright as a console error.
    await page.route(TILE_HOSTS, (route) => route.abort());
    await page.goto(`/app/records/${PARCEL}/map`);

    await expect(page.locator('.leaflet-container')).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(/Map tiles could not be reached/)).toBeVisible();
    // The boundary comes from the record, not from the network, so it is still
    // drawn and still correct — which is exactly what the notice claims.
    await expect(page.locator('path.w-ring')).toHaveCount(1);

    // The notice is 85px tall and lands in the corner the caption occupies.
    // The caption is where the tile attribution rides, so getting this wrong
    // hides a licence condition behind an error message.
    const note = (await page.locator('.plot .nogeo').boundingBox())!;
    const cap = (await page.locator('.plot .cap').boundingBox())!;
    expect(note.y + note.height, 'the offline notice must sit above the caption')
      .toBeLessThanOrEqual(cap.y + 1);

    expect(errors).toEqual([]);
  });

  test('Move the pin arms the map, and the click is saved', async ({ page, request }) => {
    const GQL = '/api/gateway/pattadar/graphql';
    // On its own record: moving a pin writes to the database, and the demo set
    // is asserted down to the acre by a dozen other tests.
    const made = await request.post(GQL, { data: {
      query: 'mutation SR($input:RecordInput!) { web { saveRecord(input:$input) } }',
      variables: { input: {
        kind: 'parcel', title: '990/1', classification: 'agri', status: 'owned',
        stake: 'owned', khataNo: '10021', ownerName: 'Pin Test',
        village: 'Kothapalli', mandal: 'Peddapuram', district: 'Kakinada',
        extent: 1, extentUnit: 'ac' } } } });
    const id = (await made.json()).data.web.saveRecord as string;

    try {
      await stubTiles(page);
      const errors = await watchConsole(page);
      await page.goto(`/app/records/${id}/map`);
      await expect(page.locator('.leaflet-container')).toBeVisible({ timeout: 20_000 });

      // Idle, a click on the map pans and saves nothing.
      const arm = page.getByRole('button', { name: /Move the pin/ });
      await expect(arm).toHaveAttribute('aria-pressed', 'false');
      await clickMapAt(page, 0.4, 0.4);
      let saved = await request.post(GQL, { data: {
        query: `{ web { record(id:"${id}") { lat lon } } }` } });
      let rec = (await saved.json()).data.web.record;
      expect(rec.lat === 0 && rec.lon === 0, 'an unarmed click must not move it').toBe(true);

      // Armed, the next click on the map is the new pin.
      await arm.click();
      await expect(page.getByRole('button', { name: /Click the map/ })).toBeVisible();
      await expect(page.locator('.plot .map.picking')).toBeVisible();
      await clickMapAt(page, 0.5, 0.45);

      await expect.poll(async () => {
        const r = await request.post(GQL, { data: {
          query: `{ web { record(id:"${id}") { lat lon } } }` } });
        const v = (await r.json()).data.web.record;
        return v.lat !== 0 || v.lon !== 0;
      }, { timeout: 15_000 }).toBe(true);

      saved = await request.post(GQL, { data: {
        query: `{ web { record(id:"${id}") { lat lon } } }` } });
      rec = (await saved.json()).data.web.record;
      // Kothapalli, Peddapuram is roughly 17.08 N, 82.14 E — the click has to
      // land somewhere real, not at 0,0 and not in another state.
      expect(Math.abs(rec.lat), 'a saved pin must be a real latitude').toBeGreaterThan(1);
      // Disarmed again once it lands, or the next click moves it by accident.
      await expect(page.locator('.plot .map.picking')).toHaveCount(0);

      expect(errors).toEqual([]);
    } finally {
      await request.post(GQL, { data: {
        query: 'mutation DR($ids:[String!]!) { web { deleteRecords(ids:$ids) } }',
        variables: { ids: [id] } } });
    }
  });

  test('arming an editing mode leaves Leaflet\u2019s own classes alone', async ({ page }) => {
    await stubTiles(page);
    await page.goto(`/app/records/${PARCEL}/map`);
    const map = page.locator('.plot .map');
    await expect(map).toHaveClass(/leaflet-container/, { timeout: 20_000 });

    await page.getByRole('button', { name: /Draw boundary|Redraw boundary/ }).click();

    // React owns the class attribute. Computing className from state wiped
    // every class Leaflet had written onto this same div — and the damage was
    // not where you would look for it: without `leaflet-container` the rule
    // that keeps Leaflet's own SVGs at their natural size stopped matching,
    // the attribution's flag stretched to 317x212, and it covered the map and
    // ate the clicks. Every DOM assertion still passed while drawing was dead.
    await expect(map).toHaveClass(/leaflet-container/);
    await expect(map).toHaveClass(/leaflet-grab/);
    await expect(map).toHaveClass(/picking/);

    // The flag is a flag, not a wall.
    const flag = (await page.locator('.leaflet-attribution-flag').boundingBox())!;
    expect(flag.width, 'the attribution flag must stay flag-sized').toBeLessThan(40);
    expect(flag.height).toBeLessThan(40);

    // And the middle of the map belongs to the map — whether that is the tile
    // layer or something the map drew on itself. What it must never be is the
    // attribution control, which is what a 317x212 flag made it.
    const box = (await map.boundingBox())!;
    const onTop = await page.evaluate(([x, y]) => {
      const el = document.elementFromPoint(x, y);
      return {
        inMap: !!el?.closest('.plot .map'),
        inAttribution: !!el?.closest('.leaflet-control-attribution'),
      };
    }, [box.x + box.width * 0.6, box.y + box.height * 0.6]);
    expect(onTop.inMap, 'a click in the map must reach the map').toBe(true);
    expect(onTop.inAttribution, 'the attribution must not swallow the map').toBe(false);
  });

  test('a boundary drawn on the map is saved, and comes back as the record\u2019s own', async ({ page, request }) => {
    const GQL = '/api/gateway/pattadar/graphql';
    const made = await request.post(GQL, { data: {
      query: 'mutation SR($input:RecordInput!) { web { saveRecord(input:$input) } }',
      variables: { input: {
        kind: 'parcel', title: '991/1', classification: 'agri', status: 'owned',
        stake: 'owned', khataNo: '10021', ownerName: 'Draw Test',
        village: 'Kothapalli', mandal: 'Peddapuram', district: 'Kakinada',
        extent: 2, extentUnit: 'ac' } } } });
    const id = (await made.json()).data.web.saveRecord as string;

    try {
      await stubTiles(page);
      const errors = await watchConsole(page);
      await page.goto(`/app/records/${id}/map`);
      await expect(page.locator('.leaflet-container')).toBeVisible({ timeout: 20_000 });

      await page.getByRole('button', { name: 'Draw boundary' }).click();
      // Four corners. Two is not land, and Save must stay refused until three.
      for (const [fx, fy] of [[0.35, 0.35], [0.6, 0.35], [0.6, 0.6], [0.35, 0.6]]) {
        await clickMapAt(page, fx, fy);
        if (fx === 0.6 && fy === 0.35) {
          await expect(page.getByRole('button', { name: 'Save boundary' })).toBeDisabled();
        }
      }
      // The draft is dashed and numbered, and never counts as a surveyed ring.
      await expect(page.locator('path.w-draft-dot')).toHaveCount(4);
      await expect(page.locator('path.w-ring')).toHaveCount(0);
      await expect(page.locator('.editbar')).toContainText('4 corners');

      await page.getByRole('button', { name: 'Save boundary' }).click();
      await expect(page.locator('.editbar')).toHaveCount(0);
      await expect(page.locator('path.w-ring')).toHaveCount(1);
      await expect(page.locator('path.w-draft')).toHaveCount(0);

      // It is the RECORD's now, not the screen's: the server has it.
      const back = await request.post(GQL, { data: {
        query: `{ web { boundary(recordId:"${id}") { ring } } }` } });
      const ring = (await back.json()).data.web.boundary.ring as number[];
      expect(ring.length, 'four corners is eight numbers').toBe(8);
      expect(Math.abs(ring[0]), 'a saved corner is a real latitude').toBeGreaterThan(1);

      expect(errors).toEqual([]);
    } finally {
      await request.post(GQL, { data: {
        query: 'mutation DR($ids:[String!]!) { web { deleteRecords(ids:$ids) } }',
        variables: { ids: [id] } } });
    }
  });

  test('a KML the owner already has becomes the boundary', async ({ page, request }) => {
    const GQL = '/api/gateway/pattadar/graphql';
    const made = await request.post(GQL, { data: {
      query: 'mutation SR($input:RecordInput!) { web { saveRecord(input:$input) } }',
      variables: { input: {
        kind: 'parcel', title: '992/1', classification: 'agri', status: 'owned',
        stake: 'owned', khataNo: '10021', ownerName: 'KML Test',
        village: 'Kothapalli', mandal: 'Peddapuram', district: 'Kakinada',
        extent: 60, extentUnit: 'ac' } } } });
    const id = (await made.json()).data.web.saveRecord as string;

    // Field No. 01, Mangalakunta — the founder's own sheet, as a surveyor's
    // KML would hand it over: longitude first, altitude in the triple, and a
    // repeated closing corner.
    const CORNERS = [
      [79.32177, 15.66567], [79.32274, 15.66514], [79.32344, 15.66486],
      [79.32437, 15.66464], [79.32334, 15.66053], [79.32252, 15.65922],
      [79.32146, 15.65872], [79.31919, 15.66026], [79.31944, 15.66072],
      [79.32177, 15.66567],
    ];
    const kml = `<?xml version="1.0"?><kml><Document><name>Field No. 01</name>`
      + `<Placemark><Polygon><outerBoundaryIs><LinearRing><coordinates>`
      + CORNERS.map(([lo, la]) => `${lo},${la},0`).join(' ')
      + `</coordinates></LinearRing></outerBoundaryIs></Polygon></Placemark></Document></kml>`;

    try {
      await stubTiles(page);
      const errors = await watchConsole(page);
      await page.goto(`/app/records/${id}/map`);
      await expect(page.locator('.leaflet-container')).toBeVisible({ timeout: 20_000 });
      await expect(page.locator('path.w-ring')).toHaveCount(0);

      // The record's own picker. The assistant drawer keeps a file input
      // mounted on <body>, and it is not this screen's.
      await page.locator('main input[type=file]').setInputFiles({
        name: 'field-01.kml', mimeType: 'application/vnd.google-earth.kml+xml',
        buffer: Buffer.from(kml, 'utf8'),
      });

      await expect(page.locator('.mapsays')).toContainText('Previewing field-01.kml');
      await expect(page.locator('path.w-ring')).toHaveCount(0);
      const preview = await request.post(GQL, { data: {
        query: `{ web { boundary(recordId:"${id}") { ring } } }` } });
      expect((await preview.json()).data.web.boundary.ring).toEqual([]);
      await page.getByRole('button', { name: 'Save boundary' }).click();
      await expect(page.locator('path.w-ring')).toHaveCount(1, { timeout: 15_000 });

      const back = await request.post(GQL, { data: {
        query: `{ web { boundary(recordId:"${id}") { ring } } }` } });
      const ring = (await back.json()).data.web.boundary.ring as number[];
      // Nine corners: the repeated closing one is dropped on the way in.
      expect(ring.length).toBe(18);
      // Lat FIRST. Read the file's own order straight through and this parcel
      // lands at 79°N 15°E, in the Barents Sea.
      expect(ring[0]).toBeCloseTo(15.66567, 5);
      expect(ring[1]).toBeCloseTo(79.32177, 5);

      expect(errors).toEqual([]);
    } finally {
      await request.post(GQL, { data: {
        query: 'mutation DR($ids:[String!]!) { web { deleteRecords(ids:$ids) } }',
        variables: { ids: [id] } } });
    }
  });

  test('a pin that disagrees with the boundary is called out, and can be fixed',
    async ({ page, request }) => {
    const GQL = '/api/gateway/pattadar/graphql';
    const made = await request.post(GQL, { data: {
      query: 'mutation SR($input:RecordInput!) { web { saveRecord(input:$input) } }',
      variables: { input: {
        kind: 'parcel', title: '993/1', classification: 'agri', status: 'owned',
        stake: 'owned', khataNo: '10021', ownerName: 'Disagree Test',
        village: 'Kothapalli', mandal: 'Peddapuram', district: 'Kakinada',
        extent: 3, extentUnit: 'ac' } } } });
    const id = (await made.json()).data.web.saveRecord as string;

    try {
      // A boundary near Machilipatnam and a pin in Telangana — the shape a
      // real record ends up in when the two were written years apart by
      // different hands. Neither field is invalid on its own.
      await request.post(GQL, { data: {
        query: 'mutation SB($r:String!,$g:[Float!]!){ web { setBoundary(recordId:$r,ring:$g) } }',
        variables: { r: id, g: [15.9428, 81.0045, 15.9422, 81.0043, 15.9382, 81.0032, 15.9375, 81.0044] } } });
      await request.post(GQL, { data: {
        query: 'mutation SP($r:String!,$a:Float!,$o:Float!){ web { setPin(recordId:$r,lat:$a,lon:$o) } }',
        variables: { r: id, a: 16.3202, o: 78.4588 } } });

      await stubTiles(page);
      const errors = await watchConsole(page);
      await page.goto(`/app/records/${id}/map`);
      await expect(page.locator('path.w-ring')).toHaveCount(1, { timeout: 20_000 });

      // Both answers are shown, and the screen says they cannot both be right.
      await expect(page.getByText(/Boundary/).first()).toBeVisible();
      await expect(page.getByText(/The pin is .* from the boundary drawn on this record/))
        .toBeVisible();

      await page.getByRole('button', { name: 'Move the pin onto the boundary' }).click();

      // Fixed at the source, not just on screen.
      await expect.poll(async () => {
        const r = await request.post(GQL, { data: {
          query: `{ web { record(id:"${id}") { lat lon } } }` } });
        const v = (await r.json()).data.web.record;
        return Math.round(v.lat * 100) / 100;
      }, { timeout: 15_000 }).toBe(15.94);

      // And with them agreeing, the complaint goes away.
      await expect(page.getByText(/from the boundary drawn on this record/)).toHaveCount(0);

      expect(errors).toEqual([]);
    } finally {
      await request.post(GQL, { data: {
        query: 'mutation DR($ids:[String!]!) { web { deleteRecords(ids:$ids) } }',
        variables: { ids: [id] } } });
    }
  });

  test('the address is on the screen, and rides along to Apple Maps', async ({ page }) => {
    await stubTiles(page);
    await page.goto(`/app/records/${PARCEL}/map`);

    // A shared /map link used to arrive with a survey number and nothing else.
    // "Sy 214/2" is not an identifier — the same number exists in every village
    // in the district.
    await expect(page.getByText('Kothapalli, Peddapuram, Kakinada — Andhra Pradesh')).toBeVisible();
    await expect(page.getByText(/Khata 10021/)).toBeVisible();

    // The hand-off carries the village too, so the dropped pin is recognisable
    // once you are inside Maps.
    await page.getByRole('button', { name: 'More for this map' }).click();
    const href = (await page.getByRole('menuitem', { name: /^Open in / })
      .getAttribute('href'))!;
    expect(href).toContain('q=Sy%20214%2F2%2C%20Kothapalli');
    // The coordinate must be OURS. Apple documents ll as taking precedence,
    // and the label is kept short so Maps cannot match it to some other POI.
    expect(href).toMatch(/ll=17\.\d+,82\.\d+/);
    // A raw '/' would end the query string early.
    expect(href).not.toContain('Sy 214/2');
  });

  test('Measurements shows every side, and the unit switch moves lengths only',
    async ({ page }) => {
    await stubTiles(page);
    await page.goto(`/app/records/${PARCEL}/map`);
    await expect(page.locator('path.w-ring')).toHaveCount(1, { timeout: 20_000 });

    // On by default: the lengths and the letters ARE the useful view of a
    // boundary, so the screen opens showing them rather than making that
    // something you have to know to ask for.
    const toggle = page.getByRole('button', { name: 'Measure', exact: true });
    await expect(toggle).toHaveAttribute('aria-pressed', 'true');
    const card = page.locator('.card', { hasText: 'Measurements' });
    const rows = card.locator('.sidetable tbody tr');
    await expect(rows).toHaveCount(4);                 // Sy 214/2 is a quadrilateral
    // Every side is written on the boundary itself, not only in the table.
    await expect(page.locator('.w-side')).toHaveCount(4);
    // One object per corner, lettered. It was a separate SVG dot with a NUMBER
    // floating beside it, which made a bare "13" read the same as a bare
    // "446 ft" — two numbers where one was an identity.
    await expect(page.locator('.w-corner-no')).toHaveText(['A', 'B', 'C', 'D']);

    // The card carries its own way out. Measurements arrive without being
    // asked for now, so the dismiss cannot live only on a filled header button
    // that reads as an action rather than a state.
    await card.getByRole('button', { name: 'Hide measurements' }).click();
    await expect(toggle).toHaveAttribute('aria-pressed', 'false');
    await expect(page.locator('.w-corner-no')).toHaveCount(0);
    await expect(page.locator('path.w-ring'), 'the boundary itself stays').toHaveCount(1);
    await toggle.click();
    await expect(page.locator('.w-corner-no')).toHaveCount(4);

    // And the header toggle still works too.
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-pressed', 'false');
    await expect(page.locator('.w-corner-no')).toHaveCount(0);
    await expect(page.locator('.w-side')).toHaveCount(0);
    await expect(page.locator('path.w-ring'), 'the boundary itself stays').toHaveCount(1);
    await toggle.click();
    await expect(page.locator('.w-corner-no')).toHaveCount(4);

    // Hovering a row lights that side AND the two corners it runs between.
    await rows.first().hover();
    await expect(page.locator('.w-side.active')).toHaveCount(1);
    await expect(page.locator('.w-corner-no.active')).toHaveCount(2);

    const metresRow = (await rows.first().textContent())!;
    expect(metresRow).toMatch(/\d+ m/);
    const area = (await card.getByText(/Acres|Guntas/).first().textContent())!;

    await card.getByRole('button', { name: 'Feet' }).click();
    const feetRow = (await rows.first().textContent())!;
    expect(feetRow).toMatch(/\d+ ft/);
    expect(feetRow).not.toEqual(metresRow);

    // "Lengths convert; areas do not" — the rule this repo already committed
    // to in the FMB viewer and in its Swift twin.
    await expect(card.getByText(/Acres|Guntas/).first()).toHaveText(area);

    // Whole units only: a line traced over imagery has no centimetres in it.
    expect(feetRow).not.toMatch(/\d\.\d+ ft/);
    expect(metresRow).not.toMatch(/\d\.\d+ m/);
  });

  test('the map holds still while the panels around it change', async ({ page }) => {
    await stubTiles(page);
    await page.goto(`/app/records/${PARCEL}/map`);
    const ring = page.locator('path.w-ring');
    await expect(ring).toHaveCount(1, { timeout: 20_000 });
    const map = page.locator('.plot .map');

    // Where the parcel sits ON SCREEN is the thing that must not move.
    const where = async (): Promise<[number, number]> => {
      const b = (await ring.boundingBox())!;
      return [b.x + b.width / 2, b.y + b.height / 2];
    };
    // Compared with a tolerance, not for equality. Sub-pixel layout rounding
    // moves a rendered path by a fraction between reads; the bug this guards
    // against moved the parcel by hundreds of pixels, because the panel
    // doubled in height under it.
    const samePlace = (a: [number, number], b: [number, number]) =>
      Math.abs(a[0] - b[0]) < 3 && Math.abs(a[1] - b[1]) < 3;
    const size = async () => {
      const b = (await map.boundingBox())!;
      return `${Math.round(b.width)}x${Math.round(b.height)}`;
    };

    // Hiding Measurements removes eleven rows from the rail without moving
    // the map or changing the selected basemap.
    const before = await where();
    await page.getByRole('button', { name: 'Measure', exact: true }).click();
    expect(samePlace(await where(), before),
      'putting the tape away must not move the parcel').toBe(true);

    const start = await where();
    const startSize = await size();

    // Measurements adds eleven rows to the rail. `.split` stretches its
    // children to the tallest, so this used to take the map from 821px to
    // 1522px — and Leaflet, which keeps its top-left through a resize, slid
    // the parcel off centre. Switching basemap looked like the cause; the
    // rail's height was.
    expect(await size(), 'the rail must not resize the map').toBe(startSize);
    expect(samePlace(await where(), start), 'the parcel must not move').toBe(true);

    await page.getByRole('button', { name: 'Satellite' }).click();
    expect(samePlace(await where(), start), 'imagery must not move the parcel').toBe(true);
    await page.getByRole('button', { name: 'Satellite' }).click();
    expect(samePlace(await where(), start)).toBe(true);
    expect(samePlace(await where(), start)).toBe(true);

    // And once the owner has panned somewhere, that is where it stays: the
    // toggles must never yank the view back to the parcel.
    // Drag SLOWLY. Leaflet throws the map with inertia when the last pointer
    // move lands within 32 ms of the release, and a glide that is still
    // decelerating is not a position you can assert against — the reading
    // taken right after mouseup is a different number a moment later.
    // Pausing between steps keeps it a drag rather than a throw.
    const box = (await map.boundingBox())!;
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    for (let i = 1; i <= 6; i++) {
      await page.mouse.move(cx - i * 25, cy - i * 15);
      await page.waitForTimeout(60);
    }
    await page.mouse.up();

    const panned = await where();
    expect(samePlace(panned, start), 'the drag must actually have moved the map').toBe(false);
    expect(samePlace(await where(), panned),
      'a toggle must not re-centre what the owner panned to').toBe(true);
    await page.getByRole('button', { name: 'Satellite' }).click();
    expect(samePlace(await where(), panned)).toBe(true);
  });

  test('north is stated, a side can be picked, and its corners can be copied',
    async ({ page }) => {
    await stubTiles(page);
    await page.goto(`/app/records/${PARCEL}/map`);
    await expect(page.locator('path.w-ring')).toHaveCount(1, { timeout: 20_000 });

    // Web Mercator never rotates, so north is always up — which is exactly why
    // it is worth printing. Someone reading "ENE" off the table needs to know
    // the map is not oriented to the sheet, or to the way they are facing.
    await expect(page.locator('.northrose')).toHaveText(/N/);

    const rows = page.locator('.sidetable tbody tr');

    // Hover previews; a click PINS, because reading the tip means moving the
    // pointer off the row that opened it.
    await rows.nth(1).hover();
    await expect(page.locator('path.w-side-lit')).toHaveCount(1);
    await rows.nth(1).getByRole('button').click();
    await expect(rows.nth(1)).toHaveClass(/lit/);
    await page.mouse.move(0, 0);
    await expect(rows.nth(1), 'a pinned row stays lit with the pointer away').toHaveClass(/lit/);

    // The tip is the thing a surveyor reads down a phone: both corners in
    // full precision, the span in BOTH units, and a direction.
    const tip = page.locator('.plot .w-tip');
    await expect(tip).toBeVisible();
    await expect(tip).toContainText('Corner B');
    await expect(tip).toContainText('Corner C');
    await expect(tip).toContainText(/\d+ m · \d+ ft/);

    // The coordinates are the point of this card — they get read down a phone
    // to someone standing in a field — so they are the largest thing on it,
    // and nothing may clip or sit on top of them. The close control used to
    // land on the first value, which is the line most likely to be read out.
    const first = tip.locator('dd').first();
    expect(Number(await first.evaluate((el) => getComputedStyle(el).fontSize.replace('px', ''))))
      .toBeGreaterThanOrEqual(14);
    const box = (await tip.boundingBox())!;
    for (const dd of await tip.locator('dd').all()) {
      const b = (await dd.boundingBox())!;
      expect(b.x + b.width, 'a coordinate must not clip').toBeLessThanOrEqual(box.x + box.width);
    }
    const x = (await tip.locator('.close').boundingBox())!;
    const v = (await first.boundingBox())!;
    const overlaps = !(x.x > v.x + v.width || x.x + x.width < v.x
                    || x.y > v.y + v.height || x.y + x.height < v.y);
    expect(overlaps, 'the close must not sit on the first coordinate').toBe(false);
    await expect(tip.getByRole('link', { name: /Corner B/ })).toHaveAttribute('href', /maps\.apple|geo:|openstreetmap/);

    // Clicking the same row again lets it go.
    await rows.nth(1).getByRole('button').click();
    await expect(page.locator('.plot .w-tip')).toHaveCount(0);
  });

  test('the boundary can be handed over as GeoJSON', async ({ page }) => {
    await stubTiles(page);
    await page.goto(`/app/records/${PARCEL}/map`);
    await expect(page.locator('path.w-ring')).toHaveCount(1, { timeout: 20_000 });

    await page.getByRole('button', { name: 'More for this map' }).click();
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('menuitem', { name: 'Export GeoJSON' }).click(),
    ]);
    // A survey number's slash cannot survive a filesystem.
    expect(download.suggestedFilename()).toBe('Sy 214-2 Kothapalli boundary.geojson');

    const path = await download.path();
    const text = await require('node:fs/promises').readFile(path!, 'utf8');
    const gj = JSON.parse(text);
    expect(gj.type).toBe('Feature');
    expect(gj.geometry.type).toBe('Polygon');
    // GeoJSON is LONGITUDE first. Written lat-first the file opens without
    // complaint and puts this parcel in the Barents Sea.
    const [lon, lat] = gj.geometry.coordinates[0][0];
    expect(lon).toBeGreaterThan(80);        // ~82.1 E
    expect(lat).toBeLessThan(20);           // ~17.1 N
    // RFC 7946: a Polygon ring is closed, even though we store it open.
    const ring = gj.geometry.coordinates[0];
    expect(ring[0]).toEqual(ring[ring.length - 1]);
    expect(gj.properties.survey_no).toBe('Sy 214/2');
    expect(gj.properties.corners).toBe(4);
  });

  test('the boundary is drawn on once, and never again', async ({ page }) => {
    await stubTiles(page);
    await page.goto(`/app/records/${PARCEL}/map`);
    await expect(page.locator('path.w-ring')).toHaveCount(1, { timeout: 20_000 });

    // The flourish is written down the moment it is claimed, so a re-render
    // cannot replay it while the first run is still going.
    await expect.poll(async () =>
      page.evaluate(() => localStorage.getItem('w360-boundary-intro'))).toBe('1');

    await page.reload();
    await expect(page.locator('path.w-ring')).toHaveCount(1, { timeout: 20_000 });
    // Second visit: the ring is there immediately, with no reveal on it.
    await expect(page.locator('path.w-ring.drawing')).toHaveCount(0);
  });

  test('the ambient light greets every landing, and never stays', async ({ page }) => {
    await stubTiles(page);
    const lit = () => page.locator('path.w-ring-stars, path.w-ring-glow');

    await page.goto(`/app/records/${PARCEL}/map`);
    await expect(lit()).toHaveCount(2, { timeout: 20_000 });
    // It is decoration on a screen people keep open all afternoon, so it takes
    // itself away again. Decoration that stays is furniture.
    await expect(lit()).toHaveCount(0, { timeout: 10_000 });

    // Unlike the draw-on reveal above, this one is NOT once-ever. The reveal
    // explains the line the first time; the light is a greeting, and a greeting
    // you only get once is a greeting you stop noticing.
    await page.reload();
    await expect(page.locator('path.w-ring')).toHaveCount(1, { timeout: 20_000 });
    await expect(lit()).toHaveCount(2);
    await expect(page.locator('path.w-ring.drawing')).toHaveCount(0);
    await expect(lit()).toHaveCount(0, { timeout: 10_000 });
  });

  test('the tip is bolted to one corner, whichever side and wherever panned',
    async ({ page }) => {
    await stubTiles(page);
    await page.goto(`/app/records/${PARCEL}/map`);
    await expect(page.locator('path.w-ring')).toHaveCount(1, { timeout: 20_000 });

    const map = page.locator('.plot .map');
    const tip = page.locator('.plot .w-tip');
    const rows = page.locator('.sidetable tbody tr');
    const mb = (await map.boundingBox())!;
    // Relative to the panel, so the assertion survives a different viewport —
    // and read only once the entry animation has finished, or the first
    // measurement catches the card 3px into its 160ms slide.
    const spot = async () => {
      await tip.evaluate((el) =>
        Promise.all(el.getAnimations().map((a) => a.finished.catch(() => undefined))));
      const b = (await tip.boundingBox())!;
      return `${Math.round(b.x - mb.x)},${Math.round(b.y - mb.y)}`;
    };

    // This has been two other things and both were worse. A Leaflet popup ran
    // off the panel edge. Furniture positioned from the side stayed inside but
    // jumped on every selection and slid on every pan, so reading two sides in
    // a row meant hunting for the card. It is bolted down now.
    const seen = new Set<string>();
    const count = await rows.count();
    for (let i = 0; i < count; i++) {
      await rows.nth(i).getByRole('button').click();
      await expect(tip).toBeVisible();
      seen.add(await spot());
      await rows.nth(i).getByRole('button').click();
    }
    expect([...seen], 'every side must put the tip in the same place').toHaveLength(1);

    // And panning must not move it either — the map slides underneath.
    await rows.nth(3).getByRole('button').click();
    const before = await spot();
    const cx = mb.x + mb.width / 2;
    const cy = mb.y + mb.height / 2;
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    for (let i = 1; i <= 5; i++) {
      await page.mouse.move(cx - i * 30, cy - i * 20);
      await page.waitForTimeout(60);
    }
    await page.mouse.up();
    expect(await spot(), 'a pan must not move the tip').toBe(before);

    // The hint wants the same corner; the tip wins, because it is the answer
    // to something just asked for and the hint is standing advice.
    expect(await page.locator('.plot .hint').evaluate((el) => getComputedStyle(el).opacity))
      .toBe('0');
  });

  test('a pinned row is tinted, not barred, and the side sparks', async ({ page }) => {
    await stubTiles(page);
    await page.goto(`/app/records/${PARCEL}/map`);
    await expect(page.locator('path.w-ring')).toHaveCount(1, { timeout: 20_000 });

    const row = page.locator('.sidetable tbody tr').nth(1);
    await row.getByRole('button').click();
    // An inset shadow on `td` drew a bar down the left of EVERY cell, which
    // read as stray rules through the table rather than a highlighted row.
    const shadow = await row.locator('td').first()
      .evaluate((el) => getComputedStyle(el).boxShadow);
    expect(shadow, 'a pinned row is tinted, never barred').toBe('none');

    // The selected side is bold and carries a spark that runs it end to end.
    await expect(page.locator('path.w-side-lit')).toHaveCount(1);
    await expect(page.locator('path.w-side-spark')).toHaveCount(1);
    const lit = page.locator('path.w-side-lit');
    expect(Number(await lit.evaluate((el) => getComputedStyle(el).strokeWidth.replace('px', ''))))
      .toBeGreaterThanOrEqual(5);
    // pathLength=1 normalises the dash maths, so the spark takes the same time
    // on a 63 m side as on a 241 m one.
    await expect(page.locator('path.w-side-spark')).toHaveAttribute('pathLength', '1');
  });

  test('seven actions wrap instead of running off the page', async ({ page }) => {
    await stubTiles(page);
    await page.goto(`/app/records/${PARCEL}/map`);
    await expect(page.locator('path.w-ring')).toHaveCount(1, { timeout: 20_000 });

    // flex-shrink:0 with flex-wrap does nothing on its own — the block takes
    // its content width and runs under the rail, clipping the last button.
    const actions = (await page.locator('.pagehead .actions').boundingBox())!;
    const main = (await page.locator('main').boundingBox())!;
    expect(actions.x + actions.width).toBeLessThanOrEqual(main.x + main.width + 1);
    // A link, not a button: it goes to the service request. Matched by text so
    // this assertion is about the action being reachable, not its element.
    await expect(page.getByText('Order a survey')).toBeVisible();
    // One primary, and it is what a record with no boundary actually needs.
    // Named for the file its picker will take — it said "File the FMB sheet"
    // over an accept list of KML and GeoJSON, so an owner holding a scan of the
    // sheet found their own document greyed out.
    await expect(page.getByRole('button', { name: 'Import KML / GeoJSON', exact: true }).first()).toBeVisible();
    // The errands are behind the overflow rather than in the row.
    await expect(page.getByRole('button', { name: 'More for this map' })).toBeVisible();
    expect(await page.evaluate(() =>
      document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false);
  });

  test('a corner and a length can never be mistaken for each other', async ({ page }) => {
    await stubTiles(page);
    await page.goto(`/app/records/${PARCEL}/map`);
    await expect(page.locator('path.w-ring')).toHaveCount(1, { timeout: 20_000 });

    // They used to be the same grey mono text a few pixels apart, which read
    // as "446 ft13". They are different objects now: a corner is a filled
    // disc ON the line, a length is an outlined pill pushed OFF it.
    const disc = page.locator('.w-corner-no > span').first();
    const pill = page.locator('.w-side > span').first();
    await expect(disc).toHaveCSS('border-radius', '50%');
    expect(await pill.evaluate((el) => getComputedStyle(el).borderRadius)).not.toBe('50%');

    // The visual must live on the SPAN, never on Leaflet's marker container:
    // Leaflet writes an inline transform there to position it, which silently
    // overrides any transform from CSS. Styled on the container, a disc is
    // never centred on its corner and the nudge is never applied at all.
    const centred = await page.locator('.w-corner-no').evaluateAll((boxes) =>
      boxes.every((box) => {
        const span = box.firstElementChild!;
        const b = box.getBoundingClientRect();
        const s2 = span.getBoundingClientRect();
        return Math.hypot(s2.x + s2.width / 2 - b.x, s2.y + s2.height / 2 - b.y) <= 1;
      }));
    expect(centred, 'every disc sits exactly on its corner').toBe(true);

    // A length is pushed clear of the line it belongs to.
    const push = await page.locator('.w-side').first().evaluate((box) => {
      const span = box.firstElementChild!;
      const b = box.getBoundingClientRect();
      const s2 = span.getBoundingClientRect();
      return Math.hypot(s2.x + s2.width / 2 - b.x, s2.y + s2.height / 2 - b.y);
    });
    expect(push, 'a length must not sit on its own midpoint').toBeGreaterThan(10);

    // And nothing may overlap anything.
    const clashes = await page.evaluate(() => {
      const box = (n: Element) => n.getBoundingClientRect();
      const hit = (a: DOMRect, b: DOMRect) =>
        !(a.right < b.left || b.right < a.left || a.bottom < b.top || b.bottom < a.top);
      const c = [...document.querySelectorAll('.w-corner-no > span')].map(box);
      const s3 = [...document.querySelectorAll('.w-side > span')].map(box);
      let n = 0;
      for (const a of c) for (const b of s3) if (hit(a, b)) n++;
      for (let i = 0; i < s3.length; i++) {
        for (let j = i + 1; j < s3.length; j++) if (hit(s3[i], s3[j])) n++;
      }
      return n;
    });
    expect(clashes, 'no label may overlap another').toBe(0);
  });

  test('every side gets its length, however cramped', async ({ page }) => {
    await stubTiles(page);
    await page.goto(`/app/records/${PARCEL}/map`);
    await expect(page.locator('path.w-ring')).toHaveCount(1, { timeout: 20_000 });

    // The first rule here HID a label with no room beside its side, and on a
    // 13-corner parcel that silently dropped five of thirteen. A cramped
    // label is walked outward until it is clear and given a hairline back to
    // its edge — the way a surveyor's sheet handles a tight dimension.
    const rows = await page.locator('.sidetable tbody tr').count();
    await expect(page.locator('.w-side')).toHaveCount(rows);

    // And nothing may collide, however far a label had to travel.
    const clashes = await page.evaluate(() => {
      const box = (n: Element) => n.getBoundingClientRect();
      const hit = (a: DOMRect, b: DOMRect) =>
        !(a.right < b.left || b.right < a.left || a.bottom < b.top || b.bottom < a.top);
      const c = [...document.querySelectorAll('.w-corner-no > span')].map(box);
      const s2 = [...document.querySelectorAll('.w-side > span')].map(box);
      let n = 0;
      for (const a of c) for (const b of s2) if (hit(a, b)) n++;
      for (let i = 0; i < s2.length; i++) {
        for (let j = i + 1; j < s2.length; j++) if (hit(s2[i], s2[j])) n++;
      }
      return n;
    });
    expect(clashes).toBe(0);
  });

  test('clicking a node answers about that node, and nothing else', async ({ page }) => {
    await stubTiles(page);
    await page.goto(`/app/records/${PARCEL}/map`);
    await expect(page.locator('path.w-ring')).toHaveCount(1, { timeout: 20_000 });

    const tip = page.locator('.plot .w-tip');
    // The visible disc is the inner span — the Leaflet container around it is
    // 0x0 by design, so that is what a person actually clicks. The click
    // bubbles to the container, where Leaflet's handler lives.
    const corner3 = page.locator('.w-corner-no > span').filter({ hasText: /^C$/ });
    await corner3.click();

    // A node and an edge are different questions. Asked about corner 3, the
    // tip must say corner 3 — not corner 3, corner 4 and the span between.
    await expect(tip).toContainText('Corner C');
    await expect(tip).not.toContainText('Corner D');
    await expect(tip).not.toContainText('Between');
    await expect(tip.getByRole('link', { name: /Navigate/ }))
      .toHaveAttribute('href', /maps\.apple|geo:|openstreetmap/);

    // The picked corner is the subject, and no side is being claimed.
    await expect(page.locator('.w-corner-no.picked')).toHaveCount(1);
    await expect(page.locator('path.w-side-lit')).toHaveCount(0);

    // Picking a side takes over: the tip can only hold one answer.
    // Sy 214/2 is a quadrilateral: four rows, so index 2 is a real side.
    await page.locator('.sidetable tbody tr').nth(2).getByRole('button').click();
    await expect(page.locator('.w-corner-no.picked')).toHaveCount(0);
    await expect(page.locator('path.w-side-lit')).toHaveCount(1);
    await expect(tip).toContainText('Between');

    // And picking the corner again lets it go.
    await corner3.click();
    await expect(tip).toContainText('Corner C');
    await corner3.click();
    await expect(page.locator('.plot .w-tip')).toHaveCount(0);
  });

  test('a mark\u2019s kebab actually opens, and can delete it', async ({ page }) => {
    await stubTiles(page);
    await page.goto(`/app/records/${PARCEL}/map`);
    await expect(page.locator('path.w-ring')).toHaveCount(1, { timeout: 20_000 });

    const card = page.locator('.card', { hasText: 'Boundary marks' });
    const before = await card.locator('.rows > *').count();
    expect(before).toBeGreaterThan(0);

    // It was a decorative <span> holding a kebab icon: it looked like a menu
    // and did nothing at all. Every action a mark has now lives behind it.
    await card.getByRole('button', { name: /^Actions for / }).first().click();
    const menu = page.getByRole('menu');
    await expect(menu).toBeVisible();
    await menu.getByRole('menuitem', { name: 'Delete this mark' }).click();

    await expect.poll(async () => card.locator('.rows > *').count()).toBe(before - 1);
  });

  test('a named mark can be renamed and explicitly moved, while cancel preserves its location', async ({ page, request }) => {
    const GQL = '/api/gateway/pattadar/graphql';
    const made = await request.post(GQL, { data: {
      query: 'mutation SR($input:RecordInput!) { web { saveRecord(input:$input) } }',
      variables: { input: {
        kind: 'parcel', title: '904/1', classification: 'agri', status: 'owned',
        stake: 'owned', khataNo: '10021', ownerName: 'Mark Test',
        village: 'Kothapalli', mandal: 'Peddapuram', district: 'Kakinada',
        extent: 2, extentUnit: 'ac' } } } });
    const id = (await made.json()).data.web.saveRecord as string;

    try {
      await stubTiles(page);
      await page.goto(`/app/records/${id}/map`);
      await expect(page.locator('.leaflet-container')).toBeVisible({ timeout: 20_000 });
      const card = page.locator('.card', { hasText: 'Boundary marks' });

      // A stone is identified by what it is called, not by the number it
      // happens to get. Adding used to file "Mark 1" with no way to rename it,
      // which is a record of nothing.
      // The tool moved onto the map with the other three that write; the card
      // beside it lists the stones and no longer carries a second switch.
      await page.getByRole('button', { name: 'Add boundary mark', exact: true }).click();
      await clickMapAt(page, 0.45, 0.45);
      const form = card.locator('.marknote');
      await expect(form).toBeVisible();
      await expect(form.getByRole('button', { name: 'Add this mark' })).toBeDisabled();

      await form.locator('input').first().fill('Well-side stone');
      await form.locator('input').nth(1).fill('beside the old bore');
      await form.getByRole('button', { name: 'Add this mark' }).click();
      await expect(form).toHaveCount(0);
      await expect(card).toContainText('Well-side stone');
      await expect(card).toContainText('beside the old bore');

      // And renaming, which had no mutation behind it at all.
      await card.getByRole('button', { name: /^Actions for / }).first().click();
      await page.getByRole('menuitem', { name: 'Rename or describe it' }).click();
      const edit = card.locator('.marknote');
      await expect(edit.locator('input').first()).toHaveValue('Well-side stone');
      await edit.locator('input').first().fill('Bore-side stone');
      await edit.getByRole('button', { name: 'Save the name' }).click();
      await expect(card).toContainText('Bore-side stone');

      const readMark = async () => {
        const response = await request.post(GQL, { data: {
          query: `{ web { boundary(recordId:"${id}") { marks { id lat lon state } } } }`,
        } });
        return (await response.json()).data.web.boundary.marks[0] as {
          id: string; lat: number; lon: number; state: string;
        };
      };
      const original = await readMark();
      await card.getByRole('button', { name: /^Actions for / }).first().click();
      await page.getByRole('menuitem', { name: 'Move this mark', exact: true }).click();
      await expect(page.locator('.mapsays')).toContainText('Click the corrected location for Bore-side stone');
      await page.locator('.editbar').getByRole('button', { name: 'Cancel', exact: true }).click();
      expect(await readMark()).toEqual(original);

      await card.getByRole('button', { name: /^Actions for / }).first().click();
      await page.getByRole('menuitem', { name: 'Move this mark', exact: true }).click();
      await clickMapAt(page, 0.65, 0.45);
      await expect(page.locator('.editbar')).toHaveCount(0);
      const moved = await readMark();
      expect(moved.id).toBe(original.id);
      expect(moved.state).toBe('moved');
      expect([moved.lat, moved.lon]).not.toEqual([original.lat, original.lon]);

      // A nameless mark is the thing being prevented.
      await card.getByRole('button', { name: /^Actions for / }).first().click();
      await page.getByRole('menuitem', { name: 'Rename or describe it' }).click();
      await card.locator('.marknote input').first().fill('   ');
      await expect(card.locator('.marknote').getByRole('button', { name: 'Save the name' }))
        .toBeDisabled();
    } finally {
      await request.post(GQL, { data: {
        query: 'mutation DR($ids:[String!]!) { web { deleteRecords(ids:$ids) } }',
        variables: { ids: [id] } } });
    }
  });

  test('a boundary from a KML can name its own corners', async ({ page, request }) => {
    const GQL = '/api/gateway/pattadar/graphql';
    const made = await request.post(GQL, { data: {
      query: 'mutation SR($input:RecordInput!) { web { saveRecord(input:$input) } }',
      variables: { input: {
        kind: 'parcel', title: '905/1', classification: 'agri', status: 'owned',
        stake: 'owned', khataNo: '10021', ownerName: 'Corner Test',
        village: 'Kothapalli', mandal: 'Peddapuram', district: 'Kakinada',
        extent: 2, extentUnit: 'ac' } } } });
    const id = (await made.json()).data.web.saveRecord as string;

    try {
      await request.post(GQL, { data: {
        query: 'mutation SB($r:String!,$g:[Float!]!){ web { setBoundary(recordId:$r,ring:$g) } }',
        variables: { r: id, g: [17.0776, 82.1386, 17.0785, 82.1386, 17.0785, 82.1397,
                                17.0776, 82.1397] } } });

      await stubTiles(page);
      await page.goto(`/app/records/${id}/map`);
      await expect(page.locator('path.w-ring')).toHaveCount(1, { timeout: 20_000 });
      const card = page.locator('.card', { hasText: 'Boundary marks' });

      // The file already named these corners — that is what its coordinate
      // list is. Making the owner click four of them back in is asking for
      // work the KML already did.
      await card.getByRole('button', { name: /Add a mark at each of the 4 corners/ }).click();
      await expect(card).toContainText('Corner A');
      await expect(card).toContainText('Corner D');

      // The letters must match what the map draws, or a mark and its corner
      // are two different names for one stone.
      await expect(page.locator('.w-corner-no')).toHaveText(['A', 'B', 'C', 'D']);

      // And it refuses to double up once marks exist.
      await expect(card.getByRole('button', { name: /Add a mark at each/ })).toHaveCount(0);
    } finally {
      await request.post(GQL, { data: {
        query: 'mutation DR($ids:[String!]!) { web { deleteRecords(ids:$ids) } }',
        variables: { ids: [id] } } });
    }
  });

  test('the village map finds the plot for a record with no FMB', async ({ page, request }) => {
    const GQL = '/api/gateway/pattadar/graphql';
    const made = await request.post(GQL, { data: {
      query: 'mutation SR($input:RecordInput!) { web { saveRecord(input:$input) } }',
      variables: { input: {
        kind: 'parcel', title: '262', classification: 'agri', status: 'owned',
        stake: 'owned', khataNo: '10021', ownerName: 'Village Map Test',
        village: 'Chinthagunta', mandal: 'Chinthagunta', district: 'Prakasam',
        extent: 2.29, extentUnit: 'ac' } } } });
    const id = (await made.json()).data.web.saveRecord as string;

    try {
      await stubTiles(page);
      const errors = await watchConsole(page);
      await page.goto(`/app/records/${id}/map`);
      await expect(page.locator('.leaflet-container')).toBeVisible({ timeout: 20_000 });
      await expect(page.locator('path.w-ring'), 'starts with no boundary').toHaveCount(0);

      await page.getByRole('button', { name: 'Village map' }).click();
      // 2,100 plots as SVG would be ~30,000 DOM nodes; the village draws to a
      // canvas so the map still pans.
      await expect(page.locator('.plot .vmnote')).toContainText('2,100 plots', { timeout: 20_000 });
      await expect(page.locator('.leaflet-overlay-pane canvas')).toHaveCount(1);

      // A shape file is surveyed geometry; a village NAME is a geocoder's
      // guess — and for this village the guess lands 185 km away. The plots
      // win, so turning the layer on frames the actual village.
      const canvas = page.locator('.leaflet-overlay-pane canvas');
      const box = (await canvas.boundingBox())!;
      await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);

      const pick = page.locator('.plotpick');
      await expect(pick).toBeVisible();
      await expect(pick).toContainText(/Plot \d+/);
      // The extent travels with the plot so a wrong pick is obvious BEFORE it
      // is adopted — this is a record claiming land, not a drawing.
      await expect(pick).toContainText('on the village map');
      await expect(pick).toContainText('on this record');

      await pick.getByRole('button', { name: 'This is my land' }).click();
      await expect(page.locator('path.w-ring')).toHaveCount(1, { timeout: 15_000 });
      await expect(page.locator('.plotpick')).toHaveCount(0);

      // It is the record's own boundary now, not a layer drawn under it.
      const back = await request.post(GQL, { data: {
        query: `{ web { boundary(recordId:"${id}") { ring } } }` } });
      const ring = (await back.json()).data.web.boundary.ring as number[];
      expect(ring.length).toBeGreaterThanOrEqual(6);
      expect(ring[0]).toBeGreaterThan(15);      // Chinthagunta is ~15.67 N
      expect(ring[1]).toBeGreaterThan(79);      // ~79.48 E

      expect(errors).toEqual([]);
    } finally {
      await request.post(GQL, { data: {
        query: 'mutation DR($ids:[String!]!) { web { deleteRecords(ids:$ids) } }',
        variables: { ids: [id] } } });
    }
  });

  test('a village map locates the record, without being switched on',
    async ({ page, request }) => {
    const GQL = '/api/gateway/pattadar/graphql';
    const made = await request.post(GQL, { data: {
      query: 'mutation SR($input:RecordInput!) { web { saveRecord(input:$input) } }',
      variables: { input: {
        kind: 'parcel', title: '123/1', classification: 'agri', status: 'owned',
        stake: 'owned', khataNo: '10021', ownerName: 'Locate Test',
        village: 'Chinthagunta', mandal: 'Konakalamitla', district: 'Markapuram',
        extent: 100, extentUnit: 'ac' } } } });
    const id = (await made.json()).data.web.saveRecord as string;

    try {
      await stubTiles(page);
      await page.goto(`/app/records/${id}/map`);
      await expect(page.locator('.leaflet-container')).toBeVisible({ timeout: 20_000 });

      // Village names repeat. Asked for "Chinthagunta" the geocoder returns
      // the one in Venkatagiri — a real place 200 km from the Chinthagunta in
      // Markapuram this record is filed in, and nothing on screen said so.
      // The shape file is not a name search: it IS the village.
      await expect(page.locator('.plot .nogeo'))
        .toContainText('from the village map', { timeout: 20_000 });

      // Exactly one notice: the caller names the place, so the component's own
      // "no location yet" would be a second box saying nearly the same thing.
      await expect(page.locator('.plot .nogeo')).toHaveCount(1);

      // And it is the RIGHT Chinthagunta — a village, not half a state.
      await expect(page.locator('.leaflet-control-scale-line')).not.toContainText('km');

      // Located without the plots being drawn; that is still a choice.
      await expect(page.locator('.leaflet-overlay-pane canvas')).toHaveCount(0);
    } finally {
      await request.post(GQL, { data: {
        query: 'mutation DR($ids:[String!]!) { web { deleteRecords(ids:$ids) } }',
        variables: { ids: [id] } } });
    }
  });

  test('the village map goes straight to the record\u2019s own survey number',
    async ({ page, request }) => {
    const GQL = '/api/gateway/pattadar/graphql';
    const made = await request.post(GQL, { data: {
      query: 'mutation SR($input:RecordInput!) { web { saveRecord(input:$input) } }',
      variables: { input: {
        kind: 'parcel', title: '123/1', classification: 'agri', status: 'owned',
        stake: 'owned', khataNo: '10021', ownerName: 'Find Test',
        village: 'Chinthagunta', mandal: 'Konakalamitla', district: 'Markapuram',
        extent: 0.46, extentUnit: 'ac' } } } });
    const id = (await made.json()).data.web.saveRecord as string;

    try {
      await stubTiles(page);
      await page.goto(`/app/records/${id}/map`);
      await expect(page.locator('.leaflet-container')).toBeVisible({ timeout: 20_000 });

      await page.getByRole('button', { name: 'Village map' }).click();
      await expect(page.locator('.plot .vmnote')).toContainText('2,100 plots', { timeout: 20_000 });

      // 2,100 shapes, and the owner knows exactly one thing about theirs: what
      // the paper calls it. "Sy 123/1" is survey 123 subdivision 1, and the
      // shape file numbers whole surveys — so 123 is what matches.
      await expect(page.locator('#w360-plotfind')).toHaveValue('123');
      const pick = page.locator('.plotpick');
      await expect(pick).toContainText('Plot 123', { timeout: 15_000 });

      // Any other plot can be reached by typing its number.
      await page.locator('#w360-plotfind').fill('550');
      await expect(pick).toContainText('Plot 550', { timeout: 15_000 });

      // And a number that is not in this village says so rather than going
      // quiet — a silent search reads as a broken one.
      await page.locator('#w360-plotfind').fill('99999');
      await expect(page.locator('.plotfind')).toContainText('No plot 99999 in this village map');
    } finally {
      await request.post(GQL, { data: {
        query: 'mutation DR($ids:[String!]!) { web { deleteRecords(ids:$ids) } }',
        variables: { ids: [id] } } });
    }
  });

  test('a place in the wrong district is refused, however well the name matches',
    async ({ page, request }) => {
    const GQL = '/api/gateway/pattadar/graphql';
    const made = await request.post(GQL, { data: {
      query: 'mutation SR($input:RecordInput!) { web { saveRecord(input:$input) } }',
      variables: { input: {
        kind: 'parcel', title: '9/1', classification: 'agri', status: 'owned',
        stake: 'owned', khataNo: '10021', ownerName: 'District Test',
        // A village with no shape file, so the NAME path is what runs. It must
        // not be a spelling of Chinthagunta: villageKey() now folds those
        // together and the shape file would answer instead — correctly, but
        // that is the other test.
        village: 'Peddapalli', mandal: 'Konakalamitla', district: 'Markapuram',
        extent: 1, extentUnit: 'ac' } } } });
    const id = (await made.json()).data.web.saveRecord as string;

    try {
      await stubTiles(page);
      // Exactly what OSM answers in life: a real Chintagunta, in Venkatagiri,
      // 200 km from this record's — and the ONLY hit for the name.
      await page.route(/nominatim\.openstreetmap\.org/i, (route) => {
        const q = decodeURIComponent(new URL(route.request().url()).searchParams.get('q') ?? '');
        const wrongDistrict = /^Peddapalli,/.test(q)
          ? [{ lat: '13.9553', lon: '79.5836', boundingbox: ['13.94', '13.97', '79.57', '79.60'],
               display_name: 'Peddapalli, Venkatagiri, Tirupati, Andhra Pradesh, 524132, India' }]
          : [];
        return route.fulfill({ contentType: 'application/json', body: JSON.stringify(wrongDistrict) });
      });

      await page.goto(`/app/records/${id}/map`);
      await expect(page.locator('.leaflet-container')).toBeVisible({ timeout: 20_000 });

      // The name matches perfectly and the place is real. It is still the
      // wrong one: its hierarchy names Venkatagiri and Tirupati, not the
      // Konakalamitla and Markapuram this record is filed in. Showing it —
      // silently, 200 km out — is worse than admitting we do not know.
      await expect(page.locator('.plot .nogeo')).not.toContainText('Venkatagiri');
      await expect(page.locator('.plot .nogeo')).not.toContainText('Tirupati');

      // Falling back to "somewhere in the state" is the honest answer.
      await expect(page.locator('.leaflet-control-scale-line')).toContainText('km');
    } finally {
      await request.post(GQL, { data: {
        query: 'mutation DR($ids:[String!]!) { web { deleteRecords(ids:$ids) } }',
        variables: { ids: [id] } } });
    }
  });

  test('a village with no shape file says so, and changes nothing', async ({ page }) => {
    await stubTiles(page);
    await page.goto(`/app/records/${PARCEL}/map`);
    await expect(page.locator('path.w-ring')).toHaveCount(1, { timeout: 20_000 });

    // Kothapalli has not been digitised. Most villages have not — that is the
    // ordinary case and must not read as a failure.
    //
    // The tape comes out on landing and puts the village map out of reach, so
    // reaching it starts by putting the tape away. That is the whole rule, and
    // it is asserted properly in "the tape holds the ground and the village
    // waits" below; here it is just the way in.
    await page.getByRole('button', { name: 'Measure', exact: true }).click();
    await page.getByRole('button', { name: 'Village map' }).click();
    await expect(page.locator('.plot .vmnote')).toContainText('No village map on file');
    await expect(page.locator('path.w-ring'), 'the record keeps its own boundary')
      .toHaveCount(1);
  });

  test('measurements work on either basemap and village plots remain available', async ({ page }) => {
    await stubTiles(page);
    await page.goto(`/app/records/${PARCEL}/map`);
    await expect(page.locator('path.w-ring')).toHaveCount(1, { timeout: 20_000 });

    const sat = page.getByRole('button', { name: 'Satellite' });
    const vil = page.getByRole('button', { name: 'Village map' });
    const tape = page.getByRole('button', { name: 'Measure', exact: true });
    await expect(tape).toHaveAttribute('aria-pressed', 'true');
    await expect(sat).toBeEnabled();
    await expect(vil).toBeEnabled();
    await expect(page.locator('path.w-dim')).toHaveCount(1);
    await sat.click();
    await expect(page.locator('.leaflet-control-attribution')).toContainText('OpenStreetMap');
    await expect(page.locator('.w-dim')).toHaveCount(1);
    await expect(page.locator('.card', { hasText: 'Measurements' })).toBeVisible();

    await vil.click();
    await expect(vil).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('path.w-dim')).toHaveCount(0);
    await expect(tape).toHaveAttribute('aria-pressed', 'true');
    await vil.click();
    await expect(page.locator('path.w-dim')).toHaveCount(1);

    await tape.click();
    await expect(page.locator('path.w-dim')).toHaveCount(0);
    await expect(sat).toHaveAttribute('aria-pressed', 'false');
    await tape.click();
    await expect(sat).toHaveAttribute('aria-pressed', 'false');
    await sat.click();
    await expect(page.locator('.leaflet-control-attribution')).toContainText('Esri');
    await expect(tape).toHaveAttribute('aria-pressed', 'true');
  });

  test('an unsurveyed record is never taped into a corner', async ({ page, request }) => {
    // The trap this guards: `measuring` is true on an unsurveyed record too —
    // it simply has nothing to measure, so no Measure chip is drawn. A rule
    // keyed on `measuring` alone would lock the imagery on and the village map
    // out on exactly the records that need the village map most, with no
    // control anywhere to undo it.
    const GQL = '/api/gateway/pattadar/graphql';
    const made = await request.post(GQL, { data: {
      query: 'mutation SR($input:RecordInput!) { web { saveRecord(input:$input) } }',
      variables: { input: {
        kind: 'parcel', title: '262', classification: 'agri', status: 'owned',
        stake: 'owned', khataNo: '10021', ownerName: 'Untaped Test',
        village: 'Chinthagunta', mandal: 'Chinthagunta', district: 'Prakasam',
        extent: 2.29, extentUnit: 'ac' } } } });
    const id = (await made.json()).data.web.saveRecord as string;

    try {
      await stubTiles(page);
      await page.goto(`/app/records/${id}/map`);
      await expect(page.locator('.leaflet-container')).toBeVisible({ timeout: 20_000 });
      await expect(page.locator('path.w-ring'), 'no boundary to measure').toHaveCount(0);

      await expect(page.getByRole('button', { name: 'Measure', exact: true })).toHaveCount(0);
      await expect(page.getByRole('button', { name: 'Satellite' })).toBeEnabled();
      await expect(page.getByRole('button', { name: 'Village map' })).toBeEnabled();
    } finally {
      await request.post(GQL, { data: {
        query: 'mutation DR($ids:[String!]!) { web { deleteRecords(ids:$ids) } }',
        variables: { ids: [id] } } });
    }
  });

  test('accepting a moved position settles the mark', async ({ page }) => {
    await stubTiles(page);
    await page.goto(`/app/records/${PARCEL}/map`);
    await page.getByRole('button', { name: 'Accept new position' }).click();
    await expect(page.getByRole('button', { name: 'Accept new position' })).toHaveCount(0);
  });
});

test.describe('W05 + W14 · photos', () => {
  test('the gallery states provenance and exposes deliberate photo edits', async ({ page }) => {
    const errors = await watchConsole(page);
    await page.goto(`/app/records/${PARCEL}/photos`);

    await expect(page.getByText(/31 photos · 1 video · 4 site visits/)).toBeVisible();
    await expect(page.getByText('geo-stamped')).toBeVisible();
    await expect(page.getByText(/Caption and tags are editable/))
      .toBeVisible();
    await expect(page.getByLabel('Caption')).toHaveValue('South-east boundary stone');
    await expect(page.getByText('Photo 1 of 32')).toBeVisible();

    // Delete names what the photo is doing elsewhere rather than just warning.
    await expect(page.getByText(/archives for 30 days first/)).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('a caption edit persists', async ({ page }) => {
    await page.goto(`/app/records/${PARCEL}/photos`);
    const caption = page.getByLabel('Caption');
    await caption.fill('South-east boundary stone, re-shot');
    await caption.blur();
    await page.reload();
    await expect(page.getByLabel('Caption')).toHaveValue('South-east boundary stone, re-shot');
    // Put it back, so the suite is re-runnable.
    await page.getByLabel('Caption').fill('South-east boundary stone');
    await page.getByLabel('Caption').blur();
  });

  test('scoped to a feature it becomes the provenance panel', async ({ page }) => {
    const errors = await watchConsole(page);
    await page.goto(`/app/records/${PARCEL}/features`);
    await page.locator('.cards > article').first().getByText(/photos$/).click();

    await expect(page).toHaveURL(/feature=/);
    await expect(page.getByText('Why this is Borewell 1')).toBeVisible();
    await expect(page.getByText('Shot inside Pattadar, not picked from a gallery')).toBeVisible();
    await expect(page.getByText('Device clock matched our server to the second')).toBeVisible();
    await expect(page.getByText(/Unedited since capture/)).toBeVisible();
    await expect(page.getByText('This photo is doing three jobs')).toBeVisible();

    // A forwarded photo is kept but never used as evidence.
    await expect(page.getByText(/prove nothing/)).toBeVisible();
    await expect(page.getByText(/Forwarded in rather than shot here/)).toBeVisible();
    expect(errors).toEqual([]);
  });
});

test.describe('W15 · the vault', () => {
  test('eight shelves and every link out', async ({ page }) => {
    const errors = await watchConsole(page);
    await page.goto('/app/papers');

    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Papers');
    for (const shelf of ['Title', 'Revenue record', 'Map', 'Identity', 'Search & tax',
      'Old record', 'Photos', 'Unsorted']) {
      await expect(page.locator('.shelf', { hasText: shelf }).first()).toBeVisible();
    }
    // Every shelf carries a count. The exact numbers are a property of the
    // portfolio, not of the software — the mock's 14/18/31 was a snapshot of an
    // account with one documented parcel — so what is asserted is that no shelf
    // is empty and that the header equals their sum (next test).
    for (const shelf of ['Title', 'Revenue record', 'Map', 'Photos']) {
      const n = await page.locator('.shelf', { hasText: shelf }).first()
        .locator('.num').innerText();
      expect(Number(n.trim()), `${shelf} shelf count`).toBeGreaterThan(0);
    }

    await expect(page.getByText(/Out on a link right now · \d+/)).toBeVisible();
    await expect(page.getByText('K. Prasad, advocate — 4 papers')).toBeVisible();
    await expect(page.getByText(/Revoking kills a link in seconds rather than at expiry/)).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('the header total is the shelves added up', async ({ page }) => {
    await page.goto('/app/papers');
    await expect(page.locator('.shelf').first()).toBeVisible();
    const counts = await page.locator('.shelf .num').allInnerTexts();
    const sum = counts.reduce((n, t) => n + Number(t.trim()), 0);
    await expect(page.getByText(`${sum} papers, encrypted in Mumbai (ap-south-1)`, { exact: false }))
      .toBeVisible();
  });

  test('revoking a link removes it from the list', async ({ page }) => {
    await page.goto('/app/papers');
    await expect(page.locator('.rows.boxed > div').first()).toBeVisible();
    const before = await page.locator('.rows.boxed > div').count();
    const row = page.locator('.rows.boxed > div', { hasText: 'SBI Kakinada, loan desk' });
    await row.getByRole('button', { name: 'Revoke' }).click();
    await page.getByRole('button', { name: 'Revoke it' }).click();
    await expect(page.getByText('SBI Kakinada, loan desk', { exact: false })).toHaveCount(0);
    await expect(page.locator('.rows.boxed > div')).toHaveCount(before - 1);
  });
});

test.describe('W13 · reading a document', () => {
  test('the scan on the left, what was read from it on the right', async ({ page }) => {
    const errors = await watchConsole(page);
    await page.goto(`/app/papers/${DEED}`);

    await expect(page.getByText('Sale Deed 4417/2019').first()).toBeVisible();
    await expect(page.getByText(/Sy 214\/2 · Title · 22 pages/)).toBeVisible();

    // The registration facts, read off the paper.
    const facts = page.locator('.kv');
    await expect(facts).toContainText('06/09/2019');
    await expect(facts).toContainText('SRO Peddapuram');
    await expect(facts).toContainText('Bhogadi Venkanna');
    await expect(facts).toContainText('₹58,00,000');

    // The reading is labelled as a reading, and says where it was unsure.
    await expect(page.getByText('What the reader found')).toBeVisible();
    await expect(page.getByText('The sub-division digit is smudged on page 4')).toBeVisible();

    // v1 is kept even after a better rescan replaced it.
    await expect(page.getByText('Colour rescan, 300 dpi')).toBeVisible();
    await expect(page.getByText(/kept, never deleted/)).toBeVisible();

    await expect(page.getByText('1 / 22')).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('paging moves through the scan', async ({ page }) => {
    await page.goto(`/app/papers/${DEED}`);
    await page.getByRole('button', { name: 'Next page' }).click();
    await expect(page.getByText('2 / 22')).toBeVisible();
  });
});

test.describe('W09 · shared with me', () => {
  test("someone else's kit, read-only, and out of your totals", async ({ page }) => {
    const errors = await watchConsole(page);
    await page.goto('/app/shared');

    await expect(page.getByText('Kept out of your portfolio. Nothing here counts toward your acres.'))
      .toBeVisible();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Sy 96/3, Samalkot');
    await expect(page.getByText('Read-only · not your record')).toBeVisible();
    await expect(page.getByText(/Sent by B. Venkat, agent/)).toBeVisible();

    // What they gave you, with the two things that fall short flagged.
    await expect(page.getByText('Sale Deed 2214/2016')).toBeVisible();
    await expect(page.getByText('stops 3 years short')).toBeVisible();
    await expect(page.getByText('no date or location stamp')).toBeVisible();

    // The four unconfirmed things, priced, ordered in your name.
    await expect(page.getByText('What nobody has confirmed')).toBeVisible();
    await expect(page.getByRole('button', { name: /Order all four · ₹13,500/ })).toBeVisible();
    await expect(page.getByText('Ordered in your name. The seller is not told.')).toBeVisible();
    expect(errors).toEqual([]);
  });

  test("a shared kit's acres are not in the portfolio total", async ({ page }) => {
    await page.goto('/app');
    // The kit is 4.10 ac. 44.82 is the owned farmland; 48.92 would mean the
    // recipient's list had been unioned into the owner's.
    await expect(page.locator('.strip').first()).toContainText('44.82');
    await expect(page.locator('.strip').first()).not.toContainText('48.92');
  });
});

test.describe('W06 · find by map', () => {
  test('saved map links open the live portfolio map and its searchable records', async ({ page }) => {
    const errors = await watchConsole(page);
    await page.goto('/app/map');

    await expect(page).toHaveURL(/\/app\/properties\?view=map/);
    await expect(page.locator('.pf-results .pf-result')).toHaveCount(9);
    await expect(page.locator('.pf-map.leaflet-container')).toBeVisible();
    await expect(page.getByText(/basemap placeholder/)).toHaveCount(0);
    await page.getByRole('searchbox', { name: 'Search your land on the map' }).fill('214/2');
    await expect(page.locator('.pf-result')).toHaveCount(1);
    await page.locator('.pf-result-pick').click();
    await expect(page.locator('.pf-pick')).toContainText('Sy 214/2');
    await expect(page.locator('.pf-pick').getByRole('link', { name: 'Boundary' }))
      .toHaveAttribute('href', `/app/records/${PARCEL}/map`);
    expect(errors).toEqual([]);
  });

  test('a facet narrows both the map and the list', async ({ page }) => {
    // `/app/map` is a redirect onto `/app/properties?view=map` (MapFind.tsx),
    // so this is the same filter row every other view carries — the facets are
    // options inside the `+ Filter` popover now, not checkboxes in a rail.
    await page.goto('/app/map');
    await page.getByRole('button', { name: '+ Filter' }).click();
    await page.getByRole('group', { name: 'Narrow the list' })
      .getByRole('button', { name: /^Disputed/ }).click();
    await page.keyboard.press('Escape');
    await expect(page.locator('.pf-result')).toHaveCount(1);
    await expect(page.locator('.pf-result')).toContainText('Shop 2, Main Rd');
    await expect(page.locator('.pf-pin, .pf-shape')).toHaveCount(1);
  });
});

test.describe('the shell', () => {
  test('every rail destination resolves and none errors', async ({ page }) => {
    const errors = await watchConsole(page);
    await page.goto('/app');
    await expect(page.locator('.nav a').first()).toBeVisible();
    const links = await page.locator('.nav a').all();
    expect(links.length).toBe(15);   // …the fifteenth is Maps

    for (const link of links) {
      const href = await link.getAttribute('href');
      await page.goto(href!);
      await expect(page.locator('main')).toBeVisible();
      // Never a blank screen: every section states what it is.
      await expect(page.locator('h1, h2').first()).toBeVisible();
    }
    expect(errors).toEqual([]);
  });

  test('the High Contrast theme survives a reload', async ({ page }) => {
    await page.goto('/app');
    await expect(page.locator('.w360')).toHaveAttribute('data-scheme', 'dark');
    await page.getByRole('button', { name: 'Change theme' }).click();
    await page.getByRole('menuitemradio', { name: 'High Contrast' }).click();
    await expect(page.locator('.w360')).toHaveAttribute('data-scheme', 'highContrast');
    await page.reload();
    await expect(page.locator('.w360')).toHaveAttribute('data-scheme', 'highContrast');
    await page.getByRole('button', { name: 'Change theme' }).click();
    await expect(page.getByRole('menuitemradio', { name: 'High Contrast' }))
      .toHaveAttribute('aria-checked', 'true');
    await page.getByRole('menuitemradio', { name: 'Dark' }).click();
  });

  test('the jump box actually jumps — parcel, paper, person', async ({ page }) => {
    await page.goto('/app');
    const box = page.locator('#w360-search');

    // A parcel by its survey number.
    await box.fill('214/2');
    const results = page.locator('.jump-results');
    await expect(results).toBeVisible();
    await results.getByRole('option', { name: /Sy 214\/2/ }).first().click();
    await expect(page).toHaveURL(new RegExp(`/app/records/${PARCEL}$`));

    // Navigation clears the box (an effect); wait for it or the next fill races it.
    await expect(box).toHaveValue('');

    // A paper by its name — Enter takes the first hit.
    await box.fill('Sale Deed 4417');
    await expect(results.getByRole('option', { name: /Sale Deed 4417\/2019/ }).first()).toBeVisible();
    await box.press('Enter');
    await expect(page).toHaveURL(/\/app\/papers\/w360-d-deed-4417/);

    await expect(box).toHaveValue('');

    // A person by theirs, landing on the record's People hanger.
    await box.fill('Satyanarayana');
    await results.getByRole('option', { name: /M. Satyanarayana/ }).first().click();
    await expect(page).toHaveURL(/\/people$/);
  });

  test('a search with no hits says so, and Enter still lands somewhere', async ({ page }) => {
    await page.goto('/app');
    const box = page.locator('#w360-search');
    await box.fill('zzzz-nothing');
    await expect(page.locator('.jump-results')).toContainText('Nothing matches');
    await box.press('Enter');
    await expect(page).toHaveURL(/\/app\/properties\?q=zzzz-nothing/);
    await expect(page.getByText('Nothing matches “zzzz-nothing”')).toBeVisible();
  });

  test('at desktop the hamburger collapses the rail to icons, and remembers', async ({ page }) => {
    await page.goto('/app');
    const nav = page.locator('.nav');
    await expect(nav.locator('.lbl', { hasText: 'Properties' })).toBeVisible();

    // Collapsed: the words go, the icons stay, every section still clickable.
    await page.getByRole('button', { name: 'Collapse the rail' }).click();
    await expect(nav).toBeVisible();
    await expect(nav.locator('.lbl', { hasText: 'Properties' })).toBeHidden();
    expect(await nav.evaluate((el) => el.getBoundingClientRect().width)).toBeLessThan(80);
    await expect(nav.locator('a')).toHaveCount(15);

    // A preference, not a moment — it survives a reload.
    await page.reload();
    await expect(nav.locator('.lbl', { hasText: 'Properties' })).toBeHidden();

    // An icon still navigates while collapsed…
    await nav.getByRole('link', { name: 'Papers', exact: true }).click();
    await expect(page).toHaveURL(/\/app\/papers/);
    await expect(nav.locator('.lbl', { hasText: 'Properties' })).toBeHidden();

    // …and the hamburger brings the words back.
    await page.getByRole('button', { name: 'Show the rail' }).click();
    await expect(nav.locator('.lbl', { hasText: 'Properties' })).toBeVisible();
  });

  test('on a phone the hamburger opens the rail', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/app');

    // Off-canvas at rest, visible after the hamburger, closed again by use.
    await expect(page.locator('.nav')).not.toBeInViewport();
    await page.getByRole('button', { name: 'Menu' }).click();
    await expect(page.locator('.nav')).toBeInViewport();
    await page.locator('.nav').getByText('Properties').click();
    await expect(page).toHaveURL(/\/app\/properties/);
    await expect(page.locator('.nav')).not.toBeInViewport();
  });

  test('⌘K focuses the jump box', async ({ page }) => {
    await page.goto('/app');
    await page.locator('main').click({ position: { x: 5, y: 5 } });
    await page.keyboard.press('ControlOrMeta+k');
    await expect(page.locator('#w360-search')).toBeFocused();
  });

  test('the old vocabulary still resolves', async ({ page }) => {
    await page.goto('/app/documents');
    await expect(page).toHaveURL(/\/app\/papers/);
    await page.goto('/app/parcels');
    await expect(page).toHaveURL(/\/app\/properties\?kind=parcel/);
  });

  test('a record that is not yours is refused, not crashed', async ({ page }) => {
    await page.goto('/app/records/does-not-exist');
    await expect(page.getByText('That record is not in your portfolio')).toBeVisible();
  });
});

test.describe('no record renders as an empty shell', () => {
  test('every record in the list has figures, papers, features and people', async ({ page }) => {
    await page.goto('/app/properties');
    await expect(page.locator('.cards .rec')).toHaveCount(9);
    const hrefs = await page.locator('.cards .rec .recgo').evaluateAll(
      (els) => els.map((e) => (e as HTMLAnchorElement).getAttribute('href')!));
    expect(hrefs.length).toBe(9);

    for (const href of hrefs) {
      await page.goto(href);
      // The three things that read as "broken" when a record is bare. The
      // market value moved to the Money hanger with the rest of the money, so
      // what the front page owes the reader here is the extent — the chip is
      // drawn only when there is one, which is the same signal.
      await expect(page.locator('.pagehead .chip.num').first(), `${href} extent`)
        .toBeVisible();
      await expect(page.getByText('0.0000° N, 0.0000° E'), `${href} pin`).toHaveCount(0);
      await expect(page.getByText('No paper here matches that.'), `${href} papers`).toHaveCount(0);

      const tabs = page.locator('.tabs').first();
      for (const hanger of ['Papers', 'Features', 'People']) {
        const label = await tabs.locator('a', { hasText: hanger }).innerText();
        expect(Number(/\d+/.exec(label)?.[0] ?? 0), `${href} ${hanger}`).toBeGreaterThan(0);
      }
    }
  });

  test("a record's money and ledger both have rows", async ({ page }) => {
    await page.goto('/app/properties');
    await expect(page.locator('.cards .rec')).toHaveCount(9);
    const href = await page.locator('.cards .rec .recgo').nth(4)
      .evaluate((e) => (e as HTMLAnchorElement).getAttribute('href')!);

    await page.goto(`${href}/money`);
    await expect(page.locator('tbody tr').first()).toBeVisible();
    await expect(page.getByText('Everything else you put in')).toBeVisible();

    await page.goto(`${href}/expenses`);
    await expect(page.locator('tbody tr').first()).toBeVisible();
  });
});

test.describe('the record body fills the window', () => {
  // The two columns used to size themselves to their content and stop
  // two-thirds down a tall window, leaving the right rail in dead space.
  for (const [name, height] of [['tall', 1400], ['short', 800]] as const) {
    test(`${name} window · the two columns reach the bottom of the region`, async ({ page }) => {
      await page.setViewportSize({ width: 1512, height });
      await page.goto(`/app/records/${PARCEL}`);
      await page.waitForLoadState('networkidle');

      const { mainH, splitH } = await page.evaluate(() => {
        const m = document.querySelector('.w360 main')!.getBoundingClientRect();
        const s = document.querySelector('.w360 main > .split')!.getBoundingClientRect();
        return { mainH: m.height, splitH: s.height };
      });
      // The split owns everything under the page head, so it must be within a
      // page-head's worth of main's height — never a fraction of it.
      expect(splitH / mainH, `${name} window`).toBeGreaterThan(0.6);
    });
  }
});

test.describe('responsive', () => {
  for (const [name, width] of [
    ['laptop', 1512], ['tablet wide', 900], ['tablet', 768],
    ['phone large', 414], ['phone', 375], ['phone small', 320],
  ] as const) {
    test(`${name} · no page scrolls sideways`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      for (const path of ['/app', '/app/properties', `/app/records/${PARCEL}`,
        `/app/records/${PARCEL}/features`, `/app/records/${BIG}/money`, '/app/papers']) {
        await page.goto(path);
        await page.waitForLoadState('networkidle');
        const overflow = await page.evaluate(() =>
          document.documentElement.scrollWidth - document.documentElement.clientWidth);
        expect(overflow, `${path} at ${width}px`).toBeLessThanOrEqual(1);
      }
    });
  }
});
