# @pattadar/core

Shared, UI-free domain logic and types consumed by both apps/web and apps/mobile. Buildless — Vite and Metro compile the TypeScript source directly.

Currently seeded with DD/MM/YYYY date helpers (`src/format/date.ts`) and a few domain types (`src/types/index.ts`). The real content arrives in Phase 2 by porting the modules below out of the predecessor platform.

## PORT MAP — predecessor → core

Source root: the predecessor platform's `ui/apps/pattadar/src/`.

| predecessor source | Future home | What it is | Tests in predecessor |
| --- | --- | --- | --- |
| `landcalc.ts` | `core/land` | Extent/unit calculations (acres, guntas, cents; AP conventions) | Yes — `landcalc.test.ts` |
| `units.ts` | `core/land` | Land-unit definitions and conversions | Yes — `units.test.ts` |
| `dashboard.ts` | `core/dashboard` | Portfolio math for the Land Portfolio dashboard (value, gain, health rings) — already a pure module | Yes — `dashboard.test.ts` |
| `docTypes.ts` | `core/documents` | Document-type taxonomy for land records | Yes — `docTypes.test.ts` |
| `driveFolders.ts` | `core/storage` | Drive filing logic (which folder a document lands in) | No |
| `exporters.ts` (data preparation only; file now lives at `ui/platform/design-system/src/exporters.ts` in the predecessor) | `core/export` | Row/column shaping for exports. The jspdf/xlsx rendering itself stays web-only in apps/web | No |
| GraphQL operations inlined in `RemoteApp.tsx` | `core/graphql` | Queries/mutations extracted into typed documents. Plan: graphql-codegen against the Strawberry schema of services/api, so types are generated, not hand-written | No |

Notes:

- `landcalc`, `units`, `dashboard`, and `docTypes` are already cleanly separated pure modules with unit tests in the predecessor — these port first and nearly verbatim (their tests come along).
- `driveFolders` and the exporter data-prep are pure but untested; porting them includes writing tests.
- The GraphQL extraction is the largest item: today operations are string templates inside `RemoteApp.tsx` with hand-written result types. TODO(Phase 2): stand up graphql-codegen and move operations here.

## Scripts

- `bun run typecheck` — `tsc --noEmit`
- `bun run build` — no-op (source package)
