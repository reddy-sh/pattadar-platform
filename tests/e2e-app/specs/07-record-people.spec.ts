/**
 * W08 · the people hanger — /app/records/:id/people
 *
 * "Who looks after it" is the only screen in the module that mixes five kinds
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
 *  · Five test.fail()s, each with the file and line of its cause on it:
 *    a payment row throws away the date and the method the query asked for;
 *    the same row carries "paid out" vs "received" in a colour and an
 *    aria-hidden arrow and nothing else; the one-line list drops the role,
 *    which is the only thing a person remembered off a closed job has; a
 *    rename that fails raises a toast with no reason in it; and the Aadhaar
 *    field tells the owner only the last four digits are kept, which is not
 *    what the server does with the number.
 */
import { test, expect, World } from '../fixtures/harness';
import type { Page } from '../fixtures/harness';
import { ID, PERSON } from '../fixtures/ids';

const PEOPLE_OF = (id: string) => `/app/records/${id}/people`;
const PARCEL = PEOPLE_OF(ID.parcel);   // three people, two payments, a wallet
const NOBODY = PEOPLE_OF(ID.plot);     // the same shape, emptied

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
    await page.goto(PARCEL);

    // The people land before the world is questioned about them: :5173 is the
    // founder's own dev server and can be slow to serve a cold module graph,
    // and a bare poll on `asked` would blame the app for that.
    await expect(card(page, 'Ramana Rao')).toBeVisible();
    expect(world.lastVars('people')).toMatchObject({ id: ID.parcel });

    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Who looks after it');
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

  test('the lede counts the people and states the money moving through them', async ({ page }) => {
    await page.goto(PARCEL);
    await expect(page.getByText('3 people · ₹7,200 a month going out · ₹1.4 L a season coming in'))
      .toBeVisible();
  });

  test('one person is one person, not "1 people"', async ({ page, world }) => {
    world.set('people', peopleView({ count: 1, people: [person({ name: 'Ramana Rao' })] }));
    await page.goto(PARCEL);
    await expect(page.getByText(/^1 person · /)).toBeVisible();
  });

  test('the watchman is drawn with his initials, his badge and the whole arrangement', async ({ page }) => {
    await page.goto(PARCEL);
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
    await page.goto(PARCEL);
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
    await page.goto(PARCEL);

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
    await page.goto(PARCEL);

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
    await page.goto(PARCEL);
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
    await page.goto(PARCEL);

    await expect(card(page, 'M. Satyanarayana')).toContainText('MS');
    await expect(page.getByText('ZZ')).toHaveCount(0);
  });

  test('somebody remembered from a closed job gets one line and one control', async ({ page }) => {
    await page.goto(PARCEL);

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
    await page.goto(PARCEL);

    await expect(page.getByText('Venkat Reddy')).toBeVisible();
    await expect(page.getByText('Brother · equal share')).toBeVisible();
    await expect(page.getByText('Nobody is filed on this land yet')).toHaveCount(0);
    await expect(page.getByRole('article')).toHaveCount(0);
    // And the footnote belongs to a list that has somebody in it.
    await expect(page.getByText(/Who can see this record is granted as a link/)).toBeVisible();
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
    await page.goto(PARCEL);

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
    await page.goto(PARCEL);

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
    await page.goto(PARCEL);

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
        actions: ['Lease agreement', 'Track order', 'Invite to the app',
                  'Message', 'Change pay', 'Record a payment', 'Permissions'],
      })],
    }));
    await page.goto(PARCEL);

    const acts = card(page, 'Sai Kumar');
    await expect(acts.getByRole('link', { name: 'Lease agreement' }))
      .toHaveAttribute('href', `/app/records/${ID.parcel}`);
    await expect(acts.getByRole('link', { name: 'Track order' }))
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
    await page.goto(PARCEL);
    const tabs = page.getByRole('navigation', { name: 'This record' });
    const here = tabs.getByRole('link', { name: /^People/ });
    await expect(here).toHaveAttribute('aria-current', 'page');
    await expect(here).toContainText('3');
  });
});

// ── the money column ───────────────────────────────────────────────────

test.describe('the money on people', () => {
  test('the money card repeats the two figures in the lede, out first and in second', async ({ page }) => {
    await page.goto(PARCEL);
    const money = asideCard(page, 'Money on people');

    await expect(money).toContainText('₹7,200');
    await expect(money).toContainText('out, this month');
    await expect(money).toContainText('₹1.4 L');
    await expect(money).toContainText('in, at harvest');
  });

  test('the wallet balance is printed to the rupee, the way the wallet itself prints it', async ({ page, world }) => {
    // ₹1,01,000 read as "₹1.01 L" here and ₹1,01,000 a click away on
    // /app/wallet is ₹433 of daylight between two figures for the same money.
    world.set('people', peopleView({
      count: 1, people: [person()], walletBalance: 101_000, walletNote: 'In your wallet',
    }));
    await page.goto(PARCEL);

    await expect(asideCard(page, 'Money on people')).toContainText('Balance ₹1,01,000 · In your wallet');
    await expect(page.getByText('₹1.01 L')).toHaveCount(0);
  });

  test('the wallet card is honest that paying out of Pattadar is not switched on', async ({ page }) => {
    await page.goto(PARCEL);
    const money = asideCard(page, 'Money on people');

    await expect(money).toContainText('Paid from your Pattadar wallet');
    await expect(money).toContainText('Adding money to the wallet is not switched on yet.');
    await expect(money.getByRole('link', { name: 'See the wallet' }))
      .toHaveAttribute('href', '/app/wallet');
  });

  test('when the wallet goes live the screen stops apologising for it', async ({ page, world }) => {
    world.set('people', peopleView({
      count: 1, people: [person()], walletLive: true, walletNote: 'In your wallet',
    }));
    await page.goto(PARCEL);

    const money = asideCard(page, 'Money on people');
    await expect(money).toContainText('Balance ₹24,500');
    await expect(money).not.toContainText('not switched on yet');
    await expect(money.getByRole('link', { name: 'See the wallet' })).toBeVisible();
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
    await page.goto(PARCEL);

    // The rows have no role of their own, and the only thing separating the
    // three glyphs is the data-testid MUI stamps on an icon outside a
    // production build (@mui/material SvgIcon/createSvgIcon.js:18) — so these
    // three assertions hold against the dev server this suite drives and not
    // against a built bundle. Nothing in the row says "in" or "out" in words:
    // direction here is an unlabelled arrow and a colour, and that is all a
    // screen reader gets.
    const rows = asideCard(page, 'Last payments').locator('.rows > div');
    await expect(rows).toHaveCount(3);

    await expect(rows.nth(0)).toContainText('Ramana Rao');
    await expect(rows.nth(0)).toContainText('₹7,200');
    await expect(rows.nth(0).locator('[data-testid="NorthEastOutlinedIcon"]')).toHaveCount(1);

    await expect(rows.nth(1)).toContainText('Groundnut sale');
    await expect(rows.nth(1)).toContainText('₹1.4 L');
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
    await page.goto(PARCEL);

    const row = asideCard(page, 'Last payments').locator('.rows > div').first();
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
    await page.goto(PARCEL);

    const first = asideCard(page, 'Last payments').locator('.rows > div').first();
    await expect(first).toContainText('UPI');
    await expect(first).toContainText(/2026/);
  });

  test('a payment row says which way the money went to somebody who cannot see the arrow', async ({ page, world }) => {
    // DEFECT: apps/web/src/w360/pages/RecordPeople.tsx:481-487 carries the
    // direction of a payment in an arrow glyph and a colour and nowhere else.
    // MUI renders every one of those glyphs aria-hidden unless it is given
    // titleAccess (@mui/material/SvgIcon/SvgIcon.js:157), so the row reaches a
    // screen reader as "Ramana Rao, Watchman · September, ₹7,200" — with no
    // way to tell ₹7,200 handed out from ₹7,200 received, which is the whole
    // fact of the row. Colour is the only other cue, and --w-ok green against
    // --w-ink-3 grey is exactly the pair a red-green reader loses. This module
    // has already settled this same question once: the stage rail counts its
    // pips out loud because "four amber dashes say nothing to a screen reader"
    // (w360/ui.tsx:766-769). The owner is owed the direction in the
    // accessibility tree — a word in the row, or a label on the glyph.
    test.fail();
    world.set('people', peopleView({
      count: 1,
      people: [person()],
      payments: [
        payment({ id: 'w-pay-out', title: 'Ramana Rao', subtitle: 'Watchman · September', amount: 7_200, direction: 'out' }),
        payment({ id: 'w-pay-in', title: 'Groundnut sale', subtitle: 'Sai Kumar · share', amount: 140_000, direction: 'in' }),
      ],
    }));
    await page.goto(PARCEL);

    // Any wording that carries the direction satisfies this; none does today.
    const rows = asideCard(page, 'Last payments').locator('.rows > div');
    await expect(rows.nth(0)).toHaveText(/\b(out|paid|sent)\b/i);
    await expect(rows.nth(1)).toHaveText(/\b(in|received|came)\b/i);
  });

  test('a record where no money has moved says so rather than drawing an empty card', async ({ page }) => {
    await page.goto(NOBODY);
    const payments = asideCard(page, 'Last payments');

    await expect(payments).toContainText('Nothing has been paid on this record yet.');
    await expect(payments).toContainText('The ledger across all your records is in the wallet.');
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
    await page.goto(PARCEL);
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
    await page.goto(PARCEL);
    await page.getByRole('button', { name: 'Assign someone' }).click();

    await expect(page.getByRole('dialog', { name: 'Assign someone' }).locator('.eyebrow'))
      .toHaveText('Sy 214/2 · People');
  });

  test('filing somebody sends exactly what was typed, trimmed, against this record', async ({ page, world }) => {
    await page.goto(PARCEL);
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
    await page.goto(PARCEL);
    await page.getByRole('button', { name: 'Assign someone' }).click();
    await nameBox(page).fill('Lakshmi Devi');
    await assign(page).click();

    await expect.poll(() => world.calls('addPerson').length).toBe(1);
    expect(world.lastVars('addPerson')).toMatchObject({
      recordId: ID.parcel, personName: 'Lakshmi Devi', role: '', payLabel: '', payValue: '',
    });
  });

  test('pressing the chosen role again clears it rather than leaving it stuck on', async ({ page, world }) => {
    await page.goto(PARCEL);
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
    await page.goto(PARCEL);
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
    await page.goto(PARCEL);
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
    await page.goto(PARCEL);
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
    await page.goto(PARCEL);
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
    await page.goto(PARCEL);

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
    await page.goto(PARCEL);

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
    await page.goto(PARCEL);

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
    await page.goto(PARCEL);

    await page.getByRole('button', { name: 'Assign someone' }).click();
    await nameBox(page).fill('Lakshmi Devi');
    await assign(page).click();

    await expect(page.getByText('That person was not filed. What you typed is still here — try Assign again.'))
      .toBeVisible();
    await expect(nameBox(page)).toHaveValue('Lakshmi Devi');

    // Nothing was filed, so the list is not re-read behind the message.
    expect(world.calls('people')).toHaveLength(1);
  });

  test('a second try after a refusal sends the same person again, without the old message under it', async ({ page, world }) => {
    world.set('addPerson', '');
    await page.goto(PARCEL);

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
    await page.goto(PARCEL);
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
    await page.goto(PARCEL);
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
    await page.goto(PARCEL);
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
    await page.goto(PARCEL);
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
    await page.goto(PARCEL);

    await page.getByRole('button', { name: 'Rename Ramana Rao' }).click();
    await page.getByRole('textbox', { name: 'Rename Ramana Rao' }).fill('Ramana Rao Naidu');
    await page.getByRole('button', { name: 'Save' }).click();

    await expect(page.getByText('That name was not changed. The person may already be off this record.'))
      .toBeVisible();
    await expect(page.getByRole('textbox', { name: 'Rename Ramana Rao' })).toHaveValue('Ramana Rao Naidu');
  });

  test('a rename that cannot be sent keeps what was typed', async ({ page, world }) => {
    world.set('updatePerson', World.gqlError('record_people is read-only right now'));
    await page.goto(PARCEL);

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
    await page.goto(PARCEL);

    await page.getByRole('button', { name: 'Rename Ramana Rao' }).click();
    await page.getByRole('textbox', { name: 'Rename Ramana Rao' }).fill('Ramana Rao Naidu');
    await page.getByRole('button', { name: 'Save' }).click();

    await expect(page.getByText('That name could not be changed. What you typed is still here.'))
      .toBeVisible();
    await expect(page.getByText('record_people is read-only right now')).toBeVisible();
  });

  test('while a rename is in flight Save says so and refuses a second press', async ({ page, world }) => {
    world.set('updatePerson', World.slow(1_500, true));
    await page.goto(PARCEL);

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
    await page.goto(PARCEL);
    await page.getByRole('button', { name: 'Rename Ramana Rao' }).click();
    await page.getByRole('textbox', { name: 'Rename Ramana Rao' }).fill('Somebody Else');
    await page.getByRole('button', { name: 'Cancel' }).click();

    await expect(page.getByRole('textbox', { name: 'Rename Ramana Rao' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Rename Ramana Rao' })).toBeFocused();
    await expect(card(page, 'Ramana Rao')).toBeVisible();
    expect(world.calls('updatePerson')).toHaveLength(0);
  });

  test('only the person whose pencil was pressed gets an editor', async ({ page }) => {
    await page.goto(PARCEL);
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
    await page.goto(PARCEL);
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

test.describe('taking somebody off', () => {
  test('taking somebody off asks before it does anything', async ({ page, world }) => {
    await page.goto(PARCEL);
    await page.getByRole('button', { name: 'Remove Ramana Rao' }).click();

    const watchman = card(page, 'Ramana Rao');
    await expect(watchman.getByRole('button', { name: 'Remove', exact: true })).toBeVisible();
    await expect(watchman.getByRole('button', { name: 'Keep' })).toBeVisible();
    expect(world.calls('deletePerson')).toHaveLength(0);
  });

  test('keeping them calls nothing and puts the focus back on their own row', async ({ page, world }) => {
    await page.goto(PARCEL);
    await page.getByRole('button', { name: 'Remove Ramana Rao' }).click();
    await card(page, 'Ramana Rao').getByRole('button', { name: 'Keep' }).click();

    await expect(page.getByRole('button', { name: 'Remove Ramana Rao' })).toBeFocused();
    expect(world.calls('deletePerson')).toHaveLength(0);
  });

  test('confirming calls deletePerson for that person and reads the list again', async ({ page, world }) => {
    await page.goto(PARCEL);
    await page.getByRole('button', { name: 'Remove Sai Kumar' }).click();
    await card(page, 'Sai Kumar').getByRole('button', { name: 'Remove', exact: true }).click();

    await expect.poll(() => world.calls('deletePerson').length).toBe(1);
    expect(world.lastVars('deletePerson')).toMatchObject({ personId: PERSON.tenant });
    await expect.poll(() => world.calls('people').length).toBeGreaterThan(1);
  });

  test('once somebody is off, the focus lands on the button that files the next one', async ({ page, world }) => {
    // The row that held the focus is the row that just went away, so it cannot
    // keep it (RecordPeople.tsx:139). Focus left on a detached node is focus
    // back at the top of the document for anybody driving this by keyboard.
    await page.goto(PARCEL);
    await page.getByRole('button', { name: 'Remove Sai Kumar' }).click();
    await card(page, 'Sai Kumar').getByRole('button', { name: 'Remove', exact: true }).click();

    await expect.poll(() => world.calls('deletePerson').length).toBe(1);
    await expect(page.getByRole('button', { name: 'Assign someone' })).toBeFocused();
  });

  test('a removal the server refuses leaves the card and the question standing', async ({ page, world }) => {
    world.set('deletePerson', false);
    await page.goto(PARCEL);

    await page.getByRole('button', { name: 'Remove Ramana Rao' }).click();
    await card(page, 'Ramana Rao').getByRole('button', { name: 'Remove', exact: true }).click();

    await expect(page.getByText('That person was not removed. They may already be off this record.'))
      .toBeVisible();
    await expect(card(page, 'Ramana Rao')).toBeVisible();
    await expect(card(page, 'Ramana Rao').getByRole('button', { name: 'Keep' })).toBeVisible();
  });

  test('a removal that cannot be sent says they are still filed here', async ({ page, world }) => {
    world.set('deletePerson', World.gqlError('the people store is refusing writes'));
    await page.goto(PARCEL);

    await page.getByRole('button', { name: 'Remove Ramana Rao' }).click();
    await card(page, 'Ramana Rao').getByRole('button', { name: 'Remove', exact: true }).click();

    await expect(page.getByText('That person could not be removed. They are still filed here.'))
      .toBeVisible();
    await expect(card(page, 'Ramana Rao')).toBeVisible();
  });

  test('while a removal is in flight the button says so and refuses a second press', async ({ page, world }) => {
    world.set('deletePerson', World.slow(1_500, true));
    await page.goto(PARCEL);

    await page.getByRole('button', { name: 'Remove Ramana Rao' }).click();
    await card(page, 'Ramana Rao').getByRole('button', { name: 'Remove', exact: true }).click();

    const removing = card(page, 'Ramana Rao').getByRole('button', { name: 'Removing…' });
    await expect(removing).toBeVisible();
    await expect(removing).toBeDisabled();

    await expect(card(page, 'Ramana Rao').getByRole('button', { name: 'Keep' })).toHaveCount(0);
    expect(world.calls('deletePerson')).toHaveLength(1);
  });

  test('somebody on the one-line list can be taken off from there too', async ({ page, world }) => {
    await page.goto(PARCEL);
    await page.getByRole('button', { name: 'Remove Venkat Reddy' }).click();
    await page.getByRole('button', { name: 'Remove', exact: true }).click();

    await expect.poll(() => world.calls('deletePerson').length).toBe(1);
    expect(world.lastVars('deletePerson')).toMatchObject({ personId: PERSON.brother });
  });

  test('keeping somebody on the one-line list puts the focus back on their own row', async ({ page, world }) => {
    // The one-line list carries its own copy of the confirm
    // (RecordPeople.tsx:383-401), so Keep has to be proved on both.
    await page.goto(PARCEL);
    await page.getByRole('button', { name: 'Remove Venkat Reddy' }).click();
    await expect(page.getByRole('button', { name: 'Remove', exact: true })).toBeVisible();

    await page.getByRole('button', { name: 'Keep' }).click();

    await expect(page.getByRole('button', { name: 'Remove Venkat Reddy' })).toBeFocused();
    expect(world.calls('deletePerson')).toHaveLength(0);
  });

  test('the question is asked about one person at a time', async ({ page }) => {
    await page.goto(PARCEL);
    await page.getByRole('button', { name: 'Remove Ramana Rao' }).click();

    await expect(card(page, 'Ramana Rao').getByRole('button', { name: 'Keep' })).toBeVisible();
    await expect(card(page, 'Sai Kumar').getByRole('button', { name: 'Keep' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Remove Sai Kumar' })).toBeVisible();
  });
});

// ── nobody, still coming, and not coming at all ────────────────────────

test.describe('nobody, still coming, failed', () => {
  test('a record with nobody on it says so and offers the one thing there is to do', async ({ page }) => {
    await page.goto(NOBODY);

    await expect(page.getByText('Nobody is filed on this land yet')).toBeVisible();
    await expect(page.getByText(/A tenant, a caretaker, an agent/)).toBeVisible();
    await expect(page.getByText(/What they are\s+owed, and what they can see of this record, is kept on their card/))
      .toBeVisible();
    await expect(page.getByRole('article')).toHaveCount(0);

    // The lede is honest about the zeroes rather than hiding the row.
    await expect(page.getByText('0 people · ₹0 a month going out · ₹0 a season coming in'))
      .toBeVisible();

    // The footnote is about a list, and there is no list — the one sentence on
    // an empty record is the empty state's own.
    await expect(page.getByText(/Who can see this record is granted as a link/)).toHaveCount(0);
  });

  test('the empty state own button opens the same drawer the header one does', async ({ page }) => {
    await page.goto(NOBODY);
    // Two buttons carry this name on an empty record: the one in the header
    // and the one inside the empty state. This is the second.
    await page.getByRole('button', { name: 'Assign someone' }).nth(1).click();

    await expect(page.getByRole('dialog', { name: 'Assign someone' })).toBeVisible();
    await expect(page.getByLabel('Their name')).toBeFocused();
  });

  test('filing from the empty state hands focus to a control that still exists', async ({ page, world }) => {
    // The empty state's own button is removed by the very person it files — the
    // list stops being empty — so focus cannot go back to the control that was
    // pressed. Without a fallback it lands on <body> and the next Tab starts
    // again from the top of the document, which is the case
    // Drawer.useSealedPage names. The answer has to grow for the empty state to
    // go away, so it grows: empty on the first read, one person after the write.
    let filed = false;
    world.set('people', () => (filed
      ? peopleView({ count: 1, people: [person({ id: 'w-person-new', name: 'Lakshmi Devi' })] })
      : peopleView()));
    world.set('addPerson', () => { filed = true; return 'w-person-new'; });

    await page.goto(NOBODY);
    const inEmptyState = page.getByRole('button', { name: 'Assign someone' }).nth(1);
    await expect(inEmptyState).toBeVisible();
    await inEmptyState.click();
    await page.getByLabel('Their name').fill('Lakshmi Devi');
    await page.getByRole('button', { name: 'Assign them' }).click();

    await expect.poll(() => world.calls('addPerson').length).toBe(1);
    await expect(page.getByLabel('Their name')).toHaveCount(0);
    // One left, and it has focus: the empty state's copy went with the empty
    // state.
    const assign = page.getByRole('button', { name: 'Assign someone' });
    await expect(assign).toHaveCount(1);
    await expect(assign).toBeFocused();
  });

  test('an empty record still says where the ledger is, and what the wallet holds', async ({ page }) => {
    await page.goto(NOBODY);

    await expect(asideCard(page, 'Money on people')).toContainText('Balance ₹24,500 · In your wallet');
    await expect(asideCard(page, 'Last payments')).toContainText('Nothing has been paid on this record yet.');
  });

  test('while the people are still coming the screen holds its shape and claims nothing', async ({ page, world }) => {
    world.set('people', World.never());
    await page.goto(PARCEL);

    await expect(page.getByRole('main').getByRole('status')).toContainText('Loading…');
    // The question and the tab strip belong to the record, which has landed.
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Who looks after it');
    await expect(page.getByRole('navigation', { name: 'This record' })).toBeVisible();

    // And nothing is claimed about who is on this land, either way.
    await expect(page.getByText('Nobody is filed on this land yet')).toHaveCount(0);
    await expect(page.getByRole('article')).toHaveCount(0);
    await expect(page.getByText('Money on people')).toHaveCount(0);
    // Not even a zero: the lede waits for the figures rather than printing
    // "0 people · ₹0 a month going out" over a record with three people on it.
    await expect(page.getByText(/a month going out/)).toHaveCount(0);
  });

  test('a people read that fails says so in the server own words, with a way to try again', async ({ page, world }) => {
    world.set('people', World.gqlError('the people store is down'));
    await page.goto(PARCEL);

    const failed = page.getByRole('alert');
    await expect(failed).toContainText('The people on this record did not load');
    await expect(failed).toContainText('Nothing has been lost');
    await expect(failed).toContainText('the people store is down');
    await expect(failed.getByRole('button', { name: 'Try again' })).toBeVisible();

    // A failed read must not read as a record with nobody on it.
    await expect(page.getByText('Nobody is filed on this land yet')).toHaveCount(0);
  });

  test.describe('when the gateway itself answers', () => {
    // The browser logs "Failed to load resource: 503" itself, twice — the
    // query is tried once and retried once (main.tsx:43). Provoking that is
    // the point of this test, so the console guard is stood down for it alone.
    test.use({ allowConsole: true });

    test('a people read the gateway refuses fails the same way, with the transport reason', async ({ page, world }) => {
      world.set('people', World.httpError(503));
      await page.goto(PARCEL);

      const failed = page.getByRole('alert');
      await expect(failed).toContainText('The people on this record did not load');
      await expect(failed).toContainText('GraphQL HTTP 503');
      await expect(page.getByText('Nobody is filed on this land yet')).toHaveCount(0);
    });
  });

  test('trying again once the server is back draws the people', async ({ page, world }) => {
    world.set('people', World.gqlError('the people store is down'));
    await page.goto(PARCEL);
    await expect(page.getByText('The people on this record did not load')).toBeVisible();

    world.set('people', peopleView({
      count: 1, people: [person({ id: PERSON.watcher, name: 'Ramana Rao', role: 'Watchman' })],
    }));
    await page.getByRole('button', { name: 'Try again' }).click();

    await expect(card(page, 'Ramana Rao')).toBeVisible();
    await expect(page.getByText('The people on this record did not load')).toHaveCount(0);
  });

  test('a try again that fails again says so rather than going quiet', async ({ page, world }) => {
    // "if the read fails again the screen is still here saying so — which is
    // itself the answer" (w360/ui.tsx:699-701). A button that returns to rest
    // with nothing changed is the point at which somebody gives up.
    world.set('people', World.gqlError('the people store is down'));
    await page.goto(PARCEL);
    await expect(page.getByText('The people on this record did not load')).toBeVisible();
    const before = world.calls('people').length;

    await page.getByRole('button', { name: 'Try again' }).click();

    await expect.poll(() => world.calls('people').length).toBeGreaterThan(before);
    const failed = page.getByRole('alert');
    await expect(failed).toContainText('The people on this record did not load');
    await expect(failed).toContainText('the people store is down');
    await expect(failed.getByRole('button', { name: 'Try again' })).toBeEnabled();
  });

  test('a refresh that fails does not take the people already on screen away', async ({ page, world }) => {
    await page.goto(PARCEL);
    await expect(card(page, 'Ramana Rao')).toBeVisible();

    // The refetch after a successful write is the one that lands here.
    world.set('people', World.gqlError('the people store went down mid-edit'));
    await page.getByRole('button', { name: 'Rename Ramana Rao' }).click();
    await page.getByRole('textbox', { name: 'Rename Ramana Rao' }).fill('Ramana Rao Naidu');
    await page.getByRole('button', { name: 'Save' }).click();

    await expect.poll(() => world.calls('people').length).toBeGreaterThan(1);
    await expect(card(page, 'Ramana Rao')).toBeVisible();
    await expect(card(page, 'Sai Kumar')).toBeVisible();
    await expect(page.getByText('The people on this record did not load')).toHaveCount(0);
  });

  test('a record that is not in your portfolio is never asked who looks after it', async ({ page, world }) => {
    await page.goto(PEOPLE_OF(ID.missing));

    await expect(page.getByRole('heading', { name: 'That record is not in your portfolio' }))
      .toBeVisible();
    expect(world.asked('people')).toBe(false);
  });

  test('a record that cannot be read says the record failed, not that nobody looks after it', async ({ page, world }) => {
    world.set('record', World.gqlError('the record store is down'));
    await page.goto(PARCEL);

    await expect(page.getByText('This record did not load')).toBeVisible();
    await expect(page.getByText('Who looks after it')).toHaveCount(0);
    expect(world.asked('people')).toBe(false);
  });

  test('the hanger stacks on a narrow screen without losing the money column @phone', async ({ page }) => {
    await page.goto(PARCEL);

    await expect(card(page, 'Ramana Rao')).toBeVisible();
    await expect(asideCard(page, 'Money on people')).toBeVisible();
    await expect(asideCard(page, 'Last payments')).toBeVisible();

    // Nothing may push the page sideways at any width.
    const overflow = await page.evaluate(() =>
      document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  });
});

// ── the other person editor: /legacy/groups ────────────────────────────

/**
 * PersonDialog (apps/web/src/pages/families/PersonDialog.tsx) is the OTHER
 * place this app files a person, and it belongs to the previous interface:
 * W360 never redrew Families & Groups, so /app/groups is a signpost and the
 * working screen is /legacy/groups. It shares nothing with the hanger above —
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

  test('scanning the Aadhaar fills the form in and keeps the card, the way the panel promises', async ({ page, world }) => {
    // The reading is an ASYNC read (api/client.ts:33): the POST goes to
    // `-async` and the answer is collected from import-status, so both have to
    // be answered here — the seed only knows the import-* pair.
    world.route(/\/api\/gateway\/storage\/files\?/, () => ({ json: { id: 'file-aadhaar', nodeId: 'file-aadhaar' } }));
    world.route(/\/api\/gateway\/pattadar\/extract-aadhaar-async/, () => ({ json: { job: 'w-aadhaar' } }));
    world.route(/\/api\/gateway\/pattadar\/import-status\//, () => ({
      json: {
        state: 'done',
        fields: {
          name: 'Lakshmi Devi', dob: '1985-03-14', gender: 'Female',
          aadhaar: '123456789012', address: 'Katragunta, Markapur',
        },
      },
    }));
    await legacyFamilies(page);
    await openPersonDialog(page);
    await page.getByRole('switch', { name: /Is a beneficiary/ }).check();

    // The control is a <label> wrapped round a hidden <input type=file>, which
    // has neither a role nor a name of its own; the panel's own input is the
    // first of the two in the dialog.
    await page.getByRole('dialog').locator('input[type="file"]').first().setInputFiles(AADHAAR_SCAN);

    await expect(page.getByLabel('Full name')).toHaveValue('Lakshmi Devi');
    await expect(page.getByLabel('Date of birth')).toHaveValue('1985-03-14');
    await expect(page.getByRole('combobox', { name: 'Gender' })).toHaveText('Female');
    await expect(page.getByLabel('Aadhaar (KYC)')).toHaveValue('1234 5678 9012');
    await expect(page.getByRole('textbox', { name: 'Present address' }))
      .toHaveValue('Katragunta, Markapur');
    await expect(page.getByText('Aadhaar read — fields filled and saved to My Drive')).toBeVisible();

    // "the card is also saved to My Drive" is printed on the panel, so it has
    // to have happened.
    expect(world.restCalls(/storage\/files/)).toHaveLength(1);
  });

  test('an Aadhaar that cannot be read says so and leaves what was typed alone', async ({ page, world }) => {
    world.route(/\/api\/gateway\/storage\/files\?/, () => ({ json: { id: 'file-aadhaar' } }));
    world.route(/\/api\/gateway\/pattadar\/extract-aadhaar-async/, () => ({ json: { job: 'w-aadhaar' } }));
    // The seeded reading answers "nothing could be read" (fixtures/seed.ts:896),
    // which is the failure this screen has to survive.
    await legacyFamilies(page);
    await openPersonDialog(page);
    await page.getByLabel('Full name').fill('Lakshmi Devi');

    await page.getByRole('dialog').locator('input[type="file"]').first().setInputFiles(AADHAAR_SCAN);

    await expect(page.getByText('Could not read the Aadhaar')).toBeVisible();
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
    // DEFECT: apps/web/src/pages/families/PersonDialog.tsx:609 tells the owner
    // the number is "Stored masked — only last 4 digits (DPDP-2023)". It is
    // not. services/api/src/main.py:1984-1985 writes BOTH a masked token and
    // `aadhaar_enc` — all twelve digits, Fernet-encrypted with a key that
    // lives on the server (main.py:1088 encrypt_aadhaar), so the full number
    // is recoverable by anyone holding it. The same claim is made on the
    // self-KYC path (main.py:2545-2546). Whatever the right answer is, the
    // sentence under a field that collects an identity number has to be the
    // true one, and a DPDP review cannot be run against copy that describes a
    // design the server does not implement.
    test.fail();
    await legacyFamilies(page);
    await openPersonDialog(page);

    await page.getByRole('switch', { name: /Is a beneficiary/ }).check();
    await expect(page.getByLabel('Aadhaar (KYC)')).toBeVisible();
    await expect(page.getByText(/only last 4 digits/)).toHaveCount(0);
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
    // `exact`: the scan panel's own caption ends "saved to My Drive".
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
