# Web Test Routing

Verified against retained suites on 2026-09-16.

| Need | Use | Contract |
|---|---|---|
| Fast screen/route/state/responsive behavior | `tests/e2e-app` | Sealed API fixtures; no real app data writes. Read `AUTHORING.md`. |
| Real API + disposable DB wiring/mutations | default `tests/e2e-web360` | Requires disposable `TEST_PG_DSN`; starts own API and built bundle. |
| Map drawing/portfolio/village behavior | `maps.config.ts` | Explicitly excluded from default Web360 config. |
| Public capability/account-data fixture flow | `capabilities.config.ts` | Use for that public surface only. |
| Expo compatibility navigation | `tests/e2e-mobile/*.yaml` | Maestro flows; no package runner is documented. |

## Sealed suite rules

- Import `test` from `../fixtures/harness`, never directly from Playwright.
- Do not edit shared fixtures for one scenario; override `world` in the test.
- Use roles/labels/text, web-first assertions, and no `waitForTimeout`.
- Never start a server or turn off the API escape guard.

## Web360 rules

- Use only a disposable PostgreSQL DSN.
- Keep one worker and deterministic reseeding for shared mutation state.
- Run the production bundle, not a dev-server approximation.
