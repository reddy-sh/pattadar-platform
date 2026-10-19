# "Combined views" renamed to "Holdings", plus the combine hand-off and filtered-empty panel (web)

This change renames what the web app shows for several properties held as one, from "Combined view" to "Holding" (list: "Holdings"). The noun now lives in one constant, `HOLDING_WORD` in `apps/web/src/w360/ui.tsx`, with `one`, `many` and the definition eyebrow "Several properties held as one". The rail, crumbs, PageHead, summary line, empty states, New button, CSV stem and Vault facet all read from it. Hard-coded copy in CombinedProperty, CombinedActions, CombinedLedger, CombinedFmb, Vault and the api.ts error labels was rewritten in the singular. Routes, GraphQL and identifiers still say `combined`. "+ New holding" now opens `/app/properties?combine=1`, where a dismissable `.callout` hint appears. The Holdings filtered-empty panel now has the same heading → note → Clear filters layout as the Properties panel. design.md, the combined-properties spec and `vocab-tests.ts` (VOC-0..5) were all updated.

Watch for: the working tree carries a lot of unrelated uncommitted work, including spacing changes inside the files this task touched, so the rename needs a careful, file-scoped commit (confirmed). The `tests/e2e-web360` specs were edited but never run (confirmed, stated in verification).

**Verdict**: APPROVED

## High-level view

The rename is constant-driven. Every place that prints the list noun derives it from `HOLDING_WORD`: Shell rail, RecordHead and CombinedProperty crumbs, `combinedSummary`, `filteredEmptyNote`, the PageHead, the empty-state titles, "New holding", the `holdings-YYYY-MM-DD.csv` stem and the Vault section. In-object copy uses the singular ("This holding", "Remove the holding {name}?", "Records in this holding"). The filter aria label is "Narrow the holdings list", so the screen never says "your holdings". Routes (`/app/combined`), GraphQL operations, query keys and Vault's internal `combined` facet key are unchanged. "Combine…" stays as the verb, and the "Combined map" tab name is kept on purpose.

The hand-off keeps creation in one place. "+ New holding" and the empty state's "Go to Properties" both link to `?combine=1`. On Properties that flag shows a `.callout` notice with `role="status"` and an `iconbtn` + `CloseOutlined` dismiss, and it sets the grid's `selecting` class. Dismissing deletes only `combine`, with `replace: true`. Clear filters only removes facets and `q`, so the flag survives it.

The filtered-empty panel uses the same structure as the Properties panel: `emptypanel` → `h3` → `p.note` (maxWidth 26rem) → `btn` "Clear filters". The note comes from a pure helper with a unit test.

Governance docs match the request. design.md has the new row, removes "holding" from that row's Not column, adds "Holdings must never be used for the Properties list" to the Properties row, and records the 03/10/2026 Reddy approval superseding 26/09/2026. iOS and Expo were not edited. Their conflicting single-property uses of "holding" (`HoldingsScreen.swift`, `(tabs)/holdings.tsx`, `holding/[id].tsx`, CL-610 in ux-guards) are listed in verification.md for Reddy.

<details>
<summary>Issues (4)</summary>

1. **Unrelated edits in the same files** — CombinedProperty.tsx (the `.stack lg` overview wrapper, MemberCard button spacing) and Properties.tsx (SortCycle swap, the 0.375rem summary margin) carry changes that are not part of the rename or the two follow-ups. Commit them separately, or note them in the commit, so the rename stays easy to review and revert.
2. **e2e-web360 specs unverified** — `combined.spec.ts`, `screens.spec.ts` and `ux-record-combined.spec.ts` were edited for the new copy but not run against the disposable DB. Run them, or leave them for CI, before claiming they are green.
3. **Hint layout overrides `.callout` inline** — the hint sets `gridTemplateColumns: '1fr auto'` and `alignItems` inline on the shared `.callout`. Both are allowed by the guards. If a second dismissable callout appears, promote this to a shared variant instead of copying the inline style.
4. **Legacy web still uses "holding" for a property** — `/legacy/parcels` (LandPropertiesPage.tsx:431,444) still says "Your holdings" and "Add a holding", which now clashes with the approved meaning. VOC-3 deliberately skips it. Reddy should decide whether to reword it or retire it.

</details>

<details><summary>Details</summary>

### Rename coverage and where the noun lives

Every requested surface uses the new copy. Crumbs (`HOLDING_WORD.many` / `.one`), the object eyebrow (`HOLDING_WORD.one.toUpperCase()`), the tabs nav aria label "This holding", `Failed what` labels, the CombineDialog title "Combine into one holding", the delete title, and the toast and alert copy in CombinedActions all read correctly. The ledger headings and empty bodies, the map region label "Map of this holding" and the "Frame the whole holding again" chip title are updated. The api.ts mutation labels are now "That holding" and "Removing that holding". The page eyebrow "Several properties held as one" is a definition rather than a second name, which is what the request asked for. The screenshots show it uppercased by the eyebrow style.

Comments that still mention "combined" (for example in `CombinedFmb.tsx`) are code commentary, not user-facing. VOC-2 scans literals only, and its self-test (VOC-0) shows that comments are skipped. The mutation probe in verification.md proves VOC-2 catches a stray `'Combined view'` literal.

### Combine hand-off on Properties

The hint shows only when `combine=1`, data has loaded and the account is not empty (confirmed). On an empty account Properties shows its own first-run Empty state instead, which is the right remedy there. The flag lives in the URL rather than component state, so a reload keeps the hint. The spec 29 phone test covers dismissing with `view=list` kept, and the browser check covers `q=sy` kept.

`selecting` is applied to the grid only, because the list view always shows checkboxes, so the "selection mode" promise holds in both views. The pre-existing phone selection bar overlapping the next list row is reported, not introduced.

### Filtered-empty panel and summary line

On a phone, filtering to nothing shows "0 holdings" in the summary, "0 of 2 shown" in the tally, and a note that counts against the unfiltered total. The note and the tally say different things, so they do not contradict each other. Typography in the screenshots and the computed-style probe stays within standard: Atkinson Hyperlegible throughout, 700 only on the h1/h3, `tabular-nums` on summary and tally. These screens render no dates.

### Docs and vocabulary guard

The Properties row in design.md still lists "holdings" in its Not column while "Holding" is now an approved noun. The added "must never be used for the Properties list" sentence makes that intentional and readable. The approval line points to research evidence in a sibling task folder under `.agents/`. That folder is untracked, so the reference will dangle unless the research is committed or summarised in docs. This is informational, not blocking.

### Test coverage

There are unit tests for `filteredEmptyNote`, the VOC guard suite, e2e-app 27/28/29/11c/26 (171 passed), and a baseline comparison for 03/04/24 showing no new failures. Not tested: the `tests/e2e-web360` disposable-DB specs, the root build, CI, and any iOS/Expo/Maestro surface (out of scope, with parity gaps reported).

### Bundled work

The diff in this tree is far larger than the task: theme/palette, Dashboard, Groups, VillageMaps, FenceStudio, `services/api/src/main.py` (SRO ordering), and an untracked `zz-theme-site-colours.tmp.spec.ts`. None of it belongs to this rename. The overlap inside CombinedProperty.tsx and Properties.tsx is what makes a clean commit harder (Issue 1).

</details>

<details>
<summary>File map</summary>

- `apps/web/src/w360/ui.tsx`: `COMBINED_WORD` → `HOLDING_WORD` (one, many, eyebrow) and its doc comment.
- `apps/web/src/w360/pages/Combined.tsx`: list head, `?combine=1` links, aria label, empty/filtered-empty copy, CSV stem.
- `apps/web/src/w360/combinedList.ts`: summary uses the constant; new `filteredEmptyNote`.
- `apps/web/src/w360/pages/CombinedProperty.tsx`: crumbs, eyebrow, menu, tabs aria, not-found/failed copy (plus unrelated spacing).
- `apps/web/src/w360/pages/CombinedActions.tsx`: dialog titles and errors.
- `apps/web/src/w360/pages/CombinedLedger.tsx`, `CombinedFmb.tsx`: headings, empty bodies, map labels.
- `apps/web/src/w360/api.ts`: two mutation error labels.
- `apps/web/src/w360/pages/Properties.tsx`: combine hint, `dropCombine`, `selecting` on the flag (plus unrelated SortCycle swap).
- `apps/web/src/w360/Shell.tsx`, `RecordHead.tsx`, `Vault.tsx`: constant import and copy.
- `scripts/vocab-tests.ts`: VOC-0..5.
- `design.md`, `docs/specs/2026-09-25-combined-properties.md`: vocabulary row, approval, supersession.
- `tests/e2e-app/specs/04, 11c, 24, 27, 28, 29`, `tests/e2e-web360/specs/combined, screens, ux-record-combined`: copy assertions and the new hand-off test.

Full diff: `git diff` in the working tree, scoped to the files above.

</details>
