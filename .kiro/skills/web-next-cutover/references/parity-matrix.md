# Web-next Parity Matrix

Start from current `apps/web/src/routes.tsx` and executable service contracts.
README phase labels and historical Next plans are secondary evidence.

| Area | Required evidence before cutover |
|---|---|
| Public/auth/legal | route, Cognito callback/native auth, verification, share/work token portals, account/payment pages |
| W360 app | dashboard, properties, records/hangers, vault/reader, map/village, services/tickets/wallet, groups, desk |
| Repaired controls | immutable identity, scoped recipient access, consent/account export/erasure, durable extraction/attachments |
| Gateway/service | same-origin paths, SSE assistant, storage bytes, payment webhook/checkout, no direct API exposure |
| Compatibility | legacy/bookmarked routes and shipped `/app/tickets/:id/pay` redirect |
| UX | loading/empty/error, themes/high contrast, responsive/focus/reduced motion, copy freeze |
| Testing | retained sealed UI scenarios + disposable DB wiring/maps/public capability tests |
| Operations | Docker standalone output, health check, CloudFront/ALB mode, env/secrets, rollback/cache behavior |

Status each item: missing, partial, implemented-unverified, tested, externally
verified. Only the last two can support cutover; external provider/deployment
state remains separate evidence.
