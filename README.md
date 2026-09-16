# Pattadar Platform

Standalone AWS platform for **Pattadar** — the Andhra Pradesh land-records application (parcels, passbooks, registered deeds, non-agricultural property, family groups, beneficiary verification, AI document extraction).

This repository is both the product and a reusable platform pattern: future
applications can follow the same persistent/runtime Terraform split, gateway
trust boundary, service layout, and client/shared-package conventions. There is
no current `app-stack` module; reuse is architectural, not a one-command stamp.

Extracted from the predecessor platform (local Kind/k8s) per the design in [docs/specs/2026-07-25-standalone-platform-design.md](docs/specs/2026-07-25-standalone-platform-design.md).

## Architecture

The active web application is `apps/web` (React/W360), and the native iOS application is `apps/ios` (SwiftUI). `apps/mobile` remains the Expo/Android compatibility client; `apps/web-next` is staged for an explicit future cutover. TypeScript clients share `packages/core`; Swift counterparts are checked against the same generated vectors and the parity contract.

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

Region: **ap-south-1 (Mumbai)**. Auth: **Amazon Cognito** (ap-south-1, Essentials tier — immutable subjects with reviewed aliases for existing owner keys). AI extraction: direct Anthropic API (Bedrock ap-south-1 documented as a future data-residency option).

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
| `packages/core` | Shared TypeScript GraphQL/network/domain/format/export logic used by web and Expo; Swift parity is checked through vectors/contracts. |
| `packages/tokens` | Design tokens used by the MUI web themes and imported by Expo screens/theme code. |
| `apps/web` | Active React + MUI/Vite client: public/auth/legal pages, W360 app, public capability portals, assistant, and retained `/legacy` routes. |
| `apps/ios` | Active native SwiftUI client with `PattadarKit`, vector/parity gates, and its own locked design authority. |
| `apps/mobile` | Implemented Expo / React Native compatibility client with auth, records, family, maps/location, storage/capture, notifications, and offline behavior. Generated `ios/` and `android/` trees are not source. |
| `apps/web-next` | Staged Next.js client. It builds, but production deployment refuses it until repaired-feature parity and explicit cutover review. |
| `services/api` | FastAPI + Strawberry product service: root/cross-client schema, W360 domains, durable imports, account/privacy, payments, reference/geospatial data, notifications and cron. |
| `services/gateway` | Internet-facing Cognito trust boundary, document storage, scoped capabilities/account/admin routes, buffered API proxy, and streaming assistant proxy. |
| `services/assistant` | Deployed in-app assistant: durable PostgreSQL runs/messages, bounded UI/read-only public-record tools, SSE, and owner-scoped attachments. No external/public MCP service. |
| `infra/terraform` | Persistent/runtime module split with `envs/{dev,prod}/{persistent,runtime}` roots and controlled platform up/down. |
| `scripts` | Operational lifecycle/release/migration/parity/reference-data scripts plus discovered rule guards and Agent Skills validation. |
| `docs/architecture.md` | Declared architecture diagrams and trust/data/deployment flows; not proof of applied cloud state. |
| `docs/specs` | Active and historical design/contract documents; status must be checked against executable source. |
| `governance/custodian` | Daily report-only Cloud Custodian security/cost/tagging sweeps. |
| `docs/runbooks` | Operational release, migration, identity, account-data, lifecycle, thaw, restore, provider and access procedures. |
| `docs/compliance` | SOC 2, GDPR/DPDP, privacy/security engineering, and evidence mappings. |

## Repository stack

| Layer | Choice |
|---|---|
| Package manager | Bun 1.3.14 (workspaces) |
| Web | React 19.2, MUI 9.2, Vite 8.1, TypeScript 7.0, React Router 8.3, TanStack Query 5 |
| Mobile | SwiftUI + PattadarKit on iOS; Expo/React Native compatibility client for Android |
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
2. **Identity** uses the immutable issuer and subject, never the email local part. Existing DB/S3 owner keys remain reachable only through the reviewed `IDENTITY_LEGACY_BINDINGS` mapping. Complete [identity migration](docs/runbooks/identity-migration.md) before rollout.
3. **AI readings** use durable asynchronous jobs and authenticated status polls on web. An interrupted provider call is never automatically repeated. Direct extraction endpoints remain for older clients; their callers need the longer operation budget.
4. **`CRON_SECRET` is always set** — the inactivity-check endpoint is open without it.
5. **Storage object keys** `{owner}/{node}/{version}` are migrated verbatim; metadata rows never change.
6. Dates render **DD/MM/YYYY** (India) everywhere.

## Repairs and release preparation

The September review repairs cover account isolation, verification, native queues/widgets, durable document readings and attachments, scoped sharing/worker access, transaction-safe accounting, optional Razorpay checkout, and account-data controls. See the [repair evidence](docs/parity/project-repair-2026-09-12.md) and [tested release procedure](docs/runbooks/tested-release.md) for remaining external setup, migration evidence, and production go/no-go gates.

CI runs TypeScript, Python, browser, native and Terraform checks before promoting the matching source revision. Production activation still requires reviewed identity and attachment migration evidence, configured providers, and a recorded restore/alert exercise. Local test success does not establish that these production steps have happened.
