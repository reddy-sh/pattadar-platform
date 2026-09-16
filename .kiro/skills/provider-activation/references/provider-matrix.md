# Provider Activation Matrix

| Provider | Main concerns |
|---|---|
| Cognito/social IdP | issuer/client/redirect URLs, PKCE, subject identity, pre-token claims, logout, legacy bindings |
| SES/email | verified domain/sender, sandbox exit, bounce/complaint, DPA, stub fallback |
| SMS/WhatsApp | consent/templates, sender approval, phone PII, retries/cost, DPA, stub fallback |
| Razorpay | test/live mode, webhook secret/signature, idempotency, reconciliation/refunds, disable path |
| Anthropic/model catalog | admin-owned enabled model, retention/DPA, token/cost, timeout/no retry, rollback model |
| Public records DB | SELECT-only role, statement timeout, independent health/capability, legal boundary |
| Push/mobile/store | credentials/entitlements, permissions, deep links, sandbox/device/store rollout |

For each: code ready → sandbox verified → security/vendor reviewed → production
configured → monitored → rollback tested. Do not collapse stages.
