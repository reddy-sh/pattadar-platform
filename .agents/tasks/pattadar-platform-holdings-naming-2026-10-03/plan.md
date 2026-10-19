# Implementation Plan: holding file/identifier/route naming, iOS/Expo/legacy property wording, verification gaps

Repo: `/Users/reddy.sh/reddy.sh/projects/pattadar-platform`. Work in place on `main` (no worktree). Approved by Reddy on 03/10/2026, items A–F. Do not re-litigate them.

Prior context: `.agents/tasks/pattadar-platform-holdings-rename-2026-10-03/{plan,verification,review}.md` and `.agents/tasks/pattadar-platform-combined-views-standardize-2026-10-27/`.

Loop stop contract: the reviewer writes `.agents/tasks/pattadar-platform-holdings-naming-2026-10-03/review.json` with `{"verdict": "APPROVED" | "CHANGES_REQUESTED", ...}`. Record evidence in `.agents/tasks/pattadar-platform-holdings-naming-2026-10-03/verification.md`.

## Ground rules (the shared, dirty tree)

- **Leave other work alone.** About 109 unrelated changes are in the tree, and other agents may be editing at the same time. While exploring, `routes.tsx` line numbers shifted. So:
  - Re-read a file right before editing it.
  - Anchor `str_replace` on symbols, not line numbers.
  - Never revert, reformat, `git checkout`, `git stash` or `git add` anything.
  - Nothing is staged until the commit step. After `git mv`, the index holds only the renames; leave it that way.
- **Dirty files this task touches.** They also carry hunks from other tasks. Edit only the targeted lines:
  - `routes.tsx`, `Shell.tsx`, `api.ts`, `ui.tsx`, `Properties.tsx`, `RecordHead.tsx`, `Vault.tsx`
  - `Combined*.tsx`
  - `design.md`, `docs/specs/2026-09-25-combined-properties.md`
  - `scripts/vocab-tests.ts`, `scripts/shared-components-tests.ts`
  - `tests/e2e-app/specs/{04,11c,24,27}`
  - `tests/e2e-web360/specs/{combined,ux-record-combined}.spec.ts`
- **Clean files.** `apps/ios/**`, `apps/mobile/**`, `scripts/ux-guards.ts`, `apps/web/src/pages/LandPropertiesPage.tsx`, `packages/core/src/format/audit.ts`, `docs/qa/*` and `tests/e2e-mobile/*` are clean at HEAD.
- **How to rename.**
  - Tracked files use `git mv old new`.
  - Untracked files use plain `mv`, because `git mv` refuses them: `apps/web/src/w360/combinedList.ts`, `combinedList.test.ts`, `tests/e2e-app/specs/28-combined-overview.spec.ts` and `29-combined-list.spec.ts`. Rename detection happens at commit time, so history follows either way.
  - After renaming, run `git status --short` and confirm no old path has reappeared (a concurrent writer could recreate one). If one has, stop and report it.

## Decisions (made here; do not re-decide)

1. **Server boundary stays `combined`.** The following do not change:
   - GraphQL operation text, field names, operation names and argument names (`combinedProperties`, `combinedProperty`, `combinedPapers`, `combinedFmb`, `combinedExpenses`, `createCombinedProperty`, `updateCombinedProperty`, `setCombinedMembers`, `deleteCombinedProperty`, `saveCombinedExpense`, `deleteCombinedExpense`, `addJointFmb(combinedId:)`, `orders(combinedId:)`).
   - `Wrapped<'combined…'>` keys and `.web.combined…` reads.
   - Response fields `combinedSpend`, `combinedId` and `combinedName` (on RecordCard).
   - Mutation variable key `combinedId`.
   - Server values `kind === 'combined'` (vault link) and `scope === 'combined'` (expense row).
   - Audit action keys `create_combined_property` etc. Their labels do change.
   - TanStack query keys `[KEY, 'combined' …]`, `'combined-papers'`, `'combined-fmb'`, `'combined-expenses'`, `'combined-orders'`.
   - The sealed fixture key `combinedProperties` in `tests/e2e-app/fixtures/seed.ts` and in `world.set('combinedProperties', …)`.
   - Everything in `services/api`.
   - **Boundary comments.** Add one line above the `// ── Combined properties ──` section in `apps/web/src/w360/api.ts` (retitle it `// ── Holdings ──`): "Server contract: GraphQL fields/args, response fields, query keys and the `combined_*` tables keep the server's `combined` name; only web identifiers say Holding (Reddy, 03/10/2026)." Add the same one-liner beside Vault's `l.kind === 'combined'` uses.
2. **Web TS names.**
   - The api.ts interface `Combined` becomes **`HoldingCard`**, not `Holding`. The frame component in `Holding.tsx` is called `Holding` (mirroring `Record.tsx`/`Record`), and a same-named type would collide. `HoldingCard` parallels `RecordCard`.
   - Before editing, confirm that `grep -rnw HoldingCard apps/web/src` is empty.
3. **Page file names follow the Record pattern.** `pages/Combined.tsx` → `pages/Holdings.tsx` (the list) and `pages/CombinedProperty.tsx` → `pages/Holding.tsx` (the frame), plus `Holding{Actions,Ledger,Fmb}.tsx`.
4. **Verbs stay.** `canCombine`, `CombineDialog`, the `?combine=1` param, `combineHint`, `dropCombine`, "Combine…" and the "Combined map" tab label are about the verb or the map, so they are unchanged. `JointFmbDialog` and `JointOutlinesDialog` are unchanged.
5. **Routes.**
   - The canonical routes are `/app/holdings` and `/app/holdings/:id/{surveys,papers,fmb,expenses,services}`.
   - Old links redirect through one component in `routes.tsx`:
     ```tsx
     /** `/app/combined…` was the Holdings address until 03/10/2026. Bookmarks and
      *  shared links keep working: the id, the tab, the query and the hash ride along. */
     function FromCombined() {
       const { pathname, search, hash } = useLocation();
       return <Navigate to={`${holdingsPathFrom(pathname)}${search}${hash}`} replace />;
     }
     ```
     It is registered as `{ path: 'combined', element: <FromCombined /> }` and `{ path: 'combined/*', element: <FromCombined /> }` under `/app`, after the holdings routes. It sits inside `RequireAuth`, the same as today.
   - `holdingsPathFrom(pathname)` is a pure function in `holdingList.ts`: `pathname.replace(/^\/app\/combined(?=\/|$)/, '/app/holdings')`. It is unit-tested.
   - Nothing outside apps/web generates `/app/combined`. Verified: `git grep "app/combined"` hits only web source, specs and docs.
6. **Vault facet key.**
   - Investigation shows Vault's facets are in-memory React state only (`useState<Facets>(NO_FACETS)`). Vault reads only `do` and `folder` from the URL, and nothing writes the facets to localStorage. **No `combined` URL key exists, so there is nothing to dual-read.**
   - Rename the internal `FacetKey` `'combined'` → `'holding'` (in `NO_FACETS`, `FACET_WORD`, the facet group `key` and `facets.holding`).
   - Leave a comment that facets are not URL-persisted. If a URL key is ever added, it must also accept `combined` on read.
   - Record this finding in `verification.md` so the reviewer does not flag the missing dual-read.
   - The Holdings list URL keys (`complete`, `ground`, `land`) are unchanged.
7. **iOS: rename the app-target view types and files that mean a single property.**
   - The persisted and contract identities stay:
     - PattadarKit public API: `HoldingKind` (Codable raw values, and the twin of core `HoldingKind`), `HoldingIdentity`, `AssessedHolding`/`assessHoldings`, `HoldingsResponse`, `HoldingLine` (in the app-group snapshot), `HoldingShare`.
     - Widget `kind: "PattadarHolding"` and the AppIntent/AppEntity types `HoldingWidget`, `HoldingEntity`, `HoldingQuery`, `PickHolding`, `HoldingEntry`, `HoldingProvider` and `HoldingWidgetView`. Renaming an intent or entity type can drop users' configured widgets, so the file `PattadarWidget/HoldingWidget.swift` stays too.
     - The deep-link tokens `holding` and `holdings` in `SharedSnapshot.swift`, which are URLs already installed in widgets and notifications.
     - `AppModel.requestAddHolding` / `pendingHolding`.
     - Every `@AppStorage` / `UserDefaults` key string.
     - Local variable names.
   - User-facing "holding" that means a property or parcel is reworded everywhere, including the widgets and PattadarKit `Readiness.swift`.
   - The Holdings feature is NOT added to iOS. The project is XcodeGen with `sources: [Pattadar/Sources, Shared]` directories (`project.yml`), and `.xcodeproj` is gitignored. Renaming files therefore needs **no** project.yml or pbxproj edit.
8. **Expo.**
   - Rename only the route files plus their default-export names. Add redirect routes outside `(tabs)` so they never become tabs.
   - `src/data/holdings.ts`, the local component names and the query key `['pattadar','holdings']` stay; they are follow-ups.
   - Typed routes are configured, but `.expo/types` is absent, so typecheck does not validate hrefs. Every href must be fixed by hand and re-grepped.
9. **Legacy web.**
   - Reword the visible copy on `/legacy/parcels` (`LandPropertiesPage.tsx`) and its `StakeDialog` title only.
   - Do not rename the legacy files `pages/holdings/*`, `components/holdingCards.tsx`, or `data/hooks.ts` `useHoldings`/`HoldingProperty`. They are follow-ups; `data/hooks.ts` is in the parity "adapt" band.
   - `PricingPage`/`pricingContent.ts` "A holding is one land parcel…" is a commercial plan definition. Flag it for Reddy and do not edit it.
10. **Commits are by surface, not by run.** The three prior runs edited the same lines (for example, run 1 added `COMBINED_SORTS` and this run renames it). A run-by-run split would need synthesized, never-tested intermediate blobs. See § Commit step.

## Plan

- [ ] 1. **Web renames: list helpers.**
      - `mv apps/web/src/w360/combinedList.ts apps/web/src/w360/holdingList.ts` and `mv apps/web/src/w360/combinedList.test.ts apps/web/src/w360/holdingList.test.ts` (both untracked).
      - Rename the exports:

        | Old | New |
        |---|---|
        | `COMBINED_PARAM` | `HOLDING_PARAM` |
        | `CombinedFacet` | `HoldingFacet` |
        | `combinedFacets` | `holdingFacets` |
        | `matchesCombined` | `matchesHolding` |
        | `CombinedSortKey` | `HoldingSortKey` |
        | `COMBINED_SORTS` | `HOLDING_SORTS` |
        | `sortCombined` | `sortHoldings` |
        | `combinedSummary` | `holdingSummary` |
        | `combinedCsvRows` | `holdingCsvRows` |
        | `filteredEmptyNote` | unchanged |

      - Add `export function holdingsPathFrom(pathname: string): string` (Decision 5).
      - Rename the test's imports and `describe` names. Add a test covering `/app/combined` → `/app/holdings`, `/app/combined/cp-1` → `/app/holdings/cp-1`, `/app/combined/cp-1/papers` → `/app/holdings/cp-1/papers`, and that `/app/combinedx` is unchanged.
      - In the same item, update the type import to `HoldingCard` once item 2 lands. Do items 1–4 as one change set before typechecking.
      Files: `apps/web/src/w360/holdingList.ts`, `apps/web/src/w360/holdingList.test.ts`.
      Verify: `bun test apps/web/src/w360/holdingList.test.ts` passes (after item 2).

- [ ] 2. **Web api.ts identifiers (server names kept).** In `apps/web/src/w360/api.ts`, rename only the TS identifiers.
      - **Types:**

        | Old | New |
        |---|---|
        | `Combined` | `HoldingCard` |
        | `CombinedMember` | `HoldingMember` |
        | `CombinedPaper` | `HoldingPaper` |
        | `CombinedSurveyShape` | `HoldingSurveyShape` |
        | `CombinedJointSheet` | `HoldingJointSheet` |
        | `CombinedRelation` | `HoldingRelation` |
        | `CombinedFmb` | `HoldingFmb` |
        | `CombinedExpenseRow` | `HoldingExpenseRow` |
        | `CombinedExpenseView` | `HoldingExpenseView` |
        | `CombinedOrder` | `HoldingOrder` |

      - **Private constants:**

        | Old | New |
        |---|---|
        | `COMBINED_FIELDS` | `HOLDING_FIELDS` |
        | `COMBINED_MEMBER_FIELDS` | `HOLDING_MEMBER_FIELDS` |
        | `Q_COMBINED_LIST` | `Q_HOLDING_LIST` |
        | `Q_COMBINED` | `Q_HOLDING` |
        | `Q_COMBINED_PAPERS` | `Q_HOLDING_PAPERS` |
        | `Q_COMBINED_FMB` | `Q_HOLDING_FMB` |
        | `Q_COMBINED_EXPENSES` | `Q_HOLDING_EXPENSES` |

        Their string contents do not change.
      - **Hooks:**

        | Old | New |
        |---|---|
        | `useCombinedProperties` | `useHoldings` |
        | `useCombined` | `useHolding` |
        | `useCombinedPapers` | `useHoldingPapers` |
        | `useCombinedFmb` | `useHoldingFmb` |
        | `useCombinedExpenses` | `useHoldingExpenses` |
        | `useCombinedOrders` | `useHoldingOrders` |
        | `useCreateCombined` | `useCreateHolding` |
        | `useRenameCombined` | `useRenameHolding` |
        | `useSetCombinedMembers` | `useSetHoldingMembers` |
        | `useDeleteCombined` | `useDeleteHolding` |
        | `useSaveCombinedExpense` | `useSaveHoldingExpense` |
        | `useDeleteCombinedExpense` | `useDeleteHoldingExpense` |

      - Keep everything in Decision 1, including the query keys.
      - Add the boundary comment.
      - Fix the doc comments that name renamed identifiers. ":2815 'so a combined view is…'" becomes "so a holding is…".
      Files: `apps/web/src/w360/api.ts`.
      Verify: done with items 3–4 (one typecheck).

- [ ] 3. **Web page renames.** Use `git mv` (tracked):
      - **`pages/Combined.tsx` → `pages/Holdings.tsx`.** Component `Combined` → `Holdings`, with `export default Holdings`. Update the imports to `useHoldings`, `holdingList` names and `HOLDING_PARAM`.
        - Change the links `/app/combined/${c.id}` → `/app/holdings/${c.id}`.
        - Rename locals `combined`→`holdings` and `c` where they name the list.
      - **`pages/CombinedProperty.tsx` → `pages/Holding.tsx`:**

        | Old | New |
        |---|---|
        | `CombinedProperty` | `Holding` (+ default) |
        | `CombinedOverview` | `HoldingOverview` |
        | `CombinedSurveys` | `HoldingSurveys` |
        | `useCombinedCtx` | `useHoldingCtx` |
        | `COMBINED_TABS` | `HOLDING_TABS` |
        | `tabForCombined` | `tabForHolding` (split on `'/app/holdings/'`) |
        | internal `CombinedHead` | `HoldingHead` |
        | internal `CombinedTabs` | `HoldingTabs` |

        - Every `/app/combined` becomes `/app/holdings`: the crumbs, the tab `NavLink`s, the nav after delete, and the expenses links. There are 10 hits.
        - The prop or local `combined` becomes `holding`.
        - Keep the other task's unrelated hunks (the `.stack lg` wrapper, MemberCard button spacing) exactly as they are.
      - **`pages/CombinedActions.tsx` → `pages/HoldingActions.tsx`:**
        - `CombinedEditDialog` → `HoldingEditDialog`, `CombinedDeleteDialog` → `HoldingDeleteDialog`, `CombinedExpenseDialog` → `HoldingExpenseDialog`.
        - The prop `combined` → `holding` on these and on `JointFmbDialog` / `JointOutlinesDialog`.
        - `canCombine` and `CombineDialog` stay.
      - **`pages/CombinedLedger.tsx` → `pages/HoldingLedger.tsx`:** `CombinedPapersTab` → `HoldingPapersTab`, `CombinedExpensesTab` → `HoldingExpensesTab`, `CombinedServicesTab` → `HoldingServicesTab`. Its `/app/combined` link becomes `/app/holdings`. `r.scope === 'combined'` stays.
      - **`pages/CombinedFmb.tsx` → `pages/HoldingFmb.tsx`:** `CombinedFmbTab` → `HoldingFmbTab` (+ default).
      Files: the five renamed pages.
      Verify: done with item 4.

- [ ] 4. **Web importers, routes and the redirect.**
      - **`apps/web/src/routes.tsx`:**
        - Change the lazy imports to `./w360/pages/Holdings|Holding|HoldingFmb|HoldingLedger`, with the consts renamed: `W360Holdings`, `W360Holding`, `W360HoldingOverview`, `W360HoldingSurveys`, `W360HoldingFmb`, `W360HoldingPapers`, `W360HoldingExpenses`, `W360HoldingServices`.
        - Change the route paths to `holdings` and `holdings/:id`, with the same six children.
        - Add `FromCombined` with its two routes (Decision 5) and import `holdingsPathFrom`. `Navigate` and `useLocation` are already imported (`ToTools`).
        - Refresh the route comment.
      - **`apps/web/src/w360/Shell.tsx`:** the rail entry `to: '/app/holdings'`.
      - **`apps/web/src/w360/pages/RecordHead.tsx`:** the crumbs go to `/app/holdings` and `` `/app/holdings/${rec.combinedId}` ``. The field name stays.
      - **`apps/web/src/w360/pages/Properties.tsx`:**
        - `import { CombineDialog } from './HoldingActions'`.
        - The post-create `nav(`/app/holdings/${id}`)`.
        - Touch nothing else (the 0.375rem subtitle hunk belongs to another task).
      - **`apps/web/src/w360/pages/Vault.tsx`:**
        - Imports `useHoldings`, `HoldingCard`.
        - `RecordMultiPick` prop `combined` → `holdings`, and `matches.combined` → `matches.holdings`.
        - The link `` `/app/holdings/${property.id}` ``.
        - Locals: `combinedViews` → `holdingsQuery`, `combinedList` → `holdingRows`, `combinedOf` → `holdingsOf`. `combined` (in the picker) → `holdings`.
        - FacetKey `'combined'` → `'holding'` (Decision 6), plus the comment.
        - The comment ":737 combined views are not one" → "holdings are not one".
        - Leave the other task's region-note/count head hunk alone.
      - **`apps/web/src/w360/ui.tsx`** (comments only):
        - :681 "RecordTabs / CombinedTabs" → "RecordTabs / HoldingTabs".
        - The `HOLDING_WORD` doc comment: "Routes, GraphQL fields and identifiers keep `combined`" → "Web files, identifiers and routes say holding (`/app/holdings`; old `/app/combined…` links redirect); GraphQL fields, query keys and tables keep `combined`."
      - Finish with this sweep:
        ```
        grep -rnE "Combined[A-Z]|\bCombined\b|combinedList|COMBINED_|useCombined|app/combined|tabForCombined|useCombinedCtx" apps/web/src
        ```
        The allowed residue is the server names in Decision 1, `holdingsPathFrom`'s regex and the `FromCombined` redirect, and comments in files not otherwise touched (`w360.css`, `PortfolioCanvas.tsx`, `skeletons.tsx`, `BoundaryMeasurementsCard.tsx`, `surveyBoundaryLayer.ts`, `RecordPhotos.tsx`, `RecordFeatures.tsx`, `Dashboard.tsx`, `RecordPapers.tsx` "Combined quote"). Leave those so no new hunks land in other tasks' dirty files.
      Files: `routes.tsx`, `Shell.tsx`, `RecordHead.tsx`, `Properties.tsx`, `Vault.tsx`, `ui.tsx`, plus items 1–3.
      Verify:
      - `cd apps/web && bun run typecheck` → rc 0.
      - `bun test apps/web/src` → 0 fail (prior baseline was 348 pass; expect that plus the new holdingsPathFrom test).

- [ ] 5. **Audit labels in packages/core** (user-visible "combined view" left over from the rename). In `packages/core/src/format/audit.ts`, keep the keys and change the values:

      | Key | New label |
      |---|---|
      | `create_combined_property` | 'Created a holding' |
      | `update_combined_property` | 'Edited a holding' |
      | `delete_combined_property` | 'Deleted a holding' |
      | `set_combined_members` | 'Changed the records in a holding' |
      | `add_combined_expense` | 'Recorded a holding cost' |
      | `delete_combined_expense` | 'Removed a holding cost' |

      - Update the :35 comment ("members of a combined view" → "members of a holding") and the `audit.test.ts:74` comment.
      - If any test asserts the old labels, update it.
      Files: `packages/core/src/format/audit.ts`, `packages/core/src/format/audit.test.ts`.
      Verify: `bun test packages/core` → 0 fail.

- [ ] 6. **Guards, parity and docs for the web rename.**
      - **`scripts/shared-components-tests.ts`:**
        - Budget keys :112-113 → `apps/web/src/w360/pages/HoldingLedger.tsx` and `apps/web/src/w360/pages/Holding.tsx`.
        - The OWNER text :57 → "RecordTabs/HoldingTabs".
      - **`scripts/ux-guards.ts`** (web block ~:971-1002):
        - `code('apps/web/src/w360/pages/Holding.tsx')`.
        - Rename `combinedFrame` → `holdingFrame` and `combinedTabBlock` → `holdingTabBlock`.
        - Split on `'export const HOLDING_TABS'`.
        - The messages say "holding tabs" and "six Holding tabs".
      - **`scripts/vocab-tests.ts`:**
        - VOC-5 reads `apps/web/src/w360/pages/Holdings.tsx`.
        - VOC-2 also scans `packages/core/src` (`walk(join(ROOT,'packages/core/src'), /\.tsx?$/)`) so the audit labels stay fixed.
        - Add **VOC-6**: `routes.tsx` (comments stripped) declares `path: 'holdings'` and `path: 'holdings/:id'`, keeps a `path: 'combined/*'` redirect, and `/app/combined` appears nowhere else in `apps/web/src` outside comments. The allowed residue is `holdingList.ts` (`holdingsPathFrom`) and `routes.tsx`.
        - Update the header comment (VOC-0..6).
      - **`scripts/parity-map.json`:** it has no Combined or Holding path entries (verified), so it needs no edit. Its `apps/web/src/w360/` "note" band covers the new files.
      - **`design.md`:**
        - :411 → "Holding approved by Reddy on 03/10/2026 … Web files, identifiers and routes say holding (`/app/holdings`; `/app/combined…` redirects); GraphQL fields, operations, query keys and the `combined_*` tables keep `combined` (server contract). `scripts/vocab-tests.ts` (VOC-1..6) holds the web to it."
        - :581 "Every active Record and Combined frame" → "Record and Holding frame".
        - :529 `holdingCards.tsx` stays (it is a legacy file).
      - **`docs/specs/2026-09-25-combined-properties.md`:** the dated historical spec keeps its name and body. Add one note at the top of § Screens: "Renamed in code 03/10/2026 (Reddy): `pages/Combined.tsx` → `Holdings.tsx`, `CombinedProperty.tsx` → `Holding.tsx`, `Combined{Actions,Ledger,Fmb}.tsx` → `Holding*`, `combinedList.ts` → `holdingList.ts`; routes `/app/holdings[/:id]`, old `/app/combined…` links redirect; e2e specs `27-holding-map`, `28-holding-overview`, `29-holdings-list`, e2e-web360 `holdings.spec.ts`, `ux-record-holding.spec.ts`. GraphQL/API/tables keep `combined`."
      - **`docs/specs/TODO-one-platform.md`:**
        - :55 `CombinedProperty.tsx` → `Holding.tsx`.
        - :57 and :59 `CombinedLedger`/`CombinedActions` → `HoldingLedger`/`HoldingActions`.
        - :64 `holding/[id]` → `property/[id]`.
      - **`docs/qa/test-fail-register.md` (:75, :129, :161, :227, :520) and `docs/qa/tester-onboarding.md:125`:** `ux-record-combined` → `ux-record-holding`. The line numbers are unchanged, because `git mv` keeps the content.
      - **`.kiro/skills/architecture-trace/references/system-map.md:54`:** "combined properties (…)" → "holdings (`/app/holdings`; server `combined_*`) (…)".
      - **`.kiro/skills/heuristic-ux-audit/references/web-heuristics.md:161`:** "Record and Combined tab" → "Record and Holding tab".
      - `.kiro/skills/backend-contract-change/references/contract-map.md` stays, because it describes server names.
      Files: as listed.
      Verify:
      - `for s in scripts/*-tests.ts; do bun run "$s" || echo "FAIL $s"; done` → all PASS.
      - `bun run scripts/ux-guards.ts` → UX GUARDS PASS.
      - `bun run scripts/icon-guard.ts` → passes.
      - `python3 scripts/validate-agent-governance.py` → passes.
      - VOC-6 mutation test: temporarily add `const __p = '/app/combined';` to `Holdings.tsx`, confirm VOC-6 FAILs, then restore.

- [ ] 7. **Web e2e spec renames and content.**
      - **Renames:**
        - `git mv tests/e2e-app/specs/27-combined-map.spec.ts tests/e2e-app/specs/27-holding-map.spec.ts`
        - `mv …/28-combined-overview.spec.ts …/28-holding-overview.spec.ts`
        - `mv …/29-combined-list.spec.ts …/29-holdings-list.spec.ts`
        - `git mv tests/e2e-web360/specs/combined.spec.ts tests/e2e-web360/specs/holdings.spec.ts`
        - `git mv tests/e2e-web360/specs/ux-record-combined.spec.ts tests/e2e-web360/specs/ux-record-holding.spec.ts`
      - **Content:**
        - Every `goto`, `TAB` const and URL regex moves from `/app/combined` to `/app/holdings`: 27 (:2, :19), 28 (:2, :24), 29 (:2 and 8 gotos), `26-one-font.spec.ts:105`, `04-record-shell.spec.ts:545` (`/\/app\/holdings\/cp-katragunta$/`), and e2e-web360 `holdings.spec.ts` (13 hits) and `ux-record-holding.spec.ts` (5 hits). Header comments in those files follow.
        - The cross-reference comments in `ux-record-holding.spec.ts:49,71` (`combined.spec.ts` → `holdings.spec.ts`).
        - Keep `world.set('combinedProperties', …)`, `kind: 'combined'`, `combinedId` and `combinedName`. They are server-shaped fixtures.
      - **New redirect tests (sealed e2e-app):**
        - In `29-holdings-list.spec.ts`: "an old /app/combined link lands on Holdings with its query and hash". Goto `/app/combined?complete=missing&land=plot#top`, then expect the URL to match `/\/app\/holdings\?complete=missing&land=plot#top$/` and the H1 to be `Holdings`.
        - In `28-holding-overview.spec.ts`: "an old member link keeps its id and tab". Goto `/app/combined/${CP}/papers?x=1`, then expect the URL to match `` new RegExp(`/app/holdings/${CP}/papers\\?x=1$`) ``.
      - Sweep:
        ```
        grep -rn "app/combined" tests/e2e-app/specs tests/e2e-web360/specs
        ```
        Only the two redirect tests may match.
      Files: the specs listed.
      Verify: run in item 12.

- [ ] 8. **Legacy web wording (D).** These edits are in `apps/web/src/pages/LandPropertiesPage.tsx`, which is clean.
      - **Copy:**
        - :431 and :444 `eyebrow="Your holdings"` → `"Your properties"`.
        - :434 "Add your first holding" → "Add your first property".
        - :436 "＋ Add a holding" → "＋ Add a property".
        - :450 the chip `` `${n} holdings` `` → `` `${n} properties` `` (use `n === 1 ? 'property' : 'properties'` if the surrounding code has no plural helper).
        - :476 `StatCard label="Holdings"` → `"Properties"`.
        - :497 "Search holdings…" → "Search properties…".
        - :300 export stem `'pattadar-holdings'` → `'pattadar-all-properties'`. Confirmed that no test asserts it.
      - **`apps/web/src/pages/holdings/StakeDialog.tsx:66`:** "My stake in this holding" → "My stake in this property".
      - Leave the identifiers, the `useHoldings` import and the :3 comment.
      - **`scripts/vocab-tests.ts` VOC-3:**
        - Drop the `w360|components` filter so it scans all of `apps/web/src`, and match `/your holdings|add (a|your first) holding|search holdings/i`.
        - Rewrite its comment: legacy is now covered, and the pricing copy is a separate Reddy decision. Pricing never says "your holdings", so it still passes. Confirm that.
      Files: `LandPropertiesPage.tsx`, `pages/holdings/StakeDialog.tsx`, `scripts/vocab-tests.ts`.
      Verify:
      - `cd apps/web && bun run typecheck` → rc 0.
      - `bun run scripts/vocab-tests.ts` → PASS.
      - Temporarily revert one string, confirm VOC-3 FAILs, then restore.

- [ ] 9. **iOS file and type renames (B).** All in `apps/ios/Pattadar/Sources` via `git mv`:
      - **`HoldingsScreen.swift` → `PropertiesScreen.swift`:**

        | Old | New |
        |---|---|
        | `enum Holding` | `PropertyRecord` (because `Property` is the PattadarKit model) |
        | `HoldingFilter` | `PropertyFilter` |
        | `HoldingGrouping` | `PropertyGrouping` |
        | `HoldingSort` | `PropertySort` |
        | `HoldingsScreen` | `PropertiesScreen` |
        | `HoldingRow` | `PropertyRow` |
        | `HoldingHeroCard` | `PropertyHeroCard` |
        | `HoldingFilterSheet` | `PropertyFilterSheet` |

      - **`HoldingDetailScreen.swift` → `PropertyDetailScreens.swift`.** It holds both the parcel detail and the existing `PropertyDetailScreen`. `struct HoldingDetailScreen` (it takes a `Parcel`) → `ParcelDetailScreen`.
      - **`AddHoldingScreen.swift` → `AddFromScanScreen.swift`.** `AddHoldingScreen` → `AddFromScanScreen`. `AddPropertyScreen` already exists.
      - **`HoldingPhotosSection.swift` → `PropertyPhotosSection.swift`.** `HoldingPhotoGallery` → `PropertyPhotoGallery`, `HoldingPhotoStrip` → `PropertyPhotoStrip`.
      - **`DashboardCards.swift`:** `HoldingDestination` → `PropertyDestination`.
      - **Every reference** (whole-word `\bHolding\b` as a type, about 40 uses, plus the names above) in `PattadarApp.swift`, `HomeScreen.swift`, `SearchScreen.swift`, `YouScreen.swift`, `CustomiseTabsScreen.swift`, `DetailScreens.swift`, `FilingSheet.swift`, `PropertiesMap.swift`, `DashboardCards.swift` and the renamed files.
      - Do not touch the identifiers kept in Decision 7. Before starting, confirm there are no collisions: `grep -rnwE "PropertyRecord|ParcelDetailScreen|AddFromScanScreen|PropertyFilter|PropertySort|PropertyGrouping|PropertyDestination|PropertyRow|PropertiesScreen|PropertyHeroCard|PropertyFilterSheet|PropertyPhotoGallery|PropertyPhotoStrip" apps/ios --include='*.swift'` excluding `apps/ios/build` must show only `PropertyDetailScreen`, `AddPropertyScreen` and nothing from this list (verified empty at planning time).
      - **`apps/ios/design.md:40`:** "Holdings, the vault" → "Properties, the vault". :150 is a historical deletion record and stays.
      - `docs/specs/2026-08-14-ios-offline-architecture.md` is dated and historical, so it is left alone.
      Files: the four renamed Swift files plus the importers listed and `apps/ios/design.md`.
      Verify: done in item 10.

- [ ] 10. **iOS user-facing wording, its guard and the iOS checks (B).**
      - **Reword** every user-visible string where "holding" means a property or parcel. These hits were found at planning time:
        - **App screens:**
          - `PropertiesScreen.swift`: (was :485) "This holding is no longer on file." → "This property is no longer on file.", and :655 a11y "Add a holding" → "Add a property".
          - `AddDocumentSheet.swift:218` "…a paper, not a holding…" → "…a paper, not a property…".
          - `FamilyScreen.swift:19` "holding(s)" → "property/properties", and :98 `Fact(label: "Holdings"` → `"Properties"`.
          - `RecordShell.swift`: :184 "shared holding" → "shared property", :215 "Services for this holding" → "Services for this property", :671 "this kind of holding" → "this kind of property".
          - `OnboardingScreen.swift:132` "Add my first holding" → "Add my first property".
          - `DocumentsScreen.swift:990` "HOLDING(S)" → "PROPERTY/PROPERTIES".
          - `AddPassbookScreen.swift:70` "split one holding into two" → "split one parcel into two".
          - `PropertiesMap.swift`: :55 "holding(s) not on the map" → "property/properties not on the map", and :97 "Open a holding" → "Open a property".
          - `SetLocationScreen.swift:327` "this holding" → "this property".
          - `HoldersScreen.swift:100` "Add a holding" → "Add a property".
          - `DashboardCards.swift:169` "Owned holdings only" → "Owned properties only".
          - `DossierSections.swift:147` "this holding" → "this property".
          - `AttachDocumentSheet.swift` :52, :105, :107, :175, :182 "holding" → "property".
          - `AddFromScanScreen.swift` (was AddHoldingScreen): :89 "what kind of holding" → "what kind of property", :93 navigationTitle "Add a holding" → "Add a property", :188 "it lists several holdings" → "it lists several parcels", :213 "attach it to a holding" → "attach it to a property".
        - **Widgets (copy only):**
          - `HoldingWidget.swift`: configurationDisplayName "A holding" → "A property", `typeDisplayRepresentation` "Holding" → "Property", "Choose a holding" → "Choose a property", `@Parameter(title: "Holding")` → "Property".
          - `AttentionWidget.swift`: :91 "Every holding on file…" → "Every property on file…", and :131 "All holdings in order" → "All properties in order".
          - `LandWidget.swift:129` "Every holding…" → "Every property…".
        - **PattadarKit:** `Readiness.swift:141` "Every holding on file…" → "Every property on file…", and :149 the noun `holding`/`holdings` → `property`/`properties`. Update `PattadarKitTests/ReadinessTests.swift:82` `hasPrefix("1 holding")` → `"1 property"`. The test names may stay.
      - Re-grep for multi-line or interpolated strings: `grep -rnE '"[^"]*[Hh]olding' apps/ios --include='*.swift' | grep -v '/build/'`. Fix any remaining copy. The allowed literals are the deep-link tokens `"holding"`/`"holdings"` (`SharedSnapshot.swift`) and `"PattadarHolding"`.
      - **Add VOC-7** to `scripts/vocab-tests.ts`. It walks `apps/ios/{Pattadar/Sources,PattadarWidget,Shared,PattadarKit/Sources}` for `*.swift` (skipping `build`), runs `stripComments` (Swift uses `//`, `///` and `/* */`), and fails on any string literal matching `/"[^"\n]*\bholdings?\b[^"\n]*"/i` other than exactly `"holding"`, `"holdings"` and `"PattadarHolding"`. Its comment explains that "Holding" on iOS was the single-property word and is now reserved for the web Holdings feature, which iOS does not have.
      - **iOS checks** (record each in verification.md):
        - `(cd apps/ios/PattadarKit && swift test)` → all pass.
        - `bun run scripts/emit-vectors.ts --check` → passes.
        - `bun run scripts/parity-check.ts` → record the output. The pre-existing error `[twins] packages/core/src/land/landcalc.ts changed; its twin did not` is expected and not caused by this change. Any new error must be explained or fixed.
        - The CI app build:
          ```
          (cd apps/ios && xcodegen generate && xcodebuild -project Pattadar.xcodeproj -scheme Pattadar -configuration Debug -sdk iphonesimulator -destination 'generic/platform=iOS Simulator' -derivedDataPath /tmp/hold-ios-dd CODE_SIGNING_ALLOWED=NO build)
          ```
          Xcode 27 (`/usr/bin/xcodebuild`) and xcodegen (`/opt/homebrew/bin/xcodegen`) are installed. This regenerates the gitignored `.xcodeproj`. It must end with `** BUILD SUCCEEDED **`.
          - If it fails, check whether any error names a renamed symbol and fix it.
          - If the failure is environmental (no simulator SDK, or a toolchain error unrelated to these files), say so explicitly with the error line. Do not claim the app builds.
          - Never run `apps/ios/verify.sh`, `simctl` or `devicectl`.
        - Afterwards: `rm -rf /tmp/hold-ios-dd`.
      Files: the Swift files listed, `ReadinessTests.swift`, `scripts/vocab-tests.ts`.
      Verify: as above, plus `bun run scripts/vocab-tests.ts` → PASS. As a mutation test, temporarily restore "This holding is no longer on file.", confirm VOC-7 fails, then restore.

- [ ] 11. **Expo routes, redirects, copy and the Maestro flow (C).** `apps/mobile/ios` and `apps/mobile/android` are generated; never touch them.
      - **Renames:**
        - `git mv "apps/mobile/src/app/(tabs)/holdings.tsx" "apps/mobile/src/app/(tabs)/properties.tsx"`. Its default export `HoldingsScreen` → `PropertiesScreen`.
        - `mkdir apps/mobile/src/app/property && git mv "apps/mobile/src/app/holding/[id].tsx" "apps/mobile/src/app/property/[id].tsx"`. Its default export `HoldingDetailScreen` → `PropertyDetailScreen`.
      - **`(tabs)/_layout.tsx`:** `name="holdings"` → `name="properties"`. The title "Properties" is unchanged.
      - **Hrefs** (19 hits). In `src/app/(tabs)/index.tsx`, `(tabs)/family.tsx`, `(tabs)/passbooks.tsx`, `(tabs)/properties.tsx`, `group/[id].tsx`, `portfolio.tsx`, `property/[id].tsx` and `src/lib/homeInsights.ts`:
        - `'/holdings'` → `'/properties'`
        - `` `/holdings?q=` `` → `` `/properties?q=` ``
        - `pathname: '/holdings'` → `'/properties'`
        - `pathname: '/(tabs)/holdings'` → `'/(tabs)/properties'`
        - `pathname: '/holding/[id]'` → `'/property/[id]'`
        - `` `/holding/${id}?kind=parcel` `` → `` `/property/${id}?kind=parcel` ``

        Keep the query key `['pattadar','holdings']` and the import `@/data/holdings`.
      - **Redirect routes** (new files, outside `(tabs)` so they never become tabs):
        - `apps/mobile/src/app/holdings.tsx`:
          ```tsx
          import { Redirect, useLocalSearchParams } from 'expo-router';
          /** `/holdings` was the Properties tab's route until 03/10/2026; old deep links and
           *  notifications land on `/properties` with their query (q, pb) intact. */
          export default function HoldingsRedirect() {
            const params = useLocalSearchParams();
            return <Redirect href={{ pathname: '/properties', params } as never} />;
          }
          ```
        - `apps/mobile/src/app/holding/[id].tsx`: the same shape, `<Redirect href={{ pathname: '/property/[id]', params } as never} />`. `params` carries `id` and `kind`.
      - **Copy in `property/[id].tsx`:**
        - :402 `<Section title="Holding">` → `"Property"`.
        - :385 "This holding is no longer available." → "This property is no longer available."
        - :406 a11y "See all holdings of this owner" → "See all properties of this owner".
        - :685 "Remove from this holding…" → "Remove from this property…".
        - :725 "…already attached to this holding." → "…already attached to this property."
        - :994 "Couldn't delete this holding" → "Couldn't delete this property".
        - Re-grep the file for `[Hh]olding` in string literals.
      - **`scripts/ux-guards.ts`:** update the path references `(tabs)/holdings.tsx` → `(tabs)/properties.tsx` (:166, :188, :199, :308, :399, :434, :492, :569) and `holding/[id].tsx` → `property/[id].tsx` (:223, :808, :815). The `holding`/`holdings` variable names may stay. CL-610's logic is unchanged.
      - **Maestro `tests/e2e-mobile/02_tabs_navigation.yaml`:** `tapOn: "Holdings"` → `"Properties"`, and `tapOn: "Family"` → `"Groups"` (the `(tabs)/_layout.tsx` title is "Groups"). For each `assertVisible` string, check it exists in the target screen's source (`grep -rn "Land Parcels" "apps/mobile/src/app/(tabs)/properties.tsx"`, and so on). If one does not, replace it with that screen's current visible header text. Update the README row in `tests/e2e-mobile/README.md:9` to "Passbooks, Properties, Groups, More, Home". Maestro is not run (no simulator, by design); say so.
      - **`docs/specs/TODO-one-platform.md:64`:** done in item 6.
      Files: the Expo files listed, two new redirect files, `scripts/ux-guards.ts`, `tests/e2e-mobile/02_tabs_navigation.yaml`, `tests/e2e-mobile/README.md`.
      Verify:
      - `cd apps/mobile && bun run typecheck` → rc 0.
      - `bun test apps/mobile/tests` → 0 fail.
      - `bun run scripts/ux-guards.ts` → UX GUARDS PASS, with CL-610 passing for `(tabs)/properties.tsx`.
      - `bun run scripts/vocab-tests.ts` → PASS (it imports `apps/mobile/src/data/holdings`, which is unchanged).
      - This sweep must leave only the query key, the data import and the two redirect files:
        ```
        grep -rnE "'/holdings|\"/holdings|/holding/|\(tabs\)/holdings" apps/mobile/src
        ```

- [ ] 12. **Full verification matrix (E) and evidence.** Run from the repo root and record every command and result in `.agents/tasks/pattadar-platform-holdings-naming-2026-10-03/verification.md`.
      - **Static checks:**
        - `bun run typecheck` (all workspaces) → rc 0. If one fails in a file this task did not touch, which happened before with `Groups.tsx` and a concurrent edit, re-run once, and record it if it persists.
        - `bun test packages/core packages/tokens apps/web/src apps/mobile/tests apps/university/src` → 0 fail.
        - `for s in scripts/*-tests.ts; do bun run "$s" || echo "FAIL $s"; done` → all PASS. If `shared-components-tests.ts` prints a "counts went down" NOTE for a file this task renamed, lower that budget. Leave the others alone.
        - `bun run scripts/icon-guard.ts` and `bun run scripts/ux-guards.ts` → PASS.
        - `python3 scripts/validate-agent-governance.py` → PASS.
        - `git diff --check` on the changed paths → clean.
        - `bun run build` (root; it builds `apps/web` and `apps/university`) → rc 0. Note whether `apps/web/dist` and `apps/university/dist` pre-existed (gitignored). Leave pre-existing outputs alone.
      - **iOS:** the item 10 results.
      - **Sealed e2e-app:**
        1. Confirm the port is free: `lsof -nP -iTCP:5193 -sTCP:LISTEN` is empty.
        2. Start the server in the background: `cd apps/web && WEB_PORT=5193 bun run dev < /dev/null`. The `< /dev/null` matters: without it Vite stops on TTY reads.
        3. Run:
           ```
           cd tests/e2e-app && APP_WEB_URL=http://localhost:5193 bunx playwright test specs/27-holding-map.spec.ts specs/28-holding-overview.spec.ts specs/29-holdings-list.spec.ts specs/11c-documents-files.spec.ts specs/26-one-font.spec.ts --project=app --project=phone --reporter=line --output=/tmp/hold-e2e
           ```
           All must pass, including the two new redirect tests. The prior run had 171 passing.
        4. Run `specs/04-record-shell.spec.ts` and `specs/24-responsive.spec.ts` (app + phone) with `--reporter=json > /tmp/hold-0424.json`. Compare against the prior run's known pre-existing causes in `.agents/tasks/pattadar-platform-holdings-rename-2026-10-03/verification.md`. No failure may mention `/app/holdings`, `/app/combined`, Holding, crumbs or the rail, and 04's crumbs test (now `/app/holdings/cp-katragunta`) must pass.
        5. Never touch :5173, :5175, :5180 or :5181.
      - **Browser spot-check** on :5193, desktop 1512×950 and iPhone 14, via Playwright (a temporary `tests/e2e-app/specs/zz-hold-naming.tmp.spec.ts`, deleted afterwards). Check:
        - The rail Holdings link goes to `/app/holdings`.
        - `/app/combined/cp-…/fmb#x` redirects to `/app/holdings/cp-…/fmb#x`.
        - Vault's Holding facet still filters (chip "Holding …").
        - Computed font is Atkinson Hyperlegible, weights 400/700, and the summary is tabular-nums.

        Screenshots are optional. If taken, save them in the task folder as `shot-*.png`.
      - **e2e-web360 (disposable DB)** (E):
        1. `psql -d postgres -Atc 'select 1'`. If the local socket does not work, read the host and port (not credentials) from `scripts/start-local.sh` and say what was used.
        2. `createdb pattadar_holdings_e2e`. The name satisfies both `init-test-db.py` (`_e2e`) and `tests/disposable-db.ts`.
        3. `APP_PG_DSN="dbname=pattadar_holdings_e2e" .local/api-venv/bin/python scripts/init-test-db.py`.
        4. Run:
           ```
           cd tests/e2e-web360 && TEST_PG_DSN="dbname=pattadar_holdings_e2e" E2E_API_PORT=18091 E2E_WEB_PORT=5196 bunx playwright test specs/holdings.spec.ts specs/ux-record-holding.spec.ts --reporter=line --output=/tmp/hold-w360
           ```
           Use ports 18091 and 5196 because :5175 is occupied by a process this task does not own.
        5. Record the pass/fail results. For each failure, decide whether it is pre-existing. `ux-record-combined:352`, the 44px tap target, is registered in `docs/qa/test-fail-register.md` as an expected failure. Every failure must be either fixed or shown to be pre-existing.
        6. If the harness cannot start (missing venv, Postgres refusing, a uvicorn import error), record the exact error line and why. Do not claim a pass.
        7. Afterwards: `dropdb pattadar_holdings_e2e` (only the DB this task created), and `rm -rf .local/e2e-web360-dist-5196 tests/e2e-web360/test-results-5196 tests/e2e-web360/playwright-report-5196 tests/e2e-web360/results-5196.json` (only these new paths; the `-5175` outputs are not ours).
      - **Follow-ups for Reddy**, a section in `verification.md`. Do not edit any of these:
        - **Server-side `combined` names, a possible future contract change:**
          - GraphQL fields and operations: `combinedProperties`, `combinedProperty`, `combinedPapers`, `combinedFmb`, `combinedExpenses`, `createCombinedProperty`, `updateCombinedProperty`, `setCombinedMembers`, `deleteCombinedProperty`, `saveCombinedExpense`, `deleteCombinedExpense`.
          - Args `combinedId` (`addJointFmb` and `orders`).
          - Response fields `combinedSpend`, `combinedId`, `combinedName`.
          - Values `kind: 'combined'` and `scope: 'combined'`.
          - Audit action keys `*_combined_*`.
          - The `combined_*` tables.
          - `services/api/src/combined_geometry.py` and its tests.
          - TanStack query keys.
          - The `combinedProperties` fixture key.
        - **Legacy web identifiers still saying holding = property:** `pages/holdings/`, `components/holdingCards.tsx`, `data/hooks.ts` `useHoldings`/`HoldingProperty`, the `LandPropertiesPage` `interface Holding`, the legacy `DashboardPage` "No litigation on any holding", and `PropertyDetailPage` "Holding Status" (a tenure term).
        - **Pricing copy** (`pricingContent.ts`, `PricingPage.tsx`) defines "a holding" as one parcel or property for plan limits. This is a commercial decision for Reddy.
        - **Landing:** `landingContent.ts:36`.
        - **Twin types:** core `HoldingKind` and iOS `HoldingKind`.
        - **iOS identifiers kept** (Decision 7).
        - **Expo:** `src/data/holdings.ts`, its local `Holding*` identifiers, and the query key.
        - **Vault:** no facet URL key exists (Decision 6).
        - **Commit split:** the approach is in § Commit step.
      - **Cleanup:**
        - Stop the :5193 Vite that this task started (its PIDs only), then confirm with `lsof`.
        - Delete `/tmp/hold-*` and the temporary spec.
        - Confirm `git diff --cached --stat` shows only the renames from `git mv`, and nothing else staged.
        - Leave `tests/e2e-app/results.json`, `playwright-report/` and `test-results/` in place; they predate this task.
      Files: `verification.md` (plus optional screenshots).
      Verify: every command has been run and its result recorded. `lsof` shows no listener on 5193/5196/18091. `psql -l` lacks `pattadar_holdings_e2e`.

## Change-governance (for the reviewer)

- **Documentation:** item 6 (design.md, the spec note, TODO, QA register, skill refs), item 10 (`apps/ios/design.md`), item 11 (Maestro README).
- **Architecture:**
  - Web route move with a redirect (client only).
  - Expo route move with redirects.
  - No server, data-flow or trust-boundary change.
  - Update `system-map.md`.
- **Security and privacy:**
  - The redirect keeps the target inside `/app/holdings` (prefix replace on the matched pathname only; no open redirect, because `search` and `hash` are appended to a fixed path).
  - It stays under `RequireAuth`.
  - No gateway, auth, storage or PII change. No secrets.
- **Testing:** items 4, 5, 6, 8, 10, 11 and 12. CRUD surfaces are not functionally changed (renames only). e2e-web360 `holdings.spec.ts` exercises create, rename, members, expenses and delete end to end.
- **Cleanup:** item 12.

## Commit step (F) — runs only after `review.json` says APPROVED

1. `git switch -c feat/holdings`. This keeps the working tree and the index; nothing is reverted.
2. Classify every hunk with `git diff` / `git diff --cached`, and treat untracked files as whole-file adds.
   - **Feature hunks:** the three runs' work. That is the SortCycle in `ui.tsx` and its adoption in Properties/Vault, the Holdings list chrome, `HOLDING_WORD` and copy, the `?combine=1` hint, the filtered-empty note, this run's renames, routes, redirect, audit labels, guards, docs and specs, plus iOS, Expo and legacy.
   - **Unrelated hunks** stay unstaged:
     - Vault's region-note/count head change.
     - The `Holding.tsx` (ex-CombinedProperty) `.stack lg` wrapper and MemberCard button spacing.
     - Properties' 0.375rem subtitle margin.
     - Everything in Dashboard, Fence*, Tools, Groups, `w360.css`, theme, tokens, landing, CI yml, MapCanvas, VillageCanvas, VillageMaps, RecordBoundary, `cssVar.ts`, `fenceBill.ts`, `FenceParts.tsx`, `groupsView*`, `homeGaps*`, the 30-groups spec, the `zz-theme-*` tmp spec, and the other e2e specs' unrelated hunks.
   - When unsure about a hunk, leave it unstaged and list it.
3. Stage hunk-level without interactivity. Write the selected hunks to `/tmp/hold-cN.patch` (built from `git diff -U0 -- <paths>` filtered per hunk), then `git apply --cached --unidiff-zero /tmp/hold-cN.patch`. Use `git add <path>` only for whole new feature files. Never use `git add -A`, `git add .`, `-i` or `-p`.
4. Commits, in order:
   - **C1 `feat(web): holdings list uses shared page chrome and SortCycle`.** Only if the `ui.tsx` SortCycle hunk and the Properties/Vault adoption hunks isolate cleanly and typecheck alone. Otherwise fold them into C2 and say so.
   - **C2 `feat(web): rename Combined views to Holdings, with holding file and route naming`.** All remaining web, core, guard, doc and spec feature hunks, plus the renames, except the VOC-3 widening and VOC-7.
   - **C3 `refactor: iOS/Expo/legacy property wording and naming`.** apps/ios, apps/mobile, `tests/e2e-mobile`, the `ux-guards.ts` Expo path hunks, `LandPropertiesPage`/`StakeDialog`, and the VOC-3 widening and VOC-7 hunks of `vocab-tests.ts`.
5. **Before each commit:**
   - Run the secret-scan skill (`.kiro/skills/secret-scan`) on the staged content.
   - Check `git diff --cached --stat`.
   - Verify that the commit typechecks on its own. Use a temp worktree: `git worktree add --detach /tmp/hold-wt HEAD`, apply `git diff --cached` there, symlink the root `node_modules` and `apps/web/node_modules`, and run `cd apps/web && bun run typecheck`. Then `git worktree remove --force /tmp/hold-wt`.
6. **Committing:** do not skip hooks. Never push. Never commit `.agents/`. Finally, `git status --short` should show the unrelated work still uncommitted, and `git log --oneline -3` should list the commits.
