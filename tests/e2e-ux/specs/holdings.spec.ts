/**
 * Land & Properties — holdings count, All/Land/Properties tab counts, the
 * filter panel, ?pb= khata deep-link, card click OPENS THE DETAIL (regression
 * for the founder's bug), and the ⋮ card menu (Open / My stake / Delete).
 */
import { expect, gql, openApp, test, uxCheck } from '../helpers/fixtures';

interface HoldData {
  parcels: { id: string; surveyNo: string; passbookId: string }[];
  properties: { id: string }[];
  passbooks: { id: string; pattadarNo: string; ownerName: string; village: string }[];
}

const QUERY = `query {
  parcels { id surveyNo passbookId }
  properties { id }
  passbooks { id pattadarNo ownerName village }
}`;

test('holdings chip and per-tab counts match GraphQL', async ({ page, request }) => {
  const d = await gql<HoldData>(request, QUERY);
  const total = d.parcels.length + d.properties.length;
  test.skip(total === 0, 'no holdings in the dataset');

  await openApp(page, '/app/parcels');
  await expect(page.getByText('Sample data')).toHaveCount(0);
  await expect(page.getByText(`${total} holdings`, { exact: true })).toBeVisible();

  // Count rows per tab in list view (deterministic vs. grid cards).
  await page.getByRole('button', { name: 'List view' }).click();
  await expect(page.getByRole('columnheader', { name: 'Name' })).toBeVisible();
  await expect.poll(() => page.locator('tbody tr').count(), { message: 'All tab rows' }).toBe(total);

  await page.getByRole('tab', { name: 'Land Parcels' }).click();
  await expect.soft(page.getByText('Parcels', { exact: true }).first()).toBeVisible(); // stat card
  await expect.poll(() => page.locator('tbody tr').count(), { message: 'Land Parcels rows' }).toBe(d.parcels.length);

  await page.getByRole('tab', { name: 'Properties' }).click();
  await expect.poll(() => page.locator('tbody tr').count(), { message: 'Properties rows' }).toBe(d.properties.length);

  await page.getByRole('tab', { name: 'All', exact: true }).click();
  await expect.poll(() => page.locator('tbody tr').count()).toBe(total);
  await uxCheck(page, 'holdings');
});

test('filter panel opens with all quick filters', async ({ page, request }) => {
  const d = await gql<HoldData>(request, QUERY);
  test.skip(d.parcels.length + d.properties.length === 0, 'no holdings — page shows first-run landing');
  await openApp(page, '/app/parcels');
  await page.getByRole('button', { name: /^Filters/ }).click();
  for (const label of ['Kind', 'Status', 'My stake', 'Family / group', 'Passbook'])
    await expect.soft(page.getByText(label, { exact: true }).first(), `filter "${label}"`).toBeVisible();
  await expect(page.getByRole('button', { name: 'Clear', exact: true })).toBeDisabled();
  await uxCheck(page, 'holdings:filters');
});

test('?pb= khata deep-link lands on Land Parcels filtered to that passbook', async ({ page, request }) => {
  const d = await gql<HoldData>(request, QUERY);
  const pb = d.passbooks.find((b) => d.parcels.some((p) => p.passbookId === b.id));
  test.skip(!pb, 'no passbook with parcels in the dataset');

  await openApp(page, `/app/parcels?pb=${pb!.id}`);
  await expect(page.getByRole('tab', { name: 'Land Parcels' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByText(new RegExp(`📗 ${pb!.pattadarNo}`)).first()).toBeVisible(); // "Filtered by" chip

  const expected = d.parcels.filter((p) => p.passbookId === pb!.id).length;
  await page.getByRole('button', { name: 'List view' }).click();
  await expect
    .poll(() => page.locator('tbody tr').count(), { message: `khata filter should leave ${expected} parcel(s)` })
    .toBe(expected);
  await uxCheck(page, 'holdings:deep-link');
});

test('REGRESSION: clicking a holding card opens its detail page', async ({ page, request }) => {
  const d = await gql<HoldData>(request, QUERY);
  test.skip(d.parcels.length === 0, 'no parcels in the dataset');
  await openApp(page, '/app/parcels');
  // Wait for the LIVE dataset (the page paints the bundled sample first,
  // then swaps — clicking during the swap hits a remounting card).
  await expect(
    page.getByText(`${d.parcels.length + d.properties.length} holdings`, { exact: true }),
  ).toBeVisible();

  // First parcel card (parcel cards carry the "Khata …" tag; stat cards don't).
  const card = page.locator('.MuiCard-root').filter({ hasText: /Khata / }).first();
  await expect(card).toBeVisible();
  await card.click();

  await expect(page, 'card click must navigate to the parcel/property detail').toHaveURL(
    /\/app\/(parcels|properties)\/[^/?]+$/,
  );
  await expect(page.getByRole('tab', { name: 'Overview' })).toBeVisible();
  await uxCheck(page, 'holdings:card-open');
});

test('card ⋮ menu offers Open / My stake / Delete', async ({ page, request }) => {
  const d = await gql<HoldData>(request, QUERY);
  const total = d.parcels.length + d.properties.length;
  test.skip(total === 0, 'no holdings in the dataset');
  await openApp(page, '/app/parcels');
  // Wait for the LIVE dataset before opening the menu (sample→live swap
  // remounts the cards and silently closes a just-opened menu).
  await expect(page.getByText(`${total} holdings`, { exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Card actions' }).first().click();
  const menu = page.getByRole('menu');
  await expect(menu.getByRole('menuitem', { name: 'Open', exact: true })).toBeVisible();
  await expect(menu.getByRole('menuitem', { name: 'My stake…' })).toBeVisible();
  await expect(menu.getByRole('menuitem', { name: 'Delete' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(menu).toBeHidden();
});
