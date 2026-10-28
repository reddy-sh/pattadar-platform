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
 *  · fixtures/harness.ts still writes the OLD `w360.scheme` key before every
 *    load. The app's own first-paint script (public/theme-init.js) carries that
 *    key into MUI's theme keys once and marks it carried, so each test starts
 *    the way a returning user's first visit after the change does — and after
 *    that, MUI's keys are the choice. A `page.reload()` therefore proves the
 *    app's opinion, not the fixture's, and the round trip is reloaded below.
 *  · The assistant is not running in the sealed world (seed.ts answers 503 for
 *    /api/gateway/assistant), which is also true of the founder's laptop. The
 *    rebuilt panel reads its history on OPENING, so its honest "not available"
 *    state is reached by opening it, with no composer to lose a question in.
 *    Its WORKING path is reached by answering the assistant routes from the
 *    test itself (`assistantUp` below streams real SSE frames back), because a
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
import type { Page } from '../fixtures/harness';
import { ID, PAPER, TICKET } from '../fixtures/ids';

/** The rail, addressed the way the app labels it (Shell.tsx aria-label). */
const rail = (page: import('@playwright/test').Page) =>
  page.getByRole('navigation', { name: 'Sections' });

/** One rail entry by its exact accessible name — "Services 6" when the badge
 *  is up, "Services" when it is not, so the name IS the assertion. */
const railLink = (page: import('@playwright/test').Page, name: string) =>
  rail(page).getByRole('link', { name, exact: true });

const jumpBox = (page: import('@playwright/test').Page) =>
  page.getByLabel('Search properties, documents, people');

/** The results popup. It has no role of its own — the listbox inside it does —
 *  and the two status sentences are its direct children, so the panel is
 *  addressed by the id Shell.tsx gives it. */
const jumpResults = (page: import('@playwright/test').Page) => page.locator('#w360-jump-results');

/** The notifications bell in the topbar. Notifications left the rail for it;
 *  its accessible name carries the count ("Notifications, 3 new") because
 *  the badge itself is aria-hidden (Shell.tsx). */
const bell = (page: import('@playwright/test').Page, name: string) =>
  page.getByRole('link', { name, exact: true });

/** The sections the rail points at that have been redrawn, and the heading each
 *  one must land on. The Dashboard greets by name and the greeting depends on
 *  the hour, so it is matched on the part that does not move. */
const DRAWN: Array<{ item: string; url: RegExp; heading: RegExp; level?: number }> = [
  { item: 'Properties', url: /\/properties$/, heading: /^Properties/ },
  // Shared's h1 is its rail label; the kit being read is an h2 under it
  // (design.md § Page head, "Shared with me").
  { item: 'Shared with me', url: /\/shared$/, heading: /^Shared with me$/ },
  { item: 'Waiting on you 1', url: /\/assigned$/, heading: /^Waiting on you$/ },
  { item: 'Maps', url: /\/maps$/, heading: /^Maps$/ },
  { item: 'Documents', url: /\/papers$/, heading: /^Documents$/ },
  { item: 'Families & groups', url: /\/groups$/, heading: /^Families & groups$/ },
  { item: 'Services 6', url: /\/services$/, heading: /^Services$/ },
  { item: 'Wallet', url: /\/wallet$/, heading: /^Wallet$/ },
  // Activity is drawn now (w360/pages/Audit.tsx): the owner's centralized trail,
  // routed at /audit. Its h1 is "Activity" whether or not the trail has
  // any rows — an empty trail is a truthful empty state, not a signpost.
  { item: 'Activity', url: /\/audit$/, heading: /^Activity$/ },
  // Tools is drawn now (w360/pages/Tools.tsx). It opens on the SRO directory,
  // which is a root-schema read — the sweep below answers it.
  { item: 'Tools', url: /\/tools$/, heading: /^Tools$/ },
  // Profile is drawn now (w360/pages/Profile.tsx). It reads `me` and
  // `districts` through the root schema — the sweep below answers both.
  { item: 'Profile', url: /\/profile$/, heading: /^Profile$/ },
  // Invitations was the last undrawn section; w360/pages/Invitations.tsx
  // replaced the Section.tsx signpost, so there is no UNDRAWN list any more.
  { item: 'Invitations', url: /\/invitations$/, heading: /^Invitations$/ },
  // The foot group, Help & resources (Shell.tsx).
  { item: 'Help & support', url: /\/help$/, heading: /^Help & support$/ },
  // The Dashboard's rail entry is "Home" (design.md naming standard).
  { item: 'Home', url: /\/home$/, heading: /Shankar Reddy/ },
];

/** Rail entries for the sealed world, which is a platform admin but not a
 *  super admin: Your portfolio 5 (Home · Properties · Families & groups ·
 *  Maps · Documents — Holdings is left out until the account has a
 *  holding, and the seed has none) · Shared 4 (ending with Invite & earn) ·
 *  Money 2 · Account 3 · Operations 1 (the desk) · Help & resources 3. */
const RAIL_ENTRIES = 18;

/** One holding, as the Holdings list reads it (api.ts Q_HOLDING_LIST). */
const ONE_HOLDING = {
  id: 'cp-thota', name: 'Thota farm', note: '', memberCount: 2, parcelCount: 2, propertyCount: 0,
  farmExtent: 5.5, plotExtent: 0, builtExtent: 0, extentLine: '5.50 ac', marketValue: 0, invested: 0,
  paperCount: 0, surveyedCount: 1, combinedSpend: 0, memberSpend: 0,
  placeLine: 'Katragunta, Prakasam', isComplete: true, createdAt: '2026-10-01', updatedAt: '2026-10-01',
  members: [],
};

/** A desk answer thin enough to say one thing.
 *
 *  The rail reads exactly one field of this query — `unassigned`
 *  (Shell.tsx:130) — and the test below that sets it stays on the Dashboard,
 *  so the rest of the desk's shape is the desk screen's business and not this
 *  file's. `jobs` and `silent` are here only because they are lists the
 *  client types as arrays. */
const deskWith = (unassigned: number) => ({ unassigned, jobs: [], silent: [] });

// ── the rail ───────────────────────────────────────────────────────────

// Families & groups (WHO holds the land) sits above Holdings (WHICH ground),
// and Holdings is in the rail only once the account has one (decision memo
// 06/10/2026, § 4.1): an owner with a single parcel never meets the word, and
// the way in until then is "Combine into a holding" on Properties.
test.describe('the rail: Families & groups, then Holdings once there is one', () => {
  // Read on Properties: Home under the sealed world logs the root `groups`
  // and `auditTrail` 400s that are known and not this block's business.
  const portfolio = (page: import('@playwright/test').Page) =>
    rail(page).getByRole('group', { name: 'Your portfolio' }).getByRole('link');

  test('with no holding, the portfolio group has no Holdings entry', async ({ page }) => {
    await page.goto('/properties');
    await expect(portfolio(page)).toHaveText(['Home', 'Properties', 'Families & groups', 'Maps', 'Documents']);
  });

  test('one holding brings Holdings in, under Families & groups', async ({ page, world }) => {
    world.set('combinedProperties', [ONE_HOLDING]);
    await page.goto('/properties');
    await expect(portfolio(page)).toHaveText([
      'Home', 'Properties', 'Families & groups', 'Holdings', 'Maps', 'Documents',
    ]);
    await expect(rail(page).getByRole('link')).toHaveCount(RAIL_ENTRIES + 1);
    await expect(railLink(page, 'Holdings')).toHaveAttribute('href', '/holdings');
  });

  test('standing on Holdings keeps it in the rail, even with none left', async ({ page, world }) => {
    world.set('combinedProperties', []);
    await page.goto('/holdings');
    await expect(page.getByText('No holdings yet')).toBeVisible();
    await expect(railLink(page, 'Holdings')).toHaveAttribute('aria-current', 'page');
  });

  test('while the holdings are still coming, or when they fail, the rail does not flash Holdings in', async ({ page, world }) => {
    world.set('combinedProperties', World.never());
    await page.goto('/properties');
    await expect(railLink(page, 'Families & groups')).toBeVisible();
    await expect(railLink(page, 'Holdings')).toHaveCount(0);
  });
});


test.describe('the rail', () => {
  test('Intelligence appears in Administration for a super admin', async ({ page, world }) => {
    world.set('portfolio', { ...world.seedOf('portfolio'), isSuperAdmin: true });
    await page.goto('/home');
    const administration = rail(page).getByRole('group', { name: 'Administration' });
    await expect(administration.getByRole('link', { name: 'Intelligence' }))
      .toHaveAttribute('href', '/admin/intelligence');
  });

  test('Intelligence is absent without the super-admin grant', async ({ page }) => {
    await page.goto('/home');
    await expect(railLink(page, 'Intelligence')).toHaveCount(0);
  });

  test('the rail lights up the section I am actually looking at', async ({ page }) => {
    await page.goto('/home');
    await expect(railLink(page, 'Home')).toHaveAttribute('aria-current', 'page');

    await railLink(page, 'Documents').click();
    await expect(page).toHaveURL(/\/papers$/);
    await expect(railLink(page, 'Documents')).toHaveAttribute('aria-current', 'page');
    // Home is `end`, so it stops claiming the page the moment you leave it.
    await expect(railLink(page, 'Home')).not.toHaveAttribute('aria-current', 'page');
  });

  test('opening one paper keeps Papers lit, because that is still where I am', async ({ page }) => {
    await page.goto('/papers/shelf/title');
    // The shelf names ITSELF in its h1 (Shelf.tsx:93), so this asserts the
    // shelf arrived rather than that some heading did.
    await expect(page.getByRole('heading', { level: 1, name: 'Title' })).toBeVisible();
    await expect(railLink(page, 'Documents')).toHaveAttribute('aria-current', 'page');
  });

  test('a record 360 keeps Properties lit in the rail, the one place it hangs from', async ({ page }) => {
    // Records live at /properties/:id, under Properties, so the rail says
    // where you are.
    await page.goto(`/properties/${ID.parcel}`);
    await expect(page.getByRole('heading', { name: 'Sy 214/2' }).first()).toBeVisible();
    await expect(rail(page).getByRole('link')).toHaveCount(RAIL_ENTRIES);
    // aria-current has no role-level matcher, so the attribute is the handle.
    const lit = rail(page).locator('a[aria-current="page"]');
    await expect(lit).toHaveCount(1);
    await expect(lit).toContainText('Properties');
  });

  // This was a live defect for as long as the one-service screen lived at
  // /tickets/:id: fifteen rail entries and not one of them marked, on a
  // screen you had reached from one of them. The screen moved to
  // /services/:id (routes.tsx:317), under the prefix the rail's Services
  // entry already points at (Shell.tsx:272), and only Dashboard carries
  // `end: true` (Shell.tsx:266) — so NavLink now lights Services for one job
  // exactly the way it lights Papers for one paper, two tests above, with no
  // Shell.tsx edit at all. The old /tickets/:id address is gone (no legacy
  // links); 21-routing proves it is a 404.
  test('opening a job I ordered keeps Services lit, the way opening a paper keeps Papers lit', async ({ page }) => {
    await page.goto(`/services/${TICKET.placed}`);
    await expect(page.getByRole('heading', { level: 1, name: 'Encumbrance certificate' })).toBeVisible();
    await expect(railLink(page, 'Services 6')).toHaveAttribute('aria-current', 'page');
  });

  test('every section that has been redrawn opens from the rail', async ({ page, world }) => {
    // Tools opens on the SRO directory, read through the root schema rather
    // than `web`; without an answer the seal refuses it and logs a 400.
    world.set('root.sroOffices', []);
    // Profile reads the account row and the district list the same way.
    world.set('root.me', {
      id: 'owner', name: 'Shankar Reddy', email: '', address: '', language: 'en',
      districtsOfInterest: '', notificationPrefs: 'email', kycRefMasked: '', mfaEnabled: false,
    });
    world.set('root.districts', []);
    // Families & groups and Invitations read `groups` and `invitations` through
    // the root schema too, and the seed answers neither (a fixture gap).
    world.set('root.groups', []);
    world.set('root.invitations', []);
    await page.goto('/home');
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

  test('no rail entry leads to a "previous version" signpost any more', async ({ page, world }) => {
    world.set('root.invitations', []);
    await page.goto('/invitations');
    await expect(page.getByRole('heading', { level: 1, name: 'Invitations' })).toBeVisible();
    await expect(page.getByText('No invitations yet')).toBeVisible();
    await expect(page.getByRole('link', { name: /previous version/ })).toHaveCount(0);
    await expect(railLink(page, 'Invitations')).toHaveAttribute('aria-current', 'page');
  });

  test('Help & resources sits at the foot of the rail, with the University opening in a new tab', async ({ page }) => {
    await page.goto('/home');
    const foot = rail(page).getByRole('group', { name: 'Help & resources' });
    await expect(foot.getByRole('link')).toHaveText(['Tools', 'Pattadar University', 'Help & support']);
    const uni = foot.getByRole('link', { name: 'Pattadar University (opens in a new tab)' });
    await expect(uni).toHaveAttribute('target', '_blank');
    await expect(uni).toHaveAttribute('rel', /noopener/);
    // Last group in the rail, below the operator's desk.
    await expect(rail(page).getByRole('group').last()).toHaveAttribute('aria-label', 'Help & resources');
  });

  test('the bell opens the Notifications inbox, not a signpost', async ({ page }) => {
    await page.goto('/home');
    const entry = bell(page, 'Notifications, 3 new');
    await entry.click();
    await expect(page).toHaveURL(/\/notifications$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Notifications' })).toBeVisible();
    await expect(page.getByRole('link', { name: /previous version/ })).toHaveCount(0);
    await expect(entry).toHaveAttribute('aria-current', 'page');
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
    await page.goto('/home');
    const entries = rail(page).getByRole('link');
    await expect(entries).toHaveCount(RAIL_ENTRIES);
    // Last of the owner-and-staff entries: only the Help & resources foot
    // group (three entries) comes after it.
    await expect(entries.nth(RAIL_ENTRIES - 4)).toHaveAttribute('href', '/desk');
    // And the entry it replaced is gone from the rail entirely — two
    // admin-shaped entries with one of them dead is worse than either alone.
    // The /admin ADDRESS still resolves; that redirect is 21-routing's.
    await expect(rail(page).getByRole('link', { name: /Admin/ })).toHaveCount(0);

    await railLink(page, 'Pattadar desk 2').click();
    await expect(page).toHaveURL(/\/desk$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Pattadar desk' }))
      .toBeVisible({ timeout: 20_000 });
    await expect(railLink(page, 'Pattadar desk 2')).toHaveAttribute('aria-current', 'page');
  });

  test('the number beside the desk is the jobs the desk says are waiting for somebody', async ({ page }) => {
    await page.goto('/desk');
    await expect(page.getByRole('heading', { level: 1, name: 'Pattadar desk' }))
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
    await page.goto('/home');
    await expect(railLink(page, 'Pattadar desk')).toBeVisible();
    await expect(rail(page).getByText('0')).toHaveCount(0);
  });

  test('an owner who does not run Pattadar has no desk on the rail, and the desk is never asked about them', async ({ page, world }) => {
    world.set('portfolio', { ...world.seedOf('portfolio'), isPlatformAdmin: false });
    await page.goto('/home');
    // The portfolio really did answer — the badge beside Notifications is its
    // `waiting` — so the rail drew with the admin flag in hand and still drew
    // one entry fewer than an operator's.
    await expect(bell(page, 'Notifications, 3 new')).toBeVisible();
    await expect(rail(page).getByRole('link')).toHaveCount(RAIL_ENTRIES - 1);
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
    await page.goto('/services');
    await expect(page.getByRole('heading', { name: 'Services', level: 1 })).toBeVisible();
    // Services is a table now (Orders.tsx OrderTable): one row per order,
    // each with its own actions menu, so the menus are the rows to count.
    await expect(page.getByRole('button', { name: /^Actions for / }).first()).toBeVisible();
    const jobs = await page.getByRole('button', { name: /^Actions for / }).count();
    expect(jobs, 'the seeded world has open jobs to count').toBeGreaterThan(0);
    await expect(railLink(page, `Services ${jobs}`)).toBeVisible();
  });

  test('the number beside Waiting on you is the work that screen says is waiting', async ({ page }) => {
    await page.goto('/assigned');
    await expect(page.getByRole('heading', { name: 'Waiting on you' })).toBeVisible();
    const waiting = await page.getByRole('link', { name: 'Open order' }).count();
    expect(waiting, 'one seeded job is waiting on the owner').toBeGreaterThan(0);
    await expect(railLink(page, `Waiting on you ${waiting}`)).toBeVisible();
  });

  test('the number beside Notifications is the reminders the Dashboard is showing', async ({ page }) => {
    await page.goto('/home');
    await expect(page.getByRole('button', { name: /^Dismiss: / }).first()).toBeVisible();
    const reminders = await page.getByRole('button', { name: /^Dismiss: / }).count();
    expect(reminders, 'the seeded portfolio has reminders').toBeGreaterThan(0);
    await expect(bell(page, `Notifications, ${reminders} new`)).toBeVisible();
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
    await page.goto('/home');
    await expect(railLink(page, 'Services 1')).toBeVisible();
    await expect(railLink(page, 'Waiting on you 1')).toBeVisible();
    await expect(bell(page, 'Notifications, 1 new')).toBeVisible();
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
    await page.goto('/assigned');

    await expect(railLink(page, 'Services 2')).toBeVisible();
    await expect(railLink(page, 'Waiting on you 1')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Open order' })).toHaveCount(1);
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

    await page.goto('/home');
    await expect(bell(page, 'Notifications, 3 new')).toBeVisible();

    await page.getByRole('button', { name: 'Dismiss: Land tax is due on Sy 214/2' }).click();
    await page.getByRole('button', { name: 'Dismiss it' }).click();

    await expect(page.getByRole('button', { name: 'Dismiss: Land tax is due on Sy 214/2' })).toHaveCount(0);
    await expect(bell(page, 'Notifications, 2 new')).toBeVisible();
  });

  test('nothing on the rail is a bare dot — every mark is a number I can act on', async ({ page }) => {
    await page.goto('/home');
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
    await page.goto('/home');
    await expect(railLink(page, 'Services')).toBeVisible();
    await expect(railLink(page, 'Waiting on you')).toBeVisible();
    await expect(bell(page, 'Notifications')).toBeVisible();
    // A zero badge is a badge: `count: ordered || undefined` (Shell.tsx:185-195).
    await expect(rail(page).getByText('0')).toHaveCount(0);
  });

  test('when the service desk cannot be reached the rail leaves the number off rather than guessing', async ({ page, world }) => {
    world.set('orders', World.gqlError('the service desk is down'));
    await page.goto('/home');
    await expect(railLink(page, 'Services')).toBeVisible();
    await expect(railLink(page, 'Waiting on you')).toBeVisible();
    // The reminders come from a query that DID answer, so that one still counts.
    await expect(bell(page, 'Notifications, 3 new')).toBeVisible();
  });

  test('while the jobs are still coming the rail does not put a number up early', async ({ page, world }) => {
    world.set('orders', World.never());
    await page.goto('/home');
    await expect(railLink(page, 'Services')).toBeVisible();
    await expect(rail(page).getByText('6')).toHaveCount(0);
  });

  test('collapsing the rail leaves every section reachable by name', async ({ page }) => {
    await page.goto('/home');
    await page.getByRole('button', { name: 'Hide navigation' }).click();

    // The words are hidden, the destinations are not: title/aria-label stand in
    // for the label that is no longer on screen (Shell.tsx:423-428).
    await expect(rail(page).getByText('Properties')).toBeHidden();
    await expect(railLink(page, 'Properties')).toBeVisible();
    await expect(railLink(page, 'Properties')).toHaveAttribute('title', 'Properties');
    // And the badge is folded into the name, so it is still announced.
    await expect(railLink(page, 'Services, 6')).toBeVisible();

    await page.getByRole('button', { name: 'Show navigation' }).click();
    await expect(rail(page).getByText('Properties')).toBeVisible();
  });

  test('a collapsed rail is still collapsed when I come back to the app', async ({ page }) => {
    await page.goto('/home');
    await page.getByRole('button', { name: 'Hide navigation' }).click();
    expect(await page.evaluate(() => localStorage.getItem('w360.rail'))).toBe('hidden');

    await page.reload();
    await expect(page.getByRole('button', { name: 'Show navigation' })).toBeVisible();
    await expect(rail(page).getByText('Properties')).toBeHidden();
  });

  test('walking from screen to screen does not re-ask the server for the frame', async ({ page, world }) => {
    await page.goto('/home');
    await expect(railLink(page, 'Services 6')).toBeVisible();
    world.clearCalls();

    await railLink(page, 'Documents').click();
    await expect(page).toHaveURL(/\/papers$/);
    await expect(railLink(page, 'Documents')).toHaveAttribute('aria-current', 'page');
    await railLink(page, 'Properties').click();
    await expect(page).toHaveURL(/\/properties$/);

    // api.ts KEY + main.tsx staleTime 30s: the rail's two queries are asked
    // once and shared by every screen. Re-asking them on each click is two
    // round trips per navigation on a phone connection, for numbers that have
    // not changed.
    expect(world.calls('portfolio'), 'the portfolio is not re-read per screen').toEqual([]);
    expect(world.calls('orders'), 'the orders are not re-read per screen').toEqual([]);
  });

  test('a window I drag narrow hands the rail to the hamburger and gets it out of the way', async ({ page }) => {
    await page.goto('/home');
    await expect(page.getByRole('button', { name: 'Hide navigation' })).toBeVisible();

    // Shell.tsx:89-96 WATCHES the breakpoint rather than sampling it inside the
    // click handler. Sampled, the button changed what it did on the next click
    // but `inert` never moved, so a rail that was now a closed drawer stayed in
    // the tab order off-screen. `inert` is asserted through the DOM because it
    // takes the nav out of the accessible tree — there is no role left to ask.
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.getByRole('button', { name: 'Menu', exact: true })).toBeVisible();
    await expect(page.locator('nav[aria-label="Sections"]')).toHaveAttribute('inert', '');

    await page.setViewportSize({ width: 1512, height: 950 });
    await expect(page.getByRole('button', { name: 'Hide navigation' })).toBeVisible();
    await expect(page.locator('nav[aria-label="Sections"]')).not.toHaveAttribute('inert', '');
    await expect(railLink(page, 'Documents')).toBeVisible();
  });

  test('a collapsed rail still takes me where I ask', async ({ page }) => {
    await page.goto('/home');
    await page.getByRole('button', { name: 'Hide navigation' }).click();
    await railLink(page, 'Documents').click();
    await expect(page).toHaveURL(/\/papers$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Documents' })).toBeVisible();
  });
});

// ── the jump box ───────────────────────────────────────────────────────

test.describe('the jump box', () => {
  test('the jump box finds a record, a paper and a person in the same breath', async ({ page, world }) => {
    await page.goto('/home');
    await jumpBox(page).fill('sa');

    await expect(page.getByRole('option', { name: /Flat 4B, Sai Residency/ })).toBeVisible();
    await expect(page.getByRole('option', { name: /Sale deed 4412 of 1998/ })).toBeVisible();
    await expect(page.getByRole('option', { name: /Sai Kumar/ })).toBeVisible();
    // Each hit says which kind of thing it is, in the owner's word for the
    // API's kind (Shell.tsx HIT_KIND: record → property, paper → document).
    await expect(jumpResults(page).getByText('property', { exact: true })).toBeVisible();
    await expect(jumpResults(page).getByText('document', { exact: true })).toBeVisible();
    await expect(jumpResults(page).getByText('person', { exact: true })).toBeVisible();
    expect(world.lastVars('search')).toMatchObject({ q: 'sa' });
  });

  test('the jump box tidies up what I typed before it asks', async ({ page, world }) => {
    await page.goto('/home');
    await jumpBox(page).fill('  katragunta  ');
    await expect(page.getByRole('option').first()).toBeVisible();
    expect(world.lastVars('search')).toMatchObject({ q: 'katragunta' });
  });

  test('picking a record out of the jump box opens that record', async ({ page }) => {
    await page.goto('/home');
    await jumpBox(page).fill('katragunta');
    await page.getByRole('option', { name: /Sy 214\/2/ }).click();
    await expect(page).toHaveURL(new RegExp(`/properties/${ID.parcel}$`));
    await expect(page.getByRole('heading', { name: 'Sy 214/2' }).first()).toBeVisible();
  });

  test('picking a paper out of the jump box opens the paper, not the record it belongs to', async ({ page }) => {
    await page.goto('/home');
    await jumpBox(page).fill('encumbrance');
    await page.getByRole('option', { name: /Encumbrance certificate/ }).click();
    await expect(page).toHaveURL(new RegExp(`/papers/${PAPER.ec}$`));
  });

  test('picking a person out of the jump box lands on the people of their record', async ({ page }) => {
    await page.goto('/home');
    await jumpBox(page).fill('ramana');
    await page.getByRole('option', { name: /Ramana Rao/ }).click();
    // Everyone the jump box finds is a caretaker or staff (record_people), so
    // the hit opens that side of the tab with the person's own drawer, not the
    // Owners chain where they are nowhere on screen. The address keeps no
    // trace of it afterwards, so closing the drawer stays closed.
    await expect(page).toHaveURL(new RegExp(`/properties/${ID.parcel}/people$`));
    await expect(page.getByRole('group', { name: 'Owners or staff' })
      .getByRole('button', { name: 'Caretakers & staff' })).toHaveAttribute('aria-pressed', 'true');
    const drawer = page.getByRole('dialog');
    await expect(drawer).toBeVisible();
    await expect(drawer).toContainText('Ramana Rao');
    await drawer.getByRole('button', { name: /^(Cancel|Close)/ }).first().click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.getByRole('button', { name: /Open Ramana Rao/ })).toBeVisible();
  });

  test('a jump that matches nothing says nothing matched, and names what I typed', async ({ page }) => {
    await page.goto('/home');
    await jumpBox(page).fill('zzqq');
    await expect(jumpResults(page)).toContainText(
      'Nothing matches “zzqq”.',
    );
    await expect(page.getByRole('option')).toHaveCount(0);
  });

  test('a jump that could not run says so, and never claims my parcel is missing', async ({ page, world }) => {
    world.set('search', World.gqlError('the search index is down'));
    await page.goto('/home');
    await jumpBox(page).fill('katragunta');

    await expect(jumpResults(page)).toContainText(
      'That search could not run.',
    );
    // The sentence that must never appear for a search that never happened.
    await expect(jumpResults(page)).not.toContainText('Nothing matches');
    // And the same thing is said to a screen reader, not just drawn.
    await expect(page.getByRole('status')).toContainText('That search could not run.');
  });

  test('while the answer is still coming the box says it is searching, not that there is nothing', async ({ page, world }) => {
    world.set('search', World.slow(2_000, []));
    await page.goto('/home');
    await jumpBox(page).fill('katragunta');
    await expect(jumpResults(page)).toContainText('Searching…');
    await expect(jumpResults(page)).not.toContainText('Nothing matches');
    await expect(jumpResults(page)).toContainText('Nothing matches “katragunta”');
  });

  test('one letter is not a search, and nothing is asked of the server for it', async ({ page, world }) => {
    await page.goto('/home');
    await jumpBox(page).fill('s');
    await expect(jumpResults(page)).toHaveCount(0);
    await expect(jumpBox(page)).toHaveAttribute('aria-expanded', 'false');
    expect(world.calls('search'), 'a single letter must not be sent to the API').toEqual([]);
  });

  test('⌘K puts the caret in the jump box from anywhere on the page', async ({ page }) => {
    await page.goto('/home');
    await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
    await page.keyboard.press('Meta+k');
    await expect(jumpBox(page)).toBeFocused();
  });

  test('Ctrl-K does the same, for the half of the country not on a Mac', async ({ page }) => {
    await page.goto('/home');
    await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
    await page.keyboard.press('Control+k');
    await expect(jumpBox(page)).toBeFocused();
  });

  test('the arrow keys walk the hits and Enter takes the one I am on', async ({ page }) => {
    await page.goto('/home');
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
    await expect(page).toHaveURL(new RegExp(`/properties/${ID.watched}$`));
  });

  test('ArrowUp on the first hit stays on the first hit', async ({ page }) => {
    await page.goto('/home');
    await jumpBox(page).fill('katragunta');
    await expect(page.getByRole('option')).toHaveCount(2);
    await jumpBox(page).press('ArrowUp');
    await expect(page.getByRole('option', { name: /Sy 214\/2/ })).toHaveAttribute('aria-selected', 'true');
  });

  test('ArrowDown on the last hit stays on the last hit', async ({ page }) => {
    // Shell.tsx:249 clamps at hits.length - 1. Unclamped, activeHit walked off
    // the end and Enter submitted `hits[undefined] ?? hits[0]` — the first hit,
    // for someone who had arrowed to the bottom of the list.
    await page.goto('/home');
    await jumpBox(page).fill('katragunta');
    await expect(page.getByRole('option')).toHaveCount(2);

    await jumpBox(page).press('ArrowDown');
    await jumpBox(page).press('ArrowDown');
    await expect(page.getByRole('option', { name: /Sy 301/ })).toHaveAttribute('aria-selected', 'true');
    await expect(jumpBox(page)).toHaveAttribute('aria-activedescendant', 'w360-hit-1');

    await jumpBox(page).press('Enter');
    await expect(page).toHaveURL(new RegExp(`/properties/${ID.watched}$`));
  });

  test('the hit my pointer is resting on is the one Enter takes', async ({ page }) => {
    // Shell.tsx:286 — pointer and keyboard drive the same selection, so the
    // row under the cursor is the row Enter opens.
    await page.goto('/home');
    await jumpBox(page).fill('katragunta');
    await page.getByRole('option', { name: /Sy 301/ }).hover();
    await expect(page.getByRole('option', { name: /Sy 301/ })).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByRole('option', { name: /Sy 214\/2/ })).toHaveAttribute('aria-selected', 'false');

    await jumpBox(page).press('Enter');
    await expect(page).toHaveURL(new RegExp(`/properties/${ID.watched}$`));
  });

  test('changing my mind mid-word puts the highlight back on the first hit', async ({ page }) => {
    // Shell.tsx:133. Without it the highlight stayed on index 1 while the list
    // under it was replaced, so Enter opened the second hit of a list the
    // person had not read yet.
    await page.goto('/home');
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
    await page.goto('/home');
    await jumpBox(page).fill('zzqq');
    await expect(jumpResults(page)).toContainText('Nothing matches');
    await expect(jumpBox(page)).not.toHaveAttribute('aria-activedescendant', /./);

    await jumpBox(page).press('ArrowDown');
    await expect(jumpBox(page)).not.toHaveAttribute('aria-activedescendant', /./);
  });

  test('Enter on an empty jump box leaves me exactly where I was', async ({ page, world }) => {
    // Shell.tsx:236 guards on `q.trim()`; without it Enter on an empty box
    // walked off the Dashboard onto an empty Properties search.
    await page.goto('/home');
    await expect(page.getByRole('heading', { level: 1, name: /Shankar Reddy/ })).toBeVisible();

    await jumpBox(page).press('Enter');
    await expect(page).toHaveURL(/\/home$/);
    await expect(page.getByRole('heading', { level: 1, name: /Shankar Reddy/ })).toBeVisible();
    expect(world.calls('search'), 'an empty box asks the server nothing').toEqual([]);
  });

  test('a box with nothing but spaces in it is not a search', async ({ page, world }) => {
    // Two characters of whitespace is two characters. The gate is on the
    // TRIMMED text in both places that read it (Shell.tsx:167, api.ts:571).
    await page.goto('/home');
    await jumpBox(page).fill('   ');
    await expect(jumpResults(page)).toHaveCount(0);
    await expect(jumpBox(page)).toHaveAttribute('aria-expanded', 'false');
    expect(world.calls('search'), 'whitespace must not be sent to the API').toEqual([]);
  });

  test('Escape closes the results and leaves what I typed alone', async ({ page }) => {
    await page.goto('/home');
    await jumpBox(page).fill('katragunta');
    await expect(jumpResults(page)).toBeVisible();

    await jumpBox(page).press('Escape');
    await expect(jumpResults(page)).toHaveCount(0);
    await expect(jumpBox(page)).toHaveValue('katragunta');
    await expect(jumpBox(page)).toHaveAttribute('aria-expanded', 'false');
  });

  test('clicking away from the jump box puts the results away', async ({ page }) => {
    await page.goto('/home');
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
    await page.goto('/home');
    await jumpBox(page).fill('katragunta');
    await jumpBox(page).press('Escape');
    await expect(jumpResults(page)).toHaveCount(0);

    await jumpBox(page).blur();
    await jumpBox(page).focus();
    await expect(jumpResults(page)).toBeVisible();
  });

  test('going somewhere empties the jump box behind me', async ({ page }) => {
    await page.goto('/home');
    await jumpBox(page).fill('katragunta');
    await page.getByRole('option', { name: /Sy 214\/2/ }).click();
    await expect(page).toHaveURL(new RegExp(`/properties/${ID.parcel}$`));
    await expect(jumpBox(page)).toHaveValue('');
  });

  test('Enter on a search with no hits hands the words to Properties rather than doing nothing', async ({ page }) => {
    await page.goto('/home');
    await jumpBox(page).fill('zzqq');
    await expect(jumpResults(page)).toContainText('Nothing matches');
    await jumpBox(page).press('Enter');

    await expect(page).toHaveURL(/\/properties\?q=zzqq$/);
    await expect(page.getByText('Nothing matches “zzqq”')).toBeVisible();
  });

  test('the results tell a screen reader how many there are', async ({ page }) => {
    await page.goto('/home');
    await jumpBox(page).fill('katragunta');
    await expect(page.getByRole('status')).toContainText('2 results.');

    await jumpBox(page).fill('sa');
    await expect(page.getByRole('status')).toContainText('3 results.');
  });

  test('the live region says nothing at all until there is something to say', async ({ page }) => {
    // Shell.tsx:334-343 keeps the region mounted and EMPTY so it exists before
    // it speaks. A region that announced "Nothing matches ." on every page
    // load would be read out to someone who never touched the box.
    await page.goto('/home');
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
      subtitle: 'Katragunta, Markapur, Prakasam', route: `/properties/${ID.parcel}`,
    };
    // The first search answers at once; the second is still running when Enter
    // is pressed, which is the whole scenario.
    world.set('search', (vars) => (String(vars.q) === 'katragunta' ? [hit] : World.slow(3_000, [])));

    await page.goto('/home');
    await jumpBox(page).fill('katragunta');
    await expect(page.getByRole('option', { name: /Sy 214\/2/ })).toBeVisible();

    await jumpBox(page).fill('zzqq');
    await jumpBox(page).press('Enter');
    await expect(page).toHaveURL(/\/properties\?q=zzqq$/, { timeout: 3_000 });
  });
});

// ── the top bar ────────────────────────────────────────────────────────

test.describe('the top bar', () => {
  test('the wordmark takes me home from anywhere', async ({ page }) => {
    await page.goto('/papers');
    await page.getByRole('link', { name: 'Pattadar.' }).click();
    await expect(page).toHaveURL(/\/home$/);
    await expect(page.getByRole('heading', { level: 1, name: /Shankar Reddy/ })).toBeVisible();
  });

  test('the avatar wears my own initials, not a letter chosen for everybody', async ({ page }) => {
    await page.goto('/home');
    await expect(page.getByLabel('Your account — Shankar Reddy')).toHaveText('SR');
  });

  test('a name with no surname on it still gets two letters of its own', async ({ page, world }) => {
    // initialsOf (ui.tsx:166-171) takes the first two letters when there is
    // only one word, rather than one letter beside a lot of empty circle.
    world.set('portfolio', { ...world.seedOf('portfolio'), displayName: 'Ramanamma' });
    await page.goto('/home');
    await expect(page.getByLabel('Your account — Ramanamma')).toHaveText('RA');
  });

  test('until my name is known the avatar does not invent one', async ({ page, world }) => {
    world.set('portfolio', World.never());
    await page.goto('/home');
    await expect(page.getByLabel('Your account', { exact: true })).toBeVisible();
    await expect(page.getByLabel('Your account', { exact: true })).toHaveText('');
  });

  test('an account with no name on it yet gets the person mark, not somebody else’s letter', async ({ page, world }) => {
    world.set('portfolio', { ...world.seedOf('portfolio'), displayName: '' });
    await page.goto('/home');
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
      await page.goto('/home');
      await expect(avatar(page)).toHaveAttribute('aria-expanded', 'false');

      await avatar(page).click();
      await expect(page.getByRole('menu', { name: /Your account/ })).toBeVisible();
      await expect(avatar(page)).toHaveAttribute('aria-expanded', 'true');
      // Named above the items for the same reason every kebab in this module
      // is: a column of verbs with no subject, and one of them signs you out.
      await expect(page.locator('.menu-list .menuhead')).toHaveText('Shankar Reddy');
    });

    test('the way out of the app is on it', async ({ page }) => {
      await page.goto('/home');
      await avatar(page).click();
      await expect(page.getByRole('menuitem', { name: 'Sign out' })).toBeVisible();
    });

    test('signing out leaves the app for the front door', async ({ page, world }) => {
      // Sign-out first revokes the HttpOnly media stream sessions while the
      // Bearer still exists (AuthProvider.revokeMediaStreams). The seed does
      // not answer that DELETE yet, so it is answered here.
      world.route(/\/api\/gateway\/storage\/stream-sessions$/, () => ({ status: 204 }));
      await page.goto('/home');
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
      expect(world.restCalls(/\/storage\/stream-sessions$/).map((c) => c.method),
        'the media stream sessions are revoked on the way out').toEqual(['DELETE']);
    });

    test('both account screens are one click away, and land where they say', async ({ page, world }) => {
      // Profile is a drawn screen now and reads through the root schema.
      world.set('root.me', {
        id: 'owner', name: 'Shankar Reddy', email: '', address: '', language: 'en',
        districtsOfInterest: '', notificationPrefs: 'email', kycRefMasked: '', mfaEnabled: false,
      });
      world.set('root.districts', []);
      await page.goto('/home');
      await avatar(page).click();
      await page.getByRole('menuitem', { name: 'Profile' }).click();
      await expect(page).toHaveURL(/\/profile$/);
      await expect(page.getByRole('heading', { level: 1, name: 'Profile' })).toBeVisible();

      await avatar(page).click();
      // routes.tsx has mounted /account all along — the DPDP screen for
      // consent, export and deletion — reachable from nowhere inside W360.
      await page.getByRole('menuitem', { name: 'Privacy & your data' }).click();
      await expect(page).toHaveURL(/\/account$/);
    });

    test('Escape puts the menu away and hands focus back to the avatar', async ({ page }) => {
      await page.goto('/home');
      await avatar(page).click();
      await expect(page.getByRole('menu', { name: /Your account/ })).toBeVisible();

      await page.keyboard.press('Escape');
      await expect(page.getByRole('menu', { name: /Your account/ })).toHaveCount(0);
      await expect(avatar(page)).toBeFocused();
    });
  });

  test('the frame stands even when the screen inside it falls over', async ({ page, world }) => {
    world.set('portfolio', World.gqlError('the portfolio store is down'));
    await page.goto('/home');

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
    await page.goto('/home');
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

    // Was a DEFECT: the hint was the literal string "⌘K" while the handler
    // accepts Ctrl just as happily, and most of the people this is built for
    // are on Windows or Android keyboards with no ⌘ on them. The hint now
    // names the chord this machine has (Shell.tsx SHORTCUT). The user agent
    // alone does not move `navigator.platform`, which Shell reads first, so
    // the platform is set to a Windows one too.
    test('the shortcut the jump box advertises is one this keyboard has', async ({ page }) => {
      await page.addInitScript(() => {
        Object.defineProperty(Navigator.prototype, 'platform', { get: () => 'Win32' });
      });
      await page.goto('/properties');
      await expect(jumpBox(page)).toBeVisible();
      await expect(page.locator('kbd')).toHaveText(/ctrl/i);
    });

    test('and Ctrl-K works there whatever the hint says', async ({ page }) => {
      await page.goto('/properties');
      await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
      await page.keyboard.press('Control+k');
      await expect(jumpBox(page)).toBeFocused();
    });
  });
});

// ── dark and light ─────────────────────────────────────────────────────

test.describe('the theme menu', () => {
  // The Dashboard under /app reads the activity trail through the root schema
  // (data/hooks.ts auditTrail), which fixtures/seed.ts does not answer yet. A
  // test that lingers on the page long enough sees the seal's 400 for it as a
  // console error, so these answer it with an empty trail, as 02-dashboard does.
  test.beforeEach(({ world }) => { world.set('root.auditTrail', []); });

  /** What MUI holds: the mode, and the scheme in that mode's slot. */
  const saved = (page: Page) => page.evaluate(() => ({
    mode: localStorage.getItem('pattadar-mode-v2'),
    light: localStorage.getItem('pattadar-color-scheme-v1-light'),
    dark: localStorage.getItem('pattadar-color-scheme-v1-dark'),
  }));

  test('offers all four themes, switches to light and writes the choice down', async ({ page }) => {
    await page.goto('/home');
    // The scheme is an attribute on the document, and only there: W360's
    // colour slots read it from <html>. Nothing in the accessible tree
    // carries it, so the attribute is what there is to read.
    await expect(page.locator('html')).toHaveAttribute('data-scheme', 'dark');
    await expect(page.locator('.w360')).not.toHaveAttribute('data-scheme');

    await page.getByRole('button', { name: 'Change theme' }).click();
    const menu = page.getByRole('menu', { name: 'Change theme' });
    await expect(menu.getByRole('menuitemradio')).toHaveText(['Light', 'Dark', 'Pattadar Gold', 'High Contrast', 'Centred page', 'Full-width page']);
    await expect(menu.getByRole('menuitemradio', { name: 'Dark' })).toHaveAttribute('aria-checked', 'true');
    await menu.getByRole('menuitemradio', { name: 'Light' }).click();

    await expect(page.locator('html')).toHaveAttribute('data-scheme', 'light');
    expect(await saved(page)).toMatchObject({ mode: 'light', light: 'light' });
  });

  test('and switches straight back to dark', async ({ page }) => {
    await page.goto('/home');
    await page.getByRole('button', { name: 'Change theme' }).click();
    await page.getByRole('menuitemradio', { name: 'Light' }).click();
    await page.getByRole('button', { name: 'Change theme' }).click();
    await page.getByRole('menuitemradio', { name: 'Dark' }).click();
    await expect(page.locator('html')).toHaveAttribute('data-scheme', 'dark');
    expect(await saved(page)).toMatchObject({ mode: 'dark', dark: 'dark' });
  });

  test('page width: centred by default, full width on request, kept on reload', async ({ page }) => {
    await page.goto('/home');
    const main = page.locator('.w360 main');
    await expect(page.locator('.w360')).toHaveAttribute('data-width', 'centred');
    await expect(main).not.toHaveCSS('max-width', 'none');
    await page.getByRole('button', { name: 'Change theme' }).click();
    await expect(page.getByRole('menuitemradio', { name: 'Centred page' })).toHaveAttribute('aria-checked', 'true');
    await page.getByRole('menuitemradio', { name: 'Full-width page' }).click();
    await expect(main).toHaveCSS('max-width', 'none');

    await page.reload();
    await expect(page.locator('.w360')).toHaveAttribute('data-width', 'full');
    await expect(main).toHaveCSS('max-width', 'none');
  });

  test('the choice survives a reload', async ({ page }) => {
    await page.goto('/home');
    await page.getByRole('button', { name: 'Change theme' }).click();
    await page.getByRole('menuitemradio', { name: 'High Contrast' }).click();
    await expect(page.locator('html')).toHaveAttribute('data-scheme', 'highContrast');

    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-scheme', 'highContrast');
    await page.getByRole('button', { name: 'Change theme' }).click();
    await expect(page.getByRole('menuitemradio', { name: 'High Contrast' })).toHaveAttribute('aria-checked', 'true');
  });

  test.describe('beyond the app\'s own root', () => {
    // These open surfaces whose content the sealed world refuses on purpose:
    // the assistant service answers 503 (it is not running there), and the
    // previous app's Groups screen gets a 400 for its query, as in
    // 19-sections-legacy. What is under test is the colour they wear, so the
    // refusals' console errors are allowed.
    test.use({ allowConsole: true });

    test('the assistant drawer follows the choice, though it is portalled outside the app', async ({ page }) => {
      // The drawer is a MUI surface mounted on <body>, outside .w360, so it
      // wears the document's scheme. Before the one saved choice it stayed
      // dark whatever this menu said.
      const paper = page.locator('.MuiDrawer-paper'); // no role or name of its own
      await page.goto('/home');
      await page.getByRole('button', { name: 'Assistant', exact: true }).click();
      await expect(page.getByRole('button', { name: 'Close assistant' })).toBeVisible();
      await expect(paper).toHaveCSS('background-color', 'rgb(23, 12, 9)');
      await page.getByRole('button', { name: 'Close assistant' }).click();

      await page.getByRole('button', { name: 'Change theme' }).click();
      await page.getByRole('menuitemradio', { name: 'Light' }).click();
      await page.getByRole('button', { name: 'Assistant', exact: true }).click();
      await expect(page.getByRole('button', { name: 'Close assistant' })).toBeVisible();
      await expect(paper).toHaveCSS('background-color', 'rgb(253, 252, 249)');
    });

    test('the previous app shows the scheme chosen here', async ({ page }) => {
      await page.goto('/home');
      await page.getByRole('button', { name: 'Change theme' }).click();
      await page.getByRole('menuitemradio', { name: 'High Contrast' }).click();
      await expect(page.locator('html')).toHaveAttribute('data-scheme', 'highContrast');

      await page.goto('/legacy/groups');
      await expect(page.locator('html')).toHaveAttribute('data-scheme', 'highContrast');
      await page.getByRole('button', { name: 'Change theme' }).click();
      await expect(page.getByRole('menuitemradio', { name: 'High Contrast' })).toHaveAttribute('aria-checked', 'true');
      await expect(page.getByRole('menuitemradio', { name: 'Dark' })).toHaveAttribute('aria-checked', 'false');
    });
  });

  test.describe('with light already chosen', () => {
    test.use({ scheme: 'light' });

    test('a light theme chosen last time is what the app opens in', async ({ page }) => {
      await page.goto('/home');
      await expect(page.locator('html')).toHaveAttribute('data-scheme', 'light');
      await page.getByRole('button', { name: 'Change theme' }).click();
      await expect(page.getByRole('menuitemradio', { name: 'Light' }))
        .toHaveAttribute('aria-checked', 'true');
      // Carried from the old key into MUI's, which is left where it was so a
      // rolled-back bundle still finds it.
      expect(await saved(page)).toMatchObject({ mode: 'light', light: 'light' });
      expect(await page.evaluate(() => localStorage.getItem('w360.scheme'))).toBe('light');
    });
  });

  test.describe('every theme paints the app in the palette pack\'s colours', () => {
    // The pack's values (packages/tokens/src/palette), as the browser reports
    // them. W360's slots are aliases of MUI's variables, so the app's own
    // rules, MUI's surfaces and the map canvas all paint these.
    const PACK = {
      dark: {
        ground: 'rgb(13, 5, 4)', surface: 'rgb(23, 12, 9)', ink: 'rgb(243, 237, 231)',
        muted: 'rgb(139, 129, 123)', onWash: 'rgb(254, 134, 15)', focus: 'rgb(255, 160, 60)',
        accentHex: '#fe860f', focusHex: '#ffa03c', colorScheme: 'dark',
        // The header in the page's own colours, under a 1px rule.
        bar: { bg: 'rgb(13, 5, 4)', ink: 'rgb(243, 237, 231)', rule: 'rgb(49, 38, 34)', ruleWidth: '1px', focus: 'rgb(255, 160, 60)' },
      },
      light: {
        ground: 'rgb(249, 246, 242)', surface: 'rgb(253, 252, 249)', ink: 'rgb(38, 29, 26)',
        muted: 'rgb(115, 105, 100)', onWash: 'rgb(140, 74, 17)', focus: 'rgb(201, 105, 12)',
        accentHex: '#aa5910', focusHex: '#c9690c', colorScheme: 'light',
        bar: { bg: 'rgb(249, 246, 242)', ink: 'rgb(38, 29, 26)', rule: 'rgb(227, 221, 216)', ruleWidth: '1px', focus: 'rgb(201, 105, 12)' },
      },
      pattadar: {
        ground: 'rgb(236, 238, 235)', surface: 'rgb(255, 254, 250)', ink: 'rgb(34, 41, 35)',
        muted: 'rgb(83, 96, 88)', onWash: 'rgb(93, 64, 9)', focus: 'rgb(160, 116, 21)',
        accentHex: '#75510b', focusHex: '#a07415', colorScheme: 'light',
        // Charcoal, ivory ink, a 2px gold rule, and a gold ring in the bar.
        bar: { bg: 'rgb(32, 37, 33)', ink: 'rgb(250, 250, 244)', rule: 'rgb(212, 182, 99)', ruleWidth: '2px', focus: 'rgb(217, 191, 114)' },
      },
      highContrast: {
        ground: 'rgb(255, 255, 255)', surface: 'rgb(255, 255, 255)', ink: 'rgb(0, 0, 0)',
        muted: 'rgb(41, 41, 41)', onWash: 'rgb(0, 28, 56)', focus: 'rgb(0, 0, 0)',
        accentHex: '#003b73', focusHex: '#000000', colorScheme: 'light',
        bar: { bg: 'rgb(255, 255, 255)', ink: 'rgb(0, 0, 0)', rule: 'rgb(0, 0, 0)', ruleWidth: '1px', focus: 'rgb(0, 0, 0)' },
      },
    } as const;

    /** A CSS colour expression, resolved inside the app the way a rule there
     *  would resolve it. */
    const resolve = (page: Page, expression: string) => page.evaluate((e) => {
      const probe = document.createElement('i');
      probe.style.color = e;
      document.querySelector('.w360')!.append(probe);
      const out = getComputedStyle(probe).color;
      probe.remove();
      return out;
    }, expression);

    for (const [id, item] of [['dark', null], ['light', 'Light'], ['pattadar', 'Pattadar Gold'], ['highContrast', 'High Contrast']] as const) {
      test(`${item ?? 'Dark'}: page, header, cards, muted ink, the current section and the focus ring`, async ({ page }) => {
        const want = PACK[id];
        await page.goto('/home');
        if (item) {
          // Chosen with Enter, a key press, so the focus() below is keyboard
          // focus in both engines; after a click it would draw no ring.
          await page.getByRole('button', { name: 'Change theme' }).click();
          await page.getByRole('menu', { name: 'Change theme' }).getByRole('menuitemradio', { name: item }).press('Enter');
        }
        await expect(page.locator('html')).toHaveAttribute('data-scheme', id);
        await expect(page.locator('html')).toHaveCSS('color-scheme', want.colorScheme);

        // The app's root, by its class: it is a plain div with no role.
        const app = page.locator('.w360');
        await expect(app).toHaveCSS('background-color', want.ground);
        await expect(app).toHaveCSS('color', want.ink);
        // A recent property's tile is a card (its class: the tile is a div).
        await expect(page.locator('.cards .rec').first()).toHaveCSS('background-color', want.surface);
        // Muted text clears 4.5:1 on cards in every scheme (TODO-one-platform #17).
        expect(await resolve(page, 'var(--w-ink-3)')).toBe(want.muted);

        // Where you are in the rail: on the accent wash, in the wash's own ink.
        const here = page.getByRole('navigation').locator('[aria-current="page"]').first();
        await expect(here).toHaveCSS('color', want.onWash);
        await expect(here).toHaveCSS('background-color', await resolve(page, 'var(--mui-palette-primary-container)'));

        // The header wears the scheme's chrome: the page's own colours, or
        // Pattadar Gold's charcoal and gold.
        const bar = page.getByRole('banner');
        await expect(bar).toHaveCSS('background-color', want.bar.bg);
        await expect(bar).toHaveCSS('border-bottom-color', want.bar.rule);
        await expect(bar).toHaveCSS('border-bottom-width', want.bar.ruleWidth);
        await expect(bar.getByRole('link', { name: 'Pattadar.' })).toHaveCSS('color', want.bar.ink);
        // The jump-to field is the bar's: its text is the bar's ink.
        await expect(bar.getByRole('combobox', { name: 'Search properties, documents, people' })).toHaveCSS('color', want.bar.ink);

        // focus() from a settled page is keyboard focus in both engines. The
        // theme button is in the header, so its ring is the header's.
        const toggle = page.getByRole('button', { name: 'Change theme' });
        await toggle.focus();
        await expect(toggle).toHaveCSS('outline-color', want.bar.focus);
        if (id === 'highContrast') {
          // One ring for both engines: 3px, with a white halo inside it.
          await expect(toggle).toHaveCSS('outline-width', '3px');
          await expect(toggle).toHaveCSS('box-shadow', 'rgb(255, 255, 255) 0px 0px 0px 3px');
        }

        // What the map canvas is handed for a selection and a hover: it reads
        // these off <html> (w360/cssVar.ts), where they used to be undefined,
        // so every scheme selected in Dark's amber.
        const canvas = await page.evaluate(() => {
          const s = getComputedStyle(document.documentElement);
          return { accent: s.getPropertyValue('--w-accent').trim(), focus: s.getPropertyValue('--w-focus').trim() };
        });
        expect(canvas).toEqual({ accent: want.accentHex, focus: want.focusHex });
      });
    }
  });

  test.describe('before the app has loaded', () => {
    test.use({ scheme: 'light', allowConsole: true });

    test('the page is already painted in the saved scheme, with the app bundle refused', async ({ page }) => {
      // allowConsole: refusing the bundle is the point, and every refused
      // module is a console error.
      await page.route(/\/assets\/.+\.js$/, (route) => route.abort());
      await page.goto('/home');
      await expect(page.locator('html')).toHaveAttribute('data-scheme', 'light');
      await expect(page.locator('html')).toHaveCSS('background-color', 'rgb(249, 246, 242)');
      // Nothing of the app is there: this colour came from theme-init.js alone.
      await expect(page.locator('.w360')).toHaveCount(0);
    });
  });
});

// ── the assistant ──────────────────────────────────────────────────────

// The drawer was rebuilt (assistant/AssistantPanel.tsx): opening it now READS
// the conversation history, capabilities, usage and models, and keeps polling
// every 3 s until the service answers. So "is it up" is decided on opening,
// not on the first send, and the composer is labelled "Message the Pattadar
// Assistant". Nothing is WRITTEN — no conversation created, no question
// streamed — until the owner says something.

/** One SSE frame per event, the way the gateway sends them. */
const sse = (...events: string[]) => events.map((e) => `data: ${e}\n\n`).join('');

/** Answer the assistant's reads from inside the test, so it is up. Registered
 *  after the seed's blanket 503 (fixtures/seed.ts), and world.route puts the
 *  newest first, so these win for this test only. `stream` answers the send. */
const assistantUp = (world: World, stream?: string) => {
  world.route(/\/assistant\/api\/capabilities/, () => ({
    json: { public_records: { ready: true, status: 'ready', tool_count: 8, semantic_search_ready: false, coverage: '1975–2029' } },
  }));
  world.route(/\/assistant\/api\/conversations/, () => ({ json: { id: 'w-conv-1', conversations: [] } }));
  world.route(/\/assistant\/api\/usage/, () => ({
    json: { today_usd: 0, month_usd: 0, requests_today: 0, credit_status: 'ok', balance_usd: null },
  }));
  world.route(/\/assistant\/api\/models/, () => ({ json: { default: '', models: [] } }));
  if (stream !== undefined) {
    world.route(/\/assistant\/api\/chat\/stream/, () => ({ contentType: 'text/event-stream', body: stream }));
  }
};

const composer = (page: Page) => page.getByLabel('Message the Pattadar Assistant');
const greeting = (page: Page) => page.getByText("Hello! I'm your Pattadar Assistant.");

test.describe('the assistant', () => {
  test('the assistant button opens the drawer and the assistant introduces itself', async ({ page, world }) => {
    assistantUp(world);
    await page.goto('/home');
    await expect(page.getByRole('button', { name: 'Assistant', exact: true }))
      .toHaveAttribute('aria-expanded', 'false');

    await page.getByRole('button', { name: 'Assistant', exact: true }).click();
    await expect(greeting(page)).toBeVisible();
    await expect(composer(page)).toBeVisible();
    // The open drawer is a MUI Modal, which aria-hides the rest of the app —
    // so the button behind it is addressed by its label rather than its role.
    await expect(page.getByLabel('Assistant', { exact: true }))
      .toHaveAttribute('aria-expanded', 'true');
  });

  test('the assistant drawer closes and gives the screen back', async ({ page, world }) => {
    assistantUp(world);
    await page.goto('/home');
    await page.getByRole('button', { name: 'Assistant', exact: true }).click();
    await expect(greeting(page)).toBeVisible();

    await page.getByRole('button', { name: 'Close assistant' }).click();
    await expect(greeting(page)).toBeHidden();
    await expect(page.getByRole('button', { name: 'Assistant', exact: true }))
      .toHaveAttribute('aria-expanded', 'false');
  });

  test('opening the assistant writes nothing to the assistant service until I say something', async ({ page, world }) => {
    assistantUp(world);
    await page.goto('/home');
    await page.getByRole('button', { name: 'Assistant', exact: true }).click();
    await expect(greeting(page)).toBeVisible();
    // Reading the history is the drawer's job on opening; creating a
    // conversation or streaming a question is not.
    expect(world.restCalls(/\/assistant\//).filter((c) => c.method !== 'GET')).toEqual([]);
    expect(world.restCalls(/\/assistant\/api\/chat\//)).toEqual([]);
  });

  test('Escape puts the assistant away without touching the screen behind it', async ({ page, world }) => {
    assistantUp(world);
    await page.goto('/home');
    await page.getByRole('button', { name: 'Assistant', exact: true }).click();
    await expect(greeting(page)).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(greeting(page)).toBeHidden();
    await expect(page.getByRole('button', { name: 'Assistant', exact: true }))
      .toHaveAttribute('aria-expanded', 'false');
    await expect(page).toHaveURL(/\/home$/);
  });

  test('the send button will not fire on an empty question', async ({ page, world }) => {
    // Disabled until there is something to send, so a stray tap cannot open a
    // conversation with nothing in it.
    assistantUp(world);
    await page.goto('/home');
    await page.getByRole('button', { name: 'Assistant', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Send message' })).toBeDisabled();

    await composer(page).fill('   ');
    await expect(page.getByRole('button', { name: 'Send message' })).toBeDisabled();

    await composer(page).fill('Is the tax paid?');
    await expect(page.getByRole('button', { name: 'Send message' })).toBeEnabled();
    expect(world.restCalls(/\/assistant\/api\/chat\//)).toEqual([]);
  });

  test.describe('when the assistant service is answering', () => {
    const ask = async (page: Page, question: string) => {
      await composer(page).fill(question);
      await page.getByRole('button', { name: 'Send message' }).click();
    };

    test('the assistant answers, and my question is still there above the answer', async ({ page, world }) => {
      assistantUp(world, sse(
        JSON.stringify({ type: 'thinking' }),
        JSON.stringify({ type: 'token', text: 'The tax on **Sy 214/2** is ' }),
        JSON.stringify({ type: 'token', text: 'paid to 2025-26.' }),
        '[DONE]',
      ));
      await page.goto('/home');
      await page.getByRole('button', { name: 'Assistant', exact: true }).click();
      await ask(page, 'Is the tax on Sy 214/2 paid?');

      await expect(page.getByText('Is the tax on Sy 214/2 paid?')).toBeVisible();
      await expect(page.getByText('paid to 2025-26.').first()).toBeVisible();
      // **bold** arrives as bold rather than as four asterisks on screen. A
      // `thinking` frame becomes the drawer's own "Thinking" step, never the
      // raw frame printed into the answer.
      await expect(page.locator('strong').filter({ hasText: 'Sy 214/2' })).toBeVisible();
      await expect(page.getByText('**')).toHaveCount(0);
      await expect(page.getByText('"type"')).toHaveCount(0);
      // The box is empty and ready for the next one.
      await expect(composer(page)).toHaveValue('');
    });

    test('an answer cut off halfway keeps what arrived and says why it stopped', async ({ page, world }) => {
      // The stream's own error frame: the text that arrived stays, the
      // reason is shown beside it (kept apart from the reply), and the
      // composer stays for another try.
      assistantUp(world, sse(
        JSON.stringify({ type: 'token', text: 'The tax was last paid in ' }),
        JSON.stringify({ type: 'error', text: 'upstream gave up' }),
      ));
      await page.goto('/home');
      await page.getByRole('button', { name: 'Assistant', exact: true }).click();
      await ask(page, 'When was the tax last paid?');

      await expect(page.getByText('The tax was last paid in').first()).toBeVisible();
      await expect(page.getByText('upstream gave up').first()).toBeVisible();
      await expect(page.getByText('When was the tax last paid?')).toBeVisible();
      await expect(composer(page)).toBeVisible();
      await expect(page.getByText('The assistant is not available right now')).toHaveCount(0);
    });

    test('a second question goes into the same conversation rather than starting a new one', async ({ page, world }) => {
      assistantUp(world, sse(JSON.stringify({ type: 'token', text: 'Yes.' }), '[DONE]'));
      await page.goto('/home');
      await page.getByRole('button', { name: 'Assistant', exact: true }).click();
      await ask(page, 'Is the tax paid?');
      await expect(page.getByText('Yes.').first()).toBeVisible();

      // Enter sends too — the way anyone actually types a second question.
      await composer(page).fill('And the one on Sy 301?');
      await composer(page).press('Enter');
      await expect(page.getByText('And the one on Sy 301?')).toBeVisible();
      await expect(page.getByText('Yes.')).toHaveCount(2);

      expect(world.restCalls(/\/assistant\/api\/conversations/).filter((c) => c.method === 'POST'),
        'the conversation is created once and reused').toHaveLength(1);
      expect(world.restCalls(/\/assistant\/api\/chat\/stream/)).toHaveLength(2);
    });
  });

  test.describe('when the service refuses the question itself', () => {
    // The drawer opened against a working service; only the send is refused,
    // with a 503 the browser logs. Provoking it is the point.
    test.use({ allowConsole: true });

    test('a send the service refuses keeps my question on screen, and the box stays', async ({ page, world }) => {
      assistantUp(world);
      world.route(/\/assistant\/api\/chat\/stream/, () => ({
        status: 503, json: { error: 'The assistant is not running.' },
      }));
      await page.goto('/home');
      await page.getByRole('button', { name: 'Assistant', exact: true }).click();
      await composer(page).fill('Is the tax on Sy 214/2 paid?');
      await page.getByRole('button', { name: 'Send message' }).click();

      await expect(page.getByText('The assistant is not running.').first()).toBeVisible();
      await expect(page.getByText('Is the tax on Sy 214/2 paid?')).toBeVisible();
      await expect(composer(page)).toBeVisible();
    });
  });

  test.describe('when the assistant service is not running', () => {
    // The seal answers every assistant route 503 — exactly what the founder's
    // laptop does — and the drawer polls it every 3 s while open, each refusal
    // a console line. Provoking it is the point, so the guard stands down.
    test.use({ allowConsole: true });

    const openDown = async (page: Page) => {
      await page.goto('/home');
      await page.getByRole('button', { name: 'Assistant', exact: true }).click();
      await expect(page.getByText('The assistant is not available right now')).toBeVisible();
    };

    test('the assistant says plainly that it could not be reached, and that my records are safe', async ({ page, world }) => {
      await openDown(page);
      await expect(page.getByText('Your properties and documents are safe.', { exact: false })).toBeVisible();
      // No box to type into a service that is not there, so nothing typed is lost.
      await expect(composer(page)).toHaveCount(0);
      expect(world.restCalls(/\/assistant\//), 'it really did try').not.toEqual([]);
    });

    test('the assistant can be tried again once the line is back up', async ({ page, world }) => {
      await openDown(page);
      assistantUp(world);
      await page.getByRole('button', { name: 'Try again' }).click();
      await expect(composer(page)).toBeVisible();
      await expect(page.getByText('The assistant is not available right now')).toHaveCount(0);
    });
  });
});

// ── what the app says back ─────────────────────────────────────────────

test.describe('toasts', () => {
  test('a write the server refuses says so, in the owner’s words and with the reason', async ({ page, world }) => {
    world.set('dismissWaiting', World.gqlError('the reminder store is down'));
    await page.goto('/home');
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
    await page.goto('/home');
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
    await page.goto('/home');
    await page.getByRole('button', { name: 'Dismiss: Land tax is due on Sy 214/2' }).click();
    await page.getByRole('button', { name: 'Dismiss it' }).click();
    await expect(page.getByRole('alert')).toBeVisible();

    await page.getByRole('button', { name: 'Dismiss', exact: true }).click();
    await expect(page.getByRole('alert')).toHaveCount(0);
  });

  test('two refusals stack up rather than one covering the other', async ({ page, world }) => {
    world.set('dismissWaiting', World.gqlError('the reminder store is down'));
    await page.goto('/home');
    await page.getByRole('button', { name: 'Dismiss: Land tax is due on Sy 214/2' }).click();
    await page.getByRole('button', { name: 'Dismiss it' }).click();
    await expect(page.getByRole('alert')).toHaveCount(1);

    // The dialog stays open on a refusal, so the second attempt is one click.
    await page.getByRole('button', { name: 'Dismiss it' }).click();
    await expect(page.getByRole('alert')).toHaveCount(2);
  });

  test('putting one failure away leaves the other one standing', async ({ page, world }) => {
    world.set('dismissWaiting', World.gqlError('the reminder store is down'));
    await page.goto('/home');
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
    await page.goto('/home');
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
    await page.goto('/papers');
    await page.getByRole('button', { name: /^Revoke the link to/ }).first().click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.getByRole('button', { name: 'Revoke link' }).click();

    // Filtered rather than addressed bare: the jump box keeps a permanently
    // mounted (empty) role="status" of its own, one floor up.
    const said = page.getByRole('status').filter({ hasText: 'can no longer open' });
    await expect(said).toHaveCount(1);
    await expect(page.getByRole('alert'), 'a confirmation does not interrupt').toHaveCount(0);
    await expect(said).toHaveCount(0, { timeout: 15_000 });
  });

  test('Escape clears a column of failures in one go', async ({ page, world }) => {
    world.set('dismissWaiting', World.gqlError('the reminder store is down'));
    await page.goto('/home');
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
    await page.goto('/home');
    await page.getByRole('button', { name: 'Dismiss: Land tax is due on Sy 214/2' }).click();
    await expect(page.getByRole('dialog', { name: 'Dismiss this reminder?' })).toBeVisible();
  };

  test('a dialog takes the keyboard with it when it opens', async ({ page }) => {
    await openDismissDialog(page);
    await expect(page.getByRole('button', { name: 'Cancel', exact: true })).toBeFocused();
  });

  test('Tab cannot walk out of a dialog and into the page behind it', async ({ page }) => {
    await openDismissDialog(page);
    await page.keyboard.press('Tab');
    await expect(page.getByRole('button', { name: 'Dismiss it' })).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(page.getByRole('button', { name: 'Cancel', exact: true })).toBeFocused();
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
    await page.getByRole('dialog').getByText('cannot be brought back').click();
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
    await expect(page.getByRole('dialog')).toContainText('cannot be brought back');
    await expect(page.getByRole('button', { name: 'Cancel', exact: true })).toBeVisible();
  });

  test('Cancel keeps it', async ({ page, world }) => {
    await openDismissDialog(page);
    await page.getByRole('button', { name: 'Cancel', exact: true }).click();
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
    await page.goto('/home');
    // Exact: the scrim beside the open drawer is labelled "Close menu".
    const menu = page.getByRole('button', { name: 'Menu', exact: true });
    await expect(menu).toHaveAttribute('aria-expanded', 'false');
    // Closed, the rail is off-screen in CSS — `inert` is what keeps it out of
    // the tab order and off a screen reader as well (Shell.tsx:408).
    await expect(page.locator('nav[aria-label="Sections"]')).toHaveAttribute('inert', '');

    await menu.click();
    await expect(menu).toHaveAttribute('aria-expanded', 'true');
    await expect(page.locator('nav[aria-label="Sections"]')).not.toHaveAttribute('inert', '');
    await expect(railLink(page, 'Home')).toBeFocused();
  });

  test('Escape shuts the drawer and puts me back on the button I opened it with @phone', async ({ page }) => {
    await page.goto('/home');
    const menu = page.getByRole('button', { name: 'Menu', exact: true });
    await menu.click();
    await expect(menu).toHaveAttribute('aria-expanded', 'true');

    await page.keyboard.press('Escape');
    await expect(menu).toHaveAttribute('aria-expanded', 'false');
    await expect(menu).toBeFocused();
  });

  test('the dark panel beside the drawer shuts it @phone', async ({ page }) => {
    await page.goto('/home');
    await page.getByRole('button', { name: 'Menu', exact: true }).click();
    // The scrim covers the whole width and the drawer sits on the left 17rem
    // of it, so the click has to land to the right of the drawer to reach it.
    await page.getByRole('button', { name: 'Close menu' }).click({ position: { x: 350, y: 300 } });
    await expect(page.getByRole('button', { name: 'Menu', exact: true }))
      .toHaveAttribute('aria-expanded', 'false');
    await expect(page.getByRole('button', { name: 'Menu', exact: true })).toBeFocused();
  });

  test('following a link out of the drawer closes the drawer behind me @phone', async ({ page }) => {
    await page.goto('/home');
    await page.getByRole('button', { name: 'Menu', exact: true }).click();
    await railLink(page, 'Documents').click();

    await expect(page).toHaveURL(/\/papers$/);
    await expect(page.getByRole('button', { name: 'Menu', exact: true }))
      .toHaveAttribute('aria-expanded', 'false');
    await expect(page.locator('nav[aria-label="Sections"]')).toHaveAttribute('inert', '');
  });

  test('a link out of the drawer leaves me on what I opened, not back on the hamburger @phone', async ({ page }) => {
    // Shell.tsx:108-112 is deliberate: only Escape and the scrim hand focus
    // back. A link that routed the page and THEN yanked focus to the topbar
    // would read out the frame again instead of the screen that just arrived.
    await page.goto('/home');
    await page.getByRole('button', { name: 'Menu', exact: true }).click();
    await railLink(page, 'Documents').click();
    await expect(page).toHaveURL(/\/papers$/);
    await expect(page.getByRole('button', { name: 'Menu', exact: true })).not.toBeFocused();
  });

  test('the jump box is still on the phone, and still jumps @phone', async ({ page }) => {
    await page.goto('/home');
    await jumpBox(page).fill('katragunta');
    await page.getByRole('option', { name: /Sy 214\/2/ }).click();
    await expect(page).toHaveURL(new RegExp(`/properties/${ID.parcel}$`));
  });
});
