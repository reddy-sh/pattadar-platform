import { expect, test } from 'bun:test';
import { checkBoundaryDraft } from './boundaryDraft';

const square: Array<[number, number]> = [[16, 79], [16, 79.001], [16.001, 79.001], [16.001, 79]];

test('accepts a parcel in either direction and drops only its closing corner', () => {
  expect(checkBoundaryDraft(square).error).toBe('');
  expect(checkBoundaryDraft([...square].reverse()).error).toBe('');
  expect(checkBoundaryDraft([...square, square[0]]).ring).toEqual(square);
});

test('rejects crossed sides even when they enclose a nonzero signed area', () => {
  expect(checkBoundaryDraft([[16, 79], [16.002, 79.002], [16, 79.002], [16.001, 79]]).error)
    .toContain('crosses itself');
});

test('rejects repeated and collapsed corners at the saved precision', () => {
  expect(checkBoundaryDraft([square[0], square[1], square[0], square[2]]).error).toContain('overlap');
  expect(checkBoundaryDraft([[16, 79], [16.0000001, 79], [16.001, 79.001]]).error).toContain('overlap');
  expect(checkBoundaryDraft([[16, 79], [16, 79.001], [16, 79.002]]).error).toContain('form a line');
  expect(checkBoundaryDraft([[16, 79], [16.001, 79.001], [16.002, 79.002]]).error).toContain('form a line');
});

test('accepts concave land and rejects a nonadjacent side touching a corner', () => {
  expect(checkBoundaryDraft([[16, 79], [16, 79.002], [16.001, 79.001], [16.002, 79.002], [16.002, 79]]).error).toBe('');
  expect(checkBoundaryDraft([[16, 79], [16, 79.002], [16.002, 79.002], [16, 79.001], [16.002, 79]]).error).toContain('crosses itself');
  expect(checkBoundaryDraft([[16, 79], [16, 79.002], [16, 79.001], [16.001, 79.001], [16.001, 79]]).error).toContain('overlap');
});

test('refuses incomplete rings and invalid or unset coordinates', () => {
  expect(checkBoundaryDraft([]).error).toContain('three');
  for (const bad of [[NaN, 79], [16, Infinity], [91, 79], [16, 181], [0, 0]]) {
    expect(checkBoundaryDraft([bad as [number, number], ...square.slice(1)]).error).toContain('valid latitude');
  }
});
