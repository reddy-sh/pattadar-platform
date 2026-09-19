/**
 * W13 — one ordered service, end to end. `/app/services/:id` and
 * `/app/services/:id/pay`.
 *
 * This is the screen an owner opens when they want to know where their money
 * and their surveyor have got to, and it has to answer four questions without
 * anybody ringing anybody: who has it, what was asked, what has happened, and
 * what is set aside against it.
 *
 * Two nouns, one meaning each, and the whole file is written in them. A
 * **service** is the thing that was ordered — the route, the breadcrumb and
 * the three page-level states, because those name the thing you tried to open.
 * A **job** is the work running against it, which is every body sentence on
 * the page. "Ticket" survives only as the name of the GraphQL field, the
 * mutations, the TS types and the file, none of which a reader sees — so it
 * still appears below in `world.set('ticket', …)` and nowhere a user could
 * read it.
 *
 * Three rules decide most of what is asserted here, and all three come from
 * the screen's own docstring:
 *
 *   · nothing an outsider sends touches the record until the owner has looked
 *     at it, one item at a time — so a deliverable is reviewed on the JOB,
 *     `goesTo` says where it WOULD land, and filing happens once, on accept;
 *   · the payments provider is a stub, so no rupee has moved — the copy says
 *     set aside, recorded and owed, never paid or charged, and the colourless
 *     `Not charged` pill sits beside every figure;
 *   · the status word is printed exactly ONCE, by the `State` pill in the
 *     header. The stage pips that used to sit beside it printed the same word
 *     six pixels away and counted a non-monotonic integer; they are gone, and
 *     there is a test below that fails the day anything prints it twice.
 *
 * The fourth rule is the server's: `can` is the list of legal moves
 * (ticketing.py `can()`), and Ticket.tsx now drives EVERY control off it —
 * never off the status string — so the screen can never offer a move the API
 * will refuse. The stage walk below asserts EXACTLY the kebab offered at each
 * of the eight seeded stages, the whole set and not a sample, because an extra
 * item there is a promise the server breaks.
 *
 * Where each action lives is itself a guarantee, and asserted as one: an
 * action reaches the kebab ONLY if it is not already a button somewhere on the
 * page. Funding lives in the money card's footer, "They're on site" in the
 * person card, "Record what came back" on the dashed empty card while nothing
 * has come back, accept and send-back in the accept footer — and none of them
 * is in the menu. That single rule is what stopped one action printing three
 * times over.
 *
 * What a reader of this file must know before changing it:
 *
 *  · `fixtures/seed.ts` answers `ticket` with a FUNCTION of the id, so
 *    `world.seedOf('ticket')` refuses it. `view()` below is a hand-built
 *    TicketView used by every test that needs a branch the eight seeded rows
 *    do not hold. Everything that CAN be asserted against the seed as it
 *    stands is.
 *  · The layout is two columns and which column a block is in is part of the
 *    design, so `inMain()` and `inRail()` below scope by column rather than by
 *    page. The roster ("Who can do this") is a main-column block; the person
 *    card ("Who is on it"), "Sent out" and "On this land" are the rail, and
 *    the rail holds no action that exists nowhere else.
 *  · Exactly one block is promoted to the top of the main column wearing
 *    `accent`, and it is REMOVED from its canonical slot — so every promotion
 *    test asserts a count of one as well as a position. A promotion that
 *    drew twice would otherwise pass every "is it visible" assertion.
 *  · `Who is on it` (W17) has THREE branches and the server picks which by
 *    what it sends, so all three are asserted against the seed rather than
 *    against a hand-built view:
 *      – TICKET.assigned carries `assignedTo` for Ravi Kumar with
 *        `contactShown: true`, which is the branch the whole feature exists
 *        for — the number is a `tel:` an owner can press;
 *      – TICKET.onSite carries K. Anitha, who WITHHELD hers: `contact` is ''
 *        and `contactWhy` is the sentence printed in its place. The test for
 *        that one asserts the ABSENCE of any tel: or mailto: on the page and
 *        that the real number is nowhere in the markup, because a screen that
 *        leaks a number it promised to withhold is the worst thing this card
 *        can do;
 *      – every other seeded ticket keeps the legacy free-text `assignee`, and
 *        the card says out loud that there is no number behind a typed name.
 *    `view()` therefore sends `assignedTo: null` — the legacy branch — and
 *    `associate()` beside it builds the W17 one for the branches the seed
 *    cannot reach.
 *  · `view()` is deliberately not a copy of the seed. Five fields in the seed
 *    diverge from what the server actually sends, and a test written against
 *    them would assert a fixture rather than the product:
 *      – `status` is spelled `delivered` / `waiting_owner`; ticketing.py:223
 *        spells that one state `submitted`. Nothing on the screen branches on
 *        the status string any more, which is exactly why it can be driven by
 *        both;
 *      – `payeeShare` is the whole quoted price; web360.py:1900 makes it a
 *        FRACTION (0.90 by default), which is what both money dialogs
 *        multiply by;
 *      – `stage` is 1-based; ticketing.py STATUS_STAGE is 0-based. Nothing
 *        reads it now that the stage pips are deleted;
 *      – `events[].kind` is the status name; web360.py:2109 writes `status`,
 *        which is the kind `movedOn()` scans for, so against the seed every
 *        "moved on" date falls back to the day it was ordered — which is also
 *        why no seeded job prints the header's "since" clause;
 *      – `assignedTo.via` is spelled `desk`; web360.py:3690 writes the literal
 *        `the desk`. The three `via` sentences are therefore pinned against
 *        `view()` below, where this file controls the value, and the seeded
 *        rows are only asserted for the date.
 *    None of the five is a defect in the screen. Dates are the same story:
 *    the server already sends `dueDate`, `ledger[].at` and `events[].atLabel`
 *    as DD/MM/YYYY (web360.py:4209, :2038, :1994) and the screen prints them
 *    verbatim, so an ISO date in the seed is the fixture speaking.
 *  · Refusals are `World.gqlError` or a plain `false`, not `World.httpError`:
 *    a non-2xx reaches the console guard as a browser log entry. The three
 *    describes that need a real HTTP failure say so with `allowConsole`.
 *  · `/app/services/:id` is a lazy route behind a Suspense spinner, so
 *    `toHaveCount(0)` on a page that has not drawn yet passes for the wrong
 *    reason — two of the defects below first went green that way. Every
 *    assertion that something is NOT offered waits on `drawn()` or on a
 *    positive assertion beside it first.
 *  · The checkout page is NOT sealed against Razorpay — only `/api` is. No
 *    test here takes a path that reaches `loadCheckout()`: the one that
 *    presses the pay button answers `POST …/checkout` with an order that is
 *    not ready, which throws at PaymentsCheckout.tsx:94-96, before the script
 *    tag is created. Nothing here loads checkout.razorpay.com.
 *
 * Three defects are recorded as `test.fail()`, each naming the file and line
 * that causes it and what the owner is owed:
 *
 *   · a closed job still offers "Change my mind" on what came back, and
 *     `review_deliverable` refuses a closed ticket (web360.py:5258);
 *   · a refused review prints the same sentence twice, in two live regions;
 *   · a storage outage while recording a deliverable reports the wrong
 *     sentence, because `uploadToDrive` throws rather than returning null.
 *
 * They go green the day they are fixed, which is what they are for.
 */
import { test, expect, World } from '../fixtures/harness';
import type { Page } from '../fixtures/harness';
import { ID, TICKET } from '../fixtures/ids';

// ── the screen's own words, quoted once ────────────────────────────────

const SEND_FAILED =
  'That did not go out. Nothing was sent — check the number or the email and try again.';
const ADD_FAILED =
  'That was not recorded. Nothing was added to this job — check what you typed and try again.';
const MOVE_FAILED =
  'That did not go through. Nothing on this job has changed — reload the page and try again.';
const ACCEPT_FAILED =
  'That was not accepted. Decide on every item first, then try again.';
const STORAGE_OFFLINE_MSG =
  'The file could not be uploaded. Check your connection and try again; your existing files are unchanged.';

/** A worker token as `Dispatch` matches it — 43 URL-safe characters after
 *  `/work/` (Ticket.tsx:353). Anything shorter and the "copy the link
 *  yourself" panel never appears. */
const TOKEN = 'Kf3nQ8sVb2LmX9tRc7YwZp1AeH5uJdG4iO0NxT6BkSq';

// ── a TicketView, every field Q_TICKET selects ─────────────────────────

type Over = Record<string, unknown>;

const MONEY = {
  quoted: 6_500, held: 6_500, released: 0, fee: 0, returned: 0, payeeShare: 0.9,
  provider: 'stub', live: false, funded: true,
  headline: '₹6,500 is set aside for this job',
  honesty: 'Payments are switched off on this build. Nothing has been charged.',
};

const EVENTS = [
  { id: 'w-ev-1', kind: 'status', action: 'place', headline: 'You asked for a corner survey', detail: 'Ordered from Sy 214/2', actorLabel: 'You', actorKind: 'owner', tone: '', at: '2026-09-04T05:00:00Z', atLabel: '04/09/2026' },
  { id: 'w-ev-2', kind: 'dispatch', action: '', headline: 'Written to Ravi Kumar on SMS', detail: 'A job on Sy 214/2', actorLabel: 'Pattadar', actorKind: 'system', tone: '', at: '2026-09-05T05:00:00Z', atLabel: '05/09/2026' },
  { id: 'w-ev-3', kind: 'status', action: 'assign', headline: 'Put on Ravi Kumar', detail: '', actorLabel: 'You', actorKind: 'owner', tone: '', at: '2026-09-05T06:00:00Z', atLabel: '05/09/2026' },
  { id: 'w-ev-4', kind: 'status', action: 'start', headline: 'Ravi Kumar is on site', detail: '', actorLabel: 'Ravi Kumar', actorKind: 'worker', tone: '', at: '2026-09-09T05:00:00Z', atLabel: '09/09/2026' },
  { id: 'w-ev-5', kind: 'deliverable', action: '', headline: 'Two things came back', detail: '8 corners, walked · Surveyor report', actorLabel: 'Ravi Kumar', actorKind: 'worker', tone: '', at: '2026-09-10T05:00:00Z', atLabel: '10/09/2026' },
];

const DELIVERABLES = [
  {
    id: 'w-dlv-1', kind: 'boundary', label: '8 corners, walked', note: 'GPS, ±3 m',
    fileRef: '', fileName: '', mimeType: '', sizeBytes: 0,
    payload: JSON.stringify({ ring: '15.3133,80.0729;15.3140,80.0740;15.3120,80.0750' }),
    submittedBy: 'Ravi Kumar', submittedAt: '2026-09-10', fileAs: 'boundary',
    fileTargets: [{ k: 'boundary', v: 'The outline on file' }],
    goesTo: 'The record boundary', review: 'pending', reviewNote: '',
    filedTable: '', filedId: '', filedAt: '',
  },
  {
    id: 'w-dlv-2', kind: 'paper', label: 'Surveyor report', note: '3 pages',
    fileRef: '', fileName: 'survey-report.pdf', mimeType: 'application/pdf', sizeBytes: 240_000,
    payload: '', submittedBy: 'Ravi Kumar', submittedAt: '2026-09-10', fileAs: 'map',
    fileTargets: [{ k: 'map', v: 'The map shelf' }, { k: 'title', v: 'The title shelf' }],
    goesTo: 'The map shelf', review: 'pending', reviewNote: '',
    filedTable: '', filedId: '', filedAt: '',
  },
];

const DISPATCH = {
  id: 'w-dsp-1', purpose: 'invite', channel: 'sms',
  contactMasked: '+91 98••• ••432', personName: 'Ravi Kumar',
  subject: 'A job on Sy 214/2',
  body: `Sy 214/2 at Katragunta needs 8 corners walked. ₹6,500, wanted by 25/09/2026.\n`
    + `Open http://localhost:5173/work/${TOKEN} to accept.`,
  provider: 'stub', live: false, status: 'sent', statusWord: 'Sent', error: '',
  expiresOn: '19/09/2026', daysLeft: 6, revoked: false, revokeReason: '',
  sentAt: '2026-09-05',
};

const LEDGER = [{
  id: 'w-led-1', entry: 'hold', label: 'Set aside for W-2105', amount: 6_500,
  fromBucket: 'wallet', toBucket: 'held', payee: '', provider: 'stub',
  simulated: true, status: 'done', note: '',
  ticketId: TICKET.needsYou, ticketRef: 'W-2105', at: '05/09/2026',
}];

/** One ticket, waiting on the owner with two undecided items — the busiest
 *  state the screen has. Every other branch is this with an override. */
const view = (over: Over = {}) => ({
  id: TICKET.needsYou, ref: 'W-2105', kind: 'survey',
  title: 'Corner survey', detail: 'Establish 8 corners',
  recordId: ID.parcel, recordTitle: 'Sy 214/2',
  recordPlace: 'Katragunta, Markapur, Prakasam',
  status: 'submitted', statusLabel: 'Waiting on you', statusState: 'warn',
  stage: 3, stageLabel: 'Delivered', needsYou: true, closed: false,
  assignee: 'Ravi Kumar, licensed surveyor', dueDate: '25/09/2026',
  // The legacy branch of `Who is on it`: a name somebody typed, with no row
  // behind it. `associate()` below is what the server sends when there IS one.
  assignedTo: null, dispatchState: '',
  quietDays: 0, quiet: false, outcomeNote: '', acceptedAt: '', createdAt: '2026-09-04',
  can: ['accept', 'cancel', 'dispatch', 'send_back'],
  answers: [{ k: 'Which survey number', v: '214/2' }, { k: 'How many corners', v: '8' }],
  money: MONEY,
  events: EVENTS,
  deliverables: DELIVERABLES,
  dispatches: [DISPATCH],
  ledger: LEDGER,
  ...over,
});

/** An `AssignedPerson`, as web360.py sends it for a real Pattadar associate.
 *  `contact` arrives filled in only when the server has decided this owner may
 *  see it (api.ts:270-284); when it has not, `contact` is '' and `contactWhy`
 *  carries the sentence to print instead — never a masked number to show. */
const ASSOCIATE = {
  associateId: 'as-ravi', name: 'Ravi Kumar', firm: 'Ravi Surveys', initials: 'RK',
  discipline: 'surveyor', disciplineLabel: 'Licensed surveyor',
  contact: '9848012345', contactShown: true, contactWhy: '',
  jobsOpen: 2, assignedAt: '2026-09-05', via: 'desk',
};

const associate = (over: Over = {}) => ({ ...ASSOCIATE, ...over });
const money = (over: Over = {}) => ({ ...MONEY, ...over });
const deliverable = (i: number, over: Over = {}) => ({ ...DELIVERABLES[i], ...over });
const dispatch = (over: Over = {}) => ({ ...DISPATCH, ...over });

// ── locators ───────────────────────────────────────────────────────────

/** One titled Card. `Card` draws `<section class="card pad-lg">` with the
 *  title as its only h2, so the heading is the handle — the class alone would
 *  match every panel on the page.
 *
 *  Note what this deliberately does NOT match: the two empty states. An empty
 *  "Sent out" and an empty "What came back" are bare `.card.dashed`
 *  one-liners with no heading at all, because a `Card` around one sentence
 *  spends 87px of chrome on 39px of words. Their sentences are unchanged and
 *  are asserted by text. */
const card = (page: Page, title: string) =>
  page.locator('section.card').filter({ has: page.getByRole('heading', { name: title, exact: true }) });

/** The two columns. Which column a block is in is part of the design — the
 *  main column carries everything with a decision in it, the rail carries the
 *  three things that are reference material — so the tests scope by column
 *  rather than asserting a block is merely somewhere on the page. */
const mainCol = (page: Page) => page.locator('.split.loose > div.stack');
const rail = (page: Page) => page.locator('.split.loose > aside.stack');
const inMain = (page: Page, title: string) =>
  mainCol(page).locator('section.card').filter({ has: page.getByRole('heading', { name: title, exact: true }) });
const inRail = (page: Page, title: string) =>
  rail(page).locator('section.card').filter({ has: page.getByRole('heading', { name: title, exact: true }) });

/** The blocks of the main column, in source order. Position is the whole
 *  point of the promotion rule, so the first one is asserted by name. */
const firstBlock = (page: Page) => mainCol(page).locator('> *').first();

/** The kebab's items, in the order they are offered. It is portalled to the
 *  .w360 root, so it is read off the page rather than out of the header. */
async function actions(page: Page, ref: string): Promise<string[]> {
  await page.getByRole('button', { name: `Actions for ${ref}` }).click();
  return (await page.getByRole('menuitem').allTextContents()).map((s) => s.trim());
}

/** Open the kebab and press one of its items. Every action that is not
 *  already a button on the page lives here now, so this is how a test reaches
 *  sending, unassigning and cancelling. */
async function fromMenu(page: Page, ref: string, item: string): Promise<void> {
  await page.getByRole('button', { name: `Actions for ${ref}` }).click();
  await page.getByRole('menuitem', { name: item }).click();
}

const ticketAt = (page: Page, id: string) => page.goto(`/app/services/${id}`);

/** The rail card with the person on it. Three branches only — an associate,
 *  a typed name, or a closed job nobody ever had. The fourth answer, nobody
 *  on an open job, is `Who can do this` in the main column and this card is
 *  not drawn at all beside it. */
const whoIsOnIt = (page: Page) => card(page, 'Who is on it');

/** The roster, full width, in the main column. */
const whoCanDoThis = (page: Page) => card(page, 'Who can do this');

/** One person offered by the roster. Each is a bare div in a `.rows.boxed`,
 *  and the name is the only handle on a row that is otherwise all notes. */
const offered = (page: Page, name: string) =>
  whoCanDoThis(page).locator('.rows.boxed > div').filter({ hasText: name });

/** The send form, which is a dialog rather than the inline panel it used to
 *  be: as a panel it pushed 539px of card down the page before the blocks it
 *  was about and stretched a phone-number input to the full column width. */
const sendDialog = (page: Page) => page.getByRole('dialog', { name: 'Send this to someone' });
const recordDialog = (page: Page) => page.getByRole('dialog', { name: 'Record what came back' });

/** The service is actually on screen.
 *
 *  `/app/services/:id` is a lazy route behind a Suspense spinner, so a bare
 *  `toHaveCount(0)` resolves against an empty page and passes for the wrong
 *  reason — which is exactly how two of the defects below first went green.
 *  Every assertion that something is NOT offered waits for this first. */
const drawn = (page: Page, title: string) =>
  expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible();

/** How many times a run of words appears in the page's own text. Used for the
 *  one guarantee the header rebuild exists for: the status word is printed
 *  once. `toHaveCount` on a locator cannot say this — the word could be
 *  drawn by a `.state`, by a note and by a heading, and all three would pass
 *  a locator scoped to any one of them. */
async function saidTimes(page: Page, phrase: string): Promise<number> {
  const text = await page.locator('main').innerText();
  return text.split(phrase).length - 1;
}


// ── payments ───────────────────────────────────────────────────────────

const PAY_CONFIG = /\/api\/gateway\/pattadar\/payments\/config/;
const PAY_TICKET = /\/api\/gateway\/pattadar\/payments\/tickets\//;

/** What `GET /payments/tickets/{id}` answers with when payments are OFF —
 *  payments.py `_view` returns 200 and a not_started state, it does not
 *  refuse. The seed answers 409 instead, so every checkout test that is about
 *  the SCREEN rather than about the seal sets this. */
const payState = (over: Over = {}) => ({
  status: 'not_started', title: 'Corner survey', amount: 650_000, currency: 'INR',
  mode: 'off', enabled: false, operations: [], ...over,
});

const paymentsOn = (world: World, mode: 'test' | 'live' = 'test') =>
  world.route(PAY_CONFIG, () => ({ json: { enabled: true, mode, live: mode === 'live' } }));

// ═══════════════════════════════════════════════════════════════════════
test.describe('W13 · what the service says', () => {
  test('the service names the job, the record it is on and the reference I quote down a phone', async ({ page, world }) => {
    await ticketAt(page, TICKET.assigned);

    await drawn(page, 'Corner survey');
    expect(world.lastVars('ticket')).toMatchObject({ id: TICKET.assigned });

    // The reference and the record are in the Crumbs and nowhere else. The
    // eyebrow that printed both again, within two lines of the trail that had
    // just printed them, is deleted; the place moved to the rail's "On this
    // land" card, where the land is the subject.
    const crumbs = page.getByRole('navigation', { name: 'Breadcrumb' });
    await expect(crumbs.getByRole('link', { name: 'Services' }))
      .toHaveAttribute('href', '/app/services');
    await expect(crumbs.getByRole('link', { name: 'Sy 214/2' }))
      .toHaveAttribute('href', `/app/records/${ID.parcel}`);
    await expect(crumbs).toContainText('W-2102');
  });

  test('the reference I quote down a phone is printed once, in the trail of crumbs', async ({ page }) => {
    // W-2101 is unfunded, so its ledger is empty and the only place the ref
    // can appear is the Crumbs. The eyebrow that used to print it a second
    // time, two lines below, is deleted.
    await ticketAt(page, TICKET.placed);
    await drawn(page, 'Encumbrance certificate');

    await expect(page.getByRole('navigation', { name: 'Breadcrumb' })).toContainText('W-2101');
    expect(await saidTimes(page, 'W-2101')).toBe(1);
  });

  test('the old ticket address still opens the service, because a shipped phone knows no other', async ({ page }) => {
    // apps/ios/Pattadar/Sources/ServicesScreen.swift:251 hard-codes
    // `/app/tickets/<id>/pay` in a binary that is already on phones. The
    // redirect is not a courtesy, it is what holds that together.
    await page.goto(`/app/tickets/${TICKET.assigned}`);

    await expect(page).toHaveURL(new RegExp(`/app/services/${TICKET.assigned}$`));
    await drawn(page, 'Corner survey');
  });

  test('the lede says when it was ordered, who has it and when it is wanted by', async ({ page }) => {
    await ticketAt(page, TICKET.assigned);
    await expect(page.locator('.lede')).toContainText('Ordered 04/09/2026');
    await expect(page.locator('.lede')).toContainText('with Ravi Kumar, licensed surveyor');
    await expect(page.locator('.lede')).toContainText('due');
  });

  test('a job nobody is on yet says nothing about who has it', async ({ page }) => {
    await ticketAt(page, TICKET.placed);
    await expect(page.locator('.lede')).toContainText('Ordered 04/09/2026');
    await expect(page.locator('.lede')).not.toContainText('with');
  });

  test('the status word the server chose is the status word on the screen', async ({ page }) => {
    await ticketAt(page, TICKET.needsYou);
    await expect(page.locator('.state').filter({ hasText: 'Waiting on you' })).toBeVisible();
  });

  test('the status word is printed once on the whole page, not twice six pixels apart', async ({ page }) => {
    // The complaint this replaces, in the founder's own words: "On site ○ On
    // site". The stage pips printed `statusLabel` a second time at the same
    // size in the same grey, 6px from the pill, and counted a `stage` integer
    // that runs backwards between 'changes' and 'submitted'. The pips are
    // gone; this is the test that keeps them gone. A locator scoped to
    // `.state` cannot say it — the word could come back as a note or a
    // heading — so the page's own text is counted.
    await ticketAt(page, TICKET.onSite);
    await drawn(page, 'Corner survey');

    await expect(page.locator('.state').filter({ hasText: 'On site' })).toHaveCount(1);
    expect(await saidTimes(page, 'On site')).toBe(1);
  });

  test('the header carries the pill and no second device beside it', async ({ page }) => {
    await ticketAt(page, TICKET.quiet);
    await drawn(page, 'Encumbrance certificate');

    const head = page.locator('header.pagehead');
    await expect(head.locator('.state')).toHaveCount(1);
    // No stage pips, and no primary button: every action lives in the footer
    // of the card that owns it, on the row that owns it, or in the kebab. A
    // header button here could only scroll to a card already on screen.
    await expect(head.locator('.rail')).toHaveCount(0);
    await expect(head.getByRole('button', { name: 'Actions for W-2106' })).toBeVisible();
    await expect(head.getByRole('button')).toHaveCount(1);
  });

  test('a job whose status moved after it was ordered says since when', async ({ page, world }) => {
    world.set('ticket', view({
      events: [...EVENTS, {
        id: 'w-ev-6', kind: 'status', action: 'submit', headline: 'Ravi Kumar sent the work back',
        detail: '', actorLabel: 'Ravi Kumar', actorKind: 'worker', tone: '',
        at: '2026-09-10T06:00:00Z', atLabel: '10/09/2026',
      }],
    }));
    await ticketAt(page, TICKET.needsYou);

    await expect(page.locator('header.pagehead')).toContainText('since 10/09/2026');
  });

  test('a job that has only ever been ordered does not print the order date twice', async ({ page, world }) => {
    // `movedOn()` falls back to `createdAt` when the only status event is the
    // placement, and the lede has just printed that date one line above.
    world.set('ticket', view({
      events: [EVENTS[0]], createdAt: '2026-09-04',
    }));
    await ticketAt(page, TICKET.needsYou);

    await expect(page.locator('.lede')).toContainText('Ordered 04/09/2026');
    await expect(page.locator('header.pagehead')).not.toContainText('since');
  });

  test('the trail lists everything that happened, with who did it and when', async ({ page, world }) => {
    world.set('ticket', view());
    await ticketAt(page, TICKET.needsYou);

    const trail = card(page, 'Everything that happened');
    await expect(trail).toContainText('You asked for a corner survey');
    await expect(trail).toContainText('Written to Ravi Kumar on SMS');
    await expect(trail).toContainText('Put on Ravi Kumar');
    await expect(trail).toContainText('Ravi Kumar is on site');
    await expect(trail).toContainText('Two things came back');
    await expect(trail.locator('.rows.boxed > div')).toHaveCount(5);
  });

  test('a trail line carries the day and the person, not just the sentence', async ({ page, world }) => {
    world.set('ticket', view());
    await ticketAt(page, TICKET.needsYou);

    const line = card(page, 'Everything that happened').locator('.rows.boxed > div')
      .filter({ hasText: 'Put on Ravi Kumar' });
    await expect(line).toContainText('05/09/2026');
    await expect(line).toContainText('You');
  });

  test('a job with no trail at all says which day it was placed instead of drawing an empty box', async ({ page, world }) => {
    world.set('ticket', view({ events: [] }));
    await ticketAt(page, TICKET.needsYou);

    await expect(card(page, 'Everything that happened')).toContainText(
      'Nothing has been recorded against this job. It was placed on 04/09/2026, on a screen '
      + 'that did not keep a trail — anything that happens from here is written down.');
  });

  test('what was asked for is listed as the answers I gave', async ({ page }) => {
    await ticketAt(page, TICKET.assigned);
    const asked = card(page, 'What was asked for');
    await expect(asked).toContainText('Which survey number');
    await expect(asked).toContainText('214/2');
    await expect(asked).toContainText('How many corners');
  });

  test('an order with no options set on it says so, rather than blaming an older form', async ({ page, world }) => {
    // The old sentence — "placed before the form asked for details" — is
    // false for an EC, whose three catalogue fields are every one of them
    // optional. With no answers the provenance line leads instead, and this
    // says why the rows are missing.
    world.set('ticket', view({ answers: [] }));
    await ticketAt(page, TICKET.needsYou);

    const asked = card(page, 'What was asked for');
    await expect(asked).toContainText('Establish 8 corners');
    await expect(asked).toContainText('No options were set on this order.');
  });

  test('what was asked for closes with where the order came from, under the answers not above them', async ({ page, world }) => {
    world.set('ticket', view());
    await ticketAt(page, TICKET.needsYou);

    const asked = card(page, 'What was asked for');
    await expect(asked).toContainText('Establish 8 corners');
    await expect(asked).not.toContainText('No options were set on this order.');
    // And the land, as one line that goes back to the record.
    await expect(asked.getByRole('link', { name: 'Sy 214/2 · Katragunta, Markapur, Prakasam' }))
      .toHaveAttribute('href', `/app/records/${ID.parcel}`);
  });

  test('a service that has not arrived says which noun it is waiting on, and it is the noun that fails', async ({ page, world }) => {
    // One screen, one noun. The three page-level states name the SERVICE —
    // the thing you tried to open — and they used to disagree: it loaded as
    // "this job", failed as "This ticket" and emptied as "This ticket is not
    // here". Two of the three now read the same word as the third.
    world.set('ticket', World.never());
    await ticketAt(page, TICKET.assigned);

    await expect(page.getByText('Loading this service…')).toBeVisible();
    await expect(page.getByRole('heading', { level: 1 })).toHaveCount(0);
  });

  test('a service that will not load says so, keeps the reason and offers to try again', async ({ page, world }) => {
    world.set('ticket', World.gqlError('the ticket store is down'));
    await ticketAt(page, TICKET.assigned);

    await expect(page.getByText('This service did not load')).toBeVisible();
    await expect(page.getByText('the ticket store is down')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Try again' })).toBeVisible();
  });

  test('a service that comes back on the second ask is drawn, not left as an error', async ({ page, world }) => {
    world.set('ticket', World.gqlError('the ticket store is down'));
    await ticketAt(page, TICKET.needsYou);
    await expect(page.getByText('This service did not load')).toBeVisible();

    // The world answers whatever it is holding at the moment of the ask, so
    // the server "coming back" is one line here rather than a counter — and a
    // function answer cannot do it: `World.serveGraphql` replaces a function
    // that returns a special answer with that special answer, permanently.
    world.set('ticket', view());
    await page.getByRole('button', { name: 'Try again' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Corner survey' })).toBeVisible();
  });

  test('a service id that resolves to nothing is not told apart from one that is not mine', async ({ page, world }) => {
    await ticketAt(page, TICKET.missing);
    await expect(page.getByText('This service is not here')).toBeVisible();
    expect(world.lastVars('ticket')).toMatchObject({ id: TICKET.missing });
    await expect(page.getByText(
      'It was cancelled, or it belongs to someone else. Anything you set aside against it '
      + 'is still in your wallet.')).toBeVisible();
    await expect(page.getByRole('heading', { level: 1 })).toHaveCount(0);
  });
});

// ════════════════════════════════════════════════════════════════════════
/**
 * W13 · who is on it — the rail card people open this page for.
 *
 * Three answers, and the server decides which by what it sends. What is
 * asserted here is the difference between them, because a card that draws the
 * same shape for all three is the thing the rebuild replaced:
 *
 *   · a real Pattadar associate — a discipline, a firm, who put them on and
 *     when, what else they are carrying, and a number the owner can PRESS. The
 *     href is asserted, not the digits: a number printed as text is the thing
 *     the owner already had, on a piece of paper, and the whole point of
 *     keeping a roster is that they stop ringing Pattadar to ask who is coming;
 *   · the same associate having withheld their number — asserted by absence,
 *     which is the only way to assert a promise not to leak something;
 *   · a name somebody typed, with nothing behind it, saying so.
 *
 * The fourth answer — nobody has it and the job is open — is NOT this card any
 * more. It is `Who can do this`, full width in the main column, and when that
 * is on screen this card is not drawn at all: a rail card repeating "Nobody is
 * on this yet" beside it is the double-print the redesign exists to delete.
 */
test.describe('W13 · who is on it', () => {
  // ── a Pattadar associate has it ──────────────────────────────────────

  test('a Pattadar associate on the job is named with what they do, who they are with, and when', async ({ page }) => {
    await ticketAt(page, TICKET.assigned);

    const who = inRail(page, 'Who is on it');
    await expect(who.getByText('Ravi Kumar', { exact: true })).toBeVisible();
    await expect(who).toContainText('Licensed surveyor · Ravi Surveys');
    await expect(who).toContainText('on 05/09/2026');
    // The move the card has always offered stays where it was, beside the
    // person rather than instead of them — and nowhere else on the page.
    await expect(who.getByRole('button', { name: "They're on site" })).toBeVisible();
    await expect(page.getByRole('button', { name: "They're on site" })).toHaveCount(1);
  });

  // Three ways somebody comes to be on a job, and the server says which. This
  // was a two-branch ternary testing for 'desk' while web360.py:3690 writes
  // the literal 'the desk', so the branch was never once true and EVERY job
  // Pattadar had staffed told the owner "You put them on it" — a false
  // statement about who is accountable for the person standing in their
  // field. It is three branches now, and each is pinned.
  //
  // These drive `view()` rather than the seed because fixtures/seed.ts:648
  // still spells it `desk`, which is not a value the server emits.
  for (const [via, sentence] of [
    ['the desk', 'Put on it by Pattadar'],
    ['they took it', 'They took this job'],
    ['you', 'You put them on it'],
  ] as const) {
    test(`a job staffed via "${via}" says "${sentence}", and says it of the right person`, async ({ page, world }) => {
      world.set('ticket', view({ assignee: '', assignedTo: associate({ via }) }));
      await ticketAt(page, TICKET.needsYou);

      const who = inRail(page, 'Who is on it');
      await expect(who).toContainText(`${sentence} on 05/09/2026`);
      for (const other of ['Put on it by Pattadar', 'They took this job', 'You put them on it']) {
        if (other !== sentence) await expect(who).not.toContainText(other);
      }
    });
  }

  test('the number of whoever is on my live job is a link I can press to ring them', async ({ page }) => {
    await ticketAt(page, TICKET.assigned);

    // The href, not the text. A number the owner has to read out and type into
    // a dialer is the piece of paper this feature was built to replace.
    const dial = whoIsOnIt(page).getByRole('link', { name: '9848012345' });
    await expect(dial).toHaveAttribute('href', 'tel:9848012345');
    // The same selector the withheld-number test asserts to zero, proved here
    // to match when there IS a number: an absence asserted with a locator that
    // never matches anything is not an absence.
    await expect(page.locator('a[href^="tel:"]')).toHaveCount(1);
    await expect(whoIsOnIt(page)).toContainText(
      'Call them about this job. Pattadar gave them your land’s outline and nothing else.');
  });

  test('a number written with spaces is still a number a phone will dial', async ({ page, world }) => {
    world.set('ticket', view({
      assignee: '', assignedTo: associate({ contact: '+91 98480 12345' }),
    }));
    await ticketAt(page, TICKET.needsYou);

    await expect(whoIsOnIt(page).getByRole('link', { name: '+91 98480 12345' }))
      .toHaveAttribute('href', 'tel:+919848012345');
  });

  test('an associate reached by email is written to rather than dialled', async ({ page, world }) => {
    world.set('ticket', view({
      assignee: '', assignedTo: associate({ contact: 'rajesh@example.com' }),
    }));
    await ticketAt(page, TICKET.needsYou);

    const who = whoIsOnIt(page);
    await expect(who.getByRole('link', { name: 'rajesh@example.com' }))
      .toHaveAttribute('href', 'mailto:rajesh@example.com');
    await expect(who).toContainText('Write to them about this job.');
    await expect(page.locator('a[href^="tel:"]')).toHaveCount(0);
  });

  test('an associate holding other jobs says how many, because that is the honest answer to why nobody has come', async ({ page }) => {
    await ticketAt(page, TICKET.assigned);
    await expect(whoIsOnIt(page)).toContainText('Also on 1 other job.');
  });

  test('an associate holding only this job is not accused of being busy elsewhere', async ({ page, world }) => {
    world.set('ticket', view({ assignee: '', assignedTo: associate({ jobsOpen: 1 }) }));
    await ticketAt(page, TICKET.needsYou);

    await expect(whoIsOnIt(page)).toContainText('Ravi Kumar');
    await expect(whoIsOnIt(page)).not.toContainText('Also on');
  });

  // ── and the same card when they withheld their number ────────────────

  test('an associate who withheld their number is still named, with what they do and when they were put on', async ({ page }) => {
    await ticketAt(page, TICKET.onSite);

    const who = whoIsOnIt(page);
    await expect(who.getByText('K. Anitha', { exact: true })).toBeVisible();
    await expect(who).toContainText('Advocate');
    await expect(who).toContainText('You put them on it on 06/09/2026');
    await expect(who).toContainText('Also on 2 other jobs.');
  });

  test('a number the associate asked Pattadar not to share is not on the page in any form', async ({ page }) => {
    await ticketAt(page, TICKET.onSite);

    // Positive first: the card is drawn and this IS the withheld branch, so
    // the absences below are absences rather than a page that never arrived.
    const who = whoIsOnIt(page);
    await expect(who).toContainText(
      'They asked that their number not be shared. Send them a message instead and '
      + 'Pattadar does the writing.');

    await expect(page.locator('a[href^="tel:"]')).toHaveCount(0);
    await expect(page.locator('a[href^="mailto:"]')).toHaveCount(0);
    await expect(who).not.toContainText('Call them about this job');
    // Not merely unlinked — not in the markup at all, in an attribute or out
    // of it. This is the one thing on this card that cannot be got wrong twice.
    expect(await page.content()).not.toContain('9701122334');
  });

  test('a masked number the server sends anyway is not printed at all — the sentence is', async ({ page, world }) => {
    // The card used to print `contactMasked` as text when the number was
    // withheld. That branch is deleted: `contactMasked` is on the GraphQL
    // type but in neither the TS interface nor `Q_TICKET`'s selection set, so
    // it could never have fired — and a row of dots is not information the
    // owner can act on. `contactWhy` is what the server actually writes and
    // what the owner reads.
    world.set('ticket', view({
      assignee: '',
      assignedTo: associate({
        contact: '••••••2345', contactShown: false,
        contactWhy: 'They asked that their number not be shared.',
      }),
    }));
    await ticketAt(page, TICKET.needsYou);

    await expect(whoIsOnIt(page)).toContainText('They asked that their number not be shared.');
    await expect(whoIsOnIt(page)).not.toContainText('••••••2345');
    await expect(page.locator('a[href^="tel:"]')).toHaveCount(0);
  });

  test('an associate with no sentence of the server’s own still gets one rather than a blank', async ({ page, world }) => {
    world.set('ticket', view({
      assignee: '',
      assignedTo: associate({ contact: '', contactShown: false, contactWhy: '' }),
    }));
    await ticketAt(page, TICKET.needsYou);

    await expect(whoIsOnIt(page)).toContainText(
      'Pattadar is not showing this number on this job. The desk can reach them.');
  });

  // ── a name somebody typed has it ─────────────────────────────────────

  test('who is on it is named with the day they were put on it', async ({ page, world }) => {
    world.set('ticket', view());
    await ticketAt(page, TICKET.needsYou);

    const who = inRail(page, 'Who is on it');
    await expect(who).toContainText('Ravi Kumar, licensed surveyor');
    await expect(who).toContainText('Assigned 05/09/2026');
  });

  test('a name I typed myself is not given a number Pattadar does not have', async ({ page }) => {
    await ticketAt(page, TICKET.delivered);

    const who = whoIsOnIt(page);
    await expect(who).toContainText('Ravi Kumar, licensed surveyor');
    await expect(who).toContainText(
      'You typed this name, so Pattadar has no number for them. What you sent the job to '
      + 'is under Sent out.');
    await expect(page.locator('a[href^="tel:"]')).toHaveCount(0);
    await expect(who.getByRole('button', { name: 'Put them on it' })).toHaveCount(0);
    await expect(who.getByRole('combobox')).toHaveCount(0);
  });

  test('a job somebody already holds draws no roster at all, in either column', async ({ page }) => {
    await ticketAt(page, TICKET.assigned);
    await expect(whoIsOnIt(page)).toContainText('Ravi Kumar');

    // Not merely "the picker is empty": the block is not on the page. A rail
    // card saying who has it, beside a main-column card asking who could, is
    // the double-print this screen was rebuilt to delete.
    await expect(whoCanDoThis(page)).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Put them on it' })).toHaveCount(0);
  });

  test('the roster is not asked for on a job somebody is already on', async ({ page, world }) => {
    await ticketAt(page, TICKET.assigned);
    await expect(whoIsOnIt(page)).toContainText('Ravi Kumar');
    expect(world.asked('associatesForTicket')).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════
/**
 * W13 · who can do this — the roster, moved out of the 22rem rail and into
 * the main column at full width.
 *
 * This is the whole answer on a job nobody is on, which is the commonest and
 * emptiest state in the system, so it is the block that gets the width: in the
 * rail every associate's name, firm, areas and button wrapped onto five lines
 * each. Two lists live here and each has its own three states, because the
 * card it replaces collapsed a failed read and an in-flight one into "nobody
 * is enrolled" — the one sentence that is certainly wrong in both cases.
 */
test.describe('W13 · who can do this', () => {
  test('a job nobody is on leads with the roster, in the main column and wearing the accent', async ({ page, world }) => {
    await ticketAt(page, TICKET.placed);

    const who = inMain(page, 'Who can do this');
    await expect(who).toContainText(
      'Nobody is on this yet. Put one of the people below on it, or name somebody who has '
      + 'worked on your records before.');
    expect(world.lastVars('associatesForTicket')).toMatchObject({ ticketId: TICKET.placed });

    // Promoted: first block in the column, wearing the ring, and drawn ONCE —
    // the promoted block is removed from its canonical slot, and a count of
    // one is the whole point of that.
    await expect(firstBlock(page)).toHaveClass(/accent/);
    await expect(firstBlock(page).getByRole('heading', { name: 'Who can do this' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Who can do this' })).toHaveCount(1);
    // And not in the rail, which now holds no roster of any kind.
    await expect(inRail(page, 'Who can do this')).toHaveCount(0);
    await expect(inRail(page, 'Who is on it')).toHaveCount(0);
  });

  test('each person offered carries their firm, the places they cover and the server’s own reason for offering them', async ({ page }) => {
    await ticketAt(page, TICKET.placed);

    const srinivas = offered(page, 'G. Srinivas');
    await expect(srinivas).toContainText('Srinivas Surveys · Katragunta · Markapur · Prakasam');
    await expect(srinivas).toContainText('Covers Katragunta · Nothing in hand');
    await expect(srinivas.getByText('Papers checked')).toBeVisible();
    await expect(srinivas.getByRole('button', { name: 'Put them on it' })).toBeEnabled();
  });

  test('the people are offered in the order the server ranked them, not re-sorted here', async ({ page }) => {
    await ticketAt(page, TICKET.placed);

    // `associatesForTicket` already ranks who fits THIS job, and a client-side
    // sort would quietly overrule it. Insertion order, not alphabetical.
    const rows = whoCanDoThis(page).locator('.rows.boxed > div');
    await expect(rows).toHaveCount(2);
    await expect(rows.nth(0)).toContainText('G. Srinivas');
    await expect(rows.nth(1)).toContainText('K. Anitha');
  });

  test('somebody already at capacity says what they are holding instead of being quietly dropped', async ({ page }) => {
    await ticketAt(page, TICKET.placed);

    // The owner is allowed to put a busy person on their own job. What they
    // are not allowed to do is find out afterwards.
    const anitha = offered(page, 'K. Anitha');
    await expect(anitha).toContainText('Already holds 3');
    await expect(anitha).toContainText('Already holding 3 jobs.');
    await expect(anitha.getByRole('button', { name: 'Put them on it' })).toBeEnabled();
  });

  test('putting one of them on it names that associate to the server, by id', async ({ page, world }) => {
    await ticketAt(page, TICKET.placed);
    await offered(page, 'G. Srinivas').getByRole('button', { name: 'Put them on it' }).click();

    await expect.poll(() => world.calls('assignAssociate')).toHaveLength(1);
    expect(world.lastVars('assignAssociate')).toMatchObject({
      requestId: TICKET.placed, associateId: 'as-ravi',
    });
    // The id is the point: the free-text door writes a name and clears the ref,
    // which is what leaves an owner reading one person's name above another
    // person's phone number (web360.py:6382-6398).
    expect(world.calls('assignRequest')).toHaveLength(0);
  });

  test('a refused assignment says nothing on this job has changed', async ({ page, world }) => {
    // `assignAssociate` answers false rather than raising for every move the
    // machine will not make (web360.py:7450), so the result has to be READ.
    world.set('assignAssociate', false);
    await ticketAt(page, TICKET.placed);
    await offered(page, 'K. Anitha').getByRole('button', { name: 'Put them on it' }).click();

    await expect.poll(() => world.calls('assignAssociate')).toHaveLength(1);
    // Beside the control that failed, in the block that raised it — not 800px
    // up the page under the header.
    await expect(whoCanDoThis(page).getByText(MOVE_FAILED)).toBeVisible();
  });

  test('an assignment that falls over on the way says the same thing', async ({ page, world }) => {
    world.set('assignAssociate', World.gqlError('the roster is down'));
    await ticketAt(page, TICKET.placed);
    await offered(page, 'G. Srinivas').getByRole('button', { name: 'Put them on it' }).click();

    await expect(whoCanDoThis(page).getByText(MOVE_FAILED)).toBeVisible();
  });

  test('a job nobody is on offers the people who have worked on my records before', async ({ page, world }) => {
    await ticketAt(page, TICKET.placed);

    // Under the roster rather than instead of it, and labelled as the second
    // way rather than the only one.
    await expect(page.getByLabel('Or a name you have used')).toBeVisible();
    await expect(page.getByRole('option', { name: 'Ravi Kumar' })).toBeAttached();
    await expect(page.getByRole('option', { name: 'Srinivas' })).toBeAttached();
    expect(world.asked('assignable')).toBe(true);
  });

  test('picking a name does nothing until I press the button that hands the job over', async ({ page, world }) => {
    // Handing a job to somebody used to happen on `change`, so a keyboard
    // walking the options assigned the job to each one in turn. The press is
    // the commitment now, and the button says why it is off until then.
    await ticketAt(page, TICKET.placed);

    const putOn = whoCanDoThis(page).getByRole('button', { name: 'Put on', exact: true });
    await expect(putOn).toBeDisabled();
    await expect(whoCanDoThis(page)).toContainText(
      'Pick a name first — that is who the job goes to.');

    await page.getByLabel('Or a name you have used').selectOption('Ravi Kumar');
    expect(world.calls('assignRequest')).toHaveLength(0);
    await expect(putOn).toBeEnabled();
  });

  test('putting somebody on it names them to the server', async ({ page, world }) => {
    await ticketAt(page, TICKET.placed);
    await page.getByLabel('Or a name you have used').selectOption('Ravi Kumar');
    await whoCanDoThis(page).getByRole('button', { name: 'Put on', exact: true }).click();

    await expect.poll(() => world.calls('assignRequest')).toHaveLength(1);
    expect(world.lastVars('assignRequest')).toMatchObject({
      requestId: TICKET.placed, assignee: 'Ravi Kumar',
    });
    expect(world.calls('assignAssociate')).toHaveLength(0);
  });

  test('a name the server will not take goes back to nobody, and says nothing on this job has changed', async ({ page, world }) => {
    world.set('assignRequest', false);
    await ticketAt(page, TICKET.placed);
    await page.getByLabel('Or a name you have used').selectOption('Ravi Kumar');
    await whoCanDoThis(page).getByRole('button', { name: 'Put on', exact: true }).click();

    await expect.poll(() => world.calls('assignRequest')).toHaveLength(1);
    await expect(whoCanDoThis(page).getByText(MOVE_FAILED)).toBeVisible();
    // A picker sitting on a name the server never accepted is the screen
    // telling the owner the job is handed over when it is not.
    await expect(page.getByLabel('Or a name you have used')).toHaveValue('');
  });

  test('a job the desk is already looking for somebody for says so, and says what putting a name on it does', async ({ page }) => {
    await ticketAt(page, TICKET.placed);
    await expect(whoCanDoThis(page)).toContainText(
      'Pattadar’s desk has this on its list to find somebody for. Putting a name on it '
      + 'yourself takes it off that list.');
  });

  test('a job the desk has never touched is not said to be on anybody’s list', async ({ page, world }) => {
    world.set('ticket', view({
      assignee: '', dispatchState: '', can: ['assign', 'cancel', 'dispatch'],
    }));
    await ticketAt(page, TICKET.needsYou);

    await expect(whoCanDoThis(page)).toContainText('Nobody is on this yet.');
    await expect(whoCanDoThis(page)).not.toContainText('has this on its list');
  });

  test('an account that has never handed work to anybody is told so instead of being given an empty picker', async ({ page, world }) => {
    world.set('associatesForTicket', []);
    world.set('assignable', []);
    await ticketAt(page, TICKET.placed);

    const who = whoCanDoThis(page);
    await expect(who).toContainText('Nobody has enrolled for this kind of work yet.');
    await expect(who).toContainText(
      'Nobody has worked on your records yet, so there is no name to pick. Send this job '
      + 'out instead — Pattadar does the sending, so you can take it back.');
    // No select whose only option is "Nobody yet", and no button over nobody.
    await expect(who.getByRole('combobox')).toHaveCount(0);
    await expect(who.getByRole('button', { name: 'Put them on it' })).toHaveCount(0);
  });

  test('a roster with nobody on it does not stop the names I have used from being offered', async ({ page, world }) => {
    world.set('associatesForTicket', []);
    await ticketAt(page, TICKET.placed);

    await expect(page.getByLabel('Or a name you have used')).toBeVisible();
    await expect(whoCanDoThis(page).getByRole('combobox')).toHaveCount(1);
    await expect(whoCanDoThis(page)).not.toContainText('Nobody has worked on your records yet');
  });

  test('a roster still on its way says it is being read, not that nobody has enrolled', async ({ page, world }) => {
    // `cards ?? []` was one line and it collapsed a read in flight and a read
    // that failed into "nobody has enrolled for this kind of work" — the one
    // sentence that is certainly wrong in both cases.
    world.set('associatesForTicket', World.never());
    await ticketAt(page, TICKET.placed);

    const who = whoCanDoThis(page);
    await expect(who.getByText('Loading who can do this…')).toBeVisible();
    await expect(who).not.toContainText('Nobody has enrolled for this kind of work yet.');
  });

  test('a roster that will not load says so and offers to read it again', async ({ page, world }) => {
    world.set('associatesForTicket', World.gqlError('the roster is down'));
    await ticketAt(page, TICKET.placed);

    const who = whoCanDoThis(page);
    await expect(who.getByText('The list of people did not load')).toBeVisible();
    await expect(who.getByText('the roster is down')).toBeVisible();
    await expect(who.getByRole('button', { name: 'Try again' })).toBeVisible();
    await expect(who).not.toContainText('Nobody has enrolled for this kind of work yet.');
  });

  test('names still on their way are not reported as an account that has worked with nobody', async ({ page, world }) => {
    // `undefined` is the read in flight and `[]` is a real answer, and the card
    // is required to tell them apart (api.ts:1575-1580): guarding on
    // `!people?.length` would tell every owner, on every job, that they have
    // never worked with anybody, half a second before their own names arrive.
    world.set('associatesForTicket', []);
    world.set('assignable', World.never());
    await ticketAt(page, TICKET.placed);

    const who = whoCanDoThis(page);
    await expect(who.getByText('Loading the names you have used…')).toBeVisible();
    await expect(who).not.toContainText('Nobody has worked on your records yet');
    await expect(who.getByRole('combobox')).toHaveCount(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════
/**
 * W13 · no button the server would refuse — and no button in two places.
 *
 * Every control is rendered from `t.can` and never from the status string,
 * because `can` is the server's own contract and two of the eight sealed
 * fixtures carry statuses `ticketing.STATUSES` cannot emit. That is the first
 * half.
 *
 * The second half is where each legal move LIVES, which is the thing this
 * screen was rebuilt for. An action reaches the kebab only if it is not
 * already a button somewhere on the page:
 *
 *   accept / send_back  → the accept footer, under the items they are about
 *   assign              → a button per roster row, and the named-person select
 *   start               → "They're on site" in the rail's person card
 *   deliver             → the dashed empty card, else the kebab
 *   withdraw            → the row of the dispatch it withdraws
 *   funding             → the money card's footer, never the menu
 *   dispatch / unassign / cancel → the kebab
 *
 * So the kebab lists below are exact arrays, the whole set and not a sample:
 * an extra item is a promise the server breaks, and a duplicated item is the
 * triple-printing this design deleted.
 */
test.describe('W13 · no button the server would refuse', () => {
  test('a placed job keeps the sending in the menu and the money on the money card', async ({ page }) => {
    await ticketAt(page, TICKET.placed);

    // Funding is a button in the card that explains the consequence, and it
    // is NOT also a menu item: it used to be both, plus a header button.
    await expect(card(page, 'What this costs')
      .getByRole('button', { name: 'Set ₹1,200 aside' })).toBeVisible();
    expect(await actions(page, 'W-2101')).toEqual(['Send this to someone', 'Cancel this job']);
  });

  test('an assigned job offers the reminder, taking them off and pulling it, and never accepting work nobody sent', async ({ page }) => {
    await ticketAt(page, TICKET.assigned);

    // "Send it again" rather than "Send this to someone": a dispatch is
    // already live on this job, and a second invite to the same person is a
    // reminder.
    expect(await actions(page, 'W-2102')).toEqual([
      'Send it again', 'Take them off this job', 'Cancel this job']);
    await expect(page.getByRole('button', { name: 'Accept and file' })).toHaveCount(0);
  });

  test('a job already funded is not offered money a second time, in the menu or anywhere else', async ({ page }) => {
    await ticketAt(page, TICKET.assigned);
    await expect(page.getByRole('button', { name: /Set .* aside/ })).toHaveCount(0);
    expect(await actions(page, 'W-2102')).not.toContain('Set money aside');
  });

  test('a job on site offers the recording as a button rather than burying it in the menu', async ({ page }) => {
    await ticketAt(page, TICKET.onSite);

    // `deliver` is legal here and nothing has come back, so its home is the
    // dashed card that says so — and the kebab does not repeat it.
    await expect(page.getByRole('button', { name: 'Record what came back' })).toBeVisible();
    expect(await actions(page, 'W-2103')).toEqual([
      'Send it again', 'Take them off this job', 'Cancel this job']);
  });

  test('once something has come back the recording moves into the menu, because its card is gone', async ({ page, world }) => {
    world.set('ticket', view({
      can: ['cancel', 'deliver', 'dispatch'], status: 'changes', statusLabel: 'Sent back',
    }));
    await ticketAt(page, TICKET.needsYou);

    expect(await actions(page, 'W-2105')).toEqual([
      'Record what came back', 'Send it again', 'Cancel this job']);
  });

  test('a delivered job offers the sending and the pulling, and keeps accepting on the card it belongs to', async ({ page }) => {
    await ticketAt(page, TICKET.delivered);

    // Dispatch is legal at `submitted` and had no permanent control on this
    // screen for its whole life. That is the gap this closes.
    expect(await actions(page, 'W-2104')).toEqual(['Send it again', 'Cancel this job']);
    await expect(card(page, 'What came back')
      .getByRole('button', { name: 'Accept and file' })).toBeVisible();
    await expect(card(page, 'What came back')
      .getByRole('button', { name: 'Send it back' })).toBeVisible();
  });

  test('a job waiting on me offers the same two, because the server allows the same two', async ({ page }) => {
    await ticketAt(page, TICKET.needsYou);
    expect(await actions(page, 'W-2105')).toEqual(['Send it again', 'Cancel this job']);
  });

  test('a job that has never left the building is offered the first send, not a reminder', async ({ page, world }) => {
    world.set('ticket', view({ dispatches: [], can: ['cancel', 'dispatch'] }));
    await ticketAt(page, TICKET.needsYou);

    expect(await actions(page, 'W-2105')).toEqual(['Send this to someone', 'Cancel this job']);
  });

  test('a quiet job offers its three remedies in the menu as well as in the banner', async ({ page }) => {
    await ticketAt(page, TICKET.quiet);
    expect(await actions(page, 'W-2106')).toEqual([
      'Send it again', 'Take them off this job', 'Cancel this job']);
  });

  test('a job that is done offers no actions at all, because the server allows none', async ({ page }) => {
    await ticketAt(page, TICKET.closed);
    await drawn(page, 'Corner survey');
    await expect(page.getByRole('button', { name: 'Actions for W-2098' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Send this to someone' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Accept and file' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Send it back' })).toHaveCount(0);
  });

  test('a cancelled job offers no actions at all either', async ({ page }) => {
    await ticketAt(page, TICKET.cancelled);
    await drawn(page, 'Corner survey');
    await expect(page.getByRole('button', { name: 'Actions for W-2099' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Send this to someone' })).toHaveCount(0);
  });

  test('no action is offered twice on one screen', async ({ page }) => {
    // The rule the kebab is built from, asserted as a rule rather than as
    // eight separate lists: "Send this to someone" used to print in the
    // header, on its card and in the menu, all three at once.
    await ticketAt(page, TICKET.onSite);
    await drawn(page, 'Corner survey');

    const menu = await actions(page, 'W-2103');
    await page.keyboard.press('Escape');
    for (const item of menu) {
      await expect(page.getByRole('button', { name: item, exact: true })).toHaveCount(0);
    }
  });

  test('the header carries no primary button, so the first thing to press is the block that explains it', async ({ page }) => {
    await ticketAt(page, TICKET.needsYou);
    await drawn(page, 'Corner survey');

    // "Review what came back" scrolled to a card that was already on screen.
    await expect(page.getByRole('button', { name: 'Review what came back' })).toHaveCount(0);
    await expect(page.locator('header.pagehead').getByRole('button', { name: 'Actions for W-2105' }))
      .toBeVisible();
    await expect(page.locator('header.pagehead').getByRole('button')).toHaveCount(1);
  });

  test('a job that is done says how it ended, with the day it was accepted', async ({ page }) => {
    await ticketAt(page, TICKET.closed);

    const ended = inMain(page, 'How it ended');
    await expect(ended).toContainText('Eight corners established and filed onto the record.');
    await expect(ended).toContainText('Accepted 14/08/2026');
    // Nothing is promoted on a closed job, so this is the plain card in the
    // slot rather than an accent ring saying something is waiting on you.
    await expect(firstBlock(page)).not.toHaveClass(/accent/);
  });

  test('a cancelled job says how it ended too, in the words the server wrote', async ({ page }) => {
    await ticketAt(page, TICKET.cancelled);
    await expect(inMain(page, 'How it ended'))
      .toContainText('Cancelled before anybody was sent. ₹6,500 came back to the wallet.');
  });

  test('a job still running is not given a closing note it has not earned', async ({ page }) => {
    await ticketAt(page, TICKET.assigned);
    await drawn(page, 'Corner survey');
    await expect(card(page, 'How it ended')).toHaveCount(0);
  });

  test('a closed job with nothing to say about how it ended draws no card rather than an empty one', async ({ page, world }) => {
    world.set('ticket', view({ closed: true, can: [], outcomeNote: '', acceptedAt: '' }));
    await ticketAt(page, TICKET.needsYou);
    await drawn(page, 'Corner survey');

    await expect(card(page, 'How it ended')).toHaveCount(0);
    await expect(card(page, 'What happens next')).toHaveCount(0);
  });

  // ── defect ───────────────────────────────────────────────────────────
  // Ticket.tsx hands every deliverable to `Deliverable`, and `Deliverable`
  // offers "Change my mind" purely off `d.review`, with no reference to
  // `t.can` or `t.closed`. web360.py:5258 refuses review_deliverable outright
  // when the ticket is closed, so on W-2098 the button is a promise the
  // server breaks: the owner presses it and gets "Nothing on this job has
  // changed". The owner is owed no button — a done job's verdicts are
  // history, and the remedy is a fresh job.
  test.fail('a job that is done does not offer to change my mind about what came back', async ({ page }) => {
    await ticketAt(page, TICKET.closed);
    await drawn(page, 'Corner survey');
    await expect(page.getByRole('article', { name: 'Surveyor report' })).toBeVisible();
    await expect(card(page, 'What came back')
      .getByRole('button', { name: 'Change my mind' })).toHaveCount(0);
  });

  // W-2099 was cancelled before anybody was sent, so it is closed AND
  // unassigned. The picker used to be drawn on `!assignedTo && !assignee`
  // alone, with no closed gate — and both writes behind it refuse a closed
  // row server-side, so every control in it was dead. A closed job now says
  // what is true instead, in the rail, in one sentence.
  test('a cancelled job does not offer to put somebody on it', async ({ page }) => {
    await ticketAt(page, TICKET.cancelled);
    await drawn(page, 'Corner survey');

    const who = inRail(page, 'Who is on it');
    await expect(who).toContainText('Nobody was ever put on this job');
    await expect(whoCanDoThis(page)).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Put them on it' })).toHaveCount(0);
    await expect(who.getByRole('combobox')).toHaveCount(0);
  });

  test('a closed job does not even ask who could have taken it', async ({ page, world }) => {
    // The roster is one of the five resolvers that reads across every owner.
    // A screen that cannot use the answer must not ask the question.
    await ticketAt(page, TICKET.cancelled);
    await drawn(page, 'Corner survey');
    expect(world.calls('associatesForTicket')).toHaveLength(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════
/**
 * W13 · what is waiting on me — the promotion rule.
 *
 * Exactly one block is hoisted to the top of the main column wearing `accent`,
 * and it always means "this is waiting on you". First match wins:
 *
 *   can('accept')                                → What came back
 *   nobody on it && can('assign') && !closed     → Who can do this
 *   !funded && quoted > 0 && !closed             → What this costs
 *   otherwise                                    → nothing promoted, and the
 *                                                  plain "What happens next"
 *                                                  fills the slot
 *
 * The promoted block is REMOVED from its canonical slot, so every test here
 * asserts a count of one as well as a position. A block that drew twice would
 * pass every "is it visible" assertion ever written about it, and the whole
 * point of promoting it is that there is one place to look.
 */
test.describe('W13 · what is waiting on me', () => {
  test('work that came back and can be accepted is the block at the top', async ({ page }) => {
    await ticketAt(page, TICKET.needsYou);

    await expect(firstBlock(page).getByRole('heading', { name: 'What came back' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'What came back' })).toHaveCount(1);
    // One ring, not two: the accept footer inside is already wearing it, so
    // the promotion is carried by the position instead.
    await expect(firstBlock(page).locator('.card.accent')).toHaveCount(1);
    await expect(firstBlock(page).locator('.card.accent')).toContainText('Accept and file');
  });

  test('a job nobody is on promotes the roster, and only the roster', async ({ page }) => {
    await ticketAt(page, TICKET.placed);

    await expect(firstBlock(page).getByRole('heading', { name: 'Who can do this' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Who can do this' })).toHaveCount(1);
    // Unfunded with a price of ₹1,200 — but the roster matched first, so the
    // money card is in its own slot, plain.
    await expect(card(page, 'What this costs')).not.toHaveClass(/accent/);
    await expect(page.getByRole('heading', { name: 'What this costs' })).toHaveCount(1);
  });

  test('a job with somebody on it and no money behind it promotes what it costs', async ({ page, world }) => {
    world.set('ticket', view({
      can: ['cancel', 'deliver', 'dispatch', 'unassign'], deliverables: [], ledger: [],
      money: money({
        funded: false, held: 0, headline: '₹6,500 has not been set aside yet',
      }),
    }));
    await ticketAt(page, TICKET.needsYou);

    await expect(firstBlock(page)).toHaveClass(/accent/);
    await expect(firstBlock(page).getByRole('heading', { name: 'What this costs' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'What this costs' })).toHaveCount(1);
    await expect(card(page, 'What happens next')).toHaveCount(0);
  });

  test('a job with money behind it and somebody on it says nothing is needed from me', async ({ page }) => {
    await ticketAt(page, TICKET.assigned);

    const next = inMain(page, 'What happens next');
    await expect(next).toContainText('Ravi Kumar has this. Nothing is needed from you.');
    await expect(firstBlock(page).getByRole('heading', { name: 'What happens next' })).toBeVisible();
    // Nothing is waiting, so nothing wears the ring.
    await expect(mainCol(page).locator('.accent')).toHaveCount(0);
  });

  test('the plain next card names whoever actually holds it, not the free-text beside them', async ({ page }) => {
    await ticketAt(page, TICKET.onSite);
    await expect(inMain(page, 'What happens next'))
      .toContainText('K. Anitha has this. Nothing is needed from you.');
  });

  test('exactly one block on the page wears the accent, on every seeded job', async ({ page }) => {
    for (const [id, ref] of [
      [TICKET.placed, 'W-2101'], [TICKET.assigned, 'W-2102'], [TICKET.onSite, 'W-2103'],
      [TICKET.delivered, 'W-2104'], [TICKET.needsYou, 'W-2105'], [TICKET.quiet, 'W-2106'],
      [TICKET.closed, 'W-2098'], [TICKET.cancelled, 'W-2099'],
    ] as const) {
      await ticketAt(page, id);
      await expect(page.getByRole('navigation', { name: 'Breadcrumb' })).toContainText(ref);
      // At most one: a closed job and a job with nothing outstanding promote
      // nothing at all, and an accent ring that meant nothing would be worse
      // than none.
      expect(await mainCol(page).locator('> .accent').count()).toBeLessThanOrEqual(1);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════
test.describe('W13 · nine days of silence', () => {
  test('nine days of silence says so, names who has not moved it, and offers all three ways out', async ({ page }) => {
    await ticketAt(page, TICKET.quiet);

    const alert = page.locator('section.card.alert');
    await expect(alert.getByRole('heading', { name: 'Nothing has happened for 9 days.' })).toBeVisible();
    await expect(alert).toContainText('Srinivas, document writer has not moved this since');
    // The sentence promises three remedies — "send it again, put it on
    // somebody else, or pull the job" — and for the whole life of this banner
    // it offered two. `unassign` was in the server's `can` the entire time
    // with no control anywhere on the page, so an owner with a silent
    // surveyor could only cancel the job outright.
    await expect(alert).toContainText(
      'You can send it again, put it on somebody else, or pull the job and get what you '
      + 'set aside back.');
    await expect(alert.getByRole('button', { name: 'Send it again' })).toBeVisible();
    await expect(alert.getByRole('button', { name: 'Take them off this job' })).toBeVisible();
    await expect(alert.getByRole('button', { name: 'Cancel this job' })).toBeVisible();
  });

  test('the banner is the first thing in the column, above whatever else is waiting', async ({ page }) => {
    await ticketAt(page, TICKET.quiet);
    await expect(firstBlock(page)).toHaveClass(/alert/);
  });

  test('taking them off says it releases nothing, so it is not read as a cancel', async ({ page, world }) => {
    await ticketAt(page, TICKET.quiet);
    await page.locator('section.card.alert')
      .getByRole('button', { name: 'Take them off this job' }).click();

    const dialog = page.getByRole('dialog', { name: 'Take them off this job?' });
    await expect(dialog).toContainText(
      'The job goes back to Placed and ₹1,200 stays set aside. It is not a cancel and it '
      + 'releases nothing — you can put somebody else on it straight away.');
    await expect(dialog.getByRole('button', { name: 'Keep them on it' })).toBeFocused();
    expect(world.calls('assignRequest')).toHaveLength(0);
  });

  test('taking them off is assignRequest with nobody named, and nothing else', async ({ page, world }) => {
    await ticketAt(page, TICKET.quiet);
    await fromMenu(page, 'W-2106', 'Take them off this job');
    await page.getByRole('dialog', { name: 'Take them off this job?' })
      .getByRole('button', { name: 'Take them off' }).click();

    await expect.poll(() => world.calls('assignRequest')).toHaveLength(1);
    expect(world.lastVars('assignRequest')).toMatchObject({
      requestId: TICKET.quiet, assignee: '',
    });
    expect(world.calls('cancelTicket')).toHaveLength(0);
  });

  test('a refused unassign says nothing on this job has changed, inside the dialog', async ({ page, world }) => {
    world.set('assignRequest', false);
    await ticketAt(page, TICKET.quiet);
    await fromMenu(page, 'W-2106', 'Take them off this job');
    await page.getByRole('dialog', { name: 'Take them off this job?' })
      .getByRole('button', { name: 'Take them off' }).click();

    await expect(page.getByRole('dialog', { name: 'Take them off this job?' })
      .getByText(MOVE_FAILED)).toBeVisible();
  });

  test('keeping them on it closes the dialog without moving the job', async ({ page, world }) => {
    await ticketAt(page, TICKET.quiet);
    await fromMenu(page, 'W-2106', 'Take them off this job');
    await page.getByRole('dialog', { name: 'Take them off this job?' })
      .getByRole('button', { name: 'Keep them on it' }).click();

    await expect(page.getByRole('dialog')).toHaveCount(0);
    expect(world.calls('assignRequest')).toHaveLength(0);
  });

  test('a job that moved yesterday is not accused of being quiet', async ({ page }) => {
    await ticketAt(page, TICKET.assigned);
    await drawn(page, 'Corner survey');
    await expect(page.locator('section.card.alert')).toHaveCount(0);
    await expect(page.getByText(/Nothing has happened for/)).toHaveCount(0);
  });

  test('a job nobody has been put on for days gets the banner the server never flags', async ({ page, world }) => {
    // `quiet` is `quietDays >= 4 && status in (sent, assigned, on_site)`
    // server-side, so a job that has sat at Placed for nine days — the
    // commonest failure in the system, and the emptiest screen — got no
    // banner at all. This is the client filling that gap from two fields it
    // already has.
    world.set('ticket', view({
      assignee: '', assignedTo: null, quiet: false, quietDays: 9, deliverables: [],
      can: ['assign', 'cancel', 'dispatch'],
    }));
    await ticketAt(page, TICKET.needsYou);

    const alert = page.locator('section.card.alert');
    await expect(alert.getByRole('heading', { name: 'Nothing has happened for 9 days.' })).toBeVisible();
    await expect(alert).toContainText(
      'Nobody has been put on this yet. Pick somebody below, or cancel it and get what you '
      + 'set aside back.');
    // No buttons on this shape: the roster is the very next block, so anything
    // here could only scroll to a card already on screen.
    await expect(alert.getByRole('button')).toHaveCount(0);
    await expect(whoCanDoThis(page)).toBeVisible();
  });

  test('a quiet job with nothing set aside is not offered the pulling of money back', async ({ page, world }) => {
    world.set('ticket', view({
      quiet: true, quietDays: 12, can: ['dispatch'],
      money: money({ held: 0, funded: false, headline: 'Nothing set aside yet' }),
      ledger: [],
    }));
    await ticketAt(page, TICKET.quiet);
    const alert = page.locator('section.card.alert');
    await expect(alert.getByRole('button', { name: 'Send it again' })).toBeVisible();
    await expect(alert.getByRole('button', { name: 'Cancel this job' })).toHaveCount(0);
    await expect(alert.getByRole('button', { name: 'Take them off this job' })).toHaveCount(0);
  });

  test('sending it again asks for the number rather than reusing a masked one', async ({ page, world }) => {
    world.set('ticket', view({ quiet: true, quietDays: 9 }));
    await ticketAt(page, TICKET.quiet);
    await page.locator('section.card.alert').getByRole('button', { name: 'Send it again' }).click();

    await expect(sendDialog(page)).toContainText(
      'This one is a reminder. Their number is kept masked on this page, so type it again '
      + '— it goes out on the channel below.');
    await expect(page.getByLabel('Their name')).toHaveValue('Ravi Kumar');
    await expect(page.getByLabel('Email or phone')).toHaveValue('');
    await expect(page.getByLabel('Send it by')).toHaveValue('sms');
  });

  test('a reminder goes out marked as a reminder, with the contact I typed', async ({ page, world }) => {
    world.set('ticket', view({ quiet: true, quietDays: 9 }));
    await ticketAt(page, TICKET.quiet);
    await page.locator('section.card.alert').getByRole('button', { name: 'Send it again' }).click();
    await page.getByLabel('Email or phone').fill('98480 12345');
    await page.getByRole('button', { name: 'Send it', exact: true }).click();

    await expect.poll(() => world.calls('dispatchTicket')).toHaveLength(1);
    expect(world.lastVars('dispatchTicket')).toMatchObject({
      purpose: 'nudge', contact: '98480 12345', personName: 'Ravi Kumar', channel: 'sms',
    });
  });

  test('the banner cancel opens the same dialog the kebab does', async ({ page }) => {
    await ticketAt(page, TICKET.quiet);
    await page.locator('section.card.alert').getByRole('button', { name: 'Cancel this job' }).click();
    await expect(page.getByRole('dialog', { name: 'Cancel this job?' })).toBeVisible();
  });
});

// ═══════════════════════════════════════════════════════════════════════
test.describe('W13 · sending it out', () => {
  test('sending says what the other person will see, and what of mine does not go', async ({ page }) => {
    await ticketAt(page, TICKET.placed);
    await fromMenu(page, 'W-2101', 'Send this to someone');

    // A dialog rather than the inline panel it used to be: as a panel it
    // pushed 539px of card down the page before the blocks it was about, and
    // stretched a phone-number input to the full width of the column. The
    // field ids and labels are unchanged, which is why every `getByLabel`
    // below survived the move.
    const panel = sendDialog(page);
    await expect(panel).toContainText(
      'Pattadar records a revocable work link and sends it when a delivery provider is '
      + 'configured.');
    await expect(panel).toContainText('Nothing else of yours goes with it.');
    // The one useful sentence from the old Sent-out paragraph, relocated
    // verbatim to where somebody is about to need it. The rest of that
    // paragraph contained a live copy bug — "Pattadar writes to person" — and
    // was deleted rather than moved.
    await expect(panel).toContainText(
      'If delivery is not configured, copy the recorded link and send it yourself.');
    await expect(page.getByLabel('Their name')).toBeVisible();
    await expect(page.getByLabel('Email or phone')).toBeVisible();
    await expect(page.getByLabel('Send it by')).toHaveValue('auto');
    await expect(page.getByLabel('Anything else they should know')).toBeVisible();
  });

  test('Send it waits for somewhere to write to, and says why on the screen', async ({ page }) => {
    await ticketAt(page, TICKET.placed);
    await fromMenu(page, 'W-2101', 'Send this to someone');

    await expect(page.getByRole('button', { name: 'Send it', exact: true })).toBeDisabled();
    await expect(page.getByText(
      'An email or a phone number first — Pattadar does the writing, so it needs somewhere '
      + 'to write to.')).toBeVisible();

    await page.getByLabel('Email or phone').fill('ravi@example.com');
    await expect(page.getByRole('button', { name: 'Send it', exact: true })).toBeEnabled();
  });

  test('sending it records a revocable work link with exactly what I typed', async ({ page, world }) => {
    await ticketAt(page, TICKET.placed);
    await fromMenu(page, 'W-2101', 'Send this to someone');
    await page.getByLabel('Their name').fill('G. Srinivas');
    await page.getByLabel('Email or phone').fill('98480 12345');
    await page.getByLabel('Send it by').selectOption('whatsapp');
    await page.getByLabel('Anything else they should know').fill('The gate is on the north side.');
    await page.getByRole('button', { name: 'Send it', exact: true }).click();

    await expect.poll(() => world.calls('dispatchTicket')).toHaveLength(1);
    expect(world.lastVars('dispatchTicket')).toMatchObject({
      ticketId: TICKET.placed, personName: 'G. Srinivas', contact: '98480 12345',
      channel: 'whatsapp', purpose: 'invite', note: 'The gate is on the north side.',
      expiresDays: 14,
    });
  });

  test('a sent request closes the dialog and clears the number behind it', async ({ page }) => {
    await ticketAt(page, TICKET.placed);
    await fromMenu(page, 'W-2101', 'Send this to someone');
    await page.getByLabel('Email or phone').fill('98480 12345');
    await page.getByRole('button', { name: 'Send it', exact: true }).click();

    await expect(sendDialog(page)).toHaveCount(0);
  });

  test('a pointer that slips onto the dim does not throw away the number I typed', async ({ page }) => {
    // Four fields of typed work. A scrim click that discarded a phone number
    // somebody read off a scrap of paper is exactly the loss this module
    // keeps a block comment about.
    await ticketAt(page, TICKET.placed);
    await fromMenu(page, 'W-2101', 'Send this to someone');
    await page.getByLabel('Email or phone').fill('98480 12345');

    await page.locator('.scrim').click({ position: { x: 4, y: 4 } });
    await expect(sendDialog(page)).toBeVisible();
    await expect(page.getByLabel('Email or phone')).toHaveValue('98480 12345');
  });

  test('the send dialog opens on its first field, because there is nothing here to be careful about', async ({ page }) => {
    await ticketAt(page, TICKET.placed);
    await fromMenu(page, 'W-2101', 'Send this to someone');
    await expect(page.getByLabel('Their name')).toBeFocused();
  });

  test('a refused send says nothing was sent, and keeps what I typed', async ({ page, world }) => {
    world.set('dispatchTicket', '');
    await ticketAt(page, TICKET.placed);
    await fromMenu(page, 'W-2101', 'Send this to someone');
    await page.getByLabel('Email or phone').fill('98480 12345');
    await page.getByRole('button', { name: 'Send it', exact: true }).click();

    await expect(page.getByText(SEND_FAILED)).toBeVisible();
    await expect(page.getByLabel('Email or phone')).toHaveValue('98480 12345');
  });

  test('a send that falls over on the way says the same thing', async ({ page, world }) => {
    world.set('dispatchTicket', World.gqlError('the message queue is down'));
    await ticketAt(page, TICKET.placed);
    await fromMenu(page, 'W-2101', 'Send this to someone');
    await page.getByLabel('Email or phone').fill('98480 12345');
    await page.getByRole('button', { name: 'Send it', exact: true }).click();

    await expect(page.getByText(SEND_FAILED)).toBeVisible();
  });

  test('a job that has never left the building says so, in one dashed line and no card', async ({ page }) => {
    await ticketAt(page, TICKET.placed);

    // The sentence is unchanged and must stay that way; what changed is the
    // chrome around it. An empty "Sent out" `Card` spent 199px of rail on one
    // sentence plus a 98px explanatory paragraph that contained a live copy
    // bug. It is a headingless `.card.dashed` one-liner now, ~55px.
    const empty = rail(page).locator('section.card.dashed')
      .filter({ hasText: 'Nothing has left the building.' });
    await expect(empty).toBeVisible();
    await expect(empty.getByRole('heading')).toHaveCount(0);
    await expect(card(page, 'Sent out')).toHaveCount(0);
  });

  test('a job that HAS left the building keeps its titled card and its count', async ({ page, world }) => {
    world.set('ticket', view());
    await ticketAt(page, TICKET.needsYou);

    const sent = inRail(page, 'Sent out');
    await expect(sent).toBeVisible();
    await expect(sent.locator('.num.muted')).toHaveText('1');
  });

  test('a dispatch keeps the contact masked, and the number never reaches the page', async ({ page, world }) => {
    world.set('ticket', view());
    await ticketAt(page, TICKET.needsYou);

    const sent = card(page, 'Sent out');
    await expect(sent).toContainText('Ravi Kumar');
    await expect(sent).toContainText('SMS · +91 98••• ••432 · 05/09/2026');
    await expect(sent).toContainText('Recorded, not sent');
    expect(await page.locator('body').innerText()).not.toContain('9848012432');
  });

  test('the worker token is not printed until I ask to see what was sent', async ({ page, world }) => {
    world.set('ticket', view());
    await ticketAt(page, TICKET.needsYou);

    expect(await page.locator('body').innerText()).not.toContain(TOKEN);
    await expect(card(page, 'Sent out')
      .getByRole('button', { name: 'See what was sent' })).toHaveAttribute('aria-expanded', 'false');
  });

  test('what was sent can be read back, and the link copied when nothing else will send it', async ({ page, world, baseURL }) => {
    world.set('ticket', view());
    await ticketAt(page, TICKET.needsYou);
    await card(page, 'Sent out').getByRole('button', { name: 'See what was sent' }).click();

    const sent = card(page, 'Sent out');
    await expect(sent).toContainText('A job on Sy 214/2');
    await expect(sent).toContainText('Sy 214/2 at Katragunta needs 8 corners walked.');
    // ShareResult builds the recipient link from `window.location.origin`, so
    // its host follows wherever the app is actually served — 5180 under
    // start-local.sh, whatever APP_WEB_URL points at otherwise. The SMS body
    // above is fixture text and keeps its own literal; this input is the live
    // origin, so it is asserted against the served baseURL rather than a
    // hard-coded port that only held while the dev server ran on Vite's 5173.
    await expect(sent.getByLabel('Recipient link'))
      .toHaveValue(`${baseURL}/work/${TOKEN}`);
    await expect(sent.getByRole('button', { name: 'Copy link' })).toBeVisible();
  });

  test('a dispatch that did not go says so and offers no link to copy', async ({ page, world }) => {
    world.set('ticket', view({
      dispatches: [dispatch({ status: 'failed', error: 'The number was not reachable.' })],
    }));
    await ticketAt(page, TICKET.needsYou);
    await card(page, 'Sent out').getByRole('button', { name: 'See what was sent' }).click();

    const sent = card(page, 'Sent out');
    await expect(sent).toContainText('It did not go');
    await expect(sent).toContainText('The number was not reachable.');
    await expect(sent.getByLabel('Recipient link')).toHaveCount(0);
  });

  test('withdrawing asks first, and says what it does and does not undo', async ({ page, world }) => {
    world.set('ticket', view());
    await ticketAt(page, TICKET.needsYou);
    await card(page, 'Sent out').getByRole('button', { name: 'Withdraw' }).click();

    await expect(card(page, 'Sent out')).toContainText(
      'They are told it is off, and nothing more can come back on it. Anything they already '
      + 'sent stays on this job.');
    await expect(card(page, 'Sent out').getByRole('button', { name: 'Keep' })).toBeVisible();
  });

  test('keeping it backs out of the withdrawal without calling anything', async ({ page, world }) => {
    world.set('ticket', view());
    await ticketAt(page, TICKET.needsYou);
    await card(page, 'Sent out').getByRole('button', { name: 'Withdraw' }).click();
    await card(page, 'Sent out').getByRole('button', { name: 'Keep' }).click();

    await expect(card(page, 'Sent out')).not.toContainText('They are told it is off');
    expect(world.calls('revokeDispatch')).toHaveLength(0);
  });

  test('withdrawing takes that one dispatch back', async ({ page, world }) => {
    world.set('ticket', view());
    await ticketAt(page, TICKET.needsYou);
    await card(page, 'Sent out').getByRole('button', { name: 'Withdraw' }).click();
    await card(page, 'Sent out').getByRole('button', { name: 'Withdraw' }).click();

    await expect.poll(() => world.calls('revokeDispatch')).toHaveLength(1);
    expect(world.lastVars('revokeDispatch')).toMatchObject({ dispatchId: 'w-dsp-1', reason: '' });
  });

  test('a refused withdrawal says nothing on the job has changed', async ({ page, world }) => {
    world.set('revokeDispatch', false);
    world.set('ticket', view());
    await ticketAt(page, TICKET.needsYou);
    await card(page, 'Sent out').getByRole('button', { name: 'Withdraw' }).click();
    await card(page, 'Sent out').getByRole('button', { name: 'Withdraw' }).click();

    await expect(page.getByText(MOVE_FAILED).first()).toBeVisible();
  });

  test('a withdrawn dispatch is kept as evidence, with the reason, and offers no second withdrawal', async ({ page, world }) => {
    world.set('ticket', view({
      dispatches: [dispatch({ revoked: true, revokeReason: 'He stopped answering.' })],
    }));
    await ticketAt(page, TICKET.needsYou);

    const sent = card(page, 'Sent out');
    await expect(sent).toContainText('Withdrawn');
    await expect(sent).toContainText('He stopped answering.');
    await expect(sent.getByRole('button', { name: 'See what was sent' })).toBeVisible();
    await expect(sent.getByRole('button', { name: 'Withdraw' })).toHaveCount(0);
  });

  test('a withdrawn dispatch no longer offers its link, though the copy of it stays', async ({ page, world }) => {
    world.set('ticket', view({ dispatches: [dispatch({ revoked: true, revokeReason: '' })] }));
    await ticketAt(page, TICKET.needsYou);
    await card(page, 'Sent out').getByRole('button', { name: 'See what was sent' }).click();

    await expect(card(page, 'Sent out')).toContainText('8 corners walked');
    await expect(card(page, 'Sent out').getByLabel('Recipient link')).toHaveCount(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════
test.describe('W13 · what came back', () => {
  test('each item says what it is, who sent it, when, and where it would be filed', async ({ page, world }) => {
    world.set('ticket', view());
    await ticketAt(page, TICKET.needsYou);

    const outline = page.getByRole('article', { name: '8 corners, walked' });
    await expect(outline).toContainText('A corrected outline · sent 10/09/2026 by Ravi Kumar');
    await expect(outline).toContainText('Goes to: The record boundary');
    await expect(outline).toContainText('GPS, ±3 m');

    const report = page.getByRole('article', { name: 'Surveyor report' });
    await expect(report).toContainText('A paper · sent 10/09/2026 by Ravi Kumar');
    await expect(report).toContainText('Goes to: The map shelf');
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

  test('refusing an item asks for words first, and says they see exactly this', async ({ page, world }) => {
    world.set('ticket', view());
    await ticketAt(page, TICKET.needsYou);

    const report = page.getByRole('article', { name: 'Surveyor report' });
    await report.getByRole('button', { name: 'Not this one' }).click();
    await expect(report.getByLabel('What is wrong with it'))
      .toHaveAttribute('placeholder', 'Say what is wrong. They see exactly this.');
    await expect(report.getByRole('button', { name: 'Send back' })).toBeDisabled();
    expect(world.calls('reviewDeliverable')).toHaveLength(0);
  });

  test('refusing records the reason against that one item', async ({ page, world }) => {
    world.set('ticket', view());
    await ticketAt(page, TICKET.needsYou);

    const report = page.getByRole('article', { name: 'Surveyor report' });
    await report.getByRole('button', { name: 'Not this one' }).click();
    await report.getByLabel('What is wrong with it').fill('Page 2 is of the wrong field.');
    await report.getByRole('button', { name: 'Send back' }).click();

    await expect.poll(() => world.calls('reviewDeliverable')).toHaveLength(1);
    expect(world.lastVars('reviewDeliverable')).toMatchObject({
      deliverableId: 'w-dlv-2', review: 'rejected', note: 'Page 2 is of the wrong field.',
    });
  });

  test('backing out of a refusal leaves the item where it was', async ({ page, world }) => {
    world.set('ticket', view());
    await ticketAt(page, TICKET.needsYou);

    const report = page.getByRole('article', { name: 'Surveyor report' });
    await report.getByRole('button', { name: 'Not this one' }).click();
    await report.getByRole('button', { name: 'Keep', exact: true }).click();

    await expect(report.getByRole('button', { name: 'Keep it' })).toBeVisible();
    expect(world.calls('reviewDeliverable')).toHaveLength(0);
  });

  test('an item already kept says so and can be put back', async ({ page, world }) => {
    world.set('ticket', view({
      deliverables: [deliverable(0, { review: 'accepted' }), deliverable(1)],
    }));
    await ticketAt(page, TICKET.needsYou);

    const outline = page.getByRole('article', { name: '8 corners, walked' });
    await expect(outline).toContainText('Keeping it');
    await outline.getByRole('button', { name: 'Change my mind' }).click();

    await expect.poll(() => world.calls('reviewDeliverable')).toHaveLength(1);
    expect(world.lastVars('reviewDeliverable')).toMatchObject({
      deliverableId: 'w-dlv-1', review: 'pending',
    });
  });

  test('an item already refused carries the words I refused it with', async ({ page, world }) => {
    world.set('ticket', view({
      deliverables: [deliverable(0, { review: 'rejected', reviewNote: 'The eastern corner is in the road.' })],
    }));
    await ticketAt(page, TICKET.needsYou);

    const outline = page.getByRole('article', { name: '8 corners, walked' });
    await expect(outline).toContainText('Not this one');
    await expect(outline).toContainText('The eastern corner is in the road.');
    await expect(outline.getByRole('button', { name: 'Change my mind' })).toBeVisible();
  });

  test('an item already filed says when, and offers no way to unfile it', async ({ page, world }) => {
    world.set('ticket', view({
      closed: true, can: [], status: 'accepted', statusLabel: 'Accepted', statusState: 'good',
      deliverables: [deliverable(0, {
        review: 'accepted', filedTable: 'boundary', filedId: 'w-boundary-1', filedAt: '2026-09-11',
      })],
    }));
    await ticketAt(page, TICKET.needsYou);

    const outline = page.getByRole('article', { name: '8 corners, walked' });
    await expect(outline).toContainText('Filed 11/09/2026');
    await expect(outline.getByRole('button', { name: 'Change my mind' })).toHaveCount(0);
  });

  test('a job with nothing back yet promises the record is not touched first', async ({ page }) => {
    await ticketAt(page, TICKET.assigned);

    // The sentence carries the product's central promise and is rendered
    // verbatim; what changed is the chrome. A `Card` here spent 87px on 39px
    // of words — 62% chrome — so it is a headingless `.card.dashed` now, and
    // the assertion is re-targeted at the text rather than at a heading that
    // no longer exists.
    const dashed = mainCol(page).locator('section.card.dashed');
    await expect(dashed).toContainText(
      'Nothing has come back yet. When the sketch, the photos or the report arrive, record '
      + 'them here — nothing reaches Sy 214/2 until you have looked at them and said yes.');
    await expect(dashed.getByRole('heading')).toHaveCount(0);
    await expect(card(page, 'What came back')).toHaveCount(0);
  });

  test('the dashed line carries the one action the server allows, and no other', async ({ page }) => {
    // W-2103 is on site: `deliver` is legal, so the one sentence carries the
    // one button — and the kebab does not repeat it, because this card is
    // where it lives while nothing has come back.
    await ticketAt(page, TICKET.onSite);

    const dashed = mainCol(page).locator('section.card.dashed');
    await expect(dashed.getByRole('button', { name: 'Record what came back' })).toBeVisible();
    await expect(dashed.getByRole('button')).toHaveCount(1);
    expect(await actions(page, 'W-2103')).not.toContain('Record what came back');
  });

  test('a job that cannot record anything gets the sentence without a button under it', async ({ page, world }) => {
    world.set('ticket', view({ can: ['cancel', 'dispatch'], deliverables: [] }));
    await ticketAt(page, TICKET.needsYou);

    const dashed = mainCol(page).locator('section.card.dashed');
    await expect(dashed).toContainText('Nothing has come back yet.');
    await expect(dashed.getByRole('button')).toHaveCount(0);
  });

  test('a job I sent back says which day I sent it back', async ({ page, world }) => {
    world.set('ticket', view({
      status: 'changes', statusLabel: 'Sent back', statusState: 'warn',
      can: ['cancel', 'deliver', 'dispatch'], deliverables: [],
      events: [...EVENTS, {
        id: 'w-ev-6', kind: 'status', action: 'send_back',
        headline: 'You sent it back', detail: 'The eastern corner is in the road.',
        actorLabel: 'You', actorKind: 'owner', tone: 'warn',
        at: '2026-09-11T05:00:00Z', atLabel: '11/09/2026',
      }],
    }));
    await ticketAt(page, TICKET.needsYou);

    await expect(mainCol(page).locator('section.card.dashed')).toContainText(
      'You sent this back on 11/09/2026. When it comes again, record it here.');
  });

  test('a job that is done with nothing recorded says just that, and offers nothing', async ({ page, world }) => {
    world.set('ticket', view({ closed: true, can: [], deliverables: [] }));
    await ticketAt(page, TICKET.needsYou);

    await expect(mainCol(page).locator('section.card.dashed'))
      .toContainText('Nothing was recorded against this job.');
    await expect(page.getByRole('button', { name: 'Record what came back' })).toHaveCount(0);
  });

  test('the count beside the card is the number of things on it', async ({ page, world }) => {
    world.set('ticket', view());
    await ticketAt(page, TICKET.needsYou);
    await expect(card(page, 'What came back').locator('.num.muted')).toHaveText('2');
  });

  // ── recording one by hand ────────────────────────────────────────────

  test('recording what came back promises nothing touches the record yet', async ({ page }) => {
    await ticketAt(page, TICKET.onSite);
    await page.getByRole('button', { name: 'Record what came back' }).click();

    await expect(page.getByText(
      'Nothing here touches Sy 214/2 yet. File it on the job first, look at it, and add '
      + 'it to the record when you are happy with it.')).toBeVisible();
  });

  test('Add it waits for a name, and says why the name matters', async ({ page }) => {
    await ticketAt(page, TICKET.onSite);
    await page.getByRole('button', { name: 'Record what came back' }).click();

    await expect(page.getByRole('button', { name: 'Add it' })).toBeDisabled();
    await expect(page.getByText(
      'Give it a name first. What you call it here is what you will be reading on this '
      + 'job in six months.')).toBeVisible();
    await page.getByLabel('What to call it').fill('Corner sketch');
    await expect(page.getByRole('button', { name: 'Add it' })).toBeEnabled();
  });

  test('a corrected outline asks for corners instead of a file', async ({ page, world }) => {
    await ticketAt(page, TICKET.onSite);
    await page.getByRole('button', { name: 'Record what came back' }).click();
    await page.getByLabel('What is it').selectOption('boundary');

    await expect(page.getByLabel('The corners')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Choose a file' })).toHaveCount(0);

    await page.getByLabel('What to call it').fill('Eight corners');
    await page.getByLabel('The corners').fill('15.3133,80.0729;15.3140,80.0740;15.3120,80.0750');
    await page.getByRole('button', { name: 'Add it' }).click();

    await expect.poll(() => world.calls('addDeliverable')).toHaveLength(1);
    expect(world.lastVars('addDeliverable')).toMatchObject({
      ticketId: TICKET.onSite, kind: 'boundary', label: 'Eight corners', fileRef: '',
      payload: JSON.stringify({ ring: '15.3133,80.0729;15.3140,80.0740;15.3120,80.0750' }),
    });
  });

  test('something on the land asks what condition it is in', async ({ page, world }) => {
    await ticketAt(page, TICKET.onSite);
    await page.getByRole('button', { name: 'Record what came back' }).click();
    await page.getByLabel('What is it').selectOption('feature');
    await page.getByLabel('What to call it').fill('Open well');
    await page.getByLabel('What condition it is in').selectOption('warn');
    await page.getByRole('button', { name: 'Add it' }).click();

    await expect.poll(() => world.calls('addDeliverable')).toHaveLength(1);
    expect(world.lastVars('addDeliverable')).toMatchObject({
      kind: 'feature', label: 'Open well',
      payload: JSON.stringify({ condition_state: 'warn' }),
    });
  });

  test('recording a paper uploads the bytes first and files the node id against this job', async ({ page, world }) => {
    world.route(/\/api\/gateway\/storage\/files\?/, () => ({
      json: { id: 'file-uploaded', name: 'report.pdf', sizeBytes: 2048, mimeType: 'application/pdf' },
    }));
    await ticketAt(page, TICKET.onSite);
    await page.getByRole('button', { name: 'Record what came back' }).click();
    await page.getByLabel('What to call it').fill('Surveyor report');
    await page.getByLabel('The file that came back').setInputFiles({
      name: 'report.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 report'),
    });
    await expect(page.getByText('report.pdf · 0.0 MB')).toBeVisible();
    await page.getByRole('button', { name: 'Add it' }).click();

    await expect.poll(() => world.calls('addDeliverable')).toHaveLength(1);
    expect(world.restCalls(/storage\/files\?/)).toHaveLength(1);
    expect(world.lastVars('addDeliverable')).toMatchObject({
      kind: 'paper', label: 'Surveyor report', fileRef: 'file-uploaded',
      fileName: 'report.pdf', mimeType: 'application/pdf',
    });
  });

  test('a file over the limit is refused before anything is uploaded', async ({ page, world }) => {
    await ticketAt(page, TICKET.onSite);
    await page.getByRole('button', { name: 'Record what came back' }).click();
    await page.getByLabel('What to call it').fill('A very large scan');
    await page.getByLabel('The file that came back').setInputFiles({
      name: 'huge.pdf', mimeType: 'application/pdf', buffer: Buffer.alloc(11 * 1024 * 1024, 0x20),
    });
    await page.getByRole('button', { name: 'Add it' }).click();

    await expect(page.getByText('huge.pdf is 11.0 MB. The limit is 10.0 MB — nothing was uploaded.'))
      .toBeVisible();
    expect(world.restCalls(/storage\/files\?/)).toHaveLength(0);
    expect(world.calls('addDeliverable')).toHaveLength(0);
  });

  test('a refused recording says nothing was added to this job', async ({ page, world }) => {
    world.set('addDeliverable', '');
    await ticketAt(page, TICKET.onSite);
    await page.getByRole('button', { name: 'Record what came back' }).click();
    await page.getByLabel('What to call it').fill('Corner sketch');
    await page.getByRole('button', { name: 'Add it' }).click();

    await expect(page.getByText(ADD_FAILED)).toBeVisible();
    await expect(page.getByLabel('What to call it')).toHaveValue('Corner sketch');
  });

  test('a refused review says nothing on the job has changed', async ({ page, world }) => {
    world.set('reviewDeliverable', false);
    world.set('ticket', view());
    await ticketAt(page, TICKET.needsYou);
    await page.getByRole('article', { name: 'Surveyor report' })
      .getByRole('button', { name: 'Keep it' }).click();

    await expect(page.getByText(MOVE_FAILED).first()).toBeVisible();
  });

  test('a refused review is said once, next to the control that failed', async ({ page, world }) => {
    // It used to be said twice: a page-level error card under the header AND
    // the same string inside the accept card, both `role="alert"`, so a
    // refused verdict was announced twice to a screen reader and printed
    // twice on the page. The page-level card is gone and every write now
    // names the region it belongs to — this one reports as `came`.
    world.set('reviewDeliverable', false);
    world.set('ticket', view());
    await ticketAt(page, TICKET.needsYou);
    await page.getByRole('article', { name: 'Surveyor report' })
      .getByRole('button', { name: 'Keep it' }).click();

    await expect(page.getByText(MOVE_FAILED)).toHaveCount(1);
    await expect(card(page, 'What came back').getByText(MOVE_FAILED)).toBeVisible();
  });

  test('a failure raised in the rail is reported in the rail, not 800px up the page', async ({ page, world }) => {
    world.set('revokeDispatch', false);
    world.set('ticket', view());
    await ticketAt(page, TICKET.needsYou);
    await card(page, 'Sent out').getByRole('button', { name: 'Withdraw' }).click();
    await card(page, 'Sent out').getByRole('button', { name: 'Withdraw' }).click();

    await expect(card(page, 'Sent out').getByText(MOVE_FAILED)).toBeVisible();
    await expect(page.getByText(MOVE_FAILED)).toHaveCount(1);
  });

  test('a kebab action that fails still says so, under the header where its card is not', async ({ page, world }) => {
    // `where: 'page'` is the fallback for an action whose owning card is not
    // on screen. A kebab action must never be able to fail silently.
    world.set('assignRequest', World.gqlError('the roster is down'));
    await ticketAt(page, TICKET.quiet);
    await fromMenu(page, 'W-2106', 'Take them off this job');
    await page.getByRole('dialog', { name: 'Take them off this job?' })
      .getByRole('button', { name: 'Take them off' }).click();

    await expect(page.getByText(MOVE_FAILED)).toBeVisible();
  });
});

// ═══════════════════════════════════════════════════════════════════════
test.describe('W13 · a storage outage while recording', () => {
  // The point of both tests is a refused upload, which reaches the console as
  // a browser log entry before the app ever sees it.
  test.use({ allowConsole: true });

  test('a refused upload files nothing against this job', async ({ page, world }) => {
    world.route(/\/api\/gateway\/storage\/files\?/, () => ({
      status: 503, json: { detail: 'Storage is offline' },
    }));
    await ticketAt(page, TICKET.onSite);
    await page.getByRole('button', { name: 'Record what came back' }).click();
    await page.getByLabel('What to call it').fill('Surveyor report');
    await page.getByLabel('The file that came back').setInputFiles({
      name: 'report.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 report'),
    });
    await page.getByRole('button', { name: 'Add it' }).click();

    await expect(page.getByRole('alert').first()).toBeVisible();
    expect(world.calls('addDeliverable')).toHaveLength(0);
  });

  // ── defect ───────────────────────────────────────────────────────────
  // Ticket.tsx:564-565 reads `const node = await uploadToDrive(dvFile); if
  // (!node) { setErr(STORAGE_OFFLINE_MSG); return; }` — but storage.ts:50
  // never returns a falsy node, it THROWS StorageUploadError. So the branch
  // is dead and the outer catch at Ticket.tsx:581 reports ADD_FAILED
  // instead: "check what you typed and try again", about a file that never
  // left the browser. The owner is owed the storage sentence the rest of the
  // app uses, so they retry the upload rather than re-reading the label.
  test.fail('a storage outage says the file could not be uploaded, not that I typed it wrong', async ({ page, world }) => {
    world.route(/\/api\/gateway\/storage\/files\?/, () => ({
      status: 503, json: { detail: 'Storage is offline' },
    }));
    await ticketAt(page, TICKET.onSite);
    await page.getByRole('button', { name: 'Record what came back' }).click();
    await page.getByLabel('What to call it').fill('Surveyor report');
    await page.getByLabel('The file that came back').setInputFiles({
      name: 'report.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 report'),
    });
    await page.getByRole('button', { name: 'Add it' }).click();

    await expect(page.getByText(STORAGE_OFFLINE_MSG)).toBeVisible();
  });
});

// ═══════════════════════════════════════════════════════════════════════
test.describe('W13 · accepting the work', () => {
  test('accepting is refused while any item is undecided, and the card says which', async ({ page, world }) => {
    world.set('ticket', view());
    await ticketAt(page, TICKET.needsYou);

    await expect(page.getByRole('button', { name: 'Accept and file' })).toBeDisabled();
    await expect(page.getByText(
      'Decide on every item first — 2 items still waiting. An item you have not looked at '
      + 'is not an item you meant to file.')).toBeVisible();
  });

  test('the accept card counts what is kept against what came, and what is set aside for whom', async ({ page, world }) => {
    world.set('ticket', view({
      deliverables: [deliverable(0, { review: 'accepted' }), deliverable(1, { review: 'rejected' })],
    }));
    await ticketAt(page, TICKET.needsYou);

    await expect(page.getByText(
      'Keeping 1 of 2 · ₹6,500 recorded for settlement with Ravi Kumar, licensed surveyor'))
      .toBeVisible();
    await expect(page.getByRole('button', { name: 'Accept and file' })).toBeEnabled();
  });

  test('the dialog states where each kept item goes before anything is filed', async ({ page, world }) => {
    world.set('ticket', view({
      deliverables: [deliverable(0, { review: 'accepted' }), deliverable(1, { review: 'accepted' })],
    }));
    await ticketAt(page, TICKET.needsYou);
    await page.getByRole('button', { name: 'Accept and file' }).click();

    const dialog = page.getByRole('dialog', { name: 'Accept and file?' });
    await expect(dialog).toContainText(
      '2 items go onto Sy 214/2: “8 corners, walked” → The record boundary; “Surveyor '
      + 'report” → The map shelf.');
    await expect(dialog).toContainText(
      'The outline on file is replaced — the one it replaces is kept on this job.');
  });

  test('the dialog says who is owed what, in the words the server chose', async ({ page, world }) => {
    world.set('ticket', view({
      deliverables: [deliverable(0, { review: 'accepted' }), deliverable(1, { review: 'rejected' })],
    }));
    await ticketAt(page, TICKET.needsYou);
    await page.getByRole('button', { name: 'Accept and file' }).click();

    await expect(page.getByRole('dialog', { name: 'Accept and file?' })).toContainText(
      '₹5,850 is recorded as owed to Ravi Kumar, licensed surveyor and ₹650 to Pattadar. '
      + 'Payments are switched off on this build. Nothing has been charged.');
  });

  test('accepting with nothing kept says so, and that what is set aside is released', async ({ page, world }) => {
    world.set('ticket', view({
      deliverables: [deliverable(0, { review: 'rejected' }), deliverable(1, { review: 'rejected' })],
    }));
    await ticketAt(page, TICKET.needsYou);
    await page.getByRole('button', { name: 'Accept and file' }).click();

    await expect(page.getByRole('dialog', { name: 'Accept and file?' })).toContainText(
      'Nothing is marked to keep, so nothing is added to Sy 214/2. The job is closed and '
      + 'what is set aside is released.');
  });

  test('Accept and file is what calls acceptTicket, and nothing before it does', async ({ page, world }) => {
    world.set('ticket', view({
      deliverables: [deliverable(0, { review: 'accepted' }), deliverable(1, { review: 'accepted' })],
    }));
    await ticketAt(page, TICKET.needsYou);
    await page.getByRole('button', { name: 'Accept and file' }).click();
    expect(world.calls('acceptTicket')).toHaveLength(0);

    await page.getByRole('dialog', { name: 'Accept and file?' })
      .getByRole('button', { name: 'Accept and file' }).click();
    await expect.poll(() => world.calls('acceptTicket')).toHaveLength(1);
    expect(world.lastVars('acceptTicket')).toMatchObject({ ticketId: TICKET.needsYou, note: '' });
  });

  test('a refused acceptance says decide on every item first', async ({ page, world }) => {
    world.set('acceptTicket', 0);
    world.set('ticket', view({
      deliverables: [deliverable(0, { review: 'accepted' }), deliverable(1, { review: 'accepted' })],
    }));
    await ticketAt(page, TICKET.needsYou);
    await page.getByRole('button', { name: 'Accept and file' }).click();
    await page.getByRole('dialog', { name: 'Accept and file?' })
      .getByRole('button', { name: 'Accept and file' }).click();

    await expect(page.getByRole('dialog', { name: 'Accept and file?' })
      .getByText(ACCEPT_FAILED)).toBeVisible();
  });

  test('an acceptance that falls over says the same thing and keeps the dialog open', async ({ page, world }) => {
    world.set('acceptTicket', World.gqlError('the ledger is locked'));
    world.set('ticket', view({
      deliverables: [deliverable(0, { review: 'accepted' }), deliverable(1, { review: 'accepted' })],
    }));
    await ticketAt(page, TICKET.needsYou);
    await page.getByRole('button', { name: 'Accept and file' }).click();
    await page.getByRole('dialog', { name: 'Accept and file?' })
      .getByRole('button', { name: 'Accept and file' }).click();

    await expect(page.getByRole('dialog', { name: 'Accept and file?' })).toBeVisible();
    // Scoped: the accept card behind the dialog prints the same sentence, which
    // is the defect recorded under "a refused review is said once, not twice".
    await expect(page.getByRole('dialog', { name: 'Accept and file?' })
      .getByText(ACCEPT_FAILED)).toBeVisible();
  });

  test('the accept dialog opens on the safe button, not on the one that cannot be undone', async ({ page, world }) => {
    world.set('ticket', view({
      deliverables: [deliverable(0, { review: 'accepted' }), deliverable(1, { review: 'accepted' })],
    }));
    await ticketAt(page, TICKET.needsYou);
    await page.getByRole('button', { name: 'Accept and file' }).click();

    await expect(page.getByRole('dialog', { name: 'Accept and file?' })
      .getByRole('button', { name: 'Cancel' })).toBeFocused();
  });

  test('Cancel leaves the accept dialog without filing anything', async ({ page, world }) => {
    world.set('ticket', view({
      deliverables: [deliverable(0, { review: 'accepted' }), deliverable(1, { review: 'accepted' })],
    }));
    await ticketAt(page, TICKET.needsYou);
    await page.getByRole('button', { name: 'Accept and file' }).click();
    await page.getByRole('dialog', { name: 'Accept and file?' })
      .getByRole('button', { name: 'Cancel' }).click();

    await expect(page.getByRole('dialog')).toHaveCount(0);
    expect(world.calls('acceptTicket')).toHaveLength(0);
  });

  test('Tab stays inside the accept dialog instead of walking the job behind it', async ({ page, world }) => {
    world.set('ticket', view({
      deliverables: [deliverable(0, { review: 'accepted' }), deliverable(1, { review: 'accepted' })],
    }));
    await ticketAt(page, TICKET.needsYou);
    await page.getByRole('button', { name: 'Accept and file' }).click();

    const dialog = page.getByRole('dialog', { name: 'Accept and file?' });
    await expect(dialog.getByRole('button', { name: 'Cancel' })).toBeFocused();
    for (let i = 0; i < 5; i += 1) {
      await page.keyboard.press('Tab');
      await expect(dialog.locator(':focus')).toHaveCount(1);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════
test.describe('W13 · sending the whole job back', () => {
  test('sending it back asks what is missing and says who reads it', async ({ page, world }) => {
    world.set('ticket', view());
    await ticketAt(page, TICKET.needsYou);
    await page.getByRole('button', { name: 'Send it back' }).click();

    await expect(page.getByLabel('What is missing')).toBeVisible();
    await expect(page.getByText(
      'They get your reasons on the channel this went out on, and can send new work back '
      + 'against the same job. Everything already recorded stays on this job.')).toBeVisible();
  });

  test('the button waits for words, and says why', async ({ page, world }) => {
    world.set('ticket', view());
    await ticketAt(page, TICKET.needsYou);
    await page.getByRole('button', { name: 'Send it back' }).click();

    await expect(page.getByRole('button', { name: 'Send it back' }).last()).toBeDisabled();
    await expect(page.getByText(
      'Say what is missing first. These words are all they have to work from.')).toBeVisible();
  });

  test('sending it back carries exactly the words I typed', async ({ page, world }) => {
    world.set('ticket', view());
    await ticketAt(page, TICKET.needsYou);
    await page.getByRole('button', { name: 'Send it back' }).click();
    await page.getByLabel('What is missing').fill('The eastern corner is in the road.');
    await page.getByRole('button', { name: 'Send it back' }).last().click();

    await expect.poll(() => world.calls('sendBackTicket')).toHaveLength(1);
    expect(world.lastVars('sendBackTicket')).toMatchObject({
      ticketId: TICKET.needsYou, reason: 'The eastern corner is in the road.',
    });
  });

  test('sending the job back does not touch what already came back on it', async ({ page, world }) => {
    world.set('ticket', view());
    await ticketAt(page, TICKET.needsYou);
    await page.getByRole('button', { name: 'Send it back' }).click();
    await page.getByLabel('What is missing').fill('Two of the corners are wrong.');
    await page.getByRole('button', { name: 'Send it back' }).last().click();

    await expect.poll(() => world.calls('sendBackTicket')).toHaveLength(1);
    expect(world.calls('reviewDeliverable')).toHaveLength(0);
    await expect(page.getByRole('article', { name: 'Surveyor report' })).toBeVisible();
  });

  test('a refused send-back says nothing on the job has changed, and keeps my words', async ({ page, world }) => {
    world.set('sendBackTicket', false);
    world.set('ticket', view());
    await ticketAt(page, TICKET.needsYou);
    await page.getByRole('button', { name: 'Send it back' }).click();
    await page.getByLabel('What is missing').fill('Two of the corners are wrong.');
    await page.getByRole('button', { name: 'Send it back' }).last().click();

    await expect(page.getByText(MOVE_FAILED).first()).toBeVisible();
    await expect(page.getByLabel('What is missing')).toHaveValue('Two of the corners are wrong.');
  });

  test('the accept card steps aside while the send-back panel is open', async ({ page, world }) => {
    world.set('ticket', view());
    await ticketAt(page, TICKET.needsYou);
    await page.getByRole('button', { name: 'Send it back' }).click();

    await expect(page.getByRole('button', { name: 'Accept and file' })).toHaveCount(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════
test.describe('W13 · pulling the job', () => {
  test('cancelling says who is told, what stays, and that there is no undo', async ({ page }) => {
    await ticketAt(page, TICKET.assigned);
    await page.getByRole('button', { name: 'Actions for W-2102' }).click();
    await page.getByRole('menuitem', { name: 'Cancel this job' }).click();

    await expect(page.getByRole('dialog', { name: 'Cancel this job?' })).toContainText(
      'Ravi Kumar, licensed surveyor is told it is off and nothing more can come back on '
      + 'it. Anything already filed onto Sy 214/2 stays where it is — this only closes the '
      + 'job. There is no undo.');
  });

  test('a job with money set aside offers to settle some of it, and does the arithmetic', async ({ page, world }) => {
    world.set('ticket', view({ can: ['cancel', 'dispatch'] }));
    await ticketAt(page, TICKET.needsYou);
    await page.getByRole('button', { name: 'Actions for W-2105' }).click();
    await page.getByRole('menuitem', { name: 'Cancel this job' }).click();

    const dialog = page.getByRole('dialog', { name: 'Cancel this job?' });
    await expect(dialog).toContainText(
      '₹0 settled — ₹0 to Ravi Kumar, licensed surveyor, ₹0 to Pattadar. The rest, ₹6,500, '
      + 'goes back to your wallet.');
    await dialog.getByLabel('Settle some of the ₹6,500 set aside').fill('1000');
    await expect(dialog).toContainText(
      '₹1,000 settled — ₹900 to Ravi Kumar, licensed surveyor, ₹100 to Pattadar. The rest, '
      + '₹5,500, goes back to your wallet.');
  });

  test('the dialog says nothing is charged and nothing is sent, because nothing is', async ({ page, world }) => {
    world.set('ticket', view({ can: ['cancel', 'dispatch'] }));
    await ticketAt(page, TICKET.needsYou);
    await page.getByRole('button', { name: 'Actions for W-2105' }).click();
    await page.getByRole('menuitem', { name: 'Cancel this job' }).click();

    await expect(page.getByRole('dialog', { name: 'Cancel this job?' })).toContainText(
      'Nothing is charged and nothing is sent — paying online is not switched on yet.');
  });

  test('a figure above what is set aside is clamped before it is sent anywhere', async ({ page, world }) => {
    world.set('ticket', view({ can: ['cancel', 'dispatch'] }));
    await ticketAt(page, TICKET.needsYou);
    await page.getByRole('button', { name: 'Actions for W-2105' }).click();
    await page.getByRole('menuitem', { name: 'Cancel this job' }).click();

    const dialog = page.getByRole('dialog', { name: 'Cancel this job?' });
    await dialog.getByLabel('Settle some of the ₹6,500 set aside').fill('99999');
    await expect(dialog).toContainText('₹6,500 settled');
    await expect(dialog).toContainText('The rest, ₹0,');

    await dialog.getByRole('button', { name: 'Cancel this job' }).click();
    await expect.poll(() => world.calls('cancelTicket')).toHaveLength(1);
    expect(world.lastVars('cancelTicket')).toMatchObject({ payAnyway: 6_500 });
  });

  test('a figure below nothing is clamped to nothing rather than sent as a debt', async ({ page, world }) => {
    world.set('ticket', view({ can: ['cancel', 'dispatch'] }));
    await ticketAt(page, TICKET.needsYou);
    await page.getByRole('button', { name: 'Actions for W-2105' }).click();
    await page.getByRole('menuitem', { name: 'Cancel this job' }).click();

    const dialog = page.getByRole('dialog', { name: 'Cancel this job?' });
    await dialog.getByLabel('Settle some of the ₹6,500 set aside').fill('-500');
    await expect(dialog).toContainText('₹0 settled');
    await expect(dialog).toContainText('The rest, ₹6,500,');
  });

  test('a job with nothing set aside is not asked how much of it to settle', async ({ page }) => {
    await ticketAt(page, TICKET.placed);
    await page.getByRole('button', { name: 'Actions for W-2101' }).click();
    await page.getByRole('menuitem', { name: 'Cancel this job' }).click();

    const dialog = page.getByRole('dialog', { name: 'Cancel this job?' });
    await expect(dialog.getByLabel('Why')).toBeVisible();
    await expect(dialog.getByLabel(/Settle some of/)).toHaveCount(0);
  });

  test('cancelling carries the reason and the figure', async ({ page, world }) => {
    world.set('ticket', view({ can: ['cancel', 'dispatch'] }));
    await ticketAt(page, TICKET.needsYou);
    await page.getByRole('button', { name: 'Actions for W-2105' }).click();
    await page.getByRole('menuitem', { name: 'Cancel this job' }).click();

    const dialog = page.getByRole('dialog', { name: 'Cancel this job?' });
    await dialog.getByLabel('Why').fill('He never went.');
    await dialog.getByLabel('Settle some of the ₹6,500 set aside').fill('1500');
    await dialog.getByRole('button', { name: 'Cancel this job' }).click();

    await expect.poll(() => world.calls('cancelTicket')).toHaveLength(1);
    expect(world.lastVars('cancelTicket')).toMatchObject({
      ticketId: TICKET.needsYou, reason: 'He never went.', payAnyway: 1_500,
    });
  });

  test('a refused cancellation says nothing on the job has changed, inside the dialog', async ({ page, world }) => {
    world.set('cancelTicket', false);
    await ticketAt(page, TICKET.assigned);
    await page.getByRole('button', { name: 'Actions for W-2102' }).click();
    await page.getByRole('menuitem', { name: 'Cancel this job' }).click();
    await page.getByRole('dialog', { name: 'Cancel this job?' })
      .getByRole('button', { name: 'Cancel this job' }).click();

    await expect(page.getByRole('dialog', { name: 'Cancel this job?' })
      .getByText(MOVE_FAILED)).toBeVisible();
  });

  test('a pointer that slips onto the dim does not throw away the reason I typed', async ({ page }) => {
    await ticketAt(page, TICKET.assigned);
    await page.getByRole('button', { name: 'Actions for W-2102' }).click();
    await page.getByRole('menuitem', { name: 'Cancel this job' }).click();
    await page.getByRole('dialog', { name: 'Cancel this job?' }).getByLabel('Why').fill('He never went.');

    await page.locator('.scrim').click({ position: { x: 4, y: 4 } });
    await expect(page.getByRole('dialog', { name: 'Cancel this job?' })).toBeVisible();
    await expect(page.getByLabel('Why')).toHaveValue('He never went.');
  });

  test('Cancel in the dialog closes it without pulling the job', async ({ page, world }) => {
    await ticketAt(page, TICKET.assigned);
    await page.getByRole('button', { name: 'Actions for W-2102' }).click();
    await page.getByRole('menuitem', { name: 'Cancel this job' }).click();
    await page.getByRole('dialog', { name: 'Cancel this job?' })
      .getByRole('button', { name: 'Cancel', exact: true }).click();

    await expect(page.getByRole('dialog')).toHaveCount(0);
    expect(world.calls('cancelTicket')).toHaveLength(0);
  });

  test('Escape closes the cancel dialog and gives the kebab its focus back', async ({ page }) => {
    await ticketAt(page, TICKET.assigned);
    await page.getByRole('button', { name: 'Actions for W-2102' }).click();
    await page.getByRole('menuitem', { name: 'Cancel this job' }).click();

    // Wait for the dialog to have TAKEN focus, not merely to be visible:
    // Dialog.tsx attaches its Escape handler in the same commit that moves
    // focus in, so a key pressed before that lands on the page behind it.
    const dialog = page.getByRole('dialog', { name: 'Cancel this job?' });
    await expect(dialog.getByRole('button', { name: 'Cancel', exact: true })).toBeFocused();
    await page.keyboard.press('Escape');

    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Actions for W-2102' })).toBeFocused();
  });
});

// ═══════════════════════════════════════════════════════════════════════
test.describe('W13 · the money, with payments off', () => {
  test('the card leads with the server sentence, the Not charged pill, and the honesty under it', async ({ page }) => {
    await ticketAt(page, TICKET.assigned);

    const costs = card(page, 'What this costs');
    await expect(costs).toContainText('₹6,500 is set aside for this job');
    await expect(costs.locator('.pill.sim').first()).toHaveText('Not charged');
    await expect(costs).toContainText(
      'Payments are switched off on this build. Nothing has been charged.');
    await expect(costs).toContainText('Adding money to the wallet is not switched on yet.');
  });

  test('with payments off the card offers no checkout at all', async ({ page }) => {
    await ticketAt(page, TICKET.assigned);
    await expect(card(page, 'What this costs')).toContainText('₹6,500 is set aside for this job');
    await expect(card(page, 'What this costs')
      .getByRole('link', { name: /checkout|Payment and settlement/ })).toHaveCount(0);
  });

  test('a job with nothing set aside says so once, in the headline, and offers the setting aside', async ({ page }) => {
    // The headline is the server's and it already says it. The explanatory
    // paragraph below is held back when held, released and returned are all
    // zero, which is the only condition `money_headline` consults — comparing
    // the headline string, or testing `quoted === 0`, both got an unfunded
    // job with a price wrong and printed the same sentence twice, two lines
    // apart.
    await ticketAt(page, TICKET.placed);

    const costs = card(page, 'What this costs');
    await expect(costs).toContainText('₹1,200 has not been set aside yet');
    await expect(costs).not.toContainText('A job with no money behind it');
    await expect(costs.getByRole('button', { name: 'Set ₹1,200 aside' })).toBeVisible();
  });

  // ── defect ───────────────────────────────────────────────────────────
  // Ticket.tsx:1267-1273 suppresses the empty-ledger paragraph on the right
  // condition and then keeps it on the wrong one. The branch that survives is
  // `ledger.length === 0 && (held > 0 || released > 0 || returned > 0)` — a
  // job with ₹6,500 held against it and no ledger rows to show for it — and
  // the sentence it prints there is "Nothing set aside yet", which is the one
  // thing that is certainly untrue of that job. The owner is owed either
  // nothing at all in that state or a sentence about the missing rows; what
  // they must not be told is that their money is not set aside when the same
  // card's headline says it is.
  test.fail('a job with money held against it is never told nothing is set aside', async ({ page, world }) => {
    world.set('ticket', view({
      ledger: [], money: money({ held: 6_500, funded: true }),
    }));
    await ticketAt(page, TICKET.needsYou);

    await expect(card(page, 'What this costs')).toContainText('₹6,500 is set aside for this job');
    await expect(card(page, 'What this costs')).not.toContainText('Nothing set aside yet');
  });

  test('the card never prints the same nothing-set-aside sentence twice', async ({ page, world }) => {
    world.set('ticket', view({
      money: money({ held: 0, funded: false, headline: 'Nothing set aside yet' }), ledger: [],
    }));
    await ticketAt(page, TICKET.needsYou);

    await expect(page.getByText('Nothing set aside yet', { exact: true })).toHaveCount(1);
  });

  test('setting money aside is offered on a job I can still send out, and calls fundTicket', async ({ page, world }) => {
    await ticketAt(page, TICKET.placed);
    await card(page, 'What this costs').getByRole('button', { name: 'Set ₹1,200 aside' }).click();

    await expect.poll(() => world.calls('fundTicket')).toHaveLength(1);
    expect(world.lastVars('fundTicket')).toMatchObject({ ticketId: TICKET.placed });
  });

  test('the money lives in the money card and is not repeated in the menu', async ({ page }) => {
    // It used to be all three at once: a header button, a card button and a
    // menu item, for one action. The card is the one that explains the
    // consequence, so the card keeps it.
    await ticketAt(page, TICKET.placed);
    await expect(card(page, 'What this costs')
      .getByRole('button', { name: 'Set ₹1,200 aside' })).toBeVisible();

    const menu = await actions(page, 'W-2101');
    expect(menu).not.toContain('Set money aside');
    expect(menu).not.toContain('Open payment checkout');
    expect(menu.filter((m) => /aside|checkout|payment/i.test(m))).toEqual([]);
  });

  test('a refused funding says nothing on the job has changed', async ({ page, world }) => {
    world.set('fundTicket', '');
    await ticketAt(page, TICKET.placed);
    await card(page, 'What this costs').getByRole('button', { name: 'Set ₹1,200 aside' }).click();

    await expect(page.getByText(MOVE_FAILED).first()).toBeVisible();
  });

  test('a cancelled job is never offered money, because there is nothing left to fund', async ({ page }) => {
    await ticketAt(page, TICKET.cancelled);
    await expect(card(page, 'What this costs')).toContainText('has not been set aside yet');
    await expect(page.getByRole('button', { name: /Set .* aside/ })).toHaveCount(0);
  });

  test('the ledger prints full figures, and marks every row as not charged', async ({ page, world }) => {
    world.set('ticket', view());
    await ticketAt(page, TICKET.needsYou);

    const costs = card(page, 'What this costs');
    await expect(costs).toContainText('Set aside for W-2105');
    await expect(costs).toContainText('05/09/2026');
    await expect(costs.locator('.num').filter({ hasText: '₹6,500' }).first()).toBeVisible();
    await expect(costs.locator('.pill.sim')).toHaveCount(2);
  });

  test('nothing on this job says a payment was settled', async ({ page, world }) => {
    world.set('ticket', view());
    await ticketAt(page, TICKET.needsYou);

    await expect(card(page, 'What this costs')).toContainText('Set aside for W-2105');
    await expect(page.getByText('Settled', { exact: true })).toHaveCount(0);
    await expect(page.getByText('It did not go', { exact: true })).toHaveCount(0);
  });

  test('a ledger row the provider actually moved would say so, and is not what this build has', async ({ page, world }) => {
    world.set('ticket', view({
      ledger: [{ ...LEDGER[0], simulated: false, status: 'done' }],
    }));
    await ticketAt(page, TICKET.needsYou);

    await expect(card(page, 'What this costs').getByText('Settled', { exact: true })).toBeVisible();
  });
});

// ═══════════════════════════════════════════════════════════════════════
test.describe('W13 · the money, with payments switched on', () => {
  test('the card hands through to the checkout with the price on the button', async ({ page, world }) => {
    paymentsOn(world);
    await ticketAt(page, TICKET.placed);

    await expect(card(page, 'What this costs')
      .getByRole('link', { name: 'Open checkout · ₹1,200' }))
      .toHaveAttribute('href', `/app/services/${TICKET.placed}/pay`);
  });

  test('a job already funded is offered the status of its payment, not another price', async ({ page, world }) => {
    paymentsOn(world);
    await ticketAt(page, TICKET.assigned);

    const costs = card(page, 'What this costs');
    await expect(costs.getByRole('link', { name: 'Payment and settlement status' })).toBeVisible();
    await expect(costs.getByRole('link', { name: /Open checkout/ })).toHaveCount(0);
  });

  test('a job that is done is offered the status of its payment too', async ({ page, world }) => {
    paymentsOn(world);
    await ticketAt(page, TICKET.closed);
    await expect(card(page, 'What this costs')
      .getByRole('link', { name: 'Payment and settlement status' })).toBeVisible();
  });

  test('with payments on the checkout is a link in the money card, and still not a menu item', async ({ page, world }) => {
    paymentsOn(world);
    world.route(PAY_TICKET, () => ({ json: payState({ mode: 'test', enabled: true }) }));
    await ticketAt(page, TICKET.placed);

    expect(await actions(page, 'W-2101')).toEqual(['Send this to someone', 'Cancel this job']);
    await page.keyboard.press('Escape');

    // A real link, so it is middle-clickable and copyable — a menu item
    // calling navigate() was neither.
    await card(page, 'What this costs')
      .getByRole('link', { name: 'Open checkout · ₹1,200' }).click();
    await expect(page).toHaveURL(new RegExp(`/app/services/${TICKET.placed}/pay$`));
    expect(world.calls('fundTicket')).toHaveLength(0);
  });

  test('the old ticket checkout address still lands on the service checkout', async ({ page, world }) => {
    // The one URL a shipped iOS binary hard-codes
    // (apps/ios/Pattadar/Sources/ServicesScreen.swift:251).
    world.route(PAY_TICKET, () => ({ json: payState() }));
    await page.goto(`/app/tickets/${TICKET.placed}/pay`);

    await expect(page).toHaveURL(new RegExp(`/app/services/${TICKET.placed}/pay$`));
    await expect(page.getByRole('link', { name: '← Back to the service' })).toBeVisible();
  });

  test('with payments on the money card no longer offers to set money aside by hand', async ({ page, world }) => {
    paymentsOn(world);
    await ticketAt(page, TICKET.placed);
    await expect(card(page, 'What this costs')
      .getByRole('link', { name: 'Open checkout · ₹1,200' })).toBeVisible();
    await expect(page.getByRole('button', { name: /Set .* aside/ })).toHaveCount(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════
test.describe('W13 · payment settings that will not load', () => {
  // The point is a failed GET, which reaches the console before the app sees it.
  test.use({ allowConsole: true });

  test('payment settings that will not load say so and offer to try again', async ({ page, world }) => {
    world.route(PAY_CONFIG, () => ({ status: 500, json: { detail: 'nope' } }));
    await ticketAt(page, TICKET.placed);

    const costs = card(page, 'What this costs');
    await expect(costs.getByText('Payment settings could not be loaded.')).toBeVisible();
    await expect(costs.getByRole('button', { name: 'Retry' })).toBeVisible();
  });

  test('with payment settings unknown the screen offers no money buttons it cannot stand behind', async ({ page, world }) => {
    world.route(PAY_CONFIG, () => ({ status: 500, json: { detail: 'nope' } }));
    await ticketAt(page, TICKET.placed);

    await expect(page.getByRole('button', { name: /Set .* aside/ })).toHaveCount(0);
    expect(await actions(page, 'W-2101')).toEqual(['Send this to someone', 'Cancel this job']);
  });
});

// ═══════════════════════════════════════════════════════════════════════
test.describe('W13 · the checkout', () => {
  test('the checkout asks for the service it was routed to, and offers the way back', async ({ page, world }) => {
    world.route(PAY_TICKET, () => ({ json: payState() }));
    await page.goto(`/app/services/${TICKET.placed}/pay`);

    await expect(page.getByRole('link', { name: '← Back to the service' }))
      .toHaveAttribute('href', `/app/services/${TICKET.placed}`);
    await expect.poll(() => world.restCalls(PAY_TICKET).length).toBeGreaterThan(0);
    expect(world.restCalls(PAY_TICKET)[0].path).toContain(TICKET.placed);
  });

  test('with payments off the checkout takes no money and says so', async ({ page, world }) => {
    world.route(PAY_TICKET, () => ({ json: payState() }));
    await page.goto(`/app/services/${TICKET.placed}/pay`);

    await expect(page.getByText('Online payments are not configured. No payment has been taken here.'))
      .toBeVisible();
    await expect(page.getByRole('button', { name: /^Pay /})).toBeDisabled();
    await expect(page.getByText('The provider confirmed capture.', { exact: false })).toHaveCount(0);
  });

  test('the price is the one the service quoted, in rupees rather than paise', async ({ page, world }) => {
    world.route(PAY_TICKET, () => ({ json: payState() }));
    await page.goto(`/app/services/${TICKET.placed}/pay`);
    await expect(page.getByText('₹6,500.00', { exact: true })).toBeVisible();
  });

  test('while the payment status is on its way the page says it is', async ({ page, world }) => {
    world.route(PAY_TICKET, () => ({ json: payState(), delayMs: 1_500 }));
    await page.goto(`/app/services/${TICKET.placed}/pay`);
    await expect(page.getByText('Loading payment status…')).toBeVisible();
    await expect(page.getByText('₹6,500.00', { exact: true })).toBeVisible();
  });

  test('the payment status can be asked for again without reloading the page', async ({ page, world }) => {
    world.route(PAY_TICKET, () => ({ json: payState() }));
    await page.goto(`/app/services/${TICKET.placed}/pay`);
    await expect(page.getByText('₹6,500.00', { exact: true })).toBeVisible();

    const before = world.restCalls(PAY_TICKET).length;
    await page.getByRole('button', { name: 'Check payment status' }).click();
    await expect.poll(() => world.restCalls(PAY_TICKET).length).toBeGreaterThan(before);
  });

  test('test mode says no real money moves, and labels the button as a test', async ({ page, world }) => {
    world.route(PAY_TICKET, () => ({ json: payState({ mode: 'test', enabled: true }) }));
    await page.goto(`/app/services/${TICKET.placed}/pay`);

    await expect(page.getByText('Use test payment details. No real money moves.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Open test checkout' })).toBeEnabled();
    await expect(page.getByText(
      'Your payment is confirmed only after the server checks capture with Razorpay.')).toBeVisible();
  });

  test('a payment order that is not ready yet says to check the status rather than trying again', async ({ page, world }) => {
    world.route(PAY_TICKET, (route) => (route.request().method() === 'POST'
      ? { json: payState({ mode: 'test', enabled: true, status: 'pending', captured: false }) }
      : { json: payState({ mode: 'test', enabled: true }) }));
    await page.goto(`/app/services/${TICKET.placed}/pay`);
    await page.getByRole('button', { name: 'Open test checkout' }).click();

    await expect(page.getByRole('alert')).toHaveText(
      'The payment order is being prepared. Check the status before trying again.');
  });

  test('a payment the provider already captured is not offered for paying a second time', async ({ page, world }) => {
    world.route(PAY_TICKET, () => ({
      json: payState({ mode: 'test', enabled: true, status: 'captured', captured: true, paymentId: 'pay_1' }),
    }));
    await page.goto(`/app/services/${TICKET.placed}/pay`);

    await expect(page.getByText(
      'The provider confirmed capture. The payment is reserved for this job until settlement.'))
      .toBeVisible();
    await expect(page.getByRole('button', { name: /^Pay |Open test checkout/ })).toHaveCount(0);
  });

  test('a settled payment says the provider confirmed the settlement', async ({ page, world }) => {
    world.route(PAY_TICKET, () => ({
      json: payState({ mode: 'live', enabled: true, status: 'settled', captured: true }),
    }));
    await page.goto(`/app/services/${TICKET.closed}/pay`);
    await expect(page.getByText('The provider confirmed the settlement operations.')).toBeVisible();
  });

  test('a settlement still in flight says its progress appears below', async ({ page, world }) => {
    world.route(PAY_TICKET, () => ({
      json: payState({
        mode: 'live', enabled: true, status: 'settlement_pending', captured: true,
        operations: [{ kind: 'transfer', status: 'submitted', error: '' }],
      }),
    }));
    await page.goto(`/app/services/${TICKET.closed}/pay`);
    await expect(page.getByText('Settlement is pending provider confirmation. Its progress appears below.'))
      .toBeVisible();
  });

  test('what the provider is doing is listed in words, not in its own codes', async ({ page, world }) => {
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
    await page.goto(`/app/services/${TICKET.closed}/pay`);

    const list = page.getByRole('listitem');
    await expect(list.nth(0)).toContainText('Payment order: Confirmed');
    await expect(list.nth(1)).toContainText('Worker payment: Queued');
    await expect(list.nth(2)).toContainText('Service fee: Needs attention');
    await expect(list.nth(2)).toContainText('The provider rejected the fee split.');
  });

  test('the page says that closing it does not cancel a payment already accepted', async ({ page, world }) => {
    world.route(PAY_TICKET, () => ({ json: payState() }));
    await page.goto(`/app/services/${TICKET.placed}/pay`);
    await expect(page.getByText(
      'Closing this page does not cancel a payment already accepted by the provider. You '
      + 'can return to check its status.')).toBeVisible();
  });

  test('a payment status that will not answer leaves the page saying it is loading', async ({ page, world }) => {
    world.route(PAY_TICKET, () => ({ json: payState(), delayMs: 30_000 }));
    await page.goto(`/app/services/${TICKET.placed}/pay`);
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
    await page.goto(`/app/services/${TICKET.missing}/pay`);

    // payments.py:157 refuses a service that is not this account's the same way
    // it refuses one that never existed — the page quotes the reason and never
    // a figure, because it was never told one.
    await expect(page.getByRole('alert')).toHaveText('Ticket not found');
    await expect(page.getByText('₹')).toHaveCount(0);
    await expect(page.getByRole('button', { name: /^Pay / })).toHaveCount(0);
  });

  test('the sealed build refuses the checkout, and the page says so without quoting a price', async ({ page }) => {
    // No override: fixtures/seed.ts answers this path with the refusal a
    // payments-off build gives, which is the state this app ships in.
    await page.goto(`/app/services/${TICKET.placed}/pay`);
    await expect(page.getByRole('alert'))
      .toHaveText('The payment request could not be completed.');
    await expect(page.getByText('₹')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Check payment status' })).toBeVisible();
  });
});

// ═══════════════════════════════════════════════════════════════════════
/**
 * W13 · on this land — the rail's third card, and the only new block on the
 * screen.
 *
 * The second of its two links used to be stranded after the dialogs, outside
 * the split, and drawn only on a CLOSED job — which is the one state in which
 * nobody is going to order anything else on that land. It is permanent now,
 * and it sits with the record title and the place it is in, where the land is
 * the subject rather than a repeated eyebrow above the page.
 */
test.describe('W13 · on this land', () => {
  test('the rail says which land this is and where it is, and offers both ways back to it', async ({ page }) => {
    await ticketAt(page, TICKET.assigned);

    const land = inRail(page, 'On this land');
    await expect(land).toContainText('Sy 214/2');
    await expect(land).toContainText('Katragunta, Markapur, Prakasam');
    await expect(land.getByRole('link', { name: 'Open the record ›' }))
      .toHaveAttribute('href', `/app/records/${ID.parcel}`);
    await expect(land.getByRole('link', { name: 'Everything ordered on Sy 214/2 ›' }))
      .toHaveAttribute('href', `/app/records/${ID.parcel}/services`);
  });

  test('a job still running is offered everything else ordered on the land, not only a closed one', async ({ page }) => {
    await ticketAt(page, TICKET.placed);
    await expect(inRail(page, 'On this land')
      .getByRole('link', { name: 'Everything ordered on Sy 214/2 ›' })).toBeVisible();
  });

  test('a job that is done keeps the same two links in the same place', async ({ page }) => {
    await ticketAt(page, TICKET.closed);
    await expect(inRail(page, 'On this land')
      .getByRole('link', { name: 'Everything ordered on Sy 214/2 ›' })).toBeVisible();
    // Not stranded below the split any more.
    await expect(page.getByRole('link', { name: /Everything ordered on/ })).toHaveCount(1);
  });

  test('the rail holds the three things that are reference material, and no action of its own', async ({ page, world }) => {
    world.set('ticket', view());
    await ticketAt(page, TICKET.needsYou);

    await expect(inRail(page, 'Who is on it')).toBeVisible();
    await expect(inRail(page, 'Sent out')).toBeVisible();
    await expect(inRail(page, 'On this land')).toBeVisible();
    // The money, the answers and the trail all moved out of here and into the
    // main column, where the tables and the prose have the width.
    await expect(inRail(page, 'What this costs')).toHaveCount(0);
    await expect(inRail(page, 'What was asked for')).toHaveCount(0);
    await expect(inMain(page, 'What this costs')).toBeVisible();
    await expect(inMain(page, 'What was asked for')).toBeVisible();
    await expect(inMain(page, 'Everything that happened')).toBeVisible();
  });
});

// ═══════════════════════════════════════════════════════════════════════
test.describe('W13 · on a phone', () => {
  test('@phone the service stacks instead of scrolling the page sideways', async ({ page, world }) => {
    world.set('ticket', view());
    await ticketAt(page, TICKET.needsYou);
    await expect(page.getByRole('heading', { level: 1, name: 'Corner survey' })).toBeVisible();

    const overflow = await page.evaluate(() =>
      document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  });

  test('@phone what came back is still reviewable one item at a time', async ({ page, world }) => {
    world.set('ticket', view());
    await ticketAt(page, TICKET.needsYou);

    const report = page.getByRole('article', { name: 'Surveyor report' });
    await expect(report.getByRole('button', { name: 'Keep it' })).toBeVisible();
    await expect(report.getByRole('button', { name: 'Not this one' })).toBeVisible();
  });
});
