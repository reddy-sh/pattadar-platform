import * as FileSystem from 'expo-file-system/legacy';
import * as SecureStore from 'expo-secure-store';
import * as Sharing from 'expo-sharing';

/**
 * Locally kept copies of documents.
 *
 * Two different things used to be one string: the ON-DISK filename (which must
 * be unique per document, so it is prefixed with the id) and the DISPLAY name
 * (what the owner should read). Storing only the prefixed filename meant every
 * document showed as `doc-3c8f…`, and prettifying the argument did nothing
 * because the prefix was added here afterwards.
 */
export interface LocalFile {
  /** Filename under LOCAL_DIR — unique, not for display. */
  file: string;
  /** Human name: "Aadhaar - Sankara Telukutla - 27-07-2026.jpg". */
  name: string;
}

type StoredMap = Record<string, LocalFile | string>;

function normalise(v: LocalFile | string): LocalFile {
  // Older installs stored a bare filename; keep them openable.
  return typeof v === 'string' ? { file: v, name: v } : v;
}

/**
 * On-device copies (Aadhaar/deed scans) live under `cacheDirectory`, not
 * `documentDirectory` (H-2): Documents is backed up to iCloud on iOS by
 * default, and these are records with people's Aadhaar numbers on them.
 * Caches is excluded from iCloud/iTunes backups by the OS — the tradeoff is
 * that the OS may purge it under disk pressure, which is accepted here.
 * Bytes stay plaintext on disk: app-level AES encryption was considered and
 * deferred (expo-crypto has no AES — see fetchDriveFile in api/storage.ts);
 * at rest this relies on that exclusion plus iOS Data Protection, which
 * protects files until first unlock by default.
 */
const LOCAL_DIR = FileSystem.cacheDirectory ?? FileSystem.documentDirectory ?? '';

/**
 * Copies saved before the H-2 move above were written to `documentDirectory`.
 * Deletes must also check there — otherwise a pre-existing scanned
 * Aadhaar/deed is left on disk forever while the UI reports it gone.
 */
const LEGACY_LOCAL_DIR = FileSystem.documentDirectory ?? '';

/** Full `file://` URI for a saved local copy's on-disk filename. */
export function localFileUri(file: string): string {
  return `${LOCAL_DIR}${file}`;
}

// --- index: a JSON file, not one growing SecureStore/Keychain item (H-4) ---
//
// The whole map used to be serialized into a single SecureStore/Keychain
// item, one entry per filed document, with no upper bound — and Keychain
// items have a size limit. Past it, the write was swallowed and the file
// reference for that document was gone with no signal. A JSON file has no
// such cap; only the (future) encryption key belongs in SecureStore.

const LEGACY_KEY = 'pattadar_local_files';
const INDEX_FILE = `${FileSystem.documentDirectory}local-files.json`;

async function readIndexFile(): Promise<StoredMap | null> {
  const info = await FileSystem.getInfoAsync(INDEX_FILE).catch(() => null);
  if (!info?.exists) return null;
  try {
    return JSON.parse(await FileSystem.readAsStringAsync(INDEX_FILE)) as StoredMap;
  } catch (e) {
    // Corrupt, not absent: returning null here would fall through to
    // migrateFromSecureStore() and silently reset every filename to `{}`
    // with no trace (the same swallow H-4 removed on the write side).
    // Log it, keep the bad file around for inspection, and start fresh.
    console.error('[localFiles] index file is corrupt JSON — preserving it and starting fresh', e);
    await FileSystem.moveAsync({
      from: INDEX_FILE,
      to: `${FileSystem.documentDirectory}local-files.corrupt.json`,
    }).catch(() => undefined);
    return {};
  }
}

async function writeIndexFile(map: StoredMap): Promise<void> {
  await FileSystem.writeAsStringAsync(INDEX_FILE, JSON.stringify(map));
}

/**
 * One-time move off the old Keychain item: read old → write new → delete
 * old. If the write is interrupted, the new file never appears, so
 * `readIndexFile()` keeps returning null and this simply reruns next
 * launch. But if the write succeeds and only the delete fails, the new file
 * is already in place — migration itself will NOT rerun (readIndexFile()
 * now finds it), so the stale Keychain item would persist forever. That
 * case is instead best-effort retried once per launch from
 * `getLocalFiles()` below.
 */
async function migrateFromSecureStore(): Promise<StoredMap> {
  const raw = await SecureStore.getItemAsync(LEGACY_KEY).catch(() => null);
  if (!raw) return {};
  let map: StoredMap;
  try {
    map = JSON.parse(raw) as StoredMap;
  } catch {
    map = {};
  }
  await writeIndexFile(map);
  await SecureStore.deleteItemAsync(LEGACY_KEY).catch(() => undefined);
  return map;
}

// Set once the legacy-key delete retry (see migrateFromSecureStore's
// docstring) has been attempted this launch, so it runs at most once rather
// than on every getLocalFiles() call.
let legacyDeleteRetried = false;

export async function getLocalFiles(): Promise<Record<string, LocalFile>> {
  const fromFile = await readIndexFile();
  const raw = fromFile ?? (await migrateFromSecureStore());
  if (fromFile && !legacyDeleteRetried) {
    legacyDeleteRetried = true;
    await SecureStore.deleteItemAsync(LEGACY_KEY).catch(() => undefined);
  }
  return Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, normalise(v)]));
}

/** `displayName` is what the owner sees; the on-disk name stays id-prefixed. */
export async function saveLocalCopy(
  docId: string,
  uri: string,
  displayName: string,
): Promise<void> {
  const safe = displayName.replace(/[^\w.\- ]/g, '_');
  const file = `doc-${docId}-${safe.replace(/\s+/g, '_')}`;
  await FileSystem.copyAsync({ from: uri, to: localFileUri(file) });
  const map: StoredMap = await getLocalFiles();
  map[docId] = { file, name: safe };
  // H-4: logged and surfaced, not swallowed — a caller that ignores this
  // rejection loses the reference to the copy it just made with no
  // indication it happened.
  try {
    await writeIndexFile(map);
  } catch (e) {
    console.error(`[localFiles] failed to save the index entry for ${docId}`, e);
    throw e;
  }
}

export async function openLocalCopy(docId: string): Promise<void> {
  const map = await getLocalFiles();
  const entry = map[docId];
  if (!entry?.file) throw new Error('This file lives on the web — open it at pattadar.com.');
  await Sharing.shareAsync(localFileUri(entry.file.split('/').pop() ?? entry.file));
}

/**
 * Delete a document's on-device copy and drop its index entry (H-3) — called
 * from the delete handlers so the file does not outlive the record that
 * pointed at it.
 */
export async function removeLocalCopy(docId: string): Promise<void> {
  const map = await getLocalFiles();
  const entry = map[docId];
  if (entry?.file) {
    await FileSystem.deleteAsync(localFileUri(entry.file), { idempotent: true }).catch(() => undefined);
    // The copy may instead be a pre-existing one saved under the old
    // documentDirectory location before the H-2 move — check there too, or
    // it is left orphaned while the UI reports it deleted.
    if (LEGACY_LOCAL_DIR && LEGACY_LOCAL_DIR !== LOCAL_DIR) {
      await FileSystem.deleteAsync(`${LEGACY_LOCAL_DIR}${entry.file}`, { idempotent: true }).catch(() => undefined);
    }
  }
  if (entry) {
    delete map[docId];
    await writeIndexFile(map);
  }
}

/**
 * Delete every on-device document copy (H-2). Exported for `clearCachedFiles`
 * in api/storage.ts, which sweeps the `drive-*` download cache the same way;
 * together they are the helper a later sign-out task reuses.
 */
export async function clearLocalCopies(): Promise<void> {
  // Sweep both the current cacheDirectory location and the legacy
  // documentDirectory one (pre-existing copies from before the H-2 move),
  // or a "clear everything" action leaves some copies behind.
  const dirs = LEGACY_LOCAL_DIR && LEGACY_LOCAL_DIR !== LOCAL_DIR ? [LOCAL_DIR, LEGACY_LOCAL_DIR] : [LOCAL_DIR];
  await Promise.all(
    dirs.map(async (dir) => {
      const names = await FileSystem.readDirectoryAsync(dir).catch(() => [] as string[]);
      await Promise.all(
        names
          .filter((n) => n.startsWith('doc-'))
          .map((n) => FileSystem.deleteAsync(`${dir}${n}`, { idempotent: true }).catch(() => undefined)),
      );
    }),
  );
  await writeIndexFile({});
}
