/** Maps regressions use their own identity and servers, with no demo seeding
 *  or account-wide cleanup. Each spec deletes only the records it creates. */
import { defineConfig } from '@playwright/test';
import * as os from 'node:os';
import * as path from 'node:path';
import { requireDisposableDatabase } from '../disposable-db';

const platform = path.resolve(__dirname, '../..');
const bun = process.env.BUN_BIN || path.join(os.homedir(), '.bun/bin/bun');
// These specs create and delete records. Refuse to start against a database
// that is not disposable, rather than defaulting to the real one.
const TEST_DSN = requireDisposableDatabase('The maps regression suite');

export default defineConfig({
  testDir: './specs',
  testMatch: /map-(drawing|portfolio|village)\.spec\.ts$/,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: 'list',
  outputDir: 'test-results/maps',
  use: {
    baseURL: 'http://127.0.0.1:5191',
    viewport: { width: 1512, height: 950 },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    actionTimeout: 15_000,
    navigationTimeout: 60_000,
  },
  webServer: [
    {
      command: `${path.join(platform, '.local/api-venv/bin/uvicorn')} src.main:app --host 127.0.0.1 --port 18090`,
      cwd: process.env.RHUB_API_DIR || path.join(platform, 'services/api'),
      url: 'http://127.0.0.1:18090/health',
      reuseExistingServer: false,
      timeout: 90_000,
      env: {
        APP_PG_DSN: TEST_DSN,
        ALLOW_INSECURE_LOCAL: '1',
        APP_PUBLIC_URL: 'http://127.0.0.1:5191',
        ANTHROPIC_API_KEY: '',
        PAYMENTS_MODE: 'off',
      },
    },
    {
      command: `${bun} x vite build && ${bun} x vite preview --host 127.0.0.1 --port 5191 --strictPort`,
      cwd: path.join(platform, 'apps/web'),
      url: 'http://127.0.0.1:5191/app',
      reuseExistingServer: false,
      timeout: 180_000,
      env: {
        DEV_USER_ID: 'w360-maps-tests',
        VITE_API_PROXY_TARGET: 'http://127.0.0.1:18090',
        VITE_GATEWAY_PROXY_TARGET: 'http://127.0.0.1:15182',
      },
    },
  ],
});
