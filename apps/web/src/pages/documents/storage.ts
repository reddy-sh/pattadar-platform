/**
 * My-Drive storage helpers for the Documents page — the exact endpoints the
 * rhub pattadar app calls (shared.ts trashDocuments, driveFolders.ts
 * nestUnderPattadar, FilesPanel/DocumentsTable blob + node lookups). All
 * best-effort: in local dev the storage service may be absent and every
 * helper degrades gracefully.
 */
import { apiFetch, gql } from '../../api/client';

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
  const res = await apiFetch(`/api/gateway/storage/files/${fileRef}/content`);
  if (!res.ok) throw new Error(`storage ${res.status}`);
  return res.blob();
}

/** Resolve real My Drive filenames from storage node ids (same lookup FilesPanel uses). */
export async function fetchNodeNames(refs: string[]): Promise<Record<string, string>> {
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

/** Open a blob in a new tab (preview). */
export function openBlob(blob: Blob): void {
  window.open(URL.createObjectURL(blob), '_blank');
}

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
