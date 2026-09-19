# Pattadar Platform Costing Model

**Date:** 19/09/2026
**Status:** Draft internal cost model for Reddy approval
**Audience:** Product, architecture, finance/accounting, and engineering
**Scope:** Unit costs, plan contribution, 1,000-account scenarios, free-tier subsidy, AI/storage economics, break-even, and cost controls

## 1. Purpose

This document separates three questions that should never be conflated:

1. **Cloud cost:** what AWS and AI providers charge Pattadar.
2. **Cost of service:** cloud cost plus payment, operations, support, and risk reserves.
3. **Customer price:** what a plan or add-on charges.

The figures are conservative planning estimates based on repository architecture and public list prices. They are not live AWS bills, a profit forecast, financial advice, tax advice, or approval to charge customers.

The customer-facing plan design is defined in [`2026-09-19-platform-pricing-model.md`](./2026-09-19-platform-pricing-model.md).

## 2. Model inputs

### 2.1 Population and usage

- 1,000 customer accounts.
- Up to 100 files per account: 100,000 retained files.
- Expected original file size: 5 MB.
- Expected original storage: 500 GB.
- Historical-version overhead: 20%.
- Thumbnail/preview overhead: 10%.
- Expected total retained object bytes: approximately 650 GB.
- Expected private download delivery: 100 GB/month.
- Expected new/changed files: 5,000/month or approximately 25 GB/month.
- AI remains opt-in and prepaid.

### 2.2 Planning currency

- USD to INR planning conversion: ₹85/USD.
- This is a model parameter, not a foreign-exchange forecast.
- Product prices are frozen in INR; provider cost snapshots retain their original currency and conversion basis.

### 2.3 Conservative internal reserves

| Unit | Reserve | Covers |
|---|---:|---|
| Active account | ₹15/account-month | Shared ECS, RDS, edge, monitoring, background work, and baseline uncertainty |
| Retained storage | ₹8/GB-month | S3 bytes, versions, previews, normal delivery, malware amortisation, requests, metadata, and logs |
| AI credit | ₹1.70 maximum provider cost | $0.02 provider list-cost band at ₹85/USD |
| Collection cost | 3% of receipts | Payment processing and payment-failure reserve; provider terms unverified |
| Operations/support | 10% of subscription/add-on receipts | Support and operating reserve; excludes salaries |

The ₹8/GB reserve is intentionally higher than raw S3 storage. Charging only for raw bytes would ignore malware scans, versioning, previews, delivery, logs, failed operations, and retained Trash.

## 3. Plan prices and limits

| Plan | Price/month | Price/year | Groups | Holdings | Storage | File versions |
|---|---:|---:|---:|---:|---:|---:|
| Free | ₹0 | ₹0 | 1 Family | 2 | 1 GB | 100 |
| Family | ₹249 | ₹2,490 | 3 | 25 | 10 GB | 1,000 |
| Family Plus | ₹599 | ₹5,990 | 10 | 100 | 40 GB | 5,000 |
| Estate | ₹1,499 | ₹14,990 | 25 | 500 | 100 GB | 20,000 |

Security, encryption, malware protection, backup controls, account export/erasure, existing-data access, share revocation, and email inactivity safeguards are included at every level.

## 4. Cost per account

### 4.1 Expected utilisation

Expected case assumes 35% of the plan’s included storage is occupied.

| Plan | Revenue/account | Fixed allocation | Expected storage reserve | Payment + operations reserve | Expected total cost | Expected contribution | Margin |
|---|---:|---:|---:|---:|---:|---:|---:|
| Free | ₹0 | ₹15 | ₹2.80 | ₹0 | ₹17.80 | –₹17.80 | Acquisition subsidy |
| Family | ₹249 | ₹15 | ₹28 | ₹32.37 | ₹75.37 | ₹173.63 | 69.7% |
| Family Plus | ₹599 | ₹15 | ₹112 | ₹77.87 | ₹204.87 | ₹394.13 | 65.8% |
| Estate | ₹1,499 | ₹15 | ₹280 | ₹194.87 | ₹489.87 | ₹1,009.13 | 67.3% |

### 4.2 Maximum storage utilisation

This stress case assumes every account uses 100% of included storage.

| Plan | Revenue/account | Fixed + storage reserve | Payment + operations reserve | Maximum planned cost | Contribution | Margin |
|---|---:|---:|---:|---:|---:|---:|
| Free | ₹0 | ₹23 | ₹0 | ₹23 | –₹23 | Acquisition subsidy |
| Family | ₹249 | ₹95 | ₹32.37 | ₹127.37 | ₹121.63 | 48.8% |
| Family Plus | ₹599 | ₹335 | ₹77.87 | ₹412.87 | ₹186.13 | 31.1% |
| Estate | ₹1,499 | ₹815 | ₹194.87 | ₹1,009.87 | ₹489.13 | 32.6% |

The plan remains technically contribution-positive at full included storage, before salaries, GST, marketing, legal/accounting, refunds, and bad debt.

### 4.3 Annual-price equivalent

Annual prices charge ten monthly list prices for twelve months. The monthly-equivalent revenue and margins are therefore lower than the monthly-plan tables above.

| Plan | Annual price | Monthly-equivalent revenue | Expected cost | Expected margin | Full-storage cost | Full-storage margin |
|---|---:|---:|---:|---:|---:|---:|
| Family | ₹2,490 | ₹207.50 | ₹69.98 | 66.3% | ₹121.98 | 41.2% |
| Family Plus | ₹5,990 | ₹499.17 | ₹191.89 | 61.6% | ₹399.89 | 19.9% |
| Estate | ₹14,990 | ₹1,249.17 | ₹457.39 | 63.4% | ₹977.39 | 21.8% |

At full included storage, annual Family Plus and Estate remain contribution-positive but have limited headroom. Annual discounts should not be increased without lower measured storage cost or lower included capacity.

## 5. One thousand accounts on one plan

### 5.1 Expected utilisation

| All 1,000 accounts on | Monthly revenue | Estimated monthly cost | Monthly contribution | Margin |
|---|---:|---:|---:|---:|
| Free | ₹0 | ₹17,800 | –₹17,800 | Acquisition cost |
| Family | ₹249,000 | ₹75,370 | ₹173,630 | 69.7% |
| Family Plus | ₹599,000 | ₹204,870 | ₹394,130 | 65.8% |
| Estate | ₹1,499,000 | ₹489,870 | ₹1,009,130 | 67.3% |

### 5.2 Maximum storage utilisation

| All 1,000 accounts on | Monthly revenue | Maximum planned cost | Contribution | Margin |
|---|---:|---:|---:|---:|
| Free | ₹0 | ₹23,000 | –₹23,000 | Acquisition cost |
| Family | ₹249,000 | ₹127,370 | ₹121,630 | 48.8% |
| Family Plus | ₹599,000 | ₹412,870 | ₹186,130 | 31.1% |
| Estate | ₹1,499,000 | ₹1,009,870 | ₹489,130 | 32.6% |

## 6. Recommended 1,000-account portfolio

Illustrative plan mix:

| Plan | Accounts | Revenue | Expected cost | Expected contribution |
|---|---:|---:|---:|---:|
| Free | 750 | ₹0 | ₹13,350 | –₹13,350 |
| Family | 180 | ₹44,820 | ₹13,567 | ₹31,253 |
| Family Plus | 60 | ₹35,940 | ₹12,292 | ₹23,648 |
| Estate | 10 | ₹14,990 | ₹4,899 | ₹10,091 |
| **Subscription total** | **1,000** | **₹95,750** | **₹44,108** | **₹51,642** |

Expected subscription contribution margin: approximately 54% when paid accounts are monthly.

If half of each paid tier uses annual billing, monthly-equivalent subscription revenue becomes approximately ₹87,771. Under the same 35% storage assumption:

| Mixed billing scenario | Monthly equivalent |
|---|---:|
| Subscription revenue | ₹87,771 |
| Expected cost/reserve including Free accounts | ₹43,070 |
| Expected contribution | ₹44,701 |
| Expected contribution margin | 50.9% |

The portfolio headline must always state its monthly/annual mix. A 54% monthly-only margin is not evidence for an annual-heavy customer base.

This is deliberately more conservative than comparing subscription revenue only to the raw AWS bill. It allocates free-account, storage, payment, and operating reserves.

## 7. AI economics

### 7.1 Credit definition

One AI credit covers up to $0.02 in frozen provider list-cost usage.

```text
provider cost ceiling per credit = $0.02 × ₹85 = ₹1.70
credits charged = max(1, ceiling(actual provider cost / $0.02))
```

### 7.2 Credit packs

| Pack | Revenue | Maximum provider COGS | Collection + operations reserve | Planned contribution | Margin |
|---|---:|---:|---:|---:|---:|
| 25 credits | ₹249 | ₹42.50 | ₹32.37 | ₹174.13 | 69.9% |
| 100 credits | ₹799 | ₹170 | ₹103.87 | ₹525.13 | 65.7% |
| 500 credits | ₹2,999 | ₹850 | ₹389.87 | ₹1,759.13 | 58.7% |

No plan includes recurring AI at launch. This prevents complex deeds, model-price changes, or high output from consuming subscription margin.

### 7.3 Example AI attachment

If 150 of 1,000 accounts buy one 25-credit pack per month:

```text
AI receipts = 150 × ₹249 = ₹37,350
maximum provider COGS = 150 × 25 × ₹1.70 = ₹6,375
collection + operations reserve = ₹4,856
planned AI contribution = approximately ₹26,119
```

If credits are purchased but not consumed, accounting treatment remains a legal/finance decision; unconsumed credits must not be recognized casually as earned margin.

## 8. Storage add-on economics

Corrected recommended prices:

| Add-on | Revenue | Capacity reserve | Collection + operations reserve | Contribution at full use | Margin |
|---|---:|---:|---:|---:|---:|
| 10 GB | ₹149/month | ₹80 | ₹19.37 | ₹49.63 | 33.3% |
| 100 GB | ₹1,399/month | ₹800 | ₹181.87 | ₹417.13 | 29.8% |

The earlier ₹99/10 GB and ₹799/100 GB proposal was rejected because it provided almost no margin—or a loss—at full utilisation after collection and operations reserves.

If 20 accounts buy 10 GB:

```text
storage add-on receipts = 20 × ₹149 = ₹2,980
maximum capacity reserve = 20 × ₹80 = ₹1,600
collection + operations reserve = approximately ₹387
planned contribution = approximately ₹993
```

## 9. Combined expected model

For the recommended account mix plus illustrative add-ons:

| Revenue source | Monthly receipts |
|---|---:|
| Subscriptions | ₹95,750 |
| 150 × 25-credit AI packs | ₹37,350 |
| 20 × 10 GB storage add-ons | ₹2,980 |
| **Total receipts** | **₹136,080** |

| Cost/reserve source | Monthly amount |
|---|---:|
| Subscription account/storage/payment/operations model | ₹44,108 |
| AI provider + collection/operations reserve | ₹11,231 |
| Storage capacity + collection/operations reserve | ₹1,987 |
| **Total planned cost/reserve** | **₹57,326** |

```text
planned monthly contribution = ₹136,080 − ₹57,326 = ₹78,754
planned contribution margin = approximately 57.9%
```

This remains before salaries, GST, marketing, legal/accounting, customer refunds, fraud, chargebacks, bad debt, and capital expenditure.

## 10. Initial 100,000-file ingestion

Expected case: 100,000 files × 5 MB = approximately 500 GB originals.

| One-time/first-month item | Planning estimate |
|---|---:|
| S3 upload requests | Less than $1 |
| GuardDuty malware scan of 500 GB and 100,000 objects | Approximately $65–$70 using published example rates |
| Thumbnail generation | Usually low; may fit Lambda free allowances |
| First month storage, delivery, metadata, and logs | Approximately $20–$45 |
| **Initial non-AI document cost** | **Approximately $85–$115** |

AI extraction is separate:

| Files read by AI | At $0.02/file | At $0.05/file | At $0.10/file |
|---:|---:|---:|---:|
| 1,000 | $20 | $50 | $100 |
| 5,000 | $100 | $250 | $500 |
| 20,000 | $400 | $1,000 | $2,000 |
| 100,000 | $2,000 | $5,000 | $10,000 |

Multi-page deeds can exceed simple-file estimates. AI must be opt-in, estimated before use, prepaid, and never automatically repeated after an interrupted provider call.

## 11. Break-even views

### 11.1 Infrastructure-only indicator

At a ₹12,000–₹15,000 small-platform monthly baseline, approximately 50–65 Family-plan equivalents cover infrastructure before support, tax, labour, and marketing.

### 11.2 Portfolio indicator

The illustrative 1,000-account mix produces:

- ₹95,750 subscription receipts;
- ₹44,108 expected subscription cost/reserve; and
- ₹51,642 subscription contribution before AI/add-ons.

A lower paid conversion or higher free storage utilisation raises subsidy. Track:

```text
paid conversion
active free accounts
retained GB per plan
file versions per account
monthly download GB
new scanned GB and objects
AI credits purchased, reserved, consumed, expired, refunded
provider cost per operation
payment failures/refunds/chargebacks
support contacts per plan
```

## 12. Cost-control rules

1. AI is never automatic and never included as unlimited usage.
2. Every provider call has a durable owner/job usage event and price snapshot.
3. S3 Bucket Keys remain enabled.
4. Retained versions and Trash count against storage.
5. Old versions expire under one disclosed retention policy; security is not tiered.
6. Thumbnails/previews are generated once and reused.
7. Private documents are not publicly cached; safe derivatives may use bounded private caching.
8. Malware scanning is mandatory and included in the storage reserve.
9. Upload bytes are reserved before S3 writes to stop concurrent quota overshoot.
10. Monthly budget alarms cover AI, egress, scanning, storage, logs, and payment failures.
11. Plan prices are reviewed only from tagged actual cost and usage, not anecdote.
12. Cost controls never disable encryption, malware gates, backups, export/erasure, or owner authorization.

## 13. Sensitivity and risk

| Risk | Cost effect | Control |
|---|---|---|
| Average file grows from 5 MB to 10 MB | Storage, scanning, previews, and egress roughly double | File-size UX, compression, add-on pricing, measured average |
| Users replace files frequently | Noncurrent versions increase storage | Count all versions; bounded expiry |
| Private downloads become frequent | India egress can exceed storage | Thumbnails, download monitoring, abuse controls, appropriate CloudFront plan |
| AI runs on all files | One-time cost can reach thousands of USD | Explicit action, credits, estimate, no automatic retry |
| Free users fill 1 GB | Free subsidy approaches ₹23/account-month | Track active free retained GB and conversion |
| Provider/model prices rise | AI pack margin falls | Frozen provider prices, credit bands, new pack version |
| Payment/GST cost exceeds reserve | Net receipts fall | Merchant and tax evidence before launch |
| Support demand is high | Contribution overstates sustainability | Measure contacts/time by plan before promising priority SLA |

## 14. Evidence status

| Evidence | Status |
|---|---|
| Repository architecture and current service payment model | Inspected statically |
| Public AWS/Anthropic list-price inputs | Current planning references; can change |
| Tagged AWS bill by service/environment | Not obtained |
| Real average file size/version count/download GB | Not measured |
| Real AI tokens/cost per document class | Telemetry exists, customer usage not measured |
| Razorpay subscription/merchant pricing | Not obtained |
| GST/accounting/legal treatment | Not reviewed |
| Customer willingness/conversion | Not tested |

Do not call the model validated until at least three months of tagged production or pilot usage and accounting review exist.

## 15. Decisions required from Reddy

1. Approve or change the plan prices and entitlements.
2. Approve corrected storage add-ons: ₹149/10 GB and ₹1,399/100 GB.
3. Approve AI as separate prepaid credits with a $0.02 cost band.
4. Approve the 750/180/60/10 planning mix only as a forecasting scenario, not a target claim.
5. Approve the internal ₹8/GB, ₹15/account, 3% collection, and 10% operations reserves for initial planning.

Separate approval is required before subscription implementation, provider test/live activation, GST representation, Terraform/cloud work, or charging a customer.

## 16. Sources

- [`2026-09-19-platform-pricing-model.md`](./2026-09-19-platform-pricing-model.md)
- [`services/api/src/payments.py`](../../services/api/src/payments.py)
- [`services/api/src/web360.py`](../../services/api/src/web360.py)
- [`services/gateway/src/routes/storage.py`](../../services/gateway/src/routes/storage.py)
- [`services/api/src/ai_reading/usage.py`](../../services/api/src/ai_reading/usage.py)
- [Amazon S3 pricing](https://aws.amazon.com/s3/pricing/)
- [S3 Bucket Keys](https://docs.aws.amazon.com/AmazonS3/latest/userguide/bucket-key.html)
- [Amazon GuardDuty pricing](https://aws.amazon.com/guardduty/pricing/)
- [Amazon CloudFront pricing](https://aws.amazon.com/cloudfront/pricing/)
- [AWS KMS pricing](https://aws.amazon.com/kms/pricing/)
- [AWS Lambda pricing](https://aws.amazon.com/lambda/pricing/)
- [Amazon CloudWatch pricing](https://aws.amazon.com/cloudwatch/pricing/)
- [Claude Sonnet 5 pricing](https://www.anthropic.com/research/claude-sonnet-5)

External pricing content was rephrased for compliance with licensing restrictions.
