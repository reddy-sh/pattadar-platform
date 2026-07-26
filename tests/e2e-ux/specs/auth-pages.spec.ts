/**
 * Public routes render without the signed-in shell and without errors —
 * mock auth is always signed in, so instead of logging out we visit each
 * public page directly.
 */
import { expect, test, uxCheck } from '../helpers/fixtures';

const PUBLIC: { path: string; probe: RegExp; redirectsWhenAuthed?: boolean }[] = [
  // /login, /signup and /forgot-password send an authenticated visitor (mock
  // auth = always signed in) straight to /app — that redirect IS the correct
  // behaviour (M3 redesign fixed /forgot-password to match /login).
  { path: '/login', probe: /Sign in/, redirectsWhenAuthed: true },
  { path: '/signup', probe: /Create your account/, redirectsWhenAuthed: true },
  { path: '/forgot-password', probe: /Reset your password/, redirectsWhenAuthed: true },
  { path: '/verify/e2e-probe-token', probe: /Verify membership/ },
  { path: '/active/e2e-probe-token', probe: /Verify membership/ },
  { path: '/privacy', probe: /Privacy/i },
  { path: '/terms', probe: /Terms/i },
];

for (const { path, probe, redirectsWhenAuthed } of PUBLIC) {
  test(`public route ${path} renders standalone`, async ({ page }) => {
    await page.goto(path);
    if (redirectsWhenAuthed) {
      await page.waitForURL(/\/app$/);
      await expect(page.locator('.MuiDrawer-docked')).toBeVisible();
      test.info().annotations.push({
        type: 'note',
        description: `${path} redirects an authenticated visitor to /app (mock auth is always signed in) — the pre-auth form is only reachable in real-Cognito mode.`,
      });
      return;
    }
    await expect(page.getByText(probe).first()).toBeVisible();
    // Public pages must NOT mount the signed-in shell.
    await expect(page.locator('.MuiDrawer-docked')).toHaveCount(0);
    await expect(page.getByText('Dates shown DD/MM/YYYY')).toHaveCount(0);
    await uxCheck(page, `auth:${path}`);
  });
}
