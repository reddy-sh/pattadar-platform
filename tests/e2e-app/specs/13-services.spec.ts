/**
 * W10 + W13 + W16 — ordering work, and asking for it.
 *
 * Seven routes, three source files, one argument: an order is the only place
 * money leaves the app on somebody else's word, so every screen here has to be
 * honest about what has actually been filed.
 *
 *   /services                  every order this account placed
 *   /assigned                  the ones sitting on your decision
 *   /order                     the one order flow: properties, services, review
 *   /properties/:id/services      the same rows, scoped to one record
 *   /properties/:id/activity       what has been corrected on that record
 *   /properties/:id/request       asking somebody outside to do a job
 *
 * What a reader of this file should know before changing it:
 *
 *  · The SHELL asks `orders` too — apps/web/src/w360/Shell.tsx line 64 runs
 *    `useOrders()` on every authenticated route for its badge — and it shares
 *    react-query's key with the Services page's default read. So `world.set`
 *    on `orders` moves the badge as well as the list, and assertions about
 *    what was asked look for a call among `world.calls('orders')` rather than
 *    assuming the page's was the only one.
 *  · `orders`, `record`, `papers`, `photos`, `properties` and `corrections`
 *    are seeded as FUNCTIONS of their variables, so `world.seedOf()` refuses
 *    them. The rows themselves are exported from fixtures/seed.ts — `ORDERS`,
 *    `OFFERS`, `CARDS`, `CORRECTIONS` — and this file derives from those
 *    rather than keeping a second copy that can drift. Where a whole shape is
 *    wanted with one field changed, `SEED.record` is called and patched
 *    (`recordLike` below) rather than a fortieth-field-perfect copy written
 *    out by hand.
 *  · `OFFERS` is now the catalogue services/api/src/web360.py actually sells:
 *    six services, three groups, the real prices and the real field tuples.
 *    It used to be four inventions, so every assertion about grouping, about
 *    which services need the land located and about what an order costs was
 *    testing a catalogue the product does not sell.
 *  · `World.httpError` makes the browser log a failed request, which the
 *    console guard fails on. Every refusal here is a `World.gqlError` (HTTP
 *    200 with an `errors[]`) or a falsy mutation result, which is how
 *    Mutation.web actually reports "that did not happen".
 *  · Uploading a file to a request posts to `/api/gateway/storage/files?…`,
 *    which the seed does NOT route (it routes `…/files/:id/content` and
 *    `…/nodes`). That is deliberate — an upload is never accidental — so the
 *    three request-with-a-file tests each answer it themselves.
 *  · A world bug this file writes around rather than fixes, because it is one
 *    the specs can live with: in `serveGraphql`, a FUNCTION answer that
 *    RETURNS a special answer permanently replaces the field with it
 *    (world.ts:331-336 sets before it reads `saved`). So
 *    `world.set('x', (v) => bad ? World.gqlError(…) : rows)` never comes back
 *    to `rows`. Where a read has to fail and then recover — the Try-again
 *    tests — the answer is swapped from the test body between the failure and
 *    the click instead; where it has to fail from one moment onwards and stay
 *    failed, the one-way door is exactly what is wanted and is used as such.
 *
 * Seven defects are recorded as `test.fail()`, each naming its cause. Two of
 * them are one mistake made in two places: a read whose ERROR is never
 * destructured, so an outage is drawn as an answer about the owner's records.
 *   1. Orders.tsx:284 — a corrections read that FAILED is drawn as "nothing
 *      has been corrected", which is the opposite of what happened.
 *   2. RequestWork.tsx:87-88 — and again, on the screen that promises the
 *      owner chooses exactly what leaves the record.
 *   3. (Retired 10/10/2026: the owner's Assign-to picker and its `assignable`
 *      read left Orders.tsx when assigning became the desk's move.)
 *   4. RequestWork.tsx:205 — RAISE_FAILED is unreachable, so a request that
 *      died on the way back never tells the owner to look under Services
 *      before retrying, which is the whole point of that sentence.
 *   5. RequestWork.tsx:168 — the same line means an upload that dies never
 *      says that no request was raised.
 *   6. RequestWork.tsx:82 — `?kind=` goes into createRequest verbatim, so a
 *      link can file a job of a kind nothing sells under the surveyor's words.
 *   7. RequestWork.tsx:347 — the photos a request may carry stop at twelve,
 *      with nothing saying so, under a card promising the reader sees exactly
 *      what is ticked. The order flow's own `Attachments`
 *      (OrderService.tsx:228-287) caps nothing, on the same data; the
 *      thirteenth photo on a record still cannot be sent from here.
 *   8. OrderService.tsx:1005-1006 — the receipt prints "It is job PT-2199 ,
 *      and we expect it back by …": JSX strips the newline between the
 *      reference and the fragment that opens with a space before its comma.
 *   9. OrderLand.tsx:66 and OrderService.tsx:122 — the only two callers of
 *      `extent()` in the module round the land off: 4.3 acres reads "4 acres"
 *      and 1.2 acres reads "1 acres", where every other screen prints the
 *      server's own "4 acres 12 guntas".
 * They go green the day they are fixed.
 *
 * TWO that used to be here are fixed by the order redesign and are ordinary
 * passing tests again:
 *   · the papers-and-photos read that failed (old OrderService.tsx:104-105)
 *     drew "Nothing is filed against this property yet" and let the order go
 *     with an empty manifest. It is now a `Failed` inside the attachments card
 *     alone (OrderService.tsx:836-837) and the order still goes, deliberately:
 *     a vault outage is not a reason to refuse to sell.
 *   · the refusal that outlived the property it was raised against (old
 *     OrderService.tsx:193). The in-page property picker is gone — the land is
 *     a path segment now — and `err` is cleared whenever the service changes
 *     (OrderService.tsx:384).
 *
 * One more was recorded here and is NOT a defect, so it is now an ordinary
 * passing test: the stage rail's accessible name ("Stage 4 of 4") leaves out
 * the status word drawn inside it — but Orders.tsx:160 prints that same word
 * in its own <State> pill on the same row, so nothing is kept from a screen
 * reader. What the rail is really worth testing for is the pip count, and
 * that has to be set in the test: `stage` is a 0-based index into
 * ORDER_STAGES (services/api/src/ticketing.py STATUS_STAGE writes placed=0 …
 * submitted=3) while the suite's seeded rows number their stages from 1.
 */
import { test, expect, World } from '../fixtures/harness';
import type { Page } from '../fixtures/harness';
import { ID, PAPER, PHOTO, TICKET } from '../fixtures/ids';
import { CARDS, CORRECTIONS, OFFERS, ORDERS, PHOTOS, RING, SEED } from '../fixtures/seed';

// ── handles ────────────────────────────────────────────────────────────

/** One of a page's cards, named by its heading.
 *
 *  `Card` in ui.tsx renders a bare `<section class="card">` with an `<h2>`
 *  inside and no accessible name of its own, so a `<section>` here maps to
 *  `generic` and there is no role to ask for. The class plus the heading it
 *  contains is the only handle, and it is a precise one. */
const card = (page: Page, title: string) =>
  page.locator('section.card').filter({ has: page.getByRole('heading', { name: title, exact: true }) });

/** The number a card prints in its own header — `<span class="num">` for a
 *  plain count, a `<Chip>` (`<span class="chip">`, no role: `Chip` only
 *  renders a button when it is clickable) for the ticked ones.
 *
 *  Worth its own handle because `toContainText('6')` off the whole card is
 *  not an assertion: "₹6,500" contains a 6, "Showing 10 of 12" contains a 12,
 *  and "Flat 4B" contains a 4. */
const cardCount = (page: Page, title: string) =>
  card(page, title).locator('.cardhead').locator('.num, .chip').first();

/** One order row, named by its reference number.
 *
 *  Rows in `Rows` (Orders.tsx) are plain divs inside `.rows.boxed` — no role,
 *  no heading. The ref (PT-2101 …) is unique per order and is printed on every
 *  row, so it is what names one. */
const orderRow = (page: Page, ref: string) =>
  page.locator('.rows.boxed > div').filter({ hasText: ref });

/** One order in the /services table, named by its reference number.
 *  The ref is printed under the service name in the row's first cell. */
const serviceRows = (page: Page) => page.getByRole('table', { name: 'Your service orders' }).locator('tbody tr');
const serviceRow = (page: Page, ref: string) => serviceRows(page).filter({ hasText: ref });

/** The property's own Service orders tab — every seeded order is against
 *  Sy 214/2, so the trackable rows are all here. */
const RECORD_SERVICES = `/properties/${ID.parcel}/services`;

/** The orders a default `includeClosed: false` read answers with. */
const OPEN_ORDERS = ORDERS.filter((o) => o.status !== 'accepted' && o.status !== 'cancelled');

/** The seeded `orders` answer, re-implemented over rows a test chose.
 *
 *  `world.seedOf('orders')` refuses — the seed answers it with a FUNCTION of
 *  its variables — so a test that wants to vary one row has to apply the same
 *  two filters the seed does, or the Shell's own read (which asks for the
 *  whole account) comes back with a record-scoped list. */
const ordersAnswer = (rows: Record<string, unknown>[]) => (vars: Record<string, unknown>) => {
  let out = rows;
  if (vars.includeClosed !== true) {
    out = out.filter((o) => o.status !== 'accepted' && o.status !== 'cancelled');
  }
  if (vars.recordId) out = out.filter((o) => o.recordId === vars.recordId);
  return out;
};

/** A `properties` answer carrying exactly these cards. Only `.cards` is read
 *  by the property picker, but the whole shape is sent so nothing on the
 *  screen can draw `undefined`. */
const propertyList = (cards: Record<string, unknown>[]) => ({
  shown: cards.length, total: cards.length, hidden: 0, filterSummary: '',
  hiddenPlaces: [], activeCount: 0, cards, facets: [],
});

/** A stored node, as the storage gateway answers an upload. */
const storedNode = (over: Record<string, unknown> = {}) => ({
  id: 'node-uploaded-1', name: 'Sale deed.pdf', sizeBytes: 2048,
  mimeType: 'application/pdf', ...over,
});

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ═══════════════════════════════════════════════════════════════════════
// /services — everything you have ordered
// ═══════════════════════════════════════════════════════════════════════

test.describe('Services', () => {
  // The list is a data table now (Orders.tsx OrderTable): one row per order,
  // the service name as the row's link, the property as its own link, the
  // status as one chip, the due date and the money. Tracking a job and
  // putting somebody on it moved off this list — onto the order itself and
  // onto the property's own Service orders tab, which still draws the
  // trackable rows (`Rows`). Those tests follow the rows there, below.
  test('Grid and Table show the same orders, and what is ticked in one stays ticked in the other', async ({ page }) => {
    await page.goto('/services');
    const table = page.getByRole('table', { name: 'Your service orders' });
    await expect(table.locator('tbody tr').first()).toBeVisible();
    const rows = await table.locator('tbody tr').count();
    expect(rows).toBeGreaterThan(1);

    await page.getByRole('group', { name: 'View' }).getByRole('button', { name: 'Grid' }).click();
    await expect(page).toHaveURL(/[?&]view=grid/);
    const cards = page.locator('.ordercard');
    await expect(cards).toHaveCount(rows);
    await cards.first().getByRole('checkbox').check();
    await expect(page.getByRole('group', { name: 'Act on the selected orders' })).toContainText('1 order selected');

    await page.getByRole('group', { name: 'View' }).getByRole('button', { name: 'Table' }).click();
    await expect(table.locator('tbody tr').first().getByRole('checkbox')).toBeChecked();
    await expect(table.locator('tfoot')).toContainText('1 order selected');
  });

  test('every order still running is on the list, with its status word, its due date and what it cost', async ({ page, world }) => {
    await page.goto('/services');

    await expect(page.getByRole('heading', { name: 'Services', level: 1 })).toBeVisible();
    // Not "paid from your wallet, held in escrow": placing an order takes
    // nothing from anybody, and funding is a separate later act on the order.
    // A standing condition of ordering, so it sits behind the heading's ⓘ.
    await expect(page.getByRole('button', { name: 'About Services' }))
      .toHaveAccessibleDescription('You pay only after you accept the work.');
    // Six open jobs; the two closed ones are not asked for.
    await expect(serviceRows(page)).toHaveCount(6);
    for (const ref of ['PT-2101', 'PT-2102', 'PT-2103', 'PT-2104', 'PT-2105', 'PT-2106']) {
      await expect(serviceRow(page, ref)).toBeVisible();
    }
    await expect(serviceRow(page, 'PT-2098')).toHaveCount(0);

    const survey = serviceRow(page, 'PT-2102');
    await expect(survey).toContainText('Corner survey');
    await expect(survey).toContainText('Assigned');
    await expect(survey).toContainText('₹6,500');
    // What is actually held on the job, which is not the same claim as what
    // it was quoted at. "Held" is the wallet's word (design.md, Wallet movement).
    await expect(survey).toContainText('₹6,500 held');
    // Dates are DD/MM/YYYY on every surface (naming standard U4).
    await expect(survey).toContainText('25/09/2026');

    // A job nobody has funded is quoted but holds nothing.
    const ec = serviceRow(page, 'PT-2101');
    await expect(ec).toContainText('₹1,200');
    await expect(ec).not.toContainText('held');

    expect(world.calls('orders').map((c) => c.vars))
      .toContainEqual({ recordId: null, includeClosed: false });
  });

  test('the two states an owner acts on are said in words', async ({ page }) => {
    await page.goto('/services');

    // "Sent back" and "Waiting on you" have no pip of their own — they are the
    // reason the status is a word at all. The words are the server's owner
    // words (ticketing.owner_label): the desk's "Sent out" never reaches here.
    await expect(serviceRow(page, 'PT-2104')).toContainText('Sent back');
    await expect(serviceRow(page, 'PT-2106')).toContainText('Assigned');
    await expect(page.getByText('Sent out')).toHaveCount(0);
    const waiting = serviceRow(page, 'PT-2105');
    // One status per order, said once: "Needs you" used to be a second pill
    // beside "Waiting on you", the same fact twice (Orders.tsx statusOf).
    await expect(waiting).toContainText('Waiting on you');
    await expect(waiting).not.toContainText('Needs you');
    await expect(waiting).toContainText('2 to review');
    // And a job nobody is waiting on carries neither.
    await expect(serviceRow(page, 'PT-2103')).not.toContainText('Waiting on you');
  });

  test('each row says which property it is against, and that name is the way in', async ({ page }) => {
    await page.goto('/services');
    const link = serviceRow(page, 'PT-2102').getByRole('link', { name: 'Sy 214/2' });
    await expect(link).toHaveAttribute('href', `/properties/${ID.parcel}`);
  });

  test('a finished job only appears when I ask for everything', async ({ page, world }) => {
    await page.goto('/services');
    await expect(serviceRow(page, 'PT-2098')).toHaveCount(0);

    await page.getByRole('button', { name: 'All', exact: true }).click();

    await expect.poll(() => world.calls('orders').some((c) => c.vars.includeClosed === true)).toBe(true);
    expect(world.lastVars('orders')).toMatchObject({ recordId: null, includeClosed: true });

    await expect(serviceRows(page)).toHaveCount(8);
    await expect(serviceRow(page, 'PT-2098')).toContainText('Accepted');
    await expect(serviceRow(page, 'PT-2099')).toContainText('Cancelled');
    // A closed job has no due date to hold anybody to.
    await expect(serviceRow(page, 'PT-2098')).not.toContainText('25/09/2026');
  });

  test('the Open chip puts the finished work away again, without a second round trip', async ({ page, world }) => {
    await page.goto('/services');
    await page.getByRole('button', { name: 'All', exact: true }).click();
    await expect(serviceRow(page, 'PT-2098')).toBeVisible();
    const asked = world.calls('orders').length;

    await page.getByRole('button', { name: 'Open', exact: true }).click();

    await expect(serviceRows(page)).toHaveCount(6);
    await expect(serviceRow(page, 'PT-2098')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Open', exact: true }))
      .toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByRole('button', { name: 'All', exact: true }))
      .toHaveAttribute('aria-pressed', 'false');
    // The open list was already held under its own key, so going back to it
    // costs nothing — the two chips are two queries, not one query re-asked.
    expect(world.calls('orders')).toHaveLength(asked);
  });

  test('a row opens its own service', async ({ page }) => {
    await page.goto('/services');
    // The service name is the row's real link (Orders.tsx OrderTable), so a
    // keyboard gets the same target the pointer does.
    await expect(serviceRow(page, 'PT-2101').getByRole('link', { name: 'Encumbrance certificate' }))
      .toHaveAttribute('href', `/services/${TICKET.placed}`);
    await expect(serviceRows(page).locator('td:nth-child(2) > a')).toHaveCount(6);
  });

  test('the list pages and totals every order the filter lets through', async ({ page, world }) => {
    // 25 open orders: past one page of 20, and the footer adds up all 25.
    const many = Array.from({ length: 25 }, (_, i) => ({
      ...OPEN_ORDERS[0], id: `bulk-${i}`, ref: `PT-3${String(i).padStart(3, '0')}`,
      batchId: '', batchRef: '', cost: 1000, held: i < 2 ? 500 : 0,
    }));
    world.set('orders', ordersAnswer(many));
    await page.goto('/services');

    await expect(serviceRows(page)).toHaveCount(20);
    const foot = page.getByRole('table', { name: 'Your service orders' }).locator('tfoot tr');
    await expect(foot.getByRole('rowheader')).toHaveText('Total · 25 orders');
    await expect(foot).toContainText('₹25,000');
    await expect(foot).toContainText('₹1,000 held');
    const pager = page.getByRole('navigation', { name: 'Service order pages' });
    await expect(pager).toContainText('1–20 of 25');
    await pager.getByRole('button', { name: 'Next' }).click();
    await expect(serviceRows(page)).toHaveCount(5);
    await expect(pager).toContainText('21–25 of 25');
  });

  test('ticking two orders sums them in the footer and offers them for export', async ({ page }) => {
    await page.goto('/services');
    const rows = [serviceRow(page, 'PT-2101'), serviceRow(page, 'PT-2102')];
    for (const row of rows) await row.getByRole('checkbox').check();
    // The tick box is a control: ticking does not open the order.
    await expect(page).toHaveURL('/services');

    const foot = page.getByRole('table', { name: 'Your service orders' }).locator('tfoot tr');
    await expect(foot.getByRole('rowheader')).toHaveText('2 orders selected');
    const costs = await Promise.all(rows.map(async (row) =>
      Number((await row.locator('td').nth(5).innerText()).split('\n')[0].replace(/[^0-9]/g, ''))));
    await expect(foot.locator('td.num')).toContainText(`₹${(costs[0] + costs[1]).toLocaleString('en-IN')}`);
    const bar = page.getByRole('group', { name: 'Act on the selected orders' });
    await expect(bar.getByRole('status')).toHaveText('2 orders selected');
    await expect(bar.getByRole('button', { name: 'Export' })).toBeVisible();
    await bar.getByRole('button', { name: 'Clear' }).click();
    await expect(foot.getByRole('rowheader')).toHaveText(/^Total · /);
  });

  test('following a row through lands on that service and opens its own job, not the list again', async ({ page }) => {
    // The route moved to /services/:id and the old /tickets/:id is gone, so
    // the row must send the owner to the new path.
    await page.goto('/services');

    await serviceRow(page, 'PT-2101').getByRole('link', { name: 'Encumbrance certificate' }).click();

    await expect(page).toHaveURL(`/services/${TICKET.placed}`);
    // PT-2101 is the encumbrance certificate and PT-2102 is the corner survey,
    // so the heading is what proves the row opened ITS job and not a
    // neighbour's.
    await expect(page.getByRole('heading', { level: 1, name: 'Encumbrance certificate' }))
      .toBeVisible();
    // And the trail says where it came from, so the way back is the crumb and
    // not the browser button.
    const crumbs = page.getByRole('navigation', { name: 'Breadcrumb' });
    await expect(crumbs.getByRole('link', { name: 'Services' }))
      .toHaveAttribute('href', '/services');
    await expect(crumbs).toContainText('PT-2101');
  });

  test('a click anywhere on a row that is not its own control opens the order', async ({ page }) => {
    await page.goto('/services');

    await serviceRow(page, 'PT-2102').locator('td').nth(4).click();

    await expect(page).toHaveURL(`/services/${TICKET.assigned}`);
  });

  test('an account that has never ordered gets the title and one way in, not a band over an empty box', async ({ page, world }) => {
    world.set('orders', []);
    await page.goto('/services');

    await expect(page.getByText('No orders yet')).toBeVisible();
    // First-run empty (design.md § Page head, "Empty states"): no band, no
    // summary and no head action — the card carries the one filled add.
    await expect(page.locator('.filterbar')).toHaveCount(0);
    await expect(page.locator('.pagehead-summary')).toHaveCount(0);
    await expect(page.locator('.pagehead .actions')).toHaveCount(0);
    const add = page.getByRole('main').getByRole('link', { name: 'Order a service' });
    await expect(add).toHaveCount(1);
    await expect(add).toHaveClass(/\bprimary\b/);
  });

  test('nothing open says so, and offers the finished work from the card', async ({ page, world }) => {
    const done = { ...OPEN_ORDERS[0], status: 'accepted' };
    world.set('orders', ordersAnswer([done]));
    await page.goto('/services');

    await expect(page.getByText('No open orders')).toBeVisible();
    // Filtered empty: the head and band stay as when populated, the filled
    // add included, and the card offers the way out.
    await expect(page.locator('.pagehead .btn.primary')).toHaveText('Order a service');
    const which = page.getByRole('group', { name: 'Which orders' });
    await expect(which.getByRole('button', { name: 'Open', exact: true })).toHaveAttribute('aria-pressed', 'true');

    await page.locator('.blank').getByRole('button', { name: 'Show all' }).click();

    await expect(which.getByRole('button', { name: 'All', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(serviceRows(page)).toHaveCount(1);
  });

  test('a list still loading does not claim there is nothing on order', async ({ page, world }) => {
    world.set('orders', World.never());
    await page.goto('/services');

    await expect(page.getByRole('status', { name: 'Loading your service orders' })).toBeVisible();
    await expect(page.getByText('No open orders')).toHaveCount(0);
    await expect(page.getByText('Your service orders did not load')).toHaveCount(0);
  });

  test('a list that did not load says so, says nothing was lost, and prints the reason', async ({ page, world }) => {
    world.set('orders', World.gqlError('the work queue is down'));
    await page.goto('/services');

    const failed = page.getByRole('alert').filter({ hasText: 'Your service orders did not load' });
    await expect(failed).toBeVisible();
    await expect(failed).toContainText('Check your connection and try again.');
    await expect(failed).toContainText('the work queue is down');
    await expect(failed.getByRole('button', { name: 'Try again' })).toBeVisible();
    // Not the empty state. An outage is not an answer about your orders.
    await expect(page.getByText('No open orders')).toHaveCount(0);
  });

  test('the header goes straight into ordering, without a detour through the property list', async ({ page }) => {
    await page.goto('/services');
    await expect(page.getByRole('link', { name: 'Order a service' })).toHaveAttribute('href', '/order');
  });


  test('a job against a property with no name of its own draws no nameless link', async ({ page, world }) => {
    // OrderTable gates the property link on `o.recordTitle`. A link with
    // nothing written in it is announced by its href and clicked by accident;
    // the row is owed one link, the service's, and a dash where the name is.
    world.set('orders', ordersAnswer(ORDERS.map((o) =>
      (o.id === TICKET.placed ? { ...o, recordTitle: '' } : o))));
    await page.goto('/services');

    const row = serviceRow(page, 'PT-2101');
    await expect(row.getByRole('link', { name: 'Encumbrance certificate' })).toBeVisible();
    await expect(row.getByRole('link')).toHaveCount(1);
    await expect(row.locator('td').nth(2)).toHaveText('—');
    // And the rows that do have a name still carry it.
    await expect(serviceRow(page, 'PT-2102').getByRole('link', { name: 'Sy 214/2' })).toBeVisible();
  });

  test('Try again on a list that did not load really asks again, and the rows arrive', async ({ page, world }) => {
    world.set('orders', World.gqlError('the work queue is down'));
    await page.goto('/services');
    const failed = page.getByRole('alert').filter({ hasText: 'Your service orders did not load' });
    await expect(failed).toBeVisible();
    const before = world.calls('orders').length;

    // The server comes back. The button is the only thing that asks it again —
    // a retry that refetched in silence would be a dead control on the one
    // screen where giving up means ringing somebody.
    world.set('orders', ordersAnswer(ORDERS));
    await failed.getByRole('button', { name: 'Try again' }).click();

    await expect.poll(() => world.calls('orders').length).toBeGreaterThan(before);
    await expect(serviceRow(page, 'PT-2101')).toBeVisible();
    await expect(serviceRows(page)).toHaveCount(6);
    await expect(failed).toHaveCount(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// /properties/:id/services — tracking a job and putting somebody on it
//
// The trackable rows (`Rows` in Orders.tsx) left /services when that page
// became a table, and stayed on the property's own Service orders tab. Every
// seeded order is against Sy 214/2, so the same rows are here.
// ═══════════════════════════════════════════════════════════════════════

test.describe('Tracking an order on its property', () => {
  test('Open | All is a band control under the head, not in it', async ({ page }) => {
    await page.goto(RECORD_SERVICES);
    const which = page.locator('.filterbar.band').getByRole('group', { name: 'Which orders' });
    await expect(which).toBeVisible();
    await expect(page.locator('header.sechead').getByRole('group', { name: 'Which orders' })).toHaveCount(0);
    await which.getByRole('button', { name: 'All', exact: true }).click();
    await expect(which.getByRole('button', { name: 'All', exact: true })).toHaveAttribute('aria-pressed', 'true');
  });

  test('where a job has got to can be read without leaving the list', async ({ page }) => {
    await page.goto(RECORD_SERVICES);
    const row = orderRow(page, 'PT-2102');
    const track = row.getByRole('button', { name: 'Show progress' });
    await expect(track).toHaveAttribute('aria-expanded', 'false');

    await track.click();

    await expect(row).toContainText('Assigned · due 25/09/2026 · with Ravi Kumar');
    await expect(row.getByRole('button', { name: 'Hide progress' })).toHaveAttribute('aria-expanded', 'true');

    await row.getByRole('button', { name: 'Hide progress' }).click();
    await expect(row).not.toContainText('due 25/09/2026 · with Ravi Kumar');
  });

  test('a provider\'s proof shows their rating, never how much other work they carry', async ({ page, world }) => {
    // web360.py AssignedResourceTrust has no open-work count: it is counted
    // across every customer, so it would tell this owner another's volume.
    const proof = {
      associateId: 'as-ravi', name: 'Ravi Kumar', firm: 'Ravi Surveys', initials: 'RK',
      role: 'Licensed surveyor', ratingAverage: 4.6, ratingCount: 12, professionalVerified: true,
      professionalCredentials: [], trainingCertificates: [],
    };
    world.set('orders', ordersAnswer(ORDERS.map((o) =>
      (o.id === TICKET.assigned ? { ...o, assigneeRef: 'as-ravi', assignedResource: proof } : o))));
    await page.goto(RECORD_SERVICES);
    const row = orderRow(page, 'PT-2102');
    await row.getByRole('button', { name: 'Show progress' }).click();

    await expect(row.getByLabel('Verified work profile for Ravi Kumar')).toContainText('4.6 from 12 service ratings');
    await expect(row).not.toContainText(/active Pattadar order/);
    expect(world.calls('orders').at(-1)!.query).not.toContain('jobsOpen');
  });

  test('tracking a second job puts the first one away, so two panels cannot be read against each other', async ({ page }) => {
    await page.goto(RECORD_SERVICES);
    await orderRow(page, 'PT-2102').getByRole('button', { name: 'Show progress' }).click();
    await expect(orderRow(page, 'PT-2102')).toContainText('Assigned · due 25/09/2026 · with Ravi Kumar');

    await orderRow(page, 'PT-2103').getByRole('button', { name: 'Show progress' }).click();

    await expect(orderRow(page, 'PT-2103')).toContainText('On site · due 25/09/2026 · with K. Anitha');
    await expect(orderRow(page, 'PT-2102')).not.toContainText('with Ravi Kumar');
    await expect(orderRow(page, 'PT-2102').getByRole('button', { name: 'Show progress' }))
      .toHaveAttribute('aria-expanded', 'false');
  });

  test('a job somebody already holds names who has it instead of offering to hand it out again', async ({ page }) => {
    await page.goto(RECORD_SERVICES);
    const row = orderRow(page, 'PT-2102');
    await row.getByRole('button', { name: 'Show progress' }).click();

    await expect(row).toContainText('with Ravi Kumar');
    // There is no picker anywhere on the owner's side: who does the work is
    // Pattadar desk's decision (service order spec §7).
    await expect(row.getByLabel('Assign to')).toHaveCount(0);
    await expect(row).not.toContainText('Never assigned.');
  });

  test('an order placed before the form asked anything says so instead of showing a blank', async ({ page }) => {
    await page.goto(RECORD_SERVICES);
    await orderRow(page, 'PT-2103').getByRole('button', { name: 'Show progress' }).click();
    await expect(orderRow(page, 'PT-2103'))
      .toContainText('No details recorded.');
  });

  test('the answers I gave are readable back off the row', async ({ page, world }) => {
    world.set('orders', OPEN_ORDERS.map((o) => (o.id === TICKET.onSite
      ? { ...o, params: JSON.stringify({ how_many_corners: '8', anything_else: '  ' }) }
      : o)));
    await page.goto(RECORD_SERVICES);

    await orderRow(page, 'PT-2103').getByRole('button', { name: 'Show progress' }).click();
    const row = orderRow(page, 'PT-2103');
    await expect(row).toContainText('How many corners');
    await expect(row).toContainText('8');
    // An answer nobody filled in is not a line on the sheet.
    await expect(row).not.toContainText('Anything else');
  });

  test('an order whose answers cannot be read still shows its stage', async ({ page, world }) => {
    world.set('orders', OPEN_ORDERS.map((o) => (o.id === TICKET.onSite ? { ...o, params: 'not json' } : o)));
    await page.goto(RECORD_SERVICES);

    await orderRow(page, 'PT-2103').getByRole('button', { name: 'Show progress' }).click();
    await expect(orderRow(page, 'PT-2103')).toContainText('On site');
    await expect(orderRow(page, 'PT-2103'))
      .toContainText('No details recorded.');
  });

  test('a job nobody is on yet offers no picker: Pattadar desk finds the provider', async ({ page, world }) => {
    // Service order spec §7: assigning is the desk's move (DeskJob.tsx), and
    // the server no longer answers `assignable` or `assignRequest` at all.
    await page.goto(RECORD_SERVICES);
    const row = orderRow(page, 'PT-2101');
    await row.getByRole('button', { name: 'Show progress' }).click();
    await expect(row.getByRole('button', { name: 'Hide progress' })).toBeVisible();

    await expect(row.getByLabel('Assign to')).toHaveCount(0);
    await expect(row.getByRole('combobox')).toHaveCount(0);
    await expect(row).not.toContainText('Never assigned.');
    expect(world.asked('assignable')).toBe(false);
  });

  test('the way to everything about an unassigned order is its own page', async ({ page }) => {
    await page.goto(RECORD_SERVICES);
    await orderRow(page, 'PT-2101').getByRole('link', { name: 'Open order' }).click();
    await expect(page).toHaveURL(`/services/${TICKET.placed}`);
    await expect(page.locator('section.card.next-step')).toBeVisible();
  });

  test('a job that is over says nobody was ever on it rather than offering a picker', async ({ page }) => {
    await page.goto(RECORD_SERVICES);
    await page.getByRole('button', { name: 'All' }).click();

    const row = orderRow(page, 'PT-2099');
    await row.getByRole('button', { name: 'Show progress' }).click();

    await expect(row).toContainText('Never assigned.');
    await expect(row.getByLabel('Assign to')).toHaveCount(0);
  });

  test('the pips count out how far along a job is, and the status word sits beside them', async ({ page, world }) => {
    // `stage` is a 0-based index into ORDER_STAGES — services/api/src/
    // ticketing.py STATUS_STAGE writes placed=0, assigned=1, on_site=2,
    // submitted=3 — and Rail (ui.tsx) counts it out loud because four amber
    // dashes say nothing to a screen reader. It is set here rather than read
    // off the seed, whose rows number their stages from 1.
    world.set('orders', ordersAnswer(ORDERS.map((o) => ({ ...o, stage: o.stage - 1 }))));
    await page.goto(RECORD_SERVICES);

    await expect(orderRow(page, 'PT-2101').getByLabel('Stage 1 of 4')).toBeVisible();
    await expect(orderRow(page, 'PT-2103').getByLabel('Stage 3 of 4')).toBeVisible();
    // The rail is pips only and names its stage; the row's own status is the
    // chip beside the title, said once (Orders.tsx: "Pips only: the word is
    // the chip above"). A job at Delivered that is waiting on this person
    // says so in the chip.
    await expect(orderRow(page, 'PT-2105').getByLabel('Stage 4 of 4: Delivered')).toBeVisible();
    await expect(orderRow(page, 'PT-2105').locator('.schip').first()).toHaveText('Waiting on you');
    await expect(orderRow(page, 'PT-2106').getByLabel('Stage 2 of 4: Assigned')).toBeVisible();
    await expect(orderRow(page, 'PT-2106').locator('.schip').first()).toHaveText('Assigned');
    // The pips are bare <i>s with no role of their own; `i.on` is how many are
    // lit, which is the only thing a glance down the list actually reads.
    await expect(orderRow(page, 'PT-2101').locator('.rail i.on')).toHaveCount(1);
    await expect(orderRow(page, 'PT-2105').locator('.rail i.on')).toHaveCount(4);
  });

  test('a stage the rail has no pip for still reads as a stage, rather than as none', async ({ page, world }) => {
    // `stage` is the server's integer and Rail (ui.tsx) clamps it into
    // ORDER_STAGES rather than indexing past the end. When a ninth status
    // arrives, the row must still count itself out loud instead of lighting
    // nothing and naming nothing.
    world.set('orders', ordersAnswer(ORDERS.map((o) => {
      if (o.id === TICKET.placed) return { ...o, stage: -1 };
      if (o.id === TICKET.assigned) return { ...o, stage: 9 };
      return o;
    })));
    await page.goto(RECORD_SERVICES);

    await expect(orderRow(page, 'PT-2101').getByLabel('Stage 1 of 4')).toBeVisible();
    await expect(orderRow(page, 'PT-2101').locator('.rail i.on')).toHaveCount(1);
    await expect(orderRow(page, 'PT-2102').getByLabel('Stage 4 of 4')).toBeVisible();
    await expect(orderRow(page, 'PT-2102').locator('.rail i.on')).toHaveCount(4);
  });

  test('a row opens its own order, beside the panel that tracks it', async ({ page }) => {
    await page.goto(RECORD_SERVICES);
    await expect(orderRow(page, 'PT-2101').getByRole('link', { name: 'Open order' }))
      .toHaveAttribute('href', `/services/${TICKET.placed}`);
    await expect(page.locator('.rows.boxed').getByRole('link', { name: 'Open order' })).toHaveCount(6);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// /assigned — waiting on you
// ═══════════════════════════════════════════════════════════════════════

test.describe('Waiting on you', () => {
  test('only the jobs sitting on my decision are here', async ({ page }) => {
    await page.goto('/assigned');

    await expect(page.getByRole('heading', { name: 'Waiting on you' })).toBeVisible();
    await expect(page.getByText('Needs your action')).toHaveCount(0);

    // One of the eight: the delivered job with two things to review.
    await expect(page.locator('.rows.boxed > div')).toHaveCount(1);
    await expect(orderRow(page, 'PT-2105')).toContainText('2 to review');
    // A job placed with nobody on it is not waiting on anybody.
    await expect(orderRow(page, 'PT-2101')).toHaveCount(0);
    await expect(orderRow(page, 'PT-2102')).toHaveCount(0);
  });

  test('a job with something to look at is waiting on me even when nothing is flagged', async ({ page, world }) => {
    // Two ways onto this list, and Assigned() (Orders.tsx:368) takes either:
    // the server's `needsYou` flag, or deliverables nobody has looked at.
    world.set('orders', ordersAnswer(ORDERS.map((o) => {
      if (o.id === TICKET.needsYou) return { ...o, needsYou: false, pendingReview: 0 };
      if (o.id === TICKET.onSite) return { ...o, pendingReview: 3 };
      if (o.id === TICKET.delivered) return { ...o, needsYou: true };
      return o;
    })));
    await page.goto('/assigned');

    await expect(page.locator('.rows.boxed > div')).toHaveCount(2);
    await expect(orderRow(page, 'PT-2103')).toContainText('3 to review');
    // The server's flag reads as the ticket machine's word for that state.
    await expect(orderRow(page, 'PT-2104')).toContainText('Waiting on you');
    // The row that was on the list only because the seed flagged it is gone.
    await expect(orderRow(page, 'PT-2105')).toHaveCount(0);
  });

  test('the page that says what is waiting never asks for finished work', async ({ page, world }) => {
    await page.goto('/assigned');
    await expect(orderRow(page, 'PT-2105')).toBeVisible();

    // Every read on this route — the page's and the Shell badge's, which share
    // the key — asks for the open list across every record.
    expect(world.calls('orders').map((c) => c.vars))
      .toContainEqual({ recordId: null, includeClosed: false });
    expect(world.calls('orders').every((c) => c.vars.includeClosed === false)).toBe(true);
  });

  test('this page names the record each job is against, because the list crosses records', async ({ page }) => {
    await page.goto('/assigned');
    await expect(orderRow(page, 'PT-2105').getByRole('link', { name: 'Sy 214/2' }))
      // A job's property opens on its Services tab, where the job is.
      .toHaveAttribute('href', `/properties/${ID.parcel}/services`);
  });

  test('the Open and Everything chips are gone, because a finished job is not waiting on anybody', async ({ page }) => {
    await page.goto('/assigned');
    await expect(page.getByRole('button', { name: 'All' })).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Order a service' })).toHaveCount(0);
  });

  test('with nothing waiting it says so, and points at everything I have ordered', async ({ page, world }) => {
    world.set('orders', OPEN_ORDERS.filter((o) => !o.needsYou && o.pendingReview === 0));
    await page.goto('/assigned');

    await expect(page.getByText('Nothing is waiting on you')).toBeVisible();
    // Not the Services empty state: this list asks a different question.
    await expect(page.getByText('No open orders')).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'All your service orders' }))
      .toHaveAttribute('href', '/services');
  });

  test('while it loads it does not say nothing is waiting on you', async ({ page, world }) => {
    world.set('orders', World.never());
    await page.goto('/assigned');

    await expect(page.getByRole('status', { name: 'Loading the orders waiting on you' })).toBeVisible();
    await expect(page.getByText('Nothing is waiting on you')).toHaveCount(0);
  });

  test('a read that failed here is named as a failure, not as an empty inbox', async ({ page, world }) => {
    world.set('orders', World.gqlError('the work queue is down'));
    await page.goto('/assigned');

    await expect(page.getByRole('alert').filter({ hasText: 'Work waiting on you did not load' }))
      .toBeVisible();
    await expect(page.getByText('Nothing is waiting on you')).toHaveCount(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// /properties/:id/services
// ═══════════════════════════════════════════════════════════════════════

test.describe("A record's services", () => {
  test('the record’s own list asks for that record’s work and nobody else’s', async ({ page, world }) => {
    await page.goto(`/properties/${ID.parcel}/services`);

    await expect(page.getByRole('heading', { name: 'Service orders' })).toBeVisible();
    // The same sentence the order flow one click away says, and the service
    // says on arrival: placing an order takes nothing from anybody. It is a
    // standing condition, so it sits behind the heading's ⓘ.
    await expect(page.getByRole('button', { name: 'About Service orders' }))
      .toHaveAccessibleDescription('You pay only after you accept the work.');
    await expect(page.getByRole('heading', { level: 1, name: 'Sy 214/2' })).toBeVisible();

    await expect.poll(() => world.calls('orders').map((c) => c.vars))
      .toContainEqual({ recordId: ID.parcel, includeClosed: false });
    await expect(page.locator('.rows.boxed > div')).toHaveCount(6);
    // No record name on the rows: every one of them is this record's.
    await expect(orderRow(page, 'PT-2102').getByRole('link', { name: 'Sy 214/2' })).toHaveCount(0);
  });

  test('ordering from a record already knows which property it is for', async ({ page }) => {
    await page.goto(`/properties/${ID.parcel}/services`);
    // One way in: the property header's "Order a service", which is on every
    // tab. The tab's own copy of it, under its heading, was the same link a
    // few centimetres lower and is gone; the tab's head link goes to the list
    // of every service order instead.
    await expect(page.locator('header.pagehead').getByRole('link', { name: 'Order a service' }))
      .toHaveAttribute('href', `/order?for=${ID.parcel}&step=services`);
    await expect(page.locator('header.sechead').getByRole('link', { name: 'Order a service' })).toHaveCount(0);
    await expect(page.locator('header.sechead').getByRole('link', { name: 'All your service orders' }))
      .toHaveAttribute('href', '/services');
  });

  test('a record whose work is all done can still be asked what it cost', async ({ page, world }) => {
    await page.goto(`/properties/${ID.parcel}/services`);
    await page.getByRole('button', { name: 'All' }).click();

    await expect.poll(() => world.calls('orders').some(
      (c) => c.vars.recordId === ID.parcel && c.vars.includeClosed === true,
    )).toBe(true);
    expect(world.lastVars('orders')).toMatchObject({ recordId: ID.parcel, includeClosed: true });
    await expect(orderRow(page, 'PT-2098')).toContainText('Accepted');
  });

  test('a record nothing has been ordered against says so', async ({ page }) => {
    await page.goto(`/properties/${ID.plot}/services`);

    await expect(page.getByText('No open orders')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Open', exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'All' })).toBeVisible();
  });

  test('a record with nothing open can be asked what it has ever ordered, from the empty state itself', async ({ page, world }) => {
    // The one question an empty Open list raises, answered by the button inside
    // the empty state rather than by a filter chip over an empty box.
    world.set('orders', ordersAnswer(ORDERS.filter((o) => o.status === 'accepted' || o.status === 'cancelled')));
    await page.goto(`/properties/${ID.parcel}/services`);
    await expect(page.getByText('No open orders')).toBeVisible();

    await page.getByRole('button', { name: 'All' }).click();

    await expect.poll(() => world.calls('orders').some(
      (c) => c.vars.recordId === ID.parcel && c.vars.includeClosed === true,
    )).toBe(true);
    await expect(orderRow(page, 'PT-2098')).toContainText('Accepted');
    await expect(orderRow(page, 'PT-2099')).toContainText('Cancelled');
    // And now there is somewhere to go back to, so the chips are on screen.
    await expect(page.getByRole('button', { name: 'Open', exact: true })).toBeVisible();
  });

  test('a record’s services still loading does not read as a record that never ordered anything', async ({ page, world }) => {
    world.set('orders', World.never());
    await page.goto(`/properties/${ID.parcel}/services`);

    // The waiting word names what it waits for, in the failure's own words
    // ("This property's service orders did not load").
    await expect(page.getByRole('status', { name: "Loading this property's service orders" })).toBeVisible();
    await expect(page.getByText('No open orders')).toHaveCount(0);
  });

  test('a record’s services that did not load says so in that record’s words', async ({ page, world }) => {
    world.set('orders', World.gqlError('the work queue is down'));
    await page.goto(`/properties/${ID.parcel}/services`);

    await expect(page.getByRole('alert').filter({ hasText: "This property's service orders did not load" }))
      .toBeVisible();
    // And not the empty state — an outage is not an answer about this record.
    await expect(page.getByText('No open orders')).toHaveCount(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// /properties/:id/activity — what has been corrected
// ═══════════════════════════════════════════════════════════════════════

test.describe("A record's audit", () => {
  // The tab is the property's Activity now (Orders.tsx RecordHistory): it
  // reads `recordHistory`, not `corrections`, and words every row with the
  // same table Account → Activity uses. A correction is the event
  // `record.corrected` carrying field / was / now. The world answers
  // `recordHistory` with [] by default, so these scenarios seed their own.
  const corrected = (over: Record<string, unknown>) => ({
    id: 'w-ev-x', action: 'record.corrected', detail: '', field: 'Khata number',
    was: '1041', now: '1042', at: '2026-08-20T06:00:00Z', by: 'Shankar Reddy', ...over,
  });
  const TRAIL = CORRECTIONS.map((c, i) => corrected({
    id: `w-ev-${i + 1}`, field: c.field, was: c.was, now: c.now, at: `${c.at}T06:00:00Z`, by: c.by,
  }));

  test('every correction is kept, with what the value used to be beside what it is now', async ({ page, world }) => {
    world.set('recordHistory', TRAIL);
    await page.goto(`/properties/${ID.parcel}/activity`);

    // V3: the heading repeats the tab name.
    await expect(page.getByRole('heading', { level: 2, name: 'Activity', exact: true })).toBeVisible();
    await expect(page.getByText(`${CORRECTIONS.length} changes`, { exact: true })).toBeVisible();
    expect(world.lastVars('recordHistory')).toMatchObject({ id: ID.parcel });

    await expect(page.locator('.rows.boxed > div')).toHaveCount(CORRECTIONS.length);
    const khata = page.locator('.rows.boxed > div').filter({ hasText: 'Khata number' });
    await expect(khata).toContainText('1042');
    await expect(khata.locator('s')).toHaveText('1041');
    // U4: DD/MM/YYYY.
    await expect(khata).toContainText('20/08/2026');
    await expect(khata).toContainText('Shankar Reddy');
  });

  test('a property nothing has changed on says so', async ({ page }) => {
    await page.goto(`/properties/${ID.flat}/activity`);

    await expect(page.getByText('No activity recorded yet')).toBeVisible();
    await expect(page.locator('main s')).toHaveCount(0);
  });

  test('a value that had nothing in it before is shown as a dash, not as a blank', async ({ page, world }) => {
    // `<s>{e.was || '—'}</s>` (Orders.tsx RecordHistory). A struck blank reads
    // as a rendering fault; the dash says the field was empty until this change.
    world.set('recordHistory', [corrected({ was: '', now: '1042', at: '2026-09-01T05:00:00Z' })]);
    await page.goto(`/properties/${ID.parcel}/activity`);

    const row = page.locator('.rows.boxed > div').filter({ hasText: 'Khata number' });
    await expect(row.locator('s')).toHaveText('—');
    await expect(row).toContainText('1042');
    await expect(row).toContainText('01/09/2026');
  });

  test('a value that was cleared is shown as a dash on the new side too', async ({ page, world }) => {
    // The mirror of the struck side: `{e.now || '—'}`. A khata that was
    // REMOVED must read "1041 → —"; a line that stops at the arrow reads as a
    // half-drawn row, not as a deletion.
    world.set('recordHistory', [corrected({ was: '1041', now: '', at: '2026-09-02T05:00:00Z' })]);
    await page.goto(`/properties/${ID.parcel}/activity`);

    const row = page.locator('.rows.boxed > div').filter({ hasText: 'Khata number' });
    await expect(row.locator('s')).toHaveText('1041');
    await expect(row).toContainText('1041 → —');
    await expect(row).toContainText('02/09/2026');
  });

  test('the list says it is loading rather than saying nothing has changed', async ({ page, world }) => {
    world.set('recordHistory', World.never());
    await page.goto(`/properties/${ID.parcel}/activity`);

    await expect(page.getByRole('status', { name: "Loading this property's activity" })).toBeVisible();
    await expect(page.getByText('No activity recorded yet')).toHaveCount(0);
  });

  // Was a DEFECT (a failed corrections read said "nothing has been
  // corrected"). RecordHistory now branches on `!data` to <Failed>.
  test('a read that failed is not reported as nothing to report', async ({ page, world }) => {
    world.set('recordHistory', World.gqlError('the audit store is down'));
    await page.goto(`/properties/${ID.parcel}/activity`);

    const failed = page.getByRole('alert').filter({ hasText: "This property's activity did not load" });
    await expect(failed).toBeVisible({ timeout: 20_000 });
    await expect(failed).toContainText('the audit store is down');
    await expect(page.getByText('No activity recorded yet')).toHaveCount(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// /order — one flow: properties, services, review
// ═══════════════════════════════════════════════════════════════════════

/** The flow's step list (OrderTracker: an `<ol>` with `aria-current="step"`). */
const steps = (page: Page) => page.getByRole('list', { name: 'Order steps' });
const currentStep = (page: Page) => steps(page).locator('li[aria-current="step"]');
/** One property card in the grid; its tick box is named "Include <title>". */
const landCard = (page: Page, title: string) =>
  page.locator('main .cards > div.rec').filter({ hasText: title });
const landCards = (page: Page) => page.locator('main .cards > div.rec');
const include = (page: Page, title: string) => page.getByRole('checkbox', { name: `Include ${title}` });
const landTable = (page: Page) => page.getByRole('table', { name: 'Your properties' });
const svcTable = (page: Page) => page.getByRole('table', { name: 'Services offered there' });
const svcRows = (page: Page) => svcTable(page).locator('tbody tr[data-key]');
const svcRow = (page: Page, label: string) => svcRows(page).filter({ hasText: label });
const pickSvc = (page: Page, label: string) => page.getByRole('checkbox', { name: `Choose ${label}` });
const summary = (page: Page) => page.getByRole('table', { name: 'What will be ordered' });
const line = (page: Page, key: string, id: string) => summary(page).locator(`tr[data-line="${key}:${id}"]`);
const bar = (page: Page, name: string) => page.getByRole('group', { name });

/** `orderService` answered the way the server does: one order per record. */
const filesAll = (vars: Record<string, unknown>) => (vars.recordIds as string[]).length;

/** Straight to the services step for these properties, as the record's own
 *  "Order a service" lands. */
const toServices = async (page: Page, ...recordIds: string[]) => {
  await page.goto(`/order?for=${recordIds.join(',')}&step=services`);
  await expect(svcRows(page).first()).toBeVisible();
};
/** On to the review with these services chosen. */
const toReview = async (page: Page, labels: string[], ...recordIds: string[]) => {
  await toServices(page, ...recordIds);
  for (const l of labels) await pickSvc(page, l).check();
  await page.getByRole('button', { name: 'Next: review' }).click();
  await expect(page.getByRole('heading', { name: 'Review and place' })).toBeVisible();
};

test.describe('Ordering: choosing the properties', () => {
  test('the flow opens on step one of three, and composes nothing yet', async ({ page, world }) => {
    await page.goto('/order');

    await expect(page.getByRole('heading', { level: 1, name: 'Order a service' })).toBeVisible();
    await expect(steps(page).getByRole('listitem')).toHaveText([/Properties/, /Services/, /Review/]);
    await expect(currentStep(page)).toContainText('Properties');
    await expect(page.getByRole('heading', { name: 'Choose the properties' })).toBeVisible();
    // The archived shop is not land anybody orders work on.
    await expect(landCards(page)).toHaveCount(4);
    await expect(landCard(page, 'Shop 7, Market Road')).toHaveCount(0);
    // No services on this step, and nothing filed.
    await expect(svcTable(page)).toHaveCount(0);
    expect(world.asked('servicesForRecords')).toBe(false);
    expect(world.calls('orderService')).toHaveLength(0);
    // The bar, and its Next, wait for a choice.
    await expect(bar(page, 'The chosen properties')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Next: choose services' })).toHaveCount(0);
  });

  test('each card says how big the land is, its khata, whether anybody can find it, and what is running there', async ({ page }) => {
    await page.goto('/order');

    const parcel = landCard(page, 'Sy 214/2');
    await expect(parcel).toContainText('Katragunta, Markapur, Prakasam');
    await expect(parcel).toContainText('4 acres 12 guntas');
    await expect(parcel).toContainText('Khata 1042');
    await expect(parcel).toContainText('Boundary on map');
    await expect(parcel).toContainText('6 orders already running here');
    await expect(landCard(page, 'Flat 4B, Sai Residency')).toContainText('Location pin only');
    await expect(landCard(page, 'Flat 4B, Sai Residency')).not.toContainText('Khata');
    await expect(landCard(page, 'Sy 88')).toContainText('Add a location to show on map');
    await expect(landCard(page, 'Sy 88')).not.toContainText('already running here');
  });

  test('the whole card ticks its box, and the bar counts the choice', async ({ page }) => {
    await page.goto('/order');
    await landCard(page, 'Sy 214/2').locator('label').click();
    await landCard(page, 'Sy 88').locator('label').click();

    await expect(include(page, 'Sy 214/2')).toBeChecked();
    await expect(bar(page, 'The chosen properties')).toContainText('2 properties selected');
    await bar(page, 'The chosen properties').getByRole('button', { name: 'Clear' }).click();
    await expect(include(page, 'Sy 214/2')).not.toBeChecked();
    await expect(page.getByRole('button', { name: 'Next: choose services' })).toHaveCount(0);
  });

  test('the table view lists the same land with a box per row, and the header box takes everything shown', async ({ page }) => {
    await page.goto('/order');
    await page.getByRole('button', { name: 'Table' }).click();

    const rows = landTable(page).locator('tbody tr');
    await expect(rows).toHaveCount(4);
    await expect(landTable(page).locator('thead')).toContainText(/Property.*Place.*Extent.*Khata.*Orders running/i);
    await expect(rows.filter({ hasText: 'Sy 214/2' })).toContainText('1042');
    await expect(rows.filter({ hasText: 'Sy 214/2' }).locator('td').last()).toHaveText('6');

    // A row click toggles, like its box.
    await rows.filter({ hasText: 'Sy 88' }).locator('td').nth(2).click();
    await expect(page.getByRole('checkbox', { name: 'Select Sy 88' })).toBeChecked();

    await page.getByRole('checkbox', { name: 'Select all 4 properties' }).check();
    await expect(bar(page, 'The chosen properties')).toContainText('4 properties selected');
    await page.getByRole('checkbox', { name: 'Select all 4 properties' }).uncheck();
    await expect(bar(page, 'The chosen properties')).toHaveCount(0);
  });

  test('select all takes only what the search left on screen', async ({ page }) => {
    await page.goto('/order');
    await page.getByRole('button', { name: 'Table' }).click();
    await page.getByLabel('Find your property').fill('Katragunta');

    await expect(page.getByText('2 of 4 shown')).toBeVisible();
    await page.getByRole('checkbox', { name: 'Select all 2 properties' }).check();
    await expect(bar(page, 'The chosen properties')).toContainText('2 properties selected');
    await expect(page).toHaveURL(/q=Katragunta/);
  });

  test('the village filter narrows the land, and says how many are shown', async ({ page }) => {
    await page.goto('/order');
    await page.getByRole('button', { name: '+ Filter' }).click();
    await page.getByRole('button', { name: /^Katragunta/ }).click();

    await expect(landCards(page)).toHaveCount(2);
    await expect(page.getByText('2 of 4 shown')).toBeVisible();
    await page.getByRole('button', { name: 'Remove filter Village Katragunta' }).click();
    await expect(landCards(page)).toHaveCount(4);
  });

  test('a search that matches nothing says so, and offers to clear itself', async ({ page }) => {
    await page.goto('/order');
    await page.getByLabel('Find your property').fill('Vizag');

    await expect(page.getByText('No property matches “Vizag”')).toBeVisible();
    await page.getByRole('button', { name: 'Clear', exact: true }).click();
    await expect(landCards(page)).toHaveCount(4);
  });

  test('a link can arrive with the land already chosen', async ({ page }) => {
    await page.goto(`/order?for=${ID.parcel},${ID.plot}`);

    await expect(include(page, 'Sy 214/2')).toBeChecked();
    await expect(include(page, 'Sy 88')).toBeChecked();
    await expect(bar(page, 'The chosen properties')).toContainText('2 properties selected');
  });

  test('a portfolio longer than the fold shows a batch and a way to the rest', async ({ page, world }) => {
    world.set('properties', propertyList(Array.from({ length: 30 }, (_, i) => ({
      ...CARDS[0], id: `w-many-${i}`, title: `Sy ${400 + i}`, coverFileRef: '',
    }))));
    await page.goto('/order');

    await expect(landCards(page)).toHaveCount(24);
    await page.getByRole('button', { name: 'Show all 30' }).click();
    await expect(landCards(page)).toHaveCount(30);
  });

  test('a running-orders count that could not be read is said once, and does not withhold the land', async ({ page, world }) => {
    world.set('orders', World.gqlError('the work queue is down'));
    await page.goto('/order');

    await expect(page.getByText('Existing orders could not be checked.')).toBeVisible();
    await expect(landCards(page)).toHaveCount(4);
    await expect(landCard(page, 'Sy 214/2')).not.toContainText('already running here');
  });

  test('a portfolio still arriving is not an account with no land', async ({ page, world }) => {
    world.set('properties', World.never());
    await page.goto('/order');
    await expect(page.getByRole('status', { name: 'Loading your properties' })).toBeVisible();
    await expect(page.getByText('Add a property before ordering')).toHaveCount(0);
  });

  test('a portfolio that did not load says so', async ({ page, world }) => {
    world.set('properties', World.gqlError('the portfolio read failed'));
    await page.goto('/order');
    const failed = page.getByRole('alert').filter({ hasText: 'Your properties did not load' });
    await expect(failed).toContainText('the portfolio read failed');
  });

  test('an account with no land is told to add some, and can still read the catalogue', async ({ page, world }) => {
    world.set('properties', propertyList([]));
    await page.goto('/order');

    await expect(page.getByText('Add a property before ordering')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Add a property' })).toHaveAttribute('href', '/properties?new=1');
    const table = page.getByRole('table', { name: 'Available services' });
    await expect(table.locator('tbody tr[data-key]')).toHaveCount(OFFERS.length);
    // Read-only: nothing to tick, and no steps to walk.
    await expect(table.getByRole('checkbox')).toHaveCount(0);
    await expect(steps(page)).toHaveCount(0);
  });

  test('on a phone the steps, the land and the action bar fit without sideways scrolling @phone', async ({ page, world }) => {
    world.set('orders', ordersAnswer([]));
    await page.goto('/order');
    await include(page, 'Sy 214/2').check();
    await expect(page.getByRole('button', { name: 'Next: choose services' })).toBeInViewport();
    await page.getByRole('button', { name: 'Next: choose services' }).click();
    await expect(svcRows(page).first()).toBeVisible();
    // The bar (and its Next) appears once a service is ticked.
    await pickSvc(page, 'Site visit').check();
    await expect(page.getByRole('button', { name: 'Next: review' })).toBeInViewport();
    // The document (the services table scrolls inside its own card).
    const wide = () => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(await wide()).toBeLessThanOrEqual(1);
    await page.getByRole('button', { name: 'Next: review' }).click();
    await expect(page.getByRole('heading', { name: 'Review and place' })).toBeVisible();
    expect(await wide()).toBeLessThanOrEqual(1);
  });
});

test.describe('Ordering: choosing the services', () => {
  test.beforeEach(({ world }) => { world.set('orders', ordersAnswer([])); });

  test('Next takes the chosen land to the services offered there, priced from the catalogue', async ({ page, world }) => {
    await page.goto('/order');
    await include(page, 'Sy 214/2').check();
    await page.getByRole('button', { name: 'Next: choose services' }).click();

    await expect(page).toHaveURL(/step=services/);
    await expect(currentStep(page)).toContainText('Services');
    await expect(svcRows(page)).toHaveCount(OFFERS.length);
    expect(world.lastVars('servicesForRecords')).toMatchObject({ recordIds: [ID.parcel] });
    const ec = svcRow(page, 'Encumbrance certificate');
    await expect(ec).toContainText('₹1,180');
    await expect(ec).toContainText('about 7 days');
    await expect(ec).toContainText('Records');
    // One property: no "available at" column to read.
    await expect(svcTable(page).locator('thead')).not.toContainText('Available at');
    await expect(svcTable(page).locator('img')).toHaveCount(0);
  });

  test('the recommended services come first, marked, then the rest by group', async ({ page }) => {
    await toServices(page, ID.parcel);

    const featured = OFFERS.filter((o) => (o as { featured: boolean }).featured);
    for (let i = 0; i < featured.length; i += 1) {
      await expect(svcRows(page).nth(i)).toContainText('Recommended');
    }
    await expect(svcRows(page).nth(featured.length)).not.toContainText('Recommended');
    await expect(svcRows(page).filter({ hasText: 'Recommended' })).toHaveCount(featured.length);
    // Work on the ground leads the groups, as it does across the app.
    await expect(svcRows(page).nth(0)).toContainText('On the ground');
  });

  test('several services can be chosen at once, and the header box takes them all', async ({ page }) => {
    await toServices(page, ID.parcel);
    await pickSvc(page, 'Encumbrance certificate').check();
    await svcRow(page, 'Site visit').locator('td').nth(2).click();

    await expect(pickSvc(page, 'Site visit')).toBeChecked();
    await expect(bar(page, 'The chosen services')).toContainText('2 services selected');
    await page.getByRole('checkbox', { name: /^Select all \d+ services$/ }).check();
    await expect(bar(page, 'The chosen services')).toContainText(`${OFFERS.length} services selected`);
  });

  test('the table totals what is ticked: how many, the rupees, and the longest wait', async ({ page }) => {
    await toServices(page, ID.parcel);
    const foot = svcTable(page).locator('tfoot');
    await expect(foot).toContainText('Nothing chosen yet');

    await pickSvc(page, 'Encumbrance certificate').check();
    await pickSvc(page, 'Site visit').check();
    // Read the two rows' own figures, so the sum is checked against the page.
    const fig = async (name: string, col: number) => Number(
      (await svcRow(page, name).locator('td').nth(col).innerText()).replace(/[^0-9]/g, ''));
    const sum = await fig('Encumbrance certificate', 3) + await fig('Site visit', 3);
    const days = Math.max(await fig('Encumbrance certificate', 4), await fig('Site visit', 4));
    await expect(foot).toContainText('2 services selected');
    await expect(foot).toContainText(`₹${sum.toLocaleString('en-IN')}`);
    await expect(foot).toContainText(`up to ${days} days`);
  });

  test('Next waits for a service', async ({ page }) => {
    await toServices(page, ID.parcel);
    await expect(page.getByRole('button', { name: 'Next: review' })).toHaveCount(0);
    await pickSvc(page, 'Site visit').check();
    await bar(page, 'The chosen services').getByRole('button', { name: 'Clear' }).click();
    await expect(pickSvc(page, 'Site visit')).not.toBeChecked();
    await expect(page.getByRole('button', { name: 'Next: review' })).toHaveCount(0);
  });

  test('a link can arrive with the services already chosen', async ({ page }) => {
    await page.goto(`/order?for=${ID.parcel}&service=ec,site_visit&step=services`);
    await expect(pickSvc(page, 'Encumbrance certificate')).toBeChecked();
    await expect(pickSvc(page, 'Site visit')).toBeChecked();
  });

  test('“What is this?” answers under the row, and offers the University guides', async ({ page }) => {
    await toServices(page, ID.parcel);
    await svcRow(page, 'Encumbrance certificate').getByRole('button', { name: 'What is this? Encumbrance certificate' }).click();

    const more = svcTable(page).locator('tr.svc-table-more');
    await expect(more).toContainText('Also called an EC');
    await expect(more.getByRole('link', { name: /^Andhra Pradesh: EC & deeds/ }))
      .toHaveAttribute('href', /\/states\/andhra-pradesh\/records\/encumbrance-and-deeds$/);
    // Opening it chose nothing.
    await expect(pickSvc(page, 'Encumbrance certificate')).not.toBeChecked();
  });

  test('two properties priced differently show the range and where each service is offered', async ({ page, world }) => {
    const offer = (key: string, price: number) => ({ ...(OFFERS.find((o) => o.key === key) as object), price });
    world.set('servicesForRecords', (vars: Record<string, unknown>) => (vars.recordIds as string[]).map((recordId) => ({
      recordId,
      offers: recordId === ID.plot
        ? [offer('ec', 1400), offer('site_visit', 1200)]
        : [offer('ec', 1180), offer('site_visit', 1200), offer('survey', 2900), offer('patta_copy', 450)],
    })));
    await toServices(page, ID.parcel, ID.plot);

    await expect(svcRow(page, 'Encumbrance certificate')).toContainText('₹1,180–₹1,400 each');
    await expect(svcRow(page, 'Site visit')).toContainText('₹1,200 each');
    await expect(svcRow(page, 'Encumbrance certificate')).toContainText('All');
    await expect(svcRow(page, 'Certified patta copy')).toContainText('1 of 2');
  });

  test('a service whose answers belong to one boundary is shut when several properties are chosen', async ({ page }) => {
    await toServices(page, ID.parcel, ID.plot);

    await expect(pickSvc(page, 'Boundary re-survey')).toBeDisabled();
    await expect(svcRow(page, 'Boundary re-survey')).toContainText('Ordered one property at a time');
    await expect(pickSvc(page, 'Encumbrance certificate')).toBeEnabled();
  });

  test('…and open again for one property', async ({ page }) => {
    await toServices(page, ID.plot);
    await expect(pickSvc(page, 'Boundary re-survey')).toBeEnabled();
  });

  test('a service already on order for every chosen property says so, links it, and cannot be chosen', async ({ page, world }) => {
    world.set('orders', ordersAnswer(OPEN_ORDERS));
    await toServices(page, ID.parcel);

    const ec = svcRow(page, 'Encumbrance certificate');
    await expect(pickSvc(page, 'Encumbrance certificate')).toBeDisabled();
    await expect(ec).toContainText('Already on order');
    await expect(pickSvc(page, 'Site visit')).toBeEnabled();
  });

  test('services still arriving are not services with nothing in them', async ({ page, world }) => {
    world.set('servicesForRecords', World.never());
    await page.goto(`/order?for=${ID.parcel}&step=services`);
    await expect(page.getByRole('status', { name: 'Loading the services offered there' })).toBeVisible();
    await expect(page.getByText('No service is offered there yet')).toHaveCount(0);
  });

  test('services that did not load are named where they failed', async ({ page, world }) => {
    world.set('servicesForRecords', World.gqlError('the catalogue service is down'));
    await page.goto(`/order?for=${ID.parcel}&step=services`);
    const failed = page.getByRole('alert').filter({ hasText: 'The services offered there did not load' });
    await expect(failed).toContainText('the catalogue service is down');
  });

  test('land where nothing is offered yet says so', async ({ page, world }) => {
    world.set('servicesForRecords', (vars: Record<string, unknown>) =>
      (vars.recordIds as string[]).map((recordId) => ({ recordId, offers: [] })));
    await page.goto(`/order?for=${ID.parcel}&step=services`);
    await expect(page.getByText('Pattadar does not offer services where this property is yet.')).toBeVisible();
  });

  test('Back keeps the land and the services chosen, both ways', async ({ page }) => {
    await page.goto('/order');
    await include(page, 'Sy 214/2').check();
    await page.getByRole('button', { name: 'Next: choose services' }).click();
    await pickSvc(page, 'Encumbrance certificate').check();

    // The finished step is a button back.
    await steps(page).getByRole('button', { name: 'Properties' }).click();
    await expect(include(page, 'Sy 214/2')).toBeChecked();
    // The browser's own Back walks forward again… and Forward, and Back.
    await page.goBack();
    await expect(pickSvc(page, 'Encumbrance certificate')).toBeChecked();
    await page.getByRole('button', { name: 'Next: review' }).click();
    await bar(page, 'Place the orders').getByRole('button', { name: 'Back' }).click();
    await expect(pickSvc(page, 'Encumbrance certificate')).toBeChecked();
  });

  test('a later step reached with nothing chosen goes back to the choosing', async ({ page }) => {
    await page.goto('/order?step=review');
    await expect(page).toHaveURL(/step=properties/);
    await expect(page.getByRole('heading', { name: 'Choose the properties' })).toBeVisible();
  });
});

test.describe('Ordering: review and place', () => {
  test.beforeEach(({ world }) => {
    world.set('orders', ordersAnswer([]));
    world.set('orderService', filesAll);
  });

  test('the review prices every line and totals them, and says nothing is charged now', async ({ page }) => {
    await toReview(page, ['Encumbrance certificate', 'Certified patta copy'], ID.parcel, ID.plot);

    await expect(currentStep(page)).toContainText('Review');
    await expect(line(page, 'ec', ID.parcel)).toContainText('₹1,180');
    await expect(line(page, 'patta_copy', ID.plot)).toContainText('₹450');
    await expect(summary(page)).toContainText('4 new orders');
    await expect(summary(page)).toContainText('₹3,260');
    await expect(page.getByText('Nothing is charged now. You pay only after you accept the work.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Place 4 orders · ₹3,260' })).toBeEnabled();
  });

  test('placing files one order per service, each for every property, each with its own key', async ({ page, world }) => {
    await toReview(page, ['Encumbrance certificate', 'Site visit'], ID.parcel, ID.plot);
    await page.getByLabel('What to check').selectOption('Crop');
    // Sy 88 cannot be found from what is saved, so who to meet is required.
    await page.getByLabel('Who to meet on site').fill('Ramana at the gate');
    await page.getByRole('button', { name: 'Place 4 orders · ₹4,760' }).click();

    await expect(page).toHaveURL('/services');
    const calls = world.calls('orderService').map((c) => c.vars);
    expect(calls).toHaveLength(2);
    expect(calls.map((v) => v.kind).sort()).toEqual(['ec', 'site_visit']);
    for (const v of calls) expect(v.recordIds).toEqual([ID.parcel, ID.plot]);
    const visit = calls.find((v) => v.kind === 'site_visit')!;
    expect(JSON.parse(String(visit.params))).toEqual({ check: 'Crop', meet: 'Ramana at the gate' });
    expect(String(calls[0].idempotencyKey)).toMatch(UUID);
    expect(calls[0].idempotencyKey).not.toBe(calls[1].idempotencyKey);
    // Several properties: nothing attached.
    expect(JSON.parse(String(visit.attachmentManifest))).toEqual({});
  });

  test('a required question left empty stops the order, named at the question and at the button', async ({ page, world }) => {
    await toReview(page, ['Site visit'], ID.parcel);
    await page.getByRole('button', { name: /^Place 1 order/ }).click();

    await expect(page.getByLabel('What to check')).toHaveAttribute('aria-invalid', 'true');
    await expect(page.getByRole('alert').filter({ hasText: 'Still needed: Site visit: What to check.' })).toBeVisible();
    expect(world.calls('orderService')).toHaveLength(0);
  });

  test('each service asks its own questions once, and the required ones are announced', async ({ page }) => {
    await toReview(page, ['Encumbrance certificate', 'Site visit'], ID.parcel, ID.plot);

    await expect(page.getByLabel('What it is for')).toHaveCount(1);
    await expect(page.getByLabel('What to check')).toHaveAttribute('aria-required', 'true');
    await expect(page.getByLabel('From year')).not.toHaveAttribute('aria-required', 'true');
    // Said once, behind the heading's ⓘ — not printed under every service.
    await expect(page.getByRole('button', { name: 'About Review and place' })).toHaveAccessibleDescription(
      'Each answer goes on every chosen property’s order.');
    await expect(page.getByText('These answers go on every property’s order.')).toHaveCount(0);
    // The short answers sit side by side, not one full-width row each.
    const from = await page.getByLabel('From year').boundingBox();
    const to = await page.getByLabel('To year').boundingBox();
    expect(Math.abs(from!.y - to!.y)).toBeLessThan(4);
  });

  test('a property nobody can find is asked how to get there, and that answer becomes required', async ({ page, world }) => {
    await toReview(page, ['Boundary re-survey'], ID.plot);

    await expect(page.getByText('No boundary on record for Sy 88.')).toBeVisible();
    const notes = page.getByLabel('Anything the surveyor should know');
    await expect(notes).toHaveAttribute('aria-required', 'true');
    await page.getByLabel('Which boundary').selectOption('North');
    await page.getByLabel('Is a neighbour disputing it?').selectOption('No');
    await page.getByRole('button', { name: /^Place 1 order/ }).click();
    await expect(page.getByRole('alert').filter({ hasText: 'Anything the surveyor should know' })).toBeVisible();
    expect(world.calls('orderService')).toHaveLength(0);
  });

  test('one property: its documents and photos can be sent, and go with the order by name', async ({ page, world }) => {
    await toReview(page, ['Encumbrance certificate'], ID.parcel);

    const files = page.locator('section.card').filter({ has: page.getByRole('heading', { name: 'Files to share with the provider' }) });
    await expect(files).toContainText('Documents ·');
    await files.getByRole('checkbox', { name: /Sale deed 4412 of 1998/ }).check();
    await page.getByRole('button', { name: 'Place 1 order · ₹1,180' }).click();

    await expect(page).toHaveURL('/services');
    const vars = world.lastVars('orderService');
    expect(vars.recordIds).toEqual([ID.parcel]);
    expect(JSON.parse(String(vars.attachmentManifest))).toMatchObject({ documentIds: [PAPER.deed], photoIds: [] });
    expect(JSON.parse(String(vars.params))).toMatchObject({ shared: 'Sale deed 4412 of 1998' });
  });

  test('several properties: no files are offered, because they belong to one property', async ({ page }) => {
    await toReview(page, ['Encumbrance certificate'], ID.parcel, ID.plot);
    await expect(page.getByRole('heading', { name: 'Files to share with the provider' })).toHaveCount(0);
  });

  test('a property already running a service is left out of that line, with its order to open', async ({ page, world }) => {
    world.set('orders', ordersAnswer(OPEN_ORDERS));
    await toReview(page, ['Site visit'], ID.parcel, ID.plot);
    // Encumbrance certificate is running on Sy 214/2, not on Sy 88.
    await steps(page).getByRole('button', { name: 'Services' }).click();
    await pickSvc(page, 'Encumbrance certificate').check();
    await page.getByRole('button', { name: 'Next: review' }).click();

    await expect(line(page, 'ec', ID.parcel)).toContainText('Already on order');
    await expect(line(page, 'ec', ID.parcel).getByRole('link', { name: 'Open order' }))
      .toHaveAttribute('href', /\/services\//);
    await expect(line(page, 'ec', ID.plot)).toContainText('₹1,180');
    await expect(summary(page)).toContainText('3 new orders');
  });

  test('when one service is refused the others are still placed, and the review says which', async ({ page, world }) => {
    world.set('orderService', (vars: Record<string, unknown>) => (vars.kind === 'site_visit' ? 0 : filesAll(vars)));
    await toReview(page, ['Encumbrance certificate', 'Site visit'], ID.parcel);
    await page.getByLabel('What to check').selectOption('Crop');
    await page.getByRole('button', { name: /^Place 2 orders/ }).click();

    await expect(page.getByRole('alert').filter({ hasText: '1 of 2 placed; Site visit could not be placed — try again.' })).toBeVisible();
    await expect(page).toHaveURL(/step=review/);
    await expect(page.getByRole('alert').filter({ hasText: 'If one shows under Services' })).toBeVisible();
    // Trying again sends only what did not go. The server answered 0 on purpose
    // and stored it under that key, so the retry goes under a fresh one.
    const first = world.calls('orderService').find((c) => c.vars.kind === 'site_visit')!.vars.idempotencyKey;
    world.set('orderService', filesAll);
    await page.getByRole('button', { name: /^Place 1 order/ }).click();
    await expect(page).toHaveURL('/services');
    const kinds = world.calls('orderService').map((c) => c.vars.kind);
    expect(kinds).toEqual(['ec', 'site_visit', 'site_visit']);
    expect(world.calls('orderService')[2].vars.idempotencyKey).not.toBe(first);
  });

  test('nothing can be placed while what is already running cannot be checked', async ({ page, world }) => {
    world.set('orders', World.gqlError('the work queue is down'));
    await page.goto(`/order?for=${ID.parcel}&service=ec&step=review`);

    await expect(page.getByText('Existing orders could not be checked, so nothing can be placed yet.')).toBeVisible();
    await expect(page.getByRole('button', { name: /^Place 1 order/ })).toBeDisabled();
  });
});

test.describe('Ordering: an order that never came back', () => {
  // The refused request is the point.
  test.use({ allowConsole: true });

  test('an order that never came back is reported, and points at Services before ordering again', async ({ page, world }) => {
    world.set('orders', ordersAnswer([]));
    world.set('orderService', World.gqlError('gateway timed out'));
    await toReview(page, ['Encumbrance certificate'], ID.parcel);
    await page.getByRole('button', { name: /^Place 1 order/ }).click();

    const alert = page.getByRole('alert').filter({ hasText: '0 of 1 placed; Encumbrance certificate could not be placed' });
    await expect(alert).toContainText('If one shows under Services, it was placed');
  });

});

test.describe('Ordering from a property', () => {
  test('a property’s own order address opens the flow with that property chosen, on its services', async ({ page }) => {
    await page.goto(`/order?for=${ID.parcel}&step=services`);

    await expect(page.getByRole('heading', { name: 'Choose the services' })).toBeVisible();
    await expect(currentStep(page)).toContainText('Services');
    await expect(page.getByRole('group', { name: 'Ordering for' })).toContainText('Sy 214/2');
    await expect(page.getByText(/^1 property · \d+ services? offered$/)).toBeVisible();
  });

  test('the strip of chosen properties names each, drops one, and goes back to change them', async ({ page }) => {
    await toServices(page, ID.parcel, ID.plot);
    const strip = page.getByRole('group', { name: 'Ordering for' });
    await expect(strip.locator('.fchip')).toHaveCount(2);
    await expect(strip).toContainText('Sy 214/2');
    await expect(strip).toContainText('Sy 88');
    await expect(page.getByText(/^2 properties · \d+ services? offered$/)).toBeVisible();

    await strip.getByRole('button', { name: 'Remove Sy 88' }).click();
    await expect(strip.locator('.fchip')).toHaveCount(1);
    await expect(strip).not.toContainText('Sy 88');
    await expect(page.getByText(/^1 property · \d+ services? offered$/)).toBeVisible();
    // The last one cannot be dropped: an order is always for something.
    await expect(strip.getByRole('button', { name: /^Remove / })).toHaveCount(0);

    await strip.getByRole('button', { name: 'Change' }).click();
    await expect(page).toHaveURL(/step=properties/);
    await expect(currentStep(page)).toContainText('Properties');
  });

  test('the service, the reason and a handed-over answer ride along on the order address', async ({ page, world }) => {
    world.set('orders', ordersAnswer([]));
    world.set('orderService', filesAll);
    await page.goto(`/order?for=${ID.parcel}&step=services&service=site_visit&a.check=General+condition&why=photos`);

    await expect(pickSvc(page, 'Site visit')).toBeChecked();
    await page.getByRole('button', { name: 'Next: review' }).click();
    await expect(page.getByLabel('What to check')).toHaveValue('General condition');
    await page.getByRole('button', { name: /^Place 1 order/ }).click();
    await expect(page).toHaveURL('/services');
    expect(world.lastVars('orderService')).toMatchObject({ kind: 'site_visit', note: 'Asked for from the photos' });
  });
});

test.describe('Ordering: the edges of the flow', () => {
  test.beforeEach(({ world }) => {
    world.set('orders', ordersAnswer([]));
    world.set('orderService', filesAll);
  });

  test('an order the server refuses because it is already running is reported as on order, not as a failure', async ({ page, world }) => {
    // Placed from another tab after this page read the open orders.
    world.set('orderService', (vars: Record<string, unknown>, _q: string, w: World) => {
      w.set('orders', ordersAnswer(OPEN_ORDERS));
      return vars.kind === 'ec' ? 0 : filesAll(vars);
    });
    await toReview(page, ['Encumbrance certificate'], ID.parcel);
    await page.getByRole('button', { name: 'Place 1 order · ₹1,180' }).click();

    await expect(page).toHaveURL('/services');
    await expect(page.locator('.toast').filter({ hasText: 'Encumbrance certificate was already on order' })).toBeVisible();
  });

  test('a review reached by link waits for the catalogue, and says so when it fails', async ({ page, world }) => {
    world.set('servicesForRecords', World.never());
    await page.goto(`/order?for=${ID.parcel}&service=ec&step=review`);
    await expect(page.getByRole('status', { name: 'Loading the services offered there' })).toBeVisible();

    world.set('servicesForRecords', World.gqlError('the catalogue service is down'));
    await page.reload();
    await expect(page.getByRole('alert').filter({ hasText: 'The services offered there did not load' })).toBeVisible();
  });

  test('one property can still ask a provider the owner works with; several cannot', async ({ page, world }) => {
    await toServices(page, ID.parcel);
    await expect(page.getByRole('link', { name: 'Ask a provider you already work with.' }))
      .toHaveAttribute('href', `/properties/${ID.parcel}/request`);

    await toServices(page, ID.parcel, ID.plot);
    await expect(page.getByRole('link', { name: 'Ask a provider you already work with.' })).toHaveCount(0);

    world.set('servicesForRecords', (vars: Record<string, unknown>) =>
      (vars.recordIds as string[]).map((recordId) => ({ recordId, offers: [] })));
    await page.goto(`/order?for=${ID.parcel}&step=services`);
    await expect(page.getByRole('link', { name: 'Ask your own provider' }))
      .toHaveAttribute('href', `/properties/${ID.parcel}/request`);
  });

  test('files ticked for one property are not counted for another', async ({ page }) => {
    await toReview(page, ['Encumbrance certificate'], ID.parcel);
    const files = page.locator('section.card').filter({ has: page.getByRole('heading', { name: 'Files to share with the provider' }) });
    await files.getByRole('checkbox', { name: /Sale deed 4412 of 1998/ }).check();
    await expect(files).toContainText(/1 of \d+/);

    await steps(page).getByRole('button', { name: 'Properties' }).click();
    await include(page, 'Sy 214/2').uncheck();
    await include(page, 'Sy 88').check();
    await page.getByRole('button', { name: 'Next: choose services' }).click();
    await page.getByRole('button', { name: 'Next: review' }).click();
    await expect(files).toContainText(/0 of \d+/);

    await steps(page).getByRole('button', { name: 'Properties' }).click();
    await include(page, 'Sy 88').uncheck();
    await include(page, 'Sy 214/2').check();
    await page.getByRole('button', { name: 'Next: choose services' }).click();
    await page.getByRole('button', { name: 'Next: review' }).click();
    await expect(files.getByRole('checkbox', { name: /Sale deed 4412 of 1998/ })).not.toBeChecked();
  });

  test('several services: the files are said to go with every one of them', async ({ page }) => {
    await toReview(page, ['Encumbrance certificate', 'Certified patta copy'], ID.parcel);
    await expect(page.getByText('These files go with every service you picked.')).toBeVisible();
  });

  test('work on the ground is shut when more than one chosen property has no boundary, and says why', async ({ page, world }) => {
    const plot = CARDS.find((c) => c.id === ID.plot)!;
    world.set('properties', propertyList([CARDS[0], plot, { ...plot, id: 'w-sy-89', title: 'Sy 89' }]));
    await toServices(page, ID.plot, 'w-sy-89');

    await expect(pickSvc(page, 'Site visit')).toBeDisabled();
    await expect(pickSvc(page, 'Site visit')).toHaveAccessibleDescription(/order one at a time/);
    await expect(pickSvc(page, 'Encumbrance certificate')).toBeEnabled();

    // One of them unmapped is one set of directions: allowed.
    await toServices(page, ID.parcel, ID.plot);
    await expect(pickSvc(page, 'Site visit')).toBeEnabled();
  });

  test('a disabled service names its reason to a screen reader', async ({ page }) => {
    await toServices(page, ID.parcel, ID.plot);
    await expect(pickSvc(page, 'Boundary re-survey')).toHaveAccessibleDescription('Ordered one property at a time');
  });

  test('the table shows every match, so select all and the tally agree', async ({ page, world }) => {
    world.set('properties', propertyList(Array.from({ length: 30 }, (_, i) => ({
      ...CARDS[0], id: `w-many-${i}`, title: `Sy ${400 + i}`, coverFileRef: '',
    }))));
    await page.goto('/order');
    await page.getByRole('button', { name: 'Table' }).click();

    await expect(landTable(page).locator('tbody tr')).toHaveCount(30);
    await page.getByRole('checkbox', { name: 'Select all 30 properties' }).check();
    await expect(bar(page, 'The chosen properties')).toContainText('30 properties selected');
  });

  test('the land table footer sums every row, then just the ticked ones, unit by unit', async ({ page, world }) => {
    world.set('properties', propertyList(Array.from({ length: 3 }, (_, i) => ({
      ...CARDS[0], id: `w-sum-${i}`, title: `Sy ${500 + i}`, coverFileRef: '',
      extent: i < 2 ? 1.25 : 60, extentUnit: i < 2 ? 'ac' : 'sq.yd',
    }))));
    await page.goto('/order');
    await page.getByRole('button', { name: 'Table' }).click();

    const foot = landTable(page).locator('tfoot');
    await expect(foot).toContainText('Total · 3 properties');
    await expect(foot).toContainText('2.50 ac + 60 sq.yd');
    await page.getByRole('checkbox', { name: 'Select Sy 502' }).check();
    await expect(foot).toContainText('1 property selected');
    await expect(foot).not.toContainText('ac');
    await expect(foot).toContainText('60 sq.yd');
  });

  test('a partial choice shows the header boxes as mixed', async ({ page }) => {
    await page.goto('/order');
    await page.getByRole('button', { name: 'Table' }).click();
    const all = page.getByRole('checkbox', { name: 'Select all 4 properties' });
    await expect(all).toHaveJSProperty('indeterminate', false);
    await page.getByRole('checkbox', { name: 'Select Sy 88' }).check();
    await expect(all).toHaveJSProperty('indeterminate', true);

    await toServices(page, ID.parcel);
    const every = page.getByRole('checkbox', { name: /^Select all \d+ services$/ });
    await pickSvc(page, 'Encumbrance certificate').check();
    await expect(every).toHaveJSProperty('indeterminate', true);
    await every.check();
    await expect(every).toHaveJSProperty('indeterminate', false);
  });

  test('the address follows the choice, so a reload restores what was chosen', async ({ page }) => {
    await page.goto(`/order?for=${ID.parcel}&service=ec&step=services`);
    await steps(page).getByRole('button', { name: 'Properties' }).click();
    await include(page, 'Sy 214/2').uncheck();
    await include(page, 'Sy 88').check();
    await page.getByRole('button', { name: 'Next: choose services' }).click();
    await pickSvc(page, 'Certified patta copy').check();

    await expect(page).toHaveURL(new RegExp(`for=${ID.plot}(&|$)`));
    await expect(page).toHaveURL(/service=ec%2Cpatta_copy|service=ec,patta_copy/);
    await page.reload();
    await expect(page.getByRole('group', { name: 'Ordering for' })).toContainText('Sy 88');
    await expect(pickSvc(page, 'Certified patta copy')).toBeChecked();
  });

  test('the reason and handed-over answer on the entry link stay with the property it named', async ({ page, world }) => {
    await page.goto(`/order?for=${ID.parcel}&step=services&service=site_visit&a.check=General+condition&why=photos`);
    await expect(pickSvc(page, 'Site visit')).toBeChecked();
    await steps(page).getByRole('button', { name: 'Properties' }).click();
    await include(page, 'Sy 214/2').uncheck();
    await include(page, 'Flat 4B, Sai Residency').check();
    await page.getByRole('button', { name: 'Next: choose services' }).click();
    await pickSvc(page, 'Site visit').uncheck();
    await pickSvc(page, 'Title opinion').check();
    await page.getByRole('button', { name: 'Next: review' }).click();
    await page.getByLabel('How far back to trace').selectOption({ index: 1 });
    await page.getByRole('button', { name: /^Place 1 order/ }).click();

    await expect(page).toHaveURL('/services');
    expect(world.lastVars('orderService')).toMatchObject({ kind: 'title_opinion', note: 'Ordered against Flat 4B, Sai Residency' });
  });

  // Work on the ground needs to know which land (founder, 10/10/2026: "kml is
  // very important for borewell"): a property with no boundary takes the
  // owner's KML right on the review card, saved to the property.
  const KML = Buffer.from(`<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2"><Placemark><name>Sy 88</name><Polygon><outerBoundaryIs><LinearRing><coordinates>
79.2694,15.7410,0 79.2704,15.7410,0 79.2704,15.7402,0 79.2694,15.7402,0 79.2694,15.7410,0
</coordinates></LinearRing></outerBoundaryIs></Polygon></Placemark></kml>`);

  test('a property with no boundary takes a KML on the review card, saved to that property', async ({ page, world }) => {
    await toReview(page, ['Boundary re-survey'], ID.plot);
    await expect(page.getByText(/No boundary on record for/)).toBeVisible();
    await page.locator('input[type="file"][accept*=".kml"]').setInputFiles(
      { name: 'sy-88.kml', mimeType: 'application/vnd.google-earth.kml+xml', buffer: KML });

    await expect.poll(() => world.calls('setBoundary')).toHaveLength(1);
    const vars = world.lastVars('setBoundary') as { recordId: string; ring: number[] };
    expect(vars.recordId).toBe(ID.plot);
    // Four corners, as lat,lon pairs, from the file's lon,lat coordinates.
    expect(vars.ring).toHaveLength(8);
    expect(vars.ring.slice(0, 2)).toEqual([15.741, 79.2694]);
    await expect(page.getByText('Boundary added to Sy 88 from sy-88.kml.')).toBeVisible();
    await expect(page.getByRole('alert')).toHaveCount(0);
  });

  test('a file that is not a boundary says so on the card and saves nothing', async ({ page, world }) => {
    await toReview(page, ['Boundary re-survey'], ID.plot);
    await page.locator('input[type="file"][accept*=".kml"]').setInputFiles(
      { name: 'notes.kml', mimeType: 'application/vnd.google-earth.kml+xml', buffer: Buffer.from('<kml>nothing here</kml>') });

    await expect(page.getByRole('alert').filter({ hasText: /./ }).first()).toBeVisible();
    expect(world.calls('setBoundary')).toHaveLength(0);
  });

  test('going to draw the boundary and coming back keeps the answers and the files', async ({ page }) => {
    await toReview(page, ['Boundary re-survey'], ID.plot);
    await page.getByLabel('Which boundary').selectOption('North');
    const draw = page.getByRole('link', { name: 'or draw it on the map' });
    const href = (await draw.getAttribute('href'))!;
    expect(href).toMatch(new RegExp(`^/properties/${ID.plot}/location\\?draw=1&back=`));
    const back = decodeURIComponent(href.split('back=')[1]);
    expect(back).toContain('a.survey.which_side=North');

    await page.goto(back);
    await expect(page.getByRole('heading', { name: 'Review and place' })).toBeVisible();
    await expect(page.getByLabel('Which boundary')).toHaveValue('North');
  });
});

// ═══════════════════════════════════════════════════════════════════════
// /properties/:id/request — asking somebody to do a piece of work
// ═══════════════════════════════════════════════════════════════════════

test.describe('Asking for work on a record', () => {
  // Since 8ee7822 the request screen refuses to raise a second copy of a job
  // that is already running, and the seeded parcel has corner surveys open.
  // These tests are about composing a request, so they start from a record
  // with nothing running; the guard has its own test just below.
  test.beforeEach(({ world }) => {
    world.set('orders', ordersAnswer([]));
  });

  test('a job already running on the land is offered back instead of being asked for twice', async ({ page, world }) => {
    world.set('orders', ordersAnswer(ORDERS));
    await page.goto(`/properties/${ID.parcel}/request`);

    await expect(page.getByRole('heading', { name: 'This service is already ordered for this property' })).toBeVisible();
    await expect(page.getByText('Corner survey is already running on Sy 214/2.')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Open order' })).toBeVisible();
    await expect(page.getByLabel('Message', { exact: true })).toHaveCount(0);
  });

  test('asking a surveyor opens with the words an owner would actually send', async ({ page }) => {
    await page.goto(`/properties/${ID.parcel}/request`);

    await expect(page.getByRole('heading', { name: 'Ask a surveyor' })).toBeVisible();
    await expect(page.getByLabel('Message', { exact: true })).toHaveValue(
      'Hey dear surveyor, please do the survey for this location. The boundary is attached as a map file.',
    );
    // The way back is the property's crumb (design.md § Page head, detail).
    await expect(page.getByRole('navigation', { name: 'Breadcrumb' }).getByRole('link', { name: 'Sy 214/2' }))
      .toBeVisible();
  });

  test('the boundary goes as geometry only, and says so', async ({ page }) => {
    await page.goto(`/properties/${ID.parcel}/request`);

    const geo = page.getByRole('checkbox', { name: /The boundary, as a map file/ });
    await expect(geo).toBeChecked();
    await expect(page.getByText('4 corners. Geometry only.')).toBeVisible();
    await expect(page.getByText('1 attached.')).toBeVisible();
  });

  test('a record with no boundary asks for the corners to be established instead of promising a file', async ({ page }) => {
    await page.goto(`/properties/${ID.plot}/request`);

    await expect(page.getByLabel('Message', { exact: true })).toHaveValue(
      'Hey dear surveyor, please do the survey for this location. There is no boundary on record yet — '
      + 'please establish the corners on site and send the sheet back.',
    );
    const geo = page.getByRole('checkbox', { name: /The boundary, as a map file/ });
    await expect(geo).toBeDisabled();
    await expect(geo).not.toBeChecked();
    await expect(page.getByText('No boundary saved yet.')).toBeVisible();
    await expect(page.getByText('Nothing attached.')).toBeVisible();
  });

  test('a boundary read that failed does not turn a surveyed record into an unsurveyed one', async ({ page, world }) => {
    // RequestWork.tsx:108-111 takes the ring off the boundary read OR off the
    // record, in that order. The record already carries it, so an outage on
    // the separate boundary read must not rewrite the surveyor's message into
    // "there is no boundary on record yet" and send somebody to establish
    // corners that were walked in August.
    world.set('boundary', World.gqlError('the boundary store is down'));
    await page.goto(`/properties/${ID.parcel}/request`);

    await expect(page.getByLabel('Message', { exact: true }))
      .toHaveValue(/The boundary is attached as a map file\.$/);
    const geo = page.getByRole('checkbox', { name: /The boundary, as a map file/ });
    await expect(geo).toBeChecked();
    await expect(geo).toBeEnabled();
    await expect(page.getByText('4 corners. Geometry only')).toBeVisible();
  });

  test('asking an advocate opens on the papers, not the boundary', async ({ page }) => {
    await page.goto(`/properties/${ID.parcel}/request?kind=opinion`);

    await expect(page.getByRole('heading', { name: 'Ask an advocate' })).toBeVisible();
    await expect(page.getByLabel('Message', { exact: true }))
      .toHaveValue('Please read these documents and tell me whether the title is clean.');
  });

  test('only the surveyor’s opener changes for an unsurveyed record, because only it promised a file', async ({ page }) => {
    // `noGeo` is optional on OPENERS (RequestWork.tsx:40) and only `survey`
    // has one, because only the surveyor's words promise an attachment that a
    // record with no ring cannot produce. An advocate asked to read the papers
    // is asked exactly the same thing either way — rewriting that sentence
    // would be inventing a job nobody asked for.
    await page.goto(`/properties/${ID.plot}/request?kind=opinion`);

    await expect(page.getByLabel('Message', { exact: true }))
      .toHaveValue('Please read these documents and tell me whether the title is clean.');
    // The box still says there is no boundary — the message just does not.
    await expect(page.getByRole('checkbox', { name: /The boundary, as a map file/ })).toBeDisabled();
    await expect(page.getByText('No boundary saved yet.')).toBeVisible();
    await expect(page.getByText('Nothing attached.')).toBeVisible();
  });

  test('asking somebody to visit opens on what they should send back', async ({ page }) => {
    await page.goto(`/properties/${ID.parcel}/request?kind=visit`);

    await expect(page.getByRole('heading', { name: 'Ask a provider to visit' })).toBeVisible();
    await expect(page.getByLabel('Message', { exact: true }))
      .toHaveValue('Please visit this land and send me photos of what you find.');
  });

  test('a message I have typed is not overwritten when the boundary lands', async ({ page, world }) => {
    // The opener swaps the moment `surveyed` flips, and that flip can land
    // after the owner has started typing: the boundary read is separate from
    // the record, so a record with no ring on it opens on the "establish the
    // corners" wording and changes its mind when the ring arrives
    // (RequestWork.tsx:120-121). `touched` is the only thing between that and
    // a typed message being thrown away.
    world.set('boundary', World.slow(1200, { recordId: ID.plot, title: 'Sy 88', ring: RING, marks: [] }));
    await page.goto(`/properties/${ID.plot}/request`);
    await expect(page.getByLabel('Message', { exact: true })).toHaveValue(/establish the corners/);

    await page.getByLabel('Message', { exact: true }).fill('Ravi, the eastern edge first please.');

    // The ring lands and the screen changes its mind about this record…
    await expect(page.getByText('4 corners. Geometry only')).toBeVisible();
    // …and what the owner typed is still theirs.
    await expect(page.getByLabel('Message', { exact: true }))
      .toHaveValue('Ravi, the eastern edge first please.');
  });

  test('an advocate’s request is filed as an opinion, not as a survey', async ({ page, world }) => {
    await page.goto(`/properties/${ID.parcel}/request?kind=opinion`);

    await page.getByRole('button', { name: 'Place the order' }).click();

    await expect.poll(() => world.calls('createRequest')).toHaveLength(1);
    const vars = world.lastVars('createRequest');
    expect(vars).toMatchObject({ recordId: ID.parcel, kind: 'opinion' });
    expect(String(vars.message)).toContain('whether the title is clean');
  });

  test('there is nothing to raise without a message, and the button says why it is off', async ({ page, world }) => {
    await page.goto(`/properties/${ID.parcel}/request`);
    await page.getByLabel('Message', { exact: true }).fill('   ');

    const raise = page.getByRole('button', { name: 'Place the order' });
    await expect(raise).toBeDisabled();
    await expect(page.getByText('Type your message first.')).toBeVisible();
    await raise.click({ force: true });
    expect(world.calls('createRequest')).toHaveLength(0);
  });

  test('raising the request sends what was ticked, and nothing else', async ({ page, world }) => {
    await page.goto(`/properties/${ID.parcel}/request`);
    await page.getByRole('checkbox', { name: 'The well from the gate' }).check();
    await page.getByRole('checkbox', { name: 'Sale deed 4412 of 1998' }).check();
    await expect(page.getByText('3 attached.'))
      .toBeVisible();

    await page.getByRole('button', { name: 'Place the order' }).click();

    await expect.poll(() => world.calls('createRequest')).toHaveLength(1);
    const vars = world.lastVars('createRequest');
    expect(vars).toMatchObject({
      recordId: ID.parcel,
      kind: 'survey',
      requester: 'the owner',
      shared: 'the boundary as a map file, The well from the gate, Sale deed 4412 of 1998',
    });
    expect(String(vars.message)).toContain('please do the survey for this location');
    expect(JSON.parse(String(vars.attachmentManifest))).toEqual({
      documentIds: [PAPER.deed], photoIds: [PHOTO.cover], includeBoundary: true,
    });
  });

  test('the count on the shelf and the sentence under the button are the same number', async ({ page }) => {
    // Two places print what is attached — the Chip on "Attachments"
    // (RequestWork.tsx:322) and the sentence at :313-317 — and both read the
    // same `attachmentCount`. On this screen those two disagreeing is the
    // difference between a surveyor being handed a deed and not.
    await page.goto(`/properties/${ID.parcel}/request`);
    await expect(cardCount(page, 'Attachments')).toHaveText('1');

    await page.getByRole('checkbox', { name: 'The well from the gate' }).check();
    await page.getByRole('checkbox', { name: 'Sale deed 4412 of 1998' }).check();

    await expect(cardCount(page, 'Attachments')).toHaveText('3');
    // And each shelf counts only its own.
    await expect(cardCount(page, 'Photos')).toHaveText('1');
    await expect(cardCount(page, 'Documents')).toHaveText('1');
    await expect(page.getByText('3 attached.'))
      .toBeVisible();
  });

  test('a paper I tick and then untick does not travel with the request', async ({ page, world }) => {
    await page.goto(`/properties/${ID.parcel}/request`);
    const deed = page.getByRole('checkbox', { name: 'Sale deed 4412 of 1998' });

    await deed.check();
    await expect(page.getByText('2 attached.')).toBeVisible();
    await deed.uncheck();
    await expect(page.getByText('1 attached.')).toBeVisible();

    await page.getByRole('button', { name: 'Place the order' }).click();

    await expect.poll(() => world.calls('createRequest')).toHaveLength(1);
    const vars = world.lastVars('createRequest');
    // Not named in the sentence the worker reads, and not in the manifest.
    expect(vars.shared).toBe('the boundary as a map file');
    expect(JSON.parse(String(vars.attachmentManifest))).toEqual({
      documentIds: [], photoIds: [], includeBoundary: true,
    });
  });

  test('a request with nothing ticked carries only the message', async ({ page, world }) => {
    await page.goto(`/properties/${ID.parcel}/request`);
    await page.getByRole('checkbox', { name: /The boundary, as a map file/ }).uncheck();
    await expect(page.getByText('Nothing attached.')).toBeVisible();

    await page.getByRole('button', { name: 'Place the order' }).click();

    await expect.poll(() => world.calls('createRequest')).toHaveLength(1);
    const vars = world.lastVars('createRequest');
    expect(vars.shared).toBe('');
    expect(JSON.parse(String(vars.attachmentManifest))).toEqual({
      documentIds: [], photoIds: [], includeBoundary: false,
    });
  });

  test('somebody acting for the owner puts their own name on the request', async ({ page, world }) => {
    await page.goto(`/properties/${ID.parcel}/request`);
    await page.getByRole('button', { name: 'I am acting for the owner' }).click();
    await page.getByLabel('Your name').fill('Venkat, for my brother');

    await page.getByRole('button', { name: 'Place the order' }).click();

    await expect.poll(() => world.calls('createRequest')).toHaveLength(1);
    expect(world.lastVars('createRequest')).toMatchObject({ requester: 'Venkat, for my brother' });
  });

  test('acting for the owner without giving a name still says it is not the owner asking', async ({ page, world }) => {
    await page.goto(`/properties/${ID.parcel}/request`);
    await page.getByRole('button', { name: 'I am acting for the owner' }).click();
    await expect(page.getByLabel('Your name')).toBeVisible();

    await page.getByRole('button', { name: 'Place the order' }).click();

    await expect.poll(() => world.calls('createRequest')).toHaveLength(1);
    expect(world.lastVars('createRequest')).toMatchObject({ requester: 'acting for the owner' });
  });

  test('going back to being the owner puts the name away, and the request goes as the owner', async ({ page, world }) => {
    await page.goto(`/properties/${ID.parcel}/request`);
    await page.getByRole('button', { name: 'I am acting for the owner' }).click();
    await page.getByLabel('Your name').fill('Venkat, for my brother');

    await page.getByRole('button', { name: 'I am the owner' }).click();

    await expect(page.getByLabel('Your name')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'I am the owner' }))
      .toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByRole('button', { name: 'I am acting for the owner' }))
      .toHaveAttribute('aria-pressed', 'false');

    await page.getByRole('button', { name: 'Place the order' }).click();

    await expect.poll(() => world.calls('createRequest')).toHaveLength(1);
    // The name that was typed and then taken back does not travel.
    expect(world.lastVars('createRequest')).toMatchObject({ requester: 'the owner' });
    expect(String(world.lastVars('createRequest').requester)).not.toContain('Venkat');
  });

  test('while the request is being raised the button says so and cannot be pressed twice', async ({ page, world }) => {
    world.set('createRequest', World.slow(1500, 'w-req-new'));
    await page.goto(`/properties/${ID.parcel}/request`);

    await page.getByRole('button', { name: 'Place the order' }).click();

    const going = page.getByRole('button', { name: 'Placing…' });
    await expect(going).toBeVisible();
    await expect(going).toBeDisabled();
    await expect(page.getByRole('link', { name: 'Open the order' })).toBeVisible();
    expect(world.calls('createRequest')).toHaveLength(1);
  });

  test('a filed request stays on screen and hands me the job rather than taking it away', async ({ page }) => {
    await page.goto(`/properties/${ID.parcel}/request`);
    await page.getByRole('button', { name: 'Place the order' }).click();

    await expect(page.getByText('Order placed. Not assigned yet.')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Open the order' }))
      .toHaveAttribute('href', '/services/w-req-new');
    // Both exits are the owner's act; nothing redirects itself.
    await expect(page).toHaveURL(new RegExp(`/properties/${ID.parcel}/request`));
    await expect(page.getByRole('button', { name: 'Place the order' })).toHaveCount(0);

    await page.getByRole('button', { name: 'Back to this property’s services' }).click();
    await expect(page).toHaveURL(`/properties/${ID.parcel}/services`);
  });

  test('a request the server would not accept says what it wanted', async ({ page, world }) => {
    world.set('createRequest', '');
    await page.goto(`/properties/${ID.parcel}/request`);
    await page.getByRole('button', { name: 'Place the order' }).click();

    await expect(page.getByText('That order was not accepted. A message is required.')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Open the order' })).toHaveCount(0);
  });

  test('a request that died on the way back is reported, with the reason', async ({ page, world }) => {
    world.set('createRequest', World.gqlError('the gateway gave up'));
    await page.goto(`/properties/${ID.parcel}/request`);
    await page.getByRole('button', { name: 'Place the order' }).click();

    // The shared mutation helper toasts the reason…
    const toast = page.locator('.toast').filter({ hasText: 'That request' });
    await expect(toast).toContainText('That request could not be saved. Nothing has changed.');
    await expect(toast).toContainText('the gateway gave up');
    // …and the button comes back, so the owner is not left pressing nothing.
    await expect(page.getByRole('button', { name: 'Place the order' })).toBeEnabled();
    await expect(page.getByRole('link', { name: 'Open the order' })).toHaveCount(0);
  });

  test('a file added to a request is filed on the record first, then named on the request', async ({ page, world }) => {
    world.route(/\/api\/gateway\/storage\/files\?/, () => ({ json: storedNode() }));
    await page.goto(`/properties/${ID.parcel}/request`);

    await page.getByLabel('Add a file to this order').setInputFiles({
      name: 'Sale deed.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 deed'),
    });
    await expect(card(page, 'Other')).toContainText('Sale deed.pdf · 0.0 MB');

    await page.getByRole('button', { name: 'Place the order' }).click();

    // Stored, then filed as a paper on the record — in that order.
    await expect.poll(() => world.restCalls(/storage\/files\?/)).toHaveLength(1);
    await expect.poll(() => world.calls('addPaper')).toHaveLength(1);
    expect(world.lastVars('addPaper')).toMatchObject({
      recordId: ID.parcel, fileRef: 'node-uploaded-1', name: 'Sale deed.pdf',
      subtitle: 'Added for this order', shelf: 'unsorted',
      mimeType: 'application/pdf', sizeBytes: 2048,
    });

    await expect.poll(() => world.calls('createRequest')).toHaveLength(1);
    const vars = world.lastVars('createRequest');
    expect(String(vars.shared)).toContain('Sale deed.pdf');
    expect(JSON.parse(String(vars.attachmentManifest)).documentIds).toContain('w-paper-new');
  });

  test('the same file picked twice is one file, and the count says so', async ({ page }) => {
    await page.goto(`/properties/${ID.parcel}/request`);
    const pick = page.getByLabel('Add a file to this order');
    const file = { name: 'Sale deed.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 deed') };

    await pick.setInputFiles(file);
    await pick.setInputFiles(file);

    await expect(cardCount(page, 'Other')).toHaveText('1');
    await expect(card(page, 'Other')).toContainText('Sale deed.pdf · 0.0 MB');
    await expect(page.getByText('2 attached.'))
      .toBeVisible();
  });

  test('a second file is added to the first rather than put in its place', async ({ page }) => {
    await page.goto(`/properties/${ID.parcel}/request`);
    const pick = page.getByLabel('Add a file to this order');

    await pick.setInputFiles({ name: 'Sale deed.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 deed') });
    await pick.setInputFiles({ name: 'EC.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 ec') });

    await expect(cardCount(page, 'Other')).toHaveText('2');
    await expect(card(page, 'Other')).toContainText('Sale deed.pdf · 0.0 MB, EC.pdf · 0.0 MB');
    await expect(page.getByText('3 attached.'))
      .toBeVisible();
  });

  test('“Add a file” is a real button and it opens the picker', async ({ page }) => {
    // The point of RequestWork.tsx:395-411: a <label> around a hidden input
    // takes no focus, so the tab order used to skip this card entirely and a
    // deed could only be attached with a mouse.
    await page.goto(`/properties/${ID.parcel}/request`);
    const add = page.getByRole('button', { name: 'Add a file' });
    await add.focus();
    await expect(add).toBeFocused();

    const chooser = page.waitForEvent('filechooser');
    await add.press('Enter');

    expect((await chooser).isMultiple()).toBe(true);
  });

  test('a file over the limit is refused by name before a byte is sent, and no request is raised', async ({ page, world }) => {
    await page.goto(`/properties/${ID.parcel}/request`);
    await page.getByLabel('Add a file to this order').setInputFiles({
      name: 'Scan.pdf', mimeType: 'application/pdf', buffer: Buffer.alloc(16 * 1024 * 1024, 1),
    });

    await page.getByRole('button', { name: 'Place the order' }).click();

    await expect(page.getByText(
      'Scan.pdf is 16.0 MB. The limit is 15.0 MB — it was not uploaded and no order was placed.',
    )).toBeVisible();
    expect(world.restCalls(/storage\/files\?/)).toHaveLength(0);
    expect(world.calls('createRequest')).toHaveLength(0);
  });

  test('a file that was stored but could not be filed stops the request', async ({ page, world }) => {
    world.route(/\/api\/gateway\/storage\/files\?/, () => ({ json: storedNode() }));
    world.set('addPaper', '');
    await page.goto(`/properties/${ID.parcel}/request`);
    await page.getByLabel('Add a file to this order').setInputFiles({
      name: 'Sale deed.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 deed'),
    });

    await page.getByRole('button', { name: 'Place the order' }).click();

    await expect(page.getByText(
      'That file was stored but could not be saved on this property, so no order was placed.',
    )).toBeVisible();
    expect(world.calls('createRequest')).toHaveLength(0);
    // The file is still queued, so the owner can try again without re-picking.
    await expect(card(page, 'Other')).toContainText('Sale deed.pdf');
  });

  test('when the second file cannot be filed the first one stays filed, and only the failure is left queued', async ({ page, world }) => {
    world.route(/\/api\/gateway\/storage\/files\?/, () => ({ json: storedNode() }));
    world.set('addPaper', (vars) => (String(vars.name) === 'Sale deed.pdf' ? 'w-paper-new' : ''));
    await page.goto(`/properties/${ID.parcel}/request`);
    await page.getByLabel('Add a file to this order').setInputFiles([
      { name: 'Sale deed.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 deed') },
      { name: 'EC.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 ec') },
    ]);

    await page.getByRole('button', { name: 'Place the order' }).click();

    await expect(page.getByText(
      'That file was stored but could not be saved on this property, so no order was placed.',
    )).toBeVisible();
    expect(world.calls('createRequest')).toHaveLength(0);
    // The deed is a paper on the record now, so it is ticked rather than
    // queued — a retry must not upload the same bytes a second time.
    await expect(card(page, 'Other')).toContainText('EC.pdf');
    await expect(card(page, 'Other')).not.toContainText('Sale deed.pdf');
    await expect(cardCount(page, 'Other')).toHaveText('1');
    await expect(cardCount(page, 'Documents')).toHaveText('1');
    expect(world.restCalls(/storage\/files\?/)).toHaveLength(2);
  });

  test('an upload that died raises no request at all', async ({ page, world }) => {
    // The gateway answers 200 with no node id — which is how a save that did
    // not save actually looks. A transport failure would be the same branch
    // plus a console error the guard would fail on.
    world.route(/\/api\/gateway\/storage\/files\?/, () => ({ json: {} }));
    await page.goto(`/properties/${ID.parcel}/request`);
    await page.getByLabel('Add a file to this order').setInputFiles({
      name: 'Sale deed.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 deed'),
    });

    await page.getByRole('button', { name: 'Place the order' }).click();

    await expect(page.getByText('The upload service did not confirm that the file was saved.'))
      .toBeVisible();
    expect(world.calls('addPaper')).toHaveLength(0);
    expect(world.calls('createRequest')).toHaveLength(0);
    await expect(page.getByRole('link', { name: 'Open the order' })).toHaveCount(0);
  });

  test('the photos and papers on the record are the ones offered, and nothing else', async ({ page }) => {
    await page.goto(`/properties/${ID.parcel}/request`);

    await expect(card(page, 'Photos').getByRole('checkbox')).toHaveCount(3);
    await expect(card(page, 'Documents').getByRole('checkbox')).toHaveCount(5);
    // A photo with no caption is named by its file, not left blank.
    await expect(card(page, 'Photos')).toContainText('ne-stone.jpg');
    await expect(card(page, 'Photos')).toContainText('Video');
    await expect(page.getByText('Documents name people.')).toBeVisible();
  });

  test('a record with nothing on it says so on both shelves', async ({ page }) => {
    await page.goto(`/properties/${ID.plot}/request`);

    // Owners count properties, never records (naming standard).
    await expect(card(page, 'Photos')).toContainText('No photos on this property.');
    await expect(card(page, 'Photos').getByRole('checkbox')).toHaveCount(0);
    await expect(card(page, 'Documents').getByRole('checkbox')).toHaveCount(0);
    // "No documents", matching the photos' line: "filed against" is a banned
    // metaphor and "filed" became "saved" (naming standard T4).
    await expect(card(page, 'Documents')).toContainText('No documents on this property.');
    await expect(page.getByText(/filed against/)).toHaveCount(0);
  });

  test('the file shelf states the limit before a byte is picked, not after one is refused', async ({ page }) => {
    await page.goto(`/properties/${ID.parcel}/request`);

    await expect(cardCount(page, 'Other')).toHaveText('0');
    await expect(card(page, 'Other')).toContainText('Up to 15.0 MB each.');
  });

  test('the way back from asking is the record’s own boundary, which is where the ask came from', async ({ page, world }) => {
    await page.goto(`/properties/${ID.parcel}/request`);

    await page.getByRole('navigation', { name: 'Breadcrumb' }).getByRole('link', { name: 'Sy 214/2' }).click();

    await expect(page).toHaveURL(`/properties/${ID.parcel}/location`);
    expect(world.calls('createRequest')).toHaveLength(0);
  });

  test('Cancel leaves the record open and raises nothing', async ({ page, world }) => {
    await page.goto(`/properties/${ID.parcel}/request`);

    await page.getByRole('button', { name: 'Cancel' }).click();

    await expect(page).toHaveURL(`/properties/${ID.parcel}`);
    expect(world.calls('createRequest')).toHaveLength(0);
  });

  test('while the record is still arriving the form is not drawn over an empty one', async ({ page, world }) => {
    world.set('record', World.never());
    await page.goto(`/properties/${ID.parcel}/request`);

    // The property frame holds the screen and says what it is waiting for.
    await expect(page.getByRole('status', { name: 'Loading this property' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Place the order' })).toHaveCount(0);
  });

  // ── defects ──────────────────────────────────────────────────────────

  test('a shelf whose papers could not be read says so, not that nothing is filed', async ({ page, world }) => {
    // DEFECT — apps/web/src/w360/pages/RequestWork.tsx:88 takes `usePapers` as
    // `{ data: papers }` alone, and line 365 reads `(papers ?? []).length === 0`
    // as "Nothing is filed against this record." — the same conflation
    // Orders.tsx:284 makes with corrections and OrderService.tsx:517 makes
    // with this same pair of reads. It bites hardest here: this is the screen
    // whose own header promises "You choose exactly what leaves this record",
    // and on a record that has papers filed against it an outage tells the
    // owner there is nothing to choose, then raises a request naming none of
    // them. The owner is owed a shelf that says it could not be read, so they
    // know to wait rather than to send a surveyor out blind.
    test.fail();
    world.set('papers', World.gqlError('the vault is down'));
    await page.goto(`/properties/${ID.parcel}/request`);
    await expect(card(page, 'Documents')).toBeVisible();

    await expect(card(page, 'Documents'))
      .toContainText(/did not load|could not be read/i, { timeout: 3000 });
  });

  test('every photo on the record can be sent, not only the first twelve', async ({ page, world }) => {
    // DEFECT — apps/web/src/w360/pages/RequestWork.tsx:347 draws
    // `(photos?.photos ?? []).slice(0, 12)` and says nothing about the rest,
    // under a card whose whole promise is that whoever gets this sees exactly
    // what was ticked. OrderService.tsx:520-527 already fixed this same cut on
    // this same data — "it used to stop at eight papers and six photos with
    // nothing saying so … so the one deed the advocate needed could simply not
    // be ticked" — by scrolling the full list instead. A record with thirteen
    // photos cannot send its thirteenth to a surveyor from this screen at all,
    // and nothing on screen says a photo was held back. The owner is owed
    // every photo, in a list that scrolls.
    test.fail();
    const rows = Array.from({ length: 14 }, (_, i) => ({
      ...(PHOTOS as { photos: Record<string, unknown>[] }).photos[0],
      id: `w-photo-many-${i}`, caption: `Corner ${i + 1}`, isCover: false,
    }));
    world.set('photos', { ...PHOTOS, photos: rows, total: rows.length });
    await page.goto(`/properties/${ID.parcel}/request`);
    await expect(card(page, 'Photos').getByRole('checkbox').first()).toBeVisible();

    await expect(card(page, 'Photos').getByRole('checkbox')).toHaveCount(14, { timeout: 3000 });
  });

  test('a request that died on the way back sends the owner to look under Services before retrying', async ({ page, world }) => {
    // DEFECT — apps/web/src/w360/pages/RequestWork.tsx:205 is
    // `setSent(error instanceof Error ? error.message : RAISE_FAILED)`, and
    // every failure on this path throws an Error (gql() throws, uploadToDrive
    // throws a StorageUploadError). So RAISE_FAILED — the sentence written at
    // line 70 precisely because a request can die AFTER the API committed —
    // is unreachable, and the owner is shown the raw server line instead. A
    // blind retry then files the job twice. The owner is owed RAISE_FAILED's
    // sentence, with the machine's words as the detail beneath it.
    test.fail();
    world.set('createRequest', World.gqlError('the gateway gave up'));
    await page.goto(`/properties/${ID.parcel}/request`);
    await page.getByRole('button', { name: 'Place the order' }).click();

    await expect(page.getByText('look under Services before trying again'))
      .toBeVisible({ timeout: 3000 });
  });

  test('an upload that died tells the owner no request was raised', async ({ page, world }) => {
    // DEFECT — apps/web/src/w360/pages/RequestWork.tsx:168 reads
    // `const node = await uploadToDrive(f); if (!node) { stop(...) }`, but
    // uploadToDrive THROWS on failure and never returns a falsy node
    // (apps/web/src/pages/documents/storage.ts:50-79). The `stop()` branch is
    // dead, so the failure falls through to the catch at line 205 and the
    // owner reads a storage-service sentence that says nothing about the
    // request. Every sibling branch here — the size refusal, PAPER_FAILED —
    // ends in "no request was raised"; this one is owed the same words.
    test.fail();
    world.route(/\/api\/gateway\/storage\/files\?/, () => ({ json: {} }));
    await page.goto(`/properties/${ID.parcel}/request`);
    await page.getByLabel('Add a file to this order').setInputFiles({
      name: 'Sale deed.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 deed'),
    });
    await page.getByRole('button', { name: 'Place the order' }).click();

    await expect(page.getByText(/no order was placed/i)).toBeVisible({ timeout: 3000 });
  });

  test('a link naming a kind nothing sells does not file a job of that kind', async ({ page, world }) => {
    // DEFECT — apps/web/src/w360/pages/RequestWork.tsx:82 takes `kind`
    // straight off the query string and line 190 hands it to createRequest
    // verbatim, while line 83 quietly falls back to the SURVEY wording for a
    // kind it does not know. So /request?kind=banana draws "Ask a surveyor",
    // pre-fills the surveyor's message, and files a work request of kind
    // "banana" — a job that lands under Services with no title the catalogue
    // can name. The owner is owed the kind snapped to the one the screen is
    // actually showing (or the link refused outright), not a job whose words
    // and whose kind disagree.
    test.fail();
    await page.goto(`/properties/${ID.parcel}/request?kind=banana`);
    await expect(page.getByRole('heading', { name: 'Ask a surveyor' })).toBeVisible();
    await page.getByRole('button', { name: 'Place the order' }).click();

    await expect.poll(() => world.calls('createRequest')).toHaveLength(1);
    expect(world.lastVars('createRequest')).toMatchObject({ kind: 'survey' });
  });
});
