import * as FileSystem from 'expo-file-system/legacy';
import * as SecureStore from 'expo-secure-store';
import * as Sharing from 'expo-sharing';

const KEY = 'pattadar_local_files';

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
  /** Filename under documentDirectory — unique, not for display. */
  file: string;
  /** Human name: "Aadhaar - Sankara Telukutla - 27-07-2026.jpg". */
  name: string;
}

type StoredMap = Record<string, LocalFile | string>;

function normalise(v: LocalFile | string): LocalFile {
  // Older installs stored a bare filename; keep them openable.
  return typeof v === 'string' ? { file: v, name: v } : v;
}

export async function getLocalFiles(): Promise<Record<string, LocalFile>> {
  try {
    const raw = JSON.parse((await SecureStore.getItemAsync(KEY)) || '{}') as StoredMap;
    return Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, normalise(v)]));
  } catch {
    return {};
  }
}

/** `displayName` is what the owner sees; the on-disk name stays id-prefixed. */
export async function saveLocalCopy(
  docId: string,
  uri: string,
  displayName: string,
): Promise<void> {
  const safe = displayName.replace(/[^\w.\- ]/g, '_');
  const file = `doc-${docId}-${safe.replace(/\s+/g, '_')}`;
  await FileSystem.copyAsync({ from: uri, to: `${FileSystem.documentDirectory}${file}` });
  const map = await getLocalFiles();
  map[docId] = { file, name: safe };
  await SecureStore.setItemAsync(KEY, JSON.stringify(map)).catch(() => undefined);
}

export async function openLocalCopy(docId: string): Promise<void> {
  const map = await getLocalFiles();
  const entry = map[docId];
  if (!entry?.file) throw new Error('This file lives on the web — open it at pattadar.com.');
  await Sharing.shareAsync(`${FileSystem.documentDirectory}${entry.file.split('/').pop()}`);
}
