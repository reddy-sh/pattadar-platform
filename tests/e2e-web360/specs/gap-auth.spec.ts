/**
 * Public capability pages and hostile shared-file preview cases.
 *
 * Every request on the capability pages is intercepted below. No test contacts
 * a live identity, API, provider, or owner database. Both capability pages must
 * require a deliberate click so an email-link scanner cannot consume a token.
 */
import { expect, test } from './harness';

type Pg = import('@playwright/test').Page;

const CAPABILITY = '6f1b0a2c-4d3e-4f50-9a11-2b7c8d9e0f12';

async function watchMutation(
  page: Pg,
  operation: 'verifyBeneficiary' | 'acknowledgeInactivity',
  answer: unknown,
): Promise<string[]> {
  const calls: string[] = [];
  await page.route('**/graphql', (route) => {
    const body = route.request().postData() ?? '';
    if (!body.includes(operation)) return route.continue();
    calls.push(body);
    return route.fulfill({ json: { data: { [operation]: answer } } });
  });
  return calls;
}

test.describe('public family capability links', () => {
  test('membership verification is deliberate and can record safeguard-email consent', async ({ page }) => {
    const calls = await watchMutation(page, 'verifyBeneficiary', { id: 'w360-invite-e2e' });
    await page.goto(`/verify/${CAPABILITY}`);
    await expect(page.getByRole('heading', { name: 'Verify membership' })).toBeVisible();
    await expect(page.getByText(CAPABILITY)).toHaveCount(0);
    await expect.poll(() => calls.length).toBe(0);

    await page.getByRole('checkbox', { name: /receive household inactivity safeguard emails/i }).check();
    await page.getByRole('button', { name: 'Verify membership' }).click();
    await expect.poll(() => calls.length).toBe(1);
    expect(calls[0]).toContain(CAPABILITY);
    expect(calls[0]).toContain('"consent":true');
    await expect(page.getByText('Your membership details are verified.')).toBeVisible();
  });

  test('an invalid membership capability says so', async ({ page }) => {
    await watchMutation(page, 'verifyBeneficiary', null);
    await page.goto('/verify/not-a-real-token');
    await page.getByRole('button', { name: 'Verify membership' }).click();
    await expect(page.getByText(/invalid, expired, or has already been used/i)).toBeVisible();
  });

  test('safeguard acknowledgement is deliberate and role-neutral', async ({ page }) => {
    const calls = await watchMutation(page, 'acknowledgeInactivity', true);
    await page.goto(`/active/${CAPABILITY}`);
    await expect(page.getByRole('heading', { name: 'Confirm this safeguard message' })).toBeVisible();
    await expect(page.getByText(CAPABILITY)).toHaveCount(0);
    await expect.poll(() => calls.length).toBe(0);

    await page.getByRole('button', { name: 'Confirm this message' }).click();
    await expect.poll(() => calls.length).toBe(1);
    expect(calls[0]).toContain(CAPABILITY);
    await expect(page.getByText('Thank you. This reminder sequence is now closed.')).toBeVisible();
  });

  test('a safeguard recipient can withdraw future safeguard email only', async ({ page }) => {
    const calls = await watchMutation(page, 'acknowledgeInactivity', true);
    await page.goto(`/active/${CAPABILITY}`);
    await page.getByRole('button', { name: 'Stop future safeguard email' }).click();
    await expect.poll(() => calls.length).toBe(1);
    expect(calls[0]).toContain('"withdraw":true');
    await expect(page.getByText(/future safeguard email to you is turned off/i)).toBeVisible();
  });

  test('an invalid safeguard capability says so', async ({ page }) => {
    await watchMutation(page, 'acknowledgeInactivity', false);
    await page.goto('/active/not-a-real-token');
    await page.getByRole('button', { name: 'Confirm this message' }).click();
    await expect(page.getByText(/invalid, expired, or has already been used/i)).toBeVisible();
  });
});

test.describe('a shared file the app must not render', () => {
  const TOKEN = 'a'.repeat(43);
  const ROOT = '/api/gateway/capabilities';
  /** The same fixture shape capabilities.spec.ts uses, minus the boundary: this
   *  is about one file and the button that opens it. */
  const share = {
    title: 'Selected land papers', scope: 'shares', expiresOn: '12/10/2026',
    items: [{ id: 'doc-selected', title: 'Selected deed', kind: 'document', available: true }],
    boundary: null,
  };

  /** Serve the share, and its one file as whatever bytes the test is about. */
  async function openShare(page: Pg, contentType: string, body: string | Buffer): Promise<void> {
    await page.route(`**${ROOT}/shares/${TOKEN}`, (route) => route.fulfill({ json: share }));
    await page.route(`**${ROOT}/shares/${TOKEN}/files/doc-selected`, (route) => route.fulfill({ contentType, body }));
    await page.goto(`/share/${TOKEN}`);
    await expect(page.getByRole('heading', { name: 'Selected land papers' })).toBeVisible();
  }

  /** A marker the file sets if the browser ever executes it. Both bodies set
   *  the same global so one assertion covers both. */
  const scriptRan = (page: Pg) =>
    page.evaluate(() => Boolean((window as Window & { __sharedFileScriptRan?: boolean }).__sharedFileScriptRan));

  const FOREIGN = [
    {
      what: 'SVG',
      contentType: 'image/svg+xml',
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8">'
        + '<script>window.__sharedFileScriptRan = true;</script><rect width="8" height="8"/></svg>',
    },
    {
      what: 'HTML page',
      contentType: 'text/html',
      body: '<!doctype html><title>x</title><script>window.__sharedFileScriptRan = true;</script>',
    },
  ];

  for (const { what, contentType, body } of FOREIGN) {
    test(`a shared ${what} is handed to the recipient as a download, never rendered inside the app's origin`, async ({ page }) => {
      await openShare(page, contentType, body);

      // Registered BEFORE the click: downloadBlob creates an anchor and clicks
      // synchronously, so a waiter attached afterwards can miss the event.
      const download = page.waitForEvent('download');
      await page.getByRole('button', { name: 'Open', exact: true }).click();
      expect((await download).suggestedFilename()).toMatch(/^Selected deed/);

      await expect(page.getByRole('button', { name: 'Close preview' })).toHaveCount(0);
      await expect(page.getByRole('img', { name: 'Selected deed' })).toHaveCount(0);
      await expect(page.locator('iframe')).toHaveCount(0);
      expect(await scriptRan(page)).toBe(false);
      await expect(page.getByRole('alert')).toHaveCount(0);
      await expect(page.getByRole('button', { name: 'Open', exact: true })).toBeEnabled();
    });
  }

  test('a shared PDF still previews in place, so the guard is refusing types rather than refusing everything', async ({ page }) => {
    await openShare(page, 'application/pdf', '%PDF-1.7 e2e sample');
    await page.getByRole('button', { name: 'Open', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Close preview' })).toBeVisible();
    await expect(page.locator('iframe')).toHaveCount(1);
    await expect(page.getByRole('img', { name: 'Selected deed' })).toHaveCount(0);
  });
});
