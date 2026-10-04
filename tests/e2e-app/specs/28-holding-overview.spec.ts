/**
 * Holding · Overview · /app/holdings/:id — the holding's four figures and
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
const TAB = `/app/holdings/${CP}`;

const member = (over: Record<string, unknown>) => ({
  id: `cpm-${String(over.recordId)}`, recordKind: 'parcel', placeLine: 'Katragunta, Markapur, Prakasam',
  khataNo: '1042', ownerName: '', status: 'owned', extent: 2.4, extentUnit: 'ac', extentDetail: '',
  marketValue: 0, paperCount: 1, ground: 'surveyed', sheetTitle: 'Joint FMB sketch', sheetId: '',
  archived: false, sort: 0, ...over,
});

const COMBINED = {
  id: CP, name: 'Katragunta Land', note: '', memberCount: 3, parcelCount: 3, propertyCount: 0,
  farmExtent: 6, plotExtent: 0, builtExtent: 0, extentLine: '6.00 ac', marketValue: 0, invested: 0,
  paperCount: 3, surveyedCount: 2, combinedSpend: 0, memberSpend: 0,
  placeLine: 'Katragunta & Konakalamitla, Prakasam', isComplete: true,
  createdAt: '2026-09-20', updatedAt: '2026-09-20',
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

  test('an old /app/combined member link keeps its id, tab, query and hash', async ({ page }) => {
    // `/app/combined…` was the address until 03/10/2026 (routes.tsx FromCombined).
    await page.goto(`/app/combined/${CP}/papers?x=1#top`);
    await expect(page).toHaveURL(new RegExp(`/app/holdings/${CP}/papers\\?x=1#top$`));
    await expect(page.getByRole('heading', { level: 1, name: 'Katragunta Land' })).toBeVisible();
  });
});
