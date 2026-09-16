/**
 * W16 — the wallet.
 *
 *   /app/wallet   what is in it, what is spoken for on work still out, and
 *                 where the rest of it went
 *
 * One screen, one source file (apps/web/src/w360/pages/Wallet.tsx), and one
 * argument the whole page is built to win: money set aside on a job is neither
 * spent nor available, and a screen that folds the two into one balance is the
 * reason somebody rings up asking why their wallet lost ₹8,600. So the four
 * figures are asserted separately, the jobs holding money are asserted against
 * the rows under them, and every honesty device — the stub notice, the "Not
 * charged" pill, the refused Add money button — gets its own scenario.
 *
 * What a reader of this file should know before changing it:
 *
 *  · The page computes NOTHING. Every figure, every sentence and the notice
 *    itself come off `web.wallet` (api.ts:646, `Q_WALLET` at api.ts:607, sixty
 *    rows and no cursor). So a scenario here is a wallet payload, not a click
 *    path, and `walletWith()` below builds one from the seeded shape.
 *  · The SHELL asks `portfolio` and `orders` on every authenticated route
 *    (Shell.tsx:63-64). Nothing here touches them, but they are why a wallet
 *    test that seals only `wallet` still sees three fields asked for.
 *  · The seeded WALLET (fixtures/seed.ts:677) is a display fixture, not a
 *    reconciled one: `setAside` is ₹14,200 while the five jobs it lists hold
 *    ₹27,200 between them, and its three ledger rows cannot produce either
 *    figure. The real resolver sums both out of the same table
 *    (web360.py:3565), so that shape is unreachable from the API — it is the
 *    fixture, not the product. Every arithmetic assertion here is therefore
 *    made against a wallet the test builds and can add up itself; the seeded
 *    one is used for layout, wording and the two figures that do line up with
 *    its rows (`putIn` = the top-up, `paidOut` = the payment out).
 *  · `World.httpError` makes the browser log a failed request, which the
 *    console guard fails on, so the one transport-failure scenario sits in its
 *    own describe with `allowConsole` and says why. Every other refusal is a
 *    `World.gqlError` — HTTP 200 with an `errors[]`, which is how the API
 *    actually reports a read it would not do.
 *  · A ledger row's `status` is one of three words and no others: 'recorded'
 *    under the stub or Razorpay's test keys, 'settled' once the provider is
 *    live, 'failed' when it did not go (ticketing.py:542-549). Rows built here
 *    use those, not the seed's 'done' — the page reads the field, so a test
 *    that invents a value is testing a shape the API cannot send.
 *  · A row's `at` is DD/MM/YYYY (`_ddmmyyyy`, web360.py:2038) and the page
 *    prints it verbatim. The seeded rows (fixtures/seed.ts:685-689) carry ISO
 *    dates instead, which is a fixture drift rather than a screen fault; where
 *    a date is asserted against a wallet this file builds, it is in the form
 *    the API actually sends.
 *  · `Cell` and the ledger rows render bare divs with no role and no heading
 *    (ui.tsx:397, Wallet.tsx:122), so the handles below are class-based. The
 *    class plus the text inside it is the only handle there is; where one is
 *    used it says so.
 *
 * Six defects are recorded as `test.fail()`, each naming its cause:
 *   1. Wallet.tsx:68-71 — the one action on the screen is disabled and the
 *      reason lives in a `title`, so a finger and a screen reader are told
 *      nothing at all.
 *   2. Wallet.tsx:31-158 — an empty wallet draws the entire screen: four ₹0
 *      figures, a dead button and two cards, where every other screen in this
 *      module answers "there is nothing here yet" with one `Empty`.
 *   3. Wallet.tsx:60-61 vs :78-82 — the strip can say ₹6,500 is set aside
 *      while the card an inch below says none is. Deleting a record is
 *      enough to produce it, by a path the API takes deliberately.
 *   4. Wallet.tsx:127-129 — a movement with no note of its own opens its line
 *      with a stray "·".
 *   5. Wallet.tsx:129 — the ledger names a job (W-2098) it will not let you
 *      open, though the row carries the ticket id and the jobs card links.
 *   6. Wallet.tsx:40 — the wallet is the one screen whose skeleton reads as
 *      missing money, and it is the one that does not name what it is waiting
 *      for.
 * They go green the day they are fixed.
 */
import { test, expect, World } from '../fixtures/harness';
import type { Page } from '../fixtures/harness';
import { TICKET } from '../fixtures/ids';
import { WALLET } from '../fixtures/seed';

// ── handles ────────────────────────────────────────────────────────────

/** One of a page's cards, named by its heading.
 *
 *  `Card` (ui.tsx:425) renders a bare `<section class="card">` carrying an
 *  `<h2>` and no accessible name of its own, so a `<section>` maps to
 *  `generic` and there is no role to ask for. The class plus the heading it
 *  contains is the only handle, and it is a precise one. */
const card = (page: Page, title: string | RegExp) =>
  page.locator('section.card').filter({ has: page.getByRole('heading', { name: title }) });

/** The ledger card, under either of the two titles it can wear. */
const ledger = (page: Page) => card(page, /^(Every movement|The latest movements)$/);

/** One of the four figures, named by its label.
 *
 *  `Cell` (ui.tsx:397) is three spans in a bare div inside `.strip` — no role,
 *  no heading, no label association — so the strip class plus an exact match
 *  on the label span is the only way to name one figure rather than all four. */
const figure = (page: Page, label: string) =>
  page.locator('.strip > div').filter({ has: page.getByText(label, { exact: true }) });

/** The rows inside one card. Rows are plain divs in `.rows.boxed`
 *  (Wallet.tsx:84, :121) — again no role, and both cards use the same
 *  structure, which is exactly why a row locator has to be scoped to a card. */
const rowsIn = (owner: ReturnType<typeof card>) => owner.locator('.rows.boxed > div');

const jobRow = (page: Page, ref: string) =>
  rowsIn(card(page, 'Jobs holding money')).filter({ hasText: ref });

const movementRow = (page: Page, label: string) =>
  rowsIn(ledger(page)).filter({ hasText: label });

/** The page's own loading region.
 *
 *  Scoped to `<main>` because the Shell mounts a second, permanently-empty
 *  `role="status"` for the search box (Shell.tsx:334) — it is a live region
 *  before it has anything to say, which is correct, and which makes a bare
 *  `getByRole('status')` two elements on every screen in this app. */
const waitingRegion = (page: Page) => page.locator('main').getByRole('status');

// ── building a wallet ──────────────────────────────────────────────────

type Payload = Record<string, unknown>;

/** The seeded wallet with some of it replaced. Every key `Q_WALLET` selects is
 *  present, because the seal answers with exactly what it is given and a
 *  missing key reaches the screen as `undefined`, not as a failure. */
const walletWith = (over: Payload = {}): Payload => ({ ...(WALLET as Payload), ...over });

/** One ledger row, in the shape `_lr` (web360.py:2027) builds.
 *
 *  The defaults are a stub row, which is what every row in this build is:
 *  provider 'stub', `simulated` true (it is `not is_live(provider)`,
 *  web360.py:2035), status 'recorded' (ticketing.py:549) and a DD/MM/YYYY
 *  date. `entry` is one of the five keys `ENTRY_LABEL` is written for —
 *  top_up · hold · release · fee · return (ticketing.py:360-364) — and `label`
 *  is the API's own word for it, which the page prints rather than derives. */
const movement = (over: Payload = {}): Payload => ({
  id: 'w-wled-x', entry: 'hold', label: 'Set aside', amount: 1_000,
  fromBucket: 'wallet', toBucket: 'held', payee: '', provider: 'stub',
  simulated: true, status: 'recorded', note: '', ticketId: '', ticketRef: '',
  at: '05/09/2026', ...over,
});

/** One job holding money, in the shape `WalletJob` (web360.py:3612) carries. */
const job = (over: Payload = {}): Payload => ({
  ticketId: TICKET.assigned, ref: 'W-2102', title: 'Corner survey',
  recordTitle: 'Sy 214/2', statusLabel: 'Assigned', held: 6_500, ...over,
});

/** ₹24,500 → 24500. The figures are asserted against each other, so they have
 *  to be read back off the screen rather than out of the fixture. */
const rupees = (text: string): number => Number(text.replace(/[^0-9.]/g, ''));

const figureValue = async (page: Page, label: string): Promise<number> =>
  rupees(await figure(page, label).locator('.v').innerText());

/** A wallet whose four figures and five movements reconcile, so a test can do
 *  the owner's arithmetic instead of trusting a fixture.
 *
 *    put in 50,000 · two holds of 6,500 · one of them paid out as 5,850 to the
 *    surveyor and 650 to Pattadar
 *
 *  leaves 6,500 still set aside on the open job, 6,500 gone out, and 37,000
 *  available. */
const RECONCILED = walletWith({
  available: 37_000, setAside: 6_500, paidOut: 6_500, putIn: 50_000,
  jobs: [job({ held: 6_500 })],
  rows: [
    movement({ id: 'r1', entry: 'top_up', label: 'Added', amount: 50_000, fromBucket: 'bank', toBucket: 'wallet', at: '01/09/2026' }),
    movement({ id: 'r2', entry: 'hold', label: 'Set aside', amount: 6_500, ticketId: TICKET.assigned, ticketRef: 'W-2102', at: '05/09/2026' }),
    movement({ id: 'r3', entry: 'hold', label: 'Set aside', amount: 6_500, ticketId: TICKET.closed, ticketRef: 'W-2098', at: '02/09/2026' }),
    movement({ id: 'r4', entry: 'release', label: 'To the person who did the work', amount: 5_850, fromBucket: 'held', toBucket: 'payout', payee: 'Ravi Kumar', ticketId: TICKET.closed, ticketRef: 'W-2098', at: '03/09/2026' }),
    movement({ id: 'r5', entry: 'fee', label: "Pattadar's share", amount: 650, fromBucket: 'held', toBucket: 'fee', ticketId: TICKET.closed, ticketRef: 'W-2098', at: '03/09/2026' }),
  ],
});

// ═══════════════════════════════════════════════════════════════════════
// The four figures
// ═══════════════════════════════════════════════════════════════════════

test.describe('The four figures', () => {
  test('the wallet opens on what I have, what is spoken for and where the rest went', async ({ page, world }) => {
    await page.goto('/app/wallet');

    await expect(page.getByText('Money', { exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'What is set aside, and what has gone' })).toBeVisible();
    await expect(page.getByText('The surveyor, the advocate and the caretaker are paid from here.')).toBeVisible();

    await expect(figure(page, 'Available')).toContainText('₹24,500');
    await expect(figure(page, 'Available')).toContainText('in your wallet');
    await expect(figure(page, 'Set aside on jobs')).toContainText('₹14,200');
    await expect(figure(page, 'Gone out')).toContainText('₹6,500');
    await expect(figure(page, 'Gone out')).toContainText('to people and to Pattadar');
    await expect(figure(page, 'Put in')).toContainText('₹45,000');

    expect(world.lastVars('wallet')).toMatchObject({ limit: 60 });
  });

  test('what is set aside is its own figure, never folded into the balance', async ({ page, world }) => {
    world.set('wallet', RECONCILED);
    await page.goto('/app/wallet');

    // The whole reason this page exists: 43,500 is the money, and the owner is
    // told which ₹6,500 of it they cannot spend.
    expect(await figureValue(page, 'Available')).toBe(37_000);
    expect(await figureValue(page, 'Set aside on jobs')).toBe(6_500);
  });

  test('the four figures reconcile with each other, read off the screen', async ({ page, world }) => {
    world.set('wallet', RECONCILED);
    await page.goto('/app/wallet');

    const available = await figureValue(page, 'Available');
    const setAside = await figureValue(page, 'Set aside on jobs');
    const goneOut = await figureValue(page, 'Gone out');
    const putIn = await figureValue(page, 'Put in');

    // What went in, less what has left, is what is here plus what is held.
    expect(putIn - goneOut).toBe(available + setAside);
  });

  test('what is set aside is what the jobs under it are holding', async ({ page, world }) => {
    world.set('wallet', walletWith({
      setAside: 7_700,
      jobs: [job({ held: 6_500 }), job({ ticketId: TICKET.quiet, ref: 'W-2106', title: 'Encumbrance certificate', statusLabel: 'Sent out', held: 1_200 })],
      rows: [],
    }));
    await page.goto('/app/wallet');

    const rows = rowsIn(card(page, 'Jobs holding money'));
    await expect(rows).toHaveCount(2);
    const held = await rows.locator('.num').allInnerTexts();
    expect(held.map(rupees).reduce((a, b) => a + b, 0)).toBe(await figureValue(page, 'Set aside on jobs'));
  });

  test('what has gone out and what was put in are the movements listed under them', async ({ page }) => {
    await page.goto('/app/wallet');

    // The two figures the seeded ledger can actually account for: one top-up
    // of ₹45,000 in, one payment of ₹6,500 out.
    expect(await figureValue(page, 'Put in')).toBe(45_000);
    await expect(movementRow(page, 'Added to the wallet')).toContainText('₹45,000');
    expect(await figureValue(page, 'Gone out')).toBe(6_500);
    await expect(movementRow(page, 'Paid to Ravi Kumar')).toContainText('₹6,500');
  });

  test('the jobs figure counts the jobs, and counts one of them as one', async ({ page, world }) => {
    world.set('wallet', walletWith({ setAside: 6_500, jobs: [job()], rows: [] }));
    await page.goto('/app/wallet');

    await expect(figure(page, 'Set aside on jobs')).toContainText('1 job');
    await expect(figure(page, 'Set aside on jobs')).not.toContainText('1 jobs');
  });

  test('five jobs are five jobs', async ({ page }) => {
    await page.goto('/app/wallet');
    await expect(figure(page, 'Set aside on jobs')).toContainText('5 jobs');
  });

  test('the wallet says whether it will top itself up', async ({ page, world }) => {
    world.set('wallet', walletWith({ autoTopUp: true }));
    await page.goto('/app/wallet');
    await expect(figure(page, 'Put in')).toContainText('auto top-up on');
  });

  test('a wallet that will not top itself up says that instead', async ({ page }) => {
    await page.goto('/app/wallet');
    await expect(figure(page, 'Put in')).toContainText('auto top-up off');
  });

  test('a balance is printed in whole rupees, the way somebody reconciling it writes it', async ({ page, world }) => {
    // ₹1,00,500 as "₹1.01 L" over a movement reading ₹1,00,500 is the ₹433 of
    // daylight the page's own comment (Wallet.tsx:51-57) exists to prevent.
    world.set('wallet', walletWith({
      available: 1_00_500,
      rows: [movement({ id: 'r1', entry: 'top_up', label: 'Added', amount: 1_00_500, fromBucket: 'bank', toBucket: 'wallet' })],
    }));
    await page.goto('/app/wallet');

    await expect(figure(page, 'Available')).toContainText('₹1,00,500');
    await expect(figure(page, 'Available')).not.toContainText('L');
    await expect(movementRow(page, 'Added')).toContainText('₹1,00,500');
  });

  test('past a crore the balance takes the short form while its movements keep their digits', async ({ page, world }) => {
    // The one seam in `inrFullish` (ui.tsx:110) and a deliberate one: above a
    // crore the full digits stop being readable. It is worth knowing what it
    // costs — ₹1,00,50,000 in the wallet is printed "₹1.00 Cr" over a movement
    // of ₹1,00,50,000, which is ₹50,000 of the very daylight this page's own
    // comment (Wallet.tsx:51-57) says it exists to prevent, reappearing two
    // orders of magnitude up. Recorded here so that the day it moves, it moves
    // on purpose rather than by accident.
    world.set('wallet', walletWith({
      available: 1_00_50_000,
      rows: [movement({ id: 'r1', entry: 'top_up', label: 'Added', amount: 1_00_50_000, fromBucket: 'bank', toBucket: 'wallet' })],
    }));
    await page.goto('/app/wallet');

    await expect(figure(page, 'Available')).toContainText('₹1.00 Cr');
    await expect(movementRow(page, 'Added')).toContainText('₹1,00,50,000');
  });

  test('a wallet with nothing in it still prints a figure rather than a dash', async ({ page, world }) => {
    // ₹0 on a balance is a fact, not a missing value — unlike a valuation,
    // where the same screens print an em dash (ui.tsx:98).
    world.set('wallet', walletWith({ available: 0, setAside: 0, paidOut: 0, putIn: 0, jobs: [], rows: [] }));
    await page.goto('/app/wallet');

    await expect(figure(page, 'Available')).toContainText('₹0');
    await expect(figure(page, 'Available')).not.toContainText('—');
  });
});

// ═══════════════════════════════════════════════════════════════════════
// Jobs holding money
// ═══════════════════════════════════════════════════════════════════════

test.describe('Jobs holding money', () => {
  test('every job holding money is listed with what it is holding, and the card counts them', async ({ page }) => {
    await page.goto('/app/wallet');

    const jobs = card(page, 'Jobs holding money');
    await expect(jobs.locator('.cardhead .num')).toHaveText('5');
    await expect(rowsIn(jobs)).toHaveCount(5);

    const survey = jobRow(page, 'W-2102');
    await expect(survey).toContainText('Corner survey');
    await expect(survey).toContainText('W-2102 · Sy 214/2 · Assigned');
    await expect(survey).toContainText('₹6,500');

    const ec = jobRow(page, 'W-2106');
    await expect(ec).toContainText('Encumbrance certificate');
    await expect(ec).toContainText('Sent out');
    await expect(ec).toContainText('₹1,200');
  });

  test('a job that is holding nothing is not on the list', async ({ page }) => {
    await page.goto('/app/wallet');

    // W-2098 is done and W-2099 was cancelled; neither is holding a rupee, so
    // neither belongs on a card about money that is still spoken for
    // (web360.py:3603 keeps only the tickets whose held balance is above zero).
    await expect(jobRow(page, 'W-2098')).toHaveCount(0);
    await expect(jobRow(page, 'W-2099')).toHaveCount(0);

    // But it is off the card, not off the screen: the ₹6,500 W-2098 once held
    // is still on the page as a movement that has already gone out, which is
    // the only honest way for a job to leave the "holding money" list.
    await expect(movementRow(page, 'Paid to Ravi Kumar')).toContainText('W-2098');
    await expect(movementRow(page, 'Paid to Ravi Kumar')).toContainText('₹6,500');
  });

  test('each job on the list opens the job', async ({ page }) => {
    await page.goto('/app/wallet');

    await jobRow(page, 'W-2102').getByRole('link').click();

    await expect(page).toHaveURL(new RegExp(`/app/services/${TICKET.assigned}$`));
    await expect(page.getByRole('heading', { name: 'Corner survey', level: 1 })).toBeVisible();
    // The one-service screen's eyebrow, which printed the reference and the
    // land a second time two lines under the breadcrumb, is gone
    // (docs/specs/2026-09-14-service-detail.md §2). The breadcrumb is now the
    // only place the owner reads which job they have landed on, so that is
    // what this asserts — the guarantee is unchanged: the row named W-2102
    // opens W-2102 on Sy 214/2, not somebody else's job.
    const crumbs = page.getByRole('navigation', { name: 'Breadcrumb' });
    await expect(crumbs).toContainText('W-2102');
    await expect(crumbs.getByRole('link', { name: 'Sy 214/2' })).toBeVisible();
  });

  test('when no job is holding anything the card says what would put one there', async ({ page, world }) => {
    world.set('wallet', walletWith({ setAside: 0, jobs: [] }));
    await page.goto('/app/wallet');

    const jobs = card(page, 'Jobs holding money');
    await expect(jobs.locator('.cardhead .num')).toHaveText('0');
    await expect(jobs).toContainText('No money is set aside on any job.');
    await expect(jobs).toContainText('When you order a survey or a title opinion, what it costs appears here until you accept the work.');
    await expect(rowsIn(jobs)).toHaveCount(0);
  });

  test('a job is named by the record it is on, not only by its reference', async ({ page, world }) => {
    world.set('wallet', walletWith({
      setAside: 900,
      jobs: [job({ ticketId: TICKET.onSite, ref: 'W-2103', title: 'Site visit with photographs', recordTitle: 'Flat 4B, Kondapur', statusLabel: 'On site', held: 900 })],
      rows: [],
    }));
    await page.goto('/app/wallet');

    await expect(jobRow(page, 'W-2103')).toContainText('W-2103 · Flat 4B, Kondapur · On site');
  });

  // ── defect ───────────────────────────────────────────────────────────
  // Wallet.tsx:60-61 prints `setAside` exactly as the API summed it, and
  // Wallet.tsx:78-82 decides whether any money is set aside from
  // `jobs.length` alone. The resolver builds those two figures from different
  // reads: web360.py:3590-3591 (summed at :3626) totals every hold in the
  // table, while web360.py:3603-3617 lists only the holds whose work_request
  // row is still there, and only those carrying a ticket id at all.
  // This is not a hypothetical shape. Deleting a record takes exactly that
  // path ON PURPOSE — web360.py:4130 deletes the record's work_requests while
  // web360.py:4118-4123 deliberately keeps their ledger rows, because "money
  // that moved is a fact about the account, not about the record" — so one
  // delete of a record with a funded job open puts "₹6,500" and "No money is
  // set aside on any job" an inch apart on this screen. That contradiction is
  // the exact phone call this page was written to stop.
  // The owner is owed: when `setAside` is more than the jobs account for, the
  // card says what is unaccounted for instead of claiming there is none.
  test.fail('the wallet never says money is set aside and, an inch below, that none is', async ({ page, world }) => {
    world.set('wallet', walletWith({
      setAside: 6_500,
      jobs: [],
      // The shape a deleted record leaves behind, note and all.
      rows: [movement({ id: 'r1', amount: 6_500, label: 'Set aside', note: 'record deleted', ticketId: TICKET.assigned, ticketRef: 'W-2102' })],
    }));
    await page.goto('/app/wallet');

    await expect(figure(page, 'Set aside on jobs')).toContainText('₹6,500');
    await expect(card(page, 'Jobs holding money')).not.toContainText('No money is set aside on any job');
  });
});

// ═══════════════════════════════════════════════════════════════════════
// The ledger
// ═══════════════════════════════════════════════════════════════════════

test.describe('The ledger', () => {
  test('every movement is listed with what it was, what it was worth and when', async ({ page }) => {
    await page.goto('/app/wallet');

    await expect(ledger(page)).toContainText('Every movement');
    await expect(ledger(page).locator('.cardhead .num')).toHaveText('3');
    await expect(rowsIn(ledger(page))).toHaveCount(3);

    const topUp = movementRow(page, 'Added to the wallet');
    await expect(topUp).toContainText('₹45,000');
    await expect(topUp).toContainText('2026-08-30');

    const held = movementRow(page, 'Set aside for W-2102');
    await expect(held).toContainText('₹6,500');
    await expect(held).toContainText('2026-09-05');
  });

  test('a movement to a person says who it went to, and against which job', async ({ page }) => {
    await page.goto('/app/wallet');

    const paid = movementRow(page, 'Paid to Ravi Kumar');
    await expect(paid).toContainText('Ravi Kumar');
    await expect(paid).toContainText('W-2098');
    await expect(paid).toContainText('₹6,500');
    await expect(paid).toContainText('2026-08-14');
  });

  test('a movement the stub only recorded says it was not charged, and gets no tick', async ({ page }) => {
    await page.goto('/app/wallet');

    // Deliberately colourless: a green tick beside a figure nobody collected
    // would vouch for a movement that never left the building.
    await expect(ledger(page).getByText('Not charged')).toHaveCount(3);
    await expect(ledger(page).getByText('Settled')).toHaveCount(0);
    await expect(ledger(page).locator('.state.good')).toHaveCount(0);
  });

  test('a movement that really settled is allowed to say so', async ({ page, world }) => {
    world.set('wallet', walletWith({
      live: true, notice: '', provider: 'razorpay',
      rows: [movement({ id: 'r1', entry: 'release', label: 'To the person who did the work', amount: 5_850, fromBucket: 'held', toBucket: 'payout', payee: 'Ravi Kumar', provider: 'razorpay', simulated: false, status: 'settled', ticketRef: 'W-2098' })],
    }));
    await page.goto('/app/wallet');

    const row = movementRow(page, 'To the person who did the work');
    await expect(row.locator('.state.good')).toHaveText('Settled');
    await expect(row.getByText('Not charged')).toHaveCount(0);
  });

  test('a payment that did not go says so in its own row', async ({ page, world }) => {
    world.set('wallet', walletWith({
      live: true, notice: '', provider: 'razorpay',
      rows: [movement({ id: 'r1', entry: 'release', label: 'To the person who did the work', amount: 5_850, fromBucket: 'held', toBucket: 'payout', payee: 'Ravi Kumar', provider: 'razorpay', simulated: false, status: 'failed', ticketRef: 'W-2098' })],
    }));
    await page.goto('/app/wallet');

    const row = movementRow(page, 'To the person who did the work');
    await expect(row.locator('.state.bad')).toHaveText('It did not go');
    await expect(row).toContainText('₹5,850');
  });

  test('a payment that bounced stays on the ledger and out of the figure above it', async ({ page, world }) => {
    // The resolver sums every figure `WHERE status <> 'failed'`
    // (web360.py:3595) and then lists the failed row anyway (web360.py:3620) —
    // "a failed payment is a fact, not a balance" (web360.py:3584). So the page
    // has to print the sum it is given rather than add up the rows in front of
    // it, or a payout that bounced would be charged to the owner twice: once as
    // a movement and once in the figure above it.
    world.set('wallet', walletWith({
      available: 43_500, setAside: 6_500, paidOut: 0, putIn: 50_000,
      live: true, notice: '', provider: 'razorpay',
      jobs: [job({ held: 6_500 })],
      rows: [
        movement({ id: 'r1', entry: 'release', label: 'To the person who did the work', amount: 5_850, fromBucket: 'held', toBucket: 'payout', payee: 'Ravi Kumar', provider: 'razorpay', simulated: false, status: 'failed', ticketId: TICKET.assigned, ticketRef: 'W-2102', at: '06/09/2026' }),
        movement({ id: 'r2', amount: 6_500, provider: 'razorpay', simulated: false, status: 'settled', ticketId: TICKET.assigned, ticketRef: 'W-2102', at: '05/09/2026' }),
        movement({ id: 'r3', entry: 'top_up', label: 'Added', amount: 50_000, fromBucket: 'bank', toBucket: 'wallet', provider: 'razorpay', simulated: false, status: 'settled', at: '01/09/2026' }),
      ],
    }));
    await page.goto('/app/wallet');

    const bounced = movementRow(page, 'To the person who did the work');
    await expect(bounced.locator('.state.bad')).toHaveText('It did not go');
    await expect(bounced).toContainText('₹5,850');

    // Nothing has gone out, and the money the failed payout was for is still
    // set aside on the job it was for.
    expect(await figureValue(page, 'Gone out')).toBe(0);
    expect(await figureValue(page, 'Set aside on jobs')).toBe(6_500);
    await expect(jobRow(page, 'W-2102')).toContainText('₹6,500');
  });

  test('a movement carries the note the API wrote on it, ahead of who and which job', async ({ page, world }) => {
    // `note` is rendered (Wallet.tsx:127) and nothing else asserts it. The one
    // the API writes by itself is 'record deleted' (web360.py:4120-4123): when
    // a record goes, its jobs go with it and its ledger deliberately does not,
    // so this note is the only thing on the screen that explains why ₹6,500 is
    // held against a job that can no longer be opened or listed.
    world.set('wallet', walletWith({
      setAside: 6_500, jobs: [],
      rows: [movement({ id: 'r1', amount: 6_500, note: 'record deleted', ticketId: TICKET.closed, ticketRef: 'W-2098', at: '05/09/2026' })],
    }));
    await page.goto('/app/wallet');

    const row = movementRow(page, 'Set aside');
    await expect(row.locator('span.note').first()).toHaveText('record deleted · W-2098');
    await expect(row).toContainText('₹6,500');
    await expect(row).toContainText('05/09/2026');
  });

  test('a payment made on the provider-s test keys is still not vouched for', async ({ page, world }) => {
    // `simulated` is `not is_live(provider)` (web360.py:2035) and `is_live` is
    // false for anything ending `_test` (ticketing.py:535-539), so a row
    // written through Razorpay's test keys — a real API call with no real money
    // in it, noted as such at payments.py:325 — is marked exactly like a stub
    // row. The page has to follow `simulated` rather than the presence of a
    // provider name or a settled-looking status, or test mode would put a green
    // tick under a payout nobody received.
    world.set('wallet', walletWith({
      live: false, provider: 'razorpay_test',
      rows: [movement({ id: 'r1', entry: 'release', label: 'To the person who did the work', amount: 5_850, fromBucket: 'held', toBucket: 'payout', payee: 'Ravi Kumar', provider: 'razorpay_test', simulated: true, status: 'recorded', note: 'Razorpay test mode: no real money moved.', ticketId: TICKET.closed, ticketRef: 'W-2098', at: '06/09/2026' })],
    }));
    await page.goto('/app/wallet');

    const row = movementRow(page, 'To the person who did the work');
    await expect(row.getByText('Not charged')).toBeVisible();
    await expect(row.locator('.state.good')).toHaveCount(0);
    await expect(row.locator('span.note').first())
      .toHaveText('Razorpay test mode: no real money moved. · Ravi Kumar · W-2098');
  });

  test('the movements are listed in the order the ledger gave them, newest first', async ({ page, world }) => {
    // web360.py:3620-3621 orders by created_at DESC and the page renders the
    // list as handed to it. It must never sort on what it prints: `at` is
    // DD/MM/YYYY text (web360.py:2038), and sorting that as text puts 05/09
    // above 11/09 and 30/08 above both — a ledger whose top line is not the
    // last thing that happened is a ledger nobody can reconcile.
    world.set('wallet', walletWith({
      rows: [
        movement({ id: 'r1', entry: 'return', label: 'Given back', amount: 6_500, fromBucket: 'held', toBucket: 'wallet', ticketId: TICKET.cancelled, ticketRef: 'W-2099', at: '11/09/2026' }),
        movement({ id: 'r2', amount: 6_500, ticketId: TICKET.cancelled, ticketRef: 'W-2099', at: '05/09/2026' }),
        movement({ id: 'r3', entry: 'top_up', label: 'Added', amount: 45_000, fromBucket: 'bank', toBucket: 'wallet', at: '30/08/2026' }),
      ],
    }));
    await page.goto('/app/wallet');

    const rows = rowsIn(ledger(page));
    await expect(rows).toHaveCount(3);
    await expect(rows.nth(0)).toContainText('Given back');
    await expect(rows.nth(0)).toContainText('11/09/2026');
    await expect(rows.nth(1)).toContainText('05/09/2026');
    await expect(rows.nth(2)).toContainText('Added');
    await expect(rows.nth(2)).toContainText('30/08/2026');
  });

  test('a job that was cancelled shows what was settled and what came back', async ({ page, world }) => {
    // The cancelled job (W-2099) holds nothing any more, so it is off the jobs
    // card entirely — the ledger is the only place the owner can see that the
    // ₹6,500 went out and came back.
    world.set('wallet', walletWith({
      available: 45_000, setAside: 0, paidOut: 0, putIn: 45_000, jobs: [],
      rows: [
        movement({ id: 'r1', entry: 'return', label: 'Given back', amount: 6_500, fromBucket: 'held', toBucket: 'wallet', ticketId: TICKET.cancelled, ticketRef: 'W-2099', at: '11/09/2026' }),
        movement({ id: 'r2', entry: 'hold', label: 'Set aside', amount: 6_500, ticketId: TICKET.cancelled, ticketRef: 'W-2099', at: '04/09/2026' }),
      ],
    }));
    await page.goto('/app/wallet');

    await expect(jobRow(page, 'W-2099')).toHaveCount(0);
    await expect(movementRow(page, 'Set aside')).toContainText('₹6,500');
    await expect(movementRow(page, 'Given back')).toContainText('₹6,500');
    await expect(movementRow(page, 'Given back')).toContainText('W-2099');
    await expect(figure(page, 'Set aside on jobs')).toContainText('₹0');
  });

  test('nothing having moved yet is said in words, not left blank', async ({ page, world }) => {
    world.set('wallet', walletWith({ rows: [] }));
    await page.goto('/app/wallet');

    await expect(ledger(page)).toContainText('Nothing has moved yet.');
    await expect(ledger(page)).toContainText('When money is set aside on a job, released to the person who did it, or given back, every movement is listed here with the date.');
    await expect(rowsIn(ledger(page))).toHaveCount(0);
  });

  test('while the whole ledger fits on the screen the card counts it as every movement', async ({ page, world }) => {
    // 59 rows: the last shape that is still the complete history.
    world.set('wallet', walletWith({
      rows: Array.from({ length: 59 }, (_, i) => movement({ id: `r${i}`, label: `Set aside ${i}`, amount: 100 + i })),
    }));
    await page.goto('/app/wallet');

    await expect(page.getByRole('heading', { name: 'Every movement' })).toBeVisible();
    await expect(ledger(page).locator('.cardhead .num')).toHaveText('59');
    await expect(ledger(page)).not.toContainText('Showing the latest');
  });

  test('a full page of movements stops claiming to be all of them', async ({ page, world }) => {
    // Sixty is what `Q_WALLET` asks for and the resolver honours exactly
    // (web360.py:3622), so a full page is the one case where movements exist
    // that are not on screen. The count beside the title reads as a total
    // everywhere else in this module, so here it goes away.
    world.set('wallet', walletWith({
      rows: Array.from({ length: 60 }, (_, i) => movement({ id: `r${i}`, label: `Set aside ${i}`, amount: 100 + i })),
    }));
    await page.goto('/app/wallet');

    await expect(page.getByRole('heading', { name: 'The latest movements' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Every movement' })).toHaveCount(0);
    await expect(ledger(page).locator('.cardhead .num')).toHaveCount(0);
    await expect(ledger(page)).toContainText('Showing the latest 60 movements.');
    await expect(ledger(page)).toContainText("Older ones are not on this screen yet; every movement made against a job is listed in full on that job's own page.");
    await expect(rowsIn(ledger(page))).toHaveCount(60);
  });

  // ── defect ───────────────────────────────────────────────────────────
  // Wallet.tsx:127-129 joins the sub-line as `{note}{' · ' + payee}{' · ' +
  // ticketRef}`, so a row whose `note` is empty opens with a separator that
  // separates nothing. Empty is the ordinary case, not an edge: `_lr`
  // (web360.py:2036) copies `note` straight off the payment row and the API
  // writes one only when something unusual happened, which is why two of the
  // three seeded rows already show it.
  // The owner is owed a line joined from the parts that exist — a
  // `filter(Boolean).join(' · ')`. The jobs row above it (Wallet.tsx:93-95)
  // writes the same unguarded join and is saved only by every one of its three
  // parts being derived server-side rather than copied (web360.py:3612-3617).
  test.fail('a movement with no note of its own does not open its line with a stray separator', async ({ page }) => {
    await page.goto('/app/wallet');

    // `.note` also dresses the date beside the amount, so the sub-line is the
    // first of the two inside the row.
    await expect(movementRow(page, 'Set aside for W-2102').locator('span.note').first())
      .toHaveText('W-2102');
  });

  // ── defect ───────────────────────────────────────────────────────────
  // Wallet.tsx:129 prints `ticketRef` as inert text although the row also
  // carries `ticketId` — asked for at api.ts:610 and used for nothing — and
  // the jobs card two inches above turns exactly that id into a link
  // (Wallet.tsx:88). A job only falls off the jobs card once it stops holding
  // money, which is to say once it is done or cancelled, so the ledger is the
  // ONLY place those jobs are named, and the card's own footnote sends the
  // owner to "that job's own page" without giving them a way to it.
  // The owner is owed the reference as a link to /app/services/:id.
  test.fail('a movement that names a job lets me open that job', async ({ page }) => {
    await page.goto('/app/wallet');

    await expect(movementRow(page, 'Paid to Ravi Kumar').getByRole('link', { name: 'W-2098' }))
      .toBeVisible();
  });
});

// ═══════════════════════════════════════════════════════════════════════
// The notice, and the one thing this screen cannot do
// ═══════════════════════════════════════════════════════════════════════

test.describe('Honesty about a provider that is a stub', () => {
  test('the wallet says at the top that nothing here moved real money', async ({ page }) => {
    await page.goto('/app/wallet');

    const notice = page.locator('.card.dashed');
    await expect(notice).toBeVisible();
    // The fixture's wording, not the API's — the seed writes a shorter notice
    // than `WALLET_STUB_NOTICE` does. What this scenario proves is that the
    // sentence reaches the top of the page at all; the next one proves the page
    // prints the real one, whatever it says.
    await expect(notice).toHaveText('Payments are switched off on this build. Nothing here has moved real money.');
  });

  test('the sentence is the API-s, not the page-s', async ({ page, world }) => {
    // This is `ticketing.WALLET_STUB_NOTICE` (ticketing.py:746-750) word for
    // word — the sentence the live resolver actually sends (web360.py:3631),
    // and three sentences rather than the fixture's two. The same words have to
    // hold on every screen that shows a figure the stub recorded, so the page
    // must print what it is given rather than keep a copy of its own that can
    // drift: this test fails the day somebody hardcodes the notice.
    const REAL = 'Payments are not switched on yet. Every figure here is a record of what a job'
      + ' costs and who it is owed to. Nothing has been taken from any account, and nothing has'
      + ' been sent to anyone.';
    world.set('wallet', walletWith({ notice: REAL }));
    await page.goto('/app/wallet');

    await expect(page.locator('.card.dashed')).toHaveText(REAL);
  });

  test('once payments are really on, the notice goes', async ({ page, world }) => {
    world.set('wallet', walletWith({ live: true, notice: '', provider: 'razorpay' }));
    await page.goto('/app/wallet');

    await expect(figure(page, 'Available')).toBeVisible();
    await expect(page.locator('.card.dashed')).toHaveCount(0);
  });

  test('adding money is offered and refused, because the prototype cannot honestly take it', async ({ page }) => {
    await page.goto('/app/wallet');

    const add = page.getByRole('button', { name: 'Add money' });
    await expect(add).toBeVisible();
    await expect(add).toBeDisabled();
    // There IS a reason, and this is the whole of it — one `title` attribute
    // (Wallet.tsx:69). Asserted verbatim because it is the evidence for the
    // defect below: the sentence exists, and only a mouse ever sees it.
    await expect(add).toHaveAttribute('title', 'Adding money to the wallet is not switched on yet');

    // The refusal must not be a card form that charges nobody. Scoped to
    // `main`: the Shell's own search box sits outside it on every screen.
    const body = page.locator('main');
    await expect(body.getByRole('textbox')).toHaveCount(0);
    await expect(body.getByRole('spinbutton')).toHaveCount(0);
    await expect(body.locator('form')).toHaveCount(0);
  });

  test('adding money stays refused even once payments are switched on', async ({ page, world }) => {
    // Wallet.tsx:68 disables the button unconditionally — nothing about it
    // reads `live`. So the day the provider goes live the notice at the top
    // goes away, the screen stops saying payments are off, and its one action
    // is still dead and still explaining itself with a sentence that is now
    // false of everything except this button.
    // Recorded as current behaviour rather than as a defect because the
    // prototype has no top-up flow to offer instead; the defect that IS owed
    // here — saying the reason out loud — is the one below. This test is what
    // notices the day a live wallet needs more than a dead button.
    world.set('wallet', walletWith({ live: true, notice: '', provider: 'razorpay' }));
    await page.goto('/app/wallet');

    await expect(page.locator('.card.dashed')).toHaveCount(0);
    const add = page.getByRole('button', { name: 'Add money' });
    await expect(add).toBeDisabled();
    await expect(add).toHaveAttribute('title', 'Adding money to the wallet is not switched on yet');
  });

  // ── defect ───────────────────────────────────────────────────────────
  // Wallet.tsx:68-71 puts the reason in a `title` attribute. A title appears
  // only under a mouse that hovers and waits: on a phone — where this app is
  // mostly read — there is no hover, and a screen reader is given nothing at
  // all because a disabled button is not in the tab order to be described.
  // The screen's one action is therefore dead and silent, which is the exact
  // dead control the zero-state standard rules out.
  // The owner is owed the sentence on the screen, under the button.
  test.fail('the wallet says out loud why money cannot be added, not only to a mouse that hovers', async ({ page }) => {
    await page.goto('/app/wallet');

    const add = page.getByRole('button', { name: 'Add money' });
    await expect(add).toBeDisabled();
    // Scoped to the button's own block (Wallet.tsx:67-73), not to the page:
    // the API's real stub notice opens "Payments are not switched on yet"
    // (ticketing.py:746), and a sentence at the top of the screen about the
    // provider is not a reason for THIS button. The owed sentence sits with
    // the control it is about.
    await expect(page.locator('main > div').filter({ has: add }).getByText(/not switched on yet/i))
      .toBeVisible();
  });
});

// ═══════════════════════════════════════════════════════════════════════
// An empty wallet
// ═══════════════════════════════════════════════════════════════════════

test.describe('A wallet with nothing in it', () => {
  const EMPTY = walletWith({
    available: 0, setAside: 0, paidOut: 0, putIn: 0, autoTopUp: false, jobs: [], rows: [],
  });

  test('a brand new wallet still explains what would ever go into it', async ({ page, world }) => {
    world.set('wallet', EMPTY);
    await page.goto('/app/wallet');

    await expect(card(page, 'Jobs holding money')).toContainText('No money is set aside on any job.');
    await expect(ledger(page)).toContainText('Nothing has moved yet.');
    await expect(figure(page, 'Set aside on jobs')).toContainText('0 jobs');
  });

  // ── defect ───────────────────────────────────────────────────────────
  // Wallet.tsx:31-158 has one loaded rendering and no empty one, so an
  // account that has never ordered a thing is handed the entire apparatus:
  // four ₹0 figures, a disabled button, a card counting 0 jobs and a card
  // counting 0 movements, each with its own paragraph. Every other screen in
  // this module answers "there is nothing here yet" with a single `Empty`
  // (ui.tsx:669) — a marker, one sentence, and the one thing to do — and the
  // wallet does not even import it.
  // The owner is owed one thing said once, not a full screen of chrome around
  // four zeroes.
  test.fail('a wallet with nothing in it says one thing, instead of drawing the whole screen around four zeroes', async ({ page, world }) => {
    world.set('wallet', EMPTY);
    await page.goto('/app/wallet');

    await expect(page.locator('.blank')).toBeVisible();
    await expect(page.locator('.strip')).toHaveCount(0);
    await expect(card(page, 'Jobs holding money')).toHaveCount(0);
    await expect(ledger(page)).toHaveCount(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// Waiting, and not arriving
// ═══════════════════════════════════════════════════════════════════════

test.describe('While the wallet is being read', () => {
  test('a wallet still being read holds its shape and claims nothing', async ({ page, world }) => {
    world.set('wallet', World.never());
    await page.goto('/app/wallet');

    // Three states, not two: a skeleton held forever on THIS screen reads as
    // money that has gone missing rather than as a request that failed.
    const waiting = waitingRegion(page);
    await expect(waiting).toBeVisible();
    await expect(waiting).toHaveAttribute('aria-busy', 'true');
    await expect(waiting).toContainText('Loading');
    await expect(waiting.locator('.skeleton')).toBeVisible();

    // It must not have decided the wallet is empty, or failed, on the way.
    await expect(page.getByText('Nothing has moved yet.')).toHaveCount(0);
    await expect(page.getByText('No money is set aside on any job.')).toHaveCount(0);
    await expect(page.getByRole('alert')).toHaveCount(0);
    await expect(page.locator('.strip')).toHaveCount(0);
    // And it has not drawn the one control on the screen before it knows
    // whether there is a wallet to add money to.
    await expect(page.getByRole('button', { name: 'Add money' })).toHaveCount(0);
    await expect(page.locator('.card.dashed')).toHaveCount(0);

    // The head is drawn immediately, so the page is never a bare grey slab.
    await expect(page.getByRole('heading', { name: 'What is set aside, and what has gone' })).toBeVisible();
  });

  test('a slow wallet is waited for, not given up on', async ({ page, world }) => {
    world.set('wallet', World.slow(1_500, WALLET));
    await page.goto('/app/wallet');

    await expect(waitingRegion(page)).toBeVisible();
    await expect(figure(page, 'Available')).toContainText('₹24,500');
    await expect(waitingRegion(page)).toHaveCount(0);
  });

  // ── defect ───────────────────────────────────────────────────────────
  // Wallet.tsx:40 draws `<Loading h="60vh" />` with no `what`, so a 60vh grey
  // slab is captioned "Loading…". `Loading` asks for that noun for a reason
  // (ui.tsx:646-647): it should match the one the same screen gives `Failed`,
  // which here is "Your wallet" (Wallet.tsx:41) — so the waiting word and the
  // failure word agree, and the one screen where a held skeleton reads as
  // missing money says what it is holding for.
  // The owner is owed "Loading your wallet…", the way the Dashboard, the
  // vault, a boundary and a job all name theirs.
  test.fail('a wallet that is still loading names what it is waiting for', async ({ page, world }) => {
    world.set('wallet', World.never());
    await page.goto('/app/wallet');

    await expect(waitingRegion(page)).toContainText('Loading your wallet');
  });
});

test.describe('When the wallet cannot be read', () => {
  test('a refused read says so, says why, and does not print a balance of zero', async ({ page, world }) => {
    world.set('wallet', World.gqlError('the ledger is locked for maintenance'));
    await page.goto('/app/wallet');

    const failed = page.getByRole('alert');
    await expect(failed).toContainText('Your wallet did not load');
    await expect(failed).toContainText('Nothing has been lost');
    await expect(failed).toContainText('Your records are untouched.');
    // Printed verbatim, for whoever is being asked "what does it say?" down a
    // phone line.
    await expect(failed).toContainText('the ledger is locked for maintenance');

    // The one thing a wallet must never do on a failed read.
    await expect(page.locator('.strip')).toHaveCount(0);
    await expect(page.getByText('₹0')).toHaveCount(0);
    await expect(page.getByText('Nothing has moved yet.')).toHaveCount(0);
  });

  test('trying again repairs the page rather than one row of it', async ({ page, world }) => {
    world.set('wallet', World.gqlError('the ledger is locked for maintenance'));
    await page.goto('/app/wallet');
    await expect(page.getByRole('alert')).toBeVisible();

    const before = world.calls('wallet').length;
    world.set('wallet', WALLET);
    await page.getByRole('button', { name: 'Try again' }).click();

    await expect(figure(page, 'Available')).toContainText('₹24,500');
    await expect(page.getByRole('alert')).toHaveCount(0);
    expect(world.calls('wallet').length).toBeGreaterThan(before);
  });

  test('a read that comes back with no wallet at all is a failure, not an empty wallet', async ({ page, world }) => {
    // `WalletView` is non-null in the schema, so this is the shape only a
    // broken deploy produces — and the screen must not read it as "you have
    // nothing", which is the same picture as "your money is gone".
    world.set('wallet', null);
    await page.goto('/app/wallet');

    await expect(page.getByRole('alert')).toContainText('Your wallet did not load');
    await expect(page.locator('.strip')).toHaveCount(0);
    // The whole body goes with it — no dead button, no notice about a provider
    // the page never heard back from.
    await expect(page.getByRole('button', { name: 'Add money' })).toHaveCount(0);
    await expect(page.locator('.card.dashed')).toHaveCount(0);
    // A null answer carries no error to quote, so `Failed` must leave the
    // reason line out (ui.tsx:713, :741) rather than print an empty grey one.
    await expect(page.locator('.blank-why')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Try again' })).toBeEnabled();
  });

  test.describe('when the request itself fails', () => {
    // A 503 is logged by the browser as a failed request, which the console
    // guard fails on. Provoking it is the point of this test.
    test.use({ allowConsole: true });

    test('a server that refused the request outright says so, with the code in it', async ({ page, world }) => {
      world.set('wallet', World.httpError(503));
      await page.goto('/app/wallet');

      await expect(page.getByRole('alert')).toContainText('Your wallet did not load');
      await expect(page.getByRole('alert')).toContainText('GraphQL HTTP 503');
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════
// Getting there, and being there on a phone
// ═══════════════════════════════════════════════════════════════════════

test('the rail takes me to the wallet and marks it as where I am', async ({ page }) => {
  await page.goto('/app');

  await page.getByRole('link', { name: 'Wallet' }).click();

  await expect(page).toHaveURL(/\/app\/wallet$/);
  await expect(page.getByRole('link', { name: 'Wallet' })).toHaveAttribute('aria-current', 'page');
  await expect(page.getByRole('heading', { name: 'What is set aside, and what has gone' })).toBeVisible();
});

test.describe('On a phone', () => {
  // Both scenarios here are about WIDTH, so the width is set rather than
  // inherited: the phone project runs them on a real iPhone profile, and the
  // desktop project proves them too, at the same 390px.
  test.use({ viewport: { width: 390, height: 844 } });

  test('the four figures stack one to a row rather than squeezing into four columns @phone', async ({ page }) => {
    await page.goto('/app/wallet');

    const cells = page.locator('.strip > div');
    await expect(cells).toHaveCount(4);
    const boxes = await Promise.all((await cells.all()).map((c) => c.boundingBox()));
    for (const box of boxes) expect(box).not.toBeNull();
    // All four, not just the first two: three in a column and one squeezed
    // alongside is the layout this is here to catch.
    for (let i = 1; i < boxes.length; i += 1) {
      expect(boxes[i]!.x).toBeCloseTo(boxes[0]!.x, 0);
      expect(boxes[i]!.y).toBeGreaterThan(boxes[i - 1]!.y + boxes[i - 1]!.height - 1);
    }

    // Every figure still legible in full — a balance is not a magnitude.
    await expect(figure(page, 'Available')).toContainText('₹24,500');
    await expect(figure(page, 'Set aside on jobs')).toContainText('₹14,200');
    await expect(figure(page, 'Gone out')).toContainText('₹6,500');
    await expect(figure(page, 'Put in')).toContainText('₹45,000');
  });

  test('the jobs and the movements survive a 390px screen without taking the page sideways @phone', async ({ page }) => {
    await page.goto('/app/wallet');

    await expect(rowsIn(card(page, 'Jobs holding money'))).toHaveCount(5);
    await expect(rowsIn(ledger(page))).toHaveCount(3);
    await expect(movementRow(page, 'Paid to Ravi Kumar')).toContainText('₹6,500');

    const overflow = await page.evaluate(() =>
      document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  });
});
