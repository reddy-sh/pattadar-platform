import { QueryClient } from '@tanstack/react-query';
import { expect, test } from 'bun:test';
import { emptyLike, liveQueryOptions } from './useLiveOrSample';

test('an unreachable service is an errored read, never 30 seconds of cached emptiness', async () => {
  const client = new QueryClient();
  let calls = 0;
  const options = liveQueryOptions(['pattadar', 'parcels'], async () => {
    calls++;
    if (calls === 1) throw new Error('offline');
    return ['parcel-1'];
  });

  await expect(client.fetchQuery(options)).rejects.toThrow('offline');
  const state = client.getQueryState(['pattadar', 'parcels']);
  expect(state?.status).toBe('error');
  // A stored empty dataset is what makes a screen say the account owns nothing.
  expect(state?.data).toBeUndefined();

  // The next read is a real request, not the failure served from cache.
  expect(await client.fetchQuery(options)).toEqual(['parcel-1']);
  expect(calls).toBe(2);
});

test('the failure shape keeps every consumer type-safe with no invented values', () => {
  expect(emptyLike({ stats: { totalPassbooks: 3, name: 'Sankara', active: true }, parcels: [{ id: 'p1' }] }))
    .toEqual({ stats: { totalPassbooks: 0, name: '', active: false }, parcels: [] });
});
