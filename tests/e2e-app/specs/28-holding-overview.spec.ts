/**
 * Holding · Overview · /holdings/:id — the holding's four figures and
 * the records they come from.
 *
 * Written with the heuristic audit of this tab (01/10/2026,
 * .local/ux-audits/2026-10-01-combined-overview). The strip and the record cards
 * met at 0px, and each card's two buttons sat 6px apart with nothing between
 * them and the status line above. These tests hold the spacing, not the words.
 *
 * So the second test finds the status line and the buttons by their place in
 * the card, not by their labels: the audit's open items 5 and 7 (Reddy's to
 * decide) would reword them. Item 4 would drop "Open record" and leave no pair
 * to measure; whoever takes that decision rewrites the second test with it.
 *
 * The holding is the Combined map spec's: Sy 214/2 (the seeded parcel), an
 * invented neighbour Sy 214/3, and Sy 88 with no boundary. Neither neighbour is
 * opened, so it needs no record of its own.
 */
import type { Locator } from '@playwright/test';
import { test, expect } from '../fixtures/harness';
import { ID } from '../fixtures/ids';

const CP = 'cp-katragunta';
const TAB = `/holdings/${CP}`;

const member = (over: Record<string, unknown>) => ({
  id: `cpm-${String(over.recordId)}`, recordKind: 'parcel', placeLine: 'Katragunta, Markapur, Prakasam',
  khataNo: '1042', ownerName: '', status: 'owned', extent: 2.4, extentUnit: 'ac', extentDetail: '',
  marketValue: 0, paperCount: 1, ground: 'surveyed', sheetTitle: 'Joint FMB sketch', sheetId: '',
  archived: false, sort: 0,
  // WHO holds it: '' / "In your own name" unless a test says otherwise.
  groupId: '', holderLabel: 'In your own name', ...over,
});

const COMBINED = {
  id: CP, name: 'Katragunta Land', note: '', memberCount: 3, parcelCount: 3, propertyCount: 0,
  farmExtent: 6, plotExtent: 0, builtExtent: 0, extentLine: '6.00 ac', marketValue: 0, invested: 0,
  paperCount: 3, surveyedCount: 2, combinedSpend: 0, memberSpend: 0,
  placeLine: 'Katragunta & Konakalamitla, Prakasam', isComplete: true,
  createdAt: '2026-09-20', updatedAt: '2026-09-20',
  heldBy: [{ groupId: '', name: 'In your own name', count: 3 }],
  members: [
    member({ recordId: ID.parcel, title: 'Sy 214/2', sort: 0 }),
    member({ recordId: 'w-sy-214-3', title: 'Sy 214/3', sort: 1 }),
    member({
      recordId: ID.plot, title: 'Sy 88', placeLine: 'Konakalamitla, Markapur, Prakasam',
      khataNo: '318', extent: 1.2, ground: 'none', sheetTitle: '', sort: 2,
    }),
  ],
};

test.beforeEach(({ world }) => {
  world.set('combinedProperty', COMBINED);
});

const box = async (loc: Locator) => {
  const b = await loc.boundingBox();
  expect(b, 'the element is drawn').not.toBeNull();
  return b!;
};

test.describe('Holding overview', () => {
  test('the four figures stand apart from the records they come from @phone', async ({ page }) => {
    await page.goto(TAB);
    const cards = page.getByRole('article');
    await expect(cards).toHaveCount(3);

    // The strip has no role of its own: it is four cells in a box, two of them
    // links, and its class is the only handle on the whole of it.
    const strip = await box(page.locator('.strip'));
    const [first, second] = [await box(cards.nth(0)), await box(cards.nth(1))];
    const underStrip = first.y - (strip.y + strip.height);
    // Side by side on a laptop, one under the other on a phone.
    const betweenCards = second.y >= first.y + first.height - 1
      ? second.y - (first.y + first.height)
      : second.x - (first.x + first.width);

    expect(underStrip, 'the strip touches the record cards').toBeGreaterThanOrEqual(16);
    expect(underStrip, 'the gap between two groups is no wider than the gap inside one')
      .toBeGreaterThan(betweenCards);
  });

  test("a record card's two buttons stand apart from each other and from the line above them @phone", async ({ page }) => {
    await page.goto(TAB);
    // By place, not by label (see the header): the status line is the card's
    // last paragraph, and the pair is the two links after the title's.
    const card = page.getByRole('article').filter({ hasText: 'Sy 214/2' });
    const links = card.getByRole('link');
    await expect(links, 'the title and a pair of buttons').toHaveCount(3);
    const status = await box(card.getByRole('paragraph').last());
    const open = await box(links.nth(1));
    const map = await box(links.nth(2));

    expect(open.y - (status.y + status.height), 'the buttons sit closer than --space-md under the status line')
      .toBeGreaterThanOrEqual(16);
    expect(Math.abs(map.y - open.y), 'the pair is on one line').toBeLessThanOrEqual(1);
    expect(map.x - (open.x + open.width), 'the two buttons are a raw 6px apart').toBeGreaterThanOrEqual(12);
  });

});

// ── WHO holds a holding's properties (decision memo 06/10/2026, § 4.3) ──
//
// A holding is WHICH piece of ground; the group is WHO holds each property.
// They are separate facts, so one farm can span two holders, and the holding
// page says so read-only: a "Held by" line on Overview and Properties, and a
// holder on every property.

const FAMILY = 'grp-family';
const ESTATE = 'grp-estate';
const family = { groupId: FAMILY, holderLabel: 'Telukutla Family' };
const estate = { groupId: ESTATE, holderLabel: "Grandfather's estate" };

/** Two holders: the family holds two surveys, the grandfather's estate one. */
const TWO_HOLDERS = {
  ...COMBINED,
  heldBy: [
    { groupId: FAMILY, name: 'Telukutla Family', count: 2 },
    { groupId: ESTATE, name: "Grandfather's estate", count: 1 },
  ],
  members: [
    member({ recordId: ID.parcel, title: 'Sy 214/2', sort: 0, ...family }),
    member({ recordId: 'w-sy-214-3', title: 'Sy 214/3', sort: 1, ...family }),
    member({
      recordId: ID.plot, title: 'Sy 88', placeLine: 'Konakalamitla, Markapur, Prakasam',
      khataNo: '318', extent: 1.2, ground: 'none', sheetTitle: '', sort: 2, ...estate,
    }),
  ],
};

test.describe('Holding · who holds its properties', () => {
  test('the Overview names every holder, with counts, each linking to its group @phone', async ({ page, world }) => {
    world.set('combinedProperty', TWO_HOLDERS);
    await page.goto(TAB);
    const line = page.getByText(/^Held by Telukutla Family ·/);
    await expect(line).toHaveText("Held by Telukutla Family · 2 properties, Grandfather's estate · 1 property");
    await expect(line.getByRole('link', { name: 'Telukutla Family' })).toHaveAttribute('href', `/groups/${FAMILY}`);
    await expect(line.getByRole('link', { name: "Grandfather's estate" })).toHaveAttribute('href', `/groups/${ESTATE}`);

    // And each property says its own holder.
    const sy88 = page.getByRole('article').filter({ hasText: 'Sy 88' });
    await expect(sy88.getByText("Held by Grandfather's estate")).toBeVisible();
    await expect(sy88.getByRole('link', { name: "Grandfather's estate" })).toHaveAttribute('href', `/groups/${ESTATE}`);
  });

  test('land in nobody\u2019s group is said in its own words, never "Held by In your own name"', async ({ page }) => {
    await page.goto(TAB);
    await expect(page.getByRole('article')).toHaveCount(3);
    await expect(page.getByText('In your own name', { exact: true }).first()).toBeVisible();
    await expect(page.getByText(/Held by In your own name/)).toHaveCount(0);
    // One holder: no counts, they would only repeat the property count.
    await expect(page.getByText(/· 3 properties/)).toHaveCount(0);
  });

  test('a group and your own name together: the group is "Held by", the rest is its own sentence', async ({ page, world }) => {
    world.set('combinedProperty', {
      ...TWO_HOLDERS,
      heldBy: [
        { groupId: FAMILY, name: 'Telukutla Family', count: 2 },
        { groupId: '', name: 'In your own name', count: 1 },
      ],
      members: [
        TWO_HOLDERS.members[0], TWO_HOLDERS.members[1],
        { ...TWO_HOLDERS.members[2], groupId: '', holderLabel: 'In your own name' },
      ],
    });
    await page.goto(TAB);
    await expect(page.getByText(/^Held by Telukutla Family ·/))
      .toHaveText('Held by Telukutla Family · 2 properties. 1 property in your own name.');
  });

  test('the Properties tab carries the same line and a Held by column @phone', async ({ page, world }) => {
    world.set('combinedProperty', TWO_HOLDERS);
    await page.goto(`${TAB}/surveys`);
    await expect(page.getByRole('heading', { name: 'Properties', exact: true })).toBeVisible();
    await expect(page.getByText(/^Held by Telukutla Family ·/))
      .toHaveText("Held by Telukutla Family · 2 properties, Grandfather's estate · 1 property");
    await expect(page.getByRole('columnheader', { name: 'Held by' })).toBeVisible();
    const row = page.getByRole('row').filter({ hasText: 'Sy 88' });
    await expect(row.getByRole('link', { name: "Grandfather's estate" })).toHaveAttribute('href', `/groups/${ESTATE}`);
  });

  test('the Properties table totals every property and pages past five @phone', async ({ page, world }) => {
    // Seven members: six of 2.40 ac, one of 60 sq.yd — units summed apart.
    const members = Array.from({ length: 7 }, (_, i) => member({
      recordId: `w-sy-${i + 1}`, title: `Sy ${i + 1}`, sort: i, marketValue: 100000,
      ...(i === 6 ? { extent: 60, extentUnit: 'sq.yd' } : {}),
    }));
    world.set('combinedProperty', { ...COMBINED, memberCount: 7, members });
    await page.goto(`${TAB}/surveys`);
    const table = page.getByRole('table', { name: 'Properties in this holding' });
    await expect(table.locator('tbody tr')).toHaveCount(7);
    const foot = table.locator('tfoot tr');
    await expect(foot.getByRole('rowheader')).toHaveText('Total · 7 properties');
    await expect(foot).toContainText('14.40 ac + 60 sq.yd');
    await expect(foot.locator('td').last()).toHaveText('7');

    const pager = page.getByRole('navigation', { name: 'Properties pages' });
    await pager.getByRole('button', { name: '5', exact: true }).click();
    await expect(table.locator('tbody tr')).toHaveCount(5);
    // The footer still counts all seven, not the page.
    await expect(foot.getByRole('rowheader')).toHaveText('Total · 7 properties');
  });

  test('ticking two properties sums them in the footer and offers Export', async ({ page }) => {
    await page.goto(`${TAB}/surveys`);
    const table = page.getByRole('table', { name: 'Properties in this holding' });
    await table.getByRole('checkbox', { name: 'Select Sy 214/2' }).check();
    await table.getByRole('checkbox', { name: 'Select Sy 88' }).check();
    const foot = table.locator('tfoot tr');
    await expect(foot.getByRole('rowheader')).toHaveText('2 properties selected');
    await expect(foot).toContainText('3.60 ac');
    const bar = page.getByRole('group', { name: 'Act on the selected properties' });
    await expect(bar.getByRole('status')).toHaveText('2 properties selected');
    await expect(bar.getByRole('button', { name: 'Export' })).toBeVisible();
  });

  test('the tabs are Overview, Properties, Documents, Boundaries, Expenses and Services', async ({ page }) => {
    await page.goto(TAB);
    const strip = page.getByRole('navigation', { name: 'This holding' });
    await expect(strip.getByRole('link')).toHaveText([
      /^Overview/, /^Properties/, /^Documents/, /^Boundaries/, /^Expenses/, /^Services/,
    ]);
  });
});

test.describe('Holding expenses', () => {
  const expense = (i: number, over: Record<string, unknown> = {}) => ({
    id: `hx-${i}`, title: `Fencing ${i}`, subtitle: '', kind: 'running', category: 'labour',
    amount: 1000, spentOn: `2026-04-0${i}`, paidBy: '', vendor: '', note: '', recoverable: false,
    hasReceipt: false, fiscalYear: '2026-27', scope: 'combined', recordId: '', recordTitle: '',
    invoiceNo: '', warrantyUntil: '', receiptFileRef: '', receiptFileName: '', receiptMimeType: '',
    receiptSizeBytes: 0, ...over,
  });

  test('the ledger pages and totals spent and money in apart @phone', async ({ page, world }) => {
    const rows = [1, 2, 3, 4, 5, 6].map((i) => expense(i));
    rows.push(expense(7, { title: 'Mango lease', kind: 'income', amount: 2500 }));
    world.set('combinedExpenses', {
      id: CP, name: 'Katragunta Land', year: '2026-27', years: ['2026-27'], spent: 6000,
      capital: 0, running: 6000, income: 2500, owedBack: 0, combinedSpend: 6000, memberSpend: 0,
      farmExtent: 6, perAcreRunning: 1000, categories: [],
      scopes: [{ key: 'all', label: 'All', count: 7, active: true }], rows,
    });
    await page.goto(`${TAB}/expenses`);
    const table = page.getByRole('table', { name: 'Expenses' });
    const foot = table.locator('tfoot tr');
    await expect(foot).toHaveCount(2);
    await expect(foot.nth(0)).toContainText('Total spent · 6 expenses');
    await expect(foot.nth(0)).toContainText('₹6,000');
    await expect(foot.nth(1)).toContainText('Money in · 1 entry');
    await expect(foot.nth(1)).toContainText('₹2,500');
    const pager = page.getByRole('navigation', { name: 'Expense pages' });
    await expect(pager).toContainText('1–7 of 7');
    await pager.getByRole('button', { name: '5', exact: true }).click();
    await expect(table.locator('tbody tr')).toHaveCount(5);
    await expect(foot.nth(0)).toContainText('₹6,000');
  });

  test('ticking rows sums only them and offers Export', async ({ page, world }) => {
    const rows = [1, 2, 3].map((i) => expense(i, { amount: i * 100 }));
    world.set('combinedExpenses', {
      id: CP, name: 'Katragunta Land', year: '2026-27', years: ['2026-27'], spent: 600,
      capital: 0, running: 600, income: 0, owedBack: 0, combinedSpend: 600, memberSpend: 0,
      farmExtent: 6, perAcreRunning: 100, categories: [],
      scopes: [{ key: 'all', label: 'All', count: 3, active: true }], rows,
    });
    await page.goto(`${TAB}/expenses`);
    const table = page.getByRole('table', { name: 'Expenses' });
    await table.getByRole('checkbox', { name: 'Select Fencing 1' }).check();
    await table.getByRole('checkbox', { name: 'Select Fencing 3' }).check();
    const foot = table.locator('tfoot tr').first();
    await expect(foot).toContainText('Spent · 2 expenses selected');
    await expect(foot).toContainText('₹400');
    // One noun: the bar counts what the footer counts.
    const bar = page.getByRole('group', { name: 'Act on the selected expenses' });
    await expect(bar).toContainText('2 expenses selected');
    await expect(bar.getByRole('button', { name: 'Export' })).toBeVisible();
  });

  test('money in among the ticks makes them entries, in the footer and the bar alike', async ({ page, world }) => {
    const rows = [expense(1), expense(2, { title: 'Mango lease', kind: 'income', amount: 2500 })];
    world.set('combinedExpenses', {
      id: CP, name: 'Katragunta Land', year: '2026-27', years: ['2026-27'], spent: 1000,
      capital: 0, running: 1000, income: 2500, owedBack: 0, combinedSpend: 1000, memberSpend: 0,
      farmExtent: 6, perAcreRunning: 100, categories: [],
      scopes: [{ key: 'all', label: 'All', count: 2, active: true }], rows,
    });
    await page.goto(`${TAB}/expenses`);
    const table = page.getByRole('table', { name: 'Expenses' });
    await table.getByRole('checkbox', { name: 'Select Fencing 1' }).check();
    await table.getByRole('checkbox', { name: 'Select Mango lease' }).check();
    await expect(table.locator('tfoot tr').nth(1)).toContainText('Money in · 1 entry selected');
    await expect(page.getByRole('group', { name: 'Act on the selected expenses' }))
      .toContainText('2 entries selected');
  });

  test('year, scope and category sit in one band, 24px under the strip, as labelled filter groups', async ({ page, world }) => {
    const rows = [expense(1, { category: 'Labour' }), expense(2, { category: 'Lease' }),
      expense(3, { scope: 'record', recordId: 'r1', recordTitle: 'Sy 88', category: 'Labour' })];
    world.set('combinedExpenses', {
      id: CP, name: 'Katragunta Land', year: '2026-27', years: ['2026-27', '2025-26'], spent: 3000,
      capital: 0, running: 3000, income: 0, owedBack: 0, combinedSpend: 2000, memberSpend: 1000,
      farmExtent: 6, perAcreRunning: 500,
      categories: [{ key: 'all', label: 'All', count: 3, active: true },
        { key: 'Labour', label: 'Labour', count: 2, active: false },
        { key: 'Lease', label: 'Lease', count: 1, active: false }],
      scopes: [{ key: 'all', label: 'All', count: 3, active: true },
        { key: 'combined', label: 'Shared', count: 2, active: false },
        { key: 'record', label: 'One property', count: 1, active: false }],
      rows,
    });
    await page.goto(`${TAB}/expenses`);
    const band = page.locator('.filterbar.band');
    await expect(band.getByLabel('Financial year')).toHaveValue('2026-27');
    await expect(page.locator('header.sechead').getByLabel('Financial year')).toHaveCount(0);
    await expect(band.getByRole('status')).toHaveText('3 of 3');
    // No filled chip rows any more: nothing in the band takes the amber fill.
    await expect(band.locator('.chip')).toHaveCount(0);
    const strip = (await page.locator('.strip').boundingBox())!;
    const top = (await band.boundingBox())!.y;
    expect(Math.round(top - (strip.y + strip.height))).toBe(24);

    await band.getByRole('button', { name: '+ Filter' }).click();
    const pop = page.getByRole('group', { name: 'Narrow the list' });
    await expect(pop).toContainText('Scope');
    await expect(pop).toContainText('Category');
    await expect(pop.getByRole('button', { name: /^All/ })).toHaveCount(0);
    await pop.getByRole('button', { name: /^Shared/ }).click();
    await pop.getByRole('button', { name: /^Labour/ }).click();
    await expect(band.getByRole('status')).toHaveText('1 of 3');
    await expect(page).toHaveURL(/scope=combined/);
    await expect(page).toHaveURL(/cat=Labour/);
    await band.getByRole('button', { name: 'Clear all' }).click();
    await expect(band.getByRole('status')).toHaveText('3 of 3');
  });
});

test.describe('Holding documents and services', () => {
  const paper = (i: number, shelf: string) => ({
    id: `hp-${i}`, title: `Paper ${i}`, detail: '', shelf, icon: 'title', tags: [], shared: false,
    pageCount: 1, fileRef: '', recordId: 'r1', recordTitle: 'Sy 88',
  });

  test('shelves are a filter group in the band, with its tally', async ({ page, world }) => {
    world.set('combinedPapers', [paper(1, 'title'), paper(2, 'title'), paper(3, 'revenue')]);
    await page.goto(`${TAB}/documents`);
    const band = page.locator('.filterbar.band');
    await expect(band.getByRole('status')).toHaveText('3 of 3');
    await expect(band.locator('.chip')).toHaveCount(0);
    await band.getByRole('button', { name: '+ Filter' }).click();
    const pop = page.getByRole('group', { name: 'Narrow the list' });
    await expect(pop).toContainText('Shelf');
    await pop.getByRole('button', { name: /^Revenue records/ }).click();
    await expect(band.getByRole('status')).toHaveText('1 of 3');
  });

  test('Which service orders sits in the band, not the head', async ({ page }) => {
    await page.goto(`${TAB}/services`);
    await expect(page.locator('.filterbar.band').getByRole('group', { name: 'Which service orders' })).toBeVisible();
    await expect(page.locator('header.sechead').getByRole('group', { name: 'Which service orders' })).toHaveCount(0);
  });
});
