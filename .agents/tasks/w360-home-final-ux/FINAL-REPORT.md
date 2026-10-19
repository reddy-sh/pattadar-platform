/Users/reddy.sh/reddy.sh/projects/pattadar-platform/.local/ux-audits/2026-10-02-w360-home/implementation/compare-1512-seeded.png
/Users/reddy.sh/reddy.sh/projects/pattadar-platform/.local/ux-audits/2026-10-02-w360-home/implementation/compare-1512-caughtup.png
/Users/reddy.sh/reddy.sh/projects/pattadar-platform/.local/ux-audits/2026-10-02-w360-home/implementation/compare-1512-seeded-full.png
/Users/reddy.sh/reddy.sh/projects/pattadar-platform/.local/ux-audits/2026-10-02-w360-home/implementation/compare-390-caughtup.png

# W360 Home final UX: final report (02/10/2026)

Each compare PNG puts BEFORE next to AFTER. The raw captures are in `implementation/raw/`. Nothing was committed.

## What changed on Home

- For you is now one card. It holds the orders that are waiting on you, the reminders, and one Missing details row. That row shows "N of M complete" and count chips, and a Show all / Hide control lists up to 3 properties. The separate Missing details card that took too much space is gone.
- "You're all caught up" shows only when nothing is waiting and nothing is missing.
- The four Overview cards sit evenly in one row, or two by two on narrower screens. Amounts no longer wrap. With nothing valued, Estimated value shows "—".
- The Recently opened tiles are compact. They no longer have the placeholder band, and their kind icons meet contrast in every theme.

## Files changed (this task)

- `apps/web/src/w360/pages/Dashboard.tsx`: For you merge, Overview `ov-sec`, compact Recently opened
- `apps/web/src/w360/homeGaps.ts` (new): Missing details rule
- `apps/web/src/w360/homeGaps.test.ts` (new): 9 unit tests
- `apps/web/src/w360/w360.css`: three Home-only hunks (Overview container grid + nowrap, `.cards.compact` auto-fit, `.rec-kind` full-strength tokens)
- `tests/e2e-app/specs/02-dashboard.spec.ts`: new and updated Home assertions
- `docs/specs/2026-08-15-web-360-design.md`: three targeted hunks
- `apps/web/README.md`: `/app` row describes the current Home

The skill update (`.kiro/skills/heuristic-ux-audit/**`) was done by an earlier step and was not touched here.

## D1–D5

- D1: one Missing details summary row inside For you. The For you count is orders + reminders + properties with gaps. As planned.
- D2: when a reminder already names a property, that property is counted but not listed again. Only reminders dedupe, orders do not. As planned. Whether to dedupe by property or by gap (review finding 5) is still open for Reddy; see implementation.md.
- D3: changed from the plan. The gap row's action reads "Open record", not "Open documents". Home already uses "Open Documents" to go to `/app/papers`, so the planned label would have given one label two destinations. "Open record" is an existing word, so there is no new copy.
- D4: "—" plus a screen-reader "not set". Both come from existing sources (`inrOr()`, design.md). No new copy.
- D5: "Show all" / "Hide" are existing w360 words. No new copy.
- New copy: none. The "Missing details" heading and "N of M complete" restate earlier Home wording. Check implementation.md if you consider "N of M complete" new.

## Checks (vs baseline, from verification.md)

- Typecheck: PASS, same as baseline.
- `bun test apps/web/src`: 98 pass, 0 fail. The baseline was 86. This task added 9 tests in homeGaps; the concurrent session added `cardName.test.ts`.
- Guards: 19 of 20 PASS. The one FAIL is pre-existing: typography TY-5, `font-weight: 800` in `apps/university/src/styles.css`, same lines as the baseline.
- Web build: PASS.
- 02-dashboard, sealed: app 53 pass, 1 expected failure, 12 fail; phone 3 of 3. The baseline was 45 failed / 4 passed. No new failures: all 12 are on the baseline list with unchanged test bodies. No baseline test was deleted or skipped, and 18 were added.
- One-font spec on `/app`: 2 of 2 pass, same as baseline.
- Functional acceptance: 7 of 7, plus the 10 dismiss-flow tests. Each covers its failure path too.
- CSS mutation checks: every new assertion fails when its pre-fix rule is put back.
- 03-properties and 24-responsive: same results as before. 00-harness and 01-shell differ only by timing races that already existed (the Shortcuts nav strict-mode race, and the unanswered `auditTrail` console guard).
- Parity check: exit 1 on two `twins` errors. Neither comes from this task (`landcalc.ts`, `operations.ts`).

## Drift fixed

- Review finding 1/2: Overview figures wrapped at 901–1087px with the rail open. The grid now uses a container rule (840px window and 48rem section) plus nowrap, and the 901px test now asserts this.
- Finding 3: the empty fourth track in Recently opened (`auto-fill` → `auto-fit`).
- Finding 4: kind-icon contrast was 2.2–2.9:1. It is now ≥ 4.9:1 in Dark, Light and High Contrast.
- Doc drift: the `apps/web/README.md` `/app` row and the Dashboard header comment were stale. Both are corrected.

## Not verified

- The live gateway, API and DB. `tests/e2e-web360` needs `TEST_PG_DSN` and was not run. It still asserts the pre-26/09 Home, and `gap-properties.spec.ts:247` will need `exact: true`.
- Screen-reader output with real assistive technology.
- Fallback ₹ widths on other operating systems, and widths outside the measured sweep.
- Recent activity with data (the fixtures answer `auditTrail` empty).
- CI, deployment, and native iOS.

## iOS parity

- No Swift change is needed. Every file in this task is NOTE/IGNORE, and none of the contract's five buckets is touched.
- The Missing details rule is web-only, in the browser over `Query.web.properties`.
- Open for Reddy: should it become a shared `packages/core` rule with a PattadarKit twin and vectors? That is a product and architecture call.
- `swift test` was not run, because nothing was adapted.

## Concurrent session

- The working tree has many modified files that belong to another session, for example `landcalc.ts`, `operations.ts`, FenceStudio and the mobile/api files. They also include the untracked `tests/e2e-app/specs/28-combined-overview.spec.ts` and `cardName.test.ts`. None of these was edited by this task.
- Their effect on this task: the two parity `twins` errors and the higher unit-test count. Nothing else interfered.
- Shared `w360.css` was changed only by targeted edits to its three Home-only hunks.

## Cleanup

- Removed: `.local/impl-scratch/home-final-baseline/`, `home-final-view/` (it was never created) and `home-final-pw-*/`.
- No scratch capture specs are left in `tests/`.
- No process started by this task is running. The dev servers on 5173, 5181 and the University Vite were not touched.
- Kept: `implementation/` (raw and compare PNGs), the task reports, and the git-ignored logs under `.local/impl-scratch/`.
