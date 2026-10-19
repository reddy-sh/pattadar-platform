# Verification — Pattadar Network (first implementation pass)

Date: 03/10/2026. Worktree `.worktrees/landing-pattadar-network`, branch
`feat/landing-pattadar-network`, base `0ace64b`. Everything below was run locally
in the worktree; no CI, deploy, AWS, Terraform or non-local database was touched.

Environment note: the agent shell returned no stdout, so every command ran as
`cmd > /tmp/kiro_<name>.txt 2>&1` and the file was read back. The worktree had no
`node_modules`; `bun install --frozen-lockfile` (Bun 1.3.14, 1530 packages, from
the lockfile, no new dependency) was run once. Python venvs:
`<repo>/.local/api-venv`, `<repo>/.local/gateway-venv`.

## Results

| Check | Command | Result |
|---|---|---|
| Typecheck (all workspaces) | `bun run typecheck` | PASS: tokens, core, university, web, mobile all exit 0 |
| Build (all workspaces) | `bun run build` | PASS: tokens, core, mobile, university, web exit 0 (dist removed after) |
| Bun unit tests | `bun test packages/core apps/web/src apps/mobile/tests apps/university/src` | PASS: 339 pass, 0 fail |
| packages/core alone (final) | `bun test packages/core` | PASS: 215 pass, 0 fail |
| Phone + Aadhaar vectors (core) | `bun test packages/core/src/format/phone.test.ts packages/core/src/format/idNumber.test.ts` | PASS: 27/27 |
| API pytest (full) | `cd services/api && .local/api-venv/bin/python -m pytest tests -q` | PASS: 716 passed (DB tests ran, not skipped, against local PostgreSQL throwaway schemas) |
| API network tests | `pytest tests/test_network_interest.py tests/test_network_interest_db.py` | PASS: 94 passed |
| Gateway pytest (full) | `cd services/gateway && .local/gateway-venv/bin/python -m pytest tests -q` | PASS: 195 passed (incl. 13 new AC 16 rows) |
| Every `scripts/*-tests.ts` (19) | loop as in `.github/workflows/ci.yml` | 18 PASS; `typography-tests.ts` FAIL (1) — **pre-existing**, see below |
| New guard | `bun run scripts/network-interest-tests.ts` | PASS (A copy claims, B copy location/ROADMAP, C consent SHA-256 + version parity, D both allowlists, E TODO-spec headings) |
| Icon guard | `bun run scripts/icon-guard.ts` | PASS |
| UX guards | `bun run scripts/ux-guards.ts` | PASS |
| shared-components | `bun run scripts/shared-components-tests.ts` | PASS (existing ratchet notes only, unchanged files) |
| Agent governance | `python3 scripts/validate-agent-governance.py` | PASS |
| Secret check | grep of `git diff` + untracked files for key/secret/password assignments | no findings |

Pre-existing typography failure: `apps/university/src/styles.css:1538
font-weight: 800`. That file is untouched by this branch (last changed in
`641ddb5`); no file this branch adds or edits is flagged.

## Phone and Aadhaar vectors (identical in core and api pytest)

- Valid → `+919848012345`: `9848012345`, `+91 98480 12345`, `098480-12345`,
  `919848012345`, `(+91) 98480-12345` — PASS both sides; stored value asserted
  ASCII and `contact_key == 9848012345`.
- Invalid: `12345`, `+91 5123456789`, `+9198480123456`, `09848012345678`,
  `98480 1234a`, Devanagari `9८४८०१२३४५`, `९८४८०१२३४५`, `+91 ९८४८०१२३४५`, Telugu
  `౯౮౪౮౦౧౨౩౪౫`, full-width `９８４８０１２３４５`, over-length `+91 98480 12345 000000`
  — PASS both sides (round-3 MEDIUM 1: server regex `[6-9][0-9]{9}` with
  `re.ASCII`). DB test also proves the Devanagari/full-width form of a stored
  number is refused, not stored as a second row.
- Aadhaar-like (AC 13): `1234 5678 9012`, `123456789012`, `1234-5678-9012`
  rejected in each of name/district/mandal/note; `Ravi Kumar`, `Survey 123/4`,
  11- and 13-digit runs accepted. Server-only: Telugu-digit run rejected.

## Sealed e2e-app (spec 20)

Private Vite on :5191 (founder's :5180 untouched),
`APP_WEB_URL=http://localhost:5191 playwright test specs/20-public-auth.spec.ts --project=app --project=phone`.

- `-g "Pattadar Network|primary nav"`: **14 passed** — NAV_SECTIONS incl.
  `Network` and `Services`; eight `Coming soon` badges + note; ROADMAP keeps only
  AI Watch Dog / On-demand visits; valid submit (payload incl. `consentVersion`,
  empty honeypot); missing consent (no request, focus to checkbox); invalid and
  full-width phone (no request); neither contact; Aadhaar-like name; server
  `invalid/phone`; `rate_limited`; HTTP 401 → generic failure, values kept, URL
  `/`, no session-ended sentence (AC 21); keyboard-only completion with the
  honeypot out of Tab order; `/privacy` Network section en + te; `@phone` reflow
  (app + phone projects).
- Whole spec: 7 non-Network tests fail on this dev server (sign-in buttons go to
  `/app`, auth-page footer, `/auth/callback`, privacy settings bounce). The same
  7 fail identically against an **unmodified base `0ace64b`** server started the
  same way (:5193), so they are environmental: a dev server without the
  founder's auth configuration. Not caused by this change; not re-run against
  :5180 by rule.

## Functional acceptance — LOCAL stack only

Disposable stack: API :18090 (`NETWORK_INTEREST_HOURLY_CAP=4`) on throwaway DB
`kiro_network_fa_api`, gateway :18092 on throwaway `kiro_network_fa_hub`, web
:5191 with `GRAPHQL_VIA_GATEWAY=1` (browser → Vite → real gateway anonymous
path → API → local PostgreSQL). Both DBs were dropped afterwards. Result: **27/27
checks PASS** (second run on a truncated table; first run differed only by a
page-load race in the script's privacy check).

| Operation | Expected | Observed |
|---|---|---|
| Create — valid UI submit | thanks `role=status`; one row, `consent_version=2026-10-03`, `consented_at` set | PASS (`sell|+919000000101|9000000101|2026-10-03|true`) |
| Missing consent (UI) | consent error, no request, no row | PASS |
| Missing consent (API via gateway) | `consent_required`, no row | PASS |
| Invalid phone (UI) | field error, no request | PASS |
| Invalid phone (API): `+91 5123456789`, `12345`, Devanagari, full-width, Telugu | `invalid/phone`, no row | PASS ×5 |
| Aadhaar-like name (API) | `invalid/name`, no row | PASS |
| Honeypot (API, with empty name / no consent) | `received`, no row | PASS |
| Honeypot (UI, forced fill) | thanks shown, no row | PASS |
| Duplicate / insert-once (UI, different name) | `received`, one row, name and `updated_at` unchanged | PASS |
| Duplicate in another phone format (API) | `received`, no overwrite | PASS |
| Ceiling (cap 4): new contact via UI | "Too many requests…" alert, no row | PASS |
| Ceiling: existing contact (API) | `rate_limited` (no oracle) | PASS |
| Gateway: two aliased roots / private root beside it | 401 | PASS ×2 |
| Read: `/privacy` Network section en + te | visible | PASS (no interest-list read surface exists by decision D5) |
| Mobile 390px / nav 360px | no horizontal overflow | PASS (0 / 0) |
| Log hygiene | no name/phone/email/note/honeypot value in API or gateway log | PASS: 0 matches; network lines carry only `reason=<field>`, `interest=<key>`, `cap=4` |

DB/pool failure path (AC 18b) is covered by pytest (`StringDataRightTruncation`
and `PoolTimeout` → masked `Something went wrong at our end (ref …)`, no name or
psycopg text in any log line); it was not provoked on the live local stack.

## Deliverable screenshots (this folder)

- `network-desktop.png` — #network at 1512×950 (captured in the second run,
  after the consent-link underline fix).
- `network-mobile.png` — #network at 390×844.
- `network-success-desktop.png` — success state.
- `network-ceiling-desktop.png` — ceiling alert.

## Not verified

- No CI run, deploy, or live/production evidence. Migration DDL was run only by
  API boot against throwaway local databases.
- Full spec-20 pass on the founder's auth-configured :5180 server (not used by rule).
- Real Cognito bearer → 401 path end to end (stubbed in e2e-app only).
- Native iOS / Expo: out of scope (IGNORE per design § 7).

## Cleanup

Stopped every agent-started listener (:5191, :5193, :18090, :18092 — all were
free before start and are free now); dropped both throwaway DBs; removed the
temporary base worktree `/tmp/kiro-base`; deleted the FA script,
`tests/e2e-app/{test-results,playwright-report,results.json}`, and build
`dist/` output. Retained: the worktree `node_modules` from `bun install`.

## Follow-up 2 (03/10/2026)

Scope: (1) security LOW / AC 18 — value-free GraphQL error logs for
`registerNetworkInterest`; (2) offerings tidy — one "Lawyers and legal connect"
card, a "Property valuers" card, eight cards total; correctness nits —
server-only ID-number refusal shows `COPY.errors.idNumber`, `CONSENT_TEXT`
SHA-256 asserted in pytest. All local; nothing pushed, deployed or migrated.

What changed:
- `services/api/src/main.py`: `PattadarSchema(strawberry.Schema)` overrides
  `process_errors`; a request whose document (error source or query text) names
  `registerNetworkInterest` logs `graphql.public_error kind=<class> path=<path>`
  with no message, traceback or values. `MaskUnexpectedErrors.anonymise_error`
  logs the class only for the same requests (it was also echoing
  `GraphQLError('String cannot represent a non string value: <phone>')`).
  Every other root keeps Strawberry's default line and the repr. Client-facing
  errors are unchanged.
- Cards (`landingContent.ts`): "Lawyers and advocates" → "Lawyers and legal
  connect" (same body); "Valuers, builders and more" → "Property valuers"
  (icon `calculate`; unused `more`/MoreHoriz icon removed). Interest enum
  unchanged (`lawyer`, `valuer` already in both the form and `network.INTERESTS`).
- `NetworkInterestForm.tsx` `serverError`: a server `invalid` on
  name/district/mandal/note whose client checks pass shows the ID-number sentence.
- Guard `network-interest-tests.ts` group F: exact eight titles, one legal card,
  a form choice per professional card, form choices == `network.INTERESTS`.
- Docs: TODO spec offerings table + invariant line, design.md revision note,
  services/api/README.md.

| Check | Command | Result |
|---|---|---|
| Typecheck | `bun run typecheck` | PASS: tokens, core, university, web, mobile exit 0 |
| Build | `bun run build` | PASS (dist removed after) |
| Bun unit tests | `bun test packages/core apps/web/src apps/mobile/tests apps/university/src` | PASS: 339 pass, 0 fail |
| API pytest (full) | `.local/api-venv/bin/python -m pytest tests -q` | PASS: 721 passed (716 + 5 new) |
| API network unit tests | `pytest tests/test_network_interest.py` | PASS: 85 passed (incl. int-phone variable, inline literals with name/email/Aadhaar-like run, syntax error: no submitted value in `caplog.text` at DEBUG; other roots keep default log; CONSENT_TEXT SHA-256) |
| Gateway pytest (full) | `.local/gateway-venv/bin/python -m pytest tests -q` | PASS: 195 passed |
| `scripts/*-tests.ts` (19) + `ux-guards.ts` + `icon-guard.ts` | loop | 20 PASS; `typography-tests.ts` FAIL (1) — **pre-existing**, `apps/university/src/styles.css:1488/1520/1538 font-weight: 800`, file not touched |
| Aadhaar digits guard | `bun run scripts/aadhaar-digits-tests.ts` | PASS |
| Network guard | `bun run scripts/network-interest-tests.ts` | PASS (A–F) |
| Sealed e2e-app spec 20 | `APP_WEB_URL=http://localhost:5191 playwright test specs/20-public-auth.spec.ts --project=app --project=phone -g "Pattadar Network\|primary nav"` | PASS: 15 passed (14 + new server-only ID-number test; card-title assertion added) |

Functional acceptance — LOCAL only: API :18090 (cap 50) on throwaway DB
`kiro_network_fa2_api`, gateway :18092 on `kiro_network_fa2_hub`
(`IDENTITY_LEGACY_BINDINGS={}`, empty installation), Vite :5191 with
`GRAPHQL_VIA_GATEWAY=1`. **10/10 PASS**:
- Cards render the eight titles in order; mobile 390px overflow 0.
- UI create `sell` (phone) → thanks; UI create `valuer` (email) → thanks; API
  create `valuer` → `received`. Rows: `sell`, `valuer` ×2, all
  `consent_version=2026-10-03`, `consented_at` set (sell submitted 3× across
  runs → still one row, insert-once).
- Missing consent: UI → consent error, 0 requests; API → `consent_required`.
- Malformed via gateway → API: int phone variable → GraphQL error; inline
  literals (name with email + Aadhaar-like run, int phone) → GraphQL error;
  unparseable document → gateway 401 (never reaches API).
- Log grep (API and gateway logs) for every submitted name, phone prefix
  `90000002`, both emails, `example.test`, the Aadhaar-like run and
  `got invalid value`: **0 hits each**. API lines seen:
  `network.interest_received interest=<key>`, `network.interest_rejected
  reason=consent`, `graphql.public_error kind=GraphQLError path=-`,
  `graphql.unexpected_error ref=… field=: GraphQLError`.
- Screenshots refreshed: `network-desktop.png` (1512 wide), `network-mobile.png`
  (390 wide), element captures of `#network` with the sticky nav hidden for the
  capture only.

Not verified: CI, deploy, any non-local DB; the value-free match is textual,
so a non-network request that merely mentions the root name (e.g. in a
comment) also gets the value-free line — less logging, never more.

Cleanup: :5191, :18090, :18092 stopped (0 listeners); both throwaway DBs
dropped; scratch drivers, Playwright output, build `dist/` and `/tmp/kiro_*`
removed.
