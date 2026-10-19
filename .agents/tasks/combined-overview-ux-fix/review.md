# Combined view Overview: a shared 24px stack under the figures, and a spaced card button pair

Pass 2 · 01/10/2026

The Overview's figures strip and record cards met at 0px because `CombinedOverview` returned a bare fragment into `main`, a flex column with no gap. The fix wraps both blocks in the shared `.stack lg` (`--space-lg`, 24px) and gives `MemberCard`'s button pair `--space-sm` between and `--space-md` above, on that one row only. Those are audit items 3 and 6 as prescribed, with no copy, content, grid, macrostructure, type, date or dependency change, and the product code is the same as in pass 1. This pass closes pass 1's blocking gap: `verification.md` now records the typecheck, every guard, the unit tests and the new spec in both projects, and the sealed re-capture shows a 24px band under the strip at both 1512 and 390. Pass 1's findings 1, 4 and 5 are closed; 2 and 3 carry forward.

Watch for: another session is editing this working tree while this review runs (confirmed). The commit must be the two fix files only, and the whole-tree checks need a re-run on that state. `typography-tests.ts` fails on HEAD because of three university weights from `641ddb5` (confirmed), so CI's guard step goes red with or without this fix. On a phone the first record's title still sits below the fold (confirmed, Reddy's call).

**Verdict**: APPROVED

## High-level view

The 24px comes from the shared layout helper rather than from a margin either block has to remember. `main`, `.strip` and `.cards` are untouched, as the audit required, because a change to any of them moves every W360 page. The group gap (24px) is wider than the card gap (16px). The `verify/` captures postdate the last product edit (19:20 against 18:46) and show a clear band of page background under the strip at 1512 and at 390.

The button pair's spacing is two inline tokens on one `.row`, which is the audit's scoping. The shared `.row.tight` is a raw 6px across 144 uses, so every other W360 button pair stays at 6px. All three cards measure 12px between the buttons and 16px above them at both widths.

The gate evidence is on record, and the fix's two files haven't changed since the runs. The one red guard is HEAD's: TY-5 flags three `font-weight: 800` lines in `apps/university`, committed in `641ddb5`. CI's guard loop will fail on them with or without this fix.

Pass 1's two spec findings are closed. Three failure messages still describe the pre-fix defect rather than the rule they hold. The likeliest regression, dropping the inline gap and falling back to `.row`'s 8px, would report "a raw 6px apart".

The working tree now holds three change sets, and one of them changed while this review ran. Besides pass 1's Your-portfolio set, a fence-calculator-on-Tools set is in progress. Its CSS is scoped to `.fs-tool` and print, so the captures still measure this fix alone, but the recorded typecheck, guard and unit runs predate it.

At 390 the first record starts at 640 of 664px. That trade-off stays with Reddy, alongside audit item 1.

<details>
<summary>Issues (4)</summary>

1. **Live second session in the same tree** (non-blocking; confirmed that the tree moved, attribution likely). Seven files changed after the last recorded check, some during this review. Stage only `apps/web/src/w360/pages/CombinedProperty.tsx` and `tests/e2e-app/specs/28-combined-overview.spec.ts`; staging `w360.css` or `Vault.tsx` would ship other sessions' work under this audit. Just before committing, re-run the typecheck, the `scripts/*-tests.ts` loop and `bun test apps/web/src`. Where practical, run them on HEAD plus those two files only; a temporary `git worktree` does that without touching the live session's files. Never `git stash` or check out in the shared tree.
2. **Records below the phone fold** (non-blocking, confirmed, Reddy's decision). At 390 the first card starts at 640 of 664px, and its title is no longer on the first screen. Raise it with Reddy alongside audit item 1 or a 2×2 strip below 900px. No change belongs in this fix.
3. **Spec failure messages name the old defect** (non-blocking, confirmed). `28-combined-overview.spec.ts:75` and `:94` would misreport an 8px regression as "touches" and "a raw 6px apart". `:93` states the expectation instead of the failure. Reword each as the rule broken, the way `:91` does.
4. **HEAD's typography failure** (pre-existing, not this diff, confirmed). TY-5 fails on `apps/university/src/styles.css:1488`, `:1520` and `:1538` from `641ddb5`, and CI's guard loop stops on it. Leave it out of this commit; it needs its own fix before any commit on HEAD can pass CI.

</details>

<details>
<summary>Details</summary>

### What the re-capture shows at 1512 and 390

```
main  (flex column, row-gap normal = 0)
├─ crumbs · head · .tabs
└─ .stack.lg  (grid, row-gap 24px)
    ├─ .strip        1512: 275.4–378.2    390: 269.0–616.0
    │     24px
    └─ .cards        1512: 402.2–603.6    390: 640.0–1318.1    (gap 16px)
```

`verify/overview-{app,phone}.json` read the wrapper as `stack lg`, a direct child of `main`, with a computed row-gap of 24px. Strip bottom to first card top is 24.000px at both widths, the cards sit 16px apart, and nothing scrolls sideways. The seam and card screenshots at both widths show the band of page background under the strip and the spaced pair under the status line.

`overview-phone-top.png` also shows the cost (confirmed). The four stacked cells take 347px, and only the first card's top border shows above the 664px fold. In the audit's `evidence/overview-phone-top.png`, the "Sy 214/2" title showed there. Shrinking the stack to `--space-md` would win back 8px and erase the group-versus-card distinction the spec asserts. The real lever is telling the extent once (item 1) or a 2×2 strip below 900px, and both are Reddy's.

### Gate evidence and the one red guard

`verification.md` quotes a pass line for the typecheck, 16 of 17 guard scripts, `icon-guard.ts`, `ux-guards.ts`, `bun test apps/web/src` (85 pass), spec 28 in both projects (4 of 4) and spec 27 (25). A falsifiability run rejected the pre-fix spacing and each one-step slip. I ran none of these, because the record leaves no specific doubt. I checked these points statically:

- Both fix files predate the runs. `CombinedProperty.tsx` was last written at 18:46 and the spec at 19:15. The verify captures are from 19:20, and the last check ended at about 19:22.
- The TY-5 failure is HEAD's (confirmed). `git blame` puts `styles.css:1488`, `:1520` and `:1538` in `641ddb5`, and `apps/university` has no working-tree changes. `typography-tests.ts:43` appends "… and N more" only past 25 offenders, and the recorded output lists three with no suffix, so `apps/web` has none.
- CI won't pass this commit on its own (confirmed). `.github/workflows/ci.yml` and `nightly.yml` loop over `scripts/*-tests.ts` under `set -euo pipefail`.

### A live second session in the same working tree

Pass 1 found the 29/09 Your-portfolio set in the tree: `Dashboard.tsx`, `Properties.tsx`, `Vault.tsx`, `VillageMaps.tsx`, `17-villages.spec.ts`, and `.sec.sec-first` and `.vm-place` in `w360.css`. A third set appeared after this pass's checks, and it kept changing while this review ran (confirmed):

- `fenceBill.ts` (19:23) and `fence-tests.ts` (19:24), which `verification.md` names.
- `FenceStudio.tsx` (19:29), `FenceParts.tsx` (19:29), `Tools.tsx` (19:31), `w360.css` (19:31) and `19-sections-legacy.spec.ts` (19:32), which it doesn't. `FenceParts.tsx` replaced an untracked `FenceBill.tsx` that existed when this review began.

It's a fence calculator for the Tools tab (`fenceBill.ts`'s header names `/app/tools?tab=fence`), so it's likely another session's work. No changed line in `w360.css` touches `.stack`, `.row`, `.cards`, `.strip` or any `main` rule that applies to this tab, so the captures and spec runs still describe this fix alone.

Two consequences follow. First, `w360.css` now carries two other sessions' edits and none of this fix's. Second, the recorded typecheck, guard loop and unit run cover neither the commit as it will land (HEAD plus two files) nor the tree as it is now. A `git stash` or a checkout to isolate the commit would pull files out from under a session that is still writing them.

### Spec failure messages that name the old defect

Each failure message names the audit's pre-fix state, not the rule it holds (confirmed):

- `:75`, "the strip touches the record cards", fires for any gap under 16px, an 8px `.stack sm` included.
- `:94`, "the two buttons are a raw 6px apart", fires for any gap under 12px. The likeliest regression is dropping the inline `gap`, and that lands on `.row`'s own `--space-xs`, 8px.
- `:93`, "the pair is on one line", states the expectation, so a wrapped pair fails with a sentence that reads as a pass.

`:91` already has the right form ("closer than --space-md").

</details>

<details>
<summary>File map</summary>

This fix:

- `apps/web/src/w360/pages/CombinedProperty.tsx`: `CombinedOverview` wraps the strip and cards in `.stack lg` (:232), with a doc-comment paragraph on why. `MemberCard`'s action row moves from `.row tight` to `.row` with a `--space-sm` gap and a `--space-md` margin-top (:299). Unchanged since pass 1.
- `tests/e2e-app/specs/28-combined-overview.spec.ts` (new, untracked): a sealed spec for the strip-to-cards gap and the card button spacing, tagged `@phone` so it runs at 1512 and 390. Pass 2 moved it to place-based locators and a 16px floor above the buttons.

Task artifacts, not for commit: `.agents/tasks/combined-overview-ux-fix/` and `.local/ux-audits/2026-10-01-combined-overview/verify/`.

In the working tree but not part of this fix:

- The Your-portfolio set (29/09 board): `Dashboard.tsx`, `Properties.tsx`, `Vault.tsx`, `VillageMaps.tsx`, `17-villages.spec.ts`, and `.sec.sec-first` and `.vm-place` in `w360.css`.
- The fence-on-Tools set (still being edited): `Tools.tsx`, `FenceStudio.tsx`, `FenceParts.tsx`, `fenceBill.ts`, `scripts/fence-tests.ts`, `19-sections-legacy.spec.ts`, and the `.fs-tool` and print rules in `w360.css`.
- Older untracked files: `docs/architecture/2026-09-21-*` and `semantic-review/2026-09-23-*`.

Full diff of this fix: `git diff -- apps/web/src/w360/pages/CombinedProperty.tsx` plus `git diff --no-index /dev/null tests/e2e-app/specs/28-combined-overview.spec.ts`.

</details>
