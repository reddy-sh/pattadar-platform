# Commit step: Holdings feature (03/10/2026)

Branch `feat/holdings`, cut from `main` at `4a95ca4`. Nothing was pushed, no other branch was touched, and the working tree was never written. Only the index changed.

```
c685d22 (HEAD -> feat/holdings) refactor: iOS/Expo property naming and wording
e80bd38 feat(web): Holdings list with shared page chrome; rename Combined views to Holdings
8e1d6c0 feat(web): shared SortCycle sort chip for Properties and Documents
4a95ca4 (main, …) fix(network): value-free GraphQL error logs; merge legal card, add valuers
```

## How the commits were staged

- First, the index's 14 `git mv` renames were reverse-applied with `git apply --cached -R`, so the index matched HEAD. The pre-step index tree `5700084` was recorded.
- Every hunk came from `git diff -U0` of the worktree against that original index. Each commit's index content was built by applying only the selected hunks, then written as `/tmp/hold-cN-{renames,content}.patch` and applied with `git apply --cached`. Renames went in as pure rename patches.
- No `git add -A`, `git add .`, `-i` or `-p` was used.
- Three hunks were narrowed, never rewritten:
  - In `ui.tsx` (C1), only the 17 `SortCycle` lines were taken out of the hunk that also adds TabStrip.
  - In `design.md` (C2), only the "Holding approved by Reddy" line was taken from the hunk that also adds the Safeguard rows.
  - In `TODO-one-platform.md` (C2), row 4 got only the `CombinedProperty.tsx` → `Holding.tsx` path change. The TabStrip "Done" text stays unstaged.
- In C1, Vault's import line carries `SortCycle` only. C2 brings it to its final form with `HOLDING_WORD`.

## What each commit holds (`git show --stat`)

- **8e1d6c0, 3 files:**
  - `ui.tsx`: `SortCycle`.
  - `Properties.tsx` and `Vault.tsx`: the sort chip adopts it, plus the import.
- **e80bd38, 39 files:**
  - The web renames (`Combined*.tsx` → `Holding*.tsx`, `Combined.tsx` → `Holdings.tsx`), `holdingList{,.test}.ts` and `holdingPath.ts`.
  - `routes.tsx`, without the theme-samples hunks. `api.ts`.
  - `Shell.tsx`, only the `HOLDING_WORD` import and the rail entry.
  - `RecordHead.tsx`. `Properties.tsx` (combine hint, `CloseOutlined`, link). `Vault.tsx`, without the region-note/count head.
  - `ui.tsx` (`HOLDING_WORD` and a comment). Legacy `LandPropertiesPage` and `StakeDialog`. Core `audit.ts` and its test.
  - `vocab-tests.ts` (VOC-0..6). `ux-guards.ts` (Holding frame checks). `shared-components-tests.ts` (budget paths only).
  - `design.md` (vocabulary rows, the approval line and two "Holding tab" mentions). The 2026-09-25 spec, TODO rows 4, 6 and 8, the QA register and onboarding, `system-map.md`, and `web-heuristics.md` (one line).
  - e2e specs: 04, 11c, 19 (only the legacy "first property" test), 24 (only the rail label), 26, 27 (renamed), 29 (new), and e2e-web360 `holdings` and `ux-record-holding` (renamed).
- **c685d22, 46 files:**
  - `apps/ios` (4 renames, importers, widgets, `Readiness.swift` and its test, README and design.md).
  - `apps/mobile`: 2 renames, plus the `holdings.tsx` and `holding/[id].tsx` redirects and the href call sites.
  - `ux-guards.ts` (Expo paths, CL-610 on `property/[id].tsx`) and `vocab-tests.ts` (VOC-7).
  - TODO row 13. `tests/e2e-mobile` flow and README.

## Deviations from the plan, for Reddy

1. **C1 is narrower than its suggested title.** The list chrome from run 1 sits on the same lines as the rename in the moved `Holdings.tsx`/`holdingList.ts`, so it cannot be split out. C1 is only the `SortCycle` lift, and it typechecks alone. The list chrome is in C2, and both commit titles say what each holds. The plan allowed this fold.
2. **The legacy web wording is in C2, not C3.** The widened VOC-3 scans `apps/web/src/pages`, so `LandPropertiesPage` and `StakeDialog` must land with it, or the C2 guard fails. Spec 19's legacy test went with them. Only the VOC-7 block of `vocab-tests.ts` is in C3. The header comment that names VOC-0..7 is in C2.
3. **`tests/e2e-app/specs/28-holding-overview.spec.ts` was left untracked.** Two of its three tests check the `.stack lg` and MemberCard spacing, which is the other task's unstaged change, and would fail on these commits. The third, the old `/app/combined` member link, belongs to this feature. Committing the file whole would ship other work, and committing part of it would mean writing new content, so it stays out. The redirect is still covered by the `holdingList.test.ts` unit test and the list-redirect test in 29. The 2026-09-25 spec note names `28-holding-overview`, so commit spec 28 together with the spacing change.
4. `screens.spec.ts`, which the run-1 file map listed, now differs only by theme `data-scheme` hunks. It was not committed.

## Left uncommitted on purpose (checked in `git diff` after the commits)

- `Vault.tsx`: the region-note `info=` and the files/folders count head (14 lines).
- `Holding.tsx`: the `.stack lg` wrapper and its comment, and the MemberCard button-row spacing (15 lines).
- `Properties.tsx`: the 0.375rem subtitle margin (1 line).
- Every other dirty file, untouched, including Dashboard, Fence*, Tools, Groups, VillageMaps, MapCanvas, VillageCanvas, `w360.css`, theme/tokens/palette, landing/ThemeSamples, CI yml, the TabStrip and theme hunks in `ui.tsx`, `Shell.tsx`, `routes.tsx`, `shared-components-tests.ts`, `design.md`, TODO, 19 and 24, `.kiro` skill work, the other specs and the untracked theme/groups/fence/homeGaps files.
- All of `.agents/`.

After the commits: the index is clean, and `git diff --shortstat` reads 69 files, +4318/−3184. `git status --short` went from 167 lines to 98.

## Checks on the staged content alone (throwaway worktree at HEAD plus `git diff --cached`; removed after each run)

The worktree linked to this worktree's own `packages/core` and `packages/tokens`, not the repo's dirty copies.

| Gate | base (HEAD) | C1 | C2 | C3 |
|---|---|---|---|---|
| `apps/web` tsc | pass | pass | pass | pass |
| `packages/core` tsc | pass | pass | pass | pass |
| `apps/mobile` tsc | — | — | — | pass |
| PattadarKit `swift test` | — | — | — | 209 pass |
| `bun test apps/web/src/w360 packages/core/src/format` | 209 pass | 209 pass | 217 pass | 217 pass |
| `scripts/*-tests.ts` + `ux-guards.ts` | all pass but TY-5 | same | same | same |

- **TY-5** (`typography-tests.ts`) already fails on `4a95ca4` with nothing applied. It is not introduced by these commits.
- **`a11y-web-tests.ts` M3-6** passes on every commit. The red the review saw comes only from the uncommitted `site.css` work.
- **Not run here:** the iOS app build (xcodebuild), e2e-app, e2e-web360 and Maestro. The review's verification.md has those results for the working tree.

## Secret scan (`.kiro/skills/secret-scan`)

Gitleaks 8.30.0 ran `git diff --cached --binary | gitleaks stdin --redact` before each commit, with a staged-filename check for `.env*`, `.local/`, `*.pem`, `*-key.env`, `*.tfvars`, credentials and `.agents/`.

| Commit | Scanned | Result |
|---|---|---|
| C1 | ~4.8 KB | no leaks, no flagged names |
| C2 | ~196 KB | no leaks, no flagged names |
| C3 | ~174 KB | no leaks, no flagged names |

Unstaged and untracked content was not in scope.

## Hooks

Hooks were not skipped. `core.hooksPath=.githooks` has only `post-commit`, which hands web commits to `scripts/ios-parity-sync.sh`. A stale `.parity/lock` dated 20/09 is present, so the hook only queued each sha in `.parity/queue` (gitignored). It started no process and changed no files.
