/**
 * The one upload pipeline for the vault — and the one place a reading is ever
 * asked for.
 *
 * This existed twice, copied, in DocumentsTab and PropertyFilesPanel, and both
 * copies did the same expensive thing: every uploaded file was sent to
 * /import-registered-document in the background to be classified. Nobody asked
 * for that. It spent an AI extraction on holiday photos and on the same deed
 * re-uploaded, and it meant an upload could not finish without the model
 * service being up.
 *
 * So the two are separated here:
 *
 *   uploadDocument()  — bytes to storage, a row in the vault. No model, ever.
 *   readDocument()    — runs the reader, returns WHAT IT FOUND, writes nothing.
 *
 * Nothing is classified until someone looks at a reading and accepts it. That
 * is `applyReading`, and it is the only function here that changes a document's
 * type.
 */
import { apiFetch, gql } from '../../api/client';
import { classifierToType, labelOfType } from './docTypes';
import { createDocumentRow, nestUnderPattadar, uploadToDrive } from './storage';

/** Where an uploaded file is filed. Empty target = the vault's inbox. */
export interface UploadTarget {
  parcelId?: string;
  passbookId?: string;
  propertyId?: string;
  /** Filing hints for My Drive's folder tree — parcel uploads only. */
  passbookRef?: string;
  parcelLabel?: string;
}

export interface UploadedDocument {
  id: string;
  name: string;
  sizeBytes: number;
}

/** Thrown when the storage gateway could not be reached — callers show
 * STORAGE_OFFLINE_MSG once for a whole batch rather than N error toasts. */
export class StorageOffline extends Error {
  constructor() {
    super('storage-offline');
    this.name = 'StorageOffline';
  }
}

const isVideoFile = (file: File): boolean =>
  String(file.type || '').startsWith('video/') || /\.(mp4|mov|webm)$/i.test(file.name || '');

const isImageFile = (file: File): boolean =>
  String(file.type || '').startsWith('image/') || /\.(jpe?g|png|heic|heif|webp)$/i.test(file.name || '');

/**
 * Put a file in the vault. No model runs, no credit is spent, and the upload
 * succeeds whether or not the reader is available.
 *
 * The type assigned here is the one thing that can be known for free: a video
 * is a video, an image is a photo, everything else is honestly "unsorted"
 * until somebody asks for it to be read.
 */
export async function uploadDocument(file: File, target: UploadTarget = {}): Promise<UploadedDocument> {
  const node = await uploadToDrive(file);
  if (!node) throw new StorageOffline();

  const docType = isVideoFile(file) ? 'video' : isImageFile(file) ? 'photo' : 'other';
  const id = await createDocumentRow(target, {
    docType,
    fileRef: node.id,
    tags: docType === 'other' ? '' : docType,
    name: node.name,
    sizeBytes: node.sizeBytes,
    mimeType: node.mimeType,
  });
  if (!id) throw new Error('The file was stored but the vault row could not be created');

  // Parcel uploads are filed into My Drive's Pattadar tree; best-effort, and
  // never allowed to fail the upload that already succeeded.
  if (target.parcelId && (target.passbookRef || target.parcelLabel)) {
    await nestUnderPattadar(
      { passbookRef: target.passbookRef || '', parcelLabel: target.parcelLabel || '' },
      node.id,
    );
  }
  return { id, name: node.name, sizeBytes: node.sizeBytes };
}

/** What the reader made of a file. Nothing here has been written down yet. */
export interface Reading {
  /** Our doc_type key, mapped from the classifier's display label. */
  docType: string;
  /** That key as a person reads it — "Sale Deed". */
  docTypeLabel: string;
  /** The raw extraction, for createRegisteredDocument. */
  fields: Record<string, unknown>;
  /** Two to five lines for the confirm sheet: what it says it found. */
  findings: { label: string; value: string }[];
}

const FINDING_FIELDS: [string, string][] = [
  ['document_no', 'Document no.'],
  ['reg_year', 'Year'],
  ['registration_date', 'Registered'],
  ['sro', 'Sub-registrar'],
  ['village', 'Village'],
  ['survey_no', 'Survey no.'],
  ['extent', 'Extent'],
];

/**
 * Run the reader over a stored file and return what it found.
 *
 * Writes NOTHING. The caller shows the findings and only calls applyReading
 * if the person accepts them — a machine's reading never becomes a record
 * without somebody saying so, which is the rule the iOS vault already keeps.
 *
 * Throws when the reader is unreachable or could not make sense of the file;
 * the document is left exactly as it was, which is the whole point of keeping
 * the file and its reading in separate layers.
 */
export async function readDocument(file: File | Blob, filename: string): Promise<Reading> {
  const fd = new FormData();
  fd.append('file', file instanceof File ? file : new File([file], filename));
  const res = await apiFetch('/api/gateway/pattadar/import-registered-document', {
    method: 'POST',
    body: fd,
  });
  if (!res.ok) throw new Error('The document reader could not be reached');
  const fields = (((await res.json()) as { fields?: Record<string, unknown> })?.fields || {}) as Record<
    string,
    unknown
  >;
  const docType = classifierToType(String(fields.doc_type || ''));
  const findings = FINDING_FIELDS.map(([key, label]) => ({
    label,
    value: String(fields[key] ?? '').trim(),
  })).filter((f) => f.value);
  return { docType, docTypeLabel: labelOfType(docType), fields, findings };
}

/**
 * Accept a reading: store the full extraction as a registered document and
 * point the file at it. The document's type becomes what was read.
 *
 * Both writes are needed — the extraction is what the detail view renders, and
 * the pointer is what makes this file a read one rather than an unsorted one.
 */
export async function applyReading(documentId: string, reading: Reading, fileRef: string): Promise<void> {
  const created = await gql<{ createRegisteredDocument: { id: string } | null }>(
    'mutation($fileRef:String!,$payload:String!){ createRegisteredDocument(fileRef:$fileRef,payload:$payload){ id } }',
    { fileRef, payload: JSON.stringify(reading.fields) },
  );
  const readingId = created?.createRegisteredDocument?.id;
  if (!readingId) throw new Error('The reading could not be saved');
  await gql(
    'mutation($id:String!,$r:String!,$t:String!){ attachDocumentReading(id:$id,readingId:$r,docType:$t){ id } }',
    { id: documentId, r: readingId, t: reading.docType },
  );
}
