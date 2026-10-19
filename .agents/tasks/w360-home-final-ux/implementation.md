# W360 Home final UX: implementation record (02/10/2026)

Two passes, nothing committed. The first pass found no `review.json`, so it
diffed the working tree against `.local/impl-scratch/home-final-baseline/`,
mapped the delta onto `plan.md`'s nine items and finished them. This second
pass answers `review.json` (CHANGES_REQUESTED, 22:25) and `review.md`.
Verification is in `verification.md`. The 02-dashboard per-test table is in
`after-test-report.md`. The iOS note is `ios-parity-note.md`.

## Review pass: the five findings

| # | Finding (review.json) | Done in this pass |
|---|---|---|
| 1 | BLOCKING, w360.css:571. The four Overview tracks were keyed to an 840px window. From 901px the 15rem rail and main's padding leave a 581px column, so each card's figure got 83px and "₹2.38 Cr" broke into "₹2.38" over "Cr". | Measured first, in the sealed harness (`home-final-measure-before.log`): at 901 and 950 the figure was on two lines. Four tracks now need the 840px window **and** an Overview at least **48rem** wide: `@media (min-width: 840px) { @container overview (min-width: 48rem) { … } }`, with the section as the query container (`.ov-sec { container: overview / inline-size }`, a new class on Home's Overview `<section>`). The precedent is `.vm-stage`. `.ov-value` also gets `white-space: nowrap`, so an amount is never split from its unit, whatever the width. |
| 2 | BLOCKING, 02-dashboard.spec.ts:482. The 901px leg passed while the figure split. | The 901 leg now asserts two by two (even tracks, both rows full, no sideways scroll) and that "₹2.38 Cr" sits on one line. A new test sweeps 390–1512px with "₹12.40 Cr" and "₹123.45 Cr". At every width the figure stays on one line and inside its card, and the cards are four in a row or two by two, never 3+1. A shared `linesOf()` helper counts the figure's lines from its text boxes. |
| 3 | NON-BLOCKING, w360.css:1217. `auto-fill` left an empty fourth track for the seeded three Recently opened tiles at 1512. | `.cards.compact` now uses `auto-fit`, which applies the board's "no empty track" rule. Three tiles fill the row (387px each, as before this task), and four still share it. New test: three tiles, one row, even, ending at the grid's edge. |
| 4 | NON-BLOCKING, w360.css:1223-1228. The kind icon's 55% / 50% mixes measured 2.2–2.4:1 on the plain card in Light. | `.rec-kind` now uses the full-strength `--w-accent`, `--w-info` and `--w-danger`. Measured in the browser: 7.9 / 9.1 / 6.1:1 in Dark, 4.9 / 5.7 / 5.9:1 in Light, and 11.2 / 9.0 / 11.7:1 in High Contrast. Before the change Dark's shop icon was 2.4:1 and High Contrast's flat icon 2.9:1. New test: the icon reaches 3:1 against its tile in all three themes, switched through the theme menu. |
| 5 | NON-BLOCKING, Reddy's call, homeGaps.ts:63. Dedup works by property, not by gap. Any reminder that names a property hides that property's gap row and its fix action. | **No change.** This is D2 as planned, and the review asks for none. It stays open for Reddy (below). |

Why 48rem and not the review's "~44rem": the measured "₹12.40 Cr" is 115px
wide (Atkinson 700 at 1.5rem, with ₹ drawn from a fallback face). A 44rem
column leaves 114px, so that figure would still break by 1px. At 48rem the
figure gets 130px, which leaves 15px of headroom for a wider fallback ₹ on
another platform. With the rail open, four tracks therefore start at a
1088px window. With the rail collapsed they start at 912px (measured). With
no rail, at 840–900px, they hold from 840px as the brief asked. At 901–1087px
the cards sit two by two, which is what the pre-task grid drew at 901–975px.
The brief's "4 tracks from 840px" is kept as a floor, and the column width
is added as the second condition. User-visible effect: at a 901–1087px window
with the rail open, the four Overview cards are two by two rather than
squeezed into one row.

Mutation check: each pre-fix rule was put back in flight by rewriting the
dev server's copy of w360.css inside a scratch copy of the spec, and the
shared stylesheet was not touched. Every new assertion failed against its
defect (`verification.md`).

## Final state

Home (`/app`) reads, in order: greeting, summary line and shortcuts
(unchanged); For you; Overview; Value by village (only when valued);
Recently opened; Recent activity.

- **For you** is one card holding the orders waiting on the owner, the
  reminders, and one Missing details summary row. The row shows "N of M
  complete", an `aria-hidden` neutral track, outlined count chips per kind of
  gap, and a Show all / Hide disclosure. The disclosure lists at most three
  one-line property rows, then the existing "N more properties · All
  properties" line. The card's count is orders + reminders + owned
  properties with a gap. "You're all caught up" is For you's own empty state.
  It is drawn only when all three are 0 and both the orders and the property
  list have answered. While either read is out, or after the list fails, For
  you draws nothing. The separate Missing details card is gone.
- **Row actions** in For you are text buttons (`.linkbtn`), each named for
  its row ("Open record: …", "Open order: W-2105 · Sy 214/2", "Set location:
  Sy 88"). The shortcuts keep 1 filled + 3 outlined.
- **Overview** draws four even `minmax(0, 1fr)` tracks when the window is
  ≥ 840px and the Overview section is ≥ 48rem, and two by two otherwise.
  `.overview` and `.ov-sec` are Home-only. The figure never wraps. Estimated
  value with nothing valued reads "—" (`aria-hidden`), followed by a
  `.sr-only` "not set".
- **Recently opened** uses the compact `.rec` variant (`.rec.compact`,
  `.cards.compact`). It has no placeholder band, and the kind is an inline
  icon in the full-strength kind token. Four share a row at 1512, and fewer
  fill the row with no empty track.
- **Gap logic** lives in `apps/web/src/w360/homeGaps.ts` (a types-only
  import from `api.ts`) and has unit tests.

## Decisions as implemented

None of these claims an approval. They are the plan's decisions and the
brief's instructions, applied.

- **D1** as planned: one summary row inside For you. The count is reminders
  + orders + properties with gaps. The caught-up line shows only when all
  three are 0 and both reads have answered. Section order as above.
- **D2** as planned: a property that a reminder names is counted ("N of M
  complete", its chip, For you's count) but not listed under the disclosure.
  With nothing left to list there is no disclosure. Only reminders dedupe;
  orders do not.
- **D3: changed from the plan after the brief's review point.** Home already
  uses "Open Documents" for the shared-link reminder, which goes to
  `/app/papers`. The gap fix goes to `/app/records/:id`. Both can sit in For
  you at once, which would bring back audit finding 4 (one label, two
  destinations). The fix therefore reads **"Open record"**, Home's existing
  word for that destination. No new copy. Test 987 covers both rows side by
  side. User-visible effect against the board: the gap row says "Open
  record", not "Open documents".
- **D4** as planned. The glyph comes from the shared `inrOr()` (ui.tsx), and
  the spoken "not set" comes from design.md § "Missing reads as missing"
  through `.w360 .sr-only`. The header comment was corrected.
- **D5** as planned: "Show all" / "Hide" are existing w360 words
  (`Orders.tsx`, `OrderService.tsx`, `RecordPhotos.tsx`), so they are not new
  copy. The button has `aria-expanded` and `aria-controls`, and is named
  "Show all Missing details" / "Hide Missing details".
- **Within current authority**, as briefed: one-line gap rows, `GAP_ROWS =
  3`, text-button row actions, the even Overview grid (now keyed to its
  column as well as the window, finding 1), the compact tile (now `auto-fit`
  with full-strength kind colours, findings 3 and 4), and unique per-row
  accessible names.

## Open for Reddy (not changed)

- **Dedup by property or by gap (finding 5).** `missingOf` drops an owned
  property from the disclosure whenever any reminder's `recordId` names it,
  whatever the reminder is about. Consider a parcel that has no boundary and
  also an unrelated "Land tax is due" reminder. Home then shows "1 No
  boundary" in the summary chip, and offers no Draw boundary action anywhere.
  The reminder's own action, "Open record", lands on the record. There are
  three options:
  - (a) Keep D2 as is: one row per property, and the reminder is where it is
    acted on.
  - (b) Dedupe only when the reminder is about the same gap. That would need
    the reminder to carry its subject, which `waiting_items` does not today
    (web360.py), so it is a contract change.
  - (c) Let the chip lead to the property.

  Reverting means going back to (a), which is today's code.

## Interaction count (design-system-governance step 6), seeded state

| Action | Controls | Note |
|---|---|---|
| Add property | 1 | the shortcut |
| Add document | 1 | the shortcut; no gap row reuses the label (test 948) |
| Order a service / Share documents | 1 each | shortcuts |
| Open order | 1 per order needing you | |
| Open record | 1 per reminder with a record, plus 1 per listed property with nothing filed | each a different record, each named for its row |
| Open Documents | 1 per shared-link reminder | always `/app/papers` on Home |
| Set location / Draw boundary | 1 per listed property with that gap (≤ 3) | |
| Show all / Hide | 1 | only when something is left to list |
| Dismiss | 1 per reminder | |

This pass added no control. Already there before this task: four places lead
to `/app/properties`. They are the Properties and Estimated value Overview
cards, Recently opened's "All properties", and the overflow line when more
than three properties are listed.

## Residuals to report

- "Open Documents" still means two places across the app. Home's
  shared-link reminder goes to `/app/papers`, and OrderService's "No
  documents" need goes to `/app/records/:id`. Within Home it is one
  destination.
- With the rail open, a 901–1087px window draws the Overview two by two
  (finding 1, by design). On a 390px phone the two-by-two card leaves 121px
  for a figure. "₹12.40 Cr" (115px) fits. "₹123.45 Cr" (130px) runs 9px into
  the card's padding but stays on one line and inside the card. A
  four-digit-crore figure would reach the border. Measured, not judged.
- Already there before this task: in a row of Overview cards, a card without
  a note (Documents) draws its figure lower than its neighbours. The cards
  stretch to the row's height, and `.ovcard`'s grid spreads the spare height
  over its rows. Seen in the scratch captures; not changed.
- Hover lift drift: Overview cards lift −1px and record cards −2px, although
  design.md says both should match. Out of scope.
- Already there before this task: `.sec-first` leaves For you flush under the
  SetupChecklist card when setup tasks are open.
- `tests/e2e-web360` was not run; it needs a disposable `TEST_PG_DSN`. It
  still asserts the pre-26/09 Home, and `gap-properties.spec.ts:247` will
  need `exact: true` because of the new action names.
- The 12 listed 02-dashboard tests (after-test-report.md) need rewrites, not
  selector fixes. Two of them, 498/618 and 229/298, protect rules the 26/09
  Home no longer keeps; those are product questions older than this task.
- Seen while checking for regressions, not caused here (`verification.md`):
  - `00-harness.spec.ts:23` `getByRole('navigation')` races Home's
    Shortcuts nav, which has been in HEAD since 26/09; it passed 1 of 6
    repeats.
  - 01-shell, which does not answer `auditTrail`, fails its console guard on
    a timing-dependent number of tests.
- iOS: no Swift needed (NOTE). Whether Missing details becomes a shared
  `packages/core` rule is a later product and architecture call
  (`ios-parity-note.md`).

## Governance (five dimensions)

- **Documentation:**
  - code comments match the code: the Dashboard header, ForYou, `valued`,
    the new `ov-sec` comment, and the w360.css comments for `.overview`,
    `.ov-value`, `.cards.compact` and `.rec-kind`;
  - the first pass made three targeted edits to
    `docs/specs/2026-08-15-web-360-design.md`;
  - this pass made one targeted edit to `apps/web/README.md`, whose `/app`
    row still said "dashboard — portfolio, what's waiting, where the value
    sits";
  - `design.md` is unchanged.
- **Architecture:**
  - same queries and boundaries;
  - the `properties` read moved to the page (first pass);
  - new pure module `homeGaps.ts`;
  - a CSS container on Home's Overview section; it does not move the section
    (A/B measured: same top, left and width).
- **Security/privacy:** no change to auth, storage, sharing, PII, SQL or
  routes. Every link goes to an existing authenticated route.
- **Testing/evidence:** see `verification.md`.
- **Cleanup:**
  - removed: this pass's scratch specs (measure, mutation, shots, rail, FA
    copy) from `tests/e2e-app/specs/`, its screenshots, the Playwright output
    folders, the scratch build, the scratch tsconfig and the served-CSS dump;
  - kept for the reviewer, all git-ignored under `.local/impl-scratch/`:
    logs, JSON/TSV and the measurement spec;
  - no process started by this task is running, and the dev servers were
    left alone.
