/** Which of a removed person's files go to Trash with them: only their kept
 *  Aadhaar cards, and only while those are still in their own folders. */
import { expect, test } from 'bun:test';

import { aadhaarPapersOf } from './groupsData';

const FOLDERS = [
  { id: 'f-ravi', personId: 'mem-ravi' },
  { id: 'f-ravi-aadhaar', personId: 'mem-ravi' },
  { id: 'f-sita', personId: 'mem-sita' },
  { id: 'f-mine', personId: '' },
];

test('a person’s card in their own folder is theirs', () => {
  const papers = [
    { id: 'card-ravi', fileRef: 'node-1', folderId: 'f-ravi-aadhaar', aadhaarCard: true },
    { id: 'card-sita', fileRef: 'node-2', folderId: 'f-sita', aadhaarCard: true },
  ];
  expect(aadhaarPapersOf('mem-ravi', FOLDERS, papers)).toEqual([{ id: 'card-ravi', fileRef: 'node-1' }]);
});

test('another file in their folder, or a card moved out of it, is left alone', () => {
  const papers = [
    { id: 'note', fileRef: 'node-3', folderId: 'f-ravi', aadhaarCard: false },
    { id: 'moved', fileRef: 'node-4', folderId: 'f-mine', aadhaarCard: true },
    { id: 'top', fileRef: 'node-5', folderId: '', aadhaarCard: true },
  ];
  expect(aadhaarPapersOf('mem-ravi', FOLDERS, papers)).toEqual([]);
});

test('no person, no cards', () => {
  expect(aadhaarPapersOf('', FOLDERS, [{ id: 'x', fileRef: 'n', folderId: '', aadhaarCard: true }])).toEqual([]);
});
