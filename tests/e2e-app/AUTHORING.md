# Writing a spec in this suite

Read this before adding a file to `specs/`. It is the whole contract.

## What this suite is

The app on **:5173** — the dev server the founder is already running — driven
end to end, with **every request under `/api` answered from fixtures before it
leaves the browser**. Nothing is read from the founder's records and nothing is
written to them. That seal is why the suite can point at a live stack and still
be safe to run at any moment, in parallel, hundreds of times.

It is not the integration gate. `tests/e2e-web360` stands up its own API,
database and bundle and proves the wiring; this one proves the **screens** —
every route, every state, every control — against data the test chose.

## The three lines every spec starts with

```ts
import { test, expect, World } from '../fixtures/harness';
import { ID, PAPER, FEATURE, TICKET, SHELVES } from '../fixtures/ids';
```

Never import `test` from `@playwright/test` directly. The harness one carries
the seal, the session, the basemap stubs and the two guards.

## What arrives already done

- **Signed in.** `/app` is behind `RequireAuth` and the dev server runs a real
  Cognito pool, so the harness writes a session into localStorage before the
  first render. `test.use({ signedIn: false })` for the signed-out doors.
- **Sealed.** Every `/api` call is answered from `fixtures/seed.ts`.
- **Basemaps stubbed.** Tiles and the geocoder answer locally.
- **Guards.** A console error or an unanswered `/api` call fails the test.

## The world

`world` is the switchboard. Change an answer, then navigate — order matters,
because a change made after `goto` arrives after the screen has already asked.

```ts
world.set('portfolio', { ...world.seedOf('portfolio'), waiting: [] });
world.patch('vault', { total: 0 });                    // keep the rest of the shape
world.set('record', World.gqlError('the record store is down'));
world.set('papers', World.httpError(503));
world.set('properties', World.never());                // stays loading
world.set('orders', World.slow(1500, []));             // answers, late
world.set('deletePaper', false);                       // a refused mutation
world.set('ticket', (vars) => vars.id === TICKET.closed ? null : seedTicket);
```

And to assert what the app asked for:

```ts
await expect.poll(() => world.asked('boundary')).toBe(true);
expect(world.lastVars('record')).toMatchObject({ id: ID.parcel });
expect(world.calls('setTag')).toHaveLength(1);
expect(world.restCalls(/storage\/nodes/)).toHaveLength(1);   // an upload happened
```

Non-GraphQL paths — storage bytes, payments config, consent, the assistant —
are seeded too, and overridable per test:

```ts
world.route(/\/api\/gateway\/pattadar\/payments\/config/, () => ({ json: { enabled: true, mode: 'test', live: false } }));
```

## Rules

1. **Never edit `fixtures/`.** Not `seed.ts`, not `world.ts`, not `harness.ts`,
   not `ids.ts`. If your scenario needs different data, set it in the test with
   `world.set` / `world.patch`. Many specs are written at once and a shared
   file edited by two of them loses one of the edits.
2. **Assert what a person would see**, in the app's own words. Prefer
   `getByRole`, `getByLabel`, `getByText` over CSS. A class name is a last
   resort and deserves a comment saying why nothing better existed.
3. **No `waitForTimeout`.** Use web-first assertions (`await expect(x).toBeVisible()`)
   and `expect.poll` for world state. They retry; a sleep does not.
4. **One scenario per test**, and the title is a SENTENCE about behaviour, in
   the founder's voice — "an archived record stops asking for things on the
   Dashboard", not "test archive filter". Look at `tests/e2e-web360/specs` for
   the register.
5. **A defect you find is a `test.fail()`**, with a comment naming the file and
   line of the cause and what the owner is owed. Do not soften an assertion to
   make it pass, and do not delete the scenario. A `test.fail()` goes green the
   day the defect is fixed, which is exactly what it is for.
6. **Tag responsive tests `@phone`** in the title. They run in the phone
   project at 390px. `@phone-only` keeps a test out of the desktop project.
7. **Never start a server**, never write to the founder's data, never call the
   real API. The seal enforces this; do not turn it off.
8. `test.use({ allowConsole: true })` only for a test whose point is an error,
   and say so in a comment.

## The world in one glance

Six records (`fixtures/ids.ts`): `ID.parcel` is surveyed farm land with papers,
features, people and photos; `ID.plot` is unsurveyed and nearly empty;
`ID.flat` is built, with a ledger and expenses; `ID.shop` is archived;
`ID.watched` is somebody else's; `ID.missing` resolves to null.

Eight tickets, one per stage (`TICKET.placed` … `TICKET.cancelled`). Eight
vault shelves (`SHELVES`). Three share links, one of them lapsed.

## Running yours

```sh
cd tests/e2e-app
./node_modules/.bin/playwright test --project=app specs/<your-file> --reporter=line
```
