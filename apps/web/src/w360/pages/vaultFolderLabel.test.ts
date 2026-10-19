/** The Folder column's words: the shortest label that is not ambiguous. */
import { expect, test } from 'bun:test';

import { folderLabel, linkedLabel } from './vaultFolderLabel';
import type { FolderRef } from './vaultFolderLabel';

const tree = (folders: FolderRef[]) => new Map(folders.map((f) => [f.id, f]));
const FOLDERS = tree([
  { id: 'ravi', name: 'Ravi', parentId: '' },
  { id: 'ravi-a', name: 'Aadhaar', parentId: 'ravi' },
  { id: 'sita', name: 'Sita', parentId: '' },
  { id: 'sita-a', name: 'aadhaar', parentId: 'sita' },
  { id: 'deeds', name: 'Deeds', parentId: '' },
]);

test('a folder name nobody else has is said alone', () => {
  expect(folderLabel({ folderId: 'deeds', linkedProperties: [] }, FOLDERS))
    .toEqual({ kind: 'folder', folderId: 'deeds', text: 'Deeds' });
});

test('a shared name (any case) says whose it is', () => {
  expect(folderLabel({ folderId: 'ravi-a', linkedProperties: [] }, FOLDERS))
    .toEqual({ kind: 'folder', folderId: 'ravi-a', text: 'Ravi › Aadhaar' });
  expect(folderLabel({ folderId: 'sita-a', linkedProperties: [] }, FOLDERS).text).toBe('Sita › aadhaar');
});

test('no folder: the linked properties, else Documents', () => {
  const linked = [{ title: 'Sy 214/2' }, { title: 'Sy 9' }];
  expect(folderLabel({ folderId: '', linkedProperties: linked }, FOLDERS))
    .toEqual({ kind: 'property', text: 'Sy 214/2', more: 1, all: 'Sy 214/2, Sy 9' });
  expect(folderLabel({ linkedProperties: [] }, FOLDERS)).toEqual({ kind: 'root', text: 'Documents' });
  // A folder that is gone reads as the top level, where the list shows it.
  expect(folderLabel({ folderId: 'gone', linkedProperties: [] }, FOLDERS).kind).toBe('root');
});

test('the Linked to column names the first link and counts the rest', () => {
  expect(linkedLabel([{ title: 'Sy 214/2' }, { title: 'Katragunta farm' }]))
    .toEqual({ kind: 'linked', text: 'Sy 214/2', more: 1, all: 'Sy 214/2, Katragunta farm' });
  expect(linkedLabel([{ title: 'Sy 9' }])).toEqual({ kind: 'linked', text: 'Sy 9', more: 0, all: 'Sy 9' });
  expect(linkedLabel([])).toEqual({ kind: 'none', text: 'Not linked' });
});
