/**
 * My Drive (gateway storage) client — the same S3-backed store the web app
 * uses, so a file uploaded on either head opens on both.
 *
 * Transport differs from the GraphQL client on purpose: storage is behind the
 * gateway and authenticates with the Cognito ACCESS token (Bearer). The
 * gateway strips client-supplied identity headers and derives the owner from
 * the token, so there is no x-user-id here by design.
 */
import { File as FSFile, UploadType } from 'expo-file-system';
import * as FileSystem from 'expo-file-system/legacy';
import * as SecureStore from 'expo-secure-store';

import { fetchWithTimeout } from '@pattadar/core';

import { COGNITO_CLIENT_ID, COGNITO_DOMAIN, TOKENS_KEY, type StoredTokens } from '@/auth/cognitoConfig';

const STORAGE_URL_KEY = 'pattadar_storage_url';

/** Baked at build time; overridable at runtime from Account → Server. */
export async function storageBase(): Promise<string> {
  const saved = await SecureStore.getItemAsync(STORAGE_URL_KEY).catch(() => null);
  return (saved || process.env.EXPO_PUBLIC_GATEWAY_URL || '').replace(/\/$/, '');
}

export async function setStorageBase(url: string): Promise<void> {
  await SecureStore.setItemAsync(STORAGE_URL_KEY, url.trim().replace(/\/$/, ''));
}

/**
 * Cognito access tokens last about an hour.
 *
 * This used to return '' the moment one expired, which meant file storage
 * silently stopped working roughly an hour after every sign-in and stayed
 * broken until someone happened to sign in again. Documents kept being filed
 * with no file behind them because the upload failure was swallowed. The
 * refresh token was already being stored — it just was never used.
 */
let refreshing: Promise<string> | null = null;

/** Exchange the refresh token for a new access token; '' when it cannot. */
async function refreshAccessToken(t: StoredTokens): Promise<string> {
  if (!t.refreshToken) return '';
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    client_id: COGNITO_CLIENT_ID,
    refresh_token: t.refreshToken,
  }).toString();
  const res = await fetchWithTimeout(
    `${COGNITO_DOMAIN}/oauth2/token`,
    { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body },
    20_000,
    'Sign-in refresh',
  ).catch(() => null);
  if (!res || !res.ok) return '';
  const json = (await res.json().catch(() => null)) as
    | { access_token?: string; id_token?: string; expires_in?: number }
    | null;
  if (!json?.access_token) return '';
  // Cognito does NOT return a new refresh token here — keep the existing one,
  // or the next refresh has nothing to work with.
  const next: StoredTokens = {
    ...t,
    accessToken: json.access_token,
    idToken: json.id_token ?? t.idToken,
    issuedAt: Date.now(),
    expiresIn: json.expires_in ?? 3600,
  };
  await SecureStore.setItemAsync(TOKENS_KEY, JSON.stringify(next)).catch(() => undefined);
  return json.access_token;
}

async function accessToken(): Promise<string> {
  const raw = await SecureStore.getItemAsync(TOKENS_KEY).catch(() => null);
  if (!raw) return '';
  let t: StoredTokens;
  try {
    t = JSON.parse(raw) as StoredTokens;
  } catch {
    return '';
  }
  // Refresh a minute early: a token that expires mid-upload is the same as an
  // expired one, and a large photo takes a while.
  const expired = !!t.issuedAt && !!t.expiresIn && Date.now() > t.issuedAt + t.expiresIn * 1000 - 60_000;
  if (!expired) return t.accessToken ?? '';
  // Several requests can discover expiry at once; they must not each start
  // their own refresh, because Cognito can rotate the token under them.
  refreshing = refreshing ?? refreshAccessToken(t).finally(() => {
    refreshing = null;
  });
  return refreshing;
}

/** True when this build can talk to storage at all (URL + a live token). */
export async function storageReady(): Promise<boolean> {
  return Boolean((await storageBase()) && (await accessToken()));
}

export class StorageAuthError extends Error {}

async function authHeaders(): Promise<Record<string, string>> {
  const token = await accessToken();
  if (!token) throw new StorageAuthError('Sign in again to use file storage.');
  return {
    Authorization: `Bearer ${token}`,
    'Bypass-Tunnel-Reminder': '1',
    'ngrok-skip-browser-warning': '1',
  };
}

export interface StorageNode {
  id: string;
  name: string;
  mimeType?: string;
  size?: number;
}

/**
 * Upload bytes to My Drive; the returned node id is stored as the doc fileRef.
 *
 * Streamed from disk by the OS rather than read into a JavaScript Blob first —
 * a scanned deed runs to 14 MB, and materialising that in JS killed the
 * connection mid-body while the app blamed the network. See `uploadDocument`
 * in api/client.ts for the full story.
 */
export async function uploadToDrive(
  uri: string,
  name: string,
  mimeType: string,
  onProgress?: (p: { sent: number; total: number }) => void,
): Promise<StorageNode> {
  const base = await storageBase();
  if (!base) throw new Error('File storage is not configured for this build.');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 240_000);
  let raw: { status: number; body: string };
  try {
    const task = new FSFile(uri).createUploadTask(
      `${base}/api/gateway/storage/files?appId=pattadar`,
      {
        httpMethod: 'POST',
        uploadType: UploadType.MULTIPART,
        fieldName: 'file',
        mimeType,
        headers: await authHeaders(),
        signal: controller.signal,
        onProgress: onProgress
          ? ({ bytesSent, totalBytes }) => onProgress({ sent: bytesSent, total: totalBytes })
          : undefined,
      },
    );
    const res = await task.uploadAsync();
    raw = { status: res.status, body: res.body };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/abort/i.test(msg)) throw new Error(`Uploading ${name} timed out after 240s. Try again.`);
    throw new Error(`Couldn’t upload ${name} — ${msg}`);
  } finally {
    clearTimeout(timer);
  }
  if (raw.status === 401 || raw.status === 403) throw new StorageAuthError('Sign in again to upload files.');
  let body: StorageNode & { error?: string };
  try {
    body = JSON.parse(raw.body || '{}');
  } catch {
    throw new Error(`Upload failed (HTTP ${raw.status}) — the server replied with something unreadable.`);
  }
  if (raw.status >= 400 || body.error) throw new Error(body.error || `Upload failed (HTTP ${raw.status})`);
  return body;
}

/**
 * Download a stored file into the app cache and return a local file:// URI a
 * viewer can render. Cached by node id so re-opening is instant and offline.
 */
export async function fetchDriveFile(nodeId: string, name: string): Promise<string> {
  const base = await storageBase();
  if (!base) throw new Error('File storage is not configured for this build.');
  const safe = `${nodeId}-${(name || 'file').replace(/[^\w.\-]/g, '_')}`;
  const dest = `${FileSystem.cacheDirectory}drive-${safe}`;
  const cached = await FileSystem.getInfoAsync(dest).catch(() => null);
  if (cached?.exists && (cached.size ?? 0) > 0) return dest;
  const headers = await authHeaders();
  const result = await FileSystem.downloadAsync(
    `${base}/api/gateway/storage/files/${encodeURIComponent(nodeId)}/content?format=web`,
    dest,
    { headers },
  );
  if (result.status === 401 || result.status === 403) {
    await FileSystem.deleteAsync(dest, { idempotent: true }).catch(() => undefined);
    throw new StorageAuthError('Sign in again to view files.');
  }
  if (result.status !== 200) {
    await FileSystem.deleteAsync(dest, { idempotent: true }).catch(() => undefined);
    throw new Error(`Could not download the file (HTTP ${result.status})`);
  }
  return dest;
}
