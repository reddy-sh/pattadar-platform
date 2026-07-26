/**
 * UX + functionality review suite — the GATE for the M3 UX redesign.
 *
 * Runs a fully self-contained stack so the founder's running dev servers
 * (:5173 web / :8080 api) are NEVER touched:
 *   · pattadar API (FastAPI, real local `pattadar` Postgres DB) on :18080,
 *     started from the same venv scripts/start-local.sh provisions
 *   · vite dev server on :5174 with the '/api' proxy pointed at :18080
 *     (VITE_API_PROXY_TARGET) — mock auth (no VITE_COGNITO_*), the proxy
 *     injects x-user-id: sankara.telukutla → the founder's REAL data.
 *
 * ONE worker: the suite reads live data and does one profile round-trip;
 * serial execution keeps every assertion deterministic.
 */
import { defineConfig } from '@playwright/test';
import * as os from 'node:os';
import * as path from 'node:path';

const PLATFORM_DIR = path.resolve(__dirname, '../..');
const RHUB_API_DIR =
  process.env.RHUB_API_DIR ||
  path.join(os.homedir(), 'reddy.sh/projects/rhub/api/services/apps/pattadar');
const UVICORN = path.join(PLATFORM_DIR, '.local/api-venv/bin/uvicorn');
const BUN = process.env.BUN_BIN || path.join(os.homedir(), '.bun/bin/bun');

export default defineConfig({
  testDir: './specs',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 90_000,
  expect: { timeout: 10_000 },
  reporter: [
    ['list'],
    ['json', { outputFile: 'results.json' }],
    ['html', { open: 'never' }],
  ],
  use: {
    baseURL: 'http://localhost:5174',
    viewport: { width: 1440, height: 900 },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    actionTimeout: 15_000,
    navigationTimeout: 60_000,
  },
  webServer: [
    {
      // The SAME service scripts/start-local.sh runs, on a test-only port.
      command: `${UVICORN} src.main:app --host 127.0.0.1 --port 18080`,
      cwd: RHUB_API_DIR,
      url: 'http://localhost:18080/health',
      reuseExistingServer: true,
      timeout: 90_000,
      env: {
        APP_PG_DSN: 'host=localhost port=5432 dbname=pattadar user=rhub password=rhub-dev-pwd',
        ALLOW_INSECURE_LOCAL: '1',
        APP_PUBLIC_URL: 'http://localhost:5174',
      },
    },
    {
      command: `${BUN} run dev --port 5174 --strictPort`,
      cwd: path.join(PLATFORM_DIR, 'apps/web'),
      url: 'http://localhost:5174',
      reuseExistingServer: true,
      timeout: 120_000,
      env: { VITE_API_PROXY_TARGET: 'http://localhost:18080' },
    },
  ],
});
