# Pattadar Network landing section and register-interest capture (correctness review)

The branch adds the `#network` Coming-soon section to the landing page, moves the two legal/document-writer roadmap cards into it, and ships Slice 2 under D1 Option A. That means the anonymous `registerNetworkInterest` mutation allowlisted in the gateway and API, a new `network_interest` table owned by `services/api/src/network.py`, the `NetworkInterestForm` on the landing page, shared phone and Aadhaar-run helpers in `packages/core`, the bilingual privacy section, and the TODO roadmap spec. Measured against design revision 3, every § 1.4 acceptance criterion (AC 1–22, plus 11a/b/c, 15b and 18b) maps to code and to a test, and verification.md records passing runs of those tests: core 215/215, api pytest 716 with DB tests executed, gateway 195, the guards, the sealed e2e Network tests 14/14 and local functional acceptance 27/27. I ran no spot-check because the evidence left no specific doubt. The one typography guard failure is in `apps/university/src/styles.css`, a file this branch does not touch.

Watch for: two non-blocking UX/consistency nits. A server-only Aadhaar rejection (non-ASCII digit run) shows the field's generic message instead of the ID-number sentence (confirmed). The Python `CONSENT_TEXT` constant is never checked against `CONSENT_TEXT_SHA256` (confirmed).

**Verdict**: APPROVED

## High-level view

The server's processing order follows the design exactly. The honeypot is checked first and returns `received` with no validation, DB access or ceiling check. Pure `validate()` runs next in table order. Then a single transaction takes the advisory lock, checks the hourly ceiling, looks up the existing row, and either inserts or touches only `updated_at`. The ceiling is evaluated before the per-contact lookup, so new, active, cooling and withdrawn contacts all get `rate_limited` at the cap and nothing is written. Withdrawn and cooling rows are never written. The `ON CONFLICT … WHERE withdrawn_at IS NULL` clause keeps no-revival true defensively. DB errors become the fixed `NetworkSaveFailed` raised `from None`.

The mandatory round-3 MEDIUM fix is in place. The server phone pattern is `^(?:\+91|91|0)?([6-9][0-9]{9})$` compiled with `re.ASCII`. The client pattern is the same `[0-9]` form. Both vector suites list every AC 22 valid and invalid form, including Devanagari, mixed, `+91`-prefixed Devanagari, Telugu, full-width and over-length input. A DB test also proves that a non-ASCII rendering of a stored number is refused rather than stored as a second row. The AC 13 Aadhaar vectors (three separator styles, across all four free-text fields, plus the 11/13-digit negatives) are the same on client and server. The server's stricter Unicode case is tested on the server only, as round-3 NIT 2 intends.

On the web side, all section and form copy lives in `landingContent.ts` (`NETWORK`, `NETWORK_INTEREST`), and `LandingPage.tsx`/`NetworkInterestForm.tsx` contain no literal user-visible strings. The section reuses the existing `section`/`grid--four`/`card card--tba`/`badge` grammar, and the form uses MUI `TextField`/`Checkbox`/`Alert` with a ghost CTA, so there are no page-local component copies. The new CSS names no font family or weight and puts `tabular-nums` on the note counter. No dates are rendered. The guard checks the copy claims, the ROADMAP removal, consent version/hash parity, both allowlists and the TODO headings. Gateway parametrized rows cover AC 16's accepted single-root forms and refused second-root forms.

<details>
<summary>Issues (2)</summary>

1. **Server-only ID-number rejection shows the wrong sentence** (non-blocking): when the server rejects a free-text field for a non-ASCII digit run the client mirror accepted, `serverError()` shows that field's generic message (for example "Keep the note to 500 characters."). Map any server `invalid` on name/district/mandal/note whose client checks pass to `COPY.errors.idNumber`.
2. **Unchecked `CONSENT_TEXT` constant** (non-blocking): `network.py` defines `CONSENT_TEXT` but nothing asserts `sha256(CONSENT_TEXT) == CONSENT_TEXT_SHA256`. It matches today (checked by hand), but it can drift silently. Add a one-line pytest, or drop the constant.

</details>

<details>
<summary>Details</summary>

### Slice 1 acceptance (AC 1–9, FR5)

`NAV_LINKS` gains `['Network', 'network']` between University and Services. `<section id="network" aria-labelledby="network-h">` sits after University and before the wallet band, and its heading is `{NETWORK.h2}` = `A network around your land`. There are eight `NETWORK.items`, each rendered with the `NETWORK.chip` badge (`Coming soon`), and `NETWORK.note` begins with the required sentence. The ROADMAP array keeps only AI Watch Dog and On-demand property visits. The two moved bodies are reused word for word in the lawyer and document-writer cards. Only the five designed icon keys are new; `gavel`, `straighten` and `historyEdu` are reused. e2e NAV_SECTIONS adds the Network row and keeps the Services row. The guard has groups A–E. design.md § Macrostructure now says "9 section links", and § Copy freeze has the dated founder-request revision. The `MarketingNav.tsx` and `site.css` comments now say "nine" (round-3 NIT 3). The TODO spec carries every § 5 heading plus a decisions block.

### Write path and the no-oracle rule

```
register: honeypot → validate() → _save()
_save:    xact advisory lock → count(created_at > now()-1h) >= HOURLY_CAP → rate_limited
          → SELECT withdrawn, cooling (updated_at > now() - 60 * 1s)
             ├─ existing & (withdrawn | cooling) → received, no write
             ├─ existing                         → UPDATE updated_at WHERE withdrawn_at IS NULL
             └─ none → INSERT … ON CONFLICT DO UPDATE updated_at WHERE withdrawn_at IS NULL
```

`HOURLY_CAP` is parsed once at import and fails closed to 0 with a single `network.hourly_cap_invalid` ERROR. Logging produces one identical `network.interest_received interest=<key>` line for insert, touch, cool-down and withdrawn outcomes, so log readers cannot tell them apart either. The DB tests assert AC 11b column by column with different second-submission values. AC 11c checks byte-for-byte equality on a withdrawn row. The AC 15b test covers a just-inserted (cooling) contact, a backdated active contact and a withdrawn contact, plus a new contact. A separate test checks that touches do not consume the ceiling. AC 18b is parametrized over `StringDataRightTruncation` and `PoolTimeout` and asserts on both the `interest_save_failed` and `graphql.unexpected_error` lines.

### Client form and server-result mapping

`check()` mirrors the server table, and a filled honeypot skips the client checks so the bot still gets the server's `received` answer. Server results map as designed: `received` shows the `role="status"` message; `rate_limited` and the generic failure show `Alert`s; `invalid/consentVersion` shows a reload prompt; `contact` marks both phone and email; any `gql()` throw, including a 401, keeps the values. One gap (confirmed): `serverError()` picks `COPY.errors.idNumber` only when the client's ASCII-only `looksLikeAadhaar` also matches. A Telugu-digit run in `note` is rejected by the server with `invalid/note`, and the UI then shows "Keep the note to 500 characters." for a short note. AC 13's ASCII vectors are caught client-side before sending, so the criterion holds, but the server-only path gives misleading guidance.

### Consent parity

The guard hashes `NETWORK_INTEREST.consent` with `Bun.CryptoHasher('sha256')` and compares it with `CONSENT_TEXT_SHA256`. Running `shasum` by hand over the string gives the same digest (`cc1570ef…ceb5`). `network.py` also carries `CONSENT_TEXT`, which the design did not specify and nothing references or verifies (confirmed). A wording edit made only on the Python side would leave a stale constant that looks authoritative.

</details>

<details>
<summary>File map</summary>

- `apps/web/src/pages/landing/LandingPage.tsx`: `#network` section, five icon keys, form mount.
- `apps/web/src/pages/landing/NetworkInterestForm.tsx`: new register-interest form.
- `apps/web/src/pages/landing/landingContent.ts`: `NETWORK`, `NETWORK_INTEREST`, nav entry, ROADMAP removals.
- `apps/web/src/pages/landing/MarketingNav.tsx`, `apps/web/src/styles/site.css`: "nine" comments; `.network__note`, `.network-form*`, honeypot rule.
- `apps/web/src/pages/legal/PrivacyPage.tsx`: en and te Network interest section.
- `packages/core/src/format/{phone,idNumber}.ts` and tests, `index.ts`: client mirrors and vectors.
- `services/api/src/network.py`: DDL, validation, write path. `main.py`: input/result types, resolver, allowlist, `ensure_schema`.
- `services/api/tests/test_network_interest{,_db}.py`: unit and DB coverage.
- `services/gateway/src/public_graphql.py`, `routes/proxy.py`, `tests/test_public_graphql.py`: allowlist and AC 16 rows.
- `scripts/network-interest-tests.ts`: new guard.
- `tests/e2e-app/specs/20-public-auth.spec.ts`: nav row and Network tests.
- `design.md`, `docs/**`, `services/*/README.md`, `services/api/.env.example`: docs per design § 6.

Full diff: `git -C .worktrees/landing-pattadar-network diff main...feat/landing-pattadar-network`.

</details>
