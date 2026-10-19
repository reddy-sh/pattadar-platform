# Follow-up brief: Cadastral maps, the extra findings from the BEFORE board (test-first)

Written by the orchestrator on 03/10/2026 and updated at launch. Workflow
`wf_3e4eb941860202e6` ("cadastral-maps-search-relaunch") has completed. Both
runs edit the same files, which is why this one starts only now.

This is moderately heavy. It touches:
- the shared `FacetFilter` styles, which reach every page that uses it;
- a W360-wide reduced-motion rule;
- a delete flow;
- one approved copy change;
- a few tests and one skill wording line.

All of this happens in a working tree where other agent sessions have
uncommitted edits, and where other sessions also commit to `main`. The design is
decided below; do not add a design phase. Line numbers are approximate and moved
during the previous run, so find each spot by its content.

## Read first

- `/Users/reddy.sh/reddy.sh/projects/pattadar-platform/.agents/tasks/cadastral-maps-search-ux/report.md`
  is the previous run's report; start with its "Final report" section. Its
  AFTER state is this run's BEFORE. It lists the files that run changed and how
  other sessions' hunks were attributed.
- `/Users/reddy.sh/reddy.sh/projects/pattadar-platform/.agents/tasks/cadastral-maps-search-ux/impl-review.json`
  is the previous run's final review. Its findings 1 and 3 feed this run.
- `/Users/reddy.sh/reddy.sh/projects/pattadar-platform/.local/ux-audits/2026-10-02-w360-cadastral-maps/board.html`
  is the BEFORE board, as text. The findings below come from it.
  - `evidence/` holds the BEFORE captures.
  - `implementation/after/` holds the previous run's AFTER captures, under the
    same file names.

## State at launch (03/10/2026, checked by the orchestrator)

- **Git.** HEAD is `c685d22`. Other sessions landed six commits after `8c6a2d4`
  (0ace64b, 591e670, 4a95ca4, 8e1d6c0, e80bd38, c685d22). The rail's
  "Combined views" is now "Holdings". Nothing from this task is committed.
- **The palette session's uncommitted token migration**, in
  `apps/web/src/w360/w360.css` and `apps/web/src/theme.ts`:
  - Scheme selectors became `[data-scheme='…'] .w360 …`; the attribute sits on
    `<html>`.
  - In w360.css, `--color-focus` became `--w-focus`, with `--w-focus-halo` for
    High Contrast. The High Contrast focus colour is now ink with a light halo.
  - High Contrast's global 3px ring moved into `theme.ts` as
    `[data-scheme="highContrast"] :focus-visible` (`!important`, specificity
    (0,2,0)). The previous run's container rules are
    `[data-scheme='highContrast'] .w360 …` at (0,4,x), also `!important`.
  - `--w-ink-1` has 0 uses in `apps/web/src` now.
  - `scripts/a11y-web-tests.ts` M3-6 now reads `var()` usages in CSS files as
    well, and passes.

  Use the focus token(s) the W360 stylesheet uses today. Never reintroduce
  `--color-focus` in w360.css, and never rename tokens. `design.md` also has
  that session's uncommitted edits: § Microinteractions stance (~308) still
  names `--color-focus`, while ~544 names `--w-focus`. Report contradictions as
  drift. Never edit design.md, `theme.ts` or `Shell.tsx`.
- **`apps/web/src/w360/ui.tsx`** holds:
  - the previous run's two approved, additive FacetFilter changes:
    - `FacetFilterHandle`, whose `close()` is reached through an optional
      `ref` (~480-519, ~559);
    - the empty line's condition
      `visibleGroups.length === 0 && (query.length > 0 || !searchPlaceholder)`
      (~644-647);
  - another session's uncommitted `TabStrip`/`TabPanel` (~670-765), and the
    committed `SortCycle` (8e1d6c0). Keep them.
- **`apps/web/src/w360/pages/VillageMaps.tsx`**, after the previous run:
  - The village matches are a temporary surface, `.vm-find` /
    `.vm-find-results` (~1018-1081; CSS ~4382-4417).
  - State: `findOpen`/`findShown` (~138-144); refs `findBox`, `findField`,
    `facetFilter`, `findQuiet` and `findTapped` (~172-183).
  - Handlers: `openFind`/`refocusFind`/`chooseVillage` (~609-635), the window
    Escape branch (~296-303) and the press-away listener (~321-332).
  - The Filter has District and Mandal only.
  - A Remove keeps the matches open, whether it succeeds or is refused. While
    the matches are open, the refusal line shows inside the box.
- **`tests/e2e-app/specs/17-villages.spec.ts`** has 134 tests (120 app, 14
  phone).
  - Helpers at ~313-385: `twoMandals`, `ring`, `ringWhole`, `matches`,
    `matchRows` and `highContrast`.
  - Removal tests: "a shipped village map has no bin" (~2318), "taking an
    uploaded map off…" (~2330), the 409 (~2490), the 500 (~2508), the late 409
    (~2521) and the remove-from-matches test (~1005).
- **Harness noise (not ours).** The seal refuses Home's root-level
  `query { auditTrail … }` with a 400. Many 01-shell and 24-responsive tests
  fail on the console guard alone, and the same tests flip between runs.
  Compare test by test and attribute each failure. Don't fix this; it belongs
  to test-governance.
- **Scratch.** The previous run's snapshots under
  `.local/impl-scratch/cadastral-search-*` are deleted. Take your own baseline
  copies.

## Approved decisions

Record these verbatim in `.agents/tasks/cadastral-maps-followup/decisions.md`.

On 03/10/2026 Reddy (the user, the Chief Architect) replied "go with your
segguestion" to two questions in chat.

- **[1] Should the new findings be fixed too?** The recommended answer was "a.
  Yes, in a follow-up run once this one finishes". It covers finding 1 (the
  tally part), 3, 4, 6, 8 and the `--w-ink-1` drift.
- **[2] For finding 1, should the village count appear only once?** The options
  were "a. Yes" and "b. No, keep all three, just consistent". The orchestrator
  took this as the board's own proposal: tell the village count once, in the
  tally; the head line keeps its plot total and the landing badge goes. It told
  Reddy so in chat.

The orchestrator then wrote back: "For question 2 I didn't list a
recommendation, so I went with the board's proposal. The village count shows
once, in the tally. The head line keeps only its plot total. The count badge on
the map goes when no village is open, and stays as it is when one is. … If
you'd rather keep all three counts, just consistent, tell me before the
follow-up starts." Reddy replied "proceed with recommendation" on 03/10/2026.

Do not describe either decision as more than that. Keep the [2] change in its
own small hunks, listed by line in the report, so it can be reverted alone.

Settled during the previous run (Reddy, 03/10/2026, "proceed with
recommendations"):
- FacetFilter has an optional `ref` handle, `FacetFilterHandle.close()`, and
  VillageMaps no longer clicks `+ Filter` through the DOM.
- FacetFilter shows "No filter options match that search." only once a query
  has been typed.
- The village matches stay a page-local surface for now, as an exception;
  TODO-one-platform row 19 tracks the shared SearchField.

Still open with Reddy: the implementer kept the empty line in popovers that
have no search (`|| !searchPlaceholder`). That is a reading of his approval,
not his words; TODO row 20 keeps the two apart. Don't change that line unless
the orchestrator passes his decision into this run.

Build on these. Do not change FacetFilter's props or its TSX in this run:
findings 3 and 4 are style-only.

## The changes

### Finding 1: the village count is told three times

At rest, the count appears in three places:
- the head line ("N villages on record · M plots");
- the Filter tally;
- the landing map badge.

Typing MYLAVARAM makes them read 5, 2 and 5: the tally counts the search
matches, while the head line and the badge count the outlines drawn. This is
still true after the previous run (`implementation/after/maps-search-typed-match-app.png`).

Sources, to find by content in VillageMaps.tsx:
- the head line's `` `${plural(mandal.length, 'village')} on record · ` `` in
  the PageHead child;
- the tally, `plural(shown.length, 'village')`, on FacetFilter;
- `shown`, the search filter over `villagesHere`;
- the `.vc-badge` shown while no village is open.

The changes:
- **(a) Within authority.** The tally counts `villagesHere` (the area the
  Filter leaves), never the search matches.
- **(a2) Within authority.** The stage's empty state, "N cadastral map(s) on
  file · Search for a village above.", counts the whole index. With a mandal
  whose overview has no outlines, it said 5 while the tally said 1 (previous
  report, follow-up 7).
  - Make it count the same population as the tally.
  - Keep the sentence; don't reword or drop it. If it should go too under [2],
    report that as a recommendation.
- **(b) Approved [2].**
  - At the landing state, the head line keeps only its plot total and drops
    "N villages on record · ".
  - The landing badge goes.
  - The badge shown while a village is open ("<VILLAGE> · zoom N · numbers on")
    stays.
- **Tests.** Update the sealed tests that assert the old head line or the
  landing badge to the approved behaviour. Examples: the `.vc-badge` "1
  village" check in "the way back out of a village is to all of them", and "every
  village on record is drawn on one map, and the head counts what is on it".
  - List every changed assertion and title, and why.
  - Never soften an unrelated assertion.

### Finding 3: the `+ Filter` trigger has no W360 ring

In Dark and Light, `.addfilter` (the FacetFilter trigger) shows the browser's
own `auto 1px` ring.
- Give it the W360 focus ring using today's token (`--w-focus`): 2px in Dark
  and Light. In High Contrast, use the treatment the village pill now has
  (3px, with the halo), not just the global rule.
- Check what the previous run did for the Filter's search row
  (`.fpop-head:has(input:focus-visible)`, inset) and for the pill
  (`.search:has(input:focus-visible)`), and stay consistent.
- Measure the Filter's other focus targets in Dark and High Contrast: option
  rows (`.fpop .opt`), the active chips' × buttons, `Clear all` and
  `.fpop-close`.
  - If one shows the browser's ring instead of a W360 one, give it the same
    W360 ring. It's the same rule in the same component.
  - Test each fix, and list each one in the report.

### Finding 4: the Filter's targets are under 44px

The trigger is 31px tall and the options sit at a 32px pitch.
- Make the trigger and each option row at least 44px tall (`2.75rem`), as the
  pill already is.
- Selectors, by content: `.w360 .addfilter`, `.w360 .fpop .opt`, and the maps
  override under `.vm-map-filters .fpop`.
- Measure the chips' × buttons and `Clear all` too, and report their sizes.
  Don't resize them in this run, because that would change how chips look on
  every page. List them as a follow-up.

Findings 3 and 4 change shared CSS. Recompute where FacetFilter is used with
`grep -rl '<FacetFilter' apps/web/src`. On 03/10 01:10 the list was Desk,
RecordFeatures, Properties, Vault, RecordPapers, VillageMaps, ComplianceAdmin,
Orders and DeskAssociates; the Holdings work may have added one.
- Check every such page at 1512 and 390:
  - nothing scrolls sideways at 390;
  - the filter row wraps no more than before;
  - the popover still fits.
- The sealed specs that open "+ Filter" are 03, 05, 06, 11c, 17 and 24.

### Finding 6: focus rings fade in under reduced motion

A reduced-motion rule in `w360.css` (find by content) gives W360 elements a
short transition. An element with no transition list of its own then animates
every property, including `outline` and the halo's `box-shadow`, so its ring
fades in. design.md § Microinteractions stance says focus is visible instantly
and never animated.
- The previous report measured this. Straight after `focus()`, the pill's Dark
  ring was `rgb(214, 147, 79)` against `rgb(255, 160, 60)` once settled. In
  High Contrast it read a 2px offset and a 2.95px halo, against 3 and 3.
- Keep focus rings (`outline`, `outline-offset` and the halo's `box-shadow`)
  out of that rule, in every scheme.
- **Test** under `page.emulateMedia({ reducedMotion: 'reduce' })`, in both
  engines:
  1. Focus the control.
  2. Assert that it has no running `CSSTransition` whose `transitionProperty`
     starts with `outline` or is `box-shadow` (`el.getAnimations()`).
  3. Read the ring's computed values in the same task as the `focus()` call.
     They must already be the final values.

### Finding 8: one click on the bin removes an uploaded map

Clicking the bin removes the map with no confirmation (`remove()` and the bin
inside `.vm-find`).
- **Dialog.** Ask first, in the shared `ConfirmDialog` (`export function
  ConfirmDialog` in `apps/web/src/w360/pages/PropertyActions.tsx`). No
  page-local dialog.
- **Wording.** Word it the way other W360 removals already do; check
  RecordPapers, Vault and RecordPhotos.
  - Name the village and say what happens.
  - The way out comes first.
  - Report the exact strings.
- **Cancel** keeps the map and sends no DELETE. Focus goes back to the bin,
  which is ConfirmDialog's contract.
- **Confirm** sends exactly one DELETE.
- **A refused (409) or failed (500) removal**, after confirming, keeps the
  village and says why where it does today, inside the matches box while it is
  open.
- **The matches surface.**
  - A Remove keeps the matches open today. The dialog sits outside the surface,
    so the press-away listener would close the matches on any press in the
    dialog.
  - Keep the matches open while the dialog is up, and after Cancel or a
    refusal, so focus can go back to the bin. After a successful removal, keep
    today's behaviour.
  - Escape in the dialog closes only the dialog. It must not also close the
    matches or run the page's window-level Escape, which clears the selected
    plot.
  - Test all of it.
- **Existing tests.** Update the existing removal tests to confirm in the
  dialog.

### Drift: `--w-ink-1` (verify only)

The palette session has already resolved this: `--w-ink-1` has 0 uses, and
M3-6 reads CSS usages and passes. Re-check both. If both hold, record the
drift as "resolved by another session" in the report, with no change. If
`--w-ink-1` or any other undeclared variable shows up, tell the parent in an
info message and carry on.

### Small additions from the previous review

- **Tests (impl-review finding 3).**
  - Add a `@phone-only` test (WebKit): "tapping the field, then pressing Enter
    on a match, puts focus back in the field".
  - Make the mouse-choice test, "choosing a matching village closes the
    matches and clears the search", run in WebKit too, by tagging it `@phone`
    or copying it.
  - Both cover existing behaviour, so they may pass at once. Label them
    coverage tests, not red tests.
- **Skill wording (previous report, follow-up 5).**
  `.kiro/skills/heuristic-ux-audit/SKILL.md` § Safety (~131-134) says "a
  `sips -Z 2000` copy written under `.local/`". `references/board-format.md` §
  Read back and `references/evidence-capture.md` say `sips -Z 1800` copies, or
  crops of 1800px or less, in the audit folder's `scratch/`.
  - Align SKILL.md with the references by exact-text edit.
  - Then run `python3 scripts/validate-agent-governance.py`.

## Hard constraints (all of them apply)

1. **No git worktree.** Work in the main checkout
   `/Users/reddy.sh/reddy.sh/projects/pattadar-platform`. Sealed runs must
   drive the user's running Vite dev server at `http://localhost:5173`, which
   serves this working tree. Never start or stop a server.
2. **No commits or push.** Never run `git stash`, `checkout -- <file>`,
   `restore`, `reset` or `clean`. Read-only git only.
3. **Other sessions' uncommitted edits.** Keep all of them:
   - `VillageMaps.tsx`: the PageHead migration.
   - `w360.css`: the palette migration, the Home cards and Missing details,
     the Groups row, TabStrip status, the Safeguard chip, `.pf-result.on`,
     and the Tools fence rules.
   - `ui.tsx`: `TabStrip`/`TabPanel`.
   - `17-villages.spec.ts`: one palette line inside `highContrast()`.
   - `docs/specs/2026-08-15-web-360-design.md`: the Home wording.
   - `docs/specs/TODO-one-platform.md`: rows 4, 6, 8, 13 and 17, and § One
     palette.
   - `design.md`, `Shell.tsx` and `theme.ts`: the palette session's. Read only
     in this run.
   - Others, such as Dashboard.tsx.

   Other sessions also commit to `main`.
   - Before the first edit, copy each file you will touch to
     `.local/impl-scratch/cadastral-followup-baseline/<repo path>` and check
     the copy with `cmp`.
   - Re-read a file right before each edit and make small exact-text edits.
     Never overwrite a whole file.
   - At the end, `diff -u` each copy against the current file. Every hunk must
     be ours or explained.
4. **Sealed tests only** (`tests/e2e-app`).
   - Never run `tests/e2e-web360`, the `live` project, `allowEscapes` or
     `sealed: false`, and never use founder data. Never edit
     `tests/e2e-app/fixtures/`.
   - Follow `tests/e2e-app/AUTHORING.md`.
   - The `phone` project runs WebKit and `app` runs Chromium. For focus
     states, use the recipe in
     `.kiro/skills/heuristic-ux-audit/references/evidence-capture.md` §
     Interaction states: `focus()` from a fresh load or after a key press,
     never straight after a click; choose the High Contrast menu item with
     Enter.
   - A red run comes from writing a test before its change. Never revert or
     remove shared code temporarily to manufacture a red run: the dev server
     serves this tree to Reddy and to other sessions' runs.
5. **How to run Playwright.** From `tests/e2e-app` only:
   `APP_WEB_URL=http://localhost:5173 ./node_modules/.bin/playwright test <specs> --project=app --project=phone --reporter=line --output=/Users/reddy.sh/reddy.sh/projects/pattadar-platform/.local/impl-scratch/cadastral-followup-pw-<label>`.
   - Never use `bun run test`.
   - Before each run, check
     `curl -s -o /dev/null -w '%{http_code}' --max-time 3 http://localhost:5173/app`.
     If it doesn't print 200, pause and ask (send_message, severity warning).
6. **Images.** Before opening any image, check its size with
   `sips -g pixelWidth -g pixelHeight`. Never open one with a side over 2000px:
   one oversized image ends the step. Read `sips -Z 1800` copies, or crops of
   1800px or less, written to a `scratch/` folder that you delete afterwards.
7. **No new dependencies and no browser download.**
8. **Governance.**
   - Don't change:
     - design.md, `Shell.tsx` or `theme.ts`;
     - `tests/e2e-app/fixtures/`;
     - frozen copy, or the app vocabulary beyond decision [2];
     - FacetFilter's props or TSX in `ui.tsx` (styles in w360.css are fine).
   - New dialog strings follow the existing removal wording and are reported
     verbatim. Report anything else of that kind as a recommendation.
   - Apply the design-system-governance quality gates: 44px targets, visible
     focus, reduced motion. Say which gates a test proved and which were only
     flagged.
9. **Tools and processes.** CodeGraph is available:
   `codegraph explore "<symbols>"`. Start no background processes.

## Steps

1. **Setup.**
   - Read the previous report and impl-review.json.
   - Recompute the `<FacetFilter` page list.
   - Make the baseline copies.
   - Run a fresh baseline of 03-properties, 05-record-papers,
     06-record-features, 11c-documents-files, 17-villages, 01-shell and
     24-responsive, in app and phone. Record it per test in
     `.agents/tasks/cadastral-maps-followup/before-test-baseline.md`.
   - Other sessions' failures are not ours. Compare test by test.
2. **Red tests.**
   - Write the tests for each change first and confirm each one fails.
   - Write the coverage tests (Small additions), labelled as such.
   - Record the runs in `red-runs.md`.
3. **Implement, then review.** The reviewer is last and its verdict gates the
   loop. The reviewer:
   - runs the specs and guards itself;
   - checks every FacetFilter page at 1512 and 390;
   - checks the ConfirmDialog reuse, its wording and where focus returns;
   - checks the reduced-motion proof in both engines;
   - checks the token-drift verification;
   - checks the diffs against the baseline copies.
4. **Evidence.**
   - Run a temporary sealed capture,
     `tests/e2e-app/specs/zz-ux-audit-w360-cadastral-maps-followup.spec.ts`.
     - Copy what it needs from 17-villages; never import a spec.
     - Delete it afterwards.
     - Run `git status --short --untracked-files=all tests/ | shasum` right
       before and right after.
   - Capture the AFTER state of findings 1, 3, 4, 6 and 8, including the
     dialog.
   - Build `implementation/before-after-final.png` in the audit folder.
     - It shows the original BEFORE (`evidence/`) next to the final state for
       every board finding, 1-9. For 2, 5, 7 and 9, the new capture shows the
       state after both runs.
     - Use a static HTML page, rendered with
       `tests/e2e-app/node_modules/.bin/playwright screenshot`.
     - Add per-finding pairs if one image is unreadable.
     - Read them back only through copies of 1800px or less.
5. **Docs.**
   - `docs/specs/2026-08-15-web-360-design.md` § Cadastral maps. The doc has
     no "§ Village maps"; the previous run's "Updated 03/10/2026" note sits at
     ~421-427. Say there that:
     - the village count is told once;
     - the badge shows only while a village is open;
     - removal asks first.
   - `docs/specs/TODO-one-platform.md`, if it is affected.
   - Exact-text edits only, and no change to design.md.
6. **Verification.** Record each command and its result.
   - `cd apps/web && bun run typecheck`.
   - Every `scripts/*-tests.ts` guard, then `scripts/icon-guard.ts` and
     `scripts/ux-guards.ts`.
   - `bun test apps/web/src`.
   - `bun run --filter @pattadar/web build`.
   - `python3 scripts/validate-agent-governance.py`.
   - Final sealed runs, compared with step 1's baseline.
   - Functional acceptance for removal: cancel, confirm, 409 and 500, each with
     the test that exercised it. Mark anything not run UNVERIFIED.
7. **Cleanup and report.**
   - Delete temporary specs, `--output` folders, scratch files and the baseline
     copies once the report is written. Keep the audit folder and the task
     notes.
   - Write `.agents/tasks/cadastral-maps-followup/report.md`. Include:
     - the decisions;
     - files changed, with their hunks, with the [2] hunks listed by line;
     - a baseline vs after table, and the checks that were run;
     - what was not verified;
     - follow-ups that are report-only;
     - the five change-governance dimensions.
   - The final message starts with the absolute path of
     `before-after-final.png` and of any per-finding pairs, one per line,
     followed by a short summary.
