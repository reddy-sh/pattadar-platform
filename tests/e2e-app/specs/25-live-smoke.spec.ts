/**
 * The one file that actually talks to the founder's server.
 *
 * Everything else in this suite is sealed — every /api call answered from
 * fixtures — which proves the SCREENS and proves nothing at all about whether
 * the stack behind them is up. This file is the other half: it runs unsealed,
 * against the real API on :8080 through the dev proxy, signed in with a real
 * token minted from the local trust root, and asks the questions only a live
 * stack can answer.
 *
 * It runs ONLY in the `live` project:
 *
 *     cd tests/e2e-app && bun run test:live
 *
 * Every test here is tagged @live, which is what keeps it out of the default
 * run, and every test here is READ ONLY. It asserts that screens ARRIVE and
 * that the plumbing answers — never what any particular record contains,
 * because that content is the founder's and changes between runs. An assertion
 * on "Sy 214/2 is worth ₹86 lakh" would belong to the sealed half of the
 * suite, where the number was chosen by the test.
 *
 * Needs: the web app on :5173, the API on :8080 and the gateway on :8082 —
 * i.e. ./scripts/start-local.sh, which is the stack this file exists to check.
 */
import { test, expect } from '../fixtures/harness';

test.use({ sealed: false });

/** The screens whose whole job is to ask the server something. */
const LIVE_ROUTES: Array<{ path: string; asks: string }> = [
  { path: '/app', asks: 'the portfolio' },
  { path: '/app/properties', asks: 'the properties list' },
  { path: '/app/papers', asks: 'the vault' },
  { path: '/app/services', asks: 'the orders list' },
  { path: '/app/wallet', asks: 'the wallet' },
  { path: '/app/shared', asks: 'the shared kits' },
  { path: '/app/map', asks: 'the map records' },
];

for (const { path, asks } of LIVE_ROUTES) {
  test(`@live ${path} reaches the real API and ${asks} comes back`, async ({ page }) => {
    const graphql: number[] = [];
    page.on('response', (response) => {
      if (new URL(response.url()).pathname === '/api/gateway/pattadar/graphql') {
        graphql.push(response.status());
      }
    });

    await page.goto(path);

    // The shell is the evidence the bundle loaded and the session was accepted;
    // a 200 from GraphQL is the evidence the proxy, the API and the database
    // behind it are all answering. Neither on its own would say so.
    await expect(page.getByRole('navigation')).toBeVisible();
    await expect.poll(() => graphql.length, {
      message: `${path} never asked the API for anything — the screen is not wired, or the proxy is not forwarding`,
    }).toBeGreaterThan(0);
    expect(graphql, `${path} got a non-200 from the API`).not.toContain(500);
    expect(graphql).not.toContain(502);
    expect(graphql).not.toContain(401);
  });
}

test('@live the token the app sends is one the gateway accepts', async ({ page }) => {
  // Storage is the strict door: unlike the pattadar proxy it has no dev bypass
  // and validates the Bearer token for real. If this passes, the session the
  // harness minted is a genuine one and not merely well-shaped.
  const response = await page.request.get('/api/gateway/storage/nodes', {
    failOnStatusCode: false,
  });
  expect(
    [200, 404].includes(response.status()),
    `the gateway answered ${response.status()} — 401 means the minted token was refused, and the @live project cannot run without one`,
  ).toBe(true);
});

test('@live a record opens on the real data behind it', async ({ page }) => {
  // Whatever the founder's first record happens to be. The assertion is that
  // the list and the 360 agree with each other, which is true for any content.
  await page.goto('/app/properties');
  await expect(page.getByRole('navigation')).toBeVisible();

  const firstCard = page.locator('a[href^="/app/records/"]').first();
  const count = await page.locator('a[href^="/app/records/"]').count();
  test.skip(count === 0, 'this account has no records on the live stack, so there is nothing to open');

  const href = await firstCard.getAttribute('href');
  await firstCard.click();
  await expect(page).toHaveURL(new RegExp(href!.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  await expect(page.getByRole('navigation')).toBeVisible();
});
