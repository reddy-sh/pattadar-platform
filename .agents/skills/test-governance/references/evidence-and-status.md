# Evidence and Status Vocabulary

Shared reporting contract for anyone producing test evidence in this
repository — agent or human tester. `harness-map.md` decides which instrument
runs; this file decides what may be claimed about the result.

Adapted from the tester-role draft reviewed on 26/09/2026. General lifecycle
framing follows ISTQB Foundation Level concepts; no certification or compliance
conformance is claimed by using this vocabulary.

## Execution status

| Status | Means |
|---|---|
| `PASS` | The check ran against the identified build and its assertions held. |
| `FAIL` | The check ran and an assertion or expected behavior did not hold. |
| `BLOCKED` | The check could not run: missing tool, venv, database, service, identity, or authorization. |
| `NOT_RUN` | The check exists but was not selected or attempted. Newly authored tests are `NOT_RUN` until executed. |
| `SKIPPED` | The runner deliberately skipped it, with the reason the runner gave. |

`BLOCKED` is not `PASS` and `NOT_RUN` is not coverage. Record intermittent
results separately from `PASS`/`FAIL` — an intermittent check that passed on a
retry is an open finding, not a green result.

## Count reconciliation

An exit code is not evidence on its own. Report collected versus executed
counts; a run that collected or executed nothing relevant is `BLOCKED`, whatever
its exit code. pytest exits 5 when it collects nothing and 4 on a bad path;
Playwright fails with `No tests found` except on a sharded run or with
`--pass-with-no-tests` or `--only-changed`; a pytest fixture that skips and an
env-gated Swift test that returns early both exit 0.

Record the exact command, the build or revision under test, UTC timestamp,
runner/tool versions, exit code, and where the evidence lives. Keep every
attempt including retries. Distinguish an expected application denial (a 403 the
product is supposed to return) from an environment authentication failure (the
harness never reached the product).

Keep original logs only under the gitignored `.local/test-evidence/<date>/`,
never in a tracked path, and report them as intentionally retained (change
governance cleanup); never overwrite an original with its redacted copy. Never
place secrets, Aadhaar/deed content, private owner inventories, tokens, account
IDs or unnecessary resource identifiers in a report or tracked file.

## Test basis independence

Expected outcomes come from approved requirements, contracts, business rules, or
verified reference fixtures. Implementation reveals risk; it does not define
correctness. Report contradictions between a requirement and the code rather
than silently adopting the code's behavior. Do not invent a numeric threshold
that nobody agreed to.

Two repository-specific traps:

- **Inverted tests.** Both browser suites carry executable `test.fail()`
  markers; take their counts from the commands in
  `docs/qa/test-fail-register.md` (comment lines excluded), never from a
  hard-coded figure. Rule 5 of `tests/e2e-app/AUTHORING.md` is that a found
  defect becomes a `test.fail()` naming its cause, never a softened assertion or
  a deleted scenario. A green run counts these as expected, so an operation
  covered only by a marker is `FAIL` (a known defect), never `PASS`. Repairing
  the defect surfaces the case red (`Expected to fail, but passed.`) until the
  marker is removed as part of the fix; a marker that times out is also red
  (`timedOut`) with the defect still there. See `harness-map.md`.
- **The seal.** `tests/e2e-app` answers an unrouted `/api` REST call with a 501
  and an unanswered `web { <field> }` with a 200 carrying `errors[]`; both fail
  the test at teardown, naming the call. A root-level document with no
  `root.<field>` answer gets a 400 and is not counted as an escape. Answer calls
  in the test with `world.set` / `world.route`; never loosen the seal. Results
  under `tests/e2e-app/noconsole.config.ts` (console and escape guards off) are
  never evidence.

## Classifying a finding

Classify every failure as exactly one of: product defect, test defect,
environment or tooling issue, intermittent result, or unresolved finding.
State certainty and what evidence is missing. A suspicion formed by reading
code is not a reproduced runtime failure and must not be reported as one.

## Never buy a pass

Do not weaken an assertion, approve a snapshot, add a sleep, quarantine without
owner/evidence/expiry, loosen the `e2e-app` seal, or edit a gate in order to make
a check go green. If a gate is itself wrong — stale, obsolete, or contradicting
the current architecture — propose the correction separately, with the
requirement or commit that made it stale, and let the human owner decide. That
proposal is a finding, not a fix to apply in passing.

Draft external tickets and comments by default. Create or update them only when
explicitly authorized for that destination, and avoid duplicate submissions.
