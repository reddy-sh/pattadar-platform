# Web Test Routing

Verified against retained suites on 09/10/2026.

| Need | Use | Contract |
|---|---|---|
| Static design rules: one face, weights, shared components, colour literals | `bun run scripts/typography-tests.ts`, `scripts/shared-components-tests.ts`, `scripts/a11y-web-tests.ts` (all `scripts/*-tests.ts`), then `scripts/ux-guards.ts` and `scripts/icon-guard.ts` | Source only, no browser; run on every UI/CSS change, as CI does. Budgets only go down. |
| What face the browser actually draws | `tests/e2e-app/specs/26-one-font.spec.ts` | Sealed; both projects; catches user-agent and third-party CSS (Leaflet) defaults a source scan cannot see. |
| Fast screen/route/state/responsive behavior | `tests/e2e-app` | Sealed API fixtures; no real app data writes. Read `AUTHORING.md`. |
| Real API + disposable DB wiring/mutations | default `tests/e2e-web360` | State the scope and get approval first. `TEST_PG_DSN` names a `_test`/`_ci`/`_e2e` database, initialized with `APP_PG_DSN=<same dsn> .local/api-venv/bin/python scripts/init-test-db.py`; the suite starts its own API (:18080) and built bundle (:5175). Afterwards remove the run's `.local/e2e-web360-dist-<port>` and, in `tests/e2e-web360/`, `test-results-<port>`, `playwright-report-<port>` and `results-<port>.json`. |
| Map drawing/portfolio/village behavior | `maps.config.ts` | Explicitly excluded from default Web360 config. |
| Public capability/account-data fixture flow | `capabilities.config.ts` | Use for that public surface only. |
| Expo compatibility navigation | `tests/e2e-mobile/*.yaml` (Maestro) | Not a web instrument. Run by a human only, with approval: booted simulator, installed app, signed-in backend, unsealed. Otherwise report NOT_RUN; see the [harness map](../../test-governance/references/harness-map.md). |

## Sealed suite rules

- Import `test` from `../fixtures/harness`, never directly from Playwright.
- Do not edit shared fixtures for one scenario; override `world` in the test.
- Use roles/labels/text, web-first assertions, and no `waitForTimeout`.
- Never start a server or turn off the API escape guard.

## Web360 rules

- Use only a disposable PostgreSQL DSN.
- Keep one worker and deterministic reseeding for shared mutation state.
- Run the production bundle, not a dev-server approximation.
