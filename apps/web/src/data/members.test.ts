import { afterEach, expect, test } from 'bun:test';
import { membersByGroup } from './hooks';

const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });

/** Answer every `mN: members(...)` alias in the document with one row naming
 *  the group id it was asked for. */
function stubGraphQL(sent: string[]) {
  globalThis.fetch = (async (_path: string, init: RequestInit) => {
    const { query, variables } = JSON.parse(String(init.body)) as {
      query: string; variables: Record<string, string>;
    };
    sent.push(query);
    const data: Record<string, Array<{ id: string }>> = {};
    for (const [name, gid] of Object.entries(variables)) data[`m${name.slice(1)}`] = [{ id: gid }];
    return Response.json({ data });
  }) as unknown as typeof fetch;
}

test('one request per batch, and never a document the schema rejects for aliases', async () => {
  const sent: string[] = [];
  stubGraphQL(sent);
  const ids = Array.from({ length: 60 }, (_, i) => `g-${i}`);

  const out = await membersByGroup<{ id: string }>(ids, 'id');

  expect(sent.length).toBe(3);
  // main.py caps a document at 30 aliases; over it the whole read fails.
  for (const query of sent) expect((query.match(/m\d+: members\(/g) ?? []).length).toBeLessThanOrEqual(30);
  expect(out.map(([gid]) => gid)).toEqual(ids);
  expect(out.map(([, members]) => members[0].id)).toEqual(ids);
});

test('no groups is no request at all', async () => {
  const sent: string[] = [];
  stubGraphQL(sent);
  expect(await membersByGroup([], 'id')).toEqual([]);
  expect(sent.length).toBe(0);
});
