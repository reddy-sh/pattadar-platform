import { describe, expect, test } from 'bun:test';

import { looksLikeFileName, paperFileName, paperTitle } from './paperTitle';

const sy = [{ title: 'Sy 1-C1' }];

describe('paperTitle', () => {
  test('a raw file name linked to a property reads as kind · property', () => {
    expect(paperTitle({ title: 'IMG_4482.pdf', shelf: 'map', detail: 'FMB sheet', linkedProperties: sy }))
      .toBe('FMB · Sy 1-C1');
    expect(paperTitle({ title: 'VID-20250914-WA0007.mp4', shelf: 'photos', mimeType: 'video/mp4', linkedProperties: sy }))
      .toBe('Video · Sy 1-C1');
  });

  test('a title deed with a deed number is "Sale deed <no>"', () => {
    expect(paperTitle({ title: 'scan0001.pdf', shelf: 'title', docNo: '1842/2019' })).toBe('Sale deed 1842/2019');
  });

  test('the owner’s own name wins, without its extension', () => {
    expect(paperTitle({ title: 'Mother’s deed.pdf', shelf: 'title', docNo: '9/2001', nameSet: true }))
      .toBe('Mother’s deed');
  });

  test('a name a reading already gave is kept', () => {
    expect(paperTitle({ title: 'Sale deed 4412 of 1998', shelf: 'title', linkedProperties: sy }))
      .toBe('Sale deed 4412 of 1998');
  });

  test('never shows the extension, even with nothing to name it by', () => {
    expect(paperTitle({ title: 'Boundary stone.jpg', shelf: 'photos', mimeType: 'image/jpeg' })).toBe('Boundary stone');
    expect(paperTitle({ title: 'Scan 2026-08-02.pdf', shelf: 'unsorted', linkedProperties: sy })).toBe('Scan 2026-08-02');
  });

  test('the file name is the small line only when the title is not it', () => {
    expect(paperFileName({ title: 'IMG_4482.pdf', shelf: 'map', detail: 'FMB', linkedProperties: sy })).toBe('IMG_4482.pdf');
    expect(paperFileName({ title: 'Sale deed 4412 of 1998', shelf: 'title' })).toBe('');
  });

  test('file-name detection', () => {
    expect(looksLikeFileName('WhatsApp Image 2025-01-02 at 10.11.jpeg')).toBe(true);
    expect(looksLikeFileName('IMG_20250101')).toBe(true);
    expect(looksLikeFileName('EC 1990-2025 Mangalakunta')).toBe(false);
  });
});
