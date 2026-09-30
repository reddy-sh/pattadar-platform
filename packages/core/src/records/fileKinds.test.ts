import { describe, expect, test } from 'bun:test';

import { FILE_KIND_LABEL, fileExtension, fileKindOf, formatBytes, hasPictureThumb } from './fileKinds';

describe('fileKindOf', () => {
  test('the MIME type decides when it is specific', () => {
    expect(fileKindOf('application/pdf')).toBe('pdf');
    expect(fileKindOf('image/heic', 'IMG_0001.HEIC')).toBe('image');
    expect(fileKindOf('video/mp4; codecs=avc1')).toBe('video');
    expect(fileKindOf('audio/mpeg')).toBe('audio');
    expect(fileKindOf('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')).toBe('sheet');
    expect(fileKindOf('application/vnd.openxmlformats-officedocument.wordprocessingml.document')).toBe('doc');
    expect(fileKindOf('application/vnd.ms-powerpoint')).toBe('slides');
    expect(fileKindOf('application/vnd.google-earth.kmz')).toBe('map');
    expect(fileKindOf('application/zip')).toBe('archive');
  });

  test('a generic MIME type falls back to the extension', () => {
    expect(fileKindOf('application/octet-stream', 'village.KMZ')).toBe('map');
    expect(fileKindOf('', 'sy no 1 (2).pdf')).toBe('pdf');
    expect(fileKindOf('', 'VIDEO-2026-09-24.mov')).toBe('video');
    expect(fileKindOf('application/octet-stream', 'ledger.csv')).toBe('sheet');
    expect(fileKindOf('text/plain', 'notes.txt')).toBe('text');
  });

  test('nothing to go on is a plain file, never a guess', () => {
    expect(fileKindOf('', '')).toBe('other');
    expect(fileKindOf('application/octet-stream', 'README')).toBe('other');
    expect(FILE_KIND_LABEL[fileKindOf('', '')]).toBe('File');
  });

  test('the extension is the last dot of the last path part, lower-cased', () => {
    expect(fileExtension('a/b/Deed.Final.PDF')).toBe('pdf');
    expect(fileExtension('.env')).toBe('');
    expect(fileExtension('noext')).toBe('');
  });

  test('only photos and videos have a picture of themselves to show', () => {
    expect(hasPictureThumb('image')).toBe(true);
    expect(hasPictureThumb('video')).toBe(true);
    expect(hasPictureThumb('pdf')).toBe(false);
  });

  test('a size reads in decimal units, and an unknown one reads as nothing', () => {
    expect(formatBytes(0)).toBe('');
    expect(formatBytes(-4)).toBe('');
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(1_400_000)).toBe('1.4 MB');
    expect(formatBytes(23_000_000)).toBe('23 MB');
  });

  test('audio is called a recording, as the app says everywhere else', () => {
    expect(FILE_KIND_LABEL.audio).toBe('Recording');
  });
});
