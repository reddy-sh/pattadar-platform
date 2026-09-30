# Pattadar testing plan

**Status: proposed, 26/09/2026.** Phases 0 and 1 are partly executed — what was
done is marked. Everything else is proposed work, not commitments, and every
reserved decision is listed in the last section rather than assumed.

Companion documents: `docs/qa/tester-onboarding.md` (the role and the run
commands), `docs/qa/test-fail-register.md` (the per-marker defect inventory),
`.kiro/skills/test-governance/references/harness-map.md` (instrument ownership),
`.kiro/skills/verify-change/references/verification-matrix.md` (command detail).
CI is authoritative when any of them drifts.

## The shape of the problem

Pattadar has a large amount of test material and a small amount of gating. The
audit behind this plan found three distinct failure modes, and they need
different phases:

1. **Evidence that exists but gates nothing.** The sealed `tests/e2e-app` suite —
   the largest instrument in the repository — ran in no workflow at all. Three
   unit test files sat outside every CI path. Two of the six README invariants
   had no test anywhere.
2. **Evidence that is wrong about itself.** Counts quoted in documentation did
   not match the tree, an invariant described behaviour the code deliberately
   does not have, and spec header comments miscounted their own bodies.
3. **A large, well-documented and entirely untracked defect backlog.** 127
   `test.fail()` markers, 23 newly pinned format-layer defects, and a sealed
   suite with a large share of its cases failing (Phase 4 has the measured
   baseline).

Phases are ordered so that each one makes the next one's evidence trustworthy.
Adding coverage before the gate is honest would only add noise.

## Phase 0 — unblock the gate

**Nothing else can be trusted until this is done.** One item blocks CI today.
The other blocks it as soon as the current uncommitted work is pushed.

`scripts/validate-agent-governance.py` requires `.claude/skills/sync-ios/SKILL.md`
to exist and cite the canonical Kiro skill. `.claude/` was deleted on 19/09/2026
in `78e7545` during the migration to Kiro, and the check was left behind. It is
the first step of CI's *Typecheck & build* job and of the nightly *checks* job,
so both fail before doing any work.

`scripts/parity-check.ts` on the working tree reports two errors. The
uncommitted changes to `packages/core/src/land/geo.ts` (+107 lines) and
`packages/core/src/land/boundaryFile.ts` (+50) have no matching change in their
`PattadarKit` twins (`Land/Geo.swift`, `Land/PlaceQuery.swift`,
`Land/Boundary.swift`). CI's *Native rules* job runs that check, so it goes red
when this work is pushed. Nothing in the testing work touched these files. The
new test files show up only as informational "adapt" entries.

| Item | Options | Status |
|---|---|---|
| The `.claude` sync-ios adapter check | restore a thin adapter, or retire the obsolete check | **Open — deferred by Reddy** |
| The iOS twins for the `geo.ts` and `boundaryFile.ts` work in progress | port the change with the `sync-ios` skill, or record an accepted parity exception | **Open — lands with that work** |

A second, smaller item was in this phase and is closed: the
`functional-acceptance` skill had a stray character above its frontmatter, so the
skill that enforces CRUD proof was itself unloadable. Fixed and confirmed loading.

## Phase 1 — make the existing evidence honest and gated

**Mostly executed 26/09/2026.** This phase adds almost no new test material. It
makes what already exists tell the truth and actually run.

| Work | Status |
|---|---|
| Correct the `test.fail()` counts in project docs (were 152/15, actually 118/23 plus 9 in `e2e-web360`) | done |
| Correct invariant 5: keys are `{node}/{version}`, not `{owner}/{node}/{version}` — the owner was deliberately removed, and both `storage.py:_key()` and `test_object_key_carries_no_owner_segment` say so | done, in `README.md` and `pattadar-standards.md` |
| Correct the stale `:5173` port in `tests/e2e-app/README.md` — the config defaults to `:5180` to match `start-local.sh` | done |
| Put the three never-run unit files into CI (`apps/web/src/components`, `apps/web/src/data`) | done — the path is now one root per package, so the next file lands covered rather than needing an edit |
| Give `tests/e2e-app` a CI home | done: nightly, one shard of eight, ~13 min on average and ~27–41 on the heaviest shard. Not a merge gate. It was first landed as one shard of four under a 45-minute cap. The full measured run showed the heaviest quarter would reach 38–57 minutes with retries, so the job would have been cancelled before its evidence upload. It now uses eight shards, a 55-minute job cap, a 45-minute Playwright `--global-timeout` so the upload always runs, and `--trace=off` to keep the artifact small |
| Document how to run `tests/e2e-mobile`, or say why it cannot be gated | done — `tests/e2e-mobile/README.md`; a `package.json` there breaks `--frozen-lockfile` for all four CI jobs, which was measured, not assumed |
| Cover invariant 4 (`CRON_SECRET`), previously asserted nowhere | done — `services/api/tests/test_cron_secret.py`, 27 tests |
| Cover invariant 6 (DD/MM/YYYY) and the untested `packages/core/src/format` layer | done — 138 tests across 5 files |
| Aggregate the marker backlog into something reviewable | done — `docs/qa/test-fail-register.md` |
| Prove the new tests hold in CI's environment, not just on this laptop | done. `bun test` defaults to UTC, so the format tests had only ever run in UTC. Five of them hard-coded a day that flips at UTC+14 or UTC−11. They now use a zone-independent oracle and pass in 11 zones from UTC−12 to UTC+14. The cron tests pass with CI's job-level `ALLOW_INSECURE_LOCAL=1` and with a stray `CRON_SECRET` in the shell |
| Make the nightly `e2e-app` job install the engine its `phone` project needs | done. `devices['iPhone 14']` defaults to WebKit, and the job had installed Chromium only, which would have failed every phone case at launch |
| Unblock the database-backed suites on this machine | done. 31 orphaned SysV segments from killed PostgreSQL runs had used up macOS's 32 IDs. They were removed; the one belonging to the running local PostgreSQL was left alone. All 463 api and 29 assistant cases now pass. The diagnosis is in the harness map |
| Refresh `verify-change`'s matrix against CI | done. It still named the old unit path and a three-file assistant subset, and it did not mention the governance orchestrator |

**Exit criteria, remaining:** Phase 0 resolved, so that a CI run means something.

## Phase 2 — the format layer defects

**Why here:** `packages/core/src/format` is shared by web, Expo and the export
paths. It had no tests before 26/09/2026. Writing them surfaced 23 defects. Each
is pinned by a passing characterization test, one that asserts what the code
does today rather than a behaviour nobody agreed. So a fix turns its pinning test
red, and the fixer then updates the assertion to the agreed behaviour. Every one
is tagged in a comment; `grep -n FINDING packages/core/src/format/*.test.ts`
lists all 23. They are cheap to fix and they sit underneath everything else, so
fixing them first stops them reappearing as end-to-end noise.

Grouped by what one sitting could close:

| Group | Findings | Where |
|---|---|---|
| **Timezone: UTC used where the owner's day is meant** | a `Z` timestamp late in the UTC day names the wrong day on an exported filename; audit rows shift a day; `"2026-07"` renders as the last day of June west of Greenwich | `docName.test.ts:93`, `date.test.ts:110,156`, `audit.test.ts:257` |
| **No date validation** | `NaN/NaN/NaN` reaches the screen; nonsense renders in perfect DD/MM/YYYY shape; each DOB field is range-checked alone so `31/02` passes; `dmyToIso` emits `2026-02-31`, which `Date` rolls into 03/03 and stores as typed | `date.test.ts:65,134`, `dob.test.ts:104,188` |
| **Silent data loss** | a date already in DD/MM/YYYY is silently replaced with today, so the document's real date is lost and nothing is logged; a DOB stored as a timestamp is shown raw to the owner; `"1-2-2026"` is regrouped as `12/20/26` | `docName.test.ts:106`, `dob.test.ts:58,152` |
| **Dead and wrong logic** | `return loose(n) === loose(t) ? n : n` — both branches identical, so the row shows the type twice; the 120-character cap is applied after the extension is appended, so the downloaded file has no suffix; a `ROR` type matches on the fragment before the hyphen | `docName.test.ts:200,137,208` |
| **Money formatting** | `-₹0` from `Math.round(-0.4)`; `formatINR(Infinity)` prints `₹∞` because `\|\| 0` does not cover infinities, and `formatINRCompact` reaches `₹Infinity Cr`; `formatINRCompact` writes `₹-1.24 Cr` where `formatINR` writes `-₹1,24,00,000`, and the two sit next to each other on the portfolio screen; past ten crore the compact figure is printed without grouping | `inr.test.ts:54,63,138,129,144` |
| **Relative time and plurals** | negative elapsed minutes fall into the "less than a minute" branch, so clock skew reads as fresh activity; the same for negative day differences; the plural lands on the wrong word in a multi-word noun | `audit.test.ts:278,314,451` |
| **Invariant 6 question** | the audit feed's idiom is `18 Jul`, not DD/MM/YYYY. Deliberate relative-time formatting, but nothing outside a test says the invariant has an exception | `audit.test.ts:250` |

**Exit criteria:** each finding either fixed with its pinning test updated to
assert the correct behaviour, or explicitly accepted with a recorded reason. The
last row is a question for Reddy, not a defect to fix silently — an invariant
with an undocumented exception is a governance item.

## Phase 3 — the `test.fail()` backlog

**Why here:** 127 markers sounds like 127 pieces of work. It is not. Ten
single-cause clusters cover 44 of them, and 14 more are second recordings of a
cause held elsewhere. The register does that arithmetic; this phase spends it.

Order proposed in the register, highest impact first:

1. **Failure drawn as emptiness on the audit trail** — 5 markers, one cause at
   `Orders.tsx:284,300`. A refused read tells an owner their record has never
   been corrected, on the one tab that promises nothing is ever removed.
2. **Unconfirmed boundary wipe** — 2 markers, `RecordBoundary.tsx:913-919`. One
   click writes an empty ring and the server overwrites with no history row, so
   surveyed corners are unrecoverable. The app already asks twice before
   deleting a photo.
3. **Work filed twice after a failed upload** — 2 markers. Blind retry files the
   job again; re-upload inserts a duplicate paper and `add_paper` has no dedupe.
4. **An unrecognised verdict drawn as confirmed** — `Shared.tsx:253`, on a door
   read by buyers, banks and surveyors.
5. Then the remaining clusters: unnamed waiting states (8), dead upload guard (5),
   legacy rail pointing at `/app/` (5), redirect discarding the query (4), tap
   targets below the floor (5), inline grid beating the stylesheet (4).

Two mechanics that must be respected, or this phase produces false signals:

- A marker reports **red when the defect is fixed**. Deleting the marker is part
  of the fix, not a follow-up. Where a pair spans both harnesses, both copies go
  together.
- `09-record-boundary.spec.ts` uses short timeouts on purpose, because a
  `test.fail()` that fails by timing out is reported as a pass. Do not "fix" those
  timeouts.

**Exit criteria:** every S1 cluster closed or explicitly accepted with an owner;
the register's severity column accepted or amended by Reddy; markers deleted as
their causes are fixed so the count falls rather than drifts.

## Phase 4 — establish the sealed suite's real baseline

**Why here:** the suite now runs nightly, but it does not pass.

**Measured 26/09/2026, full run of both sealed projects** against a built
bundle of the working tree, TZ=UTC: **2,551 cases** (2,416 `app`, 135 `phone`)
across 28 of 29 specs, 20–24 minutes on 7 local workers.

| | First run | After the fixture repairs below |
|---|---|---|
| Pass | 1,524 | 1,965 |
| Genuine failures | **883** | **442** |
| Markers holding | 133 | 133 |
| Markers now passing (defect fixed) | 5 | 5 |
| Skipped | 6 | 6 |
| Flaky | 0 | 0 |

**The first run's 883 were mostly the fixtures lagging the product.** Every one
was in the world or the seed, not in a spec, and none was a product defect:

- **626** carried one console 400. The record head reads `notes` through the
  root schema (`useNotes`, since `07944a0`), and the sealed world only routed
  `web { … }` documents. `fixtures/world.ts` now routes a root-level document
  when a `root.<field>` answer exists, and `seed.ts` answers `root.notes`.
- **37** hit the seal on `governancePolicy`, added in `37ae2ca` and never seeded.
- With those fixed, the record screens rendered and exposed the next layer:
  `OFFERS` lacked `shelves` and `visual` (`RecordPapers` crashed on
  `o.shelves.some`), `ORDERS` lacked `recordKind`/`recordClassification`
  (`Orders` crashed on `replaceAll`), and `owners`, `recordHistory` and
  `transfers` were unseeded. All now carry the shapes the API answers.

Zero cases that passed before fail now for a fixture reason. One case,
`13-services:814`, passed only because its screen used to crash. It now renders
two "Order a service" links with the same href, a header button and the primary
one, and the test's strict locator expects one. Whether that is deliberate is a
product question, so the assertion is left as written.

**The five markers now passing** are all in `24-responsive.spec.ts` (`:383`,
`:606` in both projects, `:1476` and `:1493` on the phone), consistent with the
uncommitted `w360.css` and `ui.tsx` work. They go red by design until each
marker is deleted with the change that fixed it.

**Rerun 27/09/2026 (00:37 UTC), after further uncommitted UI work:** 2,549
cases, 1,882 pass, **523 fail**, 131 markers holding, 7 markers now pass, 6
skipped. At least 37 app and spec files had changed since the previous run, so
the rise is not attributable to the fixtures, which were unchanged. A new
signature appeared across both browser suites: strict-mode violations where a
screen now renders two copies of one control ("Add a feature", "Send to owner",
"Order a service", and three file inputs on the boundary import). That looks
like one duplicated-control cause, not dozens of separate defects.

**`tests/e2e-web360`, first run in this effort, same date,** against a
throwaway PostgreSQL cluster: default config 302 cases, 207 pass, **77 fail**,
9 markers holding, 9 skipped. The worst files are `crud-360` (28) and
`screens` (18). The maps config ran 18 cases, 14 pass, **2 fail**. CI runs both
configs, so the backend job would be red today.

**The remaining 442 of the earlier run** were assertion and timeout failures: 103 in `13-services`,
67 in `07-record-people`, 55 in `10-record-photos`, 45 in `06-record-features`,
and a tail across 17 other specs. They are the actual Phase 4 triage backlog.
Each needs a verdict: product defect, stale assertion, or harness issue.

Also in scope, because it is a silent coverage hole rather than a failure:
`specs/20-public-auth.spec.ts` (`buildEnv`, around line 197) finds out which
social sign-in buttons the build should show. It fetches
`/src/auth/AuthProvider.tsx` and regexes a leading `import.meta.env = {…}` out of
it, and **Vite 8.1.5 does not emit that form**. Against a built bundle the path
returns the SPA's HTML anyway. Either way the discovery comes back empty. One
test skips itself, and the rest assert that no social buttons show. That is true
for the nightly build, which sets no providers, but it is a false failure
against any dev server that does set `VITE_SOCIAL_PROVIDERS`.
`fixtures/session.ts` finds the client id with a different pattern, and the
nightly pins `APP_COGNITO_CLIENT_ID` rather than relying on it. The fix is a
harness decision for `test-governance`: match Vite 8's output, or have the test
take the provider list from the environment. This predates the nightly job.

**Exit criteria:** a triaged baseline — every failing case classified as product
defect, fixture staleness, or harness issue, with counts. Only then is a
pull-request shard worth discussing, because only then does a red run mean
"you broke something" rather than "this is Tuesday".

## Phase 5 — the untested surfaces

**Why here:** these need the layers below them to be quiet first, and they are
breadth work rather than risk work.

| Surface | State | Proposed |
|---|---|---|
| `apps/web/src/pages` | **62 files, zero tests** — the largest untested area in the repository | Cover through the sealed suite by route rather than by unit test; these are composition, not logic |
| `apps/web/src/auth` | 4 files, zero tests | Unit tests — this is a trust boundary |
| `apps/mobile/src` | **zero tests**; the only mobile tests cover pure helpers in `apps/mobile/tests` | Unit-test `src/api` and `src/auth` first; Expo Router screens need the Maestro decision from Phase 7 |
| `packages/tokens` | zero tests; feeds both the MUI and React Native Paper themes | A drift test, since `contrast-tests.ts` and `emit-vectors.ts --check` only catch it indirectly |
| `services/assistant` | 4 test files against a service that also owns conversation durability and SSE streaming; no `test_conversation*`/`test_sse*` exists | Durability and stream-interruption contracts, with `assistant-quality` |
| `packages/core/src/land`, `records`, `portfolio` | several modules have no sibling test; some rules are covered indirectly by `scripts/*-tests.ts` guards | Fill the gaps the guards do not reach |
| `apps/university/src` | one test file; `data/`, `content/`, `pdf/`, `seo/` untested | Lowest priority — no owner records flow through it |

## Phase 6 — the categories with no harness at all

Confirmed absent, not merely thin. Each of these is a decision about whether the
risk justifies the instrument, so this phase is a set of proposals.

| Category | Current state | Note |
|---|---|---|
| **Database migration testing** | **effectively none.** No Alembic. Schema is applied by `init_db()` plus in-place `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` lists inside service modules. `scripts/migrate-org-id.sql` has no test. `init-test-db.py` provisions a fresh database rather than testing an upgrade | The highest-risk gap on this list. A forward-migration-on-populated-data test belongs with `safe-data-migration` before the next schema change, not after |
| Load and performance | none — no k6, locust, artillery or equivalent. Only timeout-budget unit assertions | Needs a target environment first, so it is gated on the Phase 7 decision |
| Resilience and fault injection | application-level only: `23-resilience.spec.ts` sweeps mocked in-flight, error and retry states across 24 screens. No process kill, DB failover or storage outage in code | `docs/runbooks/rds-restore-drill.md` is the manual counterpart |
| Visual regression | none. `zz-drawer-shots.spec.ts` captures screenshots as artifacts with no baseline comparison | Cheap to add, easy to make worthless; decide whether anyone will maintain baselines |
| Accessibility depth | `a11y-web-tests.ts` and `contrast-tests.ts` only; no axe-core, Lighthouse or pa11y. 13 accessibility markers are open in the register | Full WCAG validation needs manual assistive-technology testing and expert review regardless of tooling |
| Security scanning | exactly two: gitleaks, and osv-scanner which is `continue-on-error` and therefore advisory | Triaging the existing backlog so osv-scanner can block is the first step, per its own comment |
| Web↔iOS schema drift | `parity-check.ts` and `emit-vectors.ts --check`; no GraphQL schema snapshot or codegen drift gate | With `sync-ios` |

## Phase 7 — release rehearsal and the human tester

**Why last:** a readiness rehearsal is only meaningful once a CI run means
something and the baseline is triaged.

- A full dress rehearsal of `docs/runbooks/tested-release.md` against a real SHA:
  preflight artifact, identity and attachment migration evidence, rollback
  definition, `deploy-release.py --preflight` read-only pass. No execution.
- The `release-readiness` evidence matrix filled in for that SHA, with a GO/NO-GO
  recommendation for Reddy to accept or reject.
- The tester's environment and identities stood up, per the decisions at the end
  of `docs/qa/tester-onboarding.md`, and the 30-day onboarding path started.
- `functional-acceptance` exercised properly on one mutating surface end to end —
  the document and photo upload path — against the disposable `e2e-web360` stack,
  including its failure paths.

## Decisions reserved to Reddy

None of these are made, and none should be made by an agent.

| # | Decision | Why reserved | Blocking |
|---|---|---|---|
| 1 | The `.claude` sync-ios adapter: restore or retire | Editing a gate to make it pass | **Phase 0, everything** |
| 2 | Accept a red nightly from night one, or hold the job until the Phase 4 crash is fixed | Signal-to-noise policy on a shared gate | Phase 4 |
| 3 | ~9–12 Linux runner-hours/month for one `e2e-app` shard of eight a night (modelled, including install and build), or ~55 for the whole suite nightly at today's failure rate. Both fall as the backlog clears, because failures run twice | Budget | Phase 1 (already landed at one shard; reversible in one line) |
| 4 | Whether a pull-request shard becomes a merge gate | It would block merges until the backlog clears | Phase 4 |
| 5 | Accept or amend the proposed severities in the register, and name a defect destination and owner | Severity and priority conventions are process ownership | Phase 3 |
| 6 | Whether the audit feed's `18 Jul` is an accepted exception to invariant 6 | An invariant with an undocumented exception | Phase 2 |
| 7 | Whether `deploy-release.py` should reject a blank `CRON_SECRET` value, not just a missing name | Release-gate behaviour | Phase 2 |
| 8 | Non-production target, test identities, test data, access, defect destination, residual-risk sign-off | Cost, provider and security boundaries | Phase 7 |
| 9 | Whether migration testing lands before the next schema change | Data safety | Phase 6 |

## What this plan does not claim

What was run locally, 26/09/2026: the whole sealed `e2e-app` suite in both
projects, twice, as the before and after of the fixture repairs; the CI unit
line; the guard scripts; and the `services/api` (463 passed), gateway (176),
assistant (29) and `scripts/tests` (9) pytest suites. The database-backed
suites had first errored because the machine had exhausted its SysV shared
memory. Removing 31 orphaned segments cleared that; no code was involved.

Not run: `tests/e2e-web360`, which needs a disposable `TEST_PG_DSN` and was out
of scope; the Swift and simulator jobs; Terraform; and any GitHub Actions run.
The nightly job's costs are modelled from a local run, not measured on a runner.
Nothing here is CI evidence, deployment evidence, or applied-cloud-state
evidence. `e2e-app` declares about 2,240 cases statically. A run executes 2,551
once table-driven specs and `@phone` tests expand.
