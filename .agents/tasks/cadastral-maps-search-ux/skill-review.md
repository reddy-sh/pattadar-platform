# Interaction states, FacetFilter contract and focus-ring tracing for heuristic-ux-audit

Third review pass over the heuristic-ux-audit edits made after the skill missed Cadastral maps' search problems. The change teaches the audit to judge a page in use: `evidence-capture.md` gains § Interaction states and a per-control states test that records the viewport instrument's page position and the focus styles in Dark and High Contrast, and `web-heuristics.md` adds the rules that read that evidence (one text input per task, the FacetFilter contract, no interaction moving an instrument, cascade-traced focus rings, stale sealed-spec labels as drift). Since pass 2, the template chooses the High Contrast item with Enter, § Interaction states adds a rule for reading every ring as a keyboard user meets it in both engines, SKILL.md step 2 puts the evidence options in parentheses, and eval-traceability.md lists the image-size rule as unmeasured. All three pass-2 findings are resolved; pass 1 and pass 2 are kept as `skill-review-pass1.md` and `skill-review-pass2.md`.

Watch for: the states table tells a button's keyboard-focus state to `press('Tab')`, which reads as the locator call its `focus()` and `fill()` neighbours are, and that call tabs off the button so `toBeFocused()` fails (likely, minor). The template's typed, chosen and popover steps have still never run, so the eval run is their first exercise (confirmed, disclosed by the coder).

**Verdict**: APPROVED

## High-level view

Generality, labels, paraphrase, links, SKILL.md size and the validator pass. The added text names no Cadastral maps control: "a map stage" is one of three example instruments (`evidence-capture.md:85`, `:221`), and the new modality rule covers every `:focus-visible` ring in `w360.css` and `site.css`. The longest word run the added text shares with any source (design.md, `ui.tsx`, `w360.css`, the harness, AUTHORING.md, the material-web menu and text-field docs, the three W3C Understanding pages) is nine tokens of a URL. The menu, 2.4.6 and 2.4.7 links return 200 and carry the wording passes 9 and 12 attribute to them (the menu's temporary surface and anchor, 2.4.7's text-field insertion bar), under Apache 2.0 (material-web's LICENSE) and the W3C Software and Document License (the page each W3C footer links). SKILL.md goes from 128 to 134 lines, and `python3 scripts/validate-agent-governance.py` passed with 29 skills, 0 errors and 0 warnings.

The pass-2 blocking gap is closed. The template presses Enter on the High Contrast item (`evidence-capture.md:137-139`), and § Interaction states makes the last input a key before any non-text ring is read after clicks (`:234-241`). It uses Enter rather than pass 2's Shift press because the `phone` project runs WebKit (`devices['iPhone 14']`), which in the coder's re-check did not count a modifier alone. Those engine results come from the coder's sealed run on `/app/properties` and were not re-run here.

The states table's keyboard-focus row for a button (`evidence-capture.md:207`) reads as `locator.press('Tab')`, which tabs off the button, so that control's test fails at `toBeFocused()` and loses its later states. A scripted `focus()` from a fresh load or after a key press is the recipe the coder's own re-check shows holding in both engines.

The eval case is distinct (the closest of 153 portfolio prompts is the landing output case, at 0.52 by sequence ratio), and its ten clauses each test a general rule and hold at 8c6a2d4. They also hold in the working tree, whose uncommitted edits leave the search, the Filter, every `:focus*` rule and the High Contrast block as they are at 8c6a2d4 and keep the stale label at `17-villages.spec.ts:610`; `red-runs.md` cites this file for that. eval-traceability.md marks all ten clauses covered against line ranges that match the current files, calls itself a static proxy at the top and bottom, and lists three unmeasured rules, the image-size rule now among them. Not exercised: the template's typed, chosen and popover steps.

<details>
<summary>Issues (1)</summary>

1. **Keyboard-focus row reads as `locator.press('Tab')`** (minor, likely): `evidence-capture.md:207` tells a button to `press('Tab')`, and the locator call that reads like focuses the button and tabs off it, so `toBeFocused()` fails and the control's later states are lost. Reword the row to `focus()` the control from a fresh load or after a key press, never straight after a click.

</details>

<details>
<summary>Details</summary>

### A button's keyboard focus by `press('Tab')`

The states table's keyboard-focus row reads "`focus()` on a text input or `press('Tab')` to a button, then `toBeFocused()`" (`evidence-capture.md:207`). Its neighbours, `focus()` and `fill()`, are calls on the control, so the row reads as `trigger.press('Tab')`. Playwright 1.62's `locator.press` focuses the matching element and then presses the key (`playwright-core/types/types.d.ts:15990`), so that call focuses the button, moves focus to the next control, and `toBeFocused()` on the button fails. The step fails rather than recording a false ring, but it ends that control's test there, so its later states (popover open, an item chosen, High Contrast) are lost until the spec is fixed and re-run. The eval asks for exactly such a control in keyboard focus: the `+ Filter` trigger is a plain `<button>` (`ui.tsx:568-574`). (likely)

The coder's re-check already gives a recipe that holds in both engines: a scripted `focus()` on a button matches `:focus-visible` on a fresh load and after a key press, and reads none only straight after a click (eval-traceability.md, High Contrast re-check, rows 1, 5 and 6).

```
| keyboard focus | `focus()` on the control, from a fresh load or after a key press, never straight after a click, then `toBeFocused()` |
```

</details>

<details>
<summary>File map</summary>

- `.kiro/skills/heuristic-ux-audit/SKILL.md`: step 2 points at § Interaction states, with the three evidence options in parentheses; step 3's inventory adds text inputs and popover options; Safety adds the 2000 px read-back rule.
- `.kiro/skills/heuristic-ux-audit/references/web-heuristics.md`: `WCAG <SC number>` label; passes 1, 4, 8, 9 and 12 gain input, quantity, FacetFilter, state-shift, anchored-surface, capped-list and focus-ring rules; Nielsen table; sealed-spec drift and states-not-verified evidence rules; control and filter-group removal as Reddy's decision; menus, 2.4.6 and 2.4.7 sources; licence name; checked date.
- `.kiro/skills/heuristic-ux-audit/references/evidence-capture.md`: public describe with the `OUT` guard; per-control states-test template that writes page position and rings after every state and chooses High Contrast with Enter; new § Interaction states with the keyboard-modality rule.
- `.kiro/skills/heuristic-ux-audit/references/board-format.md`: label set.
- `.kiro/skill-evals/portfolio.json`: third heuristic-ux-audit output case (Cadastral maps at 8c6a2d4).
- `.agents/tasks/cadastral-maps-search-ux/eval-traceability.md`, `red-runs.md`: red and after static-proxy tables, three unmeasured rules, template check and High Contrast re-check; serving 8c6a2d4 for clauses 1 and 6.

Full diff: `diff -u .local/impl-scratch/cadastral-search-baseline/<path> <path>` for each skill file above.

</details>
