/**
 * A kept Aadhaar card is filed in My Drive under a fixed, safe name. The
 * original filename often carries the holder's name or number, so it is never
 * used, and the extension follows the MIME type because the gateway picks its
 * HEIC/image handling by the name.
 */
import { expect, test } from 'bun:test';

import { cardName } from './PersonDialog';

test('each known card type keeps its own extension', () => {
  expect(cardName('application/pdf')).toBe('Aadhaar card.pdf');
  expect(cardName('image/jpeg')).toBe('Aadhaar card.jpg');
  expect(cardName('image/jpg')).toBe('Aadhaar card.jpg');
  expect(cardName('image/png')).toBe('Aadhaar card.png');
  expect(cardName('image/heic')).toBe('Aadhaar card.heic');
  expect(cardName('image/heif')).toBe('Aadhaar card.heif');
  expect(cardName('image/webp')).toBe('Aadhaar card.webp');
});

test('the MIME type is read case-insensitively', () => {
  expect(cardName('Application/PDF')).toBe('Aadhaar card.pdf');
  expect(cardName('IMAGE/HEIC')).toBe('Aadhaar card.heic');
});

test('an unknown or missing type falls back to bin, never to the original name', () => {
  expect(cardName('')).toBe('Aadhaar card.bin');
  expect(cardName('image/gif')).toBe('Aadhaar card.bin');
  expect(cardName('application/octet-stream')).toBe('Aadhaar card.bin');
});
