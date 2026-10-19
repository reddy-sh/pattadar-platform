# Provider Activation Matrix

| Provider | Main concerns | Where it lives |
|---|---|---|
| Cognito/social IdP | issuer/client/redirect URLs, PKCE, subject identity, pre-token claims, logout, legacy bindings | `infra/terraform/modules/persistent/cognito.tf`, `secrets.tf` (`idp-social`), `docs/runbooks/identity-migration.md` |
| Cognito email (SES) | Cognito sends with `COGNITO_DEFAULT` today; moving to SES needs the pattadar.com identity verified after the NS switch and SES sandbox exit | `cognito.tf` (`email_configuration`), `ses.tf`, `docs/runbooks/account-bootstrap.md` §9–10 |
| Email (app) | Resend: `NOTIFY_EMAIL_PROVIDER=resend`, `RESEND_API_KEY`, `NOTIFY_EMAIL_FROM`, sender-domain verification, DPA, `Idempotency-Key`; bodies carry live bearer links | `services/api/src/notify.py`, `docs/runbooks/scoped-recipient-access.md` |
| SMS/WhatsApp | MSG91 (`MSG91_AUTHKEY`, `MSG91_SENDER`, `MSG91_DLT_TEMPLATE_ID`), Meta WhatsApp (`WHATSAPP_TOKEN`, `WHATSAPP_PHONE_ID`, approved `pattadar_service_access_v1` template); consent, phone PII, cost, DPA; bodies carry live bearer links | `notify.py`, `scoped-recipient-access.md` |
| Razorpay | test/live mode (`PAYMENTS_MODE`, `RAZORPAY_LIVE_CONFIRMED`), webhook secret/signature, idempotency, reconciliation/refunds. Disable path: `off` or a mode switch stops that mode's worker, refunds, transfers and capture recovery, so disable only after its `payment_intents` and `payment_operations` are settled, keep its keys and webhook until then, and never switch modes on open tickets | `services/api/src/payments.py`, `payments_provider.py`, `docs/runbooks/razorpay-payments.md` |
| Anthropic: assistant | admin-enabled model in the gateway `platform_models` catalog (enable and roll back there); known gap: cold-start fallback to a hardcoded list; retention/DPA, token/cost, timeout/no retry | `services/gateway/src/ai_catalog/`, `docs/architecture/ai-inventory.yaml` |
| Anthropic: document reading | model pinned in code (`IMPORT_MODEL`), not the catalog, so change and rollback are code plus deploy; never repeat an interrupted call; budget one low-effort re-read on `max_tokens` (a second paid call) | `services/api/src/ai_reading/config.py`, `ai_reading/providers/anthropic.py` |
| Other model provider (e.g. TypeSafe) | a new provider is a reserved decision; DPA and retention, minimised redacted data only, key custody, `pattadar-security-review`; record it in `ai-inventory.yaml` and the processor register | `docs/architecture/ai-system.md`, `ai-inventory.yaml` |
| Public records DB | SELECT-only role (runtime uses `pattadar_app` with `READ ONLY` transactions today), statement timeout, independent health/capability, legal boundary | `services/assistant/src/public_records/` |
| Browser push (VAPID) | `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` (off unless all three are set); key generation, custody and a re-subscription plan for rotation; empty payload only; push-host allowlist | `services/api/src/inbox.py`, `scripts/vapid-keys.py` |
| Maps/geocoding | keyless OSM tiles, Esri World Imagery and Nominatim search called from the browser; usage terms, attribution, what a search sends; not in the processor register | `apps/web/src/components/GeoMap.tsx`, `apps/web/src/w360/MapCanvas.tsx`; every call site: `grep -rli -e openstreetmap -e arcgisonline -e nominatim apps/web/src` |
| Mobile/store | credentials/entitlements, permissions, deep links, sandbox/device/store rollout; remote push is not built (Expo posts local notifications only) | `apps/mobile/src/lib/notify.ts` |

Notifications: the stub succeeds only in `APP_ENV` local/test; elsewhere a
missing provider is a recorded, failed, non-retried send
(`provider_not_configured`). The api task gets no `NOTIFY_*`, `RESEND_*`,
`MSG91_*`, `WHATSAPP_*` or `VAPID_*` env and the `notify-providers` secret is not
injected (`infra/terraform/modules/runtime/ecs.tf`); that wiring is runtime
Terraform, so compose with `infrastructure-change`.

One `anthropic-api-key` secret is injected into the gateway, api and assistant
tasks (`ecs.tf`): rotating or revoking it affects all three.

For each: code ready → sandbox verified, including the disable/rollback path
(and for Razorpay the refund drill) → security/vendor reviewed → production
configured → monitored. Do not collapse stages.
