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
 * AI passbook import — POST /import-passbook (multipart, single 'file'
 * field; PDF/JPG/PNG ≤ 8 MB). Extract-only: persists nothing; the caller
 * creates the passbook + parcels via mutations afterwards. Response fields
 * are snake_case (LLM-defined), mapped to camelCase here.
 */
export async function importPassbookImage(
  uri: string,
  name: string,
  mimeType: string,
): Promise<PassbookImportResult> {
  const form = new FormData();
  // React Native's FormData takes a {uri, name, type} descriptor for files.
  form.append('file', { uri, name, type: mimeType } as unknown as Blob);
  const headers: Record<string, string> = {};
  if (__DEV__ && devUser) headers['x-user-id'] = devUser;
  const res = await fetch(`${base}/import-passbook`, { method: 'POST', headers, body: form });
  const body = (await res.json().catch(() => ({}))) as {
    fields?: Record<string, unknown>;
    error?: string;
  };
  if (!res.ok || body.error) {
    throw new Error(body.error || `Import failed (HTTP ${res.status})`);
  }
  const f = (body.fields ?? {}) as Record<string, unknown>;
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
