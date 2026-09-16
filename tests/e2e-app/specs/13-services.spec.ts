/**
 * W10 + W13 + W16 — ordering work, and asking for it.
 *
 * Seven routes, three source files, one argument: an order is the only place
 * money leaves the app on somebody else's word, so every screen here has to be
 * honest about what has actually been filed.
 *
 *   /app/services                  every order this account placed
 *   /app/assigned                  the ones sitting on your decision
 *   /app/order                     which land is this for — and nothing else
 *   /app/records/:id/services      the same rows, scoped to one record
 *   /app/records/:id/history       what has been corrected on that record
 *   /app/records/:id/order         the order itself, in four steps
 *   /app/records/:id/request       asking somebody outside to do a job
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
 *   3. Orders.tsx:61 — `useAssignable`'s error, the same way: the Assign-to
 *      select is left holding one option that does nothing, for ever.
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
 *   8. OrderService.tsx:1005-1006 — the receipt prints "It is job W-2199 ,
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
 *  no heading. The ref (W-2101 …) is unique per order and is printed on every
 *  row, so it is what names one. */
const orderRow = (page: Page, ref: string) =>
  page.locator('.rows.boxed > div').filter({ hasText: ref });

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
// /app/services — everything you have ordered
// ═══════════════════════════════════════════════════════════════════════

test.describe('Services', () => {
  test('every order still running is on the list, with its stage, its status word and what it cost', async ({ page, world }) => {
    await page.goto('/app/services');

    await expect(page.getByRole('heading', { name: 'Work you can order' })).toBeVisible();
    // Not "paid from your wallet, held in escrow": placing an order takes
    // nothing from anybody, and funding is a separate later act on the ticket.
    await expect(page.getByText(
      'Ordered against one record — nothing is taken when you order. Money is set aside on '
      + 'the job afterwards, and is only owed once you accept what came back.',
    )).toBeVisible();
    // Six open jobs; the two closed ones are not asked for.
    await expect(page.locator('.rows.boxed > div')).toHaveCount(6);
    for (const ref of ['W-2101', 'W-2102', 'W-2103', 'W-2104', 'W-2105', 'W-2106']) {
      await expect(orderRow(page, ref)).toBeVisible();
    }
    await expect(orderRow(page, 'W-2098')).toHaveCount(0);

    const survey = orderRow(page, 'W-2102');
    await expect(survey).toContainText('Corner survey');
    await expect(survey).toContainText('Establish 8 corners');
    await expect(survey).toContainText('Assigned');
    await expect(survey).toContainText('₹6,500');
    // What is actually set aside on the job, which is not the same claim as
    // what it was quoted at.
    await expect(survey).toContainText('₹6,500 set aside');
    await expect(survey).toContainText('2026-09-25');

    // A job nobody has funded is quoted but holds nothing.
    const ec = orderRow(page, 'W-2101');
    await expect(ec).toContainText('₹1,200');
    await expect(ec).not.toContainText('set aside');

    expect(world.calls('orders').map((c) => c.vars))
      .toContainEqual({ recordId: null, includeClosed: false });
  });

  test('the two states an owner acts on are said in words, not left to the pips', async ({ page }) => {
    await page.goto('/app/services');

    // "Sent out" and "Waiting on you" have no pip of their own — they are the
    // reason the status word sits beside the rail at all.
    await expect(orderRow(page, 'W-2106')).toContainText('Sent out');
    const waiting = orderRow(page, 'W-2105');
    await expect(waiting).toContainText('Waiting on you');
    await expect(waiting).toContainText('Needs you');
    await expect(waiting).toContainText('2 to look at');
    // And a job nobody is waiting on carries neither.
    await expect(orderRow(page, 'W-2103')).not.toContainText('Needs you');
  });

  test('each row says which property it is against, and that name is the way in', async ({ page }) => {
    await page.goto('/app/services');
    const link = orderRow(page, 'W-2102').getByRole('link', { name: 'Sy 214/2' });
    await expect(link).toHaveAttribute('href', `/app/records/${ID.parcel}`);
  });

  test('a finished job only appears when I ask for everything', async ({ page, world }) => {
    await page.goto('/app/services');
    await expect(orderRow(page, 'W-2098')).toHaveCount(0);

    await page.getByRole('button', { name: 'Everything, including done' }).click();

    await expect.poll(() => world.calls('orders').some((c) => c.vars.includeClosed === true)).toBe(true);
    expect(world.lastVars('orders')).toMatchObject({ recordId: null, includeClosed: true });

    await expect(page.locator('.rows.boxed > div')).toHaveCount(8);
    await expect(orderRow(page, 'W-2098')).toContainText('Done');
    await expect(orderRow(page, 'W-2099')).toContainText('Cancelled');
    // A closed job has no due date to hold anybody to.
    await expect(orderRow(page, 'W-2098')).not.toContainText('2026-09-25');
  });

  test('the Open chip puts the finished work away again, without a second round trip', async ({ page, world }) => {
    await page.goto('/app/services');
    await page.getByRole('button', { name: 'Everything, including done' }).click();
    await expect(orderRow(page, 'W-2098')).toBeVisible();
    const asked = world.calls('orders').length;

    await page.getByRole('button', { name: 'Open', exact: true }).click();

    await expect(page.locator('.rows.boxed > div')).toHaveCount(6);
    await expect(orderRow(page, 'W-2098')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Open', exact: true }))
      .toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByRole('button', { name: 'Everything, including done' }))
      .toHaveAttribute('aria-pressed', 'false');
    // The open list was already held under its own key, so going back to it
    // costs nothing — the two chips are two queries, not one query re-asked.
    expect(world.calls('orders')).toHaveLength(asked);
  });

  test('a row opens its own service', async ({ page }) => {
    await page.goto('/app/services');
    await expect(orderRow(page, 'W-2101').getByRole('link', { name: 'Open the service' }))
      .toHaveAttribute('href', `/app/services/${TICKET.placed}`);
    await expect(page.getByRole('link', { name: 'Open the service' })).toHaveCount(6);
  });

  test('following a row through lands on that service and opens its own job, not the list again', async ({ page }) => {
    // The route moved to /app/services/:id and the old /app/tickets/:id is a
    // redirect kept alive for a shipped phone binary. The row must send the
    // owner to the new path directly — a link that pays a redirect on every
    // press is a link that will be the last one fixed when the redirect goes.
    await page.goto('/app/services');

    await orderRow(page, 'W-2101').getByRole('link', { name: 'Open the service' }).click();

    await expect(page).toHaveURL(`/app/services/${TICKET.placed}`);
    // W-2101 is the encumbrance certificate and W-2102 is the corner survey,
    // so the heading is what proves the row opened ITS job and not a
    // neighbour's.
    await expect(page.getByRole('heading', { level: 1, name: 'Encumbrance certificate' }))
      .toBeVisible();
    // And the trail says where it came from, so the way back is the crumb and
    // not the browser button.
    const crumbs = page.getByRole('navigation', { name: 'Breadcrumb' });
    await expect(crumbs.getByRole('link', { name: 'Services' }))
      .toHaveAttribute('href', '/app/services');
    await expect(crumbs).toContainText('W-2101');
  });

  test('where a job has got to can be read without leaving the list', async ({ page }) => {
    await page.goto('/app/services');
    const row = orderRow(page, 'W-2102');
    const track = row.getByRole('button', { name: 'Track order' });
    await expect(track).toHaveAttribute('aria-expanded', 'false');

    await track.click();

    await expect(row).toContainText('Assigned · due 2026-09-25 · with Ravi Kumar, licensed surveyor');
    await expect(row.getByRole('button', { name: 'Hide' })).toHaveAttribute('aria-expanded', 'true');

    await row.getByRole('button', { name: 'Hide' }).click();
    await expect(row).not.toContainText('due 2026-09-25 · with Ravi Kumar');
  });

  test('tracking a second job puts the first one away, so two panels cannot be read against each other', async ({ page }) => {
    await page.goto('/app/services');
    await orderRow(page, 'W-2102').getByRole('button', { name: 'Track order' }).click();
    await expect(orderRow(page, 'W-2102')).toContainText('Assigned · due 2026-09-25 · with Ravi Kumar');

    await orderRow(page, 'W-2103').getByRole('button', { name: 'Track order' }).click();

    await expect(orderRow(page, 'W-2103')).toContainText('On site · due 2026-09-25 · with Ravi Kumar');
    await expect(orderRow(page, 'W-2102')).not.toContainText('with Ravi Kumar');
    await expect(orderRow(page, 'W-2102').getByRole('button', { name: 'Track order' }))
      .toHaveAttribute('aria-expanded', 'false');
  });

  test('a job somebody already holds names who has it instead of offering to hand it out again', async ({ page }) => {
    await page.goto('/app/services');
    const row = orderRow(page, 'W-2102');
    await row.getByRole('button', { name: 'Track order' }).click();

    await expect(row).toContainText('with Ravi Kumar, licensed surveyor');
    // The picker is for a job nobody is on. Offering it here would be a second
    // way to reassign work that the one-service screen already owns.
    await expect(row.getByLabel('Assign to')).toHaveCount(0);
    await expect(row).not.toContainText('Nobody was ever put on this job.');
  });

  test('an order placed before the form asked anything says so instead of showing a blank', async ({ page }) => {
    await page.goto('/app/services');
    await orderRow(page, 'W-2103').getByRole('button', { name: 'Track order' }).click();
    await expect(orderRow(page, 'W-2103'))
      .toContainText('This order was placed before the form asked for details.');
  });

  test('the answers I gave are readable back off the row', async ({ page, world }) => {
    world.set('orders', OPEN_ORDERS.map((o) => (o.id === TICKET.onSite
      ? { ...o, params: JSON.stringify({ how_many_corners: '8', anything_else: '  ' }) }
      : o)));
    await page.goto('/app/services');

    await orderRow(page, 'W-2103').getByRole('button', { name: 'Track order' }).click();
    const row = orderRow(page, 'W-2103');
    await expect(row).toContainText('How many corners');
    await expect(row).toContainText('8');
    // An answer nobody filled in is not a line on the sheet.
    await expect(row).not.toContainText('Anything else');
  });

  test('an order whose answers cannot be read still shows its stage', async ({ page, world }) => {
    world.set('orders', OPEN_ORDERS.map((o) => (o.id === TICKET.onSite ? { ...o, params: 'not json' } : o)));
    await page.goto('/app/services');

    await orderRow(page, 'W-2103').getByRole('button', { name: 'Track order' }).click();
    await expect(orderRow(page, 'W-2103')).toContainText('On site');
    await expect(orderRow(page, 'W-2103'))
      .toContainText('This order was placed before the form asked for details.');
  });

  test('a job nobody is on yet is where somebody is put on it', async ({ page, world }) => {
    await page.goto('/app/services');
    await orderRow(page, 'W-2101').getByRole('button', { name: 'Track order' }).click();

    const picker = orderRow(page, 'W-2101').getByLabel('Assign to');
    await expect(picker).toBeVisible();
    await expect.poll(() => world.asked('assignable')).toBe(true);
    // The names are the ones this account has already handed work to.
    await expect(picker.locator('option')).toHaveText(['Nobody yet', 'Ravi Kumar', 'Srinivas']);

    await picker.selectOption('Ravi Kumar');

    await expect.poll(() => world.calls('assignRequest')).toHaveLength(1);
    expect(world.lastVars('assignRequest'))
      .toMatchObject({ requestId: TICKET.placed, assignee: 'Ravi Kumar' });
  });

  test('the name that took is on the row straight away, without a reload', async ({ page, world }) => {
    // The row only changes because the mutation invalidates the w360 key
    // (api.ts useW360Mutation onSuccess) and the list is read again. The world
    // answers the second read with the name on it, which is what the server
    // would do.
    let assigned = false;
    world.set('assignRequest', () => { assigned = true; return true; });
    world.set('orders', (vars) => ordersAnswer(ORDERS.map((o) => (o.id === TICKET.placed && assigned
      ? { ...o, assignee: 'Srinivas, document writer' }
      : o)))(vars));
    await page.goto('/app/services');
    const row = orderRow(page, 'W-2101');
    await row.getByRole('button', { name: 'Track order' }).click();

    await row.getByLabel('Assign to').selectOption('Srinivas');

    await expect(row).toContainText('with Srinivas, document writer');
    await expect(row.getByLabel('Assign to')).toHaveCount(0);
  });

  test('a row whose names have not arrived yet does not claim there is nobody to pick', async ({ page, world }) => {
    // `people` is undefined both while the read is in flight and when it
    // failed; only a resolved empty array is an answer about this account.
    world.set('assignable', World.never());
    await page.goto('/app/services');
    await orderRow(page, 'W-2101').getByRole('button', { name: 'Track order' }).click();

    const picker = orderRow(page, 'W-2101').getByLabel('Assign to');
    await expect(picker).toBeVisible();
    await expect(picker.locator('option')).toHaveText(['Nobody yet']);
    await expect(orderRow(page, 'W-2101'))
      .not.toContainText('Nobody has worked on your records yet');
  });

  test('names that could not be read leave the picker empty rather than saying nobody has ever worked here', async ({ page, world }) => {
    world.set('assignable', World.gqlError('the people store is down'));
    await page.goto('/app/services');
    await orderRow(page, 'W-2101').getByRole('button', { name: 'Track order' }).click();

    const picker = orderRow(page, 'W-2101').getByLabel('Assign to');
    await expect(picker.locator('option')).toHaveText(['Nobody yet']);
    // It says nothing about why it is empty either — `useAssignable`'s error is
    // never read (Orders.tsx:61). That is a silent control, not a lying one, so
    // it is recorded here rather than as a defect: what must not happen is the
    // sentence below, which would blame the owner's own history for an outage.
    await expect(orderRow(page, 'W-2101'))
      .not.toContainText('Nobody has worked on your records yet');
  });

  test('putting the picker back to nobody files nothing', async ({ page, world }) => {
    await page.goto('/app/services');
    const row = orderRow(page, 'W-2101');
    await row.getByRole('button', { name: 'Track order' }).click();
    const picker = row.getByLabel('Assign to');

    await picker.selectOption('Ravi Kumar');
    await expect.poll(() => world.calls('assignRequest')).toHaveLength(1);
    await picker.selectOption('');          // "Nobody yet" — not a name
    await picker.selectOption('Srinivas');

    await expect.poll(() => world.calls('assignRequest')).toHaveLength(2);
    expect(world.calls('assignRequest').map((c) => c.vars.assignee))
      .toEqual(['Ravi Kumar', 'Srinivas']);
  });

  test('while somebody is being put on a job the picker is shut and says what is happening', async ({ page, world }) => {
    world.set('assignRequest', World.slow(1500, true));
    await page.goto('/app/services');
    const row = orderRow(page, 'W-2101');
    await row.getByRole('button', { name: 'Track order' }).click();

    await row.getByLabel('Assign to').selectOption('Ravi Kumar');

    await expect(row).toContainText('Putting them on it…');
    await expect(row.getByLabel('Assign to')).toBeDisabled();
    // And when it lands the row stops saying it, rather than sitting there.
    await expect(row).not.toContainText('Putting them on it…');
    await expect(row.getByRole('alert')).toHaveCount(0);
  });

  test('a second name that the machine does take clears the refusal from the first', async ({ page, world }) => {
    world.set('assignRequest', (vars) => vars.assignee === 'Ravi Kumar');
    await page.goto('/app/services');
    const row = orderRow(page, 'W-2101');
    await row.getByRole('button', { name: 'Track order' }).click();

    await row.getByLabel('Assign to').selectOption('Srinivas');
    await expect(row.getByRole('alert')).toContainText('That did not go through.');

    await row.getByLabel('Assign to').selectOption('Ravi Kumar');

    await expect(row.getByRole('alert')).toHaveCount(0);
    expect(world.calls('assignRequest').map((c) => c.vars.assignee))
      .toEqual(['Srinivas', 'Ravi Kumar']);
  });

  test('a name the machine will not take is put back, and the row says so', async ({ page, world }) => {
    world.set('assignRequest', false);
    await page.goto('/app/services');
    await orderRow(page, 'W-2101').getByRole('button', { name: 'Track order' }).click();

    const picker = orderRow(page, 'W-2101').getByLabel('Assign to');
    await picker.selectOption('Srinivas');

    await expect(orderRow(page, 'W-2101').getByRole('alert')).toContainText(
      'That did not go through. Nothing on this job has changed — reload the page and try again.',
    );
    // The select is uncontrolled, so the name that did not take must not sit
    // there looking saved.
    await expect(picker).toHaveValue('');
  });

  test('an assignment that never reached the server says the same thing, and says why', async ({ page, world }) => {
    world.set('assignRequest', World.gqlError('the work queue is down'));
    await page.goto('/app/services');
    await orderRow(page, 'W-2101').getByRole('button', { name: 'Track order' }).click();
    await orderRow(page, 'W-2101').getByLabel('Assign to').selectOption('Ravi Kumar');

    await expect(orderRow(page, 'W-2101').getByRole('alert'))
      .toContainText('That did not go through.');
    // The reason itself arrives as a toast from the shared mutation helper.
    const toast = page.locator('.toast').filter({ hasText: 'That assignment' });
    await expect(toast).toContainText('That assignment could not be saved. Nothing has changed.');
    await expect(toast).toContainText('the work queue is down');
  });

  test('closing the panel is how the failed assignment is cleared', async ({ page, world }) => {
    world.set('assignRequest', false);
    await page.goto('/app/services');
    const row = orderRow(page, 'W-2101');
    await row.getByRole('button', { name: 'Track order' }).click();
    await row.getByLabel('Assign to').selectOption('Ravi Kumar');
    await expect(row.getByRole('alert')).toBeVisible();

    await row.getByRole('button', { name: 'Hide' }).click();
    await row.getByRole('button', { name: 'Track order' }).click();

    await expect(row.getByRole('alert')).toHaveCount(0);
  });

  test('an account with nobody to hand work to is told so, not given a picker that cannot do anything', async ({ page, world }) => {
    world.set('assignable', []);
    await page.goto('/app/services');
    await orderRow(page, 'W-2101').getByRole('button', { name: 'Track order' }).click();

    // The whole sentence: it is not enough to say there is nobody, because the
    // job still has to reach a surveyor. The way through is named.
    await expect(orderRow(page, 'W-2101')).toContainText(
      'Nobody has worked on your records yet, so there is no name to pick. Open the '
      + 'service and send this to someone — Pattadar does the sending, so you can take it back.',
    );
    await expect(orderRow(page, 'W-2101').getByLabel('Assign to')).toHaveCount(0);
  });

  test('a job that is over says nobody was ever on it rather than offering a picker', async ({ page }) => {
    await page.goto('/app/services');
    await page.getByRole('button', { name: 'Everything, including done' }).click();

    const row = orderRow(page, 'W-2099');
    await row.getByRole('button', { name: 'Track order' }).click();

    await expect(row).toContainText('Nobody was ever put on this job.');
    await expect(row.getByLabel('Assign to')).toHaveCount(0);
  });

  test('nothing on order says so, and offers the finished work rather than a filter chip over an empty box', async ({ page, world }) => {
    world.set('orders', []);
    await page.goto('/app/services');

    await expect(page.getByText('Nothing is on order')).toBeVisible();
    await expect(page.getByText(
      'A survey, an EC, a title opinion or a site visit can be ordered from any record',
    )).toBeVisible();
    // The chip row is gone: the one question an empty Open list raises is
    // answered by the button inside the empty state.
    await expect(page.getByRole('button', { name: 'Open', exact: true })).toHaveCount(0);

    await page.getByRole('button', { name: 'Everything, including done' }).click();

    await expect(page.getByText('Nothing has ever been ordered')).toBeVisible();
    // Asked for everything, the chips are back — there is somewhere to go.
    await expect(page.getByRole('button', { name: 'Open', exact: true })).toBeVisible();
  });

  test('a list still loading does not claim there is nothing on order', async ({ page, world }) => {
    world.set('orders', World.never());
    await page.goto('/app/services');

    await expect(page.getByText('Loading…')).toBeVisible();
    await expect(page.getByText('Nothing is on order')).toHaveCount(0);
    await expect(page.getByText('Work you have ordered did not load')).toHaveCount(0);
  });

  test('a list that did not load says so, says nothing was lost, and prints the reason', async ({ page, world }) => {
    world.set('orders', World.gqlError('the work queue is down'));
    await page.goto('/app/services');

    const failed = page.getByRole('alert').filter({ hasText: 'Work you have ordered did not load' });
    await expect(failed).toBeVisible();
    await expect(failed).toContainText('Nothing has been lost');
    await expect(failed).toContainText('the work queue is down');
    await expect(failed.getByRole('button', { name: 'Try again' })).toBeVisible();
    // Not the empty state. An outage is not an answer about your orders.
    await expect(page.getByText('Nothing is on order')).toHaveCount(0);
  });

  test('the header goes straight into ordering, without a detour through the property list', async ({ page }) => {
    await page.goto('/app/services');
    await expect(page.getByRole('link', { name: 'Order a service' })).toHaveAttribute('href', '/app/order');
  });

  test('the pips count out how far along a job is, and carry the row’s own word', async ({ page, world }) => {
    // `stage` is a 0-based index into ORDER_STAGES — services/api/src/
    // ticketing.py STATUS_STAGE writes placed=0, assigned=1, on_site=2,
    // submitted=3 — and Rail (ui.tsx:755) counts it out loud because four
    // amber dashes say nothing to a screen reader. It is set here rather than
    // read off the seed, whose rows number their stages from 1.
    world.set('orders', ordersAnswer(ORDERS.map((o) => ({ ...o, stage: o.stage - 1 }))));
    await page.goto('/app/services');

    await expect(orderRow(page, 'W-2101').getByLabel('Stage 1 of 4')).toBeVisible();
    await expect(orderRow(page, 'W-2103').getByLabel('Stage 3 of 4')).toBeVisible();
    // The word beside the pips is the row's status, not the stage's name: a
    // job at Delivered that is waiting on this person says so.
    await expect(orderRow(page, 'W-2105').getByLabel('Stage 4 of 4')).toContainText('Waiting on you');
    await expect(orderRow(page, 'W-2106').getByLabel('Stage 2 of 4')).toContainText('Sent out');
    // The pips are bare <i>s with no role of their own; `i.on` is how many are
    // lit, which is the only thing a glance down the list actually reads.
    await expect(orderRow(page, 'W-2101').locator('.rail i.on')).toHaveCount(1);
    await expect(orderRow(page, 'W-2105').locator('.rail i.on')).toHaveCount(4);
  });

  test('a stage the rail has no pip for still reads as a stage, rather than as none', async ({ page, world }) => {
    // `stage` is the server's integer and Rail (ui.tsx:755) clamps it into
    // ORDER_STAGES rather than indexing past the end. Orders.tsx:27-31 worries
    // in writing about a ninth status arriving; when it does, the row must
    // still count itself out loud instead of lighting nothing and naming
    // nothing.
    world.set('orders', ordersAnswer(ORDERS.map((o) => {
      if (o.id === TICKET.placed) return { ...o, stage: -1 };
      if (o.id === TICKET.assigned) return { ...o, stage: 9 };
      return o;
    })));
    await page.goto('/app/services');

    await expect(orderRow(page, 'W-2101').getByLabel('Stage 1 of 4')).toBeVisible();
    await expect(orderRow(page, 'W-2101').locator('.rail i.on')).toHaveCount(1);
    await expect(orderRow(page, 'W-2102').getByLabel('Stage 4 of 4')).toBeVisible();
    await expect(orderRow(page, 'W-2102').locator('.rail i.on')).toHaveCount(4);
  });

  test('a job against a record with no name of its own draws no nameless link', async ({ page, world }) => {
    // Orders.tsx:164 gates the record link on `o.recordTitle` as well as on
    // `showRecord`. A link with nothing written in it is announced by its href
    // and clicked by accident; the row is owed one link, the service's.
    world.set('orders', ordersAnswer(ORDERS.map((o) =>
      (o.id === TICKET.placed ? { ...o, recordTitle: '' } : o))));
    await page.goto('/app/services');

    const row = orderRow(page, 'W-2101');
    await expect(row.getByRole('link', { name: 'Open the service' })).toBeVisible();
    await expect(row.getByRole('link')).toHaveCount(1);
    // And the rows that do have a name still carry it.
    await expect(orderRow(page, 'W-2102').getByRole('link', { name: 'Sy 214/2' })).toBeVisible();
  });

  test('Try again on a list that did not load really asks again, and the rows arrive', async ({ page, world }) => {
    world.set('orders', World.gqlError('the work queue is down'));
    await page.goto('/app/services');
    const failed = page.getByRole('alert').filter({ hasText: 'Work you have ordered did not load' });
    await expect(failed).toBeVisible();
    const before = world.calls('orders').length;

    // The server comes back. The button is the only thing that asks it again —
    // a retry that refetched in silence would be a dead control on the one
    // screen where giving up means ringing somebody.
    world.set('orders', ordersAnswer(ORDERS));
    await failed.getByRole('button', { name: 'Try again' }).click();

    await expect.poll(() => world.calls('orders').length).toBeGreaterThan(before);
    await expect(orderRow(page, 'W-2101')).toBeVisible();
    await expect(page.locator('.rows.boxed > div')).toHaveCount(6);
    await expect(failed).toHaveCount(0);
  });

  // ── defect ───────────────────────────────────────────────────────────
  test('names that could not be read say so, instead of a picker with nobody in it', async ({ page, world }) => {
    // DEFECT — apps/web/src/w360/pages/Orders.tsx:61 reads `useAssignable()`
    // as `{ data: people }` and never looks at its `error`, so a read that
    // failed and a read still in flight are the same screen: a select labelled
    // "Assign to" whose only option is "Nobody yet", for ever. Lines 63-67 of
    // that same file already rule that out in writing — "a select whose only
    // option is 'Nobody yet' is a control that cannot do anything" — and write
    // a sentence for the account that truly has no names. An outage is owed
    // the third state, not the first one's silence: a line saying the names
    // could not be read, with the service as the way through, the way the empty
    // branch beside it already offers one.
    test.fail();
    world.set('assignable', World.gqlError('the people store is down'));
    await page.goto('/app/services');
    await orderRow(page, 'W-2101').getByRole('button', { name: 'Track order' }).click();
    await expect(orderRow(page, 'W-2101').getByRole('button', { name: 'Hide' })).toBeVisible();

    // Either shape of fix counts: the module's own `Failed` ("… did not
    // load") or a sentence of this row's own. What must not happen is silence.
    await expect(orderRow(page, 'W-2101'))
      .toContainText(/did not load|could not be read/i, { timeout: 3000 });
  });
});

// ═══════════════════════════════════════════════════════════════════════
// /app/assigned — waiting on you
// ═══════════════════════════════════════════════════════════════════════

test.describe('Waiting on you', () => {
  test('only the jobs sitting on my decision are here', async ({ page }) => {
    await page.goto('/app/assigned');

    await expect(page.getByRole('heading', { name: 'Waiting on you' })).toBeVisible();
    await expect(page.getByText(
      'Orders that have come back and need your decision.',
    )).toBeVisible();

    // One of the eight: the delivered job with two things to look at.
    await expect(page.locator('.rows.boxed > div')).toHaveCount(1);
    await expect(orderRow(page, 'W-2105')).toContainText('2 to look at');
    // A job placed with nobody on it is not waiting on anybody.
    await expect(orderRow(page, 'W-2101')).toHaveCount(0);
    await expect(orderRow(page, 'W-2102')).toHaveCount(0);
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
    await page.goto('/app/assigned');

    await expect(page.locator('.rows.boxed > div')).toHaveCount(2);
    await expect(orderRow(page, 'W-2103')).toContainText('3 to look at');
    await expect(orderRow(page, 'W-2104')).toContainText('Needs you');
    // The row that was on the list only because the seed flagged it is gone.
    await expect(orderRow(page, 'W-2105')).toHaveCount(0);
  });

  test('the page that says what is waiting never asks for finished work', async ({ page, world }) => {
    await page.goto('/app/assigned');
    await expect(orderRow(page, 'W-2105')).toBeVisible();

    // Every read on this route — the page's and the Shell badge's, which share
    // the key — asks for the open list across every record.
    expect(world.calls('orders').map((c) => c.vars))
      .toContainEqual({ recordId: null, includeClosed: false });
    expect(world.calls('orders').every((c) => c.vars.includeClosed === false)).toBe(true);
  });

  test('this page names the record each job is against, because the list crosses records', async ({ page }) => {
    await page.goto('/app/assigned');
    await expect(orderRow(page, 'W-2105').getByRole('link', { name: 'Sy 214/2' }))
      .toHaveAttribute('href', `/app/records/${ID.parcel}`);
  });

  test('the Open and Everything chips are gone, because a finished job is not waiting on anybody', async ({ page }) => {
    await page.goto('/app/assigned');
    await expect(page.getByRole('button', { name: 'Everything, including done' })).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Order a service' })).toHaveCount(0);
  });

  test('with nothing waiting it says so, and points at everything I have ordered', async ({ page, world }) => {
    world.set('orders', OPEN_ORDERS.filter((o) => !o.needsYou && o.pendingReview === 0));
    await page.goto('/app/assigned');

    await expect(page.getByText('Nothing is waiting on you')).toBeVisible();
    await expect(page.getByText('Money stays set aside until you do.')).toBeVisible();
    // Not the Services empty state: this list asks a different question.
    await expect(page.getByText('Nothing is on order')).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Everything you have ordered' }))
      .toHaveAttribute('href', '/app/services');
  });

  test('while it loads it does not say nothing is waiting on you', async ({ page, world }) => {
    world.set('orders', World.never());
    await page.goto('/app/assigned');

    await expect(page.getByText('Loading…')).toBeVisible();
    await expect(page.getByText('Nothing is waiting on you')).toHaveCount(0);
  });

  test('a read that failed here is named as a failure, not as an empty inbox', async ({ page, world }) => {
    world.set('orders', World.gqlError('the work queue is down'));
    await page.goto('/app/assigned');

    await expect(page.getByRole('alert').filter({ hasText: 'Work waiting on you did not load' }))
      .toBeVisible();
    await expect(page.getByText('Nothing is waiting on you')).toHaveCount(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// /app/records/:id/services
// ═══════════════════════════════════════════════════════════════════════

test.describe("A record's services", () => {
  test('the record’s own list asks for that record’s work and nobody else’s', async ({ page, world }) => {
    await page.goto(`/app/records/${ID.parcel}/services`);

    await expect(page.getByRole('heading', { name: 'What you have ordered' })).toBeVisible();
    // The same sentence the order flow one click away says, and the service
    // says on arrival: placing an order takes nothing from anybody.
    await expect(page.getByText(
      'Nothing is taken when you order. Money is set aside on the job, and is only owed '
      + 'once you accept what came back.',
    )).toBeVisible();
    await expect(page.getByText('Sy 214/2 · Katragunta')).toBeVisible();

    await expect.poll(() => world.calls('orders').map((c) => c.vars))
      .toContainEqual({ recordId: ID.parcel, includeClosed: false });
    await expect(page.locator('.rows.boxed > div')).toHaveCount(6);
    // No record name on the rows: every one of them is this record's.
    await expect(orderRow(page, 'W-2102').getByRole('link', { name: 'Sy 214/2' })).toHaveCount(0);
  });

  test('ordering from a record already knows which property it is for', async ({ page }) => {
    await page.goto(`/app/records/${ID.parcel}/services`);
    await expect(page.getByRole('link', { name: 'Order a service' }))
      .toHaveAttribute('href', `/app/records/${ID.parcel}/order`);
  });

  test('a record whose work is all done can still be asked what it cost', async ({ page, world }) => {
    await page.goto(`/app/records/${ID.parcel}/services`);
    await page.getByRole('button', { name: 'Everything, including done' }).click();

    await expect.poll(() => world.calls('orders').some(
      (c) => c.vars.recordId === ID.parcel && c.vars.includeClosed === true,
    )).toBe(true);
    expect(world.lastVars('orders')).toMatchObject({ recordId: ID.parcel, includeClosed: true });
    await expect(orderRow(page, 'W-2098')).toContainText('Done');
  });

  test('a record nothing has been ordered against says so', async ({ page }) => {
    await page.goto(`/app/records/${ID.plot}/services`);

    await expect(page.getByText('Nothing is on order')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Open', exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Everything, including done' })).toBeVisible();
  });

  test('a record with nothing open can be asked what it has ever ordered, from the empty state itself', async ({ page, world }) => {
    // The one question an empty Open list raises, answered by the button inside
    // the empty state rather than by a filter chip over an empty box.
    world.set('orders', ordersAnswer(ORDERS.filter((o) => o.status === 'accepted' || o.status === 'cancelled')));
    await page.goto(`/app/records/${ID.parcel}/services`);
    await expect(page.getByText('Nothing is on order')).toBeVisible();

    await page.getByRole('button', { name: 'Everything, including done' }).click();

    await expect.poll(() => world.calls('orders').some(
      (c) => c.vars.recordId === ID.parcel && c.vars.includeClosed === true,
    )).toBe(true);
    await expect(orderRow(page, 'W-2098')).toContainText('Done');
    await expect(orderRow(page, 'W-2099')).toContainText('Cancelled');
    // And now there is somewhere to go back to, so the chips are on screen.
    await expect(page.getByRole('button', { name: 'Open', exact: true })).toBeVisible();
  });

  test('a record’s services still loading does not read as a record that never ordered anything', async ({ page, world }) => {
    world.set('orders', World.never());
    await page.goto(`/app/records/${ID.parcel}/services`);

    await expect(page.getByText('Loading…')).toBeVisible();
    await expect(page.getByText('Nothing is on order')).toHaveCount(0);
  });

  test('a record’s services that did not load says so in that record’s words', async ({ page, world }) => {
    world.set('orders', World.gqlError('the work queue is down'));
    await page.goto(`/app/records/${ID.parcel}/services`);

    await expect(page.getByRole('alert').filter({ hasText: "This record's services did not load" }))
      .toBeVisible();
    // And not the empty state — an outage is not an answer about this record.
    await expect(page.getByText('Nothing is on order')).toHaveCount(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// /app/records/:id/history — what has been corrected
// ═══════════════════════════════════════════════════════════════════════

test.describe("A record's audit", () => {
  test('every correction is kept, with what the value used to be beside what it is now', async ({ page, world }) => {
    await page.goto(`/app/records/${ID.parcel}/history`);

    await expect(page.getByRole('heading', { name: 'What has been changed' })).toBeVisible();
    await expect(page.getByText('nothing is removed from this list')).toBeVisible();
    expect(world.lastVars('corrections')).toMatchObject({ id: ID.parcel });

    await expect(page.locator('.rows.boxed > div')).toHaveCount(CORRECTIONS.length);
    const khata = page.locator('.rows.boxed > div').filter({ hasText: 'Khata number' });
    await expect(khata).toContainText('1041');
    await expect(khata).toContainText('1042');
    await expect(khata.locator('s')).toHaveText('1041');
    await expect(khata).toContainText('2026-08-20');
    await expect(khata).toContainText('Shankar Reddy');
  });

  test('a record nothing has been corrected on says so, and says what would appear', async ({ page }) => {
    await page.goto(`/app/records/${ID.flat}/history`);

    await expect(page.getByText('Nothing has been corrected on this record yet.')).toBeVisible();
    await expect(page.getByText('the old one appears here beside the new')).toBeVisible();
  });

  test('a value that had nothing in it before is shown as a dash, not as a blank', async ({ page, world }) => {
    // `<s>{c.was || '—'}</s>` (Orders.tsx:317). A struck blank reads as a
    // rendering fault; the dash says the field was empty until this change.
    world.set('corrections', [{
      id: 'w-corr-9', field: 'Khata number', was: '', now: '1042',
      at: '2026-09-01T05:00:00Z', by: 'Shankar Reddy',
    }]);
    await page.goto(`/app/records/${ID.parcel}/history`);

    const row = page.locator('.rows.boxed > div').filter({ hasText: 'Khata number' });
    await expect(row.locator('s')).toHaveText('—');
    await expect(row).toContainText('1042');
    await expect(row).toContainText('2026-09-01');
  });

  test('a value that was cleared is shown as a dash on the new side too', async ({ page, world }) => {
    // The mirror of the struck side: `<span className="accent">{c.now || '—'}</span>`
    // (Orders.tsx:317). A khata that was REMOVED must read "1041 → —"; a line
    // that stops at the arrow reads as a half-drawn row, not as a deletion.
    world.set('corrections', [{
      id: 'w-corr-10', field: 'Khata number', was: '1041', now: '',
      at: '2026-09-02T05:00:00Z', by: 'Shankar Reddy',
    }]);
    await page.goto(`/app/records/${ID.parcel}/history`);

    const row = page.locator('.rows.boxed > div').filter({ hasText: 'Khata number' });
    await expect(row.locator('s')).toHaveText('1041');
    await expect(row).toContainText('1041 → —');
    await expect(row).toContainText('2026-09-02');
  });

  test('the audit list says it is loading rather than saying nothing has changed', async ({ page, world }) => {
    world.set('corrections', World.never());
    await page.goto(`/app/records/${ID.parcel}/history`);

    await expect(page.getByText('Loading…')).toBeVisible();
    await expect(page.getByText('Nothing has been corrected on this record yet.')).toHaveCount(0);
  });

  // ── defect ───────────────────────────────────────────────────────────
  test('an audit read that failed is not reported as nothing to report', async ({ page, world }) => {
    // DEFECT — apps/web/src/w360/pages/Orders.tsx:284 destructures
    // `useCorrections` WITHOUT `error`, and line 300 then treats
    // `(data ?? []).length === 0` as "nothing has been corrected". A failed
    // read and a clean history are the same screen, so an outage tells the
    // owner their record has never been corrected — on the one tab whose
    // whole promise is "nothing is removed from this list". Every other list
    // in this file has a `Failed` branch; this one is owed the same:
    //   `: !data ? <Failed what="This record's corrections" error={error} />`
    test.fail();
    world.set('corrections', World.gqlError('the audit store is down'));
    await page.goto(`/app/records/${ID.parcel}/history`);

    await expect(page.getByRole('alert').filter({ hasText: 'did not load' }))
      .toBeVisible({ timeout: 3000 });
  });
});

// ═══════════════════════════════════════════════════════════════════════
// /app/order — which land is this for
// ═══════════════════════════════════════════════════════════════════════

/** One card in the land grid.
 *
 *  Both grids on this page are `.cards` holding `<a class="rec">` — the land
 *  above, the read-only catalogue below — and the only thing that tells them
 *  apart in the DOM is that the land grid is a direct child of `<main>` while
 *  the catalogue's sits inside `<section class="sec">`. A card's accessible
 *  name is its whole meat (title, place, extent, map word, jobs), so it is
 *  named by the text it contains rather than by a role name. */
const landCard = (page: Page, title: string) =>
  page.locator('main > .cards a.rec').filter({ hasText: title });

const landCards = (page: Page) => page.locator('main > .cards a.rec');

/** One tile in the catalogue strip under the grid. It composes nothing: it is
 *  a link that re-heads this same page. */
const offerTile = (page: Page, label: string) =>
  page.locator('section.sec .cards a.rec').filter({ hasText: label });

test.describe('Choosing the land', () => {
  test('the first question is which land, and this screen composes no order at all', async ({ page, world }) => {
    await page.goto('/app/order');

    await expect(page.getByRole('heading', { name: 'Which land is this for?' })).toBeVisible();
    await expect(page.getByText(
      'Every service is done on one piece of land. Choose it, and we will show you what '
      + 'that land actually needs.',
    )).toBeVisible();

    // Four of the five seeded records: the archived shop is not land anybody
    // can order work on, and `properties` leaves it out until the archived
    // facet asks for it.
    await expect(landCards(page)).toHaveCount(4);
    await expect(landCard(page, 'Sy 214/2')).toBeVisible();
    await expect(landCard(page, 'Flat 4B, Sai Residency')).toBeVisible();
    await expect(landCard(page, 'Shop 7, Market Road')).toHaveCount(0);

    // Nothing on this screen can file anything: no question sheet, no
    // attachment picker, no order button.
    await expect(page.getByRole('button', { name: /Place the order/ })).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'What we need to know' })).toHaveCount(0);
    expect(world.calls('orderService')).toHaveLength(0);
    expect(world.lastVars('properties')).toMatchObject({
      kinds: [], statuses: [], stakes: [], derived: [], tags: [],
    });
  });

  test('each card says how big the land is, its khata, and whether anybody can find it', async ({ page }) => {
    await page.goto('/app/order');

    const parcel = landCard(page, 'Sy 214/2');
    await expect(parcel).toContainText('Katragunta, Markapur, Prakasam');
    await expect(parcel).toContainText('4 acres');
    await expect(parcel).toContainText('Khata 1042');
    // The point of the redesign, said before a service is even a thought.
    await expect(parcel).toContainText('Boundary on map');

    // A record with a pin and no corners, and one with neither, are two
    // different answers — and neither of them is "Boundary on map".
    await expect(landCard(page, 'Flat 4B, Sai Residency')).toContainText('Location pin only');
    await expect(landCard(page, 'Flat 4B, Sai Residency')).toContainText('1,450 sft');
    // A flat with no khata number does not print a dangling "Khata".
    await expect(landCard(page, 'Flat 4B, Sai Residency')).not.toContainText('Khata');
    await expect(landCard(page, 'Sy 88')).toContainText('Add a location to show on map');
    await expect(landCard(page, 'Sy 88')).toContainText('Khata 318');
  });

  test('a card says how much work is already running on that land', async ({ page }) => {
    await page.goto('/app/order');

    // All six open jobs in the world are against this one parcel.
    await expect(landCard(page, 'Sy 214/2')).toContainText('6 jobs already running here');
    // And a record nothing is running on says nothing, rather than "0 jobs".
    await expect(landCard(page, 'Sy 88')).not.toContainText('already running here');
  });

  test('while the count of running jobs is still in flight a card claims nothing about it', async ({ page, world }) => {
    world.set('orders', World.never());
    await page.goto('/app/order');

    // The absence of the badge is not a claim that there is no work here, so
    // the card must not print one until the read lands.
    await expect(landCard(page, 'Sy 214/2')).toContainText('4 acres');
    await expect(landCard(page, 'Sy 214/2')).not.toContainText('already running here');
    await expect(page.getByText('We could not check what is already running on your land.')).toHaveCount(0);
  });

  test('a count that could not be read is said once, and does not withhold the land', async ({ page, world }) => {
    world.set('orders', World.gqlError('the work queue is down'));
    await page.goto('/app/order');

    await expect(page.getByText('We could not check what is already running on your land.')).toBeVisible();
    // Thirty perfectly good cards are not withheld because a count failed.
    await expect(landCards(page)).toHaveCount(4);
    await expect(landCard(page, 'Sy 214/2')).not.toContainText('already running here');
  });

  test('a portfolio still arriving is not an account with no land', async ({ page, world }) => {
    world.set('properties', World.never());
    await page.goto('/app/order');

    await expect(page.getByRole('status', { name: 'Loading your properties' })).toBeVisible();
    await expect(page.getByText('No land to order against yet')).toHaveCount(0);
    await expect(page.getByRole('alert')).toHaveCount(0);
  });

  test('a portfolio that did not load says so rather than offering nothing to order against', async ({ page, world }) => {
    world.set('properties', World.gqlError('the portfolio read failed'));
    await page.goto('/app/order');

    const failed = page.getByRole('alert').filter({ hasText: 'Your land did not load' });
    await expect(failed).toBeVisible();
    await expect(failed).toContainText('the portfolio read failed');
    await expect(page.getByText('No land to order against yet')).toHaveCount(0);
  });

  test('an account with no land yet is told to add some, and can still read what this costs', async ({ page, world }) => {
    world.set('properties', propertyList([]));
    await page.goto('/app/order');

    await expect(page.getByText('No land to order against yet')).toBeVisible();
    await expect(page.getByText(
      'A service is always done on one piece of land. Add the land first, then come back and order.',
    )).toBeVisible();
    await expect(page.getByRole('link', { name: 'Add a property' }))
      .toHaveAttribute('href', '/app/properties?new=1');
    // …and the catalogue is still under it: a first-time owner has to be able
    // to see what this app is for before being asked to add a property.
    await expect(page.getByRole('heading', { name: 'What can be ordered' })).toBeVisible();
    await expect(offerTile(page, 'Encumbrance Certificate')).toBeVisible();
  });

  test('searching narrows the land I already hold, without asking the server a second time', async ({ page, world }) => {
    await page.goto('/app/order');
    await expect(landCards(page)).toHaveCount(4);
    const asked = world.calls('properties').length;

    await page.getByLabel('Find your land').fill('Kukatpally');

    await expect(landCards(page)).toHaveCount(1);
    await expect(landCard(page, 'Flat 4B, Sai Residency')).toBeVisible();
    // The narrowing is in the URL, so a reload and a followed catalogue tile
    // both keep it — and it is done over the cards already held.
    await expect(page).toHaveURL('/app/order?q=Kukatpally');
    expect(world.calls('properties')).toHaveLength(asked);
  });

  test('a search that matches no land says so in my own words, and offers to clear itself', async ({ page }) => {
    await page.goto('/app/order');
    await page.getByLabel('Find your land').fill('Vizag');

    await expect(page.getByText('No land matches “Vizag”')).toBeVisible();
    await expect(page.getByText('Try the village name, the survey number or the khata number.')).toBeVisible();
    await expect(landCards(page)).toHaveCount(0);

    await page.getByRole('button', { name: 'Clear' }).click();

    await expect(landCards(page)).toHaveCount(4);
    await expect(page).toHaveURL('/app/order');
  });

  test('a portfolio longer than the fold shows a batch and a way to the rest', async ({ page, world }) => {
    const many = Array.from({ length: 30 }, (_, i) => ({
      ...CARDS[0], id: `w-many-${i}`, title: `Sy ${400 + i}`, coverFileRef: '',
    }));
    world.set('properties', propertyList(many));
    await page.goto('/app/order');

    // A batch and a button, which is what the Properties grid already does —
    // not a sentence apologising that twenty of them are unreachable.
    await expect(landCards(page)).toHaveCount(24);
    await page.getByRole('button', { name: 'Show all 30' }).click();
    await expect(landCards(page)).toHaveCount(30);
  });

  test('the catalogue under the grid prices every job and says what an owner calls it', async ({ page }) => {
    await page.goto('/app/order');

    await expect(page.getByRole('heading', { name: 'What can be ordered' })).toBeVisible();
    await expect(page.getByText(
      'Six jobs, on any one piece of your land. Choose the land first — the price and the '
      + 'wait are the same whichever you pick.',
    )).toBeVisible();
    await expect(page.locator('section.sec .cards a.rec')).toHaveCount(OFFERS.length);

    const ec = offerTile(page, 'Encumbrance Certificate');
    await expect(ec).toContainText('₹1,180');
    await expect(ec).toContainText('about 7 days');
    await expect(ec).toContainText("The registrar's list of every transaction on this land");
    // Typing "EC" into a search box answered nothing; a line on the tile always does.
    await expect(ec).toContainText('Also called an EC');
    await expect(offerTile(page, 'Mutation / name transfer')).toContainText('Also called a name transfer');
    await expect(offerTile(page, 'Boundary re-survey')).toContainText('₹2,900');
    await expect(offerTile(page, 'Certified patta copy')).toContainText('₹450');
  });

  test('following a service from the catalogue re-heads this page with that service in the question', async ({ page, world }) => {
    await page.goto('/app/order');

    await offerTile(page, 'Boundary re-survey').click();

    await expect(page).toHaveURL('/app/order?service=survey');
    await expect(page.getByRole('heading', { name: 'Which land is the boundary re-survey for?' }))
      .toBeVisible();
    // Still nothing composed: the tile asked the same question again, more
    // narrowly, against no property at all.
    expect(world.calls('orderService')).toHaveLength(0);
    await expect(page.getByRole('link', { name: 'Choose a different service' }))
      .toHaveAttribute('href', '/app/order');
  });

  test('a search survives following a catalogue tile', async ({ page }) => {
    await page.goto('/app/order?q=Katragunta');
    await expect(landCards(page)).toHaveCount(2);

    await offerTile(page, 'Site visit').click();

    await expect(page).toHaveURL('/app/order?service=site_visit&q=Katragunta');
    await expect(page.getByLabel('Find your land')).toHaveValue('Katragunta');
    await expect(landCards(page)).toHaveCount(2);
    await expect(page.getByRole('link', { name: 'Choose a different service' }))
      .toHaveAttribute('href', '/app/order?q=Katragunta');
  });

  test('choosing the land hands the order to that land, and keeps the service that was asked for', async ({ page }) => {
    await page.goto('/app/order?service=survey');

    await landCard(page, 'Sy 214/2').click();

    await expect(page).toHaveURL(`/app/records/${ID.parcel}/order?service=survey&step=pick`);
    await expect(page.getByRole('heading', { name: 'What do you want done on this land?' })).toBeVisible();
  });

  test('an old link that named the land in the query string lands in that land’s own flow', async ({ page }) => {
    await page.goto(`/app/order?record=${ID.parcel}`);

    // Replaced, not pushed: Back must not bounce off the redirect.
    await expect(page).toHaveURL(`/app/records/${ID.parcel}/order?step=pick`);
    await expect(page.getByRole('heading', { name: 'What do you want done on this land?' })).toBeVisible();

    await page.goto(`/app/order?record=${ID.parcel}&service=ec`);
    await expect(page).toHaveURL(`/app/records/${ID.parcel}/order?service=ec&step=pick`);
  });

  test('a catalogue still arriving is not a catalogue with nothing in it', async ({ page, world }) => {
    world.set('servicesOffered', World.never());
    await page.goto('/app/order');
    await expect(landCard(page, 'Sy 214/2')).toBeVisible();

    await expect(page.getByText('Loading the list of services…')).toBeVisible();
    await expect(page.getByText('There is nothing on offer just now')).toHaveCount(0);
  });

  test('a catalogue that did not load is named where it failed, and the land is still choosable', async ({ page, world }) => {
    world.set('servicesOffered', World.gqlError('the catalogue service is down'));
    await page.goto('/app/order');

    const failed = page.getByRole('alert').filter({ hasText: 'The list of services did not load' });
    await expect(failed).toBeVisible();
    await expect(failed).toContainText('the catalogue service is down');
    // The outage does not decide whether anything can be ordered.
    await expect(landCards(page)).toHaveCount(4);
  });

  test('a catalogue with nothing on offer says so, and still leaves a way to ask somebody', async ({ page, world }) => {
    world.set('servicesOffered', []);
    await page.goto('/app/order');

    await expect(page.getByText('There is nothing on offer just now')).toBeVisible();
    await expect(page.getByText(
      'Nothing is wrong with your land. You can still ask a surveyor, an advocate or a '
      + 'caretaker directly from any record.',
    )).toBeVisible();
    await expect(landCards(page)).toHaveCount(4);
  });

  test('a land card states the extent the rest of the app states, down to the gunta', async ({ page }) => {
    // This screen used to print `extent(v, unit)`, which rounds to the unit:
    // 4.3 acres drew as "4 acres". Twelve guntas is a third of an acre, not a
    // rounding error, and the Properties grid this card is deliberately a copy
    // of prints the server's own words. `extentLine` in orderFlow.ts is what
    // keeps one piece of land one size on both screens.
    await page.goto('/app/order');

    await expect(landCard(page, 'Sy 214/2')).toContainText('4 acres 12 guntas', { timeout: 3000 });
  });
});

// ═══════════════════════════════════════════════════════════════════════
// /app/records/:id/order — the four steps of one order
// ═══════════════════════════════════════════════════════════════════════

/** One service tile in the flow's chooser. `.choice.svc` holds nothing else,
 *  and a tile's accessible name is its label, its price, its wait and its
 *  sub-line run together — so it is named by the text it contains. */
const svcTile = (page: Page, label: string) =>
  page.locator('.choice.svc button').filter({ hasText: label });

/** One row of the review summary, named by the key in its left column.
 *  `KV` renders `<div class="kv"><div><span class="k">…</span><span class="v">…`
 *  with no roles at all, and several values repeat their own key's words. */
const kvRow = (page: Page, k: string) =>
  page.locator('.kv > div').filter({
    has: page.locator('span.k').filter({ hasText: new RegExp(`^${k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`) }),
  });

/** The seeded `record` answer with a field or two changed.
 *
 *  `world.seedOf('record')` refuses it — the seed answers it with a function
 *  of its variables — so the seed's own answer is called and patched, rather
 *  than a second hand-written RecordDetail drifting from the one in seed.ts.
 *  Q_RECORD selects forty fields and a missing one draws as `undefined`. */
const recordLike = (over: Record<string, unknown>) =>
  (vars: Record<string, unknown>, query: string) => {
    const answer = SEED.record as (v: Record<string, unknown>, q: string) => Record<string, unknown> | null;
    const base = answer(vars, query);
    return base ? { ...base, ...over } : base;
  };

/** A job the server filed, as `orders` answers it once it exists. */
const newJob = (over: Record<string, unknown> = {}) => ({
  ...ORDERS[0], id: 'w-tkt-new', ref: 'W-2199', kind: 'survey', title: 'Boundary re-survey',
  detail: 'All four', cost: 2_900, assignee: '', stage: 1, stageLabel: 'Placed',
  status: 'placed', statusLabel: 'Placed', statusState: '', needsYou: false, pendingReview: 0,
  held: 0, dueDate: '2026-09-25', recordId: ID.parcel, recordTitle: 'Sy 214/2', ...over,
});

/** Walks the flow to the review step with its questions already answered.
 *
 *  `?a.<field>=` is the app's own door for that — it is how the one-tap
 *  buttons on the Features and Photos hangers hand their answer over — so a
 *  test about the review is not also a test about typing. */
async function toReview(
  page: Page, recordId: string, service: string,
  answers: Record<string, string> = {}, extra = '',
) {
  const a = Object.entries(answers)
    .map(([k, v]) => `&a.${k}=${encodeURIComponent(v)}`).join('');
  await page.goto(`/app/records/${recordId}/order?service=${service}&step=tell${a}${extra}`);
  await page.getByRole('button', { name: 'Check the order' }).click();
  await expect(page.getByRole('heading', { name: 'Check this before it goes in' })).toBeVisible();
}

/** One line of the needs strip. The card holding it has no title and so no
 *  heading to name it by; the rail's own nav has list items too. */
const need = (page: Page, says: string) =>
  page.locator('.card.flat li').filter({ hasText: says });

test.describe('Ordering a service', () => {
  // ── step 2 · what do you want done ─────────────────────────────────

  test('the flow opens on what this land needs, with the land itself beside it', async ({ page }) => {
    await page.goto(`/app/records/${ID.parcel}/order`);

    await expect(page.getByRole('heading', { name: 'What do you want done on this land?' })).toBeVisible();
    await expect(page.getByText('Sy 214/2 · Katragunta, Markapur, Prakasam')).toBeVisible();

    // The land is on the page at every step — here as the card the owner
    // already recognises, with what the record can say about where it is.
    const land = card(page, 'This land');
    await expect(land).toContainText('Sy 214/2');
    await expect(land).toContainText('Katragunta, Markapur, Prakasam');
    await expect(land).toContainText('4 acres');
    await expect(land).toContainText('Khata 1042');
    await expect(land).toContainText('Boundary on map');
    await expect(land.getByRole('link', { name: 'View / measure boundary' }))
      .toHaveAttribute('href', `/app/records/${ID.parcel}/map`);
    await expect(land.getByRole('link', { name: 'Change land' })).toHaveAttribute('href', '/app/order');
  });

  test('the strip at the top says what this land is short of, and every line has somewhere to go', async ({ page }) => {
    await page.goto(`/app/records/${ID.plot}/order`);

    await expect(need(page, 'There is no boundary on record for this land.')
      .getByRole('link', { name: 'Locate / draw boundary' }))
      .toHaveAttribute('href', `/app/records/${ID.plot}/map`);
    await expect(need(page, 'No papers are filed on this land yet.')
      .getByRole('link', { name: 'Open Papers' }))
      .toHaveAttribute('href', `/app/records/${ID.plot}`);
    await expect(page.locator('.card.flat li')).toHaveCount(2);
  });

  test('a job already running on this land is one of the things the land needs saying about it', async ({ page }) => {
    await page.goto(`/app/records/${ID.parcel}/order`);

    await expect(need(page, 'An encumbrance certificate is already on order here.')
      .getByRole('link', { name: 'Open the job' }))
      .toHaveAttribute('href', `/app/services/${TICKET.placed}`);
  });

  test('a land with its boundary and its papers on record is told so, not given an empty box', async ({ page, world }) => {
    world.set('orders', ordersAnswer([]));
    await page.goto(`/app/records/${ID.parcel}/order`);

    await expect(page.getByText('This land has its boundary and its papers on record.')).toBeVisible();
    await expect(page.locator('.card.flat li')).toHaveCount(0);
  });

  test('work on the ground is offered first, whatever order the catalogue arrives in', async ({ page }) => {
    await page.goto(`/app/records/${ID.parcel}/order`);

    // The server sorts (group, label), which puts Legal first by alphabetical
    // accident. Most owners are here for somebody to go and stand on the land.
    await expect(page.locator('button.chip')).toHaveText(['All', 'On the ground', 'Records', 'Legal']);
    await expect(page.locator('.choice.svc button')).toHaveCount(6);

    await page.getByRole('button', { name: 'On the ground', exact: true }).click();

    await expect(page.locator('.choice.svc button')).toHaveCount(2);
    await expect(svcTile(page, 'Boundary re-survey')).toBeVisible();
    await expect(svcTile(page, 'Site visit')).toBeVisible();
    await expect(page.getByRole('button', { name: 'On the ground', exact: true }))
      .toHaveAttribute('aria-pressed', 'true');

    await page.getByRole('button', { name: 'All', exact: true }).click();
    await expect(page.locator('.choice.svc button')).toHaveCount(6);
  });

  test('every tile carries its price and its wait, so a choice is never made blind', async ({ page }) => {
    await page.goto(`/app/records/${ID.parcel}/order`);

    await expect(svcTile(page, 'Boundary re-survey')).toContainText('₹2,900');
    await expect(svcTile(page, 'Boundary re-survey')).toContainText('about 21 days');
    await expect(svcTile(page, 'Title opinion')).toContainText('₹4,500');
    await expect(svcTile(page, 'Title opinion')).toContainText('about 14 days');
    await expect(svcTile(page, 'Certified patta copy')).toContainText('₹450');
    await expect(svcTile(page, 'Mutation / name transfer')).toContainText('about 30 days');
  });

  test('a tile’s line is about this land before it is about the catalogue', async ({ page }) => {
    await page.goto(`/app/records/${ID.parcel}/order`);

    // Work on the ground: what this record can say about where the land is,
    // ahead of anything else, because it decides whether the job can be done.
    await expect(svcTile(page, 'Boundary re-survey')).toContainText(
      'Your boundary is on record. The outline goes with the order, so the surveyor starts '
      + 'from your corners.',
    );
    // Then what you already have running here…
    await expect(svcTile(page, 'Encumbrance Certificate'))
      .toContainText('You already have one of these running here.');
    // …then what you are actually buying, which the blurb does not say. What
    // an owner CALLS it comes next in the precedence and is unreachable here
    // by construction: both keys in ALSO_CALLED (ec, mutation) are in
    // DELIVERABLE too, so a tile never falls through to it. It is asserted
    // where it does show — on the catalogue tiles of the land chooser.
    await expect(svcTile(page, 'Mutation / name transfer'))
      .toContainText('The revenue record in the new owner’s name');
    await expect(svcTile(page, 'Title opinion'))
      .toContainText('A written opinion from an advocate on whether the title is clean');
  });

  test('a service in a group this app has never heard of is still offered, in the catalogue’s own words', async ({ page, world }) => {
    const caretaking = {
      key: 'fence_check', label: 'Fence inspection', price: 800, group: 'Caretaking',
      blurb: 'A caretaker walks the fence line and reports what is broken.', days: 4, fields: [],
    };
    world.set('servicesOffered', (vars: Record<string, unknown>) => (String(vars.key ?? '')
      ? [...OFFERS, caretaking].filter((o) => o.key === vars.key)
      : [...OFFERS, caretaking]));
    await page.goto(`/app/records/${ID.parcel}/order`);

    // A group nobody here has heard of fails safe: it is appended in the
    // server's own order rather than dropped.
    await expect(page.locator('button.chip'))
      .toHaveText(['All', 'On the ground', 'Records', 'Legal', 'Caretaking']);
    // With no map sentence, nothing running and no deliverable written for it,
    // the tile falls back to the catalogue's own description of the work.
    await expect(svcTile(page, 'Fence inspection'))
      .toContainText('A caretaker walks the fence line and reports what is broken.');
  });

  test('nothing can be answered until a service has been chosen', async ({ page }) => {
    await page.goto(`/app/records/${ID.parcel}/order`);

    const next = page.getByRole('button', { name: 'Answer what it needs' });
    await expect(next).toBeDisabled();
    await expect(svcTile(page, 'Boundary re-survey')).toHaveAttribute('aria-pressed', 'false');

    await svcTile(page, 'Boundary re-survey').click();

    await expect(page).toHaveURL(`/app/records/${ID.parcel}/order?service=survey&step=pick`);
    await expect(svcTile(page, 'Boundary re-survey')).toHaveAttribute('aria-pressed', 'true');
    await expect(svcTile(page, 'Site visit')).toHaveAttribute('aria-pressed', 'false');
    await expect(next).toBeEnabled();

    await next.click();
    await expect(page).toHaveURL(`/app/records/${ID.parcel}/order?service=survey&step=tell`);
    await expect(page.getByRole('heading', { name: 'What we need to know' })).toBeVisible();
  });

  test('work this catalogue does not sell can still be asked of somebody I already work with', async ({ page }) => {
    await page.goto(`/app/records/${ID.parcel}/order`);

    await expect(page.getByRole('link', { name: 'Ask someone you already work with.' }))
      .toHaveAttribute('href', `/app/records/${ID.parcel}/request`);
  });

  test('a catalogue with nothing on offer does not leave the land with nowhere to go', async ({ page, world }) => {
    world.set('servicesOffered', []);
    await page.goto(`/app/records/${ID.parcel}/order`);

    await expect(page.getByText('There is nothing on offer just now')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Ask someone yourself' }))
      .toHaveAttribute('href', `/app/records/${ID.parcel}/request`);
    await expect(page.getByRole('button', { name: 'Answer what it needs' })).toHaveCount(0);
  });

  test('a catalogue that did not load is not an empty catalogue', async ({ page, world }) => {
    world.set('servicesOffered', World.gqlError('the catalogue service is down'));
    await page.goto(`/app/records/${ID.parcel}/order`);

    await expect(page.getByRole('alert').filter({ hasText: 'The list of services did not load' }))
      .toBeVisible();
    await expect(page.getByText('There is nothing on offer just now')).toHaveCount(0);
  });

  test('a catalogue still arriving is not one with nothing in it either', async ({ page, world }) => {
    world.set('servicesOffered', World.never());
    await page.goto(`/app/records/${ID.parcel}/order`);

    await expect(page.getByText('Loading the list of services…')).toBeVisible();
    await expect(page.getByText('There is nothing on offer just now')).toHaveCount(0);
  });

  test('a land whose running jobs could not be read is still ordered against, and says what it could not check', async ({ page, world }) => {
    world.set('orders', World.gqlError('the work queue is down'));
    await page.goto(`/app/records/${ID.parcel}/order`);

    await expect(page.getByText('We could not check what is already running on this land.')).toBeVisible();
    // Warned, never blocked: every tile is still choosable.
    await expect(page.locator('.choice.svc button')).toHaveCount(6);
    await expect(svcTile(page, 'Encumbrance Certificate'))
      .not.toContainText('You already have one of these running here.');
  });

  test('a land nobody can find can still order the survey that would find it', async ({ page }) => {
    await page.goto(`/app/records/${ID.plot}/order`);

    // Refusing to sell the service that produces the map, because there is no
    // map, is not a safeguard.
    const survey = svcTile(page, 'Boundary re-survey');
    await expect(survey).toContainText(
      'Nothing on this record says where this land is. This is the service that puts that '
      + 'right — tell the surveyor where to come below.',
    );
    await survey.click();

    // Chosen, and offered a trip to draw the boundary that comes back here.
    await expect(survey.getByRole('link', { name: 'Locate / draw boundary' })).toHaveAttribute(
      'href',
      `/app/records/${ID.plot}/map?draw=1&back=${encodeURIComponent(`/app/records/${ID.plot}/order?service=survey&step=pick`)}`,
    );
    await page.getByRole('button', { name: 'Answer what it needs' }).click();
    await expect(page.getByRole('heading', { name: 'What we need to know' })).toBeVisible();
  });

  // ── step 3 · what we need to know ──────────────────────────────────

  test('every question a service asks is drawn, in the kind of box that question needs', async ({ page }) => {
    await page.goto(`/app/records/${ID.parcel}/order?service=survey&step=tell`);

    await expect(page.getByText(
      'Boundary re-survey on Sy 214/2. ₹2,900 · about 21 days once somebody is on it.',
    )).toBeVisible();
    const sheet = card(page, 'The questions');
    await expect(sheet.getByLabel('Which boundary').locator('option'))
      .toHaveText(['Choose…', 'All four', 'North', 'South', 'East', 'West']);
    await expect(sheet.getByLabel('Is a neighbour disputing it?').locator('option'))
      .toHaveText(['Choose…', 'No', 'Yes']);
    // A note to a surveyor is paragraphs, not a one-line input.
    await expect(sheet.getByLabel('Anything the surveyor should know')).toHaveAttribute('rows', '3');
  });

  test('a date, a year, a count and a name are each asked for in their own kind of box', async ({ page }) => {
    await page.goto(`/app/records/${ID.parcel}/order?service=site_visit&step=tell`);
    const visit = page.getByLabel('Preferred date');
    await expect(visit).toHaveAttribute('type', 'date');
    // A preferred date in the past is not a preference, it is a typo.
    await expect(visit).toHaveAttribute('min', /^\d{4}-\d{2}-\d{2}$/);

    await page.goto(`/app/records/${ID.parcel}/order?service=ec&step=tell`);
    await expect(page.getByLabel('From year')).toHaveAttribute('type', 'number');
    await expect(page.getByLabel('From year')).toHaveAttribute('min', '1900');
    // And no question is dressed as a search box, which is what the old
    // `Field` did to every text, date and number answer on this screen.
    await expect(card(page, 'The questions').locator('.search')).toHaveCount(0);

    await page.goto(`/app/records/${ID.parcel}/order?service=patta_copy&step=tell`);
    await expect(page.getByLabel('How many copies')).toHaveAttribute('type', 'number');
    await expect(page.getByLabel('How many copies')).toHaveAttribute('min', '1');

    await page.goto(`/app/records/${ID.parcel}/order?service=mutation&step=tell`);
    await expect(page.getByLabel('Name to transfer into')).toHaveAttribute('type', 'text');
  });

  test('the questions that have to be answered are starred, and announced as required', async ({ page }) => {
    await page.goto(`/app/records/${ID.parcel}/order?service=survey&step=tell`);
    const sheet = card(page, 'The questions');

    await expect(sheet.getByText('Marked * — we cannot start without it.')).toBeVisible();
    await expect(sheet.getByText('Which boundary *', { exact: true })).toBeVisible();
    await expect(sheet.getByLabel('Which boundary')).toHaveAttribute('aria-required', 'true');
    // The star is decoration; the attribute is what a screen reader is told.
    await expect(sheet.getByText('Anything the surveyor should know', { exact: true })).toBeVisible();
    await expect(sheet.getByText('Anything the surveyor should know *', { exact: true })).toHaveCount(0);
    expect(await sheet.getByLabel('Anything the surveyor should know').getAttribute('aria-required'))
      .toBeNull();
  });

  test('the help under a question is read out with the question, not left to people who can see it', async ({ page }) => {
    await page.goto(`/app/records/${ID.parcel}/order?service=title_opinion&step=tell`);

    await expect(page.getByLabel('How far back to trace'))
      .toHaveAttribute('aria-describedby', 'sf-years-help');
    await expect(page.locator('#sf-years-help')).toHaveText('Banks usually ask for 30.');
  });

  test('a question nobody answered stops the order, and is named where it was asked and once more at the button', async ({ page, world }) => {
    await page.goto(`/app/records/${ID.parcel}/order?service=survey&step=tell`);

    await page.getByRole('button', { name: 'Check the order' }).click();

    await expect(page).toHaveURL(`/app/records/${ID.parcel}/order?service=survey&step=tell`);
    await expect(page.getByText('Still needed: Which boundary, Is a neighbour disputing it?'))
      .toBeVisible();
    await expect(page.getByLabel('Which boundary')).toHaveAttribute('aria-invalid', 'true');
    await expect(page.getByRole('alert').filter({ hasText: 'We need this before the order can go in.' }))
      .toHaveCount(2);
    expect(world.calls('orderService')).toHaveLength(0);

    await page.getByLabel('Which boundary').selectOption('All four');
    await page.getByLabel('Is a neighbour disputing it?').selectOption('No');
    await page.getByRole('button', { name: 'Check the order' }).click();

    await expect(page.getByRole('heading', { name: 'Check this before it goes in' })).toBeVisible();
  });

  test('where the land is, is only asked about work somebody has to go and do', async ({ page }) => {
    await page.goto(`/app/records/${ID.parcel}/order?service=survey&step=tell`);
    await expect(card(page, 'Where this land is')).toBeVisible();

    await page.goto(`/app/records/${ID.parcel}/order?service=site_visit&step=tell`);
    await expect(card(page, 'Where this land is')).toBeVisible();

    // An encumbrance certificate does not care where the land is.
    await page.goto(`/app/records/${ID.parcel}/order?service=ec&step=tell`);
    await expect(card(page, 'Where this land is')).toHaveCount(0);
    await page.goto(`/app/records/${ID.parcel}/order?service=title_opinion&step=tell`);
    await expect(card(page, 'Where this land is')).toHaveCount(0);
  });

  test('the boundary is only offered to be sent when there are corners to send', async ({ page, world }) => {
    await page.goto(`/app/records/${ID.parcel}/order?service=survey&step=tell`);
    const where = card(page, 'Where this land is');
    const send = where.getByRole('checkbox', { name: 'Send them the boundary you have drawn' });
    await expect(send).toBeChecked();
    await expect(where).toContainText('Only the outline goes — no name, no khata, no survey number.');

    // A pin is not a boundary and cannot be sent: `public_manifest` hands the
    // worker `{items, boundary}` and nothing else.
    await page.goto(`/app/records/${ID.flat}/order?service=site_visit&step=tell`);
    await expect(card(page, 'Where this land is'))
      .toContainText('A pin cannot go with the order — only a drawn boundary can.');
    await expect(page.getByRole('checkbox', { name: 'Send them the boundary you have drawn' }))
      .toHaveCount(0);

    // Two corners are not a boundary either — and the checkbox is ABSENT
    // rather than disabled, because there is nothing to decide.
    world.set('record', recordLike({ ring: [15.7410, 79.2694, 15.7402, 79.2704] }));
    await page.goto(`/app/records/${ID.parcel}/order?service=survey&step=tell`);
    await expect(card(page, 'Where this land is'))
      .toContainText('A pin cannot go with the order — only a drawn boundary can.');
    await expect(page.getByRole('checkbox', { name: 'Send them the boundary you have drawn' }))
      .toHaveCount(0);
  });

  test('a land nobody can find is asked how to get there, and that answer becomes one that has to be given', async ({ page }) => {
    await page.goto(`/app/records/${ID.plot}/order?service=survey&step=tell`);

    await expect(card(page, 'Where this land is')).toContainText(
      'Nothing on this record says where this land is. This is the service that puts that '
      + 'right — tell the surveyor where to come below.',
    );
    // The catalogue says this field is optional. On a land nobody can find it
    // is the only way anybody gets there.
    await expect(card(page, 'The questions').getByText('Anything the surveyor should know *', { exact: true }))
      .toBeVisible();
    await expect(page.getByLabel('Anything the surveyor should know'))
      .toHaveAttribute('aria-required', 'true');
    await expect(page.locator('#sf-notes-help'))
      .toHaveText('Nobody can find this land from the record, so write down how to get there.');

    await page.getByRole('button', { name: 'Check the order' }).click();
    await expect(page.getByText(
      'Still needed: Which boundary, Is a neighbour disputing it?, Anything the surveyor should know.',
    )).toBeVisible();
  });

  test('a visit to a land nobody can find asks who to meet there instead', async ({ page }) => {
    await page.goto(`/app/records/${ID.plot}/order?service=site_visit&step=tell`);

    await expect(card(page, 'Where this land is')).toContainText(
      'Nothing on this record says where this land is, so nobody can be sent to it yet.',
    );
    await expect(card(page, 'The questions').getByText('Who to meet on site *', { exact: true })).toBeVisible();
    await expect(page.getByLabel('Who to meet on site')).toHaveAttribute('aria-required', 'true');
    await expect(page.locator('#sf-meet-help'))
      .toHaveText('Nobody can find this land from the record, so write down how to get there.');
  });

  test('everything filed on the land can be sent, with the papers kept out of the photos', async ({ page }) => {
    await page.goto(`/app/records/${ID.parcel}/order?service=site_visit&step=tell`);
    const give = card(page, 'What should they be given?');

    await expect(give).toContainText('Whoever does this work sees only what you tick here.');
    await expect(cardCount(page, 'What should they be given?')).toHaveText('0 of 8');
    await expect(give).toContainText('Papers · 5');
    await expect(give).toContainText('Photos and video · 3');
    // Nothing is capped: the old screen stopped at eight papers and six
    // photos with nothing saying so.
    await expect(give.getByRole('checkbox')).toHaveCount(8);
    // A photo nobody captioned is named by its file rather than left blank.
    await expect(give.getByRole('checkbox', { name: 'ne-stone.jpg' })).toBeVisible();
    await expect(give).toContainText('Video · 2026-06-02');
  });

  test('a land with nothing filed on it can still be ordered against', async ({ page }) => {
    await page.goto(`/app/records/${ID.plot}/order?service=survey&step=tell`);
    const give = card(page, 'What should they be given?');

    await expect(give).toContainText('Nothing is filed on this land yet');
    await expect(give).toContainText(
      'You can still order — they simply go without paperwork. Anything you file later '
      + 'will not be added to an order that has already gone in.',
    );
    await expect(give.getByRole('link', { name: 'File a paper first' }))
      .toHaveAttribute('href', `/app/records/${ID.plot}`);
    await expect(page.getByRole('button', { name: 'Check the order' })).toBeEnabled();
  });

  test('a land with papers and no photographs heads only the shelf it actually has', async ({ page }) => {
    await page.goto(`/app/records/${ID.flat}/order?service=ec&step=tell`);
    const give = card(page, 'What should they be given?');

    await expect(give).toContainText('Papers · 1');
    await expect(give).not.toContainText('Photos and video');
    await expect(give.getByRole('checkbox')).toHaveCount(1);
    await expect(cardCount(page, 'What should they be given?')).toHaveText('0 of 1');
    await expect(give).not.toContainText('Nothing is filed on this land yet');
  });

  test('what is ticked is named on the order, so a surveyor sent to the wrong field can be shown what they were handed', async ({ page, world }) => {
    await page.goto(`/app/records/${ID.parcel}/order?service=site_visit&step=tell&a.check=Crop`);
    await page.getByRole('checkbox', { name: 'Sale deed 4412 of 1998' }).check();
    await page.getByRole('checkbox', { name: 'The well from the gate' }).check();
    await expect(cardCount(page, 'What should they be given?')).toHaveText('2 of 8');

    await page.getByRole('button', { name: 'Check the order' }).click();
    await expect(kvRow(page, 'Goes with it')).toContainText('1 paper, 1 photo');
    await page.getByRole('button', { name: /^Place/ }).click();

    await expect.poll(() => world.calls('orderService')).toHaveLength(1);
    const vars = world.lastVars('orderService');
    expect(JSON.parse(String(vars.params))).toMatchObject({
      shared: 'Sale deed 4412 of 1998, The well from the gate',
    });
    expect(JSON.parse(String(vars.attachmentManifest))).toEqual({
      documentIds: [PAPER.deed], photoIds: [PHOTO.cover], includeBoundary: true,
    });
  });

  test('choosing a different service goes back and forgets the one that was chosen', async ({ page }) => {
    await page.goto(`/app/records/${ID.parcel}/order?service=survey&step=tell`);

    await page.getByRole('button', { name: 'Choose a different service' }).click();

    await expect(page).toHaveURL(`/app/records/${ID.parcel}/order?step=pick`);
    await expect(page.getByRole('heading', { name: 'What do you want done on this land?' })).toBeVisible();
    await expect(svcTile(page, 'Boundary re-survey')).toHaveAttribute('aria-pressed', 'false');
    await expect(page.getByRole('button', { name: 'Answer what it needs' })).toBeDisabled();
  });

  // ── step 4 · check this before it goes in ──────────────────────────

  test('the review restates the whole order before any money is committed', async ({ page, world }) => {
    await toReview(page, ID.parcel, 'survey', {
      which_side: 'All four', dispute: 'No', notes: 'The gate is on the north',
    });

    await expect(kvRow(page, 'Land')).toContainText('Sy 214/2 — Katragunta, Markapur, Prakasam');
    await expect(kvRow(page, 'Service')).toContainText('Boundary re-survey');
    // What lands in the owner's hands, which the catalogue's blurb does not say.
    await expect(kvRow(page, 'You get'))
      .toContainText('A surveyor’s sheet with your corners pinned against the FMB');
    await expect(kvRow(page, 'Quoted')).toContainText('₹2,900');
    await expect(kvRow(page, 'Expected')).toContainText('about 21 days once somebody is on it');
    await expect(kvRow(page, 'Which boundary')).toContainText('All four');
    await expect(kvRow(page, 'Is a neighbour disputing it?')).toContainText('No');
    await expect(kvRow(page, 'Anything the surveyor should know')).toContainText('The gate is on the north');
    await expect(kvRow(page, 'Goes with it')).toContainText('Nothing');
    await expect(kvRow(page, 'Boundary')).toContainText('Sent with the order');

    // Nothing has been filed by reading it.
    expect(world.calls('orderService')).toHaveLength(0);
  });

  test('the money on the review says nothing is taken now, and when it is owed', async ({ page, world }) => {
    world.set('orders', ordersAnswer([]));
    await toReview(page, ID.parcel, 'survey', { which_side: 'All four', dispute: 'No' });

    await expect(page.getByText(
      'Nothing is taken now. ₹2,900 is what this job costs. You set that money aside on the '
      + 'job itself, and it is only owed once you accept what came back.',
    )).toBeVisible();
    await expect(page.getByRole('button', { name: 'Place the order · ₹2,900' })).toBeVisible();
  });

  test('a job whose price does not move with the count says so where the money is', async ({ page }) => {
    await toReview(page, ID.parcel, 'patta_copy', { copies: '3' });

    await expect(page.getByText(
      '₹450 is what is quoted for this job. The number of copies does not change it.',
    )).toBeVisible();
  });

  test('only the questions that were answered are restated', async ({ page }) => {
    await toReview(page, ID.parcel, 'ec', { from_year: '1998' });

    await expect(kvRow(page, 'From year')).toContainText('1998');
    await expect(kvRow(page, 'To year')).toHaveCount(0);
    await expect(kvRow(page, 'What it is for')).toHaveCount(0);
    // Paperwork has no boundary row at all.
    await expect(kvRow(page, 'Boundary')).toHaveCount(0);
  });

  test('the boundary row says what will actually be sent, in each of its three states', async ({ page }) => {
    await toReview(page, ID.parcel, 'survey', { which_side: 'All four', dispute: 'No' });
    await page.getByRole('button', { name: 'Go back and change something' }).click();
    await page.getByRole('checkbox', { name: 'Send them the boundary you have drawn' }).uncheck();
    await page.getByRole('button', { name: 'Check the order' }).click();
    await expect(kvRow(page, 'Boundary')).toContainText('Not sent');

    await toReview(page, ID.flat, 'site_visit', { check: 'Crop' });
    await expect(kvRow(page, 'Boundary')).toContainText('Only a pin — nothing to send');

    await toReview(page, ID.plot, 'survey', {
      which_side: 'All four', dispute: 'No', notes: 'Ask at the temple',
    });
    await expect(kvRow(page, 'Boundary')).toContainText('Nothing drawn yet');
  });

  test('the review warns that this land already has one of these, and never blocks it', async ({ page }) => {
    await toReview(page, ID.parcel, 'ec');

    const already = card(page, 'You already have one of these here');
    await expect(already).toContainText(
      'An encumbrance certificate is already running on this land — placed, at ₹1,200.',
    );
    await expect(already.getByRole('link', { name: 'Open the one you have' }))
      .toHaveAttribute('href', `/app/services/${TICKET.placed}`);
    // Warned, not stopped: this screen restates the whole order first, so an
    // owner who means it can go on.
    await expect(page.getByRole('button', { name: 'Place a second one anyway' })).toBeEnabled();
    await expect(page.getByRole('button', { name: /^Place the order/ })).toHaveCount(0);
  });

  test('a job asked for directly, under another name, still counts as the same job', async ({ page, world }) => {
    // `work_requests.kind` carries three vocabularies: an owner who asked a
    // caretaker directly last week is ordering the same thing twice today.
    world.set('orders', ordersAnswer([newJob({
      id: 'w-tkt-visit', ref: 'W-2200', kind: 'visit', title: 'Caretaker visit',
      stageLabel: 'Assigned', cost: 1_500,
    })]));
    await toReview(page, ID.parcel, 'site_visit', { check: 'Crop' });

    await expect(card(page, 'You already have one of these here'))
      .toContainText('A caretaker visit is already running on this land — assigned, at ₹1,500.');
  });

  test('when what is running could not be read the review says so, rather than promising nothing is', async ({ page, world }) => {
    world.set('orders', World.gqlError('the work queue is down'));
    await toReview(page, ID.parcel, 'patta_copy', { copies: '2' });

    await expect(page.getByText(
      'We could not check what is already running on this land, so look under Services '
      + 'before you place a second one.',
    )).toBeVisible();
    // The rail has a Services link of its own; this is the one inside the
    // sentence, which has to point at THIS land's list.
    await expect(page.locator('p.note').filter({ hasText: 'so look under' })
      .getByRole('link', { name: 'Services' }))
      .toHaveAttribute('href', `/app/records/${ID.parcel}/services`);
    await expect(card(page, 'You already have one of these here')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Place the order · ₹450' })).toBeEnabled();
  });

  test('nothing is filed until the order is placed, and going back keeps every answer', async ({ page, world }) => {
    await toReview(page, ID.parcel, 'patta_copy', { copies: '4' });
    expect(world.calls('orderService')).toHaveLength(0);

    await page.getByRole('button', { name: 'Go back and change something' }).click();

    await expect(page).toHaveURL(`/app/records/${ID.parcel}/order?service=patta_copy&step=tell`);
    await expect(page.getByLabel('How many copies')).toHaveValue('4');
    expect(world.calls('orderService')).toHaveLength(0);
  });

  // ── filing it ──────────────────────────────────────────────────────

  test('placing sends the land, the kind, every answer and a key of its own', async ({ page, world }) => {
    // Nothing else running here, so the plain "Place the order" is the button
    // under test rather than the second-one-anyway path.
    world.set('orders', ordersAnswer([]));
    await toReview(page, ID.parcel, 'survey', {
      which_side: 'All four', dispute: 'No', notes: 'The gate is on the north',
    });

    await page.getByRole('button', { name: 'Place the order · ₹2,900' }).click();

    await expect.poll(() => world.calls('orderService')).toHaveLength(1);
    const vars = world.lastVars('orderService');
    expect(vars).toMatchObject({
      recordIds: [ID.parcel],
      kind: 'survey',
      note: 'Ordered against Sy 214/2',
    });
    // Only the fields THIS service asks for: an answer typed against a service
    // the owner changed their mind about must not ride along and render for
    // ever as a stray Pair on the worker's sheet.
    expect(JSON.parse(String(vars.params))).toEqual({
      which_side: 'All four', dispute: 'No', notes: 'The gate is on the north',
    });
    expect(JSON.parse(String(vars.attachmentManifest)))
      .toEqual({ documentIds: [], photoIds: [], includeBoundary: true });
    expect(String(vars.idempotencyKey)).not.toBe('');
    expect(String(vars.idempotencyKey)).toMatch(UUID);
  });

  test('where an order was asked for rides with it onto the job', async ({ page, world }) => {
    await page.goto(`/app/records/${ID.parcel}/order?service=patta_copy&why=photos&step=tell&a.copies=2`);
    await page.getByRole('button', { name: 'Check the order' }).click();
    await expect(page).toHaveURL(
      `/app/records/${ID.parcel}/order?service=patta_copy&why=photos&step=check`,
    );

    await page.getByRole('button', { name: 'Place the order · ₹450' }).click();

    await expect.poll(() => world.calls('orderService')).toHaveLength(1);
    expect(world.lastVars('orderService')).toMatchObject({ note: 'Asked for from the photos' });
  });

  test('an answer handed over by a link is filled in, and one this service never asked for is dropped', async ({ page, world }) => {
    await page.goto(
      `/app/records/${ID.parcel}/order?service=ec&step=tell&a.from_year=1998&a.nonsense=whatever`,
    );

    await expect(page.getByLabel('From year')).toHaveValue('1998');
    await page.getByRole('button', { name: 'Check the order' }).click();
    await page.getByRole('button', { name: /^Place/ }).click();

    await expect.poll(() => world.calls('orderService')).toHaveLength(1);
    const params = JSON.parse(String(world.lastVars('orderService').params));
    expect(params).toEqual({ from_year: '1998', to_year: '', purpose: '' });
    expect(params).not.toHaveProperty('nonsense');
  });

  test('a refused order says nothing was charged, and leaves the review exactly where it was', async ({ page, world }) => {
    world.set('orderService', 0);
    await toReview(page, ID.parcel, 'patta_copy', { copies: '2' });

    await page.getByRole('button', { name: 'Place the order · ₹450' }).click();

    const said = page.getByRole('alert');
    await expect(said).toContainText('That order was not accepted, and nothing was charged.');
    // The commonest cause, named, with somewhere to look — not "choose the
    // property or the service again".
    await expect(said).toContainText('something you attached is no longer on this land');
    await expect(said).not.toContainText('That order did not go through');
    await expect(page).toHaveURL(`/app/records/${ID.parcel}/order?service=patta_copy&step=check`);
    await expect(page.getByRole('heading', { name: 'That is placed.' })).toHaveCount(0);
  });

  test('an order that never came back sends me to look before I order it a second time', async ({ page, world }) => {
    world.set('orderService', World.gqlError('the gateway gave up'));
    await toReview(page, ID.parcel, 'patta_copy', { copies: '2' });
    const before = world.calls('orders').length;

    await page.getByRole('button', { name: 'Place the order · ₹450' }).click();

    const said = page.getByRole('alert');
    // A rejected request is NOT proof that nothing was filed.
    await expect(said).toContainText('That order did not go through — check your connection and try again.');
    await expect(said).toContainText('it was filed and you need not order again');
    await expect(said).not.toContainText('nothing was charged');
    await expect(said.getByRole('link', { name: 'See what is running here' }))
      .toHaveAttribute('href', `/app/records/${ID.parcel}/services`);
    // And the list it points at is re-read, so the answer is already on screen.
    await expect.poll(() => world.calls('orders').length).toBeGreaterThan(before);
  });

  test('pressing again after a refusal is the same order; changing it makes it a new one', async ({ page, world }) => {
    world.set('orderService', 0);
    await toReview(page, ID.parcel, 'patta_copy', { copies: '2' });

    await page.getByRole('button', { name: 'Place the order · ₹450' }).click();
    await expect(page.getByRole('alert')).toBeVisible();
    await page.getByRole('button', { name: 'Place the order · ₹450' }).click();
    await expect.poll(() => world.calls('orderService')).toHaveLength(2);

    const [first, second] = world.calls('orderService');
    // The server replays the previous count for a repeated (key, hash) pair
    // without inserting, which is what stops two presses filing two orders.
    expect(second.vars.idempotencyKey).toBe(first.vars.idempotencyKey);
    expect(String(first.vars.idempotencyKey)).not.toBe('');

    await page.getByRole('button', { name: 'Go back and change something' }).click();
    await page.getByLabel('How many copies').fill('3');
    await page.getByRole('button', { name: 'Check the order' }).click();
    await page.getByRole('button', { name: 'Place the order · ₹450' }).click();

    await expect.poll(() => world.calls('orderService')).toHaveLength(3);
    // A different order: the same key with a different hash answers 0, which
    // is indistinguishable from a refusal.
    expect(world.lastVars('orderService').idempotencyKey).not.toBe(first.vars.idempotencyKey);
  });

  test('while an order is going nothing on the review can be pressed', async ({ page, world }) => {
    world.set('orderService', World.slow(1_500, 1));
    await toReview(page, ID.parcel, 'patta_copy', { copies: '2' });

    await page.getByRole('button', { name: 'Place the order · ₹450' }).click();

    const going = page.getByRole('button', { name: 'Placing…' });
    await expect(going).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Go back and change something' })).toBeDisabled();
    await expect(page.locator('section.card[aria-busy="true"]')).toBeVisible();

    await expect(page.getByRole('heading', { name: 'That is placed.' })).toBeVisible();
    expect(world.calls('orderService')).toHaveLength(1);
  });

  test('a service this catalogue does not sell is refused, not filed', async ({ page, world }) => {
    await page.goto(`/app/records/${ID.parcel}/order?service=gold-plating`);

    await expect(page.getByRole('heading', { name: 'That service is no longer offered' })).toBeVisible();
    await expect(page.getByText(
      'The link you followed names a service this catalogue does not have. It may have been '
      + 'withdrawn or renamed. Nothing has been ordered.',
    )).toBeVisible();
    await expect(page.getByRole('button', { name: /^Place/ })).toHaveCount(0);
    expect(world.calls('orderService')).toHaveLength(0);

    await page.getByRole('button', { name: 'Choose another' }).click();

    await expect(page).toHaveURL(`/app/records/${ID.parcel}/order?step=pick`);
    await expect(page.getByRole('button', { name: 'Answer what it needs' })).toBeDisabled();
  });

  test('a service named in a link that is still arriving is not called withdrawn', async ({ page, world }) => {
    world.set('servicesOffered', World.slow(1_200, OFFERS));
    await page.goto(`/app/records/${ID.parcel}/order?service=survey`);

    await expect(page.getByText('Loading the list of services…')).toBeVisible();
    await expect(page.getByText('That service is no longer offered')).toHaveCount(0);

    await expect(svcTile(page, 'Boundary re-survey')).toHaveAttribute('aria-pressed', 'true');
  });

  // ── step 5 · that is placed ────────────────────────────────────────

  test('the receipt names the job the server itself filed, and opens it', async ({ page, world }) => {
    let filed = false;
    world.set('orderService', () => { filed = true; return 1; });
    world.set('orders', (vars: Record<string, unknown>) =>
      ordersAnswer(filed ? [...ORDERS, newJob()] : ORDERS)(vars));
    await toReview(page, ID.parcel, 'survey', { which_side: 'All four', dispute: 'No' });

    await page.getByRole('button', { name: /^Place/ }).click();

    await expect(page.getByRole('heading', { name: 'That is placed.' })).toBeVisible();
    await expect(page).toHaveURL(`/app/records/${ID.parcel}/order?service=survey&step=done`);
    // The reference is the server's own — `orderService` answers a count, so
    // the new job is found by diffing the list rather than invented here.
    await expect(page.locator('strong.mono')).toHaveText('W-2199');
    await expect(page.getByText('we expect it back by 25/09/2026')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Open the job' }))
      .toHaveAttribute('href', '/app/services/w-tkt-new');
    await expect(page.getByRole('link', { name: 'Back to this land' }))
      .toHaveAttribute('href', `/app/records/${ID.parcel}/services`);
  });

  test('the reference can still be arriving without the order looking as though it is', async ({ page, world }) => {
    let filed = false;
    world.set('orderService', () => { filed = true; return 1; });
    world.set('orders', async (vars: Record<string, unknown>) => {
      if (filed) await new Promise((done) => setTimeout(done, 2_000));
      return ordersAnswer(ORDERS)(vars);
    });
    await toReview(page, ID.parcel, 'patta_copy', { copies: '2' });

    await page.getByRole('button', { name: 'Place the order · ₹450' }).click();

    // The headline stands on the count, which is proof enough that it was
    // filed. Only the reference waits.
    await expect(page.getByRole('heading', { name: 'That is placed.' })).toBeVisible();
    await expect(page.getByText('Loading your new job…')).toBeVisible();
    await expect(page.getByText('did not go through')).toHaveCount(0);
  });

  test('a job that cannot be picked out of the list is still said to be filed, with somewhere to find it', async ({ page }) => {
    // The list comes back unchanged — nothing new to diff against — so no
    // reference is invented for it.
    await toReview(page, ID.parcel, 'patta_copy', { copies: '2' });
    await page.getByRole('button', { name: 'Place the order · ₹450' }).click();

    await expect(page.getByRole('heading', { name: 'That is placed.' })).toBeVisible();
    await expect(page.getByText(
      'Certified patta copy is filed against Sy 214/2. We could not pick it out of the list '
      + 'just now — it is under Services on this land.',
    )).toBeVisible();
    await expect(page.getByRole('link', { name: 'See what is running here' }))
      .toHaveAttribute('href', `/app/records/${ID.parcel}/services`);
    await expect(page.getByRole('link', { name: 'Open the job' })).toHaveCount(0);
  });

  test('a list that will not come back after the order is filed never reads as a failed order', async ({ page, world }) => {
    let filed = false;
    world.set('orderService', () => { filed = true; return 1; });
    // Note the world's own shape here: a function answer that RETURNS a
    // special replaces the field with it for good (world.ts:331-336), which is
    // exactly what is wanted — from the moment the order is filed, the list
    // is down and stays down.
    world.set('orders', (vars: Record<string, unknown>) =>
      (filed ? World.gqlError('the work queue is down') : ordersAnswer(ORDERS)(vars)));
    await toReview(page, ID.parcel, 'patta_copy', { copies: '2' });

    await page.getByRole('button', { name: 'Place the order · ₹450' }).click();

    await expect(page.getByRole('heading', { name: 'That is placed.' })).toBeVisible();
    // Either honest sentence will do, and it is the second one that arrives:
    // `refetch()` RESOLVES with an error result rather than rejecting, so
    // DoneStep's `read: 'failed'` branch (OrderService.tsx:1010) is never
    // taken and the "could not pick it out of the list" sentence covers this
    // too. What must never be said is that the order failed.
    await expect(page.getByText('it is under Services on this land')).toBeVisible();
    await expect(page.getByText('did not go through')).toHaveCount(0);
    await expect(page.getByText('was not accepted')).toHaveCount(0);
  });

  test('a step that cannot be honoured is corrected rather than drawn', async ({ page }) => {
    // Reachable by hand, by a stale bookmark, and by Android's Back button
    // landing on a step whose precondition has since gone.
    await page.goto(`/app/records/${ID.parcel}/order?step=done`);
    await expect(page).toHaveURL(`/app/records/${ID.parcel}/order?step=pick`);
    await expect(page.getByRole('heading', { name: 'What do you want done on this land?' })).toBeVisible();

    await page.goto(`/app/records/${ID.parcel}/order?step=check`);
    await expect(page).toHaveURL(`/app/records/${ID.parcel}/order?step=pick`);
    await expect(page.getByRole('heading', { name: 'Check this before it goes in' })).toHaveCount(0);
  });

  test('what has been typed survives a reload of the same half-composed order', async ({ page }) => {
    await page.goto(`/app/records/${ID.parcel}/order?service=survey&step=tell`);
    await page.getByLabel('Which boundary').selectOption('North');
    await page.getByLabel('Anything the surveyor should know').fill('Ask at the temple');
    await page.getByRole('checkbox', { name: 'Sale deed 4412 of 1998' }).check();

    await page.reload();

    await expect(page.getByLabel('Which boundary')).toHaveValue('North');
    await expect(page.getByLabel('Anything the surveyor should know')).toHaveValue('Ask at the temple');
    await expect(page.getByRole('checkbox', { name: 'Sale deed 4412 of 1998' })).toBeChecked();
  });

  // ── fixed ────────────────────────────────────────────────────────────
  //
  // Two of the defects this file used to record are fixed by the redesign and
  // are ordinary tests again: the papers read that failed (below), and the
  // refusal that outlived the property it was raised against — the in-page
  // property picker that carried it is gone, and `err` is cleared whenever the
  // service changes (OrderService.tsx:384).

  test('papers that could not be read are named in the card that shows them, and the order still goes', async ({ page, world }) => {
    world.set('papers', World.gqlError('the vault is down'));
    world.set('photos', World.gqlError('the vault is down'));
    await page.goto(`/app/records/${ID.parcel}/order?service=patta_copy&step=tell&a.copies=2`);

    const give = card(page, 'What should they be given?');
    await expect(give).toContainText('What is filed on this land did not load');
    // And NOT the empty state: an outage is not an answer about what this
    // record holds. The record's own header counts twelve papers.
    await expect(give).not.toContainText('Nothing is filed on this land yet');

    // A papers outage is not a reason to refuse to sell.
    await page.getByRole('button', { name: 'Check the order' }).click();
    await expect(kvRow(page, 'Goes with it')).toContainText('Nothing');
    await page.getByRole('button', { name: 'Place the order · ₹450' }).click();

    await expect.poll(() => world.calls('orderService')).toHaveLength(1);
    expect(JSON.parse(String(world.lastVars('orderService').attachmentManifest)))
      .toEqual({ documentIds: [], photoIds: [] });
    await expect(page.getByRole('heading', { name: 'That is placed.' })).toBeVisible();
  });

  test('a refusal raised against one order does not follow me onto the next service', async ({ page, world }) => {
    world.set('orderService', 0);
    await toReview(page, ID.parcel, 'patta_copy', { copies: '2' });
    await page.getByRole('button', { name: 'Place the order · ₹450' }).click();
    await expect(page.getByRole('alert')).toContainText('That order was not accepted');

    await page.getByRole('button', { name: 'Go back and change something' }).click();
    await page.getByRole('button', { name: 'Choose a different service' }).click();
    await svcTile(page, 'Title opinion').click();
    await page.getByRole('button', { name: 'Answer what it needs' }).click();
    await page.getByLabel('How far back to trace').selectOption('30 years');
    await page.getByRole('button', { name: 'Check the order' }).click();

    // The one sentence on this screen that sends an owner to check their
    // money must never be pointing at the wrong order.
    await expect(page.getByRole('alert')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Place the order · ₹4,500' })).toBeEnabled();
  });

  test('the receipt puts its comma where a comma goes', async ({ page, world }) => {
    // Small, and on the one screen an owner is asked to trust with money. The
    // due date hangs off a fragment, and that fragment used to open with a
    // space, so the receipt read "It is job W-2199 , and we expect it back by".
    let filed = false;
    world.set('orderService', () => { filed = true; return 1; });
    world.set('orders', (vars: Record<string, unknown>) =>
      ordersAnswer(filed ? [...ORDERS, newJob()] : ORDERS)(vars));
    await toReview(page, ID.parcel, 'survey', { which_side: 'All four', dispute: 'No' });
    await page.getByRole('button', { name: /^Place/ }).click();

    await expect(page.getByText('It is job W-2199, and we expect it back by 25/09/2026.'))
      .toBeVisible({ timeout: 3000 });
  });
});

// ═══════════════════════════════════════════════════════════════════════
// /app/records/:id/request — asking somebody to do a piece of work
// ═══════════════════════════════════════════════════════════════════════

test.describe('Asking for work on a record', () => {
  test('asking a surveyor opens with the words an owner would actually send', async ({ page }) => {
    await page.goto(`/app/records/${ID.parcel}/request`);

    await expect(page.getByRole('heading', { name: 'Ask a surveyor' })).toBeVisible();
    await expect(page.getByText('They do not need an account. You choose exactly what leaves this record.'))
      .toBeVisible();
    await expect(page.getByLabel('Message', { exact: true })).toHaveValue(
      'Hey dear surveyor, please do the survey for this location. The boundary is attached as a GeoJSON file.',
    );
    await expect(page.getByRole('button', { name: 'Back to Sy 214/2' })).toBeVisible();
  });

  test('the boundary goes as geometry only, and says so', async ({ page }) => {
    await page.goto(`/app/records/${ID.parcel}/request`);

    const geo = page.getByRole('checkbox', { name: /The boundary, as GeoJSON/ });
    await expect(geo).toBeChecked();
    await expect(page.getByText('4 corners. Geometry only — no name, no khata, no survey number.'))
      .toBeVisible();
    await expect(page.getByText('Whoever it is assigned to sees the 1 thing you ticked, and nothing else.'))
      .toBeVisible();
  });

  test('a record with no boundary asks for the corners to be established instead of promising a file', async ({ page }) => {
    await page.goto(`/app/records/${ID.plot}/request`);

    await expect(page.getByLabel('Message', { exact: true })).toHaveValue(
      'Hey dear surveyor, please do the survey for this location. There is no boundary on record yet — '
      + 'please establish the corners on site and send the sheet back.',
    );
    const geo = page.getByRole('checkbox', { name: /The boundary, as GeoJSON/ });
    await expect(geo).toBeDisabled();
    await expect(geo).not.toBeChecked();
    await expect(page.getByText('This record has no surveyed boundary yet.')).toBeVisible();
    await expect(page.getByText('Nothing of yours is attached. The request carries only your message.'))
      .toBeVisible();
  });

  test('a boundary read that failed does not turn a surveyed record into an unsurveyed one', async ({ page, world }) => {
    // RequestWork.tsx:108-111 takes the ring off the boundary read OR off the
    // record, in that order. The record already carries it, so an outage on
    // the separate boundary read must not rewrite the surveyor's message into
    // "there is no boundary on record yet" and send somebody to establish
    // corners that were walked in August.
    world.set('boundary', World.gqlError('the boundary store is down'));
    await page.goto(`/app/records/${ID.parcel}/request`);

    await expect(page.getByLabel('Message', { exact: true }))
      .toHaveValue(/The boundary is attached as a GeoJSON file\.$/);
    const geo = page.getByRole('checkbox', { name: /The boundary, as GeoJSON/ });
    await expect(geo).toBeChecked();
    await expect(geo).toBeEnabled();
    await expect(page.getByText('4 corners. Geometry only')).toBeVisible();
  });

  test('asking an advocate opens on the papers, not the boundary', async ({ page }) => {
    await page.goto(`/app/records/${ID.parcel}/request?kind=opinion`);

    await expect(page.getByRole('heading', { name: 'Ask an advocate' })).toBeVisible();
    await expect(page.getByLabel('Message', { exact: true }))
      .toHaveValue('Please read these papers and tell me whether the title is clean.');
  });

  test('only the surveyor’s opener changes for an unsurveyed record, because only it promised a file', async ({ page }) => {
    // `noGeo` is optional on OPENERS (RequestWork.tsx:40) and only `survey`
    // has one, because only the surveyor's words promise an attachment that a
    // record with no ring cannot produce. An advocate asked to read the papers
    // is asked exactly the same thing either way — rewriting that sentence
    // would be inventing a job nobody asked for.
    await page.goto(`/app/records/${ID.plot}/request?kind=opinion`);

    await expect(page.getByLabel('Message', { exact: true }))
      .toHaveValue('Please read these papers and tell me whether the title is clean.');
    // The box still says there is no boundary — the message just does not.
    await expect(page.getByRole('checkbox', { name: /The boundary, as GeoJSON/ })).toBeDisabled();
    await expect(page.getByText('This record has no surveyed boundary yet.')).toBeVisible();
    await expect(page.getByText('Nothing of yours is attached.')).toBeVisible();
  });

  test('asking somebody to visit opens on what they should send back', async ({ page }) => {
    await page.goto(`/app/records/${ID.parcel}/request?kind=visit`);

    await expect(page.getByRole('heading', { name: 'Ask someone to visit' })).toBeVisible();
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
    await page.goto(`/app/records/${ID.plot}/request`);
    await expect(page.getByLabel('Message', { exact: true })).toHaveValue(/establish the corners/);

    await page.getByLabel('Message', { exact: true }).fill('Ravi, the eastern edge first please.');

    // The ring lands and the screen changes its mind about this record…
    await expect(page.getByText('4 corners. Geometry only')).toBeVisible();
    // …and what the owner typed is still theirs.
    await expect(page.getByLabel('Message', { exact: true }))
      .toHaveValue('Ravi, the eastern edge first please.');
  });

  test('an advocate’s request is filed as an opinion, not as a survey', async ({ page, world }) => {
    await page.goto(`/app/records/${ID.parcel}/request?kind=opinion`);

    await page.getByRole('button', { name: 'Create request' }).click();

    await expect.poll(() => world.calls('createRequest')).toHaveLength(1);
    const vars = world.lastVars('createRequest');
    expect(vars).toMatchObject({ recordId: ID.parcel, kind: 'opinion' });
    expect(String(vars.message)).toContain('whether the title is clean');
  });

  test('there is nothing to raise without a message, and the button says why it is off', async ({ page, world }) => {
    await page.goto(`/app/records/${ID.parcel}/request`);
    await page.getByLabel('Message', { exact: true }).fill('   ');

    const raise = page.getByRole('button', { name: 'Create request' });
    await expect(raise).toBeDisabled();
    await expect(page.getByText(
      'Type your message first. The request is the message — there is nothing to raise without it.',
    )).toBeVisible();
    await raise.click({ force: true });
    expect(world.calls('createRequest')).toHaveLength(0);
  });

  test('raising the request sends what was ticked, and nothing else', async ({ page, world }) => {
    await page.goto(`/app/records/${ID.parcel}/request`);
    await page.getByRole('checkbox', { name: 'The well from the gate' }).check();
    await page.getByRole('checkbox', { name: 'Sale deed 4412 of 1998' }).check();
    await expect(page.getByText('Whoever it is assigned to sees the 3 things you ticked, and nothing else.'))
      .toBeVisible();

    await page.getByRole('button', { name: 'Create request' }).click();

    await expect.poll(() => world.calls('createRequest')).toHaveLength(1);
    const vars = world.lastVars('createRequest');
    expect(vars).toMatchObject({
      recordId: ID.parcel,
      kind: 'survey',
      requester: 'the owner',
      shared: 'the boundary as GeoJSON, The well from the gate, Sale deed 4412 of 1998',
    });
    expect(String(vars.message)).toContain('please do the survey for this location');
    expect(JSON.parse(String(vars.attachmentManifest))).toEqual({
      documentIds: [PAPER.deed], photoIds: [PHOTO.cover], includeBoundary: true,
    });
  });

  test('the count on the shelf and the sentence under the button are the same number', async ({ page }) => {
    // Two places print what is attached — the Chip on "What to send"
    // (RequestWork.tsx:322) and the sentence at :313-317 — and both read the
    // same `attachmentCount`. On this screen those two disagreeing is the
    // difference between a surveyor being handed a deed and not.
    await page.goto(`/app/records/${ID.parcel}/request`);
    await expect(cardCount(page, 'What to send')).toHaveText('1');

    await page.getByRole('checkbox', { name: 'The well from the gate' }).check();
    await page.getByRole('checkbox', { name: 'Sale deed 4412 of 1998' }).check();

    await expect(cardCount(page, 'What to send')).toHaveText('3');
    // And each shelf counts only its own.
    await expect(cardCount(page, 'Photos')).toHaveText('1');
    await expect(cardCount(page, 'Papers')).toHaveText('1');
    await expect(page.getByText('Whoever it is assigned to sees the 3 things you ticked, and nothing else.'))
      .toBeVisible();
  });

  test('a paper I tick and then untick does not travel with the request', async ({ page, world }) => {
    await page.goto(`/app/records/${ID.parcel}/request`);
    const deed = page.getByRole('checkbox', { name: 'Sale deed 4412 of 1998' });

    await deed.check();
    await expect(page.getByText('sees the 2 things you ticked')).toBeVisible();
    await deed.uncheck();
    await expect(page.getByText('sees the 1 thing you ticked')).toBeVisible();

    await page.getByRole('button', { name: 'Create request' }).click();

    await expect.poll(() => world.calls('createRequest')).toHaveLength(1);
    const vars = world.lastVars('createRequest');
    // Not named in the sentence the worker reads, and not in the manifest.
    expect(vars.shared).toBe('the boundary as GeoJSON');
    expect(JSON.parse(String(vars.attachmentManifest))).toEqual({
      documentIds: [], photoIds: [], includeBoundary: true,
    });
  });

  test('a request with nothing ticked carries only the message', async ({ page, world }) => {
    await page.goto(`/app/records/${ID.parcel}/request`);
    await page.getByRole('checkbox', { name: /The boundary, as GeoJSON/ }).uncheck();
    await expect(page.getByText('Nothing of yours is attached.')).toBeVisible();

    await page.getByRole('button', { name: 'Create request' }).click();

    await expect.poll(() => world.calls('createRequest')).toHaveLength(1);
    const vars = world.lastVars('createRequest');
    expect(vars.shared).toBe('');
    expect(JSON.parse(String(vars.attachmentManifest))).toEqual({
      documentIds: [], photoIds: [], includeBoundary: false,
    });
  });

  test('somebody acting for the owner puts their own name on the request', async ({ page, world }) => {
    await page.goto(`/app/records/${ID.parcel}/request`);
    await page.getByRole('button', { name: 'I am acting for the owner' }).click();
    await page.getByLabel('Your name').fill('Venkat, for my brother');

    await page.getByRole('button', { name: 'Create request' }).click();

    await expect.poll(() => world.calls('createRequest')).toHaveLength(1);
    expect(world.lastVars('createRequest')).toMatchObject({ requester: 'Venkat, for my brother' });
  });

  test('acting for the owner without giving a name still says it is not the owner asking', async ({ page, world }) => {
    await page.goto(`/app/records/${ID.parcel}/request`);
    await page.getByRole('button', { name: 'I am acting for the owner' }).click();
    await expect(page.getByLabel('Your name')).toBeVisible();

    await page.getByRole('button', { name: 'Create request' }).click();

    await expect.poll(() => world.calls('createRequest')).toHaveLength(1);
    expect(world.lastVars('createRequest')).toMatchObject({ requester: 'acting for the owner' });
  });

  test('going back to being the owner puts the name away, and the request goes as the owner', async ({ page, world }) => {
    await page.goto(`/app/records/${ID.parcel}/request`);
    await page.getByRole('button', { name: 'I am acting for the owner' }).click();
    await page.getByLabel('Your name').fill('Venkat, for my brother');

    await page.getByRole('button', { name: 'I am the owner' }).click();

    await expect(page.getByLabel('Your name')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'I am the owner' }))
      .toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByRole('button', { name: 'I am acting for the owner' }))
      .toHaveAttribute('aria-pressed', 'false');

    await page.getByRole('button', { name: 'Create request' }).click();

    await expect.poll(() => world.calls('createRequest')).toHaveLength(1);
    // The name that was typed and then taken back does not travel.
    expect(world.lastVars('createRequest')).toMatchObject({ requester: 'the owner' });
    expect(String(world.lastVars('createRequest').requester)).not.toContain('Venkat');
  });

  test('while the request is being raised the button says so and cannot be pressed twice', async ({ page, world }) => {
    world.set('createRequest', World.slow(1500, 'w-req-new'));
    await page.goto(`/app/records/${ID.parcel}/request`);

    await page.getByRole('button', { name: 'Create request' }).click();

    const going = page.getByRole('button', { name: 'Raising…' });
    await expect(going).toBeVisible();
    await expect(going).toBeDisabled();
    await expect(page.getByRole('link', { name: 'Open the job' })).toBeVisible();
    expect(world.calls('createRequest')).toHaveLength(1);
  });

  test('a filed request stays on screen and hands me the job rather than taking it away', async ({ page }) => {
    await page.goto(`/app/records/${ID.parcel}/request`);
    await page.getByRole('button', { name: 'Create request' }).click();

    await expect(page.getByText(
      'Filed as a job. Nobody has it yet — open it to put somebody on it',
    )).toBeVisible();
    await expect(page.getByRole('link', { name: 'Open the job' }))
      .toHaveAttribute('href', '/app/services/w-req-new');
    // Both exits are the owner's act; nothing redirects itself.
    await expect(page).toHaveURL(new RegExp(`/app/records/${ID.parcel}/request`));
    await expect(page.getByRole('button', { name: 'Create request' })).toHaveCount(0);

    await page.getByRole('button', { name: 'Back to Services' }).click();
    await expect(page).toHaveURL(`/app/records/${ID.parcel}/services`);
  });

  test('a request the server would not accept says what it wanted', async ({ page, world }) => {
    world.set('createRequest', '');
    await page.goto(`/app/records/${ID.parcel}/request`);
    await page.getByRole('button', { name: 'Create request' }).click();

    await expect(page.getByText('That request was not accepted. A message is required.')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Open the job' })).toHaveCount(0);
  });

  test('a request that died on the way back is reported, with the reason', async ({ page, world }) => {
    world.set('createRequest', World.gqlError('the gateway gave up'));
    await page.goto(`/app/records/${ID.parcel}/request`);
    await page.getByRole('button', { name: 'Create request' }).click();

    // The shared mutation helper toasts the reason…
    const toast = page.locator('.toast').filter({ hasText: 'That request' });
    await expect(toast).toContainText('That request could not be saved. Nothing has changed.');
    await expect(toast).toContainText('the gateway gave up');
    // …and the button comes back, so the owner is not left pressing nothing.
    await expect(page.getByRole('button', { name: 'Create request' })).toBeEnabled();
    await expect(page.getByRole('link', { name: 'Open the job' })).toHaveCount(0);
  });

  test('a file added to a request is filed on the record first, then named on the request', async ({ page, world }) => {
    world.route(/\/api\/gateway\/storage\/files\?/, () => ({ json: storedNode() }));
    await page.goto(`/app/records/${ID.parcel}/request`);

    await page.getByLabel('Add a file to this request').setInputFiles({
      name: 'Sale deed.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 deed'),
    });
    await expect(card(page, 'Something else')).toContainText('Sale deed.pdf · 0.0 MB');

    await page.getByRole('button', { name: 'Create request' }).click();

    // Stored, then filed as a paper on the record — in that order.
    await expect.poll(() => world.restCalls(/storage\/files\?/)).toHaveLength(1);
    await expect.poll(() => world.calls('addPaper')).toHaveLength(1);
    expect(world.lastVars('addPaper')).toMatchObject({
      recordId: ID.parcel, fileRef: 'node-uploaded-1', name: 'Sale deed.pdf',
      subtitle: 'Added for this request', shelf: 'unsorted',
      mimeType: 'application/pdf', sizeBytes: 2048,
    });

    await expect.poll(() => world.calls('createRequest')).toHaveLength(1);
    const vars = world.lastVars('createRequest');
    expect(String(vars.shared)).toContain('Sale deed.pdf');
    expect(JSON.parse(String(vars.attachmentManifest)).documentIds).toContain('w-paper-new');
  });

  test('the same file picked twice is one file, and the count says so', async ({ page }) => {
    await page.goto(`/app/records/${ID.parcel}/request`);
    const pick = page.getByLabel('Add a file to this request');
    const file = { name: 'Sale deed.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 deed') };

    await pick.setInputFiles(file);
    await pick.setInputFiles(file);

    await expect(cardCount(page, 'Something else')).toHaveText('1');
    await expect(card(page, 'Something else')).toContainText('Sale deed.pdf · 0.0 MB');
    await expect(page.getByText('Whoever it is assigned to sees the 2 things you ticked, and nothing else.'))
      .toBeVisible();
  });

  test('a second file is added to the first rather than put in its place', async ({ page }) => {
    await page.goto(`/app/records/${ID.parcel}/request`);
    const pick = page.getByLabel('Add a file to this request');

    await pick.setInputFiles({ name: 'Sale deed.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 deed') });
    await pick.setInputFiles({ name: 'EC.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 ec') });

    await expect(cardCount(page, 'Something else')).toHaveText('2');
    await expect(card(page, 'Something else')).toContainText('Sale deed.pdf · 0.0 MB, EC.pdf · 0.0 MB');
    await expect(page.getByText('Whoever it is assigned to sees the 3 things you ticked, and nothing else.'))
      .toBeVisible();
  });

  test('“Add a file” is a real button and it opens the picker', async ({ page }) => {
    // The point of RequestWork.tsx:395-411: a <label> around a hidden input
    // takes no focus, so the tab order used to skip this card entirely and a
    // deed could only be attached with a mouse.
    await page.goto(`/app/records/${ID.parcel}/request`);
    const add = page.getByRole('button', { name: 'Add a file' });
    await add.focus();
    await expect(add).toBeFocused();

    const chooser = page.waitForEvent('filechooser');
    await add.press('Enter');

    expect((await chooser).isMultiple()).toBe(true);
  });

  test('a file over the limit is refused by name before a byte is sent, and no request is raised', async ({ page, world }) => {
    await page.goto(`/app/records/${ID.parcel}/request`);
    await page.getByLabel('Add a file to this request').setInputFiles({
      name: 'Scan.pdf', mimeType: 'application/pdf', buffer: Buffer.alloc(11 * 1024 * 1024, 1),
    });

    await page.getByRole('button', { name: 'Create request' }).click();

    await expect(page.getByText(
      'Scan.pdf is 11.0 MB. The limit is 10.0 MB — it was not uploaded and no request was raised.',
    )).toBeVisible();
    expect(world.restCalls(/storage\/files\?/)).toHaveLength(0);
    expect(world.calls('createRequest')).toHaveLength(0);
  });

  test('a file that was stored but could not be filed stops the request', async ({ page, world }) => {
    world.route(/\/api\/gateway\/storage\/files\?/, () => ({ json: storedNode() }));
    world.set('addPaper', '');
    await page.goto(`/app/records/${ID.parcel}/request`);
    await page.getByLabel('Add a file to this request').setInputFiles({
      name: 'Sale deed.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 deed'),
    });

    await page.getByRole('button', { name: 'Create request' }).click();

    await expect(page.getByText(
      'That file was stored but could not be filed against this record, so no request was raised.',
    )).toBeVisible();
    expect(world.calls('createRequest')).toHaveLength(0);
    // The file is still queued, so the owner can try again without re-picking.
    await expect(card(page, 'Something else')).toContainText('Sale deed.pdf');
  });

  test('when the second file cannot be filed the first one stays filed, and only the failure is left queued', async ({ page, world }) => {
    world.route(/\/api\/gateway\/storage\/files\?/, () => ({ json: storedNode() }));
    world.set('addPaper', (vars) => (String(vars.name) === 'Sale deed.pdf' ? 'w-paper-new' : ''));
    await page.goto(`/app/records/${ID.parcel}/request`);
    await page.getByLabel('Add a file to this request').setInputFiles([
      { name: 'Sale deed.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 deed') },
      { name: 'EC.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 ec') },
    ]);

    await page.getByRole('button', { name: 'Create request' }).click();

    await expect(page.getByText(
      'That file was stored but could not be filed against this record, so no request was raised.',
    )).toBeVisible();
    expect(world.calls('createRequest')).toHaveLength(0);
    // The deed is a paper on the record now, so it is ticked rather than
    // queued — a retry must not upload the same bytes a second time.
    await expect(card(page, 'Something else')).toContainText('EC.pdf');
    await expect(card(page, 'Something else')).not.toContainText('Sale deed.pdf');
    await expect(cardCount(page, 'Something else')).toHaveText('1');
    await expect(cardCount(page, 'Papers')).toHaveText('1');
    expect(world.restCalls(/storage\/files\?/)).toHaveLength(2);
  });

  test('an upload that died raises no request at all', async ({ page, world }) => {
    // The gateway answers 200 with no node id — which is how a save that did
    // not save actually looks. A transport failure would be the same branch
    // plus a console error the guard would fail on.
    world.route(/\/api\/gateway\/storage\/files\?/, () => ({ json: {} }));
    await page.goto(`/app/records/${ID.parcel}/request`);
    await page.getByLabel('Add a file to this request').setInputFiles({
      name: 'Sale deed.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 deed'),
    });

    await page.getByRole('button', { name: 'Create request' }).click();

    await expect(page.getByText('The upload service did not confirm that the file was saved.'))
      .toBeVisible();
    expect(world.calls('addPaper')).toHaveLength(0);
    expect(world.calls('createRequest')).toHaveLength(0);
    await expect(page.getByRole('link', { name: 'Open the job' })).toHaveCount(0);
  });

  test('the photos and papers on the record are the ones offered, and nothing else', async ({ page }) => {
    await page.goto(`/app/records/${ID.parcel}/request`);

    await expect(card(page, 'Photos').getByRole('checkbox')).toHaveCount(3);
    await expect(card(page, 'Papers').getByRole('checkbox')).toHaveCount(5);
    // A photo with no caption is named by its file, not left blank.
    await expect(card(page, 'Photos')).toContainText('ne-stone.jpg');
    await expect(card(page, 'Photos')).toContainText('Video');
    await expect(page.getByText('A paper names people. Send one only when the person asking needs it.'))
      .toBeVisible();
  });

  test('a record with nothing on it says so on both shelves', async ({ page }) => {
    await page.goto(`/app/records/${ID.plot}/request`);

    await expect(page.getByText('No photos on this record.')).toBeVisible();
    await expect(page.getByText('Nothing is filed against this record.')).toBeVisible();
  });

  test('the message card says what is added to what I typed, and what is not', async ({ page }) => {
    // The promise the whole screen rests on: the request is the message, and
    // nothing about the record rides along inside it unasked.
    await page.goto(`/app/records/${ID.parcel}/request`);

    await expect(card(page, 'Your message')).toContainText(
      'Your name is added at the end. Nothing else about the record goes in unless you type it.',
    );
  });

  test('the card that raises the job says where it lands and who does the sending', async ({ page }) => {
    await page.goto(`/app/records/${ID.parcel}/request`);

    await expect(card(page, 'Raise the request')).toContainText(
      'It goes on this record as Placed. Someone is put on it from the people this '
      + 'account works with, or Pattadar writes to a new person on your behalf — either '
      + 'way the system does the sending, so it can be taken back. You follow it under Services.',
    );
  });

  test('the file shelf states the limit before a byte is picked, not after one is refused', async ({ page }) => {
    await page.goto(`/app/records/${ID.parcel}/request`);

    await expect(cardCount(page, 'Something else')).toHaveText('0');
    await expect(card(page, 'Something else')).toContainText(
      'Each one is filed against this record as a paper when you raise the request, '
      + 'then named on it. Up to 10.0 MB each.',
    );
  });

  test('the way back from asking is the record’s own boundary, which is where the ask came from', async ({ page, world }) => {
    await page.goto(`/app/records/${ID.parcel}/request`);

    await page.getByRole('button', { name: 'Back to Sy 214/2' }).click();

    await expect(page).toHaveURL(`/app/records/${ID.parcel}/map`);
    expect(world.calls('createRequest')).toHaveLength(0);
  });

  test('Cancel leaves the record open and raises nothing', async ({ page, world }) => {
    await page.goto(`/app/records/${ID.parcel}/request`);

    await page.getByRole('button', { name: 'Cancel' }).click();

    await expect(page).toHaveURL(`/app/records/${ID.parcel}`);
    expect(world.calls('createRequest')).toHaveLength(0);
  });

  test('while the record is still arriving the form is not drawn over an empty one', async ({ page, world }) => {
    world.set('record', World.never());
    await page.goto(`/app/records/${ID.parcel}/request`);

    await expect(page.getByRole('status', { name: 'Loading this record' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Create request' })).toHaveCount(0);
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
    await page.goto(`/app/records/${ID.parcel}/request`);
    await expect(card(page, 'Papers')).toBeVisible();

    await expect(card(page, 'Papers'))
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
    await page.goto(`/app/records/${ID.parcel}/request`);
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
    await page.goto(`/app/records/${ID.parcel}/request`);
    await page.getByRole('button', { name: 'Create request' }).click();

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
    await page.goto(`/app/records/${ID.parcel}/request`);
    await page.getByLabel('Add a file to this request').setInputFiles({
      name: 'Sale deed.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 deed'),
    });
    await page.getByRole('button', { name: 'Create request' }).click();

    await expect(page.getByText(/no request was raised/i)).toBeVisible({ timeout: 3000 });
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
    await page.goto(`/app/records/${ID.parcel}/request?kind=banana`);
    await expect(page.getByRole('heading', { name: 'Ask a surveyor' })).toBeVisible();
    await page.getByRole('button', { name: 'Create request' }).click();

    await expect.poll(() => world.calls('createRequest')).toHaveLength(1);
    expect(world.lastVars('createRequest')).toMatchObject({ kind: 'survey' });
  });
});
