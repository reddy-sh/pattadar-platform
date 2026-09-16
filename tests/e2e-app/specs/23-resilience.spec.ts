/**
 * When the server is slow, down or lying.
 *
 * Every other file in this suite opens one screen and asks whether it draws
 * the right answer. This one asks a different question of ALL of them at once:
 * what does each screen say while the answer is still coming, and what does it
 * say when the answer never comes at all?
 *
 * It is written as a table (`SCREENS` below) of route + the one root field in
 * apps/web/src/w360/api.ts that gates that route, and five sweeps run over it.
 * Adding a screen to the app means adding one row here, and the five states it
 * owes its reader are asserted for free.
 *
 * The four states, and why each is its own sweep:
 *
 *  1. **Still coming.** `World.never()`. The screen must hold its shape and
 *     must NOT claim there is nothing there. An empty state drawn over a read
 *     still in flight is the worst sentence this app can say — "you have no
 *     papers", "nothing is waiting on you", "nothing has been corrected" — and
 *     it is said about records the owner can see are theirs. Every row carries
 *     the exact sentence its screen says when it IS empty, and the sweep
 *     proves that sentence is absent while the bytes are in the air.
 *  2. **Still coming, and saying so.** The same `never()`, asking whether the
 *     waiting state NAMES what it is waiting for. `Loading` takes a `what` for
 *     exactly this reason (ui.tsx:646-652) and twelve of the twenty-four
 *     rows below do not pass it — a 70vh grey slab captioned "Loading…" over
 *     somebody's land records. Those are `test.fail()`, each naming the line
 *     and the noun the owner is owed.
 *  3. **Refused.** `World.gqlError` — HTTP 200 carrying `errors[]`, which is
 *     how the API actually reports a read it would not do. The screen owes a
 *     `role="alert"` saying what failed, the server's own reason printed
 *     verbatim (it is what gets read down a phone line), and a Try again.
 *  4. **Refused, and asked again.** The retry must be a real read. `Failed`'s
 *     button invalidates the whole `w360` key (ui.tsx:726-737); the sweep
 *     asserts the call count for that field actually rises.
 *  5. **Refused by the transport.** `World.httpError(500)`, a different branch
 *     of `gql()` (client.ts:119) with a different sentence.
 *
 * Then, past the table: the 20s deadline in `requestTimeoutMs`
 * (apps/web/src/api/client.ts:34-38) from both sides, the 600s budget that the
 * same function gives stored BYTES, a write refused mid-flight, a field that
 * answers with a shape the screen cannot draw, and two screens asking for the
 * same thing getting one answer.
 *
 * What a reader of this file must know before changing it:
 *
 *  · **`retry: 1`** (main.tsx:42). Every failed read is asked TWICE before the
 *    query settles, so `world.calls(field)` is 2 after one failed load, not 1.
 *    Every count assertion here is a `toBeGreaterThan`, never an equality.
 *  · **`staleTime: 30_000`** (same line). Two screens that ask for the same
 *    field inside half a minute share one answer — which is a promise, and is
 *    asserted at the bottom of this file.
 *  · **The Shell asks `portfolio` and `orders` on every authenticated route**
 *    (Shell.tsx:63-64). A row whose field is one of those is therefore also
 *    breaking the rail's badge; that is deliberate and the screens survive it.
 *  · **`World.httpError` makes the browser log a failed request**, which the
 *    console guard fails on. Every sweep that needs one sits in its own
 *    `describe` with `allowConsole` and says so. Sweeps 1-4 use `gqlError`,
 *    which is an HTTP 200 and logs nothing.
 *  · **The deadline scenarios are 45-second tests.** A read that times out is
 *    retried once, so the screen does not settle into its failure until
 *    20s + 1s + 20s. They raise their own `test.setTimeout` and they are the
 *    only slow tests in the suite.
 *  · The waiting state is found by `[role="status"][aria-busy="true"]` — the
 *    one shape `Loading` (ui.tsx:648) and every `Busy` in skeletons.tsx share.
 *    The Title shelf is the one screen with no such element at all, which is
 *    why its row is a `test.fail` rather than a stricter assertion.
 *
 * Fifteen defects are recorded across seventeen `test.fail()` blocks, in three
 * families:
 *
 *   A. Thirteen screens draw a waiting state that does not name what it is
 *      waiting for (sweep 2, plus the Maps screen at the bottom of this file).
 *      Each row's `where` names the line. The Title shelf is the worst of
 *      them: Shelf.tsx:109 has no live region at all, so a screen reader is
 *      told nothing whatever while a shelf loads.
 *   B. The Audit tab has no failure branch at all — Orders.tsx:284 drops
 *      `error` on the floor and :300 reads `(data ?? []).length === 0` as
 *      "nothing has been corrected". A server that is down tells an owner
 *      their record has never been touched, on the one tab whose whole promise
 *      is that nothing is ever removed from it. That is sweeps 3, 4 and 5 —
 *      three test.fail blocks for the one cause.
 *   C. The Reader closes its rename drawer without looking at what the write
 *      answered (Reader.tsx:281-294), so a refusal that is a `false` rather
 *      than an error reads as a save.
 *
 * They go green the day they are fixed.
 */
import { test, expect, World, BLANK_JPEG } from '../fixtures/harness';
import type { Page } from '../fixtures/harness';
import { ID, PAPER, TICKET } from '../fixtures/ids';
import { PHOTOS } from '../fixtures/seed';

// ═══════════════════════════════════════════════════════════════════════
// The table
// ═══════════════════════════════════════════════════════════════════════

interface Screen {
  /** How the founder names this screen in a sentence. */
  name: string;
  route: string;
  /** The one root field in api.ts whose absence gates this screen. */
  field: string;
  /** What the waiting state says — or, where it says nothing, the sentence
   *  the owner is owed instead. */
  waits: string;
  /** False when the screen draws `Loading` with no `what`. A defect. */
  namesWait: boolean;
  /** How the waiting region carries that sentence: as its own text
   *  (`Loading`), or as an `aria-label` on a content-shaped skeleton. */
  via: 'text' | 'label';
  /** The `what` the screen hands `Failed`, which prints "<what> did not load". */
  failedWhat: string;
  /** A sentence this screen says when it is genuinely empty. It must never be
   *  on screen while the read is still in flight. '' where the screen has no
   *  whole-screen empty state. */
  neverSays: string;
  /** apps/web/src/w360/... — the line that draws the waiting state. */
  where: string;
  /** Set when the screen has NO failure branch at all: the file and line of
   *  the cause, for the test.fail comment. */
  noFailure?: string;
  /** Set when the waiting state is not a live region AT ALL — not merely
   *  unnamed. A screen reader is told nothing whatever while it loads, which
   *  is a strictly worse defect than an unnamed `Loading`, so it is recorded
   *  separately rather than folded into sweep 2. The file and line of the
   *  cause. */
  noLiveRegion?: string;
}

const SCREENS: Screen[] = [
  { name: 'the dashboard', route: '/app', field: 'portfolio',
    waits: 'Loading your dashboard', namesWait: true, via: 'text',
    failedWhat: 'Your dashboard', neverSays: 'Nothing in your portfolio yet',
    where: 'pages/Dashboard.tsx:181' },

  { name: 'the properties list', route: '/app/properties', field: 'properties',
    waits: 'Loading your properties', namesWait: true, via: 'label',
    failedWhat: 'Your properties', neverSays: 'Nothing filed yet',
    where: 'pages/Properties.tsx:932' },

  { name: 'the properties map', route: '/app/properties?view=map', field: 'properties',
    waits: 'Loading the map of your properties', namesWait: true, via: 'label',
    failedWhat: 'Your properties', neverSays: 'Nothing filed yet',
    where: 'pages/Properties.tsx:934' },

  { name: 'the properties table', route: '/app/properties?view=list', field: 'properties',
    waits: 'Loading your properties', namesWait: true, via: 'label',
    failedWhat: 'Your properties', neverSays: 'Nothing filed yet',
    where: 'pages/Properties.tsx:933' },

  { name: 'what has been shared with me', route: '/app/shared', field: 'sharedKits',
    waits: 'Loading what has been shared with you', namesWait: true, via: 'text',
    failedWhat: 'Shared with me', neverSays: 'Nothing has been shared with you',
    where: 'pages/Shared.tsx:53' },

  { name: 'the work waiting on me', route: '/app/assigned', field: 'orders',
    waits: 'Loading work waiting on you', namesWait: false, via: 'text',
    failedWhat: 'Work waiting on you', neverSays: 'Nothing is waiting on you',
    where: 'pages/Orders.tsx:377' },

  { name: 'the services list', route: '/app/services', field: 'orders',
    waits: 'Loading work you have ordered', namesWait: false, via: 'text',
    failedWhat: 'Work you have ordered', neverSays: 'Nothing is on order',
    where: 'pages/Orders.tsx:426' },

  // Ordering asks which land first, and that screen reads twice: the owner's
  // land, which is what it is for, and the catalogue strip under it, which is
  // there so somebody with no land yet can still read what this costs. They
  // fail apart — a catalogue that will not load must not withhold thirty
  // perfectly good cards — so each one is its own row.
  // Named both ways, and the two nouns do not agree: the skeleton it borrows
  // from the Properties grid announces "Loading your properties" and the
  // failure beside it says "Your land did not load". Recorded rather than
  // failed — ui.tsx:646-652 asks for the two words to match, but a screen that
  // names the wait at all is on the right side of this file's defect families.
  { name: 'the land chooser', route: '/app/order', field: 'properties',
    waits: 'Loading your properties', namesWait: true, via: 'label',
    failedWhat: 'Your land', neverSays: 'No land to order against yet',
    where: 'pages/OrderLand.tsx:196' },

  { name: 'the catalogue under the land chooser', route: '/app/order', field: 'servicesOffered',
    waits: 'Loading the list of services', namesWait: true, via: 'text',
    failedWhat: 'The list of services', neverSays: 'There is nothing on offer just now',
    where: 'pages/OrderLand.tsx:274' },

  { name: 'the vault', route: '/app/papers', field: 'vault',
    waits: 'Loading your papers', namesWait: true, via: 'text',
    failedWhat: 'Your papers', neverSays: '',
    where: 'pages/Vault.tsx:419' },

  { name: 'the Title shelf', route: '/app/papers/shelf/title', field: 'vaultPapers',
    waits: 'Loading the Title shelf', namesWait: false, via: 'text',
    failedWhat: 'The Title shelf', neverSays: 'Nothing is filed under Title yet',
    where: 'pages/Shelf.tsx:109', noLiveRegion: 'pages/Shelf.tsx:109' },

  { name: 'a paper in the reader', route: `/app/papers/${PAPER.deed}`, field: 'document',
    waits: 'Loading this paper', namesWait: false, via: 'text',
    failedWhat: 'This paper', neverSays: 'This paper is not in your vault',
    where: 'pages/Reader.tsx:176' },

  // The one-service screen. `field` is still `ticket` and always will be —
  // that is the GraphQL root field's name (api.ts), which nobody reads — while
  // every string below names the SERVICE. The three page-level states are
  // about the thing the owner tried to open, so they are the one place on that
  // screen that says "service" rather than "job"
  // (docs/specs/2026-09-14-service-detail.md §1.2).
  { name: 'a service', route: `/app/services/${TICKET.placed}`, field: 'ticket',
    waits: 'Loading this service', namesWait: true, via: 'text',
    failedWhat: 'This service', neverSays: 'This service is not here',
    where: 'pages/Ticket.tsx:867' },

  { name: 'the wallet', route: '/app/wallet', field: 'wallet',
    waits: 'Loading your wallet', namesWait: false, via: 'text',
    failedWhat: 'Your wallet', neverSays: 'Nothing has moved yet',
    where: 'pages/Wallet.tsx:40' },

  { name: 'a record 360', route: `/app/records/${ID.parcel}`, field: 'record',
    waits: 'Loading this record', namesWait: true, via: 'label',
    failedWhat: 'This record', neverSays: 'That record is not in your portfolio',
    where: 'pages/Record.tsx:63' },

  { name: "a record's papers", route: `/app/records/${ID.parcel}`, field: 'papers',
    waits: 'Loading the papers on this parcel', namesWait: true, via: 'label',
    failedWhat: 'These papers', neverSays: 'Nothing is filed against this parcel yet',
    where: 'pages/RecordPapers.tsx:544' },

  { name: 'what is on the land', route: `/app/records/${ID.parcel}/features`, field: 'features',
    waits: 'Loading what is on this land', namesWait: false, via: 'text',
    failedWhat: 'What is on this land', neverSays: '',
    where: 'pages/RecordFeatures.tsx:407' },

  { name: 'the people on a record', route: `/app/records/${ID.parcel}/people`, field: 'people',
    waits: 'Loading the people on this record', namesWait: false, via: 'text',
    failedWhat: 'The people on this record', neverSays: 'Nobody is filed on this land yet',
    where: 'pages/RecordPeople.tsx:208' },

  { name: "a record's services", route: `/app/records/${ID.parcel}/services`, field: 'orders',
    waits: "Loading this record's services", namesWait: false, via: 'text',
    failedWhat: "This record's services", neverSays: 'Nothing is on order',
    where: 'pages/Orders.tsx:274' },

  { name: 'what a record is worth', route: `/app/records/${ID.parcel}/money`, field: 'money',
    waits: 'Loading what this record is worth', namesWait: false, via: 'text',
    failedWhat: 'What this record is worth', neverSays: 'No purchase recorded for this record',
    where: 'pages/RecordMoney.tsx:83' },

  { name: 'what a record has cost', route: `/app/records/${ID.parcel}/expenses`, field: 'expenses',
    waits: 'Loading what this record has cost', namesWait: false, via: 'text',
    failedWhat: 'What this record has cost', neverSays: 'Nothing spent on this record yet',
    where: 'pages/RecordExpenses.tsx:334' },

  { name: "a record's audit trail", route: `/app/records/${ID.parcel}/history`, field: 'corrections',
    waits: 'Loading what has been changed', namesWait: false, via: 'text',
    failedWhat: "This record's corrections",
    neverSays: 'Nothing has been corrected on this record yet',
    where: 'pages/Orders.tsx:300', noFailure: 'pages/Orders.tsx:284,300' },

  { name: "a record's boundary", route: `/app/records/${ID.parcel}/map`, field: 'boundary',
    waits: 'Loading this boundary', namesWait: true, via: 'text',
    failedWhat: 'This boundary', neverSays: '',
    where: 'pages/RecordBoundary.tsx:565' },

  { name: "a record's photos", route: `/app/records/${ID.parcel}/photos`, field: 'photos',
    waits: 'Loading these photos', namesWait: false, via: 'text',
    failedWhat: 'These photos', neverSays: 'No photos of',
    where: 'pages/RecordPhotos.tsx:251' },
];

// ═══════════════════════════════════════════════════════════════════════
// Handles
// ═══════════════════════════════════════════════════════════════════════

/** Every waiting state in this app is a live region that says it is busy —
 *  `Loading` (ui.tsx:648), every `Busy` in skeletons.tsx, and the papers list
 *  that carries the flag on its own container (RecordPapers.tsx:542). */
const waiting = (page: Page) => page.locator('[role="status"][aria-busy="true"]');

/** The waiting region for one row, found by the sentence it owes. */
function waitingFor(page: Page, s: Screen) {
  return s.via === 'label'
    ? page.locator(`[role="status"][aria-busy="true"][aria-label="${s.waits}"]`)
    : waiting(page).filter({ hasText: s.waits });
}

/** The grey. Shared by `Loading` and every `Sk` in skeletons.tsx, so it is the
 *  one handle that answers "is this screen holding its shape" on all of them. */
const grey = (page: Page) => page.locator('.skeleton');

/** `Failed` (ui.tsx:706) — the only `role="alert"` that says "did not load".
 *  Filtered on that phrase so a toast raised by something else cannot be
 *  mistaken for the screen's own failure. */
const failure = (page: Page) => page.getByRole('alert').filter({ hasText: 'did not load' });

/** Every empty state in this module is a `.blank` (ui.tsx:669). `Failed` is a
 *  `.blank bad`, so "no empty state" is `.blank` minus `.bad`. */
const emptyState = (page: Page) => page.locator('.blank:not(.bad)');

/** The reason a test hands the world, so the sweep can assert it came back
 *  out the other side verbatim. */
const reasonFor = (s: Screen) => `the ${s.field} store is not answering`;

/** One row of the table, by the name it is listed under. By NAME rather than by
 *  index: a row added to the table shifts every index below it, and a test that
 *  reads `SCREENS[14]` then quietly starts asserting about a different screen
 *  than the one it names. */
function row(name: string): Screen {
  const hit = SCREENS.find((s) => s.name === name);
  if (!hit) throw new Error(`23-resilience: no screen named "${name}" in SCREENS`);
  return hit;
}

// ═══════════════════════════════════════════════════════════════════════
// Sweep 1 — the answer has not arrived, and the screen must not pretend
//           it has
// ═══════════════════════════════════════════════════════════════════════

test.describe('While an answer is still coming', () => {
  for (const s of SCREENS) {
    test(`${s.name}, still being read, holds its shape and never says there is nothing there`,
      async ({ page, world }) => {
        world.set(s.field, World.never());
        await page.goto(s.route);

        // Holding its shape: the screen is drawn, with grey where the answer
        // will be. Not a spinner, and not a blank column. The long timeout is
        // for the chunk, not for the query — every screen here is behind
        // React.lazy and this suite is often run beside three others.
        await expect(grey(page).first()).toBeVisible({ timeout: 20_000 });

        // And the grey is INSIDE a live region, so somebody who cannot see it
        // is told the screen is working rather than left on a page that has
        // gone silent. This is the weaker half of the promise sweep 2 makes —
        // "it is busy" rather than "it is busy fetching X" — and every row but
        // the Title shelf keeps it. (Shell.tsx:334 mounts a permanent
        // `role="status"` for the search readout; it carries no `aria-busy`,
        // so it cannot stand in for a screen's own waiting region here.)
        if (!s.noLiveRegion) await expect(waiting(page)).not.toHaveCount(0);

        // The three lies a screen can tell while it is still waiting.
        await expect(emptyState(page)).toHaveCount(0);
        await expect(failure(page)).toHaveCount(0);
        if (s.neverSays) await expect(page.getByText(s.neverSays)).toHaveCount(0);

        // And the rail is still there, so the wait is a screen still loading
        // rather than an app that has fallen over.
        await expect(page.getByRole('navigation').first()).toBeVisible();
      });
  }
});

// ═══════════════════════════════════════════════════════════════════════
// Sweep 2 — and saying what it is waiting FOR
// ═══════════════════════════════════════════════════════════════════════

test.describe('While an answer is still coming, in words', () => {
  for (const s of SCREENS) {
    // ── defect (fourteen of them) ────────────────────────────────────────
    // `Loading` takes a `what` precisely so the waiting word and the failure
    // word agree (ui.tsx:646-652), and these screens do not pass one. What the
    // owner gets is a grey slab captioned "Loading…" — on the money tab, on
    // the wallet, on the photographs of their own land. The noun each one is
    // owed is the row's `waits`, and it is the noun that screen ALREADY hands
    // `Failed` two lines below the one named in `where`.
    //
    // The Title shelf (Shelf.tsx:109) is worse than the other thirteen: it
    // draws `SkRowItems` bare, and those are `aria-hidden` placeholders with
    // no live region around them at all, so a screen reader is told nothing
    // whatever — not even "Loading…".
    test(`${s.name} says what it is waiting for while it waits`, async ({ page, world }) => {
      if (!s.namesWait) test.fail();
      world.set(s.field, World.never());
      await page.goto(s.route);

      await expect(waitingFor(page, s)).toBeVisible({ timeout: s.namesWait ? 20_000 : 3_000 });
    });
  }

  // ── defect, and the worst of the fourteen ──────────────────────────────
  // Every other screen in the table at least says "Loading…" out loud. The
  // shelf (pages/Shelf.tsx:109) draws `SkRowItems` bare — the placeholder rows
  // are `aria-hidden` spans and nothing wraps them — so there is no live
  // region on the page at all. A screen reader is handed a page head, a lede,
  // and then silence, for as long as the read takes. The other thirteen are
  // owed a noun; this one is owed the announcement itself, which is what
  // `SkRows` (skeletons.tsx:255) already provides for exactly this shape:
  //   {papers.isLoading && <SkRows rows={5} label="Loading the Title shelf" />}
  test.fail('the Title shelf tells a screen reader something is happening at all', async ({ page, world }) => {
    world.set('vaultPapers', World.never());
    await page.goto('/app/papers/shelf/title');

    // The shelf's own head arrives from the route, so the screen is up and
    // the only thing missing is the announcement.
    await expect(page.getByRole('heading', { name: 'Title', exact: true })).toBeVisible({ timeout: 20_000 });
    await expect(grey(page).first()).toBeVisible();
    await expect(waiting(page)).not.toHaveCount(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// Sweep 3 — the server refused the read
// ═══════════════════════════════════════════════════════════════════════

test.describe('When a read is refused', () => {
  for (const s of SCREENS) {
    // ── defect, on the audit trail only ─────────────────────────────────
    // Orders.tsx:284 destructures `useCorrections` WITHOUT `error`, and :300
    // treats `(data ?? []).length === 0` as "nothing has been corrected".
    // A failed read and a clean history draw the same screen, so an outage
    // tells an owner their record has never been touched — on the one tab
    // whose stated promise is "nothing is removed from this list". Every other
    // list in this file has a `Failed` branch; this one is owed the same:
    //   : !data ? <Failed what="This record's corrections" error={error} />
    test(`${s.name}, refused, says what failed and why — and offers to ask again`,
      async ({ page, world }) => {
        if (s.noFailure) test.fail();
        const why = reasonFor(s);
        world.set(s.field, World.gqlError(why));
        await page.goto(s.route);

        const alert = failure(page);
        await expect(alert).toBeVisible({ timeout: s.noFailure ? 3_000 : 20_000 });
        // Once, not twice. Several of these routes have two callers of the
        // same key on screen at once (the Shell's badge and the list below it,
        // the 360 header and the hanger under it) and a screen that apologises
        // per caller reads as several things broken rather than one.
        await expect(alert).toHaveCount(1);
        await expect(alert).toContainText(`${s.failedWhat} did not load`);
        // The sentence that stops somebody ringing support in a panic.
        await expect(alert).toContainText('Nothing has been lost');
        await expect(alert).toContainText('Your records are untouched.');
        // The server's own words, printed verbatim, for whoever is being asked
        // "what does it say?" down a phone line.
        await expect(alert).toContainText(why);
        await expect(alert.getByRole('button', { name: 'Try again' })).toBeVisible();

        // A failure is not an emptiness, and must not be drawn as one.
        if (s.neverSays) await expect(page.getByText(s.neverSays)).toHaveCount(0);
        await expect(emptyState(page)).toHaveCount(0);

        // One screen failed, not the app. The rail is the difference between
        // "this page could not load" and "Pattadar is down" — and it is the
        // only way off a screen that has nothing else on it.
        await expect(page.getByRole('navigation').first()).toBeVisible();
      });
  }
});

// ═══════════════════════════════════════════════════════════════════════
// Sweep 4 — and asking again is a real read
// ═══════════════════════════════════════════════════════════════════════

test.describe('When a refused read is asked again', () => {
  for (const s of SCREENS) {
    // ── defect, on the audit trail only ─────────────────────────────────
    // No failure branch (Orders.tsx:284,300) means no Try again either: the
    // audit tab is the one screen in the module an owner cannot re-ask from
    // without reloading the whole app.
    test(`asking ${s.name} again really does ask the server again`, async ({ page, world }) => {
      if (s.noFailure) test.fail();
      world.set(s.field, World.gqlError(reasonFor(s)));
      await page.goto(s.route);

      const alert = failure(page);
      await expect(alert).toBeVisible({ timeout: s.noFailure ? 3_000 : 20_000 });

      // `retry: 1` in main.tsx:42 means the failed load already asked twice.
      const before = world.calls(s.field).length;
      expect(before).toBeGreaterThan(0);

      await alert.getByRole('button', { name: 'Try again' }).click();

      // A retry that refetches in silence looks like a dead button; a dead
      // button on an error screen is where somebody gives up. The read is real
      // whether or not it succeeds, and the world is still refusing, so the
      // screen is still here saying so — which is itself the answer.
      await expect.poll(() => world.calls(s.field).length, { timeout: 15_000 })
        .toBeGreaterThan(before);
      await expect(alert).toBeVisible();
    });
  }
});

// ═══════════════════════════════════════════════════════════════════════
// Sweep 5 — the transport itself refused
// ═══════════════════════════════════════════════════════════════════════

test.describe('When the request itself is refused', () => {
  // A 500 is logged by the browser as a failed request, which the console
  // guard fails on. Provoking it is the point of every test in here.
  test.use({ allowConsole: true });

  for (const s of SCREENS) {
    // ── defect, on the audit trail only — see sweep 3 ────────────────────
    test(`${s.name} behind a 500 says so, with the code in it`, async ({ page, world }) => {
      if (s.noFailure) test.fail();
      world.set(s.field, World.httpError(500));
      await page.goto(s.route);

      const alert = failure(page);
      await expect(alert).toBeVisible({ timeout: s.noFailure ? 3_000 : 20_000 });
      await expect(alert).toContainText(`${s.failedWhat} did not load`);
      // gql() turns a non-ok response into this sentence (client.ts:119). It
      // is the one thing support can act on.
      await expect(alert).toContainText('GraphQL HTTP 500');
      // The same two promises sweep 3 makes, because a transport failure is a
      // different branch of `gql()` and could lose either of them on its own.
      if (s.neverSays) await expect(page.getByText(s.neverSays)).toHaveCount(0);
      await expect(emptyState(page)).toHaveCount(0);
      await expect(page.getByRole('navigation').first()).toBeVisible();
    });
  }
});

// ═══════════════════════════════════════════════════════════════════════
// Asking again, and having it work
// ═══════════════════════════════════════════════════════════════════════

test('a dashboard that failed and is asked again repairs itself without a reload', async ({ page, world }) => {
  const good = world.seedOf<{ tiles: unknown[] }>('portfolio');
  world.set('portfolio', World.gqlError('the portfolio store is not answering'));
  await page.goto('/app');

  const alert = failure(page);
  await expect(alert).toBeVisible();
  const before = world.calls('portfolio').length;

  // The server comes back between the failure and the click.
  world.set('portfolio', good);
  await alert.getByRole('button', { name: 'Try again' }).click();

  // Repaired means the numbers are on screen, not merely that the apology
  // went away: a retry that cleared the alert and left an empty page would
  // pass a "no longer failing" assertion and be worse than the failure.
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Shankar Reddy');
  await expect(page.locator('.strip > *')).toHaveCount(good.tiles.length);
  await expect(page.getByText('What it is worth')).toBeVisible();
  await expect(page.getByText('2.39')).toBeVisible();
  await expect(failure(page)).toHaveCount(0);
  expect(world.calls('portfolio').length).toBeGreaterThan(before);
});

test('the retry repairs the whole page, not the one row that failed', async ({ page, world }) => {
  // `Failed` invalidates the entire `w360` key rather than refetching the one
  // query it was handed (ui.tsx:730-733), because a screen is usually several
  // queries deep and the stale sibling is the next thing to break. The
  // dashboard is the plainest case: `portfolio` is what died, and `orders` —
  // the rail's badge, asked by Shell.tsx:64 and never broken — is asked again
  // with it.
  //
  // A screen that owns a narrower remedy still gets one: RecordPapers.tsx:672
  // passes `onRetry={refetchPapers}` and re-reads only its own list.
  world.set('portfolio', World.gqlError('the portfolio store is not answering'));
  await page.goto('/app');

  const alert = failure(page);
  await expect(alert).toBeVisible();
  const ordersBefore = world.calls('orders').length;
  expect(ordersBefore).toBeGreaterThan(0);

  await alert.getByRole('button', { name: 'Try again' }).click();

  await expect.poll(() => world.calls('orders').length, { timeout: 15_000 })
    .toBeGreaterThan(ordersBefore);
});

test('a screen that owns a narrower remedy re-reads only the list that failed', async ({ page, world }) => {
  // The other half of the rule above, and the half only a comment asserted.
  // RecordPapers.tsx:672 hands `Failed` its own `onRetry={refetchPapers}`, so
  // `Failed` takes the caller's remedy instead of invalidating the whole
  // `w360` key (ui.tsx:726-737). That matters here because the record itself
  // loaded fine: re-reading it to repair the list below it would throw away a
  // good answer and make the header flicker for nothing.
  world.set('papers', World.gqlError('the papers store is not answering'));
  await page.goto(`/app/records/${ID.parcel}`);

  const alert = failure(page);
  await expect(alert).toBeVisible({ timeout: 20_000 });
  await expect(alert).toContainText('These papers did not load');
  const papersBefore = world.calls('papers').length;
  const recordBefore = world.calls('record').length;
  expect(recordBefore).toBeGreaterThan(0);

  await alert.getByRole('button', { name: 'Try again' }).click();

  await expect.poll(() => world.calls('papers').length, { timeout: 15_000 })
    .toBeGreaterThan(papersBefore);
  // And the record was not asked for again. Polled rather than read once, so
  // a re-read that arrives a tick late is still caught.
  await expect.poll(() => world.calls('record').length, { timeout: 3_000 })
    .toBe(recordBefore);
});

test('one dead read on a record leaves everything else on the record readable', async ({ page, world }) => {
  // The whole case for reading a screen query by query rather than gating it
  // on one call: the papers are gone, and the title, the extent, the tabs and
  // the map rail are all still there. An owner standing in a tahsildar's
  // office with one panel down can still read the rest of their record out.
  world.set('papers', World.gqlError('the papers store is not answering'));
  await page.goto(`/app/records/${ID.parcel}`);

  await expect(failure(page)).toBeVisible({ timeout: 20_000 });
  await expect(failure(page)).toHaveCount(1);

  await expect(page.getByRole('heading', { level: 1 })).toContainText('Sy 214/2');
  await expect(page.getByText('Katragunta', { exact: false }).first()).toBeVisible();
  await expect(page.getByRole('link', { name: 'Features' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Money' })).toBeVisible();
  await expect(page.getByRole('navigation').first()).toBeVisible();
});

test('a Try again on a slow server is visibly working, and never both apology and wait at once', async ({ page, world }) => {
  // A retry that re-reads in silence looks like a dead button, and a dead
  // button on an error screen is where somebody gives up and reloads the tab.
  //
  // `Failed` has its own answer for that — the label swaps to "Trying…" and
  // the button refuses a second press (ui.tsx:740-746) — and it turns out to
  // be unreachable from anywhere in this module, including from the screens
  // that own a narrower `onRetry`. A refetch puts the query back to pending,
  // `isLoading` goes true, and every caller's `isLoading ? <Loading/>` clause
  // swaps the whole failure box out in the same tick the button was pressed.
  // What the owner gets instead is the screen's own waiting state, named —
  // the same promise kept a better way, so it is asserted rather than filed as
  // a defect. (02-dashboard.spec.ts:1125 records the same thing for the
  // broad `invalidateQueries` path; this is the narrow `onRetry` one, which is
  // a different branch of `Failed.again` and could lose it on its own.)
  world.set('papers', World.gqlError('the papers store is not answering'));
  await page.goto(`/app/records/${ID.parcel}`);

  const alert = failure(page);
  await expect(alert).toBeVisible({ timeout: 20_000 });

  // The server stops answering entirely between the failure and the click, so
  // the retry is still in flight when the screen is looked at.
  world.set('papers', World.never());
  const asked = world.calls('papers').length;
  await alert.getByRole('button', { name: 'Try again' }).click();

  // In the screen's own words, and only one of the two states at a time: an
  // apology sitting above a skeleton of the same list is the page saying both
  // "this failed" and "this is coming" about one thing.
  await expect(waitingFor(page, row("a record's papers"))).toBeVisible();
  await expect(failure(page)).toHaveCount(0);
  // And it was a real read, not a re-render.
  await expect.poll(() => world.calls('papers').length, { timeout: 15_000 })
    .toBeGreaterThan(asked);
});

// ═══════════════════════════════════════════════════════════════════════
// The twenty-second deadline
// ═══════════════════════════════════════════════════════════════════════

test.describe('The twenty-second deadline', () => {
  test('a dashboard that takes eighteen seconds is waited for, not given up on', async ({ page, world }) => {
    // apps/web/src/api/client.ts:37 gives every GraphQL read 20s. Eighteen is
    // inside it, and the screen owes the owner the answer rather than an
    // apology it did not need to make.
    test.setTimeout(90_000);
    const good = world.seedOf('portfolio');
    world.set('portfolio', World.slow(18_000, good));
    await page.goto('/app');

    await expect(waitingFor(page, row('the dashboard'))).toBeVisible();
    await expect(page.getByText('Shankar Reddy').first()).toBeVisible({ timeout: 40_000 });
    await expect(failure(page)).toHaveCount(0);
  });

  test.describe('when the answer comes too late', () => {
    // A request the browser abandons is logged by the browser as a failed
    // request, which the console guard fails on. Provoking that is the point
    // of both tests in here.
    test.use({ allowConsole: true });

    test('a dashboard the server never answers in time says exactly that', async ({ page, world }) => {
      // Twenty-four seconds is past the deadline, so the read is abandoned at
      // 20s, retried once (main.tsx:42), abandoned again at 41s and settles.
      test.setTimeout(150_000);
      const good = world.seedOf('portfolio');
      world.set('portfolio', World.slow(24_000, good));
      await page.goto('/app');

      const alert = failure(page);
      await expect(alert).toBeVisible({ timeout: 90_000 });
      await expect(alert).toContainText('Your dashboard did not load');
      // client.ts:89-92 — "signal is aborted without reason" is not a sentence
      // to put in front of an owner, so it is turned into this one.
      await expect(alert).toContainText('The server did not answer in time.');
      // And the thing it must never turn into.
      await expect(page.getByText('Nothing in your portfolio yet')).toHaveCount(0);
      await expect(emptyState(page)).toHaveCount(0);
    });

    test('a properties list the server never answers in time is not an empty portfolio', async ({ page, world }) => {
      test.setTimeout(150_000);
      world.set('properties', World.slow(24_000, { shown: 0, total: 0, hidden: 0, filterSummary: '', hiddenPlaces: [], activeCount: 0, cards: [], facets: [] }));
      await page.goto('/app/properties');

      const alert = failure(page);
      await expect(alert).toBeVisible({ timeout: 90_000 });
      await expect(alert).toContainText('Your properties did not load');
      await expect(alert).toContainText('The server did not answer in time.');
      // The worst possible reading of a slow server: five records, and the
      // screen says the account holds nothing.
      await expect(page.getByText('Nothing filed yet')).toHaveCount(0);
      await expect(page.getByText('Add your first parcel or property')).toHaveCount(0);
    });
  });

  test('a scan that takes twenty-three seconds still arrives, because bytes are not a query', async ({ page, world }) => {
    // requestTimeoutMs (client.ts:34-38) gives a `/content` read ten minutes,
    // not twenty seconds: a photograph of somebody's land is megabytes over a
    // village connection, and twenty seconds is a limit it should never be
    // measured against. Proving it needs a fileRef the client will actually
    // fetch — `PhotoImg` (ui.tsx:256) only asks the file store for a real
    // storage uuid, and every seeded ref is a readable name.
    test.setTimeout(120_000);
    const stored = '3f6c9b2a-1d4e-4f7a-9c18-0b5d2e7a4c31';
    const shot = (PHOTOS.photos as Record<string, unknown>[])[0];
    world.set('photos', { ...PHOTOS, total: 1, videoCount: 0, photos: [{ ...shot, fileRef: stored }] });
    world.route(/\/api\/gateway\/storage\/files\/[^/]+\/content/, () => ({
      delayMs: 23_000, contentType: 'image/jpeg', body: BLANK_JPEG,
    }));

    await page.goto(`/app/records/${ID.parcel}/photos`);

    await expect(page.locator('img[src^="blob:"]').first()).toBeVisible({ timeout: 60_000 });
    // `PhotoImg` draws this when the bytes are refused (ui.tsx:262-276). A
    // photo that exists and was abandoned at twenty seconds would land here.
    await expect(page.locator('.photo-failed')).toHaveCount(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// A write the server would not take
// ═══════════════════════════════════════════════════════════════════════

test.describe('When a write is refused mid-flight', () => {
  test('a rename the server refused leaves the paper called what it was called', async ({ page, world }) => {
    world.set('updatePaper', World.gqlError('the paper store refused the write'));
    await page.goto(`/app/papers/${PAPER.deed}`);
    await expect(page.getByText('Sale deed 4412 of 1998').first()).toBeVisible();

    await page.getByRole('button', { name: 'Actions for Sale deed 4412 of 1998' }).click();
    await page.getByRole('menuitem', { name: 'Rename or move to another shelf' }).click();
    await page.getByLabel('What it is called').fill('Sale deed 4412 of 1998 (renamed)');
    await page.getByRole('button', { name: 'Save' }).click();

    // api.ts:684-697 raises the toast for every write in the module, so no
    // caller can forget it. It does not auto-dismiss: a failure that slides
    // away has hidden the only notice that the work was lost.
    const toast = page.locator('.toast.bad');
    await expect(toast).toContainText('That paper could not be saved. Nothing has changed.');
    await expect(toast).toContainText('the paper store refused the write');

    // The screen shows the truth — there is no optimistic write anywhere in
    // this module (no `onMutate` in api.ts), and this is what keeps it honest.
    await expect(page.getByText('(renamed)')).toHaveCount(0);
    await expect(page.getByText('Sale deed 4412 of 1998').first()).toBeVisible();
    // And what was typed is still in the box, so the work is not lost either.
    await expect(page.getByLabel('What it is called')).toHaveValue('Sale deed 4412 of 1998 (renamed)');
  });

  // ── defect ───────────────────────────────────────────────────────────
  // apps/web/src/w360/pages/Reader.tsx:281-294. `saveEdit` awaits
  // `editPaper.mutateAsync(...)` and then closes the dialog without ever
  // looking at what came back. `updatePaper` returns a Boolean, and `false` is
  // how the resolver refuses a write it will not do — so a refusal that is not
  // an error closes the drawer, raises nothing, and leaves the owner believing
  // the paper was renamed. The only trace is that the name does not change.
  // The owner is owed the same treatment a thrown error gets: check the
  // returned Boolean and raise the toast, exactly as RequestWork.tsx:198-201
  // already does for `createRequest`.
  test.fail('a rename the server declines does not close the drawer as though it worked', async ({ page, world }) => {
    world.set('updatePaper', false);
    await page.goto(`/app/papers/${PAPER.deed}`);

    await page.getByRole('button', { name: 'Actions for Sale deed 4412 of 1998' }).click();
    await page.getByRole('menuitem', { name: 'Rename or move to another shelf' }).click();
    await page.getByLabel('What it is called').fill('Sale deed 4412 of 1998 (renamed)');
    await page.getByRole('button', { name: 'Save' }).click();

    await expect(page.locator('.toast.bad')).toBeVisible({ timeout: 4_000 });
  });

  test('a write refused while the reads are fine leaves every read on screen', async ({ page, world }) => {
    world.set('updatePaper', World.gqlError('the paper store refused the write'));
    await page.goto(`/app/papers/${PAPER.deed}`);

    await page.getByRole('button', { name: 'Actions for Sale deed 4412 of 1998' }).click();
    await page.getByRole('menuitem', { name: 'Rename or move to another shelf' }).click();
    await page.getByLabel('What it is called').fill('Something else');
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.locator('.toast.bad')).toBeVisible();

    // A refused write must not be reported as a failed screen. The paper, its
    // registration facts and the rail are all still there. (The one `.blank`
    // on this screen is the scan panel: every seeded fileRef is a readable
    // name rather than a storage uuid, so the reader honestly says the file is
    // filed under an old reference — Reader.tsx:490.)
    await expect(failure(page)).toHaveCount(0);
    await expect(page.getByText('Markapur SRO').first()).toBeVisible();
    await expect(page.getByRole('navigation').first()).toBeVisible();
  });
});

// ═══════════════════════════════════════════════════════════════════════
// A server that answers, but with something the screen cannot draw
// ═══════════════════════════════════════════════════════════════════════

test.describe('When the answer is the wrong shape', () => {
  test('a null where the schema promises an object is a failure, not an empty screen', async ({ page, world }) => {
    // `VaultView` is non-null in the schema, so this is the shape only a
    // broken deploy produces. The screen must not read it as "you have filed
    // nothing", which to an owner is the same picture as "your papers are gone".
    world.set('vault', null);
    await page.goto('/app/papers');

    await expect(failure(page)).toContainText('Your papers did not load');
    await expect(emptyState(page)).toHaveCount(0);
  });

  test('a null portfolio is a failure, not an account with nothing in it', async ({ page, world }) => {
    world.set('portfolio', null);
    await page.goto('/app');

    await expect(failure(page)).toContainText('Your dashboard did not load');
    await expect(page.getByText('Nothing in your portfolio yet')).toHaveCount(0);
  });

  test.describe('when a screen dies mid-render', () => {
    // A render that throws is logged by the boundary itself
    // (ErrorBoundary.tsx:54-59) and by React. Provoking one is the point.
    test.use({ allowConsole: true });

    test('a screen that dies mid-draw keeps the rail and offers a way back', async ({ page, world }) => {
      // The vault maps `data.shelves` straight into the wall (Vault.tsx:512).
      // A field the server sends as null rather than a list is not something a
      // screen can defend against one property at a time — this is what the
      // per-route ErrorBoundary in routes.tsx:150-158 exists for.
      const vault = world.seedOf('vault');
      world.set('vault', { ...vault, shelves: null });
      await page.goto('/app/papers');

      const boundary = page.getByRole('alert')
        .filter({ hasText: 'stopped before it finished drawing' });
      await expect(boundary).toContainText('This screen stopped before it finished drawing',
        { timeout: 20_000 });
      await expect(boundary).toContainText('this is a fault in the page, not in your records');
      // The machine's own words, small and grey, for whoever is being asked
      // what it says.
      await expect(boundary).toContainText(/shelves|null|not a function|undefined/i);
      await expect(boundary.getByRole('button', { name: 'Reload' })).toBeVisible();
      await expect(boundary.getByRole('button', { name: 'Go to your dashboard' })).toBeVisible();

      // The whole point of a per-route boundary: the failure is contained to
      // the one screen that could not draw, and the app is still an app.
      await expect(page.getByRole('navigation').first()).toBeVisible();
      await expect(page.getByRole('link', { name: 'Properties' })).toBeVisible();
    });

    test('the way back out of a dead screen actually goes somewhere', async ({ page, world }) => {
      const vault = world.seedOf('vault');
      world.set('vault', { ...vault, shelves: null });
      await page.goto('/app/papers');
      await expect(page.getByRole('button', { name: 'Go to your dashboard' }))
        .toBeVisible({ timeout: 20_000 });

      await page.getByRole('button', { name: 'Go to your dashboard' }).click();

      await expect(page).toHaveURL(/\/app$/);
      await expect(page.getByText('Shankar Reddy').first()).toBeVisible();
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════
// The village index, which is not GraphQL and fails its own way
// ═══════════════════════════════════════════════════════════════════════

test.describe('The maps screen, whose index is not a query', () => {
  test('a village index still being read does not say there are no village maps', async ({ page, world }) => {
    // VillageMaps.tsx:568 gates the whole screen on an index read that goes to
    // /api/gateway/pattadar/village-maps, not through GraphQL — so `never()`
    // here is a `world.route` that does not answer.
    world.route(/\/api\/gateway\/pattadar\/village-maps/, () => ({ delayMs: 600_000, json: [] }));
    await page.goto('/app/villages');

    await expect(grey(page).first()).toBeVisible();
    await expect(page.getByText('No village maps yet')).toHaveCount(0);
    await expect(page.getByText('Village maps could not be loaded')).toHaveCount(0);
    await expect(emptyState(page)).toHaveCount(0);
  });

  // ── defect ───────────────────────────────────────────────────────────
  // apps/web/src/w360/pages/VillageMaps.tsx:568 draws `<Loading h="70vh" />`
  // with no `what`, so the entire Maps screen is a 70vh grey slab captioned
  // "Loading…". The noun is right there in the heading this screen already
  // has; the owner is owed "Loading your village maps…", the way the vault,
  // the dashboard, a boundary and a job all name theirs.
  test.fail('the maps screen says what it is waiting for while it waits', async ({ page, world }) => {
    world.route(/\/api\/gateway\/pattadar\/village-maps/, () => ({ delayMs: 600_000, json: [] }));
    await page.goto('/app/villages');

    await expect(waiting(page).filter({ hasText: 'Loading your village maps' }))
      .toBeVisible({ timeout: 3_000 });
  });
});

// ═══════════════════════════════════════════════════════════════════════
// One answer, however many screens ask for it
// ═══════════════════════════════════════════════════════════════════════

test.describe('Two screens asking for the same thing', () => {
  test('the rail and the dashboard ask for the portfolio once between them', async ({ page, world }) => {
    // Shell.tsx:63 and Dashboard.tsx:179 both call `usePortfolio`. One key,
    // one round trip — a shell that paid for its own copy would double the
    // cost of every authenticated route in the app.
    await page.goto('/app');
    await expect(page.getByText('Shankar Reddy').first()).toBeVisible();

    expect(world.calls('portfolio')).toHaveLength(1);
  });

  test('the rail badge and the waiting-on-you list are one read, not two', async ({ page, world }) => {
    // Shell.tsx:64 asks `useOrders()` for its badge on every route; Assigned
    // (Orders.tsx:367) asks the identical key for the list itself.
    await page.goto('/app');
    await expect(page.getByRole('link', { name: /Waiting on you/ })).toBeVisible();
    const afterDashboard = world.calls('orders').length;

    await page.getByRole('link', { name: /Waiting on you/ }).click();
    await expect(page.getByRole('heading', { name: 'Waiting on you' })).toBeVisible();

    // staleTime is 30s (main.tsx:42), so the list is drawn from the answer the
    // badge already has.
    expect(world.calls('orders').length).toBe(afterDashboard);
  });

  test('the 360 header and the order flow on it ask for the record once', async ({ page, world }) => {
    // Record.tsx:58 owns the record for the whole 360, and the flow hanging off
    // it takes that same record out of the route context rather than asking for
    // it again by id (OrderService.tsx:292, `useRecordCtx()`). It could not do
    // otherwise now: the land is a path segment, so this screen cannot mount
    // without one. One key, one round trip — and the id it is asked for is this
    // record's, not the one the old ?record= query string used to carry.
    await page.goto(`/app/records/${ID.parcel}/order`);
    await expect(page.getByRole('heading', { level: 2, name: 'What do you want done on this land?' }))
      .toBeVisible({ timeout: 20_000 });

    expect(world.calls('record')).toHaveLength(1);
    expect(world.lastVars('record')).toMatchObject({ id: ID.parcel });
  });

  test('an order flow on a record that would not load says so once, and does not ask for an order anyway', async ({ page, world }) => {
    world.set('record', World.gqlError('the record store is not answering'));
    await page.goto(`/app/records/${ID.parcel}/order`);

    // The frame owns the read and the flow is its Outlet (Record.tsx:66-75), so
    // the failure is said once, by the frame, and the four steps never mount.
    // A flow that drew its first question over a record it could not name would
    // be asking which service to run on nothing.
    await expect(failure(page)).toHaveCount(1);
    await expect(failure(page)).toContainText('This record did not load');
    await expect(page.getByRole('heading', { name: 'What do you want done on this land?' })).toHaveCount(0);
  });
});
