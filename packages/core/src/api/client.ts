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
  /** Absolute or app-relative URL of the GraphQL endpoint. */
  url: string;
  /** Extra headers per request (auth lives here). */
  headers?: HeadersProvider;
}

export interface GraphQLClient {
  gql: <T>(query: string, variables?: Record<string, unknown>) => Promise<T>;
}

export function createGraphQLClient(config: GraphQLClientConfig): GraphQLClient {
  return {
    async gql<T>(query: string, variables?: Record<string, unknown>): Promise<T> {
      const extra = config.headers ? await config.headers() : {};
      const res = await fetch(config.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...extra },
        body: JSON.stringify({ query, variables }),
      });
      if (!res.ok) throw new Error(`GraphQL HTTP ${res.status}`);
      const body = (await res.json()) as GraphQLResponse<T>;
      if (body.errors?.length) throw new Error(body.errors.map((e) => e.message).join('; '));
      if (body.data === undefined) throw new Error('GraphQL response had no data');
      return body.data;
    },
  };
}
