# W360 Home — pre-edit test baseline (02/10/2026)

Run before any edit for this task, against the working tree served by the
user's Vite dev server (`http://localhost:5173`, HTTP 200, read-only check).
Sealed `e2e-app` harness only: `app` (1512×950) and `phone` (390) projects, no
`live`, no `allowEscapes`, fixture data only.

```sh
cd tests/e2e-app
APP_WEB_URL=http://localhost:5173 ./node_modules/.bin/playwright test \
  specs/02-dashboard.spec.ts --project=app --project=phone \
  --reporter=line --output=<repo>/.local/impl-scratch/home-final-pw-before
```

Full log: `.local/impl-scratch/home-final-before-02.log` (git-ignored).

## Result: 45 failed, 4 passed (49 tests, 1.2 min)

Passed: `441` a village worth nothing is not "where the value sits" · `471` a
portfolio nobody has priced is not told it was free · `584` a card the server
cannot place still says how big it is · `996` a brand-new account refuses the
four zero-rupee tiles.

## Two causes of failure

1. **Unanswered `auditTrail` query (38 of 45).** Home's `RecentActivity`
   (`Dashboard.tsx` → `useAuditTrail`) sends
   `query { auditTrail { … } }`; `fixtures/seed.ts` has no `root.auditTrail`
   answer, so the seal returns 400 and the harness's console guard fails the
   test ("Failed to load resource … 400"). Specs 19-sections-legacy work around
   it with `world.set('root.auditTrail', [])`; 02-dashboard does not.
2. **Spec written for the pre-26/09 Home (all 45 that reach an assertion).**
   The spec still asserts the old layout: the "Your portfolio" eyebrow, the
   `p.lede` "Land — …" portfolio line, the five-tile `.strip`, a "Waiting on
   you" card with a "Notifications ›" link, "All properties ›", "Loading your
   dashboard…", "Your dashboard did not load", and "Value by village" empty
   copy. The current code renders "For you", a `p.note` meta line, the
   Overview cards, "Loading your home page", "Your home page" failure, etc.

## The empty For you panel (spec lines 697–706)

`an empty waiting list says so rather than drawing an empty box` expects, in a
card headed "Waiting on you":

- text `Nothing is waiting on you.`
- `.pagehead p.note` containing `Nothing waiting on you`
- a link `Notifications ›`

The code (`ForYou`, `Dashboard.tsx` ~L188–198) renders
`<section class="card foryou-clear" aria-label="For you">` with
`You're all caught up` / `Nothing needs your attention.` and **no link**.
Failed on: `toContainText("Nothing is waiting on you.")` (locator: card with
heading "Waiting on you", not found). `836` "dismissing the last reminder
leaves the panel saying there is nothing" fails on the same string.

## Per-test first assertion failure (app unless noted)

| Line | First non-console failure |
|---|---|
| 120 | `.pagehead` "Your portfolio" not visible |
| 149 | console 400 only |
| 158 | `.pagehead p.note` expected "Land 11:59 IST" |
| 187 | `.strip > *` count 5 |
| 202, 214, 250 | `.pagehead` expected "Land — …" line |
| 229 | `p.lede` expected "Land — 2 open plots …" |
| 262 | `p.lede` count 1 |
| 292, 324, 598 | `.strip > *` count |
| 312 | `.strip` "Papers filed" 27 |
| 349 | `.strip` "Gain" `span.v` class up |
| 373, 423, 498 | "Value by village" card copy |
| 401, 535, 551 | console 400 only |
| 510 | link "All properties ›" |
| 616 | "Waiting on you" card "Notifications ›" link |
| 645 | click timeout (waiting row) |
| 654, 674 | "Waiting on you" card rows |
| 697, 836 | "Nothing is waiting on you." |
| 712, 733, 787, 804, 877, 907, 941 | "Waiting on you" `.rows > div` count |
| 746, 854 | console 400 only |
| 967 | `.pagehead` "Your portfolio" |
| 1016 | "Waiting on you" card invitation text |
| 1041 | "Loading your dashboard…" |
| 1064, 1080, 1100, 1130 | alert "Your dashboard did not load" |
| 1157 (app + phone) | `.strip > *` count 5 |

Any later "after" run must be compared with this: a pass count above 4 is new
evidence; failures in the list above are pre-existing, not regressions.
