# Cadastral maps search: one village search, matches over the map, the ring on the field, and a Filter the page can close

Tasks 5–7 make three changes to the Cadastral maps search:

- Every search pill's keyboard ring moves onto the pill.
- The Filter popover's Village group goes, as Reddy approved on 02/10/2026.
- The village matches float over the map, with their own rules for choosing, Escape, a press away and Tab out.

Since the first review (now `impl-review-pass1.md`), the coder has fixed the findings that needed no decision, including the blocking one:

- A tap on a match no longer puts focus back in the field.
- Escape after a removal reaches the matches from `window`.
- The match rows draw inset rings.
- The class locators are commented, and the WebKit and High Contrast cases are covered.

The other three findings went to Reddy, and his 03/10/2026 decisions are carried out:

- An optional `ref` handle on `FacetFilter`, whose `close()` replaces the page's DOM click on `+ Filter`.
- Its "No filter options match that search." line now waits for a typed query.
- An exception to § One component per concern for the village search, tracked as TODO-one-platform row 19.

My sealed run passes all 134 `17-villages` tests in Chromium and WebKit. No failure in `01-shell` or `24-responsive` comes from this change, and the guards, the typecheck and the unit tests all pass.

Watch for:

- The empty-line rule keeps the line in popovers without a search. That is the coder's reading of "only once a query has been typed". report.md flags it for Reddy, but TODO-one-platform row 20 records it as what he approved (confirmed).
- Another session's palette migration rewrote this task's High Contrast block and its spec helper after iteration 2. The scheme now sits on `<html>`, and the pill's ring has a 3px offset and a halo. The one-ring intent survives and the tests pass in both engines, but report.md does not describe the block as it now stands (confirmed).
- Four of the twenty new tests never failed first. Two guard behaviour that was already right, and two cover iteration-1 CSS written before them (confirmed; red-runs.md says so).

**Verdict**: APPROVED

## High-level view

In Dark, the pill draws the ring and the input inside it draws none, on every search pill in the app. The rule copies `.slot:has(a:focus-visible)` (8c6a2d4:3052–3053) and the `:has(input:focus-visible)` selector `.rec .sel` already uses (8c6a2d4:1174). In High Contrast, the global ring now comes from `theme.ts` at (0,2,0) `!important`. This task's rules, rewritten by the palette session, sit at (0,4,1) and (0,4,0) `!important`, so there is still one 3px ring, on the container. The ring tests pass in both engines.

A choice from the matches puts focus back in the field after a key or a mouse, but not after a finger. When focus has fallen out of the box, the window Escape handler puts showing matches away. The rows and their bins draw their rings inset. The tests for these three fixes failed first and pass now. Two paths are untested: tapping the field, then pressing Enter on a row, and a mouse choice in WebKit.

The FacetFilter changes are additive and inside the approval:

- Only VillageMaps passes `ref`.
- Only Vault and VillageMaps pass `searchPlaceholder`.
- The eleven other call sites behave as before.

The new condition, `(query.length > 0 || !searchPlaceholder)`, keeps the line wherever nothing can be typed. That reading is defensible, but it is the coder's, and TODO row 20 should not present it as Reddy's.

Compared test by test with the baselines:

- `17-villages` has no failures. Both baseline failures now pass.
- `24-responsive` has no failure that is new against either baseline.
- `01-shell`: 11 tests fail now that passed on 02/10, and 11 that failed then now pass. Each new failure, against either earlier run, fails only on the harness console guard. A trace shows the 400 behind it: the seal refusing Home's root-level `auditTrail` query.

`/app/maps` does not scroll sideways at 390 in either engine. The snapshots show only Tasks 5–7 hunks, or other sessions' hunks left intact. Fixtures and the Playwright config are untouched. The only copy that changed is Task 6's approved placeholder, "Search districts or mandals".

<details>
<summary>Issues (3)</summary>

1. **Empty-line reading recorded as approved** (non-blocking, confirmed). `ui.tsx:647` keeps "No filter options match that search." in popovers without a search, but the approval reads "only once a query has been typed". TODO row 20 calls the whole behaviour "as Reddy approved". Reddy confirms the reading, or the `|| !searchPlaceholder` term goes. Until he does, row 20 should keep his approval apart from the coder's reading.
2. **Four new tests never ran red** (non-blocking, confirmed). "Enter on a matching village…" and "once the matches are away, the next Escape…" guard behaviour that was already right. The High Contrast Filter-row test and the top bar ring test cover iteration-1 CSS written before them. If a red record is wanted, run the last two with their rule removed, as was done for the late-refusal test.
3. **Choice paths without a test** (non-blocking, confirmed). Nothing tests the key-press reset of `findTapped` (tap the field, then Enter on a row, and focus comes back), and nothing tests a mouse choice in WebKit. Add a `@phone-only` test for the first, and tag or copy the mouse test for the second.

</details>

<details>
<summary>Details</summary>

### High Contrast after the palette migration

By 14:01 on 03/10, when `w360.css` was last written, another session had made these changes:

- moved the scheme from `.w360[data-scheme]` to `<html data-scheme>`;
- renamed `--color-focus` to `--w-focus` in this task's rules;
- moved the global High Contrast ring into `apps/web/src/theme.ts`;
- rewritten this task's block (`w360.css:5166–5192`):
  - the selectors became `[data-scheme='highContrast'] .w360 …`;
  - the pill's ring moved to a 3px offset, with a 3px halo as a `box-shadow`;
  - the inner inputs and the match rows gained `box-shadow: none`.

```
High Contrast (current tree)                                specificity     result
[data-scheme=hc] :focus-visible          theme.ts, Emotion  (0,2,0) !imp    3px ring, 3px offset, halo
[data-scheme=hc] .w360 .search input:focus-visible          (0,4,1) !imp    none, no halo: the input draws nothing
[data-scheme=hc] .w360 .search:has(input:focus-visible)     (0,4,1) !imp    3px on the pill, 3px offset, halo
[data-scheme=hc] .w360 .fpop-head:has(input:focus-visible)  (0,4,1) !imp    3px inset at −5px, no halo
[data-scheme=hc] .w360 .vm-search-results :focus-visible    (0,4,0) !imp    offset −3px, no halo; 3px from the global
```

Nothing in `apps/web/src` uses `@layer`, and MUI is not set to `enableCssLayer`. So a layered `!important` declaration cannot outrank these unlayered ones, and specificity alone decides between them.

The same sweep changed the spec's `highContrast()` helper (`17-villages.spec.ts:376–385`) to read `html`, in the words it used in `02-dashboard`. Neither change is in report.md, and neither reverts Tasks 5–7.

The pill's High Contrast ring now reaches 6px past the pill, with the halo inside that. The pill tests read only the computed style, so nothing measures whether that ring is whole. `.filterbar` and `.vm-map-filters` set no `overflow`, so nothing in the row should clip it (likely; not measured).

### Tap-aware refocus and Escape from outside the box

```
span.vm-find  ← findBox: onPointerDown sets findTapped (pointerType !== 'mouse'),
 │                       onKeyDown clears it, then handles Escape while findShown
 ├─ span.search.vm-village-search > input
 └─ div.vm-find-results
     ├─ div.rows.vm-villages.vm-search-results   row → chooseVillage(v)
     └─ p rmErr
window keydown: findShown && findBox.current → put the matches away, nothing else
```

`chooseVillage` (`VillageMaps.tsx:630–635`) skips the refocus only when `findTapped` is set. A key press anywhere in the box clears the flag. So a reader who taps the field and then presses Enter on a row is meant to get focus back, but no test covers that path (confirmed).

Nothing tests a mouse choice in WebKit either:

- The mouse test, "choosing a matching village closes the matches and clears the search", is Chromium-only.
- WebKit runs only the Enter and tap tests.

### FacetFilter's handle and the empty line

```tsx
export interface FacetFilterHandle { close: () => void; }      // ui.tsx:481
…  searchPlaceholder, ref, }: { …; ref?: RefObject<FacetFilterHandle | null>; }
useImperativeHandle(ref, () => ({ close }));                   // ui.tsx:559
{visibleGroups.length === 0 && (query.length > 0 || !searchPlaceholder) && (
  <p className="fpop-empty">No filter options match that search.</p>   // ui.tsx:647
)}
```

There are now thirteen `<FacetFilter` call sites. That is two more than the coder counted: other sessions have since added Groups and Holdings.

- Only VillageMaps passes `ref`.
- Only Vault and VillageMaps pass `searchPlaceholder`.
- No page file names `.addfilter` any more.

decisions.md records option (a) as "FacetFilter shows that line only once a query has been typed", adding "With no query and no options, nothing shows below the search row."

- The `|| !searchPlaceholder` term keeps the line in the eleven popovers that have no search. Read literally, the approval would leave those popovers as empty boxes when a list offers nothing. The coder chose the narrower reading and flagged it in report.md ("For review").
- TODO row 20 reads "Fixed as Reddy approved on 03/10/2026: … A popover without a search, where nothing can be typed, still says it". That records the reading as part of the approval, and decisions.md says not to describe his reply as more than it was (confirmed).

### Gate evidence, re-run

I ran sealed tests only, from `tests/e2e-app`, against :5173 after `curl` printed 200:

```
APP_WEB_URL=http://localhost:5173 ./node_modules/.bin/playwright test specs/17-villages.spec.ts \
  specs/01-shell.spec.ts specs/24-responsive.spec.ts --project=app --project=phone --reporter=line \
  --output=/Users/reddy.sh/reddy.sh/projects/pattadar-platform/.local/impl-scratch/cadastral-search-pw-review
```

That ran 453 tests in 3.9 minutes: 293 passed and 160 failed. The log is `.local/impl-scratch/cadastral-search-pw-review3.log`. By spec:

- `17-villages`: 120 of 120 pass in `app` and 14 of 14 in `phone`. All twenty new tests pass, and every `@phone` one passes in WebKit too.
- `24-responsive`: 44 fail in `app` and 45 in `phone`.
  - Against the 03/10 18:39 baseline, nothing new fails, and one `phone` test now passes.
  - Against the 02/10 baseline, nothing new fails either.
  - `:548` passes for `/app/maps` in both projects, and so does the new `@phone` test's `scrollWidth` check with the matches open.
- `01-shell`: 65 fail in `app` and 6 in `phone`. Only the 02/10 baseline covers this spec.
  - Against that baseline, the `phone` failures are the same 6. In `app`, 11 tests fail now that passed then, and 11 that failed then pass now.
  - The palette session added nine theme-menu tests, and all nine pass.
  - Against the coder's iteration-2 run, 6 `app` failures and 1 `phone` failure are new, and 15 of its failures now pass.

Together that is 15 new failures. Each one fails on one error only: the console guard at `harness.ts:161`, catching "Failed to load resource … 400 (Bad Request)". In the trace for the jump box's Escape test, the 400 answers `POST /api/gateway/pattadar/graphql` with `query { auditTrail { … } }`. That is Home's root-level query, the same cause both earlier reviews found. None of it comes from this change:

- VillageMaps is lazy-loaded and never runs on `/app`.
- Neither the CSS nor the FacetFilter change sends a request.
- The same tests pass in one run and fail in the next.

The red evidence holds:

- The finding-4 test failed on its own assertion (`cadastral-search-pw-ff-red.log`, frame `:744`).
- The iteration-2 red run (`cadastral-search-pw-iter2-red.log`) has 7 failures, each on a product assertion:
  - the tap, at `:2644`;
  - removal-then-Escape, at `:1002`;
  - the two `ringWhole` checks, at `:1155` and `:1171`.
- Those frames sit 22 or 25 lines lower in the current spec (`:2669`, `:1024`, `:1180`, `:1196`), which matches the lines inserted above them since.
- The first review checked iteration 1's red evidence.

Four tests never failed first:

- "Enter on a matching village…" guards the keyboard path through the tap fix.
- "once the matches are away, the next Escape is the page's again…" guards an Escape that was already right.
- "in High Contrast the Filter's own search keeps one 3px ring…" covers iteration-1 CSS written before it.
- "the top bar's search draws its ring…" covers iteration-1 CSS in the same way.

Read against the CSS, each of the last two would fail without its rule. Without the High Contrast `.fpop-head` rule, the row keeps the 2px Dark ring. Without the two `.search` rules, the pill is bare and the input draws the ring. Neither has a recorded red run (confirmed).

The snapshots hold:

- `w360.css`:
  - From pre-product to `iter2-approved-start`, the diff is this task's five hunks and nothing else.
  - From there to now, there are 74 hunks of other sessions' work, the palette migration nearly all of it. They touch this task's lines only as the High Contrast section above describes.
- `VillageMaps.tsx`: since pre-product, only this task's hunks.
- `17-villages.spec.ts`: since pre-product, only this task's hunks, apart from the palette session's helper line.
- TODO doc: rows 19 and 20 are this task's. Rows 4, 6, 8, 13 and 17 and the One palette section are other sessions'.
- `ui.tsx`: the diff from the pre-edit copy is five hunks, which together make the two approved changes. The other sessions' `TabStrip`/`TabPanel`, `SortCycle`, `HOLDING_WORD` and type-import block are intact.

`tests/e2e-app/fixtures/` and the Playwright config have no change and no commit since 8c6a2d4. The changes in `design.md` and `Shell.tsx` belong to other sessions: the palette, the Holdings wording, the Network section and the theme choice.

The other checks:

- All 22 guards exit 0: every `scripts/*-tests.ts`, plus `icon-guard.ts` and `ux-guards.ts`. `typography-tests.ts` now passes as well, after another session fixed `apps/university`.
- `apps/web` `tsc --noEmit` is clean.
- `bun test apps/web/src` passes 358 of 358.
- `git diff --check` is clean on the six files.
- The coder's before/after comparison for `03`, `05`, `06` and `11c` holds, checked from the coder's logs without a re-run. The one new `05` failure also fails in the second baseline sample.

### Tests and authoring

The new tests meet AUTHORING.md:

- They import from the harness and use role, label or text locators.
- Every class locator has a comment, on the line or in the `matches()` and `matchRows()` helpers.
- There is no `waitForTimeout`.
- The titles are sentences in the founder's voice, with `@phone` and `@phone-only` where they belong.
- The late-refusal test inherits its describe's commented `allowConsole`.

Apart from the four tests without a red run and the two choice paths above, the gaps are on the coder's own list:

- a real on-screen keyboard;
- real iOS and Android;
- Vault's popover with no files and nothing typed, which the new condition reaches and no test opens.

An untracked `1500` sits at the repo root: an empty curl cookie jar, written at 19:36:33 during this review. None of my commands and none of the coder's logged steps write one, so it belongs to another session. I left it alone, but a `git add -A` would commit it.

</details>

<details>
<summary>File map</summary>

- `apps/web/src/w360/w360.css`:
  - the ring on `.search` pills (228–231) and the inset ring on `.fpop-head` (2125–2128);
  - the `.vm-find`/`.vm-find-results` surface, the compact rows and their inset rings (4388–4411);
  - full width at ≤42rem (4417), and hidden in print (4531);
  - the High Contrast block (5166–5192), since rewritten by the palette session.
- `apps/web/src/w360/pages/VillageMaps.tsx`:
  - Task 6: the Village group, its toggle branch and the old placeholder removed.
  - Task 7:
    - `findOpen`/`findShown` (142–144);
    - the refs and `findTapped` (172–183);
    - the window Escape branch (300–303) and the press-away listener (322–333);
    - `openFind`, `refocusFind` and `chooseVillage` (608–635);
    - `ref={facetFilter}` and the `.vm-find` box (1006–1084);
    - the refusal fallback (1092).
- `apps/web/src/w360/ui.tsx`:
  - `FacetFilterHandle` (481–485);
  - the doc comment and the optional `ref` (487–519);
  - `useImperativeHandle` (559);
  - the empty-line condition (644–650).
- `tests/e2e-app/specs/17-villages.spec.ts`: the helpers (313–385), and twenty new tests at 709, 730, 920–1201, 2521, 2628 and 2654.
- `docs/specs/TODO-one-platform.md`: row 19 (the handle and Reddy's exception) and row 20 (done).
- `docs/specs/2026-08-15-web-360-design.md`: the "Updated 03/10/2026" note in the Cadastral maps block.

Full diff: `git diff HEAD -- <file>`. For Tasks 5–7 alone: `diff -u .local/impl-scratch/cadastral-search-preproduct/<path> <path>`, read with the palette session's rewrite described above.

</details>
