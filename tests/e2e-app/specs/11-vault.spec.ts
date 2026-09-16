/**
 * W15 — the vault and its shelves.
 *
 * Two screens: the wall at `/app/papers` (eight shelf cards, the search across
 * everything filed, and every link out of the vault) and one shelf at
 * `/app/papers/shelf/:key`. Between them they are the whole of
 * apps/web/src/w360/pages/Vault.tsx and apps/web/src/w360/pages/Shelf.tsx —
 * loaded, empty, still loading, failed, refused, and each branch in between.
 *
 * Three things a reader has to know before the assertions make sense.
 *
 * 1. `expiresOn` is DD/MM/YYYY on the wire. web360.py writes it that way when
 *    a link is made (createShareLink) and parses it back the same way
 *    (extend_share_link, _days_until), and Vault.tsx does the arithmetic in
 *    the browser rather than trusting the server's `daysLeft`, which is
 *    clamped to 0 for a lapsed link AND for a link with no date at all. The
 *    links seeded in fixtures/seed.ts carry ISO dates, which that parser
 *    correctly reads as "no expiry recorded" — so every link test below seeds
 *    its own links, in the shape the server actually stores, on dates relative
 *    to the day the suite runs. Nothing here depends on a wall-clock date.
 *
 * 2. The note under a shelf card comes from the server (`vault.shelves[].note`)
 *    while the lede on the shelf page comes from Shelf.tsx's own table. They
 *    are the same eight sentences in production; in the fixture they are not,
 *    which is convenient — each assertion here reads from the side that draws
 *    it, and a test that mixed them up would be obvious.
 *
 * 3. A paper row is asserted by its destination rather than opened. The Reader
 *    at `/app/papers/:id` is another spec's screen; what this one owes is that
 *    a shelf row and a search hit point at the right paper.
 *
 * Six test.fail()s, each naming its cause: the share log never says what went
 * out or whether it was opened; Extend is gone from a screen whose server-side
 * reason for losing it has since been fixed; an empty vault still draws the
 * whole wall and a lecture about revoking links; the property picker prints an
 * ungrouped extent; a loading shelf announces nothing; and two of the eight
 * empty-shelf sentences do not parse. Each one goes green the day it is fixed.
 */
import { test, expect, World } from '../fixtures/harness';
import { ID, PAPER, LINK, SHELVES } from '../fixtures/ids';

// ── the shapes these two screens read ──────────────────────────────────

interface ShelfCard { key: string; label: string; note: string; count: number }
interface ShareLink {
  id: string; audience: string; subject: string; terms: string; docCount: number;
  openedCount: number; lastOpenedAt: string; expiresOn: string; daysLeft: number; initials: string;
}
interface VaultAnswer { total: number; regionNote: string; shelves: ShelfCard[]; links: ShareLink[] }

/** DD/MM/YYYY, n days from today, in the timezone playwright.config.ts pins.
 *  The shape `share_links.expires_on` actually holds (web360.py:4768). */
const DMY = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Kolkata', day: '2-digit', month: '2-digit', year: 'numeric',
});
const inDays = (n: number) => DMY.format(new Date(Date.now() + n * 86_400_000));

/** One link out of the vault, with every field `Q_VAULT` selects. */
const aLink = (over: Partial<ShareLink> & { id: string }): ShareLink => ({
  audience: 'Prospective buyer', subject: 'Sy 214/2', terms: 'View only · no download',
  docCount: 4, openedCount: 3, lastOpenedAt: inDays(-3), expiresOn: inDays(18),
  daysLeft: 18, initials: 'PB', ...over,
});

/** An account with no properties at all, in the shape `Q_PROPERTIES` selects. */
const EMPTY_PORTFOLIO = {
  shown: 0, total: 0, hidden: 0, filterSummary: '', hiddenPlaces: [], activeCount: 0,
  cards: [], facets: [],
};

/** An account with more properties than the picker will draw at once — the
 *  seeded portfolio has four, and `RecordPick` caps its list at twelve
 *  (Vault.tsx:196). One of the `n` is in Kukatpally and the rest in
 *  Katragunta, so a search can be made to match all but one of them. */
const bigPortfolio = (n: number) => ({
  ...EMPTY_PORTFOLIO,
  shown: n,
  total: n,
  cards: Array.from({ length: n }, (_, i) => ({
    id: `w-many-${i + 1}`, kind: 'parcel', title: `Sy 4${String(i + 1).padStart(2, '0')}`,
    subtitle: '', classification: 'Dry land', status: 'owned', stake: 'owned',
    khataNo: '', ownerName: 'Telukutla Shankar Reddy',
    village: i === 0 ? 'Kukatpally' : 'Katragunta',
    mandal: i === 0 ? 'Kukatpally' : 'Markapur', district: i === 0 ? 'Hyderabad' : 'Prakasam',
    placeLine: i === 0 ? 'Kukatpally, Hyderabad' : 'Katragunta, Markapur, Prakasam',
    extent: 2, extentUnit: 'acres', extentAlt: '2 acres', marketValue: 0,
    tags: [], lat: 0, lon: 0, ring: [], coverFileRef: '',
  })),
});

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// ═══════════════════════════════════════════════════════════════════════
test.describe('the wall', () => {
  test('every shelf says what it holds and how many are on it', async ({ page, world }) => {
    const vault = world.seedOf<VaultAnswer>('vault');
    await page.goto('/app/papers');

    await expect(page.getByRole('heading', { level: 1, name: 'Papers' })).toBeVisible();

    for (const shelf of vault.shelves) {
      // The card is a link wrapping its own h3, which is the only thing on the
      // wall unique to one shelf — the count and the note are plain spans.
      const card = page.getByRole('link')
        .filter({ has: page.getByRole('heading', { level: 3, name: shelf.label, exact: true }) });
      await expect(card).toHaveAttribute('href', `/app/papers/shelf/${shelf.key}`);
      await expect(card).toHaveAccessibleName(
        new RegExp(`^${shelf.count}\\s*${esc(shelf.label)}\\s*${esc(shelf.note)}$`),
      );
    }

    // The wall is the server's list and nothing else: a ninth card hard-coded
    // into the grid, or an eighth dropped from it, is caught here rather than
    // by the loop above, which only walks what the answer contains.
    await expect(page.getByRole('link')
      .filter({ has: page.getByRole('heading', { level: 3 }) }))
      .toHaveCount(vault.shelves.length);
    expect(vault.shelves).toHaveLength(SHELVES.length);
  });

  test('the wall counts the papers and says where they are kept', async ({ page, world }) => {
    const vault = world.seedOf<VaultAnswer>('vault');
    await page.goto('/app/papers');

    await expect(page.getByText(`27 papers, ${vault.regionNote}`)).toBeVisible();
    // The sentence is the server's, not the screen's: change the answer and
    // the screen repeats the new one rather than its own idea of where the
    // bytes live.
    expect(vault.regionNote).toContain('ap-south-1');
  });

  test('a vault holding one paper does not call it 1 papers', async ({ page, world }) => {
    world.patch('vault', { total: 1 });
    await page.goto('/app/papers');

    await expect(page.getByText('1 paper, Stored in Mumbai')).toBeVisible();
    await expect(page.getByLabel('Search your papers by name'))
      .toHaveAttribute('placeholder', 'Search 1 paper by name');
  });

  test('a shelf card opens that shelf, and the list agrees with the count on the card',
    async ({ page, world }) => {
      const vault = world.seedOf<VaultAnswer>('vault');
      await page.goto('/app/papers');

      for (const shelf of vault.shelves) {
        // Photos is the one shelf that is empty by construction — counted from
        // parcel_photos, never from documents — and it has its own test below.
        if (shelf.key === 'photos') continue;

        const card = page.getByRole('link')
          .filter({ has: page.getByRole('heading', { level: 3, name: shelf.label, exact: true }) });
        await expect(card).toHaveAccessibleName(new RegExp(`^${shelf.count}\\s`));
        await card.click();

        await expect(page).toHaveURL(new RegExp(`/app/papers/shelf/${shelf.key}$`));
        await expect(page.getByRole('heading', { level: 1, name: shelf.label })).toBeVisible();
        // Every row ends in its page count, which the crumb back to the wall
        // does not — that is what separates the list from the chrome.
        const rows = page.getByRole('main').getByRole('link', { name: /\d+ pages?$/ });
        await expect(rows, `the ${shelf.label} shelf lists what its card counts`)
          .toHaveCount(shelf.count);

        await page.goBack();
        await expect(page).toHaveURL(/\/app\/papers$/);
      }
    });

  test('the photos card opens a shelf that sends you to the records instead', async ({ page }) => {
    await page.goto('/app/papers');
    await page.getByRole('link')
      .filter({ has: page.getByRole('heading', { level: 3, name: 'Photos', exact: true }) })
      .click();

    await expect(page).toHaveURL(/\/app\/papers\/shelf\/photos$/);
    await expect(page.getByText('Photographs live on the record they are of')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Open your properties' }))
      .toHaveAttribute('href', '/app/properties');
    // Said in words rather than left as "no papers here": the photographs are
    // real, they are just filed against the land they show.
    await expect(page.getByText('the same file, three lenses')).toBeVisible();
  });

  test('a vault that has not answered yet holds its shape and claims nothing', async ({ page, world }) => {
    world.set('vault', World.never());
    await page.goto('/app/papers');

    await expect(page.getByText('Loading your papers…')).toBeVisible();
    await expect(page.getByRole('heading', { level: 3, name: 'Title' })).toBeHidden();
    await expect(page.getByText('Nothing is out on a link right now.')).toBeHidden();
  });

  test('a vault that will not load says so, and says it lost nothing', async ({ page, world }) => {
    world.set('vault', World.gqlError('the paper store is down'));
    await page.goto('/app/papers');

    await expect(page.getByRole('alert')).toContainText('Your papers did not load');
    await expect(page.getByText('Your records are untouched.')).toBeVisible();
    // The reason is printed verbatim, for whoever is being asked "what does it
    // say?" down a phone line.
    await expect(page.getByText('the paper store is down')).toBeVisible();
    await expect(page.getByRole('heading', { level: 3, name: 'Title' })).toBeHidden();
  });

  test('Try again on a failed vault actually draws the wall', async ({ page, world }) => {
    const vault = world.seedOf<VaultAnswer>('vault');
    world.set('vault', World.gqlError('the paper store is down'));
    await page.goto('/app/papers');
    await expect(page.getByRole('alert')).toContainText('Your papers did not load');

    world.set('vault', vault);
    await page.getByRole('button', { name: 'Try again' }).click();

    await expect(page.getByRole('heading', { level: 3, name: 'Title' })).toBeVisible();
    await expect(page.getByRole('alert')).toBeHidden();
  });

  // ── DEFECT ────────────────────────────────────────────────────────────
  // apps/web/src/w360/pages/Vault.tsx:422-570 — Vault() has no branch for a
  // vault with nothing in it. With total 0, no shelves and no links it still
  // draws a search box over nothing to search, an empty shelf grid, the share
  // log with "Nothing is out on a link right now." and the four-sentence
  // footnote about revoking links nobody has. The founder's zero-state rule is
  // one sentence and the one thing to do; the owner is owed an Empty naming
  // that the vault is empty, with "Add papers" as its action, and none of the
  // chrome that describes papers that are not there.
  test.fail('a vault with nothing in it says one thing instead of drawing the whole wall',
    async ({ page, world }) => {
      world.patch('vault', { total: 0, shelves: [], links: [] });
      await page.goto('/app/papers');

      await expect(page.getByRole('button', { name: 'Add papers' })).toBeVisible();
      await expect(page.getByLabel('Search your papers by name')).toBeHidden({ timeout: 3_000 });
      await expect(page.getByText('Revoking kills a link in seconds')).toBeHidden({ timeout: 3_000 });
      await expect(page.getByText('Nothing is out on a link right now.')).toBeHidden({ timeout: 3_000 });
    });

  test('the wall is still one tap per shelf on a phone @phone', async ({ page }) => {
    await page.goto('/app/papers');
    const cards = page.getByRole('link')
      .filter({ has: page.getByRole('heading', { level: 3 }) });
    await expect(cards).toHaveCount(SHELVES.length);

    await cards.filter({ has: page.getByRole('heading', { name: 'Revenue record', exact: true }) }).click();
    await expect(page).toHaveURL(/\/app\/papers\/shelf\/revenue$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Revenue record' })).toBeVisible();
  });
});

// ═══════════════════════════════════════════════════════════════════════
test.describe('the share log', () => {
  test('every link out is listed with who holds it, what it is of, and its terms',
    async ({ page, world }) => {
      world.patch('vault', {
        links: [
          aLink({ id: LINK.buyer }),
          aLink({
            id: LINK.bank, audience: 'Union Bank, Markapur', subject: 'Flat 4B, Sai Residency',
            terms: 'View and download', initials: 'UB', docCount: 2, openedCount: 1,
            expiresOn: inDays(7), daysLeft: 7,
          }),
        ],
      });
      await page.goto('/app/papers');

      await expect(page.getByText('Out on a link right now · 2')).toBeVisible();
      await expect(page.getByText('Prospective buyer — Sy 214/2')).toBeVisible();
      await expect(page.getByText('View only · no download')).toBeVisible();
      await expect(page.getByText('Union Bank, Markapur — Flat 4B, Sai Residency')).toBeVisible();
      await expect(page.getByText('View and download')).toBeVisible();
      await expect(page.getByRole('button', { name: 'Revoke' })).toHaveCount(2);
      // The avatar carries the initials the server stored against the link
      // (web360.py:3728), not initials this screen made up from the audience.
      await expect(page.getByText('PB', { exact: true })).toBeVisible();
      await expect(page.getByText('UB', { exact: true })).toBeVisible();
    });

  test('a link says what is left of it in days, not in a date to be worked out',
    async ({ page, world }) => {
      world.patch('vault', {
        links: [
          aLink({ id: LINK.buyer, expiresOn: inDays(18) }),
          aLink({ id: LINK.bank, audience: 'Union Bank, Markapur', expiresOn: inDays(1) }),
          aLink({ id: 'w-link-today', audience: 'Surveyor', expiresOn: inDays(0) }),
        ],
      });
      await page.goto('/app/papers');

      await expect(page.getByText('18 days left')).toBeVisible();
      await expect(page.getByText('expires tomorrow')).toBeVisible();
      // A link that runs out today still opens today, so it stays in the live
      // list and says which day it is.
      await expect(page.getByText('expires today')).toBeVisible();
      await expect(page.getByText('Out on a link right now · 3')).toBeVisible();
    });

  test('a lapsed link is shown as lapsed, not as one expiring soon', async ({ page, world }) => {
    world.patch('vault', {
      links: [
        aLink({ id: LINK.buyer, expiresOn: inDays(18) }),
        aLink({
          id: LINK.lapsed, audience: 'Surveyor', subject: 'Sy 214/2', terms: 'View only',
          initials: 'S', docCount: 1, openedCount: 0, lastOpenedAt: '',
          // The server clamps daysLeft to 0 for a date that has passed AND for
          // a row with no date, which is exactly why the screen parses the
          // stored date itself rather than reading this number.
          expiresOn: inDays(-43), daysLeft: 0,
        }),
      ],
    });
    await page.goto('/app/papers');

    await expect(page.getByText('Out on a link right now · 1')).toBeVisible();
    await expect(page.getByText('Lapsed · 1')).toBeVisible();
    await expect(page.getByText(`expired ${inDays(-43)}`)).toBeVisible();
    await expect(page.getByText('expires tomorrow')).toBeHidden();
    await expect(page.getByText('These have passed their date and no longer open.')).toBeVisible();
  });

  test('a link nobody gave an expiry says so, rather than counting days it does not have',
    async ({ page, world }) => {
      // '' is what `expires_on` holds by default (web360.py:183), and the old
      // screen read the server's clamped daysLeft and said "expires tomorrow"
      // over it.
      world.patch('vault', { links: [aLink({ id: LINK.buyer, expiresOn: '', daysLeft: 0 })] });
      await page.goto('/app/papers');

      await expect(page.getByText('no expiry recorded')).toBeVisible();
      await expect(page.getByText('Out on a link right now · 1')).toBeVisible();
      await expect(page.getByText('Lapsed ·')).toBeHidden();
    });

  test('a link whose date could never have existed is not given four more days',
    async ({ page, world }) => {
      // Vault.tsx:56-58 — `new Date(2026, 1, 31)` rolls forward to 3 March
      // rather than failing, so a row stored as 31/02/2026 would otherwise be
      // read as four days out. The day check is what makes it say the only
      // true thing instead. (The ISO dates fixtures/seed.ts holds fall into
      // the same answer one line earlier, at the regex.)
      world.patch('vault', { links: [aLink({ id: LINK.buyer, expiresOn: '31/02/2026', daysLeft: 4 })] });
      await page.goto('/app/papers');

      await expect(page.getByText('no expiry recorded')).toBeVisible();
      await expect(page.getByText(/days? left/)).toBeHidden();
      await expect(page.getByText('Out on a link right now · 1')).toBeVisible();
    });

  test('nothing out on a link says that, and draws no lapsed shelf', async ({ page, world }) => {
    world.patch('vault', { links: [] });
    await page.goto('/app/papers');

    await expect(page.getByText('Out on a link right now · 0')).toBeVisible();
    await expect(page.getByText('Nothing is out on a link right now.')).toBeVisible();
    await expect(page.getByText('Lapsed ·')).toBeHidden();
    await expect(page.getByRole('button', { name: 'Revoke' })).toHaveCount(0);
  });

  test('the log points at the full share log rather than pretending to be it', async ({ page }) => {
    await page.goto('/app/papers');
    await expect(page.getByRole('link', { name: 'Full share log ›' }))
      .toHaveAttribute('href', '/app/audit');
    await expect(page.getByText('Nothing leaves this vault without appearing in this list.'))
      .toBeVisible();
  });

  test('revoking asks first, and says what the person on the other end loses',
    async ({ page, world }) => {
      world.patch('vault', { links: [aLink({ id: LINK.buyer })] });
      await page.goto('/app/papers');

      await page.getByRole('button', { name: 'Revoke' }).click();

      await expect(page.getByRole('dialog')).toBeVisible();
      await expect(page.getByRole('heading', { name: 'Revoke the link to Prospective buyer?' }))
        .toBeVisible();
      await expect(page.getByRole('dialog')).toContainText(
        'Prospective buyer loses access to Sy 214/2 the moment you do this, mid-read if they are reading it.',
      );
      expect(world.calls('revokeShareLink')).toHaveLength(0);
    });

  test('keeping the link changes nothing at all', async ({ page, world }) => {
    world.patch('vault', { links: [aLink({ id: LINK.buyer })] });
    await page.goto('/app/papers');

    await page.getByRole('button', { name: 'Revoke' }).click();
    await page.getByRole('button', { name: 'Keep the link' }).click();

    await expect(page.getByRole('dialog')).toBeHidden();
    await expect(page.getByText('Prospective buyer — Sy 214/2')).toBeVisible();
    expect(world.calls('revokeShareLink')).toHaveLength(0);
  });

  test('revoking a link takes it off the list and says who can no longer open what',
    async ({ page, world }) => {
      const vault = world.seedOf<VaultAnswer>('vault');
      let links = [aLink({ id: LINK.buyer }), aLink({ id: LINK.bank, audience: 'Union Bank, Markapur' })];
      world.set('vault', () => ({ ...vault, links }));
      world.set('revokeShareLink', (vars) => {
        links = links.filter((l) => l.id !== String(vars.linkId));
        return true;
      });
      await page.goto('/app/papers');

      await page.getByRole('button', { name: 'Revoke' }).first().click();
      await page.getByRole('button', { name: 'Revoke it' }).click();

      await expect(page.getByText('Prospective buyer can no longer open Sy 214/2.')).toBeVisible();
      await expect(page.getByText('Prospective buyer — Sy 214/2')).toBeHidden();
      await expect(page.getByText('Out on a link right now · 1')).toBeVisible();
      expect(world.lastVars('revokeShareLink')).toMatchObject({ linkId: LINK.buyer });
    });

  test('revoking a lapsed link says nobody loses access today', async ({ page, world }) => {
    const vault = world.seedOf<VaultAnswer>('vault');
    let links = [aLink({ id: LINK.lapsed, audience: 'Surveyor', expiresOn: inDays(-43), daysLeft: 0 })];
    world.set('vault', () => ({ ...vault, links }));
    world.set('revokeShareLink', (vars) => {
      links = links.filter((l) => l.id !== String(vars.linkId));
      return true;
    });
    await page.goto('/app/papers');

    await page.getByRole('button', { name: 'Revoke' }).click();
    await expect(page.getByRole('dialog')).toContainText(
      'This link has already lapsed, so nobody loses access today',
    );
    await page.getByRole('button', { name: 'Revoke it' }).click();

    await expect(page.getByText('The lapsed link to Surveyor is off this list. The full share log keeps it.'))
      .toBeVisible();
    await expect(page.getByText('Lapsed ·')).toBeHidden();
  });

  test('a link the server will not let go of stays on the list, and says so',
    async ({ page, world }) => {
      world.patch('vault', { links: [aLink({ id: LINK.buyer })] });
      world.set('revokeShareLink', false);
      await page.goto('/app/papers');

      await page.getByRole('button', { name: 'Revoke' }).click();
      await page.getByRole('button', { name: 'Revoke it' }).click();

      await expect(page.getByText('That link could not be revoked. It may already be off the list — reload to check.'))
        .toBeVisible();
      // The link is still live and still unwanted, so the dialog stays open.
      await expect(page.getByRole('dialog')).toBeVisible();
      await expect(page.getByText('Prospective buyer — Sy 214/2')).toBeVisible();
    });

  test('a revoke that never reached the server says nothing has changed', async ({ page, world }) => {
    world.patch('vault', { links: [aLink({ id: LINK.buyer })] });
    world.set('revokeShareLink', World.gqlError('the session has expired'));
    await page.goto('/app/papers');

    await page.getByRole('button', { name: 'Revoke' }).click();
    await page.getByRole('button', { name: 'Revoke it' }).click();

    await expect(page.getByRole('alert')
      .filter({ hasText: 'Revoking that link could not be saved. Nothing has changed.' }))
      .toBeVisible();
    await expect(page.getByText('the session has expired')).toBeVisible();
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.getByText('Prospective buyer — Sy 214/2')).toBeVisible();
  });

  test('one link being revoked does not freeze the buttons on the others', async ({ page, world }) => {
    world.patch('vault', {
      links: [
        aLink({ id: LINK.buyer }),
        aLink({ id: LINK.bank, audience: 'Union Bank, Markapur' }),
        aLink({ id: 'w-link-third', audience: 'Ravi Kumar' }),
      ],
    });
    world.set('revokeShareLink', World.slow(2_500, true));
    await page.goto('/app/papers');

    await page.getByRole('button', { name: 'Revoke' }).first().click();
    await page.getByRole('button', { name: 'Revoke it' }).click();

    // The row being cut off says so; the two links nobody touched keep their
    // own buttons, because each row holds its own mutation.
    await expect(page.getByRole('button', { name: 'Revoking…' }).first()).toBeVisible();
    const others = page.getByRole('button', { name: 'Revoke', exact: true });
    await expect(others).toHaveCount(2);
    await expect(others.nth(0)).toBeEnabled();
    await expect(others.nth(1)).toBeEnabled();
  });

  test('a revoke already under way cannot be escaped out of half-done', async ({ page, world }) => {
    world.patch('vault', { links: [aLink({ id: LINK.buyer })] });
    world.set('revokeShareLink', World.slow(2_500, true));
    await page.goto('/app/papers');

    await page.getByRole('button', { name: 'Revoke' }).click();
    await page.getByRole('button', { name: 'Revoke it' }).click();

    // The write is in flight and its answer is not back yet, so neither way
    // out is offered: Vault passes `busy` to the Dialog (Vault.tsx:147), which
    // refuses Keep the link and stops Escape from closing over a write whose
    // outcome nobody knows.
    await expect(page.getByRole('dialog')).toHaveAttribute('aria-busy', 'true');
    await expect(page.getByRole('button', { name: 'Keep the link' })).toBeDisabled();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toBeVisible();
  });

  // ── DEFECT ────────────────────────────────────────────────────────────
  // apps/web/src/w360/pages/Vault.tsx:121-140 — LinkRow draws the audience,
  // the subject, the terms and the span, and drops the three facts the query
  // paid for: `docCount`, `openedCount` and `lastOpenedAt` (api.ts:375 selects
  // all three). An owner deciding whether to cut a link off wants to know how
  // many papers went out on it and whether anybody ever opened it — "4 papers
  // · opened 3 times, last 10/09/2026" — and a share log that cannot answer
  // "did the bank ever read it?" is a list of promises, not a log.
  test.fail('the share log says how many papers went out and whether they were opened',
    async ({ page, world }) => {
      world.patch('vault', {
        links: [aLink({ id: LINK.buyer, docCount: 4, openedCount: 3, lastOpenedAt: inDays(-3) })],
      });
      await page.goto('/app/papers');

      await expect(page.getByText('Prospective buyer — Sy 214/2')).toBeVisible();
      await expect(page.getByRole('main').getByText(/opened\s+3|3\s+(opens|times)/i))
        .toBeVisible({ timeout: 3_000 });
    });

  // ── DEFECT ────────────────────────────────────────────────────────────
  // apps/web/src/w360/pages/Vault.tsx:86-96 — "Extend" was pulled off this row
  // because `extendShareLink` did `UPDATE share_links SET sort = sort + days`,
  // which moved the row and told the owner a buyer had another week they did
  // not have. That is fixed: services/api/src/web360.py:4522-4536 now reads
  // `expires_on`, adds the days to whichever of today and the stored date is
  // later, and writes `expires_on` back in DD/MM/YYYY. The stated condition for
  // giving the control back is met, and the owner is owed a way to add days to
  // a link that lapses tomorrow other than making a second link and revoking
  // the first. (apps/web/src/w360/api.ts:871-875 needs a fix in the same
  // breath: useExtendLink types its answer as `Wrapped<'extendLink'>` while the
  // mutation selects `extendShareLink`, so the boolean reads back undefined.)
  test.fail('a link that lapses tomorrow can be given more days', async ({ page, world }) => {
    world.patch('vault', { links: [aLink({ id: LINK.buyer, expiresOn: inDays(1), daysLeft: 1 })] });
    await page.goto('/app/papers');

    await expect(page.getByText('expires tomorrow')).toBeVisible();
    await page.getByRole('button', { name: /Extend/i }).click({ timeout: 3_000 });
    await expect.poll(() => world.calls('extendShareLink').length).toBeGreaterThan(0);
    expect(world.lastVars('extendShareLink')).toMatchObject({ linkId: LINK.buyer });
    expect(world.lastVars('extendShareLink').days).toBeGreaterThan(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════
test.describe('searching the vault', () => {
  test('the box says what it searches, and one letter is not a search', async ({ page, world }) => {
    await page.goto('/app/papers');
    const box = page.getByLabel('Search your papers by name');

    // The placeholder used to promise "including their text". Nothing indexes
    // the writing inside a scan.
    await expect(box).toHaveAttribute('placeholder', 'Search 27 papers by name');

    await box.fill('d');
    await expect(page.getByText('Papers named like')).toBeHidden();
    expect(world.calls('search')).toHaveLength(0);
  });

  test('a paper is found by the name it was filed under', async ({ page, world }) => {
    await page.goto('/app/papers');
    await page.getByLabel('Search your papers by name').fill('deed');

    await expect(page.getByText('Papers named like “deed” · 1')).toBeVisible();
    const hit = page.getByRole('main').getByRole('link', { name: /Sale deed 4412 of 1998/ });
    await expect(hit).toHaveAttribute('href', `/app/papers/${PAPER.deed}`);
    await expect(page.getByText('Markapur SRO · 1998 · 14 pages')).toBeVisible();
    expect(world.lastVars('search')).toMatchObject({ q: 'deed' });
  });

  test('a parcel that matches does not turn up on a screen called Papers', async ({ page }) => {
    // `search` answers records, papers and people in one list; only papers
    // belong here, and the heading would otherwise be denying its own results.
    await page.goto('/app/papers');
    await page.getByLabel('Search your papers by name').fill('Katragunta');

    await expect(page.getByText('Papers named like “Katragunta” · 0')).toBeVisible();
    await expect(page.getByText('No paper is named “Katragunta”')).toBeVisible();
    await expect(page.getByRole('main').getByRole('link', { name: /Sy 214\/2/ })).toBeHidden();
  });

  test('a search with no answer explains what search can and cannot read', async ({ page }) => {
    await page.goto('/app/papers');
    await page.getByLabel('Search your papers by name').fill('zzzz');

    await expect(page.getByText('No paper is named “zzzz”')).toBeVisible();
    await expect(page.getByText(
      'Search reads the names papers were filed under, not the writing inside them.',
    )).toBeVisible();
  });

  test('the box answers five at a time and says that is what it did', async ({ page, world }) => {
    world.set('search', Array.from({ length: 5 }, (_, i) => ({
      id: `w-paper-hit-${i + 1}`, kind: 'paper', title: `Sale deed ${i + 1}`,
      subtitle: 'Markapur SRO', route: `/app/papers/w-paper-hit-${i + 1}`,
    })));
    await page.goto('/app/papers');
    await page.getByLabel('Search your papers by name').fill('sale');

    await expect(page.getByText('Papers named like “sale” · 5')).toBeVisible();
    // The sentence is only true if the list under it is the five: a screen
    // drawing three and saying "the 5 closest" is the lie this asserts away.
    await expect(page.getByRole('main').getByRole('link', { name: /^Sale deed \d/ })).toHaveCount(5);
    await expect(page.getByText(
      'The 5 closest by name — the box answers 5 at a time. Open a shelf below to look through everything filed on it.',
    )).toBeVisible();
  });

  test('Clear puts the wall back and the caret back in the box', async ({ page }) => {
    await page.goto('/app/papers');
    const box = page.getByLabel('Search your papers by name');
    await box.fill('deed');
    await expect(page.getByText('Papers named like “deed” · 1')).toBeVisible();

    await page.getByRole('button', { name: 'Clear' }).click();

    await expect(page.getByText('Papers named like')).toBeHidden();
    await expect(box).toHaveValue('');
    await expect(box).toBeFocused();
    await expect(page.getByRole('heading', { level: 3, name: 'Title' })).toBeVisible();
  });

  test('the results sit above the wall, so an answer is never below the fold',
    async ({ page }) => {
      await page.goto('/app/papers');
      await page.getByLabel('Search your papers by name').fill('deed');

      const results = page.getByText('Papers named like “deed” · 1');
      const firstShelf = page.getByRole('heading', { level: 3, name: 'Title' });
      await expect(results).toBeVisible();
      const resultsBox = await results.boundingBox();
      const shelfBox = await firstShelf.boundingBox();
      expect(resultsBox && shelfBox && resultsBox.y < shelfBox.y).toBe(true);
    });

  test('a search that could not run says so instead of saying nothing matched',
    async ({ page, world }) => {
      world.set('search', World.gqlError('the index is rebuilding'));
      await page.goto('/app/papers');
      await page.getByLabel('Search your papers by name').fill('deed');

      await expect(page.getByRole('alert')).toContainText('That search did not load');
      await expect(page.getByText('the index is rebuilding')).toBeVisible();
      await expect(page.getByText('No paper is named')).toBeHidden();
    });

  test('a search still in flight does not answer a question nobody asked', async ({ page, world }) => {
    world.set('search', World.slow(6_000, []));
    await page.goto('/app/papers');
    await page.getByLabel('Search your papers by name').fill('deed');

    await expect(page.getByText('Papers named like “deed” · 0')).toBeVisible();
    await expect(page.getByRole('main').getByRole('status')).toBeVisible();
    await expect(page.getByText('No paper is named “deed”')).toBeHidden();
  });

  test('the answer already on screen stays there while the next letter is looked up',
    async ({ page, world }) => {
      // The first string answers at once; every later one hangs. Without
      // `keepPreviousData` (api.ts:573) the list would blank on the keystroke
      // and the owner would watch their own answer disappear as they typed.
      world.set('search', (vars) => (String(vars.q) === 'deed'
        ? [{
            id: PAPER.deed, kind: 'paper', title: 'Sale deed 4412 of 1998',
            subtitle: 'Markapur SRO · 1998 · 14 pages', route: `/app/papers/${PAPER.deed}`,
          }]
        : World.slow(4_000, [])));
      await page.goto('/app/papers');
      const box = page.getByLabel('Search your papers by name');

      await box.fill('deed');
      await expect(page.getByText('Papers named like “deed” · 1')).toBeVisible();

      await box.fill('deeds');

      await expect(page.getByText('Papers named like “deeds” · 1')).toBeVisible();
      await expect(page.getByRole('main').getByRole('link', { name: /Sale deed 4412 of 1998/ }))
        .toBeVisible();
      await expect(page.getByText('No paper is named “deeds”')).toBeHidden();
    });
});

// ═══════════════════════════════════════════════════════════════════════
test.describe('adding papers', () => {
  test('Add papers asks which property before anything else', async ({ page }) => {
    await page.goto('/app/papers');
    await page.getByRole('button', { name: 'Add papers' }).click();

    await expect(page.getByRole('heading', { name: 'Which property are these papers for?' }))
      .toBeVisible();
    await expect(page.getByRole('dialog')).toContainText(
      'Every paper is filed against the property it belongs to — that is what lets a deed be checked against the record it names.',
    );
    await expect(page.getByRole('button', { name: 'Sy 214/2' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Sy 88' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Flat 4B, Sai Residency' })).toBeVisible();
    // The picker offers the portfolio, and an archived record is not in it —
    // filing a fresh paper against a property you have put away is not a thing
    // to be one mis-click from.
    await expect(page.getByRole('button', { name: 'Shop 7, Market Road' })).toBeHidden();
  });

  test('picking the property lands on that record, where filing actually works',
    async ({ page }) => {
      await page.goto('/app/papers');
      await page.getByRole('button', { name: 'Add papers' }).click();
      await page.getByRole('button', { name: 'Sy 214/2' }).click();

      await expect(page).toHaveURL(new RegExp(`/app/records/${ID.parcel}$`));
      await expect(page.getByRole('dialog')).toBeHidden();
      await expect(page.getByRole('heading', { name: 'Sy 214/2' }).first()).toBeVisible();
    });

  test('the picker narrows on village, survey number or khata', async ({ page }) => {
    await page.goto('/app/papers');
    await page.getByRole('button', { name: 'Add papers' }).click();
    const box = page.getByLabel('Search your properties');

    await box.fill('Kukatpally');
    await expect(page.getByRole('button', { name: 'Flat 4B, Sai Residency' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Sy 214/2' })).toBeHidden();
    await expect(page.getByRole('button', { name: 'Sy 88' })).toBeHidden();

    // All three, because all three are how an owner refers to a piece of land
    // — the placeholder promises survey no, village and khata by name.
    await box.fill('214');
    await expect(page.getByRole('button', { name: 'Sy 214/2' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Flat 4B, Sai Residency' })).toBeHidden();

    await box.fill('1042');
    await expect(page.getByRole('button', { name: 'Sy 214/2' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Sy 88' })).toBeHidden();
  });

  test('a picker with more properties than it draws says how many it is holding back',
    async ({ page, world }) => {
      world.set('properties', bigPortfolio(14));
      await page.goto('/app/papers');
      await page.getByRole('button', { name: 'Add papers' }).click();

      await expect(page.getByRole('button', { name: 'Sy 412' })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Sy 413' })).toBeHidden();
      await expect(page.getByText('The first 12 of 14 properties — search to narrow it.'))
        .toBeVisible();
    });

  test('a search that is still too wide says to narrow it further', async ({ page, world }) => {
    world.set('properties', bigPortfolio(14));
    await page.goto('/app/papers');
    await page.getByRole('button', { name: 'Add papers' }).click();
    // Thirteen of the fourteen are in Katragunta; the list still stops at
    // twelve, and the sentence counts matches rather than properties.
    await page.getByLabel('Search your properties').fill('Katragunta');

    await expect(page.getByText('The first 12 of 13 matches — narrow it further.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Sy 401' })).toBeHidden();
  });

  test('a picker search that matches nothing names what it looked for', async ({ page }) => {
    await page.goto('/app/papers');
    await page.getByRole('button', { name: 'Add papers' }).click();
    await page.getByLabel('Search your properties').fill('Chennai');

    await expect(page.getByText('No property matches “Chennai”.')).toBeVisible();
  });

  test('the picker waits for the properties rather than showing an empty list',
    async ({ page, world }) => {
      world.set('properties', World.never());
      await page.goto('/app/papers');
      await page.getByRole('button', { name: 'Add papers' }).click();

      await expect(page.getByRole('dialog').getByRole('status')).toBeVisible();
      await expect(page.getByLabel('Search your properties')).toBeHidden();
    });

  test('a picker whose properties will not load says so inside the dialog',
    async ({ page, world }) => {
      world.set('properties', World.gqlError('the record store is down'));
      await page.goto('/app/papers');
      await page.getByRole('button', { name: 'Add papers' }).click();

      await expect(page.getByRole('dialog').getByRole('alert'))
        .toContainText('Your properties did not load');
      await expect(page.getByText('the record store is down')).toBeVisible();
    });

  test('with no properties at all, the dialog says a property comes first', async ({ page, world }) => {
    // `properties` is seeded as a FUNCTION of the filter, so there is no
    // object to patch — an account with nothing in it is set whole.
    world.set('properties', EMPTY_PORTFOLIO);
    await page.goto('/app/papers');
    await page.getByRole('button', { name: 'Add papers' }).click();

    await expect(page.getByText('There is nothing to file papers against yet')).toBeVisible();
    await expect(page.getByText('A property comes first; its papers hang off it.')).toBeVisible();
    await page.getByRole('link', { name: 'Your properties' }).click();
    await expect(page).toHaveURL(/\/app\/properties$/);
  });

  test('Escape closes the picker and hands the keyboard back to the button that opened it',
    async ({ page }) => {
      await page.goto('/app/papers');
      const opener = page.getByRole('button', { name: 'Add papers' });
      await opener.click();
      await expect(page.getByRole('dialog')).toBeVisible();
      // Nothing has been typed and nothing is in flight, so Escape is a
      // dismissal rather than a discarded draft.
      await page.keyboard.press('Escape');

      await expect(page.getByRole('dialog')).toBeHidden();
      await expect(opener).toBeFocused();
    });

  test('Cancel closes the picker and files nothing', async ({ page }) => {
    await page.goto('/app/papers');
    await page.getByRole('button', { name: 'Add papers' }).click();
    await page.getByRole('button', { name: 'Cancel' }).click();

    await expect(page.getByRole('dialog')).toBeHidden();
    await expect(page).toHaveURL(/\/app\/papers$/);
  });

  test('a click outside the picker closes it, because nothing was typed into it',
    async ({ page }) => {
      await page.goto('/app/papers');
      await page.getByRole('button', { name: 'Add papers' }).click();
      await expect(page.getByRole('dialog')).toBeVisible();

      // The scrim covers the viewport and the dialog is centred in it, so a
      // click in the corner lands on the scrim itself.
      await page.mouse.click(6, 6);
      await expect(page.getByRole('dialog')).toBeHidden();
    });

  // ── DEFECT ────────────────────────────────────────────────────────────
  // apps/web/src/w360/pages/Vault.tsx:218 — `<Chip>{c.extent} {c.extentUnit}</Chip>`
  // prints the raw number, so a 1,450 sft flat reads "1450 sft" in the picker
  // while every other screen in the module writes it the Indian way (ui.tsx
  // inGroup/num/extent, and the card's own `extentAlt` already says
  // "1,450 sft"). The owner is owed the same figure in the same shape wherever
  // it appears.
  test.fail('the picker writes an extent the way the rest of the app writes it',
    async ({ page }) => {
      await page.goto('/app/papers');
      await page.getByRole('button', { name: 'Add papers' }).click();

      await expect(page.getByRole('dialog').getByText('1,450 sft')).toBeVisible({ timeout: 3_000 });
    });
});

// ═══════════════════════════════════════════════════════════════════════
test.describe('sharing a property', () => {
  test('Share a property picks the property first, because a link is one property',
    async ({ page }) => {
      await page.goto('/app/papers');
      await page.getByRole('button', { name: 'Share a property' }).click();

      await expect(page.getByRole('heading', { name: 'Share a property' })).toBeVisible();
      await expect(page.getByText('A link carries one property’s papers. Choose which, then say who it is for.'))
        .toBeVisible();
      await expect(page.getByRole('button', { name: 'Make the link' })).toBeDisabled();
      await expect(page.getByLabel('Who the link is for')).toBeHidden();
    });

  test('the property can be changed after it is chosen', async ({ page }) => {
    await page.goto('/app/papers');
    await page.getByRole('button', { name: 'Share a property' }).click();
    await page.getByRole('button', { name: 'Sy 214/2' }).click();

    await expect(page.getByLabel('Who the link is for')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Make the link' })).toBeDisabled();

    await page.getByRole('button', { name: 'Change' }).click();
    await expect(page.getByLabel('Search your properties')).toBeVisible();
    await expect(page.getByLabel('Who the link is for')).toBeHidden();
  });

  test('the caret is in the box the step needs, and moves when the step does',
    async ({ page }) => {
      await page.goto('/app/papers');
      await page.getByRole('button', { name: 'Share a property' }).click();

      // Two steps, one keyboard: the search is focused on open, and choosing a
      // property moves the caret to the only thing left to say (Vault.tsx:290).
      await expect(page.getByLabel('Search your properties')).toBeFocused();
      await page.getByRole('button', { name: 'Sy 214/2' }).click();
      await expect(page.getByLabel('Who the link is for')).toBeFocused();
    });

  test('a name of nothing but spaces does not make a link', async ({ page, world }) => {
    await page.goto('/app/papers');
    await page.getByRole('button', { name: 'Share a property' }).click();
    await page.getByRole('button', { name: 'Sy 214/2' }).click();
    await page.getByLabel('Who the link is for').fill('   ');

    // A link that says it is for "   " is a link nobody can account for later,
    // which is the whole point of the log below.
    await expect(page.getByRole('button', { name: 'Make the link' })).toBeDisabled();
    expect(world.calls('createShareLink')).toHaveLength(0);
  });

  test('Enter where the name was typed makes the link, without reaching for the mouse',
    async ({ page, world }) => {
      await page.goto('/app/papers');
      await page.getByRole('button', { name: 'Share a property' }).click();
      await page.getByRole('button', { name: 'Sy 214/2' }).click();
      await page.getByLabel('Who the link is for').fill('Union Bank, Markapur');

      await page.getByLabel('Who the link is for').press('Enter');

      await expect(page.getByLabel('Recipient link')).toBeVisible();
      expect(world.lastVars('createShareLink')).toMatchObject({
        recordId: ID.parcel, audience: 'Union Bank, Markapur',
      });
    });

  test('the link that was just made joins the list behind the dialog', async ({ page, world }) => {
    const vault = world.seedOf<VaultAnswer>('vault');
    let links: ShareLink[] = [];
    world.set('vault', () => ({ ...vault, links }));
    world.set('createShareLink', (vars) => {
      links = [aLink({
        id: 'w-link-made', audience: String(vars.audience), subject: 'Sy 214/2',
        expiresOn: inDays(30), daysLeft: 30,
      })];
      return '/share/tok-made';
    });
    await page.goto('/app/papers');
    await expect(page.getByText('Out on a link right now · 0')).toBeVisible();

    await page.getByRole('button', { name: 'Share a property' }).click();
    await page.getByRole('button', { name: 'Sy 214/2' }).click();
    await page.getByLabel('Who the link is for').fill('Union Bank, Markapur');
    await page.getByRole('button', { name: 'Make the link' }).click();
    await expect(page.getByLabel('Recipient link')).toBeVisible();
    await page.getByRole('button', { name: 'Done' }).click();

    // The promise under the list is that nothing leaves the vault without
    // appearing in it — including the link made one second ago, without a
    // reload to go and look for it.
    await expect(page.getByRole('dialog')).toBeHidden();
    await expect(page.getByText('Union Bank, Markapur — Sy 214/2')).toBeVisible();
    await expect(page.getByText('Out on a link right now · 1')).toBeVisible();
    await expect(page.getByText('30 days left')).toBeVisible();
  });

  test('the dialog states the terms of the link before it is made', async ({ page }) => {
    await page.goto('/app/papers');
    await page.getByRole('button', { name: 'Share a property' }).click();
    await page.getByRole('button', { name: 'Sy 214/2' }).click();

    await expect(page.getByText(
      'The current papers are selected when you make the link. Anyone with the link can view and download them for 30 days. You can revoke it from this page.',
    )).toBeVisible();
  });

  test('naming who it is for makes a 30-day view-only link on that record',
    async ({ page, world }) => {
      await page.goto('/app/papers');
      await page.getByRole('button', { name: 'Share a property' }).click();
      await page.getByRole('button', { name: 'Sy 214/2' }).click();
      await page.getByLabel('Who the link is for').fill('Union Bank, Markapur');
      await page.getByRole('button', { name: 'Make the link' }).click();

      await expect(page.getByText('The link is ready to copy and send.')).toBeVisible();
      expect(world.lastVars('createShareLink')).toMatchObject({
        recordId: ID.parcel, audience: 'Union Bank, Markapur', terms: 'view', days: 30,
      });
      await expect(page.getByLabel('Recipient link')).toHaveValue(/w-link-new$/);
      await expect(page.getByRole('button', { name: 'Done' })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Make the link' })).toBeHidden();
    });

  test('the made link is kept on screen until it has been copied', async ({ page }) => {
    await page.goto('/app/papers');
    await page.getByRole('button', { name: 'Share a property' }).click();
    await page.getByRole('button', { name: 'Sy 214/2' }).click();
    await page.getByLabel('Who the link is for').fill('Union Bank');
    await page.getByRole('button', { name: 'Make the link' }).click();
    await expect(page.getByLabel('Recipient link')).toBeVisible();

    await page.getByRole('button', { name: 'Copy link' }).click();

    // Either outcome is honest: the clipboard took it, or the owner is told to
    // select it themselves. Which one depends on the browser's permission, not
    // on the app.
    await expect(page.getByText(/Copied\.|Select the link above and copy it\./)).toBeVisible();
    // And either way the link is still on screen — a one-time secret that
    // clears itself the moment the copy is claimed to have worked is a link
    // nobody can paste twice.
    await expect(page.getByLabel('Recipient link')).toHaveValue(/w-link-new$/);
  });

  test('a link the server refuses to make says the property may not be yours to share',
    async ({ page, world }) => {
      world.set('createShareLink', '');
      await page.goto('/app/papers');
      await page.getByRole('button', { name: 'Share a property' }).click();
      await page.getByRole('button', { name: 'Sy 301' }).click();
      await page.getByLabel('Who the link is for').fill('Prospective buyer');
      await page.getByRole('button', { name: 'Make the link' }).click();

      await expect(page.getByText(
        'No link was made for Prospective buyer — this property may no longer be yours to share.',
      )).toBeVisible();
      await expect(page.getByLabel('Recipient link')).toBeHidden();
      await expect(page.getByLabel('Who the link is for')).toHaveValue('Prospective buyer');
    });

  test('a link that could not be saved keeps what was typed', async ({ page, world }) => {
    world.set('createShareLink', World.gqlError('the session has expired'));
    await page.goto('/app/papers');
    await page.getByRole('button', { name: 'Share a property' }).click();
    await page.getByRole('button', { name: 'Sy 214/2' }).click();
    await page.getByLabel('Who the link is for').fill('Union Bank, Markapur');
    await page.getByRole('button', { name: 'Make the link' }).click();

    await expect(page.getByRole('alert')
      .filter({ hasText: 'That share link could not be saved. Nothing has changed.' })).toBeVisible();
    await expect(page.getByLabel('Who the link is for')).toHaveValue('Union Bank, Markapur');
    await expect(page.getByText('Sy 214/2').first()).toBeVisible();
  });

  test('while the link is being made the dialog says so and refuses a second try',
    async ({ page, world }) => {
      world.set('createShareLink', World.slow(2_500, '/share/tok'));
      await page.goto('/app/papers');
      await page.getByRole('button', { name: 'Share a property' }).click();
      await page.getByRole('button', { name: 'Sy 214/2' }).click();
      await page.getByLabel('Who the link is for').fill('Union Bank');
      await page.getByRole('button', { name: 'Make the link' }).click();

      await expect(page.getByRole('button', { name: 'Making the link…' })).toBeDisabled();
      await expect(page.getByRole('button', { name: 'Cancel' })).toBeDisabled();
      // Both ways out are shut only while the write is in flight: when the
      // answer lands 2.5s later the dialog opens onto the link itself rather
      // than staying frozen.
      await expect(page.getByLabel('Recipient link')).toBeVisible();
    });

  test('a click outside does not throw away who the link is for', async ({ page }) => {
    await page.goto('/app/papers');
    await page.getByRole('button', { name: 'Share a property' }).click();
    await page.getByRole('button', { name: 'Sy 214/2' }).click();
    await page.getByLabel('Who the link is for').fill('Union Bank, Markapur');

    await page.mouse.click(6, 6);

    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.getByLabel('Who the link is for')).toHaveValue('Union Bank, Markapur');
  });

  test('with no properties there is nothing to share, and the dialog says which way out',
    async ({ page, world }) => {
      world.set('properties', EMPTY_PORTFOLIO);
      await page.goto('/app/papers');
      await page.getByRole('button', { name: 'Share a property' }).click();

      await expect(page.getByText('There is nothing to share yet')).toBeVisible();
      await expect(page.getByText('A link is made against one property and carries that property’s papers.'))
        .toBeVisible();
      // The primary stays on the footer and says what it is by being refused:
      // there is no property to make a link against, and the way out of that is
      // the Empty's own action, not this button.
      await expect(page.getByRole('button', { name: 'Make the link' })).toBeDisabled();
      await expect(page.getByRole('link', { name: 'Your properties' })).toBeVisible();
    });

  test('a share dialog whose properties will not load says so rather than offering none',
    async ({ page, world }) => {
      world.set('properties', World.gqlError('the record store is down'));
      await page.goto('/app/papers');
      await page.getByRole('button', { name: 'Share a property' }).click();

      await expect(page.getByRole('dialog').getByRole('alert'))
        .toContainText('Your properties did not load');
      // Nothing can be shared while the read is down, and the button says so by
      // refusing rather than by disappearing out from under the pointer.
      await expect(page.getByRole('button', { name: 'Make the link' })).toBeDisabled();
    });
});

// ═══════════════════════════════════════════════════════════════════════
test.describe('one shelf', () => {
  test('a shelf names itself, says what belongs on it, and lists what is filed',
    async ({ page, world }) => {
      await page.goto('/app/papers/shelf/title');

      await expect(page.getByRole('heading', { level: 1, name: 'Title' })).toBeVisible();
      // The lede is Shelf.tsx's own table (line 24), not the server's note —
      // the two agree in production and differ in the fixture.
      await expect(page.getByText('Deeds, wills, agreements')).toBeVisible();
      expect(world.lastVars('vaultPapers')).toMatchObject({ shelf: 'title' });

      const deed = page.getByRole('main').getByRole('link', { name: /Sale deed 4412 of 1998/ });
      await expect(deed).toHaveAttribute('href', `/app/papers/${PAPER.deed}`);
      await expect(deed).toContainText('Markapur SRO · 1998 · 14 pages');
      await expect(deed).toContainText('original');
      await expect(deed).toContainText('shared');
      await expect(deed).toContainText('14 pages');
    });

  test('the crumb goes back to the wall it came from', async ({ page }) => {
    await page.goto('/app/papers/shelf/revenue');
    await expect(page.getByRole('navigation', { name: 'Breadcrumb' }))
      .toContainText('Revenue record');

    await page.getByRole('navigation', { name: 'Breadcrumb' })
      .getByRole('link', { name: 'Papers' }).click();

    await expect(page).toHaveURL(/\/app\/papers$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Papers' })).toBeVisible();
  });

  test('searching a shelf narrows it to the paper you meant', async ({ page }) => {
    await page.goto('/app/papers/shelf/title');
    const box = page.getByLabel('Search the Title shelf');
    await expect(box).toHaveAttribute('placeholder', 'Search 6 papers on this shelf');

    await box.fill('Sale deed');

    const rows = page.getByRole('main').getByRole('link', { name: /\d+ pages?$/ });
    await expect(rows).toHaveCount(1);
    await expect(rows.first()).toContainText('Sale deed 4412 of 1998');
  });

  test('a shelf search reads the line under the name as well as the name', async ({ page }) => {
    await page.goto('/app/papers/shelf/title');
    // "Katragunta" is nowhere in any of these papers' names; it is in the one
    // line under five of them, which is exactly what the empty state below
    // promises search looks at.
    await page.getByLabel('Search the Title shelf').fill('Katragunta');

    const rows = page.getByRole('main').getByRole('link', { name: /\d+ pages?$/ });
    await expect(rows).toHaveCount(5);
    await expect(page.getByRole('main').getByRole('link', { name: /Sale deed 4412 of 1998/ }))
      .toBeHidden();
  });

  test('a paper nobody has counted the pages of is a row, not a row claiming 0 pages',
    async ({ page, world }) => {
      // Shelf.tsx:141-150 — the detail, the tags, the shared flag and the page
      // count are each drawn only if there is one. A paper filed with none of
      // them is the row that proves it: a bare name, and nothing invented.
      world.set('vaultPapers', [{
        id: PAPER.deed, title: 'Sale deed 4412 of 1998', detail: '', shelf: 'title',
        icon: 'title', tags: [], shared: false, pageCount: 0, fileRef: 'file-deed',
      }]);
      await page.goto('/app/papers/shelf/title');

      const row = page.getByRole('main').getByRole('link', { name: /Sale deed 4412 of 1998/ });
      await expect(row).toHaveAttribute('href', `/app/papers/${PAPER.deed}`);
      await expect(row).toHaveText('Sale deed 4412 of 1998');
      await expect(page.getByLabel('Search the Title shelf'))
        .toHaveAttribute('placeholder', 'Search 1 paper on this shelf');
    });

  test('an empty Title shelf says what would land on it', async ({ page, world }) => {
    // The other side of the Identity defect below: where the note IS a noun
    // phrase the sentence reads properly, and this is the wording the two
    // broken shelves are owed.
    const vault = world.seedOf<VaultAnswer>('vault');
    world.patch('vault', {
      shelves: vault.shelves.map((s) => (s.key === 'title' ? { ...s, count: 0 } : s)),
    });
    world.set('vaultPapers', []);
    await page.goto('/app/papers/shelf/title');

    await expect(page.getByText('Nothing is filed under Title yet')).toBeVisible();
    await expect(page.getByText(
      'Papers land here as they are read. Deeds, wills, agreements belong on this shelf.',
    )).toBeVisible();
    await expect(page.getByText('The shelf count disagrees with this list')).toBeHidden();
    await expect(page.getByRole('link', { name: 'Back to your papers' }))
      .toHaveAttribute('href', '/app/papers');
  });

  test('a shelf search that matches nothing offers the way back to the whole shelf',
    async ({ page }) => {
      await page.goto('/app/papers/shelf/title');
      await page.getByLabel('Search the Title shelf').fill('zzzz');

      await expect(page.getByText('Nothing on this shelf matches “zzzz”')).toBeVisible();
      await expect(page.getByText('Search looks at the paper’s name and its one-line detail.'))
        .toBeVisible();

      await page.getByRole('button', { name: 'Clear' }).click();
      await expect(page.getByRole('main').getByRole('link', { name: /\d+ pages?$/ }))
        .toHaveCount(6);
    });

  test('a shelf with nothing on it is not offered a search box', async ({ page, world }) => {
    const vault = world.seedOf<VaultAnswer>('vault');
    world.patch('vault', {
      shelves: vault.shelves.map((s) => (s.key === 'identity' ? { ...s, count: 0 } : s)),
    });
    world.set('vaultPapers', []);
    await page.goto('/app/papers/shelf/identity');

    await expect(page.getByText('Nothing is filed under Identity yet')).toBeVisible();
    await expect(page.getByLabel('Search the Identity shelf')).toBeHidden();
  });

  test('a shelf that disagrees with its own card admits it', async ({ page, world }) => {
    // The card says six and the shelf lists none: exactly the lie
    // `vaultPapers` was written to make impossible, said out loud when the two
    // sides do fall out of step.
    world.set('vaultPapers', []);
    await page.goto('/app/papers/shelf/title');

    await expect(page.getByText('Nothing is filed under Title yet')).toBeVisible();
    await expect(page.getByText('The shelf count disagrees with this list — that is worth reporting.'))
      .toBeVisible();
  });

  test('a made-up shelf key is refused by name, not fetched', async ({ page, world }) => {
    await page.goto('/app/papers/shelf/receipts');

    await expect(page.getByText('There is no shelf by that name')).toBeVisible();
    await expect(page.getByText(
      'The vault files everything on eight shelves: Title, Revenue record, Map, Identity, Search & tax, Old record, Photos and Unsorted.',
    )).toBeVisible();
    await expect(page.getByRole('link', { name: 'Back to your papers' }))
      .toHaveAttribute('href', '/app/papers');
    expect(world.asked('vaultPapers'), 'an unknown key must not reach the server').toBe(false);
  });

  test('a shelf that will not load says so and offers to try again', async ({ page, world }) => {
    world.set('vaultPapers', World.gqlError('the paper store is down'));
    await page.goto('/app/papers/shelf/map');

    await expect(page.getByRole('alert')).toContainText('The Map shelf did not load');
    await expect(page.getByText('the paper store is down')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Try again' })).toBeVisible();
  });

  test('a shelf still lists its papers when the wall’s counts cannot be read',
    async ({ page, world }) => {
      world.set('vault', World.gqlError('the paper store is down'));
      await page.goto('/app/papers/shelf/map');

      await expect(page.getByRole('heading', { level: 1, name: 'Map' })).toBeVisible();
      await expect(page.getByRole('main').getByRole('link', { name: /\d+ pages?$/ })).toHaveCount(3);
      await expect(page.getByRole('alert')).toBeHidden();
    });

  test('the unsorted shelf is a shelf like any other', async ({ page }) => {
    await page.goto('/app/papers/shelf/unsorted');

    await expect(page.getByRole('heading', { level: 1, name: 'Unsorted' })).toBeVisible();
    await expect(page.getByText('Nothing recognised it')).toBeVisible();
    const row = page.getByRole('main').getByRole('link', { name: /Scan 2026-08-02/ });
    await expect(row).toHaveAttribute('href', `/app/papers/${PAPER.unsorted}`);
  });

  // ── DEFECT ────────────────────────────────────────────────────────────
  // apps/web/src/w360/pages/Shelf.tsx:109 — `{papers.isLoading && <SkRowItems rows={5} />}`
  // drops five `aria-hidden` rows straight into the page: no live region, no
  // words, and outside the `.card > .rows.boxed` the real list is drawn in, so
  // the shape it is supposed to be holding is not the shape that arrives. Every
  // other loading state in the module is a `Loading what=` or a `SkRows` inside
  // skeletons.tsx's `Busy` for exactly this reason. The owner is owed a waiting
  // state that says which shelf is being fetched, in the same noun the failure
  // uses ("The Map shelf").
  test.fail('a shelf that is still loading says so instead of going quiet',
    async ({ page, world }) => {
      world.set('vaultPapers', World.never());
      await page.goto('/app/papers/shelf/map');

      await expect(page.getByRole('heading', { level: 1, name: 'Map' })).toBeVisible();
      await expect(page.getByRole('main').getByRole('status')).toBeVisible({ timeout: 3_000 });
    });

  // ── DEFECT ────────────────────────────────────────────────────────────
  // apps/web/src/w360/pages/Shelf.tsx:120 — the empty-shelf sentence is built
  // as `${shelf.note} belong on this shelf.`, which needs every note to be a
  // plural noun phrase. Six of the eight are. Identity's note is "Masked until
  // you unlock" and Unsorted's is "Nothing recognised it" (lines 27 and 31), so
  // an owner opening either empty shelf is told "Masked until you unlock belong
  // on this shelf." The owner is owed a sentence that parses — either notes
  // that are all noun phrases, or a per-shelf line that does not splice them.
  test.fail('an empty Identity shelf says a sentence that parses', async ({ page, world }) => {
    const vault = world.seedOf<VaultAnswer>('vault');
    world.patch('vault', {
      shelves: vault.shelves.map((s) => (s.key === 'identity' ? { ...s, count: 0 } : s)),
    });
    world.set('vaultPapers', []);
    await page.goto('/app/papers/shelf/identity');

    await expect(page.getByText('Nothing is filed under Identity yet')).toBeVisible();
    await expect(page.getByText('Masked until you unlock belong on this shelf.'))
      .toBeHidden({ timeout: 3_000 });
  });
});
