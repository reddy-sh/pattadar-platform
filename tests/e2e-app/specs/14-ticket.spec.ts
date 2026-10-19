/**
 * W13 — one service order, as the person who ordered it reads it.
 * `/services/:id` and `/services/:id/pay`.
 *
 * The screen answers "where is my order and what happens next" without the
 * owner ringing anybody (service order spec, 10/10/2026). Top to bottom:
 *
 *   · the head: Services › PT-xxxx, the title, ONE status pill, "For
 *     {property} · {place}" (the only place the property is named), the
 *     requester's commands as outlined buttons (Cancel order, Order it again)
 *     and "Copy link to this order" in the ⋮. No filled primary (§1.4);
 *   · the stage tracker: Placed · Assigned · In progress · Delivered ·
 *     Accepted, dates from the trail, the current step from `status`;
 *   · the Next step panel: one sentence that always says what happens next,
 *     holding the one filled button when the order waits on the owner (Pay /
 *     Hold, Accept work, Try payment again), or an outlined "Ask for an
 *     update" when it has gone quiet or is late;
 *   · Delivered work, once anything has come back (inside the panel while it
 *     waits on the owner's review);
 *   · Activity: the composer on top (words only: Attach waits for a reader
 *     the desk and the provider can open), the trail newest first, at most
 *     ten lines and "Show {n} earlier";
 *   · Details in the rail: Provider, Ordered, Expected by, Order no., Why
 *     ordered, the answers, and Payment (Price · Held · Released · Pattadar fee
 *     · Refunded), each fact told once.
 *
 * Everything the desk does — the roster and Assign, sending to a provider,
 * Withdraw, Mark on site, Record submitted work — left this page for
 * `/desk/jobs/:id` (14b-desk-job.spec.ts). The server enforces it: the
 * owner's `can` is a subset of cancel · accept · send_back · message · nudge ·
 * rate, and every control here is drawn from it.
 *
 * What a reader of this file must know before changing it:
 *
 *  · `fixtures/seed.ts` answers `ticket` with a FUNCTION of the id, mirroring
 *    web360.py's shape. `view()` below is a hand-built TicketView for the
 *    branches the eight seeded orders do not hold; it is the server's shape
 *    too (owner statuses, `payeeShare` a fraction, DD/MM/YYYY dates, events in
 *    the server's requester words, no dispatch or payment rows).
 *  · Refusals are a plain falsy answer or `World.gqlError`, never
 *    `World.httpError`: a non-2xx reaches the console guard.
 *  · `/services/:id` is a lazy route, so every "is NOT offered" assertion
 *    waits on `drawn()` first.
 *  · The checkout page is NOT sealed against Razorpay — only `/api` is. No
 *    test takes a path that loads checkout.razorpay.com.
 */
import { test, expect, World } from '../fixtures/harness';
import type { Page } from '../fixtures/harness';
import { ID, TICKET } from '../fixtures/ids';

// ── the screen's own words, quoted once ────────────────────────────────

const MOVE_FAILED =
  'That did not go through. Nothing on this order has changed — reload the page and try again.';
const ACCEPT_FAILED = 'That was not accepted. Decide on every item first, then try again.';
const MESSAGE_REFUSED = 'That message was not added. This order may be closed.';
const MESSAGE_FAILED = 'That message did not reach Pattadar. Nothing was sent — try again.';
const RATING_FAILED = 'That rating was not saved. Reload and try again.';
const MONEY_RULE = 'Released to the provider only when you accept the work.';

/** A storage node id: `isStorageRef` opens only UUID-shaped refs. */
const NODE = '5e3a2b1c-7d4e-4f60-8a9b-0c1d2e3f4a5b';

// ── a TicketView, every field Q_TICKET selects ─────────────────────────

type Over = Record<string, unknown>;

const MONEY = {
  quoted: 6_500, held: 6_500, released: 0, fee: 0, returned: 0, payeeShare: 0.9,
  provider: 'stub', live: false, funded: true,
  headline: '₹6,500 held',
  honesty: 'Payments are switched off on this build. Nothing has been charged.',
};

/** A trail line as web360.py `_ev(owner=True)` sends it. */
const ev = (id: string, kind: string, action: string, headline: string, day: string,
            actorKind = 'owner', actorLabel = 'You', detail = '', extra: Over = {}) => ({
  id, kind, action, headline, detail, actorLabel, actorKind, tone: '',
  at: `2026-09-${day}T05:00:00Z`, atLabel: `${day}/09/2026`, attachments: [], ...extra,
});

const EVENTS = [
  ev('w-ev-1', 'status', 'place', 'You placed this order', '04'),
  ev('w-ev-2', 'status', 'assign', 'Pattadar desk assigned Ravi Kumar', '05', 'system', 'Pattadar desk'),
  ev('w-ev-3', 'status', 'start', 'Ravi Kumar started work', '06', 'worker', 'Ravi Kumar'),
  ev('w-ev-4', 'deliverable', '', 'Ravi Kumar delivered “8 corners, walked”', '10', 'system', 'Pattadar desk'),
  ev('w-ev-5', 'status', 'deliver', 'Ravi Kumar delivered the work', '10', 'system', 'Pattadar desk'),
];

const DELIVERABLES = [
  {
    id: 'w-dlv-1', kind: 'boundary', label: '8 corners, walked', note: 'GPS, ±3 m',
    fileRef: '', fileName: '', mimeType: '', sizeBytes: 0,
    payload: JSON.stringify({ ring: '15.3133,80.0729;15.3140,80.0740;15.3120,80.0750' }),
    submittedBy: 'Ravi Kumar', submittedAt: '10/09/2026', fileAs: 'boundary',
    fileTargets: [{ k: 'boundary', v: 'The outline on file' }],
    goesTo: 'The outline on file', review: 'pending', reviewNote: '',
    filedTable: '', filedId: '', filedAt: '',
  },
  {
    id: 'w-dlv-2', kind: 'paper', label: 'Surveyor report', note: '3 pages',
    fileRef: NODE, fileName: 'survey-report.pdf', mimeType: 'application/pdf', sizeBytes: 240_000,
    payload: '{}', submittedBy: 'Ravi Kumar', submittedAt: '10/09/2026', fileAs: 'map',
    fileTargets: [{ k: 'map', v: 'Map' }, { k: 'title', v: 'Title deeds' }],
    goesTo: 'Documents › Map', review: 'pending', reviewNote: '',
    filedTable: '', filedId: '', filedAt: '',
  },
];

const LEDGER = [{
  id: 'w-led-1', entry: 'hold', label: 'Held', amount: 6_500,
  fromBucket: 'wallet', toBucket: 'held', payee: '', provider: 'stub',
  simulated: true, status: 'done', note: '',
  ticketId: TICKET.needsYou, ticketRef: 'PT-2105', at: '05/09/2026',
}];

/** One order waiting on the owner with two undecided items — the busiest
 *  state the screen has. Every other branch is this with an override. */
const view = (over: Over = {}) => ({
  id: TICKET.needsYou, ref: 'PT-2105', kind: 'survey',
  title: 'Corner survey', detail: 'Establish 8 corners',
  recordId: ID.parcel, recordTitle: 'Sy 214/2',
  recordPlace: 'Katragunta, Markapur, Prakasam',
  status: 'submitted', statusLabel: 'Waiting on you', statusState: 'warn',
  stage: 3, stageLabel: 'Delivered', needsYou: true, closed: false,
  assignee: 'Ravi Kumar', dueDate: '25/09/2026',
  assignedTo: null, assignedResource: null,
  quietDays: 0, quiet: false, outcomeNote: '', acceptedAt: '', createdAt: '2026-09-04',
  can: ['accept', 'cancel', 'message', 'send_back'],
  answers: [{ k: 'Which survey number', v: '214/2' }, { k: 'How many corners', v: '8' }],
  myRating: 0, myRatingNote: '',
  money: MONEY,
  events: EVENTS,
  deliverables: DELIVERABLES,
  ledger: LEDGER,
  overdueDays: 0, askedAt: '', files: [],
  ...over,
});

/** An order nobody has taken yet, its money held — the founder's PT-4789. */
const placedHeld = (over: Over = {}) => view({
  ref: 'PT-2101', title: 'Encumbrance certificate', kind: 'ec', detail: 'missing_documents',
  status: 'placed', statusLabel: 'Placed', statusState: 'unknown', stage: 0, stageLabel: 'Placed',
  needsYou: false, assignee: '', can: ['cancel', 'message'],
  money: money({ quoted: 1_180, held: 1_180 }), deliverables: [], answers: [],
  events: [EVENTS[0]], ledger: [{ ...LEDGER[0], amount: 1_180, at: '09/09/2026' }],
  ...over,
});

/** The provider behind the name, as web360.py `_assigned_person` sends it. */
const ASSOCIATE = {
  associateId: 'as-ravi', name: 'Ravi Kumar', firm: 'Ravi Surveys', initials: 'RK',
  discipline: 'surveyor', disciplineLabel: 'Licensed surveyor',
  contact: '9848012345', contactShown: true, contactWhy: '',
  assignedAt: '2026-09-05', via: 'the desk',
};
/** Q_TICKET's whole `assignedResource` selection: Verified and the rating.
 *  The provider's workload and credentials are desk-only (spec §7, §13). */
const TRUST = { ratingAverage: 4.6, ratingCount: 12, professionalVerified: true };

const associate = (over: Over = {}) => ({ ...ASSOCIATE, ...over });
const money = (over: Over = {}) => ({ ...MONEY, ...over });
const deliverable = (i: number, over: Over = {}) => ({ ...DELIVERABLES[i], ...over });
/** The same order with the provider on the land, money held. */
const onSite = (over: Over = {}) => view({
  status: 'on_site', statusLabel: 'In progress', statusState: 'unknown', stage: 2, stageLabel: 'On site',
  needsYou: false, can: ['cancel', 'message'], deliverables: [], events: EVENTS.slice(0, 3),
  assignedTo: associate(), ...over,
});
/** The same order, sent back for rework. */
const sentBack = (over: Over = {}) => onSite({
  status: 'changes', statusLabel: 'Sent back', statusState: 'warn',
  deliverables: [deliverable(0, { review: 'rejected', reviewNote: 'Corner 6 is in the road' })],
  events: [...EVENTS, ev('w-ev-sb', 'status', 'send_back', 'You sent the work back', '11')],
  ...over,
});
/** The same order, accepted and closed. */
const accepted = (over: Over = {}) => view({
  status: 'accepted', statusLabel: 'Accepted', statusState: 'good', closed: true, needsYou: false,
  can: ['message'], acceptedAt: '2026-09-11', dueDate: '',
  money: money({ held: 0, released: 5_850, fee: 650, funded: false }),
  deliverables: [
    deliverable(0, { review: 'accepted', filedTable: 'parcels', filedId: ID.parcel, filedAt: '11/09/2026' }),
    deliverable(1, { review: 'accepted', filedTable: 'documents', filedId: 'w-paper-map', filedAt: '11/09/2026' }),
  ],
  events: [...EVENTS, ev('w-ev-6', 'status', 'accept', 'You accepted the work', '11')],
  ledger: [LEDGER[0],
    { ...LEDGER[0], id: 'w-led-2', entry: 'release', label: 'Released', amount: 5_850, toBucket: 'payout', payee: 'Ravi Kumar', at: '11/09/2026' },
    { ...LEDGER[0], id: 'w-led-3', entry: 'fee', label: 'Pattadar fee', amount: 650, toBucket: 'fee', at: '11/09/2026' }],
  ...over,
});

// ── locators ───────────────────────────────────────────────────────────

/** One titled Card: `<section class="card">` with its title as the only h2. */
const card = (page: Page, title: string) =>
  page.locator('section.card').filter({ has: page.getByRole('heading', { name: title, exact: true }) });
const head = (page: Page) => page.locator('header.pagehead');
const meta = (page: Page) => page.locator('header.pagehead .pagehead-meta');
const tracker = (page: Page) => page.getByRole('list', { name: 'Order progress' });
const step = (page: Page, label: string) =>
  tracker(page).getByRole('listitem').filter({ hasText: new RegExp(`^${label}`) });
const here = (page: Page) => tracker(page).locator('[aria-current="step"]');
const panel = (page: Page) => page.locator('section.card.next-step');
/** The panel's sentence: the panel itself also holds its hidden heading. */
const say = (page: Page) => panel(page).locator('.svc-say');
const details = (page: Page) => card(page, 'Details');
const activity = (page: Page) => card(page, 'Activity');
const stream = (page: Page) => page.getByRole('list', { name: 'Order activity' }).locator('> li');
const composer = (page: Page) => activity(page).getByRole('textbox', { name: 'Message' });
const detailValue = (page: Page, k: string) =>
  details(page).locator('dl > div').filter({ has: page.locator('dt', { hasText: new RegExp(`^${k}$`) }) }).locator('dd');

/** The ⋮'s items, in order. It is portalled, so it is read off the page. */
async function overflow(page: Page, ref: string): Promise<string[]> {
  await page.getByRole('button', { name: `More actions for ${ref}` }).click();
  const items = (await page.getByRole('menuitem').allTextContents()).map((s) => s.trim());
  await page.keyboard.press('Escape');
  return items;
}

const ticketAt = (page: Page, id: string) => page.goto(`/services/${id}`);

/** The order is actually on screen (the route is lazy). */
const drawn = (page: Page, title: string) =>
  expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible();

/** How many times a phrase is in the page's own words, outside the tracker
 *  (whose step labels share the status words by design). */
async function saidTimes(page: Page, phrase: string): Promise<number> {
  const text = await page.locator('main').evaluate((m) => {
    const copy = m.cloneNode(true) as HTMLElement;
    copy.querySelectorAll('ol.tracker').forEach((t) => t.remove());
    return copy.innerText;
  });
  return text.split(phrase).length - 1;
}

const openCancel = async (page: Page) => {
  await head(page).getByRole('button', { name: 'Cancel order' }).click();
  return page.getByRole('dialog', { name: 'Cancel this order?' });
};

// ── payments ───────────────────────────────────────────────────────────

const PAY_CONFIG = /\/api\/gateway\/pattadar\/payments\/config/;
const PAY_TICKET = /\/api\/gateway\/pattadar\/payments\/tickets\//;

/** What `GET /payments/tickets/{id}` answers with when payments are OFF. */
const payState = (over: Over = {}) => ({
  status: 'not_started', title: 'Corner survey', amount: 650_000, currency: 'INR',
  mode: 'off', enabled: false, operations: [], ...over,
});

const paymentsOn = (world: World, mode: 'test' | 'live' = 'test') =>
  world.route(PAY_CONFIG, () => ({ json: { enabled: true, mode, live: mode === 'live' } }));

// ═══════════════════════════════════════════════════════════════════════
test.describe('W13 · the head', () => {
  test('the crumbs are Services and the order number, and the property is not one of them', async ({ page, world }) => {
    await ticketAt(page, TICKET.assigned);
    await drawn(page, 'Corner survey');
    expect(world.lastVars('ticket')).toMatchObject({ id: TICKET.assigned });

    const crumbs = page.getByRole('navigation', { name: 'Breadcrumb' });
    await expect(crumbs.getByRole('link', { name: 'Services' })).toHaveAttribute('href', '/services');
    await expect(crumbs.locator('[aria-current="page"]')).toHaveText('PT-2102');
    await expect(crumbs.getByRole('link')).toHaveCount(1);
    await expect(crumbs).not.toContainText('Sy 214/2');
  });

  test('the title is the service and names the browser tab', async ({ page }) => {
    await ticketAt(page, TICKET.placed);
    await drawn(page, 'Encumbrance certificate');
    await expect(page).toHaveTitle('Encumbrance certificate · Pattadar');
  });

  test('the property is named once, in the meta line, as the way back to it', async ({ page }) => {
    await ticketAt(page, TICKET.assigned);
    await drawn(page, 'Corner survey');

    await expect(meta(page)).toHaveText('For Sy 214/2 · Katragunta, Markapur, Prakasam');
    await expect(meta(page).getByRole('link', { name: 'Sy 214/2' }))
      .toHaveAttribute('href', `/properties/${ID.parcel}`);
    await expect(page.locator('main').getByRole('link', { name: /Sy 214\/2/ })).toHaveCount(1);
    // Ordered, Due, Provider and "Updated" left the meta line for Details.
    await expect(meta(page)).not.toContainText('Ordered');
    await expect(meta(page)).not.toContainText('Provider');
  });

  test('the status word is the server\'s owner word, told once by the pill', async ({ page }) => {
    await ticketAt(page, TICKET.onSite);
    await drawn(page, 'Corner survey');

    await expect(head(page).locator('.schip')).toHaveText('In progress');
    expect(await saidTimes(page, 'In progress')).toBe(1);
    // "On site" is false for an order that never visits a site.
    expect(await saidTimes(page, 'On site')).toBe(0);
  });

  test('an open order offers Cancel order as a labelled head button, and no filled primary', async ({ page }) => {
    await ticketAt(page, TICKET.assigned);
    await drawn(page, 'Corner survey');

    await expect(head(page).getByRole('button', { name: 'Cancel order' })).toBeVisible();
    await expect(head(page).locator('.btn.primary')).toHaveCount(0);
    await expect(head(page).getByRole('link', { name: 'Order it again' })).toHaveCount(0);
  });

  test('a finished order offers Order it again, into the order flow with this service chosen', async ({ page }) => {
    await ticketAt(page, TICKET.closed);
    await drawn(page, 'Corner survey');

    await expect(head(page).getByRole('link', { name: 'Order it again' }))
      .toHaveAttribute('href', `/order?for=${ID.parcel}&step=services&service=survey`);
    await expect(head(page).getByRole('button', { name: 'Cancel order' })).toHaveCount(0);
  });

  test('ordering it again lands on the order flow with the service already picked', async ({ page }) => {
    await ticketAt(page, TICKET.cancelled);
    await head(page).getByRole('link', { name: 'Order it again' }).click();
    // Straight into the one order flow, no redirect hop.
    await expect(page).toHaveURL(`/order?for=${ID.parcel}&step=services&service=survey`);
  });

  test('the ⋮ holds only the copy link, and none of the desk\'s moves', async ({ page }) => {
    await ticketAt(page, TICKET.quiet);
    await drawn(page, 'Encumbrance certificate');
    expect(await overflow(page, 'PT-2106')).toEqual(['Copy link to this order']);
  });

  test('a page that is loading has the head already, named for an order', async ({ page, world }) => {
    world.set('ticket', World.never());
    await ticketAt(page, TICKET.assigned);

    await expect(page.getByRole('status', { name: 'Loading this order' })).toBeVisible();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Service order');
    await expect(page).toHaveTitle('Service order · Pattadar');
    await expect(page.getByRole('navigation', { name: 'Breadcrumb' }).getByRole('link', { name: 'Services' })).toBeVisible();
  });

  test('an order that will not load says so, keeps the reason and offers to try again', async ({ page, world }) => {
    world.set('ticket', World.gqlError('the order store is down'));
    await ticketAt(page, TICKET.assigned);

    await expect(page.getByText('This order did not load')).toBeVisible();
    await expect(page.getByText('the order store is down')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Try again' })).toBeVisible();
  });

  test('an order that comes back on the second ask is drawn, not left as an error', async ({ page, world }) => {
    world.set('ticket', World.gqlError('the order store is down'));
    await ticketAt(page, TICKET.needsYou);
    await expect(page.getByText('This order did not load')).toBeVisible();

    world.set('ticket', view());
    await page.getByRole('button', { name: 'Try again' }).click();
    await drawn(page, 'Corner survey');
  });

  test('an id that resolves to nothing is not told apart from one that is not mine', async ({ page, world }) => {
    await ticketAt(page, TICKET.missing);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('This order is not in your account');
    expect(world.lastVars('ticket')).toMatchObject({ id: TICKET.missing });
    await expect(page.getByText('It was cancelled, or it belongs to another account.')).toBeVisible();
    await expect(page.locator('main').getByRole('link', { name: 'Back to Services' }))
      .toHaveAttribute('href', '/services');
  });

  test('a duplicate-order notice that links here with ?action=cancel opens the cancel dialog', async ({ page }) => {
    await page.goto(`/services/${TICKET.assigned}?action=cancel`);
    await expect(page.getByRole('dialog', { name: 'Cancel this order?' })).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`/services/${TICKET.assigned}$`));
  });
});

// ═══════════════════════════════════════════════════════════════════════
test.describe('W13 · copying', () => {
  test.use({ permissions: ['clipboard-read', 'clipboard-write'] });

  test('Copy link to this order puts the order\'s own address on the clipboard', async ({ page, baseURL }) => {
    await ticketAt(page, TICKET.assigned);
    await page.getByRole('button', { name: 'More actions for PT-2102' }).click();
    await page.getByRole('menuitem', { name: 'Copy link to this order' }).click();

    await expect(page.getByText('Link copied')).toBeVisible();
    expect(await page.evaluate(() => navigator.clipboard.readText()))
      .toBe(`${new URL(baseURL ?? 'http://localhost:5173').origin}/services/${TICKET.assigned}`);
  });

  test('Copy order number copies the PT number and nothing else', async ({ page }) => {
    await ticketAt(page, TICKET.assigned);
    await details(page).getByRole('button', { name: 'Copy order number' }).click();

    await expect(page.getByText('Order number copied')).toBeVisible();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('PT-2102');
  });
});

// ═══════════════════════════════════════════════════════════════════════
test.describe('W13 · the tracker', () => {
  test('five steps in the requester\'s words, as an ordered list with the current step marked', async ({ page }) => {
    await ticketAt(page, TICKET.assigned);
    await drawn(page, 'Corner survey');

    const steps = tracker(page).getByRole('listitem');
    await expect(steps).toHaveCount(5);
    await expect(steps.locator('.tracker-label')).toHaveText(
      ['Placed (done)', 'Assigned', 'In progress', 'Delivered', 'Accepted']);
    await expect(step(page, 'Placed')).toContainText('04/09/2026');
    await expect(here(page)).toHaveCount(1);
    await expect(here(page)).toContainText('Assigned');
    await expect(here(page)).toContainText('Since 05/09/2026');
    // A future step carries no date.
    await expect(step(page, 'In progress')).not.toContainText('/2026');
  });

  test('work that came back is the Delivered step, waiting on me', async ({ page, world }) => {
    world.set('ticket', view());
    await ticketAt(page, TICKET.needsYou);

    await expect(here(page)).toContainText('Delivered');
    await expect(here(page)).toContainText('Delivered 10/09/2026 · waiting on you');
    await expect(step(page, 'In progress')).toContainText('06/09/2026');
  });

  test('the current step comes from the status, never from the stage integer', async ({ page, world }) => {
    // `stage` runs backwards between changes and submitted; the tracker must not.
    world.set('ticket', view({ stage: 0, stageLabel: 'Placed' }));
    await ticketAt(page, TICKET.needsYou);
    await expect(here(page)).toContainText('Delivered');
  });

  test('an order in progress says since when, and a site visit says it is on site', async ({ page, world }) => {
    await ticketAt(page, TICKET.onSite);
    await expect(here(page)).toContainText('In progress');
    await expect(here(page)).toContainText('Since 06/09/2026');

    world.set('ticket', view({
      kind: 'site_visit', title: 'Site visit', status: 'on_site', statusLabel: 'In progress',
      statusState: 'unknown', can: ['cancel', 'message'], deliverables: [], events: EVENTS.slice(0, 3),
    }));
    await page.reload();
    await expect(here(page)).toContainText('On site since 06/09/2026');
  });

  test('work I sent back is being reworked, and the delivery it replaces is struck through', async ({ page }) => {
    await ticketAt(page, TICKET.delivered);
    await drawn(page, 'Corner survey');

    await expect(here(page)).toContainText('In progress');
    await expect(here(page)).toContainText('Being reworked since 11/09/2026');
    const delivered = step(page, 'Delivered');
    await expect(delivered).toHaveClass(/undone/);
    await expect(delivered).toContainText('Sent back 11/09/2026');
    await expect(delivered.locator('.tracker-label')).toHaveCSS('text-decoration-line', 'line-through');
  });

  test('an accepted order has every step done, and the last is where it stands', async ({ page }) => {
    await ticketAt(page, TICKET.closed);
    await drawn(page, 'Corner survey');

    await expect(tracker(page).locator('.tracker-step.done')).toHaveCount(5);
    await expect(here(page)).toContainText('Accepted');
    await expect(here(page)).toContainText('11/09/2026');
  });

  test('a cancelled order stops at the step it reached, with one Cancelled step and nothing after', async ({ page }) => {
    await ticketAt(page, TICKET.cancelled);
    await drawn(page, 'Corner survey');

    const steps = tracker(page).getByRole('listitem');
    await expect(steps).toHaveCount(2);
    await expect(steps.nth(0)).toContainText('Placed');
    await expect(steps.nth(1)).toContainText('Cancelled');
    await expect(steps.nth(1)).toContainText('06/09/2026');
    await expect(steps.nth(1)).toHaveClass(/stopped/);
    await expect(here(page)).toContainText('Cancelled');
  });

  test('an order with no provider for days says how long, in the warn tone, and nothing louder', async ({ page, world }) => {
    world.set('ticket', placedHeld({ quietDays: 4, can: ['cancel', 'message', 'nudge'] }));
    await ticketAt(page, TICKET.needsYou);

    const caption = here(page).locator('.tracker-caption');
    await expect(caption).toHaveText('Finding a provider · 4 days so far');
    await expect(caption).toHaveClass(/warn/);
    await expect(page.locator('.card.alert')).toHaveCount(0);
  });

  test('a fresh order does not count nought days', async ({ page, world }) => {
    world.set('ticket', placedHeld({ quietDays: 0 }));
    await ticketAt(page, TICKET.needsYou);
    await expect(here(page)).toContainText('Placed');
    await expect(here(page).locator('.tracker-caption')).toHaveCount(0);
  });

  test('an overdue order says by how much on the current step, and overdue outranks quiet', async ({ page, world }) => {
    world.set('ticket', view({
      status: 'assigned', statusLabel: 'Assigned', statusState: 'unknown', can: ['cancel', 'message', 'nudge'],
      deliverables: [], events: EVENTS.slice(0, 2), overdueDays: 2, quietDays: 9,
    }));
    await ticketAt(page, TICKET.needsYou);

    const caption = here(page).locator('.tracker-caption');
    await expect(caption).toHaveText('Overdue by 2 days');
    await expect(caption).toHaveClass(/warn/);
  });

  test('an unpaid order is waiting on my payment, said plainly and never as a search running late', async ({ page, world }) => {
    world.set('ticket', placedHeld({ quietDays: 9, money: money({ quoted: 1_180, held: 0, funded: false }), ledger: [] }));
    await ticketAt(page, TICKET.needsYou);

    const caption = here(page).locator('.tracker-caption');
    await expect(caption).toHaveText('Waiting for your payment');
    await expect(caption).not.toHaveClass(/warn|bad/);
    await expect(tracker(page)).not.toContainText('Finding a provider');
  });

  test('work sent back that runs late says so on the step being reworked', async ({ page, world }) => {
    world.set('ticket', sentBack({ overdueDays: 2 }));
    await ticketAt(page, TICKET.needsYou);

    const caption = here(page).locator('.tracker-caption');
    await expect(caption).toHaveText('Overdue by 2 days');
    await expect(caption).toHaveClass(/warn/);
  });

  test('a payment that did not go through is said on the first step, in the bad tone', async ({ page, world }) => {
    world.set('ticket', placedHeld({
      money: money({ quoted: 1_180, held: 0, funded: false, provider: 'razorpay', live: true }),
      ledger: [{ ...LEDGER[0], amount: 1_180, provider: 'razorpay', simulated: false, status: 'failed' }],
    }));
    await ticketAt(page, TICKET.needsYou);

    const caption = step(page, 'Placed').locator('.tracker-caption');
    await expect(caption).toHaveText('Payment did not go through');
    await expect(caption).toHaveClass(/bad/);
  });
});

// ═══════════════════════════════════════════════════════════════════════
test.describe('W13 · the Next step panel', () => {
  test('an assigned order says the provider has accepted it, and asks nothing of me', async ({ page }) => {
    await ticketAt(page, TICKET.assigned);
    await expect(panel(page)).toContainText('Your provider has accepted this order.');
    await expect(panel(page).getByRole('button')).toHaveCount(0);
    await expect(panel(page)).not.toHaveClass(/accent/);
  });

  test('an order in progress says the provider is working on it', async ({ page }) => {
    await ticketAt(page, TICKET.onSite);
    await expect(say(page)).toHaveText('Your provider is working on this order.');
  });

  test('a held order nobody has taken says Pattadar is finding a provider', async ({ page, world }) => {
    world.set('ticket', placedHeld());
    await ticketAt(page, TICKET.needsYou);
    await expect(say(page)).toHaveText('Pattadar is finding a provider for this order.');
  });

  test('an order the desk has sent out still reads Placed to me, and says the same thing', async ({ page, world }) => {
    world.set('ticket', placedHeld({ status: 'sent', statusLabel: 'Placed' }));
    await ticketAt(page, TICKET.needsYou);
    await expect(head(page).locator('.schip')).toHaveText('Placed');
    await expect(say(page)).toHaveText('Pattadar is finding a provider for this order.');
    await expect(page.getByText('Sent out')).toHaveCount(0);
  });

  test('an unpaid order with payments off asks me to hold the price, with the one filled button', async ({ page }) => {
    await ticketAt(page, TICKET.placed);

    await expect(panel(page)).toHaveClass(/accent/);
    await expect(panel(page)).toContainText('Hold ₹1,200 from your wallet so a provider can start.');
    await expect(panel(page)).toContainText(MONEY_RULE);
    const hold = panel(page).getByRole('button', { name: 'Hold ₹1,200' });
    await expect(hold).toHaveClass(/primary/);
    await expect(page.locator('main .btn.primary')).toHaveCount(2); // Hold, and the composer's Send
  });

  test('holding the price calls fundTicket for this order', async ({ page, world }) => {
    await ticketAt(page, TICKET.placed);
    await panel(page).getByRole('button', { name: 'Hold ₹1,200' }).click();

    await expect.poll(() => world.calls('fundTicket')).toHaveLength(1);
    expect(world.lastVars('fundTicket')).toMatchObject({ ticketId: TICKET.placed });
  });

  test('a refused hold says nothing on this order has changed, in the panel', async ({ page, world }) => {
    world.set('fundTicket', '');
    await ticketAt(page, TICKET.placed);
    await panel(page).getByRole('button', { name: 'Hold ₹1,200' }).click();
    await expect(panel(page).getByText(MOVE_FAILED)).toBeVisible();
  });

  test('a hold that falls over on the way says the same thing', async ({ page, world }) => {
    world.set('fundTicket', World.gqlError('the ledger is locked'));
    await ticketAt(page, TICKET.placed);
    await panel(page).getByRole('button', { name: 'Hold ₹1,200' }).click();
    await expect(panel(page).getByText(MOVE_FAILED)).toBeVisible();
  });

  test('with payments on the panel hands through to the checkout with the price on the button', async ({ page, world }) => {
    paymentsOn(world);
    await ticketAt(page, TICKET.placed);

    await expect(panel(page)).toContainText('Pay ₹1,200 so a provider can start.');
    await expect(panel(page).getByRole('link', { name: 'Pay ₹1,200' }))
      .toHaveAttribute('href', `/services/${TICKET.placed}/pay`);
    await expect(page.getByRole('button', { name: /^Hold ₹/ })).toHaveCount(0);
  });

  test('a payment that did not go through says so and offers to try again', async ({ page, world }) => {
    world.set('ticket', placedHeld({
      money: money({ quoted: 1_180, held: 0, funded: false, provider: 'razorpay', live: true }),
      ledger: [{ ...LEDGER[0], amount: 1_180, provider: 'razorpay', simulated: false, status: 'failed' }],
    }));
    await ticketAt(page, TICKET.needsYou);

    await expect(panel(page)).toHaveClass(/accent/);
    await expect(panel(page)).toContainText('Your payment did not go through.');
    await expect(panel(page)).toContainText('The provider will not start until it does.');
    await expect(panel(page).getByRole('link', { name: 'Try payment again' }))
      .toHaveAttribute('href', `/services/${TICKET.needsYou}/pay`);
  });

  test('an order with no provider for four days says how long and offers to ask, never a pink box', async ({ page, world }) => {
    world.set('ticket', placedHeld({ quietDays: 4, can: ['cancel', 'message', 'nudge'] }));
    await ticketAt(page, TICKET.needsYou);

    await expect(panel(page)).toContainText('Still finding a provider · 4 days so far');
    await expect(panel(page).locator('.schip.warn')).toHaveText('4 days so far');
    await expect(panel(page)).toContainText('We will tell you here as soon as a provider accepts.');
    await expect(panel(page).getByRole('button', { name: 'Ask for an update' })).toBeVisible();
    await expect(page.locator('.card.alert')).toHaveCount(0);
    await expect(page.getByText(/No update in \d+ days/)).toHaveCount(0);
  });

  test('a provider who has gone quiet is named as quiet, with the remedy', async ({ page }) => {
    await ticketAt(page, TICKET.quiet);
    await expect(panel(page)).toContainText('No word from your provider · 9 days');
    await expect(panel(page)).toContainText('Ask for an update and Pattadar desk will contact them.');
    await expect(panel(page).getByRole('button', { name: 'Ask for an update' })).toBeVisible();
    await expect(panel(page)).not.toHaveClass(/accent/);
  });

  test('a late order says by how much, and overdue outranks quiet', async ({ page, world }) => {
    world.set('ticket', view({
      status: 'assigned', statusLabel: 'Assigned', statusState: 'unknown', can: ['cancel', 'message', 'nudge'],
      deliverables: [], events: EVENTS.slice(0, 2), overdueDays: 2, quietDays: 9,
    }));
    await ticketAt(page, TICKET.needsYou);

    await expect(panel(page)).toContainText('This order is Overdue by 2 days');
    await expect(panel(page)).toContainText('Ask for an update and Pattadar desk will follow it up.');
    await expect(panel(page)).not.toContainText('No word from your provider');
  });

  test('asking for an update tells the desk about this order, once', async ({ page, world }) => {
    await ticketAt(page, TICKET.quiet);
    await panel(page).getByRole('button', { name: 'Ask for an update' }).click();

    await expect.poll(() => world.calls('nudgeTicket')).toHaveLength(1);
    expect(world.lastVars('nudgeTicket')).toEqual({ ticketId: TICKET.quiet });
    // Focus is not dropped onto the page: it lands on the panel.
    await expect(panel(page)).toBeFocused();
  });

  test('the panel is a landmark named Next step, and its sentence is spoken when it changes', async ({ page }) => {
    await ticketAt(page, TICKET.quiet);
    const region = page.getByRole('region', { name: 'Next step' });
    await expect(region).toHaveCount(1);
    await expect(region.getByRole('heading', { level: 2, name: 'Next step' })).toHaveCount(1);
    await expect(region.getByRole('status')).toContainText('No word from your provider · 9 days');
  });

  test('holding the price puts focus on the panel', async ({ page, world }) => {
    await ticketAt(page, TICKET.placed);
    await panel(page).getByRole('button', { name: 'Hold ₹1,200' }).click();
    await expect.poll(() => world.calls('fundTicket')).toHaveLength(1);
    await expect(panel(page)).toBeFocused();
  });

  test('a refused request for an update says nothing on this order has changed', async ({ page, world }) => {
    world.set('nudgeTicket', false);
    await ticketAt(page, TICKET.quiet);
    await panel(page).getByRole('button', { name: 'Ask for an update' }).click();
    await expect(panel(page).getByText(MOVE_FAILED)).toBeVisible();
  });

  test('a request for an update that falls over says the same thing', async ({ page, world }) => {
    world.set('nudgeTicket', World.gqlError('the desk is down'));
    await ticketAt(page, TICKET.quiet);
    await panel(page).getByRole('button', { name: 'Ask for an update' }).click();
    await expect(panel(page).getByText(MOVE_FAILED)).toBeVisible();
  });

  test('once asked, the button is replaced by when I asked, and the stream says so', async ({ page, world }) => {
    world.set('ticket', view({
      status: 'assigned', statusLabel: 'Assigned', statusState: 'unknown', can: ['cancel', 'message'],
      deliverables: [], quietDays: 9, askedAt: new Date().toISOString(),
      events: [...EVENTS.slice(0, 2), ev('w-ev-n', 'nudge', 'nudge', 'You asked Pattadar desk for an update', '14')],
    }));
    await ticketAt(page, TICKET.needsYou);

    await expect(panel(page)).toContainText('You asked for an update today.');
    await expect(panel(page).getByRole('button', { name: 'Ask for an update' })).toHaveCount(0);
    await expect(stream(page).first()).toContainText('You asked Pattadar desk for an update');
  });

  test('an unpaid order is asked to pay, not offered asking for an update', async ({ page, world }) => {
    world.set('ticket', placedHeld({
      quietDays: 9, money: money({ quoted: 1_180, held: 0, funded: false }), ledger: [],
    }));
    await ticketAt(page, TICKET.needsYou);
    await expect(panel(page).getByRole('button', { name: 'Hold ₹1,180' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Ask for an update' })).toHaveCount(0);
  });

  test('delivered work is the panel: the count, then each item to keep or return', async ({ page, world }) => {
    world.set('ticket', view());
    await ticketAt(page, TICKET.needsYou);

    await expect(panel(page)).toHaveClass(/accent/);
    await expect(panel(page)).toContainText('Your provider delivered 2 items. Keep or return each, then accept the work.');
    await expect(panel(page).getByRole('article')).toHaveCount(2);
    await expect(card(page, 'Delivered work')).toHaveCount(0);
  });

  test('work sent back that has gone quiet offers to ask for an update', async ({ page, world }) => {
    world.set('ticket', sentBack({ quietDays: 9, can: ['cancel', 'message', 'nudge'] }));
    await ticketAt(page, TICKET.needsYou);

    await expect(panel(page)).toContainText('No word from your provider · 9 days');
    await expect(panel(page)).toContainText('Ask for an update and Pattadar desk will contact them.');
    await expect(panel(page).getByRole('button', { name: 'Ask for an update' })).toBeVisible();
  });

  test('work sent back that runs late offers to ask, and overdue outranks quiet', async ({ page, world }) => {
    world.set('ticket', sentBack({ overdueDays: 2, quietDays: 9, can: ['cancel', 'message', 'nudge'] }));
    await ticketAt(page, TICKET.needsYou);
    await expect(panel(page)).toContainText('This order is Overdue by 2 days');
    await expect(panel(page).getByRole('button', { name: 'Ask for an update' })).toBeVisible();
  });

  test('work I sent back says when, and that the provider is reworking it', async ({ page }) => {
    await ticketAt(page, TICKET.delivered);
    await expect(say(page)).toHaveText('You sent this back on 11/09/2026. Your provider is reworking it.');
  });

  test('an accepted order says when, and how many items reached the property', async ({ page }) => {
    await ticketAt(page, TICKET.closed);
    await expect(panel(page)).toContainText('You accepted this work on 11/09/2026.');
    await expect(panel(page)).toContainText("1 item was added to this property's Documents.");
  });

  test('a cancelled order says who cancelled it and when, with the server\'s note', async ({ page, world }) => {
    await ticketAt(page, TICKET.cancelled);
    await expect(panel(page)).toContainText('You cancelled this order on 06/09/2026.');
    // The server's outcome note is the reason I gave when I cancelled.
    await expect(panel(page)).toContainText('Found the papers in my own files.');

    world.set('ticket', view({
      status: 'cancelled', statusLabel: 'Cancelled', statusState: 'bad', closed: true, can: [],
      deliverables: [], outcomeNote: '',
      events: [EVENTS[0], ev('w-ev-c', 'status', 'cancel', 'Pattadar desk cancelled this order', '07', 'system', 'Pattadar desk')],
    }));
    await page.reload();
    await expect(say(page)).toHaveText('Pattadar desk cancelled this order on 07/09/2026.');
  });

  test('the panel wears the accent only while the order waits on me, and is never an alert', async ({ page }) => {
    for (const [id, waits] of [
      [TICKET.placed, true], [TICKET.assigned, false], [TICKET.onSite, false], [TICKET.delivered, false],
      [TICKET.needsYou, true], [TICKET.quiet, false], [TICKET.closed, false], [TICKET.cancelled, false],
    ] as const) {
      await ticketAt(page, id);
      await expect(panel(page), id).toHaveCount(1);
      if (waits) await expect(panel(page), id).toHaveClass(/accent/);
      else await expect(panel(page), id).not.toHaveClass(/accent/);
      await expect(page.locator('.card.alert'), id).toHaveCount(0);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════
test.describe('W13 · Details', () => {
  test('one Details card in the rail tells each fact once', async ({ page }) => {
    await ticketAt(page, TICKET.assigned);
    await drawn(page, 'Corner survey');

    await expect(page.locator('aside.order-rail section.card')).toHaveCount(1);
    await expect(details(page).locator('dt')).toHaveText([
      'Provider', 'Ordered', 'Expected by', 'Order no.', 'Why ordered', 'Which survey number', 'How many corners',
      'Price', 'Held',
    ]);
    await expect(details(page).getByRole('heading', { name: 'Payment' })).toBeVisible();
    // The cards they replaced are gone.
    for (const gone of ['Cost', 'Assigned provider', 'Property', 'Sent to provider', 'Conversation', 'Order activity']) {
      await expect(card(page, gone)).toHaveCount(0);
    }
  });

  test('a provider Pattadar knows is named, verified and rated, with a number I can press', async ({ page, world }) => {
    world.set('ticket', view({ assignedTo: associate(), assignedResource: TRUST }));
    await ticketAt(page, TICKET.needsYou);

    const who = detailValue(page, 'Provider');
    await expect(who.getByText('Ravi Kumar', { exact: true })).toBeVisible();
    await expect(who.locator('.tag')).toHaveText('Verified');
    await expect(who.getByLabel('Rated 4.6 out of 5')).toBeVisible();
    await expect(who.getByRole('link', { name: '9848012345' })).toHaveAttribute('href', 'tel:9848012345');
    // Deleted: who assigned them, and how much else they are carrying.
    await expect(details(page)).not.toContainText('Assigned by');
    await expect(page.getByText(/open orders?/)).toHaveCount(0);
    // Not even asked for: workload and credentials are the desk's (spec §7, §13).
    expect(world.calls('ticket').at(-1)!.query).not.toMatch(/jobsOpen|professionalCredentials|trainingCertificates/);
  });

  test('a number written with spaces is still a number a phone will dial', async ({ page, world }) => {
    world.set('ticket', view({ assignedTo: associate({ contact: '+91 98480 12345' }) }));
    await ticketAt(page, TICKET.needsYou);
    await expect(detailValue(page, 'Provider').getByRole('link')).toHaveAttribute('href', 'tel:+919848012345');
  });

  test('a provider reached by email is written to rather than dialled', async ({ page, world }) => {
    world.set('ticket', view({ assignedTo: associate({ contact: 'ravi@example.com' }) }));
    await ticketAt(page, TICKET.needsYou);
    await expect(detailValue(page, 'Provider').getByRole('link', { name: 'ravi@example.com' }))
      .toHaveAttribute('href', 'mailto:ravi@example.com');
  });

  test('a number the provider asked not to share is not on the page in any form', async ({ page }) => {
    await ticketAt(page, TICKET.onSite);
    const who = detailValue(page, 'Provider');
    await expect(who).toContainText('K. Anitha');
    await expect(who).toContainText('They asked that their number not be shared.');
    await expect(page.locator('a[href^="tel:"], a[href^="mailto:"]')).toHaveCount(0);
    expect(await page.content()).not.toContain('9701122334');
  });

  test('a name with no Pattadar provider behind it is not given a number', async ({ page, world }) => {
    world.set('ticket', view({ assignedTo: null }));
    await ticketAt(page, TICKET.needsYou);
    await expect(detailValue(page, 'Provider')).toContainText('Ravi Kumar');
    await expect(detailValue(page, 'Provider')).toContainText('No number on file.');
  });

  test('nobody yet is said in the Provider row, not in a box', async ({ page }) => {
    await ticketAt(page, TICKET.placed);
    await expect(detailValue(page, 'Provider')).toHaveText('Not assigned yet');
  });

  test('a closed order keeps the provider\'s name and drops their number', async ({ page, world }) => {
    world.set('ticket', accepted({ assignedTo: associate() }));
    await ticketAt(page, TICKET.needsYou);
    await expect(detailValue(page, 'Provider')).toContainText('Ravi Kumar');
    await expect(page.locator('a[href^="tel:"]')).toHaveCount(0);
  });

  test('ordered and expected-by are dates, and a late order says by how much', async ({ page, world }) => {
    await ticketAt(page, TICKET.assigned);
    await expect(detailValue(page, 'Ordered')).toHaveText('04/09/2026');
    await expect(detailValue(page, 'Expected by')).toHaveText('25/09/2026');

    world.set('ticket', view({ overdueDays: 2 }));
    await ticketAt(page, TICKET.needsYou);
    await expect(detailValue(page, 'Expected by')).toHaveText('25/09/2026 · Overdue by 2 days');
  });

  test('the order number is in the crumbs and Details, and copyable from Details', async ({ page }) => {
    await ticketAt(page, TICKET.placed);
    await drawn(page, 'Encumbrance certificate');
    await expect(detailValue(page, 'Order no.')).toContainText('PT-2101');
    await expect(details(page).getByRole('button', { name: 'Copy order number' })).toBeVisible();
    expect(await saidTimes(page, 'PT-2101')).toBe(2);
  });

  test('why it was ordered is said in my words, never as a stored key', async ({ page, world }) => {
    world.set('ticket', placedHeld({ detail: 'missing_documents' }));
    await ticketAt(page, TICKET.needsYou);
    await expect(detailValue(page, 'Why ordered')).toHaveText('From your missing documents list');
    await expect(page.getByText('missing_documents')).toHaveCount(0);

    world.set('ticket', placedHeld({ detail: 'Ordered from the properties list' }));
    await page.reload();
    await expect(detailValue(page, 'Why ordered')).toHaveText('From your properties list');

    world.set('ticket', placedHeld({ detail: 'Bank wants it before Diwali' }));
    await page.reload();
    await expect(detailValue(page, 'Why ordered')).toHaveText('Bank wants it before Diwali');
    await expect(page.getByText('Source', { exact: true })).toHaveCount(0);
  });

  test('what I asked for is listed as the answers I gave, and no blank rows when there are none', async ({ page, world }) => {
    await ticketAt(page, TICKET.assigned);
    await expect(detailValue(page, 'Which survey number')).toHaveText('214/2');

    world.set('ticket', view({ answers: [] }));
    await ticketAt(page, TICKET.needsYou);
    await expect(details(page)).not.toContainText('Which survey number');
  });

  test('the files I sent with the order are listed, and open over the page', async ({ page, world }) => {
    world.set('ticket', view({ files: [{ id: 'f1', kind: 'document', title: 'Sale deed 1998', fileRef: NODE }] }));
    await ticketAt(page, TICKET.needsYou);

    const files = detailValue(page, 'Your files');
    await expect(files).toContainText('1 file you attached');
    await files.getByRole('button', { name: 'Open Sale deed 1998' }).click();
    const viewer = page.getByRole('dialog', { name: 'Sale deed 1998' });
    await expect(viewer).toBeVisible();
    await viewer.getByRole('button', { name: 'Close' }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });

  test('payment says the price, what is held and when, and denies a charge once', async ({ page }) => {
    await ticketAt(page, TICKET.assigned);
    await drawn(page, 'Corner survey');

    await expect(detailValue(page, 'Price')).toHaveText('₹6,500');
    await expect(detailValue(page, 'Held')).toHaveText('₹6,500 · 05/09/2026 · Not charged');
    await expect(details(page)).toContainText(MONEY_RULE);
    expect(await saidTimes(page, 'Not charged')).toBe(1);
    await expect(details(page).getByRole('button', { name: /About/ })).toHaveCount(0);
  });

  test('an order with nothing held says so in the Held row', async ({ page }) => {
    await ticketAt(page, TICKET.placed);
    await expect(detailValue(page, 'Held')).toHaveText('Nothing held yet');
    await expect(details(page)).not.toContainText(MONEY_RULE);
  });

  test('an accepted order says what was released, to whom, and the fee', async ({ page }) => {
    await ticketAt(page, TICKET.closed);
    await expect(detailValue(page, 'Held')).toContainText('₹6,500 · 05/09/2026');
    await expect(detailValue(page, 'Released')).toHaveText('₹5,850 to Ravi Kumar · 11/09/2026');
    await expect(detailValue(page, 'Pattadar fee')).toHaveText('₹650');
    await expect(details(page)).not.toContainText(MONEY_RULE);
  });

  test('a cancelled order says what was refunded, and where to', async ({ page }) => {
    await ticketAt(page, TICKET.cancelled);
    await expect(detailValue(page, 'Refunded')).toHaveText('₹6,500 to your wallet · 06/09/2026');
    await expect(page.getByRole('button', { name: /^Hold ₹/ })).toHaveCount(0);
  });

  test('a live payment still with the payment company says so on a closed order', async ({ page, world }) => {
    world.set('ticket', accepted({ money: money({ held: 6_500, provider: 'razorpay', live: true }) }));
    await ticketAt(page, TICKET.needsYou);
    await expect(details(page).getByRole('status')).toHaveText('Waiting for the payment company to confirm.');
  });

  test('every other order on the land is one link away, at the foot of Details', async ({ page }) => {
    await ticketAt(page, TICKET.placed);
    await expect(details(page).getByRole('link', { name: 'All orders for this property' }))
      .toHaveAttribute('href', `/properties/${ID.parcel}/services`);
    await expect(page.getByRole('link', { name: 'All orders for this property' })).toHaveCount(1);
  });
});

// ═══════════════════════════════════════════════════════════════════════
test.describe('W13 · delivered work', () => {
  test('each item says what it is, when it came, how big it is and where it would go', async ({ page, world }) => {
    world.set('ticket', view());
    await ticketAt(page, TICKET.needsYou);

    const outline = page.getByRole('article', { name: '8 corners, walked' });
    await expect(outline).toContainText('A corrected outline · delivered 10/09/2026');
    await expect(outline).toContainText('Goes to: The outline on file');
    await expect(outline).toContainText('GPS, ±3 m');

    const report = page.getByRole('article', { name: 'Surveyor report' });
    await expect(report).toContainText('A document · delivered 10/09/2026 · 0.2 MB');
    await expect(report).toContainText('Goes to: Documents › Map');
  });

  test('an item with more than one home lets me choose which', async ({ page, world }) => {
    world.set('ticket', view());
    await ticketAt(page, TICKET.needsYou);
    const fileAs = page.getByRole('article', { name: 'Surveyor report' }).getByLabel('File it as');
    await expect(fileAs).toHaveValue('map');
    await expect(fileAs.getByRole('option')).toHaveCount(2);
  });

  test('keeping an item files it as the home I chose, and nothing else', async ({ page, world }) => {
    world.set('ticket', view());
    await ticketAt(page, TICKET.needsYou);

    const report = page.getByRole('article', { name: 'Surveyor report' });
    await report.getByLabel('File it as').selectOption('title');
    await report.getByRole('button', { name: 'Keep it' }).click();

    await expect.poll(() => world.calls('reviewDeliverable')).toHaveLength(1);
    expect(world.lastVars('reviewDeliverable')).toMatchObject({
      deliverableId: 'w-dlv-2', review: 'accepted', fileAs: 'title', note: '',
    });
  });

  test('returning an item asks for words first, and says the provider sees exactly them', async ({ page, world }) => {
    world.set('ticket', view());
    await ticketAt(page, TICKET.needsYou);

    const report = page.getByRole('article', { name: 'Surveyor report' });
    await report.getByRole('button', { name: 'Return this one' }).click();
    await expect(report.getByLabel('What is wrong with it'))
      .toHaveAttribute('placeholder', 'Say what is wrong. Your provider sees exactly this.');
    await expect(report.getByRole('button', { name: 'Send back' })).toBeDisabled();
    expect(world.calls('reviewDeliverable')).toHaveLength(0);
  });

  test('returning records the reason against that one item', async ({ page, world }) => {
    world.set('ticket', view());
    await ticketAt(page, TICKET.needsYou);

    const report = page.getByRole('article', { name: 'Surveyor report' });
    await report.getByRole('button', { name: 'Return this one' }).click();
    await report.getByLabel('What is wrong with it').fill('Page 2 is of the wrong field.');
    await report.getByRole('button', { name: 'Send back' }).click();

    await expect.poll(() => world.calls('reviewDeliverable')).toHaveLength(1);
    expect(world.lastVars('reviewDeliverable')).toMatchObject({
      deliverableId: 'w-dlv-2', review: 'rejected', note: 'Page 2 is of the wrong field.',
    });
  });

  test('backing out of returning leaves the item where it was', async ({ page, world }) => {
    world.set('ticket', view());
    await ticketAt(page, TICKET.needsYou);

    const report = page.getByRole('article', { name: 'Surveyor report' });
    await report.getByRole('button', { name: 'Return this one' }).click();
    await report.getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(report.getByRole('button', { name: 'Keep it' })).toBeVisible();
    expect(world.calls('reviewDeliverable')).toHaveLength(0);
  });

  test('an item already kept says so and can be put back while the order is open', async ({ page, world }) => {
    world.set('ticket', view({ deliverables: [deliverable(0, { review: 'accepted' }), deliverable(1)] }));
    await ticketAt(page, TICKET.needsYou);

    const outline = page.getByRole('article', { name: '8 corners, walked' });
    await expect(outline).toContainText('Keeping it');
    await outline.getByRole('button', { name: 'Change my mind' }).click();
    await expect.poll(() => world.calls('reviewDeliverable')).toHaveLength(1);
    expect(world.lastVars('reviewDeliverable')).toMatchObject({ deliverableId: 'w-dlv-1', review: 'pending' });
  });

  test('an item already returned carries the words I returned it with', async ({ page, world }) => {
    world.set('ticket', view({
      deliverables: [deliverable(0, { review: 'rejected', reviewNote: 'The eastern corner is in the road.' })],
    }));
    await ticketAt(page, TICKET.needsYou);

    const outline = page.getByRole('article', { name: '8 corners, walked' });
    await expect(outline).toContainText('Returning it');
    await expect(outline).toContainText('The eastern corner is in the road.');
    await expect(outline.getByRole('button', { name: 'Change my mind' })).toBeVisible();
  });

  test('a refused review is said once, inside the panel that holds the item', async ({ page, world }) => {
    world.set('reviewDeliverable', false);
    world.set('ticket', view());
    await ticketAt(page, TICKET.needsYou);
    await page.getByRole('article', { name: 'Surveyor report' }).getByRole('button', { name: 'Keep it' }).click();

    await expect(page.getByText(MOVE_FAILED)).toHaveCount(1);
    await expect(panel(page).getByText(MOVE_FAILED)).toBeVisible();
  });

  test('a review that falls over on the way says the same thing', async ({ page, world }) => {
    world.set('reviewDeliverable', World.gqlError('the review store is down'));
    world.set('ticket', view());
    await ticketAt(page, TICKET.needsYou);
    await page.getByRole('article', { name: 'Surveyor report' }).getByRole('button', { name: 'Keep it' }).click();
    await expect(panel(page).getByText(MOVE_FAILED)).toBeVisible();
  });

  test('a delivered file opens over the page, never in a new tab', async ({ page, world }) => {
    world.set('ticket', view());
    await ticketAt(page, TICKET.needsYou);
    await page.getByRole('article', { name: 'Surveyor report' })
      .getByRole('button', { name: 'Open survey-report.pdf' }).click();

    await expect(page.getByRole('dialog', { name: 'survey-report.pdf' })).toBeVisible();
    expect(page.context().pages()).toHaveLength(1);
  });

  test('a delivered file downloads under its own name', async ({ page, world }) => {
    world.set('ticket', view());
    await ticketAt(page, TICKET.needsYou);
    const saving = page.waitForEvent('download');
    await page.getByRole('article', { name: 'Surveyor report' })
      .getByRole('button', { name: 'Download survey-report.pdf' }).click();
    expect((await saving).suggestedFilename()).toBe('survey-report.pdf');
  });

  test('nothing is drawn for delivered work before anything comes back', async ({ page }) => {
    await ticketAt(page, TICKET.assigned);
    await drawn(page, 'Corner survey');
    await expect(card(page, 'Delivered work')).toHaveCount(0);
    await expect(page.getByText('Nothing has come back yet.')).toHaveCount(0);
    await expect(page.getByRole('article')).toHaveCount(0);
  });

  test('accepted work is read-only below the panel, each item linked to where it was filed', async ({ page }) => {
    await ticketAt(page, TICKET.closed);

    const came = card(page, 'Delivered work');
    await expect(came.locator('.num.muted')).toHaveText('2');
    const report = came.getByRole('article', { name: 'Surveyor report' });
    await expect(report).toContainText("Added to this property's Documents · 11/09/2026");
    await expect(report.getByRole('link', { name: 'Open it' })).toHaveAttribute('href', '/papers/w-paper-map');
    await expect(came.getByRole('article', { name: '8 corners, walked' }).getByRole('link', { name: 'Open it' }))
      .toHaveAttribute('href', `/properties/${ID.parcel}/location`);
    await expect(page.getByRole('button', { name: 'Change my mind' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Keep it' })).toHaveCount(0);
  });

  test('work I sent back stays readable, with what I said about it', async ({ page }) => {
    await ticketAt(page, TICKET.delivered);
    const outline = card(page, 'Delivered work').getByRole('article', { name: '8 corners, walked' });
    await expect(outline).toContainText('Returned · Corner 6 is in the neighbour’s field');
    await expect(page.getByRole('button', { name: 'Accept work' })).toHaveCount(0);
  });

  test('work on a cancelled order is listed as not filed, and offers nothing', async ({ page, world }) => {
    world.set('ticket', view({
      status: 'cancelled', statusLabel: 'Cancelled', statusState: 'bad', closed: true, can: [],
      events: [...EVENTS, ev('w-ev-c', 'status', 'cancel', 'You cancelled this order', '11')],
    }));
    await ticketAt(page, TICKET.needsYou);
    await expect(card(page, 'Delivered work').getByRole('article', { name: 'Surveyor report' })).toContainText('Not filed');
    await expect(page.getByRole('button', { name: 'Change my mind' })).toHaveCount(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════
test.describe('W13 · delivered work, downloads that fail', () => {
  test.use({ allowConsole: true });

  test('a download the store refuses says so beside the buttons', async ({ page, world }) => {
    world.set('ticket', view());
    world.route(/\/api\/gateway\/storage\/files\/[^/]+\/content/, () => ({ status: 404, json: { detail: 'gone' } }));
    await ticketAt(page, TICKET.needsYou);
    const report = page.getByRole('article', { name: 'Surveyor report' });
    await report.getByRole('button', { name: 'Download survey-report.pdf' }).click();
    await expect(report.getByText('That file could not be downloaded. Try again.')).toBeVisible();
  });
});

// ═══════════════════════════════════════════════════════════════════════
test.describe('W13 · accepting the work', () => {
  test('Accept work waits until every item is decided, and the panel says how many are left', async ({ page, world }) => {
    world.set('ticket', view());
    await ticketAt(page, TICKET.needsYou);

    await expect(panel(page).getByRole('button', { name: 'Accept work' })).toBeDisabled();
    await expect(panel(page).getByRole('button', { name: 'Accept work' })).toHaveClass(/primary/);
    await expect(panel(page).getByText('Decide on every item first. 2 items still waiting.')).toBeVisible();
  });

  test('the footer counts what is kept against what came, and what is released to whom', async ({ page, world }) => {
    world.set('ticket', view({ deliverables: [deliverable(0, { review: 'accepted' }), deliverable(1, { review: 'rejected' })] }));
    await ticketAt(page, TICKET.needsYou);

    // The same split, in the same words, as the dialog it opens.
    await expect(panel(page).getByText(
      'Keeping 1 of 2 · when you accept, ₹5,850 is released to Ravi Kumar and ₹650 is the Pattadar fee')).toBeVisible();
    await expect(panel(page).getByRole('button', { name: 'Accept work' })).toBeEnabled();
  });

  test('the dialog states where each kept item goes before anything is filed', async ({ page, world }) => {
    world.set('ticket', view({ deliverables: [deliverable(0, { review: 'accepted' }), deliverable(1, { review: 'accepted' })] }));
    await ticketAt(page, TICKET.needsYou);
    await panel(page).getByRole('button', { name: 'Accept work' }).click();

    const dialog = page.getByRole('dialog', { name: 'Accept this work?' });
    await expect(dialog).toContainText(
      '2 items go onto Sy 214/2: “8 corners, walked” → The outline on file; “Surveyor report” → Documents › Map.');
    await expect(dialog).toContainText('The outline on file is replaced.');
  });

  test('the dialog says what is released and what is the Pattadar fee', async ({ page, world }) => {
    world.set('ticket', view({ deliverables: [deliverable(0, { review: 'accepted' }), deliverable(1, { review: 'rejected' })] }));
    await ticketAt(page, TICKET.needsYou);
    await panel(page).getByRole('button', { name: 'Accept work' }).click();

    const dialog = page.getByRole('dialog', { name: 'Accept this work?' });
    await expect(dialog).toContainText('₹5,850 is released to Ravi Kumar and ₹650 is the Pattadar fee.');
    // "Not charged" is told once, in Details; the dialog never says settle outside Pattadar.
    await expect(dialog).not.toContainText(/charged|settle/);
  });

  test('with everything returned, Accept work is off and says why, and Request changes is the way on', async ({ page, world }) => {
    world.set('ticket', view({ deliverables: [deliverable(0, { review: 'rejected' }), deliverable(1, { review: 'rejected' })] }));
    // The seal refuses this acceptance exactly as web360.py accept_ticket does.
    expect(await world.current('acceptTicket', { ticketId: TICKET.needsYou })).toBe(0);
    await ticketAt(page, TICKET.needsYou);

    const accept = panel(page).getByRole('button', { name: 'Accept work' });
    await expect(accept).toBeDisabled();
    await expect(accept).not.toHaveClass(/primary/);
    await expect(panel(page).getByRole('button', { name: 'Request changes' })).toHaveClass(/primary/);
    await expect(panel(page).getByText('You returned everything. Request changes, or cancel the order.')).toBeVisible();
    await expect(panel(page)).toContainText('Keeping 0 of 2');
    await expect(panel(page)).not.toContainText('released');
    expect(world.calls('acceptTicket')).toHaveLength(0);
  });

  test('confirming is what calls acceptTicket, and nothing before it does', async ({ page, world }) => {
    world.set('ticket', view({ deliverables: [deliverable(0, { review: 'accepted' }), deliverable(1, { review: 'accepted' })] }));
    await ticketAt(page, TICKET.needsYou);
    await panel(page).getByRole('button', { name: 'Accept work' }).click();
    expect(world.calls('acceptTicket')).toHaveLength(0);

    await page.getByRole('dialog', { name: 'Accept this work?' }).getByRole('button', { name: 'Accept work' }).click();
    await expect.poll(() => world.calls('acceptTicket')).toHaveLength(1);
    expect(world.lastVars('acceptTicket')).toMatchObject({ ticketId: TICKET.needsYou, note: '' });
    await expect(page.getByRole('dialog')).toHaveCount(0);
    // The opener is gone with the review; focus lands on what happened next.
    await expect(panel(page)).toBeFocused();
  });

  test('a refused acceptance says decide on every item first, inside the dialog', async ({ page, world }) => {
    world.set('acceptTicket', 0);
    world.set('ticket', view({ deliverables: [deliverable(0, { review: 'accepted' }), deliverable(1, { review: 'accepted' })] }));
    await ticketAt(page, TICKET.needsYou);
    await panel(page).getByRole('button', { name: 'Accept work' }).click();
    await page.getByRole('dialog', { name: 'Accept this work?' }).getByRole('button', { name: 'Accept work' }).click();

    await expect(page.getByRole('dialog', { name: 'Accept this work?' }).getByText(ACCEPT_FAILED)).toBeVisible();
  });

  test('an acceptance that falls over says the same thing and keeps the dialog open', async ({ page, world }) => {
    world.set('acceptTicket', World.gqlError('the ledger is locked'));
    world.set('ticket', view({ deliverables: [deliverable(0, { review: 'accepted' }), deliverable(1, { review: 'accepted' })] }));
    await ticketAt(page, TICKET.needsYou);
    await panel(page).getByRole('button', { name: 'Accept work' }).click();
    await page.getByRole('dialog', { name: 'Accept this work?' }).getByRole('button', { name: 'Accept work' }).click();

    await expect(page.getByRole('dialog', { name: 'Accept this work?' }).getByText(ACCEPT_FAILED)).toBeVisible();
    await expect(page.getByText(ACCEPT_FAILED)).toHaveCount(1);
  });

  test('the dialog opens on the safe button, Cancel files nothing, and Tab stays inside', async ({ page, world }) => {
    world.set('ticket', view({ deliverables: [deliverable(0, { review: 'accepted' }), deliverable(1, { review: 'accepted' })] }));
    await ticketAt(page, TICKET.needsYou);
    await panel(page).getByRole('button', { name: 'Accept work' }).click();

    const dialog = page.getByRole('dialog', { name: 'Accept this work?' });
    await expect(dialog.getByRole('button', { name: 'Cancel' })).toBeFocused();
    for (let i = 0; i < 4; i += 1) {
      await page.keyboard.press('Tab');
      await expect(dialog.locator(':focus')).toHaveCount(1);
    }
    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    expect(world.calls('acceptTicket')).toHaveLength(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════
test.describe('W13 · requesting changes', () => {
  test('requesting changes asks what is missing, and the button waits for words', async ({ page, world }) => {
    world.set('ticket', view());
    await ticketAt(page, TICKET.needsYou);
    await panel(page).getByRole('button', { name: 'Request changes' }).click();

    await expect(page.getByLabel('What is missing')).toHaveAttribute('placeholder', 'Your provider sees exactly this.');
    await expect(panel(page).getByRole('button', { name: 'Request changes' })).toBeDisabled();
    await expect(page.getByText('Say what is missing first.')).toBeVisible();
    // The accept footer steps aside while the form is open.
    await expect(page.getByRole('button', { name: 'Accept work' })).toHaveCount(0);
  });

  test('requesting changes carries exactly the words I typed, and touches no item', async ({ page, world }) => {
    world.set('ticket', view());
    await ticketAt(page, TICKET.needsYou);
    await panel(page).getByRole('button', { name: 'Request changes' }).click();
    await page.getByLabel('What is missing').fill('The eastern corner is in the road.');
    await panel(page).getByRole('button', { name: 'Request changes' }).click();

    await expect.poll(() => world.calls('sendBackTicket')).toHaveLength(1);
    expect(world.lastVars('sendBackTicket')).toMatchObject({
      ticketId: TICKET.needsYou, reason: 'The eastern corner is in the road.',
    });
    expect(world.calls('reviewDeliverable')).toHaveLength(0);
    await expect(page.getByLabel('What is missing')).toHaveCount(0);
    await expect(panel(page)).toBeFocused();
  });

  test('a refused request for changes says nothing has changed, and keeps my words', async ({ page, world }) => {
    world.set('sendBackTicket', false);
    world.set('ticket', view());
    await ticketAt(page, TICKET.needsYou);
    await panel(page).getByRole('button', { name: 'Request changes' }).click();
    await page.getByLabel('What is missing').fill('Two of the corners are wrong.');
    await panel(page).getByRole('button', { name: 'Request changes' }).click();

    await expect(panel(page).getByText(MOVE_FAILED)).toBeVisible();
    await expect(page.getByLabel('What is missing')).toHaveValue('Two of the corners are wrong.');
  });

  test('backing out of the form brings Accept work back', async ({ page, world }) => {
    world.set('ticket', view());
    await ticketAt(page, TICKET.needsYou);
    await panel(page).getByRole('button', { name: 'Request changes' }).click();
    await panel(page).getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(panel(page).getByRole('button', { name: 'Accept work' })).toBeVisible();
    expect(world.calls('sendBackTicket')).toHaveLength(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════
test.describe('W13 · cancelling the order', () => {
  test('cancelling says who is told and that there is no undo', async ({ page }) => {
    await ticketAt(page, TICKET.assigned);
    const dialog = await openCancel(page);
    await expect(dialog).toContainText('Ravi Kumar is told it is off. There is no undo.');
  });

  test('an order with the provider on site offers to release some of it, and does the arithmetic', async ({ page, world }) => {
    world.set('ticket', onSite());
    await ticketAt(page, TICKET.needsYou);
    const dialog = await openCancel(page);

    await expect(dialog).toContainText(
      '₹0 released — ₹0 to Ravi Kumar, ₹0 to Pattadar. The rest, ₹6,500, is refunded to your wallet.');
    await dialog.getByLabel('Release part of the ₹6,500 held').fill('1000');
    await expect(dialog).toContainText(
      '₹1,000 released — ₹900 to Ravi Kumar, ₹100 to Pattadar. The rest, ₹5,500, is refunded to your wallet.');
    await expect(dialog).toContainText('Nothing is charged.');
  });

  test('a figure above what is held is clamped before it is sent, and below nothing is nothing', async ({ page, world }) => {
    world.set('ticket', onSite());
    await ticketAt(page, TICKET.needsYou);
    const dialog = await openCancel(page);

    await dialog.getByLabel('Release part of the ₹6,500 held').fill('-500');
    await expect(dialog).toContainText('₹0 released');
    await dialog.getByLabel('Release part of the ₹6,500 held').fill('99999');
    await expect(dialog).toContainText('₹6,500 released');
    await dialog.getByRole('button', { name: 'Cancel order' }).click();
    await expect.poll(() => world.calls('cancelTicket')).toHaveLength(1);
    expect(world.lastVars('cancelTicket')).toMatchObject({ payAnyway: 6_500 });
  });

  test('an order nobody has taken, with money held, releases nothing and tells nobody', async ({ page, world }) => {
    world.set('ticket', placedHeld());
    await ticketAt(page, TICKET.needsYou);
    const dialog = await openCancel(page);

    await expect(dialog.getByLabel(/Release part of/)).toHaveCount(0);
    await expect(dialog).not.toContainText('is told it is off');
    await expect(dialog).toContainText('There is no undo.');
    await expect(dialog).toContainText('The ₹1,180 held is refunded to your wallet.');
    await dialog.getByRole('button', { name: 'Cancel order' }).click();
    await expect.poll(() => world.calls('cancelTicket')).toHaveLength(1);
    expect(world.lastVars('cancelTicket')).toMatchObject({ payAnyway: 0 });
    await expect(panel(page)).toBeFocused();
  });

  test('work waiting on my review, or a provider known only by a typed name, offers no release either', async ({ page, world }) => {
    for (const t of [view(), onSite({ assignedTo: null })]) {
      world.set('ticket', t);
      await ticketAt(page, TICKET.needsYou);
      const dialog = await openCancel(page);
      await expect(dialog.getByLabel('Why')).toBeVisible();
      await expect(dialog.getByLabel(/Release part of/)).toHaveCount(0);
      await expect(dialog).toContainText('The ₹6,500 held is refunded to your wallet.');
    }
  });

  test('an order with nothing held is not asked how much to release', async ({ page }) => {
    await ticketAt(page, TICKET.placed);
    const dialog = await openCancel(page);
    await expect(dialog.getByLabel('Why')).toBeVisible();
    await expect(dialog.getByLabel(/Release part of/)).toHaveCount(0);
  });

  test('cancelling carries the reason and the figure, and closes the dialog', async ({ page, world }) => {
    world.set('ticket', onSite());
    await ticketAt(page, TICKET.needsYou);
    const dialog = await openCancel(page);
    await dialog.getByLabel('Why').fill('He never went.');
    await dialog.getByLabel('Release part of the ₹6,500 held').fill('1500');
    await dialog.getByRole('button', { name: 'Cancel order' }).click();

    await expect.poll(() => world.calls('cancelTicket')).toHaveLength(1);
    expect(world.lastVars('cancelTicket')).toMatchObject({
      ticketId: TICKET.needsYou, reason: 'He never went.', payAnyway: 1_500,
    });
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });

  test('a refused cancellation says nothing has changed, inside the dialog', async ({ page, world }) => {
    world.set('cancelTicket', false);
    await ticketAt(page, TICKET.assigned);
    const dialog = await openCancel(page);
    await dialog.getByRole('button', { name: 'Cancel order' }).click();
    await expect(dialog.getByText(MOVE_FAILED)).toBeVisible();
  });

  test('a cancellation that falls over says the same thing and keeps the reason', async ({ page, world }) => {
    world.set('cancelTicket', World.gqlError('the order is locked'));
    await ticketAt(page, TICKET.assigned);
    const dialog = await openCancel(page);
    await dialog.getByLabel('Why').fill('He never went.');
    await dialog.getByRole('button', { name: 'Cancel order' }).click();
    await expect(dialog.getByText(MOVE_FAILED)).toBeVisible();
    await expect(dialog.getByLabel('Why')).toHaveValue('He never went.');
  });

  test('a pointer on the dim does not throw away the reason, and Keep order pulls nothing', async ({ page, world }) => {
    await ticketAt(page, TICKET.assigned);
    const dialog = await openCancel(page);
    await dialog.getByLabel('Why').fill('He never went.');
    await page.locator('.scrim').click({ position: { x: 4, y: 4 } });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByLabel('Why')).toHaveValue('He never went.');

    await dialog.getByRole('button', { name: 'Keep order', exact: true }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    expect(world.calls('cancelTicket')).toHaveLength(0);
  });

  test('Escape closes the dialog and gives Cancel order its focus back', async ({ page }) => {
    await ticketAt(page, TICKET.assigned);
    const dialog = await openCancel(page);
    await expect(dialog.getByRole('button', { name: 'Keep order', exact: true })).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(head(page).getByRole('button', { name: 'Cancel order' })).toBeFocused();
  });

  test('a closed order is not offered cancelling', async ({ page }) => {
    for (const id of [TICKET.closed, TICKET.cancelled]) {
      await ticketAt(page, id);
      await drawn(page, 'Corner survey');
      await expect(page.getByRole('button', { name: 'Cancel order' })).toHaveCount(0);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════
test.describe('W13 · Activity', () => {
  test('one Activity card: the composer first, then the trail newest first', async ({ page, world }) => {
    world.set('ticket', view());
    await ticketAt(page, TICKET.needsYou);

    await expect(activity(page)).toHaveCount(1);
    const box = await composer(page).boundingBox();
    const first = await stream(page).first().boundingBox();
    expect(box!.y).toBeLessThan(first!.y);
    await expect(stream(page)).toHaveCount(5);
    await expect(stream(page).first()).toContainText('Ravi Kumar delivered the work');
    await expect(stream(page).last()).toContainText('You placed this order');
  });

  test('who said it is a word, never an id, and my own bubble sits where everyone\'s does', async ({ page, world }) => {
    world.set('ticket', view({
      events: [
        ev('m1', 'message', 'message', 'You sent a message', '07', 'owner', 'You', 'Where are you on this?'),
        ev('m2', 'message', 'message', 'Ravi Kumar wrote', '08', 'worker', 'Ravi Kumar', 'Two of eight done.'),
        ev('m3', 'message', 'message', 'Pattadar desk wrote', '09', 'system', 'Pattadar desk', 'We called him.'),
      ],
    }));
    await ticketAt(page, TICKET.needsYou);

    const rows = stream(page);
    await expect(rows.nth(0).locator('.stream-who')).toContainText('Pattadar desk ·');
    await expect(rows.nth(1).locator('.stream-who')).toContainText('Ravi Kumar · Provider ·');
    await expect(rows.nth(2).locator('.stream-who')).toContainText('You ·');
    const mine = await rows.nth(2).locator('.chat-bubble').boundingBox();
    const theirs = await rows.nth(1).locator('.chat-bubble').boundingBox();
    expect(Math.abs(mine!.x - theirs!.x)).toBeLessThanOrEqual(1);
    await expect(rows.nth(2)).toHaveClass(/owner/);
  });

  test('a status line prints its headline only — a stored batch ref or record id never reaches me', async ({ page, world }) => {
    world.set('ticket', view({
      events: [ev('w-ev-old', 'status', 'place', 'Placed', '04', 'owner', 'You', 'BR-5388 · ordered from rec-6881f2b14af4')],
    }));
    await ticketAt(page, TICKET.needsYou);
    await expect(stream(page)).toHaveCount(1);
    expect(await page.locator('main').innerText()).not.toMatch(/BR-|rec-/);
  });

  test('payment and dispatch lines are not in my stream even if they arrive', async ({ page, world }) => {
    world.set('ticket', view({
      events: [...EVENTS, ev('p', 'payment', '', '₹6,500 held', '05'), ev('d', 'dispatch', '', 'Sent to Ravi on SMS', '05')],
    }));
    await ticketAt(page, TICKET.needsYou);
    await expect(stream(page)).toHaveCount(5);
    await expect(activity(page)).not.toContainText('Sent to Ravi');
  });

  test('times are spelled out, with the whole date and time under the pointer', async ({ page, world }) => {
    await page.clock.setFixedTime(new Date('2026-09-10T08:00:00Z'));
    world.set('ticket', view());
    await ticketAt(page, TICKET.needsYou);

    const latest = stream(page).first().locator('time');
    await expect(latest).toHaveText('3 hours ago');
    await expect(latest).toHaveAttribute('datetime', '2026-09-10T05:00:00Z');
    await expect(latest).toHaveAttribute('title', '10/09/2026, 10:30');
    await expect(stream(page).last().locator('time')).toHaveText('6 days ago');
  });

  test('the composer says who reads it, by state', async ({ page, world }) => {
    await ticketAt(page, TICKET.placed);
    await expect(composer(page)).toHaveAttribute('placeholder', 'Write to Pattadar desk');
    await ticketAt(page, TICKET.assigned);
    await expect(composer(page)).toHaveAttribute('placeholder', 'Write to your provider and Pattadar desk');
    await ticketAt(page, TICKET.closed);
    await expect(composer(page)).toHaveAttribute('placeholder', 'Write to Pattadar desk about this order');
    world.set('ticket', view());
    await expect(page.getByText('Visible on this order')).toHaveCount(0);
  });

  test('Send waits for words', async ({ page }) => {
    await ticketAt(page, TICKET.assigned);
    const send = activity(page).getByRole('button', { name: 'Send' });
    await expect(send).toBeDisabled();
    await composer(page).fill('   ');
    await expect(send).toBeDisabled();
    await composer(page).fill('Where are you on this?');
    await expect(send).toBeEnabled();
  });

  test('sending a message carries exactly my words and clears the box', async ({ page, world }) => {
    await ticketAt(page, TICKET.assigned);
    await composer(page).fill('  Where are you on this?  ');
    await activity(page).getByRole('button', { name: 'Send' }).click();

    await expect.poll(() => world.calls('postTicketMessage')).toHaveLength(1);
    expect(world.lastVars('postTicketMessage')).toEqual({ ticketId: TICKET.assigned, message: 'Where are you on this?' });
    await expect(composer(page)).toHaveValue('');
  });

  test('a refused message says so and keeps my words', async ({ page, world }) => {
    world.set('postTicketMessage', false);
    await ticketAt(page, TICKET.assigned);
    await composer(page).fill('Where are you on this?');
    await activity(page).getByRole('button', { name: 'Send' }).click();

    await expect(activity(page).getByText(MESSAGE_REFUSED)).toBeVisible();
    await expect(composer(page)).toHaveValue('Where are you on this?');
  });

  test('a message that falls over says nothing was sent', async ({ page, world }) => {
    world.set('postTicketMessage', World.gqlError('the thread is down'));
    await ticketAt(page, TICKET.assigned);
    await composer(page).fill('Where are you on this?');
    await activity(page).getByRole('button', { name: 'Send' }).click();
    await expect(activity(page).getByText(MESSAGE_FAILED)).toBeVisible();
    await expect(composer(page)).toHaveValue('Where are you on this?');
  });

  test('there is no Attach: a file I sent could be opened by nobody but me', async ({ page }) => {
    await ticketAt(page, TICKET.assigned);
    await expect(composer(page)).toBeVisible();
    await expect(activity(page).getByRole('button', { name: 'Attach a file' })).toHaveCount(0);
    await expect(page.locator('main input[type="file"]')).toHaveCount(0);
  });

  test('a message\'s files are chips with a way to open them', async ({ page, world }) => {
    world.set('ticket', view({
      events: [ev('m1', 'message', 'message', 'You sent a message', '07', 'owner', 'You', 'Here it is.', {
        attachments: [{ fileRef: NODE, fileName: 'boundary.jpg', mimeType: 'image/jpeg', sizeBytes: 204_800 }],
      })],
    }));
    await ticketAt(page, TICKET.needsYou);
    const chip = stream(page).first().locator('.filechip');
    await expect(chip).toContainText('boundary.jpg · 0.2 MB');
    await chip.getByRole('button', { name: 'Open boundary.jpg' }).click();
    await expect(page.getByRole('dialog', { name: 'boundary.jpg' })).toBeVisible();
  });

  test('a cancelled order has no composer, and its trail is still there', async ({ page }) => {
    await ticketAt(page, TICKET.cancelled);
    await expect(stream(page).first()).toContainText('You cancelled this order');
    await expect(composer(page)).toHaveCount(0);
  });

  test('a long conversation shows the latest ten under the composer, and the rest on asking', async ({ page, world }) => {
    world.set('ticket', view({
      events: Array.from({ length: 12 }, (_, i) => ev(`m${i}`, 'message', 'message', 'You sent a message',
        String(11 + i).padStart(2, '0'), i % 2 ? 'worker' : 'owner', i % 2 ? 'Ravi Kumar' : 'You', `Message ${i + 1}`)),
    }));
    await ticketAt(page, TICKET.needsYou);

    await expect(stream(page)).toHaveCount(10);
    await expect(stream(page).first()).toContainText('Message 12');
    const box = await composer(page).boundingBox();
    expect(box!.y).toBeLessThan((await stream(page).first().boundingBox())!.y);
    await activity(page).getByRole('button', { name: 'Show 2 earlier' }).click();
    await expect(stream(page)).toHaveCount(12);
    await expect(stream(page).last()).toContainText('Message 1');
    // The button left with the click; the first row it brought in has focus.
    await expect(stream(page).nth(10)).toBeFocused();
    await expect(stream(page).nth(10)).toContainText('Message 2');
  });

  test('an order with no trail at all says so in one line', async ({ page, world }) => {
    world.set('ticket', view({ events: [] }));
    await ticketAt(page, TICKET.needsYou);
    await expect(activity(page)).toContainText('Nothing has happened on this order yet.');
  });

  test('Something wrong? Report a problem points the composer at the desk', async ({ page }) => {
    await ticketAt(page, TICKET.closed);
    await panel(page).getByRole('button', { name: 'Report a problem' }).click();
    await expect(composer(page)).toBeFocused();
    await expect(composer(page)).toHaveAttribute('placeholder', 'Tell Pattadar desk what is wrong with this work');
  });
});

// ═══════════════════════════════════════════════════════════════════════
test.describe('W13 · rating the provider', () => {
  test('an accepted order with a Pattadar provider asks for a rating out of 5', async ({ page, world }) => {
    world.set('ticket', accepted({ can: ['message', 'rate'], assignedTo: associate() }));
    await ticketAt(page, TICKET.needsYou);

    const rate = panel(page).getByRole('group', { name: 'Rate Ravi Kumar' });
    await expect(rate.getByRole('button')).toHaveText(['1', '2', '3', '4', '5']);
    await expect(panel(page).getByLabel('What should Pattadar know?')).toBeVisible();
    await expect(panel(page).getByRole('button', { name: 'Save rating' })).toBeDisabled();
  });

  test('saving a rating carries the number and the note', async ({ page, world }) => {
    world.set('ticket', accepted({ can: ['message', 'rate'], assignedTo: associate() }));
    await ticketAt(page, TICKET.needsYou);
    await panel(page).getByRole('group', { name: 'Rate Ravi Kumar' }).getByRole('button', { name: '4' }).click();
    await panel(page).getByLabel('What should Pattadar know?').fill('On time, clear report.');
    await panel(page).getByRole('button', { name: 'Save rating' }).click();

    await expect.poll(() => world.calls('rateAssociate')).toHaveLength(1);
    expect(world.lastVars('rateAssociate')).toEqual({ ticketId: TICKET.needsYou, rating: 4, note: 'On time, clear report.' });
  });

  test('a rating that is refused or falls over says it was not saved', async ({ page, world }) => {
    world.set('ticket', accepted({ can: ['message', 'rate'], assignedTo: associate() }));
    world.set('rateAssociate', false);
    await ticketAt(page, TICKET.needsYou);
    await panel(page).getByRole('group', { name: 'Rate Ravi Kumar' }).getByRole('button', { name: '5' }).click();
    await panel(page).getByRole('button', { name: 'Save rating' }).click();
    await expect(panel(page).getByText(RATING_FAILED)).toBeVisible();

    world.set('rateAssociate', World.gqlError('ratings are down'));
    await panel(page).getByRole('button', { name: 'Save rating' }).click();
    await expect(panel(page).getByText(RATING_FAILED)).toBeVisible();
  });

  test('a rating I already gave is shown and can be updated', async ({ page, world }) => {
    world.set('ticket', accepted({ can: ['message', 'rate'], assignedTo: associate(), myRating: 3, myRatingNote: 'Late.' }));
    await ticketAt(page, TICKET.needsYou);
    await expect(panel(page).getByRole('button', { name: '3' })).toHaveAttribute('aria-pressed', 'true');
    await expect(panel(page).getByLabel('What should Pattadar know?')).toHaveValue('Late.');
    await expect(panel(page).getByRole('button', { name: 'Update rating' })).toBeEnabled();
  });

  test('no rating is asked for when the server does not offer it', async ({ page }) => {
    await ticketAt(page, TICKET.closed);
    await drawn(page, 'Corner survey');
    await expect(page.getByRole('button', { name: 'Save rating' })).toHaveCount(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════
test.describe('W13 · payments switched on', () => {
  test('an order already held offers the status of its payment, not another price', async ({ page, world }) => {
    paymentsOn(world);
    await ticketAt(page, TICKET.assigned);
    await expect(detailValue(page, 'Held').getByRole('link', { name: 'Payment status' }))
      .toHaveAttribute('href', `/services/${TICKET.assigned}/pay`);
    await expect(page.getByRole('link', { name: /^Pay ₹/ })).toHaveCount(0);
  });

  test('an order that is done is offered the status of its payment too', async ({ page, world }) => {
    paymentsOn(world);
    await ticketAt(page, TICKET.closed);
    await expect(detailValue(page, 'Held').getByRole('link', { name: 'Payment status' })).toBeVisible();
  });

  test('paying is a real link to the checkout, and does not set money aside by hand', async ({ page, world }) => {
    paymentsOn(world);
    world.route(PAY_TICKET, () => ({ json: payState({ mode: 'test', enabled: true }) }));
    await ticketAt(page, TICKET.placed);
    expect(await overflow(page, 'PT-2101')).toEqual(['Copy link to this order']);

    await panel(page).getByRole('link', { name: 'Pay ₹1,200' }).click();
    await expect(page).toHaveURL(new RegExp(`/services/${TICKET.placed}/pay$`));
    expect(world.calls('fundTicket')).toHaveLength(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════
test.describe('W13 · payment settings that will not load', () => {
  test.use({ allowConsole: true });

  test('an unpaid order says the payment details could not be loaded, in the panel, with a retry', async ({ page, world }) => {
    world.route(PAY_CONFIG, () => ({ status: 500, json: { detail: 'nope' } }));
    await ticketAt(page, TICKET.placed);

    await expect(panel(page).getByText('Payment details could not be loaded.')).toBeVisible();
    await expect(panel(page).getByRole('button', { name: 'Retry' })).toBeVisible();
    await expect(page.getByRole('button', { name: /^Hold ₹/ })).toHaveCount(0);
    await expect(page.getByRole('link', { name: /^Pay ₹/ })).toHaveCount(0);
    await expect(page.getByText('Payment details could not be loaded.')).toHaveCount(1);
  });

  test('a held order says it once, in Details, beside the payment it is about', async ({ page, world }) => {
    world.route(PAY_CONFIG, () => ({ status: 500, json: { detail: 'nope' } }));
    await ticketAt(page, TICKET.assigned);
    await expect(details(page).getByText('Payment details could not be loaded.')).toBeVisible();
    await expect(page.getByText('Payment details could not be loaded.')).toHaveCount(1);
  });

  test('retrying asks for the settings again', async ({ page, world }) => {
    world.route(PAY_CONFIG, () => ({ status: 500, json: { detail: 'nope' } }));
    await ticketAt(page, TICKET.placed);
    await expect(panel(page).getByRole('button', { name: 'Retry' })).toBeVisible();
    const before = world.restCalls(PAY_CONFIG).length;
    paymentsOn(world);
    await panel(page).getByRole('button', { name: 'Retry' }).click();
    await expect.poll(() => world.restCalls(PAY_CONFIG).length).toBeGreaterThan(before);
    await expect(panel(page).getByRole('link', { name: 'Pay ₹1,200' })).toBeVisible();
  });
});


// ═══════════════════════════════════════════════════════════════════════
/**
 * Service order spec §14 — the acceptance list, at 1512 here and at 390 in
 * the @phone block below. Each test names the spec item it proves.
 */
const EVERY_SEEDED = [
  TICKET.placed, TICKET.assigned, TICKET.onSite, TICKET.delivered,
  TICKET.needsYou, TICKET.quiet, TICKET.closed, TICKET.cancelled,
];
const OPEN_SEEDED = [TICKET.placed, TICKET.assigned, TICKET.onSite, TICKET.delivered, TICKET.needsYou, TICKET.quiet];
const DESK_WORDS = [
  /\bAssign\b/, /Available providers/, /Send this to a provider/, /\bWithdraw\b/, /Mark on site/,
  /Record submitted work/, /open orders?/, /\brec-/, /\bBR-/, /set aside/i, /Visible on this order/,
];

test.describe('service order spec §14 · acceptance', () => {
  test('§14.1 no owner state draws the desk\'s controls, its ids or its words', async ({ page, world }) => {
    const extra = [
      view(), placedHeld({ quietDays: 4, can: ['cancel', 'message', 'nudge'] }), accepted({ assignedTo: associate() }),
      view({ events: [ev('w-ev-old', 'status', 'place', 'Placed', '04', 'owner', 'You', 'BR-5388 · ordered from rec-6881f2b14af4')] }),
    ];
    const check = async (label: string) => {
      const text = await page.locator('main').innerText();
      for (const word of DESK_WORDS) expect(text, `${label}: ${word}`).not.toMatch(word);
    };
    for (const id of EVERY_SEEDED) {
      await ticketAt(page, id);
      await expect(panel(page)).toBeVisible();
      await check(id);
      const more = await overflow(page, (await page.locator('header.pagehead [aria-current="page"]').innerText()).trim());
      expect(more, id).toEqual(['Copy link to this order']);
    }
    for (const [i, v] of extra.entries()) {
      world.set('ticket', v);
      await ticketAt(page, TICKET.needsYou);
      await expect(panel(page)).toBeVisible();
      await check(`view ${i}`);
    }
  });

  test('§14.2 placed, held, four days: a warn caption, Ask for an update, and no alert box', async ({ page, world }) => {
    world.set('ticket', placedHeld({ quietDays: 4, can: ['cancel', 'message', 'nudge'] }));
    await ticketAt(page, TICKET.needsYou);

    await expect(here(page).locator('.tracker-caption.warn')).toHaveText('Finding a provider · 4 days so far');
    await expect(panel(page).getByRole('button', { name: 'Ask for an update' })).toBeVisible();
    await expect(page.locator('.card.alert')).toHaveCount(0);
  });

  test('§14.3 overdue is said on the tracker and in Expected by, and the pill stays the status', async ({ page, world }) => {
    world.set('ticket', view({
      status: 'on_site', statusLabel: 'In progress', statusState: 'unknown', can: ['cancel', 'message', 'nudge'],
      deliverables: [], events: EVENTS.slice(0, 3), overdueDays: 2,
    }));
    await ticketAt(page, TICKET.needsYou);

    await expect(here(page).locator('.tracker-caption')).toHaveText('Overdue by 2 days');
    await expect(detailValue(page, 'Expected by')).toContainText('Overdue by 2 days');
    await expect(head(page).locator('.schip')).toHaveText('In progress');
  });

  test('§14.4 one property link, at most one "Not charged", and the status word once', async ({ page }) => {
    for (const id of EVERY_SEEDED) {
      await ticketAt(page, id);
      await expect(panel(page)).toBeVisible();
      await expect(page.locator('main').getByRole('link', { name: 'Sy 214/2', exact: true }), id).toHaveCount(1);
      expect(await saidTimes(page, 'Not charged'), id).toBeLessThanOrEqual(1);
      const word = (await head(page).locator('.schip').innerText()).trim();
      expect(await saidTimes(page, word), `${id}: ${word}`).toBe(1);
    }
  });

  test('§14.5 every open state has a labelled head button outside the ⋮ at 1512', async ({ page }) => {
    for (const id of OPEN_SEEDED) {
      await ticketAt(page, id);
      await expect(head(page).getByRole('button', { name: 'Cancel order' }), id).toBeVisible();
    }
    for (const id of [TICKET.closed, TICKET.cancelled]) {
      await ticketAt(page, id);
      await expect(head(page).getByRole('link', { name: 'Order it again' }), id).toBeVisible();
    }
  });

  test('§14.7 a closed order offers no change of mind, no number, and points the composer at the desk', async ({ page, world }) => {
    world.set('ticket', accepted({ assignedTo: associate() }));
    await ticketAt(page, TICKET.needsYou);
    await drawn(page, 'Corner survey');

    await expect(page.getByRole('button', { name: 'Change my mind' })).toHaveCount(0);
    await expect(page.locator('a[href^="tel:"]')).toHaveCount(0);
    await expect(composer(page)).toHaveAttribute('placeholder', /Pattadar desk/);
  });

  test('§14.8 twelve messages: the composer above the first, and "Show 2 earlier"', async ({ page, world }) => {
    world.set('ticket', view({
      events: Array.from({ length: 12 }, (_, i) => ev(`m${i}`, 'message', 'message', 'You sent a message',
        String(11 + i).padStart(2, '0'), 'owner', 'You', `Message ${i + 1}`)),
    }));
    await ticketAt(page, TICKET.needsYou);

    expect((await composer(page).boundingBox())!.y).toBeLessThan((await stream(page).first().boundingBox())!.y);
    await expect(activity(page).getByRole('button', { name: 'Show 2 earlier' })).toBeVisible();
  });
});

// ═══════════════════════════════════════════════════════════════════════
test.describe('W13 · on a phone', () => {
  const sideways = (page: Page) => page.evaluate(() =>
    document.documentElement.scrollWidth - document.documentElement.clientWidth);

  test('@phone §14.6 the Next step panel starts in the top half of the screen, and nothing scrolls sideways', async ({ page, world }) => {
    for (const id of EVERY_SEEDED) {
      await ticketAt(page, id);
      await expect(panel(page), id).toBeVisible();
      const top = (await panel(page).boundingBox())!.y;
      expect(top, `${id}: panel top`).toBeLessThan(422);
      expect(await sideways(page), id).toBeLessThanOrEqual(1);
    }
    world.set('ticket', view());
    await ticketAt(page, TICKET.needsYou);
    expect((await panel(page).boundingBox())!.y).toBeLessThan(422);
    expect(await sideways(page)).toBeLessThanOrEqual(1);
  });

  test('@phone §14.5 every state that waits on me shows its filled button in the panel', async ({ page, world }) => {
    await ticketAt(page, TICKET.placed);
    await expect(panel(page).getByRole('button', { name: 'Hold ₹1,200' })).toBeVisible();

    world.set('ticket', view());
    await ticketAt(page, TICKET.needsYou);
    await expect(panel(page).locator('.btn.primary', { hasText: 'Accept work' })).toBeVisible();

    world.set('ticket', placedHeld({
      money: money({ quoted: 1_180, held: 0, funded: false, provider: 'razorpay', live: true }),
      ledger: [{ ...LEDGER[0], amount: 1_180, provider: 'razorpay', simulated: false, status: 'failed' }],
    }));
    await page.reload();
    await expect(panel(page).getByRole('link', { name: 'Try payment again' })).toBeVisible();
  });

  test('@phone-only the head folds Cancel order into the ⋮ beside the copy link', async ({ page }) => {
    await ticketAt(page, TICKET.assigned);
    await expect(head(page).getByRole('button', { name: 'Cancel order' })).toHaveCount(0);
    expect(await overflow(page, 'PT-2102')).toEqual(['Cancel order', 'Copy link to this order']);
  });

  test('@phone-only the tracker is a vertical stepper with one caption, and Details comes before Activity', async ({ page }) => {
    await ticketAt(page, TICKET.assigned);
    const steps = tracker(page).getByRole('listitem');
    const a = (await steps.nth(0).boundingBox())!;
    const b = (await steps.nth(1).boundingBox())!;
    expect(b.y).toBeGreaterThan(a.y);
    await expect(tracker(page).locator('.tracker-caption:visible')).toHaveCount(1);
    expect((await details(page).boundingBox())!.y).toBeLessThan((await activity(page).boundingBox())!.y);
  });

  test('@phone delivered work is still reviewable one item at a time', async ({ page, world }) => {
    world.set('ticket', view());
    await ticketAt(page, TICKET.needsYou);
    const report = page.getByRole('article', { name: 'Surveyor report' });
    await expect(report.getByRole('button', { name: 'Keep it' })).toBeVisible();
    await expect(report.getByRole('button', { name: 'Return this one' })).toBeVisible();
    expect(await sideways(page)).toBeLessThanOrEqual(1);
  });
});

// ═══════════════════════════════════════════════════════════════════════
test.describe('W13 · the checkout', () => {
  test('the checkout asks for the service it was routed to, and offers the way back', async ({ page, world }) => {
    world.route(PAY_TICKET, () => ({ json: payState() }));
    await page.goto(`/services/${TICKET.placed}/pay`);

    await expect(page.getByRole('link', { name: '← Back to the service order' }))
      .toHaveAttribute('href', `/services/${TICKET.placed}`);
    await expect.poll(() => world.restCalls(PAY_TICKET).length).toBeGreaterThan(0);
    expect(world.restCalls(PAY_TICKET)[0].path).toContain(TICKET.placed);
  });

  test('with payments off the checkout takes no money and says so', async ({ page, world }) => {
    world.route(PAY_TICKET, () => ({ json: payState() }));
    await page.goto(`/services/${TICKET.placed}/pay`);

    await expect(page.getByText('Online payments are not configured. No payment has been taken here.'))
      .toBeVisible();
    await expect(page.getByRole('button', { name: /^Pay /})).toBeDisabled();
    await expect(page.getByText('The payment company confirmed it.', { exact: false })).toHaveCount(0);
  });

  test('the price is the one the service quoted, in rupees rather than paise', async ({ page, world }) => {
    world.route(PAY_TICKET, () => ({ json: payState() }));
    await page.goto(`/services/${TICKET.placed}/pay`);
    await expect(page.getByText('₹6,500.00', { exact: true })).toBeVisible();
  });

  test('while the payment status is on its way the page says it is', async ({ page, world }) => {
    world.route(PAY_TICKET, () => ({ json: payState(), delayMs: 1_500 }));
    await page.goto(`/services/${TICKET.placed}/pay`);
    await expect(page.getByText('Loading payment status…')).toBeVisible();
    await expect(page.getByText('₹6,500.00', { exact: true })).toBeVisible();
  });

  test('the payment status can be asked for again without reloading the page', async ({ page, world }) => {
    world.route(PAY_TICKET, () => ({ json: payState() }));
    await page.goto(`/services/${TICKET.placed}/pay`);
    await expect(page.getByText('₹6,500.00', { exact: true })).toBeVisible();

    const before = world.restCalls(PAY_TICKET).length;
    await page.getByRole('button', { name: 'Check payment status' }).click();
    await expect.poll(() => world.restCalls(PAY_TICKET).length).toBeGreaterThan(before);
  });

  test('test mode says no real money moves, and labels the button as a test', async ({ page, world }) => {
    world.route(PAY_TICKET, () => ({ json: payState({ mode: 'test', enabled: true }) }));
    await page.goto(`/services/${TICKET.placed}/pay`);

    await expect(page.getByText('Use test payment details. No real money moves.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Open test checkout' })).toBeEnabled();
    await expect(page.getByText(
      'Your payment counts only once the payment company confirms it.')).toBeVisible();
  });

  test('a payment order that is not ready yet says to check the status rather than trying again', async ({ page, world }) => {
    world.route(PAY_TICKET, (route) => (route.request().method() === 'POST'
      ? { json: payState({ mode: 'test', enabled: true, status: 'pending', captured: false }) }
      : { json: payState({ mode: 'test', enabled: true }) }));
    await page.goto(`/services/${TICKET.placed}/pay`);
    await page.getByRole('button', { name: 'Open test checkout' }).click();

    await expect(page.getByRole('alert')).toHaveText(
      'The payment is being prepared. Check the status before trying again.');
  });

  test('a payment the provider already captured is not offered for paying a second time', async ({ page, world }) => {
    world.route(PAY_TICKET, () => ({
      json: payState({ mode: 'test', enabled: true, status: 'captured', captured: true, paymentId: 'pay_1' }),
    }));
    await page.goto(`/services/${TICKET.placed}/pay`);

    await expect(page.getByText(
      'The payment company confirmed it. Pattadar holds it for this service order until you accept the work.'))
      .toBeVisible();
    await expect(page.getByRole('button', { name: /^Pay |Open test checkout/ })).toHaveCount(0);
  });

  test('a released payment says the payment company confirmed it', async ({ page, world }) => {
    world.route(PAY_TICKET, () => ({
      json: payState({ mode: 'live', enabled: true, status: 'settled', captured: true }),
    }));
    await page.goto(`/services/${TICKET.closed}/pay`);
    await expect(page.getByText('The payment company confirmed it. The payment has been released.')).toBeVisible();
  });

  test('a payment still with the payment company says its progress is shown below', async ({ page, world }) => {
    world.route(PAY_TICKET, () => ({
      json: payState({
        mode: 'live', enabled: true, status: 'settlement_pending', captured: true,
        operations: [{ kind: 'transfer', status: 'submitted', error: '' }],
      }),
    }));
    await page.goto(`/services/${TICKET.closed}/pay`);
    await expect(page.getByText('Waiting for the payment company to confirm. Its progress is shown below.'))
      .toBeVisible();
  });

  test('what the payment company is doing is listed in words, not in its own codes', async ({ page, world }) => {
    world.route(PAY_TICKET, () => ({
      json: payState({
        mode: 'test', enabled: true, status: 'captured', captured: true,
        operations: [
          { kind: 'order', status: 'done', error: '' },
          { kind: 'transfer', status: 'pending', error: '' },
          { kind: 'fee', status: 'attention', error: 'The provider rejected the fee split.' },
        ],
      }),
    }));
    await page.goto(`/services/${TICKET.closed}/pay`);

    const list = page.getByRole('listitem');
    await expect(list.nth(0)).toContainText('Order created: Confirmed');
    await expect(list.nth(1)).toContainText('Released to the provider: Waiting');
    await expect(list.nth(2)).toContainText('Pattadar fee: Needs attention');
    await expect(list.nth(2)).toContainText('The provider rejected the fee split.');
  });

  test('the page says that closing it does not cancel a payment already accepted', async ({ page, world }) => {
    world.route(PAY_TICKET, () => ({ json: payState() }));
    await page.goto(`/services/${TICKET.placed}/pay`);
    await expect(page.getByText(
      'Closing this page does not cancel a payment already accepted by the payment company. You '
      + 'can return to check its status.')).toBeVisible();
  });

  test('a payment status that will not answer leaves the page saying it is loading', async ({ page, world }) => {
    world.route(PAY_TICKET, () => ({ json: payState(), delayMs: 30_000 }));
    await page.goto(`/services/${TICKET.placed}/pay`);
    await expect(page.getByText('Loading payment status…')).toBeVisible();
    await expect(page.getByRole('button', { name: /^Pay / })).toHaveCount(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════
test.describe('W13 · a checkout that is refused', () => {
  // Both of these are a non-2xx from the payments gateway, which the browser
  // logs before the page ever sees it.
  test.use({ allowConsole: true });

  test('a checkout for a service that is not mine says so instead of quoting a price', async ({ page, world }) => {
    world.route(PAY_TICKET, () => ({ status: 404, json: { detail: 'Ticket not found' } }));
    await page.goto(`/services/${TICKET.missing}/pay`);

    // payments.py:157 refuses a service that is not this account's the same way
    // it refuses one that never existed — the page quotes the reason and never
    // a figure, because it was never told one.
    await expect(page.getByRole('alert')).toHaveText('Ticket not found');
    await expect(page.getByText('₹')).toHaveCount(0);
    await expect(page.getByRole('button', { name: /^Pay / })).toHaveCount(0);
  });

  test('a payments-off build says payments are not configured, and nothing can be paid', async ({ page }) => {
    // No override: fixtures/seed.ts answers this GET the way payments.py
    // `_view` does with payments off — 200, `not_started`, mode 'off' — not
    // with a refusal (that is only the checkout POST). A refused read is
    // covered above with its own answer.
    await page.goto(`/services/${TICKET.placed}/pay`);
    await expect(page.getByText('Online payments are not configured. No payment has been taken here.'))
      .toBeVisible();
    await expect(page.getByRole('button', { name: /^Pay / })).toBeDisabled();
    await expect(page.getByRole('alert')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Check payment status' })).toBeVisible();
  });
});

// ═══════════════════════════════════════════════════════════════════════
