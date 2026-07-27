/**
 * My-Drive storage helpers for the Documents page — the exact endpoints the
 * rhub pattadar app calls (shared.ts trashDocuments, driveFolders.ts
 * nestUnderPattadar, FilesPanel/DocumentsTable blob + node lookups). All
 * best-effort: in local dev the storage service may be absent and every
 * helper degrades gracefully.
 */
import { apiFetch, gql } from '../../api/client';

/** Legacy document rows sometimes hold a raw FILENAME in fileRef instead of a
 * storage node UUID (pre-migration data). Guard every storage call — a
 * non-UUID ref can never resolve and must not be treated as an outage. */
export const isStorageRef = (ref: string | undefined | null): ref is string =>
  !!ref && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(ref);

/**
 * The one clear message every upload surface shows when the storage gateway
 * is unreachable (local dev has no cloud storage) — never N error toasts.
 */
export const STORAGE_OFFLINE_MSG =
  'File storage runs on the cloud gateway — uploads work on pattadar.com; local preview shows metadata only';

/** Upload a file to My Drive (appId=pattadar). Returns the node id or ''. */
export async function uploadToDrive(file: File): Promise<string> {
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

/** Fetch a stored file's bytes (preview/download). Throws when unavailable. */
export async function fetchFileBlob(fileRef: string): Promise<Blob> {
  if (!isStorageRef(fileRef)) throw new Error('legacy-ref');
  const res = await apiFetch(`/api/gateway/storage/files/${fileRef}/content`);
  if (!res.ok) throw new Error(`storage ${res.status}`);
  return res.blob();
}

/** Resolve real My Drive filenames from storage node ids (same lookup FilesPanel uses). */
export async function fetchNodeNames(refs_in: string[]): Promise<Record<string, string>> {
  const refs = refs_in.filter(isStorageRef);
  const entries = await Promise.all(
    refs.map(async (ref) => {
      try {
        const res = await apiFetch(`/api/gateway/storage/nodes/${ref}`);
        if (!res.ok) return null;
        const j = (await res.json()) as { node?: { name?: string } };
        return j?.node?.name ? ([ref, j.node.name] as const) : null;
      } catch {
        return null;
      }
    }),
  );
  return Object.fromEntries(entries.filter(Boolean) as [string, string][]);
}

// (Previews go through components/FileViewer.tsx — portal content NEVER
// opens a new tab; the old openBlob new-tab helper is gone.)

/** Trigger a named download for a blob. */
export function downloadBlob(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name || 'document';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

/**
 * Create a `documents` row linked to a parcel / passbook / property (the
 * exact createDocument call the rhub FilesPanel makes). Returns the new
 * document id or '' on failure.
 */
export async function createDocumentRow(
  target: { parcelId?: string; passbookId?: string; propertyId?: string },
  fields: { docType: string; fileRef: string; tags?: string; source?: string },
): Promise<string> {
  try {
    const r = await gql<{ createDocument: { id: string } | null }>(
      'mutation($parcelId:String!,$passbookId:String!,$propertyId:String!,$docType:String!,$fileRef:String!,$docNo:String!,$sroCode:String!,$regYear:String!,$source:String!,$tags:String!){ createDocument(parcelId:$parcelId,passbookId:$passbookId,propertyId:$propertyId,docType:$docType,fileRef:$fileRef,docNo:$docNo,sroCode:$sroCode,regYear:$regYear,source:$source,tags:$tags){ id } }',
      {
        parcelId: target.parcelId || '',
        passbookId: target.passbookId || '',
        propertyId: target.propertyId || '',
        docType: fields.docType,
        fileRef: fields.fileRef,
        docNo: '',
        sroCode: '',
        regYear: '',
        source: fields.source || 'upload',
        tags: fields.tags || '',
      },
    );
    return r?.createDocument?.id || '';
  } catch {
    return '';
  }
}

/**
 * Upload an image → My Drive → create a "photo" document on the parcel or
 * property — the grids/galleries treat the newest photo as the cover.
 * (Port of rhub shared.ts uploadCoverPhoto.) Returns 'storage' when My
 * Drive is unreachable so callers can show STORAGE_OFFLINE_MSG.
 */
export async function uploadCoverPhoto(
  file: File,
  target: { parcelId?: string; propertyId?: string },
): Promise<'ok' | 'storage' | 'error'> {
  const nodeId = await uploadToDrive(file);
  if (!nodeId) return 'storage';
  const id = await createDocumentRow(target, { docType: 'photo', fileRef: nodeId, tags: 'photo' });
  return id ? 'ok' : 'error';
}

/** Outcome of one document trash: `ok` reflects ONLY the GraphQL row delete —
 * the My-Drive soft-delete stays best-effort (absent locally) and must never
 * block or mislabel the result. `reason` is plain-language, for toasts. */
export interface TrashResult {
  ok: boolean;
  reason: string;
}

/** Trash one document: best-effort storage soft-delete + the row delete. */
export async function trashDocument(doc: { id: string; fileRef?: string }): Promise<TrashResult> {
  if (isStorageRef(doc.fileRef)) {
    try {
      await apiFetch(`/api/gateway/storage/nodes/${doc.fileRef}`, { method: 'DELETE' });
    } catch {
      /* best-effort */
    }
  }
  try {
    const r = await gql<{ deleteDocument: boolean }>('mutation($id:String!){ deleteDocument(id:$id) }', {
      id: doc.id,
    });
    return r?.deleteDocument
      ? { ok: true, reason: '' }
      : { ok: false, reason: 'the record could not be found' };
  } catch {
    return { ok: false, reason: 'the server could not be reached' };
  }
}

/**
 * Deleting a document also moves its My Drive file to Trash (soft-delete via
 * the storage API) and removes the document row. Best-effort — a failed
 * trash never blocks the delete. (Port of rhub shared.ts trashDocuments.)
 */
export async function trashDocuments(
  docs: { id: string; fileRef?: string }[],
  opts?: { keepRows?: boolean },
): Promise<void> {
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

/**
 * Shared My-Drive folder-nesting: files land at
 * My Drive / Pattadar / Passbook <ref> [/ Parcel <label>] / <file>.
 * (Port of rhub driveFolders.ts nestUnderPattadar — filing is best-effort.)
 */
export async function nestUnderPattadar(
  opts: { passbookRef: string; parcelLabel?: string },
  nodeId: string,
): Promise<void> {
  if (!nodeId) return;
  const findFolder = async (parentId: string | null, name: string): Promise<string> => {
    try {
      const lr = await apiFetch(
        `/api/gateway/storage/nodes${parentId ? `?parent=${encodeURIComponent(parentId)}` : ''}`,
      );
      if (lr.ok) {
        const items = ((await lr.json())?.items || []) as { id: string; kind: string; name: string }[];
        return items.find((it) => it.kind === 'folder' && it.name === name)?.id || '';
      }
    } catch {
      /* ignore */
    }
    return '';
  };
  const createFolder = async (parentId: string | null, name: string): Promise<string> => {
    try {
      const body: Record<string, string> = { name, appId: 'pattadar' };
      if (parentId) body.parentId = parentId;
      const cr = await apiFetch('/api/gateway/storage/folders', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (cr.ok) return ((await cr.json())?.id as string) || '';
    } catch {
      /* ignore */
    }
    return '';
  };
  const move = (id: string, parentId: string) =>
    apiFetch(`/api/gateway/storage/nodes/${id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ parentId }),
    });
  try {
    const passbookName = opts.passbookRef ? `Passbook ${opts.passbookRef}` : '';
    const parcelName = opts.parcelLabel ? `Parcel ${opts.parcelLabel}` : '';
    const rootId = (await findFolder(null, 'Pattadar')) || (await createFolder(null, 'Pattadar'));
    if (!rootId) return;
    const pbFolderId = passbookName
      ? (await findFolder(rootId, passbookName)) || (await createFolder(rootId, passbookName))
      : rootId;
    if (!pbFolderId) return;
    if (!parcelName) {
      await move(nodeId, pbFolderId);
      return;
    }
    let parcelFolderId = await findFolder(pbFolderId, parcelName);
    if (!parcelFolderId) {
      // Adopt an existing Parcel folder sitting at a shallower level (directly
      // under Pattadar, or at the drive root) into the passbook folder.
      const legacy = (await findFolder(rootId, parcelName)) || (await findFolder(null, parcelName));
      if (legacy) {
        await move(legacy, pbFolderId);
        parcelFolderId = legacy;
      } else parcelFolderId = await createFolder(pbFolderId, parcelName);
    }
    if (parcelFolderId) await move(nodeId, parcelFolderId);
  } catch {
    /* filing is best-effort */
  }
}
