# Test Harness Map

| Harness | Owns | Safety/CI status |
|---|---|---|
| Bun unit tests | core/web/mobile pure logic | CI |
| `scripts/*-tests.ts` + guards | offline rules/classes of UI/icon defect | discovered by CI |
| API pytest | domain/schema/idempotency/account/import/payment | CI |
| Gateway pytest | auth/header/proxy/storage/public route contracts | CI |
| Assistant pytest | attachment/public-record selected contracts | selected CI subset |
| `tests/e2e-app` | fast sealed screens/routes/states/responsive behavior | retained, not currently CI; never escape API seal |
| `tests/e2e-web360` | built SPA + real API + disposable PostgreSQL mutations | CI default + separate maps config |
| capability config | public recipient/account-data fixture flow | targeted |
| `tests/e2e-mobile/*.yaml` | Expo Maestro navigation/account flows | manual; no documented package runner |
| PattadarKit Swift tests | native rules/models/offline/vector contracts | CI |
| XcodeGen/simulator build | native integration/compilation | CI; no device install |
| Terraform fmt/init/validate | four root static validity | CI; not applied-state evidence |

`e2e-deeds` and `e2e-ux` were removed; do not cite them as current suites.
