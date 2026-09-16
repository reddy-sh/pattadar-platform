import * as SecureStore from 'expo-secure-store';
import { fetchWithTimeout } from '@pattadar/core';
import { COGNITO_CLIENT_ID, COGNITO_DOMAIN, TOKENS_KEY, type StoredTokens } from './cognitoConfig';

let generation = 0;
let writes: Promise<void> = Promise.resolve();
function persist(write: () => Promise<void>): Promise<void> {
  const next = writes.catch(() => undefined).then(write);
  writes = next;
  return next;
}
let refreshing: { raw: string; promise: Promise<string> } | null = null;

export async function storeTokens(tokens: StoredTokens): Promise<void> {
  generation++;
  refreshing = null;
  await persist(() => SecureStore.setItemAsync(TOKENS_KEY, JSON.stringify(tokens)));
}

export async function clearTokens(): Promise<void> {
  generation++;
  refreshing = null;
  await persist(() => SecureStore.deleteItemAsync(TOKENS_KEY));
}

async function refresh(tokens: StoredTokens, raw: string, epoch: number): Promise<string> {
  if (!tokens.refreshToken) return '';
  const response = await fetchWithTimeout(`${COGNITO_DOMAIN}/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'refresh_token', client_id: COGNITO_CLIENT_ID,
      refresh_token: tokens.refreshToken }).toString(),
  }, 20_000, 'Sign-in refresh').catch(() => null);
  if (!response?.ok) return '';
  const result = await response.json().catch(() => null) as {
    access_token?: string; id_token?: string; expires_in?: number;
  } | null;
  if (!result?.access_token || generation !== epoch) return '';
  if (await SecureStore.getItemAsync(TOKENS_KEY) !== raw || generation !== epoch) return '';
  await persist(async () => {
    if (generation !== epoch) return;
    await SecureStore.setItemAsync(TOKENS_KEY, JSON.stringify({ ...tokens,
    accessToken: result.access_token, idToken: result.id_token ?? tokens.idToken,
    issuedAt: Date.now(), expiresIn: result.expires_in ?? 3600,
    }));
  });
  return generation === epoch ? result.access_token : '';
}

/** Shared single-flight refresh for GraphQL, extraction and file storage. */
export async function accessToken(): Promise<string> {
  const epoch = generation;
  const raw = await SecureStore.getItemAsync(TOKENS_KEY).catch(() => null);
  if (!raw || epoch !== generation) return '';
  let tokens: StoredTokens;
  try { tokens = JSON.parse(raw) as StoredTokens; } catch { return ''; }
  // Older Expo sign-ins stored issuedAt in seconds; accept and normalize both.
  const issued = (tokens.issuedAt ?? 0) < 1e12 ? (tokens.issuedAt ?? 0) * 1000 : tokens.issuedAt!;
  if (issued && tokens.expiresIn && Date.now() < issued + tokens.expiresIn * 1000 - 60_000) {
    return tokens.accessToken ?? '';
  }
  if (refreshing?.raw === raw) return refreshing.promise;
  const promise = refresh(tokens, raw, epoch).catch(() => '').finally(() => {
    if (refreshing?.promise === promise) refreshing = null;
  });
  refreshing = { raw, promise };
  return promise;
}
