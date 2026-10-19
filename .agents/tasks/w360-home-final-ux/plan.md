# W360 Home final UX: implementation plan (02/10/2026)

Work in place in `/Users/reddy.sh/reddy.sh/projects/pattadar-platform`. Don't create a worktree, don't commit or push, and don't add dependencies. Read these first; they are binding:

- [`orchestrator-notes.md`](./orchestrator-notes.md): which files to leave out of the delta, and the 02-dashboard spec gate.
- [`setup-manifest.md`](./setup-manifest.md): baseline copies under `.local/impl-scratch/home-final-baseline/`, and the reviewer's `diff -ru` recipe.
- [`before-test-baseline.md`](./before-test-baseline.md): 02-dashboard failed 45 of 49 before any edit.
- The audit board `.local/ux-audits/2026-10-02-w360-home/board.html` (findings 1–9), `design.md`, and `tests/e2e-app/AUTHORING.md`.

Leave these files alone (orchestrator notes §1):
- `.kiro/skills/heuristic-ux-audit/**`, `.kiro/skills/README.md`, `.kiro/skill-evals/portfolio.json`
- the audit's `board.html`, `board.png` and `compare.png`
- `docs/runbooks/aadhaar-kms-rollout.md`, `scripts/fence-tests.ts`
- `design.md`, and anything under `tests/e2e-app/fixtures/`

`Dashboard.tsx` and `w360.css` already carry uncommitted edits from before this task (`.sec-first`, and the fence/vm rules). They belong to the baseline. Build on them and don't revert them.

Never write "approved by Reddy", or any approval claim, in code, comments or docs. Activate `functional-acceptance` and `verify-change` before reporting.

The AFTER screenshots and the side-by-side comparison belong to the workflow's later `after-and-compare` step. This plan does not take them. The build loop stops when `.agents/tasks/w360-home-final-ux/review.json` has `"verdict": "APPROVED"`.

---

## Decisions (resolved here; the implementer doesn't revisit them)

**D1. Merge Missing details into For you.**
- `ForYou` renders, in order, the order rows, the reminder rows, and one new `MissingRow`. The separate Missing details card goes.
- The card head count is reminders + orders + properties with at least one gap.
- `MissingRow` shows:
  - title `Missing details` (existing copy, now an h3)
  - `N of M complete` (existing copy)
  - an aria-hidden neutral track
  - outlined count chips (ui.tsx `Chip`, static), such as `1 Not on the map`
  - a disclosure that opens at most `GAP_ROWS = 3` one-line property rows, then the existing `N more properties · All properties` line.
- "You're all caught up" becomes For you's own empty state. It shows only when reminders, orders and gap properties are all 0 **and** both the orders read and the properties read have answered. While a read is still out, or after one failed, For you renders nothing rather than make a claim that might be untrue.
- The `properties` read moves from the old `MissingDetails` child to the top of `Dashboard()`. It is the same key that Properties uses, it now fetches in parallel with `portfolio`, and that stops the caught-up line flashing up before the gaps arrive.
- The first-run branch passes `NOTHING_MISSING`, because an account that holds nothing has nothing missing.

**D2. Deduplicate against reminders.**
- A gap property is left out of the disclosure list (`listed`) when a reminder's `recordId` names it. It still counts in `N of M complete`, in the chips and in the head count.
- Only reminders (`WaitingItem.recordId`) trigger this, as D2 says; orders don't.
- When every gap property is already named by a reminder (as in the seeded state, where Sy 88 has a reminder), the row shows no disclosure at all. A "Show all" that opens nothing would be a dead control.
- The reminder row itself is unchanged: nothing extra is added to it.

**D3. Scoping is not supported, so relabel to `Open Documents`.**
- Evidence that no route can open the add-document flow for one property:
  - The shortcut opens `/app/papers?do=add`. `Vault.tsx:662-670` reads only `do=add|share` and mounts `AddPapers`, which is `PaperDrawer recordId=""` at `Vault.tsx:427-433`.
  - `PaperDrawer` accepts a `recordId` (`RecordPapers.tsx:93`), but no route reaches it scoped. `RecordPapers` has no `useSearchParams` and opens its drawer only from its own button (`RecordPapers.tsx:630-646`).
  - The record index route is the Documents tab (`apps/web/src/routes.tsx:403`; the brief's `w360/routes.tsx` doesn't exist).
- Decision: the gap fix for "No documents" keeps its destination, `/app/records/:id`, and is labelled **`Open Documents`**.
- This uses the **existing** w360 words for this exact destination and gap: `OrderService.tsx:701-705` says "No documents are filed on this property yet." with an `Open Documents` link to `/app/records/${rec.id}`, and `13-services.spec.ts:1340` asserts it. So this is not new copy; the brief's lowercase "Open documents" is matched to the existing capitalisation.
- Known residual: the lock reminder's `whereTo` label is also `Open Documents`, but it goes to `/app/papers`. The two links get different accessible names (see A11y). Report this; don't change it.

**D4. Show "—" for Estimated value when nothing is valued.**
- The `Overview` tile shows `—` instead of `Not valued`. The `Bought for ₹…` note stays.
- The dash is `aria-hidden`, and a `<span className="sr-only">not set</span>` follows it. `.w360 .sr-only` already exists at `w360.css:2906` and `Vault.tsx` uses it. "not set" is design.md's own word for a value that isn't held (§ Property tabs), so this is not new copy.
- `DeskCoverage.tsx:266` instead puts an `aria-label` on a dash span. That was considered and not copied: ARIA 1.2 prohibits naming a generic span, and screen readers announce it unreliably.
- The now-unused `words` prop of `Overview` goes, and a `say` prop is added.
- Fix the header comment (drift) and the `valued` comment.

**D5. Reuse the existing disclosure copy.**
- The disclosure label is **`Show all`**, existing w360 copy at `Orders.tsx:181`, `Orders.tsx:688` and `OrderService.tsx:765`.
- When open, it reads **`Hide`**, the existing w360 collapse word for an `aria-expanded` disclosure (`Orders.tsx:324`, `RecordPhotos.tsx:235`).
- Neither string is new copy.
- The button uses the shared text-button class `.linkbtn`, the same as the `Ticket.tsx:452` and `RecordPhotos.tsx:232` disclosures, with no chevron.

**Canonical copy for the empty state.** Keep "You're all caught up" and "Nothing needs your attention." and update the spec.
- `git log -S` shows both strings arrived with the 26/09 Home in `40ac200` (30/09/2026).
- The same commit removed "Nothing is waiting on you." from `Dashboard.tsx`. That string now survives only as the empty title of `/app/assigned` (`Orders.tsx:501`), which is a different screen.
- Nothing in `docs/`, `design.md` or `README.md` fixes either string for Home.
- The spec's `Notifications ›` in-panel link was also removed on 26/09. The way to the full list is now the topbar link (`Shell.tsx:619-623`, name `Notifications` or `Notifications, N waiting`), and the tests assert that instead.

**Is the grid class shared? Overview grid.**
- `.overview` is Home's alone. Its only CSS is `w360.css:563`, and its only markup is `Dashboard.tsx:423`; University's `course-overview` is another class in another app.
- So change it in place: `repeat(2, minmax(0, 1fr))`, then `repeat(4, minmax(0, 1fr))` from `@media (min-width: 840px)`.
- `.cards` and `.rec` **are** shared:
  - `.cards`: `Properties.tsx:1138`, `Groups.tsx:285`, `CombinedProperty.tsx:247`, `OrderLand.tsx:523` and `:706`, `skeletons.tsx:126` and `:360`, `RecordFeatures.tsx:926`
  - `.rec`: `Properties.tsx:241`, `OrderLand.tsx:110` and `:193`, `skeletons.tsx:94`
- So Home gets modifiers in the shared stylesheet: `.cards.compact` and `.rec.compact`.

**RecordTile variant.**
- `RecordTile` (`Dashboard.tsx:34-51`) is exported but has no other importer. Properties draws its own `Card` (`Properties.tsx:191`) with the photo, map, scan and illustration art chain.
- The shared thing is the `.rec` card in `w360.css:1129-1183`. Add a **`compact` variant of `.rec`** there; `RecordTile` opts into it with `className="rec compact"`, and its grid uses `className="cards compact"`.
- RecordTile never draws a photo, a map or a scan; it has no `PhotoImg` or `MapThumb`. So its band is always the placeholder (an icon over a gradient), and compact applies to every Home tile. The kind stays as an inline icon in the band's own per-kind colour. Drawing real art on Home is out of scope: it would add authenticated byte reads, pull Leaflet thumbnails onto Home, and copy Properties' art chain.
- **Applying compact everywhere would not be better.** On Properties and on OrderLand the band carries the select checkbox, the status and litigation pills, the actions kebab, the ground/coordinate footer and the real art. OfferTile's band is a real service image. Skeletons mirror those cards. Leave them as they are.

**Text buttons.**
- Row actions in For you (Open order, Open record / Open Documents, Set location / Draw boundary / Open Documents) change from outlined `.btn` to the shared text action `.linkbtn` (`w360.css:2820-2826`).
- `.rows .linkbtn` already gets the 44px floor under `@media (pointer: coarse)` (`w360.css:5038`, rule at `:5056`).
- The four shortcuts are unchanged: one filled, three outlined.
- The board's "−1px vs −2px hover lift" drift (`w360.css:573` vs `:1140`) is out of scope. Leave it and mention it in the report.

**A11y attributes added**

| Element | Attributes | Accessible name |
|---|---|---|
| Disclosure button | `type="button"`, `aria-expanded={open}`, `aria-controls={panelId}`, `aria-labelledby={`${labelId} ${titleId}`}` | "Show all Missing details", or "Hide Missing details" when open |
| Panel | always rendered, with `id={panelId}` and `hidden={!open}` | — |
| Order text button | `aria-label` | `Open order: ${[o.ref, o.recordTitle].filter(Boolean).join(' · ') \|\| o.title}`, e.g. "Open order: W-2105 · Sy 214/2" |
| Reminder text button | `aria-label={`${go.label}: ${w.title}`}`, matching the existing `Dismiss: ${w.title}` | "Open record: Land tax is due on Sy 214/2" |
| Gap-row text button | `aria-label={`${fix.fix}: ${r.title}`}` | "Set location: Sy 88", "Open Documents: Flat 4B, Sai Residency" |
| Progress track | `aria-hidden` | — (the "N of M complete" text says it) |
| Estimated value dash | `aria-hidden`, followed by an `.sr-only` "not set" | "Estimated value … not set …" |
| Compact tile icon | already `aria-hidden` (ui.tsx `Icon`) | the tile link keeps its title and extent name |

Notes:
- The panel's ids come from `useId`.
- Every name starts with the visible label (WCAG 2.5.3) and is unique per row.
- Property titles in the panel are `h4`: the outline is For you (h2) > Missing details (h3) > property (h4).

---

## Implementation plan

- [ ] 0. **Record a pre-edit guard baseline.** No edits in this step. Skip it if `before-guards.md` already exists.
      From the repo root, run:
      - `bun run typecheck`
      - `bun test apps/web/src`
      - `for s in scripts/*-tests.ts; do echo "── $s"; bun run "$s" || echo "FAILED: $s"; done`
      - `bun run scripts/icon-guard.ts`
      - `bun run scripts/ux-guards.ts`

      Record pass/fail per command, and per script, in `.agents/tasks/w360-home-final-ux/before-guards.md`. Logs go to `.local/impl-scratch/home-final-before-*.log`. Other tasks have uncommitted work in the tree (for example `scripts/fence-tests.ts` and `FenceStudio.tsx`), so anything red here is pre-existing.
      Files: `.agents/tasks/w360-home-final-ux/before-guards.md` (new).
      Verify: the file lists every command with its exit status.

- [ ] 1. **Lift the gap logic into a pure module, with unit tests.**

      Create `apps/web/src/w360/homeGaps.ts`:
      - It imports only types, `import type { RecordCard, WaitingItem } from './api'`, so the bun test never loads the React Query client.
      - Move `interface Gap` and `gapsOf` from `Dashboard.tsx:247-271` verbatim, doc comment included, with one change: the documents fix becomes `{ label: 'No documents', fix: 'Open Documents', to: `/app/records/${r.id}` }`. Add a comment giving the D3 reason (the shortcut's add flow can't be scoped; these are OrderService's words for the same gap).
      - Add `export interface Incomplete { r: RecordCard; gaps: Gap[] }`.
      - Add `export interface Missing { owned: number; open: Incomplete[]; listed: Incomplete[]; tally: { label: string; n: number }[] }`.
      - Add `export const NOTHING_MISSING: Missing = { owned: 0, open: [], listed: [], tally: [] }`.
      - Add `export function missingOf(cards: RecordCard[], waiting: WaitingItem[]): Missing`:
        - `owned` = cards with `stake === 'owned'` (keep the existing rule and comment: managed and watched land is somebody else's to complete)
        - `open` = owned cards with ≥1 gap
        - `listed` = `open` minus ids in `new Set(waiting.map(w => w.recordId).filter(Boolean))`
        - `tally` = per gap label, the number of `open` properties carrying it, in first-seen order

      In `Dashboard.tsx`:
      - Delete the local `Gap` and `gapsOf` and import `gapsOf` from `../homeGaps`.
      - Leave `MissingDetails` rendering as it is for now. It keeps building, and its button now reads `Open Documents`.

      Create `apps/web/src/w360/homeGaps.test.ts`. Use `bun:test`, as `inbox.test.ts` does, with a `card(over)` builder that returns a complete `RecordCard`. Cover:
      - (a) no pin and no boundary gives `Not on the map` / `Set location` / `/app/records/<id>/map`
      - (b) located `agri` land with `ring.length < 6` gives `No boundary` / `Draw boundary`, while a `flat` with no ring gets no boundary gap
      - (c) `paperCount 0` gives `No documents` / `Open Documents` / `/app/records/<id>`
      - (d) only owned cards count
      - (e) the tally groups across properties
      - (f) a property a reminder names is counted in `open` and `tally` but not in `listed`
      - (g) a reminder with an empty `recordId` hides nothing
      - (h) `missingOf([], [])` deep-equals `NOTHING_MISSING`

      Files: `apps/web/src/w360/homeGaps.ts` (new), `apps/web/src/w360/homeGaps.test.ts` (new), `apps/web/src/w360/pages/Dashboard.tsx`.
      Verify: `bun test apps/web/src/w360/homeGaps.test.ts` passes; `bun run --filter @pattadar/web typecheck` matches the step-0 result.

- [ ] 2. **Make the spec answer `auditTrail` and add the shared helpers.** Do this before any behaviour change, so each later step can run its own tests.

      In `tests/e2e-app/specs/02-dashboard.spec.ts`, add a top-level `test.beforeEach(({ world }) => { world.set('root.auditTrail', []); });`, using the same comment as `19-sections-legacy.spec.ts:1015-1016` (Home's Recent activity reads the root schema, which `fixtures/seed.ts` doesn't answer, and fixtures are not ours to edit).

      Add these imports and helpers:
      - `import { CARDS } from '../fixtures/seed';`
      - `BY_ID`, and `only(...ids)` (a `structuredClone` per card, as in `03-properties.spec.ts:60-62`)
      - `listOf(cards)`, returning `{ shown, total, hidden: 0, filterSummary: '', hiddenPlaces: [], activeCount: 0, cards, facets: [] }`
      - `forYou(page)`: `section.card` filtered by heading `For you` (exact)
      - `caughtUp(page)`: `getByRole('region', { name: 'For you' })`. Only the caught-up section carries that `aria-label`.
      - `reminderRows(page)`: `forYou(page).locator('.rows > div')` filtered `has: getByRole('button', { name: /^Dismiss: / })`
      - `missingRow(page)`: rows filtered `has: getByRole('heading', { name: 'Missing details', exact: true })`
      - `overview(page)`: `getByRole('region', { name: 'Overview' })`
      - `recent(page)`: `getByRole('region', { name: 'Recently opened' })`

      Keep `waitingPanel` and `waitingRows` until step 3 replaces their callers. Delete each helper once nothing uses it; that is a helper, not a test.

      Update the file's header comment:
      - The first paragraph should name the current Home sections: For you, Overview, Value by village, Recently opened, Recent activity.
      - Note the `auditTrail` answer.

      Then run the spec once. Expect the baseline failures except `an account with no name on it is still greeted`, `the smallest village still gets a bar I can see` and `a card the server cannot place…`, which should now pass. `a portfolio nobody has priced is not told it was free` (baseline L471) should now report "expected to fail, but passed": its body passes, because the 26/09 Value by village card no longer prints a paid-in-total clause. Convert it to a normal test: remove `test.fail()` and rewrite its `DEFECT` comment as a short "fixed by the 26/09 Home" note. That is AUTHORING rule 5. It is not a skip and not a deletion. Then fix the header comment's "Two `test.fail()`s" line.
      Files: `tests/e2e-app/specs/02-dashboard.spec.ts`.
      Verify: `curl -s -o /dev/null -w '%{http_code}\n' http://localhost:5173/app` prints `200`. Then run the "02-dashboard" command under Commands. The console-400 failures are gone, and L471 passes as a normal test.

- [ ] 3. **Merge For you, switch to text buttons, and gate the caught-up line (D1, D2, D3, D5; findings 1–5).**

      In `Dashboard.tsx`:

      1. **Imports.** Add `useId` from `react`, `Chip` from `../ui`, and `missingOf`, `NOTHING_MISSING` and the `Missing` / `Incomplete` types from `../homeGaps`.
      2. **`OrderRow`.** Change `<Link className="btn">Open order` to `className="linkbtn"` with the order `aria-label` from the A11y table.
      3. **`WaitingRow`.** Change `{go && <Link className="btn">…` to `className="linkbtn"` with `aria-label={`${go.label}: ${w.title}`}`. Add a one-line comment: three rows say "Open record", and a screen reader's links list must not hold three identical names.
      4. **New `GapRow({ r, gaps }: Incomplete)`.** Markup:
         - `<div>` containing `<div className="grow gapline">`, which holds `<h4><Link to=/app/records/:id style={{color:'inherit',textDecoration:'none'}}>{r.title}</Link></h4>` and `<span className="gapchips">{gaps.map(g => <StatusChip key state="warn">{g.label}</StatusChip>)}</span>`
         - then `<Link className="linkbtn" to={gaps[0].to} aria-label={`${gaps[0].fix}: ${r.title}`}>{gaps[0].fix}</Link>`
         - no leading icon: the panel's indent shows the hierarchy.
      5. **New `MissingRow({ missing }: { missing: Missing })`.** Write a doc comment covering D1 and D2. Then:
         - `const [open, setOpen] = useState(false); const id = useId();` and ids `${id}-t`, `${id}-l` and `${id}-p`
         - `done = missing.owned - missing.open.length`, `pct = Math.round(done / missing.owned * 100)`
         - `shown = missing.listed.slice(0, GAP_ROWS)`, `more = missing.listed.length - shown.length`
         - Markup:
           - `<div>`
           - leading `<span className="muted" style={{display:'flex',paddingTop:'0.125rem'}}><Icon name="warn" size={19} /></span>`
           - `<div className="grow gapline">` holding:
             - `<h3 id={`${id}-t`}>Missing details</h3>`
             - `<span className="note num">{done} of {missing.owned} complete</span>`
             - `<span className="gaptrack" aria-hidden><span style={{ width: `${pct}%` }} /></span>`
             - `<span className="gapchips">{missing.tally.map(t => <Chip key={t.label}><span className="num">{t.n}</span> {t.label}</Chip>)}</span>`
           - only when `missing.listed.length > 0`:
             - `<button type="button" className="linkbtn" aria-expanded={open} aria-controls={`${id}-p`} aria-labelledby={`${id}-l ${id}-t`} onClick={() => setOpen(v => !v)}><span id={`${id}-l`}>{open ? 'Hide' : 'Show all'}</span></button>`
             - `<div id={`${id}-p`} className="gappanel" hidden={!open}><div className="rows">{shown.map(x => <GapRow key={x.r.id} {...x} />)}</div>{more > 0 && <p className="note" style={{ margin: 'var(--space-md) 0 0' }}>{plural(more, 'more property', 'more properties')} ·{' '}<Link className="link accent" to="/app/properties">All properties</Link></p>}</div>`
      6. **`ForYou`.** New props: `{ data, orders, ordersKnown, missing }: { data: Portfolio; orders: Order[]; ordersKnown: boolean; missing: Missing | undefined }`.
         - `gaps = missing?.open.length ?? 0`, `total = data.waiting.length + orders.length + gaps`
         - If `total === 0`: return `null` unless `ordersKnown && missing`; otherwise return the existing `section.card.foryou-clear` markup with the copy unchanged.
         - Otherwise: `Card title="For you" aside={total}` holding `.rows` with orders, reminders and `{missing && gaps > 0 && <MissingRow missing={missing} />}`.
         - Rewrite the comment above `ForYou` (drift 2): one card for everything that needs the owner; the count is all three; the caught-up line appears only when all three are empty and both reads have answered.
      7. **`GAP_ROWS`.** Change it to `3`. Delete the `MissingDetails` function and its `<MissingDetails />` usage.
      8. **`Dashboard()`.**
         - After `const orderQ = useOrders();`, add `const propsQ = useProperties(EMPTY_FILTER);` with a short comment saying it was moved up from Missing details so it fetches with the portfolio and For you is whole when it draws. It stays above the early returns, as the rules of hooks require.
         - After the `Failed` return, add `const ordersKnown = orderQ.data !== undefined;` and `const missing = propsQ.data ? missingOf(propsQ.data.cards, data.waiting) : undefined;`.
         - Main branch: `<div className="sec sec-first"><ForYou data={data} orders={needYou} ordersKnown={ordersKnown} missing={missing} /></div>`.
         - First run: `<ForYou … ordersKnown={ordersKnown} missing={NOTHING_MISSING} />`.

      In `w360.css`, in the Home block after `.shortcuts` (around line 579):
      - Replace `.gapchips` with `display: inline-flex; flex-wrap: wrap; gap: 0.375rem;` (no top margin: chips now sit beside the title).
      - Add, with one comment block describing MissingRow:
        - `.gapline { display:flex; flex-wrap:wrap; align-items:center; gap: var(--space-2xs) var(--space-sm); min-width:0 }`
        - `.gapline h4 { font-size:0.9375rem; font-weight:700; margin:0 }`
        - `.gaptrack { display:inline-block; width:6rem; height:0.5rem; overflow:hidden; border:1px solid var(--w-line); border-radius:var(--radius-pill); background:var(--w-surface-2) }`
        - `.gaptrack > span { display:block; height:100%; background:var(--w-ink-3) }`
        - `.gappanel { flex-basis:100%; min-width:0; padding-left: calc(1.1875rem + var(--space-md)) }`, with the comment "no `display` here: the `hidden` attribute must win"
        - `.gappanel > .rows { border-top:1px solid var(--w-line) }`
      - Every rule starts `.w360 `. Use tokens only, with no colour literals and no weights other than 400/700.

      Rewrite these spec tests to the new behaviour (orchestrator (b)). Keep their titles.
      - **Locators.** `waitingPanel` becomes `forYou`, and `waitingRows` becomes `reminderRows`.
      - **Link names.** `row.getByRole('link', { name: w.title })` gains `exact: true`, because the action's name now contains the title.
      - **Head counts.** Each `.pagehead p.note` "N things waiting on you" check becomes the topbar link `getByRole('link', { name: 'Notifications, N waiting', exact: true })`, or `name: 'Notifications', exact: true` when nothing is waiting. The bell counts `portfolio.waiting.length`, and the seeded inbox has `unread: 0`.
      - **Notifications link.** Each in-panel `Notifications ›` check becomes the topbar link `getByRole('link', { name: /^Notifications/ })` with href `/app/notifications`.

      The tests (baseline line in brackets):

      | Test (baseline line) | Change |
      |---|---|
      | every thing waiting on me… [616] | assert `Open record: ${w.title}` exact per row |
      | a waiting row opens… [645] | locators only |
      | a reminder about something I shared out… [654] | name `Open Documents: The advocate's link to 4 papers expires tomorrow` |
      | a reminder the data cannot place… [674] | locators only |
      | an empty waiting list says so… [697] | waiting `[]`, `world.set('orders', [])`, `properties` = `listOf(only(ID.parcel, ID.flat))` (no gaps). Wait for `overview(page)`, then: `caughtUp` contains "You're all caught up" and "Nothing needs your attention."; the `forYou` card count is 0; topbar Notifications link visible. |
      | all ten dismissal tests [712–941] | locators only. In [804] also assert the For you count goes from 5 to 4 (`forYou(page).locator('.cardhead .num')`, with a comment that the count has no role of its own) and `Notifications, 2 waiting`. In [907], after the Sy 88 reminder is cleared, assert `missingRow` gains its `Show all Missing details` button (D2 releases the property). |
      | dismissing the last reminder… [836] | `world.set('orders', [])` and no-gap `properties`, then after the dismiss: `caughtUp` "You're all caught up", and topbar `Notifications` (exact) |
      | an invitation can arrive before my first record does [1016] | For you contains the invite; `reminderRows` 1; `Notifications, 1 waiting`; `missingRow` count 0, even though the sealed `properties` answer carries Sy 88's gap; `overview(page)` count 0 |
      | @phone the dashboard still hands me every waiting row… [1157] | `.strip > *` becomes `overview(page)` visible; `reminderRows` 3 |

      Add these new tests in the For you section. Each title is a behaviour sentence.

      - **NEW-1** "For you counts orders, reminders and properties missing details, and says Missing details once". Seeded data:
        - count `5` (1 order, 3 reminders, 1 gap property)
        - `missingRow` contains `2 of 3 complete` and `1 Not on the map`
        - no `Missing details` h2 card
        - `missingRow` has no button (Sy 88 is named by a reminder)
        - no `Sy 88` exact link inside For you
        - `caughtUp` count 0
      - **NEW-2** "nothing waiting but a property off the map is not all caught up" (finding 1). Waiting `[]`, orders `[]`, seeded properties:
        - For you count `1`
        - `caughtUp` count 0
        - after clicking `Show all Missing details`, one h4 `Sy 88`, chip `Not on the map`, and link `Set location: Sy 88` with href `/app/records/${ID.plot}/map`
      - **NEW-3** "For you says nothing while the property list is still coming". `properties` = `World.never()`, waiting `[]`, orders `[]`. After `overview(page)` is visible: `caughtUp` 0 and `forYou` 0.
      - **NEW-4** "a property list that does not load drops Missing details and keeps the rest of For you". `properties` = `World.gqlError('the property list is not answering')`, seeded reminders:
        - For you count `4`
        - `reminderRows` 3
        - `missingRow` 0
        - `caughtUp` 0
      - **NEW-5** "Show all says whether it is open and what it opens, and shows three at most". `properties` = `listOf` of 5 owned clones of `ID.plot` (`id: w-gap-${i}`, `title: Sy ${500+i}`), waiting `[]`, orders `[]`:
        - `0 of 5 complete` and `5 Not on the map`
        - the toggle has `aria-expanded="false"`, and the element named by `aria-controls` (locate it with `[id="…"]`) is hidden
        - clicking it gives `Hide Missing details`, `aria-expanded="true"`, a visible panel, 3 h4s, `2 more properties`, and an `All properties` link to `/app/properties`
        - clicking Hide hides the panel again
        - from the keyboard: focus the toggle, then `Enter` opens and `Space` closes
      - **NEW-6** "a property a reminder already names is listed once, and its documents action says where it goes" (D2 and D3). Waiting = `[base.waiting[1]]` (Sy 88); orders `[]`; properties: `ID.parcel`, `ID.plot`, and `ID.flat` with `paperCount: 0`:
        - count `3`
        - `1 of 3 complete`, chips `1 Not on the map` and `1 No documents`
        - expanded: exactly one h4, `Flat 4B, Sai Residency`, with link `Open Documents: Flat 4B, Sai Residency` to `/app/records/${ID.flat}`
        - no `Sy 88` in the panel and no `Add document` link in the panel
        - the page-level `Add document` link count is 1, with href `/app/papers?do=add`
      - **NEW-7** "row actions in For you are text buttons, each named for its own row" (finding 5). Seeded data:
        - `forYou(page).locator('.btn')` count 0, with a comment that emphasis has no role, so the class is the only handle
        - the `Shortcuts` nav has `.btn.primary` 1 and `.btn` 4
        - `Open order: W-2105 · Sy 214/2` exact count 1
        - `Open record: ${w.title}` exact count 1 for each seeded reminder

      Files: `apps/web/src/w360/pages/Dashboard.tsx`, `apps/web/src/w360/w360.css`, `tests/e2e-app/specs/02-dashboard.spec.ts`.
      Verify:
      - `bun run --filter @pattadar/web typecheck`, `bun run scripts/shared-components-tests.ts` (Dashboard stays at `card: 2`; adds no `className="card…"` and no ui.tsx-named components) and `bun run scripts/typography-tests.ts` all pass.
      - The 02-dashboard command passes every test in this step's list.

- [ ] 4. **Overview: even grid and "—" for no value (D4; findings 6–8).**

      In `Dashboard.tsx`:
      - Change `Overview`'s props to `{ label, value, say, note, to }`: drop `words`, and add `say?: string` with a doc comment ("what a screen reader hears instead of a glyph value").
      - Render `<span className="ov-value num" aria-hidden={say ? true : undefined}>{value}</span>{say && <span className="sr-only">{say}</span>}`.
      - The Estimated value call becomes `value={valued ? inr(data.worthNow) : '—'} say={valued ? undefined : 'not set'}`. Keep its `note`.
      - Header comment (drift 1, lines 4–8): keep the 26/09 sentence and replace "Value appears only when something has been valued" with a factual 02/10/2026 note:
        - For you now holds orders, reminders and Missing details in one card, and says "You're all caught up" only when all three are empty.
        - The Estimated value card is always one of the four and reads "—" while nothing is valued.
        - Value by village appears only when something has been valued.
        - Cite `.local/ux-audits/2026-10-02-w360-home`.
        - No approval wording.
      - The `valued` comment: a nought market value is an unknown figure, "—" (design.md § Property tabs), never ₹0 and never a loss; Value by village is drawn only when something has been valued.

      In `w360.css`, replace `.overview`'s `grid-template-columns` with `repeat(2, minmax(0, 1fr))`. Add `@media (min-width: 840px) { .w360 .overview { grid-template-columns: repeat(4, minmax(0, 1fr)); } }`, and a comment explaining that auto-fill 13rem laid five tracks for four cards at 1512 and that `.overview` is Home-only.

      Spec, new tests:
      - **NEW-8** "Estimated value with nothing valued is a dash, and a screen reader hears not set". Set `worthNow: 0`:
        - `overview(page).getByRole('link', { name: /^Estimated value\s*not set/ })` is visible
        - it contains `—` and `Bought for ₹94.0 L`, and does not contain `Not valued`
        - in a seeded run, the same card has no `not set`
      - **NEW-9** "the four overview cards share one row at 1512 with no empty track". Take the bounding boxes of the four `overview(page).getByRole('link')`:
        - same `y`
        - widths within 1px
        - the last right edge within 1px of `overview(page).locator('.overview')`'s right edge (a class handle, with a comment)
        - then `page.setViewportSize({ width: 900, height: 844 })` (the narrowest window that still has the rail): still one row, and `scrollWidth - clientWidth <= 1`
      - **NEW-10** "@phone the overview cards sit two by two on a phone". Add it inside the existing pinned 390 describe: cards 0 and 1 share a `y`, card 2 is below them, and cards 2 and 3 share a `y`.

      Files: `apps/web/src/w360/pages/Dashboard.tsx`, `apps/web/src/w360/w360.css`, `tests/e2e-app/specs/02-dashboard.spec.ts`.
      Verify: typecheck passes; `bun run scripts/a11y-web-tests.ts` passes (every `var(--…)` resolves and the TSX has no literals); NEW-8 to NEW-10 pass in both projects where they are tagged.

- [ ] 5. **Compact Recently opened tile (finding 9).**

      `RecordTile` becomes `<Link className="rec compact" to=…>`, holding:
      - `<span className={`rec-kind ${art}`}><Icon name={rec.classification} size={20} /></span>`, keeping the existing `art` = `built` / `shop` / `''` computation
      - `<div className="meat">` with the unchanged `<h3>` and `p.note`

      Add a doc comment giving the reason: Home draws no photo, map or scan, so the band was only ever the placeholder (decoration on an app page). The grid becomes `<div className="cards compact">`.

      In `w360.css`, after the `.rec .figure` rule (line 1179), add one comment block followed by:
      - `.w360 .cards.compact { grid-template-columns: repeat(auto-fill, minmax(min(100%, 15rem), 1fr)); }`. This gives 4 tracks in the 1192px column at 1512, and fewer as the column narrows. Recently opened holds at most 4, because `web360.py:6055-6060` serves `rows[:4]`.
      - `.w360 .rec.compact { display:flex; align-items:flex-start; gap:var(--space-sm); padding:var(--space-sm) var(--space-md); }`
      - `.w360 .rec.compact .meat { padding:0; min-width:0; }`
      - `.w360 .rec-kind { display:flex; flex:none; padding-top:0.125rem; color: color-mix(in oklab, var(--w-accent) 55%, transparent); }`
      - `.rec-kind.built` with `--w-info` at 55%, and `.rec-kind.shop` with `--w-danger` at 50%. These are the band's own icon colours.

      Don't change `.cards`, `.rec`, `.rec .art` or Properties.

      Spec ((b): Recently opened is touched):
      - [510]: `All properties ›` becomes `recent(page).getByRole('link', { name: 'All properties', exact: true })`.
      - [535] and [551]: `.art` class checks become `.rec-kind` (keep the "class is the only handle" comment, reworded).
      - [598]: the `.strip > *` wait becomes `overview(page)` visible, and `All properties ›` becomes `All properties` (exact).
      - Add **NEW-11** "recently opened tiles carry no placeholder band, and four share a row at 1512":
        - seeded: `page.locator('.cards .rec .art')` count 0 and every tile ≤ 110px tall
        - with `recent` set to 4 cards (`[...base.recent, structuredClone(CARDS[3])]`): 4 tiles with equal `y` and widths within 1px

      Files: `apps/web/src/w360/pages/Dashboard.tsx`, `apps/web/src/w360/w360.css`, `tests/e2e-app/specs/02-dashboard.spec.ts`.
      Verify: `bun run scripts/shared-components-tests.ts` passes; the recent tests and NEW-11 pass.

- [ ] 6. **Phone check for Missing details, and the remaining stale assertions (orchestrator (c)).**

      Add **NEW-12** "@phone Missing details opens to one-line rows that stay on the screen" inside the pinned 390 describe. Use NEW-2's world and open the disclosure, then:
      - `scrollWidth - clientWidth <= 1`
      - `const coarse = await page.evaluate(() => matchMedia('(pointer: coarse)').matches)`. If `coarse`, the toggle and `Set location: Sy 88` are each ≥ 44px tall. Otherwise add `test.info().annotations` saying the emulator reports a fine pointer.

      Then make **selector or copy fixes only**. A fix qualifies when the same fact is still on Home and only its element or words changed. Never delete or skip a test. Predicted classification (confirm by running):

      | Baseline line | Fix |
      |---|---|
      | 187 | the `.strip > *` wait becomes `overview(page)` visible |
      | 202 | the positive check becomes `.pagehead p.note` with text `8 properties · 7.50 ac · 27 documents`, plus the Properties card note containing `3 land parcels`; the negatives stay |
      | 250 | the positive check becomes `.pagehead p.note` containing `5 properties · 7.50 ac` |
      | 373 | the panel's `Estimated value today` becomes the Overview `Estimated value` link; `Paid ₹94.0 L in total.` becomes that link's `Bought for ₹94.0 L`; `27 documents filed…` becomes `.pagehead p.note` containing `27 documents`; the bar checks stay |
      | 1041 | `Loading your dashboard…` becomes `Loading your home page…`; `Your dashboard did not load` becomes `Your home page did not load`; the rail `Dashboard` becomes `Home` (exact); `rail…Notifications` becomes the topbar `getByRole('link', { name: /^Notifications/ })` |
      | 1064 | the failure copy becomes `Your home page did not load` |
      | 1080 | the failure copy, and `.strip > *` count becomes `overview(page).getByRole('link')` count 4 |
      | 1100 | the failure copy, and `Loading your home page…`, and the `.strip` wait becomes Overview |
      | 1130 | the failure copy, and `Loading your home page…` |

      Leave these tests as they are and list them. Each needs more than a selector or copy change, or protects a rule the current Home no longer keeps:

      | Baseline line | Cause |
      |---|---|
      | 120 | the eyebrow, the owned-only managed/watched links, the two clocks and the built sq.ft are gone; the meta line counts managed and watched as properties, which is a pre-existing truthfulness question |
      | 158 | the head's land-clock line is gone |
      | 214 | the head waiting-count line is gone; the bell counts `waiting.length`, while the test sets `waitingCount` only |
      | 229 | the Overview folds flats and shops into "buildings", which breaks "named in its own words" (pre-existing) |
      | 262 | the stake line `Owned only · 2 watched` is gone |
      | 292, 312, 324, 349 | the server tiles strip is no longer drawn |
      | 423 | the empty-chart sentence was replaced by hiding the card; its head-clock assertion is also gone |
      | 441 (`test.fail`) | still passes as an expected failure: the defect it records is fixed in code, but its body asserts the removed sentence, so it needs a rewrite |
      | 498 | the Overview Documents card prints `0` (pre-existing product question) |
      | 967 | the eyebrow and the first-run meta line are gone |

      Write `.agents/tasks/w360-home-final-ux/after-test-report.md`:
      - a per-test table (title, baseline result, after result, class (a)/(b)/(c)/listed, cause)
      - the line "zero new failures vs before-test-baseline.md", with the proof
      - totals per project

      Files: `tests/e2e-app/specs/02-dashboard.spec.ts`, `.agents/tasks/w360-home-final-ux/after-test-report.md` (new).
      Verify: in the 02-dashboard run, every (a), (b), (c) and NEW test passes in `app` and, for `@phone`, in `phone`. Every remaining failure is on the baseline list and appears in the report with its cause.

- [ ] 7. **Full verification, and record the evidence.**

      Run every command under Commands, and append each result to `after-test-report.md`, comparing with `before-guards.md`. Also record:
      - the interaction count (below)
      - functional acceptance: Home's only mutation is the reminder dismiss (`dismissWaiting`), proven end to end by the ten dismissal tests, including the refused path [941] and the in-flight paths [854, 877]; the reads are portfolio, orders and properties, including pending (NEW-3) and failed (NEW-4); the gap actions and shortcuts only navigate
      - the reviewer's delta: `diff -ru .local/impl-scratch/home-final-baseline/<path> <path>` for `Dashboard.tsx`, `w360.css` and `02-dashboard.spec.ts`, plus the two new files, excluding everything in orchestrator notes §1

      Fix any red that this change caused. Report pre-existing red only.
      Files: `.agents/tasks/w360-home-final-ux/after-test-report.md`.
      Verify:
      - typecheck, `bun test apps/web/src`, every `scripts/*-tests.ts`, `icon-guard` and `ux-guards` match or beat step 0
      - the web build succeeds
      - the 26-one-font `/app` test passes in both projects

- [ ] 8. **Governance and cleanup notes, for the final report.**

      State the five dimensions:
      - **Docs:** the Dashboard header and ForYou comments were corrected. `design.md` is unchanged: no new vocabulary is introduced, and editing the authority is Reddy's call. `docs/specs/2026-08-15-web-360-design.md` doesn't describe Home's sections.
      - **Architecture:** same queries and same boundaries. The `properties` read moved from a child component to the page.
      - **Security and privacy:** no auth, storage, PII or route changes. The links go to existing authenticated routes.
      - **Testing:** as recorded.
      - **Cleanup:**
        - Remove `.local/impl-scratch/home-final-pw-*` output folders once the reviewer has approved. The `after-and-compare` and `cleanup-and-report` steps may own this.
        - Stop any agent-started dev server.
        - Never touch the user's `:5173` or the pre-existing `apps/web/dist`. The build refreshes it, and it is git-ignored.

      Residuals to report:
      - the "Open Documents" label going to two destinations (lock reminder vs gap)
      - the hover-lift drift
      - pre-existing: `.sec-first` leaves For you flush under the SetupChecklist card when setup tasks are open
      - Overview tracks are tight at 900–1000px (verified, no clipping)
      - `tests/e2e-web360` (not run: it needs a disposable `TEST_PG_DSN`) still asserts the pre-26/09 Home, and its `getByRole('link', { name: SIGNATURE })` will need `exact: true` because of the new action names
      - the stale 02 tests listed in step 6

      Files: none.
      Verify: `git status --short` shows only this task's files plus the pre-existing set from the setup manifest and orchestrator notes.

---

## Commands (repo root unless stated)

```sh
bun run typecheck
bun run --filter @pattadar/web typecheck
bun test apps/web/src/w360/homeGaps.test.ts
bun test apps/web/src
for s in scripts/*-tests.ts; do echo "── $s"; bun run "$s" || echo "FAILED: $s"; done   # includes typography-tests.ts, shared-components-tests.ts, a11y-web-tests.ts
bun run scripts/icon-guard.ts
bun run scripts/ux-guards.ts
bun run --filter @pattadar/web build

# Sealed browser suites. They use the user's dev server on :5173: check it, never start or stop it.
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:5173/app        # must print 200
cd tests/e2e-app && APP_WEB_URL=http://localhost:5173 ./node_modules/.bin/playwright test \
  specs/02-dashboard.spec.ts --project=app --project=phone --reporter=line \
  --output=/Users/reddy.sh/reddy.sh/projects/pattadar-platform/.local/impl-scratch/home-final-pw-after \
  2>&1 | tee /Users/reddy.sh/reddy.sh/projects/pattadar-platform/.local/impl-scratch/home-final-after-02.log
cd tests/e2e-app && APP_WEB_URL=http://localhost:5173 ./node_modules/.bin/playwright test \
  specs/26-one-font.spec.ts --project=app --project=phone -g "@phone /app draws every word" --reporter=line \
  --output=/Users/reddy.sh/reddy.sh/projects/pattadar-platform/.local/impl-scratch/home-final-pw-font
```

- `--reporter=line` keeps the ignored `results.json` and `playwright-report/` from being overwritten.
- If `:5173` isn't answering:
  1. Start an agent-owned server in the background: `cd apps/web && bun run dev -- --port 5181 --strictPort`.
  2. Use `APP_WEB_URL=http://localhost:5181`.
  3. Stop it when done, and say so in the report.

## Interaction count (design-system-governance step 6), to record in the report

| Action | Count | Notes |
|---|---|---|
| Add property | 1 | the shortcut; the first-run Empty action replaces it |
| Add document | 1 | the shortcut; the gap row no longer reuses the label |
| Order a service | 1 | |
| Share documents | 1 | |
| Open order | 1 per order | each a different target |
| Open record / Open Documents | 1 per reminder | each a different target |
| Gap fixes | ≤ 3 | each a different property |
| Show all | 1 | |
| All properties | 1–2 | same destination: the Recently opened head, plus the overflow line when more than 3 are listed; the overflow line already existed |
| All activity | 1 | |
