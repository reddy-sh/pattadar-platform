# eval-traceability

Eval case: `.kiro/skill-evals/portfolio.json`, `heuristic-ux-audit` output case 3
("Audit the W360 Cadastral maps screen …"), anchored to revision 8c6a2d4.

This is a static proxy only. It maps each expected clause to the skill line
that would make an agent do it; it is not a run of the eval, and no agent
output was graded.

## Red: the skill before the edits (02/10/2026)

Line numbers are the files as they stood before Tasks 2 and 3. `SKILL.md` is
`.kiro/skills/heuristic-ux-audit/SKILL.md`; the others are under its
`references/`.

| # | Expected clause | Current line(s) | Status |
|---|---|---|---|
| 1 | Interaction states (resting, keyboard focus, typed with matches, typed with no match, popover open, an item chosen) captured or each listed by name as not verified | `SKILL.md:44-47` (step 2 names the three evidence options, no states); `evidence-capture.md:10-12` (a render adds fold, wrapping, phone width), `:82-86` (loading, empty, failed through the world), `:88-90` (only `-top` and `-full` shots); `web-heuristics.md:242-243` (not verified: loading, error, empty, phone) | partial: data states and widths only; no interaction state is named, driven or listed |
| 2 | Text inputs counted per task; two village searches over one population is a finding | `SKILL.md:48-51` (inventory counts controls by where they lead, not inputs or what they search); `web-heuristics.md:47-49`, `:55-56` (pass 1 counts controls by destination, one label per destination) | missing |
| 3 | Judged against design.md § App-surface rules and the FacetFilter contract (Village options open rather than narrow, never show as selected) | `web-heuristics.md:150-152` (pass 8: § App-surface rules makes `FacetFilter` the one filter) | partial: names the component only; not the rest of the filter rule (search-as-filter, dismissal) nor the contract for `groups`, `selected`, `trailing`, `searchPlaceholder` |
| 4 | Cascade trace in Dark and High Contrast: pill's ring on the inner input, Filter search with none of its own, against design.md § Microinteractions stance | `web-heuristics.md:199-202` (pass 12: visible focus, 2px ring, 3px in High Contrast), `:203-205` (flag only), `:186-187` (pass 11: focus visible instantly) | partial: states the ring rule, but gives no method for finding which rule draws a ring, on which element, in each scheme |
| 5 | WCAG 2.4.7 risk flagged only where no other indicator shows | `web-heuristics.md:14` (labels allow only `WCAG 2.2.2`), `:138` (flag WCAG risks only, pass 7); `board-format.md:116-117` (labels: `WCAG 2.2.2`) | missing |
| 6 | The map's position measured in each state; in-flow results move it | `web-heuristics.md:157-159` (pass 9: dead space under a viewport instrument), `:163-164` (instruments reach the window bottom) | missing: nothing measures the instrument across states or forbids an interaction from moving it |
| 7 | Sealed spec's stale 'Search districts or mandals' label reported as drift | `SKILL.md:55-56` (drift: design.md, a spec or a code comment against the code); `web-heuristics.md:235-236` (a comment or design.md sentence against the code) | partial: "spec" means `docs/specs/`; a sealed test spec's labels are not named |
| 8 | Removing the Village group classed as Reddy's decision | `SKILL.md:63-64` (dropping or merging content is Reddy's decision); `web-heuristics.md:259-263` (Reddy's decision: drops or moves a section) | partial: no rule names removing a filter group, and `web-heuristics.md:256-258` (within authority) can be read to fit too |
| 9 | Reply opens with the images, per the Output section | `SKILL.md:73-99` (Output: images first, `compare.png` then `board.png`) | covered (the other session's Output edits) |
| 10 | No product edits | `SKILL.md:117-118` (Safety: analysis only) | covered |

## After Tasks 2 and 3 (02/10/2026)

Line numbers are the files as they stand after the edits and the fixes for
`skill-review-pass1.json` findings 1-9 and `skill-review.json` findings 1-3.

| # | Expected clause | Covering line(s) | Status |
|---|---|---|---|
| 1 | Interaction states captured or each listed by name as not verified | `SKILL.md:44-48` (step 2 gets every state § Interaction states lists); `evidence-capture.md:198-256` (§ Interaction states: the six states and how the sealed spec drives each, one test per control from its own load, `<page>-<control>-<state>-<project>` names, High Contrast on W360 only, not verified by name), `:76-144` (template states test, `OUT` guard at `:82`), `:58-74` (signed out only inside the public describe); `web-heuristics.md:295-298` (each state captured or listed by name; High Contrast off W360 not applicable) | covered |
| 2 | Text inputs counted per task; two village searches over one population is a finding | `SKILL.md:49-51` (inventory: text inputs and what each one searches); `web-heuristics.md:50-51` (pass 1 counts inputs, population, how each matches), `:57-60` (one text input per task; two over one population is a finding; cite § App-surface rules inside a `FacetFilter`) | covered |
| 3 | design.md § App-surface rules and the FacetFilter contract (Village options open rather than narrow, never show as selected) | `SKILL.md:50-51` (popover options by what they do: narrow, open or navigate); `web-heuristics.md:153-155` (pass 8 reads `groups`, `selected`, `trailing`, `searchPlaceholder`), `:163-167` (design.md § App-surface rules in full: no search-as-filter layout or dismissal of the page's own; checkbox facets narrow and never open or navigate), `:168-175` (the rest from `ui.tsx`, labelled `audit` with `ui.tsx:line`: `selected` covers every group; no second search in `trailing`; `searchPlaceholder` names only what it matches, `WCAG 2.4.6`) | covered |
| 4 | Cascade trace in Dark and High Contrast: pill's ring on the inner input, Filter search with none of its own, against design.md § Microinteractions stance | `web-heuristics.md:235-236` (count the rule drawing each ring per scheme), `:241-250` (specificity, then source order, and the High Contrast `!important` block; the ring follows the visible control, a pill's ring is the pill; M3 text fields; `outline: 0` with nothing in its place is a finding against § Microinteractions stance); `evidence-capture.md:228-233` (record `outline-*` of element and container in Dark and High Contrast), `:234-241` (read every ring as a keyboard user meets it: after clicks, press a key before reading the ring of anything but a text input, so the `+ Filter` trigger's High Contrast ring is not recorded as none; a modifier alone does not count in WebKit), `:244-253` (switching through the Change theme menu with Enter on the item, W360 only), `:104-110`, `:117-120`, `:131-143` (template; Enter on the High Contrast item at `:137-139`) | covered |
| 5 | WCAG 2.4.7 risk flagged only where no other indicator shows | `web-heuristics.md:250-252` (flag only where no other indicator shows; the text-field caret counts), `:14` (`WCAG <SC number>` label), `:345-350` (W3C Understanding 2.4.7 source, W3C Software and Document License); `board-format.md:117` (same label) | covered |
| 6 | The map's position measured in each state; in-flow results move it | `evidence-capture.md:221-227` (shift file per control: viewport box, ancestors' summed scroll, page position), `:89-103` (template records the page position and rewrites both JSON files in every state); `web-heuristics.md:184-186` (pass 9 counts page position and size per state), `:194-199` (compare each state with `resting` from the same load and scheme by page position and size, so a scroll is not a move; High Contrast not compared), `:199-201` (matches open on an anchored temporary surface, M3 menus) | covered |
| 7 | Sealed spec's stale 'Search districts or mandals' label reported as drift | `web-heuristics.md:287-289` (a sealed spec naming a label, selector or count the code no longer renders is drift; cite both lines) | covered |
| 8 | Removing the Village group classed as Reddy's decision | `web-heuristics.md:176-177` (pass 8: removing a filter group, or moving what it does to another control, is Reddy's decision), `:314-318` (Proposal rules: removes or moves a control or a filter group); `SKILL.md:63-67` (step 6: dropping content is Reddy's decision) | covered |
| 9 | Reply opens with the images, per the Output section | `SKILL.md:75-101` (Output, unchanged by this task) | covered |
| 10 | No product edits | `SKILL.md:119-120` (Safety, unchanged by this task) | covered |

Clauses 1 and 6 also need a server rendering 8c6a2d4 to be met as captured
and measured; see `red-runs.md`.

## Rules no output case exercises

Three rules added in this task have no clause in any heuristic-ux-audit output
case, so this proxy says nothing about them.

| Rule | Line(s) | Status |
|---|---|---|
| Pass 4: two figures for the same quantity read one source or are shown to agree | `web-heuristics.md:96-97`, `:102-104` | unmeasured |
| Pass 9: a list capped in height shows that it scrolls | `web-heuristics.md:186`, `:201-203` | unmeasured |
| Safety: never read back an image with a side over 2000 px; read a `sips -Z 2000` copy under `.local/` | `SKILL.md:131-134` | unmeasured |

## Template check (02/10/2026)

The template's code ran once, sealed, from `tests/e2e-app` against :5173
(`app` and `phone`, `--reporter=line`, `--output` under
`.local/impl-scratch/`), with the spec kept outside `tests/`. It was filled in
for the W360 jump search on `/app`, with `main` standing in for the instrument
and a forced 300px window scroll. All 6 tests passed:

- the viewport `y` moved by 300 while `pageX` and `pageY` held;
- `focused-highcontrast` stayed out of the shift file, and the focus file held
  Dark and High Contrast rings for the input and its pill, keyed by control;
- a test failing at its second step had already written its `resting` entry;
- the landing capture ran signed out inside its describe.

Strict `tsc` (TypeScript 7.0.2, the e2e-app tsconfig with bundler resolution)
found no error in the filled-in template; its 24 errors are all in
`fixtures/seed.ts` and `fixtures/world.ts`. Not exercised: the typed, chosen
and popover steps. The check's files were deleted afterwards, and the
`tests/` status hash was unchanged.

## High Contrast re-check (02/10/2026, `skill-review.json` finding 1)

Run the same way, sealed, with the shell's Assistant icon button standing in
for a non-text control and the jump search for a text input. The `phone`
project runs WebKit, because its iPhone 14 descriptor sets
`defaultBrowserType: 'webkit'`; `app` runs Chromium.

| Before the scripted `focus()` | Chromium (`app`) | WebKit (`phone`) |
|---|---|---|
| fresh load, button | `:focus-visible` true, solid | true, solid |
| two clicks to High Contrast, button | false, outline none | false, none |
| two clicks, text input | true, 3px solid | true, 3px solid |
| two clicks, then Shift, button | true, 3px solid | false, none |
| two clicks, then Tab, button | true, 3px solid | true, 3px solid |
| a click, then Enter on the High Contrast item, button | true, 3px solid | true, 3px solid |

So the review's Shift press fixes Chromium only, and the template now chooses
the item with Enter. The table is from a first run on `/app`, which read these
values and then failed the harness's console guard: Home asks for
`auditTrail`, which the sealed world cannot route (a 400). That is outside
this task and is reported, not fixed. A second run on `/app/properties`, with
the template's High Contrast block copied verbatim, read a 3px solid ring on
the button and on the text input in both projects, and an option in the theme
menu opened by click read none on a scripted focus and a solid ring after
ArrowDown in both; all 6 tests passed. The check's files were deleted
afterwards. The `tests/` status hash differed between its two reads only
because another session removed its own untracked
`zz-home-final-measure.spec.ts`.

Static proxy only: "covered" means the skill text now tells an agent to do
each clause. Whether an agent actually does it is not measured until the case
is run with and without the skill (`red-runs.md`).
