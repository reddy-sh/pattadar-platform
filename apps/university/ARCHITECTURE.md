# Pattadar University architecture

## Decision summary

Pattadar University is a separately deployable web product at `university.pattadar.com`. It shares Pattadar identity and selected platform services, but owns its learning domain and release cycle. This avoids turning the land-record application into a monolith while preserving one account and one trust boundary for users.

The frontend already depends on domain ports rather than browser storage directly. The current `BrowserLearningRepository` and `BrowserOpportunityInterestRepository` are local prototype adapters. Production adapters will call University APIs; the pages and domain rules should not change when persistence moves to DynamoDB.

The current catalog is product scaffolding, not a published prospectus. Locations, mentor roles, opportunity pathways, prices, and credential names remain proposed until their owners approve them. Browser-generated completion records are marked as previews and are not verifiable credentials.

Course jurisdiction and physical delivery are separate catalog facts. A published course version owns `jurisdictionScope`: `india-general` identifies process and skill learning that is intentionally non-state-specific, while `state-specific` requires one or more `stateCodes` identifying the law, records, or operating context covered. `locationSlugs` identify proposed centres or field-delivery locations and must not be used to infer curriculum jurisdiction. Discovery filters are URL-backed (`goal`, `role`, and `state`) so links can be shared and the same filter contract can be passed to production APIs.

`src/data/stateLandRecords.ts` is the preview jurisdiction registry for all 28 states and 8 union territories. Each entry owns a stable code and slug, local record vocabulary, availability status, evidence boundary, official land-record and registration links, and a source-review date. `src/data/stateGuideContent.ts` adds the reviewed educational layer: record explainers, official-access steps, state-specific mutation and survey guidance, registration boundaries, practical checks, and answer-first FAQs. It is reference content, not a copy of government records and not a title-verification service.

## Product boundaries

University owns:

- Catalog, course versions, locations, cohorts, and protected learning resources.
- Enrollment, module progress, assessments, learner submissions, and mentor review.
- Credential issuance, verification, expiry, and revocation.
- Mentor matching, work readiness, opportunity interest, and employer handoff consent.
- Tutor conversations grounded in approved course versions.

The existing Pattadar platform continues to own:

- Pattadar accounts and authentication.
- Property records, papers, service requests, payments, and customer communications.
- Staff and provider identity verification where those capabilities already exist.

University references those domains by stable IDs. It does not copy land records into learning tables.

## Runtime topology

```text
Route53 university.pattadar.com
  -> CloudFront + WAF
      -> S3 static University bundle
      -> /api/university/* -> ALB -> University API

Browser -> auth.pattadar.com -> shared Cognito user pool
University API -> authorization policy -> repository ports
  -> current relational adapter where transactions are required
  -> S3/KMS for protected PDFs, video, submissions, and certificates
  -> queue/event bus for progress, assessment, credential, and opportunity events
  -> future DynamoDB adapters for high-volume learning state and tutor sessions
```

CloudFront must route SPA paths to `index.html` without rewriting `/api/*` or protected-resource URLs.

State-guide builds also emit route-specific HTML at `dist/states/index.html` and `dist/states/{slug}/index.html`. CloudFront should prefer the exact route object (or append `/index.html`) before applying the SPA fallback. Cache `sitemap.xml`, `robots.txt`, and `llms.txt` separately so discovery updates do not require invalidating all hashed application assets.

## Identity and authorization

- Use the existing Cognito user pool and a dedicated University public app client.
- Use authorization code flow with PKCE. No client secret ships to the browser.
- Use the Cognito `sub` as `learnerId`; never key data by mutable email or phone.
- Hosted sign-in at `auth.pattadar.com` provides account continuity and SSO where Cognito session policy allows it.
- APIs validate issuer, audience/client, expiry, and scopes. Browser-supplied identity headers are ignored outside local development.
- Roles are server grants, not profile choices: `learner`, `mentor`, `instructor`, `reviewer`, `content-editor`, `employer`, `university-admin`.
- Staff and providers may need both Pattadar workforce permission and a University role. The API checks both where a workflow crosses domains.

## Service modules and APIs

Start as one deployable University API with strict modules. Split services only when traffic or team ownership justifies it.

### Catalog

```text
GET  /api/university/catalog/courses?goal={goal}&role={role}&state={stateCode}
GET  /api/university/catalog/courses/{slug}
GET  /api/university/catalog/courses/{slug}/versions/{version}/lessons/{moduleId}
GET  /api/university/catalog/courses/{slug}/versions/{version}/resources/{resourceId}
GET  /api/university/jurisdictions
GET  /api/university/jurisdictions/{slug}
GET  /api/university/locations/{slug}
POST /api/university/admin/course-versions
POST /api/university/admin/publish
```

Published course versions are immutable. Corrections create a new version with migration rules for active learners.

### Learning

```text
POST /api/university/enrollments
GET  /api/university/me/enrollments
PUT  /api/university/enrollments/{id}/modules/{moduleId}
POST /api/university/enrollments/{id}/submissions
POST /api/university/submissions/{id}/mentor-review
```

Every mutation accepts an idempotency key. Progress updates use optimistic concurrency through `version` or `If-Match`.

### Credentials

```text
POST /api/university/credentials/issue
GET  /api/university/credentials/{publicId}/verify
POST /api/university/credentials/{id}/revoke
```

Credentials are append-only records. A public verification endpoint returns the learner-approved display name, course, issuer, status, issue date, and revocation status. It never exposes email, account ID, assessment evidence, or private records.

### Opportunity and mentoring

```text
GET  /api/university/opportunities?role={role}&state={stateCode}
POST /api/university/opportunities/{id}/interest
POST /api/university/mentor-requests
POST /api/university/employer-handoffs/{id}/consent
```

Saving interest is not an application. Sharing a learner profile with an employer requires explicit, purpose-specific consent and records who received it.

### Tutor

```text
POST /api/university/tutor/sessions
POST /api/university/tutor/sessions/{id}/messages
POST /api/university/tutor/sessions/{id}/escalations
```

The tutor retrieves only approved passages from the learner's active course version. Every answer stores passage IDs, model version, policy version, and safety decision. The tutor must escalate live legal disputes, title conclusions, engineering decisions, personal safety, and regulated professional judgments.

## Persistence now and future DynamoDB

Use repository interfaces from the first production endpoint. Existing Pattadar relational infrastructure is appropriate for early catalog authoring, payments, workforce checks, and workflows needing multi-row transactions. High-write learner state can move independently.

Recommended future tables:

### `UniversityLearning`

```text
PK = LEARNER#{cognitoSub}
SK = ENROLLMENT#{courseId}#{enrollmentId}

PK = LEARNER#{cognitoSub}
SK = PROGRESS#{enrollmentId}#{moduleId}

PK = ENROLLMENT#{enrollmentId}
SK = EVENT#{ulid}
```

Attributes include `courseVersion`, `status`, `completedAt`, `version`, and `idempotencyKey`. A conditional write rejects stale versions. A GSI supports mentor queues without scanning learner partitions:

```text
GSI1PK = REVIEW#{locationSlug}#{skillCode}
GSI1SK = STATUS#{status}#{submittedAt}#{submissionId}
```

### `UniversityCatalog`

```text
PK = COURSE#{courseId}
SK = VERSION#{version}

PK = LOCATION#{locationSlug}
SK = COURSE#{courseId}

PK = JURISDICTION#{stateCode}
SK = PROFILE#{reviewedOn}

PK = JURISDICTION#{stateCode}
SK = SOURCE#{sourceId}#{reviewedOn}
```

Published documents are immutable. A small `COURSE#{courseId} / CURRENT` pointer resolves the active version.

Published course-version documents include `roles`, `jurisdictionScope`, `stateCodes`, and `locationSlugs`. India-general courses are projected into every state discovery result at read-model build time; they are not copied into 36 mutable course records. For a larger catalog, project purpose-built discovery records keyed by state and role rather than scanning `UniversityCatalog`; treat those records as rebuildable read models of immutable published versions.

### `UniversityCredentials`

```text
PK = CREDENTIAL#{credentialId}
SK = STATUS

GSI1PK = LEARNER#{cognitoSub}
GSI1SK = ISSUED#{issuedAt}#{credentialId}
```

Revocation appends an event and changes the current status conditionally. Certificate PDFs live in S3, not DynamoDB.

### `UniversityTutor`

```text
PK = SESSION#{sessionId}
SK = MESSAGE#{ulid}
TTL = retention deadline when the conversation is not retained by the learner
```

Do not build one unbounded learner item containing every module and message. Keep writes small, use stable keys, and project read models from events where useful.

## Files and content

- The preview keeps structured lesson content in `src/content`, separately from catalog metadata. Each module has objectives, approved reading sections, practice evidence, a knowledge check, media status, and optional official-reference IDs. The API can later return the same contract without changing lesson-page behavior.
- `src/data/officialReferences.ts` is the reviewed source registry for the current Andhra Pradesh curriculum. It stores source title, authority, government URL, kind, description, and review date. Tests require every referenced ID to resolve and every URL host to end in `.gov.in` or `.nic.in`.
- `src/data/stateLandRecords.ts` applies the same government-domain rule to the national jurisdiction directory. Its national sources explain the state-led land-record model; each profile then links to the relevant state or union-territory authority. Automated checks enforce 28 states, 8 union territories, unique codes and slugs, local vocabulary, and government-only links.
- `src/data/stateGuideContent.ts` contains no scraped citizen or parcel data. Each of the 36 entries is a dated editorial summary whose citations resolve back to the jurisdiction registry or the national Department of Land Resources sources. Automated checks require substantial record explanations, all four workflow topics, a review checklist, FAQs, unique search metadata, and answer-oriented structured data.
- Portal availability is descriptive and dated. `limited-coverage` and `department-guidance` are first-class states so the product does not invent a public RoR service where the competent government source says coverage is partial, customary, local, or unavailable online.
- Production source monitoring should run as a rate-limited scheduled job over an allowlist of government URLs. It records HTTP status, redirect target, content hash, retrieval time, and the last human-reviewed version. A changed page creates an editorial review task; it must never silently rewrite published legal or training guidance from scraped text.
- Lesson pages and generated course PDFs resolve the same reference IDs, so web and download versions cannot drift into different source lists. A content correction creates a new course version and records the source-review date; published versions remain immutable.
- The Andhra Pradesh foundation teaches evidence boundaries rather than automated title conclusions. Revenue, registration, survey, restriction, tax, and planning sources remain distinct; uncertainty routes to the competent authority or qualified professional.
- Search publishing uses one source object for visible copy, JSON-LD, sitemap dates, dynamic browser metadata, and generated route HTML. `scripts/generateSeo.ts` emits canonical Article, FAQPage, BreadcrumbList, and directory ItemList data without inventing ratings, accreditation, government affiliation, or employment outcomes. Generated snapshots remain readable without JavaScript and are replaced by the interactive React page at runtime.
- Treat generated course artwork as a versioned content asset with prompt provenance and human review. The current prompt manifest lives beside the web derivatives in `public/course-art`.
- Store course PDFs, captions, transcripts, submissions, and certificates in S3 with KMS encryption.
- Keep object keys opaque. Do not include email, phone, Aadhaar, survey number, or learner name in keys.
- Serve protected downloads through short-lived signed URLs after entitlement checks.
- Record content version, checksum, MIME type, size, accessibility metadata, and retention class.
- Scan uploads before mentors can open them.
- Watermark personal certificates at generation time; do not watermark general course material with sensitive identifiers.
- Publish video only with captions, transcript, language, presenter/reviewer, accessibility metadata, checksum, and the immutable course version it teaches. A missing video must never block access to equivalent core learning material.

## Compliance-to-training contract

`src/data/complianceCoverage.ts` maps the published `IN/AP/*` property checklist and company workforce controls to stable lesson module IDs. The preview `/compliance` page makes that mapping reviewable, and tests fail when a mapped lesson disappears or any of the ten workforce rules is omitted.

The static matrix is a content snapshot, not a policy source of truth. Production University APIs must read the currently published compliance-policy ID, version, scope, effective date, and rule keys from the Pattadar Admin governance service. Enrollment and assessment records store the policy and course versions used at the time; a changed policy triggers an impact report and a new curriculum version rather than mutating completed history.

Company-specific thresholds, allocation rules, and clearance decisions must be labelled as Pattadar policy. They must not be presented as government law. External lesson links remain government-only; internal policy provenance is supplied by the authenticated governance API and audit log.

## Events

Use an outbox for relational writes and DynamoDB Streams for DynamoDB writes. Publish versioned events such as:

- `university.enrollment.created.v1`
- `university.module.completed.v1`
- `university.assessment.submitted.v1`
- `university.assessment.reviewed.v1`
- `university.credential.issued.v1`
- `university.credential.revoked.v1`
- `university.opportunity.consent-granted.v1`

Consumers must be idempotent. Event payloads carry IDs and minimum routing data, not course files or sensitive submissions.

## Pricing and entitlement governance

- Prices, taxes, scholarships, refunds, and staff entitlements are server-controlled and versioned. The client never decides eligibility or amount.
- Show the final currency, taxes, refund terms, certificate conditions, and any mentor or assessment fee before payment.
- Free material remains accessible without a payment instrument.
- Paid access uses an entitlement ledger keyed by learner, offering, course version, and order ID.
- Course completion and payment are separate facts. Payment cannot mark a course complete; completion cannot imply payment settlement.
- Employment fees or commissions must be disclosed before profile sharing or application submission.
- No course copy may promise employment, government recognition, legal authority, or a professional licence without verified evidence and approval.

## Governance and safety

- Course publication uses author, reviewer, legal/domain reviewer where needed, effective date, and next-review date.
- Professional courses name jurisdiction and limits. A state-specific legal lesson cannot silently appear as national guidance.
- Mentor accounts require identity, qualification, conflict, safeguarding, and conduct checks appropriate to the role.
- Assessments retain rubric version, reviewer identity, evidence hash, decision, and appeal status.
- Learners can export their learning record and request deletion subject to credential, payment, fraud, and statutory retention rules.
- AI training on learner conversations or submissions is off by default and requires separate consent.
- Accessibility acceptance includes keyboard operation, captions/transcripts, readable PDFs, screen-reader labels, reduced motion, and high contrast.
- Telugu localization must be human-reviewed for legal and survey terminology. Machine translation can draft but cannot publish regulated content.

## Feature acceptance

A feature is ready only when all applicable checks pass:

1. Product: the learner can complete the intended task from discovery through the visible outcome.
2. Identity: authorization is enforced by the API using immutable identity and server roles.
3. Data: ownership, versioning, idempotency, concurrency, retention, and audit behavior are defined.
4. Content: source, author, reviewer, jurisdiction, version, and expiry/review date are visible to administrators.
5. Pricing: entitlement and final cost are server-derived; refund and certificate conditions are shown before purchase.
6. Credential: assessment evidence, reviewer, issue, verification, expiry, and revocation are testable.
7. Employment: no guarantee language; consent precedes employer sharing; withdrawal and complaint paths work.
8. AI: answers cite approved course passages, refuse unsupported conclusions, and escalate regulated or live-record decisions.
9. Accessibility: WCAG 2.1 AA keyboard, focus, contrast, touch-target, caption, PDF, and screen-reader checks pass.
10. Reliability: retries are idempotent, partial failures are recoverable, and user-visible state never claims success before durable confirmation.
11. Security: threat model, least privilege, upload scanning, signed downloads, encryption, rate limits, and abuse monitoring pass review.
12. Operations: dashboards, alerts, runbooks, support ownership, and rollback controls exist before broad release.

## Delivery sequence

1. Catalog, shared sign-in, enrollment, progress, protected PDFs, and learning record.
2. Assessments, mentor review, credential verification, and content administration.
3. Opportunity interest, consented profile handoff, provider/staff training, and location scheduling.
4. Grounded tutor with citations, evaluation suites, policy controls, and human escalation.
5. Move learning progress and tutor sessions to DynamoDB when measured throughput or cost supports the migration. Keep catalog authoring and financial workflows relational unless their access patterns clearly justify a move.
