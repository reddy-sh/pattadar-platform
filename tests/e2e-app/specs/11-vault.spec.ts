/**
 * W15 — the vault and its shelves.
 *
 * Two screens: Documents at `/papers` (a file list — once a wall of eight
 * shelf cards — the search across it, and every link out of the vault; the
 * folders, filters and moves are 11c-documents-files.spec.ts) and one shelf at
 * `/papers/shelf/:key`. Between them they are the whole of
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
 *    at `/papers/:id` is another spec's screen; what this one owes is that
 *    a shelf row and a search hit point at the right paper.
 *
 * Two test.fail()s, each naming its cause: Extend is gone from a screen whose
 * server-side reason for losing it has since been fixed; and a loading shelf
 * announces nothing. Each one goes green the day it is fixed.
 */
import { test, expect, World } from '../fixtures/harness';
import type { Page } from '../fixtures/harness';
import { ID, PAPER, LINK, SHELVES } from '../fixtures/ids';
import { SEED } from '../fixtures/seed';
import type { AnswerFn } from '../fixtures/world';

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

/** The file list Documents draws (Vault.tsx `role="table"`), and one row of it. */
const fileTable = (page: Page) => page.getByRole('table', { name: 'Your private documents' });
const fileRow = (page: Page, name: string) => fileTable(page).getByRole('row').filter({ hasText: name });
/** A shelf's table rows (Shelf.tsx, the Table view). */
const shelfRows = (page: Page) => page.getByRole('main').locator('table.rectable tbody tr');

/** Every file the eight shelves hold, as `vaultPapers('all')` answers it.
 *
 *  FIXTURE GAP: the seeded `vaultPapers` is keyed on a shelf, so the
 *  `shelf: 'all'` read Documents makes since it became a file list answers
 *  nothing, and its rows carry none of `createdAt`, `mimeType`, `sizeBytes`,
 *  `folderId` or `linkedProperties`. Until fixtures/seed.ts answers 'all',
 *  this spec answers it itself from the same per-shelf rows, so the 27 files
 *  the vault head counts are the 27 the list draws. */
const SHELF_SEED = SEED.vaultPapers as AnswerFn;
const allFiles = (): Record<string, unknown>[] => SHELVES.flatMap((key, s) =>
  (SHELF_SEED({ shelf: key }, '') as Record<string, unknown>[]).map((p, i) => ({
    mimeType: 'application/pdf', sizeBytes: 0, folderId: '', jointFmbId: '', aadhaarCard: false,
    // Newest first is the list's default order: Title deeds is made the newest
    // shelf so the deed every test reaches for is on the first page of 25.
    linkedProperties: [], createdAt: `2026-09-${String(28 - s).padStart(2, '0')}T10:${String(59 - i).padStart(2, '0')}:00`,
    ...p,
  })));
const vaultPapersWithAll: AnswerFn = (vars, query) => (String(vars.shelf) === 'all'
  ? allFiles() : SHELF_SEED(vars, query));

test.beforeEach(async ({ world }) => {
  world.set('vaultPapers', vaultPapersWithAll);
});

// ═══════════════════════════════════════════════════════════════════════
// The wall of eight shelf cards was replaced by a file manager (W15 —
// "Documents: a file list, folders and every link you have out", Vault.tsx:1,
// specified in 11c-documents-files.spec.ts). Its card links, spines, empty
// slots and "Unsorted first" ordering no longer exist; what the wall promised
// that still stands — a count that agrees with the list, where the bytes are
// kept, an honest loading and failed state — is asserted on the list instead.
test.describe('the file list', () => {
  test('every document is listed, and the head counts what the list holds', async ({ page }) => {
    await page.goto('/papers');

    await expect(page.getByRole('heading', { level: 1, name: 'Documents' })).toBeVisible();
    // The head counts every document. Unfiltered, the filter bar adds no
    // tally of its own: "27 of 27 shown" next to "27 documents" said it twice.
    await expect(page.locator('.pagehead-summary'))
      .toHaveText(/^27 documents( · \d+ folders?)? · .+ · Private unless shared$/);
    await expect(page.getByRole('main').getByRole('status').filter({ hasText: / shown$/ })).toHaveCount(0);
    await expect(page.getByRole('heading', { level: 2, name: /^Documents · 27 documents$/ })).toBeAttached();
    // 25 to a page: the head's count is every file, not the page.
    await expect(fileTable(page).getByRole('checkbox', { name: /^Select (?!all)/ })).toHaveCount(25);
    await expect(page.getByRole('navigation', { name: 'Document pages' })).toContainText('1–25 of 27');
    await expect(fileRow(page, 'Sale deed 4412 of 1998')).toBeVisible();
  });

  test('where the documents are kept is said in the summary line, in the server’s words', async ({ page, world }) => {
    const vault = world.seedOf<VaultAnswer>('vault');
    await page.goto('/papers');

    // A data fact, not guidance: the summary carries it and there is no ⓘ
    // (design.md § Page head, ⓘ; F19).
    await expect(page.locator('.pagehead-summary')).toContainText(`${vault.regionNote} · Private unless shared`);
    await expect(page.getByRole('main').getByRole('button', { name: 'About Documents' })).toHaveCount(0);
    // The sentence is the server's, not the screen's.
    expect(vault.regionNote).toContain('ap-south-1');
  });

  test('a vault holding one paper does not call it 1 documents', async ({ page, world }) => {
    world.set('vaultPapers', (vars: Record<string, unknown>) => (String(vars.shelf) === 'all'
      ? allFiles().filter((p) => p.title === 'Sale deed 4412 of 1998') : []));
    await page.goto('/papers');

    await expect(page.locator('.pagehead-summary')).toHaveText(/^1 document( · \d+ folders?)? · /);
    await expect(page.getByRole('main').getByText(/\b1 documents\b/)).toHaveCount(0);
  });

  // The share register is its own read (`vault`); the documents are another.
  // Waiting on, or losing, the register must not hide a library that loaded.
  test('share links that have not answered yet hold back nothing else', async ({ page, world }) => {
    world.set('vault', World.never());
    await page.goto('/papers');

    await expect(page.getByRole('heading', { level: 1, name: 'Documents' })).toBeVisible();
    await expect(fileRow(page, 'Sale deed 4412 of 1998')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Add documents' })).toBeVisible();
    // No register is drawn until there is a link to list.
    await expect(page.getByText(/Active share links/)).toBeHidden();
  });

  test('share links that will not load say so, and the documents still list', async ({ page, world }) => {
    world.set('vault', World.gqlError('the paper store is down'));
    await page.goto('/papers');

    await expect(page.getByRole('alert')).toContainText('Your share links did not load');
    // The reason is printed verbatim, for whoever is being asked "what does it
    // say?" down a phone line.
    await expect(page.getByText('the paper store is down')).toBeVisible();
    await expect(fileRow(page, 'Sale deed 4412 of 1998')).toBeVisible();
  });

  test('Try again on failed share links draws the register', async ({ page, world }) => {
    const vault = world.seedOf<VaultAnswer>('vault');
    world.set('vault', World.gqlError('the paper store is down'));
    await page.goto('/papers');
    await expect(page.getByRole('alert')).toContainText('Your share links did not load');

    world.set('vault', vault);
    await page.getByRole('button', { name: 'Try again' }).click();

    await expect(page.getByRole('heading', { level: 2, name: 'Active share links', exact: true })).toBeVisible();
    await expect(page.getByRole('alert')).toBeHidden();
  });

  test('documents still loading hold the list’s shape and claim no count', async ({ page, world }) => {
    world.set('vaultPapers', World.never());
    await page.goto('/papers');

    await expect(page.getByText('Loading your documents…')).toBeAttached();
    await expect(page.getByText(/\b0 documents\b/)).toHaveCount(0);
    await expect(fileTable(page)).toBeHidden();
  });

  // The founder's zero-state rule: one sentence and the one thing to do, and
  // none of the chrome that describes documents that are not there.
  test('a vault with nothing in it says one thing instead of drawing the whole page',
    async ({ page, world }) => {
      world.patch('vault', { total: 0, shelves: [], links: [] });
      world.set('vaultPapers', []);
      world.set('vaultFolders', []);
      await page.goto('/papers');

      await expect(page.getByText('No documents yet')).toBeVisible();
      // Add documents once, in the empty state — not twice, six inches apart.
      await expect(page.getByRole('button', { name: 'Add documents' })).toHaveCount(1);
      await expect(page.getByRole('button', { name: '+ Filter' })).toHaveCount(0);
      await expect(page.getByRole('button', { name: 'New folder' })).toHaveCount(0);
      await expect(page.getByPlaceholder('Search documents')).toBeHidden({ timeout: 3_000 });
      await expect(page.getByText('New links let the person view and download for 30 days.')).toBeHidden({ timeout: 3_000 });
      await expect(page.getByText('No active share links.')).toBeHidden({ timeout: 3_000 });
    });

  test('the page reads h1 then h2, and standing guidance waits behind the ⓘ', async ({ page }) => {
    await page.goto('/papers');
    const main = page.getByRole('main');

    await expect(main.getByRole('heading', { level: 1, name: 'Documents' })).toBeVisible();
    // No eyebrow repeats the rail label over the title.
    await expect(main.getByText('Your documents', { exact: true })).toHaveCount(0);
    // The list and the share log are the page's second level; nothing skips to h3.
    await expect(main.getByRole('heading', { level: 2, name: 'Active share links', exact: true })).toBeVisible();
    await expect(main.getByRole('heading', { level: 3 })).toHaveCount(0);

    // The 30-day rule is behind the ⓘ, still announced to a screen reader.
    const tip = main.getByRole('button', { name: 'About Active share links' });
    await expect(tip).toHaveAccessibleDescription('New links let the person view and download for 30 days.');
    await expect(main.getByText('New links let the person view and download for 30 days.')).toBeHidden();
    await tip.focus();
    await expect(main.getByText('New links let the person view and download for 30 days.')).toBeVisible();
  });

  test('a list whose papers cannot be read says so, and the share log still stands',
    async ({ page, world }) => {
      world.set('vaultPapers', World.gqlError('the paper store is down'));
      await page.goto('/papers');
      await expect(page.getByRole('alert')).toContainText('Your documents did not load');
      await expect(fileTable(page)).toBeHidden();
      await expect(page.getByRole('heading', { level: 2, name: 'Active share links', exact: true })).toBeVisible();
    });

  test('the list still opens a file on a phone @phone', async ({ page }) => {
    await page.goto('/papers');
    await expect(fileRow(page, 'Sale deed 4412 of 1998')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Actions for Sale deed 4412 of 1998' })).toBeVisible();
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
      await page.goto('/papers');

      await expect(page.getByRole('heading', { level: 2, name: 'Active share links', exact: true })).toBeVisible();
      await expect(page.getByRole('heading', { name: 'Active share links' }).locator('xpath=ancestor::header[1]')).toContainText('2 links');
      await expect(page.getByText('Prospective buyer — Sy 214/2')).toBeVisible();
      await expect(page.getByText('View only · no download')).toBeVisible();
      await expect(page.getByText('Union Bank, Markapur — Flat 4B, Sai Residency')).toBeVisible();
      await expect(page.getByText('View and download', { exact: true })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Revoke' })).toHaveCount(2);
      // A register, not a contact list: the entries are an ordered list, each
      // numbered in the order drawn, and each says the day it lapses.
      const register = page.getByRole('list').filter({ has: page.getByText('Prospective buyer — Sy 214/2') });
      await expect(register.getByRole('listitem')).toHaveCount(2);
      expect(await register.evaluate((el) => el.tagName)).toBe('OL');
      await expect(register.getByRole('listitem').first()).toContainText('01');
      await expect(register.getByRole('listitem').nth(1)).toContainText('02');
      await expect(register.getByRole('listitem').first()).toContainText(`expires ${inDays(18)}`);
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
      await page.goto('/papers');

      await expect(page.getByText('18 days left')).toBeVisible();
      await expect(page.getByText('expires tomorrow')).toBeVisible();
      // A link that runs out today still opens today, so it stays in the live
      // list and says which day it is.
      await expect(page.getByText('expires today')).toBeVisible();
      await expect(page.getByRole('heading', { level: 2, name: 'Active share links', exact: true })).toBeVisible();
      await expect(page.getByRole('heading', { name: 'Active share links' }).locator('xpath=ancestor::header[1]')).toContainText('3 links');
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
    await page.goto('/papers');

    await expect(page.getByRole('heading', { level: 2, name: 'Active share links', exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Active share links' }).locator('xpath=ancestor::header[1]')).toContainText('1 link');
    await expect(page.getByRole('heading', { level: 2, name: 'Expired share links', exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Expired share links' }).locator('xpath=ancestor::header[1]')).toContainText('1 link');
    await expect(page.getByText(`expired ${inDays(-43)}`)).toBeVisible();
    await expect(page.getByText('expires tomorrow')).toBeHidden();
  });

  test('a link nobody gave an expiry says so, rather than counting days it does not have',
    async ({ page, world }) => {
      // '' is what `expires_on` holds by default (web360.py:183), and the old
      // screen read the server's clamped daysLeft and said "expires tomorrow"
      // over it.
      world.patch('vault', { links: [aLink({ id: LINK.buyer, expiresOn: '', daysLeft: 0 })] });
      await page.goto('/papers');

      await expect(page.getByText('no expiry recorded')).toBeVisible();
      await expect(page.getByRole('heading', { level: 2, name: 'Active share links', exact: true })).toBeVisible();
      await expect(page.getByRole('heading', { name: 'Active share links' }).locator('xpath=ancestor::header[1]')).toContainText('1 link');
      await expect(page.getByRole('heading', { name: 'Expired share links' })).toBeHidden();
    });

  test('a link whose date could never have existed is not given four more days',
    async ({ page, world }) => {
      // Vault.tsx:56-58 — `new Date(2026, 1, 31)` rolls forward to 3 March
      // rather than failing, so a row stored as 31/02/2026 would otherwise be
      // read as four days out. The day check is what makes it say the only
      // true thing instead. (The ISO dates fixtures/seed.ts holds fall into
      // the same answer one line earlier, at the regex.)
      world.patch('vault', { links: [aLink({ id: LINK.buyer, expiresOn: '31/02/2026', daysLeft: 4 })] });
      await page.goto('/papers');

      await expect(page.getByText('no expiry recorded')).toBeVisible();
      await expect(page.getByText(/days? left/)).toBeHidden();
      await expect(page.getByRole('heading', { level: 2, name: 'Active share links', exact: true })).toBeVisible();
      await expect(page.getByRole('heading', { name: 'Active share links' }).locator('xpath=ancestor::header[1]')).toContainText('1 link');
    });

  test('with no link out, no register is drawn at all', async ({ page, world }) => {
    world.patch('vault', { links: [] });
    await page.goto('/papers');

    await expect(fileRow(page, 'Sale deed 4412 of 1998')).toBeVisible();
    await expect(page.getByText(/Active share links/)).toBeHidden();
    await expect(page.getByText('No active share links.')).toBeHidden();
    await expect(page.getByRole('heading', { name: 'Expired share links' })).toBeHidden();
    await expect(page.getByRole('button', { name: /^Revoke/ })).toHaveCount(0);
  });

  test('the register belongs to the top level, not inside a folder or a search', async ({ page, world }) => {
    world.patch('vault', { links: [aLink({ id: LINK.buyer })] });
    await page.goto('/papers');
    await expect(page.getByRole('heading', { level: 2, name: 'Active share links', exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Active share links' }).locator('xpath=ancestor::header[1]')).toContainText('1 link');

    await page.getByPlaceholder('Search documents').fill('deed');
    await expect(page.getByRole('heading', { name: 'Active share links' })).toBeHidden();
    await page.getByPlaceholder('Search documents').fill('');
    await expect(page.getByRole('heading', { level: 2, name: 'Active share links', exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Active share links' }).locator('xpath=ancestor::header[1]')).toContainText('1 link');
  });

  test('the log points at Activity rather than pretending to be it', async ({ page, world }) => {
    world.patch('vault', { links: [aLink({ id: LINK.buyer })] });
    await page.goto('/papers');
    await expect(page.getByRole('link', { name: 'Activity ›' }))
      .toHaveAttribute('href', '/audit');
  });

  test('every Revoke names whose link it ends', async ({ page, world }) => {
    world.patch('vault', { links: [aLink({ id: LINK.buyer }), aLink({ id: LINK.bank, audience: 'Union Bank, Markapur' })] });
    await page.goto('/papers');
    await expect(page.getByRole('button', { name: 'Revoke the link to Prospective buyer for Sy 214/2' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Revoke the link to Union Bank, Markapur for Sy 214/2' })).toBeVisible();
  });

  test('revoking asks first, and says what the person on the other end loses',
    async ({ page, world }) => {
      world.patch('vault', { links: [aLink({ id: LINK.buyer })] });
      await page.goto('/papers');

      await page.getByRole('button', { name: 'Revoke' }).click();

      await expect(page.getByRole('dialog')).toBeVisible();
      await expect(page.getByRole('heading', { name: 'Revoke the link to Prospective buyer?' }))
        .toBeVisible();
      await expect(page.getByRole('dialog')).toContainText(
        'Prospective buyer loses access to Sy 214/2 immediately. This cannot be undone.',
      );
      expect(world.calls('revokeShareLink')).toHaveLength(0);
    });

  test('keeping the link changes nothing at all', async ({ page, world }) => {
    world.patch('vault', { links: [aLink({ id: LINK.buyer })] });
    await page.goto('/papers');

    await page.getByRole('button', { name: 'Revoke' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Cancel', exact: true }).click();

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
      await page.goto('/papers');

      await page.getByRole('button', { name: 'Revoke' }).first().click();
      await page.getByRole('button', { name: 'Revoke link' }).click();

      await expect(page.getByText('Prospective buyer can no longer open Sy 214/2.')).toBeVisible();
      await expect(page.getByText('Prospective buyer — Sy 214/2')).toBeHidden();
      await expect(page.getByRole('heading', { level: 2, name: 'Active share links', exact: true })).toBeVisible();
      await expect(page.getByRole('heading', { name: 'Active share links' }).locator('xpath=ancestor::header[1]')).toContainText('1 link');
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
    await page.goto('/papers');

    // An expired link cuts nobody off, so its button is a plain "Remove from
    // list", not a red Revoke.
    await expect(page.getByRole('button', { name: /^Revoke/ })).toHaveCount(0);
    const remove = page.getByRole('button', { name: 'Remove from list the expired link to Surveyor for Sy 214/2' });
    await expect(remove).toHaveText('Remove from list');
    await expect(remove).not.toHaveClass(/danger/);
    await remove.click();
    await expect(page.getByRole('dialog')).toContainText(
      'This link has already expired, so nobody loses access.',
    );
    await page.getByRole('dialog').getByRole('button', { name: 'Remove from list' }).click();

    await expect(page.getByText('The expired link to Surveyor is off this list. Activity still records it.'))
      .toBeVisible();
    await expect(page.getByRole('heading', { name: 'Expired share links' })).toBeHidden();
  });

  test('a link the server will not let go of stays on the list, and says so',
    async ({ page, world }) => {
      world.patch('vault', { links: [aLink({ id: LINK.buyer })] });
      world.set('revokeShareLink', false);
      await page.goto('/papers');

      await page.getByRole('button', { name: 'Revoke' }).click();
      await page.getByRole('button', { name: 'Revoke link' }).click();

      await expect(page.getByText('That link could not be revoked. It may already be off the list — reload to check.'))
        .toBeVisible();
      // The link is still live and still unwanted, so the dialog stays open.
      await expect(page.getByRole('dialog')).toBeVisible();
      await expect(page.getByText('Prospective buyer — Sy 214/2')).toBeVisible();
    });

  test('a revoke that never reached the server says nothing has changed', async ({ page, world }) => {
    world.patch('vault', { links: [aLink({ id: LINK.buyer })] });
    world.set('revokeShareLink', World.gqlError('the session has expired'));
    await page.goto('/papers');

    await page.getByRole('button', { name: 'Revoke' }).click();
    await page.getByRole('button', { name: 'Revoke link' }).click();

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
    await page.goto('/papers');

    await page.getByRole('button', { name: 'Revoke' }).first().click();
    await page.getByRole('button', { name: 'Revoke link' }).click();

    // The row being cut off says so; the two links nobody touched keep their
    // own buttons, because each row holds its own mutation.
    await expect(page.getByRole('button', { name: 'Revoking…' }).first()).toBeVisible();
    const others = page.getByRole('button', { name: /^Revoke the link to/ });
    await expect(others).toHaveCount(2);
    await expect(others.nth(0)).toBeEnabled();
    await expect(others.nth(1)).toBeEnabled();
  });

  test('a revoke already under way cannot be escaped out of half-done', async ({ page, world }) => {
    world.patch('vault', { links: [aLink({ id: LINK.buyer })] });
    world.set('revokeShareLink', World.slow(2_500, true));
    await page.goto('/papers');

    await page.getByRole('button', { name: 'Revoke' }).click();
    await page.getByRole('button', { name: 'Revoke link' }).click();

    // The write is in flight and its answer is not back yet, so neither way
    // out is offered: Vault passes `busy` to the Dialog (Vault.tsx:147), which
    // refuses Keep the link and stops Escape from closing over a write whose
    // outcome nobody knows.
    await expect(page.getByRole('dialog')).toHaveAttribute('aria-busy', 'true');
    await expect(page.getByRole('dialog').getByRole('button', { name: 'Cancel', exact: true })).toBeDisabled();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toBeVisible();
  });

  // Once a defect: LinkRow drew the audience,
  // the subject, the terms and the span, and drops the three facts the query
  // paid for: `docCount`, `openedCount` and `lastOpenedAt` (api.ts:375 selects
  // all three). An owner deciding whether to cut a link off wants to know how
  // many papers went out on it and whether anybody ever opened it — "4 papers
  // · opened 3 times, last 10/09/2026" — and a share log that cannot answer
  // "did the bank ever read it?" is a list of promises, not a log.
  test('the share log says how many papers went out and whether they were opened',
    async ({ page, world }) => {
      world.patch('vault', {
        links: [aLink({ id: LINK.buyer, docCount: 4, openedCount: 3, lastOpenedAt: inDays(-3) })],
      });
      await page.goto('/papers');

      await expect(page.getByText('Prospective buyer — Sy 214/2')).toBeVisible();
      await expect(page.getByRole('main').getByText(`4 documents · opened 3 times, last ${inDays(-3)}`))
        .toBeVisible();
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
    await page.goto('/papers');

    await expect(page.getByText('expires tomorrow')).toBeVisible();
    await page.getByRole('button', { name: /Extend/i }).click({ timeout: 3_000 });
    await expect.poll(() => world.calls('extendShareLink').length).toBeGreaterThan(0);
    expect(world.lastVars('extendShareLink')).toMatchObject({ linkId: LINK.buyer });
    expect(world.lastVars('extendShareLink').days).toBeGreaterThan(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// The server-side name search (`search`, five closest, "Documents named
// like …") went with the wall: the box now narrows the list in the browser,
// across every folder, by name, line, tag or linked property (Vault.tsx
// `selectionRows`; 11c-documents-files.spec.ts "a search spans every folder").
test.describe('searching the vault', () => {
  test('the box says what it searches, and asks the server nothing', async ({ page, world }) => {
    await page.goto('/papers');
    const box = page.getByPlaceholder('Search documents');
    // Short enough not to be cut off; the full scope is the accessible name.
    await expect(box).toHaveAccessibleName('Search documents, folders, tags, types or linked properties');

    await box.fill('deed');
    await expect(fileRow(page, 'Sale deed 4412 of 1998')).toBeVisible();
    expect(world.calls('search')).toHaveLength(0);
  });

  test('a paper is found by the name it was filed under', async ({ page }) => {
    await page.goto('/papers');
    await page.getByPlaceholder('Search documents').fill('Sale deed 4412');

    await expect(fileTable(page).getByRole('checkbox', { name: /^Select (?!all)/ })).toHaveCount(1);
    await expect(fileRow(page, 'Sale deed 4412 of 1998')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Clear the search for Sale deed 4412' })).toBeVisible();
  });

  test('a search with no answer says so, and Clear all puts the list back', async ({ page }) => {
    await page.goto('/papers');
    const box = page.getByPlaceholder('Search documents');
    await box.fill('zzzz');

    await expect(page.getByText('No document matches “zzzz”')).toBeVisible();
    await page.locator('.emptypanel, .blank').getByRole('button', { name: 'Clear all' }).click();
    await expect(box).toHaveValue('');
    await expect(fileRow(page, 'Sale deed 4412 of 1998')).toBeVisible();
  });
});

// ═══════════════════════════════════════════════════════════════════════
// Add documents no longer asks for a property first: files go into the
// owner's private library and are linked later from their own actions
// (Vault.tsx `AddPapers` → PaperDrawer with no record). The property picker
// (`RecordPick`) lives on in Share a property, so its narrowing, its cap of
// twelve and its waiting and failed states are asserted there.
test.describe('adding papers', () => {
  test('Add documents opens the drawer that adds to Documents, no property asked first', async ({ page }) => {
    await page.goto('/papers');
    await page.getByRole('button', { name: 'Add documents' }).click();

    const drawer = page.getByRole('dialog', { name: 'Add a document' });
    await expect(drawer).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Which property are these documents for?' })).toHaveCount(0);
    // One verb for one act: opened by Add documents, it adds.
    await expect(drawer.getByRole('button', { name: 'Add the document' })).toBeDisabled();
  });

  test('Escape closes the drawer and hands the keyboard back to the button that opened it',
    async ({ page }) => {
      await page.goto('/papers');
      const opener = page.getByRole('button', { name: 'Add documents' });
      await opener.click();
      await expect(page.getByRole('dialog')).toBeVisible();
      // Nothing has been picked, so Escape is a dismissal, not a discarded draft.
      await page.keyboard.press('Escape');

      await expect(page.getByRole('dialog')).toBeHidden();
      await expect(opener).toBeFocused();
      await expect(page).toHaveURL(/\/papers$/);
    });
});

test.describe('the property picker', () => {
  const openPicker = async (page: Page) => {
    await page.goto('/papers?do=share');
  };

  test('the picker offers the portfolio, and not what is archived', async ({ page }) => {
    await openPicker(page);
    await expect(page.getByRole('dialog').getByRole('button', { name: 'Sy 214/2' })).toBeVisible();
    await expect(page.getByRole('dialog').getByRole('button', { name: 'Sy 88' })).toBeVisible();
    await expect(page.getByRole('dialog').getByRole('button', { name: 'Flat 4B, Sai Residency' })).toBeVisible();
    await expect(page.getByRole('dialog').getByRole('button', { name: 'Shop 7, Market Road' })).toBeHidden();
  });

  test('the picker narrows on village, survey number or khata', async ({ page }) => {
    await openPicker(page);
    const box = page.getByLabel('Search your properties');

    await box.fill('Kukatpally');
    await expect(page.getByRole('dialog').getByRole('button', { name: 'Flat 4B, Sai Residency' })).toBeVisible();
    await expect(page.getByRole('dialog').getByRole('button', { name: 'Sy 214/2' })).toBeHidden();
    await expect(page.getByRole('dialog').getByRole('button', { name: 'Sy 88' })).toBeHidden();

    await box.fill('214');
    await expect(page.getByRole('dialog').getByRole('button', { name: 'Sy 214/2' })).toBeVisible();
    await expect(page.getByRole('dialog').getByRole('button', { name: 'Flat 4B, Sai Residency' })).toBeHidden();

    await box.fill('1042');
    await expect(page.getByRole('dialog').getByRole('button', { name: 'Sy 214/2' })).toBeVisible();
    await expect(page.getByRole('dialog').getByRole('button', { name: 'Sy 88' })).toBeHidden();
  });

  test('a picker with more properties than it draws says how many it is holding back',
    async ({ page, world }) => {
      world.set('properties', bigPortfolio(14));
      await openPicker(page);

      await expect(page.getByRole('dialog').getByRole('button', { name: 'Sy 412' })).toBeVisible();
      await expect(page.getByRole('dialog').getByRole('button', { name: 'Sy 413' })).toBeHidden();
      await expect(page.getByText('The first 12 of 14 properties')).toBeVisible();
    });

  test('a search that is still too wide says to narrow it further', async ({ page, world }) => {
    world.set('properties', bigPortfolio(14));
    await openPicker(page);
    await page.getByLabel('Search your properties').fill('Katragunta');

    await expect(page.getByText('The first 12 of 13 matches')).toBeVisible();
    await expect(page.getByRole('dialog').getByRole('button', { name: 'Sy 401' })).toBeHidden();
  });

  test('a picker search that matches nothing names what it looked for', async ({ page }) => {
    await openPicker(page);
    await page.getByLabel('Search your properties').fill('Chennai');

    await expect(page.getByText('No property matches “Chennai”.')).toBeVisible();
  });

  test('the picker waits for the properties rather than showing an empty list',
    async ({ page, world }) => {
      world.set('properties', World.never());
      await openPicker(page);

      await expect(page.getByRole('dialog').getByRole('status')).toBeVisible();
      await expect(page.getByLabel('Search your properties')).toBeHidden();
    });

  // Once a defect: `RecordPick` — `<Chip>{c.extent} {c.extentUnit}</Chip>`
  // prints the raw number, so a 1,450 sft flat reads "1450 sft" in the picker
  // while every other screen in the module writes it the Indian way (ui.tsx
  // inGroup/num/extent, and the card's own `extentAlt` already says
  // "1,450 sft"). The owner is owed the same figure in the same shape wherever
  // it appears.
  test('the picker writes an extent the way the rest of the app writes it',
    async ({ page }) => {
      await openPicker(page);
      await expect(page.getByRole('dialog').getByText('1,450 sft')).toBeVisible();
    });
});

// ═══════════════════════════════════════════════════════════════════════
test.describe('sharing a property', () => {
  test('Documents has no Share a property in its head: a property is shared from its own page',
    async ({ page }) => {
      await page.goto('/papers');
      await expect(page.getByRole('heading', { level: 1, name: 'Documents' })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Share a property' })).toHaveCount(0);
    });

  test('Home’s Share a property shortcut still picks the property first',
    async ({ page }) => {
      await page.goto('/papers?do=share');

      await expect(page.getByRole('heading', { name: 'Share a property' })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Make the link' })).toBeDisabled();
      await expect(page.getByLabel('Who the link is for')).toBeHidden();
    });

  test('the property can be changed after it is chosen', async ({ page }) => {
    await page.goto('/papers?do=share');
    await page.getByRole('dialog').getByRole('button', { name: 'Sy 214/2' }).click();

    await expect(page.getByLabel('Who the link is for')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Make the link' })).toBeDisabled();

    await page.getByRole('button', { name: 'Change', exact: true }).click();
    await expect(page.getByLabel('Search your properties')).toBeVisible();
    await expect(page.getByLabel('Who the link is for')).toBeHidden();
  });

  test('the caret is in the box the step needs, and moves when the step does',
    async ({ page }) => {
      await page.goto('/papers?do=share');

      // Two steps, one keyboard: the search is focused on open, and choosing a
      // property moves the caret to the only thing left to say (Vault.tsx:290).
      await expect(page.getByLabel('Search your properties')).toBeFocused();
      await page.getByRole('dialog').getByRole('button', { name: 'Sy 214/2' }).click();
      await expect(page.getByLabel('Who the link is for')).toBeFocused();
    });

  test('a name of nothing but spaces does not make a link', async ({ page, world }) => {
    await page.goto('/papers?do=share');
    await page.getByRole('dialog').getByRole('button', { name: 'Sy 214/2' }).click();
    await page.getByLabel('Who the link is for').fill('   ');

    // A link that says it is for "   " is a link nobody can account for later,
    // which is the whole point of the log below.
    await expect(page.getByRole('button', { name: 'Make the link' })).toBeDisabled();
    expect(world.calls('createShareLink')).toHaveLength(0);
  });

  test('Enter where the name was typed makes the link, without reaching for the mouse',
    async ({ page, world }) => {
      await page.goto('/papers?do=share');
      await page.getByRole('dialog').getByRole('button', { name: 'Sy 214/2' }).click();
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
    await page.goto('/papers');
    await expect(page.getByText(/Active share links/)).toBeHidden();

    await page.goto('/papers?do=share');
    await page.getByRole('dialog').getByRole('button', { name: 'Sy 214/2' }).click();
    await page.getByLabel('Who the link is for').fill('Union Bank, Markapur');
    await page.getByRole('button', { name: 'Make the link' }).click();
    await expect(page.getByLabel('Recipient link')).toBeVisible();
    await page.getByRole('button', { name: 'Done' }).click();

    // The promise under the list is that nothing leaves the vault without
    // appearing in it — including the link made one second ago, without a
    // reload to go and look for it.
    await expect(page.getByRole('dialog')).toBeHidden();
    await expect(page.getByText('Union Bank, Markapur — Sy 214/2')).toBeVisible();
    await expect(page.getByRole('heading', { level: 2, name: 'Active share links', exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Active share links' }).locator('xpath=ancestor::header[1]')).toContainText('1 link');
    await expect(page.getByText('30 days left')).toBeVisible();
  });

  test('the dialog states the terms of the link before it is made', async ({ page }) => {
    await page.goto('/papers?do=share');
    await page.getByRole('dialog').getByRole('button', { name: 'Sy 214/2' }).click();

    await expect(page.getByText(
      'Anyone with the link can view and download the current documents for 30 days.',
    )).toBeVisible();
  });

  test('naming who it is for makes a 30-day link on that record',
    async ({ page, world }) => {
      await page.goto('/papers?do=share');
      await page.getByRole('dialog').getByRole('button', { name: 'Sy 214/2' }).click();
      await page.getByLabel('Who the link is for').fill('Union Bank, Markapur');
      await page.getByRole('button', { name: 'Make the link' }).click();

      await expect(page.getByLabel('Recipient link')).toHaveValue(/w-link-new$/);
      expect(world.lastVars('createShareLink')).toMatchObject({
        recordId: ID.parcel, audience: 'Union Bank, Markapur', terms: 'view', days: 30,
      });
      // The dialog itself says "Link ready." with the link in hand, so success
      // is silent everywhere else: no toast repeats it.
      await expect(page.getByRole('dialog')).toContainText('Link ready.');
      await expect(page.locator('.toast')).toHaveCount(0);
      await expect(page.getByRole('button', { name: 'Done' })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Make the link' })).toBeHidden();
    });

  test('the made link is kept on screen until it has been copied', async ({ page }) => {
    await page.goto('/papers?do=share');
    await page.getByRole('dialog').getByRole('button', { name: 'Sy 214/2' }).click();
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
      await page.goto('/papers?do=share');
      await page.getByRole('dialog').getByRole('button', { name: 'Sy 301' }).click();
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
    await page.goto('/papers?do=share');
    await page.getByRole('dialog').getByRole('button', { name: 'Sy 214/2' }).click();
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
      await page.goto('/papers?do=share');
      await page.getByRole('dialog').getByRole('button', { name: 'Sy 214/2' }).click();
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
    await page.goto('/papers?do=share');
    await page.getByRole('dialog').getByRole('button', { name: 'Sy 214/2' }).click();
    await page.getByLabel('Who the link is for').fill('Union Bank, Markapur');

    await page.mouse.click(6, 6);

    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.getByLabel('Who the link is for')).toHaveValue('Union Bank, Markapur');
  });

  test('with no properties there is nothing to share, and the dialog says which way out',
    async ({ page, world }) => {
      world.set('properties', EMPTY_PORTFOLIO);
      await page.goto('/papers?do=share');

      await expect(page.getByText('Nothing to share yet')).toBeVisible();
      // The primary stays on the footer and says what it is by being refused:
      // there is no property to make a link against, and the way out of that is
      // the Empty's own action, not this button.
      await expect(page.getByRole('button', { name: 'Make the link' })).toBeDisabled();
      await expect(page.getByRole('dialog').getByRole('link', { name: 'Properties' })).toBeVisible();
    });

  test('a share dialog whose properties will not load says so rather than offering none',
    async ({ page, world }) => {
      world.set('properties', World.gqlError('the record store is down'));
      await page.goto('/papers?do=share');

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
      await page.goto('/papers/shelf/title');

      await expect(page.getByRole('heading', { level: 1, name: 'Title deeds' })).toBeVisible();
      // What belongs on the shelf is standing guidance, so it is behind the ⓘ
      // (design.md § Page head). It is Shelf.tsx's own table, not the
      // server's note — the two agree in production and differ in the fixture.
      await expect(page.getByRole('main').getByRole('button', { name: 'About Title deeds' }))
        .toHaveAccessibleDescription(/Deeds, wills, agreements/);
      expect(world.lastVars('vaultPapers')).toMatchObject({ shelf: 'title' });

      const link = page.getByRole('main').getByRole('link', { name: /Sale deed 4412 of 1998/ });
      await expect(link).toHaveAttribute('href', `/papers/${PAPER.deed}`);
      const deed = shelfRows(page).filter({ hasText: 'Sale deed 4412 of 1998' });
      await expect(deed).toContainText('Markapur SRO · 1998 · 14 pages');
      await expect(deed).toContainText('original');
      await expect(deed).toContainText('shared');
      await expect(deed).toContainText('14 pages');
    });

  test('the crumb goes back to the wall it came from', async ({ page }) => {
    await page.goto('/papers/shelf/revenue');
    await expect(page.getByRole('navigation', { name: 'Breadcrumb' }))
      .toContainText('Revenue records');

    await page.getByRole('navigation', { name: 'Breadcrumb' })
      .getByRole('link', { name: 'Documents' }).click();

    await expect(page).toHaveURL(/\/papers$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Documents' })).toBeVisible();
  });

  test('searching a shelf narrows it to the paper you meant', async ({ page }) => {
    await page.goto('/papers/shelf/title');
    const box = page.getByLabel('Search the Title deeds shelf');
    await expect(box).toHaveAttribute('placeholder', 'Search 6 documents on this shelf');

    await box.fill('Sale deed');

    const rows = shelfRows(page);
    await expect(rows).toHaveCount(1);
    await expect(rows.first()).toContainText('Sale deed 4412 of 1998');
  });

  test('a shelf search reads the line under the name as well as the name', async ({ page }) => {
    await page.goto('/papers/shelf/title');
    // "Katragunta" is nowhere in any of these papers' names; it is in the one
    // line under five of them, which is exactly what the empty state below
    // promises search looks at.
    await page.getByLabel('Search the Title deeds shelf').fill('Katragunta');

    const rows = shelfRows(page);
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
      await page.goto('/papers/shelf/title');

      const row = page.getByRole('main').getByRole('link', { name: /Sale deed 4412 of 1998/ });
      await expect(row).toHaveAttribute('href', `/papers/${PAPER.deed}`);
      await expect(row).toHaveText('Sale deed 4412 of 1998');
      await expect(page.getByLabel('Search the Title deeds shelf'))
        .toHaveAttribute('placeholder', 'Search 1 document on this shelf');
    });

  test('Grid and Table show the same papers, and what is ticked in one stays ticked in the other', async ({ page }) => {
    await page.goto('/papers/shelf/title');
    const table = page.getByRole('table', { name: 'Documents on the Title deeds shelf' });
    await expect(table.locator('tbody tr').first()).toBeVisible();
    const rows = await table.locator('tbody tr').count();
    expect(rows).toBeGreaterThan(1);

    await page.getByRole('group', { name: 'View' }).getByRole('button', { name: 'Grid' }).click();
    await expect(page).toHaveURL(/[?&]view=grid/);
    const tiles = page.getByRole('list', { name: 'Documents on the Title deeds shelf' }).getByRole('listitem');
    await expect(tiles).toHaveCount(rows);
    await tiles.first().getByRole('checkbox').check();
    await expect(page.getByRole('group', { name: 'Act on the selected documents' })).toContainText('1 document selected');

    await page.getByRole('group', { name: 'View' }).getByRole('button', { name: 'Table' }).click();
    await expect(table.locator('tbody tr').first().getByRole('checkbox')).toBeChecked();
    await expect(table.locator('tfoot')).toContainText('1 document selected');
  });

  test('a long shelf pages its rows', async ({ page, world }) => {
    world.set('vaultPapers', Array.from({ length: 23 }, (_, i) => ({
      id: `pp-${i + 1}`, title: `Deed ${i + 1}`, detail: '', shelf: 'title',
      icon: 'title', tags: [], shared: false, pageCount: 0, fileRef: '',
    })));
    await page.goto('/papers/shelf/title');

    const pager = page.getByRole('navigation', { name: 'Title deeds pages' });
    const rows = page.getByRole('main').getByRole('link', { name: /^Deed \d+$/ });
    await expect(pager).toContainText('1–20 of 23');
    await expect(rows).toHaveCount(20);
    await pager.getByRole('button', { name: 'Next' }).click();
    await expect(pager).toContainText('21–23 of 23');
    await expect(rows).toHaveCount(3);
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
    await page.goto('/papers/shelf/title');

    await expect(page.getByText('Nothing is filed under Title deeds yet')).toBeVisible();
    await expect(page.getByText('The shelf count disagrees with this list')).toBeHidden();
    await expect(page.getByRole('link', { name: 'Back to your documents' }))
      .toHaveAttribute('href', '/papers');
  });

  test('a shelf search that matches nothing offers the way back to the whole shelf',
    async ({ page }) => {
      await page.goto('/papers/shelf/title');
      await page.getByLabel('Search the Title deeds shelf').fill('zzzz');

      await expect(page.getByText('Nothing on this shelf matches “zzzz”')).toBeVisible();

      await page.getByRole('button', { name: 'Clear' }).click();
      await expect(shelfRows(page)).toHaveCount(6);
    });

  test('a shelf with nothing on it is not offered a search box', async ({ page, world }) => {
    const vault = world.seedOf<VaultAnswer>('vault');
    world.patch('vault', {
      shelves: vault.shelves.map((s) => (s.key === 'identity' ? { ...s, count: 0 } : s)),
    });
    world.set('vaultPapers', []);
    await page.goto('/papers/shelf/identity');

    await expect(page.getByText('Nothing is filed under Identity yet')).toBeVisible();
    await expect(page.getByLabel('Search the Identity shelf')).toBeHidden();
  });

  test('a shelf that disagrees with its own card admits it', async ({ page, world }) => {
    // The card says six and the shelf lists none: exactly the lie
    // `vaultPapers` was written to make impossible, said out loud when the two
    // sides do fall out of step.
    world.set('vaultPapers', []);
    await page.goto('/papers/shelf/title');

    await expect(page.getByText('Nothing is filed under Title deeds yet')).toBeVisible();
    await expect(page.getByText('The shelf count disagrees with this list.'))
      .toBeVisible();
  });

  test('a made-up shelf key is refused by name, not fetched', async ({ page, world }) => {
    await page.goto('/papers/shelf/receipts');

    await expect(page.getByText('There is no shelf by that name')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Back to your documents' }))
      .toHaveAttribute('href', '/papers');
    expect(world.asked('vaultPapers'), 'an unknown key must not reach the server').toBe(false);
  });

  test('a shelf that will not load says so and offers to try again', async ({ page, world }) => {
    world.set('vaultPapers', World.gqlError('the paper store is down'));
    await page.goto('/papers/shelf/map');

    await expect(page.getByRole('alert')).toContainText('The Map shelf did not load');
    await expect(page.getByText('the paper store is down')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Try again' })).toBeVisible();
  });

  test('a shelf still lists its papers when the wall’s counts cannot be read',
    async ({ page, world }) => {
      world.set('vault', World.gqlError('the paper store is down'));
      await page.goto('/papers/shelf/map');

      await expect(page.getByRole('heading', { level: 1, name: 'Map' })).toBeVisible();
      await expect(shelfRows(page)).toHaveCount(3);
      await expect(page.getByRole('alert')).toBeHidden();
    });

  test('the unsorted shelf is a shelf like any other', async ({ page }) => {
    await page.goto('/papers/shelf/unsorted');

    await expect(page.getByRole('heading', { level: 1, name: 'Not sorted yet' })).toBeVisible();
    await expect(page.getByRole('main').getByRole('button', { name: 'About Not sorted yet' }))
      .toHaveAccessibleDescription(/Nothing recognised it/);
    const row = page.getByRole('main').getByRole('link', { name: /Scan 2026-08-02/ });
    await expect(row).toHaveAttribute('href', `/papers/${PAPER.unsorted}`);
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
      await page.goto('/papers/shelf/map');

      await expect(page.getByRole('heading', { level: 1, name: 'Map' })).toBeVisible();
      await expect(page.getByRole('main').getByRole('status')).toBeVisible({ timeout: 3_000 });
    });

  // Shelf.tsx once spliced the note into `${note} belong on this shelf.`, which
  // read "Masked until you unlock belong on this shelf." — fixed; kept as a guard.
  test('an empty Identity shelf says a sentence that parses', async ({ page, world }) => {
    const vault = world.seedOf<VaultAnswer>('vault');
    world.patch('vault', {
      shelves: vault.shelves.map((s) => (s.key === 'identity' ? { ...s, count: 0 } : s)),
    });
    world.set('vaultPapers', []);
    await page.goto('/papers/shelf/identity');

    await expect(page.getByText('Nothing is filed under Identity yet')).toBeVisible();
    await expect(page.getByText('Masked until you unlock belong on this shelf.'))
      .toBeHidden({ timeout: 3_000 });
  });
});
