/**
 * W08 · the people hanger — /app/records/:id/people
 *
 * "Caretakers & staff" is the only screen in the module that mixes five kinds
 * of person on one page and grades them: the ones you pay get the full
 * arrangement grid (what, how much, when next, what they can see), the ones you
 * don't get one line and one control. Almost every assertion here is about that
 * grading, and about the three writes that hang off it — assign, rename, take
 * off — each of which has a happy path, a refusal the server answers with, and
 * a refusal that never reaches the server at all. All three matter equally:
 * apps/web/src/w360/pages/RecordPeople.tsx carries three long comments about
 * forms that used to close on a write nobody had awaited, and these tests are
 * what keeps them closed.
 *
 * Things worth knowing before editing this file:
 *
 *  · The seed answers `people` for ID.parcel and an emptied version of the same
 *    shape for every other record (fixtures/seed.ts:740), so ID.plot is the
 *    "nobody is filed here" record and needs no setup. Anything else — a person
 *    with no arrangement, an escrow payment, a live wallet — is built here with
 *    `peopleView()` rather than in fixtures, because it belongs to one scenario.
 *  · `people` is a FUNCTION answer in the seed, so `world.seedOf('people')`
 *    throws. The builders below are a faithful copy of every field Q_PEOPLE
 *    selects (apps/web/src/w360/api.ts:333). A field missing from one of them
 *    renders as `undefined` on the screen, which is the bug this suite exists
 *    to catch rather than produce.
 *  · The right-hand column's two cards are plain <section class="card"> with no
 *    accessible name, so `asideCard()` scopes by heading text. That is the only
 *    class-based locator here apart from the payment rows and the MUI icon
 *    test ids, each commented where it is used.
 *  · The last describe is a DIFFERENT screen: PersonDialog, the person editor
 *    the previous interface still owns at /legacy/groups. It is in this file
 *    because it is the app's other answer to "file a person", and the two are
 *    worth reading side by side — one asks for a name and a role, the other
 *    for a share, an Aadhaar, a guardian and a spouse. It brings its own
 *    answers for the legacy GraphQL surface; see `legacyFamilies()`, whose
 *    options also refuse a save and hold one open. Its "Scan Aadhaar / ID"
 *    panel is an ASYNC read (api/client.ts:33), so the two tests that use it
 *    answer `extract-aadhaar-async` AND `import-status` with world.route.
 *  · Four test.fail()s, each with the file and line of its cause on it:
 *    a payment row throws away the date and the method the query asked for;
 *    the one-line list drops the role, which is the only thing a person
 *    remembered off a closed job has; a rename that fails raises a toast with
 *    no reason in it; and the Aadhaar field tells the owner only the last four
 *    digits are kept, which is not what the server does with the number. A
 *    fifth — a payment's direction said only by an aria-hidden arrow and a
 *    colour — was fixed on 28/09/2026 and is an ordinary test now.
 */
import { test, expect, World } from '../fixtures/harness';
import type { Page } from '../fixtures/harness';
import { ID, PERSON } from '../fixtures/ids';

const PEOPLE_OF = (id: string) => `/app/records/${id}/people`;
const PARCEL = PEOPLE_OF(ID.parcel);   // three people, two payments, a wallet
const NOBODY = PEOPLE_OF(ID.plot);     // the same shape, emptied
/** The People tab now opens on the ownership side; the caretakers and staff
 *  list these tests are about is one toggle away. */
async function gotoStaff(page: Page, url: string) {
  await page.goto(url);
  await page.getByRole('button', { name: 'Caretakers & staff', exact: true }).click();
}

type Row = Record<string, unknown>;

/** Every field Q_PEOPLE selects on a person (apps/web/src/w360/api.ts:335). */
function person(over: Row = {}): Row {
  return {
    id: 'w-person-x', name: 'Ramana Rao', initials: 'RR', role: '',
    badges: [], summary: '', arrangement: '', payLabel: '', payValue: '',
    dueLabel: '', dueValue: '', visibility: '', actions: [], compact: false,
    ...over,
  };
}

/** Every field Q_PEOPLE selects on a payment (api.ts:338). */
function payment(over: Row = {}): Row {
  return {
    id: 'w-pay-x', title: 'A payment', subtitle: 'somebody · some month',
    occurredOn: '2026-09-01', method: 'UPI', amount: 1_000,
    direction: 'out', state: 'done',
    ...over,
  };
}

/** The whole PeopleView. Defaults are the empty-but-valid ones. */
function peopleView(over: Row = {}): Row {
  return {
    count: 0, monthlyOut: 0, seasonalIn: 0,
    walletBalance: 24_500, walletNote: 'In your wallet', walletLive: false,
    people: [], payments: [],
    ...over,
  };
}

/** One person's full card, found by the name on it. */
const card = (page: Page, name: string) =>
  page.getByRole('article').filter({ has: page.getByRole('heading', { name, exact: true }) });

/** The aside cards. `Card` (w360/ui.tsx:425) renders a bare <section> whose h2
 *  is inside a div, so there is no role, label or parent to reach it by — the
 *  heading text is the closest thing to a name it has. */
const asideCard = (page: Page, title: string) =>
  page.getByRole('complementary').locator('section').filter({ hasText: title });

// ── what is drawn ──────────────────────────────────────────────────────

test.describe('the hanger, drawn', () => {
  test('the people hanger asks for the record it was routed to and heads itself with the question it answers', async ({ page, world }) => {
    await gotoStaff(page, PARCEL);

    // The people land before the world is questioned about them: :5173 is the
    // founder's own dev server and can be slow to serve a cold module graph,
    // and a bare poll on `asked` would blame the app for that.
    await expect(card(page, 'Ramana Rao')).toBeVisible();
    expect(world.lastVars('people')).toMatchObject({ id: ID.parcel });

    // One heading for the tab, its own noun, and the side you are on is the
    // pressed half of the segment under it (design.md § App vocabulary,
    // "Property tabs").
    await expect(page.getByRole('heading', { level: 2, name: 'People', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Caretakers & staff', exact: true }))
      .toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByText('Sy 214/2 · Katragunta')).toBeVisible();

    const crumbs = page.getByRole('navigation', { name: 'Breadcrumb' });
    await expect(crumbs.getByRole('link', { name: 'Properties' }))
      .toHaveAttribute('href', '/app/properties');
    await expect(crumbs.getByRole('link', { name: 'Sy 214/2' }))
      .toHaveAttribute('href', `/app/records/${ID.parcel}`);
    // The hanger you are standing on is a word, not a link back to itself.
    await expect(crumbs).toContainText('People');
    await expect(crumbs.getByRole('link', { name: 'People' })).toHaveCount(0);
  });

  test('the line under the heading counts the people, and the rail states the money moving through them', async ({ page }) => {
    // The pay figures are said once on this tab, in the rail, in whole
    // rupees the way each person's own pay is written — so the sum can be
    // checked against them. The line under the heading is the headcount.
    await gotoStaff(page, PARCEL);
    await expect(page.locator('header.sechead p.note')).toHaveText('3 people');
    const money = asideCard(page, 'Payments to people');
    await expect(money).toContainText('₹7,200 out, each month');
    await expect(money).toContainText('₹1,40,000 in, each season');
    await expect(page.getByText(/\/month out/)).toHaveCount(0);
  });

  test('one person is one person, not "1 people"', async ({ page, world }) => {
    world.set('people', peopleView({ count: 1, people: [person({ name: 'Ramana Rao' })] }));
    await gotoStaff(page, PARCEL);
    await expect(page.locator('header.sechead p.note')).toHaveText('1 person');
  });

  test('the watchman is drawn with his initials, his badge and the whole arrangement', async ({ page }) => {
    await gotoStaff(page, PARCEL);
    const watchman = card(page, 'Ramana Rao');

    await expect(watchman).toContainText('RR');
    await expect(watchman).toContainText('On site');
    await expect(watchman).toContainText('Walks the land weekly');
    // The badge speaks for him, so his role is not printed a second time
    // beside it (RecordPeople.tsx:272 draws the role pill only with no badges).
    await expect(watchman.getByText('Watchman')).toHaveCount(0);

    await expect(watchman).toContainText('Arrangement');
    await expect(watchman).toContainText('Monthly');
    await expect(watchman).toContainText('Paid');
    await expect(watchman).toContainText('₹7,200 / month');
    await expect(watchman).toContainText('Next');
    await expect(watchman).toContainText('1 Oct 2026');
  });

  test('a tenant with no badge wears his role instead', async ({ page }) => {
    await gotoStaff(page, PARCEL);
    const tenant = card(page, 'Sai Kumar');

    await expect(tenant).toContainText('Tenant farmer');
    await expect(tenant).toContainText('Groundnut, one season');
    await expect(tenant).toContainText('Share');
    await expect(tenant).toContainText('40%');
    await expect(tenant).toContainText('Harvest');
    await expect(tenant).toContainText('Feb 2027');
  });

  test('a badge the server has verified is drawn with the tick, and the plain ones are not', async ({ page, world }) => {
    // record_people stores badges as free text, and the only thing that makes
    // one a VERIFIED badge is the word inside it (RecordPeople.tsx:267-272).
    // A tick that turns up on "On site" would be the app vouching for
    // something nobody checked.
    world.set('people', peopleView({
      count: 1,
      people: [person({
        id: PERSON.tenant, name: 'Sai Kumar', role: 'Tenant farmer',
        badges: ['Aadhaar verified', 'On site'],
      })],
    }));
    await gotoStaff(page, PARCEL);

    const sai = card(page, 'Sai Kumar');
    await expect(sai.getByText('Aadhaar verified')).toBeVisible();
    await expect(sai.getByText('On site')).toBeVisible();
    // The glyph carries no text of its own; the data-testid MUI stamps on an
    // icon outside a production build is the only handle on it, and holds
    // against the dev server this suite drives (createSvgIcon.js:18).
    await expect(sai.locator('[data-testid="VerifiedOutlinedIcon"]')).toHaveCount(1);
    // Badged people wear no role pill, however many badges they have.
    await expect(sai.getByText('Tenant farmer')).toHaveCount(0);
  });

  test('a half-recorded arrangement draws only the cells that have both a word and a figure', async ({ page, world }) => {
    // update_person skips empty arguments (services/api/src/web360.py:4824), so
    // a half-filled row is what an owner who changed one thing actually has.
    world.set('people', peopleView({
      count: 1,
      people: [person({
        id: 'w-person-half', name: 'Lakshmi Devi', role: 'Caretaker',
        arrangement: 'Yearly', payLabel: 'Paid', payValue: '',
        dueLabel: '', dueValue: 'Feb 2027', visibility: '',
      })],
    }));
    await gotoStaff(page, PARCEL);

    const half = card(page, 'Lakshmi Devi');
    await expect(half).toContainText('Arrangement');
    await expect(half).toContainText('Yearly');

    // A label with no figure under it, and a figure with no label over it, are
    // both dropped rather than drawn as a blank column.
    await expect(half.getByText('Paid')).toHaveCount(0);
    await expect(half.getByText('Feb 2027')).toHaveCount(0);
    await expect(half.getByText('Can see')).toHaveCount(0);
    // One cell is still an arrangement, so the card must not deny there is one.
    await expect(half).not.toContainText('No arrangement recorded yet.');
  });

  test('what each person can see is on their own card, not in a settings screen', async ({ page }) => {
    await gotoStaff(page, PARCEL);
    await expect(card(page, 'Ramana Rao')).toContainText('Can see');
    await expect(card(page, 'Ramana Rao')).toContainText('Sees photos and boundary');
    await expect(card(page, 'Sai Kumar')).toContainText('Can see');
    await expect(card(page, 'Sai Kumar')).toContainText('Sees nothing');
  });

  test('the initials on a card come from the name beside them, not from what was stored', async ({ page, world }) => {
    // initialsOf (w360/ui.tsx:166) is derived because stored initials drifted
    // from the names once records stopped sharing one cast.
    world.set('people', peopleView({
      count: 1,
      people: [person({ id: 'w-person-sn', name: 'M. Satyanarayana', initials: 'ZZ' })],
    }));
    await gotoStaff(page, PARCEL);

    await expect(card(page, 'M. Satyanarayana')).toContainText('MS');
    await expect(page.getByText('ZZ')).toHaveCount(0);
  });

  test('somebody remembered from a closed job gets one line and one control', async ({ page }) => {
    await gotoStaff(page, PARCEL);

    // Venkat Reddy is filed compact: no card, no arrangement grid, no rename.
    await expect(card(page, 'Venkat Reddy')).toHaveCount(0);
    await expect(page.getByText('Venkat Reddy')).toBeVisible();
    await expect(page.getByText('Brother · equal share')).toBeVisible();
    // `exact` because the assistant panel's placeholder also says "family records".
    await expect(page.getByText('Family', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Remove Venkat Reddy' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Rename Venkat Reddy' })).toHaveCount(0);
  });

  test('a record whose only people came off closed jobs is not a record with nobody on it', async ({ page, world }) => {
    // The empty state is guarded on the WHOLE list, not on the half of it that
    // gets cards (RecordPeople.tsx:223-227) — a brother filed compact is still
    // somebody who looks after it.
    world.set('people', peopleView({
      count: 1,
      people: [person({
        id: PERSON.brother, name: 'Venkat Reddy', badges: ['Family'],
        summary: 'Brother · equal share', compact: true,
      })],
    }));
    await gotoStaff(page, PARCEL);

    await expect(page.getByText('Venkat Reddy')).toBeVisible();
    await expect(page.getByText('Brother · equal share')).toBeVisible();
    await expect(page.getByText('No caretakers or staff recorded')).toHaveCount(0);
    await expect(page.getByRole('article')).toHaveCount(0);
  });

  test('somebody remembered from a closed job says what they did here', async ({ page, world }) => {
    // DEFECT: apps/web/src/w360/pages/RecordPeople.tsx:366-377 draws a compact
    // row as initials + name + badges + summary. The CARD branch falls back to
    // the role pill when a person has no badges (:272, with a comment saying
    // why) and the row does not — and no compact person the app writes has a
    // badge at all: the only thing that files one is _remember_person
    // (services/api/src/web360.py:2359-2388), which inserts badges='[]' by
    // design ("Nothing is claimed about them beyond the job they did — no
    // badges") together with a role from _TICKET_ROLE — "Surveyor",
    // "Advocate", "Contractor", or "Did work here". So the one word that
    // answers this screen's own question about that person is stored, asked
    // for (apps/web/src/w360/api.ts:335 selects `role`) and then dropped, for
    // every row this list exists to hold. The seeded brother only reads right
    // because a hand-written badge happens to stand in for it. The owner is
    // owed the same fallback the card has.
    test.fail();
    world.set('people', peopleView({
      count: 1,
      people: [person({
        id: 'w-person-surveyor', name: 'K. Prasad', role: 'Surveyor', badges: [],
        summary: 'Re-walk the eastern boundary · SR-1042', compact: true,
      })],
    }));
    await gotoStaff(page, PARCEL);

    await expect(page.getByText('K. Prasad')).toBeVisible();
    await expect(page.getByText('Re-walk the eastern boundary · SR-1042')).toBeVisible();
    await expect(page.getByText('Surveyor')).toBeVisible();
  });

  test('a one-line person keeps the labels that go somewhere, and loses the rest the same way', async ({ page, world }) => {
    // The compact row maps its labels through destOf a second time
    // (RecordPeople.tsx:379-382), so it can rot apart from the card's copy.
    world.set('people', peopleView({
      count: 1,
      people: [person({
        id: PERSON.brother, name: 'Venkat Reddy', badges: ['Family'],
        summary: 'Brother · equal share', compact: true,
        actions: ['Lease agreement', 'Permissions'],
      })],
    }));
    await gotoStaff(page, PARCEL);

    await expect(page.getByRole('link', { name: 'Lease agreement' }))
      .toHaveAttribute('href', `/app/records/${ID.parcel}`);
    await expect(page.getByText('Permissions')).toHaveCount(0);
    // Still one line: a label never promotes the row to a card.
    await expect(page.getByRole('article')).toHaveCount(0);
  });

  test('a person filed with nothing but a name says so instead of drawing an empty grid', async ({ page, world }) => {
    // add_person writes the arrangement columns empty (web360.py:4810), so this
    // is what every person filed from the inline form looks like.
    world.set('people', peopleView({
      count: 1,
      people: [person({ id: 'w-person-new', name: 'Lakshmi Devi', role: 'Caretaker' })],
    }));
    await gotoStaff(page, PARCEL);

    const fresh = card(page, 'Lakshmi Devi');
    await expect(fresh).toContainText('Caretaker');
    await expect(fresh).toContainText('No arrangement recorded yet.');
    await expect(fresh).not.toContainText('Can see');
    await expect(fresh).not.toContainText('Arrangement');
  });

  test('only the labels that go somewhere are drawn, and the footnote says where the rest happens', async ({ page, world }) => {
    world.set('people', peopleView({
      count: 1,
      people: [person({
        id: 'w-person-acts', name: 'Sai Kumar', role: 'Tenant farmer',
        actions: ['Lease agreement', 'Track', 'Invite to the app',
                  'Message', 'Change pay', 'Record a payment', 'Permissions'],
      })],
    }));
    await gotoStaff(page, PARCEL);

    const acts = card(page, 'Sai Kumar');
    await expect(acts.getByRole('link', { name: 'Lease agreement' }))
      .toHaveAttribute('href', `/app/records/${ID.parcel}`);
    await expect(acts.getByRole('link', { name: 'Track' }))
      .toHaveAttribute('href', `/app/records/${ID.parcel}/services`);
    await expect(acts.getByRole('link', { name: 'Invite to the app' }))
      .toHaveAttribute('href', '/app/invitations');

    // The labels with nothing behind them are dropped, not drawn disabled.
    for (const dead of ['Message', 'Change pay', 'Record a payment', 'Permissions']) {
      await expect(acts.getByText(dead)).toHaveCount(0);
    }

    // And the footnote under the list is where those things are accounted for.
    await expect(page.getByText(/Who can see this record is granted as a link/)).toBeVisible();
    await expect(page.getByText(/Messaging a person, setting a visit\s+schedule/)).toBeVisible();
    await expect(page.getByRole('main').getByRole('link', { name: 'Papers', exact: true }))
      .toHaveAttribute('href', '/app/papers');
  });

  test('the People tab is the one you are standing on, and it carries the record own count', async ({ page }) => {
    await gotoStaff(page, PARCEL);
    const tabs = page.getByRole('navigation', { name: 'This property' });
    const here = tabs.getByRole('link', { name: /^People/ });
    await expect(here).toHaveAttribute('aria-current', 'page');
    // Both sides of the tab: the three staff and the one owner the seed files
    // against every record (web360.py `record` counts record_people and
    // record_owners, so the badge agrees with what the tab shows).
    await expect(here).toContainText('4');
  });
});

// ── the owners side ────────────────────────────────────────────────────

test.describe('the owners side', () => {
  test('the tab opens on the owners, and says how many and who holds it now', async ({ page }) => {
    await page.goto(PARCEL);
    await expect(page.getByRole('button', { name: 'Owners', exact: true }))
      .toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('header.sechead p.note')).toHaveText('1 owner · Shankar Reddy');
  });

  test('an owner on the chain opens their own drawer from a pointer click', async ({ page }) => {
    // The chain's node sat under a layer that took the pointer (the canvas
    // wrapper's pointer-events), so the owner could be opened from the
    // keyboard and not by a click. A real click is what proves it now:
    // Playwright only clicks an element that receives the pointer at that
    // point (OwnerChain.tsx, the node's pointer-events).
    await page.goto(PARCEL);
    await page.getByRole('button', { name: 'Open Shankar Reddy', exact: true }).click();

    const drawer = page.getByRole('dialog', { name: 'Shankar Reddy', exact: true });
    await expect(drawer).toBeVisible();
    await expect(drawer.locator('.eyebrow')).toHaveText('Sy 214/2 · Owners');
    await expect(drawer.getByRole('button', { name: 'Remove from this property' })).toBeVisible();
  });

  test('a property with no owner on file offers the first transfer, and it opens the transfer drawer', async ({ page, world }) => {
    // A chain of title starts with a transfer, and the only "Add a transfer"
    // used to be drawn inside the chain it would create — so an empty Owners
    // side had no way in at all.
    world.set('owners', { owners: [], count: 0, currentName: '' });
    world.set('transfers', { transfers: [], count: 0, unverifiedCount: 0 });
    await page.goto(PARCEL);

    await expect(page.getByText('No owners recorded yet')).toBeVisible();
    await page.getByRole('button', { name: 'Add a transfer' }).click();
    const drawer = page.getByRole('dialog', { name: 'Add a transfer', exact: true });
    await expect(drawer).toBeVisible();
    await expect(drawer.locator('.eyebrow')).toHaveText('Sy 214/2 · Owners');
    expect(world.calls('addTransfer')).toHaveLength(0);
  });
});

// ── the money column ───────────────────────────────────────────────────

test.describe('the money on people', () => {
  test('the money card says the two figures once, out first and in second, to the rupee', async ({ page }) => {
    await gotoStaff(page, PARCEL);
    const money = asideCard(page, 'Payments to people');

    await expect(money).toContainText('₹7,200');
    await expect(money).toContainText('out, each month');
    // Whole rupees, as each person's own pay is written, not "₹1.4 L".
    await expect(money).toContainText('₹1,40,000');
    await expect(money).toContainText('in, each season');
    await expect(money).not.toContainText('₹1.4 L');
  });

  /** Somebody on the property with pay on file — what brings the money
   *  column out at all (RecordPeople.tsx `hasArrangement`). */
  const paid = () => person({ arrangement: 'Monthly', payLabel: 'Paid', payValue: '₹7,200 / month' });

  test('the wallet balance is printed to the rupee, the way the wallet itself prints it', async ({ page, world }) => {
    // ₹1,01,000 read as "₹1.01 L" here and ₹1,01,000 a click away on
    // /app/wallet is ₹433 of daylight between two figures for the same money.
    world.set('people', peopleView({
      count: 1, people: [paid()], monthlyOut: 7_200, walletBalance: 101_000, walletNote: 'In your wallet',
    }));
    await gotoStaff(page, PARCEL);

    await expect(asideCard(page, 'Payments to people')).toContainText('Balance ₹1,01,000 · In your wallet');
    await expect(page.getByText('₹1.01 L')).toHaveCount(0);
  });

  test('the wallet card does not say anything was paid from it while paying out is not switched on', async ({ page }) => {
    // "Paid" is a claim that money moved through Pattadar. While the payments
    // provider is a stub nothing has, so the card names the wallet and says
    // what it holds (design.md § App vocabulary, "Property tabs").
    await gotoStaff(page, PARCEL);
    const money = asideCard(page, 'Payments to people');

    await expect(money).toContainText('Your Pattadar wallet');
    await expect(money).not.toContainText('Paid from your Pattadar wallet');
    await expect(money.getByRole('link', { name: 'See the wallet' }))
      .toHaveAttribute('href', '/app/wallet');
  });

  test('when the wallet goes live the card says the pay comes out of it', async ({ page, world }) => {
    world.set('people', peopleView({
      count: 1, people: [paid()], monthlyOut: 7_200, walletLive: true, walletNote: 'In your wallet',
    }));
    await gotoStaff(page, PARCEL);

    const money = asideCard(page, 'Payments to people');
    await expect(money).toContainText('Paid from your Pattadar wallet');
    await expect(money).toContainText('Balance ₹24,500');
    await expect(money).not.toContainText('not switched on yet');
    await expect(money.getByRole('link', { name: 'See the wallet' })).toBeVisible();
  });

  test('nobody with pay on file means no money column, rather than one full of zeroes', async ({ page, world }) => {
    // The rail waits until somebody on this property has an arrangement, as
    // Missing documents waits for a gap (RecordPeople.tsx `hasRail`).
    world.set('people', peopleView({ count: 1, people: [person()] }));
    await gotoStaff(page, PARCEL);

    await expect(card(page, 'Ramana Rao')).toBeVisible();
    await expect(asideCard(page, 'Payments to people')).toHaveCount(0);
    await expect(asideCard(page, 'Recent payments')).toHaveCount(0);
    await expect(page.locator('.split.no-rail')).toHaveCount(1);
  });

  test('the last payments say which way the money went, and money still held says neither', async ({ page, world }) => {
    world.set('people', peopleView({
      count: 1,
      people: [person()],
      monthlyOut: 7_200,
      seasonalIn: 140_000,
      payments: [
        payment({ id: 'w-pay-out', title: 'Ramana Rao', subtitle: 'Watchman · September', amount: 7_200, direction: 'out', state: 'done' }),
        payment({ id: 'w-pay-in', title: 'Groundnut sale', subtitle: 'Sai Kumar · share', amount: 140_000, direction: 'in', state: 'done' }),
        payment({ id: 'w-pay-held', title: 'Boundary survey', subtitle: 'releases when you accept the sketch', amount: 4_500, direction: 'out', state: 'escrow' }),
      ],
    }));
    await gotoStaff(page, PARCEL);

    // The rows have no role of their own, and the only thing separating the
    // three glyphs is the data-testid MUI stamps on an icon outside a
    // production build (@mui/material SvgIcon/createSvgIcon.js:18) — so the
    // glyph assertions hold against the dev server this suite drives and not
    // against a built bundle. The direction is also said in a word under the
    // amount (RecordPeople.tsx paymentWord), asserted in the test below.
    const rows = asideCard(page, 'Recent payments').locator('.rows > div');
    await expect(rows).toHaveCount(3);

    await expect(rows.nth(0)).toContainText('Ramana Rao');
    await expect(rows.nth(0)).toContainText('₹7,200');
    await expect(rows.nth(0).locator('[data-testid="NorthEastOutlinedIcon"]')).toHaveCount(1);

    await expect(rows.nth(1)).toContainText('Groundnut sale');
    await expect(rows.nth(1)).toContainText('₹1,40,000');
    await expect(rows.nth(1).locator('[data-testid="SouthWestOutlinedIcon"]')).toHaveCount(1);

    // Escrow is money that has NOT moved, and takes the clock rather than
    // either arrow.
    await expect(rows.nth(2)).toContainText('Boundary survey');
    await expect(rows.nth(2)).toContainText('releases when you accept the sketch');
    await expect(rows.nth(2).locator('[data-testid="AccessTimeOutlinedIcon"]')).toHaveCount(1);
  });

  test('money still held reads as held even when it is money coming in', async ({ page, world }) => {
    // The row asks `state === 'escrow'` BEFORE it asks which way the money was
    // going (RecordPeople.tsx:482-486). Get that order wrong and an advance
    // nobody can spend yet wears the same arrow as money already banked.
    world.set('people', peopleView({
      count: 1,
      people: [person()],
      payments: [payment({
        id: 'w-pay-escrow-in', title: 'Groundnut advance',
        subtitle: 'held until the crop is weighed', amount: 25_000,
        direction: 'in', state: 'escrow',
      })],
    }));
    await gotoStaff(page, PARCEL);

    const row = asideCard(page, 'Recent payments').locator('.rows > div').first();
    await expect(row).toContainText('Groundnut advance');
    await expect(row).toContainText('₹25,000');
    await expect(row.locator('[data-testid="AccessTimeOutlinedIcon"]')).toHaveCount(1);
    await expect(row.locator('[data-testid="SouthWestOutlinedIcon"]')).toHaveCount(0);
  });

  test('a payment says how the money moved and when', async ({ page }) => {
    // DEFECT: apps/web/src/w360/pages/RecordPeople.tsx:478-498 draws a payment
    // row as icon + title + subtitle + amount and nothing else, while
    // Q_PEOPLE (apps/web/src/w360/api.ts:338) asks for `occurredOn` and
    // `method` on every row and services/api/src/web360.py:2967-2968 serves
    // both from people_payments. So the ₹7,200 handed to the watchman in cash
    // and the ₹7,200 sent to him by UPI are the same row on this screen, and
    // neither carries the date it happened — the two things an owner needs to
    // tick a watchman's pay off against a bank statement. The wallet, which
    // this card points at for "the ledger across all your records", prints the
    // date on every movement (Wallet.tsx:143). The owner is owed the method
    // and the date on the row, or those two fields dropped from the query.
    test.fail();
    await gotoStaff(page, PARCEL);

    const first = asideCard(page, 'Recent payments').locator('.rows > div').first();
    await expect(first).toContainText('UPI');
    await expect(first).toContainText(/2026/);
  });

  test('a payment row says which way the money went to somebody who cannot see the arrow', async ({ page, world }) => {
    // Was a DEFECT marker: the direction of a payment was an aria-hidden arrow
    // glyph and a colour and nothing else, so the row reached a screen reader
    // as "Ramana Rao, Watchman · September, ₹7,200" with no way to tell money
    // handed out from money received — and green against grey is exactly the
    // pair a red-green reader loses. Fixed 28/09/2026: the row says Out, In or
    // Held in a word under the amount (RecordPeople.tsx paymentWord). Read as
    // rendered text (innerText), because the word is its own block under the
    // figure rather than run on to it.
    world.set('people', peopleView({
      count: 1,
      people: [person()],
      payments: [
        payment({ id: 'w-pay-out', title: 'Ramana Rao', subtitle: 'Watchman · September', amount: 7_200, direction: 'out' }),
        payment({ id: 'w-pay-in', title: 'Groundnut sale', subtitle: 'Sai Kumar · share', amount: 140_000, direction: 'in' }),
      ],
    }));
    await gotoStaff(page, PARCEL);

    const rows = asideCard(page, 'Recent payments').locator('.rows > div');
    await expect(rows.nth(0)).toHaveText(/₹7,200\s+Out$/, { useInnerText: true });
    await expect(rows.nth(1)).toHaveText(/₹1,40,000\s+In$/, { useInnerText: true });
    // Never "paid": while the payments provider is a stub nothing has moved
    // through Pattadar.
    await expect(asideCard(page, 'Recent payments')).not.toContainText(/paid/i);
  });

  test('money still held says Held, whichever way it is going', async ({ page, world }) => {
    world.set('people', peopleView({
      count: 1,
      people: [person()],
      payments: [payment({
        id: 'w-pay-held', title: 'Boundary survey', subtitle: 'releases when you accept the sketch',
        amount: 4_500, direction: 'in', state: 'escrow',
      })],
    }));
    await gotoStaff(page, PARCEL);

    const row = asideCard(page, 'Recent payments').locator('.rows > div').first();
    await expect(row).toHaveText(/₹4,500\s+Held$/, { useInnerText: true });
  });

  test('pay on file with no payment recorded says so rather than drawing an empty card', async ({ page, world }) => {
    world.set('people', peopleView({
      count: 1, monthlyOut: 7_200,
      people: [person({ arrangement: 'Monthly', payLabel: 'Paid', payValue: '₹7,200 / month' })],
    }));
    await gotoStaff(page, PARCEL);
    const payments = asideCard(page, 'Recent payments');

    await expect(payments).toContainText('No payments recorded on this property yet.');
    await expect(payments.locator('.rows > div')).toHaveCount(0);
  });
});

// ── assigning someone ──────────────────────────────────────────────────

/** Assigning somebody is a drawer now, not an inline row-form under the button
 *  (RecordPeople.AssignDrawer over the shared Drawer.tsx). What that changed for
 *  these tests:
 *
 *   - the name box is labelled "Their name", and there are three more fields
 *     behind it that the row-form had no room for — all of them columns
 *     `add_person` actually has;
 *   - "what they do here" is a chip row rather than a text box, with nothing
 *     pre-selected, because a pre-selected "Tenant" files a claim the owner
 *     never made;
 *   - the primary says what it does — "Assign them" — instead of "Add";
 *   - the trigger opens the panel and no longer toggles it shut, which is what
 *     Escape, Cancel and the header × are for.
 *
 *  Everything the old contract guaranteed is still asserted below: focus on
 *  open, a blank name refused, values trimmed, Enter files, a refusal keeps what
 *  was typed, and focus goes back to the control that opened it. */
test.describe('assigning someone', () => {
  const nameBox = (page: Page) => page.getByLabel('Their name');
  const assign = (page: Page) => page.getByRole('button', { name: 'Assign them' });

  test('assigning someone opens a drawer, focuses the name, and refuses to file a blank one', async ({ page }) => {
    await gotoStaff(page, PARCEL);
    await page.getByRole('button', { name: 'Assign someone' }).click();

    // A real dialog: named by its own heading, and the page behind it is inert.
    const drawer = page.getByRole('dialog', { name: 'Assign someone' });
    await expect(drawer).toBeVisible();
    await expect(nameBox(page)).toBeFocused();
    await expect(assign(page)).toBeDisabled();

    // Whitespace is not a name.
    await nameBox(page).fill('   ');
    await expect(assign(page)).toBeDisabled();

    await nameBox(page).fill('Lakshmi Devi');
    await expect(assign(page)).toBeEnabled();
  });

  test('the drawer says which record and which hanger it is filing against', async ({ page }) => {
    // The panel covers the header that names the record, so it carries the
    // record's own name in its eyebrow (Drawer.drawerEyebrow).
    await gotoStaff(page, PARCEL);
    await page.getByRole('button', { name: 'Assign someone' }).click();

    await expect(page.getByRole('dialog', { name: 'Assign someone' }).locator('.eyebrow'))
      .toHaveText('Sy 214/2 · People');
  });

  test('filing somebody sends exactly what was typed, trimmed, against this record', async ({ page, world }) => {
    await gotoStaff(page, PARCEL);
    await page.getByRole('button', { name: 'Assign someone' }).click();
    await nameBox(page).fill('  Lakshmi Devi  ');
    await page.getByRole('button', { name: 'Caretaker' }).click();
    await page.getByLabel('Anything worth knowing').fill('  Holds the key  ');
    await assign(page).click();

    await expect.poll(() => world.calls('addPerson').length).toBe(1);
    expect(world.lastVars('addPerson')).toMatchObject({
      recordId: ID.parcel,
      personName: 'Lakshmi Devi',
      role: 'Caretaker',
      summary: 'Holds the key',
      arrangement: '',
      payLabel: '',
      payValue: '',
    });
  });

  test('a name on its own files a person with no role, because that is what was said', async ({ page, world }) => {
    // add_person requires only the name: "who someone is to this land is often
    // known long before what they are paid" (web360.py). So nothing is
    // pre-selected in the chip row and nothing is invented here.
    await gotoStaff(page, PARCEL);
    await page.getByRole('button', { name: 'Assign someone' }).click();
    await nameBox(page).fill('Lakshmi Devi');
    await assign(page).click();

    await expect.poll(() => world.calls('addPerson').length).toBe(1);
    expect(world.lastVars('addPerson')).toMatchObject({
      recordId: ID.parcel, personName: 'Lakshmi Devi', role: '', payLabel: '', payValue: '',
    });
  });

  test('pressing the chosen role again clears it rather than leaving it stuck on', async ({ page, world }) => {
    await gotoStaff(page, PARCEL);
    await page.getByRole('button', { name: 'Assign someone' }).click();
    await nameBox(page).fill('Lakshmi Devi');

    const caretaker = page.getByRole('button', { name: 'Caretaker' });
    await caretaker.click();
    await expect(caretaker).toHaveAttribute('aria-pressed', 'true');
    await caretaker.click();
    await expect(caretaker).toHaveAttribute('aria-pressed', 'false');

    await assign(page).click();
    await expect.poll(() => world.calls('addPerson').length).toBe(1);
    expect(world.lastVars('addPerson')).toMatchObject({ role: '' });
  });

  test('what they are owed is written in the shape the record reads it back in', async ({ page, world }) => {
    // pay_value is text, and the record's own monthly and seasonal totals are
    // read back OUT of it: _rupees() takes the digits before the slash, and the
    // split is on whether the value contains "month" or "season"
    // (web360.py). Written any other way the pay files fine and then appears in
    // neither figure on this screen's rail.
    await gotoStaff(page, PARCEL);
    await page.getByRole('button', { name: 'Assign someone' }).click();
    await nameBox(page).fill('Lakshmi Devi');
    await page.getByLabel('What they are owed').fill('12000');
    await assign(page).click();

    await expect.poll(() => world.calls('addPerson').length).toBe(1);
    expect(world.lastVars('addPerson')).toMatchObject({
      payLabel: 'Pay', payValue: '₹12,000 / month',
    });
  });

  test('a season instead of a month changes both the label and the value', async ({ page, world }) => {
    await gotoStaff(page, PARCEL);
    await page.getByRole('button', { name: 'Assign someone' }).click();
    await nameBox(page).fill('Ravi Kumar');
    await page.getByLabel('What they are owed').fill('42000');
    await page.getByRole('button', { name: 'a season' }).click();
    await assign(page).click();

    await expect.poll(() => world.calls('addPerson').length).toBe(1);
    expect(world.lastVars('addPerson')).toMatchObject({
      payLabel: 'They pay you', payValue: '₹42,000 / season',
    });
  });

  test('pressing Enter in the name box files the person, the way a form should', async ({ page, world }) => {
    // The drawer's body IS a <form> with a submit button (Drawer.tsx), so the
    // keyboard has to file somebody without ever reaching for the mouse.
    await gotoStaff(page, PARCEL);
    await page.getByRole('button', { name: 'Assign someone' }).click();
    await nameBox(page).fill('Lakshmi Devi');
    await nameBox(page).press('Enter');

    await expect.poll(() => world.calls('addPerson').length).toBe(1);
    expect(world.lastVars('addPerson')).toMatchObject({
      recordId: ID.parcel, personName: 'Lakshmi Devi', role: '',
    });
    await expect(nameBox(page)).toHaveCount(0);
  });

  test('a filed person closes the drawer, empties it and hands focus back to the button that opened it', async ({ page, world }) => {
    await gotoStaff(page, PARCEL);
    await expect(card(page, 'Ramana Rao')).toBeVisible();

    await page.getByRole('button', { name: 'Assign someone' }).click();
    await nameBox(page).fill('Lakshmi Devi');
    await assign(page).click();

    await expect(nameBox(page)).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Assign someone' })).toBeFocused();

    // And the list is asked for again, so the new person can arrive.
    await expect.poll(() => world.calls('people').length).toBeGreaterThan(1);

    // Re-opening starts blank rather than on the last person filed — the drawer
    // is unmounted when it closes, so there is no state to carry over.
    await page.getByRole('button', { name: 'Assign someone' }).click();
    await expect(nameBox(page)).toHaveValue('');
  });

  test('while the server is thinking the primary says so and will not fire twice', async ({ page, world }) => {
    world.set('addPerson', World.slow(1_500, 'w-person-new'));
    await gotoStaff(page, PARCEL);

    await page.getByRole('button', { name: 'Assign someone' }).click();
    await nameBox(page).fill('Lakshmi Devi');
    await assign(page).click();

    const working = page.getByRole('button', { name: 'Assigning…' });
    await expect(working).toBeVisible();
    await expect(working).toBeDisabled();

    await expect(nameBox(page)).toHaveCount(0);
    expect(world.calls('addPerson')).toHaveLength(1);
  });

  test('a person the server refuses keeps the typed name on screen and says the record may not be yours', async ({ page, world }) => {
    // add_person returns "" when the record is not the caller's
    // (services/api/src/web360.py).
    world.set('addPerson', '');
    await gotoStaff(page, PARCEL);

    await page.getByRole('button', { name: 'Assign someone' }).click();
    await nameBox(page).fill('Lakshmi Devi');
    await page.getByRole('button', { name: 'Caretaker' }).click();
    await assign(page).click();

    // Scoped to the alert: a refusal that is only drawn in red says nothing to
    // somebody who cannot see red.
    await expect(page.getByRole('alert'))
      .toHaveText('That person was not filed. This record may no longer be yours to edit.');
    await expect(nameBox(page)).toHaveValue('Lakshmi Devi');
    await expect(page.getByRole('button', { name: 'Caretaker' }))
      .toHaveAttribute('aria-pressed', 'true');
  });

  test('cancelling after a refusal takes the refusal away with the draft', async ({ page, world }) => {
    world.set('addPerson', '');
    await gotoStaff(page, PARCEL);

    await page.getByRole('button', { name: 'Assign someone' }).click();
    await nameBox(page).fill('Lakshmi Devi');
    await assign(page).click();
    await expect(page.getByText(/This record may no longer be yours to edit/)).toBeVisible();

    // Cancel is a deliberate press, so it closes at once — it is Escape and a
    // slipped click on the scrim that ask first (Drawer.tryClose).
    await page.getByRole('button', { name: 'Cancel' }).click();
    await page.getByRole('button', { name: 'Assign someone' }).click();

    // A stale refusal over an empty form is a message about a person who is not
    // on screen any more.
    await expect(nameBox(page)).toHaveValue('');
    await expect(page.getByText(/This record may no longer be yours to edit/)).toHaveCount(0);
  });

  test('a person the server never hears about keeps the typed name and says to try again', async ({ page, world }) => {
    world.set('addPerson', World.gqlError('record_people is not accepting writes'));
    await gotoStaff(page, PARCEL);

    await page.getByRole('button', { name: 'Assign someone' }).click();
    await nameBox(page).fill('Lakshmi Devi');
    await assign(page).click();

    await expect(page.getByText('That person was not filed. Try again.'))
      .toBeVisible();
    await expect(nameBox(page)).toHaveValue('Lakshmi Devi');

    // Nothing was filed, so the list is not re-read behind the message.
    expect(world.calls('people')).toHaveLength(1);
  });

  test('a second try after a refusal sends the same person again, without the old message under it', async ({ page, world }) => {
    world.set('addPerson', '');
    await gotoStaff(page, PARCEL);

    await page.getByRole('button', { name: 'Assign someone' }).click();
    await nameBox(page).fill('Lakshmi Devi');
    await assign(page).click();
    await expect(page.getByText(/This record may no longer be yours to edit/)).toBeVisible();

    world.set('addPerson', 'w-person-new');
    await assign(page).click();

    await expect(page.getByText(/This record may no longer be yours to edit/)).toHaveCount(0);
    await expect(nameBox(page)).toHaveCount(0);
    expect(world.calls('addPerson')).toHaveLength(2);
  });

  test('cancelling throws the draft away and gives the button its focus back', async ({ page, world }) => {
    await gotoStaff(page, PARCEL);
    await page.getByRole('button', { name: 'Assign someone' }).click();
    await nameBox(page).fill('Lakshmi Devi');
    await page.getByRole('button', { name: 'Cancel' }).click();

    await expect(nameBox(page)).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Assign someone' })).toBeFocused();
    expect(world.calls('addPerson')).toHaveLength(0);

    await page.getByRole('button', { name: 'Assign someone' }).click();
    await expect(nameBox(page)).toHaveValue('');
  });

  test('Escape on an untouched drawer closes it, and on a half-typed one asks first', async ({ page, world }) => {
    // Somebody dismissing a browser autofill dropdown with Escape must not lose
    // a half-filled form, which is the whole argument for Drawer's dirty check.
    await gotoStaff(page, PARCEL);
    await page.getByRole('button', { name: 'Assign someone' }).click();
    await page.keyboard.press('Escape');
    await expect(nameBox(page)).toHaveCount(0);

    await page.getByRole('button', { name: 'Assign someone' }).click();
    await nameBox(page).fill('Lakshmi Devi');
    await page.keyboard.press('Escape');

    // Still open, with a dialog on top asking about it.
    await expect(page.getByRole('dialog', { name: 'Discard this person?' })).toBeVisible();
    await page.getByRole('button', { name: 'Keep editing' }).click();
    await expect(nameBox(page)).toHaveValue('Lakshmi Devi');

    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Discard' }).click();
    await expect(nameBox(page)).toHaveCount(0);
    expect(world.calls('addPerson')).toHaveLength(0);
  });
});

// ── renaming ───────────────────────────────────────────────────────────

test.describe('renaming somebody', () => {
  test('renaming opens an editor with the name already in it, and Save refuses an emptied one', async ({ page }) => {
    await gotoStaff(page, PARCEL);
    await page.getByRole('button', { name: 'Rename Ramana Rao' }).click();

    const box = page.getByRole('textbox', { name: 'Rename Ramana Rao' });
    await expect(box).toHaveValue('Ramana Rao');
    await expect(box).toBeFocused();

    await box.fill('');
    await expect(page.getByRole('button', { name: 'Save' })).toBeDisabled();
    await box.fill('   ');
    await expect(page.getByRole('button', { name: 'Save' })).toBeDisabled();
  });

  test('saving a new name calls updatePerson for that person and nobody else', async ({ page, world }) => {
    await gotoStaff(page, PARCEL);
    await page.getByRole('button', { name: 'Rename Ramana Rao' }).click();
    await page.getByRole('textbox', { name: 'Rename Ramana Rao' }).fill('  Ramana Rao Naidu  ');
    await page.getByRole('button', { name: 'Save' }).click();

    await expect.poll(() => world.calls('updatePerson').length).toBe(1);
    expect(world.lastVars('updatePerson')).toMatchObject({
      personId: PERSON.watcher,
      personName: 'Ramana Rao Naidu',
      role: '',
      summary: '',
    });

    // The editor closes and the pencil takes the focus back.
    await expect(page.getByRole('textbox', { name: 'Rename Ramana Rao' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Rename Ramana Rao' })).toBeFocused();
    await expect.poll(() => world.calls('people').length).toBeGreaterThan(1);
  });

  test('a rename the server refuses keeps the editor open with what was typed in it', async ({ page, world }) => {
    world.set('updatePerson', false);
    await gotoStaff(page, PARCEL);

    await page.getByRole('button', { name: 'Rename Ramana Rao' }).click();
    await page.getByRole('textbox', { name: 'Rename Ramana Rao' }).fill('Ramana Rao Naidu');
    await page.getByRole('button', { name: 'Save' }).click();

    await expect(page.getByText('That name was not changed. The person may already be off this record.'))
      .toBeVisible();
    await expect(page.getByRole('textbox', { name: 'Rename Ramana Rao' })).toHaveValue('Ramana Rao Naidu');
  });

  test('a rename that cannot be sent keeps what was typed', async ({ page, world }) => {
    world.set('updatePerson', World.gqlError('record_people is read-only right now'));
    await gotoStaff(page, PARCEL);

    await page.getByRole('button', { name: 'Rename Ramana Rao' }).click();
    await page.getByRole('textbox', { name: 'Rename Ramana Rao' }).fill('Ramana Rao Naidu');
    await page.getByRole('button', { name: 'Save' }).click();

    await expect(page.getByText('That name could not be changed. What you typed is still here.'))
      .toBeVisible();
    await expect(page.getByRole('textbox', { name: 'Rename Ramana Rao' })).toHaveValue('Ramana Rao Naidu');
  });

  test('a rename that cannot be sent says why it could not be sent', async ({ page, world }) => {
    // DEFECT: apps/web/src/w360/pages/RecordPeople.tsx:122-123 catches the
    // failed write with a bare `} catch {` and raises `toast.bad(text)` with no
    // second argument, so the reason the server gave is dropped on the floor.
    // The toast is built to carry it — `bad: (text, error?)` prints it small
    // under the sentence (w360/Toast.tsx:51, :122) — and this module's own
    // standard says a failure with no reason "cannot be supported at all"
    // (w360/ui.tsx:675-679), which is why the Failed panel three inches away
    // prints its reason verbatim. Whoever is on the phone to the owner is owed
    // the same sentence here. The identical `} catch {` sits on the add at
    // :90 and on the removal at :141.
    test.fail();
    world.set('updatePerson', World.gqlError('record_people is read-only right now'));
    await gotoStaff(page, PARCEL);

    await page.getByRole('button', { name: 'Rename Ramana Rao' }).click();
    await page.getByRole('textbox', { name: 'Rename Ramana Rao' }).fill('Ramana Rao Naidu');
    await page.getByRole('button', { name: 'Save' }).click();

    await expect(page.getByText('That name could not be changed. What you typed is still here.'))
      .toBeVisible();
    await expect(page.getByText('record_people is read-only right now')).toBeVisible();
  });

  test('while a rename is in flight Save says so and refuses a second press', async ({ page, world }) => {
    world.set('updatePerson', World.slow(1_500, true));
    await gotoStaff(page, PARCEL);

    await page.getByRole('button', { name: 'Rename Ramana Rao' }).click();
    await page.getByRole('textbox', { name: 'Rename Ramana Rao' }).fill('Ramana Rao Naidu');
    await page.getByRole('button', { name: 'Save' }).click();

    const saving = page.getByRole('button', { name: 'Saving…' });
    await expect(saving).toBeVisible();
    await expect(saving).toBeDisabled();

    await expect(page.getByRole('textbox', { name: 'Rename Ramana Rao' })).toHaveCount(0);
    expect(world.calls('updatePerson')).toHaveLength(1);
  });

  test('cancelling a rename changes nothing and gives the pencil its focus back', async ({ page, world }) => {
    await gotoStaff(page, PARCEL);
    await page.getByRole('button', { name: 'Rename Ramana Rao' }).click();
    await page.getByRole('textbox', { name: 'Rename Ramana Rao' }).fill('Somebody Else');
    await page.getByRole('button', { name: 'Cancel' }).click();

    await expect(page.getByRole('textbox', { name: 'Rename Ramana Rao' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Rename Ramana Rao' })).toBeFocused();
    await expect(card(page, 'Ramana Rao')).toBeVisible();
    expect(world.calls('updatePerson')).toHaveLength(0);
  });

  test('only the person whose pencil was pressed gets an editor', async ({ page }) => {
    await gotoStaff(page, PARCEL);
    await page.getByRole('button', { name: 'Rename Ramana Rao' }).click();

    await expect(page.getByRole('textbox', { name: 'Rename Ramana Rao' })).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'Rename Sai Kumar' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Rename Sai Kumar' })).toBeVisible();
    // His own remove control stands down while he is being renamed: one row,
    // one question at a time (RecordPeople.tsx:311-357 is a single ternary).
    await expect(page.getByRole('button', { name: 'Remove Ramana Rao' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Remove Sai Kumar' })).toBeVisible();
  });

  test('pressing a second pencil moves the editor rather than opening another one', async ({ page }) => {
    // There is ONE draft for the whole list (RecordPeople.tsx:61), so a name
    // half-typed against one person is exactly what could arrive prefilled
    // against the next.
    await gotoStaff(page, PARCEL);
    await page.getByRole('button', { name: 'Rename Ramana Rao' }).click();
    await page.getByRole('textbox', { name: 'Rename Ramana Rao' }).fill('Somebody Else');

    await page.getByRole('button', { name: 'Rename Sai Kumar' }).click();

    await expect(page.getByRole('textbox', { name: 'Rename Ramana Rao' })).toHaveCount(0);
    await expect(page.getByRole('textbox', { name: 'Rename Sai Kumar' })).toHaveValue('Sai Kumar');
    // The abandoned draft went nowhere near Ramana Rao's card.
    await expect(card(page, 'Ramana Rao')).toBeVisible();
    await expect(page.getByText('Somebody Else')).toHaveCount(0);
  });
});

// ── taking somebody off ────────────────────────────────────────────────

/** Rewritten 28/09/2026. Taking somebody off used to be a Remove / Keep pair
 *  inside their card (and a copy of it in the one-line list). A card is now
 *  one button that opens the person's own drawer, and the drawer's "Remove
 *  from this property" asks in the shared confirmation, raised over the
 *  drawer (Drawer.tsx `over`, PropertyActions.tsx ConfirmDialog), naming the
 *  person and saying what goes: this property's row, nothing on any other. */
test.describe('taking somebody off', () => {
  const openPerson = async (page: Page, name: string) => {
    await page.getByRole('button', { name: `Open ${name}`, exact: true }).click();
    const drawer = page.getByRole('dialog', { name, exact: true });
    await expect(drawer).toBeVisible();
    return drawer;
  };
  const askToRemove = async (page: Page, name: string) => {
    const drawer = await openPerson(page, name);
    await drawer.getByRole('button', { name: 'Remove from this property' }).click();
    return { drawer, question: page.getByRole('dialog', { name: `Remove ${name}?` }) };
  };

  test('taking somebody off asks before it does anything, and says what goes', async ({ page, world }) => {
    await gotoStaff(page, PARCEL);
    const { question } = await askToRemove(page, 'Ramana Rao');

    await expect(question).toContainText(
      'Ramana Rao comes off this property only. The same person on any other property is not touched.');
    await expect(question.getByRole('button', { name: 'Remove', exact: true })).toBeVisible();
    // The safe choice is the one under the thumb.
    await expect(question.getByRole('button', { name: 'Cancel' })).toBeFocused();
    expect(world.calls('deletePerson')).toHaveLength(0);
  });

  test('Cancel on the question calls nothing and leaves their drawer as it was', async ({ page, world }) => {
    await gotoStaff(page, PARCEL);
    const { drawer, question } = await askToRemove(page, 'Ramana Rao');
    await question.getByRole('button', { name: 'Cancel' }).click();

    await expect(question).toHaveCount(0);
    await expect(drawer).toBeVisible();
    await expect(drawer.getByRole('button', { name: 'Remove from this property' })).toBeFocused();
    expect(world.calls('deletePerson')).toHaveLength(0);
  });

  test('confirming calls deletePerson for that person, closes the drawer and reads the list again', async ({ page, world }) => {
    await gotoStaff(page, PARCEL);
    const { drawer, question } = await askToRemove(page, 'Sai Kumar');
    await question.getByRole('button', { name: 'Remove', exact: true }).click();

    await expect.poll(() => world.calls('deletePerson').length).toBe(1);
    expect(world.lastVars('deletePerson')).toMatchObject({ personId: PERSON.tenant });
    await expect(question).toHaveCount(0);
    await expect(drawer).toHaveCount(0);
    await expect.poll(() => world.calls('people').length).toBeGreaterThan(1);
  });

  test('once somebody is off, the focus lands on the button that files the next one', async ({ page, world }) => {
    // The card that opened the drawer is the card that just went away, so it
    // cannot have focus back. Focus left on a detached node is focus back at
    // the top of the document for anybody driving this by keyboard, so the
    // drawer's fallback is the head's "Assign someone" (RecordPeople.tsx).
    world.set('people', () => (world.calls('deletePerson').length
      ? peopleView({ count: 1, people: [person({ id: PERSON.watcher, name: 'Ramana Rao' })] })
      : peopleView({
        count: 2,
        people: [
          person({ id: PERSON.watcher, name: 'Ramana Rao' }),
          person({ id: PERSON.tenant, name: 'Sai Kumar', role: 'Tenant farmer' }),
        ],
      })));
    await gotoStaff(page, PARCEL);
    const { question } = await askToRemove(page, 'Sai Kumar');
    await question.getByRole('button', { name: 'Remove', exact: true }).click();

    await expect.poll(() => world.calls('deletePerson').length).toBe(1);
    await expect(card(page, 'Sai Kumar')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Assign someone' })).toBeFocused();
  });

  test('a removal the server refuses leaves the person and the question standing', async ({ page, world }) => {
    world.set('deletePerson', false);
    await gotoStaff(page, PARCEL);
    const { question } = await askToRemove(page, 'Ramana Rao');
    await question.getByRole('button', { name: 'Remove', exact: true }).click();

    await expect(question.getByRole('alert'))
      .toHaveText('That person was not removed. They may already be off this property.');
    await expect(question.getByRole('button', { name: 'Remove', exact: true })).toBeVisible();
    await expect(card(page, 'Ramana Rao')).toHaveCount(1);
  });

  test('a removal that cannot be sent says they are still filed here', async ({ page, world }) => {
    world.set('deletePerson', World.gqlError('the people store is refusing writes'));
    await gotoStaff(page, PARCEL);
    const { question } = await askToRemove(page, 'Ramana Rao');
    await question.getByRole('button', { name: 'Remove', exact: true }).click();

    await expect(question.getByRole('alert'))
      .toHaveText('That person could not be removed. They are still filed here.');
    await expect(card(page, 'Ramana Rao')).toHaveCount(1);
  });

  test('while a removal is in flight the question says so and refuses a second press', async ({ page, world }) => {
    world.set('deletePerson', World.slow(1_500, true));
    await gotoStaff(page, PARCEL);
    const { drawer, question } = await askToRemove(page, 'Ramana Rao');
    await question.getByRole('button', { name: 'Remove', exact: true }).click();

    const working = question.getByRole('button', { name: 'Working…' });
    await expect(working).toBeVisible();
    await expect(working).toBeDisabled();
    await expect(question).toHaveAttribute('aria-busy', 'true');

    // And it all closes only once the server has answered.
    await expect(drawer).toHaveCount(0);
    expect(world.calls('deletePerson')).toHaveLength(1);
  });

  test('somebody on the one-line list can be taken off from there too', async ({ page, world }) => {
    await gotoStaff(page, PARCEL);
    const { question } = await askToRemove(page, 'Venkat Reddy');
    await question.getByRole('button', { name: 'Remove', exact: true }).click();

    await expect.poll(() => world.calls('deletePerson').length).toBe(1);
    expect(world.lastVars('deletePerson')).toMatchObject({ personId: PERSON.brother });
  });

  test('the question is about one person, raised over their drawer, and the page behind cannot be reached', async ({ page }) => {
    await gotoStaff(page, PARCEL);
    const { question } = await askToRemove(page, 'Ramana Rao');

    await expect(question).toHaveAttribute('aria-modal', 'true');
    await expect(page.getByRole('dialog', { name: 'Remove Sai Kumar?' })).toHaveCount(0);
    // Tab stays inside the question while it is up.
    await page.keyboard.press('Tab');
    await expect(question.getByRole('button', { name: 'Remove', exact: true })).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(question.getByRole('button', { name: 'Cancel' })).toBeFocused();
  });
});

// ── nobody, still coming, and not coming at all ────────────────────────

test.describe('nobody, still coming, failed', () => {
  test('a record with nobody on it says so and offers the one thing there is to do', async ({ page }) => {
    await gotoStaff(page, NOBODY);

    await expect(page.getByText('No caretakers or staff recorded')).toBeVisible();
    await expect(page.getByRole('article')).toHaveCount(0);

    // The headcount is honest about the zero rather than hiding the line; the
    // pay figures belong to the rail, which waits for somebody with pay.
    await expect(page.locator('header.sechead p.note')).toHaveText('0 people');
    await expect(page.getByRole('button', { name: 'Assign someone' })).toBeVisible();

    // The footnote is about a list, and there is no list — the one sentence on
    // an empty record is the empty state's own.
    await expect(page.getByText(/Who can see this record is granted as a link/)).toHaveCount(0);
  });

  test('an empty record offers one way to assign somebody, the head’s, and it opens the drawer', async ({ page }) => {
    // The empty state used to carry a second "Assign someone" under the
    // head's: one flow belongs on the screen once, and a second filled button
    // was the viewport's third fill (design.md § App-surface rules).
    await gotoStaff(page, NOBODY);
    await expect(page.getByText('No caretakers or staff recorded')).toBeVisible();
    const assign = page.getByRole('button', { name: 'Assign someone' });
    await expect(assign).toHaveCount(1);
    await assign.click();

    await expect(page.getByRole('dialog', { name: 'Assign someone' })).toBeVisible();
    await expect(page.getByLabel('Their name')).toBeFocused();
  });

  test('filing on an empty record hands focus back to the button that asked', async ({ page, world }) => {
    // The empty state goes away with the person it files, so focus must go
    // somewhere that is still on the page — the head's button, which is what
    // opened the drawer. The answer has to grow for the empty state to go
    // away, so it grows: empty on the first read, one person after the write.
    let filed = false;
    world.set('people', () => (filed
      ? peopleView({ count: 1, people: [person({ id: 'w-person-new', name: 'Lakshmi Devi' })] })
      : peopleView()));
    world.set('addPerson', () => { filed = true; return 'w-person-new'; });

    await gotoStaff(page, NOBODY);
    const assign = page.getByRole('button', { name: 'Assign someone' });
    await assign.click();
    await page.getByLabel('Their name').fill('Lakshmi Devi');
    await page.getByRole('button', { name: 'Assign them' }).click();

    await expect.poll(() => world.calls('addPerson').length).toBe(1);
    await expect(page.getByLabel('Their name')).toHaveCount(0);
    await expect(card(page, 'Lakshmi Devi')).toBeVisible();
    await expect(assign).toHaveCount(1);
    await expect(assign).toBeFocused();
  });

  test('an empty record draws no money column at all', async ({ page }) => {
    // Nobody with pay on file and no payment recorded: the rail has nothing
    // true to say, so there is no rail, rather than a wallet balance and a
    // "nothing paid" line beside an empty list (RecordPeople.tsx `hasRail`).
    await gotoStaff(page, NOBODY);
    await expect(page.getByText('No caretakers or staff recorded')).toBeVisible();

    await expect(asideCard(page, 'Payments to people')).toHaveCount(0);
    await expect(asideCard(page, 'Recent payments')).toHaveCount(0);
    await expect(page.locator('.split.no-rail')).toHaveCount(1);
  });

  test('while the people are still coming the screen holds its shape and claims nothing', async ({ page, world }) => {
    world.set('people', World.never());
    await gotoStaff(page, PARCEL);

    await expect(page.getByRole('main').getByRole('status')).toContainText('Loading…');
    // The heading, the side you are on and the tab strip belong to the
    // record, which has landed.
    await expect(page.getByRole('heading', { level: 2, name: 'People', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Caretakers & staff', exact: true }))
      .toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByRole('navigation', { name: 'This property' })).toBeVisible();

    // And nothing is claimed about who is on this land, either way.
    await expect(page.getByText('No caretakers or staff recorded')).toHaveCount(0);
    await expect(page.getByRole('article')).toHaveCount(0);
    await expect(page.getByText('Payments to people')).toHaveCount(0);
    // Not even a zero: the headcount waits for the people rather than
    // printing "0 people" over a record with three people on it.
    await expect(page.locator('header.sechead p.note')).toHaveCount(0);
    await expect(page.getByText(/out, each month/)).toHaveCount(0);
  });

  test('a people read that fails says so in the server own words, with a way to try again', async ({ page, world }) => {
    world.set('people', World.gqlError('the people store is down'));
    await gotoStaff(page, PARCEL);

    const failed = page.getByRole('alert');
    await expect(failed).toContainText('The people on this property did not load');
    await expect(failed).toContainText('Check your connection and try again.');
    await expect(failed).toContainText('the people store is down');
    await expect(failed.getByRole('button', { name: 'Try again' })).toBeVisible();

    // A failed read must not read as a record with nobody on it.
    await expect(page.getByText('No caretakers or staff recorded')).toHaveCount(0);
  });

  test.describe('when the gateway itself answers', () => {
    // The browser logs "Failed to load resource: 503" itself, twice — the
    // query is tried once and retried once (main.tsx:43). Provoking that is
    // the point of this test, so the console guard is stood down for it alone.
    test.use({ allowConsole: true });

    test('a people read the gateway refuses fails the same way, with the transport reason', async ({ page, world }) => {
      world.set('people', World.httpError(503));
      await gotoStaff(page, PARCEL);

      const failed = page.getByRole('alert');
      await expect(failed).toContainText('The people on this property did not load');
      await expect(failed).toContainText('GraphQL HTTP 503');
      await expect(page.getByText('No caretakers or staff recorded')).toHaveCount(0);
    });
  });

  test('trying again once the server is back draws the people', async ({ page, world }) => {
    world.set('people', World.gqlError('the people store is down'));
    await gotoStaff(page, PARCEL);
    await expect(page.getByText('The people on this property did not load')).toBeVisible();

    world.set('people', peopleView({
      count: 1, people: [person({ id: PERSON.watcher, name: 'Ramana Rao', role: 'Watchman' })],
    }));
    await page.getByRole('button', { name: 'Try again' }).click();

    await expect(card(page, 'Ramana Rao')).toBeVisible();
    await expect(page.getByText('The people on this property did not load')).toHaveCount(0);
  });

  test('a try again that fails again says so rather than going quiet', async ({ page, world }) => {
    // "if the read fails again the screen is still here saying so — which is
    // itself the answer" (w360/ui.tsx:699-701). A button that returns to rest
    // with nothing changed is the point at which somebody gives up.
    world.set('people', World.gqlError('the people store is down'));
    await gotoStaff(page, PARCEL);
    await expect(page.getByText('The people on this property did not load')).toBeVisible();
    const before = world.calls('people').length;

    await page.getByRole('button', { name: 'Try again' }).click();

    await expect.poll(() => world.calls('people').length).toBeGreaterThan(before);
    const failed = page.getByRole('alert');
    await expect(failed).toContainText('The people on this property did not load');
    await expect(failed).toContainText('the people store is down');
    await expect(failed.getByRole('button', { name: 'Try again' })).toBeEnabled();
  });

  test('a refresh that fails does not take the people already on screen away', async ({ page, world }) => {
    await gotoStaff(page, PARCEL);
    await expect(card(page, 'Ramana Rao')).toBeVisible();

    // The refetch after a successful write is the one that lands here.
    world.set('people', World.gqlError('the people store went down mid-edit'));
    await page.getByRole('button', { name: 'Rename Ramana Rao' }).click();
    await page.getByRole('textbox', { name: 'Rename Ramana Rao' }).fill('Ramana Rao Naidu');
    await page.getByRole('button', { name: 'Save' }).click();

    await expect.poll(() => world.calls('people').length).toBeGreaterThan(1);
    await expect(card(page, 'Ramana Rao')).toBeVisible();
    await expect(card(page, 'Sai Kumar')).toBeVisible();
    await expect(page.getByText('The people on this property did not load')).toHaveCount(0);
  });

  test('a record that is not in your portfolio is never asked who looks after it', async ({ page, world }) => {
    await page.goto(PEOPLE_OF(ID.missing));

    await expect(page.getByRole('heading', { name: "This property isn't in your account" }))
      .toBeVisible();
    expect(world.asked('people')).toBe(false);
  });

  test('a record that cannot be read says the record failed, not that nobody looks after it', async ({ page, world }) => {
    world.set('record', World.gqlError('the record store is down'));
    await page.goto(PARCEL);

    await expect(page.getByText('This property did not load')).toBeVisible();
    await expect(page.getByText('Caretakers & staff')).toHaveCount(0);
    expect(world.asked('people')).toBe(false);
  });

  test('the hanger stacks on a narrow screen without losing the money column @phone', async ({ page }) => {
    await gotoStaff(page, PARCEL);

    await expect(card(page, 'Ramana Rao')).toBeVisible();
    await expect(asideCard(page, 'Payments to people')).toBeVisible();
    await expect(asideCard(page, 'Recent payments')).toBeVisible();

    // Nothing may push the page sideways at any width.
    const overflow = await page.evaluate(() =>
      document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  });
});

// ── the other person editor: /legacy/groups ────────────────────────────

/**
 * PersonDialog (apps/web/src/pages/families/PersonDialog.tsx) is the OTHER
 * place this app files a person. /app/groups is the W360 screen
 * (w360/pages/Groups.tsx), which opens this same PersonDialog lazily from
 * "Add a person" (specs/30-groups.spec.ts); these tests drive it through
 * /legacy/groups, whose families hooks read the legacy GraphQL surface
 * described below. It shares nothing with the hanger above —
 * it is MUI, it asks for eleven things the hanger's two-field form does not
 * (a relationship, a share, an Aadhaar, a guardian, a spouse), and it talks to
 * the LEGACY GraphQL surface: `{ groups { … } }`, not `{ web { … } }`.
 *
 * The sealed world cannot route those documents. It keys on `web { <field>`
 * (fixtures/world.ts rootField) and answers anything else with a 400, which
 * the families hooks swallow into an EMPTY sample
 * (apps/web/src/data/useLiveOrSample.ts:14) — no group, so no member table and
 * no dialog to open. `legacyFamilies()` therefore answers the two documents
 * this screen actually reads, registered on the page AFTER the seal so
 * Playwright consults it first, and hands every `web {` document back to the
 * world with route.fallback(). None of this belongs in fixtures/seed.ts: the
 * legacy surface is one screen wide and no other spec opens it.
 */
const GROUP_ID = 'w-grp-family';

const GROUP: Row = {
  id: GROUP_ID, ownerUserId: 'u-1', type: 'family', name: 'Telukutla family',
  description: 'Who inherits the Katragunta land', myRole: 'Head',
  memberCount: 1, landCount: 1, totalExtent: 4.3, totalShare: 0,
  createdAt: '2026-01-04T00:00:00Z',
};

/** Every field MEMBER_FIELDS selects (pages/families/familiesData.ts:171). */
function member(over: Row = {}): Row {
  return {
    id: 'w-mem-brother', ownerUserId: 'u-1', name: 'Venkat Reddy', relation: 'brother',
    gender: 'male', dob: '1979-04-02', phone: '+91 98480 11111', email: '',
    bio: '', photo: '', groupId: GROUP_ID, role: 'Brother', isSelf: false,
    fatherId: '', motherId: '', spouseId: '', isBeneficiary: false, sharePct: 0,
    kind: '', status: '', inviteStatus: '', inviteToken: '',
    phoneVerified: false, emailVerified: false, parcelId: '', presentAddress: '',
    aadhaarMasked: '', isMinor: false, guardianName: '', guardianContact: '',
    maritalStatus: '', spouseName: '', spouseContact: '', spouseStatus: '',
    createdAt: '2026-02-01T00:00:00Z',
    ...over,
  };
}

interface Legacy {
  /** The variables of every addMember / updateMember the dialog sent. */
  saved: Row[];
  /** Any legacy document this helper did not recognise — asserted empty, so a
   *  new query on this screen shows up as a named failure rather than as a
   *  panel that quietly went blank. */
  unanswered: string[];
}

interface LegacyOpts {
  /** Fields to change on the seeded group — `type` is the interesting one,
   *  because a group with no family tree asks for a role, not a relation. */
  group?: Row;
  /** Refuse every save with this reason, the way the server refuses one
   *  (services/api/src/main.py:1998 and its neighbours all raise ValueError,
   *  which reaches the browser as a GraphQL `errors[]`). */
  refuse?: string;
  /** Hold the save open, to catch the dialog while it is in flight. */
  saveDelayMs?: number;
}

/** The address `me { address }` answers with, and therefore the one "same as
 *  mine" has to file. */
const MY_ADDRESS = 'Katragunta, Markapur, Prakasam';

async function legacyFamilies(page: Page, members: Row[] = [], opts: LegacyOpts = {}): Promise<Legacy> {
  const out: Legacy = { saved: [], unanswered: [] };
  await page.route(/\/api\/gateway\/pattadar\/graphql/, async (route) => {
    const body = JSON.parse(route.request().postData() || '{}') as
      { query?: string; variables?: Row };
    const q = body.query ?? '';
    if (/\bweb\s*\{/.test(q)) return route.fallback();   // the W360 surface is the world's
    // Linking a kept Aadhaar card is a root-schema mutation the world answers
    // as `root.linkAadhaarCard`, so a test can see and refuse it there.
    if (/\blinkAadhaarCard\s*\(/.test(q)) return route.fallback();

    let data: Row = {};
    if (/\bgroups\s*\{/.test(q)) {
      data = { groups: [{ ...GROUP, ...opts.group }] };
    } else if (/\bmembers\s*\(/.test(q)) {
      data = {
        members,
        parcels: [{ id: 'w-pcl-214-2', surveyNo: '214', subdivision: '2' }],
        me: { address: MY_ADDRESS },
      };
    } else if (/\b(addMember|updateMember)\s*\(/.test(q)) {
      out.saved.push(body.variables ?? {});
      if (opts.saveDelayMs) await new Promise((r) => setTimeout(r, opts.saveDelayMs));
      if (opts.refuse) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ data: null, errors: [{ message: opts.refuse }] }),
        });
      }
      const saved = {
        id: 'w-mem-new', inviteToken: '', isMinor: false,
        guardianContact: '', phone: '', email: '',
      };
      data = /\baddMember\s*\(/.test(q) ? { addMember: saved } : { updateMember: saved };
    } else {
      out.unanswered.push(q.slice(0, 120));
    }
    return route.fulfill({
      status: 200, contentType: 'application/json', body: JSON.stringify({ data }),
    });
  });
  return out;
}

/** A file the upload panel will accept. Only its TYPE is read on the way in,
 *  and a PDF keeps it off the image path, which wants a real decoder in the
 *  page (PersonDialog.tsx:196 cropSquareDataUrl). */
const AADHAAR_SCAN = {
  name: 'aadhaar.pdf',
  mimeType: 'application/pdf',
  buffer: Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n'),
};

/** Opens /legacy/groups on the seeded family and presses Add member. */
async function openPersonDialog(page: Page): Promise<void> {
  await page.goto('/legacy/groups');
  await expect(page.getByRole('heading', { name: 'Families & Groups' })).toBeVisible();
  await page.getByRole('button', { name: 'Add member' }).click();
  await expect(page.getByRole('heading', { name: 'Add person' })).toBeVisible();
}

test.describe('the other person editor, on the previous interface', () => {
  // Vite serves the legacy bundle — the whole of MUI — cold on the first
  // visit, and this suite shares the founder's dev server.
  test.beforeEach(() => { test.slow(); });

  test('the group screen the redesign has not reached still opens its member table', async ({ page }) => {
    const legacy = await legacyFamilies(page, [member()]);
    await page.goto('/legacy/groups');

    await expect(page.getByRole('heading', { name: 'Families & Groups' })).toBeVisible();
    await expect(page.getByText('Telukutla family').first()).toBeVisible();
    await expect(page.getByRole('cell', { name: 'Venkat Reddy' })).toBeVisible();
    // A family is a tree, so the column beside the name is the relationship —
    // and the row carries the one this member actually has (GroupDetail.tsx:424).
    await expect(page.getByRole('columnheader', { name: 'Relationship' })).toBeVisible();
    await expect(page.getByRole('cell', { name: 'Brother' })).toBeVisible();
    await expect(page.getByRole('cell', { name: '+91 98480 11111' })).toBeVisible();
    // Nobody has been made an heir, and the header says so before anyone asks.
    await expect(page.getByText('0 heirs ·')).toBeVisible();
    await expect(page.getByText('0% allocated')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Add member' })).toBeVisible();
    expect(legacy.unanswered, 'this screen reads only groups and members').toEqual([]);
  });

  test('a person with no name is not filed, and the field says which one is missing', async ({ page }) => {
    const legacy = await legacyFamilies(page);
    await openPersonDialog(page);

    await page.getByRole('button', { name: 'Add', exact: true }).click();
    await expect(page.getByText('Name is required')).toBeVisible();
    // The dialog stays open with everything still in it.
    await expect(page.getByRole('heading', { name: 'Add person' })).toBeVisible();
    expect(legacy.saved).toHaveLength(0);
  });

  test('a person with a name and a relationship is filed with exactly what was typed', async ({ page }) => {
    const legacy = await legacyFamilies(page);
    await openPersonDialog(page);

    await page.getByLabel('Full name').fill('Lakshmi Devi');
    await page.getByRole('combobox', { name: 'Relationship to you' }).click();
    await page.getByRole('option', { name: 'Daughter', exact: true }).click();
    await page.getByRole('button', { name: 'Add', exact: true }).click();

    await expect.poll(() => legacy.saved.length).toBe(1);
    expect(legacy.saved[0]).toMatchObject({
      groupId: GROUP_ID,
      name: 'Lakshmi Devi',
      relation: 'daughter',
      // A family group has relationships rather than roles, so the role is the
      // relationship (familiesData.ts groupTypeDef hasTree).
      role: 'daughter',
      isBeneficiary: false,
      sharePct: 0,
      // Nobody was asked for a share, so nothing is claimed about one.
      kind: 'legalheir',
    });
    await expect(page.getByRole('heading', { name: 'Add person' })).toHaveCount(0);
    // And the screen says it happened, rather than closing on silence.
    await expect(page.getByText('Added')).toBeVisible();
  });

  test('a partnership asks what somebody does, not how they are related', async ({ page }) => {
    // groupTypeDef(type).hasTree is the whole switch (familiesData.ts:65): a
    // family has relations and a partnership has roles, and the dialog that
    // asked a business partner whether he is your son is the reason for it.
    const legacy = await legacyFamilies(page, [], {
      group: { type: 'partnership', name: 'Reddy & Sons', myRole: 'Managing Partner' },
    });
    await page.goto('/legacy/groups');
    await expect(page.getByRole('heading', { name: 'Families & Groups' })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'Role' })).toBeVisible();

    await page.getByRole('button', { name: 'Add member' }).click();
    await expect(page.getByRole('heading', { name: 'Add person' })).toBeVisible();
    await expect(page.getByRole('combobox', { name: 'Role' })).toBeVisible();
    await expect(page.getByRole('combobox', { name: 'Relationship to you' })).toHaveCount(0);

    await page.getByLabel('Full name').fill('Suresh Babu');
    await page.getByRole('combobox', { name: 'Role' }).click();
    await page.getByRole('option', { name: 'Managing Partner', exact: true }).click();
    await page.getByRole('button', { name: 'Add', exact: true }).click();

    await expect.poll(() => legacy.saved.length).toBe(1);
    expect(legacy.saved[0]).toMatchObject({
      name: 'Suresh Babu', role: 'Managing Partner', relation: '',
    });
  });

  test('a person who lives where I live is filed with my address, not a blank one', async ({ page }) => {
    const legacy = await legacyFamilies(page);
    await openPersonDialog(page);

    await page.getByLabel('Full name').fill('Lakshmi Devi');
    // By role rather than by label: the checkbox beside it is *named* "Present
    // address same as mine", which getByLabel matches as a substring too.
    await page.getByRole('textbox', { name: 'Present address' }).fill('Somewhere else entirely');
    await page.getByRole('checkbox', { name: 'Present address same as mine' }).check();
    // The box replaces the field rather than sitting beside it, so there is
    // only ever one answer on screen (PersonDialog.tsx:530).
    await expect(page.getByRole('textbox', { name: 'Present address' })).toHaveCount(0);

    await page.getByRole('button', { name: 'Add', exact: true }).click();
    await expect.poll(() => legacy.saved.length).toBe(1);
    expect(legacy.saved[0]).toMatchObject({ presentAddress: MY_ADDRESS });
  });

  test('an heir reachable only by phone is filed with the dial code on the front of it', async ({ page }) => {
    const legacy = await legacyFamilies(page);
    await openPersonDialog(page);

    await page.getByLabel('Full name').fill('Lakshmi Devi');
    await page.getByLabel('Phone').fill('98480 22222');
    await page.getByRole('switch', { name: /Is a beneficiary/ }).check();
    await page.getByRole('button', { name: 'Add', exact: true }).click();

    await expect.poll(() => legacy.saved.length).toBe(1);
    // joinPhone (countryCodes.ts:93) is what makes a number dialable from
    // anywhere; a bare "9848022222" in the column is a number nobody can ring.
    expect(legacy.saved[0]).toMatchObject({
      name: 'Lakshmi Devi', phone: '+91 9848022222', email: '', isBeneficiary: true,
    });
    // A phone IS a way of reaching them, so the beneficiary rule is satisfied.
    await expect(page.getByText('Add a mobile number or email so this beneficiary can be verified'))
      .toHaveCount(0);
  });

  test('a full Aadhaar is filed as twelve bare digits, however it was typed', async ({ page }) => {
    const legacy = await legacyFamilies(page);
    await openPersonDialog(page);

    await page.getByLabel('Full name').fill('Lakshmi Devi');
    await page.getByLabel('Email').fill('lakshmi@example.com');
    await page.getByRole('switch', { name: /Is a beneficiary/ }).check();
    await page.getByLabel('Aadhaar (KYC)').fill('123456789012');
    // Typed in one run, read back in fours — the grouping is for the eye only.
    await expect(page.getByLabel('Aadhaar (KYC)')).toHaveValue('1234 5678 9012');

    await page.getByRole('button', { name: 'Add', exact: true }).click();
    await expect.poll(() => legacy.saved.length).toBe(1);
    expect(legacy.saved[0]).toMatchObject({ aadhaar: '123456789012' });
  });

  test('a person the server refuses stays on screen with the server own reason over the form', async ({ page }) => {
    const legacy = await legacyFamilies(page, [], {
      refuse: 'Shares for this group would exceed 100% (80.0% already allocated). Lower the share.',
    });
    await openPersonDialog(page);

    await page.getByLabel('Full name').fill('Lakshmi Devi');
    await page.getByLabel('Email').fill('lakshmi@example.com');
    await page.getByRole('switch', { name: /Is a beneficiary/ }).check();
    await page.getByLabel('Share %').fill('40');
    await page.getByRole('button', { name: 'Add', exact: true }).click();

    // GroupDetail.tsx:294 does not catch this, so it lands in the dialog's own
    // catch (PersonDialog.tsx:262) and is printed verbatim — which is the only
    // way the owner learns WHICH share is already spoken for.
    await expect(page.getByRole('alert')).toContainText('Shares for this group would exceed 100%');
    await expect(page.getByRole('alert')).toContainText('80.0% already allocated');
    await expect(page.getByRole('heading', { name: 'Add person' })).toBeVisible();
    await expect(page.getByLabel('Full name')).toHaveValue('Lakshmi Devi');
    expect(legacy.saved, 'it was sent, and it was refused').toHaveLength(1);
  });

  test('while the server is thinking the dialog says so and will not file twice', async ({ page }) => {
    const legacy = await legacyFamilies(page, [], { saveDelayMs: 1_500 });
    await openPersonDialog(page);

    await page.getByLabel('Full name').fill('Lakshmi Devi');
    await page.getByRole('button', { name: 'Add', exact: true }).click();

    const saving = page.getByRole('button', { name: 'Saving…' });
    await expect(saving).toBeVisible();
    await expect(saving).toBeDisabled();
    // Cancel goes with it: half a person is not something to walk away from.
    await expect(page.getByRole('button', { name: 'Cancel' })).toBeDisabled();

    await expect(page.getByRole('heading', { name: 'Add person' })).toHaveCount(0);
    expect(legacy.saved).toHaveLength(1);
  });

  test('Aadhaar scanning returns only a mask and uploads the card only after opt-in', async ({ page, world }) => {
    // The reading is an ASYNC read (api/client.ts:33): the POST goes to
    // `-async` and the answer is collected from import-status, so both have to
    // be answered here — the seed only knows the import-* pair.
    world.route(/\/api\/gateway\/storage\/files\?/, () => ({
      json: { id: 'file-aadhaar', currentVersionId: 'ver-aadhaar' },
    }));
    world.route(/\/api\/gateway\/pattadar\/extract-aadhaar-async/, () => ({ json: { job: 'w-aadhaar' } }));
    world.route(/\/api\/gateway\/pattadar\/import-status\//, () => ({
      json: {
        state: 'done',
        fields: {
          name: 'Lakshmi Devi', dob: '1985-03-14', gender: 'Female',
          aadhaarMasked: 'XXXX-XXXX-9012', aadhaarCandidateId: 'candidate-opaque',
          address: 'Katragunta, Markapur',
        },
      },
    }));
    world.set('root.linkAadhaarCard', true);
    await legacyFamilies(page);
    await openPersonDialog(page);
    await page.getByRole('switch', { name: /Is a beneficiary/ }).check();

    const input = page.getByRole('dialog').locator('input[type="file"]').first();
    await input.setInputFiles(AADHAAR_SCAN);

    await expect(page.getByLabel('Full name')).toHaveValue('Lakshmi Devi');
    await expect(page.getByLabel('Date of birth')).toHaveValue('1985-03-14');
    await expect(page.getByRole('combobox', { name: 'Gender' })).toHaveText('Female');
    await expect(page.getByLabel('Aadhaar (KYC)')).toHaveValue('');
    await expect(page.getByText(/Read securely as XXXX XXXX 9012\./)).toBeVisible();
    // What the scan read is shown back read-only, the date in DD/MM/YYYY and
    // the number only as its last four digits.
    const summary = page.getByRole('group', { name: 'Read from the card' });
    await expect(summary).toContainText('Lakshmi Devi');
    await expect(summary).toContainText('14/03/1985');
    await expect(summary).toContainText('XXXX XXXX 9012');
    await expect(page.getByRole('textbox', { name: 'Present address' }))
      .toHaveValue('Katragunta, Markapur');
    await expect(page.getByText(/the card was not retained/)).toBeVisible();
    expect(world.restCalls(/storage\/files/)).toHaveLength(0);
    expect(world.calls('root.linkAadhaarCard')).toHaveLength(0);

    await page.getByRole('checkbox', { name: /Also keep the original card/ }).check();
    await input.setInputFiles(AADHAAR_SCAN);
    // It is filed in Documents under the person's own folder, not a Drive
    // nobody can open from here.
    await expect(page.getByText(/the card goes to Documents › Lakshmi Devi › Aadhaar when you save/))
      .toBeVisible();
    const uploads = world.restCalls(/storage\/files/);
    expect(uploads).toHaveLength(1);
    // The card is filed under the safe name, never the name it was picked as.
    expect(uploads[0].body).toContain('filename="Aadhaar card.pdf"');
    expect(uploads[0].body).not.toContain('filename="aadhaar.pdf"');
    const links = world.calls('root.linkAadhaarCard');
    expect(links).toHaveLength(1);
    // What the file is travels with the link, so Documents can preview it.
    expect(links[0].vars).toEqual({
      candidateId: 'candidate-opaque', nodeId: 'file-aadhaar', versionId: 'ver-aadhaar',
      mimeType: 'application/pdf', sizeBytes: AADHAAR_SCAN.buffer.length,
    });
    expect(links[0].at).toBeGreaterThan(uploads[0].at);
    // A card that linked is kept: nothing is sent to Trash.
    expect(world.restCalls(/storage\/nodes\//).filter((c) => c.method === 'DELETE')).toHaveLength(0);

    // Nothing on the page is a full twelve-digit number.
    const text = await page.locator('body').innerText();
    expect(text).not.toMatch(/\d{4}[\s-]?\d{4}[\s-]?\d{4}/);
  });

  test('a kept Aadhaar card that cannot be linked is not kept, and its upload goes to Trash', async ({ page, world }) => {
    world.route(/\/api\/gateway\/storage\/files\?/, () => ({
      json: { id: 'file-aadhaar', currentVersionId: 'ver-aadhaar' },
    }));
    world.route(/\/api\/gateway\/pattadar\/extract-aadhaar-async/, () => ({ json: { job: 'w-aadhaar' } }));
    world.route(/\/api\/gateway\/pattadar\/import-status\//, () => ({
      json: {
        state: 'done',
        fields: { name: 'Lakshmi Devi', aadhaarMasked: 'XXXX-XXXX-9012', aadhaarCandidateId: 'candidate-opaque' },
      },
    }));
    world.set('root.linkAadhaarCard', World.gqlError('The Aadhaar reading is no longer available'));
    await legacyFamilies(page);
    await openPersonDialog(page);

    await page.getByRole('checkbox', { name: /Also keep the original card/ }).check();
    await page.getByRole('dialog').locator('input[type="file"]').first().setInputFiles(AADHAAR_SCAN);

    await expect(page.getByText(
      'The details were read, but the card could not be filed in Documents, so it was not kept')).toBeVisible();
    expect(world.restCalls(/storage\/files/)).toHaveLength(1);
    expect(world.calls('root.linkAadhaarCard')).toHaveLength(1);
    // The stored bytes nothing points at are moved to Trash (recoverable),
    // and only that one node.
    const trashed = world.restCalls(/storage\/nodes\//).filter((c) => c.method === 'DELETE');
    expect(trashed.map((c) => c.path)).toEqual(['/api/gateway/storage/nodes/file-aadhaar']);
  });

  test.describe('a refused upload', () => {
  // The refusal is the point: the browser logs the non-2xx it was answered.
  test.use({ allowConsole: true });

  test('a ticked Aadhaar card the storage refuses says so and files nothing', async ({ page, world }) => {
    world.route(/\/api\/gateway\/storage\/files\?/, () => ({ status: 413, json: { error: 'too large' } }));
    world.route(/\/api\/gateway\/pattadar\/extract-aadhaar-async/, () => ({ json: { job: 'w-aadhaar' } }));
    world.route(/\/api\/gateway\/pattadar\/import-status\//, () => ({
      json: {
        state: 'done',
        fields: { name: 'Lakshmi Devi', aadhaarMasked: 'XXXX-XXXX-9012', aadhaarCandidateId: 'candidate-opaque' },
      },
    }));
    world.set('root.linkAadhaarCard', true);
    await legacyFamilies(page);
    await openPersonDialog(page);

    await page.getByRole('checkbox', { name: /Also keep the original card/ }).check();
    await page.getByRole('dialog').locator('input[type="file"]').first().setInputFiles(AADHAAR_SCAN);

    await expect(page.getByText('The details were read, but the card was not kept in Documents')).toBeVisible();
    expect(world.restCalls(/storage\/files/)).toHaveLength(1);
    expect(world.calls('root.linkAadhaarCard')).toHaveLength(0);
    // The masked reading still fills the form: a refused card is not a refused person.
    await expect(page.getByLabel('Full name')).toHaveValue('Lakshmi Devi');
  });

  test('a file that is not a card is refused before anything is stored', async ({ page, world }) => {
    world.route(/\/api\/gateway\/storage\/files\?/, () => ({ json: { id: 'file-aadhaar', currentVersionId: 'v' } }));
    world.route(/\/api\/gateway\/pattadar\/extract-aadhaar-async/, () => ({
      status: 415, json: { error: 'Upload the Aadhaar as a PDF or an image' },
    }));
    world.set('root.linkAadhaarCard', true);
    await legacyFamilies(page);
    await openPersonDialog(page);

    await page.getByRole('checkbox', { name: /Also keep the original card/ }).check();
    await page.getByRole('dialog').locator('input[type="file"]').first().setInputFiles({
      name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('not a card'),
    });

    await expect(page.getByText('Upload the Aadhaar as a PDF or an image')).toBeVisible();
    expect(world.restCalls(/storage\/files/)).toHaveLength(0);
    expect(world.calls('root.linkAadhaarCard')).toHaveLength(0);
  });
  });

  test('a ticked Aadhaar scan that read no number keeps no card', async ({ page, world }) => {
    world.route(/\/api\/gateway\/storage\/files\?/, () => ({
      json: { id: 'file-aadhaar', currentVersionId: 'ver-aadhaar' },
    }));
    world.route(/\/api\/gateway\/pattadar\/extract-aadhaar-async/, () => ({ json: { job: 'w-aadhaar' } }));
    world.route(/\/api\/gateway\/pattadar\/import-status\//, () => ({
      json: { state: 'done', fields: { name: 'Lakshmi Devi', aadhaarMasked: '', aadhaarCandidateId: '' } },
    }));
    world.set('root.linkAadhaarCard', true);
    await legacyFamilies(page);
    await openPersonDialog(page);

    await page.getByRole('checkbox', { name: /Also keep the original card/ }).check();
    await page.getByRole('dialog').locator('input[type="file"]').first().setInputFiles(AADHAAR_SCAN);

    await expect(page.getByText('No Aadhaar number was read, so the card was not kept')).toBeVisible();
    expect(world.restCalls(/storage\/files/)).toHaveLength(0);
    expect(world.calls('root.linkAadhaarCard')).toHaveLength(0);
  });

  test('an Aadhaar that cannot be read says so and leaves what was typed alone', async ({ page, world }) => {
    world.route(/\/api\/gateway\/storage\/files\?/, () => ({ json: { id: 'file-aadhaar' } }));
    world.route(/\/api\/gateway\/pattadar\/extract-aadhaar-async/, () => ({ json: { job: 'w-aadhaar' } }));
    // The seeded reading answers "nothing could be read" (fixtures/seed.ts:1294),
    // which is the failure this screen has to survive, and the toast carries
    // the server's reason rather than a fixed sentence.
    await legacyFamilies(page);
    await openPersonDialog(page);
    await page.getByLabel('Full name').fill('Lakshmi Devi');

    await page.getByRole('dialog').locator('input[type="file"]').first().setInputFiles(AADHAAR_SCAN);

    await expect(page.getByText('Nothing could be read from that file.')).toBeVisible();
    await expect(page.getByLabel('Full name')).toHaveValue('Lakshmi Devi');
    // And the button is usable again rather than stuck on its own spinner.
    await expect(page.getByRole('button', { name: 'Upload & extract Aadhaar' })).toBeEnabled();
  });

  test('an email that is not an email is refused before anybody is filed', async ({ page }) => {
    const legacy = await legacyFamilies(page);
    await openPersonDialog(page);

    await page.getByLabel('Full name').fill('Lakshmi Devi');
    await page.getByLabel('Email').fill('lakshmi.at.example.com');
    await page.getByRole('button', { name: 'Add', exact: true }).click();

    await expect(page.getByText('Enter a valid email')).toBeVisible();
    expect(legacy.saved).toHaveLength(0);
  });

  test('an heir with no way of reaching them cannot be filed at all', async ({ page }) => {
    const legacy = await legacyFamilies(page);
    await openPersonDialog(page);

    await page.getByLabel('Full name').fill('Lakshmi Devi');
    await page.getByRole('switch', { name: /Is a beneficiary/ }).check();
    await page.getByRole('button', { name: 'Add', exact: true }).click();

    await expect(page.getByText('Add a mobile number or email so this beneficiary can be verified'))
      .toBeVisible();
    expect(legacy.saved).toHaveLength(0);
  });

  test('an Aadhaar that is not twelve digits is refused', async ({ page }) => {
    const legacy = await legacyFamilies(page);
    await openPersonDialog(page);

    await page.getByLabel('Full name').fill('Lakshmi Devi');
    await page.getByLabel('Email').fill('lakshmi@example.com');
    await page.getByRole('switch', { name: /Is a beneficiary/ }).check();
    await page.getByLabel('Aadhaar (KYC)').fill('1234 5678');
    await page.getByRole('button', { name: 'Add', exact: true }).click();

    await expect(page.getByText('Aadhaar must be 12 digits')).toBeVisible();
    expect(legacy.saved).toHaveLength(0);
  });

  test('the Aadhaar field says what really happens to the number', async ({ page }) => {
    await legacyFamilies(page);
    await openPersonDialog(page);

    await page.getByRole('switch', { name: /Is a beneficiary/ }).check();
    await expect(page.getByLabel('Aadhaar (KYC)')).toBeVisible();
    await expect(page.getByText(/Stored encrypted; lists show only the last 4 digits/)).toBeVisible();
  });

  test('a date of birth under eighteen warns before the heir switch is even touched', async ({ page }) => {
    await legacyFamilies(page);
    await openPersonDialog(page);

    await page.getByLabel('Date of birth').fill('2015-06-01');
    await expect(page.getByText('Under 18 — a guardian is required for an heir')).toBeVisible();
  });

  test('a minor heir cannot be filed without a guardian and a way to reach them', async ({ page }) => {
    const legacy = await legacyFamilies(page);
    await openPersonDialog(page);

    await page.getByLabel('Full name').fill('Anjali');
    await page.getByLabel('Email').fill('anjali.guardian@example.com');
    await page.getByLabel('Date of birth').fill('2015-06-01');
    await page.getByRole('switch', { name: /Is a beneficiary/ }).check();

    await expect(page.getByText('⚠️ Minor — guardian required')).toBeVisible();
    await page.getByRole('button', { name: 'Add', exact: true }).click();

    await expect(page.getByText('Guardian is required for a minor')).toBeVisible();
    await expect(page.getByText('Guardian contact is required')).toBeVisible();
    expect(legacy.saved).toHaveLength(0);
  });

  test('a married heir has to name the spouse who would inherit beside them', async ({ page }) => {
    const legacy = await legacyFamilies(page);
    await openPersonDialog(page);

    await page.getByLabel('Full name').fill('Lakshmi Devi');
    await page.getByLabel('Email').fill('lakshmi@example.com');
    await page.getByRole('switch', { name: /Is a beneficiary/ }).check();
    await page.getByRole('combobox', { name: 'Marital status' }).click();
    await page.getByRole('option', { name: 'Married', exact: true }).click();

    await expect(page.getByText('Spouse (co-heir)')).toBeVisible();
    await page.getByRole('button', { name: 'Add', exact: true }).click();

    await expect(page.getByText('Add the spouse for a married beneficiary')).toBeVisible();
    expect(legacy.saved).toHaveLength(0);
  });

  test('editing somebody opens on their own details and saves against their id', async ({ page }) => {
    const legacy = await legacyFamilies(page, [member()]);
    await page.goto('/legacy/groups');
    await page.getByRole('button', { name: 'Member actions' }).click();
    await page.getByRole('menuitem', { name: 'Edit' }).click();

    await expect(page.getByRole('heading', { name: 'Edit person' })).toBeVisible();
    await expect(page.getByLabel('Full name')).toHaveValue('Venkat Reddy');
    await expect(page.getByLabel('Date of birth')).toHaveValue('1979-04-02');

    await page.getByLabel('Full name').fill('Venkat Reddy Telukutla');
    await page.getByRole('button', { name: 'Save' }).click();

    await expect.poll(() => legacy.saved.length).toBe(1);
    expect(legacy.saved[0]).toMatchObject({
      id: 'w-mem-brother',
      name: 'Venkat Reddy Telukutla',
      relation: 'brother',
      // Everything he already had rides back out with the new name: the number
      // is split into a dial code and a national part to be shown and rejoined
      // to be stored, and an edit that dropped either half would take his
      // phone with it (splitPhone/joinPhone, countryCodes.ts:81-96).
      phone: '+91 9848011111',
      dob: '1979-04-02',
      gender: 'male',
    });
    // `exact`: other words on the dialog contain "saved".
    await expect(page.getByText('Saved', { exact: true })).toBeVisible();
  });

  test('cancelling the editor files nobody', async ({ page }) => {
    const legacy = await legacyFamilies(page);
    await openPersonDialog(page);

    await page.getByLabel('Full name').fill('Lakshmi Devi');
    await page.getByRole('button', { name: 'Cancel' }).click();

    await expect(page.getByRole('heading', { name: 'Add person' })).toHaveCount(0);
    expect(legacy.saved).toHaveLength(0);

    // And the next person starts from an empty form, not from the abandoned one.
    await page.getByRole('button', { name: 'Add member' }).click();
    await expect(page.getByLabel('Full name')).toHaveValue('');
  });
});
