# Orchestrator notes for w360-home-final-ux (02/10/2026)

These come from the parent session and apply to the plan, implement and review steps.

## 1. Delta exclusions (not this task's work)

A separate skill-update run has already finished. It changed these files, so they are not part of this task's delta. This task must not edit them, and the reviewer must leave them out of the baseline diff:

- `.kiro/skills/heuristic-ux-audit/SKILL.md`, `references/board-format.md`, `assets/board-template.html`
- `.kiro/skills/README.md`
- `.kiro/skill-evals/portfolio.json`
- `.local/ux-audits/2026-10-02-w360-home/board.html`, `board.png`, `compare.png`

These two files already had uncommitted changes before this task started. This task does not touch them:

- `docs/runbooks/aadhaar-kms-rollout.md`
- `scripts/fence-tests.ts`

## 2. 02-dashboard spec: pre-existing failures and the gate

Before any edit, the spec ran 45 failed / 4 passed (see `before-test-baseline.md`). Two causes:

- 38 tests fail on an unanswered `auditTrail` query (console 400).
- The spec still asserts the Home layout from before 26/09.

Do the work in this order:

- (a) **Answer the `auditTrail` query.** Add the `world.set('root.auditTrail', [])` setup that `19-sections-legacy` uses to `02-dashboard.spec.ts`. Keep it local to the spec unless there is a stated reason to answer it in `fixtures/seed.ts` instead.
- (b) **Update the tests this task touches.** Bring every test that covers behavior this task changes up to the new behavior: For you, the caught-up line, the Missing details merge, the disclosure capped at 3, dedup, gap-row actions, the Overview grid, Estimated value "—", and the Recently opened tile. Add the new assertions from the brief. All of them must pass.
- (c) **Then update the remaining stale assertions** to the current Home. Do this only where the fix is a selector or copy change and the product rule the test protects still holds.
  - Never delete or skip a test to get a green run.
  - If a stale test needs more than a selector or copy change, leave it as it is and list it.
  - If the current Home breaks a rule a test protects, keep that test failing and report it as a pre-existing defect.

Review gate:

- Zero new failures compared with the baseline list.
- Every test in (b) passes.
- Every remaining failure is listed with its cause.

The reviewer must not reject a change only because of failures that are on the baseline list and sit in areas this task did not touch.
