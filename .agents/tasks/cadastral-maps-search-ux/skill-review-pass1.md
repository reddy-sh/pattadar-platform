# Interaction states, FacetFilter contract and focus-ring tracing for heuristic-ux-audit

The change teaches heuristic-ux-audit to judge a page in use, not only at rest. `evidence-capture.md` gains § Interaction states and a sealed-spec template that drives six states per text input and popover, writing the viewport instrument's box in each state (the shift file) and the computed focus styles in Dark and High Contrast. `web-heuristics.md` adds rules that consume that evidence: one text input per task, the full `FacetFilter` contract, no interaction moving a viewport instrument, cascade-traced focus rings with a WCAG 2.4.7 caveat, and stale sealed-spec labels as drift. SKILL.md grows by two lines that point into the references, the label set widens from `WCAG 2.2.2` to `WCAG <SC number>`, and a third output case anchored at 8c6a2d4 exercises the rules on Cadastral maps.

Watch for: the shift file stores viewport-relative boxes, so a scroll caused by `focus()`, `fill()` or `click()` reads as the instrument moving (likely). Evidence names carry no control, so repeating the template for a second control overwrites the first (likely). Both JSON files are written only after the last step, so any failing step discards every measurement (confirmed).

**Verdict**: NEEDS_CHANGES

## High-level view

Generality, labels, paraphrase, links, SKILL.md size and the validator all pass. The new rules are written against `FacetFilter`, which nine W360 pages compose, or against generic controls, and "a map stage" appears only as one of three example instruments. Both new links return 200 and sit under the right owner (material-web's Apache-2.0 mirrors, W3C). The longest word run the added text shares with any source is nine tokens of a URL, and `python3 scripts/validate-agent-governance.py` passed (29 skills, 0 errors, 0 warnings).

The shift file is the weak point. `boundingBox()` is relative to the viewport and moves with scroll, and Playwright's focus, fill and click bring their target into view, so pass 9's "a box that changes between states is a finding" can report a scroll as a layout shift. The High Contrast state, taken after a fresh load in another scheme, lands in the same comparison.

The template can lose or misattribute evidence. Screenshot and JSON names have page, state and project but no control, while the template and § Interaction states both say to repeat the steps per control. The JSON is written only after the High Contrast step, and that step cannot run on public pages because the theme menu exists only in the signed-in shells.

The FacetFilter rules are grounded in design.md § App-surface rules and in `ui.tsx`, but the `searchPlaceholder` naming rule exists only in `ui.tsx` and still carries the design.md label. The Proposal rules were not updated to make removing a filter group Reddy's decision, which leaves the ambiguity the red table itself recorded.

Tracing specificity before source order, with the High Contrast `!important` block on top, is the right method: it is what separates the two search fields on the anchored revision. The Sources entry still names the W3C Document License, which the WCAG 2.4.7 page no longer uses.

The eval case is distinct, its ten clauses each test a general rule, and its expected findings hold at 8c6a2d4. eval-traceability.md marks all ten covered, its cited ranges match the current files, and it calls itself a static proxy twice. Its capture clauses will need a server running 8c6a2d4 once Task 6 lands, and two of the new rules have no clause at all.

<details>
<summary>Issues (9)</summary>

1. **Shift file is viewport-relative** (blocking, likely): `boundingBox()` moves with scroll, and focus, fill and click scroll their target into view, so pass 9 can report a scroll as a shift. Record the scroll with each box, compare page coordinates against `resting` from the same load and scheme, and keep the High Contrast state out of the comparison.
2. **Evidence names have no control slot** (blocking, likely): repeating the states test for a second control overwrites the first control's PNGs and JSON. Add `<control>` to every evidence name and key both JSON objects by control.
3. **JSON written only after the last step** (blocking, confirmed): any failing step discards every box and ring already measured, against the skill's own "for that state" fallback. Write the JSON inside `capture()` or a `finally`.
4. **High Contrast step assumes a signed-in shell** (confirmed): the theme menu exists only in `Shell.tsx` and the legacy `AppShell.tsx`, so on auth and marketing pages the step times out. Mark it app-only and list High Contrast as not applicable elsewhere, scope `signedIn: false` to the landing test, and copy the `OUT` guard into the states test.
5. **`searchPlaceholder` rule carries a design.md label** (likely): no design.md sentence backs it. Keep `design.md § App-surface rules` for what `design.md:527-531` states, and label the `ui.tsx`-derived rules `audit` with the `ui.tsx:line` cite, or `WCAG 2.4.6` for the naming rule.
6. **Proposal rules still read group removal as within authority** (confirmed): pass 8 says Reddy's decision, step 6's classification list does not. Add "removes or moves a control or a filter group" to the Reddy's decision bullet (`web-heuristics.md:306-310`).
7. **Stale W3C license name** (confirmed): replace "(W3C Document License)" with "(W3C Software and Document License)", the license the 2.4.7 page's footer links.
8. **Eval capture clauses need 8c6a2d4 served** (likely): record in `red-runs.md` that clauses 1 and 6 need a server running 8c6a2d4 once Task 6 lands, or that source-only evidence is accepted for them.
9. **Two new rules have no eval clause** (confirmed): add a clause for pass 4's same-quantity rule and pass 9's capped-list rule, or list both in eval-traceability.md as unmeasured.

</details>

<details>
<summary>Details</summary>

### The shift file measures the viewport, not the layout

The template records `shift[state] = await stage.boundingBox()` (`evidence-capture.md:81`), and pass 9 makes any difference between states a finding (`web-heuristics.md:191-192`). The pinned Playwright 1.62 typings say the box is calculated relative to the main frame viewport and that scrolling affects it (`playwright-core/types/types.d.ts:12450-12452`). Click's actionability scrolls the element into view first (`types.d.ts:2127`), and `focus()` and `fill()` focus the element, which also scrolls it into view. Any state whose target sits below the fold moves the stage's `y` by the scroll distance with no layout change: a popover option on the 390 project, a list page's filter bar, an auth form. The auditor then reports a shift that is not there, or gets the size of a real one wrong. Choosing a district on Cadastral maps adds a chip row that can wrap at 390 while the click may also scroll. (confirmed for the method, likely as false findings in practice)

The `focused-highcontrast` entry comes from a second `goto` and a scheme switch (`evidence-capture.md:116-122`), so it is not an interaction state of the first load. It still sits in the object the rule compares.

```ts
const capture = async (state: string) => {
  const box = await stage.boundingBox();
  const scroll = await page.evaluate(() => ({ x: window.scrollX, y: window.scrollY }));
  // Page coordinates: a scroll moves the box in the viewport, not in the layout.
  shift[state] = box && { ...box, pageX: box.x + scroll.x, pageY: box.y + scroll.y, scroll };
  // …screenshot as before
};
```

With that, pass 9 should compare `pageX`, `pageY`, `width` and `height` of each interaction state against `resting` from the same load and scheme, and leave the High Contrast state out of the comparison.

### Interaction evidence can be overwritten or never written

Every evidence name in § Interaction states is `<page>-<state>-<project>` (`evidence-capture.md:198-209`, template `:82` and `:123-124`). The template's header says it covers one text input and one popover and asks for the steps to be repeated for every control (`:73-74`), and § Interaction states says the test drives one control and should be repeated for each (`:195`). The eval needs at least two controls: the village search, and the Filter's own search, whose focus state is the popover's `autoFocus`. A second run writes the same PNG and JSON names, so the first control's evidence is silently replaced, and the surviving focus JSON can be read as belonging to the wrong control. (likely)

Both JSON files are written in the template's last two lines (`:123-124`). Any failed step throws before them and loses every box and ring measured so far: a no-match sentence that differs from the placeholder, an option below the fold, or the High Contrast switch. The skill's own failure rule falls back to source only "for that state" (`:132`). (confirmed)

The High Contrast step is unconditional, but the theme menu exists only in the signed-in shells (`apps/web/src/w360/Shell.tsx:589`, `apps/web/src/layout/AppShell.tsx:132`), and design.md § Theme choice and persistence keeps marketing dark (`design.md:108-117`). On an auth frame, which is in scope and is mostly text inputs, the step times out, and with the end-only write it takes the shift and Dark focus data with it. The file-level `test.use({ signedIn: false })` (`:59`) applies to the states test too. That is right for public pages and wrong for `/app/*` unless the author removes it, as the landing comment says. The states test also lacks the landing test's `expect(OUT, …)` guard (`:62`), so an unset `UX_AUDIT_EVIDENCE` points every evidence path at `/`. (confirmed)

The fix is to add a `<control>` slot to every evidence name and key both JSON objects by control, and to write the JSON inside `capture()` or a `finally`. Mark the High Contrast step as app pages only, listing High Contrast as not applicable elsewhere. Scope `signedIn: false` to a `describe` around the landing test, and copy the `OUT` guard.

### FacetFilter contract: two sources, one label

Pass 8's filter paragraph (`web-heuristics.md:163-174`) draws on two sources. design.md § App-surface rules (`design.md:527-531`) gives checkbox facet groups, removable active chips, pages that supply only groups and values, and no page-owned select bars, filter drawers, search-as-filter layouts or dismissal behaviour. The component's markup and comments give the rest: options are `aria-pressed` toggles whose state and chips come only from `selected` (`ui.tsx:511-528`, `:613-617`), and `searchPlaceholder` is both the placeholder and the accessible name of a search that filters option labels across groups (`ui.tsx:500-502`, `:599`).

The paragraph has the whole contract labelled `design.md § App-surface rules`, but no design.md sentence says that `searchPlaceholder` names only what its search matches. That rule comes from the `ui.tsx` comment and markup, and the property it protects, a label that describes its control's purpose, is WCAG 2.4.6 territory. The precedence list (`web-heuristics.md:7-17`) has no slot for a code contract, and the evidence rules call comments claims, not evidence (`:278`). The parts design.md states should keep the design.md label, and the rest should be labelled `audit` citing `ui.tsx:line`, or `WCAG 2.4.6` for the naming rule. (likely)

Pass 8 now makes removing a group, or moving what it does to another control, Reddy's decision (`:173-174`). The Proposal rules that step 6 applies are unchanged (`:303-310`). "Within authority" still covers any change that needs no change to frozen copy, the vocabulary or a design.md rule, and the Reddy list names sections, not controls or groups. That is the ambiguity eval-traceability.md's red row 8 recorded, now resolved in pass 8 only. Adding "removes or moves a control or a filter group" to the Reddy bullet closes it. (confirmed)

### Cascade tracing and the WCAG 2.4.7 source

The order "specificity, then source order" in pass 12 (`web-heuristics.md:234-237`) matters on the anchored revision. The Filter's `.w360 .fpop-head input:focus-visible { outline: 0 }` sits earlier in `w360.css` (line 1998) than the generic `.w360 input:focus-visible` ring (line 2728) but wins on specificity, while the pill's `outline: none` (215-222) loses to the same generic rule on source order. Source order alone would get one of the two wrong.

The Sources entry gives "(W3C Document License)" for both Understanding pages (`web-heuristics.md:337-341`). The 2.4.7 page's footer says permissive license rules apply and links `https://www.w3.org/copyright/software-license/`, the W3C Software and Document License. (confirmed)

### Eval case 3 and its traceability

The new prompt is distinct. Its closest neighbour among all positive, negative, output-case and collision prompts is the landing output case at 0.50 similarity, which shares only "against design.md's Material 3 principles". Its expected findings hold at 8c6a2d4. The committed `VillageMaps.tsx` passes a `village` group that `selected` never covers (lines 417 and 947-950) and a second village search in `trailing` (956-967). The committed spec still asks for 'Search districts or mandals' (`17-villages.spec.ts:610`) while the code renders 'Search districts, mandals or villages' (955). The focus rules above and the High Contrast `!important` block (line 4997) are committed. The uncommitted edits that predate the task change only the page head and unrelated rules.

The sealed capture drives whatever the founder's dev server serves, but the case is anchored to a revision. Once Task 6 lands, clauses 1 and 6 ("captured", "measured") can only be met by a runner serving 8c6a2d4, and `red-runs.md` should say so. (likely) The pass 4 rule (two figures for one quantity) and pass 9's capped-list rule have no clause in any case, so the static proxy says nothing about them. (confirmed)

</details>

<details>
<summary>File map</summary>

- `.kiro/skills/heuristic-ux-audit/SKILL.md`: step 2 points at § Interaction states; step 3's inventory adds text inputs and popover options.
- `.kiro/skills/heuristic-ux-audit/references/web-heuristics.md`: `WCAG <SC number>` label; passes 1, 4, 8, 9 and 12 gain input, quantity, FacetFilter, state-shift and focus-ring rules; Nielsen table; sealed-spec drift and states-not-verified evidence rules; menus and 2.4.7 sources; checked date.
- `.kiro/skills/heuristic-ux-audit/references/evidence-capture.md`: states-test template; new § Interaction states.
- `.kiro/skills/heuristic-ux-audit/references/board-format.md`: label set.
- `.kiro/skill-evals/portfolio.json`: third heuristic-ux-audit output case (Cadastral maps at 8c6a2d4).
- `.agents/tasks/cadastral-maps-search-ux/eval-traceability.md`: red and after static-proxy tables.

Full diff: `diff -u .local/impl-scratch/cadastral-search-baseline/<path> <path>` for each file above.

</details>
