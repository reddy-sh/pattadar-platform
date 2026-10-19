# W360 Home final UX: verification (02/10/2026)

This file records what was run, in what state, and what came back, so the
reviewer does not have to re-run the suites. It reflects the tree after the
review pass, run against HEAD `8c6a2d4` with Bun 1.3.14 and Playwright
1.62.0. The logs are git-ignored under `.local/impl-scratch/`. Nothing was
committed.

## Scope: this task's delta

The delta is measured against `.local/impl-scratch/home-final-baseline/`,
which includes the user's pre-existing uncommitted changes. `apps/web/README.md`
is measured against HEAD, because it is not in the baseline and was
unmodified before this pass.

| File | Delta | This pass |
|---|---|---|
| `apps/web/src/w360/pages/Dashboard.tsx` | +169/−102 | `className="sec ov-sec"` on the Overview section, plus a two-line comment |
| `apps/web/src/w360/homeGaps.ts` | new, 72 lines | none |
| `apps/web/src/w360/homeGaps.test.ts` | new, 94 lines | none |
| `apps/web/src/w360/w360.css` | +64/−3, three Home-only hunks | `.ov-sec` container and the 840px + 48rem rule; `.ov-value` nowrap; `.cards.compact` `auto-fit`; `.rec-kind` full-strength tokens |
| `tests/e2e-app/specs/02-dashboard.spec.ts` | +787/−112 | `linesOf()` and `contrastOf()` helpers; the 901 leg rewritten; three new tests |
| `docs/specs/2026-08-15-web-360-design.md` | +13/−5, three targeted hunks | none |
| `apps/web/README.md` | +1/−1 | the `/app` row describes the current Home |

These are not part of the delta: everything listed in orchestrator notes §1,
and every file on the concurrent-work list. None of them was edited by this
task. The other baseline copies are still byte-identical: ui.tsx, routes.tsx,
api.ts, Shell.tsx, SetupChecklist.tsx, Dialog.tsx, Audit.tsx, growthData.ts,
data/hooks.ts, design.md and shared-components-tests.ts. This pass edited
w360.css with targeted `str_replace` only, re-reading the block before each
edit.

Order of events: the last edits to CSS and Dashboard were at 22:39. The last
spec edit (comment only) was at 23:00. The typecheck, unit tests, guards and
build ran at 22:48–22:49, after the code edits. The final 02-dashboard run
was at 23:01, after every edit.

## Results

| Check | Command (repo root unless noted) | Result | vs `before-guards.md` / baseline | Log |
|---|---|---|---|---|
| Typecheck | `bun run typecheck` | PASS: tokens, core, university, web, mobile all exit 0 | same | `home-final-review-typecheck.log` |
| Web unit tests | `bun test apps/web/src` | PASS: 98 pass, 0 fail, 329 expect(), 18 files | Before: 86 tests in 16 files. Added since: `homeGaps.test.ts` (9 tests, this task) and the concurrent session's untracked `pages/families/cardName.test.ts` | `home-final-review-buntest.log` |
| Guards | every `scripts/*-tests.ts`, plus `icon-guard.ts` and `ux-guards.ts` | 19 of 20 PASS. FAIL: `typography-tests.ts` TY-5 only, at `apps/university/src/styles.css:1488`, `:1520` and `:1538` (`font-weight: 800`) | Same as before, including the same TY-5 lines. `aadhaar-digits-tests.ts` is new and untracked (not this task) and passes | `home-final-review-guards.log` |
| shared-components detail | (in the loop) | PASS, with the same four "could be lowered" notes and none for Dashboard | same | same log |
| Spec types | `tsc -p <scratch tsconfig>` over `02-dashboard.spec.ts` (`module: preserve`, `moduleResolution: bundler`, `types: []`) | 0 errors in the spec. 35 in `fixtures/` (node globals `Buffer` and `process`, `vars` implicit any), from leaving node types out | The suite's own tsconfig cannot run under TS 7: `moduleResolution=node10` was removed and `@types/node` is absent. Not this task's | `home-final-review-e2e-tsc.log` |
| Web build | `cd apps/web && ./node_modules/.bin/vite build --outDir <repo>/.local/impl-scratch/home-final-build --emptyOutDir` | PASS, `Dashboard-CKiI-wBh.js` 13.27 kB. The built CSS keeps `@media (width>=840px){@container overview (width>=48rem){…}}`. The scratch folder was removed; `apps/web/dist` (01/10 20:26) was not touched | n/a | `home-final-review-build.log` |
| 02-dashboard, sealed | see `after-test-report.md` | app: 53 pass, 1 expected failure, 12 fail. phone: 3 of 3 pass | Baseline: 45 failed / 4 passed. Zero new failures, and the same 12 as the first pass | `home-final-review-02.{log,json,tsv}`, `home-final-review-02-join.tsv` |
| One font on `/app` | `cd tests/e2e-app && APP_WEB_URL=http://localhost:5173 ./node_modules/.bin/playwright test specs/26-one-font.spec.ts --project=app --project=phone -g "@phone /app draws every word" --reporter=line --output=<scratch>` | 2 passed (app, phone) | before: 2 passed | `home-final-review-font.log` |
| Functional acceptance | `.local/impl-scratch/home-final-fa.spec.ts`, copied into `specs/` for the run and then deleted | 7 of 7 passed (app) | first pass: 7 of 7 | `home-final-review-fa.log` |
| CSS mutation check | see below | each new assertion fails against its pre-fix rule | new | `home-final-review-mutation.log` |
| Other Home-touching specs | 00-harness, 01-shell, 03-properties and 24-responsive, sealed, app + phone | 03 and 24 match the pre-edit run exactly. 00 and 01 differ only by timing races (below) | `home-final-before-others.tsv` (19:58, pre-edit) | `home-final-review-others.{log,json,tsv}`, `home-final-review-shell2.*` |
| Web–iOS parity | `bun run scripts/parity-check.ts --json` (read-only) | exit 1 from two `twins` errors, neither from this task (below). This task's files band NOTE / IGNORE / none | n/a | `home-final-review-parity.json`, `ios-parity-note.md` |

Every sealed run used `APP_WEB_URL=http://localhost:5173` against the user's
dev server, which answered HTTP 200 and was neither started nor stopped by
this task. The runs used fixture data only, with no `live` project and no
`allowEscapes`. They reported with `--reporter=line`, adding `json` into
scratch through `PLAYWRIGHT_JSON_OUTPUT_FILE`, so the suite's own
`results.json` and `playwright-report/` were not rewritten.

## The 02-dashboard gate (orchestrator notes §2)

- **Zero new failures.** All 12 failures are on the baseline list, every one
  in the `app` project. They are the same 12 as the first pass, and each test
  body is unchanged from the baseline copy (`home-final-review-02-join.tsv`
  marks them `same`). The per-test causes are in `after-test-report.md`.
- **Every test this task touches passes**, in both projects where it is
  tagged `@phone`. That covers For you, the caught-up line, the merged
  Missing details row, the disclosure cap of 3, dedup, the row actions, the
  Overview grid, Estimated value "—", and the Recently opened tile.
- **Nothing deleted, skipped or weakened.** All 48 baseline titles are
  present, plus 18 new ones: 15 from the first pass and 3 from this one. The
  only `test.fail()` change is the removal at 471 under AUTHORING rule 5. The
  901 leg changed what it expects, from one row to two by two, because the
  layout at that width changed (finding 1). It gained a one-line-figure
  assertion; nothing was dropped.

The assertions the brief and the review asked for:

| Behaviour | Test (current line) | Result |
|---|---|---|
| "You're all caught up" never renders while gaps exist | 986 (Sy 88 off the map, count 1, no caught-up line); 963 (seeded); 1285 (caught-up only when nothing is missing); 1014 and 1032 (silent while the list or the orders are still out); 1048 (silent after a failed list) | pass |
| The merged summary row | 963: one "Missing details" heading and no h2 card; "2 of 3 complete"; "1 Not on the map"; For you count 5 | pass |
| Disclosure capped at 3 | 1063: five gap properties → three h4 rows plus "2 more properties · All properties"; `aria-expanded` and the `aria-controls` panel; Enter opens, Space shuts | pass |
| Dedup | 963; 1109; 1512 (listed again once its reminder is dismissed) | pass |
| "—" for Estimated value | 495 (name "Estimated value not set …", "—", "Bought for ₹94.0 L"); 599 (a valued figure carries neither) | pass |
| One label, one destination (D3) | 1148; 1109 | pass |
| Text-button row actions | 1206 | pass |
| **Overview grid, finding 1/2** | 512: 1512 one row, even, no empty track, figure on one line; 901 two by two, even, both rows full, "₹2.38 Cr" on one line, no sideways scroll. 559 (new): "₹12.40 Cr" and "₹123.45 Cr" at 390, 840, 900, 901, 960, 1000, 1087, 1088, 1280 and 1512 → one line, inside its card, four in a row or two by two, even, no sideways scroll. 1801: 390 two by two (app, phone) | pass |
| Compact Recently opened tile | 843 (no `.art`, tiles ≤ 110px, four in one row) | pass |
| **No empty track, finding 3** | 865 (new): the seeded three share one row, even, the third ending at the grid's edge | pass |
| **Kind icon contrast, finding 4** | 884 (new): ≥ 3:1 against its tile for land, flat and shop in Dark, Light and High Contrast (switched through the theme menu) | pass |
| Phone | 1813 (gap row on one line, 44px floor on `phone`) | pass |

### Mutation checks

This pass's CSS fixes were checked without touching the shared stylesheet. A
scratch copy of the spec (deleted afterwards) rewrote the dev server's copy
of `w360.css` in flight with `page.route`. It first asserted that each anchor
string appeared exactly once. The real test bodies then ran against each
pre-fix rule, with `-g` set to the four tests:

| Mutation | Failed, as it should | Passed |
|---|---|---|
| none (control) | — | all 4 |
| the window-only 840px rule | 512 "901px: the second two are under them"; 559 "₹12.40 Cr at 901px: the figure stays inside its card" | 865, 884 |
| `.ov-value` without nowrap | 559 "₹123.45 Cr at 390px: the figure on one line" | 512, 865, 884 |
| the previous pass exactly (840px rule, no nowrap) | 512 (two by two at 901); 559 "₹12.40 Cr at 901px: the figure on one line" | — |
| `auto-fill` | 865 "the third tile ends where the row does" | the other 3 |
| the 55% / 50% kind mixes | 884 "dark: the kind icon on tile 3" (shop, 2.4:1) | the other 3 |

The table gives line numbers in the current spec. The log's numbers are for
the scratch copy, which has the mutation block inserted near its top, so
they are offset. The first pass's mutation check still stands, because the
For you code is unchanged since. Weakening the caught-up gate made 853 and 871 fail. Those
tests are now at 1014 and 1032 (`home-final-mutation.log`).

### Measurements behind the 48rem threshold

These were taken in the sealed harness on `:5173` with Chromium, and WebKit
for the phone (`home-final-measure-{before,after}.log`, spec
`home-final-measure.spec.ts`).

- **Figure widths** at `.ov-value` (Atkinson 700, 1.5rem, tabular), the same
  in Chromium and WebKit: "₹2.38 Cr" 99.8px, "₹99.99 L" 102.8, "₹12.40 Cr"
  115.0, "₹123.45 Cr" 130.1, "₹1234.56 Cr" 145.3.
- **Before the fix:** at 901 and 950 the seeded figure had 83 and 96px and
  took two lines. At a 44rem column (1024px) a card leaves 114px, under the
  115px "₹12.40 Cr" needs.
- **After the fix:**
  - 840–900 (no rail): four tracks, 140–155px of room.
  - 901–1087 (rail open): two by two, 233px or more.
  - From 1088: four tracks, 130px or more.
  - Rail collapsed: four tracks from 912.
  - 390: two by two, 121px. "₹123.45 Cr" stays on one line, ending 14.9px
    inside the card's right border.
  - Every figure was one line at every width, with no sideways scroll.
- **The container moves nothing:** with and without `container-type`, the
  section's top, the h2's top, the grid's top and the section's left and
  width were identical at 1512.
- **Three tiles at 1512:** tracks of 386.66 × 3, with the empty fourth
  collapsed to 0px; each tile is 387px, ending at the grid's edge.

## Other Home-touching specs (regression check)

The run covered 00-harness, 01-shell, 03-properties and 24-responsive, on
app and phone, against the pre-edit run of the same specs at 19:58
(`home-final-before-others.tsv`):

- **03-properties** (shared `.cards` / `.rec`) and **24-responsive**: the
  same result for every test, in both projects. The compact modifiers did
  not touch Properties or the responsive layouts.
- **00-harness**: one more failure, `:13` "the app opens on the dashboard…".
  The cause is a strict-mode race: `getByRole('navigation')` resolves to the
  rail and Home's Shortcuts nav once Home has drawn. The Shortcuts nav has
  been in HEAD since 26/09, and this task did not change it. Repeated six
  times, the test passed 1 and failed 5. It also trips the console guard on
  the unanswered `auditTrail` (before-test-baseline cause 1).
- **01-shell**: 16 tests went from pass to fail and 8 from fail to pass
  between the pre-edit run and this one. In a second run of the same code,
  14 tests changed again (`home-final-review-shell2.tsv`). In that run, 70 of
  84 failures were the console guard alone, from the 400 on the unanswered
  `auditTrail`. The other 14 also failed before any edit: the rail's
  "Dashboard" link, the assistant copy and the Services count. This is timing
  in a spec that does not answer `auditTrail`, not a change in Home.

## Functional acceptance

Home's only write is the reminder dismiss (`dismissWaiting`); every other
control navigates or toggles client state. This pass changed no For you
code. The instrument is the sealed `e2e-app` harness, which proves the
client flows and their failure handling, not the live gateway or database.

| Operation | Lands on | Failure path exercised | Result | Evidence |
|---|---|---|---|---|
| Gap row, no documents: **Open record** (the brief's "Open Documents", relabelled under D3) | `/app/records/:id` | record read refused: "This property did not load", the reason, Try again; Back returns Home with count 7 and no dismiss sent | worked | FA; 02:1109 |
| Gap row: Set location | `/app/records/:id/map` | same refused record read | worked | FA; 02:986 |
| Gap row: Draw boundary | `/app/records/:id/map` | same; draws Sy 214/2 when the read answers | worked | FA; 02:1184 |
| Reminder: Open record | `/app/records/:recordId` | same; draws Sy 88 when the read answers | worked | FA; 02:953 |
| Order: Open order | `/app/services/:id` | ticket read refused: "This service did not load", the reason, Try again | worked | FA; 02:1206 |
| Shared-link reminder: Open Documents | `/app/papers` | vault read refused: "Your documents did not load", the reason | worked | FA; 02:1232 |
| Dismiss a reminder (confirm dialog) | asks first; Keep it, Escape and the scrim back out; Dismiss it sends one mutation with that row's id; list and counts re-read; the last one leaves "You're all caught up" | refused: toast with the reason, dialog stays, row kept; in flight: both buttons disabled, `aria-busy`, Escape and scrim held, exactly one mutation | worked | 02:1308–1556 (ten tests) |
| Show all / Hide | at most three rows plus the overflow line, `aria-expanded`, `aria-controls`, keyboard | no server call of its own; list pending → silent (1014); orders pending → silent (1032); list failed → Missing details dropped (1048) | worked | 02:1063, 1014, 1032, 1048 |
| Home's reads | portfolio pending, failed, retried | waiting state, failure with reason, Try again recovers or stays failed | worked | 02:1663–1753 |
| Recently opened tile, Overview cards | navigation only | — | worked | 02:738 (a tile opens its record) |

Not exercised: the real gateway, API and database. The disposable
`tests/e2e-web360` suite needs a `TEST_PG_DSN` and was not run. It asserts
the pre-26/09 Home, and its `gap-properties.spec.ts:247` will need
`exact: true`.

## Visual and accessibility checks

These were scratch element screenshots through the same seal on `:5173`,
each confirmed under 2000 px with `sips` before viewing, then deleted:

- **Overview:** two by two at 901 and 1000, four in a row at 1088 and 1512.
  Every figure is on one line.
- **390, "₹123.45 Cr":** two by two, the figure on one line inside the card.
- **Recently opened at 1512:** three tiles filling the row in Dark, Light
  and High Contrast. The kind icons are clearly drawn: the land icon in the
  accent, the flat in info and the shop in danger.

The first pass's checks still hold, because nothing here touched For you:
1512 dark seeded and with five gaps, High Contrast and Light For you, and the
390 phone.

Also confirmed:
- No font-family, no weight other than 400/700 and no colour literal was
  added; `a11y-web-tests` checks that every `var(--…)` resolves.
- No motion was added.
- The figure keeps `.num` (tabular).
- The Overview stays one `aria-labelledby` region.

Not verified:
- screen-reader output with a real assistive technology;
- Overview layouts at widths outside the sweep;
- the rail-collapsed layout beyond 901–1512 track counts;
- fallback-₹ widths on other operating systems (the 15px headroom is for
  them);
- Recent activity with data, since the fixtures answer `auditTrail` empty;
- the live stack.

## Concurrent or pre-existing reds (not fixed)

| Where | Message | Why not this task |
|---|---|---|
| `scripts/typography-tests.ts` | TY-5: `apps/university/src/styles.css:1488`, `:1520`, `:1538` `font-weight: 800` | committed in `641ddb5` and unmodified; red before this task |
| `scripts/parity-check.ts` | `packages/core/src/land/landcalc.ts changed; its twin did not` (`Boundary.swift`) | `landcalc.ts` is the concurrent session's file |
| `scripts/parity-check.ts` | `packages/core/src/api/operations.ts changed; its twin did not` (`Queries.swift`) | modified in the working tree by another session; not in this task's delta |
| `tests/e2e-app/specs/00-harness.spec.ts:23` | strict mode: `getByRole('navigation')` resolves to 2 elements | the Shortcuts nav has been in HEAD since 26/09; a timing race, 1 of 6 passes |
| `tests/e2e-app/specs/01-shell.spec.ts` | console guard: 400 on the unanswered `auditTrail` | before-test-baseline cause 1, timing-dependent |
| `tests/e2e-app/tsconfig.json` | TS5108 `moduleResolution=node10` removed; TS2688 no `@types/node` | suite config, not this task's |

## Documentation (runbook-consistency)

- `apps/web/README.md`: the `/app` row now lists the current Home sections.
  The old row said "dashboard — portfolio, what's waiting, where the value
  sits".
- `docs/specs/2026-08-15-web-360-design.md`: the first pass's three targeted
  hunks, covering the `waiting_items` row, "Derived, never stored" and the
  archive paragraph. The doc does not describe the Overview's tracks or the
  tile layout, so this pass changed nothing there.
- `w360.css` comments state the 840px + 48rem rule with its measured reason,
  the nowrap, `auto-fit` and the contrast reason. `Dashboard.tsx` says why
  `ov-sec` exists.
- `design.md` is unchanged: there is no new vocabulary, and editing the
  authority is Reddy's call. `tests/e2e-app/README.md` and `AUTHORING.md` do
  not describe Home.

## Retained artifacts and processes

Kept for the reviewer, all git-ignored under `.local/impl-scratch/`:
- this pass: the `home-final-review-*` logs and JSON/TSV,
  `home-final-measure-{before,after}.log`, `home-final-measure.spec.ts` and
  `hf-join-review.ts`;
- first pass: the `home-final-after-*` files, `home-final-fa.spec.ts`,
  `hf-join.ts` and `home-final-pw-after/`.

Removed:
- this pass's scratch specs from `tests/e2e-app/specs/` (none are left);
- the screenshots, the Playwright output folders and the scratch build;
- the scratch tsconfig and the served-CSS dump.

No agent-started process is running. The dev servers on 5173, 5181 and the
University Vite were not touched.
