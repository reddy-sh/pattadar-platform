/**
 * Parcel 360 — hero banner (photo or gradient fallback) ABOVE the tabs, all
 * 6 tabs switch, Boundary & map renders Leaflet + draw-arm buttons, Files
 * tab has the dropzone + Upload and shows the storage-offline alert at most
 * ONCE, and Edit details opens populated (not saved).
 */
import { expect, gql, openApp, test, uxCheck } from '../helpers/fixtures';

const STORAGE_OFFLINE_MSG =
  'File storage runs on the cloud gateway — uploads work on pattadar.com; local preview shows metadata only';

interface ParcelData {
  parcels: {
    id: string;
    surveyNo: string;
    subdivision: string | null;
    status: string | null;
    purchasePrice: number | null;
    geoPoint: string | null;
  }[];
}

async function firstParcel(request: Parameters<typeof gql>[0]) {
  const d = await gql<ParcelData>(
    request,
    'query { parcels { id surveyNo subdivision status purchasePrice geoPoint } }',
  );
  return d.parcels[0];
}

test('hero banner sits above the tabs; all 6 tabs switch', async ({ page, request }) => {
  const p = await firstParcel(request);
  test.skip(!p, 'no parcels in the dataset');
  await openApp(page, `/app/parcels/${p.id}`);

  // Hero (photo cover or emerald gradient fallback) …
  const hero = page.getByRole('button', { name: /Open gallery|Add photos from the Files tab/ });
  await expect(hero).toBeVisible();
  // … rendered ABOVE the tab strip.
  const heroAboveTabs = await page.evaluate(() => {
    const heroEl = document.querySelector('[aria-label="Open gallery"], [aria-label="Add photos from the Files tab"]');
    const tabs = document.querySelector('[role="tablist"]');
    if (!heroEl || !tabs) return false;
    return Boolean(heroEl.compareDocumentPosition(tabs) & Node.DOCUMENT_POSITION_FOLLOWING);
  });
  expect(heroAboveTabs, 'hero banner must precede the tab strip').toBe(true);

  const tabs = ['Overview', 'Boundary & map', /^Files \(\d+\)$/, 'Ownership history', 'Notes', 'Audit log'] as const;
  await expect(page.getByRole('tab')).toHaveCount(6);
  for (const name of tabs) {
    const tab = page.getByRole('tab', { name: name as string | RegExp });
    await tab.click();
    await expect.soft(tab, `tab ${String(name)} selects`).toHaveAttribute('aria-selected', 'true');
  }
  await page.getByRole('tab', { name: 'Overview' }).click();
  await expect(page.getByText(/Survey number/)).toBeVisible(); // renders as "Survey number:"
  await uxCheck(page, 'parcel-detail:overview');
});

test('Boundary & map: Leaflet map renders with draw-arm buttons', async ({ page, request }) => {
  const p = await firstParcel(request);
  test.skip(!p, 'no parcels in the dataset');
  await openApp(page, `/app/parcels/${p.id}`);

  await page.getByRole('tab', { name: 'Boundary & map' }).click();
  await expect(page.locator('.leaflet-container')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole('button', { name: /Draw boundary|Edit boundary/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /Drop pin|Move pin/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /Use my location/ })).toBeVisible();
  await uxCheck(page, 'parcel-detail:map');
});

test('Files tab: dropzone + Upload, storage-offline alert at most once', async ({ page, request }) => {
  const p = await firstParcel(request);
  test.skip(!p, 'no parcels in the dataset');
  await openApp(page, `/app/parcels/${p.id}`);

  await page.getByRole('tab', { name: /^Files \(\d+\)$/ }).click();
  await expect(page.getByText('Drop files here, or click to upload')).toBeVisible();
  await expect(page.getByRole('button', { name: /Upload/ }).first()).toBeVisible();

  // The designed local degradation: ONE dismissible info alert — never N toasts.
  await page.waitForTimeout(2_000); // let all file/list fetches settle
  const alerts = await page.getByText(STORAGE_OFFLINE_MSG).count();
  expect(alerts, 'storage-offline alert must appear at most ONCE').toBeLessThanOrEqual(1);
  await uxCheck(page, 'parcel-detail:files');
});

test('Edit details opens populated (and is not saved)', async ({ page, request }) => {
  const p = await firstParcel(request);
  test.skip(!p, 'no parcels in the dataset');
  await openApp(page, `/app/parcels/${p.id}`);

  await page.getByRole('button', { name: 'Edit details' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByText(new RegExp(`Edit parcel details · Survey ${p.surveyNo}`))).toBeVisible();

  // Populated fields mirror the record.
  await expect(dialog.getByLabel('Label / nickname')).toBeVisible();
  const statusBox = dialog.getByLabel('Status', { exact: true });
  await expect.soft(statusBox, 'Status pre-selected').toContainText(new RegExp(p.status || 'owned', 'i'));
  if (p.purchasePrice && p.purchasePrice > 0)
    await expect
      .soft(dialog.getByLabel('Purchase price / invested (₹)'), 'purchase price populated')
      .toHaveValue(String(p.purchasePrice));
  await uxCheck(page, 'parcel-detail:edit-dialog');

  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
});
