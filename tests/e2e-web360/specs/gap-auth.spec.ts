/**
 * The two public doors — the ones a stranger reaches with a link and no account.
 *
 * Everything else in this suite signs in first: every goto() in the other nine
 * specs is /app/*, or the /share//work smoke that capabilities.spec.ts stubs
 * one single way. So two surfaces that customers actually land on have never
 * been exercised here:
 *
 *   · /verify/:token and /active/:token — the link the API emails an invited
 *     co-owner ("Please confirm your details here: …", services/api/src/main.py
 *     :3662). The gateway carves out ONE unauthenticated GraphQL operation for
 *     this page (services/gateway/app/public_graphql.py:55), the mobile app and
 *     web-next both fire it — and the shipping SPA renders a developer
 *     placeholder that calls nothing. Those tests are test.fail(): they assert
 *     what the invitee is owed, so they go green the day the page is wired.
 *
 *   · /share/:token's "not a PDF, not an image" guard (RecipientAccess.tsx:50).
 *     capabilities.spec.ts only ever serves that file route as image/png — the
 *     preview branch — so the branch that REFUSES to render arbitrary bytes
 *     with the app's own origin has never once executed. That one is not a bug,
 *     only untested, so it is an ordinary passing test.
 *
 * Nothing here writes a row: every response is a page.route fixture and the
 * verify page is inert. There is therefore no MADE/sweepMade registry to keep —
 * but if a test here ever files something, it is deleted in afterEach, never as
 * the last line of the body, for the reason crud-360.spec.ts:30 spells out.
 */
import { expect, test } from './harness';

type Pg = import('@playwright/test').Page;

/** A plausible invite token. Any string renders the same page today — which is
 *  itself part of the finding — and no seed script creates an invitation row,
 *  so the value is arbitrary and the mutation is answered by a fixture. */
const INVITE = '6f1b0a2c-4d3e-4f50-9a11-2b7c8d9e0f12';

/**
 * Watch for the one mutation the gateway opens an anonymous door for, and
 * answer it, so a page that DOES fire it gets a usable reply instead of the
 * dead :15182 proxy. The returned array is the evidence: empty means the page
 * never asked, which is the defect below.
 */
async function watchVerify(page: Pg, answer: { id: string; status: string } | null): Promise<string[]> {
  const calls: string[] = [];
  await page.route('**/graphql', (route) => {
    const body = route.request().postData() ?? '';
    if (!body.includes('verifyBeneficiary')) return route.continue();
    calls.push(body);
    return route.fulfill({ json: { data: { verifyBeneficiary: answer } } });
  });
  return calls;
}

test.describe('the emailed verification link', () => {
  // routes.tsx:245-246 mount the SAME component on both paths, with no
  // distinguishing prop, so both are asserted rather than one standing in for
  // the other: a fix applied to one and not the other would pass otherwise.
  for (const prefix of ['/verify', '/active']) {
    test(`an invited beneficiary confirms their membership from the emailed ${prefix} link, without signing in`, async ({ page }) => {
      // DEFECT: apps/web/src/pages/VerifyPage.tsx:13 renders two lines of static
      // copy — no button, no form, no fetch, no useEffect. The invitation stays
      // pending forever. apps/web-next/src/views/VerifyPage.tsx:40 and
      // apps/mobile/src/data/hooks.ts:677 both fire the mutation properly.
      test.fail();
      const calls = await watchVerify(page, { id: 'w360-invite-e2e', status: 'verified' });

      await page.goto(`${prefix}/${INVITE}`);
      await expect(page.getByRole('heading', { name: 'Verify membership' })).toBeVisible();

      // Either shape of a working page is accepted. web-next and the mobile app
      // confirm on mount; a page that asks for a deliberate tap first would be
      // just as correct. What is not correct is never asking at all.
      const confirm = page.getByRole('button', { name: /confirm|verify/i });
      if (await confirm.count()) await confirm.first().click();

      await expect
        .poll(() => calls.length, { message: 'verifyBeneficiary — the gateway\'s only anonymous operation — was never fired' })
        .toBeGreaterThan(0);
      // The token has to travel from the URL into the mutation; a call that
      // omits it verifies nobody.
      expect(calls[0]).toContain(INVITE);

      await expect(page.getByText(/\b(verified|confirmed)\b/i).first()).toBeVisible();
    });
  }

  test('a verification token that is not a live invitation says so, instead of the page a good one gets', async ({ page }) => {
    // DEFECT: VerifyPage.tsx never looks the token up, so a bogus link renders
    // byte-identical to a real one. docs/plans/2026-07-26-web-nextjs-minimals-
    // migration.md:351 names the expected behaviour: "open /verify/BOGUS
    // logged-out -> graceful invalid-token card".
    test.fail();
    await watchVerify(page, null); // the API's answer for a spent or unknown token

    await page.goto('/verify/not-a-real-token');
    await expect(page.getByRole('heading', { name: 'Verify membership' })).toBeVisible();
    await expect(page.getByText(/invalid|not valid|isn.t valid|expired|already been used/i).first()).toBeVisible();
  });

  test('the verification page speaks to the invitee, not to the developer who stubbed it', async ({ page }) => {
    // DEFECT: VerifyPage.tsx:14-17 ships an internal build note — "rebuilt from
    // rhub VerifyView / verifyBeneficiary mutation" — and prints the raw invite
    // token in the body copy, to a customer who followed an email link.
    test.fail();
    await watchVerify(page, { id: 'w360-invite-e2e', status: 'verified' });

    await page.goto(`/verify/${INVITE}`);
    await expect(page.getByRole('heading', { name: 'Verify membership' })).toBeVisible();
    await expect(page.getByText('Token-based beneficiary verification landing')).toHaveCount(0);
    await expect(page.getByText('rebuilt from')).toHaveCount(0);
    await expect(page.getByText(INVITE)).toHaveCount(0);
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

      // Registered BEFORE the click: downloadBlob (pages/documents/storage.ts
      // :141) creates an anchor and clicks it synchronously inside the same
      // handler, so a waiter attached afterwards can miss the event entirely.
      const download = page.waitForEvent('download');
      await page.getByRole('button', { name: 'Open', exact: true }).click();
      // downloadBlob is called with item.title verbatim, so the file lands under
      // the name the owner gave it and not the storage key. Chromium then
      // appends the extension its own sniffing implies — 'Selected deed.svg' —
      // so the assertion is on the STEM. Pinning the whole string made this
      // test fail on the browser's behaviour rather than the app's.
      expect((await download).suggestedFilename()).toMatch(/^Selected deed/);

      // The preview card must never mount for these types. An <img> cannot run
      // an SVG's script, but the PDF branch renders an <iframe sandbox=
      // "allow-same-origin"> pointed at a blob: URL — arbitrary HTML there
      // executes as pattadar.com and can read everything this origin stores.
      await expect(page.getByRole('button', { name: 'Close preview' })).toHaveCount(0);
      await expect(page.getByRole('img', { name: 'Selected deed' })).toHaveCount(0);
      await expect(page.locator('iframe')).toHaveCount(0);
      expect(await scriptRan(page)).toBe(false);

      // Downloading is the success path, not the failure path: no alert, and
      // the button comes back so a second file can be opened.
      await expect(page.getByRole('alert')).toHaveCount(0);
      await expect(page.getByRole('button', { name: 'Open', exact: true })).toBeEnabled();
    });
  }

  test('a shared PDF still previews in place, so the guard is refusing types rather than refusing everything', async ({ page }) => {
    // The control for the two tests above. Without it, a regression that sent
    // EVERY file down the download path — the easiest way to "fix" a preview
    // bug — would pass them both and quietly end previewing.
    await openShare(page, 'application/pdf', '%PDF-1.7 e2e sample');
    await page.getByRole('button', { name: 'Open', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Close preview' })).toBeVisible();
    await expect(page.locator('iframe')).toHaveCount(1);
    await expect(page.getByRole('img', { name: 'Selected deed' })).toHaveCount(0);
  });
});
