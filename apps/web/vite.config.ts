import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  // amazon-cognito-identity-js references Node's `global` at runtime;
  // browsers have globalThis only — without this the whole bundle throws
  // 'global is not defined' at load (white page).
  define: { global: 'globalThis' },
  plugins: [react()],
  server: {
    // DEV-ONLY proxies (server.proxy never affects the production build).
    // Order matters: the specific pattadar rule must sit above the generic
    // '/api' fallthrough.
    proxy: {
      // Pattadar GraphQL → the local FastAPI service. The prefix is stripped
      // so '/api/gateway/pattadar/graphql' reaches the service as '/graphql',
      // and x-user-id is injected (the local api trusts this header) so the
      // dev preview shows the founder's real data.
      '/api/gateway/pattadar': {
        target: 'http://localhost:8080',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/gateway\/pattadar/, ''),
        headers: { 'x-user-id': 'sankara.telukutla' },
      },
      // Everything else stays gateway-relative: the slim gateway
      // (services/gateway) listens on 8080 in local dev. In AWS, CloudFront
      // routes '/api' to the ALB/gateway — same bundle, no runtime config.
      '/api': 'http://localhost:8080',
    },
  },
});
