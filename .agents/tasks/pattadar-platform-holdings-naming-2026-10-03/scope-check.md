# Scope check: feat/holdings (03/10/2026)

**Result: PASS, with notes.** Read-only. No files, index, commits or remotes were changed.

## 1. Commits contain only this feature

There are three commits on `feat/holdings` above `main` (`4a95ca4`). They match commit.md exactly: 3, 39 and 46 files.

- **8e1d6c0 (SortCycle):** `ui.tsx`, `Properties.tsx` and `Vault.tsx` only.
- **e80bd38 (web Holdings):**
  - The `Combined*` → `Holding*` renames, `Holdings.tsx`, `holdingList{,.test}.ts`, `holdingPath.ts`, routes, api, Shell, RecordHead.
  - Legacy `LandPropertiesPage` and `StakeDialog`, core `audit.ts`, the guards, the docs and the e2e specs.
  - Two `.kiro` reference lines (`system-map.md`, `web-heuristics.md`). Both are one-line Combined→Holding wording updates, so they are in scope.
- **c685d22 (iOS/Expo):**
  - iOS: the renames, importers, widgets, `Readiness`, and the README/design.
  - Expo: the route renames and redirects.
  - Guards (VOC-7, the Expo paths in ux-guards), TODO row 13, and the Maestro flow and README.
  - `DashboardCards.swift` matched the "Dashboard" filter. It holds only the `HoldingFilter`→`PropertyFilter` and `Holding`→`PropertyRecord` renames and "holdings"→"properties" copy, so it belongs here. It is not the web Dashboard.
- Nothing from `.agents/`, `.github/`, `Fence*`, `Tools`, `w360.css`, theme, tokens, palette or landing is in any commit. I checked with `git log main..HEAD --name-only`.

## 2. Unrelated edits stay uncommitted (`git diff -U0`)

- **`Vault.tsx`:** the region-note `info=` block and the files/folders count head are present and unstaged.
- **`Holding.tsx`:** the `.stack lg` wrapper and its comment, and the MemberCard `row` gap/marginTop with its comment, are present and unstaged.
- **`Properties.tsx`:** only the `0.5rem`→`0.375rem` subtitle margin is unstaged.
- **Other dirty files are untouched.** That covers CI yml, `.kiro` skills, Dashboard, Fence*, Tools, Groups, VillageMaps, the canvases, `w360.css`, theme/tokens/palette, landing/ThemeSamples, `parity-map.json`/`parity-check.ts`, `design.md`, TODO, and e2e 01/02/07/09/17/19/24 and screens.
- The index is clean. `git diff --stat` shows 69 files, +4318/−3184, which matches commit.md.
- **Untracked files:** `.agents/`, `.worktrees/`, the theme/groups/fence/homeGaps files, and `tests/e2e-app/specs/28-holding-overview.spec.ts`.

## 3. Nothing pushed

- `feat/holdings` has no upstream (`git rev-parse @{u}` → "no upstream configured").
- No `refs/remotes` ref matches `holding`.
- The reflog shows only branch creation from HEAD and the three commits.
- No network call was made. A `git ls-remote` attempt was cancelled before it returned.

## Notes (not violations)

1. **Spec 28 is still untracked.** `tests/e2e-app/specs/28-holding-overview.spec.ts` stays out on purpose (commit.md deviation 3). Committed `docs/specs/2026-09-25-combined-properties.md` names `28-holding-overview`, so that note points at a file that is not on the branch until spec 28 is committed with the `.stack lg`/MemberCard spacing change.
2. **The unstaged `parity-map.json` diff belongs to the palette work.** It rewrites the theme to pack roles and has no holdings or property naming. The committed parity map has no stale `Holdings*` iOS file names.
3. **The unstaged Groups diff has a tab-id change.** It changes the Groups in-page tab id `'holdings'`→`'properties'` as part of the TabStrip work. It belongs to that other task, not this rename. Commit it with the TabStrip work.
4. **Old names remain in dated history.** `HoldingsScreen` stays in the 2026-08-14 iOS offline spec, and `(tabs)/holdings.tsx` stays in a 2026-07-29 plan. The `createCombinedProperty` GraphQL names are kept by design. These are historical evidence and server contract names, not leaks.
