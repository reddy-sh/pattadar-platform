# W360 Home final UX: 02-dashboard after-run report (02/10/2026)

Sealed `e2e-app`, `app` (1512×950) and `phone` (WebKit iPhone 14) projects,
fixture data only, against the user's dev server on `:5173` (HTTP 200,
read-only). No `live` project, no `allowEscapes`.

## Review pass: latest run, 23:01 on 02/10/2026

This run came after every edit of the review pass. The CSS and Dashboard
were last changed at 22:39, and the spec at 23:00 (comment only). Same
command as below, writing to `home-final-review-02.{log,json}` and
`--output=.local/impl-scratch/home-final-pw-review`, which was removed
after the run. Per test: `home-final-review-02.tsv`. Baseline ↔ current
join by title, with current line numbers: `home-final-review-02-join.tsv`
(from `hf-join-review.ts`).

| | Tests | Passed | Expected failure (`test.fail`) | Failed |
|---|---|---|---|---|
| Baseline, app | 48 | 2 | 2 | 44 |
| Baseline, phone | 1 | 0 | 0 | 1 |
| First pass, app | 63 | 50 | 1 | 12 |
| First pass, phone | 3 | 3 | 0 | 0 |
| **Review pass, app** | **66** | **53** | **1** | **12** |
| **Review pass, phone** | **3** | **3** | **0** | **0** |

Playwright's own line reads "12 failed, 57 passed".

**Zero new failures vs before-test-baseline.md.** The 12 failures are
exactly the first pass's 12; the TSV diff by title is empty. Every one is on
the baseline failure list, and its body is unchanged from the baseline copy
(the join marks all 12 `same`). Current lines: 238, 276, 336, 351, 384, 414,
434, 446, 471, 654, 726 and 1582. Their causes are in the first-pass table
below. All 48 baseline titles are present, plus 18 new ones (15 + 3).

What this pass changed in the spec, for review findings 1–4:

| Line | Test | Result | What changed |
|---|---|---|---|
| 512 | the four overview cards share one row at 1512 with no empty track | pass | The 1512 half is kept and adds "the figure on one line". The 901 leg now expects two by two (even, both rows full, no empty track, no sideways scroll) with "₹2.38 Cr" on one line, because the cards no longer squeeze four into a 581px column (finding 1). It replaces "still one row" (finding 2). |
| 559 | an estimate in tens or hundreds of crores stays on one line at every window width | pass | New, for findings 1 and 2. "₹12.40 Cr" and "₹123.45 Cr" at 390–1512px: the figure on one line and inside its card; four in a row or two by two, never 3+1; even tracks; no sideways scroll. |
| 865 | three recently opened tiles fill the row at 1512, with no empty fourth track | pass | New, finding 3. |
| 884 | the kind icon on a recent tile can be told from its card in every theme | pass | New, finding 4: at least 3:1 for land, flat and shop in Dark, Light and High Contrast. |

A scratch mutation check showed that each of these fails against the CSS
rule it guards (`verification.md`).

The rest of this file is the first pass's report. Its "after" line numbers
come from the 20:54 run; for current numbers use the join file above.

## First pass: final run, 20:54 on 02/10/2026

This run came after the last code and spec edit of that pass (both at 20:52).

```sh
cd tests/e2e-app
APP_WEB_URL=http://localhost:5173 \
PLAYWRIGHT_JSON_OUTPUT_FILE=<repo>/.local/impl-scratch/home-final-after-02.json \
./node_modules/.bin/playwright test specs/02-dashboard.spec.ts \
  --project=app --project=phone --reporter=line,json \
  --output=<repo>/.local/impl-scratch/home-final-pw-after
```

`--reporter=line,json` with `PLAYWRIGHT_JSON_OUTPUT_FILE` keeps the suite's
git-ignored `results.json` and `playwright-report/` untouched (both still
dated 18:49). Evidence, all git-ignored under `.local/impl-scratch/`:
`home-final-after-02.log` (console), `home-final-after-02.json` (report),
`home-final-after-02.tsv` (per test, from `pw-flatten.ts`),
`home-final-after-02-join.tsv` (baseline ↔ after join by title, from
`hf-join.ts`), `home-final-pw-after/` (failure screenshots and traces).

### Totals (first pass)

| | Tests | Passed | Expected failure (`test.fail`) | Failed |
|---|---|---|---|---|
| Baseline, app | 48 | 2 | 2 | 44 |
| Baseline, phone | 1 | 0 | 0 | 1 |
| After, app | 63 | 50 | 1 | 12 |
| After, phone | 3 | 3 | 0 | 0 |

Playwright's own line: baseline "45 failed, 4 passed"; after "12 failed, 54
passed" (it counts an expected failure as passed).

### Zero new failures vs before-test-baseline.md (first pass)

All 12 failures are on the baseline failure list (baseline lines 120, 158,
214, 229, 262, 292, 312, 324, 349, 423, 498, 967), all in the `app` project.
For each of the 12 the test body is unchanged from the baseline copy once
comments and whitespace are ignored (the join flags every one `same`), and
each stops on the same pre-26/09 element the baseline table names (eyebrow,
head clock, `p.lede`, `.strip`, the Value by village sentences). Every
baseline pass still passes: 584 and 996 unchanged, 441 still an expected
failure, 471 now an ordinary passing test. No test was deleted, skipped or
weakened into a pass: all 48 baseline titles are present, plus 15 new ones,
and the only `test.fail()` change is 471's removal under AUTHORING rule 5.

### Per test (first pass line numbers)

Class: (a) passes once `auditTrail` is answered, body unchanged; (b) updated
to behaviour this task changes; (c) stale selector or copy only, the rule it
protects still holds; listed: left as it is; new: added by this task.

| Baseline → after line | Test | Before → after | Class | Cause / note |
|---|---|---|---|---|
| 120 → 185 | the dashboard greets me by name and says what my whole portfolio is | FAIL → FAIL | listed | eyebrow, owned-only links, both clocks and built sq.ft left the head on 26/09; the meta line counting managed and watched as properties is a pre-existing truthfulness question |
| 149 → 214 | an account with no name on it is still greeted | FAIL → pass | (a) | |
| 158 → 223 | the greeting follows the clock, and turns over at noon and at five | FAIL → FAIL | listed | the head's "Land 11:59 IST" clock is gone; the greeting half of the test still holds but the clock half needs a rewrite, not a selector |
| 187 → 252 | the dashboard and the frame around it read my portfolio once between them | FAIL → pass | (c) | `.strip` wait → Overview region |
| 202 → 266 | the portfolio line names only the kinds I actually hold | FAIL → pass | (c) | meta line + Properties card note |
| 214 → 283 | the portfolio line counts in the singular when I hold one of something | FAIL → FAIL | listed | the "Land — …" clause and the head's waiting count are gone; the bell counts `waiting.length`, the test sets `waitingCount` only |
| 229 → 298 | a portfolio of open plots and shops is named in its own words | FAIL → FAIL | listed | no `p.lede`; the Overview folds flats and shops into "buildings", which breaks "named in its own words" (pre-existing) |
| 250 → 319 | a portfolio that is all mine says nothing about managed or watched | FAIL → pass | (c) | meta line |
| 262 → 331 | an account that only watches somebody else's land still gets a dashboard | FAIL → FAIL | listed | the stake line is gone |
| 292 → 361 | every tile the server sends is drawn, in order, with its label, value, unit and note | FAIL → FAIL | listed | the server tiles strip is no longer drawn |
| 312 → 381 | a tile with no unit does not grow a stray one | FAIL → FAIL | listed | same |
| 324 → 393 | a tile with nothing to say under it draws no empty line | FAIL → FAIL | listed | same |
| 349 → 418 | a tile the server marks up or down is drawn in that tone | FAIL → FAIL | listed | same |
| new → 442 | Estimated value with nothing valued is a dash, and a screen reader hears not set | → pass | new (D4, finding 8) | |
| new → 459 | the four overview cards share one row at 1512 with no empty track | → pass | new (findings 6, 7) | checked at 1512 and 901; the rail turns into a drawer at ≤900px, so 901 (not the plan's 900) is the narrowest width with the rail. Superseded: the review pass changed the 901 leg to two by two with the figure on one line (see the top of this file) |
| 373 → 491 | where the value sits draws one bar per village, in proportion | FAIL → pass | (c) | Overview "Estimated value" / "Bought for", meta "27 documents"; also asserts a valued figure carries no "not set" |
| 401 → 524 | the smallest village still gets a bar I can see | FAIL → pass | (a) | |
| 423 → 546 | a portfolio nobody has valued says why, instead of drawing an empty chart | FAIL → FAIL | listed | the sentence was replaced by hiding the card; its head-clock assertion is gone too |
| 441 → 564 | a village worth nothing is not "where the value sits" | xfail → xfail | listed | the ₹0 bar is gone in code (bars are filtered to value > 0), but the body asserts the removed sentence, so it needs a rewrite |
| 471 → 594 | a portfolio nobody has priced is not told it was free | xfail → pass | (c) | `test.fail()` removed (AUTHORING rule 5); also asserts no "Bought for" note at ₹0 |
| 498 → 618 | no papers filed says so rather than printing a zero | FAIL → FAIL | listed | the sentence left Value by village; the Overview Documents card prints 0 (pre-existing product question) |
| 510 → 630 | the recently opened strip shows what I last opened, and each card opens it | FAIL → pass | (b) | "All properties" in the Recently opened region |
| 535 → 656 | a card measured in acres keeps the fraction of an acre | FAIL → pass | (b) | `.art` → `.rec-kind` |
| 551 → 672 | a recent card is drawn as the kind of thing it actually is | FAIL → pass | (b) | same |
| 584 → 705 | a card the server cannot place still says how big it is | pass → pass | unchanged | |
| 598 → 719 | nothing opened yet is not worth a section | FAIL → pass | (b) | |
| new → 735 | recently opened tiles carry no placeholder band, and four share a row at 1512 | → pass | new (finding 9) | |
| 616 → 759 | every thing waiting on me says what it is, why, and where to go | FAIL → pass | (b) | `Open record: <title>` per row |
| 645 → 792 | a waiting row opens the record it is about | FAIL → pass | (b) | |
| new → 802 | For you counts orders, reminders and properties missing details, and says Missing details once | → pass | new (D1, D2, finding 2) | |
| new → 825 | nothing waiting but a property off the map is not all caught up | → pass | new (finding 1) | |
| new → 853 | For you says nothing while the property list is still coming | → pass | new | portfolio held 800 ms so the orders have answered; only the list is out |
| new → 871 | For you says nothing while the orders are still coming | → pass | new | the mirror case: the list has answered, the orders have not |
| new → 887 | a property list that does not load drops Missing details and keeps the rest of For you | → pass | new | |
| new → 902 | Show all says whether it is open and what it opens, and shows three at most | → pass | new (D5, finding 3) | |
| new → 948 | a property a reminder already names is listed once, and its documents action says where it goes | → pass | new (D2, D3) | |
| new → 987 | each action label in For you leads one way, even with a shared link and an unfiled property side by side | → pass | new (D3 review point, finding 4) | |
| new → 1023 | a field with a pin but no boundary is asked for one, and a flat is not | → pass | new | |
| new → 1045 | row actions in For you are text buttons, each named for its own row | → pass | new (finding 5) | |
| 654 → 1071 | a reminder about something I shared out opens Documents | FAIL → pass | (b) | |
| 674 → 1101 | a reminder the data cannot place carries no button rather than a wrong one | FAIL → pass | (b) | |
| 697 → 1124 | an empty waiting list says so rather than drawing an empty box | FAIL → pass | (b) | caught-up only with no gaps; topbar bell |
| 712 → 1147 | dismissing a reminder is asked for, not done on one click | FAIL → pass | (b) | |
| 733 → 1168 | Escape backs out of the dismiss dialog without dismissing anything | FAIL → pass | (b) | |
| 746 → 1181 | the dismiss dialog starts on Keep it, holds the keyboard, and hands it back | FAIL → pass | (a) | |
| 787 → 1222 | clicking off the dismiss dialog backs out of it too | FAIL → pass | (b) | |
| 804 → 1239 | dismissing one reminder takes that one and leaves the others | FAIL → pass | (b) | count 5 → 4, `Notifications, 2 waiting` |
| 836 → 1274 | dismissing the last reminder leaves the panel saying there is nothing | FAIL → pass | (b) | |
| 854 → 1298 | a dismissal in flight says so and cannot be sent twice | FAIL → pass | (a) | |
| 877 → 1321 | a dismissal in flight cannot be escaped or clicked away | FAIL → pass | (b) | |
| 907 → 1351 | reminders can be cleared one after another, each carrying its own id | FAIL → pass | (b) | D2 release: Sy 88 is listed once its reminder is gone |
| 941 → 1395 | a dismissal the server refuses keeps the reminder, and says why | FAIL → pass | (b) | |
| 967 → 1421 | a brand-new account is told the one thing to do, and nothing else | FAIL → FAIL | listed | the eyebrow and the first-run meta line are gone |
| 996 → 1450 | a brand-new account refuses the four zero-rupee tiles the server still sends | pass → pass | unchanged | |
| 1016 → 1470 | an invitation can arrive before my first record does | FAIL → pass | (b) | count 2: the invitation and the seeded order back for review; no Missing details |
| 1041 → 1502 | while my portfolio is still coming the dashboard says so and claims nothing | FAIL → pass | (c) | |
| 1064 → 1526 | a portfolio that does not come back says so, and says what the server said | FAIL → pass | (c) | |
| 1080 → 1542 | Try again re-asks for the portfolio, and the dashboard arrives when the server comes back | FAIL → pass | (c) | |
| 1100 → 1562 | Try again puts the screen back into its waiting state while it re-asks | FAIL → pass | (c) | |
| 1130 → 1592 | Try again on a server that is still down leaves the failure on screen | FAIL → pass | (c) | |
| 1157 → 1619 | @phone the dashboard still hands me every waiting row and its way in | FAIL → pass (app, phone) | (b) | |
| new → 1640 | @phone the overview cards sit two by two on a phone | → pass (app, phone) | new | |
| new → 1652 | @phone Missing details opens to one-line rows that stay on the screen | → pass (app, phone) | new | the 44px branch ran on `phone` (coarse pointer); `app` reports a fine pointer and records an annotation instead |
