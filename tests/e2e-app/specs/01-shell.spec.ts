/**
 * The frame every screen is drawn inside — apps/web/src/w360/Shell.tsx.
 *
 * Wordmark, jump box, scheme toggle, avatar and assistant across the top; one
 * navigation rail down the left; the routed screen in the rest; the toast
 * stack and every Dialog in the module hung off the same host. Nothing here
 * belongs to a single screen, which is exactly why it is worth its own file:
 * a rail badge that lies, a search that reports "nothing matches" for a search
 * that never ran, or a refused write that resolves into silence are defects
 * every one of W01–W15 inherits at once.
 *
 * Four things a reader should know before changing anything below.
 *
 *  · The language switch is GONE. The brief for this file still lists "language
 *    and scheme toggles", but Shell.tsx:348-357 removed the EN / తెలుగు segment
 *    on purpose — both halves were static markup, so the app's primary audience
 *    tapped Telugu and got English. There is nothing to assert but its absence,
 *    and that is asserted.
 *  · The scheme is NOT reloaded in a test. fixtures/harness.ts writes
 *    `w360.scheme` in an addInitScript, which re-runs on every document load —
 *    so a `page.reload()` would prove the fixture's opinion, not the app's. The
 *    round trip is asserted in two halves instead: the toggle writes the choice
 *    down, and a page that starts with the choice already written honours it.
 *    The rail's `w360.rail` has no such fixture, so that one IS reloaded.
 *  · The assistant is not running in the sealed world (seed.ts answers 503 for
 *    /api/gateway/assistant), which is also true of the founder's laptop. The
 *    panel's honest state is only reached by SENDING, not by opening — and what
 *    it does to the question you typed on the way is the defect recorded below.
 *    Its WORKING path is reached by answering the two assistant routes from the
 *    test itself (`answerWith` below streams real SSE frames back), because a
 *    drawer that is only ever tested while the service is down proves nothing
 *    about the drawer.
 *  · The sealed world is a PLATFORM ADMIN (fixtures/seed.ts:190-193), so the
 *    rail under test here is the fifteen-entry one an operator sees, with the
 *    Pattadar desk at its foot: W17 added that entry and took "Admin & Ref
 *    Data" out, leaving six undrawn sections rather than seven. A test that
 *    wants the ordinary owner's fourteen entries sets `isPlatformAdmin` false,
 *    which is the cheaper of the two to arrange.
 *  · The drawer tests carry `@phone` AND set their own 390px viewport. The
 *    phone project is a WebKit device and this machine has only Chromium, so
 *    the project cannot launch; setting the width here means the branch below
 *    900px is still exercised by the desktop project, which does run.
 */
import { test, expect, World } from '../fixtures/harness';
import { ID, PAPER, TICKET } from '../fixtures/ids';

/** The rail, addressed the way the app labels it (Shell.tsx aria-label). */
const rail = (page: import('@playwright/test').Page) =>
  page.getByRole('navigation', { name: 'Sections' });

/** One rail entry by its exact accessible name — "Services 6" when the badge
 *  is up, "Services" when it is not, so the name IS the assertion. */
const railLink = (page: import('@playwright/test').Page, name: string) =>
  rail(page).getByRole('link', { name, exact: true });

const jumpBox = (page: import('@playwright/test').Page) =>
  page.getByLabel('Jump to a parcel, paper, person');

/** The results popup. It has no role of its own — the listbox inside it does —
 *  and the two status sentences are its direct children, so the panel is
 *  addressed by the id Shell.tsx gives it. */
const jumpResults = (page: import('@playwright/test').Page) => page.locator('#w360-jump-results');

/** The sections the rail points at that have been redrawn, and the heading each
 *  one must land on. The Dashboard greets by name and the greeting depends on
 *  the hour, so it is matched on the part that does not move. */
const DRAWN: Array<{ item: string; url: RegExp; heading: RegExp; level?: number }> = [
  { item: 'Properties', url: /\/app\/properties$/, heading: /^Properties/ },
  // Shared gives its h1 to the kit being read; the screen names itself in the
  // column beside it (Shared.tsx:90).
  { item: 'Shared with me', url: /\/app\/shared$/, heading: /^Shared with me$/, level: 2 },
  { item: 'Waiting on you 1', url: /\/app\/assigned$/, heading: /^Waiting on you$/ },
  { item: 'Maps', url: /\/app\/villages$/, heading: /^Maps$/ },
  { item: 'Papers', url: /\/app\/papers$/, heading: /^Papers$/ },
  { item: 'Services 6', url: /\/app\/services$/, heading: /^Work you can order$/ },
  { item: 'Wallet', url: /\/app\/wallet$/, heading: /^What is set aside, and what has gone$/ },
  { item: 'Dashboard', url: /\/app$/, heading: /Shankar Reddy/ },
];

/** The sections no design has arrived for (routes.tsx UNDRAWN), and the screen
 *  in the previous interface each one hands you to (Section.tsx SECTIONS). A
 *  "Not yet redrawn" card whose button goes nowhere useful is the same dead
 *  end as no card at all, so the destination is asserted, not just the label.
 *
 *  Six of them, not seven: `admin` left this list with W17. The rail's "Admin
 *  & Ref Data" entry is gone (Shell.tsx:283-288), /app/admin is a redirect
 *  into the Pattadar desk (routes.tsx), and Section.tsx has no `admin` key
 *  left to render — a stub under it would be a screen nothing routes to. The
 *  reference data itself is untouched at /legacy/admin. */
const UNDRAWN: Array<{ item: string; url: RegExp; heading: string; legacy: string }> = [
  { item: 'Families & Groups', url: /\/app\/groups$/, heading: 'Families & Groups', legacy: '/legacy/groups' },
  { item: 'Invitations', url: /\/app\/invitations$/, heading: 'Invitations', legacy: '/legacy/invitations' },
  { item: 'Notifications 3', url: /\/app\/notifications$/, heading: 'Notifications', legacy: '/legacy/notifications' },
  { item: 'Tools', url: /\/app\/tools$/, heading: 'Tools', legacy: '/legacy/tools' },
  { item: 'Audit Log', url: /\/app\/audit$/, heading: 'Audit Log', legacy: '/legacy/audit' },
  { item: 'Profile', url: /\/app\/profile$/, heading: 'Profile', legacy: '/legacy/profile' },
];

/** A desk answer thin enough to say one thing.
 *
 *  The rail reads exactly one field of this query — `unassigned`
 *  (Shell.tsx:130) — and the test below that sets it stays on the Dashboard,
 *  so the rest of the desk's shape is the desk screen's business and not this
 *  file's. `jobs` and `silent` are here only because they are lists the
 *  client types as arrays. */
const deskWith = (unassigned: number) => ({ unassigned, jobs: [], silent: [] });

// ── the rail ───────────────────────────────────────────────────────────

test.describe('the rail', () => {
  test('the rail lights up the section I am actually looking at', async ({ page }) => {
    await page.goto('/app');
    await expect(railLink(page, 'Dashboard')).toHaveAttribute('aria-current', 'page');

    await railLink(page, 'Papers').click();
    await expect(page).toHaveURL(/\/app\/papers$/);
    await expect(railLink(page, 'Papers')).toHaveAttribute('aria-current', 'page');
    // Dashboard is `end`, so it stops claiming the page the moment you leave it.
    await expect(railLink(page, 'Dashboard')).not.toHaveAttribute('aria-current', 'page');
  });

  test('opening one paper keeps Papers lit, because that is still where I am', async ({ page }) => {
    await page.goto('/app/papers/shelf/title');
    // The shelf names ITSELF in its h1 (Shelf.tsx:93), so this asserts the
    // shelf arrived rather than that some heading did.
    await expect(page.getByRole('heading', { level: 1, name: 'Title' })).toBeVisible();
    await expect(railLink(page, 'Papers')).toHaveAttribute('aria-current', 'page');
  });

  test('a record 360 is reached from the rail but belongs to none of it', async ({ page }) => {
    // Records hang off /app/records/:id, which no rail item points at — so the
    // rail marks nothing rather than marking something that is not open.
    await page.goto(`/app/records/${ID.parcel}`);
    await expect(page.getByRole('heading', { name: 'Sy 214/2' }).first()).toBeVisible();
    // All fifteen entries are there to mark — "nothing is marked" has to mean
    // that, and not "the rail never drew".
    await expect(rail(page).getByRole('link')).toHaveCount(15);
    // aria-current has no role-level matcher, so the attribute is the handle.
    await expect(rail(page).locator('a[aria-current="page"]')).toHaveCount(0);
  });

  // This was a live defect for as long as the one-service screen lived at
  // /app/tickets/:id: fifteen rail entries and not one of them marked, on a
  // screen you had reached from one of them. The screen moved to
  // /app/services/:id (routes.tsx:317), under the prefix the rail's Services
  // entry already points at (Shell.tsx:272), and only Dashboard carries
  // `end: true` (Shell.tsx:266) — so NavLink now lights Services for one job
  // exactly the way it lights Papers for one paper, two tests above, with no
  // Shell.tsx edit at all. The old /app/tickets/:id address still resolves as
  // a redirect; that half is 21-routing's.
  test('opening a job I ordered keeps Services lit, the way opening a paper keeps Papers lit', async ({ page }) => {
    await page.goto(`/app/services/${TICKET.placed}`);
    await expect(page.getByRole('heading', { level: 1, name: 'Encumbrance certificate' })).toBeVisible();
    await expect(railLink(page, 'Services 6')).toHaveAttribute('aria-current', 'page');
  });

  test('every section that has been redrawn opens from the rail', async ({ page }) => {
    await page.goto('/app');
    for (const { item, url, heading, level } of DRAWN) {
      await railLink(page, item).click();
      await expect(page).toHaveURL(url);
      // Each section is its own React.lazy chunk (routes.tsx), and this test
      // pulls eight of them in a row — patient on purpose.
      await expect(page.getByRole('heading', { level: level ?? 1, name: heading }).first())
        .toBeVisible({ timeout: 20_000 });
      await expect(page.getByText('There is no page at that address')).toHaveCount(0);
      // And the rail agrees with the screen about where we are.
      await expect(railLink(page, item)).toHaveAttribute('aria-current', 'page');
    }
  });

  test('the sections nobody has redrawn yet say so, and point at the one that works', async ({ page }) => {
    await page.goto('/app');
    for (const { item, url, heading, legacy } of UNDRAWN) {
      await railLink(page, item).click();
      await expect(page).toHaveURL(url);
      await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible();
      await expect(page.getByRole('heading', { name: 'Not yet redrawn' })).toBeVisible();
      // The way out has to go somewhere: Section.tsx:76 links each one at its
      // own screen in the previous interface, not at a shared landing page.
      await expect(page.getByRole('link', { name: `Open ${heading}` }))
        .toHaveAttribute('href', legacy);
      await expect(railLink(page, item)).toHaveAttribute('aria-current', 'page');
    }
  });

  // ── the Pattadar desk ──────────────────────────────────────────────
  //
  // The one entry in this rail that is nobody's section. W17 put the desk at
  // the foot of it and took "Admin & Ref Data" out, and the desk is drawn for
  // whoever runs Pattadar and for nobody else (Shell.tsx:540-545). The sealed
  // world is a platform admin by default (fixtures/seed.ts:190-193), so every
  // other test in this file is looking at the fifteen-entry rail an operator
  // sees; the one below that asks for the ordinary owner's rail says so.

  test('the operator’s desk sits at the foot of the rail, under the sections that are mine', async ({ page }) => {
    await page.goto('/app');
    const entries = rail(page).getByRole('link');
    await expect(entries).toHaveCount(15);
    // Last, and the last thing the reader reaches: it is the operator's entry,
    // not one of the owner's sections.
    await expect(entries.last()).toHaveAttribute('href', '/app/desk');
    // And the entry it replaced is gone from the rail entirely — two
    // admin-shaped entries with one of them dead is worse than either alone.
    // The /app/admin ADDRESS still resolves; that redirect is 21-routing's.
    await expect(rail(page).getByRole('link', { name: /Admin/ })).toHaveCount(0);

    await railLink(page, 'Pattadar desk 2').click();
    await expect(page).toHaveURL(/\/app\/desk$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Jobs waiting for somebody' }))
      .toBeVisible({ timeout: 20_000 });
    await expect(railLink(page, 'Pattadar desk 2')).toHaveAttribute('aria-current', 'page');
  });

  test('the number beside the desk is the jobs the desk says are waiting for somebody', async ({ page }) => {
    await page.goto('/app/desk');
    await expect(page.getByRole('heading', { level: 1, name: 'Jobs waiting for somebody' }))
      .toBeVisible({ timeout: 20_000 });
    // A job with nobody on it is the one offering "Find someone"; a job that
    // has somebody offers "Open the job" instead (Desk.tsx JobRow). Counted
    // off the screen rather than off the fixture, so the badge is checked
    // against what the operator is actually looking at.
    const waiting = await page.getByRole('link', { name: 'Find someone' }).count();
    expect(waiting, 'the seeded desk has jobs with nobody on them').toBeGreaterThan(0);
    await expect(railLink(page, `Pattadar desk ${waiting}`)).toBeVisible();
  });

  test('with somebody on every job the desk carries no number at all', async ({ page, world }) => {
    // `count: desk.data?.unassigned || undefined` (Shell.tsx:130). Every job
    // having somebody on it is the state the desk exists to reach, and a rail
    // that always carries a number is one the operator stops reading — the
    // same rule the other four badges are held to further down this file.
    world.set('desk', deskWith(0));
    await page.goto('/app');
    await expect(railLink(page, 'Pattadar desk')).toBeVisible();
    await expect(rail(page).getByText('0')).toHaveCount(0);
  });

  test('an owner who does not run Pattadar has no desk on the rail, and the desk is never asked about them', async ({ page, world }) => {
    world.set('portfolio', { ...world.seedOf('portfolio'), isPlatformAdmin: false });
    await page.goto('/app');
    // The portfolio really did answer — the badge beside Notifications is its
    // `waiting` — so the rail drew with the admin flag in hand and still drew
    // fourteen entries rather than fifteen.
    await expect(railLink(page, 'Notifications 3')).toBeVisible();
    await expect(rail(page).getByRole('link')).toHaveCount(14);
    await expect(rail(page).getByRole('link', { name: /Pattadar desk/ })).toHaveCount(0);

    // The reason DeskRail is a component and not a sixteenth line in `items`
    // (Shell.tsx:108-121): `desk` is one of the handful of reads that see
    // every owner's jobs, and it writes an audit row each time it answers.
    // A non-admin firing that query is a leak whatever the server answers —
    // the request left this account and named the desk — so the guarantee is
    // that the question is never sent, not that it is refused.
    expect(world.calls('desk'), 'a non-admin must not ask the desk anything').toEqual([]);
  });

  test('the number beside Services is the number of jobs Services lists', async ({ page }) => {
    await page.goto('/app/services');
    await expect(page.getByRole('heading', { name: 'Work you can order' })).toBeVisible();
    const jobs = await page.getByRole('link', { name: 'Open the service' }).count();
    expect(jobs, 'the seeded world has open jobs to count').toBeGreaterThan(0);
    await expect(railLink(page, `Services ${jobs}`)).toBeVisible();
  });

  test('the number beside Waiting on you is the work that screen says is waiting', async ({ page }) => {
    await page.goto('/app/assigned');
    await expect(page.getByRole('heading', { name: 'Waiting on you' })).toBeVisible();
    const waiting = await page.getByRole('link', { name: 'Open the service' }).count();
    expect(waiting, 'one seeded job is waiting on the owner').toBeGreaterThan(0);
    await expect(railLink(page, `Waiting on you ${waiting}`)).toBeVisible();
  });

  test('the number beside Notifications is the reminders the Dashboard is showing', async ({ page }) => {
    await page.goto('/app');
    await expect(page.getByRole('button', { name: /^Dismiss: / }).first()).toBeVisible();
    const reminders = await page.getByRole('button', { name: /^Dismiss: / }).count();
    expect(reminders, 'the seeded portfolio has reminders').toBeGreaterThan(0);
    await expect(railLink(page, `Notifications ${reminders}`)).toBeVisible();
  });

  test('the counts are the data and not decoration — change the data and they change', async ({ page, world }) => {
    world.set('orders', [{
      id: 'w-tkt-only', kind: 'ec', title: 'Encumbrance certificate', detail: '30 years',
      assignee: '', cost: 1_200, stage: 1, stageLabel: 'Placed', needsYou: true, dueDate: '',
      recordId: ID.parcel, recordTitle: 'Sy 214/2', params: '{}', status: 'placed',
      statusLabel: 'Placed', statusState: '', ref: 'W-9001', held: 0, pendingReview: 0,
    }]);
    world.set('portfolio', {
      ...world.seedOf('portfolio'),
      waiting: [world.seedOf<{ waiting: unknown[] }>('portfolio').waiting[0]],
    });
    await page.goto('/app');
    await expect(railLink(page, 'Services 1')).toBeVisible();
    await expect(railLink(page, 'Waiting on you 1')).toBeVisible();
    await expect(railLink(page, 'Notifications 1')).toBeVisible();
  });

  test('a job that came back with things to look at is waiting on me, even unaddressed', async ({ page, world }) => {
    // Shell.tsx:179 counts `needsYou || pendingReview > 0` and Orders.tsx:368
    // filters the Waiting screen by exactly the same rule. One row that is
    // ONLY pendingReview proves both halves of the OR are live — a badge that
    // quietly counted `needsYou` alone would still read 1 against a seeded
    // world and pass every other test in this file.
    const job = (over: Record<string, unknown>) => ({
      id: 'w-tkt-a', kind: 'survey', title: 'Corner survey', detail: 'Establish 8 corners',
      assignee: 'Ravi Kumar, licensed surveyor', cost: 6_500, stage: 4, stageLabel: 'Delivered',
      needsYou: false, dueDate: '2026-09-25', recordId: ID.parcel, recordTitle: 'Sy 214/2',
      params: '{}', status: 'delivered', statusLabel: 'Delivered', statusState: '',
      ref: 'W-9101', held: 6_500, pendingReview: 0, ...over,
    });
    world.set('orders', [
      job({ id: 'w-tkt-review', ref: 'W-9101', pendingReview: 2 }),
      job({ id: 'w-tkt-plain', ref: 'W-9102' }),
    ]);
    await page.goto('/app/assigned');

    await expect(railLink(page, 'Services 2')).toBeVisible();
    await expect(railLink(page, 'Waiting on you 1')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Open the service' })).toHaveCount(1);
  });

  test('dismissing a reminder takes the number beside Notifications down with it', async ({ page, world }) => {
    // The badge is not a snapshot taken at first paint: every w360 mutation
    // invalidates the lot (api.ts:688), so the rail asks again and the number
    // follows the screen. Answered from the call log so the second read is a
    // genuinely different answer.
    const seeded = world.seedOf<{ waiting: Array<Record<string, unknown>> }>('portfolio');
    world.set('portfolio', () => (world.calls('dismissWaiting').length
      ? { ...seeded, waiting: seeded.waiting.slice(1) }
      : seeded));

    await page.goto('/app');
    await expect(railLink(page, 'Notifications 3')).toBeVisible();

    await page.getByRole('button', { name: 'Dismiss: Land tax is due on Sy 214/2' }).click();
    await page.getByRole('button', { name: 'Dismiss it' }).click();

    await expect(page.getByRole('button', { name: 'Dismiss: Land tax is due on Sy 214/2' })).toHaveCount(0);
    await expect(railLink(page, 'Notifications 2')).toBeVisible();
  });

  test('nothing on the rail is a bare dot — every mark is a number I can act on', async ({ page }) => {
    await page.goto('/app');
    await expect(railLink(page, 'Services 6')).toBeVisible();
    // The rule is written at Shell.tsx:177-179: a dot that never clears trains
    // people to ignore the corner, a number that goes away when you have
    // looked does not. `NavItem.dot` (Shell.tsx:57) is still rendered
    // (Shell.tsx:434) and no item sets it; this is what keeps it that way.
    // The class is the handle because the span is aria-hidden decoration.
    await expect(rail(page).locator('.dot')).toHaveCount(0);
  });

  test('with nothing ordered and nothing waiting the rail wears no badges at all', async ({ page, world }) => {
    world.set('orders', []);
    world.set('portfolio', { ...world.seedOf('portfolio'), waiting: [] });
    await page.goto('/app');
    await expect(railLink(page, 'Services')).toBeVisible();
    await expect(railLink(page, 'Waiting on you')).toBeVisible();
    await expect(railLink(page, 'Notifications')).toBeVisible();
    // A zero badge is a badge: `count: ordered || undefined` (Shell.tsx:185-195).
    await expect(rail(page).getByText('0')).toHaveCount(0);
  });

  test('when the service desk cannot be reached the rail leaves the number off rather than guessing', async ({ page, world }) => {
    world.set('orders', World.gqlError('the service desk is down'));
    await page.goto('/app');
    await expect(railLink(page, 'Services')).toBeVisible();
    await expect(railLink(page, 'Waiting on you')).toBeVisible();
    // The reminders come from a query that DID answer, so that one still counts.
    await expect(railLink(page, 'Notifications 3')).toBeVisible();
  });

  test('while the jobs are still coming the rail does not put a number up early', async ({ page, world }) => {
    world.set('orders', World.never());
    await page.goto('/app');
    await expect(railLink(page, 'Services')).toBeVisible();
    await expect(rail(page).getByText('6')).toHaveCount(0);
  });

  test('collapsing the rail leaves every section reachable by name', async ({ page }) => {
    await page.goto('/app');
    await page.getByRole('button', { name: 'Collapse the rail' }).click();

    // The words are hidden, the destinations are not: title/aria-label stand in
    // for the label that is no longer on screen (Shell.tsx:423-428).
    await expect(rail(page).getByText('Properties')).toBeHidden();
    await expect(railLink(page, 'Properties')).toBeVisible();
    await expect(railLink(page, 'Properties')).toHaveAttribute('title', 'Properties');
    // And the badge is folded into the name, so it is still announced.
    await expect(railLink(page, 'Services, 6')).toBeVisible();

    await page.getByRole('button', { name: 'Show the rail' }).click();
    await expect(rail(page).getByText('Properties')).toBeVisible();
  });

  test('a collapsed rail is still collapsed when I come back to the app', async ({ page }) => {
    await page.goto('/app');
    await page.getByRole('button', { name: 'Collapse the rail' }).click();
    expect(await page.evaluate(() => localStorage.getItem('w360.rail'))).toBe('hidden');

    await page.reload();
    await expect(page.getByRole('button', { name: 'Show the rail' })).toBeVisible();
    await expect(rail(page).getByText('Properties')).toBeHidden();
  });

  test('walking from screen to screen does not re-ask the server for the frame', async ({ page, world }) => {
    await page.goto('/app');
    await expect(railLink(page, 'Services 6')).toBeVisible();
    world.clearCalls();

    await railLink(page, 'Papers').click();
    await expect(page).toHaveURL(/\/app\/papers$/);
    await expect(railLink(page, 'Papers')).toHaveAttribute('aria-current', 'page');
    await railLink(page, 'Properties').click();
    await expect(page).toHaveURL(/\/app\/properties$/);

    // api.ts KEY + main.tsx staleTime 30s: the rail's two queries are asked
    // once and shared by every screen. Re-asking them on each click is two
    // round trips per navigation on a phone connection, for numbers that have
    // not changed.
    expect(world.calls('portfolio'), 'the portfolio is not re-read per screen').toEqual([]);
    expect(world.calls('orders'), 'the orders are not re-read per screen').toEqual([]);
  });

  test('a window I drag narrow hands the rail to the hamburger and gets it out of the way', async ({ page }) => {
    await page.goto('/app');
    await expect(page.getByRole('button', { name: 'Collapse the rail' })).toBeVisible();

    // Shell.tsx:89-96 WATCHES the breakpoint rather than sampling it inside the
    // click handler. Sampled, the button changed what it did on the next click
    // but `inert` never moved, so a rail that was now a closed drawer stayed in
    // the tab order off-screen. `inert` is asserted through the DOM because it
    // takes the nav out of the accessible tree — there is no role left to ask.
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.getByRole('button', { name: 'Menu', exact: true })).toBeVisible();
    await expect(page.locator('nav[aria-label="Sections"]')).toHaveAttribute('inert', '');

    await page.setViewportSize({ width: 1512, height: 950 });
    await expect(page.getByRole('button', { name: 'Collapse the rail' })).toBeVisible();
    await expect(page.locator('nav[aria-label="Sections"]')).not.toHaveAttribute('inert', '');
    await expect(railLink(page, 'Papers')).toBeVisible();
  });

  test('a collapsed rail still takes me where I ask', async ({ page }) => {
    await page.goto('/app');
    await page.getByRole('button', { name: 'Collapse the rail' }).click();
    await railLink(page, 'Papers').click();
    await expect(page).toHaveURL(/\/app\/papers$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Papers' })).toBeVisible();
  });
});

// ── the jump box ───────────────────────────────────────────────────────

test.describe('the jump box', () => {
  test('the jump box finds a record, a paper and a person in the same breath', async ({ page, world }) => {
    await page.goto('/app');
    await jumpBox(page).fill('sa');

    await expect(page.getByRole('option', { name: /Flat 4B, Sai Residency/ })).toBeVisible();
    await expect(page.getByRole('option', { name: /Sale deed 4412 of 1998/ })).toBeVisible();
    await expect(page.getByRole('option', { name: /Sai Kumar/ })).toBeVisible();
    // Each hit says which kind of thing it is, in the API's own word.
    await expect(jumpResults(page).getByText('record', { exact: true })).toBeVisible();
    await expect(jumpResults(page).getByText('paper', { exact: true })).toBeVisible();
    await expect(jumpResults(page).getByText('person', { exact: true })).toBeVisible();
    expect(world.lastVars('search')).toMatchObject({ q: 'sa' });
  });

  test('the jump box tidies up what I typed before it asks', async ({ page, world }) => {
    await page.goto('/app');
    await jumpBox(page).fill('  katragunta  ');
    await expect(page.getByRole('option').first()).toBeVisible();
    expect(world.lastVars('search')).toMatchObject({ q: 'katragunta' });
  });

  test('picking a record out of the jump box opens that record', async ({ page }) => {
    await page.goto('/app');
    await jumpBox(page).fill('katragunta');
    await page.getByRole('option', { name: /Sy 214\/2/ }).click();
    await expect(page).toHaveURL(new RegExp(`/app/records/${ID.parcel}$`));
    await expect(page.getByRole('heading', { name: 'Sy 214/2' }).first()).toBeVisible();
  });

  test('picking a paper out of the jump box opens the paper, not the record it belongs to', async ({ page }) => {
    await page.goto('/app');
    await jumpBox(page).fill('encumbrance');
    await page.getByRole('option', { name: /Encumbrance certificate/ }).click();
    await expect(page).toHaveURL(new RegExp(`/app/papers/${PAPER.ec}$`));
  });

  test('picking a person out of the jump box lands on the people of their record', async ({ page }) => {
    await page.goto('/app');
    await jumpBox(page).fill('ramana');
    await page.getByRole('option', { name: /Ramana Rao/ }).click();
    await expect(page).toHaveURL(new RegExp(`/app/records/${ID.parcel}/people$`));
    await expect(page.getByText('Ramana Rao').first()).toBeVisible();
  });

  test('a jump that matches nothing says nothing matched, and names what I typed', async ({ page }) => {
    await page.goto('/app');
    await jumpBox(page).fill('zzqq');
    await expect(jumpResults(page)).toContainText(
      'Nothing matches “zzqq” — not a parcel, a paper or a person.',
    );
    await expect(page.getByRole('option')).toHaveCount(0);
  });

  test('a jump that could not run says so, and never claims my parcel is missing', async ({ page, world }) => {
    world.set('search', World.gqlError('the search index is down'));
    await page.goto('/app');
    await jumpBox(page).fill('katragunta');

    await expect(jumpResults(page)).toContainText(
      'That search could not run. It is the connection, not your records.',
    );
    // The sentence that must never appear for a search that never happened.
    await expect(jumpResults(page)).not.toContainText('Nothing matches');
    // And the same thing is said to a screen reader, not just drawn.
    await expect(page.getByRole('status')).toContainText('That search could not run.');
  });

  test('while the answer is still coming the box says it is searching, not that there is nothing', async ({ page, world }) => {
    world.set('search', World.slow(2_000, []));
    await page.goto('/app');
    await jumpBox(page).fill('katragunta');
    await expect(jumpResults(page)).toContainText('Searching…');
    await expect(jumpResults(page)).not.toContainText('Nothing matches');
    await expect(jumpResults(page)).toContainText('Nothing matches “katragunta”');
  });

  test('one letter is not a search, and nothing is asked of the server for it', async ({ page, world }) => {
    await page.goto('/app');
    await jumpBox(page).fill('s');
    await expect(jumpResults(page)).toHaveCount(0);
    await expect(jumpBox(page)).toHaveAttribute('aria-expanded', 'false');
    expect(world.calls('search'), 'a single letter must not be sent to the API').toEqual([]);
  });

  test('⌘K puts the caret in the jump box from anywhere on the page', async ({ page }) => {
    await page.goto('/app');
    await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
    await page.keyboard.press('Meta+k');
    await expect(jumpBox(page)).toBeFocused();
  });

  test('Ctrl-K does the same, for the half of the country not on a Mac', async ({ page }) => {
    await page.goto('/app');
    await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
    await page.keyboard.press('Control+k');
    await expect(jumpBox(page)).toBeFocused();
  });

  test('the arrow keys walk the hits and Enter takes the one I am on', async ({ page }) => {
    await page.goto('/app');
    await jumpBox(page).fill('katragunta');
    await expect(page.getByRole('option')).toHaveCount(2);
    // The first hit is active before a key is pressed.
    await expect(page.getByRole('option', { name: /Sy 214\/2/ })).toHaveAttribute('aria-selected', 'true');

    await jumpBox(page).press('ArrowDown');
    await expect(page.getByRole('option', { name: /Sy 301/ })).toHaveAttribute('aria-selected', 'true');
    await expect(jumpBox(page)).toHaveAttribute('aria-activedescendant', 'w360-hit-1');

    await jumpBox(page).press('ArrowUp');
    await expect(page.getByRole('option', { name: /Sy 214\/2/ })).toHaveAttribute('aria-selected', 'true');

    await jumpBox(page).press('ArrowDown');
    await jumpBox(page).press('Enter');
    await expect(page).toHaveURL(new RegExp(`/app/records/${ID.watched}$`));
  });

  test('ArrowUp on the first hit stays on the first hit', async ({ page }) => {
    await page.goto('/app');
    await jumpBox(page).fill('katragunta');
    await expect(page.getByRole('option')).toHaveCount(2);
    await jumpBox(page).press('ArrowUp');
    await expect(page.getByRole('option', { name: /Sy 214\/2/ })).toHaveAttribute('aria-selected', 'true');
  });

  test('ArrowDown on the last hit stays on the last hit', async ({ page }) => {
    // Shell.tsx:249 clamps at hits.length - 1. Unclamped, activeHit walked off
    // the end and Enter submitted `hits[undefined] ?? hits[0]` — the first hit,
    // for someone who had arrowed to the bottom of the list.
    await page.goto('/app');
    await jumpBox(page).fill('katragunta');
    await expect(page.getByRole('option')).toHaveCount(2);

    await jumpBox(page).press('ArrowDown');
    await jumpBox(page).press('ArrowDown');
    await expect(page.getByRole('option', { name: /Sy 301/ })).toHaveAttribute('aria-selected', 'true');
    await expect(jumpBox(page)).toHaveAttribute('aria-activedescendant', 'w360-hit-1');

    await jumpBox(page).press('Enter');
    await expect(page).toHaveURL(new RegExp(`/app/records/${ID.watched}$`));
  });

  test('the hit my pointer is resting on is the one Enter takes', async ({ page }) => {
    // Shell.tsx:286 — pointer and keyboard drive the same selection, so the
    // row under the cursor is the row Enter opens.
    await page.goto('/app');
    await jumpBox(page).fill('katragunta');
    await page.getByRole('option', { name: /Sy 301/ }).hover();
    await expect(page.getByRole('option', { name: /Sy 301/ })).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByRole('option', { name: /Sy 214\/2/ })).toHaveAttribute('aria-selected', 'false');

    await jumpBox(page).press('Enter');
    await expect(page).toHaveURL(new RegExp(`/app/records/${ID.watched}$`));
  });

  test('changing my mind mid-word puts the highlight back on the first hit', async ({ page }) => {
    // Shell.tsx:133. Without it the highlight stayed on index 1 while the list
    // under it was replaced, so Enter opened the second hit of a list the
    // person had not read yet.
    await page.goto('/app');
    await jumpBox(page).fill('sa');
    await expect(page.getByRole('option')).toHaveCount(3);
    await jumpBox(page).press('ArrowDown');
    await expect(page.getByRole('option').nth(1)).toHaveAttribute('aria-selected', 'true');

    await jumpBox(page).fill('sai');
    await expect(page.getByRole('option').first()).toHaveAttribute('aria-selected', 'true');
    await expect(jumpBox(page)).toHaveAttribute('aria-activedescendant', 'w360-hit-0');
  });

  test('with nothing to jump to, nothing is announced as the row I am on', async ({ page }) => {
    // Shell.tsx:264: aria-activedescendant is left off unless a hit is really
    // under the index. Pointed at "w360-hit-0" over an empty list, a screen
    // reader is told the caret is on a row that does not exist.
    await page.goto('/app');
    await jumpBox(page).fill('zzqq');
    await expect(jumpResults(page)).toContainText('Nothing matches');
    await expect(jumpBox(page)).not.toHaveAttribute('aria-activedescendant', /./);

    await jumpBox(page).press('ArrowDown');
    await expect(jumpBox(page)).not.toHaveAttribute('aria-activedescendant', /./);
  });

  test('Enter on an empty jump box leaves me exactly where I was', async ({ page, world }) => {
    // Shell.tsx:236 guards on `q.trim()`; without it Enter on an empty box
    // walked off the Dashboard onto an empty Properties search.
    await page.goto('/app');
    await expect(page.getByRole('heading', { level: 1, name: /Shankar Reddy/ })).toBeVisible();

    await jumpBox(page).press('Enter');
    await expect(page).toHaveURL(/\/app$/);
    await expect(page.getByRole('heading', { level: 1, name: /Shankar Reddy/ })).toBeVisible();
    expect(world.calls('search'), 'an empty box asks the server nothing').toEqual([]);
  });

  test('a box with nothing but spaces in it is not a search', async ({ page, world }) => {
    // Two characters of whitespace is two characters. The gate is on the
    // TRIMMED text in both places that read it (Shell.tsx:167, api.ts:571).
    await page.goto('/app');
    await jumpBox(page).fill('   ');
    await expect(jumpResults(page)).toHaveCount(0);
    await expect(jumpBox(page)).toHaveAttribute('aria-expanded', 'false');
    expect(world.calls('search'), 'whitespace must not be sent to the API').toEqual([]);
  });

  test('Escape closes the results and leaves what I typed alone', async ({ page }) => {
    await page.goto('/app');
    await jumpBox(page).fill('katragunta');
    await expect(jumpResults(page)).toBeVisible();

    await jumpBox(page).press('Escape');
    await expect(jumpResults(page)).toHaveCount(0);
    await expect(jumpBox(page)).toHaveValue('katragunta');
    await expect(jumpBox(page)).toHaveAttribute('aria-expanded', 'false');
  });

  test('clicking away from the jump box puts the results away', async ({ page }) => {
    await page.goto('/app');
    await jumpBox(page).fill('katragunta');
    await expect(jumpResults(page)).toBeVisible();

    // The avatar: outside the jump box and over nothing the results cover.
    // It used to be the ideal target here because it did nothing at all when
    // clicked; it opens the account menu now, so both halves are asserted —
    // a comment claiming a control is inert is how an inert control survives.
    await page.getByLabel('Your account — Shankar Reddy').click();
    await expect(jumpResults(page)).toHaveCount(0);
    await expect(page.getByRole('menuitem', { name: 'Sign out' })).toBeVisible();
  });

  test('coming back to the box with the words still in it opens the results again', async ({ page }) => {
    await page.goto('/app');
    await jumpBox(page).fill('katragunta');
    await jumpBox(page).press('Escape');
    await expect(jumpResults(page)).toHaveCount(0);

    await jumpBox(page).blur();
    await jumpBox(page).focus();
    await expect(jumpResults(page)).toBeVisible();
  });

  test('going somewhere empties the jump box behind me', async ({ page }) => {
    await page.goto('/app');
    await jumpBox(page).fill('katragunta');
    await page.getByRole('option', { name: /Sy 214\/2/ }).click();
    await expect(page).toHaveURL(new RegExp(`/app/records/${ID.parcel}$`));
    await expect(jumpBox(page)).toHaveValue('');
  });

  test('Enter on a search with no hits hands the words to Properties rather than doing nothing', async ({ page }) => {
    await page.goto('/app');
    await jumpBox(page).fill('zzqq');
    await expect(jumpResults(page)).toContainText('Nothing matches');
    await jumpBox(page).press('Enter');

    await expect(page).toHaveURL(/\/app\/properties\?q=zzqq$/);
    await expect(page.getByText('Nothing matches “zzqq”')).toBeVisible();
  });

  test('the results tell a screen reader how many there are', async ({ page }) => {
    await page.goto('/app');
    await jumpBox(page).fill('katragunta');
    await expect(page.getByRole('status')).toContainText('2 results.');

    await jumpBox(page).fill('sa');
    await expect(page.getByRole('status')).toContainText('3 results.');
  });

  test('the live region says nothing at all until there is something to say', async ({ page }) => {
    // Shell.tsx:334-343 keeps the region mounted and EMPTY so it exists before
    // it speaks. A region that announced "Nothing matches ." on every page
    // load would be read out to someone who never touched the box.
    await page.goto('/app');
    await expect(page.getByRole('status')).toHaveText('');

    await jumpBox(page).fill('katragunta');
    await expect(page.getByRole('status')).toContainText('2 results.');

    await jumpBox(page).press('Escape');
    await expect(page.getByRole('status')).toHaveText('');
  });

  // DEFECT. `useSearch` holds the previous answer while the next one is in
  // flight (api.ts:573, keepPreviousData) and the panel draws whatever `hits`
  // holds (Shell.tsx:277) with no sign that it is stale — the "Searching…"
  // line is gated on `hits.length === 0` (Shell.tsx:327), so it never appears
  // over old results. Submit then takes `hits[activeHit] ?? hits[0]`
  // (Shell.tsx:234): on a phone connection, typing new words and pressing
  // Enter opens a record that matches the OLD ones. The owner is owed the hits
  // cleared — or at least held back from Enter — while the words under them
  // have changed.
  test.fail('Enter never opens a record that does not match the words in the box', async ({ page, world }) => {
    const hit = {
      id: ID.parcel, kind: 'record', title: 'Sy 214/2',
      subtitle: 'Katragunta, Markapur, Prakasam', route: `/app/records/${ID.parcel}`,
    };
    // The first search answers at once; the second is still running when Enter
    // is pressed, which is the whole scenario.
    world.set('search', (vars) => (String(vars.q) === 'katragunta' ? [hit] : World.slow(3_000, [])));

    await page.goto('/app');
    await jumpBox(page).fill('katragunta');
    await expect(page.getByRole('option', { name: /Sy 214\/2/ })).toBeVisible();

    await jumpBox(page).fill('zzqq');
    await jumpBox(page).press('Enter');
    await expect(page).toHaveURL(/\/app\/properties\?q=zzqq$/, { timeout: 3_000 });
  });
});

// ── the top bar ────────────────────────────────────────────────────────

test.describe('the top bar', () => {
  test('the wordmark takes me home from anywhere', async ({ page }) => {
    await page.goto('/app/papers');
    await page.getByRole('link', { name: 'Pattadar.' }).click();
    await expect(page).toHaveURL(/\/app$/);
    await expect(page.getByRole('heading', { level: 1, name: /Shankar Reddy/ })).toBeVisible();
  });

  test('the avatar wears my own initials, not a letter chosen for everybody', async ({ page }) => {
    await page.goto('/app');
    await expect(page.getByLabel('Your account — Shankar Reddy')).toHaveText('SR');
  });

  test('a name with no surname on it still gets two letters of its own', async ({ page, world }) => {
    // initialsOf (ui.tsx:166-171) takes the first two letters when there is
    // only one word, rather than one letter beside a lot of empty circle.
    world.set('portfolio', { ...world.seedOf('portfolio'), displayName: 'Ramanamma' });
    await page.goto('/app');
    await expect(page.getByLabel('Your account — Ramanamma')).toHaveText('RA');
  });

  test('until my name is known the avatar does not invent one', async ({ page, world }) => {
    world.set('portfolio', World.never());
    await page.goto('/app');
    await expect(page.getByLabel('Your account', { exact: true })).toBeVisible();
    await expect(page.getByLabel('Your account', { exact: true })).toHaveText('');
  });

  test('an account with no name on it yet gets the person mark, not somebody else’s letter', async ({ page, world }) => {
    world.set('portfolio', { ...world.seedOf('portfolio'), displayName: '' });
    await page.goto('/app');
    await expect(page.getByLabel('Your account', { exact: true })).toBeVisible();
    await expect(page.getByLabel('Your account', { exact: true })).toHaveText('');
  });

  // ── the account menu ──────────────────────────────────────────────
  //
  // W360 shipped with no sign-out ANYWHERE. The avatar was a bare <span>:
  // the shape every application gives the account control, in the corner
  // every application puts it, answering nothing. The only working "Sign
  // out" in the product was three screens away in the LEGACY shell —
  // rail → Profile → "not yet redrawn" → /legacy/profile → its avatar menu.
  //
  // The founder found it by trying to leave. These tests are the standing
  // guard on the way out, because the way out is the one control a person
  // reaches for when nothing else is working.

  test.describe('the account menu', () => {
    // Scoped to the BUTTON on purpose. Once the menu is open, two elements
    // answer to this name — the trigger and the list it opened — because the
    // WAI-ARIA menu-button pattern labels a menu by the button that owns it.
    // A bare getByLabel is ambiguous from the first click onwards.
    const avatar = (page: import('@playwright/test').Page) =>
      page.getByRole('button', { name: 'Your account — Shankar Reddy' });

    test('the avatar opens a menu, and the menu says whose account it is', async ({ page }) => {
      await page.goto('/app');
      await expect(avatar(page)).toHaveAttribute('aria-expanded', 'false');

      await avatar(page).click();
      await expect(page.getByRole('menu', { name: /Your account/ })).toBeVisible();
      await expect(avatar(page)).toHaveAttribute('aria-expanded', 'true');
      // Named above the items for the same reason every kebab in this module
      // is: a column of verbs with no subject, and one of them signs you out.
      await expect(page.locator('.menu-list .menuhead')).toHaveText('Shankar Reddy');
    });

    test('the way out of the app is on it', async ({ page }) => {
      await page.goto('/app');
      await avatar(page).click();
      await expect(page.getByRole('menuitem', { name: 'Sign out' })).toBeVisible();
    });

    test('signing out leaves the app for the front door', async ({ page }) => {
      await page.goto('/app');
      await avatar(page).click();

      const frontDoor = page.waitForRequest(
        (r) => r.isNavigationRequest() && new URL(r.url()).pathname === '/');
      await page.getByRole('menuitem', { name: 'Sign out' }).click();

      // The NAVIGATION is the assertion, not where the browser settles.
      //
      // AuthProvider.signOut clears the live session and then assigns the
      // location to "/", so the whole app — react-query cache included — goes
      // with the document. In this suite it does not STAY there: fixtures/
      // session.ts writes the session in an addInitScript, which re-runs on
      // the document sign-out navigates to, so LandingPage.tsx:172 sees a
      // signed-in visitor and bounces straight back to /app. That is the
      // fixture talking, not the app — a real sign-out leaves no tokens for
      // the landing page to find.
      //
      // So this asserts the thing the fixture cannot forge: the request for
      // the front door actually leaving the browser. The token teardown is
      // AuthProvider's, and the @live project exercises the surrounding flow
      // with a token validated by the local gateway.
      await frontDoor;
    });

    test('both account screens are one click away, and land where they say', async ({ page }) => {
      await page.goto('/app');
      await avatar(page).click();
      await page.getByRole('menuitem', { name: 'Profile' }).click();
      await expect(page).toHaveURL(/\/app\/profile$/);

      await avatar(page).click();
      // routes.tsx has mounted /app/account all along — the DPDP screen for
      // consent, export and deletion — reachable from nowhere inside W360.
      await page.getByRole('menuitem', { name: 'Privacy & your data' }).click();
      await expect(page).toHaveURL(/\/app\/account$/);
    });

    test('Escape puts the menu away and hands focus back to the avatar', async ({ page }) => {
      await page.goto('/app');
      await avatar(page).click();
      await expect(page.getByRole('menu', { name: /Your account/ })).toBeVisible();

      await page.keyboard.press('Escape');
      await expect(page.getByRole('menu', { name: /Your account/ })).toHaveCount(0);
      await expect(avatar(page)).toBeFocused();
    });
  });

  test('the frame stands even when the screen inside it falls over', async ({ page, world }) => {
    world.set('portfolio', World.gqlError('the portfolio store is down'));
    await page.goto('/app');

    await expect(rail(page)).toBeVisible();
    await expect(page.getByRole('link', { name: 'Pattadar.' })).toBeVisible();
    await expect(jumpBox(page)).toBeVisible();
    await expect(page.getByLabel('Your account', { exact: true })).toBeVisible();
    // And the screen inside says what went wrong, with the reason in its words.
    await expect(page.getByText('the portfolio store is down')).toBeVisible();
  });

  test('the language switch that never switched anything is gone', async ({ page }) => {
    // Shell.tsx:348-357: both segments were static markup with aria-pressed
    // hardcoded, so Telugu was a button that did nothing. Removed rather than
    // wired, because apps/web has no translation layer to wire it to.
    await page.goto('/app');
    await expect(page.getByRole('button', { name: 'తెలుగు' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'EN' })).toHaveCount(0);
  });

  test.describe('on a machine with no ⌘ key', () => {
    // The app reads neither the user agent nor navigator.platform — that is
    // the point. This is a Windows owner looking at the same markup.
    test.use({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
        + '(KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
    });

    // DEFECT. The hint is the literal string "⌘K" (Shell.tsx:268) while the
    // handler behind it accepts Ctrl just as happily (Shell.tsx:138). Most of
    // the people this is built for are on Windows or Android keyboards with no
    // ⌘ on them at all, and are being shown a key they cannot press. The owner
    // is owed the shortcut their own machine uses — the same one-line platform
    // check every other app does — or no hint at all.
    test.fail('the shortcut the jump box advertises is one this keyboard has', async ({ page }) => {
      await page.goto('/app');
      await expect(jumpBox(page)).toBeVisible();
      await expect(page.locator('kbd')).toHaveText(/ctrl/i);
    });

    test('and Ctrl-K works there whatever the hint says', async ({ page }) => {
      await page.goto('/app');
      await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
      await page.keyboard.press('Control+k');
      await expect(jumpBox(page)).toBeFocused();
    });
  });
});

// ── dark and light ─────────────────────────────────────────────────────

test.describe('the theme menu', () => {
  test('offers all three themes, switches to light and writes the choice down', async ({ page }) => {
    await page.goto('/app');
    // The scheme is an attribute on the app's own root; nothing in the
    // accessible tree carries it, so the attribute is what there is to read.
    await expect(page.locator('[data-scheme]')).toHaveAttribute('data-scheme', 'dark');

    await page.getByRole('button', { name: 'Change theme' }).click();
    const menu = page.getByRole('menu', { name: 'Change theme' });
    await expect(menu.getByRole('menuitemradio', { name: 'Light' })).toBeVisible();
    await expect(menu.getByRole('menuitemradio', { name: 'Dark' })).toHaveAttribute('aria-checked', 'true');
    await expect(menu.getByRole('menuitemradio', { name: 'High Contrast' })).toBeVisible();
    await menu.getByRole('menuitemradio', { name: 'Light' }).click();

    await expect(page.locator('[data-scheme]')).toHaveAttribute('data-scheme', 'light');
    expect(await page.evaluate(() => localStorage.getItem('w360.scheme'))).toBe('light');
  });

  test('and switches straight back to dark', async ({ page }) => {
    await page.goto('/app');
    await page.getByRole('button', { name: 'Change theme' }).click();
    await page.getByRole('menuitemradio', { name: 'Light' }).click();
    await page.getByRole('button', { name: 'Change theme' }).click();
    await page.getByRole('menuitemradio', { name: 'Dark' }).click();
    await expect(page.locator('[data-scheme]')).toHaveAttribute('data-scheme', 'dark');
    expect(await page.evaluate(() => localStorage.getItem('w360.scheme'))).toBe('dark');
  });

  test.describe('with light already chosen', () => {
    test.use({ scheme: 'light' });

    test('a light theme chosen last time is what the app opens in', async ({ page }) => {
      await page.goto('/app');
      await expect(page.locator('[data-scheme]')).toHaveAttribute('data-scheme', 'light');
      await page.getByRole('button', { name: 'Change theme' }).click();
      await expect(page.getByRole('menuitemradio', { name: 'Light' }))
        .toHaveAttribute('aria-checked', 'true');
    });
  });
});

// ── the assistant ──────────────────────────────────────────────────────

test.describe('the assistant', () => {
  test('the assistant button opens the drawer and the assistant introduces itself', async ({ page }) => {
    await page.goto('/app');
    await expect(page.getByRole('button', { name: 'Assistant', exact: true }))
      .toHaveAttribute('aria-expanded', 'false');

    await page.getByRole('button', { name: 'Assistant', exact: true }).click();
    await expect(page.getByText("Hello! I'm your Pattadar assistant.")).toBeVisible();
    await expect(page.getByLabel('Message the assistant')).toBeVisible();
    // The open drawer is a MUI Modal, which aria-hides the rest of the app —
    // so the button behind it is addressed by its label rather than its role.
    await expect(page.getByLabel('Assistant', { exact: true }))
      .toHaveAttribute('aria-expanded', 'true');
  });

  test('the assistant drawer closes and gives the screen back', async ({ page }) => {
    await page.goto('/app');
    await page.getByRole('button', { name: 'Assistant', exact: true }).click();
    await expect(page.getByText("Hello! I'm your Pattadar assistant.")).toBeVisible();

    await page.getByRole('button', { name: 'Close assistant' }).click();
    await expect(page.getByText("Hello! I'm your Pattadar assistant.")).toBeHidden();
    await expect(page.getByRole('button', { name: 'Assistant', exact: true }))
      .toHaveAttribute('aria-expanded', 'false');
  });

  test('opening the assistant asks the assistant service for nothing until I say something', async ({ page, world }) => {
    await page.goto('/app');
    await page.getByRole('button', { name: 'Assistant', exact: true }).click();
    await expect(page.getByText("Hello! I'm your Pattadar assistant.")).toBeVisible();
    expect(world.restCalls(/\/assistant\//)).toEqual([]);
  });

  test('Escape puts the assistant away without touching the screen behind it', async ({ page }) => {
    await page.goto('/app');
    await page.getByRole('button', { name: 'Assistant', exact: true }).click();
    await expect(page.getByText("Hello! I'm your Pattadar assistant.")).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(page.getByText("Hello! I'm your Pattadar assistant.")).toBeHidden();
    await expect(page.getByRole('button', { name: 'Assistant', exact: true }))
      .toHaveAttribute('aria-expanded', 'false');
    await expect(page).toHaveURL(/\/app$/);
  });

  test('the send button will not fire on an empty question', async ({ page, world }) => {
    // AssistantPanel.tsx:361 — disabled until there is something to send, so a
    // stray tap cannot open a conversation with nothing in it.
    await page.goto('/app');
    await page.getByRole('button', { name: 'Assistant', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Send message' })).toBeDisabled();

    await page.getByLabel('Message the assistant').fill('   ');
    await expect(page.getByRole('button', { name: 'Send message' })).toBeDisabled();

    await page.getByLabel('Message the assistant').fill('Is the tax paid?');
    await expect(page.getByRole('button', { name: 'Send message' })).toBeEnabled();
    expect(world.restCalls(/\/assistant\//)).toEqual([]);
  });

  test.describe('when the assistant service is answering', () => {
    /** One SSE frame per event, the way the gateway sends them. */
    const sse = (...events: string[]) => events.map((e) => `data: ${e}\n\n`).join('');

    /** Answer the two assistant routes from inside the test. Registered after
     *  the seed's blanket 503 (fixtures/seed.ts:888), and world.route puts the
     *  newest first, so these win for this test only. */
    const answering = (world: World, body: string) => {
      world.route(/\/assistant\/api\/conversations/, () => ({ json: { id: 'w-conv-1' } }));
      world.route(/\/assistant\/api\/chat\/stream/, () => ({
        contentType: 'text/event-stream', body,
      }));
    };

    const ask = async (page: import('@playwright/test').Page, question: string) => {
      await page.getByLabel('Message the assistant').fill(question);
      await page.getByRole('button', { name: 'Send message' }).click();
    };

    test('the assistant answers, and my question is still there above the answer', async ({ page, world }) => {
      answering(world, sse(
        JSON.stringify({ type: 'thinking' }),
        JSON.stringify({ type: 'token', text: 'The tax on **Sy 214/2** is ' }),
        JSON.stringify({ type: 'token', text: 'paid to 2025-26.' }),
        '[DONE]',
      ));
      await page.goto('/app');
      await page.getByRole('button', { name: 'Assistant', exact: true }).click();
      await ask(page, 'Is the tax on Sy 214/2 paid?');

      await expect(page.getByText('Is the tax on Sy 214/2 paid?')).toBeVisible();
      await expect(page.getByText('paid to 2025-26.').first()).toBeVisible();
      // **bold** arrives as bold rather than as four asterisks on screen
      // (AssistantPanel.tsx:44). A `thinking` frame is ignored, not printed.
      await expect(page.locator('strong').filter({ hasText: 'Sy 214/2' })).toBeVisible();
      await expect(page.getByText('**')).toHaveCount(0);
      await expect(page.getByText('thinking')).toHaveCount(0);
      // The box is empty and ready for the next one.
      await expect(page.getByLabel('Message the assistant')).toHaveValue('');
    });

    test('an answer cut off halfway keeps what arrived and says the line dropped', async ({ page, world }) => {
      // AssistantPanel.tsx:197-201 — the branch where SOMETHING streamed. It
      // must not behave like the nothing-streamed branch below it, which
      // throws the question away.
      answering(world, sse(
        JSON.stringify({ type: 'token', text: 'The tax was last paid in ' }),
        JSON.stringify({ type: 'error', text: 'upstream gave up' }),
      ));
      await page.goto('/app');
      await page.getByRole('button', { name: 'Assistant', exact: true }).click();
      await ask(page, 'When was the tax last paid?');

      await expect(page.getByText('The tax was last paid in').first()).toBeVisible();
      await expect(page.getByText('Sorry — I lost the connection there. Please try again.').first())
        .toBeVisible();
      await expect(page.getByText('When was the tax last paid?')).toBeVisible();
      // And this one is recoverable: the composer is still on screen.
      await expect(page.getByLabel('Message the assistant')).toBeVisible();
      await expect(page.getByText('Assistant will be available soon')).toHaveCount(0);
    });

    test('a second question goes into the same conversation rather than starting a new one', async ({ page, world }) => {
      answering(world, sse(JSON.stringify({ type: 'token', text: 'Yes.' }), '[DONE]'));
      await page.goto('/app');
      await page.getByRole('button', { name: 'Assistant', exact: true }).click();
      await ask(page, 'Is the tax paid?');
      await expect(page.getByText('Yes.').first()).toBeVisible();

      // Enter sends too (AssistantPanel.tsx:338-342) — the way anyone actually
      // types a second question.
      await page.getByLabel('Message the assistant').fill('And the one on Sy 301?');
      await page.getByLabel('Message the assistant').press('Enter');
      await expect(page.getByText('And the one on Sy 301?')).toBeVisible();

      expect(world.restCalls(/\/assistant\/api\/conversations/),
        'the conversation is created once and reused (AssistantPanel.tsx:122-133)').toHaveLength(1);
      expect(world.restCalls(/\/assistant\/api\/chat\/stream/)).toHaveLength(2);
    });
  });

  test.describe('when the assistant service is not running', () => {
    // The send is answered 503 by the seal — exactly what the founder's laptop
    // does — and the browser logs that response. Provoking it is the point of
    // all three of these, so the console guard is stood down for them.
    test.use({ allowConsole: true });

    const askAndFail = async (page: import('@playwright/test').Page) => {
      await page.goto('/app');
      await page.getByRole('button', { name: 'Assistant', exact: true }).click();
      await page.getByLabel('Message the assistant').fill('Is the tax on Sy 214/2 paid?');
      await page.getByRole('button', { name: 'Send message' }).click();
      await expect(page.getByText('Assistant will be available soon')).toBeVisible();
    };

    test('the assistant says plainly that it could not be reached, and that my records are safe', async ({ page, world }) => {
      await askAndFail(page);
      await expect(page.getByText("We couldn't reach the assistant right now")).toBeVisible();
      await expect(page.getByText('Your land records are safe')).toBeVisible();
      expect(world.restCalls(/\/assistant\//), 'it really did try').not.toEqual([]);
    });

    // DEFECT. AssistantPanel.tsx:193-196 pops BOTH bubbles when nothing
    // streamed — the question the owner typed is deleted along with the empty
    // answer, and `input` was already cleared at line 138. A question typed on
    // a phone is gone with no copy of it anywhere. The owner is owed their own
    // words back: left in the box, or left on screen above the notice.
    test.fail('the question I typed survives the assistant being unreachable', async ({ page }) => {
      await askAndFail(page);
      await expect(page.getByText('Is the tax on Sy 214/2 paid?')).toBeVisible();
    });

    // DEFECT. `unavailable` is never set back to false (AssistantPanel.tsx:112,
    // 194) and the composer renders only `{!unavailable && …}` (line 323), so
    // one failed send kills the panel for the rest of the session — closing and
    // reopening it does not bring the box back, and nothing on screen offers a
    // retry. The owner is owed a way to ask again once the line is back up.
    test.fail('the assistant can be tried again after it has failed once', async ({ page }) => {
      await askAndFail(page);
      await page.getByRole('button', { name: 'Close assistant' }).click();
      await page.getByRole('button', { name: 'Assistant', exact: true }).click();
      await expect(page.getByLabel('Message the assistant')).toBeVisible();
    });
  });
});

// ── what the app says back ─────────────────────────────────────────────

test.describe('toasts', () => {
  test('a write the server refuses says so, in the owner’s words and with the reason', async ({ page, world }) => {
    world.set('dismissWaiting', World.gqlError('the reminder store is down'));
    await page.goto('/app');
    await page.getByRole('button', { name: 'Dismiss: Land tax is due on Sy 214/2' }).click();
    await page.getByRole('button', { name: 'Dismiss it' }).click();

    const toast = page.getByRole('alert');
    await expect(toast).toContainText('That item could not be saved. Nothing has changed.');
    await expect(toast).toContainText('the reminder store is down');
    // The reminder is still on the Dashboard, because nothing was dismissed.
    await expect(page.getByRole('button', { name: 'Dismiss: Land tax is due on Sy 214/2' })).toBeVisible();
  });

  test('a failure sits there until I put it away', async ({ page, world }) => {
    world.set('dismissWaiting', World.gqlError('the reminder store is down'));
    await page.goto('/app');
    await page.getByRole('button', { name: 'Dismiss: Land tax is due on Sy 214/2' }).click();
    await page.getByRole('button', { name: 'Dismiss it' }).click();
    await expect(page.getByRole('alert')).toBeVisible();

    // Toast.tsx:65,85-87: successes slide away after 4.5s, failures never do.
    // Polled rather than slept, and the assertion is what is on screen after.
    const raised = Date.now();
    await expect.poll(() => Date.now() - raised, { timeout: 12_000, intervals: [500] })
      .toBeGreaterThan(6_000);
    await expect(page.getByRole('alert')).toBeVisible();
  });

  test('a toast can be put away', async ({ page, world }) => {
    world.set('dismissWaiting', World.gqlError('the reminder store is down'));
    await page.goto('/app');
    await page.getByRole('button', { name: 'Dismiss: Land tax is due on Sy 214/2' }).click();
    await page.getByRole('button', { name: 'Dismiss it' }).click();
    await expect(page.getByRole('alert')).toBeVisible();

    await page.getByRole('button', { name: 'Dismiss', exact: true }).click();
    await expect(page.getByRole('alert')).toHaveCount(0);
  });

  test('two refusals stack up rather than one covering the other', async ({ page, world }) => {
    world.set('dismissWaiting', World.gqlError('the reminder store is down'));
    await page.goto('/app');
    await page.getByRole('button', { name: 'Dismiss: Land tax is due on Sy 214/2' }).click();
    await page.getByRole('button', { name: 'Dismiss it' }).click();
    await expect(page.getByRole('alert')).toHaveCount(1);

    // The dialog stays open on a refusal, so the second attempt is one click.
    await page.getByRole('button', { name: 'Dismiss it' }).click();
    await expect(page.getByRole('alert')).toHaveCount(2);
  });

  test('putting one failure away leaves the other one standing', async ({ page, world }) => {
    world.set('dismissWaiting', World.gqlError('the reminder store is down'));
    await page.goto('/app');
    await page.getByRole('button', { name: 'Dismiss: Land tax is due on Sy 214/2' }).click();
    await page.getByRole('button', { name: 'Dismiss it' }).click();
    await page.getByRole('button', { name: 'Dismiss it' }).click();
    await expect(page.getByRole('alert')).toHaveCount(2);

    // Toast.tsx:74-78 drops by id. Dropping by index — or clearing the lot —
    // would take away a notice nobody had read yet.
    await page.getByRole('alert').first().getByRole('button', { name: 'Dismiss' }).click();
    await expect(page.getByRole('alert')).toHaveCount(1);
    await expect(page.getByRole('alert')).toContainText('That item could not be saved.');
  });

  test('a column of failures stops at four rather than burying the screen behind it', async ({ page, world }) => {
    world.set('dismissWaiting', World.gqlError('the reminder store is down'));
    await page.goto('/app');
    await page.getByRole('button', { name: 'Dismiss: Land tax is due on Sy 214/2' }).click();
    // Six refusals, because four is what Toast.tsx:84 keeps — `[...l.slice(-3), one]`.
    for (let i = 0; i < 6; i += 1) {
      await page.getByRole('button', { name: 'Dismiss it' }).click();
    }
    await expect(page.getByRole('alert')).toHaveCount(4);
  });

  test('a write that worked says so quietly, and takes itself away', async ({ page }) => {
    // The other half of the contract Toast.tsx:16-24 sets out, and the nearest
    // `ok` toast to the shell (Vault.tsx:116). A success is role="status" so it
    // does not cut a screen reader off mid-sentence, and it auto-dismisses
    // (Toast.tsx:65,85-87) because what it describes is on screen anyway.
    await page.goto('/app/papers');
    await page.getByRole('button', { name: 'Revoke', exact: true }).first().click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.getByRole('button', { name: 'Revoke it' }).click();

    // Filtered rather than addressed bare: the jump box keeps a permanently
    // mounted (empty) role="status" of its own, one floor up.
    const said = page.getByRole('status').filter({ hasText: 'can no longer open' });
    await expect(said).toHaveCount(1);
    await expect(page.getByRole('alert'), 'a confirmation does not interrupt').toHaveCount(0);
    await expect(said).toHaveCount(0, { timeout: 15_000 });
  });

  test('Escape clears a column of failures in one go', async ({ page, world }) => {
    world.set('dismissWaiting', World.gqlError('the reminder store is down'));
    await page.goto('/app');
    await page.getByRole('button', { name: 'Dismiss: Land tax is due on Sy 214/2' }).click();
    await page.getByRole('button', { name: 'Dismiss it' }).click();
    await expect(page.getByRole('alert')).toHaveCount(1);

    await page.keyboard.press('Escape');
    await expect(page.getByRole('alert')).toHaveCount(0);
  });
});

// ── every modal in the module ──────────────────────────────────────────

test.describe('a dialog', () => {
  const openDismissDialog = async (page: import('@playwright/test').Page) => {
    await page.goto('/app');
    await page.getByRole('button', { name: 'Dismiss: Land tax is due on Sy 214/2' }).click();
    await expect(page.getByRole('dialog', { name: 'Dismiss this reminder?' })).toBeVisible();
  };

  test('a dialog takes the keyboard with it when it opens', async ({ page }) => {
    await openDismissDialog(page);
    await expect(page.getByRole('button', { name: 'Keep it' })).toBeFocused();
  });

  test('Tab cannot walk out of a dialog and into the page behind it', async ({ page }) => {
    await openDismissDialog(page);
    await page.keyboard.press('Tab');
    await expect(page.getByRole('button', { name: 'Dismiss it' })).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(page.getByRole('button', { name: 'Keep it' })).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    await expect(page.getByRole('button', { name: 'Dismiss it' })).toBeFocused();
  });

  test('Escape closes a dialog and hands focus back to what opened it', async ({ page }) => {
    await openDismissDialog(page);
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog', { name: 'Dismiss this reminder?' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Dismiss: Land tax is due on Sy 214/2' })).toBeFocused();
  });

  test('a click beside a dialog closes it', async ({ page }) => {
    await openDismissDialog(page);
    // The scrim is a bare div with no role and no name — the class is the only
    // handle there is, and clicking its top-left corner keeps clear of the box.
    await page.locator('.scrim').click({ position: { x: 6, y: 6 } });
    await expect(page.getByRole('dialog', { name: 'Dismiss this reminder?' })).toHaveCount(0);
  });

  test('a click INSIDE a dialog is not a click away from it', async ({ page }) => {
    // Dialog.tsx:152 closes only when the pointer landed on the scrim itself.
    // Without that guard, selecting a word of the warning closed the dialog.
    await openDismissDialog(page);
    await page.getByRole('dialog').getByText('leaves this screen for good').click();
    await expect(page.getByRole('dialog', { name: 'Dismiss this reminder?' })).toBeVisible();
  });

  test('while the write is in flight a click beside the dialog does not throw it away either', async ({ page, world }) => {
    world.set('dismissWaiting', World.slow(3_000, true));
    await openDismissDialog(page);
    await page.getByRole('button', { name: 'Dismiss it' }).click();
    // The box says it is working, in the accessible tree as well as in words.
    await expect(page.getByRole('dialog')).toHaveAttribute('aria-busy', 'true');

    await page.locator('.scrim').click({ position: { x: 6, y: 6 } });
    await expect(page.getByRole('dialog', { name: 'Dismiss this reminder?' })).toBeVisible();
    // And it closes itself once the answer is back, not before.
    await expect(page.getByRole('dialog', { name: 'Dismiss this reminder?' })).toHaveCount(0);
  });

  test('while the write is in flight Escape does not throw the dialog away under it', async ({ page, world }) => {
    world.set('dismissWaiting', World.slow(3_000, true));
    await openDismissDialog(page);
    await page.getByRole('button', { name: 'Dismiss it' }).click();
    await expect(page.getByRole('button', { name: 'Dismissing…' })).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog', { name: 'Dismiss this reminder?' })).toBeVisible();
    // And when the write lands, the dialog closes on its own.
    await expect(page.getByRole('dialog', { name: 'Dismiss this reminder?' })).toHaveCount(0);
  });

  test('a dialog says plainly what it is about to do, and offers the way out first', async ({ page }) => {
    await openDismissDialog(page);
    await expect(page.getByRole('dialog')).toContainText('leaves this screen for good');
    await expect(page.getByRole('dialog')).toContainText('it cannot be brought back');
    await expect(page.getByRole('button', { name: 'Keep it' })).toBeVisible();
  });

  test('Keep it keeps it', async ({ page, world }) => {
    await openDismissDialog(page);
    await page.getByRole('button', { name: 'Keep it' }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Dismiss: Land tax is due on Sy 214/2' })).toBeVisible();
    expect(world.calls('dismissWaiting'), 'nothing was dismissed').toEqual([]);
    // Dialog.tsx:121-127: the keyboard goes back to the row it came from, on
    // every close and not only on Escape. Landing on <body> instead means the
    // next Tab starts again from the top of the document.
    await expect(page.getByRole('button', { name: 'Dismiss: Land tax is due on Sy 214/2' })).toBeFocused();
  });
});

// ── the phone ──────────────────────────────────────────────────────────

test.describe('on a phone', () => {
  /**
   * Tagged `@phone` so the 390px project picks these up, and the width is ALSO
   * set here rather than left to that project alone: `devices['iPhone 14']` is
   * a WebKit device and this machine has only Chromium installed
   * (~/Library/Caches/ms-playwright), so the phone project cannot launch at
   * all. Setting the viewport means the drawer branch — everything below the
   * 900px breakpoint in w360.css:634 — is exercised by the desktop project too,
   * which is the one that actually runs today.
   */
  test.use({ viewport: { width: 390, height: 844 } });

  test('the rail is a drawer behind the hamburger, and nothing of it is in the way until I ask @phone', async ({ page }) => {
    await page.goto('/app');
    // Exact: the scrim beside the open drawer is labelled "Close menu".
    const menu = page.getByRole('button', { name: 'Menu', exact: true });
    await expect(menu).toHaveAttribute('aria-expanded', 'false');
    // Closed, the rail is off-screen in CSS — `inert` is what keeps it out of
    // the tab order and off a screen reader as well (Shell.tsx:408).
    await expect(page.locator('nav[aria-label="Sections"]')).toHaveAttribute('inert', '');

    await menu.click();
    await expect(menu).toHaveAttribute('aria-expanded', 'true');
    await expect(page.locator('nav[aria-label="Sections"]')).not.toHaveAttribute('inert', '');
    await expect(railLink(page, 'Dashboard')).toBeFocused();
  });

  test('Escape shuts the drawer and puts me back on the button I opened it with @phone', async ({ page }) => {
    await page.goto('/app');
    const menu = page.getByRole('button', { name: 'Menu', exact: true });
    await menu.click();
    await expect(menu).toHaveAttribute('aria-expanded', 'true');

    await page.keyboard.press('Escape');
    await expect(menu).toHaveAttribute('aria-expanded', 'false');
    await expect(menu).toBeFocused();
  });

  test('the dark panel beside the drawer shuts it @phone', async ({ page }) => {
    await page.goto('/app');
    await page.getByRole('button', { name: 'Menu', exact: true }).click();
    // The scrim covers the whole width and the drawer sits on the left 17rem
    // of it, so the click has to land to the right of the drawer to reach it.
    await page.getByRole('button', { name: 'Close menu' }).click({ position: { x: 350, y: 300 } });
    await expect(page.getByRole('button', { name: 'Menu', exact: true }))
      .toHaveAttribute('aria-expanded', 'false');
    await expect(page.getByRole('button', { name: 'Menu', exact: true })).toBeFocused();
  });

  test('following a link out of the drawer closes the drawer behind me @phone', async ({ page }) => {
    await page.goto('/app');
    await page.getByRole('button', { name: 'Menu', exact: true }).click();
    await railLink(page, 'Papers').click();

    await expect(page).toHaveURL(/\/app\/papers$/);
    await expect(page.getByRole('button', { name: 'Menu', exact: true }))
      .toHaveAttribute('aria-expanded', 'false');
    await expect(page.locator('nav[aria-label="Sections"]')).toHaveAttribute('inert', '');
  });

  test('a link out of the drawer leaves me on what I opened, not back on the hamburger @phone', async ({ page }) => {
    // Shell.tsx:108-112 is deliberate: only Escape and the scrim hand focus
    // back. A link that routed the page and THEN yanked focus to the topbar
    // would read out the frame again instead of the screen that just arrived.
    await page.goto('/app');
    await page.getByRole('button', { name: 'Menu', exact: true }).click();
    await railLink(page, 'Papers').click();
    await expect(page).toHaveURL(/\/app\/papers$/);
    await expect(page.getByRole('button', { name: 'Menu', exact: true })).not.toBeFocused();
  });

  test('the jump box is still on the phone, and still jumps @phone', async ({ page }) => {
    await page.goto('/app');
    await jumpBox(page).fill('katragunta');
    await page.getByRole('option', { name: /Sy 214\/2/ }).click();
    await expect(page).toHaveURL(new RegExp(`/app/records/${ID.parcel}$`));
  });
});
