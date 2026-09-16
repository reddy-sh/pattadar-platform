---
inclusion: always
---

# Pattadar platform — coding and folder standards

These are project standards for `pattadar-platform`. They are sourced from
`README.md` and `design.md`; if this file and those disagree, prefer the
README/design and flag the drift.

## Folder layout (place new code accordingly)

- `packages/core` — shared TypeScript: GraphQL client/types, domain logic, DD/MM/YYYY formatting.
- `packages/tokens` — design tokens feeding the MUI and React Native Paper themes.
- `apps/web` — active React + MUI web app (W360).
- `apps/web-next` — staged Next.js client; only shipped when `WEB_ORIGIN` is set for it.
- `apps/ios` — native SwiftUI app (PattadarKit); checked against generated vectors and the parity contract.
- `apps/mobile` — Expo/React Native compatibility client. `apps/mobile/ios` and `apps/mobile/android` are generated, never hand-edited.
- `services/api` — FastAPI + Strawberry GraphQL backend.
- `services/gateway` — Cognito token validation, storage API, reverse proxy, super-admin.
- `services/assistant` — in-app assistant service.
- `infra/terraform` — persistent/runtime module split under `envs/{dev,prod}/{persistent,runtime}`.
- `scripts` — operational scripts, guard scripts (`*-tests.ts`, `icon-guard.ts`, `ux-guards.ts`), and lifecycle scripts.
- `tests/*` — Bun workspace test packages (`e2e-web360`, `e2e-app`, `e2e-mobile`).
- `docs` — architecture, specs, runbooks, compliance.

## Stack (do not introduce alternatives without discussion)

- Package manager: Bun 1.3.14 workspaces. No pnpm.
- Web: React 19.2, MUI 9.2, Vite 8.1, TypeScript 7.0, TanStack Query 5. No Ant Design, no webpack/module federation.
- Backend: Python FastAPI + Strawberry GraphQL, PostgreSQL 17.
- Infra: Terraform ≥1.10, AWS provider 6.x.

## Key invariants (never break)

1. `services/api` trusts the `x-user-id` header — it must never be reachable except through the gateway.
2. Identity uses the immutable issuer and subject, never the email local part. Legacy owner keys are reachable only through the reviewed `IDENTITY_LEGACY_BINDINGS` mapping.
3. AI readings use durable async jobs and authenticated status polls. An interrupted provider call is never automatically repeated.
4. `CRON_SECRET` is always set — the inactivity-check endpoint is open without it.
5. Storage object keys `{owner}/{node}/{version}` are migrated verbatim; metadata rows never change.
6. Dates render DD/MM/YYYY (India) everywhere.

## Before finishing a change

- Apply `.kiro/steering/change-governance.md`: assess documentation,
  architecture, security/privacy, testing/evidence, and cleanup impact.
- Use `verify-change` to select the smallest sufficient checks. Code changes
  normally require typecheck and relevant tests; docs/skill-only changes need
  their own structural/link/schema checks rather than an unrelated Bun build.
- UI/icon changes include UX/icon guards; cross-client contract changes include
  parity/vector checks chosen through the responsible specialist skill.
- Match existing file style; there is no ESLint/Prettier/Ruff config, so follow
  surrounding code and deterministic guard scripts.
