/**
 * Write-side actions for the Passbooks and Land & Properties pages — the
 * exact mutations/endpoints the rhub pattadar app calls (RemoteApp.tsx,
 * shared.ts, PassbookCreateModal.tsx, AddPropertyModal.tsx).
 */
import { apiFetch, gql } from '../api/client';

// ── GraphQL mutation strings (verbatim from source) ──────────────────────
export const CREATE_PASSBOOK_MUT =
  'mutation($pattadarNo: String!, $ownerName: String!, $fatherHusbandName: String!, $state: String!, $district: String!, $mandal: String!, $village: String!) { createPassbook(pattadarNo: $pattadarNo, ownerName: $ownerName, fatherHusbandName: $fatherHusbandName, state: $state, district: $district, mandal: $mandal, village: $village) { id } }';

export const CREATE_PARCEL_MUT =
  'mutation($passbookId: String!, $surveyNo: String!, $subdivision: String!, $extent: Float!, $unit: String!, $classification: String!, $acquisitionSource: String!, $source: String!) { createParcel(passbookId: $passbookId, surveyNo: $surveyNo, subdivision: $subdivision, extent: $extent, unit: $unit, classification: $classification, acquisitionSource: $acquisitionSource, source: $source) { id } }';

export const CREATE_PARCEL_MANUAL_MUT =
  'mutation($passbookId: String!, $surveyNo: String!, $subdivision: String!, $extent: Float!, $unit: String!, $classification: String!, $acquisitionSource: String!) { createParcel(passbookId: $passbookId, surveyNo: $surveyNo, subdivision: $subdivision, extent: $extent, unit: $unit, classification: $classification, acquisitionSource: $acquisitionSource) { id } }';

export const CREATE_DOCUMENT_MUT =
  'mutation($parcelId:String!,$passbookId:String!,$propertyId:String!,$docType:String!,$fileRef:String!,$docNo:String!,$sroCode:String!,$regYear:String!,$source:String!,$tags:String!){ createDocument(parcelId:$parcelId,passbookId:$passbookId,propertyId:$propertyId,docType:$docType,fileRef:$fileRef,docNo:$docNo,sroCode:$sroCode,regYear:$regYear,source:$source,tags:$tags){ id } }';

export const CREATE_PROPERTY_MUT =
  'mutation($type:String!,$label:String!,$city:String,$district:String,$landArea:Float,$landUnit:String,$builtupArea:Float,$builtupUnit:String,$acquisitionMode:String,$attributes:String,$purchasePrice:Float,$purchaseDate:String,$regDocNo:String,$sro:String,$regDate:String,$sellerName:String,$buyerName:String){ createProperty(type:$type,label:$label,city:$city,district:$district,landArea:$landArea,landUnit:$landUnit,builtupArea:$builtupArea,builtupUnit:$builtupUnit,acquisitionMode:$acquisitionMode,attributes:$attributes,purchasePrice:$purchasePrice,purchaseDate:$purchaseDate,regDocNo:$regDocNo,sro:$sro,regDate:$regDate,sellerName:$sellerName,buyerName:$buyerName){ id } }';

// ── My Drive mirror ──────────────────────────────────────────────────────

/** Upload a file to My Drive (appId=pattadar); returns node id or "". */
export async function mirrorToDrive(file: File): Promise<string> {
  try {
    const fd = new FormData();
    fd.append('file', file);
    const res = await apiFetch('/api/gateway/storage/files?appId=pattadar', {
      method: 'POST',
      body: fd,
    });
    if (!res.ok) return '';
    const node = (await res.json()) as { id?: string };
    return node?.id || '';
  } catch {
    return '';
  }
}

// ── delete flows (files → Trash, rows removed) ───────────────────────────

interface DocRef {
  id: string;
  fileRef?: string;
}

/**
 * Deleting a parcel / property / passbook also moves its My Drive files to
 * Trash (soft-delete via the storage API) and, when the API delete doesn't
 * cascade the rows itself, removes the document records. Best-effort — a
 * failed trash never blocks the delete.
 */
export async function trashDocuments(docs: DocRef[], opts?: { keepRows?: boolean }): Promise<void> {
  await Promise.all(
    docs.map(async (d) => {
      if (d.fileRef) {
        try {
          await apiFetch(`/api/gateway/storage/nodes/${d.fileRef}`, { method: 'DELETE' });
        } catch {
          /* best-effort */
        }
      }
      if (!opts?.keepRows) {
        try {
          await gql('mutation($id:String!){ deleteDocument(id:$id) }', { id: d.id });
        } catch {
          /* best-effort */
        }
      }
    }),
  );
}

/** Delete a passbook: its docs (khata-level AND parcel-level) first, then the row. */
export async function deletePassbook(id: string): Promise<void> {
  const d = await gql<{ passbookDocuments: DocRef[] }>(
    'query($id:String!){ passbookDocuments(passbookId:$id){ id fileRef } }',
    { id },
  ).catch(() => ({ passbookDocuments: [] as DocRef[] }));
  await trashDocuments(d?.passbookDocuments ?? []);
  await gql('mutation($id: String!) { deletePassbook(id: $id) }', { id });
}

/** Delete a parcel: doc rows must go before the parcel (ownership checks). */
export async function deleteParcel(id: string): Promise<void> {
  const d = await gql<{ documents: (DocRef & { parcelId: string })[] }>(
    'query { documents { id parcelId fileRef } }',
  ).catch(() => ({ documents: [] as (DocRef & { parcelId: string })[] }));
  await trashDocuments((d?.documents ?? []).filter((x) => x.parcelId === id));
  await gql('mutation($id: String!) { deleteParcel(id: $id) }', { id });
}

/** Delete a property (API cascades rows; files still trashed). */
export async function deleteProperty(id: string): Promise<void> {
  const d = await gql<{ propertyDocuments: DocRef[] }>(
    'query($id:String!){ propertyDocuments(propertyId:$id){ id fileRef } }',
    { id },
  ).catch(() => ({ propertyDocuments: [] as DocRef[] }));
  await gql('mutation($id: String!) { deleteProperty(id: $id) }', { id });
  await trashDocuments(d?.propertyDocuments ?? [], { keepRows: true });
}

/** Record my relationship to a holding (owned / managed / watch). */
export async function setStake(kind: 'parcel' | 'property', id: string, stake: string): Promise<boolean> {
  const r = await gql<{ setStake: boolean }>(
    'mutation($k:String!,$id:String!,$s:String!){ setStake(kind:$k, id:$id, stake:$s) }',
    { k: kind, id, s: stake },
  ).catch(() => ({ setStake: false }));
  return !!r?.setStake;
}
