import { expect, test } from 'bun:test';

import { bulkDeleteBody, deleteBody, photoUses } from './photoUses';

test('a photo doing three jobs names all three before it is deleted', () => {
  const p = { featureId: 'w-feat-well', orderRef: 'ORD-2291', isCover: true };
  expect(photoUses(p)).toHaveLength(3);
  expect(deleteBody(p, 'photo')).toBe(
    'This photo is also this property’s cover, a feature’s current condition on the Site features tab '
    + 'and the evidence on order ORD-2291. One file, saved once: deleting it here takes it off all '
    + 'of them too. It is kept for 30 days, then deleted for good.');
});

test('one other use is named as one', () => {
  expect(deleteBody({ orderRef: 'ORD-7' }, 'video')).toBe(
    'This video is also the evidence on order ORD-7. One file, saved once: deleting it here takes '
    + 'it off there too. It is kept for 30 days, then deleted for good.');
});

test('a photo only in the gallery gets the plain sentence', () => {
  expect(deleteBody({ featureId: '', orderRef: '', isCover: false }, 'photo'))
    .toBe('It is kept for 30 days, then deleted for good.');
});

test('a selection names every other use its items have, once each', () => {
  expect(bulkDeleteBody([
    { isCover: true, orderRef: 'ORD-7' }, { orderRef: 'ORD-7' }, {},
  ])).toBe(
    'These items are also this property’s cover and the evidence on order ORD-7. Deleting them '
    + 'here takes them off all of them too. They are kept for 30 days, then deleted for good.');
});

test('a selection with no other uses gets the plain sentence', () => {
  expect(bulkDeleteBody([{}, {}])).toBe('They are kept for 30 days, then deleted for good.');
  expect(bulkDeleteBody([{}])).toBe('It is kept for 30 days, then deleted for good.');
});
