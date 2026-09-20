import { afterEach, expect, test } from 'bun:test';
import {
  apiFetch,
  gql,
  GraphQLRequestError,
  SESSION_ENDED_MESSAGE,
  setUnauthorizedHandler,
} from './client';

const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; setUnauthorizedHandler(() => {}); });

test('an expired session is reported to the auth layer and read as a sentence, not an HTTP status', async () => {
  let ended = 0;
  setUnauthorizedHandler(() => { ended++; });
  globalThis.fetch = (async () => new Response('', { status: 401 })) as typeof fetch;
  await expect(gql('query { me { name } }')).rejects.toThrow(SESSION_ENDED_MESSAGE);
  expect(ended).toBe(1);
});

test('a 401 still reaches the caller as a response, so per-screen handling is unchanged', async () => {
  let ended = 0;
  setUnauthorizedHandler(() => { ended++; });
  globalThis.fetch = (async () => Response.json({ detail: 'Not authenticated' }, { status: 401 })) as typeof fetch;
  const res = await apiFetch('/api/gateway/storage/files');
  expect(res.status).toBe(401);
  expect(ended).toBe(1);
});

test('a healthy response never reports an ended session', async () => {
  let ended = 0;
  setUnauthorizedHandler(() => { ended++; });
  globalThis.fetch = (async () => Response.json({ data: { me: { name: 'Sankara' } } })) as typeof fetch;
  expect(await gql<{ me: { name: string } }>('query { me { name } }')).toEqual({ me: { name: 'Sankara' } });
  expect(ended).toBe(0);
});

test('a GraphQL error carries the server code so screens need not match English prose', async () => {
  globalThis.fetch = (async () => Response.json({
    errors: [{ message: 'This link has already been used.', extensions: { code: 'LINK_ALREADY_USED' } }],
  })) as typeof fetch;
  const error = await gql('mutation { verifyBeneficiary(token:"t") { id } }').catch((e: unknown) => e);
  expect(error).toBeInstanceOf(GraphQLRequestError);
  expect((error as GraphQLRequestError).code).toBe('LINK_ALREADY_USED');
  expect((error as Error).message).toBe('This link has already been used.');
});

test('a GraphQL error without extensions still throws, with no code', async () => {
  globalThis.fetch = (async () => Response.json({ errors: [{ message: 'boom' }] })) as typeof fetch;
  const error = await gql('query { me { name } }').catch((e: unknown) => e);
  expect(error).toBeInstanceOf(GraphQLRequestError);
  expect((error as GraphQLRequestError).code).toBeUndefined();
});
