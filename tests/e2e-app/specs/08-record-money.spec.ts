/**
 * W10 + W11 + W12 — money and expenses, every state of both.
 *
 * Two screens, one argument. `/money` keeps three figures apart on purpose —
 * what you PAID is a fact, what the government says is a published rate, what
 * it is WORTH is an assumption you chose — and `/expenses` is the ledger that
 * says what holding it costs, with capital rows lifting the cost base the
 * money screen measures against.
 *
 * What a reader of this file should know before changing it:
 *
 *  · The seeded `money` and `expenses` answers are FUNCTIONS of the record id
 *    (fixtures/seed.ts), so `world.seedOf()` refuses them. The two builders
 *    below are hand copies of that seed, for the tests that need one branch
 *    moved. Everything that can be asserted against the seed as it stands is,
 *    and the builders are used only where a branch has no seeded record.
 *  · The seed measures a parcel in `acres` and a flat in `sft`; the server
 *    sends `ac` and `sq.ft` (web360.py `_cards`). `ac` is the ONE unit string
 *    either screen branches on — two decimals on every extent, the singular
 *    "acre" in every per-unit rate, "an acre" in the running-cost sentence —
 *    so a handful of figures here read "4 acres" where production reads
 *    "4.30 acres". Three tests do read the fixture's unit back ("4 acres" in
 *    the lots table, "/ sft" and "1,450 sft" on the flat): that is what this
 *    world renders and it is asserted rather than fudged. The branch itself is
 *    covered on its own terms instead — three tests below drive
 *    `extentUnit: 'ac'` through both screens and the cost sheet, which is
 *    where a regression in that branch would actually show.
 *  · The appreciation chips change the money query's KEY, so react-query holds
 *    the previous answer (`placeholderData: keepPreviousData`) while the new
 *    rate loads. The seeded answer ignores the rate it is given; tests that
 *    care about the echo set an answer that honours it.
 *  · `World.httpError` makes the browser log a failed request, which the
 *    console guard fails on. Refusals here are `World.gqlError` (HTTP 200 with
 *    an `errors[]`) except the one test whose point is the transport failure.
 *
 * Eight defects are recorded as `test.fail()`, each with the file and line that
 * causes it and what the owner is owed instead:
 *
 *   · no way to delete a ledger row, though `deleteExpense` is a resolver, a
 *     mutation and a hook (api.ts:791) called from nowhere;
 *   · `recoverableNote` fetched on every row and drawn nowhere, so "Owed back
 *     by tenant" is a figure with no working;
 *   · the cost sheet's filename dated in UTC, the mistake RecordExpenses keeps
 *     a `todayIso()` to avoid;
 *   · a registration with no consideration on it printing "No purchase is
 *     recorded against this record" above the purchase;
 *   · both screens' `<Loading>` called without the `what` its own docstring
 *     says must match the `Failed what=` beside it;
 *   · the ledger's year select bound to the server's echo rather than to the
 *     year that was chosen, so the control springs back to the year just left
 *     for as long as the read takes;
 *   · "Owed back by tenant" living in only one of the strip's two shapes, so
 *     the figure vanishes on exactly the records that have a tenant;
 *   · the CSV injection guard applied to numbers as well as to text, so a
 *     record that has LOST value exports the loss as something a spreadsheet
 *     will not add.
 *
 * They go green the day they are fixed, which is what they are for.
 */
import { test, expect, World } from '../fixtures/harness';
import { ID, FEATURE, EXPENSE } from '../fixtures/ids';

// ── the two payloads, as fixtures/seed.ts answers them ─────────────────

const LOT = {
  id: 'w-lot-1', boughtOn: '1998-03-04', extent: 4.3, extentUnit: 'acres',
  rate: 430_232, paid: 1_850_000, govtValue: 1_200_000,
  seller: 'Chenna Reddy', deedNo: '4412/1998', sro: 'Markapur',
};

/** The parcel's money, every field `Q_MONEY` selects. Anything left out draws
 *  as `undefined` on the screen, which is the bug this suite exists to catch
 *  rather than to produce. */
const money = (over: Record<string, unknown> = {}) => ({
  recordId: ID.parcel, title: 'Sy 214/2', eyebrow: 'Katragunta, Markapur, Prakasam',
  paidTotal: 1_850_000, paidPerUnit: 430_232, extrasTotal: 46_000,
  govtTotal: 1_200_000, govtPerUnit: 279_069, govtRevised: '1 Apr 2026',
  marketTotal: 8_600_000, marketGain: 6_750_000, marketGainPct: 364.9,
  extent: 4.3, extentUnit: 'acres',
  lots: [LOT],
  blendedRate: 430_232, blendedPaid: 1_850_000, blendedGovt: 1_200_000,
  extras: [{ id: 'w-extra-1', label: 'Stamp duty and registration', amount: 46_000 }],
  rates: [
    { label: 'Government value', value: 279_069, unit: 'per acre' },
    { label: 'Market rate', value: 2_000_000, unit: 'per acre' },
  ],
  series: [
    { year: '2022', market: 5_600_000, government: 900_000, paid: 1_850_000 },
    { year: '2024', market: 7_100_000, government: 1_050_000, paid: 1_850_000 },
    { year: '2026', market: 8_600_000, government: 1_200_000, paid: 1_850_000 },
  ],
  appreciationPct: 8, isBuilt: false,
  landArea: 4.3, landRate: 2_000_000, landValue: 8_600_000,
  buildArea: 0, buildRate: 0, buildValue: 0, depreciation: 0, depreciationYears: 0,
  ...over,
});

const ROWS = [
  { id: EXPENSE.tax, title: 'Land tax 2025-26', subtitle: 'Paid at the mandal office', onLabel: 'Whole record', onIcon: 'parcelwide', kind: 'running', paidBy: 'Shankar Reddy', amount: 3_400, spentOn: '2026-04-12', category: 'tax', recoverable: false, recoverableNote: '', hasReceipt: true },
  { id: EXPENSE.wages, title: 'Watchman, April to September', subtitle: 'Ramana Rao', onLabel: 'Whole record', onIcon: 'parcelwide', kind: 'running', paidBy: 'Shankar Reddy', amount: 43_200, spentOn: '2026-09-01', category: 'wages', recoverable: false, recoverableNote: '', hasReceipt: false },
  { id: EXPENSE.fence, title: 'Barbed fence, eastern edge', subtitle: '420 m, 4 strand', onLabel: 'Barbed fence', onIcon: 'fence', kind: 'capital', paidBy: 'Venkat Reddy', amount: 68_000, spentOn: '2026-02-20', category: 'repairs', recoverable: true, recoverableNote: 'Half owed back by Venkat', hasReceipt: true },
];

/** The parcel's ledger, every field `Q_EXPENSES` selects. */
const expenses = (over: Record<string, unknown> = {}) => ({
  recordId: ID.parcel, title: 'Sy 214/2', eyebrow: 'Katragunta, Markapur, Prakasam',
  isBuilt: false, year: '2026-27', years: ['2026-27', '2025-26', '2024-25'],
  spent: 114_600, capital: 68_000, running: 46_600, owedBack: 34_000,
  income: 140_000, netYield: 1.1, perUnitRunning: 10_837,
  extent: 4.3, extentUnit: 'acres',
  categories: [
    { key: 'tax', label: 'Tax', count: 1, active: false },
    { key: 'wages', label: 'Wages', count: 1, active: false },
    { key: 'repairs', label: 'Repairs', count: 1, active: false },
  ],
  rows: ROWS,
  featureOptions: [
    { key: FEATURE.well, label: 'Open well', count: 0, active: false },
    { key: FEATURE.fence, label: 'Barbed fence', count: 1, active: false },
  ],
  ...over,
});

/** The three headline figures are plain divs with an eyebrow, not headings or
 *  landmarks — there is nothing better than the card class to hang a scope
 *  off, and asserting "₹18.5 L" against the whole page would pass on the wrong
 *  card. */
const cardWith = (page: import('@playwright/test').Page, text: string) =>
  page.locator('.card').filter({ hasText: text }).first();

/** One live region, named. The shell keeps an always-mounted (and usually
 *  empty) `role="status"` for search announcements — Shell.tsx:334 — so a bare
 *  `getByRole('status')` matches two elements on every screen in the app. */
const saying = (page: import('@playwright/test').Page, text: string) =>
  page.getByRole('status').filter({ hasText: text });

/** Open a hanger and wait for the screen itself to be there.
 *
 *  The founder's dev server serves this app unbundled, so a route nobody has
 *  opened in this browser is hundreds of module requests behind a Suspense
 *  spinner (routes.tsx `RouteFallback`) — on a loaded machine that outlasts a
 *  single expect timeout, and the first assertion of a test fails against a
 *  page that is still arriving. The wait is on the chunk, not on the data:
 *  every /api answer is already in the world and lands in milliseconds. */
async function open(page: import('@playwright/test').Page, path: string): Promise<void> {
  await page.goto(path);
  await expect(page.getByRole('progressbar')).toHaveCount(0, { timeout: 30_000 });
}

// ═══ W10 · what it cost, what it is worth ══════════════════════════════

test.describe('W10 · money', () => {
  test('what I paid, what the government says and what it might be worth are three separate numbers', async ({ page }) => {
    await open(page, `/app/records/${ID.parcel}/money`);

    await expect(page.getByRole('heading', { level: 1 })).toHaveText(/What it cost, what it.s worth/);
    await expect(cardWith(page, 'What you actually paid')).toContainText('₹18.5 L');
    await expect(cardWith(page, 'Government value today')).toContainText('₹12.0 L');
    await expect(cardWith(page, 'Market estimate')).toContainText('₹86.0 L');

    // Each headline carries its own per-unit rate, and the paid one says how
    // much of it was duty and capital work rather than land.
    await expect(cardWith(page, 'What you actually paid')).toContainText('₹4.3 L');
    await expect(cardWith(page, 'What you actually paid')).toContainText('incl. ₹46,000 duty & work');
    await expect(cardWith(page, 'Government value today')).toContainText('₹2.79 L');
    await expect(cardWith(page, 'Government value today')).toContainText('SRO rate, revised 1 Apr 2026');
    await expect(page.getByText('An assumption you chose, not a valuation.')).toBeVisible();
  });

  test('the money hanger keeps the record tab strip, with Money the tab I am on', async ({ page }) => {
    await open(page, `/app/records/${ID.parcel}/money`);
    const tabs = page.getByRole('navigation', { name: 'This record' });
    // Six hangers, one strip (Record.tsx:30). A strip that marks nothing as
    // current is six links to places the reader might already be standing.
    await expect(tabs.getByRole('link', { name: 'Money' })).toHaveAttribute('aria-current', 'page');
    await expect(tabs.getByRole('link', { name: /^Papers/ }))
      .toHaveAttribute('href', `/app/records/${ID.parcel}`);
    await expect(tabs.getByRole('link', { name: /^Papers/ })).not.toHaveAttribute('aria-current', 'page');
  });

  test('the gain is stated against what I paid, not against nothing', async ({ page }) => {
    await open(page, `/app/records/${ID.parcel}/money`);
    // ₹86.0 L market against ₹18.5 L paid — the figure and the percentage are
    // two halves of one sentence and have to agree.
    await expect(cardWith(page, 'Market estimate'))
      .toContainText('+₹67.5 L over what you paid · +365%');
  });

  test('a record worth less than it cost states a loss, not a smaller gain', async ({ page, world }) => {
    // The other side of every sign in that sentence (RecordMoney.tsx:263-265),
    // and the one a reader has to be able to trust at a glance: the sum is
    // down, the colour is down, and there is no + anywhere near it.
    world.set('money', money({
      marketTotal: 1_400_000, marketGain: -450_000, marketGainPct: -24.3,
    }));
    await open(page, `/app/records/${ID.parcel}/money`);

    const card = cardWith(page, 'Market estimate');
    await expect(card).toContainText('₹14.0 L');
    await expect(card).toContainText('\u2212₹4.5 L over what you paid · -24%');
    await expect(card).not.toContainText('+');
    // `.down` is what colours a loss; there is no role or word for "this
    // figure is the wrong way".
    await expect(card.locator('.down')).toBeVisible();
  });

  test('the purchase lots table carries the registration behind the price', async ({ page }) => {
    await open(page, `/app/records/${ID.parcel}/money`);

    await expect(page.getByRole('heading', { name: 'How you bought it' })).toBeVisible();
    await expect(page.getByText('One registration')).toBeVisible();

    const lot = page.getByRole('row', { name: /Chenna Reddy/ });
    // The lot's date is printed exactly as it arrives — `boughtOn` is a
    // display string, and web360.py stores it as the SRO wrote it.
    await expect(lot).toContainText('1998-03-04');
    await expect(lot).toContainText('4 acres');
    await expect(lot).toContainText('₹4.3 L');      // rate for the acre
    await expect(lot).toContainText('₹18.5 L');     // paid
    await expect(lot).toContainText('₹12.0 L');     // what the government said then
    await expect(lot).toContainText('4412/1998 · Markapur');

    // One registration is not a blend, so there is no "Together" row to sum.
    await expect(page.locator('tr.total')).toHaveCount(0);
  });

  test('two lots get a blended row that says which figure the registration actually carried', async ({ page, world }) => {
    // DD/MM/YYYY, the way scripts/seed-web360.py files a lot and the way the
    // eyebrow's `boughtOn.slice(-4)` needs it to reach the year. The seeded
    // answer dates a lot in ISO, which this test cannot use.
    world.set('money', money({
      lots: [
        { ...LOT, boughtOn: '04/03/1998' },
        { ...LOT, id: 'w-lot-2', boughtOn: '09/11/2002', extent: 2.1, rate: 380_000, paid: 798_000, govtValue: 540_000, seller: 'K. Satyavathi', deedNo: '3402/2002', sro: 'Markapur' },
      ],
      extent: 6.4, blendedRate: 413_750, blendedPaid: 2_648_000, blendedGovt: 1_740_000,
    }));
    await open(page, `/app/records/${ID.parcel}/money`);

    await expect(page.getByText('bought in two lots, 1998')).toBeVisible();
    await expect(page.getByText('2 lots, one registration summary')).toBeVisible();

    const together = page.locator('tr.total');   // the only row that is a sum
    await expect(together).toContainText('Together');
    await expect(together).toContainText('6 acres');
    await expect(together).toContainText('₹4.14 L');
    await expect(together).toContainText('₹26.48 L');
    await expect(together).toContainText('₹17.4 L');
    await expect(together)
      .toContainText('The registration summary only ever showed the ₹17.4 L government figure.');
  });

  test('duty and capital work are listed beside the purchase, never inside it', async ({ page }) => {
    await open(page, `/app/records/${ID.parcel}/money`);

    const extras = cardWith(page, 'Everything else you put in');
    await expect(extras).toContainText('Stamp duty and registration');
    await expect(extras).toContainText('₹46,000');
    await expect(extras).toContainText('so cost per acre stays honest');
    // …and it is NOT folded into the paid-per-acre figure beside it.
    await expect(cardWith(page, 'What you actually paid')).toContainText('₹4.3 L / acres');
  });

  test('a record with nothing else put into it does not draw an empty extras card', async ({ page, world }) => {
    world.set('money', money({ extras: [], extrasTotal: 0 }));
    await open(page, `/app/records/${ID.parcel}/money`);
    await expect(page.getByRole('heading', { name: 'How you bought it' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Everything else you put in' })).toHaveCount(0);
  });

  test('the value chart draws three lines over the years since the purchase', async ({ page }) => {
    await open(page, `/app/records/${ID.parcel}/money`);

    const chart = page.getByRole('img', { name: 'Value over time' });
    await expect(chart).toBeVisible();
    // Market, government and what you paid — three lines, and the legend that
    // says which is which.
    await expect(chart.locator('polyline')).toHaveCount(3);
    await expect(chart).toContainText('2022');
    // The middle tick is `series[Math.floor(len / 2)]`, its own bit of index
    // arithmetic — a chart labelled 2022 … 2022 … 2026 is a lying axis.
    await expect(chart).toContainText('2024');
    await expect(chart).toContainText('2026');
    const card = page.locator('section.card').filter({ hasText: 'Value over time' });
    await expect(card).toContainText('— Market estimate');
    await expect(card).toContainText('— Government');
    await expect(card).toContainText('— What you paid');
  });

  test('one year of history is not a chart, and the card says so instead of drawing an empty frame', async ({ page, world }) => {
    world.set('money', money({ series: [{ year: '2026', market: 8_600_000, government: 1_200_000, paid: 1_850_000 }] }));
    await open(page, `/app/records/${ID.parcel}/money`);

    await expect(page.getByRole('heading', { name: 'Value over time' })).toBeVisible();
    await expect(page.getByText('One year of history so far')).toBeVisible();
    await expect(page.getByRole('img', { name: 'Value over time' })).toHaveCount(0);
  });

  test('a record with no purchase at all is not given a titled chart with nothing under it', async ({ page, world }) => {
    world.set('money', money({ series: [], lots: [], paidTotal: 0, marketGain: null, marketGainPct: null }));
    await open(page, `/app/records/${ID.parcel}/money`);

    await expect(page.getByRole('heading', { name: 'How you bought it' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Value over time' })).toHaveCount(0);
  });

  test('nothing on file as paid is not drawn as a gain of the whole market value', async ({ page, world }) => {
    world.set('money', money({
      paidTotal: 0, paidPerUnit: 0, extrasTotal: 0, extras: [],
      marketGain: null, marketGainPct: null, lots: [],
    }));
    await open(page, `/app/records/${ID.parcel}/money`);

    // ₹0 would be a claim that somebody paid nothing; "—" is the truth.
    await expect(cardWith(page, 'What you actually paid')).toContainText('—');
    await expect(cardWith(page, 'What you actually paid'))
      .toContainText('No purchase is recorded against this record.');
    await expect(cardWith(page, 'Market estimate'))
      .toContainText('Nothing is recorded as paid, so there is no gain to show.');
    // The whole market value must not appear as profit anywhere on the page.
    await expect(page.getByText('over what you paid')).toHaveCount(0);
    await expect(page.getByText('+₹86.0 L')).toHaveCount(0);
  });

  test('with no lots filed the purchase card still says where a price would have come from', async ({ page, world }) => {
    world.set('money', money({
      paidTotal: 0, paidPerUnit: 0, extrasTotal: 0, extras: [],
      marketGain: null, marketGainPct: null, lots: [], series: [],
    }));
    await open(page, `/app/records/${ID.parcel}/money`);

    await expect(page.getByText('No purchase recorded for this record')).toBeVisible();
    await expect(page.getByText('Entering one here is not something the app can do yet')).toBeVisible();
    // The eyebrow is the extent and nothing else. `lots[0].boughtOn` on an
    // empty list is the shape that prints "bought undefined"; the page has a
    // third branch for it (RecordMoney.tsx:96) and this is what holds it.
    await expect(page.locator('main > p.eyebrow')).not.toContainText('bought');
    await expect(page.getByRole('link', { name: 'Papers ›' })).toHaveAttribute('href', `/app/records/${ID.parcel}`);
  });

  test('a price on the record with no lots behind it says so and points at Papers', async ({ page, world }) => {
    world.set('money', money({ lots: [] }));
    await open(page, `/app/records/${ID.parcel}/money`);

    await expect(page.getByText('The price is on the record, not broken into lots')).toBeVisible();
    await expect(page.getByText('The record says you paid ₹18.5 L')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Papers ›' })).toBeVisible();
  });

  test('the rates this land is priced in are listed beside the figures they produce', async ({ page }) => {
    await open(page, `/app/records/${ID.parcel}/money`);
    const rates = page.locator('section.card').filter({ hasText: 'Rates this land is priced in' });
    await expect(rates).toContainText('Government value');
    await expect(rates).toContainText('₹2.79 L');
    await expect(rates).toContainText('Market rate');
    await expect(rates).toContainText('₹20.0 L');
  });

  test('a record priced in no published rate at all leaves the rates card out', async ({ page, world }) => {
    world.set('money', money({ rates: [] }));
    await open(page, `/app/records/${ID.parcel}/money`);
    await expect(page.getByRole('heading', { name: 'How you bought it' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Rates this land is priced in' })).toHaveCount(0);
  });

  // ── the appreciation control ─────────────────────────────────────────

  test('choosing 14% asks the server again for 14%', async ({ page, world }) => {
    await open(page, `/app/records/${ID.parcel}/money`);
    await expect(cardWith(page, 'What you actually paid')).toContainText('₹18.5 L');
    expect(world.lastVars('money')).toMatchObject({ id: ID.parcel, appreciation: 10 });

    await page.getByRole('button', { name: '14%' }).click();
    await expect.poll(() => world.lastVars('money').appreciation).toBe(14);
    await expect(page.getByRole('button', { name: '14%' })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByRole('button', { name: '10%' })).toHaveAttribute('aria-pressed', 'false');
  });

  test('the headline follows the rate the server answered with, not the rate I pressed', async ({ page, world }) => {
    // The seeded answer ignores the rate it is given; this one honours it, the
    // way web360.py does.
    world.set('money', (vars) => money({ appreciationPct: Number(vars.appreciation ?? 10) }));
    await open(page, `/app/records/${ID.parcel}/money`);

    const used = page.locator('section.card').filter({ hasText: 'Appreciation used' });
    await expect(used).toContainText('10%');
    await page.getByRole('button', { name: '6%' }).click();
    await expect(used).toContainText('6%');
    await expect(used).toContainText('a year, compounding');
  });

  test('a rate of my own can be typed, and it is taken when I leave the box', async ({ page, world }) => {
    await open(page, `/app/records/${ID.parcel}/money`);
    await page.getByRole('button', { name: 'Custom' }).click();

    const box = page.getByLabel('Your own rate, per cent a year');
    await expect(box).toBeFocused();
    await expect(page.getByRole('button', { name: 'Custom' })).toHaveAttribute('aria-expanded', 'true');
    await expect(page.getByText('it is not saved with the record')).toBeVisible();

    await box.fill('12.5');
    await box.blur();
    await expect.poll(() => world.lastVars('money').appreciation).toBe(12.5);
  });

  test('Enter in the rate box commits it without leaving the box', async ({ page, world }) => {
    await open(page, `/app/records/${ID.parcel}/money`);
    await page.getByRole('button', { name: 'Custom' }).click();
    await page.getByLabel('Your own rate, per cent a year').fill('7');
    await page.getByLabel('Your own rate, per cent a year').press('Enter');
    await expect.poll(() => world.lastVars('money').appreciation).toBe(7);
  });

  test('a wild rate is clamped before it reaches the server', async ({ page, world }) => {
    await open(page, `/app/records/${ID.parcel}/money`);
    await page.getByRole('button', { name: 'Custom' }).click();

    // The server compounds whatever it is given and validates none of it, so
    // 500% a year would draw a curve into the billions and call it a market
    // estimate. 50 is the ceiling the box enforces.
    const box = page.getByLabel('Your own rate, per cent a year');
    await box.fill('500');
    await box.blur();
    await expect(box).toHaveValue('50');
    await expect.poll(() => world.lastVars('money').appreciation).toBe(50);
  });

  test('a negative rate is clamped to nothing rather than sent as a loss', async ({ page, world }) => {
    await open(page, `/app/records/${ID.parcel}/money`);
    await page.getByRole('button', { name: 'Custom' }).click();
    const box = page.getByLabel('Your own rate, per cent a year');
    await box.fill('-30');
    await box.blur();
    await expect(box).toHaveValue('0');
    await expect.poll(() => world.lastVars('money').appreciation).toBe(0);
  });

  test('a rate typed finer than the box keeps is rounded, not quietly truncated', async ({ page, world }) => {
    await open(page, `/app/records/${ID.parcel}/money`);
    await page.getByRole('button', { name: 'Custom' }).click();

    // `Math.round(n * 10) / 10` (RecordMoney.tsx:191). The box has to show back
    // the rate it actually sent, or the reader is looking at 12.34% over
    // figures compounded at 12.3%.
    const box = page.getByLabel('Your own rate, per cent a year');
    await box.fill('12.34');
    await box.blur();
    await expect(box).toHaveValue('12.3');
    await expect.poll(() => world.lastVars('money').appreciation).toBe(12.3);
  });

  test('a rate that is not a number puts the box back instead of asking for nothing', async ({ page, world }) => {
    await open(page, `/app/records/${ID.parcel}/money`);
    await expect(cardWith(page, 'Market estimate')).toContainText('₹86.0 L');
    const asked = world.calls('money').length;

    await page.getByRole('button', { name: 'Custom' }).click();
    const box = page.getByLabel('Your own rate, per cent a year');
    // type=number refuses letters outright, so the empty box is the case that
    // reaches commitCustom with nothing in it.
    await box.fill('');
    await box.blur();
    await expect(box).toHaveValue('10');
    expect(world.calls('money')).toHaveLength(asked);
  });

  test('Escape puts the rate box away, leaves the rate alone and gives the chip back its focus', async ({ page, world }) => {
    await open(page, `/app/records/${ID.parcel}/money`);
    await expect(cardWith(page, 'Market estimate')).toContainText('₹86.0 L');
    const asked = world.calls('money').length;

    await page.getByRole('button', { name: 'Custom' }).click();
    await page.getByLabel('Your own rate, per cent a year').fill('33');
    await page.getByLabel('Your own rate, per cent a year').press('Escape');

    await expect(page.getByLabel('Your own rate, per cent a year')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Custom' })).toBeFocused();
    await expect(page.getByRole('button', { name: 'Custom' })).toHaveAttribute('aria-expanded', 'false');
    expect(world.calls('money')).toHaveLength(asked);
  });

  test('while a new rate loads the old numbers stay on screen and the chart says it is busy', async ({ page, world }) => {
    await open(page, `/app/records/${ID.parcel}/money`);
    await expect(cardWith(page, 'Market estimate')).toContainText('₹86.0 L');

    world.set('money', World.slow(3500, money({ appreciationPct: 14, marketTotal: 12_000_000, marketGain: 10_150_000, marketGainPct: 548.6 })));
    await page.getByRole('button', { name: '14%' }).click();

    // The rate that is loading is the one in the headline — printing the old
    // payload's 8% beside a pressed 14% chip is a control appearing to do
    // nothing.
    const used = page.locator('section.card').filter({ hasText: 'Appreciation used' });
    await expect(used).toContainText('14%');
    // Only the chart moves with the rate, so only the chart dims.
    await expect(page.locator('div[aria-busy="true"]').filter({ hasText: 'Value over time' })).toBeVisible();
    await expect(cardWith(page, 'Market estimate')).toContainText('₹86.0 L');

    await expect(cardWith(page, 'Market estimate')).toContainText('₹1.20 Cr');
    await expect(page.locator('div[aria-busy="true"]')).toHaveCount(0);
  });

  test('a rate that will not load leaves the last one on screen and says which one it is', async ({ page, world }) => {
    await open(page, `/app/records/${ID.parcel}/money`);
    await expect(cardWith(page, 'Market estimate')).toContainText('₹86.0 L');

    world.set('money', World.gqlError('the valuation service is down'));
    await page.getByRole('button', { name: '14%' }).click();

    const used = page.locator('section.card').filter({ hasText: 'Appreciation used' });
    await expect(used).toContainText('The 14% figures did not load');
    await expect(used).toContainText('What is on screen is still 8%');
    // The page does not blank into an error, and the figures it is still
    // showing are the ones that loaded.
    await expect(cardWith(page, 'Market estimate')).toContainText('₹86.0 L');
  });

  // ── the built branch ─────────────────────────────────────────────────

  test('a built property splits into land, construction and what the structure has lost', async ({ page }) => {
    await open(page, `/app/records/${ID.flat}/money`);

    const split = page.locator('section.card').filter({ hasText: 'A built property splits in two' });
    await expect(split).toContainText('Land');
    await expect(split).toContainText('Construction');
    await expect(split).toContainText('1,450 sq.ft × ₹2,400');
    await expect(split).toContainText('₹34.8 L');
    await expect(split).toContainText('Less depreciation');
    await expect(split).toContainText('7 years, structure only');
    await expect(split).toContainText('Land appreciates, a building wears out.');
  });

  test('the structure wearing out comes off the split, as a subtraction', async ({ page, world }) => {
    // The seeded flat carries a land side of zeroes and ₹12 of depreciation,
    // which draws but proves nothing. These are the figures a valuer would
    // send: land up, structure down, and the three lines have to agree.
    world.set('money', money({
      isBuilt: true, extent: 1450, extentUnit: 'sq.ft',
      landArea: 120, landRate: 45_000, landValue: 5_400_000,
      buildArea: 1450, buildRate: 2_400, buildValue: 3_480_000,
      depreciation: 420_000, depreciationYears: 7,
    }));
    await open(page, `/app/records/${ID.flat}/money`);

    const split = page.locator('section.card').filter({ hasText: 'A built property splits in two' });
    await expect(split).toContainText('120 sq.yd × ₹45,000');
    await expect(split).toContainText('₹54.0 L');
    await expect(split).toContainText('1,450 sq.ft × ₹2,400');
    await expect(split).toContainText('₹34.8 L');
    // A minus sign, not a hyphen and not a bare figure: the whole argument of
    // the card is that this one is taken away (RecordMoney.tsx:512).
    await expect(split).toContainText('\u2212₹4.2 L');
  });

  test('land is not given a construction split it has no building for', async ({ page }) => {
    await open(page, `/app/records/${ID.parcel}/money`);
    await expect(page.getByRole('heading', { name: 'How you bought it' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'A built property splits in two' })).toHaveCount(0);
  });

  test('a flat is measured in sft, and every rate on the page is per sft', async ({ page }) => {
    await open(page, `/app/records/${ID.flat}/money`);
    await expect(page.getByText('1,450 sft · bought 2019-07-18')).toBeVisible();
    await expect(cardWith(page, 'What you actually paid')).toContainText('₹3,586 / sft');
    await expect(cardWith(page, 'Government value today')).toContainText('₹2,827 / sft');
    await expect(page.getByRole('columnheader', { name: '₹ / sft' })).toBeVisible();
  });

  test('an acre sent as the server sends it is drawn to two places and priced per acre', async ({ page, world }) => {
    // `ac` is the one unit string either screen branches on (RecordMoney.tsx:87
    // and :89). The seed says `acres`, which takes the OTHER side of every one
    // of those ternaries, so without this test the production shape — the only
    // shape a real record has — is the untested half.
    world.set('money', money({ extentUnit: 'ac', lots: [{ ...LOT, extentUnit: 'ac' }] }));
    await open(page, `/app/records/${ID.parcel}/money`);

    await expect(page.getByText('4.30 acres · bought 1998-03-04')).toBeVisible();
    await expect(cardWith(page, 'What you actually paid')).toContainText('₹4.3 L / acre ·');
    await expect(cardWith(page, 'Government value today')).toContainText('₹2.79 L / acre ·');
    await expect(page.getByRole('columnheader', { name: '₹ / acre' })).toBeVisible();
    await expect(page.getByRole('row', { name: /Chenna Reddy/ })).toContainText('4.30 ac');
  });

  test('three lots are counted in words and still sum into one blended row', async ({ page, world }) => {
    world.set('money', money({
      lots: [
        { ...LOT, boughtOn: '04/03/1998' },
        { ...LOT, id: 'w-lot-2', boughtOn: '09/11/2002', extent: 2.1, rate: 380_000, paid: 798_000, govtValue: 540_000, seller: 'K. Satyavathi', deedNo: '3402/2002' },
        { ...LOT, id: 'w-lot-3', boughtOn: '16/06/2011', extent: 1.0, rate: 500_000, paid: 500_000, govtValue: 300_000, seller: 'M. Prasad', deedNo: '9110/2011' },
      ],
      extent: 7.4, blendedRate: 425_135, blendedPaid: 3_148_000, blendedGovt: 2_040_000,
    }));
    await open(page, `/app/records/${ID.parcel}/money`);

    // The count is spelled out of a word list (RecordMoney.tsx:91) that runs
    // out at five; "bought in 3 lots" is the shape that says it broke.
    await expect(page.getByText('bought in three lots, 1998')).toBeVisible();
    await expect(page.getByText('3 lots, one registration summary')).toBeVisible();
    await expect(page.getByRole('row')).toHaveCount(5);      // head, three lots, Together
    await expect(page.locator('tr.total')).toContainText('₹31.48 L');
    await expect(page.locator('tr.total')).toContainText('₹20.4 L');
  });

  // ── loading, failure, and the way out ────────────────────────────────

  test('money that has not arrived holds its shape and says it is loading', async ({ page, world }) => {
    world.set('money', World.never());
    await open(page, `/app/records/${ID.parcel}/money`);

    await expect(saying(page, 'Loading')).toBeVisible();
    await expect(saying(page, 'Loading')).toHaveAttribute('aria-busy', 'true');
    // It must not claim there is nothing there.
    await expect(page.getByText('No purchase is recorded against this record.')).toHaveCount(0);
  });

  test('money that will not load says so, keeps the reason, and offers to try again', async ({ page, world }) => {
    world.set('money', World.gqlError('the valuation service is down'));
    await open(page, `/app/records/${ID.parcel}/money`);

    const failed = page.getByRole('alert');
    await expect(failed).toContainText('What this record is worth did not load');
    await expect(failed).toContainText('Nothing has been lost');
    await expect(failed).toContainText('the valuation service is down');
    await expect(failed.getByRole('button', { name: 'Try again' })).toBeVisible();
  });

  test('money comes back when the server does', async ({ page, world }) => {
    world.set('money', World.gqlError('the valuation service is down'));
    await open(page, `/app/records/${ID.parcel}/money`);
    await expect(page.getByRole('alert')).toBeVisible();

    world.set('money', money());
    await page.getByRole('button', { name: 'Try again' }).click();
    await expect(cardWith(page, 'Market estimate')).toContainText('₹86.0 L');
    await expect(page.getByRole('alert')).toHaveCount(0);
  });

  test.describe('a gateway that falls over', () => {
    // The point of these is the failed request itself, which the browser logs
    // to the console before any of the app's own code sees it.
    test.use({ allowConsole: true });

    test('a transport failure is a different sentence from a refusal, and still names itself', async ({ page, world }) => {
      world.set('money', World.httpError(503));
      await open(page, `/app/records/${ID.parcel}/money`);
      await expect(page.getByRole('alert')).toContainText('What this record is worth did not load');
      await expect(page.getByRole('alert')).toContainText('GraphQL HTTP 503');
    });
  });

  test('a record that is not mine never gets as far as asking what it is worth', async ({ page, world }) => {
    await open(page, `/app/records/${ID.missing}/money`);
    await expect(page.getByRole('heading', { name: 'That record is not in your portfolio' })).toBeVisible();
    expect(world.asked('money')).toBe(false);
  });

  test('the money page hands me through to what the land costs to hold', async ({ page }) => {
    await open(page, `/app/records/${ID.parcel}/money`);
    await page.getByRole('link', { name: 'What this land costs to hold ›' }).click();
    await expect(page).toHaveURL(new RegExp(`/app/records/${ID.parcel}/expenses$`));
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Expenses');
  });

  test('purchase lots are read-only, so nothing on the page offers to add one — but a cost can be recorded', async ({ page }) => {
    await open(page, `/app/records/${ID.parcel}/money`);
    await expect(page.getByRole('heading', { name: 'How you bought it' })).toBeVisible();
    // There is no add/update/delete resolver for purchase_lots in web360.py,
    // so a button here could only be a picture of one. That absence is
    // deliberate and is NOT the same as this hanger having no write at all: it
    // now leads with "Record a cost", which opens the shared expense drawer —
    // the same panel the ledger itself opens. Asserted together, because the
    // absence above used to be true of a page that offered nothing.
    await expect(page.getByRole('button', { name: /Add a purchase/i })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /^Cost sheet$/ })).toBeEnabled();

    const cost = page.getByRole('button', { name: 'Record a cost' });
    await expect(cost).toHaveAttribute('aria-haspopup', 'dialog');
    await cost.click();
    await expect(page.getByRole('dialog', { name: 'Add an expense' })).toBeVisible();
    // And still nothing that would file a purchase from inside it.
    await expect(page.getByRole('button', { name: /purchase/i })).toHaveCount(0);
  });

  // ── the cost sheet ───────────────────────────────────────────────────

  test('the cost sheet comes down as a CSV named after the record, and says it has', async ({ page }) => {
    await open(page, `/app/records/${ID.parcel}/money`);

    const [file] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Cost sheet' }).click(),
    ]);
    expect(file.suggestedFilename()).toMatch(/^cost-sheet-sy-214-2-\d{4}-\d{2}-\d{2}\.csv$/);
    // Nothing on the page moves when a file is filed away silently, so it is
    // said out loud.
    await expect(saying(page, 'Cost sheet saved as a CSV file.')).toBeVisible();
  });

  test('the cost sheet carries the three figures, the lots and the capital work', async ({ page }) => {
    await open(page, `/app/records/${ID.parcel}/money`);
    const [file] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Cost sheet' }).click(),
    ]);
    const csv = await readDownload(file);

    expect(csv.startsWith('﻿')).toBe(true);   // Excel reads ₹ as UTF-8
    expect(csv).toContain('Record,Sy 214/2');
    expect(csv).toContain('What you actually paid,1850000');
    // A label with a comma in it is quoted, or a spreadsheet reads it as two
    // columns and every figure after it lands one column left.
    expect(csv).toContain('"Of that, duty and capital work",46000');
    expect(csv).toContain('Government value today,1200000');
    expect(csv).toContain('Market estimate,8600000');
    expect(csv).toContain('"Appreciation assumed, % a year",8');
    // The one pair of rows the file COMPUTES rather than copies, and the pair
    // a spreadsheet will sum. 364.9 is rounded once, on the way out.
    expect(csv).toContain('Over what you paid,6750000');
    expect(csv).toContain('"Over what you paid, %",365');
    expect(csv).toContain('How you bought it');
    expect(csv).toContain('1998-03-04,4.3,acres,430232,1850000,1200000,Chenna Reddy,4412/1998,Markapur');
    expect(csv).toContain('Everything else you put in');
    expect(csv).toContain('Stamp duty and registration,46000');
  });

  test('the cost sheet leaves the gain out when nothing was paid, rather than exporting a zero', async ({ page, world }) => {
    world.set('money', money({ paidTotal: 0, paidPerUnit: 0, marketGain: null, marketGainPct: null }));
    await open(page, `/app/records/${ID.parcel}/money`);
    const [file] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Cost sheet' }).click(),
    ]);
    const csv = await readDownload(file);

    // A gain with nothing paid is not a gain; a spreadsheet would have summed
    // the zero.
    expect(csv).not.toContain('Over what you paid');
    expect(csv).toContain('What you actually paid,');
    expect(csv).toContain('Market estimate,8600000');
  });

  test('the cost sheet writes the extent and the per-unit rows in the unit it was sent', async ({ page, world }) => {
    world.set('money', money({ extentUnit: 'ac', lots: [{ ...LOT, extentUnit: 'ac' }] }));
    await open(page, `/app/records/${ID.parcel}/money`);
    const [file] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Cost sheet' }).click(),
    ]);
    const csv = await readDownload(file);

    // Three rows name the unit (RecordMoney.tsx:126, 129, 132). A file that
    // says "Paid per acre" against a per-hectare figure is worse than no file.
    expect(csv).toContain('Extent,4.30,ac');
    expect(csv).toContain('Paid per acre,430232');
    expect(csv).toContain('Government per acre,279069');
    expect(csv).toContain('1998-03-04,4.3,ac,430232,1850000,1200000,Chenna Reddy,4412/1998,Markapur');
  });

  test('a record with nothing bought and nothing added does not get empty sections in the file', async ({ page, world }) => {
    world.set('money', money({ lots: [], extras: [], extrasTotal: 0 }));
    await open(page, `/app/records/${ID.parcel}/money`);
    const [file] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Cost sheet' }).click(),
    ]);
    const csv = await readDownload(file);

    // Both sections are conditional (RecordMoney.tsx:142 and :150). A heading
    // with no rows under it is a spreadsheet asking what went wrong.
    expect(csv).not.toContain('How you bought it');
    expect(csv).not.toContain('Everything else you put in');
    expect(csv).toContain('Market estimate,8600000');
  });

  test('a seller whose name reads like a formula cannot become one in the spreadsheet', async ({ page, world }) => {
    world.set('money', money({ lots: [{ ...LOT, seller: '=HYPERLINK("http://evil.example","Click")' }] }));
    await open(page, `/app/records/${ID.parcel}/money`);
    const [file] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Cost sheet' }).click(),
    ]);
    const csv = await readDownload(file);

    // csvCell (ui.tsx:382) puts an apostrophe in front of =, +, - and @ and
    // then quotes the cell, so Excel opens a seller's name as a name. A deed
    // party is typed by a person and lands here untouched otherwise.
    expect(csv).toContain('"\'=HYPERLINK(""http://evil.example"",""Click"")"');
    expect(csv).not.toContain(',=HYPERLINK');
  });

  test('a cost sheet the browser will not write says so instead of claiming it saved', async ({ page }) => {
    // The catch around the whole export (RecordMoney.tsx:177). Only the object
    // URL can realistically fail — a hardened profile, a quota — and the toast
    // beside it is unconditional, so without the catch the app would say it
    // had saved a file that does not exist.
    await page.addInitScript(() => {
      const real = URL.createObjectURL.bind(URL);
      URL.createObjectURL = (obj: Blob | MediaSource) => {
        if (obj instanceof Blob && obj.type.startsWith('text/csv')) {
          throw new Error('object URLs are blocked');
        }
        return real(obj);
      };
    });
    await open(page, `/app/records/${ID.parcel}/money`);
    await page.getByRole('button', { name: 'Cost sheet' }).click();

    const alert = page.getByRole('alert');
    await expect(alert).toContainText('The cost sheet could not be saved.');
    await expect(alert).toContainText('object URLs are blocked');
    await expect(saying(page, 'Cost sheet saved as a CSV file.')).toHaveCount(0);
  });

  /** DEFECT — RecordMoney.tsx:169 names the file with
   *  `new Date().toISOString().slice(0, 10)`, which is UTC. RecordExpenses.tsx
   *  keeps a `todayIso()` (line 112) written for exactly this: between midnight
   *  and 05:29 IST the UTC date is yesterday, and on 1 April that is the wrong
   *  financial year on the file the owner keeps. The owner is owed a cost sheet
   *  named for the day the calendar on the wall says it was saved — the same
   *  helper, lifted into ui.tsx beside the other shared primitives. */
  test.fail('the cost sheet is named for the day I saved it, not for yesterday in London', async ({ page }) => {
    await page.clock.setFixedTime(new Date('2026-04-01T00:30:00+05:30'));
    await open(page, `/app/records/${ID.parcel}/money`);

    const [file] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Cost sheet' }).click(),
    ]);
    expect(file.suggestedFilename()).toBe('cost-sheet-sy-214-2-2026-04-01.csv');
  });

  /** DEFECT — RecordMoney.tsx:113. `paidKnown` is one flag for two different
   *  facts: whether a price is on file, and whether the server computed a gain
   *  from it. A registration with no consideration — an inherited or gifted
   *  parcel, which web360.py:3233 answers with `market_gain: null` because
   *  `paid_total` is 0 — therefore prints "No purchase is recorded against
   *  this record" directly above a table listing the purchase, its seller and
   *  its deed number. The owner is owed the gain sentence suppressed (it
   *  already is) and the purchase card saying no PRICE is recorded, while the
   *  registrations below it stand. */
  test.fail('a registration with no price on it does not make the page deny the purchase exists', async ({ page, world }) => {
    world.set('money', money({
      paidTotal: 0, paidPerUnit: 0, extrasTotal: 0, extras: [],
      marketGain: null, marketGainPct: null,
      lots: [{ ...LOT, paid: 0, rate: 0 }],
    }));
    await open(page, `/app/records/${ID.parcel}/money`);

    // The registration is on the screen…
    await expect(page.getByRole('row', { name: /Chenna Reddy/ })).toContainText('4412/1998 · Markapur');
    // …so the card above it cannot say there is no purchase.
    await expect(cardWith(page, 'What you actually paid'))
      .not.toContainText('No purchase is recorded against this record.');
  });

  /** DEFECT — ui.tsx:382. `csvCell` puts a leading apostrophe on anything that
   *  starts with =, +, - or @. That is right for a seller's name and wrong for
   *  a number: a parcel worth less than it cost writes its loss as `'-450000`,
   *  which a spreadsheet reads as text — the column will not sum, and the one
   *  figure the owner opened the file for is the one it cannot add. The owner
   *  is owed the guard on TEXT cells only; a number has nowhere to hide a
   *  formula. Both exports on these two screens go through this one helper
   *  (RecordMoney.tsx:156, RecordExpenses.tsx:359), so both carry it. */
  test.fail('a loss is exported as a number the spreadsheet can add up', async ({ page, world }) => {
    world.set('money', money({ marketTotal: 1_400_000, marketGain: -450_000, marketGainPct: -24.3 }));
    await open(page, `/app/records/${ID.parcel}/money`);

    const [file] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Cost sheet' }).click(),
    ]);
    const csv = await readDownload(file);
    expect(csv).toContain('Over what you paid,-450000');
  });

  test('@phone the wide purchase table scrolls inside its card, not the page sideways', async ({ page }) => {
    await open(page, `/app/records/${ID.parcel}/money`);
    await expect(page.getByRole('heading', { name: 'How you bought it' })).toBeVisible();

    // The only class in this file that is load-bearing: `.scroll-x` IS the
    // fix, and there is no role or label for "the box the table scrolls in".
    await expect(page.locator('.scroll-x', { has: page.getByRole('table') })).toBeVisible();
    const spill = await page.evaluate(() =>
      document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(spill).toBeLessThanOrEqual(1);
  });
});

// ═══ W11 + W12 · the ledger ════════════════════════════════════════════

test.describe('W11 + W12 · expenses', () => {
  test('the ledger says what was spent, on what, by whom, and whether there is a receipt', async ({ page }) => {
    await open(page, `/app/records/${ID.parcel}/expenses`);

    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Expenses');
    await expect(page.getByText('What this land costs')).toBeVisible();
    await expect(page.getByRole('row')).toHaveCount(4);        // three rows and the head

    const tax = page.getByRole('row', { name: /Land tax 2025-26/ });
    await expect(tax).toContainText('12/04/2026');
    await expect(tax).toContainText('Paid at the mandal office');
    await expect(tax).toContainText('Whole record');
    await expect(tax).toContainText('Running');
    await expect(tax).toContainText('Shankar Reddy');
    await expect(tax).toContainText('₹3,400');
    await expect(tax.getByRole('img', { name: 'Receipt filed' })).toBeVisible();

    const wages = page.getByRole('row', { name: /Watchman, April to September/ });
    await expect(wages.getByRole('img', { name: 'No receipt yet' })).toBeVisible();
  });

  test('a ledger row is a receipt, so its amount is never shortened to a magnitude', async ({ page }) => {
    await open(page, `/app/records/${ID.parcel}/expenses`);
    // ₹43,200, not "₹43.2 K" — the strip above is magnitudes, the rows are not.
    await expect(page.getByRole('row', { name: /Watchman/ })).toContainText('₹43,200');
    await expect(page.getByRole('row', { name: /Barbed fence/ })).toContainText('₹68,000');
    await expect(page.locator('.strip')).toContainText('₹1.15 L');
  });

  test('a capital row is marked as the thing that lifts the cost base', async ({ page }) => {
    await open(page, `/app/records/${ID.parcel}/expenses`);
    const fence = page.getByRole('row', { name: /Barbed fence, eastern edge/ });
    await expect(fence).toContainText('Capital');
    await expect(page.getByRole('row', { name: /Land tax/ })).toContainText('Running');
    await expect(page.getByText(/Capital rows lift the cost base on the Money tab/)).toBeVisible();
    await expect(page.getByText(/which is ₹46,600/)).toBeVisible();
  });

  test('a row I can claim back is marked apart from the rest of the ledger', async ({ page }) => {
    await open(page, `/app/records/${ID.parcel}/expenses`);
    // `tr.flagged` and an accent on the subtitle (RecordExpenses.tsx:489, :494)
    // are the ONLY marks a recoverable row carries — there is no word and no
    // role for "this one is owed back". Which is the whole reason the missing
    // `recoverableNote` below is filed as a defect rather than a nicety.
    const flagged = page.locator('tr.flagged');
    await expect(flagged).toHaveCount(1);
    await expect(flagged).toContainText('Barbed fence, eastern edge');
    await expect(page.getByRole('row', { name: /Land tax/ })).not.toHaveClass(/flagged/);
  });

  test('a row past a crore shortens, because that many digits stop being readable', async ({ page, world }) => {
    world.set('expenses', expenses({ rows: [{ ...ROWS[2], amount: 12_400_000 }, ROWS[0]] }));
    await open(page, `/app/records/${ID.parcel}/expenses`);
    // inrFullish (ui.tsx:110) keeps a receipt legible below a crore and
    // switches above it. Both halves of that threshold are on this screen.
    await expect(page.getByRole('row', { name: /Barbed fence/ })).toContainText('₹1.24 Cr');
    await expect(page.getByRole('row', { name: /Land tax/ })).toContainText('₹3,400');
  });

  test('spent, capital, running and what is owed back are four separate totals', async ({ page }) => {
    await open(page, `/app/records/${ID.parcel}/expenses`);
    const strip = page.locator('.strip');     // a row of Cells, no landmark of its own
    await expect(strip).toContainText('Spent this year');
    await expect(strip).toContainText('₹1.15 L');
    await expect(strip).toContainText('Capital · adds to cost');
    await expect(strip).toContainText('₹68,000');
    await expect(strip).toContainText('Running');
    await expect(strip).toContainText('₹46,600');
    await expect(strip).toContainText('Owed back by tenant');
    await expect(strip).toContainText('₹34,000');
  });

  test("a parcel's ledger says a row can hang off a feature, which is its whole argument", async ({ page }) => {
    await open(page, `/app/records/${ID.parcel}/expenses`);
    // The flat's half of this sentence is tested below; this is the half the
    // record every owner opens first actually reads (RecordExpenses.tsx:456).
    await expect(page.getByText("Every row can hang off a feature, so the bore's true cost is knowable")).toBeVisible();
    await expect(page.getByText('Rows hang off the flat')).toHaveCount(0);
  });

  test('a parcel measured the way the server measures it states the running cost an acre', async ({ page, world }) => {
    world.set('expenses', expenses({ extentUnit: 'ac' }));
    await open(page, `/app/records/${ID.parcel}/expenses`);
    // `ac` → "an acre" (RecordExpenses.tsx:338); every other unit takes the
    // "a <unit>" side. The seed's `acres` reads "a acres", so the branch that
    // production actually takes needs asserting here.
    await expect(page.getByText(/which is ₹46,600, or ₹10,837 an acre/)).toBeVisible();
  });

  test('a record with nothing to claim back is not told it has a tenant', async ({ page, world }) => {
    world.set('expenses', expenses({ owedBack: 0, rows: ROWS.map((r) => ({ ...r, recoverable: false })) }));
    await open(page, `/app/records/${ID.parcel}/expenses`);
    await expect(page.locator('.strip')).toContainText('Running');
    await expect(page.getByText('Owed back by tenant')).toHaveCount(0);
  });

  test('choosing another financial year asks the ledger for that year', async ({ page, world }) => {
    await open(page, `/app/records/${ID.parcel}/expenses`);
    await expect(page.getByRole('row', { name: /Land tax 2025-26/ })).toBeVisible();
    // No year chosen is a null, not this year's guess — the server picks the
    // most recent year that has rows and echoes it back.
    expect(world.lastVars('expenses')).toMatchObject({ id: ID.parcel, year: null });

    await page.getByLabel('Financial year').selectOption('2025-26');
    await expect.poll(() => world.lastVars('expenses').year).toBe('2025-26');
    await expect(page.getByLabel('Financial year')).toHaveValue('2025-26');
  });

  test('a category chip narrows the ledger to that category', async ({ page }) => {
    await open(page, `/app/records/${ID.parcel}/expenses`);
    await expect(page.getByRole('row')).toHaveCount(4);

    await page.getByRole('button', { name: /^Tax/ }).click();
    await expect(page.getByRole('button', { name: /^Tax/ })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByRole('row')).toHaveCount(2);
    await expect(page.getByRole('row', { name: /Land tax 2025-26/ })).toBeVisible();
    await expect(page.getByRole('row', { name: /Watchman/ })).toHaveCount(0);
  });

  test('picking All again brings the whole ledger back', async ({ page, world }) => {
    // web360.py:3283 puts an "All" facet in front of the categories; the
    // seeded answer here has only the three real ones.
    world.set('expenses', expenses({
      categories: [
        { key: 'all', label: 'All', count: 3, active: true },
        { key: 'tax', label: 'Tax', count: 1, active: false },
        { key: 'wages', label: 'Wages', count: 1, active: false },
        { key: 'repairs', label: 'Repairs', count: 1, active: false },
      ],
    }));
    await open(page, `/app/records/${ID.parcel}/expenses`);

    await page.getByRole('button', { name: /^Tax/ }).click();
    await expect(page.getByRole('row')).toHaveCount(2);
    await page.getByRole('button', { name: /^All/ }).click();
    await expect(page.getByRole('row')).toHaveCount(4);
  });

  test('a category with nothing in it says so rather than leaving an empty table', async ({ page, world }) => {
    world.set('expenses', expenses({
      categories: [
        { key: 'tax', label: 'Tax', count: 1, active: false },
        { key: 'legal', label: 'Legal', count: 0, active: false },
      ],
    }));
    await open(page, `/app/records/${ID.parcel}/expenses`);

    await page.getByRole('button', { name: /^Legal/ }).click();
    await expect(page.getByText('Nothing under Legal for 2026-27.')).toBeVisible();
    // …and it is not confused with a record that has never had anything spent.
    await expect(page.getByText('Nothing spent on this record yet')).toHaveCount(0);
  });

  test('a filter that empties the list takes the Export button with it', async ({ page, world }) => {
    world.set('expenses', expenses({
      categories: [
        { key: 'tax', label: 'Tax', count: 1, active: false },
        { key: 'legal', label: 'Legal', count: 0, active: false },
      ],
    }));
    await open(page, `/app/records/${ID.parcel}/expenses`);
    await expect(page.getByRole('button', { name: 'Export' })).toBeVisible();

    await page.getByRole('button', { name: /^Legal/ }).click();
    // Export follows the visible list (RecordExpenses.tsx:411), so on an empty
    // filter it would hand over a file with a header row and nothing under it.
    await expect(page.getByRole('button', { name: 'Export' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Add an expense' })).toBeVisible();
  });

  test('a ledger with nothing in it says nothing has been spent, not that a filter is hiding it', async ({ page, world }) => {
    world.set('expenses', expenses({
      rows: [], categories: [], years: ['2026-27'],
      spent: 0, capital: 0, running: 0, owedBack: 0, income: 0, perUnitRunning: 0,
    }));
    await open(page, `/app/records/${ID.parcel}/expenses`);

    await expect(page.getByText('Nothing spent on this record yet')).toBeVisible();
    await expect(page.getByText(/Repairs, bills, labour and kist all land here/)).toBeVisible();
    // A lone option is the server's fallback year, not a choice any row
    // attests to, so the select stays away.
    await expect(page.getByLabel('Financial year')).toHaveCount(0);
    // Nothing to export, and no chips to filter with.
    await expect(page.getByRole('button', { name: 'Export' })).toHaveCount(0);
    await expect(page.getByRole('table')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Add an expense' })).toHaveCount(2);
  });

  test('an empty year still offers the other years, because one of them has the rows', async ({ page, world }) => {
    world.set('expenses', expenses({
      rows: [], categories: [], year: '2024-25',
      spent: 0, capital: 0, running: 0, owedBack: 0, income: 0, perUnitRunning: 0,
    }));
    await open(page, `/app/records/${ID.parcel}/expenses`);

    await expect(page.getByText('Nothing spent on this record yet')).toBeVisible();
    await expect(page.getByLabel('Financial year')).toHaveValue('2024-25');
  });

  test('the empty state can start the first expense off', async ({ page, world }) => {
    world.set('expenses', expenses({
      rows: [], categories: [], years: ['2026-27'],
      spent: 0, capital: 0, running: 0, owedBack: 0, income: 0, perUnitRunning: 0,
    }));
    await open(page, `/app/records/${ID.parcel}/expenses`);

    await page.getByRole('button', { name: 'Add an expense' }).last().click();
    await expect(page.getByRole('dialog', { name: 'Add an expense' })).toBeVisible();
  });

  // ── the let flat ─────────────────────────────────────────────────────

  test('a let flat puts rent in the same strip as the spending, and states the yield', async ({ page }) => {
    await open(page, `/app/records/${ID.flat}/expenses`);

    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Expenses & rent');
    await expect(page.getByText('1,450 sq.ft · let to a tenant')).toBeVisible();
    const strip = page.locator('.strip');
    await expect(strip).toContainText('Rent received');
    await expect(strip).toContainText('₹2.16 L');
    await expect(strip).toContainText('Net yield on value');
    await expect(strip).toContainText('2.30%');
    await expect(page.getByText(/One ledger, two vocabularies/)).toBeVisible();
    await expect(page.getByText('Rows hang off the flat, its parking slot, or the society account')).toBeVisible();
  });

  test('a built record with no rent on file is not called let', async ({ page, world }) => {
    // `isBuilt` is the unit of measure and nothing else, so it cannot be read
    // as "is let" — rent actually recorded is the only tenancy this client can
    // attest to.
    world.set('expenses', expenses({ isBuilt: true, income: 0, netYield: 0 }));
    await open(page, `/app/records/${ID.flat}/expenses`);

    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Expenses');
    await expect(page.getByText('let to a tenant')).toHaveCount(0);
    await expect(page.locator('.strip')).toContainText('Spent this year');
    await expect(page.getByText('Rent received')).toHaveCount(0);
    // Recording rent is an action, not a claim about the property, so it is
    // still offered.
    await expect(page.getByRole('button', { name: 'Record rent' })).toBeVisible();
  });

  /** DEFECT — RecordExpenses.tsx:423. The strip has two shapes and only the
   *  NOT-let one carries "Owed back by tenant" (line 437). The server computes
   *  `owed_back` for every record — `sum(amount for r in rows if recoverable)`,
   *  web360.py:3278 — and the drawer offers "Recover this from the tenant" on
   *  every expense of every record, so a repair the tenant must reimburse can
   *  be filed against a let flat and then appears in no total anywhere: the row
   *  is only `tr.flagged`, its note is dropped (the defect below), and the sum
   *  goes with the branch. It disappears on exactly the records that have a
   *  tenant to owe it. The owner is owed the cell in both shapes of the strip,
   *  under the same `owedBack > 0` guard the parcel's already has. */
  test.fail('a let flat still says what the tenant owes back', async ({ page, world }) => {
    world.set('expenses', expenses({ isBuilt: true, income: 216_000, netYield: 2.3, owedBack: 34_000 }));
    await open(page, `/app/records/${ID.flat}/expenses`);

    // It is the let strip — rent is in it…
    await expect(page.locator('.strip')).toContainText('Rent received');
    // …and ₹34,000 of it is owed back by the tenant who pays that rent.
    await expect(page.locator('.strip')).toContainText('Owed back by tenant');
  });

  test('a parcel is never asked about rent, because a parcel has no rent form', async ({ page }) => {
    await open(page, `/app/records/${ID.parcel}/expenses`);
    await expect(page.getByRole('button', { name: 'Add an expense' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Record rent' })).toHaveCount(0);
  });

  test('an income row is shown as money in, not as another thing spent', async ({ page, world }) => {
    world.set('expenses', expenses({
      isBuilt: true, income: 216_000, netYield: 2.3,
      rows: [
        { id: 'w-exp-rent-6', title: 'Rent · June', subtitle: 'Sai Kumar', onLabel: 'Flat 4B, Sai Residency', onIcon: 'flat', kind: 'income', paidBy: 'Bank transfer', amount: 18_000, spentOn: '2026-06-05', category: 'Rent', recoverable: false, recoverableNote: '', hasReceipt: true },
        ...ROWS,
      ],
      categories: [{ key: 'Rent', label: 'Rent', count: 1, active: false }, { key: 'tax', label: 'Tax', count: 1, active: false }],
    }));
    await open(page, `/app/records/${ID.flat}/expenses`);

    const rent = page.getByRole('row', { name: /Rent · June/ });
    await expect(rent).toContainText('Income');
    await expect(rent).toContainText('₹18,000');
    await expect(rent).toContainText('Bank transfer');
    // `tr.income` is what colours money in; there is no role for "this row is
    // the other direction".
    await expect(page.locator('tr.income')).toHaveCount(1);
  });

  // ── the drawer ───────────────────────────────────────────────────────

  test('the drawer files an expense with exactly what I typed into it', async ({ page, world }) => {
    await open(page, `/app/records/${ID.parcel}/expenses`);
    await page.getByRole('button', { name: 'Add an expense' }).click();

    const drawer = page.getByRole('dialog', { name: 'Add an expense' });
    await expect(drawer).toHaveAttribute('aria-modal', 'true');
    await expect(drawer).toContainText('Photograph the receipt first');
    await expect(drawer).toContainText('Amount, date and vendor are read off it');

    await drawer.getByLabel('Amount').fill('18400');
    await drawer.getByLabel('What it was').fill('Bore flushing and new starter panel');
    await drawer.getByLabel('Date').fill('2026-02-20');
    await drawer.getByLabel('Paid by').selectOption('You · UPI');
    await drawer.getByRole('button', { name: 'New work', exact: true }).click();
    await drawer.getByLabel('On what').selectOption({ label: 'Barbed fence' });
    await drawer.getByRole('button', { name: /^No — running/ }).click();
    await drawer.getByRole('button', { name: 'Recover from the tenant' }).click();
    await drawer.getByRole('button', { name: 'Save expense' }).click();

    await expect.poll(() => world.calls('saveExpense').length).toBe(1);
    expect(world.lastVars('saveExpense')).toEqual({
      recordId: ID.parcel,
      title: 'Bore flushing and new starter panel',
      amount: 18400,
      spentOn: '20/02/2026',
      kind: 'running',
      category: 'New work',
      paidBy: 'You · UPI',
      onLabel: 'Barbed fence',
      featureId: FEATURE.fence,
      recoverable: true,
      // February is the last financial year, not this one.
      fiscalYear: '2025-26',
    });
  });

  test('saving says so out loud, closes the drawer and asks the ledger again', async ({ page, world }) => {
    await open(page, `/app/records/${ID.parcel}/expenses`);
    const asked = world.calls('expenses').length;

    await page.getByRole('button', { name: 'Add an expense' }).click();
    await page.getByLabel('Amount').fill('2500');
    await page.getByRole('button', { name: 'Save expense' }).click();

    // The row does not always appear where the drawer closed — a chip or the
    // year may be keeping it out of sight — so the app says it saved.
    await expect(saying(page, 'Expense saved.')).toBeVisible();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect.poll(() => world.calls('expenses').length).toBeGreaterThan(asked);
  });

  test('an expense with no title of its own is filed under its category', async ({ page, world }) => {
    await open(page, `/app/records/${ID.parcel}/expenses`);
    await page.getByRole('button', { name: 'Add an expense' }).click();
    await page.getByLabel('Amount').fill('900');
    await page.getByLabel('Date').fill('2026-05-04');
    await page.getByRole('button', { name: 'Save expense' }).click();

    await expect.poll(() => world.calls('saveExpense').length).toBe(1);
    // The WHOLE row, not a subset: every default in this object is a claim the
    // owner never typed, and `toMatchObject` is how one of them changes
    // unnoticed. `kind: 'capital'` is the drawer's pre-pressed answer
    // (RecordExpenses.tsx:148) — a design decision rather than a lie, but one
    // that lifts the cost base on the Money tab, so it is pinned here.
    expect(world.lastVars('saveExpense')).toEqual({
      recordId: ID.parcel,
      title: 'Repair',                  // the category, not an empty string
      amount: 900,
      spentOn: '04/05/2026',
      kind: 'capital',
      category: 'Repair',
      paidBy: 'Caretaker',
      onLabel: 'The whole parcel',      // not whichever feature sorts first
      featureId: '',
      recoverable: false,
      fiscalYear: '2026-27',
    });
  });

  test('the amount box takes digits only, and proves the figure under itself', async ({ page }) => {
    await open(page, `/app/records/${ID.parcel}/expenses`);
    await page.getByRole('button', { name: 'Add an expense' }).click();

    const amount = page.getByLabel('Amount');
    await expect(page.getByText('In rupees')).toBeVisible();
    await amount.fill('₹18,400x');
    // Rebuilding "₹18,400" inside the box throws the caret and stalls
    // backspace; the grouped form belongs under it.
    await expect(amount).toHaveValue('18400');
    await expect(page.getByText('₹18,400')).toBeVisible();
  });

  test('the drawer will not save a row with no amount on it', async ({ page, world }) => {
    await open(page, `/app/records/${ID.parcel}/expenses`);
    await page.getByRole('button', { name: 'Add an expense' }).click();

    const save = page.getByRole('button', { name: 'Save expense' });
    await expect(save).toBeDisabled();
    await expect(page.getByText('Enter the amount and date to save this row.')).toBeVisible();

    await page.getByLabel('Amount').fill('1200');
    await expect(save).toBeEnabled();
    await expect(page.getByText('Enter the amount and date to save this row.')).toHaveCount(0);
    expect(world.calls('saveExpense')).toHaveLength(0);
  });

  test('a row with no date on it cannot be saved either', async ({ page }) => {
    await open(page, `/app/records/${ID.parcel}/expenses`);
    await page.getByRole('button', { name: 'Add an expense' }).click();

    // `enough` is the amount AND the date (RecordExpenses.tsx:154). A row with
    // no date lands in whichever financial year `fiscalYearOf` makes of an
    // empty string, which is not a year.
    await page.getByLabel('Amount').fill('1200');
    await expect(page.getByRole('button', { name: 'Save expense' })).toBeEnabled();
    await page.getByLabel('Date').fill('');
    await expect(page.getByRole('button', { name: 'Save expense' })).toBeDisabled();
    await expect(page.getByText('Enter the amount and date to save this row.')).toBeVisible();
  });

  test('while the row is being filed the button says so and refuses a second press', async ({ page, world }) => {
    world.set('saveExpense', World.slow(2500, 'w-exp-new'));
    await open(page, `/app/records/${ID.parcel}/expenses`);
    await page.getByRole('button', { name: 'Add an expense' }).click();
    await page.getByLabel('Amount').fill('3300');
    await page.getByRole('button', { name: 'Save expense' }).click();

    const saving = page.getByRole('button', { name: 'Saving…' });
    await expect(saving).toBeVisible();
    await expect(saving).toBeDisabled();
    await expect(saying(page, 'Expense saved.')).toBeVisible();
    // A ledger is the one place a double press is unrecoverable — there is no
    // way to delete a row (see the defect below), so the row would stand.
    expect(world.calls('saveExpense')).toHaveLength(1);
  });

  test('with no network the drawer says it is waiting rather than pretending to save', async ({ page, world }) => {
    await open(page, `/app/records/${ID.parcel}/expenses`);
    await page.getByRole('button', { name: 'Add an expense' }).click();
    await page.getByLabel('Amount').fill('5600');

    // react-query PAUSES a write with no network rather than failing it, which
    // is why the button has a third label (RecordExpenses.tsx:317). Without it
    // the button sits on "Saving…" for as long as the line is down — the one
    // state in which a person presses Save a second time.
    await page.context().setOffline(true);
    await page.getByRole('button', { name: 'Save expense' }).click();
    await expect(page.getByRole('button', { name: 'Waiting for the network…' })).toBeVisible();
    expect(world.calls('saveExpense')).toHaveLength(0);

    // And it goes when the line comes back, without being pressed again.
    await page.context().setOffline(false);
    await expect(saying(page, 'Expense saved.')).toBeVisible();
    expect(world.calls('saveExpense')).toHaveLength(1);
  });

  test('the drawer opens with no figure in it, so nobody files a number they never typed', async ({ page }) => {
    await open(page, `/app/records/${ID.parcel}/expenses`);
    await page.getByRole('button', { name: 'Add an expense' }).click();
    await expect(page.getByLabel('Amount')).toHaveValue('');
    await expect(page.getByLabel('What it was')).toHaveValue('');
  });

  test('a refused save keeps the drawer open and says nothing has changed', async ({ page, world }) => {
    world.set('saveExpense', World.gqlError('the ledger is read-only for this account'));
    await open(page, `/app/records/${ID.parcel}/expenses`);

    await page.getByRole('button', { name: 'Add an expense' }).click();
    await page.getByLabel('Amount').fill('4500');
    await page.getByRole('button', { name: 'Save expense' }).click();

    const alert = page.getByRole('alert');
    await expect(alert).toContainText('That expense could not be saved. Nothing has changed.');
    await expect(alert).toContainText('the ledger is read-only for this account');
    // The typing is still there to try again with.
    await expect(page.getByRole('dialog', { name: 'Add an expense' })).toBeVisible();
    await expect(page.getByLabel('Amount')).toHaveValue('4500');
  });

  test('Escape closes the drawer and gives the button that opened it its focus back', async ({ page }) => {
    await open(page, `/app/records/${ID.parcel}/expenses`);
    const opener = page.getByRole('button', { name: 'Add an expense' });
    await opener.click();

    // The opening focus is the panel's scrolling BODY, not the panel element and
    // not the amount box: this drawer leads with "photograph the receipt first",
    // and landing on a field would skip both that and the heading. `.drawerbody`
    // is a `tabIndex={-1}` div with no role of its own (Drawer.tsx), which is why
    // this is a class locator.
    await expect(page.getByRole('dialog', { name: 'Add an expense' }).locator('.drawerbody'))
      .toBeFocused();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(opener).toBeFocused();
  });

  test('Cancel closes the drawer without filing anything', async ({ page, world }) => {
    await open(page, `/app/records/${ID.parcel}/expenses`);
    await page.getByRole('button', { name: 'Add an expense' }).click();
    await page.getByLabel('Amount').fill('7000');
    await page.getByRole('button', { name: 'Cancel' }).click();

    await expect(page.getByRole('dialog')).toHaveCount(0);
    expect(world.calls('saveExpense')).toHaveLength(0);
  });

  test('Tab stays inside the drawer instead of walking the ledger behind it', async ({ page }) => {
    await open(page, `/app/records/${ID.parcel}/expenses`);
    await page.getByRole('button', { name: 'Add an expense' }).click();

    const drawer = page.getByRole('dialog', { name: 'Add an expense' });
    // Forwards out of the body lands on the first field in it. Focus starts on
    // `.drawerbody`, which sits AFTER the header in the document, so the natural
    // next stop is inside the form rather than back up on Close — the trap only
    // intervenes at the two ends of the ring (Dialog.useFocusTrap).
    await page.keyboard.press('Tab');
    await expect(drawer.getByLabel('Amount')).toBeFocused();
    // From the last control it comes back round to the first, rather than
    // landing on the year select behind the scrim. The last control is Cancel:
    // the shared footer puts the primary FIRST so that the action the panel was
    // opened for is the one under the thumb (Drawer.tsx), and Cancel stands
    // beside it — so the primary being enabled does not change where the ring
    // ends.
    await drawer.getByLabel('Amount').fill('1200');
    await expect(drawer.getByRole('button', { name: 'Save expense' })).toBeEnabled();
    await drawer.getByRole('button', { name: 'Cancel' }).focus();
    await page.keyboard.press('Tab');
    await expect(drawer.getByRole('button', { name: 'Close' })).toBeFocused();
  });

  test('Shift+Tab from the first control wraps to the last, not out to the page behind', async ({ page }) => {
    await open(page, `/app/records/${ID.parcel}/expenses`);
    await page.getByRole('button', { name: 'Add an expense' }).click();

    const drawer = page.getByRole('dialog', { name: 'Add an expense' });
    await drawer.getByRole('button', { name: 'Close' }).focus();
    await page.keyboard.press('Shift+Tab');
    // Backwards is its own branch of the trap (RecordExpenses.tsx:99), and the
    // last control is Cancel while Save is disabled and out of the ring.
    await expect(drawer.getByRole('button', { name: 'Cancel' })).toBeFocused();
  });

  test('Tab from outside the drawer lands inside it rather than on the ledger behind', async ({ page }) => {
    await open(page, `/app/records/${ID.parcel}/expenses`);
    await page.getByRole('button', { name: 'Add an expense' }).click();
    const drawer = page.getByRole('dialog', { name: 'Add an expense' });

    // Focus can leave the panel without the drawer closing — a click on the
    // scrim's dead space, a browser chrome round trip — and the trap has a
    // branch for finding its way back (RecordExpenses.tsx:98).
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await page.keyboard.press('Tab');
    await expect(drawer.getByRole('button', { name: 'Close' })).toBeFocused();
  });

  test('a row hangs off the whole parcel unless a feature is picked for it', async ({ page }) => {
    await open(page, `/app/records/${ID.parcel}/expenses`);
    await page.getByRole('button', { name: 'Add an expense' }).click();

    const on = page.getByLabel('On what');
    await expect(on).toHaveValue('');
    await expect(on.locator('option')).toHaveText(['The whole parcel', 'Open well', 'Barbed fence']);
    await expect(page.getByText('Or the whole parcel, a person, or a bill account.')).toBeVisible();
  });

  test('on a flat the whole thing is the flat itself, not a parcel', async ({ page }) => {
    await open(page, `/app/records/${ID.flat}/expenses`);
    await page.getByRole('button', { name: 'Add an expense' }).click();

    await expect(page.getByLabel('On what').locator('option').first()).toHaveText('Flat 4B, Sai Residency');
    await expect(page.getByText('Or the property itself, a person, or the society account.')).toBeVisible();
  });

  test('rent is the same row with the other sign, and a different form', async ({ page }) => {
    await open(page, `/app/records/${ID.flat}/expenses`);
    await page.getByRole('button', { name: 'Record rent' }).click();

    const drawer = page.getByRole('dialog', { name: 'Record rent' });
    await expect(drawer).toContainText('Amount, date and who paid are read off it');
    // Who it came from, not who it was paid by: the list is a different list
    // (RecordExpenses.tsx:45), and "Caretaker · paid" against rent received is
    // the ledger telling the owner they paid their own tenant.
    await expect(drawer.getByLabel('Received from').locator('option'))
      .toHaveText(['Bank transfer', 'Tenant · UPI', 'Cash', 'Cheque', 'Letting agent']);
    await expect(drawer.getByRole('button', { name: 'Rent', exact: true })).toBeVisible();
    await expect(drawer.getByRole('button', { name: 'Deposit' })).toBeVisible();
    await expect(drawer.getByRole('button', { name: 'Advance' })).toBeVisible();
    // Money in is neither capital nor running, and it is not recoverable from
    // the tenant — it came from the tenant.
    await expect(drawer.getByText('Does it add to what the land cost you?')).toHaveCount(0);
    await expect(drawer.getByText('Recover this from the tenant')).toHaveCount(0);
    await expect(drawer.getByRole('button', { name: 'Save rent' })).toBeVisible();
  });

  test('rent files as income against the flat', async ({ page, world }) => {
    await open(page, `/app/records/${ID.flat}/expenses`);
    await page.getByRole('button', { name: 'Record rent' }).click();

    const drawer = page.getByRole('dialog', { name: 'Record rent' });
    await drawer.getByLabel('Amount').fill('18000');
    await drawer.getByLabel('What it was').fill('Rent for August');
    await drawer.getByLabel('Date').fill('2026-08-05');
    await drawer.getByLabel('Received from').selectOption('Tenant · UPI');
    await drawer.getByRole('button', { name: 'Save rent' }).click();

    await expect.poll(() => world.calls('saveExpense').length).toBe(1);
    expect(world.lastVars('saveExpense')).toEqual({
      recordId: ID.flat,
      title: 'Rent for August',
      amount: 18000,
      spentOn: '05/08/2026',
      kind: 'income',
      category: 'Rent',
      paidBy: 'Tenant · UPI',
      onLabel: 'Flat 4B, Sai Residency',
      featureId: '',
      recoverable: false,
      fiscalYear: '2026-27',
    });
    await expect(saying(page, 'Rent recorded.')).toBeVisible();
  });

  test('a refused rent says so in the words the rent form uses', async ({ page, world }) => {
    world.set('saveExpense', World.gqlError('the ledger is read-only for this account'));
    await open(page, `/app/records/${ID.flat}/expenses`);
    await page.getByRole('button', { name: 'Record rent' }).click();
    await page.getByLabel('Amount').fill('18000');
    await page.getByRole('button', { name: 'Save rent' }).click();

    await expect(page.getByRole('alert')).toContainText('That rent could not be saved. Nothing has changed.');
    await expect(page.getByRole('dialog', { name: 'Record rent' })).toBeVisible();
  });

  test('the drawer promises nothing it cannot file — no repeat, no schedule', async ({ page }) => {
    await open(page, `/app/records/${ID.parcel}/expenses`);
    await page.getByRole('button', { name: 'Add an expense' }).click();
    // `land_expenses` has no recurrence and the mutation has no such field, so
    // a person who turned it on for a salary was promised twelve rows and got
    // one.
    await expect(page.getByText(/Repeats every month/i)).toHaveCount(0);
  });

  // ── the export ───────────────────────────────────────────────────────

  test('the ledger exports as a CSV named for the record and the year', async ({ page }) => {
    await open(page, `/app/records/${ID.parcel}/expenses`);
    const [file] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Export' }).click(),
    ]);
    expect(file.suggestedFilename()).toBe(`expenses-${ID.parcel}-2026-27.csv`);

    const csv = await readDownload(file);
    expect(csv.startsWith('﻿')).toBe(true);
    const lines = csv.replace('﻿', '').trim().split('\n');
    expect(lines[0]).toBe('Date,What it was,Detail,On,Kind,Paid by,Amount (₹),Recoverable,Receipt');
    expect(lines).toHaveLength(4);
    expect(lines[1]).toBe('12/04/2026,Land tax 2025-26,Paid at the mandal office,Whole record,running,Shankar Reddy,3400,no,filed');
    expect(lines[2]).toBe('01/09/2026,"Watchman, April to September",Ramana Rao,Whole record,running,Shankar Reddy,43200,no,none');
    expect(lines[3]).toBe('20/02/2026,"Barbed fence, eastern edge","420 m, 4 strand",Barbed fence,capital,Venkat Reddy,68000,yes,filed');
  });

  test('a row titled like a formula is exported as text rather than run as one', async ({ page, world }) => {
    world.set('expenses', expenses({ rows: [{ ...ROWS[0], title: '=cmd|/c calc' }] }));
    await open(page, `/app/records/${ID.parcel}/expenses`);
    const [file] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Export' }).click(),
    ]);
    const lines = (await readDownload(file)).replace('\ufeff', '').trim().split('\n');

    // A ledger row's title is typed by a person. This export is a second copy
    // of the escaping (RecordExpenses.tsx:353 says so itself), so the guard is
    // asserted on both copies rather than on whichever one was read.
    expect(lines[1]).toContain("'=cmd|/c calc");
    expect(lines[1]).not.toContain(',=cmd');
  });

  test('the export follows the list I am looking at, not the whole year', async ({ page }) => {
    await open(page, `/app/records/${ID.parcel}/expenses`);
    await page.getByRole('button', { name: /^Tax/ }).click();
    await expect(page.getByRole('row')).toHaveCount(2);

    const [file] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Export' }).click(),
    ]);
    const lines = (await readDownload(file)).replace('﻿', '').trim().split('\n');
    expect(lines).toHaveLength(2);
    expect(lines[1]).toContain('Land tax 2025-26');
  });

  test('a let flat can be exported too, rent rows and all', async ({ page }) => {
    await open(page, `/app/records/${ID.flat}/expenses`);
    // Export used to be gated behind !isBuilt, so the one ledger with rent in
    // it was the one that could not be exported.
    await expect(page.getByRole('button', { name: 'Export' })).toBeVisible();
    const [file] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Export' }).click(),
    ]);
    expect(file.suggestedFilename()).toBe(`expenses-${ID.flat}-2026-27.csv`);
  });

  // ── loading, failure, and the door back ──────────────────────────────

  test('a ledger that has not arrived holds its shape and says it is loading', async ({ page, world }) => {
    world.set('expenses', World.never());
    await open(page, `/app/records/${ID.parcel}/expenses`);

    await expect(saying(page, 'Loading')).toBeVisible();
    await expect(saying(page, 'Loading')).toHaveAttribute('aria-busy', 'true');
    await expect(page.getByText('Nothing spent on this record yet')).toHaveCount(0);
  });

  test('a ledger that will not load says so and keeps the reason', async ({ page, world }) => {
    world.set('expenses', World.gqlError('the ledger service is down'));
    await open(page, `/app/records/${ID.parcel}/expenses`);

    const failed = page.getByRole('alert');
    await expect(failed).toContainText('What this record has cost did not load');
    await expect(failed).toContainText('the ledger service is down');
    await expect(failed).toContainText('Your records are untouched.');
  });

  test('the ledger comes back when the server does', async ({ page, world }) => {
    world.set('expenses', World.gqlError('the ledger service is down'));
    await open(page, `/app/records/${ID.parcel}/expenses`);
    await expect(page.getByRole('alert')).toBeVisible();

    world.set('expenses', expenses());
    await page.getByRole('button', { name: 'Try again' }).click();
    await expect(page.getByRole('row', { name: /Land tax 2025-26/ })).toBeVisible();
    await expect(page.getByRole('alert')).toHaveCount(0);
  });

  test('a record that is not mine never gets as far as asking what it has cost', async ({ page, world }) => {
    await open(page, `/app/records/${ID.missing}/expenses`);
    await expect(page.getByRole('heading', { name: 'That record is not in your portfolio' })).toBeVisible();
    expect(world.asked('expenses')).toBe(false);
  });

  test('the ledger keeps the way back to the record it belongs to', async ({ page }) => {
    await open(page, `/app/records/${ID.parcel}/expenses`);
    await page.getByRole('link', { name: 'Sy 214/2' }).click();
    await expect(page).toHaveURL(new RegExp(`/app/records/${ID.parcel}$`));
  });

  test('the drawer dates a new row today, as the calendar on the wall has it', async ({ page }) => {
    // 00:30 IST is still yesterday in UTC, which is what
    // `toISOString().slice(0,10)` would have filed it as — and on 1 April that
    // is the wrong financial year.
    await page.clock.setFixedTime(new Date('2026-04-01T00:30:00+05:30'));
    await open(page, `/app/records/${ID.parcel}/expenses`);
    await page.getByRole('button', { name: 'Add an expense' }).click();
    await expect(page.getByLabel('Date')).toHaveValue('2026-04-01');
  });

  /** DEFECT — `recoverableNote` is fetched by Q_EXPENSES (api.ts:369) and
   *  drawn nowhere. RecordExpenses.tsx:494 puts the row's `subtitle` in the
   *  accent colour when a row is recoverable and drops the note that says what
   *  is owed and to whom, so "Owed back by tenant ₹34,000" in the strip is a
   *  figure with no working. The owner is owed the note on the row — it is
   *  already on the wire. */
  test.fail('a row I can claim back says what is owed and to whom', async ({ page }) => {
    await open(page, `/app/records/${ID.parcel}/expenses`);
    const fence = page.getByRole('row', { name: /Barbed fence, eastern edge/ });
    await expect(fence).toContainText('Half owed back by Venkat');
  });

  /** DEFECT — there is no way to take a row out of the ledger. `deleteExpense`
   *  is a resolver in web360.py, a mutation in api.ts:791 (`useDeleteExpense`)
   *  and is called from nowhere in apps/web. A ₹18,40,000 typed for ₹18,400
   *  therefore sits in the year totals and in the Money tab's cost base for
   *  ever. The owner is owed a row menu with Delete on it, the same shape as
   *  the one RecordFeatures already has. */
  test.fail('a mistyped row can be taken out of the ledger again', async ({ page, world }) => {
    await open(page, `/app/records/${ID.parcel}/expenses`);
    const row = page.getByRole('row', { name: /Watchman, April to September/ });
    await expect(row).toBeVisible();

    await row.getByRole('button', { name: /delete|remove/i }).click();
    await expect.poll(() => world.calls('deleteExpense').length).toBe(1);
    expect(world.lastVars('deleteExpense')).toMatchObject({ expenseId: EXPENSE.wages });
  });

  /** DEFECT — RecordExpenses.tsx:334 and RecordMoney.tsx:83 both call
   *  `<Loading h="70vh" />` with no `what`. ui.tsx's Loading documents the
   *  contract in its own docstring — "`what` names the thing being fetched and
   *  should match the noun the same screen gives `Failed what=`, so the
   *  waiting word and the failure word agree" — and these two screens are the
   *  ones that ignore it, so a 70vh slab announces only "Loading…" while the
   *  failure beside it says "What this record has cost did not load". */
  test.fail('the wait names the thing it is waiting for, the way the failure does', async ({ page, world }) => {
    world.set('expenses', World.never());
    await open(page, `/app/records/${ID.parcel}/expenses`);
    await expect(saying(page, 'Loading')).toHaveText(/Loading .+…/);
  });

  /** DEFECT — RecordExpenses.tsx:396 binds the year select to `data.year`, the
   *  server's echo, while the year the reader chose lives in `year` state
   *  (line 329). `useExpenses` holds the previous answer while the new key
   *  loads (api.ts:504, `placeholderData: keepPreviousData`), so React restores
   *  the select to the year just left and leaves it there for the whole read:
   *  the control visibly undoes itself, the old year's rows sit under it with
   *  nothing marked busy, and pressing it again asks for the year already on
   *  screen. The owner is owed the select showing what they chose
   *  (`value={year ?? data.year}`) and the ledger card carrying `aria-busy`
   *  until the new year lands — which is `Card`'s documented `busy` prop
   *  (ui.tsx:425) and exactly what RecordMoney.tsx:379 does for its own rate. */
  test.fail('the year I chose stays chosen while that year is loading', async ({ page, world }) => {
    await open(page, `/app/records/${ID.parcel}/expenses`);
    await expect(page.getByLabel('Financial year')).toHaveValue('2026-27');

    world.set('expenses', World.never());
    await page.getByLabel('Financial year').selectOption('2025-26');

    // Keeping last year's rows up is honest enough on its own…
    await expect(page.getByRole('row', { name: /Land tax 2025-26/ })).toBeVisible();
    // …but the control must not answer a press by undoing it.
    await expect(page.getByLabel('Financial year')).toHaveValue('2025-26');
  });

  test('@phone the drawer fits the phone instead of shouldering the ledger sideways', async ({ page }) => {
    await open(page, `/app/records/${ID.parcel}/expenses`);
    await page.getByRole('button', { name: 'Add an expense' }).click();

    const drawer = page.getByRole('dialog', { name: 'Add an expense' });
    await expect(drawer).toBeVisible();
    const box = (await drawer.boundingBox())!;
    const width = page.viewportSize()!.width;
    // `width: min(26rem, 100vw)` (w360.css:1277) — 26rem is wider than a phone,
    // so on one it has to be the viewport and start at its left edge.
    expect(box.width).toBeLessThanOrEqual(width);
    expect(box.x).toBeGreaterThanOrEqual(-1);
    const spill = await page.evaluate(() =>
      document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(spill).toBeLessThanOrEqual(1);
  });

  test('@phone the ledger scrolls inside its card rather than taking the page sideways', async ({ page }) => {
    await open(page, `/app/records/${ID.parcel}/expenses`);
    await expect(page.getByRole('row', { name: /Land tax 2025-26/ })).toBeVisible();

    await expect(page.locator('.scroll-x', { has: page.getByRole('table') })).toBeVisible();
    const spill = await page.evaluate(() =>
      document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(spill).toBeLessThanOrEqual(1);
  });
});

/** The bytes of a download, as text. */
async function readDownload(file: import('@playwright/test').Download): Promise<string> {
  const stream = await file.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString('utf8');
}
