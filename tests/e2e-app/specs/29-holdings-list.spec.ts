/**
 * Holdings · /holdings — the list wears the Properties page chrome.
 *
 * The owner reported (03/10/2026) that this list did not follow the other list
 * pages: no summary line, no head actions, no filter row, no count, no sort.
 * These tests hold the shared pieces it now composes — PageHead's summary and
 * actions, FacetFilter's "+ Filter", chips and "N of M shown", the SortCycle
 * chip — and that the rows still open and still say "Missing a property".
 *
 * Three holdings: a farm short of a record, a whole farm, and plots only. The
 * acres add to 62.86 and the plot yards stand beside them, never added in.
 */
import { test, expect } from '../fixtures/harness';

const view = (over: Record<string, unknown>) => ({
  note: '', memberCount: 2, parcelCount: 2, propertyCount: 0, farmExtent: 0, plotExtent: 0,
  builtExtent: 0, extentLine: '', marketValue: 0, invested: 0, paperCount: 0, surveyedCount: 2,
  combinedSpend: 0, memberSpend: 0, placeLine: 'Markapur, Prakasam', isComplete: true,
  createdAt: '2026-10-01', updatedAt: '2026-10-01', members: [], ...over,
});

const VIEWS = [
  view({ id: 'cv-markapur', name: 'Markapur Land', memberCount: 3, parcelCount: 3, surveyedCount: 2,
    farmExtent: 28.33, isComplete: false, createdAt: '2026-10-03' }),
  view({ id: 'cv-banda', name: 'Banda farm', farmExtent: 34.53, createdAt: '2026-10-02' }),
  view({ id: 'cv-ongole', name: 'Ongole plots', parcelCount: 0, propertyCount: 2, plotExtent: 400,
    surveyedCount: 0 }),
];

test.beforeEach(({ world }) => {
  world.set('combinedProperties', VIEWS);
});

const rowNames = (page: import('@playwright/test').Page) =>
  page.locator('table.rectable tbody tr td:nth-child(2) > a').allTextContents();

test.describe('Holdings list', () => {
  test('the head names the page, sums what is shown and offers Export and New @phone', async ({ page, isMobile }) => {
    await page.goto('/holdings');
    const head = page.locator('header.pagehead');
    await expect(head.getByRole('heading', { level: 1 })).toHaveText('Holdings');
    // A top-level page has no eyebrow (design.md V2 and § Page head, 09/10/2026).
    await expect(head.locator('.eyebrow')).toHaveCount(0);
    await expect(head.locator('p.note')).toHaveText('3 holdings · 62.86 ac · 400 sq.yd');
    await expect(head.getByRole('link', { name: 'New holding' })).toHaveAttribute('href', '/properties?combine=1');
    await expect(head.locator('.btn.primary')).toHaveText('New holding');
    if (isMobile) {
      // Under 600px the outlined commands go into the ⋮ and the filled one
      // stays (design.md § Page head, Phone).
      await head.getByRole('button', { name: 'More actions for Holdings' }).click();
      await expect(page.getByRole('menuitem', { name: 'Export' })).toBeEnabled();
      await page.keyboard.press('Escape');
    } else {
      await expect(head.getByRole('button', { name: 'Export' })).toBeEnabled();
    }
    await expect(page.getByRole('status').filter({ hasText: 'shown' })).toHaveText('3 of 3 shown');
    const overflow = await page.evaluate(() =>
      document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, 'the page scrolls sideways').toBeLessThanOrEqual(0);
  });

  test('a filter narrows the list, counts it, lives in the URL and comes off', async ({ page }) => {
    await page.goto('/holdings');
    await page.getByRole('button', { name: '+ Filter' }).click();
    await page.getByRole('button', { name: /Missing a property/ }).click();
    await expect(page).toHaveURL(/[?&]complete=missing/);
    await expect(page.getByRole('status').filter({ hasText: 'shown' })).toHaveText('1 of 3 shown');
    expect(await rowNames(page)).toEqual(['Markapur Land']);
    // The tally carries the narrowed count; the summary keeps the totals
    // (design.md § Page head, Summary: each count is told once).
    await expect(page.locator('header.pagehead p.note')).toHaveText('3 holdings · 62.86 ac · 400 sq.yd');
    await page.getByRole('button', { name: 'Remove filter Properties Missing a property' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'shown' })).toHaveText('3 of 3 shown');
  });

  test('a filter that matches nothing says so and clears', async ({ page }) => {
    await page.goto('/holdings?complete=missing&land=plot');
    await expect(page.getByRole('heading', { name: 'No holdings match these filters' })).toBeVisible();
    await expect(page.locator('.emptypanel p.note')).toHaveText('All 3 holdings are hidden by the filters above.');
    await expect(page.getByRole('button', { name: 'Export' })).toBeDisabled();
    await page.locator('.emptypanel, .blank').getByRole('button', { name: 'Clear all' }).click();
    await expect(page.locator('table.rectable tbody tr')).toHaveCount(3);
    await expect(page).not.toHaveURL(/complete=/);
  });

  test('the sort chip cycles the order', async ({ page }) => {
    await page.goto('/holdings');
    await expect(page.locator('table.rectable tbody tr')).toHaveCount(3);
    expect(await rowNames(page)).toEqual(['Markapur Land', 'Banda farm', 'Ongole plots']);
    await page.getByRole('button', { name: 'Sort: Newest first' }).click();
    await expect(page.getByRole('button', { name: 'Sort: Name A–Z' })).toBeVisible();
    expect(await rowNames(page)).toEqual(['Banda farm', 'Markapur Land', 'Ongole plots']);
    await page.getByRole('button', { name: 'Sort: Name A–Z' }).click();
    await expect(page.getByRole('button', { name: 'Sort: Largest extent' })).toBeVisible();
    // Acres first; the plots-only holding has none, so it is last whatever its yards.
    expect(await rowNames(page)).toEqual(['Banda farm', 'Markapur Land', 'Ongole plots']);
  });

  test('rows still flag an incomplete holding and still open', async ({ page }) => {
    await page.goto('/holdings');
    const markapur = page.locator('table.rectable tbody tr').filter({ hasText: 'Markapur Land' });
    // The pill says what the holding page says: "Incomplete".
    await expect(markapur.getByText('Incomplete', { exact: true })).toBeVisible();
    await expect(page.locator('table.rectable tbody tr').filter({ hasText: 'Banda farm' }).getByText('Incomplete', { exact: true }))
      .toHaveCount(0);
    // Three holdings: no pager, and a footer that adds acres and yards apart.
    await expect(page.getByRole('navigation', { name: 'Holdings pages' })).toHaveCount(0);
    await expect(page.locator('table.rectable tfoot td.num'))
      .toHaveText(['7', '4 of 7', '62.86 ac + 400 sq.yd', '—']);
    await markapur.getByRole('link', { name: 'Markapur Land' }).click();
    await expect(page).toHaveURL(/\/holdings\/cv-markapur$/);
  });

  test('the table totals every holding shown and pages past 20', async ({ page, world }) => {
    world.set('combinedProperties', Array.from({ length: 23 }, (_, i) =>
      view({ id: `cv-${i}`, name: `Holding ${i + 1}`, farmExtent: 1, marketValue: 100000 })));
    await page.goto('/holdings');
    await expect(page.locator('table.rectable tbody tr')).toHaveCount(20);
    // The footer sums every row, not just this page; extent stays per unit.
    const foot = page.locator('table.rectable tfoot tr');
    await expect(foot.locator('th')).toHaveText('Total · 23 holdings');
    await expect(foot.locator('td.num')).toHaveText(['46', '46 of 46', '23.00 ac', /₹23/]);
    const pager = page.getByRole('navigation', { name: 'Holdings pages' });
    await expect(pager).toContainText('1–20 of 23');
    await pager.getByRole('button', { name: 'Next' }).click();
    await expect(pager).toContainText('21–23 of 23');
    await expect(page.locator('table.rectable tbody tr')).toHaveCount(3);
  });

  test('ticked rows are what the footer sums and the bar exports', async ({ page }) => {
    await page.goto('/holdings');
    await page.getByRole('checkbox', { name: 'Select Markapur Land' }).check();
    await page.getByRole('checkbox', { name: 'Select Banda farm' }).check();
    const foot = page.locator('table.rectable tfoot tr');
    await expect(foot.locator('th')).toHaveText('2 holdings selected');
    await expect(foot.locator('td.num')).toHaveText(['5', '4 of 5', '62.86 ac', '—']);
    const bar = page.getByRole('group', { name: 'Act on the selected holdings' });
    await expect(bar.getByRole('status')).toHaveText('2 holdings selected');
    const started = page.waitForEvent('download');
    await bar.getByRole('button', { name: 'Export' }).click();
    expect((await started).suggestedFilename()).toMatch(/^holdings-\d{4}-\d{2}-\d{2}\.csv$/);
    await bar.getByRole('button', { name: 'Clear' }).click();
    await expect(foot.locator('th')).toHaveText('Total · 3 holdings');
  });

  test('Grid and Table show the same holdings, and what is ticked in one stays ticked in the other', async ({ page }) => {
    await page.goto('/holdings');
    const table = page.getByRole('table', { name: 'Holdings' });
    await expect(table.locator('tbody tr')).toHaveCount(3);

    await page.getByRole('group', { name: 'View' }).getByRole('button', { name: 'Grid' }).click();
    await expect(page).toHaveURL(/[?&]view=grid/);
    const cards = page.locator('.holdingcard');
    await expect(cards).toHaveCount(3);
    const markapur = cards.filter({ hasText: 'Markapur Land' });
    await expect(markapur.getByText('Incomplete', { exact: true })).toBeVisible();
    await expect(markapur.locator('dl')).toContainText('2 of 3');
    await expect(markapur.locator('dl')).toContainText('28.33 ac');
    await markapur.getByRole('checkbox').check();
    await expect(page.getByRole('group', { name: 'Act on the selected holdings' })).toContainText('1 holding selected');

    await page.getByRole('group', { name: 'View' }).getByRole('button', { name: 'Table' }).click();
    await expect(page).not.toHaveURL(/view=/);
    await expect(page.getByRole('checkbox', { name: 'Select Markapur Land' })).toBeChecked();
    await expect(table.locator('tfoot')).toContainText('1 holding selected');
  });

  test('Export downloads the rows that are shown', async ({ page }) => {
    await page.goto('/holdings');
    const started = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Export' }).click();
    expect((await started).suggestedFilename()).toMatch(/^holdings-\d{4}-\d{2}-\d{2}\.csv$/);
  });

  test('an account with none shows only the way to make one @phone', async ({ page, world }) => {
    world.set('combinedProperties', []);
    await page.goto('/holdings');
    await expect(page.getByText('No holdings yet')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Go to Properties' })).toHaveAttribute('href', '/properties?combine=1');
    await expect(page.getByRole('button', { name: 'Export' })).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'New holding' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: '+ Filter' })).toHaveCount(0);
  });

  test('New holding hands off to Properties with a combine hint @phone', async ({ page }) => {
    await page.goto('/holdings');
    await page.getByRole('link', { name: 'New holding' }).click();
    await expect(page).toHaveURL(/\/properties\?combine=1/);
    const hint = page.getByRole('status').filter({
      hasText: 'Select two or more properties, then choose Combine into a holding.',
    });
    await expect(hint).toBeVisible();
    // The grid raises its checkboxes while the hint is up.
    await expect(page.locator('.cards.selecting')).toBeVisible();
    // The flag is not a view or a facet: switching views keeps it.
    await page.getByRole('button', { name: 'Table' }).click();
    await expect(page).toHaveURL(/[?&]combine=1/);
    await expect(page).toHaveURL(/[?&]view=table/);
    // Ticked from the keyboard: on a phone the selection bar that the first
    // tick raises sits over the next row, and a pointer would hit the bar.
    for (const name of ['Select Sy 214/2', 'Select Sy 88']) {
      const box = page.getByRole('checkbox', { name });
      await box.focus();
      await page.keyboard.press('Space');
      await expect(box).toBeChecked();
    }
    await page.getByRole('button', { name: 'Combine into a holding' }).click();
    const dialog = page.getByRole('dialog', { name: 'Combine into one holding' });
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(dialog).toHaveCount(0);
    await page.getByRole('button', { name: 'Dismiss the combine hint' }).click();
    await expect(hint).toHaveCount(0);
    await expect(page).not.toHaveURL(/combine=/);
    await expect(page).toHaveURL(/[?&]view=table/);
  });
});
