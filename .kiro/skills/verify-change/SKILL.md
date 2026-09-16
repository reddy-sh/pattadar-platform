---
name: verify-change
description: Use this skill after changing code, configuration, tests, scripts, infrastructure, or documentation in pattadar-platform—or when asked what verification is needed—to select and run the smallest sufficient local checks, map them to relevant CI gates, fix failures, and state what was not verified.
compatibility: Requires the pattadar-platform repository and Bun 1.3.14. Python, Swift, Playwright, Docker, or Terraform tooling is needed only for affected areas.
metadata:
  project: pattadar-platform
  standard: agentskills.io
  verified: "2026-09-16"
---

# Verify Change

Choose verification from the changed behavior and paths; do not run every check
by habit or claim full CI coverage after a targeted subset. Specialist delivery,
security, migration, lifecycle, and architecture skills own domain invariants;
this skill owns execution and truthful reporting of local checks.

## Workflow

1. Inspect the changed paths and reconstruct the behavior affected.
2. Read `references/verification-matrix.md` for the affected stack and select
   the narrowest checks that can falsify the change.
3. Explain material side effects before running a check: dependency/provider
   downloads, generated build files, servers, databases, network access, or
   large output.
4. Run checks from narrow to broad. Fix failures and rerun the failed layer.
5. Clean generated artifacts/processes created for verification.
6. Apply the change-governance watch before reporting: documentation,
   architecture, security/privacy, testing/evidence, and cleanup impact.
7. Report commands, pass/fail results, skipped checks, and why each skip is
   acceptable. A command merely running is not evidence; it must exit cleanly.

## Safety boundaries

- Never point mutating browser suites at founder/production data. Web360 requires
  a disposable `TEST_PG_DSN`; sealed `e2e-app` must keep its API interception.
- Never run `apps/ios/verify.sh`, `xcrun devicectl`, `xcrun simctl`, or install on
  a physical device. Use `swift test` for PattadarKit logic.
- Terraform `init` downloads providers and writes `.terraform`; mention this
  before running it. Terraform plan/apply and all cloud calls require separate
  approval and are not ordinary verification.
- Do not install dependencies merely to make a check available without telling
  the user. If required tooling is absent, report the best available check.
- Invoke `security-review` for trust-boundary/PII/auth/storage changes and
  `secret-scan` before commit/push when credentials or config are involved.
