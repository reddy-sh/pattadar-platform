/**
 * The suite testing its own seal.
 *
 * Everything else here assumes three things are true: the app loads at /home
 * without a sign-in, every /api call is answered from the world, and nothing
 * reaches the founder's server. Those three are asserted once, here, so that
 * when 200 other tests fail it is obvious whether the app broke or the harness
 * did.
 */
import { test, expect } from '../fixtures/harness';
import { ID } from '../fixtures/ids';

test('the app opens on the dashboard with the seeded session, and asks the world for its portfolio', async ({ page, world }) => {
  await page.goto('/home');

  // The harness writes a Cognito session into localStorage before the first
  // render (fixtures/session.ts), so RequireAuth lets /app through. A redirect
  // to /login here means the session keys were spelled with the wrong app
  // client id — discovery reads it off the dev server, and APP_COGNITO_CLIENT_ID
  // overrides it.
  await expect(page).toHaveURL(/\/home$/);
  await expect.poll(() => world.asked('portfolio')).toBe(true);
  // By name: Home draws a second navigation of its own ("Shortcuts"), so an
  // unnamed one is two landmarks and a strict-mode race against Home loading.
  await expect(page.getByRole('navigation', { name: 'Sections' })).toBeVisible();
});

test('the world answers the dashboard, and the seeded figures reach the screen', async ({ page, world }) => {
  await page.goto('/home');
  await expect(page.getByText('Shankar Reddy').first()).toBeVisible();
  expect(world.escapes()).toEqual([]);
});

test('a record 360 asks for exactly the record it was routed to', async ({ page, world }) => {
  await page.goto(`/properties/${ID.parcel}`);
  await expect.poll(() => world.asked('record')).toBe(true);
  expect(world.lastVars('record')).toMatchObject({ id: ID.parcel });
  await expect(page.getByRole('heading', { name: 'Sy 214/2' }).first()).toBeVisible();
});

test('nothing the app asks for escapes the seal', async ({ page, world }) => {
  await page.goto('/properties');
  await expect.poll(() => world.asked('properties')).toBe(true);
  await page.goto('/papers');
  await expect.poll(() => world.asked('vault')).toBe(true);
  expect(world.escapes(), 'every /api call must have an answer in fixtures/seed.ts').toEqual([]);
});
