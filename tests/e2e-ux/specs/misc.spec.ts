/**
 * Remaining views — notifications (+ filters), invitations, audit expander,
 * admin tab counts, profile edit + save ROUND-TRIP (restored afterwards),
 * wallet gold card + coming-soon.
 */
import { expect, gql, openApp, test, uxCheck } from '../helpers/fixtures';

test('notifications view renders with working All/Failures filter', async ({ page, request }) => {
  const d = await gql<{ notificationLog: { id: string; status: string | null }[] }>(
    request,
    'query { notificationLog(limit: 200) { id status } }',
  );
  const rows = d.notificationLog ?? [];
  const failures = rows.filter((n) => n.status === 'failed').length;

  await openApp(page, '/app/notifications');
  await expect(page.getByRole('heading', { name: 'Sent notifications' })).toBeVisible();
  await expect(page.getByRole('button', { name: `All (${rows.length})` })).toBeVisible();
  await expect(page.getByRole('button', { name: `Failures (${failures})` })).toBeVisible();

  if (rows.length > 0) {
    await expect.poll(() => page.locator('tbody tr').count()).toBe(rows.length);
    await page.getByRole('button', { name: `Failures (${failures})` }).click();
    if (failures > 0) await expect.poll(() => page.locator('tbody tr').count()).toBe(failures);
    else await expect(page.getByText('No failed messages')).toBeVisible();
  }
  await uxCheck(page, 'misc:notifications');
});

test('invitations view renders (list or empty state)', async ({ page, request }) => {
  const d = await gql<{ invitations: { id: string }[] }>(request, 'query { invitations { id } }');
  await openApp(page, '/app/invitations');
  await expect(page.getByRole('heading', { name: 'Invitations' })).toBeVisible();
  if ((d.invitations ?? []).length > 0)
    await expect.poll(() => page.locator('tbody tr').count()).toBe(d.invitations.length);
  else await expect(page.getByText('No invitations yet')).toBeVisible();
  await uxCheck(page, 'misc:invitations');
});

test('audit log renders and the row expander opens', async ({ page, request }) => {
  const d = await gql<{ auditEvents: { id: string }[] }>(request, 'query { auditEvents { id } }');
  await openApp(page, '/app/audit');
  await expect(page.getByRole('heading', { name: 'Audit' })).toBeVisible();

  if ((d.auditEvents ?? []).length === 0) {
    await expect(page.getByText('No activity recorded')).toBeVisible();
  } else {
    const expander = page.getByRole('button', { name: 'Expand details' }).first();
    await expect(expander).toBeVisible();
    await expander.click();
    await expect(page.locator('.MuiCollapse-entered').first()).toBeVisible();
  }
  await uxCheck(page, 'misc:audit');
});

test('admin & reference data tab counts render with live numbers', async ({ page }) => {
  await openApp(page, '/app/admin');
  await expect(page.getByRole('heading', { name: 'Admin & Reference Data' })).toBeVisible();

  for (const label of [/States \(\d+\)/, /Districts \(\d+\)/, /Deed Types \(\d+\)/, /Fee Schedule \(\d+\)/]) {
    const tab = page.getByRole('tab', { name: label });
    await expect(tab).toBeVisible();
    const text = (await tab.textContent()) || '';
    const count = Number(text.match(/\((\d+)\)/)?.[1] ?? 0);
    expect.soft(count, `${text} should carry live reference rows`).toBeGreaterThan(0);
  }
  await expect(page.getByRole('tab', { name: 'Analytics' })).toBeVisible();

  await page.getByRole('tab', { name: /Districts \(\d+\)/ }).click();
  await expect.poll(() => page.locator('tbody tr').count()).toBeGreaterThan(0);
  await uxCheck(page, 'misc:admin');
});

test('profile: edit + save round-trip (original restored)', async ({ page }) => {
  await openApp(page, '/app/profile');
  await expect(page.getByRole('heading', { name: 'Profile' })).toBeVisible();
  test.skip(
    (await page.getByText('Sample data').count()) > 0,
    'profile is on sample data — save is disabled',
  );

  const address = page.getByLabel('My Address');
  await expect(address).toBeVisible();
  const original = await address.inputValue();
  const probe = `${original.replace(/ · e2e-probe$/, '')} · e2e-probe`.trim();

  try {
    await address.fill(probe);
    await page.getByRole('button', { name: 'Save Profile' }).click();
    await expect(page.getByText('Profile saved')).toBeVisible();

    await page.reload();
    await expect(page.getByLabel('My Address')).toHaveValue(probe); // persisted round-trip
    await uxCheck(page, 'misc:profile');
  } finally {
    // Restore the founder's real address whatever happened above.
    await page.getByLabel('My Address').fill(original);
    await page.getByRole('button', { name: 'Save Profile' }).click();
    await expect(page.getByText('Profile saved')).toBeVisible();
  }
});

test('wallet: gold balance card + coming-soon, actions disabled', async ({ page }) => {
  await openApp(page, '/app/wallet');
  await expect(page.getByRole('heading', { name: 'Wallet' })).toBeVisible();
  await expect(page.getByText('Coming soon').first()).toBeVisible();
  await expect(page.getByText('Wallet balance')).toBeVisible();
  await expect(page.getByText(/₹[\d,.]+/).first()).toBeVisible();

  // Both money actions must be present but disabled until launch.
  expect(await page.locator('main button[disabled]').count()).toBeGreaterThanOrEqual(2);
  await uxCheck(page, 'misc:wallet');
});
