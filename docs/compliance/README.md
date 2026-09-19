# Compliance Posture

Pattadar processes land records and identity documents. These documents track implementation and organizational work; they do not certify legal compliance. Production configuration and operational evidence must be reviewed separately.

## Regimes in scope

| Regime | Role | Scope |
|---|---|---|
| DPDP Act 2023 + DPDP Rules | **Primary** — users are in India | All personal data processing |
| GDPR | Secondary — applies if any EU data subjects use the app | Same data classes; SCCs with US processors |
| SOC 2 (Security, Availability, Confidentiality TSC) | Trust attestation for partners/enterprise | Type I first, then Type II after an observation period |

See [soc2-controls.md](soc2-controls.md), [gdpr-dpdp.md](gdpr-dpdp.md), and [engineering-checklist.md](engineering-checklist.md).

## An honest framing of SOC 2

SOC 2 is an audit outcome, not a checkbox. This repository bakes in the **technical controls** (encryption, logging, access control, change management via CI) and the **evidence trails** (CloudTrail, audit_events, CI run history) an auditor will ask for. It does not — and cannot — provide the **organizational controls**: written policies, risk assessments, access reviews on a calendar, vendor reviews, and an auditor engagement. Those are listed as later work and marked `[organizational]` in the control matrix.

## What this template enforces today vs later phases

| Control | Today (template) | Later |
|---|---|---|
| Encryption at rest (KMS CMK: RDS, S3) | Terraform scaffold | — |
| TLS 1.2+ in transit, CloudFront→ALB | Terraform scaffold | — |
| Cognito access-token validation at gateway; api never exposed directly | Gateway scaffold | — |
| CloudTrail, CloudWatch logs (365d), ALB/S3 access logs | Terraform scaffold | Alarm tuning (Phase 2) |
| CI checks + secret scanning + main-branch protection | CI scaffold | — |
| Aadhaar masking, beneficiary verification tokens, CRON_SECRET | Ported code | — |
| Application audit trail | Legacy API audit writer + centralized classified envelope (`audit_events_v2`) written via a same-transaction outbox; owner view scoped by `affected_owner`, fail-closed security view, metadata allowlist, 3-year default retention (NIST 800-53 AU) | Onboard storage/share-open/download, gateway auth, assistant and payment producers; enforce insert-only DB role / WORM archive; production retention + evidence review |
| Account export + erasure cascade | Gateway export, durable deletion receipts and operator executor | Production drill, retention approval and provider reconciliation |
| GuardDuty malware scan gate on uploaded documents | Terraform scaffold (bucket protection) | Availability gate in gateway (Phase 2) |
| Consent controls | Versioned web choices and withdrawal enforcement | Native/social onboarding, parental workflow and policy review |
| Multi-AZ RDS, cross-region backup copy | Documented upgrade path | TODO(Phase 5) |
| Policies, access reviews, vendor DPAs, auditor engagement | — | Organizational, pre-audit |

## Phase legend

Phases follow the platform build plan: Phase 1 = core port to AWS, Phase 2 = hardening + privacy engineering, Phase 3 = assistant, Phase 5 = scale/availability. `[organizational]` items are people-and-paper work, independent of code.
