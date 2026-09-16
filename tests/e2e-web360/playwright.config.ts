/**
 * End-to-end gate for the record-360 web app (screens W01–W15).
 *
 * Runs a fully self-contained stack so the founder's servers are NEVER
 * touched — theirs are :8080 (api), :8082 (gateway) and :5173 (web):
 *   · pattadar API on :18080, from the venv scripts/start-local.sh provisions,
 *     against the disposable TEST_PG_DSN database (required)
 *   · apps/web BUILT (`vite build && vite preview`) on :5175, whose dev proxy
 *     injects `x-user-id: w360-demo` — the seeded demo identity, so the
 *     founder's own 30 parcels are neither read nor written by this suite
 *
 * Initialize an empty test database with the API schema first, then run with
 * TEST_PG_DSN pointing to it. Global setup seeds only that database.
 *
 * ONE worker: the suite exercises mutations (tagging, expenses, captions,
 * boundary marks) against shared rows, so serial execution keeps every
 * assertion deterministic.
 */
import { defineConfig } from '@playwright/test';
import * as os from 'node:os';
import * as path from 'node:path';
import { requireDisposableDatabase } from '../disposable-db';

const PLATFORM_DIR = path.resolve(__dirname, '../..');
const API_DIR = process.env.RHUB_API_DIR || path.join(PLATFORM_DIR, 'services/api');
const UVICORN = path.join(PLATFORM_DIR, '.local/api-venv/bin/uvicorn');
const BUN = process.env.BUN_BIN || path.join(os.homedir(), '.bun/bin/bun');
const API_PORT = Number(process.env.E2E_API_PORT || 18080);
const WEB_PORT = Number(process.env.E2E_WEB_PORT || 5175);
if (![API_PORT, WEB_PORT].every((port) => Number.isInteger(port) && port >= 1024 && port <= 65535)) {
  throw new Error('E2E_API_PORT and E2E_WEB_PORT must be valid unprivileged ports.');
}
const API_URL = `http://127.0.0.1:${API_PORT}`;
const WEB_URL = `http://localhost:${WEB_PORT}`;
const BUILD_DIR = `../../.local/e2e-web360-dist-${WEB_PORT}`;
const TEST_DSN = requireDisposableDatabase('The record-360 suite');
process.env.APP_PG_DSN = TEST_DSN; // seed subprocesses and API use the same isolated database

export default defineConfig({
  testDir: './specs',
  testIgnore: /map-(drawing|portfolio)\.spec\.ts$/,
  // Re-seed first: the suite mutates, so every run must start from the same
  // rows or the second run fails for the wrong reason.
  globalSetup: require.resolve('./global-setup'),
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  outputDir: `test-results-${WEB_PORT}`,
  reporter: [['list'], ['json', { outputFile: `results-${WEB_PORT}.json` }], ['html', { outputFolder: `playwright-report-${WEB_PORT}`, open: 'never' }]],
  use: {
    baseURL: WEB_URL,
    viewport: { width: 1512, height: 950 },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    actionTimeout: 15_000,
    navigationTimeout: 60_000,
  },
  webServer: [
    {
      command: `${UVICORN} src.main:app --host 127.0.0.1 --port ${API_PORT}`,
      cwd: API_DIR,
      url: `${API_URL}/health`,
      // NOT reused. A long-lived API survives between runs and keeps serving
      // the schema it started with, so a new field or mutation lands in the
      // source and the suite tests the previous one — which reads as the new
      // code silently doing nothing, four separate times before this line.
      // --reload did not save it: the reloader belongs to a process Playwright
      // did not start and does not manage. A few seconds per run is cheaper
      // than that debugging.
      reuseExistingServer: false,
      timeout: 90_000,
      env: {
        APP_PG_DSN: TEST_DSN,
        ALLOW_INSECURE_LOCAL: '1',
        APP_PUBLIC_URL: WEB_URL,
        ANTHROPIC_API_KEY: '',
        PAYMENTS_MODE: 'off',
        NOTIFY_EMAIL_PROVIDER: 'stub',
        NOTIFY_SMS_PROVIDER: 'stub',
        NOTIFY_WA_PROVIDER: 'stub',
      },
    },
    {
      // `vite preview` on the PRODUCTION bundle — the thing that actually
      // ships, not the dev server. strictPort in vite.config guards drift.
      command: `${BUN} x vite build --outDir ${BUILD_DIR} --emptyOutDir && ${BUN} x vite preview --outDir ${BUILD_DIR} --port ${WEB_PORT} --strictPort`,
      cwd: path.join(PLATFORM_DIR, 'apps/web'),
      url: `${WEB_URL}/app`,
      reuseExistingServer: false,
      timeout: 180_000,
      env: {
        DEV_USER_ID: 'w360-demo',
        VITE_API_PROXY_TARGET: API_URL,
        // The founder's local gateway is never part of this suite. Storage
        // scenarios use explicit byte fixtures; all remaining calls fail shut.
        VITE_GATEWAY_PROXY_TARGET: 'http://127.0.0.1:15182',
      },
    },
  ],
});
