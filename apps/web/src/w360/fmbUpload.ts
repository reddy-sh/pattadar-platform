/**
 * Uploading an FMB survey sheet — once, durably, and never twice.
 *
 * Two things a component cannot do on its own, and the reason this store sits
 * outside React:
 *
 *  1. NEVER PAY TWICE. Reading an FMB is a paid model call. The server already
 *     dedupes an identical read by content hash, but the client can still waste
 *     a second STORAGE upload and file a second, identical paper in Papers
 *     before the server is ever asked. So the sheet is hashed in the browser
 *     first, and a hash already handled for this record is rejected outright —
 *     no upload, no paper, no read.
 *
 *  2. SURVIVE LEAVING THE SCREEN. The read is a durable server job that keeps
 *     running whether or not anyone is watching; cancelling it would throw away
 *     tokens already being spent. So the run is NOT tied to a component's
 *     lifetime or abort signal: it lives here, keyed by record id, and a
 *     component that mounts later re-attaches to whatever is in flight.
 */
import { uploadToDrive } from '../pages/documents/storage';
import { readFmb, type FmbReading } from '../pages/documents/upload';

/** What one record's FMB upload is doing right now, for any screen that asks. */
export interface FmbRunState {
  /** True while uploading/filing/reading — the busy signal a screen shows. */
  busy: boolean;
  /** What is happening, for the busy line. */
  stage: string;
  /** The reading, once it finishes; null until then / on failure. */
  reading: FmbReading | null;
  /** A sentence to show the owner — an error, or the "no corners" outcome. */
  message: string;
  /** Hashes handled for this record this session, so a repeat is refused. */
  seen: Set<string>;
}

const IDLE: Omit<FmbRunState, 'seen'> = { busy: false, stage: '', reading: null, message: '' };

const store = new Map<string, FmbRunState>();
const listeners = new Map<string, Set<() => void>>();

function stateOf(recordId: string): FmbRunState {
  let s = store.get(recordId);
  if (!s) { s = { ...IDLE, seen: new Set() }; store.set(recordId, s); }
  return s;
}

function emit(recordId: string) {
  listeners.get(recordId)?.forEach((fn) => fn());
}

function patch(recordId: string, next: Partial<FmbRunState>) {
  store.set(recordId, { ...stateOf(recordId), ...next });
  emit(recordId);
}

/** Subscribe/read for useSyncExternalStore. */
export function subscribeFmb(recordId: string, fn: () => void): () => void {
  let set = listeners.get(recordId);
  if (!set) { set = new Set(); listeners.set(recordId, set); }
  set.add(fn);
  return () => { set!.delete(fn); };
}
export function getFmbState(recordId: string): FmbRunState {
  return stateOf(recordId);
}

/** The file's SHA-256, hex — the same identity the server dedupes on. */
export async function sha256Hex(file: Blob): Promise<string> {
  const buf = await file.arrayBuffer();
  const digest = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Clear a finished run's message/reading so a screen can dismiss it, without
 *  forgetting the hashes already handled (a duplicate must still be refused). */
export function clearFmbResult(recordId: string) {
  patch(recordId, { reading: null, message: '' });
}

/**
 * File an FMB against a record: hash → reject duplicate → upload → file in
 * Papers → read. Idempotent per hash for the session, durable across screens,
 * and never cancelled once the paid read has begun.
 *
 * Returns the reading when a NEW sheet was read, or null when it was rejected
 * as a duplicate or could not be read — the state carries the message either
 * way. `onPaper` files the sheet in Papers (the caller owns the mutation);
 * it is awaited before the read so the paper is kept even if the read fails.
 */
export async function runFmbUpload(
  recordId: string,
  file: File,
  onPaper: (node: { id: string; name: string; mimeType: string; sizeBytes: number }) => Promise<void>,
): Promise<FmbReading | null> {
  const s = stateOf(recordId);
  if (s.busy) {
    patch(recordId, { message: 'An FMB is already being read for this record. Wait for it to finish.' });
    return null;
  }
  patch(recordId, { busy: true, stage: `Checking ${file.name}…`, message: '', reading: null });

  let hash: string;
  try {
    hash = await sha256Hex(file);
  } catch {
    // Hashing should never fail, but if it does, do NOT silently pay for a
    // possible duplicate — refuse and let the owner try again.
    patch(recordId, { busy: false, stage: '', message: 'That file could not be read to check it. Try again.' });
    return null;
  }

  if (stateOf(recordId).seen.has(hash)) {
    patch(recordId, {
      busy: false, stage: '',
      message: 'This is the same FMB you already uploaded to this record — it was not sent again. '
        + 'Reading it a second time would cost the same and change nothing.',
    });
    return null;
  }

  // Bytes to storage.
  let node;
  try {
    patch(recordId, { stage: `Filing ${file.name}…` });
    node = await uploadToDrive(file);
  } catch (e) {
    patch(recordId, {
      busy: false, stage: '',
      message: e instanceof Error ? e.message : 'The sheet could not be uploaded. Try again.',
    });
    return null;
  }

  // Mark the hash handled BEFORE the read: the sheet is now in storage and
  // about to be filed + read, so a second attempt at identical bytes must be
  // refused even if the read is still running.
  stateOf(recordId).seen.add(hash);

  // File it in Papers — best effort; the sheet is kept whether or not the read
  // finds corners.
  try {
    await onPaper({ id: node.id, name: node.name || file.name, mimeType: node.mimeType || '', sizeBytes: node.sizeBytes || 0 });
  } catch { /* the read below is the point; a failed paper file is not fatal */ }

  // The paid read. Durable server job — not cancelled if the screen unmounts.
  try {
    patch(recordId, { stage: 'Reading the sheet…' });
    const reading = await readFmb(file, node.name || file.name);
    patch(recordId, { busy: false, stage: '', reading });
    return reading;
  } catch (e) {
    patch(recordId, {
      busy: false, stage: '',
      message: `${node.name || file.name} is filed in Documents, but it could not be read `
        + `(${e instanceof Error ? e.message : 'reader unavailable'}). Draw the boundary here, or order a survey.`,
    });
    return null;
  }
}
