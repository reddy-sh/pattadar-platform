# Families & groups: Safeguard tab, shared TabStrip, Members filter and Print

The inactivity safeguard is no longer an accent-bordered box above every tab. It is a fourth tab, Members · Properties · Safeguard · Activity, and Members is the default. The tab draws a `!` or `✓` glyph, and its word ("needs action" / "set") sits in the button's `aria-label` and the glyph's tooltip. The page-local tab strips in Groups.tsx and Tools.tsx are replaced by one `TabStrip`/`TabPanel` in `ui.tsx`. The Members table gets the shared `FacetFilter` (Relationship/Role and Status). The page head gets a Print button, and New group becomes outlined. The safeguard and facet rules live in a pure, unit-tested `groupsView.ts`. Coder evidence is complete: typecheck, the full guard suite, 7 unit tests, and 21/21 sealed e2e on app+phone. Failure paths are covered too. The failures in other specs are pre-existing and traced to in-flight work elsewhere.

Watch for: the `closed_*` stages show "needs action" under the literal rule (DP-1, waiting on Reddy). Two e2e comments and one test title still describe the earlier visually-hidden-word design (confirmed, cosmetic).

**Verdict**: APPROVED

## High-level view

The tab state rides in `?tab=`, the way Tools carries its tab. Members leaves the URL. An unknown value, or `safeguard` on a type without a family tree, falls back to Members. Choosing another group drops `tab`. The status rule is Reddy's literal one, from `safeguardNeedsAction`: any contact gap, `delivery_attention`, or any stage other than `active`. The accessible name is built as "Safeguard, needs action" through `aria-label`, so the status never rests on glyph or colour alone. The visible label stays at the start of the name, so Label-in-Name holds. Reddy changed the design mid-loop to draw only the glyph, and design.md's vocabulary row now matches that change.

`TabStrip` was moved into `ui.tsx` verbatim. `role="tablist"`/`role="tab"`, roving `tabIndex`, `aria-controls`, and Arrow/Home/End with focus follow are all preserved. The new pieces are the `n zero` dimming and the optional `status` slot. Tools uses it for both of its strips (TOOL_TABS and CALC_TABS) and has no page-local copy left. `shared-components-tests.ts` drops the Groups budget and Tools' `tabs: 1`, and SC-0 now requires the `TabStrip`/`TabPanel` exports.

The Safeguard tab is composed from `SectionHead` (imported from RecordHead, as Orders does) and `StatusChip`. The explanation moved behind ⓘ word for word. "Configure notifiers" is the tab's one filled action. The problem rows are `StatusChip state="warn"`, so routine reminders no longer use the danger `Chip tone="alert"`. The CSS uses `--w-warn`/`--w-ok`/`--w-danger` only, with no accent and no colour literals. The new weights are 400 and 700 only.

The header is a `.grouphead` grid. Below 640px it becomes name and kebab, then facts, then "See its N properties". The two phone overflows the coder found are fixed in CSS: the nowrap warn chip and the laid-out ⓘ tip. The filter mirrors Properties' and Documents' FacetFilter usage. That includes the tally, the filtered-to-nothing `Empty` with Clear filters, and dropping stale selections. Its options are the exact words the cell prints, because both use `memberRelationWord`. Print is `window.print()` through the shared `@media print` sheet, after VillageMaps. Aadhaar stays masked, because the client only ever receives `aadhaarMasked`. The table renders it through `formatAadhaarMask`, and the spec asserts that no 12-digit run appears in print media.

<details>
<summary>Issues (4)</summary>

1. **Stale e2e comment (confirmed, non-blocking).** `30-groups.spec.ts:70-71` says the word is "the visually hidden end of the tab's name". It is the button's `aria-label` now, so reword the comment.
2. **Stale test title (confirmed, non-blocking).** `30-groups.spec.ts:130` is titled "keeps its word on a phone", but no word is drawn. Retitle it, for example "the Safeguard tab fits a phone without sideways scroll".
3. **Closed stages read "needs action" (confirmed, Reddy decision).** `closed_head`/`closed_family` set the tab to `!` under the literal rule (DP-1). Leave it until Reddy rules.
4. **Header JSX indentation (confirmed, nit).** `Groups.tsx` `.grouphead` children kept the old nested indentation. Re-indent them one level for readability.

</details>

<details><summary>Details</summary>

### Safeguard status and its accessible name

The plan's step 9 said "don't edit design.md", which predates Reddy's DP-7 approval. The vocabulary row and the approval line were added after it, and they record exactly the glyph-only design that shipped.

DP-1 is a real product question. A cycle closed by the head or acknowledged by family is not obviously something the owner must act on, yet the tab shows `!`. The chip itself is `unknown` (neutral), so the panel and the tab disagree in tone for those two stages. The code follows the literal rule Reddy gave. It is flagged here, not changed.

### Tests

`30-groups.spec.ts` covers tab order, the default, both status names and glyphs, warn-not-danger, the partnership fallback, deep links, the keyboard, every mutation with its refusal path, filter narrowing and empty state, print masking, button fill count, and the phone header geometry. Not tested: saving through PersonDialog (addMember) on /app/groups. That form is still covered on /legacy/groups by 07-record-people. Also not tested: the `delivery_attention` row rendering in the Safeguard panel (the unit test covers the state, not the DOM).

</details>

<details>
<summary>File map</summary>

- `apps/web/src/w360/ui.tsx`: new Tabs section, `TabStrip` (status slot, `n zero`), `TabPanel`, and their types.
- `apps/web/src/w360/w360.css`: `.tabs .tabstatus*`, `.schip-lines` wrap, `.grouphead` grid, and the phone ⓘ anchor.
- `apps/web/src/w360/pages/Groups.tsx`: Safeguard tab, `?tab=`, header grid, Print, outlined New group, Members FacetFilter, local TabStrip/SAFEGUARD_STAGE/cap removed, header comment fixed.
- `apps/web/src/w360/pages/Tools.tsx`: local TabStrip/Panel removed, uses the shared ones (other hunks belong to the user's in-flight work).
- `apps/web/src/w360/groupsView.ts` + `.test.ts`: the safeguard stage, state and tab status, plus the member facets and matching.
- `scripts/shared-components-tests.ts`: budgets lowered, OWNER/doc updated, SC-0 requires TabStrip/TabPanel.
- `tests/e2e-app/specs/30-groups.spec.ts`: new sealed acceptance spec.
- `tests/e2e-app/specs/07-record-people.spec.ts`: stale "signpost" comment rewritten.
- `design.md`, `docs/specs/TODO-one-platform.md` item 4, and `docs/specs/2026-09-19-family-household-management-functional-design.md` §19: placement and vocabulary recorded.

Full diff: `git diff -- apps/web/src/w360/pages/Groups.tsx apps/web/src/w360/ui.tsx apps/web/src/w360/w360.css scripts/shared-components-tests.ts tests/e2e-app/specs/07-record-people.spec.ts` plus the untracked `groupsView.ts`, `groupsView.test.ts` and `30-groups.spec.ts`.

</details>
