# Service tickets, dispatch and held money — W16

Status: building · 2026-09-07 · owner: web + api session
Scope: `services/api/src/ticketing.py`, `services/api/src/web360.py`,
`apps/web/src/w360`, `scripts/seed-web360.py`, `tests/e2e-web360`

## What was asked, and what was built

The ask was one sentence and had six clauses in it: make service requests and
ticketing work "100%", including payments; let the request be sent by email,
WhatsApp or SMS; build the prototype now and the API and tables now, with the
integrations coming later; and let an owner raise a request against any
property, track it, get the work completion, review and accept what comes back,
so that only then does it join the record.

Everything in that list is built for real — real tables, real GraphQL, real
screens, a real state machine — except the two things that reach outside the
building, and both of those are stubbed exactly the way this codebase already
stubs sending: `services/api/src/notify.py` has had `NOTIFY_*_PROVIDER=stub`
since the invite flow shipped, writing every message to `notification_log`
instead of calling anyone, and going live is a credential and not a rewrite.
Money now gets the same seam.

**The prototype boundary, stated once and honestly.** Under the default
`PAYMENTS_PROVIDER=stub`, *no rupee moves anywhere*. There is no bank, no UPI
handle, no card, no payout. What the ledger holds is a record of what a job was
quoted at, what was set aside against it, and who it was owed to when the owner
accepted the work. Those are facts about an agreement, not about an account.
The screens say so in three places at once — a colourless `Not charged` pill on
every simulated figure, a sentence under every headline
(`ticketing.money_honesty`), and a page-level notice on the Wallet — and
`scripts/ux-guards.ts` fails the build if the words *debited*, *Transaction ID*,
*UTR*, *RRN* or *Payment successful* ever appear on either page.

The alternative was to make the money non-functional until a gateway exists —
`state='intent'`, everything summing to zero. That was rejected because a
feature whose every figure is ₹0 cannot be demonstrated, cannot be tested, and
cannot tell you whether the arithmetic is right. The cost of the choice is that
a screenshot of the demo shows real-looking rupees; the mitigation is that the
words beside them never say paid, charged or debited.

## The ticket is the work request

There is no `service_tickets` table. A ticket **is** a `work_requests` row, with
six columns added to it.

`work_requests` is already the row that `Query.web.orders` lists, that the
Shell's "Assigned to me" badge counts, that the four-pip Rail draws, that
`deleteRecords` cascades, and that `FenceStudio` files a fencing job into. A
parallel table would have meant every one of those either reading two sources or
quietly showing half the work. The order placed from the catalogue, the fencing
estimate raised off the village map, and the ticket a surveyor is working on are
the same object at three moments of its life, and they were never going to stay
in step as three tables.

The price of that decision is named rather than hidden: `work_requests.kind`
now carries three vocabularies at once — the six `SERVICE_CATALOGUE` keys
(`ec`, `survey`, `site_visit`, `title_opinion`, `mutation`, `patta_copy`), the
four `createRequest` kinds (`survey`, `opinion`, `visit`, `fencing`), and the
legacy `errand`. They all land in one column, so anything reading it has to
cope with all three. That is contained in exactly one lookup,
`ticketing.SHELF_FOR_KIND`, which covers every value from all three sets. The
second, staler catalogue that used to sit beside the real one — `SERVICE_KINDS`
— is deleted, because two catalogues in one file is how three vocabularies
happened in the first place.

The reference number is derived, never stored. `ticketing.ticket_ref(id)` folds
an id's hex tail into `PT-nnnn`, and a seeded id that already spells its
reference keeps it. So there is no counter to advance, no uniqueness to defend,
and no migration when the id scheme changes.

## The lifecycle, and why it has eight states

`work_requests.stage` is a 0..3 index into `_STAGES` —
`Placed / Assigned / On site / Delivered` — and it is what the Services list,
the Assigned rail and the Rail component read. It is a fine progress bar and a
useless record. It cannot say *I wrote to Srinivas and heard nothing*, or *he
sent four things back and two of them are of the wrong field*, or *I pulled the
job*. Those are the three states an owner actually needs to see, and they are
the reason the feature exists.

So `status` is the truth and `stage` is written **from** it, every time, by one
function. `_STAGES` is frozen — not extended, not reordered, not relabelled —
so every existing screen and both existing e2e specs keep reading exactly what
they read before.

| `status` | `stage` | `stageLabel` | what the ticket screen says | needs you | closed |
|---|---|---|---|---|---|
| `placed` | 0 | Placed | Placed | | |
| `sent` | 0 | Placed | Sent out | | |
| `assigned` | 1 | Assigned | Assigned | | |
| `on_site` | 2 | On site | On site | | |
| `submitted` | 3 | Delivered | Waiting on you | **yes** | |
| `changes` | 2 | On site | Sent back | | |
| `accepted` | 3 | Delivered | Accepted | | **yes** |
| `cancelled` | 3 | Delivered | Cancelled | | **yes** |

The legal moves are a dict of `(status, action) -> (next, who may)` in
`ticketing.TRANSITIONS`, and a pair that is not in it **does not happen**:
`web360._move` refuses it, writes a `kind='refused'` event, and returns `""`.
It does not repair the state. A machine that quietly fixes itself cannot be
reconstructed six months later when four and a half thousand rupees are being
argued about, and that reconstruction is the only reason to keep a trail at all.

`accepted` and `cancelled` have no outgoing moves. A released payout cannot be
un-released on any rail we will ever use, so the remedy for a wrong acceptance
is a fresh ticket and not a reopened one.

Three things follow from the table above and are worth stating on their own:

- **`sent` and `placed` share a pip.** Sending a job to somebody has not
  advanced the work; it has only advanced the paperwork. Drawing it as progress
  would tell an owner that something is happening on their land when nothing is.
- **`changes` goes *back* to pip 2, not forward.** Work that was sent back is
  work in progress again. Leaving it at Delivered would be the screen agreeing
  with the surveyor rather than with the owner.
- **`submitted` is the only status that sets `needs_you`.** Every other state is
  somebody else's turn, and a badge that lights up for states the owner cannot
  act on is a badge people learn to ignore.

**There is no `disputed`.** A dispute needs an ops actor, an ops queue and
somebody paid to sit in it, and this build has none of the three. The owner's
remedy is `send_back` — which is real, keeps the evidence, and reaches the
worker — and then `cancel` with a partial settlement if it still cannot be
fixed. Adding a status nobody can resolve would have been a dead end drawn on a
screen.

**Statuses are read, never backfilled.** Rows written before this feature carry
a stage and an empty status, and `scripts/seed-web360.py` puts more of them back
on every reseed, so `ticketing.status_of(status, stage, closed)` is a permanent
read-time fallback rather than a one-off migration. A backfill would have been
undone by the next seed run.

## The tables, and why each one exists

Everything is `CREATE TABLE IF NOT EXISTS` / `ADD COLUMN IF NOT EXISTS`,
exported as `ticketing.DDL` and applied by `web360.ensure_schema` on every boot,
the same idiom the rest of `web360.py` uses.

| table | why it is not a column on something else |
|---|---|
| `work_requests` **+6 columns** | `status`, `status_at`, `quoted`, `payee_share`, `outcome_note`, `accepted_at`. `cost` follows the settlement, so the Services list stops quoting a figure nobody paid; `quoted` keeps what was agreed on the day, which is the number a dispute is about. `payee_share` is frozen at order time so a later change to the split cannot rewrite an old ticket's economics. |
| `ticket_events` | Append-only, one row per movement. It is the tracking screen and it is the file somebody opens six months later. Nothing is ever updated: a correction is another row. The headline is composed at write time, so 2027's code cannot re-word a 2026 event. |
| `ticket_dispatches` | One row per time this ticket left the building — channel, contact, the exact bytes that went, the provider that took it, and whether it has been withdrawn. Without the row there is no answer to "what did they actually get", and no way to take it back. |
| `ticket_deliverables` | What came back, *before* anybody accepted it. A deliverable is deliberately not yet a document, a photo or a feature: the fence does not exist until somebody has looked, and writing it onto the land early puts a thing there that is not there. |
| `service_payments` | The ledger. Append-only, double-entry, five buckets. There is no balance column anywhere. |
| `documents` **+1**, `land_features` **+1** | `order_ref`. `parcel_photos` and `property_photos` have carried this column since W14 and nothing has ever written it; these two make the same question answerable of a paper and of a feature. |

**Deliverables are reviewed one at a time**, and that is a design decision, not
a schema accident. A survey comes back with a good sketch and two photographs of
the wrong field. All-or-nothing forces an owner to accept rubbish rather than
lose the sketch, so each item carries its own `review` of
`pending | accepted | rejected`. A rejected deliverable is kept and never
deleted — it is the evidence of what was sent.

**The ledger is five buckets and five entries.**

```
outside   the real world — a bank, a UPI VPA, a card
wallet    the owner's credit with Pattadar
held      money set aside against ONE ticket and not yet anybody's
payout    money that has gone to the person who did the work
fee       Pattadar's share
```

| entry | from | to | when |
|---|---|---|---|
| `top_up` | outside | wallet | money comes in (**no writer yet** — see TO GO LIVE) |
| `hold` | wallet | held | the owner sets money aside on a job |
| `release` | held | payout | the owner accepts the work |
| `fee` | held | fee | the same moment, the remainder |
| `return` | held | wallet | a cancellation gives back what was not settled |

`amount` is always positive and the direction is the bucket pair. That is the
one decision that makes every balance a plain `SUM` with no sign bugs anywhere,
and it is why there is no stored balance: a stored balance and a ledger disagree
exactly once and then forever. `provider` and `status` sit on every row, lifted
straight from `notification_log`, so the row itself says whether the rupees in
it were ever real — `WHERE provider='stub'` is the whole audit — rather than a
flag somebody has to remember to flip.

The fee is computed as the remainder of the payout, never independently, so the
two always add back to exactly the amount settled. `ticketing.payee_split`
is four lines and has a test for each of them.

**A cancellation emits the `return` row first, and it stays first.** The pool is
autocommit and a settlement is three statements; a crash between two of them
must leave the money with the owner and not with a stranger. The unique index on
`idempotency_key` is what makes a double-tapped Accept complete a half-written
settlement instead of duplicating it.

## The API

Everything is in the existing `Query.web` / `Mutation.web` namespace
(`web360.py`), so `main.py`'s 6.9k-line iOS-facing schema is untouched.

**Reads.** `ticket(id)` returns the whole screen in one round trip — the row,
the record's title and place, the trail, the deliverables, the dispatches and
the ledger, six queries on one connection. It returns `null` for an id that is
not the caller's, which is indistinguishable from not-found, per the module's
existing convention. `wallet(limit)` returns the four figures, the jobs holding
money and the recent movements.

**`orders` stayed backward compatible on purpose.** It gained one optional
argument, `includeClosed: Boolean = false`, and five appended fields with
defaults (`status`, `statusLabel`, `statusState`, `ref`, `held`,
`pendingReview`). With the argument absent the SQL and the rows are byte
identical to what shipped before, so every existing caller and both existing e2e
specs keep passing. `held` and `pendingReview` come from two aggregate queries
over the whole result set, never one per row.

**Writes.** `fundTicket`, `dispatchTicket`, `revokeDispatch`, `startTicket`,
`addDeliverable`, `reviewDeliverable`, `acceptTicket`, `sendBackTicket`,
`cancelTicket`. Every one returns the falsy value on refusal — `""`, `0`,
`false` — and none of them raises, which is what the rest of this module already
does and what the client already handles.

`orderService`, `createRequest` and `assignRequest` kept their signatures
exactly. They now write `status`, `status_at`, `quoted` and `payee_share`
alongside what they already wrote, and each leaves an event behind;
`assignRequest` routes through `_move` so the assignment appears in the trail.

**`_move` is the only writer of `work_requests.status`,** and its UPDATE carries
`AND status = <the status it read>`. The pool is autocommit and there is no
transaction to lean on, so two concurrent accepts leave one winner and the loser
sees a rowcount of zero rather than a second settlement.

**`services/api/src/ticketing.py` is pure.** No psycopg, no strawberry, no
httpx, no `os`, no `secrets`, no `datetime.now()`. `today` and `entropy` are
arguments. The precedent is `fmb_geometry.py`, and the reason is the same one
with more money attached: a module that reaches for the OS clock or the OS
entropy pool cannot be pinned in a test, and this is the code that decides who
gets paid. Its tests are `services/api/tests/test_ticketing.py` and every worked
example in the module docstrings is one of them.

## The money seam — exactly what is real

**Real today:** the ledger table, the double-entry arithmetic, the hold on
funding, the split on acceptance, the partial settlement and return on
cancellation, the wallet's four figures, the per-ticket held figure on every
order row, and the idempotency that stops a retry duplicating a settlement.
Those work, are seeded, and are asserted by the e2e suite.

**Not real today:** anything that moves money. No gateway is called. No payout
is initiated. `wallet_accounts.topped_up` is written only by the seed, so the
Add money button is `disabled` with a title saying why rather than opening a
flow that would fail.

The gate is one function:

```python
ticketing.provider_gate(configured, has_credentials)   # -> "razorpay" | "stub"
```

called from `web360.py` with `os.getenv` results, and copied deliberately from
`notify.py`'s dual gate: **a provider named without its credentials falls
through to the stub rather than half-sending.** A ledger row then takes
`payment_status(provider)` — `recorded` under the stub, `settled` when live —
and `is_live(provider)` is what removes the `Not charged` pill from the screens.

The env block, matching the file's comment-per-var style:

```
# Payments provider: stub | razorpay. "stub" (the default) records what is
# owed and calls nobody; no money moves and the UI says so. Setting the name
# AND the secret goes live with no change at any call site.
PAYMENTS_PROVIDER=stub
RAZORPAY_KEY_ID=
RAZORPAY_KEY_SECRET=
# The worker's share of a quoted price; the remainder is Pattadar's.
PAYMENTS_PAYEE_SHARE=0.90
```

⚠️ **The gate changes what the screens SAY before it changes what the money
DOES.** There is no Razorpay arm written yet — nothing in the repo posts to a
gateway. Setting `PAYMENTS_PROVIDER=razorpay` with a key today would mark new
ledger rows `settled`, drop the `Not charged` pill and switch the honesty
sentence, while still moving nothing. Do not set it until the provider arm in
TO GO LIVE below exists. That is the one place where this seam is *less* safe
than `notify.py`'s, because `notify.py` has its live arms written and this does
not.

**The word escrow does not appear in any new copy,** and `ux-guards.ts` enforces
it. Pattadar is not a licensed escrow agent, and what a payment gateway actually
offers is a withheld payout. New copy says *set aside* and *we don't release it
until you accept*, which is both true and clearer. The one exception is the
Services lede, which said escrow before this work and is byte-frozen — it was a
promise the API did not keep, and as of this build the mechanism behind it
exists.

**One number that deliberately does not reconcile.** `Query.web.people` derives
its own `walletBalance` and four frozen prose branches, and this work did not
touch it. So the People rail's balance and the Wallet page's *Available* differ
by whatever is currently set aside on jobs. The Wallet page labels its own four
figures explicitly — *Available*, *Set aside on jobs*, *Gone out*, *Put in* — so
no screen claims the other's number. Making them one figure means rewriting a
resolver whose strings an existing test asserts, and that is a separate change
with its own risk.

## The dispatch seam — exactly what is real

**The sending is completely real.** `dispatchTicket` renders the message,
hands it to `notify.send_email` / `send_sms` / `send_whatsapp`, stores the
provider and status the sender returned, and writes an event. Under the stub the
message is written to `notification_log` — you can read every one of them
through the existing `Query.notification_log` — and the dispatch row records
`provider='stub'`, `status='logged'`. With credentials set, the same call sites
send for real and nothing else changes.

**The owner is never handed a link.** This is the thing `createRequest`'s
docstring has always refused to do, and it is worth restating because it looks
like a limitation and is the opposite. A WhatsApp link the owner pastes himself
cannot be revoked, cannot be tracked, and cannot be answered for. What ships
instead is: the system writes to the person, keeps the exact bytes it sent,
shows them back on the ticket under *See what was sent*, and can withdraw the
request — which tells the recipient it is off and, when nothing live is left,
moves the ticket back to `placed`. There is a test asserting the message body
contains no `http`.

Each channel renders differently because each channel is different, and the
differences are not cosmetic:

- **Email** is HTML paragraphs; any block whose source value is empty is dropped
  entirely rather than rendered as a label with nothing after it.
- **WhatsApp** carries the template name `pattadar_service_v1` and its six
  parameters alongside the free text, because a live Meta send outside a
  24-hour customer-service window *must* be a template. The emoji stay; the
  founder asked for them back.
- **SMS is ASCII and hard-clamped to 160.** GSM-7 has no rupee sign, and one ₹
  turns a 160-character message into a 70-character one, so SMS says `Rs` and
  drops its optional parts right to left — the note, then the extent, then the
  due date, then the place — until it fits. `ticketing.sms_ok` is the assertion.

`mint_token` / `verify_token` and the `token_hash`, `token_tail` and
`expires_on` columns ship and are written, but **v1 sends no link at all**, so
`verify_token` currently has no caller. They are here so that the worker-facing
page is a screen and not a migration.

## Filing — how something joins the record

Nothing a worker sends touches the record until the owner has looked at it and
said yes. `acceptTicket` files every deliverable marked `accepted`, refuses
outright while any is still `pending` — a decision not made is not a decision to
file — releases the money, closes the ticket and puts the assignee onto the
record as a person.

`ticketing.filing_plan(deliverable, ticket, record)` decides *which row* an
accepted deliverable becomes and returns it as data; `web360.py` executes it.
Keeping the decision pure means the four arms below have tests without a
database, and a deliverable the plan cannot file comes back `ok: False` with a
reason and is left on the ticket instead of raising.

| kind | becomes | notes |
|---|---|---|
| `paper` | a `documents` insert | shelf from `file_as` or `SHELF_FOR_KIND`. `shelf='map'` is load-bearing beyond display: `_fmb_sheet` selects on it, so filing a survey there is what makes W04's sheet card appear. |
| `photo` | a `parcel_photos` / `property_photos` insert | see below |
| `boundary` | an **update** of `parcels.boundary` / `properties.boundary` | the ring goes through the same parse-and-refuse rules `web360._ring` uses; the outline it replaces is kept in `filed_prev` |
| `feature` | a `land_features` insert | `entity_type` is the record's kind, matching `addFeature` |

**The honesty columns are the reason this section is here.** A filed photo gets
`source='order'` and `order_ref`, which are both true. It also gets
`verified=false`, `captured_by=''`, and `latitude`/`longitude` of `0` — exactly
what `addPhoto` writes for a browser upload. The owner typed the surveyor's
name; the gallery renders `captured_by` as *proof of who stood in the field*,
and a name typed by the person who received the file is not that. Real
provenance waits for the worker portal, where the photograph arrives from the
device that took it.

Traceability runs both ways and needs no third table: forward is
`ticket_deliverables.filed_table` + `filed_id`, backward is `order_ref` on the
filed row. `filed_prev` holds whatever a boundary overwrite replaced, so undo is
a later *screen* and not a later *migration*. There is no undo in this build.

Four kinds ship and three were cut. `field` was cut because it drags in
`_update_record`, `_log_corrections` and a question about who the audit actor is
when a stranger's number is written into a record. `report` was cut because a
report is a PDF, which is a `paper`. `note` was cut because the `notes` table's
shape is not documented well enough to write against blind.

## The screens

**`/app/tickets/:id` — the ticket.** Crumbs, the rail with the finer word beside
it, and actions driven by `data.can` — which the server computes from the same
`TRANSITIONS` dict it enforces, so a screen can never offer a move the server
will refuse. Left column: what came back, and everything that happened. Right
column: what this costs, who is on it, what was sent out, and what was asked
for.

Three parts of it are worth defending:

- **The stalled banner.** When nothing has moved for four days on a live ticket,
  the page says so with the number of days and offers three things: send it
  again, put it on somebody else, or pull the job and get what you set aside
  back. That is the honest thing a tracking screen can say while a surveyor is
  not answering his phone, and it is the reason `status_at` is a column.
- **`Set ₹2,900 aside` is enabled and really writes the hold row.** A disabled
  control here would make the whole prototype untestable, and an honestly
  labelled `recorded` row is more truthful than a button that lies about being
  clickable.
- **Cancel is a dialog; everything else is an inline panel.** The consequence of
  cancelling is unbounded and irreversible; the consequence of sending a message
  is one message.

**`/app/wallet` — the money.** Promoted out of `UNDRAWN`, and its rail item
loses the permanent `dot: true`, because a dot that never clears trains people
to ignore that corner — the same defect the icon guard already forbids. Four
figures, the jobs holding money, every movement with its date, and the stub
notice rendered *from the server* (`ticketing.WALLET_STUB_NOTICE`) rather than
hard-coded in the page, so the day it stops being true there is one string to
change.

**Services (`Orders.tsx`)** gained a per-row `Open ticket` link, the derived
`PT-nnnn` reference in place of the raw id, a `<State>` for the finer word, and
an Open / Everything filter. Its `Track order` in-place expander and its
`#as-<id>` assign picker are untouched byte for byte — two existing tests select
them, and the new spec restates one of those assertions deliberately so that a
later ticket change breaks the ticket spec too.

**Ordering (`OrderService.tsx`)** gained one honest line under the submit
button — *nothing is charged now, and nothing is owed to anybody until you
accept what comes back* — and one line telling the owner that once ordered it
can be sent to a surveyor by WhatsApp, SMS or email.

**`RequestWork.tsx` gained no channel buttons at all,** and that is correct
rather than an omission: its whole point is that it files a job rather than
handing over a link, and there is a test asserting the words WhatsApp and *Send
by email* do not appear on it. It gained one line and one link into the ticket
that was just created.

**The Rail moved into `ui.tsx`.** It lived as inline styles inside `Orders.tsx`,
which meant the ticket page could not have the same one without copying them.
The `aria-label` counts the stage out loud, because four amber dashes say
nothing to a screen reader.

## Deliberately not built

Each of these was designed and then cut, with a reason. They are listed so that
nobody rediscovers them as oversights.

- **A worker portal, a public token page, a REST route or any gateway change.**
  This is the biggest cut. Every clause of the ask is owner-side — the *user*
  creates, tracks, gets the completion, reviews, accepts and files — and an
  unauthenticated write surface is the riskiest thing in the whole design. A
  token-authenticated GraphQL field also works in dev (no auth) and breaks in
  prod (the gateway requires a Bearer), which is the worst possible failure
  shape. The token columns ship so this is later a screen, not a migration.
- **An auto-accept sweeper.** It needs a scheduler in `main.py`. `status_at` is
  written, so "nothing has moved for N days" is computed on read and the owner
  nudges by hand.
- **A `disputed` status,** for the reasons above.
- **A GST split.** The catalogue prices look tax-inclusive (₹1,180 is not an
  accident) and are asserted by existing tests. Splitting them is a pricing
  decision, not a schema one.
- **Real refunds to the outside world.** `wallet → outside` has no writer. A
  cancellation returns money to the wallet, which is closed-loop credit.
- **Wallet top-up and withdrawal.** Top-up needs a gateway. Withdrawal needs
  more than that: a closed-loop credit a user can withdraw is a regulated
  prepaid instrument, and that is legal review rather than a prototype decision.
- **Auto top-up.** The column is read and rendered read-only. Doing it properly
  needs UPI AutoPay with a 24-hour pre-debit notice.
- **Ratings, a marketplace, vendor accounts, `document_versions` writes,
  `boundary_marks` regeneration after a boundary filing, Telugu dispatch copy**
  (`lang` is not even a column, and adding one with no second string in it is
  speculative), **and real-time polling** (a mutation invalidates the whole
  `['w360']` key for free).
- **Undo of a filing.** `filed_prev` is written; nothing reads it yet.

## TO GO LIVE

This is the section to come back to. Each list is in order.

### Real payments

1. **Decide the legal shape first, because it determines the product.** Holding
   an owner's money and paying a third party out of it is not a technical
   feature. In India that is either a payment aggregator licence, or riding on
   somebody else's — Razorpay Route / RazorpayX — with their KYC on every payee.
   Nothing below is worth building until this is settled, and it may change
   whether *held* money is legally ours to hold at all.
2. **Open the Razorpay account, complete KYC, and get Route enabled** for split
   settlement. Collect each worker's payout account: that is a new column set on
   `record_people` or a payee table, and it does not exist yet.
3. **Write the provider arm.** There is no `payments.py`. Model it on
   `notify.py` exactly: one function per movement, a provider chosen by env, a
   live branch guarded by `provider_gate`, and a `stub` branch that keeps doing
   what it does now. `hold` becomes an order + capture, `release` becomes a
   transfer or payout, `return` becomes a refund. `provider_ref` and `error` are
   already columns waiting for the gateway's ids.
4. **Write the top-up flow.** `wallet_accounts.topped_up` is seed-only today.
   A real top-up is a `top_up` ledger row (`outside → wallet`) plus a webhook
   that confirms it. Until then the Wallet's *Add money* stays disabled.
5. **Add the webhook route** for asynchronous settlement, and flip the row's
   `status` from `recorded` to `settled` or `failed` on it. `fold()` already
   excludes `failed` rows from every balance.
6. **Then, and only then, set the env vars:**
   `PAYMENTS_PROVIDER=razorpay`, `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, and
   `PAYMENTS_PAYEE_SHARE` if the split is not 0.90. Setting them earlier makes
   the screens claim a settlement that did not happen.
7. **Reconcile the People rail.** Once money really moves, `Query.web.people`'s
   independently derived `walletBalance` and the Wallet page's *Available* must
   become one derivation. Today they are allowed to differ because neither is a
   claim about a bank.
8. **Then revisit the honesty copy.** `money_honesty`, `WALLET_STUB_NOTICE`, the
   `Not charged` pill and the `ux-guards.ts` section are all keyed on
   `is_live(provider)` and stop rendering on their own — but the *words* for a
   live system ("we don't release it until you accept") should be re-read by a
   human before a single real rupee moves.

### Real WhatsApp, SMS and email

This seam is much closer than the money one: `notify.py`'s live arms are
written and tested. What is missing is entirely account-side.

1. **WhatsApp.** A Meta Business account, a verified business, a WhatsApp
   Business phone number, and — the long pole — **template approval for
   `pattadar_service_v1`** with its six parameters in this order:
   `person_name, service, place, fee, due_date, ref`. Business-initiated
   messages outside a 24-hour window must be an approved template; the free
   text this build renders is what a reply-window message would carry. Then set
   `NOTIFY_WA_PROVIDER=meta`, `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_ID`.
2. **SMS.** MSG91, plus **DLT registration** — India requires the sender id and
   the message template to be registered with a telecom operator before a
   transactional SMS will deliver. The 160-character ASCII discipline in
   `render_dispatch` exists because of this: register the template in the same
   shape the renderer produces. Then set `NOTIFY_SMS_PROVIDER=msg91`,
   `MSG91_AUTHKEY`, `MSG91_SENDER`, `MSG91_DLT_TEMPLATE_ID`.
3. **Email.** A verified sending domain at Resend with SPF, DKIM and DMARC.
   Then `NOTIFY_EMAIL_PROVIDER=resend`, `RESEND_API_KEY`, `NOTIFY_EMAIL_FROM`.
4. **Then decide about replies.** Every dispatch says *reply and it reaches the
   owner through Pattadar*. Under the stub that is a promise about a channel
   nobody is listening on. Going live on any channel means either an inbound
   webhook that files the reply against the ticket, or changing that sentence.
   **This is the one piece of copy that becomes untrue the moment sending
   becomes real, and it must be handled in the same change.**
5. Nothing at any call site changes. `dispatchTicket` already stores whatever
   provider and status `notify.py` returns, `live` is derived from
   `provider != 'stub'`, and the `Recorded, not sent` pill disappears by itself.

### The worker portal, when it is wanted

`mint_token`, `verify_token`, `token_hash`, `token_tail` and `expires_on` are
already written on every dispatch. What is missing is a page and a way in — and
that way in has to survive the gateway, which requires a Bearer token on every
route. Whoever builds it should also make `submitted_via='worker'` real, at
which point a filed photograph can carry the coordinates and the photographer
this build honestly refuses to invent.

## Seed and tests

`scripts/seed-web360.py` now writes six jobs against `w360-p-214-2`, one in
every state worth looking at: waiting on you with four things back
(`PT-2094`), on site (`PT-2081`), placed and unfunded (`PT-2101`), sent over
WhatsApp and unanswered for nine days (`PT-2102`), accepted and filed
(`PT-2103`), and sent back then cancelled with a part settlement (`PT-2104`).
"Today" in the demo is 13/08/2026, which is what makes the stalled banner
appear on `PT-2102` without anybody waiting nine real days.

The seeded ledger balances to `held` ₹8,600, `payout` ₹1,035 and `fee` ₹115,
and the e2e suite asserts those figures on the Wallet page — a demo whose
arithmetic is asserted is the only kind worth demonstrating from.

Four new tables mean four new purge entries.
`scripts/purge-e2e-records.py` sweeps them by app-minted prefix *and* by ticket
id, because a ticket's children key off the ticket and not off the record, so
the existing record-keyed sweep cannot reach them. One stray row survives every
reseed and no count-based failure ever names it — that lesson was paid for once
already, on a `rec-` prefix, and cost seventeen failing tests.

`tests/e2e-web360/specs/tickets.spec.ts` walks the whole life of a ticket
against the real API: send it out and withdraw it, record something, be refused
an acceptance while an item is undecided, accept and find the thing on the
record, send one back and find the evidence still there. Two of its tests exist
purely to pin things this feature could have broken — that `Track order` still
expands in place, and that `RequestWork` still offers no channel buttons.
`scripts/ux-guards.ts` gained the money-copy gate.

```sh
.local/api-venv/bin/python -m pytest services/api/tests/ -q
bun run scripts/ux-guards.ts
cd tests/e2e-web360 && bunx playwright test -g "tickets"
```
