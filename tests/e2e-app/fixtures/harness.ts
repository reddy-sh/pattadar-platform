/**
 * The suite's front door. Every spec imports `test` and `expect` from here and
 * from nowhere else.
 *
 * What arrives already done, before a single line of a test body runs:
 *
 *   · the seal. Every request under /api is answered from `world`. Nothing
 *     reaches the founder's API, the gateway, MinIO or Postgres — not on the
 *     happy path, not on a retry, not from a screen the test never meant to
 *     open. This is the property that makes it safe to point the whole suite
 *     at :5173 while the founder is working in it.
 *   · the basemaps. Tiles and the geocoder are answered locally, for the same
 *     reason tests/e2e-web360/specs/harness.ts does it: a dead <img> is a
 *     console error, and forty card thumbnails in flight mean `networkidle`
 *     never settles.
 *   · a console watch. An uncaught exception or a console error fails the test
 *     that caused it, by default. A test that is deliberately provoking one
 *     opts out with `test.use({ allowConsole: true })`.
 *   · an escape watch. If the app asks for something the world has no answer
 *     for, the request is refused AND the test fails at teardown naming it —
 *     so a query gaining a field, or a screen gaining a call, surfaces as a
 *     failure here rather than as a blank panel nobody notices.
 *
 * Opting out, where a scenario genuinely needs it:
 *   test.use({ sealed: false })        — talk to the real server (the @live project)
 *   test.use({ allowConsole: true })   — a test that provokes an error on purpose
 *   test.use({ allowEscapes: true })   — a test asserting an unanswered call
 *   test.use({ scheme: 'light' })      — start in the light scheme
 */
import { test as base, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { World } from './world';
import { SEED, seedRest } from './seed';
import { signIn, signOut } from './session';

/** The two key-free basemaps this app draws on (apps/web/src/w360/MapCanvas.tsx). */
export const TILE_HOSTS = /tile\.openstreetmap\.org|server\.arcgisonline\.com|basemaps\.cartocdn\.com/i;

/** OSM's geocoder, asked only when a record has neither a pin nor a survey. */
export const NOMINATIM = /nominatim\.openstreetmap\.org/i;

/** A 1x1 transparent PNG, served in place of every real map tile. */
export const BLANK_TILE = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
);

/** A 1x1 white JPEG, for the storage-content route (photos, paper previews). */
export const BLANK_JPEG = Buffer.from(
  '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==',
  'base64',
);

/** Markapur, as Nominatim actually answers for it — the same fixture the
 *  integration suite uses, so the fallback order under test is ours and not a
 *  third party's uptime. */
export async function stubGeocoder(page: Page): Promise<void> {
  await page.route(NOMINATIM, (route) => {
    const q = decodeURIComponent(new URL(route.request().url()).searchParams.get('q') ?? '');
    const hit = /^Markapur,/.test(q)
      ? [{
          lat: '15.7406698', lon: '79.2698502',
          boundingbox: ['15.7006698', '15.7806698', '79.2298502', '79.3098502'],
          display_name: 'Markapur, Markapuram, Prakasam, Andhra Pradesh, India',
        }]
      : [];
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(hit) });
  });
}

export async function stubTiles(page: Page): Promise<void> {
  await page.route(TILE_HOSTS, (route) =>
    route.fulfill({ status: 200, contentType: 'image/png', body: BLANK_TILE }));
  await stubGeocoder(page);
}

interface Options {
  /** Answer /api from the world instead of the real server. Default true. */
  sealed: boolean;
  /** Let console errors and page exceptions pass without failing. */
  allowConsole: boolean;
  /** Let unanswered /api calls pass without failing at teardown. */
  allowEscapes: boolean;
  /** Which colour scheme the app starts in (it reads localStorage on mount). */
  scheme: 'dark' | 'light';
  /** Put a session in the page before the first render. Default true — /app is
   *  behind RequireAuth and the founder's dev server runs a real pool, so a
   *  test without this lands on /login. The public-door specs turn it off. */
  signedIn: boolean;
}

interface Fixtures {
  /** The switchboard for this test. Change an answer, then navigate. */
  world: World;
  /** Console errors and page exceptions seen so far, for a test that expects one. */
  consoleErrors: string[];
  /** @internal — the auto fixture that enforces the two guards. */
  guards: void;
}

export const test = base.extend<Options & Fixtures>({
  sealed: [true, { option: true }],
  allowConsole: [false, { option: true }],
  allowEscapes: [false, { option: true }],
  scheme: ['dark', { option: true }],
  signedIn: [true, { option: true }],

  world: async ({ page, baseURL, sealed, scheme, signedIn }, use) => {
    // NOT structuredClone: half the seed is answer FUNCTIONS (properties
    // filters, record-by-id), and those do not survive a clone. The World's
    // constructor copies the map instead, and every authoring method — set,
    // patch, seedOf — replaces or clones rather than mutating in place, so one
    // test cannot reach into another's answers through the shared seed.
    const world = new World(SEED);
    seedRest(world);

    // The scheme and the rail are read from localStorage during the very first
    // render, so they have to be there before the document loads, not after.
    await page.addInitScript(([key, value]) => {
      try { window.localStorage.setItem(key as string, value as string); } catch { /* private mode */ }
    }, ['w360.scheme', scheme]);

    // Before the seal and before anything renders: RequireAuth decides on the
    // first pass, so a session that arrives later arrives after the redirect.
    if (signedIn) await signIn(page, baseURL ?? 'http://localhost:5173', sealed);
    else await signOut(page);

    await stubTiles(page);
    if (sealed) await world.install(page);

    await use(world);
  },

  consoleErrors: async ({ page }, use) => {
    const errors: string[] = [];
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(`console.error: ${message.text()}`);
    });
    page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
    await use(errors);
  },

  /**
   * The two guards, as an AUTO fixture rather than an afterEach hook.
   *
   * A hook declared in an imported module registers against whichever file is
   * being collected, which works but is a subtlety nobody should have to know
   * to read a spec. An auto fixture is unconditional by construction, and its
   * teardown runs before `world`'s — so `world.escapes()` is still readable
   * when it is checked. It depends on both of the fixtures it inspects, which
   * is what forces them to exist for every test in the suite.
   */
  guards: [
    async ({ world, consoleErrors, allowConsole, allowEscapes, sealed }, use) => {
      await use();

      if (!allowConsole) {
        expect(
          consoleErrors,
          'The screen logged errors. If provoking one is the point of this test, set test.use({ allowConsole: true }).',
        ).toEqual([]);
      }
      if (sealed && !allowEscapes) {
        expect(
          world.escapes(),
          'The app asked for something the sealed world has no answer for — seed it in fixtures/seed.ts, or set test.use({ allowEscapes: true }).',
        ).toEqual([]);
      }
    },
    { auto: true },
  ],
});

export { expect, World };
export type { Page };
