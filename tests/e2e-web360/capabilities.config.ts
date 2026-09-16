/** Public recipient smoke: isolated browser server and no database mutations. */
import { defineConfig } from '@playwright/test';
import * as path from 'node:path';

export default defineConfig({
  testDir: './specs', testMatch: /(?:capabilities|account-data)\.spec\.ts$/, workers: 1,
  timeout: 30_000, reporter: 'list',
  use: { baseURL: 'http://127.0.0.1:15180', viewport: { width: 1280, height: 900 } },
  webServer: {
    command: 'bun x vite --host 127.0.0.1 --port 15180 --strictPort',
    cwd: path.resolve(__dirname, '../../apps/web'),
    url: 'http://127.0.0.1:15180', reuseExistingServer: false, timeout: 60_000,
    env: { VITE_COGNITO_AUTHORITY: '', VITE_API_PROXY_TARGET: 'http://127.0.0.1:15182', VITE_GATEWAY_PROXY_TARGET: 'http://127.0.0.1:15182' },
  },
});
