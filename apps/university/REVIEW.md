# Pattadar University product review

Reviewed 1 October 2026 against the current `apps/university` preview and its architecture contract. This is the working order for buyer and seller education, Pattadar employee training, service training, and credentials.

## Current inventory

| Area | Current state |
| --- | --- |
| Curriculum | 11 courses and 60 structured lessons, practice activities, and single-question knowledge checks. |
| Learning order | Four suggested paths: buyer, seller, employee, and service professional. All catalog courses appear in at least one path. |
| Jurisdiction | Detailed record courses and published guides for Andhra Pradesh and Telangana. A national jurisdiction registry exists, but the other 34 guides are not published. |
| Record literacy media | Eleven original narrated visual lessons and annotated fictional record guides: six Andhra Pradesh, five Telangana. Each has captions, a transcript, and government source links. English narration and terminology still need human editorial and Telugu review. |
| Learning record | Enrollment and module completion are stored in browser local storage. |
| Credentials | A browser-generated completion **preview** is available at 100% module progress. Separately, the Pattadar associate desk can issue signed internal training certificates with a public verifier and revocation. The two systems are not connected. |
| Workforce | Governance lessons and a compliance-to-training matrix exist. Training is not connected to live staff clearance or provider dispatch permission. |
| Delivery | The educational preview is hosted at `university.pattadar.com` with a separate private S3 origin, CloudFront, DNS, TLS, WAF, and Cognito client. Proposed hubs, mentors, opportunities, fees, and Telugu versions are labeled as proposed or planned. |

## The intended learning order

1. **Buyer:** choose the Andhra Pradesh or Telangana record foundation; add Andhra Pradesh development readiness or general site care if relevant. A complete buyer transaction course is still needed.
2. **Seller:** choose the local record foundation; use the Andhra Pradesh sale-readiness course for its covered state; add site care if relevant. A Telangana sale-readiness course is still needed.
3. **Employee:** learn the records for the assigned state, then Pattadar service governance. Field employees add visit and quick-help practice; office roles need their own operating modules.
4. **Service professional:** learn consent and site evidence, then quick-help operations where relevant; choose only a specialty matching the person's actual qualification (survey, document writing, legal review operations, or site care). Training cannot grant a regulated licence.

These are suggested sequences. The current app does not enforce prerequisites or role eligibility.

## Work still required, in priority order

### P0 — required before issuing a real certificate

1. **Durable learning API:** move enrollment, course version, progress, and assessment records behind authenticated University APIs. Use the shared Pattadar identity and server-side authorization. Do not accept browser progress as credential evidence.
2. **Assessment evidence and review:** record answers and practical submissions against a published course version; provide a reviewer queue, rubric, pass/fail outcome, feedback, retry rules, and an audit trail. A single client-side question currently marks even a supervised assessment module complete.
3. **Connect the existing certificate service:** the associate desk already records a course/version, trainer, evidence reference, issue/expiry dates, signed payload, public verification code, and revocation. Bind issuance to an approved University course version and a reviewed evidence record. Do not infer eligibility from browser progress or a free-text evidence reference. Add a learner-facing issued-certificate view and a server-generated PDF after the provenance gate is real.
4. **Workforce boundary:** check identity, qualifications, company clearance, and training holds before offering work. A University completion or certificate must not automatically confer Pattadar dispatch permission.
5. **Content and pricing approval:** a responsible owner must approve credential names, assessment criteria, course versions, fees, entitlements, refunds, and any claims of professional recognition before production publication.

### P1 — complete the four programs

1. **Buyer curriculum:** add offer and agreement preparation, financing and payment evidence, registration and handover, taxes and recurring obligations, and a qualified-review handoff. Scope every state-specific rule and cite current official sources.
2. **Seller curriculum:** add a Telangana sale course, plus disclosure, negotiation handoff, lien or loan closure, document release, and post-sale record update where the jurisdiction supports it.
3. **Employee curriculum:** add role-based onboarding for support, field operations, document handling, case escalation, incident response, privacy, and periodic requalification. Connect the training matrix to the live Admin policy version.
4. **Service curriculum:** add real field submissions, supervisor observation, equipment and safety checks, customer communication, quality review, remediation, and renewal intervals per discipline.
5. **Language and accessibility:** publish human-reviewed Telugu lessons and narration, check current English narration for pronunciation, run keyboard and screen-reader acceptance checks, and keep captions, transcripts, and equivalent reading access for every video.

### P2 — expand and operate the University

1. Publish further state curricula only after local legal and land-record review; the jurisdiction registry alone is not a course.
2. Replace proposed mentor, hub, and opportunity listings with verified supply, schedules, consent, and capacity management.
3. Add learner support, admin publishing controls, source-change review, content version migrations, analytics, and withdrawal or correction workflows.

The University deployment path and live route handling for static and prerendered pages were verified on 30 September 2026.

## Release gates

- **Educational preview:** every course has complete structured content, honest jurisdiction and source labels, an accessible learner route, and a visible preview credential boundary.
- **Assessed program:** evidence persists server-side; human assessment, identity, qualifications, and appeals or retries are operational.
- **Issued certificate:** issuance and revocation are audited; a public verification ID resolves to current status without exposing private evidence; a downloaded PDF agrees with that status.
- **Work eligibility:** company permission and external licensing checks are separate from course completion, with holds and expiry enforced at assignment time.

The current University learner app meets the educational preview gate for the existing catalog. The separate associate desk has an internal issuance and verification mechanism, but it is not a University course assessment pipeline. The full assessed-program, course-linked certificate, and work-eligibility gates are not met by the learner app.
