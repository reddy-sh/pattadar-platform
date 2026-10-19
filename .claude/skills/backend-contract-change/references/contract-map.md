# Backend Contract Map

## Entry-point classification

| Surface | Owner | Typical consumers | Gotcha |
|---|---|---|---|
| Root GraphQL schema | `services/api/src/main.py` | web/core, Expo and native iOS | iOS-facing; parity impact likely |
| W360 namespace | `services/api/src/web360.py` (`Query.web` / `Mutation.web`) | active web W360; native iOS Services screen | iOS reads only `servicesOffered`, `properties { cards }`, `orders` and `orderService` (`nativeServices` / `nativeOrderService` in `apps/ios/PattadarKit/Sources/PattadarKit/Networking/Queries.swift`); a change to those is ADAPT for iOS. Run `grep -n 'web {'` on that file before calling a `web360.py` hunk NOTE; otherwise do not invent Swift calls |
| Combined properties (product name Holding/Holdings; server keeps `combined*`) | `web360.py` (`combined*` fields, `combined_*` tables) | active web W360 only | an aggregate over records — never in `_cards`, never in portfolio totals, and a cost filed at its scope must not reach `land_expenses` |
| Gateway public/auth route | `services/gateway/src/main.py` (`StripIdentityHeadersMiddleware`), `src/auth.py`, `src/cognito_jwt.py`, `src/public_graphql.py`, `src/routes/*` | browsers/mobile/public tokens | strip inbound `x-user-id`; derive principal |
| Storage route | `services/gateway/src/storage.py`, `src/routes/storage.py` | documents/uploads | owner from validated JWT; access decided in SQL (`_access`); downloads stay proxied so share revocation is re-checked per read. The malware gate is only the S3 documents-bucket policy (denies `THREATS_FOUND`; unscanned objects are served, local MinIO has no gate); there is no gateway scan check |
| Share links | `web360.py` mutations (`create_share_link`, `create_document_share_link`, `revoke_share_link`, `extend_share_link`), `share_links` table | owner W360 | owner-scoped; tokens are looked up by `token_hash` |
| Recipient capability | `services/api/src/capabilities.py` + `services/gateway/src/routes/capabilities.py` | public share/work links | scope resolved server-side from the token; owner and file IDs never come from the caller |
| Assistant internal route | `services/assistant` | gateway/internal tools | keep internal namespace inaccessible publicly |
| Cron route | API inactivity endpoint | scheduler | `CRON_SECRET` is mandatory |
| Legacy extraction | API direct endpoints | older clients | preserve longer timeout and no auto retry |

## Trace sources

- Root-schema operations: `packages/core/src/api`, `apps/web/src/data/hooks.ts`.
- `Query.web` / `Mutation.web` callers: `apps/web/src/w360/api.ts`,
  `w360/groupsData.ts`, `assistant/serviceOrders.ts`, `assistant/proposals.ts`.
- Expo: `apps/mobile/src/data/hooks.ts`, `apps/mobile/src/api/client.ts`.
- Gateway bootstrap: `services/gateway/sql/init.sql` (run under
  `pg_advisory_lock`, `src/database.py`) and `services/gateway/tests`.
- API bootstrap/async jobs: `services/api/src` and `services/api/tests`.
- Assistant: `services/assistant`; SSE event names in
  `src/domain/sse_events.py` are a published contract read by
  `apps/web/src/assistant/AssistantPanel.tsx`. CI runs the whole
  `services/assistant/tests` suite. Assistant DDL (`_ensure_tables`) takes no
  lock; keep it strictly additive or add a lock.
- Native contract: `docs/specs/2026-08-22-web-ios-parity-contract.md` and
  `scripts/parity-map.json` (the contract still says iOS has no `web {`
  selection and the map bands `web360.py` NOTE; trust `Queries.swift`).

## Completion checklist

- [ ] Entry point and all callers identified.
- [ ] Authorization happens server-side and fails closed.
- [ ] Response/model/nullability compatibility reviewed.
- [ ] DDL is additive/idempotent under existing bootstrap locking.
- [ ] Async/idempotency/retry semantics preserved.
- [ ] Focused service + caller tests selected.
- [ ] iOS/parity impact classified ADAPT/NOTE/IGNORE; ADAPT goes to `sync-ios`.
