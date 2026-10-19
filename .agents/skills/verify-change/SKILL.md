---
name: verify-change
description: "Use this skill after changing code, config, tests, scripts, infra or docs in pattadar-platform, or when asked what verification is needed or to verify work before a commit or PR: select and run the smallest sufficient local checks, report each as PASS/FAIL/BLOCKED/NOT_RUN/SKIPPED with what was not verified, and map them to CI jobs. Not for writing tests or harnesses (test-governance) or end-to-end CRUD proof (functional-acceptance)."
compatibility: Requires the pattadar-platform repository and Bun 1.3.14. Python, Swift, Playwright, Docker, or Terraform tooling is needed only for affected areas.
metadata:
  project: pattadar-platform
  standard: agentskills.io
  verified: "2026-10-09"
---

# Verify Change

Choose verification from the changed behavior and paths; do not run every check
by habit or claim full CI coverage after a targeted subset. Specialist delivery,
security, migration, lifecycle, and architecture skills own domain invariants;
this skill owns execution and truthful reporting of local checks.
Unit tests run under bun:test; there is no lint or coverage gate, and nothing
is committed unless asked.

## Workflow

1. Inspect the changed paths and reconstruct the behavior affected.
2. Read `references/verification-matrix.md` for the affected stack and select
   the narrowest checks that can falsify the change.
3. Explain material side effects before running a check: dependency/provider
   downloads, generated build files, servers, databases, network access, or
   large output. Terraform `init`, Docker image builds and anything that
   reaches a live server or founder data wait for Reddy's approval.
4. Run checks from narrow to broad. Before fixing a failure, compare it with
   the baseline (`docs/qa/test-fail-register.md`, `docs/qa/testing-plan.md`
   Phase 4, or the same check on the base revision). Fix only failures your
   change introduced and list the pre-existing ones. "Expected to fail, but
   passed" means a `test.fail()` defect was fixed: if your change fixed it,
   remove that marker in the same change. Never loosen the seal, fixtures or assertions. Rerun the failed
   layer.
5. Clean generated artifacts/processes created for verification.
6. Apply the change-governance watch before reporting: documentation,
   architecture, security/privacy, testing/evidence, and cleanup impact.
7. Report each check as PASS, FAIL, BLOCKED, NOT_RUN or SKIPPED per
   `.Codex/skills/test-governance/references/evidence-and-status.md`, with the
   command and tests collected versus executed. A clean exit that collected
   nothing relevant, or skipped every DB test, is BLOCKED. An operation covered
   only by a `test.fail()` marker is FAIL (a known defect). Say why each
   NOT_RUN is acceptable.

## Safety boundaries

- Never point mutating browser suites at founder/production data. Web360 requires
  a disposable `TEST_PG_DSN`; `e2e-app` is sealed only in its `app` and `phone`
  projects (`bun run test`); its `live` project reads founder data and needs approval.
- Never run `apps/ios/verify.sh`, Maestro flows, `xcrun devicectl`, `xcrun simctl`,
  or install on a physical device. Use `swift test` for PattadarKit logic.
- Terraform `init`, even with `-backend=false`, downloads providers and writes
  `.terraform`; `.Codex/rules/pattadar-safety.md` requires approval first.
  Without it run only `fmt -check` and report validate NOT_RUN. Plan/apply and
  all cloud calls are never ordinary verification.
- Do not install dependencies merely to make a check available without telling
  the user. If required tooling is absent, report the best available check.
- Invoke `pattadar-security-review` for trust-boundary/PII/auth/storage changes and
  `secret-scan` before commit/push when credentials or config are involved.
