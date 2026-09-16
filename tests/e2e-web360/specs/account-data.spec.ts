import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';

const ACCOUNT = '/api/gateway/account';

test.beforeEach(async ({ page }) => {
  // Fully mocked capability/account suite never contacts a local gateway.
  await page.route('**/api/**', (route) => route.fulfill({ status: 503, json: { detail: 'Unmocked test request' } }));
  await page.route('**/api/gateway/pattadar/graphql', (route) => route.fulfill({ json: { data: { web: {
    portfolio: { displayName: 'Test owner', waiting: [] }, orders: [], search: [],
  } } } }));
  await page.route(`**${ACCOUNT}/consent`, (route) => route.fulfill({ json: { version: '2026-09-12', purposes: ['document_processing', 'ai_extraction'] } }));
  await page.route(`**${ACCOUNT}/erasure`, (route) => route.fulfill({ json: { request: null } }));
});

test('account choices save only the purposes the owner selects and persist on reload', async ({ page }) => {
  let purposes = ['document_processing', 'ai_extraction'];
  await page.route(`**${ACCOUNT}/consent`, async (route) => {
    if (route.request().method() === 'POST') {
      const body = route.request().postDataJSON();
      expect(body.version).toBe('2026-09-12');
      purposes = body.purposes;
      expect(purposes).toEqual(['document_processing', 'service_notifications']);
    }
    await route.fulfill({ json: { version: '2026-09-12', purposes } });
  });
  await page.goto('/app/account?welcome=1');
  await expect(page.getByRole('heading', { name: 'Your account and data' })).toBeVisible();
  await page.getByRole('checkbox', { name: 'Use AI providers' }).uncheck();
  await page.getByRole('checkbox', { name: 'Send messages about' }).check();
  await page.getByRole('button', { name: 'Save choices' }).click();
  await expect(page.getByRole('status')).toHaveText('Your choices have been recorded.');
  await page.reload();
  await expect(page.getByRole('checkbox', { name: 'Use AI providers' })).not.toBeChecked();
  await expect(page.getByRole('checkbox', { name: 'Send messages about' })).toBeChecked();
});

test('account export downloads the returned data and file manifest', async ({ page }) => {
  const exported = { records: [{ title: 'Selected record' }], files: [{ id: 'file-1', filename: 'deed.pdf' }] };
  await page.route(`**${ACCOUNT}/export`, (route) => route.fulfill({ json: exported }));
  await page.goto('/app/account');
  const received = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download my data' }).click();
  const download = await received;
  expect(download.suggestedFilename()).toMatch(/^pattadar-export-\d{4}-\d{2}-\d{2}\.json$/);
  expect(JSON.parse(await readFile((await download.path())!, 'utf8'))).toEqual(exported);
  await expect(page.getByRole('status')).toHaveText('Your export has been downloaded.');
});

test('deletion requires confirmation and shows staged progress without claiming completion', async ({ page }) => {
  let receipt: null | {id:string;status:string;createdAt:string;stages:{name:string;status:string}[]} = null;
  await page.route(`**${ACCOUNT}/erasure`, async (route) => {
    if (route.request().method() === 'POST') {
      expect(route.request().postDataJSON()).toEqual({ confirmation: 'DELETE MY ACCOUNT' });
      receipt = { id: 'erasure-test', status: 'pending', createdAt: new Date().toISOString(), stages: [{ name: 'records', status: 'pending' }, { name: 'files', status: 'pending' }] };
      return route.fulfill({ json: receipt });
    }
    await route.fulfill({ json: { request: receipt } });
  });
  await page.goto('/app/account');
  const request = page.getByRole('button', { name: 'Request account deletion' });
  await expect(request).toBeDisabled();
  await page.getByLabel('Type DELETE MY ACCOUNT to request deletion').fill('DELETE MY ACCOUNT');
  await request.click();
  await expect(page.getByRole('status').filter({ hasText: 'not been deleted yet' })).toBeVisible();
  await expect(page.getByText('files: pending')).toBeVisible();
  receipt = { ...receipt!, status: 'processing', stages: [{ name: 'records', status: 'complete' }, { name: 'files', status: 'failed' }] };
  await page.getByRole('button', { name: 'Refresh status' }).click();
  await expect(page.getByText('records: complete')).toBeVisible();
  await expect(page.getByText('files: failed')).toBeVisible();
  await expect(page.getByRole('status')).toContainText('processing');
});

test('fresh sign-in failure keeps the deletion confirmation available for retry', async ({ page }) => {
  await page.route(`**${ACCOUNT}/erasure`, (route) => route.request().method() === 'POST'
    ? route.fulfill({ status: 401, json: { detail: 'Recent sign-in required' } })
    : route.fulfill({ json: { request: null } }));
  await page.goto('/app/account');
  await page.getByLabel('Type DELETE MY ACCOUNT to request deletion').fill('DELETE MY ACCOUNT');
  await page.getByRole('button', { name: 'Request account deletion' }).click();
  await expect(page.getByRole('alert')).toContainText('Sign out and sign in again');
  await expect(page.getByLabel('Type DELETE MY ACCOUNT to request deletion')).toHaveValue('DELETE MY ACCOUNT');
  await expect(page.getByRole('button', { name: 'Request account deletion' })).toBeEnabled();
});
