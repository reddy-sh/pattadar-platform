/**
 * The scenario gate for the app the founder actually has open — :5173.
 *
 * This suite is deliberately a different instrument from e2e-web360:
 *
 *   · tests/e2e-web360 stands up its OWN api (:18080), its OWN built bundle
 *     (:5175) and its OWN seeded identity, then drives real mutations through
 *     them. It proves the wiring. It costs a build, a database and ~6 minutes.
 *   · this one drives the founder's live stack and changes NOTHING. Every
 *     request under /api is answered from `fixtures/world.ts` before it leaves
 *     the browser, so the screen under test is exercised against data the test
 *     chose. Nothing is read from the founder's records and nothing is written
 *     to them, on any code path, including the ones that fail.
 *
 * That seal is what makes "run it against :5173" a safe sentence. It is also
 * what makes the suite able to assert things the other two cannot reach: a
 * portfolio with nothing in it, a server that answers in 30 seconds, a paper
 * whose bytes are refused, a ticket in each of its eight states — none of which
 * any seed script can hold at the same time as its opposite.
 *
 * The founder's server is never started or stopped here. If it is not up, the
 * global setup says so in one sentence instead of 200 navigation timeouts.
 *
 *   cd tests/e2e-app && bun run test
 *   bun run test:phone                        # the 390px projects only
 *   APP_WEB_URL=http://localhost:5175 bun run test   # against any other portal
 *   bun run test:live                         # the read-only smoke, unsealed
 */
import { defineConfig, devices } from '@playwright/test';

/** The portal under test. Defaults to the dev server start-local.sh runs. */
// 5180, not Vite's 5173: scripts/start-local.sh pins Pattadar there so it
// does not fight every other project on the laptop for the default port.
// Override with APP_WEB_URL when the stack is somewhere else.
export const WEB_URL = process.env.APP_WEB_URL || 'http://localhost:5180';

export default defineConfig({
  testDir: './specs',
  globalSetup: require.resolve('./fixtures/global-setup'),

  /* Sealed tests share no state — no database, no seed, no row that two specs
   * could both edit. Parallel is therefore free, and the whole suite lands in
   * under a minute instead of the six the integration gate costs. The `live`
   * project below opts back out, because that one does touch a real server. */
  fullyParallel: true,
  workers: process.env.CI ? 2 : '50%',
  retries: process.env.CI ? 1 : 0,
  forbidOnly: !!process.env.CI,

  timeout: 45_000,
  expect: { timeout: 10_000 },

  reporter: [
    ['list'],
    ['json', { outputFile: 'results.json' }],
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
  ],

  use: {
    baseURL: WEB_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
    actionTimeout: 10_000,
    navigationTimeout: 30_000,
    /* The app stores scheme and rail state in localStorage. A project-wide
     * fixed timezone and locale keep date wording deterministic — several
     * screens print "3 days left" and friends. */
    timezoneId: 'Asia/Kolkata',
    locale: 'en-IN',
  },

  projects: [
    {
      /* The desktop surface: everything not explicitly a phone-only or a
       * live-server scenario. 1512x950 is the founder's own window. */
      name: 'app',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1512, height: 950 } },
      grepInvert: [/@phone-only/, /@live/],
    },
    {
      /* 390px. The rail becomes a drawer below 900px and several screens
       * re-flow, so the phone is a different set of assertions rather than
       * the same ones at another width. */
      name: 'phone',
      use: { ...devices['iPhone 14'] },
      grep: /@phone/,
      grepInvert: [/@live/],
    },
    {
      /* Unsealed, read-only, and never run by default: this is the one that
       * asks the founder's actual server whether it is alive and serving the
       * app. It asserts nothing about the CONTENT of any record, because that
       * content belongs to the founder and changes between runs. */
      name: 'live',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1512, height: 950 } },
      grep: /@live/,
      fullyParallel: false,
      workers: 1,
    },
  ],
});
