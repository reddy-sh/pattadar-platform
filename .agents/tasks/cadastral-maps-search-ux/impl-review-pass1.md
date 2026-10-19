# Cadastral maps search: one village search, floating matches, focus ring on the field

Tasks 5–7 make three changes to the Cadastral maps search:

- Task 5 moves the search pills' keyboard ring from the bare inner input onto the pill, and gives the Filter's own search row an inset ring.
- Task 6 removes the Filter popover's Village group, so the page header's search is the one way to find a village by name. Reddy approved this on 02/10/2026, and it sits in three hunks that revert on their own.
- Task 7 turns the village matches into a temporary surface under the search, over the map. It has rules for choosing, Escape, a press away, Tab out, and taking turns with the Filter popover.

All eleven new tests failed before their change and pass now. My own run of the three gate specs in both projects, the guards, the web typecheck and the unit tests reproduces the recorded evidence. Every hunk in the five files is either Tasks 5–7 or another session's, left as it was.

Watch for:

- Choosing a match puts focus back in the field on every activation. On a phone, that reopens the on-screen keyboard over the village that has just opened (likely; the suite has no on-screen keyboard to see this).
- The page closes FacetFilter's popover by clicking the component's `+ Filter` button through the DOM. design.md § App-surface rules leaves that dismissal to the component (confirmed).
- The matches are a third hand-built search-with-results surface, against § One component per concern (confirmed; within the approved scope, so Reddy needs to grant an exception).

**Verdict**: NEEDS_CHANGES (gate: CHANGES_REQUESTED)

## High-level view

The pill now draws the 2px ring: `.w360 .search:has(input:focus-visible)`. A new `.w360 .search input:focus-visible { outline: none }` at (0,3,1) beats the global `.w360 input:focus-visible` at (0,2,1). That makes the change app-wide. Every `.search` pill now rings the pill, the top bar's jump box, Documents, Photos, Shelf, the desk roster and the dialog searches included.

High Contrast gets `!important` rules at (0,4,1), which beat the global 3px `!important` ring at (0,3,0). The 3px ring moves to the container rather than shrinking. The `:has(input:focus-visible)` form is the same one `.rec .sel` already uses (HEAD `w360.css:1174`). Only the village pill (in both schemes) and the Filter row (in Dark) are tested, and only in Chromium.

The Village group goes, and the code now agrees with the 29/09/2026 design note and the sealed spec's label. The side effect is an empty Filter when there is no catalog: a failed `/vm/catalog.json` read returns `[]`, and some builds ship none. `+ Filter` then opens a popover with no groups that says "No filter options match that search." before anything is typed. The coder recorded this but did not fix it, because the fix needs a FacetFilter decision.

The matches float in the filter row's 700 stack, under the pill. Typing no longer moves the map: it moved 77px at red and moves at most 1px now, in both engines. A press outside the box or focus leaving it puts them away, and their own Escape keeps the page's plot-clearing Escape from running. That Escape is bound to focus being inside the box, though. After a successful removal unmounts the bin that was pressed, focus falls to the body, and Escape no longer puts the surface away.

`chooseVillage` calls `refocusFind()` on every activation. Keyboard users need it, because their row unmounts. On a tap, though, it reopens the on-screen keyboard on iOS and Android over the map that has just opened, where at HEAD the tap's blur left the keyboard closed. This is the one blocking item: hand focus back only for keyboard activation.

The surfaces take turns because `openFind` clicks FacetFilter's `.addfilter[aria-expanded="true"]`. That is the page dismissing the component's popover, coupled to its class names. Together with the third hand-built search surface, it is TODO-one-platform row 19 and Reddy's decision. Neither blocks this loop, because the brief ruled the shared-component change out.

My run passed all 116 `17-villages` tests. `01-shell` with `24-responsive` gave 179 failed and 132 passed, against a baseline of 163 and 148. Test by test, 20 tests fail now that passed at baseline. Each of them fails only on the console guard, on the seal's 400 for Home's root-level `auditTrail` query, and none is attributable to this change. `/app/maps` does not scroll sideways at 390 in either engine. The red logs match the current spec line for line. Twelve class locators in the new tests have no comment, although the report says every one does. Nine of the eleven new tests run in Chromium only.

<details>
<summary>Issues (8)</summary>

1. **Phone keyboard reopens after choosing a match** (blocking, likely). `chooseVillage` refocuses the field on every activation, so a tap reopens the on-screen keyboard over the village that has just opened. Refocus only on keyboard activation (`detail === 0`), or skip it after a touch `pointerdown`. Add an Enter-on-row test and a `@phone` tap test, and check that the tap test fails first.
2. **FacetFilter closed through its DOM** (non-blocking, confirmed). `openFind` clicks `.addfilter[aria-expanded="true"]`. That is a page-owned dismissal against design.md § App-surface rules, tied to private markup. Reddy's decision: a controlled-close or `onOpenChange` prop, a shared `SearchField`, or accept the overlap at 390 and remove the reach-in.
3. **Third hand-built search surface** (non-blocking, confirmed). The village matches are the third page-local search-with-results, against § One component per concern. Unlike the jump box and the plot finder, they have no combobox state and no arrow keys. Needs Reddy's explicit exception; TODO row 19 tracks the shared component.
4. **Empty Filter without a catalog** (non-blocking, confirmed). With `catalog = []`, `+ Filter` opens a popover with no groups that says "No filter options match that search." before anything is typed. Either hide `+ Filter` when no group has options, or have FacetFilter show the line only for a typed query (a `ui.tsx` change, Reddy's call).
5. **Escape needs focus inside the box** (non-blocking, confirmed from the code path). A successful removal from the matches, or a press on part of the surface that cannot take focus, drops focus to the body. Escape then stops putting the matches away. Refocus the field after a removal, or listen for Escape on `window` while `findShown`.
6. **Clipped ring on the match rows** (non-blocking, likely). `.vm-search-results > * { padding: 0 }` inside an unpadded scroller cuts off the first row's top ring edge and every row's left edge. Inset the rows' ring, or pad the scroller.
7. **Class locators without comments** (non-blocking, confirmed). Twelve class locators in the new tests lack the comment AUTHORING.md rule 2 asks for, although the report says they have it. Add a commented `matches(page)` helper or a comment per locator, and correct the report.
8. **WebKit and High Contrast coverage** (non-blocking, confirmed). Nine of the eleven new tests are Chromium-only. Nothing tests the High Contrast `.fpop-head` ring, the jump box's ring, the second Escape, Escape after a removal, or choosing by touch. Run the ring tests in the `phone` project where that means something, and add the missing cases.

</details>

<details>
<summary>Details</summary>

### The ring on the pill, in Dark and High Contrast

The cascade for a focused text input inside a `.search` pill:

```
Dark                                    specificity   result
.w360 .search input       outline:none  (0,2,1)       loses to the next line (later in source)
.w360 input:focus-visible 2px ring      (0,2,1)       was the ring inside the pill
.w360 .search input:focus-visible none  (0,3,1)       wins: the input draws nothing
.w360 .search:has(input:focus-visible)  (0,3,1)       2px ring, offset 1px, on the pill

High Contrast
.w360[data-scheme=hc] :focus-visible         3px !important  (0,3,0)
.w360[data-scheme=hc] .search input:f-v      none !important (0,4,1)  wins on the input
.w360[data-scheme=hc] .search:has(input:f-v) 3px !important  (0,4,1)  on the pill, offset 2px
.w360[data-scheme=hc] .fpop-head:has(...)    3px !important  (0,4,1)  inset, offset −5px
```

None of the ring tests runs in WebKit. Text inputs match `:focus-visible` there as well, so the selectors should hold, but nothing proves it.

### An empty Filter when there is no catalog

FacetFilter shows its empty line whenever no group has options, whatever has been typed (`ui.tsx:628`):

```tsx
{visibleGroups.length === 0 && (
  <p className="fpop-empty">No filter options match that search.</p>
)}
```

With `catalog = []`, both groups that remain are empty. Before this change, the Village group filled the popover from the index. Every `ground()` test runs in this state, but no test opens `+ Filter` in it.

In production, `vm-publish.py` refuses to publish without a catalog. So this needs one of three things: a failed fetch, a local run without `.local/vm-build`, or an older `/vm/` build. There are two possible fixes:

- FacetFilter shows the line only when a query is typed. That is a `ui.tsx` contract change, so it is Reddy's decision.
- The page hides `+ Filter` when no group has options.

### How the floating matches close

```
.filterbar (FacetFilter root; a press inside it does not close the popover)
 ├─ + Filter   chips   Clear all   tally   │
 └─ span.vm-find  ← findBox: pointerdown/blur/keydown boundary
     ├─ span.search.vm-village-search > input   (onChange/onFocus/onClick → openFind)
     └─ div.vm-find-results (absolute, z 30 in the row's 700 stack)
         ├─ div.rows.vm-search-results (scroller, 12.5rem)  rows: villagerow + bin
         └─ p rmErr (while open)
```

The box's `onKeyDown` handles Escape (`VillageMaps.tsx:1011-1018`), so Escape only works while focus is inside the box. Two ways out of that are confirmed from the code path, and neither is tested:

- A successful removal takes the pressed bin out of the DOM while other matches stay listed. Chromium had focused that bin, so focus falls to the body. The matches stay open, and the next Escape reaches only the page's handler, which clears the plot instead.
- A press on part of the surface that cannot take focus ends the same way, for example on "No cadastral map on file matching that."

Refocusing the field after a removal from the matches fixes the common case. A window-level Escape listener while `findShown`, FacetFilter's own pattern, covers both.

The compact rows also clip the keyboard ring (likely). `.vm-search-results > * { padding: 0 }` (`w360.css:4350`) puts each row button against the top and left edges of a scroller that has no padding, and `overflow-y: auto` clips both axes. A ring drawn outside the button loses its top edge on the first row and its left edge on every row. In Dark that is the browser's own ring; in High Contrast it is 3px at a 2px offset.

The left-edge clip predates this change, because `.rows > *` never had horizontal padding. The first row's top edge is new, because the old rows had 0.75rem of vertical padding. The plot finder whose compactness these rows copy never needed room for a ring, because it keeps focus in its input through `aria-activedescendant`. These rows are Tab stops. An inset ring on the rows, like `.strip-link`'s −3px, or a few pixels of padding on the scroller, keeps the ring whole.

### Choosing a match reopens the phone keyboard

```tsx
const chooseVillage = (entry: VillageEntry) => {
  openVillage(entry.village, entry);
  setQ('');
  setFindOpen(false);
  refocusFind();            // every activation: Enter, mouse click, or a tap
};
```

On a phone, tapping a row blurs the field and the keyboard closes. The code's own comment (`:1006-1008`) notes that Safari "hands focus to nothing" on that press. The `focus()` then runs inside the tap's click handler, so it counts as user-initiated. On iOS Safari and Android Chrome, that reopens the on-screen keyboard over the village map that has just opened, and iOS may scroll the page to keep the field in view. If the reader taps the map to put the keyboard away, that same tap can select a plot.

At HEAD, the row's click only opened the village. The jump box, which the report calls this surface's precedent, does not refocus after a choice either. The plot finder does keep focus in its input, through `onMouseDown` preventDefault, but there the reader stays on the same map and may type another number.

Confidence is likely. Playwright has no on-screen keyboard, and the test that asserts focus comes back (`17-villages.spec.ts:861`) is Chromium-only and uses a mouse click.

A keyboard user still needs the refocus, because the focused row unmounts. So keep it for keyboard activation only: the row's click carries `detail === 0` for Enter and Space. Alternatively, skip it when the box's last `pointerdown` had `pointerType === 'touch'`. Two tests prove it:

- Enter on a row returns focus to the field.
- A `@phone` test taps a match and expects the field not to be focused. Check that this one fails first, because WebKit's tap may behave differently.

### FacetFilter dismissed from the page, and a third search surface

```tsx
const openFind = () => {
  setFindOpen(true);
  findBox.current?.closest('.filterbar')
    ?.querySelector<HTMLButtonElement>('.addfilter[aria-expanded="true"]')?.click();
};
```

design.md § App-surface rules (`design.md:528-531`) says pages "do not introduce their own select bars, filter drawers, search-as-filter layouts, or dismissal behavior". FacetFilter's doc comment also keeps opening and dismissal inside the component. On this page, typing in the trailing search now closes the Filter, which no other FacetFilter page does. The page relies on two private details, the `.addfilter` class and `aria-expanded`. If either changes, the take-turns test (`:939`) fails, so the break would not be silent.

Without the reach-in, the two surfaces open in the same place at 390. The brief did not ask for take-turns, though. It is one of the three tests the coder added, and it is the only reason the page reaches into the component.

§ One component per concern (`design.md:514-527`) says a concern's second copy "is the moment to lift it into `ui.tsx`, never a third page-local copy". The matches are the third copy, after the jump box (`Shell.tsx`) and the plot finder in this same file. They also behave unlike both. The jump box and the plot finder are comboboxes, with `aria-expanded`, `aria-controls`, arrow keys and Enter. The village search has none of these, and its rows are Tab stops.

The report and TODO row 19 already put both points to Reddy. He has three options:

- add a controlled-close prop or an `onOpenChange` to FacetFilter;
- lift a `SearchField`;
- accept the overlap at 390 and drop the reach-in.

### Gate evidence, re-run

I ran sealed tests only, from `tests/e2e-app`, against :5173 (which answered 200 first):

```
playwright test specs/17-villages.spec.ts specs/01-shell.spec.ts specs/24-responsive.spec.ts --project=app --project=phone --reporter=line --output=.local/impl-scratch/cadastral-search-pw-review
```

That is 427 tests in 5.1 minutes. The log is `.local/impl-scratch/cadastral-search-pw-review.log`.

`17-villages` passed 112 of 112 in `app` and 4 of 4 in `phone`. In WebKit, three things pass:

- the two new `@phone` tests;
- the tap-to-choose path, through the existing `@phone` tests that open a village with `openVillage`;
- the `/app/maps` sideways sweep (`24-responsive.spec.ts:548`), together with the new `@phone` test's own `scrollWidth` check, in both projects.

`01-shell` with `24-responsive` gave 179 failed and 132 passed, against a baseline of 163 and 148. Compared by project, spec and line:

- 20 tests fail now that passed at baseline, all in `01-shell [app]`.
- 5 tests that failed at baseline now pass.
- The 156 failures common to both runs have the same first errors.

Each of the 20 fails on one error only: the console guard at `harness.ts:161` catching `Failed to load resource … 400`. The trace for `:510` shows the 400 is the seal refusing `query { auditTrail … }` from `RecentActivity` in `Dashboard.tsx`. That component is in HEAD, and another session has since rewritten the file. The 400 lands about 180ms before the test's last click. Four facts tie the 20 to that seal, not to this change:

- `VillageMaps` is behind `lazy()` (`routes.tsx:107`) and never loads on `/app`.
- CSS cannot send a request.
- Ten of the twenty, the rail, top bar and drawer tests, never focus a `.search` input.
- The coder's `--repeat-each` logs show the same tests both passing and failing within one run.

The red evidence holds. `cadastral-search-pw-red.log` has 12 failures across 10 tests, because the 2 `@phone` tests fail in both projects. Each test failed on its own product assertion. Its 60 code frames match the current spec, allowing for the 16-line shift that the later late-refusal test caused. `red2` matches `:2350-2354` and shows the fallback line is what makes the late-refusal test pass.

The snapshots hold too. From the baseline snapshot to the pre-product one, only other sessions' hunks appear: the Overview, gapline and compact-card rules, and the W01 hunks in the design doc. From pre-product to now, every hunk is Tasks 5–7.

The files that had to stay unchanged are unchanged against HEAD, and none has an untracked file beside it: `design.md`, `ui.tsx`, `Shell.tsx`, `tests/e2e-app/fixtures/` and the Playwright config. The only copy that changed is the approved placeholder.

The other checks:

- Every guard passes except `typography-tests.ts` TY-5. TY-5 flags `font-weight: 800` at `apps/university/src/styles.css:1488/1520/1538`, which came in with commit 641ddb5 and is not modified in the tree.
- The `apps/web` typecheck is clean.
- `bun test apps/web/src` passes all 98 tests.
- `git diff --check` is clean.

### Tests and authoring

The tests follow the harness imports, sentence titles, `@phone` tags and no `waitForTimeout`, and the late-refusal test inherits the describe's commented `allowConsole`. What is missing is comments on class locators. AUTHORING.md rule 2 asks for one on every class locator, and the report says each has one, but twelve in the new tests have none (confirmed):

- `.vm-villages .villagerow`, seven times
- `.vm-villages`, twice
- `.vm-map-filters`
- `.vm-stage`
- `.vc-village`

They follow the spec's existing selectors. One `matches(page)` helper, with a comment saying the container has a label but no role, would cover most of them.

Nine of the eleven new tests run only in Chromium, because the `phone` project greps `@phone`. These are not tested anywhere:

- the High Contrast `.fpop-head` ring;
- the jump box's new ring, in either scheme;
- the second Escape reaching the page's handler;
- Escape after a removal from the matches;
- choosing a match by touch.

</details>

<details>
<summary>File map</summary>

- `apps/web/src/w360/w360.css`:
  - the ring moves to `.search` pills (226–233);
  - an inset ring on `.fpop-head` (2072–2078);
  - the `.vm-find`/`.vm-find-results` surface and compact rows (4331–4354), full width at ≤42rem (4360), hidden in print (4474);
  - the High Contrast container rules (5107–5128).
- `apps/web/src/w360/pages/VillageMaps.tsx`:
  - Task 6: the Village group, its toggle branch and the old placeholder removed.
  - Task 7: the `findOpen` state, refs and press-away listener; `openFind`, `refocusFind` and `chooseVillage`; the `.vm-find` box with its blur and Escape handling; the matches moved into it; the refusal fallback line.
- `tests/e2e-app/specs/17-villages.spec.ts`: the `twoMandals()` and `ring()` helpers, and eleven new tests (672, 861–1018, 2340, 2446).
- `docs/specs/2026-08-15-web-360-design.md`: an "Updated 03/10/2026" note in the Cadastral maps block.
- `docs/specs/TODO-one-platform.md`: row 19, Search with results.

Full diff: `git diff HEAD -- <file>`. For Tasks 5–7's hunks alone: `diff -u .local/impl-scratch/cadastral-search-preproduct/<path> <path>`.

</details>
