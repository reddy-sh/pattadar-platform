---
inclusion: always
---

# Change governance watch

For every Pattadar task, assess these five dimensions before reporting complete.
Apply only the dimensions the change can affect, but never omit the assessment.

1. **Documentation:** Did behavior, config, paths, commands, status, or operator
   procedure change? Use `runbook-consistency`; update active docs and mark
   historical evidence instead of silently rewriting it.
2. **Architecture:** Did an entrypoint, dependency, data flow, trust boundary,
   persistent/runtime ownership, provider, client, or deployment path change?
   Use `architecture-trace` and update architecture evidence.
3. **Security/privacy:** Did auth, identity, public routes, storage, sharing,
   PII, SQL/input, secrets, providers, IAM, or infrastructure exposure change?
   Use `security-review`; use `secret-scan` before commit/push when applicable.
4. **Testing/evidence:** Use the responsible delivery/governance skill to choose
   domain invariants and `verify-change` to run/report the smallest sufficient
   checks. Do not claim CI, deployment, compliance, or live-state evidence that
   was not obtained.
5. **Clean up after use:** Stop every agent-started process; close its managed
   terminal when supported; remove temporary reports, screenshots, build/test
   output, caches, worktrees, and scratch files created for the task unless the
   user requested them as deliverables. Never touch user-owned or uncertain
   processes/terminals/files.

Final responses should briefly state affected dimensions, checks performed,
what was not verified, and any intentionally retained artifact/process.
