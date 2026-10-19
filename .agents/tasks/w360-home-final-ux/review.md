# W360 Home: Missing details folded into For you, an Overview keyed to its own width, and a compact Recently opened

Home's separate Missing details card is now one summary row at the foot of For you, and For you's count and its "You're all caught up" line cover orders, reminders and properties with gaps together. Row actions are text buttons named for their rows, the Overview is two or four even tracks with "—" for an unvalued estimate, and Recently opened uses a compact tile with an inline kind icon. This second pass answers the first review: four Overview tracks now need both an 840px window and a 48rem section (a container query on `.ov-sec`), the figure never wraps, three recent tiles fill their row, and the kind icon uses full-strength tokens. Each fix is pinned by a test that the retained mutation log shows failing against the old rule, and the 02-dashboard gate holds with zero new failures.

Watch for: on phones narrower than about 345px, which includes WCAG's 320px reflow width, the nowrap figure has 86px in a two-by-two card. An estimate of ₹10 Cr or more then crosses its card's border, and one of ₹100 Cr or more pushes the page about 3px sideways (likely). The two-by-two phone rows also bring the existing `.ovcard` stretch to the 390px screen, and dedup by property is still Reddy's call. None of these blocks the change.

**Verdict**: APPROVED

## High-level view

For you is unchanged since the first pass. It holds the orders back for review, the reminders and one Missing details summary row, and its count covers all three. It says "You're all caught up" only when all three are zero and both the orders and the property list have answered. Tests 963, 986, 1014, 1032, 1048 and 1285 pin this, and the first pass's mutation log shows the pending-read tests fail when the gate is weakened.

D3 is resolved with existing copy. The No documents fix reads "Open record", Home's word for `/app/records/:id`, so inside For you "Open Documents" leads only to `/app/papers`; test 1148 draws both rows side by side. implementation.md reports the departure from the board's "Open documents". D2 still dedups by property rather than by gap, which stays open for Reddy. D5 reuses the existing "Show all" / "Hide" with `aria-expanded` and `aria-controls`.

The Overview's four tracks now follow the section, not the window: they need an 840px window and a 48rem `.ov-sec`, and `.ov-value` never wraps. That removes the 901–1000px split, at the documented cost of two by two for 901–1087px windows with the rail open, and test 559 sweeps 390–1512px with ₹12.40 Cr and ₹123.45 Cr. Below 390, which the sweep does not reach, the nowrap figure outgrows a two-by-two card, and the two-by-two phone rows show the `.ovcard` stretch. The unvalued estimate reads "—" (aria-hidden) followed by a `.sr-only` "not set", and the header comment matches the code.

<details>
<summary>Issues (3)</summary>

1. **Overview figure outgrows a two-by-two card on narrow phones** (non-blocking, likely). At 320px the nowrap `.ov-value` (w360.css:593) has 86px in the two-track grid (w360.css:576). So ₹10 Cr or more crosses the card's border, and ₹100 Cr or more scrolls the page about 3px. Add a one-column (or smaller-figure) rule below about 20rem of Overview width, and start test 559's sweep (02-dashboard.spec.ts:575) at 320 and 360.
2. **Overview figures misaligned in two-by-two rows** (non-blocking, likely; already true at 1512). `.ovcard` (w360.css:583) stretches its label and value rows, so on the 390px phone the Documents figure sits lower than the Properties figure. Add `align-content: start` to `.ovcard`.
3. **Dedup by property, not by gap** (non-blocking, Reddy's call, carried from the first pass). homeGaps.ts:63 and :69 hide a property's gap row and its fix whenever any reminder names it. It stays unchanged until Reddy decides.

</details>

<details><summary>Details</summary>

### The Overview on narrow phones

Below 840px the Overview is always two even tracks (w360.css:576), and `.ov-value` no longer wraps (w360.css:593). At 390px that leaves 121px for the figure. The implementer measured "₹123.45 Cr" (130.1px) there: it runs into the card's padding but stays inside its border. The same arithmetic at a narrower width:

```
320px viewport
├16┼──────────── overview 288 ────────────┼16┤
   ├──── card 136 ────┤16├──── card 136 ────┤
                          1+24 │ 86 figure │ 24+1
```

With the implementer's measured widths for Atkinson 700 at 1.5rem:

- "₹2.38 Cr" (99.8px) fits inside the padding at 320.
- "₹12.40 Cr" (115px) ends about 4px past the Estimated value card's right border at 320. It fits from about 330px.
- "₹123.45 Cr" (130.1px) ends about 19px past the border at 320, which is about 3px past the viewport, so the page scrolls sideways. It stays inside the border from about 360px.

This arithmetic reproduces the 390px measurement within about 1px, but it is computed, not rendered (likely). Before this task the phone Overview was one 288px column at 320 (auto-fill 13rem), so the narrow card comes with the new two-by-two grid. 320 CSS px is WCAG 1.4.10's reflow width, which is also a 1280px window at 400% zoom. Nothing in 24-responsive or 02-dashboard renders Home there. A one-column fallback when the section is under about 20rem (`@container overview (max-width: 20rem)`) would close it, as would a smaller figure and card padding at that width. The sweep in test 559 should then start at 320 and include 360.

The two-by-two rows also expose a stretch that already existed. `.ovcard` is a grid with the default `align-content` (w360.css:583-589), so a card stretched to its row's height spreads the spare height over its label and value rows. At 1512 this already drew the Documents figure lower than its neighbours (implementation.md lists it). At 390, Documents now sits beside Properties, whose note it lacks, so the first phone row's figures no longer line up (likely). `align-content: start` on `.ovcard` fixes both widths.

### Evidence against the gate, and what it does not cover

The logs under `.local/impl-scratch/` agree with verification.md and post-date the edits they cover (Dashboard.tsx 22:39, w360.css 22:38, the spec's comment-only edit 23:00). The guard loop matches before-guards.md, failing only `typography-tests.ts` TY-5 at the same three University lines. The 02-dashboard run at 23:01 ended 12 failed / 57 passed. The join file marks all 12 failures `same` as their baseline bodies, all 12 are on before-test-baseline.md's list, and every new test passes, the @phone ones in both projects. The mutation log shows each review-pass assertion failing against its pre-fix rule.

Outside 02, `00-harness.spec.ts:13` went from pass to fail. Its unscoped `getByRole('navigation')` meets two navigations once Home has drawn: the rail and the Shortcuts nav, which HEAD already has. That race belongs to the spec, not to this delta. The e2e-web360 W01 tests (`gap-properties.spec.ts:167-257`, `screens.spec.ts:59`) already assert elements the 26/09 Home removed. No e2e-web360 test reads Missing details or Home's tile art, and `screens.spec.ts:100` still matches `.cards .rec`.

Not tested:

- Home below 390px, where the Overview figure outgrows its card.
- The Overview inside the first 1512 viewport in the seeded state, which the board gives as the outcome of findings 1–3, 6 and 7. No test measures it.
- Recent activity with data. This spec answers `auditTrail` with an empty trail, so its place after Recently opened is never drawn.
- The real gateway and database. `tests/e2e-web360` needs a disposable `TEST_PG_DSN`.
- Screen-reader output beyond the accessibility tree.

</details>

<details><summary>File map</summary>

- `apps/web/src/w360/pages/Dashboard.tsx`: `MissingRow` and `GapRow` inside `ForYou`; the caught-up gate on both reads; the property read moved up to the page; text-button actions named per row; Overview's `say` prop and `inrOr`; the `ov-sec` section; the compact `RecordTile`; the header, `ForYou` and `valued` comments.
- `apps/web/src/w360/homeGaps.ts` (new): `gapsOf`, `missingOf` and `NOTHING_MISSING`; the No documents fix reads "Open record".
- `apps/web/src/w360/homeGaps.test.ts` (new): nine unit tests.
- `apps/web/src/w360/w360.css`: the `.ov-sec` container and the 840px + 48rem rule; `.ov-value` nowrap; `.gapline`, `.gapchips`, `.gaptrack` and `.gappanel`; `.cards.compact` (`auto-fit`), `.rec.compact` and `.rec-kind` (full-strength tokens).
- `tests/e2e-app/specs/02-dashboard.spec.ts`: the `auditTrail` answer and helpers, `linesOf` and `contrastOf` among them; For you, dismissal, Overview and Recently opened tests rewritten; 18 new tests; the expected failure at 471 removed.
- `docs/specs/2026-08-15-web-360-design.md`: the `waiting_items` row, the derived-values list and the archive paragraph.
- `apps/web/README.md`: the `/app` row.

Full delta: `diff -u .local/impl-scratch/home-final-baseline/<path> <path>` for the modified files (`apps/web/README.md` against HEAD). The two new files are untracked.

</details>
