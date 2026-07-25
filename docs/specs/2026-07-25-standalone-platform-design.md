# Pattadar Standalone Platform — Design

**Date:** 25/07/2026 · **Status:** Draft for founder review · **Scope:** Extraction of the pattadar application from rhub onto its own AWS platform, with a web + native-mobile product from one shared-core codebase, built for SOC 2 / GDPR / DPDP compliance.

## 1. Context and goals

Pattadar today runs inside the rhub platform (local Kind/k8s): a Module Federation UI remote under the rhub shell, a self-contained FastAPI/GraphQL backend, document storage in the rhub gateway (MinIO + Postgres metadata), and AI document extraction via the Anthropic API. It is robust and hand-built (no longer codegen-managed).

Goals, in the founder's words and priority:

1. **Own platform on AWS** — DB, API, UI, plus only the *needed* parts of the shell, gateway, MCP and AI tasks (AI/MCP administration under a super-admin role).
2. **Excellent web UI** (MUI) and **native-feeling mobile** — *"no way i can compromise"* on either.
3. **Highly scalable and secure** — user-uploaded documents (Aadhaar cards, land deeds, passbooks) are the heart of the product.
4. **Reusable** — the same template must work for future apps.
5. **SOC 2 and GDPR compliant** (plus DPDP Act, the primary regime for India-resident users).

## 2. Decisions

| # | Decision | Status |
|---|---|---|
| D1 | **Two UI heads over a shared core** — MUI web + Expo/React Native mobile; `packages/core` holds all non-markup logic. Neither platform compromises the other. | **Decided** (follows from the no-compromise requirement; a single UI codebase cannot deliver both) |
| D2 | Mobile launches as a **companion app** (scan, portfolio, documents, members, notifications, verify) — heavy tables/admin stay web-only; views graduate later as UI-only work | Recommended — confirm |
| D3 | **Backend-first migration** — lift api/DB/storage onto AWS nearly unchanged, then rebuild UI against it | Recommended — confirm |
| D4 | **Amazon Cognito** (ap-south-1, Essentials tier; hosted UI, prefix domain `pattadar-auth-<env>` for pilot). Founder instruction 25/07/2026 — supersedes the earlier "keep Auth0" recommendation. Data-residency win: auth data now lives in-India. Identity format (email local-part, lowercased) preserved exactly | **Decided** |
| D5 | **Direct Anthropic API** for extraction (as today). Bedrock ap-south-1 (Claude available via global cross-region inference since 03/2026) documented as the data-residency upgrade path | Recommended — confirm |
| D6 | **MCP stays out of v1.** Assistant runs with built-in navigate/page-action tools (`MCP_URL` unset — supported path). If MCP returns, its consent/scope middleware (built but unwired in rhub) must be wired first | Recommended — confirm |
| D7 | New standalone repo `reddy-sh/pattadar-platform` as the template | **Decided** (this repo) |
| D8 | Clean toolchain break: **Bun** workspaces, MUI 9, Vite 8, TS 7, React Router 8 — no AntD, no pnpm, no webpack/MF | **Decided** (founder instruction) |
| D9 | Region **ap-south-1**; ECS Fargate (App Runner deprecated 03/2026); RDS PostgreSQL over Aurora Serverless v2 for prod (~4:1 cheaper at steady low traffic); Terraform `app-stack` module as the per-app template | Recommended — confirm |
| D10 | Domain **pattadar.com** (founder-owned; currently an Azure-hosted site). Route53 zone created in Terraform; NS switch to Route53 happens later in Track B (runbook) — the existing site stays up until cutover | **Decided** (founder instruction 25/07/2026) |
| D11 | **Public landing page + Cognito-gated web app** in one SPA: landing at `/`, app under `/app/*`, both on `pattadar.com` via CloudFront; `api.pattadar.com` = ALB (cron target + direct API); browser traffic same-origin `/api/*` → ALB origin (no CORS) | **Decided** (founder instruction 25/07/2026) |
| D12 | **Persistent/runtime Terraform layers** for one-click platform up/down: persistent layer (Cognito user pool, KMS, S3 — parked to a Glacier storage-class variable when down) survives teardown; the runtime layer is destroyed/recreated by `scripts/platform-{up,down}.sh <env>` | **Decided** (founder instruction 25/07/2026) |

## 3. What the dependency mapping found (rhub → here)

A full parallel audit of the rhub codebase established the extraction cut-list. Summary of the load-bearing facts:

### services/api (port unchanged)
- Zero imports from rhub shared code. Needs only: `APP_PG_DSN`, `ANTHROPIC_API_KEY`, `CRON_SECRET`, `APP_PUBLIC_URL`, and a fronting proxy that validates JWTs and injects `x-user-id` (the service does **no auth of its own**).
- Schema self-bootstraps (`init_db()` under `pg_advisory_lock(918273645)`, ~28 tables). Migration = `pg_dump` of the `pattadar` DB → restore to RDS → start.
- Four AI extraction endpoints call `api.anthropic.com` directly (model `claude-sonnet-5` hardcoded; httpx timeouts up to 180 s; retries only pre-response transport errors). Edge must allow ≥200 s and never retry — rhub's istio 165 s vs httpx 180 s inversion gets fixed here.
- Inactivity dead-man's-switch: daily `POST /cron/inactivity-check` (EventBridge Scheduler replaces the k8s CronJob). Endpoint is **open when `CRON_SECRET` is unset** — always set it.
- `notify.py` providers (Resend / MSG91 / Meta WhatsApp) stay env-gated stubs until credentials are purchased.

### services/gateway (new, assembled from rhub modules)
- Port: `auth.py` + `common/auth0_jwt.py` (rhub's Auth0 JWKS validation — replaced here by Cognito access-token validation per D4; the opaque-token/userinfo fallback is dropped since Cognito issues only JWTs. **`extract_user_id` normalization must stay byte-identical** — email local-part lowercased keys every row), `routes_storage.py` + `storage_service.py` (storage API), `routes_admin_models.py` + `model_providers/` (super-admin model catalog), minimal RBAC (`platform_admin` = super-admin; `platform.manage` gate must fail **closed**).
- Storage is S3-ready by design: minio-py is S3-compatible, object keys `{owner}/{node}/{version}` are bucket-relative, and no MinIO URL ever reaches a browser (fully proxied streaming, no presigned URLs). Cutover = mirror objects verbatim + flip endpoint env. Metadata rows: zero changes.
- Drop: multi-app registry/proxy machinery, RBAC matrix, vkx/saga/builder stack, webhooks, orchestrator, notifications center, tenancy/orgs, 18 of 21 MCP servers.
- Storage risks carried into the plan: full-buffered uploads (100 MB cap → memory headroom), unauthenticated share-token routes (review before enabling), bucket blocks all public access.

### Web UI (rebuild, not port)
- rhub's `RemoteApp.tsx` is ~4,500 lines of AntD; its tables/file-explorer/map live in a runtime design-system remote. The MUI rebuild replaces: DataTable/AdvancedTable → MUI X DataGrid, ExportMenu → port with `exporters.ts` (jspdf/xlsx — already app-local and portable), FileExplorer → scoped v1 (list/upload/preview/trash/star), GeoMap → evaluate MapLibre.
- Cleanly portable modules go to `packages/core`: `landcalc.ts`, `units.ts`, `dashboard.ts`, `docTypes.ts`, `driveFolders.ts`, exporter data-prep, plus GraphQL operations (codegen against the Strawberry schema).
- Public route `verify/:token` (beneficiary verification) must work **without login**.
- Behavioral details to preserve: DD/MM/YYYY, Aadhaar always masked, row-action guards in `onClick`, plain-language user-facing copy.

### Assistant + super-admin (Phase 3)
- `api/assistant` ports as a service; with `MCP_URL` unset it uses built-in page tools only. Preserve the plain-language prompt rule. PG trap: code default DB is `rhub`, deployments use `hub` — set explicitly.
- Super-admin surface: model catalog (`platform_models` + admin routes + provider seam) and, if ever needed, AI tasks/MCP admin — all behind `platform_admin`, fail-closed.
- Known gap to close before any MCP return: consent/scope middleware exists in rhub but was never wired into the MCP gateway.

## 4. Target AWS architecture

Route53 + ACM → CloudFront (SPA from S3+OAC; `/api/*` → ALB origin) + WAF managed rules → ALB (idle ≥200 s, shared across future apps) → ECS Fargate services (`gateway`, `api`, later `assistant`) → RDS PostgreSQL 17 (one instance, databases `pattadar` + `hub`) · S3 documents bucket (SSE-KMS CMK, versioning, GuardDuty Malware Protection, lifecycle) · EventBridge Scheduler → cron · Secrets Manager for all credentials · CloudWatch/CloudTrail with 1-year retention.

**Hosts (D10/D11):** `pattadar.com` = the SPA — public landing at `/`, Cognito-gated app under `/app/*`; `www.pattadar.com` → same CloudFront distribution; `api.pattadar.com` → ALB directly (EventBridge cron target + direct API). Browser app traffic is same-origin `/api/*` via CloudFront → ALB origin, so no CORS. Auth via the Cognito hosted UI on the prefix domain `pattadar-auth-<env>` for the pilot (custom `auth.pattadar.com` later). The Route53 zone is created in Terraform; the NS switch away from Azure DNS is a Track B runbook step — the existing pattadar.com site stays live until cutover.

Estimated cost at small scale: **~$80–100/month** (Fargate ~$25–30, ALB ~$20, RDS t4g.micro ~$15–18, S3/KMS/GuardDuty ~$3–8, WAF ~$12–15, CloudFront ~$0 in free tier). Each additional app on the shared ALB/RDS: ~$15–30. Trim to ~$50–60 pre-launch by running one task and deferring WAF.

## 5. Mobile strategy (the no-compromise resolution)

"One UI codebase" and "no compromise on web AND mobile" cannot both be true — Capacitor compromises native feel; Expo-universal compromises the web (MUI cannot run in React Native; react-native-web is in maintenance mode). The resolution is structural:

- **`packages/core`** — every query, mutation, type, calculation, validation and format rule, written once (~60–70 % of frontend code).
- **`apps/web`** — MUI 9 + MUI X: the workstation (all views, exports, admin, assistant).
- **`apps/mobile`** — Expo + React Native Paper (Material 3 themed from the same tokens → one brand language): the in-pocket companion (dashboard, ML Kit document scanning, offline documents, members/invites, push notifications, verify deep link).
- Honest cost: UI layer ~1.6–1.8× vs a wrapper — bounded by the companion scope (D2). Screens graduate to mobile later as UI-only work.

## 6. Phases

Each phase gets its own implementation plan; this spec is the umbrella.

| Phase | Content | Exit criteria |
|---|---|---|
| **0** | Template repo (this) + Terraform foundation (KMS, S3, RDS, ECR, secrets, scheduler, log groups) | Founder approves template; `terraform plan` clean; CI green |
| **1** | Backend lift: api image → ECS; `pg_dump` → RDS; slim gateway (auth + storage-on-S3 + proxy); MinIO → S3 mirror (final incremental sync during write freeze); EventBridge cron | On AWS with a real Cognito token: GraphQL round-trip, one AI extraction, one upload + preview, cron fires with secret |
| **2** | MUI web app view-by-view; extract `packages/core` as views are rebuilt; Cognito hosted-UI SPA integration | Per-view parity checklist vs rhub pattadar |
| **3** | Assistant service + panel; super-admin console (model catalog); audit-trail port | Context-aware assistant; fail-closed admin gate |
| **4** | Expo companion app; ML Kit scanner; push (FCM/APNs) wired to `notify.py` events; EAS store submissions | Installed builds on both stores; verify deep link works |
| **5** | Cutover (DNS, final sync), hardening (WAF tuning, restore test, alarms), decommission plan for rhub-hosted pattadar | Production traffic on AWS; restore test passed |

## 7. Compliance by design (SOC 2 · GDPR · DPDP)

Details in `docs/compliance/`. The stance: technical controls live in this template (encryption, logging, access, backups, CI evidence); organizational controls (policies, reviews, auditor engagement) are scheduled work, honestly labelled — SOC 2 is an audit outcome, not a repo feature.

- **Security:** KMS CMK everywhere at rest; TLS-only; Cognito TOTP MFA (optional at launch, enforced for super-admin pre-pilot); IAM least-privilege with OIDC-federated CI (no long-lived keys); fail-closed admin gates; GuardDuty malware scanning gating document availability.
- **Privacy (GDPR/DPDP):** ROPA for pattadar's data classes (identity incl. masked Aadhaar, documents, minors/guardians); DSR work items — export endpoint, erasure cascade (DB rows + storage nodes + S3 versions + Cognito user via `AdminDeleteUser`); retention schedule; cross-border processors documented (Anthropic only — Cognito is in-region ap-south-1; Bedrock Mumbai as future in-region option for extraction); breach runbook (GDPR 72 h / DPDP Board); verifiable parental consent for the existing minor→guardian flow.
- **Aadhaar posture:** user-uploaded scans for the user's own records, always displayed masked; no UIDAI authentication is performed.

## 8. Risks

1. `x-user-id` trust — api must be network-unreachable except via gateway (security group + ALB rules).
2. Identity-format coupling — any change to user-id normalization orphans all data.
3. Timeout envelope — ≥200 s, no retries, at every hop in front of extraction routes.
4. MUI 9 / Vite 8 / TS 7 / RR 8 are newer than most AI/tooling training data — pin versions, consult current docs, verify by building (this template's web skeleton is the proof).
5. Solo-founder double-UI cost — bounded by D2 (companion scope) and `packages/core`.
6. The old 2025 pattadar prototype (local folder `projects/pattadar`) still points its git origin at `reddy-sh/pattadar`, which GitHub now redirects to this renamed repo — repoint or archive that folder deliberately so an accidental push can never target this platform.
7. Notification go-live requires provider accounts (Resend / MSG91 DLT / Meta WhatsApp template approval) — lead time, not code.
8. Cognito **access** tokens carry no `aud` and no `email` claim out of the box — the gateway must validate `token_use == "access"` + a `client_id` allowlist (not `aud`), and a **pre-token-generation Lambda trigger** adds `email` to the access token. Without the trigger, `extract_user_id` has nothing to normalize.
9. Email local-part collision (two signups sharing a local-part across domains would map to one user id). Mitigation, pre-pilot: NEW users get **sub-based ids** via a mapping table; existing local-part ids are grandfathered plus a pre-signup collision guard.
