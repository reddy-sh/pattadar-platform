# Current Pattadar System Map

Verified from repository source/config on 09/10/2026. This is declared
architecture, not proof of applied AWS state.

## Client and service roles

- `apps/web`: shipping React/MUI/Vite SPA with public/auth/legal pages, active
  W360 app, public share/work portals, account data, assistant panel, and a
  retained `/legacy` shell.
- `apps/ios`: active SwiftUI/PattadarKit client; parity through vectors/contracts.
- `apps/mobile`: implemented Expo Router compatibility client; generated
  `ios/`/`android/` trees are not source.
- `apps/university`: Pattadar University content application; included in the
  Bun workspace, build, and unit-test gates.
- `packages/core`: TypeScript API/network/domain/format/export logic.
- `packages/tokens`: shared web/mobile design tokens (runtime mobile imports
  should be verified when relevant).
- `services/gateway`: public JWT boundary, immutable-principal mapping, storage,
  capabilities/account/admin routes, buffered API proxy, streaming assistant proxy.
- `services/api`: FastAPI + Strawberry product/W360 domains; trusts gateway
  `x-user-id`; cron is the single ALB-routed exception protected by `CRON_SECRET`.
- `services/assistant`: authenticated SSE chat, durable conversation/run state,
  bounded tools, owner-scoped attachments, optional read-only public records.

## Main request topology

```mermaid
flowchart LR
  WEB[apps/web] --> EDGE[CloudFront + WAF]
  IOS[apps/ios] --> ALB[ALB]
  MOB[apps/mobile] --> ALB
  UNI[apps/university] --> UEDGE[University CloudFront + WAF] --> USITE[(S3 university site)]
  UNI -->|OIDC hosted UI| COG[Cognito]
  EDGE -->|/api/*| ALB
  ALB -->|/api/*| GW[services/gateway]
  ALB -->|/cron/inactivity-check only| API[services/api]
  GW -->|validated x-user-id| API
  GW -->|validated SSE| AST[services/assistant]
  GW --> S3[(S3 documents)]
  GW & API & AST --> PG[(PostgreSQL/RDS)]
  API & AST --> ANT[Anthropic]
  GW -->|admin models/sync| ANT
```

## Public and capability entry points

Ingress that needs no Bearer or skips the API proxy. Check a new one against
the control that guards it:

- Anonymous GraphQL roots: two allowlists, gateway
  `services/gateway/src/public_graphql.py` (`is_public_verification`) and API
  `services/api/src/main.py` (`public_queries`/`public_mutations`). A new root
  must be added to both; today the API also admits `trainingCertificate`, so
  flag any other difference.
- Capability links: `services/gateway/src/routes/capabilities.py`; the token
  is the credential and the API resolves its scope before any storage call.
- `POST payments/webhook`: passed through unauthenticated, guarded only by the
  Razorpay HMAC in `services/api/src/payments.py`.
- Direct upload: presigned POST to a gateway-chosen pending key (the policy
  pins type and size range), then HeadObject re-reads the size before the file
  row exists (`services/gateway/src/storage.py`).
- `/internal/*`: refused by the proxy (`_private_path` in
  `services/gateway/src/routes/proxy.py`); the API's second lock,
  `x-internal-proxy-secret`, fails open while `INTERNAL_PROXY_SECRET` is unset.

## Persistent/runtime split

Persistent: KMS, S3 documents/logs/village maps (`/vm/*`, served by runtime
CloudFront), ECR, Secrets Manager, Cognito, DNS/SES,
CloudTrail/Config/GuardDuty, GitHub OIDC. Runtime: VPC/public subnets (no NAT),
ALB, ECS gateway/api/assistant, non-public RDS, CloudFront/WAF/SPA,
scheduler, logs/alarms/SNS. Runtime reads persistent outputs through remote
state and is recreated by reviewed lifecycle scripts.

The `web` ECS service, ALB target group, ECR repo and log group are dormant
leftovers of the removed Next.js client (`web_desired_count` 0); removing them
is a reviewed infrastructure-change because it touches CloudFront routing.
The Terraform `web_origin` variable (default `spa`) and `deploy.yml`'s
`--web-origin spa` must stay `spa`: `ecs` sends CloudFront's default behaviour
to the ALB, whose default action is that empty target group.

University (`infra/terraform/envs/prod/university`) is a third, standalone
root: always on, no dev twin, outside platform-up/down. `deploy-university.yml`
publishes the site from its outputs but never applies it. It owns its own S3
site, ACM, WAF, CloudFront (S3 origin, GET/HEAD only) and Cognito client, reads
persistent outputs (Cognito pool/issuer/hosted UI domain, Route 53 zone), and
calls no Pattadar API.

## Feature domains

Auth/identity; public/auth/legal routes; portfolio/record 360; holdings
(`/app/holdings`; server `combined_*`) (a W360-only aggregate OVER parcel/property records — its own tables,
name, membership and whole-holding costs; never in `_cards`, never in portfolio
totals, and it merges no boundary or title); legacy land
records; families/groups/beneficiaries; vault/storage/reader; durable AI import;
maps/FMB/village/reference ingestion; photos/features; services/orders/tickets;
associate desk; wallet/payments; scoped shares/capabilities; assistant/model
catalog; notifications/cron; account consent/export/erasure; reference data,
fees, and audit.

## Invariants

Gateway-derived identity; one secret-guarded direct cron path; immutable
issuer/subject identity; durable non-replayed AI work; server-side authority;
scoped public tokens; verbatim storage keys; persistent/runtime separation;
exact-revision release; additive compatibility; DD/MM/YYYY; implemented is not
deployed.
