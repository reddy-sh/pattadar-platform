import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  // amazon-cognito-identity-js references Node's `global` at runtime;
  // browsers have globalThis only — without this the whole bundle throws
  // 'global is not defined' at load (white page).
  define: { global: 'globalThis' },
  plugins: [react()],
  server: {
    proxy: {
      // The slim gateway (services/gateway) listens on 8080 in local dev.
      // All browser calls stay gateway-relative ('/api/...') so the same
      // bundle works behind CloudFront in AWS and behind this proxy locally.
      '/api': 'http://localhost:8080',
    },
  },
});
