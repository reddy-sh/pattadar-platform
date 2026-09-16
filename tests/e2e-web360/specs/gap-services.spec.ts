/**
 * Ordering work, tickets and money — the three surfaces where a wrong answer
 * costs a document, a rupee, or a decision nobody makes.
 *
 * Each of these had no test at all, for a different reason:
 *
 *   · RequestWork's "Something else" card. crud-360.spec.ts:975-1042 raises a
 *     request and checks its message, its tick boxes and its manifest — but it
 *     never attaches a file and never fails an upload. The interesting path is
 *     the half-failed one: the first file is already filed as a paper on the
 *     record when the second upload dies, and the recovery that was written for
 *     exactly that (`stop()`, RequestWork.tsx:150) is unreachable, because
 *     uploadToDrive THROWS rather than resolving falsy (pages/documents/
 *     storage.ts:50). Those two tests are test.fail().
 *
 *   · /app/tickets/:id/pay. With PAYMENTS_MODE off the ticket page renders no
 *     link to it (Ticket.tsx:1026 gates on paymentConfig.enabled), so the screen
 *     is reachable only by URL — which is precisely why nothing had ever
 *     rendered it, and why a regression there would be invisible. It still
 *     draws a `Pay ₹1,180.00` button, held off by one condition
 *     (PaymentsCheckout.tsx:144). This one is honest today, so it passes.
 *
 *   · /app/assigned. screens.spec.ts:2282 walks the href and asserts only that
 *     `main` and a heading render. The rail's badge (Shell.tsx:179) and the
 *     list (Orders.tsx:368) are two copies of one rule — `needsYou ||
 *     pendingReview > 0` — with nothing pinning them together, and this page's
 *     own header records the regression where it ran Services' query and listed
 *     Placed jobs nobody was waiting on.
 *
 * CLEANUP. The request tests file papers on the seeded parcel, and
 * screens.spec.ts asserts that parcel's totals. Every paper is swept in
 * `test.afterEach` by title, never at the end of the body: Playwright abandons
 * a test at its first failed assertion, and these tests are EXPECTED to fail,
 * so a trailing delete would be skipped every single run. See crud-360.spec.ts
 * :30 for the sixteen-red-tests story behind that rule.
 *
 * The payments and /app/assigned tests write nothing at all.
 */
import { randomUUID } from 'node:crypto';

import { expect, test } from './harness';

type Pg = import('@playwright/test').Page;
type Req = import('@playwright/test').APIRequestContext;

/** The hand-seeded Sy 214/2 — the same parcel crud-360.spec.ts:18 and
 *  tickets.spec.ts:61 work against. */
const PARCEL = 'w360-p-214-2';

const T2094 = 'w360-PT-2094';   // submitted, four deliverables waiting on a decision
const T2101 = 'w360-PT-2101';   // placed, unfunded, quoted ₹1,180

const gql = (request: Req, query: string) =>
  request.post('/api/gateway/pattadar/graphql', { data: { query } }).then((r) => r.json());

/** The two scratch files the request tests attach. The second one's upload is
 *  always refused, which is the whole experiment. */
const GOOD = 'e2e-first.pdf';
const DEAD = 'e2e-second.pdf';

const papersOn = async (request: Req): Promise<{ id: string; title: string }[]> => {
  const res = await gql(request, `{ web { papers(recordId:"${PARCEL}"){ id title } } }`);
  return (res?.data?.web?.papers ?? []) as { id: string; title: string }[];
};

/** Delete every paper either request test filed, however far the test got.
 *  Swept by TITLE rather than by a registry of ids, because the ids are minted
 *  server-side inside a flow that may die before the test ever learns them —
 *  and the duplicate this documents is a second row nobody was handed. */
async function sweepPapers(request: Req): Promise<void> {
  try {
    const scratch = (await papersOn(request)).filter((p) => p.title === GOOD || p.title === DEAD);
    for (const p of scratch) {
      await gql(request, `mutation { web { deletePaper(paperId:"${p.id}") } }`);
    }
  } catch {
    // A failing sweep must not turn a passing test red nor mask a real failure.
  }
}

/**
 * Storage that works for one file and refuses the other, BY NAME.
 *
 * Failing "the second POST" by counting would make the retry path depend on
 * how many uploads a press happens to attempt, and the retry is the point:
 * whichever way the app behaves on the second press, `e2e-second.pdf` is
 * refused again, so no request is ever raised and this spec cannot leak an
 * order onto a parcel whose ticket counts tickets.spec.ts asserts.
 */
async function storageThatDropsOneFile(page: Pg): Promise<void> {
  await page.route('**/api/gateway/storage/**', async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    if (!(url.pathname.endsWith('/files') && req.method() === 'POST')) {
      return route.fulfill({ status: 404, json: { error: 'Fixture: only uploads are served here' } });
    }
    // Same multipart decode crud-360.spec.ts:341 uses — the bytes really do
    // leave the browser, so this fails at the server rather than short of it.
    const form = await new Request('http://fixture.invalid/upload', {
      method: 'POST', headers: req.headers(), body: req.postDataBuffer()!,
    }).formData();
    const file = form.get('file') as File;
    if (file?.name === DEAD) {
      return route.fulfill({ status: 500, json: { error: 'Storage is offline' } });
    }
    return route.fulfill({
      json: { id: randomUUID(), name: file.name, mimeType: file.type || 'application/pdf', sizeBytes: file.size },
    });
  });
}

/** Distinctive enough to find in an order's detail or params if one is ever
 *  raised — which, on this path, none must be. */
const MARKER = 'E2E half-failed upload';

/** Open the survey request screen with both files queued and a message typed,
 *  ready for a press of Create request. */
async function queueBothFiles(page: Pg): Promise<void> {
  await storageThatDropsOneFile(page);
  await page.goto(`/app/records/${PARCEL}/request?kind=survey`);
  await expect(page.getByRole('heading', { name: 'Something else' })).toBeVisible();

  await page.locator('input[type=file][aria-label="Add a file to this request"]').setInputFiles([
    { name: GOOD, mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.7 e2e first') },
    { name: DEAD, mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.7 e2e second') },
  ]);
  await expect(page.getByText(new RegExp(`${GOOD}.*${DEAD}`))).toBeVisible();

  await page.getByLabel('Message', { exact: true }).fill(MARKER);
  await expect(page.getByRole('button', { name: 'Create request' })).toBeEnabled();
}

/** Press Create request and wait for the attempt to finish, rather than for a
 *  particular sentence: the message under test is the thing that is wrong, so
 *  waiting on it would hide the defect behind a timeout. */
async function raiseAndSettle(page: Pg, request: Req, expectedFiled: number): Promise<void> {
  await page.getByRole('button', { name: 'Create request' }).click();
  await expect
    .poll(async () => (await papersOn(request)).filter((p) => p.title === GOOD).length,
      { message: `${GOOD} should have been filed ${expectedFiled}x by now`, timeout: 20_000 })
    .toBe(expectedFiled);
  // The button comes back out of "Raising…" once the flow has unwound.
  await expect(page.getByRole('button', { name: 'Create request' })).toBeVisible();
}

test.describe('raising a request whose upload dies half way', () => {
  test.afterEach(async ({ request }) => { await sweepPapers(request); });

  test('when the second file fails to upload, the owner is told no request was raised', async ({ page, request }) => {
    // DEFECT: apps/web/src/w360/pages/RequestWork.tsx:168 — `if (!node)
    // { stop(STORAGE_OFFLINE_MSG); return; }` is dead code, because
    // uploadToDrive (apps/web/src/pages/documents/storage.ts:50) always throws
    // and never resolves falsy. Control lands in the outer catch at
    // RequestWork.tsx:204-206, which does nothing but setSent(error.message),
    // so the owner reads a raw storage error ("The upload service could not
    // save this file (HTTP 500)") and is left to guess whether a surveyor is
    // now on their way. Every other refusal on this screen says it plainly —
    // the oversize branch at :161 ends "and no request was raised."
    test.fail();
    await queueBothFiles(page);
    await raiseAndSettle(page, request, 1);

    await expect(page.getByText(/no request was raised|was not raised/i).first()).toBeVisible();
    // And the claim has to be true, not just reassuring.
    const orders = await gql(request, `{ web { orders(recordId:"${PARCEL}"){ id detail params } } }`);
    const raised = (orders?.data?.web?.orders ?? []) as { detail: string; params: string }[];
    expect(raised.filter((o) => `${o.detail} ${o.params}`.includes(MARKER))).toHaveLength(0);
  });

  test('a file that was already filed stops being queued, so pressing again cannot file it twice', async ({ page, request }) => {
    // DEFECT: the same unreachable `stop()` (RequestWork.tsx:150) is the ONLY
    // caller of setExtra(left) and the only place filedIds is merged into
    // pickedPapers. A storage failure throws past it, so `e2e-first.pdf` —
    // already uploaded, already filed as a paper by addPaper at :170 — stays
    // listed under "Something else" while also appearing in the Papers card.
    // Press Create request again and the loop restarts at index 0: the same
    // bytes upload again and services/api/src/web360.py:4601 add_paper INSERTs
    // a fresh doc-<uuid> without a dedupe, leaving the record holding two
    // identical papers the owner never asked for twice.
    test.fail();
    await queueBothFiles(page);
    await raiseAndSettle(page, request, 1);
    // Second press: e2e-second.pdf is refused again, so nothing is raised
    // either way and the only question is what happened to e2e-first.pdf.
    await page.getByRole('button', { name: 'Create request' }).click();
    await expect(page.getByRole('button', { name: 'Create request' })).toBeVisible();

    // The record's papers are the record of truth — the screen can say what it
    // likes, this is what a surveyor would be handed.
    await expect
      .poll(async () => (await papersOn(request)).filter((p) => p.title === GOOD).length,
        { message: `${GOOD} was filed twice by one request`, timeout: 20_000 })
      .toBe(1);

    // What the screen should show: only the file that never went is still
    // queued, and the one that landed is a ticked paper instead.
    const somethingElse = page.locator('section.card').filter({ has: page.getByRole('heading', { name: 'Something else' }) });
    await expect(somethingElse.getByText(GOOD)).toHaveCount(0);
    await expect(somethingElse.getByText(DEAD)).toBeVisible();

    const papersCard = page.locator('section.card').filter({ has: page.getByRole('heading', { name: 'Papers' }) });
    await expect(papersCard.locator('label').filter({ hasText: GOOD }).locator('input[type=checkbox]')).toBeChecked();
  });
});

test.describe('the ticket checkout while payments are switched off', () => {
  test('with payments switched off the checkout takes no money and says so', async ({ page }) => {
    await page.goto(`/app/tickets/${T2101}/pay`);

    // The h1 is the ticket's own title, so a stranger's ticket id in the URL
    // could not be mistaken for this one.
    await expect(page.getByRole('heading', { name: 'Encumbrance Certificate' })).toBeVisible();
    await expect(page.getByText('Online payments are not configured. No payment has been taken here.')).toBeVisible();

    // The quoted price, not zero: an amount that collapses to ₹0.00 when the
    // provider is off would be a different and much worse lie.
    // Scoped to the paragraph: the same amount is also inside the disabled
    // button's label ("Pay ₹1,180.00"), so an unscoped text match resolves to
    // two elements and dies on strict mode before asserting anything.
    await expect(page.getByText('₹1,180.00', { exact: true })).toBeVisible();

    // The button is rendered and must stay off. It is held by a single
    // condition (PaymentsCheckout.tsx:144, `!state.enabled || busy ||
    // state.mode === 'off'`); this is the assertion that notices the day one
    // of those is dropped and a stack with no provider offers to charge.
    await expect(page.getByRole('button', { name: /^Pay ₹/ })).toBeDisabled();

    // Copy that only makes sense with a provider behind it. Promising a
    // Razorpay capture check on a stack that has no Razorpay is the honest-
    // message failure this screen is most likely to regress into.
    await expect(page.getByText('Your payment is confirmed only after the server checks capture with Razorpay.')).toHaveCount(0);
    await expect(page.getByRole('note')).toHaveCount(0);   // the "Test mode." line (:132)
    await expect(page.getByRole('alert')).toHaveCount(0);  // `problem` is unset on the happy path (:148)

    // Nothing anywhere on the page may claim money moved.
    await expect(page.getByText(/\b(paid|debited|charged)\b/i)).toHaveCount(0);
    await expect(page.getByText(/Transaction ID|UTR|RRN/i)).toHaveCount(0);

    // "Check payment status" sits outside the state guard (:149) and is the
    // only control an owner has here. Pressing it must re-read and come back
    // saying the same thing — not flip to a payment-taken story.
    await page.getByRole('button', { name: 'Check payment status' }).click();
    await expect(page.getByText('Online payments are not configured. No payment has been taken here.')).toBeVisible();
    await expect(page.getByRole('button', { name: /^Pay ₹/ })).toBeDisabled();

    // The way back, for a screen no link in the app points at.
    await expect(page.getByRole('link', { name: /Back to the ticket/ }))
      .toHaveAttribute('href', `/app/tickets/${T2101}`);
  });

  test('a checkout URL for a ticket that is not yours says so instead of quoting a price', async ({ page }) => {
    // services/api/src/payments.py:163 scopes the lookup by owner_user_id and
    // 404s otherwise, so a guessed ticket id must leak neither a title nor an
    // amount — this page is URL-reachable by anyone signed in.
    await page.goto('/app/tickets/not-a-ticket/pay');

    await expect(page.getByRole('alert')).toContainText('Ticket not found');
    await expect(page.getByText(/^₹/)).toHaveCount(0);
    await expect(page.getByRole('button', { name: /^Pay ₹/ })).toHaveCount(0);
    // The recovery control stays, because a 404 here is as often a stale tab
    // as a bad id.
    await expect(page.getByRole('button', { name: 'Check payment status' })).toBeEnabled();
  });
});

test.describe('the Waiting on you list behind the rail badge', () => {
  test('Waiting on you lists only what needs a decision, and the rail badge agrees', async ({ page }) => {
    await page.goto('/app/assigned');
    await expect(page.getByRole('heading', { name: 'Waiting on you' })).toBeVisible();
    // The lede has to answer "then where is everything else?", because this
    // page deliberately shows a strict subset and the old version did not.
    await expect(page.getByText(/Everything you have ordered, finished jobs included, is under Services/)).toBeVisible();

    const rows = page.locator('.rows.boxed > div');
    const waiting = rows.filter({ hasText: 'PT-2094' });
    await expect(waiting).toHaveCount(1);
    // Both halves of Orders.tsx:368's rule, shown on the row: the pill for
    // needsYou and the tag for the four pending deliverables.
    await expect(waiting.getByText('Needs you')).toBeVisible();
    await expect(waiting.getByText('4 to look at')).toBeVisible();

    // The regression this page's own header comment records: it once ran the
    // Services query and listed Placed jobs nobody was waiting on. PT-2101 is
    // placed and PT-2102 is sent-and-unanswered — neither needs a decision.
    await expect(rows.filter({ hasText: 'PT-2101' })).toHaveCount(0);
    await expect(rows.filter({ hasText: 'PT-2102' })).toHaveCount(0);

    // showRecord is on here and off under Services, because a cross-record
    // list that does not say which property is unusable.
    await expect(waiting.locator(`a[href="/app/records/${PARCEL}"]`)).toBeVisible();
    await expect(waiting.getByRole('link', { name: 'Open ticket' }))
      .toHaveAttribute('href', `/app/tickets/${T2094}`);

    // The badge (Shell.tsx:179) and the list (Orders.tsx:368) are two separate
    // copies of `needsYou || pendingReview > 0`. Nothing but this line stops
    // them drifting — a rail promising 3 over a list of 1 sends an owner
    // hunting for work that is not there.
    await expect(page.locator('.nav a[href="/app/assigned"] .count'))
      .toHaveText(String(await rows.count()));
  });
});
