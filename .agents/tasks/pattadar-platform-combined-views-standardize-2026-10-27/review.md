# Combined views list brought up to the Properties page standard

The Combined views list used to be a bare `PageHead` with a row list. It now has the same page chrome as Properties. The head is the shared `PageHead`, with the eyebrow, the H1, an ⓘ and a computed summary line, plus right-aligned Export and "+ New combined view". Below it sits the shared `FacetFilter`, with its "N of M shown" tally and a new shared `SortCycle` chip. That chip was lifted out of the hand-built copies in Properties and Vault, so all three screens now compose one component. The filter, sort, summary and CSV rules live in a pure `combinedList.ts` with unit tests. The visible noun now has one source, `COMBINED_WORD` in `ui.tsx`, which the rail, crumbs and the Documents picker use. The rows themselves are unchanged.

Watch for:
- "+ New combined view" is a link to Properties. It does not open a create flow. This is deliberate and explained by the ⓘ, but the primary button drops the owner on a page that gives no hint about Combine (likely UX friction, non-blocking).
- The working tree also carries Vault, CombinedProperty and Properties edits that are not part of this task (confirmed present, origin unverified). Keep them out of this change's commit.

**Verdict**: APPROVED

## High-level view

The central requirement holds. `Combined.tsx` composes `PageHead`, `FacetFilter`, `SortCycle`, `Empty`, `Failed`, `Pill` and `downloadCsv` from `w360/ui.tsx`, inside the same `onecol` wrapper Properties uses. No layout is reimplemented on the page. The desktop screenshots line up with Properties: the eyebrow, H1, subtitle, head actions, filter row, tally and sort chip sit in the same positions.

The subtitle is `combinedSummary(shown)`. It uses `plural`, `num(x, 2) ac` and `inr`, the same forms as Properties' `portfolioLine`. Sq.yd and Sq.ft are separate parts and are never added to acres. Like Properties, it sums over the shown rows.

On global actions, Export reuses `downloadCsv`, so every cell goes through the `csvCell` formula guard. It exports the shown rows and is disabled when none are shown. New links to where creation actually lives. The Grid/List/Map toggle is omitted, and the file header and the spec give a concrete reason. Nothing is a half-flow or a fake toggle.

There are three filters: Records, Boundaries and Land. They use AND across groups and OR within a group, live in the URL, and drop options with a zero count. Five sort orders are offered, with the server's newest-first order as the default. The district facet is correctly deferred, because `placeLine` is a display string and not structured data.

## Issues (4)

1. **New button lands without guidance**: "+ New combined view" navigates to `/app/properties` and nothing there says to select records and press Combine. Consider the planned `?combine=1` hand-off, or a one-line hint on arrival, as a follow-up. Non-blocking.
2. **Filtered-empty panel is thinner than Properties'**: Properties' `emptypanel` has an explanatory `note` paragraph under the heading. Combined shows only the heading and "Clear filters". Add a short note for parity. Non-blocking.
3. **Unrelated edits in the same files**: the Vault head moves the region note into the ⓘ and adds a file/folder count. CombinedProperty adds a `.stack lg` wrapper and changes the member-card button row. Properties changes its subtitle `marginTop` from 0.5 to 0.375rem. Stage only the hunks for this task, or confirm each one belongs. Non-blocking.
4. **CSV filename follows the noun**: the filename stem comes from `COMBINED_WORD.many`, so a rename also renames exported files. That is probably intended. Note it in the rename checklist. Informational.

<details>
<summary>Details</summary>

### Shared composition and `SortCycle` lift

`SortCycle({ label, onNext, ariaLabel? })` renders the same `sortcycle` button that Properties and Vault used to write out by hand. Properties passes no `ariaLabel`, so its accessible name stays "Sort: As filed ⌄", which specs 03:801 and 03:840 rely on. Vault keeps its own `aria-label` and its `setPage(1)` reset. The name `COMBINED_WORD` contains an underscore, so the shadow counter in `shared-components-tests.ts` does not count it as a component.

### Head actions and their states

The head actions are hidden while loading (`!data`) and on an empty account (`virgin`), matching Properties' rule for empty accounts. The empty state keeps "No combined views yet" with "Go to Properties". The failed state keeps `Failed`. If a filter matches nothing, the emptypanel shows "Clear filters", which deletes only the three facet keys, so any other URL parameters survive (confirmed). Export failures go to `toast.bad(text, error)`, which matches the Toast API's signature.

### Sorting and summary details

`sortCombined` copies its input before sorting and never mutates it. "Largest extent" compares acres, then Sq.yd, then Sq.ft, and never converts between units. "Recently updated" puts dates that cannot be parsed last. The sort is not kept in the URL. That matches Properties, which keeps its sort in page state. `combinedSummary` prints acres only when the total is at least 0.005, the same threshold as Properties, so a plot-only list never shows "0.00 ac".

### Evidence

`verification.md` records the following:
- typecheck clean
- 340 web unit tests passing, 6 of them new
- all 19 `scripts/*-tests.ts` guards passing, including typography, shared-components and vocab
- icon and UX guards passing
- the new spec 29 at 9/9 and specs 26–29 plus 11c at 169/169
- computed styles: Atkinson Hyperlegible, weight 400/700 only, `tabular-nums` on the subtitle and tally

The failures in specs 03, 04 and 24 were checked against a baseline: the failure set with this change is a strict subset of the failure set without it. The causes are copy drift that already exists in the tree. No dates are rendered on this screen.

Not verified: the live API ordering for "Recently updated", `tests/e2e-web360`, and the root `bun run build`. Create and Open wiring are unchanged, so the gap is low risk.

</details>

<details>
<summary>File map</summary>

- `apps/web/src/w360/pages/Combined.tsx`: head, actions, filter row, sort, emptypanel; the rows are unchanged.
- `apps/web/src/w360/combinedList.ts` (new): facets, matching, sorts, summary, CSV rows.
- `apps/web/src/w360/combinedList.test.ts` (new): unit tests for the above.
- `apps/web/src/w360/ui.tsx`: `SortCycle` and `COMBINED_WORD`.
- `apps/web/src/w360/pages/Properties.tsx`, `Vault.tsx`: hand-built sort buttons replaced by `SortCycle`. Both files also carry unrelated edits.
- `apps/web/src/w360/Shell.tsx`, `CombinedProperty.tsx`, `RecordHead.tsx`: labels now come from `COMBINED_WORD`.
- `tests/e2e-app/specs/29-combined-list.spec.ts` (new): sealed list spec, including `@phone`.
- `docs/specs/2026-09-25-combined-properties.md`, `design.md`: the supersession note and where the constant lives.

Full diff: `git diff -- apps/web/src/w360 docs/specs/2026-09-25-combined-properties.md design.md`, plus the untracked files above.

</details>
