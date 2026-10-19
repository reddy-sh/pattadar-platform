# W360 Home final UX: pre-edit guard baseline (02/10/2026)

Run from the repo root before any edit for this task. `Dashboard.tsx`,
`w360.css`, `ui.tsx`, `routes.tsx`, `api.ts`, `Shell.tsx`, `02-dashboard.spec.ts`,
`design.md`, `docs/specs/2026-08-15-web-360-design.md` and
`scripts/shared-components-tests.ts` were checked with `cmp` against
`.local/impl-scratch/home-final-baseline/` first: all identical.

HEAD `8c6a2d4`, Bun 1.3.14, 2026-10-03T02:49Z (UTC). Logs (git-ignored):
`.local/impl-scratch/home-final-before-{typecheck,buntest,guards}.log`.

| Command | Result |
|---|---|
| `bun run typecheck` | PASS: tokens, core, university, web, mobile all exit 0 |
| `bun test apps/web/src` | PASS: 86 pass, 0 fail, 297 expect() calls, 16 files |
| `scripts/a11y-web-tests.ts` | PASS |
| `scripts/area-tests.ts` | PASS |
| `scripts/cache-eviction-tests.ts` | PASS |
| `scripts/contrast-helper-tests.ts` | PASS |
| `scripts/contrast-tests.ts` | PASS |
| `scripts/fence-tests.ts` | PASS |
| `scripts/geo-tests.ts` | PASS |
| `scripts/hooks-tests.ts` | PASS |
| `scripts/lifecycle-tests.ts` | PASS |
| `scripts/plural-tests.ts` | PASS |
| `scripts/provenance-tests.ts` | PASS |
| `scripts/screening-tests.ts` | PASS |
| `scripts/shared-components-tests.ts` | PASS (note: RecordNotes card 1<2, Tools cell 1<4, Orders card 3<4, RecordPhotos card 6<8 could be lowered; not this task's files) |
| `scripts/typography-tests.ts` | **FAIL (pre-existing)**: TY-5, `apps/university/src/styles.css:1488`, `:1520`, `:1538` use `font-weight: 800`. The file is unmodified in the working tree (last commit `641ddb5`), so the red is committed and outside this task |
| `scripts/url-scheme-tests.ts` | PASS |
| `scripts/village-tests.ts` | PASS |
| `scripts/vocab-tests.ts` | PASS |
| `scripts/icon-guard.ts` | PASS |
| `scripts/ux-guards.ts` | PASS |
