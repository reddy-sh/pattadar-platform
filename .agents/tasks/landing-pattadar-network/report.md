# Report: Pattadar Network (landing section + register-interest capture)

Branch `feat/landing-pattadar-network`, worktree `.worktrees/landing-pattadar-network`,
base `0ace64b`. One local commit: **`591e67089d239c6a25cf50a5766fff7d652bca09`**.

Nothing was pushed, merged, deployed, or opened as a PR. No Terraform, AWS, CI or
workflow call was made. The `network_interest` DDL ran only through API boot
against throwaway local PostgreSQL databases, which were dropped afterwards.

## What was built

Slice 1: landing (coming soon, no backend)
- `#network` section on the landing page listing eight coming-soon offerings
  (sell, buy, rent, lawyers, surveyors, document writers, landscape developers,
  legal connect). It has a "Network" nav entry, and Legal connect and Trusted
  document writers moved out of ROADMAP.
- TODO spec `docs/specs/TODO-pattadar-network.md` (decisions D1 to D8, including
  "sell from My Portfolio" as a later item) and `design.md` amendments.
- Guard `scripts/network-interest-tests.ts` checks copy claims, ROADMAP placement,
  the consent SHA-256 and version parity, both allowlists, and the TODO-spec headings.

Slice 2 (D1 = Option A): register interest
- Anonymous single-root `registerNetworkInterest` mutation, admitted by both the
  gateway AST allowlist and the API `RequireAuthenticatedRoot`.
- `services/api/src/network.py` runs the honeypot first, then pure validation
  (NFC normalisation, trim, length caps, control characters, Aadhaar-like runs
  refused). It then runs one transaction: advisory lock, global hourly ceiling,
  insert-once or touch. Consent is versioned and stored per row. Logs carry no
  PII, and DB errors are masked.
- Form `NetworkInterestForm.tsx` with client mirrors in `packages/core`
  (`phone.ts`, `idNumber.ts`), plus a Network section on the privacy page (en + te).
- Round-3 MEDIUM 1 fix: the phone rule accepts ASCII digits only on both sides.
  The server uses `[6-9][0-9]{9}` with `re.ASCII`. Devanagari, Telugu and
  full-width digits are rejected, never folded.
- Finalize-step fix: `scripts/aadhaar-digits-tests.ts` was failing (10 hits) on the
  synthetic +91 phone vectors in the three new test files. All three were added to
  the reviewed `PATH_ALLOW` "+91 phone numbers" group with reasons. The guard
  passes now.

Files changed (30, +2039/−16):
`apps/web/src/pages/landing/{LandingPage.tsx, MarketingNav.tsx, NetworkInterestForm.tsx, landingContent.ts}`,
`apps/web/src/pages/legal/PrivacyPage.tsx`, `apps/web/src/styles/site.css`, `design.md`,
`docs/architecture.md`, `docs/architecture/service-layout.md`,
`docs/compliance/{engineering-checklist.md, gdpr-dpdp.md}`, `docs/specs/TODO-pattadar-network.md`,
`packages/core/src/format/{idNumber.ts, idNumber.test.ts, phone.ts, phone.test.ts}`, `packages/core/src/index.ts`,
`scripts/{network-interest-tests.ts, aadhaar-digits-tests.ts}`, `services/api/{.env.example, README.md}`,
`services/api/src/{main.py, network.py}`, `services/api/tests/{test_network_interest.py, test_network_interest_db.py}`,
`services/gateway/{README.md, src/public_graphql.py, src/routes/proxy.py, tests/test_public_graphql.py}`,
`tests/e2e-app/specs/20-public-auth.spec.ts`.

## Checks (from `verification.md`, plus the finalize step)

Recorded in `verification.md`:
- "Typecheck (all workspaces) … PASS: tokens, core, university, web, mobile all exit 0"
- "Build (all workspaces) … PASS"
- "Bun unit tests … PASS: 339 pass, 0 fail"
- "Phone + Aadhaar vectors (core) … PASS: 27/27"
- "API pytest (full) … PASS: 716 passed (DB tests ran, not skipped …)"
- "API network tests … PASS: 94 passed"
- "Gateway pytest (full) … PASS: 195 passed"
- "Every `scripts/*-tests.ts` (19) … 18 PASS; `typography-tests.ts` FAIL (1) — **pre-existing**"
- "New guard … network-interest-tests.ts PASS", "Icon guard PASS", "UX guards PASS",
  "shared-components PASS"
- Sealed e2e-app spec 20 `-g "Pattadar Network|primary nav"`: "**14 passed**". The other
  7 spec-20 tests fail identically on the unmodified base, so they are environmental.
- Functional acceptance on a local stack only: "**27/27 checks PASS**". It covered
  create, missing consent, invalid phone ×5, Aadhaar-like name, honeypot, duplicate
  insert-once, ceiling, gateway multi-root 401, privacy read, mobile reflow, and log hygiene.
- Screenshots in this folder: `network-desktop.png`, `network-mobile.png`,
  `network-success-desktop.png`, `network-ceiling-desktop.png`.

Re-run in the finalize step on the committed tree:
- Every `scripts/*-tests.ts` plus `ux-guards.ts` and `icon-guard.ts` exit 0, except
  `typography-tests.ts`.
- `typography-tests.ts` still FAILS. It is pre-existing: `font-weight: 800` at
  `apps/university/src/styles.css:1488/1520/1538`, a file this branch does not touch.
  It is not green and is not claimed as passing.
- `aadhaar-digits-tests.ts`: FAIL at first, caused by this branch. PASS after the
  allowlist fix. This guard was missing from the green set in `verification.md`.
- Core phone + ID vectors 27/27. API network pytest 94 passed. Gateway `test_public_graphql.py` 39 passed.
- Secret scan with gitleaks 8.30.0: `gitleaks git --redact` over `main..HEAD` and
  `gitleaks dir --redact .agents` found no leaks. There were no staged `.env*`, key or
  tfvars files; `.env.example` holds only a commented `NETWORK_INTEREST_HOURLY_CAP`.
- The commit ran with hooks enabled (`.githooks/post-commit`). `--no-verify` was not used.

Typecheck, build and the full API/gateway pytest were not re-run after the
finalize-step change. That change only edits an allowlist array in a guard script.

## Not verified

- CI, deploy, and any live, dev or prod evidence.
- The migration on any non-local DB.
- A full spec-20 run on the founder's auth-configured :5180 server.
- A real Cognito bearer → 401 path end to end (stubbed in e2e-app only).
- The DB/pool failure path provoked on the live local stack (it is covered by pytest).
- Native iOS and Expo (out of scope).

## Security review: findings and resolution

The verdict was **APPROVED** (`security-review.md`, `review.json`).
- Round-3 MEDIUM 1, non-ASCII phone digits bypassing dedup: **fixed** on server and
  client, with shared vectors and a cross-script DB test.
- LOW, open and non-blocking: Strawberry's coercion-error log can echo a malformed
  client's own value (an int phone or inline literals) before `network.py` runs. The
  recommended fix is to override `Schema.process_errors` and add a caplog test.
  **Close this before production** (AC 18).
- Info, accepted by Reddy for v1 (D2/D3/D7): the global hourly ceiling (200) is the
  only abuse control. Treat the `network.interest_ceiling` WARNING as an alarm candidate.
- Correctness nits, open: a server-only ID-number rejection shows the generic
  sentence instead of `COPY.errors.idNumber`, and the `CONSENT_TEXT` SHA is not
  asserted in pytest.

## Decisions reserved for Reddy

1. **D4**: approve the consent wording (en + te). `CONSENT_VERSION = "2026-10-03"` is a DRAFT.
2. Run the `network_interest` migration in dev, then prod.
3. Deploy (branch push, PR, merge, release).
4. Enable the feature in production. This also needs the Strawberry log LOW closed first.
5. **D8b**: OTP or contact verification later. Contacts are unverified today.
6. **D3**: a WAF or per-IP rate rule for the anonymous mutation.

## Cleanup

Every agent-started listener (:5191, :5193, :18090, :18092) is free. The throwaway
DBs were dropped. Build `dist/`, Playwright output, scratch scripts and temp files
were removed. Retained as requested: `plan.md`, `verification.md`, the design and
review reference files, the review JSON/MD files, the screenshots, this report, and
the worktree `node_modules` from `bun install --frozen-lockfile`.

## Follow-up 2
Commit **`4a95ca482e957ba9daa4d7bb8c318fe318ae0452`** (`4a95ca4`) on
`feat/landing-pattadar-network`, local only. It sits on top of `591e670`. Review
verdict: **APPROVED** (`review-followup2.json`).
### Changes
- **Fix 1, log redaction (closes the AC 18 security LOW).** On requests that name
  `registerNetworkInterest`, `PattadarSchema.process_errors` logs only
  `graphql.public_error kind=<class> path=<path>`, and `MaskUnexpectedErrors`
  logs the class instead of the repr, which used to echo the coerced phone. Other
  roots keep Strawberry's default logging. Client-facing errors did not change.
  pytest uses caplog to assert that no submitted values reach the logs.
- **Fix 2, offerings tidy plus a Valuers card.** Lawyers and legal connect are now
  one card. "Property valuers" replaces "Valuers, builders and more". There are
  still eight cards, all marked Coming soon, and the interest enum did not change.
  Guard group F in `scripts/network-interest-tests.ts` pins the titles and checks
  that the form choices equal `network.INTERESTS`. `design.md`,
  `docs/specs/TODO-pattadar-network.md` and `services/api/README.md` were updated.
- **The two correctness nits from round 1, both fixed.** A server-only ID-number
  refusal now shows `COPY.errors.idNumber`. pytest now asserts the `CONSENT_TEXT`
  SHA-256.
### Checks performed
- Typecheck and build for all workspaces: PASS. Bun unit tests: 339 pass. API
  pytest: 721 passed. Gateway pytest: 195 passed.
- `scripts/*-tests.ts`, `ux-guards` and `icon-guard`: all PASS except
  `typography-tests.ts`. That failure is **pre-existing**: weight 800 in
  `apps/university/src/styles.css`, a file this branch does not touch.
  `aadhaar-digits`: PASS.
- e2e-app spec 20 with `-g "Pattadar Network|primary nav"`: 15 passed.
- Local-stack functional acceptance: 10/10. This covered sell and valuer creates,
  missing consent, an int phone, inline literals and an unparseable document. No
  submitted values appeared in the API or gateway logs.
- Secret scan: `gitleaks git --redact --log-opts="main..HEAD"` (v8.30.0) scanned 2
  commits and found **no leaks**.
### Open non-blocking review notes (not fixed, no action taken)
- Info: `MaskUnexpectedErrors()` is passed as a shared instance, so the
  `anonymise_error` fallback could read another request's context under
  concurrency. The primary `error.source.body` check covers every value-bearing
  path, so no leak was found. The fix is to pass a class or factory.
- Info: on this root, unexpected non-psycopg faults log only the ref, field and
  class, with no stack. This affects debuggability only.
- Nit: the client does not mirror the server's C0 control-character refusal, so a
  pasted tab shows the ID-number sentence.
- Nit: the `NETWORK` doc comment in `landingContent.ts` still says "wording
  unchanged".
### Not verified
CI, push, deploy, the migration on any non-local DB, and any dev or prod evidence.
### Decisions still reserved for Reddy
1. **D4**: approve the consent wording (en + te). `CONSENT_VERSION = "2026-10-03"` is a DRAFT.
2. Run the `network_interest` migration in dev, then prod.
3. Push the branch, open the PR, merge and deploy.
4. Enable the feature in production. The AC 18 log LOW is now closed.
5. **D8b**: OTP or contact verification. Contacts are unverified today.
6. **D3**: a WAF or per-IP rate rule for the anonymous mutation.
### Cleanup
This step started no servers and created no scratch files. The working tree is clean
apart from the untracked `.agents/` task folder.
