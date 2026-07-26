/**
 * Land Portfolio dashboard — hero ₹ en-IN value, health rings, village
 * split, activity feed. Every number is cross-checked against a direct
 * GraphQL fetch of the SAME query the page runs.
 */
import { expect, formatINR, gql, openApp, test, uxCheck } from '../helpers/fixtures';

interface DashData {
  dashboardStats: {
    totalPassbooks: number;
    totalParcels: number;
    totalDocuments: number;
    totalBeneficiaries: number;
    estimatedValue: number | null;
    totalExtent: number;
    totalGroups: number;
  };
  parcels: { id: string; extent: number; passbookId: string }[];
  passbooks: { id: string; village: string }[];
  properties: {
    currentValue: number | null;
    marketValue: number | null;
    guidelineValue: number | null;
    purchasePrice: number | null;
    city: string | null;
  }[];
  recentAuditEvents: { id: string; action: string }[];
}

const QUERY = `query {
  dashboardStats { totalPassbooks totalParcels totalDocuments totalBeneficiaries estimatedValue totalExtent totalGroups }
  parcels { id extent passbookId }
  passbooks { id village }
  properties { currentValue marketValue guidelineValue purchasePrice city }
  recentAuditEvents { id action }
}`;

const propertyValue = (p: DashData['properties'][number]) =>
  p.currentValue || p.marketValue || p.guidelineValue || p.purchasePrice || 0;

test('hero, rings, village split and activity match a direct GraphQL fetch', async ({ page, request }) => {
  const d = await gql<DashData>(request, QUERY);
  test.skip(
    d.dashboardStats.totalPassbooks === 0 && d.parcels.length === 0,
    'no data — dashboard shows the first-run setup hero',
  );

  await openApp(page, '/app');
  await expect(page.getByRole('heading', { name: 'Land Portfolio' })).toBeVisible();

  // The page must be on LIVE data — the sample-data fallback would mean the
  // web app failed to reach the suite's own API.
  await expect(page.getByText('Sample data')).toHaveCount(0);

  // Hero: est. value (₹ en-IN, guideline basis) = API estimatedValue + Σ property values.
  const total =
    (d.dashboardStats.estimatedValue ?? 0) + d.properties.reduce((s, p) => s + propertyValue(p), 0);
  if (total > 0) {
    const inr = await formatINR(page, total);
    await expect
      .soft(page.getByText(`Est. value ${inr}`), `hero est. value should be ${inr}`)
      .toBeVisible();
  } else {
    await expect.soft(page.getByText('Est. value —')).toBeVisible();
  }

  // Count chips mirror dashboardStats.
  const s = d.dashboardStats;
  const chips = [
    `${s.totalPassbooks} passbook${s.totalPassbooks !== 1 ? 's' : ''}`,
    `${s.totalGroups} group${s.totalGroups !== 1 ? 's' : ''}`,
    `${s.totalBeneficiaries} beneficiar${s.totalBeneficiaries !== 1 ? 'ies' : 'y'}`,
    `${s.totalDocuments} document${s.totalDocuments !== 1 ? 's' : ''}`,
  ];
  for (const chip of chips)
    await expect.soft(page.getByText(chip, { exact: true }), `count chip "${chip}"`).toBeVisible();

  // Health rings: with parcels present, the ring section must render (up to 4).
  const ringTitles = ['Records health', 'Succession cover', 'Tax compliance', 'Members verified'];
  let visibleRings = 0;
  for (const t of ringTitles) if ((await page.getByText(t, { exact: true }).count()) > 0) visibleRings += 1;
  if (d.parcels.length > 0) {
    expect.soft(visibleRings, 'health-ring section should render for a populated portfolio').toBeGreaterThan(0);
    await expect.soft(page.getByText('Records health', { exact: true })).toBeVisible();
    expect.soft(visibleRings, 'no more than the 4 defined rings').toBeLessThanOrEqual(4);
  }

  // Farmland by village — top village (by acreage) must be listed.
  if (d.parcels.length > 0) {
    await expect.soft(page.getByRole('heading', { name: 'Farmland by village' })).toBeVisible();
    const villageOf = new Map(d.passbooks.map((b) => [b.id, b.village || '—']));
    const acc = new Map<string, number>();
    for (const p of d.parcels) {
      const v = villageOf.get(p.passbookId) || '—';
      acc.set(v, (acc.get(v) || 0) + (Number(p.extent) || 0));
    }
    const top = [...acc.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
    if (top && top !== '—')
      await expect
        .soft(page.getByText(top).first(), `top village "${top}" listed in the split`)
        .toBeVisible();
  }

  // Recent activity reflects recentAuditEvents.
  await expect.soft(page.getByRole('heading', { name: 'Recent activity' })).toBeVisible();
  if (d.recentAuditEvents.length > 0)
    await expect.soft(page.getByText('No recent activity')).toHaveCount(0);

  await uxCheck(page, 'dashboard');
});
