# Evidence and Status Vocabulary

Shared reporting contract for anyone producing test evidence in this
repository — agent or human tester. `harness-map.md` decides which instrument
runs; this file decides what may be claimed about the result.

Adapted from the tester-role draft reviewed on 2026-09-26. General lifecycle
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

A zero exit code is not evidence on its own. Report collected versus executed
counts, and treat a clean exit with no relevant tests collected as `BLOCKED`.
Path typos, an empty `testDir`, and a filter that matched nothing all exit `0`.

Record the exact command, the build or revision under test, UTC timestamp,
runner/tool versions, exit code, and where the evidence lives. Keep every
attempt including retries. Distinguish an expected application denial (a 403 the
product is supposed to return) from an environment authentication failure (the
harness never reached the product).

Preserve original logs before cleanup. Publish redacted copies under the
project's data policy; never overwrite the protected original with the redacted
version, and never place Aadhaar/deed content, owner inventories, tokens, or
account identifiers in a report.

## Test basis independence

Expected outcomes come from approved requirements, contracts, business rules, or
verified reference fixtures. Implementation reveals risk; it does not define
correctness. Report contradictions between a requirement and the code rather
than silently adopting the code's behavior. Do not invent a numeric threshold
that nobody agreed to.

Two repository-specific traps:

- **Inverted tests.** `tests/e2e-app/specs` carries 118 executable `test.fail()`
  markers across 23 of 29 spec files, and `tests/e2e-web360/specs` 9 more — 127
  in total. An `e2e-app` run reports 138 expected-failure cases, measured
  26/09/2026: four markers sit inside a table loop, and `@phone` markers run in
  both projects. Rule 5 of `tests/e2e-app/AUTHORING.md` is that a found defect
  becomes a `test.fail()` naming its cause, never a softened assertion or a
  deleted scenario. Playwright treats such a test as expected-to-fail, so
  repairing the underlying defect surfaces the case as a run failure until the
  marker is removed as part of the fix. Read the marker's comment before
  attributing a red case to your change. Count them by excluding comment lines;
  a raw string count returns 144 for `e2e-app` and is how a wrong figure once
  reached the documentation. The per-marker inventory, with proposed severities
  and single-cause clusters, is `docs/qa/test-fail-register.md`.
- **The seal.** `tests/e2e-app` answers an unanticipated `/api` call with a 501
  and fails the test at teardown, naming it. That is the design. Answer the call
  in the test with `world.set` / `world.route`; never loosen the seal.

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
