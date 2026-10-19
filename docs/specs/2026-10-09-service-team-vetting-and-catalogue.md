# Service team vetting, and the service catalogue

**Date:** 09/10/2026
**Status:** Draft for Reddy's review. Nothing here is built.
**Decision class:** roles, identity and KYC data, schema, pricing authority, dispatch behaviour
**Extends:** [2026-09-13-associates-marketplace.md](2026-09-13-associates-marketplace.md) (the desk), [2026-09-07-service-ticketing-payments.md](2026-09-07-service-ticketing-payments.md) (frozen quotes)
**Line references** are to files as of 09/10/2026; `web360.py` is cited by function name because it moves.
**Owning skills:** `backend-contract-change`, `pattadar-security-review`, `safe-data-migration`, `web-feature-delivery`, `functional-acceptance`

Owners hand Pattadar their land papers and let a stranger walk their fields. They will do that only if every person Pattadar sends has been checked by Pattadar, in person, and Pattadar can show it. This spec makes that true, and gives the company one clear place to run the service list and its prices.

---

## 0. Decisions already taken (Reddy, 09/10/2026)

| # | Question | Decision |
|---|---|---|
| D1 | What identity data to keep about service-team members | **Full document uploads**: driving licence, a second proof, Aadhaar, photo, held in private storage. §5 sets the safeguards. |
| D2 | Who controls the service list and prices | **Super-admin, versioned**: drafts with a reason, then publish; revision history; prices may differ by state; orders keep the price of the day they were placed. |
| D3 | How strict approval is | **Two people, every check**: training, in-person meeting and in-person ID check are all required. The desk recommends and a *different* super-admin approves. Existing members cannot take new jobs until vetted. |
| D4 | Order of work | **Spec first**, then build. |

### What this supersedes in the associates spec

| Associates spec said | Now |
|---|---|
| §0.7 "Credentials are recorded, not gating … requiring a licence PDF before dispatch empties the roster" | Vetting **gates** dispatch (D3). The cold-start cost is accepted; §9 handles the transition. |
| §10 "Refused permanently … RBAC beyond one boolean" | Two roles now meet in one flow: the desk (platform admin) recommends, a super-admin approves (D3). Still no general RBAC: no per-permission grants, no third role. |
| `OFFERABLE = {invited, active}` (associates.py:554) | Only an **approved** member in `active` is offerable. |
| Activation has no preconditions (`set_associate_state`) | Activation is the approval itself, and only happens through §6. |

---

## 1. Where things stand (evidence)

| Capability | Today | Evidence |
|---|---|---|
| Service list and prices | Hard-coded dict of 11 services; a price change is a code deploy; no history | `SERVICE_CATALOGUE` (web360.py); read-only `services_offered` |
| Fee split | One global env var, 0.90 to the provider | `DEFAULT_PAYEE_SHARE` ticketing.py:410; `_payee_share` (web360.py) |
| Applicant queue | None; members start `invited`, which is already offerable | associates.py:549-554 |
| Mandatory training | Certificates exist but are never required; default `training_state='not_required'` | associates.py:84 and `dispatchable`; `issue_training_certificate` (web360.py) |
| In-person meeting or ID check | Not recorded anywhere | — |
| ID proof (DL, Aadhaar, photo) | Not collected; enrolment takes name, phone and address | `invite_associate` (web360.py) |
| Evidence files | Free text; any http(s) value is shown as a clickable link | DeskAssociate.tsx:176-185, :1108-1112 |
| Second approver | None: one platform admin enrols, certifies, activates and dispatches | `invite_associate`, `set_associate_certification`, `set_associate_state` (web360.py) |
| Granting admin | Any platform admin can make anyone an admin; no audit event | `set_platform_admin` (web360.py) |
| Audit of desk actions | `_desk_audit` swallows its own failures; training and messages are not audited | `_desk_audit`, `set_associate_training`, `message_associate` (web360.py) |
| Owner-visible trust | "Verified" means only a professional credential was verified | Ticket.tsx:522; `professional_verified` (web360.py) |

**Why the admin screens are confusing.** "Company members" sits under Administration, which only super-admins see (Shell.tsx:431-434), but every API behind it requires platform admin (`associates`, `invite_associate`, `set_associate_state` in web360.py). A super-admin who is not a platform admin sees an empty roster that looks loaded; a desk admin never sees the entry. The same screens are also mounted twice, at `/app/admin/members/*` and `/app/desk/associates/*` (routes.tsx:400-411).

---

## 2. Roles

Two roles, as today, with one rule each. A person may hold both, but **may not approve someone they prepared** (§6).

| Role | Check | Runs |
|---|---|---|
| **Desk admin** (platform admin) | `_is_admin` (web360.py) | Jobs, the service team, applicants, collecting evidence, recording checks, **recommending** a member |
| **Super-admin** | `_is_super_admin` (web360.py) | **Approving** members, services and prices, granting both roles, compliance rules, Intelligence, geography |

Changes:
- **Only a super-admin can grant or revoke platform admin**, and each grant writes a governance-style audit event, as `set_super_admin` does. Today any platform admin can do it (`set_platform_admin`).
- The gateway's `ADMIN_SUBJECT_IDS` (gateway auth.py:304-329) stays a separate list for the AI-catalogue routes; the README says why.

## 3. Information architecture

Every sidebar entry is gated by the same check its API uses, and every page refuses access the way Desk.tsx:466 does ("not allowed", never an empty list).

**Operations** — desk admin
- **Pattadar desk** `/app/desk` — the job queue (unchanged)
- **Service team** `/app/desk/team` — roster with a **Status** filter: Applied · Vetting · Awaiting approval · Active · Vetting due · Paused · Blocked
- `/app/desk/team/:id` — one member: profile, checklist, documents, history
- `/app/desk/team/enrol` — enrol a member
- `/app/desk/coverage` — unchanged

**Administration** — super-admin
- **Approvals** `/app/admin/approvals` — members awaiting the second sign-off
- **Service catalogue** `/app/admin/catalogue` (renamed from "Services and prices", Reddy 09/10/2026)
- **Admins** `/app/admin/admins` — who holds which role; grant and revoke
- Compliance rules, Intelligence, Government geography — unchanged

The duplicate `/app/admin/members/*` and `/app/desk/associates/*` routes are deleted, with no redirects (no-legacy-link rule). "Company members" is renamed **Service team** in the sidebar, page title and browser tab (VOC-N1).

---

## 4. The member lifecycle

```
applied ─► vetting ─► recommended ─► active ◄─► paused
                ▲          │  (approve)   │
                │          └─ sent back ──┘ (to vetting, with a reason)
                └──────────── vetting_due ◄─ a check expires
any state ─► blocked (reason required)
```

| State | Meaning | Offerable |
|---|---|---|
| `applied` | Entered by the desk (or, in phase 5, by the person). Nothing checked yet. | No |
| `vetting` | At least one check recorded; the checklist is incomplete. | No |
| `recommended` | The desk says every check is done and recommends approval. | No |
| `active` | A super-admin approved. Takes work. | **Yes** |
| `paused` | Temporarily not taking work (their request). | No |
| `vetting_due` | A check expired or was revoked. Holds current jobs, gets no new ones. | No |
| `blocked` | The company's decision, with a reason. | No |

`invited` is renamed `applied`. A member can never reach `active` except through §6.

## 5. The checklist

Every item is an **append-only check record**: who checked, when, where, the outcome, the evidence, and when it expires. A decision is never overwritten in place; a new record supersedes the old one (today `set_associate_certification` overwrites the latest row in place).

| # | Check | Evidence | Who records | Expires (proposal) |
|---|---|---|---|---|
| K1 | **Mandatory training** for each kind of work they will do | A Pattadar University training certificate, already signed and verifiable (`issue_training_certificate`) | Issued by the system on course completion; the desk confirms | Per course; re-training on a rating hold (existing) |
| K2 | **Met in person** | Date, place, who met them, a note; a photo of the person taken at the meeting | Desk admin who met them | Once (refreshed by K3) |
| K3 | **ID checked in person** | Original documents seen in person, plus uploads: **driving licence** (both sides), **one more proof** (voter ID, PAN or passport), **masked Aadhaar** (§5.2) | Desk admin who met them | 24 months, or the DL's expiry if sooner |
| K4 | **Driving licence is genuine** | The DL number checked by the desk on the Parivahan Sarathi "DL status" page; screenshot uploaded | Desk admin | With K3 |
| K5 | **Police or reference check** | Police verification certificate, or two references with phone confirmation | Desk admin | 36 months |
| K6 | **Professional credential** for licensed work (surveyor, advocate, document writer) | Existing credential review (associates.py:506-527) | Desk admin | Credential's own expiry (existing) |

K5 is required or not **per kind of work**, set in the Service catalogue (§7), so a photographer and a surveyor can differ. It defaults to **required** for any work that puts a person on an owner's land or in their papers. That is all work today.

The Parivahan check in K4 is manual on purpose. An automated DL or Aadhaar verification API is a provider integration (`provider-activation`) and a separate decision.

### 5.1 Where the files live

Invariant 8 (one document tree per logged-in user) is about an owner's own files. These files are held by **the company, about the member**. They must never appear in any owner's Documents, nor in the uploading admin's own tree.

**Proposal:**
- A platform-owned storage principal `platform-team-kyc`. Objects are written through the gateway with `{node}/{version}` keys and SSE-KMS under a **dedicated KMS key**, as Aadhaar already has one.
- The `member_files` row links each object to a member and a check. Access is decided in SQL:
  - desk admins and super-admins can read;
  - the member can read their own once they have an account (phase 5);
  - nobody else can, and nothing is shareable.
- **Every view is a critical audit action that fails closed.** Add `associate.kyc_view` to `CRITICAL_ACTIONS` (audit.py:264), so a file that cannot be audited is not served.
- Viewing is in-app only, watermarked with the viewer's name and the time. No download button.
- The free-text `file_ref` field is retired. Old values stay as plain text, never as links.

> **Needs Reddy's ruling (R1):** confirm this "platform-owned, not in any Documents tree" placement as an exception to invariant 8, and record it there.

### 5.2 Aadhaar

The member uploads the **masked Aadhaar** that UIDAI itself issues: only the last 4 digits are visible. Pattadar therefore never holds the full number for a member.
- The desk compares the masked copy with the original card in person (K3).
- The record keeps the last 4 digits only.
- An unmasked upload is refused at the desk ("Upload the masked Aadhaar, which shows only the last 4 digits").
- Pattadar stays outside UIDAI authentication and e-KYC: not an AUA or KUA (gdpr-dpdp.md:79-81).

If the full number is ever needed, the owner-side `aadhaar_vault` pattern applies (aadhaar.py: KMS ciphertext, masked display, no reveal). This spec does not need it.

### 5.3 Retention, export and erasure

| Data | Proposal |
|---|---|
| Check records (no images) | Kept while the person is on the team, plus 3 years after they leave, matching the audit trail's security class (audit.py `RETENTION_DAYS`) |
| ID images (DL, proofs, masked Aadhaar, photo) | Deleted, including every S3 version, **90 days after the person leaves**, or on a valid erasure request |
| An applicant never approved | Everything deleted 90 days after the last activity |

- The member's own export includes their check records and file list. It never includes another person's notes about them.
- Erasure covers every S3 version and delete marker (gdpr-dpdp.md:38).
- The unclaimed-member hard delete (`delete_unclaimed_associate`) also deletes their files.

> **Needs Reddy's ruling (R2):** the retention periods above. They also need the pending DPDP review (gdpr-dpdp.md:49).

## 6. Approval: two people

1. The desk records K1–K6. When every required item is current, the member page offers **Recommend for approval**. This needs a note and moves the member to `recommended`.
2. A super-admin opens **Approvals** and sees one page per member: the checklist with who did each check, the documents (each view audited), and the recommendation. They choose:
   - **Approve** — moves the member to `active`. Requires that the approver is **not** the person who enrolled them, recommended them, or recorded K2 or K3. The server refuses otherwise, and the button is not drawn.
   - **Send back** — moves the member to `vetting`. A reason is required and shown to the desk.
3. Approval, sending back, blocking and every recorded check write an `associate.*` audit event. Audit failures must stop the action:
   - `associate.approve`, `associate.block` and `associate.kyc_view` become critical actions;
   - `_desk_audit` stops swallowing failures for them.

**Dispatch** (`dispatchable`, associates.py:814-860) adds one line at the top: the member must be `active` **and** every required check must be current **and** a certificate must exist for this kind of work. The existing reasons stay ("Licence lapsed", "Retraining required" and so on), joined by "ID check due", "Training not completed" and "Awaiting approval".

**Expiry.** A daily pass moves a member whose required check has expired to `vetting_due`. The desk sees a "due in 30 days" warning first. Jobs already accepted are not taken away; the desk handles them by hand, as `set_associate_state`'s docstring already says.

## 7. Service catalogue (services and prices)

The baseline stays in code (`SERVICE_CATALOGUE`), so a fresh install and the test fixtures keep working. A super-admin publishes **catalogue revisions** over it.

- **Storage:** a new `service_catalogue_sets` table with the same shape and rules as `governance_policy_sets` (governance.py:21): scope key, revision, draft→published→superseded→archived, a reason on every change, and an append-only events table. It is a separate table, not a document kind inside the compliance table, because `UNIQUE (scope_key, revision)` there would make the two kinds collide.
- **Scope:** country, then state. A state revision overrides the country revision per service. District and below are not needed now.
- **Per service, editable:**
  - on or off;
  - label and description;
  - price;
  - turnaround days;
  - which document shelves it files to;
  - whether K5 is required for the people doing it.
- **Not editable** (still code): the order form's fields (they drive validation in `order_service`) and the service key itself. A new service is still a code change; changing or switching off an existing one is not.
- **Orders keep their price.** `work_requests.quoted` already freezes it at order time (`order_service`). Each order also records the catalogue revision it was priced from, so a later revision cannot rewrite a past order or dispute.
- **Price history:** the events table, shown on the service's page as "Changed from ₹2,900 to ₹3,100 on 12/10/2026 by … because …".
- **Owners** see only the published price for their state. A switched-off service is not offered, and a pending order for it is untouched.

### 7.1 Built on 09/10/2026, with Reddy's decisions that day

- **Name and place.** The page is **Service catalogue**, at `/app/admin/catalogue` under Administration (super-admin only).
- **It is the marketplace.** Owners browse the catalogue read-only under Services through the shared `ServiceList`. The super-admin sees the same list in its `manage` mode, where each row opens an edit drawer.
- **Where a service is offered** (`areas`): a list of states, plus optional districts within them. No states listed means everywhere.
  - **Default:** Andhra Pradesh and Telangana only (`AP`, `TS` as `services/api/data/states.csv` spells them). Reddy: "I don't know other places".
  - **Enforced on the server.** A service not offered at a record's state or district is hidden from that owner and refused if ordered.
  - States and districts are chosen with the shared searchable `ChipPicker`.
- **A price can differ by place.**
  - Scopes are `IN/*`, then `IN/<state>`, then `IN/<state>/<district>`. The nearest published one wins.
  - Each place keeps its own versioned drafts.
  - "Set a price for another place" clones a service into an unsaved draft at the chosen state or district.
  - The Versions list publishes a draft, or restores an archived or superseded revision as a new draft.
- **Self-approval.** A super-admin publishes their own drafts. The two-person rule in §6 applies to vetting service-team members, not to prices.
- **Orders keep their price.** Each order records the revisions that priced it, e.g. `IN/AP@1,IN/AP/PRAKASAM@1`.

**Out of scope here**, each a separate decision before real money moves: GST (ticketing spec :451-453), the fee split per service (today one env var), and real payouts (ticketing spec :472-497).

## 8. What owners see

On an order, the provider's line reads, for example: **"Ravi K · Surveyor · ID checked in person · Trained · Licensed"**. Each word appears only when that check is current. "Verified" alone (Ticket.tsx:522) is retired. No document, number or photo of the member is ever shown to an owner. The ⓘ explains what each word means.

## 9. Moving today's team across (D3)

When this ships, every current member moves to `vetting`. Each check they already have carries over: a verified professional credential counts as K6, and an issued certificate as K1. **Nobody is offerable until approved**, so the desk cannot assign new jobs on the day it ships.
- Jobs already accepted continue.
- The release note, and a banner on the desk, says so.
- Ship on a quiet day, and vet the current team first in a staging run.

The migration is additive DDL plus one `UPDATE associates SET state='vetting' WHERE state IN ('invited','active')`. It needs a dry-run count and a rollback statement, run through `safe-data-migration`, and **Reddy's approval before it runs anywhere with real data**.

## 10. Data model (additive)

```sql
-- associates.state gains: applied, vetting, recommended, vetting_due ('invited' → 'applied')
CREATE TABLE associate_checks (            -- append-only; never UPDATEd
  id TEXT PRIMARY KEY, associate_id TEXT NOT NULL,
  check_kind TEXT NOT NULL,                -- training|met|id|dl|police|reference|credential
  discipline TEXT NOT NULL DEFAULT '',     -- for training and credential
  outcome TEXT NOT NULL,                   -- passed|failed|revoked
  detail TEXT NOT NULL DEFAULT '',         -- place, document type, last 4 only
  checked_by TEXT NOT NULL, checked_at TEXT NOT NULL,
  expires_on TEXT NOT NULL DEFAULT '', supersedes TEXT NOT NULL DEFAULT '',
  recipient_user_id TEXT NOT NULL DEFAULT ''   -- puts it in the member's own export/erasure (account.py:86-89)
);
CREATE TABLE member_files (
  id TEXT PRIMARY KEY, associate_id TEXT NOT NULL, check_id TEXT NOT NULL,
  doc_kind TEXT NOT NULL,                  -- dl_front|dl_back|proof|aadhaar_masked|photo|police|screenshot
  node_id TEXT NOT NULL, version_id TEXT NOT NULL,   -- gateway storage; key {node}/{version}
  uploaded_by TEXT NOT NULL, uploaded_at TEXT NOT NULL,
  delete_after TEXT NOT NULL DEFAULT '', recipient_user_id TEXT NOT NULL DEFAULT ''
);
CREATE TABLE associate_approvals (         -- recommend, approve, send back
  id TEXT PRIMARY KEY, associate_id TEXT NOT NULL, action TEXT NOT NULL,
  actor TEXT NOT NULL, reason TEXT NOT NULL DEFAULT '', at TEXT NOT NULL
);
CREATE TABLE service_catalogue_sets (...);   -- same columns as governance_policy_sets
CREATE TABLE service_catalogue_events (...); -- same columns as governance_policy_events
ALTER TABLE work_requests ADD COLUMN IF NOT EXISTS catalogue_revision TEXT NOT NULL DEFAULT '';
```

DDL is applied at boot inside `init_db`'s advisory lock, as today (associates.py:36-39).

## 11. API (GraphQL `Mutation.web` / `Query.web`)

| Call | Who | Notes |
|---|---|---|
| `recordAssociateCheck(id, kind, discipline, outcome, detail, expiresOn, files)` | desk | appends; refuses a full 12-digit number in `detail` |
| `uploadMemberFile` | desk | gateway REST, platform principal; returns node and version |
| `memberFile(id)` | desk, super-admin | critical audit, fails closed; returns a short-lived watermarked view URL |
| `recommendAssociate(id, note)` | desk | every required check must be current |
| `approveAssociate(id)` / `sendBackAssociate(id, reason)` | super-admin | refuses an approver who prepared the member |
| `approvals` | super-admin | the queue |
| `setPlatformAdmin` | **super-admin** (was any admin) | audited |
| `serviceCatalogue(scope)`, `saveServiceCatalogue`, `publishServiceCatalogue`, `serviceCatalogueHistory` | super-admin | as the governance calls |

`servicesOffered` reads the published catalogue for the owner's state, falling back to the code baseline. Its shape is unchanged, so web, iOS and the assistant need no change to keep working (iOS: `sync-ios` NOTE).

## 12. Security review, before build

Threats to cover in `pattadar-security-review`:
- **ID documents leak:** a dedicated KMS key, no share path, no download, a watermark, and a fail-closed audit on view.
- **A rogue admin self-approves:** separation of duties enforced in SQL, not only in the UI.
- **A rogue admin mints admins:** only a super-admin can grant, and every grant is audited.
- **Full Aadhaar slips in:** masked uploads only; refuse 12-digit numbers in free text; log scrubbing (engineering-checklist.md:32).
- **Unclaimed member erasure:** hard delete covers files.
- **Expired check still dispatching:** the daily pass plus the dispatch-time check, which does not depend on the daily pass having run.

## 13. Tests and acceptance

- **Python:** a dispatch refusal for every missing or expired check; separation of duties; an append-only check log; catalogue precedence and frozen quotes; the admin grant gate.
- **Sealed e2e:** the full lifecycle (enrol → checks → recommend → approve by another admin → offerable); send back; expiry → vetting due; publish a price and see it on an order; owner badge words.
- **Disposable `e2e-web360`:** the real mutations, including the separation-of-duties refusal.
- **Storage leg:** gateway contract tests against fake S3. A live MinIO run needs approval.
- Guards: shared components, vocabulary (the "Service team" rename), page-head rules on the new screens.

## 14. Phases

| Phase | Ships | Needs |
|---|---|---|
| **P0 — tidy** | Sidebar and routes match roles; "not allowed" pages; Service team rename; plain-text evidence; admin grants super-admin-only and audited; training and message audits | nothing reserved |
| **P1 — vetting** | States, check log, recommend/approve, dispatch gate, approvals screen, owner badge, migration of the current team | R1 (file placement) for uploads; the migration approval |
| **P2 — documents** | Member file uploads, watermarked view, fail-closed audit, retention jobs | R1, R2, security review |
| **P3 — services and prices** | Catalogue revisions, services and prices screen, price history, order records its revision | none beyond D2 |
| **P4 — later** | Expiry warnings to members by SMS, member self-application (associates phase 5), an automated DL/Aadhaar check (a provider decision) | separate decisions |

P0 and P3 can start in parallel. P1 can ship before P2, recording K2 and K3 without uploads, so that vetting begins while the file store is reviewed.

## 15. Still open for Reddy

- **R1:** member ID files live in a platform-owned store outside every Documents tree; an exception to invariant 8, as §5.1 describes.
- **R2:** retention: check records kept until 3 years after leaving; ID images deleted 90 days after leaving; unapproved applicants after 90 days.
- **R3:** police check K5 default: required for all work today, as proposed, or only for work on the land?
- **R4:** re-check intervals: ID 24 months, police 36 months?
- **R5:** may one person hold both roles and approve someone *they did not prepare*, which this spec allows, or must the approver never be a desk admin at all?
