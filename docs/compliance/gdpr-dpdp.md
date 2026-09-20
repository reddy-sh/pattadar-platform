# GDPR / DPDP Act Privacy Regime

DPDP Act 2023 (+ DPDP Rules) is the primary regime — users are in India. GDPR applies to any EU data subjects. Pattadar is the **Data Fiduciary** (DPDP) / **Controller** (GDPR); AWS (including Amazon Cognito), Anthropic and notification providers are **Data Processors**.

## Records of Processing (ROPA)

| Data class | Examples | Where | Sensitivity | Processors |
|---|---|---|---|---|
| Identity | Name, DOB, gender, masked Aadhaar display, dedicated-KMS Aadhaar ciphertext, short-lived encrypted candidates, photos (data-URLs in DB) | RDS | Very high | AWS |
| Contact | Phone (+country code), email, addresses | RDS | Medium | AWS, notification providers |
| Land/property records | Parcels, passbooks, deeds, non-ag properties, market values | RDS | Medium–High | AWS |
| Uploaded documents | User-retained Aadhaar card images, land deeds, passbooks — **most sensitive class** | S3 (versioned; gateway explicitly requests SSE-KMS) | Very high | AWS, Anthropic (extraction only, transient) |
| AI reading source/result | Source bytes while queued/running; masked-only Aadhaar result and 30-minute candidate | RDS (`document_read_jobs`, `aadhaar_candidates`) | Very high | AWS, Anthropic |
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
| Notifications incl. inactivity escalation | Consent | Head reminders require both the account email preference and a safeguard-specific head flag. A family member separately opts in during membership verification; delivery requires verified email plus active purpose-specific consent. The acknowledgement page withdraws only safeguard email. Working-tree code is not deployment or legal-completeness evidence. |
| Security/audit logging | Legitimate interest (Art. 6(1)(f)) | Reasonable-purposes / legal-obligation carve-out |

## Data-subject rights — implementation plan

| Right | Implementation | Status |
|---|---|---|
| Access / portability | Me-scoped GraphQL export endpoint returning all of the user's rows + S3 document manifest as JSON | TODO(Phase 2) |
| Erasure | Cascade: pattadar DB rows (parcels, members, documents metadata, notification_log) → storage nodes → S3 objects **including all versions and delete markers** → Cognito user deletion (`AdminDeleteUser`). Retention carve-outs: audit_events and legally required records retained, disassociated from live identity where possible. | TODO(Phase 2) |
| Rectification | Exists — users edit their own records via the UI | Done |
| Consent withdrawal | Head and family recipients can withdraw future inactivity email through purpose-specific state reached from the acknowledgement capability; unrelated account email preferences are unchanged. Full processing-consent withdrawal still ties into erasure. | Partially implemented; local/live acceptance pending |
| Grievance (DPDP) | Grievance-officer contact + response SLA in app/notice | [organizational] |

## Retention schedule

| Data | Retention | Rationale |
|---|---|---|
| Uploaded documents (S3) | Life of account when the user explicitly retains them; deleted (all versions) on erasure request | User's own records |
| Aadhaar extraction candidates | 30 minutes for use; consumed rows are cleanup-eligible after 1 day | Complete the selected KYC write without returning full digits to a client |
| AI reading source bytes/results | Source nulled on completion/failure; terminal job deleted after 1 day | Durable non-replayed processing and short troubleshooting window |
| notification_log | 12 months, then purge (enforced by the hourly `audit.maintenance` sweep) | Delivery troubleshooting |
| audit_events (legacy) | ≥ 1 year (target 3) | SOC 2 evidence, dispute resolution; survives erasure (carve-out) |
| audit_events_v2 (central trail) | Per-event retention class: security/standard = 3 years, low-signal = 1 year (defaults in `src/audit.RETENTION_DAYS`); on erasure only a de-identified tombstone is retained for the reviewed window | SOC 2 / DPDP evidence with data-class-aware lifetime; duration is a governance decision, not yet enforced by a WORM/insert-only control in production |
| RDS backups | 7-day PITR window; erased data ages out of backups within the window | Recovery |
| CloudWatch logs | 365 days | Operations + evidence |
| Cognito user | Deleted on erasure request (`AdminDeleteUser`) | Processor deletion |

## Cross-border transfers

With auth on Amazon Cognito in ap-south-1, authentication data now stays in-India. The **only remaining cross-border processor** is Anthropic, which receives two distinct classes of data: document images for AI extraction, and in-app assistant conversations.

| Processor | Location | DPDP | GDPR |
|---|---|---|---|
| Anthropic API — document extraction | US | Permitted — transfers allowed unless destination is government-blacklisted (none applicable); document images transit for extraction, not retained for training under commercial terms; documented here in the ROPA | SCCs required |
| Anthropic API — assistant conversations | US | Same basis. Conversation text, user-supplied attachments and public-record lookups performed on the user's behalf transit for inference. Distinct from document extraction and separately disclosed in the privacy notice; not covered by the ai_extraction purpose | SCCs required |
| AWS (incl. Cognito) | ap-south-1 (Mumbai) | No transfer — data at rest stays in India | — |

TODO(Phase 3): evaluate Amazon Bedrock in ap-south-1 as an in-country alternative for document extraction, removing the last US transfer entirely.

## Breach notification

- **DPDP**: notify the Data Protection Board of India **and every affected user** of any personal-data breach, in the form/timeline set by the DPDP Rules.
- **GDPR**: notify the supervisory authority within **72 hours** of awareness; affected users when high risk.
- Both duties are steps in the [incident runbook](../runbooks/incident-response.md) — detection, containment, scope assessment from `audit_events_v2`, notification drafting and evidence preservation are runbook stages, not ad-hoc decisions.

## Aadhaar Act note

Pattadar processes **user-uploaded** Aadhaar scans and derived data for the user's
own record-keeping. It does **not** perform UIDAI authentication or eKYC, and is
not an AUA/KUA. During extraction the provider may transiently return the full
number to the API process; the API immediately creates an owner-scoped,
KMS-encrypted, 30-minute one-use candidate and returns only its opaque ID plus a
last-four mask. Provider raw text and full digits are excluded from clients and
completed job results.

When the user accepts the candidate, the recoverable number is stored as
versioned direct-KMS ciphertext under a dedicated Aadhaar key and displayed
masked. Full reveal remains an explicit owner-only, audited action; therefore
“masked display” must not be described as irreversible truncation. Legacy
Fernet ciphertext remains readable only for migration/rollback. The active web
retains the original card in private document storage only after explicit
opt-in; Expo Aadhaar forms do not copy it to Drive or plaintext local storage.
Retained objects are written with explicit SSE-KMS parameters. These are
implemented repository controls, not proof of deployed IAM/key/bucket policy or
legal sufficiency; rollout and migration evidence is governed by the
[Aadhaar KMS runbook](../runbooks/aadhaar-kms-rollout.md).
