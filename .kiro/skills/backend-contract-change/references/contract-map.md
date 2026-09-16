# Backend Contract Map

## Entry-point classification

| Surface | Owner | Typical consumers | Gotcha |
|---|---|---|---|
| Root GraphQL schema | `services/api/src/main.py` | web/core and native iOS | iOS-facing; parity impact likely |
| W360 namespace | `services/api/src/web360.py` (`Query.web`) | active web W360 | iOS does not read it; do not invent Swift calls |
| Gateway public/auth route | `services/gateway/app/main.py`, auth modules | browsers/mobile/public tokens | strip inbound `x-user-id`; derive principal |
| Storage/share route | gateway storage modules | documents/shares | server-side owner/scope + scan gate |
| Assistant internal route | `services/assistant` | gateway/internal tools | keep internal namespace inaccessible publicly |
| Cron route | API inactivity endpoint | scheduler | `CRON_SECRET` is mandatory |
| Legacy extraction | API direct endpoints | older clients | preserve longer timeout and no auto retry |

## Trace sources

- Web operations/hooks: `packages/core/src/api`, `apps/web/src/data/hooks.ts`.
- Gateway schema/bootstrap: `services/gateway/sql/schema.sql` and service tests.
- API bootstrap/async jobs: `services/api/src` and `services/api/tests`.
- Assistant attachment/runtime contracts: `services/assistant` and selected CI
  tests.
- Native contract: `docs/specs/2026-08-22-web-ios-parity-contract.md` and
  `scripts/parity-map.json`.

## Completion checklist

- [ ] Entry point and all callers identified.
- [ ] Authorization happens server-side and fails closed.
- [ ] Response/model/nullability compatibility reviewed.
- [ ] DDL is additive/idempotent under existing bootstrap locking.
- [ ] Async/idempotency/retry semantics preserved.
- [ ] Focused service + caller tests selected.
- [ ] iOS/parity impact classified ADAPT/NOTE/IGNORE.
