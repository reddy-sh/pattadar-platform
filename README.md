# Pattadar Platform

Standalone AWS platform for **Pattadar** — the Andhra Pradesh land-records application (parcels, passbooks, registered deeds, non-agricultural property, family groups, beneficiary verification, AI document extraction).

This repository is both the product and the **template**: the layout, Terraform module, and gateway are designed so future apps can be stamped out the same way (new repo → instantiate the `app-stack` Terraform module → new `services/<app>` + UI heads over the same patterns).

Extracted from the predecessor platform (local Kind/k8s) per the design in [docs/specs/2026-07-25-standalone-platform-design.md](docs/specs/2026-07-25-standalone-platform-design.md).

## Architecture

**One core, two heads.** Web and mobile do not compromise each other: the web app is best-in-class MUI, the mobile app is true native (Expo/React Native). Everything that is not markup — GraphQL operations and types, domain logic, validation, formatting — lives once in `packages/core`.

```
                    ┌───────────────────────────────┐
                    │  packages/core   (shared TS)  │
                    │  packages/tokens (design)     │
                    └───────┬───────────────┬───────┘
                            │               │
                   ┌────────▼─────┐  ┌──────▼────────┐
                   │  apps/web    │  │  apps/mobile  │
                   │  React + MUI │  │  Expo / RN    │
                   └────────┬─────┘  └──────┬────────┘
                            │               │
        Route53 + ACM → CloudFront (+WAF)   │ (same API, same tokens)
                            │               │
                       ALB (idle ≥200s) ◄───┘
                            │
     ┌──────────────────────┼──────────────────────────┐
     │ services/gateway     │ services/api             │ services/assistant
     │ Cognito JWT→x-user-id│ pattadar FastAPI +       │ (Phase 3)
     │ storage API (S3)     │ Strawberry GraphQL,      │ LLM assistant,
     │ proxy, super-admin   │ AI extraction (Anthropic)│ no MCP in v1
     └──────────┬───────────┴───────────┬──────────────┘
                │                       │
        S3 documents bucket      RDS PostgreSQL 17
        (SSE-KMS, versioning,    (databases: pattadar, hub)
         GuardDuty malware)
```

Region: **ap-south-1 (Mumbai)**. Auth: **Amazon Cognito** (ap-south-1, Essentials tier — user identity format is preserved exactly). AI extraction: direct Anthropic API (Bedrock ap-south-1 documented as a future data-residency option).

### Hosts (domain: pattadar.com)

| Host | Serves |
|---|---|
| `pattadar.com` | Public landing page at `/` + the Cognito-gated web app under `/app/*` — one SPA via CloudFront |
| `www.pattadar.com` | Same CloudFront distribution |
| `api.pattadar.com` | ALB directly — EventBridge cron target + direct API access |
| `pattadar-auth-<env>` (Cognito prefix domain) | Cognito hosted-UI auth for the pilot (custom `auth.pattadar.com` later) |

Browser app traffic stays **same-origin**: the SPA calls `/api/*` on `pattadar.com`, which CloudFront routes to the ALB origin — no CORS.

## Repository layout

| Path | What it is |
|---|---|
| `packages/core` | Shared TypeScript: GraphQL client/types, domain logic (land calc, dashboard math, document types), DD/MM/YYYY formatting. See its README for the predecessor port map. |
| `packages/tokens` | Design tokens (palette, type, spacing) feeding the MUI theme **and** the React Native Paper theme. |
| `apps/web` | React + MUI web app — shell-lite chrome (header, drawer, content, footer, assistant slot) + all views. Buildable skeleton. |
| `apps/mobile` | Expo / React Native companion app (native feel, ML Kit document scanning, push). Docs-only until Phase 4. |
| `services/api` | The existing pattadar backend, ported unchanged (FastAPI + Strawberry GraphQL + AI extraction + notifications + inactivity cron). |
| `services/gateway` | New slim gateway: Cognito access-token validation → `x-user-id`, document storage over S3, reverse proxy, super-admin AI/model admin. |
| `services/assistant` | In-app assistant service (Phase 3), runs without MCP in v1. |
| `infra/terraform` | Persistent/runtime module split + env roots `envs/{dev,prod}/{persistent,runtime}` for one-click up/down. SOC 2 / DPDP-conscious defaults (KMS, versioning, 365-day logs). |
| `scripts` | One-click `platform-up.sh <env>` / `platform-down.sh <env>` (being added in parallel). |
| `docs/architecture.md` | Rendered architecture diagrams (platform, layers, auth flow). |
| `docs/specs` | Design documents. |
| `governance/custodian` | Cloud Custodian report-only policy sweeps (daily via GitHub Actions). |
| `docs/runbooks` | Operational runbooks — DNS cutover, up/down procedures (being added in parallel). |
| `docs/compliance` | SOC 2 control matrix, GDPR + DPDP privacy docs, engineering checklist. |

## Stack (live-verified latest stable, July 2026)

| Layer | Choice |
|---|---|
| Package manager | Bun 1.3.14 (workspaces) |
| Web | React 19.2, MUI 9.2, Vite 8.1, TypeScript 7.0, React Router 8.3, TanStack Query 5 |
| Mobile | Expo (latest SDK, Phase 4), React Native Paper (MD3), Cognito hosted-UI auth (Phase 4), EAS |
| Backend | Python FastAPI + Strawberry GraphQL (ported), PostgreSQL 17 |
| Infra | Terraform ≥1.10, AWS provider 6.x, ECS Fargate, RDS, S3+KMS, CloudFront+WAF |
| Auth | Amazon Cognito (ap-south-1, Essentials tier; hosted UI) |
| AI | Anthropic API (document vision extraction), model catalog under super-admin |

No Ant Design, no pnpm, no webpack/module-federation — deliberate clean break from the predecessor stack.

## Getting started

```sh
bun install          # workspace install
bun run typecheck    # all packages
bun run build        # builds apps/web
bun run dev:web      # Vite dev server (proxies /api → localhost:8080)
```

Infra: see [infra/terraform/README.md](infra/terraform/README.md). Compliance posture: see [docs/compliance/README.md](docs/compliance/README.md).

## Delivery phases

| Phase | Deliverable | Verify |
|---|---|---|
| 0 | This template + AWS foundation (Terraform: KMS, S3, RDS, ECR, secrets, scheduler) | `terraform plan` clean; CI green |
| 1 | Backend lift: api container → ECS, `pg_dump` → RDS, slim gateway, MinIO → S3 mirror, EventBridge cron | GraphQL + one AI extraction + one upload/preview round-trip on AWS with a real Cognito token |
| 2 | MUI web app rebuilt view-by-view; logic extracted into `packages/core` as we go | Feature parity checklist per view |
| 3 | Assistant + super-admin console (model catalog; MCP stays out of v1) | Assistant answers with page context; admin gated fail-closed |
| 4 | Expo companion app (scan, portfolio, members, notifications, verify deep link) + stores | EAS builds installed on iOS/Android |
| 5 | Cutover + hardening (DNS, final data sync, WAF tuning, restore test) | Production traffic on AWS |

## Key invariants (do not break)

1. **`services/api` trusts the `x-user-id` header** — it must never be reachable except through the gateway.
2. **User id format** = email local-part, lowercased (from the Cognito `email` claim — e.g. `sankara.telukutla`). Every DB row and S3 object key depends on it.
3. **AI extraction routes** (`/import-*`, `/extract-*`) run up to 180 s — every hop in front needs ≥200 s timeout and must never retry.
4. **`CRON_SECRET` is always set** — the inactivity-check endpoint is open without it.
5. **Storage object keys** `{owner}/{node}/{version}` are migrated verbatim; metadata rows never change.
6. Dates render **DD/MM/YYYY** (India) everywhere.
