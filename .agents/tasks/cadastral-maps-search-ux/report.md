# report — Cadastral maps search, and the heuristic-ux-audit blind spot

## Final report (Task 8, 03/10/2026)

The audit skill now captures and judges interaction states, and the Cadastral
maps screen is fixed for the approved findings. Typing a village name no
longer moves the map: it moved 146 px before, at 1512 and at 390, and moves
0 px now. Choosing a match puts the matches away. Keyboard focus draws its
ring on the field you see. The Filter narrows by District and Mandal only.

- The AFTER capture repeats every BEFORE state under the same file names.
- `17-villages` passes 134 of 134 in Chromium and WebKit.
- No failure in `01-shell` or `24-responsive` is new except the harness's
  console guard, which is not caused by this change.
- Main checkout, HEAD c685d22 plus the working tree. Nothing committed or
  pushed.
- The sections below this one are the task's running log, oldest first, kept
  as written. They name logs under `.local/impl-scratch/` that this step
  deleted (Cleanup below), so those names are historical.

### Approved decisions

decisions.md records each one verbatim. None is described here as more than
the reply it came from.

- **02/10/2026, the plan.** Reddy replied "yes please" to "Does this plan look
  good?".
  - (1) Remove the Filter popover's Village group (option a). The Filter
    narrows by District and Mandal, and the header search finds a village by
    name.
  - (2) The parallel session editing heuristic-ux-audit was finished, so the
    skill edits could go ahead.
  - Task 6 was to stay in small hunks that can be reverted on their own.
- **03/10/2026, findings 2–4 of the implementation review.** Reddy replied
  "proceed with recommendations".
  - Finding 2, option (a): an optional `ref` handle on `FacetFilter`, in
    place of the page's DOM click.
  - Finding 3, option (a): an exception for the third page-local search
    surface, tracked as TODO-one-platform row 19.
  - Finding 4, option (a): "No filter options match that search." shows only
    once a query has been typed.
  - Scope: those two additive `ui.tsx` changes only, and no existing caller's
    props changed. The + Filter trigger ring and the 44 px targets belong to
    the follow-up run.
- **Still waiting on Reddy.** `ui.tsx:647` keeps the empty line in popovers
  that have no search (`|| !searchPlaceholder`). That is the implementer's
  reading of "only once a query has been typed", not Reddy's words.
  TODO-one-platform row 20 now says so (review finding 1).

### Skill changes (heuristic-ux-audit)

What was missing, from eval-traceability.md's red table:

- The skill judged a page at rest. It named no interaction states, and so
  never typed, opened, chose or focused anything.
- It counted controls by where they lead, not text inputs by what they search.
- It had no method for finding which rule draws a focus ring, or on which
  element.
- It never measured the map across states.
- It did not treat a sealed test spec's stale label as drift.

Changes, diffed against the copies taken at setup
(`.local/impl-scratch/cadastral-search-baseline/`):

- `SKILL.md` (2 hunks):
  - Step 2 now covers every state that evidence-capture.md § Interaction
    states lists.
  - The step 3 inventory counts text inputs and what each one searches, and
    popover options by what they do (narrow, open or navigate).
  - § Safety, line 131: never read back an image with a side over 2000 px.
- `references/web-heuristics.md` (12 hunks):
  - Pass 1: one text input per task, so two that search the same population
    are a finding.
  - Pass 4: two figures for the same quantity read one source.
  - Pass 8: reads `FacetFilter`'s `groups`, `selected`, `trailing` and
    `searchPlaceholder` against design.md § App-surface rules and the
    `ui.tsx` contract. Removing a filter group is Reddy's decision.
  - Pass 9: the instrument's page position in every state. A shift of 1 px
    or more is a finding. Matches open on an anchored temporary surface (M3
    menus). A list capped in height shows that it scrolls.
  - Pass 12: trace the cascade behind every focus ring in each scheme. The
    ring belongs on the visible control. `outline: 0` with nothing in its
    place is a finding. Flag WCAG 2.4.7 only where no other indicator shows.
  - Elsewhere:
    - a sealed spec that names a label the code no longer renders is drift;
    - "Not verified" lists every state not captured;
    - the source labels become `WCAG <SC number>`;
    - new sources: M3 menus, and Understanding 2.4.6 and 2.4.7.
  - One more line in this file, "Combined" changed to "Holding", is another
    session's (commit e80bd38).
- `references/evidence-capture.md` (4 hunks):
  - § Interaction states, line 205: the six states and how the sealed spec
    drives each, the evidence file names, the shift and focus JSON files,
    rings read as a keyboard user meets them, and High Contrast through the
    theme menu with Enter.
  - The template's states test, and a signed-out describe for public pages.
- `references/board-format.md` (3 hunks): the `scratch/` folder, the
  `WCAG <SC number>` label, and the read-back size rule.
- `.kiro/skill-evals/portfolio.json` (1 hunk): heuristic-ux-audit output
  case 3, the Cadastral maps audit anchored at 8c6a2d4.
- **This run's two wording fixes (Task 4.1):**
  1. The image read-back size rule: `board-format.md:148` (§ Read back),
     `evidence-capture.md:166` (§ 2) and its pointer at
     `evidence-capture.md:25` (§ 1).
  2. The keyboard-focus row at `evidence-capture.md:214`: "`focus()` on the
     control, from a fresh load or after a key press, never straight after a
     click, then `toBeFocused()`".
- `python3 scripts/validate-agent-governance.py`: 29 skills, 0 errors, 0
  warnings.

### Files changed, with hunks (working-tree lines, 03/10/2026 20:45)

`apps/web/src/w360/pages/VillageMaps.tsx`: 11 hunks, all this task's.

- **Task 6, Reddy's approved removal: three hunks, each revertible alone.**
  `git show HEAD:` and the setup copy number the first two the same way, since
  no commit has touched this file since 8c6a2d4.
  1. **Line 457**, `}], [catalog, districts, mandalsHere, pickedDistrict, pickedState]);`,
     now closes `areaGroups` after the Mandal group.
     - The Village group (HEAD lines 416–424) is removed.
     - The deps (HEAD line 425) lose `pickedMandal` and `villagesHere`. Both
       are still used elsewhere.
  2. **Between lines 485 and 486**, the end of `toggleArea`: the
     `if (group === 'village') {…}` branch (HEAD lines 454–458) is removed.
  3. **Line 1016**: `searchPlaceholder="Search districts or mandals"`. It was
     "Search districts, mandals or villages": HEAD line 955, line 960 in the
     setup copy, where another session's uncommitted PageHead hunk shifts it.
- **Task 7, plus finding 2:**
  - 36: the `FacetFilterHandle` type import.
  - 138–144: `findOpen` and `findShown`.
  - 172–183: the refs `findBox`, `findField`, `facetFilter`, `findQuiet` and
    `findTapped`.
  - 296–303: the window Escape branch. 319: its deps.
  - 321–332: the press-away listener.
  - 609–635: `openFind`, `refocusFind` and `chooseVillage`.
  - 1006: `ref={facetFilter}`.
  - 1018–1081: the `.vm-find` box, holding the field, the matches and the
    refusal line.
  - 1090–1092: the in-flow list is gone, and the refusal line falls back to
    its old place once the matches are put away.

`apps/web/src/w360/ui.tsx`: 5 hunks, all this task's, Reddy-approved on
03/10/2026. No other session has edited the file since the copy taken just
before this edit.

- 12: the `useImperativeHandle` import.
- 480–485: `FacetFilterHandle`.
- 492–497 and 500: the doc comment and `ref` in the signature.
- 518–519: the prop's type.
- 559: `useImperativeHandle(ref, () => ({ close }))`.
- 644–647: the empty line's condition and its comment.

`apps/web/src/w360/w360.css`: 74 hunks against the pre-product copy. Five
are this task's:

| Lines | Rule |
|---|---|
| 223–231 | `.search:has(input:focus-visible)` puts the 2 px ring on the pill; `.search input:focus-visible { outline: none }` |
| 2121–2127 | `.fpop-head:has(input:focus-visible)`, an inset 2 px ring. The `.fpop-close` line in the same hunk is the palette session's `--color-focus` to `--w-focus` rename |
| 4382–4410, 4417 | `.vm-find` and `.vm-find-results`, the surface over the map; the 12.5rem cap; compact rows with inset rings; full width at ≤42rem |
| 4531 | print hides `.vm-find-results` |
| 5166–5191 | the High Contrast block |

The palette session rewrote the High Contrast block after iteration 2:

- the selectors became `[data-scheme='highContrast'] .w360 …`;
- the pill's ring moved to a 3 px offset with a `--w-focus-halo` halo;
- inputs and rows got `box-shadow: none`;
- the old global ring moved into `theme.ts`.

The other 69 hunks are other sessions':

- the palette migration, most of them:
  - the scheme slots as aliases of MUI's variables;
  - `.w360[data-scheme]` became `[data-scheme] .w360`;
  - `--color-focus` became `--w-focus`;
  - accent-wash ink;
  - `--w-ink-1`, `--w-text` and `--w-muted` became `--w-ink` and `--w-ink-3`;
  - the top bar's chrome roles;
- the Holdings rename in a comment;
- `TabStrip` status glyphs;
- the Groups identity row;
- the Safeguard chip wrap;
- `.pf-result.on`.

Against the 02/10 setup copy there are 77 hunks: the same five, plus the
Home work another session wrote between 02/10 19:46 and 03/10 00:32 (the
Overview cards `.ov-*`, Missing details `.gap*`, compact record cards).

`tests/e2e-app/specs/17-villages.spec.ts`: 5 hunks, insertions only (+402).

- Helpers at 313–385: `twoMandals`, `ring`, `ringWhole`, `matches`,
  `matchRows` and `highContrast`. In `highContrast()` the palette session
  changed one line, the `html` `data-scheme` check.
- The 20 new tests: 709, 730, 920, 937, 956, 987, 1005, 1030, 1045, 1060,
  1091, 1105, 1119, 1139, 1157, 1170, 1186, 2521, 2628 and 2654.

`docs/specs/2026-08-15-web-360-design.md`:

- This task's hunk is the "Updated 03/10/2026" note at 421–427 in
  § Cadastral maps. The brief calls it § Village maps; the doc has no section
  by that name.
  - Task 8 rewrote it to the brief's wording: the Filter narrows by District
    and Mandal; the header search finds a village by name; its matches sit on
    a temporary surface over the map, which closes on choose, Escape, a click
    away or Tab out; and the map does not move.
- The 02/10 setup copy shows three more hunks, at 68, 877–887 and 966. They
  are another session's Home wording ("For you", the Overview cards, Missing
  details).

`docs/specs/TODO-one-platform.md`: 2 hunks against either copy, mixing this
task's lines with others'.

- This task's:
  - Row 19, the `SearchField` lift for all three surfaces. Task 8 added the
    `.search` pill note: since 03/10/2026 every `.search` pill draws its ring
    on the container and none on the input, High Contrast included, and the
    Filter's search draws its ring inset on its row.
  - Row 20. Task 8 reworded it so Reddy's approval and the implementer's
    reading are kept apart.
- Other sessions':
  - row 4 (`TabStrip`/`TabPanel` done);
  - rows 6, 8 and 13 (the Holdings and property renames, e80bd38 and
    c685d22);
  - row 17 (done, by the palette session);
  - the "One palette — in progress" section.

Also this task's: the four skill files and portfolio.json above, and
`.agents/tasks/cadastral-maps-search-ux/`.

Not changed by this task: `design.md`, `Shell.tsx`, `tests/e2e-app/fixtures/`
and the Playwright config. Other sessions have uncommitted changes in
`design.md` and `Shell.tsx`.

### Baseline vs after

The final sealed run started at 20:34, after `curl` printed 200 for :5173. It
ran 453 tests in 3.9 minutes: 292 passed, 161 failed. 108 of the 161 fail on
the harness console guard alone. Each test was compared by project, file and
title against before-test-baseline.md: its full 02/10 list, and its 03/10
18:39 list, which covers 17-villages and 24-responsive only.

| Spec | Project | Tests | Failed 02/10 | Failed 03/10 18:39 | Failed now | New failures | Now passing |
|---|---|---|---|---|---|---|---|
| 17-villages | app | 120 | 1 | 1 | **0** | 0 | 1 against each: on 02/10 the stale-label test (then `:570`, now `:644`); on 03/10 the finding-4 red test (`:730`) |
| 17-villages | phone | 14 | 0 | 0 | **0** | 0 | — |
| 01-shell | app | 113 | 66 | not run | 68 | 13 against 02/10, each on the console guard alone | 10 |
| 01-shell | phone | 6 | 6 | not run | 4 | 0 | 2 |
| 24-responsive | app | 100 | 45 | 44 | 44 | 0 against either | 1 against 02/10 |
| 24-responsive | phone | 100 | 46 | 46 | 45 | 0 against either | 1 |

- **The 13 new `01-shell [app]` failures** are at :314, :375, :386, :397,
  :534, :566, :615, :685, :695, :815, :857, :869 and :1632. Each fails on
  "The screen logged errors".
  - The trace of :314 shows the 400 answering `POST
    /api/gateway/pattadar/graphql` with `query { auditTrail { … } }`: the seal
    refusing Home's root-level query. That is the cause both reviews found.
  - The other 12 fail with the same first error. Their traces were not
    opened.
  - None comes from this change. VillageMaps is lazy-loaded and never runs on
    `/app`, and the CSS and `FacetFilter` changes send no request.
  - Nine `01-shell` tests are new since 02/10, the palette session's theme
    menu tests, and all pass. One 02/10 failure, "the theme menu › offers all
    three themes…", no longer exists under that title.
- **`24-responsive.spec.ts:548` for `/app/maps`** passed in both projects:
  nothing scrolls sideways at 390.
- No pre-existing failure was fixed or touched.

Checks run on 03/10/2026, each with its result:

| Command | Result |
|---|---|
| `cd apps/web && bun run typecheck` | `tsc --noEmit`, exit 0 |
| from the repo root, under `bash -c`: `set -euo pipefail; for script in scripts/*-tests.ts; do echo "── $script"; bun run "$script"; done; bun run scripts/icon-guard.ts; bun run scripts/ux-guards.ts` | exit 0: all 20 `*-tests.ts` print PASS, then `ICON GUARD PASSES` and `UX GUARDS PASS` |
| `bun test apps/web/src` | 358 pass, 0 fail (732 `expect()` calls, 24 files) |
| `bun run --filter @pattadar/web build` | exit 0, Vite 8.1.5, 2150 modules, built in 455 ms |
| `python3 scripts/validate-agent-governance.py` | exit 0: 29 skills, 0 errors, 0 warnings; eval fixtures 29 skills, 19 collisions, 0 errors |
| sealed `17-villages`, `01-shell` and `24-responsive`, `--project=app --project=phone`, JSON reporter output kept under `.local/` | 292 passed, 161 failed, compared above |
| `git diff --check` on this task's files | clean |

- **shared-components-tests.ts budgets.** The guard says four counts went
  down: RecordNotes card 1 < 2, Tools cell 1 < 4, Orders card 3 < 4 and
  RecordPhotos card 6 < 8. None of those files was changed by this task, so
  no budget was lowered.

### AFTER evidence

The capture ran at 20:10 on 03/10/2026, sealed, against :5173 (`curl`
printed 200). It took Dark plus the High Contrast focus states, at 1512 in
the `app` project (Chromium) and 390 in `phone` (WebKit). 12 passed in 28.3 s.

- **Folder:** `.local/ux-audits/2026-10-02-w360-cadastral-maps/implementation/after/`
  holds 86 files under the same names as `evidence/`; the two name lists are
  identical.
- **Spec setup:** `ground()`, `entry()`, `collection()` and the constants
  were copied from `17-villages.spec.ts`, with the catalog route of "the
  village list follows the mandal I pick" (now `:644`, the brief's `~570`).
  The two uploads (KATRAGUNTA, and CHINTHAGUNTA with 219 plots) rebuild
  BEFORE's world of 5 villages and 235 plots.
- **The `tests/` hash** (`git status --short --untracked-files=all tests/ | shasum`):

  | When | Hash | Note |
  |---|---|---|
  | before the spec was written | `e9fd85d3…` | |
  | right before the run | `d12f0803…` | the spec is the only extra line |
  | right after the run | `d12f0803…` | |
  | after the spec and the `--output` folder were deleted | `e9fd85d3…` | |

  Nothing needed undoing.
- **Differences from BEFORE:**
  - The Filter's search no longer matches villages. Its typed-match state
    types "Chimakurthi" and its chosen state ticks CHIMAKURTHI; BEFORE typed
    MYLAVARAM and chose KATRAGUNTA from the Village group. MYLAVARAM's answer
    now is in `villageNameTyped`: 0 options and the no-match line.
  - The focus files add `darkSettled` and `highContrastSettled`, read after
    the transitions end. BEFORE recorded only the reads straight after
    `focus()`.
  - The search's facts file adds `surface`, which says where the matches sit.
- **Measured:**

  | | BEFORE | AFTER |
  |---|---|---|
  | Map, while typing (typed-match, typed-none) | 146 and 78.5 px lower, at 1512 and at 390 | 0 px, at both widths |
  | Map, after choosing a village | 101.5 px lower at 1512, 153.5 at 390 | 24.5 px lower at 1512, 76.5 at 390 |
  | The matches | rows in the page's flow | an absolute surface 6 px under the pill (bottom 255.4, top 261.4), as wide as it (320 px at 1512, 358 at 390), on top at its first row |
  | After choosing | 1 row and the query stayed | 0 matches, search cleared, field focused |
  | Village search ring, settled | on the input, the pill none | 2 px solid on the pill in Dark; 3 px at a 3 px offset with a 3 px halo in High Contrast; the input none; both engines |
  | Filter search ring | none in Dark (`outline: 0`); High Contrast's global rule on the input | 2 px inset at −4 px in Dark; 3 px at −5 px in High Contrast; the input none |
  | + Filter trigger | the browser's `auto 1px` in Dark | unchanged, deferred to the follow-up run |
  | Filter groups | District, Mandal and Village | District and Mandal, "Search districts or mandals"; PRAKASAM ticks, 1 chip, 1 village |
  | The two searches | | the pill still folds spelling (Chintagunta finds CHINTHAGUNTA); the Filter's search finds no village, by design |
  | Plot finder | | unchanged |

  The 24.5 and 76.5 px after choosing are the opened village's own page head,
  the same offset BEFORE's plot finder shows at rest.
- **Side by side:** `implementation/before-after.html` is static, with no
  scripts and no external loads. It renders:

  | Image | Size |
  |---|---|
  | `before-after.png` | 1660×4470 |
  | `before-after-typing.png` | 1660×1305 |
  | `before-after-choosing.png` | 1660×900 |
  | `before-after-rings.png` | 1660×1551 |
  | `before-after-filter.png` | 1660×1343 |

  Every image was read through a `sips` copy or crop no larger than 1800 px a
  side. Nothing over 2000 px was opened, and `board.png` (2040×2744) was not
  opened at all.

### Functional acceptance: the village list surface

Instrument: sealed `tests/e2e-app`, from the final run above, where every
test listed here passed (17-villages 134 of 134). It proves the client's
operation logic and failure handling against fixtures, not the real gateway
or storage.

| Operation | Happy path (test, line) | Failure path (test, line) | Status |
|---|---|---|---|
| Search | "searching the village list folds the spelling…" `:625`; "the village list follows the mandal I pick…" `:644`; "the Filter narrows by district and mandal, and finding a village by name is the header search's job" `:709`; "typing a village name does not move the map @phone" `:2628` (both projects) | the list it searches could not be read: "an uploads outage is not an empty shelf…" `:2354`, "the villages come back the moment the server does" `:2370`, "a village list that is knowingly short says so…" `:2385`; still loading: "while the index is still coming…" `:443` | worked |
| No match | "a village nobody has sent a map for says so rather than showing an empty list" `:752`: 0 rows, "No cadastral map on file matching that." | no match is itself the negative path; the Filter's own no-match line shows only once typed, `:730` | worked |
| Open | mouse: "choosing a matching village closes the matches and clears the search" `:920` (app); key: "Enter on a matching village…" `:937` (both); tap: "tapping a matching village opens it and leaves the keyboard down @phone-only" `:2654`; "opening a village keeps the information filter and marks one row…" `:762` | "a village whose shape file did not come back says so where its map would be" `:2421` (503); "Try again on a failed village is a real second read…" `:2444` | worked |
| Put away (Escape, click away, Tab out) | `:956`, `:987`, `:1005`, `:1030`, `:1045`, `:1060` | — | worked |
| Upload (its report sits under the search) | "uploading a village map sends the file and lands me on the map it just took" `:2244` (one POST naming the KMZ); `:2265` (the per-village report); `:2293` (re-upload redraws the open map); `:420` (says so while reading) | "half a village is refused, and the refusal says which half is missing" `:2461`: 400 with `error` and `skipped`, nothing opened | worked; a 5xx or network failure of the POST is **UNVERIFIED** (no test) |
| Remove, 200 | "taking an uploaded map off closes it and leaves the shelf empty" `:2330`: one DELETE to `/api/gateway/pattadar/village-maps/katragunta`, map closed, shelf empty; `:1005` (KATRAPADU removed from the matches, its row goes, then Escape, both projects); "a shipped village map has no bin" `:2318` | — | worked |
| Remove, 409 | — | "a refused removal keeps the village, and says so beside the bin that was pressed" `:2490`: "that village map is in use", still listed and open, no refresh; "a removal refused after I put the matches away is still said" `:2521` (a 409 after 1.5 s) | worked |
| Remove, 500 | — | "a removal that fails with nothing to say still names the village that stayed" `:2508`: "KATRAGUNTA could not be taken off (500).", still listed and open | worked |
| Remove, network error (the fetch throws) | — | no test | **UNVERIFIED** |
| All of the above against the real API, database and storage | `tests/e2e-web360` not run: it needs a disposable database and was not approved here | | **UNVERIFIED** |

### Not verified

- **A fresh-session pilot of the skill** (output case 3, with the skill
  against a baseline): not run. The Task 4 run does not count, and
  eval-traceability.md is a static proxy.
- **Screen readers:** how they announce the matches, a labelled div with no
  role whose rows are Tab stops, and the Filter's lone search row. No
  assistive-technology pass was made.
- **Light-scheme focus:** not captured; the capture took Dark and High
  Contrast only.
- **`:has()` beyond Playwright's Chromium and WebKit:** the pill and row
  rings depend on it, and only the WebKit `phone` project stands for Safari.
  Not checked in Firefox, real Safari, iOS or Android.
- **WCAG:** no conformance is claimed. Contrast and focus-indicator proof
  belong to design-system-governance, and full validation needs manual
  assistive-technology testing and expert review.
- **`tests/e2e-web360`:** not run.
- **Untested paths:**
  - A real on-screen keyboard.
  - The key-press reset of `findTapped`, and a mouse choice in WebKit
    (impl-review finding 3).
  - Upload 5xx and network failures, and a removal that fails at the network.
  - Vault's popover with no files and nothing typed. The empty-line change
    reaches it; checked by reading the code only.
- **CI:** not run.

### Follow-ups (report only; none done)

1. **A shared `SearchField` in `ui.tsx`** for the jump box, the plot finder
   and the village matches, with combobox semantics and arrow keys
   (TODO-one-platform row 19). Reddy's exception holds until then.
2. **`FacetFilter` does not put its popover away when its own `trailing`
   control is used.** The slot sits inside the filter's root, so a press
   there is not a press away, and the page has to close the popover through
   the `ref` handle. A rule inside `FacetFilter` would make the handle
   unnecessary.
3. **The empty-catalog popover.** With no catalog, + Filter opens on its
   search row alone. Hiding + Filter when there is nothing to filter by
   (option b) was not chosen, and the `|| !searchPlaceholder` reading waits
   on Reddy (row 20).
4. **The same blind spot in adjacent skills.**
   - design-system-governance names focus once each, in
     `references/quality-gates.md:8` ("visible focus") and `SKILL.md:59`
     ("semantics/focus"). web-feature-delivery has no focus or
     interaction-state check at all.
   - Neither drives interaction states, traces which element draws a ring in
     each scheme, or checks that a temporary surface leaves a map or other
     instrument where it was.
5. **The previous run's failure is fixed.** That run read an image with a
   side over 2000 px; `board.png` is 2040 wide. Task 4.1's rule now keeps
   every read at or under 2000 px, and every read in this step was a copy or
   crop of 1800 px or less.
   - One wording drift is left: `SKILL.md:131-134` says "a `sips -Z 2000`
     copy written under `.local/`", while board-format.md and
     evidence-capture.md say "`sips -Z 1800`" in `scratch/`. Both stay within
     2000 px, but one number would read better.
6. **Audit findings outside the approved scope, still open:**
   - **1:** the village count is told three times. While typing, the tally
     says 2 and the head line and badge say 5.
   - **3 and 4:** the + Filter trigger's ring is still the browser's
     `auto 1px` in Dark, and the 44 px targets are not met. Reddy named both
     for the follow-up run.
   - **6:** rings still animate under reduced motion.
     - Read straight after `focus()`, the pill's Dark ring was
       `rgb(214, 147, 79)`, against `rgb(255, 160, 60)` once settled.
     - In High Contrast the same read gave a 2 px offset and a 2.95 px halo,
       against 3 px and 3 px once settled.
   - **8:** one click on a bin removes an uploaded map, with no
     ConfirmDialog.
7. **Seen in the AFTER capture.** With a mandal chosen whose overview has no
   outlines, the stage says "5 cadastral maps on file · Search for a village
   above." while the tally says "1 village". The empty state counts the
   whole index rather than the area, another count that can disagree with
   the rest (finding 1's family). Here it comes from the fixture: a real
   mandal ships its outlines.
8. **Harness.** The seal refuses Home's root-level `query { auditTrail … }`
   with a 400, so many `01-shell` and `24-responsive` tests fail on the
   console guard alone. Route it in the world, or stop sending it; that
   belongs to test-governance.

### Change governance

1. **Documentation.**
   - The design doc's § Cadastral maps note was rewritten.
   - TODO-one-platform rows 19 and 20.
   - This report.
   - `design.md` unchanged.
   - Earlier sections here name logs that this step deleted; they are
     historical.
2. **Architecture.** None in Task 8. Over the whole task, `FacetFilter`
   gained one optional, additive `ref` handle. No entrypoint, request,
   dependency, data flow or trust boundary changed.
3. **Security/privacy.** None.
   - The removal's DELETE path is unchanged:
     `apiFetch(`${UPLOADS}/${encodeURIComponent(entry.key)}`, { method: 'DELETE' })`,
     handled the same way.
   - Every capture ran sealed on fixture data.
   - No user screenshot was copied into a tracked path. The audit's evidence
     is fixture-only, under git-ignored `.local/`.
   - No secrets were touched.
4. **Testing.** As above. Nothing was committed, pushed or run in CI.
5. **Cleanup.**
   - **Deleted:**
     - the capture spec and its `--output` folder;
     - the final run's `--output` folder;
     - every `.local/impl-scratch/cadastral-search-pw-*` folder, log and
       JSON, earlier steps' kept logs included, as the brief asks;
     - the audit folder's `scratch/`: this step's read copies and crops, its
       verification logs and comparison script, and the copies left from the
       BEFORE read-back.
   - **Kept as deliverables:**
     - `.local/ux-audits/2026-10-02-w360-cadastral-maps/`: `board.html`,
       `compare.png`, `board.png`, `evidence/` and `implementation/`;
     - `.agents/tasks/cadastral-maps-search-ux/`.
   - **Kept for the reviewer**, because the final attribution diff reads
     them:
     - `.local/impl-scratch/cadastral-search-baseline` and `-preproduct`;
     - earlier steps' snapshots `-iter2-start`, `-iter2-approved-start` and
       `-approved-preedit`, for per-iteration diffs.

     Once the review is done:
     `rm -rf .local/impl-scratch/cadastral-search-{baseline,preproduct,iter2-start,iter2-approved-start,approved-preedit}`.
   - **Rebuilt in place by the build check:** `apps/web/dist`. It is
     git-ignored and existed before.
   - **Not touched:**
     - `tests/e2e-app/results.json`, `playwright-report/` and `test-results/`;
     - the :5173 server, neither started nor stopped;
     - every terminal.
   - **Processes:** none started that is still running.

### Final attribution diff

`diff -u` of each snapshot copy against the current file, re-run as the last
act of this step at 21:10 on 03/10/2026, after cleanup. Every count below
matched the earlier run. A dash means the file is not in that copy.

| File | Hunks vs pre-product copy | Hunks vs 02/10 copy | This task's | Other sessions' |
|---|---|---|---|---|
| `VillageMaps.tsx` | 11 | 11 | all 11 | — |
| `ui.tsx` | 5 | — | all 5 | — |
| `w360.css` | 74 | 77 | 5 | palette migration, Holdings comment, TabStrip status, Groups row, Safeguard chip, `.pf-result`; against 02/10, also the Home cards |
| `17-villages.spec.ts` | 5 | 5 | all 5 (insertions) | one line inside `highContrast()` (palette) |
| web-360 design doc | 1 | 4 | 1 | 3 (Home wording at 68, 877–887, 966) |
| `TODO-one-platform.md` | 2 | 2 | rows 19, 20 | rows 4, 6, 8, 13, 17 and § One palette, in the same two hunks |
| skill `SKILL.md`, `web-heuristics.md`, `evidence-capture.md`, `board-format.md` | — | 2, 12, 4, 3 | all, except one line | `web-heuristics.md`'s "Combined" → "Holding" (e80bd38) |
| `portfolio.json` | — | 1 | 1 | — |
| `eval-traceability.md`, `red-runs.md` | — | 1, 1 | both | — |

Every hunk is this task's or is accounted to another session.

## Task 4.1 — skill wording fixes (02/10/2026)

Both are exact-text insertions or replacements; no file was rewritten.

1. Image read-back size rule.
   - `references/board-format.md` § Read back: a new paragraph before "Read
     both PNGs back" says `board.png` is 2040 px wide, so never open it or any
     crop of it with a side over 2000 px (SKILL.md § Safety); check with
     `sips -g pixelWidth -g pixelHeight`, then read a `sips -Z 1800` copy or
     crops no larger than 1800 px a side written to the audit folder's
     `scratch/`. § Files gains the `scratch/` line.
   - `references/evidence-capture.md`: the same rule as a bullet after the
     `-top`/`-full` bullet in § 2 (a `phone` shot is 3×, 1170 wide; checked on
     this audit's evidence, 1170×1992), and a pointer to it in § 1 for user
     screenshots.
2. `skill-review.json` finding 1 (non-blocking): the keyboard-focus row of
   `evidence-capture.md` § Interaction states now reads "`focus()` on the
   control, from a fresh load or after a key press, never straight after a
   click, then `toBeFocused()`".

`python3 scripts/validate-agent-governance.py`: 29 skills, 0 errors, 0
warnings; passed.

## Task 4.2 — BEFORE board read back (02/10/2026)

Folder: `.local/ux-audits/2026-10-02-w360-cadastral-maps/`. HEAD is 8c6a2d4
(`git rev-parse --short HEAD`), and `VillageMaps.tsx` and `w360.css` are
modified in the working tree, so the footer's "8c6a2d4 + working tree" holds.

- Read: `board.html` as text; `compare.png` (1600×1027) directly;
  `scratch/board-1800.png` (1338×1800); crops of at most 1020 px a side in
  `scratch/` (footer in two 1020×304 halves, the bar's pins, both B-screen
  popover notes). The previous `tile-footer.png` (2040×304) and
  `board-2000.png` were deleted unread.
- Fixed: the "popover over the map's top-left" note touched the popover's
  edge in both B screens; moved from `left: 330px` to `350px`, re-rendered
  both PNGs with the board-format.md commands (sizes unchanged).
- Read-back checklist: wire-light look; markers 1–9 in the gutter, one per
  finding; no clipping or overlap; no `{{`; both panels at the same fidelity
  with `data-reddy` tags; `compare.png` 1600 wide with panel labels and
  screens only.
- Against the evidence: finding 2 (two village searches over 5 villages);
  finding 9 (Village options open, KATRAGUNTA unticked, 0 chips); finding 7
  (map 146 px lower with matches, 78.5 px with none, at 1512 and 390, from
  `maps-search-shift-{app,phone}.json`); finding 5 (ring on the inner input,
  2 px Dark and 3 px High Contrast, pill none, `maps-search-focus-app.json`);
  finding 3 (Filter search `outline: 0` in Dark; in High Contrast only the
  global `!important` rule rings it, 3 px in the evidence, and the board says
  so: no ring of its own in either scheme); drift line 1 (the
  sealed spec's "Search districts or mandals", `17-villages.spec.ts:610`,
  against `VillageMaps.tsx:960`); the Village-group removal tagged "Reddy's
  decision · approved", approved in chat 02/10/2026 (decisions.md).
- Not re-verified here: the footer's "user screenshots 1–3" comes from the
  earlier step; no finding cites them and no copy is in `evidence/`.

## Tasks 5–7 — implementation, iteration 1 (03/10/2026)

Test-first: every new test was run on the code as it was and failed before
the product change it covers (red-runs.md, both 03/10/2026 sections). Main
checkout, HEAD 8c6a2d4, nothing committed. Every edit was an exact-text
insertion or replacement. Other sessions' hunks in these files were left as
they were: the PageHead migration in `VillageMaps.tsx`, the Overview, `.sec-first`,
`.vm-place`, Tools-fence print and `.fs-tool` rules in `w360.css`, the selector
swaps in `17-villages.spec.ts`, and the W01 hunks in the design doc.
`ui.tsx`, `Shell.tsx`, `design.md` and `tests/e2e-app/fixtures/` are unchanged.

### Files and hunks (working-tree line numbers)

`apps/web/src/w360/w360.css`

- T5, 226–233: `.w360 .search:has(input:focus-visible)` draws the 2px
  `--color-focus` ring, offset 1px, on the pill; `.w360 .search
  input:focus-visible { outline: none }` at (0,3,1) beats `.w360
  input:focus-visible` at (0,2,1). This applies to every `.search` pill,
  including the top bar's jump box, as intended.
- T5, 2071–2078: `.w360 .fpop-head:has(input:focus-visible)`: 2px ring,
  offset −4px, inset because `.fpop` scrolls. The input's own `outline: 0`
  stays.
- T5, 5107–5129: the High Contrast comment now says the treatment is never
  reduced, only moved to the container. It adds `!important` rules: 3px/2px
  on `.search:has(…)`, 3px/−5px on `.fpop-head:has(…)`, and `none` on both
  inner inputs (more specific than the global `:focus-visible` rule).
- T7, 4331–4353: `.vm-find` (`position: relative`) and `.vm-find-results`
  (absolute, `top: calc(100% + 0.375rem)`, as wide as the pill, so it lines
  up with the pill's right edge at desktop, `z-index: 30` inside the
  `.filterbar` stack under `.vm-map-filters`' 700). `.vm-search-results` is
  capped at 12.5rem: four 2.75rem rows, with the fifth cut part-way. Rows lose
  the `.rows` padding and hairline, so they are as compact as the plot
  finder's options.
- T7, 4360: at ≤42rem `.vm-find` takes the full line, so the matches are as
  wide as the full-width pill.
- T7, 4474: print hides `.vm-find-results`, next to `.fpop`.

The four surface values (`--w-bg`, 1px `--w-line-strong`, `--radius-md`, the
`0 1.5rem 3rem -1rem` shadow) are copied. `.fpop` and `.jump-results` are
separate rules with other properties, so grouping them would have meant moving
declarations out of both. No High Contrast override exists for either surface,
so none was added.

`apps/web/src/w360/pages/VillageMaps.tsx`

Task 6 (Reddy-approved removal). These three hunks revert on their own:

1. Line 441: `areaGroups` ends after the Mandal group. The Village group
   (HEAD lines 416–425) is gone, and the memo deps are now `[catalog,
   districts, mandalsHere, pickedDistrict, pickedState]`; `pickedMandal` and
   `villagesHere` were dropped. Both are still used elsewhere (`shown`, the
   overview effect, the placeholders), so nothing became unused.
2. After line 470, the end of `toggleArea`: the `if (group === 'village') {…}`
   branch (HEAD lines 454–458) is removed.
3. Line 999: `searchPlaceholder="Search districts or mandals"` (was "Search
   districts, mandals or villages").

Reverting them alone brings back the Village group. The new test "the Filter
narrows by district and mandal…" would then fail, and so would the test at
`:607` unless hunk 3 is kept.

Task 7:

- 137–141: `findOpen` state. 169–175: the `findBox` and `findField` refs, and
  `findQuiet`, which keeps a deliberate refocus from reopening the matches.
- 305–317: while open, a `pointerdown` outside `findBox` closes the matches
  and keeps the query. This is the jump box's pattern.
- 593–617: `openFind` (opens the matches and closes the Filter popover, see
  below), `refocusFind`, and `chooseVillage` (opens the village, clears `q`,
  closes the matches, focus back to the field).
- 897: `findShown = findOpen && q.trim().length > 0`.
- 1001–1061, the `trailing` node: `span.vm-find` wraps the pill and
  `div.vm-find-results`, with `onBlur` and `onKeyDown` on the wrapper.
  - Blur closes the matches when focus moves somewhere else (`relatedTarget`
    outside). A `null` target is left to the `pointerdown` listener, because
    Safari does not focus a pressed button.
  - Escape, only while `findShown`, calls `stopPropagation`, so the window
    handler at 284–304 that drops the plot and the finder does not run. It
    closes the matches, keeps `q`, and moves focus from a row back to the
    field.
  - The input opens the matches on change with text, on focus with text, and
    on click with text.
  - Markup, classes and names are kept: `.rows.vm-villages.vm-search-results`,
    `aria-label="Matching villages"`, `.villagerow`, `Remove <VILLAGE>`, and
    "No cadastral map on file matching that."
  - Remove still calls `remove(v)` and the matches stay open on success or
    refusal.
- 1071–1073: the in-flow list is gone. `rmErr` now shows inside the matches,
  under the bin, while they are open. When they are closed it shows in its
  old place under the filter row (1073). Without that fallback, a refusal
  arriving after Escape was off screen; see red-runs.md, follow-up.

`tests/e2e-app/specs/17-villages.spec.ts` (insertions only)

- 313–349: helpers `twoMandals()` (the two-district catalog from the `:607`
  test, which is left as it is) and `ring()` (computed outline).
- 672: the Task 6 test. 861–1018: the Task 7 and Task 5 tests. 2340: "a
  removal refused after I put the matches away is still said" (inside `when
  the server refuses`). 2446: "typing a village name does not move the map
  @phone".
- Besides the seven titles the brief gave, there are three more: "tabbing out
  of the village search closes its matches, as a click away does", "the Filter
  and the village matches take turns rather than covering each other @phone",
  and the late-refusal test above.
- Class locators each carry a comment saying why: `.vm-village-search`,
  `.fpop-head` and `.fgrp > .eyebrow`. No `waitForTimeout`.
  **Corrected in iteration 2:** this was wrong. Twelve class locators in the
  new tests had no comment (review finding 7). They now go through commented
  helpers or carry a comment; see the iteration 2 section below.

Docs

- `docs/specs/TODO-one-platform.md`: new row 19, "Search with results".
- `docs/specs/2026-08-15-web-360-design.md` 420–426: an "Updated 03/10/2026"
  note in the Cadastral maps block. The other session's hunks at 68, 594, 633,
  876 and 965 are unchanged; checked with `git diff -U0`.

### Choices to review

- **The Filter and the matches never show together.** At 390 both open full
  width under the filter row, so they would cover each other. At 1512 they
  would not overlap, but the rule is kept the same for one way of working.
  - Opening the matches (typing, or focus/click with text) closes the
    popover. It does this by `.click()` on FacetFilter's own `+ Filter`
    button when `aria-expanded="true"`, which runs the component's own
    `close()`.
  - Pressing `+ Filter` is a press outside the search, so it closes the
    matches.
  - This reaches into `FacetFilter`'s DOM (`.addfilter`, `aria-expanded`)
    because the contract has no way to close it from outside, and the brief
    rules out changing it. Recommendation for Reddy: add a controlled-close
    prop, or the SearchField below.
  - Tested at 1512 (`app`) and 390 (`phone`).
- **Where the refusal line sits:** see the 1071–1073 hunk above.
- **Ring offsets:** −4px for 2px and −5px for 3px leave a 2px gap inside the
  popover border. At the popover's 11px inner corner radius, a couple of the
  ring's outermost corner pixels are clipped.

### Recorded, not fixed

- With no `catalog.json` (every `ground()` test, and older `/vm/` builds),
  `+ Filter` opens a popover with only its search and "No filter options match
  that search." with nothing typed. The Village group used to fill it. This is
  a FacetFilter empty-groups edge case and out of scope.
- **Decision for Reddy:** the village search is the third hand-built
  search-with-results surface (design.md § One component per concern). Lifting
  a shared `SearchField` into `ui.tsx` was out of scope by the approved plan.
  It is TODO-one-platform row 19.

### Verification (all run 03/10/2026 against the user's :5173; `curl` printed 200 before each run)

- `17-villages`, both projects: **116 passed, 0 failed**, at
  `.local/impl-scratch/cadastral-search-pw-final17b.log`. The baseline was 1
  failure (`:570`, now `:607`), which is now green. This covers search, open,
  upload, and remove with 200/409/500, plus the new late-409 test.
- `01-shell` + `24-responsive`, both projects: 168 failed / 143 passed (the
  first post-change run was 165 / 146), against a baseline of 163 / 148.
  - Compared by project, spec and line: no failure that is new against the
    baseline is anything but the harness console guard on
    `console.error: Failed to load resource … 400 (Bad Request)`.
  - In the traces, that 400 is the seal refusing the root-level
    `query { auditTrail … }`, which `Dashboard.tsx`'s `RecentActivity` sends
    on every `/app` load (`useAuditTrail`, `data/hooks.ts`). I did not touch
    either file, and my diff adds no request.
  - `Dashboard.tsx` carries another session's uncommitted rewrite (172+/102−),
    last written 02/10 22:39, after the 19:51 baseline.
  - Six of the new ones re-run `--repeat-each=3` in `app` went 5 passed / 13
    failed; four of the six both passed and failed within the run. `:510` and
    `:565`, which passed at baseline, then failed 5 of 5 more (one worker,
    `cadastral-search-pw-flake2.log`). Every one of those ten failures is the
    console guard alone: the tests' own assertions passed.
  - The 24-responsive overflow check on `/app/maps` passed in both projects in
    both runs.
  - Logs: `cadastral-search-pw-final-shellresp.log`,
    `cadastral-search-pw-flake.log`, `cadastral-search-pw-flake2.log`.
- `apps/web` `bun run typecheck`: pass. `bun test apps/web/src`: 98 pass.
- Every `scripts/*-tests.ts`, plus `icon-guard.ts` and `ux-guards.ts`: all
  pass except `typography-tests.ts` TY-5.
  - TY-5 flags `font-weight: 800` at `apps/university/src/styles.css`
    1488/1520/1538, from commit 641ddb5, unmodified in the tree. Not mine.
  - `shared-components-tests.ts` notes four budgets that can come down
    (RecordNotes, Tools, Orders, RecordPhotos). Those are other sessions'
    files and were left alone.
- Type-checking the spec: `tests/e2e-app/tsconfig.json` no longer loads under
  TS 7 (`moduleResolution=node10` was removed; `@types/node` is not
  installed). Checked `17-villages.spec.ts` with overriding flags: the only
  errors in it are `Buffer` at 2061 and 2297 (no `@types/node`); none comes
  from the new code.
- `git diff --check` is clean on the five files.
- I looked at screenshots at 1512 and 390. Matches float over the map, five
  rows show with the fifth cut part-way, and the refusal sits inside the
  matches. Dark draws one 2px ring on the pill, High Contrast one 3px ring on
  the pill, and the jump box gets the same. The Filter search row shows an
  inset ring. The screenshots were deleted after viewing.

Not verified:

- `tests/e2e-web360` (not allowed here), so remove and upload are proven only
  against the seal, not against the real gateway or storage.
- No assistive-technology pass.
- WebKit runs only the `@phone` tests: the Escape, choose and focus-ring tests
  are Chromium-only.

### Change governance

- Documentation: two docs updated (above).
- Architecture: no new entrypoint, request, trust boundary or dependency.
- Security/privacy: no auth, storage, PII or API change. The `DELETE` call is
  unchanged.
- Testing: as above.
- Cleanup:
  - Deleted: the temporary screenshot spec (removed straight after its one
    run), the screenshots, the trace extraction, the Playwright `--output`
    folders and the guard logs.
  - Kept as evidence in `.local/impl-scratch/` (git-ignored): the
    `cadastral-search-pw-{red,red2,final17b,final-shellresp,flake,flake2}.log`
    files.
  - No process left running.

## Tasks 5–7 — iteration 2, the review's findings (03/10/2026)

The review (`impl-review.json`, CHANGES_REQUESTED) had one blocking finding and
seven others. Findings 1, 5, 6, 7 and 8 are fixed here, test-first
(red-runs.md, "Iteration 2"). Findings 2, 3 and 4 need Reddy's decision and are
not changed; see "Waiting on Reddy" below.

Main checkout, HEAD 8c6a2d4, nothing committed. Every edit was an exact-text
replacement. The five files as they stood at the start of this iteration are in
`.local/impl-scratch/cadastral-search-iter2-start/`, so this iteration's hunks
alone are `diff -u .local/impl-scratch/cadastral-search-iter2-start/<path> <path>`.
`ui.tsx`, `Shell.tsx`, `design.md`, `tests/e2e-app/fixtures/` and the Playwright
config are unchanged against HEAD.

### What each finding got

1. **Phone keyboard after a choice (blocking).** The choice still hands focus
   back to the field after a key or a mouse, as the brief asks, but not after
   a tap. This is the review's second option: skip the refocus after a touch
   press. The first option, `detail === 0` only, would also have dropped the
   mouse refocus the brief asks for.
   - `findTapped` is set by the box's `pointerdown` to `pointerType !== 'mouse'`,
     so a pen counts as a finger. Any key press in the box clears it, so a
     touch-then-keyboard reader still gets focus back.
   - Tests: the new `@phone-only` tap test failed first (field focused) and
     passes now. The new Enter-on-row test passes in both engines, before and
     after.
2. **FacetFilter closed through its DOM.** Not changed; Reddy's decision.
3. **Third hand-built search surface.** Not changed; Reddy's decision. TODO
   row 19 now also records what the review found the village search lacks:
   combobox state and arrow keys.
4. **Empty Filter without a catalog.** Not changed: the brief said record, do
   not fix, and both fixes change what the reader sees. Recorded as TODO
   row 20.
5. **Escape needs focus in the box.** The page's window Escape handler now
   puts showing matches away first and does nothing else. It runs only when
   focus has fallen out of the box, because the box's own Escape still stops
   the event. That covers a removed row's bin and Safari's unfocused pressed
   buttons alike. The new test, Escape after a removal with a plot chosen,
   failed first in both engines and passes now.
6. **Clipped ring on the match rows.** The rows and their bins draw a 2px ring
   at −2px, as `.vc-plot-option` does. High Contrast keeps its 3px ring and
   moves it to −3px. The two new geometric tests check that each ring is
   inside the list's scrollport, in Dark and High Contrast. Both failed first
   in both engines (the first row's ring) and pass now.
7. **Class locators without comments.** The new tests now go through the
   `matches(page)` and `matchRows(page)` helpers, whose comment says the list
   has a label but no role. `.vm-stage`, `.vc-village` and the `closest()`
   inside `evaluate` each have a comment. The late-refusal test reads the
   filters by role (`region` "Cadastral map filters"). The iteration 1 claim
   above is marked corrected.
8. **WebKit and High Contrast coverage.** The three iteration 1 ring tests are
   now `@phone`, so they run in WebKit too. New tests cover the High Contrast
   `.fpop-head` ring, the top bar's pill ring, the second Escape reaching the
   page, Escape after a removal, and choosing by touch. Thirteen of the
   iteration's twenty new and retagged test runs passed on the code as it
   was (red-runs.md lists why). They cover behaviour; they are not evidence
   for a product change.

### Files and hunks (working-tree line numbers)

`apps/web/src/w360/pages/VillageMaps.tsx`

Task 6, the Reddy-approved removal, still sits in three hunks that revert on
their own. Line numbers moved; the content did not:

1. Line 454: `}], [catalog, districts, mandalsHere, pickedDistrict, pickedState]);`
   closes `areaGroups` after the Mandal group. The Village group (HEAD
   416–425) is removed before it, and the deps lose `pickedMandal` and
   `villagesHere`.
2. Between lines 482 and 483, the end of `toggleArea`: the
   `if (group === 'village') {…}` branch (HEAD 454–458) is removed.
3. Line 1013: `searchPlaceholder="Search districts or mandals"`.

Task 7, this iteration's changes:

- 143: `findShown` moved up from the render (it was at 897). The Escape
  effect's deps read it, and a `const` declared later in the function body
  would throw there.
- 179–180: the `findTapped` ref.
- 293–300: the window Escape handler's first branch, `findShown &&
  findBox.current`, puts the matches away and returns. The `findBox` guard
  keeps a stale `findOpen` from swallowing Escape while the fence calculator
  has unmounted the filter row. 316: deps gain `findShown`.
- 319–322: the press-away effect's comment now says when the handler above
  answers.
- 622–633: `chooseVillage` calls `refocusFind()` only when `!findTapped.current`,
  and its comment says why.
- 1025: the box's `onPointerDown`. 1027: `onKeyDown` clears `findTapped` before
  its Escape check.

`apps/web/src/w360/w360.css`

- 4352–4358: `.vm-search-results .villagerow:focus-visible` and
  `.vm-search-results .iconbtn:focus-visible`, 2px `--color-focus` at −2px.
  These are (0,4,0), so they beat `.iconbtn:focus-visible` at (0,3,0).
- 5122–5123: the High Contrast comment adds the matches' rows.
- 5137: `.w360[data-scheme='highContrast'] .vm-search-results :focus-visible
  { outline-offset: -3px !important; }`, (0,4,0) over the global (0,3,0). The
  3px width still comes from the global rule.

`tests/e2e-app/specs/17-villages.spec.ts`

- Helpers: `ringWhole()` at 353, `matches()`/`matchRows()` at 372–373 and
  `highContrast()` at 377. The iteration 1 High Contrast test now uses
  `highContrast()`.
- New tests: 915 (Enter, `@phone`), 965 (the second Escape), 983 (Escape
  after a removal, `@phone`), 1114 (High Contrast `.fpop-head`, `@phone`),
  1132 (the top bar's pill, `@phone`), 1145 and 1161 (whole row rings in Dark
  and High Contrast, `@phone`) and 2629 (the tap, `@phone-only`).
- Retagged `@phone`: 1066, 1080 and 1094. Each title is unchanged apart from
  the tag.
- Locators: the iteration 1 tests at 709, 898, 934, 1008, 1023, 1038, 2496
  and 2603 now use the helpers or a role, with comments where a class is left.

`docs/specs/TODO-one-platform.md`

- Row 19 gains the village search's missing combobox state and arrow keys,
  and its tap-aware refocus and window Escape, for whoever lifts
  `SearchField`.
- New row 20, "Filter with nothing to offer": finding 4.

The design doc's "Updated 03/10/2026" note still holds and was not touched.

### Waiting on Reddy (findings 2–4)

**Decided 03/10/2026.** Reddy replied "proceed with recommendations", so the
recommended option of each was carried out. See "Iteration 2, continued"
below. The text here is kept as it was when the question was asked.

Each fix below changes what the reader sees, or a shared component's
contract, so none was made. Today's behaviour stays until Reddy decides.

- **2. The page closes FacetFilter's popover through its DOM.** Typing in the
  village search clicks `.addfilter[aria-expanded="true"]`. Options:
  - (a) Add a controlled-close or `onOpenChange` prop to `FacetFilter`. This
    is a `ui.tsx` change.
  - (b) Lift a shared `SearchField` (TODO row 19).
  - (c) Drop the reach-in and accept that, at 390, the matches and the popover
    can open over each other. Typing would no longer close the Filter, and
    the take-turns test (1038) would have to change.
  - Recommendation: (a). It removes the coupling and keeps today's behaviour.
- **3. A third page-local search-with-results surface.** Options: an explicit
  exception for now, with TODO row 19 as the tracker, or lifting `SearchField`
  into `ui.tsx` now. Adding combobox semantics to the village search alone
  would change how a screen reader announces the field, its accessible role
  included.
  - Recommendation: the exception now, and the lift as its own change.
- **4. An empty Filter without a catalog.** With `catalog = []`,
  `loadVillageCatalog` (`villageIndex.ts:101-115`) returns `[]` on a refused
  or failed read. `+ Filter` then opens on "No filter options match that
  search." with nothing typed. Options:
  - (a) FacetFilter shows the line only for a typed query. This is a `ui.tsx`
    change.
  - (b) The page hides `+ Filter` when no group has options. That needs a
    FacetFilter prop, or the page styling the component's `.addfilter`, a
    second reach-in.
  - (c) Leave it.
  - Recommendation: (a), TODO row 20.

### Verification (03/10/2026, the user's :5173; `curl` printed 200 before each run)

- Red, before any product edit: 7 failed / 13 passed
  (`cadastral-search-pw-iter2-red.log`). Each failure is the test's own
  product assertion (red-runs.md).
- The same tests after the change: 20 passed
  (`cadastral-search-pw-iter2-green.log`).
- `17-villages`, both projects: **133 passed, 0 failed**
  (`cadastral-search-pw-iter2-17.log`): 116 from iteration 1 plus 17 new or
  retagged runs. This covers search, open, upload, and remove with
  200/409/500 and the late 409.
- `01-shell` + `24-responsive`, both projects: 171 failed / 140 passed
  (`cadastral-search-pw-iter2-shellresp.log`), against a baseline of
  163 / 148 and the review run's 179 / 132.
  - By project, spec and line, 17 tests fail now that passed at baseline,
    all in `01-shell [app]`. Nine baseline failures pass now.
  - Each of the 17 fails only on the console guard: `console.error: Failed to
    load resource … 400 (Bad Request)`.
  - One trace (`:606`) shows the 400 is the seal refusing
    `query { auditTrail { … } }`, Home's root-level query. That is the same
    cause the review found for its 20.
  - Three tests fail now that passed in the review run: `:1014`, `:533` and
    `:438`. `:438` also failed at baseline. All three are the same console
    guard.
  - `24-responsive.spec.ts:548` for `/app/maps` passed in both projects, so
    nothing scrolls sideways at 390.
- `apps/web` `bun run typecheck`: pass. `bun test apps/web/src`: 98 pass.
- Every `scripts/*-tests.ts`, plus `icon-guard.ts` and `ux-guards.ts`: all
  pass except `typography-tests.ts` TY-5. TY-5 is the same three
  `font-weight: 800` lines in `apps/university/src/styles.css` (commit
  641ddb5), unmodified in the tree.
- The spec, type-checked with explicit flags
  (`tsc --ignoreConfig --strict --moduleResolution bundler …`): the only
  errors in it are the two `Buffer` lines (2217 and 2453; no `@types/node`).
- `git diff --check` is clean on the five files.
- Screenshots, at 1512 in Chromium and 390 in WebKit:
  - Dark: the first row's inset ring is whole on all four sides.
  - High Contrast: the bin's 3px ring is a whole circle.
  - The screenshots and the throwaway spec that took them were deleted after
    viewing.

Not verified:

- `tests/e2e-web360`, not allowed here.
- An on-screen keyboard. Playwright has none, so "the keyboard stays down" is
  proven only as "the field is not focused after a tap".
- Real iOS Safari or Android Chrome. The tap test runs in Playwright's
  WebKit with touch, where `tap()` gave a non-mouse `pointerType`.
- The key-press reset of `findTapped` (tap the field, then Enter on a row) has
  no test of its own.
- No assistive-technology pass.

### Change governance

- Documentation: TODO-one-platform rows 19 and 20. The design doc note
  still holds.
- Architecture: no new entrypoint, request, dependency or trust boundary.
- Security/privacy: none touched. The `DELETE` call and its handling are
  unchanged.
- Testing: as above.
- Cleanup:
  - Deleted: the throwaway screenshot spec, the screenshots, every Playwright
    `--output` folder from this iteration, the guard logs and the `/tmp`
    comparison lists.
  - Kept in `.local/impl-scratch/` (git-ignored): the
    `cadastral-search-pw-iter2-{red,green,17,shellresp}.log` files, and the
    `cadastral-search-iter2-start/` snapshot for diffing this iteration.
  - No process left running.

## Tasks 5–7 — iteration 2, continued: Reddy's decisions on findings 2–4 (03/10/2026)

### The decision

The parent session put the three questions above to Reddy, each with its
recommended option. On 03/10/2026 he replied, verbatim: "proceed with
recommendations". So the recommended option of each was carried out.
decisions.md records the same. This is all the approval there is; read it as
no more than that reply.

1. **Finding 2: the page closed FacetFilter's popover through the
   component's DOM.**
   - Options: (a) an optional prop on `FacetFilter` that lets the page close
     the popover; (b) lift a shared `SearchField`; (c) drop the reach-in and
     accept the overlap at 390.
   - Chosen: **(a)**.
2. **Finding 3: the village matches are a third page-local
   search-with-results surface.**
   - Options: (a) an exception for now, tracked in TODO-one-platform row 19;
     (b) lift `SearchField` into `ui.tsx` now.
   - Chosen: **(a)**. Reddy granted the exception on 03/10/2026. Row 19 keeps
     the target: one shared `SearchField` for the jump box, the plot finder and
     the village matches, with combobox semantics and arrow keys.
3. **Finding 4: without a catalog, + Filter opened on "No filter options
   match that search." before anything was typed.**
   - Options: (a) `FacetFilter` shows the line only once a query has been
     typed; (b) hide + Filter when there is nothing to filter by; (c) leave it.
   - Chosen: **(a)**.

Scope, as relayed:

- These two additive `ui.tsx` changes are the only `ui.tsx` changes approved.
- No existing caller's props changed.
- The + Filter trigger ring and the 44 px targets were left for the
  follow-up run.

Order of work, as planned:

1. The baseline run.
2. The finding-4 red run.
3. Only then the `ui.tsx` and `VillageMaps.tsx` edits.
4. The re-runs.

:5173 was down from about 03:00 until Reddy restarted it at 18:35. All of the
work in this section ran after that.

### Files and hunks (working-tree line numbers)

`apps/web/src/w360/ui.tsx`

The copy taken before my edit is
`.local/impl-scratch/cadastral-search-preproduct/apps/web/src/w360/ui.tsx`,
and `cmp` showed it identical at the time.

- That path first held 8c6a2d4's `ui.tsx`, copied before the outage; git can
  restore it.
- By 18:38 other sessions had changed `ui.tsx`: `SortCycle` and
  `HOLDING_WORD` in commits 8e1d6c0 and e80bd38, and uncommitted
  `TabStrip`/`TabPanel` and import hunks.
- So I copied it again immediately before my edit and checked it with `cmp`.
  `diff -u <that copy> apps/web/src/w360/ui.tsx` shows my hunks and no others.

Hunks:

- 12: `useImperativeHandle` added to the value import from 'react'. That line
  is from HEAD; the type-import block under it is another session's and was
  left alone.
- 480–485: `export interface FacetFilterHandle { close: () => void }`. `close()`
  puts the popover away the way a press outside it does, and leaves focus
  where it is.
- 492–496: FacetFilter's doc comment. Through the optional `ref`, a page can
  ask for one thing only: that an open popover close. A page that passes no
  `ref` gets exactly the filter every other page has.
- 500 and 518–519: the `ref?: RefObject<FacetFilterHandle | null>` prop.
- 559: `useImperativeHandle(ref, () => ({ close }))`. This is the component's
  own `close()`, the same one its press-away and its `+ Filter` toggle call.
  It sets `open` to false and clears the option query.
- 644–647: the empty line's condition is now
  `visibleGroups.length === 0 && (query.length > 0 || !searchPlaceholder)`,
  with a comment saying why.

Why a `ref` handle rather than a controlled `open` plus `onOpenChange`:

- It is the narrowest additive API. The page can ask an open popover to
  close, but it cannot open it or hold its state. Opening, chips, focus and
  Escape stay inside the component, as design.md § App-surface rules and
  FacetFilter's doc comment require.
- React 19 passes `ref` to a function component as an ordinary prop.
  `VillageCanvas`, `MapCanvas` and `PortfolioCanvas` already take one the same
  way.
- A caller with no `ref` hands `useImperativeHandle` `undefined`, which does
  nothing. So Desk, RecordFeatures, Properties, Vault, RecordPapers,
  ComplianceAdmin (three filters), Orders and DeskAssociates behave as they
  did.

Which pages the empty-line change reaches:

- Only popovers with a search: Vault ("Search types, files, properties or
  tags") and Cadastral maps.
  - With nothing typed and no options, the popover now shows its search row
    alone.
  - A typed query that matches nothing still gets the line.
- The seven pages without a search keep the line exactly as before.
- **For review:** the decision as relayed reads "only once a query has been
  typed".
  - A popover without a search can never have a query typed, so the literal
    reading would hide the line there for good. Those popovers would then open
    as an empty box: Orders' closed view with no orders, for example, or
    Compliance's workforce view with no rules.
  - I kept the line there.
  - The literal version is a one-line change: drop `|| !searchPlaceholder`.

`apps/web/src/w360/pages/VillageMaps.tsx`

The pre-edit copy is
`.local/impl-scratch/cadastral-search-approved-preedit/apps/web/src/w360/pages/VillageMaps.tsx`.

- 36: `import type { FacetFilterHandle } from '../ui';`
- 176–177: the `facetFilter` ref, with its comment.
- 612–613 and 616, inside `openFind` (609–617): `facetFilter.current?.close()`
  replaces the DOM click on `.addfilter[aria-expanded="true"]`. The comment
  now says the page asks the Filter to put its popover away. No page file names `.addfilter`
  now; only `ui.tsx` and the stylesheet (`w360.css`) do.
- 1006: `ref={facetFilter}` on `<FacetFilter`.

`tests/e2e-app/specs/17-villages.spec.ts`

- 730: the new test, "the Filter says nothing matched only once I have typed
  something for it to match". With `ground()`'s empty catalog, opening
  + Filter shows no such line and no group. Typing "Ongole" then shows the
  line.
- 1075–1078: the take-turns test now also checks that putting the Filter
  away leaves focus and the typed words in the village search.

`docs/specs/TODO-one-platform.md`

- Row 19 now records the `FacetFilterHandle` close and Reddy's exception of
  03/10/2026. Its target stays one `SearchField` for all three surfaces, with
  combobox semantics and arrow keys.
- Row 20 is struck through and marked Done 03/10/2026, following row 17's
  convention.
- Another session added a University line to the palette checklist at 19:00.
  It was left alone.

Not changed:

- `design.md` was not in the approval. § App-surface rules already keeps
  dismissal inside the component, and the handle keeps it there.
- The design doc's 03/10/2026 Cadastral maps note still holds: the matches
  and the Filter popover take turns.

### Verification (03/10/2026, Reddy's :5173, pid 72141; `curl` printed 200 before each run)

**Baseline.** before-test-baseline.md, second section:

- The six specs in both projects: 638 tests, 138 failed / 500 passed
  (`cadastral-search-pw-ff-before.log`).
- The first run showed no sign of a dependency re-optimisation, so nothing
  was re-run for that reason.
- A second sample of the four Filter specs on unchanged code: 48 failed /
  256 passed (`cadastral-search-pw-ff-before2.log`). The failing set matched
  the first run, apart from one 05-record-papers flake.

**Red, finding 4** (red-runs.md):

- Nothing typed, yet the line showed: expected count 0, received 1 (line 744).
- Finding 2 keeps behaviour, so it had no red run. The take-turns test, with
  its new focus check, passed on unchanged code in both engines
  (`cadastral-search-pw-ff-turns.log`).

**After the edits**, the same six specs in both projects: 147 failed / 491
passed in 12.7 minutes (`cadastral-search-pw-ff-after.log`). Test by test
against the baseline:

- 03-properties, 06-record-features, 11c-documents-files and 24-responsive:
  no test fails now that passed at baseline.
- 05-record-papers: one does. It is the flake above, "a scan the reader could
  read is filed under the register's own name, on the Title shelf", and it
  failed on the same assertion in the second baseline sample, on unchanged
  code ("03/04/1998" for "04/03/1998").
- Every test that failed both before and after failed on the same assertion,
  by first error line and first code-frame line: 47 in 03/05/06/11c, and 86 in
  24-responsive.
- Two tests pass now that failed at baseline:
  - the finding-4 test;
  - 24-responsive `[phone]` "the record 360 stacks its map under what it says
    rather than beside it", which this change does not touch.
- 17-villages: 10 `[app]` tests failed in that run, all in `openMaps` or
  `revealVillage`. The page still showed its "Loading" spinner, so neither the
  heading nor the search input appeared within 10 s.
  - That run shared the machine with the guard scripts and unit tests, which
    I ran alongside it.
  - Two other sessions' edits landed in the served tree during it: `Vault.tsx`
    at 18:57:02 and `groupsData.ts` at 19:02:28.
  - Re-run alone straight after, 17-villages passed **134 of 134** in both
    projects (`cadastral-search-pw-ff-after17.log`). That covers all 10, the
    new test, and the take-turns test in both engines.

**Other checks:**

- `apps/web` `tsc --noEmit`: pass.
- `scripts/shared-components-tests.ts`: pass. It notes the same four budgets
  that can come down, all in other sessions' files.
- Every `scripts/*-tests.ts`, plus `icon-guard.ts` and `ux-guards.ts`: all
  pass. `typography-tests.ts` passes now too, after another session's fix to
  `apps/university`.
- `bun test apps/web/src`: 358 pass, 0 fail.
- `git diff --check` is clean on the four changed files. Diffs against the
  pre-edit copies show only the hunks above.

Not verified:

- `tests/e2e-web360`, not allowed here.
- Vault's popover with no documents and nothing typed, the one other page the
  empty-line change reaches. I checked it by reading the code only.
  11c-documents-files passes, but it has no test for that state.
- No assistive-technology pass.

### Change governance

- Documentation:
  - TODO-one-platform rows 19 and 20.
  - decisions.md: the decision and Reddy's reply, verbatim.
  - before-test-baseline.md: the baseline.
  - red-runs.md: the red run.
  - `design.md`: unchanged.
- Architecture: `FacetFilter` gains an optional `ref` handle. There is no new
  entrypoint, request, dependency or trust boundary.
- Security/privacy: none touched.
- Testing: as above.
- Cleanup:
  - Deleted:
    - this part's Playwright `--output` folders (`ff-before`, `ff-before2`,
      `ff-red`, `ff-turns`, `ff-after`, `ff-after17`);
    - the guard logs;
    - two scratch comparison scripts and their output;
    - the typecheck log.
  - Kept in `.local/impl-scratch/` (git-ignored):
    - the six `cadastral-search-pw-ff-*.log` files (`before`, `before2`,
      `red`, `turns`, `after`, `after17`);
    - the pre-edit snapshots `cadastral-search-iter2-approved-start/` and
      `cadastral-search-approved-preedit/`;
    - the `cadastral-search-preproduct/…/ui.tsx` copy.
  - No process left running. The two dev servers, :5173 and University's, are
    Reddy's and were not touched.
