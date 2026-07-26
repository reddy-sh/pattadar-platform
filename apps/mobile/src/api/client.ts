/**
 * Mobile GraphQL client instance.
 *
 * Local dev (start-mobile.sh): EXPO_PUBLIC_API_URL points at the pattadar API
 * (http://127.0.0.1:8080 for the simulator) and EXPO_PUBLIC_DEV_USER rides the
 * x-user-id header — the exact trust model the web Vite proxy uses locally.
 * The header is only attached in __DEV__ bundles; a release build never sends it.
 *
 * Production (TODO Phase 4): EXPO_PUBLIC_API_URL becomes
 * https://pattadar.com/api/gateway/pattadar and the headers provider returns
 * the Cognito Bearer token from expo-secure-store once the native app client
 * exists in the pool.
 */
import { createGraphQLClient } from '@pattadar/core';

const base = process.env.EXPO_PUBLIC_API_URL ?? '';
const devUser = process.env.EXPO_PUBLIC_DEV_USER ?? '';

/** True when a backend URL was provided at bundle time. */
export const hasApi = base.length > 0;

export const api = createGraphQLClient({
  url: `${base}/graphql`,
  headers: () => {
    const h: Record<string, string> = {};
    if (__DEV__ && devUser) h['x-user-id'] = devUser;
    return h;
  },
});
