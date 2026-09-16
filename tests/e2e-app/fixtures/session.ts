/**
 * The one thing this suite fakes.
 *
 * `start-local.sh` builds the bundle against a REAL Cognito pool
 * (VITE_COGNITO_AUTHORITY is set), so a fresh browser opening /app is bounced
 * to /login by RequireAuth — and the web app has no offline dev door to sign
 * in through; only the phone has one. Every other suite in this repo solves
 * that the same way, and so does this one: the tokens
 * `amazon-cognito-identity-js` looks for are written into localStorage before
 * the first render, so `getNativeSession()` finds a session and the app
 * proceeds exactly as it would after a real sign-in.
 *
 * Two ways to make those tokens, chosen by whether the test is sealed:
 *
 *   sealed (the default, and nearly everything here)
 *      A synthetic JWT, minted in this process, valid for twelve hours. It is
 *      never sent anywhere — the seal answers every request before it leaves
 *      the browser — so its signature does not need to be real and the suite
 *      does not need the gateway to be up to run. What it must be is
 *      JWT-SHAPED with a future `exp`, because the Cognito library parses the
 *      payload and rejects the session otherwise.
 *
 *   unsealed (the @live project)
 *      A real token from the local trust root the stack is already running
 *      (POST :8082/local-auth/token). Those requests do leave the browser, so
 *      the gateway validates the token for real.
 *
 * The pool the bundle was built against is DISCOVERED, not assumed. Vite
 * inlines `import.meta.env.VITE_COGNITO_CLIENT_ID` into the module it serves,
 * so the client id is readable from the dev server itself. That matters
 * because the storage keys are spelled with it: a hard-coded id that has
 * drifted writes a session the app cannot see, and the failure looks like
 * broken auth rather than a stale constant.
 */
import type { Page } from '@playwright/test';

/** Who the sealed session belongs to. Only ever seen in the app's own chrome. */
export const SESSION_USER = process.env.APP_USER || 'shankarreddy.t';
export const SESSION_EMAIL = process.env.APP_EMAIL || 'shankarreddy.t@pattadar.local';

/** The SPA client start-local.sh builds with — the last resort if discovery
 *  cannot reach the server. */
const FALLBACK_CLIENT_ID = '10okivmth1rv58ed8f2k7eq4mm';

const GATEWAY = process.env.APP_GATEWAY_URL || 'http://localhost:8082';

let discovered: Promise<string> | null = null;

/** The Cognito app-client id the running bundle was built with. */
export function clientId(webUrl: string): Promise<string> {
  if (process.env.APP_COGNITO_CLIENT_ID) return Promise.resolve(process.env.APP_COGNITO_CLIENT_ID);
  discovered ??= (async () => {
    // Vite dev serves the transformed module with the env value inlined. A
    // built preview does not, and falls through to the default below.
    for (const path of ['/src/auth/cognitoNative.ts', '/src/auth/AuthProvider.tsx']) {
      try {
        const res = await fetch(`${webUrl}${path}`, { signal: AbortSignal.timeout(5_000) });
        if (!res.ok) continue;
        const body = await res.text();
        // A Cognito app-client id is 26 lowercase alphanumerics, and it is the
        // only such literal next to the pool constructor.
        const hit = /ClientId:\s*"([a-z0-9]{20,32})"/.exec(body)
          ?? /["']([a-z0-9]{26})["']/.exec(body);
        if (hit) return hit[1];
      } catch { /* fall through to the default */ }
    }
    return FALLBACK_CLIENT_ID;
  })();
  return discovered;
}

function b64url(value: object | string): string {
  const raw = typeof value === 'string' ? value : JSON.stringify(value);
  return Buffer.from(raw, 'utf8').toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * A JWT the Cognito library will accept as an unexpired session.
 *
 * `exp` twelve hours out is the point: `CognitoUserSession.isValid()` compares
 * it against the clock and, finding it good, hands the session back without a
 * network call — which is what keeps a sealed test offline. The signature is
 * the literal string `sealed`; nothing in this suite ever verifies it.
 */
export function fakeJwt(use: 'access' | 'id', now = Date.now()): string {
  const iat = Math.floor(now / 1000);
  const payload: Record<string, unknown> = {
    sub: '00000000-0000-4000-8000-00000000e2e5',
    iss: 'https://cognito-idp.ap-south-1.amazonaws.com/ap-south-1_sealed',
    token_use: use,
    auth_time: iat,
    iat,
    exp: iat + 12 * 60 * 60,
    jti: 'w360-e2e-app',
  };
  if (use === 'access') {
    payload.username = SESSION_USER;
    payload.client_id = 'sealed';
    payload.scope = 'aws.cognito.signin.user.admin openid email profile';
  } else {
    payload['cognito:username'] = SESSION_USER;
    payload.email = SESSION_EMAIL;
    payload.email_verified = true;
    payload.aud = 'sealed';
  }
  return `${b64url({ alg: 'RS256', kid: 'sealed', typ: 'JWT' })}.${b64url(payload)}.sealed`;
}

/** A real token from the local trust root, for the unsealed @live project. */
async function mintReal(): Promise<{ access: string; id: string }> {
  const res = await fetch(`${GATEWAY}/local-auth/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ user: SESSION_USER }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) {
    throw new Error(
      `The local trust root would not mint a token (HTTP ${res.status}). The @live project needs the gateway on ${GATEWAY}; start it with ./scripts/start-local.sh, or run the sealed projects instead.`,
    );
  }
  const body = (await res.json()) as { access_token: string; id_token: string };
  return { access: body.access_token, id: body.id_token };
}

/**
 * Put a session in the page before anything renders.
 *
 * `addInitScript` rather than an `evaluate` after `goto`: RequireAuth decides
 * on the FIRST render, so a session written afterwards arrives one redirect
 * too late and the test lands on /login with no explanation.
 */
export async function signIn(page: Page, webUrl: string, sealed: boolean): Promise<void> {
  const id = await clientId(webUrl);
  const tokens = sealed
    ? { access: fakeJwt('access'), id: fakeJwt('id') }
    : await mintReal();

  await page.addInitScript(
    ({ clientId: cid, user, access, idToken }) => {
      try {
        const base = `CognitoIdentityServiceProvider.${cid}`;
        localStorage.setItem(`${base}.LastAuthUser`, user);
        localStorage.setItem(`${base}.${user}.accessToken`, access);
        localStorage.setItem(`${base}.${user}.idToken`, idToken);
        // Deliberately empty. The tokens are twelve hours fresh, so the library
        // reads them straight out; a refresh token would invite it to go to
        // Cognito over the network, which is the one thing that must not happen.
        localStorage.setItem(`${base}.${user}.refreshToken`, '');
        localStorage.setItem(`${base}.${user}.clockDrift`, '0');
      } catch { /* private mode: the test will fail on /login, which says enough */ }
    },
    { clientId: id, user: SESSION_USER, access: tokens.access, idToken: tokens.id },
  );
}

/** Wipe any session, for the tests that assert the signed-out doors. */
export async function signOut(page: Page): Promise<void> {
  await page.addInitScript(() => {
    try {
      for (const key of Object.keys(localStorage)) {
        if (key.startsWith('CognitoIdentityServiceProvider.') || key.startsWith('oidc.user:')) {
          localStorage.removeItem(key);
        }
      }
    } catch { /* nothing to clear */ }
  });
}
