# Design review — Pattadar Network (revision 3)

Reviewed: `.agents/tasks/landing-pattadar-network/design.md` rev 3, against the
worktree `.worktrees/landing-pattadar-network` at `0ace64b` (clean).

Verdict: **CHANGES_REQUESTED** (0 HIGH, 1 MEDIUM, 3 NIT).

The design is in good shape. The backend capture path is concretely specified,
it extends the existing allowlisted single-root anonymous GraphQL pattern
(`public_graphql.py` + `RequireAuthenticatedRoot`) rather than inventing one,
and it honestly classifies a credential-less write as a new trust class
blocked on Reddy's D1. That block-and-escalate is a valid outcome. Gateway-only
reachability and the `x-user-id` trust boundary are preserved; validation,
lengths, honeypot, ceiling, parameterized SQL, consent version + timestamp,
the boot-DDL migration convention and the privacy rules are all covered. One
server validation rule is under-specified in a way that breaks the stated
normalisation and the dedup/cool-down guarantees.

## Findings

### 1. MEDIUM — Server phone rule accepts non-ASCII digits (§ 4.3 Validation, AC 22)

The phone rule is `^(?:\+91|91|0)?([6-9]\d{9})$`, "re-implemented in
`network.py`". Python `re` with a `str` pattern makes `\d` match any Unicode
decimal digit. Checked locally:

```
re.fullmatch(r'^(?:\+91|91|0)?([6-9]\d{9})$', '9८४८०१२३४५')  -> match
stored phone -> '+919८४८०१२३४५'
```

Consequences:
- The stored `phone` is not the documented `+91XXXXXXXXXX` ASCII form.
- `associates.contact_key()` (`_DIGITS = re.compile(r"\D+")`, verified) keeps
  the Unicode digits, so the same number in Devanagari/Telugu/full-width digits
  gets a different `contact_key` from its ASCII form. That bypasses the
  insert-once / cool-down / no-revival rules (a withdrawn ASCII contact can be
  re-registered as the same number in another script) and breaks operator
  deletion-by-contact (D6 matches on normalised `phone`).
- Client and server disagree: JS `\d` is ASCII-only, so the AC 22 "pass
  identically" claim holds only for the listed vectors.

Fix (choose reject, not fold, for v1):
- In `network.py`, compile the phone pattern as
  `re.compile(r"^(?:\+91|91|0)?([6-9][0-9]{9})$")` (or pass `re.ASCII`), and
  state in the validation table: "digits are ASCII `0-9` only; any other
  digit script is `invalid`/`phone`".
- Add to AC 22 invalid vectors (both `phone.test.ts` and api pytest):
  `9८४८०१२३४५` and `９８４８０１２３４５` (full-width).
- Leave `aadhaar._AADHAAR_LIKE` Unicode-aware on the server (it is stricter,
  which is the safe direction).

### 2. NIT — Client Aadhaar mirror is not equivalent to the server regex (§ 4.3 Validation)

`/(?<!\d)(?:\d[\W_]*){11}\d(?!\d)/u` in JS: `\d` is ASCII-only and `\W`
matches every non-ASCII character (including Telugu letters); in Python `\d`
is Unicode and `\W` excludes Telugu letters. So the client misses non-ASCII
digit runs (server catches them; fine) and flags ASCII digits separated by
Telugu letters that the server accepts (user blocked client-side for no server
reason). Fix: state "client mirror is ASCII-only, UX-only; the server is
authoritative and may reject runs the client accepts", and use
`[^0-9A-Za-z]` in place of `[\W_]` in the JS mirror only if exact parity is
wanted. Vectors stay ASCII.

### 3. NIT — Stale "eight section links" comments not in the Slice 1 file list (§ 3.1)

`apps/web/src/pages/landing/MarketingNav.tsx:19` ("Landing's eight section
controls") and `apps/web/src/styles/site.css:2050` ("The eight section links
keep their place on a phone") become wrong with the ninth link. Fix: add both
comment updates ("nine") to the § 3.1 table beside the design.md
Macrostructure edit.

### 4. NIT — Errors table conflates gateway 413 and 401 (§ 4.3 Errors and logging)

The last row says body > 64 KiB → 401. Verified: `proxy_pattadar` returns 413
when the body exceeds `MAX_PROXY_BODY_BYTES` (read before auth); only a body
under that cap but over `public_graphql`'s 65536-byte check, or a multi-root /
non-allowlisted document, falls through to `validate_bearer(strict=True)` →
401. Fix: split the row: "> `MAX_PROXY_BODY_BYTES` → 413; > 64 KiB public
parse cap, multi-root, or non-allowlisted root → 401". The form already maps
any `gql()` throw to the generic failure, so no UI change.

## Verified assumptions

- `public_graphql.py`: body cap 65536, `parse(..., max_tokens=4096)`, single
  root via fields/inline fragments/fragment spreads, mutation allowlist
  `{verifyBeneficiary, acknowledgeInactivity}`, query `{invitePreview}`, and
  the "A public credential can execute one mutation" comment the design says
  to update.
- `proxy.py` `proxy_pattadar`: anonymous request proxied only via
  `is_public_verify` or `POST payments/webhook`; a presented-but-invalid bearer
  raises 401 (`strict=False` semantics), which supports AC 21; identity headers
  incl. `authorization`/`x-user-id` stripped; `x-user-id` only injected from
  validated claims.
- `main.py` `RequireAuthenticatedRoot`: `public_queries = {trainingCertificate,
  invitePreview}`, `public_mutations = {verifyBeneficiary,
  acknowledgeInactivity}`; every other root calls `_uid_from_info`.
- `MaskUnexpectedErrors`: masks any original error that is not
  `NotAuthorized`/`ValueError`/`ProtectionUnavailable`, logs
  `graphql.unexpected_error ... %r` of `original_error`, message `Something went
  wrong at our end (ref …)`. A plain `Exception` subclass (`NetworkSaveFailed`)
  is masked; `from None` keeps the repr PII-free. Note `ValueError` is NOT
  masked, so the design's choice of result statuses over raised `ValueError`s
  is correct.
- `init_db()` holds `pg_advisory_lock(918273645)` and calls
  `account.ensure_schema(conn)` → `growth.ensure_schema` → `audit.ensure_schema`
  before unlock; adding `network.ensure_schema` after `account` fits.
- `Mutation.claim_invitation` delegates `return await growth.claim(...)` — the
  one-line delegate shape exists.
- `aadhaar._AADHAAR_LIKE` exists with exactly the quoted pattern
  (`aadhaar.py:398`).
- `associates.contact_key()` exists: email lowercased, phone → last ten digits
  via `\D+` strip, `''` for < 10 digits.
- `AsyncConnectionPool` from `psycopg_pool` is used in `main.py`.
- `landingContent.ts`: `NAV_LINKS` has eight entries with University before
  Services; `ROADMAP` holds `Legal connect` / `Trusted document writers` with
  the bodies the design reuses verbatim; those strings appear nowhere else in
  apps/tests/scripts/docs.
- `LandingPage.tsx`: `ICONS` has `gavel`, `straighten`, `historyEdu`; section
  order University → Wallet band → Services; signed-in redirect to `/app`.
- `site.css`: `.grid` auto-fit min 320px, `.grid--four` 4 columns at ≥ 60rem,
  `.card--tba`, `.badge`, `.card__meta` exist; roadmap uses its own
  `roadmap__list` lane, so dropping to two items does not break a grid.
- `MarketingNav` has a `Sections` menu button controlling the links on narrow
  widths.
- `tests/e2e-app/specs/20-public-auth.spec.ts` `NAV_SECTIONS` exists with the
  `Services` row; no test asserts a nav count of 8.
- `design.md` has `## Copy freeze` and the "8 section links" sentence (line 41).
- `packages/core` exports only `"."`; `src/format/` has no `phone.ts` or
  `idNumber.ts` yet.
- `services/api/README.md` § 5 "Public verification" exists;
  `services/api/.env.example` exists; `test_aadhaar_vault_db.py` and gateway
  `test_public_graphql.py` exist as style precedents.
- `PrivacyPage.tsx` has `en`/`te` section arrays of `[heading, body]` tuples.
- `client.ts`: `GRAPHQL_PATH = '/api/gateway/pattadar/graphql'`, attaches a
  bearer only when a token exists, throws `SESSION_ENDED_MESSAGE` on 401.

## Unverified / wrong assumptions

- Wrong: the server phone rule as written normalises to `+91` + ASCII digits
  (finding 1).
- Wrong (minor): client `looksLikeAadhaar` is a faithful mirror of
  `_AADHAAR_LIKE` (finding 2).
- Wrong (minor): gateway oversize body always returns 401 (finding 4).
- Unverified: `psycopg_pool.PoolTimeout` subclasses `psycopg.Error` (psycopg
  not installed in the local interpreter); the design already makes this a DB
  test obligation.
- Unverified: the five new MUI icon names exist (typecheck will prove it).
- Unverified: nine links in the narrow `Sections` menu at 360px do not
  overflow (design lists it as an implementation check).
