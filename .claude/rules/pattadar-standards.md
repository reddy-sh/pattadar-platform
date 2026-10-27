# Pattadar platform — coding and folder standards

These are project standards for `pattadar-platform`. They are sourced from
`README.md` and `design.md`; if this file and those disagree, prefer the
README/design and flag the drift.

## Folder layout (place new code accordingly)

- `packages/core` — shared TypeScript: GraphQL client/types, domain logic, DD/MM/YYYY formatting.
- `packages/tokens` — design tokens (colour schemes, font stack, spacing, radii, motion) feeding the MUI themes of `apps/web` and `apps/university`; Expo uses only `spacing` and `radii` (`apps/mobile/src/theme/paper.ts` keeps its own colours).
- `apps/web` — active React + MUI web app (W360).
- `apps/university` — Pattadar University content application.
- `apps/ios` — native SwiftUI app (PattadarKit); checked against generated vectors and the parity contract.
- `apps/mobile` — Expo/React Native compatibility client. `apps/mobile/ios` and `apps/mobile/android` are generated, never hand-edited.
- `services/api` — FastAPI + Strawberry GraphQL backend.
- `services/gateway` — Cognito token validation, storage API, reverse proxy, super-admin.
- `services/assistant` — in-app assistant service.
- `infra/terraform` — persistent/runtime module split under `envs/{dev,prod}/{persistent,runtime}`, plus the module-free University root `envs/prod/university`; CI validates every root in the `ci.yml` terraform-validate matrix (five today).
- `governance/custodian` — report-only Cloud Custodian policies; `data/vm` — village-map KMZ sources; `.github/workflows` — CI, deploy and lifecycle workflows.
- `scripts` — operational scripts, guard scripts (`*-tests.ts`, `icon-guard.ts`, `ux-guards.ts`), and lifecycle scripts.
- `tests/*` — Bun workspace test packages (`e2e-web360`, `e2e-app`), plus the Maestro flows in `e2e-mobile`, which has no `package.json` on purpose (see its README).
- `docs` — architecture, specs, runbooks, compliance.

## Stack (do not introduce alternatives without discussion)

- Package manager: Bun 1.3.14 workspaces. No pnpm.
- Web: React 19.2, MUI 9.2, Vite 8.1, TypeScript 7.0, React Router 8.3, TanStack Query 5. No Ant Design, no webpack/module federation.
- Backend: Python FastAPI + Strawberry GraphQL, PostgreSQL 17.
- Infra: Terraform ≥1.10, AWS provider 6.x.
- Auth: Amazon Cognito. AI: Anthropic API. README.md § Repository stack lists the rest.

## Key invariants (never break)

1. `services/api` trusts the `x-user-id` header — it must never be reachable except through the gateway. The one declared exception (docs/architecture.md; README invariant 1 omits it) is the CloudFront api-distribution exact-path behaviour `/cron/inactivity-check` → api VPC origin (`infra/terraform/modules/runtime/api_edge.tf`), guarded by `CRON_SECRET` and reading no `x-user-id`; inside the shared ECS host the api requires the gateway-only `INTERNAL_PROXY_SECRET` on every path but `/health` and that cron path (`services/api/src/private_ingress.py`; approved by Reddy 26/10/2026). Flag any other behaviour, origin or ingress reaching the api/assistant, or a wider path.
2. Identity uses the immutable issuer and subject, never the email local part. Legacy owner keys are reachable only through the reviewed `IDENTITY_LEGACY_BINDINGS` mapping.
3. AI readings use durable async jobs and authenticated status polls on web (also iOS registered-document reads and Expo Aadhaar reads). An interrupted provider call is never automatically repeated. The direct synchronous endpoints remain for older clients (iOS passbook reads, Expo passbook and deed reads); they are not violations to remove, and their callers need the longer operation budget.
4. `CRON_SECRET` is always set — without it the API refuses to start (unless `ALLOW_INSECURE_LOCAL=1`) and `/cron/inactivity-check` returns 503, so the daily household safeguard does not run (README invariant 4's "open without it" is stale).
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
   Documents is a bug. Drift: `services/api/src/web360.py`
   (`ensure_person_folder`, "Aadhaar card"), `test_vault_folders.py` and spec
   FM-009 still build a per-person tree; do not restructure placement either
   way — stop and ask Reddy.
9. One page head, locked (Reddy, 09/10/2026; design.md § Page head). Every
   signed-in screen opens with `PageHead` (`apps/web/src/w360/ui.tsx`),
   never a hand-built header or `<h1>`; a new feature adopts it and gets no
   variant. Every top-level rail page carries a `summary` line of its own
   figures under the title, as Properties does ("1 property · 5.00 ac"):
   facts, never a tagline; a placeholder while the first read is pending;
   none on a failed read or a first-run empty page. Commands are
   `HeadActions` data (one filled primary, then the ⋮ last); filter, tally, search,
   sort and view sit in the toolbar band. `scripts/shared-components-tests.ts`
   (SC-H*, run in CI) and `tests/e2e-app/specs/31-page-head.spec.ts` fail a
   screen that drifts; changing the standard is Reddy's decision.
10. One table standard (Reddy, 10/10/2026; design.md § Tables). Every data
   table has tick boxes (SelectAllBox + SelectCell), a `<tfoot>` total that
   sums the selection, `SelectionBar` with Export and `TablePager` (20
   default); every table with ticks or sums has the total whatever its size;
   every collection page offers Grid · Table (`ViewToggle`; "Table", never
   "List"); a table inside a section opens with `SectionHead`. Smallness, no
   bulk action and "only one view" are not exemptions. SC-S1/SC-T* in
   `scripts/shared-components-tests.ts` fail a screen that drifts.

## Before finishing a change

- Apply `.claude/rules/change-governance.md`: assess documentation,
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
