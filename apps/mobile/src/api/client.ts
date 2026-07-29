/**
 * Mobile GraphQL client instance.
 *
 * Local dev (start-mobile.sh): EXPO_PUBLIC_API_URL points at the pattadar API
 * (http://127.0.0.1:8080 for the simulator) and EXPO_PUBLIC_DEV_USER rides the
 * x-user-id header — the exact trust model the web Vite proxy uses locally.
 *
 * The x-user-id header is sent from EVERY bundle, release included. This file
 * used to claim otherwise; the code never gated it, and gating it now would
 * lock the phone out, because the on-device build is a Release build and the
 * API has no Cognito path yet. Remove the header in the same change that adds
 * the Bearer token below — not before.
 *
 * Production (TODO Phase 4): EXPO_PUBLIC_API_URL becomes
 * https://pattadar.com/api/gateway/pattadar and the headers provider returns
 * the Cognito Bearer token from expo-secure-store once the native app client
 * exists in the pool.
 */
import { File as FSFile, UploadType } from 'expo-file-system';
import * as SecureStore from 'expo-secure-store';

import { createGraphQLClient, fetchWithTimeout, type Classification } from '@pattadar/core';

const base = process.env.EXPO_PUBLIC_API_URL ?? '';
const devUser = process.env.EXPO_PUBLIC_DEV_USER ?? '';

// Runtime identity (dev sign-in) — replaced by Cognito tokens when the native
// app client ships. Stored in the Keychain; sign-out clears it.
let runtimeUser: string | null | undefined;
export async function getIdentity(): Promise<string> {
  if (runtimeUser === undefined) {
    runtimeUser = (await SecureStore.getItemAsync('pattadar_identity').catch(() => null)) || null;
  }
  return runtimeUser || devUser;
}
export async function setIdentity(uid: string): Promise<void> {
  const clean = uid.trim().toLowerCase();
  runtimeUser = clean || null;
  if (clean) await SecureStore.setItemAsync('pattadar_identity', clean).catch(() => undefined);
  else await SecureStore.deleteItemAsync('pattadar_identity').catch(() => undefined);
}

// Runtime server override (Account → Dev connection) — survives restarts and
// beats the bundle-time EXPO_PUBLIC_API_URL, so switching to a tunnel URL
// never needs a rebuild.
let runtimeBase: string | null | undefined;
export async function apiBase(): Promise<string> {
  if (runtimeBase === undefined) {
    runtimeBase = (await SecureStore.getItemAsync('pattadar_api_url').catch(() => null)) || null;
  }
  return runtimeBase || base;
}
export async function setApiBase(url: string): Promise<void> {
  const clean = url.trim().replace(/\/+$/, '');
  runtimeBase = clean || null;
  if (clean) await SecureStore.setItemAsync('pattadar_api_url', clean).catch(() => undefined);
  else await SecureStore.deleteItemAsync('pattadar_api_url').catch(() => undefined);
}

/** The URL actually in use, for showing in a failure message. */
export async function activeApiBase(): Promise<string> {
  return apiBase();
}

const health = async (url: string): Promise<boolean> => {
  if (!url) return false;
  const res = await fetchWithTimeout(
    `${url}/health`,
    { headers: { 'Bypass-Tunnel-Reminder': '1', 'ngrok-skip-browser-warning': '1' } },
    6_000,
    'Server check',
  ).catch(() => null);
  return !!res && res.ok;
};

/**
 * Drop a saved server override that no longer answers.
 *
 * The override exists so a tunnel URL can change without a rebuild — but it
 * outlives the tunnel that justified it, and then every screen reports "can't
 * reach the server" while the address baked into the build works perfectly.
 * The app was pointing at a dead host and had no way back: the panel that sets
 * this address is itself behind a seven-tap gate in a release build.
 *
 * Only ever falls back TO the build's own address, and only when the override
 * is dead and that address is alive — so it cannot hijack a deliberate choice,
 * and it does nothing at all when the phone is simply offline.
 */
export async function healApiBase(): Promise<string> {
  const current = await apiBase();
  if (!runtimeBase || runtimeBase === base || !base) return current;
  if (await health(runtimeBase)) return current;
  if (!(await health(base))) return current; // offline, not misconfigured
  await setApiBase('');
  return base;
}

/** True when a backend URL was provided at bundle time. */
export const hasApi = base.length > 0;

export const api = createGraphQLClient({
  url: async () => `${await apiBase()}/graphql`,
  headers: async () => {
    const h: Record<string, string> = { 'Bypass-Tunnel-Reminder': '1', 'ngrok-skip-browser-warning': '1' };
    const uid = await getIdentity();
    if (uid) h['x-user-id'] = uid;
    return h;
  },
});

/** Parcel row extracted from a passbook photo (snake_case wire → camel). */
export interface ImportedParcel {
  surveyNo: string;
  subdivision: string;
  extent: number;
  unit: string;
  classification: string;
  acquisitionSource: string;
}

export interface PassbookImportResult {
  pattadarNo: string;
  ownerName: string;
  fatherHusbandName: string;
  state: string;
  district: string;
  mandal: string;
  village: string;
  parcels: ImportedParcel[];
  confidence: string;
}

/**
 * A read that produced no fields is a FAILURE, not an empty success.
 *
 * The API used to answer 200 with `{"fields": {}}` when the model returned
 * nothing, so the app prefilled nothing and the form sat there looking
 * untouched — indistinguishable from the button not working. The API now says
 * so itself; this is the belt to that braces, and covers any older API a phone
 * happens to be pointed at.
 */
function requireFields(fields: Record<string, unknown> | undefined, what: string): Record<string, unknown> {
  const f = fields ?? {};
  if (Object.keys(f).length === 0) {
    throw new Error(
      `Nothing could be read from this ${what}. Try a clearer copy or photograph the pages with the details, or enter them by hand.`,
    );
  }
  return f;
}

/** The native upload returns a body string; a non-JSON body is a fault too. */
function parseJson(body: string): { fields?: Record<string, unknown>; error?: string } {
  try {
    return JSON.parse(body || '{}');
  } catch {
    return { error: `The server replied with something that isn’t a result: ${body.slice(0, 120)}` };
  }
}

/** Progress of a document upload, for an honest "12 of 14 MB" line. */
export interface UploadProgress {
  sent: number;
  total: number;
}

/**
 * Upload a file the phone can actually manage: streamed from disk by the OS.
 *
 * The previous implementation did `await (await fetch(uri)).blob()` and handed
 * the Blob to `fetch` — which materialises the ENTIRE document in JavaScript
 * memory. A 14 MB scanned deed announced `Content-Length: 14439321` and then
 * died mid-body: ngrok logged the request with status 0 and duration 0, and the
 * app reported "Can't reach the server" for a server it had queried
 * successfully twenty seconds earlier.
 *
 * `File.createUploadTask` hands the path to NSURLSession, which streams it
 * without ever loading it into JS, and reports real byte progress — so the wait
 * shows how far along it is instead of a spinner and a stopwatch.
 */
async function uploadDocument(
  path: string,
  uri: string,
  name: string,
  mimeType: string,
  label: string,
  timeoutMs: number,
  onProgress?: (p: UploadProgress) => void,
): Promise<{ status: number; body: string }> {
  const headers: Record<string, string> = {
    'Bypass-Tunnel-Reminder': '1',
    'ngrok-skip-browser-warning': '1',
  };
  const uid = await getIdentity();
  if (uid) headers['x-user-id'] = uid;
  const base = await apiBase();
  const url = `${base}${path}`;
  const host = (() => {
    try {
      return new URL(url).host;
    } catch {
      return url;
    }
  })();

  // The deadline covers the upload AND the model's read of it, which is the
  // slow half — a 14 MB deed takes the better part of two minutes end to end.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const task = new FSFile(uri).createUploadTask(url, {
      httpMethod: 'POST',
      uploadType: UploadType.MULTIPART,
      fieldName: 'file',
      mimeType,
      headers,
      signal: controller.signal,
      onProgress: onProgress
        ? ({ bytesSent, totalBytes }) => onProgress({ sent: bytesSent, total: totalBytes })
        : undefined,
    });
    const res = await task.uploadAsync();
    return { status: res.status, body: res.body };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/abort/i.test(msg)) {
      throw new Error(
        `${label} timed out after ${Math.round(timeoutMs / 1000)}s — ${host} did not finish. Try again, or enter the details by hand.`,
      );
    }
    // Name the file and the underlying fault. "Can't reach the server" was
    // wrong here and sent the search in the wrong direction entirely.
    throw new Error(`Couldn’t send ${name} to ${host} — ${msg}`);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * AI passbook import — POST /import-passbook (multipart, single 'file'
 * field; PDF/JPG/PNG ≤ 8 MB). Extract-only: persists nothing; the caller
 * creates the passbook + parcels via mutations afterwards. Response fields
 * are snake_case (LLM-defined), mapped to camelCase here.
 */
export async function importPassbookImage(
  uri: string,
  name: string,
  mimeType: string,
  onProgress?: (p: UploadProgress) => void,
): Promise<PassbookImportResult> {
  const res = await uploadDocument(
    '/import-passbook',
    uri,
    name,
    mimeType,
    'Reading the passbook',
    240_000,
    onProgress,
  );
  const body = parseJson(res.body);
  if (res.status >= 400 || body.error) {
    throw new Error(body.error || `Import failed (HTTP ${res.status})`);
  }
  const f = requireFields(body.fields, 'passbook');
  const rawParcels = Array.isArray(f.parcels) ? (f.parcels as Record<string, unknown>[]) : [];
  return {
    pattadarNo: String(f.pattadar_no ?? ''),
    ownerName: String(f.owner_name ?? ''),
    fatherHusbandName: String(f.father_husband_name ?? ''),
    state: String(f.state ?? ''),
    district: String(f.district ?? ''),
    mandal: String(f.mandal ?? ''),
    village: String(f.village ?? ''),
    confidence: String(f.confidence ?? ''),
    parcels: rawParcels.map((p) => ({
      surveyNo: String(p.survey_no ?? ''),
      subdivision: String(p.subdivision ?? ''),
      extent: Number(p.extent) || 0,
      unit: String(p.unit ?? 'Acres-Guntas'),
      classification: String(p.classification ?? 'agri'),
      acquisitionSource: String(p.acquisition_source ?? ''),
    })),
  };
}

/** AI deed/document read — POST /import-registered-document (extract-only,
 * multipart 'file', PDF/JPG/PNG ≤ 25 MB). Returns the snake_case fields
 * object verbatim — it becomes createRegisteredDocument's payload. */
export async function importRegisteredDocument(
  uri: string,
  name: string,
  mimeType: string,
  onProgress?: (p: UploadProgress) => void,
): Promise<Record<string, unknown>> {
  const res = await uploadDocument(
    '/import-registered-document',
    uri,
    name,
    mimeType,
    'Reading the document',
    240_000,
    onProgress,
  );
  const body = parseJson(res.body);
  if (res.status >= 400 || body.error) throw new Error(body.error || `Import failed (HTTP ${res.status})`);
  return requireFields(body.fields, 'document');
}

/** Aadhaar KYC extraction. The image is streamed to our API for reading and is
 * deliberately NOT copied into the app's local file store — unlike deeds and
 * passbooks, an ID card should not linger on the device. */
export async function extractAadhaar(
  uri: string,
  name: string,
  mimeType: string,
): Promise<Record<string, unknown>> {
  const res = await uploadDocument('/extract-aadhaar', uri, name, mimeType, 'Reading the Aadhaar', 120_000);
  const body = parseJson(res.body);
  if (res.status >= 400 || body.error) throw new Error(body.error || `Could not read the Aadhaar (HTTP ${res.status})`);
  return requireFields(body.fields, 'Aadhaar');
}

/**
 * Classify a picture before it is stored (CL-600..604).
 *
 * The image is sent for classification and written nowhere by the server —
 * this call exists so that an identity document can be refused BEFORE it
 * reaches the photo store. A failure returns null rather than throwing: the
 * classifier being unreachable must not stop someone recording their land.
 */
export async function classifyParcelPhoto(
  uri: string,
  name: string,
  mimeType: string,
): Promise<Classification | null> {
  try {
    const res = await uploadDocument(
      '/classify-parcel-photo',
      uri,
      name,
      mimeType,
      'Checking the photo',
      45_000,
    );
    if (res.status >= 400) return null;
    const body = JSON.parse(res.body || 'null') as Classification | null;
    return body && typeof body.kind === 'string' ? body : null;
  } catch {
    return null;
  }
}
