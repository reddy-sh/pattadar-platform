import { afterEach, expect, test } from 'bun:test';

import { setAccessTokenProvider } from '../api/client';
import {
  fetchReading, fileFor, isWatched, rememberFile, reviewPath, unwatchJob, watchJob,
} from './inbox';

const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; setAccessTokenProvider(async () => null); });

test('a notice opens Add property filled from its own reading', () => {
  expect(reviewPath('abc')).toBe('/app/properties?reading=abc');
  expect(reviewPath('a/b?c')).toBe('/app/properties?reading=a%2Fb%3Fc');
});

test('a watched reading is not announced, and the file stays with its job for the tab', () => {
  watchJob('j1');
  expect(isWatched('j1')).toBe(true);
  unwatchJob('j1');
  expect(isWatched('j1')).toBe(false);
  const file = new File(['x'], 'deed.pdf', { type: 'application/pdf' });
  rememberFile('j1', file);
  expect(fileFor('j1')).toBe(file);
  expect(fileFor('other')).toBeUndefined();
});

test('a stored reading comes back in the same shape as a live one', async () => {
  globalThis.fetch = (async (path: string | URL | Request) => {
    expect(String(path)).toBe('/api/gateway/pattadar/import-status/j2');
    return Response.json({ state: 'done', fields: { doc_type: 'Sale Deed', document_no: '12', village: 'Katragunta' } });
  }) as typeof fetch;
  const r = await fetchReading('j2');
  expect(r.fields.document_no).toBe('12');
  expect(r.findings.map((f) => f.label)).toEqual(['Document no.', 'Village']);
});

test('an expired reading says so in the server’s words', async () => {
  globalThis.fetch = (async () => Response.json(
    { detail: 'This reading is unavailable or has expired. Send the document again.' }, { status: 404 },
  )) as typeof fetch;
  await expect(fetchReading('gone')).rejects.toThrow('has expired');
});
