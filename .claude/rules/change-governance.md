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
   Use `pattadar-security-review`; run `secret-scan` before every commit or
   push, and on any finding or unscanned scope do not stage, commit, push or
   open a PR: report it redacted and wait.
4. **Testing/evidence:** Use the responsible delivery/governance skill to choose
   domain invariants and `verify-change` to run/report the smallest sufficient
   checks. When the change touches a create/read/update/delete/add-content
   surface, use `functional-acceptance` to exercise every one of those
   operations end to end, including its failure path — a passing typecheck,
   build, or empty state is not functional proof. Do not claim CI, deployment,
   compliance, or live-state evidence that was not obtained.
5. **Clean up after use:** Stop every process this session started (background
   Bash tasks and Monitors by task id with TaskStop, others by their own PID)
   and close only browser tabs it opened; never kill by name or port or stop
   the founder's `./scripts/start-local.sh` stack. Remove temporary reports, screenshots,
   build/test output, caches, worktrees, scratch files and side-effect writes
   (`.git/lost-found`, `.terraform/`, `test-results/`, `.parity/`) created for
   the task unless the user requested them as deliverables. Never touch
   user-owned or uncertain processes/terminals/files.

Final responses should briefly state affected dimensions, checks performed,
what was not verified, and any intentionally retained artifact/process.

## Skill owners

For Pattadar work these project skills take precedence over generic built-in or
plugin skills; the skill listing can cut their descriptions when many plugins
are enabled, so route by this list:

- `apps/web` and `apps/university` UI: `web-feature-delivery`; Expo: `mobile-feature-delivery`.
- Web-to-native-iOS parity: `sync-ios`.
- API/GraphQL/gateway/storage contracts: `backend-contract-change`.
- Test harnesses/CI coverage: `test-governance`; running/reporting checks: `verify-change`; CRUD proof: `functional-acceptance`.
- Data migrations/backfills: `safe-data-migration`; Terraform code: `infrastructure-change`.
- Operating up/down/park/thaw/restore: `platform-lifecycle`.
- Secrets before commit/push: `secret-scan`; threat review: `pattadar-security-review`.
- Release go/no-go: `release-readiness`; incidents: `incident-triage`.
