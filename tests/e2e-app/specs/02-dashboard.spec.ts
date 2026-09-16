/**
 * W01 · the dashboard — the first screen of the app, in every state it has.
 *
 * The landing screen at `/app` is one query deep (`web.portfolio`) and four
 * screens wide: a greeting and a portfolio line, a strip of tiles, the two
 * panels — what is waiting on you and where the value sits — and the recently
 * opened strip. Every one of those is conditional on what the server sent, so
 * this file is mostly about the BRANCHES: the land-only portfolio, the
 * portfolio nobody has valued, the account that holds nothing at all, the read
 * that never comes back, and the read that comes back refused.
 *
 * Four things worth knowing before changing anything here.
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
 * Two `test.fail()`s live here: a village worth nothing still gets a bar, and
 * a portfolio nobody has priced is told it was free.
 */
import { test, expect, World } from '../fixtures/harness';
import type { Page } from '../fixtures/harness';
import { ID } from '../fixtures/ids';

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

// The two panels have no landmark role of their own — Card() renders a plain
// <section class="card"> — so each is found by the heading it carries.
const waitingPanel = (page: Page) =>
  page.locator('section.card').filter({ has: page.getByRole('heading', { name: 'Waiting on you', exact: true }) });
const valuePanel = (page: Page) =>
  page.locator('section.card').filter({ has: page.getByRole('heading', { name: 'Where the value sits' }) });
const waitingRows = (page: Page) => waitingPanel(page).locator('.rows > div');

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
  // linked into Holdings rather than silently folded in.
  await expect(head).toContainText('Owned only · 4 managed and 1 watched sit in Holdings');
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
  const seeded = world.seedOf<Portfolio>('portfolio');
  await page.goto('/app');

  await expect(page.getByRole('heading', { level: 1 })).toContainText('Shankar Reddy');
  await expect(page.locator('.strip > *')).toHaveCount(seeded.tiles.length);
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
  await expect(head).toContainText('Land — 3 farm parcels (7.50 ac)');
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
  await expect(page.locator('.pagehead')).toContainText('Land — 3 farm parcels');
  await expect(page.locator('.pagehead')).not.toContainText('sit in Holdings');
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
  await expect(head.locator('p.lede')).toHaveText('Owned only · 2 watched sit in Holdings');
  await expect(head.getByRole('link', { name: '2 watched' }))
    .toHaveAttribute('href', '/app/properties?stake=watch');

  // And not the first-run screen, which would tell someone with two records on
  // their dashboard that they have none.
  await expect(page.getByText('Nothing in your portfolio yet')).toHaveCount(0);
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

// ── where the value sits ───────────────────────────────────────────────

test('where the value sits draws one bar per village, in proportion', async ({ page }) => {
  await page.goto('/app');

  const panel = valuePanel(page);
  await expect(panel).toContainText('worth today');

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

  await expect(panel).toContainText('Worth today, one bar per village.');
  await expect(panel).toContainText('Against ₹94.0 L paid in total');
  await expect(panel).toContainText('Running costs this year');
  await expect(panel).toContainText('₹86,400');
  await expect(panel).toContainText('27 papers filed against your records.');
  await expect(panel.getByRole('link', { name: 'Papers' })).toHaveAttribute('href', '/app/papers');
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
  await expect(panel).toContainText('needs a market value on its Money tab');
  await expect(panel.locator('.bar')).toHaveCount(0);
  // And the caption that explains bars is not printed over nothing.
  await expect(panel).not.toContainText('one bar per village');
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
  // DEFECT. Dashboard.tsx:329 prints `inr(data.invested)` straight, and
  // `invested` is SUM(purchase_price) over every record (web360.py:2408) — 0
  // for land that was inherited, partitioned in the family, or bought long
  // before there was a receipt anyone could type in. The panel then reads
  // "Against ₹0 paid in total" directly under a chart of what the same land is
  // worth today: not "we do not know what you paid" but "you paid nothing",
  // which makes the entire market value read as gain.
  // ui.tsx:90-98 already owns this exact rule and the helper for it — `inr(0)`
  // on a valuation is a CLAIM, and `inrOr` is the figure-or-dash every screen
  // printing one is meant to use.
  // Owed: no purchase price on file says so — an em dash, or the cost clause
  // dropped from the sentence — never a rupee figure nobody ever entered.
  test.fail();

  const base = world.seedOf<Portfolio>('portfolio');
  world.set('portfolio', { ...base, invested: 0 });
  await page.goto('/app');

  const panel = valuePanel(page);
  // The panel is drawn first, so what is asserted absent below is asserted
  // against a sentence that is actually on the screen.
  await expect(panel.locator('.bar')).toHaveCount(3);
  await expect(panel).toContainText('Worth today, one bar per village.');
  await expect(panel).not.toContainText('Against ₹0 paid in total');
});

test('no papers filed says so rather than printing a zero', async ({ page, world }) => {
  const base = world.seedOf<Portfolio>('portfolio');
  world.set('portfolio', { ...base, paperCount: 0 });
  await page.goto('/app');

  const panel = valuePanel(page);
  await expect(panel).toContainText('No papers filed against your records yet.');
  await expect(panel).not.toContainText('0 papers filed');
  // The way to the vault stays, because that is where the first one is filed.
  await expect(panel.getByRole('link', { name: 'Papers' })).toHaveAttribute('href', '/app/papers');
});

// ── recently opened ────────────────────────────────────────────────────

test('the recently opened strip shows what I last opened, and each card opens it', async ({ page, world }) => {
  const seeded = world.seedOf<Portfolio>('portfolio');
  await page.goto('/app');

  await expect(page.getByText('Recently opened')).toBeVisible();
  await expect(page.getByRole('link', { name: 'All holdings ›' })).toHaveAttribute('href', '/app/properties');

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
  // Built property gets its own illustration; a flat drawn as a field is the
  // reason the class is branched on at all (Dashboard.tsx:37).
  await expect(cards.nth(1).locator('.art')).toHaveClass(/\bbuilt\b/);
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
  // The art is a colour wash keyed off the class and nothing else carries it,
  // so the class is the only handle there is.
  await expect(cards.nth(0).locator('.art'), 'farm land is not a building')
    .not.toHaveClass(/\b(built|shop)\b/);
  await expect(cards.nth(1).locator('.art')).toHaveClass(/\bshop\b/);
  await expect(cards.nth(2).locator('.art')).toHaveClass(/\bbuilt\b/);

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
  await expect(page.locator('.strip > *')).toHaveCount(base.tiles.length);
  // A heading and an "All holdings ›" link over an empty grid reads as a
  // section that failed to load.
  await expect(page.getByText('Recently opened')).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'All holdings ›' })).toHaveCount(0);
  await expect(page.locator('.cards .rec')).toHaveCount(0);
});

// ── waiting on you ─────────────────────────────────────────────────────

test('every thing waiting on me says what it is, why, and where to go', async ({ page, world }) => {
  const seeded = world.seedOf<Portfolio>('portfolio');
  await page.goto('/app');

  const panel = waitingPanel(page);
  await expect(panel.getByRole('link', { name: 'Notifications ›' })).toHaveAttribute('href', '/app/notifications');

  const rows = waitingRows(page);
  await expect(rows).toHaveCount(3);

  for (const [i, w] of seeded.waiting.entries()) {
    const row = rows.nth(i);
    await expect(row.getByRole('heading', { level: 3 })).toHaveText(w.title);
    await expect(row).toContainText(w.detail);
    // Every seeded row carries a recordId, and a record is where its papers,
    // its people and its service tickets hang (whereTo, Dashboard.tsx:68).
    await expect(row.getByRole('link', { name: 'Open record' }))
      .toHaveAttribute('href', `/app/records/${w.recordId}`);
    // The title is the same door as the button.
    await expect(row.getByRole('link', { name: w.title }))
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

  await waitingRows(page).nth(1).getByRole('link', { name: 'Open record' }).click();
  expect(seeded.waiting[1].recordId).toBe(ID.plot);
  await expect(page).toHaveURL(new RegExp(`/app/records/${ID.plot}$`));
});

test('a reminder about something I shared out opens Papers', async ({ page, world }) => {
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

  const row = waitingRows(page).first();
  // Every live link — its terms, its days left, its revoke — is on Papers.
  await expect(row.getByRole('link', { name: 'Open Papers' })).toHaveAttribute('href', '/app/papers');
  // And "Extend" is not offered, because nothing here can extend anything.
  await expect(row).not.toContainText('Extend');
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

  const row = waitingRows(page).first();
  await expect(row).toContainText('Your KYC is not complete');
  await expect(row).toContainText('Two documents are still missing');
  // A row with no record and no lock has no destination this data can name, so
  // it gets none — a guess lands the owner on the wrong screen.
  await expect(row.getByRole('link')).toHaveCount(0);
  // The reminder can still be taken away, so it is not a row you cannot leave.
  await expect(row.getByRole('button', { name: 'Dismiss: Your KYC is not complete' })).toBeVisible();
});

test('an empty waiting list says so rather than drawing an empty box', async ({ page, world }) => {
  const base = world.seedOf<Portfolio>('portfolio');
  world.set('portfolio', { ...base, waiting: [], waitingCount: 0 });
  await page.goto('/app');

  const panel = waitingPanel(page);
  await expect(panel).toContainText('Nothing is waiting on you.');
  await expect(waitingRows(page)).toHaveCount(0);
  await expect(page.locator('.pagehead p.note')).toContainText('Nothing waiting on you');
  // The way to the full list stays — an empty panel is not a dead panel.
  await expect(panel.getByRole('link', { name: 'Notifications ›' })).toBeVisible();
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
  await expect(dialog).toContainText('leaves this screen for good');
  await expect(dialog).toContainText('it cannot be brought back');
  // What is NOT thrown away has to be said, or the owner reads this as
  // "the tax stops being due".
  await expect(dialog).toContainText('Only the reminder goes');
  await expect(dialog).toContainText('with the same deadline on it');

  await dialog.getByRole('button', { name: 'Keep it' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);

  // Nothing was sent, and the reminder is exactly where it was.
  expect(world.calls('dismissWaiting')).toHaveLength(0);
  await expect(waitingRows(page)).toHaveCount(3);
  await expect(waitingPanel(page)).toContainText(first.title);
});

test('Escape backs out of the dismiss dialog without dismissing anything', async ({ page, world }) => {
  const first = world.seedOf<Portfolio>('portfolio').waiting[0];
  await page.goto('/app');

  await page.getByRole('button', { name: `Dismiss: ${first.title}`, exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();

  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(world.calls('dismissWaiting')).toHaveLength(0);
  await expect(waitingRows(page)).toHaveCount(3);
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
  await expect(waitingRows(page)).toHaveCount(3);
  await expect(waitingPanel(page)).toContainText(first.title);
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
  await expect(waitingRows(page)).toHaveCount(3);

  const gone = base.waiting[0];
  const kept = [base.waiting[1], base.waiting[2]];
  await page.getByRole('button', { name: `Dismiss: ${gone.title}`, exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Dismiss it' }).click();

  await expect(waitingRows(page)).toHaveCount(2);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(waitingPanel(page)).not.toContainText(gone.title);
  for (const w of kept) await expect(waitingPanel(page)).toContainText(w.title);

  // One row, one mutation, carrying that row's id and no other.
  expect(world.calls('dismissWaiting')).toHaveLength(1);
  expect(world.lastVars('dismissWaiting')).toMatchObject({ id: gone.id });
  // And the count in the head was re-read with it.
  await expect(page.locator('.pagehead p.note')).toContainText('2 things waiting on you');
});

test('dismissing the last reminder leaves the panel saying there is nothing', async ({ page, world }) => {
  const base = world.seedOf<Portfolio>('portfolio');
  let waiting = [base.waiting[0]];
  world.set('portfolio', () => ({ ...base, waiting, waitingCount: waiting.length }));
  world.set('dismissWaiting', (vars: Record<string, unknown>) => {
    waiting = waiting.filter((w) => w.id !== vars.id);
    return true;
  });

  await page.goto('/app');
  await page.getByRole('button', { name: `Dismiss: ${base.waiting[0].title}`, exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Dismiss it' }).click();

  await expect(waitingRows(page)).toHaveCount(0);
  await expect(waitingPanel(page)).toContainText('Nothing is waiting on you.');
  await expect(page.locator('.pagehead p.note')).toContainText('Nothing waiting on you');
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
  await expect(waitingRows(page)).toHaveCount(2);
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

  await clear(base.waiting[0].title);
  await expect(waitingRows(page)).toHaveCount(2);
  await clear(base.waiting[1].title);
  await expect(waitingRows(page)).toHaveCount(1);

  await expect(waitingPanel(page)).toContainText(base.waiting[2].title);
  await expect(page.locator('.pagehead p.note')).toContainText('1 thing waiting on you');
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
  await expect(waitingRows(page)).toHaveCount(3);
  await expect(waitingPanel(page)).toContainText(first.title);
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
  await expect(page.getByText('Nothing in your portfolio yet')).toBeVisible();
  await expect(page.getByText('A record is one parcel or one built property.')).toBeVisible();
  const add = page.getByRole('link', { name: 'Add your first record' });
  await expect(add).toHaveAttribute('href', '/app/properties?new=1');

  // And NOT a screen's worth of chrome over rows that do not exist: no tiles
  // reading ₹0, no chart with no bars under it, no "Recently opened" heading
  // over an empty grid, no waiting panel with nothing in it.
  await expect(page.locator('.strip')).toHaveCount(0);
  await expect(page.locator('.bars')).toHaveCount(0);
  await expect(page.getByText('Where the value sits')).toHaveCount(0);
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

  await expect(page.getByText('Nothing in your portfolio yet')).toBeVisible();
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
  await expect(page.getByText('Nothing in your portfolio yet')).toBeVisible();
  // …and the one panel worth drawing beside it is drawn.
  await expect(waitingPanel(page)).toContainText('Ramana Reddy invited you to the family group');
  await expect(waitingRows(page)).toHaveCount(1);
  await expect(page.locator('.pagehead p.note')).toContainText('1 thing waiting on you');
  // Still no chart, no tiles, no recent grid.
  await expect(page.locator('.strip')).toHaveCount(0);
  await expect(page.getByText('Where the value sits')).toHaveCount(0);
});

// ── still coming, and not coming ───────────────────────────────────────

test('while my portfolio is still coming the dashboard says so and claims nothing', async ({ page, world }) => {
  world.set('portfolio', World.never());
  await page.goto('/app');

  // The waiting word names the same thing the failure word does.
  const busy = page.locator('[role="status"][aria-busy="true"]');
  await expect(busy).toBeVisible();
  await expect(busy).toContainText('Loading your dashboard…');

  // It must not claim there is nothing there, and must not claim it failed.
  await expect(page.getByText('Nothing in your portfolio yet')).toHaveCount(0);
  await expect(page.getByText('Your dashboard did not load')).toHaveCount(0);
  await expect(page.locator('.strip')).toHaveCount(0);
  await expect(page.getByRole('heading', { level: 1 })).toHaveCount(0);

  // The shell around it is drawn and usable — only the panel is waiting. The
  // rail reads the SAME query (Shell.tsx:63), so this is also the proof that a
  // portfolio still in the air does not take the navigation down with it.
  const rail = page.getByRole('navigation', { name: 'Sections' });
  await expect(rail.getByRole('link', { name: 'Dashboard' })).toBeVisible();
  await expect(rail.getByRole('link', { name: /Notifications/ })).toBeVisible();
});

test('a portfolio that does not come back says so, and says what the server said', async ({ page, world }) => {
  world.set('portfolio', World.gqlError('the portfolio store is not answering'));
  await page.goto('/app');

  const failed = page.getByRole('alert');
  await expect(failed).toContainText('Your dashboard did not load');
  await expect(failed).toContainText('Nothing has been lost');
  await expect(failed).toContainText('Your records are untouched.');
  // The reason, verbatim, for whoever is being asked "what does it say?".
  await expect(failed).toContainText('the portfolio store is not answering');
  await expect(failed.getByRole('button', { name: 'Try again' })).toBeVisible();

  // A failure is not an empty portfolio and must never be drawn as one.
  await expect(page.getByText('Nothing in your portfolio yet')).toHaveCount(0);
  await expect(page.locator('.strip')).toHaveCount(0);
});

test('Try again re-asks for the portfolio, and the dashboard arrives when the server comes back', async ({ page, world }) => {
  const good = world.seedOf<Portfolio>('portfolio');
  world.set('portfolio', World.gqlError('the portfolio store is not answering'));
  await page.goto('/app');

  await expect(page.getByRole('alert')).toContainText('Your dashboard did not load');
  const asked = world.calls('portfolio').length;
  expect(asked, 'react-query retries once (main.tsx:43), so a dead read costs two calls').toBeGreaterThanOrEqual(2);

  world.set('portfolio', good);
  await page.getByRole('button', { name: 'Try again' }).click();

  // The button is not a dead one: the screen either repairs itself or is still
  // here saying so. Here the server came back, so the dashboard is drawn.
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Shankar Reddy');
  await expect(page.locator('.strip > *')).toHaveCount(good.tiles.length);
  await expect(page.getByRole('alert')).toHaveCount(0);
  expect(world.calls('portfolio').length).toBeGreaterThan(asked);
});

test('Try again puts the screen back into its waiting state while it re-asks', async ({ page, world }) => {
  const good = world.seedOf<Portfolio>('portfolio');
  world.set('portfolio', World.gqlError('the portfolio store is not answering'));
  await page.goto('/app');
  await expect(page.getByRole('alert')).toContainText('Your dashboard did not load');

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
  await expect(busy).toContainText('Loading your dashboard…');
  await expect(page.getByRole('alert')).toHaveCount(0);

  // And it was a real read: the dashboard is here when it lands.
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Shankar Reddy');
  await expect(page.locator('.strip > *')).toHaveCount(good.tiles.length);
  await expect(page.getByRole('alert')).toHaveCount(0);
});

test('Try again on a server that is still down leaves the failure on screen', async ({ page, world }) => {
  world.set('portfolio', World.gqlError('the portfolio store is not answering'));
  await page.goto('/app');

  await expect(page.getByRole('alert')).toContainText('Your dashboard did not load');
  const asked = world.calls('portfolio').length;

  await page.getByRole('button', { name: 'Try again' }).click();

  // It asked again — and the screen is still here saying so, which is itself
  // the answer. What it must not do is fall back to a skeleton forever.
  await expect.poll(() => world.calls('portfolio').length).toBeGreaterThan(asked);
  await expect(page.getByRole('alert')).toContainText('Your dashboard did not load');
  await expect(page.getByRole('button', { name: 'Try again' })).toBeEnabled();
  await expect(page.getByText('Loading your dashboard…')).toHaveCount(0);
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
    await expect(page.locator('.strip > *')).toHaveCount(seeded.tiles.length);

    const rows = waitingRows(page);
    await expect(rows).toHaveCount(3);
    for (const [i, w] of seeded.waiting.entries()) {
      await expect(rows.nth(i).getByRole('link', { name: 'Open record' })).toBeVisible();
      await expect(rows.nth(i).getByRole('button', { name: `Dismiss: ${w.title}`, exact: true })).toBeVisible();
    }

    // Nothing runs off the side of the screen — the row's two controls wrap
    // rather than pushing the title off the edge.
    const overflow = await page.evaluate(() =>
      document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  });
});
