/**
 * W01 · the dashboard — the first screen of the app, in every state it has.
 *
 * The landing screen at `/app` (Home) reads the portfolio (`web.portfolio`),
 * the orders the rail already counts and the property list, and draws, in
 * order: the greeting with its one summary line and four shortcuts; For you —
 * the orders waiting on the owner, the reminders, and Missing details as one
 * summary row; the four Overview cards; Value by village, only when something
 * has been valued; Recently opened; and Recent activity. Every one of those is
 * conditional on what the server sent, so this file is mostly about the
 * BRANCHES: the land-only portfolio, the portfolio nobody has valued, the
 * account that holds nothing at all, the read that never comes back, and the
 * read that comes back refused.
 *
 * Five things worth knowing before changing anything here.
 *
 *  1. `usePortfolio()` is called TWICE on this route — once by the Dashboard
 *     and once by Shell.tsx (line 63), which draws the display name and the
 *     Notifications badge from it. React Query dedupes them onto one key, so
 *     `world.calls('portfolio')` counts fetches, not callers. It also means
 *     World.never() / World.gqlError() on `portfolio` hits the shell too — the
 *     shell degrades quietly (`portfolio.data?.displayName ?? ''`), which is
 *     why the rail is still asserted as present in the loading test.
 *
 *  2. Dismissal invalidates the whole `w360` key, so the portfolio is re-read
 *     after every dismiss. A static answer would therefore hand the dismissed
 *     reminder straight back. The dismissal tests keep their own list in the
 *     test and answer `portfolio` from it — that is test-local state, not a
 *     fixture change.
 *
 *  3. The seed speaks slightly different vocabulary from the server in three
 *     places, and the screen branches on all three: `extentUnit` is
 *     'acres'/'sft' where web360.py:1351 sends 'ac'/'sq.ft'/'sq.yd', tile
 *     `tone` is 'good'/'warn' where web360.py:2509 sends 'up'/'down'/'plain',
 *     and `classification` is 'Dry land'/'Residential' where web360.py:1344
 *     and :1367 send agri/flat/shop/open_plot. The tests below assert what the
 *     seeded data actually draws AND, separately, what the server's own
 *     vocabulary draws — the second is the branch that ships.
 *
 *  4. Pressing Try again does NOT leave `Failed` on the screen. Invalidating
 *     puts a query with no data back to pending, so `isLoading` goes true and
 *     Dashboard.tsx:181 swaps the failure box for the loading one in the same
 *     tick — which is why the retry is asserted through the waiting state and
 *     not through `Failed`'s own 'Trying…' label, which this screen can never
 *     show.
 *
 *  5. Home's Recent activity reads the owner's trail through the root schema
 *     (data/hooks.ts auditTrail), which fixtures/seed.ts does not answer. The
 *     seal refuses that with a 400, which the console guard fails, so every
 *     test here answers `root.auditTrail` with an empty trail first (the
 *     beforeEach below, the same answer 19-sections-legacy gives). Recent
 *     activity therefore stays hidden in this file.
 *
 * One `test.fail()` is left here: a village worth nothing still gets a bar.
 * "A portfolio nobody has priced is not told it was free" was the second; the
 * 26/09 Home fixed it and it is now an ordinary test.
 */
import type { Locator } from '@playwright/test';
import { test, expect, World } from '../fixtures/harness';
import type { Page } from '../fixtures/harness';
import { ID, TICKET } from '../fixtures/ids';
import { CARDS } from '../fixtures/seed';

// ── the shapes this screen is drawn from (api.ts · Portfolio) ──────────

interface Waiting {
  id: string; title: string; detail: string; icon: string;
  actionLabel: string; actionKind: string; recordId: string;
}
interface Tile { key: string; label: string; value: string; unit: string; note: string; tone: string }
interface Bar { label: string; value: number; share: number }
interface Portfolio {
  displayName: string;
  farmExtent: number; farmCount: number; plotExtent: number; plotCount: number;
  builtExtent: number; builtFlats: number; builtShops: number;
  invested: number; worthNow: number; gain: number; loans: number;
  managedCount: number; watchedCount: number; waitingCount: number;
  runningCosts: number; paperCount: number; backupVerifiedOn: string;
  tiles: Tile[]; waiting: Waiting[]; valueBars: Bar[];
  recent: Record<string, unknown>[];
}

/** The greeting is clock-dependent (Dashboard.tsx:29) and the suite runs in
 *  Asia/Kolkata, so a title assertion that does not own the clock matches the
 *  family, not the hour. The one test that DOES own it pins the page clock and
 *  asserts each side of both boundaries. */
const GREETING = /^Good (morning|afternoon|evening)/;

/** The most recent instant whose Asia/Kolkata wall clock reads `hour:minute`.
 *
 *  Deliberately in the PAST. The session is a JWT minted twelve hours out from
 *  the REAL clock (fixtures/session.ts:94) and `isValid()` compares that `exp`
 *  against whatever the page thinks the time is — so a page clock wound
 *  forward past it would land the test on /login instead of on a dashboard,
 *  and the failure would read as broken auth. Wound back, the session is only
 *  ever fresher. */
function lastIstMoment(hour: number, minute = 0): Date {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kolkata', hourCycle: 'h23',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(new Date());
  const at = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  const nowSec = at('hour') * 3600 + at('minute') * 60 + at('second');
  const backSec = ((nowSec - (hour * 3600 + minute * 60)) + 86_400) % 86_400;
  return new Date(Date.now() - backSec * 1_000);
}

/** An account that holds nothing at all — the first-run branch's gate is the
 *  sum of six counts (Dashboard.tsx:218), so all six have to go to zero. */
function firstRun(base: Portfolio, over: Partial<Portfolio> = {}): Portfolio {
  return {
    ...base,
    farmExtent: 0, farmCount: 0, plotExtent: 0, plotCount: 0,
    builtExtent: 0, builtFlats: 0, builtShops: 0,
    managedCount: 0, watchedCount: 0,
    invested: 0, worthNow: 0, gain: 0, loans: 0,
    runningCosts: 0, paperCount: 0, waitingCount: 0,
    tiles: [], waiting: [], valueBars: [], recent: [],
    ...over,
  };
}

// Home's Recent activity reads the owner's trail through the root schema
// (data/hooks.ts auditTrail), which fixtures/seed.ts does not answer yet.
test.beforeEach(({ world }) => {
  world.set('root.auditTrail', []);
});

type Card = Record<string, unknown>;

const BY_ID = new Map(CARDS.map((c) => [c.id as string, c]));

/** Seeded cards, cloned, in the order asked for. Cloned because `CARDS` is the
 *  suite's shared cast and a test that edited one in place would edit it for
 *  every other spec running beside it (03-properties does the same). */
const only = (...ids: string[]): Card[] =>
  ids.map((id) => structuredClone(BY_ID.get(id)!));

/** A `properties` answer holding exactly these cards — what Missing details
 *  is worked out from. */
const listOf = (cards: Card[]) => ({
  shown: cards.length, total: cards.length, hidden: 0, filterSummary: '',
  hiddenPlaces: [] as string[], activeCount: 0, cards, facets: [],
});

// For you and Value by village have no landmark role of their own — Card()
// renders a plain <section class="card"> — so each is found by the heading it
// carries. The caught-up line is the one For you that IS a named region.
const forYou = (page: Page) =>
  page.locator('section.card').filter({ has: page.getByRole('heading', { name: 'For you', exact: true }) });
const caughtUp = (page: Page) => page.getByRole('region', { name: 'For you', exact: true });
const valuePanel = (page: Page) =>
  page.locator('section.card').filter({ has: page.getByRole('heading', { name: 'Value by village' }) });
/** The reminder rows in For you: the ones that can be dismissed. */
const reminderRows = (page: Page) =>
  forYou(page).locator('.rows > div').filter({ has: page.getByRole('button', { name: /^Dismiss: / }) });
/** For you's Missing details summary row. */
const missingRow = (page: Page) =>
  forYou(page).locator('.rows > div')
    .filter({ has: page.getByRole('heading', { name: 'Missing details', exact: true }) });
/** For you's count. A figure in the card head with no role of its own, so its
 *  class is the only handle on it. */
const forYouCount = (page: Page) => forYou(page).locator('.cardhead .num');
const overview = (page: Page) => page.getByRole('region', { name: 'Overview', exact: true });
const recent = (page: Page) => page.getByRole('region', { name: 'Recently opened', exact: true });
/** The topbar bell, Home's way to the full list of what is waiting (Shell.tsx).
 *  The badge is aria-hidden, so the count is in its name. */
const bell = (page: Page, name: string) => page.getByRole('link', { name, exact: true });

type Box = { x: number; y: number; width: number; height: number };

/** Where the first `n` matches are drawn, in order — for the layout tests. */
async function boxesOf(list: Locator, n: number): Promise<Box[]> {
  const out: Box[] = [];
  for (let i = 0; i < n; i += 1) {
    const box = await list.nth(i).boundingBox();
    expect(box, `match ${i} is drawn`).not.toBeNull();
    out.push(box!);
  }
  return out;
}

/** How many lines a piece of text is drawn on. Its text boxes are grouped by
 *  whether they sit on the same line rather than counted, because ₹ is not in
 *  the face's latin subset: it is drawn from a fallback face, as a box of its
 *  own that need not share the digits' top edge. */
async function linesOf(text: Locator): Promise<number> {
  return text.evaluate((node) => {
    const range = document.createRange();
    range.selectNodeContents(node);
    const boxes = [...range.getClientRects()]
      .filter((r) => r.width > 0 && r.height > 0)
      .sort((a, b) => a.top - b.top);
    let lines = 0;
    let bottom = -Infinity;
    for (const r of boxes) {
      if ((r.top + r.bottom) / 2 > bottom) { lines += 1; bottom = r.bottom; }
      else bottom = Math.max(bottom, r.bottom);
    }
    return lines;
  });
}

/** The contrast ratio (WCAG 2) of an element's text or icon colour against the
 *  surface behind it, as the browser composites them: a colour with alpha is
 *  painted over the surface on a canvas and the pixel read back. */
async function contrastOf(fg: Locator, surface: Locator): Promise<number> {
  const bg = await surface.evaluate((el) => getComputedStyle(el).backgroundColor);
  return fg.evaluate((el, under) => {
    const c = document.createElement('canvas');
    c.width = 1; c.height = 1;
    const x = c.getContext('2d', { willReadFrequently: true })!;
    const paint = (colour: string) => {
      x.fillStyle = '#010203';
      x.fillStyle = colour;
      if (String(x.fillStyle) === '#010203') throw new Error(`the canvas cannot read ${colour}`);
      x.fillRect(0, 0, 1, 1);
    };
    const rgb = (...layers: string[]) => {
      x.clearRect(0, 0, 1, 1);
      for (const l of layers) paint(l);
      return [...x.getImageData(0, 0, 1, 1).data].slice(0, 3);
    };
    const lum = (p: number[]) => {
      const [r, g, b] = p.map((v) => {
        const s = v / 255;
        return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    const [a, b] = [lum(rgb(under, getComputedStyle(el).color)), lum(rgb(under))];
    return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
  }, bg);
}

// ── the head: who you are and what you hold ────────────────────────────

test('the dashboard greets me by name and says what my whole portfolio is', async ({ page, world }) => {
  await page.goto('/app');

  const head = page.locator('.pagehead');
  await expect(head.getByText('Your portfolio')).toBeVisible();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(/^Good (morning|afternoon|evening), Shankar Reddy$/);

  // Every clause agrees with its count, and a kind the portfolio does not hold
  // is not mentioned at all — this account holds no open plots.
  await expect(head).toContainText('Land — 3 farm parcels (7.50 ac)');
  await expect(head).toContainText('Built — 1 flat + 1 shop (1,770 sq.ft)');
  await expect(head).not.toContainText('open plot');

  // What is owned is what the figures above count; the rest is named and
  // linked into Properties rather than silently folded in.
  await expect(head).toContainText('Owned only · 4 managed and 1 watched are in Properties');
  await expect(head.getByRole('link', { name: '4 managed' })).toHaveAttribute('href', '/app/properties?stake=managed');
  await expect(head.getByRole('link', { name: '1 watched' })).toHaveAttribute('href', '/app/properties?stake=watch');

  // Both clocks: the one this owner is sitting in, and the one the land is in,
  // named after the village holding most of the value (the first value bar).
  await expect(head.locator('p.note')).toHaveText(/^3 things waiting on you · .+ \d{2}:\d{2}, Land \d{2}:\d{2} IST$/);

  // The one action on the head, and it goes to the add drawer on Properties.
  await expect(head.getByRole('link', { name: 'Add', exact: true })).toHaveAttribute('href', '/app/properties?new=1');

  expect(world.calls('portfolio').length).toBeGreaterThan(0);
});

test('an account with no name on it is still greeted', async ({ page, world }) => {
  // web360.py:2462 blanks the display name when all it has is a login handle.
  world.set('portfolio', { ...world.seedOf<Portfolio>('portfolio'), displayName: '' });
  await page.goto('/app');

  await expect(page.getByRole('heading', { level: 1 })).toHaveText(GREETING);
  await expect(page.getByRole('heading', { level: 1 })).not.toContainText(',');
});

test('the greeting follows the clock, and turns over at noon and at five', async ({ page }) => {
  // Dashboard.tsx:29-33 cuts the day at 12:00 and at 17:00. It is the largest
  // sentence on the first screen of the app, and "Good morning" at half past
  // six in the evening makes everything under it read as approximate — so the
  // clock is pinned and each side of both boundaries is asserted, rather than
  // the assertion being loosened to whichever hour the suite happens to run in.
  const h1 = page.getByRole('heading', { level: 1 });
  const openAt = async (hour: number, minute: number) => {
    await page.clock.setFixedTime(lastIstMoment(hour, minute));
    await page.goto('/app');
    await expect(h1).toBeVisible();
  };

  await openAt(11, 59);
  await expect(h1).toHaveText('Good morning, Shankar Reddy');
  // The same pinned clock is the one the head prints, so this is also the
  // proof that the page is reading the time the test set.
  await expect(page.locator('.pagehead p.note')).toContainText('Land 11:59 IST');

  await openAt(12, 0);
  await expect(h1).toHaveText('Good afternoon, Shankar Reddy');

  await openAt(16, 59);
  await expect(h1).toHaveText('Good afternoon, Shankar Reddy');

  await openAt(17, 0);
  await expect(h1).toHaveText('Good evening, Shankar Reddy');
});

test('the dashboard and the frame around it read my portfolio once between them', async ({ page, world }) => {
  await page.goto('/app');

  await expect(page.getByRole('heading', { level: 1 })).toContainText('Shankar Reddy');
  await expect(overview(page)).toBeVisible();
  // The rail's own badge comes from the same read (Shell.tsx:63), so both
  // callers have been served by the time this is counted.
  await expect(page.getByRole('link', { name: /Notifications/ }).first()).toBeVisible();

  // One key, one read. A query key that varied per caller would silently
  // double the traffic of every screen in the app and nothing would look wrong.
  expect(world.calls('portfolio')).toHaveLength(1);
});

test('the portfolio line names only the kinds I actually hold', async ({ page, world }) => {
  const base = world.seedOf<Portfolio>('portfolio');
  world.set('portfolio', { ...base, builtExtent: 0, builtFlats: 0, builtShops: 0 });
  await page.goto('/app');

  const head = page.locator('.pagehead');
  // The head's one summary line (Dashboard.tsx `meta`), and the Properties
  // card's note under Overview, which says which kinds the count is made of.
  await expect(head.locator('p.note')).toHaveText('8 properties · 7.50 ac · 27 documents');
  const kinds = overview(page).getByRole('link', { name: /^Properties/ });
  await expect(kinds).toContainText('3 land parcels');
  await expect(kinds).not.toContainText('building');
  // "Built — (0 sq.ft)" is the line this branch exists to prevent.
  await expect(head).not.toContainText('Built');
  await expect(head).not.toContainText('sq.ft');
});

test('the portfolio line counts in the singular when I hold one of something', async ({ page, world }) => {
  const base = world.seedOf<Portfolio>('portfolio');
  world.set('portfolio', {
    ...base,
    farmCount: 1, farmExtent: 2, plotCount: 1, plotExtent: 300,
    builtFlats: 1, builtShops: 0, builtExtent: 1450, waitingCount: 1,
  });
  await page.goto('/app');

  const head = page.locator('.pagehead');
  await expect(head).toContainText('Land — 1 farm parcel (2.00 ac) and 1 open plot (300 sq.yd)');
  await expect(head).toContainText('Built — 1 flat (1,450 sq.ft)');
  await expect(head.locator('p.note')).toContainText('1 thing waiting on you');
});

test('a portfolio of open plots and shops is named in its own words', async ({ page, world }) => {
  // The other half of both clauses. `land` joins farm AND plots, `built` joins
  // flats AND shops (Dashboard.tsx:190-197), and each half is dropped on its
  // own — so a portfolio holding only the SECOND of each is the arrangement
  // where a stray ' and ' or ' + ' would be left hanging in the sentence.
  const base = world.seedOf<Portfolio>('portfolio');
  world.set('portfolio', {
    ...base,
    farmCount: 0, farmExtent: 0, plotCount: 2, plotExtent: 900,
    builtFlats: 0, builtShops: 2, builtExtent: 640,
  });
  await page.goto('/app');

  const head = page.locator('.pagehead');
  await expect(head.locator('p.lede').first())
    .toHaveText('Land — 2 open plots (900 sq.yd) · Built — 2 shops (640 sq.ft)');
  // And neither clause borrows the other's noun for a kind nobody holds.
  await expect(head).not.toContainText('farm parcel');
  await expect(head).not.toContainText('flat');
});

test('a portfolio that is all mine says nothing about managed or watched', async ({ page, world }) => {
  const base = world.seedOf<Portfolio>('portfolio');
  world.set('portfolio', { ...base, managedCount: 0, watchedCount: 0 });
  await page.goto('/app');

  // The positive assertion first: an absence asserted against a screen that
  // has not drawn yet is an absence that proves nothing.
  await expect(page.locator('.pagehead p.note')).toContainText('5 properties · 7.50 ac');
  await expect(page.locator('.pagehead')).not.toContainText('are in Properties');
  await expect(page.locator('.pagehead')).not.toContainText('Owned only');
});

test('an account that only watches somebody else’s land still gets a dashboard', async ({ page, world }) => {
  // holdings counts managed and watched too (Dashboard.tsx:218-219), so this
  // account is NOT a first run — there is something to look at, it just is not
  // owned. The summary line has nothing to say and is therefore not said at
  // all: "Land — ()" is the shape this branch exists to prevent.
  const base = world.seedOf<Portfolio>('portfolio');
  world.set('portfolio', {
    ...base,
    farmExtent: 0, farmCount: 0, plotExtent: 0, plotCount: 0,
    builtExtent: 0, builtFlats: 0, builtShops: 0,
    managedCount: 0, watchedCount: 2,
  });
  await page.goto('/app');

  const head = page.locator('.pagehead');
  // Exactly one lede, and it is the stake line — one clause, so no stray
  // "and" left over from the two-clause case.
  await expect(head.locator('p.lede')).toHaveCount(1);
  await expect(head.locator('p.lede')).toHaveText('Owned only · 2 watched are in Properties');
  await expect(head.getByRole('link', { name: '2 watched' }))
    .toHaveAttribute('href', '/app/properties?stake=watch');

  // And not the first-run screen, which would tell someone with two records on
  // their dashboard that they have none.
  await expect(page.getByText('No properties yet')).toHaveCount(0);
  await expect(page.locator('.strip > *')).toHaveCount(base.tiles.length);
});

// ── the tiles ──────────────────────────────────────────────────────────

test('every tile the server sends is drawn, in order, with its label, value, unit and note', async ({ page, world }) => {
  const seeded = world.seedOf<Portfolio>('portfolio');
  await page.goto('/app');

  const cells = page.locator('.strip > *');
  await expect(cells).toHaveCount(seeded.tiles.length);

  // Slot by slot rather than "the words are in there somewhere": a Cell draws
  // the label, the figure, its unit and the note into four different spans
  // (ui.tsx:397-410), and a figure that lands in the label's slot is a tile
  // nobody can read — which a whole-cell containText would not notice.
  for (const [i, t] of seeded.tiles.entries()) {
    const cell = cells.nth(i);
    await expect(cell.locator('.k'), `tile ${t.key} label`).toHaveText(t.label);
    await expect(cell.locator('.v'), `tile ${t.key} figure`).toContainText(t.value);
    await expect(cell.locator('.s'), `tile ${t.key} note`).toHaveText(t.note);
    if (t.unit) await expect(cell.locator('.v small'), `tile ${t.key} unit`).toHaveText(t.unit);
  }
});

test('a tile with no unit does not grow a stray one', async ({ page, world }) => {
  const seeded = world.seedOf<Portfolio>('portfolio');
  const papers = seeded.tiles.find((t) => t.key === 'papers');
  expect(papers?.unit, 'the seeded papers tile is the one with no unit').toBe('');

  await page.goto('/app');
  const cell = page.locator('.strip > *').filter({ hasText: 'Papers filed' });
  await expect(cell).toContainText('27');
  // Cell() only draws the <small> when a unit exists (ui.tsx:405).
  await expect(cell.locator('small')).toHaveCount(0);
});

test('a tile with nothing to say under it draws no empty line', async ({ page, world }) => {
  // The four money tiles web360.py:2504-2512 appends to EVERY portfolio carry
  // a label and a figure and nothing else — no unit, and on three of the four
  // no note. They are the tiles most owners see, and none of the seeded ones
  // is shaped like them.
  const base = world.seedOf<Portfolio>('portfolio');
  world.set('portfolio', {
    ...base,
    tiles: [
      { key: 'invested', label: 'Invested', value: '₹94.0 L', unit: '', note: '', tone: '' },
      { key: 'loans', label: 'Loans', value: '₹12.0 L', unit: '', note: 'outstanding', tone: 'plain' },
    ],
  });
  await page.goto('/app');

  const cells = page.locator('.strip > *');
  await expect(cells).toHaveCount(2);
  await expect(cells.nth(0).locator('.v')).toHaveText('₹94.0 L');
  // Cell draws the note span only when there is a note (ui.tsx:407). Drawn
  // empty it is a grey gap under one tile of a strip and not under the next,
  // which reads as a figure that failed to arrive.
  await expect(cells.nth(0).locator('.s')).toHaveCount(0);
  await expect(cells.nth(1).locator('.s')).toHaveText('outstanding');
});

test('a tile the server marks up or down is drawn in that tone', async ({ page, world }) => {
  // The server's own tone vocabulary — web360.py:2507-2511 sends up / down /
  // plain, and nothing else.
  const base = world.seedOf<Portfolio>('portfolio');
  world.set('portfolio', {
    ...base,
    tiles: [
      { key: 'gain', label: 'Gain', value: '+₹1.44 Cr', unit: '', note: '', tone: 'up' },
      { key: 'loans', label: 'Loans', value: '₹12.0 L', unit: '', note: 'outstanding', tone: 'down' },
      { key: 'worth', label: 'Worth now', value: '₹2.39 Cr', unit: '', note: '', tone: 'plain' },
    ],
  });
  await page.goto('/app');

  // A tone is only ever a colour, so the class is the only handle it has —
  // there is no text and no role that says "this figure is bad news".
  const figure = (label: string) => page.locator('.strip > *').filter({ hasText: label }).locator('span.v');
  await expect(figure('Gain')).toHaveClass(/\bup\b/);
  await expect(figure('Loans')).toHaveClass(/\bdown\b/);
  await expect(figure('Worth now')).not.toHaveClass(/\b(up|down)\b/);
});

// ── the overview ───────────────────────────────────────────────────────

test('Estimated value with nothing valued is a dash, and a screen reader hears not set', async ({ page, world }) => {
  // web360.py sums market value, and 0 is what land nobody has priced sums
  // to: an unknown figure, which is "—" (design.md § Property tabs), and
  // "not set" for a value that is not held, read out in its place.
  const base = world.seedOf<Portfolio>('portfolio');
  world.set('portfolio', { ...base, worthNow: 0 });
  await page.goto('/app');

  const worth = overview(page).getByRole('link', { name: /^Estimated value\s*not set/ });
  await expect(worth).toBeVisible();
  await expect(worth).toContainText('—');
  // What was paid is still a fact on file, so it stays.
  await expect(worth).toContainText('Bought for ₹94.0 L');
  await expect(worth).not.toContainText('Not valued');
  await expect(worth).not.toContainText('₹0');
});

test('the four overview cards share one row at 1512 with no empty track', async ({ page }) => {
  await page.goto('/app');

  const cards = overview(page).getByRole('link');
  await expect(cards).toHaveCount(4);
  // The grid and the figure have no role of their own; their classes are the
  // only handles on the grid's edge and on the figure's lines.
  const grid = overview(page).locator('.overview');
  const worth = overview(page).getByRole('link', { name: /^Estimated value/ }).locator('.ov-value');
  await expect(worth).toHaveText('₹2.38 Cr');

  const boxes = await boxesOf(cards, 4);
  const [edge] = await boxesOf(grid, 1);
  for (const b of boxes.slice(1)) {
    expect(Math.abs(b.y - boxes[0].y), '1512px: one row').toBeLessThanOrEqual(1);
    expect(Math.abs(b.width - boxes[0].width), '1512px: even tracks').toBeLessThanOrEqual(1);
  }
  // The fourth card ends where the grid does: no empty fifth track.
  const last = boxes[3];
  expect(Math.abs(last.x + last.width - (edge.x + edge.width)), '1512px: no empty track')
    .toBeLessThanOrEqual(1);
  expect(await linesOf(worth), '1512px: the figure on one line').toBe(1);

  // The narrowest window that still has the rail (the rail turns into a
  // drawer at 900px and below). The rail and the page's padding leave the
  // Overview 581px, and four cards in that left each figure 83px, so
  // "₹2.38 Cr" broke into "₹2.38" over "Cr". The cards go two by two instead:
  // still even, both rows full, the figure on one line, nothing sideways.
  await page.setViewportSize({ width: 901, height: 844 });
  const [a, b, c, d] = await boxesOf(cards, 4);
  const [narrow] = await boxesOf(grid, 1);
  expect(Math.abs(a.y - b.y), '901px: the first two share a row').toBeLessThanOrEqual(1);
  expect(c.y, '901px: the second two are under them').toBeGreaterThanOrEqual(a.y + a.height - 1);
  expect(Math.abs(c.y - d.y), '901px: the second two share a row').toBeLessThanOrEqual(1);
  for (const x of [b, c, d]) {
    expect(Math.abs(x.width - a.width), '901px: even tracks').toBeLessThanOrEqual(1);
  }
  for (const x of [b, d]) {
    expect(Math.abs(x.x + x.width - (narrow.x + narrow.width)), '901px: no empty track')
      .toBeLessThanOrEqual(1);
  }
  expect(await linesOf(worth), '901px: the figure on one line').toBe(1);
  const overflow = await page.evaluate(() =>
    document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});

test('an estimate in tens or hundreds of crores stays on one line at every window width', async ({ page, world }) => {
  // A figure split before its unit reads as a smaller amount: "₹12.40" over
  // "Cr" is twelve rupees. The cards take four tracks only when the Overview
  // has room for "₹12.40 Cr" in each, and go two by two below that, never
  // three and one. "₹123.45 Cr" is wider than a phone's card leaves for it,
  // and still keeps to one line, inside the card.
  const base = world.seedOf<Portfolio>('portfolio');
  const cards = overview(page).getByRole('link');
  // The figure has no role of its own; its class is the only handle on it.
  const worth = overview(page).getByRole('link', { name: /^Estimated value/ }).locator('.ov-value');
  for (const [worthNow, figure] of [[124_000_000, '₹12.40 Cr'], [1_234_500_000, '₹123.45 Cr']] as const) {
    world.set('portfolio', { ...base, worthNow });
    await page.setViewportSize({ width: 1512, height: 950 });
    await page.goto('/app');
    await expect(worth).toHaveText(figure);

    for (const width of [390, 840, 900, 901, 960, 1000, 1087, 1088, 1280, 1512]) {
      await page.setViewportSize({ width, height: 844 });
      const where = `${figure} at ${width}px`;
      expect(await linesOf(worth), `${where}: the figure on one line`).toBe(1);
      const [a, b, c, d] = await boxesOf(cards, 4);
      const oneRow = [b, c, d].every((x) => Math.abs(x.y - a.y) <= 1);
      const twoByTwo = Math.abs(a.y - b.y) <= 1 && Math.abs(c.y - d.y) <= 1
        && c.y >= a.y + a.height - 1;
      expect(oneRow || twoByTwo, `${where}: four in a row or two by two`).toBe(true);
      for (const x of [b, c, d]) {
        expect(Math.abs(x.width - a.width), `${where}: even tracks`).toBeLessThanOrEqual(1);
      }
      // Inside its own card, not over the border into the next one.
      const [f] = await boxesOf(worth, 1);
      expect(f.x + f.width, `${where}: the figure stays inside its card`).toBeLessThanOrEqual(d.x + d.width - 1);
      const overflow = await page.evaluate(() =>
        document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, `${where}: nothing scrolls sideways`).toBeLessThanOrEqual(1);
    }
  }
});

// ── where the value sits ───────────────────────────────────────────────

test('where the value sits draws one bar per village, in proportion', async ({ page }) => {
  await page.goto('/app');

  const panel = valuePanel(page);
  // The figure the bars divide is the Overview's Estimated value card, and a
  // valued figure is read as itself: nothing extra for a screen reader.
  const worth = overview(page).getByRole('link', { name: /^Estimated value/ });
  await expect(worth).toBeVisible();
  await expect(worth).not.toContainText('not set');
  await expect(worth).not.toContainText('—');

  const bars = panel.locator('.bar');
  await expect(bars).toHaveCount(3);
  await expect(bars.nth(0)).toContainText('Land');
  await expect(bars.nth(0)).toContainText('₹1.47 Cr');
  await expect(bars.nth(1)).toContainText('Flat');
  await expect(bars.nth(1)).toContainText('₹72.5 L');
  await expect(bars.nth(2)).toContainText('Shop');
  await expect(bars.nth(2)).toContainText('₹19.0 L');

  // A track with no fill in it is a chart that failed to load, so the widths
  // are measured rather than trusted: bigger share, wider bar.
  const width = async (i: number) =>
    (await bars.nth(i).locator('.fill').boundingBox())?.width ?? 0;
  expect(await width(0)).toBeGreaterThan(await width(1));
  expect(await width(1)).toBeGreaterThan(await width(2));

  await expect(worth).toContainText('Bought for ₹94.0 L');
  await expect(panel).toContainText('Running costs this year');
  await expect(panel).toContainText('₹86,400');
  await expect(page.locator('.pagehead p.note')).toContainText('27 documents');
});

test('the smallest village still gets a bar I can see', async ({ page, world }) => {
  const base = world.seedOf<Portfolio>('portfolio');
  world.set('portfolio', {
    ...base,
    valueBars: [
      { label: 'Katragunta', value: 14_700_000, share: 1 },
      { label: 'Markapur', value: 40_000, share: 0.0027 },
    ],
  });
  await page.goto('/app');

  const small = valuePanel(page).locator('.bar').nth(1);
  await expect(small).toContainText('Markapur');
  await expect(small).toContainText('₹40,000');

  // Dashboard.tsx:320 floors the fill at 4% — under it the bar is a hairline
  // nobody can see, and a village that holds something reads as holding nothing.
  const fill = (await small.locator('.fill').boundingBox())?.width ?? 0;
  const track = (await small.locator('.track').boundingBox())?.width ?? 1;
  expect(fill / track).toBeGreaterThan(0.03);
});

test('a portfolio nobody has valued says why, instead of drawing an empty chart', async ({ page, world }) => {
  const base = world.seedOf<Portfolio>('portfolio');
  world.set('portfolio', { ...base, valueBars: [] });
  await page.goto('/app');

  const panel = valuePanel(page);
  await expect(panel).toContainText('No village holds any value yet');
  await expect(panel.locator('.bar')).toHaveCount(0);
  // And the paid-in-total caption under the bars is not printed over nothing.
  await expect(panel).not.toContainText('in total.');
  // The rest of the panel is still true and still there.
  await expect(panel).toContainText('Running costs this year');
  // The head's second clock is named after the village holding most of the
  // value, and there is no such village — so it names the country rather than
  // printing a blank where a place should be (Dashboard.tsx:295 → ui clocks()).
  await expect(page.locator('.pagehead p.note')).toHaveText(/, India \d{2}:\d{2} IST$/);
});

test('a village worth nothing is not "where the value sits"', async ({ page, world }) => {
  // DEFECT. Dashboard.tsx:309 asks whether there are any BARS, not whether any
  // bar holds value, and web360.py:2414-2419 groups EVERY record by village
  // with no market-value filter — a village whose records are all unvalued
  // comes back as a bar worth 0. With share 0 the fill is still floored at 4%
  // (Dashboard.tsx:320), so the owner gets a chart titled "Where the value
  // sits" with a drawn bar reading ₹0 against it: exactly the "app that failed
  // to load its data" reading the first-run branch was written to kill.
  // Owed: bars worth nothing are not bars, and the panel falls through to the
  // sentence it already has — "No village holds any value yet".
  test.fail();

  const base = world.seedOf<Portfolio>('portfolio');
  world.set('portfolio', {
    ...base,
    worthNow: 0,
    valueBars: [
      { label: 'Katragunta', value: 0, share: 0 },
      { label: 'Markapur', value: 0, share: 0 },
    ],
  });
  await page.goto('/app');

  // The sentence first — the bar count is also 0 while the screen is loading,
  // so on its own it would go green for the wrong reason.
  const panel = valuePanel(page);
  await expect(panel).toContainText('No village holds any value yet');
  await expect(panel.locator('.bar')).toHaveCount(0);
});

test('a portfolio nobody has priced is not told it was free', async ({ page, world }) => {
  // Fixed by the 26/09 Home. `invested` is SUM(purchase_price) over every
  // record (web360.py:2408) — 0 for land that was inherited, partitioned in the
  // family, or bought long before there was a receipt anyone could type in —
  // and the old panel printed it straight, as "₹0 paid in total" under a chart
  // of what the land is worth. Value by village no longer carries a paid-in
  // clause at all, and the Estimated value card's "Bought for" note is drawn
  // only when a price is on file. This was a `test.fail()` until then.
  const base = world.seedOf<Portfolio>('portfolio');
  world.set('portfolio', { ...base, invested: 0 });
  await page.goto('/app');

  const panel = valuePanel(page);
  // The panel is drawn first, so what is asserted absent below is asserted
  // against a sentence that is actually on the screen.
  await expect(panel.locator('.bar')).toHaveCount(3);
  await expect(panel).toContainText('Running costs this year');
  await expect(panel).not.toContainText('Paid ₹0 in total');
  // Nor does the Overview figure grow a "Bought for ₹0" note.
  const worth = overview(page).getByRole('link', { name: /^Estimated value/ });
  await expect(worth).toContainText('₹');
  await expect(worth).not.toContainText('Bought for');
});

test('no papers filed says so rather than printing a zero', async ({ page, world }) => {
  const base = world.seedOf<Portfolio>('portfolio');
  world.set('portfolio', { ...base, paperCount: 0 });
  await page.goto('/app');

  const panel = valuePanel(page);
  await expect(panel).toContainText('No documents filed against your properties yet.');
  await expect(panel).not.toContainText('0 documents filed');
});

// ── recently opened ────────────────────────────────────────────────────

test('the recently opened strip shows what I last opened, and each card opens it', async ({ page, world }) => {
  const seeded = world.seedOf<Portfolio>('portfolio');
  await page.goto('/app');

  await expect(page.getByText('Recently opened')).toBeVisible();
  await expect(recent(page).getByRole('link', { name: 'All properties', exact: true }))
    .toHaveAttribute('href', '/app/properties');

  const cards = page.locator('.cards .rec');
  await expect(cards).toHaveCount(seeded.recent.length);
  for (const [i, r] of seeded.recent.entries()) {
    await expect(cards.nth(i)).toContainText(String(r.title));
    await expect(cards.nth(i)).toHaveAttribute('href', `/app/records/${String(r.id)}`);
  }

  // Extent and village, in the card's own words. The seeded cards carry
  // 'acres' / 'sft', which is NOT the server's vocabulary (web360.py:1351
  // sends 'ac'), so they take the whole-number branch of Dashboard.tsx:47 —
  // the two-decimal branch is asserted on real 'ac' data in the next test.
  await expect(cards.nth(0)).toContainText('4 acres · Katragunta');
  await expect(cards.nth(2)).toContainText('1,450 sft · Kukatpally');

  await cards.nth(0).click();
  await expect(page).toHaveURL(new RegExp(`/app/records/${ID.parcel}$`));
});

test('a card measured in acres keeps the fraction of an acre', async ({ page, world }) => {
  const base = world.seedOf<Portfolio>('portfolio');
  const parcel = { ...base.recent[0], extent: 4.3, extentUnit: 'ac' };
  const flat = { ...base.recent[2], classification: 'flat' };
  world.set('portfolio', { ...base, recent: [parcel, flat] });
  await page.goto('/app');

  const cards = page.locator('.cards .rec');
  // 4.3 acres is 4 acres 12 guntas. Rounded to "4 acres" it is a different
  // parcel, so the acre branch carries two decimals.
  await expect(cards.nth(0)).toContainText('4.30 ac · Katragunta');
  // Built property gets its own icon colour; a flat drawn as a field is the
  // reason the class is branched on at all (Dashboard.tsx RecordTile).
  await expect(cards.nth(1).locator('.rec-kind')).toHaveClass(/\bbuilt\b/);
});

test('a recent card is drawn as the kind of thing it actually is', async ({ page, world }) => {
  // The server's own classification vocabulary — 'agri' for land
  // (web360.py:1344) and flat / shop / open_plot for property
  // (web360.py:1367). The seeded cards say 'Dry land' and 'Residential', which
  // match none of the three branches in Dashboard.tsx:37, so on seeded data
  // every card takes the same default and this branch is never exercised.
  const base = world.seedOf<Portfolio>('portfolio');
  const from = base.recent[0];
  world.set('portfolio', {
    ...base,
    recent: [
      { ...from, id: ID.parcel, title: 'Sy 214/2', classification: 'agri', extent: 4.3, extentUnit: 'ac' },
      { ...from, id: ID.shop, title: 'Shop 7, Market Road', classification: 'shop', village: 'Markapur', extent: 320, extentUnit: 'sq.ft' },
      { ...from, id: ID.plot, title: 'Plot 19, Phase II', classification: 'open_plot', village: 'Konakalamitla', extent: 300, extentUnit: 'sq.yd' },
    ],
  });
  await page.goto('/app');

  const cards = page.locator('.cards .rec');
  await expect(cards).toHaveCount(3);
  // The kind is an icon colour keyed off the class and nothing else carries
  // it — the icon is aria-hidden — so the class is the only handle there is.
  await expect(cards.nth(0).locator('.rec-kind'), 'farm land is not a building')
    .not.toHaveClass(/\b(built|shop)\b/);
  await expect(cards.nth(1).locator('.rec-kind')).toHaveClass(/\bshop\b/);
  await expect(cards.nth(2).locator('.rec-kind')).toHaveClass(/\bbuilt\b/);

  // Each unit keeps its own spelling on the way through (Dashboard.tsx:47).
  await expect(cards.nth(0)).toContainText('4.30 ac · Katragunta');
  await expect(cards.nth(1)).toContainText('320 sq.ft · Markapur');
  await expect(cards.nth(2)).toContainText('300 sq.yd · Konakalamitla');
});

test('a card the server cannot place still says how big it is', async ({ page, world }) => {
  const base = world.seedOf<Portfolio>('portfolio');
  world.set('portfolio', {
    ...base,
    recent: [{ ...base.recent[0], village: '', extent: 4.3, extentUnit: 'ac' }],
  });
  await page.goto('/app');

  // The separator is printed only when there is a village to put after it
  // (Dashboard.tsx:48). A card reading "4.30 ac ·" is a card whose last word
  // failed to load, as far as anyone looking at it can tell.
  await expect(page.locator('.cards .rec').first().locator('p.note')).toHaveText('4.30 ac');
});

test('nothing opened yet is not worth a section', async ({ page, world }) => {
  const base = world.seedOf<Portfolio>('portfolio');
  world.set('portfolio', { ...base, recent: [] });
  await page.goto('/app');

  // Wait for the dashboard to be drawn BEFORE asserting what is not on it —
  // every one of these counts is also 0 for the half-second the screen is
  // still loading, and an absence asserted then proves nothing.
  await expect(overview(page)).toBeVisible();
  // A heading and an "All properties" link over an empty grid reads as a
  // section that failed to load.
  await expect(page.getByText('Recently opened')).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'All properties', exact: true })).toHaveCount(0);
  await expect(page.locator('.cards .rec')).toHaveCount(0);
});

test('recently opened tiles carry no placeholder band, and four share a row at 1512', async ({ page, world }) => {
  // Home draws no photo, map or scan for a recent tile, so the art band was
  // only ever the placeholder; the compact tile keeps the kind as an inline
  // icon instead. The server sends at most four (web360.py rows[:4]).
  const base = world.seedOf<Portfolio>('portfolio');
  world.set('portfolio', { ...base, recent: [...base.recent, structuredClone(CARDS[3])] });
  await page.goto('/app');

  const tiles = page.locator('.cards .rec');
  await expect(tiles).toHaveCount(4);
  // The band has no role or text, so its class is the only handle on it.
  await expect(page.locator('.cards .rec .art')).toHaveCount(0);
  await expect(tiles.locator('.rec-kind')).toHaveCount(4);

  const boxes = await boxesOf(tiles, 4);
  for (const b of boxes) expect(b.height, 'a compact tile is a line or two, not a 6.5rem band').toBeLessThanOrEqual(110);
  for (const b of boxes.slice(1)) {
    expect(Math.abs(b.y - boxes[0].y), 'all four on one row').toBeLessThanOrEqual(1);
    expect(Math.abs(b.width - boxes[0].width), 'even tracks').toBeLessThanOrEqual(1);
  }
});

test('three recently opened tiles fill the row at 1512, with no empty fourth track', async ({ page, world }) => {
  const seeded = world.seedOf<Portfolio>('portfolio');
  expect(seeded.recent).toHaveLength(3);
  await page.goto('/app');

  const tiles = page.locator('.cards .rec');
  await expect(tiles).toHaveCount(3);
  // The grid has no role; its class is the only handle on its edge.
  const [edge] = await boxesOf(page.locator('.cards.compact'), 1);
  const boxes = await boxesOf(tiles, 3);
  for (const b of boxes.slice(1)) {
    expect(Math.abs(b.y - boxes[0].y), 'all three on one row').toBeLessThanOrEqual(1);
    expect(Math.abs(b.width - boxes[0].width), 'even tracks').toBeLessThanOrEqual(1);
  }
  const last = boxes[2];
  expect(Math.abs(last.x + last.width - (edge.x + edge.width)), 'the third tile ends where the row does')
    .toBeLessThanOrEqual(1);
});

test('the kind icon on a recent tile can be told from its card in every theme', async ({ page, world }) => {
  // The icon is aria-hidden, but it is the only thing on the tile that says
  // land, building or shop, so it is held to the 3:1 a meaningful icon needs
  // against what it sits on (WCAG 1.4.11).
  const base = world.seedOf<Portfolio>('portfolio');
  const from = base.recent[0];
  world.set('portfolio', {
    ...base,
    recent: [
      { ...from, id: ID.parcel, title: 'Sy 214/2', classification: 'agri', extent: 4.3, extentUnit: 'ac' },
      { ...from, id: ID.flat, title: 'Flat 4B, Sai Residency', classification: 'flat', extent: 1450, extentUnit: 'sq.ft' },
      { ...from, id: ID.shop, title: 'Shop 7, Market Road', classification: 'shop', extent: 320, extentUnit: 'sq.ft' },
    ],
  });
  await page.goto('/app');

  const tiles = page.locator('.cards .rec');
  await expect(tiles).toHaveCount(3);
  for (const [scheme, item] of [['dark', null], ['light', 'Light'], ['pattadar', 'Pattadar Gold'], ['highContrast', 'High Contrast']] as const) {
    if (item) {
      await page.getByRole('button', { name: 'Change theme' }).click();
      await page.getByRole('menu', { name: 'Change theme' }).getByRole('menuitemradio', { name: item }).click();
    }
    // The scheme is an attribute on the document; nothing in the
    // accessible tree carries it.
    await expect(page.locator('html')).toHaveAttribute('data-scheme', scheme);
    for (let i = 0; i < 3; i += 1) {
      const tile = tiles.nth(i);
      const ratio = await contrastOf(tile.locator('.rec-kind'), tile);
      expect(ratio, `${scheme}: the kind icon on tile ${i + 1}`).toBeGreaterThanOrEqual(3);
    }
  }
});

// ── For you ────────────────────────────────────────────────────────────

test('every thing waiting on me says what it is, why, and where to go', async ({ page, world }) => {
  const seeded = world.seedOf<Portfolio>('portfolio');
  await page.goto('/app');

  const panel = forYou(page);
  // The way to the full list is the topbar's Notifications link; the 26/09
  // Home dropped the panel's own "Notifications ›".
  await expect(page.getByRole('link', { name: /^Notifications/ })).toHaveAttribute('href', '/app/notifications');

  const rows = reminderRows(page);
  await expect(rows).toHaveCount(3);

  for (const [i, w] of seeded.waiting.entries()) {
    const row = rows.nth(i);
    await expect(row.getByRole('heading', { level: 3 })).toHaveText(w.title);
    await expect(row).toContainText(w.detail);
    // Every seeded row carries a recordId, and a record is where its papers,
    // its people and its service tickets hang (whereTo, Dashboard.tsx). The
    // action is named for its row: three rows say "Open record", and three
    // identical names in a screen reader's list of links are no use.
    await expect(row.getByRole('link', { name: `Open record: ${w.title}`, exact: true }))
      .toHaveAttribute('href', `/app/records/${w.recordId}`);
    // The title is the same door as the action.
    await expect(row.getByRole('link', { name: w.title, exact: true }))
      .toHaveAttribute('href', `/app/records/${w.recordId}`);
    await expect(row.getByRole('button', { name: `Dismiss: ${w.title}`, exact: true })).toBeVisible();
  }

  // The verbs the server still sends — "File the receipt", "Ask for a survey"
  // — are deliberately NOT drawn: every one of them was wired to dismiss.
  for (const w of seeded.waiting) await expect(panel).not.toContainText(w.actionLabel);
});

test('a waiting row opens the record it is about', async ({ page, world }) => {
  const seeded = world.seedOf<Portfolio>('portfolio');
  await page.goto('/app');

  await reminderRows(page).nth(1).getByRole('link', { name: /^Open record: / }).click();
  expect(seeded.waiting[1].recordId).toBe(ID.plot);
  await expect(page).toHaveURL(new RegExp(`/app/records/${ID.plot}$`));
  await expect(page.getByRole('heading', { level: 1, name: 'Sy 88' })).toBeVisible();
});

test('For you counts orders, reminders and properties missing details, and says Missing details once', async ({ page }) => {
  await page.goto('/app');

  // One order waiting on the owner (W-2105 came back for review), three
  // reminders, and one property missing details: Sy 88, never pinned.
  await expect(forYouCount(page)).toHaveText('5');
  const row = missingRow(page);
  // Owned only: the parcel, Sy 88 and the flat. The watched Sy 301 has no
  // documents either, and it is somebody else's to complete.
  await expect(row).toContainText('2 of 3 complete');
  await expect(row).toContainText('1 Not on the map');
  await expect(row).not.toContainText('No documents');
  // Said once, as a row of For you, not a card of its own under it.
  await expect(page.getByRole('heading', { name: 'Missing details', exact: true })).toHaveCount(1);
  await expect(page.getByRole('heading', { level: 2, name: 'Missing details' })).toHaveCount(0);
  // Sy 88 already has a reminder in For you ("Sy 88 has never been surveyed"),
  // so it is not listed a second time — and with nothing left to list there is
  // nothing to disclose.
  await expect(row.getByRole('button')).toHaveCount(0);
  await expect(forYou(page).getByRole('link', { name: 'Sy 88', exact: true })).toHaveCount(0);
  await expect(caughtUp(page)).toHaveCount(0);
});

test('nothing waiting but a property off the map is not all caught up', async ({ page, world }) => {
  const base = world.seedOf<Portfolio>('portfolio');
  world.set('portfolio', { ...base, waiting: [], waitingCount: 0 });
  world.set('orders', []);
  await page.goto('/app');

  // Sy 88 is still not on the map, so For you has one thing in it.
  await expect(forYouCount(page)).toHaveText('1');
  await expect(caughtUp(page)).toHaveCount(0);
  await expect(page.getByText("You're all caught up")).toHaveCount(0);

  const row = missingRow(page);
  await row.getByRole('button', { name: 'Show all Missing details', exact: true }).click();
  const listed = row.getByRole('heading', { level: 4 });
  await expect(listed).toHaveCount(1);
  await expect(listed).toHaveText('Sy 88');
  const sy88 = row.locator('.rows > div')
    .filter({ has: page.getByRole('heading', { level: 4, name: 'Sy 88', exact: true }) });
  await expect(sy88).toContainText('Not on the map');

  // The fix is a text action named for the property, and it goes to the map.
  const fix = sy88.getByRole('link', { name: 'Set location: Sy 88', exact: true });
  await expect(fix).toHaveAttribute('href', `/app/records/${ID.plot}/map`);
  await fix.click();
  await expect(page).toHaveURL(new RegExp(`/app/records/${ID.plot}/map$`));
  await expect(page.getByRole('heading', { level: 1, name: 'Sy 88' })).toBeVisible();
});

test('For you says nothing while the property list is still coming', async ({ page, world }) => {
  const base = world.seedOf<Portfolio>('portfolio');
  // The portfolio is held back so the orders, asked beside it, have certainly
  // answered by the time the page draws: what is left unanswered is the list.
  world.set('portfolio', World.slow(800, { ...base, waiting: [], waitingCount: 0 }));
  world.set('orders', []);
  world.set('properties', World.never());
  await page.goto('/app');

  // The page has drawn and the list has been asked for…
  await expect(overview(page)).toBeVisible();
  await expect.poll(() => world.asked('properties')).toBe(true);
  // …and until it answers nobody can say nothing is missing, so For you says
  // nothing at all rather than "all caught up".
  await expect(caughtUp(page)).toHaveCount(0);
  await expect(forYou(page)).toHaveCount(0);
});

test('For you says nothing while the orders are still coming', async ({ page, world }) => {
  // Nothing waiting and nothing missing, but an order back for review could
  // still be on its way: the same rule as the property list. The portfolio is
  // held back so the list, asked beside it, has answered before the page draws.
  const base = world.seedOf<Portfolio>('portfolio');
  world.set('portfolio', World.slow(800, { ...base, waiting: [], waitingCount: 0 }));
  world.set('properties', listOf(only(ID.parcel, ID.flat)));
  world.set('orders', World.never());
  await page.goto('/app');

  await expect(overview(page)).toBeVisible();
  await expect.poll(() => world.asked('orders')).toBe(true);
  await expect(caughtUp(page)).toHaveCount(0);
  await expect(forYou(page)).toHaveCount(0);
});

test('a property list that does not load drops Missing details and keeps the rest of For you', async ({ page, world }) => {
  world.set('properties', World.gqlError('the property list is not answering'));
  await page.goto('/app');

  // Asked, retried once (main.tsx retry: 1), and failed both times.
  await expect.poll(() => world.calls('properties').length).toBeGreaterThanOrEqual(2);
  // The order and the three reminders are still here, and counted.
  await expect(forYouCount(page)).toHaveText('4');
  await expect(reminderRows(page)).toHaveCount(3);
  // No Missing details drawn from a list that never came, and no claim that
  // nothing is missing either.
  await expect(missingRow(page)).toHaveCount(0);
  await expect(caughtUp(page)).toHaveCount(0);
});

test('Show all says whether it is open and what it opens, and shows three at most', async ({ page, world }) => {
  const base = world.seedOf<Portfolio>('portfolio');
  world.set('portfolio', { ...base, waiting: [], waitingCount: 0 });
  world.set('orders', []);
  const [plot] = only(ID.plot);
  world.set('properties', listOf(Array.from({ length: 5 }, (_, i) => ({
    ...structuredClone(plot), id: `w-gap-${i}`, title: `Sy ${500 + i}`,
  }))));
  await page.goto('/app');

  const row = missingRow(page);
  await expect(row).toContainText('0 of 5 complete');
  await expect(row).toContainText('5 Not on the map');

  // Shut: it says so, and names the panel it controls.
  const toggle = row.getByRole('button', { name: 'Show all Missing details', exact: true });
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  const controls = await toggle.getAttribute('aria-controls');
  expect(controls, 'the disclosure names the panel it opens').toBeTruthy();
  const panel = page.locator(`[id="${controls}"]`);
  await expect(panel).toBeHidden();

  // Open: three properties, and the rest counted with the way to all of them.
  await toggle.click();
  const hide = row.getByRole('button', { name: 'Hide Missing details', exact: true });
  await expect(hide).toHaveAttribute('aria-expanded', 'true');
  await expect(panel).toBeVisible();
  await expect(panel.getByRole('heading', { level: 4 })).toHaveText(['Sy 500', 'Sy 501', 'Sy 502']);
  await expect(panel).toContainText('2 more properties');
  await expect(panel.getByRole('link', { name: 'All properties', exact: true }))
    .toHaveAttribute('href', '/app/properties');

  await hide.click();
  await expect(panel).toBeHidden();
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');

  // And from the keyboard: Enter opens it, Space shuts it.
  await toggle.focus();
  await page.keyboard.press('Enter');
  await expect(panel).toBeVisible();
  await expect(hide).toBeFocused();
  await page.keyboard.press('Space');
  await expect(panel).toBeHidden();
  await expect(toggle).toBeFocused();
});

test('a property a reminder already names is listed once, and its documents action says where it goes', async ({ page, world }) => {
  const base = world.seedOf<Portfolio>('portfolio');
  // The one reminder is about Sy 88, which is also off the map; the flat has
  // nothing filed on it.
  world.set('portfolio', { ...base, waiting: [base.waiting[1]], waitingCount: 1 });
  world.set('orders', []);
  const [parcel, plot, flat] = only(ID.parcel, ID.plot, ID.flat);
  world.set('properties', listOf([parcel, plot, { ...flat, paperCount: 0 }]));
  await page.goto('/app');

  // Sy 88 is counted — it is still missing its location — but said once.
  await expect(forYouCount(page)).toHaveText('3');
  const row = missingRow(page);
  await expect(row).toContainText('1 of 3 complete');
  await expect(row).toContainText('1 Not on the map');
  await expect(row).toContainText('1 No documents');

  await row.getByRole('button', { name: 'Show all Missing details', exact: true }).click();
  const listed = row.getByRole('heading', { level: 4 });
  await expect(listed).toHaveText(['Flat 4B, Sai Residency']);
  await expect(row.getByRole('link', { name: 'Sy 88', exact: true })).toHaveCount(0);

  // Not "Add document": that is the shortcut, which files into Documents and
  // cannot be opened for one property. Nor "Open Documents", which on Home is
  // the Documents page. This action opens the property's record, which opens
  // on its Documents tab, and says so in Home's word for that destination.
  await expect(row.getByRole('link', { name: /Add document/ })).toHaveCount(0);
  await expect(row.getByRole('link', { name: /^Open Documents/ })).toHaveCount(0);
  const fix = row.getByRole('link', { name: 'Open record: Flat 4B, Sai Residency', exact: true });
  await expect(fix).toHaveAttribute('href', `/app/records/${ID.flat}`);
  const addDocument = page.getByRole('link', { name: 'Add document', exact: true });
  await expect(addDocument).toHaveCount(1);
  await expect(addDocument).toHaveAttribute('href', '/app/papers?do=add');

  await fix.click();
  await expect(page).toHaveURL(new RegExp(`/app/records/${ID.flat}$`));
  await expect(page.getByRole('heading', { level: 1, name: 'Flat 4B, Sai Residency' })).toBeVisible();
});

test('each action label in For you leads one way, even with a shared link and an unfiled property side by side', async ({ page, world }) => {
  // The shared-link reminder's "Open Documents" opens the Documents page; a
  // property with nothing filed opens its own record. With both in the card at
  // once, a label that led to both places would be one word for two doors.
  const base = world.seedOf<Portfolio>('portfolio');
  world.set('portfolio', {
    ...base,
    waitingCount: 2,
    waiting: [base.waiting[0], {
      id: 'w-wait-link', title: "The advocate's link to 4 papers expires tomorrow",
      detail: 'Opened 3 times, last on 10/09/2026', icon: 'lock',
      actionLabel: 'Extend', actionKind: 'primary', recordId: '',
    }],
  });
  world.set('orders', []);
  const [parcel, flat] = only(ID.parcel, ID.flat);
  world.set('properties', listOf([parcel, { ...flat, paperCount: 0 }]));
  await page.goto('/app');

  const card = forYou(page);
  // Two reminders and the flat with nothing filed.
  await expect(forYouCount(page)).toHaveText('3');
  await missingRow(page).getByRole('button', { name: 'Show all Missing details', exact: true }).click();
  await expect(missingRow(page).getByRole('link', { name: 'Open record: Flat 4B, Sai Residency', exact: true }))
    .toBeVisible();

  const documents = card.getByRole('link', { name: /^Open Documents/ });
  await expect(documents).toHaveCount(1);
  await expect(documents).toHaveAttribute('href', '/app/papers');
  // The tax reminder and the flat: both are records, and only records.
  const records = card.getByRole('link', { name: /^Open record/ });
  await expect(records).toHaveCount(2);
  expect(await records.evaluateAll((els) => els.map((a) => a.getAttribute('href'))))
    .toEqual([`/app/records/${base.waiting[0].recordId}`, `/app/records/${ID.flat}`]);
});

test('a field with a pin but no boundary is asked for one, and a flat is not', async ({ page, world }) => {
  const base = world.seedOf<Portfolio>('portfolio');
  world.set('portfolio', { ...base, waiting: [], waitingCount: 0 });
  world.set('orders', []);
  // The server's own vocabulary (web360.py: agri, flat). Both are pinned and
  // neither has a boundary, but only land has one to draw.
  const [parcel, flat] = only(ID.parcel, ID.flat);
  world.set('properties', listOf([
    { ...parcel, classification: 'agri', ring: [] },
    { ...flat, classification: 'flat', ring: [] },
  ]));
  await page.goto('/app');

  const row = missingRow(page);
  await expect(row).toContainText('1 of 2 complete');
  await expect(row).toContainText('1 No boundary');
  await row.getByRole('button', { name: 'Show all Missing details', exact: true }).click();
  await expect(row.getByRole('heading', { level: 4 })).toHaveText(['Sy 214/2']);
  await expect(row.getByRole('link', { name: 'Draw boundary: Sy 214/2', exact: true }))
    .toHaveAttribute('href', `/app/records/${ID.parcel}/map`);
});

test('row actions in For you are text buttons, each named for its own row', async ({ page, world }) => {
  const seeded = world.seedOf<Portfolio>('portfolio');
  await page.goto('/app');

  const card = forYou(page);
  await expect(reminderRows(page)).toHaveCount(3);
  // Emphasis has no role — a filled, an outlined and a text button are all
  // links here — so the class is the only handle on which one is drawn.
  await expect(card.locator('.btn')).toHaveCount(0);
  // The page's own four starts keep their weight: one filled, three outlined.
  const shortcuts = page.getByRole('navigation', { name: 'Shortcuts' });
  await expect(shortcuts.locator('.btn.primary')).toHaveCount(1);
  await expect(shortcuts.locator('.btn')).toHaveCount(4);

  const order = card.getByRole('link', { name: 'Open order: W-2105 · Sy 214/2', exact: true });
  await expect(order).toHaveCount(1);
  for (const w of seeded.waiting) {
    await expect(card.getByRole('link', { name: `Open record: ${w.title}`, exact: true })).toHaveCount(1);
  }

  // And the order's action opens that order.
  await order.click();
  await expect(page).toHaveURL(new RegExp(`/app/services/${TICKET.needsYou}$`));
  await expect(page.getByRole('heading', { level: 1, name: 'Corner survey' })).toBeVisible();
});

test('a reminder about something I shared out opens Documents', async ({ page, world }) => {
  const base = world.seedOf<Portfolio>('portfolio');
  world.set('portfolio', {
    ...base,
    waitingCount: 1,
    waiting: [{
      id: 'w-wait-link', title: "The advocate's link to 4 papers expires tomorrow",
      detail: 'Opened 3 times, last on 10/09/2026', icon: 'lock',
      actionLabel: 'Extend', actionKind: 'primary', recordId: '',
    }],
  });
  await page.goto('/app');

  const row = reminderRows(page).first();
  // Every live link — its terms, its days left, its revoke — is on Documents.
  const open = row.getByRole('link', {
    name: "Open Documents: The advocate's link to 4 papers expires tomorrow", exact: true,
  });
  await expect(open).toHaveAttribute('href', '/app/papers');
  // And "Extend" is not offered, because nothing here can extend anything.
  await expect(row).not.toContainText('Extend');
  // A reminder that names no property hides none from Missing details: Sy 88
  // is still listed there, behind its disclosure.
  await expect(missingRow(page).getByRole('button', { name: 'Show all Missing details', exact: true }))
    .toBeVisible();

  await open.click();
  await expect(page).toHaveURL(/\/app\/papers$/);
});

test('a reminder the data cannot place carries no button rather than a wrong one', async ({ page, world }) => {
  const base = world.seedOf<Portfolio>('portfolio');
  world.set('portfolio', {
    ...base,
    waitingCount: 1,
    waiting: [{
      id: 'w-wait-orphan', title: 'Your KYC is not complete',
      detail: 'Two documents are still missing', icon: 'warn',
      actionLabel: 'Finish it', actionKind: 'primary', recordId: '',
    }],
  });
  await page.goto('/app');

  const row = reminderRows(page).first();
  await expect(row).toContainText('Your KYC is not complete');
  await expect(row).toContainText('Two documents are still missing');
  // A row with no record and no lock has no destination this data can name, so
  // it gets none — a guess lands the owner on the wrong screen.
  await expect(row.getByRole('link')).toHaveCount(0);
  // The reminder can still be taken away, so it is not a row you cannot leave.
  await expect(row.getByRole('button', { name: 'Dismiss: Your KYC is not complete' })).toBeVisible();
});

test('an empty waiting list says so rather than drawing an empty box', async ({ page, world }) => {
  // Nothing waiting, no order back for review, and nothing missing: the
  // parcel and the flat are both pinned, the parcel bounded, and both filed.
  const base = world.seedOf<Portfolio>('portfolio');
  world.set('portfolio', { ...base, waiting: [], waitingCount: 0 });
  world.set('orders', []);
  world.set('properties', listOf(only(ID.parcel, ID.flat)));
  await page.goto('/app');

  // The page has drawn before anything is asserted absent.
  await expect(overview(page)).toBeVisible();
  // For you's own empty state is one short line, not a card with nothing in it.
  const clear = caughtUp(page);
  await expect(clear).toContainText("You're all caught up");
  await expect(clear).toContainText('Nothing needs your attention.');
  await expect(forYou(page)).toHaveCount(0);
  await expect(reminderRows(page)).toHaveCount(0);
  // The way to the full list stays, on the topbar, with no count on it.
  await expect(bell(page, 'Notifications')).toHaveAttribute('href', '/app/notifications');
});

// ── dismissing a reminder ──────────────────────────────────────────────

test('dismissing a reminder is asked for, not done on one click', async ({ page, world }) => {
  const seeded = world.seedOf<Portfolio>('portfolio');
  const first = seeded.waiting[0];
  await page.goto('/app');

  await page.getByRole('button', { name: `Dismiss: ${first.title}`, exact: true }).click();

  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('heading', { name: 'Dismiss this reminder?' })).toBeVisible();
  await expect(dialog).toContainText(first.title);
  await expect(dialog).toContainText('cannot be brought back');

  await dialog.getByRole('button', { name: 'Keep it' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);

  // Nothing was sent, and the reminder is exactly where it was.
  expect(world.calls('dismissWaiting')).toHaveLength(0);
  await expect(reminderRows(page)).toHaveCount(3);
  await expect(forYou(page)).toContainText(first.title);
});

test('Escape backs out of the dismiss dialog without dismissing anything', async ({ page, world }) => {
  const first = world.seedOf<Portfolio>('portfolio').waiting[0];
  await page.goto('/app');

  await page.getByRole('button', { name: `Dismiss: ${first.title}`, exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();

  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(world.calls('dismissWaiting')).toHaveLength(0);
  await expect(reminderRows(page)).toHaveCount(3);
});

test('the dismiss dialog starts on Keep it, holds the keyboard, and hands it back', async ({ page, world }) => {
  // The one modal on the first screen of the app, against the contract
  // Dialog.tsx was written to keep. It matters most here of anywhere: the
  // thing behind this box cannot be undone, and the row it belongs to is one
  // of three identical rows.
  const first = world.seedOf<Portfolio>('portfolio').waiting[0];
  await page.goto('/app');

  const opener = page.getByRole('button', { name: `Dismiss: ${first.title}`, exact: true });
  await opener.click();

  // Named by its own heading rather than by a repeated aria-label
  // (Dialog.tsx:159), so a screen reader announces the words on the screen.
  const dialog = page.getByRole('dialog', { name: 'Dismiss this reminder?' });
  await expect(dialog).toHaveAttribute('aria-modal', 'true');

  // Focus lands on the way OUT, not on the irreversible one: a dialog that
  // opens with the destructive button under the returning Enter key throws the
  // reminder away on a keystroke that was meant for the row behind it.
  const keep = dialog.getByRole('button', { name: 'Keep it' });
  const drop = dialog.getByRole('button', { name: 'Dismiss it' });
  await expect(keep).toBeFocused();

  // And Tab cannot walk back out into the page underneath (Dialog.tsx:136-143)
  // — which is what `aria-modal` has already promised the screen reader.
  await page.keyboard.press('Tab');
  await expect(drop).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(keep).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(drop).toBeFocused();

  // On the way out the keyboard goes back where it came from. Left on <body>,
  // the next Tab starts again from the top of the document — three rows above
  // where the reader was (Dialog.tsx:121-127).
  await keep.click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(opener).toBeFocused();
  expect(world.calls('dismissWaiting')).toHaveLength(0);
});

test('clicking off the dismiss dialog backs out of it too', async ({ page, world }) => {
  const first = world.seedOf<Portfolio>('portfolio').waiting[0];
  await page.goto('/app');

  await page.getByRole('button', { name: `Dismiss: ${first.title}`, exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();

  // The scrim is the dark ground the box sits on; it has no role and no words,
  // so its class is the only handle on it (Dialog.tsx:151).
  await page.locator('.scrim').click({ position: { x: 8, y: 8 } });

  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(world.calls('dismissWaiting')).toHaveLength(0);
  await expect(reminderRows(page)).toHaveCount(3);
  await expect(forYou(page)).toContainText(first.title);
});

test('dismissing one reminder takes that one and leaves the others', async ({ page, world }) => {
  // The dismiss mutation invalidates the whole w360 key, so the portfolio is
  // re-read straight afterwards. The world has to answer that second read with
  // the list as it now stands, or the reminder walks back onto the screen.
  const base = world.seedOf<Portfolio>('portfolio');
  let waiting = base.waiting;
  world.set('portfolio', () => ({ ...base, waiting, waitingCount: waiting.length }));
  world.set('dismissWaiting', (vars: Record<string, unknown>) => {
    waiting = waiting.filter((w) => w.id !== vars.id);
    return true;
  });

  await page.goto('/app');
  await expect(reminderRows(page)).toHaveCount(3);
  // The order back for review, three reminders and Sy 88 off the map.
  await expect(forYouCount(page)).toHaveText('5');

  const gone = base.waiting[0];
  const kept = [base.waiting[1], base.waiting[2]];
  await page.getByRole('button', { name: `Dismiss: ${gone.title}`, exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Dismiss it' }).click();

  await expect(reminderRows(page)).toHaveCount(2);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(forYou(page)).not.toContainText(gone.title);
  for (const w of kept) await expect(forYou(page)).toContainText(w.title);

  // One row, one mutation, carrying that row's id and no other.
  expect(world.calls('dismissWaiting')).toHaveLength(1);
  expect(world.lastVars('dismissWaiting')).toMatchObject({ id: gone.id });
  // And both counts were re-read with it: For you's, and the bell's.
  await expect(forYouCount(page)).toHaveText('4');
  await expect(bell(page, 'Notifications, 2 waiting')).toBeVisible();
});

test('dismissing the last reminder leaves the panel saying there is nothing', async ({ page, world }) => {
  const base = world.seedOf<Portfolio>('portfolio');
  let waiting = [base.waiting[0]];
  world.set('portfolio', () => ({ ...base, waiting, waitingCount: waiting.length }));
  world.set('dismissWaiting', (vars: Record<string, unknown>) => {
    waiting = waiting.filter((w) => w.id !== vars.id);
    return true;
  });
  // The reminder is the last thing For you holds: no order back for review,
  // and nothing missing on the two properties the list answers with.
  world.set('orders', []);
  world.set('properties', listOf(only(ID.parcel, ID.flat)));

  await page.goto('/app');
  await expect(forYouCount(page)).toHaveText('1');
  await page.getByRole('button', { name: `Dismiss: ${base.waiting[0].title}`, exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Dismiss it' }).click();

  await expect(reminderRows(page)).toHaveCount(0);
  await expect(caughtUp(page)).toContainText("You're all caught up");
  await expect(forYou(page)).toHaveCount(0);
  await expect(bell(page, 'Notifications')).toBeVisible();
});

test('a dismissal in flight says so and cannot be sent twice', async ({ page, world }) => {
  const base = world.seedOf<Portfolio>('portfolio');
  let waiting = base.waiting;
  world.set('portfolio', () => ({ ...base, waiting, waitingCount: waiting.length }));
  world.set('dismissWaiting', World.slow(1200, true));

  await page.goto('/app');
  await page.getByRole('button', { name: `Dismiss: ${base.waiting[0].title}`, exact: true }).click();

  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: 'Dismiss it' }).click();

  // Both controls go dead while the write is out, and the dialog says which
  // way it is going — an unchanged dialog reads as a click that missed.
  await expect(dialog.getByRole('button', { name: 'Dismissing…' })).toBeDisabled();
  await expect(dialog.getByRole('button', { name: 'Keep it' })).toBeDisabled();
  await expect(dialog).toHaveAttribute('aria-busy', 'true');

  // Exactly one mutation went out, however long it took to come back.
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(world.calls('dismissWaiting')).toHaveLength(1);
});

test('a dismissal in flight cannot be escaped or clicked away', async ({ page, world }) => {
  // Escape and the scrim are the two ways out of every other dialog in the
  // module, and both are held shut while a write is out (Dialog.tsx:112) — the
  // answer has not come back yet, so there is nothing yet to walk away from,
  // and a box that vanishes mid-write is a dismissal nobody can tell happened.
  const base = world.seedOf<Portfolio>('portfolio');
  let waiting = base.waiting;
  world.set('portfolio', () => ({ ...base, waiting, waitingCount: waiting.length }));
  world.set('dismissWaiting', (vars: Record<string, unknown>) => {
    waiting = waiting.filter((w) => w.id !== vars.id);
    return World.slow(3000, true);
  });

  await page.goto('/app');
  await page.getByRole('button', { name: `Dismiss: ${base.waiting[0].title}`, exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: 'Dismiss it' }).click();
  await expect(dialog.getByRole('button', { name: 'Dismissing…' })).toBeDisabled();

  await page.keyboard.press('Escape');
  await expect(dialog).toBeVisible();
  await page.locator('.scrim').click({ position: { x: 8, y: 8 } });
  await expect(dialog).toBeVisible();

  // It closes when the server answers, and not one moment before.
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(reminderRows(page)).toHaveCount(2);
  expect(world.calls('dismissWaiting')).toHaveLength(1);
});

test('reminders can be cleared one after another, each carrying its own id', async ({ page, world }) => {
  // Every row owns its own mutation rather than sharing the panel's
  // (Dashboard.tsx:86-91), so a second dialog opens at rest instead of still
  // reading "Dismissing…" from the row before it.
  const base = world.seedOf<Portfolio>('portfolio');
  let waiting = base.waiting;
  world.set('portfolio', () => ({ ...base, waiting, waitingCount: waiting.length }));
  world.set('dismissWaiting', (vars: Record<string, unknown>) => {
    waiting = waiting.filter((w) => w.id !== vars.id);
    return true;
  });

  await page.goto('/app');
  const clear = async (title: string) => {
    await page.getByRole('button', { name: `Dismiss: ${title}`, exact: true }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toContainText(title);
    await expect(dialog.getByRole('button', { name: 'Dismiss it' })).toBeEnabled();
    await dialog.getByRole('button', { name: 'Dismiss it' }).click();
  };

  // Sy 88 is off the map AND named by its own reminder, so Missing details
  // has nothing of its own to list while that reminder stands.
  await expect(missingRow(page)).toContainText('1 Not on the map');
  await expect(missingRow(page).getByRole('button')).toHaveCount(0);

  await clear(base.waiting[0].title);
  await expect(reminderRows(page)).toHaveCount(2);
  await clear(base.waiting[1].title);
  await expect(reminderRows(page)).toHaveCount(1);

  await expect(forYou(page)).toContainText(base.waiting[2].title);
  await expect(bell(page, 'Notifications, 1 waiting')).toBeVisible();
  // With Sy 88's reminder gone, Sy 88 is no longer said elsewhere in For you,
  // so Missing details lists it again, behind its disclosure.
  await expect(missingRow(page).getByRole('button', { name: 'Show all Missing details', exact: true }))
    .toBeVisible();
  await expect(forYouCount(page)).toHaveText('3');
  // Two writes, in order, each naming the row it came from — not the first row
  // twice, which is what a shared mutation or a stale closure would send.
  expect(world.calls('dismissWaiting').map((c) => c.vars.id))
    .toEqual([base.waiting[0].id, base.waiting[1].id]);
});

test('a dismissal the server refuses keeps the reminder, and says why', async ({ page, world }) => {
  const seeded = world.seedOf<Portfolio>('portfolio');
  const first = seeded.waiting[0];
  world.set('dismissWaiting', World.gqlError('that reminder is not yours to dismiss'));

  await page.goto('/app');
  await page.getByRole('button', { name: `Dismiss: ${first.title}`, exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Dismiss it' }).click();

  // The toast carries the sentence and the machine's own reason under it, and
  // a failure never auto-dismisses (Toast.tsx:17).
  const toast = page.getByRole('alert');
  await expect(toast).toContainText('That item could not be saved. Nothing has changed.');
  await expect(toast).toContainText('that reminder is not yours to dismiss');

  // The dialog stays open, because the reminder is still there and still
  // unwanted, and the row is untouched underneath it.
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByRole('dialog').getByRole('button', { name: 'Dismiss it' })).toBeEnabled();
  await page.getByRole('dialog').getByRole('button', { name: 'Keep it' }).click();
  await expect(reminderRows(page)).toHaveCount(3);
  await expect(forYou(page)).toContainText(first.title);
});

// ── the first run: an account that holds nothing ───────────────────────

test('a brand-new account is told the one thing to do, and nothing else', async ({ page, world }) => {
  const base = world.seedOf<Portfolio>('portfolio');
  world.set('portfolio', firstRun(base));
  await page.goto('/app');

  // It is still a greeting and still an account, so the head stays.
  await expect(page.locator('.pagehead').getByText('Your portfolio')).toBeVisible();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(/^Good (morning|afternoon|evening), Shankar Reddy$/);
  await expect(page.locator('.pagehead p.note')).toHaveText(/^Nothing waiting on you · .+ \d{2}:\d{2}, India \d{2}:\d{2} IST$/);

  // One statement of what is absent, and one thing to do about it.
  await expect(page.getByText('No properties yet')).toBeVisible();
  const add = page.getByRole('link', { name: 'Add a property' });
  await expect(add).toHaveAttribute('href', '/app/properties?new=1');

  // And NOT a screen's worth of chrome over rows that do not exist: no tiles
  // reading ₹0, no chart with no bars under it, no "Recently opened" heading
  // over an empty grid, no waiting panel with nothing in it.
  await expect(page.locator('.strip')).toHaveCount(0);
  await expect(page.locator('.bars')).toHaveCount(0);
  await expect(page.getByText('Value by village')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Waiting on you', exact: true })).toHaveCount(0);
  await expect(page.getByText('Recently opened')).toHaveCount(0);
  await expect(page.getByText('Running costs this year')).toHaveCount(0);

  // Exactly one way to add a record, not a header Add plus an empty-state Add.
  await expect(page.locator('a[href="/app/properties?new=1"]')).toHaveCount(1);
});

test('a brand-new account refuses the four zero-rupee tiles the server still sends', async ({ page, world }) => {
  // web360.py:2504 always appends invested / worth / gain / loans, whatever the
  // account holds — so an empty portfolio arrives WITH tiles, and the screen
  // has to decide it is empty from the holdings, not from the payload.
  const base = world.seedOf<Portfolio>('portfolio');
  world.set('portfolio', firstRun(base, {
    tiles: [
      { key: 'invested', label: 'Invested', value: '₹0', unit: '', note: '', tone: '' },
      { key: 'worth', label: 'Worth now', value: '₹0', unit: '', note: '', tone: '' },
      { key: 'gain', label: 'Gain', value: '+₹0', unit: '', note: '', tone: 'up' },
      { key: 'loans', label: 'Loans', value: '₹0', unit: '', note: 'outstanding', tone: 'plain' },
    ],
  }));
  await page.goto('/app');

  await expect(page.getByText('No properties yet')).toBeVisible();
  await expect(page.locator('.strip')).toHaveCount(0);
  await expect(page.getByText('₹0')).toHaveCount(0);
});

test('an invitation can arrive before my first record does', async ({ page, world }) => {
  const base = world.seedOf<Portfolio>('portfolio');
  world.set('portfolio', firstRun(base, {
    waitingCount: 1,
    waiting: [{
      id: 'w-wait-invite', title: 'Ramana Reddy invited you to the family group',
      detail: 'Sent 2 days ago', icon: 'person',
      actionLabel: 'Accept', actionKind: 'primary', recordId: '',
    }],
  }));
  await page.goto('/app');

  // The empty state is still the main thing said…
  await expect(page.getByText('No properties yet')).toBeVisible();
  // …and the one panel worth drawing beside it is drawn.
  await expect(forYou(page)).toContainText('Ramana Reddy invited you to the family group');
  await expect(reminderRows(page)).toHaveCount(1);
  await expect(bell(page, 'Notifications, 1 waiting')).toBeVisible();
  // An account that holds nothing has nothing missing — even though the
  // property list this world answers with still carries Sy 88 off the map.
  // The count is the invitation and the seeded order back for review (W-2105),
  // and not Sy 88.
  await expect(missingRow(page)).toHaveCount(0);
  await expect(forYouCount(page)).toHaveText('2');
  // Still no overview, no chart, no recent grid.
  await expect(overview(page)).toHaveCount(0);
  await expect(page.getByText('Value by village')).toHaveCount(0);
  await expect(recent(page)).toHaveCount(0);
});

// ── still coming, and not coming ───────────────────────────────────────

test('while my portfolio is still coming the dashboard says so and claims nothing', async ({ page, world }) => {
  world.set('portfolio', World.never());
  await page.goto('/app');

  // The waiting word names the same thing the failure word does.
  const busy = page.locator('[role="status"][aria-busy="true"]');
  await expect(busy).toBeVisible();
  await expect(busy).toContainText('Loading your home page…');

  // It must not claim there is nothing there, and must not claim it failed.
  await expect(page.getByText('No properties yet')).toHaveCount(0);
  await expect(page.getByText('Your home page did not load')).toHaveCount(0);
  await expect(overview(page)).toHaveCount(0);
  await expect(page.getByRole('heading', { level: 1 })).toHaveCount(0);

  // The shell around it is drawn and usable — only the panel is waiting. The
  // rail reads the SAME query (Shell.tsx:63), so this is also the proof that a
  // portfolio still in the air does not take the navigation down with it. The
  // bell moved from the rail to the topbar, and reads the same query too.
  const rail = page.getByRole('navigation', { name: 'Sections' });
  await expect(rail.getByRole('link', { name: 'Home', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: /^Notifications/ })).toBeVisible();
});

test('a portfolio that does not come back says so, and says what the server said', async ({ page, world }) => {
  world.set('portfolio', World.gqlError('the portfolio store is not answering'));
  await page.goto('/app');

  const failed = page.getByRole('alert');
  await expect(failed).toContainText('Your home page did not load');
  await expect(failed).toContainText('Check your connection and try again.');
  // The reason, verbatim, for whoever is being asked "what does it say?".
  await expect(failed).toContainText('the portfolio store is not answering');
  await expect(failed.getByRole('button', { name: 'Try again' })).toBeVisible();

  // A failure is not an empty portfolio and must never be drawn as one.
  await expect(page.getByText('No properties yet')).toHaveCount(0);
  await expect(overview(page)).toHaveCount(0);
});

test('Try again re-asks for the portfolio, and the dashboard arrives when the server comes back', async ({ page, world }) => {
  const good = world.seedOf<Portfolio>('portfolio');
  world.set('portfolio', World.gqlError('the portfolio store is not answering'));
  await page.goto('/app');

  await expect(page.getByRole('alert')).toContainText('Your home page did not load');
  const asked = world.calls('portfolio').length;
  expect(asked, 'react-query retries once (main.tsx:43), so a dead read costs two calls').toBeGreaterThanOrEqual(2);

  world.set('portfolio', good);
  await page.getByRole('button', { name: 'Try again' }).click();

  // The button is not a dead one: the screen either repairs itself or is still
  // here saying so. Here the server came back, so the dashboard is drawn.
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Shankar Reddy');
  await expect(overview(page).getByRole('link')).toHaveCount(4);
  await expect(page.getByRole('alert')).toHaveCount(0);
  expect(world.calls('portfolio').length).toBeGreaterThan(asked);
});

test('Try again puts the screen back into its waiting state while it re-asks', async ({ page, world }) => {
  const good = world.seedOf<Portfolio>('portfolio');
  world.set('portfolio', World.gqlError('the portfolio store is not answering'));
  await page.goto('/app');
  await expect(page.getByRole('alert')).toContainText('Your home page did not load');

  // The server comes back, slowly — which is the only state in which what the
  // button DOES is visible. A retry that re-reads in silence looks like a dead
  // button, and a dead button on an error screen is where somebody gives up
  // and reloads the tab.
  world.set('portfolio', World.slow(2500, good));
  await page.getByRole('button', { name: 'Try again' }).click();

  // Note for whoever changes ui.tsx:740-746 next: `Failed`'s own 'Trying…'
  // label is unreachable from THIS screen. The refetch puts the query back to
  // pending, `isLoading` goes true, and Dashboard.tsx:181 swaps the whole
  // failure box for the loading one in the same tick the button was pressed.
  // What the owner gets instead is the screen's real waiting state, named —
  // which is the same promise kept a better way, so it is asserted, not
  // filed as a defect.
  const busy = page.locator('[role="status"][aria-busy="true"]');
  await expect(busy).toContainText('Loading your home page…');
  await expect(page.getByRole('alert')).toHaveCount(0);

  // And it was a real read: the dashboard is here when it lands.
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Shankar Reddy');
  await expect(overview(page)).toBeVisible();
  await expect(page.getByRole('alert')).toHaveCount(0);
});

test('Try again on a server that is still down leaves the failure on screen', async ({ page, world }) => {
  world.set('portfolio', World.gqlError('the portfolio store is not answering'));
  await page.goto('/app');

  await expect(page.getByRole('alert')).toContainText('Your home page did not load');
  const asked = world.calls('portfolio').length;

  await page.getByRole('button', { name: 'Try again' }).click();

  // It asked again — and the screen is still here saying so, which is itself
  // the answer. What it must not do is fall back to a skeleton forever.
  await expect.poll(() => world.calls('portfolio').length).toBeGreaterThan(asked);
  await expect(page.getByRole('alert')).toContainText('Your home page did not load');
  await expect(page.getByRole('button', { name: 'Try again' })).toBeEnabled();
  await expect(page.getByText('Loading your home page…')).toHaveCount(0);
});

// ── the phone ──────────────────────────────────────────────────────────

/** The width is pinned on the test rather than left to the project, because the
 *  `phone` project is WebKit (devices['iPhone 14']) and the desktop `app`
 *  project would otherwise run this same body at 1512px and prove nothing about
 *  a phone. Pinned, it is a real 390px assertion in whichever project picks it
 *  up — and the @phone tag still hands it to the phone project as well. */
test.describe(() => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('@phone the dashboard still hands me every waiting row and its way in', async ({ page, world }) => {
    const seeded = world.seedOf<Portfolio>('portfolio');
    await page.goto('/app');

    await expect(page.getByRole('heading', { level: 1 })).toContainText('Shankar Reddy');
    await expect(overview(page)).toBeVisible();

    const rows = reminderRows(page);
    await expect(rows).toHaveCount(3);
    for (const [i, w] of seeded.waiting.entries()) {
      await expect(rows.nth(i).getByRole('link', { name: `Open record: ${w.title}`, exact: true })).toBeVisible();
      await expect(rows.nth(i).getByRole('button', { name: `Dismiss: ${w.title}`, exact: true })).toBeVisible();
    }

    // Nothing runs off the side of the screen — the row's two controls wrap
    // rather than pushing the title off the edge.
    const overflow = await page.evaluate(() =>
      document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  });

  test('@phone the overview cards sit two by two on a phone', async ({ page }) => {
    await page.goto('/app');

    const cards = overview(page).getByRole('link');
    await expect(cards).toHaveCount(4);
    const [a, b, c, d] = await boxesOf(cards, 4);
    expect(Math.abs(a.y - b.y), 'the first two share a row').toBeLessThanOrEqual(1);
    expect(c.y, 'the second two are under them').toBeGreaterThanOrEqual(a.y + a.height - 1);
    expect(Math.abs(c.y - d.y), 'the second two share a row').toBeLessThanOrEqual(1);
    expect(Math.abs(a.width - b.width), 'two even columns').toBeLessThanOrEqual(1);
  });

  test('@phone Missing details opens to one-line rows that stay on the screen', async ({ page, world }) => {
    const base = world.seedOf<Portfolio>('portfolio');
    world.set('portfolio', { ...base, waiting: [], waitingCount: 0 });
    world.set('orders', []);
    await page.goto('/app');

    const row = missingRow(page);
    const toggle = row.getByRole('button', { name: 'Show all Missing details', exact: true });
    await toggle.click();
    const title = row.getByRole('heading', { level: 4, name: 'Sy 88' });
    const fix = row.getByRole('link', { name: 'Set location: Sy 88', exact: true });
    await expect(fix).toBeVisible();

    // One line: the property's name, its chip and its fix share a row rather
    // than stacking three deep.
    const [t] = await boxesOf(title, 1);
    const [f] = await boxesOf(fix, 1);
    expect(Math.abs((t.y + t.height / 2) - (f.y + f.height / 2)), 'the fix sits on the title’s line')
      .toBeLessThanOrEqual(8);

    const overflow = await page.evaluate(() =>
      document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);

    // A thumb gets the 44px floor on both text actions (w360.css `.rows
    // .linkbtn` under pointer: coarse). Only a coarse pointer has the floor.
    const coarse = await page.evaluate(() => matchMedia('(pointer: coarse)').matches);
    if (coarse) {
      const hide = row.getByRole('button', { name: 'Hide Missing details', exact: true });
      for (const target of [hide, fix]) {
        const [box] = await boxesOf(target, 1);
        expect(box.height, 'a thumb-sized target').toBeGreaterThanOrEqual(44);
      }
    } else {
      test.info().annotations.push({
        type: 'note', description: 'this browser reports a fine pointer, so the 44px coarse-pointer floor does not apply here',
      });
    }
  });
});
