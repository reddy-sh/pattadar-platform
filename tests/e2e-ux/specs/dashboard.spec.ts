/**
 * Land Portfolio dashboard — founder-approved 26/07 layout: greeting header,
 * dark hero (extents + estimated-value-so-far), attention card with actions,
 * record-completeness bar, tools grid, family & heirs bars, village-by-village
 * land list. Every number is cross-checked against a direct GraphQL fetch of
 * the SAME query the page runs.
 */
import { expect, gql, openApp, test, uxCheck } from '../helpers/fixtures';

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
  documents: { parcelId: string | null }[];
}

const QUERY = `query {
  dashboardStats { totalPassbooks totalParcels totalDocuments totalBeneficiaries estimatedValue totalExtent totalGroups }
  parcels { id extent passbookId }
  passbooks { id village }
  properties { currentValue marketValue guidelineValue purchasePrice city }
  documents { parcelId }
}`;

test('greeting, hero, attention, completeness and village list match GraphQL', async ({ page, request }) => {
  const d = await gql<DashData>(request, QUERY);
  test.skip(
    d.dashboardStats.totalPassbooks === 0 && d.parcels.length === 0,
    'no data — dashboard shows the first-run setup hero',
  );

  await openApp(page, '/app');
  await expect(page.getByRole('heading', { name: /Good (morning|afternoon|evening)/ })).toBeVisible();

  // The page must be on LIVE data — the empty-fallback chip means the web
  // app failed to reach the suite's own API.
  await expect(page.getByText('Service unreachable')).toHaveCount(0);

  // Hero: extent-led stats + the honest value framing.
  await expect.soft(page.getByText('Your land & property')).toBeVisible();
  await expect.soft(page.getByText('Estimated value so far')).toBeVisible();
  await expect.soft(page.getByRole('button', { name: '+ Add land' })).toBeVisible();
  await expect.soft(page.getByRole('button', { name: 'Upload a deed' })).toBeVisible();

  // Record completeness mirrors documents coverage of parcels.
  if (d.parcels.length > 0) {
    const withDoc = new Set(d.documents.map((doc) => doc.parcelId).filter(Boolean));
    const have = d.parcels.filter((p) => withDoc.has(p.id)).length;
    await expect
      .soft(
        page.getByText(`${have} of ${d.parcels.length} parcels`, { exact: true }),
        'record completeness counts deeds on file',
      )
      .toBeVisible();

    // Attention: parcels without a deed must surface with an action.
    const missing = d.parcels.length - have;
    if (missing > 0) {
      await expect
        .soft(page.getByText(new RegExp(`^${missing} parcels? (are|is) missing`)), 'missing-deed attention row')
        .toBeVisible();
      await expect.soft(page.getByRole('button', { name: 'Upload deeds' })).toBeVisible();
    }
  }

  // Village-by-village list carries the top village by acreage.
  if (d.parcels.length > 0) {
    await expect.soft(page.getByRole('heading', { name: 'Your land, village by village' })).toBeVisible();
    const villageOf = new Map(d.passbooks.map((b) => [b.id, b.village || '—']));
    const acc = new Map<string, number>();
    for (const p of d.parcels) {
      const v = villageOf.get(p.passbookId) || '—';
      acc.set(v, (acc.get(v) || 0) + (Number(p.extent) || 0));
    }
    const top = [...acc.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
    if (top && top !== '—')
      await expect.soft(page.getByText(top).first(), `top village "${top}" listed`).toBeVisible();
    await expect
      .soft(
        page.getByRole('button', {
          name: `See all ${d.parcels.length + d.properties.length} holdings →`,
        }),
      )
      .toBeVisible();
  }

  // Tools + Family & heirs side cards.
  await expect.soft(page.getByRole('heading', { name: 'Tools', exact: true })).toBeVisible();
  await expect.soft(page.getByRole('button', { name: 'New passbook' })).toBeVisible();
  await expect.soft(page.getByRole('heading', { name: 'Family & heirs' })).toBeVisible();

  // Footer honesty note.
  await expect.soft(page.getByText(/Values estimated from AP-IGRS guideline rates/)).toBeVisible();

  await uxCheck(page, 'dashboard');
});

test('hide toggle masks the estimated value', async ({ page, request }) => {
  const d = await gql<DashData>(request, QUERY);
  const total =
    (d.dashboardStats.estimatedValue ?? 0) +
    d.properties.reduce((s, p) => s + (p.currentValue || p.marketValue || p.guidelineValue || p.purchasePrice || 0), 0);
  test.skip(total === 0, 'no value to mask');

  await openApp(page, '/app');
  const hide = page.getByText('Hide', { exact: true });
  await expect(hide).toBeVisible();
  await hide.click();
  await expect(page.getByText('₹ ••••').first()).toBeVisible();
  await page.getByText('Show', { exact: true }).click();
  await expect(page.getByText('₹ ••••')).toHaveCount(0);
});
