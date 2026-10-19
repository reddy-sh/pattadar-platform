# Security and privacy review — anonymous registerNetworkInterest write

Scope: `git diff main...feat/landing-pattadar-network` (one commit, `1e8694d`; the working tree has no tracked changes, only `.agents/`). Design § 4.3/§ 4.4 and `verification.md` were read. Applied the `security-review` skill and its checklist sections: trust boundary, PII and logging, input handling, secrets, human sign-off.

The change adds one credential-less public GraphQL mutation, `registerNetworkInterest`, that writes a name, phone and/or email, optional place and note, plus versioned consent into a new `network_interest` table with no account link. The gateway admits it anonymously as a single parsed root, and the API's `RequireAuthenticatedRoot` lists it as public. All eight review focus points hold in code and tests. The round-3 MEDIUM (non-ASCII phone digits bypassing dedup) is fixed on both sides. One LOW privacy gap remains, outside the resolver: a hand-crafted request with a wrongly typed or inline-literal value gets that value printed into the API log by Strawberry's default error logger, before `network.py` runs. The web form can't trigger it.

Watch for: Strawberry's validation-error log can echo a malformed client's phone or name (LOW, confirmed, framework path, non-blocking). D4 consent wording is still a draft and needs Reddy's approval before production. Abuse is bounded only by the global hourly ceiling (D2/D3 accepted), so a scripted filler can block real sign-ups for an hour at a time.

**Verdict**: APPROVED

## High-level view

The anonymous path is narrow and enforced at both layers. The gateway's AST policy adds `registerNetworkInterest` to the existing mutation root set and keeps the "exactly one root, one operation, no batch, matching operationName" rule, so the new root can't carry a private field alongside it. The API extension adds the same single name to `public_mutations`, and every other root still requires `x-user-id`. Gateway tests cover the single root, aliased second roots, a private root next to it, and batch arrays. An API test proves a neighbouring root (`claimInvitation`) still fails anonymously. The resolver deletes `info`, so identity can never bind a row to an account.

The write path follows the design order exactly. The honeypot runs first with no validation and no database access. Then comes pure validation. Then one transaction: advisory lock, hourly ceiling count, existing-row lookup, then insert or touch. Because the ceiling check comes before the per-contact lookup, at the cap every valid submission gets `rate_limited`, existing contact or not. Below the cap, insert, touch, cool-down and withdrawn rows all return `received` and write one identical log line. So neither the response nor the log is a registration or withdrawal oracle. All SQL uses `%s` parameters. The only interpolated pieces are constant `interval` literals and `COOLDOWN_SECONDS` passed as a parameter.

PII hygiene inside the module is careful. Log lines carry only the field name, the interest key, or the cap. `psycopg.Error` (including `PoolTimeout`) is logged by class name and re-raised as the fixed `NetworkSaveFailed`, with the cause suppressed. The masker then logs only that object's repr. The DB test injects a psycopg error whose message embeds the submitted name and asserts that neither the name, the psycopg text nor the phone digits appear in `caplog.text` at DEBUG, through the real schema. That covers AC 18b. The remaining gap is Strawberry's own logger for GraphQL coercion errors, which sits outside the resolver (see Issues).

Phone normalisation is now `[0-9]` with `re.ASCII` on the server and `[0-9]` in the TS mirror. Shared vectors reject Devanagari, Telugu and full-width forms, and a DB test proves that a stored number re-typed in another script is refused rather than stored as a second `contact_key`. Consent is enforced server-side (`consent is True` and `consent_version == CONSENT_VERSION`) and stored per row with `consented_at`. A guard script pins the text's SHA-256 and the version across web and API. D4 is marked DRAFT / needs Reddy's approval in `network.py`, `landingContent.ts`, `PrivacyPage.tsx` and the TODO spec. No secrets were added. The only credential-like string is the existing local `rhub-dev-pwd` test DSN default, already used in several base-branch tests.

<details>
<summary>Issues (3)</summary>

1. **Strawberry coercion-error log echoes submitted values** (LOW, confirmed by spot-check of the installed Strawberry) — an anonymous request sending e.g. `phone: 9848012345` as an int, or values inline in the document instead of variables, is rejected by GraphQL coercion/validation. Strawberry's default `process_errors` then logs the message, which includes the invalid value, and in the inline case also the source line containing the name. Fix: override `Schema.process_errors` (or filter the `strawberry.execution` logger) so that validation and coercion errors log a value-free line, at least for `registerNetworkInterest`. Then add a test that sends an int phone and an inline-literal document and asserts the digits and name are absent from `caplog.text`. Non-blocking: the shipped form sends typed variables and the leaked value is the attacker's own input. AC 18 says "any log line", though, so close it before production.
2. **Global ceiling is the only abuse control** (accepted residual, D2/D3/D7) — a script can submit 200 junk new contacts per hour and lock out real registrations, and junk rows have unverified contacts (D8). This was accepted by Reddy for v1. Keep the `network.interest_ceiling` WARNING as an alarm candidate and revisit per-IP or WAF limits if it fires.
3. **D4 consent wording not yet approved** (governance gate) — `CONSENT_VERSION = "2026-10-03"` and the en/te privacy text are drafts. Production release needs Reddy's explicit approval of the wording. Do not ship to prod on this review alone.

</details>

<details><summary>Details</summary>

## Single-root allowlist at both layers

`services/gateway/src/public_graphql.py` keeps its existing structure. It parses with `max_tokens=4096`, rejects batches, requires exactly one operation of type query or mutation, matches `operationName` when one is given, refuses duplicate or unknown fragments, flattens inline and spread fragments, and raises once more than one root field appears. The only behavioural change is the third name in the mutation root set. `proxy.py` admits a claim-less request only through `is_public_verify` (POST, path `graphql`) or the webhook path. A request with a bearer is still validated and has `x-user-id` injected, and the resolver ignores it. On the API side, `RequireAuthenticatedRoot` lists the root by exact name under `Mutation` only, so a `Query.registerNetworkInterest` could not slip through. This mirrors the existing capability-root pattern. No new trust boundary is opened beyond the single root. `services/api` remains reachable only through the gateway, since no infra or route exposure changed.

## Registration and withdrawal oracle

```
honeypot? ──yes──> received (no DB, no ceiling)
   │no
validate ──fail──> invalid/consent_required + field (no DB)
   │ok
tx: lock → count(created_at > now()-1h) >= cap ──> rate_limited
          → existing? withdrawn/cooling ──> received (no write)
                      else touch updated_at ──> received
          → insert ──> received
```

The ceiling counts `created_at`, so touches don't consume it (tested). Withdrawn rows are never revived, both on the lookup path and on the defensive `ON CONFLICT ... WHERE withdrawn_at IS NULL`. Name and contact fields are written only on insert, so an anonymous party can't overwrite someone else's stored details. The honeypot returns `received` for any input, including an empty name and no consent, which avoids teaching bots which fields matter. Validation answers reveal only the first failing field name for the caller's own input, never anything stored.

## Logging and masking evidence

Inside `network.py` every log call is value-free. That covers `interest_rejected reason=<field>`, `interest_honeypot`, `interest_ceiling cap=<n>`, `interest_received interest=<key>`, `interest_save_failed error=<ClassName>` and `hourly_cap_invalid`. `NetworkSaveFailed` is not a `ValueError`, so `MaskUnexpectedErrors` masks it to `Something went wrong at our end (ref …)` and logs only `NetworkSaveFailed('network interest save failed')`. Non-psycopg exceptions are not caught. None of the module's own code raises one carrying input. The local functional run grepped API and gateway logs for every submitted value and found zero matches.

The gap is upstream of the resolver. A one-off spot-check against the installed Strawberry/graphql-core versions in `.local/api-venv` used a throwaway schema with the same `String` input shape. With `{"phone": 9848012345}` as a variable it logs `Variable '$i' got invalid value 9848012345 at 'i.phone'…` plus traceback. With the same values inline it logs the source excerpt `r(input:{name:"Ravi Kumar", phone: 9848012345})`. This framework behaviour predates the branch for every mutation. The new anonymous, PII-bearing root makes it reachable by anyone, though, and no test covers it. Issue 1 has the fix.

## Input handling and ASCII phone fix

Free text is NFC-normalised and trimmed. It is then length-capped (name 2–80, place 60, note 500, email 254, raw phone 20) and refused if it contains control characters (newline allowed only in note) or an Aadhaar-like digit run, using the shared `_AADHAAR_LIKE` pattern. Optional inputs are `String! = ""`, so an explicit null is rejected by the schema. `contact_key` reuses `associates.contact_key`: the last ten digits of the already-ASCII `+91` form, or the lowercased email. The round-3 MEDIUM is closed: `_PHONE = r"^(?:\+91|91|0)?([6-9][0-9]{9})$"` with `re.ASCII`, and the client mirror uses the same `[0-9]` class. Vectors and the cross-script DB test pass per `verification.md`, with 94 network pytest cases and 27/27 core vectors.

## Consent and governance

The row stores `consent_purpose='network_contact'`, `consent_version` (server constant, not client-supplied) and `consented_at`. A stale client version gets `invalid/consentVersion` rather than a silent store. `scripts/network-interest-tests.ts` fails if the web and API consent text or version drift. Reserved decisions are recorded as Reddy's outcomes (D1 A, D2/D3 no per-IP/WAF, D5 no read surface, D6 retention documented with purge job TODO, D7 cap 200, D8 unverified contact accepted). D4 is explicitly flagged as needing approval before production. No production, CI or deployment evidence exists or is claimed.

</details>

<details><summary>File map</summary>

- `services/api/src/network.py` — new module: DDL, validation, honeypot, ceiling/insert-once transaction, masked errors.
- `services/api/src/main.py` — `NetworkInterestInput`/`Result` types, mutation, public-root allowlist entry, `ensure_schema` at boot.
- `services/gateway/src/public_graphql.py`, `routes/proxy.py` — allowlist entry and docstrings.
- `services/api/tests/test_network_interest*.py`, `services/gateway/tests/test_public_graphql.py` — validation, oracle, ceiling, masking, allowlist tests.
- `packages/core/src/format/phone.ts`, `idNumber.ts` (+ tests) — client mirrors.
- `apps/web/src/pages/landing/*`, `legal/PrivacyPage.tsx`, `styles/site.css` — section, form, draft privacy copy.
- `scripts/network-interest-tests.ts` — consent hash/version and allowlist parity guard.
- `services/api/.env.example`, READMEs, `docs/*`, `design.md` — `NETWORK_INTEREST_HOURLY_CAP`, architecture, ROPA, TODO spec.
- Full diff: `git diff main...feat/landing-pattadar-network`.

</details>
