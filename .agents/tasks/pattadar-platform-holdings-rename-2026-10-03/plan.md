# Implementation Plan: rename "Combined views" to "Holdings" and fix two UX follow-ups (web)

Repo: `/Users/reddy.sh/reddy.sh/projects/pattadar-platform`. Work in place on `main`, with no worktree. Do not commit, stage or push.

The tree carries about 80 unrelated uncommitted changes. Several are in files this task edits: `ui.tsx`, `Shell.tsx`, `Combined.tsx`, `CombinedProperty.tsx`, `Properties.tsx`, `RecordHead.tsx`, `Vault.tsx`, `w360.css`, `design.md`, `docs/specs/2026-09-25-combined-properties.md`, `scripts/parity-check.ts`, `scripts/parity-map.json`, `scripts/typography-tests.ts` and `tests/e2e-app/specs/24-responsive.spec.ts`. Make targeted `str_replace` edits only. Never revert, reformat or `git checkout` those files.

Approved by Reddy (do not re-litigate):
- The user-facing feature "Combined views" becomes **Holdings** (singular *holding*).
- Two UX follow-ups from the prior run's `review.md`, issues 1 and 2.

Prior context is in `.agents/tasks/pattadar-platform-combined-views-standardize-2026-10-27/`: `naming-research.md`, `review.md`, `verification.md` and `plan.md`.

## Decisions (recorded here so the implementer does not re-decide them)

- **Constant.** Rename `COMBINED_WORD` to `HOLDING_WORD` in `apps/web/src/w360/ui.tsx:724` and set it to `{ one: 'Holding', many: 'Holdings', eyebrow: 'Several properties held as one' }`.
  - `.w360 .eyebrow` already uppercases through CSS. The spec 29 assertion on `'Viewed together'` proves the DOM text is mixed case, so the eyebrow string stays sentence case.
  - The underscore keeps it out of the `shared-components-tests.ts` shadow counter.
- **Visible copy only.** Routes (`/app/combined/...`), GraphQL fields and operation names, query keys, component and file names (`Combined.tsx`, `combinedList.ts`, `CombineDialog`, `canCombine`, `COMBINED_PARAM`, `combinedSummary`…), facet URL keys (`complete`/`ground`/`land`) and the Vault facet key `combined` all stay unchanged. Code comments may be updated where they would now mislead, but that is not required.
- **"Combined map" tab label stays.** It describes the map, which combines boundaries, not the feature noun. "Combine…" and "Select 2 or more to combine" on the Properties selection bar stay, because the verb is allowed. The result is called a holding.
- **Never "your holdings"** for all of a user's land.
  - The two existing `Failed what="Your combined views"` and the `ariaLabel={`Narrow your ${many}`}` become neutral wording: `Failed what="The holdings list"` and `ariaLabel="Narrow the holdings list"`.
  - Inside an object, use the singular: "This holding", "Remove this holding".
- **Combine hand-off (TASK 2a).**
  - Both "New holding" and the empty state's "Go to Properties" link to `/app/properties?combine=1`.
  - On Properties, the hint shows while `params.get('combine') === '1'`, data is loaded and the account is not `virgin`. The param stays in the URL while the hint shows (shareable and reload-safe). Dismissing it deletes only `combine` with `{ replace: true }`, so `view`, `q` and the facet params survive.
  - `combine` is not in `PARAM` or `narrowKey`, so it does not clear a selection. The existing `new`/`reading` consumer copies `params`, so `combine` survives it.
  - There is no explicit selection mode. "Entering" it means adding the existing `selecting` class to the grid while the hint shows: `className={`cards ${selected.size > 0 || combineHint ? 'selecting' : ''}`}`. That raises every card checkbox to full opacity (`w360.css:1220`). List view already shows checkboxes.
- **Hint component.** `ui.tsx` exports no banner or notice component. The hint composes the existing shared `.callout` notice class (`w360.css:2875`, used by `PropertyActions.tsx` and `OwnerChain.tsx`) and the shared `iconbtn` + `CloseOutlined` dismiss used by `Toast.tsx:145`. That is no new CSS, no new colours and no page-local component.
  - Markup: `<div className="callout" role="status" style={{ gridTemplateColumns: '1fr auto', alignItems: 'center', marginBottom: 'var(--space-md)' }}><p className="note" style={{ margin: 0 }}>Select two or more properties, then choose Combine to make a holding.</p><button type="button" className="iconbtn" aria-label="Dismiss the combine hint" onClick={dropCombine}><CloseOutlined sx={{ fontSize: 16 }} /></button></div>`
  - Placement: directly after the `FacetFilter` block in `Properties.tsx` (around line 1047), before the skeletons.
  - Adjust spacing only if the browser check shows it is needed.
- **Filtered-empty note (TASK 2b).**
  - Add a pure helper `filteredEmptyNote(total: number): string` to `apps/web/src/w360/combinedList.ts`. It returns `'The one holding is hidden by the filters above.'` when `total === 1`, and otherwise `` `All ${total} holdings are hidden by the filters above.` ``, built from `HOLDING_WORD` lowercased.
  - Render it in `Combined.tsx`'s `emptypanel` as `<p className="note" style={{ maxWidth: '26rem' }}>` between `<h3>` and "Clear filters". This is exactly the structure in `Properties.tsx:1104-1131`.
- **Vocabulary guard.** `scripts/vocab-tests.ts` today checks only Expo counting (CL-610..612). Extend it with web checks, using `stripComments` and `walk` from `scripts/lib/source-scan.ts`, so the approved words are enforced (item 6). Expo's `ux-guards.ts` CL-610 ("does not say holding", Expo screens only) is **not** changed. It remains correct for Expo, which has no holdings feature, and it is reported as a parity follow-up.
- **Date.** Record the approval as 03/10/2026, as the brief instructs, even though the prior run's note is dated 27/10/2026. Flag the chronology in `verification.md` rather than altering either date.

## Plan

- [ ] 1. Rename the constant and move every importer to it.
      - In `ui.tsx`, rename `COMBINED_WORD` to `HOLDING_WORD` with the values above. Update its doc comment: approved by Reddy 03/10/2026; it also drives the CSV filename `holdings-YYYY-MM-DD.csv`. Fix the `SortCycle` comment at ui.tsx:640 ("Combined views list" → "Holdings list").
      - Update the import and every use in:
        - `apps/web/src/w360/Shell.tsx` (56, 351; also refresh the 350 comment "Views, not properties")
        - `apps/web/src/w360/combinedList.ts` (13, 125)
        - `apps/web/src/w360/pages/RecordHead.tsx` (27, 165-166)
        - `apps/web/src/w360/pages/Combined.tsx` (38, 56, 105-106, 115)
        - `apps/web/src/w360/pages/CombinedProperty.tsx` (23, 69, 171, 183, 191)
        - `apps/web/src/w360/pages/Vault.tsx` (31, 295-296)
      - Update `apps/web/src/w360/combinedList.test.ts:64-67` expectations to `'3 holdings · 62.86 ac · 400 Sq.yd'`, `'1 holding · 34.53 ac'`, `'1 holding · 30.00 ac · ₹1.40 Cr valued'` and `'0 holdings'`.
      Files: the 8 files above.
      Verify: `cd apps/web && bun run typecheck` exits 0. `bun test apps/web/src/w360/combinedList.test.ts` passes.

- [ ] 2. Sweep the remaining hard-coded user copy in web. Each line below is old → new.
      - `apps/web/src/w360/pages/Combined.tsx`:
        - `Failed what={`Your ${many}`}` → `what="The holdings list"`.
        - `ariaLabel` → `"Narrow the holdings list"`.
        - The Empty state title `No ${many} yet` (→ "No holdings yet") is already constant-driven. Its body becomes "On Properties, select 2 or more and choose Combine to make a holding. Official records stay separate."
        - The ⓘ info becomes "Made on Properties: select 2 or more and choose Combine. Official records stay separate."
        - Leave the head-comment wording to taste.
      - `CombinedProperty.tsx`:
        - :86 eyebrow `COMBINED VIEW` → `{HOLDING_WORD.one.toUpperCase()}`.
        - :100 'Remove this combined view' → 'Remove this holding'.
        - :114 "This combined view is down to…" → "This holding is down to…".
        - :148 nav aria-label → "This holding".
        - :184 `Failed what="This holding"`.
        - :192 "This holding isn't in your account".
        - :317 "Records in this view" → "Records in this holding".
      - `CombinedActions.tsx`:
        - :77 "…part of another holding…".
        - :88 dialog title "Combine into one view" → "Combine into one holding".
        - :147 "A holding needs at least two records you hold in your own name."
        - :222/:224 "…in another holding…".
        - :285 "…or remove the holding instead."
        - :316 "That holding could not be removed — it may already be gone. Reload the page."
        - :327 `` `Remove the holding ${combined.name}?` ``.
        - :539 "…may have left this holding — reload…".
      - `CombinedLedger.tsx`:
        - :49 "All documents in this holding".
        - :59 "in this holding".
        - :70 "…linked to this holding or its properties."
        - :189 "Costs for this holding".
        - :210 "no agricultural land in this holding".
        - :336 "…any record in this holding."
      - `CombinedFmb.tsx`:
        - :223 `label="Map of this holding"`.
        - :249 title "Frame the whole holding again".
        - :294 visible prose "the fact the holding adds".
      - `apps/web/src/w360/api.ts:3077` → 'Removing that holding'. Also check every `reportError` label near the other `use*Combined*` mutations (around 3040-3110) for "combined" copy.
      - `Vault.tsx`:
        - :61 facet label `combined: 'Holding'`.
        - :286 "Choose the properties and holdings this file belongs to."
        - :290 placeholder "Search properties or holdings".
        - :291 aria-label "Search properties and holdings to link".
        - :312 Chip "Holding".
        - :338 "No property or holding matches…".
        - :382 "Open holding".
        - :391 "…a property or holding yet."
        - :466 `Failed what="The holdings list"`.
        - :469 Empty title "Add a property or holding first".
        - :779/:781 facet label and fallback "Holding".
      - Finish with a case-insensitive sweep of `apps/web/src`: `combined view`, `this view` in `pages/Combined*.tsx`, and `viewed together`. Comments may remain; visible strings may not.
      Files: `Combined.tsx`, `CombinedProperty.tsx`, `CombinedActions.tsx`, `CombinedLedger.tsx`, `CombinedFmb.tsx`, `api.ts`, `Vault.tsx` (all under `apps/web/src/w360/`).
      Verify: `cd apps/web && bun run typecheck` exits 0. `bun test apps/web/src` passes with 0 failures (baseline 340 plus new ones).

- [ ] 3. TASK 2b: filtered-empty note on the Holdings list.
      - Add `filteredEmptyNote(total)` to `combinedList.ts` (spec in Decisions). Add a unit test in `combinedList.test.ts` covering total 1 and total 3.
      - Render it in `Combined.tsx`'s emptypanel between `<h3>` and the "Clear filters" button, as `<p className="note" style={{ maxWidth: '26rem' }}>{filteredEmptyNote(data.length)}</p>`.
      Files: `apps/web/src/w360/combinedList.ts`, `apps/web/src/w360/combinedList.test.ts`, `apps/web/src/w360/pages/Combined.tsx`.
      Verify: `bun test apps/web/src/w360/combinedList.test.ts` passes, including the new test. Typecheck exits 0.

- [ ] 4. TASK 2a, part 1: point "New holding" at the hand-off.
      - In `Combined.tsx`, change both `to="/app/properties"` links (the head primary "New holding" and the Empty state's "Go to Properties") to `to="/app/properties?combine=1"`.
      - Update the file-header comment to mention the `?combine=1` hand-off.
      Files: `apps/web/src/w360/pages/Combined.tsx`.
      Verify: typecheck exits 0.

- [ ] 5. TASK 2a, part 2: the combine hint on Properties. Depends on item 4.
      - In `Properties.tsx`, add `import CloseOutlined from '@mui/icons-material/CloseOutlined';` (the same import Toast and ui.tsx use).
      - Add `const combineHint = params.get('combine') === '1';` and a `dropCombine` callback that copies `params`, deletes `combine` and calls `setParams(next, { replace: true })`.
      - Render the `.callout` hint (markup in Decisions) after the `FacetFilter` block, guarded by `combineHint && data && !virgin`.
      - Change the grid's class at ~1136 to add `selecting` while `combineHint` is set.
      - Add a short comment explaining why the param stays in the URL and why only `combine` is deleted.
      - Do not touch the other uncommitted hunks in this file. In particular, the subtitle `marginTop` edit belongs to other work.
      Files: `apps/web/src/w360/pages/Properties.tsx`.
      Verify: typecheck exits 0. `bun test apps/web/src` passes. `bun run scripts/icon-guard.ts` reports ICON GUARD PASSES (CloseOutlined is already used in w360; if the guard objects, use whatever icon it names for close rather than adding an exception).

- [ ] 6. Enforce the new vocabulary in `scripts/vocab-tests.ts`.
      - Keep the existing CL-610..612 block untouched.
      - Append the web checks below, using `readFileSync`, `join` and `walk`/`stripComments` from `./lib/source-scan`, on `apps/web/src/**/*.{ts,tsx}`:
        - **VOC-0 self-test.** A sample string with `"Combined view"` inside a comment and inside a literal: the scanner must flag only the literal.
        - **VOC-1.** `ui.tsx` contains `export const HOLDING_WORD` with `one: 'Holding'`, `many: 'Holdings'` and `eyebrow: 'Several properties held as one'`, and no `COMBINED_WORD`.
        - **VOC-2.** No source, after `stripComments`, matches `/combined views?/i` or `/viewed together/i`. Report each file:line through `lineAt`.
        - **VOC-3.** No source, after `stripComments`, matches `/your holdings/i`.
        - **VOC-4.** Holdings is never the Properties list. In `Shell.tsx` the `/app/properties` rail entry's label is `'Properties'`. In `Properties.tsx` the `PageHead` title is `"Properties"` and no `'Holdings'`/`"Holdings"`/`>Holdings` literal appears.
        - **VOC-5.** The Holdings list links its New action to `/app/properties?combine=1`.
      - Update the file's header comment to cite design.md § App vocabulary (Holding approved by Reddy, 03/10/2026).
      Files: `scripts/vocab-tests.ts`.
      Verify: `bun run scripts/vocab-tests.ts` passes. Then temporarily insert `'Combined view'` into a scratch string in `Combined.tsx`, confirm VOC-2 fails, and revert that edit.

- [ ] 7. Update the docs.
      - **`design.md` § App vocabulary (lines ~376-401):**
        - Replace the "Several records viewed together" row with: Concept "Several properties held as one" | Say "**Holding** (list: **Holdings**). Official records stay separate. Inside one, use the singular ('This holding'). Never write 'your holdings' to mean all of an owner's land. Web: one constant, `HOLDING_WORD` in `apps/web/src/w360/ui.tsx`" | Not "combined view, combined property, estate, portfolio".
        - Keep "holdings" in the Properties row's Not column. Add a note there that **Holdings must never be used for the Properties list**.
        - Add one line under the table: "Holding approved by Reddy on 03/10/2026, superseding the 26/09/2026 'Combined view' entry (research: `.agents/tasks/pattadar-platform-combined-views-standardize-2026-10-27/naming-research.md`)."
        - Change line ~401 "members of a combined view" to "members of a holding".
      - **`docs/specs/2026-09-25-combined-properties.md` § Screens (lines ~253-285):**
        - eyebrow → "Several properties held as one".
        - summary example → "2 holdings · …".
        - action → "**New holding**, a link to `/app/properties?combine=1`, which shows a dismissable hint and raises the card checkboxes".
        - Mention the filtered-empty note.
        - Constant → `HOLDING_WORD`.
        - Add a supersession note: "Renamed 03/10/2026 (Reddy): the visible noun is Holding/Holdings. Routes, GraphQL fields and identifiers keep `combined`."
        - Do not rewrite the historical 27/10/2026 and 28/09/2026 notes.
      Files: `design.md`, `docs/specs/2026-09-25-combined-properties.md`.
      Verify: `bun run scripts/vocab-tests.ts` and `bun run scripts/typography-tests.ts` pass. Both read design.md, and docs-only edits need no build. Re-read the edited table, and check that every repo path it cites exists (`ls`).

- [ ] 8. Update the e2e specs that assert the old copy.
      - **`tests/e2e-app/specs/29-combined-list.spec.ts`:**
        - describe/header → Holdings.
        - H1 `'Holdings'`, eyebrow `'Several properties held as one'`, summaries `'3 holdings · 62.86 ac · 400 Sq.yd'` and `'1 holding · 28.33 ac'`.
        - Link `'New holding'` with href `'/app/properties?combine=1'`.
        - Heading `'No holdings match these filters'`, plus a new assertion that the note "All 3 holdings are hidden by the filters above." is visible.
        - CSV `/^holdings-\d{4}-\d{2}-\d{2}\.csv$/`, `'No holdings yet'`, and the empty-account `'New holding'` count 0.
        - Add a test `New holding hands off to Properties with a combine hint @phone`. Steps:
          1. goto `/app/combined` and click "New holding".
          2. Expect the URL to match `/\/app\/properties\?combine=1/` and a `role=status` hint containing "Select two or more properties, then choose Combine to make a holding." to be visible.
          3. Switch to List.
          4. Expect the URL to have both `combine=1` and `view=list`.
          5. Tick two seeded owned records by `aria-label="Select <title>"`. Pick titles from `tests/e2e-app/fixtures/seed.ts` whose `stake` is `owned` or absent; line 45 is one.
          6. Click `Combine…`.
          7. Expect the dialog named "Combine into one holding", then Cancel.
          8. Click "Dismiss the combine hint".
          9. Expect the hint to be gone, the URL to lack `combine=`, and `view=list` to be kept.
      - **`28-combined-overview.spec.ts`:** header and describe wording only (line 2, 59), plus any asserted old string the run surfaces.
      - **`27-combined-map.spec.ts`:**
        - :118 'Map of this holding'.
        - :273/:374 'Remove this holding'.
        - :279 'This holding'.
        - :329 '…may have left this holding — reload…'.
        - :376 'Remove the holding Katragunta Land?'.
        - :380 'That holding could not be removed — it may already be gone. Reload the page.'.
        - :386 'No holdings yet'.
        - test titles at :350/:369 optional.
      - **`11c-documents-files.spec.ts:298`:** 'Remove filter Holding Katragunta farm'. The :282 title is optional.
      - **`04-record-shell.spec.ts`:** :538 crumbs link 'Holdings'; :556 `not.toContainText('Holdings')`.
      - **`24-responsive.spec.ts:100`:** 'Holdings'. Targeted edit only, because the file has other uncommitted hunks.
      - **`tests/e2e-web360/specs/combined.spec.ts`:**
        - :108/:206/:224 'Combine into one holding'.
        - :142 'HOLDING'.
        - :155 'Records in this holding'.
        - :229 'part of another holding'.
        - :278 'All documents in this holding'.
        - :487 'Remove this holding'.
        - :488 'Remove the holding E2E Renamed Holding?'.
      - **`tests/e2e-web360/specs/ux-record-combined.spec.ts:93`:** 'Combine into one holding'.
      - Finish with `grep -rniE "combined views?|viewed together|combine into one view|in this view" tests/e2e-app/specs tests/e2e-web360/specs`. Only comments and unrelated "one view" prose may remain.
      Files: the spec files listed above.
      Verify: run item 9's e2e step. The e2e-web360 specs need the disposable-DB stack, so record them as edited but not run.

- [ ] 9. Full verification. Record every command and result in `.agents/tasks/pattadar-platform-holdings-rename-2026-10-03/verification.md`.
      - **Static checks:**
        - `cd apps/web && bun run typecheck` → rc 0.
        - `bun test apps/web/src` → 0 fail.
        - `for s in scripts/*-tests.ts; do bun run "$s" || echo "FAIL $s"; done` → all PASS, including `vocab-tests.ts`, `typography-tests.ts` and `shared-components-tests.ts`. If `shared-components-tests.ts` prints a "counts went down" NOTE, lower the named budget.
        - `bun run scripts/icon-guard.ts` → passes.
        - `bun run scripts/ux-guards.ts` → passes.
        - `bun run scripts/parity-check.ts` → record the result. iOS has no holdings feature, so copy should not affect it. If it fails on copy, report it; do not edit `apps/ios` or `apps/mobile`.
      - **e2e-app:**
        1. Start a new Vite server: `cd apps/web && WEB_PORT=5193 bun run dev` (`run_in_background`). Confirm 5193 was free first with `lsof -nP -iTCP:5193 -sTCP:LISTEN`. Never touch 5173, 5175, 5180 or 5181.
        2. Run `cd tests/e2e-app && APP_WEB_URL=http://localhost:5193 bunx playwright test specs/28-combined-overview.spec.ts specs/29-combined-list.spec.ts specs/11c-documents-files.spec.ts specs/26-*.spec.ts specs/27-combined-map.spec.ts --project=app --project=phone --output=/tmp/hold-e2e`. All must pass.
        3. Run specs 03, 04 and 24 (app + phone) and baseline-compare. The prior run had 137 known failures across 03/04/24, from copy and layout drift ("4 records selected", CSV headings, nogeo, phone drawer). Collect the failing test titles with this change and compare them against the prior run's causes in `.agents/tasks/pattadar-platform-combined-views-standardize-2026-10-27/verification.md`. Never use `git stash` or checkout, because the tree is shared. If a failure is not clearly pre-existing, build a baseline: back up the changed web files to `/tmp`, temporarily restore `COMBINED_WORD` values and old copy, re-run only those tests, then restore from the backup. The failure set must be a subset of the baseline, with no new failures, and the 04:538/556 and 24 rail assertions must pass.
        4. Use a reporter that writes only to `/tmp`. Do not leave `tests/e2e-app/results.json`, `playwright-report` or `test-results` behind.
      - **Browser check** on :5193 through the sealed e2e-app harness, at 1512px desktop and iPhone 14 (390px). Use a temporary screenshot spec (`tests/e2e-app/specs/zz-hold-shots.spec.ts`, deleted afterwards) or Playwright MCP. Save to the task folder:
        - `shot-holdings-desktop.png` / `-mobile.png`
        - `shot-holdings-filtered-empty-desktop.png` / `-mobile.png`
        - `shot-properties-combine-hint-desktop.png` / `-mobile.png`
      - **Exercise in the browser:**
        - New holding → hint → select 2 → Combine… → dialog "Combine into one holding" → Cancel.
        - Dismiss the hint; confirm `view` and `q` survive.
        - Filter to nothing → note and Clear filters → list restored.
        - Export → `holdings-*.csv`.
      - **Computed styles** on the hint and the empty note: font-family Atkinson Hyperlegible, weight 400 or 700 only, tabular-nums on the summary and the tally. No dates are rendered on these screens.
      - **Parity follow-up** for Reddy, in `verification.md`. Do not edit these:
        - iOS `apps/ios/Pattadar/Sources/HoldingsScreen.swift` is the Properties screen (navigationTitle "Properties"). Its type and file name use "Holdings", and :485 says "This holding is no longer on file." for a single property.
        - iOS `AddDocumentSheet.swift:218` says "…a paper, not a holding…".
        - Expo `apps/mobile/src/app/(tabs)/holdings.tsx` route and `apps/mobile/src/app/holding/[id].tsx:402` `<Section title="Holding">` both mean a single property, which conflicts with the new meaning.
        - `scripts/ux-guards.ts` CL-610 forbids "holding" in Expo copy and would need narrowing if Expo ever gains this feature.
        - Maestro `tests/e2e-mobile/02_tabs_navigation.yaml` taps a "Holdings" tab, but the Expo tab is titled "Properties". That drift predates this change.
        - Neither native client has the holdings (combined) feature itself.
      - **Also record:**
        - The 27/10 → 03/10 date chronology.
        - Not verified: the e2e-web360 run, the live API, and the root `bun run build`.
      - **Cleanup:**
        - Stop the :5193 server and confirm the port is free.
        - Delete the temporary spec, `/tmp` outputs and any scratch files.
        - Keep only `verification.md` and the `shot-*.png` files in the task folder.
      Files: `.agents/tasks/pattadar-platform-holdings-rename-2026-10-03/verification.md` and screenshots.
      Verify: every command above has been run and its result recorded. `lsof -nP -iTCP:5193 -sTCP:LISTEN` returns nothing. `git status --short` shows only the intended files plus the pre-existing changes, with nothing staged (`git diff --cached --quiet` → rc 0).

## Change-governance notes for the implementer

- **Documentation:** items 7 and 9.
- **Architecture:** no new entrypoint or data flow. A URL param is added on Properties, which is client-only.
- **Security and privacy:** copy only, plus a client-side URL flag. There is no auth, storage or PII change, and the CSV still goes through `csvCell`.
- **Testing:** item 9.
- **Cleanup:** item 9. Never touch user-owned servers or the unrelated working-tree changes.
