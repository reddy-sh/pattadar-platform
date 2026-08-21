import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// DEV-ONLY: where the '/api' proxies point. The e2e-ux suite overrides this
// (VITE_API_PROXY_TARGET=http://localhost:18080) so tests run against their
// own API instance and never touch the founder's dev stack on :8080.
const apiTarget = process.env.VITE_API_PROXY_TARGET || 'http://localhost:8080';
// DEV-ONLY: the local gateway (services/gateway run by start-local.sh) serves
// storage + admin on :8082, backed by MinIO + the local pattadar_hub DB.
const gatewayTarget = process.env.VITE_GATEWAY_PROXY_TARGET || 'http://localhost:8082';
// DEV-ONLY identity: the pattadar proxy bypasses Cognito and tells the local
// API who you are with this header. It MUST match the user your records are
// keyed under — the native app derives identity from the signed-in account,
// so if you filed holdings on the phone as `shankarreddy.t`, web dev must ask
// as `shankarreddy.t` or it shows an empty, "add your first holding" account.
// Override per shell: DEV_USER_ID=u01 bun run dev:web
const devUserId = process.env.DEV_USER_ID || 'shankarreddy.t';

// DEV-ONLY proxies, shared by `vite dev` and `vite preview` (never in a build).
// Order matters: the specific pattadar rule must sit above the generic '/api'
// fallthrough.
const devProxy = {
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
    rewrite: (path: string) => path.replace(/^\/api\/gateway\/pattadar/, ''),
    headers: { 'x-user-id': devUserId },
  },
  // Everything else stays gateway-relative: the slim gateway
  // (services/gateway) listens on 8080 in local dev. In AWS, CloudFront
  // routes '/api' to the ALB/gateway — same bundle, no runtime config.
  '/api': apiTarget,
};

export default defineConfig({
  // amazon-cognito-identity-js references Node's `global` at runtime;
  // browsers have globalThis only — without this the whole bundle throws
  // 'global is not defined' at load (white page).
  define: { global: 'globalThis' },
  plugins: [react()],
  // `vite preview` serves the PRODUCTION bundle and needs the same dev-only
  // proxies, because that is what the e2e suite drives (a built bundle on its
  // own port, its own API, its own identity — the founder's :5173/:8080 stack
  // is never touched). Same object, so the two can never drift apart.
  preview: { port: Number(process.env.PORT || 5175), strictPort: true, proxy: devProxy },
  server: {
    // The Cognito web client registers EXACTLY http://localhost:5173 as its
    // OAuth callback. If the port is taken (a stale dev server), Vite's
    // default is to drift to 5174 — the SPA then sends an unregistered
    // redirect_uri and every social sign-in dies on Cognito's error page.
    // Fail loudly instead; the fix is killing the stale server.
    port: 5173,
    strictPort: true,
    proxy: devProxy,
  },
});
