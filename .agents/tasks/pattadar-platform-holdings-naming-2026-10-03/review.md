# Holding file, identifier and route naming across web, iOS, Expo and legacy web (pass 2)

The change finishes the "Combined views" → "Holdings" rename below the copy layer. On the web, the five pages, the list helpers, and every hook and type move to `Holding*` names. Routes move to `/app/holdings[/:id]`, and `FromCombined` redirects old `/app/combined…` links with their id, tab, query and hash intact. On iOS, Expo and legacy web, "holding" meant one property, so those files, types and strings now say property or parcel. VOC-6 and VOC-7 are new and VOC-3 is wider; together they hold the result. The server contract keeps `combined`, and boundary comments mark it. All six findings from pass 1 are resolved, and the e2e matrix is now recorded with each failure classified.

Watch for:
- (confirmed, non-blocking) `a11y-web-tests.ts` M3-6 fails in the shared tree on `--color-error` in `site.css`. That file is not in this task's diff. The cause is concurrent theme work, but the commit step will meet a red guard.
- (likely, non-blocking) The rewritten Maestro flow asserts "Passbooks" and "Groups" right after tapping tabs with those same labels. The tab bar alone satisfies both asserts.
- (confirmed, non-blocking) `ux-record-holding:283` and `04-record-shell:1473/1482` fail for reasons outside this change. They are listed for Reddy, not fixed.

**Verdict**: APPROVED

## High-level view

The web rename is mechanical and complete. All 14 tracked moves are `git mv` at R100, and the index holds only those moves. The four untracked files were moved with `mv`. Names follow the Record pattern: `Holdings.tsx` is the list, `Holding.tsx` is the frame, and `HoldingCard` avoids a clash with the `Holding` component. The sweep leaves only server names, the redirect itself, the "Combined map" label and comments in files the plan said not to touch.

The redirect is a pure prefix replace: anchored, followed by `(?=\/|$)`, with a fixed target. It stays inside `RequireAuth` and cannot open-redirect. A unit test covers it, and two sealed e2e tests confirm the list keeps its query and hash and a member keeps its tab, query and hash. Moving it into an import-free `holdingPath.ts` keeps `ui.tsx` out of the first chunk. That is a sound deviation, and it is recorded. The Vault facet `combined` → `holding` needs no dual-read, because facets live only in React state.

On iOS, four files and the app-target types are renamed. The PattadarKit API, the widget intent and entity types, the deep-link tokens and the storage keys are kept. XcodeGen directory sources make a project.yml edit unnecessary, and xcodebuild plus `swift test` pass. Expo renames its routes and adds two param-preserving redirects outside `(tabs)`. CL-610 now also scans `property/[id].tsx`, and a mutation check proves it fails on "Holding".

The evidence now covers every gate item. Typecheck, unit tests, every guard with mutation checks, vectors and parity (only the known landcalc twin error) are recorded, along with the iOS build and the root build. The targeted e2e-app run passes 27/28/29/11c/26. Spec 19's 8 failures are shown to predate this change. The two 04 failures are traced to a locator race that also reproduces on a reconstructed base. e2e-web360 ran on a disposable DB. Its one failure caused by the new summary line was fixed in the test, and the other failure is a seed gap. Cleanup is confirmed: no listeners remain, the DB is dropped, and the temporary spec and `/tmp/hold-*` are gone.

<details>
<summary>Issues (4)</summary>

1. **a11y-web M3-6 red in the shared tree.** This is not this task's diff. Before the commit step, confirm the guard passes on the staged content alone (the temp-worktree typecheck step can run it too), or have the owner of the concurrent `site.css` change add `--color-error`.
2. **Weak Maestro asserts.** `assertVisible: "Passbooks"` and `"Groups"` match the tab labels just tapped. Assert a string that appears only in each screen's body, the way "Land & Properties" does for Properties.
3. **Pre-existing test defects for Reddy.** The `04-record-shell:1473/1482` owner-name locator collides with the deed's Buyer. `ux-record-holding:283` needs owners or transfers in the seed. Track both in the test-fail register or fix them separately.
4. **Partial re-runs after iteration-2 edits.** After the describe-title and assertion-message edits, only two of the 19 e2e-web360 tests were re-run. The root build was not re-run either. Both edits are test text and comments, so the risk is low. CI will cover it.

</details>

<details>
<summary>Details</summary>

### Spec failures that remain, and why they don't block

The gate is "no new failures, each explained". In the 04/24 compare, two app tests are new: `04-record-shell:1473` and `:1482`. To check them, the coder rebuilt a base copy with only this task's route hunks reverted and served it on :5194. There `:1482` fails 3 out of 3. `:1473` flips depending on whether the deed card has drawn: it fails 1 time in 3 on the change and passes 3 times in 3 on the base. The strict-mode trace names the deed card's Buyer `span.v` and the khata/owner `p.note`. This task touches neither `RecordPapers.tsx` nor the fixtures, and its `RecordHead.tsx` hunk only changes crumbs. The base copy is a superset check rather than a clean baseline, so this is evidence and not proof. The traced cause is specific enough to accept it.

Spec 19's eight failures assert strings that are absent from `HEAD` (`git grep` count 0), or they come from screens this task does not touch. All eight also fail on the base copy. The one test edited here, `:485` "Add your first property", passes.

On e2e-web360, `holdings:132` collided with the new summary line "1 holding · 34.53 ac". The fix adds `{ exact: true }` and a comment that names the card's extent. It changes only the test and is correct. The `ux-record-holding:283` failure is a Record People test carried over unchanged. The seeds never write `record_owners` or `record_transfers`, so it cannot pass on a fresh DB.

### Guard state at commit time

`a11y-web-tests.ts` passed in iteration 1. It fails now because concurrent, uncommitted `site.css` work uses `var(--color-error)` without declaring it. `site.css` is on the plan's do-not-stage list, so this task's commits will not include the fault. The working tree's guard run will still be red when the commit step's checks run. The commit step should state that, and not read it as a regression from these commits.

### Maestro flow

The old asserts ("Khata Books", "Land Parcels", "Family & Heirs") are rightly replaced, because those strings no longer exist in the source. The new values for Passbooks and Groups match the tab labels too. A broken navigation would still pass those two steps. Maestro is not run (there is no simulator, by design), so the flow is not exercised anyway.

</details>

<details>
<summary>File map</summary>

- `apps/web/src/routes.tsx`: Holding lazy imports, the `holdings[/:id]` routes, and `FromCombined` for `combined` and `combined/*`.
- `apps/web/src/w360/holdingPath.ts` (new): `holdingsPathFrom`.
- `apps/web/src/w360/holdingList{,.test}.ts` (moved): renamed list helpers and the redirect-path test.
- `apps/web/src/w360/api.ts`: Holding types, constants and hooks, plus the server boundary comment.
- `apps/web/src/w360/pages/{Holdings,Holding,HoldingActions,HoldingLedger,HoldingFmb}.tsx` (git mv): component, prop and link renames.
- `Shell.tsx`, `RecordHead.tsx`, `Properties.tsx`, `Vault.tsx`, `ui.tsx`: `/app/holdings` links, the facet key `holding`, and comments.
- `packages/core/src/format/audit.ts`: holding audit labels.
- `apps/web/src/pages/LandPropertiesPage.tsx`, `pages/holdings/StakeDialog.tsx`: legacy copy now says property.
- `scripts/vocab-tests.ts`: VOC-2 covers core, VOC-3 is widened, VOC-6 and VOC-7 are new.
- `scripts/ux-guards.ts`: Expo paths, and CL-610 now covers `property/[id].tsx`.
- `scripts/shared-components-tests.ts`: renamed budget paths.
- `apps/ios/Pattadar/Sources/*` (4 git mv and their importers), the widgets, `PattadarKit/Readiness.swift` and its test: property naming and copy.
- `apps/mobile/src/app/(tabs)/properties.tsx` and `property/[id].tsx` (git mv); `holdings.tsx` and `holding/[id].tsx` (new redirects); the href call sites.
- `tests/e2e-app/specs/27,28,29` (renamed), plus 04, 19 and 26; `tests/e2e-web360/specs/{holdings,ux-record-holding}.spec.ts` (git mv).
- `tests/e2e-mobile/02_tabs_navigation.yaml` and its README.
- Docs: `design.md`, the 2026-09-25 spec note, TODO-one-platform, the QA register and onboarding, two skill references, `apps/ios/{design,README}.md`.

Full diff: `git diff` plus `git diff --cached -M` (the tree also carries other tasks' hunks).

</details>
