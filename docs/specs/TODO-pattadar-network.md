# TODO — Pattadar Network

Status: TODO — nothing onboarded. Interest capture is implemented in code on
branch `feat/landing-pattadar-network`; it is not deployed.
Date: 03/10/2026. Owner: Reddy (Chief Architect, final governance owner).

Related: [associates marketplace spec](2026-09-13-associates-marketplace.md) —
the desk/associates model whose disciplines `surveyor`, `advocate`, `writer`
and `agent` overlap the professional network. The task design
(`.agents/tasks/landing-pattadar-network/design.md`, revision 3) is not
committed; its essentials are restated below.

Pattadar Network is the marketplace and professional network around an owner's
portfolio, requested by the founder: property listings to sell, buy, rent or
lease, and professionals (lawyers, surveyors, document writers, land
developers and more). Today only a "Coming soon" landing section and a
register-interest form exist, so Pattadar knows who is interested and can
contact them later.

## Decisions recorded 03/10/2026

| ID | Decision | Status |
|---|---|---|
| D1 | Option A — anonymous, allowlisted single-root GraphQL mutation `registerNetworkInterest`; API-owned table; ceilings enforced in SQL | Implemented in code |
| D2 | No per-IP limiting in v1 (needs a trusted `X-Forwarded-For` hop decision) | TODO: revisit if the hourly ceiling trips |
| D3 | No WAF, ALB or Terraform change | TODO: separate infra approval if abuse appears |
| D4 | Consent text, `CONSENT_VERSION = "2026-10-03"` and the `/privacy` Network section (en + te) are **DRAFTS** | **Needs Reddy's approval before production** |
| D5 | No read surface: no UI or export of the interest list | TODO: decide operator script vs super-admin view |
| D6 | Retention 24 months from `updated_at`, or earlier on withdrawal/request via grievance@pattadar.com | TODO: the purge job is **not built** |
| D7 | `NETWORK_INTEREST_HOURLY_CAP` default 200 | Implemented (env, read once at import) |
| D8 | (a) accept unverified contact ownership for v1 with the mitigations below; nothing is sent to the contact automatically; the first outreach confirms consent | Accepted residual risk |

Further TODOs: normalise district/mandal to the reference tables (they are free
text in v1 because anonymous visitors cannot call the authenticated geography
queries); the D6 purge job, deleting rows whose `updated_at` is older than 24
months, possibly inside the hourly `audit.maintenance` sweep.

## 1. Vision

A network around the records an owner already keeps in Pattadar: a
marketplace where an owner can offer a property they hold a record for, and a
directory of property professionals the owner can reach with the documents
relevant to their question. The record stays private; anything public is a
separate object the owner creates from it.

## 2. Offerings

| Offering | What it would do | What it never claims |
|---|---|---|
| Sell a property | List a property from a Pattadar record, publishing only owner-chosen details | That Pattadar verified title, extent or ownership |
| Buy a property | Find properties listed by their owners in Andhra Pradesh and Telangana | That a listing replaces checking official records |
| Rent or lease | Offer or find land and property for rent or lease | That a listing is a registered lease |
| Lawyers and legal connect | Find a legal professional and share relevant documents (one card: "Legal connect" is not listed separately) | That Pattadar gives legal advice |
| Licensed surveyors | Find a licensed surveyor for measurement and boundary work | That a drawn outline is an official survey |
| Document writers | A directory of document writers for families preparing a transaction | That a listing is a licence check |
| Land developers | Reach land and landscape developers for a plot | Any RERA or approval status |
| Property valuers | Reach a property valuer for an independent valuation | A valuation Pattadar stands behind |

## 3. Built now: interest capture

- Landing section `#network` (eight cards, all "Coming soon"; the sentence "No
  listings or professionals are on Pattadar today."), a `Network` nav entry,
  and the ROADMAP items "Legal connect" and "Trusted document writers" moved
  into it. Guard: `scripts/network-interest-tests.ts`.
- Form fields: interest (one of `sell, buy, rent, lease, lawyer, surveyor,
  document_writer, developer, valuer, other_professional`), name, Indian
  mobile and/or email, optional district, mandal and note, mandatory consent,
  hidden honeypot `website`.
- API: `services/api/src/network.py`, mutation `registerNetworkInterest`,
  table `network_interest` (boot DDL, `IF NOT EXISTS`; no owner or identity
  column). Gateway allowlist: `services/gateway/src/public_graphql.py`.
- Processing order: honeypot → validation (ASCII-only phone rule; Aadhaar-like
  12-digit runs refused in every free-text field) → one transaction: advisory
  lock → hourly ceiling → existing-row lookup → insert or `updated_at` touch.
- Insert-once: no anonymous overwrite of name, contact, place, note or consent;
  a withdrawn row is never revived; a 60-second cool-down; every valid
  submission gets the same answer, including at the ceiling (no registration
  oracle).
- Consent: `CONSENT_VERSION = "2026-10-03"`, `consented_at` per row, SHA-256 of
  the web text pinned in `network.py` (draft wording, D4).
- Logs carry the interest key, the rejected field name or the outcome only;
  database errors are masked.
- Status: Slice 1 (section, nav, this spec) and Slice 2 (capture) implemented
  in code with D1 = Option A. Not deployed; no migration was run by hand.

## 4. Future: "Sell / List this property" from My portfolio

- Entry point: a new `RecordCard` menu action beside `Order a service…` and
  `Share…` in `apps/web/src/w360/pages/Properties.tsx` (the `onOrder`/`onShare`
  pattern), navigating to `/app/records/:id/list`.
- The listing is a separate public object created *from* a record, never the
  record itself; the record stays private.
- Field-by-field publish allowlist chosen by the owner; preview before
  publish; unpublish/withdraw at any time.

## 5. Open decisions for Reddy

Each needs options and a recommendation before its phase starts.

- **Public record data.** Proposed allowlist: property kind, district/mandal/
  village, approximate extent, asking price, owner-written description,
  owner-chosen photos. Never survey-level coordinates by default.
- **Aadhaar numbers, Aadhaar images, deed/passbook images and document
  contents must NEVER be published.** An enforced invariant with a guard and a
  server-side allowlist, not a UI convention.
- **Listing consent:** a separate purpose and version; co-owner/heir consent
  for jointly held records.
- **Identity:** a listing references its owner by immutable issuer/subject,
  never the email local part; legacy keys only via `IDENTITY_LEGACY_BINDINGS`;
  public pages show no owner identifier.
- **Retention** for interests, listings and enquiries (D6). Deletion or
  withdrawal by contact matches `phone` OR `email` OR `contact_key` across all
  interests, never `contact_key` alone (dedup keys on the phone when given,
  else the email, so one person can hold rows under either key).
- **Access** to the interest list and an audit of that access (D5).
- **Contact ownership** (D8): interest rows are unverified; insert-once and
  no-revival apply to anonymous submissions. Option (b), SMS/email
  confirmation, needs a provider activation, itself a reserved decision.
- **DPDP obligations:** notice, purpose limitation, consent withdrawal,
  grievance SLA, data-principal requests for non-account interest rows,
  processor list.
- **Listing moderation:** pre/post moderation, fraud, duplicate and
  ownership-dispute handling, takedown.
- **Professional verification:** Bar Council enrolment, licensed-surveyor
  licence, document-writer licence; recorded vs gating (mirrors associates
  spec decision 7). Pattadar University credentials do not replace a licence.
- **Pricing/fees** (listing fees, lead fees, commissions) and regulatory
  implications such as RERA for developers/brokers — legal review required.
- **Listing photos:** a public storage/share model that does not reuse
  document share tokens; the gateway serves bytes and the bucket stays private.

## 6. Security/privacy invariants carried forward

- `services/api` stays reachable only through the gateway.
- New storage object keys stay `{node}/{version}` with authorization in SQL.
- No Aadhaar or deed content is ever published.
- Dates render DD/MM/YYYY.
- No submitted value in any log line: `network.py` logs field names and outcomes,
  and GraphQL errors on `registerNetworkInterest` log only error class and path
  (`services/api/src/main.py` `PattadarSchema`, AC 18).

## 7. Phasing

1. Interest capture (built now).
2. Professional directory (read-only).
3. Owner listings.
4. Enquiries and messaging.
5. Fees.

## 8. Docs to update when each phase lands

`docs/architecture.md` (trust boundaries, product domains),
`docs/architecture/service-layout.md`, `services/api/README.md`,
`services/gateway/README.md`, `docs/compliance/gdpr-dpdp.md`,
`docs/compliance/engineering-checklist.md`, the `/privacy` notice (en + te),
`design.md` § Copy freeze, and this spec.
