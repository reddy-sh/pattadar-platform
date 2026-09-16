import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// DEV-ONLY: where the '/api' proxies point. Isolated browser suites override
// VITE_API_PROXY_TARGET so they run against their own API instance and never
// touch the founder's dev stack on :8080.
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

// DEV-ONLY: which port `vite dev` binds. 5173 is Vite's default, which means
// every other project on the machine wants it too — this laptop already runs
// two there — so pattadar takes 5180 and leaves the default to whoever got
// there first. Override per shell: WEB_PORT=5173 bun run dev:web
const webPort = Number(process.env.WEB_PORT || 5180);

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
  // The laptop token mint. Only answers while the gateway is running on its
  // own local trust root (LOCAL_COGNITO=1); on the real pool it 404s and is
  // indistinguishable from absent, which is what makes it safe to route here
  // unconditionally. Without this rule the request falls through to the
  // generic '/api' -> api:8080, which has no such endpoint, and mock-mode
  // sign-in silently gets no Bearer for storage.
  '/api/gateway/local-auth': { target: gatewayTarget, changeOrigin: true },
  '/api/gateway/storage': { target: gatewayTarget, changeOrigin: true },
  '/api/gateway/admin': { target: gatewayTarget, changeOrigin: true },
  '/api/gateway/capabilities': { target: gatewayTarget, changeOrigin: true },
  '/api/gateway/account': { target: gatewayTarget, changeOrigin: true },
  '/api/gateway/assistant': { target: gatewayTarget, changeOrigin: true },
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
  // own port, its own API, its own identity — the founder's :5180/:8080 stack
  // is never touched). Same object, so the two can never drift apart.
  preview: { port: Number(process.env.PORT || 5175), strictPort: true, proxy: devProxy },
  server: {
    // Vite's default behaviour on a taken port is to DRIFT to the next free
    // one. The SPA then sends Cognito a redirect_uri nobody registered and
    // every social sign-in dies on Cognito's error page — a failure that
    // looks like broken auth rather than a busy port. strictPort fails loudly
    // instead, so the port is a decision and not an accident.
    //
    // Whichever port this is MUST be registered on the Cognito SPA client as
    // BOTH http://localhost:<port>/auth/callback and http://127.0.0.1:<port>/
    // auth/callback — Cognito matches redirect_uri byte-for-byte, so the two
    // loopback spellings are different callbacks. They live in
    // infra/terraform/modules/persistent/variables.tf.
    //
    // This only binds hosted-UI sign-in. The local trust root (LOCAL_COGNITO=1,
    // the default in start-local.sh) mints its own tokens and never goes near
    // Cognito, so offline dev works on any port at all.
    port: webPort,
    strictPort: true,
    proxy: devProxy,
  },
});
