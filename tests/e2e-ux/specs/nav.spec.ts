/**
 * Shell navigation: all 12 drawer items route correctly, the active pill
 * follows, page titles are correct (no breadcrumbs), the DD/MM footer notice
 * is present, and the dark/light toggle switches scheme and persists.
 */
import { expect, openApp, test, uxCheck } from '../helpers/fixtures';

const NAV: { label: string; path: string; title: RegExp }[] = [
  { label: 'Dashboard', path: '/app', title: /Land Portfolio/ },
  { label: 'Passbooks', path: '/app/passbooks', title: /Passbooks|Start your land record/ },
  { label: 'Land & Properties', path: '/app/parcels', title: /Land & Properties|Add your first holding/ },
  { label: 'Documents', path: '/app/documents', title: /Documents/ },
  { label: 'Families & Groups', path: '/app/groups', title: /Families & Groups/ },
  { label: 'Invitations', path: '/app/invitations', title: /Invitations/ },
  { label: 'Notifications', path: '/app/notifications', title: /[Nn]otifications/ },
  { label: 'Wallet', path: '/app/wallet', title: /Wallet/ },
  { label: 'Tools', path: '/app/tools', title: /SRO Offices|Tools/ },
  { label: 'Audit Log', path: '/app/audit', title: /Audit/ },
  { label: 'Admin & Ref Data', path: '/app/admin', title: /Admin & Reference Data/ },
  { label: 'Profile', path: '/app/profile', title: /Profile/ },
];

test('all 12 drawer items route correctly, active pill follows, titles correct', async ({ page }) => {
  await openApp(page);
  const nav = page.locator('.MuiDrawer-docked'); // permanent (desktop) drawer

  for (const item of NAV) {
    await nav.getByRole('link', { name: item.label, exact: true }).click();
    await expect(page, `${item.label} → ${item.path}`).toHaveURL(
      new RegExp(`${item.path.replace(/[/&?]/g, (m) => '\\' + m)}$`),
    );
    // Active pill follows the route.
    await expect
      .soft(nav.getByRole('link', { name: item.label, exact: true }), `${item.label}: active pill`)
      .toHaveClass(/Mui-selected/);
    // Title (h1) is present and correct — breadcrumb-free. (The shell
    // wordmark is ALSO an <h1>, so match by content, not position.)
    await expect
      .soft(
        page.getByRole('heading', { level: 1 }).filter({ hasText: item.title }).first(),
        `${item.label}: page must carry an <h1> matching ${item.title}`,
      )
      .toBeVisible();
    expect
      .soft(await page.getByText('breadcrumb', { exact: false }).count(), `${item.label}: no breadcrumbs`)
      .toBe(0);
    await uxCheck(page, `nav:${item.label}`);
  }

  // UX rule: exactly ONE <h1> per page. The AppShell wordmark renders as an
  // <h1> alongside every page title — recorded once here, not per page.
  const h1Count = await page.getByRole('heading', { level: 1 }).count();
  expect
    .soft(h1Count, 'each page must have exactly one <h1> (shell wordmark also renders as h1)')
    .toBe(1);
});

test('footer shows the DD/MM/YYYY date notice', async ({ page }) => {
  await openApp(page);
  await expect(page.getByText('Dates shown DD/MM/YYYY')).toBeVisible();
});

test('dark/light toggle switches the scheme and persists across reload', async ({ page }) => {
  await openApp(page);
  const toggle = page.locator(
    'button:has([data-testid="DarkModeOutlinedIcon"]), button:has([data-testid="LightModeOutlinedIcon"])',
  );
  await expect(toggle).toBeVisible();

  const bg = () => page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  const before = await bg();
  await toggle.click();
  await expect.poll(bg, { message: 'toggle must change the colour scheme' }).not.toBe(before);
  const after = await bg();

  await page.reload();
  await expect(page.locator('.MuiDrawer-docked')).toBeVisible();
  await expect.poll(bg, { message: 'chosen scheme must persist across reload' }).toBe(after);
  await uxCheck(page, 'nav:dark-mode');

  // Restore the original scheme for the rest of the suite.
  await toggle.click();
  await expect.poll(bg).toBe(before);
});
