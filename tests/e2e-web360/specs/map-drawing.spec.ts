import type { APIRequestContext, Page } from '@playwright/test';
import {
  test as mapsTest, expect, mapsGql, createMapRecord, deleteMapRecords, readMapBoundary,
  restingBox,
} from './mapsHarness';

const test = mapsTest.extend<{ recordId: string }>({
  recordId: async ({ request }, use) => {
    const id = await createMapRecord(request);
    try { await use(id); } finally { await deleteMapRecords(request, [id]); }
  },
});

const RING = [[15.7, 79.3], [15.7, 79.302], [15.702, 79.302], [15.702, 79.3]];
const GEOJSON = JSON.stringify({ type: 'Polygon', coordinates: [[
  ...RING, RING[0],
].map(([lat, lon]) => [lon, lat])] });

async function saveFixtureBoundary(request: APIRequestContext, recordId: string) {
  await mapsGql(request,
    'mutation($recordId:String!,$ring:[Float!]!) { web { setBoundary(recordId:$recordId,ring:$ring) } }',
    { recordId, ring: RING.flat() });
}

async function openMap(page: Page, id: string) {
  await page.goto(`/app/records/${id}/map`);
  await expect(page.locator('.plot .leaflet-container')).toBeVisible();
}

async function clickMap(page: Page, x: number, y: number) {
  const map = page.locator('.plot .map');
  await map.scrollIntoViewIfNeeded();
  const box = (await map.boundingBox())!;
  await page.mouse.click(box.x + box.width * x, box.y + box.height * y);
}

test('import previews and cancels without saving, then explicitly saves and reloads', async ({ page, request, recordId }) => {
  await openMap(page, recordId);
  const file = page.locator('input[type=file]');
  await file.setInputFiles({ name: 'my-field.geojson', mimeType: 'application/geo+json', buffer: Buffer.from(GEOJSON) });
  await expect(page.locator('.w-draft-no')).toHaveCount(4);
  await expect(page.locator('.mapsays')).toContainText('Previewing my-field.geojson');
  expect(await readMapBoundary(request, recordId)).toEqual([]);
  const preview = (await page.locator('path.w-draft').boundingBox())!;
  expect(preview.width, 'the imported parcel must be framed for review').toBeGreaterThan(150);
  await page.locator('.editbar').getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(page.locator('path.w-draft')).toHaveCount(0);
  expect(await readMapBoundary(request, recordId)).toEqual([]);

  const kml = `<kml><Placemark><Polygon><outerBoundaryIs><LinearRing><coordinates>${[...RING, RING[0]]
    .map(([lat, lon]) => `${lon},${lat},0`).join(' ')}</coordinates></LinearRing></outerBoundaryIs></Polygon></Placemark></kml>`;
  await file.setInputFiles({ name: 'my-field.kml', mimeType: 'application/vnd.google-earth.kml+xml', buffer: Buffer.from(kml) });
  await expect(page.locator('.w-draft-no')).toHaveCount(4);
  await page.getByRole('button', { name: 'Save boundary', exact: true }).click();
  await expect(page.locator('path.w-ring')).toHaveCount(1);
  await expect.poll(() => readMapBoundary(request, recordId)).toEqual(RING.flat());
  await page.reload();
  await expect(page.locator('path.w-ring')).toHaveCount(1);
  await expect(page.locator('.w-corner-no')).toHaveCount(4);
});

test('a corner keeps dragging through updates and supports keyboard adjustment', async ({ page, request, recordId }) => {
  await saveFixtureBoundary(request, recordId);
  await openMap(page, recordId);
  await page.getByRole('button', { name: 'Redraw boundary', exact: true }).click();
  // Redraw starts with the saved corners, so adjust the top-right corner
  // inward without placing additional points or crossing the opposite edge.
  await expect(page.locator('.w-draft-no')).toHaveCount(4);
  const corner = page.locator('.w-draft-no').nth(2);
  const element = (await corner.elementHandle())!;
  // Not boundingBox(): entering redraw animates fitBounds, so the corner is
  // still sliding when it first appears. Measuring mid-animation is what made
  // this drag land 6.8px off in a full run and exact when run alone.
  const before = (await restingBox(corner))!;
  const outline = page.locator('path.w-draft');
  const originalPath = await outline.getAttribute('d');
  await page.mouse.move(before.x + 18, before.y + 18);
  await page.mouse.down();
  await page.mouse.move(before.x - 2, before.y + 30, { steps: 5 });
  await expect(outline).not.toHaveAttribute('d', originalPath!);
  await page.mouse.move(before.x - 72, before.y + 58, { steps: 12 });
  await page.mouse.up();
  expect(await element.evaluate((node) => node.isConnected), 'drag updates must retain the active marker').toBe(true);
  const after = (await corner.boundingBox())!;
  expect(after.x - before.x).toBeCloseTo(-90, 0);
  expect(after.y - before.y).toBeCloseTo(40, 0);

  await corner.focus();
  await page.keyboard.press('ArrowRight');
  await expect(corner).toBeFocused();
  expect(await element.evaluate((node) => node.isConnected)).toBe(true);
  const nudged = (await corner.boundingBox())!;
  expect(nudged.x - after.x).toBeCloseTo(1, 0);
  await page.getByRole('button', { name: 'Save boundary', exact: true }).click();
  await expect(page.locator('path.w-draft')).toHaveCount(0);
  const saved = await readMapBoundary(request, recordId);
  expect(saved).toHaveLength(8);
  expect(saved).not.toEqual(RING.flat());
});

test('phone drawing frames every corner clear of the tools and save bar', async ({ page, request, recordId }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await saveFixtureBoundary(request, recordId);
  await openMap(page, recordId);
  await page.getByRole('button', { name: 'Redraw boundary', exact: true }).click();
  await expect(page.locator('.w-draft-no')).toHaveCount(4);
  const layoutProblems = () => page.evaluate(() => {
    const panel = document.querySelector('.plot')!;
    const frame = panel.querySelector('.map')!.getBoundingClientRect();
    const tools = panel.querySelector('.maptools')!.getBoundingClientRect();
    const message = panel.querySelector('.mapsays')!.getBoundingClientRect();
    const editbar = panel.querySelector('.editbar')!.getBoundingClientRect();
    const zoom = panel.querySelector('.zoom')!.getBoundingClientRect();
    const problems: string[] = [];
    panel.querySelectorAll('.w-draft-no').forEach((corner, index) => {
      const rect = corner.getBoundingClientRect();
      const x = rect.x + rect.width / 2;
      const y = rect.y + rect.height / 2;
      if (x < frame.left || x > frame.right || y < frame.top || y > frame.bottom) problems.push(`Corner ${index + 1} outside map`);
      for (const [name, overlay] of [['tools', tools], ['save bar', message]] as const) {
        if (x >= overlay.left && x <= overlay.right && y >= overlay.top && y <= overlay.bottom) problems.push(`Corner ${index + 1} behind ${name}`);
      }
    });
    if (editbar.left < zoom.right && editbar.right > zoom.left
      && editbar.top < zoom.bottom && editbar.bottom > zoom.top) problems.push('Save bar overlaps zoom controls');
    return problems;
  });
  await expect.poll(layoutProblems).toEqual([]);
  const scale = await page.locator('.leaflet-control-scale-line').textContent();
  await page.getByRole('button', { name: 'Zoom in', exact: true }).click();
  await expect(page.locator('.leaflet-control-scale-line')).not.toHaveText(scale!);
  await page.getByRole('button', { name: 'Recentre', exact: true }).click();
  await expect.poll(layoutProblems).toEqual([]);
});

test('drawing over a village plot adds corners and double-click does not zoom', async ({ page, recordId }) => {
  const manifest = [{ village: 'Maps fixture', file: 'maps-fixture.geojson', key: 'mapsfixture' }];
  await page.route('**/vm/index.json', (route) => route.fulfill({ json: manifest }));
  await page.route('**/vm/overview.json', (route) => route.fulfill({ json: manifest }));
  await page.route('**/vm/maps-fixture.geojson', (route) => route.fulfill({ json: {
    type: 'FeatureCollection', features: [{ type: 'Feature', properties: { lp: '101', ac: '11.8' },
      geometry: JSON.parse(GEOJSON) }],
  } }));
  await openMap(page, recordId);
  await page.getByRole('button', { name: 'Village map', exact: true }).click();
  await expect(page.locator('.vmnote')).toContainText('1 plots');
  await expect(page.locator('.plot .leaflet-overlay-pane canvas')).toBeVisible();
  await page.getByRole('button', { name: 'Draw boundary', exact: true }).click();
  await clickMap(page, 0.55, 0.45);
  await expect(page.locator('.w-draft-no')).toHaveCount(1);
  const scale = await page.locator('.leaflet-control-scale-line').textContent();
  const box = (await page.locator('.plot .map').boundingBox())!;
  await page.mouse.dblclick(box.x + box.width * 0.65, box.y + box.height * 0.55);
  await expect(page.locator('.w-draft-no')).toHaveCount(2);
  await expect(page.locator('.leaflet-control-scale-line')).toHaveText(scale!);
  await expect(page.getByRole('button', { name: 'Save boundary', exact: true })).toBeDisabled();
});

test('a late place lookup cannot move an outline while it is being drawn', async ({ page, request, recordId }) => {
  await mapsGql(request,
    'mutation($recordId:String!,$lat:Float!,$lon:Float!) { web { setPin(recordId:$recordId,lat:$lat,lon:$lon) } }',
    { recordId, lat: 15.701, lon: 79.301 });
  let release!: () => void;
  let lookupStarted!: () => void;
  const waiting = new Promise<void>((resolve) => { release = resolve; });
  const started = new Promise<void>((resolve) => { lookupStarted = resolve; });
  await page.route(/nominatim\.openstreetmap\.org/i, async (route) => {
    lookupStarted();
    await waiting;
    await route.fulfill({ json: [{ lat: '17.5', lon: '82.5',
      boundingbox: ['17.4', '17.6', '82.4', '82.6'],
      display_name: 'Maps fixture, Map test mandal, Map test district, Andhra Pradesh, India' }] });
  });
  try {
    await openMap(page, recordId);
    await started;
    await page.getByRole('button', { name: 'Draw boundary', exact: true }).click();
    for (const [x, y] of [[0.5, 0.35], [0.7, 0.35], [0.7, 0.6]]) await clickMap(page, x, y);
    await expect(page.locator('.w-draft-no')).toHaveCount(3);
    const before = (await page.locator('path.w-draft').boundingBox())!;
    const response = page.waitForResponse(/nominatim\.openstreetmap\.org/i);
    release();
    await response;
    // A further corner must still land in the same view after the response.
    await clickMap(page, 0.5, 0.6);
    await expect(page.locator('.w-draft-no')).toHaveCount(4);
    const after = (await page.locator('path.w-draft').boundingBox())!;
    expect(after.x).toBeCloseTo(before.x, 0);
    expect(after.y).toBeCloseTo(before.y, 0);
    expect(after.width).toBeCloseTo(before.width, 0);
    await expect(page.getByRole('button', { name: 'Save boundary', exact: true })).toBeEnabled();
  } finally { release(); }
});

test('moving a saved boundary mark can be canceled or saved explicitly', async ({ page, request, recordId }) => {
  await saveFixtureBoundary(request, recordId);
  const mark = await mapsGql(request,
    'mutation($recordId:String!,$label:String!,$lat:Float!,$lon:Float!,$detail:String!) { web { addMark(recordId:$recordId,label:$label,lat:$lat,lon:$lon,detail:$detail) } }',
    { recordId, label: 'Field stone', lat: 15.701, lon: 79.301, detail: 'Recorded for map correction' });
  const readMark = async () => {
    const result = await mapsGql(request,
      'query($id:String!) { web { boundary(recordId:$id) { marks { id lat lon state } } } }', { id: recordId });
    return result.boundary.marks.find((row: { id: string }) => row.id === mark.addMark);
  };
  await openMap(page, recordId);
  const before = await readMark();
  const arm = async () => {
    await page.getByRole('button', { name: 'Actions for Field stone', exact: true }).click();
    await page.getByRole('menuitem', { name: 'Move this mark', exact: true }).click();
    await expect(page.locator('.mapsays')).toContainText('Click the corrected location for Field stone');
  };
  await arm();
  await page.locator('.editbar').getByRole('button', { name: 'Cancel', exact: true }).click();
  expect(await readMark()).toEqual(before);
  await arm();
  await clickMap(page, 0.65, 0.5);
  await expect.poll(async () => (await readMark()).state).toBe('moved');
  const moved = await readMark();
  expect([moved.lat, moved.lon]).not.toEqual([before.lat, before.lon]);
  await expect(page.locator('.plot .map.picking')).toHaveCount(0);
});

test('measurements work on both basemaps and satellite failure follows a successful street load', async ({ page, request, recordId }) => {
  await saveFixtureBoundary(request, recordId);
  await openMap(page, recordId);
  await expect(page.locator('.w-side')).toHaveCount(4);
  const satellite = page.getByRole('button', { name: 'Satellite', exact: true });
  await expect(satellite).toBeEnabled();
  await expect(satellite).toHaveAttribute('aria-pressed', 'true');
  await satellite.click();
  await expect(page.locator('.leaflet-control-attribution')).toContainText('OpenStreetMap');
  await expect(page.locator('.w-tiles-street img.leaflet-tile-loaded').first()).toBeVisible();
  await expect(page.locator('.w-side')).toHaveCount(4);
  await expect(page.getByRole('button', { name: 'Measure', exact: true })).toHaveAttribute('aria-pressed', 'true');

  await page.route(/server\.arcgisonline\.com/i, (route) => route.abort());
  // Previously viewed imagery is retained by the browser. Move to a new tile
  // zoom so this exercises a real failing request, rather than cached pixels.
  const scale = await page.locator('.leaflet-control-scale-line').textContent();
  await page.getByRole('button', { name: 'Zoom out', exact: true }).click();
  await expect(page.locator('.leaflet-control-scale-line')).not.toHaveText(scale!);
  await satellite.click();
  await expect(page.getByText('Satellite imagery is unavailable here.', { exact: false })).toBeVisible();
  await expect(page.locator('.w-side')).toHaveCount(4);
  await expect(page.locator('path.w-ring')).toHaveCount(1);
  await satellite.click();
  await expect(page.getByText('Satellite imagery is unavailable here.', { exact: false })).toHaveCount(0);
  await expect(page.locator('.w-side')).toHaveCount(4);
});
