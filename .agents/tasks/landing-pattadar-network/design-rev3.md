# Pattadar Network — landing section, interest capture, roadmap TODO

Status: revision 3, 03/10/2026 (resolves round-1 findings 1–10 and round-2
findings 1–5, see § 9). Worktree `.worktrees/landing-pattadar-network`
(branch `feat/landing-pattadar-network`, base `0ace64b`).

> **Implementation of the backend interest capture (Slice 2) is BLOCKED pending
> Reddy's decision D1 (§ 4.4).** The repository has no existing pattern for a
> credential-less public write and no rate limiting anywhere on the path.
> Slice 1 (landing section, nav entry, TODO spec, design.md amendment) does not
> depend on D1 and can proceed.

---

## 1. Requirements

### 1.1 Summary

Add a "Pattadar Network" section to the public landing page (`/`) presenting
the planned marketplace and professional network (property listings for
sell/buy/rent/lease; lawyers, licensed surveyors, document writers, land
developers, and more) as **Coming soon**, with a register-interest form so
Pattadar can contact interested parties later. Record the full network roadmap,
including the future "Sell / List this property" flow from My portfolio and
every open privacy/product decision, in `docs/specs/TODO-pattadar-network.md`.
Nothing in the network is onboarded or built in the app now.

### 1.2 Functional requirements

- FR1 A new landing section `#network` in `LandingPage.tsx`, placed after
  Pattadar University and before the Wallet band, with all visible copy in
  `landingContent.ts` (`NETWORK`, `NETWORK_INTEREST`).
- FR2 The section lists eight offerings as an even card grid, every card badged
  "Coming soon": Sell a property, Buy a property, Rent or lease, Lawyers and
  advocates, Licensed surveyors, Document writers, Land developers, Valuers,
  builders and more.
- FR3 The section states plainly that no listings or professionals are on
  Pattadar today.
- FR4 A `Network` entry is added to `NAV_LINKS` (scrolls to `#network`).
- FR5 The existing ROADMAP cards "Legal connect" and "Trusted document writers"
  are removed because the Network section now carries them (assumption A3).
- FR6 (Slice 2, blocked on D1) A register-interest form inside the section:
  interest (one choice, grouped "I want to…" sell/buy/rent/lease and "I am a…"
  lawyer/surveyor/document writer/land developer/valuer/other professional),
  name, Indian mobile and/or email (at least one), optional district, optional
  mandal, optional short note, mandatory consent checkbox with purpose text
  linking to `/privacy`, a hidden honeypot field.
- FR7 (Slice 2) Submission is stored server-side with the consent version and
  timestamp; a repeat submission for the same contact and interest never
  creates a duplicate and never overwrites the stored name, contact, place,
  note or consent fields (only `updated_at` moves, and only on a row that is
  not withdrawn and outside the cool-down); a withdrawn row is never revived
  by an anonymous submission; the response never reveals whether a contact
  was already registered or withdrawn — including when the hourly ceiling is
  reached (the ceiling is checked before the existing-row lookup, so every
  valid submission gets the same answer at cap).
- FR8 (Slice 2) The privacy notice (`/privacy`, en + te) gains a section
  describing Network interest data, purpose, retention and withdrawal.
- FR9 `docs/specs/TODO-pattadar-network.md` is created with the contents listed
  in § 5.

### 1.3 Non-functional requirements

- NFR1 Typography: Atkinson Hyperlegible via `--font-sans` only, weights
  400/700 only, `tabular-nums` on any digits; no `font-family` or weight of the
  section's own (design.md § Typography, `scripts/typography-tests.ts`).
- NFR2 Token-only colours from `tokens.css`; amber stays with hero/final CTA
  (design.md § CTA voice) — the form's submit is the ghost CTA voice.
- NFR3 Accessibility: every control has a visible `<label>`; errors are tied
  with `aria-describedby` and announced via `role="alert"` summary on submit;
  full keyboard operation; 44px touch targets; focus ring `--color-focus`;
  reduced-motion respected (the section adds no motion).
- NFR4 Responsive: grid 4 → 2 → 1 columns at existing `grid--four`
  breakpoints; form single column under 720px.
- NFR5 Security (Slice 2): `services/api` reachable only through the gateway;
  strict server-side validation and length limits; parameterized SQL only;
  honeypot; server-enforced abuse ceilings; no PII in logs or error bodies; no
  secrets in code.
- NFR6 Privacy (Slice 2): explicit, purpose-specific, versioned consent;
  Aadhaar-like digit runs rejected in every free-text field (`name`,
  `district`, `mandal`, `note`); data minimisation (no address, no record
  data, no identity linkage).
- NFR7 Dates, if any are shown, render DD/MM/YYYY.

### 1.4 Acceptance criteria

Slice 1:

1. `/` shows a section with heading `A network around your land` reachable
   from the primary nav entry `Network`; the `#network` anchor scrolls to it
   (reduced-motion: instant).
2. The section shows exactly eight offering cards, each with a visible
   `Coming soon` badge, and the sentence `No listings or professionals are on
   Pattadar today.`
3. All section strings come from `landingContent.ts`; `LandingPage.tsx`
   contains no literal user-visible copy for the section (review + guard
   check 6 below).
4. The ROADMAP section no longer contains `Legal connect` or `Trusted document
   writers`; `AI Watch Dog` and `On-demand property visits` remain.
5. `scripts/typography-tests.ts`, `shared-components-tests.ts`,
   `provenance-tests.ts`, `a11y-web-tests.ts`, `contrast-tests.ts`, the rest of
   `scripts/*-tests.ts`, and web typecheck pass.
6. New guard `scripts/network-interest-tests.ts` passes: the NETWORK copy
   contains `Coming soon`, and contains none of `available now`, `verified
   professionals`, `browse listings`, `book now` (case-insensitive).
7. `tests/e2e-app/specs/20-public-auth.spec.ts` NAV_SECTIONS includes
   `['Network', 'A network around your land']` and passes; the existing
   `Services` row still resolves to `Services we're building next`.
8. `docs/specs/TODO-pattadar-network.md` exists with every heading in § 5.
9. design.md § Macrostructure ("8 section links" → 9) and § Copy freeze
   (dated founder-request revision) are amended.

Slice 2 (only after D1 is decided; criteria below assume Option A):

10. Submitting a valid form (interest + name + phone) shows the status message
    `Thanks. We will contact you when Pattadar Network opens near you.` and one
    row exists in `network_interest` with `consent_version` equal to
    `network.CONSENT_VERSION` and a non-null `consented_at`.
11. (a) Re-submitting the same phone + interest within `COOLDOWN_SECONDS`
    (60) leaves one row with `updated_at` unchanged and returns the same
    `received` response.
    (b) Re-submitting after the cool-down (the DB test backdates `updated_at`
    by 61 s) leaves one row with `updated_at` advanced, every other column
    (name, phone, email, district, mandal, note, consent_version,
    consented_at) unchanged even when the second submission carries different
    values, and returns the same `received` response.
11c. A submission for a contact + interest whose row has `withdrawn_at` set
    leaves the row byte-for-byte unchanged (including `withdrawn_at` and
    `updated_at`) and returns `received`.
12. Missing name, neither phone nor email, malformed phone (`12345`,
    `+91 5123456789`), malformed email, unchecked consent, unknown interest,
    over-length fields each produce a field-specific error in the UI and a
    `status="invalid"` (or `consent_required`) result from the API with no row
    written.
13. A 12-digit run (e.g. `1234 5678 9012`, `123456789012`,
    `1234-5678-9012`) in `name`, `district`, `mandal` or `note` is rejected
    with `status="invalid"` and `field` equal to that field, no row is
    written, and the UI shows `Please don't enter Aadhaar or other ID numbers
    here.` on that field.
14. A non-empty honeypot returns `status="received"` and writes no row. The
    honeypot is checked before any validation: a filled honeypot with an
    empty name (and no phone/email, consent unchecked) still returns
    `status="received"` with `field=""` and writes no row.
15. When the configured hourly ceiling is reached, the API returns
    `status="rate_limited"` for a new contact + interest and the UI shows
    `Too many requests right now. Please try again later.`
15b. With the ceiling reached, a valid submission for an already-registered
    contact + interest (active, cooling, or withdrawn) also returns
    `status="rate_limited"`, and that row is unchanged (including
    `updated_at`).
16. `registerNetworkInterest` is accepted anonymously by the gateway
    (`is_public_verify`) only as a single root field. A second root added by
    a fragment, inline fragment or alias (or batched beside
    `verifyBeneficiary` or a private root) is refused; the single-root
    fragment, inline-fragment and alias forms already accepted for
    `verifyBeneficiary` are accepted for `registerNetworkInterest` too
    (gateway pytest).
17. The API schema extension treats `registerNetworkInterest` as public and
    every other root still requires `x-user-id` (api pytest).
18. Server logs for a submission contain the interest key and outcome only —
    no name, phone, email, district, mandal or note (api pytest with `caplog`).
18b. When the transaction raises a `psycopg.Error` whose message contains the
    submitted name, neither the `network.interest_save_failed` line nor any
    `graphql.unexpected_error` line contains that name; the client receives
    the masked `Something went wrong at our end (ref …)` error (api pytest
    with `caplog`).
19. The guard verifies `NETWORK_INTEREST.consentVersion` equals
    `CONSENT_VERSION` in `services/api/src/network.py`, that SHA-256 over the
    UTF-8 bytes of the plain `NETWORK_INTEREST.consent` string (no trailing
    newline, computed with `Bun.CryptoHasher('sha256')`) equals
    `CONSENT_TEXT_SHA256`, that `consent` contains `consentLinkText` exactly
    once, and that
    both allowlists (gateway `public_graphql.py`, API `RequireAuthenticatedRoot`)
    name `registerNetworkInterest`.
20. `/privacy` shows the new Network section in English and Telugu.
21. When the gateway answers the submit with HTTP 401 (stale bearer in
    storage), the form keeps its values and shows the generic failure `Alert`
    `We couldn't save that. Please try again.`; it never shows the
    session-ended sentence or navigates away (e2e-app with a stubbed 401).
22. Phone vectors pass identically in `packages/core` (`phone.test.ts`) and
    api pytest: valid `9848012345`, `+91 98480 12345`, `098480-12345`,
    `919848012345`, `(+91) 98480-12345`; invalid `12345`, `+91 5123456789`,
    `+9198480123456`, `09848012345678`, `98480 1234a`.

### 1.5 Out of scope

- Any in-app (W360) listing, "Sell / List this property" action, listing
  pages, search, professional directory, profiles, messaging, payments or fees.
- Reading/exporting the interest list in any UI (decision D5).
- Sending any notification to registrants.
- Terraform/WAF changes (recorded as a follow-up decision, D3).
- iOS / Expo parity (landing is web-only marketing; classified IGNORE).
- Running any migration, deploy, or live-environment operation.

### 1.6 Assumptions

- A1 The landing page is the "portal" Reddy means; no separate portal app.
- A2 Copy drafted here is a proposal; Reddy approves final wording (copy freeze).
- A3 Legal connect / Trusted document writers move from ROADMAP into Network to
  avoid announcing the same future service twice.
- A4 Interest capture targets people who are not signed in; signed-in visitors
  are already redirected from `/` to `/app`.
- A5 Lease is included (paired with rent in one card); valuers/builders are the
  "and more" card.

---

## 2. Overview

The work splits into two slices. **Slice 1** is pure web + docs: a static
Coming-soon section on the landing page, a nav anchor, the TODO roadmap spec
and the design.md amendments. It changes no trust boundary and can ship now.
**Slice 2** adds the register-interest form and its backend capture. Investigation
(§ 4.1) shows every existing anonymous write in Pattadar is authenticated by a
credential — a hashed capability token or an HMAC-signed webhook — and nothing
on the path (gateway, API, CloudFront WAF, ALB) rate-limits by caller. A
credential-less public write that stores personal contact data is therefore a
new trust class, which is Reddy's reserved security/privacy decision. This
design documents the options, recommends one (Option A), and specifies it fully
so the coder can implement immediately once Reddy approves; until then Slice 2
is blocked.

Technology stack (locked): React 19.2 + MUI 9.2 + Vite 8.1 + TypeScript in
`apps/web`; plain `site.css`/`tokens.css` for landing layout; MUI `TextField`,
`Checkbox`, `FormControlLabel`, `Alert` for form controls (the precedent for
public `.dark.site` pages is `InvitePage.tsx` and `SignupPage.tsx`; MUI's
`colorSchemeSelector: 'class'` makes them render dark inside `.dark`). Backend:
FastAPI + Strawberry GraphQL on PostgreSQL 17 via psycopg, idempotent boot DDL.
No new dependencies.

---

## 3. Slice 1 — landing section (unblocked)

### 3.1 Files

| File | Change |
|---|---|
| `apps/web/src/pages/landing/landingContent.ts` | add `NETWORK`; add `['Network', 'network']` to `NAV_LINKS` between University and Services; remove the two ROADMAP items |
| `apps/web/src/pages/landing/LandingPage.tsx` | render `<section id="network">`; icon map entries |
| `apps/web/src/styles/site.css` | `.network` section rules only if the existing `grid--four`/`card--tba` rules are insufficient (expected: a `.network__note` paragraph style, nothing else in Slice 1; Slice 2 form rules are listed in § 4.3 Slice 2 files) |
| `design.md` | § Macrostructure "8 section links" → "9"; § Copy freeze dated revision entry |
| `scripts/network-interest-tests.ts` | new guard (copy checks now; consent/allowlist checks added in Slice 2) |
| `tests/e2e-app/specs/20-public-auth.spec.ts` | add the NAV_SECTIONS row; add a test asserting eight `Coming soon` badges in `#network` |
| `docs/specs/TODO-pattadar-network.md` | new (§ 5) |

### 3.2 Content shape (`landingContent.ts`)

```ts
export const NETWORK = {
  eyebrow: 'Pattadar Network',
  h2: 'A network around your land',
  intro: 'We are planning a marketplace and a network of property professionals built around the records you keep in Pattadar. None of it is open yet.',
  chip: 'Coming soon',
  note: 'No listings or professionals are on Pattadar today. A listing or directory entry will never replace checking a licence, registration or official record.',
  items: [
    { icon: 'sell',      title: 'Sell a property',       body: 'A planned way to list a property from your Pattadar record, publishing only the details you choose.' },
    { icon: 'buy',       title: 'Buy a property',        body: 'A planned way to find properties listed by their owners in Andhra Pradesh and Telangana.' },
    { icon: 'rent',      title: 'Rent or lease',         body: 'A planned way to offer or find land and property for rent or lease.' },
    { icon: 'gavel',     title: 'Lawyers and advocates', body: 'A planned way to find a legal professional and share the documents relevant to your question.' },
    { icon: 'straighten',title: 'Licensed surveyors',    body: 'A planned way to find a licensed surveyor for measurement and boundary work.' },
    { icon: 'historyEdu',title: 'Document writers',      body: 'A planned directory of document writers for families preparing a transaction.' },
    { icon: 'developer', title: 'Land developers',       body: 'A planned way to reach land and landscape developers for your plot.' },
    { icon: 'more',      title: 'Valuers, builders and more', body: 'More property services will follow as the network grows.' },
  ],
};
```

The `Lawyers and advocates` and `Document writers` bodies reuse the ROADMAP
wording being removed, so no claim is widened. Icons (page-side, MUI outlined):
existing `ICONS` keys `gavel`, `straighten` and `historyEdu` are reused as-is;
only five new keys are added to `ICONS` — `sell` → `SellOutlined`, `buy` →
`ShoppingBagOutlined`, `rent` → `KeyOutlined`, `developer` →
`AgricultureOutlined`, `more` → `MoreHorizOutlined` — imported per-icon from
`@mui/icons-material` exactly like the existing landing imports (typecheck
proves each exists; `scripts/icon-guard.ts` covers the Expo glyph map and is
unaffected but still runs with the UI guards).

### 3.3 Markup

Same grammar as the Features and Roadmap sections — no new component:

```tsx
<section id="network" className="section network" aria-labelledby="network-h">
  <div className="section__inner">
    <header className="section-head">
      <p className="section-eyebrow">{NETWORK.eyebrow}</p>
      <h2 className="section-h" id="network-h">{NETWORK.h2}</h2>
      <p className="section-lead">{NETWORK.intro}</p>
    </header>
    <ul className="grid grid--four">
      {NETWORK.items.map((n) => (
        <li key={n.title} className="card card--tba">
          <div className="card__meta">{ICONS[n.icon]}<span className="badge">{NETWORK.chip}</span></div>
          <h3 className="card__h">{n.title}</h3>
          <p className="card__sub">{n.body}</p>
        </li>
      ))}
    </ul>
    <p className="network__note">{NETWORK.note}</p>
    {/* Slice 2: <NetworkInterestForm /> */}
  </div>
</section>
```

`card card--tba` is the design.md-sanctioned dashed variant for roadmap items;
the shared-components ratchet covers W360 files only, so landing cards are not
page-local copies. Primary-action count (web-feature-delivery step 2): Slice 1
adds zero actions; Slice 2 adds exactly one (the form submit) — no duplicate
"Register interest" buttons in nav, hero or cards.

### 3.4 Edge cases

- Mobile nav: `MarketingNav` already collapses section links into the
  `Sections` menu; a ninth entry needs no layout change. Verify at 360px that
  the open menu does not overflow the viewport.
- Signed-in visitors never see the section (redirect to `/app`), consistent
  with the rest of the landing page.

---

## 4. Slice 2 — register-interest capture (BLOCKED on D1)

### 4.1 Evidence: what exists today

- Public ingress: CloudFront `/api/*` → ALB → gateway. The ALB listener rule
  `api_to_gateway` also serves `api.<domain>/api/*` directly
  (`infra/terraform/modules/runtime/alb.tf`), so the CloudFront WAF can be
  bypassed. The WAF has managed rule groups only, no rate-based rule
  (`cloudfront.tf`).
- Gateway anonymous surface (`services/gateway/src/routes/proxy.py`
  `proxy_pattadar`): an unauthenticated request is proxied only if it is
  `POST graphql` passing `public_graphql.is_public_verification` (one
  operation, one root field from `{verifyBeneficiary, acknowledgeInactivity}`
  or query `{invitePreview}`, body ≤ 64 KiB, ≤ 4096 tokens) or
  `POST payments/webhook`. Identity headers are stripped globally and the
  bearer is never forwarded.
- API defense in depth (`services/api/src/main.py` `RequireAuthenticatedRoot`):
  the same roots (+ `trainingCertificate`) are public; every other root calls
  `_uid_from_info`. Errors are masked by `MaskUnexpectedErrors`.
- Every one of those public writes consumes a **scoped credential**:
  `verifyBeneficiary`/`acknowledgeInactivity` look up a hashed, expiring,
  single-use token; the payment webhook is HMAC-signed; `/api/gateway/
  capabilities/*` require a 43-char capability token.
- Rate limiting: none for callers. The only limiter is JWKS unknown-`kid`
  refresh throttling (`test_jwks_rotation.py`). The gateway forwards
  `X-Forwarded-For` untouched and never derives a client IP.
- Migration convention: no migration runner. Each module exposes `DDL` +
  `ensure_schema(conn)` (e.g. `account.py`) executed from `init_db()` under
  `pg_advisory_lock(918273645)`; DDL is `IF NOT EXISTS`/additive.
- Reusable pure helpers: `associates.contact_key()` (phone → last ten digits,
  email lowercased) and `aadhaar._AADHAAR_LIKE` (12-digit run, any
  separators).

Conclusion: the transport pattern (allowlisted single-root anonymous GraphQL
mutation) exists and is safe as a parser boundary, but **no safe existing
pattern exists for a write with no credential, and no abuse control exists to
bound one.** Per the task instruction this is not invented silently; it is
decision D1.

### 4.2 Options

| | Option | Trust boundary change | Abuse control | Effort | Main risk |
|---|---|---|---|---|---|
| **A** | Anonymous allowlisted GraphQL mutation `registerNetworkInterest`, API-owned table, ceilings enforced in SQL | New credential-less root in both allowlists | Honeypot (checked first), insert-once per contact+interest (no anonymous overwrite, no withdrawal revival), per-contact cool-down, global hourly ceiling checked before the per-contact lookup (advisory-locked count; no registration oracle at cap); optional per-IP later (D2) | S–M | Spam can exhaust the global ceiling (availability of a low-stakes form, not data exposure); junk rows; **contact ownership is unverified** — anyone can register someone else's phone/email, so a stored consent may not be the data principal's (D8) |
| B | Dedicated gateway route `POST /api/gateway/public/network-interest` (pydantic), gateway calls API `/internal/network-interest` with the internal secret | New public REST route + new internal API route | Same as A, but limiter could live in gateway DB | M | Second anonymous-surface pattern beside `public_graphql.py`; more code, two schemas to keep in step |
| C | Signed-in only: "Create an account to register interest", authenticated mutation | None (existing authenticated GraphQL) | Cognito sign-up is the gate | S | Friction; professionals must create an owner account; account creation implies app access and the account consent/erasure model |
| D | Defer capture: ship Slice 1 only; add capture when listings are designed | None | n/a | none | No interest list until later |

**Recommendation: Option A**, with Slice 1 shipping first regardless. It reuses
"the one parsed anonymous mutation surface" (`docs/architecture/
service-layout.md`) instead of adding a second public mechanism (B), keeps the
API the sole owner of SQL and validation, and stores no identity linkage. Its
residual risk is availability of a low-stakes form under abuse, which the
global ceiling caps and alarms make visible; it exposes no stored data (the
mutation returns no rows). If Reddy is not comfortable accepting a
credential-less write, Option C is the safe fallback with zero boundary change;
D is the zero-risk default.

The remainder of § 4 specifies Option A.

### 4.3 Option A specification

#### Contract

```graphql
input NetworkInterestInput {
  interest: String!        # one of INTERESTS
  name: String!
  phone: String! = ""
  email: String! = ""
  district: String! = ""
  mandal: String! = ""
  note: String! = ""
  consent: Boolean!
  consentVersion: String!
  website: String! = ""    # honeypot; real users never see or fill it
}
type NetworkInterestResult {
  status: String!          # received | invalid | consent_required | rate_limited
  field: String!           # input field name for `invalid`, else ""
}
type Mutation { registerNetworkInterest(input: NetworkInterestInput!): NetworkInterestResult! }
```

In Strawberry the optional fields are declared `phone: str = ""` (not
`Optional[str]`), which yields the non-null SDL above, so an explicit `null`
is rejected by GraphQL validation before the resolver runs. As defence in
depth `network.validate()` still coerces any `None` to `""`.

A result type rather than coded GraphQL errors, because the API has no coded
error convention (`MaskUnexpectedErrors` masks exceptions; the web client
regex-matches messages today). The result never echoes input and never says
whether the contact already existed.

Client operation (single root, named, variables only — passes the gateway AST
policy):

```graphql
mutation RegisterNetworkInterest($input: NetworkInterestInput!) {
  registerNetworkInterest(input: $input) { status field }
}
```

#### Validation (server is authoritative; client mirrors for UX)

Order of processing in `network.register` (fixed):

1. **Honeypot first.** If `website` is non-empty after trim, return
   `{status:"received", field:""}` immediately: no validation, no DB access,
   no ceiling check. A bot therefore never learns whether its other fields
   were valid.
2. **Validation** (`network.validate()`, pure, no DB), rows in table order;
   the first failure is returned.
3. **Transaction**: advisory lock → hourly ceiling → existing-row lookup →
   insert or `updated_at` touch (Write path below).

All strings are NFC-normalised, trimmed, and rejected if they contain control
characters (`\x00-\x1f`, `\x7f`) other than `\n` in `note`. **Every free-text
field — `name`, `district`, `mandal`, `note` — is also rejected if it matches
`aadhaar._AADHAAR_LIKE`** (`(?<!\d)(?:\d[\W_]*){11}\d(?!\d)`, imported, not
copied), returning `invalid` with that field. The UI shows one fixed sentence
for this case, `NETWORK_INTEREST.errors.idNumber = "Please don't enter Aadhaar
or other ID numbers here."`; the client mirrors the same regex for UX, the
server check is authoritative. The client mirror is
`looksLikeAadhaar(text): boolean` in a new `packages/core/src/format/idNumber.ts`
(same pattern, `/(?<!\d)(?:\d[\W_]*){11}\d(?!\d)/u`), re-exported from
`packages/core/src/index.ts`, with the AC 13 vectors in `idNumber.test.ts`
mirrored in api pytest. The check runs after length checks, so an
over-length field reports the length error.

| Field | Required | Rule | Failure |
|---|---|---|---|
| `website` (honeypot) | — | checked first; non-empty → `received`, nothing else runs | — |
| `interest` | yes | ∈ `{sell, buy, rent, lease, lawyer, surveyor, document_writer, developer, valuer, other_professional}` | `invalid`/`interest` |
| `name` | yes | 2–80 chars after trim; must not match `aadhaar._AADHAAR_LIKE` | `invalid`/`name` |
| `phone` | one of phone/email | ≤ 20 chars raw; strip spaces, `-`, `(`, `)`; the result must match `^(?:\+91\|91\|0)?([6-9]\d{9})$`; stored as `+91` + group 1 | `invalid`/`phone` |
| `email` | one of phone/email | ≤ 254 chars, `^[^\s@]+@[^\s@]+\.[^\s@]+$`, lowercased | `invalid`/`email` |
| neither phone nor email | — | — | `invalid`/`contact` |
| `district`, `mandal` | no | ≤ 60 chars each, free text; must not match `aadhaar._AADHAAR_LIKE` | `invalid`/`district`/`mandal` |
| `note` | no | ≤ 500 chars; must not match `aadhaar._AADHAAR_LIKE` | `invalid`/`note` |
| `consent` | yes | must be `true` | `consent_required`/`consent` |
| `consentVersion` | yes | must equal `network.CONSENT_VERSION` | `invalid`/`consentVersion` (stale bundle → UI asks to reload) |

Phone is not subject to the Aadhaar check (it is normalised to exactly ten
digits, so a 12-digit run cannot survive the phone rule anyway).

District/mandal are free text in v1 because anonymous visitors cannot call the
authenticated geography queries; normalising to the reference tables is a
TODO-spec item. Phone rule lives in `packages/core/src/format/phone.ts`
(`normalizeIndianMobile(raw): string | null`) for the client and is
re-implemented in `network.py` for the server; both get the same vector tests
(AC 22). `packages/core` exposes only `"."`, so `normalizeIndianMobile` is
re-exported from `packages/core/src/index.ts` before web imports it.

#### Storage — `services/api/src/network.py` (new module, account.py shape)

```sql
CREATE TABLE IF NOT EXISTS network_interest (
  id               TEXT PRIMARY KEY,               -- uuid4
  interest         TEXT NOT NULL,
  name             TEXT NOT NULL,
  phone            TEXT NOT NULL DEFAULT '',       -- +91XXXXXXXXXX or ''
  email            TEXT NOT NULL DEFAULT '',
  contact_key      TEXT NOT NULL,                  -- associates.contact_key(phone or email)
  district         TEXT NOT NULL DEFAULT '',
  mandal           TEXT NOT NULL DEFAULT '',
  note             TEXT NOT NULL DEFAULT '',
  source           TEXT NOT NULL DEFAULT 'landing',
  consent_purpose  TEXT NOT NULL DEFAULT 'network_contact',
  consent_version  TEXT NOT NULL,
  consented_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  withdrawn_at     TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS network_interest_contact
  ON network_interest(contact_key, interest);
CREATE INDEX IF NOT EXISTS network_interest_created
  ON network_interest(created_at);
```

- Lives in the **API** database (owner of product data and of
  `account_consents`), not the gateway hub DB (storage/catalog only).
- No `owner_user_id`, no issuer/subject: the row is deliberately not linked to
  an account, so identity invariants are untouched and account export/erasure
  (`account.CHILD_LINKS`) do not need changes. Deletion on request is by
  contact (§ 4.3 Errors/ops, D6).
- `network.ensure_schema(conn)` is called from `init_db()` next to
  `account.ensure_schema(conn)` inside the advisory lock. Additive DDL only;
  it runs on API boot — **no one runs it manually in any environment as part of
  this task.**
- **Dedup rule:** dedup is by `(contact_key, interest)`, where `contact_key`
  is `associates.contact_key(phone)` if a phone is given, else
  `associates.contact_key(email)`; `phone` and `email` are both stored. A
  visitor who first submits phone + email and later email only, for the same
  interest, gets two rows (one keyed by phone, one by email). Under
  insert-once this is harmless (no overwrite, no revival) and accepted for
  v1; it is not merged automatically.
- **Operator deletion/withdrawal by contact** (D6) therefore matches
  `phone = <normalised phone>` OR `email = <lowercased email>` OR
  `contact_key = <key>`, across all interests — never `contact_key` alone —
  so every row for that data principal is found.
- `CONSENT_VERSION = "2026-10-03"` and `CONSENT_TEXT_SHA256` are constants in
  `network.py`. `NETWORK_INTEREST.consent` is one plain string that includes
  the words `privacy notice`; `NETWORK_INTEREST.consentLinkText =
  'privacy notice'` is the substring the form renders as the `/privacy` link.
  `CONSENT_TEXT_SHA256` is the lowercase hex SHA-256 over the UTF-8 bytes of
  `consent` exactly (no trailing newline, no markup). Changing the wording
  means bumping `CONSENT_VERSION` and the hash together; the guard (AC 19)
  fails otherwise.
- Consent fields on an existing row are never rewritten anonymously. If
  `CONSENT_VERSION` is bumped later, existing rows keep the version they were
  given under; re-consent of existing rows is an operator process decided
  with D4/D6, not a side effect of a public submission.

#### Write path (single transaction, parameterized)

Constants in `network.py`: `COOLDOWN_SECONDS = 60`.

v1 rule (chosen over "allow overwrite within the same 60 s window", which
would still let a stranger rewrite a fresh row): **an anonymous submission
inserts a new row or touches nothing but `updated_at`.** Name, phone, email,
district, mandal, note, `consent_version`, `consented_at` and `withdrawn_at`
are written only on insert. Corrections and withdrawal go through the
grievance/operator path (D6). A withdrawn row is never revived; a withdrawn
contact re-registers only through that path.

The hourly ceiling is checked **first, for every valid non-honeypot
submission, immediately after the advisory lock and before the existing-row
lookup**. This is what keeps FR7 true at cap: once the ceiling is reached a
new contact, an active contact, a cooling contact and a withdrawn contact all
receive `rate_limited`, so the cap cannot be exhausted and then used as a
"is this phone registered as a seller/lawyer?" oracle. The cost — an existing
registrant who re-submits during a flood sees "try again later" — is accepted
because their row already exists. The count still measures only rows
*created* in the last hour, so touches never consume the ceiling.

```
try:
  async with pool.connection() as conn, conn.transaction():
    SELECT pg_advisory_xact_lock(hashtext('network_interest'))
    # 1. global ceiling — before any per-contact lookup (no oracle at cap)
    SELECT count(*) FROM network_interest WHERE created_at > now() - interval '1 hour'
      -> if count >= HOURLY_CAP: return rate_limited                 # no write, regardless of existing row
    # 2. existing row
    SELECT id,
           withdrawn_at IS NOT NULL                                   AS withdrawn,
           updated_at > now() - make_interval(secs => %s)             AS cooling   -- COOLDOWN_SECONDS
      FROM network_interest WHERE contact_key=%s AND interest=%s
    if row:
        if row.withdrawn or row.cooling: return received            # no write
        UPDATE network_interest SET updated_at = now()
         WHERE id = %s AND withdrawn_at IS NULL
        return received
    # 3. new row
    INSERT INTO network_interest (id, interest, name, phone, email, contact_key,
           district, mandal, note, consent_version)
    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
    ON CONFLICT (contact_key, interest) DO UPDATE
       SET updated_at = now()
     WHERE network_interest.withdrawn_at IS NULL
    return received
except psycopg.Error as exc:
    _log.error("network.interest_save_failed error=%s", type(exc).__name__)
    raise NetworkSaveFailed() from None
```

The cool-down comparison is exactly `updated_at > now() - interval
'60 seconds'` (expressed with the bound `COOLDOWN_SECONDS` parameter): true
means no write. The `ON CONFLICT … WHERE withdrawn_at IS NULL` clause is
defensive — the advisory lock makes a conflict unreachable within one
database — and keeps the no-revival rule true even if the lock is ever
removed. `NetworkSaveFailed` is a fixed, PII-free exception:

```python
class NetworkSaveFailed(Exception):
    """Fixed, PII-free; masked by MaskUnexpectedErrors."""
    def __init__(self) -> None:
        super().__init__("network interest save failed")
```

`raise … from None` drops `__cause__`/`__context__`, so the `%r` that
`MaskUnexpectedErrors.anonymise_error` logs (`main.py` ~L7356) is
`NetworkSaveFailed('network interest save failed')` and never a psycopg
message whose `DETAIL` could carry submitted values. Pool-acquisition
timeouts (`psycopg_pool.PoolTimeout`, from the existing `AsyncConnectionPool`
in `main.py`) subclass `psycopg.OperationalError`, so the single
`except psycopg.Error` covers them; the coder confirms this with the DB test
that forces a pool timeout. Any non-psycopg exception is a programming error
and propagates to the masker unchanged (its repr carries no submitted values
because `network.register` never formats input into exception messages).

`NETWORK_INTEREST_HOURLY_CAP` is read from the environment **once, at
`network.py` import**, into the module constant `HOURLY_CAP` (default `200`
when unset or empty), parsed with `int()`. A non-integer or ≤ 0 value fails
closed to `HOURLY_CAP = 0` (every valid submission gets `rate_limited`) and
logs ERROR `network.hourly_cap_invalid` at import (the value itself is not
secret but is not echoed either). Nothing re-reads the env per request; tests
monkeypatch `network.HOURLY_CAP`. The variable is documented in
`services/api/.env.example` (commented, default 200) and in
`services/api/README.md` § 5 (§ 6 docs list). No Terraform change: the
default applies in every environment until D7 says otherwise. The transaction-scoped advisory lock serialises
count-then-insert so the ceiling is exact; volume is tiny, contention
negligible. The resolver lives in `main.py` `Mutation` as a one-line delegate
(`return await network.register(info, input)`), the same shape as
`growth.claim`.

#### Allowlists (both layers, same change)

- `services/gateway/src/public_graphql.py`: mutation roots become
  `{"verifyBeneficiary", "acknowledgeInactivity", "registerNetworkInterest"}`;
  update the module docstring/comment ("A public credential can execute one
  mutation") to say this root is credential-less and bounded by API ceilings.
- `services/api/src/main.py` `RequireAuthenticatedRoot.public_mutations`: add
  `"registerNetworkInterest"`; update its docstring likewise.
- If a bearer is present the gateway validates it and injects `x-user-id` as
  usual; `network.register` ignores identity entirely.

#### Errors and logging

| Condition | Recoverable | Caller receives | Log |
|---|---|---|---|
| Validation failure | yes (user edits) | `{status:"invalid", field}` | INFO `network.interest_rejected reason=<field>` |
| Consent unchecked | yes | `{status:"consent_required", field:"consent"}` | INFO `reason=consent` |
| Stale consent version | yes (reload) | `{status:"invalid", field:"consentVersion"}` | INFO `reason=consent_version` |
| Honeypot filled | n/a | `{status:"received"}` | INFO `network.interest_honeypot` |
| Cool-down hit | n/a | `{status:"received"}` | none |
| Existing row (outside cool-down) | n/a | `{status:"received"}`; only `updated_at` moves | none |
| Withdrawn row | n/a | `{status:"received"}`; no write | none (logging it would reveal withdrawal to log readers per contact; the outcome is not needed operationally) |
| Aadhaar-like run in `name`/`district`/`mandal`/`note` | yes (user edits) | `{status:"invalid", field:<that field>}` | INFO `network.interest_rejected reason=<field>` (never the value) |
| Hourly ceiling (checked before the existing-row lookup; applies to new and existing contacts alike) | yes (later) | `{status:"rate_limited"}` | WARNING `network.interest_ceiling cap=<n>` (alarm candidate; no contact or existing-row outcome logged) |
| `HOURLY_CAP` env invalid | fail closed | every valid submission `rate_limited` | ERROR `network.hourly_cap_invalid` once at import |
| DB/pool error (`psycopg.Error`) | yes (retry by user) | `NetworkSaveFailed` → masked GraphQL error `Something went wrong at our end (ref …)` → UI "We couldn't save that. Please try again." | ERROR `network.interest_save_failed error=<exception class name>`, then the masker's `graphql.unexpected_error … NetworkSaveFailed('network interest save failed')`; never psycopg message/DETAIL text (AC 18b) |
| Gateway 401 (stale bearer in browser storage) | yes (retry) | `gql()` throws `SESSION_ENDED_MESSAGE`; the form maps it to the generic failure `Alert`; `AuthProvider`'s unauthorized handler drops the stale user, so a retry goes out anonymously | existing gateway log |
| Gateway: body > 64 KiB / multi-root / no allowlist match | fatal for request | 401 (existing path) | existing |

Never logged anywhere: name, phone, email, district, mandal, note,
contact_key. The submission is not written to `audit_events` (those are
owner-scoped; there is no owner); the row's own timestamps are the record.

#### Web form — `apps/web/src/pages/landing/NetworkInterestForm.tsx`

- A section component, same pattern as `AssistantConversation.tsx`; copy from
  `NETWORK_INTEREST` in `landingContent.ts` (labels, `<optgroup>` labels,
  option labels, helper texts, error strings, success/ceiling/failure strings,
  consent text, `consentVersion`).
- Controls: MUI `TextField select` with `SelectProps={{ native: true }}` and two
  `<optgroup>` ("I want to…", "I am a…") for interest — native picker,
  keyboard and screen-reader behaviour for free; `TextField` for name, phone
  (`type="tel"`, `inputMode="tel"`, `autoComplete="tel"`, placeholder
  `98480 12345`), email (`type="email"`, `autoComplete="email"`), district,
  mandal, note (`multiline`, `maxLength` 500 with a `tabular-nums` counter);
  `Checkbox` + `FormControlLabel` for consent, whose label renders
  `NETWORK_INTEREST.consent` split once on `consentLinkText`, with that
  substring as a `RouterLink` to `/privacy` (the hashed string is the plain
  `consent`, never the rendered markup).
- Honeypot: `<input name="website" tabIndex={-1} autoComplete="off">` inside a
  `<div className="network-form__hp" aria-hidden="true">`. No visually-hidden
  class exists for `.site` today (`.sr-only` is scoped to `.w360` in
  `w360.css`; `visually-hidden` is referenced but defined nowhere), so
  `site.css` gains `.network-form__hp { position: absolute; left: -10000px;
  width: 1px; height: 1px; overflow: hidden; }` — off-screen, not
  `display:none`, so naive bots fill it. It is not a general utility and is
  not used for screen-reader-only text.
- Submit: one `button.cta.cta--ghost` (not amber, design.md § CTA voice),
  disabled while sending; double-submit prevented by state.
- Validation runs on submit and on blur after first submit; errors via
  `error`/`helperText` (MUI wires `aria-describedby`); a `role="alert"`
  summary above the button lists the first error and moves focus to that field.
- Server result mapping: `received` → replace the form with a `role="status"`
  success message; `invalid` → error on `field` (`contact` → both phone and
  email); `consent_required` → consent error; `rate_limited` → `Alert`
  warning; any thrown error from `gql()` — network, timeout, masked GraphQL
  error, or `SESSION_ENDED_MESSAGE` from a 401 — → `Alert` error `We couldn't
  save that. Please try again.`, form values kept, no navigation (AC 21).
- Calls `gql()` from `apps/web/src/api/client.ts` unchanged (no token is
  attached when signed out; a stale token yields the 401 mapping above). No
  client-API change.
- Proposed consent text (Reddy approves): `I agree that Pattadar may contact me
  by phone or email about Pattadar Network. I can withdraw at any time. See
  the privacy notice.` — "privacy notice" is the `/privacy` link.

#### Testing

- Unit (api pytest, no DB): `network.validate()` vectors for every row of the
  validation table; Aadhaar-like rejection in each of `name`, `district`,
  `mandal`, `note` (AC 13, three separator styles); honeypot short-circuit
  including the filled-honeypot + empty-name vector, asserting no DB call is
  made (AC 14); `HOURLY_CAP` parsing (unset → 200, `"abc"`/`"0"`/`"-5"` → 0
  with one ERROR) by reloading the module under monkeypatched env; log
  hygiene via `caplog`.
- DB-backed (api pytest, same style as `test_aadhaar_vault_db.py`): insert,
  no-duplicate, AC 11a (within cool-down, `updated_at` unchanged), AC 11b
  (backdate `updated_at` by 61 s; only `updated_at` advances even when the
  second submission differs), AC 11c (withdrawn row unchanged), ceiling for a
  new contact (AC 15) and, with `network.HOURLY_CAP` monkeypatched to the
  current row count, for an existing active, backdated-outside-cool-down and
  withdrawn contact — each `rate_limited`, row unchanged (AC 15b); the
  phone+email-then-email-only case yields two rows (dedup rule),
  parameterization (a name containing `'); DROP TABLE` round-trips verbatim),
  and AC 18b (monkeypatch the connection to raise `psycopg.errors.
  StringDataRightTruncation` whose message embeds the submitted name; assert
  `caplog` has neither the name nor any psycopg text, and the GraphQL
  response is the masked ref message).
- Schema (api pytest): `registerNetworkInterest` public, a neighbouring root
  still raises `NotAuthorized`.
- Gateway pytest (`test_public_graphql.py`, new parametrized rows): accepted
  single-root plain, fragment, inline-fragment and alias forms; refused a
  second root via fragment/inline fragment/alias, a duplicate aliased root,
  batching with `verifyBeneficiary`, and batching with a private root (AC 16).
- `packages/core` bun test: `phone.test.ts` vectors.
- Guard `scripts/network-interest-tests.ts`: consent version + hash parity,
  allowlist parity, copy claims.
- e2e-app (sealed, mocked network): fill + submit with a stubbed
  `/api/gateway/pattadar/graphql` route returning each `status` and an HTTP
  401 (AC 21); keyboard-only
  completion; axe check via the existing a11y pattern. Functional acceptance
  against a real local stack (create → upsert → validation failure → ceiling)
  per `functional-acceptance`, local DB only.

#### Slice 2 files

| File | Change |
|---|---|
| `services/api/src/network.py` | new: `DDL`, `ensure_schema`, `CONSENT_VERSION`, `CONSENT_TEXT_SHA256`, `INTERESTS`, `COOLDOWN_SECONDS`, `HOURLY_CAP` (parsed at import), `validate` (imports `aadhaar._AADHAAR_LIKE`), `register` (honeypot → validate → lock → ceiling → lookup → insert/touch), `NetworkSaveFailed` |
| `services/api/src/main.py` | `init_db()` calls `network.ensure_schema(conn)` after `account.ensure_schema(conn)` inside the advisory lock; Strawberry `NetworkInterestInput` (`str = ""` defaults) / `NetworkInterestResult`; `Mutation.registerNetworkInterest` one-line delegate; `RequireAuthenticatedRoot.public_mutations` + docstring |
| `services/gateway/src/public_graphql.py` | mutation allowlist + module comment |
| `services/api/tests/test_network_interest.py` | new: validation vectors, honeypot, ceiling arithmetic, log hygiene, schema public/neighbour-private |
| `services/api/tests/test_network_interest_db.py` | new: AC 10, 11a/b/c, 14, 15, 18b, parameterization |
| `services/gateway/tests/test_public_graphql.py` | new parametrized rows (AC 16) |
| `packages/core/src/format/phone.ts`, `packages/core/src/format/phone.test.ts` | new `normalizeIndianMobile` + AC 22 vectors |
| `packages/core/src/format/idNumber.ts`, `packages/core/src/format/idNumber.test.ts` | new `looksLikeAadhaar` (client mirror of `aadhaar._AADHAAR_LIKE`) + AC 13 vectors |
| `packages/core/src/index.ts` | re-export `normalizeIndianMobile`, `looksLikeAadhaar` |
| `services/api/.env.example` | commented `NETWORK_INTEREST_HOURLY_CAP=` with default 200 |
| `apps/web/src/pages/landing/landingContent.ts` | `NETWORK_INTEREST` (labels, optgroups, options, helpers, errors, result strings, `consent`, `consentLinkText`, `consentVersion`) |
| `apps/web/src/pages/landing/NetworkInterestForm.tsx` | new |
| `apps/web/src/pages/landing/LandingPage.tsx` | render `<NetworkInterestForm />` in `#network` |
| `apps/web/src/styles/site.css` | `.network-form` layout (single column < 720px, two columns above), `.network-form__hp` off-screen rule |
| `apps/web/src/pages/legal/PrivacyPage.tsx` | Network section in `en` and `te` arrays |
| `scripts/network-interest-tests.ts` | add consent version/hash and allowlist parity checks (AC 19) |
| `tests/e2e-app/specs/20-public-auth.spec.ts` | form tests incl. 401 mapping (AC 21) |
| docs in § 6 | as listed |

### 4.4 Decisions for Reddy (block Slice 2)

- **D1 (blocking)** Approve a credential-less public write class? Choose A
  (recommended), B, C or D.
- D2 Per-IP limiting: requires deciding which `X-Forwarded-For` hop the
  gateway trusts (CloudFront path vs direct ALB path differ) and having the
  gateway strip and inject a trusted `x-pattadar-client-ip`. Recommended: not
  in v1; revisit if the global ceiling trips.
- D3 WAF rate-based rule on `/api/*` POST and/or restricting direct ALB
  access to CloudFront origin traffic — infra change, separate approval.
- D4 Consent text, `CONSENT_VERSION`, and privacy-notice wording (en + te).
- D5 Who may read the interest list, and how (operator script vs super-admin
  view behind the existing admin allowlist); no read surface is built now.
- D6 Retention (proposed: 24 months from `updated_at`, or deletion on
  withdrawal/request via grievance@pattadar.com), and whether the purge joins
  the existing hourly `audit.maintenance` sweep in Slice 2. Deletion or
  withdrawal on request matches `phone` OR `email` OR `contact_key` across
  all interests (never `contact_key` alone), because dedup keys on phone when
  given, else email, so one person can hold rows under either key.
- D7 `NETWORK_INTEREST_HOURLY_CAP` value (proposed default 200). Note the
  ceiling also blocks re-submissions from existing registrants while it is
  reached (by design, to avoid an enumeration oracle).
- D8 Contact ownership is unverified (no OTP or email confirmation): anyone
  can enter someone else's phone or email, so a stored consent may not be the
  data principal's. Options: (a) accept for v1 with the mitigations above —
  insert-once, no anonymous overwrite, no withdrawal revival, nothing sent to
  the contact automatically, and the first outreach confirms consent before
  any further contact; (b) require SMS/email confirmation before a row counts
  as consented — needs an SES/SMS provider activation, itself a reserved
  decision. Recommendation: (a) for v1. The residual risk is recorded in
  Option A "Main risk" (§ 4.2) and in the gdpr-dpdp ROPA row (§ 6).

---

## 5. `docs/specs/TODO-pattadar-network.md` — required contents

Header: status `TODO — nothing onboarded`, date, owner Reddy, links to this
design and to `2026-09-13-associates-marketplace.md` (the desk/associates
model, whose disciplines `surveyor`, `advocate`, `writer`, `agent` overlap the
professional network).

1. **Vision** — the network around an owner's portfolio: marketplace +
   professionals, grounded in records the owner already keeps.
2. **Offerings** — listings (sell, buy, rent, lease); professionals (lawyers/
   advocates, licensed surveyors, document writers, land/landscape developers,
   valuers, builders, more), each with "what it would do" and "what it never
   claims" (no title verification, no official-record substitution).
3. **Built now: interest capture** — landing section, form fields, table,
   consent version, ceilings, and the Slice 1/Slice 2 status with D1 outcome.
4. **Future: "Sell / List this property" from My portfolio** — entry point is a
   new `RecordCard` menu action beside `Order a service…`/`Share…` in
   `apps/web/src/w360/pages/Properties.tsx` (`onOrder`/`onShare` are the
   pattern: navigate to `/app/records/:id/list`); the listing is a separate
   public object created *from* a record, never the record itself; field-by-
   field publish allowlist chosen by the owner; preview before publish;
   unpublish/withdraw; the record stays private.
5. **Open decisions for Reddy**, each with options and a recommendation:
   - what record data may ever be public (proposed allowlist: property kind,
     district/mandal/village, approximate extent, asking price, owner-written
     description, owner-chosen photos; never survey-level coordinates by
     default);
   - **Aadhaar numbers, Aadhaar images, deed/passbook images and document
     contents must NEVER be published** — an enforced invariant with a guard
     and a server-side allowlist, not a UI convention;
   - listing consent (separate purpose, separate version) and co-owner/heir
     consent for jointly held records;
   - owner key/identity rules — a listing references the owner by immutable
     issuer/subject (never email local part); legacy keys only via
     `IDENTITY_LEGACY_BINDINGS`; public pages show no owner identifier;
   - data retention for interests, listings, enquiries (D6, including the
     deletion-by-contact rule: match `phone` OR `email` OR `contact_key`
     across all interests, never `contact_key` alone);
   - who can access the interest list and audit of that access;
   - contact-ownership verification for interest rows (D8) and the
     insert-once / no-revival rule for anonymous submissions;
   - DPDP obligations: notice, purpose limitation, consent withdrawal,
     grievance SLA, data-principal requests for non-account interest rows,
     processor list;
   - listing moderation (pre/post moderation, fraud/duplicate/ownership-
     dispute handling, takedown);
   - professional verification (Bar Council enrolment, licensed-surveyor
     licence, document-writer licence; recorded vs gating, mirroring
     associates spec decision 7; University credentials do not replace a
     licence);
   - pricing/fees (listing fees, lead fees, commissions) and any regulatory
     implication (e.g. RERA for developers/brokers) — legal review required;
   - public storage/share model for listing photos (must not reuse document
     share tokens; gateway serves bytes, bucket stays private).
6. **Security/privacy invariants carried forward** — gateway-only API,
   `{node}/{version}` object keys with SQL authorization, no Aadhaar/deed
   publishing, DD/MM/YYYY.
7. **Phasing** — interest capture → professional directory (read-only) →
   owner listings → enquiries/messaging → fees.
8. **Docs to update when each phase lands** (pointer to § 6 of this design).

---

## 6. Documentation and runbook impact

Slice 1:

- `design.md` § Macrostructure (nav link count) and § Copy freeze (dated
  revision: Network section added, two roadmap items moved, by founder
  request).
- `docs/specs/TODO-pattadar-network.md` (new).
- No architecture/route/data-store docs change.

Slice 2 (when Option A lands):

- `docs/architecture.md` — trust-boundary section: add the credential-less
  public mutation and its ceilings; product domains: Network interest.
- `docs/architecture/service-layout.md` — `public_graphql.py` line ("the one
  parsed anonymous mutation surface") and `network.py` in the API module list.
- `services/api/README.md` § 5 "Public verification" — rename/extend to
  "Public operations", list `registerNetworkInterest`, and document
  `NETWORK_INTEREST_HOURLY_CAP` (default 200, read once at import, invalid
  value fails closed). The README has no env table; variables are listed in
  `services/api/.env.example`, which gains the same commented entry.
- `services/gateway/README.md` — security notes: the anonymous GraphQL roots.
- `docs/compliance/gdpr-dpdp.md` — ROPA row (Network interest: name, contact,
  district/mandal, note; RDS `network_interest`; processors AWS; residual risk:
  contact ownership unverified, consent confirmed at first outreach, D8), purpose and
  lawful-basis row (consent, versioned), retention row (D6), rights row
  (withdrawal/deletion by contact via grievance).
- `docs/compliance/engineering-checklist.md` — gateway/trust-boundary item for
  the new anonymous root.
- `apps/web/src/pages/legal/PrivacyPage.tsx` — new section (en + te), D4.
- `docs/architecture/ai-inventory.yaml` — no change (no AI processing).

---

## 7. Governance assessment

- Documentation: § 6.
- Architecture: Slice 1 none; Slice 2 adds an anonymous root and a table
  (architecture-trace update in § 6).
- Security/privacy: Slice 2 is a new public write of personal data — gated on
  D1; mitigations in § 4.3; security-review on the implementation diff;
  secret-scan before commit (no secrets introduced; the cap is a non-secret env
  value).
- Testing/evidence: § 1.4 and § 4.3 Testing; functional acceptance only on a
  local stack. No CI, deploy or live evidence is claimed.
- Cleanup: no processes or artifacts created by this design step.
- iOS/parity: IGNORE (marketing page, no root-schema consumer on iOS; the new
  mutation is web-only and anonymous).

## 8. Open questions

1. D1–D8 above.
2. Should the Network section sit before University instead (owner-facing
   marketplace first)? Proposed: after University, because the professionals
   it trains are part of the network.
3. Is "landscape developers" meant as land/plot developers (layout, plotting)
   or landscaping? Copy uses "Land developers" with "land and landscape
   developers" in the body.
4. Telugu versions of the Network section copy: the landing page is English-
   only today; the privacy notice is bilingual. Proposed: landing stays
   English, privacy section bilingual.

## 9. Responses to design reviews

### Round 1 (CHANGES_REQUESTED, 03/10/2026)

| # | Severity | Response |
|---|---|---|
| 1 | HIGH | Addressed. Write path (§ 4.3) is insert-once: an anonymous submission inserts or moves only `updated_at`; no PII/consent field is overwritten; withdrawn rows are never revived (`ON CONFLICT … DO UPDATE SET updated_at = now() WHERE withdrawn_at IS NULL`, plus an explicit withdrawn check). Chose "no overwrite" over "overwrite within 60 s". FR7 updated; AC 11c added; D8 (unverified contact ownership, recommend accept for v1, no provider activation) added; residual risk in § 4.2 Option A and the ROPA row (§ 6); TODO spec § 5 carries it. |
| 2 | MEDIUM | Addressed. AC 11 split into 11a (within cool-down, unchanged) and 11b (backdated 61 s, advanced); `COOLDOWN_SECONDS = 60`; comparison stated exactly. |
| 3 | MEDIUM | Addressed. `network.register` catches `psycopg.Error` (covers `PoolTimeout`), logs the class name, raises fixed `NetworkSaveFailed()` `from None`; AC 18b and a caplog DB test added. |
| 4 | MEDIUM | Addressed. "Slice 2 files" table added (§ 4.3) including `.network-form__hp` in `site.css` and the `packages/core/src/index.ts` re-export; § 3.1 cross-references it. |
| 5 | NIT | Addressed. Phone regex `^(?:\+91\|91\|0)?([6-9]\d{9})$` after stripping; ≤ 20 raw chars; shared vectors in AC 22. |
| 6 | NIT | Addressed. Plain `consent` string + `consentLinkText`; SHA-256 over UTF-8 bytes, no trailing newline, `Bun.CryptoHasher('sha256')` in the guard (AC 19). |
| 7 | NIT | Addressed. Surveyor card uses existing `straighten`; only `sell`, `buy`, `rent`, `developer`, `more` are new keys. |
| 8 | NIT | Addressed. Strawberry `str = ""` → SDL `String! = ""`; `validate()` also coerces `None`. |
| 9 | NIT | Addressed. AC 16 reworded: only a second root via fragment/inline fragment/alias is refused; existing single-root forms are accepted. |
| 10 | NIT | Addressed. Any `gql()` throw including the 401 `SESSION_ENDED_MESSAGE` maps to the generic failure `Alert`; no client-API change; AC 21 added. |

### Round 2 (CHANGES_REQUESTED, 03/10/2026)

| # | Severity | Response |
|---|---|---|
| 1 | MEDIUM | Addressed. Write path (§ 4.3) now checks the hourly ceiling immediately after the advisory lock, before the existing-row lookup, for every valid non-honeypot submission; at cap new, active, cooling and withdrawn contacts all get `rate_limited` with no write. FR7, Option A abuse cell, errors table, D7 note updated; AC 15b and DB tests added. Accepted cost: an existing registrant re-submitting during a flood sees "try again later". |
| 2 | MEDIUM | Addressed. `aadhaar._AADHAAR_LIKE` applies to `name`, `district`, `mandal` and `note` (validation table + prose; NFR6 aligned); fixed UI string `NETWORK_INTEREST.errors.idNumber` = `Please don't enter Aadhaar or other ID numbers here.`; client mirror `looksLikeAadhaar` in `packages/core/src/format/idNumber.ts`; AC 13 extended to all four fields and three separator styles. |
| 3 | NIT | Addressed. Fixed processing order: honeypot → validation → transaction. Filled honeypot returns `received` with no validation or DB access; AC 14 gains the filled-honeypot + empty-name vector. |
| 4 | NIT | Addressed. `HOURLY_CAP` parsed once at `network.py` import; invalid → 0 + ERROR `network.hourly_cap_invalid` there; tests monkeypatch the constant. `services/api/README.md` has no env table, so the variable is documented in README § 5 prose and `services/api/.env.example` (both in § 6 / Slice 2 files). No Terraform change. |
| 5 | NIT | Addressed. Dedup rule stated in § 4.3 Storage (phone if given, else email; two rows possible, harmless under insert-once); operator deletion matches `phone` OR `email` OR `contact_key`; carried into D6 and TODO spec § 5; DB test covers the two-row case. |

Unverified items carried from the review remain implementation checks: the
five new MUI icon names (typecheck), nine entries in the 360px `Sections`
menu (§ 3.4), and `PoolTimeout` subclassing `psycopg.Error` (DB test).
