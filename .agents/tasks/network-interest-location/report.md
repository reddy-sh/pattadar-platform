# Report: Network "Area of interest" (State, District, Mandal)

Branch `feat/network-interest-location`, commit **`8df4881`** on base `4a95ca4` (main).
Local commit only: nothing pushed, merged, deployed, and no DDL run against any non-local DB.
Gitleaks 8.30.0 found **no leaks**.

## What changed

The Pattadar Network register-interest form now has an "Area of interest" group right after
"I am interested in":

- **State** is required. It lists all 36 states and union territories with Andhra Pradesh and
  Telangana first, and sends ISO 3166-2:IN codes. The list comes from `packages/core`
  `INDIAN_STATES`.
- **District** and **Mandal** are optional. For Andhra Pradesh they are free-text pickers built
  from the AP-IGRS lists, which load lazily the first time State is used. For other states they
  are plain text fields. Changing the district clears the mandal, and changing the state clears
  both.
- **API:** `NetworkInterestInput.state` is required. It is checked against an exact allowlist,
  and a bad value returns `invalid`/`state`. District and mandal keep the existing checks: at
  most 60 characters, no control characters, no Aadhaar-like digit runs. Logs record field names
  only, never values. The dedup key (contact + interest) did not change.
- **Privacy notice:** the en and te drafts now mention the state. The consent text,
  `CONSENT_VERSION` and its SHA did not change.

Files (26):

- **Web:** `apps/web/src/pages/landing/NetworkInterestForm.tsx`, `landingContent.ts`, `NetworkPlacePickers.tsx` (new), `networkPlaceStates.generated.ts` (new), `networkPlaces.generated.ts` (new); `apps/web/src/pages/legal/PrivacyPage.tsx`; `apps/web/src/styles/site.css`
- **Core:** `packages/core/src/index.ts`, `api/networkInterest.ts` (+test, new), `land/indianStates.ts` (+test, new)
- **API/gateway:** `services/api/src/main.py`, `services/api/src/network.py`, `services/api/tests/test_network_interest.py`, `test_network_interest_db.py`, `services/gateway/tests/test_public_graphql.py`
- **Scripts/tests:** `scripts/emit-network-places.ts` (new), `scripts/network-interest-tests.ts`, `tests/e2e-app/specs/20-public-auth.spec.ts`
- **Docs:** `design.md`, `docs/architecture.md`, `docs/compliance/engineering-checklist.md`, `docs/compliance/gdpr-dpdp.md`, `docs/specs/TODO-pattadar-network.md`, `services/api/README.md`

## Reddy-edited files

| File | Touched | Edit |
|---|---|---|
| `apps/web/src/pages/landing/LandingPage.tsx` | No | — |
| `apps/web/src/styles/site.css` | Yes, +13 lines | New `.network-form__area/__legend/__help/__area-grid/__places` rules (fieldset `min-inline-size: 0`, 1-col grid, 2-col places ≥ 45rem). No existing rule changed. |
| `design.md` | Yes, +7 lines | One "Revision, follow-up 3 (03/10/2026)" paragraph in the Network section. |
| `services/api/src/main.py` | Yes, +6/−2 | `NetworkInterestInput`: added `state: str` (required) and updated the docstring. |

## DDL

`services/api/src/network.py`:

- Adds `state TEXT NOT NULL DEFAULT ''` to the `CREATE TABLE`.
- Adds `ALTER TABLE network_interest ADD COLUMN IF NOT EXISTS state TEXT NOT NULL DEFAULT ''` to
  the `DDL` tuple.

`init_db()` runs this through `network.ensure_schema` under its advisory lock when the API
boots. On an existing local table:

- The column is added as a catalogue-only change (PG ≥ 11 does not rewrite the table).
- Existing rows read `state = ''`, which means "saved before the State field existed".
- The statement is idempotent, so later boots do nothing.

This was proven on a throwaway PG 17 instance with a legacy-shaped table and row (FA op 1).
Reddy's dev DB gets the column the next time his API boots. Nothing was run against it.

## Checks (details in the worktree's `verification.md`)

| Check | Result |
|---|---|
| `bun run typecheck`, `bun run build` | PASS |
| `bun test` core/web/mobile/university | PASS, 347/0 |
| API pytest (full, `TEST_PG_DSN` on throwaway PG) | PASS, 760, 0 skipped |
| Gateway pytest | PASS, 196 |
| `scripts/tests` pytest | PASS, 9 |
| All `scripts/*-tests.ts` + `ux-guards.ts` + `icon-guard.ts` | PASS except `typography-tests.ts` TY-5 (**pre-existing**: `font-weight: 800` at `apps/university/src/styles.css:1488/1520/1538`, not in this change) |
| `emit-network-places.ts --check`, `emit-vectors.ts --check`, `parity-check.ts`, `validate-agent-governance.py` | PASS (iOS: IGNORE, no native caller) |
| Sealed e2e spec 20 (Network + nav) on Vite dev, app + phone | PASS, 30 |
| Functional acceptance, 13 ops (web → gateway → API → PG, synthetic data), including refusals and log hygiene | All worked as expected, 0 PII hits in logs |
| Gitleaks: staged diff (`stdin --redact`) and `git --log-opts=main..HEAD --redact` | No leaks. No `.env`/`.pem`/`.tfvars`/`.local` paths staged. |

Commit facts:

- Made with hooks on (the only hook is `post-commit`) and no `--amend`.
- 26 paths were staged by name. `.agents/` stays untracked.
- Nothing is staged in the main checkout.

## Not verified

- **Production bundle at runtime.** `vite preview` hits a **pre-existing** landing crash
  (`JourneyScene` "Class extends value undefined"). It reproduces on HEAD `4a95ca4` and on
  origin/main. Because of it, the lazy chunk was verified statically, and lazy loading was
  verified only on the dev server.
- **Not exercised:** CI, deployment, the live gateway/ALB path, and Reddy's dev/prod databases.
- **Copy:** the quality of the Telugu wording has not been reviewed.
- **e2e typecheck:** `tsc` on `tests/e2e-app` is unusable under TS 7, a pre-existing config
  issue. The spec does run under Playwright.

## Review findings

Verdict: **APPROVED**, with 0 blocking and 11 non-blocking findings (`review.json`,
`correctness-review.md`, `security-review.md`).

- **CR-1:** the rollout note in the TODO spec contradicts itself. Reword it to "ship API and web
  together".
- **CR-2:** Mandal is cleared on every District keystroke, which the e2e pins. Possible fix:
  clear only when the resolved district changes, or keep the current rule as Reddy's choice.
- **CR-3:** focus after an error opens the picker list over the inline error.
- **CR-4:** the production lazy-chunk path is unverified (blocked by the crash above).
- **CR-5:** retry after a failed chunk download has no test.
- **CR-6:** the help line renders at body size. Should be `--text-sm`.
- **CR-7:** the e2e (m) legend probe hits MUI's notched-outline legend. Query
  `.network-form__legend` instead.
- **CR-8:** the state phrase in the privacy notice is not pinned by any test.
- **SR-1:** the notice is not versioned with consent. Bump `CONSENT_VERSION` at D4 sign-off.
- **SR-2:** the area is first-write-wins on unverified contacts. Confirm it at first outreach
  (D9).
- **SR-3:** `.agents/` is not gitignored. Handled by staging files by name.

## Decisions reserved for Reddy

- D4: consent wording and the en/te privacy notice text, plus the `CONSENT_VERSION` bump (SR-1).
- Running the DDL in dev/prod (it applies on API boot).
- Push, PR, merge and deploy.
- Enabling the Network capture in prod.
- Lead routing and a staff read surface (D9), including treating the area as unverified (SR-2).
- D8b: OTP verification of contacts.
- D3: WAF/rate limiting on the public route.
- Optional: the CR-2 clearing rule, and fixing the pre-existing landing crash and the
  `typography-tests` TY-5 failure.

## Process note

The repo's `post-commit` hook started a detached iOS parity sweep for `8df4881`:

- It runs `scripts/ios-parity-sync.sh` and a `claude -p` sweep in a throwaway worktree.
- Its state is in the worktree's `.parity/`, which is gitignored.
- If it produces anything, it commits to a local `parity/ios-8df4881` branch and never pushes.

This is Reddy's installed automation, so I left it running rather than kill it mid-sweep.
parity-check classified iOS as IGNORE. Removing the worktree before the sweep finishes may
interrupt it.
