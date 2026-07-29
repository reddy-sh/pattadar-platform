/**
 * Full session teardown (H-1).
 *
 * Sign-out used to only clear the identity pointer (`setIdentity('')`) and
 * invalidate queries — the Cognito tokens in SecureStore were never touched,
 * so a "signed-out" app could still mint a fresh access token and hit
 * storage as that user, and stale-but-cached PII stayed in the query cache.
 *
 * This clears every per-user key this app owns, wipes locally cached
 * document bytes and the profile photo, and best-effort revokes the refresh
 * token so it cannot be replayed even if it leaked off-device before this
 * ran. Revocation never blocks or fails sign-out — the user must always be
 * able to leave.
 *
 * Does NOT touch the query cache or navigate: the caller does
 * `queryClient.clear()` (not `invalidateQueries`, which only marks entries
 * stale rather than evicting them) and routes away once this resolves.
 */
import * as SecureStore from 'expo-secure-store';

import { setIdentity } from '@/api/client';
import { clearCachedFiles, STORAGE_URL_KEY } from '@/api/storage';
import { COGNITO_CLIENT_ID, COGNITO_DOMAIN, TOKENS_KEY, type StoredTokens } from '@/auth/cognitoConfig';
import { clearAvatarFile } from '@/lib/avatar';

/** RFC 7009 token revocation against the Cognito hosted UI's own endpoint —
 * never surfaced to the user, just a background POST. */
async function revokeRefreshToken(): Promise<void> {
  const raw = await SecureStore.getItemAsync(TOKENS_KEY).catch(() => null);
  if (!raw) return;
  let tokens: StoredTokens;
  try {
    tokens = JSON.parse(raw) as StoredTokens;
  } catch {
    return;
  }
  if (!tokens.refreshToken) return;
  const body = new URLSearchParams({
    token: tokens.refreshToken,
    client_id: COGNITO_CLIENT_ID,
  }).toString();
  await fetch(`${COGNITO_DOMAIN}/oauth2/revoke`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  }).catch(() => undefined);
}

export async function signOut(): Promise<void> {
  // Read + revoke the refresh token before it is deleted below.
  await revokeRefreshToken();
  await Promise.all([
    SecureStore.deleteItemAsync(TOKENS_KEY).catch(() => undefined),
    setIdentity(''),
    SecureStore.deleteItemAsync(STORAGE_URL_KEY).catch(() => undefined),
    clearAvatarFile(),
    clearCachedFiles(),
  ]);
}
