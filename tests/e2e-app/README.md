# tests/e2e-app — the scenario suite for the app on :5173

The app the founder actually has open, driven end to end, with **every request
under `/api` answered from fixtures before it leaves the browser**.

```sh
cd tests/e2e-app
bun run test          # the whole sealed suite, desktop
bun run test:phone    # the 390px scenarios
bun run test:live     # the unsealed read-only smoke (needs start-local.sh up)
bun run report        # the HTML report from the last run
```

It starts no servers. If nothing is serving `:5173`, the run stops with one
sentence saying so instead of a wall of navigation timeouts.

## Why this exists next to the integration suite

| suite | what it drives | what it proves | what it costs |
|---|---|---|---|
| `e2e-web360` | its own API (:18080), built bundle (:5175), and seeded identity | the **wiring** — real mutations against a disposable database | a build, a database, ~6 min |
| **`e2e-app`** | the founder's running web bundle, changing **nothing** | the **screens** — routes, states, controls, responsiveness | seconds |

Mobile compatibility flows live as Maestro YAML under `tests/e2e-mobile`. The
removed historical `e2e-deeds` and `e2e-ux` suites are not current test
instruments.

The seal is the point. Because the test chooses the data, this suite can assert
things no seeded database can hold at once: a portfolio with nothing in it *and*
a portfolio with five records; a server that answers in thirty seconds; a ticket
in each of its eight stages; a paper whose bytes are refused. And because
nothing is written, it is safe to run while the founder is working in the same
browser.

## What is faked, and what is not

Exactly one thing is faked beyond the API answers: **the sign-in**.
`start-local.sh` builds the bundle against a real Cognito pool, so `RequireAuth`
bounces a fresh browser to `/login`, and the web app has no offline dev door —
only the phone has one. So a session is written into the localStorage keys
`amazon-cognito-identity-js` reads, before the first render. In the sealed
projects that session is a synthetic JWT that never leaves the browser; in the
`@live` project it is a real token minted from the local trust root
(`POST :8082/local-auth/token`).

The app client id those keys are spelled with is **discovered** from the running
dev server, not hard-coded — Vite inlines `VITE_COGNITO_CLIENT_ID` into the
module it serves. Override with `APP_COGNITO_CLIENT_ID` if you are pointing at
a built bundle.

Everything else is the real app: the real bundle, the real router, the real
React Query cache, the real components, the real CSS.

## Layout

```
fixtures/
  world.ts        the seal and the switchboard (set / patch / never / gqlError / slow / route)
  seed.ts         what every one of the 67 `web` fields answers with by default
  ids.ts          the cast — six records, eight tickets, eight shelves, the route tables
  session.ts      the one thing that is faked
  harness.ts      `test` with all of the above already installed
  global-setup.ts is the portal even there?
specs/            one file per screen cluster
AUTHORING.md      read this before adding a spec
```

## Environment

| variable | default | what it does |
|---|---|---|
| `APP_WEB_URL` | `http://localhost:5173` | the portal under test |
| `APP_COGNITO_CLIENT_ID` | discovered, then `10okivmth…` | how the session keys are spelled |
| `APP_USER` | `shankarreddy.t` | who the session belongs to |
| `APP_GATEWAY_URL` | `http://localhost:8082` | where `@live` mints its real token |

## Reading a failure

Two guards fail tests that would otherwise pass quietly:

- **console** — a `console.error` or an uncaught exception fails the test that
  caused it. `test.use({ allowConsole: true })` for a test whose point is an error.
- **escape** — an `/api` call the world has no answer for is refused with a 501
  *and* fails the test at teardown, naming it. That is deliberate: a query that
  gained a field, or a screen that started making a new call, shows up here as
  a failure rather than as a blank panel nobody notices. Answer it in the test
  with `world.set` / `world.route` — never by loosening the seal.
