# Pattadar Platform Pricing Model

**Date:** 19/09/2026
**Status:** Draft recommendation for Reddy approval
**Decision class:** Product promise, budget, payments, tax, and entitlement architecture
**Scope:** Consumer platform subscriptions, free limits, storage add-ons, AI credits, usage accounting, downgrade behavior, and unit economics

## 1. Executive recommendation

Pattadar should use a freemium subscription model with security included for everyone and variable-cost AI sold separately.

The requested free promise is preserved exactly:

> **One family, two properties, and 1 GB encrypted storage are free when AI is not used.**

In executable terminology, “two properties” means two **holdings** across agricultural parcels and built/open-plot properties. A passbook/khata is a container and does not consume a holding slot.

Recommended list prices:

| Plan | Monthly | Annual | Group allowance | Holdings | Retained storage | Stored file versions | Included AI |
|---|---:|---:|---:|---:|---:|---:|---:|
| **Free** | ₹0 | ₹0 | 1 Family | 2 | 1 GB | 100 | None |
| **Family** | ₹249 | ₹2,490 | 3 groups | 25 | 10 GB | 1,000 | None |
| **Family Plus** | ₹599 | ₹5,990 | 10 groups | 100 | 40 GB | 5,000 | None |
| **Estate** | ₹1,499 | ₹14,990 | 25 groups | 500 | 100 GB | 20,000 | None |

Annual pricing is ten months of the monthly list price. An introductory Family price of ₹199/month may be tested as a time-bounded promotion, but it should not become a permanent entitlement without measured conversion and cost evidence.

AI is prepaid and metered separately because provider prices and document complexity vary materially. No plan automatically submits documents to AI.

This document is a design recommendation, not approval to activate subscriptions, change Razorpay, enforce quotas, charge customers, apply GST treatment, or deploy infrastructure.

## 2. Goals

1. Give a household meaningful secure value before payment.
2. Keep encryption, malware protection, backups, privacy rights, and account safety out of premium gating.
3. Make costs predictable for families.
4. Prevent AI and download usage from creating unbounded platform losses.
5. Avoid deleting or hiding existing customer records after downgrade or payment failure.
6. Keep platform subscriptions separate from land-service orders and worker settlement.
7. Make every limit server-authoritative, race-safe, auditable, and consistent across web, Expo, and native iOS.
8. Preserve historical prices and entitlements so a later catalogue change cannot rewrite an old invoice or dispute.

## 3. Current repository state

Pattadar currently has:

- owner-scoped family/group and holding management;
- encrypted, versioned S3-backed document storage;
- durable AI document-reading jobs with token/cost telemetry in logs;
- a service catalogue with frozen ticket quotes;
- optional Razorpay checkout for individual service jobs;
- durable payment operations, webhook deduplication, refunds, transfers, and a service-job ledger; and
- account consent, export, and erasure workflows.

Pattadar does **not** currently have:

- platform plans or subscriptions;
- billing periods, renewal, cancellation-at-period-end, or grace state;
- entitlement or quota enforcement;
- per-owner retained-storage accounting;
- AI credit reservation or an owner-visible usage ledger;
- subscription invoices or payment-method management; or
- active upgrade, checkout, entitlement-usage, or billing screens. The public `/pricing` route is an informational preview only.

The existing service-ticket wallet must not be reused for subscriptions. It represents money set aside for a specific service, worker payout, Pattadar’s service share, and refunds. A subscription has different identity, renewal, entitlement, tax, dispute, and cancellation invariants.

## 4. Plan definitions

### 4.1 Free — ₹0

For an individual household beginning to organise its records.

- 1 `family` group.
- 2 holdings total.
- 1 GB retained storage.
- 100 stored file versions.
- Family members are not separately charged, subject to abuse protection.
- Email inactivity safeguard included.
- Encryption, malware scanning, backups, audit trail, and version recovery included.
- Account export, consent withdrawal, erasure, security controls, and share revocation included.
- No included AI credits.
- AI credit packs may be purchased without upgrading the platform plan.
- No company, trust, partnership, HUF, or portfolio group unless Reddy explicitly includes one in the free group allowance.

### 4.2 Family — ₹249/month or ₹2,490/year

For a household with several pieces of land or built property.

- 3 total groups.
- 25 holdings.
- 10 GB retained storage.
- 1,000 stored file versions.
- Email inactivity safeguard included.
- Private sharing and ordinary record collaboration included within product safety limits.
- AI purchased separately.

### 4.3 Family Plus — ₹599/month or ₹5,990/year

For extended families, mixed personal/group holdings, or more complete record archives.

- 10 groups.
- 100 holdings.
- 40 GB retained storage.
- 5,000 stored file versions.
- Email inactivity safeguard included.
- AI purchased separately.
- Priority support may be included only after a support SLA and staffing owner exist.

### 4.4 Estate — ₹1,499/month or ₹14,990/year

For large personal/family portfolios. This remains an owner product, not an associate firm or professional multi-tenant workspace.

- 25 groups.
- 500 holdings.
- 100 GB retained storage.
- 20,000 stored file versions.
- Email inactivity safeguard included.
- AI purchased separately.
- Assisted onboarding may be offered as a separately costed service, not silently promised in the subscription.

A professional/associate business plan should be designed separately because it introduces staff seats, delegated authority, customer records, liability, support, and tenancy boundaries.

## 5. What counts

### 5.1 Family and group count

- Free includes exactly one owner-scoped `groups` row where `type='family'`.
- Family members do not count as families or groups.
- Paid tiers use a total group allowance covering `family`, `partnership`, `company`, `huf`, `trust`, and `portfolio`, subject to Reddy confirming whether HUF should share the consumer-family allowance.
- Deleted groups stop counting.
- A group cannot be archived today; if archive is later added, a retained archived group should continue to count.

### 5.2 Holding count

One holding is either:

1. one agricultural `parcel` whose passbook is owned by the account; or
2. one directly owned `property` row representing a flat, house, shop, commercial property, or open plot.

Rules:

- A passbook/khata does not count; it may contain several parcels or none.
- Assigning a holding to a family/group does not create another holding.
- Personal and grouped holdings count together.
- Archived holdings continue to consume the limit because they still retain data and can be restored.
- `owned`, `managed`, and `watch` records all count unless Reddy approves an ownership-only commercial promise.
- Imported and document-created holdings count exactly like manually created holdings.

### 5.3 Storage count

Retained storage is the sum of `storage_versions.size_bytes` for the owner.

It includes:

- current file versions;
- historical versions not yet expired;
- files in Trash until hard deletion;
- generated thumbnails and converted previews retained for that owner; and
- retained assistant/document attachments if they use the same customer vault.

It does not include transient processing bytes after their approved short retention has expired.

`storage_nodes.size_bytes` is insufficient because it represents only the current version. File-count limits exist as an abuse guard for millions of tiny objects; byte limits remain the primary customer promise.

### 5.4 AI count

AI is metered from immutable provider-usage events, not estimates, UI counters, application logs, or HTTP retries.

One **AI credit** covers up to **$0.02 of frozen provider list-cost usage**. Charge:

```text
credits = max(1, ceiling(actual_provider_cost_usd / 0.02))
```

Before a provider call, Pattadar shows an estimated credit range and reserves its upper bound. After one successful provider response, it finalises the exact charge and releases unused reserved credits. An interrupted provider call is never automatically repeated, consistent with the existing AI durability invariant.

## 6. Add-ons

### 6.1 Storage

| Add-on | Monthly price | Additional file-version guard |
|---|---:|---:|
| 10 GB | ₹149 | 1,000 |
| 100 GB | ₹1,399 | 10,000 |

Storage add-ons inherit the account plan’s billing period. Versions and Trash continue to count while retained. Buying storage never weakens malware, encryption, retention, or owner-scoping controls.

### 6.2 AI credits

| Pack | Price | Price per credit | Maximum represented provider list cost |
|---|---:|---:|---:|
| 25 credits | ₹249 | ₹9.96 | $0.50 |
| 100 credits | ₹799 | ₹7.99 | $2.00 |
| 500 credits | ₹2,999 | ₹6.00 | $10.00 |

At the planning conversion of ₹85/USD, maximum model COGS per credit is approximately ₹1.70. The remainder funds failed/ambiguous provider attempts, orchestration, storage, payment costs, support, and margin.

Credit rules:

- No automatic top-up by default.
- No provider call without sufficient reservation.
- No charge for a request rejected before provider invocation.
- One provider invocation can consume multiple credits.
- The UI displays estimated credits before confirmation.
- Price and provider-cost snapshots are frozen into each event.
- Credit expiry, refunds, and tax treatment require legal/accounting approval. Recommended starting rule: 12-month validity with clear pre-purchase disclosure.

### 6.3 SMS and WhatsApp

Email safeguards remain included. SMS and WhatsApp should be separately metered or sold in message packs after provider/template approval. They must not be silently substituted for email or bundled before consent, DLT/template, and provider cost evidence exist.

### 6.4 Land services

Encumbrance certificates, surveys, site visits, title opinions, mutation work, and certified copies remain separate service orders at their frozen quoted prices.

The existing worker share/Pattadar share remains the service-order commercial model. A subscription payment must not create wallet funds, settle a worker, alter a service quote, or discount a service unless a later promotion explicitly defines that behavior.

## 7. Unit economics

### 7.1 Planning assumptions

These are planning values, not live AWS bills:

- Currency conversion: ₹85/USD.
- 1,000 accounts and up to 100,000 stored files.
- 5 MB average original file in the expected case.
- 20% storage overhead for retained old versions.
- 10% storage overhead for thumbnails/previews.
- S3 Standard Mumbai planning rate: approximately $0.025/GB-month.
- Normal private delivery: approximately 20% of stored original bytes per month.
- Malware scanning applies to new/changed uploads, not every retained byte every month.
- S3 Bucket Keys remain enabled to reduce KMS request costs.
- Technical fixed platform baseline: approximately $80–$100/month at small scale, before support and labour.
- Payment/provider/tax assumptions are not approved; use a 3% collection-cost reserve for modelling only.

Current external references:

- AWS says S3 Bucket Keys can reduce SSE-KMS request cost by up to 99%: [S3 Bucket Keys](https://docs.aws.amazon.com/AmazonS3/latest/userguide/bucket-key.html).
- AWS GuardDuty’s published example uses per-GB and per-object malware scan charges: [GuardDuty pricing](https://aws.amazon.com/guardduty/pricing/).
- Claude Sonnet 5 is listed at $2/input MTok and $10/output MTok: [Anthropic Sonnet 5](https://www.anthropic.com/research/claude-sonnet-5).
- CloudFront now offers pay-as-you-go and flat-rate plans starting at $0: [CloudFront pricing](https://aws.amazon.com/cloudfront/pricing/).
- KMS key/request prices remain separate from S3 storage: [AWS KMS pricing](https://aws.amazon.com/kms/pricing/).

### 7.2 Cost reserve

For plan safety, use a conservative internal reserve—not the raw S3 price:

| Cost unit | Internal planning reserve |
|---|---:|
| Active account platform allocation | ₹15/account-month |
| Retained customer storage | ₹8/GB-month |
| AI credit maximum provider cost | ₹1.70/credit |
| Collection/payment overhead | 3% of collected revenue |
| Support/operations reserve | 10% of subscription revenue |

The ₹8/GB reserve covers storage, expected versions, previews, ordinary egress, malware amortisation, request/log overhead, and uncertainty. Actual cost must replace this assumption after three months of tagged billing evidence.

### 7.3 Maximum-entitlement stress view

| Plan | Price | Fixed + storage reserve | Payment + operations reserve | Approx. contribution before labour/tax |
|---|---:|---:|---:|---:|
| Family | ₹249 | ₹95 | ₹32 | ₹122 / 49% |
| Family Plus | ₹599 | ₹335 | ₹78 | ₹186 / 31% |
| Estate | ₹1,499 | ₹815 | ₹195 | ₹489 / 33% |

This intentionally tests full storage utilisation on monthly billing. Actual average utilisation should be lower, but pricing must not depend on every paid account using almost nothing.

The annual discount lowers monthly-equivalent full-storage margins to approximately 41.2% (Family), 19.9% (Family Plus), and 21.8% (Estate). See [`2026-09-19-platform-costing-model.md`](./2026-09-19-platform-costing-model.md) for the annual and mixed-billing calculations.

Free at its maximum planned storage has approximately ₹23/month of technical allocation before support. It is a product-acquisition subsidy, not a zero-cost user. The free population and active-storage ratio must be budgeted explicitly.

## 8. Example business model at 1,000 accounts

Illustrative mix:

| Plan | Accounts | Monthly revenue |
|---|---:|---:|
| Free | 750 | ₹0 |
| Family | 180 | ₹44,820 |
| Family Plus | 60 | ₹35,940 |
| Estate | 10 | ₹14,990 |
| **Subscription MRR** | **1,000** | **₹95,750** |

Optional usage assumptions:

- 15% of all accounts purchase one 25-credit pack/month: ₹37,350.
- 20 accounts purchase a 10 GB storage add-on: ₹2,980.

Illustrative total monthly receipts:

```text
₹95,750 subscriptions
+ ₹37,350 AI packs
+ ₹2,980 storage add-ons
= ₹136,080/month
```

At the previously modelled 100,000-file expected case:

- non-AI document infrastructure: approximately $30–$45/month;
- broader small-platform baseline: approximately $80–$100/month;
- maximum AI provider COGS for 3,750 consumed credits: $75 / approximately ₹6,375; and
- 3% collection reserve on ₹136,080: approximately ₹4,082.

This suggests healthy technical contribution before salaries, customer support, refunds, taxes, legal/accounting, marketing, and bad debt. It is not a profit forecast or financial advice.

### 8.1 Break-even indicator

Using a ₹12,000–₹15,000 monthly infrastructure baseline and ₹249 Family list price, approximately 50–65 fully paying Family-equivalent accounts cover infrastructure before payment costs, support, tax, and labour.

Do not use this as a production budget until live tagged costs and measured usage replace the assumptions.

## 9. Customer billing rules

### 9.1 Listed prices

Recommended customer presentation:

- show one final amount, billing interval, renewal date, and cancellation behavior;
- avoid a surprise “platform fee” added at checkout—the subscription price **is** the platform fee;
- state whether GST is included only after tax review;
- absorb ordinary payment processing in list-price economics rather than adding an unexplained convenience fee; and
- show AI/storage add-ons separately before purchase.

### 9.2 Renewal and cancellation

Recommended behavior:

- monthly or annual prepaid periods;
- cancel at period end;
- no automatic deletion on cancellation;
- failed renewal enters a 7-day payment grace period;
- after grace, entitlements downgrade safely;
- refunds follow a published policy and provider-confirmed receipts; and
- a price increase applies at a future renewal with notice, never retroactively.

Grace duration, refund rights, renewal notices, GST invoices, and subscription mandates require legal, accounting, and Razorpay product review.

### 9.3 Downgrade and over-limit behavior

When an account is over its new limit:

- preserve login and all existing records;
- preserve read, download, export, erasure, consent withdrawal, share revocation, and payment/refund status;
- preserve correction of security/privacy-critical details;
- block only new groups, holdings, uploads, versions, or AI jobs that exceed entitlement;
- never auto-delete, hide, reassign, or alter existing data;
- show which limit is exceeded and what action resolves it;
- allow user-driven deletion/export without requiring payment; and
- continue retention and security controls while data remains stored.

An account over storage limit should not receive new uploads, but existing documents remain downloadable and deletable. A failed payment must never make customer data inaccessible.

## 10. Features that must never be paywalled

Every plan receives:

- encryption at rest and in transit;
- malware scanning and clean-file gates;
- server-side owner authorization;
- backups and recovery controls;
- audit and security event recording;
- sign-in, sign-out, recovery, and required MFA/security actions;
- privacy notices and consent withdrawal;
- account export and erasure request/status;
- access to existing records after downgrade;
- share/capability revocation;
- invoices, receipts, refunds, and payment reconciliation status; and
- email inactivity safeguard for the included family.

Higher plans buy capacity and optional processing—not weaker or stronger basic security.

## 11. Entitlement architecture

### 11.1 Separate billing domain

Do not add subscriptions to `payment_intents`, `payment_operations`, `service_payments`, or wallet buckets. Reuse validated provider/HMAC/idempotency patterns, not the ticket data model.

Recommended additive tables:

```text
billing_plan_versions
- id, plan_code, version, currency
- monthly_price, annual_price
- entitlements JSONB
- effective_from, retired_at

billing_accounts
- owner_user_id, current_plan_version_id
- status, period_start, period_end
- grace_until, cancel_at_period_end

subscriptions
- id, owner_user_id, provider, provider_customer_ref
- provider_subscription_ref, interval, status
- plan_version_id, started_at, cancelled_at

subscription_invoices
- id, owner_user_id, subscription_id
- amount, currency, tax_snapshot, status
- provider_order/payment refs, period, created_at

subscription_webhook_events
- provider_event_id, digest, received_at

usage_events
- id, owner_user_id, kind, quantity
- source_id, billing_period, occurred_at
- price/plan snapshot, unique(kind, source_id)

ai_credit_ledger
- id, owner_user_id, entry
- credits, source_id, expires_at
- balance is derived from ledger sums

storage_reservations
- id, owner_user_id, request_key
- bytes_reserved, expires_at, status
```

Identity is the immutable gateway-derived owner principal, never an email local part.

### 11.2 Entitlement contract

Expose one server-authoritative read model:

```text
plan code/version/status
period start/end and grace state
limits: groups, holdings, bytes, file versions
usage: current groups, holdings, retained bytes, versions
available AI credits
blocked operations with plain-language reasons
```

Clients display this state; they do not create authority by hiding or showing buttons.

### 11.3 Group and holding gates

Use one shared server guard called by every creation path:

- `create_group`;
- `create_parcel` and `create_property`;
- W360 unified record creation;
- parcel/property creation from documents; and
- any import flow that materialises a holding.

Count and insert under an owner-scoped advisory/row lock so concurrent requests cannot both pass the last available slot.

Denial uses stable machine codes such as:

```text
PLAN_GROUP_LIMIT
PLAN_HOLDING_LIMIT
PLAN_STORAGE_LIMIT
AI_CREDITS_REQUIRED
SUBSCRIPTION_PAYMENT_REQUIRED
```

### 11.4 Storage gate

The gateway owns storage enforcement because it knows actual bytes and performs the S3 write.

Required sequence:

1. authenticate owner;
2. read current retained bytes and entitlement;
3. reserve incoming bytes atomically;
4. reject before S3 write if over limit;
5. stream/upload and verify stored size;
6. commit `storage_versions` metadata and reservation;
7. release reservation on failure; and
8. reconcile abandoned reservations.

Concurrent uploads must not overshoot the quota. Historical versions and Trash count until lifecycle/hard deletion removes their bytes.

### 11.5 AI credit gate

Required sequence:

1. require AI consent;
2. claim the durable job/run idempotently;
3. estimate and reserve credits;
4. call the provider once;
5. persist provider usage and price-version snapshot;
6. finalise exact credit debit once; and
7. release unused reservation.

Provider availability and admin model enablement remain operational controls separate from customer entitlement.

## 12. Payment architecture

Platform subscription checkout must use a separate route, webhook event classification, tables, and reconciliation lifecycle from service-ticket payments.

Possible provider approaches:

1. Razorpay Subscriptions/mandates if merchant eligibility, supported intervals, UPI/card behavior, refunds, and webhook semantics are accepted.
2. Razorpay Orders with explicit user renewal if recurring mandates are unsuitable at launch.
3. Another provider only through a separate provider-activation and dependency/security review.

No approach is selected by this document. Existing service checkout remains intact and must coexist during rollout.

## 13. Functional acceptance

### Entitlements

- Free account can create one family and two holdings.
- Third holding and second family creation fail without partial rows.
- Passbook creation alone does not consume a holding.
- Archived holdings continue to count.
- All manual, W360, import, and document-created paths enforce the same count.
- Concurrent final-slot requests produce exactly one success.

### Storage

- Uploads within 1 GB succeed and appear in usage.
- An over-limit upload writes no S3 object or metadata row.
- Two concurrent uploads cannot overshoot the limit.
- New versions and Trash continue to count.
- Hard deletion/lifecycle reconciliation releases bytes.
- Download, export, and deletion continue while over limit.

### AI

- Zero-credit account invokes no provider.
- Reservation is idempotent by durable job/run.
- Successful usage debits exactly once.
- Failed pre-provider validation debits nothing.
- Interrupted provider calls are not automatically repeated.
- Cost/credit estimate and actual debit remain visible and reconcilable.

### Billing

- Plan price/version is frozen per invoice.
- Duplicate or reordered webhooks do not duplicate entitlement or money.
- Failed renewal enters grace once.
- Cancellation takes effect at period end.
- Downgrade blocks only new over-limit activity.
- Subscription events never alter a service ticket’s wallet or settlement.

### Privacy and security

- A free account can export and erase all data.
- Downgrade cannot hide records or prevent share revocation.
- No plan bypasses encryption, malware scanning, gateway identity, or owner checks.
- Billing exports omit secrets and provider payment details not required for receipts.

## 14. Delivery sequence

1. Reddy approves tier names, prices, entitlements, counting rules, AI unit, and downgrade policy.
2. Tax/legal review decides GST display, invoices, renewals, refunds, credit validity, and customer terms.
3. Provider review chooses recurring mandate versus explicit renewal; no live activation yet.
4. Implement plan-version, entitlement, usage, storage reservation, and AI ledger domains with providers off/stubbed.
5. Add server gates to every creation path and gateway storage upload.
6. Build active web pricing/billing/usage UI; assess iOS and Expo parity.
7. Run sealed UI tests and disposable-DB functional acceptance for all success/failure/concurrency paths.
8. Validate billing webhook behavior in Razorpay test mode with explicit approval.
9. Run security/privacy and exact-revision release review.
10. Reddy separately approves production provider activation and rollout.

## 15. Decisions reserved for Reddy

| Decision | Recommendation | Alternative/trade-off |
|---|---|---|
| Family list price | ₹249/month; optional ₹199 launch promotion | ₹199 permanent converts more easily but has less full-utilisation margin. |
| Annual discount | 10 months for 12 | Smaller discount improves margin; larger discount improves cash collection. |
| Free entitlement | 1 family, 2 holdings, 1 GB, 100 versions, no AI | More free capacity increases acquisition cost and abuse exposure. |
| Holding count | Parcel + built property; all stakes and archived rows count | Ownership-only/active-only is cheaper to users but permits retained-record limit bypass. |
| Other group types | Paid group allowance | Including HUF in free may better match Indian households but changes the promise. |
| AI model | Separate prepaid credits on all plans | Bundled monthly AI is simpler but exposes plans to provider-price and complexity risk. |
| AI credit | $0.02 provider-cost band | Per-page pricing is simpler but inaccurate for image size, prompts, and output. |
| Storage add-on | ₹149/10 GB; ₹1,399/100 GB | Lower prices do not leave enough headroom for egress, scanning, versions, and collection costs at full utilisation. |
| Payment method | Explicit renewal first unless mandates are proven | Recurring subscriptions improve retention but add mandate/refund/webhook complexity. |
| GST display | Show final customer amount after tax review | “Plus GST” is easier internally but creates checkout surprise. |
| Grace period | 7 days, then safe downgrade | Longer grace improves recovery but extends unpaid storage/usage. |
| AI credit validity | 12 months with disclosure | No expiry creates long-lived accounting/provider-price liability. |

Approval of pricing permits implementation planning only. It does not approve charging customers, merchant onboarding, live Razorpay mode, infrastructure operations, migrations, tax treatment, or release.

## 16. Governance status

| Area | Status | Evidence / gap |
|---|---|---|
| Product model | **Blocked on Reddy** | Tiers and promises are recommendations, not approved offers. |
| Architecture | **Watch** | Integration points are traced; subscription and entitlement domains do not exist. |
| Security/privacy | **Watch** | Non-paywall rules are defined; implementation and acceptance are absent. |
| Payments | **Blocked** | Existing ticket checkout cannot be reused; recurring provider choice is unapproved. |
| Tax/legal | **Unknown** | GST, invoices, renewals, refunds, credit expiry, and terms need human review. |
| Cost evidence | **Watch** | Static pricing model only; no approved live billing/tagged usage evidence. |
| Testing/release | **Blocked** | No subscription implementation or functional evidence exists. |

## 17. Repository evidence

- [`services/api/src/payments.py`](../../services/api/src/payments.py): existing service-ticket intent, webhook, durable operation, capture, transfer, refund, and reconciliation lifecycle.
- [`services/api/src/web360.py`](../../services/api/src/web360.py): service catalogue prices, quote freezing, worker/platform split, wallet aggregation, and unified parcel/property records.
- [`services/api/src/main.py`](../../services/api/src/main.py): group taxonomy and group/parcel/property creation paths.
- [`services/gateway/src/routes/storage.py`](../../services/gateway/src/routes/storage.py): authenticated S3 upload boundary and 100 MB server cap.
- [`services/api/src/ai_reading/jobs.py`](../../services/api/src/ai_reading/jobs.py): durable, consent-gated, non-replayed document reading jobs.
- [`services/api/src/ai_reading/usage.py`](../../services/api/src/ai_reading/usage.py): provider token and cost calculation currently emitted as telemetry rather than billing events.
- [`services/api/src/account.py`](../../services/api/src/account.py): account consent, export, and erasure behavior that must remain available on every plan.
- [`docs/runbooks/razorpay-payments.md`](../runbooks/razorpay-payments.md): current operational authority for service-ticket payments.
- [`docs/runbooks/account-data.md`](../runbooks/account-data.md): active account export/erasure procedure.
- [`docs/compliance/engineering-checklist.md`](../compliance/engineering-checklist.md): current pending per-user storage quota and operational evidence gaps.

## 18. External pricing evidence

External prices are inputs that can change, not permanent product truth:

- [Amazon S3 pricing](https://aws.amazon.com/s3/pricing/)
- [Amazon CloudFront pricing](https://aws.amazon.com/cloudfront/pricing/)
- [Amazon GuardDuty pricing](https://aws.amazon.com/guardduty/pricing/)
- [AWS KMS pricing](https://aws.amazon.com/kms/pricing/)
- [AWS Lambda pricing](https://aws.amazon.com/lambda/pricing/)
- [Amazon CloudWatch pricing](https://aws.amazon.com/cloudwatch/pricing/)
- [Claude Sonnet 5 pricing](https://www.anthropic.com/research/claude-sonnet-5)

Before launch, replace assumptions with the AWS Pricing Calculator for `ap-south-1`, Razorpay commercial terms, tax advice, and at least three months of tagged actual usage.

Content from external pricing sources was rephrased for compliance with licensing restrictions.
