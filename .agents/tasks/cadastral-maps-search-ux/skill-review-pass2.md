# Interaction states, FacetFilter contract and focus-ring tracing for heuristic-ux-audit

Second review pass over the heuristic-ux-audit edits made after the skill missed Cadastral maps' search problems. The change teaches the audit to judge a page in use: `evidence-capture.md` gains § Interaction states and a per-control states test that records the viewport instrument's page position and the computed focus styles in Dark and High Contrast, and `web-heuristics.md` adds the rules that read that evidence (one text input per task, the FacetFilter contract, no interaction moving an instrument, cascade-traced focus rings, stale sealed-spec labels as drift). SKILL.md gains two pointer lines and an image-size Safety rule, and portfolio.json a third output case anchored at 8c6a2d4. All nine pass-1 findings are resolved; that review is kept as `skill-review-pass1.md`.

Watch for: the template reads the High Contrast ring after two mouse clicks, and Chromium then matches `:focus-visible` on a scripted focus only for text inputs, so any button's High Contrast ring records as `none` (confirmed in the pinned Chromium). SKILL.md step 2 now reads as if the three evidence options were the states (confirmed, minor). eval-traceability.md's unmeasured list leaves out the new image-size rule (confirmed, minor).

**Verdict**: NEEDS_CHANGES

## High-level view

Generality, labels, paraphrase, links, SKILL.md size and the validator pass. The only page-shaped wording is "a map stage", one of three example instruments, and the `ui.tsx` contract is now labelled `audit`, with `WCAG 2.4.6` for the placeholder naming rule. The longest word run the added text shares with any source (design.md, `ui.tsx`, `w360.css`, the harness, AUTHORING.md, the material-web menu and text-field docs, the three W3C Understanding pages) is nine tokens of a URL. The menu, 2.4.6 and 2.4.7 links return 200, under Apache-2.0 (material-web's LICENSE) and the W3C Software and Document License (all three W3C footers). SKILL.md goes from 128 to 134 lines, and `python3 scripts/validate-agent-governance.py` passed with 29 skills, 0 errors and 0 warnings.

The blocking gap is input modality. W360 draws its outline rings, the High Contrast `!important` one included, through `:focus-visible`, and the template switches scheme with two mouse clicks before it calls `focus()`. A popover trigger, chip or list row then records no High Contrast ring while a keyboard user sees 3px, and pass 12 calls an `outline: none` with nothing in its place a finding. Any non-text ring read after a click has the same problem.

The eval case is distinct (the closest of 153 portfolio prompts is the landing output case, at 0.50), and its ten clauses each test a general rule and hold at 8c6a2d4. eval-traceability.md marks all ten covered against line ranges that match the current files, and calls itself a static proxy at the top and bottom. Its unmeasured list says "two rules" and leaves out the SKILL.md image-size rule, which no case exercises either. The working tree's uncommitted edits still change only VillageMaps' page head and unrelated w360.css rules, the claim `red-runs.md` cites from this file.

<details>
<summary>Issues (3)</summary>

1. **High Contrast ring read after mouse clicks** (blocking, confirmed): for any control that is not a text input, the template's mouse-driven scheme switch leaves `:focus-visible` unmatched, so W360's High Contrast ring records as `none`. Press a key (or drive the theme menu from the keyboard) before `field.focus()`, and add to § Interaction states that any ring read after a click needs a key press first.
2. **SKILL.md step 2 colon list** (confirmed, minor): "including every state its § Interaction states lists: the user's screenshot, …" makes the evidence options read as the states. Move the states clause after the options.
3. **Image-size rule missing from the unmeasured list** (confirmed, minor): `SKILL.md:131-134` came in with this edit and has no eval clause, but eval-traceability.md lists only the pass 4 and pass 9 rules. Add it as a third row.

</details>

<details>
<summary>Details</summary>

### High Contrast rings on buttons are read without `:focus-visible`

The template's High Contrast block (`evidence-capture.md:131-141`) reloads, clicks "Change theme", clicks "High Contrast", then calls `field.focus()` and reads the ring. W360's `Menu` moves focus back to its trigger from script when an item is clicked (`ui.tsx:1045`, `:936`), so the last real input before the read is a pointer click. The High Contrast ring is `.w360[data-scheme='highContrast'] :focus-visible { outline: 3px … !important }` (`w360.css:5061`, 4997 at 8c6a2d4). `w360.css` has 41 `:focus-visible` rules; its four plain `:focus` rules only remove outlines from containers such as drawers and dialogs, and its two `:focus-within` rules tint a table row and one search field's border.

A scratch page in tests/e2e-app's pinned Chromium (inline HTML, no app, with a click handler that refocuses the trigger as `Menu` does) shows the split:

```
fresh load, scripted focus on a button                :focus-visible true,  outline solid
after two mouse clicks, scripted focus on a button    :focus-visible false, outline none
after the clicks, scripted focus on a text input      :focus-visible true,  outline solid
after the clicks and a Shift press, on a button       :focus-visible true,  outline solid
theme menu driven by keyboard, then on a button       :focus-visible true,  outline solid
```

The template's own control, a text input, is unaffected, and so is its Dark read, which comes before any click. But § Interaction states asks for the focus file in Dark and High Contrast for every popover trigger and list control (`:198-200`, `:226-231`), and the comment that adapts the template to a popover trigger (`:76-80`) leaves the High Contrast block as it is. On Cadastral maps that control is the `+ Filter` trigger (`ui.tsx:566-574`), which the eval asks to capture in keyboard focus. Its High Contrast ring would record as `none`, which pass 12 (`web-heuristics.md:241-250`) treats as a finding against design.md § Microinteractions stance. The cascade trace would say the `!important` rule wins, and the skill does not say which to believe when trace and recording disagree. Reading an option button's ring after opening the popover by click fails the same way, in Dark too. (confirmed for the mechanism, likely to produce a false finding in the eval)

The table already says to Tab to a button (`:205`), but the template never does it after the clicks. A key press before the read is enough:

```ts
await page.getByRole('menuitemradio', { name: 'High Contrast' }).click();
await expect(page.locator('[data-scheme="highContrast"]')).toHaveCount(1);
// After a click, Chromium matches :focus-visible on a scripted focus only for a
// text input. A key press first makes the read match what a keyboard user sees.
await page.keyboard.press('Shift');
await field.focus();
```

The § Interaction states focus bullet should carry the same rule for any ring read after a click, so adapted tests for popover triggers and list rows get it too.

### SKILL.md step 2 and the unlisted image-size rule

Step 2 now says to get the current state by `references/evidence-capture.md`, "including every state its § Interaction states lists: the user's screenshot, a temporary sealed capture, or the source alone" (`SKILL.md:45-47`). The colon list used to name the three evidence options and now follows "every state … lists", so it reads as the states. Putting the states clause after the options fixes it. (confirmed)

The Safety rule at `SKILL.md:131-134` (never read back an image with a side over 2000 px; read a `sips -Z 2000` copy) came in with the same edit, and no output case has a clause for it. eval-traceability.md's "Rules no output case exercises" (`:50-58`) says "Two rules added in this task" and lists only the pass 4 and pass 9 rules. (confirmed) The pass 9 capped-list rule could be measured in this case instead of listed: at 8c6a2d4 the in-flow village results are capped at 16rem with `overflow-y: auto` (`VillageMaps.tsx:975-976`, `w360.css:4250-4252`).

</details>

<details>
<summary>File map</summary>

- `.kiro/skills/heuristic-ux-audit/SKILL.md`: step 2 points at § Interaction states; step 3's inventory adds text inputs and popover options; Safety adds the 2000 px read-back rule.
- `.kiro/skills/heuristic-ux-audit/references/web-heuristics.md`: `WCAG <SC number>` label; passes 1, 4, 8, 9 and 12 gain input, quantity, FacetFilter, state-shift, anchored-surface, capped-list and focus-ring rules; Nielsen table; sealed-spec drift and states-not-verified evidence rules; control and filter-group removal as Reddy's decision; menus, 2.4.6 and 2.4.7 sources; licence name; checked date.
- `.kiro/skills/heuristic-ux-audit/references/evidence-capture.md`: public describe with the `OUT` guard; per-control states-test template writing page position and rings after every state; new § Interaction states.
- `.kiro/skills/heuristic-ux-audit/references/board-format.md`: label set.
- `.kiro/skill-evals/portfolio.json`: third heuristic-ux-audit output case (Cadastral maps at 8c6a2d4).
- `.agents/tasks/cadastral-maps-search-ux/eval-traceability.md`, `red-runs.md`: red and after static-proxy tables, unmeasured rules, template check; serving 8c6a2d4 for clauses 1 and 6.

Full diff: `diff -u .local/impl-scratch/cadastral-search-baseline/<path> <path>` for each skill file above.

</details>
