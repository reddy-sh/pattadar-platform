/**
 * Holdings · /app/holdings — the list wears the Properties page chrome.
 *
 * The owner reported (03/10/2026) that this list did not follow the other list
 * pages: no summary line, no head actions, no filter row, no count, no sort.
 * These tests hold the shared pieces it now composes — PageHead's summary and
 * actions, FacetFilter's "+ Filter", chips and "N of M shown", the SortCycle
 * chip — and that the rows still open and still say "Missing a record".
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
  page.locator('.rows .row .grow > a').allTextContents();

test.describe('Holdings list', () => {
  test('an old /app/combined link lands on Holdings with its query and hash', async ({ page }) => {
    // `/app/combined` was the address until 03/10/2026 (routes.tsx FromCombined).
    await page.goto('/app/combined?complete=missing&land=farm#top');
    await expect(page).toHaveURL(/\/app\/holdings\?complete=missing&land=farm#top$/);
    await expect(page.locator('header.pagehead').getByRole('heading', { level: 1 })).toHaveText('Holdings');
    // The query still filters once it has moved.
    expect(await rowNames(page)).toEqual(['Markapur Land']);
  });

  test('the head names the page, sums what is shown and offers Export and New @phone', async ({ page }) => {
    await page.goto('/app/holdings');
    const head = page.locator('header.pagehead');
    await expect(head.getByRole('heading', { level: 1 })).toHaveText('Holdings');
    await expect(head.locator('.eyebrow')).toHaveText('Several properties held as one');
    await expect(head.locator('p.note')).toHaveText('3 holdings · 62.86 ac · 400 Sq.yd');
    await expect(head.getByRole('button', { name: 'Export' })).toBeEnabled();
    await expect(head.getByRole('link', { name: 'New holding' })).toHaveAttribute('href', '/app/properties?combine=1');
    await expect(page.getByRole('status').filter({ hasText: 'shown' })).toHaveText('3 of 3 shown');
    const overflow = await page.evaluate(() =>
      document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, 'the page scrolls sideways').toBeLessThanOrEqual(0);
  });

  test('a filter narrows the list, counts it, lives in the URL and comes off', async ({ page }) => {
    await page.goto('/app/holdings');
    await page.getByRole('button', { name: '+ Filter' }).click();
    await page.getByRole('button', { name: /Missing a record/ }).click();
    await expect(page).toHaveURL(/[?&]complete=missing/);
    await expect(page.getByRole('status').filter({ hasText: 'shown' })).toHaveText('1 of 3 shown');
    expect(await rowNames(page)).toEqual(['Markapur Land']);
    await expect(page.locator('header.pagehead p.note')).toHaveText('1 holding · 28.33 ac');
    await page.getByRole('button', { name: 'Remove filter Records Missing a record' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'shown' })).toHaveText('3 of 3 shown');
  });

  test('a filter that matches nothing says so and clears', async ({ page }) => {
    await page.goto('/app/holdings?complete=missing&land=plot');
    await expect(page.getByRole('heading', { name: 'No holdings match these filters' })).toBeVisible();
    await expect(page.locator('.emptypanel p.note')).toHaveText('All 3 holdings are hidden by the filters above.');
    await expect(page.getByRole('button', { name: 'Export' })).toBeDisabled();
    await page.getByRole('button', { name: 'Clear filters' }).click();
    await expect(page.locator('.rows .row')).toHaveCount(3);
    await expect(page).not.toHaveURL(/complete=/);
  });

  test('the sort chip cycles the order', async ({ page }) => {
    await page.goto('/app/holdings');
    await expect(page.locator('.rows .row')).toHaveCount(3);
    expect(await rowNames(page)).toEqual(['Markapur Land', 'Banda farm', 'Ongole plots']);
    await page.getByRole('button', { name: 'Sort: Newest first ⌄' }).click();
    await expect(page.getByRole('button', { name: 'Sort: Name A–Z ⌄' })).toBeVisible();
    expect(await rowNames(page)).toEqual(['Banda farm', 'Markapur Land', 'Ongole plots']);
    await page.getByRole('button', { name: 'Sort: Name A–Z ⌄' }).click();
    await expect(page.getByRole('button', { name: 'Sort: Largest extent ⌄' })).toBeVisible();
    // Acres first; the plots-only holding has none, so it is last whatever its yards.
    expect(await rowNames(page)).toEqual(['Banda farm', 'Markapur Land', 'Ongole plots']);
  });

  test('rows still flag a missing record and still open', async ({ page }) => {
    await page.goto('/app/holdings');
    const markapur = page.locator('.rows .row').filter({ hasText: 'Markapur Land' });
    await expect(markapur.getByText('Missing a record')).toBeVisible();
    await expect(page.locator('.rows .row').filter({ hasText: 'Banda farm' }).getByText('Missing a record'))
      .toHaveCount(0);
    await markapur.getByRole('link', { name: 'Open' }).click();
    await expect(page).toHaveURL(/\/app\/holdings\/cv-markapur$/);
  });

  test('Export downloads the rows that are shown', async ({ page }) => {
    await page.goto('/app/holdings');
    const started = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Export' }).click();
    expect((await started).suggestedFilename()).toMatch(/^holdings-\d{4}-\d{2}-\d{2}\.csv$/);
  });

  test('an account with none shows only the way to make one @phone', async ({ page, world }) => {
    world.set('combinedProperties', []);
    await page.goto('/app/holdings');
    await expect(page.getByText('No holdings yet')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Go to Properties' })).toHaveAttribute('href', '/app/properties?combine=1');
    await expect(page.getByRole('button', { name: 'Export' })).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'New holding' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: '+ Filter' })).toHaveCount(0);
  });

  test('New holding hands off to Properties with a combine hint @phone', async ({ page }) => {
    await page.goto('/app/holdings');
    await page.getByRole('link', { name: 'New holding' }).click();
    await expect(page).toHaveURL(/\/app\/properties\?combine=1/);
    const hint = page.getByRole('status').filter({
      hasText: 'Select two or more properties, then choose Combine to make a holding.',
    });
    await expect(hint).toBeVisible();
    // The grid raises its checkboxes while the hint is up.
    await expect(page.locator('.cards.selecting')).toBeVisible();
    // The flag is not a view or a facet: switching views keeps it.
    await page.getByRole('button', { name: 'List' }).click();
    await expect(page).toHaveURL(/[?&]combine=1/);
    await expect(page).toHaveURL(/[?&]view=list/);
    // Ticked from the keyboard: on a phone the selection bar that the first
    // tick raises sits over the next row, and a pointer would hit the bar.
    for (const name of ['Select Sy 214/2', 'Select Sy 88']) {
      const box = page.getByRole('checkbox', { name });
      await box.focus();
      await page.keyboard.press('Space');
      await expect(box).toBeChecked();
    }
    await page.getByRole('button', { name: 'Combine…' }).click();
    const dialog = page.getByRole('dialog', { name: 'Combine into one holding' });
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(dialog).toHaveCount(0);
    await page.getByRole('button', { name: 'Dismiss the combine hint' }).click();
    await expect(hint).toHaveCount(0);
    await expect(page).not.toHaveURL(/combine=/);
    await expect(page).toHaveURL(/[?&]view=list/);
  });
});
