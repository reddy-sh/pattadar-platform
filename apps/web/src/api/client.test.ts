import { afterEach, expect, test } from 'bun:test';
import { apiErrorMessage, apiFetch, requestTimeoutMs, setAccessTokenProvider } from './client';

const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; setAccessTokenProvider(async () => null); });

test('consent withdrawal remains actionable and proxy error pages use a readable fallback', async () => {
  const response = Response.json({detail:{error:'CONSENT_REQUIRED',message:'Update your account privacy choices before continuing.'}}, {status:403});
  expect(await apiErrorMessage(response, 'Upload unavailable')).toBe('Update your account privacy choices before continuing.');
  expect((await response.json()).detail.error).toBe('CONSENT_REQUIRED');
  expect(await apiErrorMessage(new Response('<html>gateway unavailable</html>', {status:502}), 'Try again.')).toBe('Try again.');
});

test('large uploads and streaming responses get enough time; normal requests stay bounded', () => {
  expect(requestTimeoutMs('/api/gateway/storage/files', { body: new FormData() })).toBe(600_000);
  expect(requestTimeoutMs('/api/gateway/storage/files/id/content', {})).toBe(600_000);
  expect(requestTimeoutMs('/api/gateway/assistant/chat/stream', {})).toBe(600_000);
  expect(requestTimeoutMs('/graphql', {})).toBe(20_000);
  expect(requestTimeoutMs('/graphql', { timeoutMs: 250 })).toBe(250);
});

test('document reads use a receipt and owner-authenticated polling, preserving extracted fields', async () => {
  const calls: string[] = [];
  setAccessTokenProvider(async () => 'signed-session');
  globalThis.fetch = (async (path: string | URL | Request, init?: RequestInit) => {
    calls.push(String(path));
    expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer signed-session');
    return Response.json(calls.length === 1 ? {job:'receipt'} : {state:'done',fields:{document_no:'123'}});
  }) as typeof fetch;
  const result = await apiFetch('/api/gateway/pattadar/import-registered-document', {method:'POST',body:new FormData()});
  expect(calls).toEqual(['/api/gateway/pattadar/import-registered-document-async','/api/gateway/pattadar/import-status/receipt']);
  expect((await result.json()).fields.document_no).toBe('123');
});

test('failed readings preserve the server error and are not submitted twice', async () => {
  let submits = 0;
  globalThis.fetch = (async (path: string | URL | Request) => {
    if (String(path).endsWith('-async')) { submits++; return Response.json({job:'receipt'}); }
    return Response.json({state:'failed',error:'Unreadable PDF'}, {status:422});
  }) as typeof fetch;
  const result = await apiFetch('/api/gateway/pattadar/import-passbook', {method:'POST',body:new FormData()});
  expect(result.status).toBe(422);
  expect((await result.json()).error).toBe('Unreadable PDF');
  expect(submits).toBe(1);
});

test('caller cancellation aborts an upload immediately', async () => {
  const controller = new AbortController();
  globalThis.fetch = (async (_path: unknown, init?: RequestInit) => new Promise((_, reject) => {
    init?.signal?.addEventListener('abort', () => reject(init.signal?.reason), {once:true});
    controller.abort(new DOMException('Cancelled', 'AbortError'));
  })) as typeof fetch;
  await expect(apiFetch('/upload', {method:'POST',body:new FormData(),signal:controller.signal})).rejects.toThrow('Cancelled');
});
