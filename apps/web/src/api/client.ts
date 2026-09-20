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

/** What every screen says when the gateway stops accepting the session. */
export const SESSION_ENDED_MESSAGE = 'Your session has ended — sign in again.';

// The auth provider (src/auth/AuthProvider.tsx) registers the real handler.
// Until it does, a 401 is simply the response the caller already handles.
let onUnauthorized: () => void = () => {};

/**
 * Register the session-expiry handler. A 401 from the gateway means the tokens
 * in this tab no longer buy a session, and only the auth layer can clear it and
 * route back to sign-in — without this, every panel renders an HTTP 401 behind
 * a Try again that can never succeed.
 */
export function setUnauthorizedHandler(handler: () => void): void {
  onUnauthorized = handler;
}

export interface ApiRequestInit extends RequestInit {
  /** A per-operation deadline; caller cancellation is always honored. */
  timeoutMs?: number;
}

const ASYNC_READS = new Set([
  '/api/gateway/pattadar/import-registered-document',
  '/api/gateway/pattadar/import-passbook',
  '/api/gateway/pattadar/extract-property',
  '/api/gateway/pattadar/extract-aadhaar',
]);

export function requestTimeoutMs(path: string, init: ApiRequestInit): number {
  if (init.timeoutMs !== undefined) return init.timeoutMs;
  if (init.body instanceof FormData || /\/content(?:\?|$)|\/chat\/stream(?:\?|$)/.test(path)) return 600_000;
  return 20_000;
}

function pause(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    signal.throwIfAborted();
    const abort = () => { clearTimeout(timer); reject(signal.reason); };
    const timer = setTimeout(() => { signal.removeEventListener('abort', abort); resolve(); }, ms);
    signal.addEventListener('abort', abort, { once: true });
  });
}

/** Keep existing import callers compatible while the expensive reading happens
 * in a durable server job. Each HTTP response is short enough for CloudFront. */
async function readAsync(path: string, init: ApiRequestInit): Promise<Response> {
  const deadline = AbortSignal.timeout(init.timeoutMs ?? 900_000);
  const signal = init.signal ? AbortSignal.any([init.signal, deadline]) : deadline;
  const started = await apiFetch(`${path}-async`, { ...init, signal });
  if (!started.ok) return started;
  const receipt = await started.json() as { job?: string };
  if (!receipt.job) throw new Error('The document reader did not return a reading receipt.');
  const statusPath = `/api/gateway/pattadar/import-status/${encodeURIComponent(receipt.job)}`;
  while (true) {
    signal.throwIfAborted();
    const response = await apiFetch(statusPath, { signal });
    if (!response.ok) return response;
    const body = await response.json() as { state?: string; error?: string };
    if (body.state === 'done') return Response.json(body);
    if (body.state === 'failed') return Response.json(body, { status: 422 });
    if (body.state !== 'running' && body.state !== 'queued') throw new Error('The reading returned an unexpected status.');
    await pause(1_500, signal);
  }
}

/** fetch wrapper that attaches the Bearer token when one is available. */
export async function apiFetch(path: string, init: ApiRequestInit = {}): Promise<Response> {
  if (ASYNC_READS.has(path) && (init.method || 'GET').toUpperCase() === 'POST') return readAsync(path, init);
  const { timeoutMs: _timeoutMs, ...requestInit } = init;
  const token = await getAccessToken();
  const headers = new Headers(init.headers);
  if (token) headers.set('Authorization', `Bearer ${token}`);
  const deadline = AbortSignal.timeout(requestTimeoutMs(path, init));
  const signal = init.signal ? AbortSignal.any([init.signal, deadline]) : deadline;
  try {
    const response = await fetch(path, { ...requestInit, headers, signal });
    if (response.status === 401) onUnauthorized();
    return response;
  } catch (e) {
    // TimeoutError is what `AbortSignal.timeout` throws, and "signal is aborted
    // without reason" is not a sentence to put in front of an owner.
    if (e instanceof DOMException && e.name === 'TimeoutError') {
      throw new Error('The server did not answer in time.');
    }
    throw e;
  }
}

const GRAPHQL_PATH = '/api/gateway/pattadar/graphql';

/** Keep actionable server errors (for example consent or size limits) in the
 * calling screen, with a fallback for proxy HTML and empty responses. */
export async function apiErrorMessage(response: Response, fallback: string): Promise<string> {
  try {
    const body = await response.clone().json();
    for (const value of [body?.detail?.message, body?.detail, body?.error, body?.message]) {
      if (typeof value === 'string' && value.trim()) return value;
    }
  } catch { /* A proxy may return an HTML error page. */ }
  return fallback;
}

interface GraphQLResponse<T> {
  data?: T;
  errors?: Array<{ message: string; extensions?: { code?: string } }>;
}

/** A GraphQL failure, carrying the server's machine-readable code when it sent
 *  one, so a screen can branch on the code instead of on English prose. */
export class GraphQLRequestError extends Error {
  readonly code?: string;

  constructor(message: string, code?: string) {
    super(message);
    this.name = 'GraphQLRequestError';
    this.code = code;
  }
}

/** POST a GraphQL query to the pattadar service via the gateway. */
export async function gql<T>(query: string, variables?: Record<string, unknown>): Promise<T> {
  const res = await apiFetch(GRAPHQL_PATH, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  });
  // The 401 sentence is what the owner reads in the error card while the auth
  // layer takes them back to sign-in; an HTTP status is not that sentence.
  if (res.status === 401) throw new Error(SESSION_ENDED_MESSAGE);
  if (!res.ok) throw new Error(`GraphQL HTTP ${res.status}`);
  const body = (await res.json()) as GraphQLResponse<T>;
  if (body.errors?.length) {
    throw new GraphQLRequestError(
      body.errors.map((e) => e.message).join('; '),
      body.errors.find((e) => e.extensions?.code)?.extensions?.code,
    );
  }
  if (body.data === undefined) throw new Error('GraphQL response had no data');
  return body.data;
}
