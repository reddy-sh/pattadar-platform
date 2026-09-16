# BUILD SPEC — the one-service screen

**Spine:** `order-receipt` ("Order sheet"). Everything below is that proposal with its five verified defects fixed, every judge "keep" grafted in, and every conflict decided. Line numbers below were re-verified against the working tree today; where the source proposals drifted, these numbers win.

**Three commits, in order.** (1) web route + links + redirect. (2) web screen + copy + CSS + specs. (3) API strings. Commit 2 is the big one and must not be split, because the copy and the structure are asserted by the same specs.

---

## 1. The route and the vocabulary

### 1.1 The route

`/app/services/:id` and `/app/services/:id/pay`.

In `apps/web/src/routes.tsx`:

- **:312-313** — `{ path: 'tickets/:id', element: suspended(W360Ticket) }` and `{ path: 'tickets/:id/pay', element: suspended(PaymentsCheckout) }` are **deleted from their current position** and re-declared immediately after **:299** (`{ path: 'services', element: suspended(W360Services) }`) as:

```tsx
{ path: 'services', element: suspended(W360Services) },
{ path: 'services/:id', element: suspended(W360Ticket) },
{ path: 'services/:id/pay', element: suspended(PaymentsCheckout) },
```

That is the exact shape of the working `papers` / `papers/:id` pair at :305-309.

- **New component**, beside `ToRecord` at :211-213:

```tsx
function ToService({ pay }: { pay?: boolean }) {
  const { id } = useParams();
  return <Navigate to={`/app/services/${id}${pay ? '/pay' : ''}`} replace />;
}
```

- **Redirects** go in the legacy block whose comment at **:348** already states the policy ("The old vocabulary still resolves"), alongside `parcels/:id` at :351:

```tsx
{ path: 'tickets/:id', element: <ToService /> },
{ path: 'tickets/:id/pay', element: <ToService pay /> },
```

The redirect is **permanent and mandatory**: `apps/ios/Pattadar/Sources/ServicesScreen.swift:251` hard-codes `https://pattadar.com/app/tickets/<id>/pay` in a shipped binary. That Swift line belongs to the iOS session; the redirect is what holds it together and nothing in this change touches iOS.

- **Nine in-app links** rewritten so they pay no client navigation: `PaymentsCheckout.tsx:127`, `Ticket.tsx:821` (navigate) and `:1345` (Link), `Orders.tsx:255`, `Wallet.tsx:88`, `OrderService.tsx:663/963/1052`, `RequestWork.tsx:277`.

- **No Shell.tsx edit.** Only the Dashboard entry carries `end: true` (Shell.tsx:266), so `/app/services` (Shell.tsx:272) lights for `/app/services/:id` the way `/app/papers` already lights for `/app/papers/:id`. This closes the live `test.fail` at `tests/e2e-app/specs/01-shell.spec.ts:142-150`, which names `/app/services/:id` as the remedy.

- **Do not rename:** the GraphQL field `ticket`; the mutations `acceptTicket` / `cancelTicket` / `fundTicket` / `sendBackTicket` / `dispatchTicket` / `startTicket`; the TS types `TicketView` / `TicketEvent` / `TicketDeliverable` / `TicketDispatch` / `TicketLedgerRow` / `TicketMoney`; the tables `ticket_deliverables` / `ticket_dispatches` / `ticket_events`; the HTTP path `/payments/tickets/{id}` (payments.py:123,177,182); the component file `apps/web/src/w360/pages/Ticket.tsx`; and the reference `PT-nnnn` (derived at ticketing.py:513-533, already in workers' SMS inboxes at ticketing.py:921-925, and containing no "ticket" token).

### 1.2 The vocabulary rule

Two nouns, one meaning each.

- **service** = the thing that was ordered. The route, the breadcrumb, the list, and the three page-level states — because those three name *the thing you tried to open*.
- **job** = the work running against it. Every body sentence. The app already says "job" 184 times to "ticket" 53; nothing that says "job" changes.
- **ticket** is retired from all user-visible text.

### 1.3 Every user-visible string that changes

**apps/web/src/w360/pages/Ticket.tsx**

| Line | Old | New |
|---|---|---|
| 60 | `That was not recorded. Nothing was added to the ticket — check what you typed and try again.` | `That was not recorded. Nothing was added to this job — check what you typed and try again.` |
| 122 | `… the one it replaces is kept on this ticket.` | `… the one it replaces is kept on this job.` |
| 387-388 | `Anything they already sent stays on this ticket.` | `Anything they already sent stays on this job.` |
| 786 | `<Loading h="70vh" what="this job" />` | `<Loading h="70vh" what="this service" />` |
| 787 | `<Failed what="This ticket" …>` | `<Failed what="This service" …>` (renders "This service did not load") |
| 791 | `<Empty … title="This ticket is not here">` | `title="This service is not here"` |
| 792-795 | `Anything you paid against it is still in your wallet.` | `Anything you set aside against it is still in your wallet.` |
| 1113-1114 | `File it on the ticket first` | `File it on the job first` |
| 1194 | `… what you will be reading on this ticket in six months.` | `… what you will be reading on this job in six months.` |
| 1271-1272 | `Everything already recorded stays on the ticket.` | `Everything already recorded stays on this job.` |
| 1401-1405 | `Nothing has left the building. When you send this out, Pattadar writes to person through a revocable work link and keeps a copy. If delivery is not configured, copy the recorded link and send it yourself.` | `Nothing has left the building.` — the rest is deleted here and the one sentence worth keeping is **added verbatim** to the Send dialog's intro: `If delivery is not configured, copy the recorded link and send it yourself.` (The deleted middle sentence contains a live copy bug — "Pattadar writes to person" — which is why it is not relocated whole.) |
| 1417 | `This order was placed before the form asked for details.` | `No options were set on this order.` (the old line is false for an EC, whose three catalogue fields are all optional) |

Lines 786/787/791 together close the `test.fail` at `tests/e2e-app/specs/14-ticket.spec.ts:396-405`.

**Elsewhere in apps/web**

| File:line | Old | New |
|---|---|---|
| Orders.tsx:84 | `Open the ticket and send this to someone` | `Open the service and send this to someone` |
| Orders.tsx:255 | `Open ticket` | `Open the service` |
| PaymentsCheckout.tsx:127 | `← Back to the ticket` | `← Back to the service` |
| PaymentsCheckout.tsx:128 | `Ticket payment` | `Service payment` |
| PaymentsCheckout.tsx:135 | `… reserved for this ticket until settlement.` | `… reserved for this job until settlement.` |
| pages/legal/TermsPage.tsx:12 | `Cancellation and settlement status are shown on the ticket` | `… are shown on the service` |
| Desk.tsx:259, DeskJob.tsx:174, DeskJob.tsx:291, DeskAssociate.tsx:246, DeskAssociate.tsx:825 | `ticket` | `job` (operator surfaces; the desk's own nav already says Jobs) |

**services/api (commit 3)**

`payments.py:92,132,134,137,142,145,163,204,277,279,282,363,394` (HTTPException detail) → `ticket` becomes `service` where the sentence names the thing ordered (`Ticket not found` → `Service not found`) and `job` where it names the work. `payments.py:397` → `Captured payment reserved for this job`; `payments.py:405` → `Refund of a payment captured after the job closed` (both are ledger `note` values rendered verbatim at `Wallet.tsx:127`). `payments_provider.py:137,166` → `job`. `web360.py:6761` `Open checkout to fund this ticket` → `Open checkout to fund this job`.

Ledger notes are **stored** text: rows written before this deploy keep their old wording. Do not backfill — a backfill rewrites history. See open question 1.

### 1.4 New copy (all of it)

```
Quiet banner, somebody has it (t.quiet) — unchanged sentence, new third button
  buttons: "Send it again"  "Take them off this job"  "Cancel this job"

Quiet banner, nobody has it (new shape)
  title:  Nothing has happened for {quietDays} days.
  body:   Nobody has been put on this yet. Pick somebody below, or cancel it
          and get what you set aside back.
  buttons: none — the roster is the next block

What happens next (plain card, nothing is waiting on you)
  {t.assignee} has this. Nothing is needed from you.
  — when nobody has it and the job is closed, this card is not drawn at all

How it ended (closed job)
  title:  How it ended
  body:   {t.outcomeNote}
  note:   Accepted {t.acceptedAt}          (only when acceptedAt is set)

Who can do this (the promoted roster card's intro, when nobody has it)
  Nobody is on this yet. Put one of the people below on it, or name somebody
  who has worked on your records before.

Nothing has come back yet (dashed card)
  {emptyCame}  — verbatim, unchanged, from Ticket.tsx:967-973

Sent out, empty (dashed, rail)
  Nothing has left the building.

On this land (rail card)
  title:  On this land
  link:   Open the record ›        → /app/records/{recordId}
  link:   Everything ordered on {recordTitle} ›   → /app/records/{recordId}/services

Take them off this job (new kebab item + dialog)
  title:  Take them off this job?
  body:   The job goes back to Placed and {inrFull(t.money.held)} stays set
          aside. It is not a cancel and it releases nothing — you can put
          somebody else on it straight away.
  footer: "Keep them on it"  /  "Take them off"

Send dialog intro — the existing paragraph at Ticket.tsx:1045-1052 verbatim,
plus one appended sentence:
  If delivery is not configured, copy the recorded link and send it yourself.
```

**Never reworded, rendered verbatim wherever they appear:** `money.headline`, `money.honesty`, `d.goesTo`, `e.headline`, `t.statusLabel`, `emptyCame`, the accept footer's "Keeping N of M · …" line, both existing dialog bodies, and the four "why this button is off" notes at :1093, :1189, :1246, :1282 — those stay on screen and never become a `title=`.

---

## 2. The header

Five rows, ~96px, and the status word appears **exactly once**.

```tsx
<Crumbs trail={[
  { label: 'Services', to: '/app/services' },
  { label: t.recordTitle, to: `/app/records/${t.recordId}` },
  { label: t.ref },
]} />

<header className="pagehead">
  <div className="grow">
    <h1>{t.title}</h1>
    <p className="lede" style={{ marginTop: '0.375rem' }}>
      Ordered {ddmmyyyy(t.createdAt)}
      {t.assignee && <> · with {t.assignee}</>}
      {t.dueDate && <> · due {t.dueDate}</>}
    </p>
    <div className="row tight" style={{ marginTop: 'var(--space-sm)' }}>
      <State state={t.statusState}>{t.statusLabel}</State>
      {since && <span className="note">since {since}</span>}
    </div>
  </div>
  <div className="actions">
    {menu.length > 0 && <Menu label={`Actions for ${t.ref}`} items={menu} />}
  </div>
</header>
```

`const since = movedOn(t) === ddmmyyyy(t.createdAt) ? '' : movedOn(t);` — on a fresh job whose only status event is the placement, `movedOn()` returns `createdAt` and the clause would print the same date the lede already prints one line above. That is why it is conditional.

**Deleted from the header:**

- **`<Rail stage={t.stage} steps={ORDER_STAGES} word={t.statusLabel} />` at :993**, and the `ORDER_STAGES` import. It printed `t.statusLabel` a second time at the identical 13px in the identical `oklch(0.58 0.015 50)`, 6px from the pill, for all four pre-delivery statuses; `stage` is non-monotonic (`changes` is pip 2, `submitted` is pip 3) so the pips run backwards; and `statusState` is `unknown` for those four, so neither device carried colour. The pips are the half that dies because `State` is the one carrying the colour axis (warn / good / bad). **`Rail` and `ORDER_STAGES` stay exported from ui.tsx** — `Orders.tsx:186` still uses them in a list row.
- **The `.eyebrow` at :982** — `ref` and `recordTitle` were each printed twice within two lines of the Crumbs. `recordPlace` moves to the rail's "On this land" card, where the land is the subject.
- **The primary-button ternary at :998-1008.** The header carries **no primary button**. Every action lives in the footer of the card that owns the thing, on the row that owns it, or in the kebab (see §6). That kills the "scroll to a card already on screen" no-op, kills the triple-printing of one action across header, card and kebab, and means the phone reader's first tappable thing is the block that explains the consequence.

**The lede is byte-frozen** — `Ordered {date} · with {assignee} · due {dueDate}`, unchanged. It is asserted at `14-ticket.spec.ts:291-293` and `:298-300` and it is the correct identity line; rewording it buys nothing and costs two tests.

**Status is shown exactly once, and here is the audit:** the `State` pill in the header is the only place `t.statusLabel` is rendered. The next-move card never prints it. The trail prints `e.headline`, which is server-composed prose, never the status word. The rail's person card prints a date, not a state. The money card prints `money.headline`, which is a figure sentence.

---

## 3. The layout

### 3.1 The grid

Unchanged `.split`, with one opt-in modifier:

```html
<div className="split loose" style={{ marginTop: 'var(--space-md)' }}>
  <div className="stack"> … main column … </div>
  <aside className="stack"> … rail … </aside>
</div>
```

```css
/* Two columns of different heights is what every reference detail screen
   actually looks like. `.split` stretches its children and `.stack` then sets
   `align-content: start`, so every pixel one column runs longer than the other
   is drawn as blank canvas inside the shorter one — measured at 1224 x 852 =
   1,042,848px² on a placed job. `align-content: start` is the second half,
   because `main > .split { flex: 1 1 auto }` (w360.css:374) would otherwise
   spread the single grid row over the page's leftover height. `.orderflow.solo`
   carries the identical pairing at w360.css:3383-3387 for the identical reason.
   Opt-in by modifier only: eight screens share `.split`. */
.w360 .split.loose { align-items: start; align-content: start; }
```

Tracks stay `minmax(0, 1fr) 22rem`. No clamp, no `.split.solo`. **Decision, where two proposals conflicted:** the rail is not collapsed and is not re-sized, because with `align-items: start` the imbalance costs zero pixels in either direction, and a rail that appears and disappears with state reflows the whole page width on every transition. The extra width a bigger display brings now goes entirely to the main column, which is where the tables, the prose and the thumbnails are.

**Nothing is sticky, at any width, in either column.** Stated as a decision so no one adds it later: there is no control in the rail that the reader reaches for mid-scroll, so no grid child needs the `align-self: start` + `top: 3.5rem` + `max-height` / `overflow-y` escape, and the print block needs no `position: static !important` line.

**At ≤1200px** the existing rule at w360.css:670-673 collapses `.split` to one column and the `<aside>` falls under the main column. `.loose` is a no-op there.

### 3.2 Main column, in order

1. **The banner** — `.card.alert`, conditional (§4.1).
2. **The promoted block** — exactly one, `className="accent"`, removed from its canonical slot below; or, when nothing is waiting on the owner, the plain **"What happens next"** card (§4.2).
3. **What came back** — `Card`, only when `t.deliverables.length > 0` and not promoted (§4.3).
4. **Who can do this** — the roster, only when nobody holds it and `can('assign')` and `!t.closed`, and not promoted (§4.4).
5. **What was asked for** — `Card`, always (§4.5).
6. **What this costs** — `Card`, always, unless promoted (§4.6).
7. **Nothing has come back yet** — `.card.dashed`, only when `t.deliverables.length === 0 && !t.closed` (§4.7).
8. **Everything that happened** — the trail, always, last (§4.8).

The trail stays **inside the main column**, not in a full-width region below the split. That deletes the `.split.sized` / `.trail` CSS the source proposal wanted and the contradiction a judge caught in it (removing the stretch from the split and then handing the same stretch to a new last region). The day-nine reader is served by the banner at the top, which names who has not moved it and since when and offers all three remedies — not by a chronology halfway down the page.

### 3.3 Rail, in order

1. **Who is on it** — `Card`. Rendered only in the three person branches: an associate has it, a typed name has it, or the job is closed and nobody ever did. **When nobody holds an open job this card is not rendered at all** — the roster in the main column is the whole answer, and a rail card repeating "Nobody is on this yet" beside it is the double-print this redesign exists to delete.
2. **Sent out** — `Card` with the dispatch count as `aside` when there are dispatches; a bare `.card.dashed` one-liner when there are none.
3. **On this land** — `Card`: `t.recordTitle`, `t.recordPlace`, "Open the record ›", "Everything ordered on {recordTitle} ›". Today that second link is stranded at :1445-1452, after the dialogs, outside the split, and only on a closed job.

Every rail row except none passes the one-line-at-280px test. The rail holds no action that exists nowhere else.

### 3.4 At 375px

`.split` is already one column; source order is the order. `main`'s padding drops to `--space-md` at ≤900px and `.pagehead .actions` goes `flex: 1 1 100%` at ≤700px.

```
Crumbs
h1  (the service name)
lede  (ordered · with · due)
State pill  (+ "since" when it differs from the order date)
kebab, full width
── banner, if the job has gone quiet
── the promoted card, or "What happens next"        ← first tappable thing
── what came back / who can do this / what was asked for / what it costs
── "Nothing has come back yet" + "Record what came back"
── Everything that happened
── Who is on it   (name, discipline, and the one consented tel: link)
── Sent out
── On this land
```

The one thing a phone reader wants that is not hoisted is the assignee's phone number. It is not hoisted because the lede already carries `· with {t.assignee}` in the first 120px, and hoisting the whole person card above the owner's own order would put reference material above the decision. `.kv` already stacks label-over-value at ≤700px; the money ledger is `.rows`, not a `<table>`, so nothing needs `.scroll-x` and the page never scrolls sideways; `.btn` and `.btn.sm` already floor at 2.75rem.

---

## 4. Every panel and card

Universal rule, enforced per region: **loading, empty and failed are three separate branches with three different sentences.** `data ?? []` is banned everywhere it appears. No disabled control ever stands in for a loading state.

### 4.0 Page-level states (before any layout is drawn)

```tsx
if (isLoading) return <main><Loading h="70vh" what="this service" /></main>;
if (error)     return <main><Failed what="This service" error={error} boxed h="26rem" /></main>;
if (!data)     return <main><Empty boxed h="26rem" icon="clock" title="This service is not here">
  It was cancelled, or it belongs to someone else. Anything you set aside against it is
  still in your wallet.
</Empty></main>;
```

Three branches, three nouns, one word. `null` stays deliberately indistinguishable from not-found so a stranger's id cannot be probed.

### 4.1 The banner — `.card.alert`, main column, first

```ts
const nobody  = !t.assignedTo && !t.assignee;
const stalled = !t.closed && t.quietDays >= 4 && (t.quiet || (nobody && can('assign')));
```

`t.quiet` is `quietDays >= 4 && status in (sent, assigned, on_site)` (web360.py:4884), so a job that has sat at `placed` for nine days — the commonest failure, and the emptiest screen — gets no banner from the server. The second clause is the client filling that gap from two fields it already has, without inventing one.

- **Somebody has it** (`t.quiet`): existing copy at :1016-1034, unchanged — "Nothing has happened for {quietDays} days." plus the sentence naming who has not moved it and since when. **Three buttons now, not two**: `Send it again`, `Take them off this job`, `Cancel this job`. The banner's own sentence already promises three remedies ("you can send it again, put it on somebody else, or pull the job"); it has shipped two for its whole life.
- **Nobody has it**: the new copy in §1.4, no buttons — the roster is the next block.
- No loading / failed / empty states: it renders from `t` or not at all.

### 4.2 What happens next — plain `.card`, main column

Rendered **only when nothing is promoted** (i.e. nothing is waiting on the owner).

- Body, open job: `{t.assignee} has this. Nothing is needed from you.`
- Closed job: heading becomes **How it ended**, body is `{t.outcomeNote}`, with `Accepted {t.acceptedAt}` as a `.note` when `acceptedAt` is set. `outcomeNote` moves here from :1445-1452.
- If the job is closed and `outcomeNote` is empty, the card is not drawn.
- No buttons. No attention colour. No loading / failed / empty states.

### 4.3 What came back — `Card`, aside = deliverable count

Rendered only when `t.deliverables.length > 0`. Promoted to position 2 with `className="accent"` when `can('accept')`.

Body is unchanged in every respect: the `<Deliverable>` rows (thumbnail, `KIND_WORD · sent {date} by {submitter}`, `Goes to: {d.goesTo}`, the "File it as" select only when `fileTargets` is non-empty, the three-verdict row, the inline reject form), then the `.card.accent` accept footer at :1223-1258 with its live "Keeping N of M · {inr} recorded for settlement with {assignee}" line, its `pending.length > 0` gate and its on-screen disabled reason, then the inline send-back form.

**The accept footer stays where it is, under the items it accepts.** The promoted card is `.card` + `accent`; the footer inside it keeps its own `.card.accent`. Where that nests two accent rules, drop the outer one: when this block is promoted, the accent lives on the footer, not the wrapper, and the promotion is expressed by position alone. One ring, not two.

The `came` ref div stays as the block's outermost element so it is still a scroll target (see §9).

States: no async of its own. There is no empty branch — when the list is empty this card does not exist and §4.7 draws instead.

### 4.4 Who can do this — the roster, main column, full width

Rendered when `!t.assignedTo && !t.assignee && can('assign') && !t.closed`. Promoted to position 2 with `className="accent"` whenever it renders (nobody on an open job is always the ball being with the owner).

```tsx
<Card title="Who can do this" className="accent">
  <p className="note svc-say">Nobody is on this yet. Put one of the people below on it,
     or name somebody who has worked on your records before.</p>
  {onTheDesk && <p className="note svc-say">Pattadar's desk has this on its list to find
     somebody for.</p>}
  … one of the four states below …
  … then the "Or a name you have used" select, with its own three states …
</Card>
```

`onTheDesk` is the existing `ON_THE_DESK.has(t.dispatchState)` gate at :442. `dispatchState` is `''` on every job until phase 2, so that sentence does not render today; it is kept so that when phase 2 lands, the widest block on a brand-new order stops telling a paying customer that finding somebody is their problem.

**`useAssociatesForTicket`, four branches — this replaces `const roster = cards ?? []` at :633, which collapses loading and failed into empty:**

| state | render |
|---|---|
| loading | `<Loading h="7rem" what="who can do this" />` |
| failed | `<Failed what="The list of people" error={err} boxed h="7rem" onRetry={refetch} />` |
| loaded, zero rows | `<p className="note">Nobody has enrolled for this kind of work yet.</p>` |
| loaded, rows | `<div className="card" style={{padding:0}}><div className="rows boxed">` — one row per associate: name, `discipline · firm`, the server's `why` reasons as a `.note`, and `Put them on it` as the row's own button |

**`useAssignable`, three branches** for the "Or a name you have used" select:

| state | render |
|---|---|
| loading | `<Loading h="3rem" what="the names you have used" />` |
| failed | `<Failed what="The names you have used" error={err} boxed h="3rem" />` |
| loaded, zero names | the existing sentence at Orders.tsx:84's sibling — "Nobody has worked on your records yet, so there is no name to pick." |
| loaded, names | the select plus its confirm button |

Errors from `putOn` / `putOnName` render as `where: 'who'` (see §6.4). `WhoIsOnIt`'s separate `err` at :478 is deleted and folded into the page channel.

### 4.5 What was asked for — `Card`, always

Heading stays **"What was asked for"** verbatim. (Do not second-person it; the copy is byte-frozen, the rename buys nothing, and it costs two spec lines.)

Body, in order:

1. `<KV as="dl" rows={t.answers.map(a => ({ k: a.k, v: a.v }))} />` in a `.svc-rows` wrapper — 0-4 rows, variable per job because empty values are dropped server-side, so it is never laid out to a fixed height. `KV` gains a `dl` mode (§7) so the definition-list semantics of the hand-rolled markup at :1416-1428 survive the move to the shared component.
2. The land as one line: `{t.recordTitle} · {t.recordPlace}`, linking to `/app/records/{t.recordId}`.
3. `t.detail` as a closing `.note svc-say` — the provenance line, **below** the answers, not above them. `detail` is fetched on every request today and drawn nowhere, but it defaults to `"Ordered from the properties list"` (web360.py:5919-5928), so it is provenance, not narrative, and it must not lead the block.

**Empty branch** (`t.answers.length === 0`): `t.detail` becomes the lead paragraph and the new copy `No options were set on this order.` follows it as a `.note`. No loading or failed branch — it renders from `t`.

### 4.6 What this costs — `Card`, always

Promoted to position 2 with `className="accent"` when `!t.money.funded && t.money.quoted > 0 && !t.closed` and the roster is not promoted.

Body: `money.headline` verbatim as the lead line; the colourless `.pill sim` "Not charged"; `money.honesty` verbatim in a `.note svc-say`; the settlement-pending line on its existing condition; then the ledger as `.rows` inside `.svc-rows` (label / date / payee left, `inrFull` + status right).

**The empty-ledger paragraph.** Replace the literal comparison at **:1363** — `t.money.headline !== 'Nothing set aside yet'` — with:

```ts
const nothingMoved = t.money.held === 0 && t.money.released === 0 && t.money.returned === 0;
{t.ledger.length === 0 ? (!nothingMoved && <p className="note">…</p>) : ( … )}
```

**This is a correction to the winning proposal, not an inheritance.** Its `!t.money.funded && t.money.quoted === 0` is not equivalent: `money_headline` (ticketing.py, verified today) returns "Nothing set aside yet" whenever `held <= 0 && released <= 0 && returned <= 0` and never consults `quoted`. An unfunded job with a price — the exact showcase state — would evaluate `quoted === 0` as false, the suppression would fail, and the card would print "Nothing set aside yet" as its headline and again as a paragraph two lines below. The three-sum test is the only one that matches the server.

**Controls, in the card's own footer**, each on its existing condition: `Set {inrFull(quoted)} aside`, `Open checkout · {inrFull(quoted)}`, or the settlement-status line.

**`usePaymentConfig`, three branches** for that footer:

| state | render |
|---|---|
| loading | `<Loading h="2.25rem" what="your payment options" />` — never a disabled button |
| failed | the existing error line plus its `Retry` button |
| loaded, `enabled === false && provider === 'stub'` | no checkout link; `Set ₹X aside` when unfunded; plus the existing note "Adding money to the wallet is not switched on yet." |
| loaded, enabled | the checkout `Link` |

### 4.7 Nothing has come back yet — `.card.dashed`, no heading

Rendered when `t.deliverables.length === 0 && !t.closed`.

```tsx
<section className="card dashed">
  <p className="note svc-say">{emptyCame}</p>
  {can('deliver') && <button className="btn sm" onClick={() => setDialog('record')}>
    Record what came back
  </button>}
</section>
```

`emptyCame` is rendered **verbatim** from :967-973, all three variants, including the sentence that carries the product's central promise: "…nothing reaches {recordTitle} until you have looked at them and said yes." That sentence is asserted in full at `14-ticket.spec.ts:1259-1265` and must not be shortened or recomposed.

Not a `Card`: `Card` silently forces `pad-lg`, so a `Card` here spends 87px of chrome (24 padding + 23 h2 + 16 cardhead + 24 padding) around a 39px sentence — 141px total, 62% chrome. This costs 16px of padding and no heading. That is the founder's zero-state rule applied literally.

### 4.8 Everything that happened — the trail, main column, last

`<div className="card" style={{padding: 0}}><div className="rows boxed svc-rows">` — one row per event: the icon from `EVENT_ICON[e.kind]`, `e.headline` verbatim, `e.detail` under it, `e.atLabel` / `e.actorLabel` right-aligned. No event is ever re-worded client-side; the headline was composed at write time and the table is append-only.

**Empty branch** (`t.events.length === 0`): the existing no-trail sentence as a `.note`, inside the same card. No loading or failed branch.

No timeline rebuild, no attaching deliverables or dispatches to event rows: `TicketEvent` exposes no `ref_table` / `ref_id`, and `review_deliverable` writes `kind="deliverable"` exactly as `add_deliverable` does (web360.py:6916, 6954), so a cursor walk mis-attaches on the first verdict click. That is why the trail stays a list.

### 4.9 Rail — Who is on it

`Card`, three branches only (the picker branch is now §4.4):

- **An associate has it:** `.avatarlg` initials, name, `discipline · firm`, who put them on and when, the one consented `tel:` / `mailto:` `.telnum` link with its consent note *or* the server's `contactWhy` sentence, "Also on N other jobs" when `jobsOpen > 1`, and "They're on site" when `can('start')`.
- **A typed name has it:** avatar, name, "Assigned {date}", and the existing paragraph explaining there is no number.
- **Closed and nobody ever had it:** the existing one sentence, no controls.

**Fix `a.via === 'desk'` at :547** to `a.via === 'the desk'`. The server writes the literal string `'the desk'` (web360.py:3690), so that branch has never once been true and every desk-assigned job has told the owner "You put them on it" — a false statement about who is accountable. Fixed, not inherited.

**Delete the `contactMasked` branch at :570.** The field is on the GraphQL `AssignedPerson` type (web360.py:1996) but absent from both the TS interface and `Q_TICKET`'s selection set, so it can never fire. `contactWhy` is what actually prints. Adding the field to the query instead is scope creep for a sentence the server already writes.

No loading / failed branch — it renders from `t`.

### 4.10 Rail — Sent out

- **With dispatches:** `Card` with the count as `aside`, `.rows.boxed` of `<Dispatch>` rows, unchanged — masked contact, `statusWord`, the "Recorded, not sent" pill, the inline "See what was sent" expansion with the full body in `<pre className="mono">` inside `.scroll-x`, and the inline withdraw confirm.
- **Without:** `<section className="card dashed"><p className="note">Nothing has left the building.</p></section>` — 199px of rail becomes ~55px, and the 98px explanatory paragraph (which contains a live copy bug) is gone, with its one useful sentence relocated verbatim into the Send dialog.

### 4.11 Rail — On this land

`Card title="On this land"`: `{t.recordTitle}` as the lead line, `{t.recordPlace}` as a `.note`, then two links — "Open the record ›" and "Everything ordered on {recordTitle} ›".

**No map.** `TicketView` carries no coordinates, extent, khata or thumbnail — only `recordId` / `recordTitle` / `recordPlace` as strings. A map needs a second query, which `Q_TICKET`'s own comment argues against because the trail, the money and the deliverables would stop agreeing about which moment they describe.

### 4.12 Dialogs

| dialog | shape | focus | dismissable |
|---|---|---|---|
| Send this to someone | `<Dialog wide>` | first field (`#dp-name`) | **false** |
| Record what came back | `<Dialog wide>` | first field | **false** |
| Take them off this job | `<Dialog>` | `SAFE_BTN` | **false** |
| Accept and file | `<Dialog>` — untouched | `SAFE_BTN` | **false** |
| Cancel this job | `<Dialog>` — untouched | `SAFE_BTN` | **false** |

`dismissable={false}` on send and record is not optional: the send form is four fields and the record form uploads a file to drive before `onAdd`, with a mandatory name. A scrim click discarding a typed phone number or a chosen file is exactly the loss-of-typed-work failure the block comment at :128-145 exists to prevent.

`.dlg.wide` is `min(44rem, 100%)` (w360.css:1348), which is what finally makes `#dp-contact` a phone-number-sized field instead of the measured 1550px.

**Inline, and staying inline:** the send-back form (one field, and the deliverables must stay visible while you type the reasons, and its result lands in place), each `<Deliverable>`'s reject form, and each `<Dispatch>`'s "See what was sent" expansion and withdraw confirm.

**Field ids and labels are unchanged** (`#dp-name`, `#dp-contact`, `#dp-channel`, `#dp-note`), so every `getByLabel` assertion survives the move from panel to dialog.

---

## 5. The empty case, in full

**The job:** placed, `money.quoted` ₹1,200, `money.funded` false, `held` 0, nobody on it, `dueDate` empty, `answers` 3 rows, `events` 1 row, `deliverables` [], `dispatches` [], `ledger` [], `can = ['assign','cancel','dispatch']`, `quietDays` 0. This is the commonest state of a brand-new order and today it is a 1142px page with 852px of it blank — 75%.

At 1512 × 950, top to bottom, every element:

```
Crumbs      Services  ›  Sy 128/2  ›  PT-6636                          ~20px
h1          Site visit                                                  ~34px
lede        Ordered 14/09/2026                                          ~20px
status      (o) Placed                                                  ~22px
            (no "since" clause — movedOn() equals the order date)
actions     ⋮ Actions for PT-6636                                       (in the header row)
                                                                 header ~96px
─── .split.loose ─────────────────────────────────────────────────────────────
MAIN COLUMN (816px wide)                    RAIL (352px wide)

[no banner — quietDays is 0]                (no "Who is on it" card —
                                             nobody holds this open job;
1. Who can do this        .card.accent       the roster in the main column
   "Nobody is on this yet. Put one of        is the whole answer)
    the people below on it, or name
    somebody who has worked on your        1. Sent out          .card.dashed
    records before."                          "Nothing has left the
   ── rows.boxed ──                            building."              ~55px
   Anji Reddy                       ~300px
   Licensed surveyor · Self                2. On this land         Card
   1 in hand · Never offered a job yet        Sy 128/2
                    [ Put them on it ]        Mangalakunta, Prakasam
   ────────────────                           Open the record ›
   Or a name you have used                    Everything ordered
   [ Anji Reddy        ▾ ] [ Put on ]         on Sy 128/2 ›          ~130px

2. What was asked for             Card     ──────────────────────────────────
   Which side          East         ~215px  rail total, with one 16px gap:
   Dispute             Yes                  ~201px
   Notes               Fence moved
   Sy 128/2 · Mangalakunta, Prakasam →
   Ordered from the properties list

3. What this costs                Card
   Nothing set aside yet            ~200px
   [Not charged]
   "Recorded, not charged. Paying
    online is not switched on yet —
    settle it with the person who did
    the work directly for now."
   (no second empty-ledger paragraph:
    held/released/returned are all 0)
                   [ Set ₹1,200 aside ]

4. (dashed)                     ~70px
   "Nothing has come back yet. When the
    sketch, the photos or the report
    arrive, record them here — nothing
    reaches Sy 128/2 until you have
    looked at them and said yes."
                [ Record what came back ]   ← only if can('deliver'); on a
                                              placed job it is not, so this
                                              card renders the sentence alone

5. Everything that happened       Card
   ⊕  You ordered a site visit       ~150px
      on Sy 128/2
                        14/09/2026 · You

main total, with four 16px gaps:   ~999px
```

**The page is ~1095px tall with no blank canvas in either column.** The main column runs ~800px longer than the rail and that costs nothing, because `.split.loose` removes `align-items: stretch` — the mechanism that turned the difference into dead pixels. There is no skeleton, no illustration, no "No activity yet" tombstone, and not one `Card` shell wrapped around a single sentence.

**Two things to note about this state specifically.** First, the emptiest job in the system is now the one with the most to *do* on it: the two things a brand-new order needs are somebody on it and money behind it, and both are buttons in the two widest blocks on the page. Second, the honest accounting: this is not ~1000px of new *information*. Roughly 300px of it is the roster, which existed before as a 363px accordion in a 352px sidebar; roughly 415px is the answers and the money card, which existed before in the rail. The cure is that the blocks that want width have it, the blocks that were empty shells are gone, and the dead canvas is gone as a mechanism rather than covered over. The earlier proposal's claim that rail-measured card heights transfer intact into a 1224px column was wrong — prose reflows shorter as it widens — and this spec does not rest on it.

**The other empty case**, PT-1407 (on_site, funded ₹450, Anji Reddy assigned, 0 deliverables, 0 dispatches, 4 events): main column is "What happens next" ("Anji Reddy has this. Nothing is needed from you.", ~90px) → What was asked for (~180px) → What this costs (~230px) → the dashed came-back line with `Record what came back` (~70px) → the trail (~347px) ≈ 980px. Rail is Who is on it (~242px) + the dashed Sent out line (~55px) + On this land (~130px) ≈ 460px. Main is the taller column and the stretch runs the correct way.

---

## 6. Actions

### 6.1 The rule

Every control is rendered from `t.can`, never from a hand-written ternary. This is the `TicketView` doc comment's own rule ("a screen can never offer a button the API will refuse"), and it is what recovers the two legal moves the screen has never offered.

**Never branch on the status string.** Drive everything from `can(...)`, `t.deliverables.length`, `t.money.*` and `t.closed`. The one exception is printing `t.statusLabel`. Reason, verified today: `tests/e2e-app/fixtures/seed.ts:600-601` seeds statuses `'delivered'` and `'waiting_owner'` that `ticketing.STATUSES` cannot emit, so any `status === 'submitted'` branch is dead for two of the eight sealed fixtures. `can` is correct in those fixtures and is the server's own contract besides.

### 6.2 One computed table, one place

Compute once, at the top of the component:

```ts
type Home = 'promoted' | 'card' | 'menu' | 'none';
const where: Record<string, Home> = { … };
```

An action is `'menu'` **only if it is not already a button somewhere on the current screen.** That single rule is what stops one action printing three times.

| action | home | the control |
|---|---|---|
| `accept` | promoted / card | the `.card.accent` accept footer inside What came back, gated on `pending.length === 0` with its reason on screen |
| `send_back` | card | "Send it back" beside Accept in that same footer; the form opens inline |
| `assign` | promoted / card | "Put them on it" on each roster row, and the named-person select |
| `unassign` | menu | "Take them off this job" → the new dialog; also the banner's second button when the job is quiet |
| `deliver` | card, else menu | "Record what came back" on the dashed empty card; when deliverables already exist, the kebab |
| `start` | card | "They're on site" inside the rail's person card |
| `dispatch` | menu | "Send this to someone" when no live dispatch, "Send it again" when there is one (pre-filled from the last non-revoked dispatch, purpose `nudge` — today only reachable from the quiet banner); also the banner's first button when quiet |
| `withdraw` | card | "Withdraw" on each dispatch row |
| `cancel` | menu | "Cancel this job", `danger: true`, separated and last; also the banner's third button when quiet |
| funding | card | "Set ₹X aside" / "Open checkout · ₹X" in the money card footer, never the kebab |

### 6.3 The promoted block, and what is primary at each of the eight statuses

Exactly one block carries `accent`, and it always means "this is waiting on you". First match wins; the promoted block is **removed** from its canonical slot so it never renders twice.

```
can('accept')                                   → What came back
nobody on it && can('assign') && !closed        → Who can do this
!money.funded && money.quoted > 0 && !closed    → What this costs
otherwise                                       → nothing promoted;
                                                  "What happens next" renders plain
```

| status | `can` | promoted block | the control the owner sees first | kebab |
|---|---|---|---|---|
| `placed` | assign, cancel, dispatch | Who can do this | `Put them on it` per roster row | Send this to someone · Cancel this job |
| `sent` | assign, cancel, dispatch, withdraw | Who can do this | `Put them on it` per roster row | Send it again · Cancel this job (withdraw is on the dispatch row) |
| `assigned` | assign, cancel, deliver, dispatch, start, unassign | What this costs, if unfunded; else none | `Set ₹X aside`, or `They're on site` in the person card | Record what came back · Send this to someone · Take them off this job · Cancel this job |
| `on_site` | cancel, deliver, dispatch, unassign | What this costs, if unfunded; else none | `Record what came back` on the dashed card | Send this to someone · Take them off this job · Cancel this job |
| `submitted` | accept, cancel, dispatch, send_back | What came back | per-item `Keep it` / `Not this one`, then `Accept and file` | **Send this to someone** (this is the gap being closed — dispatch is legal here and has had no permanent control) · Cancel this job |
| `changes` | cancel, deliver, dispatch | What this costs, if unfunded; else none | `Record what came back` on the dashed card, whose `emptyCame` variant already says when you sent it back | Send this to someone · Cancel this job |
| `accepted` | — | none | none; "How it ended" states the outcome | (empty — no kebab is rendered) |
| `cancelled` | — | none | none; "How it ended" states the outcome | (empty — no kebab is rendered) |

**`unassign` gets a control for the first time.** It is in `PT-1407`'s live `can`, the word appears nowhere in 1,455 lines of Ticket.tsx, and `assignRequest(requestId, assignee: '')` already runs `_move(conn, uid, row, "unassign")` and clears `assignee` and `assignee_ref` (web360.py:6398-6417), with `useAssignRequest` already imported by this file. Zero backend work. Today the owner's only visible exit from a silent surveyor is "Cancel this job".

### 6.4 State, panels and errors

```ts
const [dialog, setDialog] = useState<'' | 'send' | 'record' | 'cancel' | 'unassign' | 'accept'>('');
const [inline, setInline] = useState<'' | 'sendback'>('');
const [err, setErr] = useState<{ where: Where; msg: string }>({ where: 'page', msg: '' });
type Where = 'page' | 'next' | 'came' | 'who' | 'money' | 'sent' | 'dialog';
```

- `accepting` (:760) is folded into `dialog`, so `AcceptDialog` can no longer open over an already-open send or record panel while the accept footer is still visible behind it.
- The five-value exclusive `panel` becomes one `dialog` plus one `inline`.
- `setDialog()` and `setInline()` both **clear `err` on open and on close**. Today `open()` clears it but `setPanel('cancel')` at **:964** (kebab) and **:1028** (banner) do not, so a stale failure from another action renders inside a destructive confirmation.
- The page-level error card at **:1036-1038** is deleted. `<Err>` renders as the last child of the region that raised it, set at each of the eleven mutation call sites — an `onStart` failure fired from the rail no longer reports itself 800px up the page.
- `where: 'page'` remains the fallback for kebab-fired actions whose owning card is not on screen (a failed `unassign`, a failed `cancel`), and that `<Err>` renders directly under the header. A kebab action must never be able to fail silently.
- `WhoIsOnIt`'s separate `err` at :478 is deleted; its writes report as `where: 'who'`.
- The single `busy` flag (:808-810) freezing the nine page-level mutations together stays, and `assign` stays deliberately excluded per the comment at :805-807.

---

## 7. The file plan

### Created

| file | lines | why |
|---|---|---|
| — none | | The screen stays one file. `Ticket.tsx` is an internal identifier and renaming it moves one lazy import for zero user payoff. |

### Modified — apps/web

| file | ~lines | change |
|---|---|---|
| `src/routes.tsx` | +14 / −2 | `ToService` (5 lines) beside `ToRecord` at :211; the two child routes move from :312-313 to after :299; two redirects added after :348 |
| `src/w360/pages/Ticket.tsx` | 1455 → ~1390 (−250 / +185) | the whole redesign; see §9 for the delete list |
| `src/w360/ui.tsx` | +6 | `KV` gains `as?: 'dl'` — renders `<dl>/<dt>/<dd>` instead of `<div>/<span class="k">/<span class="v">`; same `.kv` CSS, both already styled (w360.css:1290-1292) |
| `src/w360/w360.css` | +12 | three rules, §8 |
| `src/w360/pages/Orders.tsx` | 2 | `:84` and `:255` copy |
| `src/pages/PaymentsCheckout.tsx` | 4 | `:127` link + copy, `:128`, `:135` |
| `src/w360/pages/Wallet.tsx` | 1 | `:88` link |
| `src/w360/pages/OrderService.tsx` | 3 | `:663`, `:963`, `:1052` links |
| `src/w360/pages/RequestWork.tsx` | 1 | `:277` link |
| `src/pages/legal/TermsPage.tsx` | 1 | `:12` |
| `src/w360/pages/Desk.tsx` | 1 | `:259` |
| `src/w360/pages/DeskJob.tsx` | 2 | `:174`, `:291` |
| `src/w360/pages/DeskAssociate.tsx` | 2 | `:246`, `:825` |

### Modified — services/api (commit 3)

| file | ~lines |
|---|---|
| `src/payments.py` | 15 strings |
| `src/payments_provider.py` | 2 strings |
| `src/web360.py` | 1 string (`:6761`) |

### Modified — docs (commit 2)

`docs/runbooks/razorpay-payments.md:30` (operational — tells an operator where checkout starts), `docs/specs/2026-09-13-associates-marketplace.md:983,1121,1122` (the last quotes `Orders.tsx:84` verbatim), `docs/specs/2026-09-07-service-ticketing-payments.md:382`, `docs/specs/2026-08-15-web-360-design.md:847`.

### Modified — e2e specs

Two axes break: the route and the structure. Both are in commit 2.

**Route and URL (16 hard breaks, 39 navigations, 10 mentions):**

| file | lines |
|---|---|
| `e2e-app/specs/14-ticket.spec.ts` | **:232** — the `ticketAt` helper, one line called 152 times in a 167-test file; `:1953`, `:1980`, `:2023` |
| `e2e-app/specs/13-services.spec.ts` | `:273`, `:1329`, `:1802`, `:2029`, `:2459` (rendered `href`) |
| `e2e-app/specs/21-routing.spec.ts` | `:582`, `:600` (`toHaveURL`), `:865` (array entry) |
| `e2e-app/specs/15-wallet.spec.ts` | `:356`, `:658` |
| `e2e-app/specs/23-resilience.spec.ts` | **:202-205** — one `SCREENS` row driving 5 parameterised tests; all four fields change: `route`, `waits: 'Loading this job'` → `'Loading this service'`, `failedWhat: 'This ticket'` → `'This service'`, `neverSays: 'This ticket is not here'` → `'This service is not here'`. The `waits` string contains no "ticket" and is invisible to a copy grep — it is the assertion every proposal's accounting missed. |
| `e2e-app/specs/24-responsive.spec.ts` | `:534`; **`:792-800` passes unchanged** — it asserts `.w360 .split > *` count > 1 on this screen, and this design keeps the split. (A rail-less redesign would have broken it.) |
| `e2e-app/specs/crud-360.spec.ts` | `:1051`, `:1078` — the path is spelled as a regex (`/\/app\/tickets\/wr-/`); a plain grep misses both |
| `e2e-app/specs/01-shell.spec.ts` | `:142-150` — **remove the `test.fail`** or the suite reports it as unexpectedly passing |
| `e2e-web360/specs/gap-services.spec.ts` | `:16`, `:248`, `:292` |
| `e2e-web360/specs/tickets.spec.ts` | `:178`, `:478`, 16 `goto` lines |

**Copy (30 assertions):** `14-ticket.spec.ts` ×19 (incl. `:366`, `:367`, `:404`, `:2157`, `:2163`); `01-shell.spec.ts:260,268,319`; `13-services.spec.ts:272,274,625`; `gap-services.spec.ts:247,257,291`; `tickets.spec.ts:177`. Plus **remove the `test.fail` at `14-ticket.spec.ts:401`.**

**Structure — this is the bill every source proposal under-counted. Verified against the specs today:**

| spec line | what it asserts | what changes |
|---|---|---|
| `14-ticket.spec.ts:282` | the exact `.eyebrow` text `W-2102 · Sy 214/2 · Katragunta, Markapur, Prakasam` | deleted; delete the assertion |
| `14-ticket.spec.ts:291-293`, `:298-300` | `.lede` contains `Ordered 04/09/2026`, `with Ravi Kumar, licensed surveyor`, `due` | **unchanged — these pass**, which is why the lede is byte-frozen |
| `14-ticket.spec.ts:305` | `await expect(page.locator('.rail')).toBeVisible()` | `<Rail>` is deleted; replace with an assertion that exactly one `.state` carries the status word and nothing else on the page repeats it |
| `14-ticket.spec.ts:342-346` | `card(page, 'What was asked for')` + its rows | **unchanged — passes**, which is why that heading is not reworded |
| `14-ticket.spec.ts:348-352` | the zero-answers sentence | reworded |
| `14-ticket.spec.ts:1028` | `card(page,'Sent out').toContainText('Nothing has left the building.')` | the empty case is now a headingless `.card.dashed`; `card()` (defined at `:222` as `section.card` filtered by an exact `h2`) no longer matches. Re-target at the text; the sentence itself is unchanged |
| `14-ticket.spec.ts:1259-1265` | `card(page,'What came back')` + the full `emptyCame` promise | same: the empty case is headingless now. Re-target at the text; **the sentence is unchanged, verbatim, and must stay that way** |
| `14-ticket.spec.ts` ×21 | `card(page,'Sent out')` on populated jobs | still a `Card` with that heading — passes |
| `14-ticket.spec.ts` ×17 | the roster inside `whoIsOnIt` = `card(page,'Who is on it')` (e.g. `:569`, `:600`, `:611`) | the roster moves to `card(page,'Who can do this')` in the main column; the person branches stay in `Who is on it` |
| `14-ticket.spec.ts` ×8 | `actions(page, ref)` exact-array `toEqual` on the kebab | rebuilt from `can`; every list changes (unassign added; funding removed; dispatch present in `submitted`) |
| `14-ticket.spec.ts` ×2 | the header button `Review what came back` | no header primary; delete |
| 17 sites | `Send this to someone` | now kebab-only; the test opens the kebab first |
| ~29 lines | `#dp-name` / `#dp-contact` and their labels | **ids and labels unchanged** — `getByLabel` assertions survive the panel→dialog move; only assertions that locate the enclosing `section.card` change |

**Pre-existing drift, adjacent, fix it while you are here or leave it — but do not discover it later:** `e2e-app/fixtures/seed.ts:597-604` seeds refs shaped `W-2101` (196 occurrences across 5 files) that `ticket_ref()` can never emit, and statuses `'delivered'` and `'waiting_owner'` that `ticketing.STATUSES` does not contain. Driving from `can` rather than `status` means this design works against both, but the sealed suite is certifying two shapes the server cannot produce.

---

## 8. New CSS

Three rules, twelve lines, appended to `w360.css` with the module's house comment style (the failure named in pixels).

```css
/* Two columns of different heights. `.split` stretches its children, and
   `.stack` inside them sets `align-content: start`, so every pixel one column
   runs longer than the other is drawn as blank canvas inside the shorter one —
   measured at 1224 x 852 = 1,042,848px² on a placed job, and it can only ever
   get worse on a wider display. `align-content: start` is the second half,
   because `main > .split { flex: 1 1 auto }` (w360.css:374) would otherwise
   spread the single grid row over the page's leftover height; `.orderflow.solo`
   carries the identical pairing at w360.css:3383-3387. Opt-in by modifier only:
   eight screens share `.split` and none of them is touched. */
.w360 .split.loose { align-items: start; align-content: start; }

/* A measure cap for the server's sentences now that they live in a full-width
   column: money.honesty, emptyCame and the roster's intro run about 150
   characters to a line in an 816px column and 190 in a 1224px one, twice the
   measure prose is legible at. 42rem is `.qsheet`'s own figure (w360.css:3390),
   taken for exactly this reason, so the number is the module's and not a new
   one. */
.w360 .svc-say { max-width: 42rem; }

/* The same problem for the tabular blocks, which need more room than prose and
   less than the page. `.kv > div` is a flex row with `justify-content:
   space-between` and a mono right-aligned value, so an uncapped answer row
   renders "Copies" at x=0 and "2" at x=1200 with 1,100px of nothing between
   them; `.rows > *` does the same to a 40-character event headline and its
   date. Deliverable rows and the dispatch body are deliberately NOT capped —
   a scan thumbnail and a sent message want the room. */
.w360 .svc-rows { max-width: 48rem; }
```

**Nothing is added to the print block**, and that is a decision rather than an omission: `.split` is already in the selector list at w360.css:2769-2781 and `.loose` is the same element, so the modifier inherits `display: block !important`; nothing on this screen is sticky, so no `position: static !important` line is needed; and `max-width` on a printed block is harmless.

Everything else reuses existing vocabulary by its real name: `Card` (+ `accent`, `alert`), `.card.dashed` (w360.css:542), `.card` with `padding: 0` around `.rows.boxed`, `.stack`, `.kv` via `KV`, `.pill.sim`, `.scroll-x`, `.avatarlg`, `.telnum`, `.row.tight`, `.note`, `.btn` / `.btn.sm` / `.btn.primary` / `.btn.danger`, `Crumbs`, `State`, `Tag`, `Menu`, `Dialog` + `useFocusTrap` + `FOCUSABLE`, `Loading` / `Empty` / `Failed`, `inr` / `inrFull` / `inrOr`, `ddmmyyyy`, `plural`. Same discipline that let the desk ship with exactly one new class.

**No `.strip`.** The four-cell fact strip the source proposal wanted is cut: `.strip`'s `.v` is `font-family: var(--font-mono); font-size: 1.5rem` (w360.css:579-586) — a figures rail, wrong for a person's name; three of its four cells would restate the lede directly above it; and on a placed job three of the four read "—". On a phone it stacks to four rows at ≤900px (w360.css:697-699, **not** 640px as the source claimed) at ~91px each — 366px of viewport spent on the order date and a row of dashes.

---

## 9. What is deleted from Ticket.tsx, and where each behaviour lands

| deleted | line | where the behaviour goes |
|---|---|---|
| `<Rail stage steps word>` + the `ORDER_STAGES` import | :993 | Nowhere. The status word is the `State` pill. `Rail`/`ORDER_STAGES` stay exported for `Orders.tsx:186`. |
| The `.eyebrow` | :982 | `ref` and `recordTitle` are in the Crumbs; `recordPlace` goes to the rail's "On this land" card. |
| The header primary ternary | :998-1008 | Actions move to the card footers and the kebab, computed from `can`. |
| The hand-built kebab | :956-965 | One filter over `can`, minus anything already on screen (§6.2). |
| The page-level error card | :1036-1038 | Region-tagged `<Err>` beside the control that failed, with `where: 'page'` under the header as the fallback for kebab actions. |
| The inline `send` panel `<section className="card pad-lg">` | :1042-1105 | `<Dialog wide dismissable={false}>`. Its intro paragraph moves verbatim and gains the one relocated sentence from the Sent-out card. 539px of measured page-push and a 1550px-wide phone-number input go with it. |
| The inline `record` panel | :1109-1199 | `<Dialog wide dismissable={false}>`. The upload-to-drive-then-`onAdd` flow, the mandatory name and its on-screen reason are unchanged. |
| `WhoIsOnIt` branch (d), the 363px picker accordion | :632-737 | The full-width main-column card **Who can do this** (§4.4), with three real async states instead of `cards ?? []`. |
| `const roster = cards ?? []` | :633 | Deleted — it is the line that collapses loading and failed into empty. |
| The rail Cards "What this costs" and "What was asked for" | :1334-1392, :1416-1429 | Main-column blocks 5 and 6. |
| The rail "Sent out" `Card` shell **when empty** | :1399-1414 | `.card.dashed` one-liner; 199px → ~55px. The populated card is unchanged. |
| The "What came back" `Card` shell **when empty** | :1204-1222 | `.card.dashed` one-liner carrying `emptyCame` verbatim plus one action; 141px → ~70px. The populated card, the per-item verdicts, the `.card.accent` accept footer and the inline send-back form are all unchanged and stay in the same place relative to each other. |
| The hand-rolled `<dl className="kv">` | :1416-1428 | `<KV as="dl">` — same markup, one dialect. |
| `t.money.headline !== 'Nothing set aside yet'` | :1363 | `t.money.held === 0 && t.money.released === 0 && t.money.returned === 0` — matches `money_headline`'s actual condition, which never consults `quoted`. |
| `a.via === 'desk'` | :547 | `a.via === 'the desk'`. Live bug: every desk-assigned job has read "You put them on it". |
| The `contactMasked` branch | :570 | Deleted — the field is not in the TS interface or `Q_TICKET`, so it can never fire. `contactWhy` prints. |
| The quiet banner's page-level slot | :1016 | The banner itself survives, in the main column, first, with a third button for `unassign` and a second shape for a job nobody has been put on. |
| The closed-job footer (`outcomeNote` + the related-orders link) | :1445-1452 | `outcomeNote` → the "How it ended" card, main column, position 2. The link → the rail's "On this land" card, where it is now permanent instead of closed-job-only and stranded after the dialogs. |
| `panel` (5 values) and `accepting` | :758, :760 | One `dialog` and one `inline` (§6.4). |
| `/app/tickets/:id`, `/app/tickets/:id/pay` as live routes | routes.tsx:312-313 | Permanent redirects. |
| Both `test.fail` markers | 01-shell:150, 14-ticket:401 | Deleted with the defects they describe. |

**Kept untouched, and listed so nobody tidies them:** `AcceptDialog` and `CancelDialog` byte-for-byte, including `dismissable={false}`, `initialFocus={SAFE_BTN}` and the block comment at :128-145; the settlement arithmetic in `planLine` and the payout split (`t.money.held * t.money.payeeShare`, a fraction, multiplied client-side) inside `AcceptDialog`; `movedOn()` at :96-108; the per-item accept/reject model in `<Deliverable>` and its twelve states; `<Dispatch>` and its inline expansions; the four "why this button is off" notes at :1093, :1189, :1246, :1282; `contactShown` as the server's decision, never re-taken client-side; and the `came` ref, which stays as the scroll target for the one place that still needs it — the banner and the kebab are the only entry points that can land the owner above a deliverables list, and `scrollIntoView({ block: 'start' })` is retained there. The header no longer scrolls to anything.

---

## 10. Open questions

1. **Ledger notes already written.** `payments.py:397/405` are stored text rendered verbatim in the owner's wallet. Default: do not backfill — history should read as it was written — which means the wallet shows both wordings side by side for a while. Overrule only if the founder prefers one wording.
2. **Scope of commit 3.** The five Desk strings and the 18 API strings are in this spec. If the founder wants the web half shipped alone, say so before commit 2 lands: for one deploy the browser says "service" and an API error says "ticket".
3. **The sealed fixture.** `seed.ts` invents `W-2101` refs and two impossible statuses. This design is immune to both, but the suite is certifying shapes the server cannot produce. Fix in this change or file it — founder's call on scope.