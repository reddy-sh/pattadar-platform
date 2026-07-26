/**
 * Passbooks — stat cards match live data ("5 khatas", "102 Acres 81 Cents"
 * on the founder's dataset), search filters the cards, grid/list toggle,
 * Export menu (CSV downloads a file, NO tab), and the New-Passbook dialog
 * (AI dropzone + manual form) opens without submitting.
 */
import { expect, formatArea, gql, openApp, test, uxCheck } from '../helpers/fixtures';

interface PbData {
  passbooks: {
    id: string;
    ownerName: string;
    fatherHusbandName: string;
    pattadarNo: string;
    village: string;
    mandal: string;
    district: string;
    state: string;
    totalExtent: number;
    groupId: string | null;
  }[];
  parcels: { passbookId: string }[];
  groups: { id: string; name: string }[];
}

const QUERY = `query {
  passbooks { id ownerName fatherHusbandName pattadarNo village mandal district state totalExtent groupId }
  parcels { passbookId }
  groups { id name }
}`;

test('stat cards, khata chip and totals match GraphQL', async ({ page, request }) => {
  const d = await gql<PbData>(request, QUERY);
  test.skip(d.passbooks.length === 0, 'no passbooks in the dataset — page shows first-run landing');
  await openApp(page, '/app/passbooks');
  await expect(page.getByText('Sample data')).toHaveCount(0);

  const n = d.passbooks.length;
  await expect(page.getByText(`${n} khata${n !== 1 ? 's' : ''}`, { exact: true })).toBeVisible();

  const totalExtent = d.passbooks.reduce((s, p) => s + (Number(p.totalExtent) || 0), 0);
  await expect(
    page.getByText(formatArea(totalExtent), { exact: true }).first(),
    `Total Extent card should read "${formatArea(totalExtent)}"`,
  ).toBeVisible();

  for (const label of ['Passbooks', 'Total Extent', 'Villages', 'Parcels'])
    await expect.soft(page.getByText(label, { exact: true }).first(), `stat card "${label}"`).toBeVisible();

  await uxCheck(page, 'passbooks');
});

test('search filters the khata cards', async ({ page, request }) => {
  const d = await gql<PbData>(request, QUERY);
  test.skip(d.passbooks.length === 0, 'no passbooks in the dataset');
  await openApp(page, '/app/passbooks');

  const cards = page.getByText(/^Khata /);
  await expect(cards.first()).toBeVisible();
  expect(await cards.count()).toBe(d.passbooks.length);

  const groupName = new Map(d.groups.map((g) => [g.id, g.name]));
  const needle = (d.passbooks[0].village || d.passbooks[0].ownerName).toLowerCase();
  const expected = d.passbooks.filter((b) =>
    [b.ownerName, b.fatherHusbandName, b.pattadarNo, b.village, b.mandal, b.district, b.state, groupName.get(b.groupId || '') || '']
      .join(' ')
      .toLowerCase()
      .includes(needle),
  ).length;

  await page.getByPlaceholder('Search passbooks…').fill(needle);
  await expect.poll(() => cards.count(), { message: `search "${needle}" should leave ${expected} card(s)` }).toBe(expected);
  await page.getByPlaceholder('Search passbooks…').fill('');
  await expect.poll(() => cards.count()).toBe(d.passbooks.length);
});

test('grid/list toggle switches to the table and back', async ({ page, request }) => {
  const d = await gql<PbData>(request, QUERY);
  test.skip(d.passbooks.length === 0, 'no passbooks in the dataset');
  await openApp(page, '/app/passbooks');

  await page.getByRole('button', { name: 'List view' }).click();
  await expect(page.getByRole('columnheader', { name: 'Owner' })).toBeVisible();
  expect(await page.locator('tbody tr').count()).toBe(d.passbooks.length);

  await page.getByRole('button', { name: 'Grid view' }).click();
  await expect(page.getByRole('columnheader', { name: 'Owner' })).toHaveCount(0);
  await expect(page.getByText(/^Khata /).first()).toBeVisible();
  await uxCheck(page, 'passbooks:list-toggle');
});

test('Export menu has PDF / Excel / CSV and CSV downloads a file (no tab)', async ({ page, request }) => {
  const d = await gql<PbData>(request, QUERY);
  test.skip(d.passbooks.length === 0, 'no passbooks in the dataset');
  await openApp(page, '/app/passbooks');

  await page.getByRole('button', { name: 'Export' }).click();
  const menu = page.getByRole('menu');
  await expect(menu.getByRole('menuitem')).toHaveCount(3);
  for (const item of ['PDF', 'Excel (.xlsx)', 'CSV'])
    await expect(menu.getByRole('menuitem', { name: item })).toBeVisible();

  const download = page.waitForEvent('download');
  await menu.getByRole('menuitem', { name: 'CSV' }).click();
  const dl = await download;
  expect(dl.suggestedFilename()).toMatch(/^pattadar-passbooks-\d{4}-\d{2}-\d{2}\.csv$/);
  // No-tab rule is enforced by the auto ux fixture.
});

test('New Passbook dialog opens with the AI panel and manual entry (not submitted)', async ({ page }) => {
  await openApp(page, '/app/passbooks');
  const opener = page.getByRole('button', { name: /New Passbook|Add your first passbook/ });
  await opener.first().click();

  const dialog = page.getByRole('dialog');
  await expect(dialog.getByText('Create Passbook')).toBeVisible();
  await expect(dialog.getByText('Drop one or more passbooks, or click to upload')).toBeVisible();
  await expect(dialog.getByText(/enter the details manually/)).toBeVisible();
  await uxCheck(page, 'passbooks:create-dialog');

  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
});
