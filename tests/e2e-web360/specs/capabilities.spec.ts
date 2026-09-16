import { test, expect } from '@playwright/test';

const TOKEN = 'a'.repeat(43);
const ROOT = '/api/gateway/capabilities';
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
const selected = {
  title: 'Selected land papers', scope: 'shares', expiresOn: '12/10/2026',
  items: [{ id: 'doc-selected', title: 'Selected deed', kind: 'document', available: true }],
  boundary: { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [[[82,17],[82.01,17],[82.01,17.01],[82,17]]] } },
};

test('recipient opens only selected files without signing in', async ({ page }) => {
  await page.route(`**${ROOT}/shares/${TOKEN}`, (route) => route.fulfill({ json: selected }));
  await page.route(`**${ROOT}/shares/${TOKEN}/files/doc-selected`, (route) => route.fulfill({ contentType: 'image/png', body: PNG }));
  await page.goto(`/share/${TOKEN}`);
  await expect(page.getByRole('heading', { name: 'Selected land papers' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Download', exact: true })).toHaveCount(1);
  await expect(page.getByRole('link', { name: 'Download', exact: true })).toHaveAttribute('href', `${ROOT}/shares/${TOKEN}/files/doc-selected`);
  await page.getByRole('button', { name: 'Open', exact: true }).click();
  await expect(page.getByRole('img', { name: 'Selected deed' })).toBeVisible();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download boundary GeoJSON' }).click();
  expect((await download).suggestedFilename()).toBe('shared-boundary.geojson');
});

test('expired or revoked access never renders the old documents', async ({ page }) => {
  await page.route(`**${ROOT}/shares/${TOKEN}`, (route) => route.fulfill({ status: 410, json: { detail: 'This link has expired or was revoked' } }));
  await page.goto(`/share/${TOKEN}`);
  await expect(page.getByRole('alert')).toContainText('expired or was revoked');
  await expect(page.getByRole('link', { name: 'Download', exact: true })).toHaveCount(0);
});

test('worker accepts, starts and submits a file for owner review', async ({ page }) => {
  let status = 'sent';
  let submitted = false;
  await page.route(`**${ROOT}/work/${TOKEN}`, (route) => route.fulfill({ json: {
    ...selected, scope: 'work', status,
    statusLabel: status === 'submitted' ? 'Waiting on you' : status,
    actions: status === 'sent' ? ['assign'] : status === 'assigned' ? ['start', 'deliver'] : status === 'on_site' ? ['deliver'] : [],
    note: 'Survey the north edge', deliverables: submitted ? [{ id: 'submitted', label: 'Survey completed', note: '', review: 'pending', review_note: '' }] : [],
  } }));
  await page.route(`**${ROOT}/work/${TOKEN}/actions`, async (route) => {
    const { action } = route.request().postDataJSON();
    expect(['assign', 'start']).toContain(action);
    status = action === 'assign' ? 'assigned' : 'on_site';
    await route.fulfill({ json: { ok: true } });
  });
  await page.route(`**${ROOT}/work/${TOKEN}/deliverables`, async (route) => {
    expect(route.request().headers()['content-type']).toContain('multipart/form-data');
    expect(route.request().postData()).toContain('Survey completed');
    expect(route.request().postData()).toContain('survey.pdf');
    submitted = true; status = 'submitted';
    await route.fulfill({ json: { ok: true, id: 'submitted' } });
  });
  await page.goto(`/work/${TOKEN}`);
  await page.getByRole('button', { name: 'Accept this job' }).click();
  await page.getByRole('button', { name: 'Mark work started' }).click();
  await page.getByLabel('Title', { exact: true }).fill('Survey completed');
  await page.getByLabel('File (optional)').setInputFiles({ name: 'survey.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.7 sample') });
  await page.getByRole('button', { name: 'Send to owner' }).click();
  await expect(page.getByRole('status')).toContainText('owner can review');
  await expect(page.getByRole('heading', { name: 'Survey completed · pending' })).toBeVisible();
});

test('failed worker submission keeps the file and entered title for retry', async ({ page }) => {
  await page.route(`**${ROOT}/work/${TOKEN}`, (route) => route.fulfill({ json: { ...selected, scope: 'work', status: 'assigned', statusLabel: 'Assigned', actions: ['deliver'] } }));
  await page.route(`**${ROOT}/work/${TOKEN}/deliverables`, (route) => route.fulfill({ status: 503, json: { detail: 'Storage is temporarily unavailable' } }));
  await page.goto(`/work/${TOKEN}`);
  await page.getByLabel('Title', { exact: true }).fill('Keep this draft');
  await page.getByRole('button', { name: 'Send to owner' }).click();
  await expect(page.getByRole('alert')).toContainText('Storage is temporarily unavailable');
  await expect(page.getByLabel('Title', { exact: true })).toHaveValue('Keep this draft');
  await expect(page.getByRole('button', { name: 'Send to owner' })).toBeEnabled();
});
