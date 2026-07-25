# GDPR / DPDP Act Privacy Regime

DPDP Act 2023 (+ DPDP Rules) is the primary regime — users are in India. GDPR applies to any EU data subjects. Pattadar is the **Data Fiduciary** (DPDP) / **Controller** (GDPR); AWS (including Amazon Cognito), Anthropic and notification providers are **Data Processors**.

## Records of Processing (ROPA)

| Data class | Examples | Where | Sensitivity | Processors |
|---|---|---|---|---|
| Identity | Name, DOB, gender, **masked** Aadhaar number, photos (data-URLs in DB) | RDS | High | AWS |
| Contact | Phone (+country code), email, addresses | RDS | Medium | AWS, notification providers |
| Land/property records | Parcels, passbooks, deeds, non-ag properties, market values | RDS | Medium–High | AWS |
| Uploaded documents | Aadhaar card images, land deeds, passbooks — **most sensitive class** | S3 (SSE-KMS, versioned) | Very high | AWS, Anthropic (extraction only, transient) |
| Group/family membership | Typed groups, member roles, minor→guardian links, legal-heir flags | RDS | High (includes minors) | AWS |
| notification_log | Channel, recipient, message, delivery status | RDS | Medium | AWS, Resend/MSG91/Meta WhatsApp |
| audit_events | Who did what, when | RDS | Medium | AWS |
| Inactivity heartbeats | last_active timestamps, dead-man's-switch escalation state | RDS | Medium | AWS |
| Auth data | Credentials, MFA, login history | Amazon Cognito (ap-south-1 — in-India) | High | AWS (Cognito, processor) |

## Purpose and lawful basis

| Purpose | GDPR lawful basis | DPDP consent/notice |
|---|---|---|
| Land-record management for the user's own holdings | Contract (Art. 6(1)(b)) | Consent at signup with itemised notice |
| AI document extraction (Aadhaar/deed/passbook → structured data) | Contract; explicit consent for ID documents | Explicit consent at upload; purpose stated in notice |
| Family/heir management incl. minors | Contract + consent of guardian | **Verifiable parental consent required for minors.** The app already models minor→guardian; TODO(Phase 2): capture and record the guardian's verifiable consent at member creation. |
| Notifications incl. inactivity escalation | Consent | Per-channel consent; opt-out honoured |
| Security/audit logging | Legitimate interest (Art. 6(1)(f)) | Reasonable-purposes / legal-obligation carve-out |

## Data-subject rights — implementation plan

| Right | Implementation | Status |
|---|---|---|
| Access / portability | Me-scoped GraphQL export endpoint returning all of the user's rows + S3 document manifest as JSON | TODO(Phase 2) |
| Erasure | Cascade: pattadar DB rows (parcels, members, documents metadata, notification_log) → storage nodes → S3 objects **including all versions and delete markers** → Cognito user deletion (`AdminDeleteUser`). Retention carve-outs: audit_events and legally required records retained, disassociated from live identity where possible. | TODO(Phase 2) |
| Rectification | Exists — users edit their own records via the UI | Done |
| Consent withdrawal | Notification opt-out exists per channel; full processing-consent withdrawal ties into erasure flow | TODO(Phase 2) |
| Grievance (DPDP) | Grievance-officer contact + response SLA in app/notice | [organizational] |

## Retention schedule

| Data | Retention | Rationale |
|---|---|---|
| Uploaded documents (S3) | Life of account; deleted (all versions) on erasure request | User's own records |
| notification_log | 12 months, then purge | Delivery troubleshooting |
| audit_events | ≥ 1 year (target 3) | SOC 2 evidence, dispute resolution; survives erasure (carve-out) |
| RDS backups | 7-day PITR window; erased data ages out of backups within the window | Recovery |
| CloudWatch logs | 365 days | Operations + evidence |
| Cognito user | Deleted on erasure request (`AdminDeleteUser`) | Processor deletion |

## Cross-border transfers

With auth on Amazon Cognito in ap-south-1, authentication data now stays in-India. The **only remaining cross-border transfer** is Anthropic (AI document extraction).

| Processor | Location | DPDP | GDPR |
|---|---|---|---|
| Anthropic API | US | Permitted — transfers allowed unless destination is government-blacklisted (none applicable); document images transit for extraction, not retained for training under commercial terms; documented here in the ROPA | SCCs required |
| AWS (incl. Cognito) | ap-south-1 (Mumbai) | No transfer — data at rest stays in India | — |

TODO(Phase 3): evaluate Amazon Bedrock in ap-south-1 as an in-country alternative for document extraction, removing the last US transfer entirely.

## Breach notification

- **DPDP**: notify the Data Protection Board of India **and every affected user** of any personal-data breach, in the form/timeline set by the DPDP Rules.
- **GDPR**: notify the supervisory authority within **72 hours** of awareness; affected users when high risk.
- Both duties are steps in the incident runbook (see soc2-controls.md, incident response) — assessment of scope, notification drafting, and evidence preservation are runbook stages, not ad-hoc decisions.

## Aadhaar Act note

Pattadar stores **user-uploaded** Aadhaar scans and derived data for the user's own record-keeping. It does **not** perform UIDAI authentication or eKYC, and is not an AUA/KUA. The Aadhaar number is stored and displayed **masked** (`_mask_aadhaar`) — the full number is never shown in the UI. Uploaded scans live in the user's private S3 space, encrypted with a customer-managed KMS key, and are covered by the erasure cascade above.
