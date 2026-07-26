/**
 * API client seam for the Pattadar web-next app.
 *
 * Ported (partial) from apps/web/src/api/client.ts for task B3: only the
 * token-provider seam that src/auth/AuthProvider.tsx needs at compile time
 * (`GetAccessToken` / `setAccessTokenProvider` / `apiFetch`). The GraphQL
 * helpers (`gql`, GRAPHQL_PATH) are out of scope here — a later task ports
 * the full client and extends this file.
 *
 * All paths are GATEWAY-RELATIVE ('/api/...'): the browser never talks to a
 * service host directly.
 */

export type GetAccessToken = () => Promise<string | null>;

// The Cognito AuthProvider (src/auth/AuthProvider.tsx) injects the real
// provider at module load. In mock mode (no NEXT_PUBLIC_COGNITO_AUTHORITY)
// this default stays: local dev talks to the gateway without a token.
let getAccessToken: GetAccessToken = async () => null;

/** Inject the token source (called once at bootstrap). */
export function setAccessTokenProvider(provider: GetAccessToken): void {
  getAccessToken = provider;
}

/** fetch wrapper that attaches the Bearer token when one is available. */
export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const token = await getAccessToken();
  const headers = new Headers(init.headers);
  if (token) headers.set('Authorization', `Bearer ${token}`);
  return fetch(path, { ...init, headers });
}
