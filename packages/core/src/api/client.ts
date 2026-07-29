/**
 * Environment-agnostic GraphQL client — the ONE transport both heads use.
 *
 * The web app talks to the gateway-relative path ('/api/gateway/pattadar/graphql',
 * proxied by Vite locally and CloudFront in AWS) with a Cognito Bearer token.
 * The mobile app talks to an absolute URL (EXPO_PUBLIC_API_URL) with either a
 * Cognito Bearer token (production) or a dev-only x-user-id header (local).
 * Both differences are injected here as config — operations never know.
 */

export interface GraphQLError {
  message: string;
}

interface GraphQLResponse<T> {
  data?: T;
  errors?: GraphQLError[];
}

export type HeadersProvider = () =>
  | Promise<Record<string, string>>
  | Record<string, string>;

export interface GraphQLClientConfig {
  /** Deadline per request; defaults to 20s. */
  timeoutMs?: number;
  /** Absolute or app-relative URL of the GraphQL endpoint — or a provider so
   * clients can change servers at runtime (mobile dev connection). */
  url: string | (() => string | Promise<string>);
  /** Extra headers per request (auth lives here). */
  headers?: HeadersProvider;
}

/** No request may hang forever: without a deadline an unreachable server
 * (dead tunnel, wrong saved URL, flight mode) shows an eternal spinner and
 * looks like the app is broken. */
export async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number,
  label: string,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (e) {
    const aborted = e instanceof Error && (e.name === 'AbortError' || /abort/i.test(e.message));
    const host = (() => {
      try {
        return new URL(url).host;
      } catch {
        return url;
      }
    })();
    if (aborted) {
      throw new Error(`${label} timed out after ${Math.round(timeoutMs / 1000)}s — ${host} did not respond. Check Account → Server connection.`);
    }
    throw new Error(`Can't reach ${host}. Check Account → Server connection.`);
  } finally {
    clearTimeout(timer);
  }
}

export interface GraphQLClient {
  gql: <T>(query: string, variables?: Record<string, unknown>) => Promise<T>;
}

export function createGraphQLClient(config: GraphQLClientConfig): GraphQLClient {
  return {
    async gql<T>(query: string, variables?: Record<string, unknown>): Promise<T> {
      const extra = config.headers ? await config.headers() : {};
      const url = typeof config.url === 'function' ? await config.url() : config.url;
      const res = await fetchWithTimeout(
        url,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...extra },
          body: JSON.stringify({ query, variables }),
        },
        config.timeoutMs ?? 20_000,
        'Request',
      );
      if (!res.ok) throw new Error(`GraphQL HTTP ${res.status}`);
      const body = (await res.json()) as GraphQLResponse<T>;
      if (body.errors?.length) throw new Error(body.errors.map((e) => e.message).join('; '));
      if (body.data === undefined) throw new Error('GraphQL response had no data');
      return body.data;
    },
  };
}
