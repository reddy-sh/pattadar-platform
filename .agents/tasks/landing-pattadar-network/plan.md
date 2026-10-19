# Implementation Plan — Pattadar Network (landing section + interest capture)

Source of truth: `.agents/tasks/landing-pattadar-network/design.md` rev 3 (approved),
round-3 review `design-review.{md,json}`. This plan sequences that design; it does
not redesign it.

- Worktree (ALL paths absolute; relative paths land in the parent workspace):
  `/Users/reddy.sh/reddy.sh/projects/pattadar-platform/.worktrees/landing-pattadar-network` (below: `$WT`)
- Branch `feat/landing-pattadar-network`. Git: `git -C $WT …`. Commit locally only, never push.
- Task folder: `$WT/.agents/tasks/landing-pattadar-network/` (not committed).

## Reddy's locked decisions (record verbatim in the TODO spec and task design § 4.4)

| ID | Decision |
|---|---|
| D1 | Option A — anonymous allowlisted GraphQL mutation `registerNetworkInterest`, exactly design § 4.3 |
| D2 | No per-IP limiting in v1 |
| D3 | No WAF / infra / Terraform change |
| D4 | Consent wording stays a DRAFT behind `CONSENT_VERSION`; spec + final report must flag "needs Reddy's approval before production" |
| D5 | No read surface (no UI/export of the interest list) |
| D6 | 24-month retention (from `updated_at`) documented; purge job NOT built — TODO |
| D7 | `NETWORK_INTEREST_HOURLY_CAP` default 200 |
| D8 | (a) accept unverified contact for v1 with design mitigations; nothing is sent to the contact automatically |

## Round-3 review items (must be handled; verify even if already present)

- **MEDIUM-1 (required fix):** server phone regex must be ASCII-only. Python `\d` is
  Unicode (`'9८४८०१२३४५'` matches). Use `^(?:\+91|91|0)?([6-9][0-9]{9})$` (literal
  `[0-9]`, no `\d`; additionally compile with `re.ASCII`). Client uses the same literal
  `[0-9]`. Stated rule: "ASCII digits only; any other script → `invalid`/`phone`".
  Non-ASCII vectors below MUST be rejected in both `phone.test.ts` and api pytest.
- **NIT-2:** document `looksLikeAadhaar` as an ASCII-only, UX-only mirror; the server
  `aadhaar._AADHAAR_LIKE` (Unicode `\d`, stricter) is authoritative. Note in the
  docstring that JS `[\W_]` ≡ `[^0-9A-Za-z]`, so no pattern change is required.
- **NIT-3:** update stale comments `eight section controls`
  (`$WT/apps/web/src/pages/landing/MarketingNav.tsx` L19) and `The eight section links`
  (`$WT/apps/web/src/styles/site.css` ~L2050) to "nine".
- **NIT-4:** split the "oversize body" error row: **413** when body >
  `MAX_PROXY_BODY_BYTES` (`proxy_pattadar`, before auth); **401** when > 64 KiB public
  parse cap / multi-root / non-allowlisted root. Apply in task design.md § 4.3 errors
  table and wherever the docs describe the anonymous path (gateway README).

## Shared test vectors

Phone (AC 22 + MEDIUM-1) — identical in `packages/core/src/format/phone.test.ts` and
`services/api/tests/test_network_interest.py`:
- valid → `+919848012345`: `9848012345`, `+91 98480 12345`, `098480-12345`,
  `919848012345`, `(+91) 98480-12345`
- invalid → `null` / `invalid`/`phone`: `12345`, `+91 5123456789`, `+9198480123456`,
  `09848012345678`, `98480 1234a`, Devanagari `9८४८०१२३४५`, Devanagari full
  `९८४८०१२३४५`, `+91 ९८४८०१२३४५`, Telugu `౯౮౪౮౦౧౨౩౪౫`, full-width
  `９８４８０１２３４５`, over-length raw (21+ chars, e.g. `+91 98480 12345 000000`)

Aadhaar-like (AC 13) — in `idNumber.test.ts` and api pytest, applied to each of
`name`, `district`, `mandal`, `note`: reject `1234 5678 9012`, `123456789012`,
`1234-5678-9012`; accept `Ravi Kumar`, `Survey 123/4`, an 11-digit run `12345678901`,
a 13-digit run `1234567890123` (lookarounds). Server-only extra (pytest): Telugu-digit
12-run `౧౨౩౪ ౫౬౭౮ ౯౦౧౨` rejected by the server (proves the server is the stricter
authority; the client mirror is not required to catch it).

## Validation order (server, `network.register`, fixed)

1. Honeypot: `website.strip()` non-empty → return `{status:"received", field:""}`; no
   validation, no DB, no ceiling.
2. `network.validate(input)` (pure; coerce `None`→`""`; NFC-normalise + trim every
   string; reject control chars `\x00-\x1f`,`\x7f` except `\n` in `note`), table order,
   first failure wins; length checks before Aadhaar check:

| Field | Rule | Failure |
|---|---|---|
| `interest` | ∈ `{sell,buy,rent,lease,lawyer,surveyor,document_writer,developer,valuer,other_professional}` (`INTERESTS`) | `invalid`/`interest` |
| `name` | required, 2–80 chars; not `_AADHAAR_LIKE` | `invalid`/`name` |
| `phone` | ≤20 raw; strip ` `,`-`,`(`,`)`; match ASCII regex; store `+91`+group1 | `invalid`/`phone` |
| `email` | ≤254, `^[^\s@]+@[^\s@]+\.[^\s@]+$`, lowercased | `invalid`/`email` |
| neither phone nor email | — | `invalid`/`contact` |
| `district`, `mandal` | ≤60 each; not `_AADHAAR_LIKE` | `invalid`/`district`/`mandal` |
| `note` | ≤500; not `_AADHAAR_LIKE` | `invalid`/`note` |
| `consent` | must be `true` | `consent_required`/`consent` |
| `consentVersion` | == `CONSENT_VERSION` | `invalid`/`consentVersion` |

3. Transaction: `pg_advisory_xact_lock(hashtext('network_interest'))` → hourly ceiling
   count (`created_at > now() - interval '1 hour'`, `>= HOURLY_CAP` → `rate_limited`, no
   write, regardless of existing row) → existing-row lookup by `(contact_key, interest)`
   → withdrawn or cooling (`updated_at > now() - make_interval(secs => COOLDOWN_SECONDS)`)
   → `received`, no write; else `UPDATE … SET updated_at=now() WHERE id=%s AND
   withdrawn_at IS NULL` → `received`; no row → `INSERT … ON CONFLICT (contact_key,
   interest) DO UPDATE SET updated_at=now() WHERE network_interest.withdrawn_at IS NULL`
   → `received`. `except psycopg.Error as exc: _log.error("network.interest_save_failed
   error=%s", type(exc).__name__); raise NetworkSaveFailed() from None`.

`contact_key = associates.contact_key(normalised_phone or lowercased_email)`.

---

## Environment notes for the coder

- In the planning session the shell tool returned no output for any command
  (setup step reported the same). If `execute_bash` is silent, write command output to a
  file inside `$WT/.agents/tasks/landing-pattadar-network/` and read it back; if it still
  fails, report the checks as NOT run rather than claiming them.
- Python: `$WT/.local/api-venv` / `.local/gateway-venv` per CI (create with
  `python3 -m venv` + `pip install -r services/<svc>/requirements.txt pytest` if absent).
  DB tests skip without PostgreSQL unless `TEST_PG_DSN` is set; local DSN default is
  `host=localhost port=5432 dbname=postgres user=rhub password=rhub-dev-pwd`. Local DB only.
- e2e-app has no `webServer`; it targets `APP_WEB_URL` (default :5180 = the founder's
  server — do not use or restart it). Start your own: `bun run --filter @pattadar/web dev
  -- --port 5181 --strictPort` (background), run with `APP_WEB_URL=http://localhost:5181`,
  then stop that process. Delete `tests/e2e-app/results.json`, `playwright-report/`,
  `test-results/` afterwards.
- No new dependencies. No migration run, no deploy, no AWS/Terraform.

---

## Slice 1 — landing section, nav, TODO spec, design amendments

- [ ] 1. Add `NETWORK` content, nav entry, and remove the two moved ROADMAP items.
      In `landingContent.ts`: insert `['Network', 'network']` in `NAV_LINKS` between
      `['University','university']` and `['Services','services']`; add `export const
      NETWORK` exactly as design § 3.2 (eyebrow, h2 `A network around your land`, intro,
      chip `Coming soon`, note beginning `No listings or professionals are on Pattadar
      today.`, eight items with icon keys `sell, buy, rent, gavel, straighten, historyEdu,
      developer, more`) with a one-line comment "Founder-requested addition, 03/10/2026";
      delete the `Legal connect` and `Trusted document writers` ROADMAP items (keep
      `AI Watch Dog`, `On-demand property visits`).
      Files: `$WT/apps/web/src/pages/landing/landingContent.ts`
      Done: file compiles; NAV_LINKS has 9 entries; ROADMAP has 2 items.
      Verify: `bun run --filter @pattadar/web typecheck` passes.

- [ ] 2. Render the `#network` section and add the five icons.
      In `LandingPage.tsx`: import `SellOutlinedIcon`, `ShoppingBagOutlinedIcon`,
      `KeyOutlinedIcon`, `AgricultureOutlinedIcon`, `MoreHorizOutlinedIcon` per-icon from
      `@mui/icons-material/<Name>` (same style as existing imports, alphabetical); add
      `sell, buy, rent, developer, more` keys to `ICONS`; import `NETWORK`; render the
      design § 3.3 markup (`<section id="network" className="section network"
      aria-labelledby="network-h">`, `ul.grid.grid--four`, `li.card.card--tba`,
      `.card__meta` with icon + `span.badge`, `p.network__note`, and a
      `{/* Slice 2: <NetworkInterestForm /> */}` placeholder) after the University
      section and before the Wallet band. No literal copy in the TSX.
      Add `.network__note` in `site.css` (token colours/spacing only, e.g.
      `margin-block-start: var(--space-lg); color: var(--color-ink-2);` — no font-family,
      no weight) next to the roadmap rules. Fix NIT-3 comments: MarketingNav.tsx L19
      "eight section controls" → "nine section controls"; site.css ~L2050 "The eight
      section links" → "The nine section links". At 360px confirm the phone nav row
      (horizontal scroll per site.css) does not overflow the viewport.
      Files: `$WT/apps/web/src/pages/landing/LandingPage.tsx`,
      `$WT/apps/web/src/styles/site.css`, `$WT/apps/web/src/pages/landing/MarketingNav.tsx`
      Done: typecheck proves all five icon modules exist; section renders 8 cards.
      Verify: `bun run typecheck` (root) passes; `bun test apps/web/src` passes.

- [ ] 3. New guard `scripts/network-interest-tests.ts` (copy checks now).
      Follow the header/`ROOT`/`read` style of `scripts/provenance-tests.ts`; import
      `NETWORK` from `../apps/web/src/pages/landing/landingContent.ts`. Checks: `NETWORK`
      has exactly 8 items; `NETWORK.chip === 'Coming soon'`; `NETWORK.note` contains
      `No listings or professionals are on Pattadar today.`; the JSON of `NETWORK`
      contains none of `available now`, `verified professionals`, `browse listings`,
      `book now` (case-insensitive); `LandingPage.tsx` contains `id="network"` and
      `{NETWORK.h2}` and does not contain the literal `A network around your land`;
      ROADMAP contains neither `Legal connect` nor `Trusted document writers`. Exit
      non-zero with a message per failure (match the existing scripts' failure style).
      Files: `$WT/scripts/network-interest-tests.ts`
      Verify: `bun run scripts/network-interest-tests.ts` passes; temporarily changing
      chip to `Available now` makes it fail (revert).

- [ ] 4. e2e-app landing assertions.
      In `20-public-auth.spec.ts` add `['Network', 'A network around your land']` to
      `NAV_SECTIONS` (after `Land records`, matching nav order; `Services` row stays
      `Services we're building next`); add a test: `/` → `#network` has exactly 8
      `.badge` elements with text `Coming soon` and the text `No listings or
      professionals are on Pattadar today.`; ROADMAP section has no `Legal connect`.
      Files: `$WT/tests/e2e-app/specs/20-public-auth.spec.ts`
      Verify: with a private dev server on :5181, `cd $WT/tests/e2e-app &&
      APP_WEB_URL=http://localhost:5181 bunx playwright test specs/20-public-auth.spec.ts
      --project=app --project=phone` passes; stop the server; remove reports.

- [ ] 5. Create `docs/specs/TODO-pattadar-network.md` with every heading of design § 5.
      Header: `Status: TODO — nothing onboarded`, date 03/10/2026, owner Reddy, links to
      the task design (summarised — the `.agents` file is not committed, so restate the
      essentials) and `docs/specs/2026-09-13-associates-marketplace.md`. Sections 1–8 of
      design § 5 (Vision; Offerings with "what it would do"/"what it never claims";
      Built now: interest capture — fields, table, consent version, ceilings, D1=A;
      Future "Sell / List this property" from My portfolio via a `RecordCard` menu action
      in `apps/web/src/w360/pages/Properties.tsx` → `/app/records/:id/list`; Open
      decisions incl. the never-publish Aadhaar/deed invariant, listing consent, identity
      rules, retention, access, D8, DPDP, moderation, professional verification, fees/RERA,
      photo storage; Security/privacy invariants; Phasing; Docs to update). Add a
      "Decisions recorded 03/10/2026" table with D1–D8 as above, and TODO items: D6 purge
      job (24 months from `updated_at`, not built), D4 consent text **needs Reddy's
      approval before production**, D2/D3 revisit if the ceiling trips, D5 read surface,
      district/mandal normalisation to reference tables. Dates DD/MM/YYYY.
      Files: `$WT/docs/specs/TODO-pattadar-network.md`
      Verify: every § 5 heading present (guard in item 13 asserts the headings); all
      relative links resolve to existing files.

- [ ] 6. Amend repo `design.md` and the task design.
      Repo `$WT/design.md`: § Macrostructure family "carries 8 section links" → "9";
      § Copy freeze: add `**Revision, 03/10/2026:**` paragraph — by founder request, a
      Pattadar Network section (all Coming soon) was added and `Legal connect` / `Trusted
      document writers` moved from Services into it; `scripts/network-interest-tests.ts`
      guards the claims. Task design `$WT/.agents/tasks/landing-pattadar-network/design.md`:
      replace the BLOCKED banner with "D1 decided: Option A (Reddy, 03/10/2026)"; record
      D1–D8 outcomes in § 4.4; apply MEDIUM-1 to the § 4.3 phone row (ASCII regex +
      sentence) and AC 22 vectors; NIT-2 note under the `looksLikeAadhaar` paragraph;
      NIT-3 rows in § 3.1; NIT-4 413/401 split in the errors table.
      Files: `$WT/design.md`, `$WT/.agents/tasks/landing-pattadar-network/design.md`
      Verify: `bun run scripts/typography-tests.ts` and `bun run scripts/ux-guards.ts` still
      pass (design.md is read by guards).

- [ ] 7. Slice 1 gate.
      Verify (all must pass): `bun run typecheck`; `bun test packages/core apps/web/src
      apps/mobile/tests apps/university/src`; every `scripts/*-tests.ts` (loop as in
      `.github/workflows/ci.yml`, includes typography, shared-components, provenance,
      a11y-web, contrast, network-interest); `bun run scripts/icon-guard.ts`;
      `bun run scripts/ux-guards.ts`; `bun run build`. Commit locally:
      `feat(landing): Pattadar Network coming-soon section and roadmap TODO`.

## Slice 2 — register-interest capture (Option A)

- [ ] 8. `packages/core` helpers + vectors.
      `phone.ts`: `export function normalizeIndianMobile(raw: string): string | null` —
      `raw.length > 20` → null; strip `[ \-()]`; match
      `/^(?:\+91|91|0)?([6-9][0-9]{9})$/` (literal `[0-9]`, comment "ASCII only — mirrors
      network.py; other scripts are invalid"); return `+91${m[1]}`. `idNumber.ts`:
      `export function looksLikeAadhaar(text: string): boolean` with
      `/(?<!\d)(?:\d[\W_]*){11}\d(?!\d)/u` and a doc comment stating ASCII-only, UX-only,
      server authoritative (NIT-2). Re-export both from `src/index.ts` near the other
      `./format/*` exports. Tests use `bun:test` like `inr.test.ts` with the Shared test
      vectors (phone incl. all non-ASCII cases; Aadhaar list).
      Files: `$WT/packages/core/src/format/phone.ts`, `…/phone.test.ts`,
      `…/idNumber.ts`, `…/idNumber.test.ts`, `$WT/packages/core/src/index.ts`
      Verify: `bun test packages/core` passes; `bun run --filter @pattadar/core typecheck`.

- [ ] 9. `services/api/src/network.py` (new, account.py/growth.py shape).
      Contents: module docstring (purpose, credential-less public root, insert-once, no
      PII in logs); `DDL` (design § 4.3 table + `network_interest_contact` unique index +
      `network_interest_created` index, all `IF NOT EXISTS`); `async def
      ensure_schema(conn)`; `CONSENT_VERSION = "2026-10-03"`; `CONSENT_TEXT =` the draft
      consent string (comment: DRAFT, D4, needs Reddy approval) and `CONSENT_TEXT_SHA256`
      = lowercase hex SHA-256 of its UTF-8 bytes (compute once with python `hashlib`;
      the guard re-checks against the web copy); `INTERESTS` frozenset; `COOLDOWN_SECONDS
      = 60`; `HOURLY_CAP` parsed at import from `NETWORK_INTEREST_HOURLY_CAP` (unset/empty
      → 200; non-int or ≤0 → 0 + `_log.error("network.hourly_cap_invalid")`, value not
      echoed); `_PHONE = re.compile(r"^(?:\+91|91|0)?([6-9][0-9]{9})$", re.ASCII)`;
      `validate()` per the table (imports `from .aadhaar import _AADHAAR_LIKE`, never
      copies it; returns `(status, field, cleaned)`); `NetworkSaveFailed`; `async def
      register(info, input)` implementing the fixed order with parameterized SQL via
      `_m().pool` (the `growth._m()` lazy-import pattern), logs only
      `network.interest_rejected reason=<field>`, `network.interest_honeypot`,
      `network.interest_ceiling cap=<n>` (WARNING), `network.interest_save_failed
      error=<class>`. Identity is ignored. Never format input into an exception/log.
      Files: `$WT/services/api/src/network.py`
      Verify: `$WT/.local/api-venv/bin/python -c "import sys; sys.path.insert(0,'services/api'); import src.network"` (from `$WT`) succeeds; item 11 tests.

- [ ] 10. Wire `main.py` and the gateway allowlist.
      `main.py`: in `init_db()` add `await network.ensure_schema(conn)` right after
      `await account.ensure_schema(conn)` (inside the `pg_advisory_lock(918273645)`
      section — no manual migration anywhere); import `network`; add Strawberry
      `@strawberry.input class NetworkInterestInput` (`interest: str`, `name: str`,
      `phone/email/district/mandal/note/website: str = ""`, `consent: bool`,
      `consent_version: str`) and `@strawberry.type class NetworkInterestResult(status:
      str, field: str = "")`; `Mutation.register_network_interest(self, info, input:
      NetworkInterestInput) -> NetworkInterestResult: return await network.register(info,
      input)` (camel-cases to `registerNetworkInterest`); add `"registerNetworkInterest"`
      to `RequireAuthenticatedRoot.public_mutations` and update its docstring ("…plus one
      credential-less root, registerNetworkInterest, bounded by API ceilings").
      Gateway `public_graphql.py`: mutation roots `{"verifyBeneficiary",
      "acknowledgeInactivity", "registerNetworkInterest"}`; update the "A public credential
      can execute one mutation" comment and module docstring; update
      `routes/proxy.py` `is_public_verify` docstring likewise.
      Files: `$WT/services/api/src/main.py`, `$WT/services/gateway/src/public_graphql.py`,
      `$WT/services/gateway/src/routes/proxy.py`
      Verify: `.local/api-venv/bin/python -m pytest services/api/tests -q` and
      `.local/gateway-venv/bin/python -m pytest services/gateway/tests -q` still pass.

- [ ] 11. API tests.
      `test_network_interest.py` (no DB): every validation-table row; phone vectors
      (Shared, incl. all non-ASCII → `invalid`/`phone`, and assert stored value is ASCII
      `+91XXXXXXXXXX`); Aadhaar vectors in each of name/district/mandal/note + Telugu-digit
      server-only case; over-length beats Aadhaar; `None`→`""`; control chars; honeypot
      short-circuit incl. filled honeypot + empty name/no contact/no consent → `received`,
      `field==""`, and a pool stub that fails if touched; `HOURLY_CAP` parsing via
      `importlib.reload` under monkeypatched env (unset→200, `""`→200, `"abc"`/`"0"`/`"-5"`
      →0 with exactly one ERROR `network.hourly_cap_invalid`); caplog hygiene (no name,
      phone, email, district, mandal, note in any record) (AC 18); schema test via
      `main.schema.execute` without `x-user-id` (pattern `test_invitation_security.py`):
      `registerNetworkInterest` reaches the resolver (honeypot input → `received`), a
      neighbouring root (e.g. `claimInvitation`) still errors (AC 17); SDL check that
      `phone` is `String! = ""` and explicit `null` is a validation error.
      `test_network_interest_db.py` (throwaway-schema pattern of
      `test_aadhaar_vault_db.py`, bind `main.pool`/monkeypatch the module pool): AC 10
      (one row, `consent_version == CONSENT_VERSION`, `consented_at` non-null), no
      duplicate, AC 11a, 11b (backdate `updated_at` 61 s; only `updated_at` advances with
      differing second payload), 11c (withdrawn row byte-identical), AC 14 (honeypot no
      row), AC 15 (new contact at cap → `rate_limited`), AC 15b (cap monkeypatched to
      current count; active, backdated and withdrawn existing rows → `rate_limited`, row
      unchanged incl. `updated_at`), phone+email then email-only → two rows,
      `'); DROP TABLE` name round-trips, ASCII/Devanagari same number does NOT create a
      second row (Devanagari rejected), AC 18b (connection raises
      `psycopg.errors.StringDataRightTruncation` with the name in its message; caplog
      has neither the name nor psycopg text; response error is the masked `Something went
      wrong at our end (ref …)`), and a `psycopg_pool.PoolTimeout` case proving it is
      caught by `except psycopg.Error`.
      Files: `$WT/services/api/tests/test_network_interest.py`,
      `$WT/services/api/tests/test_network_interest_db.py`
      Verify: `TEST_PG_DSN=… .local/api-venv/bin/python -m pytest
      services/api/tests/test_network_interest.py services/api/tests/test_network_interest_db.py -q`
      passes (DB file must run, not skip, when local PostgreSQL is available; if
      unavailable, report the DB tests as skipped/not verified).

- [ ] 12. Gateway tests (AC 16).
      In `test_public_graphql.py` add to the accepted list: plain `mutation R($input:
      NetworkInterestInput!){ registerNetworkInterest(input:$input){ status field } }`,
      fragment, inline-fragment, and alias forms. Add to the refused list: second root via
      fragment, via inline fragment, via alias (`a: registerNetworkInterest … b:
      registerNetworkInterest …`), batching with `verifyBeneficiary`, batching with a
      private root (`createUser`), and a two-operation document.
      Files: `$WT/services/gateway/tests/test_public_graphql.py`
      Verify: `.local/gateway-venv/bin/python -m pytest services/gateway/tests -q` passes.

- [ ] 13. Web copy, form, styles, privacy notice.
      `landingContent.ts`: `export const NETWORK_INTEREST` — heading, labels, optgroup
      labels `I want to…`/`I am a…`, option labels for all 10 interests, helpers, errors
      (incl. `idNumber: "Please don't enter Aadhaar or other ID numbers here."`), success
      `Thanks. We will contact you when Pattadar Network opens near you.`, ceiling `Too many
      requests right now. Please try again later.`, failure `We couldn't save that. Please
      try again.`, stale-version reload message, `consent` (draft text from design § 4.3,
      must equal `network.CONSENT_TEXT` exactly), `consentLinkText: 'privacy notice'`,
      `consentVersion: '2026-10-03'`, submit label.
      `NetworkInterestForm.tsx`: per design § 4.3 Web form — MUI `TextField select` with
      `SelectProps={{ native: true }}` + two `<optgroup>`s; name/phone (`type="tel"`,
      `inputMode="tel"`, `autoComplete="tel"`, placeholder `98480 12345`)/email/district/
      mandal/note (multiline, `maxLength` 500, `tabular-nums` counter); `Checkbox` +
      `FormControlLabel` with consent split once on `consentLinkText` → `RouterLink` to
      `/privacy`; honeypot `<div className="network-form__hp" aria-hidden="true"><input
      name="website" tabIndex={-1} autoComplete="off"/></div>`; client validation using
      `normalizeIndianMobile` and `looksLikeAadhaar` from `@pattadar/core`; `role="alert"`
      summary + focus to first error; one `button.cta.cta--ghost`, disabled while sending;
      `gql()` from `apps/web/src/api/client.ts` unchanged with the single-root named
      operation; result mapping (`received` → `role="status"` success replacing the form;
      `invalid` → field error, `contact` → phone+email; `consent_required`; `rate_limited`
      → warning `Alert`; any throw incl. `SESSION_ENDED_MESSAGE` → error `Alert`, values
      kept, no navigation). No font-family/weights; tokens only.
      `LandingPage.tsx`: replace the placeholder with `<NetworkInterestForm />`.
      `site.css`: `.network-form` (one column < 720px, two columns above, tokens only),
      `.network-form__hp { position:absolute; left:-10000px; width:1px; height:1px;
      overflow:hidden; }`.
      `PrivacyPage.tsx`: add a Network section to both `en` and `te` arrays (what is
      collected, purpose: contacting about Pattadar Network only, not linked to an
      account, retention 24 months from last update or earlier on request, withdrawal /
      deletion via grievance@pattadar.com) — mark in a code comment as DRAFT (D4).
      Extend `scripts/network-interest-tests.ts` (AC 19): `NETWORK_INTEREST.consentVersion`
      equals `CONSENT_VERSION` parsed from `services/api/src/network.py`; SHA-256
      (`new Bun.CryptoHasher('sha256').update(consent).digest('hex')`) equals
      `CONSENT_TEXT_SHA256`; `consent` contains `consentLinkText` exactly once; both
      `public_graphql.py` and `main.py` `public_mutations` name `registerNetworkInterest`;
      `docs/specs/TODO-pattadar-network.md` contains every § 5 heading.
      Files: `$WT/apps/web/src/pages/landing/landingContent.ts`,
      `$WT/apps/web/src/pages/landing/NetworkInterestForm.tsx`,
      `$WT/apps/web/src/pages/landing/LandingPage.tsx`, `$WT/apps/web/src/styles/site.css`,
      `$WT/apps/web/src/pages/legal/PrivacyPage.tsx`, `$WT/scripts/network-interest-tests.ts`
      Verify: `bun run typecheck`; every `scripts/*-tests.ts` + `icon-guard.ts` +
      `ux-guards.ts` pass; `bun run build`.

- [ ] 14. e2e-app form tests (AC 10, 12–15, 20, 21 at the UI layer).
      In `20-public-auth.spec.ts`, using `page.route(/\/graphql$/, …)` filtered on
      `RegisterNetworkInterest` (pattern at ~L1507): stub `received` → success status text;
      `invalid`/`phone` and `invalid`/`contact` → field errors; client-side Aadhaar in name
      → `Please don't enter Aadhaar or other ID numbers here.` and no request sent;
      unchecked consent → consent error, no request; `rate_limited` → ceiling text;
      HTTP 401 → `We couldn't save that. Please try again.`, values kept, URL still `/`,
      no session-ended sentence; keyboard-only completion (Tab order, Space on checkbox,
      Enter submit); the honeypot is not focusable; `/privacy` shows the Network section in
      English and after toggling to Telugu; axe check following the existing a11y pattern.
      Files: `$WT/tests/e2e-app/specs/20-public-auth.spec.ts`
      Verify: private dev server on :5181; `APP_WEB_URL=http://localhost:5181 bunx
      playwright test specs/20-public-auth.spec.ts --project=app --project=phone` passes;
      stop server; delete reports.

- [ ] 15. Docs and env.
      `services/api/.env.example`: commented `# NETWORK_INTEREST_HOURLY_CAP=200` with a
      one-line explanation (read once at import; invalid fails closed). `services/api/
      README.md` § 5 → "Public operations": list `registerNetworkInterest`, insert-once,
      ceiling, the env var. `services/gateway/README.md` security notes: anonymous
      GraphQL roots incl. the credential-less one; 413 (> `MAX_PROXY_BODY_BYTES`) vs 401
      (> 64 KiB / multi-root / non-allowlisted) (NIT-4). `docs/architecture.md`
      trust-boundary + product domain; `docs/architecture/service-layout.md` (`public_graphql.py`
      line; `network.py` in API modules); `docs/compliance/gdpr-dpdp.md` ROPA/purpose/
      retention/rights rows (D6 24 months, purge TODO; D8 residual risk; D4 draft);
      `docs/compliance/engineering-checklist.md` trust-boundary item. Mark everything as
      implemented-in-code, not deployed.
      Files: as listed under `$WT/`
      Verify: all edited relative links resolve; `python3 scripts/validate-agent-governance.py`
      passes; `bun run scripts/network-interest-tests.ts` passes.

- [ ] 16. Slice 2 gate + functional acceptance (local only) + commit.
      Run the full set: `bun run typecheck`; `bun test packages/core apps/web/src
      apps/mobile/tests apps/university/src`; all `scripts/*-tests.ts`, `icon-guard.ts`,
      `ux-guards.ts`; `bun run build`; api + gateway pytest (full suites); e2e-app spec 20.
      Functional acceptance against a local API + local PostgreSQL only (if available):
      create → repeat (no duplicate) → validation failure → ceiling (with cap env set low
      for that local run), recording results in the task folder; if no local stack,
      state it was not run. Security self-check: no PII in logs, parameterized SQL only,
      no new secrets, gateway-only API invariant intact. Commit locally:
      `feat(network): register-interest capture behind anonymous allowlisted mutation`.

## Acceptance criteria (from design § 1.4, all must hold)

Slice 1: AC 1–9 (heading + `Network` nav + `#network`; exactly 8 `Coming soon` cards and
the "No listings…" sentence; copy only in `landingContent.ts`; ROADMAP keeps AI Watch Dog
+ On-demand visits only; all guards + typecheck; new guard passes; NAV_SECTIONS row; TODO
spec headings; design.md amendments).
Slice 2: AC 10, 11a, 11b, 11c, 12, 13, 14, 15, 15b, 16, 17, 18, 18b, 19, 20, 21, 22 —
plus MEDIUM-1: every non-ASCII phone vector rejected in core and api, stored phone always
ASCII `+91XXXXXXXXXX`.

## Final-report obligations (for the finalize step)

- Flag: consent text, `CONSENT_VERSION` and privacy wording are DRAFTS (D4) — Reddy must
  approve before production.
- TODOs: D6 purge job not built; D5 no read surface; D2/D3 not done by decision.
- No migration was run manually; DDL runs on API boot. Nothing deployed; no CI claimed.
- Governance dimensions: docs (items 5, 6, 15), architecture (new anonymous root + table),
  security/privacy (security-review on the diff; secret-scan before commit), testing (as
  run, with any skipped DB/e2e stated), cleanup (dev server stopped, reports removed).
