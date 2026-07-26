/**
 * Tools — 4 tabs; stamp-duty calculator (₹50,00,000 / ₹60,00,000 sale deed
 * → total ₹4,53,000), unit converter (1 acre → 100 cents), SRO search.
 */
import { expect, formatINR, gql, openApp, test, uxCheck } from '../helpers/fixtures';

interface SroData {
  sroOffices: { id: string; code: string; name: string; drZone: string; district: string; mandal: string }[];
}

test('the four tool tabs render and switch', async ({ page }) => {
  await openApp(page, '/app/tools');
  for (const name of ['Find SRO', 'Stamp Duty', 'Market Value', 'Area Calculator']) {
    const tab = page.getByRole('tab', { name });
    await tab.click();
    await expect(tab).toHaveAttribute('aria-selected', 'true');
  }
  await uxCheck(page, 'tools:tabs');
});

test('stamp-duty: ₹50,00,000 / ₹60,00,000 sale deed totals ₹4,53,000', async ({ page }) => {
  await openApp(page, '/app/tools?tab=stamp-duty');
  await expect(page.getByText('Stamp Duty & Fee Calculator')).toBeVisible();

  // Options render as "<natureEn> — <regTypeEn>"; the plain AP sale deed row
  // is "Sale Deed — Sale" (5% stamp + 1.5% transfer + 1% reg + 0.05% user).
  const deedBox = page.getByRole('combobox', { name: 'Deed Type' });
  await deedBox.click();
  await deedBox.fill('Sale Deed');
  await page.getByRole('option', { name: 'Sale Deed — Sale', exact: true }).click();

  await page.getByLabel('Consideration Amount (₹)').fill('5000000');
  await page.getByLabel('Market / Guideline Value (₹)').fill('6000000');
  await page.getByRole('button', { name: 'Calculate' }).click();

  await expect(page.getByText('Duty & Fee Breakup')).toBeVisible();
  const expected = await formatINR(page, 453000); // "₹4,53,000"
  await expect(page.getByText('TOTAL', { exact: true })).toBeVisible();
  await expect(page.getByText(expected, { exact: true }), `sale-deed total must be ${expected}`).toBeVisible();
  await uxCheck(page, 'tools:stamp-duty');
});

test('unit converter: 1 acre = 100 cents', async ({ page }) => {
  await openApp(page, '/app/tools?tab=calculator');
  await expect(page.getByRole('tab', { name: 'Unit Converter' })).toHaveAttribute('aria-selected', 'true');

  // Defaults are 1 / Acres → the readout is "1 Acre" and the Cents row = 100.
  await expect(page.getByText('1 Acre', { exact: true })).toBeVisible();
  const centsRow = page.locator('tr').filter({ hasText: 'Cents' }).first();
  await expect(centsRow).toContainText('100');
  await uxCheck(page, 'tools:converter');
});

test('SRO directory search filters the table', async ({ page, request }) => {
  const d = await gql<SroData>(request, 'query { sroOffices { id code name drZone district mandal } }');
  test.skip(d.sroOffices.length === 0, 'no SRO reference data');

  await openApp(page, '/app/tools');
  await expect(page.getByRole('heading', { name: 'SRO Offices' })).toBeVisible();
  await expect.poll(() => page.locator('tbody tr').count()).toBe(d.sroOffices.length);

  const needle = d.sroOffices[0].district.toLowerCase();
  const expected = d.sroOffices.filter((o) =>
    [o.code, o.name, o.drZone, o.district, o.mandal].join(' ').toLowerCase().includes(needle),
  ).length;
  await page.getByPlaceholder('Search office, district, mandal…').fill(needle);
  await expect
    .poll(() => page.locator('tbody tr').count(), { message: `search "${needle}" leaves ${expected} rows` })
    .toBe(expected);
  await uxCheck(page, 'tools:sro');
});
