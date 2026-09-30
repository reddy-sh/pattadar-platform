# Test Harness Map

| Harness | Owns | Safety/CI status |
|---|---|---|
| Bun unit tests | core/web/mobile/university pure logic | CI |
| `scripts/*-tests.ts` + guards | offline rules/classes of UI/icon defect | discovered by CI |
| API pytest | domain/schema/idempotency/account/import/payment | CI |
| Gateway pytest | auth/header/proxy/storage/public route contracts | CI |
| Assistant pytest | attachment/public-record/tool-policy contracts | full directory in CI |
| `tests/e2e-app` | fast sealed screens/routes/states/responsive behavior | nightly, one shard of eight; not a merge gate; never escape API seal |
| `tests/e2e-web360` | built SPA + real API + disposable PostgreSQL mutations | CI default + separate maps config |
| capability config | public recipient/account-data fixture flow | targeted |
| `tests/e2e-mobile/*.yaml` | Expo Maestro navigation/account flows | manual by design; `tests/e2e-mobile/README.md` is the runner, no package manifest |
| PattadarKit Swift tests | native rules/models/offline/vector contracts | CI |
| XcodeGen/simulator build | native integration/compilation | CI; no device install |
| Terraform fmt/init/validate | four root static validity | CI; not applied-state evidence |

`e2e-deeds` and `e2e-ux` were removed; do not cite them as current suites.

## Notes that cost a run to learn

- `tests/e2e-web360/specs/account-data.spec.ts` and
  `tests/e2e-web360/specs/capabilities.spec.ts`
  mock every `**/api/**` route and are what `capabilities.config.ts` matches
  (`testMatch: /(?:capabilities|account-data)\.spec\.ts$/`); they are also picked
  up by the default config.
- Separately, `tests/e2e-web360/specs/gap-shell.spec.ts` and five of its
  neighbours hold 9 `test.fail()` markers, and `tests/e2e-app/specs` holds 118
  across 23 files. A marker reports red when the defect is FIXED, so it has to
  be deleted as part of the fix. Read the marker's comment before attributing a
  red case to a change. Inventory: `docs/qa/test-fail-register.md`.
- `09-record-boundary.spec.ts` uses deliberately short assertion timeouts, because
  a `test.fail()` that fails by timing out is reported as a pass.
- Seven suites provision their own PostgreSQL cluster through `initdb`/`pg_ctl`.
  In `services/api/tests`, `test_invitation_security` and `test_payments` own the
  fixtures, and `test_account_data`, `test_api_misc_hardening`,
  `test_api_misc_payments` and `test_notification_retention` import them. In
  `services/assistant/tests` it is `test_attachment_migration`. They error, not
  skip, where those binaries are unavailable.
- They also error on macOS when the host runs out of SysV shared-memory IDs.
  The default `kern.sysv.shmmni` is 32, and every PostgreSQL that dies by SIGKILL
  (a test run killed mid-fixture, for example) leaves a 56-byte interlock segment
  behind until reboot. The symptom is `initdb` exiting 1 with `could not create
  shared memory segment: No space left on device`. `pytest` hides it because the
  fixture captures stderr. Diagnose with `ipcs -ma`: an orphan has `NATTCH` 0 and
  a `CPID` that `ps -p` can no longer find. Remove only those, with
  `ipcrm -m <id>`. Never remove a segment with attachments; that one belongs to
  a running PostgreSQL. Measured 26/09/2026: 31 orphans blocked 43 cases, and
  after removing them all 463 api and 29 assistant cases passed.
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
