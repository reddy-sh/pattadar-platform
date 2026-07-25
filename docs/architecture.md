# Architecture

Live AWS architecture (ap-south-1) as deployed by `infra/terraform`. GitHub renders these diagrams inline.

## Platform

```mermaid
flowchart TB
    subgraph Clients
        WEB["apps/web — React + MUI SPA<br/>landing / + app /app/*"]
        MOB["apps/mobile — Expo/RN<br/>(Phase 4)"]
    end

    subgraph Edge["pattadar.com edge"]
        R53["Route53 zone pattadar.com"]
        CF["CloudFront + WAF<br/>SPA from S3 (OAC) · /api/* → ALB"]
    end

    subgraph Auth
        COG["Cognito user pool (Essentials)<br/>hosted UI + PKCE<br/>pre-token-gen: email → access token"]
    end

    subgraph Runtime["runtime layer (one-click up/down)"]
        ALB["ALB — idle 200s<br/>default → gateway · /cron/* → api"]
        GW["ECS: services/gateway<br/>JWT validate → x-user-id<br/>storage API · proxy · super-admin"]
        API["ECS: services/api<br/>FastAPI + GraphQL<br/>AI extraction (Anthropic)"]
        RDS[("RDS PostgreSQL 17<br/>databases: pattadar, hub")]
        SCHED["EventBridge Scheduler<br/>daily cron, retries=0"]
    end

    subgraph Persistent["persistent layer (survives decommission)"]
        S3D[("S3 documents<br/>SSE-KMS · versioning<br/>GuardDuty malware scan")]
        KMS["KMS CMK"]
        SEC["Secrets Manager"]
        ECR["ECR images"]
        TRAIL["CloudTrail + AWS Config"]
    end

    ANTH["Anthropic API<br/>(vision extraction)"]

    WEB --> CF
    MOB -.-> ALB
    WEB & MOB --> COG
    CF -->|"/api/*"| ALB
    R53 --- CF
    ALB -->|default| GW
    ALB -->|"/cron/inactivity-check only"| API
    SCHED --> ALB
    GW -->|"x-user-id (validated)"| API
    GW --> S3D
    GW & API --> RDS
    API --> ANTH
    KMS -.encrypts.-> S3D & RDS & SEC
```

**Invariant made structural:** `services/api` trusts `x-user-id`, so its security group accepts traffic only from the gateway (plus the single ALB-routed `/cron/*` path, guarded by `CRON_SECRET`). It is never directly internet-reachable.

## Terraform layers & one-click lifecycle

```mermaid
flowchart LR
    subgraph State["S3 remote state (per env)"]
        SP["env/persistent.tfstate"]
        SR["env/runtime.tfstate"]
    end

    subgraph P["persistent layer — never destroyed"]
        direction TB
        p1["KMS · S3 buckets · ECR<br/>Secrets · Cognito users<br/>Route53 · SES · CloudTrail<br/>Config · GuardDuty · OIDC roles"]
    end

    subgraph R["runtime layer — platform-down.sh destroys"]
        direction TB
        r1["VPC · ALB · ECS · RDS<br/>CloudFront · WAF · Scheduler<br/>Alarms"]
    end

    P -->|terraform_remote_state| R
    UP["platform-up.sh env<br/>restore RDS from latest final snapshot"] --> R
    DOWN["platform-down.sh env<br/>RDS → final snapshot<br/>S3 → Glacier parking class"] --> R
```

Decommission parks documents (Deep Archive by default, `GLACIER_IR` for fast thaw), snapshots the database, and keeps users, keys, images, and DNS intact — `platform-up.sh` rebuilds runtime from those survivors.

## Auth flow

```mermaid
sequenceDiagram
    participant U as Browser
    participant C as Cognito (hosted UI)
    participant G as gateway (ECS)
    participant A as api (ECS)

    U->>C: login (PKCE code flow)
    C-->>U: access token (email claim via pre-token-gen)
    U->>G: /api/... Authorization: Bearer
    G->>G: verify JWT (issuer, token_use=access, client_id)
    G->>G: user id = email local-part, lowercased (byte-stable)
    G->>A: proxy + inject x-user-id (inbound header stripped)
    A-->>U: data scoped to owner_user_id
```

## Governance & visibility

- **Resource Groups** `pattadar-prod` / `pattadar-dev` — tag-based live inventory (console).
- **AWS Config** — resource relationships + change timeline (SOC 2 evidence).
- **Cloud Custodian** — daily report-only sweeps ([governance/custodian](../governance/custodian/README.md)); security findings fail the workflow.
- **CloudTrail** — all management events, 400-day retention.
