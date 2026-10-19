# W360 Home final UX — setup manifest (02/10/2026)

## Baseline copies (pre-edit working tree, byte-identical, verified with `cmp`)

Root: `/Users/reddy.sh/reddy.sh/projects/pattadar-platform/.local/impl-scratch/home-final-baseline/`

- apps/web/src/w360/pages/Dashboard.tsx (has pre-existing uncommitted changes)
- apps/web/src/w360/w360.css (has pre-existing uncommitted changes)
- apps/web/src/w360/ui.tsx
- apps/web/src/routes.tsx (the brief's `apps/web/src/w360/routes.tsx` does not exist; this is the router that lazy-loads `W360Dashboard`)
- apps/web/src/w360/SetupChecklist.tsx
- apps/web/src/w360/Dialog.tsx
- apps/web/src/w360/pages/Audit.tsx (`ActivityRow`)
- apps/web/src/w360/api.ts (`usePortfolio`, `useOrders`, `useProperties`, `useDismissWaiting`, types)
- apps/web/src/w360/growthData.ts (`useSetupTasks`, used by SetupChecklist)
- apps/web/src/w360/Shell.tsx
- apps/web/src/data/hooks.ts (`useAuditTrail`)
- apps/web/src/components/holdingCards.tsx (imported by ui.tsx)
- apps/web/src/components/EmptyState.tsx
- apps/web/src/components/PageHeader.tsx
- apps/web/src/components/LoadFailed.tsx
- apps/web/src/components/Skeletons.tsx
- tests/e2e-app/specs/02-dashboard.spec.ts
- design.md
- docs/specs/2026-08-15-web-360-design.md (has pre-existing uncommitted changes)
- scripts/shared-components-tests.ts
- .kiro/skills/heuristic-ux-audit/SKILL.md
- .kiro/skills/heuristic-ux-audit/references/web-heuristics.md
- .kiro/skills/heuristic-ux-audit/references/board-format.md
- .kiro/skills/heuristic-ux-audit/references/evidence-capture.md
- .kiro/skills/heuristic-ux-audit/assets/board-template.html

Notes: `RecordTile`, `ForYou`, `Overview`, `Shortcuts`, `MissingDetails`,
`RecentActivity` are all defined inside Dashboard.tsx; `RecordTile` has no
other importer. Home imports nothing directly from `apps/web/src/components/`;
`holdingCards.tsx` is reached through ui.tsx. The other four components files
were copied as a precaution.

Reviewer diff: `diff -ru .local/impl-scratch/home-final-baseline/<path> <path>`
for each path above.

## Pre-edit test baseline

`/Users/reddy.sh/reddy.sh/projects/pattadar-platform/.agents/tasks/w360-home-final-ux/before-test-baseline.md`
(45 failed / 4 passed; log `.local/impl-scratch/home-final-before-02.log`).

## Raw BEFORE captures (sealed e2e-app, dark scheme, reduced motion, fixture data)

Capture conditions: seeded = default seed (3 reminders, orders incl. W-2105
waiting on you, Sy 88 "Not on the map"); caught-up = `portfolio.waiting = []`,
`waitingCount = 0`, `orders = []`, Sy 88 gap still present. Both states set
`root.auditTrail = []` (unanswered by the seed), so Recent activity is hidden.
Phone shots are 3× device pixels (1170 wide).

- /Users/reddy.sh/reddy.sh/projects/pattadar-platform/.local/ux-audits/2026-10-02-w360-home/implementation/raw/before-1512-seeded-firstview.png
- /Users/reddy.sh/reddy.sh/projects/pattadar-platform/.local/ux-audits/2026-10-02-w360-home/implementation/raw/before-1512-seeded-full.png
- /Users/reddy.sh/reddy.sh/projects/pattadar-platform/.local/ux-audits/2026-10-02-w360-home/implementation/raw/before-1512-caughtup-firstview.png
- /Users/reddy.sh/reddy.sh/projects/pattadar-platform/.local/ux-audits/2026-10-02-w360-home/implementation/raw/before-1512-caughtup-full.png
- /Users/reddy.sh/reddy.sh/projects/pattadar-platform/.local/ux-audits/2026-10-02-w360-home/implementation/raw/before-390-seeded-firstview.png
- /Users/reddy.sh/reddy.sh/projects/pattadar-platform/.local/ux-audits/2026-10-02-w360-home/implementation/raw/before-390-seeded-full.png
- /Users/reddy.sh/reddy.sh/projects/pattadar-platform/.local/ux-audits/2026-10-02-w360-home/implementation/raw/before-390-caughtup-firstview.png
- /Users/reddy.sh/reddy.sh/projects/pattadar-platform/.local/ux-audits/2026-10-02-w360-home/implementation/raw/before-390-caughtup-full.png

The temporary spec `tests/e2e-app/specs/zz-ux-audit-w360-home-before.spec.ts`
ran (2 tests × 2 projects, passed) and was deleted, along with its
`pw-output`. `git status --short --untracked-files=all ../` from
`tests/e2e-app` hashed `131648a2…` before and after.

## Concurrent edit observed

`.kiro/skills/heuristic-ux-audit/assets/board-template.html` was modified at
18:53:45 on 02/10/2026, after the baseline copy was taken. This step did not
touch it (presumably the parallel skill-update step). The baseline copy is the
committed pre-task version (mtime 27/09/2026). Dashboard.tsx, w360.css, ui.tsx
and 02-dashboard.spec.ts were re-checked with `cmp` at the end of this step and
still match their baseline copies.

## Side effect to know about

Two `playwright test --list` calls (used to name the four passing tests) ran
with the configured reporters, so they overwrote the git-ignored
`tests/e2e-app/results.json` and `tests/e2e-app/playwright-report/` with a
list-only run (49 skipped). The earlier contents are not recoverable; the next
normal `bun run test` regenerates both.
