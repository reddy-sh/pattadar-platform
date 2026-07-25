/**
 * API client for the Pattadar web app.
 *
 * All paths are GATEWAY-RELATIVE ('/api/...'): the browser never talks to a
 * service host directly. In AWS, CloudFront routes '/api' to the ALB/gateway;
 * in local dev, the Vite proxy (vite.config.ts) forwards '/api' to the slim
 * gateway on localhost:8080. Keeping paths relative means one bundle works in
 * both environments with no runtime configuration.
 */

export type GetAccessToken = () => Promise<string | null>;

// The Cognito AuthProvider (src/auth/AuthProvider.tsx) injects the real
// provider at module load. In mock mode (no VITE_COGNITO_AUTHORITY) this
// default stays: local dev talks to the gateway without a token.
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

const GRAPHQL_PATH = '/api/gateway/pattadar/graphql';

interface GraphQLResponse<T> {
  data?: T;
  errors?: Array<{ message: string }>;
}

/** POST a GraphQL query to the pattadar service via the gateway. */
export async function gql<T>(query: string, variables?: Record<string, unknown>): Promise<T> {
  const res = await apiFetch(GRAPHQL_PATH, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) throw new Error(`GraphQL HTTP ${res.status}`);
  const body = (await res.json()) as GraphQLResponse<T>;
  if (body.errors?.length) throw new Error(body.errors.map((e) => e.message).join('; '));
  if (body.data === undefined) throw new Error('GraphQL response had no data');
  return body.data;
}
