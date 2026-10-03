# Tester role and onboarding

**Status: proposed operating model, 26/09/2026.** No tester is engaged and the
access decisions in the last section are unmade. This document describes the role
we intend to fill and the ground a new tester would stand on; it is not a record
of work performed.

Suggested title: **Quality Engineer — functional, API and automation testing**,
with assistant/AI evaluation in the remit because `services/assistant` ships.

## Why the role exists

Pattadar is well covered by machines and thinly covered by people. CI runs seven
jobs, deterministic guard scripts catch whole classes of UI and icon defect,
three Python suites hold the service contracts, and agents select and run checks
through the `verify-change` skill. What nobody owns today is the *testing
picture*: the manual suites, exploratory work, business acceptance, and an
honest statement of what remains untested before a release.

The tester owns the visibility and integrity of that picture. The whole delivery
team still owns quality. Testing starts at requirements and design review, not
after implementation — general lifecycle framing follows ISTQB Foundation Level
concepts.

## Who owns what

| Work | Primary owner | Tester's contribution |
|---|---|---|
| Business rules and acceptance criteria | Reddy / product | Challenge ambiguity, supply examples and failure scenarios |
| Unit and component tests | Developers | Review risk coverage, add independent scenarios |
| Functional, exploratory, system and regression testing | **Tester** | Plan, execute, automate, document, maintain |
| Test harness and CI contract | Engineering, via `test-governance` | Specify needs, monitor suite reliability |
| Check selection and execution reporting | Agents, via `verify-change` | Audit that the reported evidence matches what ran |
| CRUD proof for a mutating surface | `functional-acceptance` skill | Own the operation inventory and its failure paths |
| Security, performance, resilience, accessibility depth | Specialists | Run agreed baseline checks, coordinate specialist evidence |
| Release authorization and accepted exceptions | **Reddy** | Independent evidence-based recommendation only |

One person may cover several rows in a small team, but record them separately.
Developer testing and specialist assurance do not silently transfer to the
tester.

## Coverage dimensions

| Dimension | Where it lives today | Tester's angle |
|---|---|---|
| Functional CRUD | `functional-acceptance`, e2e suites | Operation inventory per surface, including partial-state behaviour |
| API and GraphQL contracts | `services/api` + `services/gateway` pytest | Independent cases from agreed behaviour, not from the implementation |
| Identity and account isolation | gateway/api pytest; invariants 1–2 | Cross-account and forbidden-role negatives with separate identities |
| Reference and geo data | `scripts/{area,village,fence,geo}-tests.ts` | Reconciliation counts, DD/MM/YYYY rendering, boundary cases |
| Security | `security-review`, gitleaks, osv-scanner | Baseline authz/input negatives; escalate depth, never simulate it |
| Privacy and compliance | `docs/compliance`, `compliance-evidence` | Redacted evidence; no Aadhaar/deed content or owner inventories in any report |
| Accessibility | `scripts/a11y-web-tests.ts`, `contrast-tests.ts` | Keyboard and screen-reader spot checks; full WCAG needs manual AT and expert review |
| Cross-client parity | `scripts/parity-check.ts`, `emit-vectors.ts --check` | The same journey walked on web, iOS and Expo |
| Assistant / AI | `assistant-quality`, `scripts/ai-boundary-guard.py`, invariant 3 | Job and poll behaviour; never retry a non-idempotent AI call |
| Performance and resilience | no suite in the repository | Name it UNKNOWN rather than imply coverage |
| Infrastructure and lifecycle | Terraform fmt/validate, `docs/runbooks/rds-restore-drill.md` | Review the evidence; do not execute lifecycle operations |
| Release readiness | `release-readiness`, `docs/runbooks/tested-release.md` | Assemble evidence, recommend; Reddy decides |

## The local stack

```sh
./scripts/start-local.sh
# api :8080  assistant :8081  gateway :8082  minio :9000  web :5173  university :5181
```

Sign-in is real by default (`LOCAL_AUTH=real`): open `http://localhost:5173/login`
and sign in with Google or email/password through Cognito. The web server also
serves every village map in `.local/vm-build` when that build exists (see
`data/vm/README.md`), otherwise the 8-village fixture.
`LOCAL_AUTH=mock ./scripts/start-local.sh` skips sign-in instead, puts web on
`:5180`, and shows an "Auth mocked — dev only" chip; there the identity that
decides what you see is the `x-user-id` the Vite proxy injects, not a token.
Real sign-in puts web on `:5173`, because the live web client's callback allowlist holds only
`localhost:5173` and `pattadar.com`, and it routes GraphQL through the gateway,
so the token, not a Vite header, decides whose data you see. Pool and client ids,
plus an optional local-only `IDENTITY_LEGACY_BINDINGS` entry that maps your
Cognito principal to your local owner key, are read from the gitignored
`.local/cognito-local.env`. Never copy that binding into a deployed environment.

Cloud storage is MinIO standing in for S3. A document upload that fails because
MinIO is not up is an outage, not a UI defect; check the service before filing.

## Test instruments

Authoritative map: `.kiro/skills/test-governance/references/harness-map.md`.
Command detail: `.kiro/skills/verify-change/references/verification-matrix.md`.
CI is authoritative when either drifts.

**Fast sealed screens — `tests/e2e-app`.** Runs nightly, one shard of eight, in
`.github/workflows/nightly.yml`; it is not a merge gate. Run it locally as well.

```sh
cd tests/e2e-app
bun run test         # desktop + phone projects
bun run test:phone   # the 390px scenarios
bun run report
```

It starts no servers and expects a portal already running. `APP_WEB_URL` defaults
to `http://localhost:5180`, matching `start-local.sh`. Every `/api` call is
answered from fixtures; an unanticipated call is refused with a 501 and fails the
test at teardown, by design. A `console.error` also fails the test that caused
it. Read `tests/e2e-app/AUTHORING.md` before adding a spec — especially rule 1
(never edit `fixtures/`) and rule 5 (a defect you find becomes a `test.fail()`,
never a softened assertion).

There are 118 executable `test.fail()` markers across 23 of the 29 `e2e-app`
spec files — 46 bare `test.fail();`, 68 in declaration form
(`test.fail('title', async ...)`) and 4 conditional inline, all four in
`23-resilience.spec.ts`. `tests/e2e-web360/specs` carries 9 more: `gap-shell` 3,
`gap-services` 2, and one each in `crud-360`, `gap-maps`, `gap-vault` and
`ux-record-holding`. They are expected failures, so repairing the underlying
defect makes the case surface as a run failure until the marker is removed with
the fix. Read the marker's comment before blaming your change.

`09-record-boundary.spec.ts` uses deliberately short assertion timeouts, because
a `test.fail()` that fails by timing out is reported as a pass — a generous
timeout there would hide the defect the marker exists to hold. The per-marker
inventory is `docs/qa/test-fail-register.md`.

**Real wiring and mutations — `tests/e2e-web360`.** In CI. Needs a disposable
database; it refuses to run without one.

```sh
.local/api-venv/bin/python scripts/init-test-db.py
cd tests/e2e-web360
TEST_PG_DSN=<disposable dsn> bun run test
TEST_PG_DSN=<disposable dsn> bunx playwright test --config maps.config.ts
TEST_PG_DSN=<disposable dsn> bun run test:capabilities
```

It runs its own API on :18080 and a built bundle on :5175 under the seeded
`w360-demo` identity, one worker, because the mutation specs share rows. This is
the only instrument that reproduces a genuine upload or delete against the
gateway and MinIO.

**Unit, guards and build.**

```sh
bun run typecheck
bun test packages/core apps/web/src apps/mobile/tests apps/university/src
for script in scripts/*-tests.ts; do bun run "$script"; done
bun run scripts/icon-guard.ts && bun run scripts/ux-guards.ts
bun run build
```

**Services.**

```sh
.local/api-venv/bin/python -m pytest services/api/tests -q
.local/gateway-venv/bin/python -m pytest services/gateway/tests -q
.local/assistant-venv/bin/python -m pytest services/assistant/tests -q
.local/api-venv/bin/python -m pytest scripts/tests -q
```

`bun test` runs in UTC unless `TZ` is set, which matches CI. To test a date
change against the owner's clock, run it again with `TZ=Asia/Kolkata`.

Seven suites provision their own PostgreSQL through `initdb`/`pg_ctl` (the list
is in the harness map). Where those binaries are missing they error rather than
skip. On macOS they also error when the machine runs out of SysV shared-memory
IDs, which it does after about 32 killed test runs. Either way, report it as
BLOCKED, not as a failure. The harness map has the diagnosis and the safe
clean-up.

**Native and mobile.** `swift test` in `apps/ios/PattadarKit` plus
`bun run scripts/emit-vectors.ts --check`. Never run `apps/ios/verify.sh`,
`xcrun simctl`, `xcrun devicectl`, or install on a physical device.
`tests/e2e-mobile/*.yaml` are three Maestro flows run by hand;
`tests/e2e-mobile/README.md` has the commands and explains why no workflow runs
them. Treat them as manual and say so in every report.

## Hard boundaries

These are not preferences. They come from `.kiro/steering/pattadar-safety.md`
and the invariants in `README.md`.

1. No testing against production, and no founder or production data. Synthetic
   seeds only (`scripts/seed-*.py`).
2. `tests/e2e-web360` requires a disposable `TEST_PG_DSN`. Never point a mutating
   suite at a database anyone else uses.
3. Never loosen the `tests/e2e-app` API seal to make a test pass.
4. Never retry a non-idempotent AI or payment operation. An interrupted provider
   call is never automatically repeated (invariant 3).
5. `services/api` trusts `x-user-id` and must only ever be reached through the
   gateway (invariant 1). Do not build a test path that bypasses it.
6. No secrets, Aadhaar or deed content, owner inventories, tokens or account
   identifiers in a report, ticket or screenshot.
7. Never weaken an assertion, approve a snapshot, add a sleep, or edit a gate to
   obtain a pass. A wrong gate is a finding to raise, not a file to fix in
   passing.
8. Any AWS, Terraform, workflow-dispatch, deployment, migration or restore
   operation needs Reddy's explicit approval before it runs.

## Working agreement for a change

Record the chain: requirement or ticket → risk → test case → automated test where
applicable → run and build evidence → defect, fix, retest → release decision.
For exploratory work, capture the charter, the area, the observations and the
open questions.

Report results with the shared vocabulary in
`.kiro/skills/test-governance/references/evidence-and-status.md`: PASS, FAIL,
BLOCKED, NOT_RUN, SKIPPED, reconciled counts, and a classification for every
finding. A clean exit code with nothing collected is BLOCKED, not PASS.

Readiness gates are the project's own, in `release-readiness` and
`docs/runbooks/tested-release.md`. A generic pass-rate percentage is not a gate.
A GO/NO-GO needs the full 40-character SHA, and the verdict is Reddy's.

## First 30 days

Milestones, not delivery commitments.

| Period | Focus | Evidence of progress |
|---|---|---|
| Days 1–5 | Stand up the local stack, run `e2e-app` green, read the harness map | Product and role map, access gaps, suite inventory, critical-journey list |
| Days 6–10 | Own testing for one bounded surface — the document/photo upload path is the natural first one | Reviewed plan, positive/negative/boundary cases, reproducible run record |
| Days 11–20 | Make the important checks repeatable | Reviewed automation, controlled fixtures, CI evidence, regression selection rules |
| Days 21–30 | Run a release-readiness exercise against a real SHA | Readiness report, traceability, maintenance backlog |

No minimum defect count. Finding nothing in a well-tested change is not a
failure. Assess how well they explain uncertainty and substantiate a conclusion.

## Measures

Coverage of agreed critical journeys, executed versus planned scope, escaped
defects by impact, time to reproduce and verify, flakiness, maintenance effort,
reproducibility. Use trends to improve the system, not to rank people by bug
count.

For agent-assisted testing also track unsupported findings, false-pass claims and
missing-evidence rates, and record which skill version produced a result.

## Competencies and a practical exercise

Curiosity, careful observation, structured test design, concise writing, and the
ability to challenge an assumption respectfully. For this remit: API testing,
SQL and data reconciliation, browser debugging, working TypeScript or Python,
Git and CI, and automation maintenance.

Exercise: hand them the document upload surface and ask for a prioritized plan,
one clear test case, one reproducible finding if one exists, an automation
proposal, and a statement of what cannot yet be concluded. Assess the reasoning
and the evidence, not the number of cases.

## Decisions required before day one

Every row below is reserved to Reddy under `.kiro/steering/reddy-authority.md`.
None of them are decided.

| Decision | Options | Why it is reserved |
|---|---|---|
| Non-production target | local only (`start-local.sh` + disposable DB) / `infra/terraform/envs/dev` / a shared staging environment | Cloud cost and provider footprint |
| Test identities | local mock `x-user-id` only / real Cognito users in a dev pool | Provider activation; the production client's callback allowlist is `localhost:5173` and `pattadar.com` only |
| Test data | which `scripts/seed-*.py` is canonical; retention and purge via `scripts/purge-e2e-records.py` | Privacy; founder data must never be a source |
| Access | least-privilege repository, tracker, CI and log access; credentials delivered out of band, never in a prompt or document | Security boundary |
| Defect destination | tracker, severity and priority conventions (severity is impact, priority is agreed urgency — not the same field) | Process ownership |
| Residual-risk acceptance | who signs off an exception, and how it is recorded | Governance |

Until the first two rows are decided, the tester can do everything in this
document against the local stack and nothing against a hosted environment.
