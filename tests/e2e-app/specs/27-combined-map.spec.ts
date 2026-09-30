/**
 * Combined map · /app/combined/:id/fmb — a holding's boundaries on one map.
 *
 * Written with the second heuristic audit of this tab (28/09/2026). Each test
 * is one thing the tab owes an owner, and every write it offers is exercised
 * with its failure path: adding and removing a joint FMB, and renaming or
 * removing the combined view from its head.
 *
 * The seed has no combined view, so each test sets one: Sy 214/2 (the seeded
 * parcel) and an invented neighbour, Sy 214/3, share an edge; Sy 88 has no
 * boundary. Neither neighbour is ever opened, so it needs no record of its own.
 */
import type { Locator, Page } from '@playwright/test';
import { BLANK_TILE, test, expect, World } from '../fixtures/harness';
import { ID } from '../fixtures/ids';

const CP = 'cp-katragunta';
const EAST = 'w-sy-214-3';
const TAB = `/app/combined/${CP}/fmb`;
/** A storage UUID, so the sheet's bytes are actually fetched (isStorageRef). */
const SHEET_REF = '3f0c5a8e-2b1d-4c6e-9f7a-1d2e3f4a5b6c';
const UPLOADED = '9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d';

const WEST_RING = [15.7410, 79.2694, 15.7410, 79.2704, 15.7402, 79.2704, 15.7402, 79.2694];
const EAST_RING = [15.7410, 79.2704, 15.7410, 79.2714, 15.7402, 79.2714, 15.7402, 79.2704];

const member = (over: Record<string, unknown>) => ({
  id: `cpm-${String(over.recordId)}`, recordKind: 'parcel', placeLine: 'Katragunta, Markapur, Prakasam',
  khataNo: '1042', ownerName: '', status: 'owned', extent: 2.4, extentUnit: 'ac', extentDetail: '',
  marketValue: 0, paperCount: 1, ground: 'surveyed', sheetTitle: 'Joint FMB sketch', sheetId: '',
  archived: false, sort: 0, ...over,
});

const COMBINED = {
  id: CP, name: 'Katragunta Land', note: '', memberCount: 3, parcelCount: 3, propertyCount: 0,
  farmExtent: 6, plotExtent: 0, builtExtent: 0, extentLine: '6.00 ac', marketValue: 0, invested: 0,
  paperCount: 3, surveyedCount: 2, combinedSpend: 0, memberSpend: 0,
  placeLine: 'Katragunta & Konakalamitla, Prakasam', isComplete: true,
  createdAt: '2026-09-20', updatedAt: '2026-09-20',
  members: [
    member({ recordId: ID.parcel, title: 'Sy 214/2', sheetId: 'p-jf-1', sort: 0 }),
    member({ recordId: EAST, title: 'Sy 214/3', sheetId: 'p-jf-2', sort: 1 }),
    member({
      recordId: ID.plot, title: 'Sy 88', placeLine: 'Konakalamitla, Markapur, Prakasam',
      khataNo: '318', extent: 1.2, ground: 'none', sheetTitle: '', sort: 2,
    }),
  ],
};

const shape = (over: Record<string, unknown>) => ({
  kind: 'parcel', ring: [] as number[], lat: 0, lon: 0, extentLabel: '2.40 ac', sheetTitle: '', sheetId: '',
  ground: 'none', note: '', corners: 0, sideLengths: [] as number[], sideBearings: [] as number[],
  perimeterM: 0, measuredAc: 0, recordedAc: 0, comparable: false, sheetJoint: false, ...over,
});

const drawn = (recordId: string, title: string, ring: number[], lon: number, sheetId: string) => shape({
  recordId, title, ring, lat: 15.7406, lon, sheetTitle: 'Joint FMB sketch', sheetId, ground: 'surveyed',
  corners: 4, sideLengths: [107, 89, 107, 89], sideBearings: [90, 180, 270, 0], perimeterM: 392,
  measuredAc: 2.35, recordedAc: 2.4, comparable: true, sheetJoint: true,
});

const FMB = {
  id: CP, name: 'Katragunta Land', drawnCount: 2, surveyedCount: 2, sheetCount: 2, pieceCount: 1,
  caption: '2 saved boundaries, each drawn as its own record filed it, touching as one piece of ground. Not a merged or official FMB.',
  missing: ['Sy 88'], measuredAc: 4.7, recordedAc: 4.8, comparable: true,
  shapes: [
    drawn(ID.parcel, 'Sy 214/2', WEST_RING, 79.2699, 'p-jf-1'),
    drawn(EAST, 'Sy 214/3', EAST_RING, 79.2709, 'p-jf-2'),
    shape({ recordId: ID.plot, title: 'Sy 88', extentLabel: '1.20 ac' }),
  ],
  relations: [{
    fromRecordId: ID.parcel, toRecordId: EAST, fromTitle: 'Sy 214/2', toTitle: 'Sy 214/3',
    relation: 'adjoining', gapM: 0, runM: 89,
    detail: 'Side by side — the saved outlines run together for about 89 m.',
  }],
  jointSheets: [{
    id: 'jf-1', name: 'Joint FMB sketch', recordIds: [ID.parcel, EAST],
    recordTitles: ['Sy 214/2', 'Sy 214/3'], paperIds: ['p-jf-1', 'p-jf-2'],
    createdAt: '2026-09-20', fileRef: SHEET_REF,
  }],
};

test.beforeEach(({ world }) => {
  world.set('combinedProperty', COMBINED);
  world.set('combinedFmb', FMB);
});

async function openMap(page: Page) {
  await page.goto(TAB);
  await expect(page.getByRole('heading', { name: 'Boundaries side by side' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Select Sy 214/2' })).toBeVisible();
}

/** The stage has no role of its own: it is the box around the map region and
 *  its chips, and its class is the only handle on the whole of it. */
const stage = (page: Page) => page.locator('.pf-stage');
const rail = (page: Page) => page.getByRole('complementary', { name: 'Measurements' });
const jointCard = (page: Page) =>
  page.locator('section', { has: page.getByRole('heading', { name: 'Joint FMB', exact: true }) });

type Box = { x: number; y: number; width: number; height: number };
const overlap = (a: Box, b: Box) => a.x < b.x + b.width - 0.5 && a.x + a.width - 0.5 > b.x
  && a.y < b.y + b.height - 0.5 && a.y + a.height - 0.5 > b.y;
const boxesOf = (loc: Locator): Promise<Box[]> => loc.evaluateAll((els) => els.map((el) => {
  const r = el.getBoundingClientRect();
  return { x: r.x, y: r.y, width: r.width, height: r.height };
}));

test.describe('Combined map', () => {
  test('the map counts boundaries, names its records, and labels both of its figures @phone', async ({ page }) => {
    await openMap(page);

    // The dropdown counts what the map draws, and its name carries the words
    // printed on it rather than a label a voice command cannot match.
    const chooser = page.getByRole('button', { name: /^Which boundaries to show/ });
    await expect(chooser).toHaveText(/All 2 boundaries/);
    await expect(chooser).toHaveAccessibleName(/^Which boundaries to show\s+All 2 boundaries$/);
    await expect(page.getByRole('region', { name: 'Map of this combined view' })).toBeVisible();

    await expect(rail(page).getByText('2 boundaries shown')).toBeVisible();
    await expect(rail(page).getByRole('button', { name: /Sy 214\/2/ }))
      .toContainText('Measured 2.35 ac · 4 sides');
    // The same record's extent on record, once picked, says what it is.
    await rail(page).getByRole('button', { name: /Sy 214\/3/ }).click();
    await expect(stage(page).getByText('On record 2.40 ac')).toBeVisible();

    // Full screen is offered wherever the browser can give it, and only there.
    const canFill = await page.evaluate(() => document.fullscreenEnabled === true);
    await expect(page.getByRole('button', { name: 'View full screen' })).toHaveCount(canFill ? 1 : 0);
  });

  test('choosing one boundary shows its own measurements, and a narrow page scrolls instead of the rail @phone', async ({ page }) => {
    await openMap(page);
    await page.getByRole('button', { name: /^Which boundaries to show/ }).click();
    const list = page.getByRole('group', { name: 'Which boundaries to show' });
    await expect(list).toBeVisible();
    const box = (await list.boundingBox())!;
    expect(box.x, 'the list opens inside the window').toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(page.viewportSize()!.width);

    await page.getByRole('menuitemcheckbox', { name: 'Sy 214/3' }).click();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('button', { name: /^Which boundaries to show/ })).toHaveText(/1 of 2 boundaries/);

    const measurements = rail(page);
    await expect(measurements.getByRole('heading', { name: 'Measurements' })).toBeVisible();
    await expect(measurements.getByRole('row')).toHaveCount(5);
    if (page.viewportSize()!.width <= 1200) {
      // Stacked, the rail is part of the page: no box of its own hides the
      // side rows below a fold inside a page that is already scrolling.
      const hidden = await measurements.evaluate((el) => el.scrollHeight - el.clientHeight);
      expect(hidden).toBeLessThanOrEqual(1);
    }
  });

  test('the map can take the whole screen and give it back', async ({ page }) => {
    await openMap(page);
    const canFill = await page.evaluate(() => document.fullscreenEnabled === true);
    test.skip(!canFill, 'this browser does not offer full screen to a page');

    await page.getByRole('button', { name: 'View full screen' }).click();
    await expect.poll(() => page.evaluate(() =>
      !!document.fullscreenElement?.classList.contains('pf-stage'))).toBe(true);
    await expect(page.getByRole('button', { name: 'Exit full screen' })).toBeVisible();
    // The map has the window, and its own tools came with it.
    expect((await stage(page).boundingBox())!.width).toBeGreaterThan(1400);
    await expect(page.getByRole('button', { name: 'Satellite' })).toBeVisible();

    // Leaving by the browser's own way out — Esc, or the system control —
    // keeps the chip's words honest.
    await page.evaluate(() => document.exitFullscreen());
    await expect(page.getByRole('button', { name: 'View full screen' })).toBeVisible();
    await expect.poll(() => page.evaluate(() => document.fullscreenElement === null)).toBe(true);
  });

  test('a second click on a boundary zooms to it and stays on the combined map', async ({ page }) => {
    await openMap(page);
    const outline = page.getByRole('button', { name: 'Select Sy 214/2' });
    const before = (await outline.boundingBox())!.width;

    await outline.dblclick();

    await expect.poll(async () => (await outline.boundingBox())!.width).toBeGreaterThan(before * 1.5);
    await expect(page).toHaveURL(new RegExp(`${TAB}$`));
    // The way to the record's own map is the link that says so.
    await expect(stage(page).getByRole('link', { name: 'Its boundary' }))
      .toHaveAttribute('href', `/app/records/${ID.parcel}/map`);
  });

  test('where two boundaries share a corner both letters can be read, and no name sits on a length @phone', async ({ page }) => {
    await openMap(page);
    // Leaflet draws the letters and lengths as plain markers with no role, so
    // their classes are the only handles on them.
    const letters = stage(page).locator('.w-corner-no > span');
    const names = stage(page).locator('.pf-label');
    await expect(letters).toHaveText(['A', 'B', 'C', 'D', 'A', 'B', 'C', 'D']);

    const noTextOnText = async () => {
      const discs = await boxesOf(letters);
      for (let i = 0; i < discs.length; i += 1) {
        for (let j = i + 1; j < discs.length; j += 1) {
          expect(overlap(discs[i], discs[j]), `corner letters ${i} and ${j} overlap`).toBe(false);
        }
      }
      const text = [...await boxesOf(stage(page).locator('.w-side > span')), ...discs];
      for (const name of await boxesOf(names)) {
        for (const other of text) {
          expect(overlap(name, other), 'a name is printed over a length or a corner letter').toBe(false);
        }
      }
    };
    // Opening: two 2.4-acre outlines about 90px across. Too small for a name,
    // two lengths and two letters at once, so the names wait for a zoom rather
    // than print over the lengths.
    await noTextOnText();

    // One step in and every outline has room for its name, clear of the rest.
    await page.getByRole('button', { name: 'Zoom in' }).click();
    await expect(names).toHaveCount(2);
    await expect(names).toHaveText(['Sy 214/2', 'Sy 214/3'], { ignoreCase: false });
    await noTextOnText();
  });

  test('a scrolled map passes under the top bar, not over it @phone', async ({ page }) => {
    await openMap(page);
    const map = (await stage(page).boundingBox())!;
    await page.evaluate((y) => window.scrollBy(0, y), map.y - 20);
    // The sticky bar is the page's banner; its class is how the bar is found.
    const bar = (await page.locator('.topbar').boundingBox())!;
    const onTop = await page.evaluate(({ x, y }) =>
      !!document.elementFromPoint(x, y)?.closest('.topbar'),
    { x: map.x + map.width / 2, y: bar.y + bar.height / 2 });
    expect(onTop, 'the top bar is painted over the map, not under it').toBe(true);
  });

  test('the cards under the map stand apart from it and from each other @phone', async ({ page }) => {
    await openMap(page);
    const map = (await stage(page).boundingBox())!;
    const shared = page.locator('section', { has: page.getByRole('heading', { name: 'Shared edges' }) });
    const sheets = jointCard(page);
    const missing = page.locator('section', { has: page.getByRole('heading', { name: 'No boundary yet' }) });
    const [a, b, c] = await Promise.all([shared.boundingBox(), sheets.boundingBox(), missing.boundingBox()]);
    const railBox = (await rail(page).boundingBox())!;
    const above = Math.max(map.y + map.height, railBox.y + railBox.height);
    expect(a!.y - above, 'the first card touches the map').toBeGreaterThanOrEqual(8);
    expect(b!.y - (a!.y + a!.height), 'two cards touch').toBeGreaterThanOrEqual(8);
    expect(c!.y - (b!.y + b!.height), 'two cards touch').toBeGreaterThanOrEqual(8);
  });

  test('picking a record in the rail brings the map back into view @phone-only', async ({ page }) => {
    await openMap(page);
    const row = rail(page).getByRole('button', { name: /Sy 214\/3/ });
    await row.scrollIntoViewIfNeeded();
    expect((await stage(page).boundingBox())!.y, 'the map starts above the view').toBeLessThan(0);

    await row.click();

    await expect.poll(async () => (await stage(page).boundingBox())!.y).toBeGreaterThanOrEqual(56);
    const map = (await stage(page).boundingBox())!;
    expect(map.y + map.height).toBeLessThanOrEqual(page.viewportSize()!.height);
  });

  test('on a phone the head keeps its ⋮ on the title row, its menu opens on the screen, and the current tab shows @phone-only', async ({ page }) => {
    await openMap(page);
    const kebab = page.getByRole('button', { name: 'Actions for Katragunta Land' });
    const title = page.getByRole('heading', { level: 1, name: 'Katragunta Land' });
    const [k, t] = [(await kebab.boundingBox())!, (await title.boundingBox())!];
    expect(k.y, 'the ⋮ sits beside the title').toBeLessThan(t.y + t.height);
    expect(k.y + k.height).toBeGreaterThan(t.y);

    await kebab.click();
    const menu = page.getByRole('menu', { name: 'Actions for Katragunta Land' });
    await expect(menu.getByRole('menuitem', { name: 'Remove this combined view' })).toBeVisible();
    const m = (await menu.boundingBox())!;
    expect(m.x).toBeGreaterThanOrEqual(0);
    expect(m.x + m.width).toBeLessThanOrEqual(page.viewportSize()!.width);
    await page.keyboard.press('Escape');

    const strip = page.getByRole('navigation', { name: 'This combined view' });
    const tab = strip.getByRole('link', { name: /^Combined map/ });
    const [s, a] = [(await strip.boundingBox())!, (await tab.boundingBox())!];
    expect(a.x).toBeGreaterThanOrEqual(s.x - 1);
    expect(a.x + a.width, 'the current tab is cut off at the edge of the strip').toBeLessThanOrEqual(s.x + s.width + 1);
  });

  test('a joint FMB is removed from its row menu after asking, and a refused removal leaves it filed @phone', async ({ page, world }) => {
    let filed = true;
    world.set('combinedFmb', () => (filed ? FMB : { ...FMB, jointSheets: [] }));
    world.set('deleteJointFmb', false);
    await openMap(page);

    const card = jointCard(page);
    await expect(card.getByRole('link', { name: 'Open sheet' })).toBeVisible();
    // Remove is not a peer of the two actions that change nothing.
    await expect(card.getByRole('button', { name: 'Remove' })).toHaveCount(0);
    await card.getByRole('button', { name: 'More for Joint FMB sketch' }).click();
    await page.getByRole('menuitem', { name: 'Remove' }).click();

    const ask = page.getByRole('dialog', { name: 'Remove Joint FMB sketch?' });
    await expect(ask).toContainText('It comes off all 2 records it was filed on. The uploaded file itself is kept.');
    await ask.getByRole('button', { name: 'Remove' }).click();
    await expect(ask.getByRole('alert'))
      .toHaveText('That joint FMB could not be removed. It may already be gone. Reload the page.');
    await expect(ask).toBeVisible();

    world.set('deleteJointFmb', () => { filed = false; return true; });
    await ask.getByRole('button', { name: 'Remove' }).click();
    await expect(ask).toBeHidden();
    await expect(page.getByRole('heading', { name: 'Joint FMB', exact: true })).toHaveCount(0);
    expect(world.calls('deleteJointFmb')).toHaveLength(2);
    expect(world.lastVars('deleteJointFmb')).toEqual({ jointId: 'jf-1' });
  });

  test('adding a joint FMB files one uploaded sheet on every record ticked, and a refused filing says so @phone', async ({ page, world }) => {
    world.route(/\/api\/gateway\/storage\/files\?/, () => ({
      json: { id: UPLOADED, name: 'joint-sketch.png', sizeBytes: BLANK_TILE.length, mimeType: 'image/png' },
    }));
    world.set('addJointFmb', '');
    await openMap(page);

    await page.getByRole('button', { name: 'Add joint FMB' }).click();
    const dialog = page.getByRole('dialog', { name: 'Add a joint FMB' });
    await expect(dialog.getByRole('group', { name: 'Which records it covers' })).toBeVisible();
    await dialog.getByLabel('The sheet (PDF or photo)').setInputFiles({
      name: 'joint-sketch.png', mimeType: 'image/png', buffer: BLANK_TILE,
    });
    await dialog.getByRole('button', { name: 'Add to records' }).click();
    await expect(dialog.getByRole('alert')).toHaveText(
      'The sheet was uploaded but not filed. One of those records may have left this view — reload the page and try again.');
    expect(world.restCalls(/storage\/files\?/)).toHaveLength(1);

    world.set('addJointFmb', 'jf-2');
    await dialog.getByRole('button', { name: 'Add to records' }).click();
    await expect(dialog).toBeHidden();
    expect(world.restCalls(/storage\/files\?/)).toHaveLength(2);
    expect(world.lastVars('addJointFmb')).toMatchObject({
      combinedId: CP, fileRef: UPLOADED, recordIds: [ID.parcel, EAST, ID.plot],
    });
  });

  test('reading a joint FMB that carries no georeference says so on its row @phone', async ({ page, world }) => {
    await openMap(page);
    const card = jointCard(page);
    await card.getByRole('button', { name: 'Place outlines' }).click();
    await expect(card.getByRole('alert')).toHaveText(
      'No georeferenced survey lines were found in this sheet. Give each record its boundary on its own Location tab.');
    expect(world.restCalls(new RegExp(`storage/files/${SHEET_REF}/content`))).toHaveLength(1);
  });

  test('renaming the combined view from its head saves the name, and a refused rename says nothing changed @phone', async ({ page, world }) => {
    world.set('updateCombinedProperty', false);
    await openMap(page);
    await page.getByRole('button', { name: 'Actions for Katragunta Land' }).click();
    await page.getByRole('menuitem', { name: 'Edit name & records' }).click();

    const dialog = page.getByRole('dialog', { name: 'Edit Katragunta Land' });
    await dialog.getByLabel('What do you call it').fill('Katragunta Farm');
    await dialog.getByRole('button', { name: 'Save' }).click();
    await expect(dialog.getByRole('alert')).toHaveText('That name could not be saved. Nothing has changed.');
    expect(world.lastVars('updateCombinedProperty')).toMatchObject({ id: CP, name: 'Katragunta Farm' });

    world.set('updateCombinedProperty', true);
    await dialog.getByRole('button', { name: 'Save' }).click();
    await expect(dialog).toBeHidden();
    expect(world.calls('updateCombinedProperty')).toHaveLength(2);
    expect(world.calls('setCombinedMembers')).toHaveLength(0);
  });

  test('removing the combined view asks first, keeps it when refused, and goes back to the list when done @phone', async ({ page, world }) => {
    world.set('deleteCombinedProperty', false);
    world.set('combinedProperties', []);
    await openMap(page);
    await page.getByRole('button', { name: 'Actions for Katragunta Land' }).click();
    await page.getByRole('menuitem', { name: 'Remove this combined view' }).click();

    const ask = page.getByRole('dialog', { name: 'Remove the combined view Katragunta Land?' });
    await expect(ask).toContainText('3 records go back to standing on their own.');
    await ask.getByRole('button', { name: 'Remove' }).click();
    await expect(ask.getByRole('alert')).toHaveText(
      'That combined view could not be removed — it may already be gone. Reload the page.');
    await expect(page).toHaveURL(new RegExp(`${TAB}$`));

    world.set('deleteCombinedProperty', true);
    await ask.getByRole('button', { name: 'Remove' }).click();
    await expect(page).toHaveURL(/\/app\/combined$/);
    await expect(page.getByText('No combined views yet')).toBeVisible();
    expect(world.lastVars('deleteCombinedProperty')).toEqual({ id: CP });
  });

  test('the combined map waits in its own words', async ({ page, world }) => {
    world.set('combinedFmb', World.never());
    await page.goto(TAB);
    await expect(page.getByRole('status', { name: 'Loading the combined map' })).toBeVisible();
  });
});
