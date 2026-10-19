---
name: test-governance
description: "Use this skill when designing, authoring, refactoring or auditing Pattadar test harnesses and CI coverage: Bun/Python/Swift suites, sealed e2e-app, disposable-DB e2e-web360, map/capability configs, the Maestro harness, fixtures, flaky tests, suite discovery or coverage gaps. Not for a feature's own unit test or Maestro flow (web-feature-delivery, mobile-feature-delivery) or choosing and running checks for a change (verify-change)."
compatibility: Requires repository test/config/CI files. Never run live-data or mutating browser flows without explicit safe-environment approval.
metadata:
  project: pattadar-platform
  standard: agentskills.io
  verified: "2026-10-09"
  upstream-inspiration: anthropics/webapp-testing
---

# Test Governance

Own test architecture and coverage policy. `verify-change` selects/runs checks
for a specific change; this skill changes the harness, suite, fixtures, or CI
contract itself.
Unit tests use bun:test, pytest and Swift Testing: no Vitest, no invented
coverage threshold, and no commit unless asked.

## Workflow

1. Read `references/harness-map.md`; identify behavior layer and safest
   instrument before writing a test.
2. Preserve suite isolation: sealed browser API interception, disposable DB,
   one-worker mutation ordering, native package purity, and generated-project
   boundaries.
3. Prefer semantic/user-observable assertions, deterministic clocks/data,
   web-first waits, and failure evidence. Never hide defects with sleeps,
   weakened assertions, retries, or fixture escape.
4. Recommend CI inclusion with value, duration, reliability, environment,
   destructive risk and a runner-minute estimate. Adding or widening a job,
   runner, shard, schedule or credential is Reddy's decision (`nightly.yml`
   cost note, `tests/e2e-mobile/README.md`): present the evidence and wait.
   Document intentionally manual suites/gaps.
5. For flaky tests, reproduce and fix the race/fixture/environment; quarantine
   only with owner, evidence, expiry, and retained failure visibility.
6. Report results with the vocabulary in `references/evidence-and-status.md`:
   PASS/FAIL/BLOCKED/NOT_RUN/SKIPPED, reconciled counts, finding classification,
   and evidence handling. A run that collected or executed nothing is BLOCKED.
7. Update `verify-change` routing through `agent-skill-maintenance` (step 4, Two
   trees: `.kiro` is canonical, this copy is mirrored) and run relevant local
   checks.

Do not introduce generic Playwright helpers that bypass the repository's
purpose-built harnesses or start servers underneath `e2e-app`. Never start, stop
or restart the founder's local stack (`scripts/start-local.sh` kills every
listener on 8080-8082). :5173/:5180 serve his real records (the dev proxy
injects `x-user-id` `shankarreddy.t`, `apps/web/vite.config.ts`), so driving
them with the built-in `run`, Playwright MCP or Codex in Chrome, even
read-only, needs his explicit approval and is reported as unsealed evidence.
