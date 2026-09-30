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
import { apiErrorMessage, apiFetch, gql } from '../../api/client';
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

/** What one AI reading cost. List price for `model`, pre-margin — the server
 * computes it and hands it back so a reading can say what it spent. Absent when
 * the server did not report it (an older reading, or a path that does not
 * surface cost). Tokens are always whole; `usd` is 0 for an unpriced model. */
export interface ReadingUsage {
  model: string;
  /** The whole prompt, cached and uncached together. */
  inputTokens: number;
  outputTokens: number;
  cacheWriteTokens: number;
  cacheReadTokens: number;
  usd: number;
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
  /** What this read cost, when the server reported it. */
  usage?: ReadingUsage;
}

/** The server sends usage snake_cased inside the reading result; narrow it to
 * the camelCase shape the UI uses, dropping it entirely if it is malformed
 * rather than showing a half-filled cost line. */
function readUsage(raw: unknown): ReadingUsage | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const u = raw as Record<string, unknown>;
  const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
  const model = typeof u.model === 'string' ? u.model : '';
  // input/output tokens are the floor of a real reading; without them there is
  // nothing worth showing, so treat their absence as "no usage".
  if (!('input_tokens' in u) && !('output_tokens' in u)) return undefined;
  return {
    model,
    inputTokens: num(u.input_tokens),
    outputTokens: num(u.output_tokens),
    cacheWriteTokens: num(u.cache_write_tokens),
    cacheReadTokens: num(u.cache_read_tokens),
    usd: num(u.usd),
  };
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
export async function readDocument(
  file: File | Blob, filename: string,
  opts: {
    /** What the reading is for. `add-property` asks the server to announce
     *  the result in the inbox, because that drawer is walked away from. */
    purpose?: 'add-property';
    /** The job id, as soon as the server has accepted the file. */
    onReceipt?: (job: string) => void;
    /** Stops waiting. The reading itself carries on on the server. */
    signal?: AbortSignal;
  } = {},
): Promise<Reading> {
  const fd = new FormData();
  fd.append('file', file instanceof File ? file : new File([file], filename));
  const res = await apiFetch('/api/gateway/pattadar/import-registered-document', {
    method: 'POST',
    body: fd,
    headers: opts.purpose ? { 'X-Reading-Purpose': opts.purpose } : undefined,
    onReceipt: opts.onReceipt,
    signal: opts.signal,
  });
  if (!res.ok) throw new Error(await apiErrorMessage(res, 'The document reader could not be reached. Try again.'));
  return readingFromBody(await res.json());
}

/** A reading's response body — live or stored on its job — as a Reading. */
export function readingFromBody(raw: unknown): Reading {
  const body = (raw ?? {}) as { fields?: Record<string, unknown>; usage?: unknown };
  const fields = (body?.fields || {}) as Record<string, unknown>;
  const docType = classifierToType(String(fields.doc_type || ''));
  const findings = FINDING_FIELDS.map(([key, label]) => ({
    label,
    value: String(fields[key] ?? '').trim(),
  })).filter((f) => f.value);
  return { docType, docTypeLabel: labelOfType(docType), fields, findings, usage: readUsage(body?.usage) };
}

/** What reading an FMB sheet produced: the whole extraction, and the derived
 *  §13 geometry when the sheet gave up a corner table (services/api's
 *  fmb_geometry.attach_geometry builds `fields.geometry`). `geometry` is null
 *  for a scanned sheet with no readable corners — the caller then keeps the
 *  filed paper but sets no boundary. */
export interface FmbReading {
  docType: string;
  fields: Record<string, unknown>;
  /** The derived geometry object, or null. Shape mirrors fmb_geometry.py:
   *  { points: [{id, lat, lon, e, n}], ring: number[] (ids), area_ac, … }. */
  geometry: Record<string, unknown> | null;
}

/**
 * Read an already-uploaded FMB / survey sheet with the AI reader.
 *
 * Same reader as a deed — it classifies FMB/map documents and, when the sheet
 * carries a corner table, the server attaches a derived `geometry`. Writes
 * nothing itself; the caller decides whether to set the boundary from what was
 * read. Throws only when the reader could not be reached at all, so a sheet
 * that simply had no readable corners returns a reading with geometry null
 * rather than an error.
 */
export async function readFmb(file: File | Blob, filename: string): Promise<FmbReading> {
  const fd = new FormData();
  fd.append('file', file instanceof File ? file : new File([file], filename));
  const res = await apiFetch('/api/gateway/pattadar/import-registered-document', {
    method: 'POST',
    body: fd,
  });
  if (!res.ok) throw new Error(await apiErrorMessage(res, 'The sheet reader could not be reached. Try again.'));
  const body = (await res.json()) as { fields?: Record<string, unknown> };
  const fields = (body?.fields || {}) as Record<string, unknown>;
  const geometry = (fields.geometry && typeof fields.geometry === 'object')
    ? (fields.geometry as Record<string, unknown>)
    : null;
  return { docType: String(fields.doc_type || ''), fields, geometry };
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
