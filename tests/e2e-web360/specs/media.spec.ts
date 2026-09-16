/** The Media hanger.
 *
 *  It is here because Media was the one hanger that left the record frame: a
 *  full-bleed gallery with its own back button and no tab strip, so opening it
 *  dropped the reader out of the record with only the browser to get back. The
 *  first test is that regression, asserted from the strip the way an owner
 *  arrives — not by navigating straight to the URL, which is the one route that
 *  would still have looked fine.
 *
 *  The second is that a photograph picked on this screen is filed against the
 *  record and comes back as an image the browser can actually decode.
 */
import { randomUUID } from 'node:crypto';
import { readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';

const GQL = '/api/gateway/pattadar/graphql';
const PHOTO = path.join(__dirname, '..', 'fixtures', 'land-photo.png');

/** A storage gateway that serves back the bytes that were uploaded.
 *
 *  Deliberately not modelled on the fixture in crud-360.spec.ts, which rebuilds
 *  the multipart body with `new Request(...).formData()`: that hands back File
 *  objects of ZERO bytes, so an assertion about a rendered photograph would pass
 *  against an empty blob and prove nothing. This one keeps the path it was given
 *  and reads it off the disk, so `naturalWidth` below is a real measurement of a
 *  real picture.
 */
async function storageServing(page: import('@playwright/test').Page, queue: string[]) {
  const pending = [...queue];
  const files = new Map<string, { name: string; mimeType: string; file: string }>();
  await page.route('**/api/gateway/storage/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname.endsWith('/files') && request.method() === 'POST') {
      const file = pending.shift();
      expect(file, 'the app uploaded more files than this test queued').toBeTruthy();
      const name = path.basename(file!);
      const id = randomUUID();
      files.set(id, { name, mimeType: 'image/png', file: file! });
      await route.fulfill({
        json: { id, name, mimeType: 'image/png', sizeBytes: statSync(file!).size },
      });
      return;
    }
    const content = url.pathname.match(/\/files\/([^/]+)\/content$/);
    const node = content?.[1] ? files.get(content[1]) : undefined;
    if (content && node) {
      await route.fulfill({ contentType: node.mimeType, body: readFileSync(node.file) });
    } else {
      await route.fulfill({ status: 404, json: {} });
    }
  });
}

/** A record of its own, so the empty state is the one under test and the seed's
 *  counts — which a dozen other assertions cross-check — are left alone. */
async function scratch(request: import('@playwright/test').APIRequestContext) {
  const made = await request.post(GQL, { data: {
    query: 'mutation SR($input:RecordInput!) { web { saveRecord(input:$input) } }',
    variables: { input: {
      kind: 'parcel', title: 'Sy MEDIA-E2E', classification: 'agri', status: 'owned',
      stake: 'owned', ownerName: 'Media Test', village: 'Katragunta',
      mandal: 'Konakalamitla', district: 'Markapur', extent: 2.8, extentUnit: 'ac' } } } });
  return (await made.json()).data.web.saveRecord as string;
}

async function sweep(request: import('@playwright/test').APIRequestContext, id: string) {
  await request.post(GQL, { data: {
    query: 'mutation DR($ids:[String!]!) { web { deleteRecords(ids:$ids) } }',
    variables: { ids: [id] } } });
}

test.describe('W05 · the Media hanger', () => {
  test('is reached from the strip and keeps the record around it', async ({ page, request }) => {
    const id = await scratch(request);
    try {
      await page.goto(`/app/records/${id}`);
      await page.locator('.tabs').getByRole('link', { name: /^Media/ }).click();
      await expect(page).toHaveURL(new RegExp(`/app/records/${id}/photos$`));

      // The frame: the record is still the <h1>, the breadcrumb names the
      // hanger, the strip is still there to leave by, and the fill meter still
      // says how much of the record is done.
      await expect(page.getByRole('heading', { level: 1 })).toHaveText('Sy MEDIA-E2E');
      await expect(page.locator('.crumbs')).toContainText('Media');
      await expect(page.locator('.tabs')).toBeVisible();
      await expect(page.locator('.fill')).toContainText('of 9 parts');

      // The hanger's own heading, and its counts — which must not claim a visit
      // on a record nothing has been filmed on.
      await expect(page.getByRole('heading', { level: 2 }).first()).toHaveText('Photos and video');
      await expect(page.locator('.sechead')).toContainText('nothing filmed here yet');

      // Six targets and the two rail cards, rather than one grey sentence.
      await expect(page.locator('.droptile')).toHaveCount(6);
      await expect(page.getByRole('heading', { name: 'What to photograph' })).toBeVisible();
      await expect(page.getByRole('heading', { name: 'Limits' })).toBeVisible();

      // And back out again, without the browser's Back button.
      await page.locator('.tabs').getByRole('link', { name: /^Papers/ }).click();
      await expect(page).toHaveURL(new RegExp(`/app/records/${id}$`));
    } finally {
      await sweep(request, id);
    }
  });

  test('a photograph picked here is filed, counted and decodable', async ({ page, request }) => {
    const id = await scratch(request);
    try {
      await storageServing(page, [PHOTO]);
      await page.goto(`/app/records/${id}/photos`);
      await expect(page.locator('.droptile').first()).toBeVisible();

      // A tile opens the drawer rather than firing the picker, and the picker
      // itself lives inside it — so nothing is uploaded until the panel's own
      // primary is pressed. That moment is the whole point of the panel: the pick
      // can be looked at and captioned before any bytes leave.
      await page.locator('.droptile').first().click();
      const panel = page.getByRole('dialog', { name: /^Add (photos or video|\d+ files)$/ });
      await expect(panel).toBeVisible();
      await page.locator('main input[type=file]').setInputFiles(PHOTO);
      await panel.getByRole('button', { name: /^Add (it|\d+ files)$/ }).click();

      // Counted in the hanger's own line and in the strip, which is the record's
      // inventory: a filed photograph that leaves "Media 0" beside it has not
      // been filed as far as the reader is concerned.
      await expect(page.locator('.sechead')).toContainText('1 photo', { timeout: 120_000 });
      await expect(page.locator('.tabs').getByRole('link', { name: /^Media/ }))
        .toContainText('1');
      await expect(page.locator('.droptile')).toHaveCount(0);

      // The bytes come back and the browser decodes them. Polled, because an
      // <img> is in the DOM before it has finished loading.
      const img = page.locator('main img').first();
      await img.waitFor({ state: 'visible', timeout: 30_000 });
      await expect.poll(
        async () => img.evaluate((el) => (el as HTMLImageElement).naturalWidth),
        { timeout: 30_000, message: 'the filed photograph never decoded' },
      ).toBe(64);
    } finally {
      await sweep(request, id);
    }
  });
});
