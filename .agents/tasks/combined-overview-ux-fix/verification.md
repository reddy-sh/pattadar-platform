# Combined view Overview fix: verification record (pass 2)

01/10/2026 · tree at `8c6a2d4` plus the working tree. Product code is unchanged since pass 1 (`CombinedProperty.tsx`: `.stack lg` wrapper; `MemberCard` row with `--space-sm` gap and `--space-md` above). This pass changed only `tests/e2e-app/specs/28-combined-overview.spec.ts` (review findings 4 and 5) and ran the gate.

## Commands and results

Run from the repo root unless noted. Every command below was run on this tree, and each result is quoted from that command's own output.

| # | Command | Result |
|---|---|---|
| 1 | `bun run --filter @pattadar/web typecheck` | pass: `@pattadar/web typecheck: Exited with code 0` |
| 2 | `for s in scripts/*-tests.ts; do bun run "$s"; done` (17 scripts) | 16 pass, 1 fail (pre-existing, see below) |
| 3 | `bun run scripts/icon-guard.ts` | pass: `ICON GUARD PASSES` |
| 4 | `bun run scripts/ux-guards.ts` | pass: `UX GUARDS PASS` |
| 5 | `bun test apps/web/src` | pass: `85 pass · 0 fail · Ran 85 tests across 16 files` |
| 6 | `git diff --check` on both files of this fix | pass: no whitespace errors |
| 7 | `cd tests/e2e-app && APP_WEB_URL=http://localhost:5173 ./node_modules/.bin/playwright test --project=app --project=phone specs/28-combined-overview.spec.ts --reporter=line` | pass: `4 passed (3.9s)`, exit 0 (2 tests × app 1512 and phone 390) |
| 8 | same, `specs/27-combined-map.spec.ts` (same frame and holding) | pass: `25 passed (16.0s)`, exit 0 |
| 9 | temporary capture spec, both projects (deleted after) | pass: `2 passed (2.7s)`, exit 0 |
| 10 | temporary falsifiability spec, both projects (deleted after) | pass: `6 passed (5.3s)`, exit 0 |
| 11 | `tsc -p` a scratch TS7 config extending `tests/e2e-app/tsconfig.json` | 0 errors in `28-combined-overview.spec.ts` (62 pre-existing in other suite files) |

Guard loop (2), each script's final line:

```
0  a11y-web-tests.ts           A11Y WEB TESTS PASS
0  area-tests.ts               AREA TESTS PASS
0  cache-eviction-tests.ts     CACHE EVICTION TESTS PASS
0  contrast-helper-tests.ts    CONTRAST HELPER TESTS PASS
0  contrast-tests.ts           CONTRAST TESTS PASS
0  fence-tests.ts              FENCE TESTS PASS
0  geo-tests.ts                GEO TESTS PASS
0  hooks-tests.ts              HOOKS TESTS PASS
0  lifecycle-tests.ts          LIFECYCLE TESTS PASS
0  plural-tests.ts             PLURAL TESTS PASS
0  provenance-tests.ts         PROVENANCE TESTS PASS
0  screening-tests.ts          SCREENING + CLASSIFIER TESTS PASS
0  shared-components-tests.ts  SHARED COMPONENT TESTS PASS
1  typography-tests.ts         TYPOGRAPHY TESTS FAILED (1)
0  url-scheme-tests.ts         URL SCHEME TESTS PASS
0  village-tests.ts            VILLAGE TESTS PASS
0  vocab-tests.ts              VOCAB TESTS PASS
```

### The typography failure is on HEAD, not this fix

```
FAIL: TY-5 weights are 400 or 700 — the only weights the face has —
    apps/university/src/styles.css:1488 font-weight: 800
    apps/university/src/styles.css:1520 font-weight: 800
    apps/university/src/styles.css:1538 font-weight: 800
```

All three lines blame to committed `641ddb5` (01/10/2026, "Add Andhra Pradesh and Telangana record literacy videos"). `apps/university` has no working-tree changes. TY-5 lists every offender (no "… and N more"), and the other checks (TY-0, TY-2 to TY-4, TY-6, TY-7) report nothing, so `apps/web` passes every typography check, the co-resident edits included. Out of scope here and left untouched. It fails the CI web job for any commit on top of HEAD until someone fixes it separately.

### Notes on the runs

- Sealed `tests/e2e-app` against the user's already-running Vite dev server on :5173 (`apps/web`). No server was started, every `/api` call was answered from fixtures, and no fixture file was edited. `--reporter=line` left `results.json` and `playwright-report/` alone. `--output` pointed into `$TMPDIR`, so `tests/e2e-app/test-results/` was not cleaned either.
- The co-resident Your-portfolio edits (review finding 2) were present for every run. Their `w360.css` diff is `.sec.sec-first` and `.vm-place` only, and neither renders on this tab, so the numbers below measure this fix alone.
- Check 11 needs a scratch config because the suite's own `tsconfig.json` sets `moduleResolution: node`, which TypeScript 7 removed. No CI job typechecks this suite. Playwright transpiles it without type checks.
- The tree moved after the checks. Another session created `apps/web/src/w360/fenceBill.ts` (19:23) and edited `scripts/fence-tests.ts` (19:24). The last check here finished at about 19:22, so no result above includes them. They were not touched. Re-run checks 1, 2 and 5 before committing.

## Sealed re-capture (1512 and 390)

Kept in `.local/ux-audits/2026-10-01-combined-overview/verify/`: `overview-{app,phone}-{top,full,seam,card}.png` plus `overview-{app,phone}.json`. The pass-1 `after/` captures are left as they were. Raw `getBoundingClientRect` values, not rounded:

| | app 1512×950 | phone 390×664 |
|---|---|---|
| wrapper | `stack lg`, child of `main`, row-gap 24px | same |
| strip bottom → first card top | 378.171875 → 402.171875 = **24px** | 615.953125 → 639.953125 = **24px** |
| between cards | 16px (side by side, 3 tracks of ~386.7px) | 16px (stacked, 1 track of 358px) |
| status line → buttons, all 3 cards | **16px** | **16px** |
| between the two buttons, all 3 cards | **12px**, one line, 30px tall | **12px**, one line, 44px tall (coarse pointer) |
| sideways overflow | 0 | 0 |
| first card top | 402 of 950 | 640 of 664 |

Screenshots read back:

- `overview-app-top.png` and `overview-app-seam.png` show a clear band of page background between the strip's bottom border and all three cards. Each card's buttons sit apart from each other and from "Boundary on file · 1 document · sheet filed".
- `overview-phone-seam.png` shows the same band between the "Costs on its records" cell and the Sy 214/2 card.
- `overview-phone-card.png` shows the pair spaced under the status line.

Before the fix (audit `evidence/`), these measured 0px, 0px and 6px.

## Spec changes (review findings 4 and 5)

- Finding 4: the second test now finds the status line by place (`card.getByRole('paragraph').last()`) and the pair by place (links 2 and 3 of the card, after a `toHaveCount(3)` check), not by wording. The header now says items 5 and 7 no longer touch it, and that item 4 (dropping "Open record") leaves no pair, so whoever takes that decision rewrites the test.
- Finding 5: the floor for the space above the buttons is now 16 (`--space-md`). The measured value is exactly 16.000 at both widths, so there is no subpixel margin to trip on.
- Falsifiability (check 10): injected CSS into the sealed page only. No source edit, and nothing reached the user's dev server. In both projects the spec's assertion bodies passed on the clean page, then rejected each injected regression with the expected message:
  - Pre-fix spacing (0px seam, 6px pair, 0px above): "the strip touches the record cards" and "the buttons sit closer than --space-md under the status line".
  - One-step slips (seam `--space-md`, above `--space-sm`): "the gap between two groups is no wider than the gap inside one" and the `--space-md` floor. That second one is the case finding 5 named.
  - Pair at 6px with 16px kept above: "the two buttons are a raw 6px apart". The strip test still passes.

## Not changed, by design

- Finding 2: the six Your-portfolio files are untouched. Nothing was committed (this step's instruction). When committing, stage only `apps/web/src/w360/pages/CombinedProperty.tsx` and `tests/e2e-app/specs/28-combined-overview.spec.ts`.
- Finding 3 (Reddy's): at 390 the first record still starts at 640 of 664. Raise it with audit item 1 (tell a fact once) or a 2×2 strip below 900px. Shrinking the stack would erase the group-versus-card gap.
- Audit item 8 (record-card grid): left as `.cards` auto-fill. No existing shared W360 grid fills the row for a variable count, so it stays Reddy's decision. Items 1, 4, 5 and 7 are Reddy's too. Item 2 (the "Shared costs" link) is within authority but is not a spacing fix, and was not taken.
- Primary-action count (unchanged by this fix): each card offers "open this record" twice (title, "Open record"; item 4) and the record's map once. The tab has no filled button.

## Not verified

- No CI run and no full `tests/e2e-app` suite run. Only specs 27 and 28 were run, which keeps the co-resident `17-villages.spec.ts` edits out of this record.
- Not covered: light and High Contrast schemes, 901–1200px, and loading, failed or not-found states.

## Cleanup

- Both temporary specs (`zz-tmp-combined-overview-{capture,mutation}.spec.ts`) were deleted. `tests/e2e-app/specs/` holds no `zz-tmp*` file.
- Scratch logs, Playwright output and the scratch tsconfig in `$TMPDIR/combined-overview-verify` were removed.
- No process was started besides the finished Playwright runs.
