# Test Harness Map

| Harness | Owns | Safety/CI status |
|---|---|---|
| Bun unit tests (`bun:test`) | core/tokens/web/mobile/university pure logic | CI: `bun test packages/core packages/tokens apps/web/src apps/mobile/tests apps/university/src` |
| `scripts/*-tests.ts` + guards | offline rules/classes of UI/icon defect | discovered by CI |
| `scripts/tests` pytest | `deploy-release.py` | CI |
| `scripts/ai-boundary-guard.py` (`--selftest`, then plain) | prompt/provider/secret/MCP boundaries in `docs/architecture/ai-inventory.yaml` | CI; static, calls no provider |
| `scripts/emit-vectors.ts --check` + `scripts/parity-check.ts` | web/native vectors and contracts | CI (ios job) |
| `scripts/validate-agent-governance.py` | skill/eval/steering/hook structure | CI; reads `.kiro` only, never the untracked `.claude` copy |
| API pytest | domain/schema/idempotency/account/import/payment | CI |
| Gateway pytest | auth/header/proxy/storage/public route contracts | CI |
| Assistant pytest | attachment/public-record/tool-policy contracts | full directory in CI |
| `tests/e2e-app` | fast sealed screens/routes/states/responsive behavior | nightly, one shard of eight; not a merge gate; never escape API seal. Sealed only in the `app` and `phone` projects (`bun run test`, `test:app`, `test:phone`). The `live` project (`bun run test:live`, and any bare `playwright test`) reads the founder's stack with a real local token: explicit approval only |
| `tests/e2e-web360` | built SPA + real API + disposable PostgreSQL mutations | CI default + separate maps config |
| capability config | public recipient/account-data fixture flow | targeted (`bun run test:capabilities`) |
| `tests/e2e-mobile/*.yaml` | Expo Maestro navigation/account flows | human-run only, with approval: booted simulator, a signed-in account on a real backend (unsealed), and `scripts/start-mobile.sh` calls `xcrun simctl`. Otherwise NOT_RUN. No CI job and no package manifest (`tests/e2e-mobile/README.md`) |
| PattadarKit Swift tests | native rules/models/offline/vector contracts | CI. With `PATTADAR_LIVE_API_TESTS=1`, `LiveAPITests` reads and `CRUDTests`, `PhotoTests` and `WriteFlowTests` write (the last two as `u01`) through whatever API is on 127.0.0.1:8080; with `PATTADAR_LIVE_UPLOAD_TESTS=1`, `UploadTests` sends a real deed to the paid reader with one automatic retry. Unset, they return early and show as passed: report NOT_RUN, and never set the flags without Reddy's approval |
| XcodeGen/simulator build | native integration/compilation | CI; no device install |
| Terraform fmt/init/validate | every root in the `ci.yml` terraform-validate matrix (five: `envs/{dev,prod}/{persistent,runtime}`, `envs/prod/university`) | CI; a local `init` needs approval; not applied-state evidence |

`e2e-deeds` and `e2e-ux` were removed; do not cite them as current suites.

## Notes that cost a run to learn

- `tests/e2e-web360/specs/account-data.spec.ts` and
  `tests/e2e-web360/specs/capabilities.spec.ts` are what `capabilities.config.ts`
  matches (`testMatch: /(?:capabilities|account-data)\.spec\.ts$/`); the default
  config also picks them up. Only `account-data.spec.ts` answers every other
  `**/api/**` call (503); `capabilities.spec.ts` routes only its share/work
  paths, so give a new capability spec the same catch-all.
- `tests/e2e-app/specs` and `tests/e2e-web360/specs` hold executable
  `test.fail()` markers. Counts move with every fix: take them from the commands
  in `docs/qa/test-fail-register.md`, never from a skill. A marker goes red when
  the defect is FIXED (`Expected to fail, but passed.`) and must then be deleted
  as part of the fix. It also goes red when it times out (status `timedOut`, an
  unexpected failure) with the defect still present, which is why
  `09-record-boundary.spec.ts` uses short assertion timeouts. Check the status
  and the marker's comment before deleting it or attributing it to a change.
- About a dozen pytest files provision their own PostgreSQL through
  `initdb`/`pg_ctl`, or import a fixture that does. List them with
  `grep -rlE 'initdb|test_(invitation_security|payments) import' services/api/tests services/assistant/tests`.
  Without those binaries, or as root, they SKIP and pytest still exits 0:
  report BLOCKED, not PASS. They ERROR only when `initdb` exists and fails.
- On macOS, check the locale first: Postgres 17 aborts the throwaway cluster
  (`postmaster became multithreaded during startup`) unless `LC_ALL` is a valid
  locale. Run `LC_ALL=C .local/api-venv/bin/python -m pytest ...`.
- They also error on macOS when the host runs out of SysV shared-memory IDs.
  The default `kern.sysv.shmmni` is 32, and every PostgreSQL that dies by SIGKILL
  (a test run killed mid-fixture, for example) leaves a 56-byte interlock segment
  behind until reboot. The symptom is `initdb` exiting 1 with `could not create
  shared memory segment: No space left on device`. `pytest` hides it because the
  fixture captures stderr. Diagnose with `ipcs -ma`: an orphan has `SEGSZ` 56,
  `OWNER` `$USER`, `NATTCH` 0 and a `CPID` that `ps -p` can no longer find.
  `ipcrm` is irreversible: list those candidates and ask before
  `ipcrm -m <id>`; never touch any other segment. Measured 26/09/2026: 31
  orphans blocked 43 cases, and after removing them all 463 api and 29
  assistant cases passed.
- The `e2e-app` world routes `web { <field> }` documents by field. A W360 screen
  that reads the root schema instead, such as the record head's `notes`, is
  answered only when `fixtures/seed.ts` or the test holds a `root.<field>` key.
  Every other root-level document still gets a 400, which the previous app's
  screens are built to swallow. Before 26/09/2026 `notes` had no such key: every
  record screen logged a 400, and 626 of 883 failures traced to that one call.
- `bun test` pins `TZ` to UTC unless the environment sets it, so a date test that
  passes locally ran in UTC, as CI does. It does not follow that the test is
  zone-independent. Run date tests with `TZ` set to extreme offsets
  (`Pacific/Kiritimati`, UTC+14, and `Pacific/Pago_Pago`, UTC−11) before
  trusting them.
