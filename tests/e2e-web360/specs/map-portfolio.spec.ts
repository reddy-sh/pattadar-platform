import { test, expect, BLANK_TILE, createMapRecord, deleteMapRecords, mapsGql } from './mapsHarness';

test.describe('portfolio map workflows', () => {
  test.describe.configure({ mode: 'serial' });
  const ids: string[] = [];
  const ring = [17.07, 82.13, 17.071, 82.13, 17.071, 82.131, 17.07, 82.131];

  test.beforeAll(async ({ request }) => {
    for (const title of ['971/1', '972/1', '973/1']) {
      ids.push(await createMapRecord(request, { title, ownerName: 'Portfolio map regression' }));
    }
    await mapsGql(request,
      'mutation($id:String!,$ring:[Float!]!) { web { setBoundary(recordId:$id,ring:$ring) } }',
      { id: ids[0], ring });
    await mapsGql(request,
      'mutation($id:String!,$lat:Float!,$lon:Float!) { web { setPin(recordId:$id,lat:$lat,lon:$lon) } }',
      { id: ids[1], lat: 17.08, lon: 82.14 });
  });
  test.afterAll(async ({ request }) => { await deleteMapRecords(request, ids); });

  test('old map URL keeps search, uses real geometry, and offers missing locations', async ({ page }) => {
    await page.goto('/app/map?q=Portfolio+map+regression');
    await expect(page).toHaveURL(/\/properties\?.*view=map/);
    await expect(page.locator('.pf-result')).toHaveCount(3);
    await expect(page.locator('.pf-shape')).toHaveCount(1);
    await expect(page.locator('.pf-pin')).toHaveCount(1);
    await expect(page.getByRole('status').filter({ hasText: '3 matching records' })).toContainText('2 on map');
    const unlocated = page.locator('.pf-result').filter({ hasText: '973/1' });
    await expect(unlocated).toContainText('Add a location');
    await unlocated.getByRole('link').click();
    await expect(page).toHaveURL(new RegExp(`/records/${ids[2]}/map$`));
    await expect(page.getByRole('button', { name: 'Draw boundary', exact: true })).toBeVisible();
  });

  test('search and selection survive map movement, layer changes and reload', async ({ page }) => {
    await page.goto('/app/properties?view=map');
    await page.getByRole('searchbox', { name: 'Search your land on the map' }).fill('971/1');
    await expect(page.locator('.pf-result')).toHaveCount(1);
    await expect(page.locator('.pf-label')).toHaveCount(1);
    await page.locator('.pf-result-pick').click();
    await expect(page.locator('.pf-pick')).toContainText('971/1');
    await page.locator('.pf-map').focus();
    await page.keyboard.press('ArrowRight');
    await expect(page.locator('.pf-label')).toHaveCount(1);
    await expect(page.locator('.pf-label')).toContainText('971/1');
    await page.getByRole('button', { name: 'Satellite', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Satellite', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('.pf-shape')).toHaveCount(1);
    await page.reload();
    await expect(page.getByRole('button', { name: 'Map', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByRole('searchbox', { name: 'Search your land on the map' })).toHaveValue('971/1');
    await expect(page.locator('.pf-result')).toHaveCount(1);
  });

  test('a pin can be selected from the keyboard without hover losing focus', async ({ page }) => {
    await page.goto('/app/properties?view=map&q=972%2F1');
    const pin = page.locator('.pf-pin');
    await pin.focus();
    await pin.press('Enter');
    await expect(page.locator('.pf-pick')).toContainText('972/1');
    await expect(pin).toBeFocused();
    await expect(pin).toHaveAttribute('aria-pressed', 'true');
    await page.locator('.pf-pick').getByRole('link', { name: 'Boundary' }).click();
    await expect(page).toHaveURL(new RegExp(`/records/${ids[1]}/map$`));
  });

  test('failed satellite imagery can be retried after street tiles have loaded', async ({ page }) => {
    await page.goto('/app/properties?view=map&q=971%2F1');
    await expect(page.locator('.leaflet-tile-loaded').first()).toBeVisible();
    let fail = true;
    await page.route('**/server.arcgisonline.com/**', (route) => fail
      ? route.abort()
      : route.fulfill({ status: 200, contentType: 'image/png', body: BLANK_TILE }));
    await page.getByRole('button', { name: 'Satellite', exact: true }).click();
    await expect(page.locator('.pf-map-error')).toContainText('Satellite imagery could not be fully loaded');
    await expect(page.locator('.pf-shape')).toHaveCount(1);
    fail = false;
    await page.getByRole('button', { name: 'Retry map', exact: true }).click();
    await expect(page.locator('.pf-map-error')).toHaveCount(0);
    await expect(page.locator('.leaflet-tile-loaded').first()).toBeVisible();
  });

  test('phone map search has a usable empty state and no horizontal overflow', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/app/properties?view=map&q=Portfolio+map+regression');
    const search = page.getByRole('searchbox', { name: 'Search your land on the map' });
    await search.fill('no-matching-land-qa');
    // A search that matches nothing must name what it searched for and offer the
    // way back — not leave the reader on a blank map. This spec ran in no gate
    // for long enough to keep asserting the pre-Bloom copy ('No matching land' /
    // 'Clear search and filters'), which the screen has not said for weeks.
    await expect(page.getByRole('heading', { name: /Nothing matches/ })).toBeVisible();
    await expect(page.getByText('no-matching-land-qa', { exact: false }).first()).toBeVisible();
    await page.getByRole('button', { name: 'Clear search', exact: true }).click();
    await expect(page.locator('.pf-result')).toHaveCount(3);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    const box = await page.locator('.pf-stage').boundingBox();
    expect(box!.width).toBeGreaterThan(300);
    expect(box!.height).toBeGreaterThan(300);
  });

  test('adding from the map lands on the new record boundary', async ({ page }) => {
    await page.goto('/app/properties?view=map');
    await page.getByRole('button', { name: 'Add', exact: true }).click();
    await page.getByRole('button', { name: 'Enter the details by hand instead' }).click();
    await page.locator('#rd-title').fill('974/1');
    const saved = page.waitForResponse((response) => {
      const body = response.request().postData() ?? '';
      return response.url().includes('/graphql') && body.includes('saveRecord');
    });
    await page.getByRole('button', { name: 'Add record', exact: true }).click();
    const body = await (await saved).json();
    const id = body.data.web.saveRecord as string;
    ids.push(id);
    await expect(page).toHaveURL(new RegExp(`/records/${id}/map$`));
    await expect(page.getByRole('button', { name: 'Draw boundary', exact: true })).toBeVisible();
  });
});
