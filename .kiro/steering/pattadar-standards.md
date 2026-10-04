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
- `apps/university` — Pattadar University content application.
- `apps/ios` — native SwiftUI app (PattadarKit); checked against generated vectors and the parity contract.
- `apps/mobile` — Expo/React Native compatibility client. `apps/mobile/ios` and `apps/mobile/android` are generated, never hand-edited.
- `services/api` — FastAPI + Strawberry GraphQL backend.
- `services/gateway` — Cognito token validation, storage API, reverse proxy, super-admin.
- `services/assistant` — in-app assistant service.
- `infra/terraform` — persistent/runtime module split under `envs/{dev,prod}/{persistent,runtime}`.
- `scripts` — operational scripts, guard scripts (`*-tests.ts`, `icon-guard.ts`, `ux-guards.ts`), and lifecycle scripts.
- `tests/*` — Bun workspace test packages (`e2e-web360`, `e2e-app`), plus the Maestro flows in `e2e-mobile`, which has no `package.json` on purpose (see its README).
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
5. New storage object keys are `{node}/{version}` — the owner is deliberately not in the key; authorization is decided in SQL, never by key prefix. Reads use the `object_key` stored on the version row, so pre-existing objects keep their original keys verbatim and metadata rows never change.
6. Dates render DD/MM/YYYY (India) everywhere.
7. One font, one component (design.md § Typography and § App-surface rules).
   `apps/web` and `apps/university` render every word in Atkinson Hyperlegible
   (400/700 + 400 italic) through the one token `--font-sans`; nothing else
   names a font family, a second face or a 500/600/800 weight, and digits align
   with `tabular-nums`. Screens compose the shared components
   (`apps/web/src/w360/ui.tsx`, `apps/web/src/components/`) and never build a
   page-local copy. Native iOS, Expo and PDF type are not covered yet
   (`docs/specs/TODO-one-platform.md`).
8. One document tree per logged-in user (Reddy, 03/10/2026). Every upload
   from any feature (member Aadhaar, property deeds, receipts, photos, and so
   on) is filed as a document under My files → feature → … and shows in the
   Documents folder, Drive-style. Feature folders sit at the root (e.g.
   Aadhaar holds the user's and every family member's card); there are no
   per-member top-level folders and no loose root files. A file's name says
   whose it is (e.g. "Aadhaar · <name>"), never the Aadhaar number. The tree is logical
   placement only: keys stay `{node}/{version}` (invariant 5), access is still
   decided in SQL, and Aadhaar stays masked. An upload path that bypasses
   Documents is a bug.

## Before finishing a change

- Apply `.kiro/steering/change-governance.md`: assess documentation,
  architecture, security/privacy, testing/evidence, and cleanup impact.
- Use `verify-change` to select the smallest sufficient checks. Code changes
  normally require typecheck and relevant tests; docs/skill-only changes need
  their own structural/link/schema checks rather than an unrelated Bun build.
- UI, CSS and icon changes run every `scripts/*-tests.ts` guard (including
  `typography-tests.ts` and `shared-components-tests.ts`) plus the UX/icon
  guards; cross-client contract changes include parity/vector checks chosen
  through the responsible specialist skill.
- Match existing file style; there is no ESLint/Prettier/Ruff config, so follow
  surrounding code and deterministic guard scripts.
