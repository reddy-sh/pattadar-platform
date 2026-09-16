/**
 * What others sent you, and what they receive.
 *
 * Three screens, two of them behind no account at all:
 *
 *   /app/shared        W09 — the kits other people have shared WITH this
 *                      account. Read-only by construction: `web360.py` exposes
 *                      `sharedKits` and `sharedKit` as reads and has no kit
 *                      mutation whatever, so every control on this screen is
 *                      either a link somewhere real or a sentence saying why
 *                      there is no control. This file asserts that second half
 *                      as hard as the first — a redesign that quietly puts
 *                      "Make an offer" back is a regression, not a feature.
 *
 *   /share/:token      the door a buyer, a bank or a surveyor is given. No
 *   /work/:token       session, no portfolio, no GraphQL: one `fetch` at
 *                      `/api/gateway/capabilities/<scope>/<token>` and the
 *                      files that capability names. Everything under this
 *                      heading runs `test.use({ signedIn: false })`, because
 *                      "does this work without an account" is the whole point
 *                      of the door and a seeded session would hide a leak.
 *
 * What a reader of this file must know:
 *
 *  · KITS ARE BUILT HERE, NOT TAKEN FROM THE SEED. `fixtures/seed.ts` spells
 *    the live kits' `state` as `'open'`; the column's default in
 *    web360.py:233 is `'live'` and Shared.tsx:50 reads `state !== 'live'` as
 *    expired — so the seeded inbox would render every kit as lapsed. That is a
 *    fixture detail, not a product fault, and fixtures are not this file's to
 *    edit, so `kit()` below builds a whole kit with every field `KIT` (api.ts
 *    :384) selects and each test overrides the one thing it is about.
 *
 *  · THE RECIPIENT DOOR IS NOT SEEDED EITHER. The seal answers
 *    `/api/gateway/capabilities` with `{capabilities: [], features: {}}` —
 *    right for the flag check the shell makes, and nothing like the view this
 *    screen reads. Every test here routes its own door with `world.route`, and
 *    answers it the way `services/gateway/app/routes_capabilities.py` does,
 *    down to the `Content-Disposition: attachment` the file route sets.
 *
 *  · FIVE test.fail()s, each run with the marker off first to be sure it fails
 *    on the sentence it is about and not on a locator:
 *      Shared.tsx:119  a kit's dates are printed raw where every other screen
 *                      in W360 runs them through `ddmmyyyy` (ui.tsx:128) —
 *                      Vault.tsx:77 writes the same sentence, "expired
 *                      01/07/2026", about the same kind of date
 *      Shared.tsx:119  a sender who left no note leaves a dangling em dash on
 *                      the rail row: "expired 2026-07-01 — "
 *      Shared.tsx:265  the same dangling separator one card over: a paper the
 *                      reader had nothing to say about draws "Title deeds ·"
 *      Shared.tsx:310  "four" is spelled out and no other count is, so the
 *                      same sentence reads two different ways on two kits
 *      Shared.tsx:253  an item whose verdict is not one of the three the
 *                      client knows is drawn with the CONFIRMED tick — the
 *                      one default a "what nobody has confirmed" screen must
 *                      never fall back to
 *    And one @phone failure, Shared.tsx:87: the rail's width is set inline, so
 *    the `max-width: 900px` rule that drops it (w360.css:847) cannot win and
 *    the main column is squeezed to ~100px on a phone instead of stacking.
 *
 *  · THE ONE BRANCH THAT NEEDS THE CLOCK. `kits.isRefetchError`
 *    (Shared.tsx:155, "The list could not refresh") needs the list to hold
 *    data and then fail a REFETCH. staleTime is 30s (main.tsx:43) and nothing
 *    on this screen invalidates the kits query, so the road there is to push
 *    the page's own clock past the staleness window and hand the window back
 *    its focus — the last test in "when the reads fail" does exactly that with
 *    `page.clock`, and it is the only test in the file that touches time. If
 *    it ever turns flaky, suspect the clock before the screen.
 *
 *  · Anything that provokes a non-2xx answer is in a describe that opts into
 *    `allowConsole`: Chrome logs "Failed to load resource" for every refused
 *    fetch, and a refused fetch is the point of those tests. A GraphQL refusal
 *    is a 200 and logs nothing, so the two tests in that describe that use one
 *    assert `consoleErrors` empty themselves rather than sheltering under the
 *    exemption their neighbours need.
 *
 *  · THE `Download` LINK IS ASSERTED BY ITS HREF AND NEVER CLICKED. It is a
 *    plain `<a download>` at RecipientAccess.tsx:108, so the browser fetches
 *    it in the browser process and `page.route` — the seal — does not see it:
 *    a click sends a real request to the dev server on :5173 and out to the
 *    founder's gateway. Verified, once, and not again. What the file is named
 *    on the way down is the gateway's Content-Disposition
 *    (routes_capabilities.py:77) and belongs to the integration suite. Every
 *    download asserted here is a `blob:` one the page itself makes, which
 *    never touches the network.
 */
import { test, expect, World, BLANK_JPEG } from '../fixtures/harness';
import type { Page } from '../fixtures/harness';
import { KIT, PAPER } from '../fixtures/ids';

// ── the inbox ──────────────────────────────────────────────────────────

const SHARED = '/app/shared';

/** Every field `KIT` (api.ts:384) selects. A partial object reaches the screen
 *  as `undefined` and draws as the word "undefined", so start from here. */
function kit(over: Record<string, unknown> = {}) {
  return {
    id: KIT.wholeRecord,
    title: 'Sy 96/3, Samalkot',
    headline: 'Gopal Reddy is selling 4 acres 2 guntas of wet land at Samalkot',
    kind: 'parcel',
    purpose: 'Sale',
    listLine: '5 papers · boundary · 18 photos',
    senderName: 'Gopal Reddy',
    senderInitials: 'GR',
    senderNote: 'Have a look before Sunday.',
    sharedAt: '2026-09-08',
    terms: 'View only · no download',
    openedCount: 2,
    daysLeft: 18,
    expiredOn: '',
    askedPrice: 9_200_000,
    photoCount: 18,
    featureCount: 14,
    state: 'live',
    items: [
      { id: PAPER.deed, title: 'Sale deed 2214 of 2016', shelf: 'Title deeds', note: '14 pages', verdict: 'ok' },
      { id: PAPER.ec, title: 'Encumbrance certificate', shelf: 'Searches', note: 'stops 3 years short', verdict: 'warn' },
      { id: PAPER.map, title: 'FMB sketch', shelf: 'Map sheets', note: 'no date or location stamp', verdict: 'missing' },
    ],
    checks: [
      { id: 'w-chk-ec', title: 'Fresh EC', note: 'From the SRO, thirty years', price: 1_200 },
      { id: 'w-chk-survey', title: 'Corner survey', note: 'A licensed surveyor walks it', price: 6_500 },
    ],
    checksTotal: 7_700,
    ...over,
  };
}

/** One lapsed kit, the shape `state='expired'` actually arrives in. */
function lapsed(over: Record<string, unknown> = {}) {
  return kit({
    id: KIT.expired,
    title: 'Sy 88, Konakalamitla',
    headline: 'Chenna Reddy shared 1 acre 8 guntas at Konakalamitla',
    listLine: '2 papers',
    senderName: 'Chenna Reddy',
    senderInitials: 'CR',
    senderNote: 'Ask again after the harvest.',
    sharedAt: '2026-06-01',
    daysLeft: 0,
    expiredOn: '2026-07-01',
    state: 'expired',
    askedPrice: 0,
    items: [],
    checks: [],
    checksTotal: 0,
    ...over,
  });
}

/** Put these kits in the inbox, and let `sharedKit` resolve out of the same
 *  list — the server reads both out of one table, so a test that seeds them
 *  apart can assert a screen that could never exist. */
function inbox(world: World, kits: Array<Record<string, unknown>>): void {
  world.set('sharedKits', kits);
  world.set('sharedKit', (vars) => kits.find((k) => k.id === String(vars.id ?? '')) ?? null);
}

/** A row in the left rail. Its accessible name is the title, the list line and
 *  the shared/expired line run together, so a fragment of the title is enough. */
const railRow = (page: Page, title: string | RegExp) =>
  page.getByRole('button', { name: title });

test.describe('W09 · the kits other people sent me', () => {
  test('the shared inbox lists every kit somebody sent me, with who sent it, what is in it and how long it has left', async ({ page, world }) => {
    inbox(world, [kit(), lapsed()]);
    await page.goto(SHARED);

    // The rail says what the section is before a single kit is opened.
    const rail = page.locator('aside[aria-label="Shared with me"]');
    await expect(rail.getByRole('heading', { name: 'Shared with me' })).toBeVisible();
    await expect(rail.getByText('Kept out of your portfolio. Nothing here counts toward your acres.')).toBeVisible();

    const live = railRow(page, /Sy 96\/3/);
    await expect(live).toBeVisible();
    await expect(live).toContainText('5 papers · boundary · 18 photos');
    await expect(live).toContainText('shared 2026-09-08 · 18 days left');

    await expect(railRow(page, /Sy 88/)).toContainText('expired 2026-07-01 — Ask again after the harvest.');
  });

  test('a kit with no date on it falls back to whatever the sender wrote', async ({ page, world }) => {
    // `sharedAt` is a TEXT column with a '' default (web360.py:225), so the
    // rail has to have something to say when the row carries no date.
    inbox(world, [kit({ sharedAt: '', senderNote: 'From the agent in Samalkot' })]);
    await page.goto(SHARED);

    await expect(railRow(page, /Sy 96\/3/)).toContainText('From the agent in Samalkot');
    await expect(railRow(page, /Sy 96\/3/)).not.toContainText('days left');
  });

  test('a kit shared at a particular minute is still listed by the day it was shared', async ({ page, world }) => {
    // `shared_at` is free TEXT (web360.py:225) and nothing in the product
    // writes it, so a row can arrive carrying the clock as well as the day.
    // Shared.tsx:121 takes the first word for exactly this reason; a rail of
    // "shared 2026-09-08 11:42:00 · 18 days left" is unreadable at 14rem.
    inbox(world, [kit({ sharedAt: '2026-09-08 11:42:00' })]);
    await page.goto(SHARED);

    await expect(railRow(page, /Sy 96\/3/)).toContainText('shared 2026-09-08 · 18 days left');
    await expect(railRow(page, /Sy 96\/3/)).not.toContainText('11:42');
  });

  test('the kit that is still live is the one already open when I arrive', async ({ page, world }) => {
    // Lapsed FIRST in the list: the open kit is chosen by its state, not by
    // where the server happened to sort it.
    inbox(world, [lapsed(), kit()]);
    await page.goto(SHARED);

    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Sy 96/3, Samalkot');
    expect(world.lastVars('sharedKit')).toMatchObject({ id: KIT.wholeRecord });
  });

  test('when every kit has lapsed the first one still opens, rather than an empty middle', async ({ page, world }) => {
    inbox(world, [lapsed(), lapsed({ id: 'w-kit-older', title: 'Sy 12, Peddapuram' })]);
    await page.goto(SHARED);

    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Sy 88, Konakalamitla');
    // Anchored: the eyebrow reads "Share expired", the paragraph below it
    // reads "This share expired on …", and a bare substring matches both.
    await expect(page.getByText(/^Share expired/)).toBeVisible();
  });

  test('picking another kit in the rail opens it, and asks the server for that one', async ({ page, world }) => {
    inbox(world, [kit(), lapsed()]);
    await page.goto(SHARED);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Sy 96/3, Samalkot');

    await railRow(page, /Sy 88/).click();

    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Sy 88, Konakalamitla');
    await expect.poll(() => world.lastVars('sharedKit').id).toBe(KIT.expired);
  });

  test('the rail marks which kit I am reading, so two kits from one sender are not the same row twice', async ({ page, world }) => {
    inbox(world, [kit(), lapsed()]);
    await page.goto(SHARED);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Sy 96/3, Samalkot');

    // Every row carries the same 2px left border and only the open one is
    // given a colour (Shared.tsx:107). Transparent-or-not is the one reading
    // of "which of these is on" that does not depend on the scheme in force.
    const clear = 'rgba(0, 0, 0, 0)';
    await expect(railRow(page, /Sy 96\/3/)).not.toHaveCSS('border-left-color', clear);
    await expect(railRow(page, /Sy 88/)).toHaveCSS('border-left-color', clear);

    await railRow(page, /Sy 88/).click();

    await expect(railRow(page, /Sy 88/)).not.toHaveCSS('border-left-color', clear);
    await expect(railRow(page, /Sy 96\/3/)).toHaveCSS('border-left-color', clear);
  });

  test('the rail says what opening a kit costs me before I open one', async ({ page, world }) => {
    inbox(world, [kit()]);
    await page.goto(SHARED);

    // The whole bargain of this screen, under the list rather than buried in
    // the kit: it is counted, and nothing goes back the other way.
    await expect(page.locator('aside[aria-label="Shared with me"]')
      .getByText('A kit is read-only and belongs to whoever sent it. Opening it may be counted;'))
      .toBeVisible();
  });

  test('a kit says on its face that it is read-only and not one of my records', async ({ page, world }) => {
    inbox(world, [kit()]);
    await page.goto(SHARED);

    await expect(page.getByText('Shared for sale')).toBeVisible();
    await expect(page.getByText('Read-only · not your record')).toBeVisible();
    await expect(page.getByText('Gopal Reddy is selling 4 acres 2 guntas of wet land at Samalkot')).toBeVisible();
    await expect(page.getByText('A kit asks nothing of you. Leave it alone and it lapses on its own.')).toBeVisible();
  });

  test('a kit sends the sender no reply, no note, no order and no offer — and says so instead of drawing buttons that would', async ({ page, world }) => {
    inbox(world, [kit()]);
    await page.goto(SHARED);

    // The four controls Shared.tsx removed. Each had no onClick and nothing on
    // the server that could have been wired to it; each is now a sentence.
    for (const dead of [/Message/i, /Make an offer/i, /Not interested/i, /Ask for more time/i, /Check it independently/i]) {
      await expect(page.getByRole('button', { name: dead })).toHaveCount(0);
    }
    await expect(page.getByText('A kit carries no reply channel. To reach Gopal Reddy or ask for longer,')).toBeVisible();
    await expect(page.getByText('An offer is made between you and the seller. Pattadar does not carry one,')).toBeVisible();
  });

  test('a kit carries no map, no gallery, no features and no notebook, and says so once rather than in four empty tabs', async ({ page, world }) => {
    inbox(world, [kit()]);
    await page.goto(SHARED);

    await expect(page.getByText('there is no interactive map, photo gallery, feature list or')).toBeVisible();
    // The badges that used to promise eighteen photos and fourteen features.
    for (const tab of ['My private notes', 'Photos', 'Features', 'Map']) {
      await expect(page.getByRole('tab', { name: tab })).toHaveCount(0);
    }
    // A Leaflet map has no role and no accessible name — the container class
    // and the canvas it draws into are the only things in the DOM that say one
    // was mounted, and a kit carries nothing to mount one on.
    await expect(page.locator('.w360 canvas, .w360 .leaflet-container')).toHaveCount(0);
  });

  test('who sent the kit, when, on what terms and how long it has left is one line at the top', async ({ page, world }) => {
    inbox(world, [kit()]);
    await page.goto(SHARED);

    await expect(page.getByText('Sent by Gopal Reddy')).toBeVisible();
    await expect(page.getByText('Have a look before Sunday.')).toBeVisible();
    await expect(page.getByText('2026-09-08 · View only · no download · 18 days left')).toBeVisible();
  });

  test('a kit that has run out stops counting down days it does not have', async ({ page, world }) => {
    inbox(world, [lapsed()]);
    await page.goto(SHARED);

    // Shared.tsx:202 drops a zero rather than printing "0 days left" beside a
    // share that has already gone — the one number on this line that would be
    // read as "hurry" is the one that must not be printed at zero.
    await expect(page.getByText('2026-06-01 · View only · no download')).toBeVisible();
    await expect(page.getByText('0 days left')).toHaveCount(0);
  });

  test('a kit whose sender has no name loses the sender card rather than reading "Sent by"', async ({ page, world }) => {
    inbox(world, [kit({ senderName: '', senderInitials: '', senderNote: '' })]);
    await page.goto(SHARED);

    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Sy 96/3, Samalkot');
    await expect(page.getByText(/^Sent by/)).toHaveCount(0);
    await expect(page.getByText('A kit carries no reply channel')).toHaveCount(0);
    // And the sentence that names the sender degrades rather than saying
    // "does not send offers or notes to ." (Shared.tsx:395).
    await expect(page.getByText('this screen does not send offers or notes to the sender.')).toBeVisible();
  });

  test('the kit opens on what the seller gave me, each paper on its shelf with what is wrong with it', async ({ page, world }) => {
    inbox(world, [kit()]);
    await page.goto(SHARED);

    const gave = page.locator('section.card', { has: page.getByRole('heading', { name: 'What they gave you' }) });
    await expect(gave.getByText('watermarked · no download')).toBeVisible();
    await expect(gave.getByText('Sale deed 2214 of 2016')).toBeVisible();
    await expect(gave.getByText('Title deeds · 14 pages')).toBeVisible();
    await expect(gave.getByText('Searches · stops 3 years short')).toBeVisible();
    await expect(gave.getByText('Map sheets · no date or location stamp')).toBeVisible();
    await expect(gave.getByText('Read by AI, filed on the same eight shelves as your own vault')).toBeVisible();
  });

  test('a paper that falls short is toned as a warning and one that is missing as a loss, not as a tick', async ({ page, world }) => {
    inbox(world, [kit()]);
    await page.goto(SHARED);

    // The verdict is an unlabelled MUI glyph and a tone class — there is no
    // text and no aria on it, so the class is the only thing that tells the
    // three apart. Nothing better exists to reach for.
    const rows = page.locator('section.card', { has: page.getByRole('heading', { name: 'What they gave you' }) }).locator('.rows > div');
    await expect(rows).toHaveCount(3);
    await expect(rows.nth(0).locator('span.up')).toHaveCount(1);
    await expect(rows.nth(1).locator('span.accent')).toHaveCount(2);   // the tone on the note, and on the glyph
    await expect(rows.nth(2).locator('span.down')).toHaveCount(2);
  });

  // ── DEFECT ────────────────────────────────────────────────────────────
  // Shared.tsx:253 — `VERDICT[it.verdict] ?? VERDICT.ok`. `shared_kit_items
  // .verdict` is free TEXT with no constraint (web360.py:243) and the resolver
  // passes whatever is stored straight through (web360.py:3735), so a verdict
  // the client has never heard of draws the GREEN TICK. On the one screen in
  // the product whose subject is what nobody has confirmed, the unknown case
  // must fall back to the cautious tone, never to "confirmed". The owner is
  // owed `?? VERDICT.warn` — a buyer reading a tick against a paper the server
  // flagged is the whole failure this screen exists to prevent.
  test.fail('a verdict the app has never heard of is not drawn as confirmed', async ({ page, world }) => {
    inbox(world, [kit({
      items: [{ id: PAPER.deed, title: 'Sale deed 2214 of 2016', shelf: 'Title deeds', note: 'the seller could not produce the original', verdict: 'unverified' }],
    })]);
    await page.goto(SHARED);

    // The row has to be on screen before the tone on it can be counted —
    // `toHaveCount(0)` is satisfied by a screen that has not drawn yet.
    await expect(page.getByText('the seller could not produce the original')).toBeVisible();
    const row = page.locator('section.card', { has: page.getByRole('heading', { name: 'What they gave you' }) }).locator('.rows > div').first();
    await expect(row.locator('span.up')).toHaveCount(0);
  });

  // ── DEFECT ────────────────────────────────────────────────────────────
  // Shared.tsx:265 — `{it.shelf} · <span>{it.note}</span>`, with the separator
  // printed whether or not anything follows it. `shared_kit_items.note` is
  // TEXT DEFAULT '' (web360.py:245) and the resolver passes '' straight
  // through (web360.py:3734), so a paper the reader had nothing to say about
  // draws "Title deeds ·" — a bullet hanging off the end of the shelf name, on
  // the row of the one paper with nothing wrong with it. It is the same
  // mistake as the em dash in the rail, one card over. The owner is owed the
  // separator only when there is something on the other side of it.
  test.fail('a paper nobody had anything to say about is filed under its shelf and nothing else', async ({ page, world }) => {
    inbox(world, [kit({
      items: [{ id: PAPER.deed, title: 'Sale deed 2214 of 2016', shelf: 'Title deeds', note: '', verdict: 'ok' }],
    })]);
    await page.goto(SHARED);

    await expect(page.getByText('Sale deed 2214 of 2016')).toBeVisible();
    // The shelf line of the only row. There is no role on it — it is a span
    // inside a div, and the card's other notes sit outside `.rows`.
    const shelfLine = page.locator('section.card', { has: page.getByRole('heading', { name: 'What they gave you' }) })
      .locator('.rows > div span.note');
    await expect(shelfLine).toHaveText('Title deeds');
  });

  test('a seller who attached no papers at all is called out, not dressed as an empty shelf', async ({ page, world }) => {
    inbox(world, [kit({ items: [], listLine: 'no papers' })]);
    await page.goto(SHARED);

    await expect(page.getByText('The seller sent no papers')).toBeVisible();
    await expect(page.getByText('This kit is a listing, not a file — nothing in it has a document behind it.')).toBeVisible();
    // The sentence about AI filing onto eight shelves is about a filing that
    // did not happen, so it is not printed over nothing.
    await expect(page.getByText('Read by AI, filed on the same eight shelves')).toHaveCount(0);
    // And "If you buy it" stops promising that 0 papers move into the vault.
    await expect(page.getByText('Nothing is attached to this kit to move into your vault')).toBeVisible();
  });

  test('what nobody has confirmed is priced line by line, with the total on the button', async ({ page, world }) => {
    inbox(world, [kit()]);
    await page.goto(SHARED);

    const checks = page.locator('section.card', { has: page.getByRole('heading', { name: 'What nobody has confirmed' }) });
    await expect(checks.getByText('These are the 2 things a buyer regrets not checking.')).toBeVisible();
    await expect(checks.getByText('Fresh EC')).toBeVisible();
    await expect(checks.getByText('From the SRO, thirty years')).toBeVisible();
    await expect(checks.getByText('₹1,200')).toBeVisible();
    await expect(checks.getByText('Corner survey')).toBeVisible();
    await expect(checks.getByText('₹6,500')).toBeVisible();
    await expect(checks.getByRole('button')).toContainText('₹7,700');
  });

  test('ordering the checks is not open from here, and the screen says why rather than swallowing the click', async ({ page, world }) => {
    inbox(world, [kit()]);
    await page.goto(SHARED);

    const order = page.getByRole('button', { name: /^Order all/ });
    await expect(order).toBeDisabled();
    await expect(page.getByText('Not open yet: a check is ordered against a property that is already')).toBeVisible();
    await expect(page.getByText('When it opens: ordered in your name. The seller is not told.')).toBeVisible();

    // Nothing was sent. `orderService` takes record ids and refuses anything
    // that is not one of your own records, and a kit is never one.
    await order.click({ force: true });
    expect(world.calls('orderService')).toHaveLength(0);
  });

  test('the way to order a check that IS open leads to my own land', async ({ page, world }) => {
    inbox(world, [kit()]);
    await page.goto(SHARED);

    await expect(page.getByText('Checks you can order today are the ones on your own land')).toBeVisible();
    const own = page.getByRole('link', { name: 'Order a check on your own land' });
    await expect(own).toHaveAttribute('href', '/app/order');

    // And followed, it arrives on the screen that asks WHICH land — the kit
    // being somebody else's is the whole reason the button above is dead, so
    // the way out has to end on a record of this account's own. Ordering is
    // composed against a record id (OrderLand.tsx), and there is no road from
    // here to one except by choosing it.
    await own.click();
    await expect(page).toHaveURL(/\/app\/order$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Which land is this for?' }))
      .toBeVisible({ timeout: 20_000 });
  });

  test('a kit with one thing to check asks in the singular', async ({ page, world }) => {
    inbox(world, [kit({
      checks: [{ id: 'w-chk-ec', title: 'Fresh EC', note: 'From the SRO, thirty years', price: 1_200 }],
      checksTotal: 1_200,
    })]);
    await page.goto(SHARED);

    await expect(page.getByText('This is the one thing a buyer regrets not checking.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Order it · ₹1,200' })).toBeVisible();
  });

  test('a kit nobody priced any checks on says so, instead of offering to order nothing', async ({ page, world }) => {
    inbox(world, [kit({ checks: [], checksTotal: 0 })]);
    await page.goto(SHARED);

    await expect(page.getByText('Nobody has listed anything to check on this kit yet, so nothing in it')).toBeVisible();
    await expect(page.getByRole('button', { name: /^Order all/ })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /^Order it/ })).toHaveCount(0);
    await expect(page.getByText('These are the 0 things')).toHaveCount(0);
  });

  // ── DEFECT ────────────────────────────────────────────────────────────
  // Shared.tsx:310 and :343 — `kit.checks.length === 4 ? 'four' : num(n)`.
  // Four is the count the demo kit happened to carry, and it is the only count
  // in the product spelled as a word: one kit reads "These are the four things"
  // over "Order all four", the next reads "These are the 2 things" over "Order
  // all 2". `shared_kit_checks` has no fixed size (web360.py:250), so this is a
  // demo artefact sitting in product copy. The owner is owed ONE form at every
  // count — which is why this test compares the two renderings to each other
  // rather than demanding a spelling: it goes green whichever way it is fixed,
  // and stays red only while the two disagree.
  test.fail('a kit with four things to check reads the same way as a kit with two', async ({ page, world }) => {
    const check = (n: number) => ({ id: `w-chk-${n}`, title: `Check ${n}`, note: 'A licensed surveyor walks it', price: 1_000 });
    /** Is the count in this sentence a spelled word, or a numeral? */
    const form = (s: string) => (/\b(one|two|three|four|five|six)\b/i.test(s) ? 'a spelled word' : 'a numeral');

    const read = async (n: number) => {
      inbox(world, [kit({ checks: [1, 2, 3, 4].slice(0, n).map(check), checksTotal: n * 1_000 })]);
      await page.goto(SHARED);
      const order = page.getByRole('button', { name: /^Order all/ });
      await expect(order).toBeVisible();
      return {
        lede: (await page.getByText(/a buyer regrets not checking/).innerText()),
        // Only the half in front of the price: "Order all 4", "Order all four".
        button: (await order.innerText()).split('·')[0],
      };
    };

    const four = await read(4);
    const two = await read(2);

    expect(form(four.lede), `"${four.lede}" against "${two.lede}"`).toBe(form(two.lede));
    expect(form(four.button), `"${four.button}" against "${two.button}"`).toBe(form(two.button));
  });

  test('what happens if I buy it is said in the papers it actually carries', async ({ page, world }) => {
    inbox(world, [kit()]);
    await page.goto(SHARED);

    await expect(page.getByText('Its 3 papers move into your vault as the record’s starting history')).toBeVisible();
  });

  test('a kit carrying one paper says that one paper moves, not "1 papers move"', async ({ page, world }) => {
    inbox(world, [kit({
      items: [{ id: PAPER.ec, title: 'Encumbrance certificate', shelf: 'Searches', note: '6 pages', verdict: 'ok' }],
    })]);
    await page.goto(SHARED);

    await expect(page.getByText('Its 1 paper moves into your vault')).toBeVisible();
  });

  test('the asked price is printed beside the stamp-duty calculator, because the calculator opens blank', async ({ page, world }) => {
    inbox(world, [kit()]);
    await page.goto(SHARED);

    const calc = page.getByRole('link', { name: 'Work out stamp duty' });
    await expect(calc).toHaveAttribute('href', '/legacy/tools?tab=stamp-duty');
    await expect(calc).toHaveAttribute('target', '_blank');
    await expect(calc).toHaveAttribute('rel', /noopener/);
    await expect(page.getByText('The calculator opens blank. This kit is asked at ₹92,00,000.')).toBeVisible();
  });

  test('a kit with no asked price on it does not print one', async ({ page, world }) => {
    inbox(world, [kit({ askedPrice: 0 })]);
    await page.goto(SHARED);

    await expect(page.getByRole('link', { name: 'Work out stamp duty' })).toBeVisible();
    await expect(page.getByText('This kit is asked at')).toHaveCount(0);
    await expect(page.getByText('₹0')).toHaveCount(0);
  });

  // ── the kit that has lapsed ──────────────────────────────────────────

  test('an expired kit says it expired, and stops talking about buying it', async ({ page, world }) => {
    inbox(world, [lapsed()]);
    await page.goto(SHARED);

    await expect(page.getByText(/^Share expired/)).toBeVisible();
    await expect(page.getByText('This share expired on 2026-07-01. Its contents')).toBeVisible();
    await expect(page.getByText('ask the sender to share it again before relying on them.')).toBeVisible();
    // "If you buy it" is gone: there is nothing to buy through a dead share.
    await expect(page.getByRole('heading', { name: 'If you buy it' })).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Work out stamp duty' })).toHaveCount(0);
  });

  test('a kit that lapsed without a date on it still says it lapsed, without trailing an "on"', async ({ page, world }) => {
    // `expired_on` defaults to '' (web360.py:230) and `state` is what actually
    // decides this screen, so the two can legitimately disagree.
    inbox(world, [lapsed({ expiredOn: '' })]);
    await page.goto(SHARED);

    await expect(page.getByText(/^Share expired/)).toBeVisible();
    await expect(page.getByText('This share expired. Its contents remain read-only here; ask the sender'))
      .toBeVisible();
    await expect(page.getByText('This share expired on')).toHaveCount(0);
  });

  test('an expired kit shows nothing of its contents when the sender sent nothing', async ({ page, world }) => {
    inbox(world, [lapsed()]);
    await page.goto(SHARED);

    await expect(page.getByText('The seller sent no papers')).toBeVisible();
    await expect(page.getByText('Nobody has listed anything to check on this kit yet')).toBeVisible();
    await expect(page.getByRole('button', { name: /^Order/ })).toHaveCount(0);
  });

  test('an expired kit keeps the papers it did carry, and says they are no longer to be relied on', async ({ page, world }) => {
    // Deliberate, and worth pinning: the copy at Shared.tsx:180 promises the
    // contents "remain read-only here". A lapsed share that blanked itself
    // would leave a buyer unable to see what they had already been shown.
    inbox(world, [lapsed({
      items: [{ id: PAPER.deed, title: 'Sale deed 1180 of 2004', shelf: 'Title deeds', note: '9 pages', verdict: 'ok' }],
    })]);
    await page.goto(SHARED);

    await expect(page.getByText('Sale deed 1180 of 2004')).toBeVisible();
    await expect(page.getByText('This share expired on 2026-07-01.')).toBeVisible();
  });

  test('an expired kit is dimmed in the rail rather than removed from it', async ({ page, world }) => {
    inbox(world, [kit(), lapsed()]);
    await page.goto(SHARED);

    // 0.55, set inline at Shared.tsx:108 — the only thing that separates a
    // lapsed row from a live one besides its words.
    await expect(railRow(page, /Sy 88/)).toHaveCSS('opacity', '0.55');
    await expect(railRow(page, /Sy 96\/3/)).toHaveCSS('opacity', '1');
  });

  // ── DEFECT ────────────────────────────────────────────────────────────
  // Shared.tsx:119 — `expired ${k.expiredOn}` prints the server's date raw.
  // Every other screen in W360 runs a date through `ddmmyyyy` (ui.tsx:128)
  // before drawing it, and Vault.tsx:77 writes THIS EXACT SENTENCE about the
  // same kind of date: `expired ${ddmmyyyy(l.expiresOn)}`. So the vault says
  // "expired 01/07/2026" and the shared inbox says "expired 2026-07-01" on
  // the same afternoon. The header at Shared.tsx:180 and the sender line at
  // :202 print `expiredOn` and `sharedAt` raw for the same reason. The owner
  // is owed one date format across the product — and the fix cannot regress a
  // well-formed row, because `ddmmyyyy` hands back anything that is not ISO
  // untouched (ui.tsx:129-132), which is exactly how the vault's own
  // DD/MM/YYYY share links survive it.
  test.fail('a kit prints its dates the way the rest of the app prints dates', async ({ page, world }) => {
    inbox(world, [lapsed()]);
    await page.goto(SHARED);

    await expect(railRow(page, /Sy 88/)).toContainText('expired 01/07/2026 — Ask again after the harvest.');
  });

  // ── DEFECT ────────────────────────────────────────────────────────────
  // Shared.tsx:119 — the same template, with `senderNote` empty. The column
  // defaults to '' (web360.py:224) and most senders write nothing, so the
  // common case is a row reading "expired 2026-07-01 — " with a dangling em
  // dash and a trailing space. The owner is owed the separator only when
  // there is something on the other side of it.
  test.fail('a kit that lapsed without a note does not trail an empty dash', async ({ page, world }) => {
    inbox(world, [lapsed({ senderNote: '' })]);
    await page.goto(SHARED);

    await expect(railRow(page, /Sy 88/).getByText(/^expired /)).toHaveText(/^expired \S+$/);
  });

  // ── the states before the kit arrives ────────────────────────────────

  test('while the inbox is still coming the screen says what it is waiting for', async ({ page, world }) => {
    world.set('sharedKits', World.never());
    await page.goto(SHARED);

    await expect(page.getByText('Loading what has been shared with you…')).toBeVisible();
    // A live region with real words in it — an empty one announces nothing.
    await expect(page.locator('[role="status"][aria-busy="true"]'))
      .toContainText('Loading what has been shared with you…');
    // And it never claims the inbox is empty while it is still asking.
    await expect(page.getByText('Nothing has been shared with you')).toHaveCount(0);
  });

  test('while the opened kit is still coming the middle says so, and the rail is already usable', async ({ page, world }) => {
    world.set('sharedKits', [kit(), lapsed()]);
    world.set('sharedKit', World.never());
    await page.goto(SHARED);

    await expect(page.getByText('Loading this kit…')).toBeVisible();
    await expect(railRow(page, /Sy 88/)).toBeVisible();
    await expect(page.getByText('This kit is no longer available')).toHaveCount(0);
  });

  test('nothing shared with me is a sentence in the middle of the screen, not an empty rail', async ({ page, world }) => {
    world.set('sharedKits', []);
    await page.goto(SHARED);

    await expect(page.getByRole('heading', { name: 'Shared with me' })).toBeVisible();
    await expect(page.getByText('Nothing has been shared with you')).toBeVisible();
    await expect(page.getByText('When someone sends you a kit — the papers and the price behind a property they')).toBeVisible();
    // The 18rem column of filters over nothing is gone, and so is the kit read
    // that could never resolve because there was no id to enable it with.
    await expect(page.locator('aside[aria-label="Shared with me"]')).toHaveCount(0);
    expect(world.calls('sharedKit')).toHaveLength(0);
  });

  test('a kit the sender withdrew says so, and its row stays in the rail so I can see which one went', async ({ page, world }) => {
    const kits = [kit(), lapsed()];
    world.set('sharedKits', kits);
    world.set('sharedKit', null);
    await page.goto(SHARED);

    await expect(page.getByText('This kit is no longer available')).toBeVisible();
    await expect(page.getByText('Whoever sent it has withdrawn it. Nothing you did removed it, and')).toBeVisible();
    await expect(railRow(page, /Sy 96\/3/)).toBeVisible();
    await expect(railRow(page, /Sy 88/)).toBeVisible();
  });
});

test.describe('W09 · when the reads fail', () => {
  // Every test here answers a read with an error on purpose. A GraphQL error
  // is a 200 and logs nothing, but the transport one is a real 503 and Chrome
  // says so in the console.
  test.use({ allowConsole: true });

  test('an inbox that will not load says so, and still says what the section is', async ({ page, world }) => {
    world.set('sharedKits', World.gqlError('the share store is down'));
    await page.goto(SHARED);

    await expect(page.getByRole('heading', { name: 'Shared with me' })).toBeVisible();
    await expect(page.getByRole('alert')).toContainText('Shared with me did not load');
    await expect(page.getByRole('alert')).toContainText('Nothing has been lost');
    await expect(page.getByRole('alert')).toContainText('the share store is down');
    await expect(page.getByText('Nothing has been shared with you')).toHaveCount(0);
  });

  test('an inbox that failed once fills itself in when I ask it again', async ({ page, world, consoleErrors }) => {
    inbox(world, [kit()]);
    world.set('sharedKits', World.gqlError('the share store is down'));
    await page.goto(SHARED);
    await expect(page.getByRole('alert')).toContainText('Shared with me did not load');

    // The list's own Failed takes no onRetry, so its button invalidates the
    // whole `w360` key (ui.tsx:723) rather than one row — the reason this is
    // worth its own test is that the inbox is two queries deep and the retry
    // has to bring back both.
    world.set('sharedKits', [kit()]);
    await page.getByRole('button', { name: 'Try again' }).click();

    await expect(railRow(page, /Sy 96\/3/)).toBeVisible();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Sy 96/3, Samalkot');
    await expect(page.getByText('Shared with me did not load')).toHaveCount(0);
    // A refused GraphQL read is a 200: this test needs no part of the
    // describe's allowConsole, and says so rather than sheltering under it.
    expect(consoleErrors).toEqual([]);
  });

  test('an inbox the transport could not fetch fails the same way, not as an empty inbox', async ({ page, world }) => {
    world.set('sharedKits', World.httpError(503));
    await page.goto(SHARED);

    await expect(page.getByRole('alert')).toContainText('Shared with me did not load');
    await expect(page.getByText('Nothing has been shared with you')).toHaveCount(0);
  });

  test('a kit that will not load says so and can be asked for again, with the rail left standing', async ({ page, world }) => {
    world.set('sharedKits', [kit(), lapsed()]);
    world.set('sharedKit', World.gqlError('that kit could not be read'));
    await page.goto(SHARED);

    await expect(page.getByRole('alert')).toContainText('This kit did not load');
    await expect(page.getByRole('alert')).toContainText('that kit could not be read');
    await expect(railRow(page, /Sy 96\/3/)).toBeVisible();

    const before = world.calls('sharedKit').length;
    await page.getByRole('button', { name: 'Try again' }).click();
    await expect.poll(() => world.calls('sharedKit').length).toBeGreaterThan(before);
    // It failed again, and the screen is still here saying so.
    await expect(page.getByRole('alert')).toContainText('This kit did not load');
  });

  test('a kit that fails and then answers draws the kit, with nothing of the failure left on screen', async ({ page, world }) => {
    world.set('sharedKits', [kit()]);
    world.set('sharedKit', World.gqlError('the read timed out'));
    await page.goto(SHARED);
    await expect(page.getByRole('alert')).toContainText('This kit did not load');

    // The server comes back between the failure and the retry.
    world.set('sharedKit', kit());
    await page.getByRole('button', { name: 'Try again' }).click();

    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Sy 96/3, Samalkot');
    await expect(page.getByText('This kit did not load')).toHaveCount(0);
  });

  test('a kit I am already reading stays on screen when the list behind it stops refreshing', async ({ page, world, consoleErrors }) => {
    inbox(world, [kit(), lapsed()]);
    // The only road to Shared.tsx:155. The list is fresh for 30 seconds
    // (main.tsx:43) and nothing on this screen invalidates it, so the page's
    // own clock is moved past the staleness window and the window is handed
    // back its focus — react-query refetches a stale list on focus, and it is
    // that refetch, not the first read, that is refused here.
    await page.clock.install();
    await page.goto(SHARED);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Sy 96/3, Samalkot');

    world.set('sharedKits', World.gqlError('the share store went away'));
    await page.clock.fastForward('00:35');
    await page.clock.resume();
    await page.evaluate(() => window.dispatchEvent(new Event('visibilitychange')));

    await expect(page.getByText('The list could not refresh. The kit already on screen is still available;'))
      .toBeVisible();
    // Announced, not just printed — the user is reading the middle of the
    // screen when this appears at the top of it.
    await expect(page.locator('[role="status"]').filter({ hasText: 'The list could not refresh' }))
      .toHaveCount(1);
    // And nothing was taken away: the kit and the rail are both still here.
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Sy 96/3, Samalkot');
    await expect(railRow(page, /Sy 88/)).toBeVisible();
    // This one does not need the describe's allowConsole — a refused GraphQL
    // read is a 200 and Chrome says nothing about it. Asserted rather than
    // assumed, so the exemption above cannot quietly cover a real error here.
    expect(consoleErrors).toEqual([]);
  });
});

test.describe('W09 · on a phone', () => {
  // The width is set here as well as by the phone project, so the branch is
  // proved by whichever project actually runs on this machine.
  test.use({ viewport: { width: 390, height: 844 } });

  // ── DEFECT ────────────────────────────────────────────────────────────
  // Shared.tsx:87 — `style={{ gridTemplateColumns: '18rem minmax(0,1fr)' }}`.
  // w360.css:847 drops the rail to one column below 900px, and an inline
  // style outranks any stylesheet rule, so the phone keeps a 288px rail and
  // hands the kit itself whatever is left — about 100px, into which the
  // papers, the priced checks and the asked price are all crushed. Measured
  // at 390px with the marker off: the rail is beside the main column, not
  // above it, and runs 7,208px down the page. Every other rail screen in
  // W360 stacks here. The owner is owed the same: the width belongs in the
  // stylesheet beside the breakpoint that has to override it, not inline.
  test.fail('the shared inbox stacks on a phone instead of squeezing the kit into a strip @phone', async ({ page, world }) => {
    inbox(world, [kit(), lapsed()]);
    await page.goto(SHARED);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Sy 96/3, Samalkot');

    const rail = await page.locator('aside[aria-label="Shared with me"]').boundingBox();
    const main = await page.locator('.withrail > main').boundingBox();
    expect(rail).not.toBeNull();
    expect(main).not.toBeNull();
    expect(main!.y).toBeGreaterThanOrEqual(rail!.y + rail!.height - 1);
    expect(main!.width).toBeGreaterThan(300);
  });

  test('an empty inbox reads fine on a phone, because it has no rail to drop @phone', async ({ page, world }) => {
    world.set('sharedKits', []);
    await page.goto(SHARED);

    await expect(page.getByText('Nothing has been shared with you')).toBeVisible();
    const overflow = await page.evaluate(() =>
      document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  });
});

// ── the doors somebody else walks through ──────────────────────────────

/** 43 characters of [A-Za-z0-9_-] — the shape `_TOKEN` accepts
 *  (routes_capabilities.py:22). Anything else is a 404 at the gateway. */
const token = (name: string) => `${name}${'-0'.repeat(43)}`.slice(0, 43);

const TOKEN = {
  record: token('share-record-sy-214-2'),
  paper: token('share-paper-ec'),
  lapsed: token('share-lapsed-surveyor'),
  work: token('work-survey-north-edge'),
};

/** The smallest thing Chrome's PDF viewer will accept as a document — the same
 *  bytes fixtures/seed.ts serves for a paper preview. */
const TINY_PDF = Buffer.from(
  'JVBERi0xLjQKMSAwIG9iajw8L1R5cGUvQ2F0YWxvZy9QYWdlcyAyIDAgUj4+ZW5kb2JqCjIgMCBvYmo8PC9UeXBlL1BhZ2VzL0tpZHNbMyAwIFJdL0NvdW50IDE+PmVuZG9iagozIDAgb2JqPDwvVHlwZS9QYWdlL1BhcmVudCAyIDAgUi9NZWRpYUJveFswIDAgOTkgOTldPj5lbmRvYmoKdHJhaWxlcjw8L1Jvb3QgMSAwIFI+Pg==',
  'base64',
);

type DoorItem = { id: string; title: string; kind: string; available: boolean };

/** What `GET /api/gateway/capabilities/<scope>/<token>` answers with. Every
 *  field RecipientAccess reads, so a partial view crashes the render rather
 *  than failing an assertion. */
function view(over: Record<string, unknown> = {}) {
  return {
    title: 'Sy 214/2 — papers for the sale',
    scope: 'shares',
    expiresOn: '01/10/2026',
    items: [
      { id: PAPER.deed, title: 'Sale deed 4412 of 1998.pdf', kind: 'document', available: true },
    ] as DoorItem[],
    boundary: null,
    ...over,
  };
}

const SHARED_BOUNDARY = {
  type: 'Feature',
  properties: { title: 'Sy 214/2' },
  geometry: { type: 'Polygon', coordinates: [[[79.2694, 15.741], [79.2704, 15.741], [79.2704, 15.7402], [79.2694, 15.741]]] },
};

const doorBase = (scope: 'shares' | 'work', tok: string) =>
  `/api/gateway/capabilities/${scope}/${tok}`;

/** Answer the view at this door. Registered after the seed's capability
 *  catch-all, so it is the one that wins (world.ts:168). */
function door(
  world: World,
  scope: 'shares' | 'work',
  tok: string,
  answer: () => { status?: number; json: unknown },
): void {
  world.route(new RegExp(`${doorBase(scope, tok)}$`), answer);
}

/** The bytes behind one item, served the way routes_capabilities.py:78 serves
 *  them: every original goes out as an attachment with a no-op CSP. */
function doorFile(
  world: World,
  scope: 'shares' | 'work',
  tok: string,
  answer: (id: string) => { status?: number; contentType?: string; body?: Buffer | string; json?: unknown; headers?: Record<string, string> },
): void {
  world.route(new RegExp(`${doorBase(scope, tok)}/files/`), (route) => {
    const id = decodeURIComponent(new URL(route.request().url()).pathname.split('/files/')[1] ?? '');
    return answer(id);
  });
}

test.describe('the door a recipient is given · /share/:token', () => {
  // No account, no session, no portfolio. This is the point of the door.
  test.use({ signedIn: false });

  test('a recipient opens only the files that were selected, and is never asked to sign in', async ({ page, world }) => {
    door(world, 'shares', TOKEN.record, () => ({ json: view() }));
    await page.goto(`/share/${TOKEN.record}`);

    await expect(page.getByRole('heading', { name: 'Sy 214/2 — papers for the sale' })).toBeVisible();
    await expect(page.getByText('Available until 01/10/2026. The owner may revoke this link at any time.')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Selected files' })).toBeVisible();
    await expect(page.getByText('Sale deed 4412 of 1998.pdf')).toBeVisible();

    // Still on the door: no redirect to /login, and none of the app's chrome.
    await expect(page).toHaveURL(new RegExp(`/share/${TOKEN.record}$`));
    await expect(page.getByRole('navigation')).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Sign in' })).toHaveCount(0);
  });

  test('while the link is still opening the door says so, rather than saying it is unavailable', async ({ page, world }) => {
    // The capability never answers. RecipientAccess.tsx:86 puts three states in
    // one heading — the title, "Link unavailable" and this — and a recipient on
    // a slow phone connection must land on the third, not the second.
    world.route(new RegExp(`${doorBase('shares', TOKEN.record)}$`), () => new Promise<never>(() => {}));
    await page.goto(`/share/${TOKEN.record}`);

    await expect(page.getByRole('heading', { name: 'Opening the link…' })).toBeVisible();
    await expect(page.getByRole('alert')).toHaveCount(0);
    await expect(page.getByText('Selected files')).toHaveCount(0);
    await expect(page.getByText('Available until')).toHaveCount(0);
  });

  test('the door asks nothing of the owner’s records — one read, and it is the capability', async ({ page, world }) => {
    door(world, 'shares', TOKEN.record, () => ({ json: view() }));
    await page.goto(`/share/${TOKEN.record}`);
    await expect(page.getByRole('heading', { name: 'Sy 214/2 — papers for the sale' })).toBeVisible();

    // Not one GraphQL field. A recipient who could reach `web { portfolio }`
    // would be reading the owner's whole holding through a share link.
    expect(world.askedFields()).toEqual([]);
    // And nothing under /api but this one capability. (The read itself happens
    // twice: StrictMode double-invokes the effect in dev, main.tsx:47.)
    expect([...new Set(world.restCalls().map((c) => c.path))])
      .toEqual([doorBase('shares', TOKEN.record)]);
  });

  test('the door tells the server nothing about where the recipient came from', async ({ page, world }) => {
    // `referrerPolicy: 'no-referrer'` (RecipientAccess.tsx:36). A share link
    // is forwarded by mail and by WhatsApp; the Referer would carry whatever
    // page it was opened from straight to the owner's gateway logs.
    let headers: Record<string, string> = {};
    world.route(new RegExp(`${doorBase('shares', TOKEN.record)}$`), (route) => {
      headers = route.request().headers();
      return { json: view() };
    });
    await page.goto(`/share/${TOKEN.record}`);
    await expect(page.getByRole('heading', { name: 'Sy 214/2 — papers for the sale' })).toBeVisible();

    expect(headers.referer ?? '').toBe('');
    expect(headers.cookie ?? '').toBe('');
    expect(headers.authorization ?? '').toBe('');
  });

  test('a shared PDF opens in place, in a frame that can run nothing', async ({ page, world }) => {
    door(world, 'shares', TOKEN.record, () => ({ json: view() }));
    doorFile(world, 'shares', TOKEN.record, () => ({
      contentType: 'application/pdf',
      body: TINY_PDF,
      headers: { 'Content-Disposition': 'attachment; filename="Sale deed 4412 of 1998.pdf"' },
    }));
    await page.goto(`/share/${TOKEN.record}`);

    await page.getByRole('button', { name: 'Open', exact: true }).click();

    const frame = page.locator('iframe[title="Sale deed 4412 of 1998.pdf"]');
    await expect(frame).toBeVisible();
    // Scripts are not in the sandbox list: a PDF is drawn, nothing is run.
    await expect(frame).toHaveAttribute('sandbox', 'allow-same-origin');
    await expect(frame).toHaveAttribute('src', /^blob:/);
  });

  test('a shared photo opens in place, and closing the preview puts it away', async ({ page, world }) => {
    door(world, 'shares', TOKEN.record, () => ({
      json: view({ items: [{ id: PAPER.map, title: 'FMB sheet 12.jpg', kind: 'photo', available: true }] }),
    }));
    doorFile(world, 'shares', TOKEN.record, () => ({ contentType: 'image/jpeg', body: BLANK_JPEG }));
    await page.goto(`/share/${TOKEN.record}`);

    await page.getByRole('button', { name: 'Open', exact: true }).click();
    await expect(page.getByRole('img', { name: 'FMB sheet 12.jpg' })).toBeVisible();

    await page.getByRole('button', { name: 'Close preview' }).click();
    await expect(page.getByRole('img', { name: 'FMB sheet 12.jpg' })).toHaveCount(0);
    // And the file is still there to open again.
    await expect(page.getByRole('button', { name: 'Open', exact: true })).toBeVisible();
  });

  test('opening a second file puts the first one away, rather than stacking two previews', async ({ page, world }) => {
    door(world, 'shares', TOKEN.record, () => ({
      json: view({
        items: [
          { id: PAPER.deed, title: 'Sale deed 4412 of 1998.pdf', kind: 'document', available: true },
          { id: PAPER.map, title: 'FMB sheet 12.jpg', kind: 'photo', available: true },
        ],
      }),
    }));
    doorFile(world, 'shares', TOKEN.record, (id) => (id === PAPER.map
      ? { contentType: 'image/jpeg', body: BLANK_JPEG }
      : { contentType: 'application/pdf', body: TINY_PDF }));
    await page.goto(`/share/${TOKEN.record}`);

    const open = page.getByRole('button', { name: 'Open', exact: true });
    await open.first().click();
    await expect(page.locator('iframe[title="Sale deed 4412 of 1998.pdf"]')).toBeVisible();

    await open.nth(1).click();

    await expect(page.getByRole('img', { name: 'FMB sheet 12.jpg' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'FMB sheet 12.jpg' })).toBeVisible();
    await expect(page.locator('iframe')).toHaveCount(0);
  });

  test('a file put away can be opened again, and is fetched again when it is', async ({ page, world }) => {
    // The preview's object URL is revoked when the preview changes
    // (RecipientAccess.tsx:41). A second look must therefore ask the store
    // again rather than hand the <iframe> a URL that has already been let go.
    door(world, 'shares', TOKEN.record, () => ({ json: view() }));
    doorFile(world, 'shares', TOKEN.record, () => ({ contentType: 'application/pdf', body: TINY_PDF }));
    await page.goto(`/share/${TOKEN.record}`);

    const open = page.getByRole('button', { name: 'Open', exact: true });
    const frame = page.locator('iframe[title="Sale deed 4412 of 1998.pdf"]');
    await open.click();
    await expect(frame).toBeVisible();
    await page.getByRole('button', { name: 'Close preview' }).click();
    await expect(frame).toHaveCount(0);

    await open.click();

    await expect(frame).toBeVisible();
    expect(world.restCalls(/\/files\//)).toHaveLength(2);
  });

  test('a file already on its way is not fetched a second time by an impatient second click', async ({ page, world }) => {
    door(world, 'shares', TOKEN.record, () => ({ json: view() }));
    doorFile(world, 'shares', TOKEN.record, () => ({
      contentType: 'application/pdf', body: TINY_PDF, delayMs: 1_500,
    }));
    await page.goto(`/share/${TOKEN.record}`);

    const open = page.getByRole('button', { name: 'Open', exact: true });
    await open.click();

    // `busy` is what says so, and it says it on the control that was pressed.
    await expect(open).toBeDisabled();
    await expect(page.locator('iframe[title="Sale deed 4412 of 1998.pdf"]')).toBeVisible();
    await expect(open).toBeEnabled();
    expect(world.restCalls(/\/files\//)).toHaveLength(1);
  });

  test('the Download beside a shared file points at the capability, not at the file store', async ({ page, world }) => {
    door(world, 'shares', TOKEN.record, () => ({ json: view() }));
    await page.goto(`/share/${TOKEN.record}`);

    // Asserted, not clicked — see the note at the top of this file.
    const link = page.getByRole('link', { name: 'Download', exact: true });
    await expect(link).toHaveCount(1);
    await expect(link).toHaveAttribute('href', `${doorBase('shares', TOKEN.record)}/files/${PAPER.deed}`);
    await expect(link).toHaveAttribute('rel', 'noreferrer');
  });

  test('a record link carries every paper on the record', async ({ page, world }) => {
    door(world, 'shares', TOKEN.record, () => ({
      json: view({
        items: [
          { id: PAPER.deed, title: 'Sale deed 4412 of 1998.pdf', kind: 'document', available: true },
          { id: PAPER.ec, title: 'Encumbrance certificate.pdf', kind: 'document', available: true },
          { id: PAPER.map, title: 'FMB sketch.pdf', kind: 'document', available: true },
          { id: PAPER.adangal, title: 'Adangal 2026.pdf', kind: 'document', available: true },
        ],
        boundary: SHARED_BOUNDARY,
      }),
    }));
    await page.goto(`/share/${TOKEN.record}`);

    await expect(page.getByRole('button', { name: 'Open', exact: true })).toHaveCount(4);
    await expect(page.getByText('Adangal 2026.pdf')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Download boundary GeoJSON' })).toBeVisible();
  });

  test('a paper link carries exactly that one paper, and no boundary', async ({ page, world }) => {
    door(world, 'shares', TOKEN.paper, () => ({
      json: view({
        title: 'Encumbrance certificate',
        items: [{ id: PAPER.ec, title: 'Encumbrance certificate.pdf', kind: 'document', available: true }],
      }),
    }));
    await page.goto(`/share/${TOKEN.paper}`);

    await expect(page.getByRole('button', { name: 'Open', exact: true })).toHaveCount(1);
    await expect(page.getByRole('link', { name: 'Download', exact: true })).toHaveCount(1);
    await expect(page.getByRole('button', { name: 'Download boundary GeoJSON' })).toHaveCount(0);
    await expect(page.getByText('No files were shared with this link.')).toHaveCount(0);
  });

  test('the boundary comes down as GeoJSON, named for what it is', async ({ page, world }) => {
    door(world, 'shares', TOKEN.record, () => ({ json: view({ items: [], boundary: SHARED_BOUNDARY }) }));
    await page.goto(`/share/${TOKEN.record}`);

    // A link that carries only the ring is not an empty link, and must not say
    // it is one: RecipientAccess.tsx:104 counts the boundary as something
    // shared.
    await expect(page.getByText('No files were shared with this link.')).toHaveCount(0);

    const started = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Download boundary GeoJSON' }).click();
    expect((await started).suggestedFilename()).toBe('shared-boundary.geojson');
  });

  test('a link with nothing on it says so, rather than drawing an empty card', async ({ page, world }) => {
    door(world, 'shares', TOKEN.record, () => ({ json: view({ items: [], boundary: null }) }));
    await page.goto(`/share/${TOKEN.record}`);

    await expect(page.getByText('No files were shared with this link.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Open', exact: true })).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Download', exact: true })).toHaveCount(0);
  });

  test('a file whose original has gone offers nothing to open, and says why', async ({ page, world }) => {
    door(world, 'shares', TOKEN.record, () => ({
      json: view({
        items: [
          { id: PAPER.deed, title: 'Sale deed 4412 of 1998.pdf', kind: 'document', available: true },
          { id: PAPER.unsorted, title: 'Old khata slip.jpg', kind: 'document', available: false },
        ],
      }),
    }));
    await page.goto(`/share/${TOKEN.record}`);

    await expect(page.getByText('Old khata slip.jpg')).toBeVisible();
    await expect(page.getByText('Original file unavailable')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Open', exact: true })).toHaveCount(1);
    await expect(page.getByRole('link', { name: 'Download', exact: true })).toHaveCount(1);
  });
});

test.describe('the door on the phone it is usually opened on', () => {
  // A share link is forwarded by WhatsApp and opened on a phone far more often
  // than on a desk. The width is set here as well as by the phone project, so
  // the assertion holds in whichever project runs on this machine.
  test.use({ signedIn: false, viewport: { width: 390, height: 844 } });

  test('a share link opened on a phone does not run off the side of the screen @phone', async ({ page, world }) => {
    door(world, 'shares', TOKEN.record, () => ({
      json: view({
        title: 'Sy 214/2, Katragunta — every paper behind the sale',
        items: [
          { id: PAPER.deed, title: 'Sale deed 4412 of 1998 — registered at Markapur SRO.pdf', kind: 'document', available: true },
          { id: PAPER.unsorted, title: 'Old khata slip.jpg', kind: 'document', available: false },
        ],
        boundary: SHARED_BOUNDARY,
      }),
    }));
    await page.goto(`/share/${TOKEN.record}`);

    await expect(page.getByRole('heading', { name: 'Sy 214/2, Katragunta — every paper behind the sale' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Open', exact: true })).toBeVisible();
    await expect(page.getByText('Original file unavailable')).toBeVisible();

    const overflow = await page.evaluate(() =>
      document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  });
});

test.describe('the door refuses bytes it must not draw', () => {
  test.use({ signedIn: false });

  /**
   * RecipientAccess.tsx:50 — anything that is not a PDF or one of five raster
   * image types is handed to the operating system instead of being rendered.
   * It has to be: a preview is a `blob:` URL, a blob URL inherits the page's
   * origin, and an `<iframe>` of attacker HTML on the app's own origin can
   * read the capability out of the very page it is sitting in. SVG is in this
   * list on purpose — it is an image everywhere else and a script container
   * here.
   */
  for (const [what, mime] of [
    ['an HTML file', 'text/html'],
    ['an SVG dressed as a picture', 'image/svg+xml'],
    ['bytes with no type at all', 'application/octet-stream'],
  ] as const) {
    test(`${what} is handed over as a file, never drawn on the app’s own origin`, async ({ page, world }) => {
      const name = 'Survey notes';
      door(world, 'shares', TOKEN.record, () => ({
        json: view({ items: [{ id: PAPER.unsorted, title: name, kind: 'document', available: true }] }),
      }));
      doorFile(world, 'shares', TOKEN.record, () => ({
        contentType: mime,
        body: '<svg xmlns="http://www.w3.org/2000/svg"><script>document.title="taken"</script></svg>',
      }));
      await page.goto(`/share/${TOKEN.record}`);

      const started = page.waitForEvent('download');
      await page.getByRole('button', { name: 'Open', exact: true }).click();
      expect((await started).suggestedFilename()).toContain(name);

      // Nothing was rendered, and the page is the page it was.
      await expect(page.locator('iframe')).toHaveCount(0);
      await expect(page.locator('section.card img')).toHaveCount(0);
      await expect(page.getByRole('heading', { name: 'Sy 214/2 — papers for the sale' })).toBeVisible();
      await expect(page).toHaveTitle(/Pattadar/i);
    });
  }
});

test.describe('the door that is closed', () => {
  // A 410 and a 502 are the point of these; Chrome logs both as console errors.
  test.use({ signedIn: false, allowConsole: true });

  test('an expired or revoked link never renders the old documents', async ({ page, world }) => {
    door(world, 'shares', TOKEN.lapsed, () => ({
      status: 410,
      json: { detail: 'This link has expired or was revoked' },
    }));
    await page.goto(`/share/${TOKEN.lapsed}`);

    await expect(page.getByRole('heading', { name: 'Link unavailable' })).toBeVisible();
    await expect(page.getByRole('alert')).toContainText('This link has expired or was revoked');
    await expect(page.getByRole('link', { name: 'Download', exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Open', exact: true })).toHaveCount(0);
    await expect(page.getByText('Selected files')).toHaveCount(0);
    await expect(page.getByText('Available until')).toHaveCount(0);
  });

  test('a link the server could not resolve at all still says what happened in one sentence', async ({ page, world }) => {
    door(world, 'shares', TOKEN.record, () => ({ status: 502, json: {} }));
    await page.goto(`/share/${TOKEN.record}`);

    // No `detail` and no `error` in the body: the screen's own words stand in.
    await expect(page.getByRole('alert')).toHaveText('This request could not be completed.');
    await expect(page.getByRole('heading', { name: 'Link unavailable' })).toBeVisible();
  });

  test('a file the store refuses says so, and leaves the rest of the link standing', async ({ page, world }) => {
    door(world, 'shares', TOKEN.record, () => ({ json: view() }));
    doorFile(world, 'shares', TOKEN.record, () => ({
      status: 410,
      json: { detail: 'This link or file is no longer available' },
    }));
    await page.goto(`/share/${TOKEN.record}`);

    await page.getByRole('button', { name: 'Open', exact: true }).click();

    await expect(page.getByRole('alert')).toContainText('This link or file is no longer available');
    await expect(page.locator('iframe')).toHaveCount(0);
    // The heading and the file row are still there — one refused file is not
    // the end of the link.
    await expect(page.getByRole('heading', { name: 'Sy 214/2 — papers for the sale' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Open', exact: true })).toBeVisible();
  });

  test('a file whose bytes the store has lost says what the store said, and not an empty alert', async ({ page, world }) => {
    // The storage layer answers `{"error": …}` where the API answers
    // `{"detail": …}` (routes_storage.py:78-88, routes_capabilities.py:73).
    // `checked()` (RecipientAccess.tsx:17) reads both, and it has to: a
    // recipient must not be handed a blank alert because two services spell
    // the same thing differently.
    door(world, 'shares', TOKEN.record, () => ({ json: view() }));
    doorFile(world, 'shares', TOKEN.record, () => ({ status: 404, json: { error: 'Not found' } }));
    await page.goto(`/share/${TOKEN.record}`);

    await page.getByRole('button', { name: 'Open', exact: true }).click();

    await expect(page.getByRole('alert')).toHaveText('Not found');
    await expect(page.locator('iframe')).toHaveCount(0);
  });
});

test.describe('the door a worker is given · /work/:token', () => {
  test.use({ signedIn: false });

  /** The work view, in the shape services/api/src/capabilities.py answers. */
  function job(over: Record<string, unknown> = {}) {
    return view({
      title: 'Walk the north edge of Sy 214/2',
      scope: 'work',
      status: 'assigned',
      statusLabel: 'Assigned to you',
      note: 'Walk the north edge and mark the two missing corners.',
      dueDate: '20/09/2026',
      actions: ['start', 'deliver'],
      answers: [
        { label: 'Extent to walk', value: '4 acres 12 guntas' },
        { label: 'Village', value: 'Katragunta, Markapur' },
      ],
      deliverables: [],
      items: [{ id: PAPER.map, title: 'FMB sketch.pdf', kind: 'document', available: true }],
      ...over,
    });
  }

  test('a worker who has just been sent a job is told what it is, and offered only the one thing they can do', async ({ page, world }) => {
    door(world, 'work', TOKEN.work, () => ({
      json: job({ status: 'sent', statusLabel: 'Sent to you', actions: ['assign'] }),
    }));
    await page.goto(`/work/${TOKEN.work}`);

    await expect(page.getByRole('heading', { name: 'Walk the north edge of Sy 214/2' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Sent to you' })).toBeVisible();
    await expect(page.getByText('Walk the north edge and mark the two missing corners.')).toBeVisible();
    await expect(page.getByText('Due: 20/09/2026')).toBeVisible();
    await expect(page.getByText('Extent to walk:')).toBeVisible();
    await expect(page.getByText('4 acres 12 guntas')).toBeVisible();

    await expect(page.getByRole('button', { name: 'Accept this job' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Mark work started' })).toHaveCount(0);
    // Nothing to send until the job is theirs.
    await expect(page.getByRole('heading', { name: 'Send work or an update' })).toHaveCount(0);
  });

  test('an assigned worker gets the papers with the job, and the form to send work back', async ({ page, world }) => {
    door(world, 'work', TOKEN.work, () => ({ json: job() }));
    await page.goto(`/work/${TOKEN.work}`);

    await expect(page.getByRole('heading', { name: 'Assigned to you' })).toBeVisible();
    await expect(page.getByText('FMB sketch.pdf')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Mark work started' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Accept this job' })).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Send work or an update' })).toBeVisible();
    await expect(page.getByText('The owner reviews submitted files before accepting the work.')).toBeVisible();
    // Nothing is sent until there is a title on it.
    await expect(page.getByRole('button', { name: 'Send to owner' })).toBeDisabled();
  });

  test('the door never offers a worker the owner’s own buttons', async ({ page, world }) => {
    // The server sends every action the job has; only the two a worker can
    // actually take are drawn (RecipientAccess.tsx:96).
    door(world, 'work', TOKEN.work, () => ({
      json: job({ actions: ['assign', 'start', 'deliver', 'accept', 'send_back', 'cancel', 'fund'] }),
    }));
    await page.goto(`/work/${TOKEN.work}`);

    await expect(page.getByRole('button', { name: 'Accept this job' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Mark work started' })).toBeVisible();
    for (const owner of [/accept the work/i, /send back/i, /cancel/i, /fund/i, /release/i]) {
      await expect(page.getByRole('button', { name: owner })).toHaveCount(0);
    }
  });

  test('a worker accepts the job and the door comes back in the state that leaves it in', async ({ page, world }) => {
    let status = 'sent';
    door(world, 'work', TOKEN.work, () => ({
      json: status === 'sent'
        ? job({ status: 'sent', statusLabel: 'Sent to you', actions: ['assign'] })
        : job({ status: 'assigned', statusLabel: 'Assigned to you', actions: ['start', 'deliver'] }),
    }));
    world.route(new RegExp(`${doorBase('work', TOKEN.work)}/actions$`), (route) => {
      const body = route.request().postDataJSON() as { action?: string };
      expect(body.action).toBe('assign');
      status = 'assigned';
      return { json: { ok: true } };
    });
    await page.goto(`/work/${TOKEN.work}`);

    await page.getByRole('button', { name: 'Accept this job' }).click();

    await expect(page.getByRole('heading', { name: 'Assigned to you' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Mark work started' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Accept this job' })).toHaveCount(0);
    expect(world.restCalls(/\/actions$/)).toHaveLength(1);
  });

  test('a worker marks the work started, and the door stops offering it twice', async ({ page, world }) => {
    let status = 'assigned';
    door(world, 'work', TOKEN.work, () => ({
      json: status === 'assigned'
        ? job()
        : job({ status: 'on_site', statusLabel: 'On site', actions: ['deliver'] }),
    }));
    world.route(new RegExp(`${doorBase('work', TOKEN.work)}/actions$`), (route) => {
      expect((route.request().postDataJSON() as { action?: string }).action).toBe('start');
      status = 'on_site';
      return { json: { ok: true } };
    });
    await page.goto(`/work/${TOKEN.work}`);

    await page.getByRole('button', { name: 'Mark work started' }).click();

    await expect(page.getByRole('heading', { name: 'On site' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Mark work started' })).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Send work or an update' })).toBeVisible();
  });

  test('a worker sends a file back, and is told the owner can review it', async ({ page, world }) => {
    let submitted = false;
    door(world, 'work', TOKEN.work, () => ({
      json: job({
        status: submitted ? 'submitted' : 'assigned',
        statusLabel: submitted ? 'Waiting on the owner' : 'Assigned to you',
        deliverables: submitted
          ? [{ id: 'w-dlv-1', label: 'North edge walked', note: 'Two corners re-pegged', review: 'pending', review_note: '' }]
          : [],
      }),
    }));
    world.route(new RegExp(`${doorBase('work', TOKEN.work)}/deliverables$`), (route) => {
      const body = route.request().postData() ?? '';
      expect(route.request().headers()['content-type']).toContain('multipart/form-data');
      expect(body).toContain('North edge walked');
      expect(body).toContain('survey.pdf');
      submitted = true;
      return { json: { ok: true, id: 'w-dlv-1' } };
    });
    await page.goto(`/work/${TOKEN.work}`);

    await page.getByLabel('Title', { exact: true }).fill('North edge walked');
    await page.getByLabel('Update', { exact: true }).fill('Two corners re-pegged');
    await page.getByLabel('File (optional)').setInputFiles({
      name: 'survey.pdf', mimeType: 'application/pdf', buffer: TINY_PDF,
    });
    await page.getByRole('button', { name: 'Send to owner' }).click();

    await expect(page.getByRole('status')).toHaveText('Submitted. The owner can review this file now.');
    await expect(page.getByRole('heading', { name: 'Submitted work' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'North edge walked · pending' })).toBeVisible();
    await expect(page.getByText('Two corners re-pegged')).toBeVisible();
    // The form is empty again, so the next update is not sent on top of this one.
    await expect(page.getByLabel('Title', { exact: true })).toHaveValue('');
  });

  test('a title of spaces is not a title, and the door goes on refusing to send', async ({ page, world }) => {
    door(world, 'work', TOKEN.work, () => ({ json: job() }));
    await page.goto(`/work/${TOKEN.work}`);

    // The gateway refuses `label.strip()` empty with a 400
    // (routes_capabilities.py:90), so the form has to refuse it first —
    // otherwise a surveyor's whole update comes back as a red sentence.
    const title = page.getByLabel('Title', { exact: true });
    await title.fill('   ');
    await expect(page.getByRole('button', { name: 'Send to owner' })).toBeDisabled();

    await title.fill('North edge walked');
    await expect(page.getByRole('button', { name: 'Send to owner' })).toBeEnabled();
  });

  test('the form stops a worker at the length the gateway would have refused', async ({ page, world }) => {
    door(world, 'work', TOKEN.work, () => ({ json: job() }));
    await page.goto(`/work/${TOKEN.work}`);

    // routes_capabilities.py:90 answers 400 for a title over 240 characters or
    // a note over 10,000. A surveyor standing in a field types once.
    await expect(page.getByLabel('Title', { exact: true })).toHaveAttribute('maxlength', '240');
    await expect(page.getByLabel('Update', { exact: true })).toHaveAttribute('maxlength', '10000');
  });

  test('a submission on its way says so, and a second press does not send it twice', async ({ page, world }) => {
    door(world, 'work', TOKEN.work, () => ({ json: job() }));
    world.route(new RegExp(`${doorBase('work', TOKEN.work)}/deliverables$`), () => ({
      json: { ok: true, id: 'w-dlv-3' }, delayMs: 1_500,
    }));
    await page.goto(`/work/${TOKEN.work}`);

    await page.getByLabel('Title', { exact: true }).fill('North edge walked');
    await page.getByRole('button', { name: 'Send to owner' }).click();

    const sending = page.getByRole('button', { name: 'Sending…' });
    await expect(sending).toBeDisabled();
    await sending.click({ force: true });

    await expect(page.getByRole('status')).toHaveText('Your update was recorded for the owner.');
    expect(world.restCalls(/\/deliverables$/)).toHaveLength(1);
  });

  test('a worker who only has news to report sends it without a file, and is told it went to the job history', async ({ page, world }) => {
    door(world, 'work', TOKEN.work, () => ({ json: job() }));
    world.route(new RegExp(`${doorBase('work', TOKEN.work)}/deliverables$`), (route) => {
      expect(route.request().postData() ?? '').toContain('Rain — coming back Thursday');
      return { json: { ok: true, id: 'w-dlv-2' } };
    });
    await page.goto(`/work/${TOKEN.work}`);

    await page.getByLabel('Title', { exact: true }).fill('Rain — coming back Thursday');
    await page.getByRole('button', { name: 'Send to owner' }).click();

    await expect(page.getByRole('status')).toHaveText('Your update was recorded for the owner.');
  });

  test('what the worker already sent is listed with the owner’s verdict on it', async ({ page, world }) => {
    door(world, 'work', TOKEN.work, () => ({
      json: job({
        status: 'submitted',
        statusLabel: 'Waiting on the owner',
        actions: [],
        outcomeNote: 'The owner has not looked at this yet.',
        deliverables: [
          { id: 'w-dlv-1', label: 'North edge walked', note: 'Two corners re-pegged', review: 'accepted', review_note: 'Matches the FMB.' },
          { id: 'w-dlv-2', label: 'Corner photographs', note: '', review: 'sent back', review_note: 'No location stamp on three of them.' },
        ],
      }),
    }));
    await page.goto(`/work/${TOKEN.work}`);

    await expect(page.getByRole('heading', { name: 'North edge walked · accepted' })).toBeVisible();
    await expect(page.getByText('Matches the FMB.')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Corner photographs · sent back' })).toBeVisible();
    await expect(page.getByText('No location stamp on three of them.')).toBeVisible();
    await expect(page.getByText('The owner has not looked at this yet.')).toBeVisible();
    // Submitted work can still be added to — a sent-back item has to be redone.
    await expect(page.getByRole('heading', { name: 'Send work or an update' })).toBeVisible();
  });
});

test.describe('the worker door when a submission fails', () => {
  // A refused POST, logged by Chrome as a failed resource.
  test.use({ signedIn: false, allowConsole: true });

  test('a submission the server refuses keeps what the worker typed, so it can be sent again', async ({ page, world }) => {
    door(world, 'work', TOKEN.work, () => ({
      json: view({
        title: 'Walk the north edge of Sy 214/2',
        scope: 'work',
        status: 'assigned',
        statusLabel: 'Assigned to you',
        note: 'Walk the north edge.',
        actions: ['deliver'],
        answers: [],
        deliverables: [],
        items: [],
      }),
    }));
    world.route(new RegExp(`${doorBase('work', TOKEN.work)}/deliverables$`), () => ({
      status: 503,
      json: { detail: 'Storage is temporarily unavailable' },
    }));
    await page.goto(`/work/${TOKEN.work}`);

    await page.getByLabel('Title', { exact: true }).fill('North edge walked');
    await page.getByRole('button', { name: 'Send to owner' }).click();

    await expect(page.getByRole('alert')).toContainText('Storage is temporarily unavailable');
    await expect(page.getByLabel('Title', { exact: true })).toHaveValue('North edge walked');
    await expect(page.getByRole('button', { name: 'Send to owner' })).toBeEnabled();
    await expect(page.getByRole('status')).toHaveCount(0);
  });

  test('an action the server refuses says so, and does not pretend the job moved on', async ({ page, world }) => {
    door(world, 'work', TOKEN.work, () => ({
      json: view({
        title: 'Walk the north edge of Sy 214/2',
        scope: 'work',
        status: 'sent',
        statusLabel: 'Sent to you',
        note: 'Walk the north edge.',
        actions: ['assign'],
        answers: [],
        deliverables: [],
        items: [],
      }),
    }));
    world.route(new RegExp(`${doorBase('work', TOKEN.work)}/actions$`), () => ({
      status: 409,
      json: { detail: 'Somebody else has already taken this job' },
    }));
    await page.goto(`/work/${TOKEN.work}`);

    await page.getByRole('button', { name: 'Accept this job' }).click();

    await expect(page.getByRole('alert')).toContainText('Somebody else has already taken this job');
    await expect(page.getByRole('heading', { name: 'Sent to you' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Accept this job' })).toBeEnabled();
  });
});
