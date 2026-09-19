import type { Page } from '@playwright/test';
import { villageKey } from '../../../packages/core/src/land/geo';
import { test, expect, BLANK_TILE, createMapRecord, deleteMapRecords } from './mapsHarness';

const village = 'MAP FIXTURE VILLAGE';
const west = [[17, 82], [17, 82.002], [17.002, 82.002], [17.002, 82]];
const east = [[17, 82.002], [17, 82.004], [17.002, 82.004], [17.002, 82.002]];

async function openVillage(page: Page) {
  const manifest = [{ village, file: 'map-fixture.json', key: villageKey(village),
    plots: 2, centre: [17.001, 82.002], outline: [west, east] }];
  await page.route('**/vm/overview.json', (route) => route.fulfill({ json: manifest }));
  await page.route('**/vm/index.json', (route) => route.fulfill({ json: manifest }));
  await page.route('**/api/gateway/pattadar/village-maps', (route) => route.fulfill({ json: [] }));
  await page.route('**/vm/map-fixture.json', (route) => route.fulfill({ json: {
    type: 'FeatureCollection',
    features: [west, east].map((ring, i) => ({ type: 'Feature',
      properties: { lp: i === 0 ? '262' : '263', ac: '1' },
      geometry: { type: 'Polygon', coordinates: [[...ring, ring[0]].map(([lat, lon]) => [lon, lat])] },
    })),
  } }));
  await page.goto('/app/villages');
  await page.getByRole('button', { name: new RegExp(`^${village}`) }).click();
  await expect(page.locator('.vc-badge')).toContainText(village);
  await expect(page.locator('.vc-label').first()).toBeVisible();
}

test('village tape requires Satellite, restores the prior map, and supports undo and clear', async ({ page }) => {
  await openVillage(page);
  const mode = (name: string) => page.getByRole('button', { name, exact: true });
  await mode('Boundaries').click();
  await expect(mode('Boundaries')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.leaflet-tile-pane img')).toHaveCount(0);

  await mode('Measure on satellite').click();
  await expect(mode('Satellite')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.vc-measure')).toContainText('Satellite locked');
  for (const name of ['Satellite', 'Street map', 'Plot size', 'Boundaries']) {
    await expect(mode(name)).toBeDisabled();
  }
  await expect.poll(() => page.locator('.leaflet-tile-pane img').count()).toBeGreaterThan(0);

  const map = (await page.locator('.vc-map').boundingBox())!;
  for (const [x, y] of [[0.38, 0.57], [0.58, 0.57], [0.58, 0.75]]) {
    await page.mouse.click(map.x + map.width * x, map.y + map.height * y);
  }
  const tape = page.locator('.vc-legend', { hasText: 'Measure' });
  await expect(tape).toContainText('Perimeter');
  await expect(tape).toContainText('3 points');
  await expect(tape).toContainText('Encloses');
  await expect(page.locator('.w-side')).toHaveCount(3);
  const readout = await tape.innerText();
  const metres = Number(/Perimeter ([\d,.]+)/.exec(readout)![1].replace(/,/g, ''));
  const sideTotal = (await page.locator('.w-side').allTextContents()).reduce((sum, text) => {
    const n = Number(text.replace(/,/g, '').split(' ')[0]);
    return sum + n * (text.endsWith('km') ? 1000 : 1);
  }, 0);
  expect(Math.abs(metres - sideTotal)).toBeLessThan(1);
  await mode('Undo point').click();
  await expect(tape).toContainText('Distance');
  await expect(tape).not.toContainText('Encloses');
  await expect(page.locator('.w-corner-no')).toHaveCount(2);
  await mode('Clear measure').click();
  await expect(page.locator('.w-corner-no')).toHaveCount(0);
  await expect(page.locator('.w-side')).toHaveCount(0);
  await expect(mode('Measure on satellite')).toHaveAttribute('aria-pressed', 'true');

  await mode('Measure on satellite').click();
  await expect(mode('Boundaries')).toHaveAttribute('aria-pressed', 'true');
  for (const name of ['Satellite', 'Street map', 'Plot size', 'Boundaries']) {
    await expect(mode(name)).toBeEnabled();
  }
  await expect(page.locator('.leaflet-tile-pane img')).toHaveCount(0);
  await expect(tape).toHaveCount(0);
});

test('village map controls and survey search stay usable on a phone', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openVillage(page);
  await page.getByRole('button', { name: 'Street map', exact: true }).click();
  await page.getByLabel('Find survey or plot number').fill('Sy 262');
  await page.getByRole('button', { name: 'Find plot', exact: true }).click();
  await expect(page.locator('.vc-tr')).toContainText('Plot 262');
  await expect(page.locator('.vm-plotno')).toContainText('262');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const tools = (await page.locator('.vc-tl').boundingBox())!;
  const search = (await page.locator('.vc-tr').boundingBox())!;
  expect(tools.y + tools.height <= search.y || search.y + search.height <= tools.y
    || tools.x + tools.width <= search.x || search.x + search.width <= tools.x).toBe(true);
  const go = (await page.getByRole('button', { name: 'Find plot', exact: true }).boundingBox())!;
  const zoom = (await page.locator('.leaflet-control-zoom').boundingBox())!;
  expect(go.x + go.width <= zoom.x || go.y + go.height <= zoom.y).toBe(true);
  await page.getByRole('button', { name: 'Measure on satellite', exact: true }).click();
  const measuringTools = (await page.locator('.vc-tl').boundingBox())!;
  const measuringSearch = (await page.locator('.vc-tr').boundingBox())!;
  expect(measuringSearch.y - measuringTools.y - measuringTools.height).toBeGreaterThanOrEqual(80);
});

test('village street tiles report failure after imagery loaded and can be retried', async ({ page }) => {
  await openVillage(page);
  await expect(page.locator('.leaflet-tile-loaded').first()).toBeVisible();
  let fail = true;
  await page.route('**/tile.openstreetmap.org/**', (route) => fail ? route.abort()
    : route.fulfill({ status: 200, contentType: 'image/png', body: BLANK_TILE }));
  await page.getByRole('button', { name: 'Street map', exact: true }).click();
  await expect(page.locator('.vc-tile-error')).toContainText('Street map could not fully load');
  await expect(page.locator('.vc-label').first()).toBeVisible();
  fail = false;
  await page.getByRole('button', { name: 'Retry map', exact: true }).click();
  await expect(page.locator('.vc-tile-error')).toHaveCount(0);
  await expect(page.locator('.leaflet-tile-loaded').first()).toBeVisible();
  await page.getByRole('link', { name: 'Your land on map', exact: true }).click();
  await expect(page).toHaveURL(/\/properties\?view=map$/);
});

test('a subdivision record does not claim its parent survey plot', async ({ page, request }) => {
  const id = await createMapRecord(request, { title: 'Sy 262/1', village,
    ownerName: 'Subdivision owner regression' });
  try {
    await openVillage(page);
    await page.getByLabel('Find survey or plot number').fill('262');
    await page.getByRole('button', { name: 'Find plot', exact: true }).click();
    await expect(page.locator('.vm-facts')).toContainText('Not one of your records');
    await expect(page.locator('.vm-facts')).not.toContainText('Subdivision owner regression');
  } finally {
    await deleteMapRecords(request, [id]);
  }
});

test('a crossed village tape shows distance without claiming acreage or offering a fence estimate', async ({ page }) => {
  await openVillage(page);
  const map = (await page.locator('.vc-map').boundingBox())!;
  await page.mouse.click(map.x + map.width * 0.38, map.y + map.height * 0.57);
  await expect(page.locator('.vm-plotno')).toBeVisible();
  await page.getByRole('button', { name: 'Measure on satellite', exact: true }).click();
  for (const [x, y] of [[0.38, 0.57], [0.60, 0.75], [0.38, 0.75], [0.60, 0.57]]) {
    await page.mouse.click(map.x + map.width * x, map.y + map.height * y);
  }
  const tape = page.locator('.vc-measure');
  await expect(tape).toContainText('crosses itself');
  await expect(tape).toContainText('Perimeter');
  await expect(tape).not.toContainText('Encloses');
  await expect(page.getByRole('button', { name: 'Fence calculator', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Undo point', exact: true }).click();
  await expect(tape).toContainText('Encloses');
  await expect(page.getByRole('button', { name: 'Fence calculator', exact: true })).toBeEnabled();
});
