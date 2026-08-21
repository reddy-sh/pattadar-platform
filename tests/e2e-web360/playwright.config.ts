/**
 * End-to-end gate for the record-360 web app (screens W01–W15).
 *
 * Runs a fully self-contained stack so the founder's servers are NEVER
 * touched — theirs are :8080 (api), :8082 (gateway) and :5173 (web):
 *   · pattadar API on :18080, from the venv scripts/start-local.sh provisions,
 *     against the real local `pattadar` Postgres
 *   · apps/web BUILT (`vite build && vite preview`) on :5175, whose dev proxy
 *     injects `x-user-id: w360-demo` — the seeded demo identity, so the
 *     founder's own 30 parcels are neither read nor written by this suite
 *
 * Seed first (idempotent, rewrites only its own `w360-` rows):
 *   .local/api-venv/bin/python scripts/seed-web360.py w360-demo
 *
 * ONE worker: the suite exercises mutations (tagging, expenses, captions,
 * boundary marks) against shared rows, so serial execution keeps every
 * assertion deterministic.
 */
import { defineConfig } from '@playwright/test';
import * as os from 'node:os';
import * as path from 'node:path';

const PLATFORM_DIR = path.resolve(__dirname, '../..');
const API_DIR = process.env.RHUB_API_DIR || path.join(PLATFORM_DIR, 'services/api');
const UVICORN = path.join(PLATFORM_DIR, '.local/api-venv/bin/uvicorn');
const BUN = process.env.BUN_BIN || path.join(os.homedir(), '.bun/bin/bun');

export default defineConfig({
  testDir: './specs',
  // Re-seed first: the suite mutates, so every run must start from the same
  // rows or the second run fails for the wrong reason.
  globalSetup: require.resolve('./global-setup'),
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [['list'], ['json', { outputFile: 'results.json' }], ['html', { open: 'never' }]],
  use: {
    baseURL: 'http://localhost:5175',
    viewport: { width: 1512, height: 950 },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    actionTimeout: 15_000,
    navigationTimeout: 60_000,
  },
  webServer: [
    {
      command: `${UVICORN} src.main:app --host 127.0.0.1 --port 18080`,
      cwd: API_DIR,
      url: 'http://localhost:18080/health',
      reuseExistingServer: true,
      timeout: 90_000,
      env: {
        APP_PG_DSN: 'host=localhost port=5432 dbname=pattadar user=rhub password=rhub-dev-pwd',
        ALLOW_INSECURE_LOCAL: '1',
        APP_PUBLIC_URL: 'http://localhost:5175',
      },
    },
    {
      // `vite preview` on the PRODUCTION bundle — the thing that actually
      // ships, not the dev server. strictPort in vite.config guards drift.
      command: `${BUN} run e2e:serve`,
      cwd: path.join(PLATFORM_DIR, 'apps/web'),
      url: 'http://localhost:5175/app',
      reuseExistingServer: true,
      timeout: 180_000,
      env: {
        DEV_USER_ID: 'w360-demo',
        VITE_API_PROXY_TARGET: 'http://localhost:18080',
      },
    },
  ],
});
