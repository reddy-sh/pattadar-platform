# Architecture

Declared Pattadar architecture from repository source, workflows, and Terraform.
It is **not proof of applied/live AWS state**; deployment, provider activation,
migrations, restore exercises, and alert delivery require separate evidence.

## System components and trust boundaries

```mermaid
flowchart LR
  subgraph Clients
    WEB[apps/web\nactive Vite W360 SPA]
    IOS[apps/ios\nactive SwiftUI + PattadarKit]
    MOB[apps/mobile\nExpo compatibility client]
    NEXT[apps/web-next\nstaged / deploy-blocked]
  end
  CORE[packages/core\nTS API + domain + formats]
  TOK[packages/tokens\ndesign tokens]
  COG[Cognito\nissuer/sub access tokens]
  EDGE[Route53 → CloudFront + WAF]
  ALB[ALB]
  GW[services/gateway\nJWT, storage, capabilities, account, admin, proxy]
  API[services/api\nFastAPI + Strawberry]
  AST[services/assistant\nSSE chat + bounded tools]
  PG[(RDS PostgreSQL 17)]
  S3[(S3 documents/attachments)]
  ANT[Anthropic]
  PAY[Payment provider webhook/API]

  WEB --> CORE
  MOB --> CORE
  WEB & MOB --> TOK
  WEB & IOS & MOB --> COG
  WEB --> EDGE --> ALB
  IOS & MOB --> ALB
  ALB -->|/api/*| GW
  ALB -->|/cron/inactivity-check only| API
  GW -->|validated x-user-id| API
  GW -->|validated x-user-id + SSE| AST
  GW --> S3
  GW & API & AST --> PG
  API & AST --> ANT
  PAY -->|signed webhook| GW
  NEXT -. staged target .-> ALB
```

`services/api` and `services/assistant` trust gateway-injected identity and must
not be generally internet reachable. The one direct API listener rule is the
cron endpoint, jointly protected by exact path routing and `CRON_SECRET`.

## Authentication and owner identity

```mermaid
sequenceDiagram
  participant C as Web/iOS/Expo
  participant I as Cognito
  participant G as Gateway
  participant A as API
  participant D as PostgreSQL
  C->>I: PKCE/native sign-in
  I-->>C: access token (iss, sub, client_id)
  C->>G: /api/gateway/pattadar/graphql + Bearer
  G->>G: strip all inbound identity headers
  G->>G: validate issuer, token_use, client_id, JWKS
  G->>G: derive immutable principal; apply reviewed legacy binding
  G->>A: request + x-user-id
  A->>D: owner-scoped query/mutation
  D-->>A: scoped rows
  A-->>G: response
  G-->>C: response
```

New identities use immutable issuer/subject. Existing DB/S3 owner keys remain
reachable only through reviewed `IDENTITY_LEGACY_BINDINGS`; neither gateway nor
API derives authority from the email local part.

## Durable AI work

Active web document reading submits a durable job and polls authenticated status.
The provider is called after durable claim and consent recheck; interruption is
persisted and the non-idempotent provider call is not automatically replayed.
Legacy synchronous extraction endpoints remain for older clients with a longer
proxy timeout and still no retries.

Assistant turns validate conversation/attachment ownership, apply domain policy,
claim an idempotent run, persist the user turn, stream bounded Claude SDK events,
and transactionally persist completion/failure. Only UI-tool results may emit
browser actions; public-record output is data and not title/identity proof.

## Persistent and runtime Terraform layers

```mermaid
flowchart TB
  subgraph P[Persistent — retained]
    KMS[KMS]
    DOC[S3 documents + logs]
    ECR[ECR]
    SEC[Secrets Manager]
    COG[Cognito]
    DNS[Route53 + SES]
    GOV[CloudTrail + Config + GuardDuty]
    OIDC[GitHub OIDC roles]
  end
  subgraph R[Runtime — recreated]
    VPC[VPC / two public subnets / no NAT]
    CF[CloudFront + WAF + SPA bucket]
    ALB[ALB + ACM]
    ECS[ECS gateway/API/assistant/optional web]
    RDS[(RDS PostgreSQL)]
    SCH[EventBridge cron destination]
    OBS[CloudWatch logs/alarms + SNS]
  end
  STATE[(S3 Terraform state)]
  P -->|remote-state outputs| R
  STATE --> P
  STATE --> R
  CF --> ALB --> ECS --> RDS
  SCH -->|x-cron-secret; controlled retries| ALB
  KMS -. encrypts .-> DOC & SEC & RDS & OBS
```

Use `docs/runbooks/up-down.md` and the repository lifecycle scripts for operation;
never substitute targeted Terraform/state surgery. Platform down snapshots RDS
and may park document objects while persistent identity/keys/data/images/DNS
survive.

## Product domains

The API/W360 system owns portfolio/record 360, legacy land records, families and
beneficiaries, vault/documents, maps/FMB/village data, photos/features, service
orders/tickets, associate desk, wallet/payments, shares/capabilities,
notifications/cron, account consent/export/erasure, reference data/fees, and
audit. The assistant owns durable chat, bounded UI/read-only public-record tools,
attachments, and model-catalog consumption. Exact route ownership starts at
`apps/web/src/routes.tsx` and service entrypoints.

## Delivery and evidence

CI covers TypeScript, Python, Web360 browser wiring/maps, iOS vectors/parity/
Swift/simulator build, Terraform format/validation, and secret scanning. Deploy
promotes one exact successful main SHA, refuses web-next, consumes private
migration evidence, and writes a release receipt. Green CI or declared Terraform
does not prove production readiness or applied compliance controls.
