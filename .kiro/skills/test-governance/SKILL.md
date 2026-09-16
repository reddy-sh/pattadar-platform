---
name: test-governance
description: Use this skill when designing, authoring, refactoring, or auditing Pattadar test harnesses and CI coverage—Bun/Python/Swift tests, sealed e2e-app, disposable-DB e2e-web360, map/capability configs, Maestro mobile flows, fixtures, flaky-test handling, suite discovery, or coverage gaps.
compatibility: Requires repository test/config/CI files. Never run live-data or mutating browser flows without explicit safe-environment approval.
metadata:
  project: pattadar-platform
  standard: agentskills.io
  verified: "2026-09-16"
  upstream-inspiration: anthropics/webapp-testing
---

# Test Governance

Own test architecture and coverage policy. `verify-change` selects/runs checks
for a specific change; this skill changes the harness, suite, fixtures, or CI
contract itself.

## Workflow

1. Read `references/harness-map.md`; identify behavior layer and safest
   instrument before writing a test.
2. Preserve suite isolation: sealed browser API interception, disposable DB,
   one-worker mutation ordering, native package purity, and generated-project
   boundaries.
3. Prefer semantic/user-observable assertions, deterministic clocks/data,
   web-first waits, and failure evidence. Never hide defects with sleeps,
   weakened assertions, retries, or fixture escape.
4. Decide CI inclusion based on value, duration, reliability, environment, and
   destructive risk. Document intentionally manual suites/gaps.
5. For flaky tests, reproduce and fix the race/fixture/environment; quarantine
   only with owner, evidence, expiry, and retained failure visibility.
6. Update `verify-change` routing and run relevant local checks.

Do not introduce generic Playwright helpers that bypass the repository's
purpose-built harnesses or start servers underneath `e2e-app`.
