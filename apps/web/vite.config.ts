import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// DEV-ONLY: where the '/api' proxies point. The e2e-ux suite overrides this
// (VITE_API_PROXY_TARGET=http://localhost:18080) so tests run against their
// own API instance and never touch the founder's dev stack on :8080.
const apiTarget = process.env.VITE_API_PROXY_TARGET || 'http://localhost:8080';
// DEV-ONLY: the local gateway (services/gateway run by start-local.sh) serves
// storage + admin on :8081, backed by MinIO + the local pattadar_hub DB.
const gatewayTarget = process.env.VITE_GATEWAY_PROXY_TARGET || 'http://localhost:8081';

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
      // Storage + admin → the REAL local gateway (Cognito-validated Bearer
      // token passes through untouched; no identity injection — the gateway
      // strips client identity headers by design).
      '/api/gateway/storage': { target: gatewayTarget, changeOrigin: true },
      '/api/gateway/admin': { target: gatewayTarget, changeOrigin: true },
      '/api/gateway/pattadar': {
        target: apiTarget,
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/gateway\/pattadar/, ''),
        headers: { 'x-user-id': 'sankara.telukutla' },
      },
      // Everything else stays gateway-relative: the slim gateway
      // (services/gateway) listens on 8080 in local dev. In AWS, CloudFront
      // routes '/api' to the ALB/gateway — same bundle, no runtime config.
      '/api': apiTarget,
    },
  },
});
