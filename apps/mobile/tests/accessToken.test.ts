import { afterAll, beforeEach, expect, mock, test } from 'bun:test';

const saved = new Map<string, string>();
mock.module('expo-secure-store', () => ({
  getItemAsync: async (key: string) => saved.get(key) ?? null,
  setItemAsync: async (key: string, value: string) => { saved.set(key, value); },
  deleteItemAsync: async (key: string) => { saved.delete(key); },
}));
const { accessToken, storeTokens, clearTokens } = await import('../src/auth/accessToken');
const originalFetch = globalThis.fetch;
beforeEach(async () => { await clearTokens(); });
afterAll(() => { globalThis.fetch = originalFetch; });

test('Expo second-based issue times keep valid tokens usable without refresh', async () => {
  await storeTokens({ accessToken: 'valid', issuedAt: Math.floor(Date.now() / 1000), expiresIn: 3600 });
  globalThis.fetch = mock(() => { throw new Error('Unexpected refresh'); }) as unknown as typeof fetch;
  expect(await accessToken()).toBe('valid');
});

test('Concurrent expired requests share one refresh', async () => {
  await storeTokens({ accessToken: 'expired', refreshToken: 'refresh', issuedAt: 1, expiresIn: 1 });
  let calls = 0;
  globalThis.fetch = mock(async () => {
    calls++;
    return Response.json({ access_token: 'fresh', expires_in: 3600 });
  }) as unknown as typeof fetch;
  expect(await Promise.all([accessToken(), accessToken(), accessToken()])).toEqual(['fresh', 'fresh', 'fresh']);
  expect(calls).toBe(1);
});

test('A refresh finishing after logout cannot restore the signed-out session', async () => {
  await storeTokens({ accessToken: 'expired', refreshToken: 'alice', issuedAt: 1, expiresIn: 1 });
  let finish!: (response: Response) => void;
  let started!: () => void;
  const begun = new Promise<void>((resolve) => { started = resolve; });
  globalThis.fetch = mock(() => {
    started();
    return new Promise<Response>((resolve) => { finish = resolve; });
  }) as unknown as typeof fetch;
  const refreshing = accessToken();
  await begun;
  await clearTokens();
  finish(Response.json({ access_token: 'stale-alice', expires_in: 3600 }));
  expect(await refreshing).toBe('');
  expect(await accessToken()).toBe('');
  expect(saved.size).toBe(0);
});

test('A previous-account refresh cannot replace a newly signed-in account', async () => {
  await storeTokens({ accessToken: 'expired', refreshToken: 'alice', issuedAt: 1, expiresIn: 1 });
  let finish!: (response: Response) => void;
  let started!: () => void;
  const begun = new Promise<void>((resolve) => { started = resolve; });
  globalThis.fetch = mock(() => {
    started();
    return new Promise<Response>((resolve) => { finish = resolve; });
  }) as unknown as typeof fetch;
  const refreshing = accessToken();
  await begun;
  await storeTokens({ accessToken: 'bob', refreshToken: 'bob-refresh', issuedAt: Date.now(), expiresIn: 3600 });
  finish(Response.json({ access_token: 'stale-alice', expires_in: 3600 }));
  expect(await refreshing).toBe('');
  expect(await accessToken()).toBe('bob');
});
